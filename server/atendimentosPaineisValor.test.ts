import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import {
  ATENDIMENTOS_VALOR_SQL,
  getAtendimentosPaineisValor,
  parsePainelValor,
} from "./atendimentosPaineisValor";

const dialect = new MySqlDialect();
const sameWhere = sql`estabelecimentoId = ${42} AND ativoNaFonte = ${true} AND ${ATENDIMENTOS_VALOR_SQL.convenio} = ${"SEM CONVÊNIO"}`;

describe("painéis de valor de atendimentos", () => {
  it("compila expressões normalizadas e injeta valores como parâmetros", () => {
    const etapa = dialect.sqlToQuery(sql`SELECT ${ATENDIMENTOS_VALOR_SQL.etapa} AS chave FROM atendimentos_unificados WHERE ${sameWhere}`);
    const convenio = dialect.sqlToQuery(sql`SELECT ${ATENDIMENTOS_VALOR_SQL.convenio} AS chave FROM atendimentos_unificados WHERE ${sameWhere}`);
    const setor = dialect.sqlToQuery(sql`SELECT ${ATENDIMENTOS_VALOR_SQL.setor} AS chave FROM atendimentos_unificados WHERE ${sameWhere}`);
    const mesEntrada = dialect.sqlToQuery(sql`SELECT ${ATENDIMENTOS_VALOR_SQL.mesEntrada} AS chave FROM atendimentos_unificados WHERE ${sameWhere}`);
    const permanencia = dialect.sqlToQuery(sql`SELECT ${ATENDIMENTOS_VALOR_SQL.permanencia} AS chave FROM atendimentos_unificados WHERE ${sameWhere}`);

    expect(etapa.sql).toContain("'SEM ETAPA'");
    expect(convenio.sql).toContain("'SEM CONVÊNIO'");
    expect(setor.sql).toContain("'SEM SETOR'");
    expect(mesEntrada.sql).toContain("'__SEM_ENTRADA__'");
    expect(permanencia.sql).toContain("'SEM REFERÊNCIA'");
    for (const query of [etapa, convenio, setor, mesEntrada, permanencia]) {
      expect(query.params).toEqual([42, true, "SEM CONVÊNIO"]);
      expect(query.sql).not.toContain("SEM CONVÊNIO =");
    }
  });

  it("executa cinco SELECTs com o mesmo where e nunca emite escrita", async () => {
    const rows = [
      [{ chave: "SEM ETAPA", quantidade: "2", valor: "-12.34" }],
      [{ chave: "SEM CONVÊNIO", quantidade: "3", valor: "0.00" }],
      [{ chave: "SEM SETOR", quantidade: "4", valor: "100.01" }],
      [{ chave: "__SEM_ENTRADA__", quantidade: "5", valor: "50.50" }],
      [{ chave: "SEM REFERÊNCIA", quantidade: "6", valor: "-0.01" }],
    ];
    const statements: unknown[] = [];
    const execute = vi.fn(async (statement: unknown) => {
      statements.push(statement);
      return [rows[statements.length - 1]];
    });

    const paineis = await getAtendimentosPaineisValor({ execute } as any, sameWhere);
    const queries = statements.map(statement => dialect.sqlToQuery(statement as any));
    const whereQuery = dialect.sqlToQuery(sameWhere);

    expect(execute).toHaveBeenCalledTimes(5);
    expect(queries).toHaveLength(5);
    for (const query of queries) {
      expect(query.sql).toMatch(/^SELECT /i);
      expect(query.sql).toContain("FROM atendimentos_unificados WHERE");
      expect(query.params).toEqual(whereQuery.params);
      expect(query.sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|TRUNCATE)\b/i);
    }
    expect(paineis).toEqual({
      etapa: [{ chave: "SEM ETAPA", quantidade: 2, valor: -12.34 }],
      convenio: [{ chave: "SEM CONVÊNIO", quantidade: 3, valor: 0 }],
      setor: [{ chave: "SEM SETOR", quantidade: 4, valor: 100.01 }],
      mesEntrada: [{ chave: "__SEM_ENTRADA__", quantidade: 5, valor: 50.5 }],
      permanencia: [{ chave: "SEM REFERÊNCIA", quantidade: 6, valor: -0.01 }],
    });
  });

  it("preserva centavos e valores negativos sem aceitar precisão monetária inválida", () => {
    expect(parsePainelValor([{ chave: "teste", quantidade: "1", valor: "-987654321.09" }]))
      .toEqual([{ chave: "teste", quantidade: 1, valor: -987654321.09 }]);
    expect(() => parsePainelValor([{ chave: "teste", quantidade: "1", valor: "1.001" }]))
      .toThrow("fora da faixa segura");
  });

  it("mantém buckets sem valor e quantidade nulos serializáveis", () => {
    expect(parsePainelValor([{ chave: "SEM ETAPA", quantidade: null, valor: null }]))
      .toEqual([{ chave: "SEM ETAPA", quantidade: 0, valor: 0 }]);
  });

  it("usa a mesma precisão monetária no total da tabela e em seus painéis", () => {
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const paineis = readFileSync(new URL("./atendimentosPaineisValor.ts", import.meta.url), "utf8");
    expect(router).toContain("SUM(CAST(valorConta AS DECIMAL(18,2))), 0) as totalValor");
    expect(paineis).toContain("SUM(CAST(valorConta AS DECIMAL(18,2))), 0) AS valor");
  });
});
