import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "server/routers/faturadoRecebidoUnificadoRouter.ts"),
  "utf8",
);

describe("fallback de prestador no Faturado x Recebido", () => {
  it("mantém o estabelecimento como escopo obrigatório do demonstrativo", () => {
    expect(source).toContain("WHERE d.estabelecimentoId = ?");
  });

  it("aceita retorno sem os três códigos de prestador quando a fonte não os informa", () => {
    expect(source).toContain("TRIM(COALESCE(d.codigo_prestador,'')) = ''");
    expect(source).toContain("TRIM(COALESCE(d.prestador_executante,'')) = ''");
    expect(source).toContain("TRIM(COALESCE(d.codigo_prestador_pagamento,'')) = ''");
  });

  it("continua exigindo correspondência quando algum código de prestador existe", () => {
    expect(source).toContain("SELECT 1 FROM prestadores_proprios pp_match");
    expect(source).toContain("pp_match.codigoPrestador IN");
  });
});
