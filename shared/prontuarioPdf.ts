import { z } from "zod";

export const PRONTUARIO_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const PRONTUARIO_PDF_TIPO = "prontuario_pdf" as const;

const textoChave = (max: number, campo: string) =>
  z
    .string()
    .trim()
    .max(max, `${campo} excede o tamanho permitido`)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), `${campo} inválido`);

const identificadorMultipart = (campo: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${campo} inválido`)
    .transform(Number)
    .pipe(z.number().int().positive(`${campo} inválido`));

export const prontuarioPdfEscopoSchema = z
  .object({
    estabelecimentoId: z.number().int().positive(),
    convenioId: z.number().int().positive(),
    arquivoHospitalId: z.number().int().positive(),
    numeroConta: textoChave(100, "Número da conta").min(
      1,
      "Número da conta obrigatório"
    ),
    numeroLote: textoChave(100, "Número do lote"),
    competencia: textoChave(20, "Competência"),
  })
  .strict();

export type ProntuarioPdfEscopo = z.infer<typeof prontuarioPdfEscopoSchema>;

const nomePdf = textoChave(255, "Nome do arquivo").refine(
  value => value.length > 0 && /\.pdf$/i.test(value) && !/[\\/]/.test(value),
  "Nome de PDF inválido"
);

export const prontuarioPdfListarSchema = prontuarioPdfEscopoSchema;

/**
 * Campos textuais aceitos exclusivamente no formulário multipart autenticado.
 * O arquivo é recebido como parte multipart, jamais como campo de contrato.
 */
export const prontuarioPdfUploadMultipartSchema = z
  .object({
    estabelecimentoId: identificadorMultipart("Estabelecimento"),
    convenioId: identificadorMultipart("Convênio"),
    arquivoHospitalId: identificadorMultipart("Arquivo hospitalar"),
    numeroConta: textoChave(100, "Número da conta").min(
      1,
      "Número da conta obrigatório"
    ),
    numeroLote: textoChave(100, "Número do lote"),
    competencia: textoChave(20, "Competência"),
    nomeArquivo: nomePdf,
    confirmar: z.literal("true"),
  })
  .strict()
  .transform(({ confirmar: _confirmar, ...input }) => ({
    ...input,
    confirmar: true as const,
  }));

export type ProntuarioPdfUploadMultipart = z.infer<
  typeof prontuarioPdfUploadMultipartSchema
>;

export const prontuarioPdfInativarSchema = prontuarioPdfEscopoSchema
  .extend({
    anexoId: z.number().int().positive(),
    confirmar: z.literal(true),
  })
  .strict();

export const prontuarioPdfDownloadSchema = prontuarioPdfEscopoSchema
  .extend({ anexoId: z.number().int().positive() })
  .strict();

export type ProntuarioPdfAnexoPublico = {
  id: number;
  nomeArquivo: string;
  tamanhoBytes: number;
  criadoEm: Date | string;
};

/** Resposta mínima do POST multipart; nunca inclui URL, hash ou chave de storage. */
export type ProntuarioPdfUploadPublico = Pick<
  ProntuarioPdfAnexoPublico,
  "id" | "nomeArquivo" | "tamanhoBytes"
>;
