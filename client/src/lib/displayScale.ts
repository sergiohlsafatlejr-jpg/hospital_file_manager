export type DisplayScaleMode = "auto" | "manual";

export interface DisplayScalePreference {
  mode: DisplayScaleMode;
  /** Escala manual em porcentagem (ex.: 100 = 16px base). */
  manualPercent: number;
}

export const DISPLAY_SCALE_STORAGE_KEY = "safatle-display-scale";
export const BASE_FONT_SIZE_PX = 16;
export const MIN_SCALE_PERCENT = 85;
export const MAX_SCALE_PERCENT = 135;
export const SCALE_STEP_PERCENT = 5;

export const SCALE_PRESETS: Array<{ label: string; percent: number; hint: string }> = [
  { label: "Compacto", percent: 90, hint: "Mais colunas visíveis em telas menores" },
  { label: "Padrão", percent: 100, hint: "Tamanho original (16px)" },
  { label: "Confortável", percent: 108, hint: "Leitura ampliada p/ Full HD" },
  { label: "Grande", percent: 118, hint: "Ideal p/ monitores grandes / 2K" },
  { label: "Extra Grande", percent: 128, hint: "Ideal p/ monitores 4K ou leitura distante" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Calcula automaticamente o font-size raiz (em px) ideal para a resolução
 * atual da janela/monitor em pixels CSS (já levando em conta o DPI do SO).
 *
 * - Mobile (< 768px): 16px (100%) para leitura confortável no toque
 * - Notebooks compactos (1024–1366px): 14.75px–15.2px (~92%–95%) para caber tabelas densas sem espremer
 * - Notebooks Full HD c/ 125% Windows (1536px): ~15.75px (~98%)
 * - Monitores Full HD 1080p (1920px): ~16.75px (~105%) para evitar letras miúdas
 * - Monitores 2K / QHD (2560×1440): ~18.5px (~116%)
 * - Monitores 4K / UHD (3840×2160): ~20.5px (~128%)
 * - Monitores Ultrawide (ex.: 2560×1080): respeita a altura útil para não exagerar na vertical
 */
export function computeAutoFontSizePx(
  viewportWidth: number,
  viewportHeight?: number
): number {
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1440;
  const height =
    viewportHeight !== undefined && Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : Math.round((width * 9) / 16);

  // Telas móveis mantêm 16px nativo
  if (width < 768) {
    return BASE_FONT_SIZE_PX;
  }

  // Em monitores ultrawide (muito largos porém baixos, ex.: 2560x1080),
  // limitamos a largura efetiva proporcionalmente à altura para não inflar demais verticalmente.
  const maxEffectiveByHeight =
    width > 1680 ? Math.max(1680, Math.round(height * (16 / 9) * 1.12)) : width;
  const effectiveWidth = Math.min(width, maxEffectiveByHeight);

  let rawPx: number;

  if (effectiveWidth <= 1024) {
    rawPx = 14.75;
  } else if (effectiveWidth <= 1366) {
    rawPx = lerp(14.75, 15.2, (effectiveWidth - 1024) / (1366 - 1024));
  } else if (effectiveWidth <= 1600) {
    rawPx = lerp(15.2, 16.0, (effectiveWidth - 1366) / (1600 - 1366));
  } else if (effectiveWidth <= 1920) {
    rawPx = lerp(16.0, 16.75, (effectiveWidth - 1600) / (1920 - 1600));
  } else if (effectiveWidth <= 2560) {
    rawPx = lerp(16.75, 18.5, (effectiveWidth - 1920) / (2560 - 1920));
  } else {
    rawPx = lerp(18.5, 20.5, (effectiveWidth - 2560) / (3840 - 2560));
  }

  return Math.round(rawPx * 100) / 100;
}

export function fontSizePxToPercent(px: number): number {
  return Math.round((px / BASE_FONT_SIZE_PX) * 100);
}

export function percentToFontSizePx(percent: number): number {
  const safePercent = clamp(Math.round(percent), MIN_SCALE_PERCENT, MAX_SCALE_PERCENT);
  return Math.round(((safePercent / 100) * BASE_FONT_SIZE_PX) * 100) / 100;
}

export function resolveEffectiveFontSizePx(
  pref: DisplayScalePreference,
  viewportWidth: number,
  viewportHeight?: number
): number {
  if (pref.mode === "manual") {
    return percentToFontSizePx(pref.manualPercent);
  }
  return computeAutoFontSizePx(viewportWidth, viewportHeight);
}

export function describeMonitorProfile(viewportWidth: number, viewportHeight?: number): string {
  if (viewportWidth < 768) return "Dispositivo Móvel";
  if (viewportWidth < 1280) return "Tela Compacta / Tablet";
  if (viewportWidth <= 1440) return "Notebook HD / Compacto";
  if (viewportWidth <= 1680) return "Notebook Full HD (Escala SO)";
  if (viewportWidth > 2200 && viewportHeight && viewportHeight <= 1150) {
    return "Monitor Ultrawide";
  }
  if (viewportWidth <= 2048) return "Monitor Full HD";
  if (viewportWidth <= 3000) return "Monitor QHD / 2K";
  return "Monitor 4K / Ultra HD";
}

export function computeResponsiveDefaultSidebarWidth(viewportWidth: number): number {
  if (viewportWidth < 1400) return 232;
  if (viewportWidth < 1760) return 256;
  if (viewportWidth < 2200) return 276;
  return 296;
}

export function sanitizeDisplayScalePreference(raw: unknown): DisplayScalePreference {
  if (!raw || typeof raw !== "object") {
    return { mode: "auto", manualPercent: 100 };
  }
  const obj = raw as Record<string, unknown>;
  const mode: DisplayScaleMode = obj.mode === "manual" ? "manual" : "auto";
  const parsedPercent =
    typeof obj.manualPercent === "number" && Number.isFinite(obj.manualPercent)
      ? clamp(Math.round(obj.manualPercent), MIN_SCALE_PERCENT, MAX_SCALE_PERCENT)
      : 100;

  return { mode, manualPercent: parsedPercent };
}

export function loadDisplayScalePreference(): DisplayScalePreference {
  if (typeof window === "undefined") {
    return { mode: "auto", manualPercent: 100 };
  }
  try {
    const raw = window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY);
    if (!raw) return { mode: "auto", manualPercent: 100 };
    return sanitizeDisplayScalePreference(JSON.parse(raw));
  } catch {
    return { mode: "auto", manualPercent: 100 };
  }
}

export function saveDisplayScalePreference(pref: DisplayScalePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // Ignorar falhas de quota/modo privado
  }
}

export function applyDisplayScaleToDocument(fontSizePx: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const safePx = clamp(fontSizePx, 13, 22);
  root.style.fontSize = `${safePx}px`;
  root.style.setProperty("--ui-scale", String(Math.round((safePx / BASE_FONT_SIZE_PX) * 1000) / 1000));
}
