import { describe, expect, it } from "vitest";
import { normalizeAtendimentoCategory, resolveAtendimentoServiceType } from "./atendimentoNormalization";

describe("padronização multi-sistema de atendimentos", () => {
  it("converte os códigos compactos do EasyVision usando a descrição sem conta", () => {
    expect(normalizeAtendimentoCategory({ tipoAtendimento: "I", descricaoAtendimento: "INTERNACAO - SEM_CONTA" })).toBe("INTERNACAO");
    expect(normalizeAtendimentoCategory({ tipoAtendimento: "E", descricaoAtendimento: "EXAME - SEM_CONTA" })).toBe("EXAME");
    expect(normalizeAtendimentoCategory({ tipoAtendimento: "A", descricaoAtendimento: "AMBULATORIO - SEM_CONTA" })).toBe("AMBULATORIO");
  });

  it("prioriza a Categoria semântica do Tasy", () => {
    expect(normalizeAtendimentoCategory({ origemSistema: "tasy", dsCategoria: "Apartamento", tipoAtendimento: "Guia" })).toBe("INTERNACAO");
    expect(normalizeAtendimentoCategory({ origemSistema: "tasy", dsCategoria: "Ambulatório" })).toBe("AMBULATORIO");
    expect(normalizeAtendimentoCategory({ origemSistema: " tasy ", dsCategoria: "Ambulatório", tipoAtendimento: "I" })).toBe("AMBULATORIO");
    expect(normalizeAtendimentoCategory({ origemSistema: "tasy", dsCategoria: "Exame" })).toBe("EXAME");
    expect(normalizeAtendimentoCategory({ origemSistema: "tasy", dsCategoria: "Ambulatório", descricaoAtendimento: "Internação auxiliar" })).toBe("AMBULATORIO");
    expect(normalizeAtendimentoCategory({ origemSistema: "tasy", dsCategoria: "Hospital Dia", tipoAtendimento: "I" })).toBe("OUTROS");
  });

  it("mantém fallback para outras origens e categorias desconhecidas", () => {
    expect(normalizeAtendimentoCategory({ origemSistema: "warleine", descricaoAtendimento: "Pronto Socorro" })).toBe("PRONTO SOCORRO");
    expect(normalizeAtendimentoCategory({ origemSistema: "outro", descricaoAtendimento: "Hospital Dia" })).toBe("OUTROS");
    expect(normalizeAtendimentoCategory({})).toBe("OUTROS");
  });

  it("resolve Tipo de Serviço conforme o campo real de cada origem", () => {
    expect(resolveAtendimentoServiceType({ origemSistema: "EASYVISION", codigoServico: "TOMOGRAFIA", descricaoAtendimento: "EXAME - SEM_CONTA" })).toBe("TOMOGRAFIA");
    expect(resolveAtendimentoServiceType({ origemSistema: "warleine", codigoServico: "UTI", descricaoAtendimento: "INTERNACAO" })).toBe("UTI");
    expect(resolveAtendimentoServiceType({ origemSistema: "tasy", dsSetorEntrada: "Recepção Matriz", codigoServico: "123" })).toBe("Recepção Matriz");
    expect(resolveAtendimentoServiceType({ origemSistema: "tasy", codigoServico: "123" })).toBe("123");
  });
});
