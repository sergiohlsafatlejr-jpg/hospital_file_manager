import { describe, expect, it } from "vitest";
import {
  hashManifestoXmlImportacao,
  hashXmlImportacaoBuffer,
} from "./xmlImportacaoLoteService";

const arquivo = (ordem: number, sufixo: string) => ({
  ordem,
  nomeArquivo: `sintetico-${sufixo}.xml`,
  tamanhoBytes: 1024 + ordem,
  sha256: `${sufixo.repeat(64)}`.slice(0, 64),
});

describe("manifesto canônico do lote XML", () => {
  it("mantém a identidade quando a coleção chega em ordem diferente", () => {
    const primeira = hashManifestoXmlImportacao({
      dataReferencia: new Date("2026-10-01T00:00:00.000Z"),
      dataPagamento: null,
      arquivos: [arquivo(2, "b"), arquivo(1, "a")],
    });
    const repeticao = hashManifestoXmlImportacao({
      dataReferencia: new Date("2026-10-01T00:00:00.000Z"),
      dataPagamento: null,
      arquivos: [arquivo(1, "a"), arquivo(2, "b")],
    });
    expect(repeticao).toBe(primeira);
  });

  it("muda quando conteúdo ou competência mudam", () => {
    const base = hashManifestoXmlImportacao({
      dataReferencia: new Date("2026-10-01T00:00:00.000Z"),
      dataPagamento: null,
      arquivos: [arquivo(1, "a")],
    });
    expect(
      hashManifestoXmlImportacao({
        dataReferencia: new Date("2026-11-01T00:00:00.000Z"),
        dataPagamento: null,
        arquivos: [arquivo(1, "a")],
      }),
    ).not.toBe(base);
    expect(
      hashManifestoXmlImportacao({
        dataReferencia: new Date("2026-10-01T00:00:00.000Z"),
        dataPagamento: null,
        arquivos: [{ ...arquivo(1, "a"), tamanhoBytes: 2048 }],
      }),
    ).not.toBe(base);
  });

  it("calcula hash estável de bytes sem transportar o conteúdo no manifesto", () => {
    expect(hashXmlImportacaoBuffer(Buffer.from("<xml />"))).toMatch(/^[a-f0-9]{64}$/);
  });
});
