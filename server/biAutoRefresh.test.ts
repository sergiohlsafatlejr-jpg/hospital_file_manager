import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  BI_AUTO_REFRESH_INTERVAL_MS,
  BI_PROCESSING_POLL_ACTIVE_MS,
  BI_PROCESSING_POLL_IDLE_MS,
  formatBiLastUpdated,
  getBiAutoRefreshQueryOptions,
  invalidateAllBiQueries,
} from "../shared/biAutoRefresh";

describe("Política padronizada de atualização automática dos Relatórios BI", () => {
  it("configura intervalo híbrido de 60s com aba ativa e opção de pausar", () => {
    expect(BI_AUTO_REFRESH_INTERVAL_MS).toBe(60_000);
    expect(BI_PROCESSING_POLL_ACTIVE_MS).toBe(3_000);
    expect(BI_PROCESSING_POLL_IDLE_MS).toBe(15_000);

    const activeOpts = getBiAutoRefreshQueryOptions(true);
    expect(activeOpts).toEqual({
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchOnReconnect: "always",
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    });

    const pausedOpts = getBiAutoRefreshQueryOptions(false);
    expect(pausedOpts.refetchInterval).toBe(false);
    expect(pausedOpts.refetchIntervalInBackground).toBe(false);
  });

  it("formata o horário da última consulta BI de forma segura", () => {
    expect(formatBiLastUpdated(0)).toBeNull();
    expect(formatBiLastUpdated(undefined)).toBeNull();
    const formatted = formatBiLastUpdated(Date.UTC(2026, 3, 19, 14, 30, 0));
    expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("invalida todas as famílias de queries BI após importações", () => {
    const invalidateSpy = vi.fn();
    const mockUtils = {
      faturadoRecebidoUnificado: { dados: { invalidate: invalidateSpy } },
      relatoriosGlosasBi: {
        painelExecutivo: { invalidate: invalidateSpy },
        filtros: { invalidate: invalidateSpy },
      },
      warleineFaturamento: {
        faturadoRecebido: { invalidate: invalidateSpy },
        glosasBi: { invalidate: invalidateSpy },
        filtrosGlosas: { invalidate: invalidateSpy },
      },
      relatorioFaturamento: {
        buscar: { invalidate: invalidateSpy },
        listarConvenios: { invalidate: invalidateSpy },
      },
      comparativoMesAMes: { getDados: { invalidate: invalidateSpy } },
      relatorioLaboratorio: { dados: { invalidate: invalidateSpy } },
      relatorioUltrassom: { dados: { invalidate: invalidateSpy } },
      relatorioVisita: { dados: { invalidate: invalidateSpy } },
      relatorioVisitaXml: { dados: { invalidate: invalidateSpy } },
      relatorioOxUti: { dados: { invalidate: invalidateSpy } },
      relatorioOxUtiFaturado: { dados: { invalidate: invalidateSpy } },
      resumoPacienteOxUti: {
        faturado: { invalidate: invalidateSpy },
        recebido: { invalidate: invalidateSpy },
      },
      relatorioFisioterapia: { getDados: { invalidate: invalidateSpy } },
      previsaoPagamentosImec: { dados: { invalidate: invalidateSpy } },
      atendimentosBi: { painel: { invalidate: invalidateSpy } },
    };

    invalidateAllBiQueries(mockUtils);
    expect(invalidateSpy).toHaveBeenCalledTimes(20);
  });

  it("integra BiAutoRefreshBar nos relatórios do módulo BI e invalidação global nas telas de upload", () => {
    const hookSource = readFileSync("client/src/hooks/useBiAutoRefresh.ts", "utf8");
    expect(hookSource).toContain("trpc.arquivos.processando.useQuery");
    expect(hookSource).toContain("Importações concluídas e relatório atualizado.");

    const biPages = [
      "client/src/pages/FaturadoRecebidoUnificado.tsx",
      "client/src/pages/RelatoriosGlosasBi.tsx",
      "client/src/pages/RelatorioFaturamento.tsx",
      "client/src/pages/ComparativoMesAMes.tsx",
      "client/src/pages/RelatorioLaboratorio.tsx",
      "client/src/pages/RelatorioUltrassom.tsx",
      "client/src/pages/RelatorioVisita.tsx",
      "client/src/pages/RelatorioVisitaXml.tsx",
      "client/src/pages/RelatorioOxUti.tsx",
      "client/src/pages/RelatorioOxUtiFaturado.tsx",
      "client/src/pages/ResumoPacienteOxUti.tsx",
      "client/src/pages/RelatorioFisioterapia.tsx",
      "client/src/pages/PrevisaoPagamentosImec.tsx",
    ];

    for (const pagePath of biPages) {
      const content = readFileSync(pagePath, "utf8");
      expect(content, `${pagePath} deve renderizar BiAutoRefreshBar`).toContain("<BiAutoRefreshBar");
    }

    const uploadPages = [
      "client/src/pages/Upload.tsx",
      "client/src/pages/RecebimentosExcel.tsx",
      "client/src/pages/RecebimentosXml.tsx",
    ];

    for (const uploadPath of uploadPages) {
      const content = readFileSync(uploadPath, "utf8");
      expect(content, `${uploadPath} deve invalidar todas as queries BI`).toContain("invalidateAllBiQueries(utils)");
    }

    const faturadoRecebidoPage = readFileSync("client/src/pages/FaturadoRecebidoUnificado.tsx", "utf8");
    expect(faturadoRecebidoPage).toContain("Convênio → Mês");
    expect(faturadoRecebidoPage).toContain("Expandir todos");
    expect(faturadoRecebidoPage).toContain("Recolher todos");
    expect(faturadoRecebidoPage).toContain("Convênio x Mês");
  });
});
