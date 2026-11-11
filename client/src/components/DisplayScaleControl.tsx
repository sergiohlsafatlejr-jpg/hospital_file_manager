import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDisplayScale } from "@/contexts/DisplayScaleContext";
import {
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  SCALE_PRESETS,
  SCALE_STEP_PERCENT,
} from "@/lib/displayScale";
import { Check, Minus, Monitor, Plus, RotateCcw, Sparkles } from "lucide-react";

export function DisplayScaleControl({ compact = false }: { compact?: boolean }) {
  const {
    mode,
    effectivePercent,
    autoPercent,
    viewport,
    monitorProfile,
    setAutoMode,
    setManualPercent,
    stepScale,
  } = useDisplayScale();

  return (
    <div className="flex items-center rounded-lg border border-border/80 bg-background/80 shadow-xs">
      {!compact && (
        <button
          type="button"
          onClick={() => stepScale(-SCALE_STEP_PERCENT)}
          disabled={effectivePercent <= MIN_SCALE_PERCENT && mode === "manual"}
          title="Diminuir tamanho das telas (-5%)"
          aria-label="Diminuir escala da tela"
          className="flex h-8 w-7 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Ajustar tamanho da tela conforme a resolução do monitor"
            className={`flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
              compact ? "rounded-lg px-2" : "border-x border-border/60"
            }`}
          >
            <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
            {compact ? (
              <span>{mode === "auto" ? "Auto" : `${effectivePercent}%`}</span>
            ) : (
              <span className="whitespace-nowrap">
                {mode === "auto" ? `Auto (${effectivePercent}%)` : `${effectivePercent}%`}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Escala da Tela</span>
              <span className="text-[11px] font-mono text-primary font-semibold">
                {effectivePercent}%
              </span>
            </div>
            <p className="text-[11px] font-normal text-muted-foreground">
              {monitorProfile} ({viewport.width}×{viewport.height})
            </p>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={setAutoMode}
            className="flex items-center justify-between gap-2 cursor-pointer py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">Automático por Monitor</div>
                <div className="text-[11px] text-muted-foreground">
                  Adapta ao mudar de monitor ({autoPercent}% neste)
                </div>
              </div>
            </div>
            {mode === "auto" && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <div className="px-2 py-1.5 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs gap-1"
              disabled={effectivePercent <= MIN_SCALE_PERCENT && mode === "manual"}
              onClick={e => {
                e.preventDefault();
                stepScale(-SCALE_STEP_PERCENT);
              }}
            >
              <Minus className="h-3.5 w-3.5" />
              Menor
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={e => {
                e.preventDefault();
                setAutoMode();
              }}
              title="Voltar ao automático"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Auto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs gap-1"
              disabled={effectivePercent >= MAX_SCALE_PERCENT && mode === "manual"}
              onClick={e => {
                e.preventDefault();
                stepScale(SCALE_STEP_PERCENT);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Maior
            </Button>
          </div>

          <DropdownMenuSeparator />

          {SCALE_PRESETS.map(preset => {
            const isSelected = mode === "manual" && effectivePercent === preset.percent;
            return (
              <DropdownMenuItem
                key={preset.percent}
                onClick={() => setManualPercent(preset.percent)}
                className="flex items-center justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="text-xs font-medium">
                    {preset.label} ({preset.percent}%)
                  </div>
                  <div className="text-[11px] text-muted-foreground">{preset.hint}</div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {!compact && (
        <button
          type="button"
          onClick={() => stepScale(SCALE_STEP_PERCENT)}
          disabled={effectivePercent >= MAX_SCALE_PERCENT && mode === "manual"}
          title="Aumentar tamanho das telas (+5%)"
          aria-label="Aumentar escala da tela"
          className="flex h-8 w-7 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
