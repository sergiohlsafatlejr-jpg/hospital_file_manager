import {
  RETORNO_PDF_MAX_BYTES,
  RETORNO_REVIEW_MAX_ITENS,
  RETORNO_XML_MAX_BYTES,
  type RetornoCandidato,
  type RetornoEstado,
  type RetornoOrigem,
} from "@shared/retornosRecursos";

export type RetornoEscopoUi = {
  estabelecimentoId: number;
  convenioId: number;
};

export type RetornoArquivoUi = Pick<File, "name" | "size" | "type">;

/** Metadados mínimos do candidato liberados pelo serviço para revisão. */
export type RetornoCandidatoUi = Pick<
  RetornoCandidato,
  | "id"
  | "numeroGuia"
  | "sequencialItem"
  | "dataExecucao"
  | "codigoItem"
  | "codigoGlosa"
  | "valorGlosa"
  | "protocolo"
  | "lotePrestador"
  | "codigoPrestador"
  | "descricaoItem"
>;

/** Shape público de uma importação retornado pelo serviço. */
export type RetornoImportacaoUi = {
  id: number;
  origemRecurso: RetornoOrigem;
  lotePortalId: number | null;
  nomeArquivoXml: string;
  nomeArquivoPdf: string | null;
  formato: string;
  versaoTiss: string;
  registroAns: string;
  codigoPrestador: string;
  numeroLote: string;
  protocoloRecurso: string;
  guiaRecursoPrestador: string;
  guiaRecursoOperadora: string;
  /** Data do cabeçalho `dataRegistroTransacao`: documento de resposta, não pagamento. */
  dataResposta: string | Date | null;
  /** Data declarada no recurso original, distinta do documento de resposta. */
  dataRecurso: string | Date | null;
  totalRecursadoCabecalho: string | null;
  totalAcatadoCabecalho: string | null;
  totalRecursadoItens: string;
  totalAcatadoItens: string;
  cabecalhoDivergente: "sim" | "nao";
  alertas: string[];
  criadoEm: string | Date | null;
};

/** Shape público de uma linha retornado pelo serviço. Não presume dados ausentes. */
export type RetornoLinhaUi = {
  id: number;
  posicao: number;
  guiaPrestador: string;
  guiaOperadora: string;
  sequencialItem: string | null;
  dataExecucao: string | Date | null;
  codigoTabela: string;
  codigoItem: string;
  codigoGlosa: string;
  valorRecursado: string;
  valorAcatado: string;
  justificativaPrestador: string;
  justificativaOperadora: string;
  estado: RetornoEstado;
  motivo: string;
  candidatos: RetornoCandidatoUi[];
  aprovacao: {
    id: number;
    demonstrativoId: number | null;
    justificativa: string;
    revisadoEm: string | Date | null;
  } | null;
  vinculoAtual: {
    status: "ausente" | "valido" | "alterado";
    demonstrativoId?: number;
  };
};

/** Evento append-only do ledger, retornado pelo serviço sem colapsar parcelas. */
export type RetornoPagamentoUi = {
  id: number;
  tipo: "recebimento" | "estorno";
  pagamentoOrigemId: number | null;
  valor: string;
  dataEvento: string | Date | null;
  referencia: string;
  observacao: string;
  registradoEm: string | Date | null;
};

export type RetornoHistoricoUi = {
  id: number;
  linhaId: number | null;
  tipo: "aprovacao" | "rebusca" | "conflito" | "anexo_protocolo";
  demonstrativoId: number | null;
  justificativa: string;
  revisadoEm: string | Date | null;
};

export type RetornoResumoUi = {
  recursado: string;
  acatado: string;
  aprovacoes: number;
  recursadoAprovado: string;
  acatadoAprovado: string;
  recebidoInformado: string;
  liquido: string;
  saldoAcatado: string;
  diferencaRecursadoVsAprovado: string;
};

export type RetornoDetalheUi = {
  importacao: RetornoImportacaoUi;
  linhas: RetornoLinhaUi[];
  pagamentos: RetornoPagamentoUi[];
  historico: RetornoHistoricoUi[];
  resumo: RetornoResumoUi;
};

export type RetornoRevisaoUi = {
  linhaId: number;
  demonstrativoId: number;
  justificativa: string;
};

export type RetornoFiltroUi = {
  inicio: string;
  fim: string;
  pagina: number;
  limite: number;
};

const MONEY_PATTERN = /^\d{1,12}\.\d{2}$/;
const FORMULA_PREFIX = /^[=+\-@]/;
const MENSAGENS_PRECONDICAO_SEGURAS = new Set([
  "O módulo de retornos está sendo configurado. Tente novamente em instantes.",
  "O armazenamento protegido dos retornos precisa ser configurado pelo administrador.",
  "A confirmação segura de importação precisa ser configurada pelo administrador.",
  "Confirme a divergência do cabeçalho antes de aprovar vínculos.",
  "Foram encontrados candidatos demais para uma revisão segura. Refine o documento de origem.",
  "Registre recebimentos somente após aprovar pelo menos um vínculo.",
  "O valor informado excede o saldo acatado aprovado.",
]);

export function chaveEscopoRetorno(escopo: RetornoEscopoUi | null | undefined): string {
  return escopo ? `${escopo.estabelecimentoId}:${escopo.convenioId}` : "sem-escopo";
}

export function escopoRetornoMudou(
  anterior: RetornoEscopoUi | null | undefined,
  atual: RetornoEscopoUi | null | undefined,
): boolean {
  return chaveEscopoRetorno(anterior) !== chaveEscopoRetorno(atual);
}

export function escopoRetornoValido(escopo: RetornoEscopoUi | null | undefined): escopo is RetornoEscopoUi {
  return Boolean(
    escopo
      && Number.isInteger(escopo.estabelecimentoId)
      && escopo.estabelecimentoId > 0
      && Number.isInteger(escopo.convenioId)
      && escopo.convenioId > 0,
  );
}

/** Protege callbacks tardios: só atualiza a UI do mesmo estabelecimento e convênio. */
export function callbackAindaPertenceAoEscopo(
  escopoCapturado: RetornoEscopoUi | null | undefined,
  escopoAtual: RetornoEscopoUi | null | undefined,
): boolean {
  return escopoRetornoValido(escopoCapturado)
    && escopoRetornoValido(escopoAtual)
    && chaveEscopoRetorno(escopoCapturado) === chaveEscopoRetorno(escopoAtual);
}

export function validarArquivoRetornoXml(arquivo: RetornoArquivoUi | null | undefined): string | null {
  if (!arquivo) return "Selecione o XML de resposta da CASSI.";
  if (!/\.xml$/i.test(arquivo.name) || /[\\/\x00-\x1f]/.test(arquivo.name)) {
    return "Selecione um arquivo XML com nome válido.";
  }
  if (arquivo.size <= 0) return "O XML está vazio.";
  if (arquivo.size > RETORNO_XML_MAX_BYTES) return "O XML deve ter no máximo 2 MB.";
  return null;
}

export function validarArquivoProtocoloPdf(arquivo: RetornoArquivoUi | null | undefined): string | null {
  if (!arquivo) return "Selecione o comprovante em PDF.";
  if (!/\.pdf$/i.test(arquivo.name) || /[\\/\x00-\x1f]/.test(arquivo.name)) {
    return "Selecione um arquivo PDF com nome válido.";
  }
  if (arquivo.type && arquivo.type !== "application/pdf") return "O comprovante deve ser um PDF.";
  if (arquivo.size <= 0) return "O PDF está vazio.";
  if (arquivo.size > RETORNO_PDF_MAX_BYTES) return "O PDF deve ter no máximo 5 MB.";
  return null;
}

export function parecePdf(conteudo: Uint8Array): boolean {
  return conteudo.length >= 4
    && conteudo[0] === 0x25
    && conteudo[1] === 0x50
    && conteudo[2] === 0x44
    && conteudo[3] === 0x46;
}

export function pareceXml(conteudo: string): boolean {
  const texto = conteudo.replace(/^\uFEFF/, "").trimStart();
  return texto.startsWith("<?xml") || texto.startsWith("<");
}

export function decimalParaCentavos(valor: string | null | undefined): number | null {
  if (!valor || !MONEY_PATTERN.test(valor)) return null;
  const [inteiro, fracao] = valor.split(".");
  const centavos = Number(inteiro) * 100 + Number(fracao);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

export function formatarMoedaRetorno(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numero);
}

export function formatarDataRetorno(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00`)
    : new Date(valor);
  if (!Number.isFinite(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR");
}

export function valorDentroDoSaldo(valor: string, saldo: string | null | undefined): boolean {
  const valorCentavos = decimalParaCentavos(valor);
  const saldoCentavos = decimalParaCentavos(saldo);
  return valorCentavos !== null && saldoCentavos !== null && valorCentavos > 0 && valorCentavos <= saldoCentavos;
}

/** Impede novo recebimento enquanto a fonte de alguma aprovação não é mais válida. */
export function haVinculoAprovadoInvalido(
  linhas: Pick<RetornoLinhaUi, "estado" | "vinculoAtual">[],
): boolean {
  return linhas.some((linha) => linha.estado === "aprovado" && linha.vinculoAtual.status !== "valido");
}

export function linhasSugestaoExata(linhas: RetornoLinhaUi[]): RetornoLinhaUi[] {
  return linhas.filter((linha) => linha.estado === "sugerido" && linha.candidatos.length === 1);
}

export function montarItensRevisao(
  linhas: RetornoLinhaUi[],
  selecionadas: Iterable<number>,
  justificativas: Record<number, string>,
): { itens: RetornoRevisaoUi[]; erro: string | null } {
  const ids = new Set(selecionadas);
  const candidatas = linhasSugestaoExata(linhas).filter((linha) => ids.has(linha.id));

  if (candidatas.length === 0) return { itens: [], erro: "Selecione ao menos uma sugestão exata." };
  if (candidatas.length > RETORNO_REVIEW_MAX_ITENS) {
    return { itens: [], erro: `Revise no máximo ${RETORNO_REVIEW_MAX_ITENS} itens por vez.` };
  }

  const itens: RetornoRevisaoUi[] = [];
  for (const linha of candidatas) {
    const demonstrativoId = linha.candidatos[0]?.id;
    const justificativa = (justificativas[linha.id] ?? "").trim();
    if (!demonstrativoId) return { itens: [], erro: "Uma sugestão não possui item compatível para revisão." };
    if (justificativa.length < 10 || justificativa.length > 200) {
      return { itens: [], erro: "Informe uma justificativa entre 10 e 200 caracteres para cada item selecionado." };
    }
    itens.push({ linhaId: linha.id, demonstrativoId, justificativa });
  }
  return { itens, erro: null };
}

export function haDivergenciaCabecalho(importacao: RetornoImportacaoUi | null | undefined): boolean {
  return importacao?.cabecalhoDivergente === "sim";
}

export function rotuloEstadoRetorno(estado: RetornoEstado): string {
  const rotulos: Record<RetornoEstado, string> = {
    sugerido: "Sugestão exata",
    ambiguo: "Vínculo ambíguo",
    sem_vinculo: "Sem vínculo",
    divergente: "Divergente",
    aprovado: "Aprovado",
  };
  return rotulos[estado];
}

export function classeEstadoRetorno(estado: RetornoEstado): string {
  const classes: Record<RetornoEstado, string> = {
    sugerido: "border-sky-200 bg-sky-50 text-sky-800",
    ambiguo: "border-amber-200 bg-amber-50 text-amber-900",
    sem_vinculo: "border-slate-200 bg-slate-50 text-slate-700",
    divergente: "border-rose-200 bg-rose-50 text-rose-800",
    aprovado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return classes[estado];
}

/** Evita injeção de fórmula em células de texto exportadas para Excel. */
export function sanitizarTextoExcel(valor: string | null | undefined): string {
  const texto = (valor ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim();
  return FORMULA_PREFIX.test(texto) ? `'${texto}` : texto;
}

export function nomeArquivoSeguro(nome: string, fallback: string): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return limpo || fallback;
}

/** Só libera mensagens de pré-condição explicitamente revisadas para a interface. */
export function mensagemErroRetorno(erro: unknown, acao: string): string {
  if (typeof erro === "object" && erro !== null) {
    const candidato = erro as { message?: unknown; data?: { code?: unknown } };
    if (
      candidato.data?.code === "PRECONDITION_FAILED"
      && typeof candidato.message === "string"
      && MENSAGENS_PRECONDICAO_SEGURAS.has(candidato.message)
    ) {
      return candidato.message.startsWith("O módulo de retornos")
        ? "Configuração pendente para os retornos de recursos."
        : candidato.message;
    }
  }
  return `Não foi possível ${acao}. Confira o escopo selecionado e tente novamente.`;
}

export function base64ParaBlob(conteudoBase64: string, mime: string): Blob {
  const base64 = conteudoBase64.includes(",") ? conteudoBase64.split(",").at(-1) ?? "" : conteudoBase64;
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivoSeguro(nomeArquivo, "arquivo-retorno");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
