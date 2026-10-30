import { describe, expect, it, beforeEach, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getRawPool: vi.fn(),
}));

import { popularDeXmlTissArquivoRestrito } from "./faturamentoUnificadoService";

const dialect = new MySqlDialect();
const inputValido = {
  estabelecimentoId: 101,
  convenioId: 202,
  arquivoId: 303,
  numeroGuia: "GUIA-EXATA-9",
  numeroLote: "LOTE-EXATO-7",
  competencia: "2026/10",
  pacienteNome: "Paciente do resumo exato",
  setor: "faturamento",
};

function sqlDasChamadas() {
  return mocks.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
}

describe("popularDeXmlTissArquivoRestrito", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ total: 1 }]]);
  });

  it("restringe INSERT e COUNT ao mesmo arquivo, hospital, convênio, guia, lote e competência", async () => {
    const bancoInjetado = { execute: mocks.execute } as never;

    await expect(popularDeXmlTissArquivoRestrito(inputValido, bancoInjetado)).resolves.toEqual({
      inseridos: 1,
      total: 1,
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledTimes(2);

    const [insert, count] = sqlDasChamadas();
    for (const query of [insert, count]) {
      expect(query.sql).toMatch(/ft\.estabelecimentoId\s*=\s*\?/i);
      expect(query.sql).toMatch(/ft\.convenioId\s*=\s*\?/i);
      expect(query.sql).toMatch(/ft\.arquivo_id\s*=\s*\?/i);
      expect(query.sql).toMatch(
        /coalesce\(\s*nullif\(trim\(ft\.numero_guia_prestador\), ''\),\s*nullif\(trim\(ft\.numero_guia_operadora\), ''\)\s*\)\s*=\s*\?/i,
      );
      expect(query.sql).toMatch(/coalesce\(nullif\(trim\(ft\.numero_lote\), ''\), ''\)\s*=\s*\?/i);
      expect(query.sql).toMatch(/replace\(nullif\(trim\(ft\.competencia\), ''\), '-', '\/'\)\s*=\s*\?/i);
      expect(query.params).toEqual(expect.arrayContaining([
        inputValido.estabelecimentoId,
        inputValido.convenioId,
        inputValido.arquivoId,
        inputValido.numeroGuia,
        inputValido.numeroLote,
        inputValido.competencia,
      ]));
    }

    expect(count.sql).toMatch(/cast\(ft\.id as char\)\s*=\s*fu\.origemId/i);
    expect(count.sql).toMatch(/ft\.estabelecimentoId\s*=\s*fu\.estabelecimentoId/i);
  });

  it("reenvio equivalente não reprojeta valor já existente: deduplica por origem hospitalar, convênio e item exato", async () => {
    await popularDeXmlTissArquivoRestrito(inputValido, { execute: mocks.execute } as never);
    const [insert] = sqlDasChamadas();
    expect(insert.sql).toMatch(/NOT EXISTS/i);
    expect(insert.sql).toContain("anterior.estabelecimentoId = dedup.estabelecimentoId");
    expect(insert.sql).toContain("anterior.convenioId = dedup.convenioId");
    expect(insert.sql).toContain("origem_anterior.arquivo_id <> dedup.arquivo_id");
    for (const campo of ["sequencial_item", "codigo_item", "data_execucao", "quantidade", "valor_faturado"]) {
      expect(insert.sql).toContain(`origem_anterior.${campo} <=> dedup.${campo}`);
    }
    expect(insert.sql).not.toMatch(/\bDELETE\b|\bUPDATE\b/i);
  });

  it("mantém a fonte XML_TISS e os valores explícitos de paciente e setor, sem consultar origem médica separada", async () => {
    const bancoInjetado = { execute: mocks.execute } as never;

    await popularDeXmlTissArquivoRestrito(inputValido, bancoInjetado);

    const [insert] = sqlDasChamadas();
    expect(insert.sql).toMatch(/insert into faturamento_unificado/i);
    expect(insert.sql).toMatch(/'XML_TISS'/);
    expect(insert.sql).toMatch(/cast\(dedup\.id as char\)/i);
    expect(insert.params).toEqual(expect.arrayContaining([
      inputValido.pacienteNome,
      inputValido.setor,
    ]));
    expect(insert.sql).not.toMatch(/contas_convenio_resumo|contexto_medico|honorarios/i);
  });

  it("executa somente INSERT e SELECT: nunca DELETE, TRUNCATE ou UPDATE de pendências", async () => {
    const bancoInjetado = { execute: mocks.execute } as never;

    await popularDeXmlTissArquivoRestrito(inputValido, bancoInjetado);

    const queries = sqlDasChamadas();
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toMatch(/^\s*insert\b/i);
    expect(queries[1].sql).toMatch(/^\s*select\b/i);
    for (const query of queries) {
      expect(query.sql).not.toMatch(/\b(delete|truncate|update)\b/i);
    }
  });

  it.each([
    ["estabelecimentoId", 0],
    ["convenioId", -2],
    ["arquivoId", Number.MAX_SAFE_INTEGER + 1],
  ] as const)("rejeita %s inválido sem executar consulta", async (campo, valor) => {
    const bancoInjetado = { execute: mocks.execute } as never;
    const inputInvalido = { ...inputValido, [campo]: valor };

    await expect(popularDeXmlTissArquivoRestrito(inputInvalido, bancoInjetado)).rejects.toThrow(
      `${campo} deve ser um ID positivo seguro`,
    );

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejeita string de escopo inválida antes de executar consulta", async () => {
    const bancoInjetado = { execute: mocks.execute } as never;

    await expect(popularDeXmlTissArquivoRestrito({
      ...inputValido,
      numeroLote: "   ",
    }, bancoInjetado)).rejects.toThrow("numeroLote deve ser uma string válida");

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("normaliza somente a competência, sem projetar outro snapshot", async () => {
    const bancoInjetado = { execute: mocks.execute } as never;

    await popularDeXmlTissArquivoRestrito({
      ...inputValido,
      competencia: "2026-10",
    }, bancoInjetado);

    const [insert, count] = sqlDasChamadas();
    expect(insert.params).toContain("2026/10");
    expect(count.params).toContain("2026/10");
    for (const query of [insert, count]) {
      // O ORDER BY interno do ROW_NUMBER preserva a deduplicação legada por
      // id de origem. O alias ft projeta apenas o arquivo escolhido; a leitura
      // de origem_anterior é exclusivamente NOT EXISTS para não repetir valor.
      expect(query.sql).not.toMatch(/\blimit\b|\bft\.arquivo_id\s*<>|\bft\.arquivo_id\s+is\s+null/i);
      expect(query.sql).toMatch(/ft\.arquivo_id\s*=\s*\?/i);
    }
  });
});
