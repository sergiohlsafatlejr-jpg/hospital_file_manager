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
  const { arquivoId, secret, skipContaConvenioSync = false } = req.body;
  
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
      
      // Aplicar padrões de aceite automático de glosa nos itens recém-importados
      try {
        await aplicarAceiteAutomaticoGlosa(
          arquivoId,
          arquivo.convenioId ?? undefined,
          arquivo.estabelecimentoId ?? undefined,
        );
      } catch (aceiteErr: any) {
        console.error('[FileProcessor] Erro ao aplicar aceite automático:', aceiteErr?.message);
        await plog(arquivoId, 'info', `Aviso: Erro ao aplicar aceite automático de glosa: ${aceiteErr?.message}`);
      }
    } else {
      await processEnvio(arquivoId, arquivo, buffer, Boolean(skipContaConvenioSync));
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
  const nomeArquivo = arquivo.nome.toLowerCase();
  const tipoArquivo = nomeArquivo.endsWith('.xml') ? 'xml' : nomeArquivo.endsWith('.csv') ? 'csv' : 'excel';
  // Corrigir timezone: extrair apenas a data (YYYY-MM-DD) para evitar que UTC-3 mude o dia
  const dataReferenciaUpload = arquivo.dataReferencia 
    ? new Date(new Date(arquivo.dataReferencia).toISOString().split('T')[0] + 'T12:00:00Z') 
    : undefined;
  const dataPagamentoUpload = arquivo.dataPagamento 
    ? new Date(new Date(arquivo.dataPagamento).toISOString().split('T')[0] + 'T12:00:00Z') 
    : undefined;
  
  let totalProcessados = 0;
  
  // CSV retornado - detectar formato IPASGO
  if (tipoArquivo === 'csv') {
    await plog(arquivoId, 'info', `Processando CSV retornado: ${arquivo.nome}`);

    // Bradesco exporta um CSV hierárquico iniciado por "Extrato de Pagamento".
    // Esse formato já possui parser próprio, mas anteriormente não estava ligado
    // ao pipeline e era rejeitado como se todo CSV fosse IPASGO.
    const csvUtf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const isBradesco = csvUtf8.slice(0, 500).includes('Extrato de Pagamento');
    if (isBradesco) {
      const { parseBradescoCSV } = await import('./parsers/parseBradescoCSV');
      const result = parseBradescoCSV(
        csvUtf8,
        arquivoId,
        arquivo.convenioId,
        arquivo.estabelecimentoId || undefined,
        dataReferenciaUpload,
        dataPagamentoUpload,
      );

      if (!result.success || result.items.length === 0) {
        await plog(arquivoId, 'error', `Bradesco CSV falhou: ${result.error || 'Nenhum item encontrado'}`);
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }

      await db.deleteRecebimentosExcelByArquivo(arquivoId);
      await db.deleteDemonstrativoByArquivo(arquivoId);
      await db.updateArquivoProgresso(arquivoId, 20, 0, result.items.length);

      const BATCH_SIZE = 1000;
      for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
        const batch = result.items.slice(i, i + BATCH_SIZE);
        const inserted = await db.insertRecebimentosExcelBatch(batch);
        totalProcessados += inserted;
        const progresso = Math.round(20 + (totalProcessados / result.items.length) * 60);
        await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, result.items.length);
      }

      const { syncDemonstrativoByArquivo } = await import('./syncDemonstrativo');
      const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'excel');
      await plog(
        arquivoId,
        'info',
        `Bradesco CSV: ${result.totalItens} itens / ${result.totalGuias} guias / ${result.totalLotes} lotes; demonstrativo ${syncResult.total}`,
      );
      await db.updateArquivoStatus(arquivoId, "processado");
      await db.updateArquivoProgresso(arquivoId, 100, totalProcessados, totalProcessados);
      return;
    }
    
    const { decodeIpasgoBuffer, detectIpasgoFormat, parseIpasgoCSV } = await import('./parsers/parseIpasgoCSV');
    
    // Decodificar buffer (pode ser UTF-16LE ou ISO-8859-1)
    let csvContent = decodeIpasgoBuffer(buffer);
    
    // Se não detectou como UTF-16LE, tentar ISO-8859-1
    if (!detectIpasgoFormat(csvContent)) {
      csvContent = buffer.toString('latin1');
    }
    
    if (detectIpasgoFormat(csvContent)) {
      await plog(arquivoId, 'info', 'Formato IPASGO detectado, processando...');
      
      // Excluir dados antigos
      await db.deleteRecebimentosExcelByArquivo(arquivoId);
      await db.deleteDemonstrativoByArquivo(arquivoId);
      
      const result = parseIpasgoCSV(
        csvContent,
        arquivoId,
        arquivo.convenioId,
        arquivo.estabelecimentoId || undefined,
        dataReferenciaUpload,
        dataPagamentoUpload
      );
      
      if (result.success && result.items.length > 0) {
        await plog(arquivoId, 'info', `IPASGO parsed: ${result.items.length} itens, ${result.totalGuias} guias, ${result.totalLotes} lotes`);
        await db.updateArquivoProgresso(arquivoId, 20, 0, result.items.length);
        
        // Inserir em batches
        const BATCH_SIZE = 1000;
        for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
          const batch = result.items.slice(i, i + BATCH_SIZE);
          const inserted = await db.insertRecebimentosExcelBatch(batch);
          totalProcessados += inserted;
          const progresso = Math.round(20 + (totalProcessados / result.items.length) * 60);
          await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, result.items.length);
        }
        
        // Sincronizar demonstrativo
        if (totalProcessados > 0) {
          await db.updateArquivoProgresso(arquivoId, 90, totalProcessados, totalProcessados);
          try {
            const { syncDemonstrativoByArquivo } = await import('./syncDemonstrativo');
            const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'excel');
            await plog(arquivoId, 'info', `Demonstrativo sincronizado: ${syncResult.total} itens`);
          } catch (syncError: any) {
            await plog(arquivoId, 'error', `Erro ao sincronizar demonstrativo: ${syncError?.message}`);
          }
        }
      } else {
        await plog(arquivoId, 'error', `IPASGO parse falhou: ${result.error || 'Nenhum item encontrado'}`);
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }
    } else {
      // CSV não é IPASGO - tentar parser genérico
      await plog(arquivoId, 'error', `CSV não reconhecido como formato IPASGO: ${arquivo.nome}`);
      await db.updateArquivoStatus(arquivoId, "erro");
      return;
    }
    
    await db.updateArquivoStatus(arquivoId, "processado");
    await db.updateArquivoProgresso(arquivoId, 100, totalProcessados, totalProcessados);
    await plog(arquivoId, 'info', `CSV IPASGO concluído: ${totalProcessados} itens`);
    return;
  }
  
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

async function processEnvio(
  arquivoId: number,
  arquivo: any,
  buffer: Buffer,
  skipContaConvenioSync = false,
) {
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

    // A tela Conta Convênio usa tabelas próprias para permitir auditoria e
    // análise por conta. Mantê-las sincronizadas automaticamente após o XML
    // ser normalizado evita arquivos "processados" com a tela vazia.
    try {
      if (skipContaConvenioSync) {
        await plog(arquivoId, 'info', 'Sincronização imediata de Conta Convênio adiada para reconstrução em lote');
      } else {
      const { syncContaConvenioFromFaturamentoTiss } = await import('./syncContaConvenio');
      const syncResult = await syncContaConvenioFromFaturamentoTiss({
        estabelecimentoId: arquivo.estabelecimentoId,
        arquivoId,
      });
      await plog(
        arquivoId,
        'info',
        `Conta Convênio sincronizada: ${syncResult.totalItens} itens / ${syncResult.totalContas} contas no estabelecimento`,
      );
      }
    } catch (syncError: any) {
      await plog(arquivoId, 'error', `Erro ao sincronizar Conta Convênio: ${syncError?.message || syncError}`);
      throw syncError;
    }

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

/**
 * Aplica padrões de aceite automático de glosa nos itens recém-importados.
 * Verifica a tabela glosas_aceite_automatico e marca os itens correspondentes.
 */
async function aplicarAceiteAutomaticoGlosa(arquivoId: number, convenioId?: number, estabelecimentoId?: number) {
  const { getDb } = await import('./db');
  const { glosasAceiteAutomatico } = await import('../drizzle/schema');
  const { eq, and, or, isNull, sql } = await import('drizzle-orm');
  
  const database = await getDb();
  if (!database) return;
  
  // Buscar padrões ativos que se aplicam a este convênio/estabelecimento
  const conditions: any[] = [eq(glosasAceiteAutomatico.ativo, "sim")];
  
  // Padrões que se aplicam: sem convênio específico OU com o convênio do arquivo
  // E sem estabelecimento específico OU com o estabelecimento do arquivo
  const padroes = await database
    .select()
    .from(glosasAceiteAutomatico)
    .where(eq(glosasAceiteAutomatico.ativo, "sim"));
  
  if (padroes.length === 0) return;
  
  // Filtrar padrões aplicáveis
  const padroesAplicaveis = padroes.filter(p => {
    // Verificar convênio: null = todos, ou deve bater
    if (p.convenioId && convenioId && p.convenioId !== convenioId) return false;
    // Verificar estabelecimento: null = todos, ou deve bater
    if (p.estabelecimentoId && estabelecimentoId && p.estabelecimentoId !== estabelecimentoId) return false;
    return true;
  });
  
  if (padroesAplicaveis.length === 0) return;
  
  let totalAceitos = 0;
  
  for (const padrao of padroesAplicaveis) {
    const codigoEscapado = padrao.codigoGlosa.replace(/'/g, "''");
    
    // Aplicar na tabela demonstrativo (itens do arquivo recém-importado)
    const sqlDemo = `
      UPDATE demonstrativo 
      SET glosa_aceita = 1, 
          glosa_aceita_por = 'Sistema (Aceite Auto: ${codigoEscapado})', 
          glosa_aceita_em = NOW(),
          valor_recurso = 0,
          recurso_status = 'sem_recurso'
      WHERE arquivo_id = ${arquivoId}
        AND codigo_glosa = '${codigoEscapado}'
        AND (glosa_aceita IS NULL OR glosa_aceita = 0)
        AND valor_glosa > 0
    `;
    
    try {
      const [demoResult] = await database.execute(sql.raw(sqlDemo));
      totalAceitos += (demoResult as any)?.affectedRows || 0;
    } catch (e) {
      // tabela pode não ter arquivo_id, tentar sem
    }
    
    // Aplicar na tabela recebimentos_excel (itens do arquivo recém-importado)
    const sqlExcel = `
      UPDATE recebimentos_excel 
      SET glosa_aceita = 1, 
          glosa_aceita_por = 'Sistema (Aceite Auto: ${codigoEscapado})', 
          glosa_aceita_em = NOW(),
          valor_recurso = 0,
          status_recurso_item = 'aceita'
      WHERE arquivoId = ${arquivoId}
        AND codigo_glosa = '${codigoEscapado}'
        AND (glosa_aceita IS NULL OR glosa_aceita = 0)
        AND (valor_glosa > 0 OR erro_tiss IS NOT NULL)
    `;
    
    try {
      const [excelResult] = await database.execute(sql.raw(sqlExcel));
      totalAceitos += (excelResult as any)?.affectedRows || 0;
    } catch (e) {
      // ignore
    }
  }
  
  if (totalAceitos > 0) {
    console.log(`[AceiteAutomatico] ${totalAceitos} itens marcados como aceite automático no arquivo ${arquivoId}`);
    await plog(arquivoId, 'info', `Aceite automático: ${totalAceitos} itens glosados aceitos automaticamente (${padroesAplicaveis.length} padrões aplicados)`);
  }
}

export { router as fileProcessorRouter };
