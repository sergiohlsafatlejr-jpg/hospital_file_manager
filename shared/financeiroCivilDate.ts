import { z } from "zod";
import { parseDataCivil } from "./contasPagarImport";

/** Campos SQL DATE representam um dia civil, não um instante para converter de fuso. */
export function valorDataCivil(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const text = value instanceof Date ? (Number.isNaN(value.getTime()) ? "" : value.toISOString()) : String(value).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|[T ]\d{2}:\d{2})/.exec(text)?.[1];
  if (iso) return parseDataCivil(iso);
  return parseDataCivil(text);
}

export function formatarDataCivilBR(value: Date | string | null | undefined): string {
  const iso = valorDataCivil(value);
  if (!iso) return "-";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function paraInputDataCivil(value: Date | string | null | undefined): string {
  return valorDataCivil(value) ?? "";
}

/** Aceita ISO de input HTML ou data brasileira completa; rejeita 25/10 sem ano e datas impossíveis. */
export const dataCivilFinanceiraSchema = z.string().trim().refine(
  value => /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})$/.test(value) && Boolean(parseDataCivil(value)),
  { message: "Data inválida. Use DD/MM/AAAA ou selecione no calendário." },
).transform(value => parseDataCivil(value)!);

/** Meio-dia UTC permanece no mesmo dia ao escrever DATE em UTC ou America/Sao_Paulo. */
export function dataCivilParaBanco(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

export function somarDiasCivis(iso: string, dias: number): string {
  const date = dataCivilParaBanco(iso);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

export function hojeCivilBrasil(now = new Date()): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}
