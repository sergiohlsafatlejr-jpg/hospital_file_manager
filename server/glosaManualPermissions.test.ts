import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConvenioById: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  getDb: vi.fn(() => { throw new Error("Pool externo proibido no teste"); }),
}));
vi.mock("./db", () => mocks);
import { exigirPermissaoGlosaManual } from "./glosaManualPermissions";

const convenio = { id: 31, estabelecimentoId: 13, ativo: "sim" };

describe("Issue163: autorização de escrita manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.getConvenioById.mockResolvedValue(convenio);
  });

  it("exige editar mesmo para usuário que já pode visualizar", async () => {
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_user, _hospital, tipo) => tipo === "visualizar");
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 13, "editar");
    expect(mocks.getConvenioById).not.toHaveBeenCalled();
  });

  it("aceita hospital autorizado e convênio canônico ativo proprietário", async () => {
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).resolves.toEqual(convenio);
    expect(mocks.getConvenioById).toHaveBeenCalledWith(31);
  });

  it("aceita convênio GLOBAL ativo por ID explícito sem alterar o proprietário NULL", async () => {
    const global = Object.freeze({ ...convenio, estabelecimentoId: null, nome: "CASSI sintético" });
    mocks.getConvenioById.mockResolvedValue(global);
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).resolves.toBe(global);
    await expect(exigirPermissaoGlosaManual(7, 14, 31)).resolves.toBe(global);
    expect(global.estabelecimentoId).toBeNull();
    expect(mocks.getConvenioById.mock.calls).toEqual([[31], [31]]);
    expect(mocks.verificarPermissaoEstabelecimento.mock.calls).toEqual([[7, 13, "editar"], [7, 14, "editar"]]);
  });

  it("global não amplia autorização para outro hospital", async () => {
    mocks.getConvenioById.mockResolvedValue({ ...convenio, estabelecimentoId: null });
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_user, hospital) => hospital === 13);
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).resolves.toMatchObject({ estabelecimentoId: null });
    await expect(exigirPermissaoGlosaManual(7, 14, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getConvenioById).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["outro hospital", { ...convenio, estabelecimentoId: 14 }],
    ["sem proprietário", { ...convenio, estabelecimentoId: undefined }],
    ["proprietário zero", { ...convenio, estabelecimentoId: 0 }],
    ["proprietário string", { ...convenio, estabelecimentoId: "13" }],
    ["global inativo", { ...convenio, estabelecimentoId: null, ativo: "nao" }],
    ["inativo", { ...convenio, ativo: "nao" }],
    ["sem status", { ...convenio, ativo: undefined }],
    ["ID divergente", { ...convenio, id: 32 }],
    ["ID string", { ...convenio, id: "31" }],
    ["inexistente", null],
  ])("bloqueia convênio %s", async (_label, row) => {
    mocks.getConvenioById.mockResolvedValue(row);
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    [0, 13, 31], [7, 0, 31], [7, 13, 0], [7, 13.1, 31], [7, 13, 2_147_483_648],
    [7, null, 31], [7, undefined, 31], [7, "13", 31], [7, 13, undefined],
    [7, 13, "31"], [7, 13, NaN],
  ])("nega identificadores inválidos (%s, %s, %s) sem I/O", async (user, hospital, conv) => {
    await expect(exigirPermissaoGlosaManual(user as number, hospital as number, conv as number)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.verificarPermissaoEstabelecimento).not.toHaveBeenCalled();
    expect(mocks.getConvenioById).not.toHaveBeenCalled();
  });

  it("repassa a conexão injetada às duas consultas sem entrar no pool", async () => {
    const connection = { select: vi.fn() } as any;
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (...args) => {
      expect(args[3]).toBe(connection);
      return true;
    });
    mocks.getConvenioById.mockImplementation(async (...args) => {
      expect(args[1]).toBe(connection);
      return convenio;
    });
    await expect(exigirPermissaoGlosaManual(7, 13, 31, connection)).resolves.toEqual(convenio);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("nega na conexão injetada antes de consultar o convênio", async () => {
    const connection = { select: vi.fn() } as any;
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(exigirPermissaoGlosaManual(7, 13, 31, connection)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 13, "editar", connection);
    expect(mocks.getConvenioById).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("aceita GLOBAL na conexão injetada sem consultar pool nem fazer fallback por nome", async () => {
    const connection = { select: vi.fn() } as any;
    const global = { ...convenio, estabelecimentoId: null };
    mocks.getConvenioById.mockResolvedValue(global);
    await expect(exigirPermissaoGlosaManual(7, 13, 31, connection)).resolves.toBe(global);
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 13, "editar", connection);
    expect(mocks.getConvenioById).toHaveBeenCalledWith(31, connection);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("falha fechado em erro de autorização", async () => {
    mocks.verificarPermissaoEstabelecimento.mockRejectedValue(new Error("Falha simulada"));
    await expect(exigirPermissaoGlosaManual(7, 13, 31)).rejects.toThrow("Falha simulada");
    expect(mocks.getConvenioById).not.toHaveBeenCalled();
  });
});
