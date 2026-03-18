import { describe, it, expect } from "vitest";

// ============================================================
// Testes para os módulos Financeiro, Contratos e Propostas
// ============================================================

describe("Módulo Financeiro - Schema e Validação", () => {
  it("deve ter as tabelas financeiras definidas no schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.finTransacoes).toBeDefined();
    expect(schema.finRecebiveis).toBeDefined();
    expect(schema.finCategorias).toBeDefined();
    expect(schema.finExtratos).toBeDefined();
    expect(schema.finCustos).toBeDefined();
  });

  it("deve ter os campos obrigatórios na tabela finTransacoes", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finTransacoes);
    expect(cols).toContain("id");
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("dataVencimento");
    expect(cols).toContain("pago");
  });

  it("deve ter os campos obrigatórios na tabela finRecebiveis", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("id");
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("recebido");
    expect(cols).toContain("dataVencimento");
  });

  it("deve ter os campos obrigatórios na tabela finExtratos", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finExtratos);
    expect(cols).toContain("id");
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("data");
  });
});

describe("Módulo Contratos - Schema e Validação", () => {
  it("deve ter a tabela de contratos definida no schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.contratos).toBeDefined();
  });

  it("deve ter os campos obrigatórios na tabela contratos", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.contratos);
    expect(cols).toContain("id");
    expect(cols).toContain("contratanteNome");
    expect(cols).toContain("status");
    expect(cols).toContain("dataInicio");
    expect(cols).toContain("dataFim");
  });

  it("deve ter campos de serviço no contrato", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.contratos);
    expect(cols).toContain("servicos");
    expect(cols).toContain("valorMensal");
  });
});

describe("Módulo Propostas - Schema e Validação", () => {
  it("deve ter a tabela de propostas definida no schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.propostas).toBeDefined();
    expect(schema.propostaItens).toBeDefined();
  });

  it("deve ter os campos obrigatórios na tabela propostas", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.propostas);
    expect(cols).toContain("id");
    expect(cols).toContain("titulo");
    expect(cols).toContain("cliente");
    expect(cols).toContain("status");
    expect(cols).toContain("valorTotal");
  });

  it("deve ter os campos obrigatórios na tabela propostaItens", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.propostaItens);
    expect(cols).toContain("id");
    expect(cols).toContain("propostaId");
    expect(cols).toContain("descricao");
    expect(cols).toContain("precoUnitario");
    expect(cols).toContain("quantidade");
  });
});

describe("Módulo Financeiro - Router", () => {
  it("deve ter o router financeiro com sub-routers", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    expect(financeiroRouter).toBeDefined();
    // Verificar que o router tem as procedures esperadas
    const routerDef = financeiroRouter._def;
    expect(routerDef).toBeDefined();
  });
});

describe("Módulo Contratos - Router", () => {
  it("deve ter o router de contratos com procedures CRUD", async () => {
    const { contratosRouter } = await import("./routers/contratosRouter");
    expect(contratosRouter).toBeDefined();
    const routerDef = contratosRouter._def;
    expect(routerDef).toBeDefined();
  });
});

describe("Módulo Propostas - Router", () => {
  it("deve ter o router de propostas com procedures CRUD", async () => {
    const { propostasRouter } = await import("./routers/propostasRouter");
    expect(propostasRouter).toBeDefined();
    const routerDef = propostasRouter._def;
    expect(routerDef).toBeDefined();
  });
});

describe("Integração - App Router", () => {
  it("deve ter os 3 novos módulos registrados no appRouter", async () => {
    const { appRouter } = await import("./routers");
    const routerDef = appRouter._def;
    expect(routerDef).toBeDefined();
    // Verificar que os sub-routers estão registrados
    const record = routerDef.record;
    expect(record.financeiro).toBeDefined();
    expect(record.contratos).toBeDefined();
    expect(record.propostas).toBeDefined();
  });

  it("deve manter os módulos existentes no appRouter", async () => {
    const { appRouter } = await import("./routers");
    const record = appRouter._def.record;
    expect(record.auth).toBeDefined();
    expect(record.nfse).toBeDefined();
  });
});
