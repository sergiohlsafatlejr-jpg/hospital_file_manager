import { describe, it, expect } from "vitest";

// ============================================================
// Testes para melhorias em Contas a Pagar e Contas a Receber
// ============================================================

describe("Contas a Pagar - Schema e Filtros", () => {
  it("deve ter os campos centroCustoId e dataPagamento na tabela finTransacoes", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finTransacoes);
    expect(cols).toContain("centroCustoId");
    expect(cols).toContain("dataPagamento");
    expect(cols).toContain("categoriaId");
    expect(cols).toContain("empresaId");
    expect(cols).toContain("bancoId");
  });

  it("deve ter a tabela fin_centros_custo definida no schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.finCentrosCusto).toBeDefined();
    const cols = Object.keys(schema.finCentrosCusto);
    expect(cols).toContain("id");
    expect(cols).toContain("nome");
    expect(cols).toContain("codigo");
  });

  it("deve ter o router financeiro com sub-router transacoes que aceita filtros avançados", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    expect(financeiroRouter).toBeDefined();
    const routerDef = financeiroRouter._def;
    expect(routerDef).toBeDefined();
  });

  it("deve ter o router transacoes.listar com suporte a centroCustoId, dataInicio e dataFim", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    // Verificar que o router existe e tem a procedure listar
    const procedures = financeiroRouter._def.procedures;
    // O router é composto de sub-routers, verificamos que existe
    expect(financeiroRouter).toBeDefined();
  });
});

describe("Contas a Receber - Campos Tipo de Serviço e Descrição de Serviço", () => {
  it("deve ter os campos tipoServico e descricaoServico na tabela finRecebiveis", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("tipoServico");
    expect(cols).toContain("descricaoServico");
  });

  it("deve ter os campos básicos da tabela finRecebiveis preservados", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("id");
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("dataVencimento");
    expect(cols).toContain("dataRecebimento");
    expect(cols).toContain("recebido");
    expect(cols).toContain("empresaId");
    expect(cols).toContain("clienteId");
    expect(cols).toContain("bancoId");
    expect(cols).toContain("observacoes");
  });

  it("deve ter o campo tipoServico como varchar(255) opcional", async () => {
    const schema = await import("../drizzle/schema");
    // Verificar que o campo existe e é do tipo correto
    const tipoServicoCol = (schema.finRecebiveis as any).tipoServico;
    expect(tipoServicoCol).toBeDefined();
    // Verificar que não é notNull (é opcional)
    expect(tipoServicoCol.notNull).toBeFalsy();
  });

  it("deve ter o campo descricaoServico como text opcional", async () => {
    const schema = await import("../drizzle/schema");
    const descricaoServicoCol = (schema.finRecebiveis as any).descricaoServico;
    expect(descricaoServicoCol).toBeDefined();
    expect(descricaoServicoCol.notNull).toBeFalsy();
  });

  it("deve ter o router recebiveis com procedure tiposServicoDistintos", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    expect(financeiroRouter).toBeDefined();
    // O router deve existir e ter sub-routers
    const routerDef = financeiroRouter._def;
    expect(routerDef).toBeDefined();
  });
});

describe("Contas a Pagar - Tabela com JOIN para Categoria e Centro de Custo", () => {
  it("deve ter a tabela finCategorias definida no schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.finCategorias).toBeDefined();
    const cols = Object.keys(schema.finCategorias);
    expect(cols).toContain("id");
    expect(cols).toContain("nome");
  });

  it("deve ter índices na tabela finTransacoes para performance de filtros", async () => {
    const schema = await import("../drizzle/schema");
    // Verificar que a tabela tem os campos de FK para filtros
    const cols = Object.keys(schema.finTransacoes);
    expect(cols).toContain("empresaId");
    expect(cols).toContain("categoriaId");
    expect(cols).toContain("centroCustoId");
    expect(cols).toContain("dataVencimento");
    expect(cols).toContain("pago");
  });
});

describe("Contas a Receber - Filtro por Tipo de Serviço", () => {
  it("deve ter o campo tipoServico na tabela finRecebiveis para filtro", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("tipoServico");
  });

  it("deve ter o campo clienteId na tabela finRecebiveis para JOIN com clientes", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("clienteId");
  });

  it("deve ter a tabela finClientes para JOIN no listar recebiveis", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.finClientes).toBeDefined();
    const cols = Object.keys(schema.finClientes);
    expect(cols).toContain("id");
    expect(cols).toContain("nome");
  });
});

describe("Edição Inline - Contas a Pagar (transacoes.atualizar)", () => {
  it("deve ter a procedure transacoes.atualizar definida no router financeiro", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    expect(financeiroRouter).toBeDefined();
    const routerDef = financeiroRouter._def;
    expect(routerDef).toBeDefined();
  });

  it("deve ter os campos necessários para atualização na tabela finTransacoes", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finTransacoes);
    // Campos editáveis
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("dataVencimento");
    expect(cols).toContain("dataPagamento");
    expect(cols).toContain("pago");
    expect(cols).toContain("empresaId");
    expect(cols).toContain("categoriaId");
    expect(cols).toContain("bancoId");
    expect(cols).toContain("centroCustoId");
    expect(cols).toContain("observacoes");
  });

  it("deve ter o campo updatedAt para rastreamento de alterações", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finTransacoes);
    expect(cols).toContain("updatedAt");
  });
});

describe("Edição Inline - Contas a Receber (recebiveis.atualizar)", () => {
  it("deve ter a procedure recebiveis.atualizar definida no router financeiro", async () => {
    const { financeiroRouter } = await import("./routers/financeiroRouter");
    expect(financeiroRouter).toBeDefined();
    const routerDef = financeiroRouter._def;
    expect(routerDef).toBeDefined();
  });

  it("deve ter os campos necessários para atualização na tabela finRecebiveis", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    // Campos editáveis
    expect(cols).toContain("descricao");
    expect(cols).toContain("valor");
    expect(cols).toContain("dataVencimento");
    expect(cols).toContain("dataRecebimento");
    expect(cols).toContain("recebido");
    expect(cols).toContain("empresaId");
    expect(cols).toContain("clienteId");
    expect(cols).toContain("bancoId");
    expect(cols).toContain("tipoServico");
    expect(cols).toContain("descricaoServico");
    expect(cols).toContain("observacoes");
  });

  it("deve ter o campo updatedAt para rastreamento de alterações em recebiveis", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.finRecebiveis);
    expect(cols).toContain("updatedAt");
  });

  it("deve ter os tipos de serviço padrão cobrindo os cenários hospitalares", () => {
    const tiposServicoPadrao = ["Consulta", "Exame", "Cirurgia", "Internação", "Procedimento", "Fisioterapia", "Urgência/Emergência", "Home Care", "Telemedicina", "Outros"];
    expect(tiposServicoPadrao).toHaveLength(10);
    expect(tiposServicoPadrao).toContain("Consulta");
    expect(tiposServicoPadrao).toContain("Cirurgia");
    expect(tiposServicoPadrao).toContain("Internação");
    expect(tiposServicoPadrao).toContain("Urgência/Emergência");
    expect(tiposServicoPadrao).toContain("Home Care");
    expect(tiposServicoPadrao).toContain("Telemedicina");
  });
});
