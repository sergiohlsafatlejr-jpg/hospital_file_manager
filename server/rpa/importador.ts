import fs from "fs";
import * as db from "../db";
import { eq } from "drizzle-orm";
import { parseExcelRecebimentosExcelChunked } from "../recebimentosExcelParser";
import { syncDemonstrativoByArquivo } from "../syncDemonstrativo";
import { executarConciliacao } from "../conciliacaoService";
import { logger } from "../_core/logger";
import { users } from "../../drizzle/schema";

export async function processarArquivoRpa(
   filePath: string,
   fileName: string,
   convenioId: number,
   competenciaStr?: string, // ex: "04/2026"
   estabelecimentoId?: number | null
) {
   logger.info({ message: `[ImportadorRPA] Iniciando importação automática do arquivo ${fileName}` });
   try {
      const buffer = fs.readFileSync(filePath);
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new Error("DB indisponível");
      
      // Converte competencia (MM/YYYY) para data
      let dataReferencia: Date | undefined = undefined;
      if (competenciaStr) {
         const parts = competenciaStr.split('/');
         if (parts.length === 2) {
            dataReferencia = new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1);
         }
      }

      // Verifica se o arquivo já foi importado (evita duplicidade do RPA)
      const { arquivos: arquivosTable } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const existing = await drizzleDb.select().from(arquivosTable)
         .where(and(eq(arquivosTable.nome, fileName), eq(arquivosTable.tipoArquivo, 'excel'))).limit(1);
         
      if (existing.length > 0) {
         logger.info({ message: `[ImportadorRPA] Arquivo ${fileName} já consta no banco de dados. Ignorando importação duplicada.` });
         return { success: true, arquivoId: existing[0].id, registros: existing[0].totalItens, skipped: true };
      }

      // Procura o usuário "admin" ou pega o ID 1
      let userId = 1;
      const adminUsers = await drizzleDb.select().from(users).limit(1);
      if (adminUsers.length > 0) {
          userId = adminUsers[0].id;
      }
      
      const arquivoRecord = await db.createArquivo({
         nome: fileName,
         tipoArquivo: "excel",
         convenioId: convenioId,
         estabelecimentoId: estabelecimentoId || 1, // Se não passar, assume 1 (Matriz Safatle)
         userId: userId,
         direcao: "retornado",
         status: "processando",
         dataReferencia: dataReferencia,
         s3Key: `local/rpa/${fileName}`,
         s3Url: `/uploads/demonstrativos/unimed/${fileName}`,
         totalItens: 0,
         itensProcessados: 0,
         progresso: 0,
      });
      
      const arquivoId = arquivoRecord.id;
      logger.info({ message: `[ImportadorRPA] Arquivo registrado no DB com ID ${arquivoId}` });
      
      let totalInserted = 0;
      const CHUNK_SIZE = 2000;
      
      const result = await parseExcelRecebimentosExcelChunked(
         buffer,
         arquivoId,
         convenioId,
         dataReferencia,
         undefined, // dataPagamentoUpload
         estabelecimentoId || 1, // estabelecimentoId provisório
         CHUNK_SIZE,
         async (records, chunkIdx, totalRows) => {
            const inserted = await db.insertRecebimentosExcelBatch(records);
            totalInserted += inserted;
            const progresso = Math.round(10 + (totalInserted / totalRows) * 75);
            await db.updateArquivoProgresso(arquivoId, Math.min(progresso, 85), totalInserted, totalRows);
            logger.info({ message: `[ImportadorRPA] Chunk ${chunkIdx}: +${inserted} registros inseridos na tabela recebimentos_excel.` });
         }
      );
      
      // ANÁLISE DINÂMICA DE ESTABELECIMENTO E DATA DE REFERÊNCIA
      // Extrair o código do prestador e a data do primeiro registro
      try {
         const { recebimentosExcel, convenioEstabelecimentoPrestador, arquivos } = await import('../../drizzle/schema');
         const firstRecord = await drizzleDb.select().from(recebimentosExcel).where(eq(recebimentosExcel.arquivoId, arquivoId)).limit(1);
         if (firstRecord.length > 0) {
            let updatePayload: any = {};
            
            const codigoPrestador = firstRecord[0].codigoPrestadorPagamento || firstRecord[0].codigoPrestadorOperadora;
            if (codigoPrestador) {
               const vinc = await drizzleDb.select().from(convenioEstabelecimentoPrestador)
                    .where(eq(convenioEstabelecimentoPrestador.codigoPrestador, codigoPrestador)).limit(1);
               if (vinc.length > 0) {
                    const realEstabelecimentoId = vinc[0].estabelecimentoId;
                    logger.info({ message: `[ImportadorRPA] Estabelecimento real detectado pelo código ${codigoPrestador}: ID ${realEstabelecimentoId}` });
                    updatePayload.estabelecimentoId = realEstabelecimentoId;
                    await drizzleDb.update(recebimentosExcel).set({ estabelecimentoId: realEstabelecimentoId }).where(eq(recebimentosExcel.arquivoId, arquivoId));
               }
            }
            
            // Tentar descobrir a dataReferencia se não foi informada
            if (!dataReferencia) {
               const dt = firstRecord[0].dataPagto || firstRecord[0].dataExecucao;
               if (dt) {
                  updatePayload.dataReferencia = new Date(dt.getFullYear(), dt.getMonth(), 1); // Primeiro dia do mês como referência
                  logger.info({ message: `[ImportadorRPA] Data de Referência extraída da planilha: ${updatePayload.dataReferencia.toISOString()}` });
               }
            }
            
            if (Object.keys(updatePayload).length > 0) {
               await drizzleDb.update(arquivos).set(updatePayload).where(eq(arquivos.id, arquivoId));
            }
         }
      } catch (e: any) {
         logger.warn({ message: `[ImportadorRPA] Falha ao analisar estabelecimento dinamicamente: ${e.message}` });
      }
      
      // Sincronizar demonstrativo
      if (result.totalRecords > 0) {
         const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'excel');
         if (syncResult.success) {
            logger.info({ message: `[ImportadorRPA] Demonstrativo sincronizado: ${syncResult.total} itens mapeados para tabelas financeiras.` });
         } else {
            logger.error({ message: `[ImportadorRPA] Erro ao sincronizar demonstrativo: ${syncResult.error}` });
         }
         
         // Conciliar
         await db.updateArquivoProgresso(arquivoId, 90, result.totalRecords, result.totalRows);
         // A conciliação automática exige mesProducao e estabelecimentoId que nem sempre estão disponíveis via RPA.
         // O usuário poderá disparar a conciliação pela interface depois.
         // const concilResult = await executarConciliacao({ arquivoDemoId: arquivoId });
         // logger.info({ message: `[ImportadorRPA] Conciliação inteligente finalizada: ${concilResult?.totalCruzados || 0} cruzamentos realizados.` });
      } else {
         logger.info({ message: `[ImportadorRPA] Nenhum registro extraído de ${fileName}.` });
      }
      
      // Finalizar
      await db.updateArquivoProgresso(arquivoId, 100, result.totalRecords, result.totalRows);
      await db.updateArquivoStatus(arquivoId, "processado");
      
      logger.info({ message: `[ImportadorRPA] Arquivo ${fileName} processado com sucesso 100%!` });
      return { success: true, arquivoId, registros: result.totalRecords };
   } catch (error: any) {
      logger.error({ message: `[ImportadorRPA] Erro ao processar arquivo ${fileName}: ${error.message}` });
      return { success: false, error: error.message };
   }
}
