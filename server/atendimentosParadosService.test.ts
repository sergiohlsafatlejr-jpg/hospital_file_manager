import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  UNIDADES_STAGING_ATENDIMENTOS_PARADOS,
  avaliarCoberturaPublicacao,
  calcularHashConteudo,
  classificarLinha,
  converterData,
  filtrarPublicaveis,
  mapearStagingParaUnificado,
  montarLinhaStaging,
  montarLoteRef,
  normalizarOrigemSistema,
  resolverTabelaStaging,
  validarEscopoStagingParados,
  carregarStagingParados,
  publicarAtendimentosParados,
  obterResumoStaging,
  validarOrigemId,
  type LinhaAtendimentoParado,
} from "./atendimentosParadosService";

const ESCOPO = {
  unidade: "urologico",
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

describe("tabelas de staging por unidade", () => {
  it("preserva exatamente os nomes físicos definidos pela equipe", () => {
    expect(getTableName(resolverTabelaStaging("urologico"))).toBe(
      "stagion_atendimentos_parados_urologico",
    );
    expect(getTableName(resolverTabelaStaging("iad"))).toBe("stagion_atendimentos_parados_iad_normalizada");
    expect(getTableName(resolverTabelaStaging("irg"))).toBe("stagion_atendimentos_parados_irg");
    expect(getTableName(resolverTabelaStaging("hemolabor"))).toBe(
      "stagion_atendimentos_parados_hemolabor",
    );
    expect(getTableName(resolverTabelaStaging("maternidade"))).toBe(
      "stagion_atendimentos_parados_materniadeela",
    );
  });

  it("tem uma tabela distinta por unidade", () => {
    const nomes = UNIDADES_STAGING_ATENDIMENTOS_PARADOS.map((unidade) =>
      getTableName(resolverTabelaStaging(unidade)),
    );
    expect(new Set(nomes).size).toBe(UNIDADES_STAGING_ATENDIMENTOS_PARADOS.length);
  });

  it("aceita a unidade sem diferenciar maiúsculas de minúsculas", () => {
    expect(getTableName(resolverTabelaStaging("  Urologico  "))).toBe(
      "stagion_atendimentos_parados_urologico",
    );
  });

  it("falha fechado para unidade desconhecida, listando as válidas", () => {
    expect(() => resolverTabelaStaging("cardiologia")).toThrow(/cardiologia/);
    expect(() => resolverTabelaStaging("cardiologia")).toThrow(/urologico/);
    expect(() => resolverTabelaStaging("")).toThrow(/não possui tabela de staging/i);
  });
});

describe("habilitação progressiva do piloto Urológico", () => {
  const escopoPiloto = {
    unidade: "urologico",
    estabelecimentoId: 1260036,
    origemSistema: "tasy",
    loteRef: "lote-de-teste",
  };

  it("aceita somente o ID cadastrado da unidade piloto", () => {
    expect(() => validarEscopoStagingParados(" UROLOGICO ", 1260036)).not.toThrow();
    for (const id of [0, 7, 1260037, NaN, 1.5]) {
      expect(() => validarEscopoStagingParados("urologico", id)).toThrow(/indisponível/i);
    }
  });

  it("não permite usar outra tabela com o ID da Urologia antes de habilitá-la", () => {
    for (const unidade of ["iad", "irg", "hemolabor", "maternidade"]) {
      expect(() => validarEscopoStagingParados(unidade, 1260036)).toThrow(/indisponível/i);
    }
  });

  it("rejeita carga e resumo de unidade errada antes de acessar o banco", async () => {
    const escopoErrado = { ...escopoPiloto, estabelecimentoId: 7 };
    await expect(carregarStagingParados({ ...escopoErrado, linhas: [LINHA_BASE] })).rejects.toThrow(/indisponível/i);
    await expect(obterResumoStaging(escopoErrado)).rejects.toThrow(/indisponível/i);
  });

  it("não inicia a carga se faltar identificação do lote", async () => {
    await expect(carregarStagingParados({
      ...escopoPiloto,
      loteRef: "   ",
      linhas: [LINHA_BASE],
    })).rejects.toThrow(/loteRef é obrigatório/i);
  });

  it("rejeita publicação sem snapshot completo confirmado e sem redução forçada", async () => {
    await expect(publicarAtendimentosParados(escopoPiloto)).rejects.toThrow(/snapshot completo/i);
    await expect(publicarAtendimentosParados({
      ...escopoPiloto,
      confirmarSnapshotCompleto: true,
      permitirReducaoGrande: true,
    })).rejects.toThrow(/redução forçada/i);
    await expect(publicarAtendimentosParados({
      ...escopoPiloto,
      estabelecimentoId: 7,
      confirmarSnapshotCompleto: true,
    })).rejects.toThrow(/indisponível/i);
  });

  it("não carrega nem publica o piloto após deploy ou variável de ambiente", async () => {
    const anterior = process.env.ATENDIMENTOS_PARADOS_PUBLICACAO_HABILITADA;
    process.env.ATENDIMENTOS_PARADOS_PUBLICACAO_HABILITADA = "true";
    try {
      await expect(carregarStagingParados({
        ...escopoPiloto,
        linhas: [LINHA_BASE],
      })).rejects.toThrow(/não habilitada/i);
      await expect(publicarAtendimentosParados({
        ...escopoPiloto,
        confirmarSnapshotCompleto: true,
      })).rejects.toThrow(/não habilitada/i);
    } finally {
      if (anterior === undefined) delete process.env.ATENDIMENTOS_PARADOS_PUBLICACAO_HABILITADA;
      else process.env.ATENDIMENTOS_PARADOS_PUBLICACAO_HABILITADA = anterior;
    }
  });
});

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
    expect(calcularHashConteudo({ paciente: "A", convenio: "B" })).toBe(
      calcularHashConteudo({ convenio: "B", paciente: "A" }),
    );
  });

  it("muda quando o conteúdo muda", () => {
    expect(calcularHashConteudo({ paciente: "A" })).not.toBe(
      calcularHashConteudo({ paciente: "B" }),
    );
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

describe("montarLinhaStaging", () => {
  it("grava lote, status e o motivo da rejeição", () => {
    const linha = montarLinhaStaging({ ...LINHA_BASE, numeroAtendimento: "" }, ESCOPO);
    expect(linha.loteRef).toBe(ESCOPO.loteRef);
    expect(linha.statusValidacao).toBe("rejeitado");
    expect(linha.motivoRejeicao).toMatch(/numeroAtendimento/i);
  });

  it("é determinístico: a mesma entrada gera a mesma chave e o mesmo hash", () => {
    // Contrato que impede a duplicação: recarregar o mesmo atendimento precisa produzir
    // exatamente a mesma chave de origem, para o upsert atualizar em vez de inserir.
    const primeira = montarLinhaStaging(LINHA_BASE, ESCOPO);
    const segunda = montarLinhaStaging(LINHA_BASE, ESCOPO);

    expect(primeira.origemId).toBe(segunda.origemId);
    expect(primeira.hashConteudo).toBe(segunda.hashConteudo);
    expect(primeira.hashConteudo).toHaveLength(64);
  });

  it("normaliza a origem recebida no escopo", () => {
    const linha = montarLinhaStaging(LINHA_BASE, { ...ESCOPO, origemSistema: "TASY" });
    expect(linha.origemSistema).toBe("tasy");
  });

  it("preserva a precisão do valor da conta", () => {
    expect(montarLinhaStaging(LINHA_BASE, ESCOPO).valorConta).toBe("1234.56");
  });

  it("carrega o estabelecimento informado no escopo", () => {
    expect(montarLinhaStaging(LINHA_BASE, ESCOPO).estabelecimentoId).toBe(7);
  });
});
