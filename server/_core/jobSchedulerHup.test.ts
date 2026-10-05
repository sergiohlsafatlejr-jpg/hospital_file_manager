import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  callback: null as null | (() => Promise<void>),
  stop: vi.fn(),
  select: vi.fn(),
  query: vi.fn(),
  conectar: vi.fn(),
  executarQuery: vi.fn(),
  desconectar: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn((_expr, callback) => {
    mock.callback = callback;
    return { stop: mock.stop };
  }) },
}));
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ select: mock.select, delete: mock.delete })),
  getRawPool: vi.fn(),
}));
vi.mock("../connectors/WarleineConnector", () => ({
  WarleineConnector: class {
    conectar = mock.conectar;
    executarQuery = mock.executarQuery;
    desconectar = mock.desconectar;
  },
}));

import { updateJobSchedule, stopAllJobs } from "./jobScheduler";
import { ehIntegracaoLegadaHup } from "../hupLegacyCutover";

const config = {
  id: 2, ativo: false, estabelecimentoId: 1260036, sistema: 'warleine', tipoDados: 'atendimentos',
  conexaoConfig: JSON.stringify({ host: "localhost", port: 5432, database: "test", user: "test", password: "test" }),
  querySql: "SELECT 1",
};

function responderSelect(...respostas: unknown[][]) {
  let i = 0;
  mock.select.mockImplementation(() => ({ from: () => ({ where: () => ({
    then: (resolve: (rows: unknown[]) => unknown) => resolve(respostas[i++] ?? []),
    limit: async () => respostas[i++] ?? [],
  }) }) }));
}

describe("job legado do HUP desativado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.callback = null;
  });
  afterEach(() => stopAllJobs());

  it("recusa a configuração HUP mesmo reativada e preserva outros estabelecimentos", async () => {
    responderSelect([{ ...config, ativo: true, sistema: 'warleine', tipoDados: 'atendimentos' }]);
    await updateJobSchedule(2, "1x_dia", true);
    await mock.callback!();
    expect(mock.conectar).not.toHaveBeenCalled();
    expect(mock.delete).not.toHaveBeenCalled();
    expect(ehIntegracaoLegadaHup({ estabelecimentoId: 999 })).toBe(false);
  });

  it("não aceita HUP disfarçado como outra classificação no scheduler", async () => {
    responderSelect([{ ...config, id: 9, ativo: true, sistema: 'tasy', tipoDados: 'faturamento' }]);
    await updateJobSchedule(9, "1x_dia", true);
    await mock.callback!();
    expect(mock.conectar).not.toHaveBeenCalled();
    expect(mock.delete).not.toHaveBeenCalled();
  });

  it("não extrai nem escreve se a configuração foi desativada desde o agendamento", async () => {
    responderSelect([config]);
    await updateJobSchedule(2, "1x_dia", true);
    expect(mock.callback).not.toBeNull();
    await mock.callback!();
    expect(mock.conectar).not.toHaveBeenCalled();
    expect(mock.delete).not.toHaveBeenCalled();
    expect(mock.stop).toHaveBeenCalled();
  });

  it("não escreve se a configuração for desativada durante a extração", async () => {
    responderSelect([{ ...config, id: 3, estabelecimentoId: 999, ativo: true }], [{ ativo: false }]);
    mock.conectar.mockResolvedValue(true);
    mock.executarQuery.mockResolvedValue([{ numatend: "sintetico" }]);
    await updateJobSchedule(2, "1x_dia", true);
    await mock.callback!();
    expect(mock.executarQuery).toHaveBeenCalledOnce();
    expect(mock.desconectar).toHaveBeenCalledOnce();
    expect(mock.delete).not.toHaveBeenCalled();
    expect(mock.stop).toHaveBeenCalled();
  });

  it("não grava staging se a configuração muda para a unidade HUP durante a extração", async () => {
    responderSelect([{ ...config, id: 3, estabelecimentoId: 999, ativo: true }],
      [{ ativo: true, estabelecimentoId: 1260036 }]);
    mock.conectar.mockResolvedValue(true);
    mock.executarQuery.mockResolvedValue([{ numatend: "sintetico" }]);
    await updateJobSchedule(3, "1x_dia", true);
    await mock.callback!();
    expect(mock.executarQuery).toHaveBeenCalledOnce();
    expect(mock.delete).not.toHaveBeenCalled();
    expect(mock.stop).toHaveBeenCalled();
  });
});
