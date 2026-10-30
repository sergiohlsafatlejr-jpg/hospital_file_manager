import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scope = vi.hoisted(() => ({
  exigirAcessoFabrica: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
  resolverHospitaisAutorizados: vi.fn(),
  autorizarLoteHospitalar: vi.fn(),
}));

vi.mock("./hospitalScope", () => ({
  ...scope,
  ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001,
}));

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

import { getDb, verificarPermissaoEstabelecimento } from "./db";
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";

const user = {
  id: 71,
  role: "user",
  name: "Operador",
  email: "operador@example.test",
};

function caller() {
  return fabricaFaturamentoRouter.createCaller({ user, req: {}, res: {} } as any);
}

function selectRows(rows: unknown[]) {
  const query = Object.assign(Promise.resolve(rows), {
    limit: async () => rows,
  });
  return () => ({
    from: () => ({
      where: () => query,
    }),
  });
}

function dbForAccounts(accounts: unknown[]) {
  const update = vi.fn(() => ({ set: () => ({ where: vi.fn() }) }));
  const insert = vi.fn(() => ({ values: vi.fn() }));
  const db = {
    select: selectRows(accounts),
    update,
    insert,
    delete: vi.fn(() => ({ where: vi.fn() })),
    execute: vi.fn().mockResolvedValue([[], []]),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>): Promise<unknown> => callback(db)),
  };
  return db;
}

describe("Fábrica de Faturamento: escopo hospitalar e falha fechada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    scope.exigirAcessoFabrica.mockResolvedValue(undefined);
    scope.exigirHospitalProprietario.mockResolvedValue(undefined);
    scope.resolverHospitaisAutorizados.mockResolvedValue([20]);
    scope.autorizarLoteHospitalar.mockResolvedValue(undefined);
  });

  it("nega acesso sem central antes de consultar a Fábrica", async () => {
    scope.exigirAcessoFabrica.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à central SAFATLE." }));

    await expect(caller().listarContas()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("não permite editar conta de hospital cruzado antes de atualizar", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 31 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.exigirHospitalProprietario.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem permissão." }));

    await expect(caller().editarConta({ id: 9, nomePaciente: "Paciente seguro" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.exigirHospitalProprietario).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), 31, "editar");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("não transfere proprietário por edição mesmo com acesso aos dois hospitais", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 20 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    await expect(caller().editarConta({ id: 9, hospitalEstabelecimentoId: 31 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("bloqueia lote misto antes da primeira escrita", async () => {
    const db = dbForAccounts([
      { id: 3, hospitalEstabelecimentoId: 20, setorAtual: "faturamento" },
      { id: 4, hospitalEstabelecimentoId: 31, setorAtual: "faturamento" },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.autorizarLoteHospitalar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Lote não autorizado." }));

    await expect(caller().assumirConta({ contaIds: [3, 4] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.autorizarLoteHospitalar).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), expect.arrayContaining([
      expect.objectContaining({ hospitalEstabelecimentoId: 20 }),
      expect.objectContaining({ hospitalEstabelecimentoId: 31 }),
    ]), "editar");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("não deixa visualizador cadastrar conta nem consultar dados auxiliares", async () => {
    scope.resolverHospitaisAutorizados.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem edição." }));

    await expect(caller().cadastrarContaRecepcao({
      hospitalEstabelecimentoId: 20,
      nomePaciente: "Paciente teste",
      tipoAtendimento: "internacao",
      dataEntrada: "2026-10-01",
      dataRecebimentoSafatle: "2026-10-02",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("meta global exige gerenciamento central real antes de inserir", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().salvarMeta({ competencia: "2026-10", metaQuantidadeContas: 10 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(71, 2160001, "gerenciar");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("gerenciamento da meta hospitalar não dispensa permissão de exclusão", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 20 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.exigirHospitalProprietario.mockImplementation(async (_u, _h, acao) => {
      if (acao === "excluir") throw new TRPCError({ code: "FORBIDDEN", message: "Sem exclusão." });
    });
    await expect(caller().excluirMeta({ id: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.exigirHospitalProprietario).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), 20, "excluir");
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("converte tabela Fábrica ausente em erro de configuração e jamais em DDL", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(Object.assign(new Error("Table 'fabrica_contas' doesn't exist"), { code: "ER_NO_SUCH_TABLE" })),
    };
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(caller().listarContas()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Configuração da Fábrica de Faturamento ausente ou incompatível.",
    });
    expect(db.execute).toHaveBeenCalledTimes(2);

    const routerSource = readFileSync(
      fileURLToPath(new URL("./routers/fabricaFaturamentoRouter.ts", import.meta.url)),
      "utf8",
    );
    expect(routerSource).not.toMatch(/\b(?:CREATE|ALTER)\s+(?:TABLE|INDEX)\b/i);
    expect(routerSource).not.toContain("ensureFabricaTables");
    expect(routerSource).not.toContain(".delete(contasConvenioItens)");
    expect(routerSource).not.toContain(".delete(contasConvenioResumo)");
    expect(routerSource).toContain("arquivoHospitalId: arquivoId,");
    expect(routerSource).toContain("{ escopoContextoMedico: {");
  });

  it("exige permissão central de gerenciamento para configurar perfil de colaborador por setor", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(
      caller().salvarPerfilColaborador({
        colaboradorId: 88,
        cargoSetor: "Faturista",
        setoresPermitidos: ["faturamento"],
        hospitaisPermitidos: [20],
        verRelatoriosGerenciais: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(71, 2160001, "gerenciar");
  });

  it("exige pelo menos um XML (Conta Hospitalar ou Honorários Médicos) ao importar na conta", async () => {
    const db = dbForAccounts([{ id: 10, hospitalEstabelecimentoId: 20, setorAtual: "faturamento" }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    await expect(
      caller().importarXmlNaConta({
        fabricaContaId: 10,
        etapaXml: "faturamento",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("perfil salvo de Recepção bloqueia upload de Faturamento antes de qualquer escrita", async () => {
    const db = dbForAccounts([{ id: 10, hospitalEstabelecimentoId: 20, setorAtual: "faturamento" }]);
    db.execute.mockResolvedValue([[{ observacao: JSON.stringify({ cargoSetor: "Recepção", setoresPermitidos: ["recepcao"], hospitaisPermitidos: [20], verRelatoriosGerenciais: false }) }], []]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().importarXmlNaConta({ fabricaContaId: 10, conteudoBase64: Buffer.from("<xml>sintetico</xml>").toString("base64") }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("setor") });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("um setor autorizado não libera as demais contas de um lote misto", async () => {
    const db = dbForAccounts([{ id: 3, hospitalEstabelecimentoId: 20, setorAtual: "faturamento" }, { id: 4, hospitalEstabelecimentoId: 20, setorAtual: "auditoria_interna" }]);
    db.execute.mockResolvedValue([[{ observacao: JSON.stringify({ cargoSetor: "Faturista", setoresPermitidos: ["faturamento"], hospitaisPermitidos: [20], verRelatoriosGerenciais: true }) }], []]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().assumirConta({ contaIds: [3, 4] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("alteração de perfil preserva histórico e registra autor/data sem apagar configuração anterior", async () => {
    const db = dbForAccounts([{ id: 88, name: "Colaborador Sintético" }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    await caller().salvarPerfilColaborador({ colaboradorId: 88, cargoSetor: "Faturista", setoresPermitidos: ["faturamento"], hospitaisPermitidos: [20], verRelatoriosGerenciais: false });
    expect(db.delete).not.toHaveBeenCalled();
    const values = db.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(values.competencia).toBe("PERFIL");
    expect(JSON.parse(values.observacao).auditoria).toMatchObject({ alteradoPor: 71, alteradoEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  });

  it("perfil de Recursos permanece autorizado no setor Enviado/Recursos", async () => {
    const db = dbForAccounts([{ id: 3, hospitalEstabelecimentoId: 20, setorAtual: "enviado_convenio" }]);
    db.execute.mockResolvedValue([[{ observacao: JSON.stringify({ cargoSetor: "Recursos", setoresPermitidos: ["recursos"], hospitaisPermitidos: [20], verRelatoriosGerenciais: false }) }], []]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(verificarPermissaoEstabelecimento).mockImplementation(async (_u, hospitalId) => hospitalId !== 2160001);
    await expect(caller().assumirConta({ contaIds: [3] })).resolves.toMatchObject({ sucesso: true });
    expect(db.update).toHaveBeenCalledOnce();
  });
});
