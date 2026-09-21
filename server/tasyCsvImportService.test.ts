import { describe, expect, it } from "vitest";
import {
  TASY_CSV_HEADERS,
  assertTasyImportWithinDeadline,
  isTasyFinalizedStage,
  isTasySnapshotCoverageSafe,
  normalizeTasyCompetencia,
  parseTasyDate,
  parseTasyDecimal,
  repairTasyCsvRecord,
} from "./tasyCsvImportService";

describe("tasyCsvImportService", () => {
  it("mantém registros com 31 colunas", () => {
    const row = TASY_CSV_HEADERS.map((header) => header);
    expect(repairTasyCsvRecord(row)).toEqual(row);
  });

  it("repara o valor decimal não citado que criou a 32ª coluna", () => {
    const row = [...TASY_CSV_HEADERS.map(() => "x"), "73"];
    row[row.length - 2] = "1482";
    const repaired = repairTasyCsvRecord(row);
    expect(repaired).toHaveLength(31);
    expect(repaired?.at(-1)).toBe("1482.73");
  });

  it("rejeita registros com quantidade estruturalmente incompatível", () => {
    expect(repairTasyCsvRecord(["a", "b"])).toBeNull();
  });

  it("converte valores brasileiros e internacionais sem estimativa", () => {
    expect(parseTasyDecimal("1.234,56")).toBe(1234.56);
    expect(parseTasyDecimal("1234.56")).toBe(1234.56);
    expect(parseTasyDecimal("")).toBeNull();
    expect(parseTasyDecimal("inválido")).toBeNull();
  });

  it("converte as datas DD/MM/AA usadas pelo CSV Hemolabor", () => {
    expect(parseTasyDate("01/01/26")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseTasyDate("21/09/26 14:30:45")?.toISOString()).toBe("2026-09-21T14:30:45.000Z");
    expect(parseTasyDate("2026-09-21")?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("não corrige silenciosamente datas impossíveis", () => {
    expect(parseTasyDate("31/02/26")).toBeNull();
    expect(parseTasyDate("texto")).toBeNull();
    expect(parseTasyDate("")).toBeNull();
  });

  it("normaliza competências válidas e sinaliza anomalias", () => {
    expect(normalizeTasyCompetencia("2026/8")).toEqual({ value: "2026/08" });
    expect(normalizeTasyCompetencia("")).toEqual({ value: null, warning: "COMPETENCIA_AUSENTE" });
    expect(normalizeTasyCompetencia("3026/03")).toEqual({ value: "3026/03", warning: "COMPETENCIA_FORA_DA_FAIXA" });
  });

  it("reconhece somente a etapa finalizada exata", () => {
    expect(isTasyFinalizedStage("Conta em protocolo com titulo (Finalizada)")).toBe(true);
    expect(isTasyFinalizedStage("Em Faturamento")).toBe(false);
  });

  it("não bloqueia o primeiro lote nem unidades com menos de 100 contas ativas", () => {
    expect(isTasySnapshotCoverageSafe(0, 0)).toBe(true);
    expect(isTasySnapshotCoverageSafe(99, 1)).toBe(true);
  });

  it("aceita exatamente 80% e bloqueia cobertura inferior para unidades maiores", () => {
    expect(isTasySnapshotCoverageSafe(100, 80)).toBe(true);
    expect(isTasySnapshotCoverageSafe(100, 79)).toBe(false);
    expect(isTasySnapshotCoverageSafe(1_000, 799)).toBe(false);
  });

  it("permite configurar uma cobertura mínima mais restritiva", () => {
    expect(isTasySnapshotCoverageSafe(200, 180, 0.9)).toBe(true);
    expect(isTasySnapshotCoverageSafe(200, 179, 0.9)).toBe(false);
  });

  it("interrompe de forma recuperável quando o deadline seguro expira", () => {
    expect(() => assertTasyImportWithinDeadline(Date.now() - 1)).toThrow(/reenvie o mesmo arquivo/i);
    expect(() => assertTasyImportWithinDeadline(Date.now() + 60_000)).not.toThrow();
    expect(() => assertTasyImportWithinDeadline()).not.toThrow();
  });
});
