/**
 * Processador de arquivos assíncrono.
 * 
 * Este módulo expõe uma rota Express interna POST /api/internal/process-file
 * que processa arquivos em background. É chamado pelo endpoint tRPC reprocessar
 * via fetch sem await, garantindo que o frontend recebe resposta imediata.
 * 
 * O Cloud Run mantém a instância viva enquanto há requests HTTP em andamento,
 * então esta rota interna tem seus próprios 180s de timeout.
 */
import { Router } from 'express';
import * as db from './db';
import type { InsertFaturamentoTiss, InsertRecebimentoExcel } from '../drizzle/schema';

const router = Router();

// Segredo interno para evitar chamadas externas
const INTERNAL_SECRET = process.env.JWT_SECRET || 'internal-process-secret';

router.post('/api/internal/process-file', async (req, res) => {
  const { arquivoId, secret } = req.body;
  
  // Validar segredo interno
  if (secret !== INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (!arquivoId) {
    return res.status(400).json({ error: 'arquivoId is required' });
  }
  
  console.log(`[FileProcessor] Iniciando processamento do arquivo ${arquivoId}`);
  
  try {
    const arquivo = await db.getArquivoById(arquivoId);
    if (!arquivo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    // Download file from S3
    const response = await fetch(arquivo.s3Url);
    if (!response.ok) {
      console.error('[FileProcessor] Erro ao baixar arquivo do S3:', arquivo.nome);
      await db.updateArquivoStatus(arquivoId, "erro");
      return res.json({ success: false, error: 'Erro ao baixar arquivo do S3' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    console.log('[FileProcessor] Processando arquivo:', arquivo.nome, 'direcao:', arquivo.direcao);
    
    if (arquivo.direcao === "retornado") {
      await processRetornado(arquivoId, arquivo, buffer);
    } else {
      await processEnvio(arquivoId, arquivo, buffer);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[FileProcessor] Error processing file:", error);
    await db.updateArquivoStatus(arquivoId, "erro");
    res.json({ success: false, error: String(error) });
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
    
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    
    const isLargeFile = buffer.length > 2 * 1024 * 1024;
    
    // Detectar se é formato Unimed (otimizado para arquivos grandes)
    let usedUnimedParser = false;
    if (isLargeFile) {
      try {
        const { detectUnimedFormat, parseUnimedExcelChunked } = await import('./parsers/unimedExcelParser');
        const isUnimed = detectUnimedFormat(buffer);
        
        if (isUnimed) {
          console.log(`[FileProcessor] Formato Unimed detectado (${(buffer.length / 1024 / 1024).toFixed(1)}MB) - usando parser streaming`);
          const CHUNK_SIZE = 2000;
          
          const result = await parseUnimedExcelChunked(
            buffer, arquivoId, arquivo.convenioId,
            dataReferenciaUpload, dataPagamentoUpload,
            arquivo.estabelecimentoId || undefined,
            CHUNK_SIZE,
            async (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => {
              const inserted = await db.insertRecebimentosExcelBatch(records);
              totalProcessados += inserted;
              const progresso = Math.round(10 + (totalProcessados / totalRows) * 75);
              await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, totalRows);
              console.log(`[FileProcessor] Unimed Chunk ${chunkIdx}: +${inserted} registros (total: ${totalProcessados})`);
            }
          );
          
          if (result.totalRecords >= 0) {
            usedUnimedParser = true;
            console.log(`[FileProcessor] Unimed parser: ${result.totalRecords} registros`);
          }
        }
      } catch (unimedErr) {
        console.error('[FileProcessor] Erro no parser Unimed, usando fallback:', unimedErr);
      }
    }
    
    if (!usedUnimedParser) {
      const { parseExcelRecebimentosExcel, parseExcelRecebimentosExcelChunked } = await import('./recebimentosExcelParser');
      
      if (isLargeFile) {
        console.log(`[FileProcessor] Arquivo grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB) - usando processamento em chunks`);
        const CHUNK_SIZE = 2000;
        
        const result = await parseExcelRecebimentosExcelChunked(
          buffer, arquivoId, arquivo.convenioId,
          dataReferenciaUpload, dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined,
          CHUNK_SIZE,
          async (records: InsertRecebimentoExcel[], chunkIdx: number, totalRows: number) => {
            const inserted = await db.insertRecebimentosExcelBatch(records);
            totalProcessados += inserted;
            const progresso = Math.round(10 + (totalProcessados / totalRows) * 75);
            await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalProcessados, totalRows);
            console.log(`[FileProcessor] Chunk ${chunkIdx}: +${inserted} registros (total: ${totalProcessados})`);
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
