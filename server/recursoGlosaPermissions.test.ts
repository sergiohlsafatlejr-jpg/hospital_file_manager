import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConvenioById: vi.fn(),
  getLoteRecursoById: vi.fn(),
  getRecursoById: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

vi.mock("./db", () => mocks);

import {
  exigirAcessoEstabelecimento,
  exigirConvenioDoEstabelecimento,
  exigirAcessoLote,
  exigirAcessoRecurso,
} from "./recursoGlosaPermissions";

describe("autorização dos recursos de glosa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige estabelecimento para listar recursos", async () => {
    await expect(exigirAcessoEstabelecimento(7, undefined)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("permite recurso criado por outro usuário quando há acesso ao estabelecimento", async () => {
    mocks.getRecursoById.mockResolvedValue({ id: 10, userId: 99, estabelecimentoId: 3 });
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);

    await expect(exigirAcessoRecurso(7, 10, "visualizar")).resolves.toMatchObject({ id: 10 });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 3, "visualizar");
  });

  it("bloqueia recurso de estabelecimento não autorizado", async () => {
    mocks.getRecursoById.mockResolvedValue({ id: 10, userId: 99, estabelecimentoId: 3 });
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);

    await expect(exigirAcessoRecurso(7, 10, "editar")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("preserva acesso do criador a recurso legado sem estabelecimento", async () => {
    mocks.getRecursoById.mockResolvedValue({ id: 10, userId: 7, estabelecimentoId: null });
    await expect(exigirAcessoRecurso(7, 10)).resolves.toMatchObject({ id: 10 });
    expect(mocks.verificarPermissaoEstabelecimento).not.toHaveBeenCalled();
  });

  it("protege os detalhes de lote pelo estabelecimento do lote", async () => {
    mocks.getLoteRecursoById.mockResolvedValue({ id: 20, estabelecimentoId: 3 });
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);

    await expect(exigirAcessoLote(7, 20)).resolves.toMatchObject({ id: 20 });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 3, "visualizar");
  });

  it("permite convênio global no estabelecimento autorizado", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.getConvenioById.mockResolvedValue({ id: 30, estabelecimentoId: null });

    await expect(exigirConvenioDoEstabelecimento(7, 30, 3, "editar")).resolves.toMatchObject({ id: 30 });
  });

  it("bloqueia convênio pertencente a outro estabelecimento", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    mocks.getConvenioById.mockResolvedValue({ id: 30, estabelecimentoId: 4 });

    await expect(exigirConvenioDoEstabelecimento(7, 30, 3, "editar")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
