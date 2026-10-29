import { describe, expect, it } from "vitest";
import {
  hashManifestoXmlImportacao,
  hashXmlImportacaoBuffer,
  mapearAcaoPublicaLoteXml,
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
      })
    ).not.toBe(base);
    expect(
      hashManifestoXmlImportacao({
        dataReferencia: new Date("2026-10-01T00:00:00.000Z"),
        dataPagamento: null,
        arquivos: [{ ...arquivo(1, "a"), tamanhoBytes: 2048 }],
      })
    ).not.toBe(base);
  });

  it("calcula hash estável de bytes sem transportar o conteúdo no manifesto", () => {
    expect(hashXmlImportacaoBuffer(Buffer.from("<xml />"))).toMatch(
      /^[a-f0-9]{64}$/
    );
  });
});

describe("ação pública do lote protegido", () => {
  it("solicita reenvio integral apenas quando o cofre falhou antes do processamento", () => {
    expect(
      mapearAcaoPublicaLoteXml({
        estado: "recebendo",
        fase: "persistir_selecao",
        erro_codigo: "STORAGE_WRITE_RESEND_REQUIRED",
      })
    ).toBe("reenvio_completo_necessario");
  });

  it("não libera ação individual durante processamento ou em estado final", () => {
    expect(
      mapearAcaoPublicaLoteXml({
        estado: "processando",
        fase: "classificar",
        erro_codigo: null,
      })
    ).toBe("processamento_em_andamento");
    expect(
      mapearAcaoPublicaLoteXml({
        estado: "concluido",
        fase: "concluir",
        erro_codigo: null,
      })
    ).toBe("sem_acao_manual");
  });
});
