import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  verificarPermissao: vi.fn(),
  resolverHospitaisAutorizados: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  verificarPermissaoEstabelecimento: mocks.verificarPermissao,
}));
vi.mock("./hospitalScope", () => ({
  resolverHospitaisAutorizados: mocks.resolverHospitaisAutorizados,
  exigirHospitalProprietario: mocks.exigirHospitalProprietario,
}));

import { padroesCobrancaRouter } from "./routers/padroesCobrancaRouter";

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
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function mockDb(selectResults: unknown[] = []) {
  const whereCalls: unknown[] = [];
  const updateWhereCalls: unknown[] = [];
  const db = {
    execute: vi.fn().mockResolvedValue([[]]),
    select: vi.fn(() => queryResult(selectResults.shift() ?? [], whereCalls)),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((condition) => {
          updateWhereCalls.push(condition);
          return Promise.resolve([]);
        }),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, whereCalls, updateWhereCalls };
}

function caller() {
  return padroesCobrancaRouter.createCaller(contexto());
}

describe("padrões de cobrança: escopo hospitalar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissao.mockResolvedValue(true);
    mocks.resolverHospitaisAutorizados.mockResolvedValue([HOSPITAL_AUTORIZADO]);
    mocks.exigirHospitalProprietario.mockResolvedValue(undefined);
  });

  it("não executa consulta quando o escopo de leitura é negado", async () => {
    const { db } = mockDb();
    mocks.resolverHospitaisAutorizados.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Sem acesso ao hospital" }),
    );

    await expect(caller().listarConvenios({ estabelecimentoId: HOSPITAL_AUTORIZADO }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.resolverHospitaisAutorizados).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44 }), HOSPITAL_AUTORIZADO, "visualizar",
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("consulta central usa somente a lista finita autorizada, nunca o bypass central", async () => {
    const { whereCalls } = mockDb([[], [{ total: 0 }]]);
    mocks.resolverHospitaisAutorizados.mockResolvedValue([HOSPITAL_AUTORIZADO]);

    await expect(caller().consultarPadroesPreco({ estabelecimentoId: CENTRAL }))
      .resolves.toMatchObject({ items: [], total: 0 });

    expect(mocks.resolverHospitaisAutorizados).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44 }), CENTRAL, "visualizar",
    );
    expect(whereCalls).toHaveLength(2);
    for (const condition of whereCalls) {
      const compiled = dialect.sqlToQuery(condition as any);
      expect(compiled.sql).toContain("estabelecimentoId");
      expect(compiled.params).toEqual([HOSPITAL_AUTORIZADO]);
      expect(compiled.params).not.toContain(CENTRAL);
    }
  });

  it("não expõe padrão por ID de outro hospital ao visualizador", async () => {
    const { db } = mockDb([[{ id: 77, estabelecimentoId: HOSPITAL_ALHEIO }]]);
    mocks.exigirHospitalProprietario.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Fora do escopo" }),
    );

    await expect(caller().getPadraoDetalhes({ id: 77 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44 }), HOSPITAL_ALHEIO, "visualizar",
    );
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("não permite que um visualizador valide um padrão, mesmo conhecendo seu ID", async () => {
    const { db } = mockDb([[{ estabelecimentoId: HOSPITAL_AUTORIZADO }]]);
    mocks.exigirHospitalProprietario.mockImplementation(async (_user, _hospitalId, acao) => {
      if (acao === "editar") throw new TRPCError({ code: "FORBIDDEN", message: "Somente leitura" });
    });

    await expect(caller().validarPadrao({ id: 55, acao: "aprovar" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44 }), HOSPITAL_AUTORIZADO, "editar",
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("bloqueia padrão sem proprietário em vez de convertê-lo em regra global", async () => {
    const { db } = mockDb([[{ estabelecimentoId: null }]]);
    await expect(caller().validarPadrao({ id: 55, acao: "aprovar" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.exigirHospitalProprietario).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("fixa a atualização por ID no hospital proprietário para impedir troca de escopo", async () => {
    const { updateWhereCalls } = mockDb([[{ estabelecimentoId: HOSPITAL_AUTORIZADO }]]);

    await expect(caller().validarPadrao({ id: 56, acao: "aprovar" }))
      .resolves.toMatchObject({ success: true, novoStatus: "ativo" });

    expect(updateWhereCalls).toHaveLength(1);
    const compiled = dialect.sqlToQuery(updateWhereCalls[0] as any);
    expect(compiled.sql).toContain("estabelecimentoId");
    expect(compiled.params).toEqual([56, HOSPITAL_AUTORIZADO]);
  });

  it("não permite que feedback reassocie um padrão de outro hospital pelo estabelecimento informado", async () => {
    const { db } = mockDb([[{ estabelecimentoId: HOSPITAL_ALHEIO, confianca: 50 }]]);

    await expect(caller().registrarFeedback({
      numeroConta: "conta-1",
      estabelecimentoId: HOSPITAL_AUTORIZADO,
      padraoId: 88,
      tipoDivergencia: "COMPOSICAO",
      decisao: "aceitar",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.exigirHospitalProprietario).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ id: 44 }), HOSPITAL_AUTORIZADO, "editar",
    );
    expect(mocks.exigirHospitalProprietario).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ id: 44 }), HOSPITAL_ALHEIO, "editar",
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
