/**
 * Dashboard Samaritano - Backend
 * 
 * Fornece dados agregados para KPIs e gráficos de evolução mensal
 * por convênio, setor, custo, valor faturado, recebido e glosado.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

const SAMARITANO_ID = 2280016;

function extractRows(result: any): any[] {
  if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0])) {
    return result[0];
  }
  if (result && Array.isArray(result.rows)) {
    return result.rows;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

export async function buscarDashboardSamaritano(
  estabelecimentoId: number,
  filtros: { competencia?: string; convenio?: string; tipoAtend?: string; setor?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const baseWhere = `estabelecimentoId = ${SAMARITANO_ID}`;
  const conditions: string[] = [baseWhere];

  if (filtros.competencia) {
    conditions.push(`competencia = '${filtros.competencia.replace(/'/g, "''")}'`);
  }
  if (filtros.convenio) {
    conditions.push(`codplaco = '${filtros.convenio.replace(/'/g, "''")}'`);
  }
  if (filtros.tipoAtend) {
    conditions.push(`tipoatend = '${filtros.tipoAtend.replace(/'/g, "''")}'`);
  }
  if (filtros.setor) {
    conditions.push(`setor = '${filtros.setor.replace(/'/g, "''")}'`);
  }

  const whereClause = conditions.join(" AND ");

  // 1. KPIs gerais (agora com recebido e glosado)
  const kpisSql = `
    SELECT
      COUNT(*) as total_registros,
      COUNT(DISTINCT convenio) as total_convenios,
      COUNT(DISTINCT setor) as total_setores,
      COUNT(DISTINCT numconta) as total_contas,
      COUNT(DISTINCT codprod) as total_itens_unicos,
      ROUND(SUM(total_cobrado), 2) as total_faturado,
      ROUND(SUM(total_custo_estoque), 2) as total_custo,
      ROUND(SUM(total_vlcusto), 2) as total_vlcusto,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as total_recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as total_glosado,
      ROUND(SUM(total_cobrado) - SUM(total_custo_estoque), 2) as margem
    FROM samaritano_custo_staging
    WHERE ${whereClause}
  `;
  const kpisRaw = await db.execute(sql.raw(kpisSql));
  const kpisRow = extractRows(kpisRaw)[0] || {};

  const totalFaturado = Number(kpisRow.total_faturado || 0);
  const totalCusto = Number(kpisRow.total_custo || 0);
  const totalVlcusto = Number(kpisRow.total_vlcusto || 0);
  const custoEfetivo = totalCusto > 0 ? totalCusto : totalVlcusto;
  const margem = totalFaturado - custoEfetivo;
  const totalContas = Number(kpisRow.total_contas || 0);
  const ticketMedio = totalContas > 0 ? totalFaturado / totalContas : 0;
  const totalRecebido = Number(kpisRow.total_recebido || 0);
  const totalGlosado = Number(kpisRow.total_glosado || 0);

  const kpis = {
    totalRegistros: Number(kpisRow.total_registros || 0),
    totalConvenios: Number(kpisRow.total_convenios || 0),
    totalSetores: Number(kpisRow.total_setores || 0),
    totalContas,
    totalItensUnicos: Number(kpisRow.total_itens_unicos || 0),
    totalFaturado: Math.round(totalFaturado * 100) / 100,
    totalCusto: Math.round(custoEfetivo * 100) / 100,
    totalRecebido: Math.round(totalRecebido * 100) / 100,
    totalGlosado: Math.round(totalGlosado * 100) / 100,
    margem: Math.round(margem * 100) / 100,
    margemPercent: custoEfetivo > 0 ? Math.round((margem / custoEfetivo) * 10000) / 100 : 0,
    ticketMedio: Math.round(ticketMedio * 100) / 100,
    taxaRecebimento: totalFaturado > 0 ? Math.round((totalRecebido / totalFaturado) * 10000) / 100 : 0,
    taxaGlosa: totalFaturado > 0 ? Math.round((totalGlosado / totalFaturado) * 10000) / 100 : 0,
    perdaLiquida: Math.round((totalFaturado - totalRecebido) * 100) / 100,
  };

  // 2. Evolução mensal (Custo vs Faturado vs Recebido vs Glosado)
  const evolucaoSql = `
    SELECT
      competencia,
      COUNT(*) as total_registros,
      COUNT(DISTINCT numconta) as total_contas,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(total_vlcusto), 2) as vlcusto,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado,
      ROUND(SUM(total_cobrado) - SUM(total_custo_estoque), 2) as margem
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY competencia
    ORDER BY competencia
  `;
  const evolucaoRaw = await db.execute(sql.raw(evolucaoSql));
  const evolucaoRows = extractRows(evolucaoRaw);

  const evolucaoMensal = evolucaoRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const custo = Number(r.custo || 0);
    const vlcusto = Number(r.vlcusto || 0);
    const custoEf = custo > 0 ? custo : vlcusto;
    const margemVal = faturado - custoEf;
    const contas = Number(r.total_contas || 0);
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      competencia: r.competencia,
      faturado: Math.round(faturado * 100) / 100,
      custo: Math.round(custoEf * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round(margemVal * 100) / 100,
      margemPercent: custoEf > 0 ? Math.round((margemVal / custoEf) * 10000) / 100 : 0,
      totalContas: contas,
      ticketMedio: contas > 0 ? Math.round((faturado / contas) * 100) / 100 : 0,
      taxaRecebimento: faturado > 0 ? Math.round((recebido / faturado) * 10000) / 100 : 0,
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
    };
  });

  // 3. Top convênios por faturamento (com recebido e glosado)
  const topConveniosSql = `
    SELECT
      convenio,
      codplaco,
      COUNT(DISTINCT numconta) as total_contas,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(total_vlcusto), 2) as vlcusto,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY convenio, codplaco
    ORDER BY faturado DESC
    LIMIT 10
  `;
  const topConveniosRaw = await db.execute(sql.raw(topConveniosSql));
  const topConveniosRows = extractRows(topConveniosRaw);

  const topConvenios = topConveniosRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const custo = Number(r.custo || 0);
    const vlcusto = Number(r.vlcusto || 0);
    const custoEf = custo > 0 ? custo : vlcusto;
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      convenio: r.convenio,
      codplaco: r.codplaco,
      totalContas: Number(r.total_contas || 0),
      faturado: Math.round(faturado * 100) / 100,
      custo: Math.round(custoEf * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round((faturado - custoEf) * 100) / 100,
      margemPercent: custoEf > 0 ? Math.round(((faturado - custoEf) / custoEf) * 10000) / 100 : 0,
      taxaRecebimento: faturado > 0 ? Math.round((recebido / faturado) * 10000) / 100 : 0,
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
    };
  });

  // 4. Evolução por convênio (top 5 convênios por mês)
  const evolConvenioSql = `
    SELECT
      competencia,
      convenio,
      codplaco,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY competencia, convenio, codplaco
    ORDER BY competencia, faturado DESC
  `;
  const evolConvenioRaw = await db.execute(sql.raw(evolConvenioSql));
  const evolConvenioRows = extractRows(evolConvenioRaw);

  const evolConvenioMap = new Map<string, any[]>();
  for (const r of evolConvenioRows) {
    const comp = r.competencia;
    if (!evolConvenioMap.has(comp)) evolConvenioMap.set(comp, []);
    evolConvenioMap.get(comp)!.push({
      convenio: r.convenio,
      codplaco: r.codplaco,
      faturado: Math.round(Number(r.faturado || 0) * 100) / 100,
      custo: Math.round(Number(r.custo || 0) * 100) / 100,
      recebido: Math.round(Number(r.recebido || 0) * 100) / 100,
      glosado: Math.round(Number(r.glosado || 0) * 100) / 100,
    });
  }

  const evolucaoPorConvenio = Array.from(evolConvenioMap.entries()).map(([comp, convs]) => ({
    competencia: comp,
    convenios: convs,
  }));

  // 5. Top setores por custo (com recebido e glosado)
  const topSetoresSql = `
    SELECT
      setor,
      COUNT(DISTINCT numconta) as total_contas,
      COUNT(DISTINCT codprod) as total_itens,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(total_vlcusto), 2) as vlcusto,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY setor
    ORDER BY custo DESC
  `;
  const topSetoresRaw = await db.execute(sql.raw(topSetoresSql));
  const topSetoresRows = extractRows(topSetoresRaw);

  const topSetores = topSetoresRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const custo = Number(r.custo || 0);
    const vlcusto = Number(r.vlcusto || 0);
    const custoEf = custo > 0 ? custo : vlcusto;
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      setor: (r.setor || "Sem Setor").trim(),
      totalContas: Number(r.total_contas || 0),
      totalItens: Number(r.total_itens || 0),
      faturado: Math.round(faturado * 100) / 100,
      custo: Math.round(custoEf * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round((faturado - custoEf) * 100) / 100,
      margemPercent: custoEf > 0 ? Math.round(((faturado - custoEf) / custoEf) * 10000) / 100 : 0,
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
    };
  });

  // 6. Evolução por setor
  const evolSetorSql = `
    SELECT
      competencia,
      setor,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY competencia, setor
    ORDER BY competencia, faturado DESC
  `;
  const evolSetorRaw = await db.execute(sql.raw(evolSetorSql));
  const evolSetorRows = extractRows(evolSetorRaw);

  const evolSetorMap = new Map<string, any[]>();
  for (const r of evolSetorRows) {
    const comp = r.competencia;
    if (!evolSetorMap.has(comp)) evolSetorMap.set(comp, []);
    evolSetorMap.get(comp)!.push({
      setor: (r.setor || "Sem Setor").trim(),
      faturado: Math.round(Number(r.faturado || 0) * 100) / 100,
      custo: Math.round(Number(r.custo || 0) * 100) / 100,
      recebido: Math.round(Number(r.recebido || 0) * 100) / 100,
      glosado: Math.round(Number(r.glosado || 0) * 100) / 100,
    });
  }

  const evolucaoPorSetor = Array.from(evolSetorMap.entries()).map(([comp, setores]) => ({
    competencia: comp,
    setores,
  }));

  // 7. Distribuição por tipo de item (com recebido e glosado)
  const tipoItemSql = `
    SELECT
      codserv as tipo,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado,
      COUNT(*) as total_registros
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY codserv
    ORDER BY faturado DESC
  `;
  const tipoItemRaw = await db.execute(sql.raw(tipoItemSql));
  const tipoItemRows = extractRows(tipoItemRaw);

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

  const distribuicaoTipoItem = tipoItemRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const custo = Number(r.custo || 0);
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      tipo: r.tipo || "Outros",
      tipoLabel: TIPO_ITEM_LABEL[r.tipo] || r.tipo || "Outros",
      faturado: Math.round(faturado * 100) / 100,
      custo: Math.round(custo * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round((faturado - custo) * 100) / 100,
      totalRegistros: Number(r.total_registros || 0),
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
    };
  });

  // 8. Distribuição por tipo de atendimento (I/A/E)
  const tipoAtendSql = `
    SELECT
      tipoatend,
      COUNT(DISTINCT numconta) as total_contas,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(total_custo_estoque), 2) as custo,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY tipoatend
    ORDER BY faturado DESC
  `;
  const tipoAtendRaw = await db.execute(sql.raw(tipoAtendSql));
  const tipoAtendRows = extractRows(tipoAtendRaw);

  const TIPO_ATEND_LABEL: Record<string, string> = {
    I: "Internação",
    A: "Ambulatorial",
    E: "Emergência",
  };

  const distribuicaoTipoAtend = tipoAtendRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const custo = Number(r.custo || 0);
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      tipo: r.tipoatend || "Outros",
      tipoLabel: TIPO_ATEND_LABEL[r.tipoatend] || r.tipoatend || "Outros",
      totalContas: Number(r.total_contas || 0),
      faturado: Math.round(faturado * 100) / 100,
      custo: Math.round(custo * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      margem: Math.round((faturado - custo) * 100) / 100,
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
      taxaRecebimento: faturado > 0 ? Math.round((recebido / faturado) * 10000) / 100 : 0,
    };
  });

  // 9. Glosa por convênio (ranking de glosa)
  const glosaConvenioSql = `
    SELECT
      convenio,
      codplaco,
      ROUND(SUM(total_cobrado), 2) as faturado,
      ROUND(SUM(COALESCE(recebido, 0)), 2) as recebido,
      ROUND(SUM(COALESCE(valor_glosada, 0)), 2) as glosado,
      COUNT(DISTINCT numconta) as total_contas
    FROM samaritano_custo_staging
    WHERE ${whereClause}
    GROUP BY convenio, codplaco
    HAVING SUM(COALESCE(valor_glosada, 0)) > 0
    ORDER BY glosado DESC
    LIMIT 10
  `;
  const glosaConvenioRaw = await db.execute(sql.raw(glosaConvenioSql));
  const glosaConvenioRows = extractRows(glosaConvenioRaw);

  const glosasPorConvenio = glosaConvenioRows.map((r: any) => {
    const faturado = Number(r.faturado || 0);
    const recebido = Number(r.recebido || 0);
    const glosado = Number(r.glosado || 0);
    return {
      convenio: r.convenio,
      codplaco: r.codplaco,
      totalContas: Number(r.total_contas || 0),
      faturado: Math.round(faturado * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      glosado: Math.round(glosado * 100) / 100,
      taxaGlosa: faturado > 0 ? Math.round((glosado / faturado) * 10000) / 100 : 0,
      perda: Math.round((faturado - recebido) * 100) / 100,
    };
  });

  // 10. Competências e convênios e setores disponíveis para filtros
  const compRaw = await db.execute(
    sql.raw(`SELECT DISTINCT competencia FROM samaritano_custo_staging WHERE ${baseWhere} AND competencia IS NOT NULL ORDER BY competencia DESC`)
  );
  const competenciasDisponiveis = extractRows(compRaw).map((r: any) => r.competencia);

  const conveniosRaw = await db.execute(
    sql.raw(`SELECT DISTINCT convenio, codplaco FROM samaritano_custo_staging WHERE ${baseWhere} ORDER BY convenio`)
  );
  const conveniosDisponiveis = extractRows(conveniosRaw).map((r: any) => ({
    codplaco: r.codplaco,
    nome: r.convenio,
  }));

  const setoresRaw = await db.execute(
    sql.raw(`SELECT DISTINCT setor FROM samaritano_custo_staging WHERE ${baseWhere} AND setor IS NOT NULL AND setor != '' ORDER BY setor`)
  );
  const setoresDisponiveis = extractRows(setoresRaw).map((r: any) => r.setor);

  const tiposAtendRaw = await db.execute(
    sql.raw(`SELECT DISTINCT tipoatend FROM samaritano_custo_staging WHERE ${baseWhere} AND tipoatend IS NOT NULL ORDER BY tipoatend`)
  );
  const tiposAtendDisponiveis = extractRows(tiposAtendRaw).map((r: any) => ({
    codigo: r.tipoatend,
    label: TIPO_ATEND_LABEL[r.tipoatend] || r.tipoatend,
  }));

  return {
    kpis,
    evolucaoMensal,
    topConvenios,
    evolucaoPorConvenio,
    topSetores,
    evolucaoPorSetor,
    distribuicaoTipoItem,
    distribuicaoTipoAtend,
    glosasPorConvenio,
    competenciasDisponiveis,
    conveniosDisponiveis,
    setoresDisponiveis,
    tiposAtendDisponiveis,
    fonte: "samaritano_custo_staging",
  };
}
