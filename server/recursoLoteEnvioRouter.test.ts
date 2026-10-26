import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({
  acesso: vi.fn(),
  confirmar: vi.fn(),
  atualizar: vi.fn(),
  enviar: vi.fn(),
  exportar: vi.fn(),
  acessoRecurso: vi.fn(),
  atualizarRecurso: vi.fn(),
  buscarRecurso: vi.fn(),
  recalcular: vi.fn(),
}));
vi.mock("./recursoGlosaPermissions", () => ({
  exigirAcessoLote: mocks.acesso,
  exigirAcessoEstabelecimento: vi.fn(),
  exigirAcessoRecurso: mocks.acessoRecurso,
  exigirConvenioDoEstabelecimento: vi.fn(),
}));
vi.mock("./recursoLoteEnvioService", async importOriginal => {
  const original =
    await importOriginal<typeof import("./recursoLoteEnvioService")>();
  return { ...original, confirmarEnvioLote: mocks.confirmar };
});
vi.mock("./db", () => ({
  atualizarLoteRecurso: mocks.atualizar,
  enviarLoteRecurso: mocks.enviar,
  getRecursosLoteParaExportacao: mocks.exportar,
  verificarPermissaoEstabelecimento: vi.fn().mockResolvedValue(true),
  updateRecursoGlosa: mocks.atualizarRecurso,
  getRecursoById: mocks.buscarRecurso,
  recalcularTotalLote: mocks.recalcular,
}));
import { appRouter } from "./routers";
const ctx = {
  user: { id: 5, role: "user", name: "Usuário sintético" },
  req: {},
  res: {},
} as TrpcContext;
const input = {
  loteId: 12,
  protocoloEnvio: "PROTOCOLO-QA",
  dataEnvio: "2026-10-20",
  confirmar: true as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.acesso.mockResolvedValue({
    id: 12,
    estabelecimentoId: 9,
    convenioId: 7,
    status: "pendente_envio",
  });
  mocks.confirmar.mockResolvedValue({ success: true, jaConfirmado: false });
  mocks.exportar.mockResolvedValue({
    lote: { id: 12 },
    recursos: [{ id: 15 }],
    totais: {},
  });
  mocks.acessoRecurso.mockResolvedValue({
    id: 15,
    estabelecimentoId: 9,
    convenioId: 7,
  });
  mocks.buscarRecurso.mockResolvedValue({ id: 15, loteId: 12 });
});
describe("recursos: confirmação de envio explícita e autorização", () => {
  it("exige sessão antes da confirmação", async () => {
    await expect(
      appRouter
        .createCaller({ ...ctx, user: null })
        .recursos.confirmarEnvioLote(input)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.confirmar).not.toHaveBeenCalled();
  });
  it("autoriza edição do lote e deriva seu escopo no servidor", async () => {
    await appRouter.createCaller(ctx).recursos.confirmarEnvioLote(input);
    expect(mocks.acesso).toHaveBeenCalledWith(5, 12, "editar");
    expect(mocks.confirmar).toHaveBeenCalledWith(input, 5, {
      estabelecimentoId: 9,
      convenioId: 7,
    });
  });
  it("bloqueia outra unidade antes de confirmar", async () => {
    mocks.acesso.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" })
    );
    await expect(
      appRouter.createCaller(ctx).recursos.confirmarEnvioLote(input)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.confirmar).not.toHaveBeenCalled();
  });
  it("rejeita protocolo vazio, confirmação ausente e escopo enviado pelo cliente", async () => {
    for (const invalid of [
      { ...input, protocoloEnvio: " " },
      { ...input, confirmar: false },
      { ...input, estabelecimentoId: 8 },
    ]) {
      await expect(
        appRouter.createCaller(ctx).recursos.confirmarEnvioLote(invalid as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.confirmar).not.toHaveBeenCalled();
  });
  it("exporta relatório sem chamar nenhuma operação de envio", async () => {
    await appRouter.createCaller(ctx).recursos.exportarLote({ loteId: 12 });
    expect(mocks.acesso).toHaveBeenCalledWith(5, 12, "visualizar");
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.atualizar).not.toHaveBeenCalled();
    expect(mocks.confirmar).not.toHaveBeenCalled();
  });
  it.each(["enviado", "em_analise", "respondido", "finalizado"])(
    "não permite iniciar %s pela atualização genérica",
    async status => {
      await expect(
        appRouter
          .createCaller(ctx)
          .recursos.atualizarLote({ loteId: 12, status: status as any })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.atualizar).not.toHaveBeenCalled();
    }
  );
  it("não permite registrar dataEnvio pela atualização genérica", async () => {
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.atualizarLote({ loteId: 12, dataEnvio: new Date() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
  it.each([
    "pendente_envio",
    "enviado",
    "em_analise",
    "respondido",
    "finalizado",
  ])("protege o protocolo de %s na rota genérica", async status => {
    mocks.acesso.mockResolvedValue({
      estabelecimentoId: 9,
      convenioId: 7,
      status,
    });
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.atualizarLote({ loteId: 12, protocoloEnvio: "OUTRO" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
  it("não regrede um lote respondido para pendente", async () => {
    mocks.acesso.mockResolvedValue({
      estabelecimentoId: 9,
      convenioId: 7,
      status: "respondido",
    });
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.atualizarLote({ loteId: 12, status: "pendente_envio" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.atualizar).not.toHaveBeenCalled();
  });
  it("bloqueia o atalho legado sem confirmação", async () => {
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.enviarLote({ loteId: 12, protocoloEnvio: "PROTOCOLO-QA" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });
  it("registra somente recebimento manual do recurso, sem tocar acatamento ou pago original", async () => {
    await appRouter
      .createCaller(ctx)
      .recursos.atualizarPagamentoItem({
        recursoId: 15,
        valorRecebido: "5.10",
        dataPagamento: "2026-10-20",
      });
    expect(mocks.acessoRecurso).toHaveBeenCalledWith(5, 15, "editar");
    expect(mocks.atualizarRecurso).toHaveBeenCalledWith(
      15,
      5,
      {
        valorRecebido: "5.10",
        dataPagamento: new Date("2026-10-20T15:00:00Z"),
      },
      "Atualização de pagamento do recurso"
    );
    expect(mocks.recalcular).toHaveBeenCalledWith(12);
  });
  it("bloqueia a gravação manual em recurso de outra unidade", async () => {
    mocks.acessoRecurso.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" })
    );
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.atualizarPagamentoItem({
          recursoId: 15,
          valorRecebido: "5.10",
          dataPagamento: "2026-10-20",
        })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.atualizarRecurso).not.toHaveBeenCalled();
  });
  it("rejeita campos do pagamento original no lançamento do recurso", async () => {
    await expect(
      appRouter
        .createCaller(ctx)
        .recursos.atualizarPagamentoItem({
          recursoId: 15,
          valorRecebido: "5.10",
          dataPagamento: "2026-10-20",
          valorPagoOriginal: "80",
        } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.atualizarRecurso).not.toHaveBeenCalled();
  });
});
