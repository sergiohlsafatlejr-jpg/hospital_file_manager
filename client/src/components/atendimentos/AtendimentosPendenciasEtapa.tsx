import { Card, CardContent } from "@/components/ui/card";
import { CircleDollarSign, Layers3 } from "lucide-react";
import { formatCurrency } from "@/lib/atendimentosConstants";

interface PendenciaEtapa {
  etapa: string;
  contas: number;
  valorPendente: number;
}

interface AtendimentosPendenciasEtapaProps {
  items: PendenciaEtapa[];
  filtroAtivo: string;
  onFiltro: (etapa: string) => void;
}

export function AtendimentosPendenciasEtapa({
  items,
  filtroAtivo,
  onFiltro,
}: AtendimentosPendenciasEtapaProps) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="Valores pendentes por etapa da conta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold">Valores pendentes por Etapa da Conta</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Contas sem título · Particulares não incluídos
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => {
          const ativo = filtroAtivo === item.etapa;
          return (
            <Card
              key={item.etapa}
              role="button"
              tabIndex={0}
              aria-pressed={ativo}
              className={`min-w-[220px] cursor-pointer transition-colors hover:border-amber-400/70 ${
                ativo ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/30" : ""
              }`}
              onClick={() => onFiltro(ativo ? "" : item.etapa)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFiltro(ativo ? "" : item.etapa);
                }
              }}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground" title={item.etapa}>
                      {item.etapa}
                    </p>
                    <p className="mt-1 text-base font-bold text-amber-700">
                      {formatCurrency(item.valorPendente)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.contas.toLocaleString("pt-BR")} conta{item.contas === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                    <CircleDollarSign className="h-4 w-4 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
