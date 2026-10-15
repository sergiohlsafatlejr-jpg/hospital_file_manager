import { adminProcedure, router } from "../_core/trpc";
import {
  easyLocalAgendaAcaoInput,
  easyLocalAgendaAtivarInput,
  easyLocalAgendaPreviaInput,
  easyLocalAgendaUnidade,
} from "../../shared/easyLocalAgendamento";
import {
  ativarEasyLocalAgendamento,
  listarEasyLocalAgendamentos,
  pausarEasyLocalAgendamento,
  preverEasyLocalAgendamento,
  retomarEasyLocalAgendamento,
  sessionTokenFromCookie,
} from "../easyLocalAgendamentoService";

/**
 * Rotas exclusivamente administrativas. O token enviado ao Heartbeat é somente
 * o valor já decodificado de app_session_id, nunca o header Cookie completo.
 */
export const easyLocalAgendamentoRouter = router({
  listar: adminProcedure
    .input(easyLocalAgendaUnidade)
    .query(({ input, ctx }) => listarEasyLocalAgendamentos(input, ctx.user.id)),
  prever: adminProcedure
    .input(easyLocalAgendaPreviaInput)
    .mutation(({ input, ctx }) => preverEasyLocalAgendamento(input, ctx.user.id)),
  ativar: adminProcedure
    .input(easyLocalAgendaAtivarInput)
    .mutation(({ input, ctx }) =>
      ativarEasyLocalAgendamento(
        input,
        ctx.user.id,
        sessionTokenFromCookie(ctx.req.headers.cookie)
      )
    ),
  pausar: adminProcedure
    .input(easyLocalAgendaAcaoInput)
    .mutation(({ input, ctx }) =>
      pausarEasyLocalAgendamento(
        input,
        ctx.user.id,
        sessionTokenFromCookie(ctx.req.headers.cookie)
      )
    ),
  retomar: adminProcedure
    .input(easyLocalAgendaAcaoInput)
    .mutation(({ input, ctx }) =>
      retomarEasyLocalAgendamento(
        input,
        ctx.user.id,
        sessionTokenFromCookie(ctx.req.headers.cookie)
      )
    ),
});
