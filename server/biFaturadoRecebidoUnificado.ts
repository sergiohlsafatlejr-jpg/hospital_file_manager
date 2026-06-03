/**
 * BI Faturado x Recebido - UNIFICADO
 * Cruza dados do faturamento_unificado (TASY, XML, Warleine) com recebimentos_excel
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
  origemSistema?: string; // TASY_STAGING, XML_TISS, WARLEINE, ou undefined = todos
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
  // O banco usa formato '2026-05', frontend envia '2026-05'
  // Apenas garantir padding do mês
  const sep = c.includes('/') ? '/' : '-';
  const parts = c.split(sep);
  if (parts.length === 2) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
  }
  return c;
}

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

// Mapeamento de tipoItem para label amigável
const TIPO_ITEM_LABEL: Record<string, string> = {
  "PROC/TAXA": "Procedimento/Taxa",
  "MAT/MED": "Material/Medicamento",
  "MEDICAMENTO": "Medicamento",
  "MATERIAL": "Material",
  "PROCEDIMENTO": "Procedimento",
  "TAXA/ALUGUÉIS": "Taxa/Aluguéis",
  "DIÁRIA": "Diária",
  "GÁS MEDICINAL": "Gás Medicinal",
  "T": "Taxa",
  "M": "Material",
  "H": "Honorário",
  "S": "Serviço",
  "P": "Procedimento",
  "C": "Consulta",
  "O": "Outros",
};

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
  // 1. BUSCAR FILTROS DISPONÍVEIS
  // ============================================================
  const [compRows] = await db.execute(sql.raw(`
    SELECT DISTINCT competencia FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND competencia IS NOT NULL AND competencia != ''
    ORDER BY competencia DESC
  `));
  const competenciasDisponiveis = (compRows as unknown as any[]).map((r: any) => r.competencia as string);

  // Adicionar competências do recebimentos_excel
  const [compRowsRE] = await db.execute(sql.raw(`
    SELECT DISTINCT CONCAT(YEAR(data_referencia), '-', LPAD(MONTH(data_referencia), 2, '0')) as competencia
    FROM recebimentos_excel
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND data_referencia IS NOT NULL
    ORDER BY competencia DESC
  `));
  const compSet = new Set<string>(competenciasDisponiveis);
  for (const r of (compRowsRE as unknown as any[])) {
    compSet.add(r.competencia as string);
  }
  const todasCompetencias = Array.from(compSet).sort((a, b) => b.localeCompare(a));

  const [convRows] = await db.execute(sql.raw(`
    SELECT DISTINCT convenio FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND convenio IS NOT NULL AND convenio != ''
    ORDER BY convenio
  `));
  const conveniosDisponiveis = (convRows as unknown as any[]).map((r: any) => r.convenio as string);

  const [setorRows] = await db.execute(sql.raw(`
    SELECT DISTINCT setor FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND setor IS NOT NULL AND setor != ''
    ORDER BY setor
  `));
  const setoresDisponiveis = (setorRows as unknown as any[]).map((r: any) => r.setor as string);

  const [tipoRows] = await db.execute(sql.raw(`
    SELECT DISTINCT tipoItem FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND tipoItem IS NOT NULL AND tipoItem != ''
    ORDER BY tipoItem
  `));
  const tiposItemDisponiveis = (tipoRows as unknown as any[]).map((r: any) => r.tipoItem as string);

  const [origemRows] = await db.execute(sql.raw(`
    SELECT DISTINCT origemSistema FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId}
    ORDER BY origemSistema
  `));
  const origensDisponiveis = (origemRows as unknown as any[]).map((r: any) => r.origemSistema as string);

  // Prestadores (top 100 por volume)
  const [prestadorRows] = await db.execute(sql.raw(`
    SELECT DISTINCT profissionalExecutante FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND profissionalExecutante IS NOT NULL AND profissionalExecutante != ''
    ORDER BY profissionalExecutante
  `));
  const prestadoresDisponiveis = (prestadorRows as unknown as any[]).map((r: any) => r.profissionalExecutante as string);

  // ============================================================
  // 2. CONSTRUIR WHERE CLAUSE PARA FATURAMENTO_UNIFICADO
  // ============================================================
  const whereParts: string[] = [`fu.estabelecimentoId = ${estabelecimentoId}`];
  
  if (competencias && competencias.length > 0) {
    const compList = competencias.map(c => `'${escSql(c)}'`).join(',');
    whereParts.push(`fu.competencia IN (${compList})`);
  }
  if (convenios && convenios.length > 0) {
    const convList = convenios.map(c => `'${escSql(c)}'`).join(',');
    whereParts.push(`fu.convenio IN (${convList})`);
  }
  if (tipoItem) {
    whereParts.push(`fu.tipoItem = '${escSql(tipoItem)}'`);
  }
  if (setor) {
    whereParts.push(`fu.setor = '${escSql(setor)}'`);
  }
  if (origemSistema) {
    whereParts.push(`fu.origemSistema = '${escSql(origemSistema)}'`);
  }
  if (prestador) {
    whereParts.push(`fu.profissionalExecutante = '${escSql(prestador)}'`);
  }

  const whereClause = whereParts.join(' AND ');

  // ============================================================
  // 3. BUSCAR FATURADO - agrupado por procedimento (TOP 500)
  // ============================================================
  const [faturadoProcRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(fu.codigoItem, 'SEM_CODIGO') as codigoItem,
      COALESCE(fu.descricaoItem, 'Sem Descrição') as descricaoItem,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
    GROUP BY COALESCE(fu.codigoItem, 'SEM_CODIGO'), COALESCE(fu.descricaoItem, 'Sem Descrição')
    ORDER BY SUM(COALESCE(fu.valorFaturado, 0)) DESC
  `));

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
  `));

  // ============================================================
  // 5. CRUZAR DADOS POR PROCEDIMENTO
  // ============================================================
  const procMap = new Map<string, ProcedimentoResumo>();

  for (const row of (faturadoProcRows as unknown as any[])) {
    const key = row.codigoItem;
    procMap.set(key, {
      codigoItem: row.codigoItem,
      descricaoItem: row.descricaoItem,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
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
  // 6. AGRUPAMENTO POR MÊS
  // ============================================================
  const [faturadoMesRows] = await db.execute(sql.raw(`
    SELECT 
      fu.competencia,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
      AND fu.competencia IS NOT NULL AND fu.competencia != ''
    GROUP BY fu.competencia
    ORDER BY fu.competencia
  `));

  const [recebidoMesRows] = await db.execute(sql.raw(`
    SELECT 
      CONCAT(YEAR(re.data_referencia), '-', LPAD(MONTH(re.data_referencia), 2, '0')) as competencia,
      SUM(COALESCE(re.valor_pagamento, 0)) as totalRecebido,
      SUM(COALESCE(re.valor_glosa, 0)) as totalGlosado,
      COUNT(*) as quantidade
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON re.convenioId = c.id
    WHERE ${whereRecClause}
      AND re.data_referencia IS NOT NULL
    GROUP BY CONCAT(YEAR(re.data_referencia), '-', LPAD(MONTH(re.data_referencia), 2, '0'))
    ORDER BY competencia
  `));

  const mesMap = new Map<string, MesResumo>();
  for (const row of (faturadoMesRows as unknown as any[])) {
    mesMap.set(row.competencia, {
      competencia: row.competencia,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
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
      COALESCE(fu.convenio, 'Sem Convênio') as convenio,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
    GROUP BY COALESCE(fu.convenio, 'Sem Convênio')
    ORDER BY SUM(COALESCE(fu.valorFaturado, 0)) DESC
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
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
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
  // 8. AGRUPAMENTO POR SETOR
  // ============================================================
  const [faturadoSetorRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(fu.setor, 'Sem Setor') as setor,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
      AND fu.setor IS NOT NULL AND fu.setor != ''
    GROUP BY COALESCE(fu.setor, 'Sem Setor')
    ORDER BY SUM(COALESCE(fu.valorFaturado, 0)) DESC
  `));

  const setorMap = new Map<string, SetorResumo>();
  for (const row of (faturadoSetorRows as unknown as any[])) {
    setorMap.set(row.setor, {
      setor: row.setor,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
    });
  }
  for (const entry of setorMap.values()) {
    entry.totalPendente = Math.max(0, entry.totalFaturado - entry.totalRecebido - entry.totalGlosado);
  }

  // ============================================================
  // 9. AGRUPAMENTO POR TIPO DE ITEM (NOVO)
  // ============================================================
  const [faturadoTipoRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(fu.tipoItem, 'NÃO INFORMADO') as tipoItem,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
    GROUP BY COALESCE(fu.tipoItem, 'NÃO INFORMADO')
    ORDER BY SUM(COALESCE(fu.valorFaturado, 0)) DESC
  `));

  const tipoItemArr: TipoItemResumo[] = (faturadoTipoRows as unknown as any[]).map((row: any) => {
    const totalFaturado = parseFloat(row.totalFaturado || '0');
    const totalRecebido = parseFloat(row.totalRecebidoFU || '0');
    const totalGlosado = parseFloat(row.totalGlosadoFU || '0');
    return {
      tipoItem: TIPO_ITEM_LABEL[row.tipoItem] || row.tipoItem,
      totalFaturado,
      totalRecebido,
      totalGlosado,
      totalPendente: Math.max(0, totalFaturado - totalRecebido - totalGlosado),
      quantidade: parseInt(row.quantidade || '0'),
      taxaRecebimento: totalFaturado > 0 ? (totalRecebido / totalFaturado) * 100 : 0,
      taxaGlosa: totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0,
    };
  });

  // ============================================================
  // 10. AGRUPAMENTO POR PRESTADOR (NOVO)
  // ============================================================
  const [faturadoPrestRows] = await db.execute(sql.raw(`
    SELECT 
      COALESCE(fu.profissionalExecutante, 'Sem Prestador') as prestador,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalRecebidoFU,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosadoFU,
      SUM(COALESCE(fu.quantidade, 1)) as quantidade
    FROM faturamento_unificado fu
    WHERE ${whereClause}
      AND fu.profissionalExecutante IS NOT NULL AND fu.profissionalExecutante != ''
    GROUP BY COALESCE(fu.profissionalExecutante, 'Sem Prestador')
    ORDER BY SUM(COALESCE(fu.valorFaturado, 0)) DESC
  `));

  const prestadorArr: PrestadorResumo[] = (faturadoPrestRows as unknown as any[]).map((row: any) => {
    const totalFaturado = parseFloat(row.totalFaturado || '0');
    const totalRecebido = parseFloat(row.totalRecebidoFU || '0');
    const totalGlosado = parseFloat(row.totalGlosadoFU || '0');
    return {
      prestador: row.prestador,
      totalFaturado,
      totalRecebido,
      totalGlosado,
      totalPendente: Math.max(0, totalFaturado - totalRecebido - totalGlosado),
      quantidade: parseInt(row.quantidade || '0'),
      taxaRecebimento: totalFaturado > 0 ? (totalRecebido / totalFaturado) * 100 : 0,
      taxaGlosa: totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0,
    };
  });

  // ============================================================
  // 11. CALCULAR RESUMO GERAL
  // ============================================================
  const porProcedimento = Array.from(procMap.values()).sort((a, b) => b.totalFaturado - a.totalFaturado);
  const porMes = Array.from(mesMap.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
  const porConvenio = Array.from(convMap.values()).sort((a, b) => b.totalFaturado - a.totalFaturado);
  const porSetor = Array.from(setorMap.values()).sort((a, b) => b.totalFaturado - a.totalFaturado);

  const totalFaturado = porProcedimento.reduce((s, p) => s + p.totalFaturado, 0);
  const totalRecebido = porProcedimento.reduce((s, p) => s + p.totalRecebido, 0);
  const totalGlosado = porProcedimento.reduce((s, p) => s + p.totalGlosado, 0);
  const totalPendente = Math.max(0, totalFaturado - totalRecebido - totalGlosado);
  const totalItens = porProcedimento.reduce((s, p) => s + p.quantidade, 0);
  const taxaRecebimento = totalFaturado > 0 ? (totalRecebido / totalFaturado) * 100 : 0;
  const taxaGlosa = totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0;
  const ticketMedio = totalItens > 0 ? totalFaturado / totalItens : 0;

  return {
    resumo: {
      totalFaturado,
      totalRecebido,
      totalGlosado,
      totalPendente,
      totalItens,
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
      competencias: todasCompetencias,
      convenios: conveniosDisponiveis,
      setores: setoresDisponiveis,
      tiposItem: tiposItemDisponiveis,
      origens: origensDisponiveis,
      prestadores: prestadoresDisponiveis,
    },
  };
}
