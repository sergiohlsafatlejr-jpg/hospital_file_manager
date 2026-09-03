export interface RecursoExtraidoXml {
  protocoloDP: string;
  guiaNumero: string;
  guiaOperadora: string;
  dataAtendimento: string;
  codigoTabela: string;
  codigoProcedimento: string;
  descricaoProcedimento: string;
  codigoGlosa: string;
  valorRecursado: number;
  justificativa: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagValue(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "i");
  const match = xml.match(regex);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : "";
}

function blocos(xml: string, tag: string): string[] {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, "gi");
  return Array.from(xml.matchAll(regex), match => match[1]);
}

export function extrairChaveXmlDaUrl(urlValue: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(urlValue).pathname);
    const marker = "/recursos-glosa/";
    const index = pathname.indexOf(marker);
    return index >= 0 ? pathname.slice(index + 1) : null;
  } catch {
    return null;
  }
}

export function extrairRecursosDoXml(xml: string): RecursoExtraidoXml[] {
  const protocoloDP = tagValue(xml, "numeroProtocolo") || tagValue(xml, "numeroGuiaRecGlosaOperadora");
  const resultado: RecursoExtraidoXml[] = [];

  for (const guiaXml of blocos(xml, "recursoGuia")) {
    const guiaNumero = tagValue(guiaXml, "numeroGuiaOrigem");
    const guiaOperadora = tagValue(guiaXml, "numeroGuiaOperadora");

    for (const itemXml of blocos(guiaXml, "itensGuia")) {
      resultado.push({
        protocoloDP,
        guiaNumero,
        guiaOperadora,
        dataAtendimento: tagValue(itemXml, "dataInicio"),
        codigoTabela: tagValue(itemXml, "codigoTabela"),
        codigoProcedimento: tagValue(itemXml, "codigoProcedimento"),
        descricaoProcedimento: tagValue(itemXml, "descricaoProcedimento"),
        codigoGlosa: tagValue(itemXml, "codGlosaItem"),
        valorRecursado: Number(tagValue(itemXml, "valorRecursado")) || 0,
        justificativa: tagValue(itemXml, "justificativaItem"),
      });
    }
  }

  return resultado;
}
