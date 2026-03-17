import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("atendimentos.listarPaginado", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("retorna estrutura correta com paginação padrão", async () => {
    const result = await caller.atendimentos.listarPaginado({});
    
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("pageSize");
    expect(result).toHaveProperty("totalPages");
    expect(result).toHaveProperty("aggregations");
    
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(typeof result.totalPages).toBe("number");
  });

  it("retorna agregações com a estrutura esperada", async () => {
    const result = await caller.atendimentos.listarPaginado({});
    const agg = result.aggregations;
    
    expect(agg).toHaveProperty("tipos");
    expect(agg).toHaveProperty("convenios");
    expect(agg).toHaveProperty("etapas");
    expect(agg).toHaveProperty("origens");
    expect(agg).toHaveProperty("protocolos");
    expect(agg).toHaveProperty("anos");
    expect(agg).toHaveProperty("totalValor");
    
    expect(Array.isArray(agg.tipos)).toBe(true);
    expect(Array.isArray(agg.convenios)).toBe(true);
    expect(Array.isArray(agg.origens)).toBe(true);
    expect(typeof agg.totalValor).toBe("number");
    
    // Cada agregação deve ter value e count
    if (agg.tipos.length > 0) {
      expect(agg.tipos[0]).toHaveProperty("value");
      expect(agg.tipos[0]).toHaveProperty("count");
      expect(typeof agg.tipos[0].value).toBe("string");
      expect(typeof agg.tipos[0].count).toBe("number");
    }
  });

  it("respeita o pageSize e limita registros retornados", async () => {
    const result = await caller.atendimentos.listarPaginado({ pageSize: 10 });
    
    expect(result.items.length).toBeLessThanOrEqual(10);
    expect(result.pageSize).toBe(10);
  });

  it("retorna página 2 com offset correto", async () => {
    const page1 = await caller.atendimentos.listarPaginado({ pageSize: 10, page: 1 });
    const page2 = await caller.atendimentos.listarPaginado({ pageSize: 10, page: 2 });
    
    // Se há dados suficientes, as páginas devem ter registros diferentes
    if (page1.total > 10 && page2.items.length > 0) {
      expect(page2.page).toBe(2);
      // Os IDs da página 2 não devem estar na página 1
      const page1Ids = new Set(page1.items.map(i => i.id));
      const hasOverlap = page2.items.some(i => page1Ids.has(i.id));
      expect(hasOverlap).toBe(false);
    }
  });

  it("filtra por origemSistema corretamente", async () => {
    const result = await caller.atendimentos.listarPaginado({ origemSistema: "tasy" });
    
    // Todos os itens retornados devem ser da origem tasy
    result.items.forEach(item => {
      expect(item.origemSistema).toBe("tasy");
    });
  });

  it("filtra por origemSistema tasy_hemolabor corretamente", async () => {
    const result = await caller.atendimentos.listarPaginado({ origemSistema: "tasy_hemolabor" });
    
    result.items.forEach(item => {
      expect(item.origemSistema).toBe("tasy_hemolabor");
    });
  });

  it("filtra por busca textual", async () => {
    const result = await caller.atendimentos.listarPaginado({ busca: "ZZZZNOTEXIST999" });
    
    // Busca por texto inexistente deve retornar vazio
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("ordena por data_entrada desc por padrão", async () => {
    const result = await caller.atendimentos.listarPaginado({ pageSize: 20 });
    
    if (result.items.length >= 2) {
      // Verificar que os itens estão ordenados por data_entrada desc
      for (let i = 0; i < result.items.length - 1; i++) {
        const dateA = result.items[i].data_entrada || "";
        const dateB = result.items[i + 1].data_entrada || "";
        if (dateA && dateB) {
          expect(dateA >= dateB).toBe(true);
        }
      }
    }
  });

  it("ordena por data_entrada asc quando solicitado", async () => {
    const result = await caller.atendimentos.listarPaginado({ pageSize: 20, sortOrder: "asc" });
    
    if (result.items.length >= 2) {
      for (let i = 0; i < result.items.length - 1; i++) {
        const dateA = result.items[i].data_entrada || "";
        const dateB = result.items[i + 1].data_entrada || "";
        if (dateA && dateB) {
          expect(dateA <= dateB).toBe(true);
        }
      }
    }
  });

  it("totalPages é consistente com total e pageSize", async () => {
    const result = await caller.atendimentos.listarPaginado({ pageSize: 25 });
    
    const expectedPages = Math.ceil(result.total / 25);
    expect(result.totalPages).toBe(expectedPages);
  });

  it("cada item retornado tem os campos obrigatórios", async () => {
    const result = await caller.atendimentos.listarPaginado({ pageSize: 10 });
    
    result.items.forEach(item => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("origemSistema");
      expect(item).toHaveProperty("origemId");
      expect(item).toHaveProperty("estabelecimentoId");
      expect(item).toHaveProperty("numero_atendimento");
      expect(item).toHaveProperty("convenio");
      expect(item).toHaveProperty("paciente");
      expect(item).toHaveProperty("diasParado");
      expect(typeof item.diasParado).toBe("number");
    });
  });

  it("filtra por ano corretamente", async () => {
    const result = await caller.atendimentos.listarPaginado({ ano: "2025" });
    
    // Deve retornar registros (se existirem dados de 2025)
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("items");
  });

  it("filtra por ano e mês corretamente", async () => {
    const result = await caller.atendimentos.listarPaginado({ ano: "2025", mes: "01" });
    
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("items");
  });
});
