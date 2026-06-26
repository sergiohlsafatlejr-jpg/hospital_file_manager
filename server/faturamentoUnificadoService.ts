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

  // PASSO 2: Inserir itens AGRUPADOS por dia (mesmo código + guia + data)
  // Agrupa itens de setores diferentes em uma única linha, somando qtd e valores
  // Usa LEFT JOIN com faturamento_unificado para não duplicar itens já existentes
  // Inclui resolução de convenioId a partir do nome do convênio na tabela convenios
  const insertQuery = `
    INSERT INTO faturamento_unificado (
      origemSistema, origemId, estabelecimentoId,
      contaNumero, numeroGuia, numeroGuiaOperadora,
      protocolo, lotePrestador, carteiraBeneficiario,
      convenio, convenioId, competencia,
      profissionalExecutante, setor,
      tipoItem, codigoItem, codigoItemTuss,
      descricaoItem, dataExecucao, quantidade,
      valorUnitario, valorFaturado,
      receber,
      dataSincronizacao
    )
    SELECT
      'WARLEINE',
      CAST(MIN(ig._id) AS CHAR),
      ig.estabelecimento_id,
      ig.numconta,
      MAX(ig.guiacobra),
      MAX(ig.aihguia),
      MAX(ig.protocolo),
      MAX(ig.numfatura),
      MAX(ig.matricula),
      TRIM(MAX(ig.nomeconv)),
      MAX(c.id),
      REPLACE(MAX(ig.mesprod), '/', '-'),
      MAX(ig.nomeprest),
      GROUP_CONCAT(DISTINCT ig.nomecc SEPARATOR ' / '),
      ig.tipoproc,
      ig.procdisco,
      MAX(ig.codproprio),
      MAX(ig.descricao),
      DATE(ig.data),
      SUM(ig.quantidade),
      ROUND(SUM(ig.vl_faturado) / NULLIF(SUM(ig.quantidade), 0), 6),
      SUM(ig.vl_faturado),
      ig.receber,
      NOW()
    FROM integ_faturado ig
    LEFT JOIN convenios c 
      ON UPPER(TRIM(c.nome)) = UPPER(TRIM(ig.nomeconv))
      OR UPPER(TRIM(ig.nomeconv)) LIKE CONCAT('%', UPPER(TRIM(c.nome)), '%')
      OR UPPER(TRIM(c.nome)) LIKE CONCAT('%', UPPER(TRIM(ig.nomeconv)), '%')
    LEFT JOIN faturamento_unificado fu 
      ON fu.origemSistema = 'WARLEINE' 
      AND fu.contaNumero = ig.numconta
      AND fu.codigoItem = ig.procdisco
      AND fu.dataExecucao = DATE(ig.data)
      AND fu.tipoItem = ig.tipoproc
      AND fu.receber = ig.receber
      AND fu.estabelecimentoId = ig.estabelecimento_id
    WHERE ig.estabelecimento_id = ${estabelecimentoId}
      AND fu.id IS NULL
      ${compWarleineFilter}
    GROUP BY ig.estabelecimento_id, ig.numconta, ig.procdisco, ig.tipoproc, DATE(ig.data), ig.receber
  `;

  await db.execute(sql.raw(insertQuery));

  // PASSO 3: Atualizar convenioId para registros existentes que estão com NULL
  // Resolve o nome do convênio para o ID correspondente na tabela convenios
  const updateConvenioIdQuery = `
    UPDATE faturamento_unificado fu
    JOIN convenios c 
      ON UPPER(TRIM(c.nome)) = UPPER(TRIM(fu.convenio))
      OR UPPER(TRIM(fu.convenio)) LIKE CONCAT('%', UPPER(TRIM(c.nome)), '%')
      OR UPPER(TRIM(c.nome)) LIKE CONCAT('%', UPPER(TRIM(fu.convenio)), '%')
    SET fu.convenioId = c.id
    WHERE fu.estabelecimentoId = ${estabelecimentoId}
      AND fu.origemSistema = 'WARLEINE'
      AND fu.convenioId IS NULL
      ${compFilter}
  `;
  await db.execute(sql.raw(updateConvenioIdQuery));

  // PASSO 3.5: Atualizar campo receber para registros existentes que estão com NULL
  const updateReceberQuery = `
    UPDATE faturamento_unificado fu
    JOIN integ_faturado ig 
      ON ig.estabelecimento_id = fu.estabelecimentoId
      AND ig.numconta = fu.contaNumero 
      AND ig.procdisco = fu.codigoItem
      AND REPLACE(ig.mesprod, '/', '-') = fu.competencia
    SET fu.receber = ig.receber
    WHERE fu.estabelecimentoId = ${estabelecimentoId}
      AND fu.origemSistema = 'WARLEINE'
      AND fu.receber IS NULL
      ${compFilter}
  `;
  await db.execute(sql.raw(updateReceberQuery));

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
      COALESCE(dedup.numero_guia_operadora, dedup.numero_guia_prestador),
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
          PARTITION BY COALESCE(ft.numero_guia_operadora, ft.numero_guia_prestador), ft.sequencial_item, ft.codigo_item, ft.data_execucao, ft.quantidade, ft.valor_faturado
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
  
  // Se o estabelecimento tem dados do Warleine, NÃO popular do XML TISS para evitar duplicação
  // O Warleine é a fonte primária e mais completa para esses estabelecimentos
  let xmlTiss = { inseridos: 0, total: 0 };
  if (warleine.total === 0) {
    // Só popular do XML TISS se não houver dados do Warleine
    xmlTiss = await popularDeXmlTiss(estabelecimentoId, competencia);
  }
  
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
  if (params.statusConciliacao && params.statusConciliacao !== 'todos') {
    if (params.statusConciliacao === 'conciliado') {
      whereClause += ` AND fu.statusConciliacao IN ('conciliado','glosa_total','glosa_parcial','divergente','acrescimo','terceiro','glosado')`;
    } else if (params.statusConciliacao === 'sem_conciliacao' || params.statusConciliacao === 'nao_conciliado') {
      whereClause += ` AND fu.statusConciliacao IN ('nao_recebido','sem_pagamento','pendente')`;
    } else if (params.statusConciliacao === 'conciliado_manual') {
      whereClause += ` AND fu.statusConciliacao = 'conciliado_manual'`;
    } else {
      whereClause += ` AND fu.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
    }
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
      SUM(CASE WHEN fu.statusConciliacao IN ('divergente','acrescimo') THEN 1 ELSE 0 END) as totalAcrescimos,
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
    if (params.statusConciliacao === 'conciliado') {
      whereClause += ` AND fu.statusConciliacao IN ('conciliado','glosa_total','glosa_parcial','divergente','acrescimo','terceiro','glosado')`;
    } else if (params.statusConciliacao === 'sem_conciliacao' || params.statusConciliacao === 'nao_conciliado') {
      whereClause += ` AND fu.statusConciliacao IN ('nao_recebido','sem_pagamento','pendente')`;
    } else if (params.statusConciliacao === 'conciliado_manual') {
      whereClause += ` AND fu.statusConciliacao = 'conciliado_manual'`;
    } else {
      whereClause += ` AND fu.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
    }
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
      SUM(CASE WHEN fu.statusConciliacao IN ('divergente','acrescimo') THEN 1 ELSE 0 END) as itensAcrescimos,
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
      itensDivergentes: Number(resumo.itensAcrescimos || resumo.itensDivergentes || 0),
      itensAcrescimos: Number(resumo.itensAcrescimos || resumo.itensDivergentes || 0),
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
      fu.id, fu.codigoItem, fu.codigoItemTuss, fu.numeroGuia, fu.numeroGuiaOperadora, fu.contaNumero,
      fu.pacienteNome, fu.carteiraBeneficiario, fu.convenioId, fu.competencia,
      fu.convenio, fu.origemSistema, fu.descricaoItem, fu.tipoItem,
      fu.dataExecucao, fu.codigoPrestadorExecutante,
      COALESCE(fu.valorFaturado, 0) as valorFaturado,
      COALESCE(fu.quantidade, 0) as quantidade,
      fu.receber
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
  // Incluir AMBAS as guias (prestador + operadora) para garantir match com demonstrativo
  const guiasSet = new Set<string>();
  for (const f of itensFaturamento) {
    const gp = String(f.numeroGuia || '').trim();
    const go = String(f.numeroGuiaOperadora || '').trim();
    const cn = String(f.contaNumero || '').trim();
    if (gp) guiasSet.add(gp);
    if (go) guiasSet.add(go);
    if (cn) guiasSet.add(cn);
  }
  const guiasUnicas = [...guiasSet];
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
      re.codigo_glosa as codigoGlosa,
      re.erro_tiss as erroTiss,
      re.data_execucao as dataExecucao
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
      d.codigo_glosa as codigoGlosa,
      d.data_execucao as dataExecucao
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

  // Buscar também vinculações padrão cadastradas manualmente
  let whereVincPadrao = `WHERE vp.estabelecimentoId = ${params.estabelecimentoId} AND vp.ativo = 1`;
  if (params.convenioId) {
    whereVincPadrao += ` AND (vp.convenioId = ${params.convenioId} OR vp.convenioId IS NULL)`;
  }
  const [vincPadraoRows] = await db.execute(sql.raw(
    `SELECT vp.codigoFaturado as codigoHospital, vp.codigoRecebido as codigoConvenio, vp.convenioId
    FROM vinculacoes_padrao vp
    ${whereVincPadrao}`
  ));
  const vinculacoesPadrao = vincPadraoRows as unknown as any[];

  // Criar mapa de vinculação: codigoHospital → codigoConvenio (aprendidas + padrão)
  const mapaVinculacao = new Map<string, string>();
  // Primeiro as padrão (menor prioridade)
  for (const v of vinculacoesPadrao) {
    mapaVinculacao.set(v.codigoHospital, v.codigoConvenio);
  }
  // Depois as aprendidas (sobrescrevem se houver conflito)
  for (const v of vinculacoes) {
    mapaVinculacao.set(v.codigoHospital, v.codigoConvenio);
  }

  // -------------------------------------------------------
  // PASSO 3.5: Carregar mapa de motivos de glosa para resolução automática
  // -------------------------------------------------------
  const [motivosRows] = await db.execute(sql.raw(
    `SELECT codigo, descricao FROM motivosGlosa WHERE ativo = 'sim'`
  ));
  const mapaMotivosGlosa = new Map<string, string>();
  for (const m of motivosRows as unknown as any[]) {
    mapaMotivosGlosa.set(String(m.codigo), String(m.descricao));
  }
  console.log(`[Conciliacao] ${mapaMotivosGlosa.size} motivos de glosa carregados`);

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
  // PASSO 4.6: Regra Bradesco - Identificar guias pagas por inteiro
  // O XML de retorno do Bradesco informa pagamento por GUIA (sem codigo_item),
  // não item a item. Quando o demonstrativo tem uma entrada PAGO sem codigo_item,
  // significa que a guia inteira foi paga. Nesse caso, todos os itens do faturamento
  // dessa guia devem ser marcados como "conciliado" automaticamente.
  // Guias GLOSADO sem codigo_item = guia inteira glosada.
  // -------------------------------------------------------
  const guiasPagasInteiras = new Map<string, { valorPago: number; recId: number; origem: string }>(); // guia -> valorPago total
  const guiasGlosadasInteiras = new Map<string, { valorGlosa: number; codigoGlosa: string | null; recId: number; origem: string }>();
  
  for (const rec of itensRecebimento) {
    const guia = String(rec.numeroGuia || '').trim();
    const codigo = String(rec.codigoItem || '').trim();
    const situacao = String(rec.situacao || '').toUpperCase().trim();
    
    // Regra: item do demonstrativo SEM codigo_item = pagamento/glosa por guia inteira
    if (guia && (!codigo || codigo === 'NULL' || codigo === 'null' || codigo === '')) {
      const valorPago = Number(rec.valorPago) || 0;
      const valorGlosa = Number(rec.valorGlosa) || 0;
      
      if (situacao === 'PAGO' && valorPago > 0) {
        const existing = guiasPagasInteiras.get(guia);
        guiasPagasInteiras.set(guia, {
          valorPago: (existing?.valorPago || 0) + valorPago,
          recId: rec.id,
          origem: rec._origem === 'demonstrativo' ? 'demonstrativo' : 'excel'
        });
        recebimentosUsados.add(rec.id);
      } else if (situacao === 'GLOSADO' && valorGlosa > 0) {
        const existing = guiasGlosadasInteiras.get(guia);
        guiasGlosadasInteiras.set(guia, {
          valorGlosa: (existing?.valorGlosa || 0) + valorGlosa,
          codigoGlosa: rec.codigoGlosa ? String(rec.codigoGlosa) : (rec.erroTiss ? (String(rec.erroTiss).match(/^(\d+)/) || [])[1] || (existing?.codigoGlosa || null) : (existing?.codigoGlosa || null)),
          recId: rec.id,
          origem: rec._origem === 'demonstrativo' ? 'demonstrativo' : 'excel'
        });
        recebimentosUsados.add(rec.id);
      }
    }
  }
  
  if (guiasPagasInteiras.size > 0 || guiasGlosadasInteiras.size > 0) {
    console.log(`[Conciliacao] Regra Bradesco: ${guiasPagasInteiras.size} guias pagas por inteiro, ${guiasGlosadasInteiras.size} guias glosadas por inteiro`);
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
    // Preferir numeroGuiaOperadora para match (demonstrativo usa guia operadora)
    const guia = String(fat.numeroGuiaOperadora || fat.numeroGuia || fat.contaNumero || '').trim();
    const codigoItem = String(fat.codigoItem || '').trim();
    const codigoTuss = String(fat.codigoItemTuss || '').trim();
    const paciente = normalizarNome(String(fat.pacienteNome || ''));
    const valorFaturado = Number(fat.valorFaturado) || 0;

    // REGRA BRADESCO: Guia paga/glosada por inteiro (demonstrativo sem codigo_item)
    // Se a guia está no mapa de guias pagas inteiras, marcar como conciliado
    // Se está no mapa de guias glosadas inteiras, marcar como glosa_total
    const guiaPagaInteira = guiasPagasInteiras.get(guia);
    const guiaGlosadaInteira = guiasGlosadasInteiras.get(guia);
    
    if (guiaPagaInteira && !guiaGlosadaInteira) {
      // Guia paga por inteiro: todos os itens são conciliados
      const descricaoFat = String(fat.descricaoItem || '');
      const tipoItemFat = String(fat.tipoItem || '');
      // Distribuir o valor pago proporcionalmente entre os itens da guia
      inserts.push({
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
        dataExecucao: fat.dataExecucao ? String(fat.dataExecucao).replace('T', ' ').slice(0, 19) : null,
        codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
        valorFaturado,
        quantidade: Number(fat.quantidade) || 0,
        codigoGlosa: null,
        motivoGlosa: null,
        recebimentoId: guiaPagaInteira.recId,
        recebimentoOrigem: guiaPagaInteira.origem,
        valorPago: valorFaturado, // Pago = faturado (guia paga inteira)
        valorGlosa: 0,
        statusConciliacao: 'conciliado',
        metodoConciliacao: 'guia_paga_inteira',
        diferenca: 0,
        percentualDiferenca: 0,
      });
      resultado.totalConciliados++;
      resultado.detalhes.conciliadosPorGuiaCodigo++;
      continue;
    }
    
    if (guiaGlosadaInteira) {
      // Guia glosada por inteiro: todos os itens são glosados
      // Se também tem pagamento parcial, calcular proporção
      const descricaoFat = String(fat.descricaoItem || '');
      const tipoItemFat = String(fat.tipoItem || '');
      const vlPagoGuia = guiaPagaInteira?.valorPago || 0;
      const vlGlosaGuia = guiaGlosadaInteira.valorGlosa;
      const totalGuia = vlPagoGuia + vlGlosaGuia;
      // Se a guia tem tanto pagamento quanto glosa, é parcial
      if (vlPagoGuia > 0) {
        // Glosa parcial: proporção do faturado
        const propPago = totalGuia > 0 ? vlPagoGuia / totalGuia : 0;
        const valorPagoItem = Math.round(valorFaturado * propPago * 100) / 100;
        const valorGlosaItem = valorFaturado - valorPagoItem;
        inserts.push({
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
          dataExecucao: fat.dataExecucao ? String(fat.dataExecucao).replace('T', ' ').slice(0, 19) : null,
          codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
          valorFaturado,
          quantidade: Number(fat.quantidade) || 0,
          codigoGlosa: guiaGlosadaInteira.codigoGlosa,
          motivoGlosa: guiaGlosadaInteira.codigoGlosa ? (mapaMotivosGlosa.get(guiaGlosadaInteira.codigoGlosa) || null) : null,
          recebimentoId: guiaGlosadaInteira.recId,
          recebimentoOrigem: guiaGlosadaInteira.origem,
          valorPago: valorPagoItem,
          valorGlosa: valorGlosaItem,
          statusConciliacao: 'glosa_parcial',
          metodoConciliacao: 'guia_glosa_inteira',
          diferenca: valorGlosaItem,
          percentualDiferenca: valorFaturado > 0 ? (valorGlosaItem / valorFaturado) * 100 : 0,
        });
        resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
        resultado.totalGlosaParcial++;
      } else {
        // Glosa total: guia inteira glosada sem pagamento
        inserts.push({
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
          dataExecucao: fat.dataExecucao ? String(fat.dataExecucao).replace('T', ' ').slice(0, 19) : null,
          codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
          valorFaturado,
          quantidade: Number(fat.quantidade) || 0,
          codigoGlosa: guiaGlosadaInteira.codigoGlosa || '9999',
          motivoGlosa: guiaGlosadaInteira.codigoGlosa ? (mapaMotivosGlosa.get(guiaGlosadaInteira.codigoGlosa) || 'Glosa não informada pela operadora') : 'Glosa não informada pela operadora',
          recebimentoId: guiaGlosadaInteira.recId,
          recebimentoOrigem: guiaGlosadaInteira.origem,
          valorPago: 0,
          valorGlosa: valorFaturado,
          statusConciliacao: 'glosa_total',
          metodoConciliacao: 'guia_glosa_inteira',
          diferenca: valorFaturado,
          percentualDiferenca: 100,
        });
        resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
        resultado.totalGlosaTotal++;
      }
      continue;
    }

    // REGRA PRIORITÁRIA: Se receber='N' (Warleine), é terceiro independente de match
    // Médicos que recebem direto do convênio não devem gerar glosa para o hospital
    if (fat.receber === 'N' && fat.origemSistema === 'WARLEINE') {
      const descricaoFat = String(fat.descricaoItem || '');
      const tipoItemFat = String(fat.tipoItem || '');
      inserts.push({
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
        dataExecucao: fat.dataExecucao ? String(fat.dataExecucao).replace('T', ' ').slice(0, 19) : null,
        codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
        valorFaturado: 0,
        quantidade: Number(fat.quantidade) || 0,
        codigoGlosa: null,
        motivoGlosa: null,
        recebimentoId: null,
        recebimentoOrigem: null,
        valorPago: 0,
        valorGlosa: 0,
        statusConciliacao: 'terceiro',
        metodoConciliacao: null,
        diferenca: 0,
        percentualDiferenca: 0,
      });
      resultado.totalTerceiros = (resultado.totalTerceiros || 0) + 1;
      continue;
    }

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
      dataExecucao: fat.dataExecucao ? String(fat.dataExecucao).replace('T', ' ').slice(0, 19) : null,
      codigoPrestadorExecutante: (fat as any).codigoPrestadorExecutante ? String((fat as any).codigoPrestadorExecutante) : null,
      valorFaturado,
      quantidade: Number(fat.quantidade) || 0,
      codigoGlosa: null as string | null,
      motivoGlosa: null as string | null,
    };

    if (matchEncontrado && recMatch) {
      recebimentosUsados.add(recMatch.id);
      
      // REGRA CRÍTICA: Se situacao_item do demonstrativo/excel é 'GLOSADO',
      // o valor_pagamento NÃO é o valor pago real - é o valor de tabela.
      // Nesse caso, o pagamento real é R$0 (glosa total).
      const situacaoItem = String(recMatch.situacao || '').toUpperCase().trim();
      const isGlosadoTotal = situacaoItem === 'GLOSADO';
      
      const valorRecebido = isGlosadoTotal ? 0 : (Number(recMatch.valorPago) || 0);
      const diferenca = valorFaturado - valorRecebido;
      const _pctRaw = valorFaturado > 0 ? (Math.abs(diferenca) / valorFaturado) * 100 : (valorRecebido > 0 ? 100 : 0);
      const percentualDiferenca = isFinite(_pctRaw) ? Math.min(_pctRaw, 9999999.9999) : 9999999.9999;

      const valorPagoRec = isGlosadoTotal ? 0 : (Number(recMatch.valorPago) || 0);
      const valorGlosaRec = isGlosadoTotal ? valorFaturado : (Number(recMatch.valorGlosa) || 0);

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
        // Resolver descrição do motivo a partir da tabela motivosGlosa
        const descMotivo = mapaMotivosGlosa.get(String(recMatch.codigoGlosa));
        if (descMotivo) {
          baseInsert.motivoGlosa = descMotivo;
        }
      } else if (recMatch.erroTiss) {
        // Fallback: extrair código de glosa do campo erro_tiss (formato "CÓDIGO-DESCRIÇÃO")
        const erroTissStr = String(recMatch.erroTiss);
        const matchErro = erroTissStr.match(/^(\d+)[-–\s](.+)$/);
        if (matchErro) {
          baseInsert.codigoGlosa = matchErro[1];
          // Tentar resolver descrição da tabela motivosGlosa, senão usar a descrição do campo
          const descMotivo = mapaMotivosGlosa.get(matchErro[1]);
          baseInsert.motivoGlosa = descMotivo || matchErro[2].trim();
        } else {
          // Se não tem formato código-descrição, usar o texto inteiro como motivo
          baseInsert.codigoGlosa = erroTissStr.replace(/[^0-9]/g, '').substring(0, 10) || '9999';
          baseInsert.motivoGlosa = erroTissStr;
        }
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
        // Para itens sem motivo de glosa do demonstrativo, usar código 9999
        if (!baseInsert.codigoGlosa) {
          baseInsert.codigoGlosa = '9999';
          baseInsert.motivoGlosa = 'Glosa não informada pela operadora';
        }
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: 0, valorGlosa: valorGlosaCalc, statusConciliacao: 'glosa_total', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
        resultado.totalGlosaTotal++;
      } else if (diferenca > 0) {
        // Glosa parcial: convênio pagou menos que o faturado
        const valorGlosaCalc = valorGlosaRec > 0 ? valorGlosaRec : diferenca;
        // Para itens sem motivo de glosa do demonstrativo, usar código 9999
        if (!baseInsert.codigoGlosa) {
          baseInsert.codigoGlosa = '9999';
          baseInsert.motivoGlosa = 'Glosa não informada pela operadora';
        }
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
        // Pagamento a maior (convênio pagou mais que faturado) = acréscimo
        inserts.push({ ...baseInsert, recebimentoId: recIdReal, recebimentoOrigem: origemRec, valorPago: valorPagoRec, valorGlosa: 0, statusConciliacao: 'acrescimo', metodoConciliacao: metodo, diferenca, percentualDiferenca });
        resultado.totalAcrescimos++;
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
      // REGRA 1: Campo receber='N' do Warleine → pagamento direto ao médico/terceiro
      // REGRA 2: Código do prestador executante NÃO está entre os códigos próprios cadastrados
      // REGRA 3: Código é NULL mas outros itens da mesma guia têm código próprio
      const codPrestExec = baseInsert.codigoPrestadorExecutante;
      let isTerceiro = false;
      
      // REGRA 1: Campo receber='N' do Warleine (pagamento direto ao médico)
      if (fat.receber === 'N') {
        isTerceiro = true;
      }
      
      // REGRA 2 e 3: Verificação por código de prestador
      if (!isTerceiro && codigosProprios.size > 0) {
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
        // Zerar valorFaturado para não inflar totais do hospital
        inserts.push({ ...baseInsert, valorFaturado: 0, recebimentoId: null, recebimentoOrigem: null, valorPago: 0, valorGlosa: 0, statusConciliacao: 'terceiro', metodoConciliacao: null, diferenca: 0, percentualDiferenca: 0, codigoGlosa: null });
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
  // Quando múltiplos itens do faturamento com mesmo código existem na mesma guia
  // (ex: mesmo material em setores diferentes) e o demonstrativo paga AGRUPADO
  // (soma das quantidades em uma única linha), redistribui proporcionalmente.
  //
  // Cenário típico:
  //   Faturamento: código 1900146234 → CENTRO CIRÚRGICO qtd 2 R$4,46 + POSTO I qtd 3 R$6,69
  //   Demonstrativo: código 1900146234 → qtd 5 R$11,15 (agrupado)
  //   Resultado esperado: ambos itens conciliados com valor proporcional
  //
  // Este passo considera itens que ficaram como:
  //   - 'sem_pagamento' (sem match)
  //   - 'divergente' (Pagamento a Maior - match consumiu recebimento agrupado)
  // E tenta reagrupar com recebimentos disponíveis ou já usados pelo grupo.
  // -------------------------------------------------------

  // Identificar itens que podem participar de agrupamento:
  // sem_pagamento (sem match) + acrescimo (pagamento a maior, pois o recebimento
  // agrupado foi consumido por apenas 1 item do grupo)
  const candidatosAgrupamento = inserts
    .map((ins, idx) => ({ ins, idx }))
    .filter(({ ins }) => 
      (ins.statusConciliacao === 'sem_pagamento' && ins.recebimentoId === null) ||
      (ins.statusConciliacao === 'acrescimo' && ins.diferenca < 0) // Pagamento a Maior
    );

  // Agrupar por guia+código
  const gruposParaAgrupamento = new Map<string, { ins: typeof inserts[0]; idx: number }[]>();
  for (const item of candidatosAgrupamento) {
    const chave = `${item.ins.numeroGuia}|${item.ins.codigoItem}`;
    if (!gruposParaAgrupamento.has(chave)) gruposParaAgrupamento.set(chave, []);
    gruposParaAgrupamento.get(chave)!.push(item);
  }

  // Para cada grupo com 2+ itens, tentar reagrupar
  for (const [chave, grupo] of gruposParaAgrupamento) {
    if (grupo.length < 2) continue;

    const somaQuantidade = grupo.reduce((s, g) => s + g.ins.quantidade, 0);
    const somaValor = grupo.reduce((s, g) => s + g.ins.valorFaturado, 0);

    // Coletar recebimentos disponíveis para este grupo:
    // 1. Recebimentos NÃO usados com mesmo guia+código
    // 2. Recebimentos JÁ usados por itens DENTRO deste grupo (divergentes que consumiram o agrupado)
    const candidatosRec = indexGuiaCodigo.get(chave);
    if (!candidatosRec) continue;

    // IDs de recebimentos usados por itens deste grupo (para "devolver" ao pool)
    const recIdsDoGrupo = new Set(
      grupo.filter(g => g.ins.recebimentoId !== null).map(g => g.ins.recebimentoId!)
    );

    // Disponíveis = não usados OU usados por este grupo
    const disponiveis = candidatosRec.filter(c => 
      !recebimentosUsados.has(c.id) || recIdsDoGrupo.has(c.id)
    );
    if (disponiveis.length === 0) continue;

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

      // Reverter contadores dos itens que tinham status anterior
      for (const { ins } of grupo) {
        const statusAnterior = ins.statusConciliacao;
        if (statusAnterior === 'sem_pagamento') resultado.totalNaoRecebidos--;
        else if (statusAnterior === 'acrescimo') resultado.totalAcrescimos--;
        else if (statusAnterior === 'glosa_parcial') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaParcial--; }
        else if (statusAnterior === 'glosa_total') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaTotal--; }
      }

      // Distribuir o valor pago proporcionalmente entre os itens do grupo
      for (const { ins, idx } of grupo) {
        const proporcao = somaValor > 0 ? ins.valorFaturado / somaValor : 1 / grupo.length;
        const valorPagoProporcional = Math.round(valorRecTotal * proporcao * 100) / 100;
        const valorGlosaProporcional = Math.round(valorGlosaRec * proporcao * 100) / 100;
        const diferenca = ins.valorFaturado - valorPagoProporcional;
        const percentualDiferenca = ins.valorFaturado > 0 ? (Math.abs(diferenca) / ins.valorFaturado) * 100 : 0;

        // Enriquecer com dados do recebimento
        if (recAgrupado.nomeBeneficiario) ins.pacienteNome = String(recAgrupado.nomeBeneficiario);
        if (recAgrupado.codigoGlosa) {
          ins.codigoGlosa = String(recAgrupado.codigoGlosa);
          const descMotivo = mapaMotivosGlosa.get(String(recAgrupado.codigoGlosa));
          if (descMotivo) ins.motivoGlosa = descMotivo;
        } else if (recAgrupado.erroTiss) {
          const erroStr = String(recAgrupado.erroTiss);
          const mErro = erroStr.match(/^(\d+)[-–\s](.+)$/);
          if (mErro) {
            ins.codigoGlosa = mErro[1];
            ins.motivoGlosa = mapaMotivosGlosa.get(mErro[1]) || mErro[2].trim();
          }
        }

        ins.recebimentoId = recAgrupado.id;
        ins.recebimentoOrigem = recAgrupado._origem === 'demonstrativo' ? 'demonstrativo' : 'excel';
        ins.valorPago = valorPagoProporcional;
        ins.valorGlosa = valorGlosaProporcional;
        ins.diferenca = diferenca;
        ins.percentualDiferenca = percentualDiferenca;
        ins.metodoConciliacao = 'agrupamento';

        if (percentualDiferenca <= tolerancia) {
          ins.statusConciliacao = 'conciliado';
          resultado.totalConciliados++;
        } else if (diferenca > 0 && valorPagoProporcional === 0) {
          ins.statusConciliacao = 'glosa_total';
          ins.valorGlosa = ins.valorGlosa > 0 ? ins.valorGlosa : diferenca;
          if (!ins.codigoGlosa) {
            ins.codigoGlosa = '9999';
            ins.motivoGlosa = 'Glosa não informada pela operadora';
          }
          resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
          resultado.totalGlosaTotal++;
        } else if (diferenca > 0) {
          ins.statusConciliacao = 'glosa_parcial';
          ins.valorGlosa = ins.valorGlosa > 0 ? ins.valorGlosa : diferenca;
          if (!ins.codigoGlosa) {
            ins.codigoGlosa = '9999';
            ins.motivoGlosa = 'Glosa não informada pela operadora';
          }
          resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
          resultado.totalGlosaParcial++;
        } else {
          // Pagamento a maior (convênio pagou mais) = acréscimo
          ins.statusConciliacao = 'acrescimo';
          ins.valorGlosa = 0;
          resultado.totalAcrescimos++;
        }
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
    .filter(({ ins }) => ins.statusConciliacao === 'acrescimo' || ins.statusConciliacao === 'glosa_parcial' || ins.statusConciliacao === 'glosa_total');

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
    // Somar glosa REAL dos recebimentos do demonstrativo (não a glosa calculada anteriormente)
    let somaValorGlosaReal = 0; // glosa explícita vinda do demonstrativo
    const recebimentosAgrupados: any[] = [];

    // Buscar a glosa real do primeiro recebimento já associado (se houver)
    if (ins.recebimentoId) {
      const recOriginal = candidatos.find(c => String(c.id) === String(ins.recebimentoId));
      if (recOriginal) {
        somaValorGlosaReal += Number(recOriginal.valorGlosa) || 0;
      }
    }

    for (const rec of naoUsados) {
      somaValorPago += Number(rec.valorPago) || 0;
      somaValorGlosaReal += Number(rec.valorGlosa) || 0;
      recebimentosAgrupados.push(rec);
    }

    // Calcular glosa correta: se há glosa explícita do demonstrativo, usar ela;
    // caso contrário, calcular como diferença entre faturado e pago
    let somaValorGlosa = somaValorGlosaReal > 0 
      ? somaValorGlosaReal 
      : Math.max(0, ins.valorFaturado - somaValorPago);

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
        const recComGlosa = recebimentosAgrupados.find(r => r.codigoGlosa || r.erroTiss);
        if (recComGlosa && !ins.codigoGlosa) {
          if (recComGlosa.codigoGlosa) {
            ins.codigoGlosa = String(recComGlosa.codigoGlosa);
            const descMotivo = mapaMotivosGlosa.get(String(recComGlosa.codigoGlosa));
            if (descMotivo) ins.motivoGlosa = descMotivo;
          } else if (recComGlosa.erroTiss) {
            const erroStr = String(recComGlosa.erroTiss);
            const mErro = erroStr.match(/^(\d+)[-–\s](.+)$/);
            if (mErro) {
              ins.codigoGlosa = mErro[1];
              ins.motivoGlosa = mapaMotivosGlosa.get(mErro[1]) || mErro[2].trim();
            }
          }
        }
        if (!ins.codigoGlosa) {
          ins.codigoGlosa = '9999';
          ins.motivoGlosa = 'Glosa não informada pela operadora';
        }
      } else if (somaValorGlosa > 0 && somaValorPago > 0 && somaValorPago < ins.valorFaturado) {
        // Glosa parcial: convênio pagou parcialmente com glosa explícita
        ins.statusConciliacao = 'glosa_parcial';
        const recComGlosa2 = recebimentosAgrupados.find(r => r.codigoGlosa || r.erroTiss);
        if (recComGlosa2 && !ins.codigoGlosa) {
          if (recComGlosa2.codigoGlosa) {
            ins.codigoGlosa = String(recComGlosa2.codigoGlosa);
            const descMotivo = mapaMotivosGlosa.get(String(recComGlosa2.codigoGlosa));
            if (descMotivo) ins.motivoGlosa = descMotivo;
          } else if (recComGlosa2.erroTiss) {
            const erroStr2 = String(recComGlosa2.erroTiss);
            const mErro2 = erroStr2.match(/^(\d+)[-–\s](.+)$/);
            if (mErro2) {
              ins.codigoGlosa = mErro2[1];
              ins.motivoGlosa = mapaMotivosGlosa.get(mErro2[1]) || mErro2[2].trim();
            }
          }
        }
        if (!ins.codigoGlosa) {
          ins.codigoGlosa = '9999';
          ins.motivoGlosa = 'Glosa não informada pela operadora';
        }
      } else if (percentualDiferenca <= tolerancia) {
        ins.statusConciliacao = 'conciliado';
      } else if (ins.valorFaturado - somaValorPago > 0) {
        // Pagamento parcial sem glosa explícita = glosa parcial
        ins.statusConciliacao = 'glosa_parcial';
        ins.valorGlosa = ins.valorGlosa > 0 ? ins.valorGlosa : (ins.valorFaturado - somaValorPago);
        if (!ins.codigoGlosa) {
          ins.codigoGlosa = '9999';
          ins.motivoGlosa = 'Glosa não informada pela operadora';
        }
      } else {
        // Pagamento a maior = acréscimo
        ins.statusConciliacao = 'acrescimo';
        ins.valorGlosa = 0;
      }

      // Atualizar contadores
      if (statusAnterior === 'divergente' || statusAnterior === 'acrescimo') resultado.totalAcrescimos--;
      if (statusAnterior === 'glosa_parcial') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaParcial--; }
      if (statusAnterior === 'glosa_total') { resultado.totalGlosados = (resultado.totalGlosados || 0) - 1; resultado.totalGlosaTotal--; }
      if (ins.statusConciliacao === 'conciliado') resultado.totalConciliados++;
      else if (ins.statusConciliacao === 'glosa_parcial') { resultado.totalGlosados = (resultado.totalGlosados || 0) + 1; resultado.totalGlosaParcial++; }
      else if (ins.statusConciliacao === 'glosa_total') { resultado.totalGlosados = (resultado.totalGlosados || 0) + 1; resultado.totalGlosaTotal++; }
      else if (ins.statusConciliacao === 'acrescimo') resultado.totalAcrescimos++;
    }
  }

  // -------------------------------------------------------
  // PASSO 5.7: Detectar itens ACRÉSCIMO (presentes no demonstrativo mas NÃO no faturamento)
  // Quando o convênio substitui um procedimento (ex: diária apartamento → hospital dia),
  // o item substitutivo aparece no demonstrativo mas não existe no faturamento.
  // Esses itens devem ser registrados como 'acrescimo' para visibilidade.
  // REGRA DE DATA: Acréscimos devem respeitar a data da guia — itens do demonstrativo
  // com data_execucao fora da competência atual são IGNORADOS (pertencem a outra competência).
  // -------------------------------------------------------
  const codigosFaturados = new Set(itensFaturamento.map((f: any) => `${f.numeroGuia}|${f.codigoItem}`));
  // Mapa de guia -> contaNumero para herdar nos acréscimos
  const guiaContaMap = new Map<string, string>();
  for (const fat of itensFaturamento) {
    const g = String(fat.numeroGuia || fat.contaNumero || '').trim();
    const c = String(fat.contaNumero || '').trim();
    if (g && c && !guiaContaMap.has(g)) {
      guiaContaMap.set(g, c);
    }
  }

  // Construir mapa de guia -> Set de datas (YYYY-MM-DD) presentes no faturamento desta competência
  // para validar se o acréscimo pertence a esta competência.
  // Regra: acréscimos só podem ser gerados se a data_execucao do item do demonstrativo
  // está entre as datas do faturamento DESTA GUIA nesta competência.
  const guiaDatasMap = new Map<string, Set<string>>();
  for (const fat of itensFaturamento) {
    if (fat.dataExecucao) {
      const guia = String(fat.numeroGuiaOperadora || fat.numeroGuia || fat.contaNumero || '').trim();
      const dtStr = String(fat.dataExecucao).replace('T', ' ').slice(0, 10); // YYYY-MM-DD
      if (guia && /^\d{4}-\d{2}-\d{2}$/.test(dtStr)) {
        if (!guiaDatasMap.has(guia)) guiaDatasMap.set(guia, new Set());
        guiaDatasMap.get(guia)!.add(dtStr);
      }
    }
  }

  const acrescimosDetectados: any[] = [];
  let acrescimosIgnoradosPorData = 0;
  
  for (const rec of itensRecebimento) {
    if (recebimentosUsados.has(rec.id)) continue; // Já usado em algum match
    const chave = `${rec.numeroGuia}|${rec.codigoItem}`;
    if (codigosFaturados.has(chave)) continue; // Código existe no faturamento (pode ser match futuro)
    
    // Item do demonstrativo que NÃO existe no faturamento = ACRÉSCIMO
    const valorPago = Number(rec.valorPago) || 0;
    const valorGlosa = Number(rec.valorGlosa) || 0;
    if (valorPago <= 0 && valorGlosa <= 0) continue; // Ignorar registros zerados

    // REGRA DE DATA: Verificar se a data_execucao do item do demonstrativo
    // pertence à competência atual (está nas datas do faturamento DESTA GUIA)
    const guiaRec = String(rec.numeroGuia || '').trim();
    if (rec.dataExecucao && guiaRec) {
      const recDataStr = String(rec.dataExecucao).replace('T', ' ').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(recDataStr)) {
        const datasGuia = guiaDatasMap.get(guiaRec);
        if (datasGuia && datasGuia.size > 0) {
          // A guia tem datas no faturamento desta competência
          // Verificar se a data do item do demonstrativo está entre as datas da guia
          if (!datasGuia.has(recDataStr)) {
            // Data não está nas datas do faturamento desta guia nesta competência
            // Ignorar — pertence a outra competência
            acrescimosIgnoradosPorData++;
            continue;
          }
        }
        // Se a guia NÃO tem datas no faturamento (guia só existe no demonstrativo),
        // permitir o acréscimo (não temos como filtrar)
      }
    }
    
    const guiaAcrescimo = String(rec.numeroGuia || '');
    // Herdar contaNumero da mesma guia para não duplicar na tela
    const contaNumeroHerdado = guiaContaMap.get(guiaAcrescimo) || null;
    
    const origemRec = rec._origem === 'demonstrativo' ? 'demonstrativo' : 'excel';
    acrescimosDetectados.push({
      faturamentoUnificadoId: 0, // Sentinela: não existe no faturamento
      contaNumero: contaNumeroHerdado,
      numeroGuia: guiaAcrescimo,
      pacienteNome: rec.nomeBeneficiario ? String(rec.nomeBeneficiario) : null,
      convenio: inserts.length > 0 ? inserts[0].convenio : null,
      convenioId: params.convenioId || (inserts.length > 0 ? inserts[0].convenioId : null),
      competencia: params.competencia || (inserts.length > 0 ? inserts[0].competencia : null),
      codigoItem: String(rec.codigoItem || ''),
      codigoItemTuss: null,
      descricaoItem: rec.descricaoItem ? String(rec.descricaoItem) : null,
      tipoItem: rec.tipoLancamento ? String(rec.tipoLancamento) : null,
      origemSistema: 'DEMONSTRATIVO',
      dataExecucao: rec.dataExecucao ? String(rec.dataExecucao).replace('T', ' ').slice(0, 19) : null,
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
  if (acrescimosIgnoradosPorData > 0) {
    console.log(`[Conciliacao] ${acrescimosIgnoradosPorData} itens do demonstrativo IGNORADOS como acréscimo (data_execucao fora das datas do faturamento da guia nesta competência)`);
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
  // PASSO 5.9: Reclassificar 'sem_pagamento' como 'glosa_total' quando a guia teve retorno
  // Se o demonstrativo respondeu sobre a guia (outros itens foram conciliados/glosados),
  // então itens sem match devem ser glosa (convênio não pagou = glosou implicitamente).
  // 'sem_pagamento' só deve permanecer para guias sem NENHUM retorno do demonstrativo.
  // -------------------------------------------------------
  const guiasComRetorno = new Set<string>();
  for (const ins of inserts) {
    if (ins.statusConciliacao !== 'sem_pagamento' && ins.statusConciliacao !== 'terceiro' && ins.numeroGuia) {
      guiasComRetorno.add(String(ins.numeroGuia));
    }
  }
  
  let totalReclassificados = 0;
  for (const ins of inserts) {
    if (ins.statusConciliacao === 'sem_pagamento' && ins.numeroGuia && guiasComRetorno.has(String(ins.numeroGuia))) {
      // A guia teve retorno do demonstrativo, mas este item não foi incluído = glosa implícita
      ins.statusConciliacao = 'glosa_total';
      ins.valorGlosa = ins.valorFaturado || 0;
      ins.codigoGlosa = '9999';
      ins.motivoGlosa = 'Glosa não informada pela operadora';
      ins.diferenca = ins.valorFaturado || 0;
      ins.percentualDiferenca = 100;
      resultado.totalNaoRecebidos--;
      resultado.totalGlosaTotal = (resultado.totalGlosaTotal || 0) + 1;
      resultado.totalGlosados = (resultado.totalGlosados || 0) + 1;
      totalReclassificados++;
    }
  }
  if (totalReclassificados > 0) {
    console.log(`[Conciliacao] ${totalReclassificados} itens reclassificados de 'sem_pagamento' para 'glosa_total' (guia com retorno do demonstrativo)`);
  }

  // -------------------------------------------------------
  // PASSO 6: INSERT em MEGA-BATCH na tabela conciliados_automatico
  // Usa batches de 5000 para minimizar roundtrips ao banco
  // (conciliações anteriores já foram deletadas no PASSO 0.5)
  // -------------------------------------------------------
  const MEGA_BATCH = 5000;
  const escDate = (v: any): string => {
    if (v === null || v === undefined) return 'NULL';
    // Se já for string no formato MySQL (YYYY-MM-DD HH:mm:ss), usar diretamente
    const str = String(v).replace('T', ' ').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
      return `'${str}'`;
    }
    // Se for apenas data (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
      return `'${str.trim()} 00:00:00'`;
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
    if (params.statusConciliacao === 'conciliado') {
      whereClause += ` AND ca.statusConciliacao IN ('conciliado','glosa_total','glosa_parcial','divergente','acrescimo','terceiro','glosado')`;
    } else if (params.statusConciliacao === 'sem_conciliacao') {
      whereClause += ` AND ca.statusConciliacao IN ('nao_recebido','sem_pagamento','pendente')`;
    } else if (params.statusConciliacao === 'conciliado_manual') {
      whereClause += ` AND ca.statusConciliacao = 'conciliado_manual'`;
    } else {
      whereClause += ` AND ca.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
    }
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
  totalGlosaTotal: number;
  totalGlosaParcial: number;
  totalSemPagamento: number;
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
      case 'conciliado': resumo.totalConciliados += count; break;
      case 'conciliado_manual': resumo.totalConciliados += count; break;
      case 'divergente': resumo.totalAcrescimos += count; break;
      case 'nao_recebido': resumo.totalNaoRecebidos += count; break;
      case 'sem_pagamento': resumo.totalSemPagamento += count; break;
      case 'glosa_total': resumo.totalGlosaTotal += count; break;
      case 'glosa_parcial': resumo.totalGlosaParcial += count; break;
      case 'terceiro': resumo.totalTerceiros += count; break;
      case 'acrescimo': resumo.totalAcrescimos += count; break;
      case 'absorvido': resumo.totalAcrescimos += count; break;
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
 * Convênios disponíveis - combina conciliados_automatico + faturamento_unificado
 * para garantir que todos os convênios com dados apareçam no filtro
 */
export async function conveniosConciliados(estabelecimentoId: number, competencia?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  let where = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (competencia) {
    where += ` AND competencia LIKE '${competencia.replace(/'/g, "''")}%'`;
  }
  const [rows] = await db.execute(sql.raw(
    `SELECT convenioId, convenio, SUM(total) as total FROM (
       SELECT convenioId, convenio, COUNT(*) as total
       FROM conciliados_automatico
       ${where}
       GROUP BY convenioId, convenio
       UNION ALL
       SELECT convenioId, convenio, COUNT(*) as total
       FROM faturamento_unificado
       ${where}
       GROUP BY convenioId, convenio
     ) combined
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

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId} AND ca.statusConciliacao != 'absorvido'`;
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.statusConciliacao && params.statusConciliacao !== 'todos') {
    if (params.statusConciliacao === 'conciliado') {
      // Filtrar guias onde TODOS os itens estão associados (sem itens desassociados)
      // Usa HAVING para identificar guias sem nenhum item desassociado, depois inclui todos os itens
      whereClause += ` AND COALESCE(ca.numeroGuia, ca.contaNumero) IN (
        SELECT COALESCE(ca2.numeroGuia, ca2.contaNumero)
        FROM conciliados_automatico ca2
        WHERE ca2.estabelecimentoId = ${params.estabelecimentoId}
        GROUP BY COALESCE(ca2.numeroGuia, ca2.contaNumero)
        HAVING SUM(CASE WHEN ca2.statusConciliacao IN ('sem_pagamento','nao_recebido') THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca2.statusConciliacao = 'acrescimo' AND (ca2.faturamentoUnificadoId IS NULL OR ca2.faturamentoUnificadoId = 0) THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca2.statusConciliacao = 'glosa_total' AND ca2.recebimentoId IS NULL THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN ca2.recebimentoId IS NOT NULL THEN 1 ELSE 0 END) > 0
      )`;
    } else if (params.statusConciliacao === 'nao_conciliado' || params.statusConciliacao === 'sem_conciliacao') {
      // Filtrar guias que possuem ao menos 1 item desassociado E têm algum pagamento
      // Usa subquery para identificar as guias, depois inclui TODOS os itens dessas guias
      whereClause += ` AND COALESCE(ca.numeroGuia, ca.contaNumero) IN (
        SELECT COALESCE(ca2.numeroGuia, ca2.contaNumero)
        FROM conciliados_automatico ca2
        WHERE ca2.estabelecimentoId = ${params.estabelecimentoId}
        GROUP BY COALESCE(ca2.numeroGuia, ca2.contaNumero)
        HAVING (
          SUM(CASE WHEN ca2.statusConciliacao IN ('sem_pagamento','nao_recebido') THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca2.statusConciliacao = 'acrescimo' AND (ca2.faturamentoUnificadoId IS NULL OR ca2.faturamentoUnificadoId = 0) THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca2.statusConciliacao = 'glosa_total' AND ca2.recebimentoId IS NULL THEN 1 ELSE 0 END)
        ) > 0
        AND SUM(CASE WHEN ca2.recebimentoId IS NOT NULL THEN 1 ELSE 0 END) > 0
      )`;
    } else if (params.statusConciliacao === 'sem_pagamento_guia') {
      // Filtrar guias onde NENHUM item tem recebimento (sem pagamento identificado)
      // Usa subquery para identificar as guias, depois inclui TODOS os itens
      whereClause += ` AND COALESCE(ca.numeroGuia, ca.contaNumero) IN (
        SELECT COALESCE(ca2.numeroGuia, ca2.contaNumero)
        FROM conciliados_automatico ca2
        WHERE ca2.estabelecimentoId = ${params.estabelecimentoId}
        GROUP BY COALESCE(ca2.numeroGuia, ca2.contaNumero)
        HAVING SUM(CASE WHEN ca2.recebimentoId IS NOT NULL THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN ca2.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) = 0
      )`;
    } else {
      whereClause += ` AND ca.statusConciliacao = '${params.statusConciliacao.replace(/'/g, "''")}'`;
    }
  }
  if (params.busca) {
    const b = params.busca.replace(/'/g, "''");
    whereClause += ` AND (ca.numeroGuia LIKE '%${b}%' OR ca.contaNumero LIKE '%${b}%' OR ca.pacienteNome LIKE '%${b}%' OR ca.convenio LIKE '%${b}%')`;
  }
  if (params.loteXml) {
    // Filtrar pelo lote do XML TISS - identifica as GUIAS que pertencem ao lote,
    // depois inclui TODOS os itens dessas guias (incluindo acréscimos e glosa_total)
    const lx = params.loteXml.replace(/'/g, "''");
    whereClause += ` AND COALESCE(ca.numeroGuia, ca.contaNumero) IN (
      SELECT DISTINCT COALESCE(ca2.numeroGuia, ca2.contaNumero)
      FROM conciliados_automatico ca2
      WHERE ca2.estabelecimentoId = ${params.estabelecimentoId}
        AND ca2.faturamentoUnificadoId IN (SELECT fu.id FROM faturamento_unificado fu WHERE fu.lotePrestador = '${lx}' AND fu.estabelecimentoId = ${params.estabelecimentoId})
    )`;
  }
  if (params.loteRetorno) {
    // Filtrar pelo lote do retorno/demonstrativo via guia
    const lr = params.loteRetorno.replace(/'/g, "''");
    whereClause += ` AND ca.numeroGuia IN (SELECT DISTINCT d.numero_guia FROM demonstrativo d WHERE d.estabelecimentoId = ${params.estabelecimentoId} AND d.lote_prestador = '${lr}')`;
  }
  if (params.dataPagto) {
    // Filtrar pela data de pagamento do demonstrativo (recebimentos_excel.data_pagto)
    // Usa subquery para identificar as GUIAS que têm pagamento naquela data,
    // e depois inclui TODOS os itens dessas guias (incluindo glosa_total sem recebimento e acréscimos)
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND COALESCE(ca.numeroGuia, ca.contaNumero) IN (
      SELECT DISTINCT COALESCE(ca2.numeroGuia, ca2.contaNumero)
      FROM conciliados_automatico ca2
      WHERE ca2.estabelecimentoId = ${params.estabelecimentoId}
        AND ca2.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dp}')
    )`;
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
      -- Status da guia: sem_pagamento (nenhum item com recebimento), nao_conciliado (algum desassociado), conciliado (todos associados)
      CASE
        WHEN SUM(CASE WHEN ca.recebimentoId IS NOT NULL THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) = 0
          THEN 'sem_pagamento'
        WHEN (
          SUM(CASE WHEN ca.statusConciliacao IN ('sem_pagamento','nao_recebido') THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' AND (ca.faturamentoUnificadoId IS NULL OR ca.faturamentoUnificadoId = 0) THEN 1 ELSE 0 END)
          + SUM(CASE WHEN ca.statusConciliacao = 'glosa_total' AND ca.recebimentoId IS NULL THEN 1 ELSE 0 END)
        ) > 0 THEN 'nao_conciliado'
        ELSE 'conciliado'
      END as statusGuia,
      SUM(CASE WHEN ca.statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as itensConciliados,
      SUM(CASE WHEN ca.statusConciliacao IN ('divergente','acrescimo') THEN 1 ELSE 0 END) as itensAcrescimos,
      SUM(CASE WHEN ca.statusConciliacao = 'sem_pagamento' THEN 1 ELSE 0 END) as itensSemPagamento,
      SUM(CASE WHEN ca.statusConciliacao = 'glosa_total' THEN 1 ELSE 0 END) as itensGlosaTotal,
      SUM(CASE WHEN ca.statusConciliacao = 'glosa_parcial' THEN 1 ELSE 0 END) as itensGlosaParcial,
      SUM(CASE WHEN ca.statusConciliacao = 'terceiro' THEN 1 ELSE 0 END) as itensTerceiros,
      SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' THEN 1 ELSE 0 END) as itensAcrescimos,
      SUM(CASE WHEN ca.metodoConciliacao = 'agrupamento' THEN 1 ELSE 0 END) as itensAgrupados,
      SUM(CASE WHEN ca.statusConciliacao IN ('sem_pagamento','nao_recebido') THEN 1 ELSE 0 END)
      + SUM(CASE WHEN ca.statusConciliacao = 'acrescimo' AND (ca.faturamentoUnificadoId IS NULL OR ca.faturamentoUnificadoId = 0) THEN 1 ELSE 0 END)
      + SUM(CASE WHEN ca.statusConciliacao = 'glosa_total' AND ca.recebimentoId IS NULL THEN 1 ELSE 0 END) as itensDesassociados,
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

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId} AND ca.statusConciliacao != 'absorvido'`;
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
      (COALESCE(ca.valorPago, 0) + COALESCE(ca.valorGlosa, 0)) as valorFaturadoProcessado,
      COALESCE(ca.quantidade, 0) as quantidade,
      ca.recebimentoId, ca.recebimentoOrigem,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      mg.grupo as grupoGlosa,
      ca.statusConciliacao, ca.metodoConciliacao, ca.vinculadoAoId,
      COALESCE(ca.diferenca, 0) as diferenca,
      COALESCE(ca.percentualDiferenca, 0) as percentualDiferenca,
      ca.toleranciaUsada, ca.competenciaPagamento, ca.criadoEm,
      ca.executadoPor, ca.executadoPorNome
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
        valorPago = CASE WHEN statusConciliacao IN ('divergente','acrescimo') THEN valorPago ELSE 0 END,
        diferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN valorFaturado - valorPago ELSE valorFaturado END,
        percentualDiferenca = CASE WHEN valorFaturado > 0 AND valorPago > 0 AND valorPago < valorFaturado THEN ROUND(((valorFaturado - valorPago) / valorFaturado) * 100, 2) ELSE 100 END,
        motivoGlosa = ${esc(params.motivoGlosa)},
        codigoGlosa = ${esc(params.codigoGlosa)}
    WHERE id IN (${ids})
      AND estabelecimentoId = ${params.estabelecimentoId}
      AND statusConciliacao IN ('sem_pagamento', 'divergente', 'acrescimo', 'nao_recebido')
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

  let whereClause = `WHERE estabelecimentoId = ${params.estabelecimentoId} AND statusConciliacao IN ('sem_pagamento', 'divergente', 'acrescimo', 'nao_recebido')`;
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
        valorPago = CASE WHEN statusConciliacao IN ('divergente','acrescimo') THEN valorPago ELSE 0 END,
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
// CONCILIAÇÃO MANUAL - VINCULAÇÃO DE ITENS
// ============================================================

/**
 * Vincular manualmente um item de acréscimo a um item de glosa_total
 * Quando o convênio paga com código diferente do faturado
 */
export async function vincularItensManual(params: {
  estabelecimentoId: number;
  itemAcrescimoIds: number[];
  itemGlosaId: number;
  executadoPor?: string;
}): Promise<{ sucesso: boolean; mensagem: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const allIds = [...params.itemAcrescimoIds, params.itemGlosaId];

  // Verificar se todos os itens existem e pertencem ao mesmo estabelecimento
  const [rows] = await db.execute(sql.raw(`
    SELECT id, numeroGuia, contaNumero, statusConciliacao, codigoItem, descricaoItem, 
           valorFaturado, valorPago, recebimentoId, faturamentoUnificadoId, codigoGlosa, motivoGlosa
    FROM conciliados_automatico 
    WHERE id IN (${allIds.join(',')})
      AND estabelecimentoId = ${params.estabelecimentoId}
  `));

  const itens = rows as any[];
  if (itens.length !== allIds.length) {
    return { sucesso: false, mensagem: 'Itens não encontrados ou não pertencem ao mesmo estabelecimento' };
  }

  const itensAcrescimo = itens.filter((i: any) => params.itemAcrescimoIds.includes(i.id));
  const itemGlosa = itens.find((i: any) => i.id === params.itemGlosaId);

  if (itensAcrescimo.length === 0 || !itemGlosa) {
    return { sucesso: false, mensagem: 'Itens não encontrados' };
  }

  // Verificar que são da mesma guia
  const guiaGlosa = itemGlosa.numeroGuia || itemGlosa.contaNumero;
  for (const itemAcr of itensAcrescimo) {
    const guiaAcr = itemAcr.numeroGuia || itemAcr.contaNumero;
    if (guiaAcr !== guiaGlosa) {
      return { sucesso: false, mensagem: 'Todos os itens devem pertencer à mesma guia' };
    }
    if (itemAcr.statusConciliacao !== 'acrescimo') {
      return { sucesso: false, mensagem: `Item ${itemAcr.codigoItem} (id ${itemAcr.id}) tem status '${itemAcr.statusConciliacao}', esperado 'acrescimo'` };
    }
  }

  if (!['glosa_total', 'sem_pagamento', 'nao_recebido'].includes(itemGlosa.statusConciliacao)) {
    return { sucesso: false, mensagem: `Item de glosa tem status '${itemGlosa.statusConciliacao}', esperado 'glosa_total', 'sem_pagamento' ou 'nao_recebido'` };
  }

  // Somar valores pagos de todos os acréscimos
  const valorPagoTotal = itensAcrescimo.reduce((sum: number, i: any) => sum + (Number(i.valorPago) || 0), 0);
  const valorFaturadoGlosa = Number(itemGlosa.valorFaturado) || 0;
  const glosaReal = valorFaturadoGlosa - valorPagoTotal;
  const percentualGlosa = valorFaturadoGlosa > 0 ? Math.round((glosaReal / valorFaturadoGlosa) * 10000) / 100 : 0;

  // Determinar o código/motivo de glosa: manter original se existir, senão usar 9999
  const codigoGlosaFinal = itemGlosa.codigoGlosa || '9999';
  const motivoGlosaFinal = itemGlosa.motivoGlosa || 'Glosa não informada pela operadora';

  // Marcar TODOS os itens de acréscimo como 'absorvido'
  await db.execute(sql.raw(`
    UPDATE conciliados_automatico 
    SET statusConciliacao = 'absorvido',
        metodoConciliacao = 'manual',
        vinculadoAoId = ${params.itemGlosaId},
        diferenca = 0,
        percentualDiferenca = 0,
        executadoPorNome = ${params.executadoPor ? `'${params.executadoPor.replace(/'/g, "''")}'` : 'NULL'}
    WHERE id IN (${params.itemAcrescimoIds.join(',')})
      AND estabelecimentoId = ${params.estabelecimentoId}
  `));

  // Item faturado: atualizar com valor pago real (soma dos acréscimos) e glosa calculada
  const statusFinal = glosaReal > 0 ? 'glosa_parcial' : 'conciliado_manual';
  const primeiroRecebimentoId = itensAcrescimo.find((i: any) => i.recebimentoId)?.recebimentoId || null;
  
  await db.execute(sql.raw(`
    UPDATE conciliados_automatico 
    SET statusConciliacao = '${statusFinal}',
        metodoConciliacao = 'manual',
        vinculadoAoId = ${params.itemAcrescimoIds[0]},
        valorPago = ${valorPagoTotal},
        recebimentoId = ${primeiroRecebimentoId || 'NULL'},
        valorGlosa = CASE WHEN ${glosaReal} > 0 THEN ${glosaReal} ELSE 0 END,
        codigoGlosa = CASE WHEN ${glosaReal} > 0 THEN '${codigoGlosaFinal}' ELSE NULL END,
        motivoGlosa = CASE WHEN ${glosaReal} > 0 THEN '${motivoGlosaFinal.replace(/'/g, "''")}' ELSE NULL END,
        diferenca = ${glosaReal},
        percentualDiferenca = ${percentualGlosa},
        executadoPorNome = ${params.executadoPor ? `'${params.executadoPor.replace(/'/g, "''")}'` : 'NULL'}
    WHERE id = ${params.itemGlosaId}
      AND estabelecimentoId = ${params.estabelecimentoId}
  `));

  const codigosAcrescimo = itensAcrescimo.map((i: any) => i.codigoItem).join(', ');
  return { 
    sucesso: true, 
    mensagem: `Vinculado: ${itemGlosa.codigoItem} (faturado R$ ${valorFaturadoGlosa.toFixed(2)}) ↔ ${itensAcrescimo.length} acréscimo(s) [${codigosAcrescimo}] (pago R$ ${valorPagoTotal.toFixed(2)})${glosaReal > 0 ? ` | Glosa: R$ ${glosaReal.toFixed(2)}` : ''}` 
  };
}

/**
 * Desvincular itens que foram vinculados manualmente (reverter conciliação manual)
 */
export async function desvincularItensManual(params: {
  estabelecimentoId: number;
  itemId: number;
}): Promise<{ sucesso: boolean; mensagem: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Buscar o item e seu par vinculado
  const [rows] = await db.execute(sql.raw(`
    SELECT id, vinculadoAoId, statusConciliacao, faturamentoUnificadoId, recebimentoId, metodoConciliacao
    FROM conciliados_automatico 
    WHERE id = ${params.itemId}
      AND estabelecimentoId = ${params.estabelecimentoId}
  `));

  const item = (rows as any[])[0];
  if (!item) {
    return { sucesso: false, mensagem: 'Item não encontrado' };
  }
  // Aceitar desvincular itens com método 'manual' (podem ter status glosa_parcial, conciliado_manual ou absorvido)
  if (item.metodoConciliacao !== 'manual') {
    return { sucesso: false, mensagem: 'Item não foi vinculado manualmente' };
  }

  const parId = item.vinculadoAoId;

  // Reverter o item atual
  const eraAcrescimo = !item.faturamentoUnificadoId || item.faturamentoUnificadoId === 0;
  
  if (eraAcrescimo || item.statusConciliacao === 'absorvido') {
    // Reverter para acréscimo (era item absorvido)
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET statusConciliacao = 'acrescimo',
          metodoConciliacao = NULL,
          vinculadoAoId = NULL,
          diferenca = -valorPago,
          percentualDiferenca = 0,
          executadoPorNome = NULL
      WHERE id = ${params.itemId}
        AND estabelecimentoId = ${params.estabelecimentoId}
    `));
  } else {
    // Reverter para glosa_total (era item faturado que recebeu pagamento via vinculação)
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET statusConciliacao = 'glosa_total',
          metodoConciliacao = NULL,
          vinculadoAoId = NULL,
          valorPago = 0,
          recebimentoId = NULL,
          valorGlosa = valorFaturado,
          codigoGlosa = COALESCE(codigoGlosa, '9999'),
          diferenca = valorFaturado,
          percentualDiferenca = 100,
          executadoPorNome = NULL
      WHERE id = ${params.itemId}
        AND estabelecimentoId = ${params.estabelecimentoId}
    `));
  }

  // Reverter o par vinculado (se existir)
  if (parId) {
    const [parRows] = await db.execute(sql.raw(`
      SELECT id, faturamentoUnificadoId, statusConciliacao FROM conciliados_automatico 
      WHERE id = ${parId} AND estabelecimentoId = ${params.estabelecimentoId}
    `));
    const par = (parRows as any[])[0];
    if (par) {
      const parEraAcrescimo = !par.faturamentoUnificadoId || par.faturamentoUnificadoId === 0 || par.statusConciliacao === 'absorvido';
      if (parEraAcrescimo) {
        await db.execute(sql.raw(`
          UPDATE conciliados_automatico 
          SET statusConciliacao = 'acrescimo',
              metodoConciliacao = NULL,
              vinculadoAoId = NULL,
              diferenca = -valorPago,
              percentualDiferenca = 0,
              executadoPorNome = NULL
          WHERE id = ${parId}
            AND estabelecimentoId = ${params.estabelecimentoId}
        `));
      } else {
        await db.execute(sql.raw(`
          UPDATE conciliados_automatico 
          SET statusConciliacao = 'glosa_total',
              metodoConciliacao = NULL,
              vinculadoAoId = NULL,
              valorPago = 0,
              recebimentoId = NULL,
              valorGlosa = valorFaturado,
              codigoGlosa = COALESCE(codigoGlosa, '9999'),
              diferenca = valorFaturado,
              percentualDiferenca = 100,
              executadoPorNome = NULL
          WHERE id = ${parId}
            AND estabelecimentoId = ${params.estabelecimentoId}
        `));
      }
    }
  }

  return { sucesso: true, mensagem: 'Vinculação manual revertida com sucesso' };
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

// ============================================================
// RECURSO DE GLOSA VIA CONCILIAÇÃO
// ============================================================

/**
 * Lista itens glosados da conciliação disponíveis para recurso
 * Agrupa por guia, data ou lote
 */
export async function itensGlosadosParaRecurso(params: {
  estabelecimentoId: number;
  convenioId?: number;
  competencia?: string;
  dataPagto?: string;
  loteXml?: string;
  loteRetorno?: string;
  agrupamento?: 'guia' | 'data' | 'lote' | 'item' | 'motivo';
  busca?: string;
  apenasNaoRecursados?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number; resumo: any }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const agrupamento = params.agrupamento || 'guia';
  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  whereClause += ` AND ca.statusConciliacao IN ('glosa_parcial', 'glosa_total')`;
  whereClause += ` AND ca.statusConciliacao != 'absorvido'`;

  if (params.competencia && params.competencia !== 'todos') {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.dataPagto) {
    whereClause += ` AND ca.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${params.dataPagto.replace(/'/g, "''")}')`;
  }
  if (params.loteXml) {
    whereClause += ` AND ca.faturamentoUnificadoId IN (SELECT fu2.id FROM faturamento_unificado fu2 WHERE fu2.lotePrestador = '${params.loteXml.replace(/'/g, "''")}' AND fu2.estabelecimentoId = ${params.estabelecimentoId})`;
  }
  if (params.loteRetorno) {
    const lr = params.loteRetorno.replace(/'/g, "''");
    whereClause += ` AND ca.numeroGuia IN (SELECT DISTINCT d2.numero_guia FROM demonstrativo d2 WHERE d2.estabelecimentoId = ${params.estabelecimentoId} AND d2.lote_prestador = '${lr}')`;
  }
  if (params.busca) {
    const b = params.busca.replace(/'/g, "''");
    whereClause += ` AND (ca.numeroGuia LIKE '%${b}%' OR ca.pacienteNome LIKE '%${b}%' OR ca.codigoItem LIKE '%${b}%' OR ca.descricaoItem LIKE '%${b}%')`;
  }
  if (params.apenasNaoRecursados) {
    whereClause += ` AND (ca.xmlRecursoGerado IS NULL OR ca.xmlRecursoGerado = 0)`;
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let groupByField: string;
  let selectFields: string;
  let orderBy: string;

  if (agrupamento === 'guia') {
    groupByField = 'ca.numeroGuia, ca.convenio, ca.convenioId, ca.competencia';
    selectFields = `
      ca.numeroGuia as chave,
      ca.numeroGuia,
      ca.convenio,
      ca.convenioId,
      ca.competencia,
      MAX(ca.pacienteNome) as pacienteNome,
      MAX(fu.carteiraBeneficiario) as matricula,
      MAX(fu.lotePrestador) as lote,
      MAX(fu.protocolo) as protocolo,
      COALESCE(MIN(re.data_inicio_faturamento_internacao), MIN(ca.dataExecucao)) as dataInicio,
      COALESCE(MAX(re.data_fim_faturamento_internacao), MAX(ca.dataExecucao)) as dataFim,
      COUNT(*) as totalItensGlosados,
      SUM(COALESCE(ca.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as valorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as valorGlosa,
      SUM(CASE WHEN ca.glosaAceita = 0 OR ca.glosaAceita IS NULL THEN COALESCE(ca.valorRecurso, ca.valorGlosa, 0) ELSE 0 END) as valorRecursado,
      SUM(CASE WHEN ca.glosaAceita = 1 THEN COALESCE(ca.valorGlosa, 0) ELSE 0 END) as valorGlosaAceita,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.dataExecucao) as dataExecucao,
      GROUP_CONCAT(DISTINCT ca.codigoGlosa ORDER BY ca.codigoGlosa SEPARATOR ', ') as codigosGlosa,
      CASE 
        WHEN SUM(CASE WHEN ca.statusRecursoItem IS NOT NULL THEN 1 ELSE 0 END) = 0 THEN 'pendente'
        WHEN SUM(CASE WHEN ca.statusRecursoItem IS NULL THEN 1 ELSE 0 END) = 0 THEN 'finalizado'
        ELSE 'iniciado'
      END as statusRecurso
    `;
    orderBy = 'ORDER BY ca.competencia DESC, valorGlosa DESC';
  } else if (agrupamento === 'data') {
    groupByField = 'ca.dataExecucao, ca.convenio, ca.convenioId';
    selectFields = `
      DATE_FORMAT(ca.dataExecucao, '%Y-%m-%d') as chave,
      DATE_FORMAT(ca.dataExecucao, '%Y-%m-%d') as dataExecucao,
      ca.convenio,
      ca.convenioId,
      NULL as numeroGuia,
      NULL as competencia,
      NULL as pacienteNome,
      COUNT(*) as totalItensGlosados,
      SUM(COALESCE(ca.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as valorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as valorGlosa,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.dataExecucao) as dataExecucaoMax,
      GROUP_CONCAT(DISTINCT ca.codigoGlosa ORDER BY ca.codigoGlosa SEPARATOR ', ') as codigosGlosa
    `;
    orderBy = 'ORDER BY dataExecucao DESC, valorGlosa DESC';
  } else if (agrupamento === 'item') {
    groupByField = 'ca.codigoItem, ca.descricaoItem, ca.convenio, ca.convenioId';
    selectFields = `
      CONCAT(ca.codigoItem, '-', ca.convenioId) as chave,
      ca.codigoItem,
      ca.descricaoItem,
      ca.convenio,
      ca.convenioId,
      NULL as numeroGuia,
      MAX(ca.competencia) as competencia,
      NULL as pacienteNome,
      NULL as matricula,
      NULL as lote,
      NULL as protocolo,
      NULL as dataInicio,
      NULL as dataFim,
      COUNT(*) as totalItensGlosados,
      SUM(COALESCE(ca.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as valorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as valorGlosa,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.dataExecucao) as dataExecucao,
      GROUP_CONCAT(DISTINCT ca.codigoGlosa ORDER BY ca.codigoGlosa SEPARATOR ', ') as codigosGlosa
    `;
    orderBy = 'ORDER BY totalItensGlosados DESC, valorGlosa DESC';
  } else if (agrupamento === 'motivo') {
    groupByField = 'ca.codigoGlosa, ca.convenio, ca.convenioId';
    selectFields = `
      CONCAT(COALESCE(ca.codigoGlosa, 'SEM_CODIGO'), '-', ca.convenioId) as chave,
      ca.codigoGlosa,
      COALESCE(MAX(mg2.descricao), MAX(ca.motivoGlosa), 'Sem motivo identificado') as motivoGlosaDesc,
      ca.convenio,
      ca.convenioId,
      NULL as numeroGuia,
      MAX(ca.competencia) as competencia,
      NULL as pacienteNome,
      NULL as matricula,
      NULL as lote,
      NULL as protocolo,
      NULL as dataInicio,
      NULL as dataFim,
      COUNT(*) as totalItensGlosados,
      SUM(COALESCE(ca.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as valorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as valorGlosa,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.dataExecucao) as dataExecucao,
      GROUP_CONCAT(DISTINCT ca.codigoItem ORDER BY ca.codigoItem SEPARATOR ', ') as codigosItem
    `;
    orderBy = 'ORDER BY totalItensGlosados DESC, valorGlosa DESC';
  } else {
    // lote
    groupByField = 'fu.lotePrestador, ca.convenio, ca.convenioId';
    selectFields = `
      COALESCE(fu.lotePrestador, 'SEM_LOTE') as chave,
      COALESCE(fu.lotePrestador, 'Sem Lote') as lote,
      ca.convenio,
      ca.convenioId,
      NULL as numeroGuia,
      MAX(ca.competencia) as competencia,
      NULL as pacienteNome,
      COUNT(*) as totalItensGlosados,
      SUM(COALESCE(ca.valorFaturado, 0)) as valorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as valorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as valorGlosa,
      MAX(ca.xmlRecursoGerado) as xmlGerado,
      MAX(ca.dataExecucao) as dataExecucao,
      GROUP_CONCAT(DISTINCT ca.codigoGlosa ORDER BY ca.codigoGlosa SEPARATOR ', ') as codigosGlosa
    `;
    orderBy = 'ORDER BY valorGlosa DESC';
  }

  // Count
  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT 1 FROM conciliados_automatico ca
      LEFT JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
      ${whereClause}
      GROUP BY ${groupByField}
    ) sub
  `;

  // Main query
  const motivoJoin = agrupamento === 'motivo' ? `LEFT JOIN motivosGlosa mg2 ON ca.codigoGlosa = mg2.codigo AND mg2.ativo = 'sim'` : '';
  const recebimentoJoin = agrupamento === 'guia' ? `LEFT JOIN recebimentos_excel re ON ca.recebimentoId = re.id` : '';
  const mainQuery = `
    SELECT ${selectFields}
    FROM conciliados_automatico ca
    LEFT JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
    ${motivoJoin}
    ${recebimentoJoin}
    ${whereClause}
    GROUP BY ${groupByField}
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Resumo totais
  const resumoQuery = `
    SELECT 
      COUNT(*) as totalItens,
      COUNT(DISTINCT ca.numeroGuia) as totalGuias,
      SUM(COALESCE(ca.valorFaturado, 0)) as totalValorFaturado,
      SUM(COALESCE(ca.valorPago, 0)) as totalValorPago,
      SUM(COALESCE(ca.valorGlosa, 0)) as totalValorGlosa,
      SUM(CASE WHEN ca.xmlRecursoGerado = 1 THEN 1 ELSE 0 END) as totalJaRecursados,
      SUM(CASE WHEN ca.xmlRecursoGerado = 1 THEN COALESCE(ca.valorRecursado, ca.valorGlosa, 0) ELSE 0 END) as totalValorRecurso,
      SUM(CASE WHEN ca.glosaAceita = 1 THEN COALESCE(ca.valorGlosa, 0) ELSE 0 END) as totalValorAceite,
      SUM(CASE WHEN ca.xmlRecursoGerado = 0 AND (ca.glosaAceita IS NULL OR ca.glosaAceita = 0) THEN COALESCE(ca.valorGlosa, 0) ELSE 0 END) as totalValorNaoTrabalhado,
      SUM(CASE WHEN ca.xmlRecursoGerado = 1 OR ca.glosaAceita = 1 THEN 1 ELSE 0 END) as totalItensAnalisados
    FROM conciliados_automatico ca
    ${whereClause}
  `;

  const [[countResult], [mainResult], [resumoResult]] = await Promise.all([
    db.execute(sql.raw(countQuery)),
    db.execute(sql.raw(mainQuery)),
    db.execute(sql.raw(resumoQuery)),
  ]);

  const total = Number((countResult as unknown as any[])[0]?.total || 0);
  const resumoRow = (resumoResult as unknown as any[])[0] || {};

  return {
    items: (mainResult as unknown as any[]).map((r: any) => ({
      chave: r.chave,
      numeroGuia: r.numeroGuia,
      convenio: r.convenio,
      convenioId: Number(r.convenioId),
      competencia: r.competencia,
      pacienteNome: r.pacienteNome,
      matricula: r.matricula || null,
      lote: r.lote || null,
      protocolo: r.protocolo || null,
      dataInicio: r.dataInicio ? (r.dataInicio instanceof Date ? r.dataInicio.toISOString().split('T')[0] : String(r.dataInicio).split(' ')[0].split('T')[0]) : null,
      dataFim: r.dataFim ? (r.dataFim instanceof Date ? r.dataFim.toISOString().split('T')[0] : String(r.dataFim).split(' ')[0].split('T')[0]) : null,
      dataExecucao: r.dataExecucao || r.dataExecucaoMax,
      codigoItem: r.codigoItem || null,
      descricaoItem: r.descricaoItem || null,
      codigoGlosa: r.codigoGlosa || null,
      motivoGlosaDesc: r.motivoGlosaDesc || null,
      codigosItem: r.codigosItem || null,
      totalItensGlosados: Number(r.totalItensGlosados),
      valorFaturado: Number(r.valorFaturado),
      valorPago: Number(r.valorPago),
      valorGlosa: Number(r.valorGlosa),
      xmlGerado: Number(r.xmlGerado) === 1,
      codigosGlosa: r.codigosGlosa,
      valorRecursado: Number(r.valorRecursado || 0),
      valorGlosaAceita: Number(r.valorGlosaAceita || 0),
      statusRecurso: r.statusRecurso || 'pendente',
    })),
    total,
    resumo: {
      totalItens: Number(resumoRow.totalItens || 0),
      totalGuias: Number(resumoRow.totalGuias || 0),
      totalValorFaturado: Number(resumoRow.totalValorFaturado || 0),
      totalValorPago: Number(resumoRow.totalValorPago || 0),
      totalValorGlosa: Number(resumoRow.totalValorGlosa || 0),
      totalJaRecursados: Number(resumoRow.totalJaRecursados || 0),
      totalValorRecurso: Number(resumoRow.totalValorRecurso || 0),
      totalValorAceite: Number(resumoRow.totalValorAceite || 0),
      totalValorNaoTrabalhado: Number(resumoRow.totalValorNaoTrabalhado || 0),
      totalItensAnalisados: Number(resumoRow.totalItensAnalisados || 0),
      percentualAnalise: Number(resumoRow.totalItens || 0) > 0 ? Math.round((Number(resumoRow.totalItensAnalisados || 0) / Number(resumoRow.totalItens || 0)) * 10000) / 100 : 0,
    },
  };
}

/**
 * Detalha itens glosados de uma guia específica para recurso
 */
export async function itensGlosadosDetalheGuia(params: {
  estabelecimentoId: number;
  numeroGuia: string;
  convenioId?: number;
  competencia?: string;
  dataPagto?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  whereClause += ` AND ca.numeroGuia = '${params.numeroGuia.replace(/'/g, "''")}'`;
  whereClause += ` AND ca.statusConciliacao IN ('glosa_parcial', 'glosa_total')`;
  whereClause += ` AND ca.statusConciliacao != 'absorvido'`;

  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.dataPagto) {
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND ca.recebimentoId IN (SELECT re2.id FROM recebimentos_excel re2 WHERE DATE_FORMAT(re2.data_pagto, '%Y-%m-%d') = '${dp}')`;
  }

  const query = `
    SELECT 
      ca.id,
      ca.codigoItem,
      ca.descricaoItem,
      ca.tipoItem,
      COALESCE(re.data_execucao, ca.dataExecucao) as dataExecucao,
      ca.quantidade,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      mg.grupo as grupoGlosa,
      ca.statusConciliacao,
      ca.xmlRecursoGerado,
      ca.competencia,
      ca.pacienteNome,
      ca.glosaAceita,
      ca.glosaAceitaPor,
      ca.glosaAceitaEm,
      ca.valorRecurso,
      ca.statusRecursoItem
    FROM conciliados_automatico ca
    LEFT JOIN motivosGlosa mg ON ca.codigoGlosa = mg.codigo AND mg.ativo = 'sim'
    LEFT JOIN recebimentos_excel re ON ca.recebimentoId = re.id
    ${whereClause}
    ORDER BY ca.dataExecucao, ca.codigoItem
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]).map((r: any) => ({
    id: Number(r.id),
    codigoItem: r.codigoItem,
    descricaoItem: r.descricaoItem,
    tipoItem: r.tipoItem,
    dataExecucao: r.dataExecucao ? (r.dataExecucao instanceof Date ? r.dataExecucao.toISOString().split('T')[0] : String(r.dataExecucao).split(' ')[0].split('T')[0]) : null,
    quantidade: Number(r.quantidade) || 1,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    codigoGlosa: r.codigoGlosa,
    motivoGlosa: r.motivoGlosa,
    grupoGlosa: r.grupoGlosa,
    statusConciliacao: r.statusConciliacao,
    xmlRecursoGerado: Number(r.xmlRecursoGerado) === 1,
    competencia: r.competencia,
    pacienteNome: r.pacienteNome,
    glosaAceita: Number(r.glosaAceita) === 1,
    glosaAceitaPor: r.glosaAceitaPor,
    glosaAceitaEm: r.glosaAceitaEm,
    valorRecurso: r.valorRecurso ? Number(r.valorRecurso) : null,
    statusRecursoItem: r.statusRecursoItem,
  }));
}

/**
 * Gera Excel de recurso de glosa a partir dos itens selecionados da conciliação
 */
export async function gerarExcelRecursoConciliacao(params: {
  estabelecimentoId: number;
  convenioId?: number;
  guias?: string[];
  itensIds?: number[];
  justificativa?: string;
  competencia?: string;
  userId?: number;
}): Promise<{ dados: any[]; totais: any }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  whereClause += ` AND ca.statusConciliacao IN ('glosa_parcial', 'glosa_total')`;
  whereClause += ` AND ca.statusConciliacao != 'absorvido'`;

  if (params.guias && params.guias.length > 0) {
    const esc = (v: string) => `'${v.replace(/'/g, "''")}'`;
    whereClause += ` AND ca.numeroGuia IN (${params.guias.map(g => esc(g)).join(',')})`;
  }
  if (params.itensIds && params.itensIds.length > 0) {
    whereClause += ` AND ca.id IN (${params.itensIds.join(',')})`;
  }
  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.competencia && params.competencia !== 'todos') {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }

  const query = `
    SELECT 
      ca.id,
      ca.numeroGuia,
      ca.codigoItem,
      ca.descricaoItem,
      ca.tipoItem,
      ca.dataExecucao,
      ca.quantidade,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      ca.statusConciliacao,
      ca.pacienteNome,
      ca.convenio,
      ca.competencia,
      fu.senha,
      fu.carteiraBeneficiario
    FROM conciliados_automatico ca
    LEFT JOIN faturamento_unificado fu ON ca.faturamentoUnificadoId = fu.id
    LEFT JOIN motivosGlosa mg ON ca.codigoGlosa = mg.codigo AND mg.ativo = 'sim'
    ${whereClause}
    ORDER BY ca.numeroGuia, ca.dataExecucao, ca.codigoItem
  `;

  const [rows] = await db.execute(sql.raw(query));
  const itens = rows as unknown as any[];

  let totalValorFaturado = 0;
  let totalValorPago = 0;
  let totalValorGlosa = 0;
  let totalValorRecursado = 0;

  const dados = itens.map((r: any, idx: number) => {
    const vFat = Number(r.valorFaturado) || 0;
    const vPago = Number(r.valorPago) || 0;
    const vGlosa = Number(r.valorGlosa) || 0;
    totalValorFaturado += vFat;
    totalValorPago += vPago;
    totalValorGlosa += vGlosa;
    totalValorRecursado += vGlosa;

    return {
      "Seq.": idx + 1,
      "Nº Guia": r.numeroGuia,
      "Nome do Beneficiário": r.pacienteNome || '',
      "Carteirinha": r.carteiraBeneficiario || '',
      "Data Atendimento": r.dataExecucao ? new Date(r.dataExecucao).toLocaleDateString('pt-BR') : '',
      "Código Item": r.codigoItem,
      "Descrição": r.descricaoItem,
      "Tipo": r.tipoItem || '',
      "Qtde": Number(r.quantidade) || 1,
      "Valor Faturado": vFat,
      "Valor Pago": vPago,
      "Valor Glosa": vGlosa,
      "Valor Recursado": vGlosa,
      "Código Glosa": r.codigoGlosa || '',
      "Motivo Glosa": r.motivoGlosa || '',
      "Justificativa Recurso": params.justificativa || '',
      "Competência": r.competencia || '',
      "Convênio": r.convenio || '',
    };
  });

  return {
    dados,
    totais: {
      totalItens: dados.length,
      totalGuias: new Set(itens.map((r: any) => r.numeroGuia)).size,
      totalValorFaturado,
      totalValorPago,
      totalValorGlosa,
      totalValorRecursado,
    },
  };
}


/**
 * Gerar justificativas de recurso com IA para itens glosados da conciliação
 * Usa o dicionário de glosas TISS + histórico de recursos deferidos para contextualizar
 */
export async function gerarJustificativasIA(params: {
  itens: Array<{
    id: number;
    codigoItem: string;
    descricaoItem: string;
    codigoGlosa?: string;
    motivoGlosa?: string;
    valorFaturado?: string;
    valorPago?: string;
    valorGlosa?: string;
    tipoLancamento?: string;
  }>;
  estabelecimentoId: number;
  convenioNome?: string;
}) {
  const { invokeLLM } = await import("./_core/llm");
  const pool = await getExternalPool();

  // 1. Buscar dicionário de glosas para os códigos presentes
  const codigosGlosa = [...new Set(params.itens.map(i => i.codigoGlosa).filter(Boolean))];
  let dicionarioInfo: Record<string, any> = {};
  
  if (codigosGlosa.length > 0) {
    const placeholders = codigosGlosa.map(() => '?').join(',');
    const [dicionario] = await pool.query(
      `SELECT codigo, descricao, descricaoSimplificada, argumentoContestacao, grupo, probabilidadeSucesso
       FROM motivosGlosa 
       WHERE codigo IN (${placeholders}) AND ativo = 'sim'`,
      codigosGlosa
    );
    for (const d of dicionario as any[]) {
      dicionarioInfo[d.codigo] = d;
    }
  }

  // 2. Buscar histórico de recursos deferidos com os mesmos códigos de glosa
  let historicoSucesso: any[] = [];
  if (codigosGlosa.length > 0) {
    const placeholders = codigosGlosa.map(() => '?').join(',');
    const [historico] = await pool.query(
      `SELECT rg.codigoProcedimento, rg.descricaoProcedimento, rg.justificativaRecurso, rg.status,
              rg.valorGlosado, rg.valorRecuperado
       FROM recursosGlosa rg
       WHERE rg.estabelecimentoId = ?
         AND rg.status IN ('deferido', 'deferido_parcial')
         AND rg.motivoGlosaConvenio IN (${placeholders})
       ORDER BY rg.updatedAt DESC
       LIMIT 20`,
      [params.estabelecimentoId, ...codigosGlosa]
    );
    historicoSucesso = historico as any[];
  }

  // 3. Preparar contexto para a IA
  const itensContexto = params.itens.map(item => {
    const dic = item.codigoGlosa ? dicionarioInfo[item.codigoGlosa] : null;
    return {
      id: item.id,
      codigo: item.codigoItem,
      descricao: item.descricaoItem,
      tipo: item.tipoLancamento || 'não informado',
      valorFaturado: item.valorFaturado || '0',
      valorPago: item.valorPago || '0',
      valorGlosa: item.valorGlosa || '0',
      codigoGlosa: item.codigoGlosa || 'não informado',
      motivoGlosa: item.motivoGlosa || (dic?.descricaoSimplificada || dic?.descricao || 'não informado'),
      argumentoSugerido: dic?.argumentoContestacao || null,
      probabilidadeSucesso: dic?.probabilidadeSucesso || null,
    };
  });

  const historicoTexto = historicoSucesso.length > 0
    ? `\nHistórico de recursos DEFERIDOS com sucesso para estes códigos de glosa (use como referência):\n${historicoSucesso.slice(0, 10).map((h, i) => `${i+1}. Procedimento: ${h.descricaoProcedimento} | Justificativa usada: "${h.justificativaRecurso?.substring(0, 200)}"`).join('\n')}`
    : '';

  // 4. Chamar IA para gerar justificativas
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Você é um especialista em faturamento hospitalar e recursos de glosa de planos de saúde no Brasil.
Sua tarefa é gerar justificativas de recurso de glosa para cada item fornecido.

Regras:
- Cada justificativa deve ser técnica, objetiva e fundamentada
- Use linguagem formal e profissional
- Cite normas TISS, ANS, contratos e regulamentações quando aplicável
- Limite cada justificativa a no máximo 150 caracteres (requisito TISS)
- Se houver argumento sugerido do dicionário, use-o como base
- Se houver histórico de sucesso, inspire-se nas justificativas que funcionaram
- Adapte a justificativa ao tipo do item (material, medicamento, taxa, diária, procedimento)
- Convênio: ${params.convenioNome || 'não informado'}

Responda APENAS com JSON válido.`
      },
      {
        role: "user",
        content: `Gere justificativas de recurso para os seguintes itens glosados:\n\n${JSON.stringify(itensContexto, null, 2)}${historicoTexto}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "justificativas_recurso",
        strict: true,
        schema: {
          type: "object",
          properties: {
            justificativas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number", description: "ID do item" },
                  justificativa: { type: "string", description: "Justificativa de recurso (max 150 chars)" },
                },
                required: ["id", "justificativa"],
                additionalProperties: false,
              },
              description: "Lista de justificativas para cada item"
            }
          },
          required: ["justificativas"],
          additionalProperties: false,
        }
      }
    }
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("IA não retornou resposta");
  }

  const resultado = JSON.parse(content);
  return resultado;
}


// ============================================================
// VINCULAÇÕES PADRÃO - CADASTRO E APRENDIZADO AUTOMÁTICO
// ============================================================

/**
 * Listar vinculações padrão de um estabelecimento
 */
export async function listarVinculacoesPadrao(params: {
  estabelecimentoId: number;
  convenioId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let where = `WHERE estabelecimentoId = ${params.estabelecimentoId} AND ativo = 1`;
  if (params.convenioId) {
    where += ` AND (convenioId = ${params.convenioId} OR convenioId IS NULL)`;
  }

  const [rows] = await db.execute(sql.raw(
    `SELECT * FROM vinculacoes_padrao ${where} ORDER BY vezesUsado DESC, updatedAt DESC`
  ));
  return rows as unknown as any[];
}

/**
 * Criar ou atualizar uma vinculação padrão
 */
export async function salvarVinculacaoPadrao(params: {
  estabelecimentoId: number;
  convenioId?: number;
  codigoFaturado: string;
  codigoRecebido: string;
  descricaoFaturado?: string;
  descricaoRecebido?: string;
  tipoItem?: string;
  criadoPor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const convenioVal = params.convenioId ? String(params.convenioId) : 'NULL';
  const descFat = params.descricaoFaturado ? `'${params.descricaoFaturado.replace(/'/g, "''")}'` : 'NULL';
  const descRec = params.descricaoRecebido ? `'${params.descricaoRecebido.replace(/'/g, "''")}'` : 'NULL';
  const tipo = params.tipoItem ? `'${params.tipoItem.replace(/'/g, "''")}'` : 'NULL';
  const criado = params.criadoPor ? `'${params.criadoPor.replace(/'/g, "''")}'` : 'NULL';

  await db.execute(sql.raw(
    `INSERT INTO vinculacoes_padrao (estabelecimentoId, convenioId, codigoFaturado, codigoRecebido, descricaoFaturado, descricaoRecebido, tipoItem, criadoPor, vezesUsado)
     VALUES (${params.estabelecimentoId}, ${convenioVal}, '${params.codigoFaturado.replace(/'/g, "''")}', '${params.codigoRecebido.replace(/'/g, "''")}', ${descFat}, ${descRec}, ${tipo}, ${criado}, 1)
     ON DUPLICATE KEY UPDATE vezesUsado = vezesUsado + 1, descricaoFaturado = COALESCE(${descFat}, descricaoFaturado), descricaoRecebido = COALESCE(${descRec}, descricaoRecebido), updatedAt = NOW()`
  ));
  return { success: true };
}

/**
 * Registrar vinculação automática quando o usuário faz manualmente
 * Chamado após vincularItensManual para "aprender" a associação
 */
export async function aprenderVinculacao(params: {
  estabelecimentoId: number;
  convenioId?: number;
  codigoFaturado: string;
  codigoRecebido: string;
  descricaoFaturado?: string;
  descricaoRecebido?: string;
  tipoItem?: string;
  criadoPor?: string;
}) {
  return salvarVinculacaoPadrao(params);
}

/**
 * Excluir uma vinculação padrão
 */
export async function excluirVinculacaoPadrao(id: number, estabelecimentoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  await db.execute(sql.raw(
    `UPDATE vinculacoes_padrao SET ativo = 0 WHERE id = ${id} AND estabelecimentoId = ${estabelecimentoId}`
  ));
  return { success: true };
}

/**
 * Buscar vinculações padrão que correspondam a itens de acréscimo
 * Usado pela conciliação automática para aplicar vinculações aprendidas
 */
export async function buscarVinculacoesAplicaveis(params: {
  estabelecimentoId: number;
  convenioId?: number;
  codigosRecebidos: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (!params.codigosRecebidos.length) return [];

  const codigosIn = params.codigosRecebidos.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  let where = `WHERE estabelecimentoId = ${params.estabelecimentoId} AND ativo = 1 AND codigoRecebido IN (${codigosIn})`;
  if (params.convenioId) {
    where += ` AND (convenioId = ${params.convenioId} OR convenioId IS NULL)`;
  }

  const [rows] = await db.execute(sql.raw(
    `SELECT * FROM vinculacoes_padrao ${where} ORDER BY vezesUsado DESC`
  ));
  return rows as unknown as any[];
}


export async function replicarJustificativas(params: {
  estabelecimentoId: number;
  justificativasPorMotivo: Record<string, string>;
  justificativasPorItem: Record<string, string>;
  guiaOrigem: string;
  competencia?: string;
  convenioId?: number;
}) {
  const { estabelecimentoId, justificativasPorMotivo, justificativasPorItem, guiaOrigem, competencia, convenioId } = params;
  
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Buscar todos os itens glosados (exceto a guia de origem) que tenham mesmo motivo ou item
  let whereClause = `WHERE ca.estabelecimentoId = ${estabelecimentoId}
    AND ca.statusConciliacao IN ('glosa_total', 'glosa_parcial')
    AND ca.numeroGuia != '${guiaOrigem.replace(/'/g, "''")}'`;
  
  if (competencia) {
    whereClause += ` AND ca.competencia LIKE '${competencia.replace(/'/g, "''")}%'`;
  }
  if (convenioId) {
    whereClause += ` AND ca.convenioId = ${convenioId}`;
  }

  const [itens] = await db.execute(sql.raw(`
    SELECT ca.id, ca.codigoItem, ca.codigoGlosa, ca.numeroGuia
    FROM conciliados_automatico ca
    ${whereClause}
  `));

  const itensArray = itens as unknown as any[];
  let totalReplicados = 0;
  const guiasAfetadas = new Set<string>();
  const idsParaAtualizar: { id: number; justificativa: string }[] = [];

  for (const item of itensArray) {
    // Tentar match por motivo+item primeiro
    const keyMotivo = `${item.codigoGlosa || ''}-${item.codigoItem || ''}`;
    if (justificativasPorMotivo[keyMotivo]) {
      idsParaAtualizar.push({ id: item.id, justificativa: justificativasPorMotivo[keyMotivo] });
      guiasAfetadas.add(item.numeroGuia);
      totalReplicados++;
      continue;
    }
    // Depois tentar match por item
    if (item.codigoItem && justificativasPorItem[item.codigoItem]) {
      idsParaAtualizar.push({ id: item.id, justificativa: justificativasPorItem[item.codigoItem] });
      guiasAfetadas.add(item.numeroGuia);
      totalReplicados++;
    }
  }

  // Salvar as justificativas replicadas no banco (tabela recursos_glosa se existir, ou na conciliados_automatico)
  // Por agora, salvar na tabela recursos_glosa_justificativas
  if (idsParaAtualizar.length > 0) {
    // Criar tabela se não existir
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS recursos_glosa_justificativas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conciliadoId INT NOT NULL,
        justificativa TEXT NOT NULL,
        criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_conciliado_unique (conciliadoId)
      )
    `));

    // Inserir/atualizar justificativas em lote
    const values = idsParaAtualizar.map(i => 
      `(${i.id}, '${i.justificativa.replace(/'/g, "''")}')`
    ).join(',');

    await db.execute(sql.raw(`
      INSERT INTO recursos_glosa_justificativas (conciliadoId, justificativa)
      VALUES ${values}
      ON DUPLICATE KEY UPDATE justificativa = VALUES(justificativa), atualizadoEm = CURRENT_TIMESTAMP
    `));
  }

  return {
    totalReplicados,
    totalGuias: guiasAfetadas.size,
  };
}


// ============ LOTES DE RECURSO DE GLOSA ============

export async function criarLoteRecurso(params: {
  estabelecimentoId: number;
  convenioId?: number;
  convenioNome?: string;
  competencia?: string;
  guias: string[];
  statusRecurso: 'parcial' | 'total';
  criadoPor: string;
  xmlUrl?: string;
  justificativasItens?: Record<number, string>;
}) {
  const { estabelecimentoId, convenioId, convenioNome, competencia, guias, statusRecurso, criadoPor, xmlUrl, justificativasItens } = params;
  
  // Buscar itens glosados das guias selecionadas
  const guiasIn = guias.map(g => `'${g.replace(/'/g, "''")}'`).join(',');
  const [itens] = await db.execute(sql.raw(`
    SELECT id, COALESCE(valorGlosa, 0) as valorGlosa, COALESCE(valorFaturado, 0) as valorFaturado
    FROM conciliados_automatico
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND numeroGuia IN (${guiasIn})
      AND statusConciliacao IN ('glosa_total', 'glosa_parcial')
  `));
  
  const itensArray = itens as unknown as any[];
  const totalItens = itensArray.length;
  const valorTotalGlosa = itensArray.reduce((sum: number, i: any) => sum + Number(i.valorGlosa || 0), 0);
  const valorTotalRecursado = statusRecurso === 'total' ? valorTotalGlosa : valorTotalGlosa * 0.5; // parcial = 50% por padrão

  // Criar lote
  const [result] = await db.execute(sql.raw(`
    INSERT INTO recursos_glosa_lotes (estabelecimentoId, convenioId, convenioNome, competencia, statusRecurso, totalGuias, totalItens, valorTotalGlosa, valorTotalRecursado, xmlUrl, criadoPor)
    VALUES (${estabelecimentoId}, ${convenioId || 'NULL'}, ${convenioNome ? `'${convenioNome.replace(/'/g, "''")}'` : 'NULL'}, ${competencia ? `'${competencia}'` : 'NULL'}, '${statusRecurso}', ${guias.length}, ${totalItens}, ${valorTotalGlosa}, ${valorTotalRecursado}, ${xmlUrl ? `'${xmlUrl}'` : 'NULL'}, '${criadoPor.replace(/'/g, "''")}')
  `));
  
  const loteId = (result as any).insertId;
  
  // Vincular itens ao lote
  if (itensArray.length > 0) {
    const values = itensArray.map((i: any) => {
      const justificativa = justificativasItens?.[i.id] || '';
      const valorRecursado = statusRecurso === 'total' ? Number(i.valorGlosa) : Number(i.valorGlosa) * 0.5;
      return `(${loteId}, ${i.id}, 'recurso_${statusRecurso}', '${justificativa.replace(/'/g, "''")}', ${valorRecursado})`;
    }).join(',');
    
    await db.execute(sql.raw(`
      INSERT INTO recursos_glosa_itens (loteId, conciliadoId, statusItem, justificativa, valorRecursado)
      VALUES ${values}
    `));
  }
  
  return { loteId, totalItens, totalGuias: guias.length, valorTotalGlosa, valorTotalRecursado };
}

export async function listarLotesRecurso(params: {
  estabelecimentoId: number;
  convenioId?: number;
  statusRecurso?: string;
  limit?: number;
  offset?: number;
}) {
  const { estabelecimentoId, convenioId, statusRecurso, limit = 20, offset = 0 } = params;
  
  let whereClause = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (convenioId) whereClause += ` AND convenioId = ${convenioId}`;
  if (statusRecurso) whereClause += ` AND statusRecurso = '${statusRecurso}'`;
  
  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM recursos_glosa_lotes
    ${whereClause}
    ORDER BY criadoEm DESC
    LIMIT ${limit} OFFSET ${offset}
  `));
  
  const [countResult] = await db.execute(sql.raw(`
    SELECT COUNT(*) as total FROM recursos_glosa_lotes ${whereClause}
  `));
  
  return {
    items: rows as unknown as any[],
    total: Number((countResult as unknown as any[])[0]?.total || 0),
  };
}

export async function detalheLoteRecurso(loteId: number) {
  const [lote] = await db.execute(sql.raw(`
    SELECT * FROM recursos_glosa_lotes WHERE id = ${loteId}
  `));
  
  const [itens] = await db.execute(sql.raw(`
    SELECT rgi.*, ca.codigoItem, ca.descricaoItem, ca.numeroGuia, ca.pacienteNome, ca.codigoGlosa, ca.motivoGlosa, ca.valorFaturado, ca.valorPago, ca.valorGlosa, ca.dataExecucao
    FROM recursos_glosa_itens rgi
    JOIN conciliados_automatico ca ON rgi.conciliadoId = ca.id
    WHERE rgi.loteId = ${loteId}
    ORDER BY ca.numeroGuia, ca.codigoItem
  `));
  
  return {
    lote: (lote as unknown as any[])[0] || null,
    itens: itens as unknown as any[],
  };
}

export async function atualizarStatusLote(loteId: number, statusRecurso: string, observacao?: string) {
  let setClause = `statusRecurso = '${statusRecurso}'`;
  if (observacao) setClause += `, observacao = '${observacao.replace(/'/g, "''")}'`;
  
  await db.execute(sql.raw(`
    UPDATE recursos_glosa_lotes SET ${setClause} WHERE id = ${loteId}
  `));
  
  return { success: true };
}


// ============ DETALHE POR ITEM E POR MOTIVO ============

/**
 * Detalha itens glosados filtrados por código de item (para aba "Por Item")
 * Retorna todas as guias/pacientes que tiveram esse item glosado
 */
export async function itensGlosadosDetalhePorItem(params: {
  estabelecimentoId: number;
  codigoItem: string;
  convenioId?: number;
  competencia?: string;
  dataPagto?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  whereClause += ` AND ca.codigoItem = '${params.codigoItem.replace(/'/g, "''")}'`;
  whereClause += ` AND ca.statusConciliacao IN ('glosa_parcial', 'glosa_total')`;
  whereClause += ` AND ca.statusConciliacao != 'absorvido'`;

  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.dataPagto) {
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND ca.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dp}')`;
  }

  const query = `
    SELECT 
      ca.id,
      ca.codigoItem,
      ca.descricaoItem,
      ca.tipoItem,
      ca.dataExecucao,
      ca.quantidade,
      ca.numeroGuia,
      ca.pacienteNome,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      ca.statusConciliacao,
      ca.xmlRecursoGerado,
      ca.competencia,
      ca.glosaAceita,
      ca.glosaAceitaPor,
      ca.valorRecurso,
      rj.justificativa as justificativaRecurso
    FROM conciliados_automatico ca
    LEFT JOIN motivosGlosa mg ON ca.codigoGlosa = mg.codigo AND mg.ativo = 'sim'
    LEFT JOIN recursos_glosa_justificativas rj ON rj.conciliadoId = ca.id
    ${whereClause}
    ORDER BY ca.pacienteNome, ca.dataExecucao
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]).map((r: any) => ({
    id: Number(r.id),
    codigoItem: r.codigoItem,
    descricaoItem: r.descricaoItem,
    tipoItem: r.tipoItem,
    dataExecucao: r.dataExecucao ? (r.dataExecucao instanceof Date ? r.dataExecucao.toISOString().split('T')[0] : String(r.dataExecucao).split(' ')[0].split('T')[0]) : null,
    quantidade: Number(r.quantidade) || 1,
    numeroGuia: r.numeroGuia,
    pacienteNome: r.pacienteNome,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    codigoGlosa: r.codigoGlosa,
    motivoGlosa: r.motivoGlosa,
    statusConciliacao: r.statusConciliacao,
    xmlRecursoGerado: Number(r.xmlRecursoGerado) === 1,
    competencia: r.competencia,
    glosaAceita: Number(r.glosaAceita) === 1,
    glosaAceitaPor: r.glosaAceitaPor,
    valorRecurso: r.valorRecurso ? Number(r.valorRecurso) : null,
    justificativaRecurso: r.justificativaRecurso,
  }));
}

/**
 * Detalha itens glosados filtrados por motivo de glosa (para aba "Por Motivo")
 * Retorna todas as guias/pacientes que tiveram esse motivo de glosa
 */
export async function itensGlosadosDetalhePorMotivo(params: {
  estabelecimentoId: number;
  codigoGlosa: string;
  convenioId?: number;
  competencia?: string;
  dataPagto?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE ca.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.codigoGlosa === 'SEM_CODIGO') {
    whereClause += ` AND (ca.codigoGlosa IS NULL OR ca.codigoGlosa = '')`;
  } else {
    whereClause += ` AND ca.codigoGlosa = '${params.codigoGlosa.replace(/'/g, "''")}'`;
  }
  whereClause += ` AND ca.statusConciliacao IN ('glosa_parcial', 'glosa_total')`;
  whereClause += ` AND ca.statusConciliacao != 'absorvido'`;

  if (params.convenioId) {
    whereClause += ` AND ca.convenioId = ${params.convenioId}`;
  }
  if (params.competencia) {
    whereClause += ` AND ca.competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.dataPagto) {
    const dp = params.dataPagto.replace(/'/g, "''");
    whereClause += ` AND ca.recebimentoId IN (SELECT re.id FROM recebimentos_excel re WHERE DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dp}')`;
  }

  const query = `
    SELECT 
      ca.id,
      ca.codigoItem,
      ca.descricaoItem,
      ca.tipoItem,
      ca.dataExecucao,
      ca.quantidade,
      ca.numeroGuia,
      ca.pacienteNome,
      COALESCE(ca.valorFaturado, 0) as valorFaturado,
      COALESCE(ca.valorPago, 0) as valorPago,
      COALESCE(ca.valorGlosa, 0) as valorGlosa,
      ca.codigoGlosa,
      COALESCE(mg.descricao, ca.motivoGlosa) as motivoGlosa,
      ca.statusConciliacao,
      ca.xmlRecursoGerado,
      ca.competencia,
      ca.glosaAceita,
      ca.glosaAceitaPor,
      ca.valorRecurso,
      rj.justificativa as justificativaRecurso
    FROM conciliados_automatico ca
    LEFT JOIN motivosGlosa mg ON ca.codigoGlosa = mg.codigo AND mg.ativo = 'sim'
    LEFT JOIN recursos_glosa_justificativas rj ON rj.conciliadoId = ca.id
    ${whereClause}
    ORDER BY ca.pacienteNome, ca.dataExecucao
  `;

  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[]).map((r: any) => ({
    id: Number(r.id),
    codigoItem: r.codigoItem,
    descricaoItem: r.descricaoItem,
    tipoItem: r.tipoItem,
    dataExecucao: r.dataExecucao ? (r.dataExecucao instanceof Date ? r.dataExecucao.toISOString().split('T')[0] : String(r.dataExecucao).split(' ')[0].split('T')[0]) : null,
    quantidade: Number(r.quantidade) || 1,
    numeroGuia: r.numeroGuia,
    pacienteNome: r.pacienteNome,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    codigoGlosa: r.codigoGlosa,
    motivoGlosa: r.motivoGlosa,
    statusConciliacao: r.statusConciliacao,
    xmlRecursoGerado: Number(r.xmlRecursoGerado) === 1,
    competencia: r.competencia,
    glosaAceita: Number(r.glosaAceita) === 1,
    glosaAceitaPor: r.glosaAceitaPor,
    valorRecurso: r.valorRecurso ? Number(r.valorRecurso) : null,
    justificativaRecurso: r.justificativaRecurso,
  }));
}

/**
 * Marcar um item conciliado como glosa aceita
 */
export async function marcarGlosaAceita(conciliadoId: number, aceita: boolean, usuario: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Criar coluna se não existir
  await db.execute(sql.raw(`
    ALTER TABLE conciliados_automatico 
    ADD COLUMN IF NOT EXISTS glosaAceita TINYINT(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS glosaAceitaPor VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS glosaAceitaEm DATETIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS valorRecurso DECIMAL(12,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS statusRecursoItem VARCHAR(50) DEFAULT NULL
  `));

  if (aceita) {
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET glosaAceita = 1, glosaAceitaPor = '${usuario.replace(/'/g, "''")}', glosaAceitaEm = NOW(), statusRecursoItem = 'aceita', valorRecurso = 0
      WHERE id = ${conciliadoId}
    `));
  } else {
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET glosaAceita = 0, glosaAceitaPor = NULL, glosaAceitaEm = NULL, statusRecursoItem = NULL, valorRecurso = NULL
      WHERE id = ${conciliadoId}
    `));
  }

  return { success: true };
}

/**
 * Salvar valor do recurso para um item conciliado
 */
export async function salvarValorRecurso(conciliadoId: number, valorRecurso: number) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Criar coluna se não existir
  await db.execute(sql.raw(`
    ALTER TABLE conciliados_automatico 
    ADD COLUMN IF NOT EXISTS valorRecurso DECIMAL(12,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS statusRecursoItem VARCHAR(50) DEFAULT NULL
  `));

  await db.execute(sql.raw(`
    UPDATE conciliados_automatico 
    SET valorRecurso = ${valorRecurso}, statusRecursoItem = COALESCE(statusRecursoItem, 'iniciado')
    WHERE id = ${conciliadoId}
  `));

  return { success: true };
}


/**
 * Marcar glosa aceita em lote (todos os itens de uma vez)
 */
export async function marcarGlosaAceitaEmLote(conciliadoIds: number[], aceita: boolean, usuario: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (conciliadoIds.length === 0) return { success: true, total: 0 };

  const idsStr = conciliadoIds.join(',');

  if (aceita) {
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET glosaAceita = 1, glosaAceitaPor = '${usuario.replace(/'/g, "''")}', glosaAceitaEm = NOW(), statusRecursoItem = 'aceita', valorRecurso = 0
      WHERE id IN (${idsStr})
    `));
  } else {
    await db.execute(sql.raw(`
      UPDATE conciliados_automatico 
      SET glosaAceita = 0, glosaAceitaPor = NULL, glosaAceitaEm = NULL, statusRecursoItem = NULL, valorRecurso = NULL
      WHERE id IN (${idsStr})
    `));
  }

  return { success: true, total: conciliadoIds.length };
}


// =====================================================
// RECURSO GLOSA DEMONSTRATIVO - Funções para a nova tela
// =====================================================

/**
 * Competências disponíveis no recebimentos_excel para o filtro
 */
export async function competenciasDemonstrativo(estabelecimentoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const [rows] = await db.execute(sql.raw(
    `SELECT competencia, SUM(total) as total FROM (
      SELECT DATE_FORMAT(d.data_pagamento, '%Y-%m') as competencia, COUNT(*) as total
      FROM demonstrativo d
      WHERE d.estabelecimentoId = ${estabelecimentoId} AND d.valor_glosa > 0 AND d.data_pagamento IS NOT NULL
      GROUP BY DATE_FORMAT(d.data_pagamento, '%Y-%m')
      UNION ALL
      SELECT DATE_FORMAT(re.data_pagto, '%Y-%m') as competencia, COUNT(*) as total
      FROM recebimentos_excel re
      WHERE re.estabelecimentoId = ${estabelecimentoId}
        AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))
        AND re.data_pagto IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM demonstrativo d2
          WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
          AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
          AND d2.valor_glosa > 0
        )
      GROUP BY DATE_FORMAT(re.data_pagto, '%Y-%m')
    ) unified
    GROUP BY competencia
    ORDER BY competencia DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.competencia);
}

/**
 * Convênios disponíveis no recebimentos_excel para o filtro
 */
export async function conveniosDemonstrativo(estabelecimentoId: number, competencia?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  let whereDemo = `WHERE d.estabelecimentoId = ${estabelecimentoId} AND d.valor_glosa > 0`;
  let whereExcel = `WHERE re.estabelecimentoId = ${estabelecimentoId} AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))`;
  if (competencia) {
    whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
    whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  }
  const [rows] = await db.execute(sql.raw(
    `SELECT convenioId, convenio, SUM(total) as total FROM (
      SELECT d.convenio_id as convenioId, c.nome as convenio, COUNT(*) as total
      FROM demonstrativo d
      LEFT JOIN convenios c ON c.id = d.convenio_id
      ${whereDemo}
      GROUP BY d.convenio_id, c.nome
      UNION ALL
      SELECT re.convenioId, c.nome as convenio, COUNT(*) as total
      FROM recebimentos_excel re
      LEFT JOIN convenios c ON c.id = re.convenioId
      ${whereExcel}
      AND NOT EXISTS (
        SELECT 1 FROM demonstrativo d2
        WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
        AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
        AND d2.valor_glosa > 0
      )
      GROUP BY re.convenioId, c.nome
    ) unified
    GROUP BY convenioId, convenio
    ORDER BY total DESC`
  ));
  return (rows as unknown as any[]).filter((r: any) => r.convenioId);
}

/**
 * Datas de pagamento disponíveis no demonstrativo para filtro
 */
export async function datasPagamentoDemonstrativo(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ dataPagto: string; total: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  let whereDemo = `WHERE d.estabelecimentoId = ${params.estabelecimentoId} AND d.valor_glosa > 0 AND d.data_pagamento IS NOT NULL`;
  let whereExcel = `WHERE re.estabelecimentoId = ${params.estabelecimentoId} AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0)) AND re.data_pagto IS NOT NULL`;
  if (params.competencia) {
    whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${params.competencia.replace(/'/g, "''")}'`;
    whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${params.competencia.replace(/'/g, "''")}'`;
  }
  if (params.convenioId) {
    whereDemo += ` AND d.convenio_id = ${params.convenioId}`;
    whereExcel += ` AND re.convenioId = ${params.convenioId}`;
  }
  const [rows] = await db.execute(sql.raw(`
    SELECT dataPagto, SUM(total) as total FROM (
      SELECT DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') as dataPagto, COUNT(*) as total
      FROM demonstrativo d
      ${whereDemo}
      GROUP BY DATE_FORMAT(d.data_pagamento, '%Y-%m-%d')
      UNION ALL
      SELECT DATE_FORMAT(re.data_pagto, '%Y-%m-%d') as dataPagto, COUNT(*) as total
      FROM recebimentos_excel re
      ${whereExcel}
      AND NOT EXISTS (
        SELECT 1 FROM demonstrativo d2
        WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
        AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
        AND d2.valor_glosa > 0
      )
      GROUP BY DATE_FORMAT(re.data_pagto, '%Y-%m-%d')
    ) unified
    GROUP BY dataPagto
    ORDER BY dataPagto DESC
  `));
  return (rows as unknown as any[]).map((r: any) => ({
    dataPagto: r.dataPagto,
    total: Number(r.total) || 0,
  }));
}

/**
 * Itens glosados do demonstrativo (UNION demonstrativo + recebimentos_excel) para recurso
 * Suporta agrupamento por guia, item e motivo
 */
export async function itensGlosadosDemonstrativo(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  dataPagto?: string;
  agrupamento: 'guia' | 'item' | 'motivo';
  busca?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, competencia, convenioId, dataPagto, agrupamento, busca, page = 1, pageSize = 50 } = params;
  const offset = (page - 1) * pageSize;

  // Build WHERE for demonstrativo table
  let whereDemo = `WHERE d.estabelecimentoId = ${estabelecimentoId} AND d.valor_glosa > 0`;
  if (competencia) {
    whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  }
  if (convenioId) {
    whereDemo += ` AND d.convenio_id = ${convenioId}`;
  }
  if (dataPagto) {
    whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;
  }
  if (busca) {
    const b = busca.replace(/'/g, "''");
    whereDemo += ` AND (d.numero_guia LIKE '%${b}%' OR d.nome_beneficiario LIKE '%${b}%' OR d.codigo_item LIKE '%${b}%' OR d.descricao_item LIKE '%${b}%')`;
  }

  // Build WHERE for recebimentos_excel table
  let whereExcel = `WHERE re.estabelecimentoId = ${estabelecimentoId} AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))`;
  if (competencia) {
    whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  }
  if (convenioId) {
    whereExcel += ` AND re.convenioId = ${convenioId}`;
  }
  if (dataPagto) {
    whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;
  }
  if (busca) {
    const b = busca.replace(/'/g, "''");
    whereExcel += ` AND (re.numero_guia LIKE '%${b}%' OR re.nome_beneficiario LIKE '%${b}%' OR re.item LIKE '%${b}%' OR re.item_desc LIKE '%${b}%')`;
  }

  const notExistsClause = `AND NOT EXISTS (
    SELECT 1 FROM demonstrativo d2
    WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
    AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
    AND d2.valor_glosa > 0
  )`;

  // UNION subquery for unified data
  // Cruza com recursosGlosa para detectar itens que já têm recurso criado no /acompanhamento-recursos
  const unionSubquery = `(
    SELECT 
      d.id as id, 'demo' as fonte,
      d.numero_guia as guia, d.nome_beneficiario as paciente,
      d.protocolo, d.lote_prestador as lote, d.carteira_beneficiario as carteirinha,
      d.codigo_item as codigo, d.descricao_item as descricao,
      d.data_execucao as dataExecucao,
      d.quantidade as qtde,
      d.convenio_id as convenioId, c.nome as convenio,
      COALESCE(d.valor_pago, 0) as valorPago,
      COALESCE(d.valor_glosa, 0) as valorGlosa,
      COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0) as valorFaturado,
      COALESCE(d.codigo_glosa, CASE WHEN d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
      d.classificacao_glosa as classificacaoGlosa,
      CASE 
        WHEN d.justificativa_recurso IS NOT NULL AND d.valor_recurso > 0 AND d.glosa_aceita = 0 THEN 'recursado'
        WHEN d.glosa_aceita = 1 THEN 'aceita'
        WHEN rg_d.id IS NOT NULL THEN 'recurso_criado'
        WHEN d.recurso_status IS NOT NULL AND d.recurso_status != 'sem_recurso' THEN d.recurso_status
        ELSE NULL
      END as recursoStatus,
      d.justificativa_recurso as justificativa,
      COALESCE(d.valor_recurso, d.valor_glosa, 0) as valorRecurso,
      COALESCE(d.glosa_aceita, 0) as glosaAceita,
      d.glosa_aceita_por as glosaAceitaPor,
      d.erro_tiss as erroTiss,
      d.tipo_lancamento as tipo
    FROM demonstrativo d
    LEFT JOIN convenios c ON c.id = d.convenio_id
    LEFT JOIN recursosGlosa rg_d ON rg_d.guiaNumero = d.numero_guia AND rg_d.codigoProcedimento = d.codigo_item AND rg_d.estabelecimentoId = d.estabelecimentoId
    ${whereDemo}
    UNION ALL
    SELECT 
      re.id as id, 'excel' as fonte,
      re.numero_guia as guia, re.nome_beneficiario as paciente,
      re.protocolo_tiss as protocolo, re.lote_prestador as lote, re.beneficiario as carteirinha,
      re.item as codigo, re.item_desc as descricao,
      re.data_execucao as dataExecucao,
      re.quantidade as qtde,
      re.convenioId, c.nome as convenio,
      CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN 0 ELSE COALESCE(re.valor_pagamento, 0) END as valorPago,
      CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE 0 END as valorGlosa,
      CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) + re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE COALESCE(re.valor_informado, re.valor_pagamento, 0) END as valorFaturado,
      COALESCE(re.codigo_glosa, CASE WHEN re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
      NULL as classificacaoGlosa,
      CASE 
        WHEN re.justificativa_recurso IS NOT NULL AND re.valor_recurso > 0 AND (re.glosa_aceita IS NULL OR re.glosa_aceita = 0) THEN 'recursado'
        WHEN re.glosa_aceita = 1 THEN 'aceita'
        WHEN rg_e.id IS NOT NULL THEN 'recurso_criado'
        WHEN re.status_recurso_item IS NOT NULL AND re.status_recurso_item != 'pendente' THEN re.status_recurso_item
        ELSE NULL
      END as recursoStatus,
      re.justificativa_recurso as justificativa,
      COALESCE(re.valor_recurso, re.valor_glosa, re.valor_pagamento, 0) as valorRecurso,
      re.glosa_aceita as glosaAceita,
      re.glosa_aceita_por as glosaAceitaPor,
      re.erro_tiss as erroTiss,
      re.tipo_lancamento as tipo
    FROM recebimentos_excel re
    LEFT JOIN convenios c ON c.id = re.convenioId
    LEFT JOIN recursosGlosa rg_e ON rg_e.guiaNumero = re.numero_guia AND rg_e.codigoProcedimento = re.item AND rg_e.estabelecimentoId = re.estabelecimentoId
    ${whereExcel}
    ${notExistsClause}
  )`;

  let query = '';
  let countQuery = '';

  if (agrupamento === 'guia') {
    query = `
      SELECT 
        u.guia,
        MAX(u.paciente) as paciente,
        MAX(u.protocolo) as protocolo,
        MAX(u.lote) as lote,
        MAX(u.carteirinha) as carteirinha,
        MAX(u.convenio) as convenio,
        COUNT(*) as itensGlosados,
        SUM(u.valorFaturado) as valorFaturado,
        SUM(u.valorPago) as valorPago,
        SUM(u.valorGlosa) as valorGlosa,
        SUM(COALESCE(u.valorRecurso, 0)) as valorRecursado,
        SUM(CASE WHEN u.glosaAceita = 1 THEN COALESCE(u.valorGlosa, 0) ELSE 0 END) as valorGlosaAceita,
        CASE
          WHEN SUM(CASE WHEN u.recursoStatus IN ('recurso_criado', 'recursado') OR u.glosaAceita = 1 THEN 1 ELSE 0 END) = 0 THEN 'Pendente'
          WHEN SUM(CASE WHEN u.recursoStatus NOT IN ('recurso_criado', 'recursado') AND (u.glosaAceita IS NULL OR u.glosaAceita = 0) THEN 1 ELSE 0 END) = 0 THEN 'Finalizado'
          ELSE 'Iniciado'
        END as statusRecurso
      FROM ${unionSubquery} u
      GROUP BY u.guia
      ORDER BY SUM(u.valorGlosa) DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countQuery = `SELECT COUNT(DISTINCT u.guia) as total FROM ${unionSubquery} u`;
  } else if (agrupamento === 'item') {
    query = `
      SELECT 
        u.codigo,
        MAX(u.descricao) as descricao,
        MAX(u.tipo) as tipo,
        MAX(u.convenio) as convenio,
        COUNT(*) as itensGlosados,
        SUM(u.valorFaturado) as valorFaturado,
        SUM(u.valorPago) as valorPago,
        SUM(u.valorGlosa) as valorGlosa,
        NULL as justificativasPreenchidas
      FROM ${unionSubquery} u
      GROUP BY u.codigo
      ORDER BY COUNT(*) DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countQuery = `SELECT COUNT(DISTINCT u.codigo) as total FROM ${unionSubquery} u`;
  } else {
    // motivo
    query = `
      SELECT 
        COALESCE(u.codigoGlosa, 'SEM_CODIGO') as codigoGlosa,
        MAX(mg.descricao) as motivoGlosa,
        MAX(u.convenio) as convenio,
        COUNT(*) as itensGlosados,
        SUM(u.valorFaturado) as valorFaturado,
        SUM(u.valorPago) as valorPago,
        SUM(u.valorGlosa) as valorGlosa,
        NULL as justificativasPreenchidas
      FROM ${unionSubquery} u
      LEFT JOIN motivosGlosa mg ON mg.codigo = u.codigoGlosa
      GROUP BY COALESCE(u.codigoGlosa, 'SEM_CODIGO')
      ORDER BY COUNT(*) DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countQuery = `SELECT COUNT(DISTINCT COALESCE(u.codigoGlosa, 'SEM_CODIGO')) as total FROM ${unionSubquery} u`;
  }

  // Query de resumo para KPIs
  const resumoQuery = `
    SELECT 
      COUNT(*) as totalItens,
      COUNT(DISTINCT u.guia) as totalGuias,
      SUM(u.valorFaturado) as totalValorFaturado,
      SUM(u.valorPago) as totalValorPago,
      SUM(u.valorGlosa) as totalValorGlosa,
      SUM(CASE WHEN u.recursoStatus IN ('recurso_criado', 'recursado', 'recurso_enviado', 'recurso_deferido', 'recurso_indeferido') AND (u.glosaAceita IS NULL OR u.glosaAceita = 0) THEN COALESCE(u.valorRecurso, u.valorGlosa, 0) ELSE 0 END) as totalValorRecurso,
      SUM(CASE WHEN u.glosaAceita = 1 THEN COALESCE(u.valorGlosa, 0) ELSE 0 END) as totalValorAceite,
      SUM(CASE WHEN (u.recursoStatus IS NULL OR u.recursoStatus = 'sem_recurso') AND (u.glosaAceita IS NULL OR u.glosaAceita = 0) THEN COALESCE(u.valorGlosa, 0) ELSE 0 END) as totalValorNaoTrabalhado,
      SUM(CASE WHEN u.recursoStatus IN ('recurso_criado', 'recursado', 'recurso_enviado', 'recurso_deferido', 'recurso_indeferido') OR u.glosaAceita = 1 THEN 1 ELSE 0 END) as totalItensAnalisados
    FROM ${unionSubquery} u
  `;

  const [[items], [countResult], [resumoResult]] = await Promise.all([
    db.execute(sql.raw(query)),
    db.execute(sql.raw(countQuery)),
    db.execute(sql.raw(resumoQuery)),
  ]);
  const total = (countResult as any[])[0]?.total || 0;
  const resumoRow = (resumoResult as any[])[0] || {};
  const totalItens = Number(resumoRow.totalItens || 0);
  const totalItensAnalisados = Number(resumoRow.totalItensAnalisados || 0);
  const percentualAnalise = totalItens > 0 ? Math.round((totalItensAnalisados / totalItens) * 10000) / 100 : 0;
  return {
    items: items as any[],
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.ceil(Number(total) / pageSize),
    resumo: {
      totalItens,
      totalGuias: Number(resumoRow.totalGuias || 0),
      totalValorFaturado: Number(resumoRow.totalValorFaturado || 0),
      totalValorPago: Number(resumoRow.totalValorPago || 0),
      totalValorGlosa: Number(resumoRow.totalValorGlosa || 0),
      totalValorRecurso: Number(resumoRow.totalValorRecurso || 0),
      totalValorAceite: Number(resumoRow.totalValorAceite || 0),
      totalValorNaoTrabalhado: Number(resumoRow.totalValorNaoTrabalhado || 0),
      totalItensAnalisados,
      percentualAnalise,
    },
  };
}

/**
 * Detalhe dos itens glosados de uma guia no demonstrativo (UNION)
 */
export async function itensGlosadosDetalheGuiaDemonstrativo(params: {
  estabelecimentoId: number;
  guia: string;
  competencia?: string;
  convenioId?: number;
  dataPagto?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, guia, competencia, convenioId, dataPagto } = params;

  // Query from demonstrativo table
  let whereDemo = `WHERE d.estabelecimentoId = ${estabelecimentoId} AND d.numero_guia = '${guia.replace(/'/g, "''")}' AND d.valor_glosa > 0`;
  if (competencia) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereDemo += ` AND d.convenio_id = ${convenioId}`;
  if (dataPagto) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  // Query from recebimentos_excel table
  let whereExcel = `WHERE re.estabelecimentoId = ${estabelecimentoId} AND re.numero_guia = '${guia.replace(/'/g, "''")}' AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))`;
  if (competencia) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereExcel += ` AND re.convenioId = ${convenioId}`;
  if (dataPagto) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM (
      SELECT 
        d.id, 'demo' as fonte,
        d.numero_guia as guia,
        d.codigo_item as codigo,
        d.descricao_item as descricao,
        d.tipo_lancamento as tipo,
        d.nome_beneficiario as paciente,
        DATE_FORMAT(d.data_execucao, '%Y-%m-%d') as dataExecucao,
        d.quantidade as qtde,
        COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0) as valorFaturado,
        COALESCE(d.valor_pago, 0) as valorPago,
        COALESCE(d.valor_glosa, 0) as valorGlosa,
        COALESCE(d.codigo_glosa, CASE WHEN d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN d.erro_tiss IS NOT NULL AND d.erro_tiss != '' THEN SUBSTRING_INDEX(d.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        d.justificativa_recurso as justificativa,
        COALESCE(d.valor_recurso, d.valor_glosa, 0) as valorRecurso,
        COALESCE(d.glosa_aceita, 0) as glosaAceita,
        d.glosa_aceita_por as glosaAceitaPor
      FROM demonstrativo d
      LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN d.codigo_glosa IS NULL AND d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereDemo}
      UNION ALL
      SELECT 
        re.id, 'excel' as fonte,
        re.numero_guia as guia,
        re.item as codigo,
        re.item_desc as descricao,
        re.tipo_lancamento as tipo,
        re.nome_beneficiario as paciente,
        DATE_FORMAT(re.data_execucao, '%Y-%m-%d') as dataExecucao,
        re.quantidade as qtde,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) + re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE COALESCE(re.valor_informado, re.valor_pagamento, 0) END as valorFaturado,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN 0 ELSE COALESCE(re.valor_pagamento, 0) END as valorPago,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE 0 END as valorGlosa,
        COALESCE(re.codigo_glosa, CASE WHEN re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN re.erro_tiss IS NOT NULL AND re.erro_tiss != '' THEN SUBSTRING_INDEX(re.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        re.justificativa_recurso as justificativa,
        COALESCE(re.valor_recurso, re.valor_glosa, re.valor_pagamento, 0) as valorRecurso,
        re.glosa_aceita as glosaAceita,
        re.glosa_aceita_por as glosaAceitaPor
      FROM recebimentos_excel re
      LEFT JOIN motivosGlosa mg ON mg.codigo = re.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN re.codigo_glosa IS NULL AND re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereExcel}
      AND NOT EXISTS (
        SELECT 1 FROM demonstrativo d2
        WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
        AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
        AND d2.valor_glosa > 0
      )
    ) unified
    ORDER BY guia, dataExecucao
  `));
  return (rows as any[]).map((r: any) => ({
    ...r,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    valorRecurso: Number(r.valorRecurso),
    glosaAceita: Boolean(r.glosaAceita),
    dataExecucao: r.dataExecucao || null,
  }));
}
/**
 * Detalhe dos itens glosados por código de item no demonstrativo (UNION)
 */
export async function itensGlosadosDetalhePorItemDemonstrativo(params: {
  estabelecimentoId: number;
  item: string;
  competencia?: string;
  convenioId?: number;
  dataPagto?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, item: codigo, competencia, convenioId, dataPagto } = params;

  let whereDemo = `WHERE d.estabelecimentoId = ${estabelecimentoId} AND d.codigo_item = '${codigo.replace(/'/g, "''")}' AND d.valor_glosa > 0`;
  if (competencia) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereDemo += ` AND d.convenio_id = ${convenioId}`;
  if (dataPagto) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  let whereExcel = `WHERE re.estabelecimentoId = ${estabelecimentoId} AND re.item = '${codigo.replace(/'/g, "''")}' AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))`;
  if (competencia) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereExcel += ` AND re.convenioId = ${convenioId}`;
  if (dataPagto) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM (
      SELECT 
        d.id, 'demo' as fonte,
        d.numero_guia as guia,
        d.codigo_item as codigo,
        d.descricao_item as descricao,
        d.tipo_lancamento as tipo,
        d.nome_beneficiario as paciente,
        DATE_FORMAT(d.data_execucao, '%Y-%m-%d') as dataExecucao,
        d.quantidade as qtde,
        COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0) as valorFaturado,
        COALESCE(d.valor_pago, 0) as valorPago,
        COALESCE(d.valor_glosa, 0) as valorGlosa,
        COALESCE(d.codigo_glosa, CASE WHEN d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN d.erro_tiss IS NOT NULL AND d.erro_tiss != '' THEN SUBSTRING_INDEX(d.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        d.justificativa_recurso as justificativa,
        COALESCE(d.valor_recurso, d.valor_glosa, 0) as valorRecurso,
        COALESCE(d.glosa_aceita, 0) as glosaAceita,
        d.glosa_aceita_por as glosaAceitaPor
      FROM demonstrativo d
      LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN d.codigo_glosa IS NULL AND d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereDemo}
      ${whereDemo}
      UNION ALL
      SELECT 
        re.id, 'excel' as fonte,
        re.numero_guia as guia,
        re.item as codigo,
        re.item_desc as descricao,
        re.tipo_lancamento as tipo,
        re.nome_beneficiario as paciente,
        DATE_FORMAT(re.data_execucao, '%Y-%m-%d') as dataExecucao,
        re.quantidade as qtde,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) + re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE COALESCE(re.valor_informado, re.valor_pagamento, 0) END as valorFaturado,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN 0 ELSE COALESCE(re.valor_pagamento, 0) END as valorPago,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE 0 END as valorGlosa,
        COALESCE(re.codigo_glosa, CASE WHEN re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN re.erro_tiss IS NOT NULL AND re.erro_tiss != '' THEN SUBSTRING_INDEX(re.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        re.justificativa_recurso as justificativa,
        COALESCE(re.valor_recurso, re.valor_glosa, re.valor_pagamento, 0) as valorRecurso,
        re.glosa_aceita as glosaAceita,
        re.glosa_aceita_por as glosaAceitaPor
      FROM recebimentos_excel re
      LEFT JOIN motivosGlosa mg ON mg.codigo = re.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN re.codigo_glosa IS NULL AND re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereExcel}
      ${whereExcel}
      AND NOT EXISTS (
        SELECT 1 FROM demonstrativo d2
        WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
        AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
        AND d2.valor_glosa > 0
      )
    ) unified
    ORDER BY guia, dataExecucao
  `));
  return (rows as any[]).map((r: any) => ({
    ...r,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    valorRecurso: Number(r.valorRecurso),
    glosaAceita: Boolean(r.glosaAceita),
    dataExecucao: r.dataExecucao || null,
  }));
}
/**
 * Detalhe dos itens glosados por motivo no demonstrativo (UNION)
 */
export async function itensGlosadosDetalhePorMotivoDemonstrativo(params: {
  estabelecimentoId: number;
  codigoGlosa: string;
  competencia?: string;
  convenioId?: number;
  dataPagto?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, codigoGlosa, competencia, convenioId, dataPagto } = params;

  const codigoFilterDemo = codigoGlosa === 'SEM_CODIGO' ? `AND d.codigo_glosa IS NULL` : `AND d.codigo_glosa = '${codigoGlosa.replace(/'/g, "''")}'`;
  const codigoFilterExcel = codigoGlosa === 'SEM_CODIGO' ? `AND re.codigo_glosa IS NULL` : `AND re.codigo_glosa = '${codigoGlosa.replace(/'/g, "''")}'`;

  let whereDemo = `WHERE d.estabelecimentoId = ${estabelecimentoId} ${codigoFilterDemo} AND d.valor_glosa > 0`;
  if (competencia) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereDemo += ` AND d.convenio_id = ${convenioId}`;
  if (dataPagto) whereDemo += ` AND DATE_FORMAT(d.data_pagamento, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  let whereExcel = `WHERE re.estabelecimentoId = ${estabelecimentoId} ${codigoFilterExcel} AND (re.valor_glosa > 0 OR (re.situacao_item = 'GLOSADO' AND COALESCE(re.valor_pagamento, 0) > 0))`;
  if (competencia) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereExcel += ` AND re.convenioId = ${convenioId}`;
  if (dataPagto) whereExcel += ` AND DATE_FORMAT(re.data_pagto, '%Y-%m-%d') = '${dataPagto.replace(/'/g, "''")}'`;

  const [rows] = await db.execute(sql.raw(`
    SELECT * FROM (
      SELECT 
        d.id, 'demo' as fonte,
        d.numero_guia as guia,
        d.codigo_item as codigo,
        d.descricao_item as descricao,
        d.tipo_lancamento as tipo,
        d.nome_beneficiario as paciente,
        DATE_FORMAT(d.data_execucao, '%Y-%m-%d') as dataExecucao,
        d.quantidade as qtde,
        COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0) as valorFaturado,
        COALESCE(d.valor_pago, 0) as valorPago,
        COALESCE(d.valor_glosa, 0) as valorGlosa,
        COALESCE(d.codigo_glosa, CASE WHEN d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN d.erro_tiss IS NOT NULL AND d.erro_tiss != '' THEN SUBSTRING_INDEX(d.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        d.justificativa_recurso as justificativa,
        COALESCE(d.valor_recurso, d.valor_glosa, 0) as valorRecurso,
        COALESCE(d.glosa_aceita, 0) as glosaAceita,
        d.glosa_aceita_por as glosaAceitaPor
      FROM demonstrativo d
      LEFT JOIN motivosGlosa mg ON mg.codigo = d.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN d.codigo_glosa IS NULL AND d.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(d.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereDemo}
      ${whereDemo}
      UNION ALL
      SELECT 
        re.id, 'excel' as fonte,
        re.numero_guia as guia,
        re.item as codigo,
        re.item_desc as descricao,
        re.tipo_lancamento as tipo,
        re.nome_beneficiario as paciente,
        DATE_FORMAT(re.data_execucao, '%Y-%m-%d') as dataExecucao,
        re.quantidade as qtde,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) + re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE COALESCE(re.valor_informado, re.valor_pagamento, 0) END as valorFaturado,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN COALESCE(re.valor_pagamento,0) WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN 0 ELSE COALESCE(re.valor_pagamento, 0) END as valorPago,
        CASE WHEN re.valor_glosa IS NOT NULL AND re.valor_glosa > 0 THEN re.valor_glosa WHEN re.situacao_item = 'GLOSADO' AND (re.valor_glosa IS NULL OR re.valor_glosa = 0) THEN COALESCE(re.valor_pagamento,0) ELSE 0 END as valorGlosa,
        COALESCE(re.codigo_glosa, CASE WHEN re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END) as codigoGlosa,
        COALESCE(mg.descricao, mg2.descricao, CASE WHEN re.erro_tiss IS NOT NULL AND re.erro_tiss != '' THEN SUBSTRING_INDEX(re.erro_tiss, '-', -1) ELSE 'Não informado' END) as motivoGlosa,
        re.justificativa_recurso as justificativa,
        COALESCE(re.valor_recurso, re.valor_glosa, re.valor_pagamento, 0) as valorRecurso,
        re.glosa_aceita as glosaAceita,
        re.glosa_aceita_por as glosaAceitaPor
      FROM recebimentos_excel re
      LEFT JOIN motivosGlosa mg ON mg.codigo = re.codigo_glosa
      LEFT JOIN motivosGlosa mg2 ON mg2.codigo = CASE WHEN re.codigo_glosa IS NULL AND re.erro_tiss REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(re.erro_tiss, '^[0-9]+') AS CHAR) ELSE NULL END
      ${whereExcel}
      ${whereExcel}
      AND NOT EXISTS (
        SELECT 1 FROM demonstrativo d2
        WHERE d2.numero_guia = re.numero_guia AND d2.codigo_item = re.item
        AND d2.estabelecimentoId = re.estabelecimentoId AND d2.convenio_id = re.convenioId
        AND d2.valor_glosa > 0
      )
    ) unified
    ORDER BY guia, dataExecucao
  `));
  return (rows as any[]).map((r: any) => ({
    ...r,
    valorFaturado: Number(r.valorFaturado),
    valorPago: Number(r.valorPago),
    valorGlosa: Number(r.valorGlosa),
    valorRecurso: Number(r.valorRecurso),
    glosaAceita: Boolean(r.glosaAceita),
    dataExecucao: r.dataExecucao || null,
  }));
}
/**
 * Salvar justificativa de recurso no demonstrativo
 */
export async function salvarJustificativaDemonstrativo(recebimentoId: number, justificativa: string, fonte?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const tabela = fonte === 'demo' ? 'demonstrativo' : 'recebimentos_excel';
  await db.execute(sql.raw(
    `UPDATE ${tabela} SET justificativa_recurso = '${justificativa.replace(/'/g, "''")}', status_recurso_item = 'recursado' WHERE id = ${recebimentoId}`
  ));
  return { success: true };
}

/**
 * Salvar valor recurso no demonstrativo
 */
export async function salvarValorRecursoDemonstrativo(recebimentoId: number, valor: number, fonte?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const tabela = fonte === 'demo' ? 'demonstrativo' : 'recebimentos_excel';
  await db.execute(sql.raw(
    `UPDATE ${tabela} SET valor_recurso = ${valor} WHERE id = ${recebimentoId}`
  ));
  return { success: true };
}

/**
 * Marcar glosa aceita no demonstrativo
 */
export async function marcarGlosaAceitaDemonstrativo(recebimentoId: number, aceita: boolean, usuario: string, fonte?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const tabela = fonte === 'demo' ? 'demonstrativo' : 'recebimentos_excel';
  if (aceita) {
    await db.execute(sql.raw(
      `UPDATE ${tabela} SET glosa_aceita = 1, glosa_aceita_por = '${usuario.replace(/'/g, "''")}', glosa_aceita_em = NOW(), valor_recurso = 0, status_recurso_item = 'aceita' WHERE id = ${recebimentoId}`
    ));
  } else {
    await db.execute(sql.raw(
      `UPDATE ${tabela} SET glosa_aceita = 0, glosa_aceita_por = NULL, glosa_aceita_em = NULL, valor_recurso = valor_glosa, status_recurso_item = 'pendente' WHERE id = ${recebimentoId}`
    ));
  }
  return { success: true };
}

/**
 * Marcar glosa aceita em lote no demonstrativo
 */
export async function marcarGlosaAceitaEmLoteDemonstrativo(items: Array<{id: number; fonte: string}>, aceita: boolean, usuario: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  if (items.length === 0) return { success: true, affected: 0 };
  
  const demoIds = items.filter(i => i.fonte === 'demo').map(i => i.id);
  const excelIds = items.filter(i => i.fonte !== 'demo').map(i => i.id);
  
  if (aceita) {
    if (demoIds.length > 0) {
      await db.execute(sql.raw(
        `UPDATE demonstrativo SET glosa_aceita = 1, glosa_aceita_por = '${usuario.replace(/'/g, "''")}', glosa_aceita_em = NOW(), valor_recurso = 0, recurso_status = 'sem_recurso' WHERE id IN (${demoIds.join(',')})`
      ));
    }
    if (excelIds.length > 0) {
      await db.execute(sql.raw(
        `UPDATE recebimentos_excel SET glosa_aceita = 1, glosa_aceita_por = '${usuario.replace(/'/g, "''")}', glosa_aceita_em = NOW(), valor_recurso = 0, status_recurso_item = 'aceita' WHERE id IN (${excelIds.join(',')})`
      ));
    }
  } else {
    if (demoIds.length > 0) {
      await db.execute(sql.raw(
        `UPDATE demonstrativo SET glosa_aceita = 0, glosa_aceita_por = NULL, glosa_aceita_em = NULL, valor_recurso = valor_glosa, recurso_status = 'sem_recurso' WHERE id IN (${demoIds.join(',')})`
      ));
    }
    if (excelIds.length > 0) {
      await db.execute(sql.raw(
        `UPDATE recebimentos_excel SET glosa_aceita = 0, glosa_aceita_por = NULL, glosa_aceita_em = NULL, valor_recurso = valor_glosa, status_recurso_item = 'pendente' WHERE id IN (${excelIds.join(',')})`
      ));
    }
  }
  return { success: true, affected: items.length };
}

/**
 * Replicar justificativas no demonstrativo (por item ou motivo)
 */
export async function replicarJustificativasDemonstrativo(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  item?: string;
  codigoGlosa?: string;
  justificativa: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, competencia, convenioId, item, codigoGlosa, justificativa } = params;
  const escapedJust = justificativa.replace(/'/g, "''");
  let totalAffected = 0;

  // Update demonstrativo
  let whereDemo = `WHERE estabelecimentoId = ${estabelecimentoId} AND valor_glosa > 0`;
  if (competencia) whereDemo += ` AND DATE_FORMAT(data_pagamento, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereDemo += ` AND convenio_id = ${convenioId}`;
  if (item) whereDemo += ` AND codigo_item = '${item.replace(/'/g, "''")}'`;
  if (codigoGlosa) {
    if (codigoGlosa === 'SEM_CODIGO') whereDemo += ` AND codigo_glosa IS NULL`;
    else whereDemo += ` AND codigo_glosa = '${codigoGlosa.replace(/'/g, "''")}'`;
  }
  const [resultDemo] = await db.execute(sql.raw(
    `UPDATE demonstrativo SET justificativa_recurso = '${escapedJust}', recurso_status = 'recurso_criado' ${whereDemo}`
  ));
  totalAffected += (resultDemo as any).affectedRows || 0;

  // Update recebimentos_excel
  let whereExcel = `WHERE estabelecimentoId = ${estabelecimentoId} AND (valor_glosa > 0 OR situacao_item = 'GLOSADO')`;
  if (competencia) whereExcel += ` AND DATE_FORMAT(data_referencia, '%Y-%m') = '${competencia.replace(/'/g, "''")}'`;
  if (convenioId) whereExcel += ` AND convenioId = ${convenioId}`;
  if (item) whereExcel += ` AND item = '${item.replace(/'/g, "''")}'`;
  if (codigoGlosa) {
    if (codigoGlosa === 'SEM_CODIGO') whereExcel += ` AND codigo_glosa IS NULL`;
    else whereExcel += ` AND codigo_glosa = '${codigoGlosa.replace(/'/g, "''")}'`;
  }
  const [resultExcel] = await db.execute(sql.raw(
    `UPDATE recebimentos_excel SET justificativa_recurso = '${escapedJust}', status_recurso_item = 'recursado' ${whereExcel}`
  ));
  totalAffected += (resultExcel as any).affectedRows || 0;

  return { success: true, affected: totalAffected };
}

/**
 * Gerar justificativas com IA para o demonstrativo
 */
export async function gerarJustificativasIADemonstrativo(params: {
  estabelecimentoId: number;
  recebimentoIds: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { recebimentoIds } = params;
  if (recebimentoIds.length === 0) return { justificativas: [] };
  
  const ids = recebimentoIds.join(',');
  const [rows] = await db.execute(sql.raw(`
    SELECT re.id, re.item, re.item_desc, re.codigo_glosa, mg.descricao as motivoGlosa, re.valor_glosa
    FROM recebimentos_excel re
    LEFT JOIN motivosGlosa mg ON mg.codigo = re.codigo_glosa
    WHERE re.id IN (${ids})
  `));
  
  const items = rows as any[];
  
  // Usar LLM para gerar justificativas
  const { invokeLLM } = await import("./_core/llm");
  
  const prompt = items.map((item: any) => 
    `Item: ${item.item} - ${item.item_desc || 'Sem descrição'}, Motivo Glosa: ${item.motivoGlosa || item.codigo_glosa || 'Não informado'}, Valor: R$ ${Number(item.valor_glosa).toFixed(2)}`
  ).join('\n');
  
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "Você é um especialista em faturamento hospitalar e recursos de glosa. Gere justificativas técnicas e profissionais para cada item glosado. Responda em JSON com array de objetos {id, justificativa}. Cada justificativa deve ter no máximo 150 caracteres e ser específica ao motivo da glosa." },
      { role: "user", content: `Gere justificativas de recurso para os seguintes itens glosados:\n${prompt}\n\nIDs: ${items.map((i: any) => i.id).join(',')}` }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "justificativas",
        strict: true,
        schema: {
          type: "object",
          properties: {
            justificativas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  justificativa: { type: "string" }
                },
                required: ["id", "justificativa"],
                additionalProperties: false
              }
            }
          },
          required: ["justificativas"],
          additionalProperties: false
        }
      }
    }
  });
  
  const content = response.choices?.[0]?.message?.content;
  if (!content) return { justificativas: [] };
  
  const parsed = JSON.parse(content);
  
  // Salvar as justificativas no banco
  for (const j of parsed.justificativas) {
    await db.execute(sql.raw(
      `UPDATE recebimentos_excel SET justificativa_recurso = '${String(j.justificativa).replace(/'/g, "''")}', status_recurso_item = 'recursado' WHERE id = ${j.id}`
    ));
  }
  
  return parsed;
}
