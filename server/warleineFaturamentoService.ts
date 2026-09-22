import type { RowDataPacket } from "mysql2/promise";
import Decimal from "decimal.js";
import { getRawPool } from "./db";

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
  convenio?: string;
  search?: string;
  page: number;
  pageSize: number;
};

const ACTIVE = "1=1";
const CONVENIO_CHAVE_SQL = "COALESCE(NULLIF(convenioFaturadoCodigo,''),NULLIF(convenioFaturadoNome,''),'SEM_CONVENIO')";
const CONVENIO_NOME_SQL = "COALESCE(NULLIF(convenioFaturadoNome,''),'Sem convênio')";

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

export async function getWarleineAccounts(filters: WarleineAccountsFilters) {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const clauses = ["estabelecimentoId=?", ACTIVE];
  const params: unknown[] = [filters.estabelecimentoId];
  if (filters.competencia) { clauses.push("competencia=?"); params.push(filters.competencia); }
  if (filters.convenio) { clauses.push(`${CONVENIO_CHAVE_SQL}=?`); params.push(filters.convenio); }
  if (filters.search) {
    clauses.push("(numeroConta LIKE ? OR pacienteNome LIKE ? OR convenioFaturadoNome LIKE ? OR guiaOperadora LIKE ? OR guiaPrestador LIKE ?)");
    const search = `%${filters.search}%`;
    params.push(search, search, search, search, search);
  }
  const where = clauses.join(" AND ");
  const offset = (filters.page - 1) * filters.pageSize;
  const accountCte = `SELECT estabelecimentoId, competencia, numeroConta, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio, MAX(pacienteNome) AS pacienteNome, MAX(carteiraBeneficiario) AS carteiraBeneficiario, MAX(guiaOperadora) AS guiaOperadora, MAX(guiaPrestador) AS guiaPrestador, COUNT(*) AS totalItens, SUM(valorFaturado) AS valorFaturado, SUM(valorTotalRecebido) AS valorRecebido, SUM(valorAberto) AS valorAberto, SUM(valorGlosa) AS valorGlosa FROM warleine_faturamento_itens_ativos WHERE ${where} GROUP BY estabelecimentoId,competencia,numeroConta,convenioChave`;
  const [[listRows], [summaryRows], [filterRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT * FROM (${accountCte}) contas ORDER BY competencia DESC, numeroConta DESC, convenio ASC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS totalContas, COALESCE(SUM(valorFaturado),0) AS valorFaturado, COALESCE(SUM(valorRecebido),0) AS valorRecebido, COALESCE(SUM(valorAberto),0) AS valorAberto, COALESCE(SUM(valorGlosa),0) AS valorGlosa FROM (${accountCte}) contas`, params),
    pool.query<RowDataPacket[]>(`SELECT competencia, ${CONVENIO_CHAVE_SQL} AS convenioChave, MAX(${CONVENIO_NOME_SQL}) AS convenio FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND ${ACTIVE} GROUP BY competencia,convenioChave ORDER BY competencia DESC, convenio`, [filters.estabelecimentoId]),
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
    })),
    total: n(summary.totalContas),
    resumo: { totalContas: n(summary.totalContas), valorFaturado: money(summary.valorFaturado), valorRecebido: money(summary.valorRecebido), valorAberto: money(summary.valorAberto), valorGlosa: money(summary.valorGlosa) },
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
  const [[rows], [countRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`
    SELECT id,codigoTuss,codigoItemInterno,servicoNome,tipoItem,quantidade,valorUnitario,valorFaturado,valorTotalRecebido,valorAberto,valorGlosa,codigoGlosa,motivoGlosa,dataAberturaConta,dataEntrada,dataAlta,prestadorExecutanteNome,setorNome
    FROM warleine_faturamento_itens_ativos
    WHERE estabelecimentoId=? AND ${ACTIVE} AND competencia=? AND numeroConta=? AND ${CONVENIO_CHAVE_SQL}=?
    ORDER BY id
    LIMIT ? OFFSET ?
  `, [estabelecimentoId, competencia, numeroConta, convenioChave, safePageSize, offset]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND ${ACTIVE} AND competencia=? AND numeroConta=? AND ${CONVENIO_CHAVE_SQL}=?`, [estabelecimentoId, competencia, numeroConta, convenioChave]),
  ]);
  return { items: rows.map((row) => ({
    id: Number(row.id), codigoTuss: String(row.codigoTuss || ""), codigoItemInterno: String(row.codigoItemInterno || ""), servicoNome: String(row.servicoNome || ""),
    tipoItem: String(row.tipoItem || ""), quantidade: n(row.quantidade), valorUnitario: money(row.valorUnitario), valorFaturado: money(row.valorFaturado),
    valorRecebido: money(row.valorTotalRecebido), valorAberto: money(row.valorAberto), valorGlosa: money(row.valorGlosa), codigoGlosa: String(row.codigoGlosa || ""),
    motivoGlosa: String(row.motivoGlosa || ""), dataAberturaConta: row.dataAberturaConta ? String(row.dataAberturaConta) : null,
    dataEntrada: row.dataEntrada ? String(row.dataEntrada) : null, dataAlta: row.dataAlta ? String(row.dataAlta) : null,
    prestadorExecutanteNome: String(row.prestadorExecutanteNome || ""), setorNome: String(row.setorNome || ""),
  })), total: n(countRows[0]?.total), page: safePage, pageSize: safePageSize };
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
