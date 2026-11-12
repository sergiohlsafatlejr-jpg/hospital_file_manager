import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("separa eventos XML de glosas e revoga handlers somente por transições do domínio protegido", () => {
  const guard = resolve(import.meta.dirname, "contratoDossieCacheDomainsDom.networkGuard.cjs");
  const output = execFileSync(process.execPath, ["client/src/lib/contratoDossieCacheDomainsUnit.harness.cjs"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: { PATH: process.env.PATH, HOME: process.env.HOME || homedir(), LANG: "C.UTF-8", DATABASE_URL: "",
      JWT_SECRET: "synthetic-test-only-not-production-issue177-validation",
      VITE_APP_ID: "synthetic-validation-app", OAUTH_SERVER_URL: "https://auth.example.invalid",
      TZ: "America/Sao_Paulo", NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${JSON.stringify(guard)}`.trim() },
    encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000,
  });
  expect(output).toContain('"failed":0');
  expect(output).toContain("PASS xml_erro_persistente_options_pos_render_selecao_manual_auto");
  expect(output).toContain("PASS transicoes_base_completas_antes_render_revogam_handler_antigo");
  expect(output).toContain("PASS cache_inline_bloqueia_hook_fresco_com_estado_error_fetch_invalidated_stale");
  expect(output).toContain("PASS ack_glosas_invalida_todas_competencias_so_contrato_originario");
});
