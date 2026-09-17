import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  unidade: vi.fn(),
  modulo: vi.fn(),
}));

vi.mock("./db", () => ({
  getApplicationDatabaseUrl: vi.fn(() => "mysql://unused"),
  verificarPermissaoEstabelecimento: mocks.unidade,
  verificarAcessoModulo: mocks.modulo,
}));

import { relatoriosGlosasBiRouter, validarAcessoPainelGlosas } from "./routers/relatoriosGlosasBiRouter";

const ctxUsuario = { user: { id: 17, role: "user" } };

describe("autorização do BI de Glosas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia usuário que vê a unidade mas não possui o módulo", async () => {
    mocks.unidade.mockResolvedValue(true);
    mocks.modulo.mockResolvedValue(false);
    await expect(validarAcessoPainelGlosas(ctxUsuario, 4)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.modulo).toHaveBeenCalledWith(17, 4, "relatoriosGlosasBi");
  });

  it("bloqueia módulo liberado quando a unidade não é visível", async () => {
    mocks.unidade.mockResolvedValue(false);
    mocks.modulo.mockResolvedValue(true);
    await expect(validarAcessoPainelGlosas(ctxUsuario, 4)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("libera somente quando unidade e módulo estão autorizados", async () => {
    mocks.unidade.mockResolvedValue(true);
    mocks.modulo.mockResolvedValue(true);
    await expect(validarAcessoPainelGlosas(ctxUsuario, 4)).resolves.toBeUndefined();
  });

  it("mantém acesso administrativo", async () => {
    await expect(validarAcessoPainelGlosas({ user: { id: 1, role: "admin" } }, 4)).resolves.toBeUndefined();
    expect(mocks.unidade).not.toHaveBeenCalled();
    expect(mocks.modulo).not.toHaveBeenCalled();
  });

  it("aplica o guard do BI a todas as procedures", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/relatoriosGlosasBiRouter.ts"), "utf8");
    expect(source).not.toMatch(/^  \w+: protectedProcedure/m);
    expect(source.match(/^  \w+: biGlosasProcedure/gm)).toHaveLength(15);
  });

  it("rejeita estabelecimento zero antes de consultar o banco", async () => {
    const caller = relatoriosGlosasBiRouter.createCaller({ user: { id: 17, role: "user" } } as any);
    await expect(caller.motivosPorItem({ estabelecimentoId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
