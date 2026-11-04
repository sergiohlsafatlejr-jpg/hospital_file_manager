import { Pause, Play, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBiLastUpdated } from "@shared/biAutoRefresh";

export interface BiAutoRefreshBarProps {
  autoRefreshAtivo: boolean;
  onToggleAutoRefresh: () => void;
  onRefresh?: () => void;
  isFetching?: boolean;
  isError?: boolean;
  dataUpdatedAt?: number;
  arquivosEmProcessamento?: number;
  fonteIsoladaLabel?: string;
  showRefreshButton?: boolean;
  className?: string;
}

export function BiAutoRefreshBar({
  autoRefreshAtivo,
  onToggleAutoRefresh,
  onRefresh,
  isFetching = false,
  isError = false,
  dataUpdatedAt,
  arquivosEmProcessamento = 0,
  fonteIsoladaLabel,
  showRefreshButton = false,
  className = "",
}: BiAutoRefreshBarProps) {
  const horarioAtualizacao = formatBiLastUpdated(dataUpdatedAt);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2 text-xs text-slate-600 shadow-sm dark:border-border dark:bg-card/60 dark:text-muted-foreground ${className}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {arquivosEmProcessamento > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {arquivosEmProcessamento} arquivo(s) em processamento — atualiza ao concluir
          </span>
        ) : autoRefreshAtivo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Atualização automática ativa (1 min)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-muted dark:text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Atualização automática pausada
          </span>
        )}

        {fonteIsoladaLabel && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {fonteIsoladaLabel}
          </span>
        )}

        <span className="text-slate-500 dark:text-muted-foreground">
          {isFetching
            ? "Consultando dados atuais…"
            : isError
              ? "Falha na consulta; tente Atualizar."
              : horarioAtualizacao
                ? `Última consulta às ${horarioAtualizacao}`
                : "Aguardando consulta"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleAutoRefresh}
          className="h-7 px-2.5 text-xs font-medium"
          title={
            autoRefreshAtivo
              ? "Pausar verificação automática a cada 1 minuto"
              : "Retomar verificação automática a cada 1 minuto"
          }
        >
          {autoRefreshAtivo ? (
            <>
              <Pause className="mr-1.5 h-3 w-3" />
              Pausar auto
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3 w-3" />
              Retomar auto
            </>
          )}
        </Button>

        {showRefreshButton && onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-7 px-2.5 text-xs font-medium"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        )}
      </div>
    </div>
  );
}
