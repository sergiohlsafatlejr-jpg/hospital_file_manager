/**
 * KPIs de distribuição por Plano (Convênio) e Serviço/Setor
 * Componente reutilizável com badges clicáveis que funcionam como filtros
 */
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Stethoscope, ChevronDown, ChevronUp, Activity } from "lucide-react";
import { useState } from "react";

interface DistribuicaoItem {
  label: string;
  count: number;
}

interface DistribuicaoProps {
  titulo: string;
  icon: "plano" | "servico" | "etapa";
  items: DistribuicaoItem[];
  filtroAtivo: string;
  onFiltro: (value: string) => void;
  maxVisible?: number;
}

export function AtendimentosDistribuicao({
  titulo, icon, items, filtroAtivo, onFiltro, maxVisible = 10,
}: DistribuicaoProps) {
  const [expandido, setExpandido] = useState(false);

  if (items.length === 0) return null;

  const itemsVisiveis = expandido ? items : items.slice(0, maxVisible);
  const temMais = items.length > maxVisible;

  const IconComp = icon === "plano" ? Shield : icon === "etapa" ? Activity : Stethoscope;
  const colorActive = icon === "plano"
    ? "bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/30"
    : icon === "etapa"
    ? "bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/30"
    : "bg-primary/10 border-primary ring-1 ring-primary/30";
  const colorText = icon === "plano"
    ? "text-emerald-600"
    : icon === "etapa"
    ? "text-amber-600"
    : "text-primary";
  const colorBold = icon === "plano"
    ? "font-bold text-emerald-600"
    : icon === "etapa"
    ? "font-bold text-amber-600"
    : "font-bold text-primary";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconComp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
          </div>
          {temMais && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setExpandido(prev => !prev)}
            >
              {expandido ? (
                <>Recolher <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Ver todos ({items.length}) <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {itemsVisiveis.map(({ label, count }) => (
            <div
              key={label}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all hover:border-opacity-60 ${
                filtroAtivo === label ? colorActive : "bg-muted/50"
              }`}
              onClick={() => onFiltro(filtroAtivo === label ? "" : label)}
            >
              <span className={`truncate mr-2 text-xs ${filtroAtivo === label ? `${colorText} font-medium` : "text-muted-foreground"}`}>
                {label}
              </span>
              <span className={colorBold}>{count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
