import { beforeEach, describe, expect, it, vi } from "vitest";
const fns = vi.hoisted(() => ({
  criar: vi.fn(),
  tabelas: vi.fn(),
  leituras: vi.fn(),
  salvar: vi.fn(),
  origens: vi.fn(),
  campos: vi.fn(),
  db: vi.fn(),
  stagings: vi.fn(),
  vincularStaging: vi.fn(),
}));
vi.mock("./easyLocalIntegradorService", () => ({
  criarEasyLocalTabela: fns.criar,
  listarEasyLocalTabelas: fns.tabelas,
  listarEasyLocalLeituras: fns.leituras,
  salvarEasyLocalLeitura: fns.salvar,
}));
vi.mock("./easyLocalMetadata", () => ({
  listarEasyLocalOrigens: fns.origens,
  detectarEasyLocalCampos: fns.campos,
}));
vi.mock("./db", () => ({ getDb: fns.db }));
vi.mock("./easyLocalStagingsService", () => ({
  listarEasyLocalStagingsExistentes: fns.stagings,
  salvarEasyLocalLeituraStaging: fns.vincularStaging,
}));
import { easyLocalIntegradorRouter } from "./routers/easyLocalIntegradorRouter";
function ctx(role: "admin" | "user" | null): any {
  return {
    user: role ? { id: 7, role, openId: "teste" } : null,
    req: { headers: {} },
    res: {},
  };
}
const novo = {
  estabelecimentoId: 12,
  nome: "teste",
  nomeExibicao: "Tabela teste",
  colunas: [{ nome: "codigo", tipo: "int", obrigatorio: true }],
  confirmarCriacao: true,
};
const vinculo = {
  estabelecimentoId: 1260036,
  nomeStaging: "stagion_atendimentos_parados_urologico",
  origem: { schema: "raw_geral", tabela: "hup_atendimentos_parados" },
  colunaEstabelecimento: "estabelecimentos_id",
  valorEstabelecimento: "UNIDADE_FICTICIA",
  dominio: "atendimentos",
  frequenciaDesejada: "manual",
  confirmarVinculo: true,
} as const;
describe("autorização do integrador EASYLocal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fns.tabelas.mockResolvedValue([]);
    fns.criar.mockResolvedValue({ sucesso: true, tabelaId: 1 });
  });
  it.each(["user", null] as const)(
    "nega papel %s antes de consultar ou criar",
    async role => {
      const caller = easyLocalIntegradorRouter.createCaller(ctx(role));
      for (const op of [
        () => caller.listarTabelas({ estabelecimentoId: 12 }),
        () => caller.criarTabela(novo as any),
        () => caller.listarOrigens({ estabelecimentoId: 12 }),
        () => caller.listarLeituras({ estabelecimentoId: 12 }),
        () => caller.listarStagingsExistentes({ estabelecimentoId: 1260036 }),
        () => caller.salvarLeituraStaging(vinculo),
      ])
        await expect(op()).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const f of Object.values(fns)) expect(f).not.toHaveBeenCalled();
    }
  );
  it("admin só envia payload de criação estrito e identidade do servidor", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    await caller.criarTabela(novo as any);
    expect(fns.criar).toHaveBeenCalledWith(novo, 7);
    for (const input of [
      { ...novo, querySql: "SELECT segredo" },
      { ...novo, host: "externo.invalid" },
      { ...novo, nomeFisico: "atendimentos_unificados" },
      { ...novo, usuarioId: 9 },
    ])
      await expect(caller.criarTabela(input as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    expect(fns.criar).toHaveBeenCalledOnce();
  });
  it("rejeita ausência de unidade, zero e tipos não inteiros", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    for (const input of [
      {},
      { estabelecimentoId: 0 },
      { estabelecimentoId: 1.1 },
      { estabelecimentoId: "12" },
    ])
      await expect(caller.listarTabelas(input as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    expect(fns.tabelas).not.toHaveBeenCalled();
  });
  it("vínculo de staging recebe identidade do servidor e rejeita tabela final, SQL e liberação forjada", async () => {
    const caller = easyLocalIntegradorRouter.createCaller(ctx("admin"));
    await caller.salvarLeituraStaging(vinculo);
    expect(fns.vincularStaging).toHaveBeenCalledWith(vinculo, 7);
    for (const input of [
      { ...vinculo, nomeStaging: "atendimentos_unificados" },
      { ...vinculo, nomeStaging: "tabela_arbitraria" },
      { ...vinculo, usuarioId: 99 },
      { ...vinculo, querySql: "SELECT exemplo" },
      { ...vinculo, execucaoLiberada: true },
      { ...vinculo, confirmarVinculo: false },
    ])
      await expect(
        caller.salvarLeituraStaging(input as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fns.vincularStaging).toHaveBeenCalledOnce();
  });
  it("sanitiza falha do catálogo de staging sem devolver dados do driver", async () => {
    fns.stagings.mockRejectedValue(new Error("SEGREDO_FICTICIO_DRIVER"));
    await expect(
      easyLocalIntegradorRouter
        .createCaller(ctx("admin"))
        .listarStagingsExistentes({ estabelecimentoId: 1260036 })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringContaining("SEGREDO_FICTICIO_DRIVER"),
    });
  });
  it("não divulga driver nem endpoint em erros não tratados", async () => {
    fns.tabelas.mockRejectedValue(
      new Error("host_sensivel senha erro clinico")
    );
    await expect(
      easyLocalIntegradorRouter
        .createCaller(ctx("admin"))
        .listarTabelas({ estabelecimentoId: 12 })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.not.stringMatching(/host_sensivel|senha|clinico/),
    });
  });
});
