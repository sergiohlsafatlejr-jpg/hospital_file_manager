import { describe, expect, it } from "vitest";
import {
  canonicalizeWarleineConventionDetails,
  warleineMoneyToSafeNumber,
  warleineQuantityToSafeNumber,
} from "./warleineFaturamentoService";

describe("serialização numérica Warleine", () => {
  it("preserva os quatro decimais dos totais financeiros auditados", () => {
    expect(warleineMoneyToSafeNumber("25511790.7289")).toBe(25511790.7289);
    expect(warleineMoneyToSafeNumber("0.1000")).toBe(0.1);
  });

  it("rejeita montante cujo inteiro escalado excede a faixa segura do JSON number", () => {
    expect(() => warleineMoneyToSafeNumber("900719925474.0992")).toThrow(/faixa segura/i);
  });

  it("preserva quantidades representáveis e rejeita perda de precisão", () => {
    expect(warleineQuantityToSafeNumber("319784")).toBe(319784);
    expect(warleineQuantityToSafeNumber("0.125")).toBe(0.125);
    expect(() => warleineQuantityToSafeNumber("0.1234567890123456789")).toThrow(/precisão/i);
  });

  it("mantém uma única opção por código de convênio mesmo quando o nome varia", () => {
    expect(canonicalizeWarleineConventionDetails([
      { convenioChave: "101", convenio: "OPERADORA A" },
      { convenioChave: "101", convenio: "OPERADORA A - NOVO" },
      { convenioChave: "202", convenio: "OPERADORA B" },
    ])).toEqual([
      { chave: "101", nome: "OPERADORA A - NOVO" },
      { chave: "202", nome: "OPERADORA B" },
    ]);
  });
});
