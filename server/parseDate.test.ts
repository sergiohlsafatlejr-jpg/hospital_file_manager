import { describe, it, expect } from "vitest";

// Função parseDate copiada do parsers.ts para teste
function parseDate(value: unknown): Date | undefined {
  const str = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (!str) return undefined;
  
  // Try to detect Brazilian format DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1; // Month is 0-indexed
    const year = parseInt(brMatch[3], 10);
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // Try to detect Brazilian format DD/MM/YYYY HH:MM:SS
  const brMatchTime = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (brMatchTime) {
    const day = parseInt(brMatchTime[1], 10);
    const month = parseInt(brMatchTime[2], 10) - 1;
    const year = parseInt(brMatchTime[3], 10);
    const hour = parseInt(brMatchTime[4], 10);
    const minute = parseInt(brMatchTime[5], 10);
    const second = brMatchTime[6] ? parseInt(brMatchTime[6], 10) : 0;
    const date = new Date(year, month, day, hour, minute, second);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  // Fallback to standard Date parsing (ISO format, etc.)
  const date = new Date(str);
  return isNaN(date.getTime()) ? undefined : date;
}

describe("parseDate", () => {
  it("deve parsear data no formato brasileiro DD/MM/YYYY corretamente", () => {
    const result = parseDate("15/01/2026");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(15);
    expect(result?.getMonth()).toBe(0); // Janeiro = 0
    expect(result?.getFullYear()).toBe(2026);
  });

  it("deve parsear data no formato brasileiro com dia > 12 corretamente", () => {
    const result = parseDate("25/03/2026");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(25);
    expect(result?.getMonth()).toBe(2); // Março = 2
    expect(result?.getFullYear()).toBe(2026);
  });

  it("deve parsear data no formato brasileiro DD/MM/YYYY HH:MM:SS", () => {
    const result = parseDate("15/01/2026 14:30:45");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(15);
    expect(result?.getMonth()).toBe(0);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getHours()).toBe(14);
    expect(result?.getMinutes()).toBe(30);
    expect(result?.getSeconds()).toBe(45);
  });

  it("deve parsear data no formato brasileiro DD/MM/YYYY HH:MM", () => {
    const result = parseDate("15/01/2026 14:30");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(15);
    expect(result?.getMonth()).toBe(0);
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getHours()).toBe(14);
    expect(result?.getMinutes()).toBe(30);
  });

  it("deve parsear data no formato ISO YYYY-MM-DD", () => {
    const result = parseDate("2026-01-15");
    expect(result).toBeDefined();
    // ISO dates are parsed as UTC, so getDate() may differ based on timezone
    // We just verify the date is valid and in January 2026
    expect(result?.getMonth()).toBe(0);
    expect(result?.getFullYear()).toBe(2026);
  });

  it("deve retornar undefined para string vazia", () => {
    const result = parseDate("");
    expect(result).toBeUndefined();
  });

  it("deve retornar undefined para valor inválido", () => {
    const result = parseDate("abc");
    expect(result).toBeUndefined();
  });

  it("deve parsear data 01/03/2026 como 1 de março (não 3 de janeiro)", () => {
    const result = parseDate("01/03/2026");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(1);
    expect(result?.getMonth()).toBe(2); // Março = 2
    expect(result?.getFullYear()).toBe(2026);
  });

  it("deve parsear data 03/01/2026 como 3 de janeiro", () => {
    const result = parseDate("03/01/2026");
    expect(result).toBeDefined();
    expect(result?.getDate()).toBe(3);
    expect(result?.getMonth()).toBe(0); // Janeiro = 0
    expect(result?.getFullYear()).toBe(2026);
  });
});
