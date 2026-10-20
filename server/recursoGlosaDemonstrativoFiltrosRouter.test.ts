import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { MAX_RECEBIMENTO_IDS_DEMONSTRATIVO } from "../shared/recursoGlosaDemonstrativoFiltros";

const { service } = vi.hoisted(() => ({ service: {
  conveniosDemonstrativo: vi.fn(),
  datasPagamentoDemonstrativo: vi.fn(),
  itensGlosadosDemonstrativo: vi.fn(),
  itensGlosadosDetalheGuiaDemonstrativo: vi.fn(),
  itensGlosadosDetalhePorItemDemonstrativo: vi.fn(),
  itensGlosadosDetalhePorMotivoDemonstrativo: vi.fn(),
  replicarJustificativasDemonstrativo: vi.fn(),
  marcarGlosaAceitaEmLoteDemonstrativo: vi.fn(),
  gerarJustificativasIADemonstrativo: vi.fn(),
} }));

vi.mock("./faturamentoUnificadoService", () => service);

import { faturamentoUnificadoRouter } from "./routers/faturamentoUnificadoRouter";

function caller() {
  return faturamentoUnificadoRouter.createCaller({
    user: {
      id: 1,
      openId: "admin-test",
      email: "admin@example.test",
      emailCanonical: "admin@example.test",
      name: "Admin Test",
      loginMethod: "test",
      role: "admin",
      passwordHash: null,
      sessionVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext);
}

const recorte = {
  estabelecimentoId: 7,
  competencia: "2026-01",
  competencias: ["2026-02", "2026-03"],
  convenioId: 8,
  dataPagto: "2026-01-01",
  datasPagto: ["2026-02-03", "2026-03-04"],
};

describe("contratos de filtros das rotas Recurso Glosa Demonstrativo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(service).forEach(mock => mock.mockResolvedValue([]));
  });

  it("encaminha o mesmo recorte para lista, datas e detalhes, preservando arrays e scalars", async () => {
    const api = caller();
    await api.conveniosDemonstrativo(recorte);
    await api.datasPagamentoDemonstrativo(recorte);
    await api.itensGlosadosDemonstrativo({ ...recorte, agrupamento: "guia" });
    await api.itensGlosadosDetalheGuiaDemonstrativo({ ...recorte, guia: "G-1" });
    await api.itensGlosadosDetalhePorItemDemonstrativo({ ...recorte, item: "4030" });
    await api.itensGlosadosDetalhePorMotivoDemonstrativo({ ...recorte, codigoGlosa: "100" });

    expect(service.conveniosDemonstrativo).toHaveBeenCalledWith(
      7, "2026-01", ["2026-02", "2026-03"], "2026-01-01", ["2026-02-03", "2026-03-04"], 8,
    );
    expect(service.datasPagamentoDemonstrativo).toHaveBeenCalledWith(recorte);
    expect(service.itensGlosadosDemonstrativo).toHaveBeenCalledWith({ ...recorte, agrupamento: "guia" });
    expect(service.itensGlosadosDetalheGuiaDemonstrativo).toHaveBeenCalledWith({ ...recorte, guia: "G-1" });
    expect(service.itensGlosadosDetalhePorItemDemonstrativo).toHaveBeenCalledWith({ ...recorte, item: "4030" });
    expect(service.itensGlosadosDetalhePorMotivoDemonstrativo).toHaveBeenCalledWith({ ...recorte, codigoGlosa: "100" });
  });

  it("rejeita calendário inválido, IDs não positivos e paginação além do limite antes de chamar o serviço", async () => {
    const api = caller();
    await expect(api.itensGlosadosDemonstrativo({
      estabelecimentoId: 7,
      competencias: ["2026-13"],
      agrupamento: "guia",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.itensGlosadosDetalheGuiaDemonstrativo({
      estabelecimentoId: 7,
      guia: "G-1",
      datasPagto: ["2026-02-29"],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.gerarJustificativasIADemonstrativo({
      estabelecimentoId: 0,
      recebimentoIds: [11],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.itensGlosadosDemonstrativo({
      estabelecimentoId: 7,
      agrupamento: "guia",
      pageSize: 101,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(service.itensGlosadosDemonstrativo).not.toHaveBeenCalled();
    expect(service.itensGlosadosDetalheGuiaDemonstrativo).not.toHaveBeenCalled();
    expect(service.gerarJustificativasIADemonstrativo).not.toHaveBeenCalled();
  });

  it("aceita e IA exigem estabelecimento, IDs positivos e são encaminhadas com escopo explícito", async () => {
    const api = caller();
    await api.marcarGlosaAceitaEmLoteDemonstrativo({
      estabelecimentoId: 7,
      items: [{ id: 11, fonte: "demo" }],
      aceita: true,
    });
    await api.gerarJustificativasIADemonstrativo({ estabelecimentoId: 7, recebimentoIds: [11, 12] });

    expect(service.marcarGlosaAceitaEmLoteDemonstrativo).toHaveBeenCalledWith(
      [{ id: 11, fonte: "demo" }], true, "Admin Test", 7,
    );
    expect(service.gerarJustificativasIADemonstrativo).toHaveBeenCalledWith({ estabelecimentoId: 7, recebimentoIds: [11, 12] });
    await expect(api.marcarGlosaAceitaEmLoteDemonstrativo({
      estabelecimentoId: 7,
      items: [{ id: 0, fonte: "demo" }],
      aceita: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("aceita 767 itens no lote e rejeita somente acima do máximo compartilhado", async () => {
    const api = caller();
    const items = Array.from({ length: 767 }, (_, index) => ({ id: index + 1, fonte: "demo" }));

    await api.marcarGlosaAceitaEmLoteDemonstrativo({
      estabelecimentoId: 7,
      items,
      aceita: true,
    });

    expect(service.marcarGlosaAceitaEmLoteDemonstrativo).toHaveBeenCalledWith(
      items, true, "Admin Test", 7,
    );
    await expect(api.marcarGlosaAceitaEmLoteDemonstrativo({
      estabelecimentoId: 7,
      items: Array.from(
        { length: MAX_RECEBIMENTO_IDS_DEMONSTRATIVO + 1 },
        (_, index) => ({ id: index + 1, fonte: "demo" }),
      ),
      aceita: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("replicação recebe IDs visíveis e aceita seleção vazia sem transformar a entrada", async () => {
    const api = caller();
    await api.replicarJustificativasDemonstrativo({
      ...recorte,
      recebimentoIds: [],
      item: "4030",
      codigoGlosa: "100",
      justificativa: "Justificativa",
    });

    expect(service.replicarJustificativasDemonstrativo).toHaveBeenCalledWith({
      ...recorte,
      recebimentoIds: [],
      item: "4030",
      codigoGlosa: "100",
      justificativa: "Justificativa",
    });
  });
});
