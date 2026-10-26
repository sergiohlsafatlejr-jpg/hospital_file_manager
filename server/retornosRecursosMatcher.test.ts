import { describe, expect, it } from "vitest";
import type { RetornoCandidato, RetornoEscopo, RetornoXmlLinha } from "../shared/retornosRecursos";
import {
  chaveEstavelDemonstrativo,
  sugerirVinculoRetorno,
  validarCandidatoRetorno,
} from "./retornosRecursosMatcher";

const escopo: RetornoEscopo = { estabelecimentoId: 10, convenioId: 20 };

function linha(overrides: Partial<RetornoXmlLinha> = {}): RetornoXmlLinha {
  return {
    posicao: 1,
    guiaPrestador: "GUIA-PREST-1",
    guiaOperadora: "GUIA-OPER-1",
    sequencialItem: "7",
    dataExecucao: "2026-01-15",
    codigoTabela: "22",
    codigoItem: "10101012",
    codigoGlosa: "1001",
    valorRecursado: "10.00",
    valorAcatado: "5.00",
    justificativaPrestador: "Justificativa sintética do prestador.",
    justificativaOperadora: "Justificativa sintética da operadora.",
    ...overrides,
  };
}

function candidato(overrides: Partial<RetornoCandidato> = {}): RetornoCandidato {
  return {
    id: 1,
    arquivoId: 100,
    estabelecimentoId: 10,
    convenioId: 20,
    numeroGuia: "GUIA-PREST-1",
    sequencialItem: 7,
    dataExecucao: "2026-01-15",
    codigoItem: "10101012",
    codigoGlosa: "1001",
    valorGlosa: "10.00",
    protocolo: "PROTO-1",
    lotePrestador: "LOTE-1",
    codigoPrestador: "PREST-1",
    nomeBeneficiario: "Nome sintético",
    carteiraBeneficiario: "CARTEIRA-1",
    descricaoItem: "Descrição sintética",
    ...overrides,
  };
}

describe("retornosRecursosMatcher", () => {
  it("sugere candidato hospitalar com todas as chaves exatas", () => {
    const resultado = sugerirVinculoRetorno(linha(), [candidato()], escopo);
    expect(resultado.estado).toBe("sugerido");
    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.motivo).toContain("código de tabela não verificado");
  });

  it("exige estabelecimento exato", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ estabelecimentoId: 11 }), escopo)).toBe(false);
  });

  it("exige convênio exato", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ convenioId: 21 }), escopo)).toBe(false);
  });

  it("aceita guia do prestador exata", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ numeroGuia: "GUIA-PREST-1" }), escopo)).toBe(true);
  });

  it("aceita guia da operadora exata", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ numeroGuia: "GUIA-OPER-1" }), escopo)).toBe(true);
  });

  it("não aproxima nem remove caracteres da guia", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ numeroGuia: "GUIAPREST1" }), escopo)).toBe(false);
  });

  it("exige código de item exato", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ codigoItem: "10101013" }), escopo)).toBe(false);
  });

  it("exige data de execução exata", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ dataExecucao: "2026-01-16" }), escopo)).toBe(false);
  });

  it("não cria vínculo quando a linha não tem data", () => {
    const resultado = sugerirVinculoRetorno(linha({ dataExecucao: null }), [candidato()], escopo);
    expect(resultado.estado).toBe("sem_vinculo");
  });

  it("exige código de glosa exato", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ codigoGlosa: "1002" }), escopo)).toBe(false);
  });

  it("não divide múltiplos motivos de glosa para criar equivalência", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ codigoGlosa: "1001/1002" }), escopo)).toBe(false);
  });

  it("usa sequencial somente como confirmação quando ambos existem", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ sequencialItem: 8 }), escopo)).toBe(false);
  });

  it("não reprova por sequencial indisponível em um dos lados", () => {
    expect(validarCandidatoRetorno(linha({ sequencialItem: null }), candidato({ sequencialItem: 999 }), escopo)).toBe(true);
  });

  it("não usa sequencial sozinho para encontrar candidato", () => {
    const resultado = sugerirVinculoRetorno(linha({ sequencialItem: "9" }), [candidato({ sequencialItem: 9, codigoItem: "OUTRO" })], escopo);
    expect(resultado.estado).toBe("sem_vinculo");
  });

  it("mantém candidatos de mesma chave como ambíguos e não desempata por nome ou valor", () => {
    const resultado = sugerirVinculoRetorno(linha(), [
      candidato({ id: 1, nomeBeneficiario: "Pessoa A", valorGlosa: "10.00" }),
      candidato({ id: 2, nomeBeneficiario: "Pessoa B", valorGlosa: "999.99" }),
    ], escopo);
    expect(resultado.estado).toBe("ambiguo");
    expect(resultado.candidatos).toHaveLength(2);
  });

  it("classifica como divergente se valor recursado excede glosa", () => {
    const resultado = sugerirVinculoRetorno(linha({ valorRecursado: "10.01" }), [candidato({ valorGlosa: "10.00" })], escopo);
    expect(resultado.estado).toBe("divergente");
    expect(validarCandidatoRetorno(linha({ valorRecursado: "10.01" }), candidato({ valorGlosa: "10.00" }), escopo)).toBe(false);
  });

  it("classifica como divergente se o valor da glosa estiver indisponível", () => {
    const resultado = sugerirVinculoRetorno(linha(), [candidato({ valorGlosa: null })], escopo);
    expect(resultado.estado).toBe("divergente");
  });

  it("retorna ambiguidade sem truncar quando a lista excede o limite seguro", () => {
    const candidatos = Array.from({ length: 21 }, (_, indice) => candidato({ id: indice + 1 }));
    const resultado = sugerirVinculoRetorno(linha(), candidatos, escopo);
    expect(resultado.estado).toBe("ambiguo");
    expect(resultado.candidatos).toHaveLength(21);
    expect(resultado.motivo).toContain("21 candidatos");
  });

  it("sugere um único match mesmo quando o lote contém mais de vinte outras guias", () => {
    const outrasGuias = Array.from({ length: 100 }, (_, indice) => candidato({
      id: indice + 2,
      numeroGuia: `OUTRA-GUIA-${indice + 1}`,
    }));
    const resultado = sugerirVinculoRetorno(linha(), [candidato(), ...outrasGuias], escopo);
    expect(resultado.estado).toBe("sugerido");
    expect(resultado.candidatos).toEqual([candidato()]);
  });

  it("não retorna candidatos de outros estabelecimentos ou convênios em ambiguidade", () => {
    const foraDoEscopo = Array.from({ length: 30 }, (_, indice) => candidato({
      id: indice + 2,
      estabelecimentoId: 999,
      convenioId: 998,
    }));
    const resultado = sugerirVinculoRetorno(linha(), [candidato(), ...foraDoEscopo], escopo);
    expect(resultado.estado).toBe("sugerido");
    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0]?.estabelecimentoId).toBe(escopo.estabelecimentoId);
  });

  it("converte Date para data civil UTC sem aceitar timestamp textual", () => {
    expect(validarCandidatoRetorno(linha(), candidato({ dataExecucao: new Date("2026-01-15T00:00:00.000Z") }), escopo)).toBe(true);
    expect(validarCandidatoRetorno(linha(), candidato({ dataExecucao: "2026-01-15T00:00:00Z" }), escopo)).toBe(false);
  });

  it("gera chave estável ao trocar apenas o id transitório", () => {
    const primeira = candidato({ id: 1 });
    const reimportado = candidato({ id: 999 });
    expect(chaveEstavelDemonstrativo(primeira)).toBe(chaveEstavelDemonstrativo(reimportado));
  });

  it("mantém arquivoId na chave estável", () => {
    expect(chaveEstavelDemonstrativo(candidato({ arquivoId: 100 }))).not.toBe(chaveEstavelDemonstrativo(candidato({ arquivoId: 101 })));
  });

  it("inclui campos de negócio relevantes na chave estável", () => {
    expect(chaveEstavelDemonstrativo(candidato({ descricaoItem: "Descrição A" }))).not.toBe(chaveEstavelDemonstrativo(candidato({ descricaoItem: "Descrição B" })));
  });
});
