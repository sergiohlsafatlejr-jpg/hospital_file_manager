import { appRouter } from "../server/routers";
import { getRawPool } from "../server/db";

const ESTABELECIMENTO_HEMOLABOR = 6;
const RESULTADO_PILOTO = {
  totalLinhas: 657_032,
  totalValidas: 602_828,
  totalAvisos: 54_204,
  totalRejeitadas: 0,
  totalContas: 139_541,
  valorConsolidado: 170_470_465.96,
  pendentes: 63_201,
  finalizadas: 76_340,
};
const permitirLegado = process.argv.includes("--allow-legacy");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function callerFor(user: any) {
  return appRouter.createCaller({
    user,
    req: { ip: "127.0.0.1", protocol: "https", secure: true, headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    res: {},
  } as any);
}

async function assertForbidden(operation: Promise<unknown>, message: string) {
  try {
    await operation;
  } catch (error: any) {
    assert(error?.code === "FORBIDDEN", `${message}: retorno inesperado ${error?.code || "sem código"}`);
    return;
  }
  throw new Error(`${message}: a operação foi aceita indevidamente`);
}

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [admins] = await pool.query<any[]>("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    assert(admins[0], "Nenhum administrador disponível para validar o router");

    const [lots] = await pool.query<any[]>(`
      SELECT id, status, totalLinhas, totalValidas, totalAvisos, totalRejeitadas,
             totalContas, totalPublicadas, valorConsolidado
      FROM tasy_integracao_lotes
      WHERE estabelecimentoId=? AND status='publicado'
      ORDER BY id DESC LIMIT 1
    `, [ESTABELECIMENTO_HEMOLABOR]);
    const lot = lots[0];
    assert(lot, "Nenhum lote Tasy publicado para o Hemolabor");
    assert(Number(lot.totalLinhas) > 0, "Lote publicado sem linhas");
    assert(Number(lot.totalRejeitadas) === 0, "Lote piloto possui linhas rejeitadas");
    assert(Number(lot.totalContas) === Number(lot.totalPublicadas), "Quantidade publicada diverge das contas consolidadas");
    assert(Number(lot.totalLinhas) === RESULTADO_PILOTO.totalLinhas, "Total de linhas diverge do piloto validado");
    assert(Number(lot.totalValidas) === RESULTADO_PILOTO.totalValidas, "Total de linhas válidas diverge do piloto validado");
    assert(Number(lot.totalAvisos) === RESULTADO_PILOTO.totalAvisos, "Total de avisos diverge do piloto validado");
    assert(Number(lot.totalRejeitadas) === RESULTADO_PILOTO.totalRejeitadas, "Total de rejeições diverge do piloto validado");
    assert(Number(lot.totalPublicadas) === RESULTADO_PILOTO.totalContas, "Total de contas diverge do piloto validado");
    assert(Math.abs(Number(lot.valorConsolidado) - RESULTADO_PILOTO.valorConsolidado) < 0.01, "Valor consolidado diverge do piloto validado");

    const [uniqueIndex] = await pool.query<any[]>(`
      SELECT COUNT(*) total
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'tasy_integracao_lotes'
        AND index_name = 'uq_tasy_lote_estab_hash'
        AND non_unique = 0
    `);
    assert(Number(uniqueIndex[0]?.total || 0) === 2, "Índice único de lote/hash não possui as duas colunas esperadas");

    const [stage] = await pool.query<any[]>(`
      SELECT COUNT(*) total,
             SUM(CASE WHEN estabelecimentoId<>? THEN 1 ELSE 0 END) foraEscopo
      FROM tasy_atendimentos_staging WHERE loteId=?
    `, [ESTABELECIMENTO_HEMOLABOR, lot.id]);
    assert(Number(stage[0]?.total || 0) === Number(lot.totalLinhas), "Staging diverge do total do lote");
    assert(Number(stage[0]?.foraEscopo || 0) === 0, "Staging contém linhas de outro estabelecimento");

    const [active] = await pool.query<any[]>(`
      SELECT COUNT(*) total, ROUND(SUM(COALESCE(valorConta,0)),2) valor,
             COUNT(DISTINCT estabelecimentoId) estabelecimentos,
             SUM(CASE WHEN ultimoLoteId<>? THEN 1 ELSE 0 END) outroLote
      FROM atendimentos_unificados
      WHERE estabelecimentoId=? AND origemSistema IN ('tasy','tasy_hemolabor') AND ativoNaFonte=1
    `, [lot.id, ESTABELECIMENTO_HEMOLABOR]);
    assert(Number(active[0]?.total || 0) === Number(lot.totalPublicadas), "Contas ativas divergem do lote publicado");
    assert(Number(active[0]?.estabelecimentos || 0) === 1, "Publicação Tasy misturou estabelecimentos");
    assert(Number(active[0]?.outroLote || 0) === 0, "Snapshot ativo contém outro lote Tasy");
    assert(Math.abs(Number(active[0]?.valor || 0) - Number(lot.valorConsolidado || 0)) < 0.01, "Valor ativo diverge do lote");

    const [duplicates] = await pool.query<any[]>(`
      SELECT COUNT(*) total FROM (
        SELECT estabelecimentoId, origemSistema, origemId, COUNT(*) qtd
        FROM atendimentos_unificados
        WHERE origemId IS NOT NULL
        GROUP BY estabelecimentoId, origemSistema, origemId
        HAVING COUNT(*)>1
      ) x
    `);
    assert(Number(duplicates[0]?.total || 0) === 0, "Existem chaves de origem duplicadas por estabelecimento");

    const [legacy] = await pool.query<any[]>(`
      SELECT COUNT(*) total FROM information_schema.tables
      WHERE table_schema=DATABASE()
        AND table_name IN ('TASY_hemolabor_atendimentos_stagion','Tasy_maternidadeela_atendimentos_stagion')
    `);
    const legacyCount = Number(legacy[0]?.total || 0);
    if (!permitirLegado) assert(legacyCount === 0, "As duas stagings legadas ainda existem");

    const [history] = await pool.query<any[]>(`
      SELECT COUNT(*) total FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name='historico_notificacoes_atendimento'
    `);
    assert(Number(history[0]?.total || 0) === 1, "Histórico isolado de notificações não foi criado");

    const caller = callerFor(admins[0]);
    const page = await caller.atendimentos.listarPaginado({
      estabelecimentoId: ESTABELECIMENTO_HEMOLABOR,
      page: 1,
      pageSize: 10,
      origemSistema: "tasy",
      situacao: "todos",
      sortColumn: "data_entrada",
      sortOrder: "desc",
    });
    assert(page.total === Number(lot.totalPublicadas), "Total da tela diverge do lote publicado");
    assert(page.items.length > 0, "Tela paginada não retornou contas Tasy");
    assert(page.items.every((item: any) => Number(item.estabelecimentoId) === ESTABELECIMENTO_HEMOLABOR), "Tela retornou conta de outra unidade");
    assert(page.items.some((item: any) => Number(item.valorConta || 0) >= 0), "Tela não retornou o campo valor da conta");

    const summary = await caller.tasyImportacao.resumo({ estabelecimentoId: ESTABELECIMENTO_HEMOLABOR });
    assert(summary.totalContas === Number(lot.totalPublicadas), "Resumo Tasy diverge da tela");
    assert(summary.pendentes === RESULTADO_PILOTO.pendentes, "Total de contas pendentes diverge do piloto validado");
    assert(summary.finalizadas === RESULTADO_PILOTO.finalizadas, "Total de contas finalizadas diverge do piloto validado");

    const deniedCaller = callerFor({ ...admins[0], id: 2_147_483_647, role: "user" });
    await assertForbidden(
      deniedCaller.atendimentos.listarPaginado({
        estabelecimentoId: ESTABELECIMENTO_HEMOLABOR,
        page: 1,
        pageSize: 10,
        situacao: "todos",
      }),
      "Usuário sem vínculo acessou atendimentos de outra unidade",
    );
    await assertForbidden(
      deniedCaller.atendimentos.enviarNotificacaoEmail({
        estabelecimentoId: ESTABELECIMENTO_HEMOLABOR,
        destinatarioEmail: "teste@example.com",
        estabelecimentoNome: "Unidade de teste",
        atendimentos: [{
          paciente: "Paciente de teste",
          numatend: "TESTE-NEGADO",
          tipoAtendimento: "Teste",
          plano: "Teste",
          diasParado: 0,
          dataEntrada: "-",
        }],
      }),
      "Usuário sem vínculo tentou enviar notificação de outra unidade",
    );

    console.log(JSON.stringify({
      validado: true,
      estabelecimentoId: ESTABELECIMENTO_HEMOLABOR,
      loteId: Number(lot.id),
      totalLinhas: Number(lot.totalLinhas),
      totalValidas: Number(lot.totalValidas),
      totalAvisos: Number(lot.totalAvisos),
      totalRejeitadas: Number(lot.totalRejeitadas),
      totalContas: Number(lot.totalPublicadas),
      valorConsolidado: Number(lot.valorConsolidado),
      pendentes: summary.pendentes,
      finalizadas: summary.finalizadas,
      tabelasLegadasPresentes: legacyCount,
      isolamentoPorEstabelecimento: true,
      autorizacaoNegativaValidada: true,
      indiceUnicoLoteHashValidado: true,
      dadosPessoaisExibidos: false,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
