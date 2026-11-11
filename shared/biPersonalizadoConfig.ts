import { z } from "zod";

export const biTemaPresetSchema = z.enum([
  "ela_petroleo",
  "safatle_navy",
  "esmeralda_hosp",
  "indigo_royal",
  "clean_light",
  "custom",
]);
export type BiTemaPreset = z.infer<typeof biTemaPresetSchema>;

export const biAbaIdSchema = z.enum([
  "visao_geral",
  "glosas",
  "setores_producao",
]);
export type BiAbaId = z.infer<typeof biAbaIdSchema>;

export const biKpiIdSchema = z.enum([
  "produzido",
  "faturado",
  "recebido",
  "a_receber",
  "glosa",
  "pct_glosa",
  "pct_recebido",
  "glosa_recurso",
  "glosa_recuperada",
  "qtd_contas",
]);
export type BiKpiId = z.infer<typeof biKpiIdSchema>;

export const biFiltroIdSchema = z.enum(["setor", "competencia", "convenio"]);
export type BiFiltroId = z.infer<typeof biFiltroIdSchema>;

export const biDimensaoSetorSchema = z.enum(["setor", "tipo_item", "prestador"]);
export type BiDimensaoSetor = z.infer<typeof biDimensaoSetorSchema>;

export const biFormulaPctGlosaSchema = z.enum([
  "SOBRE_PROCESSADO",
  "SOBRE_FATURADO",
]);
export type BiFormulaPctGlosa = z.infer<typeof biFormulaPctGlosaSchema>;

export const biSubFonteBancoSchema = z.enum([
  "AUTO",
  "WARLEINE",
  "RECEBIMENTO_GERAL",
]);
export type BiSubFonteBanco = z.infer<typeof biSubFonteBancoSchema>;

export const biCriterioPeriodoXmlSchema = z.enum(["FATURAMENTO", "PAGAMENTO"]);
export type BiCriterioPeriodoXml = z.infer<typeof biCriterioPeriodoXmlSchema>;

export const biClientConfigSchema = z.object({
  temaPreset: biTemaPresetSchema.default("ela_petroleo"),
  logoUrl: z.string().max(350_000).nullable().default(null),
  nomeExibicao: z.string().max(120).nullable().default(null),
  tituloRelatorio: z
    .string()
    .max(120)
    .default("INDICADORES DE FATURAMENTO"),
  rodapeTexto: z
    .string()
    .max(180)
    .default("CICLO DA RECEITA - FATURADO AO RECEBIMENTO"),

  // Cores customizadas opcionais (usadas quando temaPreset = 'custom' ou como override)
  corFundoCustom: z.string().max(30).nullable().default(null),
  corPainelCustom: z.string().max(30).nullable().default(null),
  corDestaqueCustom: z.string().max(30).nullable().default(null),
  corCardKpiCustom: z.string().max(30).nullable().default(null),
  corBarraGraficoCustom: z.string().max(30).nullable().default(null),

  // Abas habilitadas para este cliente
  abasVisiveis: z
    .array(biAbaIdSchema)
    .min(1)
    .default(["visao_geral", "glosas", "setores_producao"]),
  nomesAbas: z
    .object({
      visao_geral: z.string().max(60).default("Visão Geral"),
      glosas: z.string().max(60).default("Glosas & Recursos"),
      setores_producao: z.string().max(60).default("Setores & Produção"),
    })
    .default({
      visao_geral: "Visão Geral",
      glosas: "Glosas & Recursos",
      setores_producao: "Setores & Produção",
    }),

  // KPIs visíveis e na ordem definida para o cliente
  kpisVisiveis: z
    .array(biKpiIdSchema)
    .min(1)
    .max(8)
    .default(["faturado", "recebido", "a_receber", "glosa", "pct_glosa"]),

  // Segmentações de dados (Slicers) no cabeçalho
  filtrosVisiveis: z
    .array(biFiltroIdSchema)
    .default(["setor", "competencia", "convenio"]),

  // Visibilidade dos 4 painéis da Visão Geral
  blocosVisaoGeral: z
    .object({
      competencia: z.boolean().default(true),
      setores: z.boolean().default(true),
      convenios: z.boolean().default(true),
      evolucaoMensal: z.boolean().default(true),
    })
    .default({
      competencia: true,
      setores: true,
      convenios: true,
      evolucaoMensal: true,
    }),

  // Agrupamento do painel superior direito (Setores / Tipo de Item / Prestador)
  dimensaoPainelSetores: biDimensaoSetorSchema.default("setor"),
  tituloPainelSetores: z.string().max(60).nullable().default(null),

  // Formatação condicional e cálculo
  mostrarDataBars: z.boolean().default(true),
  mostrarSerieProduzido: z.boolean().default(true),
  formulaPctGlosa: biFormulaPctGlosaSchema.default("SOBRE_PROCESSADO"),

  // Preferências padrão de fonte por cliente
  criterioPeriodoXmlPadrao: biCriterioPeriodoXmlSchema.default("FATURAMENTO"),
  subFonteBancoPadrao: biSubFonteBancoSchema.default("AUTO"),
});

export type BiClientConfig = z.infer<typeof biClientConfigSchema>;

export const DEFAULT_BI_CLIENT_CONFIG: BiClientConfig = biClientConfigSchema.parse({});

export interface BiThemePalette {
  id: BiTemaPreset;
  nome: string;
  descricao: string;
  isLightCanvas: boolean;
  headerBg: string;
  headerText: string;
  headerSubtext: string;
  slicerFrameBg: string;
  slicerFrameBorder: string;
  slicerLabelBg: string;
  slicerLabelText: string;
  canvasBg: string;
  panelBg: string;
  panelBorder: string;
  panelTitleColor: string;
  kpiCardBg: string;
  kpiValueColor: string;
  kpiLabelColor: string;
  accentColor: string;
  accentContrast: string;
  chartBarColor: string;
  chartLineFaturado: string;
  chartLineRecebido: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableTotalBg: string;
  tableTotalText: string;
  dataBarFaturado: string;
  dataBarRecebido: string;
  dataBarGlosa: string;
  dataBarAReceber: string;
  footerBg: string;
  footerText: string;
}

export const BI_THEME_PRESETS: Record<Exclude<BiTemaPreset, "custom">, BiThemePalette> = {
  ela_petroleo: {
    id: "ela_petroleo",
    nome: "Petróleo & Laranja (Modelo Power BI)",
    descricao: "Fundo azul-petróleo profundo com destaques em laranja e cartões claros de alto contraste.",
    isLightCanvas: false,
    headerBg: "linear-gradient(90deg, #ffffff 0%, #eef6f8 34%, #cbe1e8 58%, #0c4759 100%)",
    headerText: "#0a3948",
    headerSubtext: "#476b78",
    slicerFrameBg: "rgba(6, 48, 63, 0.92)",
    slicerFrameBorder: "rgba(125, 211, 228, 0.42)",
    slicerLabelBg: "#f8fafc",
    slicerLabelText: "#0d4a5d",
    canvasBg: "linear-gradient(180deg, #083d4f 0%, #063140 55%, #042531 100%)",
    panelBg: "rgba(6, 49, 64, 0.82)",
    panelBorder: "rgba(86, 194, 214, 0.30)",
    panelTitleColor: "#f28b30",
    kpiCardBg: "#eff4f6",
    kpiValueColor: "#073b4c",
    kpiLabelColor: "#144556",
    accentColor: "#e87a1e",
    accentContrast: "#ffffff",
    chartBarColor: "#c77d32",
    chartLineFaturado: "#cbe8f6",
    chartLineRecebido: "#75d6b2",
    tableHeaderBg: "#062c3a",
    tableHeaderText: "#f1f5f9",
    tableTotalBg: "#dce7ec",
    tableTotalText: "#072936",
    dataBarFaturado: "#9dc4e4",
    dataBarRecebido: "#9bd6be",
    dataBarGlosa: "#f4b2b7",
    dataBarAReceber: "#f8c99b",
    footerBg: "rgba(3, 29, 39, 0.95)",
    footerText: "#cbd5e1",
  },
  safatle_navy: {
    id: "safatle_navy",
    nome: "Safatle Navy & Gold",
    descricao: "Identidade executiva azul-marinho escuro com detalhes dourados institucionais.",
    isLightCanvas: false,
    headerBg: "linear-gradient(90deg, #ffffff 0%, #f1f5f9 36%, #cbd5e1 58%, #0f213d 100%)",
    headerText: "#0f213d",
    headerSubtext: "#475569",
    slicerFrameBg: "rgba(15, 33, 61, 0.94)",
    slicerFrameBorder: "rgba(148, 163, 184, 0.4)",
    slicerLabelBg: "#f8fafc",
    slicerLabelText: "#0f213d",
    canvasBg: "linear-gradient(180deg, #0f213d 0%, #0b182e 60%, #071020 100%)",
    panelBg: "rgba(15, 31, 58, 0.86)",
    panelBorder: "rgba(96, 165, 250, 0.26)",
    panelTitleColor: "#eab308",
    kpiCardBg: "#f4f6fa",
    kpiValueColor: "#0f213d",
    kpiLabelColor: "#334155",
    accentColor: "#d99b26",
    accentContrast: "#ffffff",
    chartBarColor: "#d99b26",
    chartLineFaturado: "#93c5fd",
    chartLineRecebido: "#6ee7b7",
    tableHeaderBg: "#091528",
    tableHeaderText: "#f8fafc",
    tableTotalBg: "#dde4ee",
    tableTotalText: "#0f172a",
    dataBarFaturado: "#93c5fd",
    dataBarRecebido: "#86efac",
    dataBarGlosa: "#fda4af",
    dataBarAReceber: "#fcd34d",
    footerBg: "rgba(6, 13, 26, 0.96)",
    footerText: "#cbd5e1",
  },
  esmeralda_hosp: {
    id: "esmeralda_hosp",
    nome: "Hospitalar Esmeralda",
    descricao: "Paleta verde-hospitalar profunda ideal para cooperativas médicas e maternidades.",
    isLightCanvas: false,
    headerBg: "linear-gradient(90deg, #ffffff 0%, #ecfdf5 35%, #a7f3d0 58%, #064e3b 100%)",
    headerText: "#064e3b",
    headerSubtext: "#047857",
    slicerFrameBg: "rgba(6, 59, 46, 0.92)",
    slicerFrameBorder: "rgba(110, 231, 183, 0.38)",
    slicerLabelBg: "#f0fdf4",
    slicerLabelText: "#064e3b",
    canvasBg: "linear-gradient(180deg, #064235 0%, #053228 55%, #03221b 100%)",
    panelBg: "rgba(6, 58, 46, 0.84)",
    panelBorder: "rgba(52, 211, 153, 0.28)",
    panelTitleColor: "#fbbf24",
    kpiCardBg: "#f2fbf7",
    kpiValueColor: "#064235",
    kpiLabelColor: "#0f5132",
    accentColor: "#10b981",
    accentContrast: "#ffffff",
    chartBarColor: "#d97706",
    chartLineFaturado: "#a7f3d0",
    chartLineRecebido: "#38bdf8",
    tableHeaderBg: "#042920",
    tableHeaderText: "#ecfdf5",
    tableTotalBg: "#d6efe4",
    tableTotalText: "#042920",
    dataBarFaturado: "#93c5fd",
    dataBarRecebido: "#86efac",
    dataBarGlosa: "#fda4af",
    dataBarAReceber: "#fde68a",
    footerBg: "rgba(2, 26, 20, 0.96)",
    footerText: "#d1fae5",
  },
  indigo_royal: {
    id: "indigo_royal",
    nome: "Royal Indigo & Ciano",
    descricao: "Visual moderno de sala de comando com azul-índigo escuro e acentos ciano.",
    isLightCanvas: false,
    headerBg: "linear-gradient(90deg, #ffffff 0%, #eef2ff 36%, #c7d2fe 58%, #1e1b4b 100%)",
    headerText: "#1e1b4b",
    headerSubtext: "#4338ca",
    slicerFrameBg: "rgba(30, 27, 75, 0.92)",
    slicerFrameBorder: "rgba(129, 140, 248, 0.42)",
    slicerLabelBg: "#f8fafc",
    slicerLabelText: "#1e1b4b",
    canvasBg: "linear-gradient(180deg, #17183b 0%, #11122e 58%, #0a0b1e 100%)",
    panelBg: "rgba(23, 24, 59, 0.86)",
    panelBorder: "rgba(56, 189, 248, 0.28)",
    panelTitleColor: "#38bdf8",
    kpiCardBg: "#f4f5fb",
    kpiValueColor: "#17183b",
    kpiLabelColor: "#312e81",
    accentColor: "#0ea5e9",
    accentContrast: "#ffffff",
    chartBarColor: "#6366f1",
    chartLineFaturado: "#bae6fd",
    chartLineRecebido: "#6ee7b7",
    tableHeaderBg: "#0d0e26",
    tableHeaderText: "#f1f5f9",
    tableTotalBg: "#dfe2f2",
    tableTotalText: "#11122e",
    dataBarFaturado: "#a5b4fc",
    dataBarRecebido: "#86efac",
    dataBarGlosa: "#fda4af",
    dataBarAReceber: "#fcd34d",
    footerBg: "rgba(8, 9, 24, 0.96)",
    footerText: "#cbd5e1",
  },
  clean_light: {
    id: "clean_light",
    nome: "Executivo Clean (Fundo Claro)",
    descricao: "Tema claro corporativo ideal para projetores claros e relatórios impressos.",
    isLightCanvas: true,
    headerBg: "linear-gradient(90deg, #ffffff 0%, #f8fafc 60%, #e2e8f0 100%)",
    headerText: "#0f172a",
    headerSubtext: "#475569",
    slicerFrameBg: "#ffffff",
    slicerFrameBorder: "#cbd5e1",
    slicerLabelBg: "#0f172a",
    slicerLabelText: "#ffffff",
    canvasBg: "linear-gradient(180deg, #e9eff6 0%, #dfe7f1 100%)",
    panelBg: "#ffffff",
    panelBorder: "#cbd5e1",
    panelTitleColor: "#0284c7",
    kpiCardBg: "#ffffff",
    kpiValueColor: "#0f172a",
    kpiLabelColor: "#475569",
    accentColor: "#0284c7",
    accentContrast: "#ffffff",
    chartBarColor: "#0284c7",
    chartLineFaturado: "#0f172a",
    chartLineRecebido: "#059669",
    tableHeaderBg: "#0f172a",
    tableHeaderText: "#ffffff",
    tableTotalBg: "#e2e8f0",
    tableTotalText: "#0f172a",
    dataBarFaturado: "#bae6fd",
    dataBarRecebido: "#a7f3d0",
    dataBarGlosa: "#fecdd3",
    dataBarAReceber: "#fde68a",
    footerBg: "#0f172a",
    footerText: "#e2e8f0",
  },
};

export const BI_KPI_CATALOG: Array<{
  id: BiKpiId;
  label: string;
  descricao: string;
  formato: "moeda" | "percentual" | "inteiro";
}> = [
  { id: "faturado", label: "Faturado", descricao: "Valor total faturado no recorte", formato: "moeda" },
  { id: "recebido", label: "VL. Recebido", descricao: "Valor efetivamente recebido/pago", formato: "moeda" },
  { id: "a_receber", label: "A Receber", descricao: "Saldo em aberto aguardando recebimento", formato: "moeda" },
  { id: "glosa", label: "Glosa", descricao: "Valor total glosado pelas operadoras", formato: "moeda" },
  { id: "pct_glosa", label: "% Glosa", descricao: "Percentual de glosa conforme regra do cliente", formato: "percentual" },
  { id: "produzido", label: "Produzido", descricao: "Produção hospitalar bruta do período", formato: "moeda" },
  { id: "pct_recebido", label: "% Recebido", descricao: "Taxa de conversão em recebimento sobre o faturado", formato: "percentual" },
  { id: "glosa_recurso", label: "Em Recurso", descricao: "Valor de glosas recursadas/em análise", formato: "moeda" },
  { id: "glosa_recuperada", label: "Glosa Recuperada", descricao: "Valor recuperado após recurso de glosa", formato: "moeda" },
  { id: "qtd_contas", label: "Contas / Guias", descricao: "Volume de contas hospitalares no período", formato: "inteiro" },
];

export function resolveBiThemePalette(config: BiClientConfig): BiThemePalette {
  const baseKey = config.temaPreset === "custom" ? "ela_petroleo" : config.temaPreset;
  const base = BI_THEME_PRESETS[baseKey] || BI_THEME_PRESETS.ela_petroleo;

  const corFundo = config.corFundoCustom?.trim() || null;
  const corPainel = config.corPainelCustom?.trim() || null;
  const corDestaque = config.corDestaqueCustom?.trim() || null;
  const corCard = config.corCardKpiCustom?.trim() || null;
  const corBarra = config.corBarraGraficoCustom?.trim() || null;

  if (config.temaPreset !== "custom" && !corFundo && !corDestaque && !corCard && !corBarra && !corPainel) {
    return base;
  }

  return {
    ...base,
    id: config.temaPreset,
    headerBg: corFundo
      ? `linear-gradient(90deg, #ffffff 0%, #f1f5f9 36%, #dbe7ef 58%, ${corFundo} 100%)`
      : base.headerBg,
    slicerFrameBg: corFundo || base.slicerFrameBg,
    canvasBg: corFundo
      ? `linear-gradient(180deg, ${corFundo} 0%, ${corFundo}ee 65%, #05131d 100%)`
      : base.canvasBg,
    panelBg: corPainel || (corFundo ? `${corFundo}d9` : base.panelBg),
    panelTitleColor: corDestaque || base.panelTitleColor,
    accentColor: corDestaque || base.accentColor,
    kpiCardBg: corCard || base.kpiCardBg,
    kpiValueColor: corFundo || base.kpiValueColor,
    chartBarColor: corBarra || corDestaque || base.chartBarColor,
  };
}

export function normalizeBiClientConfig(raw: unknown): BiClientConfig {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_BI_CLIENT_CONFIG;
  }
  const parsed = biClientConfigSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    ...DEFAULT_BI_CLIENT_CONFIG,
    ...(typeof raw === "object" ? (raw as Partial<BiClientConfig>) : {}),
  };
}

export function calcularPercentualGlosaBi(
  glosa: number,
  faturado: number,
  recebido: number,
  formula: BiFormulaPctGlosa,
): number {
  const g = Number(glosa || 0);
  if (g <= 0) return 0;
  if (formula === "SOBRE_PROCESSADO") {
    const processado = Number(recebido || 0) + g;
    return processado > 0 ? Number(((g / processado) * 100).toFixed(2)) : 0;
  }
  const fat = Number(faturado || 0);
  return fat > 0 ? Number(((g / fat) * 100).toFixed(2)) : 0;
}
