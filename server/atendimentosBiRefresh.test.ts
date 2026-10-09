import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ATENDIMENTOS_BI_QUERY_OPTIONS } from "../shared/atendimentosBiRefresh";

const page = readFileSync(new URL("../client/src/pages/AtendimentosBi.tsx", import.meta.url), "utf8");

describe("atualização da tela BI de atendimentos", () => {
  it("busca dados atuais ao abrir, recuperar foco e reconectar", () => {
    expect(ATENDIMENTOS_BI_QUERY_OPTIONS).toMatchObject({
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
    });
  });

  it("atualiza a cada minuto sem continuar polling em segundo plano", () => {
    expect(ATENDIMENTOS_BI_QUERY_OPTIONS.refetchInterval).toBe(60_000);
    expect(ATENDIMENTOS_BI_QUERY_OPTIONS.refetchIntervalInBackground).toBe(false);
  });

  it("usa a política na consulta autorizada e recria os filtros ao trocar de unidade", () => {
    // Guarda estrutural complementar; não é teste E2E de navegador.
    expect(page).toContain("{ enabled, ...ATENDIMENTOS_BI_QUERY_OPTIONS }");
    expect(page).toContain("<AtendimentosBiPainel key={estabelecimentoAtual?.id ?? 0}");
    expect(page).toContain('temAcessoModulo("relAtendimentos")');
    expect(page).toContain("dashboardQuery.dataUpdatedAt");
    expect(page).not.toMatch(/\b(setInterval|setTimeout|fetch)\(/);
  });
});
