import Decimal from "decimal.js";
import { z } from "zod";
import { dataPagamentoDemonstrativoSchema } from "./recursoGlosaDemonstrativoFiltros";

export const MAX_ITENS_GLOSA_MANUAL = 500;
export const GLOSA_MANUAL_LIMITES = {
  numeroGuia: 50,
  protocolo: 50,
  lotePrestador: 50,
  carteiraBeneficiario: 50,
  nomeBeneficiario: 255,
  codigoItem: 50,
  descricaoItem: 65_535,
  tipoLancamento: 100,
  codigoGlosa: 500,
  erroTiss: 500,
  justificativa: 65_535,
} as const;

const idSchema = z.number().int().positive().max(2_147_483_647);
const textoObrigatorio = (max: number) => z.string().max(max).refine(value => value.trim().length > 0, "Preencha o campo obrigatório");
const textoOpcional = (max: number) => z.string().max(max).optional();
// TEXT MySQL limita bytes, não apenas caracteres; considerar UTF-8 evita truncamento.
const textoLongo = z.string().max(65_535).refine(value => new TextEncoder().encode(value).length <= 65_535, "Texto excede o limite de bytes do campo");
const dataSchema = dataPagamentoDemonstrativoSchema.refine(value => Number(value.slice(0, 4)) >= 1000, "Data fora do intervalo suportado");
const decimalSchema = (max: string, escala: number) => z.number().finite().nonnegative()
  .refine(value => new Decimal(value).lte(max), "Valor excede o limite do campo decimal")
  .refine(value => new Decimal(value).decimalPlaces() <= escala, `Informe no máximo ${escala} casas decimais`);
// recursosGlosa.valorGlosado usa DECIMAL(10,2), menor que demonstrativo(12,2).
const dinheiroSchema = decimalSchema("99999999.99", 2);

/** Limites físicos de demonstrativo; coerência financeira permanece no serviço. */
export const glosaManualSubmissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  estabelecimentoId: idSchema,
  convenioId: idSchema,
  numeroGuia: textoObrigatorio(GLOSA_MANUAL_LIMITES.numeroGuia),
  protocolo: textoOpcional(GLOSA_MANUAL_LIMITES.protocolo),
  lotePrestador: textoOpcional(GLOSA_MANUAL_LIMITES.lotePrestador),
  dataPagamento: dataSchema.optional(),
  carteiraBeneficiario: textoOpcional(GLOSA_MANUAL_LIMITES.carteiraBeneficiario),
  nomeBeneficiario: textoObrigatorio(GLOSA_MANUAL_LIMITES.nomeBeneficiario),
  itens: z.array(z.object({
    sequencialItem: idSchema.optional(),
    codigoItem: textoObrigatorio(GLOSA_MANUAL_LIMITES.codigoItem),
    descricaoItem: textoLongo.refine(value => value.trim().length > 0, "Informe a descrição do item"),
    tipoLancamento: textoOpcional(GLOSA_MANUAL_LIMITES.tipoLancamento),
    dataExecucao: dataSchema.optional(),
    quantidade: decimalSchema("999999999.999", 3).refine(value => value > 0, "Quantidade deve ser positiva").optional(),
    valorInformado: dinheiroSchema,
    valorPago: dinheiroSchema,
    valorGlosa: dinheiroSchema,
    codigoGlosa: textoOpcional(GLOSA_MANUAL_LIMITES.codigoGlosa),
    erroTiss: textoOpcional(GLOSA_MANUAL_LIMITES.erroTiss),
    justificativa: textoLongo.optional(),
  })).min(1).max(MAX_ITENS_GLOSA_MANUAL),
});

export type GlosaManualSubmissionInput = z.infer<typeof glosaManualSubmissionSchema>;
export type GlosaManualPayload = Omit<GlosaManualSubmissionInput, "idempotencyKey">;

export const glosaManualReconciliationSchema = z.object({
  estabelecimentoId: idSchema,
  idempotencyKey: z.string().uuid(),
}).strict();
export type GlosaManualReconciliationResult =
  | { status: "nao_confirmado" }
  | { status: "concluido"; totalInseridos: number; dataPagamento: string; competencia: string };

type StorageTentativa = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RegistroTentativa = { version: 1; estado: "pendente"; uuid: string };
const registroTentativaSchema = z.object({
  version: z.literal(1), estado: z.literal("pendente"), uuid: z.string().uuid(),
}).strict();

/** Apenas UUID/estado/versão duráveis. Payload fica exclusivamente em memória.
 * Ausência na reconciliação nunca prova rollback: a chamada original pode atrasar.
 * Não há reset/cancelamento livre de uma tentativa possivelmente submetida.
 */
export function criarControleSubmissaoGlosaManual(opcoes: {
  userId: number;
  estabelecimentoId: number;
  storage: () => StorageTentativa;
  gerarUuid?: () => string;
}) {
  const namespace = `glosa-manual:v1:user:${idSchema.parse(opcoes.userId)}:hospital:${idSchema.parse(opcoes.estabelecimentoId)}`;
  let registro: RegistroTentativa | undefined;
  let payloadOriginal: GlosaManualPayload | undefined;
  let emVoo = false;
  let confirmado = false;
  let erroPersistencia: string | undefined;
  const ler = () => {
    const raw = opcoes.storage().getItem(namespace);
    return raw === null ? undefined : registroTentativaSchema.parse(JSON.parse(raw));
  };
  const indisponivel = () => {
    erroPersistencia = "Não foi possível preservar a tentativa com segurança nesta sessão. Nenhum novo envio é permitido; restabeleça o armazenamento ou solicite revisão responsável.";
    return new Error(erroPersistencia);
  };
  try { registro = ler(); } catch { indisponivel(); }
  const chavePara = (_payload: GlosaManualPayload): string => {
    if (erroPersistencia) throw new Error(erroPersistencia);
    try {
      const atual = ler();
      if (registro && atual?.uuid !== registro.uuid) throw new Error("Registro durável alterado");
      registro = atual ?? registro;
      if (!registro) {
        const uuid = z.string().uuid().parse((opcoes.gerarUuid ?? (() => globalThis.crypto.randomUUID()))());
        registro = { version: 1, estado: "pendente", uuid };
        opcoes.storage().setItem(namespace, JSON.stringify(registro));
      }
      if (ler()?.uuid !== registro.uuid) throw new Error("Registro não persistido");
      return registro.uuid;
    } catch { throw indisponivel(); }
  };
  return {
    estado() {
      return { key: registro?.uuid, pendente: !!registro, emVoo, temPayload: !!payloadOriginal, erroPersistencia };
    },
    chavePara,
    preparar(payload?: GlosaManualPayload): GlosaManualSubmissionInput {
      if (emVoo || confirmado) throw new Error("Aguarde a confirmação da tentativa atual");
      if (!payloadOriginal && !payload) throw new Error("Retome os dados originais da tentativa");
      const idempotencyKey = chavePara((payloadOriginal ?? payload)!); // persistência ANTES de qualquer mutation
      payloadOriginal ??= structuredClone(payload!);
      emVoo = true;
      return { ...structuredClone(payloadOriginal), idempotencyKey };
    },
    falhou(key: string) {
      if (registro?.uuid === key) emVoo = false; // HTTP perdido não significa não submetido
    },
    reconciliar(resultado: GlosaManualReconciliationResult, key: string) {
      if (registro?.uuid !== key) throw new Error("Confirmação fora do escopo da tentativa");
      if (resultado.status === "concluido") { confirmado = true; emVoo = false; }
    },
    resetAposConfirmacao(key: string) {
      if (!confirmado || registro?.uuid !== key) throw new Error("Tentativa sem resultado confirmado não pode ser descartada");
      try {
        const atual = ler();
        if (atual && atual.uuid !== key) throw new Error("Registro durável alterado");
        opcoes.storage().removeItem(namespace);
        if (ler() !== undefined) throw new Error("Registro não removido");
      } catch { throw indisponivel(); }
      registro = undefined;
      payloadOriginal = undefined;
      confirmado = false;
      emVoo = false;
    },
  };
}
