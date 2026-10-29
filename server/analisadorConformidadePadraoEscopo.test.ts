import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { AnalisadorConformidadePadrao } from "./analisadorConformidadePadrao";

const HOSPITAL_ORIGEM = 101;
const HOSPITAL_ALHEIO = 202;
const CENTRAL = 2160001;
const CONVENIO = 9;
const dialect = new MySqlDialect();

function conta(estabelecimentoId = HOSPITAL_ORIGEM, convenioId = CONVENIO) {
  return {
    id: 1,
    codigoProcedimento: "PROC-1",
    descricaoProcedimento: "Procedimento de teste",
    estabelecimentoId,
    convenioId,
    itens: [],
    valorTotal: 0,
  };
}

function regra(id: number, estabelecimentoId: number | null, convenioId: number | null) {
  return {
    id,
    estabelecimentoId,
    convenioId,
    score_minimo_aceitavel: 70,
  };
}

function dbComRegras(regras: unknown[]) {
  const where = vi.fn();
  const regrasQuery: any = {
    from: vi.fn(() => regrasQuery),
    where: vi.fn((condition) => {
      where(condition);
      return Promise.resolve(regras);
    }),
  };
  const itensQuery: any = {
    from: vi.fn(() => itensQuery),
    where: vi.fn(async () => []),
  };
  const select = vi.fn()
    .mockImplementationOnce(() => regrasQuery)
    .mockImplementationOnce(() => itensQuery);
  mocks.getDb.mockResolvedValue({ select });
  return { select, where };
}

describe("analisador de conformidade: escopo de hospital e convênio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejeita origem ausente ou a central sem consultar regras", async () => {
    await expect(AnalisadorConformidadePadrao.auditarConta({
      ...conta(),
      estabelecimentoId: undefined as unknown as number,
    })).rejects.toThrow("hospital de origem");
    await expect(AnalisadorConformidadePadrao.auditarConta(conta(CENTRAL))).rejects.toThrow("hospital de origem");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("não usa regra de outro hospital mesmo se o repositório a devolver", async () => {
    const { select, where } = dbComRegras([regra(77, HOSPITAL_ALHEIO, CONVENIO)]);

    const resultado = await AnalisadorConformidadePadrao.auditarConta(conta());

    expect(resultado.padraoId).toBe(0);
    expect(select).toHaveBeenCalledTimes(1);
    const filtro = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(filtro.sql).toContain("estabelecimentoId");
    expect(filtro.params).toContain(HOSPITAL_ORIGEM);
    expect(filtro.params).toContain(CENTRAL);
    expect(filtro.params).toContain(CONVENIO);
    expect(filtro.params).not.toContain(HOSPITAL_ALHEIO);
  });

  it("prioriza regra da origem sobre template central e regra específica do convênio", async () => {
    const { select } = dbComRegras([
      regra(3, CENTRAL, null),
      regra(2, HOSPITAL_ORIGEM, null),
      regra(1, HOSPITAL_ORIGEM, CONVENIO),
    ]);

    const resultado = await AnalisadorConformidadePadrao.auditarConta(conta());

    expect(resultado.padraoId).toBe(1);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("aceita template central apenas como fallback genérico compatível com o convênio", async () => {
    dbComRegras([
      regra(55, CENTRAL, null),
      regra(66, CENTRAL, CONVENIO + 1),
    ]);

    const resultado = await AnalisadorConformidadePadrao.auditarConta(conta());

    expect(resultado.padraoId).toBe(55);
  });
});
