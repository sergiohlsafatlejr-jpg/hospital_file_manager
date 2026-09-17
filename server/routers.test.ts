import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getConvenios: vi.fn().mockResolvedValue([
    { id: 1, nome: "Unimed", codigo: "001", ativo: "sim", createdAt: new Date(), updatedAt: new Date() },
    { id: 2, nome: "Bradesco Saúde", codigo: "002", ativo: "sim", createdAt: new Date(), updatedAt: new Date() },
  ]),
  getConvenioById: vi.fn().mockResolvedValue({
    id: 1, nome: "Unimed", codigo: "001", ativo: "sim", createdAt: new Date(), updatedAt: new Date()
  }),
  createConvenio: vi.fn().mockResolvedValue({ id: 3 }),
  updateConvenio: vi.fn().mockResolvedValue(undefined),
  getArquivos: vi.fn().mockResolvedValue([]),
  getArquivoById: vi.fn().mockResolvedValue(null),
  getArquivosStats: vi.fn().mockResolvedValue({
    total: 10,
    enviados: 5,
    retornados: 5,
    pendentes: 2,
    processados: 7,
    erros: 1,
  }),
  getComparacoes: vi.fn().mockResolvedValue([]),
  getComparacaoById: vi.fn().mockResolvedValue(null),
  getComparacoesStats: vi.fn().mockResolvedValue({
    total: 5,
    concluidas: 4,
    pendentes: 1,
    comDivergencias: 2,
  }),
  getCodigosProcedimentos: vi.fn().mockResolvedValue([]),
  getCamposComparacao: vi.fn().mockResolvedValue([]),
  getItensManuals: vi.fn().mockResolvedValue([]),
  deleteArquivo: vi.fn().mockResolvedValue({ success: true }),
  deleteProcedimentosByArquivoId: vi.fn().mockResolvedValue({ success: true }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    emailCanonical: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    passwordHash: "hash-nao-deve-ser-exposto",
    sessionVersion: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("returns user data for authenticated users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test User");
    expect(result?.email).toBe("test@example.com");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("emailCanonical");
    expect(result).not.toHaveProperty("sessionVersion");
  });
});

describe("convenios.list", () => {
  it("returns list of convenios for authenticated users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.convenios.list({});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].nome).toBe("Unimed");
  });

  it("throws for unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.convenios.list({})).rejects.toThrow();
  });
});

describe("convenios.get", () => {
  it("returns convenio by id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.convenios.get({ id: 1 });

    expect(result).not.toBeNull();
    expect(result?.nome).toBe("Unimed");
  });
});

describe("convenios.create", () => {
  it("creates a new convenio", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.convenios.create({
      nome: "Novo Convênio",
      codigo: "003",
    });

    expect(result).toHaveProperty("id");
    expect(result.id).toBe(3);
  });
});

describe("arquivos.stats", () => {
  it("returns arquivo statistics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.arquivos.stats();

    expect(result).not.toBeNull();
    expect(result?.total).toBe(10);
    expect(result?.enviados).toBe(5);
    expect(result?.retornados).toBe(5);
  });
});

describe("comparacoes.stats", () => {
  it("returns comparacao statistics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.comparacoes.stats();

    expect(result).not.toBeNull();
    expect(result?.total).toBe(5);
    expect(result?.concluidas).toBe(4);
    expect(result?.comDivergencias).toBe(2);
  });
});

describe("dashboard.resumo", () => {
  it("returns dashboard summary", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.resumo();

    expect(result).toHaveProperty("arquivos");
    expect(result).toHaveProperty("comparacoes");
    expect(result.arquivos?.total).toBe(10);
    expect(result.comparacoes?.total).toBe(5);
  });
});

describe("arquivos.delete", () => {
  it("throws for unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.arquivos.delete({ id: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when arquivo does not exist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // getArquivoById is mocked to return null by default
    await expect(caller.arquivos.delete({ id: 999 })).rejects.toThrow("Arquivo não encontrado");
  });
});
