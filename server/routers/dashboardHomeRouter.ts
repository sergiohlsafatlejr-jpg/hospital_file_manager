import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ESTABELECIMENTO_CENTRAL_SAFATLE } from "../hospitalScope";
import { fabricaSetorEnum } from "../../drizzle/schema";

const SETORES_PARADOS = [
  "recepcao",
  "faturamento",
  "auditoria_interna",
  "auditoria_externa",
  "limpeza_prontuario",
] as const;

const SETORES_CONCLUIDOS = ["enviado_convenio", "recursos", "finalizado"] as const;

type ResumoSetorItem = {
  totalContas: number;
  emFila: number;
  emAndamento: number;
  devolvidasErro: number;
  valorTotal: number;
  mediaHorasNoSetor: number;
  maxHorasNoSetor: number;
};

function criarMapaSetoresVazio(): Record<string, ResumoSetorItem> {
  const mapa: Record<string, ResumoSetorItem> = {};
  for (const s of fabricaSetorEnum) {
    mapa[s] = {
      totalContas: 0,
      emFila: 0,
      emAndamento: 0,
      devolvidasErro: 0,
      valorTotal: 0,
      mediaHorasNoSetor: 0,
      maxHorasNoSetor: 0,
    };
  }
  return mapa;
}

function extrairLinhas(result: unknown): any[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }
  if (Array.isArray((result as any).rows)) return (result as any).rows;
  return [];
}

function normalizarCompetenciaHifen(comp?: string | null): string | null {
  if (!comp || comp === "todas") return null;
  const limpo = comp.trim().replace("/", "-").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(limpo) ? limpo : null;
}

export const dashboardHomeRouter = router({
  // Dados do dashboard para a tela inicial (incluindo Esteira de Faturamento, Contas Paradas nos Setores e Faturamento por Estabelecimento)
  resumoGeral: protectedProcedure
    .input(
      z.object({
        estabelecimentoId: z.number(),
        competencia: z.string().optional(), // formato YYYY-MM ou YYYY/MM
      })
    )
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      const { estabelecimentoId, competencia } = input;
      const compDash = normalizarCompetenciaHifen(competencia);
      const compSlash = compDash ? compDash.replace("-", "/") : null;

      // 0. Resolver estabelecimentos (hospitais) ativos e autorizados para o usuário
      let hospitaisAtivos: Array<{ id: number; nome: string }> = [];
      try {
        const resEstab = await database.execute(
          sql.raw(`
            SELECT id, nome
            FROM estabelecimentos
            WHERE ativo = 'sim'
            ORDER BY nome ASC
          `)
        );
        const todosEstabs = extrairLinhas(resEstab).map((r: any) => ({
          id: Number(r.id),
          nome: String(r.nome || `Estabelecimento #${r.id}`),
        }));

        const hospitaisFisicos = todosEstabs.filter(
          (e) => e.id > 0 && e.id !== ESTABELECIMENTO_CENTRAL_SAFATLE
        );

        if (ctx.user.role === "admin") {
          hospitaisAtivos = hospitaisFisicos.length > 0 ? hospitaisFisicos : todosEstabs;
        } else {
          const resPerm = await database.execute(
            sql.raw(`
              SELECT estabelecimentoId, podeVisualizar, podeGerenciar, grupoServico
              FROM permissoesEstabelecimento
              WHERE userId = ${Number(ctx.user.id)} AND podeVisualizar = 'sim'
            `)
          );
          const perms = extrairLinhas(resPerm);
          const idsPermitidos = new Set(perms.map((p: any) => Number(p.estabelecimentoId)));
          const temCentralSafatle = idsPermitidos.has(ESTABELECIMENTO_CENTRAL_SAFATLE);
          const isGestorCentral = perms.some(
            (p: any) =>
              Number(p.estabelecimentoId) === ESTABELECIMENTO_CENTRAL_SAFATLE &&
              (p.podeGerenciar === "sim" || p.grupoServico === "administrador")
          );

          const filtrados = hospitaisFisicos.filter((h) => idsPermitidos.has(h.id));
          if (isGestorCentral || (temCentralSafatle && filtrados.length === 0)) {
            hospitaisAtivos = hospitaisFisicos;
          } else if (filtrados.length > 0) {
            hospitaisAtivos = filtrados;
          } else {
            hospitaisAtivos = hospitaisFisicos;
          }
        }
      } catch {
        hospitaisAtivos = [];
      }

      if (hospitaisAtivos.length === 0) {
        const fallbackId =
          estabelecimentoId > 0 && estabelecimentoId !== ESTABELECIMENTO_CENTRAL_SAFATLE
            ? estabelecimentoId
            : 1;
        hospitaisAtivos = [{ id: fallbackId, nome: `Estabelecimento #${fallbackId}` }];
      }

      const todosHospitaisIds = hospitaisAtivos.map((h) => h.id);
      const isVisaoConsolidada =
        !estabelecimentoId ||
        estabelecimentoId <= 0 ||
        estabelecimentoId === ESTABELECIMENTO_CENTRAL_SAFATLE;

      const escopoIds = isVisaoConsolidada
        ? todosHospitaisIds
        : todosHospitaisIds.includes(estabelecimentoId)
          ? [estabelecimentoId]
          : [estabelecimentoId];

      const inEscopoIds = escopoIds.map((id) => Number(id)).join(", ");
      const inTodosHospitaisIds = todosHospitaisIds.map((id) => Number(id)).join(", ");

      const filtroCompUnificado = compDash
        ? `AND competencia IN ('${compDash}', '${compSlash}')`
        : "";
      const filtroCompFuAlias = compDash
        ? `AND fu.competencia IN ('${compDash}', '${compSlash}')`
        : "";
      const filtroCompResumo = compDash
        ? `AND competencia IN ('${compDash}', '${compSlash}')`
        : "";
      const filtroCompFabrica = compDash
        ? `AND (DATE_FORMAT(DATE(fc.data_recebimento_safatle), '%Y-%m') = '${compDash}' OR DATE_FORMAT(COALESCE(fc.data_alta, fc.data_entrada), '%Y-%m') = '${compDash}')`
        : "";
      const filtroCompHistorico = compDash
        ? `AND DATE_FORMAT(DATE(created_at), '%Y-%m') = '${compDash}'`
        : "";

      // ============================================================
      // 1. ESTEIRA DE FATURAMENTO: Contas por Estabelecimento e por Setor
      // ============================================================
      let fabricaSetorRows: any[] = [];
      let fabricaHistoricoRows: any[] = [];
      let fabricaErrosTotal = 0;

      try {
        const [resSetores, resHistorico, resErros] = await Promise.all([
          database.execute(
            sql.raw(`
              SELECT 
                fc.hospital_estabelecimento_id as hospitalId,
                fc.setor_atual as setor,
                COUNT(*) as totalContas,
                SUM(CASE WHEN fc.status_setor = 'fila' THEN 1 ELSE 0 END) as emFila,
                SUM(CASE WHEN fc.status_setor = 'em_andamento' THEN 1 ELSE 0 END) as emAndamento,
                SUM(CASE WHEN fc.status_setor = 'devolvido_erro' THEN 1 ELSE 0 END) as devolvidasErro,
                SUM(CASE WHEN fc.valor_faturado_final > 0 OR fc.valor_faturado_inicial > 0 OR fc.arquivo_xml_faturamento_id IS NOT NULL OR fc.setor_atual NOT IN ('recepcao', 'faturamento') THEN 1 ELSE 0 END) as contasFaturadas,
                COALESCE(SUM(CASE WHEN fc.valor_faturado_final > 0 THEN fc.valor_faturado_final ELSE fc.valor_faturado_inicial END), 0) as valorTotal,
                COALESCE(SUM(fc.total_itens_xml), 0) as totalItensXml,
                AVG(TIMESTAMPDIFF(HOUR, fc.entrada_setor_atual_em, NOW())) as mediaHorasNoSetor,
                MAX(TIMESTAMPDIFF(HOUR, fc.entrada_setor_atual_em, NOW())) as maxHorasNoSetor
              FROM fabrica_contas fc
              WHERE fc.hospital_estabelecimento_id IN (${inTodosHospitaisIds})
              ${filtroCompFabrica}
              GROUP BY fc.hospital_estabelecimento_id, fc.setor_atual
            `)
          ),
          database.execute(
            sql.raw(`
              SELECT 
                usuario_id as usuarioId,
                COALESCE(usuario_nome, 'Sistema / Equipe') as usuarioNome,
                SUM(CASE WHEN acao = 'recepcionado' THEN 1 ELSE 0 END) as contasRecepcionadas,
                SUM(CASE WHEN (setor_origem = 'faturamento' AND setor_destino = 'auditoria_interna') OR acao = 'xml_importado' THEN 1 ELSE 0 END) as contasFaturadas,
                COALESCE(SUM(CASE WHEN (setor_origem = 'faturamento' AND setor_destino = 'auditoria_interna') OR acao = 'xml_importado' THEN valor_movimentado ELSE 0 END), 0) as valorFaturado,
                SUM(CASE WHEN setor_origem = 'auditoria_interna' AND setor_destino IN ('auditoria_externa', 'faturamento') THEN 1 ELSE 0 END) as contasAuditadasInterna,
                SUM(CASE WHEN setor_origem = 'auditoria_externa' AND setor_destino = 'limpeza_prontuario' THEN 1 ELSE 0 END) as contasAuditadasExterna,
                SUM(CASE WHEN acao = 'enviado_convenio' THEN 1 ELSE 0 END) as contasLimpasEnviadas,
                COUNT(DISTINCT fabrica_conta_id) as totalContasMovimentadas
              FROM fabrica_historico_fluxo
              WHERE hospital_estabelecimento_id IN (${inTodosHospitaisIds})
              ${filtroCompHistorico}
              GROUP BY usuario_id, usuario_nome
              ORDER BY contasFaturadas DESC, totalContasMovimentadas DESC
              LIMIT 10
            `)
          ),
          database.execute(
            sql.raw(`
              SELECT COUNT(*) as totalErros
              FROM fabrica_erros_conta
              WHERE hospital_estabelecimento_id IN (${inTodosHospitaisIds})
              ${filtroCompHistorico}
            `)
          ),
        ]);

        fabricaSetorRows = extrairLinhas(resSetores);
        fabricaHistoricoRows = extrairLinhas(resHistorico);
        fabricaErrosTotal = Number(extrairLinhas(resErros)[0]?.totalErros || 0);
      } catch {
        // Caso as tabelas da fábrica ainda não existam no banco de teste
        fabricaSetorRows = [];
        fabricaHistoricoRows = [];
      }

      // Montar estruturas por Setor (global) e por Estabelecimento
      const porSetorGlobal = criarMapaSetoresVazio();
      const somaHorasPonderadaGlobal: Record<string, { somaHoras: number; qtd: number }> = {};

      const esteiraPorHospital = new Map<
        number,
        {
          contasNaEsteira: number;
          contasParadasSetores: number;
          valorParadoSetores: number;
          contasConcluidasEsteira: number;
          valorConcluidoEsteira: number;
          contasFaturadasEsteira: number;
          valorTotalEsteira: number;
          totalItensEsteira: number;
          emFila: number;
          emAndamento: number;
          devolvidasErro: number;
          porSetor: Record<string, ResumoSetorItem>;
        }
      >();

      for (const h of hospitaisAtivos) {
        esteiraPorHospital.set(h.id, {
          contasNaEsteira: 0,
          contasParadasSetores: 0,
          valorParadoSetores: 0,
          contasConcluidasEsteira: 0,
          valorConcluidoEsteira: 0,
          contasFaturadasEsteira: 0,
          valorTotalEsteira: 0,
          totalItensEsteira: 0,
          emFila: 0,
          emAndamento: 0,
          devolvidasErro: 0,
          porSetor: criarMapaSetoresVazio(),
        });
      }

      let totalGeralContasEsteira = 0;
      let totalGeralValorEsteira = 0;
      let contasParadasSetoresGlobal = 0;
      let valorParadoSetoresGlobal = 0;
      let contasFaturadasEsteiraGlobal = 0;
      let valorFaturadoEsteiraGlobal = 0;
      let contasEnviadasConvenioGlobal = 0;
      let valorEnviadoConvenioGlobal = 0;
      let totalEmFilaGlobal = 0;
      let totalEmAndamentoGlobal = 0;
      let totalDevolvidasErroGlobal = 0;

      for (const r of fabricaSetorRows) {
        const hId = Number(r.hospitalId);
        const setorRaw = String(r.setor || "recepcao");
        const setorAlvo =
          setorRaw === "recursos" || setorRaw === "finalizado" ? "enviado_convenio" : setorRaw;

        const tc = Number(r.totalContas) || 0;
        const fila = Number(r.emFila) || 0;
        const andam = Number(r.emAndamento) || 0;
        const dev = Number(r.devolvidasErro) || 0;
        const fat = Number(r.contasFaturadas) || 0;
        const vt = Number(r.valorTotal) || 0;
        const itens = Number(r.totalItensXml) || 0;
        const mediaH = Math.round(Number(r.mediaHorasNoSetor) || 0);
        const maxH = Math.round(Number(r.maxHorasNoSetor) || 0);

        const isParado = (SETORES_PARADOS as readonly string[]).includes(setorRaw);
        const isConcluido = (SETORES_CONCLUIDOS as readonly string[]).includes(setorRaw);

        // Acumular no setor global
        if (!porSetorGlobal[setorAlvo]) {
          porSetorGlobal[setorAlvo] = {
            totalContas: 0,
            emFila: 0,
            emAndamento: 0,
            devolvidasErro: 0,
            valorTotal: 0,
            mediaHorasNoSetor: 0,
            maxHorasNoSetor: 0,
          };
        }
        porSetorGlobal[setorAlvo].totalContas += tc;
        porSetorGlobal[setorAlvo].emFila += fila;
        porSetorGlobal[setorAlvo].emAndamento += andam;
        porSetorGlobal[setorAlvo].devolvidasErro += dev;
        porSetorGlobal[setorAlvo].valorTotal += vt;
        porSetorGlobal[setorAlvo].maxHorasNoSetor = Math.max(
          porSetorGlobal[setorAlvo].maxHorasNoSetor,
          maxH
        );

        const pond = somaHorasPonderadaGlobal[setorAlvo] || { somaHoras: 0, qtd: 0 };
        pond.somaHoras += mediaH * tc;
        pond.qtd += tc;
        somaHorasPonderadaGlobal[setorAlvo] = pond;

        // Acumular nos KPIs globais da esteira
        totalGeralContasEsteira += tc;
        totalGeralValorEsteira += vt;
        totalEmFilaGlobal += fila;
        totalEmAndamentoGlobal += andam;
        totalDevolvidasErroGlobal += dev;
        contasFaturadasEsteiraGlobal += fat;
        if (fat > 0 || vt > 0) {
          valorFaturadoEsteiraGlobal += vt;
        }
        if (isParado) {
          contasParadasSetoresGlobal += tc;
          valorParadoSetoresGlobal += vt;
        }
        if (isConcluido) {
          contasEnviadasConvenioGlobal += tc;
          valorEnviadoConvenioGlobal += vt;
        }

        // Acumular no hospital
        if (!esteiraPorHospital.has(hId)) {
          esteiraPorHospital.set(hId, {
            contasNaEsteira: 0,
            contasParadasSetores: 0,
            valorParadoSetores: 0,
            contasConcluidasEsteira: 0,
            valorConcluidoEsteira: 0,
            contasFaturadasEsteira: 0,
            valorTotalEsteira: 0,
            totalItensEsteira: 0,
            emFila: 0,
            emAndamento: 0,
            devolvidasErro: 0,
            porSetor: criarMapaSetoresVazio(),
          });
        }
        const hospEntry = esteiraPorHospital.get(hId)!;
        hospEntry.contasNaEsteira += tc;
        hospEntry.valorTotalEsteira += vt;
        hospEntry.totalItensEsteira += itens;
        hospEntry.contasFaturadasEsteira += fat;
        hospEntry.emFila += fila;
        hospEntry.emAndamento += andam;
        hospEntry.devolvidasErro += dev;
        if (isParado) {
          hospEntry.contasParadasSetores += tc;
          hospEntry.valorParadoSetores += vt;
        }
        if (isConcluido) {
          hospEntry.contasConcluidasEsteira += tc;
          hospEntry.valorConcluidoEsteira += vt;
        }
        if (!hospEntry.porSetor[setorAlvo]) {
          hospEntry.porSetor[setorAlvo] = {
            totalContas: 0,
            emFila: 0,
            emAndamento: 0,
            devolvidasErro: 0,
            valorTotal: 0,
            mediaHorasNoSetor: 0,
            maxHorasNoSetor: 0,
          };
        }
        const sHosp = hospEntry.porSetor[setorAlvo];
        const prevQtd = sHosp.totalContas;
        sHosp.totalContas += tc;
        sHosp.emFila += fila;
        sHosp.emAndamento += andam;
        sHosp.devolvidasErro += dev;
        sHosp.valorTotal += vt;
        sHosp.mediaHorasNoSetor =
          sHosp.totalContas > 0
            ? Math.round((sHosp.mediaHorasNoSetor * prevQtd + mediaH * tc) / sHosp.totalContas)
            : 0;
        sHosp.maxHorasNoSetor = Math.max(sHosp.maxHorasNoSetor, maxH);
      }

      for (const [setorKey, pond] of Object.entries(somaHorasPonderadaGlobal)) {
        if (porSetorGlobal[setorKey] && pond.qtd > 0) {
          porSetorGlobal[setorKey].mediaHorasNoSetor = Math.round(pond.somaHoras / pond.qtd);
        }
      }

      const producaoPorColaborador = fabricaHistoricoRows.map((r: any) => ({
        usuarioId: Number(r.usuarioId) || 0,
        usuarioNome: String(r.usuarioNome || "Equipe"),
        contasRecepcionadas: Number(r.contasRecepcionadas) || 0,
        contasFaturadas: Number(r.contasFaturadas) || 0,
        valorFaturado: Number(r.valorFaturado) || 0,
        contasAuditadasInterna: Number(r.contasAuditadasInterna) || 0,
        contasAuditadasExterna: Number(r.contasAuditadasExterna) || 0,
        contasLimpasEnviadas: Number(r.contasLimpasEnviadas) || 0,
        totalContasMovimentadas: Number(r.totalContasMovimentadas) || 0,
      }));

      const etapasHistorico = producaoPorColaborador.reduce(
        (acc, c) => ({
          recepcionadas: acc.recepcionadas + c.contasRecepcionadas,
          faturadas: acc.faturadas + c.contasFaturadas,
          auditadasInterna: acc.auditadasInterna + c.contasAuditadasInterna,
          auditadasExterna: acc.auditadasExterna + c.contasAuditadasExterna,
          limpasEnviadas: acc.limpasEnviadas + c.contasLimpasEnviadas,
        }),
        {
          recepcionadas: 0,
          faturadas: 0,
          auditadasInterna: 0,
          auditadasExterna: 0,
          limpasEnviadas: 0,
        }
      );

      // ============================================================
      // 2. VALORES E QUANTIDADE FATURADOS POR ESTABELECIMENTO
      //    Cruza faturamento_unificado, contas_convenio_resumo e fabrica_contas
      // ============================================================
      const mapUnificadoPorHosp = new Map<
        number,
        { totalContas: number; totalItens: number; valorFaturado: number }
      >();
      const mapResumoPorHosp = new Map<
        number,
        { totalContas: number; totalItens: number; valorFaturado: number }
      >();

      try {
        const [resUnifHosp, resResumoHosp] = await Promise.all([
          database.execute(
            sql.raw(`
              SELECT 
                estabelecimentoId,
                COUNT(*) as totalItens,
                COUNT(DISTINCT COALESCE(NULLIF(numeroGuia, ''), NULLIF(contaNumero, ''), CAST(id AS CHAR))) as totalContas,
                COALESCE(SUM(valorFaturado), 0) as valorTotalFaturado
              FROM faturamento_unificado
              WHERE estabelecimentoId IN (${inTodosHospitaisIds})
              ${filtroCompUnificado}
              GROUP BY estabelecimentoId
            `)
          ),
          database.execute(
            sql.raw(`
              SELECT 
                estabelecimentoId,
                COALESCE(SUM(totalItens), 0) as totalItens,
                COUNT(DISTINCT numeroConta) as totalContas,
                COALESCE(SUM(valorTotal), 0) as valorTotalFaturado
              FROM contas_convenio_resumo
              WHERE estabelecimentoId IN (${inTodosHospitaisIds})
              ${filtroCompResumo}
              GROUP BY estabelecimentoId
            `)
          ),
        ]);

        for (const r of extrairLinhas(resUnifHosp)) {
          mapUnificadoPorHosp.set(Number(r.estabelecimentoId), {
            totalContas: Number(r.totalContas) || 0,
            totalItens: Number(r.totalItens) || 0,
            valorFaturado: Number(r.valorTotalFaturado) || 0,
          });
        }
        for (const r of extrairLinhas(resResumoHosp)) {
          mapResumoPorHosp.set(Number(r.estabelecimentoId), {
            totalContas: Number(r.totalContas) || 0,
            totalItens: Number(r.totalItens) || 0,
            valorFaturado: Number(r.valorTotalFaturado) || 0,
          });
        }
      } catch {
        // Ignora caso alguma tabela auxiliar não esteja populada
      }

      const faturamentoPorEstabelecimento = hospitaisAtivos
        .map((h) => {
          const estFab = esteiraPorHospital.get(h.id) || {
            contasNaEsteira: 0,
            contasParadasSetores: 0,
            valorParadoSetores: 0,
            contasConcluidasEsteira: 0,
            valorConcluidoEsteira: 0,
            contasFaturadasEsteira: 0,
            valorTotalEsteira: 0,
            totalItensEsteira: 0,
            emFila: 0,
            emAndamento: 0,
            devolvidasErro: 0,
            porSetor: criarMapaSetoresVazio(),
          };
          const unif = mapUnificadoPorHosp.get(h.id) || {
            totalContas: 0,
            totalItens: 0,
            valorFaturado: 0,
          };
          const resumo = mapResumoPorHosp.get(h.id) || {
            totalContas: 0,
            totalItens: 0,
            valorFaturado: 0,
          };

          const quantidadeFaturada = Math.max(
            unif.totalContas,
            resumo.totalContas,
            estFab.contasFaturadasEsteira
          );
          const valorFaturado = Math.max(
            unif.valorFaturado,
            resumo.valorFaturado,
            estFab.valorTotalEsteira
          );
          const totalItens = Math.max(
            unif.totalItens,
            resumo.totalItens,
            estFab.totalItensEsteira
          );

          return {
            estabelecimentoId: h.id,
            estabelecimentoNome: h.nome,
            quantidadeFaturada,
            valorFaturado,
            totalItens,
            contasNaEsteira: estFab.contasNaEsteira,
            contasParadasSetores: estFab.contasParadasSetores,
            valorParadoSetores: estFab.valorParadoSetores,
            contasConcluidasEsteira: estFab.contasConcluidasEsteira,
            contasFaturadasEsteira: estFab.contasFaturadasEsteira,
            valorTotalEsteira: estFab.valorTotalEsteira,
            emFila: estFab.emFila,
            emAndamento: estFab.emAndamento,
            devolvidasErro: estFab.devolvidasErro,
            porSetor: estFab.porSetor,
          };
        })
        .sort((a, b) => {
          if (b.valorFaturado !== a.valorFaturado) return b.valorFaturado - a.valorFaturado;
          if (b.contasNaEsteira !== a.contasNaEsteira) return b.contasNaEsteira - a.contasNaEsteira;
          return a.estabelecimentoNome.localeCompare(b.estabelecimentoNome);
        });

      // ============================================================
      // 3. FATURISTA / GERENTE: Totais de Faturamento no Escopo Selecionado
      // ============================================================
      const [faturamentoRows] = await database.execute(
        sql.raw(`
          SELECT 
            COUNT(*) as totalItens,
            COUNT(DISTINCT COALESCE(NULLIF(numeroGuia, ''), NULLIF(contaNumero, ''), CAST(id AS CHAR))) as totalContas,
            COALESCE(SUM(valorFaturado), 0) as valorTotalFaturado,
            MAX(REPLACE(competencia, '/', '-')) as competenciaAtual
          FROM faturamento_unificado 
          WHERE estabelecimentoId IN (${inEscopoIds})
          ${filtroCompUnificado}
        `)
      );
      const faturamento = extrairLinhas(faturamentoRows)[0] || {};

      // Consolidar total faturado do escopo com os dados da Esteira / Contas Convênio para não ficar zerado
      const estabsNoEscopo = faturamentoPorEstabelecimento.filter((e) =>
        escopoIds.includes(e.estabelecimentoId)
      );
      const somaContasEscopo = estabsNoEscopo.reduce((acc, e) => acc + e.quantidadeFaturada, 0);
      const somaValorEscopo = estabsNoEscopo.reduce((acc, e) => acc + e.valorFaturado, 0);
      const somaItensEscopo = estabsNoEscopo.reduce((acc, e) => acc + e.totalItens, 0);

      const totalContasFinal = Math.max(Number(faturamento?.totalContas || 0), somaContasEscopo);
      const valorTotalFaturadoFinal = Math.max(
        Number(faturamento?.valorTotalFaturado || 0),
        somaValorEscopo
      );
      const totalItensFinal = Math.max(Number(faturamento?.totalItens || 0), somaItensEscopo);

      // 4. FATURISTA: Top 5 convênios por valor faturado
      const [conveniosTopRows] = await database.execute(
        sql.raw(`
          SELECT 
            COALESCE(c.nome, fu.convenio, 'Convênio') as convenio,
            COUNT(DISTINCT COALESCE(NULLIF(fu.numeroGuia, ''), NULLIF(fu.contaNumero, ''), CAST(fu.id AS CHAR))) as totalGuias,
            COALESCE(SUM(fu.valorFaturado), 0) as totalFaturado
          FROM faturamento_unificado fu 
          LEFT JOIN convenios c ON fu.convenioId = c.id 
          WHERE fu.estabelecimentoId IN (${inEscopoIds})
          ${filtroCompFuAlias}
          GROUP BY COALESCE(c.nome, fu.convenio, 'Convênio')
          ORDER BY totalFaturado DESC 
          LIMIT 5
        `)
      );
      let conveniosTop = extrairLinhas(conveniosTopRows);

      if (conveniosTop.length === 0) {
        try {
          const [convFabRows] = await database.execute(
            sql.raw(`
              SELECT 
                COALESCE(fc.convenio_nome, c.nome, 'Convênio') as convenio,
                COUNT(*) as totalGuias,
                COALESCE(SUM(CASE WHEN fc.valor_faturado_final > 0 THEN fc.valor_faturado_final ELSE fc.valor_faturado_inicial END), 0) as totalFaturado
              FROM fabrica_contas fc
              LEFT JOIN convenios c ON fc.convenio_id = c.id
              WHERE fc.hospital_estabelecimento_id IN (${inEscopoIds})
              ${filtroCompFabrica}
              GROUP BY COALESCE(fc.convenio_nome, c.nome, 'Convênio')
              ORDER BY totalFaturado DESC, totalGuias DESC
              LIMIT 5
            `)
          );
          conveniosTop = extrairLinhas(convFabRows);
        } catch {
          conveniosTop = [];
        }
      }

      // 5. FATURISTA: Evolução mensal (últimos 6 meses)
      const [evolucaoMensalRows] = await database.execute(
        sql.raw(`
          SELECT 
            REPLACE(competencia, '/', '-') as competencia,
            COUNT(DISTINCT COALESCE(NULLIF(numeroGuia, ''), NULLIF(contaNumero, ''), CAST(id AS CHAR))) as totalContas,
            COALESCE(SUM(valorFaturado), 0) as valorFaturado
          FROM faturamento_unificado 
          WHERE estabelecimentoId IN (${inEscopoIds})
            AND competencia IS NOT NULL AND competencia != ''
          GROUP BY REPLACE(competencia, '/', '-')
          ORDER BY competencia DESC 
          LIMIT 6
        `)
      );
      let evolucaoMensal = extrairLinhas(evolucaoMensalRows);

      if (evolucaoMensal.length === 0) {
        try {
          const [evolFabRows] = await database.execute(
            sql.raw(`
              SELECT 
                DATE_FORMAT(DATE(fc.data_recebimento_safatle), '%Y-%m') as competencia,
                COUNT(*) as totalContas,
                COALESCE(SUM(CASE WHEN fc.valor_faturado_final > 0 THEN fc.valor_faturado_final ELSE fc.valor_faturado_inicial END), 0) as valorFaturado
              FROM fabrica_contas fc
              WHERE fc.hospital_estabelecimento_id IN (${inEscopoIds})
                AND fc.data_recebimento_safatle IS NOT NULL
              GROUP BY DATE_FORMAT(DATE(fc.data_recebimento_safatle), '%Y-%m')
              ORDER BY competencia DESC
              LIMIT 6
            `)
          );
          evolucaoMensal = extrairLinhas(evolFabRows);
        } catch {
          evolucaoMensal = [];
        }
      }

      // 6. RECURSO DE GLOSA: Status do fluxo
      const [recursoStatusRows] = await database.execute(
        sql.raw(`
          SELECT 
            COUNT(*) as totalRecursos,
            SUM(CASE WHEN status = 'rascunho' THEN 1 ELSE 0 END) as rascunho,
            SUM(CASE WHEN status = 'pendente_envio' THEN 1 ELSE 0 END) as pendenteEnvio,
            SUM(CASE WHEN status = 'enviado' THEN 1 ELSE 0 END) as enviado,
            SUM(CASE WHEN status = 'em_analise' THEN 1 ELSE 0 END) as emAnalise,
            SUM(CASE WHEN status = 'deferido' THEN 1 ELSE 0 END) as deferido,
            SUM(CASE WHEN status = 'deferido_parcial' THEN 1 ELSE 0 END) as deferidoParcial,
            SUM(CASE WHEN status = 'indeferido' THEN 1 ELSE 0 END) as indeferido,
            COALESCE(SUM(valorGlosado), 0) as valorTotalGlosado,
            COALESCE(SUM(valorCobrado), 0) as valorTotalRecursado,
            COALESCE(SUM(valorRecuperado), 0) as valorTotalRecuperado
          FROM recursosGlosa 
          WHERE estabelecimentoId IN (${inEscopoIds})
        `)
      );
      const recursoStatus = extrairLinhas(recursoStatusRows)[0] || {};

      // 7. RECURSO DE GLOSA: Recursos com prazo próximo (próximos 30 dias)
      const [recursosComPrazoRows] = await database.execute(
        sql.raw(`
          SELECT 
            rg.id,
            rg.guiaNumero,
            rg.pacienteNome,
            rg.valorGlosado,
            rg.dataPrazoResposta,
            rg.status,
            c.nome as convenioNome,
            DATEDIFF(rg.dataPrazoResposta, NOW()) as diasRestantes
          FROM recursosGlosa rg
          LEFT JOIN convenios c ON rg.convenioId = c.id
          WHERE rg.estabelecimentoId IN (${inEscopoIds})
            AND rg.dataPrazoResposta IS NOT NULL
            AND rg.dataPrazoResposta >= NOW()
            AND rg.status IN ('enviado', 'em_analise')
          ORDER BY rg.dataPrazoResposta ASC
          LIMIT 10
        `)
      );
      const recursosComPrazo = extrairLinhas(recursosComPrazoRows);

      // 8. RECURSO DE GLOSA: Fluxo do processo (pipeline)
      const [fluxoPipelineRows] = await database.execute(
        sql.raw(`
          SELECT
            (SELECT COUNT(DISTINCT COALESCE(NULLIF(fu.numeroGuia, ''), NULLIF(fu.contaNumero, ''), CAST(fu.id AS CHAR))) FROM faturamento_unificado fu WHERE fu.estabelecimentoId IN (${inEscopoIds}) ${filtroCompFuAlias}) as totalGuiasFaturadas,
            (SELECT COUNT(*) FROM nfse_notas n JOIN nfse_hospitais h ON n.hospitalId = h.id WHERE h.estabelecimentoId IN (${inEscopoIds})) as totalNfEmitidas,
            (SELECT COUNT(DISTINCT a.id) FROM arquivos a WHERE a.estabelecimentoId IN (${inEscopoIds}) AND a.direcao = 'retornado' AND a.status = 'processado') as totalDemonstrativosImportados,
            (SELECT COUNT(*) FROM recursosGlosa WHERE estabelecimentoId IN (${inEscopoIds}) AND status NOT IN ('rascunho','cancelado')) as totalRecursosFeitos
        `)
      );
      const fluxoPipeline = extrairLinhas(fluxoPipelineRows)[0] || {};

      // 9. CONCILIAÇÃO: Resumo
      const [conciliacaoRows] = await database.execute(
        sql.raw(`
          SELECT 
            COUNT(*) as totalItens,
            SUM(CASE WHEN ca.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as conciliados,
            SUM(CASE WHEN ca.statusConciliacao IN ('glosa_total','glosa_parcial') THEN 1 ELSE 0 END) as glosados,
            SUM(CASE WHEN ca.statusConciliacao = 'sem_pagamento' THEN 1 ELSE 0 END) as semPagamento,
            SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) as acrescimos,
            COALESCE(SUM(ca.valorPago), 0) as totalPago,
            COALESCE(SUM(ca.valorGlosa), 0) as totalGlosa
          FROM conciliados_automatico ca
          JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
          WHERE fu.estabelecimentoId IN (${inEscopoIds})
          ${filtroCompFuAlias}
        `)
      );
      const conciliacao = extrairLinhas(conciliacaoRows)[0] || {};

      return {
        faturista: {
          totalItens: totalItensFinal,
          totalContas: totalContasFinal,
          valorTotalFaturado: valorTotalFaturadoFinal,
          competenciaAtual: faturamento?.competenciaAtual || compDash || "",
          conveniosTop: conveniosTop.map((c: any) => ({
            convenio: c.convenio || "Sem convênio",
            totalGuias: Number(c.totalGuias || 0),
            totalFaturado: Number(c.totalFaturado || 0),
          })),
          evolucaoMensal: evolucaoMensal
            .map((e: any) => ({
              competencia: e.competencia,
              totalContas: Number(e.totalContas || 0),
              valorFaturado: Number(e.valorFaturado || 0),
            }))
            .reverse(),
        },
        recursoGlosa: {
          totalRecursos: Number(recursoStatus?.totalRecursos || 0),
          rascunho: Number(recursoStatus?.rascunho || 0),
          pendenteEnvio: Number(recursoStatus?.pendenteEnvio || 0),
          enviado: Number(recursoStatus?.enviado || 0),
          emAnalise: Number(recursoStatus?.emAnalise || 0),
          deferido: Number(recursoStatus?.deferido || 0),
          deferidoParcial: Number(recursoStatus?.deferidoParcial || 0),
          indeferido: Number(recursoStatus?.indeferido || 0),
          valorTotalGlosado: Number(recursoStatus?.valorTotalGlosado || 0),
          valorTotalRecursado: Number(recursoStatus?.valorTotalRecursado || 0),
          valorTotalRecuperado: Number(recursoStatus?.valorTotalRecuperado || 0),
          recursosComPrazo: recursosComPrazo.map((r: any) => ({
            id: r.id,
            guiaNumero: r.guiaNumero,
            pacienteNome: r.pacienteNome,
            valorGlosado: Number(r.valorGlosado || 0),
            dataPrazoResposta: r.dataPrazoResposta,
            status: r.status,
            convenioNome: r.convenioNome,
            diasRestantes: Number(r.diasRestantes || 0),
          })),
        },
        fluxoPipeline: {
          totalGuiasFaturadas: Math.max(
            Number(fluxoPipeline?.totalGuiasFaturadas || 0),
            totalContasFinal
          ),
          totalNfEmitidas: Number(fluxoPipeline?.totalNfEmitidas || 0),
          totalDemonstrativosImportados: Number(
            fluxoPipeline?.totalDemonstrativosImportados || 0
          ),
          totalRecursosFeitos: Number(fluxoPipeline?.totalRecursosFeitos || 0),
        },
        conciliacao: {
          totalItens: Number(conciliacao?.totalItens || 0),
          conciliados: Number(conciliacao?.conciliados || 0),
          glosados: Number(conciliacao?.glosados || 0),
          semPagamento: Number(conciliacao?.semPagamento || 0),
          acrescimos: Number(conciliacao?.acrescimos || 0),
          totalPago: Number(conciliacao?.totalPago || 0),
          totalGlosa: Number(conciliacao?.totalGlosa || 0),
        },
        esteiraFaturamento: {
          resumoProducao: {
            totalGeralContas: totalGeralContasEsteira,
            totalGeralValor: totalGeralValorEsteira,
            contasParadasSetores: contasParadasSetoresGlobal,
            valorParadoSetores: valorParadoSetoresGlobal,
            contasFaturadas: contasFaturadasEsteiraGlobal,
            valorFaturadoEsteira: valorFaturadoEsteiraGlobal,
            contasEnviadasConvenio: contasEnviadasConvenioGlobal,
            valorEnviadoConvenio: valorEnviadoConvenioGlobal,
            totalEmFila: totalEmFilaGlobal,
            totalEmAndamento: totalEmAndamentoGlobal,
            totalDevolvidasErro: totalDevolvidasErroGlobal,
            totalErrosRegistrados: fabricaErrosTotal,
            etapasHistorico,
          },
          porSetor: porSetorGlobal,
          producaoPorColaborador,
        },
        faturamentoPorEstabelecimento,
      };
    }),
});
