import { beforeEach, describe, expect, it, vi } from "vitest";
import { dataCivilFinanceiraSchema, dataCivilParaBanco, formatarDataCivilBR, hojeCivilBrasil, paraInputDataCivil, somarDiasCivis } from "../shared/financeiroCivilDate";
import { financeiroRouter } from "./routers/financeiroRouter";

vi.mock("./db", async importOriginal => ({ ...await importOriginal<typeof import("./db")>(), getDb: vi.fn(), verificarPermissaoEstabelecimento: vi.fn() }));
import { getDb } from "./db";

const caller = () => financeiroRouter.createCaller({ user: { id: 11, role: "admin" }, req: {}, res: {} } as any);

describe("datas civis no financeiro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mantém 25/10 na tela, no campo de edição e no Excel mesmo com payload UTC", () => {
    for (const value of ["2026-10-25", "2026-10-25T00:00:00.000Z", new Date("2026-10-25T00:00:00.000Z")]) {
      expect(formatarDataCivilBR(value)).toBe("25/10/2026");
      expect(paraInputDataCivil(value)).toBe("2026-10-25");
    }
    expect(formatarDataCivilBR(null)).toBe("-");
    expect(paraInputDataCivil(null)).toBe("");
  });

  it("valida vencimentos, datas de pagamento e recebimento, rejeitando 25/10 incompleto", () => {
    expect(dataCivilFinanceiraSchema.parse("25/10/2026")).toBe("2026-10-25");
    expect(dataCivilFinanceiraSchema.parse("2026-10-25")).toBe("2026-10-25");
    for (const invalid of ["", "25/10", "31/02/2026", "2026-10-32", "Invalid Date", "10/25/2026"]) {
      expect(dataCivilFinanceiraSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("mantém o dia civil ao salvar em DATE e considera hoje do Brasil antes da virada UTC", () => {
    expect(dataCivilParaBanco("2026-10-25").toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(hojeCivilBrasil(new Date("2026-10-25T02:30:00.000Z"))).toBe("2026-10-24");
    expect(hojeCivilBrasil(new Date("2026-10-25T16:00:00.000Z"))).toBe("2026-10-25");
    expect(somarDiasCivis("2026-12-29", 7)).toBe("2027-01-05");
    expect(somarDiasCivis("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("não abre conexão nem insere recebível quando vencimento está incompleto", async () => {
    await expect(caller().recebiveis.criar({ descricao: "Teste sintético", valor: "49.00", dataVencimento: "25/10" })).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("recusa datas inválidas em contas a pagar e no campo de pagamento antes de tocar no banco", async () => {
    const conta = { estabelecimentoId: 7, empresaId: 12, descricao: "Teste sintético", valor: "49.00" };
    await expect(caller().transacoes.criar({ ...conta, dataVencimento: "31/02/2026" })).rejects.toThrow();
    await expect(caller().transacoes.criar({ ...conta, dataVencimento: "25/10/2026", dataPagamento: "25/10" })).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("aceita 25/10/2026 e salva vencimento e recebimento na mesma data civil", async () => {
    const values = vi.fn(async (_row: unknown) => [{ insertId: 8 }]);
    vi.mocked(getDb).mockResolvedValue({ insert: () => ({ values }) } as any);
    await expect(caller().recebiveis.criar({ descricao: "Teste sintético", valor: "49.00", dataVencimento: "25/10/2026", dataRecebimento: "2026-10-25" })).resolves.toEqual({ id: 8 });
    expect(values).toHaveBeenCalledTimes(1);
    const row = values.mock.calls[0][0] as any;
    expect(row.dataVencimento.toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(row.dataRecebimento.toISOString()).toBe("2026-10-25T12:00:00.000Z");
  });

  it("rejeita lote de recebíveis com data inválida antes de qualquer inserção", async () => {
    await expect(caller().importador.importarContasReceber({ items: [
      { descricao: "Primeira", valor: "10.00", dataVencimento: "2026-10-25" },
      { descricao: "Segunda", valor: "10.00", dataVencimento: "Invalid Date" },
    ] })).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });
});
