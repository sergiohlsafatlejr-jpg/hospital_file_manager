import { z } from "zod";

export const RETORNO_XML_MAX_BYTES = 2 * 1024 * 1024;
export const RETORNO_XML_MAX_ITENS = 2000;
export const RETORNO_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const RETORNO_MATCH_MAX_CANDIDATOS = 20;
export const RETORNO_REVIEW_MAX_ITENS = 200;
export const RETORNO_FORMATO = "cassi-resposta-recurso-4.01-v1" as const;
export const RETORNO_ORIGENS = ["externo", "portal"] as const;
export const RETORNO_ESTADOS = ["sugerido", "ambiguo", "sem_vinculo", "divergente", "aprovado"] as const;
export type RetornoOrigem = typeof RETORNO_ORIGENS[number];
export type RetornoEstado = typeof RETORNO_ESTADOS[number];

export function retornoDataCivilValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const dia = z.string().refine(retornoDataCivilValida, "Informe uma data válida");
export const retornoEscopoSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  convenioId: z.number().int().positive(),
}).strict();
export type RetornoEscopo = z.infer<typeof retornoEscopoSchema>;
const conteudoXml = z.string().min(4).max(Math.ceil(RETORNO_XML_MAX_BYTES / 3) * 4 + 4);
const moeda = z.string().regex(/^\d{1,12}\.\d{2}$/, "Informe o valor com duas casas decimais");
export const retornoPreviaSchema = retornoEscopoSchema.extend({ conteudoBase64: conteudoXml }).strict();
export const retornoImportarSchema = retornoPreviaSchema.extend({
  nomeArquivo: z.string().trim().min(1).max(255).refine(v => /\.xml$/i.test(v) && !/[\\/\x00-\x1f]/.test(v), "Nome XML inválido"),
  origemRecurso: z.enum(RETORNO_ORIGENS),
  lotePortalId: z.number().int().positive().optional(),
  tokenPrevia: z.string().min(20).max(4096),
  confirmar: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (v.origemRecurso === "portal" && !v.lotePortalId) ctx.addIssue({ code: "custom", path: ["lotePortalId"], message: "Informe o lote preparado no Portal" });
  if (v.origemRecurso === "externo" && v.lotePortalId) ctx.addIssue({ code: "custom", path: ["lotePortalId"], message: "Recurso externo não pode assumir lote do Portal" });
});
export const retornoListarSchema = retornoEscopoSchema.extend({
  inicio: dia.optional(), fim: dia.optional(),
  pagina: z.number().int().min(1).default(1),
  limite: z.number().int().min(1).max(50).default(20),
}).strict().refine(v => !v.inicio || !v.fim || v.inicio <= v.fim, "O início deve preceder o fim");
export const retornoDetalheSchema = retornoEscopoSchema.extend({ importacaoId: z.number().int().positive() }).strict();
export const retornoRevisarSchema = retornoDetalheSchema.extend({
  itens: z.array(z.object({ linhaId: z.number().int().positive(), demonstrativoId: z.number().int().positive(), justificativa: z.string().trim().min(10).max(2000) }).strict()).min(1).max(RETORNO_REVIEW_MAX_ITENS),
  confirmar: z.literal(true),
  confirmarDivergenciasCabecalho: z.boolean().default(false),
}).strict().refine(v => new Set(v.itens.map(i => i.linhaId)).size === v.itens.length, "Não repita uma linha na revisão");
export const retornoRebuscarSchema = retornoDetalheSchema;
export const retornoAnexoSchema = retornoDetalheSchema.extend({
  nomeArquivo: z.string().trim().min(1).max(255).refine(v => /\.pdf$/i.test(v) && !/[\\/\x00-\x1f]/.test(v), "Nome PDF inválido"),
  conteudoBase64: z.string().min(4).max(Math.ceil(RETORNO_PDF_MAX_BYTES / 3) * 4 + 4),
  confirmar: z.literal(true),
}).strict();
export const retornoArquivoSchema = retornoDetalheSchema.extend({ tipo: z.enum(["xml", "protocolo_pdf"]) }).strict();
export const retornoPagamentoSchema = retornoDetalheSchema.extend({
  valor: moeda, dataRecebimento: dia,
  referencia: z.string().trim().min(3).max(150),
  observacao: z.string().trim().min(10).max(2000),
  chaveOperacao: z.string().uuid(), confirmar: z.literal(true),
}).strict();
export const retornoEstornoSchema = retornoDetalheSchema.extend({
  pagamentoId: z.number().int().positive(), dataEstorno: dia,
  justificativa: z.string().trim().min(10).max(2000),
  chaveOperacao: z.string().uuid(), confirmar: z.literal(true),
}).strict();

export type RetornoXmlLinha = {
  posicao: number; guiaPrestador: string; guiaOperadora: string;
  sequencialItem: string | null; dataExecucao: string | null;
  codigoTabela: string; codigoItem: string; codigoGlosa: string;
  valorRecursado: string; valorAcatado: string;
  justificativaPrestador: string; justificativaOperadora: string;
};
export type RetornoXmlDocumento = {
  formato: typeof RETORNO_FORMATO; versaoTiss: string; registroAns: string;
  codigoPrestador: string; numeroLote: string; protocoloRecurso: string;
  guiaRecursoPrestador: string; guiaRecursoOperadora: string;
  dataResposta: string; dataRecurso: string; totalRecursadoCabecalho: string | null;
  totalAcatadoCabecalho: string | null; totalRecursadoItens: string;
  totalAcatadoItens: string; alertas: string[]; bloqueios: string[];
  linhas: RetornoXmlLinha[];
};
export type RetornoCandidato = {
  id: number; arquivoId: number; estabelecimentoId: number | null; convenioId: number | null;
  numeroGuia: string | null; sequencialItem: number | null; dataExecucao: string | Date | null;
  codigoItem: string | null; codigoGlosa: string | null; valorGlosa: string | null;
  protocolo: string | null; lotePrestador: string | null;
  codigoPrestador: string | null; nomeBeneficiario?: string | null;
  carteiraBeneficiario?: string | null; descricaoItem?: string | null;
};
export type RetornoMatch = {
  estado: Exclude<RetornoEstado, "aprovado">;
  candidatos: RetornoCandidato[]; motivo: string;
};
export type RetornoPrevia = {
  documento: Omit<RetornoXmlDocumento, "linhas">;
  totalItens: number; contagens: Record<Exclude<RetornoEstado, "aprovado">, number>;
  tokenPrevia: string; jaImportado: boolean; importacaoId?: number;
  armazenamentoPronto: boolean;
};
