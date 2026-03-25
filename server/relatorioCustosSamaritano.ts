/**
 * Relatório de Custos - Hospital Samaritano
 * 
 * Consulta dados da tabela samaritano_custo_staging (MySQL)
 * ao invés do PostgreSQL Warleine (que é do Hemolabor).
 * 
 * Retorna as mesmas interfaces do relatorioCustos.ts para compatibilidade
 * com o frontend existente.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ID do estabelecimento Samaritano
const SAMARITANO_ID = 2280016;

/**
 * Helper: db.execute(sql.raw(...)) no MySQL/Drizzle retorna [rows, fields].
 * Esta função extrai as rows de forma segura.
 */
function extractRows(result: any): any[] {
  // MySQL2 + Drizzle: result = [rows, fields]
  if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0])) {
    return result[0];
  }
  // Caso já seja { rows: [...] } (PostgreSQL style)
  if (result && Array.isArray(result.rows)) {
    return result.rows;
  }
  // Caso já seja um array direto
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

// Tipo de atendimento labels
const TIPO_ATEND_LABEL: Record<string, string> = {
  I: "Internação",
  A: "Ambulatorial",
  E: "Emergência",
};

const TIPO_ITEM_LABEL: Record<string, string> = {
  IC: "Internação Clínica",
  IG: "Internação Cirúrgica",
  BH: "Banco de Horas",
  BO: "Bloco",
  CO: "Consulta",
  EX: "Exame",
  PQ: "Pequena Cirurgia",
  PR: "Procedimento",
  RE: "Reembolso",
  SV: "Serviço",
};

// ============================================================
// CUSTOS POR CONVÊNIO - Samaritano
// ============================================================

export async function buscarCustosPorConvenioSamaritano(
  estabelecimentoId: number,
  filtros: { convenio?: string; tipoItem?: string; competencia?: string; busca?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  // Build WHERE conditions
  const conditions: string[] = [`estabelecimentoId = ${SAMARITANO_ID}`];

  if (filtros.competencia) {
    conditions.push(`competencia = '${filtros.competencia.replace(/'/g, "''")}'`);
  }

  if (filtros.convenio) {
    conditions.push(`codplaco = '${filtros.convenio.replace(/'/g, "''")}'`);
  }

  if (filtros.tipoItem) {
    conditions.push(`codserv = '${filtros.tipoItem.replace(/'/g, "''")}'`);
  }

  if (filtros.busca) {
    const b = filtros.busca.replace(/'/g, "''");
    conditions.push(`(descricao LIKE '%${b}%' OR codprod LIKE '%${b}%')`);
  }

  const whereClause = conditions.join(" AND ");

  // 1. Convênios disponíveis
  const conveniosRaw = await db.execute(
    sql.raw(`SELECT DISTINCT convenio, codplaco FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} ORDER BY convenio`)
  );
  const conveniosDisponiveis = extractRows(conveniosRaw).map((r: any) => ({
    codplaco: r.codplaco || r.convenio,
    nome: r.convenio,
  }));

  // 2. Competências disponíveis
  const compRaw = await db.execute(
    sql.raw(`SELECT DISTINCT competencia FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} AND competencia IS NOT NULL ORDER BY competencia DESC`)
  );
  const competenciasDisponiveis = extractRows(compRaw).map((r: any) => r.competencia);

  // 3. Itens detalhados por convênio
  const detalhadoSql = `
    SELECT
      codprod,
      descricao,
      codserv as tipoitem,
      convenio,
      codplaco,
      SUM(total_itens) as total_quantidade,
      SUM(total_cobrado) as total_cobrado,
      SUM(total_vlcusto) as total_vlcusto,
      SUM(total_custo_estoque) as total_custo_estoque,
      SUM(COALESCE(recebido, 0)) as total_recebido,
      SUM(COALESCE(valor_glosada, 0)) as total_glosado,
      COUNT(*) as num_lancamentos
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY codprod, descricao, codserv, convenio, codplaco
    ORDER BY total_cobrado DESC
    LIMIT 1000
  `;
  const detalhadoResultRaw = await db.execute(sql.raw(detalhadoSql));
  const detalhadoRows = extractRows(detalhadoResultRaw);

  const itensDetalhados = detalhadoRows.map((row: any) => {
    const quantidade = Number(row.total_quantidade || 0);
    const valorCobradoTotal = Number(row.total_cobrado || 0);
    const vlcusto = Number(row.total_vlcusto || 0);
    const custoEstoque = Number(row.total_custo_estoque || 0);
    const custoTotal = custoEstoque > 0 ? custoEstoque : vlcusto;
    const recebido = Number(row.total_recebido || 0);
    const glosado = Number(row.total_glosado || 0);
    const margem = valorCobradoTotal - custoTotal;
    const custoUnitario = quantidade > 0 ? custoTotal / quantidade : 0;
    const valorCobradoUnitario = quantidade > 0 ? valorCobradoTotal / quantidade : 0;

    return {
      codprod: String(row.codprod || ""),
      descricao: (row.descricao || "").trim(),
      tipoItem: row.tipoitem || "PR",
      tipoItemLabel: TIPO_ITEM_LABEL[row.tipoitem] || row.tipoitem || "Outros",
      convenio: row.convenio || "Sem Convênio",
      codplaco: row.codplaco || "",
      unidade: "UN",
      quantidade: Math.round(quantidade * 100) / 100,
      custoUnitario: Math.round(custoUnitario * 100) / 100,
      custoTotal: Math.round(custoTotal * 100) / 100,
      valorCobradoUnitario: Math.round(valorCobradoUnitario * 100) / 100,
      valorCobradoTotal: Math.round(valorCobradoTotal * 100) / 100,
      vlcusto: Math.round(vlcusto * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    };
  });

  // 4. Itens agrupados por produto
  const itensMap = new Map<string, any>();
  let totalItensSemCusto = 0;
  let valorFaturadoTotal = 0;
  let custoTotalGeral = 0;
  let recebidoTotalGeral = 0;
  let glosadoTotalGeral = 0;

  for (const item of itensDetalhados) {
    valorFaturadoTotal += item.valorCobradoTotal;
    custoTotalGeral += item.custoTotal;
    recebidoTotalGeral += item.recebido;
    glosadoTotalGeral += item.glosado;

    if (item.custoTotal === 0 && item.vlcusto === 0) {
      totalItensSemCusto++;
    }

    if (!itensMap.has(item.codprod)) {
      itensMap.set(item.codprod, {
        codprod: item.codprod,
        descricao: item.descricao,
        tipoItem: item.tipoItem,
        custoEstoque: item.custoUnitario,
        convenios: [],
      });
    }

    itensMap.get(item.codprod)!.convenios.push({
      convenio: item.convenio,
      codplaco: item.codplaco,
      quantidade: item.quantidade,
      valorCobrado: item.valorCobradoTotal,
      vlcusto: item.vlcusto,
      custoTotal: item.custoTotal,
      recebido: item.recebido,
      glosado: item.glosado,
      margem: item.margem,
      resultado: item.resultado,
    });
  }

  const itens = Array.from(itensMap.values())
    .sort((a, b) => {
      const totalA = a.convenios.reduce((s: number, c: any) => s + c.valorCobrado, 0);
      const totalB = b.convenios.reduce((s: number, c: any) => s + c.valorCobrado, 0);
      return totalB - totalA;
    })
    .slice(0, 200);

  // 5. Resumo por convênio
  const resumoSql = `
    SELECT
      convenio,
      codplaco,
      COUNT(*) as total_lancamentos,
      SUM(total_cobrado) as total_faturado,
      SUM(total_vlcusto) as total_vlcusto,
      SUM(total_custo_estoque) as total_custo_estoque,
      SUM(COALESCE(recebido, 0)) as total_recebido,
      SUM(COALESCE(valor_glosada, 0)) as total_glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY convenio, codplaco
    ORDER BY total_faturado DESC
  `;
  const resumoResultRaw = await db.execute(sql.raw(resumoSql));
  const resumoRows = extractRows(resumoResultRaw);

  const resumoPorConvenio = resumoRows.map((r: any) => {
    const totalFaturado = Number(r.total_faturado || 0);
    const totalCustoEstoque = Number(r.total_custo_estoque || 0);
    const totalVlcusto = Number(r.total_vlcusto || 0);
    const totalCusto = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
    const totalRecebido = Number(r.total_recebido || 0);
    const totalGlosado = Number(r.total_glosado || 0);
    const margem = totalFaturado - totalCusto;
    return {
      convenio: r.convenio || "Sem Convênio",
      codplaco: r.codplaco || "",
      totalLancamentos: Number(r.total_lancamentos || 0),
      totalFaturado: Math.round(totalFaturado * 100) / 100,
      totalCusto: Math.round(totalCusto * 100) / 100,
      totalRecebido: Math.round(totalRecebido * 100) / 100,
      totalGlosado: Math.round(totalGlosado * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      margemPercent: totalCusto > 0 ? Math.round((margem / totalCusto) * 10000) / 100 : 0,
      taxaRecebimento: totalFaturado > 0 ? Math.round((totalRecebido / totalFaturado) * 10000) / 100 : 0,
      taxaGlosa: totalFaturado > 0 ? Math.round((totalGlosado / totalFaturado) * 10000) / 100 : 0,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    };
  });

  // Top itens
  const todosItensConvenio: any[] = [];
  for (const item of itensMap.values()) {
    for (const conv of item.convenios) {
      todosItensConvenio.push({
        codprod: item.codprod,
        descricao: item.descricao,
        convenio: conv.convenio,
        quantidade: conv.quantidade,
        valorCobrado: conv.valorCobrado,
        custoTotal: conv.custoTotal,
        recebido: conv.recebido,
        glosado: conv.glosado,
        margem: conv.margem,
      });
    }
  }

  const topItensPrejuizo = todosItensConvenio
    .filter((i) => i.margem < -0.01)
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 20);

  const topItensLucro = todosItensConvenio
    .filter((i) => i.margem > 0.01)
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 20);

  const margemTotal = valorFaturadoTotal - custoTotalGeral;

  return {
    itensDetalhados,
    totalItensDetalhados: itensDetalhados.length,
    itens,
    totalItens: itensMap.size,
    resumoPorConvenio,
    kpis: {
      totalConvenios: resumoPorConvenio.length,
      totalItensAnalisados: itensDetalhados.length,
      totalItensSemCusto,
      valorFaturadoTotal: Math.round(valorFaturadoTotal * 100) / 100,
      custoTotal: Math.round(custoTotalGeral * 100) / 100,
      recebidoTotal: Math.round(recebidoTotalGeral * 100) / 100,
      glosadoTotal: Math.round(glosadoTotalGeral * 100) / 100,
      margemTotal: Math.round(margemTotal * 100) / 100,
      margemMediaPercent: custoTotalGeral > 0
        ? Math.round((margemTotal / custoTotalGeral) * 10000) / 100
        : 0,
      taxaRecebimento: valorFaturadoTotal > 0
        ? Math.round((recebidoTotalGeral / valorFaturadoTotal) * 10000) / 100
        : 0,
      taxaGlosa: valorFaturadoTotal > 0
        ? Math.round((glosadoTotalGeral / valorFaturadoTotal) * 10000) / 100
        : 0,
    },
    topItensPrejuizo,
    topItensLucro,
    conveniosDisponiveis,
    competenciasDisponiveis,
    fonte: "samaritano_custo_staging",
  };
}

// ============================================================
// CUSTOS POR CONTA - Samaritano
// ============================================================

export async function buscarCustosPorContaSamaritano(
  estabelecimentoId: number,
  filtros: { convenio?: string; competencia?: string; busca?: string; setor?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const conditions: string[] = [`estabelecimentoId = ${SAMARITANO_ID}`];

  if (filtros.competencia) {
    conditions.push(`competencia = '${filtros.competencia.replace(/'/g, "''")}'`);
  }

  if (filtros.convenio) {
    conditions.push(`codplaco = '${filtros.convenio.replace(/'/g, "''")}'`);
  }

  if (filtros.setor) {
    conditions.push(`setor = '${filtros.setor.replace(/'/g, "''")}'`);
  }

  if (filtros.busca) {
    const b = filtros.busca.replace(/'/g, "''");
    conditions.push(`(CAST(numconta AS CHAR) LIKE '%${b}%' OR nome LIKE '%${b}%')`);
  }

  const whereClause = conditions.join(" AND ");

  // Convênios disponíveis
  const conveniosRaw = await db.execute(
    sql.raw(`SELECT DISTINCT convenio, codplaco FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} ORDER BY convenio`)
  );
  const conveniosDisponiveis = extractRows(conveniosRaw).map((r: any) => ({
    codplaco: r.codplaco || r.convenio,
    nome: r.convenio,
  }));

  // Competências disponíveis
  const compRaw = await db.execute(
    sql.raw(`SELECT DISTINCT competencia FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} AND competencia IS NOT NULL ORDER BY competencia DESC`)
  );
  const competenciasDisponiveis = extractRows(compRaw).map((r: any) => r.competencia);

  // Setores disponíveis
  const setoresRaw = await db.execute(
    sql.raw(`SELECT DISTINCT setor FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} AND setor IS NOT NULL AND setor != '' ORDER BY setor`)
  );
  const setoresDisponiveis = extractRows(setoresRaw).map((r: any) => r.setor);

  // Contas agrupadas
  const mainSql = `
    SELECT
      numconta,
      nome as paciente,
      convenio,
      codplaco,
      MIN(data_execucao) as data_execucao,
      SUM(total_itens) as total_itens,
      SUM(total_cobrado) as total_cobrado,
      SUM(total_vlcusto) as total_vlcusto,
      SUM(total_custo_estoque) as total_custo_estoque,
      SUM(COALESCE(recebido, 0)) as total_recebido,
      SUM(COALESCE(valor_glosada, 0)) as total_glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY numconta, nome, convenio, codplaco
    ORDER BY total_cobrado DESC
    LIMIT 500
  `;
  const mainResultRaw = await db.execute(sql.raw(mainSql));
  const mainRows = extractRows(mainResultRaw);

  let custoTotalGeral = 0;
  let valorCobradoGeral = 0;
  let recebidoTotalGeral = 0;
  let glosadoTotalGeral = 0;
  let contasComLucro = 0;
  let contasComPrejuizo = 0;
  let totalItensGeral = 0;

  const contas = mainRows.map((row: any) => {
    const totalCobrado = Number(row.total_cobrado || 0);
    const totalCustoEstoque = Number(row.total_custo_estoque || 0);
    const totalVlcusto = Number(row.total_vlcusto || 0);
    const custoTotal = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
    const recebido = Number(row.total_recebido || 0);
    const glosado = Number(row.total_glosado || 0);
    const margem = totalCobrado - custoTotal;
    const totalItens = Number(row.total_itens || 0);

    custoTotalGeral += custoTotal;
    valorCobradoGeral += totalCobrado;
    recebidoTotalGeral += recebido;
    glosadoTotalGeral += glosado;
    totalItensGeral += totalItens;
    if (margem > 0.01) contasComLucro++;
    if (margem < -0.01) contasComPrejuizo++;

    return {
      numconta: String(row.numconta),
      paciente: (row.paciente || "").trim(),
      convenio: row.convenio || "Sem Convênio",
      codplaco: row.codplaco || "",
      dataExecucao: row.data_execucao ? String(row.data_execucao).substring(0, 10) : "",
      totalItens,
      custoTotal: Math.round(custoTotal * 100) / 100,
      valorCobrado: Math.round(totalCobrado * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      margemPercent: custoTotal > 0 ? Math.round((margem / custoTotal) * 10000) / 100 : 0,
      taxaRecebimento: totalCobrado > 0 ? Math.round((recebido / totalCobrado) * 10000) / 100 : 0,
      taxaGlosa: totalCobrado > 0 ? Math.round((glosado / totalCobrado) * 10000) / 100 : 0,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    };
  });

  const margemGeral = valorCobradoGeral - custoTotalGeral;

  const topContasPrejuizo = [...contas]
    .filter(c => c.resultado === "prejuizo")
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 20);

  const topContasLucro = [...contas]
    .filter(c => c.resultado === "lucro")
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 20);

  return {
    contas,
    totalContas: contas.length,
    kpis: {
      totalContas: contas.length,
      totalItens: totalItensGeral,
      custoTotalGeral: Math.round(custoTotalGeral * 100) / 100,
      valorCobradoGeral: Math.round(valorCobradoGeral * 100) / 100,
      recebidoTotalGeral: Math.round(recebidoTotalGeral * 100) / 100,
      glosadoTotalGeral: Math.round(glosadoTotalGeral * 100) / 100,
      margemGeral: Math.round(margemGeral * 100) / 100,
      margemMediaPercent: custoTotalGeral > 0
        ? Math.round((margemGeral / custoTotalGeral) * 10000) / 100
        : 0,
      taxaRecebimento: valorCobradoGeral > 0
        ? Math.round((recebidoTotalGeral / valorCobradoGeral) * 10000) / 100
        : 0,
      taxaGlosa: valorCobradoGeral > 0
        ? Math.round((glosadoTotalGeral / valorCobradoGeral) * 10000) / 100
        : 0,
      contasComLucro,
      contasComPrejuizo,
    },
    topContasPrejuizo,
    topContasLucro,
    conveniosDisponiveis,
    competenciasDisponiveis,
    setoresDisponiveis,
    fonte: "samaritano_custo_staging",
  };
}

// ============================================================
// DETALHE CONTA CUSTO - Samaritano
// ============================================================

export async function buscarDetalheContaCustoSamaritano(
  estabelecimentoId: number,
  numconta: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const itensSql = `
    SELECT
      codprod,
      descricao,
      codserv as tipoitem,
      nome as paciente,
      convenio,
      codplaco,
      setor,
      data_execucao,
      total_itens as quantidade,
      total_cobrado,
      total_vlcusto,
      total_custo_estoque,
      COALESCE(recebido, 0) as recebido,
      COALESCE(valor_glosada, 0) as valor_glosada
    FROM samaritano_custo_staging
    WHERE numconta = ${numconta} AND estabelecimentoId = ${SAMARITANO_ID}
    ORDER BY descricao
  `;
  const itensResultRaw = await db.execute(sql.raw(itensSql));
  const itensRows = extractRows(itensResultRaw);

  if (itensRows.length === 0) return null;

  let custoTotal = 0;
  let valorCobrado = 0;
  let recebidoTotal = 0;
  let glosadoTotal = 0;
  let itensPrejuizo = 0;
  let itensLucro = 0;
  let itensSemCusto = 0;
  let paciente = "";
  let convenio = "";
  let codplaco = "";
  let dataExecucao = "";

  const itens = itensRows.map((row: any) => {
    const quantidade = Number(row.quantidade || 0);
    const vltotreais = Number(row.total_cobrado || 0);
    const vlcusto = Number(row.total_vlcusto || 0);
    const custoEstoque = Number(row.total_custo_estoque || 0);
    const custoItem = custoEstoque > 0 ? custoEstoque : vlcusto;
    const recebidoItem = Number(row.recebido || 0);
    const glosadoItem = Number(row.valor_glosada || 0);
    const margem = vltotreais - custoItem;
    const custoUnitario = quantidade > 0 ? custoItem / quantidade : 0;
    const valorCobradoUnitario = quantidade > 0 ? vltotreais / quantidade : 0;

    custoTotal += custoItem;
    valorCobrado += vltotreais;
    recebidoTotal += recebidoItem;
    glosadoTotal += glosadoItem;
    if (margem > 0.01) itensLucro++;
    if (margem < -0.01) itensPrejuizo++;
    if (custoItem === 0) itensSemCusto++;

    if (!paciente) paciente = (row.paciente || "").trim();
    if (!convenio) convenio = row.convenio || "Sem Convênio";
    if (!codplaco) codplaco = row.codplaco || "";
    if (!dataExecucao && row.data_execucao) dataExecucao = String(row.data_execucao).substring(0, 10);

    return {
      codprod: String(row.codprod || ""),
      descricao: (row.descricao || "").trim(),
      tipoItem: row.tipoitem || "PR",
      tipoItemLabel: TIPO_ITEM_LABEL[row.tipoitem] || row.tipoitem || "Outros",
      setor: (row.setor || "Sem Setor").trim(),
      unidade: "UN",
      quantidade: Math.round(quantidade * 100) / 100,
      custoUnitario: Math.round(custoUnitario * 100) / 100,
      custoTotal: Math.round(custoItem * 100) / 100,
      valorCobradoUnitario: Math.round(valorCobradoUnitario * 100) / 100,
      valorCobradoTotal: Math.round(vltotreais * 100) / 100,
      recebido: Math.round(recebidoItem * 100) / 100,
      glosado: Math.round(glosadoItem * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    };
  });

  const margem = valorCobrado - custoTotal;

  return {
    numconta,
    paciente,
    convenio,
    codplaco,
    dataExecucao,
    itens,
    totalItens: itens.length,
    custoTotal: Math.round(custoTotal * 100) / 100,
    valorCobrado: Math.round(valorCobrado * 100) / 100,
    recebido: Math.round(recebidoTotal * 100) / 100,
    glosado: Math.round(glosadoTotal * 100) / 100,
    margem: Math.round(margem * 100) / 100,
    margemPercent: custoTotal > 0 ? Math.round((margem / custoTotal) * 10000) / 100 : 0,
    taxaRecebimento: valorCobrado > 0 ? Math.round((recebidoTotal / valorCobrado) * 10000) / 100 : 0,
    taxaGlosa: valorCobrado > 0 ? Math.round((glosadoTotal / valorCobrado) * 10000) / 100 : 0,
    resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    itensPrejuizo,
    itensLucro,
    itensSemCusto,
  };
}

// ============================================================
// CUSTOS POR SETOR - Samaritano
// ============================================================

export async function buscarCustosPorSetorSamaritano(
  estabelecimentoId: number,
  filtros: { setor?: string; convenio?: string; competencia?: string; busca?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const conditions: string[] = [`estabelecimentoId = ${SAMARITANO_ID}`];

  if (filtros.competencia) {
    conditions.push(`competencia = '${filtros.competencia.replace(/'/g, "''")}'`);
  }

  if (filtros.convenio) {
    conditions.push(`codplaco = '${filtros.convenio.replace(/'/g, "''")}'`);
  }

  if (filtros.setor) {
    conditions.push(`setor = '${filtros.setor.replace(/'/g, "''")}'`);
  }

  if (filtros.busca) {
    const b = filtros.busca.replace(/'/g, "''");
    conditions.push(`(descricao LIKE '%${b}%' OR codprod LIKE '%${b}%')`);
  }

  const whereClause = conditions.join(" AND ");

  // Convênios disponíveis
  const conveniosRaw = await db.execute(
    sql.raw(`SELECT DISTINCT convenio, codplaco FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} ORDER BY convenio`)
  );
  const conveniosDisponiveis = extractRows(conveniosRaw).map((r: any) => ({
    codplaco: r.codplaco || r.convenio,
    nome: r.convenio,
  }));

  // Competências disponíveis
  const compRaw = await db.execute(
    sql.raw(`SELECT DISTINCT competencia FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} AND competencia IS NOT NULL ORDER BY competencia DESC`)
  );
  const competenciasDisponiveis = extractRows(compRaw).map((r: any) => r.competencia);

  // Setores disponíveis
  const setoresRaw = await db.execute(
    sql.raw(`SELECT DISTINCT setor FROM samaritano_custo_staging WHERE estabelecimentoId = ${SAMARITANO_ID} AND setor IS NOT NULL ORDER BY setor`)
  );
  const setoresDisponiveis = extractRows(setoresRaw).map((r: any) => r.setor);

  // Resumo por setor
  const resumoSql = `
    SELECT
      setor,
      COUNT(*) as total_lancamentos,
      COUNT(DISTINCT codprod) as total_itens,
      COUNT(DISTINCT numconta) as total_contas,
      SUM(total_cobrado) as total_faturado,
      SUM(total_vlcusto) as total_vlcusto,
      SUM(total_custo_estoque) as total_custo_estoque
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY setor
    ORDER BY total_faturado DESC
  `;
  const resumoResultRaw = await db.execute(sql.raw(resumoSql));
  const resumoRows = extractRows(resumoResultRaw);

  // Top itens por setor
  const topItensSql = `
    SELECT
      setor,
      descricao,
      SUM(total_itens) as quantidade,
      SUM(total_custo_estoque) as custo_total,
      SUM(total_cobrado) as valor_cobrado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY setor, descricao
    ORDER BY custo_total DESC
  `;
  const topItensResultRaw = await db.execute(sql.raw(topItensSql));
  const topItensRows = extractRows(topItensResultRaw);

  const topItensPorSetorMap = new Map<string, any[]>();
  for (const row of topItensRows) {
    const setor = row.setor || "Sem Setor";
    const custoTotal = Number(row.custo_total || 0);
    const valorCobrado = Number(row.valor_cobrado || 0);
    if (!topItensPorSetorMap.has(setor)) {
      topItensPorSetorMap.set(setor, []);
    }
    const arr = topItensPorSetorMap.get(setor)!;
    if (arr.length < 5) {
      arr.push({
        descricao: (row.descricao || "").trim(),
        quantidade: Number(row.quantidade || 0),
        custoTotal: Math.round(custoTotal * 100) / 100,
        valorCobrado: Math.round(valorCobrado * 100) / 100,
        margem: Math.round((valorCobrado - custoTotal) * 100) / 100,
      });
    }
  }

  let valorFaturadoTotal = 0;
  let custoTotalGeral = 0;
  let setoresComLucro = 0;
  let setoresComPrejuizo = 0;
  let totalLancamentos = 0;

  const resumoPorSetor = resumoRows.map((r: any) => {
    const setor = r.setor || "Sem Setor";
    const totalFaturado = Number(r.total_faturado || 0);
    const totalCustoEstoque = Number(r.total_custo_estoque || 0);
    const totalVlcusto = Number(r.total_vlcusto || 0);
    const totalCusto = totalCustoEstoque > 0 ? totalCustoEstoque : totalVlcusto;
    const margem = totalFaturado - totalCusto;
    const lancamentos = Number(r.total_lancamentos || 0);

    valorFaturadoTotal += totalFaturado;
    custoTotalGeral += totalCusto;
    totalLancamentos += lancamentos;

    if (margem > 0.01) setoresComLucro++;
    if (margem < -0.01) setoresComPrejuizo++;

    return {
      setor,
      totalLancamentos: lancamentos,
      totalItens: Number(r.total_itens || 0),
      totalContas: Number(r.total_contas || 0),
      totalFaturado: Math.round(totalFaturado * 100) / 100,
      totalCusto: Math.round(totalCusto * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      margemPercent: totalCusto > 0 ? Math.round((margem / totalCusto) * 10000) / 100 : 0,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
      topItens: topItensPorSetorMap.get(setor) || [],
    };
  });

  // Itens detalhados
  const detalhadoSql = `
    SELECT
      codprod,
      descricao,
      codserv as tipoitem,
      setor,
      SUM(total_itens) as total_quantidade,
      SUM(total_cobrado) as total_cobrado,
      SUM(total_vlcusto) as total_vlcusto,
      SUM(total_custo_estoque) as total_custo_estoque,
      COUNT(*) as num_lancamentos
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY codprod, descricao, codserv, setor
    ORDER BY total_cobrado DESC
    LIMIT 1000
  `;
  const detalhadoResultRaw = await db.execute(sql.raw(detalhadoSql));
  const detalhadoRows = extractRows(detalhadoResultRaw);

  const itensDetalhados = detalhadoRows.map((row: any) => {
    const quantidade = Number(row.total_quantidade || 0);
    const valorCobradoTotal = Number(row.total_cobrado || 0);
    const vlcusto = Number(row.total_vlcusto || 0);
    const custoEstoque = Number(row.total_custo_estoque || 0);
    const custoTotal = custoEstoque > 0 ? custoEstoque : vlcusto;
    const margem = valorCobradoTotal - custoTotal;
    const custoUnitario = quantidade > 0 ? custoTotal / quantidade : 0;
    const valorCobradoUnitario = quantidade > 0 ? valorCobradoTotal / quantidade : 0;
    const tipoItem = row.tipoitem || "PR";

    return {
      codprod: String(row.codprod || ""),
      descricao: (row.descricao || "").trim(),
      tipoItem,
      tipoItemLabel: TIPO_ITEM_LABEL[tipoItem] || tipoItem || "Outros",
      setor: row.setor || "Sem Setor",
      unidade: "UN",
      quantidade: Math.round(quantidade * 100) / 100,
      custoUnitario: Math.round(custoUnitario * 100) / 100,
      custoTotal: Math.round(custoTotal * 100) / 100,
      valorCobradoUnitario: Math.round(valorCobradoUnitario * 100) / 100,
      valorCobradoTotal: Math.round(valorCobradoTotal * 100) / 100,
      margem: Math.round(margem * 100) / 100,
      resultado: margem > 0.01 ? "lucro" as const : margem < -0.01 ? "prejuizo" as const : "empate" as const,
    };
  });

  const topSetoresPrejuizo = [...resumoPorSetor]
    .filter((s) => s.margem < -0.01)
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 10);

  const topSetoresLucro = [...resumoPorSetor]
    .filter((s) => s.margem > 0.01)
    .sort((a, b) => b.margem - a.margem)
    .slice(0, 10);

  const margemTotal = valorFaturadoTotal - custoTotalGeral;

  return {
    resumoPorSetor,
    itensDetalhados,
    totalItensDetalhados: itensDetalhados.length,
    kpis: {
      totalSetores: resumoPorSetor.length,
      totalLancamentos,
      valorFaturadoTotal: Math.round(valorFaturadoTotal * 100) / 100,
      custoTotal: Math.round(custoTotalGeral * 100) / 100,
      margemTotal: Math.round(margemTotal * 100) / 100,
      margemMediaPercent: custoTotalGeral > 0
        ? Math.round((margemTotal / custoTotalGeral) * 10000) / 100
        : 0,
      setoresComLucro,
      setoresComPrejuizo,
    },
    topSetoresPrejuizo,
    topSetoresLucro,
    setoresDisponiveis,
    conveniosDisponiveis,
    competenciasDisponiveis,
    fonte: "samaritano_custo_staging",
  };
}
