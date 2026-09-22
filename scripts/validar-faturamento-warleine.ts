import type { RowDataPacket } from "mysql2/promise";
import Decimal from "decimal.js";
import { getRawPool } from "../server/db";
import { getWarleineAccountItems, getWarleineAccounts, getWarleineFinancialData, getWarleineGlosaDashboard } from "../server/warleineFaturamentoService";

const ESTABELECIMENTO_ID = Number(process.argv.find((arg) => arg.startsWith("--estabelecimento="))?.split("=")[1] || 4);
const ALLOW_LEGACY = process.argv.includes("--allow-legacy");
const EXPECTED_ROWS = 319_784;
const EXPECTED_REJECTED = 41;
const EXPECTED_REPEATED_CONTENT = 197;
const EXPECTED_COMPETENCIES = ["2026/01", "2026/02", "2026/03", "2026/04", "2026/05", "2026/06"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function n(value: unknown): number { return Number(value || 0); }
function close(a: unknown, b: unknown): boolean { return new Decimal(String(a || 0)).minus(String(b || 0)).abs().lessThanOrEqualTo("0.01"); }

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const [[lotRows], [activeRows], [competencyRows], [quarantineRows], [legacyRows], [otherEstablishmentRows], [accountRows], [workerColumnRows], [pendingJobRows], [identityRows], [identityIndexRows], [duplicateRows], [duplicateWarningRows]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT * FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND status='publicado' ORDER BY id DESC LIMIT 1", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total, SUM(valorFaturado) AS faturado, SUM(valorTotalRecebido) AS recebido, SUM(valorAberto) AS aberto, SUM(valorGlosa) AS glosa FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=?`, [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT competencia, COUNT(*) AS total FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? GROUP BY competencia ORDER BY competencia", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT erroCodigo, COUNT(*) AS total FROM warleine_faturamento_quarentena WHERE estabelecimentoId=? GROUP BY erroCodigo ORDER BY erroCodigo", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='staging_faturamento_warleine'"),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId<>? AND loteId IN (SELECT id FROM warleine_faturamento_lotes WHERE estabelecimentoId=?)", [ESTABELECIMENTO_ID, ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM (SELECT competencia,numeroConta,COALESCE(NULLIF(convenioFaturadoCodigo,''),NULLIF(convenioFaturadoNome,''),'SEM_CONVENIO') AS convenioChave FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? GROUP BY competencia,numeroConta,convenioChave) contas", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='warleine_faturamento_lotes' AND column_name IN ('arquivostoragekey','tentativas','claimtoken','claimedby','leaseexpiresat','reducaoaprovadaem','reducaoaprovadapor','reducaoaprovacaomotivo')"),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND status IN ('enfileirado','reservado','processando')", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total, COUNT(DISTINCT origemRegistroId) AS identidades, SUM(CASE WHEN origemRegistroId IS NULL OR origemRegistroId='' THEN 1 ELSE 0 END) AS ausentes FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=?", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT index_name) AS total FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='warleine_faturamento_itens' AND index_name='uq_warleine_item_estab_origem'"),
    pool.query<RowDataPacket[]>("SELECT COALESCE(SUM(repeticoes-1),0) AS total FROM (SELECT COUNT(*) AS repeticoes FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? GROUP BY linhaHash HAVING COUNT(*)>1) repetidos", [ESTABELECIMENTO_ID]),
    pool.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM warleine_faturamento_staging WHERE estabelecimentoId=? AND avisoCodigo LIKE '%CONTEUDO_REPETIDO_NO_ARQUIVO%'", [ESTABELECIMENTO_ID]),
  ]);
  const lot = lotRows[0];
  const active = activeRows[0];
  assert(lot, "Nenhum lote Warleine publicado para o estabelecimento.");
  assert(n(lot.totalPublicadas) === EXPECTED_ROWS, `Lote publicou ${lot.totalPublicadas}; esperado ${EXPECTED_ROWS}.`);
  assert(n(lot.totalRejeitadas) === EXPECTED_REJECTED, `Quarentena ${lot.totalRejeitadas}; esperado ${EXPECTED_REJECTED}.`);
  assert(Boolean(lot.arquivoStorageKey), "O lote publicado não possui arquivo durável criptografado associado.");
  assert(n(active.total) === EXPECTED_ROWS, "Total ativo diverge do lote publicado.");
  assert(close(active.faturado, lot.valorFaturado), "Valor faturado ativo diverge do lote.");
  assert(close(active.recebido, lot.valorTotalRecebido), "Valor recebido ativo diverge do lote.");
  assert(close(active.aberto, lot.valorAberto), "Valor aberto ativo diverge do lote.");
  assert(close(active.glosa, lot.valorGlosa), "Valor glosado ativo diverge do lote.");
  assert(JSON.stringify(competencyRows.map((row) => String(row.competencia))) === JSON.stringify(EXPECTED_COMPETENCIES), "Competências publicadas divergentes.");
  assert(n(quarantineRows.reduce((sum, row) => sum + n(row.total), 0)) === EXPECTED_REJECTED, "Contagem da quarentena diverge do lote.");
  if (!ALLOW_LEGACY) assert(n(legacyRows[0]?.total) === 0, "A staging Warleine legada ainda existe.");
  assert(n(otherEstablishmentRows[0]?.total) === 0, "Foram encontrados itens do lote em outro estabelecimento.");
  assert(n(workerColumnRows[0]?.total) === 8, "As colunas de lease e auditoria do worker Warleine não estão completas.");
  assert(n(pendingJobRows[0]?.total) === 0, "Há job Warleine ainda pendente ou preso para o estabelecimento.");
  assert(n(identityRows[0]?.total) === n(identityRows[0]?.identidades) && n(identityRows[0]?.ausentes) === 0, "As identidades físicas Warleine não são completas e únicas.");
  assert(n(identityIndexRows[0]?.total) === 1, "O índice único de identidade Warleine não está ativo.");
  assert(n(duplicateRows[0]?.total) === EXPECTED_REPEATED_CONTENT, "A multiplicidade de linhas idênticas do arquivo não foi preservada.");
  assert(n(duplicateWarningRows[0]?.total) === EXPECTED_REPEATED_CONTENT, "As linhas de conteúdo repetido não foram sinalizadas na staging.");

  const [financial, glosas, accounts] = await Promise.all([
    getWarleineFinancialData({ estabelecimentoId: ESTABELECIMENTO_ID, limite: 10 }),
    getWarleineGlosaDashboard({ estabelecimentoId: ESTABELECIMENTO_ID, limite: 20 }),
    getWarleineAccounts({ estabelecimentoId: ESTABELECIMENTO_ID, page: 1, pageSize: 20 }),
  ]);
  assert(close(financial.resumo.totalFaturado, active.faturado), "Faturado x Recebido Warleine diverge da publicação.");
  assert(close(financial.resumo.totalRecebido, active.recebido), "Recebido do relatório Warleine diverge da publicação.");
  assert(close(financial.resumo.totalGlosado, active.glosa), "Glosado do relatório Warleine diverge da publicação.");
  assert(close(glosas.resumo.valorGlosado, active.glosa), "BI de Glosas Warleine diverge da publicação.");
  assert(accounts.total === n(accountRows[0]?.total), "Conta Convênio Warleine diverge do agrupamento real de contas.");
  const firstAccount = accounts.contas[0];
  assert(firstAccount, "Nenhuma conta Warleine foi retornada para validar a paginação.");
  const accountItems = await getWarleineAccountItems(ESTABELECIMENTO_ID, firstAccount.competencia, firstAccount.numeroConta, firstAccount.convenioChave, 1, 20);
  assert(accountItems.items.length <= 20 && accountItems.total >= accountItems.items.length, "A paginação dos itens da conta Warleine é inconsistente.");

  console.log(JSON.stringify({
    validado: true,
    estabelecimentoId: ESTABELECIMENTO_ID,
    loteId: n(lot.id),
    itensAtivos: n(active.total),
    contas: accounts.total,
    competencias: competencyRows.map((row) => ({ competencia: String(row.competencia), itens: n(row.total) })),
    totais: { faturado: String(active.faturado), recebido: String(active.recebido), aberto: String(active.aberto), glosa: String(active.glosa) },
    quarentena: quarantineRows.map((row) => ({ motivo: String(row.erroCodigo), quantidade: n(row.total) })),
    tabelaLegadaPresente: n(legacyRows[0]?.total),
    workerDuravel: true,
    leaseTransacional: true,
    identidadesFisicas: n(identityRows[0]?.identidades),
    conteudosRepetidosPreservados: n(duplicateRows[0]?.total),
    paginacaoItens: true,
    isolamentoAprovado: true,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
