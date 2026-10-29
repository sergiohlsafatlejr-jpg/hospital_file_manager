import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verificar: vi.fn(), getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb, verificarPermissaoEstabelecimento: mocks.verificar }));
import {
  autorizarLoteHospitalar, ESTABELECIMENTO_CENTRAL_SAFATLE as CENTRAL,
  exigirAcessoFabrica, exigirHospitalProprietario,
  filtrarHospitaisPorPermissoes, resolverHospitaisAutorizados,
} from "./hospitalScope";
const usuario = { id: 42, role: "user" };
const hospitais = [{ id: 101 }, { id: 202 }, { id: CENTRAL }];
const permissoes = [
  { userId: 42, estabelecimentoId: CENTRAL, podeVisualizar: "sim", podeEditar: "sim" },
  { userId: 42, estabelecimentoId: 101, podeVisualizar: "sim", podeEditar: "nao" },
  { userId: 43, estabelecimentoId: 202, podeVisualizar: "sim", podeEditar: "sim" },
];
function database(hospitalRows = hospitais, permissionRows = permissoes) {
  const results: unknown[][] = [hospitalRows, permissionRows];
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => results.shift() ?? []) })) })) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verificar.mockResolvedValue(true);
  mocks.getDb.mockResolvedValue(database());
});
describe("escopo central SAFATLE", () => {
  it("central não concede automaticamente outro hospital", () => {
    expect(filtrarHospitaisPorPermissoes(usuario, hospitais, permissoes, "visualizar")).toEqual([101]);
  });
  it("visualizador não recebe escopo de edição", () => {
    expect(filtrarHospitaisPorPermissoes(usuario, hospitais, permissoes, "editar")).toEqual([]);
  });
  it("admin recebe lista finita de hospitais, nunca o ID central", () => {
    expect(filtrarHospitaisPorPermissoes({ id: 1, role: "admin" }, hospitais, [], "editar")).toEqual([101, 202]);
  });
  it("usuário com permissão somente central não vê nenhum hospital", () => {
    expect(filtrarHospitaisPorPermissoes(usuario, hospitais, permissoes.slice(0, 1), "visualizar")).toEqual([]);
  });
  it("exige permissão central no servidor quando filtro é omitido", async () => {
    mocks.verificar.mockResolvedValue(false);
    await expect(resolverHospitaisAutorizados(usuario)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("filtro central retorna somente o subconjunto autorizado", async () => {
    await expect(resolverHospitaisAutorizados(usuario, CENTRAL)).resolves.toEqual([101]);
    expect(mocks.verificar).toHaveBeenCalledWith(42, CENTRAL, "visualizar");
  });
  it("falha fechado quando nenhum hospital é autorizado", async () => {
    mocks.getDb.mockResolvedValue(database(hospitais, []));
    await expect(resolverHospitaisAutorizados(usuario, CENTRAL)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("filtro normal valida a ação do hospital, sem exigir workspace central", async () => {
    mocks.getDb.mockResolvedValue(database([{ id: 101 }], permissoes));
    await expect(resolverHospitaisAutorizados(usuario, 101)).resolves.toEqual([101]);
    expect(mocks.verificar).toHaveBeenCalledWith(42, 101, "visualizar");
    expect(mocks.verificar).not.toHaveBeenCalledWith(42, CENTRAL, "visualizar");
  });
  it("não permite escrever num hospital sem permissão de edição", async () => {
    mocks.verificar.mockResolvedValue(false);
    await expect(exigirHospitalProprietario(usuario, 202, "editar")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("lote misto valida todos os proprietários antes de retornar autorização", async () => {
    mocks.verificar.mockImplementation(async (_u: number, h: number) => h === 101);
    await expect(autorizarLoteHospitalar(usuario, [{ hospitalEstabelecimentoId: 101 }, { hospitalEstabelecimentoId: 202 }], "editar"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificar).toHaveBeenCalledWith(42, 202, "editar");
  });
  it("rejeita um hospital proprietário central ou inválido", async () => {
    await expect(exigirHospitalProprietario(usuario, CENTRAL, "editar")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(exigirHospitalProprietario(usuario, 0, "editar")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.verificar).not.toHaveBeenCalled();
  });
  it("não aceita identidade cron nem lote vazio", async () => {
    await expect(exigirAcessoFabrica({ id: 0, role: "admin" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(autorizarLoteHospitalar(usuario, [], "excluir")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
