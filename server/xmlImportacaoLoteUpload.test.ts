import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autenticar: vi.fn(),
  getConvenio: vi.fn(),
  permissao: vi.fn(),
  modulo: vi.fn(),
  pronto: vi.fn(),
  reservar: vi.fn(),
  confirmar: vi.fn(),
  salvar: vi.fn(),
  disparar: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.autenticar },
}));
vi.mock("./db", () => ({
  getConvenioById: mocks.getConvenio,
  verificarPermissaoEstabelecimento: mocks.permissao,
  verificarAcessoModulo: mocks.modulo,
}));
vi.mock("./xmlImportacaoLoteService", () => ({
  criarIdempotencyKey: () => "chave-sintetica-000000000000",
  reservarLoteXmlImportacao: mocks.reservar,
  confirmarPersistenciaLoteXml: mocks.confirmar,
}));
vi.mock("./xmlImportacaoLoteVault", () => ({
  XML_IMPORTACAO_MAX_FILE_BYTES: 16 * 1024 * 1024,
  armazenamentoXmlImportacaoPronto: mocks.pronto,
  salvarXmlImportacaoProtegido: mocks.salvar,
}));
vi.mock("./xmlImportacaoLoteWorker", () => ({
  dispararProcessamentoLoteXml: mocks.disparar,
}));

import { xmlImportacaoLoteUploadRouter } from "./xmlImportacaoLoteUpload";

const headers = {
  "x-estabelecimento-id": "7",
  "x-convenio-id": "8",
  "x-idempotency-key": "chave-sintetica-000000000000",
  "x-data-referencia": "2026-10-01",
};

function formulario(xml = "<?xml version=\"1.0\"?><mensagemTISS />") {
  const form = new FormData();
  form.append("files", new Blob([xml], { type: "application/xml" }), "guia.xml");
  return form;
}

async function servidorTeste() {
  const app = express();
  app.use(xmlImportacaoLoteUploadRouter);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const current = app.listen(0, "127.0.0.1", () => resolve(current));
  });
  const endereco = server.address();
  if (!endereco || typeof endereco === "string") throw new Error("porta de teste indisponível");
  return { server, url: `http://127.0.0.1:${endereco.port}` };
}

describe("POST /api/xml-importacoes/lotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pronto.mockReturnValue(true);
    mocks.autenticar.mockResolvedValue({ id: 41, role: "admin", isCron: false });
    mocks.getConvenio.mockResolvedValue({ id: 8, estabelecimentoId: 7 });
    mocks.permissao.mockResolvedValue(true);
    mocks.modulo.mockResolvedValue(true);
    mocks.reservar.mockResolvedValue({
      lote: {
        id: 91,
        estado: "recebendo",
        fase: "persistir_selecao",
        totalArquivos: 1,
        totalHospitalares: 0,
        totalHonorarios: 0,
        totalBloqueados: 0,
        totalErros: 0,
      },
      itens: [
        {
          itemId: 3,
          arquivoId: 5,
          storageKey: "privado-apenas-teste",
          escopo: { loteId: 91, estabelecimentoId: 7, convenioId: 8, arquivoId: 5 },
        },
      ],
      reutilizado: false,
    });
    mocks.salvar.mockResolvedValue(undefined);
    mocks.confirmar.mockResolvedValue({
      id: 91,
      estado: "enfileirado",
      fase: "classificar",
      totalArquivos: 1,
      totalHospitalares: 0,
      totalHonorarios: 0,
      totalBloqueados: 0,
      totalErros: 0,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("autentica e autoriza antes de o multer receber o multipart", async () => {
    mocks.autenticar.mockRejectedValue(new Error("sessão inválida"));
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/xml-importacoes/lotes`, {
        method: "POST",
        headers,
        body: formulario(),
      });
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Não autenticado." });
      expect(mocks.reservar).not.toHaveBeenCalled();
      expect(mocks.salvar).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("rejeita conteúdo que não parece XML antes de reservar o lote", async () => {
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/xml-importacoes/lotes`, {
        method: "POST",
        headers,
        body: formulario("arquivo sem estrutura XML"),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Não foi possível preparar este lote XML.",
      });
      expect(mocks.reservar).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("retorna somente o resumo sanitizado depois de armazenar e enfileirar", async () => {
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/xml-importacoes/lotes`, {
        method: "POST",
        headers,
        body: formulario(),
      });
      expect(response.status).toBe(202);
      const body = await response.json();
      expect(body).toEqual({
        lote: expect.objectContaining({ id: 91, estado: "enfileirado", totalArquivos: 1 }),
        idempotencyKey: headers["x-idempotency-key"],
      });
      expect(JSON.stringify(body)).not.toContain("storageKey");
      expect(JSON.stringify(body)).not.toContain("privado-apenas-teste");
      expect(mocks.salvar).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ loteId: 91, estabelecimentoId: 7, convenioId: 8 }),
        "privado-apenas-teste",
      );
      expect(mocks.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({
          loteId: 91,
          estabelecimentoId: 7,
          convenioId: 8,
          criadoPor: 41,
          itemIdsProntos: [3],
          itemIdsFalhos: [],
        }),
      );
      expect(mocks.disparar).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
