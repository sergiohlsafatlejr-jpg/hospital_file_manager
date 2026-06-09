/**
 * Service para popular e manter a tabela faturamento_unificado
 * Unifica dados de duas fontes:
 * - WARLEINE (tabela integ_faturado): dados do faturamento do hospital via banco Warleine
 * - XML_TISS (tabela faturamento_tiss): dados dos XMLs enviados aos convênios
 */

import { getDb, getRawPool } from "./db";
import { sql } from "drizzle-orm";

// ============================================================
// POPULAÇÃO A PARTIR DO WARLEINE (integ_faturado)
// ============================================================

/**
 * Popula faturamento_unificado a partir dos dados do integ_faturado (Warleine)
 * para um estabelecimento e competência específicos.
 * Mapeamento:
 *   integ_faturado._id → origemId
 *   'WARLEINE' → origemSistema
 *   numconta → contaNumero
 *   guiacobra → numeroGuia
 *   aihguia → numeroGuiaOperadora
 *   protocolo → protocolo
 *   numfatura → lotePrestador
 *   matricula → carteiraBeneficiario
 *   nomeconv → convenio
 *   mesprod → competencia (convertido de 2025/01 para 2025-01)
 *   nomeprest → profissionalExecutante
 *   nomecc → setor
 *   tipoproc → tipoItem
 *   procdisco → codigoItem
 *   codproprio → codigoItemTuss
 *   descricao → descricaoItem
 *   data → dataExecucao
 *   quantidade → quantidade
 *   vl_unitario → valorUnitario
 *   vl_faturado → valorFaturado
 */
export async function popularDeIntegFaturado(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ inseridos: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const compFilter = competencia ? `AND competencia LIKE '${competencia.replace(/'/g, "''")}%'` : '';
  const compWarleineFilter = competencia ? `AND ig.mesprod LIKE '${competencia.replace('-', '/').replace(/'/g, "''")}%'` : '';

  // PASSO 1: Deletar APENAS itens com statusConciliacao = 'pendente'
  // Itens já processados (conciliado, divergente, nao_recebido, glosado) são preservados
  const deleteQuery = `
    DELETE FROM faturamento_unificado 
    WHERE origemSistema = 'WARLEINE' 
      AND estabelecimentoId = ${estabelecimentoId}
      AND statusConciliacao = 'pendente'
      ${compFilter}
  `;
  await db.execute(sql.raw(deleteQuery));

  // PASSO 2: Inserir apenas itens que NÃO existem ainda no faturamento_unificado
  // Usa LEFT JOIN para detectar itens já existentes (por origemId + origemSistema)
  const insertQuery = `
    INSERT INTO faturamento_unificado (
      origemSistema, origemId, estabelecimentoId,
      contaNumero, numeroGuia, numeroGuiaOperadora,
      protocolo, lotePrestador, carteiraBeneficiario,
      convenio, competencia,
      profissionalExecutante, setor,
      tipoItem, codigoItem, codigoItemTuss,
      descricaoItem, dataExecucao, quantidade,
      valorUnitario, valorFaturado,
      dataSincronizacao
    )
    SELECT
      'WARLEINE',
      CAST(ig._id AS CHAR),
      ig.estabelecimento_id,
      ig.numconta,
      ig.guiacobra,
      ig.aihguia,
      ig.protocolo,
      ig.numfatura,
      ig.matricula,
      TRIM(ig.nomeconv),
      REPLACE(ig.mesprod, '/', '-'),
      ig.nomeprest,
      ig.nomecc,
      ig.tipoproc,
      ig.procdisco,
      ig.codproprio,
      ig.descricao,
      ig.data,
      ig.quantidade,
      ig.vl_unitario,
      ig.vl_faturado,
      NOW()
    FROM integ_faturado ig
    LEFT JOIN faturamento_unificado fu 
      ON fu.origemSistema = 'WARLEINE' 
      AND fu.origemId = CAST(ig._id AS CHAR)
      AND fu.estabelecimentoId = ig.estabelecimento_id
    WHERE ig.estabelecimento_id = ${estabelecimentoId}
      AND fu.id IS NULL
      ${compWarleineFilter}
  `;

  await db.execute(sql.raw(insertQuery));

  // Contar registros totais
  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado 
    WHERE origemSistema = 'WARLEINE' AND estabelecimentoId = ${estabelecimentoId}
    ${compFilter}
  `;
  const [countResult] = await db.execute(sql.raw(countQuery));
  const total = (countResult as any)?.[0]?.total || 0;

  return { inseridos: Number(total), total: Number(total) };
}

// ============================================================
// POPULAÇÃO A PARTIR DO TASY (faturadoTasy) - LEGADO
// ============================================================

/**
 * @deprecated Use popularDeIntegFaturado() em vez desta função.
 * Mantida para compatibilidade. Popula a partir do faturadoTasy.
 */
export async function popularDeTasy(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ inseridos: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const compFilter = competencia ? `AND competencia LIKE '${competencia.replace(/'/g, "''")}%'` : '';

  // Limpar APENAS registros TASY pendentes (preservar itens já processados)
  const deleteQuery = `
    DELETE FROM faturamento_unificado 
    WHERE origemSistema = 'TASY' 
      AND estabelecimentoId = ${estabelecimentoId}
      AND statusConciliacao = 'pendente'
      ${compFilter}
  `;
  await db.execute(sql.raw(deleteQuery));

  // Inserir apenas itens que NÃO existem ainda (evitar duplicação)
  let insertQuery = `
    INSERT INTO faturamento_unificado (
      origemSistema, origemId, estabelecimentoId,
      contaNumero, protocolo, atendimento,
      convenio, competencia,
      profissionalExecutante, setor,
      tipoItem, codigoItem, codigoItemTuss,
      descricaoItem, dataExecucao, quantidade,
      valorFaturado, valorPago, valorGlosa,
      motivoGlosa, retorno, dataPagamento,
      dataSincronizacao
    )
    SELECT
      'TASY',
      CAST(ft.id AS CHAR),
      ft.estabelecimentoId,
      ft.conta,
      ft.protocolo,
      ft.atend,
      ft.convenio,
      ft.competencia,
      ft.profExec,
      ft.setor,
      ft.tipoItem,
      ft.cdItem,
      ft.cdItemTuss,
      ft.descricao,
      ft.dtItem,
      ft.qtd,
      ft.vlFaturado,
      ft.vlPago,
      ft.vlGlosa,
      ft.motivoGlosa,
      ft.retorno,
      ft.dtPgto,
      NOW()
    FROM faturadoTasy ft
    LEFT JOIN faturamento_unificado fu 
      ON fu.origemSistema = 'TASY' 
      AND fu.origemId = CAST(ft.id AS CHAR)
      AND fu.estabelecimentoId = ft.estabelecimentoId
    WHERE ft.estabelecimentoId = ${estabelecimentoId}
      AND fu.id IS NULL
  `;

  if (competencia) {
    insertQuery += ` AND ft.competencia LIKE '${competencia.replace(/'/g, "''")}%'`;
  }

  await db.execute(sql.raw(insertQuery));

  // Contar registros inseridos
  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado 
    WHERE origemSistema = 'TASY' AND estabelecimentoId = ${estabelecimentoId}
    ${competencia ? `AND competencia LIKE '${competencia.replace(/'/g, "''")}%'` : ''}
  `;
  const [countResult] = await db.execute(sql.raw(countQuery));
  const total = (countResult as any)?.[0]?.total || 0;

  return { inseridos: Number(total), total: Number(total) };
}

// ============================================================
// CONTAGEM DE DADOS TASY STAGING (já populados via importação)
// ============================================================

/**
 * Conta os dados TASY_STAGING já existentes na faturamento_unificado.
 * Os dados do tasy_faturado_staging são importados diretamente para a
 * faturamento_unificado via processo de importação, não precisam ser
 * re-populados como Warleine ou XML_TISS.
 */
export async function contarTasyStaging(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const compFilter = competencia
    ? `AND competencia LIKE '${competencia.replace(/'/g, "''")}%'`
    : '';

  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado 
    WHERE origemSistema = 'TASY_STAGING' AND estabelecimentoId = ${estabelecimentoId}
    ${compFilter}
  `;
  const [countResult] = await db.execute(sql.raw(countQuery));
  const total = (countResult as any)?.[0]?.total || 0;

  return { total: Number(total) };
}

// ============================================================
// POPULAÇÃO A PARTIR DO XML TISS (faturamento_tiss)
// ============================================================

/**
 * Popula faturamento_unificado a partir dos dados do faturamento_tiss (XML)
 * para um estabelecimento e data de referência específicos.
 */
export async function popularDeXmlTiss(
  estabelecimentoId: number,
  dataReferencia?: string
): Promise<{ inseridos: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const compFilter = dataReferencia ? `AND competencia = '${dataReferencia.replace(/'/g, "''")}' ` : '';

  // PASSO 1: Deletar APENAS itens XML_TISS com statusConciliacao = 'pendente'
  // Itens já processados (conciliado, divergente, nao_recebido, glosado) são preservados
  const deleteQuery = `
    DELETE FROM faturamento_unificado 
    WHERE origemSistema = 'XML_TISS' 
      AND estabelecimentoId = ${estabelecimentoId}
      AND statusConciliacao = 'pendente'
      ${compFilter}
  `;
  await db.execute(sql.raw(deleteQuery));

  // PASSO 2: Inserir apenas itens que NÃO existem ainda (evitar duplicação)
  // Usa LEFT JOIN com faturamento_unificado para detectar itens já existentes
  let insertQuery = `
    INSERT INTO faturamento_unificado (
      origemSistema, origemId, estabelecimentoId,
      numeroGuia, numeroGuiaOperadora, senha,
      lotePrestador, carteiraBeneficiario,
      convenioId, convenio, competencia,
      profissionalExecutante,
      tipoItem, codigoItem,
      descricaoItem, dataExecucao, quantidade,
      valorUnitario, valorFaturado,
      codigoPrestadorExecutante,
      dataSincronizacao
    )
    SELECT
      'XML_TISS',
      CAST(dedup.id AS CHAR),
      dedup.estabelecimentoId,
      dedup.numero_guia_prestador,
      dedup.numero_guia_operadora,
      dedup.senha,
      dedup.numero_lote,
      dedup.carteira_beneficiario,
      dedup.convenioId,
      c.nome,
      DATE_FORMAT(dedup.data_referencia, '%Y-%m'),
      dedup.nome_prof,
      dedup.tipo_item,
      dedup.codigo_item,
      dedup.descricao_item,
      dedup.data_execucao,
      dedup.quantidade,
      dedup.valor_unitario,
      dedup.valor_faturado,
      dedup.codigo_prestador_executante,
      NOW()
    FROM (
      SELECT ft.*,
        ROW_NUMBER() OVER (
          PARTITION BY ft.numero_guia_prestador, ft.sequencial_item, ft.codigo_item, ft.data_execucao, ft.quantidade, ft.valor_faturado
          ORDER BY ft.id ASC
        ) as rn
      FROM faturamento_tiss ft
      WHERE ft.estabelecimentoId = ${estabelecimentoId}
    ) dedup
    LEFT JOIN convenios c ON dedup.convenioId = c.id
    LEFT JOIN faturamento_unificado fu 
      ON fu.origemSistema = 'XML_TISS' 
      AND fu.origemId = CAST(dedup.id AS CHAR)
      AND fu.estabelecimentoId = dedup.estabelecimentoId
    WHERE dedup.rn = 1
      AND fu.id IS NULL
  `;

  if (dataReferencia) {
    insertQuery += ` AND DATE_FORMAT(dedup.data_referencia, '%Y-%m') = '${dataReferencia.replace(/'/g, "''")}' `;
  }

  await db.execute(sql.raw(insertQuery));

  // Contar registros inseridos
  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado 
    WHERE origemSistema = 'XML_TISS' AND estabelecimentoId = ${estabelecimentoId}
    ${dataReferencia ? `AND competencia = '${dataReferencia.replace(/'/g, "''")}'` : ''}
  `;
  const [countResult] = await db.execute(sql.raw(countQuery));
  const total = (countResult as any)?.[0]?.total || 0;

  return { inseridos: Number(total), total: Number(total) };
}

// ============================================================
// POPULAÇÃO COMPLETA (ambas as fontes)
// ============================================================

/**
 * Popula faturamento_unificado a partir de todas as fontes:
 * - WARLEINE (integ_faturado): dados do faturamento do hospital
 * - XML_TISS (faturamento_tiss): dados dos XMLs enviados aos convênios
 * - TASY_STAGING: dados já importados do Tasy (apenas contagem, não re-popula)
 */
export async function popularFaturamentoUnificado(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ warleine: { inseridos: number; total: number }; xmlTiss: { inseridos: number; total: number }; tasyStaging: { total: number }; totalGeral: number }> {
  const warleine = await popularDeIntegFaturado(estabelecimentoId, competencia);
  const xmlTiss = await popularDeXmlTiss(estabelecimentoId, competencia);
  const tasyStaging = await contarTasyStaging(estabelecimentoId, competencia);

  return {
    warleine,
    xmlTiss,
    tasyStaging,
    totalGeral: warleine.total + xmlTiss.total + tasyStaging.total,
  };
}

// ============================================================
// CONSULTAS PARA CONCILIAÇÃO
// ============================================================

/**
 * Lista o faturamento unificado com filtros para conciliação
 */
export async function listarFaturamentoUnificado(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenio?: string;
  convenioId?: number;
  statusConciliacao?: string;
  codigoItem?: string;
  pacienteNome?: string;
  limite?: number;
  offset?: number;
}): Promise<{ itens: any[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND fu.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenio) {
    whereClause += ` AND fu.convenio LIKE '%${params.convenio.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND fu.convenioId = ${params.convenioId}`;
  }
  if (params.statusConciliacao) {
    whereClause += ` AND fu.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
  }
  if (params.codigoItem) {
    whereClause += ` AND fu.codigoItem = '${params.codigoItem.replace(/'/g, "''")}'`;
  }
  if (params.pacienteNome) {
    whereClause += ` AND fu.pacienteNome LIKE '%${params.pacienteNome.replace(/'/g, "''")}%'`;
  }

  const limite = params.limite || 100;
  const offset = params.offset || 0;

  const query = `
    SELECT fu.* FROM faturamento_unificado fu
    ${whereClause}
    ORDER BY fu.competencia DESC, fu.contaNumero, fu.codigoItem
    LIMIT ${limite} OFFSET ${offset}
  `;

  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado fu
    ${whereClause}
  `;

  const [rows] = await db.execute(sql.raw(query));
  const [countRows] = await db.execute(sql.raw(countQuery));
  const total = (countRows as any)?.[0]?.total || 0;

  return { itens: (rows as unknown as any[]), total: Number(total) };
}

/**
 * Resumo do faturamento unificado agrupado por convênio
 */
export async function resumoFaturamentoPorConvenio(params: {
  estabelecimentoId: number;
  competencia?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND fu.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }

  const query = `
    SELECT
      fu.convenio,
      fu.convenioId,
      fu.origemSistema,
      COUNT(*) as totalItens,
      COUNT(DISTINCT fu.contaNumero) as totalContas,
      COUNT(DISTINCT fu.numeroGuia) as totalGuias,
      SUM(COALESCE(fu.valorFaturado, 0)) as valorTotalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as valorTotalPago,
      SUM(COALESCE(fu.valorGlosa, 0)) as valorTotalGlosado,
      SUM(CASE WHEN fu.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as totalConciliados,
      SUM(CASE WHEN fu.statusConciliacao = 'divergente' THEN 1 ELSE 0 END) as totalDivergentes,
      SUM(CASE WHEN fu.statusConciliacao = 'pendente' THEN 1 ELSE 0 END) as totalPendentes,
      SUM(CASE WHEN fu.statusConciliacao IN ('nao_recebido', 'sem_pagamento') THEN 1 ELSE 0 END) as totalNaoRecebidos,
      SUM(CASE WHEN fu.statusConciliacao = 'glosa_total' THEN 1 ELSE 0 END) as totalGlosaTotal,
      SUM(CASE WHEN fu.statusConciliacao = 'glosa_parcial' THEN 1 ELSE 0 END) as totalGlosaParcial
    FROM faturamento_unificado fu
    ${whereClause}
    GROUP BY fu.convenio, fu.convenioId, fu.origemSistema
    ORDER BY valorTotalFaturado DESC
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]);
}

/**
 * Resumo do faturamento unificado agrupado por guia/conta
 * para visualização na tela de conciliação
 */
export async function resumoFaturamentoPorGuia(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenio?: string;
  convenioId?: number;
  statusConciliacao?: string;
  busca?: string;
  loteXml?: string;
  loteRetorno?: string;
  limite?: number;
  offset?: number;
}): Promise<{ contas: any[]; total: number; resumo: any }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND fu.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenio) {
    whereClause += ` AND fu.convenio LIKE '%${params.convenio.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND fu.convenioId = ${params.convenioId}`;
  }
  if (params.statusConciliacao && params.statusConciliacao !== 'todos') {
    whereClause += ` AND fu.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
  }
  if (params.busca) {
    const busca = params.busca.replace(/'/g, "''");
    whereClause += ` AND (fu.contaNumero LIKE '%${busca}%' OR fu.numeroGuia LIKE '%${busca}%' OR fu.pacienteNome LIKE '%${busca}%' OR fu.convenio LIKE '%${busca}%')`;
  }
  if (params.loteXml) {
    whereClause += ` AND fu.lotePrestador = '${params.loteXml.replace(/'/g, "''")}'`;
  }
  if (params.loteRetorno) {
    const lr = params.loteRetorno.replace(/'/g, "''");
    whereClause += ` AND fu.numeroGuia IN (SELECT DISTINCT d.numero_guia FROM demonstrativo d WHERE d.estabelecimentoId = ${params.estabelecimentoId} AND d.lote_prestador = '${lr}')`;
  }

  const limite = params.limite || 50;
  const offset = params.offset || 0;

  // Agrupar por guia/conta
  const groupKey = `COALESCE(fu.contaNumero, fu.numeroGuia, CAST(fu.id AS CHAR))`;

  const query = `
    SELECT
      ${groupKey} as chaveGuia,
      fu.contaNumero,
      fu.numeroGuia,
      fu.atendimento,
      fu.pacienteNome,
      fu.carteiraBeneficiario,
      fu.convenio,
      fu.convenioId,
      fu.competencia,
      fu.profissionalExecutante,
      fu.setor,
      fu.protocolo,
      fu.origemSistema,
      COUNT(*) as totalItens,
      SUM(COALESCE(fu.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as valorPago,
      SUM(COALESCE(fu.valorGlosa, 0)) as valorGlosa,
      SUM(COALESCE(fu.valorFaturado, 0)) - SUM(COALESCE(fu.valorPago, 0)) - SUM(COALESCE(fu.valorGlosa, 0)) as valorPendente,
      MAX(fu.statusConciliacao) as statusConciliacao,
      MAX(fu.dataPagamento) as dataPagamento
    FROM faturamento_unificado fu
    ${whereClause}
    GROUP BY ${groupKey}, fu.contaNumero, fu.numeroGuia, fu.atendimento,
      fu.pacienteNome, fu.carteiraBeneficiario, fu.convenio, fu.convenioId,
      fu.competencia, fu.profissionalExecutante, fu.setor, fu.protocolo, fu.origemSistema
    ORDER BY valorFaturado DESC
    LIMIT ${limite} OFFSET ${offset}
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT ${groupKey}) as total
    FROM faturamento_unificado fu
    ${whereClause}
  `;

  // Resumo geral
  const resumoQuery = `
    SELECT
      COUNT(*) as totalItens,
      COUNT(DISTINCT ${groupKey}) as totalContas,
      SUM(COALESCE(fu.valorFaturado, 0)) as totalFaturado,
      SUM(COALESCE(fu.valorPago, 0)) as totalPago,
      SUM(COALESCE(fu.valorGlosa, 0)) as totalGlosado,
      SUM(COALESCE(fu.valorFaturado, 0)) - SUM(COALESCE(fu.valorPago, 0)) - SUM(COALESCE(fu.valorGlosa, 0)) as totalPendente,
      SUM(CASE WHEN fu.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as itensConciliados,
      SUM(CASE WHEN fu.statusConciliacao = 'divergente' THEN 1 ELSE 0 END) as itensDivergentes,
      SUM(CASE WHEN fu.statusConciliacao = 'pendente' THEN 1 ELSE 0 END) as itensPendentes,
      SUM(CASE WHEN fu.statusConciliacao IN ('nao_recebido', 'sem_pagamento') THEN 1 ELSE 0 END) as itensNaoRecebidos,
      SUM(CASE WHEN fu.statusConciliacao = 'glosa_total' THEN 1 ELSE 0 END) as itensGlosaTotal,
      SUM(CASE WHEN fu.statusConciliacao = 'glosa_parcial' THEN 1 ELSE 0 END) as itensGlosaParcial
    FROM faturamento_unificado fu
    ${whereClause}
  `;

  // Executar as 3 queries em paralelo para reduzir latência total
  const [[rows], [countRows], [resumoRows]] = await Promise.all([
    db.execute(sql.raw(query)),
    db.execute(sql.raw(countQuery)),
    db.execute(sql.raw(resumoQuery)),
  ]);

  const total = (countRows as any)?.[0]?.total || 0;
  const resumo = (resumoRows as any)?.[0] || {};

  return {
    contas: (rows as unknown as any[]),
    total: Number(total),
    resumo: {
      totalItens: Number(resumo.totalItens || 0),
      totalContas: Number(resumo.totalContas || 0),
      totalFaturado: Number(resumo.totalFaturado || 0),
      totalPago: Number(resumo.totalPago || 0),
      totalGlosado: Number(resumo.totalGlosado || 0),
      totalPendente: Number(resumo.totalPendente || 0),
      itensConciliados: Number(resumo.itensConciliados || 0),
      itensDivergentes: Number(resumo.itensDivergentes || 0),
      itensPendentes: Number(resumo.itensPendentes || 0),
      itensNaoRecebidos: Number(resumo.itensNaoRecebidos || 0),
    },
  };
}

/**
 * Itens detalhados de uma guia/conta específica
 */
export async function itensPorGuia(params: {
  estabelecimentoId: number;
  contaNumero?: string;
  numeroGuia?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.contaNumero) {
    whereClause += ` AND fu.contaNumero = '${params.contaNumero.replace(/'/g, "''")}'`;
  }
  if (params.numeroGuia) {
    whereClause += ` AND fu.numeroGuia = '${params.numeroGuia.replace(/'/g, "''")}'`;
  }

  const query = `
    SELECT fu.* FROM faturamento_unificado fu
    ${whereClause}
    ORDER BY fu.dataExecucao, fu.codigoItem
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]);
}

/**
 * Competências disponíveis no faturamento unificado
 */
export async function competenciasDisponiveis(
  estabelecimentoId: number
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const query = `
    SELECT
      fu.competencia,
      COUNT(*) as total
    FROM faturamento_unificado fu
    WHERE fu.estabelecimentoId = ${estabelecimentoId}
      AND fu.competencia IS NOT NULL
    GROUP BY fu.competencia
    ORDER BY fu.competencia DESC
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]);
}

/**
 * Convênios disponíveis no faturamento unificado
 */
export async function conveniosDisponiveis(params: {
  estabelecimentoId: number;
  competencia?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND fu.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }

  const query = `
    SELECT DISTINCT
      fu.convenio,
      fu.convenioId,
      COUNT(*) as total
    FROM faturamento_unificado fu
    ${whereClause}
      AND fu.convenio IS NOT NULL
    GROUP BY fu.convenio, fu.convenioId
    ORDER BY fu.convenio
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]);
}

/**
 * Atualizar status de conciliação de um item
 */
export async function atualizarStatusConciliacao(params: {
  id: number;
  statusConciliacao: string;
  recebimentoVinculadoId?: number;
  recebimentoOrigem?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let setClause = `statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
  setClause += `, atualizadoEm = NOW()`;
  if (params.recebimentoVinculadoId) {
    setClause += `, recebimentoVinculadoId = ${params.recebimentoVinculadoId}`;
  }
  if (params.recebimentoOrigem) {
    setClause += `, recebimentoOrigem = '${params.recebimentoOrigem.replace(/'/g, "''")}'`;
  }

  const query = `UPDATE faturamento_unificado SET ${setClause} WHERE id = ${params.id}`;
  await db.execute(sql.raw(query));
}

/**
 * Vincular manualmente uma guia do faturamento com um recebimento
 * Usado quando as guias do mesmo paciente têm números diferentes
 */
export async function vincularGuiaManual(params: {
  faturamentoIds: number[];
  recebimentoId: number;
  recebimentoOrigem: 'excel' | 'xml';
}): Promise<{ atualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (params.faturamentoIds.length === 0) return { atualizados: 0 };

  const ids = params.faturamentoIds.join(',');
  const query = `
    UPDATE faturamento_unificado 
    SET statusConciliacao = 'conciliado',
        recebimentoVinculadoId = ${params.recebimentoId},
        recebimentoOrigem = '${params.recebimentoOrigem}',
        atualizadoEm = NOW()
    WHERE id IN (${ids})
  `;

  await db.execute(sql.raw(query));
  return { atualizados: params.faturamentoIds.length };
}

/**
 * Buscar recebimentos candidatos para vinculação manual
 * Busca por nome do paciente, carteira ou guia similar
 */
export async function buscarRecebimentosCandidatos(params: {
  estabelecimentoId: number;
  pacienteNome?: string;
  carteiraBeneficiario?: string;
  competencia?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE re.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.pacienteNome) {
    whereClause += ` AND re.nome_beneficiario LIKE '%${params.pacienteNome.replace(/'/g, "''").substring(0, 30)}%'`;
  }
  if (params.carteiraBeneficiario) {
    whereClause += ` AND re.beneficiario = '${params.carteiraBeneficiario.replace(/'/g, "''")}'`;
  }
  if (params.competencia) {
    whereClause += ` AND re.data_referencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }

  const query = `
    SELECT 
      re.id,
      re.numero_guia as numeroGuia,
      re.beneficiario,
      re.nome_beneficiario as nomeBeneficiario,
      re.item as codigoItem,
      re.item_desc as descricaoItem,
      re.valor_pagamento as valorPago,
      re.valor_glosa as valorGlosa,
      re.situacao_item as situacao,
      re.data_pagto as dataPagamento,
      re.data_referencia as dataReferencia,
      'excel' as origem
    FROM recebimentos_excel re
    ${whereClause}
    ORDER BY re.data_pagto DESC
    LIMIT 100
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]);
}


// ============================================================
// CONCILIAÇÃO AUTOMÁTICA
// ============================================================

export interface ConciliacaoResultado {
  totalProcessados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalNaoRecebidos: number;
  totalGlosados: number;
  totalGlosaTotal: number;
  totalGlosaParcial: number;
  totalTerceiros: number;
  totalAcrescimos: number;
  totalJaConciliados: number;
  detalhes: {
    conciliadosPorGuiaCodigo: number;
    conciliadosPorGuiaCodigoTuss: number;
    conciliadosPorVinculacao: number;
    conciliadosPorPacienteCodigo: number;
    conciliadosPorCarteiraCodigo: number;
  };
  divergencias: Array<{
    faturamentoId: number;
    recebimentoId: number;
    codigoItem: string;
    numeroGuia: string;
    valorFaturado: number;
    valorRecebido: number;
    diferenca: number;
  }>;
}

/**
 * Executa a conciliação automática cruzando faturamento_unificado com recebimentos_excel.
 * 
 * Estratégia de matching (em ordem de prioridade):
 * 1. Match exato: numero_guia + codigoItem
 * 2. Match TUSS: numero_guia + codigoItemTuss
 * 3. Match com vinculacao_codigos (tabela de-para): numero_guia + código traduzido
 * 4. Match por paciente: pacienteNome + codigoItem (fallback quando guia diverge)
 * 5. Match por carteira: carteiraBeneficiario + codigoItem (fallback quando guias são incompatíveis)
 * 
 * Status resultante:
 * - conciliado: match encontrado e valores compatíveis (diferença < 1%)
 * - divergente: match encontrado mas valores diferentes (diferença >= 1%)
 * - nao_recebido: faturado sem match no recebimento
 */
export async function executarConciliacaoAutomatica(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  toleranciaPercentual?: number; // Tolerância para considerar valores iguais (default 1%)
}): Promise<ConciliacaoResultado> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // NOTA: O processamento em lotes por competência agora é feito pelo
  // conciliacaoJobManager.ts (processamento assíncrono em background).
  // Esta função processa UMA competência por vez.

  const tolerancia = params.toleranciaPercentual ?? 1; // 1% de tolerância por padrão

  const resultado: ConciliacaoResultado = {
    totalProcessados: 0,
    totalConciliados: 0,
    totalDivergentes: 0,
    totalNaoRecebidos: 0,
    totalGlosados: 0,
    totalGlosaTotal: 0,
    totalGlosaParcial: 0,
    totalTerceiros: 0,
    totalAcrescimos: 0,
    totalJaConciliados: 0,
    detalhes: {
      conciliadosPorGuiaCodigo: 0,
      conciliadosPorGuiaCodigoTuss: 0,
      conciliadosPorVinculacao: 0,
      conciliadosPorPacienteCodigo: 0,
      conciliadosPorCarteiraCodigo: 0,
    },
    divergencias: [],
  };

  // -------------------------------------------------------
  // PASSO 0.5: Deletar conciliações anteriores para evitar duplicatas
  // -------------------------------------------------------
  let whereDelete = `WHERE estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereDelete += ` AND competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereDelete += ` AND convenioId = ${params.convenioId}`;
  }
  await db.execute(sql.raw(`DELETE FROM conciliados_automatico ${whereDelete}`));

  // -------------------------------------------------------
  // PASSO 1: Buscar itens do faturamento_unificado para conciliação
  // Busca todos os itens (não apenas pendentes) pois a conciliação anterior
  // foi deletada acima
  // -------------------------------------------------------
  let whereFat = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereFat += ` AND fu.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereFat += ` AND fu.convenioId = ${params.convenioId}`;
  }

  const queryFaturamento = `
    SELECT 
      fu.id, fu.codigoItem, fu.codigoItemTuss, fu.numeroGuia, fu.contaNumero,
      fu.pacienteNome, fu.carteiraBeneficiario, fu.convenioId, fu.competencia,
      fu.convenio, fu.origemSistema, fu.descricaoItem, fu.tipoItem,
      fu.dataExecucao, fu.codigoPrestadorExecutante,
      COALESCE(fu.valorFaturado, 0) as valorFaturado,
      COALESCE(fu.quantidade, 0) as quantidade
    FROM faturamento_unificado fu
    ${whereFat}
    ORDER BY fu.id
  `;

  const [fatRows] = await db.execute(sql.raw(queryFaturamento));
  const itensFaturamento = fatRows as unknown as any[];
  resultado.totalProcessados = itensFaturamento.length;

  if (itensFaturamento.length === 0) {
    return resultado;
  }

  // -------------------------------------------------------
  // PASSO 1.5: Buscar códigos de prestadores PRÓPRIOS cadastrados
  // Itens cujo codigoPrestadorExecutante NÃO está entre os próprios
  // são considerados terceiros e não devem ser glosados
  // -------------------------------------------------------
  const [propriosRows] = await db.execute(sql.raw(
    `SELECT DISTINCT codigoPrestador FROM convenioEstabelecimentoPrestador 
     WHERE estabelecimentoId = ${params.estabelecimentoId} AND tipoPrestador = 'proprio' AND ativo = 'sim'`
  ));
  const codigosProprios = new Set((propriosRows as unknown as any[]).map(r => String(r.codigoPrestador)));

  // -------------------------------------------------------
  // PASSO 2: Buscar recebimentos do mesmo estabelecimento/convênio
  // Fonte primária: recebimentos_excel (arquivos importados via upload)
  // Fonte secundária: tabela demonstrativo (importados via CSV/banco externo)
  // Otimização: filtra recebimentos apenas pelas guias presentes no faturamento
  // para evitar carregar 100k+ registros na memória
  // -------------------------------------------------------
  
  // Extrair guias únicas do faturamento para filtrar recebimentos
  const guiasUnicas = [...new Set(itensFaturamento.map((f: any) => String(f.numeroGuia || f.contaNumero || '').trim()).filter(Boolean))];
  const carteirasUnicas = [...new Set(itensFaturamento.map((f: any) => String(f.carteiraBeneficiario || '').trim()).filter(Boolean))];
  
  let whereRec = `WHERE re.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.convenioId) {
    whereRec += ` AND re.convenioId = ${params.convenioId}`;
  }
  
  // Filtrar por guias conhecidas OU carteiras conhecidas para reduzir volume
  // Isso reduz de 100k+ para apenas os recebimentos relevantes
  if (guiasUnicas.length > 0 && guiasUnicas.length <= 10000) {
    const guiasEsc = guiasUnicas.map(g => `'${g.replace(/'/g, "''")}'`).join(',');
    const carteirasFilter = carteirasUnicas.length > 0 && carteirasUnicas.length <= 5000
      ? ` OR re.beneficiario IN (${carteirasUnicas.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`
      : '';
    whereRec += ` AND (re.numero_guia IN (${guiasEsc})${carteirasFilter})`;
  }

  const queryRecebimentos = `
    SELECT 
      re.id, re.numero_guia as numeroGuia, re.item as codigoItem,
      re.nome_beneficiario as nomeBeneficiario, re.beneficiario as carteira,
      COALESCE(re.valor_pagamento, 0) as valorPago,
      COALESCE(re.valor_glosa, 0) as valorGlosa,
      re.situacao_item as situacao,
      COALESCE(re.quantidade, 0) as quantidade,
      re.item_desc as descricaoItem,
      re.tipo_lancamento as tipoLancamento,
      re.codigo_glosa as codigoGlosa
    FROM recebimentos_excel re
    ${whereRec}
    ORDER BY re.id
  `;

  console.log(`[Conciliacao] Buscando recebimentos com filtro de ${guiasUnicas.length} guias...`);
  const t_rec_start = Date.now();
  const [recRows] = await db.execute(sql.raw(queryRecebimentos));
  const itensRecebimentoExcel = recRows as unknown as any[];
  console.log(`[Conciliacao] ${itensRecebimentoExcel.length} recebimentos encontrados em ${((Date.now()-t_rec_start)/1000).toFixed(1)}s`);

  // Fonte secundária: tabela demonstrativo (dados importados diretamente via CSV/banco externo)
  // Otimização: também filtra por guias conhecidas
  let whereDem = `WHERE d.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.convenioId) {
    whereDem += ` AND d.convenio_id = ${params.convenioId}`;
  }
  if (guiasUnicas.length > 0 && guiasUnicas.length <= 10000) {
    const guiasEsc = guiasUnicas.map(g => `'${g.replace(/'/g, "''")}'`).join(',');
    whereDem += ` AND d.numero_guia IN (${guiasEsc})`;
  }
  const queryDemonstrativo = `
    SELECT 
      d.id, d.numero_guia as numeroGuia, d.codigo_item as codigoItem,
      d.nome_beneficiario as nomeBeneficiario, d.carteira_beneficiario as carteira,
      COALESCE(d.valor_pago, 0) as valorPago,
      COALESCE(d.valor_glosa, 0) as valorGlosa,
      d.situacao_item as situacao,
      COALESCE(d.quantidade, 0) as quantidade,
      d.descricao_item as descricaoItem,
      d.tipo_lancamento as tipoLancamento,
      d.codigo_glosa as codigoGlosa
    FROM demonstrativo d
    ${whereDem}
    ORDER BY d.id
  `;
  console.log(`[Conciliacao] Buscando demonstrativos com filtro de guias...`);
  const t_dem_start = Date.now();
  const [demRows] = await db.execute(sql.raw(queryDemonstrativo));
  const itensRecebimentoDem = demRows as unknown as any[];
  console.log(`[Conciliacao] ${itensRecebimentoDem.length} demonstrativos encontrados em ${((Date.now()-t_dem_start)/1000).toFixed(1)}s`);

  // Combinar as duas fontes: usar AMBAS para maximizar o match
  // Identificar registros únicos: se um recebimento existe em ambas as fontes
  // (mesmo guia+código+valor), evitar duplicata preferindo o do excel (tem id menor)
  // Para o Ipasgo e outros convênios onde o demonstrativo tem mais registros que o excel,
  // esta combinação é essencial para atingir alta taxa de conciliação.
  let itensRecebimento: any[];
  if (itensRecebimentoExcel.length === 0) {
    // Sem excel: usar apenas demonstrativo (marcar origem)
    itensRecebimento = itensRecebimentoDem.map((r: any) => ({ ...r, _origem: 'demonstrativo' }));
  } else if (itensRecebimentoDem.length === 0) {
    // Sem demonstrativo: usar apenas excel
    itensRecebimento = itensRecebimentoExcel;
  } else {
    // Ambos disponíveis: combinar, adicionando prefixo de origem ao id para evitar colisão
    // Excel: ids originais (ex: 1001)
    // Demonstrativo: ids prefixados com 9_000_000 para não colidir com excel
    const DEM_ID_OFFSET = 9_000_000;
    const excelSet = new Set(
      itensRecebimentoExcel.map((r: any) => `${r.numeroGuia}|${r.codigoItem}|${r.valorPago}`)
    );
    // Adicionar apenas registros do demonstrativo que NÃO existem no excel
    const demExtras = itensRecebimentoDem
      .filter((r: any) => !excelSet.has(`${r.numeroGuia}|${r.codigoItem}|${r.valorPago}`))
      .map((r: any) => ({ ...r, id: r.id + DEM_ID_OFFSET, _origem: 'demonstrativo' }));
    itensRecebimento = [...itensRecebimentoExcel, ...demExtras];
    console.log(`[Conciliacao] Combinando fontes: ${itensRecebimentoExcel.length} excel + ${demExtras.length} demonstrativo extras = ${itensRecebimento.length} total`);
  }

  // -------------------------------------------------------
  // PASSO 3: Carregar tabela de vinculação de códigos (de-para)
  // -------------------------------------------------------
  let whereVinc = `WHERE vc.estabelecimentoId = ${params.estabelecimentoId} AND vc.ativo = 'sim'`;
  if (params.convenioId) {
    whereVinc += ` AND (vc.convenioId = ${params.convenioId} OR vc.convenioId IS NULL)`;
  }

  const queryVinculacao = `
    SELECT vc.codigoHospital, vc.codigoConvenio, vc.convenioId
    FROM vinculacao_codigos vc
    ${whereVinc}
  `;

  const [vincRows] = await db.execute(sql.raw(queryVinculacao));
  const vinculacoes = vincRows as unknown as any[];

  // Criar mapa de vinculação: codigoHospital → codigoConvenio
  const mapaVinculacao = new Map<string, string>();
  for (const v of vinculacoes) {
    mapaVinculacao.set(v.codigoHospital, v.codigoConvenio);
  }

  // -------------------------------------------------------
  // PASSO 4: Indexar recebimentos para busca rápida
  // -------------------------------------------------------
  // Índice por guia+código → lista de recebimentos
  const indexGuiaCodigo = new Map<string, any[]>();
  // Índice por paciente+código → lista de recebimentos
  const indexPacienteCodigo = new Map<string, any[]>();
  // Índice por carteira+código → lista de recebimentos
  const indexCarteiraCodigo = new Map<string, any[]>();
  // Set de recebimentos já usados (para evitar match duplo)
  const recebimentosUsados = new Set<number>();

  for (const rec of itensRecebimento) {
    const guia = String(rec.numeroGuia || '').trim();
    const codigo = String(rec.codigoItem || '').trim();
    const paciente = normalizarNome(String(rec.nomeBeneficiario || ''));

    if (guia && codigo) {
      const chave = `${guia}|${codigo}`;
      if (!indexGuiaCodigo.has(chave)) indexGuiaCodigo.set(chave, []);
      indexGuiaCodigo.get(chave)!.push(rec);
    }

    if (paciente && codigo) {
      const chave = `${paciente}|${codigo}`;
      if (!indexPacienteCodigo.has(chave)) indexPacienteCodigo.set(chave, []);
      indexPacienteCodigo.get(chave)!.push(rec);
    }

    // Indexar por carteira (beneficiario) + código
    const carteira = String(rec.carteira || '').trim();
    if (carteira && codigo) {
      const chave = `${carteira}|${codigo}`;
      if (!indexCarteiraCodigo.has(chave)) indexCarteiraCodigo.set(chave, []);
      indexCarteiraCodigo.get(chave)!.push(rec);
    }
  }

  // -------------------------------------------------------
  // PASSO 4.5: Pré-indexar guias que têm prestador próprio (evita O(n²) no PASSO 5)
  // -------------------------------------------------------
  const indexGuiaPrestadores = new Map<string, boolean>();
  if (codigosProprios.size > 0) {
    for (const fat of itensFaturamento) {
      const guia = String(fat.numeroGuia || '').trim();
      if (!guia) continue;
      const cod = fat.codigoPrestadorExecutante ? String(fat.codigoPrestadorExecutante) : null;
      if (cod && codigosProprios.has(cod)) {
        indexGuiaPrestadores.set(guia, true);
      }
    }
  }

  // -------------------------------------------------------
  // PASSO 5: Executar matching para cada item de faturamento
  // -------------------------------------------------------
  // Registros para INSERT na conciliados_automatico
  const inserts: Array<{
    faturamentoUnificadoId: number;
    contaNumero: string;
    numeroGuia: string;
    pacienteNome: string;
    convenio: string;
    convenioId: number | null;
    competencia: string;
    codigoItem: string;
    codigoItemTuss: string;
    descricaoItem: string;
    tipoItem: string;
    origemSistema: string;
    valorFaturado: number;
    quantidade: number;
    dataExecucao: string | null;
    recebimentoId: number | null;
    recebimentoOrigem: string | null;
    valorPago: number;
    valorGlosa: number;
    codigoGlosa: string | null;
    motivoGlosa: string | null;
    statusConciliacao: string;
    metodoConciliacao: string | null;
    diferenca: number;
    percentualDiferenca: number;
  }> = [];

  for (const fat of itensFaturamento) {
    const guia = String(fat.numeroGuia || fat.contaNumero || '').trim();
    const codigoItem = String(fat.codigoItem || '').trim();
    const codigoTuss = String(fat.codigoItemTuss || '').trim();
    const paciente = normalizarNome(String(fat.pacienteNome || ''));
    const valorFaturado = Number(fat.valorFaturado) || 0;

    let matchEncontrado = false;
    let recMatch: any = null;
    let metodo = '';

    // Estratégia 1: Match exato por guia + código
    if (guia && codigoItem) {
      const chave = `${guia}|${codigoItem}`;
      recMatch = encontrarMelhorMatch(indexGuiaCodigo.get(chave), recebimentosUsados, valorFaturado);
      if (recMatch) {
        matchEncontrado = true;
        metodo = 'guia_codigo';
      }
    }

    // Estratégia 2: Match por guia + código TUSS
    if (!matchEncontrado && guia && codigoTuss && codigoTuss !== codigoItem) {
      const chave = `${guia}|${codigoTuss}`;
      recMatch = encontrarMelhorMatch(indexGuiaCodigo.get(chave), recebimentosUsados, valorFaturado);
      if (recMatch) {
        matchEncontrado = true;
        metodo = 'guia_codigo_tuss';
      }
    }

    // Estratégia 3: Match com vinculação de códigos (de-para)
    if (!matchEncontrado && guia && codigoItem && mapaVinculacao.has(codigoItem)) {
      const codigoTraduzido = mapaVinculacao.get(codigoItem)!;
      const chave = `${guia}|${codigoTraduzido}`;
      recMatch = encontrarMelhorMatch(indexGuiaCodigo.get(chave), recebimentosUsados, valorFaturado);
      if (recMatch) {
        matchEncontrado = true;
        metodo = 'vinculacao';
      }
    }

    // Estratégia 4: Match por paciente + código (fallback)
    if (!matchEncontrado && paciente && codigoItem) {
      const chave = `${paciente}|${codigoItem}`;
      recMatch = encontrarMelhorMatch(indexPacienteCodigo.get(chave), recebimentosUsados, valorFaturado);
      if (recMatch) {
        matchEncontrado = true;
        metodo = 'paciente_codigo';
      }
    }

    // Estratégia 5: Match por carteiraBeneficiário + código (fallback quando guias são incompatíveis)
    if (!matchEncontrado && codigoItem) {
      const carteiraBenef = String(fat.carteiraBeneficiario || '').trim();
      if (carteiraBenef) {
        const chave = `${carteiraBenef}|${codigoItem}`;
        recMatch = encontrarMelhorMatch(indexCarteiraCodigo.get(chave), recebimentosUsados, valorFaturado);
        if (recMatch) {
          matchEncontrado = true;
          metodo = 'carteira_codigo';
        }
      }
    }

    // Dados base do faturamento para o INSERT
    const descricaoFat = String(fat.descricaoItem || '');
    const tipoItemFat = String(fat.tipoItem || '');
    const baseInsert = {
      faturamentoUnificadoId: fat.id,
      contaNumero: String(fat.contaNumero || ''),
      numeroGuia: guia,
      pacienteNome: String(fat.pacienteNome || ''),
      convenio: String(fat.convenio || ''),
      convenioId: fat.convenioId ? Number(fat.convenioId) : null,
      competencia: String(fat.competencia || ''),
      codigoItem: codigoItem,
      codigoItemTuss: codigoTuss,
      descricaoItem: descricaoFat,
      tipoItem: tipoItemFat,
      origemSistema: String(fat.origemSistema || ''),
      dataExecucao: fat.dataExecucao ? new Date(fat.dataExecucao).toISOString().slice(0, 19).replace('T', ' ') : null,
      codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
      valorFaturado,
      quantidade: Number(fat.quantidade) || 0,
      codigoGlosa: null as string | null,
      motivoGlosa: null as string | null,
    };

    if (matchEncontrado && recMatch) {
      recebimentosUsados.add(recMatch.id);
      const valorRecebido = Number(recMatch.valorPago) || 0;
      const diferenca = valorFaturado - valorRecebido;
      const _pctRaw = valorFaturado > 0 ? (Math.abs(diferenca) / valorFaturado) * 100 : (valorRecebido > 0 ? 100 : 0);
      const percentualDiferenca = isFinite(_pctRaw) ? Math.min(_pctRaw, 9999999.9999) : 9999999.9999;

      const valorPagoRec = Number(recMatch.valorPago) || 0;
      const valorGlosaRec = Number(recMatch.valorGlosa) || 0;

      // Enriquecer com dados do recebimento (demonstrativo)
      // Paciente: preferir do recebimento pois vem do demonstrativo
      if (recMatch.nomeBeneficiario) {
        baseInsert.pacienteNome = String(recMatch.nomeBeneficiario);
      }
      // Descrição: preferir do recebimento se disponível
      if (recMatch.descricaoItem) {
        baseInsert.descricaoItem = String(recMatch.descricaoItem);
      }
      // Tipo de lançamento do demonstrativo
      if (recMatch.tipoLancamento) {
        baseInsert.tipoItem = String(recMatch.tipoLancamento);
      }
      // Código e motivo da glosa
      if (recMatch.codigoGlosa) {
        baseInsert.codigoGlosa = String(recMatch.codigoGlosa);
      }

      const origemRec = recMatch._origem === 'demonstrativo' ? 'demonstrativo' : 'excel';
      // Para registros do demonstrativo combinados (ambas fontes), o id foi prefixado com DEM_ID_OFFSET
      // Para registros do demonstrativo solo (sem excel), o id é o original
      const recIdReal = (recMatch._origem === 'demonstrativo' && recMatch.id > 9_000_000) ? recMatch.id - 9_000_000 : recMatch.id;
      if (percentualDiferenca <= tolerancia) {
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: valorPagoRec, valorGlosa: valorGlosaRec, statusConciliacao: 'conciliado', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalConciliados++;
      } else if (diferenca > 0 && valorPagoRec === 0) {
        // Glosa total: convênio retornou o item mas não pagou nada
        const valorGlosaCalc = valorGlosaRec > 0 ? valorGlosaRec : diferenca;
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: 0, valorGlosa: valorGlosaCalc, statusConciliacao: 'glosa_total', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
        resultado.totalGlosaTotal++;
      } else if (diferenca > 0) {
        // Glosa parcial: convênio pagou menos que o faturado
        const valorGlosaCalc = valorGlosaRec > 0 ? valorGlosaRec : diferenca;
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: valorPagoRec, valorGlosa: valorGlosaCalc, statusConciliacao: 'glosa_parcial', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
        resultado.totalGlosaParcial++;
        resultado.divergencias.push({
          faturamentoId: fat.id,
          recebimentoId: recIdReal,
          codigoItem: codigoItem,
          numeroGuia: guia,
          valorFaturado,
          valorRecebido,
          diferenca,
        });
      } else {
        // Pagamento a maior (convênio pagou mais que faturado) = divergente
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: valorPagoRec, valorGlosa: valorGlosaRec, statusConciliacao: 'divergente', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalDivergentes++;
      }

      // Contabilizar por método
      switch (metodo) {
        case 'guia_codigo': resultado.detalhes.conciliadosPorGuiaCodigo++; break;
        case 'guia_codigo_tuss': resultado.detalhes.conciliadosPorGuiaCodigoTuss++; break;
        case 'vinculacao': resultado.detalhes.conciliadosPorVinculacao++; break;
        case 'paciente_codigo': resultado.detalhes.conciliadosPorPacienteCodigo++; break;
        case 'carteira_codigo': resultado.detalhes.conciliadosPorCarteiraCodigo++; break;
      }
    } else {
      // Não encontrou match no demonstrativo
      // Verificar se o item é de um prestador terceiro
      // Terceiro = código do prestador executante NÃO está entre os códigos próprios cadastrados
      // OU código é NULL mas outros itens da mesma guia têm código próprio (indica que este item é de terceiro)
      const codPrestExec = baseInsert.codigoPrestadorExecutante;
      let isTerceiro = false;
      if (codigosProprios.size > 0) {
        if (codPrestExec && !codigosProprios.has(codPrestExec)) {
          // Código preenchido e NÃO é próprio → terceiro
          isTerceiro = true;
        } else if (!codPrestExec) {
          // Código NULL: verificar se outros itens da mesma guia têm código próprio
          // Usa indexGuiaPrestadores pré-computado para evitar O(n²)
          const temProprioNaGuia = indexGuiaPrestadores.get(String(baseInsert.numeroGuia)) || false;
          if (temProprioNaGuia) {
            isTerceiro = true;
          }
        }
      }
      
      if (isTerceiro) {
        // Item de terceiro: convênio paga diretamente ao terceiro, não é glosa
        inserts.push({ ...baseInsert, recebimentoId: null, recebimentoOrigem: null, valorPago: 0, valorGlosa: 0, statusConciliacao: 'terceiro', metodoConciliacao: null, diferenca: 0, percentualDiferenca: 0, codigoGlosa: null });
        resultado.totalTerceiros = (resultado.totalTerceiros || 0) + 1;
      } else {
        // Item próprio sem match: marcar como 'sem_pagamento' (não encontrado em nenhuma fonte de retorno)
        inserts.push({ ...baseInsert, recebimentoId: null, recebimentoOrigem: null, valorPago: 0, valorGlosa: 0, statusConciliacao: 'sem_pagamento', metodoConciliacao: null, diferenca: valorFaturado, percentualDiferenca: 100, codigoGlosa: null });
        resultado.totalNaoRecebidos++;
      }
    }
  }

  // -------------------------------------------------------
  // PASSO 5.5: Agrupamento de itens duplicados (mesmo guia+código)
  // Quando múltiplos itens do faturamento com mesmo código ficaram "nao_recebido"
  // mas existe um recebimento com quantidade = soma das quantidades, agrupa e pareia.
  // Ex: Faturamento tem 2 linhas de código 90465865 (qtd 4 + qtd 2),
  //     Recebimento tem 1 linha de código 90465865 (qtd 6, valor = soma).
  // -------------------------------------------------------
  // Itens sem match são marcados como 'sem_pagamento' (sem recebimentoId)
  // Filtramos esses para tentar agrupar com recebimentos de mesma guia+código
  const naoRecebidosIdx = inserts
    .map((ins, idx) => ({ ins, idx }))
    .filter(({ ins }) => ins.statusConciliacao === 'sem_pagamento' && ins.recebimentoId === null);

  // Agrupar nao_recebidos por guia+código
  const gruposNaoRecebidos = new Map<string, { ins: typeof inserts[0]; idx: number }[]>();
  for (const item of naoRecebidosIdx) {
    const chave = `${item.ins.numeroGuia}|${item.ins.codigoItem}`;
    if (!gruposNaoRecebidos.has(chave)) gruposNaoRecebidos.set(chave, []);
    gruposNaoRecebidos.get(chave)!.push(item);
  }

  // Para cada grupo com 2+ itens, tentar encontrar recebimento agrupado
  for (const [chave, grupo] of gruposNaoRecebidos) {
    if (grupo.length < 2) continue;

    const somaQuantidade = grupo.reduce((s, g) => s + g.ins.quantidade, 0);
    const somaValor = grupo.reduce((s, g) => s + g.ins.valorFaturado, 0);

    // Buscar recebimento não usado com mesmo guia+código e quantidade compatível
    const candidatos = indexGuiaCodigo.get(chave);
    if (!candidatos) continue;

    const disponiveis = candidatos.filter(c => !recebimentosUsados.has(c.id));
    // Procurar um recebimento cuja quantidade = soma das quantidades do grupo
    let recAgrupado = disponiveis.find(c => {
      const qtdRec = Number(c.quantidade) || 0;
      return Math.abs(qtdRec - somaQuantidade) < 0.01;
    });
    // Fallback: procurar por valor próximo da soma
    if (!recAgrupado) {
      recAgrupado = disponiveis.find(c => {
        const valRec = Number(c.valorPago) || 0;
        return somaValor > 0 && Math.abs(valRec - somaValor) / somaValor <= (tolerancia / 100);
      });
    }

    if (recAgrupado) {
      recebimentosUsados.add(recAgrupado.id);
      const valorRecTotal = Number(recAgrupado.valorPago) || 0;
      const valorGlosaRec = Number(recAgrupado.valorGlosa) || 0;

      // Distribuir o valor pago proporcionalmente entre os itens do grupo
      for (const { ins, idx } of grupo) {
        const proporcao = somaValor > 0 ? ins.valorFaturado / somaValor : 1 / grupo.length;
        const valorPagoProporcional = Math.round(valorRecTotal * proporcao * 100) / 100;
        const valorGlosaProporcional = Math.round(valorGlosaRec * proporcao * 100) / 100;
        const diferenca = ins.valorFaturado - valorPagoProporcional;
        const percentualDiferenca = ins.valorFaturado > 0 ? (Math.abs(diferenca) / ins.valorFaturado) * 100 : 0;

        // Enriquecer com dados do recebimento
        if (recAgrupado.nomeBeneficiario) ins.pacienteNome = String(recAgrupado.nomeBeneficiario);
        if (recAgrupado.codigoGlosa) ins.codigoGlosa = String(recAgrupado.codigoGlosa);

        ins.recebimentoId = recAgrupado.id;
        ins.recebimentoOrigem = 'excel';
        ins.valorPago = valorPagoProporcional;
        ins.valorGlosa = valorGlosaProporcional;
        ins.diferenca = diferenca;
        ins.percentualDiferenca = percentualDiferenca;
        ins.metodoConciliacao = 'agrupamento';

        if (percentualDiferenca <= tolerancia) {
          ins.statusConciliacao = 'conciliado';
          resultado.totalConciliados++;
        } else if (diferenca > 0) {
          // Pagamento parcial = glosa parcial
          ins.statusConciliacao = 'glosa_parcial';
          ins.valorGlosa = ins.valorGlosa > 0 ? ins.valorGlosa : diferenca;
          resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
          resultado.totalGlosaParcial++;
        } else {
          // Pagamento a maior = divergente
          ins.statusConciliacao = 'divergente';
          resultado.totalDivergentes++;
        }
        resultado.totalNaoRecebidos--;
      }
    }
  }

  // -------------------------------------------------------
  // PASSO 5.6: Reagrupar recebimentos duplicados do demonstrativo
  // Quando o convênio divide 1 item em múltiplas linhas no demonstrativo
  // (ex: Gencitabina 1000mg faturada, convênio retorna 2x 500mg = R$345 cada)
  // O matching individual pega apenas 1 recebimento e marca como divergente/glosado.
  // Este passo soma todos os recebimentos disponíveis com mesmo guia+código
  // para reclassificar o item.
  // -------------------------------------------------------
  const divergentesOuGlosados = inserts
    .map((ins, idx) => ({ ins, idx }))
    .filter(({ ins }) => ins.statusConciliacao === 'divergente' || ins.statusConciliacao === 'glosa_parcial' || ins.statusConciliacao === 'glosa_total');

  for (const { ins, idx } of divergentesOuGlosados) {
    const guia = ins.numeroGuia;
    const codigo = ins.codigoItem;
    if (!guia || !codigo) continue;

    const chave = `${guia}|${codigo}`;
    const candidatos = indexGuiaCodigo.get(chave);
    if (!candidatos) continue;

    // Buscar recebimentos NÃO usados com o mesmo guia+código
    const naoUsados = candidatos.filter(c => !recebimentosUsados.has(c.id));
    if (naoUsados.length === 0) continue;

    // Somar o valor pago e glosa dos recebimentos não usados + o recebimento já associado
    let somaValorPago = ins.valorPago;
    let somaValorGlosa = ins.valorGlosa;
    const recebimentosAgrupados: any[] = [];

    for (const rec of naoUsados) {
      somaValorPago += Number(rec.valorPago) || 0;
      somaValorGlosa += Number(rec.valorGlosa) || 0;
      recebimentosAgrupados.push(rec);
    }

    // Verificar se a soma dos recebimentos agrupados é mais próxima do faturado
    const diferencaAtual = Math.abs(ins.valorFaturado - ins.valorPago);
    const diferencaAgrupada = Math.abs(ins.valorFaturado - somaValorPago);

    if (diferencaAgrupada < diferencaAtual) {
      // Marcar todos os recebimentos agrupados como usados
      for (const rec of recebimentosAgrupados) {
        recebimentosUsados.add(rec.id);
      }

      // Atualizar o insert com os valores agrupados
      const percentualDiferenca = ins.valorFaturado > 0 ? (diferencaAgrupada / ins.valorFaturado) * 100 : 0;
      const statusAnterior = ins.statusConciliacao;

      ins.valorPago = somaValorPago;
      ins.valorGlosa = somaValorGlosa;
      ins.diferenca = ins.valorFaturado - somaValorPago;
      ins.percentualDiferenca = percentualDiferenca;
      ins.metodoConciliacao = 'agrupamento_recebimentos';

      // Reclassificar com base na tolerância
      if (somaValorGlosa > 0 && somaValorPago === 0) {
        // Glosa total: convênio retornou com glosa e não pagou nada
        ins.statusConciliacao = 'glosa_total';
        const recComGlosa = recebimentosAgrupados.find(r => r.codigoGlosa);
        if (recComGlosa && !ins.codigoGlosa) {
          ins.codigoGlosa = String(recComGlosa.codigoGlosa);
        }
      } else if (somaValorGlosa > 0 && somaValorPago > 0 && somaValorPago < ins.valorFaturado) {
        // Glosa parcial: convênio pagou parcialmente com glosa explícita
        ins.statusConciliacao = 'glosa_parcial';
        const recComGlosa = recebimentosAgrupados.find(r => r.codigoGlosa);
        if (recComGlosa && !ins.codigoGlosa) {
          ins.codigoGlosa = String(recComGlosa.codigoGlosa);
        }
      } else if (percentualDiferenca <= tolerancia) {
        ins.statusConciliacao = 'conciliado';
      } else if (ins.valorFaturado - somaValorPago > 0) {
        // Pagamento parcial sem glosa explícita = glosa parcial
        ins.statusConciliacao = 'glosa_parcial';
        ins.valorGlosa = ins.valorGlosa > 0 ? ins.valorGlosa : (ins.valorFaturado - somaValorPago);
      } else {
        // Pagamento a maior = divergente
        ins.statusConciliacao = 'divergente';
      }

      // Atualizar contadores
      if (statusAnterior === 'divergente') resultado.totalDivergentes--;
      if (statusAnterior === 'glosa_parcial') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaParcial--; }
      if (statusAnterior === 'glosa_total') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaTotal--; }
      if (ins.statusConciliacao === 'conciliado') resultado.totalConciliados++;
      else if (ins.statusConciliacao === 'glosa_parcial') { resultado.totalGlosados = (resultado.totalGlosados || 0) + 1; resultado.totalGlosaParcial++; }
      else if (ins.statusConciliacao === 'glosa_total') { resultado.totalGlosados = (resultado.totalGlosados || 0) + 1; resultado.totalGlosaTotal++; }
      else if (ins.statusConciliacao === 'divergente') resultado.totalDivergentes++;
    }
  }

  // -------------------------------------------------------
  // PASSO 5.7: Detectar itens ACRÉSCIMO (presentes no demonstrativo mas NÃO no faturamento)
  // Quando o convênio substitui um procedimento (ex: diária apartamento → hospital dia),
  // o item substitutivo aparece no demonstrativo mas não existe no faturamento.
  // Esses itens devem ser registrados como 'acrescimo' para visibilidade.
  // -------------------------------------------------------
  const codigosFaturados = new Set(itensFaturamento.map((f: any) => `${f.numeroGuia}|${f.codigoItem}`));
  const acrescimosDetectados: any[] = [];
  
  for (const rec of itensRecebimento) {
    if (recebimentosUsados.has(rec.id)) continue; // Já usado em algum match
    const chave = `${rec.numeroGuia}|${rec.codigoItem}`;
    if (codigosFaturados.has(chave)) continue; // Código existe no faturamento (pode ser match futuro)
    
    // Item do demonstrativo que NÃO existe no faturamento = ACRÉSCIMO
    const valorPago = Number(rec.valorPago) || 0;
    const valorGlosa = Number(rec.valorGlosa) || 0;
    if (valorPago <= 0 && valorGlosa <= 0) continue; // Ignorar registros zerados
    
    const origemRec = rec._origem === 'demonstrativo' ? 'demonstrativo' : 'excel';
    acrescimosDetectados.push({
      faturamentoUnificadoId: 0, // Sentinela: não existe no faturamento
      contaNumero: null,
      numeroGuia: String(rec.numeroGuia || ''),
      pacienteNome: rec.nomeBeneficiario ? String(rec.nomeBeneficiario) : null,
      convenio: inserts.length > 0 ? inserts[0].convenio : null,
      convenioId: params.convenioId || (inserts.length > 0 ? inserts[0].convenioId : null),
      competencia: params.competencia || (inserts.length > 0 ? inserts[0].competencia : null),
      codigoItem: String(rec.codigoItem || ''),
      codigoItemTuss: null,
      descricaoItem: rec.descricaoItem ? String(rec.descricaoItem) : null,
      tipoItem: rec.tipoLancamento ? String(rec.tipoLancamento) : null,
      origemSistema: 'DEMONSTRATIVO',
      dataExecucao: null,
      codigoPrestadorExecutante: null,
      valorFaturado: 0,
      quantidade: Number(rec.quantidade) || 1,
      recebimentoId: rec.id,
      recebimentoOrigem: origemRec,
      valorPago: valorPago,
      valorGlosa: valorGlosa,
      codigoGlosa: rec.codigoGlosa ? String(rec.codigoGlosa) : null,
      motivoGlosa: null,
      statusConciliacao: 'acrescimo',
      metodoConciliacao: 'acrescimo_demonstrativo',
      diferenca: -valorPago, // Negativo = hospital recebeu a mais do que faturou
      percentualDiferenca: 0,
    });
    recebimentosUsados.add(rec.id);
    resultado.totalAcrescimos++;
  }
  
  if (acrescimosDetectados.length > 0) {
    console.log(`[Conciliacao] ${acrescimosDetectados.length} itens acréscimo detectados (presentes no demonstrativo, ausentes no faturamento)`);
    inserts.push(...acrescimosDetectados);
  }

  // -------------------------------------------------------
  // PASSO 5.8: Busca de pagamento cruzado em outras competências
  // Para itens 'sem_pagamento', verificar se a guia foi paga em outro mês
  // Ex: Guia faturada em 03/2026, não paga em 04/2026, mas paga em 05/2026
  // -------------------------------------------------------
  const itensSemPagamento = inserts.filter(ins => ins.statusConciliacao === 'sem_pagamento');
  if (itensSemPagamento.length > 0) {
    // Coletar guias únicas sem pagamento
    const guiasSemPagamento = [...new Set(itensSemPagamento.map(ins => ins.numeroGuia).filter(Boolean))];
    
    if (guiasSemPagamento.length > 0 && guiasSemPagamento.length <= 5000) {
      // Buscar no demonstrativo de OUTRAS competências se essas guias foram pagas
      const guiasEsc = guiasSemPagamento.map(g => `'${String(g).replace(/'/g, "''")}'`).join(',');
      const buscaCruzadaQuery = `
        SELECT 
          d.numero_guia,
          d.codigo_item,
          d.valor_pago,
          DATE_FORMAT(a.dataReferencia, '%Y-%m') as competenciaPagamento
        FROM demonstrativo d
        JOIN arquivos a ON d.arquivo_id = a.id
        WHERE d.numero_guia IN (${guiasEsc})
          AND d.estabelecimentoId = ${params.estabelecimentoId}
          AND d.valor_pago > 0
          AND DATE_FORMAT(a.dataReferencia, '%Y-%m') != '${params.competencia}'
        ORDER BY a.dataReferencia DESC
      `;
      
      try {
        const [rowsCruzada] = await db.execute(sql.raw(buscaCruzadaQuery));
        const pagamentosCruzados = rowsCruzada as any[];
        
        if (pagamentosCruzados.length > 0) {
          // Indexar por guia+codigo para lookup rápido
          const indexPagCruzado = new Map<string, string>(); // guia|codigo -> competenciaPagamento
          for (const pc of pagamentosCruzados) {
            const chave = `${pc.numero_guia}|${pc.codigo_item}`;
            if (!indexPagCruzado.has(chave)) {
              indexPagCruzado.set(chave, pc.competenciaPagamento);
            }
          }
          
          // Marcar itens sem_pagamento que foram pagos em outra competência
          let totalCruzados = 0;
          for (const ins of itensSemPagamento) {
            const chave = `${ins.numeroGuia}|${ins.codigoItem}`;
            const compPag = indexPagCruzado.get(chave);
            if (compPag) {
              (ins as any).competenciaPagamento = compPag;
              totalCruzados++;
            }
          }
          
          if (totalCruzados > 0) {
            console.log(`[Conciliacao] ${totalCruzados} itens sem_pagamento encontrados pagos em outras competências`);
          }
        }
      } catch (e: any) {
        console.error(`[Conciliacao] Erro na busca cruzada: ${e.message?.substring(0, 200)}`);
      }
    }
  }

  // -------------------------------------------------------
  // PASSO 6: INSERT em MEGA-BATCH na tabela conciliados_automatico
  // Usa batches de 5000 para minimizar roundtrips ao banco
  // (conciliações anteriores já foram deletadas no PASSO 0.5)
  // -------------------------------------------------------
  const MEGA_BATCH = 5000;
  const escDate = (v: any): string => {
    if (v === null || v === undefined) return 'NULL';
    // Se for objeto Date ou string que parece Date JS, converter para formato MySQL
    const d = v instanceof Date ? v : new Date(v);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `'${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}'`;
    }
    return 'NULL';
  };
  const esc = (v: string | null | undefined) => {
    if (v === null || v === undefined || v === '') return 'NULL';
    const sanitized = String(v)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .substring(0, 500);
    return `'${sanitized}'`;
  };

  const toRow = (r: typeof inserts[0]) =>
    `(${r.faturamentoUnificadoId},${params.estabelecimentoId},${esc(r.contaNumero)},${esc(r.numeroGuia)},${esc(r.pacienteNome)},${esc(r.convenio)},${r.convenioId??'NULL'},${esc(r.competencia)},${esc(r.codigoItem)},${esc(r.codigoItemTuss)},${esc(r.descricaoItem)},${esc(r.tipoItem)},${esc(r.origemSistema)},${escDate(r.dataExecucao)},${esc((r as any).codigoPrestadorExecutante)},${r.valorFaturado},${r.quantidade},${r.recebimentoId??'NULL'},${r.recebimentoOrigem?esc(r.recebimentoOrigem):'NULL'},${r.valorPago},${r.valorGlosa},${esc(r.codigoGlosa)},${esc(r.motivoGlosa)},${esc(r.statusConciliacao)},${r.metodoConciliacao?esc(r.metodoConciliacao):'NULL'},${r.diferenca},${r.percentualDiferenca},${tolerancia},${esc((r as any).competenciaPagamento || null)},NOW())`;

  const INSERT_COLS = `(faturamentoUnificadoId,estabelecimentoId,contaNumero,numeroGuia,pacienteNome,convenio,convenioId,competencia,codigoItem,codigoItemTuss,descricaoItem,tipoItem,origemSistema,dataExecucao,codigoPrestadorExecutante,valorFaturado,quantidade,recebimentoId,recebimentoOrigem,valorPago,valorGlosa,codigoGlosa,motivoGlosa,statusConciliacao,metodoConciliacao,diferenca,percentualDiferenca,toleranciaUsada,competenciaPagamento,criadoEm)`;

  console.log(`[Conciliacao] Inserindo ${inserts.length} registros em batches de ${MEGA_BATCH}...`);
  const t0 = Date.now();
  // Usar mysql2 diretamente para INSERTs em massa (Drizzle db.execute tem limitações com queries grandes)
  const rawPool = await getRawPool();
  const execInsert = rawPool
    ? async (querySql: string) => { await rawPool.query(querySql); }
    : async (querySql: string) => { await db.execute(sql.raw(querySql)); };

  for (let i = 0; i < inserts.length; i += MEGA_BATCH) {
    const batch = inserts.slice(i, i + MEGA_BATCH);
    const values = batch.map(toRow).join(',');
    try {
      await execInsert(`INSERT INTO conciliados_automatico ${INSERT_COLS} VALUES ${values}`);
    } catch (err: any) {
      console.error(`[Conciliacao] Erro mega-batch ${i}: ${err.message?.substring(0, 500)} | CODE: ${err.code} | ERRNO: ${err.errno}. Tentando sub-batches...`);
      // Fallback: sub-batches de 500
      for (let j = 0; j < batch.length; j += 500) {
        const sub = batch.slice(j, j + 500);
        try {
          await execInsert(`INSERT INTO conciliados_automatico ${INSERT_COLS} VALUES ${sub.map(toRow).join(',')}`);
        } catch (subErr: any) {
          console.error(`[Conciliacao] Erro sub-batch ${i+j}: ${subErr.message?.substring(0, 500)}`);
          // Último recurso: um a um
          for (const r of sub) {
            try {
              await execInsert(`INSERT INTO conciliados_automatico ${INSERT_COLS} VALUES ${toRow(r)}`);
            } catch (e: any) {
              console.error(`[Conciliacao] Erro id=${r.faturamentoUnificadoId}: ${e.message?.substring(0, 300)} | SQL: ${toRow(r).substring(0, 200)}`);
            }
          }
        }
      }
    }
  }
  console.log(`[Conciliacao] INSERT concluído em ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // -------------------------------------------------------
  // PASSO 7: UPDATE em massa do statusConciliacao no faturamento_unificado
  // Agrupa TODOS os IDs por status e faz 1 UPDATE por status (max ~5 queries)
  // -------------------------------------------------------
  const t1 = Date.now();
  const porStatus = new Map<string, number[]>();
  for (const ins of inserts) {
    const st = ins.statusConciliacao;
    if (!porStatus.has(st)) porStatus.set(st, []);
    porStatus.get(st)!.push(ins.faturamentoUnificadoId);
  }

  for (const [status, ids] of porStatus) {
    if (ids.length === 0) continue;
    // Processar em chunks de 10000 IDs para evitar query muito longa
    for (let i = 0; i < ids.length; i += 10000) {
      const chunk = ids.slice(i, i + 10000);
      await db.execute(sql.raw(
        `UPDATE faturamento_unificado SET statusConciliacao = '${status}' WHERE id IN (${chunk.join(',')})`
      ));
    }
  }
  console.log(`[Conciliacao] UPDATE concluído em ${((Date.now()-t1)/1000).toFixed(1)}s`);

  return resultado;
}

/**
 * Reseta a conciliação: deleta registros da conciliados_automatico
 */
export async function resetarConciliacao(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ resetados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND convenioId = ${params.convenioId}`;
  }

  // Contar antes
  const [countRows] = await db.execute(sql.raw(
    `SELECT COUNT(*) as total FROM conciliados_automatico ${whereClause}`
  ));
  const total = Number((countRows as any)?.[0]?.total || 0);

  // Resetar statusConciliacao no faturamento_unificado para 'pendente'
  // Primeiro buscar os IDs do faturamento_unificado que serão afetados
  const [idsRows] = await db.execute(sql.raw(
    `SELECT DISTINCT faturamentoUnificadoId FROM conciliados_automatico ${whereClause}`
  ));
  const idsAfetados = (idsRows as unknown as any[]).map((r: any) => r.faturamentoUnificadoId).filter(Boolean);
  
  if (idsAfetados.length > 0) {
    // Atualizar em batches de 500
    for (let i = 0; i < idsAfetados.length; i += 500) {
      const batch = idsAfetados.slice(i, i + 500);
      await db.execute(sql.raw(
        `UPDATE faturamento_unificado SET statusConciliacao = 'pendente' WHERE id IN (${batch.join(',')})`
      ));
    }
  }

  // Deletar registros de conciliação
  const query = `DELETE FROM conciliados_automatico ${whereClause}`;
  await db.execute(sql.raw(query));

  return { resetados: total };
}

/**
 * Lista os resultados da conciliação automática com filtros
 */
export async function listarConciliadosAutomatico(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  statusConciliacao?: string;
  busca?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.statusConciliacao && params.statusConciliacao !== 'todos') {
    whereClause += ` AND ca.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
  }
  if (params.busca) {
    const b = params.busca.replace(/'/g, "''");
    whereClause += ` AND (ca.numeroGuia LIKE '%${b}%' OR ca.contaNumero LIKE '%${b}%' OR ca.pacienteNome LIKE '%${b}%' OR ca.convenio LIKE '%${b}%' OR ca.codigoItem LIKE '%${b}%')`;
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  // Contar total
  const [countRows] = await db.execute(sql.raw(
    `SELECT COUNT(*) as total FROM conciliados_automatico ca ${whereClause}`
  ));
  const total = Number((countRows as any)?.[0]?.total || 0);

  // Buscar itens
  const query = `
    SELECT 
      ca.id, ca.faturamentoUnificadoId, ca.contaNumero, ca.numeroGuia,
      ca.pacienteNome, ca.convenio, ca.convenioId, ca.competencia,
      ca.codigoItem, ca.codigoItemTuss, ca.descricaoItem, ca.tipoItem, ca.origemSistema,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.quantidade, 0) as quantidade,
      ca.recebimentoId, ca.recebimentoOrigem,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa, ca.motivoGlosa,
      ca.statusConciliacao, ca.metodoConciliacao,
      COALESCE(ca.diferenca, 0) as diferenca,
      COALESCE(ca.percentualDiferenca, 0) as percentualDiferenca,
      ca.toleranciaUsada, ca.competenciaPagamento, ca.criadoEm
    FROM conciliados_automatico ca
    ${whereClause}
    ORDER BY ca.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [rows] = await db.execute(sql.raw(query));
  return { items: rows as unknown as any[], total };
}

/**
 * Resumo dos resultados da conciliação automática por status
 */
export async function resumoConciliadosAutomatico(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  dataPagto?: string;
}): Promise<{
  totalConciliados: number;
  totalDivergentes: number;
  totalNaoRecebidos: number;
  totalTerceiros: number;
  totalAcrescimos: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalGlosa: number;
  valorTotalDiferenca: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.dataPagto) {
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND ca.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dp}')`;
  }

  const query = `
    SELECT 
      ca.statusConciliacao,
      COUNT(*) as total,
      COALESCE(SUM(ca.valorFaturado), 0) as valorFaturado,
      COALESCE(SUM(ca.valorPago), 0) as valorPago,
      COALESCE(SUM(ca.valorGlosa), 0) as valorGlosa,
      COALESCE(SUM(ca.diferenca), 0) as diferenca
    FROM conciliados_automatico ca
    ${whereClause}
    GROUP BY ca.statusConciliacao
  `;

  const [rows] = await db.execute(sql.raw(query));
  const data = rows as unknown as any[];

  const resumo = {
    totalConciliados: 0,
    totalDivergentes: 0,
    totalNaoRecebidos: 0,
    totalGlosaTotal: 0,
    totalGlosaParcial: 0,
    totalSemPagamento: 0,
    totalTerceiros: 0,
    totalAcrescimos: 0,
    valorTotalFaturado: 0,
    valorTotalPago: 0,
    valorTotalGlosa: 0,
    valorTotalDiferenca: 0,
  };

  for (const row of data) {
    const count = Number(row.total) || 0;
    const valFat = Number(row.valorFaturado) || 0;
    const valPago = Number(row.valorPago) || 0;
    const valGlosa = Number(row.valorGlosa) || 0;
    const valDif = Number(row.diferenca) || 0;

    resumo.valorTotalFaturado += valFat;
    resumo.valorTotalPago += valPago;
    resumo.valorTotalGlosa += valGlosa;
    resumo.valorTotalDiferenca += valDif;

    switch (row.statusConciliacao) {
      case 'conciliado': resumo.totalConciliados = count; break;
      case 'divergente': resumo.totalDivergentes = count; break;
      case 'nao_recebido': resumo.totalNaoRecebidos = count; break;
      case 'sem_pagamento': resumo.totalSemPagamento = count; break;
      case 'glosa_total': resumo.totalGlosaTotal = count; break;
      case 'glosa_parcial': resumo.totalGlosaParcial = count; break;
      case 'terceiro': resumo.totalTerceiros = count; break;
      case 'acrescimo': resumo.totalAcrescimos = count; break;
    }
  }

  return resumo;
}

// ============================================================
// QUERIES PARA ABA CONCILIADOS - AGRUPADO POR GUIA
// ============================================================

/**
 * Competências disponíveis na tabela conciliados_automatico
 * Também inclui competências do faturamento_unificado que ainda não foram conciliadas
 */
export async function competenciasConciliados(estabelecimentoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  // Unir competências de ambas as tabelas para que o dropdown mostre todas
  const [rows] = await db.execute(sql.raw(
    `SELECT competencia, SUM(total) as total FROM (
       SELECT competencia, COUNT(*) as total
       FROM conciliados_automatico
       WHERE estabelecimentoId = ${estabelecimentoId}
       GROUP BY competencia
       UNION ALL
       SELECT competencia, COUNT(*) as total
       FROM faturamento_unificado
       WHERE estabelecimentoId = ${estabelecimentoId}
       GROUP BY competencia
     ) combined
     GROUP BY competencia
     ORDER BY competencia DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.competencia);
}

/**
 * Convênios disponíveis na tabela conciliados_automatico
 */
export async function conveniosConciliados(estabelecimentoId: number, competencia?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  let where = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (competencia) {
    where += ` AND competencia LIKE '${competencia.replace(/'/g, "''")}%'`;
  }
  const [rows] = await db.execute(sql.raw(
    `SELECT convenioId, convenio, COUNT(*) as total
     FROM conciliados_automatico
     ${where}
     GROUP BY convenioId, convenio
     ORDER BY total DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.convenioId);
}

/**
 * Resumo agrupado por GUIA dos conciliados automáticos
 * Retorna: guia, paciente, convênio, competência, totalItens, valorFaturado, valorPago, valorGlosa, diferença, status
 */
export async function resumoConciliadosPorGuia(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  statusConciliacao?: string;
  busca?: string;
  loteXml?: string;
  loteRetorno?: string;
  dataPagto?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.statusConciliacao && params.statusConciliacao !== 'todos') {
    // Filtrar guias que tenham pelo menos 1 item com esse status
    whereClause += ` AND ca.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
  }
  if (params.busca) {
    const b = params.busca.replace(/'/g, "''");
    whereClause += ` AND (ca.numeroGuia LIKE '%${b}%' OR ca.contaNumero LIKE '%${b}%' OR ca.pacienteNome LIKE '%${b}%' OR ca.convenio LIKE '%${b}%')`;
  }
  if (params.loteXml) {
    // Filtrar pelo lote do XML TISS via JOIN com faturamento_unificado
    whereClause += ` AND ca.faturamentoUnificadoId IN (SELECT fu.id FROM faturamento_unificado fu WHERE fu.lotePrestador = '${params.loteXml.replace(/'/g, "''")}' AND fu.estabelecimentoId = ${params.estabelecimentoId})`;
  }
  if (params.loteRetorno) {
    // Filtrar pelo lote do retorno/demonstrativo via guia
    const lr = params.loteRetorno.replace(/'/g, "''");
    whereClause += ` AND ca.numeroGuia IN (SELECT DISTINCT d.numero_guia FROM demonstrativo d WHERE d.estabelecimentoId = ${params.estabelecimentoId} AND d.lote_prestador = '${lr}')`;
  }
  if (params.dataPagto) {
    // Filtrar pela data de pagamento do demonstrativo (recebimentos_excel.data_pagto)
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND ca.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dp}')`;
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  // Buscar guias agrupadas
  const query = `
    SELECT 
      COALESCE(ca.numeroGuia, ca.contaNumero) as guia,
      ca.numeroGuia,
      ca.contaNumero,
      MAX(ca.pacienteNome) as pacienteNome,
      MAX(ca.convenio) as convenio,
      MAX(ca.convenioId) as convenioId,
      MAX(ca.competencia) as competencia,
      MAX(ca.origemSistema) as origemSistema,
      COUNT(*) as totalItens,
      COALESCE(SUM(ca.valorFaturado), 0) as valorFaturado,
      COALESCE(SUM(ca.valorPago), 0) as valorPago,
      COALESCE(SUM(ca.valorGlosa), 0) as valorGlosa,
      COALESCE(SUM(ca.diferenca), 0) as diferenca,
      -- Lote e Protocolo do XML (faturamento_unificado)
      MAX(fu.lotePrestador) as loteXml,
      MAX(fu.protocolo) as protocoloXml,
      -- Lote e Protocolo do Retorno (demonstrativo) via subquery
      (SELECT d.lote_prestador FROM demonstrativo d WHERE d.numero_guia = ca.numeroGuia AND d.estabelecimentoId = ca.estabelecimentoId LIMIT 1) as loteRetorno,
      (SELECT d.protocolo FROM demonstrativo d WHERE d.numero_guia = ca.numeroGuia AND d.estabelecimentoId = ca.estabelecimentoId LIMIT 1) as protocoloRetorno,
      -- Status da guia: prioridade: glosa_total > glosa_parcial > sem_pagamento > divergente > terceiro > acrescimo > conciliado
      CASE
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'glosa_total' THEN 1 ELSE 0 END) > 0 THEN 'glosa_total'
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'glosa_parcial' THEN 1 ELSE 0 END) > 0 THEN 'glosa_parcial'
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'sem_pagamento' THEN 1 ELSE 0 END) > 0 THEN 'sem_pagamento'
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'divergente' THEN 1 ELSE 0 END) > 0 THEN 'divergente'
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'terceiro' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN ca.statusConciliacao NOT IN ('terceiro','acrescimo') THEN 1 ELSE 0 END) = 0 THEN 'terceiro'
        WHEN SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) > 0 THEN 'acrescimo'
        ELSE 'conciliado'
      END as statusGuia,
      SUM(CASE WHEN ca.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as itensConciliados,
      SUM(CASE WHEN ca.statusConciliacao = 'divergente' THEN 1 ELSE 0 END) as itensDivergentes,
      SUM(CASE WHEN ca.statusConciliacao = 'sem_pagamento' THEN 1 ELSE 0 END) as itensSemPagamento,
      SUM(CASE WHEN ca.statusConciliacao = 'glosa_total' THEN 1 ELSE 0 END) as itensGlosaTotal,
      SUM(CASE WHEN ca.statusConciliacao = 'glosa_parcial' THEN 1 ELSE 0 END) as itensGlosaParcial,
      SUM(CASE WHEN ca.statusConciliacao = 'terceiro' THEN 1 ELSE 0 END) as itensTerceiros,
      SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) as itensAcrescimos,
      SUM(CASE WHEN ca.metodoConciliacao = 'agrupamento' THEN 1 ELSE 0 END) as itensAgrupados,
      COUNT(DISTINCT ca.contaNumero) as totalContas,
      MAX(ca.codigoPrestadorExecutante) as codigoPrestadorExecutante
    FROM conciliados_automatico ca
    LEFT JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
    ${whereClause}
    GROUP BY COALESCE(ca.numeroGuia, ca.contaNumero), ca.numeroGuia, ca.contaNumero, ca.estabelecimentoId
    ORDER BY SUM(ABS(ca.diferenca)) DESC, guia
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Executar count e query principal em paralelo
  const [[rows], [countRows]] = await Promise.all([
    db.execute(sql.raw(query)),
    db.execute(sql.raw(
      `SELECT COUNT(DISTINCT COALESCE(ca.numeroGuia, ca.contaNumero)) as total
       FROM conciliados_automatico ca ${whereClause}`
    )),
  ]);
  const total = Number((countRows as unknown as any[])?.[0]?.total || 0);
  return { items: rows as unknown as any[], total };
}

/**
 * Itens detalhados de uma guia na conciliados_automatico
 */
export async function itensConciliadosPorGuia(params: {
  estabelecimentoId: number;
  numeroGuia?: string;
  contaNumero?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.numeroGuia) {
    whereClause += ` AND ca.numeroGuia = '${params.numeroGuia.replace(/'/g, "''")}'`;
  }
  if (params.contaNumero) {
    whereClause += ` AND ca.contaNumero = '${params.contaNumero.replace(/'/g, "''")}'`;
  }

  const query = `
    SELECT 
      ca.id, ca.faturamentoUnificadoId, ca.contaNumero, ca.numeroGuia,
      ca.pacienteNome, ca.convenio, ca.convenioId, ca.competencia,
      ca.codigoItem, ca.codigoItemTuss,
      COALESCE(ca.descricaoItem, fu.descricaoItem) as descricaoItem,
      COALESCE(ca.tipoItem, fu.tipoItem) as tipoItem,
      ca.origemSistema,
      COALESCE(ca.dataExecucao, fu.dataExecucao) as dataExecucao,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.quantidade, 0) as quantidade,
      ca.recebimentoId, ca.recebimentoOrigem,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      mg.grupo as grupoGlosa,
      ca.statusConciliacao, ca.metodoConciliacao,
      COALESCE(ca.diferenca, 0) as diferenca,
      COALESCE(ca.percentualDiferenca, 0) as percentualDiferenca,
      ca.toleranciaUsada, ca.competenciaPagamento, ca.criadoEm
    FROM conciliados_automatico ca
    LEFT JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
    LEFT JOIN motivosGlosa mg ON ca.codigoGlosa = mg.codigo AND mg.ativo = 'sim'
    ${whereClause}
    ORDER BY ca.codigoItem, ca.id
  `;

  const [rows] = await db.execute(sql.raw(query));
  return rows as unknown as any[];
}

// ============================================================
// GLOSAR ITENS NÃO RECEBIDOS
// ============================================================

/**
 * Glosar itens individuais da conciliados_automatico
 * Muda o status de 'sem_pagamento' ou 'divergente' para 'glosa_total' e preenche valorGlosa
 */
export async function glosarItens(params: {
  ids: number[];
  estabelecimentoId: number;
  motivoGlosa?: string;
  codigoGlosa?: string;
}): Promise<{ atualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (params.ids.length === 0) return { atualizados: 0 };

  const esc = (v: string | null | undefined) => v ? `'${v.replace(/'/g, "''")}'` : 'NULL';
  const ids = params.ids.join(',');

  const query = `
    UPDATE conciliados_automatico 
    SET statusConciliacao = 'glosa_total',
        valorGlosa = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN valorFaturado - valorPago ELSE valorFaturado END,
        valorPago = CASE WHEN statusConciliacao = 'divergente' THEN valorPago ELSE 0 END,
        diferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN valorFaturado - valorPago ELSE valorFaturado END,
        percentualDiferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN ROUND(((valorFaturado - valorPago) / valorFaturado) * 100, 2) ELSE 100 END,
        motivoGlosa = ${esc(params.motivoGlosa)},
        codigoGlosa = ${esc(params.codigoGlosa)}
    WHERE id IN (${ids})
      AND estabelecimentoId = ${params.estabelecimentoId}
      AND statusConciliacao IN ('sem_pagamento', 'divergente', 'nao_recebido')
  `;

  const [result] = await db.execute(sql.raw(query));
  const atualizados = (result as any)?.affectedRows || 0;
  return { atualizados: Number(atualizados) };
}

/**
 * Glosar TODOS os itens sem pagamento e divergentes de uma guia
 */
export async function glosarTodosNaoRecebidosPorGuia(params: {
  estabelecimentoId: number;
  numeroGuia?: string;
  contaNumero?: string;
  motivoGlosa?: string;
  codigoGlosa?: string;
}): Promise<{ atualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const esc = (v: string | null | undefined) => v ? `'${v.replace(/'/g, "''")}'` : 'NULL';

  let whereClause = `WHERE estabelecimentoId = ${params.estabelecimentoId} AND statusConciliacao IN ('sem_pagamento', 'divergente', 'nao_recebido')`;
  if (params.numeroGuia) {
    whereClause += ` AND numeroGuia = ${esc(params.numeroGuia)}`;
  }
  if (params.contaNumero) {
    whereClause += ` AND contaNumero = ${esc(params.contaNumero)}`;
  }

  const query = `
    UPDATE conciliados_automatico 
    SET statusConciliacao = 'glosa_total',
        valorGlosa = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN valorFaturado - valorPago ELSE valorFaturado END,
        valorPago = CASE WHEN statusConciliacao = 'divergente' THEN valorPago ELSE 0 END,
        diferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN valorFaturado - valorPago ELSE valorFaturado END,
        percentualDiferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN ROUND(((valorFaturado - valorPago) / valorFaturado) * 100, 2) ELSE 100 END,
        motivoGlosa = ${esc(params.motivoGlosa)},
        codigoGlosa = ${esc(params.codigoGlosa)}
    ${whereClause}
  `;

  const [result] = await db.execute(sql.raw(query));
  const atualizados = (result as any)?.affectedRows || 0;
  return { atualizados: Number(atualizados) };
}

/**
 * Reverter glosa de itens (voltar para status anterior - sem_pagamento)
 */
export async function reverterGlosa(params: {
  ids: number[];
  estabelecimentoId: number;
}): Promise<{ atualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (params.ids.length === 0) return { atualizados: 0 };

  const ids = params.ids.join(',');

  // Reverter glosa: volta para 'sem_pagamento' (itens sem pagamento)
  const query = `
    UPDATE conciliados_automatico 
    SET statusConciliacao = 'sem_pagamento',
        valorGlosa = 0,
        diferenca = valorFaturado,
        percentualDiferenca = 100,
        motivoGlosa = NULL,
        codigoGlosa = NULL
    WHERE id IN (${ids})
      AND estabelecimentoId = ${params.estabelecimentoId}
      AND statusConciliacao IN ('glosa_total', 'glosa_parcial', 'glosado')
  `;

  const [result] = await db.execute(sql.raw(query));
  const atualizados = (result as any)?.affectedRows || 0;
  return { atualizados: Number(atualizados) };
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Normaliza nome para comparação (remove acentos, lowercase, trim)
 */
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Encontra o melhor match entre uma lista de recebimentos candidatos.
 * Prioriza recebimentos ainda não usados e com valor mais próximo.
 */
function encontrarMelhorMatch(
  candidatos: any[] | undefined,
  usados: Set<number>,
  valorFaturado: number
): any | null {
  if (!candidatos || candidatos.length === 0) return null;

  // Filtrar candidatos não usados
  const disponiveis = candidatos.filter(c => !usados.has(c.id));
  if (disponiveis.length === 0) return null;

  // Se só tem um, retorna ele
  if (disponiveis.length === 1) return disponiveis[0];

  // Priorizar por proximidade de valor
  let melhor = disponiveis[0];
  let menorDiferenca = Math.abs(valorFaturado - (Number(melhor.valorPago) || 0));

  for (let i = 1; i < disponiveis.length; i++) {
    const diff = Math.abs(valorFaturado - (Number(disponiveis[i].valorPago) || 0));
    if (diff < menorDiferenca) {
      menorDiferenca = diff;
      melhor = disponiveis[i];
    }
  }

  return melhor;
}


// ============================================================
// LOTES DISPONÍVEIS PARA FILTROS
// ============================================================

/**
 * Lista lotes do demonstrativo (lote_prestador) para filtro na conciliação cruzada
 */
export async function lotesRetornoDisponiveis(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ lote: string; protocolo: string; total: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let where = `WHERE d.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    where += ` AND DATE_FORMAT(d.data_referencia, '%Y-%m') = '${params.competencia.replace(/'/g, "''")}'`;
  }
  if (params.convenioId) {
    where += ` AND d.convenio_id = ${params.convenioId}`;
  }

  const [rows] = await db.execute(sql.raw(
    `SELECT d.lote_prestador as lote, d.protocolo, COUNT(*) as total
     FROM demonstrativo d
     ${where}
     AND d.lote_prestador IS NOT NULL AND d.lote_prestador != ''
     GROUP BY d.lote_prestador, d.protocolo
     ORDER BY d.lote_prestador DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.lote);
}

/**
 * Lista lotes do XML TISS (numero_lote) para filtro na conciliação cruzada
 */
export async function lotesXmlTissDisponiveis(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ lote: string; total: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let where = `WHERE ft.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    where += ` AND DATE_FORMAT(ft.data_referencia, '%Y-%m') = '${params.competencia.replace(/'/g, "''")}'`;
  }
  if (params.convenioId) {
    where += ` AND ft.convenioId = ${params.convenioId}`;
  }

  const [rows] = await db.execute(sql.raw(
    `SELECT ft.numero_lote as lote, COUNT(*) as total
     FROM faturamento_tiss ft
     ${where}
     AND ft.numero_lote IS NOT NULL AND ft.numero_lote != ''
     GROUP BY ft.numero_lote
     ORDER BY ft.numero_lote DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.lote);
}


/**
 * Datas de pagamento disponíveis nos recebimentos vinculados à conciliação
 */
export async function datasPagamentoConciliados(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ dataPagto: string; total: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId} AND ca.recebimentoId IS NOT NULL`;
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }

  const query = `
    SELECT 
      DATE_FORMAT(re.data_pagto, '%Y-%m-%d') as dataPagto,
      COUNT(DISTINCT ca.id) as total
    FROM conciliados_automatico ca
    INNER JOIN recebimentos_excel re ON ca.recebimentoId = re.id
    ${whereClause}
    AND re.data_pagto IS NOT NULL
    GROUP BY DATE_FORMAT(re.data_pagto, '%Y-%m-%d')
    ORDER BY dataPagto DESC
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]).map((r: any) => ({
    dataPagto: r.dataPagto,
    total: Number(r.total) || 0,
  }));
}
