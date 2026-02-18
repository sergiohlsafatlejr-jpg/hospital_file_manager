import { describe, it, expect } from "vitest";
import { comparacoesRouter } from "./comparacoesRouter";

describe("comparacoesRouter", () => {
  it("deve ter os métodos create, list, get, update e delete", () => {
    expect(comparacoesRouter).toBeDefined();
    expect(comparacoesRouter.createCaller).toBeDefined();
  });

  it("deve ter a procedure create", () => {
    const caller = comparacoesRouter.createCaller({} as any);
    expect(caller.create).toBeDefined();
  });

  it("deve ter a procedure list", () => {
    const caller = comparacoesRouter.createCaller({} as any);
    expect(caller.list).toBeDefined();
  });

  it("deve ter a procedure get", () => {
    const caller = comparacoesRouter.createCaller({} as any);
    expect(caller.get).toBeDefined();
  });

  it("deve ter a procedure update", () => {
    const caller = comparacoesRouter.createCaller({} as any);
    expect(caller.update).toBeDefined();
  });

  it("deve ter a procedure delete", () => {
    const caller = comparacoesRouter.createCaller({} as any);
    expect(caller.delete).toBeDefined();
  });
});
