import { describe, expect, it } from "vitest";
import {
  computeAutoFontSizePx,
  computeResponsiveDefaultSidebarWidth,
  describeMonitorProfile,
  fontSizePxToPercent,
  percentToFontSizePx,
  resolveEffectiveFontSizePx,
  sanitizeDisplayScalePreference,
} from "./displayScale";

describe("displayScale", () => {
  it("mantém 16px (100%) em telas móveis (< 768px)", () => {
    expect(computeAutoFontSizePx(390, 844)).toBe(16);
    expect(fontSizePxToPercent(computeAutoFontSizePx(390, 844))).toBe(100);
  });

  it("ajusta suavemente para notebooks compactos (1366x768) e escala 125% Windows (1536x864)", () => {
    const hdNotebook = computeAutoFontSizePx(1366, 768);
    const fhd125 = computeAutoFontSizePx(1536, 864);

    expect(hdNotebook).toBeCloseTo(15.2, 1);
    expect(fhd125).toBeGreaterThan(hdNotebook);
    expect(fhd125).toBeLessThanOrEqual(16);
  });

  it("amplia proporcionalmente em monitores Full HD (1920x1080), 2K (2560x1440) e 4K (3840x2160)", () => {
    const fullHd = computeAutoFontSizePx(1920, 1080);
    const qhd2k = computeAutoFontSizePx(2560, 1440);
    const uhd4k = computeAutoFontSizePx(3840, 2160);

    expect(fullHd).toBeCloseTo(16.75, 2);
    expect(qhd2k).toBeCloseTo(18.5, 2);
    expect(uhd4k).toBeCloseTo(20.5, 2);
    expect(fullHd).toBeLessThan(qhd2k);
    expect(qhd2k).toBeLessThan(uhd4k);
  });

  it("evita inflar exageradamente em monitores ultrawide baixos (2560x1080)", () => {
    const ultrawide1080 = computeAutoFontSizePx(2560, 1080);
    const qhd1440 = computeAutoFontSizePx(2560, 1440);

    expect(ultrawide1080).toBeLessThan(qhd1440);
    expect(describeMonitorProfile(2560, 1080)).toBe("Monitor Ultrawide");
  });

  it("respeita modo manual com limites seguros (85% a 135%)", () => {
    expect(resolveEffectiveFontSizePx({ mode: "manual", manualPercent: 110 }, 1366, 768)).toBe(
      percentToFontSizePx(110)
    );
    expect(sanitizeDisplayScalePreference({ mode: "manual", manualPercent: 300 })).toEqual({
      mode: "manual",
      manualPercent: 135,
    });
    expect(sanitizeDisplayScalePreference({ mode: "manual", manualPercent: 40 })).toEqual({
      mode: "manual",
      manualPercent: 85,
    });
    expect(sanitizeDisplayScalePreference("invalido")).toEqual({
      mode: "auto",
      manualPercent: 100,
    });
  });

  it("reduz a largura padrão da barra lateral em notebooks menores para liberar espaço às tabelas", () => {
    expect(computeResponsiveDefaultSidebarWidth(1366)).toBe(232);
    expect(computeResponsiveDefaultSidebarWidth(1600)).toBe(256);
    expect(computeResponsiveDefaultSidebarWidth(1920)).toBe(276);
    expect(computeResponsiveDefaultSidebarWidth(2560)).toBe(296);
  });
});
