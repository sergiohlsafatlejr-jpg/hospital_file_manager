/**
 * Processador de arquivos assíncrono com auto-continuação.
 * 
 * Estratégia para Cloud Run (180s timeout, 512 MiB RAM):
 * 
 * 1. O endpoint tRPC "reprocessar" dispara POST /api/internal/process-file
 *    sem await e retorna imediato ao frontend.
 * 
 * 2. A rota interna processa o arquivo COMPLETO em uma única request,
 *    usando o parser streaming (xlsx-stream-reader) que consome apenas ~94 MB.
 *    Os INSERTs são feitos inline durante o streaming (sem acumular dados).
 * 
 * 3. Se o processamento falhar por qualquer motivo, o status é marcado como "erro".
 * 
 * Otimização chave: o parser Unimed streaming processa linha por linha,
 * inserindo no banco a cada 500 registros (não acumula 2000).
 * Isso mantém o pico de memória baixo e distribui a carga de I/O.
 */
import { Router } from 'express';
import * as db from './db';
import type { InsertFaturamentoTiss, InsertRecebimentoExcel } from '../drizzle/schema';

const router = Router();

// Segredo interno para evitar chamadas externas
const INTERNAL_SECRET = process.env.JWT_SECRET || 'internal-process-secret';

// Log persistente no banco para diagnóstico em produção
async function plog(arquivoId: number, level: string, message: string) {
  try {
    const pool = await db.getRawPool();
    if (pool) {
      await pool.execute(
        'INSERT INTO process_logs (arquivo_id, level, message) VALUES (?, ?, ?)',
        [arquivoId, level, message.substring(0, 5000)]
      );
    }
  } catch (e) {
    // Silenciar erros de log para não interferir no processamento
  }
  console.log(`[PLog:${level}] [${arquivoId}] ${message}`);
}

router.post('/api/internal/process-file', async (req, res) => {
  const { arquivoId, secret } = req.body;
  
  // Validar segredo interno
  if (secret !== INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (!arquivoId) {
    return res.status(400).json({ error: 'arquivoId is required' });
  }
  
  // PROCESSAMENTO SÍNCRONO: manter a request HTTP ativa durante todo o processamento.
  // No Cloud Run, a instância só permanece viva enquanto há requests HTTP em andamento.
  // Se respondermos imediatamente, o Cloud Run pode reciclar a instância antes do parse terminar.
  // Com o parser streaming (26 MB heap, ~30s), cabe no timeout de 180s.
  try {
    await plog(arquivoId, 'info', 'Iniciando processamento');
    
    const arquivo = await db.getArquivoById(arquivoId);
    if (!arquivo) {
      await plog(arquivoId, 'error', 'Arquivo não encontrado no banco');
      await db.updateArquivoStatus(arquivoId, "erro");
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    await plog(arquivoId, 'info', `Baixando do S3: ${arquivo.nome} (direcao: ${arquivo.direcao})`);
    const response = await fetch(arquivo.s3Url);
    if (!response.ok) {
      await plog(arquivoId, 'error', `Erro HTTP ${response.status} ao baixar do S3`);
      await db.updateArquivoStatus(arquivoId, "erro");
      return res.status(500).json({ error: 'Erro ao baixar arquivo do S3' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    await plog(arquivoId, 'info', `Download OK: ${(buffer.length / 1024 / 1024).toFixed(2)} MB | Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB | RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`);
    
    if (arquivo.direcao === "retornado") {
      await processRetornado(arquivoId, arquivo, buffer);
    } else {
      await processEnvio(arquivoId, arquivo, buffer);
    }
    
    await plog(arquivoId, 'info', 'Processamento concluído com sucesso');
    res.json({ success: true, message: 'Processing completed' });
  } catch (error: any) {
    await plog(arquivoId, 'error', `ERRO GERAL: ${error?.message || error} | Stack: ${error?.stack?.substring(0, 1000)}`);
    try {
      await db.updateArquivoStatus(arquivoId, "erro");
    } catch (e) {
      // ignore
    }
    res.status(500).json({ error: 'Processing failed', message: error?.message });
  }
});

async function processRetornado(arquivoId: number, arquivo: any, buffer: Buffer) {
  const tipoArquivo = arquivo.nome.toLowerCase().endsWith('.xml') ? 'xml' : 'excel';
  const dataReferenciaUpload = arquivo.dataReferencia ? new Date(arquivo.dataReferencia) : undefined;
  const dataPagamentoUpload = arquivo.dataPagamento ? new Date(arquivo.dataPagamento) : undefined;
  
  let totalProcessados = 0;
  
  if (tipoArquivo === 'excel') {
    // Excluir dados antigos
    await db.deleteRecebimentosExcelByArquivo(arquivoId);
    await db.deleteDemonstrativoByArquivo(arquivoId);
    
    await db.updateArquivoProgresso(arquivoId, 12, 0);
    
    const isLargeFile = buffer.length > 2 * 1024 * 1024;
    
    // Para arquivos grandes com nome "demonstrativo", usar parser streaming Unimed
    let usedUnimedParser = false;
    const isLikelyUnimed = arquivo.nome.toLowerCase().includes('demonstrativo');
    
    if (isLargeFile && isLikelyUnimed) {
      try {
        await plog(arquivoId, 'info', `Parser Unimed: arquivo ${(buffer.length / 1024 / 1024).toFixed(1)}MB | Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB | RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`);
        
        const { parseUnimedExcelChunked } = await import('./parsers/unimedExcelParser');
        await plog(arquivoId, 'info', 'Parser importado OK, iniciando parse streaming...');
        
        const CHUNK_SIZE = 500;
        
        const result = await parseUnimedExcelChunked(
          buffer, arquivoId, arquivo.convenioId,
          dataReferenciaUpload, dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined,
          CHUNK_SIZE,
          async (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => {
            try {
              const inserted = await db.insertRecebimentosExcelBatch(records);
              totalProcessados += inserted;
              const progresso = Math.round(12 + (totalProcessados / totalRows) * 73);
              await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, totalRows);
              if (chunkIdx % 10 === 0) {
                await plog(arquivoId, 'info', `Chunk ${chunkIdx}: +${inserted} (total: ${totalProcessados}/${totalRows}) | Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`);
              }
            } catch (insertErr: any) {
              await plog(arquivoId, 'error', `ERRO INSERT chunk ${chunkIdx}: ${insertErr?.message} | records.length: ${records.length} | first record keys: ${records[0] ? Object.keys(records[0]).join(',') : 'N/A'}`);
              throw insertErr; // Re-throw para parar o processamento
            }
          }
        );
        
        if (result.totalRecords >= 0) {
          usedUnimedParser = true;
          await plog(arquivoId, 'info', `Parser concluído: ${result.totalRecords} registros inseridos`);
        }
      } catch (unimedErr: any) {
        await plog(arquivoId, 'error', `ERRO FATAL parser Unimed: ${unimedErr?.message} | Stack: ${unimedErr?.stack?.substring(0, 1500)}`);
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }
    }
    
    if (!usedUnimedParser) {
      const { parseExcelRecebimentosExcel, parseExcelRecebimentosExcelChunked } = await import('./recebimentosExcelParser');
      
      if (isLargeFile) {
        console.log(`[FileProcessor] Arquivo grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB) - usando processamento em chunks`);
        const CHUNK_SIZE = 500;
        
        const result = await parseExcelRecebimentosExcelChunked(
          buffer, arquivoId, arquivo.convenioId,
          dataReferenciaUpload, dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined,
          CHUNK_SIZE,
          async (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => {
            const inserted = await db.insertRecebimentosExcelBatch(records);
            totalProcessados += inserted;
            const progresso = Math.round(12 + (totalProcessados / totalRows) * 73);
            await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, totalRows);
            console.log(`[FileProcessor] Chunk ${chunkIdx}: +${inserted} (total: ${totalProcessados}/${totalRows})`);
          }
        );
        
        console.log(`[FileProcessor] Excel chunked: ${result.totalRecords} registros`);
      } else {
        // ARQUIVO NORMAL (< 2MB)
        const recordsExcel = parseExcelRecebimentosExcel(
          buffer, arquivoId, arquivo.convenioId,
          dataReferenciaUpload, dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined
        );
        
        await db.updateArquivoProgresso(arquivoId, 20, 0, recordsExcel.length);
        console.log(`[FileProcessor] Excel parsed: ${recordsExcel.length} registros`);
        
        if (recordsExcel.length > 0) {
          totalProcessados = await db.insertRecebimentosExcelBatch(recordsExcel, async (inserted: number, total: number) => {
            const progresso = Math.round(20 + (inserted / total) * 60);
            await db.updateArquivoProgresso(arquivoId, progresso, inserted, total);
          });
        }
      }
    }
    
    // Sincronizar demonstrativo
    if (totalProcessados > 0) {
      await db.updateArquivoProgresso(arquivoId, 90, totalProcessados, totalProcessados);
      try {
        const { syncDemonstrativoByArquivo } = await import('./syncDemonstrativo');
        const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'excel');
        console.log('[FileProcessor] Demonstrativo sincronizado:', syncResult.total, 'itens');
      } catch (syncError) {
        console.error('[FileProcessor] Erro ao sincronizar demonstrativo:', syncError);
      }
    }
  } else {
    // XML de retorno
    await db.deleteRecebimentoTissByArquivo(arquivoId);
    await db.deleteDemonstrativoByArquivo(arquivoId);
    
    const { parseXmlRecebimentoTiss } = await import('./recebimentoTissParser');
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    
    const recebimentoResult = await parseXmlRecebimentoTiss(
      buffer, arquivoId, arquivo.estabelecimentoId || 0,
      arquivo.convenioId, dataReferenciaUpload, dataPagamentoUpload
    );
    
    if (recebimentoResult && recebimentoResult.success && recebimentoResult.items.length > 0) {
      await db.updateArquivoProgresso(arquivoId, 20, 0, recebimentoResult.items.length);
      
      totalProcessados = await db.insertRecebimentoTiss(recebimentoResult.items, async (inserted: number, total: number) => {
        const progresso = Math.round(20 + (inserted / total) * 60);
        await db.updateArquivoProgresso(arquivoId, progresso, inserted, total);
      });
      
      // Sincronizar demonstrativo
      try {
        const { syncDemonstrativoByArquivo } = await import('./syncDemonstrativo');
        const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'xml');
        console.log('[FileProcessor] Demonstrativo sincronizado:', syncResult.total, 'itens');
      } catch (syncError) {
        console.error('[FileProcessor] Erro ao sincronizar demonstrativo:', syncError);
      }
    }
  }
  
  await db.updateArquivoStatus(arquivoId, "processado");
  await db.updateArquivoProgresso(arquivoId, 100, totalProcessados, totalProcessados);
  console.log(`[FileProcessor] Concluído: ${totalProcessados} itens extraídos de arquivo retornado.`);
}

async function processEnvio(arquivoId: number, arquivo: any, buffer: Buffer) {
  const { parseFile } = await import('./parsers');
  const { getDb } = await import('./db');
  
  await db.deleteFaturamentoTissByArquivo(arquivoId);
  
  // Limpar contas_convenio_itens do arquivo
  try {
    const { contasConvenioItens: cciR, contasConvenioResumo: ccrR } = await import('../drizzle/schema');
    const { eq, and } = await import('drizzle-orm');
    const dbReproc = await getDb();
    if (dbReproc) {
      const guiasAf = await dbReproc.selectDistinct({ 
        numeroConta: cciR.numeroConta, estabelecimentoId: cciR.estabelecimentoId 
      }).from(cciR).where(eq(cciR.arquivoId, arquivoId));
      await dbReproc.delete(cciR).where(eq(cciR.arquivoId, arquivoId));
      for (const g of guiasAf) {
        const rest = await dbReproc.select().from(cciR).where(
          and(eq(cciR.numeroConta, g.numeroConta), eq(cciR.estabelecimentoId, g.estabelecimentoId))
        );
        if (rest.length === 0) {
          await dbReproc.delete(ccrR).where(
            and(eq(ccrR.numeroConta, g.numeroConta), eq(ccrR.estabelecimentoId, g.estabelecimentoId))
          );
        } else {
          let vt = 0;
          for (const i of rest) vt += parseFloat(String(i.valorTotal || 0));
          await dbReproc.update(ccrR).set({ totalItens: rest.length, valorTotal: String(vt.toFixed(2)) })
            .where(and(eq(ccrR.numeroConta, g.numeroConta), eq(ccrR.estabelecimentoId, g.estabelecimentoId)));
        }
      }
      console.log(`[FileProcessor] contas_convenio limpo para ${guiasAf.length} guias`);
    }
  } catch (e) { console.error('[FileProcessor] Erro contas_convenio:', e); }
  
  console.log('[FileProcessor] Parsing file:', arquivo.nome);
  const parseResult = await parseFile(buffer, arquivo.nome);
  
  if (parseResult.success && parseResult.procedimentos.length > 0) {
    const { mapTipoDespesaParaTipoItem } = await import('./routers');
    
    const faturamentoRecords: InsertFaturamentoTiss[] = parseResult.procedimentos.map((proc: any, idx: number) => ({
      numeroLote: proc.numeroLote || undefined,
      sequencialTransacao: proc.sequencialTransacao || undefined,
      registroAns: proc.registroANS || undefined,
      numeroGuiaPrestador: proc.guiaNumero || undefined,
      numeroGuiaOperadora: proc.numeroGuiaOperadora || undefined,
      senha: proc.senha || undefined,
      carteiraBeneficiario: proc.pacienteCarteirinha || undefined,
      tipoItem: mapTipoDespesaParaTipoItem(proc.tipoDespesa),
      sequencialItem: idx + 1,
      dataExecucao: proc.dataExecucao || undefined,
      codigoTabela: proc.codigoDespesa || undefined,
      codigoItem: proc.codigo,
      descricaoItem: proc.descricao || undefined,
      quantidade: proc.quantidade ? String(proc.quantidade) : '1',
      valorUnitario: proc.valorUnitario ? String(proc.valorUnitario) : undefined,
      valorFaturado: proc.valorTotal ? String(proc.valorTotal) : undefined,
      nomeProf: proc.nomeMedico || undefined,
      conselhoProf: proc.crmMedico || undefined,
      codigoPrestadorExecutante: proc.codigoPrestadorExecutante || undefined,
      estabelecimentoId: arquivo.estabelecimentoId || undefined,
      arquivoId: arquivoId,
      convenioId: arquivo.convenioId,
      dataReferencia: arquivo.dataReferencia || undefined,
      competencia: arquivo.dataReferencia 
        ? `${new Date(arquivo.dataReferencia).getUTCFullYear()}/${String(new Date(arquivo.dataReferencia).getUTCMonth() + 1).padStart(2, '0')}`
        : undefined,
    }));
    
    await db.insertFaturamentoTissBatch(faturamentoRecords);
    await db.updateArquivoStatus(arquivoId, "processado");
    await db.updateArquivoProgresso(arquivoId, 100, faturamentoRecords.length, faturamentoRecords.length);
    console.log(`[FileProcessor] Concluído: ${faturamentoRecords.length} itens extraídos de arquivo envio.`);
  } else if (!parseResult.success) {
    await db.updateArquivoStatus(arquivoId, "erro");
    console.error('[FileProcessor] Erro no parse:', parseResult.error);
  } else {
    await db.updateArquivoStatus(arquivoId, "processado");
    console.log('[FileProcessor] Arquivo processado, mas nenhum item encontrado.');
  }
}

export { router as fileProcessorRouter };
