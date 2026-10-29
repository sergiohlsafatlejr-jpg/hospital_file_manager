import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
  resolverHospitaisAutorizados: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));

vi.mock("./hospitalScope", () => ({
  ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001,
  exigirHospitalProprietario: mocks.exigirHospitalProprietario,
  resolverHospitaisAutorizados: mocks.resolverHospitaisAutorizados,
}));

import { contasConvenioRouter } from "./routers/contasConvenioRouter";

const CENTRAL = 2160001;
const HOSPITAL_AUTORIZADO = 101;
const HOSPITAL_ALHEIO = 202;
const dialect = new MySqlDialect();

function contexto() {
  return {
    user: {
      id: 44,
      role: "user" as const,
      name: "Auditor de teste",
      openId: "auditor-teste",
      email: "auditor@example.test",
      loginMethod: "password",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

function queryResult(result: unknown, whereCalls: unknown[]) {
  const query: any = {
    from: vi.fn(() => query),
    where: vi.fn((condition) => {
      whereCalls.push(condition);
      return query;
    }),
    orderBy: vi.fn(() => query),
    limit: vi.fn(() => query),
    offset: vi.fn(() => query),
    groupBy: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function mockDb(selectResults: unknown[] = [], executeResults: unknown[] = []) {
  const whereCalls: unknown[] = [];
  const updateWhereCalls: unknown[] = [];
  const insertValues = vi.fn().mockResolvedValue([{ insertId: 1 }]);
  const db = {
    execute: vi.fn().mockImplementation(() => Promise.resolve(executeResults.shift() ?? [[]])),
    select: vi.fn(() => queryResult(selectResults.shift() ?? [], whereCalls)),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((condition) => {
          updateWhereCalls.push(condition);
          return Promise.resolve([]);
        }),
      })),
    })),
    insert: vi.fn(() => ({ values: insertValues })),
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, whereCalls, updateWhereCalls, insertValues };
}

function caller() {
  return contasConvenioRouter.createCaller(contexto());
}

describe("contas de convênio: escopo hospitalar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exigirHospitalProprietario.mockResolvedValue(undefined);
    mocks.resolverHospitaisAutorizados.mockResolvedValue([HOSPITAL_AUTORIZADO]);
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_userId, estabelecimentoId, acao) =>
      estabelecimentoId === HOSPITAL_AUTORIZADO && acao === "visualizar",
    );
  });

  it("nega feedback para padrão de outro hospital antes de qualquer escrita", async () => {
    const { db, insertValues } = mockDb([
      [{ estabelecimentoId: HOSPITAL_ALHEIO, status: "ativo", isGabarito: 0 }],
    ]);

    await expect(caller().registrarFeedback({
      numeroConta: "CONTA-1",
      estabelecimentoId: HOSPITAL_AUTORIZADO,
      padraoId: 77,
      tipoDivergencia: "COMPOSICAO",
      acao: "rejeitar",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44 }), HOSPITAL_AUTORIZADO, "editar",
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("registra feedback informativo, mas não altera padrão central sem gerenciar explícito", async () => {
    const { db, insertValues } = mockDb([
      [{ estabelecimentoId: CENTRAL, status: "ativo", isGabarito: 0 }],
    ]);

    await expect(caller().registrarFeedback({
      numeroConta: "CONTA-2",
      estabelecimentoId: HOSPITAL_AUTORIZADO,
      padraoId: 88,
      tipoDivergencia: "PRECO",
      acao: "rejeitar",
    })).resolves.toEqual({ success: true });

    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(44, CENTRAL, "gerenciar");
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("calcula outliers somente para o hospital proprietário e convênio da conta", async () => {
    const { db } = mockDb([
      [{
        id: 1,
        numeroConta: "CONTA-3",
        estabelecimentoId: HOSPITAL_AUTORIZADO,
        convenio: "UNIMED",
        competencia: "2026/10",
        valorTotal: "100.00",
      }],
      [{ count: 1 }],
      [{ valorTotal: "100.00", valorPrestadorProprio: "100.00" }],
      [{
        estabelecimentoId: HOSPITAL_AUTORIZADO,
        numeroConta: "CONTA-3",
        competencia: "2026/10",
        totalItens: 1,
        valorTotal: "100.00",
      }],
      [{ totalContas: 1, valorTotal: "100.00", totalDivergentes: 0, totalConformes: 0, totalPendentes: 1 }],
      [],
    ], [
      [[{ media: "100.00", desvio: "10.00" }]],
    ]);

    await expect(caller().listarContas({
      estabelecimentoId: HOSPITAL_AUTORIZADO,
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({ total: 1 });

    expect(db.execute).toHaveBeenCalledTimes(1);
    const outlierSql = dialect.sqlToQuery(db.execute.mock.calls[0][0]);
    expect(outlierSql.sql).toContain("WHERE convenio = ?");
    expect(outlierSql.sql).toContain("AND estabelecimentoId = ?");
    expect(outlierSql.params).toEqual(["UNIMED", HOSPITAL_AUTORIZADO]);
    expect(outlierSql.params).not.toContain(HOSPITAL_ALHEIO);
  });
});
