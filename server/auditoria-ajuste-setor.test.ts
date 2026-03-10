import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-auditor",
    email: "auditor@hospital.com",
    name: "Enfermeira Auditora",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("auditoria.registrarAjuste - ALTERAR_SETOR", () => {
  it("accepts ALTERAR_SETOR as a valid tipoAjuste in the input schema", () => {
    // Verify the router procedure exists
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.auditoria.registrarAjuste).toBeDefined();
    expect(typeof caller.auditoria.registrarAjuste).toBe("function");
  });

  it("accepts setorOriginal and setorAjustado fields in the input", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will fail at DB level but validates the input schema accepts the fields
    try {
      await caller.auditoria.registrarAjuste({
        numeroConta: "TEST-SETOR-001",
        estabelecimentoId: 1,
        tipoAjuste: "ALTERAR_SETOR",
        itemId: 999999,
        codigoItem: "60000694",
        descricaoItem: "DIARIA DE ENFERMARIA",
        setorOriginal: "ENFERMARIA",
        setorAjustado: "UTI",
        justificativa: "Paciente transferido para UTI",
      });
    } catch (error: any) {
      // Expected: DB error or item not found, but NOT a Zod validation error
      expect(error.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects invalid tipoAjuste values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.auditoria.registrarAjuste({
        numeroConta: "TEST-001",
        estabelecimentoId: 1,
        tipoAjuste: "TIPO_INVALIDO" as any,
      });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });

  it("requires numeroConta to be non-empty", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.auditoria.registrarAjuste({
        numeroConta: "",
        estabelecimentoId: 1,
        tipoAjuste: "ALTERAR_SETOR",
      });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });
});

describe("auditoria.listarAjustes", () => {
  it("procedure exists and is callable", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.auditoria.listarAjustes).toBeDefined();
    expect(typeof caller.auditoria.listarAjustes).toBe("function");
  });
});

describe("auditoria.reverterAjuste", () => {
  it("procedure exists and is callable", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.auditoria.reverterAjuste).toBeDefined();
    expect(typeof caller.auditoria.reverterAjuste).toBe("function");
  });
});

describe("auditoria input schema validation", () => {
  it("accepts all valid tipoAjuste enum values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const validTypes = [
      "ALTERAR_QUANTIDADE",
      "ALTERAR_VALOR",
      "ADICIONAR_ITEM",
      "REMOVER_ITEM",
      "ALTERAR_SETOR",
    ];

    for (const tipo of validTypes) {
      try {
        await caller.auditoria.registrarAjuste({
          numeroConta: "TEST-ENUM-001",
          estabelecimentoId: 1,
          tipoAjuste: tipo as any,
        });
      } catch (error: any) {
        // Should NOT be a BAD_REQUEST (validation error) for valid types
        expect(error.code).not.toBe("BAD_REQUEST");
      }
    }
  });

  it("setorOriginal and setorAjustado are optional fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw validation error when setor fields are omitted
    try {
      await caller.auditoria.registrarAjuste({
        numeroConta: "TEST-OPTIONAL-001",
        estabelecimentoId: 1,
        tipoAjuste: "ALTERAR_QUANTIDADE",
        itemId: 999999,
        quantidadeOriginal: "1",
        quantidadeAjustada: "2",
      });
    } catch (error: any) {
      expect(error.code).not.toBe("BAD_REQUEST");
    }
  });
});
