import { describe, expect, it } from "vitest";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import type { AuthenticatedUser } from "./_core/sdk";

const testRouter = router({
  publicStatus: publicProcedure.query(() => "public-ok"),
  normalStatus: protectedProcedure.query(({ ctx }) => `user-${ctx.user!.id}`),
  adminStatus: adminProcedure.query(({ ctx }) => `admin-${ctx.user!.id}`),
});

function user(
  id: number,
  role: "admin" | "user",
  isCron = false
): AuthenticatedUser {
  const now = new Date("2026-10-14T00:00:00.000Z");
  return {
    id,
    openId: `user-${id}`,
    name: "Synthetic user",
    email: null,
    loginMethod: null,
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    ...(isCron ? { isCron: true, taskUid: "heartbeat-task" } : {}),
  } as AuthenticatedUser;
}

function context(authenticatedUser: AuthenticatedUser | null): TrpcContext {
  return {
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: authenticatedUser,
  };
}

describe("EasyLocal cron tRPC isolation", () => {
  it("permite ao chamador anônimo e ao usuário normal continuar usando a rota pública", async () => {
    await expect(
      testRouter.createCaller(context(null)).publicStatus()
    ).resolves.toBe("public-ok");
    await expect(
      testRouter.createCaller(context(user(7, "user"))).publicStatus()
    ).resolves.toBe("public-ok");
    await expect(
      testRouter.createCaller(context(user(7, "user"))).normalStatus()
    ).resolves.toBe("user-7");
    await expect(
      testRouter.createCaller(context(user(8, "admin"))).adminStatus()
    ).resolves.toBe("admin-8");
  });

  it("nega a identidade cron sintética em procedures pública, protegida e admin", async () => {
    const caller = testRouter.createCaller(context(user(-1, "admin", true)));
    await expect(caller.publicStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.normalStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.adminStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("nega um id não positivo mesmo sem a marca cron", async () => {
    await expect(
      testRouter.createCaller(context(user(-1, "admin"))).publicStatus()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
