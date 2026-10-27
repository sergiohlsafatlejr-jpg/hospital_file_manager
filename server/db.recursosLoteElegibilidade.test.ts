import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "db.ts"), "utf8");

function corpoDaFuncao(nome: string, proximaFuncao: string) {
  const inicio = source.indexOf(`export async function ${nome}`);
  const fim = source.indexOf(`export async function ${proximaFuncao}`, inicio);
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return source.slice(inicio, fim);
}

describe("elegibilidade de recursos para lote", () => {
  const agrupados = corpoDaFuncao(
    "getRecursosAgrupadosPorConvenio",
    "criarLoteRecurso"
  );
  const criacao = corpoDaFuncao("criarLoteRecurso", "enviarLoteRecurso");
  const detalhados = corpoDaFuncao(
    "getRecursosDoConvenio",
    "getRecursosLoteParaExportacao"
  );

  it("não consulta recursos agrupados sem estabelecimento", () => {
    expect(agrupados).toMatch(
      /\)\s*\{\s*if \(!params\.estabelecimentoId\) return \[\];\s*const db = await getDb\(\);/
    );
  });

  it("não consulta recursos detalhados sem estabelecimento", () => {
    expect(detalhados).toMatch(
      /\)\s*\{\s*if \(!params\.estabelecimentoId\) return \[\];\s*const db = await getDb\(\);/
    );
  });

  it("lista demonstrativos somente no mesmo estado e sem reserva exigidos na criação", () => {
    expect(detalhados).toContain("AND d.recurso_status = 'recurso_criado'");
    expect(detalhados).toContain("AND d.recurso_id IS NULL");
    expect(detalhados).toContain("AND d.estabelecimentoId = ${params.estabelecimentoId}");
    expect(detalhados).not.toContain(
      "d.classificacao_glosa IN ('recursar', 'auto_recursar')"
    );
    expect(criacao).toContain("AND recurso_status = 'recurso_criado'");
    expect(criacao).toContain("AND recurso_id IS NULL");
  });

  it("lista conciliação somente iniciada, não reservada e sem item legado vinculado", () => {
    for (const consulta of [agrupados, detalhados]) {
      expect(consulta).toContain("AND ca.statusRecursoItem = 'iniciado'");
      expect(consulta).toContain("AND ca.xmlRecursoLoteId IS NULL");
      expect(consulta).toContain("FROM recursos_glosa_itens rgi");
    }
    expect(criacao).toContain("AND statusRecursoItem = 'iniciado'");
    expect(criacao).toContain("AND xmlRecursoLoteId IS NULL");
    expect(criacao).toContain("FROM recursos_glosa_itens rgi");
  });

  it("rejeita a seleção integral quando a reserva não puder atender escopo, status ou vínculo", () => {
    expect(criacao).toContain(
      "Um ou mais itens do demonstrativo estão indisponíveis para o lote (escopo, status ou reserva)"
    );
    expect(criacao).toContain(
      "Um ou mais itens da conciliação estão indisponíveis para o lote (escopo, status ou reserva)"
    );
  });
});
