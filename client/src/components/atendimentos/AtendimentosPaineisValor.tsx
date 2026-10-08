import React, { useState } from "react";
import { CalendarDays, Layers3, ShieldCheck, MapPin, Clock3, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FiltrosState } from "./AtendimentosFiltros";

export type PainelValorRow = { chave: string; quantidade: number; valor: number };
export type PaineisValorData = Record<"mesEntrada" | "etapa" | "convenio" | "setor" | "permanencia", PainelValorRow[]>;
const colors = ["bg-teal-700", "bg-sky-700", "bg-violet-600", "bg-amber-700", "bg-rose-700", "bg-indigo-600", "bg-emerald-700"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const number = new Intl.NumberFormat("pt-BR");
const config = [
  { key: "mesEntrada", title: "Contas por mês de entrada", subtitle: "Data de entrada · não é competência", icon: CalendarDays },
  { key: "etapa", title: "Etapas da conta", subtitle: "Valores por etapa do processo", icon: Layers3 },
  { key: "convenio", title: "Contas por convênio", subtitle: "Valores do recorte selecionado", icon: ShieldCheck },
  { key: "setor", title: "Contas por setor", subtitle: "Setor da etapa ou de entrada", icon: MapPin },
  { key: "permanencia", title: "Permanência da conta", subtitle: "Tempo desde entrega ou etapa", icon: Clock3 },
] as const;

export function AtendimentosPaineisValor({ data, filtros, onFiltro, disabled = false }: {
  data?: PaineisValorData; filtros: FiltrosState;
  onFiltro: (key: keyof FiltrosState, value: string) => void; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <section aria-label="Filtros por valor das contas" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Explore as contas por valor</h2>
        <p className="text-xs text-muted-foreground">Clique em uma barra para filtrar a lista de pacientes. Clique novamente para remover.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {config.map(({ key, title, subtitle, icon: Icon }) => {
          const rows = data?.[key] || [];
          const selected = filtros[key] || "";
          const maximum = Math.max(0, ...rows.map(row => Math.abs(row.valor)));
          const visible = expanded[key] ? rows : rows.slice(0, 6);
          return (
            <Card key={key} className="min-w-0 overflow-hidden rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div>
                <span className="rounded-lg bg-muted p-2 text-muted-foreground"><Icon className="h-4 w-4" /></span>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {selected && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onFiltro(key, "")} className="h-auto w-full justify-start gap-1.5 whitespace-normal px-2 text-left text-xs text-primary"><X className="h-3 w-3 shrink-0" />Remover filtro deste painel</Button>}
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-busy={disabled}>
                  {visible.map((row, index) => {
                    const active = selected === row.chave;
                    const label = key === "mesEntrada" ? row.chave === "__SEM_ENTRADA__" ? "Sem data de entrada" : `${row.chave.slice(5)}/${row.chave.slice(0, 4)}` : row.chave;
                    return (
                      <button key={row.chave} type="button" disabled={disabled} aria-pressed={active}
                        aria-label={`${title}: ${label}, ${money.format(row.valor)}, ${number.format(row.quantidade)} contas${active ? ", filtro ativo" : ""}`}
                        title={`${label} · ${money.format(row.valor)}`}
                        onClick={() => onFiltro(key, active ? "" : row.chave)}
                        className={`w-full rounded-lg border px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 ${active ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/50"}`}>
                        <div className="mb-2 flex items-start justify-between gap-2 text-xs"><span className="min-w-0 break-words font-medium">{label}</span><span className="shrink-0 font-semibold tabular-nums">{money.format(row.valor)}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${maximum ? Math.abs(row.valor) / maximum * 100 : 0}%` }} /></div>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">{number.format(row.quantidade)} contas{row.valor < 0 ? " · saldo negativo" : ""}</p>
                      </button>
                    );
                  })}
                  {!rows.length && <p className="py-8 text-center text-xs text-muted-foreground">{disabled ? "Carregando valores..." : "Sem contas neste recorte."}</p>}
                </div>
                {rows.length > 6 && <Button type="button" variant="ghost" size="sm" className="h-7 w-full gap-1 text-xs" onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}><ChevronDown className={`h-3 w-3 ${expanded[key] ? "rotate-180" : ""}`} />{expanded[key] ? "Mostrar menos" : `Ver todos (${rows.length})`}</Button>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
