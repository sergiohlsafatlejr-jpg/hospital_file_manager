import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));
vi.mock("./warleineFaturamentoService", () => ({
  approveWarleineSnapshotReduction: vi.fn(async () => ({ success: true, loteId: 1 })),
  getWarleineAccounts: vi.fn(async () => ({ contas: [], total: 0, resumo: {}, filtros: {} })),
  getWarleineAccountItems: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 100 })),
  getWarleineAccountDetails: vi.fn(async () => ({ conta: null, items: [], total: 0, page: 1, pageSize: 20, analysis: null })),
  compararContaWarleineComPadroes: vi.fn(async () => ({ statusGeral: "conforme", totalItensAnalisados: 0, totalDivergencias: 0 })),
  getWarleineFinancialData: vi.fn(async () => ({ meses: [], convenios: [], resumo: {}, filtros: {} })),
  getWarleineFinancialDetails: vi.fn(async () => []),
  getWarleineGlosaDashboard: vi.fn(async () => ({ resumo: {}, porMesPagamento: [], porConvenio: [], porItem: [], porProcedimento: [], porMotivo: [], recursosAnalisados: { lotes: [] } })),
  getWarleineGlosaFilters: vi.fn(async () => ({ competencias: [], convenios: [], categoriasGlosa: [] })),
  getWarleineLotSummary: vi.fn(async () => []),
}));

import { verificarAcessoModulo, verificarPermissaoEstabelecimento } from "./db";
import {
  approveWarleineSnapshotReduction,
  compararContaWarleineComPadroes,
  getWarleineAccountDetails,
  getWarleineAccounts,
  getWarleineFinancialData,
} from "./warleineFaturamentoService";
import { warleineFaturamentoRouter } from "./routers/warleineFaturamentoRouter";

function context(role: "admin" | "user" = "user") {
  return {
    user: { id: 91, openId: "warleine-user", email: "usuario@example.com", name: "Usuário", loginMethod: "password", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} },
    res: {},
  } as any;
}

describe("autorização do faturamento Warleine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nega Conta Convênio quando o usuário não pertence à unidade", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = warleineFaturamentoRouter.createCaller(context());
    await expect(caller.listarContas({ estabelecimentoId: 4, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getWarleineAccounts).not.toHaveBeenCalled();
  });

  it("nega o relatório quando falta o módulo específico", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(false);
    const caller = warleineFaturamentoRouter.createCaller(context());
    await expect(caller.faturadoRecebido({ estabelecimentoId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(91, 4, "relFaturadoRecebido");
    expect(getWarleineFinancialData).not.toHaveBeenCalled();
  });

  it("protege análise e detalhe da conta pelo módulo e estabelecimento", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(true);
    const caller = warleineFaturamentoRouter.createCaller(context());
    const input = { estabelecimentoId: 4, competencia: "2026/06", numeroConta: "conta-segura", convenioChave: "101" };

    await expect(caller.compararComPadroes(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.detalharConta({ ...input, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(compararContaWarleineComPadroes).not.toHaveBeenCalled();
    expect(getWarleineAccountDetails).not.toHaveBeenCalled();

    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    vi.mocked(verificarAcessoModulo).mockResolvedValue(false);
    await expect(caller.compararComPadroes(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarAcessoModulo).toHaveBeenCalledWith(91, 4, "contaConvenio");
    expect(compararContaWarleineComPadroes).not.toHaveBeenCalled();
  });

  it("permite ao administrador consultar somente uma unidade positiva explícita", async () => {
    const caller = warleineFaturamentoRouter.createCaller(context("admin"));
    await expect(caller.listarContas({ estabelecimentoId: 4, competenciaAno: "2026", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
    expect(getWarleineAccounts).toHaveBeenCalledWith(expect.objectContaining({ estabelecimentoId: 4, competenciaAno: "2026" }));
    await expect(caller.listarContas({ estabelecimentoId: 0, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.listarContas({ estabelecimentoId: 4, competenciaAno: "26", page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(caller.detalharConta({ estabelecimentoId: 4, competencia: "2026/06", numeroConta: "conta-admin", convenioChave: "101", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 0 });
    expect(getWarleineAccountDetails).toHaveBeenCalledWith(4, "2026/06", "conta-admin", "101", 1, 20);
  });

  it("nega aprovação excepcional a usuário comum e permite ao administrador com justificativa", async () => {
    const userCaller = warleineFaturamentoRouter.createCaller(context("user"));
    await expect(userCaller.aprovarReducaoSnapshot({ estabelecimentoId: 4, loteId: 1, motivo: "Arquivo confirmado pelo gestor" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(approveWarleineSnapshotReduction).not.toHaveBeenCalled();

    const adminCaller = warleineFaturamentoRouter.createCaller(context("admin"));
    await expect(adminCaller.aprovarReducaoSnapshot({ estabelecimentoId: 4, loteId: 1, motivo: "Arquivo confirmado pelo gestor" })).resolves.toMatchObject({ success: true });
    expect(approveWarleineSnapshotReduction).toHaveBeenCalledWith(4, 1, 91, "Arquivo confirmado pelo gestor");
  });
});
