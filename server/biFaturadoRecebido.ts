/**
 * BI Faturado x Recebido
 * Cruza dados do faturamento_unificado com recebimentos_excel (demonstrativo)
 * Agrupando por procedimento (descricaoItem), mês e estabelecimento
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface FiltrosBIFaturadoRecebido {
  estabelecimentoId: number;
  competencias?: string[];  // formato YYYY-MM
  convenios?: string[];     // nomes de convênios
  tipoItem?: string;        // P, M, D, etc
  setor?: string;
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

export interface BIFaturadoRecebidoResult {
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
  filtrosDisponiveis: {
    competencias: string[];
    convenios: string[];
    setores: string[];
  };
}

/**
 * Busca dados consolidados de Faturado x Recebido
 * Fonte FATURADO: faturamento_unificado (dados unificados de Warleine/Tasy/XML)
 * Fonte RECEBIDO: recebimentos_excel (demonstrativos importados via Excel)
 * 
 * A lógica cruza os dados por:
 * - estabelecimentoId (obrigatório)
 * - competência (mês/ano)
 * - convênio
 */
export async function getDadosBIFaturadoRecebido(
  filtros: FiltrosBIFaturadoRecebido
): Promise<BIFaturadoRecebidoResult> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const { estabelecimentoId, competencias, convenios, tipoItem, setor } = filtros;

  // ============================================================
  // 1. BUSCAR FILTROS DISPONÍVEIS
  // ============================================================
  const [compRows] = await db.execute(sql.raw(`
    SELECT DISTINCT competencia FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND competencia IS NOT NULL AND competencia != ''
    ORDER BY competencia DESC
  `));
  const competenciasDisponiveis = (compRows as any[]).map((r: any) => r.competencia);

  const [convRows] = await db.execute(sql.raw(`
    SELECT DISTINCT convenio FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND convenio IS NOT NULL AND convenio != ''
    ORDER BY convenio
  `));
  const conveniosDisponiveis = (convRows as any[]).map((r: any) => r.convenio);

  const [setorRows] = await db.execute(sql.raw(`
    SELECT DISTINCT setor FROM faturamento_unificado 
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND setor IS NOT NULL AND setor != ''
    ORDER BY setor
  `));
  const setoresDisponiveis = (setorRows as any[]).map((r: any) => r.setor);

  // ============================================================
  // 2. CONSTRUIR WHERE CLAUSE PARA FATURAMENTO_UNIFICADO
  // ============================================================
  const whereParts: string[] = [`fu.estabelecimentoId = ${estabelecimentoId}`];
  
  if (competencias && competencias.length > 0) {
    const compList = competencias.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    whereParts.push(`fu.competencia IN (${compList})`);
  }
  if (convenios && convenios.length > 0) {
    const convList = convenios.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    whereParts.push(`fu.convenio IN (${convList})`);
  }
  if (tipoItem) {
    whereParts.push(`fu.tipoItem = '${tipoItem.replace(/'/g, "''")}'`);
  }
  if (setor) {
    whereParts.push(`fu.setor = '${setor.replace(/'/g, "''")}'`);
  }

  const whereClause = whereParts.join(' AND ');

  // ============================================================
  // 3. BUSCAR FATURADO - agrupado por procedimento
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
    // recebimentos_excel usa data_referencia (DATE), converter competência para filtro
    const dateConditions = competencias.map(c => {
      const [year, month] = c.split('-');
      return `(YEAR(re.data_referencia) = ${year} AND MONTH(re.data_referencia) = ${parseInt(month)})`;
    });
    whereRecParts.push(`(${dateConditions.join(' OR ')})`);
  }
  if (convenios && convenios.length > 0) {
    // recebimentos_excel usa convenioId, precisamos fazer join com convenios
    const convList = convenios.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
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

  for (const row of faturadoProcRows as any[]) {
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

  // Adicionar/atualizar com dados do recebimentos_excel
  for (const row of recebidoProcRows as any[]) {
    const key = row.codigoItem;
    if (procMap.has(key)) {
      const entry = procMap.get(key)!;
      // Somar recebido e glosado do demonstrativo
      entry.totalRecebido += parseFloat(row.totalRecebido || '0');
      entry.totalGlosado += parseFloat(row.totalGlosado || '0');
    } else {
      // Procedimento só existe no recebido (não faturado)
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

  // Calcular taxas e pendente
  for (const entry of procMap.values()) {
    entry.totalPendente = Math.max(0, entry.totalFaturado - entry.totalRecebido - entry.totalGlosado);
    entry.taxaRecebimento = entry.totalFaturado > 0 ? (entry.totalRecebido / entry.totalFaturado) * 100 : 0;
    entry.taxaGlosa = entry.totalFaturado > 0 ? (entry.totalGlosado / entry.totalFaturado) * 100 : 0;
  }

  // ============================================================
  // 6. BUSCAR AGRUPAMENTO POR MÊS (FATURADO)
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

  // RECEBIDO POR MÊS
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
  for (const row of faturadoMesRows as any[]) {
    mesMap.set(row.competencia, {
      competencia: row.competencia,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
    });
  }
  for (const row of recebidoMesRows as any[]) {
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
  // 7. BUSCAR AGRUPAMENTO POR CONVÊNIO
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
  for (const row of faturadoConvRows as any[]) {
    convMap.set(row.convenio, {
      convenio: row.convenio,
      totalFaturado: parseFloat(row.totalFaturado || '0'),
      totalRecebido: parseFloat(row.totalRecebidoFU || '0'),
      totalGlosado: parseFloat(row.totalGlosadoFU || '0'),
      totalPendente: 0,
      quantidade: parseInt(row.quantidade || '0'),
    });
  }
  for (const row of recebidoConvRows as any[]) {
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
  // 8. BUSCAR AGRUPAMENTO POR SETOR
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
  for (const row of faturadoSetorRows as any[]) {
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
  // 9. CALCULAR RESUMO GERAL
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
    filtrosDisponiveis: {
      competencias: competenciasDisponiveis,
      convenios: conveniosDisponiveis,
      setores: setoresDisponiveis,
    },
  };
}
