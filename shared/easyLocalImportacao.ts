import { z } from "zod";
import { easyLocalEstabelecimento } from "./easyLocalIntegrador";

/** Limite deliberadamente pequeno para uma confirmação manual atômica. */
export const EASYLOCAL_IMPORTACAO_LIMITE = 2000;
export const EASYLOCAL_PREVIA_TTL_SEGUNDOS = 15 * 60;

export const easyLocalImportacaoPreviaInput = z
  .object({
    leituraId: z.number().int().positive(),
    estabelecimentoId: easyLocalEstabelecimento,
  })
  .strict();

export const easyLocalImportacaoExecutarInput =
  easyLocalImportacaoPreviaInput
    .extend({
      confirmarImportacao: z.literal(true),
      // Compact JWS HS256; o limite bloqueia payloads arbitrários e excessivos.
      tokenPrevia: z.string().min(1).max(8192),
    })
    .strict();

export type EasyLocalImportacaoPreviaInput = z.infer<
  typeof easyLocalImportacaoPreviaInput
>;
export type EasyLocalImportacaoExecutarInput = z.infer<
  typeof easyLocalImportacaoExecutarInput
>;

/** Nunca inclui linhas, chaves, campos clínicos, credenciais nem hashes. */
export type EasyLocalImportacaoPrevia = {
  tokenPrevia: string;
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosInalterados: number;
  nomeTabela: string;
  limite: number;
  expiraEm: string;
};

/** Nunca inclui linhas, chaves, campos clínicos, credenciais nem hashes. */
export type EasyLocalImportacaoResultado = {
  sucesso: true;
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosInalterados: number;
};
