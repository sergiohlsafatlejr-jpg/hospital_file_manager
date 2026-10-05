import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { systemRouter } from "./systemRouter";

describe("prova pública de release HUP", () => {
  it("expõe a revisão do backend e comprova o corte do integrador legado", async () => {
    const caller = systemRouter.createCaller({ user: null } as TrpcContext);
    const status = await caller.health({ timestamp: 0 });

    expect(status).toEqual({
      ok: true,
      release: "hup-hop-cutover-2026-10-05-v1",
      hupLegacyBlocked: true,
    });
  });
});
