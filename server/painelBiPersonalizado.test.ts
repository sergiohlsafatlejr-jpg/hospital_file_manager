import { describe, expect, it } from "vitest";
import {
  biClientConfigSchema,
  BI_THEME_PRESETS,
  calcularPercentualGlosaBi,
  DEFAULT_BI_CLIENT_CONFIG,
  normalizeBiClientConfig,
  resolveBiThemePalette,
} from "../shared/biPersonalizadoConfig";
import { appRouter } from "./routers";

describe("Painel BI Executivo Personalizado — Regras & Temas", () => {
  it("reproduz exatamente o cálculo de % Glosa sobre processado do modelo Power BI (6,44%)", () => {
    const faturado = 34_559_201.82;
    const recebido = 27_674_962.79;
    const glosa = 1_906_306.73;

    const pctSobreProcessado = calcularPercentualGlosaBi(
      glosa,
      faturado,
      recebido,
      "SOBRE_PROCESSADO",
    );
    const pctSobreFaturado = calcularPercentualGlosaBi(
      glosa,
      faturado,
      recebido,
      "SOBRE_FATURADO",
    );

    expect(pctSobreProcessado).toBe(6.44);
    expect(pctSobreFaturado).toBe(5.52);
  });

  it("retorna 0% de glosa quando competências recentes ainda estão 100% em A Receber", () => {
    expect(
      calcularPercentualGlosaBi(0, 1_986_806.12, 0, "SOBRE_PROCESSADO"),
    ).toBe(0);
    expect(
      calcularPercentualGlosaBi(0, 1_986_806.12, 0, "SOBRE_FATURADO"),
    ).toBe(0);
  });

  it("mantém os 5 KPIs padrão do modelo executivo e suporta customização por cliente", () => {
    expect(DEFAULT_BI_CLIENT_CONFIG.kpisVisiveis).toEqual([
      "faturado",
      "recebido",
      "a_receber",
      "glosa",
      "pct_glosa",
    ]);
    expect(DEFAULT_BI_CLIENT_CONFIG.abasVisiveis).toEqual([
      "visao_geral",
      "glosas",
      "setores_producao",
    ]);

    const custom = biClientConfigSchema.parse({
      temaPreset: "custom",
      corFundoCustom: "#112233",
      corDestaqueCustom: "#ff7700",
      nomeExibicao: "Maternidade Ela",
      kpisVisiveis: ["produzido", "faturado", "recebido", "glosa", "pct_glosa"],
      abasVisiveis: ["visao_geral", "glosas"],
    });

    const palette = resolveBiThemePalette(custom);
    expect(palette.accentColor).toBe("#ff7700");
    expect(palette.panelTitleColor).toBe("#ff7700");
    expect(palette.kpiValueColor).toBe("#112233");
  });

  it("faz fallback seguro para configuração padrão caso JSON antigo/inválido exista", () => {
    const fallback = normalizeBiClientConfig(null);
    expect(fallback.temaPreset).toBe("ela_petroleo");
    expect(resolveBiThemePalette(fallback).accentColor).toBe(
      BI_THEME_PRESETS.ela_petroleo.accentColor,
    );
  });

  it("expõe o router painelBiPersonalizado no appRouter e bloqueia chamadas sem autenticação", async () => {
    const unauthedCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    });

    await expect(
      unauthedCaller.painelBiPersonalizado.dados({
        estabelecimentoId: 1,
        modoFonte: "XML",
      }),
    ).rejects.toThrow();
  });
});
