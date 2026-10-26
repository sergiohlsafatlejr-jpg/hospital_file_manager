import { describe, expect, it } from "vitest";
import {
  callbackAindaPertenceAoEscopo,
  decimalParaCentavos,
  escopoRetornoMudou,
  haVinculoAprovadoInvalido,
  montarItensRevisao,
  sanitizarTextoExcel,
  validarArquivoProtocoloPdf,
  validarArquivoRetornoXml,
} from "../client/src/lib/retornosRecursosUi";

describe("retornosRecursosUi", () => {
  it("invalida callbacks tardios de outro convênio ou unidade", () => {
    const atual = { estabelecimentoId: 7, convenioId: 12 };

    expect(callbackAindaPertenceAoEscopo({ estabelecimentoId: 7, convenioId: 12 }, atual)).toBe(true);
    expect(callbackAindaPertenceAoEscopo({ estabelecimentoId: 8, convenioId: 12 }, atual)).toBe(false);
    expect(callbackAindaPertenceAoEscopo({ estabelecimentoId: 7, convenioId: 13 }, atual)).toBe(false);
    expect(escopoRetornoMudou(atual, { estabelecimentoId: 7, convenioId: 13 })).toBe(true);
  });

  it("limita XML e PDF aos formatos e tamanhos do contrato", () => {
    expect(validarArquivoRetornoXml({ name: "resposta.xml", size: 2 * 1024 * 1024, type: "application/xml" })).toBeNull();
    expect(validarArquivoRetornoXml({ name: "resposta.zip", size: 10, type: "application/zip" })).toMatch(/XML/);
    expect(validarArquivoRetornoXml({ name: "resposta.xml", size: 2 * 1024 * 1024 + 1, type: "application/xml" })).toMatch(/2 MB/);
    expect(validarArquivoProtocoloPdf({ name: "protocolo.pdf", size: 5 * 1024 * 1024, type: "application/pdf" })).toBeNull();
    expect(validarArquivoProtocoloPdf({ name: "protocolo.pdf", size: 5 * 1024 * 1024 + 1, type: "application/pdf" })).toMatch(/5 MB/);
  });

  it("mantém valores decimais máximos em centavos somente quando seguros", () => {
    expect(decimalParaCentavos("999999999999.99")).toBe(99999999999999);
    expect(decimalParaCentavos("1.2")).toBeNull();
    expect(decimalParaCentavos("99999999999999.99")).toBeNull();
  });

  it("revisa em lote apenas sugestões exatas e requer justificativa curta suficiente", () => {
    const linhas = [
      { id: 1, estado: "sugerido" as const, candidatos: [{ id: 21, arquivoId: 1, estabelecimentoId: 7, convenioId: 12, numeroGuia: null, sequencialItem: null, dataExecucao: null, codigoItem: null, codigoGlosa: null, valorGlosa: null, protocolo: null, lotePrestador: null, codigoPrestador: null }] },
      { id: 2, estado: "ambiguo" as const, candidatos: [{ id: 22, arquivoId: 1, estabelecimentoId: 7, convenioId: 12, numeroGuia: null, sequencialItem: null, dataExecucao: null, codigoItem: null, codigoGlosa: null, valorGlosa: null, protocolo: null, lotePrestador: null, codigoPrestador: null }, { id: 23, arquivoId: 1, estabelecimentoId: 7, convenioId: 12, numeroGuia: null, sequencialItem: null, dataExecucao: null, codigoItem: null, codigoGlosa: null, valorGlosa: null, protocolo: null, lotePrestador: null, codigoPrestador: null }] },
    ];

    expect(montarItensRevisao(linhas, [1, 2], { 1: "Justificativa válida", 2: "Justificativa válida" })).toEqual({
      itens: [{ linhaId: 1, demonstrativoId: 21, justificativa: "Justificativa válida" }],
      erro: null,
    });
    expect(montarItensRevisao(linhas, [1], { 1: "curta" }).erro).toMatch(/10 e 200/);
  });

  it("bloqueia novo recebimento se uma aprovação perdeu validade na fonte", () => {
    expect(haVinculoAprovadoInvalido([
      { estado: "aprovado", vinculoAtual: { status: "valido", demonstrativoId: 21 } },
      { estado: "sugerido", vinculoAtual: { status: "ausente" } },
    ])).toBe(false);
    expect(haVinculoAprovadoInvalido([
      { estado: "aprovado", vinculoAtual: { status: "alterado" } },
    ])).toBe(true);
    expect(haVinculoAprovadoInvalido([
      { estado: "aprovado", vinculoAtual: { status: "ausente" } },
    ])).toBe(true);
  });

  it("neutraliza fórmulas recebidas em textos exportáveis", () => {
    expect(sanitizarTextoExcel("=HYPERLINK(\"https://invalid\")")).toBe("'=HYPERLINK(\"https://invalid\")");
    expect(sanitizarTextoExcel("Paciente sintético")).toBe("Paciente sintético");
  });
});
