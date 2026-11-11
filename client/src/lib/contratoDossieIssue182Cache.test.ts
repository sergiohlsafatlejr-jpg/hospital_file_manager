import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("invalida competências/lotes dependentes somente do contrato originário após preço ou IA salva", () => {
  const output = execFileSync(process.execPath, ["client/src/lib/contratoDossieIssue182Cache.harness.cjs"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: { PATH: process.env.PATH, HOME: "/home/ubuntu", LANG: "C.UTF-8", DATABASE_URL: "",
      JWT_SECRET: "ficticio-issue182-nao-segredo", NODE_OPTIONS: "--require=/home/ubuntu/reports/issue168/network-guard.cjs" },
    encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000,
  });
  expect(output).toContain("PASS cache_competencia_lote_vizinhos_tabela");
  expect(output).toContain("PASS cache_competencia_lote_vizinhos_ia");
});
