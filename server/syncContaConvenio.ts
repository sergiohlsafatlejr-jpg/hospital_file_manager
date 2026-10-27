import { sql } from "drizzle-orm";
import { getDb } from "./db";

export type SyncContaConvenioParams = {
  estabelecimentoId: number;
  arquivoId?: number;
};

/**
 * Sincroniza os XMLs de envio já normalizados em faturamento_tiss com as
 * tabelas operacionais da tela Conta Convênio.
 *
 * A rotina é idempotente: remove apenas os itens XML do escopo informado e
 * recompõe os respectivos resumos a partir da fonte faturamento_tiss.
 */
export async function syncContaConvenioFromFaturamentoTiss(
  params: SyncContaConvenioParams,
): Promise<{ success: boolean; totalItens: number; totalContas: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const { estabelecimentoId, arquivoId } = params;
  const arquivoFiltro = arquivoId ? sql`AND ft.arquivo_id = ${arquivoId}` : sql``;
  const itemArquivoFiltro = arquivoId ? sql`AND arquivoId = ${arquivoId}` : sql``;

  await db.execute(sql`
    DELETE FROM contas_convenio_itens
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
      ${itemArquivoFiltro}
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
    GROUP BY numeroConta, estabelecimentoId
  `);

  const [totaisResult] = await db.execute(sql`
    SELECT
      COUNT(*) AS totalItens,
      COUNT(DISTINCT numeroConta) AS totalContas
    FROM contas_convenio_itens
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND origem = 'XML'
  `);
  const totais = (totaisResult as unknown as Array<{ totalItens: number | string; totalContas: number | string }>)[0];

  return {
    success: true,
    totalItens: Number(totais?.totalItens || 0),
    totalContas: Number(totais?.totalContas || 0),
  };
}
