import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

import { reportProcedure, router } from "./_core/trpc";
import { verificarAcessoModulo, verificarPermissaoEstabelecimento } from "./db";

const testRouter = router({
  importarLote: reportProcedure("tabelasPreco")
    .input(z.object({ estabelecimentoId: z.number().int().positive() }))
    .mutation(({ input }) => input),
});

function createContext(role: "admin" | "user" = "user") {
  return {
    user: {
      id: 91,
      openId: "usuario-tabelas-preco",
      email: "usuario@example.com",
      name: "Usuário Teste",
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

describe("autorização do lote Unimed por estabelecimento", () => {
  beforeEach(() => {
    vi.mocked(verificarPermissaoEstabelecimento).mockReset();
    vi.mocked(verificarAcessoModulo).mockReset();
  });

  it("rejeita estabelecimento ausente ou inválido inclusive para administrador", async () => {
    const caller = testRouter.createCaller(createContext("admin"));
    await expect(caller.importarLote({ estabelecimentoId: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("nega usuário sem vínculo com a unidade", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = testRouter.createCaller(createContext());

    await expect(caller.importarLote({ estabelecimentoId: 8 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(verificarAcessoModulo).not.toHaveBeenCalled();
  });

  it("nega usuário sem acesso ao módulo de tabelas de preço", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(false);
    const caller = testRouter.createCaller(createContext());

    await expect(caller.importarLote({ estabelecimentoId: 8 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(91, 8, "tabelasPreco");
  });

  it("mantém o endpoint real protegido e a interface vinculada ao lote único", () => {
    const routerSource = readFileSync("server/routers.ts", "utf8");
    const clientSource = readFileSync("client/src/pages/TabelasPreco.tsx", "utf8");
    const dbSource = readFileSync("server/db.ts", "utf8");
    const schemaSource = readFileSync("drizzle/schema.ts", "utf8");
    const migrationSource = readFileSync("drizzle/0129_glamorous_black_bolt.sql", "utf8");

    expect(routerSource).toContain('importarProcedimentosLote: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain('list: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain('create: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain('getHistorico: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain('historicoImportacoes: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain("Procedimentos Unimed devem ser importados exclusivamente pelo lote completo");
    expect(routerSource).toContain("await exigirConvenioDoEstabelecimento(");
    expect(routerSource).toContain('"gerenciar",');
    expect(routerSource).toContain("estabelecimentoId: z.number().int().positive()");
    expect(clientSource).toContain("importarProcedimentosLote.useMutation");
    expect(clientSource).toContain("As quatro etapas receberão o mesmo horário de lote.");
    expect(dbSource).toContain("AND estabelecimentoId = ?");
    expect(dbSource).toContain("AND loteHash = ?");
    expect(dbSource).toContain("eq(importacoesTabela.estabelecimentoId, estabelecimentoId)");
    expect(dbSource).toContain("await connection.rollback()");
    expect(schemaSource).toContain('loteHash: varchar("loteHash", { length: 64 })');
    expect(migrationSource).toContain("uq_importacoes_tabela_lote_fonte");
  });
});
