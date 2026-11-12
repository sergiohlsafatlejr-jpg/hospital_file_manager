import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("DOM real: domínios de cache isolados, glosas efetivas com XML erro e guardas stale", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const guard = resolve(import.meta.dirname, "contratoDossieCacheDomainsDom.networkGuard.cjs");
  const output = execFileSync(process.execPath, ["client/src/lib/contratoDossieCacheDomainsDom.harness.cjs"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME || homedir(),
      LANG: process.env.LANG || "C.UTF-8",
      DATABASE_URL: "",
      JWT_SECRET: "synthetic-test-only-not-production-issue177-validation",
      VITE_APP_ID: "synthetic-validation-app",
      OAUTH_SERVER_URL: "https://auth.example.invalid",
      TZ: "America/Sao_Paulo",
      // Preserva o guard autorizado de quem executa, sem depender de relatório externo.
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${JSON.stringify(guard)}`.trim(),
      ...(process.env.DOSSIE_DOM_CHROMIUM ? { DOSSIE_DOM_CHROMIUM: process.env.DOSSIE_DOM_CHROMIUM } : {}),
      ...(process.env.DOSSIE_DOM_EVIDENCE_DIR ? { DOSSIE_DOM_EVIDENCE_DIR: process.env.DOSSIE_DOM_EVIDENCE_DIR } : {}),
    },
    encoding: "utf8",
    timeout: 190_000,
    maxBuffer: 4_000_000,
  });
  expect(output).toContain("PASS xml_error_persistente_observerOptionsUpdated_selecao_mutacao_exatas");
  expect(output).toContain("PASS aviso_por_dominio_xml_nao_afirma_glosas_bloqueadas");
  expect(output).toContain("PASS dossie_completedRefetch_stale_handlers_bloqueados");
  expect(output).toContain("PASS glosas_completedRefetch_stale_handlers_bloqueados");
  expect(output).toContain("PASS max200_contagem_selecao_auto_recorte_nao_check_manual");
  expect(output).toContain("PASS contratoDossieCacheDomainsDom");
  expect(output).not.toContain("FAIL ");
}, 210_000);
