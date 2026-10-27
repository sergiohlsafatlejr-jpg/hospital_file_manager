import { describe, expect, it } from "vitest";
import {
  CONTA_HONORARIOS_MAX_GUIAS,
  parseContaHonorarios,
} from "./contaHonorariosParser";

describe("parseContaHonorarios", () => {
  it("lê guiaHonorarios namespaceada, múltiplos procedimentos e ignora valores e quantidade", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="urn:teste">
        <ans:prestadorParaOperadora>
          <ans:guiasTISS>
            <ans:guiaHonorarios>
              <ans:cabecalhoGuia>
                <ans:numeroGuiaPrestador>GP-SINTETICA</ans:numeroGuiaPrestador>
                <ans:numeroGuiaOperadora>GO-SINTETICA</ans:numeroGuiaOperadora>
                <ans:guiaSolicInternacao>GS-SINTETICA</ans:guiaSolicInternacao>
                <ans:numeroCarteira>CARTEIRA-PRIVADA</ans:numeroCarteira>
                <ans:dataAtendimento>2026-01-02</ans:dataAtendimento>
              </ans:cabecalhoGuia>
              <ans:dadosPrestador>
                <ans:codigoPrestadorNaOperadora>PRESTADOR-INTERNO</ans:codigoPrestadorNaOperadora>
              </ans:dadosPrestador>
              <ans:procedimentosRealizados>
                <ans:procedimentoRealizado>
                  <ans:sequencialItem>1</ans:sequencialItem>
                  <ans:procedimento>
                    <ans:codigoTabela>TAB</ans:codigoTabela>
                    <ans:codigoProcedimento>PROC-SINT-A</ans:codigoProcedimento>
                    <ans:descricaoProcedimento>Procedimento sintético A</ans:descricaoProcedimento>
                  </ans:procedimento>
                  <ans:dataExecucao>2026-01-02</ans:dataExecucao>
                  <ans:quantidadeExecutada>99</ans:quantidadeExecutada>
                  <ans:valorProcedimento>9999.99</ans:valorProcedimento>
                  <ans:profissionalExecutante>
                    <ans:nomeProfissional>Profissional Um</ans:nomeProfissional>
                    <ans:conselhoProfissional>CRM</ans:conselhoProfissional>
                    <ans:numeroConselhoProfissional>123</ans:numeroConselhoProfissional>
                  </ans:profissionalExecutante>
                  <ans:profissionalExecutante>
                    <ans:nomeProfissional>Profissional Um</ans:nomeProfissional>
                    <ans:conselhoProfissional>CRM</ans:conselhoProfissional>
                    <ans:numeroConselhoProfissional>123</ans:numeroConselhoProfissional>
                  </ans:profissionalExecutante>
                </ans:procedimentoRealizado>
                <ans:procedimentoRealizado>
                  <ans:procedimento><ans:codigoProcedimento>PROC-SINT-B</ans:codigoProcedimento></ans:procedimento>
                  <ans:profissionalExecutante><ans:nomeProfissional>Profissional Dois</ans:nomeProfissional></ans:profissionalExecutante>
                </ans:procedimentoRealizado>
              </ans:procedimentosRealizados>
            </ans:guiaHonorarios>
          </ans:guiasTISS>
        </ans:prestadorParaOperadora>
      </ans:mensagemTISS>`;

    const resultado = parseContaHonorarios(xml);

    expect(resultado.recognized).toBe(true);
    expect(resultado.guias).toHaveLength(1);
    expect(resultado.guias[0].procedimentos).toEqual([
      {
        codigo: "PROC-SINT-A",
        descricao: "Procedimento sintético A",
        dataExecucao: "2026-01-02",
        sequencial: "1",
        profissionais: [{ nome: "Profissional Um", conselho: "CRM", numeroConselho: "123" }],
      },
      {
        codigo: "PROC-SINT-B",
        descricao: "Não informada",
        dataExecucao: null,
        sequencial: null,
        profissionais: [{ nome: "Profissional Dois", conselho: null, numeroConselho: null }],
      },
    ]);
    // Correlação é privada do parser; o futuro DTO transforma apenas procedimentos.
    expect(resultado.guias[0].correlacao).toMatchObject({
      numeroGuiaPrestador: "GP-SINTETICA",
      numeroGuiaOperadora: "GO-SINTETICA",
      guiaSolicitacaoInternacao: "GS-SINTETICA",
      numeroCarteira: "CARTEIRA-PRIVADA",
      codigoPrestador: "PRESTADOR-INTERNO",
    });
    expect(JSON.stringify(resultado.guias[0].procedimentos)).not.toMatch(/valor|quantidade|9999|99/i);
  });

  it("aceita XML reconhecido vazio e retorna não reconhecido quando não há guia de honorários", () => {
    expect(parseContaHonorarios("<mensagemTISS><guiaHonorarios/></mensagemTISS>")).toEqual({
      recognized: true,
      guias: [{ procedimentos: [], correlacao: expect.any(Object) }],
    });
    expect(parseContaHonorarios("<mensagemTISS><guiaSP><x/></guiaSP></mensagemTISS>")).toEqual({
      recognized: false,
      guias: [],
    });
  });

  it("rejeita DTD, entidades, XML vazio e excesso de guias antes de indexar conteúdo parcial", () => {
    expect(() => parseContaHonorarios("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]><x>&e;</x>"))
      .toThrow(/DTD|entidades/i);
    expect(() => parseContaHonorarios(""))
      .toThrow(/vazio/i);

    const guias = Array.from(
      { length: CONTA_HONORARIOS_MAX_GUIAS + 1 },
      () => "<guiaHonorarios><procedimentosRealizados/></guiaHonorarios>"
    ).join("");
    expect(() => parseContaHonorarios(`<mensagemTISS>${guias}</mensagemTISS>`))
      .toThrow(/limite de guias/i);
  });
});
