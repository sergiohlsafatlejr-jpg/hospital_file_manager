import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ehIntegracaoLegadaHup, HUP_HOP_ESTABELECIMENTO_ID } from "../hupLegacyCutover";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      release: "hup-hop-cutover-2026-10-05-v1",
      hupLegacyBlocked: ehIntegracaoLegadaHup({ estabelecimentoId: HUP_HOP_ESTABELECIMENTO_ID }),
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
