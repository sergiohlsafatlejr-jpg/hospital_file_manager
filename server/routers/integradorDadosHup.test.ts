import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), update: vi.fn(), delete: vi.fn(), conectar: vi.fn(),
  verificarPermissao: vi.fn(), updateJobSchedule: vi.fn(),
}));
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ select: mocks.select, update: mocks.update, delete: mocks.delete })),
  verificarPermissaoEstabelecimento: mocks.verificarPermissao,
}));
vi.mock("../_core/jobScheduler", () => ({ updateJobSchedule: mocks.updateJobSchedule }));
vi.mock("../connectors/EasyVisionConnector", () => ({
  EasyVisionConnector: class { conectar = mocks.conectar; },
}));
vi.mock("../connectors/WarleineConnector", () => ({
  WarleineConnector: class { conectar = mocks.conectar; },
}));

import { integradorDadosRouter } from "./integradorDadosRouter";

const config = {
  id: 2, estabelecimentoId: 1260036, sistema: "warleine", tipoDados: "atendimentos",
  ativo: true, frequencia: "1x_dia", querySql: "SELECT 1", descricao: "sintética",
};
const ctxAdmin = { user: { id: 1, role: "admin" } } as any;
const ctxUnidade = { user: { id: 5, role: "user" } } as any;
function responderConfig(valor = config) {
  mocks.select.mockImplementation(() => ({ from: () => ({
    where: () => Object.assign(Promise.resolve([valor]), { limit: async () => [valor] }),
  }) }));
}

describe("corte do integrador legado HUP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responderConfig();
    mocks.verificarPermissao.mockResolvedValue(false);
  });

  it("recusa reativar config #2 mesmo se a flag já estiver ativa", async () => {
    const resultado = await integradorDadosRouter.createCaller(ctxAdmin).atualizarAgendamento({
      configId: 2, frequencia: "1x_dia", ativo: true,
    });
    expect(resultado.sucesso).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateJobSchedule).not.toHaveBeenCalled();
  });

  it("recusa criar e agendar configuração HUP com tipo/sistema alternativos", async () => {
    const caller = integradorDadosRouter.createCaller(ctxAdmin);
    const criado = await caller.salvarConfiguracao({ estabelecimentoId: 1260036,
      sistema: "tasy", tipoDados: "faturamento", querySql: "SELECT 1", frequencia: "1x_dia" });
    expect(criado).toMatchObject({ sucesso: false, configId: null });
    responderConfig({ ...config, id: 9, sistema: "tasy", tipoDados: "faturamento" });
    const agendado = await caller.atualizarAgendamento({ configId: 9, ativo: true, frequencia: "1x_dia" });
    expect(agendado).toMatchObject({ sucesso: false });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateJobSchedule).not.toHaveBeenCalled();
  });

  it("recusa sincronizar, transformar e limpar a configuração antiga", async () => {
    const caller = integradorDadosRouter.createCaller(ctxAdmin);
    expect(await caller.sincronizar({ configId: 2 })).toMatchObject({ sucesso: false,
      mensagem: expect.stringContaining("transição Hop") });
    expect(await caller.transformarParaAtendimentos({ configId: 2 })).toMatchObject({ sucesso: false,
      mensagem: expect.stringContaining("transicao Hop") });
    expect(await caller.limparSincronizacao({ configId: 2 })).toMatchObject({ sucesso: false,
      mensagem: expect.stringContaining("Hop") });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.conectar).not.toHaveBeenCalled();
  });

  it("recusa configuração de outra unidade antes de conectar", async () => {
    const resultado = await integradorDadosRouter.createCaller(ctxUnidade).sincronizar({ configId: 2 });
    expect(resultado).toMatchObject({ sucesso: false, mensagem: "Acesso negado" });
    expect(mocks.conectar).not.toHaveBeenCalled();
  });

  it("não expõe configuração e query de outra unidade na listagem", async () => {
    const propria = { ...config, id: 3, estabelecimentoId: 999, querySql: "SELECT proprio" };
    mocks.verificarPermissao.mockImplementation(async (_usuario: number, estabelecimento: number) => estabelecimento === 999);
    mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [config, propria] }) }));
    const resultado = await integradorDadosRouter.createCaller(ctxUnidade)
      .listarConfiguracoes({ estabelecimentoId: 999 });
    expect(resultado.total).toBe(1);
    expect(resultado.configuracoes).toEqual([expect.objectContaining({ id: 3, estabelecimentoId: 999 })]);
  });

  it("recusa ambas as importações EASYVISION para HUP antes de conectar", async () => {
    const caller = integradorDadosRouter.createCaller(ctxAdmin);
    expect((await caller.sincronizarAtendimentosSemConta({ estabelecimentoId: 1260036 })).sucesso).toBe(false);
    expect((await caller.sincronizarAtendimentosAFaturar({ estabelecimentoId: 1260036 })).sucesso).toBe(false);
    expect(mocks.conectar).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
