import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import { DEFAULT_BI_CLIENT_CONFIG } from "../shared/biPersonalizadoConfig";

const fake = vi.hoisted(() => ({
  dados: vi.fn(), obter: vi.fn(), salvar: vi.fn(), resetar: vi.fn(),
  permissao: vi.fn(),
}));
vi.mock("./painelBiPersonalizadoService", () => ({
  buscarDadosPainelBiExecutivo: fake.dados,
  obterConfiguracaoBiCliente: fake.obter,
  salvarConfiguracaoBiCliente: fake.salvar,
  resetarConfiguracaoBiCliente: fake.resetar,
}));
vi.mock("./db", () => ({ verificarPermissaoEstabelecimento: fake.permissao }));
// Este harness testa apenas a serialização do router. Guardas de relatório reais
// são exercitadas separadamente; não importar appRouter ou banco neste teste.
vi.mock("./_core/trpc", () => {
  const t = initTRPC.context<{ user: { id: number; role: string; name: string; email: string } | null }>().create();
  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
  return { router: t.router, protectedProcedure, reportProcedure: () => protectedProcedure };
});
import { painelBiPersonalizadoRouter } from "./routers/painelBiPersonalizadoRouter";

const ctx = { user: { id: 42, role: "admin", name: "Revisor fictício", email: "review@example.invalid" } };
const input = { estabelecimentoId: 101 };
const marker = "PRIVATE_SYNTHETIC_DRIVER_SQL_PAYLOAD";
beforeEach(() => { vi.resetAllMocks(); fake.permissao.mockResolvedValue(true); });

async function assertSanitized(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("expected_failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    const safe = error as TRPCError;
    expect(safe.code).toBe("INTERNAL_SERVER_ERROR");
    expect(safe.message).not.toContain(marker);
    expect(safe.cause).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain(marker);
  }
}

describe("BI Executivo — falhas públicas sanitizadas", () => {
  it("oculta erro de SQL no carregamento dos dados", async () => {
    fake.dados.mockRejectedValue(new Error(marker));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).dados({ ...input, modoFonte: "XML" }));
  });
  it("não inspeciona getters adversariais da exceção remota", async () => {
    fake.dados.mockRejectedValue(new Proxy({}, { get() { throw new Error(marker); } }));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).dados({ ...input, modoFonte: "BANCO_CSV" }));
  });
  it("oculta erro do reader da configuração", async () => {
    fake.obter.mockRejectedValue(new Error(marker));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).obterConfiguracao(input));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).obterConfiguracaoGlosas(input));
  });
  it("não declara sucesso quando salvar falha", async () => {
    fake.salvar.mockRejectedValue(new Error(marker));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).salvarConfiguracao({ ...input, config: DEFAULT_BI_CLIENT_CONFIG }));
  });
  it("não declara sucesso quando resetar falha", async () => {
    fake.resetar.mockRejectedValue(new Error(marker));
    await assertSanitized(painelBiPersonalizadoRouter.createCaller(ctx).resetarConfiguracao(input));
  });
  it("mantém a guarda de escrita antes do serviço de configuração", async () => {
    fake.permissao.mockResolvedValue(false);
    const caller = painelBiPersonalizadoRouter.createCaller({ user: { ...ctx.user, role: "user" } });
    await expect(caller.salvarConfiguracao({ ...input, config: DEFAULT_BI_CLIENT_CONFIG })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.salvar).not.toHaveBeenCalled();
  });
  it("preserva a configuração confirmada pelo serviço", async () => {
    fake.salvar.mockResolvedValue(DEFAULT_BI_CLIENT_CONFIG);
    const result = await painelBiPersonalizadoRouter.createCaller(ctx).salvarConfiguracao({ ...input, config: DEFAULT_BI_CLIENT_CONFIG });
    expect(result).toEqual({ success: true, config: DEFAULT_BI_CLIENT_CONFIG });
    expect(fake.salvar).toHaveBeenCalledWith(expect.objectContaining({ estabelecimentoId: 101, userId: 42 }));
  });
  it("bloqueia o carregamento sem autenticação antes do serviço", async () => {
    await expect(painelBiPersonalizadoRouter.createCaller({ user: null }).dados({ ...input, modoFonte: "XML" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fake.dados).not.toHaveBeenCalled();
  });
});
