/**
 * Service para popular e manter a tabela faturamento_unificado
 * Unifica dados de duas fontes:
 * - TASY (tabela faturadoTasy): dados do sistema hospitalar Tasy
 * - XML_TISS (tabela faturamento_tiss): dados dos XMLs enviados aos convênios
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ============================================================
// POPULAÇÃO A PARTIR DO TASY (faturadoTasy)
// ============================================================

/**
 * Popula faturamento_unificado a partir dos dados do faturadoTasy
 * para um estabelecimento e competência específicos.
 * Usa INSERT IGNORE para evitar duplicatas.
 */
export async function popularDeTasy(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ inseridos: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // Limpar registros TASY existentes para o estabelecimento/competência
  let deleteQuery = `DELETE FROM faturamento_unificado WHERE origemSistema = 'TASY' AND estabelecimentoId = ?`;
  const deleteParams: any[] = [estabelecimentoId];
  if (competencia) {
    deleteQuery += ` AND competencia LIKE ?`;
    deleteParams.push(`${competencia}%`);
  }
  await db.execute(sql.raw(deleteQuery.replace(/\?/g, () => {
    const val = deleteParams.shift();
    return typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : String(val);
  })));

  // Inserir dados do faturadoTasy
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
    WHERE ft.estabelecimentoId = ${estabelecimentoId}
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

  // Limpar registros XML_TISS existentes para o estabelecimento
  let deleteQuery = `DELETE FROM faturamento_unificado WHERE origemSistema = 'XML_TISS' AND estabelecimentoId = ?`;
  const deleteParams: any[] = [estabelecimentoId];
  if (dataReferencia) {
    deleteQuery += ` AND competencia LIKE ?`;
    deleteParams.push(`${dataReferencia}%`);
  }
  await db.execute(sql.raw(deleteQuery.replace(/\?/g, () => {
    const val = deleteParams.shift();
    return typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : String(val);
  })));

  // Inserir dados do faturamento_tiss
  let insertQuery = `
    INSERT INTO faturamento_unificado (
      origemSistema, origemId, estabelecimentoId,
      numeroGuia, numeroGuiaOperadora, senha,
      lotePrestador, carteiraBeneficiario,
      convenioId, competencia,
      profissionalExecutante,
      tipoItem, codigoItem,
      descricaoItem, dataExecucao, quantidade,
      valorUnitario, valorFaturado,
      dataSincronizacao
    )
    SELECT
      'XML_TISS',
      CAST(ft.id AS CHAR),
      ft.estabelecimentoId,
      ft.numero_guia_prestador,
      ft.numero_guia_operadora,
      ft.senha,
      ft.numero_lote,
      ft.carteira_beneficiario,
      ft.convenioId,
      DATE_FORMAT(ft.data_referencia, '%Y-%m'),
      ft.nome_prof,
      ft.tipo_item,
      ft.codigo_item,
      ft.descricao_item,
      ft.data_execucao,
      ft.quantidade,
      ft.valor_unitario,
      ft.valor_faturado,
      NOW()
    FROM faturamento_tiss ft
    WHERE ft.estabelecimentoId = ${estabelecimentoId}
  `;

  if (dataReferencia) {
    insertQuery += ` AND DATE_FORMAT(ft.data_referencia, '%Y-%m') = '${dataReferencia.replace(/'/g, "''")}'`;
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
 * Popula faturamento_unificado a partir de ambas as fontes
 * para um estabelecimento e competência específicos.
 */
export async function popularFaturamentoUnificado(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ tasy: { inseridos: number; total: number }; xmlTiss: { inseridos: number; total: number }; totalGeral: number }> {
  const tasy = await popularDeTasy(estabelecimentoId, competencia);
  const xmlTiss = await popularDeXmlTiss(estabelecimentoId, competencia);

  return {
    tasy,
    xmlTiss,
    totalGeral: tasy.total + xmlTiss.total,
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
      SUM(CASE WHEN fu.statusConciliacao = 'nao_recebido' THEN 1 ELSE 0 END) as totalNaoRecebidos
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
      SUM(CASE WHEN fu.statusConciliacao = 'nao_recebido' THEN 1 ELSE 0 END) as itensNaoRecebidos
    FROM faturamento_unificado fu
    ${whereClause}
  `;

  const [rows] = await db.execute(sql.raw(query));
  const [countRows] = await db.execute(sql.raw(countQuery));
  const [resumoRows] = await db.execute(sql.raw(resumoQuery));

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
    SELECT DISTINCT
      fu.competencia,
      fu.origemSistema,
      COUNT(*) as total
    FROM faturamento_unificado fu
    WHERE fu.estabelecimentoId = ${estabelecimentoId}
      AND fu.competencia IS NOT NULL
    GROUP BY fu.competencia, fu.origemSistema
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
