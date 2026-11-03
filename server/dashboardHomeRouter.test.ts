import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { dashboardHomeRouter } from "./routers/dashboardHomeRouter";
import * as dbModule from "./db";
import { ESTABELECIMENTO_CENTRAL_SAFATLE as CENTRAL } from "./hospitalScope";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

describe("dashboardHomeRouter.resumoGeral", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(dbModule.verificarPermissaoEstabelecimento).mockResolvedValue(true);
  });

  it("retorna dados da esteira de faturamento, contas paradas nos setores e valores/quantidades faturados por estabelecimento", async () => {
    const mockExecute = vi.fn(async (queryObj: any) => {
      const sqlStr = String(queryObj?.queryChunks?.[0]?.value?.[0] ?? queryObj ?? "");

      if (sqlStr.includes("FROM estabelecimentos")) {
        return [
          [
            { id: 2160001, nome: "Safatle Central" },
            { id: 10, nome: "Hospital Santa Helena" },
            { id: 20, nome: "Hospital Samaritano" },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_contas fc") && sqlStr.includes("GROUP BY fc.hospital_estabelecimento_id, fc.setor_atual")) {
        return [
          [
            {
              hospitalId: 10,
              setor: "recepcao",
              totalContas: 4,
              emFila: 3,
              emAndamento: 1,
              devolvidasErro: 0,
              contasFaturadas: 0,
              valorTotal: 0,
              totalItensXml: 0,
              mediaHorasNoSetor: 6,
              maxHorasNoSetor: 12,
            },
            {
              hospitalId: 10,
              setor: "faturamento",
              totalContas: 8,
              emFila: 5,
              emAndamento: 2,
              devolvidasErro: 1,
              contasFaturadas: 3,
              valorTotal: 45000,
              totalItensXml: 120,
              mediaHorasNoSetor: 18,
              maxHorasNoSetor: 36,
            },
            {
              hospitalId: 10,
              setor: "auditoria_interna",
              totalContas: 5,
              emFila: 2,
              emAndamento: 3,
              devolvidasErro: 0,
              contasFaturadas: 5,
              valorTotal: 85000,
              totalItensXml: 210,
              mediaHorasNoSetor: 10,
              maxHorasNoSetor: 20,
            },
            {
              hospitalId: 20,
              setor: "enviado_convenio",
              totalContas: 12,
              emFila: 0,
              emAndamento: 0,
              devolvidasErro: 0,
              contasFaturadas: 12,
              valorTotal: 190000,
              totalItensXml: 450,
              mediaHorasNoSetor: 2,
              maxHorasNoSetor: 5,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_historico_fluxo")) {
        return [
          [
            {
              usuarioId: 1,
              usuarioNome: "Ana Faturista",
              contasRecepcionadas: 10,
              contasFaturadas: 15,
              valorFaturado: 230000,
              contasAuditadasInterna: 5,
              contasAuditadasExterna: 2,
              contasLimpasEnviadas: 12,
              totalContasMovimentadas: 20,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_erros_conta")) {
        return [[{ totalErros: 2 }]];
      }

      if (sqlStr.includes("FROM faturamento_unificado") && sqlStr.includes("GROUP BY estabelecimentoId")) {
        return [
          [
            {
              estabelecimentoId: 10,
              totalItens: 350,
              totalContas: 15,
              valorTotalFaturado: 150000,
            },
            {
              estabelecimentoId: 20,
              totalItens: 450,
              totalContas: 12,
              valorTotalFaturado: 190000,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM contas_convenio_resumo") && sqlStr.includes("GROUP BY estabelecimentoId")) {
        return [[]];
      }

      return [[]];
    });

    vi.mocked(dbModule.getDb).mockResolvedValue({
      execute: mockExecute,
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => [
        { id: CENTRAL }, { id: 10 }, { id: 20 },
      ]) })) })),
    } as any);

    const caller = dashboardHomeRouter.createCaller({
      user: { id: 1, name: "Sergio Safatle", email: "sergio@safatle.com", role: "admin" } as any,
      req: {} as any,
      res: {} as any,
    });

    const res = await caller.resumoGeral({
      estabelecimentoId: 2160001,
    });

    // 1. Verifica dados da Esteira de Faturamento
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(29);
    expect(res.esteiraFaturamento.resumoProducao.contasParadasSetores).toBe(17); // 4 recepcao + 8 faturamento + 5 auditoria_interna
    expect(res.esteiraFaturamento.resumoProducao.contasEnviadasConvenio).toBe(12);
    expect(res.esteiraFaturamento.resumoProducao.totalDevolvidasErro).toBe(1);

    // 2. Verifica quantidade de contas paradas nos setores
    expect(res.esteiraFaturamento.porSetor.recepcao.totalContas).toBe(4);
    expect(res.esteiraFaturamento.porSetor.faturamento.totalContas).toBe(8);
    expect(res.esteiraFaturamento.porSetor.auditoria_interna.totalContas).toBe(5);
    expect(res.esteiraFaturamento.porSetor.enviado_convenio.totalContas).toBe(12);

    // 3. Verifica valores e quantidade faturados por estabelecimento
    expect(res.faturamentoPorEstabelecimento).toHaveLength(2);
    const samaritano = res.faturamentoPorEstabelecimento.find((e) => e.estabelecimentoId === 20);
    const santaHelena = res.faturamentoPorEstabelecimento.find((e) => e.estabelecimentoId === 10);

    expect(samaritano?.quantidadeFaturada).toBe(12);
    expect(samaritano?.valorFaturado).toBe(190000);
    expect(santaHelena?.contasParadasSetores).toBe(17);
    expect(santaHelena?.quantidadeFaturada).toBe(15);
    expect(santaHelena?.valorFaturado).toBe(150000);

    // 4. Verifica consolidação no topo para Safatle (2160001)
    expect(res.faturista.totalContas).toBe(27);
    expect(res.faturista.valorTotalFaturado).toBe(340000);
  });
});

// Integração local: caller, middleware, hospitalScope e perfil PR156 reais.
// Apenas a camada de banco/permissão é substituída; não há servidor nem conexão.
const dialect = new MySqlDialect();
const USER_ID = 71;
const catalogo = [
  { id: CENTRAL, nome: "Central SAFATLE" },
  { id: 10, nome: "Hospital A" },
  { id: 20, nome: "Hospital B" },
  { id: 30, nome: "Hospital C" },
];
function permissao(estabelecimentoId: number, extra: Record<string, unknown> = {}) {
  return { userId: USER_ID, estabelecimentoId, podeVisualizar: "sim", podeGerenciar: "nao", ...extra };
}
function perfil(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    cargoSetor: "Faturista", setoresPermitidos: ["faturamento"], hospitaisPermitidos: [10],
    verRelatoriosGerenciais: false, ...overrides,
  });
}
function conta(hospitalId: number, setor: string, totalContas: number, valorTotal = 100) {
  return { hospitalId, setor, totalContas, valorTotal, emFila: totalContas, emAndamento: 0,
    devolvidasErro: 0, contasFaturadas: totalContas, totalItensXml: totalContas * 2,
    mediaHorasNoSetor: 6, maxHorasNoSetor: 12 };
}
function caller(role = "user") {
  return dashboardHomeRouter.createCaller({
    user: { id: USER_ID, role, name: "Validação sintética" } as any,
    req: {} as any, res: {} as any,
  });
}

type FixtureOptions = {
  role?: string;
  permissoes?: Record<string, unknown>[];
  perfilRaw?: string;
  falha?: "catalogo" | "nomes" | "permissoes" | "perfil";
  contas?: ReturnType<typeof conta>[];
  sqlExtra?: (query: string) => unknown[] | undefined;
};
function configurar(options: FixtureOptions = {}) {
  const permissoes = options.permissoes ?? [permissao(CENTRAL), permissao(10), permissao(20)];
  vi.mocked(dbModule.verificarPermissaoEstabelecimento).mockImplementation(async (userId, id) =>
    options.role === "admin" || permissoes.some(p => p.userId === userId && p.estabelecimentoId === id && p.podeVisualizar === "sim"),
  );
  const sqls: string[] = [];
  const contas = options.contas ?? [conta(10, "faturamento", 3), conta(10, "auditoria_interna", 7), conta(20, "faturamento", 9), conta(30, "faturamento", 50)];
  const select = vi.fn(() => ({ from: vi.fn((table: any) => ({ where: vi.fn(async (predicate: any) => {
    const query = dialect.sqlToQuery(predicate);
    if (getTableName(table) === "estabelecimentos") {
      if (options.falha === "catalogo") throw new Error("catálogo indisponível");
      const hospitalId = query.params.find(p => typeof p === "number");
      return catalogo.filter(h => hospitalId === undefined || hospitalId === h.id);
    }
    if (getTableName(table) === "permissoesEstabelecimento") {
      if (options.falha === "permissoes") throw new Error("permissões indisponíveis");
      return permissoes;
    }
    throw new Error("Tabela inesperada no resolvedor Home");
  }) })) }));
  const execute = vi.fn(async (statement: any) => {
    const query = dialect.sqlToQuery(statement).sql;
    sqls.push(query);
    if (query.includes("FROM fabrica_metas")) {
      if (options.falha === "perfil") throw new Error("perfil indisponível");
      return [options.perfilRaw === undefined ? [] : [{ usuario_nome: "Colaborador", observacao: options.perfilRaw }], []];
    }
    if (query.includes("FROM estabelecimentos")) {
      if (options.falha === "nomes") throw new Error("nomes indisponíveis");
      const ids = query.match(/id IN \(([^)]*)\)/)?.[1].split(",").map(Number) ?? [];
      return [catalogo.filter(h => ids.includes(h.id)), []];
    }
    const extra = options.sqlExtra?.(query);
    if (extra !== undefined) return [extra, []];
    if (query.includes("GROUP BY fc.hospital_estabelecimento_id, fc.setor_atual")) {
      const ids = query.match(/fc.hospital_estabelecimento_id IN \(([^)]*)\)/)?.[1].split(",").map(Number) ?? [];
      const setores = query.match(/fc.setor_atual IN \(([^)]*)\)/)?.[1].replaceAll("'", "").split(",").map(s => s.trim()) ?? [];
      return [query.includes("AND 1 = 0") ? [] : contas.filter(c => ids.includes(c.hospitalId) && setores.includes(c.setor)), []];
    }
    return [[], []];
  });
  const db = { select, execute };
  vi.mocked(dbModule.getDb).mockResolvedValue(db as any);
  return { db, sqls };
}
function consultasDados(sqls: string[]) {
  return sqls.filter(q => !q.includes("FROM fabrica_metas") && !q.includes("FROM estabelecimentos"));
}
function verificarEscopoQueries(sqls: string[], ids: number[], setores?: string[]) {
  const queries = consultasDados(sqls);
  expect(queries.length).toBeGreaterThanOrEqual(12); // mais dois fallbacks quando Top/evolução estão vazios
  for (const tabela of ["fabrica_contas", "fabrica_historico_fluxo", "fabrica_erros_conta", "faturamento_unificado", "contas_convenio_resumo", "recursosGlosa", "nfse_notas", "arquivos", "conciliados_automatico"]) {
    expect(queries.some(query => query.includes(`FROM ${tabela}`)), tabela).toBe(true);
  }
  for (const query of queries) {
    const listasHospital = [...query.matchAll(/(?:hospital_estabelecimento_id|estabelecimentoId) IN \(([^)]*)\)/g)];
    expect(listasHospital.length, query).toBeGreaterThan(0);
    for (const [, lista] of listasHospital) expect(lista, query).toBe(ids.join(", ") || "NULL");
    if (setores && query.includes("FROM fabrica_contas fc")) {
      expect(query).toContain(`fc.setor_atual IN (${setores.map(s => `'${s}'`).join(", ")})`);
    }
  }
}

describe("Home Issue161 — autorização server-side e regressão de indicadores", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("não autenticado não acessa o endpoint nem o banco", async () => {
    const { db } = configurar();
    const anonimo = dashboardHomeRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(anonimo.resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it.each([0, CENTRAL])("usuário sem acesso não ganha fallback para todos nem hospital 1 (input %s)", async estabelecimentoId => {
    const { db } = configurar({ permissoes: [] });
    await expect(caller().resumoGeral({ estabelecimentoId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("gestor com permissão somente Central não recebe hospitais físicos", async () => {
    const { db } = configurar({ permissoes: [permissao(CENTRAL, { podeGerenciar: "sim", grupoServico: "administrador" })] });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("hospital arbitrário/proibido é rejeitado antes de consultar indicadores", async () => {
    const { db } = configurar({ permissoes: [permissao(CENTRAL), permissao(10)] });
    await expect(caller().resumoGeral({ estabelecimentoId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("permissão visualizar=nao e permissões de outro usuário não ampliam a Central", async () => {
    const { sqls } = configurar({ permissoes: [permissao(CENTRAL), permissao(10), permissao(20, { podeVisualizar: "nao" }), permissao(30, { userId: 999 })] });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.faturamentoPorEstabelecimento.map(h => h.estabelecimentoId)).toEqual([10]);
    verificarEscopoQueries(sqls, [10]);
  });

  it("gestor Central com perfil salvo restringe todos os hospitais e todos os dados de Esteira", async () => {
    const { sqls } = configurar({
      permissoes: [permissao(CENTRAL, { podeGerenciar: "sim", grupoServico: "administrador" }), permissao(10), permissao(20)],
      perfilRaw: perfil({ hospitaisPermitidos: [10, 30], verRelatoriosGerenciais: true }),
      sqlExtra: query => query.includes("FROM fabrica_historico_fluxo") ? [{ usuarioId: 71, usuarioNome: "Faturista", contasFaturadas: 2, valorFaturado: 50, totalContasMovimentadas: 2 }] : undefined,
    });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL, competencia: "2026/11" });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(3);
    expect(res.esteiraFaturamento.porSetor.faturamento.totalContas).toBe(3);
    expect(res.esteiraFaturamento.porSetor.auditoria_interna.totalContas).toBe(0);
    expect(res.esteiraFaturamento.producaoPorColaborador[0].contasFaturadas).toBe(2);
    expect(res.esteiraFaturamento.resumoProducao.etapasHistorico.faturadas).toBe(2);
    expect(res.faturamentoPorEstabelecimento.map(h => h.estabelecimentoId)).toEqual([10]);
    expect(res.faturista.totalContas).toBe(3);
    verificarEscopoQueries(sqls, [10], ["faturamento"]);
    const historico = sqls.find(q => q.includes("FROM fabrica_historico_fluxo"))!;
    expect(historico).toContain("COALESCE(setor_origem, setor_destino) IN ('faturamento')");
    expect(historico).toContain("fc.id = fabrica_historico_fluxo.fabrica_conta_id");
    expect(historico).toContain("fc.hospital_estabelecimento_id = fabrica_historico_fluxo.hospital_estabelecimento_id");
    const erros = sqls.find(q => q.includes("FROM fabrica_erros_conta"))!;
    expect(erros).toContain("setor_origem_erro IN ('faturamento')");
    expect(erros).toContain("fc.id = fabrica_erros_conta.fabrica_conta_id");
    expect(erros).toContain("fc.hospital_estabelecimento_id = fabrica_erros_conta.hospital_estabelecimento_id");
    expect(historico).toContain("DATE_FORMAT(DATE(created_at), '%Y-%m') = '2026-11'");
    expect(sqls.find(q => q.includes("GROUP BY fc.hospital_estabelecimento_id"))).toContain("= '2026-11'");
  });

  it("hospital permitido pela permissão mas proibido pelo perfil salvo é rejeitado", async () => {
    const { sqls } = configurar({ perfilRaw: perfil() });
    await expect(caller().resumoGeral({ estabelecimentoId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(consultasDados(sqls)).toEqual([]);
    expect(sqls).toHaveLength(1); // somente validação de perfil, antes do catálogo/indicadores
  });

  it("lista hospitalar vazia no perfil preserva hospitais autorizados, sem ampliar permissão", async () => {
    const { sqls } = configurar({ perfilRaw: perfil({ hospitaisPermitidos: [] }) });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(12);
    expect(res.faturamentoPorEstabelecimento).toHaveLength(2);
    verificarEscopoQueries(sqls, [10, 20], ["faturamento"]);
  });

  it("perfil com interseção hospitalar vazia retorna sem dados, nunca fallback hospital 1", async () => {
    const { sqls } = configurar({ perfilRaw: perfil({ hospitaisPermitidos: [30] }) });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.faturamentoPorEstabelecimento).toEqual([]);
    expect(res.esteiraFaturamento.producaoPorColaborador).toEqual([]);
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(0);
    expect(res.faturista.totalContas).toBe(0);
    verificarEscopoQueries(sqls, []);
  });

  it("perfil explicitamente sem setores não ganha nenhum setor por fallback", async () => {
    const { sqls } = configurar({ perfilRaw: perfil({ setoresPermitidos: [] }) });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(0);
    expect(res.esteiraFaturamento.resumoProducao.totalErrosRegistrados).toBe(0);
    expect(res.esteiraFaturamento.producaoPorColaborador).toEqual([]);
    for (const q of sqls.filter(q => /FROM fabrica_(contas|historico_fluxo|erros_conta)/.test(q))) expect(q).toContain("AND 1 = 0");
    verificarEscopoQueries(sqls, [10]);
  });

  it.each(["limpeza_prontuario", "recursos"])("preserva compartilhamento PR156 para perfil %s", async setor => {
    const { sqls } = configurar({ perfilRaw: perfil({ setoresPermitidos: [setor] }), contas: [
      conta(10, "limpeza_prontuario", 1), conta(10, "recursos", 2), conta(10, "enviado_convenio", 3), conta(10, "finalizado", 4), conta(10, "faturamento", 99),
    ] });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(10);
    expect(res.esteiraFaturamento.porSetor.enviado_convenio.totalContas).toBe(9);
    expect(res.esteiraFaturamento.porSetor.faturamento.totalContas).toBe(0);
    const setores = setor === "recursos" ? ["recursos", "limpeza_prontuario", "enviado_convenio", "finalizado"] : ["limpeza_prontuario", "recursos", "enviado_convenio", "finalizado"];
    verificarEscopoQueries(sqls, [10], setores);
  });

  it("ausência comprovada de perfil preserva legado permitido e hospital direto sem acesso Central", async () => {
    const { sqls } = configurar({ permissoes: [permissao(10)] });
    const res = await caller().resumoGeral({ estabelecimentoId: 10 });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(10);
    expect(res.esteiraFaturamento.porSetor.auditoria_interna.totalContas).toBe(7);
    expect(res.faturamentoPorEstabelecimento.map(h => h.estabelecimentoId)).toEqual([10]);
    expect(dbModule.verificarPermissaoEstabelecimento).not.toHaveBeenCalledWith(USER_ID, CENTRAL, "visualizar");
    verificarEscopoQueries(sqls, [10]);
    expect(sqls.find(q => q.includes("FROM fabrica_historico_fluxo"))).not.toContain("EXISTS");
    expect(sqls.find(q => q.includes("FROM fabrica_erros_conta"))).not.toContain("EXISTS");
  });

  it.each(["catalogo", "nomes", "permissoes"] as const)("falha de %s aborta sem consultar dados nem ampliar escopo", async falha => {
    const { sqls } = configurar({ falha });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(consultasDados(sqls)).toEqual([]);
  });

  it("falha ao verificar permissão aborta antes do banco", async () => {
    const { db } = configurar();
    vi.mocked(dbModule.verificarPermissaoEstabelecimento).mockRejectedValue(new Error("permissão indisponível"));
    await expect(caller().resumoGeral({ estabelecimentoId: 10 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("falha de leitura do perfil nega acesso e nunca usa legado", async () => {
    const { sqls } = configurar({ falha: "perfil" });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(consultasDados(sqls)).toEqual([]);
  });

  it.each(["{invalid-json", "", perfil({ setoresPermitidos: ["qualquer_setor"] }), perfil({ hospitaisPermitidos: [-1] }), perfil({ verRelatoriosGerenciais: "sim" })])("perfil salvo malformado falha fechado (%s)", async perfilRaw => {
    const { sqls } = configurar({ perfilRaw });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(consultasDados(sqls)).toEqual([]);
  });

  it.each([-1, 10.5])("input inválido %s não vira consolidado nem ID arbitrário", async estabelecimentoId => {
    const { db } = configurar({ role: "admin" });
    await expect(caller("admin").resumoGeral({ estabelecimentoId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("sem catálogo de hospitais físicos nem admin recebe fallback 1/Central", async () => {
    const { db } = configurar({ role: "admin" });
    db.select.mockImplementation(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => [{ id: CENTRAL, nome: "Central" }]) })) }));
    await expect(caller("admin").resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("admin legítimo mantém indicadores financeiros, recursos, pipeline, conciliação e Esteira", async () => {
    const { sqls } = configurar({ role: "admin", perfilRaw: "malformado ignorado apenas para admin", sqlExtra: query => {
      if (query.includes("MAX(REPLACE(competencia")) return [{ totalItens: 33, totalContas: 22, valorTotalFaturado: 5500, competenciaAtual: "2026-11" }];
      if (query.includes("GROUP BY COALESCE(c.nome, fu.convenio")) return [{ convenio: "Convênio Teste", totalGuias: 4, totalFaturado: 2000 }];
      if (query.includes("GROUP BY REPLACE(competencia")) return [{ competencia: "2026-11", totalContas: 4, valorFaturado: 2000 }];
      if (query.includes("FROM fabrica_historico_fluxo")) return [{ usuarioId: 1, usuarioNome: "Equipe", contasRecepcionadas: 3, contasFaturadas: 2, contasAuditadasInterna: 1, contasAuditadasExterna: 1, contasLimpasEnviadas: 1, totalContasMovimentadas: 8 }];
      if (query.includes("FROM fabrica_erros_conta")) return [{ totalErros: 2 }];
      if (query.includes("as totalRecursos,")) return [{ totalRecursos: 3, enviado: 1, valorTotalRecuperado: 100 }];
      if (query.includes("DATEDIFF(rg.dataPrazoResposta")) return [{ id: 9, guiaNumero: "G9", valorGlosado: 10, diasRestantes: 5 }];
      if (query.includes("as totalNfEmitidas")) return [{ totalGuiasFaturadas: 30, totalNfEmitidas: 2, totalDemonstrativosImportados: 3, totalRecursosFeitos: 4 }];
      if (query.includes("FROM conciliados_automatico")) return [{ totalItens: 7, conciliados: 5, glosados: 2, totalPago: 900, totalGlosa: 10 }];
      return undefined;
    } });
    const res = await caller("admin").resumoGeral({ estabelecimentoId: CENTRAL });
    expect(sqls.some(q => q.includes("FROM fabrica_metas"))).toBe(false);
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(69);
    expect(res.esteiraFaturamento.resumoProducao.totalErrosRegistrados).toBe(2);
    expect(res.esteiraFaturamento.resumoProducao.etapasHistorico).toEqual({ recepcionadas: 3, faturadas: 2, auditadasInterna: 1, auditadasExterna: 1, limpasEnviadas: 1 });
    expect(res.faturamentoPorEstabelecimento).toHaveLength(3);
    expect(res.faturista).toMatchObject({ totalItens: 138, totalContas: 69, valorTotalFaturado: 5500, competenciaAtual: "2026-11" });
    expect(res.faturista.conveniosTop).toEqual([{ convenio: "Convênio Teste", totalGuias: 4, totalFaturado: 2000 }]);
    expect(res.faturista.evolucaoMensal).toEqual([{ competencia: "2026-11", totalContas: 4, valorFaturado: 2000 }]);
    expect(res.recursoGlosa).toMatchObject({ totalRecursos: 3, enviado: 1, valorTotalRecuperado: 100 });
    expect(res.recursoGlosa.recursosComPrazo[0]).toMatchObject({ id: 9, diasRestantes: 5 });
    expect(res.fluxoPipeline).toEqual({ totalGuiasFaturadas: 69, totalNfEmitidas: 2, totalDemonstrativosImportados: 3, totalRecursosFeitos: 4 });
    expect(res.conciliacao).toMatchObject({ totalItens: 7, conciliados: 5, glosados: 2, totalPago: 900, totalGlosa: 10 });
    verificarEscopoQueries(sqls, [10, 20, 30]);
  });

  it("admin em hospital direto mantém todos os setores apenas no hospital selecionado", async () => {
    const { sqls } = configurar({ role: "admin" });
    const res = await caller("admin").resumoGeral({ estabelecimentoId: 10 });
    expect(res.faturamentoPorEstabelecimento.map(h => h.estabelecimentoId)).toEqual([10]);
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(10);
    verificarEscopoQueries(sqls, [10]);
  });

  it("catálogo vazio no lookup de nomes não vira hospital fictício", async () => {
    const { db, sqls } = configurar();
    const executar = db.execute.getMockImplementation()!;
    db.execute.mockImplementation(async (statement: any) => {
      if (dialect.sqlToQuery(statement).sql.includes("FROM estabelecimentos")) return [[], []];
      return executar(statement);
    });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(consultasDados(sqls)).toEqual([]);
  });

  it("perfil em resultado ilegível é negado, não interpretado como ausência", async () => {
    const { db, sqls } = configurar();
    const executar = db.execute.getMockImplementation()!;
    db.execute.mockImplementation(async (statement: any) => {
      if (dialect.sqlToQuery(statement).sql.includes("FROM fabrica_metas")) return undefined as any;
      return executar(statement);
    });
    await expect(caller().resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(consultasDados(sqls)).toEqual([]);
  });

  it("banco indisponível não consulta nem cria fallback", async () => {
    const { db } = configurar({ role: "admin" });
    vi.mocked(dbModule.getDb).mockResolvedValue(null);
    await expect(caller("admin").resumoGeral({ estabelecimentoId: CENTRAL })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("falha em consulta Esteira opcional deixa KPIs vazios, sem tentar outro hospital ou retirar setor", async () => {
    const { sqls } = configurar({ perfilRaw: perfil(), sqlExtra: query => {
      if (query.includes("FROM fabrica_contas fc")) throw new Error("Esteira indisponível");
      return undefined;
    } });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(0);
    expect(res.faturista.conveniosTop).toEqual([]);
    expect(res.faturista.evolucaoMensal).toEqual([]);
    verificarEscopoQueries(sqls, [10], ["faturamento"]);
  });

  it("histórico restrito conta só produção do setor em contas visíveis do mesmo hospital", async () => {
    const eventos = [
      { hospitalId: 10, origem: "faturamento", atual: "faturamento", existe: true },
      { hospitalId: 20, origem: "faturamento", atual: "faturamento", existe: true },
      { hospitalId: 10, origem: "auditoria_interna", atual: "faturamento", existe: true },
      { hospitalId: 10, origem: "faturamento", atual: "auditoria_interna", existe: true },
      { hospitalId: 10, origem: "faturamento", atual: "faturamento", existe: false },
    ];
    const { sqls } = configurar({ perfilRaw: perfil(), sqlExtra: query => {
      if (!query.includes("FROM fabrica_historico_fluxo")) return undefined;
      // Emula o WHERE sobre eventos de contas distintas; cláusula ausente
      // deliberadamente amplia o fixture e faz o teste de total falhar.
      const visiveis = eventos.filter(e =>
        (!query.includes("hospital_estabelecimento_id IN (10)") || e.hospitalId === 10) &&
        (!query.includes("COALESCE(setor_origem, setor_destino) IN ('faturamento')") || e.origem === "faturamento") &&
        (!query.includes("fc.setor_atual IN ('faturamento')") || e.atual === "faturamento") &&
        (!query.includes("AND EXISTS") || e.existe),
      );
      return [{ usuarioId: USER_ID, usuarioNome: "Faturista", contasFaturadas: visiveis.length, totalContasMovimentadas: visiveis.length }];
    } });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.producaoPorColaborador[0].totalContasMovimentadas).toBe(1);
    expect(res.esteiraFaturamento.resumoProducao.etapasHistorico.faturadas).toBe(1);
    verificarEscopoQueries(sqls, [10], ["faturamento"]);
  });

  it("erros restritos contam apenas setor autorizado e conta atualmente visível", async () => {
    const erros = [
      { hospitalId: 10, origem: "auditoria_interna", atual: "auditoria_interna", existe: true },
      { hospitalId: 20, origem: "auditoria_interna", atual: "auditoria_interna", existe: true },
      { hospitalId: 10, origem: "auditoria_externa", atual: "auditoria_interna", existe: true },
      { hospitalId: 10, origem: "auditoria_interna", atual: "faturamento", existe: true },
      { hospitalId: 10, origem: "auditoria_interna", atual: "auditoria_interna", existe: false },
    ];
    const { sqls } = configurar({ perfilRaw: perfil({ setoresPermitidos: ["auditoria_interna"] }), sqlExtra: query => {
      if (!query.includes("FROM fabrica_erros_conta")) return undefined;
      const visiveis = erros.filter(e =>
        (!query.includes("hospital_estabelecimento_id IN (10)") || e.hospitalId === 10) &&
        (!query.includes("setor_origem_erro IN ('auditoria_interna')") || e.origem === "auditoria_interna") &&
        (!query.includes("fc.setor_atual IN ('auditoria_interna')") || e.atual === "auditoria_interna") &&
        (!query.includes("AND EXISTS") || e.existe),
      );
      return [{ totalErros: visiveis.length }];
    } });
    const res = await caller().resumoGeral({ estabelecimentoId: CENTRAL });
    expect(res.esteiraFaturamento.resumoProducao.totalErrosRegistrados).toBe(1);
    verificarEscopoQueries(sqls, [10], ["auditoria_interna"]);
  });
});
