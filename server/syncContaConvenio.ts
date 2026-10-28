import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { estrutura0142Completa } from "./schema0142Capabilities";

export type SyncContaConvenioParams = {
  estabelecimentoId: number;
  arquivoId?: number;
  /** Snapshots hospitalares promovidos juntos pelo worker do lote. */
  arquivoIds?: readonly number[];
  /** Ativa exclusivamente o caminho durável pós-0142. */
  loteImportacaoId?: number | null;
  /** Fencing token interno; jamais vem do navegador. */
  loteClaim?: { id: number; claimToken: string };
};

/**
 * Sincroniza os XMLs de envio já normalizados em faturamento_tiss com as
 * tabelas operacionais da tela Conta Convênio.
 *
 * A rotina é idempotente: remove apenas os itens XML do escopo informado e
 * recompõe os respectivos resumos a partir da fonte faturamento_tiss.
 */
async function syncContaConvenioLegado(
  params: SyncContaConvenioParams
): Promise<{ success: boolean; totalItens: number; totalContas: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const { estabelecimentoId, arquivoId } = params;
  const preservarCoordenados = await estrutura0142Completa(db);
  const arquivoFiltro = arquivoId
    ? sql`AND ft.arquivo_id = ${arquivoId}`
    : sql``;
  const itemArquivoFiltro = arquivoId
    ? sql`AND arquivoId = ${arquivoId}`
    : sql``;
  // Antes da 0142, as colunas de lote não existem e esta condição fica vazia.
  // Depois dela, a sincronização histórica não remove nem reagrega snapshots
  // publicados pelo worker coordenado.
  const itemLegadoFiltro = preservarCoordenados
    ? sql`AND loteImportacaoId IS NULL`
    : sql``;
  const resumoLegadoFiltro = preservarCoordenados
    ? sql`AND loteImportacaoId IS NULL`
    : sql``;

  await db.execute(sql`
    DELETE FROM contas_convenio_itens
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
      ${itemArquivoFiltro}
      ${itemLegadoFiltro}
  `);

  await db.execute(sql`
    INSERT INTO contas_convenio_itens (
      origem, numeroConta, numeroGuia, numeroGuiaOperadora, numeroLote, senha,
      carteiraBeneficiario, convenio, convenioId, estabelecimentoId,
      tipoItem, codigoItem, descricaoItem, codigoTabela, quantidade,
      valorUnitario, valorTotal, dataExecucao, dataReferencia, competencia,
      profissionalExecutante, codigoPrestadorExecutante, arquivoId, statusAnalise
    )
    SELECT
      'XML',
      COALESCE(NULLIF(TRIM(ft.numero_guia_prestador), ''), NULLIF(TRIM(ft.numero_guia_operadora), ''), CONCAT('SEM_GUIA_', ft.arquivo_id)),
      NULLIF(TRIM(ft.numero_guia_prestador), ''),
      NULLIF(TRIM(ft.numero_guia_operadora), ''),
      NULLIF(TRIM(ft.numero_lote), ''),
      NULLIF(TRIM(ft.senha), ''),
      NULLIF(TRIM(ft.carteira_beneficiario), ''),
      c.nome,
      ft.convenioId,
      ft.estabelecimentoId,
      ft.tipo_item,
      ft.codigo_item,
      ft.descricao_item,
      ft.codigo_tabela,
      ft.quantidade,
      ft.valor_unitario,
      COALESCE(ft.valor_faturado, ft.valor_total_item, ft.valor_unitario * ft.quantidade, 0),
      ft.data_execucao,
      COALESCE(ft.data_referencia, a.dataReferencia),
      COALESCE(
        NULLIF(TRIM(ft.competencia), ''),
        DATE_FORMAT(COALESCE(ft.data_referencia, a.dataReferencia, ft.data_execucao), '%Y/%m')
      ),
      ft.nome_prof,
      ft.codigo_prestador_executante,
      ft.arquivo_id,
      'pendente'
    FROM faturamento_tiss ft
    LEFT JOIN convenios c ON c.id = ft.convenioId
    LEFT JOIN arquivos a ON a.id = ft.arquivo_id
    WHERE ft.estabelecimentoId = ${estabelecimentoId}
      ${arquivoFiltro}
  `);

  // O resumo é reconstruído por estabelecimento para preservar corretamente
  // contas presentes em mais de um XML/lote e evitar totais parciais.
  await db.execute(sql`
    DELETE FROM contas_convenio_resumo
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
      ${resumoLegadoFiltro}
  `);

  await db.execute(sql`
    INSERT INTO contas_convenio_resumo (
      numeroConta, numeroLote, estabelecimentoId, origem, convenio, convenioId,
      pacienteNome, carteiraBeneficiario, totalItens, valorTotal, competencia,
      statusAnaliseResumo, totalDivergencias, totalAlertas
    )
    SELECT
      numeroConta,
      MAX(numeroLote),
      estabelecimentoId,
      'XML',
      MAX(convenio),
      MAX(convenioId),
      MAX(pacienteNome),
      MAX(carteiraBeneficiario),
      COUNT(*),
      COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0),
      MAX(competencia),
      CASE
        WHEN SUM(statusAnalise = 'divergente') > 0 THEN 'divergente'
        WHEN SUM(statusAnalise = 'revisado') > 0 THEN 'revisado'
        WHEN SUM(statusAnalise = 'conforme') = COUNT(*) THEN 'conforme'
        ELSE 'pendente'
      END,
      SUM(statusAnalise = 'divergente'),
      SUM(statusAnalise = 'divergente')
    FROM contas_convenio_itens
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
      ${itemLegadoFiltro}
    GROUP BY numeroConta, estabelecimentoId
  `);

  const [totaisResult] = await db.execute(sql`
    SELECT
      COUNT(*) AS totalItens,
      COUNT(DISTINCT numeroConta) AS totalContas
    FROM contas_convenio_itens
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
      ${itemLegadoFiltro}
  `);
  const totais = (
    totaisResult as unknown as Array<{
      totalItens: number | string;
      totalContas: number | string;
    }>
  )[0];

  return {
    success: true,
    totalItens: Number(totais?.totalItens || 0),
    totalContas: Number(totais?.totalContas || 0),
  };
}

/**
 * Materializa os XMLs enviados em Conta Convênio por snapshot hospitalar.
 *
 * A chave do resumo XML é sempre `arquivo + guia + lote + competência`; nunca
 * agregamos a mesma guia de versões distintas do XML em um único resumo. A
 * substituição de itens e resumos ocorre em uma única transação: em erro, a
 * projeção anterior permanece íntegra. Registros Banco Cliente não participam.
 */
async function syncContaConvenioDoLote(
  params: SyncContaConvenioParams
): Promise<{ success: boolean; totalItens: number; totalContas: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const {
    estabelecimentoId,
    arquivoId,
    loteImportacaoId = null,
    loteClaim,
  } = params;
  const arquivoIds = [
    ...(params.arquivoIds ?? (arquivoId ? [arquivoId] : [])),
  ].filter(
    (id, index, all) =>
      Number.isSafeInteger(id) && id > 0 && all.indexOf(id) === index,
  );
  if (!arquivoIds.length) throw new Error("LOTE_SNAPSHOT_INVALIDO");
  const arquivosSql = sql.join(arquivoIds.map(id => sql`${id}`), sql`, `);
  const arquivoFiltro = sql`AND ft.arquivo_id IN (${arquivosSql})`;
  const itemArquivoFiltro = sql`AND arquivoId IN (${arquivosSql})`;
  const resumoArquivoFiltro = sql`AND arquivoHospitalId IN (${arquivosSql})`;

  return db.transaction(async tx => {
    if (loteClaim) {
      const lease = await tx.execute(sql`
        SELECT id FROM xml_importacao_lotes
        WHERE id = ${loteClaim.id}
          AND claim_token = ${loteClaim.claimToken}
          AND estado = 'processando'
          AND lease_expires_at > NOW()
        FOR UPDATE
      `);
      if (!Array.isArray(lease[0]) || lease[0].length === 0) {
        throw new Error("LOTE_LEASE_PERDIDO");
      }
    }
    // Nunca remove Banco Cliente, nem outro arquivo hospitalar.
    await tx.execute(sql`
      DELETE FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabelecimentoId}
        AND origem = 'XML'
        ${itemArquivoFiltro}
    `);

    await tx.execute(sql`
      INSERT INTO contas_convenio_itens (
        origem, numeroConta, numeroGuia, numeroGuiaOperadora, numeroLote, senha,
        carteiraBeneficiario, convenio, convenioId, estabelecimentoId,
        tipoItem, codigoItem, descricaoItem, codigoTabela, quantidade,
        valorUnitario, valorTotal, dataExecucao, dataReferencia, competencia,
        profissionalExecutante, codigoPrestadorExecutante, arquivoId, loteImportacaoId,
        statusAnalise
      )
      SELECT
        'XML',
        COALESCE(NULLIF(TRIM(ft.numero_guia_prestador), ''), NULLIF(TRIM(ft.numero_guia_operadora), ''), CONCAT('SEM_GUIA_', ft.arquivo_id)),
        NULLIF(TRIM(ft.numero_guia_prestador), ''),
        NULLIF(TRIM(ft.numero_guia_operadora), ''),
        NULLIF(TRIM(ft.numero_lote), ''),
        NULLIF(TRIM(ft.senha), ''),
        NULLIF(TRIM(ft.carteira_beneficiario), ''),
        c.nome,
        ft.convenioId,
        ft.estabelecimentoId,
        ft.tipo_item,
        ft.codigo_item,
        ft.descricao_item,
        ft.codigo_tabela,
        ft.quantidade,
        ft.valor_unitario,
        COALESCE(ft.valor_faturado, ft.valor_total_item, ft.valor_unitario * ft.quantidade, 0),
        ft.data_execucao,
        COALESCE(ft.data_referencia, a.dataReferencia),
        COALESCE(NULLIF(TRIM(ft.competencia), ''), DATE_FORMAT(COALESCE(ft.data_referencia, a.dataReferencia, ft.data_execucao), '%Y/%m')),
        ft.nome_prof,
        ft.codigo_prestador_executante,
        ft.arquivo_id,
        ${loteImportacaoId},
        'pendente'
      FROM faturamento_tiss ft
      LEFT JOIN convenios c ON c.id = ft.convenioId
      LEFT JOIN arquivos a ON a.id = ft.arquivo_id
      WHERE ft.estabelecimentoId = ${estabelecimentoId}
        ${arquivoFiltro}
    `);

    await tx.execute(sql`
      DELETE FROM contas_convenio_resumo
      WHERE estabelecimentoId = ${estabelecimentoId}
        AND origem = 'XML'
        ${resumoArquivoFiltro}
    `);

    await tx.execute(sql`
      INSERT INTO contas_convenio_resumo (
        numeroConta, numeroLote, estabelecimentoId, origem, convenio, convenioId,
        pacienteNome, carteiraBeneficiario, totalItens, valorTotal, competencia,
        arquivoHospitalId, loteImportacaoId,
        statusAnaliseResumo, totalDivergencias, totalAlertas
      )
      SELECT
        numeroConta,
        COALESCE(numeroLote, ''),
        estabelecimentoId,
        'XML',
        MAX(convenio),
        MAX(convenioId),
        MAX(pacienteNome),
        MAX(carteiraBeneficiario),
        COUNT(*),
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0),
        COALESCE(competencia, ''),
        arquivoId,
        MAX(loteImportacaoId),
        CASE
          WHEN SUM(statusAnalise = 'divergente') > 0 THEN 'divergente'
          WHEN SUM(statusAnalise = 'revisado') > 0 THEN 'revisado'
          WHEN SUM(statusAnalise = 'conforme') = COUNT(*) THEN 'conforme'
          ELSE 'pendente'
        END,
        SUM(statusAnalise = 'divergente'),
        SUM(statusAnalise = 'divergente')
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabelecimentoId}
        AND origem = 'XML'
        ${itemArquivoFiltro}
      GROUP BY arquivoId, numeroConta, numeroLote, competencia, estabelecimentoId
    `);

    const result = await tx.execute(sql`
      SELECT
        COUNT(*) AS totalItens,
        COUNT(DISTINCT CONCAT(arquivoId, '\u0000', numeroConta, '\u0000', COALESCE(numeroLote, ''), '\u0000', COALESCE(competencia, ''))) AS totalContas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabelecimentoId}
        AND origem = 'XML'
        ${itemArquivoFiltro}
    `);
    const totals = Array.isArray(result[0])
      ? (result[0][0] as
          | { totalItens: number | string; totalContas: number | string }
          | undefined)
      : undefined;
    return {
      success: true,
      totalItens: Number(totals?.totalItens || 0),
      totalContas: Number(totals?.totalContas || 0),
    };
  });
}

/**
 * Preserva a operação legada enquanto 0142 ainda não existir. O caminho novo
 * só é selecionado por worker interno que porta lote + fencing token.
 */
export async function syncContaConvenioFromFaturamentoTiss(
  params: SyncContaConvenioParams
): Promise<{ success: boolean; totalItens: number; totalContas: number }> {
  if (params.loteImportacaoId && params.loteClaim) {
    return syncContaConvenioDoLote(params);
  }
  return syncContaConvenioLegado(params);
}
