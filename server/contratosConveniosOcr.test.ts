import { describe, expect, it, vi } from "vitest";
import {
  executarOcrDocumentoContrato,
  executarOcrDocumentosContrato,
} from "./contratosConveniosPdfService";
import { extrairLinhasTabelaValoresPdf } from "./contratosConveniosDossieService";

describe("OCR de PDFs Contratuais Digitalizados (ocr_necessario)", () => {
  it("extrai texto, cláusulas e itens de tabela de PDF digitalizado via file_url e promove status para concluido", async () => {
    const updates: any[] = [];
    const mockDb: any = {
      update: () => ({
        set: (values: any) => ({
          where: async () => {
            updates.push(values);
            return [{ affectedRows: 1 }, []];
          },
        }),
      }),
    };

    const chamarLLM = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              textoTranscrito: [
                "CONTRATO DE PRESTAÇÃO DE SERVIÇOS HOSPITALARES - BRADESCO SAÚDE S/A",
                "Vigência a partir de 01/03/2025. Prazo de faturamento até o dia 10 de cada mês.",
                "Prazo de pagamento em 30 dias após entrega da fatura. Prazo para recurso de glosa de 60 dias.",
                "TABELA DE PROCEDIMENTOS E DIÁRIAS NEGOCIADAS:",
                "10101012 - Consulta em consultório médico - R$ 185,00",
                "40304361 - Hemograma completo laboratorial - R$ 28,50",
              ].join("\n"),
              paginasEstimadas: 12,
              pontos: [
                {
                  categoria: "glosa_recurso",
                  titulo: "Prazo de recurso de glosa",
                  resumo:
                    "O prazo contratual para interposição de recurso de glosa é de 60 dias corridos.",
                  prioridade: "alta",
                },
                {
                  categoria: "tabelas_valores",
                  titulo: "Tabela de procedimentos negociada",
                  resumo:
                    "Consulta 10101012 pactuada a R$ 185,00 e Hemograma 40304361 a R$ 28,50.",
                  prioridade: "alta",
                },
              ],
            }),
          },
        },
      ],
    });

    const resultado = await executarOcrDocumentoContrato(
      {
        id: 42,
        contratoId: 7,
        estabelecimentoId: 10,
        nomeArquivo: "aditivo-digitalizado-bradesco.pdf",
        storageKey: "contratos-convenios/10/7/aditivo.pdf",
        paginas: null,
        status: "ocr_necessario",
        textoExtraido: "",
        pontosImportantes: [],
      },
      {
        obterUrl: async key => ({
          key,
          url: "https://storage.example.invalid/aditivo.pdf",
        }),
        chamarLLM: chamarLLM as any,
        database: mockDb,
      }
    );

    expect(chamarLLM).toHaveBeenCalledTimes(1);
    const payload = chamarLLM.mock.calls[0][0];
    expect(payload.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file_url",
          file_url: {
            url: "https://storage.example.invalid/aditivo.pdf",
            mime_type: "application/pdf",
          },
        }),
      ])
    );

    expect(resultado.status).toBe("concluido");
    expect(resultado.ocrExecutado).toBe(true);
    expect(resultado.paginas).toBe(12);
    expect(resultado.textoExtraido).toContain("10101012");
    expect(resultado.pontosImportantes.length).toBeGreaterThanOrEqual(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: "concluido",
      paginas: 12,
      erroProcessamento: null,
    });

    const itensTabela = extrairLinhasTabelaValoresPdf(
      resultado.textoExtraido,
      resultado.nomeArquivo
    );
    expect(itensTabela).toEqual(
      expect.arrayContaining([
        ["10101012", expect.any(String), 185, "aditivo-digitalizado-bradesco.pdf"],
        ["40304361", expect.any(String), 28.5, "aditivo-digitalizado-bradesco.pdf"],
      ])
    );
  });

  it("preserva ocr_necessario sem gravar no banco quando storage ou IA estão indisponíveis", async () => {
    const updates: any[] = [];
    const mockDb: any = {
      update: () => ({
        set: (values: any) => ({
          where: async () => {
            updates.push(values);
            return [{ affectedRows: 1 }, []];
          },
        }),
      }),
    };

    const semStorage = await executarOcrDocumentoContrato(
      {
        id: 1,
        contratoId: 1,
        estabelecimentoId: 10,
        nomeArquivo: "scan.pdf",
        storageKey: "inexistente/scan.pdf",
        paginas: 3,
        status: "ocr_necessario",
        textoExtraido: "",
        pontosImportantes: [],
      },
      {
        obterUrl: async () => {
          throw new Error("Storage offline");
        },
        database: mockDb,
      }
    );

    expect(semStorage).toMatchObject({
      status: "ocr_necessario",
      ocrExecutado: false,
      motivo: "storage_indisponivel",
    });
    expect(updates).toHaveLength(0);

    const semIA = await executarOcrDocumentoContrato(
      {
        id: 1,
        contratoId: 1,
        estabelecimentoId: 10,
        nomeArquivo: "scan.pdf",
        storageKey: "contratos/scan.pdf",
        paginas: 3,
        status: "ocr_necessario",
        textoExtraido: "",
        pontosImportantes: [],
      },
      {
        obterUrl: async key => ({
          key,
          url: "https://storage.example.invalid/scan.pdf",
        }),
        chamarLLM: (async () => {
          throw new Error("LLM timeout");
        }) as any,
        database: mockDb,
      }
    );

    expect(semIA).toMatchObject({
      status: "ocr_necessario",
      ocrExecutado: false,
      motivo: "ia_indisponivel",
    });
    expect(updates).toHaveLength(0);
  });

  it("executarOcrDocumentosContrato processa em lote apenas os documentos pendentes de OCR do contrato", async () => {
    const docsBanco = [
      {
        id: 10,
        contratoId: 5,
        estabelecimentoId: 1,
        nomeArquivo: "contrato-base-pesquisavel.pdf",
        storageKey: "contratos/10.pdf",
        paginas: 5,
        status: "concluido",
        textoExtraido:
          "Texto suficientemente longo já extraído na importação inicial do contrato hospitalar com mais de oitenta caracteres válidos.",
        pontosImportantes: [],
      },
      {
        id: 11,
        contratoId: 5,
        estabelecimentoId: 1,
        nomeArquivo: "aditivo-escaneado.pdf",
        storageKey: "contratos/11.pdf",
        paginas: 2,
        status: "ocr_necessario",
        textoExtraido: "",
        pontosImportantes: [],
      },
    ];
    const updates: any[] = [];
    const mockDb: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => docsBanco,
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: async () => {
            updates.push(values);
            return [{ affectedRows: 1 }, []];
          },
        }),
      }),
    };

    const lote = await executarOcrDocumentosContrato(
      { contratoId: 5, estabelecimentoId: 1 },
      {
        database: mockDb,
        obterUrl: async key => ({
          key,
          url: `https://storage.example.invalid/${key}`,
        }),
        chamarLLM: (async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  textoTranscrito:
                    "TERMO ADITIVO DIGITALIZADO - Reajuste linear de 7,5% sobre diárias, taxas e pacotes hospitalares vigentes a partir de 01/04/2026.",
                  paginasEstimadas: 2,
                  pontos: [
                    {
                      categoria: "tabelas_valores",
                      titulo: "Reajuste linear de 7,5%",
                      resumo:
                        "Aplicação de 7,5% sobre diárias, taxas e pacotes a partir de 01/04/2026.",
                      prioridade: "alta",
                    },
                  ],
                }),
              },
            },
          ],
        })) as any,
      }
    );

    expect(lote.totalPendentesOcr).toBe(1);
    expect(lote.concluidos).toBe(1);
    expect(lote.permanecemOcr).toBe(0);
    expect(lote.documentos[0].id).toBe(11);
    expect(lote.documentos[0].status).toBe("concluido");
    expect(updates).toHaveLength(1);
  });
});
