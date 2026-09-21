import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDateBR } from "../client/src/lib/dateUtils";
import { serializeTasyCivilDate } from "./tasyCivilDate";

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});

afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("datas civis Tasy", () => {
  it("preserva o mesmo dia do CSV na API e na exibição brasileira", () => {
    const apiValue = serializeTasyCivilDate(new Date("2026-01-01T00:00:00.000Z"));
    expect(apiValue).toBe("2026-01-01");
    expect(formatDateBR(apiValue)).toBe("01/01/2026");
  });

  it("descarta a hora sem alterar o dia civil da origem", () => {
    expect(serializeTasyCivilDate(new Date("2026-09-21T14:30:45.000Z"))).toBe("2026-09-21");
    expect(serializeTasyCivilDate("2026-09-21 14:30:45")).toBe("2026-09-21");
  });

  it("rejeita valores inválidos", () => {
    expect(serializeTasyCivilDate("inválido")).toBeNull();
    expect(serializeTasyCivilDate(null)).toBeNull();
  });
});
