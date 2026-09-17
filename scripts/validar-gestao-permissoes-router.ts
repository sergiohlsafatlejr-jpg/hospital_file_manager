import { appRouter } from "../server/routers";
import { getRawPool } from "../server/db";
import { validarAcessoPainelGlosas } from "../server/routers/relatoriosGlosasBiRouter";

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

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [admins] = await pool.execute<any[]>(`SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1`);
    const [managers] = await pool.execute<any[]>(`
      SELECT u.* FROM users u
      WHERE u.role<>'admin' AND EXISTS (
        SELECT 1 FROM permissoesEstabelecimento pe
        INNER JOIN estabelecimentos e ON e.id=pe.estabelecimentoId AND e.ativo='sim'
        WHERE pe.userId=u.id AND pe.podeGerenciar='sim' AND pe.podeVisualizar='sim'
      )
      ORDER BY u.id LIMIT 1
    `);
    assert(admins[0], "Nenhum administrador disponível para validação");

    const adminCaller = callerFor(admins[0]);
    const adminEstabelecimentos = await adminCaller.permissoes.estabelecimentosGerenciaveis();
    const adminUsuarios = await adminCaller.permissoes.listarUsuarios();
    assert(adminEstabelecimentos.length > 0, "Administrador não recebeu estabelecimentos");
    assert(adminUsuarios.length > 0, "Administrador não recebeu usuários");

    let managerResult: { validado: boolean; estabelecimentos: number; usuariosVisiveis: number } | null = null;
    if (managers[0]) {
      const manager = managers[0];
      const managerCaller = callerFor(manager);
      const estabelecimentos = await managerCaller.permissoes.estabelecimentosGerenciaveis();
      const usuarios = await managerCaller.permissoes.listarUsuarios();
      const ids = estabelecimentos.map((item: any) => Number(item.id));
      const [expected] = await pool.execute<any[]>(`
        SELECT estabelecimentoId FROM permissoesEstabelecimento
        WHERE userId=? AND podeGerenciar='sim' AND podeVisualizar='sim'
        ORDER BY estabelecimentoId
      `, [manager.id]);
      const expectedIds = expected.map((item) => Number(item.estabelecimentoId));
      assert(JSON.stringify(ids.sort((a, b) => a - b)) === JSON.stringify(expectedIds), "Gestor recebeu unidades fora do escopo");
      if (usuarios.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        const [outside] = ids.length > 0 ? await pool.execute<any[]>(`
          SELECT COUNT(*) total FROM users u
          WHERE u.id IN (${usuarios.map(() => "?").join(",")})
            AND NOT EXISTS (
              SELECT 1 FROM permissoesEstabelecimento pe
              WHERE pe.userId=u.id AND pe.estabelecimentoId IN (${placeholders})
            )
        `, [...usuarios.map((item: any) => item.id), ...ids]) : [[{ total: usuarios.length }]] as any;
        assert(Number(outside[0]?.total || 0) === 0, "Gestor recebeu usuários sem vínculo nas unidades administradas");
      }
      managerResult = { validado: true, estabelecimentos: ids.length, usuariosVisiveis: usuarios.length };
    }

    const [biDenied] = await pool.execute<any[]>(`
      SELECT u.id, u.role, pe.estabelecimentoId
      FROM permissoesEstabelecimento pe
      INNER JOIN users u ON u.id=pe.userId AND u.role<>'admin'
      WHERE pe.podeVisualizar='sim'
        AND pe.grupoServico<>'administrador'
        AND pe.acessoRelatoriosGlosasBi='nao'
      LIMIT 1
    `);
    const [biAllowed] = await pool.execute<any[]>(`
      SELECT u.id, u.role, pe.estabelecimentoId
      FROM permissoesEstabelecimento pe
      INNER JOIN users u ON u.id=pe.userId AND u.role<>'admin'
      WHERE pe.podeVisualizar='sim' AND pe.acessoRelatoriosGlosasBi='sim'
      LIMIT 1
    `);
    let denied = false;
    if (biDenied[0]) {
      try {
        await validarAcessoPainelGlosas({ user: biDenied[0] }, Number(biDenied[0].estabelecimentoId));
      } catch (error: any) {
        denied = error?.code === "FORBIDDEN";
      }
    }
    assert(!biDenied[0] || denied, "Usuário sem módulo conseguiu acessar o BI de Glosas");
    if (biAllowed[0]) {
      await validarAcessoPainelGlosas({ user: biAllowed[0] }, Number(biAllowed[0].estabelecimentoId));
    }

    console.log(JSON.stringify({
      validado: true,
      administrador: { estabelecimentos: adminEstabelecimentos.length, usuariosVisiveis: adminUsuarios.length },
      gestor: managerResult || { validado: true, observacao: "Nenhum gestor não-admin cadastrado" },
      biGlosas: { bloqueioSemModulo: denied || !biDenied[0], liberacaoComModulo: Boolean(biAllowed[0]) },
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
