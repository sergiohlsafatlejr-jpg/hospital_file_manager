/**
 * BI Faturado x Recebido - UNIFICADO
 * Fonte principal: contas_convenio_itens (JOIN com contas_convenio_resumo para competência)
 * Cruza com recebimentos_excel para dados de recebimento/glosa
 * Agrupando por procedimento, mês, convênio, setor, tipo de item e prestador
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ============================================================
// INTERFACES
// ============================================================

export interface FiltrosUnificado {
  estabelecimentoId: number;
  competencias?: string[];
  convenios?: string[];
  tipoItem?: string;
  setor?: string;
  origemSistema?: string; // XML, BANCO_CLIENTE, ou undefined = todos
  prestador?: string;
}

export interface ProcedimentoResumo {
  codigoItem: string;
  descricaoItem: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
  taxaRecebimento: number;
  taxaGlosa: number;
}

export interface MesResumo {
  competencia: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
}

export interface ConvenioResumo {
  convenio: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
}

export interface SetorResumo {
  setor: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
}

export interface TipoItemResumo {
  tipoItem: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
  taxaRecebimento: number;
  taxaGlosa: number;
}

export interface PrestadorResumo {
  prestador: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  totalPendente: number;
  quantidade: number;
  taxaRecebimento: number;
  taxaGlosa: number;
}

export interface ResultadoUnificado {
  resumo: {
    totalFaturado: number;
    totalRecebido: number;
    totalGlosado: number;
    totalPendente: number;
    totalItens: number;
    totalContas: number;
    taxaRecebimento: number;
    taxaGlosa: number;
    ticketMedio: number;
  };
  porProcedimento: ProcedimentoResumo[];
  porMes: MesResumo[];
  porConvenio: ConvenioResumo[];
  porSetor: SetorResumo[];
  porTipoItem: TipoItemResumo[];
  porPrestador: PrestadorResumo[];
  filtrosDisponiveis: {
    competencias: string[];
    convenios: string[];
    setores: string[];
    tiposItem: string[];
    origens: string[];
    prestadores: string[];
  };
}

// ============================================================
// HELPERS
// ============================================================

function normalizarCompetencia(c: string): string {
  // contas_convenio_resumo usa formato '2026/05'
  const sep = c.includes('/') ? '/' : '-';
  const parts = c.split(sep);
  if (parts.length === 2) {
    return `${parts[0]}/${parts[1].padStart(2, '0')}`;
  }
  return c;
}

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

// ============================================================
// FUNÇÃO PRINCIPAL
// ============================================================

export async function getDadosFaturadoRecebidoUnificado(
  filtros: FiltrosUnificado
): Promise<ResultadoUnificado> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const { estabelecimentoId, tipoItem, setor, origemSistema, prestador } = filtros;
  const competencias = filtros.competencias?.map(normalizarCompetencia);
  const convenios = filtros.convenios;

  // ============================================================
  // 1. BUSCAR FILTROS DISPONÍVEIS (da contas_convenio_resumo + itens)
  // ============================================================
  const [compRows] = await db.execute(sql.raw(`
    SELECT DISTINCT competencia FROM contas_convenio_resumo 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND competencia IS NOT NULL AND competencia != ''
    ORDER BY competencia DESC
  `));
  const competenciasDisponiveis = (compRows as unknown as any[]).map((r: any) => r.competencia as string);

  const [convRows] = await db.execute(sql.raw(`
    SELECT DISTINCT convenio FROM contas_convenio_resumo 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND convenio IS NOT NULL AND convenio != ''
    ORDER BY convenio
  `));
  const conveniosDisponiveis = (convRows as unknown as any[]).map((r: any) => r.convenio as string);

  const [tipoRows] = await db.execute(sql.raw(`
    SELECT DISTINCT ci.tipoItem FROM contas_convenio_itens ci
    WHERE ci.estabelecimentoId = ${estabelecimentoId} 
      AND ci.tipoItem IS NOT NULL AND ci.tipoItem != ''
    ORDER BY ci.tipoItem
  `));
  const tiposItemDisponiveis = (tipoRows as unknown as any[]).map((r: any) => r.tipoItem as string);

  const [origemRows] = await db.execute(sql.raw(`
    SELECT DISTINCT origem FROM contas_convenio_itens 
    WHERE estabelecimentoId = ${estabelecimentoId}
    ORDER BY origem
  `));
  const origensDisponiveis = (origemRows as unknown as any[]).map((r: any) => r.origem as string);

  // Prestadores (top por volume)
  const [prestadorRows] = await db.execute(sql.raw(`
    SELECT DISTINCT ci.profissionalExecutante FROM contas_convenio_itens ci
    WHERE ci.estabelecimentoId = ${estabelecimentoId} 
      AND ci.profissionalExecutante IS NOT NULL AND ci.profissionalExecutante != ''
    ORDER BY ci.profissionalExecutante
    LIMIT 200
  `));
  const prestadoresDisponiveis = (prestadorRows as unknown as any[]).map((r: any) => r.profissionalExecutante as string);

  // Setores - buscar do contas_convenio_itens (pode estar vazio se setor=NULL)
  // Fallback: buscar do faturamento_unificado
  let setoresDisponiveis: string[] = [];
  const [setorRows] = await db.execute(sql.raw(`
    SELECT DISTINCT ci.setor FROM contas_convenio_itens ci
    WHERE ci.estabelecimentoId = ${estabelecimentoId} 
      AND ci.setor IS NOT NULL AND ci.setor != ''
    ORDER BY ci.setor
  `));
  setoresDisponiveis = (setorRows as unknown as any[]).map((r: any) => r.setor as string);
  if (setoresDisponiveis.length === 0) {
    const [setorRowsFU] = await db.execute(sql.raw(`
      SELECT DISTINCT setor FROM faturamento_unificado 
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND setor IS NOT NULL AND setor != ''
      ORDER BY setor
    `));
    setoresDisponiveis = (setorRowsFU as unknown as any[]).map((r: any) => r.setor as string);
  }

  // ============================================================
  // 2. CONSTRUIR WHERE CLAUSE PARA contas_convenio_itens + resumo
  // ============================================================
  const whereParts: string[] = [`ci.estabelecimentoId = ${estabelecimentoId}`];
  
  if (competencias && competencias.length > 0) {
    const compList = competencias.map(c => `'${escSql(c)}'`).join(',');
    whereParts.push(`cr.competencia IN (${compList})`);
  }
  if (convenios && convenios.length > 0) {
    const convList = convenios.map(c => `'${escSql(c)}'`).join(',');
    whereParts.push(`ci.convenio IN (${convList})`);
  }
  if (tipoItem) {
    whereParts.push(`ci.tipoItem = '${escSql(tipoItem)}'`);
  }
  if (origemSistema) {
    whereParts.push(`ci.origem = '${escSql(origemSistema)}'`);
  }
  if (prestador) {
    whereParts.push(`ci.profissionalExecutante = '${escSql(prestador)}'`);
  }

  const whereClause = whereParts.join(' AND ');

  // Base JOIN: contas_convenio_itens ci INNER JOIN contas_convenio_resumo cr
  const baseFrom = `contas_convenio_itens ci
    INNER JOIN contas_convenio_resumo cr 
      ON ci.numeroConta = cr.numeroConta 
      AND ci.estabelecimentoId = cr.estabelecimentoId`;

  // ============================================================
  // 3. RESUMO GERAL
  // ============================================================
  const [resumoRows] = await db.execute(sql.raw(`
    SELECT 
      COUNT(*) as totalItens,
      COUNT(DISTINCT ci.numeroConta) as totalContas,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado
    FROM ${baseFrom}
    WHERE ${whereClause}
  `));
  const resumoRow = (resumoRows as unknown as any[])[0];
  const totalFaturado = parseFloat(resumoRow?.totalFaturado || '0');
  const totalItens = parseInt(resumoRow?.totalItens || '0');
  const totalContas = parseInt(resumoRow?.totalContas || '0');

  // ============================================================
  // 4. BUSCAR RECEBIDO - do recebimentos_excel (demonstrativo)
  // ============================================================
  const whereRecParts: string[] = [`re.estabelecimentoId = ${estabelecimentoId}`];
  
  if (competencias && competencias.length > 0) {
    const dateConditions = competencias.map(c => {
      const parts = c.includes('/') ? c.split('/') : c.split('-');
      const year = parts[0];
      const month = parseInt(parts[1]);
      return `(YEAR(re.data_referencia) = ${year} AND MONTH(re.data_referencia) = ${month})`;
    });
    whereRecParts.push(`(${dateConditions.join(' OR ')})`);
  }
  if (convenios && convenios.length > 0) {
    const convList = convenios.map(c => `'${escSql(c)}'`).join(',');
    whereRecParts.push(`c.nome IN (${convList})`);
  }

  const whereRecClause = whereRecParts.join(' AND ');

  const [recebidoResumoRows] = await db.execute(sql.raw(`
    SELECT 
      SUM(COALESCE(re.valor_pagamento, 0)) as totalRecebido,
      SUM(COALESCE(re.valor_glosa, 0)) as totalGlosado
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON re.convenioId = c.id
    WHERE ${whereRecClause}
  `));
  const recResumo = (recebidoResumoRows as unknown as any[])[0];
  const totalRecebido = parseFloat(recResumo?.totalRecebido || '0');
  const totalGlosado = parseFloat(recResumo?.totalGlosado || '0');
  const totalPendente = Math.max(0, totalFaturado - totalRecebido - totalGlosado);
  const taxaRecebimento = totalFaturado > 0 ? (totalRecebido / totalFaturado) * 100 : 0;
  const taxaGlosa = totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0;
  const ticketMedio = totalContas > 0 ? totalFaturado / totalContas : 0;

  // ============================================================
  // 5. AGRUPAMENTO POR PROCEDIMENTO (TOP 200)
  // ============================================================
  const [faturadoProcRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(ci.codigoItem, 'SEM_CODIGO') as codigoItem,
      COALESCE(ci.descricaoItem, 'Sem Descrição') as descricaoItem,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
    GROUP BY COALESCE(ci.codigoItem, 'SEM_CODIGO'), COALESCE(ci.descricaoItem, 'Sem Descrição')
    ORDER BY SUM(COALESCE(ci.valorTotal, 0)) DESC
    LIMIT 200
  `));

  const [recebidoProcRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(re.item, 'SEM_CODIGO') as codigoItem,
      COALESCE(re.item_desc, 'Sem Descrição') as descricaoItem,
      SUM(COALESCE(re.valor_pagamento, 0)) as totalRecebido,
      SUM(COALESCE(re.valor_glosa, 0)) as totalGlosado,
      COUNT(*) as quantidade
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON re.convenioId = c.id
    WHERE ${whereRecClause}
    GROUP BY COALESCE(re.item, 'SEM_CODIGO'), COALESCE(re.item_desc, 'Sem Descrição')
    ORDER BY SUM(COALESCE(re.valor_pagamento, 0)) DESC
    LIMIT 200
  `));

  const procMap = new Map<string, ProcedimentoResumo>();
  for (const row of (faturadoProcRows as unknown as any[])) {
    const key = row.codigoItem;
    procMap.set(key, {
      codigoItem: row.codigoItem,
      descricaoItem: row.descricaoItem,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
      taxaRecebimento: 0,
      taxaGlosa: 0,
    });
  }
  for (const row of (recebidoProcRows as unknown as any[])) {
    const key = row.codigoItem;
    if (procMap.has(key)) {
      const entry = procMap.get(key)!;
      entry.totalRecebido += parseFloat(row.totalRecebido || '0');
      entry.totalGlosado += parseFloat(row.totalGlosado || '0');
    } else {
      procMap.set(key, {
        codigoItem: row.codigoItem,
        descricaoItem: row.descricaoItem,
        totalFaturado: 0,
        totalRecebido: parseFloat(row.totalRecebido || '0'),
        totalGlosado: parseFloat(row.totalGlosado || '0'),
        totalPendente: 0,
        quantidade: parseInt(row.quantidade || '0'),
        taxaRecebimento: 0,
        taxaGlosa: 0,
      });
    }
  }
  for (const entry of procMap.values()) {
    entry.totalPendente = Math.max(0, entry.totalFaturado - entry.totalRecebido - entry.totalGlosado);
    entry.taxaRecebimento = entry.totalFaturado > 0 ? (entry.totalRecebido / entry.totalFaturado) * 100 : 0;
    entry.taxaGlosa = entry.totalFaturado > 0 ? (entry.totalGlosado / entry.totalFaturado) * 100 : 0;
  }

  // ============================================================
  // 6. AGRUPAMENTO POR MÊS (competência do resumo)
  // ============================================================
  const [faturadoMesRows] = await db.execute(sql.raw(`
    SELECT 
      cr.competencia,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
      AND cr.competencia IS NOT NULL AND cr.competencia != ''
    GROUP BY cr.competencia
    ORDER BY cr.competencia
  `));

  const [recebidoMesRows] = await db.execute(sql.raw(`
    SELECT 
      CONCAT(YEAR(re.data_referencia), '/', LPAD(MONTH(re.data_referencia), 2, '0')) as competencia,
      SUM(COALESCE(re.valor_pagamento, 0)) as totalRecebido,
      SUM(COALESCE(re.valor_glosa, 0)) as totalGlosado,
      COUNT(*) as quantidade
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON re.convenioId = c.id
    WHERE ${whereRecClause}
      AND re.data_referencia IS NOT NULL
    GROUP BY CONCAT(YEAR(re.data_referencia), '/', LPAD(MONTH(re.data_referencia), 2, '0'))
    ORDER BY competencia
  `));

  const mesMap = new Map<string, MesResumo>();
  for (const row of (faturadoMesRows as unknown as any[])) {
    mesMap.set(row.competencia, {
      competencia: row.competencia,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
    });
  }
  for (const row of (recebidoMesRows as unknown as any[])) {
    const comp = row.competencia;
    if (mesMap.has(comp)) {
      const entry = mesMap.get(comp)!;
      entry.totalRecebido += parseFloat(row.totalRecebido || '0');
      entry.totalGlosado += parseFloat(row.totalGlosado || '0');
    } else {
      mesMap.set(comp, {
        competencia: comp,
        totalFaturado: 0,
        totalRecebido: parseFloat(row.totalRecebido || '0'),
        totalGlosado: parseFloat(row.totalGlosado || '0'),
        totalPendente: 0,
        quantidade: parseInt(row.quantidade || '0'),
      });
    }
  }
  for (const entry of mesMap.values()) {
    entry.totalPendente = Math.max(0, entry.totalFaturado - entry.totalRecebido - entry.totalGlosado);
  }

  // ============================================================
  // 7. AGRUPAMENTO POR CONVÊNIO
  // ============================================================
  const [faturadoConvRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(ci.convenio, 'Sem Convênio') as convenio,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
    GROUP BY COALESCE(ci.convenio, 'Sem Convênio')
    ORDER BY SUM(COALESCE(ci.valorTotal, 0)) DESC
  `));

  const [recebidoConvRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(c.nome, 'Sem Convênio') as convenio,
      SUM(COALESCE(re.valor_pagamento, 0)) as totalRecebido,
      SUM(COALESCE(re.valor_glosa, 0)) as totalGlosado,
      COUNT(*) as quantidade
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON re.convenioId = c.id
    WHERE ${whereRecClause}
    GROUP BY COALESCE(c.nome, 'Sem Convênio')
    ORDER BY SUM(COALESCE(re.valor_pagamento, 0)) DESC
  `));

  const convMap = new Map<string, ConvenioResumo>();
  for (const row of (faturadoConvRows as unknown as any[])) {
    convMap.set(row.convenio, {
      convenio: row.convenio,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
    });
  }
  for (const row of (recebidoConvRows as unknown as any[])) {
    if (convMap.has(row.convenio)) {
      const entry = convMap.get(row.convenio)!;
      entry.totalRecebido += parseFloat(row.totalRecebido || '0');
      entry.totalGlosado += parseFloat(row.totalGlosado || '0');
    } else {
      convMap.set(row.convenio, {
        convenio: row.convenio,
        totalFaturado: 0,
        totalRecebido: parseFloat(row.totalRecebido || '0'),
        totalGlosado: parseFloat(row.totalGlosado || '0'),
        totalPendente: 0,
        quantidade: parseInt(row.quantidade || '0'),
      });
    }
  }
  for (const entry of convMap.values()) {
    entry.totalPendente = Math.max(0, entry.totalFaturado - entry.totalRecebido - entry.totalGlosado);
  }

  // ============================================================
  // 8. AGRUPAMENTO POR TIPO DE ITEM
  // ============================================================
  const [faturadoTipoRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(ci.tipoItem, 'NÃO INFORMADO') as tipoItem,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
    GROUP BY COALESCE(ci.tipoItem, 'NÃO INFORMADO')
    ORDER BY SUM(COALESCE(ci.valorTotal, 0)) DESC
  `));

  const tipoItemArr: TipoItemResumo[] = (faturadoTipoRows as unknown as any[]).map((row: any) => {
    const tf = parseFloat(row.totalFaturado || '0');
    return {
      tipoItem: row.tipoItem,
      totalFaturado: tf,
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: tf,
      quantidade: parseInt(row.quantidade || '0'),
      taxaRecebimento: 0,
      taxaGlosa: 0,
    };
  });

  // ============================================================
  // 9. AGRUPAMENTO POR PRESTADOR
  // ============================================================
  const [faturadoPrestRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(ci.profissionalExecutante, 'Sem Prestador') as prestador,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
      AND ci.profissionalExecutante IS NOT NULL AND ci.profissionalExecutante != ''
    GROUP BY COALESCE(ci.profissionalExecutante, 'Sem Prestador')
    ORDER BY SUM(COALESCE(ci.valorTotal, 0)) DESC
    LIMIT 100
  `));

  const prestadorArr: PrestadorResumo[] = (faturadoPrestRows as unknown as any[]).map((row: any) => {
    const tf = parseFloat(row.totalFaturado || '0');
    return {
      prestador: row.prestador,
      totalFaturado: tf,
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: tf,
      quantidade: parseInt(row.quantidade || '0'),
      taxaRecebimento: 0,
      taxaGlosa: 0,
    };
  });

  // ============================================================
  // 10. AGRUPAMENTO POR SETOR (se disponível)
  // ============================================================
  let porSetor: SetorResumo[] = [];
  // Tentar buscar do contas_convenio_itens primeiro
  const [setorDataRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(ci.setor, 'Sem Setor') as setor,
      SUM(COALESCE(ci.valorTotal, 0)) as totalFaturado,
      SUM(COALESCE(ci.quantidade, 1)) as quantidade
    FROM ${baseFrom}
    WHERE ${whereClause}
      AND ci.setor IS NOT NULL AND ci.setor != ''
    GROUP BY COALESCE(ci.setor, 'Sem Setor')
    ORDER BY SUM(COALESCE(ci.valorTotal, 0)) DESC
  `));
  
  if ((setorDataRows as unknown as any[]).length > 0) {
    porSetor = (setorDataRows as unknown as any[]).map((row: any) => ({
      setor: row.setor,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: 0,
      totalGlosado: 0,
      totalPendente: parseFloat(row.totalFaturado || '0'),
      quantidade: parseInt(row.quantidade || '0'),
    }));
  }

  // ============================================================
  // 11. MONTAR RESULTADO FINAL
  // ============================================================
  const porProcedimento = Array.from(procMap.values()).sort((a, b) => b.totalFaturado - a.totalFaturado);
  const porMes = Array.from(mesMap.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
  const porConvenio = Array.from(convMap.values()).sort((a, b) => b.totalFaturado - a.totalFaturado);

  return {
    resumo: {
      totalFaturado,
      totalRecebido,
      totalGlosado,
      totalPendente,
      totalItens,
      totalContas,
      taxaRecebimento,
      taxaGlosa,
      ticketMedio,
    },
    porProcedimento,
    porMes,
    porConvenio,
    porSetor,
    porTipoItem: tipoItemArr,
    porPrestador: prestadorArr,
    filtrosDisponiveis: {
      competencias: competenciasDisponiveis,
      convenios: conveniosDisponiveis,
      setores: setoresDisponiveis,
      tiposItem: tiposItemDisponiveis,
      origens: origensDisponiveis,
      prestadores: prestadoresDisponiveis,
    },
  };
}
