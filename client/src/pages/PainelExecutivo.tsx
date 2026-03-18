import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Building2, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Receipt, FileText, Users, Wallet, Scale, Clock,
  LayoutGrid, FileSpreadsheet, ChevronRight, Briefcase, Eye,
  ArrowRight, Banknote, PieChart, Target, Shield, Settings, Lock,
  Check, X, UserCog, Search
} from "lucide-react";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { SAFATLE_ESTABELECIMENTO_ID } from "@shared/const";

// Lazy load dos módulos completos
const FinanceiroModule = lazy(() => import("./FinanceiroModule"));
const ContratosModule = lazy(() => import("./ContratosModule"));
const PropostasModule = lazy(() => import("./PropostasModule"));

function formatCurrency(value: number | string | null | undefined) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

// ========== NAVEGAÇÃO LATERAL DO PAINEL ==========
type PainelTab = "visao-geral" | "financeiro" | "contratos" | "propostas" | "atendimentos" | "nfse" | "permissoes";

type ModuloSafatle = "painelExecutivo" | "visaoGeral" | "financeiro" | "contratos" | "propostas" | "atendimentosConsolidados" | "nfseConsolidado";

const tabToModulo: Record<string, ModuloSafatle> = {
  "visao-geral": "visaoGeral",
  "financeiro": "financeiro",
  "contratos": "contratos",
  "propostas": "propostas",
  "atendimentos": "atendimentosConsolidados",
  "nfse": "nfseConsolidado",
};

const painelTabs: { id: PainelTab; label: string; icon: any; description: string; adminOnly?: boolean }[] = [
  { id: "visao-geral", label: "Visão Geral", icon: LayoutGrid, description: "Dashboard consolidado" },
  { id: "financeiro", label: "Financeiro", icon: DollarSign, description: "Gestão financeira" },
  { id: "contratos", label: "Contratos", icon: FileText, description: "Gestão de contratos" },
  { id: "propostas", label: "Propostas", icon: FileSpreadsheet, description: "Propostas comerciais" },
  { id: "atendimentos", label: "Atendimentos", icon: Users, description: "Consolidado de atendimentos" },
  { id: "nfse", label: "NFS-e", icon: Receipt, description: "Notas fiscais de serviço" },
  { id: "permissoes", label: "Permissões", icon: UserCog, description: "Gerenciar acessos", adminOnly: true },
];

// ========== VISÃO GERAL ==========
function VisaoGeral({ onNavigate }: { onNavigate: (tab: PainelTab) => void }) {
  const { data: dadosConsolidados, isLoading } = trpc.dashboardConsolidado.dados.useQuery(undefined);
  const { data: comparativoGlosas } = trpc.dashboardConsolidado.comparativoGlosas.useQuery(undefined);
  const { data: recursadoData } = trpc.dashboardConsolidado.recursadoConsolidado.useQuery(undefined);
  const finDashboard = trpc.financeiro.dashboard.resumo.useQuery({});
  const contratosQuery = trpc.contratos.listar.useQuery({});

  // Resumo de contratos - DEVE ficar antes de qualquer early return
  const contratosResumo = useMemo(() => {
    if (!contratosQuery.data?.items) return { total: 0, ativos: 0, vencendo: 0 };
    const items = contratosQuery.data.items;
    const hoje = new Date();
    const em30dias = new Date(); em30dias.setDate(em30dias.getDate() + 30);
    return {
      total: items.length,
      ativos: items.filter((c: any) => c.status === "ativo").length,
      vencendo: items.filter((c: any) => { if (!c.dataFim) return false; const fim = new Date(c.dataFim); return fim >= hoje && fim <= em30dias; }).length,
    };
  }, [contratosQuery.data]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando dados consolidados...</p>
      </div>
    </div>
  );

  const dados = dadosConsolidados;
  const fin = finDashboard.data;
  const rec = recursadoData;

  return (
    <div className="space-y-6">
      {/* Header com boas-vindas */}
      <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/10 p-6">
        <h2 className="text-xl font-bold text-foreground">Visão Geral Consolidada</h2>
        <p className="text-sm text-muted-foreground mt-1">Dados de todos os estabelecimentos do grupo Safatle</p>
      </div>

      {/* KPIs Principais: Faturado x Recebido x Glosado x Recursado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /> Faturado Total</div>
            <div className="text-2xl font-bold text-blue-500">{formatCurrency(dados?.totais?.valorTotalFaturado || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Todos os estabelecimentos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /> Recebido Total</div>
            <div className="text-2xl font-bold text-green-500">{formatCurrency(dados?.totais?.valorTotalPago || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Todos os estabelecimentos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="h-4 w-4" /> Glosado Total</div>
            <div className="text-2xl font-bold text-red-500">{formatCurrency(dados?.totais?.valorTotalGlosado || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{dados?.totais?.valorTotalFaturado ? formatPercent((Number(dados.totais.valorTotalGlosado || 0) / Number(dados.totais.valorTotalFaturado)) * 100) : "0%"} do faturado</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Scale className="h-4 w-4" /> Recursado Total</div>
            <div className="text-2xl font-bold text-amber-500">{formatCurrency(rec?.kpis?.valorTotalRecursado || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {rec?.kpis?.totalRecursos || 0} recursos | Recuperado: {formatCurrency(rec?.kpis?.valorTotalRecuperado || 0)} ({formatPercent(rec?.kpis?.taxaRecuperacao || 0)})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de acesso rápido aos módulos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group" onClick={() => onNavigate("financeiro")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="font-semibold text-foreground">Financeiro</h3>
            <div className="mt-2 space-y-1">
              {fin ? (
                <>
                  <p className="text-xs text-muted-foreground">Despesas pendentes: <span className="font-medium text-red-500">{formatCurrency(fin.despesasPendente)}</span></p>
                  <p className="text-xs text-muted-foreground">Receitas pendentes: <span className="font-medium text-green-500">{formatCurrency(fin.receitasPendente)}</span></p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group" onClick={() => onNavigate("contratos")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="font-semibold text-foreground">Contratos</h3>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">Total: <span className="font-medium">{contratosResumo.total}</span> | Ativos: <span className="font-medium text-green-500">{contratosResumo.ativos}</span></p>
              {contratosResumo.vencendo > 0 && <p className="text-xs text-amber-500 font-medium">{contratosResumo.vencendo} vencendo em 30 dias</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group" onClick={() => onNavigate("propostas")}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-purple-500" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h3 className="font-semibold text-foreground">Propostas</h3>
            <p className="text-xs text-muted-foreground mt-2">Gestão de propostas comerciais</p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo Recursos de Glosa */}
      {rec && rec.kpis.totalRecursos > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Scale className="h-5 w-5 text-amber-500" /> Recursos de Glosa - Resumo Consolidado</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{rec.kpis.totalRecursos}</div>
                <div className="text-xs text-muted-foreground">Total Recursos</div>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <div className="text-2xl font-bold text-red-500">{formatCurrency(rec.kpis.valorTotalGlosado)}</div>
                <div className="text-xs text-muted-foreground">Valor Glosado</div>
              </div>
              <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <div className="text-2xl font-bold text-amber-500">{formatCurrency(rec.kpis.valorTotalRecursado)}</div>
                <div className="text-xs text-muted-foreground">Valor Recursado</div>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <div className="text-2xl font-bold text-green-500">{formatCurrency(rec.kpis.valorTotalRecuperado)}</div>
                <div className="text-xs text-muted-foreground">Valor Recuperado</div>
              </div>
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-500">{formatPercent(rec.kpis.taxaRecuperacao)}</div>
                <div className="text-xs text-muted-foreground">Taxa Recuperação</div>
              </div>
            </div>
            {rec.porStatus.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {rec.porStatus.map((s: any) => (
                  <Badge key={s.status} variant={s.status === 'deferido' ? 'default' : s.status === 'indeferido' ? 'destructive' : 'secondary'} className="text-xs">
                    {s.status}: {s.quantidade} ({formatCurrency(s.valorGlosado)})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs Financeiros */}
      {fin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-red-400">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Wallet className="h-4 w-4" /> Despesas a Pagar</div>
              <div className="text-xl font-bold text-red-400">{formatCurrency(fin.despesasPendente)}</div>
              <p className="text-xs text-red-500 mt-1">Vencidas: {formatCurrency(fin.despesasVencido)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-400">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /> Receitas Pendentes</div>
              <div className="text-xl font-bold text-green-400">{formatCurrency(fin.receitasPendente)}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><BarChart3 className="h-4 w-4" /> Saldo Financeiro</div>
              {(() => {
                const saldo = Number(fin.receitasRecebido) - Number(fin.despesasPago);
                return <div className={`text-xl font-bold ${saldo >= 0 ? "text-green-500" : "text-red-500"}`}>{formatCurrency(saldo)}</div>;
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparativo por Estabelecimento */}
      {dados?.estabelecimentos && dados.estabelecimentos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-5 w-5" /> Comparativo por Estabelecimento</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead className="text-right">Faturado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Glosado</TableHead>
                  <TableHead className="text-right">% Glosa</TableHead>
                  <TableHead className="text-right">Recursado</TableHead>
                  <TableHead className="text-right">Recuperado</TableHead>
                  <TableHead className="text-right">Contas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.estabelecimentos.map((est: any) => {
                  const estRec = rec?.porEstabelecimento?.find((r: any) => r.estabelecimentoId === est.id);
                  return (
                  <TableRow key={est.id}>
                    <TableCell className="font-medium">{est.nome}</TableCell>
                    <TableCell className="text-right">{formatCurrency(est.faturado)}</TableCell>
                    <TableCell className="text-right text-green-500">{formatCurrency(est.recebido)}</TableCell>
                    <TableCell className="text-right text-red-500">{formatCurrency(est.glosado)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={est.percentualGlosa > 10 ? "destructive" : "default"}>
                        {formatPercent(est.percentualGlosa || 0)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-amber-500">{formatCurrency(estRec?.valorGlosado || 0)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(estRec?.valorRecuperado || 0)}</TableCell>
                    <TableCell className="text-right">{est.totalContas || 0}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Alertas de Glosa por Estabelecimento */}
      {comparativoGlosas && comparativoGlosas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Alertas de Glosa</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {comparativoGlosas.filter((e: any) => e.percentualGlosa > 10).map((est: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-sm"><strong>{est.estabelecimentoNome}</strong>: glosa de {formatPercent(est.percentualGlosa)} ({formatCurrency(est.valorGlosado)})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== ATENDIMENTOS CONSOLIDADOS ==========
function AtendimentosConsolidados() {
  const { data, isLoading } = trpc.dashboardConsolidado.atendimentosConsolidados.useQuery(undefined);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando atendimentos...</p>
      </div>
    </div>
  );
  if (!data) return <div className="text-muted-foreground p-8">Sem dados disponíveis.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/10 p-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Atendimentos - Todos os Locais</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão consolidada de atendimentos de todos os estabelecimentos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Users className="h-4 w-4" /> Total de Atendimentos</div>
            <div className="text-3xl font-bold text-blue-500">{data.kpis.total.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Clock className="h-4 w-4" /> Média Dias Parado</div>
            <div className="text-3xl font-bold text-amber-500">{data.kpis.mediaDias} dias</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /> Valor Total</div>
            <div className="text-3xl font-bold text-green-500">{formatCurrency(data.kpis.valorTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {data.porEstabelecimento.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-5 w-5" /> Por Estabelecimento</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sem Conta</TableHead>
                  <TableHead className="text-right">A Faturar</TableHead>
                  <TableHead className="text-right">Internação</TableHead>
                  <TableHead className="text-right">Ambulatório</TableHead>
                  <TableHead className="text-right">Exame</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.porEstabelecimento.map((est: any) => (
                  <TableRow key={est.id}>
                    <TableCell className="font-medium">{est.nome}</TableCell>
                    <TableCell className="text-right font-bold">{est.total}</TableCell>
                    <TableCell className="text-right text-red-500">{est.semConta}</TableCell>
                    <TableCell className="text-right text-amber-500">{est.aFaturar}</TableCell>
                    <TableCell className="text-right">{est.internacao}</TableCell>
                    <TableCell className="text-right">{est.ambulatorio}</TableCell>
                    <TableCell className="text-right">{est.exame}</TableCell>
                    <TableCell className="text-right text-green-500">{formatCurrency(est.valorTotal)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.total, 0)}</TableCell>
                  <TableCell className="text-right text-red-500">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.semConta, 0)}</TableCell>
                  <TableCell className="text-right text-amber-500">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.aFaturar, 0)}</TableCell>
                  <TableCell className="text-right">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.internacao, 0)}</TableCell>
                  <TableCell className="text-right">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.ambulatorio, 0)}</TableCell>
                  <TableCell className="text-right">{data.porEstabelecimento.reduce((s: number, e: any) => s + e.exame, 0)}</TableCell>
                  <TableCell className="text-right text-green-500">{formatCurrency(data.porEstabelecimento.reduce((s: number, e: any) => s + e.valorTotal, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.topConvenios.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top 15 Convênios com Atendimentos Parados</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Convênio</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">% do Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topConvenios.map((c: any) => (
                  <TableRow key={c.convenio}>
                    <TableCell className="font-medium">{c.convenio}</TableCell>
                    <TableCell className="text-right">{c.quantidade}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{data.kpis.total > 0 ? formatPercent((c.quantidade / data.kpis.total) * 100) : "0%"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.porOrigem.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Por Sistema de Origem</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data.porOrigem.map((o: any) => (
                <div key={o.origem} className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold">{o.quantidade}</div>
                  <div className="text-sm text-muted-foreground">{o.origem}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== NFS-e RESUMO ==========
function NfseResumo() {
  const dashboard = trpc.nfse.notas.dashboard.useQuery({});
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/10 p-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><Receipt className="h-5 w-5" /> NFS-e - Notas Fiscais de Serviço</h2>
        <p className="text-sm text-muted-foreground mt-1">Gestão de notas fiscais eletrônicas de serviço</p>
      </div>
      {dashboard.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        </div>
      ) : d ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-blue-500">{d.kpis?.totalNotas || 0}</div>
              <div className="text-sm text-muted-foreground">Total Notas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-amber-500">{d.kpis?.totalPendentes || 0}</div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-green-500">{d.kpis?.totalEmitidas || 0}</div>
              <div className="text-sm text-muted-foreground">Emitidas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-green-600">{formatCurrency(d.kpis?.totalBruto || 0)}</div>
              <div className="text-sm text-muted-foreground">Valor Total</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ========== GERENCIAMENTO DE PERMISSÕES ==========
const MODULOS_SAFATLE = [
  { key: "acessoPainelExecutivo" as const, label: "Painel Executivo", icon: Shield, description: "Acesso ao painel executivo Safatle" },
  { key: "acessoVisaoGeral" as const, label: "Visão Geral", icon: LayoutGrid, description: "Dashboard consolidado com KPIs" },
  { key: "acessoFinanceiro" as const, label: "Financeiro", icon: DollarSign, description: "Gestão financeira, DRE, contas" },
  { key: "acessoContratos" as const, label: "Contratos", icon: FileText, description: "Gestão de contratos hospitalares" },
  { key: "acessoPropostas" as const, label: "Propostas", icon: FileSpreadsheet, description: "Propostas comerciais" },
  { key: "acessoAtendimentosConsolidados" as const, label: "Atendimentos", icon: Users, description: "Atendimentos consolidados" },
  { key: "acessoNfseConsolidado" as const, label: "NFS-e", icon: Receipt, description: "Notas fiscais de serviço" },
];

function PermissoesManager() {
  const utils = trpc.useUtils();
  const [searchUser, setSearchUser] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Buscar usuários do estabelecimento Safatle
  const { data: usuarios, isLoading: loadingUsers } = trpc.permissoes.usuariosEstabelecimento.useQuery(
    { estabelecimentoId: SAFATLE_ESTABELECIMENTO_ID },
    { retry: false }
  );

  // Buscar todos os usuários do sistema
  const { data: todosUsuarios } = trpc.permissoes.listarUsuarios.useQuery(undefined, { retry: false });

  const upsertMutation = trpc.permissoes.upsertPermissao.useMutation({
    onSuccess: () => {
      toast.success("Permissões salvas - As permissões foram atualizadas com sucesso.");
      utils.permissoes.usuariosEstabelecimento.invalidate();
      setSaving(false);
    },
    onError: (err) => {
      toast.error("Erro: " + err.message);
      setSaving(false);
    },
  });

  // Quando seleciona um usuário, carregar suas permissões atuais
  useEffect(() => {
    if (selectedUserId && usuarios) {
      const userPerm = usuarios.find((u: any) => u.userId === selectedUserId);
      if (userPerm) {
        const perms: Record<string, boolean> = {};
        MODULOS_SAFATLE.forEach(m => {
          perms[m.key] = (userPerm as any)[m.key] === "sim";
        });
        setEditingPerms(perms);
      } else {
        // Usuário sem permissões ainda - tudo desligado
        const perms: Record<string, boolean> = {};
        MODULOS_SAFATLE.forEach(m => { perms[m.key] = false; });
        setEditingPerms(perms);
      }
    }
  }, [selectedUserId, usuarios]);

  const handleSave = () => {
    if (!selectedUserId) return;
    setSaving(true);
    const permData: any = {
      userId: selectedUserId,
      estabelecimentoId: SAFATLE_ESTABELECIMENTO_ID,
      podeVisualizar: "sim" as const,
    };
    MODULOS_SAFATLE.forEach(m => {
      permData[m.key] = editingPerms[m.key] ? "sim" : "nao";
    });
    upsertMutation.mutate(permData);
  };

  const toggleAll = (value: boolean) => {
    const perms: Record<string, boolean> = {};
    MODULOS_SAFATLE.forEach(m => { perms[m.key] = value; });
    setEditingPerms(perms);
  };

  // Filtrar usuários pela busca
  const allUsers = todosUsuarios || [];
  const filteredUsers = searchUser.length > 0
    ? allUsers.filter((u: any) => u.name?.toLowerCase().includes(searchUser.toLowerCase()) || u.email?.toLowerCase().includes(searchUser.toLowerCase()))
    : allUsers;

  // Usuários que já têm permissão no Safatle
  const usersWithPerms = usuarios || [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent border border-violet-500/10 p-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><UserCog className="h-5 w-5" /> Gerenciamento de Permissões - Safatle</h2>
        <p className="text-sm text-muted-foreground mt-1">Controle quais usuários podem acessar cada módulo do Painel Executivo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de usuários */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usuários</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              {/* Usuários com permissões Safatle */}
              {usersWithPerms.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Com acesso Safatle</p>
                </div>
              )}
              {usersWithPerms.map((u: any) => (
                <button
                  key={`perm-${u.userId}`}
                  onClick={() => setSelectedUserId(u.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50",
                    selectedUserId === u.userId && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {(u.userName || u.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.userName || u.name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.userEmail || u.email || ""}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {MODULOS_SAFATLE.filter(m => (u as any)[m.key] === "sim").length}/{MODULOS_SAFATLE.length}
                  </Badge>
                </button>
              ))}

              {/* Todos os usuários */}
              {filteredUsers.length > 0 && (
                <div className="px-3 py-2 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Todos os usuários</p>
                </div>
              )}
              {filteredUsers.slice(0, 30).map((u: any) => (
                <button
                  key={`all-${u.id}`}
                  onClick={() => setSelectedUserId(u.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/50",
                    selectedUserId === u.id && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                    {(u.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || ""}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{u.role}</Badge>
                </button>
              ))}

              {filteredUsers.length === 0 && !loadingUsers && (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum usuário encontrado</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Painel de permissões */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Permissões por Módulo</CardTitle>
              {selectedUserId && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                    <Check className="h-3 w-3 mr-1" /> Liberar Todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                    <X className="h-3 w-3 mr-1" /> Bloquear Todos
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedUserId ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <UserCog className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">Selecione um usuário para gerenciar suas permissões</p>
              </div>
            ) : (
              <div className="space-y-4">
                {MODULOS_SAFATLE.map(modulo => {
                  const Icon = modulo.icon;
                  const isEnabled = editingPerms[modulo.key] || false;
                  return (
                    <div
                      key={modulo.key}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border transition-colors",
                        isEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center",
                          isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{modulo.label}</p>
                          <p className="text-xs text-muted-foreground">{modulo.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={isEnabled ? "default" : "secondary"} className="text-xs">
                          {isEnabled ? "Liberado" : "Bloqueado"}
                        </Badge>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => setEditingPerms(prev => ({ ...prev, [modulo.key]: checked }))}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" /> Salvando...</>
                    ) : (
                      <><Check className="h-4 w-4 mr-2" /> Salvar Permissões</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== MÓDULO PRINCIPAL ==========
export default function PainelExecutivo() {
  const [activeTab, setActiveTab] = useState<PainelTab>("visao-geral");
  const { user } = useAuth();
  const { temAcessoModulo } = useEstabelecimento();
  const isAdmin = user?.role === "admin";

  // Verificar permissão para cada aba
  const hasAccessToTab = (tabId: PainelTab): boolean => {
    if (isAdmin) return true; // Admin tem acesso total
    if (tabId === "permissoes") return false; // Só admin
    const modulo = tabToModulo[tabId];
    if (!modulo) return true;
    return temAcessoModulo(modulo as any);
  };

  // Filtrar abas visíveis
  const visibleTabs = painelTabs.filter(tab => {
    if (tab.adminOnly && !isAdmin) return false;
    return hasAccessToTab(tab.id);
  });

  const renderContent = () => {
    // Verificar permissão
    if (!hasAccessToTab(activeTab)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Lock className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-lg font-medium">Acesso Restrito</p>
          <p className="text-sm">Você não tem permissão para acessar este módulo.</p>
          <p className="text-xs mt-2">Solicite acesso ao administrador do sistema.</p>
        </div>
      );
    }

    switch (activeTab) {
      case "visao-geral":
        return <VisaoGeral onNavigate={setActiveTab} />;
      case "financeiro":
        return (
          <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
            <FinanceiroModule />
          </Suspense>
        );
      case "contratos":
        return (
          <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
            <ContratosModule />
          </Suspense>
        );
      case "propostas":
        return (
          <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
            <PropostasModule />
          </Suspense>
        );
      case "atendimentos":
        return <AtendimentosConsolidados />;
      case "nfse":
        return <NfseResumo />;
      case "permissoes":
        return <PermissoesManager />;
      default:
        return <VisaoGeral onNavigate={setActiveTab} />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Painel Executivo Safatle</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada e gestão do grupo</p>
          </div>
        </div>

        {/* Navegação por abas horizontais */}
        <div className="border-b border-border">
          <nav className="flex gap-1 overflow-x-auto pb-px -mb-px">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Conteúdo */}
        <div className="pt-2">
          {renderContent()}
        </div>
      </div>
    </DashboardLayout>
  );
}
