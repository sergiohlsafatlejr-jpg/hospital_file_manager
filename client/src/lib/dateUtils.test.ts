import { describe, expect, it } from "vitest";
import { formatDateBR, safeParseDate, toInputDateValue } from "./dateUtils";

describe("Issue #161 — preservação das datas civis da Etapa 2", () => {
  it.each([
    "2026-11-03",
    "2026-11-03T00:00:00.000Z",
    "2026-11-03T00:00:00+00:00",
    "03/11/2026",
  ])("mantém o dia civil para %s", (value) => {
    expect(toInputDateValue(value)).toBe("2026-11-03");
    expect(formatDateBR(value)).toBe("03/11/2026");
  });

  it("mantém o dia de uma coluna de data serializada como Date à meia-noite UTC", () => {
    const value = new Date("2026-11-03T00:00:00.000Z");
    expect(toInputDateValue(value)).toBe("2026-11-03");
    expect(value.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("não muda o instante de um timestamp explícito fora de meia-noite UTC", () => {
    const value = new Date("2026-11-03T16:40:21.003Z");
    expect(safeParseDate(value)?.getTime()).toBe(value.getTime());
    expect(safeParseDate(value.toISOString())?.getTime()).toBe(value.getTime());
  });

  it("mantém a data civil em virada de ano e dia bissexto", () => {
    expect(toInputDateValue("2025-12-31T00:00:00.000Z")).toBe("2025-12-31");
    expect(toInputDateValue("2024-02-29T00:00:00.000Z")).toBe("2024-02-29");
  });

  it("não inventa uma data para valores ausentes ou inválidos", () => {
    expect(safeParseDate(null)).toBeNull();
    expect(safeParseDate("não é uma data")).toBeNull();
    expect(safeParseDate(new Date(Number.NaN))).toBeNull();
    expect(toInputDateValue(undefined)).toBe("");
    expect(formatDateBR(null)).toBe("-");
  });
});
