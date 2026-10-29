import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  verificarPermissaoEstabelecimento: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
  auditarConta: vi.fn(),
  auditarArquivo: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));
vi.mock("./hospitalScope", () => ({
  exigirHospitalProprietario: mocks.exigirHospitalProprietario,
  resolverHospitaisAutorizados: vi.fn(),
}));
vi.mock("./analisadorConformidadePadrao", () => ({
  AnalisadorConformidadePadrao: {
    auditarConta: mocks.auditarConta,
    auditarArquivo: mocks.auditarArquivo,
  },
}));

import { motorRegrasRouter } from "./routers/motorRegrasRouter";

const HOSPITAL_AUTORIZADO = 101;
const HOSPITAL_ALHEIO = 202;
const user = {
  id: 44,
  role: "user" as const,
  name: "Auditor de teste",
  openId: "auditor-teste",
  email: "auditor@example.test",
  loginMethod: "password",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller() {
  return motorRegrasRouter.createCaller({ user, req: {}, res: {} } as any);
}

function conta(estabelecimentoId = HOSPITAL_AUTORIZADO) {
  return {
    contaId: 1,
    codigoProcedimento: "PROC-1",
    convenioId: 9,
    estabelecimentoId,
    itens: [],
    valorTotal: 0,
  };
}

const relatorio = {
  contaId: 1,
  codigoProcedimento: "PROC-1",
  padraoId: 1,
  scoreConformidade: 100,
  statusGeral: "conforme" as const,
  divergencias: [],
  itensConformes: 0,
  itensDivergentes: 0,
  recomendacoes: [],
};

describe("motor de regras: escopo da auditoria por padrão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.exigirHospitalProprietario.mockResolvedValue(undefined);
    mocks.auditarConta.mockResolvedValue(relatorio);
    mocks.auditarArquivo.mockResolvedValue({
      totalContas: 1,
      contasConformes: 1,
      contasParcialmenteConformes: 0,
      contasNaoConformes: 0,
      scoreConformidadeMedia: 100,
      relatorios: [relatorio],
    });
  });

  it("rejeita auditoria sem hospital de origem antes de chamar o analisador", async () => {
    const { estabelecimentoId: _omitido, ...entradaSemHospital } = conta();

    await expect(caller().auditarContaPorPadrao(entradaSemHospital)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(mocks.exigirHospitalProprietario).not.toHaveBeenCalled();
    expect(mocks.auditarConta).not.toHaveBeenCalled();
  });

  it("bloqueia hospital de outro proprietário antes de analisar a conta", async () => {
    mocks.exigirHospitalProprietario.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Fora do escopo" }),
    );

    await expect(caller().auditarContaPorPadrao(conta(HOSPITAL_ALHEIO))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }), HOSPITAL_ALHEIO, "visualizar",
    );
    expect(mocks.auditarConta).not.toHaveBeenCalled();
  });

  it("valida todo lote misto antes de delegar qualquer análise", async () => {
    mocks.exigirHospitalProprietario.mockImplementation(async (_usuario, hospitalId) => {
      if (hospitalId === HOSPITAL_ALHEIO) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fora do escopo" });
      }
    });

    await expect(caller().auditarArquivoPorPadrao({
      arquivoId: 7,
      contas: [conta(HOSPITAL_AUTORIZADO), conta(HOSPITAL_ALHEIO)],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }), HOSPITAL_AUTORIZADO, "visualizar",
    );
    expect(mocks.exigirHospitalProprietario).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }), HOSPITAL_ALHEIO, "visualizar",
    );
    expect(mocks.auditarArquivo).not.toHaveBeenCalled();
  });
});
