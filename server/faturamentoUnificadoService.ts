/**
 * Service para popular e manter a tabela faturamento_unificado
 * Unifica dados de duas fontes:
 * - WARLEINE (tabela integ_faturado): dados do faturamento do hospital via banco Warleine
 * - XML_TISS (tabela faturamento_tiss): dados dos XMLs enviados aos convênios
 */

import { getDb } from "./db";
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

  // Limpar registros WARLEINE existentes para o estabelecimento/competência
  let deleteQuery = `DELETE FROM faturamento_unificado WHERE origemSistema = 'WARLEINE' AND estabelecimentoId = ${estabelecimentoId}`;
  if (competencia) {
    deleteQuery += ` AND competencia LIKE '${competencia.replace(/'/g, "''")}%'`;
  }
  await db.execute(sql.raw(deleteQuery));

  // Inserir dados do integ_faturado
  let insertQuery = `
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
    WHERE ig.estabelecimento_id = ${estabelecimentoId}
  `;

  if (competencia) {
    // competencia vem como 2025-01, integ_faturado armazena como 2025/01
    const compWarleine = competencia.replace('-', '/');
    insertQuery += ` AND ig.mesprod LIKE '${compWarleine.replace(/'/g, "''")}%'`;
  }

  await db.execute(sql.raw(insertQuery));

  // Contar registros inseridos
  const countQuery = `
    SELECT COUNT(*) as total FROM faturamento_unificado 
    WHERE origemSistema = 'WARLEINE' AND estabelecimentoId = ${estabelecimentoId}
    ${competencia ? `AND competencia LIKE '${competencia.replace(/'/g, "''")}%'` : ''}
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
 * Popula faturamento_unificado a partir de ambas as fontes:
 * - WARLEINE (integ_faturado): dados do faturamento do hospital
 * - XML_TISS (faturamento_tiss): dados dos XMLs enviados aos convênios
 */
export async function popularFaturamentoUnificado(
  estabelecimentoId: number,
  competencia?: string
): Promise<{ warleine: { inseridos: number; total: number }; xmlTiss: { inseridos: number; total: number }; totalGeral: number }> {
  const warleine = await popularDeIntegFaturado(estabelecimentoId, competencia);
  const xmlTiss = await popularDeXmlTiss(estabelecimentoId, competencia);

  return {
    warleine,
    xmlTiss,
    totalGeral: warleine.total + xmlTiss.total,
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


// ============================================================
// CONCILIAÇÃO AUTOMÁTICA
// ============================================================

interface ConciliacaoResultado {
  totalProcessados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalNaoRecebidos: number;
  totalJaConciliados: number;
  detalhes: {
    conciliadosPorGuiaCodigo: number;
    conciliadosPorGuiaCodigoTuss: number;
    conciliadosPorVinculacao: number;
    conciliadosPorPacienteCodigo: number;
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

  const tolerancia = params.toleranciaPercentual ?? 1; // 1% de tolerância por padrão

  const resultado: ConciliacaoResultado = {
    totalProcessados: 0,
    totalConciliados: 0,
    totalDivergentes: 0,
    totalNaoRecebidos: 0,
    totalJaConciliados: 0,
    detalhes: {
      conciliadosPorGuiaCodigo: 0,
      conciliadosPorGuiaCodigoTuss: 0,
      conciliadosPorVinculacao: 0,
      conciliadosPorPacienteCodigo: 0,
    },
    divergencias: [],
  };

  // -------------------------------------------------------
  // PASSO 1: Buscar itens pendentes do faturamento_unificado
  // -------------------------------------------------------
  let whereFat = `WHERE fu.estabelecimentoId = ${params.estabelecimentoId} AND fu.statusConciliacao = 'pendente'`;
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
  // PASSO 2: Buscar recebimentos_excel do mesmo estabelecimento/competência
  // -------------------------------------------------------
  let whereRec = `WHERE re.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereRec += ` AND re.data_referencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereRec += ` AND re.convenioId = ${params.convenioId}`;
  }

  const queryRecebimentos = `
    SELECT 
      re.id, re.numero_guia as numeroGuia, re.item as codigoItem,
      re.nome_beneficiario as nomeBeneficiario, re.beneficiario as carteira,
      COALESCE(re.valor_pagamento, 0) as valorPago,
      COALESCE(re.valor_glosa, 0) as valorGlosa,
      re.situacao_item as situacao,
      COALESCE(re.quantidade, 0) as quantidade
    FROM recebimentos_excel re
    ${whereRec}
    ORDER BY re.id
  `;

  const [recRows] = await db.execute(sql.raw(queryRecebimentos));
  const itensRecebimento = recRows as unknown as any[];

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
  }

  // -------------------------------------------------------
  // PASSO 5: Executar matching para cada item de faturamento
  // -------------------------------------------------------
  const updates: Array<{ id: number; status: string; recebimentoId: number | null; recebimentoOrigem: string | null }> = [];

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

    if (matchEncontrado && recMatch) {
      recebimentosUsados.add(recMatch.id);
      const valorRecebido = Number(recMatch.valorPago) || 0;
      const diferenca = Math.abs(valorFaturado - valorRecebido);
      const percentualDiferenca = valorFaturado > 0 ? (diferenca / valorFaturado) * 100 : (valorRecebido > 0 ? 100 : 0);

      if (percentualDiferenca <= tolerancia) {
        // Conciliado: valores compatíveis
        updates.push({ id: fat.id, status: 'conciliado', recebimentoId: recMatch.id, recebimentoOrigem: 'excel' });
        resultado.totalConciliados++;
      } else {
        // Divergente: valores diferentes
        updates.push({ id: fat.id, status: 'divergente', recebimentoId: recMatch.id, recebimentoOrigem: 'excel' });
        resultado.totalDivergentes++;
        resultado.divergencias.push({
          faturamentoId: fat.id,
          recebimentoId: recMatch.id,
          codigoItem: codigoItem,
          numeroGuia: guia,
          valorFaturado,
          valorRecebido,
          diferenca: valorFaturado - valorRecebido,
        });
      }

      // Contabilizar por método
      switch (metodo) {
        case 'guia_codigo': resultado.detalhes.conciliadosPorGuiaCodigo++; break;
        case 'guia_codigo_tuss': resultado.detalhes.conciliadosPorGuiaCodigoTuss++; break;
        case 'vinculacao': resultado.detalhes.conciliadosPorVinculacao++; break;
        case 'paciente_codigo': resultado.detalhes.conciliadosPorPacienteCodigo++; break;
      }
    } else {
      // Não encontrou match: não recebido
      updates.push({ id: fat.id, status: 'nao_recebido', recebimentoId: null, recebimentoOrigem: null });
      resultado.totalNaoRecebidos++;
    }
  }

  // -------------------------------------------------------
  // PASSO 6: Aplicar atualizações em batch
  // -------------------------------------------------------
  const BATCH_SIZE = 200;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // Agrupar por status para fazer updates em massa
    const porStatus = new Map<string, typeof batch>();
    for (const u of batch) {
      const key = `${u.status}|${u.recebimentoId ?? 'null'}|${u.recebimentoOrigem ?? 'null'}`;
      if (!porStatus.has(key)) porStatus.set(key, []);
      porStatus.get(key)!.push(u);
    }

    // Para cada grupo, fazer um UPDATE com IN (ids)
    for (const [, items] of porStatus) {
      const ids = items.map(u => u.id).join(',');
      const first = items[0];
      let setClause = `statusConciliacao = '${first.status}', atualizadoEm = NOW()`;
      if (first.recebimentoId !== null) {
        setClause += `, recebimentoVinculadoId = ${first.recebimentoId}`;
        setClause += `, recebimentoOrigem = '${first.recebimentoOrigem}'`;
      }
      const updateQuery = `UPDATE faturamento_unificado SET ${setClause} WHERE id IN (${ids})`;
      await db.execute(sql.raw(updateQuery));
    }
  }

  return resultado;
}

/**
 * Reseta a conciliação de itens, voltando para status 'pendente'
 */
export async function resetarConciliacao(params: {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
}): Promise<{ resetados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  let whereClause = `WHERE estabelecimentoId = ${params.estabelecimentoId} AND statusConciliacao != 'pendente'`;
  if (params.competencia) {
    whereClause += ` AND competencia LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }
  if (params.convenioId) {
    whereClause += ` AND convenioId = ${params.convenioId}`;
  }

  // Contar antes
  const [countRows] = await db.execute(sql.raw(
    `SELECT COUNT(*) as total FROM faturamento_unificado ${whereClause}`
  ));
  const total = Number((countRows as any)?.[0]?.total || 0);

  // Resetar
  const query = `
    UPDATE faturamento_unificado 
    SET statusConciliacao = 'pendente', 
        recebimentoVinculadoId = NULL, 
        recebimentoOrigem = NULL,
        atualizadoEm = NOW()
    ${whereClause}
  `;
  await db.execute(sql.raw(query));

  return { resetados: total };
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
