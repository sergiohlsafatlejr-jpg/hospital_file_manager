/**
 * KPIs de Atendimentos — Cards superiores com contagem por tipo
 */
import { Card, CardContent } from "@/components/ui/card";
import { Users, Building2, Stethoscope, FlaskConical, AlertTriangle, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/atendimentosConstants";

interface KPIsProps {
  total: number;
  internacao: number;
  exame: number;
  ambulatorio: number;
  prontoSocorro: number;
  valorTotal?: number;
  filtroTipoAtivo: string;
  onFiltroTipo: (tipo: string) => void;
}

export function AtendimentosKPIs({
  total, internacao, exame, ambulatorio, prontoSocorro, valorTotal,
  filtroTipoAtivo, onFiltroTipo,
}: KPIsProps) {
  const cards = [
    {
      key: "todos",
      label: "Total",
      value: total,
      icon: Users,
      colorClass: "text-primary",
      bgClass: "bg-primary/10",
      borderClass: "border-primary",
    },
    {
      key: "INTERNACAO",
      label: "Internação",
      value: internacao,
      icon: Building2,
      colorClass: "text-orange-500",
      bgClass: "bg-orange-500/10",
      borderClass: "border-orange-500",
    },
    {
      key: "EXAME",
      label: "Exame",
      value: exame,
      icon: FlaskConical,
      colorClass: "text-purple-500",
      bgClass: "bg-purple-500/10",
      borderClass: "border-purple-500",
    },
    {
      key: "AMBULAT",
      label: "Ambulatório",
      value: ambulatorio,
      icon: Stethoscope,
      colorClass: "text-blue-500",
      bgClass: "bg-blue-500/10",
      borderClass: "border-blue-500",
    },
  ];

  if (prontoSocorro > 0) {
    cards.push({
      key: "PRONTO",
      label: "Pronto Socorro",
      value: prontoSocorro,
      icon: AlertTriangle,
      colorClass: "text-red-500",
      bgClass: "bg-red-500/10",
      borderClass: "border-red-500",
    });
  }

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 ${prontoSocorro > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
        {cards.map(({ key, label, value, icon: Icon, colorClass, bgClass, borderClass }) => (
          <Card
            key={key}
            className={`cursor-pointer hover:border-opacity-70 transition-all duration-200 ${
              filtroTipoAtivo === key ? `${borderClass} ring-1 ring-offset-1` : ""
            }`}
            onClick={() => onFiltroTipo(filtroTipoAtivo === key ? "todos" : key)}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`text-3xl font-bold mt-1 ${key !== "todos" ? colorClass : ""}`}>
                    {value}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${bgClass} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${colorClass}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {valorTotal !== undefined && valorTotal > 0 && (
        <Card className="bg-gradient-to-r from-emerald-500/5 to-emerald-600/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-sm text-muted-foreground">Valor Total em Carteira</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(valorTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
