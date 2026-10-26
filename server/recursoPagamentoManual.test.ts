import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ getDb: vi.fn() }));
import {
  dadosPagamentoManual,
  pagamentoRecursoManualSchema,
} from "./recursoPagamentoManual";
describe("recebimento manual acumulado do recurso", () => {
  it.each(["-1", "NaN", "Infinity", "1.001", "1,20", "100000000"])(
    "rejeita valor inválido %s",
    valorRecebido => {
      expect(
        pagamentoRecursoManualSchema.safeParse({
          recursoId: 1,
          valorRecebido,
          dataPagamento: "2026-10-20",
        }).success
      ).toBe(false);
    }
  );
  it("exige referência do recurso, dado e data para um recebimento positivo", () => {
    expect(
      pagamentoRecursoManualSchema.safeParse({
        recursoId: -1,
        valorRecebido: "1",
      }).success
    ).toBe(false);
    expect(
      pagamentoRecursoManualSchema.safeParse({ recursoId: 1 }).success
    ).toBe(false);
    expect(
      pagamentoRecursoManualSchema.safeParse({
        recursoId: 1,
        valorRecebido: "1",
        dataPagamento: "",
      }).success
    ).toBe(false);
  });
  it("normaliza duas casas sem converter pagamento original ou valor recursado", () => {
    expect(
      dadosPagamentoManual(
        pagamentoRecursoManualSchema.parse({
          recursoId: 1,
          valorRecebido: "5.1",
          dataPagamento: "2026-10-20",
        })
      )
    ).toEqual({
      valorRecebido: "5.10",
      dataPagamento: new Date("2026-10-20T15:00:00Z"),
    });
    expect(
      pagamentoRecursoManualSchema.safeParse({
        recursoId: 1,
        valorRecebido: "5.1",
        dataPagamento: "2026-10-20",
        valorPagoOriginal: "80",
      }).success
    ).toBe(false);
  });
  it("permite limpar campos sem produzir valor zero ou data inventada", () => {
    expect(
      dadosPagamentoManual(
        pagamentoRecursoManualSchema.parse({
          recursoId: 1,
          valorRecebido: "",
          dataPagamento: "",
        })
      )
    ).toEqual({ valorRecebido: null, dataPagamento: null });
  });
  it("rejeita data inexistente", () => {
    expect(
      pagamentoRecursoManualSchema.safeParse({
        recursoId: 1,
        dataPagamento: "2026-02-30",
      }).success
    ).toBe(false);
  });
});
