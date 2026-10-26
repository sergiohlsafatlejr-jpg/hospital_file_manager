import { z } from "zod";
import { dataEnvioValida } from "./recursoLoteEnvioService";

export const pagamentoRecursoManualSchema = z
  .object({
    recursoId: z.number().int().positive(),
    valorRecebido: z
      .string()
      .trim()
      .refine(
        value => value === "" || /^\d{1,8}(?:\.\d{1,2})?$/.test(value),
        "Informe um valor não negativo com até duas casas decimais"
      )
      .optional(),
    dataPagamento: z
      .string()
      .refine(
        value => value === "" || dataEnvioValida(value),
        "Informe uma data de recebimento válida"
      )
      .optional(),
  })
  .strict()
  .refine(
    input =>
      input.valorRecebido !== undefined || input.dataPagamento !== undefined,
    "Informe o valor ou a data do recebimento"
  )
  .refine(
    input =>
      !(input.valorRecebido && Number(input.valorRecebido) > 0) ||
      !!input.dataPagamento,
    "Informe a data do recebimento do recurso"
  );

export function dadosPagamentoManual(
  input: z.infer<typeof pagamentoRecursoManualSchema>
) {
  const data: { valorRecebido?: string | null; dataPagamento?: Date | null } =
    {};
  if (input.valorRecebido !== undefined)
    data.valorRecebido =
      input.valorRecebido === ""
        ? null
        : Number(input.valorRecebido).toFixed(2);
  if (input.dataPagamento !== undefined)
    data.dataPagamento =
      input.dataPagamento === ""
        ? null
        : new Date(`${input.dataPagamento}T15:00:00.000Z`);
  return data;
}
