import type { RowDataPacket } from "mysql2/promise";
import Decimal from "decimal.js";
import { getRawPool } from "./db";
import { compararItensComPadroes, type ResultadoComparacao } from "./services/comparadorPadroes";
import { getWarleineItemPresentation } from "../shared/warleineItemPresentation";

export type WarleineFinancialFilters = {
  estabelecimentoId: number;
  competencia?: string;
  convenio?: string;
  limite?: number;
};

export type WarleineGlosaFilters = {
  estabelecimentoId: number;
  convenioChave?: string;
  mesPagamentoInicio?: string;
  mesPagamentoFim?: string;
  categoriaGlosa?: string;
  mesPagamento?: string;
  itemDescricao?: string;
  procedimentoCodigo?: string;
  motivoCodigo?: string;
  limite?: number;
};

export type WarleineAccountsFilters = {
  estabelecimentoId: number;
  competencia?: string;
  competenciaAno?: string;
  convenio?: string;
  statusAnalise?: "pendente" | "conforme" | "divergente" | "revisado";
  search?: string;
  page: number;
  pageSize: number;
};

const ACTIVE = "1=1";
const CONVENIO_CHAVE_SQL = "COALESCE(NULLIF(convenioFaturadoCodigo,''),NULLIF(convenioFaturadoNome,''),'SEM_CONVENIO')";
const CONVENIO_NOME_SQL = "COALESCE(NULLIF(convenioFaturadoNome,''),'Sem convênio')";

type WarleineAnalysisInput = {
  estabelecimentoId: number;
  competencia: string;
  numeroConta: string;
  convenioChave: string;
  userId: number;
};

export function canonicalizeWarleineConventionDetails(rows: readonly unknown[]): Array<{ chave: string; nome: string }> {
  const canonical = new Map<string, string>();
  for (const rawRow of rows) {
    const row = rawRow as { convenioChave?: unknown; convenio?: unknown };
    const chave = String(row.convenioChave);
    const nome = String(row.convenio || "Sem convênio");
    const current = canonical.get(chave);
    if (!current || nome.localeCompare(current, "pt-BR") > 0) canonical.set(chave, nome);
  }
  return [...canonical.entries()]
    .map(([chave, nome]) => ({ chave, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function n(value: unknown): number {
  const decimal = new Decimal(String(value ?? 0));
  if (!decimal.isFinite() || decimal.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Quantidade Warleine fora da faixa segura de serialização.");
  }
  const parsed = decimal.toNumber();
  if (!new Decimal(String(parsed)).equals(decimal)) {
    throw new Error("Quantidade Warleine perderia precisão na serialização.");
  }
  return parsed;
}

function money(value: unknown): number {
  const decimal = new Decimal(String(value ?? 0)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const scaled = decimal.times(10_000);
  if (!decimal.isFinite() || !scaled.isInteger() || scaled.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Valor monetário Warleine fora da faixa segura de serialização.");
  }
  const serialized = scaled.toNumber() / 10_000;
  if (!new Decimal(String(serialized)).equals(decimal)) {
    throw new Error("Valor monetário Warleine perderia precisão na serialização.");
  }
  return serialized;
}

export const warleineQuantityToSafeNumber = n;
export const warleineMoneyToSafeNumber = money;

function percentage(value: Decimal.Value, base: Decimal.Value): number {
  const denominator = new Decimal(base || 0);
  return denominator.greaterThan(0)
    ? money(new Decimal(value || 0).dividedBy(denominator).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
    : 0;
}

function financialRow(row: RowDataPacket) {
  const totalFaturado = money(row.totalFaturado);
  const totalRecebido = money(row.totalRecebido);
  const totalGlosado = money(row.totalGlosado);
  const totalSaldo = money(row.totalSaldo);
  const totalAcrescimo = money(row.totalAcrescimo);
  const glosaEmRecurso = money(row.glosaEmRecurso);
  const glosaRecuperada = money(row.glosaRecuperada);
  const glosaAceita = money(row.glosaAceita);
  const glosaPendente = money(row.glosaPendente);
  const glosaARecursar = glosaPendente;
  return {
    totalFaturado,
    totalRecebido,
    totalGlosado,
    totalSaldo,
    totalAcrescimo,
    glosaARecursar,
    glosaEmRecurso,
    glosaRecursada: glosaEmRecurso,
    glosaRecuperada,
    glosaAceita,
    quantidade: n(row.quantidade),
    percentualGlosa: percentage(row.totalGlosado || 0, row.totalFaturado || 0),
    percentualRecebido: percentage(row.totalRecebido || 0, row.totalFaturado || 0),
    percentualRecurso: percentage(row.glosaEmRecurso || 0, row.totalGlosado || 0),
  };
}

function financialSelect(group = "") {
  return `
    ${group}
    COALESCE(SUM(valorFaturado),0) AS totalFaturado,
    COALESCE(SUM(valorTotalRecebido),0) AS totalRecebido,
    COALESCE(SUM(valorGlosa),0) AS totalGlosado,
    COALESCE(SUM(valorAberto),0) AS totalSaldo,
    COALESCE(SUM(valorRecebidoMaior),0) AS totalAcrescimo,
    COALESCE(SUM(valorRecursado),0) AS glosaEmRecurso,
    COALESCE(SUM(valorGlosaRecuperada),0) AS glosaRecuperada,
    COALESCE(SUM(valorGlosaAceita),0) AS glosaAceita,
    COALESCE(SUM(valorGlosaAnalise),0) AS glosaPendente,
    COUNT(*) AS quantidade
  `;
}

function financialWhere(filters: WarleineFinancialFilters) {
  const clauses = ["estabelecimentoId=?", ACTIVE];
  const params: unknown[] = [filters.estabelecimentoId];
  if (filters.competencia) { clauses.push("competencia=?"); params.push(filters.competencia); }
  if (filters.convenio) { clauses.push(`${CONVENIO_CHAVE_SQL}=?`); params.push(filters.convenio); }
  return { sql: clauses.join(" AND "), params };
}

async function establishmentName(estabelecimentoId: number): Promise<string> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [rows] = await pool.query<RowDataPacket[]>("SELECT nome FROM estabelecimentos WHERE id=? LIMIT 1", [estabelecimentoId]);
  if (!rows[0]) throw new Error("Estabelecimento não encontrado.");
  return String(rows[0].nome);
}

export async function getWarleineFinancialData(filters: WarleineFinancialFilters) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const where = financialWhere(filters);
  const limit = Math.max(5, Math.min(30, filters.limite || 10));
  const [[summaryRows], [byConventionRows], [byMonthRows], [reasonRows], [itemRows], [filterRows], nome] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${financialSelect()} FROM warleine_faturamento_itens_ativos WHERE ${where.sql}`, where.params),
    pool.query<RowDataPacket[]>(`SELECT ${financialSelect(`${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio,`)} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY convenioChave ORDER BY totalFaturado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT ${financialSelect("competencia,")} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY competencia ORDER BY competencia`, where.params),
    pool.query<RowDataPacket[]>(`SELECT COALESCE(NULLIF(codigoGlosa,''),'SEM_CODIGO') AS codigo, COALESCE(NULLIF(motivoGlosa,''),'Motivo não informado') AS motivo, SUM(valorGlosa) AS valorGlosado, COUNT(*) AS quantidade FROM warleine_faturamento_itens_ativos WHERE ${where.sql} AND valorGlosa>0 GROUP BY codigo,motivo ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT COALESCE(NULLIF(codigoTuss,''),NULLIF(codigoItemInterno,''),'SEM_CODIGO') AS codigo, COALESCE(NULLIF(servicoNome,''),'Item não informado') AS item, COALESCE(NULLIF(tipoItem,''),'Não informado') AS tipo, SUM(valorGlosa) AS valorGlosado, COUNT(*) AS quantidade FROM warleine_faturamento_itens_ativos WHERE ${where.sql} AND valorGlosa>0 GROUP BY codigo,item,tipo ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT competencia, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND ${ACTIVE} GROUP BY competencia,convenioChave ORDER BY competencia DESC, convenio`, [filters.estabelecimentoId]),
    establishmentName(filters.estabelecimentoId),
  ]);
  const resumo = financialRow(summaryRows[0] || {} as RowDataPacket);
  return {
    estabelecimento: { id: filters.estabelecimentoId, nome },
    filtrosAplicados: { competencia: filters.competencia || null, convenio: filters.convenio || null },
    resumo,
    porConvenio: byConventionRows.map((row) => ({ convenioChave: String(row.convenioChave), convenio: String(row.convenio), ...financialRow(row) })),
    porMes: byMonthRows.map((row) => ({ competencia: String(row.competencia), ...financialRow(row) })),
    motivosGlosa: reasonRows.map((row) => ({ codigo: String(row.codigo), motivo: String(row.motivo), valorGlosado: money(row.valorGlosado), quantidade: n(row.quantidade) })),
    itensGlosados: itemRows.map((row) => ({ codigo: String(row.codigo), item: String(row.item), tipo: String(row.tipo), valorGlosado: money(row.valorGlosado), quantidade: n(row.quantidade) })),
    lancamentosExternosConsiderados: [],
    filtrosDisponiveis: {
      competencias: [...new Set(filterRows.map((row) => String(row.competencia)).filter(Boolean))],
      convenios: canonicalizeWarleineConventionDetails(filterRows).map((item) => item.nome),
      conveniosDetalhes: canonicalizeWarleineConventionDetails(filterRows),
    },
    metodologia: {
      faturado: "Valor faturado informado pelo sistema Warleine no lote ativo da competência.",
      recebidoGlosado: "Recebido, aberto e glosado são os valores informados pelo Warleine; demonstrativos e XMLs não são somados.",
      recursos: "Recursado, recuperado, aceito e em análise permanecem em colunas separadas conforme a fonte.",
      glosaAceita: "Glosa aceita corresponde ao campo gl_aceita do Warleine.",
      manual: "Esta visão não inclui lançamentos manuais nem outras fontes.",
    },
  };
}

function glosaWhere(filters: WarleineGlosaFilters) {
  const clauses = ["estabelecimentoId=?", ACTIVE, "valorGlosa>0"];
  const params: unknown[] = [filters.estabelecimentoId];
  if (filters.convenioChave) { clauses.push(`${CONVENIO_CHAVE_SQL}=?`); params.push(filters.convenioChave); }
  if (filters.mesPagamentoInicio) { clauses.push("competencia>=?"); params.push(filters.mesPagamentoInicio); }
  if (filters.mesPagamentoFim) { clauses.push("competencia<=?"); params.push(filters.mesPagamentoFim); }
  if (filters.mesPagamento) { clauses.push("competencia=?"); params.push(filters.mesPagamento); }
  if (filters.categoriaGlosa === "COM_CODIGO") clauses.push("NULLIF(TRIM(codigoGlosa),'') IS NOT NULL");
  if (filters.categoriaGlosa === "SEM_CODIGO") clauses.push("NULLIF(TRIM(codigoGlosa),'') IS NULL");
  if (filters.itemDescricao) { clauses.push("servicoNome=?"); params.push(filters.itemDescricao); }
  if (filters.procedimentoCodigo) { clauses.push("COALESCE(NULLIF(codigoTuss,''),codigoItemInterno)=?"); params.push(filters.procedimentoCodigo); }
  if (filters.motivoCodigo) { clauses.push("COALESCE(NULLIF(codigoGlosa,''),'SEM_CODIGO')=?"); params.push(filters.motivoCodigo); }
  return { sql: clauses.join(" AND "), params };
}

function glosaSelect(group = "") {
  return `${group}
    COALESCE(SUM(valorFaturado),0) AS valorProcessado,
    COALESCE(SUM(valorTotalRecebido),0) AS valorPago,
    COALESCE(SUM(valorGlosa),0) AS valorGlosado,
    COALESCE(SUM(valorGlosaAceita),0) AS glosaAceita,
    COALESCE(SUM(valorRecursado),0) AS glosaRecursada,
    COALESCE(SUM(valorGlosaAnalise),0) AS glosaPendente,
    COALESCE(SUM(valorGlosaRecuperada),0) AS glosaRecuperada,
    COUNT(*) AS qtdItens,
    COUNT(DISTINCT numeroConta) AS totalGuiasGlosadas,
    SUM(CASE WHEN valorRecursado>0 THEN 1 ELSE 0 END) AS quantidadeRecursada,
    SUM(CASE WHEN valorGlosaAceita>0 THEN 1 ELSE 0 END) AS quantidadeAceita`;
}

function glosaRow(row: RowDataPacket, totalGlosado: Decimal.Value = 0) {
  const valorProcessado = money(row.valorProcessado);
  const valorPago = money(row.valorPago);
  const valorGlosado = money(row.valorGlosado);
  const glosaAceita = money(row.glosaAceita);
  const glosaRecursada = money(row.glosaRecursada);
  const glosaPendente = money(row.glosaPendente);
  const glosaRecuperada = money(row.glosaRecuperada);
  const qtdItens = n(row.qtdItens);
  const analisado = new Decimal(String(row.glosaAceita || 0)).plus(String(row.glosaRecursada || 0)).plus(String(row.glosaRecuperada || 0));
  return {
    valorProcessado, valorPago, valorGlosado, glosaAceita, glosaRecursada, glosaPendente, glosaRecuperada,
    glosaRecursadaVinculada: glosaRecursada,
    glosaRecursadaHistoricaSemVinculo: 0,
    qtdItens,
    totalItensGlosados: qtdItens,
    totalGuiasGlosadas: n(row.totalGuiasGlosadas),
    taxaGlosa: percentage(row.valorGlosado || 0, row.valorProcessado || 0),
    ticketMedio: qtdItens ? money(new Decimal(String(row.valorGlosado || 0)).dividedBy(qtdItens)) : 0,
    percentualTotal: percentage(row.valorGlosado || 0, new Decimal(totalGlosado || 0).greaterThan(0) ? totalGlosado : row.valorGlosado || 0),
    percentualAnalisado: percentage(analisado, row.valorGlosado || 0),
    percentualAceito: percentage(row.glosaAceita || 0, row.valorGlosado || 0),
    percentualRecursado: percentage(row.glosaRecursada || 0, row.valorGlosado || 0),
  };
}

export async function getWarleineGlosaFilters(estabelecimentoId: number) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT competencia, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND ${ACTIVE} GROUP BY competencia,convenioChave ORDER BY competencia DESC, convenio`, [estabelecimentoId]);
  return {
    competencias: [...new Set(rows.map((row) => String(row.competencia)).filter(Boolean))],
    convenios: canonicalizeWarleineConventionDetails(rows).map(({ chave: id, nome }) => ({ id, nome })),
    categoriasGlosa: ["COM_CODIGO", "SEM_CODIGO"],
  };
}

export async function getWarleineGlosaDashboard(filters: WarleineGlosaFilters) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const where = glosaWhere(filters);
  const limit = Math.max(5, Math.min(50, filters.limite || 20));
  const [[summaryRows], [monthRows], [conventionRows], [itemRows], [procedureRows], [reasonRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${glosaSelect()} FROM warleine_faturamento_itens_ativos WHERE ${where.sql}`, where.params),
    pool.query<RowDataPacket[]>(`SELECT ${glosaSelect("competencia AS mesPagamento,")} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY competencia ORDER BY competencia`, where.params),
    pool.query<RowDataPacket[]>(`SELECT ${glosaSelect(`${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS nome,`)} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY convenioChave ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT ${glosaSelect("COALESCE(NULLIF(codigoTuss,''),NULLIF(codigoItemInterno,''),'SEM_CODIGO') AS codigoItem, COALESCE(NULLIF(servicoNome,''),'Item não informado') AS nome, COALESCE(NULLIF(tipoItem,''),'Não informado') AS tipoLancamento,")} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY codigoItem,nome,tipoLancamento ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT ${glosaSelect("COALESCE(NULLIF(codigoTuss,''),NULLIF(codigoItemInterno,''),'SEM_CODIGO') AS codigoItem, COALESCE(NULLIF(servicoNome,''),'Procedimento não informado') AS nome, COALESCE(NULLIF(tipoItem,''),'Não informado') AS tipoLancamento,")} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY codigoItem,nome,tipoLancamento ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
    pool.query<RowDataPacket[]>(`SELECT COALESCE(NULLIF(codigoGlosa,''),'SEM_CODIGO') AS codigoGlosa, COALESCE(NULLIF(motivoGlosa,''),'Motivo não informado') AS nome, CASE WHEN NULLIF(TRIM(codigoGlosa),'') IS NULL THEN 'SEM_CODIGO' ELSE 'COM_CODIGO' END AS categoria, ${glosaSelect()} FROM warleine_faturamento_itens_ativos WHERE ${where.sql} GROUP BY codigoGlosa,nome,categoria ORDER BY valorGlosado DESC LIMIT ?`, [...where.params, limit]),
  ]);
  const resumo = glosaRow(summaryRows[0] || {} as RowDataPacket);
  const mapRow = (row: RowDataPacket) => glosaRow(row, resumo.valorGlosado);
  return {
    resumo,
    porMesPagamento: monthRows.map((row) => ({ mesPagamento: String(row.mesPagamento), ...mapRow(row) })),
    porConvenio: conventionRows.map((row) => ({ id: String(row.convenioChave), convenioId: String(row.convenioChave), convenioChave: String(row.convenioChave), nome: String(row.nome), ...mapRow(row) })),
    porItem: itemRows.map((row) => ({ codigoItem: String(row.codigoItem), nome: String(row.nome), tipoLancamento: String(row.tipoLancamento), ...mapRow(row) })),
    porProcedimento: procedureRows.map((row) => ({ codigoItem: String(row.codigoItem), nome: String(row.nome), tipoLancamento: String(row.tipoLancamento), ...mapRow(row) })),
    porMotivo: reasonRows.map((row) => ({ codigoGlosa: String(row.codigoGlosa), nome: String(row.nome), categoria: String(row.categoria), ...mapRow(row) })),
    recursosAnalisados: {
      lotes: [],
      totalLotes: 0,
      totalItens: 0,
      totalRecursado: resumo.glosaRecursada,
      quantidadeRecursada: n(summaryRows[0]?.quantidadeRecursada),
      quantidadeAceitaHistorica: n(summaryRows[0]?.quantidadeAceita),
      quantidadeHistoricaSemVinculo: 0,
      valorHistoricoSemVinculo: 0,
      itensHistoricosSemVinculoAtual: 0,
    },
  };
}

export async function compararContaWarleineComPadroes(input: WarleineAnalysisInput): Promise<ResultadoComparacao> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // A publicação troca este mesmo ponteiro em transação. O lock impede gravar
    // uma análise cujo lote deixou de ser o snapshot ativo durante o cálculo.
    const [snapshotRows] = await connection.query<RowDataPacket[]>(`
      SELECT loteId FROM warleine_faturamento_snapshots_ativos
      WHERE estabelecimentoId=? AND competencia=?
      FOR UPDATE
    `, [input.estabelecimentoId, input.competencia]);
    const loteId = Number(snapshotRows[0]?.loteId || 0);
    if (!loteId) throw new Error("Não existe snapshot ativo para a competência selecionada.");

    const [rows] = await connection.query<RowDataPacket[]>(`
      SELECT
        COALESCE(NULLIF(codigoTuss,''), NULLIF(codigoItemInterno,'')) AS codigoItem,
        servicoNome AS descricaoItem,
        tipoItem,
        quantidade,
        valorUnitario,
        valorFaturado AS valorTotal,
        setorNome AS setor,
        codigoTuss AS codigoProcedimento,
        ${CONVENIO_NOME_SQL} AS convenio
      FROM warleine_faturamento_itens
      WHERE estabelecimentoId=? AND competencia=? AND loteId=? AND numeroConta=?
        AND ${CONVENIO_CHAVE_SQL}=?
      ORDER BY id
    `, [input.estabelecimentoId, input.competencia, loteId, input.numeroConta, input.convenioChave]);

    const convenio = rows[0]?.convenio ? String(rows[0].convenio) : null;
    const resultado = await compararItensComPadroes({
      numeroConta: input.numeroConta,
      estabelecimentoId: input.estabelecimentoId,
      convenio,
      itens: rows.map((row) => ({
        codigoItem: row.codigoItem ? String(row.codigoItem) : null,
        descricaoItem: row.descricaoItem ? String(row.descricaoItem) : null,
        tipoItem: row.tipoItem ? String(row.tipoItem) : null,
        quantidade: row.quantidade ? String(row.quantidade) : null,
        valorUnitario: row.valorUnitario ? String(row.valorUnitario) : null,
        valorTotal: row.valorTotal ? String(row.valorTotal) : null,
        setor: row.setor ? String(row.setor) : null,
        codigoProcedimento: row.codigoProcedimento ? String(row.codigoProcedimento) : null,
      })),
    });

    const totalCriticos = resultado.divergencias.filter((item) => item.severidade === "critico").length;
    await connection.execute(`
    INSERT INTO warleine_faturamento_analises (
      estabelecimentoId, competencia, numeroConta, convenioChave, loteId,
      statusAnalise, totalItensAnalisados, totalDivergencias, totalAlertas,
      totalCriticos, scoreRisco, resumoPorTipo, detalhesRisco, divergencias,
      padroesDetalhados, analisadoPor, analisadoEm, atualizadoEm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      statusAnalise=VALUES(statusAnalise), totalItensAnalisados=VALUES(totalItensAnalisados),
      totalDivergencias=VALUES(totalDivergencias), totalAlertas=VALUES(totalAlertas),
      totalCriticos=VALUES(totalCriticos), scoreRisco=VALUES(scoreRisco),
      resumoPorTipo=VALUES(resumoPorTipo), detalhesRisco=VALUES(detalhesRisco),
      divergencias=VALUES(divergencias), padroesDetalhados=VALUES(padroesDetalhados),
      analisadoPor=VALUES(analisadoPor), analisadoEm=NOW(), atualizadoEm=NOW()
  `, [
    input.estabelecimentoId, input.competencia, input.numeroConta, input.convenioChave, loteId,
    resultado.statusGeral, resultado.totalItensAnalisados, resultado.totalDivergencias,
    resultado.totalAlertas, totalCriticos, resultado.scoreRisco.score,
    JSON.stringify(resultado.resumoPorTipo), JSON.stringify(resultado.scoreRisco),
    JSON.stringify(resultado.divergencias), JSON.stringify(resultado.padroesDetalhados), input.userId,
    ]);
    await connection.commit();
    return resultado;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getWarleineAccountDetails(
  estabelecimentoId: number,
  competencia: string,
  numeroConta: string,
  convenioChave: string,
  page = 1,
  pageSize = 100,
) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // A publicação atualiza este ponteiro no mesmo banco. O lock mantém itens e
    // análise referenciando a mesma versão até que a resposta seja construída.
    const [snapshotRows] = await connection.query<RowDataPacket[]>(`
      SELECT loteId FROM warleine_faturamento_snapshots_ativos
      WHERE estabelecimentoId=? AND competencia=?
      FOR UPDATE
    `, [estabelecimentoId, competencia]);
    if (!snapshotRows[0]) throw new Error("Não existe snapshot ativo para a competência selecionada.");

    const [itemData, analysisData] = await Promise.all([
      getWarleineAccountItems(estabelecimentoId, competencia, numeroConta, convenioChave, page, pageSize),
      getWarleineAccountAnalysis(estabelecimentoId, competencia, numeroConta, convenioChave),
    ]);
    await connection.commit();

    const divergencias = analysisData?.divergencias || [];
    const byCode = new Map<string, unknown[]>();
    for (const divergence of divergencias as Array<{ codigoItem?: unknown }>) {
      const codigo = String(divergence.codigoItem || "");
      if (!codigo) continue;
      byCode.set(codigo, [...(byCode.get(codigo) || []), divergence]);
    }
    return {
      ...itemData,
      analysis: analysisData,
      items: itemData.items.map((item) => {
        const codigo = item.codigoTuss || item.codigoItemInterno;
        const divergenciasItem = byCode.get(codigo) || [];
        return {
          ...item,
          codigoItem: codigo,
          descricaoItem: item.servicoNome,
          valorTotal: item.valorFaturado,
          setor: item.setorNome,
          statusAnalise: analysisData?.statusAnalise || "pendente",
          divergencias: divergenciasItem,
        };
      }),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getWarleineAccountAnalysis(
  estabelecimentoId: number,
  competencia: string,
  numeroConta: string,
  convenioChave: string,
) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT a.statusAnalise,a.totalItensAnalisados,a.totalDivergencias,a.totalAlertas,
           a.totalCriticos,a.scoreRisco,a.resumoPorTipo,a.detalhesRisco,a.divergencias,
           a.padroesDetalhados,a.analisadoEm
    FROM warleine_faturamento_analises a
    INNER JOIN warleine_faturamento_snapshots_ativos s
      ON s.estabelecimentoId=a.estabelecimentoId AND s.competencia=a.competencia AND s.loteId=a.loteId
    WHERE a.estabelecimentoId=? AND a.competencia=? AND a.numeroConta=? AND a.convenioChave=?
    LIMIT 1
  `, [estabelecimentoId, competencia, numeroConta, convenioChave]);
  const row = rows[0];
  if (!row) return null;
  const parseJson = (value: unknown) => {
    if (value == null) return null;
    if (typeof value === "object") return value;
    try { return JSON.parse(String(value)); } catch { return null; }
  };
  return {
    statusAnalise: String(row.statusAnalise),
    totalItensAnalisados: n(row.totalItensAnalisados),
    totalDivergencias: n(row.totalDivergencias),
    totalAlertas: n(row.totalAlertas),
    totalCriticos: n(row.totalCriticos),
    scoreRisco: n(row.scoreRisco),
    resumoPorTipo: parseJson(row.resumoPorTipo),
    detalhesRisco: parseJson(row.detalhesRisco),
    divergencias: parseJson(row.divergencias) || [],
    padroesDetalhados: parseJson(row.padroesDetalhados) || [],
    analisadoEm: row.analisadoEm ? String(row.analisadoEm) : null,
  };
}

export async function getWarleineAccounts(filters: WarleineAccountsFilters) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const clauses = ["estabelecimentoId=?", ACTIVE];
  const params: unknown[] = [filters.estabelecimentoId];
  if (filters.competencia) { clauses.push("competencia=?"); params.push(filters.competencia); }
  else if (filters.competenciaAno) { clauses.push("competencia LIKE ?"); params.push(`${filters.competenciaAno}/%`); }
  if (filters.convenio) { clauses.push(`${CONVENIO_CHAVE_SQL}=?`); params.push(filters.convenio); }
  if (filters.search) {
    clauses.push("(numeroConta LIKE ? OR pacienteNome LIKE ? OR convenioFaturadoNome LIKE ? OR guiaOperadora LIKE ? OR guiaPrestador LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search, search, search);
  }
  const where = clauses.join(" AND ");
  const offset = (filters.page - 1) * filters.pageSize;
  const accountBase = `SELECT estabelecimentoId, competencia, numeroConta, MAX(loteId) AS loteId, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio, MAX(pacienteNome) AS pacienteNome, MAX(carteiraBeneficiario) AS carteiraBeneficiario, MAX(guiaOperadora) AS guiaOperadora, MAX(guiaPrestador) AS guiaPrestador, COUNT(*) AS totalItens, SUM(valorFaturado) AS valorFaturado, SUM(valorTotalRecebido) AS valorRecebido, SUM(valorAberto) AS valorAberto, SUM(valorGlosa) AS valorGlosa FROM warleine_faturamento_itens_ativos WHERE ${where} GROUP BY estabelecimentoId,competencia,numeroConta,convenioChave`;
  const accountCte = `SELECT c.*, COALESCE(a.statusAnalise, 'pendente') AS statusAnalise, COALESCE(a.totalDivergencias, 0) AS totalDivergencias, COALESCE(a.totalAlertas, 0) AS totalAlertas, COALESCE(a.scoreRisco, 0) AS scoreRisco FROM (${accountBase}) c LEFT JOIN warleine_faturamento_analises a ON a.estabelecimentoId=c.estabelecimentoId AND a.competencia=c.competencia AND a.numeroConta=c.numeroConta AND a.convenioChave=c.convenioChave AND a.loteId=c.loteId`;
  const analysisWhere = filters.statusAnalise ? " WHERE statusAnalise=?" : "";
  const analysisParams = filters.statusAnalise ? [...params, filters.statusAnalise] : params;
  const filterClauses = ["estabelecimentoId=?", ACTIVE];
  const filterParams: unknown[] = [filters.estabelecimentoId];
  if (filters.competencia) { filterClauses.push("competencia=?"); filterParams.push(filters.competencia); }
  else if (filters.competenciaAno) { filterClauses.push("competencia LIKE ?"); filterParams.push(`${filters.competenciaAno}/%`); }
  const [[listRows], [summaryRows], [filterRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT * FROM (${accountCte}) contas${analysisWhere} ORDER BY competencia DESC, numeroConta DESC, convenio ASC LIMIT ? OFFSET ?`, [...analysisParams, filters.pageSize, offset]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS totalContas, COALESCE(SUM(valorFaturado),0) AS valorFaturado, COALESCE(SUM(valorRecebido),0) AS valorRecebido, COALESCE(SUM(valorAberto),0) AS valorAberto, COALESCE(SUM(valorGlosa),0) AS valorGlosa, SUM(statusAnalise='conforme') AS totalConformes, SUM(statusAnalise='divergente') AS totalDivergentes, SUM(statusAnalise='pendente') AS totalPendentes FROM (${accountCte}) contas${analysisWhere}`, analysisParams),
    pool.query<RowDataPacket[]>(`SELECT competencia, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio FROM warleine_faturamento_itens_ativos WHERE ${filterClauses.join(" AND ")} GROUP BY competencia,convenioChave ORDER BY competencia DESC, convenio`, filterParams),
  ]);
  const summary = summaryRows[0] || {} as RowDataPacket;
  return {
    contas: listRows.map((row) => ({
      virtualId: `${row.competencia}:${row.convenioChave}:${row.numeroConta}`,
      estabelecimentoId: filters.estabelecimentoId,
      competencia: String(row.competencia),
      numeroConta: String(row.numeroConta),
      convenioChave: String(row.convenioChave),
      convenio: String(row.convenio),
      pacienteNome: String(row.pacienteNome || ""),
      carteiraBeneficiario: String(row.carteiraBeneficiario || ""),
      guiaOperadora: String(row.guiaOperadora || ""),
      guiaPrestador: String(row.guiaPrestador || ""),
      totalItens: n(row.totalItens),
      valorFaturado: money(row.valorFaturado),
      valorRecebido: money(row.valorRecebido),
      valorAberto: money(row.valorAberto),
      valorGlosa: money(row.valorGlosa),
      origem: "WARLEINE" as const,
      statusAnalise: String(row.statusAnalise || "pendente"),
      totalDivergencias: n(row.totalDivergencias),
      totalAlertas: n(row.totalAlertas),
      scoreRisco: n(row.scoreRisco),
    })),
    total: n(summary.totalContas),
    resumo: {
      totalContas: n(summary.totalContas), valorFaturado: money(summary.valorFaturado),
      valorRecebido: money(summary.valorRecebido), valorAberto: money(summary.valorAberto),
      valorGlosa: money(summary.valorGlosa), totalConformes: n(summary.totalConformes),
      totalDivergentes: n(summary.totalDivergentes), totalPendentes: n(summary.totalPendentes),
    },
    filtros: {
      competencias: [...new Set(filterRows.map((row) => String(row.competencia)))],
      convenios: canonicalizeWarleineConventionDetails(filterRows).map((item) => item.nome),
      conveniosDetalhes: canonicalizeWarleineConventionDetails(filterRows),
    },
  };
}

export async function getWarleineAccountItems(estabelecimentoId: number, competencia: string, numeroConta: string, convenioChave: string, page = 1, pageSize = 100) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(20, Math.min(200, pageSize));
  const offset = (safePage - 1) * safePageSize;
  const [[rows], [countRows], [summaryRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`
    SELECT id,origemRegistroId,codigoTuss,codigoItemInterno,codigoTipoServico,recebimentoViaHospital,servicoNome,tipoItem,quantidade,valorUnitario,valorFaturado,valorTotalRecebido,valorAberto,valorGlosa,codigoGlosa,motivoGlosa,dataAberturaConta,dataEntrada,dataAlta,prestadorExecutanteNome,setorNome
    FROM warleine_faturamento_itens_ativos
    WHERE estabelecimentoId=? AND ${ACTIVE} AND competencia=? AND numeroConta=? AND ${CONVENIO_CHAVE_SQL}=?
    ORDER BY id
    LIMIT ? OFFSET ?
  `, [estabelecimentoId, competencia, numeroConta, convenioChave, safePageSize, offset]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND ${ACTIVE} AND competencia=? AND numeroConta=? AND ${CONVENIO_CHAVE_SQL}=?`, [estabelecimentoId, competencia, numeroConta, convenioChave]),
    pool.query<RowDataPacket[]>(`
      SELECT COALESCE(SUM(valorFaturado),0) AS valorFaturado,
             COALESCE(SUM(valorTotalRecebido),0) AS valorRecebido,
             COALESCE(SUM(valorAberto),0) AS valorAberto,
             COALESCE(SUM(valorGlosa),0) AS valorGlosa
      FROM warleine_faturamento_itens_ativos
      WHERE estabelecimentoId=? AND ${ACTIVE} AND competencia=? AND numeroConta=? AND ${CONVENIO_CHAVE_SQL}=?
    `, [estabelecimentoId, competencia, numeroConta, convenioChave]),
  ]);
  const summary = summaryRows[0] || {} as RowDataPacket;
  return { items: rows.map((row) => ({
    ...getWarleineItemPresentation(estabelecimentoId, {
      origemRegistroId: row.origemRegistroId,
      dataAberturaConta: row.dataAberturaConta,
      codigoTipoServico: row.codigoTipoServico,
      recebimentoViaHospital: row.recebimentoViaHospital,
    }),
    id: Number(row.id), codigoTuss: String(row.codigoTuss || ""), codigoItemInterno: String(row.codigoItemInterno || ""), servicoNome: String(row.servicoNome || ""),
    tipoItem: String(row.tipoItem || ""), quantidade: n(row.quantidade), valorUnitario: money(row.valorUnitario), valorFaturado: money(row.valorFaturado),
    valorRecebido: money(row.valorTotalRecebido), valorAberto: money(row.valorAberto), valorGlosa: money(row.valorGlosa), codigoGlosa: String(row.codigoGlosa || ""),
    motivoGlosa: String(row.motivoGlosa || ""), dataAberturaConta: row.dataAberturaConta ? String(row.dataAberturaConta) : null,
    dataEntrada: row.dataEntrada ? String(row.dataEntrada) : null, dataAlta: row.dataAlta ? String(row.dataAlta) : null,
    prestadorExecutanteNome: String(row.prestadorExecutanteNome || ""), setorNome: String(row.setorNome || ""),
  })), total: n(countRows[0]?.total), page: safePage, pageSize: safePageSize,
  resumoConta: {
    valorFaturado: money(summary.valorFaturado),
    valorRecebido: money(summary.valorRecebido),
    valorAberto: money(summary.valorAberto),
    valorGlosa: money(summary.valorGlosa),
  } };
}

export async function getWarleineLotSummary(estabelecimentoId: number) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT id,arquivoNome,origem,status,tentativas,totalLinhas,totalValidas,totalAvisos,totalRejeitadas,totalPublicadas,valorFaturado,valorTotalRecebido,valorAberto,valorGlosa,erroResumo,competencias,iniciadoEm,validadoEm,publicadoEm FROM warleine_faturamento_lotes WHERE estabelecimentoId=? ORDER BY id DESC LIMIT 20`, [estabelecimentoId]);
  return rows.map((row) => ({
    id: Number(row.id),
    arquivoNome: String(row.arquivoNome || ""),
    origem: String(row.origem || "arquivo"),
    status: String(row.status || ""),
    tentativas: n(row.tentativas),
    totalLinhas: n(row.totalLinhas),
    totalValidas: n(row.totalValidas),
    totalAvisos: n(row.totalAvisos),
    totalRejeitadas: n(row.totalRejeitadas),
    totalPublicadas: n(row.totalPublicadas),
    valorFaturado: money(row.valorFaturado),
    valorTotalRecebido: money(row.valorTotalRecebido),
    valorAberto: money(row.valorAberto),
    valorGlosa: money(row.valorGlosa),
    erroResumo: row.erroResumo ? String(row.erroResumo) : null,
    competencias: Array.isArray(row.competencias) ? row.competencias.map(String) : JSON.parse(String(row.competencias || "[]")),
    iniciadoEm: row.iniciadoEm ? String(row.iniciadoEm) : null,
    validadoEm: row.validadoEm ? String(row.validadoEm) : null,
    publicadoEm: row.publicadoEm ? String(row.publicadoEm) : null,
  }));
}

export async function approveWarleineSnapshotReduction(estabelecimentoId: number, loteId: number, userId: number, reason: string) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [result] = await pool.execute<any>(`
    UPDATE warleine_faturamento_lotes
    SET reducaoAprovadaEm=NOW(), reducaoAprovadaPor=?, reducaoAprovacaoMotivo=?,
        status='enfileirado', tentativas=0, erroResumo=NULL,
        claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL, atualizadoEm=NOW()
    WHERE id=? AND estabelecimentoId=? AND status='erro'
      AND erroResumo LIKE 'SNAPSHOT_REDUZIDO:%' AND arquivoStorageKey IS NOT NULL
  `, [userId, reason, loteId, estabelecimentoId]);
  if (Number(result.affectedRows || 0) !== 1) {
    throw new Error("O lote não está aguardando aprovação de redução de snapshot.");
  }
  return { success: true, loteId };
}
