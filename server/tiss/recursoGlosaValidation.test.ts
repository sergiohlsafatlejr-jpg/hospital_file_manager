import { describe, expect, it } from "vitest";
import {
  PROFUNDIDADE_MAXIMA_XML_RECURSO_GLOSA,
  TAMANHO_MAXIMO_XML_RECURSO_GLOSA,
  TISS_RECURSO_GLOSA_SCHEMA_VERSION,
  validarXmlRecursoGlosaContraXsd,
} from "./recursoGlosaXsdValidator";
import { validarXmlRecursoGlosaDoPortal } from "./recursoGlosaValidation";

const xmlValido = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>RECURSO_GLOSA</ans:tipoTransacao>
      <ans:sequencialTransacao>1</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>2026-10-27</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>12:00:00</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>123456</ans:codigoPrestadorNaOperadora>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>311383</ans:registroANS>
    </ans:destino>
    <ans:versaoPadrao>3.02.00</ans:versaoPadrao>
  </ans:cabecalho>
  <ans:prestadorParaOperadora>
    <ans:recursoGlosa>
      <ans:guiaRecursoGlosa>
        <ans:registroANS>311383</ans:registroANS>
        <ans:numeroGuiaRecGlosaPrestador>REC120001</ans:numeroGuiaRecGlosaPrestador>
        <ans:nomeOperadora>OPERADORA SINTETICA</ans:nomeOperadora>
        <ans:objetoRecurso>2</ans:objetoRecurso>
        <ans:dadosContratado>
          <ans:codigoPrestadorNaOperadora>123456</ans:codigoPrestadorNaOperadora>
          <ans:nomeContratado>PRESTADOR SINTETICO</ans:nomeContratado>
        </ans:dadosContratado>
        <ans:numeroLote>120001</ans:numeroLote>
        <ans:numeroProtocolo>1</ans:numeroProtocolo>
        <ans:opcaoRecurso>
          <ans:recursoGuia>
            <ans:numeroGuiaOrigem>2585810</ans:numeroGuiaOrigem>
            <ans:opcaoRecursoGuia>
              <ans:itensGuia>
                <ans:dataInicio>2026-10-01</ans:dataInicio>
                <ans:procRecurso>
                  <ans:codigoTabela>22</ans:codigoTabela>
                  <ans:codigoProcedimento>90094719</ans:codigoProcedimento>
                  <ans:descricaoProcedimento>PROCEDIMENTO SINTETICO</ans:descricaoProcedimento>
                </ans:procRecurso>
                <ans:codGlosaItem>1005</ans:codGlosaItem>
                <ans:valorRecursado>5.58</ans:valorRecursado>
                <ans:justificativaItem>Justificativa sintética para teste.</ans:justificativaItem>
              </ans:itensGuia>
            </ans:opcaoRecursoGuia>
          </ans:recursoGuia>
        </ans:opcaoRecurso>
        <ans:valorTotalRecursado>5.58</ans:valorTotalRecursado>
        <ans:dataRecurso>2026-10-27</ans:dataRecurso>
      </ans:guiaRecursoGlosa>
    </ans:recursoGlosa>
  </ans:prestadorParaOperadora>
  <ans:epilogo>
    <ans:hash>a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6</ans:hash>
  </ans:epilogo>
</ans:mensagemTISS>`;

describe("validarXmlRecursoGlosaContraXsd", () => {
  it("aceita um XML de recurso sintético válido no XSD oficial 3.02.00", async () => {
    const resultado = await validarXmlRecursoGlosaContraXsd(xmlValido);

    expect(resultado).toEqual({ valido: true, erros: [] });
  });

  it("rejeita XML estruturalmente inválido sem expor detalhes do parser", async () => {
    const xmlInvalido = xmlValido.replace(
      "<ans:numeroProtocolo>1</ans:numeroProtocolo>",
      "",
    );

    const resultado = await validarXmlRecursoGlosaContraXsd(xmlInvalido);

    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toEqual([
      {
        campo: "schema",
        tipo: "schema",
        mensagem: `O XML não atende ao schema oficial ANS/TISS ${TISS_RECURSO_GLOSA_SCHEMA_VERSION}.`,
      },
    ]);
  });

  it("bloqueia DTD/XXE antes do parser XSD", async () => {
    const xmlComDtd = `<?xml version="1.0"?><!DOCTYPE recurso [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><recurso>&xxe;</recurso>`;

    const resultado = await validarXmlRecursoGlosaContraXsd(xmlComDtd);

    expect(resultado).toEqual({
      valido: false,
      erros: [
        {
          campo: "xml",
          tipo: "seguranca",
          mensagem: "DTD e entidades XML externas não são aceitas.",
        },
      ],
    });
  });

  it("bloqueia XML acima do limite de tamanho antes do parser XSD", async () => {
    const xmlGrande = "x".repeat(TAMANHO_MAXIMO_XML_RECURSO_GLOSA + 1);

    const resultado = await validarXmlRecursoGlosaContraXsd(xmlGrande);

    expect(resultado).toEqual({
      valido: false,
      erros: [
        {
          campo: "xml",
          tipo: "tamanho",
          mensagem: "O XML excede o tamanho máximo permitido para validação.",
        },
      ],
    });
  });

  it("bloqueia XML acima do limite de profundidade antes do parser XSD", async () => {
    const abertura = "<n>".repeat(PROFUNDIDADE_MAXIMA_XML_RECURSO_GLOSA + 1);
    const fechamento = "</n>".repeat(PROFUNDIDADE_MAXIMA_XML_RECURSO_GLOSA + 1);

    const resultado = await validarXmlRecursoGlosaContraXsd(`${abertura}${fechamento}`);

    expect(resultado).toEqual({
      valido: false,
      erros: [
        {
          campo: "xml",
          tipo: "tamanho",
          mensagem: "O XML excede a profundidade máxima permitida.",
        },
      ],
    });
  });
});

describe("validarXmlRecursoGlosaDoPortal", () => {
  it("mantém o validador de regras existente como camada complementar", async () => {
    const resultado = await validarXmlRecursoGlosaDoPortal(xmlValido);

    expect(resultado.valido).toBe(true);
    expect(resultado.schema).toEqual({
      versao: "3.02.00",
      valido: true,
    });
    expect(resultado.erros).toEqual([]);
  });
});
