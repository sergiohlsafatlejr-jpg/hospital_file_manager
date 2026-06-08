import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Building2,
  ArrowRight,
  Ban,
  PlusCircle,
  BarChart3,
  Layers,
  Send,
  Scale,
} from "lucide-react";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatCompetencia(comp: string): string {
  if (!comp) return "";
  const [year, month] = comp.split("-");
  return `${month}/${year}`;
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [competencia, setCompetencia] = useState<string>("");
  const [activeTab, setActiveTab] = useState("gerente");

  // Usar o contexto de estabelecimento
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 1;

  const { data, isLoading, error } = trpc.dashboardHome.resumoGeral.useQuery({
    estabelecimentoId,
    competencia: (competencia && competencia !== 'todas') ? competencia : undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-8 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Bem-vindo, {user?.name || "Usuário"}</p>
          </div>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhum dado disponível</h3>
            <p className="text-muted-foreground text-sm">
              {error ? `Erro ao carregar dados: ${error.message}` : 'Não há dados de faturamento para este estabelecimento ainda.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { faturista, recursoGlosa, fluxoPipeline, conciliacao } = data;
  const taxaConciliacao = conciliacao.totalItens > 0
    ? ((conciliacao.conciliados / conciliacao.totalItens) * 100)
    : 0;
  const taxaRecuperacao = recursoGlosa.valorTotalGlosado > 0
    ? ((recursoGlosa.valorTotalRecuperado / recursoGlosa.valorTotalGlosado) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo, {user?.name || "Usuário"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Competência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {faturista.evolucaoMensal.map((e) => (
                <SelectItem key={e.competencia} value={e.competencia}>
                  {formatCompetencia(e.competencia)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs por perfil */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="gerente">Gerente</TabsTrigger>
          <TabsTrigger value="faturista">Faturista</TabsTrigger>
          <TabsTrigger value="recurso">Recurso de Glosa</TabsTrigger>
        </TabsList>

        {/* ===== ABA GERENTE ===== */}
        <TabsContent value="gerente" className="space-y-6 mt-4">
          {/* KPIs principais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Faturado</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(faturista.valorTotalFaturado)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{faturista.totalContas} contas</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Conciliação</p>
                    <p className="text-2xl font-bold text-foreground">{taxaConciliacao.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{conciliacao.conciliados.toLocaleString()} itens</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Glosas</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(conciliacao.totalGlosa)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{conciliacao.glosados.toLocaleString()} itens</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <Ban className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recuperação</p>
                    <p className="text-2xl font-bold text-foreground">{taxaRecuperacao.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatCurrency(recursoGlosa.valorTotalRecuperado)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline do Processo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Pipeline do Processo
              </CardTitle>
              <CardDescription>Fluxo completo: Faturamento → NF → Demonstrativo → Recurso</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <FileText className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{fluxoPipeline.totalGuiasFaturadas.toLocaleString()}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Guias Faturadas</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <FileText className="h-6 w-6 mx-auto text-indigo-600 mb-1" />
                  <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">{fluxoPipeline.totalNfEmitidas.toLocaleString()}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">NFs Emitidas</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-green-600 mb-1" />
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">{fluxoPipeline.totalDemonstrativosImportados.toLocaleString()}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Demonstrativos</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <Scale className="h-6 w-6 mx-auto text-purple-600 mb-1" />
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{fluxoPipeline.totalRecursosFeitos.toLocaleString()}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">Recursos Feitos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conciliação + Convênios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conciliação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Conciliados
                  </span>
                  <span className="font-medium">{conciliacao.conciliados.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Glosas
                  </span>
                  <span className="font-medium">{conciliacao.glosados.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Sem Pagamento
                  </span>
                  <span className="font-medium">{conciliacao.semPagamento.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-teal-500" />
                    Acréscimos
                  </span>
                  <span className="font-medium">{conciliacao.acrescimos.toLocaleString()}</span>
                </div>
                <Progress value={taxaConciliacao} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground text-right">{taxaConciliacao.toFixed(1)}% conciliado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Convênios</CardTitle>
                <CardDescription>Maiores valores faturados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {faturista.conveniosTop.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-medium">{c.convenio}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(c.totalFaturado)}</p>
                        <p className="text-xs text-muted-foreground">{c.totalGuias} guias</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== ABA FATURISTA ===== */}
        <TabsContent value="faturista" className="space-y-6 mt-4">
          {/* KPIs Faturamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total Faturado</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(faturista.valorTotalFaturado)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Competência: {formatCompetencia(faturista.competenciaAtual)}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Quantidade de Contas</p>
                    <p className="text-2xl font-bold text-foreground">{faturista.totalContas.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">{faturista.totalItens.toLocaleString()} itens</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ticket Médio</p>
                    <p className="text-2xl font-bold text-foreground">
                      {faturista.totalContas > 0 ? formatCurrency(faturista.valorTotalFaturado / faturista.totalContas) : "R$ 0,00"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">por conta</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Convênios com maiores valores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Convênios com Maiores Valores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faturista.conveniosTop.map((c, i) => {
                  const percentual = faturista.valorTotalFaturado > 0
                    ? (c.totalFaturado / faturista.valorTotalFaturado) * 100
                    : 0;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.convenio}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{c.totalGuias} guias</span>
                          <span className="text-sm font-bold">{formatCurrency(c.totalFaturado)}</span>
                        </div>
                      </div>
                      <Progress value={percentual} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Evolução mensal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Evolução Mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {faturista.evolucaoMensal.map((e, i) => (
                  <div key={i} className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">{formatCompetencia(e.competencia)}</p>
                    <p className="text-sm font-bold mt-1">{formatCurrency(e.valorFaturado)}</p>
                    <p className="text-xs text-muted-foreground">{e.totalContas} contas</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ABA RECURSO DE GLOSA ===== */}
        <TabsContent value="recurso" className="space-y-6 mt-4">
          {/* KPIs Recurso */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(recursoGlosa.valorTotalGlosado)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{recursoGlosa.totalRecursos} recursos</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <Ban className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Recursado</p>
                    <p className="text-2xl font-bold text-orange-600">{formatCurrency(recursoGlosa.valorTotalRecursado)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Send className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Recuperado</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(recursoGlosa.valorTotalRecuperado)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{taxaRecuperacao.toFixed(1)}% taxa</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Aguardando Resposta</p>
                    <p className="text-2xl font-bold text-amber-600">{recursoGlosa.enviado + recursoGlosa.emAnalise}</p>
                    <p className="text-xs text-muted-foreground mt-1">recursos enviados</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status dos recursos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status dos Recursos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border text-center">
                  <p className="text-2xl font-bold">{recursoGlosa.rascunho}</p>
                  <p className="text-xs text-muted-foreground">Rascunho</p>
                </div>
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{recursoGlosa.pendenteEnvio}</p>
                  <p className="text-xs text-yellow-600">Pendente Envio</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 text-center">
                  <p className="text-2xl font-bold text-blue-700">{recursoGlosa.enviado}</p>
                  <p className="text-xs text-blue-600">Enviado</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 text-center">
                  <p className="text-2xl font-bold text-purple-700">{recursoGlosa.emAnalise}</p>
                  <p className="text-xs text-purple-600">Em Análise</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 text-center">
                  <p className="text-2xl font-bold text-green-700">{recursoGlosa.deferido}</p>
                  <p className="text-xs text-green-600">Deferido</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{recursoGlosa.deferidoParcial}</p>
                  <p className="text-xs text-emerald-600">Deferido Parcial</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 text-center">
                  <p className="text-2xl font-bold text-red-700">{recursoGlosa.indeferido}</p>
                  <p className="text-xs text-red-600">Indeferido</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recursos com prazo */}
          {recursoGlosa.recursosComPrazo.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Prazos de Resposta
                </CardTitle>
                <CardDescription>Recursos aguardando resposta do convênio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recursoGlosa.recursosComPrazo.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium">Guia {r.guiaNumero}</p>
                          <p className="text-xs text-muted-foreground">{r.pacienteNome} - {r.convenioNome}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(r.valorGlosado)}</span>
                        <Badge variant={r.diasRestantes <= 7 ? "destructive" : r.diasRestantes <= 15 ? "secondary" : "outline"}>
                          {r.diasRestantes} dias
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Recurso de Glosa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fluxo do Recurso</CardTitle>
              <CardDescription>Faturado → NF Emitida → Demonstrativo Importado → Recurso Feito</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{fluxoPipeline.totalGuiasFaturadas.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Faturado</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{fluxoPipeline.totalNfEmitidas.toLocaleString()}</p>
                  <p className="text-xs text-indigo-600">NF Emitida</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{fluxoPipeline.totalDemonstrativosImportados.toLocaleString()}</p>
                  <p className="text-xs text-green-600">Demonstrativo</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{fluxoPipeline.totalRecursosFeitos.toLocaleString()}</p>
                  <p className="text-xs text-purple-600">Recurso Feito</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
