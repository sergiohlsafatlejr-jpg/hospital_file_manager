import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function criarContexto(userId: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `historico-${userId}`,
    email: `historico-${userId}@example.com`,
    name: "Validação Recursos Históricos",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("rotas de recursos históricos", () => {
  it("lista todos os recursos do estabelecimento mesmo quando foram criados por outro usuário", async () => {
    const caller = appRouter.createCaller(criarContexto(1));
    const resultado = await caller.recursos.list({
      estabelecimentoId: 1,
      page: 1,
      limit: 5,
    });

    expect(resultado.total).toBe(631);
    expect(resultado.recursos.length).toBeGreaterThan(0);
    expect(resultado.recursos.every(recurso => recurso.estabelecimentoId === 1)).toBe(true);
    expect(resultado.recursos.some(recurso => recurso.userId !== 1)).toBe(true);
  }, 30_000);

  it("bloqueia a listagem para usuário sem permissão no estabelecimento", async () => {
    const caller = appRouter.createCaller(criarContexto(999_999_999));

    await expect(caller.recursos.list({
      estabelecimentoId: 1,
      page: 1,
      limit: 5,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);

  it("exige estabelecimento nas consultas de análise de glosa", async () => {
    const caller = appRouter.createCaller(criarContexto(1));

    await expect(caller.glosa.resumo({})).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 30_000);

  it("bloqueia histórico de contestações para usuário sem acesso à unidade", async () => {
    const caller = appRouter.createCaller(criarContexto(999_999_999));

    await expect(caller.recursos.historicoContestacoes({
      estabelecimentoId: 1,
      page: 1,
      limit: 20,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);

  it("consulta históricos e estatísticas somente no estabelecimento autorizado", async () => {
    const caller = appRouter.createCaller(criarContexto(1));
    const [historico, estatisticas, decisoes] = await Promise.all([
      caller.recursos.historicoContestacoes({
        estabelecimentoId: 1,
        convenioId: 1,
        page: 1,
        limit: 5,
      }),
      caller.recursos.estatisticasPorCodigo({
        estabelecimentoId: 1,
        convenioId: 1,
        codigoGlosa: "9999",
      }),
      caller.recursos.historicoDecisoes({
        estabelecimentoId: 1,
        convenioId: 1,
        codigoGlosa: "9999",
      }),
    ]);

    expect(Array.isArray(historico.items)).toBe(true);
    expect(typeof estatisticas.total).toBe("number");
    expect(typeof decisoes.totalDecisoes).toBe("number");
  }, 30_000);

  it("retorna os 133 itens persistidos do lote híbrido sem duplicação", async () => {
    const caller = appRouter.createCaller(criarContexto(1));
    const detalhes = await caller.recursos.detalhesLote({ loteId: 330001 });

    expect(detalhes?.itens).toHaveLength(133);
    expect(detalhes?.itens.filter(item => item.fonte === "demonstrativo")).toHaveLength(2);
    expect(detalhes?.itens.filter(item => item.fonte === "recursos_glosa")).toHaveLength(131);
    expect(detalhes?.itens.filter(item => item.fonte === "demonstrativo").every(item => item.editavelPagamento === false)).toBe(true);
    expect(detalhes?.historicoIncompleto).toBe(false);
  }, 30_000);

  it("exporta os 133 itens do lote híbrido com o total histórico exato", async () => {
    const caller = appRouter.createCaller(criarContexto(1));
    const exportacao = await caller.recursos.exportarLote({ loteId: 330001 });

    expect(exportacao.recursos).toHaveLength(133);
    expect(exportacao.totais.totalItens).toBe(133);
    expect(exportacao.totais.totalValorRecursado).toBeCloseTo(2207.29, 2);
  }, 30_000);

  it("preserva o lote sem itens comprováveis como pendência histórica", async () => {
    const caller = appRouter.createCaller(criarContexto(1));
    const detalhes = await caller.recursos.detalhesLote({ loteId: 300001 });

    expect(detalhes?.itens).toHaveLength(0);
    expect(detalhes?.itensRegistrados).toBe(195);
    expect(Number(detalhes?.valorTotalRecursado)).toBeCloseTo(829.14, 2);
    expect(detalhes?.historicoIncompleto).toBe(true);
  }, 30_000);
});
