import { TRPCError } from "@trpc/server";

/** A fronteira pública nunca expõe a mensagem do driver, SQL ou causa interna. */
export async function operacaoDossieSegura<T>(
  operacao: () => Promise<T>
): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    const mensagens = {
      FORBIDDEN: "Sem permissão para acessar este contrato.",
      NOT_FOUND: "Contrato não encontrado.",
      BAD_REQUEST: "Dados contratuais inválidos.",
      CONFLICT:
        "Divergência na integridade dos itens contratuais. Revise o lote antes de tentar novamente.",
      PRECONDITION_FAILED: "Banco de dados indisponível.",
    };
    if (erro instanceof TRPCError && erro.code in mensagens) {
      throw new TRPCError({
        code: erro.code,
        message: mensagens[erro.code as keyof typeof mensagens],
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Não foi possível concluir a operação contratual. Nenhuma alteração parcial foi confirmada.",
    });
  }
}

export function divergenciaDossie(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "Divergência na integridade dos itens contratuais. Revise o lote antes de tentar novamente.",
  });
}

/** Não confundir matchedRows, IDs solicitados ou ausência de erro com gravação. */
export function exigirUmaGravacao(resultado: unknown): void {
  const cabecalho = Array.isArray(resultado) ? resultado[0] : resultado;
  if (
    !cabecalho ||
    typeof cabecalho !== "object" ||
    !("affectedRows" in cabecalho) ||
    cabecalho.affectedRows !== 1
  )
    divergenciaDossie();
}

export function centavosDossie(valor: unknown): bigint {
  const texto = String(valor ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) divergenciaDossie();
  const [inteiro, fracao = ""] = texto.split(".");
  return BigInt(inteiro) * 100n + BigInt(fracao.padEnd(2, "0"));
}
