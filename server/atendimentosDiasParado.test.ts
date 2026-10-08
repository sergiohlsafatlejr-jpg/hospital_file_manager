import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import {
  resolverSaidaEfetivaAtendimento,
  categoriaWarleineComSaidaNaEntrada,
  calcularDiasAposSaida,
  buildAtendimentoDiasParadoSql,
  buildAtendimentoPermanenciaSql,
} from "./atendimentosDiasParado";

const entrada = new Date(2026, 9, 5, 10);
const hoje = new Date(2026, 9, 8, 12);
const dialect = new MySqlDialect();
const fields = {
  origemSistema: sql`origemSistema`, dataEntrada: sql`data_entrada`, dataSaida: sql`data_saida`,
  categoriaAtendimento: sql`categoria_canonica`, dtEntrega: sql`dtEntrega`, dtEtapa: sql`dtEtapa`,
};

describe("saída considerada apenas para WARLEINE ambulatório/exame", () => {
  it.each(["EXAME", "AMBULATORIO", "AMBULATÓRIO", "AMBULATORIA"])("usa a entrada para %s sem persistir uma alta", (categoria) => {
    const row = { dataEntrada: entrada, dataSaida: null, origemSistema: " WARLEINE ", categoriaAtendimento: categoria };
    expect(resolverSaidaEfetivaAtendimento(row)).toEqual({ dataSaidaEfetiva: entrada, dataSaidaInferida: true });
    expect(calcularDiasAposSaida(row, hoje)).toBe(3);
    expect(row.dataSaida).toBeNull();
  });

  it("preserva a saída real mesmo na categoria elegível", () => {
    const saida = new Date(2026, 9, 6, 11);
    const row = { dataEntrada: entrada, dataSaida: saida, origemSistema: "WARLEINE", categoriaAtendimento: "EXAME" };
    expect(resolverSaidaEfetivaAtendimento(row)).toEqual({ dataSaidaEfetiva: saida, dataSaidaInferida: false });
    expect(calcularDiasAposSaida(row, hoje)).toBe(2);
  });

  it.each(["INTERNACAO", "PRONTO_SOCORRO", "OUTROS", ""])("não fabrica saída para categoria %s", (categoria) => {
    const row = { dataEntrada: entrada, dataSaida: null, origemSistema: "WARLEINE", categoriaAtendimento: categoria };
    expect(resolverSaidaEfetivaAtendimento(row)).toEqual({ dataSaidaEfetiva: null, dataSaidaInferida: false });
    expect(calcularDiasAposSaida(row, hoje)).toBe(0);
  });

  it.each(["tasy", "tasy_hemolabor", "EASYVISION", "OMNI"])("não muda a regra da origem %s", (origem) => {
    expect(resolverSaidaEfetivaAtendimento({ dataEntrada: entrada, dataSaida: null, origemSistema: origem, categoriaAtendimento: "EXAME" }))
      .toEqual({ dataSaidaEfetiva: null, dataSaidaInferida: false });
  });

  it("não fabrica data ausente e não retorna dias negativos", () => {
    expect(resolverSaidaEfetivaAtendimento({ dataEntrada: null, dataSaida: null, origemSistema: "WARLEINE", categoriaAtendimento: "EXAME" }).dataSaidaInferida).toBe(false);
    expect(calcularDiasAposSaida({ dataEntrada: new Date(2026, 9, 10), origemSistema: "WARLEINE", categoriaAtendimento: "EXAME" }, hoje)).toBe(0);
    expect(calcularDiasAposSaida({ dataSaida: "inválida" }, hoje)).toBe(0);
    expect(categoriaWarleineComSaidaNaEntrada("INTERNACAO")).toBe(false);
  });

  it("ordenação, filtro de permanência e saída efetiva SQL compartilham a mesma referência", () => {
    const result = buildAtendimentoDiasParadoSql(fields);
    const exit = dialect.sqlToQuery(result.dataSaidaEfetivaSql).sql;
    expect(exit).toContain("= 'warleine'");
    expect(exit).toContain("categoria_canonica IN ('AMBULATORIO', 'EXAME')");
    expect(exit).toContain("data_saida IS NULL");
    expect(exit).toContain("THEN data_entrada");
    const days = dialect.sqlToQuery(result.diasParadoSql).sql;
    expect(days).toContain("IN ('tasy', 'tasy_hemolabor')");
    expect(days).toContain("COALESCE(dtEntrega, dtEtapa)");
    const buckets = dialect.sqlToQuery(buildAtendimentoPermanenciaSql(result.referenciaPermanenciaSql)).sql;
    expect(buckets).toContain("THEN data_entrada");
    for (const bucket of ["0-14 DIAS", "15-30 DIAS", "31-60 DIAS", "61-90 DIAS", "90+ DIAS", "SEM REFERÊNCIA"]) expect(buckets).toContain(bucket);
    for (const query of [exit, days, buckets]) expect(query).not.toMatch(/\b(?:INSERT|UPDATE|ALTER|DELETE)\b/i);
  });

  it("devolve o DATEDIFF SQL na lista e normaliza origens TASY com espaços", () => {
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const start = router.indexOf("listarPaginado:");
    const endpoint = router.slice(start, router.indexOf("exportar", start));
    expect(endpoint).toContain('diasParadoCalculado: diasParadoSql.as("diasParadoCalculado")');
    expect(endpoint).toContain("diasParado: Number(d.diasParadoCalculado ?? 0)");
    expect(endpoint).toContain('["tasy", "tasy_hemolabor"].includes(d.origemSistema?.trim().toLowerCase() || "")');
    expect(endpoint).not.toContain("calcularDiasParadoUnificado(");
    expect(endpoint).not.toContain("calcularDiasAposSaida(");
    const days = dialect.sqlToQuery(buildAtendimentoDiasParadoSql(fields).diasParadoSql).sql;
    expect(days).toContain("LOWER(TRIM(COALESCE(origemSistema, '')))");
    expect(days).toContain("DATEDIFF(CURDATE(), COALESCE(dtEntrega, dtEtapa))");
  });

  it("a tela e exportações identificam a data considerada, sem UPDATE na base", () => {
    const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const start = router.indexOf("listarPaginado:");
    const endpoint = router.slice(start, router.indexOf("exportar", start));
    expect(endpoint).toContain("diasParado: diasParadoSql");
    expect(router).toContain("...(saidaEfetiva ? saidaEfetiva : {})");
    for (const file of ["../client/src/components/atendimentos/AtendimentosTabela.tsx", "../client/src/pages/AtendimentosUnificados.tsx", "../client/src/lib/atendimentosPdfGenerator.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).toContain("Saída considerada na entrada");
      expect(source).toContain("dataSaidaInferida");
    }
  });
});
