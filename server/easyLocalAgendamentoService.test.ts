import { beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  getRawPool: vi.fn(),
  prever: vi.fn(),
  executar: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./db", () => ({ getRawPool: fns.getRawPool }));
vi.mock("./easyLocalImportacaoService", () => ({
  preverEasyLocalImportacaoAgendada: fns.prever,
  executarEasyLocalImportacaoAgendada: fns.executar,
}));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: fns.create,
  updateHeartbeatJob: fns.update,
  deleteHeartbeatJob: fns.remove,
}));

import {
  __easyLocalAgendamentoInternals,
  executarEasyLocalAgendamentoPorTaskUid,
  retomarEasyLocalAgendamento,
  sessionTokenFromCookie,
} from "./easyLocalAgendamentoService";

type State = {
  taskUid: string;
  id: number;
  creator: number;
  state: "ativo" | "pausado" | "erro" | "incerto" | "preparando";
  executionToken: string | null;
  leaseExpired: boolean;
  lastSlot: string | null;
  creatorAdmin: boolean;
  unitExists: boolean;
  result: unknown;
};

function sourceMap() {
  return {
    id: 7,
    tabelaDestinoId: 5,
    leituraDescricao: JSON.stringify({ marker: "easylocal-direto-v1" }),
    queryOrigem: JSON.stringify({
      estabelecimentoId: 12,
      tabelaId: 5,
      origem: { schema: "public", tabela: "atendimentos" },
      colunaEstabelecimento: "hospital_id",
      valorEstabelecimento: "12",
      campoChave: "codigo",
      dominio: "atendimentos",
      frequenciaDesejada: "15min",
    }),
    ativo: "nao",
    frequenciaMapa: "manual",
    modoImportacao: "incremental",
    tabelaNome: "el_12_atendimentos",
    tabelaDescricao: JSON.stringify({ marker: "easylocal-direto-v1" }),
    criadaNoBanco: "sim",
    conexaoNome: "__EASYLOCAL_SERVER__",
    conexaoDescricao: "easylocal-direto-v1",
    conexaoTipo: "postgresql",
    conexaoAtiva: "nao",
  };
}

function agenda(state: State) {
  return {
    id: state.id,
    leituraId: 7,
    estabelecimentoId: 12,
    criadoPor: state.creator,
    scheduleCronTaskUid: state.taskUid,
    estado: state.state,
    frequencia: "15min",
    horarioBrasilia: null,
    fuso: "America/Sao_Paulo",
    cronUtc: "0 */15 * * * *",
    revisaoAprovada: "a".repeat(64),
    operacaoToken: "operation-token",
    execucaoToken: state.executionToken,
    leaseAte: state.executionToken ? "2026-10-14 18:00:00.000" : null,
    ultimoSlot: state.lastSlot,
    ultimaExecucao: null,
    proximaExecucao: null,
    ultimoResultado: state.result,
    leaseAtiva: 0,
    leaseExpirada: state.leaseExpired ? 1 : 0,
  };
}

function fakePool(state: State) {
  const execute = vi.fn(async (statement: string, params: any[] = []) => {
    if (statement.includes("FROM users")) {
      return [state.creatorAdmin ? [{ id: state.creator, role: "admin" }] : [], []];
    }
    if (statement.includes("FROM estabelecimentos")) return [state.unitExists ? [{ id: 12 }] : [], []];
    if (statement.includes("FROM integracao_mapeamentos")) return [[sourceMap()], []];
    if (statement.includes("FROM integracao_easylocal_agendamentos") && statement.includes("WHERE schedule_cron_task_uid = ?")) {
      return [state.taskUid === params[0] ? [agenda(state)] : [], []];
    }
    if (statement.includes("FROM integracao_easylocal_agendamentos") && statement.includes("WHERE id = ?")) {
      return [[agenda(state)], []];
    }
    if (statement.startsWith("UPDATE integracao_easylocal_agendamentos")) {
      if (statement.includes("execucao_token = ?, lease_ate")) {
        state.executionToken = String(params[0]);
        state.lastSlot = String(params[1]);
      } else if (statement.includes("estado = 'pausado'")) {
        state.state = "pausado";
        state.executionToken = null;
      } else if (statement.includes("estado = 'incerto'")) {
        state.state = "incerto";
        state.executionToken = null;
      } else if (statement.includes("estado = 'erro'")) {
        state.state = "erro";
        state.executionToken = null;
      } else if (statement.includes("execucao_token = NULL")) {
        state.executionToken = null;
      }
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`unexpected SQL in test: ${statement.slice(0, 45)}`);
  });
  const connection = {
    query: vi.fn(async () => [[{ versao: "8.0.36" }], []]),
    execute,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
  };
  return { getConnection: vi.fn(async () => connection), connection, execute };
}

describe("easyLocalAgendamentoService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fns.executar.mockResolvedValue({
      sucesso: true,
      registrosLidos: 4,
      registrosInseridos: 1,
      registrosAtualizados: 2,
      registrosInalterados: 1,
    });
  });

  it("usa slot UTC idempotente: duas chamadas do mesmo task UID só importam uma vez", async () => {
    const state: State = {
      taskUid: "task-real", id: 10, creator: 44, state: "ativo", executionToken: null,
      leaseExpired: false, lastSlot: null, creatorAdmin: true, unitExists: true, result: null,
    };
    const pool = fakePool(state);
    fns.getRawPool.mockResolvedValue(pool);
    const now = new Date("2026-10-14T15:07:12.000Z");
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-real", now)).resolves.toMatchObject({
      status: "executado",
      counts: { registrosLidos: 4 },
    });
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-real", now)).resolves.toEqual({ status: "ignorado" });
    expect(fns.executar).toHaveBeenCalledTimes(1);
    expect(fns.executar).toHaveBeenCalledWith({ leituraId: 7, estabelecimentoId: 12 }, 44, "a".repeat(64));
  });

  it("não rouba lease expirado: marca incerto e não reimporta", async () => {
    const state: State = {
      taskUid: "task-lease", id: 11, creator: 44, state: "ativo", executionToken: "old-token",
      leaseExpired: true, lastSlot: null, creatorAdmin: true, unitExists: true, result: null,
    };
    fns.getRawPool.mockResolvedValue(fakePool(state));
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-lease", new Date("2026-10-14T15:15:00Z")))
      .resolves.toEqual({ status: "incerto" });
    expect(state.state).toBe("incerto");
    expect(fns.executar).not.toHaveBeenCalled();
  });

  it("pausa logicamente quando o criador foi revogado e não chama o importador", async () => {
    const state: State = {
      taskUid: "task-revoked", id: 12, creator: 44, state: "ativo", executionToken: null,
      leaseExpired: false, lastSlot: null, creatorAdmin: false, unitExists: true, result: null,
    };
    fns.getRawPool.mockResolvedValue(fakePool(state));
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-revoked", new Date("2026-10-14T15:15:00Z")))
      .resolves.toEqual({ status: "bloqueado" });
    expect(state.state).toBe("pausado");
    expect(fns.executar).not.toHaveBeenCalled();
  });

  it("bloqueia callback quando a unidade do administrador global não existe", async () => {
    const state: State = {
      taskUid: "task-missing-unit", id: 14, creator: 44, state: "ativo", executionToken: null,
      leaseExpired: false, lastSlot: null, creatorAdmin: true, unitExists: false, result: null,
    };
    fns.getRawPool.mockResolvedValue(fakePool(state));
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-missing-unit", new Date("2026-10-14T15:15:00Z")))
      .resolves.toEqual({ status: "bloqueado" });
    expect(state.state).toBe("pausado");
    expect(fns.executar).not.toHaveBeenCalled();
  });

  it("converte resultado desconhecido do importador em incerto e nunca o repete", async () => {
    const state: State = {
      taskUid: "task-unknown", id: 13, creator: 44, state: "ativo", executionToken: null,
      leaseExpired: false, lastSlot: null, creatorAdmin: true, unitExists: true, result: null,
    };
    fns.getRawPool.mockResolvedValue(fakePool(state));
    fns.executar.mockRejectedValue(new Error("commit may have succeeded at remote host"));
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-unknown", new Date("2026-10-14T15:30:00Z")))
      .resolves.toEqual({ status: "incerto" });
    expect(state.state).toBe("incerto");
    await expect(executarEasyLocalAgendamentoPorTaskUid("task-unknown", new Date("2026-10-14T15:30:00Z")))
      .resolves.toEqual({ status: "ignorado" });
    expect(fns.executar).toHaveBeenCalledTimes(1);
  });

  it("marca incerto e bloqueia nova retomada se o commit local falha após enable=true", async () => {
    const state: State = {
      taskUid: "task-resume", id: 15, creator: 44, state: "pausado", executionToken: null,
      leaseExpired: false, lastSlot: null, creatorAdmin: true, unitExists: true, result: null,
    };
    const pool = fakePool(state);
    let commits = 0;
    pool.connection.commit.mockImplementation(async () => {
      commits += 1;
      if (commits === 2) throw new Error("commit acknowledgement lost");
    });
    fns.getRawPool.mockResolvedValue(pool);
    fns.prever.mockResolvedValue({
      revisao: "a".repeat(64), limite: 10,
      registrosLidos: 0, registrosInseridos: 0, registrosAtualizados: 0, registrosInalterados: 0,
    });
    fns.update.mockResolvedValue({ nextExecutionAt: "2026-10-14T15:30:00.000Z" });

    await expect(retomarEasyLocalAgendamento({ agendamentoId: 15, estabelecimentoId: 12 }, 44, "session"))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fns.update).toHaveBeenCalledWith(
      "task-resume",
      expect.objectContaining({ enable: true }),
      "session"
    );
    expect(state.state).toBe("incerto");

    await expect(retomarEasyLocalAgendamento({ agendamentoId: 15, estabelecimentoId: 12 }, 44, "session"))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(fns.update).toHaveBeenCalledTimes(1);
  });

  it("calcula cron/slots com fuso Brasília e separa limites de mês", () => {
    expect(__easyLocalAgendamentoInternals.cronUtcParaAgenda({ frequencia: "15min" })).toBe("0 */15 * * * *");
    expect(__easyLocalAgendamentoInternals.cronUtcParaAgenda({ frequencia: "diario", horarioBrasilia: "03:00" })).toMatch(/^0 0 6 /);
    const daily = { frequencia: "diario" as const, horarioBrasilia: "03:00" };
    expect(__easyLocalAgendamentoInternals.slotAgendamento(daily, new Date("2026-01-31T06:00:00Z"))).toBe("2026-01-31");
    expect(__easyLocalAgendamentoInternals.slotAgendamento(daily, new Date("2026-02-01T06:00:00Z"))).toBe("2026-02-01");
  });

  it("extrai apenas o app_session_id decodificado do header proxy", () => {
    expect(sessionTokenFromCookie("proxy=x; app_session_id=eyJhbGci%2Eabc%3D%3D; ignored=y")).toBe("eyJhbGci.abc==");
  });
});
