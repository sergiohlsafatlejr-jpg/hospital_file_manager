import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autenticar: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.autenticar },
}));
vi.mock("./prontuarioPdfService", () => ({
  prontuarioPdfUpload: mocks.upload,
}));

import { registrarUploadProntuarioPdf } from "./prontuarioPdfUpload";

const scope = {
  estabelecimentoId: "7",
  convenioId: "8",
  arquivoHospitalId: "9",
  numeroConta: "CONTA-SINTETICA",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
  nomeArquivo: "prontuario-sintetico.pdf",
  confirmar: "true",
};

async function servidorTeste() {
  const app = express();
  registrarUploadProntuarioPdf(app);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const current = app.listen(0, "127.0.0.1", () => resolve(current));
  });
  const endereco = server.address();
  if (!endereco || typeof endereco === "string")
    throw new Error("porta de teste indisponível");
  return { server, url: `http://127.0.0.1:${endereco.port}` };
}

function formulario(
  nomeArquivo = scope.nomeArquivo,
  nomeArquivoDeclarado = scope.nomeArquivo,
  bytes = "%PDF-1.7\nfixture"
) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "application/pdf" }), nomeArquivo);
  for (const [campo, valor] of Object.entries({
    ...scope,
    nomeArquivo: nomeArquivoDeclarado,
  }))
    form.set(campo, valor);
  return form;
}

describe("POST /api/prontuario-pdf/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.autenticar.mockResolvedValue({ id: 41, isCron: false });
    mocks.upload.mockResolvedValue({
      id: 22,
      nomeArquivo: scope.nomeArquivo,
      tamanhoBytes: 18,
      storageKey: "nunca-publicar",
      sha256: "nunca-publicar",
      url: "https://nunca-publicar.invalid",
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("autentica antes do multipart e retorna somente id, nome e tamanho", async () => {
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/prontuario-pdf/upload`, {
        method: "POST",
        body: formulario(),
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        id: 22,
        nomeArquivo: scope.nomeArquivo,
        tamanhoBytes: 18,
      });
      expect(mocks.autenticar).toHaveBeenCalledTimes(1);
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          estabelecimentoId: 7,
          convenioId: 8,
          arquivoHospitalId: 9,
          numeroConta: scope.numeroConta,
          numeroLote: scope.numeroLote,
          competencia: scope.competencia,
          nomeArquivo: scope.nomeArquivo,
          confirmar: true,
          arquivo: expect.any(Buffer),
        }),
        41
      );
      const input = mocks.upload.mock.calls[0]![0];
      expect(input.arquivo.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(input).not.toHaveProperty("conteudoBase64");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("recusa requisição não autenticada antes de enviar ao serviço", async () => {
    mocks.autenticar.mockRejectedValue(new Error("sessão inválida"));
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/prontuario-pdf/upload`, {
        method: "POST",
        body: formulario(),
      });
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Não autenticado.",
      });
      expect(mocks.upload).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("recusa metadados inconsistentes sem chamar o serviço", async () => {
    const { server, url } = await servidorTeste();
    try {
      const response = await fetch(`${url}/api/prontuario-pdf/upload`, {
        method: "POST",
        body: formulario("outro.pdf", scope.nomeArquivo),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "O nome do arquivo não confere com os metadados.",
      });
      expect(mocks.upload).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
