import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  permissao: vi.fn(),
  prever: vi.fn(),
  importar: vi.fn(),
  listar: vi.fn(),
  detalhe: vi.fn(),
  rebuscar: vi.fn(),
  revisar: vi.fn(),
  anexarProtocolo: vi.fn(),
  arquivo: vi.fn(),
  registrarPagamento: vi.fn(),
  estornarPagamento: vi.fn(),
}));

vi.mock("./db", () => ({
  verificarPermissaoEstabelecimento: mocks.permissao,
}));

vi.mock("./retornosRecursosService", () => ({
  retornosPrever: mocks.prever,
  retornosImportar: mocks.importar,
  retornosListar: mocks.listar,
  retornosDetalhe: mocks.detalhe,
  retornosRebuscar: mocks.rebuscar,
  retornosRevisar: mocks.revisar,
  retornosAnexarProtocolo: mocks.anexarProtocolo,
  retornosArquivo: mocks.arquivo,
  retornosRegistrarPagamento: mocks.registrarPagamento,
  retornosEstornarPagamento: mocks.estornarPagamento,
}));

import { appRouter } from "./routers";

const userId = 41;
const escopo = { estabelecimentoId: 7, convenioId: 8 };
const uuidRecebimento = "123e4567-e89b-42d3-a456-426614174000";
const uuidEstorno = "123e4567-e89b-42d3-a456-426614174001";

function context(role: "admin" | "user" | null = "user"): TrpcContext {
  return {
    user: role ? { id: userId, role, openId: "retornos-router-test", name: "Usuário de teste" } : null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

function caller(role: "admin" | "user" | null = "user") {
  return appRouter.createCaller(context(role));
}

const previa = { ...escopo, conteudoBase64: "YWJjZA==" };
const importarPortal = {
  ...previa,
  nomeArquivo: "resposta-cassi.xml",
  origemRecurso: "portal" as const,
  lotePortalId: 9,
  tokenPrevia: "t".repeat(20),
  confirmar: true as const,
};
const detalhe = { ...escopo, importacaoId: 12 };
const revisar = {
  ...detalhe,
  itens: [{ linhaId: 13, demonstrativoId: 14, justificativa: "Justificativa válida" }],
  confirmar: true as const,
  confirmarDivergenciasCabecalho: true,
};
const anexo = {
  ...detalhe,
  nomeArquivo: "protocolo-cassi.pdf",
  conteudoBase64: "JVBERi0=",
  confirmar: true as const,
};
const pagamento = {
  ...detalhe,
  valor: "10.00",
  dataRecebimento: "2026-10-20",
  referencia: "REC-001",
  observacao: "Comprovante conferido",
  chaveOperacao: uuidRecebimento,
  confirmar: true as const,
};
const estorno = {
  ...detalhe,
  pagamentoId: 15,
  dataEstorno: "2026-10-21",
  justificativa: "Estorno documentado",
  chaveOperacao: uuidEstorno,
  confirmar: true as const,
};

const services = [
  mocks.prever,
  mocks.importar,
  mocks.listar,
  mocks.detalhe,
  mocks.rebuscar,
  mocks.revisar,
  mocks.anexarProtocolo,
  mocks.arquivo,
  mocks.registrarPagamento,
  mocks.estornarPagamento,
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissao.mockResolvedValue(true);
  services.forEach(service => service.mockResolvedValue({ ok: true }));
});

describe("retornosRecursos", () => {
  it("encaminha os dez contratos validados ao service somente com o id do usuário autenticado", async () => {
    const api = caller();
    const listar = { ...escopo, pagina: 2, limite: 50 };
    const arquivo = { ...detalhe, tipo: "xml" as const };

    await api.retornosRecursos.prever(previa);
    await api.retornosRecursos.importar(importarPortal);
    await api.retornosRecursos.listar(listar);
    await api.retornosRecursos.detalhe(detalhe);
    await api.retornosRecursos.rebuscar(detalhe);
    await api.retornosRecursos.revisar(revisar);
    await api.retornosRecursos.anexarProtocolo(anexo);
    await api.retornosRecursos.arquivo(arquivo);
    await api.retornosRecursos.registrarPagamento(pagamento);
    await api.retornosRecursos.estornarPagamento(estorno);

    expect(mocks.prever).toHaveBeenCalledWith(previa, userId);
    expect(mocks.importar).toHaveBeenCalledWith(importarPortal, userId);
    expect(mocks.listar).toHaveBeenCalledWith(listar, userId);
    expect(mocks.detalhe).toHaveBeenCalledWith(detalhe, userId);
    expect(mocks.rebuscar).toHaveBeenCalledWith(detalhe, userId);
    expect(mocks.revisar).toHaveBeenCalledWith(revisar, userId);
    expect(mocks.anexarProtocolo).toHaveBeenCalledWith(anexo, userId);
    expect(mocks.arquivo).toHaveBeenCalledWith(arquivo, userId);
    expect(mocks.registrarPagamento).toHaveBeenCalledWith(pagamento, userId);
    expect(mocks.estornarPagamento).toHaveBeenCalledWith(estorno, userId);
    expect(mocks.permissao).toHaveBeenCalledTimes(10);
    expect(mocks.permissao).toHaveBeenCalledWith(userId, escopo.estabelecimentoId, "visualizar");
  });

  it("aplica os valores padrão compartilhados de paginação antes de chamar o service", async () => {
    await caller().retornosRecursos.listar(escopo);

    expect(mocks.listar).toHaveBeenCalledWith({ ...escopo, pagina: 1, limite: 20 }, userId);
  });

  it("exige sessão e a permissão de visualizar a unidade antes de alcançar o service", async () => {
    await expect(caller(null).retornosRecursos.prever(previa)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.prever).not.toHaveBeenCalled();

    mocks.permissao.mockResolvedValue(false);
    await expect(caller().retornosRecursos.prever(previa)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.prever).not.toHaveBeenCalled();
  });

  it.each([
    ["prever", { ...previa, campoArbitrario: "não permitido" }],
    ["importar", { ...importarPortal, campoArbitrario: "não permitido" }],
    ["listar", { ...escopo, campoArbitrario: "não permitido" }],
    ["detalhe", { ...detalhe, campoArbitrario: "não permitido" }],
    ["rebuscar", { ...detalhe, campoArbitrario: "não permitido" }],
    ["revisar", { ...revisar, campoArbitrario: "não permitido" }],
    ["anexarProtocolo", { ...anexo, campoArbitrario: "não permitido" }],
    ["arquivo", { ...detalhe, tipo: "xml", campoArbitrario: "não permitido" }],
    ["registrarPagamento", { ...pagamento, campoArbitrario: "não permitido" }],
    ["estornarPagamento", { ...estorno, campoArbitrario: "não permitido" }],
  ])("rejeita campos arbitrários no contrato estrito de %s", async (method, input) => {
    await expect((caller().retornosRecursos as any)[method](input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.every(service => service.mock.calls.length === 0)).toBe(true);
  });

  it("rejeita limites, confirmação explícita e a regra de lote da origem Portal antes do service", async () => {
    const api = caller();
    await expect(api.retornosRecursos.listar({ ...escopo, limite: 51 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.retornosRecursos.revisar({
      ...detalhe,
      itens: Array.from({ length: 201 }, (_, index) => ({
        linhaId: index + 1,
        demonstrativoId: index + 1,
        justificativa: "Justificativa válida",
      })),
      confirmar: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.retornosRecursos.importar({ ...importarPortal, lotePortalId: undefined })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.retornosRecursos.importar({ ...importarPortal, origemRecurso: "externo", lotePortalId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.retornosRecursos.registrarPagamento({ ...pagamento, confirmar: false } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.every(service => service.mock.calls.length === 0)).toBe(true);
  });
});
