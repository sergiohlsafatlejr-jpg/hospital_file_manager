import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verificarPermissaoEstabelecimento: vi.fn(),
  listarFaturamentoExterno: vi.fn(),
  salvarFaturamentoExternoManual: vi.fn(),
}));

vi.mock("./db", () => ({ verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento }));
vi.mock("./faturamentoExterno", () => ({
  listarFaturamentoExterno: mocks.listarFaturamentoExterno,
  listarConveniosExternos: vi.fn(),
  importarFaturamentoExterno: vi.fn(),
  excluirFaturamentoExterno: vi.fn(),
  buscarTotaisFaturamentoExterno: vi.fn(),
  buscarTotaisPorConvenioExterno: vi.fn(),
  salvarFaturamentoExternoManual: mocks.salvarFaturamentoExternoManual,
}));

import { faturamentoExternoRouter } from "./routers/faturamentoExternoRouter";

const contexto = {
  req: {},
  res: {},
  user: { id: 77, role: "user", name: "Funcionário" },
} as any;

describe("autorização do faturamento externo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listarFaturamentoExterno.mockResolvedValue([]);
    mocks.salvarFaturamentoExternoManual.mockResolvedValue({ id: 1 });
  });

  it("bloqueia a leitura de outro estabelecimento", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    const caller = faturamentoExternoRouter.createCaller(contexto);
    await expect(caller.listar({ estabelecimentoId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listarFaturamentoExterno).not.toHaveBeenCalled();
  });

  it("exige permissão de edição para salvar um lançamento manual", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
    const caller = faturamentoExternoRouter.createCaller(contexto);
    await caller.salvarManual({
      estabelecimentoId: 3,
      convenio: "Ipasgo",
      mesAno: "2026/08",
      valorFaturado: 100,
      valorRecebido: 90,
      valorGlosado: 10,
    });

    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(77, 3, "editar");
    expect(mocks.salvarFaturamentoExternoManual).toHaveBeenCalledWith(expect.objectContaining({ estabelecimentoId: 3 }), 77, "Funcionário");
  });
});
