import { describe, expect, it } from "vitest";
import { RETORNO_XML_MAX_BYTES, RETORNO_XML_MAX_ITENS } from "../shared/retornosRecursos";
import { parseRetornoCassiXml } from "./retornosRecursosParser";

type LinhaOverrides = Partial<{
  numeroGuiaPrestador: string;
  numeroGuiaOperadora: string;
  sequencialItem: string;
  dataRealizacao: string;
  codigoTabela: string;
  codigoProcedimento: string;
  codGlosa: string;
  valorRecursado: string;
  valorAcatadado: string;
  justificativaPrestador: string;
  justificativaOperadora: string;
}>;

type XmlOverrides = Partial<{
  Padrao: string;
  tipoTransacao: string;
  dataRegistroTransacao: string;
  registroANS: string;
  codigoPrestador: string;
  numeroLote: string;
  numeroProtocolo: string;
  numeroGuiaRecGlosaPrestador: string;
  numeroGuiaRecGlosaOperadora: string;
  dataRecurso: string;
  valorTotalRecursado: string;
  valorTotalAcatado: string;
}>;

function linhaXml(overrides: LinhaOverrides = {}): string {
  const v = {
    numeroGuiaPrestador: "GUIA-PREST-1",
    numeroGuiaOperadora: "GUIA-OPER-1",
    sequencialItem: "1",
    dataRealizacao: "2026-01-15",
    codigoTabela: "22",
    codigoProcedimento: "10101012",
    codGlosa: "1001",
    valorRecursado: "10.00",
    valorAcatadado: "5.00",
    justificativaPrestador: "Justificativa sintética do prestador.",
    justificativaOperadora: "Justificativa sintética da operadora.",
    ...overrides,
  };
  return `<respostaGuiaItens>
    <numeroGuiaPrestador>${v.numeroGuiaPrestador}</numeroGuiaPrestador>
    <numeroGuiaOperadora>${v.numeroGuiaOperadora}</numeroGuiaOperadora>
    <sequencialItem>${v.sequencialItem}</sequencialItem>
    <dataRealizacao>${v.dataRealizacao}</dataRealizacao>
    <procRecurso><codigoTabela>${v.codigoTabela}</codigoTabela><codigoProcedimento>${v.codigoProcedimento}</codigoProcedimento></procRecurso>
    <codGlosa>${v.codGlosa}</codGlosa>
    <valorRecursado>${v.valorRecursado}</valorRecursado>
    <valorAcatadado>${v.valorAcatadado}</valorAcatadado>
    <justificativaPrestador>${v.justificativaPrestador}</justificativaPrestador>
    <justificativaOperadora>${v.justificativaOperadora}</justificativaOperadora>
  </respostaGuiaItens>`;
}

function reciboXml(linhas: string, overrides: XmlOverrides = {}): string {
  const v = {
    registroANS: "006246",
    codigoPrestador: "PREST-01",
    numeroLote: "LOTE-01",
    numeroProtocolo: "PROTO-01",
    numeroGuiaRecGlosaPrestador: "REC-PREST-01",
    numeroGuiaRecGlosaOperadora: "REC-OPER-01",
    dataRecurso: "2026-02-01",
    valorTotalRecursado: "10.00",
    valorTotalAcatado: "5.00",
    ...overrides,
  };
  return `<reciboGlosa>
    <registroANS>${v.registroANS}</registroANS><codigoPrestador>${v.codigoPrestador}</codigoPrestador>
    <numeroLote>${v.numeroLote}</numeroLote><numeroProtocolo>${v.numeroProtocolo}</numeroProtocolo>
    <numeroGuiaRecGlosaPrestador>${v.numeroGuiaRecGlosaPrestador}</numeroGuiaRecGlosaPrestador>
    <numeroGuiaRecGlosaOperadora>${v.numeroGuiaRecGlosaOperadora}</numeroGuiaRecGlosaOperadora>
    <nomeOperadora>Operadora sintética</nomeOperadora><objetoRecurso>2</objetoRecurso>
    <dataRecurso>${v.dataRecurso}</dataRecurso><valorTotalRecursado>${v.valorTotalRecursado}</valorTotalRecursado>
    <valorTotalAcatado>${v.valorTotalAcatado}</valorTotalAcatado>
    <opcaoRecurso><recursoGuia>${linhas}</recursoGuia></opcaoRecurso>
  </reciboGlosa>`;
}

function xmlValido(opcoes: { linhas?: string; cabecalho?: Partial<XmlOverrides>; resposta?: string; prefixo?: boolean } = {}): Buffer {
  const prefixo = opcoes.prefixo ? "ans:" : "";
  const namespace = opcoes.prefixo ? ' xmlns:ans="urn:fixture-sintetica"' : "";
  const abrir = (nome: string) => `<${prefixo}${nome}>`;
  const fechar = (nome: string) => `</${prefixo}${nome}>`;
  const recibo = opcoes.resposta ?? reciboXml(opcoes.linhas ?? linhaXml(), opcoes.cabecalho);
  // A troca de prefixo é apenas para provar que o parser usa local-name; fixtures continuam sintéticas.
  const corpo = opcoes.prefixo ? recibo.replace(/<\/?(?!\/)([A-Za-z])/g, (m) => m.startsWith("</") ? m : m).replace(/<(\/)?([A-Za-z][^\s/>]*)/g, `<$1ans:$2`) : recibo;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
    <${prefixo}mensagemTISS${namespace}><${prefixo}cabecalho>
      <${prefixo}identificacaoTransacao><${prefixo}tipoTransacao>${opcoes.cabecalho?.tipoTransacao ?? "RESPOSTA_RECURSO_GLOSA"}</${prefixo}tipoTransacao><${prefixo}dataRegistroTransacao>${opcoes.cabecalho?.dataRegistroTransacao ?? "2026-02-02"}</${prefixo}dataRegistroTransacao></${prefixo}identificacaoTransacao>
      <${prefixo}Padrao>${opcoes.cabecalho?.Padrao ?? "4.01.00"}</${prefixo}Padrao>
    </${prefixo}cabecalho>
    ${abrir("operadoraParaPrestador")}${abrir("respostaRecursoGlosa")}${corpo}${fechar("respostaRecursoGlosa")}${fechar("operadoraParaPrestador")}${fechar("mensagemTISS")}`);
}

function esperarInvalido(buffer: Buffer): void {
  expect(() => parseRetornoCassiXml(buffer)).toThrow("XML de retorno de recurso inválido.");
}

describe("parseRetornoCassiXml", () => {
  it("parseia a estrutura 4.01.00 sintética e normaliza decimais", () => {
    const documento = parseRetornoCassiXml(xmlValido());
    expect(documento.formato).toBe("cassi-resposta-recurso-4.01-v1");
    expect(documento.linhas).toHaveLength(1);
    expect(documento.linhas[0]).toMatchObject({ posicao: 1, valorRecursado: "10.00", valorAcatado: "5.00" });
    expect(documento.totalRecursadoItens).toBe("10.00");
    expect(documento.dataResposta).toBe("2026-02-02");
    expect(documento.dataRecurso).toBe("2026-02-01");
  });

  it("aceita namespace/prefixo diferente sem depender de ans", () => {
    const documento = parseRetornoCassiXml(xmlValido({ prefixo: true }));
    expect(documento.linhas).toHaveLength(1);
  });

  it("rejeita tipo de resposta diferente", () => {
    esperarInvalido(Buffer.from("<mensagemTISS><cabecalho><Padrao>4.01.00</Padrao></cabecalho><prestadorParaOperadora/></mensagemTISS>"));
  });

  it("rejeita versão TISS diferente", () => {
    esperarInvalido(xmlValido({ cabecalho: { Padrao: "4.00.01" } }));
  });

  it("rejeita tipo de transação diferente de resposta de recurso", () => {
    esperarInvalido(xmlValido({ cabecalho: { tipoTransacao: "RECURSO_GLOSA" } }));
  });

  it("rejeita data do documento de resposta ausente", () => {
    const semData = xmlValido().toString("utf8").replace("<dataRegistroTransacao>2026-02-02</dataRegistroTransacao>", "");
    esperarInvalido(Buffer.from(semData));
  });

  it("rejeita data inválida no documento de resposta", () => {
    esperarInvalido(xmlValido({ cabecalho: { dataRegistroTransacao: "2026-02-30" } }));
  });

  it("rejeita registro ANS fora do formato TISS", () => {
    esperarInvalido(xmlValido({ cabecalho: { registroANS: "12345" } }));
  });

  it("rejeita XML malformado com erro sanitizado", () => {
    esperarInvalido(Buffer.from("<mensagemTISS><cabecalho>"));
  });

  it("rejeita DTD antes do parse", () => {
    esperarInvalido(Buffer.from("<!DOCTYPE x [<!ELEMENT x ANY>]><x/>"));
  });

  it("rejeita entity/XXE sem expor a entidade", () => {
    esperarInvalido(Buffer.from("<!DOCTYPE x [<!ENTITY ext SYSTEM 'file:///etc/passwd'>]><x>&ext;</x>"));
  });

  it("rejeita identificador obrigatório do recibo ausente", () => {
    const semLote = reciboXml(linhaXml()).replace("<numeroLote>LOTE-01</numeroLote>", "");
    esperarInvalido(xmlValido({ resposta: semLote }));
  });

  it("rejeita data civil inexistente", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ dataRealizacao: "2026-02-30" }) }));
  });

  it("rejeita data com timezone em vez de data civil", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ dataRealizacao: "2026-01-15T00:00:00Z" }) }));
  });

  it("rejeita decimal com separador não-TISS", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ valorRecursado: "10,00" }) }));
  });

  it("rejeita valor negativo", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ valorRecursado: "-1.00" }) }));
  });

  it("rejeita decimal acima de doze dígitos inteiros", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ valorRecursado: "1234567890123.00" }) }));
  });

  it("rejeita valor acatado acima do recursado", () => {
    esperarInvalido(xmlValido({ linhas: linhaXml({ valorRecursado: "5.00", valorAcatadado: "5.01" }) }));
  });

  it("preserva linhas idênticas em posições distintas", () => {
    const documento = parseRetornoCassiXml(xmlValido({ linhas: `${linhaXml()}${linhaXml()}`, cabecalho: { valorTotalRecursado: "20.00", valorTotalAcatado: "10.00" } }));
    expect(documento.linhas.map(linha => linha.posicao)).toEqual([1, 2]);
    expect(documento.linhas[0].codigoItem).toBe(documento.linhas[1].codigoItem);
  });

  it("preserva 37 linhas sintéticas iguais sem deduplicar", () => {
    const quantidade = 37;
    const documento = parseRetornoCassiXml(xmlValido({
      linhas: Array.from({ length: quantidade }, () => linhaXml()).join(""),
      cabecalho: { valorTotalRecursado: "370.00", valorTotalAcatado: "185.00" },
    }));
    expect(documento.linhas).toHaveLength(quantidade);
    expect(documento.linhas[documento.linhas.length - 1]?.posicao).toBe(quantidade);
  });

  it("mantém totais de itens separados e alerta divergência de cabeçalho", () => {
    const documento = parseRetornoCassiXml(xmlValido({ cabecalho: { valorTotalRecursado: "11.00", valorTotalAcatado: "4.00" } }));
    expect(documento.totalRecursadoItens).toBe("10.00");
    expect(documento.totalRecursadoCabecalho).toBe("11.00");
    expect(documento.alertas).toHaveLength(2);
  });

  it("rejeita mais que o limite de itens", () => {
    const linhas = Array.from({ length: RETORNO_XML_MAX_ITENS + 1 }, () => linhaXml()).join("");
    esperarInvalido(xmlValido({ linhas, cabecalho: { valorTotalRecursado: "0.00", valorTotalAcatado: "0.00" } }));
  });

  it("rejeita buffer maior que o limite de bytes", () => {
    const grande = Buffer.alloc(RETORNO_XML_MAX_BYTES + 1, 0x20);
    expect(() => parseRetornoCassiXml(grande)).toThrow("O arquivo XML excede o limite permitido.");
  });

  it("rejeita múltiplos recibos para não achatar cabeçalhos", () => {
    const dois = `${reciboXml(linhaXml())}${reciboXml(linhaXml())}`;
    expect(() => parseRetornoCassiXml(xmlValido({ resposta: dois }))).toThrow("O XML contém mais de um recibo e não pode ser importado.");
  });

  it("rejeita campo singleton duplicado", () => {
    const duplicado = linhaXml().replace("<codGlosa>1001</codGlosa>", "<codGlosa>1001</codGlosa><codGlosa>1001</codGlosa>");
    esperarInvalido(xmlValido({ linhas: duplicado }));
  });

  it("rejeita XML estruturalmente profundo", () => {
    const profundo = `<mensagemTISS>${"<x>".repeat(33)}${"</x>".repeat(33)}</mensagemTISS>`;
    esperarInvalido(Buffer.from(profundo));
  });

  it("rejeita resposta sem itens", () => {
    esperarInvalido(xmlValido({ linhas: "" }));
  });

  it("não assume sequencial ausente como zero", () => {
    const semSequencial = linhaXml().replace("<sequencialItem>1</sequencialItem>", "");
    const documento = parseRetornoCassiXml(xmlValido({ linhas: semSequencial }));
    expect(documento.linhas[0].sequencialItem).toBeNull();
  });
});
