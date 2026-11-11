import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  applyDisplayScaleToDocument,
  computeAutoFontSizePx,
  describeMonitorProfile,
  DisplayScaleMode,
  DisplayScalePreference,
  fontSizePxToPercent,
  loadDisplayScalePreference,
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  resolveEffectiveFontSizePx,
  saveDisplayScalePreference,
  SCALE_STEP_PERCENT,
} from "@/lib/displayScale";

interface ViewportMetrics {
  width: number;
  height: number;
}

interface DisplayScaleContextValue {
  mode: DisplayScaleMode;
  manualPercent: number;
  effectiveFontSizePx: number;
  effectivePercent: number;
  autoPercent: number;
  viewport: ViewportMetrics;
  monitorProfile: string;
  setAutoMode: () => void;
  setManualPercent: (percent: number) => void;
  stepScale: (deltaPercent: number) => void;
}

const DisplayScaleContext = createContext<DisplayScaleContextValue | undefined>(undefined);

function readViewport(): ViewportMetrics {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900 };
  }
  return {
    width: window.innerWidth || 1440,
    height: window.innerHeight || 900,
  };
}

export function DisplayScaleProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<DisplayScalePreference>(() =>
    loadDisplayScalePreference()
  );
  const [viewport, setViewport] = useState<ViewportMetrics>(() => readViewport());

  useEffect(() => {
    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setViewport(readViewport());
      });
    };

    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("orientationchange", handleResize, { passive: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const autoFontSizePx = useMemo(
    () => computeAutoFontSizePx(viewport.width, viewport.height),
    [viewport.width, viewport.height]
  );

  const effectiveFontSizePx = useMemo(
    () => resolveEffectiveFontSizePx(preference, viewport.width, viewport.height),
    [preference, viewport.width, viewport.height]
  );

  useEffect(() => {
    applyDisplayScaleToDocument(effectiveFontSizePx);
    saveDisplayScalePreference(preference);
  }, [effectiveFontSizePx, preference]);

  const setAutoMode = useCallback(() => {
    setPreference(prev => ({ ...prev, mode: "auto" }));
  }, []);

  const setManualPercent = useCallback((percent: number) => {
    const clamped = Math.min(
      MAX_SCALE_PERCENT,
      Math.max(MIN_SCALE_PERCENT, Math.round(percent))
    );
    setPreference({ mode: "manual", manualPercent: clamped });
  }, []);

  const stepScale = useCallback(
    (deltaPercent: number = SCALE_STEP_PERCENT) => {
      setPreference(prev => {
        const basePercent =
          prev.mode === "manual"
            ? prev.manualPercent
            : fontSizePxToPercent(computeAutoFontSizePx(viewport.width, viewport.height));
        const snapped = Math.round((basePercent + deltaPercent) / SCALE_STEP_PERCENT) * SCALE_STEP_PERCENT;
        const clamped = Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, snapped));
        return { mode: "manual", manualPercent: clamped };
      });
    },
    [viewport.width, viewport.height]
  );

  const value = useMemo<DisplayScaleContextValue>(
    () => ({
      mode: preference.mode,
      manualPercent: preference.manualPercent,
      effectiveFontSizePx,
      effectivePercent: fontSizePxToPercent(effectiveFontSizePx),
      autoPercent: fontSizePxToPercent(autoFontSizePx),
      viewport,
      monitorProfile: describeMonitorProfile(viewport.width, viewport.height),
      setAutoMode,
      setManualPercent,
      stepScale,
    }),
    [
      preference.mode,
      preference.manualPercent,
      effectiveFontSizePx,
      autoFontSizePx,
      viewport,
      setAutoMode,
      setManualPercent,
      stepScale,
    ]
  );

  return (
    <DisplayScaleContext.Provider value={value}>
      {children}
    </DisplayScaleContext.Provider>
  );
}

export function useDisplayScale(): DisplayScaleContextValue {
  const ctx = useContext(DisplayScaleContext);
  if (!ctx) {
    throw new Error("useDisplayScale must be used within DisplayScaleProvider");
  }
  return ctx;
}
