import { z } from "zod";
import { easyLocalEstabelecimento } from "./easyLocalIntegrador";
export const easyLocalAgendaUnidade = z.object({ estabelecimentoId: easyLocalEstabelecimento }).strict();
export const easyLocalAgendaPreviaInput = easyLocalAgendaUnidade.extend({
  leituraId: z.number().int().positive(),
  frequencia: z.enum(["15min", "1hora", "diario"]),
  horarioBrasilia: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.frequencia === "diario" && !input.horarioBrasilia) ctx.addIssue({ code: "custom", path: ["horarioBrasilia"], message: "Informe o horário diário de Brasília." });
  if (input.frequencia !== "diario" && input.horarioBrasilia) ctx.addIssue({ code: "custom", path: ["horarioBrasilia"], message: "Horário diário não se aplica a intervalos." });
});
export const easyLocalAgendaAtivarInput = easyLocalAgendaUnidade.extend({
  leituraId: z.number().int().positive(), tokenPrevia: z.string().min(1).max(8192), confirmarAgendamento: z.literal(true),
}).strict();
export const easyLocalAgendaAcaoInput = easyLocalAgendaUnidade.extend({ agendamentoId: z.number().int().positive() }).strict();
export type EasyLocalAgendaPreviaInput = z.infer<typeof easyLocalAgendaPreviaInput>;
export type EasyLocalAgendaAtivarInput = z.infer<typeof easyLocalAgendaAtivarInput>;
export type EasyLocalAgendaAcaoInput = z.infer<typeof easyLocalAgendaAcaoInput>;
export type EasyLocalAgendaPrevia = {
  tokenPrevia: string; frequencia: "15min" | "1hora" | "diario"; horarioBrasilia: string | null;
  fuso: "America/Sao_Paulo"; cronUtc: string; expiraEm: string;
  registrosLidos: number; registrosInseridos: number; registrosAtualizados: number; registrosInalterados: number; limite: number;
};
export type EasyLocalAgendaResumo = {
  id: number; leituraId: number; estabelecimentoId: number; criadoPor: number; podeGerenciar: boolean;
  estado: "preparando" | "ativo" | "pausado" | "erro" | "incerto";
  frequencia: "15min" | "1hora" | "diario"; horarioBrasilia: string | null; fuso: string; cronUtc: string;
  ultimaExecucao: string | null; proximaExecucao: string | null;
  ultimoResultado: { registrosLidos?: number; registrosInseridos?: number; registrosAtualizados?: number; registrosInalterados?: number; codigo?: string } | null;
};
