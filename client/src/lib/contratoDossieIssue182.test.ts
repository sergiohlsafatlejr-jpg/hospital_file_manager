import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Não importa trpc/backend. O JSX/helper real é transpilado pelo harness em VM,
// com hooks/hosts UI sintéticos e QueryObserver/MutationObserver reais.
describe("Issue182 — integridade temporal do dossiê frontend (offline)", () => {
  it("passa os 20 cenários focados com rede bloqueada, sem backend/env/storage/IA", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const guard = "/home/ubuntu/reports/issue168/network-guard.cjs";
    const output = execFileSync(process.execPath, ["client/src/lib/contratoDossieIssue182.harness.cjs"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: "/home/ubuntu",
        LANG: "C.UTF-8",
        DATABASE_URL: "",
        JWT_SECRET: "ficticio-issue182-nao-segredo",
        NODE_OPTIONS: `--require=${guard}`,
      },
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2_000_000,
    });
    const result = JSON.parse(output.trim().split("\n").at(-1)!);
    expect(result.node).toMatch(/^v22\./);
    expect(result.scenarios).toBe(20);
    expect(result.reports).toHaveLength(20);
    expect(result.reports.every((scenario: { result: string }) => scenario.result === "PASS")).toBe(true);
    expect(result.backend).toBe(0);
    expect(result.network).toBe(0);
    expect(result.realMutations).toBe(0);
  });
});
