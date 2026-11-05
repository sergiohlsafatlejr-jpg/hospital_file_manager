import { createHash, createHmac, hkdfSync, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { bancoInterEncryptionKeyAvailable } from "./bancoInterVault";

const PREFIX = "fin-b1:";
const RECONCILIAR = "Emissão reservada ou incerta. Não repita: solicite reconciliação bancária desta tentativa.";
export type BoletoReference = { state: "reserved" | "uncertain" | "created"; id: string; fingerprint: string };
export function boletoReservado(reference: string | null | undefined): boolean { return !!reference?.startsWith(PREFIX) && !reference.startsWith(`${PREFIX}c:`); }
export function lerReferenciaBoleto(reference: string | null | undefined): BoletoReference | null {
  if (!reference?.startsWith(PREFIX)) return null;
  const match = /^fin-b1:([ruc]):([A-Za-z0-9_-]{1,50}):([a-f0-9]{32})$/.exec(reference);
  if (!match) throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
  return { state: match[1] === "c" ? "created" : match[1] === "u" ? "uncertain" : "reserved", id: match[2], fingerprint: match[3] };
}
export function codigoBoletoConfirmado(reference: string): string {
  const parsed = lerReferenciaBoleto(reference);
  if (parsed && parsed.state !== "created") throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
  const code = parsed?.id ?? reference;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(code)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Protocolo bancário inválido; solicite reconciliação." });
  return code;
}
export function referenciaBoleto(state: BoletoReference["state"], id: string, fingerprint: string): string {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(id) || !/^[a-f0-9]{32}$/.test(fingerprint)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
  const reference = `${PREFIX}${state === "created" ? "c" : state === "uncertain" ? "u" : "r"}:${id}:${fingerprint}`;
  if (reference.length > 100) throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
  return reference;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
/** HMAC: nenhum dado do pagador é persistido/logado na reserva. Replay exige
 * exatamente o mesmo input, banco, empresa, valor e vencimento normalizados. */
export function fingerprintBoleto(value: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (!bancoInterEncryptionKeyAvailable(env)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Chave financeira explícita necessária para reservar emissão com segurança." });
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(env.BANCO_INTER_ENCRYPTION_KEY!, "hex"), Buffer.from("safatle.financeiro.hkdf.v1"), Buffer.from("safatle.financeiro.boleto-fingerprint.v1"), 32));
  return createHmac("sha256", key).update(JSON.stringify(canonical(value))).digest("hex").slice(0, 32);
}
export function seuNumeroTentativa(attemptId: string): string { return `F${createHash("sha256").update(attemptId).digest("hex").slice(0, 14)}`; }
export type ClaimBoleto = { replay: false; attemptId: string; reserved: string } | { replay: true; codigoSolicitacao: string };
export function prepararClaimBoleto(reference: string | null, fingerprint: string): ClaimBoleto {
  const parsed = lerReferenciaBoleto(reference);
  if (parsed) {
    if (parsed.fingerprint !== fingerprint) throw new TRPCError({ code: "CONFLICT", message: "Dados da cobrança/pagador divergentes da tentativa persistida. Solicite reconciliação; não reemita." });
    if (parsed.state !== "created") throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
    return { replay: true, codigoSolicitacao: codigoBoletoConfirmado(reference!) };
  }
  if (reference) {
    // Legado não possui fingerprint do pagador: é impossível provar replay.
    throw new TRPCError({ code: "CONFLICT", message: "Boleto legado já vinculado. Use download/entrega ou solicite reconciliação; não reemita." });
  }
  const attemptId = randomUUID();
  return { replay: false, attemptId, reserved: referenciaBoleto("reserved", attemptId, fingerprint) };
}
export type BoletoRepository = {
  claim: (fingerprint: string) => Promise<ClaimBoleto>;
  complete: (reserved: string, created: string, result: any) => Promise<void>;
  uncertain: (reserved: string, uncertain: string) => Promise<void>;
};
/** O claim deve ser COMMITADO antes da rede; timeout/crash nunca libera reserva.
 * Não há TTL, retry automático, job em memória ou entrega acoplada à emissão. */
export async function emitirBoletoReservado(repository: BoletoRepository, fingerprint: string, emit: (seuNumero: string) => Promise<any>) {
  let claim: ClaimBoleto;
  try { claim = await repository.claim(fingerprint); } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reserva bancária não confirmada. Atualize a lista e confira o estado antes de qualquer tentativa." });
  }
  if (claim.replay) return { success: true as const, status: "replayed" as const, codigoSolicitacao: claim.codigoSolicitacao, entrega: "pendente" as const, message: "Protocolo já confirmado; nenhuma nova emissão. Entrega por e-mail é uma ação separada." };
  try {
    const result = await emit(seuNumeroTentativa(claim.attemptId));
    if (!result?.configured || result.error || typeof result.codigoSolicitacao !== "string") throw new Error("unconfirmed");
    const created = referenciaBoleto("created", result.codigoSolicitacao, fingerprint);
    await repository.complete(claim.reserved, created, result);
    return { success: true as const, status: "created" as const, codigoSolicitacao: result.codigoSolicitacao as string, entrega: "pendente" as const, message: "Protocolo persistido. Nenhum e-mail enviado; use Enviar boleto + NF após conferir o anexo." };
  } catch {
    try { await repository.uncertain(claim.reserved, referenciaBoleto("uncertain", claim.attemptId, fingerprint)); } catch {
      // Falha no registro de incerto mantém a reserva durável e igualmente bloqueante.
      console.warn("[Financeiro] Tentativa bancária exige reconciliação; reserva não liberada.");
    }
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: RECONCILIAR });
  }
}
