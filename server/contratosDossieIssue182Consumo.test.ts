import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Regressão de fonte real, sem import de db/env/IA/storage, banco ou XML completo. */
describe("Issue182 H4-R — consumo da fundamentação persistida", () => {
  it("prova os sete cenários comportamentais de fila/lote/campo ANS em subprocesso isolado", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const guard = "/home/ubuntu/reports/issue168/network-guard.cjs";
    const run = spawnSync(
      process.execPath,
      [path.join(root, "server/contratosDossieIssue182Consumo.harness.cjs")],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH || "/usr/bin:/bin",
          HOME: "/home/ubuntu",
          DATABASE_URL: "",
          JWT_SECRET: "ISSUE182_CONSUMO_SINTETICO_SEM_USO_REAL",
          NODE_ENV: "test",
          NODE_OPTIONS: `--require=${guard}`,
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    expect(run.error, run.stderr).toBeUndefined();
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stderr).toBe("");
    for (let i = 1; i <= 7; i++) {
      expect(run.stdout).toContain(`PASS C0${i} `);
    }
    const report = JSON.parse(run.stdout.trim().split("\n").at(-1)!);
    expect(report.resultado).toBe("PASS");
    expect(report.testes).toBe(7);
    expect(report.node).toMatch(/^v22\./);
    expect(report.consumidores).toEqual([
      "getRecursosAgrupadosPorConvenio",
      "getRecursosDoConvenio",
      "getRecursosLoteParaExportacao",
      "gerarXmlsRecursoGlosaPorProtocolo",
    ]);
  }, 65_000);
});
