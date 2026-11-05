import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb, verificarPermissaoEstabelecimento } from "../db";
import { contasConvenioItens, contasConvenioResumo, integracaoMapeamentos, integracaoConexoes, feedbackDivergencias, padroesCobranca, logAnaliseComparacao, ajustesAuditoria, prontuarioPrescricoes, prontuarioEvolucoes } from "../../drizzle/schema";
import { queryConfiguracoes } from "../../drizzle/schema-integracao";
import { eq, and, sql, desc, like, or, inArray } from "drizzle-orm";
import { WarleineConnector } from "../connectors/WarleineConnector";
import { EasyVisionConnector } from "../connectors/EasyVisionConnector";
import { OracleConnector } from "../connectors/OracleConnector";
import { SqlServerConnector } from "../connectors/SqlServerConnector";
import { MysqlConnector } from "../connectors/MysqlConnector";
import { lerContaFabricaBanco } from "../fabricaBancoOrigem";
import { prepararColecaoBanco } from "../fabricaBancoSnapshot";
import { resolverSnapshotLeituraBanco, negarMutacaoBancoSemEscopo, filtroItemBancoAtivo, filtroResumoBancoAtivo } from "../fabricaBancoLeitura";
import { logger } from "../_core/logger";
import { compararContaComPadroes, resolverConvenioIdParaConta } from "../services/comparadorPadroes";
import { agruparResumosContaXml } from "../contasConvenioResumoUtils";
import { criarServicoContaContextoMedicoParaUsuario } from "../contaContextoMedicoDrizzle";
import { exigirAcessoEstabelecimento, exigirConvenioDoEstabelecimento } from "../recursoGlosaPermissions";
import {
  ESTABELECIMENTO_CENTRAL_SAFATLE,
  exigirHospitalProprietario,
  resolverHospitaisAutorizados,
} from "../hospitalScope";

/**
 * Router para Contas Convênio - Gestão Operacional
 * 
 * Duas fontes de dados:
 * 1. Busca em tempo real no banco do cliente (Warleine) por número de conta
 * 2. Importação de XML (TISS) - reutiliza parser existente
 * 
 * Dados são salvos na tabela contas_convenio_itens para análise e comparação com padrões.
 */
function parseDataCivilConta(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0) {
      return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate(), 12, 0, 0);
    }
    return val;
  }
  const s = String(val).trim();
  if (!s) return null;
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/i);
  if (mIso) {
    return new Date(Number(mIso[1]), Number(mIso[2]) - 1, Number(mIso[3]), 12, 0, 0);
  }
  const mBr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mBr) {
    return new Date(Number(mBr[3]), Number(mBr[2]) - 1, Number(mBr[1]), 12, 0, 0);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDataCivilBR(val: unknown): string {
  const d = parseDataCivilConta(val);
  return d ? d.toLocaleDateString("pt-BR") : "";
}

export const contasConvenioRouter = router({

  // ============================================================
  // BUSCAR CONTA NO BANCO DO CLIENTE (via Integrador de Dados)
  // ============================================================
  buscarConta: protectedProcedure
    .input(z.object({ numeroConta: z.string().trim().min(1).max(64), estabelecimentoId: z.number().int().positive(), forceRemote: z.boolean().optional().default(false) }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      // Busca é preview read-only. Materialização financeira ocorre somente na esteira, sob lock e versão.
      const remote = await lerContaFabricaBanco(db, input.estabelecimentoId, input.numeroConta);
      const collection = await prepararColecaoBanco(db, input.estabelecimentoId, input.numeroConta, remote.dados);
      if (!collection.encontrada) return { sucesso: false, mensagem: "Conta não encontrada na origem hospitalar.", totalItens: 0, conta: null };
      const h = collection.cabecalho;
      const totalItens = collection.itens.length, valorTotal = Number(collection.valorTotal);
      return { sucesso: true, mensagem: "Prévia somente leitura. Sincronize pela esteira para gravar uma versão financeira.", totalItens, valorTotal,
        fonteDados: remote.fonteDados, configSource: remote.configSource, comparativo: null, analise: { totalConformes: 0, totalDivergentes: 0, scoreRisco: 0 },
        convenio: h.convenioNome, paciente: h.nomePaciente, conta: { numeroConta: h.numeroContaHospital, convenio: h.convenioNome, paciente: h.nomePaciente, totalItens, valorTotal } };
    }),
  // LISTAR CONTAS (RESUMO): somente versões bancárias ativas.
  listarContas: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
      hospitalFiltroId: z.number().optional(),
      convenio: z.string().optional(),
      origem: z.enum(["XML", "BANCO_CLIENTE"]).optional(),
      statusAnalise: z.enum(["pendente", "conforme", "divergente", "revisado"]).optional(),
      competenciaAno: z.number().optional(),
      competenciaMes: z.number().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitalSolicitado = input?.hospitalFiltroId ?? input?.estabelecimentoId ?? null;
      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, hospitalSolicitado, "visualizar");
      const convenio = input?.convenio;
      const origem = input?.origem;
      const statusAnalise = input?.statusAnalise;
      const competenciaAno = input?.competenciaAno;
      const competenciaMes = input?.competenciaMes;
      const search = input?.search;
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;

      const conditions: any[] = [filtroResumoBancoAtivo()];

      conditions.push(inArray(contasConvenioResumo.estabelecimentoId, hospitaisAutorizados));
      if (convenio) {
        conditions.push(eq(contasConvenioResumo.convenio, convenio));
      }
      if (origem) {
        conditions.push(eq(contasConvenioResumo.origem, origem));
      }
      if (statusAnalise) {
        conditions.push(eq(contasConvenioResumo.statusAnalise, statusAnalise));
      }
      // Filtro de competência (Ano/Mês)
      if (competenciaAno && competenciaMes) {
        const mesStr = String(competenciaMes).padStart(2, '0');
        const competenciaPattern = `${competenciaAno}/${mesStr}%`;
        conditions.push(like(contasConvenioResumo.competencia, competenciaPattern));
      } else if (competenciaAno) {
        const competenciaPattern = `${competenciaAno}/%`;
        conditions.push(like(contasConvenioResumo.competencia, competenciaPattern));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          or(
            like(contasConvenioResumo.numeroConta, searchPattern),
            like(contasConvenioResumo.pacienteNome, searchPattern),
            like(contasConvenioResumo.convenio, searchPattern),
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (page - 1) * pageSize;

      const contasResumo = await db
        .select()
        .from(contasConvenioResumo)
        .where(whereClause)
        .orderBy(desc(contasConvenioResumo.criadoEm))
        .limit(pageSize)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contasConvenioResumo)
        .where(whereClause);

      const total = countResult[0]?.count || 0;

      // A tabela de resumo pode conter valores acumulados de importações antigas da
      // mesma guia em competências diferentes. Para a listagem e os cartões, os
      // valores financeiros devem sempre ser recalculados a partir dos itens que
      // atendem exatamente aos filtros atuais.
      const buildItemConditions = () => {
        const itemConditions: any[] = [inArray(contasConvenioItens.estabelecimentoId, hospitaisAutorizados), filtroItemBancoAtivo()];
        if (convenio) {
          itemConditions.push(eq(contasConvenioItens.convenio, convenio));
        }
        if (origem) {
          itemConditions.push(eq(contasConvenioItens.origem, origem));
        }
        if (statusAnalise) {
          itemConditions.push(eq(contasConvenioItens.statusAnalise, statusAnalise));
        }
        if (competenciaAno && competenciaMes) {
          itemConditions.push(eq(contasConvenioItens.competencia, `${competenciaAno}/${String(competenciaMes).padStart(2, "0")}`));
        } else if (competenciaAno) {
          itemConditions.push(like(contasConvenioItens.competencia, `${competenciaAno}/%`));
        }
        if (search) {
          const searchPattern = `%${search}%`;
          itemConditions.push(or(
            like(contasConvenioItens.numeroConta, searchPattern),
            like(contasConvenioItens.pacienteNome, searchPattern),
            like(contasConvenioItens.convenio, searchPattern),
          )!);
        }
        return itemConditions;
      };

      const itemConditions = buildItemConditions();
      const itemWhereClause = itemConditions.length > 0 ? and(...itemConditions) : undefined;

      const [resumoItensResult] = await Promise.all([
        db
          .select({
            valorTotal: sql<string>`COALESCE(SUM(CAST(${contasConvenioItens.valorTotal} AS DECIMAL(14,2))), 0)`,
            valorPrestadorProprio: sql<string>`COALESCE(SUM(CASE WHEN
              NOT EXISTS (
                SELECT 1 FROM convenioEstabelecimentoPrestador cep_cfg
                WHERE cep_cfg.estabelecimentoId = ${contasConvenioItens.estabelecimentoId}
                  AND cep_cfg.convenioId = ${contasConvenioItens.convenioId}
                  AND cep_cfg.tipoPrestador = 'proprio'
                  AND cep_cfg.ativo = 'sim'
              )
              OR EXISTS (
                SELECT 1 FROM convenioEstabelecimentoPrestador cep_match
                WHERE cep_match.estabelecimentoId = ${contasConvenioItens.estabelecimentoId}
                  AND cep_match.convenioId = ${contasConvenioItens.convenioId}
                  AND cep_match.tipoPrestador = 'proprio'
                  AND cep_match.ativo = 'sim'
                  AND TRIM(cep_match.codigoPrestador) = TRIM(COALESCE(${contasConvenioItens.codigoPrestadorExecutante}, ''))
              )
              THEN CAST(${contasConvenioItens.valorTotal} AS DECIMAL(14,2)) ELSE 0 END), 0)`,
          })
          .from(contasConvenioItens)
          .where(itemWhereClause),
      ]);

      const contasNumerosNaPagina = [...new Set(contasResumo.map((conta) => conta.numeroConta))];
      const totaisPorContaCompetencia = new Map<string, { totalItens: number; valorTotal: string }>();

      if (contasNumerosNaPagina.length > 0) {
        const agregadosPagina = await db
          .select({
            estabelecimentoId: contasConvenioItens.estabelecimentoId,
            numeroConta: contasConvenioItens.numeroConta,
            competencia: contasConvenioItens.competencia,
            totalItens: sql<number>`COUNT(*)`,
            valorTotal: sql<string>`COALESCE(SUM(CAST(${contasConvenioItens.valorTotal} AS DECIMAL(14,2))), 0)`,
          })
          .from(contasConvenioItens)
          .where(and(...itemConditions, inArray(contasConvenioItens.numeroConta, contasNumerosNaPagina)))
          .groupBy(
            contasConvenioItens.estabelecimentoId,
            contasConvenioItens.numeroConta,
            contasConvenioItens.competencia,
          );

        for (const agregado of agregadosPagina) {
          totaisPorContaCompetencia.set(
            `${agregado.estabelecimentoId}|${agregado.numeroConta}|${agregado.competencia || ""}`,
            { totalItens: Number(agregado.totalItens || 0), valorTotal: String(agregado.valorTotal || "0") },
          );
        }
      }

      const contas = contasResumo.map((conta) => {
        if (conta.origem === "BANCO_CLIENTE") return conta;
        if ((conta as any).arquivoHospitalId && Number(conta.valorTotal || 0) > 0) {
          return conta;
        }
        const agregado = totaisPorContaCompetencia.get(
          `${conta.estabelecimentoId}|${conta.numeroConta}|${conta.competencia || ""}`,
        );
        return agregado
          ? { ...conta, totalItens: agregado.totalItens, valorTotal: agregado.valorTotal }
          : conta;
      });

      // Resumo geral
      // Contar contas únicas por numeroConta (evita duplicação quando há múltiplos resumos para mesma conta)
      const resumoResult = await db
        .select({
          totalContas: sql<number>`COUNT(DISTINCT numeroConta)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
          totalDivergentes: sql<number>`COUNT(DISTINCT CASE WHEN statusAnaliseResumo = 'divergente' THEN numeroConta END)`,
          totalConformes: sql<number>`COUNT(DISTINCT CASE WHEN statusAnaliseResumo = 'conforme' THEN numeroConta END)`,
          totalPendentes: sql<number>`COUNT(DISTINCT CASE WHEN statusAnaliseResumo = 'pendente' THEN numeroConta END)`,
        })
        .from(contasConvenioResumo)
        .where(whereClause);

      const valorTotalItens = Number(resumoItensResult[0]?.valorTotal || 0);
      const valorPrestadorProprio = Number(resumoItensResult[0]?.valorPrestadorProprio || 0);
      const resumoCorrigido = {
        ...(resumoResult[0] || { totalContas: 0, totalDivergentes: 0, totalConformes: 0, totalPendentes: 0 }),
        valorTotal: valorTotalItens.toFixed(2),
        valorPrestadorProprio: valorPrestadorProprio.toFixed(2),
        valorOutrosPrestadores: Math.max(0, valorTotalItens - valorPrestadorProprio).toFixed(2),
      };

      // Identificar contas com múltiplos lotes (Altas Administrativas)
      // Busca quais numeroConta da página atual têm mais de 1 lote distinto nos itens
      let contasComAltaAdm = new Map<string, { totalLotes: number; lotes: Array<{ numeroLote: string; totalItens: number; valorLote: number }> }>(); 
      
      if (contasNumerosNaPagina.length > 0) {
        // Buscar detalhes por lote para contas com múltiplos lotes
        const lotesRows = await db
          .select({
            estabelecimentoId: contasConvenioItens.estabelecimentoId,
            numeroConta: contasConvenioItens.numeroConta,
            numeroLote: contasConvenioItens.numeroLote,
            totalItens: sql<number>`COUNT(*)`,
            valorLote: sql<string>`COALESCE(SUM(CAST(${contasConvenioItens.valorTotal} AS DECIMAL(14,2))), 0)`,
          })
          .from(contasConvenioItens)
          .where(and(
            ...itemConditions,
            eq(contasConvenioItens.origem, "XML"),
            inArray(contasConvenioItens.numeroConta, contasNumerosNaPagina),
            sql`${contasConvenioItens.numeroLote} IS NOT NULL`,
            sql`${contasConvenioItens.numeroLote} <> ''`,
            sql`${contasConvenioItens.numeroLote} <> 'null'`,
          ))
          .groupBy(contasConvenioItens.estabelecimentoId, contasConvenioItens.numeroConta, contasConvenioItens.numeroLote)
          .orderBy(contasConvenioItens.estabelecimentoId, contasConvenioItens.numeroConta, contasConvenioItens.numeroLote);
        if (lotesRows && Array.isArray(lotesRows)) {
          // Agrupar por numeroConta
          const lotesMap = new Map<string, Array<{ numeroLote: string; totalItens: number; valorLote: number }>>();
          for (const row of lotesRows) {
            if (!row.numeroLote) continue;
            const chaveConta = `${row.estabelecimentoId}|${row.numeroConta}`;
            const arr = lotesMap.get(chaveConta) || [];
            arr.push({
              numeroLote: row.numeroLote,
              totalItens: Number(row.totalItens),
              valorLote: parseFloat(row.valorLote || "0"),
            });
            lotesMap.set(chaveConta, arr);
          }
          // Apenas contas com mais de 1 lote são "Alta Administrativa"
          for (const [chaveConta, lotes] of lotesMap) {
            if (lotes.length > 1) {
              contasComAltaAdm.set(chaveConta, { totalLotes: lotes.length, lotes });
            }
          }
        }
      }

      // Expandir contas com múltiplos lotes em linhas separadas
      // Cada lote vira uma linha distinta com seus próprios valores
      // IMPORTANTE: deduplicar por numeroConta antes de expandir, pois pode haver
      // múltiplos registros de resumo para a mesma conta (vindos de arquivos diferentes)
      const contasExpandidas: any[] = [];
      const contasJaExpandidas = new Set<string>();
      
      for (const conta of contas) {
        const chaveConta = `${conta.estabelecimentoId}|${conta.numeroConta}`;
        const altaAdm = contasComAltaAdm.get(chaveConta);
        if (altaAdm && altaAdm.lotes.length > 1) {
          // Deduplicar: se já expandimos esta numeroConta, pular
          if (contasJaExpandidas.has(chaveConta)) {
            continue;
          }
          contasJaExpandidas.add(chaveConta);
          // Expandir: uma linha por lote
          for (const lote of altaAdm.lotes) {
            contasExpandidas.push({
              ...conta,
              // Sobrescrever valores com os do lote específico
              valorTotal: lote.valorLote.toFixed(2),
              totalItens: lote.totalItens,
              // Metadados do lote
              numeroLote: lote.numeroLote,
              isAltaAdministrativa: true,
              totalLotes: altaAdm.totalLotes,
              // ID virtual para evitar conflito de key no frontend
              virtualId: `${conta.id}-lote-${lote.numeroLote}`,
            });
          }
        } else {
          contasExpandidas.push({
            ...conta,
            numeroLote: conta.numeroLote || null,
            isAltaAdministrativa: false,
            totalLotes: 1,
            virtualId: `${conta.id}`,
          });
        }
      }

      // Detectar outliers de valor total por convênio e hospital de origem.
      // A conta já foi limitada a hospitaisAutorizados acima; ainda assim, a
      // estatística recebe o estabelecimento persistido da própria conta, nunca
      // um filtro informado pelo cliente ou uma agregação global.
      const conveniosNaPagina = [...new Map(
        contas
          .filter((conta) => Boolean(conta.convenio))
          .map((conta) => [`${conta.estabelecimentoId}|${conta.convenio}`, conta]),
      ).values()];
      const statsConvenio = new Map<string, { media: number; desvio: number }>();
      
      if (conveniosNaPagina.length > 0) {
        for (const conta of conveniosNaPagina) {
          if (!conta.convenio) continue;
          const cacheKey = `${conta.estabelecimentoId}|${conta.convenio}`;
          const statsResult = await db.execute(
            sql`SELECT 
                  AVG(CAST(valorTotal AS DECIMAL(14,2))) as media,
                  STDDEV(CAST(valorTotal AS DECIMAL(14,2))) as desvio
                FROM contas_convenio_resumo
                WHERE convenio = ${conta.convenio}
                  AND estabelecimentoId = ${conta.estabelecimentoId}
                  AND ${filtroResumoBancoAtivo()}
                  AND valorTotal IS NOT NULL AND CAST(valorTotal AS DECIMAL(14,2)) > 0`
          );
          const row = (statsResult as any)[0]?.[0];
          if (row && row.media) {
            statsConvenio.set(cacheKey, {
              media: parseFloat(row.media),
              desvio: parseFloat(row.desvio || "0"),
            });
          }
        }
      }

      const contasComFlag = contasExpandidas.map(conta => {
        const valorConta = parseFloat(conta.valorTotal || "0");
        const stats = conta.convenio
          ? statsConvenio.get(`${conta.estabelecimentoId}|${conta.convenio}`)
          : undefined;
        let isOutlier = false;
        let outlierTipo: "acima" | "abaixo" | null = null;
        let outlierPercent = 0;
        
        if (stats && stats.desvio > 0 && valorConta > 0) {
          const limSup = stats.media + 2 * stats.desvio;
          const limInf = Math.max(0, stats.media - 2 * stats.desvio);
          if (valorConta > limSup) {
            isOutlier = true;
            outlierTipo = "acima";
            outlierPercent = Math.round(((valorConta - stats.media) / stats.media) * 100);
          } else if (valorConta < limInf && limInf > 0) {
            isOutlier = true;
            outlierTipo = "abaixo";
            outlierPercent = Math.round(((stats.media - valorConta) / stats.media) * 100);
          }
        }
        
        return {
          ...conta,
          isOutlier,
          outlierTipo,
          outlierPercent,
          mediaConvenio: stats?.media || null,
        };
      });

      return {
        contas: contasComFlag,
        total,
        resumo: resumoCorrigido,
      };
    }),

  // ============================================================
  // LISTAR ITENS DE UMA CONTA
  // ============================================================
  listarItens: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      origem: z.enum(["XML", "BANCO_CLIENTE"]).optional(),
      fabricaContaId: z.number().int().positive().optional(),
      resumoId: z.number().int().positive().optional(),
      tipoItem: z.string().optional(),
      numeroLote: z.string().optional(),
      arquivoId: z.number().optional(),
      competencia: z.string().regex(/^\d{4}\/\d{2}$/).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const bank = input.origem === "XML" && !input.fabricaContaId && !input.resumoId ? null : await resolverSnapshotLeituraBanco(db, ctx.user, input);
      if (bank && (input.arquivoId || (input.numeroLote && input.numeroLote !== bank.snapshot.numeroLote))) throw new TRPCError({ code: "CONFLICT", message: "Filtro não corresponde ao snapshot bancário vigente." });


      const conditions: any[] = [
        eq(contasConvenioItens.numeroConta, input.numeroConta),
      ];
      conditions.push(eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId));
      if (bank) conditions.push(...bank.itemConditions);
      else if (input.origem) conditions.push(eq(contasConvenioItens.origem, input.origem));

      if (input.tipoItem) {
        conditions.push(eq(contasConvenioItens.tipoItem, input.tipoItem));
      }
      if (input.numeroLote) {
        conditions.push(eq(contasConvenioItens.numeroLote, input.numeroLote));
      }
      if (input.arquivoId) {
        conditions.push(eq(contasConvenioItens.arquivoId, input.arquivoId));
      }
      if (input.competencia) {
        conditions.push(eq(contasConvenioItens.competencia, input.competencia));
      }

      const allItems = await db
        .select()
        .from(contasConvenioItens)
        .where(and(...conditions))
        .orderBy(contasConvenioItens.tipoItem, contasConvenioItens.descricaoItem);

      // Condições base para resumo (inclui filtro de lote/arquivo se fornecido)
      const resumoConditions: any[] = [
        eq(contasConvenioItens.numeroConta, input.numeroConta),
      ];
      resumoConditions.push(eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId));
      if (bank) resumoConditions.push(...bank.itemConditions);
      else if (input.origem) resumoConditions.push(eq(contasConvenioItens.origem, input.origem));
      if (input.numeroLote) {
        resumoConditions.push(eq(contasConvenioItens.numeroLote, input.numeroLote));
      }
      if (input.arquivoId) {
        resumoConditions.push(eq(contasConvenioItens.arquivoId, input.arquivoId));
      }
      if (input.competencia) {
        resumoConditions.push(eq(contasConvenioItens.competencia, input.competencia));
      }

      // Resumo por tipo
      const resumoPorTipoDb = await db
        .select({
          tipoItem: contasConvenioItens.tipoItem,
          totalItens: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioItens)
        .where(and(...resumoConditions))
        .groupBy(contasConvenioItens.tipoItem);

      // Total geral
      const totalGeralDb = await db
        .select({
          totalItens: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
          totalDivergentes: sql<number>`SUM(CASE WHEN statusAnalise = 'divergente' THEN 1 ELSE 0 END)`,
          totalConformes: sql<number>`SUM(CASE WHEN statusAnalise = 'conforme' THEN 1 ELSE 0 END)`,
          totalPendentes: sql<number>`SUM(CASE WHEN statusAnalise = 'pendente' THEN 1 ELSE 0 END)`,
        })
        .from(contasConvenioItens)
        .where(and(...resumoConditions));

      // Identificar lotes/arquivos XML distintos desta guia (para pacientes com múltiplas contas parciais na mesma guia)
      const mapaLotes = new Map<string, {
        chave: string;
        arquivoId: number | null;
        numeroLote: string | null;
        competencia: string | null;
        totalItens: number;
        valorTotal: number;
      }>();

      for (const item of allItems) {
        if (item.origem !== "XML") continue;
        const arqId = typeof item.arquivoId === "number" ? item.arquivoId : null;
        const lote = item.numeroLote ? String(item.numeroLote).trim() : null;
        const comp = item.competencia ? String(item.competencia).trim() : null;
        const chave = `${arqId ?? 0}|${lote ?? ""}|${comp ?? ""}`;
        const atual = mapaLotes.get(chave) || {
          chave,
          arquivoId: arqId,
          numeroLote: lote,
          competencia: comp,
          totalItens: 0,
          valorTotal: 0,
        };
        atual.totalItens += 1;
        atual.valorTotal += parseFloat(String(item.valorTotal || "0")) || 0;
        mapaLotes.set(chave, atual);
      }

      const lotesDisponiveis = Array.from(mapaLotes.values())
        .sort((a, b) => (b.arquivoId ?? 0) - (a.arquivoId ?? 0))
        .map((l) => ({
          ...l,
          valorTotal: l.valorTotal.toFixed(2),
        }));

      // Se o paciente possui múltiplos lotes/arquivos XML para a mesma guia e nenhum lote/arquivo foi especificado,
      // isolar automaticamente o lote/arquivo XML mais recente para não somar contas parciais diferentes!
      if (!input.numeroLote && !input.arquivoId && lotesDisponiveis.length > 1) {
        const loteAlvo = lotesDisponiveis[0];
        const itemsIsolados = allItems.filter((item) => {
          if (item.origem !== "XML") return false;
          const arqId = typeof item.arquivoId === "number" ? item.arquivoId : null;
          const lote = item.numeroLote ? String(item.numeroLote).trim() : null;
          const comp = item.competencia ? String(item.competencia).trim() : null;
          return arqId === loteAlvo.arquivoId && lote === loteAlvo.numeroLote && comp === loteAlvo.competencia;
        });

        const porTipoMap = new Map<string, { tipoItem: string | null; totalItens: number; valorTotal: number }>();
        let valorGeralIsolado = 0;
        let divIsolado = 0;
        let confIsolado = 0;
        let pendIsolado = 0;

        for (const it of itemsIsolados) {
          const vt = parseFloat(String(it.valorTotal || "0")) || 0;
          valorGeralIsolado += vt;
          if (it.statusAnalise === "divergente") divIsolado += 1;
          else if (it.statusAnalise === "conforme") confIsolado += 1;
          else pendIsolado += 1;

          const tk = it.tipoItem || "OUTROS";
          const entry = porTipoMap.get(tk) || { tipoItem: it.tipoItem, totalItens: 0, valorTotal: 0 };
          entry.totalItens += 1;
          entry.valorTotal += vt;
          porTipoMap.set(tk, entry);
        }

        return {
          items: itemsIsolados,
          resumoPorTipo: Array.from(porTipoMap.values()).map((e) => ({
            tipoItem: e.tipoItem,
            totalItens: e.totalItens,
            valorTotal: e.valorTotal.toFixed(2),
          })),
          resumoGeral: {
            totalItens: itemsIsolados.length,
            valorTotal: valorGeralIsolado.toFixed(2),
            totalDivergentes: divIsolado,
            totalConformes: confIsolado,
            totalPendentes: pendIsolado,
          },
          loteIsoladoAutomaticamente: true,
          loteAtivo: loteAlvo,
          lotesDisponiveis,
        };
      }

      return {
        snapshot: bank?.snapshot ?? null,
        items: allItems,
        resumoPorTipo: resumoPorTipoDb,
        resumoGeral: totalGeralDb[0] || { totalItens: 0, valorTotal: "0", totalDivergentes: 0, totalConformes: 0, totalPendentes: 0 },
        loteIsoladoAutomaticamente: false,
        loteAtivo: lotesDisponiveis[0] || null,
        lotesDisponiveis,
      };
    }),

  // ============================================================
  // EXCLUIR CONTA
  // ============================================================
  excluirConta: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "excluir");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      await negarMutacaoBancoSemEscopo(db, input.numeroConta, input.estabelecimentoId);

      // Excluir itens
      await db.delete(contasConvenioItens).where(
        and(
          eq(contasConvenioItens.numeroConta, input.numeroConta),
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
        )
      );

      // Excluir resumo
      await db.delete(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.numeroConta, input.numeroConta),
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
        )
      );

      return { sucesso: true, mensagem: `Conta ${input.numeroConta} excluída com sucesso.` };
    }),

  // ============================================================
  // IMPORTAR DE XML (reutiliza dados já normalizados em faturamento_tiss)
  // ============================================================
  importarDeXml: protectedProcedure
    .input(z.object({
      arquivoId: z.number(),
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // Buscar itens normalizados de faturamento_tiss para este arquivo
      const itensXml = await db.execute(sql`
        SELECT 
          ft.numero_guia_prestador as numeroGuia,
          ft.numero_guia_operadora as numeroGuiaOperadora,
          ft.numero_lote as numeroLote,
          ft.senha,
          ft.carteira_beneficiario as carteiraBeneficiario,
          ft.tipo_item as tipoItem,
          ft.codigo_item as codigoItem,
          ft.descricao_item as descricaoItem,
          ft.codigo_tabela as codigoTabela,
          ft.quantidade,
          ft.valor_unitario as valorUnitario,
          ft.valor_faturado as valorTotal,
          ft.data_execucao as dataExecucao,
          ft.data_referencia as dataReferencia,
          ft.nome_prof as profissionalExecutante,
          ft.convenioId,
          ft.estabelecimentoId
        FROM faturamento_tiss ft
        WHERE ft.arquivo_id = ${input.arquivoId}
          AND ft.estabelecimentoId = ${input.estabelecimentoId}
        ORDER BY ft.data_execucao, ft.tipo_item, ft.descricao_item
      `);

      const items = (itensXml as any)[0] || [];

      if (items.length === 0) {
        return {
          sucesso: false,
          mensagem: "Nenhum item encontrado para este arquivo.",
          totalItens: 0,
        };
      }

      // Agrupar por guia para determinar numeroConta
      const guias = new Map<string, any[]>();
      for (const item of items) {
        const guia = item.numeroGuia || 'SEM_GUIA';
        if (!guias.has(guia)) guias.set(guia, []);
        guias.get(guia)!.push(item);
      }

      let totalInseridos = 0;

      for (const [guia, guiaItems] of guias) {
        const numeroConta = guia; // Usar número da guia como número da conta
        const primeiroItem = guiaItems[0];

        // Buscar nome do convênio
        let nomeConvenio: string | null = null;
        if (primeiroItem.convenioId) {
          const convResult = await db.execute(sql`
            SELECT nome FROM convenios WHERE id = ${primeiroItem.convenioId} LIMIT 1
          `);
          nomeConvenio = ((convResult as any)[0]?.[0]?.nome) || null;
        }

        // Limpar dados existentes desta conta/arquivo
        await db.delete(contasConvenioItens).where(
          and(
            eq(contasConvenioItens.numeroConta, numeroConta),
            eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioItens.origem, "XML"),
            eq(contasConvenioItens.arquivoId, input.arquivoId),
          )
        );

        // Inserir itens
        let valorTotalConta = 0;
        const values = guiaItems.map((item: any) => {
          const vt = parseFloat(item.valorTotal) || 0;
          valorTotalConta += vt;

          return {
            origem: "XML" as const,
            numeroConta,
            numeroGuia: item.numeroGuia || null,
            numeroGuiaOperadora: item.numeroGuiaOperadora || null,
            numeroLote: item.numeroLote || null,
            senha: item.senha || null,
            convenio: nomeConvenio,
            convenioId: item.convenioId || null,
            estabelecimentoId: input.estabelecimentoId,
            tipoItem: item.tipoItem || null,
            codigoItem: item.codigoItem || null,
            descricaoItem: item.descricaoItem || null,
            codigoTabela: item.codigoTabela || null,
            quantidade: item.quantidade ? String(item.quantidade) : null,
            valorUnitario: item.valorUnitario ? String(item.valorUnitario) : null,
            valorTotal: item.valorTotal ? String(item.valorTotal) : null,
            dataExecucao: parseDataCivilConta(item.dataExecucao),
            dataReferencia: parseDataCivilConta(item.dataReferencia),
            profissionalExecutante: item.profissionalExecutante || null,
            arquivoId: input.arquivoId,
            statusAnalise: "pendente" as const,
          };
        });

        if (values.length > 0) {
          await db.insert(contasConvenioItens).values(values);
          totalInseridos += values.length;
        }

        // Criar/atualizar resumo
        await db.delete(contasConvenioResumo).where(
          and(
            eq(contasConvenioResumo.numeroConta, numeroConta),
            eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
            eq(contasConvenioResumo.origem, "XML"),
          )
        );

        await db.insert(contasConvenioResumo).values({
          numeroConta,
          estabelecimentoId: input.estabelecimentoId,
          origem: "XML",
          convenio: nomeConvenio,
          convenioId: primeiroItem.convenioId || null,
          pacienteNome: null, // XML TISS pode não ter nome do paciente
          carteiraBeneficiario: primeiroItem.carteiraBeneficiario || null,
          totalItens: values.length,
          valorTotal: String(valorTotalConta),
          statusAnalise: "pendente",
          buscadoPor: ctx.user?.id || null,
        });
      }

      return {
        sucesso: true,
        mensagem: `${totalInseridos} itens importados de ${guias.size} guia(s) do XML.`,
        totalItens: totalInseridos,
        totalGuias: guias.size,
      };
    }),

  // ============================================================
  // LISTAR COMPETÊNCIAS (MESES) DISPONÍVEIS
  // ============================================================
  listarCompetencias: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input?.estabelecimentoId ?? null, "visualizar");
      const conditions: any[] = [inArray(contasConvenioResumo.estabelecimentoId, hospitaisAutorizados), filtroResumoBancoAtivo()];

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const result = await db
        .select({
          competencia: contasConvenioResumo.competencia,
          totalContas: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioResumo)
        .where(and(
          whereClause,
          sql`${contasConvenioResumo.competencia} IS NOT NULL AND ${contasConvenioResumo.competencia} != ''`
        ))
        .groupBy(contasConvenioResumo.competencia)
        .orderBy(desc(contasConvenioResumo.competencia));

      // Extrair anos e meses únicos
      const anos = new Set<number>();
      const meses = new Map<string, { ano: number; mes: number; totalContas: number; valorTotal: string }>(); 

      for (const r of result) {
        if (r.competencia) {
          // Formato esperado: YYYY/MM ou MM/YYYY
          const parts = r.competencia.split('/');
          let ano: number, mesNum: number;
          if (parts[0].length === 4) {
            // YYYY/MM
            ano = parseInt(parts[0]);
            mesNum = parseInt(parts[1]);
          } else {
            // MM/YYYY
            mesNum = parseInt(parts[0]);
            ano = parseInt(parts[1]);
          }
          if (!isNaN(ano) && !isNaN(mesNum)) {
            anos.add(ano);
            const key = `${ano}-${String(mesNum).padStart(2, '0')}`;
            meses.set(key, { ano, mes: mesNum, totalContas: r.totalContas, valorTotal: r.valorTotal });
          }
        }
      }

      return {
        anos: Array.from(anos).sort((a, b) => b - a),
        meses: Array.from(meses.entries()).map(([key, v]) => ({
          key,
          ano: v.ano,
          mes: v.mes,
          label: `${String(v.mes).padStart(2, '0')}/${v.ano}`,
          totalContas: v.totalContas,
          valorTotal: v.valorTotal,
        })).sort((a, b) => b.key.localeCompare(a.key)),
      };
    }),

  // ============================================================
  // LISTAR CONVÊNIOS DISPONÍVEIS NAS CONTAS
  // ============================================================
  listarConvenios: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const hospitaisAutorizados = await resolverHospitaisAutorizados(ctx.user, input?.estabelecimentoId ?? null, "visualizar");
      const conditions: any[] = [inArray(contasConvenioResumo.estabelecimentoId, hospitaisAutorizados), filtroResumoBancoAtivo()];

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const result = await db
        .select({
          convenio: contasConvenioResumo.convenio,
          totalContas: sql<number>`COUNT(*)`,
          valorTotal: sql<string>`COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0)`,
        })
        .from(contasConvenioResumo)
        .where(whereClause)
        .groupBy(contasConvenioResumo.convenio)
        .orderBy(sql`COUNT(*) DESC`);

      return result;
    }),

  // ============================================================
  // ATUALIZAR STATUS DE ANÁLISE DE UM ITEM
  // ============================================================
  atualizarStatusItem: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      statusAnalise: z.enum(["pendente", "conforme", "divergente", "revisado"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const [item] = await db
        .select({ estabelecimentoId: contasConvenioItens.estabelecimentoId, origem: contasConvenioItens.origem, numeroLote: contasConvenioItens.numeroLote })
        .from(contasConvenioItens)
        .where(eq(contasConvenioItens.id, input.itemId))
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
      await exigirHospitalProprietario(ctx.user, item.estabelecimentoId, "editar");

      if (item.origem === "BANCO_CLIENTE" && item.numeroLote?.startsWith("BANCO:v1:")) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A revisão do snapshot bancário deve ocorrer na esteira, com versão vigente." });
      await db.update(contasConvenioItens)
        .set({ statusAnalise: input.statusAnalise })
        .where(eq(contasConvenioItens.id, input.itemId));

      return { sucesso: true };
    }),

  // ============================================================
  // COMPARAR CONTA COM PADRÕES DE COBRANÇA
  // ============================================================
  compararComPadroes: protectedProcedure
    .input(z.object({
      numeroConta: z.string().trim().min(1).max(100),
      estabelecimentoId: z.number().int().positive(),
      origem: z.enum(["XML", "BANCO_CLIENTE"]).optional(),
      fabricaContaId: z.number().int().positive().optional(),
      resumoId: z.number().int().positive().optional(),
      contextoMedicoScope: z.object({
        estabelecimentoId: z.number().int().positive().optional(),
        convenioId: z.number().int().positive(),
        numeroConta: z.string().trim().min(1).max(100).optional(),
        arquivoHospitalId: z.number().int().positive(),
        numeroLote: z.string().trim().max(100).optional(),
        competencia: z.string().trim().max(20).optional(),
      }).strict().optional(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const banco = await getDb();
      if (!banco) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB não disponível" });
      await negarMutacaoBancoSemEscopo(banco, input.numeroConta, input.estabelecimentoId);
      const { executarComparacaoESalvar } = await import("../services/comparadorPadroes");
      if (!input.contextoMedicoScope) {
        try {
          const db = await getDb();
          if (db) {
            const resumosXml = await db
              .select({
                arquivoHospitalId: contasConvenioResumo.arquivoHospitalId,
                convenioId: contasConvenioResumo.convenioId,
                numeroLote: contasConvenioResumo.numeroLote,
                competencia: contasConvenioResumo.competencia,
              })
              .from(contasConvenioResumo)
              .where(
                and(
                  eq(contasConvenioResumo.numeroConta, input.numeroConta),
                  eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
                  eq(contasConvenioResumo.origem, "XML"),
                ),
              )
              .orderBy(desc(contasConvenioResumo.id))
              .limit(2);

            if (
              resumosXml.length === 1 &&
              resumosXml[0].arquivoHospitalId &&
              resumosXml[0].convenioId
            ) {
              const autoScope = {
                estabelecimentoId: input.estabelecimentoId,
                convenioId: resumosXml[0].convenioId,
                numeroConta: input.numeroConta,
                arquivoHospitalId: resumosXml[0].arquivoHospitalId,
                numeroLote: resumosXml[0].numeroLote ?? "",
                competencia: resumosXml[0].competencia ?? "",
              };
              await exigirAcessoEstabelecimento(ctx.user.id, autoScope.estabelecimentoId, "visualizar");
              await exigirConvenioDoEstabelecimento(ctx.user.id, autoScope.convenioId, autoScope.estabelecimentoId, "visualizar");
              const contextoMedico = await criarServicoContaContextoMedicoParaUsuario(ctx.user.id).consultar({
                scope: autoScope,
              });
              return executarComparacaoESalvar(input.numeroConta, input.estabelecimentoId, {
                escopoContextoMedico: autoScope,
                contextoMedico,
              });
            }
          }
        } catch (err) {
          if (err instanceof TRPCError && err.code === "FORBIDDEN") throw err;
          logger.warn({
            message: "Não foi possível resolver contexto médico automático em compararComPadroes",
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return executarComparacaoESalvar(input.numeroConta, input.estabelecimentoId);
      }
      const scope = {
        ...input.contextoMedicoScope,
        estabelecimentoId: input.contextoMedicoScope.estabelecimentoId ?? input.estabelecimentoId,
        numeroConta: input.contextoMedicoScope.numeroConta ?? input.numeroConta,
      };
      if (scope.estabelecimentoId !== input.estabelecimentoId || scope.numeroConta !== input.numeroConta) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O escopo médico não corresponde à conta selecionada." });
      }
      await exigirHospitalProprietario(ctx.user, scope.estabelecimentoId, "editar");
      await exigirConvenioDoEstabelecimento(ctx.user.id, scope.convenioId, scope.estabelecimentoId, "visualizar");
      // A consulta não lê XML nem devolve valores: somente fontes já indexadas e composição sanitizada.
      const contextoMedico = await criarServicoContaContextoMedicoParaUsuario(ctx.user.id).consultar({ scope });
      return executarComparacaoESalvar(input.numeroConta, input.estabelecimentoId, { escopoContextoMedico: scope, contextoMedico });
    }),

  // ============================================================
  // BUSCAR DIVERGÊNCIAS DE UMA CONTA (já salvas)
  // ============================================================
  getDivergencias: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      origem: z.enum(["XML", "BANCO_CLIENTE"]).optional(),
      fabricaContaId: z.number().int().positive().optional(),
      resumoId: z.number().int().positive().optional(),
      numeroLote: z.string().optional(),
      arquivoId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });
      const bank = input.origem === "XML" && !input.fabricaContaId && !input.resumoId ? null : await resolverSnapshotLeituraBanco(db, ctx.user, input);
      if (bank && (input.arquivoId || (input.numeroLote && input.numeroLote !== bank.snapshot.numeroLote))) throw new TRPCError({ code: "CONFLICT", message: "Filtro não corresponde ao snapshot bancário vigente." });


      const itemConds: any[] = [
        eq(contasConvenioItens.numeroConta, input.numeroConta),
        eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
        sql`divergencias IS NOT NULL AND JSON_LENGTH(divergencias) > 0`,
      ];
      if (bank) itemConds.push(...bank.itemConditions);
      else if (input.origem) itemConds.push(eq(contasConvenioItens.origem, input.origem));
      if (input.numeroLote) {
        itemConds.push(eq(contasConvenioItens.numeroLote, input.numeroLote));
      }
      if (input.arquivoId) {
        itemConds.push(eq(contasConvenioItens.arquivoId, input.arquivoId));
      }

      const itens = await db
        .select({
          id: contasConvenioItens.id,
          codigoItem: contasConvenioItens.codigoItem,
          descricaoItem: contasConvenioItens.descricaoItem,
          tipoItem: contasConvenioItens.tipoItem,
          valorTotal: contasConvenioItens.valorTotal,
          quantidade: contasConvenioItens.quantidade,
          statusAnalise: contasConvenioItens.statusAnalise,
          divergencias: contasConvenioItens.divergencias,
          arquivoId: contasConvenioItens.arquivoId,
          numeroLote: contasConvenioItens.numeroLote,
        })
        .from(contasConvenioItens)
        .where(and(...itemConds));

      // Buscar score de risco e divergências gerais (ITEM_FALTANTE) do resumo da conta
      const resumoConds: any[] = [
        eq(contasConvenioResumo.numeroConta, input.numeroConta),
        eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
      ];
      if (bank) resumoConds.push(...bank.resumoConditions);
      else if (input.origem) resumoConds.push(eq(contasConvenioResumo.origem, input.origem));
      if (input.numeroLote) {
        resumoConds.push(eq(contasConvenioResumo.numeroLote, input.numeroLote));
      }
      if (input.arquivoId) {
        resumoConds.push(eq(contasConvenioResumo.arquivoHospitalId, input.arquivoId));
      }

      const resumoConta = await db
        .select({ 
          scoreRisco: contasConvenioResumo.scoreRisco, 
          detalhesRisco: contasConvenioResumo.detalhesRisco,
          divergenciasGerais: contasConvenioResumo.divergenciasGerais,
          arquivoHospitalId: contasConvenioResumo.arquivoHospitalId,
          numeroLote: contasConvenioResumo.numeroLote,
        })
        .from(contasConvenioResumo)
        .where(and(...resumoConds))
        .orderBy(desc(contasConvenioResumo.atualizadoEm))
        .limit(1);

      // Se houver múltiplos arquivos/lotes para a mesma guia e não foi especificado filtro explícito,
      // restringir os itens de divergência ao mesmo arquivo/lote do resumo mais recente
      const arqResumo = resumoConta[0]?.arquivoHospitalId;
      const loteResumo = resumoConta[0]?.numeroLote;
      const itensFiltrados = (!input.arquivoId && !input.numeroLote && (arqResumo || loteResumo))
        ? itens.filter((it) => {
            if (arqResumo && it.arquivoId && it.arquivoId !== arqResumo) return false;
            if (loteResumo && it.numeroLote && it.numeroLote !== loteResumo) return false;
            return true;
          })
        : itens;

      // Flatten divergências
      const todasDivergencias: any[] = [];
      for (const item of itensFiltrados) {
        const divs = item.divergencias as any[];
        if (Array.isArray(divs)) {
          for (const div of divs) {
            todasDivergencias.push({
              ...div,
              itemId: item.id,
              codigoItem: item.codigoItem,
              descricaoItem: item.descricaoItem,
              tipoItem: item.tipoItem,
              valorTotal: item.valorTotal,
              quantidade: item.quantidade,
            });
          }
        }
      }

      // Incluir divergências gerais (ITEM_FALTANTE, etc.) que não estão vinculadas a itens
      const divergenciasGerais = resumoConta[0]?.divergenciasGerais as any[] | null;
      if (Array.isArray(divergenciasGerais)) {
        for (const div of divergenciasGerais) {
          todasDivergencias.push({
            ...div,
            itemId: null,
            // codigoItem e descricaoItem já vem do próprio objeto div
          });
        }
      }

      // Recalcular resumo com divergências gerais incluídas
      const resumoFinal = {
        total: todasDivergencias.length,
        porTipo: {} as Record<string, number>,
        porSeveridade: {} as Record<string, number>,
      };
      for (const div of todasDivergencias) {
        resumoFinal.porTipo[div.tipo] = (resumoFinal.porTipo[div.tipo] || 0) + 1;
        resumoFinal.porSeveridade[div.severidade] = (resumoFinal.porSeveridade[div.severidade] || 0) + 1;
      }

      return {
        divergencias: todasDivergencias,
        resumo: resumoFinal,
        scoreRisco: resumoConta[0]?.scoreRisco ?? null,
        detalhesRisco: resumoConta[0]?.detalhesRisco ?? null,
      };
    }),

  // ============================================================
  // FEEDBACK DE DIVERGÊNCIAS (Passo 4 - Feedback Loop)
  // ============================================================
  registrarFeedback: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      padraoId: z.number().optional(),
      codigoItem: z.string().optional(),
      tipoDivergencia: z.string(),
      acao: z.enum(["aceitar", "rejeitar", "ajustar"]),
      observacao: z.string().optional(),
      valorSugerido: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      // A decisão só pode referenciar um padrão do hospital que originou a
      // conta. O padrão central é reutilizável, mas feedbacks de hospitais sem
      // gestão central ficam estritamente informativos e não mudam seu status.
      const [padrao] = input.padraoId ? await db
        .select({
          estabelecimentoId: padroesCobranca.estabelecimentoId,
          status: padroesCobranca.status,
          isGabarito: padroesCobranca.isGabarito,
        })
        .from(padroesCobranca)
        .where(eq(padroesCobranca.id, input.padraoId)) : [undefined];

      let podeAlterarStatusPadrao = false;
      let estabelecimentoPadraoId: number | undefined;
      if (input.padraoId) {
        if (!padrao) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
        }

        if (
          typeof padrao.estabelecimentoId !== "number"
          || !Number.isSafeInteger(padrao.estabelecimentoId)
          || padrao.estabelecimentoId <= 0
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Padrão sem hospital proprietário válido." });
        }
        estabelecimentoPadraoId = padrao.estabelecimentoId;

        const padraoCentral = estabelecimentoPadraoId === ESTABELECIMENTO_CENTRAL_SAFATLE;
        if (!padraoCentral && estabelecimentoPadraoId !== input.estabelecimentoId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O padrão não pertence ao hospital de origem do feedback.",
          });
        }

        podeAlterarStatusPadrao = padraoCentral
          ? await verificarPermissaoEstabelecimento(ctx.user.id, ESTABELECIMENTO_CENTRAL_SAFATLE, "gerenciar")
          : true;
      }

      // 1. Registrar o feedback
      // Mapear "ajustar" para "aceitar" no banco (schema só aceita aceitar/rejeitar/ignorar)
      const decisaoDb = input.acao === "ajustar" ? "aceitar" as const : input.acao === "aceitar" ? "aceitar" as const : "rejeitar" as const;
      await db.insert(feedbackDivergencias).values({
        estabelecimentoId: input.estabelecimentoId,
        numeroConta: input.numeroConta,
        padraoId: input.padraoId || null,
        codigoItem: input.codigoItem || null,
        tipoDivergencia: input.tipoDivergencia,
        decisao: decisaoDb,
        justificativa: input.observacao || null,
        dadosDivergencia: input.valorSugerido ? { valorSugerido: input.valorSugerido, acaoOriginal: input.acao } : { acaoOriginal: input.acao },
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || "Desconhecido",
        createdAt: new Date(),
      });

      // 2. Se a ação é "rejeitar" uma divergência, significa que o padrão está incorreto
      // Incrementar um contador de rejeições no padrão para futuro refinamento
      if (input.padraoId && input.acao === "rejeitar" && padrao && estabelecimentoPadraoId !== undefined && podeAlterarStatusPadrao) {
        // O contador é limitado ao hospital fonte da conta. Para um padrão
        // hospitalar ele coincide com seu proprietário; para um padrão central
        // autorizado, evita que feedbacks de hospitais distintos se agreguem.
        const countResults = await db
          .select({ total: sql<number>`COUNT(*)` })
          .from(feedbackDivergencias)
          .where(and(
            eq(feedbackDivergencias.padraoId, input.padraoId),
            eq(feedbackDivergencias.estabelecimentoId, input.estabelecimentoId),
            eq(feedbackDivergencias.decisao, "rejeitar")
          ));
        const totalRejeicoes = Number(countResults[0]?.total || 0);

        // Se muitas rejeições (>5), sugerir revisão do padrão. A atualização
        // fixa tanto o ID quanto o proprietário lido do banco para não permitir
        // troca de escopo entre a leitura e a escrita.
        if (totalRejeicoes >= 5 && padrao.status === "ativo" && padrao.isGabarito !== 1) {
          await db.update(padroesCobranca)
            .set({ status: "revisao" })
            .where(and(
              eq(padroesCobranca.id, input.padraoId),
              eq(padroesCobranca.estabelecimentoId, estabelecimentoPadraoId),
            ));

          logger.info({
            message: "Padrão movido para revisão por excesso de rejeições",
            padraoId: input.padraoId,
            totalRejeicoes,
          });
        }
      }

      // 3. Se a ação é "aceitar" uma divergência de item faltante,
      // significa que o item realmente deveria estar lá - reforça o padrão
      if (input.padraoId && input.acao === "aceitar" && input.tipoDivergencia === "ITEM_FALTANTE") {
        logger.info({
          message: "Divergência de item faltante aceita - padrão reforçado",
          padraoId: input.padraoId,
          codigoItem: input.codigoItem,
        });
      }

      // 4. Se a ação é "ajustar", registrar o valor sugerido para futuro refinamento
      if (input.acao === "ajustar" && input.valorSugerido) {
        logger.info({
          message: "Valor ajustado pelo auditor",
          padraoId: input.padraoId,
          codigoItem: input.codigoItem,
          valorSugerido: input.valorSugerido,
        });
      }

      return { success: true };
    }),

  // Listar feedbacks de uma conta
  listarFeedbacks: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const feedbacks = await db
        .select()
        .from(feedbackDivergencias)
        .where(and(
          eq(feedbackDivergencias.numeroConta, input.numeroConta),
          eq(feedbackDivergencias.estabelecimentoId, input.estabelecimentoId),
        ))
        .orderBy(desc(feedbackDivergencias.createdAt));

      return feedbacks;
    }),

  // Estatísticas de feedback por padrão
  estatisticasFeedback: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB error" });

      const stats = await db.execute(sql`
        SELECT 
          padrao_id as padraoId,
          tipo_divergencia as tipoDivergencia,
          decisao,
          COUNT(*) as total
        FROM feedback_divergencias
        WHERE estabelecimento_id = ${input.estabelecimentoId}
        GROUP BY padrao_id, tipo_divergencia, decisao
        ORDER BY total DESC
      `);

      return (stats as any)[0] || [];
    }),

  // ============================================================
  // MIGRAR DADOS XML (faturamento_tiss) PARA contas_convenio_itens
  // ============================================================
  migrarDadosXml: protectedProcedure
    .input(z.object({
      estabelecimentoId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

      // Buscar dados de faturamento_tiss para o estabelecimento
      // Usando SQL direto para JOIN com convênios
      const rows = await db.execute(sql`
        SELECT 
          ft.id,
          ft.numero_lote,
          ft.numero_guia_prestador,
          ft.numero_guia_operadora,
          ft.senha,
          ft.carteira_beneficiario,
          ft.tipo_item,
          ft.sequencial_item,
          ft.data_execucao,
          ft.codigo_tabela,
          ft.codigo_item,
          ft.descricao_item,
          ft.quantidade,
          ft.valor_unitario,
          ft.valor_faturado,
          ft.nome_prof,
          ft.valor_total_geral_guia,
          ft.estabelecimentoId,
          ft.arquivo_id,
          ft.convenioId,
          ft.data_referencia,
          ft.data_importacao,
          ft.competencia as competencia_xml,
          c.nome as convenio_nome,
          a.dataReferencia as arquivo_data_referencia
        FROM faturamento_tiss ft
        LEFT JOIN convenios c ON c.id = ft.convenioId
        LEFT JOIN arquivos a ON a.id = ft.arquivo_id
        WHERE ft.estabelecimentoId = ${input.estabelecimentoId}
        ORDER BY ft.numero_guia_prestador, ft.data_execucao
      `);

      const data = (rows as any)[0] || rows;
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum dado XML encontrado para este estabelecimento.",
        });
      }

      logger.info({ message: `Migrando ${data.length} itens XML para contas_convenio_itens`, estabelecimentoId: input.estabelecimentoId });

      // Limpar dados XML anteriores deste estabelecimento na tabela destino
      await db.delete(contasConvenioItens).where(
        and(
          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
          eq(contasConvenioItens.origem, "XML")
        )
      );
      await db.delete(contasConvenioResumo).where(
        and(
          eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
          eq(contasConvenioResumo.origem, "XML")
        )
      );

      // Inserir itens em batches
      let totalInseridos = 0;
      const BATCH_SIZE = 500;

      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const values = batch.map((row: any) => {
          const guia = row.numero_guia_prestador || row.numero_guia_operadora || 'SEM_GUIA';
          const vlUnit = row.valor_unitario ? parseFloat(String(row.valor_unitario)) : 0;
          const vlFat = row.valor_faturado ? parseFloat(String(row.valor_faturado)) : 0;
          const qtd = row.quantidade ? parseFloat(String(row.quantidade)) : 0;
          const vlTotal = vlFat || (vlUnit * qtd);

          return {
            origem: "XML" as const,
            numeroConta: String(guia),
            numeroGuia: row.numero_guia_prestador ? String(row.numero_guia_prestador) : null,
            numeroGuiaOperadora: row.numero_guia_operadora ? String(row.numero_guia_operadora) : null,
            numeroLote: row.numero_lote ? String(row.numero_lote) : null,
            senha: row.senha ? String(row.senha) : null,
            pacienteNome: null, // XML não tem nome do paciente
            carteiraBeneficiario: row.carteira_beneficiario ? String(row.carteira_beneficiario) : null,
            convenio: row.convenio_nome ? String(row.convenio_nome) : null,
            convenioId: row.convenioId || null,
            estabelecimentoId: input.estabelecimentoId,
            tipoItem: row.tipo_item ? String(row.tipo_item) : 'OUTROS',
            codigoItem: row.codigo_item ? String(row.codigo_item) : null,
            codigoItemTuss: null,
            descricaoItem: row.descricao_item ? String(row.descricao_item) : null,
            codigoTabela: row.codigo_tabela ? String(row.codigo_tabela) : null,
            quantidade: qtd ? String(qtd) : null,
            valorUnitario: vlUnit ? String(vlUnit) : null,
            valorTotal: vlTotal ? String(vlTotal) : null,
            dataExecucao: parseDataCivilConta(row.data_execucao),
            dataReferencia: parseDataCivilConta(row.data_referencia),
            competencia: row.competencia_xml ? String(row.competencia_xml) : (row.data_referencia ? `${new Date(row.data_referencia).getFullYear()}/${String(new Date(row.data_referencia).getMonth() + 1).padStart(2, '0')}` : null),
            profissionalExecutante: row.nome_prof ? String(row.nome_prof) : null,
            setor: null,
            arquivoId: row.arquivo_id || null,
            statusAnalise: "pendente" as const,
          };
        });

        await db.insert(contasConvenioItens).values(values);
        totalInseridos += batch.length;
      }

      // Criar resumos por conta + lote + competência. A mesma conta pode aparecer
      // em arquivos mensais diferentes e não pode acumular valores entre períodos.
      const resumoEntries = agruparResumosContaXml(data).map((resumo) => [resumo.numeroConta, resumo] as const);
      let totalResumos = 0;

      for (let i = 0; i < resumoEntries.length; i += BATCH_SIZE) {
        const batch = resumoEntries.slice(i, i + BATCH_SIZE);
        const resumoValues = batch.map(([guia, r]) => ({
          numeroConta: guia,
          numeroLote: r.numeroLote,
          estabelecimentoId: input.estabelecimentoId,
          origem: "XML" as const,
          convenio: r.convenio,
          convenioId: r.convenioId,
          pacienteNome: null,
          carteiraBeneficiario: r.carteira,
          totalItens: r.totalItens,
          valorTotal: String(r.valorTotal.toFixed(2)),
          dataInternacao: r.dataExecucao,
          statusAnalise: "pendente" as const,
          buscadoPor: ctx.user?.id || null,
          competencia: r.competencia,
        }));

        await db.insert(contasConvenioResumo).values(resumoValues);
        totalResumos += batch.length;
      }

      // ============================================================
      // ANÁLISE AUTOMÁTICA OTIMIZADA: Comparar contas com padrões
      // ============================================================
      let totalContasAnalisadas = 0;
      let totalContasDivergentes = 0;

      try {
        // OTIMIZAÇÃO BULK: Marcar TODOS os itens como "conforme" de uma vez (1 query!)
        await db.update(contasConvenioItens)
          .set({ statusAnalise: "conforme", divergencias: null })
          .where(
            and(
              eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId),
              eq(contasConvenioItens.origem, "XML")
            )
          );

        logger.info({ message: `[Migração] Itens marcados como conforme em bulk. Iniciando análise de ${resumoEntries.length} contas em paralelo...` });

        // Processar contas em lotes paralelos de 5 para não sobrecarregar o DB
        const PARALLEL_BATCH = 5;
        for (let i = 0; i < resumoEntries.length; i += PARALLEL_BATCH) {
          const lote = resumoEntries.slice(i, i + PARALLEL_BATCH);

          const promises = lote.map(async ([guia]) => {
            try {
              const resultadoComparacao = await compararContaComPadroes(guia, input.estabelecimentoId);

              // Mapear divergências por codigoItem
              const divergenciasPorItem = new Map<string, any[]>();
              const divergenciasGerais: any[] = [];

              for (const div of resultadoComparacao.divergencias) {
                if (div.tipo === "ITEM_FALTANTE") {
                  divergenciasGerais.push(div);
                } else if (div.codigoItem) {
                  if (!divergenciasPorItem.has(div.codigoItem)) {
                    divergenciasPorItem.set(div.codigoItem, []);
                  }
                  divergenciasPorItem.get(div.codigoItem)!.push(div);
                } else {
                  divergenciasGerais.push(div);
                }
              }

              // Atualizar APENAS os itens divergentes (conforme já está marcado em bulk)
              const updatePromises: Promise<any>[] = [];
              for (const [codigoItem, divs] of divergenciasPorItem.entries()) {
                if (divs && divs.length > 0) {
                  updatePromises.push(
                    db.update(contasConvenioItens)
                      .set({ statusAnalise: "divergente", divergencias: divs })
                      .where(
                        and(
                          eq(contasConvenioItens.numeroConta, guia),
                          eq(contasConvenioItens.codigoItem, codigoItem),
                          eq(contasConvenioItens.estabelecimentoId, input.estabelecimentoId)
                        )
                      )
                  );
                }
              }

              // Atualizar resumo da conta
              const statusGeral = resultadoComparacao.statusGeral === "divergente" ? "divergente" : "conforme";
              updatePromises.push(
                db.update(contasConvenioResumo)
                  .set({
                    statusAnalise: statusGeral,
                    scoreRisco: resultadoComparacao.scoreRisco.score,
                    detalhesRisco: resultadoComparacao.scoreRisco,
                    divergenciasGerais: divergenciasGerais.length > 0 ? divergenciasGerais : null,
                  })
                  .where(
                    and(
                      eq(contasConvenioResumo.numeroConta, guia),
                      eq(contasConvenioResumo.estabelecimentoId, input.estabelecimentoId),
                    )
                  )
              );

              await Promise.all(updatePromises);

              return { divergente: statusGeral === "divergente" };
            } catch (e) {
              logger.warn({ message: `Análise falhou para conta ${guia}`, error: String(e) });
              return null;
            }
          });

          const resultados = await Promise.all(promises);
          for (const r of resultados) {
            if (r) {
              totalContasAnalisadas++;
              if (r.divergente) totalContasDivergentes++;
            }
          }
        }
      } catch (e) {
        logger.warn({ message: "Análise automática pós-migração falhou", error: String(e) });
      }

      logger.info({
        message: `Migração concluída: ${totalInseridos} itens, ${totalResumos} contas, ${totalContasAnalisadas} analisadas`,
        estabelecimentoId: input.estabelecimentoId,
      });

      return {
        sucesso: true,
        mensagem: `Migração concluída: ${totalInseridos} itens importados em ${totalResumos} contas. ${totalContasAnalisadas} contas analisadas (${totalContasDivergentes} divergentes).`,
        totalItens: totalInseridos,
        totalContas: totalResumos,
        totalContasAnalisadas,
        totalContasDivergentes,
      };
    }),

  // Log de análise - rastreabilidade de gabaritos/padrões usados
  getLogsAnalise: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "visualizar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database não disponível" });

      const logs = await db
        .select()
        .from(logAnaliseComparacao)
        .where(and(
          eq(logAnaliseComparacao.numeroConta, input.numeroConta),
          eq(logAnaliseComparacao.estabelecimentoId, input.estabelecimentoId),
        ))
        .orderBy(desc(logAnaliseComparacao.criadoEm))
        .limit(50);

      return { logs };
    }),

  // ============================================================
  // BUSCA DE PRONTUÁRIOS (Prescrições e Evoluções)
  // ============================================================
  buscarProntuario: protectedProcedure
    .input(z.object({
      numeroConta: z.string(),
      estabelecimentoId: z.number(),
      forceRemote: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      await exigirHospitalProprietario(ctx.user, input.estabelecimentoId, "editar");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database indisponível" });

      // Verificar se já temos no cache
      if (!input.forceRemote) {
        const prescricoesLocais = await db.select().from(prontuarioPrescricoes)
          .where(and(
            eq(prontuarioPrescricoes.numeroConta, input.numeroConta),
            eq(prontuarioPrescricoes.estabelecimentoId, input.estabelecimentoId)
          ));
        if (prescricoesLocais.length > 0) {
          return { prescricoes: prescricoesLocais, fonte: "CACHE_LOCAL" };
        }
      }

      // 1. Buscar Mapeamento de Prescrições
      const mapeamentos = await db.select().from(integracaoMapeamentos)
        .where(and(
          eq(integracaoMapeamentos.estabelecimentoId, input.estabelecimentoId),
          eq(integracaoMapeamentos.ativo, "sim"),
          or(
            like(integracaoMapeamentos.nome, "%Prescri%"),
            like(integracaoMapeamentos.nome, "%Prontuari%")
          )
        )).limit(1);

      let querySql: string | null = null;
      let conexaoConfig: any = null;
      let tipoBancoOrigem = "postgres";

      if (mapeamentos.length > 0) {
        const mapeamento = mapeamentos[0];
        querySql = mapeamento.queryOrigem;
        const [conexao] = await db.select().from(integracaoConexoes).where(eq(integracaoConexoes.id, mapeamento.conexaoOrigemId));
        if (conexao) {
          tipoBancoOrigem = conexao.tipo;
          conexaoConfig = {
            host: conexao.host, port: conexao.porta, database: conexao.banco,
            user: conexao.usuario, password: Buffer.from(conexao.senhaEncriptada, "base64").toString("utf-8")
          };
        }
      } else {
        // Fallback QueryConfig
        const configs = await db.select().from(queryConfiguracoes).where(and(
          eq(queryConfiguracoes.estabelecimentoId, input.estabelecimentoId),
          eq(queryConfiguracoes.tipoDados, "prontuario_prescricoes"),
          eq(queryConfiguracoes.ativo, true)
        )).limit(1);

        if (configs.length > 0) {
          querySql = configs[0].querySql;
          tipoBancoOrigem = configs[0].sistema === "tasy" ? "oracle" : "postgres";
          conexaoConfig = typeof configs[0].conexaoConfig === "string" ? JSON.parse(configs[0].conexaoConfig) : configs[0].conexaoConfig;
        }
      }

      if (!conexaoConfig || !querySql) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mapeamento clínico não configurado. Adicione um mapeamento de 'Prontuário/Prescrições' no Integrador de Dados." });
      }

      // 2. Conectar Dinamicamente
      let connector: any;
      switch(tipoBancoOrigem.toLowerCase()) {
        case "oracle": case "tasy": connector = new OracleConnector(conexaoConfig); break;
        case "mysql": connector = new MysqlConnector(conexaoConfig); break;
        case "sqlserver": connector = new SqlServerConnector(conexaoConfig); break;
        case "firebird": throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Conector Firebird pendente." });
        case "postgres": default: connector = new EasyVisionConnector(conexaoConfig); break;
      }

      let conectado = false;
      try { conectado = await connector.conectar(); } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na conexão ao banco hospitalar." });
      }

      if (!conectado) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Servidor não acessível." });

      // 3. Executar Busca
      let pRows: any[] = [];
      try {
        pRows = await connector.executarQuery(querySql, [input.numeroConta]);
      } catch (e) {
        await connector.desconectar();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao executar query clínica: " + String(e) });
      }
      await connector.desconectar();

      if (!pRows || pRows.length === 0) {
        return { prescricoes: [], fonte: "BANCO_REMOTO" };
      }

      // 4. Salvar no MySQL local (Cache)
      await db.delete(prontuarioPrescricoes).where(and(
        eq(prontuarioPrescricoes.numeroConta, input.numeroConta),
        eq(prontuarioPrescricoes.estabelecimentoId, input.estabelecimentoId)
      ));

      const batch = pRows.map((r) => ({
        numeroConta: input.numeroConta,
        estabelecimentoId: input.estabelecimentoId,
        codigoItem: r.codigoItem || r.CD_ITEM || r.CODIGO_ITEM || r.CODIGO || null,
        descricaoItem: r.descricaoItem || r.DS_ITEM || r.DESCRICAO_ITEM || r.DESCRICAO || null,
        quantidade: typeof r.quantidade === "number" ? r.quantidade : parseFloat(r.quantidade || r.QT_ITEM || r.QTD || "1") || 1,
        medico: r.medico || r.NM_MEDICO || r.MEDICO || null,
        dataPrescricao: r.dataPrescricao ? new Date(r.dataPrescricao) : new Date(),
        viaAdministracao: r.viaAdministracao || r.VIA || null,
        frequencia: r.frequencia || r.FREQUENCIA || null,
      }));

      await db.insert(prontuarioPrescricoes).values(batch);

      // Return refreshed locals
      const novasPrescricoes = await db.select().from(prontuarioPrescricoes).where(and(
        eq(prontuarioPrescricoes.numeroConta, input.numeroConta),
        eq(prontuarioPrescricoes.estabelecimentoId, input.estabelecimentoId)
      ));

      return { prescricoes: novasPrescricoes, fonte: "BANCO_REMOTO" };
    }),

});
