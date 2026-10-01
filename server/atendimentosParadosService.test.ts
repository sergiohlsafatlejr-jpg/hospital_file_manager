import { describe, expect, it } from "vitest";
import {
  avaliarCoberturaPublicacao,
  calcularHashConteudo,
  classificarLinha,
  converterData,
  filtrarPublicaveis,
  mapearStagingParaUnificado,
  montarLoteRef,
  montarRegistroStaging,
  normalizarOrigemSistema,
  validarOrigemId,
  type LinhaAtendimentoParado,
} from "./atendimentosParadosService";

const ESCOPO = {
  estabelecimentoId: 7,
  origemSistema: "tasy",
  loteRef: "20261001T120000Z-E7-tasy",
};

const LINHA_BASE: LinhaAtendimentoParado = {
  origemId: "12345",
  numeroAtendimento: "12345",
  paciente: "Paciente Teste",
  convenio: "Convenio Teste",
  matricula: "998877",
  conta: "555",
  dataEntrada: new Date("2026-09-01T12:00:00.000Z"),
  dataSaida: null,
  tipoAtendimento: "I",
  descricaoAtendimento: "INTERNACAO",
  codigoServico: "SERV-1",
  etapaConta: "AUDITORIA",
  valorConta: "1234.56",
};

describe("normalizarOrigemSistema", () => {
  it("grava tasy em minúsculo, que é o contrato das telas", () => {
    // server/routers.ts compara origemSistema === 'tasy' de forma sensível a caixa;
    // gravar 'TASY' faria o registro aparecer na tela com dias parado calculado errado.
    expect(normalizarOrigemSistema("tasy")).toBe("tasy");
    expect(normalizarOrigemSistema("TASY")).toBe("tasy");
    expect(normalizarOrigemSistema(" tasy ")).toBe("tasy");
  });

  it("preserva tasy_hemolabor", () => {
    expect(normalizarOrigemSistema("tasy_hemolabor")).toBe("tasy_hemolabor");
    expect(normalizarOrigemSistema("TASY_HEMOLABOR")).toBe("tasy_hemolabor");
  });

  it("grava as demais origens em maiúsculo, como já fazem Warleine e Easyvision", () => {
    expect(normalizarOrigemSistema("warleine")).toBe("WARLEINE");
    expect(normalizarOrigemSistema("Easyvision")).toBe("EASYVISION");
  });

  it("recusa origem vazia", () => {
    expect(() => normalizarOrigemSistema("")).toThrow(/origemSistema/i);
    expect(() => normalizarOrigemSistema("   ")).toThrow(/origemSistema/i);
  });
});

describe("validarOrigemId", () => {
  it("apara espaços e aceita número de atendimento", () => {
    expect(validarOrigemId(" 12345 ")).toBe("12345");
  });

  it("recusa vazio, porque a chave única depende dele", () => {
    expect(() => validarOrigemId("")).toThrow(/origemId/i);
    expect(() => validarOrigemId(null)).toThrow(/origemId/i);
    expect(() => validarOrigemId(undefined)).toThrow(/origemId/i);
  });
});

describe("montarLoteRef", () => {
  it("é determinístico para o mesmo instante e escopo", () => {
    const instante = new Date("2026-10-01T13:45:00.000Z");
    const lote = montarLoteRef(instante, 3, "warleine");
    expect(lote).toBe("20261001T134500Z-E3-WARLEINE");
    expect(montarLoteRef(instante, 3, "warleine")).toBe(lote);
  });

  it("separa estabelecimentos e origens diferentes", () => {
    const instante = new Date("2026-10-01T13:45:00.000Z");
    expect(montarLoteRef(instante, 3, "tasy")).not.toBe(montarLoteRef(instante, 4, "tasy"));
    expect(montarLoteRef(instante, 3, "tasy")).not.toBe(montarLoteRef(instante, 3, "WARLEINE"));
  });
});

describe("converterData", () => {
  it("devolve null para valores ausentes ou inválidos", () => {
    expect(converterData(null)).toBeNull();
    expect(converterData(undefined)).toBeNull();
    expect(converterData("")).toBeNull();
    expect(converterData("data-invalida")).toBeNull();
  });

  it("aceita Date e texto ISO", () => {
    expect(converterData(new Date("2026-09-01T12:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-01T12:00:00.000Z",
    );
    expect(converterData("2026-09-01T12:00:00.000Z")?.toISOString()).toBe(
      "2026-09-01T12:00:00.000Z",
    );
  });
});

describe("calcularHashConteudo", () => {
  it("ignora a ordem das chaves", () => {
    const a = calcularHashConteudo({ paciente: "A", convenio: "B" });
    const b = calcularHashConteudo({ convenio: "B", paciente: "A" });
    expect(a).toBe(b);
  });

  it("muda quando o conteúdo muda", () => {
    const a = calcularHashConteudo({ paciente: "A" });
    const b = calcularHashConteudo({ paciente: "B" });
    expect(a).not.toBe(b);
  });

  it("normaliza Date para o mesmo instante em representações diferentes", () => {
    const a = calcularHashConteudo({ dataEntrada: new Date("2026-09-01T12:00:00.000Z") });
    const b = calcularHashConteudo({ dataEntrada: new Date("2026-09-01T12:00:00.000Z") });
    expect(a).toBe(b);
  });
});

describe("classificarLinha", () => {
  it("marca como rejeitada a linha sem número de atendimento", () => {
    const resultado = classificarLinha({ ...LINHA_BASE, numeroAtendimento: "  " });
    expect(resultado.statusValidacao).toBe("rejeitado");
    expect(resultado.motivoRejeicao).toMatch(/numeroAtendimento/i);
  });

  it("marca como aviso quando a data de entrada não é utilizável", () => {
    const resultado = classificarLinha({ ...LINHA_BASE, dataEntrada: null });
    expect(resultado.statusValidacao).toBe("aviso");
    expect(resultado.motivoRejeicao).toMatch(/dataEntrada/i);
  });

  it("marca como válida a linha completa", () => {
    const resultado = classificarLinha(LINHA_BASE);
    expect(resultado.statusValidacao).toBe("valido");
    expect(resultado.motivoRejeicao).toBeNull();
  });
});

describe("filtrarPublicaveis", () => {
  it("remove apenas as rejeitadas e mantém as de aviso", () => {
    const linhas = [
      { statusValidacao: "valido" },
      { statusValidacao: "aviso" },
      { statusValidacao: "rejeitado" },
    ];
    expect(filtrarPublicaveis(linhas)).toHaveLength(2);
  });
});

describe("mapearStagingParaUnificado", () => {
  it("traduz os campos da staging para as colunas da tabela unificada", () => {
    const registro = mapearStagingParaUnificado({
      ...LINHA_BASE,
      estabelecimentoId: 7,
      origemSistema: "tasy",
    });

    expect(registro.estabelecimentoId).toBe(7);
    expect(registro.origemSistema).toBe("tasy");
    expect(registro.origemId).toBe("12345");
    expect(registro.numero_atendimento).toBe("12345");
    expect(registro.dsSetorEntrada).toBeNull();
    expect(registro.nomeProtocolo).toBeNull();
    expect(registro.ativoNaFonte).toBe(true);
  });

  it("mantém valorConta como texto, preservando a precisão decimal", () => {
    const registro = mapearStagingParaUnificado({
      ...LINHA_BASE,
      estabelecimentoId: 7,
      origemSistema: "tasy",
    });
    expect(registro.valorConta).toBe("1234.56");
  });

  it("não escreve ultimoLoteId, que pertence ao pipeline TASY por lote", () => {
    const registro = mapearStagingParaUnificado({
      ...LINHA_BASE,
      estabelecimentoId: 7,
      origemSistema: "tasy",
    });
    expect("ultimoLoteId" in registro).toBe(false);
  });
});

describe("avaliarCoberturaPublicacao", () => {
  it("libera quando a base ativa é pequena", () => {
    expect(avaliarCoberturaPublicacao(50, 1).seguro).toBe(true);
  });

  it("libera a partir de 80% de cobertura", () => {
    expect(avaliarCoberturaPublicacao(100, 80).seguro).toBe(true);
    expect(avaliarCoberturaPublicacao(100, 79).seguro).toBe(false);
  });

  it("bloqueia lote que reduziria muito o snapshot ativo e informa a cobertura", () => {
    const avaliacao = avaliarCoberturaPublicacao(1000, 200);
    expect(avaliacao.seguro).toBe(false);
    expect(avaliacao.cobertura).toBeCloseTo(20, 5);
  });

  it("considera cobertura total quando não há nada ativo", () => {
    expect(avaliarCoberturaPublicacao(0, 10).cobertura).toBe(100);
  });
});

describe("montarRegistroStaging", () => {
  it("grava lote, status e o motivo da rejeição", () => {
    const registro = montarRegistroStaging(
      { ...LINHA_BASE, numeroAtendimento: "" },
      ESCOPO,
    );
    expect(registro.loteRef).toBe(ESCOPO.loteRef);
    expect(registro.statusValidacao).toBe("rejeitado");
    expect(registro.motivoRejeicao).toMatch(/numeroAtendimento/i);
  });

  it("é determinístico: a mesma entrada gera a mesma chave e o mesmo hash", () => {
    // Contrato que impede a duplicação: recarregar o mesmo atendimento precisa produzir
    // exatamente a mesma chave de origem, para o upsert atualizar em vez de inserir.
    const primeira = montarRegistroStaging(LINHA_BASE, ESCOPO);
    const segunda = montarRegistroStaging(LINHA_BASE, ESCOPO);

    expect(primeira.origemId).toBe(segunda.origemId);
    expect(primeira.hashConteudo).toBe(segunda.hashConteudo);
    expect(primeira.hashConteudo).toHaveLength(64);
  });

  it("normaliza a origem recebida no escopo", () => {
    const registro = montarRegistroStaging(LINHA_BASE, { ...ESCOPO, origemSistema: "TASY" });
    expect(registro.origemSistema).toBe("tasy");
  });

  it("preserva a precisão do valor da conta", () => {
    const registro = montarRegistroStaging(LINHA_BASE, ESCOPO);
    expect(registro.valorConta).toBe("1234.56");
  });
});