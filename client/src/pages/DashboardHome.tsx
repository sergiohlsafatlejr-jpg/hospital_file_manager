import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocation } from "wouter";
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
  BarChart3,
  Layers,
  Send,
  Scale,
  Factory,
  Inbox,
  ClipboardCheck,
  Stethoscope,
  Sparkles,
  Gavel,
  Users,
  Timer,
  ExternalLink,
} from "lucide-react";

function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatCompetencia(comp: string): string {
  if (!comp) return "";
  const normalized = comp.replace("/", "-");
  const [year, month] = normalized.split("-");
  if (!year || !month) return comp;
  return `${month}/${year}`;
}

function formatHorasParado(horas: number): string {
  const h = Math.round(Number(horas || 0));
  if (h <= 0) return "< 1h";
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH > 0 ? `${dias}d ${restoH}h` : `${dias}d`;
}

const SETORES_ESTEIRA_HOME = [
  {
    id: "recepcao",
    numero: 1,
    nome: "1. Recepção de Contas",
    curto: "Recepção",
    parado: true,
    corBorda: "border-t-slate-500",
    corIcone: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60",
    corDestaque: "text-slate-700 dark:text-slate-200",
    icon: Inbox,
  },
  {
    id: "faturamento",
    numero: 2,
    nome: "2. Setor de Faturamento",
    curto: "Faturamento",
    parado: true,
    corBorda: "border-t-blue-600",
    corIcone: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40",
    corDestaque: "text-blue-700 dark:text-blue-300",
    icon: FileText,
  },
  {
    id: "auditoria_interna",
    numero: 3,
    nome: "3. Auditoria Interna",
    curto: "Aud. Interna",
    parado: true,
    corBorda: "border-t-amber-500",
    corIcone: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40",
    corDestaque: "text-amber-700 dark:text-amber-300",
    icon: ClipboardCheck,
  },
  {
    id: "auditoria_externa",
    numero: 4,
    nome: "4. Auditoria Externa",
    curto: "Aud. Externa",
    parado: true,
    corBorda: "border-t-purple-600",
    corIcone: "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40",
    corDestaque: "text-purple-700 dark:text-purple-300",
    icon: Stethoscope,
  },
  {
    id: "limpeza_prontuario",
    numero: 5,
    nome: "5. Limpeza de Prontuários",
    curto: "Limpeza / Envio",
    parado: true,
    corBorda: "border-t-cyan-600",
    corIcone: "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40",
    corDestaque: "text-cyan-700 dark:text-cyan-300",
    icon: Sparkles,
  },
  {
    id: "enviado_convenio",
    numero: 6,
    nome: "6. Enviado / Recursos",
    curto: "Enviado / Recursos",
    parado: false,
    corBorda: "border-t-emerald-600",
    corIcone: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40",
    corDestaque: "text-emerald-700 dark:text-emerald-300",
    icon: Gavel,
  },
] as const;

export default function DashboardHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [competencia, setCompetencia] = useState<string>("");
  const [activeTab, setActiveTab] = useState("gerente");
  const [filtroHospitalEsteira, setFiltroHospitalEsteira] = useState<string>("todos");

  // Usar o contexto de estabelecimento
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;

  const { data, isLoading, error } = trpc.dashboardHome.resumoGeral.useQuery({
    estabelecimentoId,
    competencia: competencia && competencia !== "todas" ? competencia : undefined,
  });

  const estabelecimentosLista = data?.faturamentoPorEstabelecimento || [];

  // Dados da Esteira filtrados por hospital (quando o usuário seleciona um hospital no filtro rápido da Esteira) ou consolidados
  const dadosEsteiraExibicao = useMemo(() => {
    const padrao = data?.esteiraFaturamento;
    if (!padrao) {
      return {
        totalGeralContas: 0,
        totalGeralValor: 0,
        contasParadasSetores: 0,
        valorParadoSetores: 0,
        contasFaturadas: 0,
        valorFaturadoEsteira: 0,
        contasEnviadasConvenio: 0,
        valorEnviadoConvenio: 0,
        totalEmFila: 0,
        totalEmAndamento: 0,
        totalDevolvidasErro: 0,
        porSetor: {} as Record<string, any>,
      };
    }

    if (filtroHospitalEsteira === "todos") {
      return {
        ...padrao.resumoProducao,
        porSetor: padrao.porSetor || {},
      };
    }

    const hospId = Number(filtroHospitalEsteira);
    const hosp = estabelecimentosLista.find((e) => e.estabelecimentoId === hospId);
    if (!hosp) {
      return {
        ...padrao.resumoProducao,
        porSetor: padrao.porSetor || {},
      };
    }

    return {
      totalGeralContas: hosp.contasNaEsteira,
      totalGeralValor: hosp.valorTotalEsteira,
      contasParadasSetores: hosp.contasParadasSetores,
      valorParadoSetores: hosp.valorParadoSetores,
      contasFaturadas: hosp.contasFaturadasEsteira,
      valorFaturadoEsteira: hosp.valorTotalEsteira,
      contasEnviadasConvenio: hosp.contasConcluidasEsteira,
      valorEnviadoConvenio: hosp.porSetor?.enviado_convenio?.valorTotal || 0,
      totalEmFila: hosp.emFila,
      totalEmAndamento: hosp.emAndamento,
      totalDevolvidasErro: hosp.devolvidasErro,
      porSetor: hosp.porSetor || {},
    };
  }, [data?.esteiraFaturamento, estabelecimentosLista, filtroHospitalEsteira]);

  // Totais consolidados de todos os estabelecimentos para a tabela de Faturamento por Estabelecimento
  const totaisEstabelecimentos = useMemo(() => {
    return estabelecimentosLista.reduce(
      (acc, est) => ({
        contasNaEsteira: acc.contasNaEsteira + (est.contasNaEsteira || 0),
        contasParadasSetores: acc.contasParadasSetores + (est.contasParadasSetores || 0),
        valorParadoSetores: acc.valorParadoSetores + (est.valorParadoSetores || 0),
        contasConcluidasEsteira: acc.contasConcluidasEsteira + (est.contasConcluidasEsteira || 0),
        quantidadeFaturada: acc.quantidadeFaturada + (est.quantidadeFaturada || 0),
        valorFaturado: acc.valorFaturado + (est.valorFaturado || 0),
        totalItens: acc.totalItens + (est.totalItens || 0),
      }),
      {
        contasNaEsteira: 0,
        contasParadasSetores: 0,
        valorParadoSetores: 0,
        contasConcluidasEsteira: 0,
        quantidadeFaturada: 0,
        valorFaturado: 0,
        totalItens: 0,
      }
    );
  }, [estabelecimentosLista]);

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
              {error ? `Erro ao carregar dados: ${error.message}` : "Não há dados de faturamento para este estabelecimento ainda."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { faturista, recursoGlosa, fluxoPipeline, conciliacao, esteiraFaturamento } = data;
  const taxaConciliacao =
    conciliacao.totalItens > 0 ? (conciliacao.conciliados / conciliacao.totalItens) * 100 : 0;
  const taxaRecuperacao =
    recursoGlosa.valorTotalGlosado > 0
      ? (recursoGlosa.valorTotalRecuperado / recursoGlosa.valorTotalGlosado) * 100
      : 0;

  const etapasHistorico = esteiraFaturamento?.resumoProducao?.etapasHistorico || {
    recepcionadas: 0,
    faturadas: 0,
    auditadasInterna: 0,
    auditadasExterna: 0,
    limpasEnviadas: 0,
  };
  const producaoColaboradores = esteiraFaturamento?.producaoPorColaborador || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            {estabelecimentoAtual?.nome && (
              <Badge variant="outline" className="text-xs font-medium">
                {estabelecimentoAtual.nome}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">Bem-vindo, {user?.name || "Usuário"}</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/fabrica-faturamento")}
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          >
            <Factory className="h-4 w-4" />
            Abrir Esteira de Faturamento
          </Button>
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

        {/* ===== ABA GERENTE (TELA INICIAL PADRÃO) ===== */}
        <TabsContent value="gerente" className="space-y-6 mt-4">
          {/* KPIs principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Faturado</p>
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(faturista.valorTotalFaturado)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {faturista.totalContas.toLocaleString("pt-BR")} contas faturadas
                    </p>
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
                    <p className="text-sm text-muted-foreground">Contas Paradas nos Setores</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {dadosEsteiraExibicao.contasParadasSetores.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dadosEsteiraExibicao.totalEmFila} na fila • {dadosEsteiraExibicao.totalEmAndamento} em andamento
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Factory className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Conciliação / Glosas</p>
                    <p className="text-2xl font-bold text-foreground">
                      {taxaConciliacao.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Glosas: {formatCurrency(conciliacao.totalGlosa)} ({conciliacao.glosados.toLocaleString("pt-BR")} itens)
                    </p>
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
                    <p className="text-sm text-muted-foreground">Recuperação de Glosas</p>
                    <p className="text-2xl font-bold text-foreground">
                      {taxaRecuperacao.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(recursoGlosa.valorTotalRecuperado)} recuperado
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ===== BLOCO 1: ESTEIRA DE FATURAMENTO & CONTAS PARADAS NOS SETORES ===== */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Factory className="h-5 w-5 text-primary" />
                    Esteira de Faturamento — Produção & Contas Paradas nos Setores
                  </CardTitle>
                  <CardDescription>
                    Visão em tempo real da produção da esteira e quantidade de contas paradas em cada setor operacional
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filtroHospitalEsteira} onValueChange={setFiltroHospitalEsteira}>
                    <SelectTrigger className="w-[230px] h-9 text-xs">
                      <SelectValue placeholder="Filtrar Estabelecimento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os Estabelecimentos</SelectItem>
                      {estabelecimentosLista.map((est) => (
                        <SelectItem key={est.estabelecimentoId} value={String(est.estabelecimentoId)}>
                          {est.estabelecimentoNome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setLocation("/fabrica-faturamento")}
                    className="gap-1.5 text-xs"
                  >
                    Ver Esteira Completa
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Resumo de Produção da Esteira */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-muted/40 border flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Total na Esteira</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">
                      {dadosEsteiraExibicao.totalGeralContas.toLocaleString("pt-BR")} contas
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(dadosEsteiraExibicao.totalGeralValor)}
                    </p>
                  </div>
                  <Layers className="h-5 w-5 text-primary opacity-80" />
                </div>

                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Paradas nos Setores (1 a 5)
                    </p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-0.5">
                      {dadosEsteiraExibicao.contasParadasSetores.toLocaleString("pt-BR")} contas
                    </p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                      {formatCurrency(dadosEsteiraExibicao.valorParadoSetores)} em aberto
                    </p>
                  </div>
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>

                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      Faturadas na Esteira
                    </p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                      {dadosEsteiraExibicao.contasFaturadas.toLocaleString("pt-BR")} contas
                    </p>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                      {formatCurrency(dadosEsteiraExibicao.valorFaturadoEsteira)}
                    </p>
                  </div>
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>

                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Enviadas / Concluídas
                    </p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {dadosEsteiraExibicao.contasEnviadasConvenio.toLocaleString("pt-BR")} contas
                    </p>
                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                      {dadosEsteiraExibicao.totalDevolvidasErro > 0
                        ? `⚠️ ${dadosEsteiraExibicao.totalDevolvidasErro} devolvida(s) c/ erro`
                        : formatCurrency(dadosEsteiraExibicao.valorEnviadoConvenio)}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              {/* Cards dos 6 Setores da Esteira */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    Quantidade de Contas Paradas por Setor
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Clique em qualquer setor para abrir sua fila na Esteira
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  {SETORES_ESTEIRA_HOME.map((setor) => {
                    const info = dadosEsteiraExibicao.porSetor?.[setor.id] || {
                      totalContas: 0,
                      emFila: 0,
                      emAndamento: 0,
                      devolvidasErro: 0,
                      valorTotal: 0,
                      mediaHorasNoSetor: 0,
                    };
                    const Icon = setor.icon;

                    return (
                      <div
                        key={setor.id}
                        onClick={() =>
                          setLocation(`/fabrica-faturamento?aba=esteira&setor=${setor.id}`)
                        }
                        className={`cursor-pointer rounded-xl border border-t-4 ${setor.corBorda} bg-card p-3.5 transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-semibold text-foreground leading-tight">
                              {setor.nome}
                            </span>
                            <div
                              className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${setor.corIcone}`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                          </div>

                          <div className="my-1.5">
                            <div className="flex items-baseline gap-1.5">
                              <span className={`text-2xl font-extrabold ${setor.corDestaque}`}>
                                {Number(info.totalContas || 0).toLocaleString("pt-BR")}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {setor.parado ? "paradas" : "concluídas"}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-foreground/90 mt-0.5">
                              {formatCurrency(info.valorTotal)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2 mt-2 border-t border-border/60">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Fila: <strong className="text-foreground">{info.emFila || 0}</strong></span>
                            <span>Andam.: <strong className="text-foreground">{info.emAndamento || 0}</strong></span>
                          </div>

                          {info.devolvidasErro > 0 && (
                            <div className="text-[11px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {info.devolvidasErro} devolvida(s) c/ erro
                            </div>
                          )}

                          {setor.parado && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Timer className="h-3 w-3" />
                                Tempo médio:
                              </span>
                              <span className="font-medium text-foreground">
                                {info.totalContas > 0 ? formatHorasParado(info.mediaHorasNoSetor) : "-"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Produção Acumulada por Etapa (Histórico de Movimentações) */}
              <div className="rounded-lg bg-muted/30 border p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Produção Realizada pela Equipe por Etapa
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Movimentações registradas na Esteira
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="p-2.5 rounded-md bg-background border text-center">
                    <p className="text-lg font-bold text-foreground">
                      {etapasHistorico.recepcionadas.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Recepcionadas</p>
                  </div>
                  <div className="p-2.5 rounded-md bg-background border text-center">
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {etapasHistorico.faturadas.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Faturadas (XML)</p>
                  </div>
                  <div className="p-2.5 rounded-md bg-background border text-center">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {etapasHistorico.auditadasInterna.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Auditadas (Interna)</p>
                  </div>
                  <div className="p-2.5 rounded-md bg-background border text-center">
                    <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {etapasHistorico.auditadasExterna.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Auditadas (Externa)</p>
                  </div>
                  <div className="p-2.5 rounded-md bg-background border text-center col-span-2 sm:col-span-1">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {etapasHistorico.limpasEnviadas.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Limpas e Enviadas</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ===== BLOCO 2: VALORES E QUANTIDADE FATURADOS POR ESTABELECIMENTO ===== */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    Valores e Quantidade Faturados por Estabelecimento
                  </CardTitle>
                  <CardDescription>
                    Consolidado de contas faturadas, valores faturados e contas paradas nos setores por unidade hospitalar
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant="secondary" className="font-semibold">
                    Total Faturado: {formatCurrency(totaisEstabelecimentos.valorFaturado)}
                  </Badge>
                  <Badge variant="outline" className="font-semibold">
                    {totaisEstabelecimentos.quantidadeFaturada.toLocaleString("pt-BR")} contas faturadas
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {estabelecimentosLista.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum estabelecimento encontrado.
                </p>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Estabelecimento</TableHead>
                        <TableHead className="text-center">Contas Paradas nos Setores</TableHead>
                        <TableHead className="text-center">Enviadas / Concluídas</TableHead>
                        <TableHead className="text-right">Qtd. Contas Faturadas</TableHead>
                        <TableHead className="text-right">Valor Faturado</TableHead>
                        <TableHead className="text-right">Ticket Médio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estabelecimentosLista.map((est) => {
                        const percValor =
                          totaisEstabelecimentos.valorFaturado > 0
                            ? (est.valorFaturado / totaisEstabelecimentos.valorFaturado) * 100
                            : 0;
                        const ticketMedio =
                          est.quantidadeFaturada > 0
                            ? est.valorFaturado / est.quantidadeFaturada
                            : 0;
                        const isSelecionado =
                          estabelecimentoId > 0 && est.estabelecimentoId === estabelecimentoId;

                        return (
                          <TableRow
                            key={est.estabelecimentoId}
                            className={isSelecionado ? "bg-primary/5" : ""}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span>{est.estabelecimentoNome}</span>
                                    {isSelecionado && (
                                      <Badge variant="outline" className="text-[10px] py-0 h-4">
                                        Atual
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="w-36 mt-1">
                                    <Progress value={percValor} className="h-1.5" />
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge
                                  variant={est.contasParadasSetores > 0 ? "secondary" : "outline"}
                                  className={
                                    est.contasParadasSetores > 0
                                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {est.contasParadasSetores.toLocaleString("pt-BR")} paradas
                                </Badge>
                                {est.contasParadasSetores > 0 && (
                                  <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                    {(est.porSetor?.recepcao?.totalContas || 0) > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-muted">
                                        Rec: {est.porSetor.recepcao.totalContas}
                                      </span>
                                    )}
                                    {(est.porSetor?.faturamento?.totalContas || 0) > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        Fat: {est.porSetor.faturamento.totalContas}
                                      </span>
                                    )}
                                    {(est.porSetor?.auditoria_interna?.totalContas || 0) > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                        Aud.I: {est.porSetor.auditoria_interna.totalContas}
                                      </span>
                                    )}
                                    {(est.porSetor?.auditoria_externa?.totalContas || 0) > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                        Aud.E: {est.porSetor.auditoria_externa.totalContas}
                                      </span>
                                    )}
                                    {(est.porSetor?.limpeza_prontuario?.totalContas || 0) > 0 && (
                                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                                        Limp: {est.porSetor.limpeza_prontuario.totalContas}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-center">
                              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                {est.contasConcluidasEsteira.toLocaleString("pt-BR")}
                              </span>
                            </TableCell>

                            <TableCell className="text-right">
                              <span className="text-sm font-bold text-foreground">
                                {est.quantidadeFaturada.toLocaleString("pt-BR")}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                {est.totalItens.toLocaleString("pt-BR")} itens
                              </span>
                            </TableCell>

                            <TableCell className="text-right">
                              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(est.valorFaturado)}
                              </span>
                              <span className="text-xs text-muted-foreground block">
                                {percValor.toFixed(1)}% do total
                              </span>
                            </TableCell>

                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatCurrency(ticketMedio)}
                            </TableCell>
                          </TableRow>
                        );
                      })}

                      {/* Linha de Total Geral */}
                      <TableRow className="bg-muted/60 font-bold border-t-2">
                        <TableCell>TOTAL GERAL ({estabelecimentosLista.length} estabelecimentos)</TableCell>
                        <TableCell className="text-center text-amber-600 dark:text-amber-400">
                          {totaisEstabelecimentos.contasParadasSetores.toLocaleString("pt-BR")} paradas
                        </TableCell>
                        <TableCell className="text-center text-emerald-600 dark:text-emerald-400">
                          {totaisEstabelecimentos.contasConcluidasEsteira.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          {totaisEstabelecimentos.quantidadeFaturada.toLocaleString("pt-BR")} contas
                        </TableCell>
                        <TableCell className="text-right text-blue-600 dark:text-blue-400">
                          {formatCurrency(totaisEstabelecimentos.valorFaturado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            totaisEstabelecimentos.quantidadeFaturada > 0
                              ? totaisEstabelecimentos.valorFaturado /
                                  totaisEstabelecimentos.quantidadeFaturada
                              : 0
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline do Processo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Pipeline do Processo
              </CardTitle>
              <CardDescription>
                Fluxo completo: Faturamento → NF → Demonstrativo → Recurso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <FileText className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    {fluxoPipeline.totalGuiasFaturadas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Guias Faturadas</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <FileText className="h-6 w-6 mx-auto text-indigo-600 mb-1" />
                  <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                    {fluxoPipeline.totalNfEmitidas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">NFs Emitidas</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-green-600 mb-1" />
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">
                    {fluxoPipeline.totalDemonstrativosImportados.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">Demonstrativos</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <Scale className="h-6 w-6 mx-auto text-purple-600 mb-1" />
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                    {fluxoPipeline.totalRecursosFeitos.toLocaleString("pt-BR")}
                  </p>
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
                  <span className="font-medium">{conciliacao.conciliados.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Glosas
                  </span>
                  <span className="font-medium">{conciliacao.glosados.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Sem Pagamento
                  </span>
                  <span className="font-medium">{conciliacao.semPagamento.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-teal-500" />
                    Acréscimos
                  </span>
                  <span className="font-medium">{conciliacao.acrescimos.toLocaleString("pt-BR")}</span>
                </div>
                <Progress value={taxaConciliacao} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {taxaConciliacao.toFixed(1)}% conciliado
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Convênios</CardTitle>
                <CardDescription>Maiores valores faturados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {faturista.conveniosTop.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhum convênio faturado no período selecionado.
                    </p>
                  ) : (
                    faturista.conveniosTop.map((c, i) => (
                      <div key={`${c.convenio}-${i}`} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">
                            {i + 1}.
                          </span>
                          <span className="text-sm font-medium">{c.convenio}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{formatCurrency(c.totalFaturado)}</p>
                          <p className="text-xs text-muted-foreground">{c.totalGuias} guias</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== ABA FATURISTA ===== */}
        <TabsContent value="faturista" className="space-y-6 mt-4">
          {/* KPIs Faturamento */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total Faturado</p>
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(faturista.valorTotalFaturado)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Competência: {formatCompetencia(faturista.competenciaAtual) || "Todas"}
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
                    <p className="text-2xl font-bold text-foreground">
                      {faturista.totalContas.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {faturista.totalItens.toLocaleString("pt-BR")} itens
                    </p>
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
                    <p className="text-sm text-muted-foreground">Paradas na Esteira</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {dadosEsteiraExibicao.contasParadasSetores.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dadosEsteiraExibicao.totalDevolvidasErro} devolvidas c/ erro
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Factory className="h-6 w-6 text-amber-600" />
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
                      {faturista.totalContas > 0
                        ? formatCurrency(faturista.valorTotalFaturado / faturista.totalContas)
                        : "R$ 0,00"}
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

          {/* Produção por Colaborador na Esteira */}
          {producaoColaboradores.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Produção na Esteira por Colaborador
                </CardTitle>
                <CardDescription>
                  Quantidade de contas recepcionadas, faturadas, auditadas e enviadas na Esteira de Faturamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Colaborador</TableHead>
                        <TableHead className="text-center">Recepcionadas</TableHead>
                        <TableHead className="text-center">Faturadas</TableHead>
                        <TableHead className="text-center">Audit. Interna</TableHead>
                        <TableHead className="text-center">Audit. Externa</TableHead>
                        <TableHead className="text-center">Enviadas</TableHead>
                        <TableHead className="text-right">Valor Faturado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {producaoColaboradores.map((colab, idx) => (
                        <TableRow key={`${colab.usuarioId}-${idx}`}>
                          <TableCell className="font-medium">{colab.usuarioNome}</TableCell>
                          <TableCell className="text-center">{colab.contasRecepcionadas}</TableCell>
                          <TableCell className="text-center font-bold text-blue-600 dark:text-blue-400">
                            {colab.contasFaturadas}
                          </TableCell>
                          <TableCell className="text-center">{colab.contasAuditadasInterna}</TableCell>
                          <TableCell className="text-center">{colab.contasAuditadasExterna}</TableCell>
                          <TableCell className="text-center text-emerald-600 dark:text-emerald-400">
                            {colab.contasLimpasEnviadas}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(colab.valorFaturado)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

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
                  const percentual =
                    faturista.valorTotalFaturado > 0
                      ? (c.totalFaturado / faturista.valorTotalFaturado) * 100
                      : 0;
                  return (
                    <div key={`${c.convenio}-${i}`} className="space-y-1">
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
                {faturista.evolucaoMensal.map((e) => (
                  <div key={e.competencia} className="text-center p-3 rounded-lg bg-muted/50">
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
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(recursoGlosa.valorTotalGlosado)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {recursoGlosa.totalRecursos} recursos
                    </p>
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
                    <p className="text-2xl font-bold text-orange-600">
                      {formatCurrency(recursoGlosa.valorTotalRecursado)}
                    </p>
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
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(recursoGlosa.valorTotalRecuperado)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {taxaRecuperacao.toFixed(1)}% taxa
                    </p>
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
                    <p className="text-2xl font-bold text-amber-600">
                      {recursoGlosa.enviado + recursoGlosa.emAnalise}
                    </p>
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
                  <p className="text-2xl font-bold text-emerald-700">
                    {recursoGlosa.deferidoParcial}
                  </p>
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
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium">Guia {r.guiaNumero}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.pacienteNome} - {r.convenioNome}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">
                          {formatCurrency(r.valorGlosado)}
                        </span>
                        <Badge
                          variant={
                            r.diasRestantes <= 7
                              ? "destructive"
                              : r.diasRestantes <= 15
                                ? "secondary"
                                : "outline"
                          }
                        >
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
              <CardDescription>
                Faturado → NF Emitida → Demonstrativo Importado → Recurso Feito
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {fluxoPipeline.totalGuiasFaturadas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-blue-600">Faturado</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                    {fluxoPipeline.totalNfEmitidas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-indigo-600">NF Emitida</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">
                    {fluxoPipeline.totalDemonstrativosImportados.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-green-600">Demonstrativo</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                    {fluxoPipeline.totalRecursosFeitos.toLocaleString("pt-BR")}
                  </p>
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
