import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Building2, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Receipt, FileText, Users, Wallet, Scale, Clock
} from "lucide-react";

function formatCurrency(value: number | string | null | undefined) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

// ========== VISÃO GERAL ==========
function VisaoGeral() {
  const { data: dadosConsolidados, isLoading } = trpc.dashboardConsolidado.dados.useQuery(undefined);
  const { data: comparativoGlosas } = trpc.dashboardConsolidado.comparativoGlosas.useQuery(undefined);
  const finDashboard = trpc.financeiro.dashboard.resumo.useQuery({});

  if (isLoading) return <div className="text-muted-foreground p-8">Carregando dados consolidados...</div>;

  const dados = dadosConsolidados;
  const fin = finDashboard.data;

  return (
    <div className="space-y-6">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /> Faturado Total</div>
            <div className="text-2xl font-bold text-blue-500">{formatCurrency(dados?.totais?.valorTotalFaturado || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Todos os estabelecimentos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /> Recebido Total</div>
            <div className="text-2xl font-bold text-green-500">{formatCurrency(dados?.totais?.valorTotalPago || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Todos os estabelecimentos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="h-4 w-4" /> Glosado Total</div>
            <div className="text-2xl font-bold text-red-500">{formatCurrency(dados?.totais?.valorTotalGlosado || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{dados?.totais?.valorTotalFaturado ? formatPercent((Number(dados.totais.valorTotalGlosado || 0) / Number(dados.totais.valorTotalFaturado)) * 100) : "0%"} do faturado</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Scale className="h-4 w-4" /> Recursado Total</div>
            <div className="text-2xl font-bold text-amber-500">{formatCurrency(0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Em processo de recurso</p>
          </CardContent>
        </Card>
      </div>

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
                  <TableHead className="text-right">Contas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.estabelecimentos.map((est: any) => (
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
                    <TableCell className="text-right">{est.totalContas || 0}</TableCell>
                  </TableRow>
                ))}
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
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" /> Atendimentos - Todos os Locais</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <div className="text-sm text-muted-foreground">Funcionalidade em desenvolvimento</div>
            <p className="text-xs text-muted-foreground mt-2">Os atendimentos de todos os estabelecimentos serão consolidados aqui com indicadores de parados e sem faturar.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== FLUXO FINANCEIRO ==========
function FluxoFinanceiro() {
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const dashboard = trpc.financeiro.dashboard.resumo.useQuery({ mes });
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5" /> Fluxo Financeiro</h2>
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-48" />
      </div>
      {dashboard.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground mb-1">Despesas Pagas</div>
                <div className="text-2xl font-bold text-red-500">{formatCurrency(d.despesasPago)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground mb-1">Despesas Pendentes</div>
                <div className="text-2xl font-bold text-amber-500">{formatCurrency(d.despesasPendente)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground mb-1">Receitas Recebidas</div>
                <div className="text-2xl font-bold text-green-500">{formatCurrency(d.receitasRecebido)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground mb-1">Receitas Pendentes</div>
                <div className="text-2xl font-bold text-blue-500">{formatCurrency(d.receitasPendente)}</div>
              </CardContent>
            </Card>
          </div>
          {d.evolucao && d.evolucao.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Evolução Últimos 6 Meses</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.evolucao.map((f: any) => (
                      <TableRow key={f.mes}>
                        <TableCell className="font-medium">{f.mes}</TableCell>
                        <TableCell className="text-right text-green-500">{formatCurrency(f.receitas)}</TableCell>
                        <TableCell className="text-right text-red-500">{formatCurrency(f.despesas)}</TableCell>
                        <TableCell className={`text-right font-bold ${f.receitas - f.despesas >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {formatCurrency(f.receitas - f.despesas)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ========== CONTRATOS RESUMO ==========
function ContratosResumo() {
  const contratos = trpc.contratos.listar.useQuery({});

  const resumo = useMemo(() => {
    if (!contratos.data?.items) return { total: 0, ativos: 0, vencendo: 0, vencidos: 0 };
    const items = contratos.data.items;
    const hoje = new Date();
    const em30dias = new Date();
    em30dias.setDate(em30dias.getDate() + 30);
    return {
      total: items.length,
      ativos: items.filter((c: any) => c.status === "ativo").length,
      vencendo: items.filter((c: any) => {
        if (!c.dataFim) return false;
        const fim = new Date(c.dataFim);
        return fim >= hoje && fim <= em30dias;
      }).length,
      vencidos: items.filter((c: any) => {
        if (!c.dataFim) return false;
        return new Date(c.dataFim) < hoje && c.status === "ativo";
      }).length,
    };
  }, [contratos.data]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Contratos</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{resumo.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-500">{resumo.ativos}</div>
            <div className="text-sm text-muted-foreground">Ativos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{resumo.vencendo}</div>
            <div className="text-sm text-muted-foreground">Vencendo em 30 dias</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-500">{resumo.vencidos}</div>
            <div className="text-sm text-muted-foreground">Vencidos</div>
          </CardContent>
        </Card>
      </div>
      {contratos.data?.items && contratos.data.items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Contratos Recentes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead className="text-right">Valor Mensal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.data.items.slice(0, 10).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.hospitalNome}</TableCell>
                    <TableCell>{c.tipo}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ativo" ? "default" : c.status === "vencido" ? "destructive" : "secondary"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.dataInicio ? new Date(c.dataInicio).toLocaleDateString("pt-BR") : "-"} - {c.dataFim ? new Date(c.dataFim).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell className="text-right">{c.valorMensal ? formatCurrency(c.valorMensal) : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Receipt className="h-5 w-5" /> NFS-e</h2>
      {dashboard.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
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

// ========== MÓDULO PRINCIPAL ==========
export default function PainelExecutivo() {
  const [activeTab, setActiveTab] = useState("visao-geral");

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Painel Executivo Safatle</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada de todos os estabelecimentos</p>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="visao-geral"><BarChart3 className="h-4 w-4 mr-1" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="financeiro"><Wallet className="h-4 w-4 mr-1" /> Fluxo Financeiro</TabsTrigger>
            <TabsTrigger value="contratos"><FileText className="h-4 w-4 mr-1" /> Contratos</TabsTrigger>
            <TabsTrigger value="nfse"><Receipt className="h-4 w-4 mr-1" /> NFS-e</TabsTrigger>
            <TabsTrigger value="atendimentos"><Users className="h-4 w-4 mr-1" /> Atendimentos</TabsTrigger>
          </TabsList>
          <TabsContent value="visao-geral"><VisaoGeral /></TabsContent>
          <TabsContent value="financeiro"><FluxoFinanceiro /></TabsContent>
          <TabsContent value="contratos"><ContratosResumo /></TabsContent>
          <TabsContent value="nfse"><NfseResumo /></TabsContent>
          <TabsContent value="atendimentos"><AtendimentosConsolidados /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
