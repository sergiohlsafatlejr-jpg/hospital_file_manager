import fs from "fs";
import path from "node:path";
import os from "node:os";
import * as db from "../db";
import { storagePut } from "../storage";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { parseExcelRecebimentosExcelChunked } from "../recebimentosExcelParser";
import { syncDemonstrativoByArquivo } from "../syncDemonstrativo";
import { logger } from "../_core/logger";
import { arquivos, convenioEstabelecimentoPrestador, convenios, recebimentosExcel, users } from "../../drizzle/schema";
import type { InsertArquivo } from "../../drizzle/schema";
import {
   validarArquivoSnapshotRpa, validarCodigoPrestadorRpa, validarConvenioRpa,
   validarRegistrosRpa, validarScopeRpa,
} from "./rpaImportadorScope";
import type { RpaArquivoSnapshot, RpaImportadorScope } from "./rpaImportadorScope";

const MENSAGENS_RPA_SEGURAS = new Set<string>([
   "Armazenamento durável do original RPA não confirmado",
   "Arquivo fora do namespace privado da execução RPA",
   "Arquivos RPA duplicados no mesmo escopo; importação ambígua",
   "Convênio incompatível com o hospital autorizado para a importação RPA",
   "DB indisponível",
   "Identificação do prestador fora do hospital/convênio autorizado ou ambígua",
   "Importação RPA exige hospital e convênio explícitos e válidos",
   "Recebimentos persistidos fora do hospital/convênio autorizado",
   "Registro ANS conflitante no escopo da importação RPA",
   "Registro de recebimento não pertence ao arquivo/hospital/convênio autorizado",
   "Snapshot do arquivo divergente durante atualização RPA",
   "Snapshot do arquivo ou hospital proprietário divergente na importação RPA",
]);

export async function processarArquivoRpa(
   filePath: string,
   fileName: string,
   scopeInput: RpaImportadorScope,
   competenciaStr?: string, // ex: "04/2026"
) {
   logger.info({ message: "[ImportadorRPA] Iniciando importação no escopo autorizado." });
   try {
      validarScopeRpa(scopeInput);
      const scope = Object.freeze({ ...scopeInput });
      const { convenioId, estabelecimentoId } = scope;
      const caminhoPrivado = path.resolve(filePath);
      const diretorio = path.dirname(caminhoPrivado);
      const prefixo = `rpa_estab_${estabelecimentoId}_conv_${convenioId}_`;
      const execucaoId = path.basename(diretorio).slice(prefixo.length);
      if (path.dirname(diretorio) !== path.resolve(os.tmpdir()) ||
          !path.basename(diretorio).startsWith(prefixo) ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(execucaoId) ||
          path.basename(fileName) !== fileName || path.basename(caminhoPrivado) !== fileName ||
          fs.realpathSync(diretorio) !== diretorio || fs.realpathSync(caminhoPrivado) !== caminhoPrivado ||
          !fs.lstatSync(caminhoPrivado).isFile()) {
         throw new Error("Arquivo fora do namespace privado da execução RPA");
      }
      const storageKey = `rpa/estab_${estabelecimentoId}/conv_${convenioId}/${execucaoId}/${encodeURIComponent(fileName)}`;
      const buffer = fs.readFileSync(filePath);
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new Error("DB indisponível");

      const validarCadastro = async () => {
         const [convenio] = await drizzleDb.select({
            id: convenios.id, estabelecimentoId: convenios.estabelecimentoId,
            registroAns: convenios.registroAns, ativo: convenios.ativo,
         }).from(convenios).where(and(eq(convenios.id, convenioId),
            or(eq(convenios.estabelecimentoId, estabelecimentoId), isNull(convenios.estabelecimentoId)))).limit(1);
         validarConvenioRpa(scope, convenio);
         // Nunca consultar identificação de prestador globalmente, nem escolher o primeiro vínculo.
         const vinculos = await drizzleDb.select().from(convenioEstabelecimentoPrestador)
            .where(and(eq(convenioEstabelecimentoPrestador.estabelecimentoId, estabelecimentoId),
               eq(convenioEstabelecimentoPrestador.convenioId, convenioId),
               eq(convenioEstabelecimentoPrestador.ativo, "sim")));
         validarCodigoPrestadorRpa(scope, scope.codigoPrestadorOperadora, vinculos);
         return vinculos;
      };
      const vinculosPreflight = await validarCadastro();

      const snapshotCondition = (snapshot: RpaArquivoSnapshot) => and(
         eq(arquivos.id, snapshot.id), eq(arquivos.estabelecimentoId, estabelecimentoId),
         eq(arquivos.convenioId, convenioId), eq(arquivos.nome, snapshot.nome),
         eq(arquivos.tipoArquivo, "excel"), eq(arquivos.direcao, "retornado"),
         eq(arquivos.userId, snapshot.userId), eq(arquivos.s3Key, snapshot.s3Key), eq(arquivos.s3Url, snapshot.s3Url),
      );
      const validarArquivo = async (snapshot: RpaArquivoSnapshot) => {
         const [arquivo] = await drizzleDb.select().from(arquivos).where(snapshotCondition(snapshot)).limit(1);
         validarArquivoSnapshotRpa(scope, snapshot, arquivo);
      };
      
      // Converte competencia (MM/YYYY) para data
      let dataReferencia: Date | undefined = undefined;
      if (competenciaStr) {
         const parts = competenciaStr.split('/');
         if (parts.length === 2) {
            dataReferencia = new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1);
         }
      }

      // Verifica se o arquivo já foi importado (evita duplicidade do RPA)
      const existing = await drizzleDb.select().from(arquivos)
         .where(and(eq(arquivos.nome, fileName), eq(arquivos.tipoArquivo, 'excel'),
            eq(arquivos.direcao, 'retornado'), eq(arquivos.estabelecimentoId, estabelecimentoId),
            eq(arquivos.convenioId, convenioId))).limit(2);
      if (existing.length > 1) throw new Error("Arquivos RPA duplicados no mesmo escopo; importação ambígua");
         
      if (existing.length > 0) {
         await validarArquivo(existing[0]);
         logger.info({ message: "[ImportadorRPA] Importação duplicada no mesmo escopo recusada." });
         return { success: true, arquivoId: existing[0].id, registros: existing[0].totalItens, skipped: true };
      }

      // Validar TODOS os chunks sem escrita antes de criar o arquivo. Um conflito tardio
      // na planilha não pode deixar recebimentos ou status parcialmente gravados.
      const CHUNK_SIZE = 2000;
      await parseExcelRecebimentosExcelChunked(buffer, 0, convenioId, dataReferencia, undefined,
         estabelecimentoId, CHUNK_SIZE, async (records) => {
            validarRegistrosRpa(scope, 0, records, vinculosPreflight);
         });
      await validarCadastro();

      // A cópia temporária não é a fonte durável do documento registrado.
      // Não publicar referência fictícia ou um arquivo processado sem o original.
      let storageUrl: string;
      try {
         const stored = await storagePut(storageKey, buffer,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
         if (stored.key !== storageKey || !stored.url) throw new Error("not confirmed");
         storageUrl = stored.url;
      } catch {
         throw new Error("Armazenamento durável do original RPA não confirmado");
      }
      await validarCadastro();

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
         estabelecimentoId: estabelecimentoId,
         userId: userId,
         direcao: "retornado",
         status: "processando",
         dataReferencia: dataReferencia,
         s3Key: storageKey,
         s3Url: storageUrl,
         totalItens: 0,
         itensProcessados: 0,
         progresso: 0,
      });
      
      const arquivoId = arquivoRecord.id;
      logger.info({ message: "[ImportadorRPA] Original durável registrado." });
      const snapshot: RpaArquivoSnapshot = {
         id: arquivoId, nome: fileName, tipoArquivo: "excel", direcao: "retornado", convenioId,
         estabelecimentoId, userId, s3Key: storageKey, s3Url: storageUrl,
      };
      const atualizarArquivo = async (payload: Partial<InsertArquivo>) => {
         await validarArquivo(snapshot);
         const [updated] = await drizzleDb.update(arquivos).set(payload).where(snapshotCondition(snapshot));
         if (updated.affectedRows !== 1) throw new Error("Snapshot do arquivo divergente durante atualização RPA");
      };
      const atualizarProgresso = async (progresso: number, itensProcessados: number, totalItens: number) => {
         await atualizarArquivo({ progresso, itensProcessados, totalItens });
      };
      await validarArquivo(snapshot);
      
      let totalInserted = 0;
      
      const result = await parseExcelRecebimentosExcelChunked(
         buffer,
         arquivoId,
         convenioId,
         dataReferencia,
         undefined, // dataPagamentoUpload
         estabelecimentoId,
         CHUNK_SIZE,
         async (records, chunkIdx, totalRows) => {
            await validarArquivo(snapshot);
            const vinculos = await validarCadastro();
            validarRegistrosRpa(scope, arquivoId, records, vinculos);
            await validarArquivo(snapshot);
            const inserted = await db.insertRecebimentosExcelBatch(records);
            totalInserted += inserted;
            const progresso = Math.round(10 + (totalInserted / totalRows) * 75);
            await atualizarProgresso(Math.min(progresso, 85), totalInserted, totalRows);
            logger.info({ message: `[ImportadorRPA] Chunk ${chunkIdx}: +${inserted} registros inseridos na tabela recebimentos_excel.` });
         }
      );
      
      // Não sincronizar dados contaminados, mesmo se alterados fora deste importador.
      await validarArquivo(snapshot);
      const divergentes = await drizzleDb.select({ id: recebimentosExcel.id }).from(recebimentosExcel)
         .where(and(eq(recebimentosExcel.arquivoId, arquivoId), or(
            ne(recebimentosExcel.estabelecimentoId, estabelecimentoId), isNull(recebimentosExcel.estabelecimentoId),
            ne(recebimentosExcel.convenioId, convenioId), isNull(recebimentosExcel.convenioId),
         ))).limit(1);
      if (divergentes.length > 0) throw new Error("Recebimentos persistidos fora do hospital/convênio autorizado");
      // Preservar somente a extração de data; nunca inferir ou alterar o hospital.
      if (!dataReferencia) {
         await validarArquivo(snapshot);
         const [firstRecord] = await drizzleDb.select({ dataPagto: recebimentosExcel.dataPagto, dataExecucao: recebimentosExcel.dataExecucao })
            .from(recebimentosExcel).where(and(eq(recebimentosExcel.arquivoId, arquivoId),
               eq(recebimentosExcel.estabelecimentoId, estabelecimentoId), eq(recebimentosExcel.convenioId, convenioId))).limit(1);
         const dt = firstRecord?.dataPagto || firstRecord?.dataExecucao;
         if (dt) await atualizarArquivo({ dataReferencia: new Date(dt.getFullYear(), dt.getMonth(), 1) });
      }
      
      // Sincronizar demonstrativo
      if (result.totalRecords > 0) {
         await validarCadastro();
         await validarArquivo(snapshot);
         const syncResult = await syncDemonstrativoByArquivo(arquivoId, 'excel');
         if (syncResult.success) {
            logger.info({ message: `[ImportadorRPA] Demonstrativo sincronizado: ${syncResult.total} itens mapeados para tabelas financeiras.` });
         } else {
            logger.error({ message: "[ImportadorRPA] Sincronização de demonstrativo não confirmada." });
         }
         
         // Conciliar
         await atualizarProgresso(90, result.totalRecords, result.totalRows);
         // A conciliação automática exige mesProducao e estabelecimentoId que nem sempre estão disponíveis via RPA.
         // O usuário poderá disparar a conciliação pela interface depois.
         // const concilResult = await executarConciliacao({ arquivoDemoId: arquivoId });
         // logger.info({ message: `[ImportadorRPA] Conciliação inteligente finalizada: ${concilResult?.totalCruzados || 0} cruzamentos realizados.` });
      } else {
         logger.info({ message: "[ImportadorRPA] Nenhum registro extraído." });
      }
      
      // Finalizar
      await atualizarProgresso(100, result.totalRecords, result.totalRows);
      await atualizarArquivo({ status: "processado" });
      
      logger.info({ message: "[ImportadorRPA] Processamento finalizado no escopo autorizado." });
      return { success: true, arquivoId, registros: result.totalRecords };
   } catch (error: unknown) {
      const message = error instanceof Error && MENSAGENS_RPA_SEGURAS.has(error.message)
         ? error.message : "Falha na importação RPA; resultado não confirmado.";
      logger.error({ message: "[ImportadorRPA] Importação não confirmada; conferir o estado antes de repetir." });
      return { success: false, error: message };
   }
}
