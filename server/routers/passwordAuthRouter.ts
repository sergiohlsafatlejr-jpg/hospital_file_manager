import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  authenticateWithPassword,
  isResetTokenValid,
  requestPasswordReset,
  resetPasswordWithToken,
  validateNewPassword,
} from "../passwordAuthService";

const genericResetMessage = "Se o e-mail estiver cadastrado, você receberá as instruções em alguns minutos.";
const PASSWORD_SESSION_MS = 12 * 60 * 60 * 1000;

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string | null } }) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export const passwordAuthRouter = router({
  login: publicProcedure
    .input(z.object({
      email: z.string().trim().email("Informe um e-mail válido").max(320),
      password: z.string().min(1, "Informe a senha").max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await authenticateWithPassword(input.email, input.password, clientIp(ctx.req));
      if (!result.success) {
        if (result.rateLimited) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos" });
      }

      const sessionToken = await sdk.createSessionToken(result.user.openId, {
        name: result.user.name || "Usuário",
        expiresInMs: PASSWORD_SESSION_MS,
        sessionVersion: result.user.sessionVersion,
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: PASSWORD_SESSION_MS,
      });
      return { success: true as const };
    }),

  requestReset: publicProcedure
    .input(z.object({ email: z.string().trim().email("Informe um e-mail válido").max(320) }))
    .mutation(async ({ ctx, input }) => {
      await requestPasswordReset(input.email, clientIp(ctx.req), ENV.publicAppUrl);
      return { success: true as const, message: genericResetMessage };
    }),

  validateResetToken: publicProcedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .mutation(async ({ input }) => ({ valid: await isResetTokenValid(input.token) })),

  resetPassword: publicProcedure
    .input(z.object({
      token: z.string().min(1).max(200),
      newPassword: z.string().min(1).max(128),
      confirmPassword: z.string().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "As senhas não conferem" });
      }
      const policyError = validateNewPassword(input.newPassword);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });

      const result = await resetPasswordWithToken(input.token, input.newPassword);
      if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      const user = await db.getUserById(result.userId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Conta não encontrada" });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "Usuário",
        expiresInMs: PASSWORD_SESSION_MS,
        sessionVersion: result.sessionVersion,
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: PASSWORD_SESSION_MS,
      });
      return { success: true as const, message: "Senha criada com sucesso" };
    }),
});
