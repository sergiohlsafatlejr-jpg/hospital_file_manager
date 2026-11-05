import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Search, Check,
  Wallet, CreditCard, BarChart3, PiggyBank, Trash2, Building2, Users,
  ArrowUpDown, Calendar, FileText, Download, ChevronDown, ChevronRight,
  Banknote, Receipt, CircleDollarSign, Percent, ArrowDownRight, ArrowUpRight,
  Clock, CheckCircle, XCircle, Eye, Landmark, List, Upload, Target, Edit, ToggleLeft,
  RefreshCw, AlertCircle, CheckCircle2, WifiOff, ExternalLink, Loader2, MapPin,
  FileSearch, Copy, Filter, SortAsc, X
} from "lucide-react";
import * as XLSX from "xlsx";
import { CustoReceitaUnidade } from "./financeiro/CustoReceitaUnidade";
import { formatDateBR } from "@/lib/dateUtils";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { SAFATLE_ESTABELECIMENTO_ID } from "@shared/const";
import { parseContasPagarRows, parseDataCivil, parseValorConta, normalizarNome, type ContaPagarImportItem, type ImportIssue } from "@shared/contasPagarImport";
import { formatarDataCivilBR, paraInputDataCivil, hojeCivilBrasil } from "@shared/financeiroCivilDate";

// ==================== HELPERS ====================
function formatCurrency(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useEstabelecimentoFinanceiroId() {
  const { estabelecimentoAtual } = useEstabelecimento();
  return estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : SAFATLE_ESTABELECIMENTO_ID;
}


const MONTHS = [
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" }, { value: "03", label: "Março" },
  { value: "04", label: "Abril" }, { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
  { value: "07", label: "Julho" }, { value: "08", label: "Agosto" }, { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

// ==================== DASHBOARD ====================
function FinDashboard() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const now = new Date();
  const [mes, setMes] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [fluxoDias, setFluxoDias] = useState(30);
  const dashboard = trpc.financeiro.dashboard.resumo.useQuery({ estabelecimentoId: estabelecimentoId || 0, mes }, { enabled: Boolean(estabelecimentoId) });
  const fluxoCaixa = trpc.financeiro.dashboard.fluxoCaixa.useQuery({ estabelecimentoId: estabelecimentoId || 0, dias: fluxoDias }, { enabled: Boolean(estabelecimentoId) });
  const d = dashboard.data;
  const fc = fluxoCaixa.data;

  const [ano, mesNum] = mes.split("-");
  const mesLabel = MONTHS[Number(mesNum) - 1]?.label || mesNum;

  // Comparativo mensal
  const mesAnterior = useMemo(() => {
    const [a, m] = mes.split("-").map(Number);
    const prev = new Date(a, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  }, [mes]);
  const [compTipo, setCompTipo] = useState<"categoria" | "descricao">("categoria");
  const comparativo = trpc.financeiro.dashboard.comparativoMensal.useQuery({ estabelecimentoId: estabelecimentoId || 0, mes1: mesAnterior, mes2: mes, tipo: compTipo }, { enabled: Boolean(estabelecimentoId) });
  const comp = comparativo.data;

  const saldoProjetado = d ? Number(d.receitasPendente) - Number(d.despesasPendente) : 0;

  const formatCompact = (v: number) => {
    if (Math.abs(v) >= 1000000) return `R$ ${(v / 1000000).toFixed(1)} mi`;
    if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1)} mil`;
    return formatCurrency(v);
  };

  const diasRelativo = (dateStr: string) => {
    const data = paraInputDataCivil(dateStr);
    if (!data) return "Data inválida";
    const diff = Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${hojeCivilBrasil()}T12:00:00Z`)) / 86400000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanh\u00e3";
    if (diff < 0) return `${Math.abs(diff)}d atr\u00e1s`;
    return `${diff} dias`;
  };

  // Fluxo de caixa - calcular max para escala do gr\u00e1fico
  const fcMax = fc ? Math.max(...fc.pontos.map(p => Math.max(Math.abs(p.receber), Math.abs(p.pagar), Math.abs(p.saldo))), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Dashboard Financeiro</h2>
          <p className="text-sm text-muted-foreground">Vis\u00e3o geral das suas finan\u00e7as</p>
        </div>
        <div className="flex gap-2">
          <Select value={mesNum} onValueChange={v => setMes(`${ano}-${v}`)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ano} onValueChange={v => setMes(`${v}-${mesNum}`)}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!estabelecimentoId ? <div className="text-center py-12 text-muted-foreground">Selecione um estabelecimento para visualizar o dashboard financeiro.</div> : dashboard.isLoading ? <div className="text-center py-12 text-muted-foreground">Carregando...</div> : d ? (
        <>
          {/* Top KPI Cards - 5 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border-0">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-300">Saldo Bancário</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.saldoBancario)}</p>
                    <p className="text-xs text-slate-400 mt-1">{d.qtdBancos} conta(s) bancária(s)</p>
                  </div>
                  <Landmark className="h-8 w-8 text-blue-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-900/80 to-red-950 text-white border-0">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-red-300">Total a Pagar</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.despesasPendente)}</p>
                    <p className="text-xs text-red-400 mt-1">{d.despesasPendenteCount} pendentes</p>
                  </div>
                  <ArrowDownRight className="h-8 w-8 text-red-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-900/80 to-green-950 text-white border-0">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-300">Total a Receber</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.receitasPendente)}</p>
                    <p className="text-xs text-green-400 mt-1">{d.receitasPendenteCount} pendentes</p>
                  </div>
                  <ArrowUpRight className="h-8 w-8 text-green-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-900/80 to-amber-950 text-white border-0">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-amber-300">Vencidos</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.despesasVencido)}</p>
                    <p className="text-xs text-amber-400 mt-1">{d.despesasVencidoCount} transa\u00e7\u00f5es</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
            <Card className={cn("text-white border-0", saldoProjetado >= 0 ? "bg-gradient-to-br from-emerald-900/80 to-emerald-950" : "bg-gradient-to-br from-red-900/80 to-red-950")}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-300">Saldo Projetado</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(saldoProjetado)}</p>
                    <p className="text-xs text-slate-400 mt-1">Receber - Pagar</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-yellow-400 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerta de vencidos */}
          {Number(d.despesasVencido) > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Pagamentos Vencidos!</p>
                <p className="text-sm text-red-600 dark:text-red-400/80">Voc\u00ea tem <strong>{d.despesasVencidoCount}</strong> pagamento(s) vencido(s) totalizando <strong>{formatCurrency(d.despesasVencido)}</strong></p>
              </div>
            </div>
          )}

          {/* Second row - 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Pagamentos do Dia</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.pagamentoDia)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{d.pagamentoDiaPendente} pendente(s) de {d.pagamentoDiaCount}</p>
                  </div>
                  <Calendar className="h-6 w-6 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Pago</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.totalPagoGeral)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Confirmados</p>
                  </div>
                  <CheckCircle className="h-6 w-6 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(d.totalRecebidoGeral)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Confirmados</p>
                  </div>
                  <CheckCircle className="h-6 w-6 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Custos Fixos</p>
                    <p className="text-2xl font-bold mt-1">-</p>
                    <p className="text-xs text-muted-foreground mt-1">Sem dados por unidade</p>
                  </div>
                  <Clock className="h-6 w-6 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pr\u00f3ximos Vencimentos e Recebimentos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-5 w-5 text-red-500" /> Pr\u00f3ximos Vencimentos
                </CardTitle>
                <p className="text-xs text-muted-foreground">{d.proxVencTotal.count} nos pr\u00f3ximos 7 dias &bull; {formatCurrency(d.proxVencTotal.total)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.proxVencimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum vencimento nos pr\u00f3ximos 7 dias</p>
                ) : d.proxVencimentos.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-medium text-sm">{v.descricao}</p>
                      <p className="text-xs text-muted-foreground">{v.empresaNome} &bull; {formatarDataCivilBR(v.dataVencimento)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600 text-sm">{formatCurrency(v.valor)}</p>
                      <p className="text-xs text-muted-foreground">{diasRelativo(v.dataVencimento)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Banknote className="h-5 w-5 text-green-500" /> Pr\u00f3ximos Recebimentos
                </CardTitle>
                <p className="text-xs text-muted-foreground">{d.proxRecebTotal.count} nos pr\u00f3ximos 7 dias &bull; {formatCurrency(d.proxRecebTotal.total)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.proxRecebimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum recebimento nos pr\u00f3ximos 7 dias</p>
                ) : d.proxRecebimentos.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-medium text-sm">{r.descricao}</p>
                      <p className="text-xs text-muted-foreground">{r.clienteNome} &bull; {formatarDataCivilBR(r.dataVencimento)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600 text-sm">{formatCurrency(r.valor)}</p>
                      <p className="text-xs text-muted-foreground">{diasRelativo(r.dataVencimento)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Fluxo de Caixa Projetado */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-primary" /> Fluxo de Caixa Projetado</CardTitle>
                  <p className="text-xs text-muted-foreground">Pr\u00f3ximos {fluxoDias} dias</p>
                </div>
                <div className="flex items-center gap-1">
                  {[7, 15, 30, 60].map(d => (
                    <Button key={d} size="sm" variant={fluxoDias === d ? "default" : "outline"} className="text-xs h-7 px-2" onClick={() => setFluxoDias(d)}>{d} dias</Button>
                  ))}
                </div>
              </div>
              {fc && (
                <div className="flex gap-6 mt-2 text-sm">
                  <div><span className="text-muted-foreground">A Receber</span> <span className="font-semibold text-green-600 ml-1">{formatCompact(fc.totalReceber)}</span></div>
                  <div><span className="text-muted-foreground">A Pagar</span> <span className="font-semibold text-red-600 ml-1">{formatCompact(fc.totalPagar)}</span></div>
                  <div><span className="text-muted-foreground">Saldo Final</span> <span className={cn("font-semibold ml-1", fc.saldoFinal >= 0 ? "text-green-600" : "text-red-600")}>{formatCompact(fc.saldoFinal)}</span></div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {fluxoCaixa.isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : fc && fc.pontos.length > 0 ? (
                <div className="relative h-48 w-full">
                  {/* Eixo Y labels */}
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-muted-foreground w-16">
                    <span>{formatCompact(fcMax)}</span>
                    <span>R$ 0</span>
                    <span>{formatCompact(-fcMax)}</span>
                  </div>
                  {/* Gr\u00e1fico SVG */}
                  <svg className="ml-16 h-full" style={{ width: "calc(100% - 4rem)" }} viewBox={`0 0 ${fc.pontos.length} 200`} preserveAspectRatio="none">
                    {/* Linha zero */}
                    <line x1="0" y1="100" x2={fc.pontos.length} y2="100" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" />
                    {/* Recebimentos */}
                    <polyline fill="none" stroke="#22c55e" strokeWidth="1.5"
                      points={fc.pontos.map((p, i) => `${i},${100 - (p.receber / fcMax) * 95}`).join(" ")} />
                    {/* Pagamentos */}
                    <polyline fill="none" stroke="#ef4444" strokeWidth="1.5"
                      points={fc.pontos.map((p, i) => `${i},${100 - (p.pagar / fcMax) * 95}`).join(" ")} />
                    {/* Saldo acumulado - \u00e1rea */}
                    <polygon fill="url(#saldoGrad)" opacity="0.3"
                      points={`0,100 ${fc.pontos.map((p, i) => `${i},${100 - (p.saldo / fcMax) * 95}`).join(" ")} ${fc.pontos.length - 1},100`} />
                    <polyline fill="none" stroke="#a3e635" strokeWidth="1"
                      points={fc.pontos.map((p, i) => `${i},${100 - (p.saldo / fcMax) * 95}`).join(" ")} />
                    <defs>
                      <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                  {/* Legenda */}
                  <div className="flex gap-4 mt-2 justify-center text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Recebimentos</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" /> Pagamentos</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-lime-400 inline-block" /> Saldo Acumulado</span>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">Sem dados para o per\u00edodo</p>}
            </CardContent>
          </Card>

          {/* An\u00e1lise Detalhada - Evolu\u00e7\u00e3o + Top 5 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Evolu\u00e7\u00e3o Mensal */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-primary" /> Evolu\u00e7\u00e3o Mensal de Pagamentos</CardTitle>
              </CardHeader>
              <CardContent>
                {d.evolucao && d.evolucao.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative h-40">
                      <svg className="w-full h-full" viewBox={`0 0 ${d.evolucao.length * 60} 160`} preserveAspectRatio="none">
                        {(() => {
                          const maxVal = Math.max(...d.evolucao.map((e: any) => Math.max(e.despesas, e.despesasPago)), 1);
                          return (
                            <>
                              {/* \u00c1rea total */}
                              <polygon fill="#22c55e" opacity="0.15"
                                points={`0,160 ${d.evolucao.map((e: any, i: number) => `${i * 60 + 30},${160 - (e.despesas / maxVal) * 140}`).join(" ")} ${(d.evolucao.length - 1) * 60 + 30},160`} />
                              <polyline fill="none" stroke="#22c55e" strokeWidth="2"
                                points={d.evolucao.map((e: any, i: number) => `${i * 60 + 30},${160 - (e.despesas / maxVal) * 140}`).join(" ")} />
                              {/* \u00c1rea pago */}
                              <polygon fill="#f59e0b" opacity="0.2"
                                points={`0,160 ${d.evolucao.map((e: any, i: number) => `${i * 60 + 30},${160 - (e.despesasPago / maxVal) * 140}`).join(" ")} ${(d.evolucao.length - 1) * 60 + 30},160`} />
                              <polyline fill="none" stroke="#f59e0b" strokeWidth="2"
                                points={d.evolucao.map((e: any, i: number) => `${i * 60 + 30},${160 - (e.despesasPago / maxVal) * 140}`).join(" ")} />
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground px-2">
                      {d.evolucao.map((e: any, i: number) => <span key={i}>{e.mes}</span>)}
                    </div>
                    <div className="flex gap-4 justify-center text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Pago</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> Pendente</span>
                    </div>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
              </CardContent>
            </Card>

            {/* Top 5 Maiores Pagamentos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-amber-500" /> Top 5 Maiores Pagamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.topPagamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento no per\u00edodo</p>
                ) : d.topPagamentos.map((t: any, i: number) => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <span className={cn("text-lg font-bold w-6 text-center", i === 0 ? "text-red-500" : i === 1 ? "text-orange-500" : "text-muted-foreground")}>{i + 1}\u00ba</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{t.descricao}</p>
                      <p className="text-xs text-muted-foreground">{t.empresaNome} &bull; {t.categoriaNome} &bull; {formatarDataCivilBR(t.dataVencimento)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{formatCurrency(t.valor)}</p>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", t.pago === "sim" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
                        {t.pago === "sim" ? "Pago" : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Pagamentos por Categoria */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pagamentos por Categoria</CardTitle>
              <p className="text-xs text-muted-foreground">Clique em uma categoria para ver os lan\u00e7amentos</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0"><tr>
                    <th className="text-left p-3 font-semibold">Categoria</th>
                    <th className="text-right p-3 font-semibold">{d.mesAtualLabel}</th>
                    <th className="text-right p-3 font-semibold">{d.mesAnteriorLabel}</th>
                    <th className="text-right p-3 font-semibold">Varia\u00e7\u00e3o</th>
                    <th className="text-right p-3 font-semibold">Total</th>
                  </tr></thead>
                  <tbody>
                    {d.categorias.map((c: any, i: number) => (
                      <tr key={i} className="border-t border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                        <td className="p-3 font-medium">{c.nome}</td>
                        <td className="p-3 text-right">
                          <div>{formatCurrency(c.mesAtual)}</div>
                          {c.mesAtualPendente > 0 && <div className="text-xs text-red-500">R$ {Number(c.mesAtualPendente).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} pend.</div>}
                        </td>
                        <td className="p-3 text-right">
                          <div>{formatCurrency(c.mesAnterior)}</div>
                          {c.mesAnteriorPendente > 0 && <div className="text-xs text-red-500">R$ {Number(c.mesAnteriorPendente).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} pend.</div>}
                        </td>
                        <td className="p-3 text-right">
                          <span className={cn("text-sm", c.variacao > 0 ? "text-red-500" : c.variacao < 0 ? "text-green-500" : "text-muted-foreground")}>
                            {c.variacao > 0 ? `+${c.variacao}%` : c.variacao < 0 ? `${c.variacao}%` : "\u2014 0%"}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold">{formatCurrency(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Comparativo Mensal */}
          {comp && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Comparativo Mensal</CardTitle>
                  <div className="text-sm text-muted-foreground">{comp.mes1Label} vs {comp.mes2Label}</div>
                </div>
                <div className="flex gap-4 mt-2">
                  <div className="rounded-lg border p-3 flex-1">
                    <p className="text-xs text-muted-foreground">{comp.mes1Label}</p>
                    <p className="text-xl font-bold">{formatCurrency(comp.total1)}</p>
                  </div>
                  <div className="rounded-lg border p-3 flex-1">
                    <p className="text-xs text-muted-foreground">{comp.mes2Label}</p>
                    <p className="text-xl font-bold">{formatCurrency(comp.total2)}</p>
                  </div>
                  <div className="rounded-lg border p-3 flex-1">
                    <p className="text-xs text-muted-foreground">Varia\u00e7\u00e3o</p>
                    <p className={cn("text-xl font-bold", comp.varTotal > 0 ? "text-red-500" : comp.varTotal < 0 ? "text-green-500" : "")}>
                      {comp.varTotal > 0 ? "+" : ""}{comp.varTotal}%
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant={compTipo === "categoria" ? "default" : "outline"} className="text-xs" onClick={() => setCompTipo("categoria")}>Por Categoria</Button>
                  <Button size="sm" variant={compTipo === "descricao" ? "default" : "outline"} className="text-xs" onClick={() => setCompTipo("descricao")}>Por Descri\u00e7\u00e3o</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0"><tr>
                      <th className="text-left p-3 font-semibold">{compTipo === "categoria" ? "Categoria" : "Descri\u00e7\u00e3o"}</th>
                      <th className="text-right p-3 font-semibold">{comp.mes1Label}</th>
                      <th className="text-right p-3 font-semibold">{comp.mes2Label}</th>
                      <th className="text-right p-3 font-semibold">Var.</th>
                    </tr></thead>
                    <tbody>
                      {comp.items.map((item: any, i: number) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="p-3 font-medium">{item.nome}</td>
                          <td className="p-3 text-right">{formatCurrency(item.mes1)}</td>
                          <td className="p-3 text-right">{formatCurrency(item.mes2)}</td>
                          <td className="p-3 text-right">
                            <span className={cn("text-sm", item.variacao > 0 ? "text-red-500" : item.variacao < 0 ? "text-green-500" : "text-muted-foreground")}>
                              {item.variacao > 0 ? `+${item.variacao}%` : item.variacao < 0 ? `${item.variacao}%` : "\u2014 0%"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ==================== CONTAS A PAGAR ====================
function ContasPagar() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importItems, setImportItems] = useState<ContaPagarImportItem[]>([]);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importEmpresaId, setImportEmpresaId] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroCentroCusto, setFiltroCentroCusto] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todo");
  const [dataInicioPers, setDataInicioPers] = useState("");
  const [dataFimPers, setDataFimPers] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [ordenacao, setOrdenacao] = useState<"data" | "az" | "valor">("data");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Calcular datas do período
  const periodoFiltro = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "personalizado" && dataInicioPers && dataFimPers) {
      return { dataInicio: dataInicioPers, dataFim: dataFimPers };
    }
    if (filtroPeriodo === "mes") {
      return { dataInicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "trimestre") {
      const m = hoje.getMonth();
      const qi = m - (m % 3);
      return { dataInicio: new Date(hoje.getFullYear(), qi, 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), qi + 3, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "ano") {
      return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: `${hoje.getFullYear()}-12-31` };
    }
    return {};
  }, [filtroPeriodo, dataInicioPers, dataFimPers]);

  const lista = trpc.financeiro.transacoes.listar.useQuery({
    estabelecimentoId: estabelecimentoId || 0,
    busca: busca || undefined,
    pago: filtroStatus === "todos" ? undefined : filtroStatus as any,
    empresaId: filtroEmpresa !== "todas" ? Number(filtroEmpresa) : undefined,
    categoriaId: filtroCategoria !== "todas" ? Number(filtroCategoria) : undefined,
    centroCustoId: filtroCentroCusto !== "todos" ? Number(filtroCentroCusto) : undefined,
    dataInicio: periodoFiltro.dataInicio,
    dataFim: periodoFiltro.dataFim,
    limit: 500,
  }, { enabled: Boolean(estabelecimentoId) });
  const empresas = trpc.financeiro.empresas.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const bancos = trpc.financeiro.bancos.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const centrosCusto = trpc.financeiro.centrosCusto.listar.useQuery();

  const criar = trpc.financeiro.transacoes.criar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta criada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const importarContas = trpc.financeiro.importador.importarContasPagar.useMutation({
    onSuccess: data => {
      toast.success(`${data.imported} contas importadas em lote.`);
      setImportDialogOpen(false);
      setImportItems([]);
      utils.financeiro.transacoes.invalidate();
    },
    onError: err => toast.error(err.message),
  });
  const marcarPago = trpc.financeiro.transacoes.marcarPago.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Marcado como pago!"); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.financeiro.transacoes.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta atualizada!"); setEditDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.transacoes.excluir.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta excluída!"); },
    onError: (e) => toast.error(e.message),
  });
  const duplicar = trpc.financeiro.transacoes.duplicar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta duplicada!"); },
    onError: (e) => toast.error(e.message),
  });
  const duplicarEmLote = trpc.financeiro.transacoes.duplicarEmLote.useMutation({
    onSuccess: (data) => { utils.financeiro.invalidate(); setSelectedIds(new Set()); toast.success(`${data.count} conta(s) duplicada(s)!`); },
    onError: (e) => toast.error(e.message),
  });
  const excluirEmLote = trpc.financeiro.transacoes.excluirEmLote.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Contas excluídas!"); setSelectedIds(new Set()); },
    onError: (e) => toast.error(e.message),
  });

  const rawItems = lista.data?.items || [];
  const hoje = hojeCivilBrasil();

  // Ordenação
  const items = useMemo(() => {
    const sorted = [...rawItems];
    if (ordenacao === "az") sorted.sort((a: any, b: any) => (a.descricao || "").localeCompare(b.descricao || ""));
    else if (ordenacao === "valor") sorted.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
    // default "data" já vem ordenado do backend
    return sorted;
  }, [rawItems, ordenacao]);

  const totalPendente = items.filter((t: any) => t.pago === "nao").reduce((s: number, t: any) => s + Number(t.valor), 0);
  const totalVencido = items.filter((t: any) => t.pago === "nao" && Boolean(paraInputDataCivil(t.dataVencimento)) && paraInputDataCivil(t.dataVencimento) < hoje).reduce((s: number, t: any) => s + Number(t.valor), 0);
  const totalPago = items.filter((t: any) => t.pago === "sim").reduce((s: number, t: any) => s + Number(t.valor), 0);

  const totalSelecionado = useMemo(() => {
    return items.filter((t: any) => selectedIds.has(t.id)).reduce((s: number, t: any) => s + Number(t.valor), 0);
  }, [items, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((t: any) => t.id)));
  };

  const temFiltrosAtivos = filtroEmpresa !== "todas" || filtroCategoria !== "todas" || filtroCentroCusto !== "todos" || filtroPeriodo !== "todo" || filtroStatus !== "todos";

  const limparFiltros = () => {
    setFiltroEmpresa("todas"); setFiltroCategoria("todas"); setFiltroCentroCusto("todos"); setFiltroPeriodo("todo"); setFiltroStatus("todos"); setBusca(""); setDataInicioPers(""); setDataFimPers("");
  };

  // Importar Excel
  const handleImportExcel = () => {
    if (!estabelecimentoId) { toast.error("Selecione um estabelecimento antes de importar."); return; }
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".xlsx,.xls";
    input.onchange = async (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) { toast.error("Arquivo excede 4 MB."); return; }
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) throw new Error("A planilha não contém aba de dados.");
          const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
          const expected = ["Descrição", "Valor", "Vencimento", "Data Pagamento", "Status", "Categoria", "Centro de Custo", "Observações"];
          if (!expected.every(h => Object.keys(data[0] || {}).includes(h))) throw new Error("Cabeçalhos diferentes do modelo exportado por Contas a Pagar.");
          const parsed = parseContasPagarRows(data, Boolean(wb.Workbook?.WBProps?.date1904));
          setImportItems(parsed.items);
          setImportIssues(parsed.issues);
          setImportEmpresaId("");
          setImportDialogOpen(true);
        } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao ler arquivo"); }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };
  const importEmpresas = (empresas.data || []).filter((e: any) => e.estabelecimentoId === estabelecimentoId);
  const referenciaIssues: ImportIssue[] = [...importIssues];
  for (const item of importItems) {
    for (const [campo, nome, lista] of [
      ["Categoria", item.categoriaNome, categorias.data || []],
      ["Centro de Custo", item.centroCustoNome, centrosCusto.data || []],
    ] as const) {
      if (nome && lista.filter((v: any) => normalizarNome(v.nome) === normalizarNome(nome)).length !== 1) {
        referenciaIssues.push({ linha: item.linha, campo: `${campo} não cadastrado ou ambíguo` });
      }
    }
  }
  const confirmarImportacao = () => {
    if (!estabelecimentoId || !importEmpresaId || referenciaIssues.length || !importItems.length || importarContas.isPending) return;
    importarContas.mutate({ estabelecimentoId, empresaId: Number(importEmpresaId), items: importItems });
  };

  // Exportar Excel
  const handleExportExcel = () => {
    const data = items.map((t: any) => ({
      "Descrição": t.descricao,
      "Valor": Number(t.valor),
      "Vencimento": t.dataVencimento ? formatarDataCivilBR(t.dataVencimento) : "",
      "Data Pagamento": t.dataPagamento ? formatarDataCivilBR(t.dataPagamento) : "",
      "Status": t.pago === "sim" ? "Pago" : "Pendente",
      "Categoria": t.categoriaNome || "",
      "Centro de Custo": t.centroCustoNome || "",
      "Observações": t.observacoes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas_pagar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado!");
  };

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const empresaId = Number(fd.get("empresaId")) || importEmpresas[0]?.id;
    if (!estabelecimentoId || !empresaId || !importEmpresas.some((empresa: any) => empresa.id === empresaId)) {
      toast.error("Selecione uma empresa vinculada ao estabelecimento atual.");
      return;
    }
    criar.mutate({
      estabelecimentoId,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      empresaId,
      categoriaId: fd.get("categoriaId") ? Number(fd.get("categoriaId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      centroCustoId: fd.get("centroCustoId") ? Number(fd.get("centroCustoId")) : undefined,
      dataPagamento: (fd.get("dataPagamento") as string) || undefined,
      pago: ((fd.get("pago") as string) as "sim" | "nao") || (fd.get("dataPagamento") ? "sim" : "nao"),
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const handleEditar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const fd = new FormData(e.currentTarget);
    const empresaId = Number(fd.get("empresaId"));
    if (!estabelecimentoId || !importEmpresas.some((empresa: any) => empresa.id === empresaId)) {
      toast.error("Selecione uma empresa vinculada ao estabelecimento atual.");
      return;
    }
    atualizar.mutate({
      id: editItem.id,
      estabelecimentoId,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      empresaId,
      categoriaId: fd.get("categoriaId") ? Number(fd.get("categoriaId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      centroCustoId: fd.get("centroCustoId") ? Number(fd.get("centroCustoId")) : undefined,
      dataPagamento: (fd.get("dataPagamento") as string) || undefined,
      pago: (fd.get("pago") as string) as any || "nao",
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const abrirEdicao = (item: any) => {
    setEditItem(item);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Contas a Pagar</h2>
          <div className="flex gap-4 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">Pendente: <span className="font-semibold text-amber-600">{formatCurrency(totalPendente)}</span></span>
            {totalVencido > 0 && <span className="text-sm text-red-500 font-medium">Vencido: {formatCurrency(totalVencido)}</span>}
            <span className="text-sm text-muted-foreground">Pago: <span className="font-semibold text-green-600">{formatCurrency(totalPago)}</span></span>
            {selectedIds.size > 0 && <span className="text-sm font-medium text-primary">Selecionado ({selectedIds.size}): <span className="font-bold">{formatCurrency(totalSelecionado)}</span></span>}
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle><DialogDescription>Registre uma nova despesa.</DialogDescription></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" lang="pt-BR" required /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Data de Pagamento</Label><Input name="dataPagamento" type="date" lang="pt-BR" /></div>
                <div><Label>Status</Label><select name="pago" defaultValue="nao" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Pago</option></select></div>
                <div><Label>Centro de Custo</Label><select name="centroCustoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(centrosCusto.data || []).map((cc: any) => <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.nome}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Empresa *</Label><select name="empresaId" required defaultValue={importEmpresas[0]?.id || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione</option>{importEmpresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Categoria</Label><select name="categoriaId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(categorias.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} /></div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={open => { if (!importarContas.isPending) setImportDialogOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conferir importação de Contas a Pagar</DialogTitle><DialogDescription>Nenhum dado é gravado antes da confirmação. O lote é integral: em caso de erro, não importa nenhuma linha.</DialogDescription></DialogHeader>
          <p className="text-sm">Estabelecimento: <strong>{estabelecimentoAtual?.nome || "Não selecionado"}</strong></p>
          <p className="text-sm">{importItems.length} linhas válidas · {importItems.filter(i => i.pago === "sim").length} pagas · {importItems.filter(i => i.pago === "nao").length} pendentes</p>
          <div><Label>Empresa financeira vinculada ao estabelecimento *</Label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={importEmpresaId} onChange={e => setImportEmpresaId(e.target.value)}>
              <option value="">Selecione a empresa</option>
              {importEmpresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            {importEmpresas.length === 0 && <p className="text-sm text-destructive mt-2">Nenhuma empresa financeira vinculada a esta unidade. Ajuste o cadastro antes de importar.</p>}
          </div>
          {referenciaIssues.length > 0 && <div className="text-sm text-destructive" role="alert">
            <p>Importação bloqueada: {referenciaIssues.length} inconsistência(s). Nenhuma linha foi gravada.</p>
            <ul className="list-disc pl-5 max-h-36 overflow-y-auto">{referenciaIssues.slice(0, 30).map((e, n) => <li key={n}>{e.linha ? `Linha ${e.linha}: ` : ""}{e.campo}</li>)}</ul>
            {referenciaIssues.length > 30 && <p>Mais {referenciaIssues.length - 30} inconsistência(s).</p>}
          </div>}
          <p className="text-xs text-muted-foreground">Se houve tentativa anterior, lançamentos coincidentes bloquearão o lote. Concilie os já gravados antes de reenviar.</p>
          <DialogFooter><Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importarContas.isPending}>Cancelar</Button>
            <Button onClick={confirmarImportacao} disabled={importarContas.isPending || !importEmpresaId || !importItems.length || referenciaIssues.length > 0}>{importarContas.isPending ? "Importando..." : "Confirmar lote"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Barra de Filtros */}
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="w-36 h-8 text-xs"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todo">Todo período</SelectItem><SelectItem value="mes">Este mês</SelectItem><SelectItem value="trimestre">Este trimestre</SelectItem><SelectItem value="ano">Este ano</SelectItem><SelectItem value="personalizado">Personalizado</SelectItem></SelectContent>
          </Select>
          {filtroPeriodo === "personalizado" && (
            <div className="flex items-center gap-1">
              <Input type="date" value={dataInicioPers} onChange={e => setDataInicioPers(e.target.value)} className="h-8 text-xs w-32" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={dataFimPers} onChange={e => setDataFimPers(e.target.value)} className="h-8 text-xs w-32" />
            </div>
          )}
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-36 h-8 text-xs"><Building2 className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas da unidade</SelectItem>{importEmpresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-36 h-8 text-xs"><Target className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem>{(categorias.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCentroCusto} onValueChange={setFiltroCentroCusto}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{(centrosCusto.data || []).map((cc: any) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="nao">Pendentes</SelectItem><SelectItem value="sim">Pagos</SelectItem></SelectContent>
          </Select>
          {temFiltrosAtivos && <button onClick={limparFiltros} className="text-xs text-primary hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Limpar filtros</button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleImportExcel}><Upload className="h-3 w-3 mr-1" /> Importar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportExcel}><Download className="h-3 w-3 mr-1" /> Exportar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOrdenacao(ordenacao === "az" ? "data" : "az")}><SortAsc className="h-3 w-3 mr-1" /> Ordenar A-Z</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { utils.financeiro.invalidate(); toast.success("Dados atualizados!"); }}><RefreshCw className="h-3 w-3 mr-1" /> Atualizar custos</Button>
          <div className="ml-auto relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 w-48 text-xs" /></div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {lista.isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : items.length === 0 ? (
            <div className="py-12 text-center"><Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma conta encontrada</p></div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="py-3 pl-3 pr-1 w-8"><Checkbox checked={items.length > 0 && selectedIds.size === items.length} onCheckedChange={toggleSelectAll} /></th>
                <th className="py-3 pl-2 pr-2 text-xs font-semibold text-muted-foreground">Descrição</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground text-right">Valor</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Vencimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Categoria</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Centro de Custo</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Dt. Pagamento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="py-3 pl-2 pr-4 text-xs font-semibold text-muted-foreground text-right">Ações</th>
              </tr></thead>
              <tbody>{items.map((t: any) => {
                const vencido = t.pago === "nao" && Boolean(paraInputDataCivil(t.dataVencimento)) && paraInputDataCivil(t.dataVencimento) < hoje;
                return (
                  <tr key={t.id} className={cn("border-b border-border hover:bg-muted/30 transition-colors", vencido && "bg-red-50/50 dark:bg-red-900/10", selectedIds.has(t.id) && "bg-primary/5")}>
                    <td className="py-3 pl-3 pr-1 w-8"><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></td>
                    <td className="py-3 pl-2 pr-2"><p className="font-medium">{t.descricao}</p>{t.observacoes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{t.observacoes}</p>}</td>
                    <td className="px-2 py-3 text-right font-semibold text-red-600 whitespace-nowrap">{formatCurrency(t.valor)}</td>
                    <td className="px-2 py-3 whitespace-nowrap"><span className={cn(vencido && "text-red-500 font-medium")}>{formatarDataCivilBR(t.dataVencimento)}</span></td>
                    <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.categoriaNome || <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.centroCustoNome || <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3 text-xs whitespace-nowrap">{t.dataPagamento ? <span className="text-green-600 font-medium">{formatarDataCivilBR(t.dataPagamento)}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3">{t.pago === "sim" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-xs font-semibold text-green-600"><CheckCircle className="h-3 w-3" /> Pago</span> : vencido ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-xs font-semibold text-red-500"><AlertTriangle className="h-3 w-3" /> Vencido</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-semibold text-amber-600"><Clock className="h-3 w-3" /> Pendente</span>}</td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => abrirEdicao(t)} title="Editar"><Edit className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-500" onClick={() => { if (estabelecimentoId) duplicar.mutate({ id: t.id, estabelecimentoId }); }} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                        {t.pago === "nao" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (estabelecimentoId) marcarPago.mutate({ id: t.id, estabelecimentoId }); }}><Check className="h-3 w-3 mr-1" /> Pagar</Button>}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (estabelecimentoId && confirm("Excluir?")) excluir.mutate({ id: t.id, estabelecimentoId }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} item(ns) selecionado(s) — Total: <span className="font-bold text-primary">{formatCurrency(totalSelecionado)}</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3 mr-1" /> Limpar</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-violet-600 border-violet-300 hover:bg-violet-50" onClick={() => { if (estabelecimentoId && confirm(`Duplicar ${selectedIds.size} conta(s)?`)) duplicarEmLote.mutate({ ids: Array.from(selectedIds), estabelecimentoId }); }} disabled={duplicarEmLote.isPending}><Copy className="h-3 w-3 mr-1" /> {duplicarEmLote.isPending ? "Duplicando..." : "Duplicar selecionados"}</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50" disabled title="Indisponível: duplicação para próximo mês exige regra de vencimento"><Copy className="h-3 w-3 mr-1" /> Duplicar p/ prox. mês</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (estabelecimentoId && confirm(`Excluir ${selectedIds.size} conta(s)?`)) excluirEmLote.mutate({ ids: Array.from(selectedIds), estabelecimentoId }); }}><Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados</Button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground text-right">{items.length} registro(s) encontrado(s)</div>

      {/* Dialog de Edição - Contas a Pagar */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Conta a Pagar</DialogTitle><DialogDescription>Altere os dados da conta.</DialogDescription></DialogHeader>
          {editItem && (
            <form onSubmit={handleEditar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" defaultValue={editItem.descricao} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" defaultValue={Number(editItem.valor)} required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" lang="pt-BR" defaultValue={editItem.dataVencimento ? paraInputDataCivil(editItem.dataVencimento) : ""} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Pagamento</Label><Input name="dataPagamento" type="date" lang="pt-BR" defaultValue={editItem.dataPagamento ? paraInputDataCivil(editItem.dataPagamento) : ""} /></div>
                <div><Label>Status</Label><select name="pago" defaultValue={editItem.pago || "nao"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Pago</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Centro de Custo</Label><select name="centroCustoId" defaultValue={editItem.centroCustoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(centrosCusto.data || []).map((cc: any) => <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.nome}</option>)}</select></div>
                <div><Label>Categoria</Label><select name="categoriaId" defaultValue={editItem.categoriaId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(categorias.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><select name="empresaId" defaultValue={editItem.empresaId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" defaultValue={editItem.bancoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} defaultValue={editItem.observacoes || ""} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={atualizar.isPending}>{atualizar.isPending ? "Salvando..." : "Salvar Alterações"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== CONTAS A RECEBER ====================
function ContasReceber() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [filtroTipoServico, setFiltroTipoServico] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todo");
  const [dataInicioPers, setDataInicioPers] = useState("");
  const [dataFimPers, setDataFimPers] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [ordenacao, setOrdenacao] = useState<"data" | "az" | "valor">("data");
  const [boletoDialogOpen, setBoletoDialogOpen] = useState(false);
  const [boletoItem, setBoletoItem] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Calcular datas do período
  const periodoFiltro = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "personalizado" && dataInicioPers && dataFimPers) {
      return { dataInicio: dataInicioPers, dataFim: dataFimPers };
    }
    if (filtroPeriodo === "mes") {
      return { dataInicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "trimestre") {
      const m = hoje.getMonth();
      const qi = m - (m % 3);
      return { dataInicio: new Date(hoje.getFullYear(), qi, 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), qi + 3, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "ano") {
      return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: `${hoje.getFullYear()}-12-31` };
    }
    return {};
  }, [filtroPeriodo, dataInicioPers, dataFimPers]);

  const lista = trpc.financeiro.recebiveis.listar.useQuery({
    estabelecimentoId: estabelecimentoId || 0,
    busca: busca || undefined,
    recebido: filtroStatus === "todos" ? undefined : filtroStatus as any,
    empresaId: filtroEmpresa !== "todas" ? Number(filtroEmpresa) : undefined,
    clienteId: filtroCliente !== "todos" ? Number(filtroCliente) : undefined,
    tipoServico: filtroTipoServico !== "todos" ? filtroTipoServico : undefined,
    dataInicio: periodoFiltro.dataInicio,
    dataFim: periodoFiltro.dataFim,
    limit: 500,
  }, { enabled: Boolean(estabelecimentoId) });
  const empresas = trpc.financeiro.empresas.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const clientes = trpc.financeiro.clientes.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const bancos = trpc.financeiro.bancos.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const tiposServicoDistintos = trpc.financeiro.recebiveis.tiposServicoDistintos.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });

  const criar = trpc.financeiro.recebiveis.criar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const marcarRecebido = trpc.financeiro.recebiveis.marcarRecebido.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Marcado como recebido!"); },
  });
  const atualizarRecebivel = trpc.financeiro.recebiveis.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível atualizado!"); setEditDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.recebiveis.excluir.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível excluído!"); },
  });
  const duplicarRecebivel = trpc.financeiro.recebiveis.duplicar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível duplicado!"); },
    onError: (e) => toast.error(e.message),
  });
  const duplicarEmLoteRecebivel = trpc.financeiro.recebiveis.duplicarEmLote.useMutation({
    onSuccess: (data) => { utils.financeiro.invalidate(); setSelectedIds(new Set()); toast.success(`${data.count} recebível(is) duplicado(s)!`); },
    onError: (e) => toast.error(e.message),
  });
  const excluirEmLoteRecebivel = trpc.financeiro.recebiveis.excluirEmLote.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebíveis excluídos!"); setSelectedIds(new Set()); },
  });

  const gerarBoleto = trpc.financeiro.recebiveis.gerarBoleto.useMutation({
    onSuccess: (data) => { utils.financeiro.invalidate(); toast.success(data.message); setBoletoDialogOpen(false); setBoletoItem(null); },
    onError: (e) => { utils.financeiro.invalidate(); toast.error(e.message); },
    retry: false,
  });
  const baixarBoleto = trpc.financeiro.recebiveis.baixarBoleto.useMutation({
    onSuccess: (data: any) => {
      try {
        const byteString = atob(data.pdf);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch (err) {
        toast.error("Erro ao processar PDF");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const enviarEmail = trpc.financeiro.recebiveis.enviarEmailBoleto.useMutation({
    onSuccess: () => { toast.success("E-mail disparado com sucesso!"); utils.financeiro.invalidate(); },
    onError: (e) => toast.error(`Erro ao enviar: ${e.message}`),
  });
  const anexarNF = trpc.financeiro.recebiveis.anexarNotaFiscal.useMutation({
    onSuccess: () => { toast.success("Nota Fiscal anexada com sucesso!"); utils.financeiro.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const enviarEmailNF = trpc.financeiro.recebiveis.enviarEmailNF.useMutation({
    onSuccess: () => { toast.success("E-mail disparado com a Nota Fiscal isolada!"); utils.financeiro.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const selecionarNotaFiscal = (recebivel: any) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024 || (file.type && file.type !== "application/pdf")) {
        toast.error("Selecione um PDF de até 10 MiB.");
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => toast.error("Não foi possível ler o PDF.");
      reader.onload = () => {
        const base64File = String(reader.result).split(",")[1];
        anexarNF.mutate({ recebivelId: recebivel.id, expectedKey: recebivel.notaFiscalKey ?? null, base64File, fileName: file.name });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const rawItems = lista.data?.items || [];

  // Ordenação
  const items = useMemo(() => {
    const sorted = [...rawItems];
    if (ordenacao === "az") sorted.sort((a: any, b: any) => (a.descricao || "").localeCompare(b.descricao || ""));
    else if (ordenacao === "valor") sorted.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
    return sorted;
  }, [rawItems, ordenacao]);

  const totalPendente = items.filter((r: any) => r.recebido === "nao").reduce((s: number, r: any) => s + Number(r.valor), 0);
  const totalRecebido = items.filter((r: any) => r.recebido === "sim").reduce((s: number, r: any) => s + Number(r.valor), 0);

  const totalSelecionado = useMemo(() => {
    return items.filter((r: any) => selectedIds.has(r.id)).reduce((s: number, r: any) => s + Number(r.valor), 0);
  }, [items, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((r: any) => r.id)));
  };

  const temFiltrosAtivos = filtroEmpresa !== "todas" || filtroTipoServico !== "todos" || filtroCliente !== "todos" || filtroPeriodo !== "todo" || filtroStatus !== "todos";

  const limparFiltros = () => {
    setFiltroEmpresa("todas"); setFiltroTipoServico("todos"); setFiltroCliente("todos"); setFiltroPeriodo("todo"); setFiltroStatus("todos"); setBusca(""); setDataInicioPers(""); setDataFimPers("");
  };

  // Tipos de serviço pré-definidos para o select do formulário
  const tiposServicoPadrao = ["Consulta", "Exame", "Cirurgia", "Internação", "Procedimento", "Fisioterapia", "Urgência/Emergência", "Home Care", "Telemedicina", "Outros"];

  // Exportar Excel
  const handleExportExcel = () => {
    const data = items.map((r: any) => ({
      "Descrição": r.descricao,
      "Valor": Number(r.valor),
      "Vencimento": r.dataVencimento ? formatarDataCivilBR(r.dataVencimento) : "",
      "Dt. Recebimento": r.dataRecebimento ? formatarDataCivilBR(r.dataRecebimento) : "",
      "Status": r.recebido === "sim" ? "Recebido" : "Pendente",
      "Tipo de Serviço": r.tipoServico || "",
      "Descrição do Serviço": r.descricaoServico || "",
      "Cliente": r.clienteNome || "",
      "Observações": r.observacoes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Receber");
    XLSX.writeFile(wb, `contas_receber_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado!");
  };

  // Importar Excel
  const handleImportExcel = () => {
    toast.error("A importação rápida de recebíveis foi bloqueada para evitar lançamentos parciais. Use o Importador em lote e selecione a empresa.");
  };

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const empresaId = Number(fd.get("empresaId")) || empresas.data?.[0]?.id;
    const clienteId = fd.get("clienteId") ? Number(fd.get("clienteId")) : undefined;
    if (!estabelecimentoId || !empresaId || !empresas.data?.some((empresa: any) => empresa.id === empresaId) || (clienteId && !clientes.data?.some((cliente: any) => cliente.id === clienteId))) {
      toast.error("Selecione uma empresa válida do estabelecimento atual.");
      return;
    }
    criar.mutate({
      estabelecimentoId,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      dataRecebimento: (fd.get("dataRecebimento") as string) || undefined,
      recebido: ((fd.get("recebido") as string) as "sim" | "nao") || (fd.get("dataRecebimento") ? "sim" : "nao"),
      empresaId,
      clienteId,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      tipoServico: (fd.get("tipoServico") as string) || undefined,
      descricaoServico: (fd.get("descricaoServico") as string) || undefined,
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const handleEditarRecebivel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const fd = new FormData(e.currentTarget);
    const empresaId = Number(fd.get("empresaId")) || empresas.data?.[0]?.id;
    const clienteId = fd.get("clienteId") ? Number(fd.get("clienteId")) : undefined;
    if (!estabelecimentoId || !empresaId || !empresas.data?.some((empresa: any) => empresa.id === empresaId) || (clienteId && !clientes.data?.some((cliente: any) => cliente.id === clienteId))) {
      toast.error("Selecione uma empresa válida do estabelecimento atual.");
      return;
    }
    atualizarRecebivel.mutate({
      id: editItem.id,
      estabelecimentoId,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      dataRecebimento: (fd.get("dataRecebimento") as string) || undefined,
      empresaId,
      clienteId,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      tipoServico: (fd.get("tipoServico") as string) || undefined,
      descricaoServico: (fd.get("descricaoServico") as string) || undefined,
      recebido: (fd.get("recebido") as string) as any || "nao",
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const abrirEdicaoRecebivel = (item: any) => {
    setEditItem(item);
    setEditDialogOpen(true);
  };

  const handleGerarBoleto = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!boletoItem) return;
    const fd = new FormData(e.currentTarget);
    const cpfCnpj = fd.get("cpfCnpj") as string;
    const isPf = cpfCnpj.replace(/\D/g, "").length <= 11;
    const bancoId = fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined;
    gerarBoleto.mutate({
      recebivelId: boletoItem.id,
      bancoId,
      pagador: {
        cpfCnpj,
        tipoPessoa: isPf ? "FISICA" : "JURIDICA",
        nome: fd.get("nome") as string,
        endereco: fd.get("endereco") as string,
        numero: (fd.get("numero") as string) || undefined,
        complemento: (fd.get("complemento") as string) || undefined,
        bairro: fd.get("bairro") as string,
        cidade: fd.get("cidade") as string,
        uf: fd.get("uf") as string,
        cep: fd.get("cep") as string,
        email: (fd.get("email") as string) || undefined,
      }
    });
  };

  if (!estabelecimentoId) {
    return <div className="py-12 text-center text-muted-foreground">Selecione um estabelecimento para gerenciar contas a receber.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Contas a Receber</h2>
          <div className="flex gap-4 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">Pendente: <span className="font-semibold text-blue-600">{formatCurrency(totalPendente)}</span></span>
            <span className="text-sm text-muted-foreground">Recebido: <span className="font-semibold text-green-600">{formatCurrency(totalRecebido)}</span></span>
            {selectedIds.size > 0 && <span className="text-sm font-medium text-primary">Selecionado ({selectedIds.size}): <span className="font-bold">{formatCurrency(totalSelecionado)}</span></span>}
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Recebível</Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Recebível</DialogTitle><DialogDescription>Registre uma nova receita a receber.</DialogDescription></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" lang="pt-BR" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Recebimento</Label><Input name="dataRecebimento" type="date" lang="pt-BR" /></div>
                <div><Label>Status</Label><select name="recebido" defaultValue="nao" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Recebido</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo de Serviço</Label><select name="tipoServico" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{tiposServicoPadrao.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><Label>Cliente</Label><select name="clienteId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(clientes.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div><Label>Descrição do Serviço</Label><Textarea name="descricaoServico" rows={2} placeholder="Descreva detalhes do serviço prestado..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa *</Label><select name="empresaId" required defaultValue={empresas.data?.[0]?.id || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} /></div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="w-36 h-8 text-xs"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todo">Todo período</SelectItem><SelectItem value="mes">Este mês</SelectItem><SelectItem value="trimestre">Este trimestre</SelectItem><SelectItem value="ano">Este ano</SelectItem><SelectItem value="personalizado">Personalizado</SelectItem></SelectContent>
          </Select>
          {filtroPeriodo === "personalizado" && (
            <div className="flex items-center gap-1">
              <Input type="date" value={dataInicioPers} onChange={e => setDataInicioPers(e.target.value)} className="h-8 text-xs w-32" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={dataFimPers} onChange={e => setDataFimPers(e.target.value)} className="h-8 text-xs w-32" />
            </div>
          )}
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-36 h-8 text-xs"><Building2 className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem>{(empresas.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCliente} onValueChange={setFiltroCliente}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{(clientes.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroTipoServico} onValueChange={setFiltroTipoServico}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{(tiposServicoDistintos.data || []).map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="nao">Pendentes</SelectItem><SelectItem value="sim">Recebidos</SelectItem></SelectContent>
          </Select>
          {temFiltrosAtivos && <button onClick={limparFiltros} className="text-xs text-primary hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Limpar filtros</button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleImportExcel}><Upload className="h-3 w-3 mr-1" /> Importar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportExcel}><Download className="h-3 w-3 mr-1" /> Exportar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOrdenacao(ordenacao === "az" ? "data" : "az")}><SortAsc className="h-3 w-3 mr-1" /> Ordenar A-Z</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { utils.financeiro.invalidate(); toast.success("Dados atualizados!"); }}><RefreshCw className="h-3 w-3 mr-1" /> Atualizar</Button>
          <div className="ml-auto relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 w-48 text-xs" /></div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {lista.isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : items.length === 0 ? (
            <div className="py-12 text-center"><Banknote className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum recebível encontrado</p></div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="py-3 pl-3 pr-1 w-8"><Checkbox checked={items.length > 0 && selectedIds.size === items.length} onCheckedChange={toggleSelectAll} /></th>
                <th className="py-3 pl-2 pr-2 text-xs font-semibold text-muted-foreground">Descrição</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground text-right">Valor</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Vencimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Tipo de Serviço</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Desc. Serviço</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Dt. Recebimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="py-3 pl-2 pr-4 text-xs font-semibold text-muted-foreground text-right">Ações</th>
              </tr></thead>
              <tbody>{items.map((r: any) => (
                <tr key={r.id} className={cn("border-b border-border hover:bg-muted/30 transition-colors", selectedIds.has(r.id) && "bg-primary/5")}>
                  <td className="py-3 pl-3 pr-1 w-8"><Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></td>
                  <td className="py-3 pl-2 pr-2"><p className="font-medium">{r.descricao}</p>{r.observacoes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{r.observacoes}</p>}</td>
                  <td className="px-2 py-3 text-right font-semibold text-green-600 whitespace-nowrap">{formatCurrency(r.valor)}</td>
                  <td className="px-2 py-3 whitespace-nowrap">{formatarDataCivilBR(r.dataVencimento)}</td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap">{r.tipoServico ? <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">{r.tipoServico}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground"><p className="truncate max-w-[200px]" title={r.descricaoServico || ""}>{r.descricaoServico || <span className="text-muted-foreground/50">—</span>}</p></td>
                  <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.clienteNome || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap">{r.dataRecebimento ? <span className="text-green-600 font-medium">{formatarDataCivilBR(r.dataRecebimento)}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3">{r.recebido === "sim" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-xs font-semibold text-green-600"><CheckCircle className="h-3 w-3" /> Recebido</span> : <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-semibold text-blue-600"><Clock className="h-3 w-3" /> Pendente</span>}</td>
                  <td className="py-3 pl-2 pr-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => abrirEdicaoRecebivel(r)} title="Editar"><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-500" onClick={() => duplicarRecebivel.mutate({ id: r.id, estabelecimentoId })} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                      {r.recebido === "nao" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcarRecebido.mutate({ id: r.id, estabelecimentoId })}><Check className="h-3 w-3 mr-1" /> Receber</Button>}
                      {r.notaFiscalKey ? (
                         <>
                           <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 mr-1 cursor-pointer" onClick={() => selecionarNotaFiscal(r)} title="Substituir NF com controle de versão" disabled={anexarNF.isPending}>📄 Alterar NF</Button>
                           {!r.boletoSolicitacaoId && r.boletoStatus !== "reconciliation" && (
                             <Button size="sm" variant="outline" className={`h-7 text-xs mr-1 ${r.emailEnviado === 'sim' ? 'text-teal-700 border-teal-300 bg-teal-50 hover:bg-teal-100' : 'text-blue-600 border-blue-300 hover:bg-blue-50'}`} onClick={() => { const clienteRef = r.clienteId ? clientes.data?.find((c: any) => c.id === r.clienteId) : null; const mail = window.prompt("Enviar Nota Fiscal para qual e-mail?", clienteRef?.email || ""); if (mail) enviarEmailNF.mutate({ recebivelId: r.id, email: mail }); }} title={r.emailEnviado === 'sim' ? "E-mail já enviado. Clique para reenviar." : "Enviar NF Isolada para o Cliente"} disabled={enviarEmailNF.isPending}>{r.emailEnviado === 'sim' ? <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"/><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"/></svg>} {r.emailEnviado === 'sim' ? 'Enviado' : 'E-mail NF'}</Button>
                           )}
                         </>
                      ) : (
                         <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:text-orange-600 mr-1" onClick={() => selecionarNotaFiscal(r)} title="Anexar Nota Fiscal PDF" disabled={anexarNF.isPending}>📎 + NF</Button>
                      )}
                      {r.boletoStatus === "reconciliation" ? (
                        <span className="text-xs text-amber-700" role="status">Emissão reservada/incerta — solicitar reconciliação, não reemitir</span>
                      ) : r.boletoSolicitacaoId ? (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 mr-1" onClick={() => baixarBoleto.mutate({ recebivelId: r.id })} title="Baixar Boleto PDF" disabled={baixarBoleto.isPending}><Download className="h-3 w-3 mr-1" /> Boleto</Button>
                          <Button size="sm" variant="outline" className={`h-7 text-xs ${r.emailEnviado === 'sim' ? 'text-teal-700 border-teal-300 bg-teal-50 hover:bg-teal-100' : 'text-blue-600 border-blue-300 hover:bg-blue-50'}`} onClick={() => { const clienteRef = r.clienteId ? clientes.data?.find((c: any) => c.id === r.clienteId) : null; const mail = window.prompt(r.notaFiscalKey ? "Confirme o e-mail do cliente para enviar o Boleto + Nota Fiscal:" : "Confirme o e-mail do cliente para enviar o boleto:", clienteRef?.email || ""); if (mail) enviarEmail.mutate({ recebivelId: r.id, email: mail }); }} title={r.emailEnviado === 'sim' ? "E-mail já enviado. Clique para reenviar." : "Enviar por E-mail"} disabled={enviarEmail.isPending || !r.notaFiscalKey}>{r.emailEnviado === 'sim' ? <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>} {r.emailEnviado === 'sim' ? 'Reenviar boleto + NF' : 'Enviar boleto + NF'}</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setBoletoItem(r); setBoletoDialogOpen(true); }} title="Gerar Boleto Inter" disabled={gerarBoleto.isPending}><Banknote className="h-3 w-3 mr-1" /> Gerar Boleto</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: r.id, estabelecimentoId }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} item(ns) selecionado(s) — Total: <span className="font-bold text-primary">{formatCurrency(totalSelecionado)}</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3 mr-1" /> Limpar</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-violet-600 border-violet-300 hover:bg-violet-50" onClick={() => { if (confirm(`Duplicar ${selectedIds.size} recebível(is)?`)) duplicarEmLoteRecebivel.mutate({ ids: Array.from(selectedIds), estabelecimentoId }); }} disabled={duplicarEmLoteRecebivel.isPending}><Copy className="h-3 w-3 mr-1" /> {duplicarEmLoteRecebivel.isPending ? "Duplicando..." : "Duplicar selecionados"}</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm(`Excluir ${selectedIds.size} recebível(is)?`)) excluirEmLoteRecebivel.mutate({ ids: Array.from(selectedIds), estabelecimentoId }); }}><Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados</Button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground text-right">{items.length} registro(s) encontrado(s)</div>

      {/* Dialog de Edição - Contas a Receber */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Recebível</DialogTitle><DialogDescription>Altere os dados do recebível.</DialogDescription></DialogHeader>
          {editItem && (
            <form onSubmit={handleEditarRecebivel} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" defaultValue={editItem.descricao} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" defaultValue={Number(editItem.valor)} required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" lang="pt-BR" defaultValue={editItem.dataVencimento ? paraInputDataCivil(editItem.dataVencimento) : ""} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Recebimento</Label><Input name="dataRecebimento" type="date" lang="pt-BR" defaultValue={editItem.dataRecebimento ? paraInputDataCivil(editItem.dataRecebimento) : ""} /></div>
                <div><Label>Status</Label><select name="recebido" defaultValue={editItem.recebido || "nao"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Recebido</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo de Serviço</Label><select name="tipoServico" defaultValue={editItem.tipoServico || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{tiposServicoPadrao.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><Label>Cliente</Label><select name="clienteId" defaultValue={editItem.clienteId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(clientes.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div><Label>Descrição do Serviço</Label><Textarea name="descricaoServico" rows={2} defaultValue={editItem.descricaoServico || ""} placeholder="Descreva detalhes do serviço prestado..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa *</Label><select name="empresaId" required defaultValue={editItem.empresaId || empresas.data?.[0]?.id || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" defaultValue={editItem.bancoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} defaultValue={editItem.observacoes || ""} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={atualizarRecebivel.isPending}>{atualizarRecebivel.isPending ? "Salvando..." : "Salvar Alterações"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Emitir Boleto Banco Inter */}
      <Dialog open={boletoDialogOpen} onOpenChange={(open) => { setBoletoDialogOpen(open); if (!open) setBoletoItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Boleto Banco Inter</DialogTitle>
            <DialogDescription>
              Preencha os dados do pagador para emitir o boleto no valor de {boletoItem?.valor ? formatCurrency(boletoItem.valor) : ""}. Esta etapa confirma apenas a emissão. Após a confirmação, confira/anexe a NF e use o botão Enviar boleto + NF. Nenhum e-mail será enviado automaticamente.
            </DialogDescription>
          </DialogHeader>
          {boletoItem && (() => {
            const clienteAtrelado = boletoItem?.clienteId ? clientes.data?.find((c: any) => c.id === boletoItem.clienteId) : null;
            const defaultBancoEmissorId = boletoItem?.bancoId || (bancos.data || []).find((b: any) => String(b.nome || "").toLowerCase().includes("inter"))?.id || bancos.data?.[0]?.id || "";
            return (
              <form onSubmit={handleGerarBoleto} className="space-y-3">
                <div>
                  <Label>Conta Bancária Emissora (Banco Inter) *</Label>
                  <select name="bancoId" required defaultValue={defaultBancoEmissorId} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                    <option value="">Selecione o banco...</option>
                    {(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nome / Razão Social *</Label><Input name="nome" defaultValue={boletoItem?.clienteNome || clienteAtrelado?.nome || ""} required /></div>
                  <div><Label>CPF / CNPJ *</Label><Input name="cpfCnpj" defaultValue={clienteAtrelado?.cnpj || ""} required /></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3"><Label>Endereço / Rua *</Label><Input name="endereco" defaultValue={clienteAtrelado?.endereco || ""} required /></div>
                  <div><Label>Nº *</Label><Input name="numero" defaultValue={clienteAtrelado?.numero || ""} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Complemento</Label><Input name="complemento" defaultValue={clienteAtrelado?.complemento || ""} /></div>
                  <div><Label>Bairro *</Label><Input name="bairro" defaultValue={clienteAtrelado?.bairro || ""} required /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>CEP *</Label><Input name="cep" defaultValue={clienteAtrelado?.cep || ""} required /></div>
                  <div><Label>Cidade *</Label><Input name="cidade" defaultValue={clienteAtrelado?.cidade || ""} required /></div>
                  <div><Label>UF *</Label><Input name="uf" defaultValue={clienteAtrelado?.uf || ""} required maxLength={2} /></div>
                </div>
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={clienteAtrelado?.email || ""} placeholder="Contato do pagador (não envia automaticamente)" /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setBoletoDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={gerarBoleto.isPending}>{gerarBoleto.isPending ? "Emitindo..." : "Emitir Boleto"}</Button>
                </DialogFooter>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== BANCOS ====================
function BancosView() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editBanco, setEditBanco] = useState<any>(null);
  const utils = trpc.useUtils();
  const bancos = trpc.financeiro.bancos.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const criar = trpc.financeiro.bancos.criar.useMutation({
    onSuccess: () => { utils.financeiro.bancos.invalidate(); utils.financeiro.dashboard.invalidate(); toast.success("Conta bancária cadastrada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.financeiro.bancos.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.bancos.invalidate(); utils.financeiro.dashboard.invalidate(); toast.success("Conta bancária atualizada!"); setEditBanco(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.bancos.excluir.useMutation({
    onSuccess: () => { utils.financeiro.bancos.invalidate(); utils.financeiro.dashboard.invalidate(); toast.success("Conta bancária excluída!"); },
    onError: (e) => toast.error(e.message),
  });

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoId) { toast.error("Selecione um estabelecimento antes de cadastrar um banco."); return; }
    const fd = new FormData(e.currentTarget);
    criar.mutate({ estabelecimentoId, nome: fd.get("nome") as string, cor: (fd.get("cor") as string) || "#3b82f6", saldoInicial: (fd.get("saldoInicial") as string) || "0" });
  };

  const handleEditar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoId || !editBanco) return;
    const fd = new FormData(e.currentTarget);
    atualizar.mutate({ id: editBanco.id, estabelecimentoId, nome: fd.get("nome") as string, cor: (fd.get("cor") as string) || "#3b82f6", saldoInicial: (fd.get("saldoInicial") as string) || "0" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Contas Bancárias</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Banco</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Conta Bancária</DialogTitle></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Nome *</Label><Input name="nome" required placeholder="Ex: Banco do Brasil" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cor</Label><Input name="cor" type="color" defaultValue="#3b82f6" /></div>
                <div><Label>Saldo Inicial</Label><Input name="saldoInicial" type="number" step="0.01" defaultValue="0" /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!estabelecimentoId ? <div className="col-span-3 text-center py-8 text-muted-foreground">Selecione um estabelecimento para visualizar contas bancárias.</div> : bancos.isLoading ? <div className="col-span-3 text-center py-8 text-muted-foreground">Carregando...</div> : (bancos.data || []).length === 0 ? (
          <div className="col-span-3 text-center py-12"><Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada</p></div>
        ) : (bancos.data || []).map((b: any) => (
          <Card key={b.id} className="border-l-4" style={{ borderLeftColor: b.cor || "#3b82f6" }}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><Landmark className="h-4 w-4" style={{ color: b.cor || "#3b82f6" }} /><span className="font-semibold">{b.nome}</span></div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => setEditBanco(b)} title="Editar"><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (estabelecimentoId && confirm("Excluir?")) excluir.mutate({ id: b.id, estabelecimentoId }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="text-lg font-bold">{formatCurrency(b.saldoInicial)}</p>
              <p className="text-xs text-muted-foreground">Saldo inicial</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={Boolean(editBanco)} onOpenChange={(open) => { if (!open) setEditBanco(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Conta Bancária</DialogTitle></DialogHeader>
          {editBanco && (
            <form onSubmit={handleEditar} className="space-y-3">
              <div><Label>Nome *</Label><Input name="nome" required defaultValue={editBanco.nome || ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cor</Label><Input name="cor" type="color" defaultValue={editBanco.cor || "#3b82f6"} /></div>
                <div><Label>Saldo Inicial</Label><Input name="saldoInicial" type="number" step="0.01" defaultValue={Number(editBanco.saldoInicial || 0)} /></div>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditBanco(null)}>Cancelar</Button><Button type="submit" disabled={atualizar.isPending}>{atualizar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== CENTROS DE CUSTO ====================
function CentrosCusto() {
  const utils = trpc.useUtils();
  const centros = trpc.financeiro.centrosCusto.listar.useQuery();
  const resumo = trpc.financeiro.centrosCusto.resumo.useQuery();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const criar = trpc.financeiro.centrosCusto.criar.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo criado!"); setDialog(false); },
  });
  const atualizar = trpc.financeiro.centrosCusto.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo atualizado!"); setEditItem(null); },
  });
  const excluir = trpc.financeiro.centrosCusto.excluir.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo excluído!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      codigo: fd.get("codigo") as string,
      nome: fd.get("nome") as string,
      descricao: (fd.get("descricao") as string) || undefined,
      responsavel: (fd.get("responsavel") as string) || undefined,
      orcamentoMensal: (fd.get("orcamentoMensal") as string) || undefined,
    };
    if (editItem) {
      atualizar.mutate({ id: editItem.id, ...data, ativo: editItem.ativo });
    } else {
      criar.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Target className="h-5 w-5" /> Centros de Custo</h2>
        <Button onClick={() => { setEditItem(null); setDialog(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Centro de Custo</Button>
      </div>

      {/* Resumo por Centro de Custo */}
      {(resumo.data || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(resumo.data || []).map((r: any, i: number) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-mono">{r.ccCodigo}</span>
                  {r.ccNome || "Sem centro"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Geral</span>
                  <span className="font-semibold">{formatCurrency(r.totalGeral)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Pago</span>
                  <span className="text-green-600 font-medium">{formatCurrency(r.totalPago)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Pendente</span>
                  <span className="text-amber-600 font-medium">{formatCurrency(r.totalPendente)}</span>
                </div>
                {r.ccOrcamento && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Orçamento</span>
                      <span>{formatCurrency(r.ccOrcamento)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={cn("h-2 rounded-full", Number(r.totalGeral) > Number(r.ccOrcamento) ? "bg-red-500" : "bg-green-500")}
                        style={{ width: `${Math.min(100, (Number(r.totalGeral) / Number(r.ccOrcamento)) * 100)}%` }}
                      />
                    </div>
                    <p className={cn("text-xs mt-1", Number(r.totalGeral) > Number(r.ccOrcamento) ? "text-red-500" : "text-green-600")}>
                      {((Number(r.totalGeral) / Number(r.ccOrcamento)) * 100).toFixed(1)}% utilizado
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lista de Centros de Custo */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Código</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Responsável</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Orçamento Mensal</th>
                <th className="text-center p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(centros.data || []).map((cc: any) => (
                <tr key={cc.id} className="border-b hover:bg-muted/20">
                  <td className="p-3 font-mono text-sm">{cc.codigo}</td>
                  <td className="p-3 text-sm font-medium">{cc.nome}</td>
                  <td className="p-3 text-sm text-muted-foreground">{cc.responsavel || "-"}</td>
                  <td className="p-3 text-sm text-right">{cc.orcamentoMensal ? formatCurrency(cc.orcamentoMensal) : "-"}</td>
                  <td className="p-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", cc.ativo === "sim" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {cc.ativo === "sim" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditItem(cc); setDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        atualizar.mutate({ id: cc.id, codigo: cc.codigo, nome: cc.nome, ativo: cc.ativo === "sim" ? "nao" : "sim" });
                      }}><ToggleLeft className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => excluir.mutate({ id: cc.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(centros.data || []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum centro de custo cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Editar" : "Novo"} Centro de Custo</DialogTitle><DialogDescription>Preencha os dados do centro de custo</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Código *</Label><Input name="codigo" defaultValue={editItem?.codigo || ""} required /></div>
              <div><Label>Nome *</Label><Input name="nome" defaultValue={editItem?.nome || ""} required /></div>
            </div>
            <div><Label>Descrição</Label><Textarea name="descricao" defaultValue={editItem?.descricao || ""} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Responsável</Label><Input name="responsavel" defaultValue={editItem?.responsavel || ""} /></div>
              <div><Label>Orçamento Mensal (R$)</Label><Input name="orcamentoMensal" type="number" step="0.01" defaultValue={editItem?.orcamentoMensal || ""} /></div>
            </div>
            <DialogFooter><Button type="submit">{editItem ? "Salvar" : "Criar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== IMPORTADOR EXCEL ====================
function ImportadorExcel() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const utils = trpc.useUtils();
  const empresas = trpc.financeiro.empresas.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const centrosCusto = trpc.financeiro.centrosCusto.listar.useQuery();
  const bancos = trpc.financeiro.bancos.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const clientes = trpc.financeiro.clientes.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });

  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [preview, setPreview] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number; total: number } | null>(null);
  const [defaultEmpresaId, setDefaultEmpresaId] = useState<string>("");
  const [defaultCategoriaId, setDefaultCategoriaId] = useState<string>("");
  const [defaultCentroCustoId, setDefaultCentroCustoId] = useState<string>("");
  const [defaultBancoId, setDefaultBancoId] = useState<string>("");
  const [defaultClienteId, setDefaultClienteId] = useState<string>("");

  const importarReceber = trpc.financeiro.importador.importarContasReceber.useMutation({
    onSuccess: (data) => { setResult(data); utils.financeiro.recebiveis.invalidate(); toast.success(`${data.imported} contas importadas!`); },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        if (data.length === 0) { toast.error("Planilha vazia"); return; }
        const hdrs = Object.keys(data[0]);
        setHeaders(hdrs);
        setPreview(data.slice(0, 10));
        // Auto-mapping
        const autoMap: Record<string, string> = {};
        hdrs.forEach(h => {
          const hl = h.toLowerCase().trim();
          if (hl.includes("descri")) autoMap["descricao"] = h;
          else if (hl.includes("valor")) autoMap["valor"] = h;
          else if (hl.includes("vencimento")) autoMap["dataVencimento"] = h;
          else if (hl.includes("pagamento") || hl.includes("recebimento")) autoMap[tipo === "pagar" ? "dataPagamento" : "dataRecebimento"] = h;
          else if (hl.includes("observa") || hl.includes("obs")) autoMap["observacoes"] = h;
          else if (hl.includes("status") || hl.includes("pago") || hl.includes("recebido")) autoMap[tipo === "pagar" ? "pago" : "recebido"] = h;
        });
        setMapping(autoMap);
        toast.success(`${data.length} linhas encontradas`);
      } catch { toast.error("Erro ao ler arquivo"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const input = document.createElement("input");
    input.type = "file";
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    handleFile({ target: input } as any);
  };

  const parseStatus = (val: any): "sim" | "nao" => {
    const s = String(val).toLowerCase().trim();
    return ["sim", "s", "pago", "recebido", "yes", "1", "true"].includes(s) ? "sim" : "nao";
  };

  const handleImport = () => {
    if (tipo === "pagar") {
      toast.error("Para Contas a Pagar, utilize Importar Excel na aba Contas a Pagar; lá é obrigatório conferir estabelecimento e empresa.");
      return;
    }
    toast.error("Importação multi-cliente em preparação; não gravar via tela.");
  };

  const requiredFields = tipo === "pagar"
    ? ["descricao", "valor", "dataVencimento", "dataPagamento", "pago", "observacoes"]
    : ["descricao", "valor", "dataVencimento", "dataRecebimento", "recebido", "observacoes"];
  const fieldLabels: Record<string, string> = {
    descricao: "Descrição *", valor: "Valor *", dataVencimento: "Data Vencimento *",
    dataPagamento: "Data Pagamento", dataRecebimento: "Data Recebimento",
    pago: "Status (Pago/Não)", recebido: "Status (Recebido/Não)", observacoes: "Observações",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Excel</h2>
        <div className="flex gap-2">
          <Button variant={tipo === "pagar" ? "default" : "outline"} size="sm" onClick={() => setTipo("pagar")}>
            <Receipt className="h-4 w-4 mr-1" /> Contas a Pagar
          </Button>
          <Button variant={tipo === "receber" ? "default" : "outline"} size="sm" onClick={() => setTipo("receber")}>
            <Banknote className="h-4 w-4 mr-1" /> Contas a Receber
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <Card>
        <CardContent className="p-8">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.querySelector<HTMLInputElement>("input[type=file]")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">{fileName || "Arraste o arquivo Excel aqui"}</p>
            <p className="text-sm text-muted-foreground mt-1">Ou clique para selecionar (.xlsx, .xls, .csv)</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          {/* Mapeamento de Colunas */}
          <Card>
            <CardHeader><CardTitle className="text-base">Mapeamento de Colunas</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {requiredFields.map(field => (
                  <div key={field}>
                    <Label className="text-xs">{fieldLabels[field]}</Label>
                    <Select value={mapping[field] || ""} onValueChange={v => setMapping(prev => ({ ...prev, [field]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar coluna" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">-- Não mapear --</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Valores Padrão */}
          <Card>
            <CardHeader><CardTitle className="text-base">Valores Padrão (aplicados a todas as linhas)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <Select value={defaultEmpresaId} onValueChange={setDefaultEmpresaId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">-- Nenhuma --</SelectItem>
                      {(empresas.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {tipo === "pagar" ? (
                  <>
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <Select value={defaultCategoriaId} onValueChange={setDefaultCategoriaId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Nenhuma --</SelectItem>
                          {(categorias.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Centro de Custo</Label>
                      <Select value={defaultCentroCustoId} onValueChange={setDefaultCentroCustoId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Nenhum --</SelectItem>
                          {(centrosCusto.data || []).map((cc: any) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.codigo} - {cc.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div>
                    <Label className="text-xs">Cliente</Label>
                    <Select value={defaultClienteId} onValueChange={setDefaultClienteId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">-- Nenhum --</SelectItem>
                        {(clientes.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Banco</Label>
                  <Select value={defaultBancoId} onValueChange={setDefaultBancoId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">-- Nenhum --</SelectItem>
                      {(bancos.data || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pré-visualização (primeiras 10 linhas)</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {headers.map(h => <th key={h} className="p-2 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b">
                      {headers.map(h => <td key={h} className="p-2 max-w-[200px] truncate">{String(row[h] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Botão Importar */}
          <div className="flex items-center gap-4">
            <Button onClick={handleImport} disabled={true} size="lg">
              {importing ? "Importando..." : `Importar ${tipo === "pagar" ? "Contas a Pagar" : "Contas a Receber"}`}
            </Button>
            {tipo === "pagar" && <p className="text-sm text-muted-foreground">Para importar contas a pagar, use o botão Importar Excel na aba Contas a Pagar; o fluxo antigo foi bloqueado para evitar dados parciais.</p>}
            {tipo === "receber" && <p className="text-sm text-muted-foreground">Importação multi-cliente em preparação; não gravar via tela.</p>}
            {result && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" /> {result.imported} importadas</span>
                {result.errors > 0 && <span className="text-red-500 font-medium flex items-center gap-1"><XCircle className="h-4 w-4" /> {result.errors} erros</span>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== CADASTROS ====================
function Cadastros() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const utils = trpc.useUtils();
  const empresas = trpc.financeiro.empresas.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const clientes = trpc.financeiro.clientes.listar.useQuery({ estabelecimentoId: estabelecimentoId || 0 }, { enabled: Boolean(estabelecimentoId) });

  const [empDialog, setEmpDialog] = useState(false);
  const [empEdicao, setEmpEdicao] = useState<any>(null);
  const [catDialog, setCatDialog] = useState(false);
  const [cliDialog, setCliDialog] = useState(false);
  const [editCliente, setEditCliente] = useState<any>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const criarEmpresa = trpc.financeiro.empresas.criar.useMutation({ onSuccess: () => { utils.financeiro.empresas.invalidate(); toast.success("Empresa criada!"); setEmpDialog(false); }, onError: (e) => toast.error(e.message) });
  const criarCategoria = trpc.financeiro.categorias.criar.useMutation({ onSuccess: () => { utils.financeiro.categorias.invalidate(); toast.success("Categoria criada!"); setCatDialog(false); }, onError: (e) => toast.error(e.message) });
  const criarCliente = trpc.financeiro.clientes.criar.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente criado!"); setCliDialog(false); setEditCliente(null); }, onError: (e) => toast.error(e.message) });
  const atualizarCliente = trpc.financeiro.clientes.atualizar.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente atualizado!"); setCliDialog(false); setEditCliente(null); }, onError: (e) => toast.error(e.message) });
  const excluirEmpresa = trpc.financeiro.empresas.excluir.useMutation({ onSuccess: () => { utils.financeiro.empresas.invalidate(); toast.success("Empresa excluída!"); }, onError: (e) => toast.error(e.message) });
  const excluirCategoria = trpc.financeiro.categorias.excluir.useMutation({ onSuccess: () => { utils.financeiro.categorias.invalidate(); toast.success("Categoria excluída!"); }, onError: (e) => toast.error(e.message) });
  const excluirCliente = trpc.financeiro.clientes.excluir.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente excluído!"); }, onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Cadastros</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Empresas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Empresas</CardTitle>
              <Dialog open={empDialog} onOpenChange={setEmpDialog}><Button size="sm" variant="outline" onClick={() => setEmpDialog(true)}><Plus className="h-3.5 w-3.5" /></Button>
                <DialogContent><DialogHeader><DialogTitle>Nova Empresa</DialogTitle></DialogHeader><form onSubmit={e => { e.preventDefault(); if (!estabelecimentoId) { toast.error("Selecione um estabelecimento antes de cadastrar uma empresa."); return; } const fd = new FormData(e.currentTarget); criarEmpresa.mutate({ estabelecimentoId, nome: fd.get("nome") as string, cnpj: (fd.get("cnpj") as string) || undefined }); }} className="space-y-3"><div><Label>Nome *</Label><Input name="nome" required /></div><div><Label>CNPJ</Label><Input name="cnpj" /></div><DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-auto">
              {(empresas.data || []).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2 border-b border-border hover:bg-muted/30">
                  <div><p className="text-sm font-medium">{e.nome}</p>{e.cnpj && <p className="text-xs text-muted-foreground">{e.cnpj}</p>}</div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => { if (estabelecimentoId) excluirEmpresa.mutate({ id: e.id, estabelecimentoId }); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {(empresas.data || []).length === 0 && <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma empresa</p>}
            </div>
          </CardContent>
        </Card>

        {/* Categorias */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><List className="h-4 w-4" /> Categorias</CardTitle>
              <Dialog open={catDialog} onOpenChange={setCatDialog}><Button size="sm" variant="outline" onClick={() => setCatDialog(true)}><Plus className="h-3.5 w-3.5" /></Button>
                <DialogContent><DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader><form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); criarCategoria.mutate({ nome: fd.get("nome") as string }); }} className="space-y-3"><div><Label>Nome *</Label><Input name="nome" required /></div><DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-auto">
              {(categorias.data || []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2 border-b border-border hover:bg-muted/30">
                  <p className="text-sm font-medium">{c.nome}</p>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => excluirCategoria.mutate({ id: c.id })}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {(categorias.data || []).length === 0 && <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma categoria</p>}
            </div>
          </CardContent>
        </Card>

        {/* Clientes */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Clientes</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setEditCliente(null); setCliDialog(true); }}><Plus className="h-3.5 w-3.5 mr-1" /> Novo Cliente</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium">Nome</th>
                    <th className="py-2 px-3 font-medium">CNPJ/CPF</th>
                    <th className="py-2 px-3 font-medium">Email</th>
                    <th className="py-2 px-3 font-medium">Telefone</th>
                    <th className="py-2 px-3 font-medium">Cidade/UF</th>
                    <th className="py-2 px-3 font-medium">CNPJ Safatle</th>
                    <th className="py-2 px-3 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(clientes.data || []).map((c: any) => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{c.nome}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cnpj || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.email || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.telefone || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cidade ? `${c.cidade}/${c.uf}` : "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cnpjSafatle || "24.785.393/0001-54"}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditCliente(c); setCliDialog(true); }}><Edit className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => { if (estabelecimentoId) excluirCliente.mutate({ id: c.id, estabelecimentoId }); }}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(clientes.data || []).length === 0 && (
                    <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum cliente cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Dialog Novo/Editar Cliente */}
        <Dialog open={cliDialog} onOpenChange={(open) => { setCliDialog(open); if (!open) setEditCliente(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
            <form onSubmit={e => {
              e.preventDefault();
              if (!estabelecimentoId) { toast.error("Selecione um estabelecimento antes de salvar o cliente."); return; }
              const fd = new FormData(e.currentTarget);
              const empresaId = Number(fd.get("empresaId"));
              if (!empresas.data?.some((empresa: any) => empresa.id === empresaId)) { toast.error("Selecione uma empresa do estabelecimento atual."); return; }
              const payload = {
                estabelecimentoId,
                empresaId,
                nome: fd.get("nome") as string,
                cnpj: (fd.get("cnpj") as string) || undefined,
                email: (fd.get("email") as string) || undefined,
                telefone: (fd.get("telefone") as string) || undefined,
                valorContrato: (fd.get("valorContrato") as string) || undefined,
                cep: (fd.get("cep") as string) || undefined,
                endereco: (fd.get("endereco") as string) || undefined,
                numero: (fd.get("numero") as string) || undefined,
                complemento: (fd.get("complemento") as string) || undefined,
                bairro: (fd.get("bairro") as string) || undefined,
                cidade: (fd.get("cidade") as string) || undefined,
                uf: (fd.get("uf") as string) || undefined,
                cnpjSafatle: (fd.get("cnpjSafatle") as string) || "24.785.393/0001-54",
              };
              if (editCliente) {
                atualizarCliente.mutate({ id: editCliente.id, ...payload });
              } else {
                criarCliente.mutate(payload);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Nome *</Label><Input name="nome" required defaultValue={editCliente?.nome || ""} /></div>
                <div className="col-span-2"><Label>Empresa *</Label><select name="empresaId" required defaultValue={editCliente?.empresaId || empresas.data?.[0]?.id || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{(empresas.data || []).map((empresa: any) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}</select></div>
                <div><Label>CNPJ/CPF</Label><Input name="cnpj" defaultValue={editCliente?.cnpj || ""} placeholder="00.000.000/0000-00" /></div>
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={editCliente?.email || ""} /></div>
                <div><Label>Telefone</Label><Input name="telefone" defaultValue={editCliente?.telefone || ""} placeholder="(00) 00000-0000" /></div>
                <div><Label>Valor Contrato (R$)</Label><Input name="valorContrato" defaultValue={editCliente?.valorContrato || ""} placeholder="0,00" /></div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>CEP</Label>
                    <div className="flex gap-2">
                      <Input name="cep" id="cep-input" defaultValue={editCliente?.cep || ""} placeholder="00000-000"
                        onBlur={async (ev) => {
                          const cep = ev.target.value.replace(/\D/g, "");
                          if (cep.length !== 8) return;
                          setCepLoading(true);
                          try {
                            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                            const data = await res.json();
                            if (!data.erro) {
                              const form = ev.target.closest("form")!;
                              const setVal = (name: string, val: string) => { const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement; if (el && val) el.value = val; };
                              setVal("endereco", data.logradouro);
                              setVal("bairro", data.bairro);
                              setVal("cidade", data.localidade);
                              setVal("uf", data.uf);
                              setVal("complemento", data.complemento);
                              toast.success("Endereço encontrado!");
                            } else {
                              toast.error("CEP não encontrado");
                            }
                          } catch { toast.error("Erro ao buscar CEP"); }
                          setCepLoading(false);
                        }}
                      />
                      {cepLoading && <div className="flex items-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
                    </div>
                  </div>
                  <div className="col-span-2"><Label>Endereço</Label><Input name="endereco" defaultValue={editCliente?.endereco || ""} placeholder="Rua, Avenida..." /></div>
                  <div><Label>Número</Label><Input name="numero" defaultValue={editCliente?.numero || ""} placeholder="123" /></div>
                  <div><Label>Complemento</Label><Input name="complemento" defaultValue={editCliente?.complemento || ""} placeholder="Sala, Andar..." /></div>
                  <div><Label>Bairro</Label><Input name="bairro" defaultValue={editCliente?.bairro || ""} /></div>
                  <div><Label>Cidade</Label><Input name="cidade" defaultValue={editCliente?.cidade || ""} /></div>
                  <div><Label>UF</Label><Input name="uf" defaultValue={editCliente?.uf || ""} maxLength={2} placeholder="GO" /></div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold mb-3">Vínculo Safatle</h4>
                <div><Label>CNPJ Safatle</Label><Input name="cnpjSafatle" defaultValue={editCliente?.cnpjSafatle || "24.785.393/0001-54"} /></div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCliDialog(false); setEditCliente(null); }}>Cancelar</Button>
                <Button type="submit">{editCliente ? "Atualizar" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ==================== BANCO INTER ====================
function BancoInterView() {
  const { user } = useAuth();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const utils = trpc.useUtils();

  const bancos = trpc.financeiro.bancos.listar.useQuery(
    { estabelecimentoId: estabelecimentoId || 0 },
    { enabled: Boolean(estabelecimentoId) }
  );
  const clientes = trpc.financeiro.clientes.listar.useQuery(
    { estabelecimentoId: estabelecimentoId || 0 },
    { enabled: Boolean(estabelecimentoId) }
  );

  const [bancoId, setBancoId] = useState<number | null>(null);
  const effectiveBancoId = useMemo(() => {
    if (bancoId && (bancos.data || []).some((b: any) => b.id === bancoId)) return bancoId;
    const interBank = (bancos.data || []).find((b: any) => String(b.nome || "").toLowerCase().includes("inter"));
    return interBank?.id || bancos.data?.[0]?.id || null;
  }, [bancoId, bancos.data]);

  const [configOpen, setConfigOpen] = useState(false);
  const [novoBancoOpen, setNovoBancoOpen] = useState(false);
  const [emitirOpen, setEmitirOpen] = useState(false);
  const [certPemText, setCertPemText] = useState("");
  const [keyPemText, setKeyPemText] = useState("");
  const [certFileName, setCertFileName] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [subTab, setSubTab] = useState<"boletos" | "extrato">("boletos");

  const hoje = hojeCivilBrasil();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const [dataInicioExtrato, setDataInicioExtrato] = useState(inicioMes);
  const [dataFimExtrato, setDataFimExtrato] = useState(hoje);
  const [dataInicioBoletos, setDataInicioBoletos] = useState(inicioMes);
  const [dataFimBoletos, setDataFimBoletos] = useState(hoje);
  const [situacaoBoleto, setSituacaoBoleto] = useState("TODOS");

  const status = trpc.financeiro.bancoInter.status.useQuery(
    { estabelecimentoId: estabelecimentoId || 0, bancoId: effectiveBancoId || 0 },
    { enabled: Boolean(estabelecimentoId && effectiveBancoId && user?.role === "admin") }
  );

  const isConfigured = Boolean(status.data?.configured);

  const saldo = trpc.financeiro.bancoInter.saldo.useQuery(
    { estabelecimentoId: estabelecimentoId || 0, bancoId: effectiveBancoId || 0 },
    { enabled: Boolean(estabelecimentoId && effectiveBancoId && isConfigured && user?.role === "admin") }
  );

  const extrato = trpc.financeiro.bancoInter.extrato.useQuery(
    { estabelecimentoId: estabelecimentoId || 0, bancoId: effectiveBancoId || 0, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato },
    { enabled: Boolean(estabelecimentoId && effectiveBancoId && isConfigured && user?.role === "admin" && subTab === "extrato") }
  );

  const boletos = trpc.financeiro.bancoInter.listarBoletos.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
      bancoId: effectiveBancoId || 0,
      dataInicial: dataInicioBoletos,
      dataFinal: dataFimBoletos,
      situacao: situacaoBoleto === "TODOS" ? undefined : situacaoBoleto,
    },
    { enabled: Boolean(estabelecimentoId && effectiveBancoId && isConfigured && user?.role === "admin" && subTab === "boletos") }
  );

  const sumario = trpc.financeiro.bancoInter.sumarioBoletos.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
      bancoId: effectiveBancoId || 0,
      dataInicial: dataInicioBoletos,
      dataFinal: dataFimBoletos,
    },
    { enabled: Boolean(estabelecimentoId && effectiveBancoId && isConfigured && user?.role === "admin" && subTab === "boletos") }
  );

  const criarBanco = trpc.financeiro.bancos.criar.useMutation({
    onSuccess: (res) => {
      utils.financeiro.bancos.invalidate();
      setBancoId(res.id);
      setNovoBancoOpen(false);
      toast.success("Conta bancária criada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const configurarInter = trpc.financeiro.bancos.configurarInter.useMutation({
    onSuccess: () => {
      utils.financeiro.bancoInter.invalidate();
      setConfigOpen(false);
      toast.success("Credenciais e certificado do Banco Inter salvos com criptografia AES-256-GCM!");
    },
    onError: (e) => toast.error(e.message),
  });

  const emitirBoletoAvulso = trpc.financeiro.bancoInter.emitirBoleto.useMutation({
    onSuccess: (res: any) => {
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      utils.financeiro.bancoInter.invalidate();
      setEmitirOpen(false);
      toast.success(`Boleto emitido com sucesso! Código: ${res?.codigoSolicitacao || ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadPdf = trpc.financeiro.bancoInter.downloadBoletoPdf.useMutation({
    onSuccess: (data: any) => {
      if (data?.error || !data?.pdf) {
        toast.error(data?.error || "PDF indisponível para este boleto.");
        return;
      }
      try {
        const byteString = atob(data.pdf);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: "application/pdf" });
        window.open(URL.createObjectURL(blob), "_blank");
      } catch {
        toast.error("Erro ao abrir PDF do boleto.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelarBoletoMut = trpc.financeiro.bancoInter.cancelarBoleto.useMutation({
    onSuccess: (res: any) => {
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      utils.financeiro.bancoInter.invalidate();
      toast.success("Boleto cancelado com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  const exportarExtratoPdf = trpc.financeiro.bancoInter.extratoPdf.useMutation({
    onSuccess: (data: any) => {
      if (data?.error || !data?.pdf) {
        toast.error(data?.error || "Não foi possível exportar o PDF do extrato.");
        return;
      }
      try {
        const byteString = atob(data.pdf);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: "application/pdf" });
        window.open(URL.createObjectURL(blob), "_blank");
      } catch {
        toast.error("Erro ao abrir PDF do extrato.");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = (file: File | undefined, target: "cert" | "key") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || "").trim();
      if (target === "cert") {
        setCertPemText(content);
        setCertFileName(file.name);
      } else {
        setKeyPemText(content);
        setKeyFileName(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleSalvarConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoId || !effectiveBancoId) {
      toast.error("Selecione uma conta bancária primeiro.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const clientId = String(fd.get("clientId") || "").trim();
    const clientSecret = String(fd.get("clientSecret") || "").trim();
    const contaCorrente = String(fd.get("contaCorrente") || "").trim();
    const baseUrl = String(fd.get("baseUrl") || "https://cdpj.partners.bancointer.com.br") as
      | "https://cdpj.partners.bancointer.com.br"
      | "https://cdpj-sandbox.partners.bancointer.com.br";
    const certPem = certPemText.trim() || String(fd.get("certPem") || "").trim();
    const keyPem = keyPemText.trim() || String(fd.get("keyPem") || "").trim();

    if (!clientId || !clientSecret || !certPem || !keyPem) {
      toast.error("Preencha Client ID, Client Secret, Certificado (.crt) e Chave Privada (.key).");
      return;
    }
    configurarInter.mutate({
      estabelecimentoId,
      bancoId: effectiveBancoId,
      clientId,
      clientSecret,
      certPem,
      keyPem,
      contaCorrente: contaCorrente || undefined,
      baseUrl,
    });
  };

  const handleEmitirBoletoAvulso = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoId || !effectiveBancoId) return;
    const fd = new FormData(e.currentTarget);
    const cpfCnpj = String(fd.get("cpfCnpj") || "").replace(/\D/g, "");
    const cep = String(fd.get("cep") || "").replace(/\D/g, "");
    emitirBoletoAvulso.mutate({
      estabelecimentoId,
      bancoId: effectiveBancoId,
      seuNumero: String(fd.get("seuNumero") || `BOL-${Date.now()}`).slice(0, 15),
      valorNominal: Number(fd.get("valorNominal") || 0),
      dataVencimento: String(fd.get("dataVencimento") || ""),
      numDiasAgenda: Number(fd.get("numDiasAgenda") || 30),
      pagador: {
        cpfCnpj,
        tipoPessoa: cpfCnpj.length <= 11 ? "FISICA" : "JURIDICA",
        nome: String(fd.get("nome") || ""),
        endereco: String(fd.get("endereco") || ""),
        numero: String(fd.get("numero") || "") || undefined,
        complemento: String(fd.get("complemento") || "") || undefined,
        bairro: String(fd.get("bairro") || ""),
        cidade: String(fd.get("cidade") || ""),
        uf: String(fd.get("uf") || "").toUpperCase(),
        cep,
        email: String(fd.get("email") || "") || undefined,
      },
      formasRecebimento: ["BOLETO", "PIX"],
    });
  };

  if (user?.role !== "admin") {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <h2 className="font-semibold">Acesso administrativo necessário</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A configuração de certificados mTLS e as operações diretas da API do Banco Inter são exclusivas para administradores.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const listaBoletos: any[] = (boletos.data as any)?.cobrancas || (boletos.data as any)?.content || [];
  const listaTransacoesExtrato: any[] = (extrato.data as any)?.transacoes || [];

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Seletor de Conta */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5 text-orange-500" /> Integração API Banco Inter (mTLS + OAuth2 + Cobrança PIX/Boleto)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Credenciais e certificados são armazenados com criptografia autenticada AES-256-GCM vinculada à conta bancária.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setNovoBancoOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nova Conta Bancária
              </Button>
              <Button size="sm" onClick={() => setConfigOpen(true)} disabled={!effectiveBancoId} className="bg-orange-600 hover:bg-orange-700 text-white">
                <Landmark className="h-4 w-4 mr-1" /> {isConfigured ? "Atualizar Credenciais API" : "Configurar API Banco Inter"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Conta Bancária Vinculada</Label>
              <Select value={effectiveBancoId ? String(effectiveBancoId) : ""} onValueChange={(v) => setBancoId(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta bancária" />
                </SelectTrigger>
                <SelectContent>
                  {(bancos.data || []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveBancoId && (
              <div className={cn("rounded-lg border p-3 flex items-center justify-between", isConfigured ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5")}>
                <div className="flex items-center gap-2.5">
                  {status.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : isConfigured ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {isConfigured ? "API Banco Inter Configurada e Ativa" : "Credenciais ainda não configuradas para esta conta"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isConfigured
                        ? `Client ID: ${(status.data as any)?.clientIdPreview || "Configurado"} • Certificado mTLS e Chave Privada ativos`
                        : "Clique em 'Configurar API Banco Inter' para informar Client ID, Secret, .crt e .key"}
                    </p>
                  </div>
                </div>
                {isConfigured && (
                  <Button variant="ghost" size="sm" onClick={() => { utils.financeiro.bancoInter.invalidate(); toast.success("Status atualizado!"); }}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Painel Operacional quando Configurado */}
      {isConfigured && effectiveBancoId && (
        <>
          {/* Cards de Saldo em Tempo Real */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo Disponível (API Inter)</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      {saldo.isLoading ? "Consultando..." : (saldo.data as any)?.disponivel !== undefined ? formatCurrency((saldo.data as any).disponivel) : "—"}
                    </p>
                    {(saldo.data as any)?.error && <p className="text-xs text-red-500 mt-1">{(saldo.data as any).error}</p>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => saldo.refetch()} disabled={saldo.isFetching} title="Atualizar Saldo">
                    <RefreshCw className={cn("h-4 w-4", saldo.isFetching && "animate-spin")} />
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Bloqueado por Cheque</p>
                <p className="text-xl font-bold mt-1">{formatCurrency((saldo.data as any)?.bloqueadoCheque || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Bloqueado Judicial / Adm.</p>
                <p className="text-xl font-bold mt-1">
                  {formatCurrency(Number((saldo.data as any)?.bloqueadoJudicialmente || 0) + Number((saldo.data as any)?.bloqueadoAdministrativo || 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Limite da Conta</p>
                <p className="text-xl font-bold mt-1">{formatCurrency((saldo.data as any)?.limite || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sub-abas: Cobrança (Boletos/PIX) e Extrato */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <Button variant={subTab === "boletos" ? "default" : "outline"} size="sm" onClick={() => setSubTab("boletos")}>
                <Banknote className="h-4 w-4 mr-1" /> Cobrança / Boletos com PIX
              </Button>
              <Button variant={subTab === "extrato" ? "default" : "outline"} size="sm" onClick={() => setSubTab("extrato")}>
                <FileText className="h-4 w-4 mr-1" /> Extrato Bancário
              </Button>
            </div>
            {subTab === "boletos" && (
              <Button size="sm" onClick={() => setEmitirOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4 mr-1" /> Emitir Boleto Avulso (PIX + Código de Barras)
              </Button>
            )}
          </div>

          {subTab === "boletos" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base">Boletos Emitidos no Banco Inter</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input type="date" value={dataInicioBoletos} onChange={(e) => setDataInicioBoletos(e.target.value)} className="h-8 text-xs w-36" />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="date" value={dataFimBoletos} onChange={(e) => setDataFimBoletos(e.target.value)} className="h-8 text-xs w-36" />
                    <Select value={situacaoBoleto} onValueChange={setSituacaoBoleto}>
                      <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODOS">Todas situações</SelectItem>
                        <SelectItem value="A_RECEBER">A Receber</SelectItem>
                        <SelectItem value="RECEBIDO">Recebido / Pago</SelectItem>
                        <SelectItem value="VENCIDO">Vencido</SelectItem>
                        <SelectItem value="CANCELADO">Cancelado</SelectItem>
                        <SelectItem value="EXPIRADO">Expirado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { boletos.refetch(); sumario.refetch(); }}>
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-1", boletos.isFetching && "animate-spin")} /> Consultar
                    </Button>
                  </div>
                </div>
                {sumario.data && !(sumario.data as any)?.error && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <div className="rounded-md border p-2.5">
                      <p className="text-xs text-muted-foreground">Recebidos</p>
                      <p className="text-sm font-bold text-green-600">{formatCurrency((sumario.data as any)?.recebidos?.valor || 0)} ({(sumario.data as any)?.recebidos?.quantidade || 0})</p>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <p className="text-xs text-muted-foreground">Em Aberto</p>
                      <p className="text-sm font-bold text-blue-600">{formatCurrency((sumario.data as any)?.abertos?.valor || 0)} ({(sumario.data as any)?.abertos?.quantidade || 0})</p>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <p className="text-xs text-muted-foreground">Vencidos</p>
                      <p className="text-sm font-bold text-amber-600">{formatCurrency((sumario.data as any)?.vencidos?.valor || 0)} ({(sumario.data as any)?.vencidos?.quantidade || 0})</p>
                    </div>
                    <div className="rounded-md border p-2.5">
                      <p className="text-xs text-muted-foreground">Cancelados</p>
                      <p className="text-sm font-bold text-muted-foreground">{formatCurrency((sumario.data as any)?.cancelados?.valor || 0)} ({(sumario.data as any)?.cancelados?.quantidade || 0})</p>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {(boletos.data as any)?.error ? (
                  <div className="p-6 text-center text-sm text-red-500">{(boletos.data as any).error}</div>
                ) : boletos.isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Consultando boletos no Banco Inter...</div>
                ) : listaBoletos.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Nenhum boleto encontrado no período selecionado.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-y">
                        <tr>
                          <th className="text-left p-3 text-xs font-semibold">Pagador</th>
                          <th className="text-left p-3 text-xs font-semibold">Seu Número / Solicitação</th>
                          <th className="text-left p-3 text-xs font-semibold">Vencimento</th>
                          <th className="text-right p-3 text-xs font-semibold">Valor</th>
                          <th className="text-center p-3 text-xs font-semibold">Situação</th>
                          <th className="text-right p-3 text-xs font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaBoletos.map((item: any, idx: number) => {
                          const cob = item.cobranca || item;
                          const bol = item.boleto || item;
                          const pix = item.pix || {};
                          const codSolicitacao = cob.codigoSolicitacao || item.codigoSolicitacao;
                          const situacao = cob.situacao || item.situacao || "—";
                          return (
                            <tr key={codSolicitacao || idx} className="border-b hover:bg-muted/20">
                              <td className="p-3">
                                <p className="font-medium">{cob.pagador?.nome || "—"}</p>
                                <p className="text-xs text-muted-foreground">{cob.pagador?.cpfCnpj || ""}</p>
                              </td>
                              <td className="p-3 font-mono text-xs">
                                <div>{cob.seuNumero || "—"}</div>
                                <div className="text-[11px] text-muted-foreground">{codSolicitacao}</div>
                              </td>
                              <td className="p-3 whitespace-nowrap">{cob.dataVencimento ? formatarDataCivilBR(cob.dataVencimento) : "—"}</td>
                              <td className="p-3 text-right font-semibold">{formatCurrency(cob.valorNominal)}</td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{situacao}</span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1">
                                  {codSolicitacao && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => downloadPdf.mutate({ estabelecimentoId, bancoId: effectiveBancoId, codigoSolicitacao: codSolicitacao })}
                                      disabled={downloadPdf.isPending}
                                    >
                                      <Download className="h-3 w-3 mr-1" /> PDF
                                    </Button>
                                  )}
                                  {bol?.linhaDigitavel && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => { navigator.clipboard.writeText(bol.linhaDigitavel); toast.success("Linha digitável copiada!"); }}
                                      title="Copiar Linha Digitável"
                                    >
                                      <Copy className="h-3 w-3 mr-1" /> Linha
                                    </Button>
                                  )}
                                  {pix?.pixCopiaECola && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-emerald-600"
                                      onClick={() => { navigator.clipboard.writeText(pix.pixCopiaECola); toast.success("PIX Copia e Cola copiado!"); }}
                                      title="Copiar PIX Copia e Cola"
                                    >
                                      <Copy className="h-3 w-3 mr-1" /> PIX
                                    </Button>
                                  )}
                                  {codSolicitacao && situacao !== "CANCELADO" && situacao !== "RECEBIDO" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-red-500"
                                      onClick={() => {
                                        const motivo = window.prompt("Informe o motivo do cancelamento do boleto:", "Cancelamento solicitado pelo emissor");
                                        if (motivo) {
                                          cancelarBoletoMut.mutate({ estabelecimentoId, bancoId: effectiveBancoId, codigoSolicitacao: codSolicitacao, motivoCancelamento: motivo.slice(0, 50) });
                                        }
                                      }}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base">Extrato da Conta Corrente (Banco Inter)</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input type="date" value={dataInicioExtrato} onChange={(e) => setDataInicioExtrato(e.target.value)} className="h-8 text-xs w-36" />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="date" value={dataFimExtrato} onChange={(e) => setDataFimExtrato(e.target.value)} className="h-8 text-xs w-36" />
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => extrato.refetch()}>
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-1", extrato.isFetching && "animate-spin")} /> Consultar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => exportarExtratoPdf.mutate({ estabelecimentoId, bancoId: effectiveBancoId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                      disabled={exportarExtratoPdf.isPending}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Exportar PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(extrato.data as any)?.error ? (
                  <div className="p-6 text-center text-sm text-red-500">{(extrato.data as any).error}</div>
                ) : extrato.isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Consultando extrato no Banco Inter...</div>
                ) : listaTransacoesExtrato.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma movimentação encontrada no período.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-y">
                        <tr>
                          <th className="text-left p-3 text-xs font-semibold">Data</th>
                          <th className="text-left p-3 text-xs font-semibold">Tipo</th>
                          <th className="text-left p-3 text-xs font-semibold">Título / Descrição</th>
                          <th className="text-right p-3 text-xs font-semibold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaTransacoesExtrato.map((t: any, i: number) => {
                          const isCredito = String(t.tipoOperacao || "").toUpperCase() === "C";
                          return (
                            <tr key={i} className="border-b hover:bg-muted/20">
                              <td className="p-3 whitespace-nowrap">{t.dataEntrada ? formatarDataCivilBR(t.dataEntrada) : "—"}</td>
                              <td className="p-3 text-xs">{t.tipoTransacao || t.tipoOperacao || "—"}</td>
                              <td className="p-3">
                                <p className="font-medium">{t.titulo || "—"}</p>
                                {t.descricao && <p className="text-xs text-muted-foreground">{t.descricao}</p>}
                              </td>
                              <td className={cn("p-3 text-right font-semibold whitespace-nowrap", isCredito ? "text-green-600" : "text-red-600")}>
                                {isCredito ? "+" : "-"}{formatCurrency(Math.abs(Number(t.valor || 0)))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal: Configurar Credenciais e Certificados mTLS do Banco Inter */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar Integração API Banco Inter (mTLS + OAuth2)</DialogTitle>
            <DialogDescription>
              Informe os dados da aplicação criada no Internet Banking PJ do Banco Inter (menu Soluções para sua empresa → Integrações).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Ambiente da API *</Label>
                <select
                  name="baseUrl"
                  defaultValue={(status.data as any)?.baseUrl || "https://cdpj.partners.bancointer.com.br"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                >
                  <option value="https://cdpj.partners.bancointer.com.br">Produção (cdpj.partners.bancointer.com.br)</option>
                  <option value="https://cdpj-sandbox.partners.bancointer.com.br">Sandbox / Homologação</option>
                </select>
              </div>
              <div>
                <Label>Conta Corrente (com dígito, apenas números)</Label>
                <Input name="contaCorrente" placeholder="Ex: 12345678" className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Client ID *</Label>
                <Input name="clientId" required placeholder="UUID gerado no painel do Banco Inter" className="mt-1 font-mono text-xs" />
              </div>
              <div>
                <Label>Client Secret *</Label>
                <Input name="clientSecret" type="password" required placeholder="Client Secret da integração" className="mt-1 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>Certificado Digital (.crt ou .pem) *</Label>
                <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" /> {certFileName ? `Arquivo: ${certFileName}` : "Carregar arquivo .crt / .pem"}
                  <input type="file" accept=".crt,.pem,.cer" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], "cert")} />
                </label>
              </div>
              <Textarea
                name="certPem"
                rows={4}
                value={certPemText}
                onChange={(e) => setCertPemText(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>Chave Privada (.key) *</Label>
                <label className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" /> {keyFileName ? `Arquivo: ${keyFileName}` : "Carregar arquivo .key"}
                  <input type="file" accept=".key,.pem" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], "key")} />
                </label>
              </div>
              <Textarea
                name="keyPem"
                rows={4}
                value={keyPemText}
                onChange={(e) => setKeyPemText(e.target.value)}
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                className="font-mono text-xs"
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={configurarInter.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                {configurarInter.isPending ? "Criptografando e salvando..." : "Salvar Credenciais Criptografadas"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Nova Conta Bancária */}
      <Dialog open={novoBancoOpen} onOpenChange={setNovoBancoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conta Bancária</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              criarBanco.mutate({
                estabelecimentoId,
                nome: String(fd.get("nome") || "Banco Inter"),
                cor: String(fd.get("cor") || "#ff7a00"),
                saldoInicial: String(fd.get("saldoInicial") || "0"),
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nome do Banco / Conta *</Label>
              <Input name="nome" required defaultValue="Banco Inter" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cor</Label>
                <Input name="cor" type="color" defaultValue="#ff7a00" />
              </div>
              <div>
                <Label>Saldo Inicial</Label>
                <Input name="saldoInicial" type="number" step="0.01" defaultValue="0" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoBancoOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={criarBanco.isPending}>{criarBanco.isPending ? "Salvando..." : "Criar Conta"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Emitir Boleto Avulso com PIX */}
      <Dialog open={emitirOpen} onOpenChange={setEmitirOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir Boleto Híbrido (Código de Barras + PIX)</DialogTitle>
            <DialogDescription>Emissão direta na Cobrança v3 do Banco Inter.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEmitirBoletoAvulso} className="space-y-3">
            <div>
              <Label>Preencher a partir de Cliente Cadastrado (opcional)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                onChange={(ev) => {
                  const cli = (clientes.data || []).find((c: any) => String(c.id) === ev.target.value);
                  if (!cli) return;
                  const form = ev.target.closest("form")!;
                  const setVal = (name: string, val: string) => {
                    const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
                    if (el) el.value = val || "";
                  };
                  setVal("nome", cli.nome || "");
                  setVal("cpfCnpj", cli.cnpj || "");
                  setVal("cep", cli.cep || "");
                  setVal("endereco", cli.endereco || "");
                  setVal("numero", cli.numero || "");
                  setVal("complemento", cli.complemento || "");
                  setVal("bairro", cli.bairro || "");
                  setVal("cidade", cli.cidade || "");
                  setVal("uf", cli.uf || "");
                  setVal("email", cli.email || "");
                }}
              >
                <option value="">-- Selecionar cliente para autopreencher --</option>
                {(clientes.data || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nome} {c.cnpj ? `(${c.cnpj})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Seu Número *</Label>
                <Input name="seuNumero" defaultValue={`SAF-${Date.now().toString().slice(-6)}`} maxLength={15} required />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input name="valorNominal" type="number" step="0.01" min="2.50" required />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input name="dataVencimento" type="date" defaultValue={hoje} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome / Razão Social *</Label>
                <Input name="nome" required />
              </div>
              <div>
                <Label>CPF / CNPJ *</Label>
                <Input name="cpfCnpj" required />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-3">
                <Label>Endereço *</Label>
                <Input name="endereco" required />
              </div>
              <div>
                <Label>Nº *</Label>
                <Input name="numero" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Complemento</Label>
                <Input name="complemento" />
              </div>
              <div>
                <Label>Bairro *</Label>
                <Input name="bairro" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>CEP *</Label>
                <Input name="cep" required />
              </div>
              <div>
                <Label>Cidade *</Label>
                <Input name="cidade" required />
              </div>
              <div>
                <Label>UF *</Label>
                <Input name="uf" maxLength={2} required />
              </div>
            </div>
            <div>
              <Label>E-mail do Pagador</Label>
              <Input name="email" type="email" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmitirOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled title="Emissão avulsa bloqueada: use Contas a Receber com reserva durável" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Emissão avulsa bloqueada — use Contas a Receber
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DRE ====================
function DREView() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = useEstabelecimentoFinanceiroId();
  const now = new Date();
  const [mes, setMes] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [viewMode, setViewMode] = useState<"mensal" | "trimestral" | "anual">("mensal");
  const dreData = trpc.financeiro.dashboard.dre.useQuery({ estabelecimentoId: estabelecimentoId || 0, mes }, { enabled: Boolean(estabelecimentoId) });
  const d = dreData.data;

  const [ano, mesNum] = mes.split("-");
  const mesLabel = MONTHS[Number(mesNum) - 1]?.label || mesNum;

  const pctReceita = (val: number, total: number) => total > 0 ? `${(val / total * 100).toFixed(1)}%` : "\u2014";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">DRE - Demonstrativo de Resultado</h2>
          <p className="text-sm text-muted-foreground">An\u00e1lise de receitas, despesas e resultado do per\u00edodo</p>
        </div>
        <div className="flex gap-2">
          <Select value={mesNum} onValueChange={v => setMes(`${ano}-${v}`)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ano} onValueChange={v => setMes(`${v}-${mesNum}`)}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!estabelecimentoId ? <div className="text-center py-12 text-muted-foreground">Selecione um estabelecimento para visualizar a DRE.</div> : dreData.isLoading ? <div className="text-center py-12 text-muted-foreground">Carregando...</div> : d ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-green-900/80 to-green-950 text-white border-0">
              <CardContent className="pt-4">
                <p className="text-xs text-green-300">Receita Bruta</p>
                <p className="text-3xl font-bold mt-1">{formatCurrency(d.totalReceitas)}</p>
                <p className="text-xs text-green-400 mt-1">{d.receitas.length} tipo(s) de servi\u00e7o</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-red-900/80 to-red-950 text-white border-0">
              <CardContent className="pt-4">
                <p className="text-xs text-red-300">Despesas Totais</p>
                <p className="text-3xl font-bold mt-1">{formatCurrency(d.totalDespesas)}</p>
                <p className="text-xs text-red-400 mt-1">{d.despesas.length} categoria(s)</p>
              </CardContent>
            </Card>
            <Card className={cn("text-white border-0", d.resultado >= 0 ? "bg-gradient-to-br from-emerald-900/80 to-emerald-950" : "bg-gradient-to-br from-red-900/80 to-red-950")}>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-300">Resultado do Per\u00edodo</p>
                <p className="text-3xl font-bold mt-1">{formatCurrency(d.resultado)}</p>
                <p className="text-xs text-slate-400 mt-1">Margem: {d.totalReceitas > 0 ? `${(d.resultado / d.totalReceitas * 100).toFixed(1)}%` : "\u2014"}</p>
              </CardContent>
            </Card>
          </div>

          {/* DRE Tabela Completa */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" /> DRE Gerencial \u2014 {mesLabel}/{ano}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0"><tr>
                    <th className="text-left p-3 font-semibold">Conta</th>
                    <th className="text-right p-3 font-semibold">Valor</th>
                    <th className="text-right p-3 font-semibold">% Receita</th>
                  </tr></thead>
                  <tbody>
                    {/* RECEITAS */}
                    <tr className="bg-green-50 dark:bg-green-950/20 border-t">
                      <td className="p-3 font-bold text-green-700 dark:text-green-400">RECEITA BRUTA</td>
                      <td className="p-3 text-right font-bold text-green-700 dark:text-green-400">{formatCurrency(d.totalReceitas)}</td>
                      <td className="p-3 text-right font-bold text-green-700 dark:text-green-400">100%</td>
                    </tr>
                    {d.receitas.map((r: any, i: number) => (
                      <tr key={`r-${i}`} className="border-t border-border/30 hover:bg-muted/30">
                        <td className="p-3 pl-8 text-muted-foreground">{r.tipoServico}</td>
                        <td className="p-3 text-right tabular-nums">
                          <div>{formatCurrency(r.total)}</div>
                          <div className="text-xs text-muted-foreground">
                            <span className="text-green-600">{formatCurrency(r.recebido)} rec.</span>
                            {Number(r.pendente) > 0 && <span className="text-amber-500 ml-2">{formatCurrency(r.pendente)} pend.</span>}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{pctReceita(Number(r.total), d.totalReceitas)}</td>
                      </tr>
                    ))}

                    {/* DESPESAS */}
                    <tr className="bg-red-50 dark:bg-red-950/20 border-t-2 border-border">
                      <td className="p-3 font-bold text-red-700 dark:text-red-400">(-) DESPESAS TOTAIS</td>
                      <td className="p-3 text-right font-bold text-red-700 dark:text-red-400">{formatCurrency(d.totalDespesas)}</td>
                      <td className="p-3 text-right font-bold text-red-700 dark:text-red-400">{pctReceita(d.totalDespesas, d.totalReceitas)}</td>
                    </tr>
                    {d.despesas.map((desp: any, i: number) => (
                      <tr key={`d-${i}`} className="border-t border-border/30 hover:bg-muted/30">
                        <td className="p-3 pl-8 text-muted-foreground">{desp.categoria}</td>
                        <td className="p-3 text-right tabular-nums">
                          <div>{formatCurrency(desp.total)}</div>
                          <div className="text-xs text-muted-foreground">
                            <span className="text-red-500">{formatCurrency(desp.pago)} pago</span>
                            {Number(desp.pendente) > 0 && <span className="text-amber-500 ml-2">{formatCurrency(desp.pendente)} pend.</span>}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{pctReceita(Number(desp.total), d.totalReceitas)}</td>
                      </tr>
                    ))}

                    {/* RESULTADO */}
                    <tr className={cn("border-t-2 border-border", d.resultado >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20")}>
                      <td className="p-3 font-bold text-lg">=  RESULTADO DO PER\u00cdODO</td>
                      <td className={cn("p-3 text-right font-bold text-lg", d.resultado >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{formatCurrency(d.resultado)}</td>
                      <td className={cn("p-3 text-right font-bold", d.resultado >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{pctReceita(Math.abs(d.resultado), d.totalReceitas)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Despesas por Centro de Custo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Target className="h-5 w-5 text-purple-500" /> Despesas por Centro de Custo</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0"><tr>
                    <th className="text-left p-3 font-semibold">Centro de Custo</th>
                    <th className="text-right p-3 font-semibold">Total</th>
                    <th className="text-right p-3 font-semibold">% Despesa</th>
                    <th className="p-3 font-semibold">Distribui\u00e7\u00e3o</th>
                  </tr></thead>
                  <tbody>
                    {d.despesasPorCC.map((cc: any, i: number) => {
                      const pct = d.totalDespesas > 0 ? (Number(cc.total) / d.totalDespesas * 100) : 0;
                      return (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="p-3 font-medium">{cc.centroCusto}</td>
                          <td className="p-3 text-right tabular-nums font-medium">{formatCurrency(cc.total)}</td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                          <td className="p-3">
                            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Evolu\u00e7\u00e3o DRE - \u00daltimos 6 meses */}
          {d.evolucaoDre && d.evolucaoDre.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-primary" /> Evolu\u00e7\u00e3o DRE \u2014 \u00daltimos 6 Meses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50"><tr>
                      <th className="text-left p-3 font-semibold">M\u00eas</th>
                      <th className="text-right p-3 font-semibold">Receitas</th>
                      <th className="text-right p-3 font-semibold">Despesas</th>
                      <th className="text-right p-3 font-semibold">Resultado</th>
                      <th className="text-right p-3 font-semibold">Margem</th>
                      <th className="p-3">Visual</th>
                    </tr></thead>
                    <tbody>
                      {d.evolucaoDre.map((e: any, i: number) => {
                        const margem = e.receitas > 0 ? (e.resultado / e.receitas * 100) : 0;
                        const maxVal = Math.max(...d.evolucaoDre.map((x: any) => Math.max(x.receitas, x.despesas)), 1);
                        return (
                          <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="p-3 font-medium">{e.mes}</td>
                            <td className="p-3 text-right text-green-600 font-medium tabular-nums">{formatCurrency(e.receitas)}</td>
                            <td className="p-3 text-right text-red-500 font-medium tabular-nums">{formatCurrency(e.despesas)}</td>
                            <td className={cn("p-3 text-right font-bold tabular-nums", e.resultado >= 0 ? "text-emerald-600" : "text-red-600")}>{formatCurrency(e.resultado)}</td>
                            <td className={cn("p-3 text-right tabular-nums", margem >= 0 ? "text-emerald-600" : "text-red-600")}>{margem.toFixed(1)}%</td>
                            <td className="p-3">
                              <div className="flex gap-1 h-4">
                                <div className="bg-green-500/70 rounded-sm" style={{ width: `${(e.receitas / maxVal) * 100}%` }} title={`Receita: ${formatCurrency(e.receitas)}`} />
                                <div className="bg-red-500/70 rounded-sm" style={{ width: `${(e.despesas / maxVal) * 100}%` }} title={`Despesa: ${formatCurrency(e.despesas)}`} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ==================== MÓDULO PRINCIPAL ====================
export default function FinanceiroModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <CircleDollarSign className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Módulo Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão Financeira Hospitalar</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="pagar"><Receipt className="h-4 w-4 mr-1" /> Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receber"><Banknote className="h-4 w-4 mr-1" /> Contas a Receber</TabsTrigger>
          <TabsTrigger value="bancos"><Landmark className="h-4 w-4 mr-1" /> Bancos</TabsTrigger>
          <TabsTrigger value="centros-custo"><Target className="h-4 w-4 mr-1" /> Centros de Custo</TabsTrigger>
          <TabsTrigger value="importador"><Upload className="h-4 w-4 mr-1" /> Importar Excel</TabsTrigger>
          <TabsTrigger value="cadastros"><Building2 className="h-4 w-4 mr-1" /> Cadastros</TabsTrigger>
          <TabsTrigger value="banco-inter"><Landmark className="h-4 w-4 mr-1" /> Banco Inter</TabsTrigger>
          <TabsTrigger value="dre"><FileText className="h-4 w-4 mr-1" /> DRE</TabsTrigger>
          <TabsTrigger value="custo-receita"><Building2 className="h-4 w-4 mr-1" /> Custo x Receita</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><FinDashboard /></TabsContent>
        <TabsContent value="pagar"><ContasPagar /></TabsContent>
        <TabsContent value="receber"><ContasReceber /></TabsContent>
        <TabsContent value="bancos"><BancosView /></TabsContent>
        <TabsContent value="centros-custo"><CentrosCusto /></TabsContent>
        <TabsContent value="importador"><ImportadorExcel /></TabsContent>
        <TabsContent value="cadastros"><Cadastros /></TabsContent>
        <TabsContent value="banco-inter"><BancoInterView /></TabsContent>
        <TabsContent value="dre"><DREView /></TabsContent>
        <TabsContent value="custo-receita"><CustoReceitaUnidade /></TabsContent>
      </Tabs>
    </div>
  );
}
