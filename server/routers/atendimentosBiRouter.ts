import { z } from "zod";
import { reportProcedure, router } from "../_core/trpc";
import { getAtendimentosBiDashboard } from "../atendimentosBiService";

const optionalText = z.string().trim().min(1).max(255).optional();

/**
 * Painel gerencial agregado de atendimentos.
 * Não há procedures de detalhe: esta API nunca retorna paciente, conta ou matrícula.
 */
export const atendimentosBiRouter = router({
  painel: reportProcedure("relAtendimentos")
    .input(z.object({
      estabelecimentoId: z.number().int().positive(),
      mesEntrada: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      etapa: optionalText,
      convenio: optionalText,
      setor: optionalText,
      categoria: optionalText,
      permanencia: optionalText,
      limite: z.number().int().min(5).max(30).default(12),
    }))
    .query(({ input }) => getAtendimentosBiDashboard(input)),
});
