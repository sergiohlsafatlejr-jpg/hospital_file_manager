import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";

export function dataEnvioValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export const confirmarEnvioLoteSchema = z
  .object({
    loteId: z.number().int().positive(),
    protocoloEnvio: z.string().trim().min(1).max(100),
    dataEnvio: z
      .string()
      .refine(dataEnvioValida, "Informe uma data de envio válida"),
    confirmar: z.literal(true),
  })
  .strict();

export type ConfirmarEnvioLoteInput = z.infer<typeof confirmarEnvioLoteSchema>;
type EscopoLote = { estabelecimentoId: number; convenioId: number };

function diaBrasilia(value: Date | string): string {
  if (typeof value === "string" && dataEnvioValida(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Registra a declaração manual de envio externo. Não transmite ao convênio. */
export async function confirmarEnvioLote(
  payload: ConfirmarEnvioLoteInput,
  userId: number,
  escopo: EscopoLote
) {
  const input = confirmarEnvioLoteSchema.parse(payload);
  if (input.dataEnvio > diaBrasilia(new Date())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A data de envio não pode estar no futuro",
    });
  }
  const database = await getDb();
  if (!database)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco indisponível",
    });
  // Meio-dia de Brasília: preserva a data civil escolhida sem drift para o dia anterior.
  const dataEnvio = new Date(`${input.dataEnvio}T15:00:00.000Z`);
  return database.transaction(async tx => {
    const [rows] = await tx.execute(sql`
      SELECT id, estabelecimentoId, convenioId, status, protocoloEnvio, dataEnvio
      FROM lotesRecurso WHERE id = ${input.loteId} FOR UPDATE
    `);
    const lote = (
      rows as unknown as Array<{
        id: number;
        estabelecimentoId: number;
        convenioId: number;
        status: string;
        protocoloEnvio: string | null;
        dataEnvio: Date | string | null;
      }>
    )[0];
    if (!lote)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Lote não encontrado",
      });
    if (
      lote.estabelecimentoId !== escopo.estabelecimentoId ||
      lote.convenioId !== escopo.convenioId
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "O escopo do lote foi alterado; atualize a tela",
      });
    }
    if (!["rascunho", "pendente_envio"].includes(lote.status)) {
      if (
        ["enviado", "em_analise", "respondido", "finalizado"].includes(
          lote.status
        ) &&
        lote.protocoloEnvio === input.protocoloEnvio &&
        lote.dataEnvio &&
        diaBrasilia(lote.dataEnvio) === input.dataEnvio
      ) {
        return { success: true, jaConfirmado: true, status: lote.status };
      }
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "O lote já está em acompanhamento. Seu status e protocolo foram preservados.",
      });
    }
    const [recursosRows] = await tx.execute(sql`
      SELECT id, estabelecimentoId, convenioId, status FROM recursosGlosa
      WHERE loteId = ${input.loteId} FOR UPDATE
    `);
    const recursos = recursosRows as unknown as Array<{
      id: number;
      estabelecimentoId: number | null;
      convenioId: number;
      status: string;
    }>;
    if (
      recursos.some(
        r =>
          r.estabelecimentoId !== escopo.estabelecimentoId ||
          r.convenioId !== escopo.convenioId
      )
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Há recursos com vínculo de unidade ou convênio incompatível. Revise o lote.",
      });
    }
    const [demonstrativosRows] = await tx.execute(sql`
      SELECT id, estabelecimentoId, convenio_id AS convenioId FROM demonstrativo
      WHERE recurso_id = ${input.loteId} FOR UPDATE
    `);
    const [conciliadosRows] = await tx.execute(sql`
      SELECT id, estabelecimentoId, convenioId FROM conciliados_automatico
      WHERE xmlRecursoLoteId = ${input.loteId} FOR UPDATE
    `);
    const modernos = [
      ...(demonstrativosRows as unknown as Array<EscopoLote>),
      ...(conciliadosRows as unknown as Array<EscopoLote>),
    ];
    if (
      modernos.some(
        r =>
          r.estabelecimentoId !== escopo.estabelecimentoId ||
          r.convenioId !== escopo.convenioId
      )
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Há itens com vínculo de unidade ou convênio incompatível. Revise o lote.",
      });
    }
    await tx.execute(sql`
      UPDATE lotesRecurso SET status = 'enviado', protocoloEnvio = ${input.protocoloEnvio}, dataEnvio = ${dataEnvio}
      WHERE id = ${input.loteId} AND estabelecimentoId = ${escopo.estabelecimentoId} AND convenioId = ${escopo.convenioId}
    `);
    await tx.execute(sql`
      INSERT INTO historicoRecursos (recursoId, userId, tipo, statusAnterior, statusNovo, descricao)
      SELECT id, ${userId}, 'envio', status, 'enviado', 'Envio externo declarado e confirmado manualmente no Portal'
      FROM recursosGlosa WHERE loteId = ${input.loteId} AND estabelecimentoId = ${escopo.estabelecimentoId}
      AND convenioId = ${escopo.convenioId} AND status IN ('rascunho', 'pendente_envio')
    `);
    await tx.execute(sql`
      UPDATE recursosGlosa SET status = 'enviado', dataEnvioRecurso = ${dataEnvio}, protocoloRecurso = ${input.protocoloEnvio}
      WHERE loteId = ${input.loteId} AND estabelecimentoId = ${escopo.estabelecimentoId} AND convenioId = ${escopo.convenioId}
      AND status IN ('rascunho', 'pendente_envio')
    `);
    await tx.execute(sql`
      UPDATE demonstrativo SET recurso_status = 'recurso_enviado'
      WHERE recurso_id = ${input.loteId} AND estabelecimentoId = ${escopo.estabelecimentoId} AND convenio_id = ${escopo.convenioId}
      AND recurso_status = 'recurso_criado'
    `);
    await tx.execute(sql`
      UPDATE conciliados_automatico SET statusRecursoItem = 'recurso_enviado'
      WHERE xmlRecursoLoteId = ${input.loteId} AND estabelecimentoId = ${escopo.estabelecimentoId} AND convenioId = ${escopo.convenioId}
      AND statusRecursoItem = 'iniciado'
    `);
    return { success: true, jaConfirmado: false, status: "enviado" };
  });
}
