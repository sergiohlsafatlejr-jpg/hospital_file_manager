import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import * as XLSX from "xlsx";

const NOMES_MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatCurrency(value: number): string {
  if (!value || value === 0) return '-';
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcVariacao(atual: number, anterior: number): { valor: number; tipo: 'up' | 'down' | 'neutral' } {
  if (anterior === 0 && atual === 0) return { valor: 0, tipo: 'neutral' };
  if (anterior === 0) return { valor: 100, tipo: 'up' };
  if (atual === 0) return { valor: -100, tipo: 'down' };
  const variacao = ((atual - anterior) / anterior) * 100;
  return { valor: variacao, tipo: variacao >= 0 ? 'up' : 'down' };
}

function VariacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  const { valor, tipo } = calcVariacao(atual, anterior);
  if (tipo === 'neutral') return <span className="text-muted-foreground">-</span>;
  
  const isUp = tipo === 'up';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      isUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? '+' : ''}{valor.toFixed(1)}%
    </span>
  );
}

export default function ComparativoMesAMes() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabId = estabelecimentoAtual?.id;

  const currentYear = new Date().getFullYear();
  const [anoAtual, setAnoAtual] = useState(currentYear);
  const [anoAnterior, setAnoAnterior] = useState(currentYear - 1);
  const [expandedMeses, setExpandedMeses] = useState<Set<number>>(new Set());

  const { data, isLoading } = trpc.comparativoMesAMes.getDados.useQuery(
    { estabelecimentoId: estabId!, anoAtual, anoAnterior },
    { enabled: !!estabId }
  );

  const toggleMes = (mes: number) => {
    setExpandedMeses(prev => {
      const next = new Set(prev);
      if (next.has(mes)) next.delete(mes);
      else next.add(mes);
      return next;
    });
  };

  const expandAll = () => {
    if (data?.meses) {
      setExpandedMeses(new Set(data.meses.map(m => m.mes)));
    }
  };

  const collapseAll = () => {
    setExpandedMeses(new Set());
  };

  // Totais gerais
  const totais = useMemo(() => {
    if (!data?.meses) return { faturadoAtual: 0, faturadoAnterior: 0, contasAtual: 0, contasAnterior: 0 };
    return data.meses.reduce((acc, m) => ({
      faturadoAtual: acc.faturadoAtual + m.faturadoAtual,
      faturadoAnterior: acc.faturadoAnterior + m.faturadoAnterior,
      contasAtual: acc.contasAtual + m.contasAtual,
      contasAnterior: acc.contasAnterior + m.contasAnterior,
    }), { faturadoAtual: 0, faturadoAnterior: 0, contasAtual: 0, contasAnterior: 0 });
  }, [data]);

  const handleExportExcel = () => {
    if (!data?.meses) return;

    const rows: any[] = [];
    
    for (const mes of data.meses) {
      // Linha do mês (total)
      const varMes = calcVariacao(mes.faturadoAtual, mes.faturadoAnterior);
      rows.push({
        'Mês': NOMES_MESES[mes.mes],
        'Convênio': 'TOTAL',
        [`Faturado ${anoAtual}`]: mes.faturadoAtual,
        [`Faturado ${anoAnterior}`]: mes.faturadoAnterior,
        'Variação (%)': varMes.valor.toFixed(1) + '%',
        [`Contas ${anoAtual}`]: mes.contasAtual,
        [`Contas ${anoAnterior}`]: mes.contasAnterior,
      });

      // Linhas dos convênios
      for (const conv of mes.convenios) {
        const varConv = calcVariacao(conv.faturadoAtual, conv.faturadoAnterior);
        rows.push({
          'Mês': NOMES_MESES[mes.mes],
          'Convênio': conv.convenioNome,
          [`Faturado ${anoAtual}`]: conv.faturadoAtual,
          [`Faturado ${anoAnterior}`]: conv.faturadoAnterior,
          'Variação (%)': varConv.valor.toFixed(1) + '%',
          [`Contas ${anoAtual}`]: conv.contasAtual,
          [`Contas ${anoAnterior}`]: conv.contasAnterior,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativo');
    XLSX.writeFile(wb, `comparativo_${anoAtual}_vs_${anoAnterior}_${estabelecimentoSelecionado?.nome || 'hospital'}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Comparativo Mês a Mês
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Clique no mês para ver detalhamento por convênio
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expandir Todos
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Recolher Todos
            </Button>
            <Button onClick={handleExportExcel} disabled={!data?.meses?.length}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Ano Atual:</span>
            <Select value={String(anoAtual)} onValueChange={(v) => setAnoAtual(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">vs Ano Anterior:</span>
            <Select value={String(anoAnterior)} onValueChange={(v) => setAnoAnterior(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Totais Gerais */}
        {data?.meses && data.meses.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-xs text-muted-foreground">Faturado {anoAtual}</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(totais.faturadoAtual)}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-xs text-muted-foreground">Faturado {anoAnterior}</p>
              <p className="text-lg font-bold">{formatCurrency(totais.faturadoAnterior)}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-xs text-muted-foreground">Variação Total</p>
              <p className="text-lg font-bold"><VariacaoBadge atual={totais.faturadoAtual} anterior={totais.faturadoAnterior} /></p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-xs text-muted-foreground">Contas {anoAtual}</p>
              <p className="text-lg font-bold">{totais.contasAtual.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-card p-4 rounded-lg border">
              <p className="text-xs text-muted-foreground">Contas {anoAnterior}</p>
              <p className="text-lg font-bold">{totais.contasAnterior.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="bg-card rounded-lg border overflow-hidden">
          {/* Header da tabela */}
          <div className="grid grid-cols-[1fr_180px_180px_120px_100px_100px] gap-2 px-4 py-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
            <span>Mês</span>
            <span className="text-right">Faturado {anoAtual}</span>
            <span className="text-right">Faturado {anoAnterior}</span>
            <span className="text-center">Variação</span>
            <span className="text-right">Contas {anoAtual}</span>
            <span className="text-right">Contas {anoAnterior}</span>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && (!data?.meses || data.meses.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum dado de faturamento encontrado para o período selecionado.
            </div>
          )}

          {/* Rows */}
          {data?.meses?.map((mes) => {
            const isExpanded = expandedMeses.has(mes.mes);
            return (
              <div key={mes.mes} className="border-b last:border-b-0">
                {/* Linha do mês (totais) */}
                <div
                  className="grid grid-cols-[1fr_180px_180px_120px_100px_100px] gap-2 px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => toggleMes(mes.mes)}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {NOMES_MESES[mes.mes]}
                  </span>
                  <span className="text-right font-bold">{formatCurrency(mes.faturadoAtual)}</span>
                  <span className="text-right text-muted-foreground">{formatCurrency(mes.faturadoAnterior)}</span>
                  <span className="text-center"><VariacaoBadge atual={mes.faturadoAtual} anterior={mes.faturadoAnterior} /></span>
                  <span className="text-right font-medium">{mes.contasAtual || '-'}</span>
                  <span className="text-right text-muted-foreground">{mes.contasAnterior || '-'}</span>
                </div>

                {/* Linhas dos convênios (expandido) */}
                {isExpanded && mes.convenios.map((conv, idx) => (
                  <div
                    key={`${mes.mes}-${conv.convenioId}-${idx}`}
                    className="grid grid-cols-[1fr_180px_180px_120px_100px_100px] gap-2 px-4 py-2 pl-10 border-t border-border/50 bg-muted/10"
                  >
                    <span className="flex items-center">
                      <span className="bg-muted px-2 py-0.5 rounded text-xs font-medium uppercase">
                        {conv.convenioNome}
                      </span>
                    </span>
                    <span className="text-right text-sm">{formatCurrency(conv.faturadoAtual)}</span>
                    <span className="text-right text-sm text-muted-foreground">{formatCurrency(conv.faturadoAnterior)}</span>
                    <span className="text-center"><VariacaoBadge atual={conv.faturadoAtual} anterior={conv.faturadoAnterior} /></span>
                    <span className="text-right text-sm">{conv.contasAtual || '-'}</span>
                    <span className="text-right text-sm text-muted-foreground">{conv.contasAnterior || '-'}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
