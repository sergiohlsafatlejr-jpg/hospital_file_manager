import {
  decimalParaCentavos,
  sanitizarTextoExcel,
  type RetornoDetalheUi,
  type RetornoLinhaUi,
} from "./retornosRecursosUi";

export type RetornoExcelFiltros = {
  inicio?: string;
  fim?: string;
};

export type RetornoExcelLote = RetornoDetalheUi & {
  estabelecimentoNome?: string | null;
  convenioNome?: string | null;
};

export type RetornoExcelArquivo = {
  bytes: Uint8Array;
  nomeArquivo: string;
};

type XlsxModule = typeof import("xlsx");

/** Mantém o pacote de planilha fora do chunk inicial da tela. */
export const xlsxDynamic = (): Promise<XlsxModule> => import("xlsx");

function dataCivil(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  if (typeof valor === "string") return valor.slice(0, 10);
  if (!Number.isFinite(valor.getTime())) return "";
  return valor.toISOString().slice(0, 10);
}

/**
 * Retorna número somente quando o decimal cabe com segurança em centavos.
 * Valor ausente e valor inválido continuam textuais/vazios, jamais viram zero.
 */
export function decimalSeguroParaExcel(valor: string | null | undefined): number | string {
  const centavos = decimalParaCentavos(valor);
  if (centavos === null) return sanitizarTextoExcel(valor ?? "");
  return centavos / 100;
}

function texto(valor: string | number | null | undefined): string {
  return sanitizarTextoExcel(valor === null || valor === undefined ? "" : String(valor));
}

/**
 * O XML de resposta não contém o contexto do demonstrativo. Descrição e valor
 * de glosa só acompanham a planilha quando o candidato aprovado ainda está no
 * snapshot público da linha. Nome e carteirinha seguem vazios enquanto o
 * serviço não os disponibilizar explicitamente.
 */
export function contextoVinculoAprovado(linha: RetornoLinhaUi) {
  const demonstrativoId = linha.aprovacao?.demonstrativoId;
  if (!demonstrativoId) return null;
  return linha.candidatos.find((candidato) => candidato.id === demonstrativoId) ?? null;
}

function linhaExcel(lote: RetornoExcelLote, linha: RetornoLinhaUi): Record<string, string | number> {
  const importacao = lote.importacao;
  const vinculo = contextoVinculoAprovado(linha);
  return {
    "Hospital": texto(lote.estabelecimentoNome),
    "Convênio": texto(lote.convenioNome),
    "Lote": texto(importacao.numeroLote),
    "Protocolo do recurso": texto(importacao.protocoloRecurso),
    "Origem": texto(importacao.origemRecurso),
    "Data original do recurso": dataCivil(importacao.dataRecurso),
    "Data do documento de resposta": dataCivil(importacao.dataResposta),
    "Posição no XML": linha.posicao,
    "Nome": "",
    "Carteirinha": "",
    "Guia prestador": texto(linha.guiaPrestador),
    "Guia operadora": texto(linha.guiaOperadora),
    "Sequencial do item": texto(linha.sequencialItem),
    "Data do item": dataCivil(linha.dataExecucao),
    "Código da tabela": texto(linha.codigoTabela),
    "Código": texto(linha.codigoItem),
    "Descrição": texto(vinculo?.descricaoItem),
    "Código da glosa": texto(linha.codigoGlosa),
    "Valor glosado": decimalSeguroParaExcel(vinculo?.valorGlosa),
    "Valor recursado": decimalSeguroParaExcel(linha.valorRecursado),
    "Valor acatado": decimalSeguroParaExcel(linha.valorAcatado),
    "Justificativa do prestador": texto(linha.justificativaPrestador),
    "Justificativa da operadora": texto(linha.justificativaOperadora),
    "Estado do vínculo": texto(linha.estado),
    "Motivo do vínculo": texto(linha.motivo),
    "Demonstrativo aprovado": linha.aprovacao?.demonstrativoId ?? "",
  };
}

function resumoExcel(lote: RetornoExcelLote): Record<string, string | number> {
  const { importacao, resumo } = lote;
  return {
    "Hospital": texto(lote.estabelecimentoNome),
    "Convênio": texto(lote.convenioNome),
    "Lote": texto(importacao.numeroLote),
    "Protocolo do recurso": texto(importacao.protocoloRecurso),
    "Arquivo XML": texto(importacao.nomeArquivoXml),
    "Data original do recurso": dataCivil(importacao.dataRecurso),
    "Data do documento de resposta": dataCivil(importacao.dataResposta),
    "Origem": texto(importacao.origemRecurso),
    "Itens": lote.linhas.length,
    "Aprovações": resumo.aprovacoes,
    "Total recursado (itens)": decimalSeguroParaExcel(resumo.recursado),
    "Total acatado (itens)": decimalSeguroParaExcel(resumo.acatado),
    "Total acatado aprovado": decimalSeguroParaExcel(resumo.acatadoAprovado),
    "Recebido informado (líquido)": decimalSeguroParaExcel(resumo.recebidoInformado),
    "Saldo acatado": decimalSeguroParaExcel(resumo.saldoAcatado),
    "Cabeçalho divergente": importacao.cabecalhoDivergente === "sim" ? "Sim" : "Não",
  };
}

function eventosFinanceirosExcel(lote: RetornoExcelLote): Array<Record<string, string | number>> {
  return lote.pagamentos.map((evento) => ({
    "Hospital": texto(lote.estabelecimentoNome),
    "Convênio": texto(lote.convenioNome),
    "Lote": texto(lote.importacao.numeroLote),
    "Protocolo do recurso": texto(lote.importacao.protocoloRecurso),
    "Data do evento": dataCivil(evento.dataEvento),
    "Tipo": evento.tipo === "estorno" ? "Estorno" : "Recebimento",
    "Valor": decimalSeguroParaExcel(evento.valor),
    "Referência": texto(evento.referencia),
    "Observação": texto(evento.observacao),
    "Pagamento original": evento.pagamentoOrigemId ?? "",
    "Registrado em": dataCivil(evento.registradoEm),
  }));
}

function ajustarColunas(planilha: { [key: string]: unknown }, limites: number[]): void {
  planilha["!cols"] = limites.map((wch) => ({ wch }));
}

export async function gerarExcelRetornos(
  lotes: RetornoExcelLote[],
  filtros: RetornoExcelFiltros = {},
): Promise<RetornoExcelArquivo> {
  const XLSX = await xlsxDynamic();
  const workbook = XLSX.utils.book_new();
  const resumo = lotes.map(resumoExcel);
  const itens = lotes.flatMap((lote) => lote.linhas.map((linha) => linhaExcel(lote, linha)));
  const eventos = lotes.flatMap(eventosFinanceirosExcel);
  const periodo = filtros.inicio || filtros.fim
    ? `${filtros.inicio || "início"} a ${filtros.fim || "hoje"}`
    : "Sem filtro de data de resposta";

  const planilhaResumo = XLSX.utils.aoa_to_sheet([
    ["Relatório de retornos de recursos"],
    ["Período (data do documento de resposta)", periodo],
    [],
  ]);
  XLSX.utils.sheet_add_json(planilhaResumo, resumo, { origin: "A4" });
  ajustarColunas(planilhaResumo, [28, 24, 18, 24, 28, 18, 22, 14, 10, 12, 18, 18, 20, 24, 18, 20]);
  XLSX.utils.book_append_sheet(workbook, planilhaResumo, "Resumo por lote");

  const planilhaItens = XLSX.utils.json_to_sheet(itens);
  ajustarColunas(planilhaItens, [28, 24, 18, 24, 14, 16, 22, 10, 28, 18, 18, 18, 16, 16, 18, 16, 30, 16, 16, 16, 16, 36, 36, 18, 40, 20]);
  XLSX.utils.book_append_sheet(workbook, planilhaItens, "Itens de retorno");

  const planilhaEventos = XLSX.utils.json_to_sheet(eventos);
  ajustarColunas(planilhaEventos, [28, 24, 18, 24, 18, 16, 16, 28, 40, 18, 22]);
  XLSX.utils.book_append_sheet(workbook, planilhaEventos, "Eventos financeiros");

  const hoje = new Date().toISOString().slice(0, 10);
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return {
    bytes: new Uint8Array(bytes),
    nomeArquivo: `retornos-recursos-data-resposta-${hoje}.xlsx`,
  };
}
