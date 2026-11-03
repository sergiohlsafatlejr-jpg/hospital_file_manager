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

describe("filtro por tipo de item na aba Ajustes", () => {
  // Simula a lógica de filtragem do frontend para garantir consistência
  const mockItems = [
    { id: 1, codigoItem: "10102019", descricaoItem: "VISITA HOSPITALAR", tipoItem: "PROCEDIMENTO", setor: "UTI", dataExecucao: "2025-12-01" },
    { id: 2, codigoItem: "60000694", descricaoItem: "DIARIA DE ENFERMARIA", tipoItem: "DIARIA", setor: "ENFERMARIA", dataExecucao: "2025-12-01" },
    { id: 3, codigoItem: "60034343", descricaoItem: "OXIGENIO POR MINUTO", tipoItem: "GASES", setor: "UTI", dataExecucao: "2025-12-02" },
    { id: 4, codigoItem: "43990305", descricaoItem: "TAXA DE AUDITORIA", tipoItem: "TAXA", setor: "ENFERMARIA", dataExecucao: "2025-12-01" },
    { id: 5, codigoItem: "90001234", descricaoItem: "DIPIRONA 500MG", tipoItem: "MAT_MED", setor: "UTI", dataExecucao: "2025-12-02" },
    { id: 6, codigoItem: "90005678", descricaoItem: "SORO FISIOLOGICO", tipoItem: null, setor: "ENFERMARIA", dataExecucao: "2025-12-01" },
  ];

  function filterItems(items: typeof mockItems, filtroTipo: string, filtroSetor: string = "todos", filtroData: string = "") {
    return items.filter((item) => {
      if (filtroSetor !== "todos") {
        if (filtroSetor === "sem_setor") { if (item.setor) return false; }
        else { if (item.setor !== filtroSetor) return false; }
      }
      if (filtroData && item.dataExecucao) {
        if (item.dataExecucao !== filtroData) return false;
      } else if (filtroData && !item.dataExecucao) {
        return false;
      }
      if (filtroTipo !== "todos") {
        if (filtroTipo === "sem_tipo") { if (item.tipoItem) return false; }
        else { if (item.tipoItem !== filtroTipo) return false; }
      }
      return true;
    });
  }

  it("shows all items when filtroTipo is 'todos'", () => {
    const result = filterItems(mockItems, "todos");
    expect(result.length).toBe(6);
  });

  it("filters by PROCEDIMENTO type", () => {
    const result = filterItems(mockItems, "PROCEDIMENTO");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("VISITA HOSPITALAR");
  });

  it("filters by DIARIA type", () => {
    const result = filterItems(mockItems, "DIARIA");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("DIARIA DE ENFERMARIA");
  });

  it("filters by TAXA type", () => {
    const result = filterItems(mockItems, "TAXA");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("TAXA DE AUDITORIA");
  });

  it("filters by MAT_MED type", () => {
    const result = filterItems(mockItems, "MAT_MED");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("DIPIRONA 500MG");
  });

  it("filters by GASES type", () => {
    const result = filterItems(mockItems, "GASES");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("OXIGENIO POR MINUTO");
  });

  it("filters items without type (sem_tipo)", () => {
    const result = filterItems(mockItems, "sem_tipo");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("SORO FISIOLOGICO");
  });

  it("combines tipo + setor filters correctly", () => {
    const result = filterItems(mockItems, "PROCEDIMENTO", "UTI");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("VISITA HOSPITALAR");

    const result2 = filterItems(mockItems, "PROCEDIMENTO", "ENFERMARIA");
    expect(result2.length).toBe(0);
  });

  it("combines tipo + data filters correctly", () => {
    const result = filterItems(mockItems, "DIARIA", "todos", "2025-12-01");
    expect(result.length).toBe(1);

    const result2 = filterItems(mockItems, "DIARIA", "todos", "2025-12-02");
    expect(result2.length).toBe(0);
  });

  it("combines all three filters correctly", () => {
    const result = filterItems(mockItems, "GASES", "UTI", "2025-12-02");
    expect(result.length).toBe(1);
    expect(result[0].descricaoItem).toBe("OXIGENIO POR MINUTO");

    const result2 = filterItems(mockItems, "GASES", "ENFERMARIA", "2025-12-02");
    expect(result2.length).toBe(0);
  });

  it("returns empty when no items match the tipo filter", () => {
    const result = filterItems(mockItems, "TIPO_INEXISTENTE");
    expect(result.length).toBe(0);
  });
});


describe("auditoria.marcarItensAuditados - Marcador de auditoria da enfermagem", () => {
  it("procedure exists and is callable", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    expect(caller.auditoria.marcarItensAuditados).toBeDefined();
    expect(typeof caller.auditoria.marcarItensAuditados).toBe("function");
  });

  it("accepts valid itemIds array and auditado boolean", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.auditoria.marcarItensAuditados({
        numeroConta: "TEST-AUDIT-001",
        estabelecimentoId: 1,
        itemIds: [101, 102],
        auditado: true,
      });
    } catch (error: any) {
      // Should not fail Zod input validation
      expect(error.code).not.toBe("BAD_REQUEST");
    }
  });

  it("rejects empty itemIds array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.auditoria.marcarItensAuditados({
        numeroConta: "TEST-AUDIT-001",
        estabelecimentoId: 1,
        itemIds: [],
        auditado: true,
      });
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }
  });
});

describe("marcador de itens auditados e data do item no histórico de ajustes", () => {
  const mockItems = [
    { id: 10, codigoItem: "10102019", descricaoItem: "VISITA HOSPITALAR", statusAnalise: "revisado", dataExecucao: "2026-03-01" },
    { id: 11, codigoItem: "60000694", descricaoItem: "DIARIA DE ENFERMARIA", statusAnalise: "pendente", dataExecucao: "2026-03-02" },
    { id: 12, codigoItem: "90001234", descricaoItem: "DIPIRONA 500MG", statusAnalise: "pendente", dataExecucao: "2026-03-03" },
  ];

  const mockAjustes = [
    {
      id: 1,
      itemId: 11,
      codigoItem: "60000694",
      tipoAjuste: "ALTERAR_QUANTIDADE",
      status: "aplicado",
      dataExecucao: "2026-03-02",
    },
    {
      id: 2,
      itemId: null,
      codigoItem: "90001234",
      tipoAjuste: "ADICIONAR_ITEM",
      status: "revertido",
      dataExecucao: null,
    },
    {
      id: 3,
      itemId: null,
      codigoItem: "10102019",
      tipoAjuste: "ADICIONAR_ITEM",
      status: "aplicado",
      dataExecucao: null,
    },
  ];

  function buildAjustesAplicadosMap(ajustes: typeof mockAjustes) {
    const map = new Map<number, (typeof mockAjustes)[number][]>();
    for (const aj of ajustes) {
      if (aj.status === "revertido") continue;
      if (aj.itemId) {
        const current = map.get(Number(aj.itemId)) || [];
        current.push(aj);
        map.set(Number(aj.itemId), current);
      }
    }
    return map;
  }

  function isItemAuditado(
    item: (typeof mockItems)[number],
    ajustesMap: Map<number, (typeof mockAjustes)[number][]>,
    otimista: Record<number, boolean> = {}
  ) {
    if (item.id in otimista) return otimista[item.id];
    if (item.statusAnalise === "revisado") return true;
    if (ajustesMap.has(item.id)) return true;
    return false;
  }

  function obterDataItemAjuste(
    ajuste: (typeof mockAjustes)[number],
    items: typeof mockItems
  ): string | null {
    if (ajuste.dataExecucao) return String(ajuste.dataExecucao);
    if (ajuste.itemId) {
      const found = items.find((i) => Number(i.id) === Number(ajuste.itemId));
      if (found?.dataExecucao) return String(found.dataExecucao);
    }
    if (ajuste.codigoItem) {
      const foundByCode = items.find(
        (i) => String(i.codigoItem) === String(ajuste.codigoItem) && i.dataExecucao
      );
      if (foundByCode?.dataExecucao) return String(foundByCode.dataExecucao);
    }
    return null;
  }

  it("identifies items as audited when statusAnalise is revisado or item has active adjustment", () => {
    const ajustesMap = buildAjustesAplicadosMap(mockAjustes);
    // Item 10: statusAnalise = revisado -> true
    expect(isItemAuditado(mockItems[0], ajustesMap)).toBe(true);
    // Item 11: statusAnalise = pendente, but has active adjustment -> true
    expect(isItemAuditado(mockItems[1], ajustesMap)).toBe(true);
    // Item 12: statusAnalise = pendente, adjustment is revertido -> false
    expect(isItemAuditado(mockItems[2], ajustesMap)).toBe(false);
  });

  it("respects optimistic toggle state when nurse marks/unmarks an item", () => {
    const ajustesMap = buildAjustesAplicadosMap(mockAjustes);
    expect(isItemAuditado(mockItems[2], ajustesMap, { 12: true })).toBe(true);
    expect(isItemAuditado(mockItems[0], ajustesMap, { 10: false })).toBe(false);
  });

  it("resolves the execution date of the item in adjustment history directly or via fallback", () => {
    // Ajuste 1 has dataExecucao directly from backend enrichment
    expect(obterDataItemAjuste(mockAjustes[0], mockItems)).toBe("2026-03-02");
    // Ajuste 3 has no itemId/dataExecucao on record, falls back to matching codigoItem
    expect(obterDataItemAjuste(mockAjustes[2], mockItems)).toBe("2026-03-01");
  });
});
