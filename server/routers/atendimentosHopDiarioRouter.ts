import { adminProcedure, router } from "../_core/trpc";
import {
  hopDiarioConfirmacao,
  hopDiarioConfirmarCarga,
  hopDiarioEscopo,
} from "../../shared/atendimentosHopDiario";
import {
  ativarAtendimentosHopDiario,
  confirmarCargaAtendimentosHopDiario,
  gerarCredencialAtendimentosHopDiario,
  pausarAtendimentosHopDiario,
  preverAtendimentosHopDiario,
  publicarAtendimentosHopDiario,
  resumoAtendimentosHopDiario,
  sessionTokenFromCookie,
} from "../atendimentosHopDiarioService";

/**
 * Superfície administrativa estrita. A identidade vem somente do contexto
 * autenticado; cron é bloqueado no adminProcedure e nenhum destino, SQL, token
 * de produtor ou hash privado pode ser fornecido pela UI.
 */
export const atendimentosHopDiarioRouter = router({
  resumo: adminProcedure
    .input(hopDiarioEscopo)
    .query(({ input, ctx }) => resumoAtendimentosHopDiario(input, ctx.user.id)),
  confirmarCarga: adminProcedure
    .input(hopDiarioConfirmarCarga)
    .mutation(({ input, ctx }) => confirmarCargaAtendimentosHopDiario(input, ctx.user.id)),
  gerarCredencial: adminProcedure
    .input(hopDiarioEscopo)
    .mutation(({ input, ctx }) => gerarCredencialAtendimentosHopDiario(input, ctx.user.id)),
  prever: adminProcedure
    .input(hopDiarioEscopo)
    .mutation(({ input, ctx }) => preverAtendimentosHopDiario(input, ctx.user.id)),
  publicar: adminProcedure
    .input(hopDiarioConfirmacao)
    .mutation(({ input, ctx }) => publicarAtendimentosHopDiario(input, ctx.user.id)),
  ativar: adminProcedure
    .input(hopDiarioConfirmacao)
    .mutation(({ input, ctx }) => ativarAtendimentosHopDiario(
      input,
      ctx.user.id,
      sessionTokenFromCookie(ctx.req.headers.cookie),
    )),
  pausar: adminProcedure
    .input(hopDiarioEscopo)
    .mutation(({ input, ctx }) => pausarAtendimentosHopDiario(
      input,
      ctx.user.id,
      sessionTokenFromCookie(ctx.req.headers.cookie),
    )),
});
