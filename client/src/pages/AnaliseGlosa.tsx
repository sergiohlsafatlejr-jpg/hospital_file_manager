import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { 
  AlertTriangle, 
  TrendingDown, 
  Building2,
  RefreshCw,
  Download,
  BarChart3,
  PieChart,
  FileWarning,
  Target,
  Activity,
  FlaskConical,
  Pill,
  Stethoscope,
  Receipt,
  BedDouble,
  HelpCircle,
  Calendar,
  Filter,
  User
} from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Gavel, Search, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

const CATEGORIA_COLORS: { [key: string]: string } = {
  "Valor Divergente": "#ef4444",
  "Procedimento Não Autorizado": "#f97316",
  "Documentação Incompleta": "#eab308",
  "Prazo Excedido": "#8b5cf6",
  "Duplicidade": "#ec4899",
  "Código Inválido": "#06b6d4",
  "Quantidade Excedente": "#22c55e",
  "Paciente Não Elegível": "#3b82f6",
  "Outros": "#6b7280",
};

const TIPO_ICONS: { [key: string]: React.ReactNode } = {
  "Exames": <FlaskConical className="h-4 w-4" />,
  "Mat/Med": <Pill className="h-4 w-4" />,
  "Procedimentos": <Stethoscope className="h-4 w-4" />,
  "Taxas": <Receipt className="h-4 w-4" />,
  "Diárias": <BedDouble className="h-4 w-4" />,
  "Outros": <HelpCircle className="h-4 w-4" />,
};

const TIPO_COLORS: { [key: string]: string } = {
  "Exames": "#3b82f6",
  "Mat/Med": "#22c55e",
  "Procedimentos": "#8b5cf6",
  "Taxas": "#f97316",
  "Diárias": "#ec4899",
  "Outros": "#6b7280",
};

export default function AnaliseGlosa() {
  const { user } = useAuth();
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [periodoMeses, setPeriodoMeses] = useState<string>("12");

  // Filtros para itens glosados
  const [convenioItens, setConvenioItens] = useState<string>("todos");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [buscaItens, setBuscaItens] = useState("");
  const [dataReferenciaInicio, setDataReferenciaInicio] = useState<string>("");
  const [dataReferenciaFim, setDataReferenciaFim] = useState<string>("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [dialogRecurso, setDialogRecurso] = useState(false);
  const [recursoForm, setRecursoForm] = useState({ motivo: "", argumento: "", prioridade: "media" as "baixa" | "media" | "alta" | "urgente" });
  const [carregandoSugestao, setCarregandoSugestao] = useState(false);

  // Buscar dados gerais
  const { data: glosaPorConvenio, isLoading: loadingConvenio, refetch: refetchConvenio } = 
    trpc.glosa.porConvenio.useQuery();
  
  const { data: glosaPorProcedimento, isLoading: loadingProcedimento, refetch: refetchProcedimento } = 
    trpc.glosa.porProcedimento.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      limit: 20,
    });

  const { data: tendenciaGlosa, isLoading: loadingTendencia, refetch: refetchTendencia } = 
    trpc.glosa.tendencia.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      meses: parseInt(periodoMeses),
    });

  const { data: resumoGlosa, isLoading: loadingResumo } = 
    trpc.glosa.resumo.useQuery();

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar itens glosados com novos filtros
  const { data: itensGlosados, isLoading: loadingItens, refetch: refetchItens } = 
    trpc.glosa.itensGlosados.useQuery({
      convenioId: convenioItens !== "todos" ? parseInt(convenioItens) : undefined,
      tipo: tipoFiltro !== "todos" ? tipoFiltro : undefined,
      search: buscaItens || undefined,
      dataReferenciaInicio: dataReferenciaInicio ? new Date(dataReferenciaInicio) : undefined,
      dataReferenciaFim: dataReferenciaFim ? new Date(dataReferenciaFim) : undefined,
      page: paginaAtual,
      pageSize: 50,
    });

  const criarRecursoBatchMutation = trpc.recursos.createBatch.useMutation({
    onSuccess: (data) => {
      if (data.sucesso > 0) {
        toast.success(`${data.sucesso} recurso(s) criado(s) com sucesso!`);
      }
      if (data.falhas > 0) {
        toast.error(`${data.falhas} recurso(s) falharam`);
      }
      setItensSelecionados(new Set());
      setDialogRecurso(false);
      setRecursoForm({ motivo: "", argumento: "", prioridade: "media" });
    },
    onError: (error) => toast.error(error.message),
  });

  const sugerirArgumentoMutation = trpc.recursos.sugerirArgumentoIA.useMutation({
    onSuccess: (data) => {
      if (data.argumento) {
        // Extrair texto do argumento (pode ser string ou array de content)
        const argumentoTexto = typeof data.argumento === 'string' 
          ? data.argumento 
          : Array.isArray(data.argumento) 
            ? data.argumento.map((c: any) => c.text || '').join('')
            : String(data.argumento);
        setRecursoForm(prev => ({ ...prev, argumento: argumentoTexto }));
        toast.success("Sugestão de argumento gerada com IA!");
      } else {
        toast.info("Não foi possível gerar sugestão. Tente inserir manualmente.");
      }
      setCarregandoSugestao(false);
    },
    onError: (error) => {
      toast.error("Erro ao gerar sugestão: " + error.message);
      setCarregandoSugestao(false);
    },
  });

  const toggleItemSelecionado = (id: number) => {
    const newSet = new Set(itensSelecionados);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setItensSelecionados(newSet);
  };

  const selecionarTodos = () => {
    if (!itensGlosados?.items) return;
    if (itensSelecionados.size === itensGlosados.items.length) {
      setItensSelecionados(new Set());
    } else {
      setItensSelecionados(new Set(itensGlosados.items.map(i => i.id)));
    }
  };

  const abrirDialogRecurso = () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item para criar recurso");
      return;
    }
    const primeiroItem = itensGlosados?.items?.find(i => itensSelecionados.has(i.id));
    const motivoGlosa = primeiroItem?.motivoGlosa || "";
    
    setRecursoForm({
      motivo: motivoGlosa,
      argumento: "",
      prioridade: "media",
    });
    setDialogRecurso(true);
  };

  const handleCriarRecurso = () => {
    if (!recursoForm.argumento.trim()) {
      toast.error("Informe o argumento do recurso");
      return;
    }
    const itens = itensGlosados?.items?.filter(i => itensSelecionados.has(i.id)) || [];
    
    criarRecursoBatchMutation.mutate({
      itens: itens.map(item => ({
        convenioId: item.convenioId,
        codigoProcedimento: item.codigo,
        descricaoProcedimento: item.descricao || "",
        valorGlosado: item.valorGlosado.toString(),
        valorCobrado: item.valorCobrado.toString(),
        motivoGlosaConvenio: item.motivoGlosa,
        pacienteNome: item.pacienteNome,
        guiaNumero: item.guiaNumero,
      })),
      justificativaRecurso: `${recursoForm.motivo}\n\n${recursoForm.argumento}`,
      prioridade: recursoForm.prioridade,
    });
  };

  const handleSugerirArgumento = () => {
    const itens = itensGlosados?.items?.filter(i => itensSelecionados.has(i.id)) || [];
    if (itens.length === 0) return;
    
    const primeiroItem = itens[0];
    const codigoGlosa = primeiroItem.codigoGlosa || primeiroItem.motivoGlosa?.match(/\d{4}/)?.[0] || "0000";
    
    setCarregandoSugestao(true);
    sugerirArgumentoMutation.mutate({
      codigoGlosa,
      convenioId: primeiroItem.convenioId,
      codigoProcedimento: primeiroItem.codigo,
      valorGlosado: primeiroItem.valorGlosado.toString(),
    });
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const handleRefresh = () => {
    refetchConvenio();
    refetchProcedimento();
    refetchTendencia();
    refetchItens();
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Aba 1: Itens Glosados
    if (itensGlosados?.items) {
      const itensData = itensGlosados.items.map(item => ({
        "Código": item.codigo,
        "Descrição": item.descricao,
        "Tipo": item.tipo,
        "Paciente": item.pacienteNome,
        "Guia": item.guiaNumero,
        "Convênio": item.convenioNome,
        "Data Execução": item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString("pt-BR") : "-",
        "Valor Cobrado": item.valorCobrado,
        "Valor Pago": item.valorPago,
        "Valor Glosado": item.valorGlosado,
        "Motivo Glosa": item.motivoGlosa,
        "Médico": item.nomeMedico,
        "CRM": item.crmMedico,
      }));
      const wsItens = XLSX.utils.json_to_sheet(itensData);
      XLSX.utils.book_append_sheet(wb, wsItens, "Itens Glosados");
    }

    // Aba 2: Glosa por Convênio
    if (glosaPorConvenio) {
      const convData = glosaPorConvenio.map(item => ({
        "Convênio": item.convenioNome,
        "Total Divergências": item.totalDivergencias,
        "Valor Glosado": item.valorGlosado,
        "Motivo Principal": item.motivosPrincipais[0]?.categoriaGlosa || "-",
        "% Motivo Principal": item.motivosPrincipais[0]?.percentual?.toFixed(1) || "0",
      }));
      const wsConv = XLSX.utils.json_to_sheet(convData);
      XLSX.utils.book_append_sheet(wb, wsConv, "Glosa por Convênio");
    }

    // Aba 3: Procedimentos Mais Glosados
    if (glosaPorProcedimento) {
      const procData = glosaPorProcedimento.map(item => ({
        "Código": item.codigo,
        "Descrição": item.descricao,
        "Qtd Glosas": item.quantidadeGlosas,
        "Valor Glosado": item.valorGlosado,
        "Motivo Principal": item.motivoPrincipal,
      }));
      const wsProc = XLSX.utils.json_to_sheet(procData);
      XLSX.utils.book_append_sheet(wb, wsProc, "Procedimentos Glosados");
    }

    // Aba 4: Tendência Mensal
    if (tendenciaGlosa) {
      const tendData = tendenciaGlosa.map(item => ({
        "Mês/Ano": `${item.mes}/${item.ano}`,
        "Total Glosas": item.totalGlosas,
        "Valor Glosado": item.valorGlosado,
      }));
      const wsTend = XLSX.utils.json_to_sheet(tendData);
      XLSX.utils.book_append_sheet(wb, wsTend, "Tendência Mensal");
    }

    // Aba 5: Resumo por Categoria
    if (resumoGlosa?.categorias) {
      const catData = resumoGlosa.categorias.map(item => ({
        "Categoria": item.categoria,
        "Quantidade": item.quantidade,
        "Valor": item.valor,
        "Percentual": item.percentual.toFixed(1) + "%",
      }));
      const wsCat = XLSX.utils.json_to_sheet(catData);
      XLSX.utils.book_append_sheet(wb, wsCat, "Categorias de Glosa");
    }

    XLSX.writeFile(wb, `analise_glosa_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Preparar dados para gráficos
  const pieData = resumoGlosa?.categorias?.map(item => ({
    name: item.categoria,
    value: item.quantidade,
    valor: item.valor,
  })) || [];

  const barConvenioData = glosaPorConvenio?.map(item => ({
    name: item.convenioNome.length > 12 ? item.convenioNome.substring(0, 12) + "..." : item.convenioNome,
    divergencias: item.totalDivergencias,
    valor: item.valorGlosado,
  })) || [];

  const lineData = tendenciaGlosa?.map(item => ({
    name: item.mes,
    glosas: item.totalGlosas,
    valor: item.valorGlosado,
  })) || [];

  // Dados para gráfico de tipos
  const tipoData = itensGlosados?.resumo?.porTipo?.map(item => ({
    name: item.tipo,
    value: item.quantidade,
    valor: item.valorGlosado,
  })) || [];

  const isLoading = loadingConvenio || loadingProcedimento || loadingTendencia || loadingResumo;

  // Função para obter ícone e cor do tipo
  const getTipoInfo = (tipo: string) => {
    const tipoLabel = {
      exame: "Exames",
      mat_med: "Mat/Med",
      procedimento: "Procedimentos",
      taxa: "Taxas",
      diaria: "Diárias",
      outros: "Outros",
    }[tipo] || tipo;
    
    return {
      label: tipoLabel,
      icon: TIPO_ICONS[tipoLabel] || <HelpCircle className="h-4 w-4" />,
      color: TIPO_COLORS[tipoLabel] || "#6b7280",
    };
  };

  const totalPaginas = Math.ceil((itensGlosados?.total || 0) / 50);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Análise de Glosa</h1>
            <p className="text-muted-foreground">
              Identifique padrões e principais motivos de glosa por convênio
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Glosado</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {loadingResumo ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(resumoGlosa?.valorTotalGlosado || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {resumoGlosa?.totalDivergencias || 0} divergências registradas
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Itens Glosados</CardTitle>
              <FileWarning className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {loadingItens ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {itensGlosados?.resumo?.totalItens || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPercent(itensGlosados?.resumo?.percentualGlosa || 0)} do valor cobrado
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categoria Principal</CardTitle>
              <Target className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              {loadingResumo ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-lg font-bold truncate">
                    {resumoGlosa?.categoriaPrincipal?.nome || "-"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {resumoGlosa?.categoriaPrincipal?.quantidade || 0} ocorrências ({formatPercent(resumoGlosa?.categoriaPrincipal?.percentual || 0)})
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Convênios Afetados</CardTitle>
              <Building2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {loadingConvenio ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {glosaPorConvenio?.length || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    convênios com glosas registradas
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filtros Gerais */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-2 block">Convênio (Gráficos)</label>
                <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {convenios?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[150px]">
                <label className="text-sm font-medium mb-2 block">Período</label>
                <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
                  <SelectTrigger>
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Últimos 3 meses</SelectItem>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs de Análise */}
        <Tabs defaultValue="itens" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="itens">Itens Glosados</TabsTrigger>
            <TabsTrigger value="categorias">Por Categoria</TabsTrigger>
            <TabsTrigger value="convenios">Por Convênio</TabsTrigger>
            <TabsTrigger value="procedimentos">Por Procedimento</TabsTrigger>
            <TabsTrigger value="tendencia">Tendência</TabsTrigger>
          </TabsList>

          {/* Tab: Itens Glosados - NOVA VERSÃO */}
          <TabsContent value="itens" className="space-y-4">
            {/* Filtros Específicos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Convênio</label>
                    <Select value={convenioItens} onValueChange={(v) => { setConvenioItens(v); setPaginaAtual(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os convênios</SelectItem>
                        {convenios?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Tipo</label>
                    <Select value={tipoFiltro} onValueChange={(v) => { setTipoFiltro(v); setPaginaAtual(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os tipos</SelectItem>
                        <SelectItem value="exame">Exames</SelectItem>
                        <SelectItem value="mat_med">Mat/Med</SelectItem>
                        <SelectItem value="procedimento">Procedimentos</SelectItem>
                        <SelectItem value="taxa">Taxas</SelectItem>
                        <SelectItem value="diaria">Diárias</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Data Ref. Início</label>
                    <Input
                      type="date"
                      value={dataReferenciaInicio}
                      onChange={(e) => { setDataReferenciaInicio(e.target.value); setPaginaAtual(1); }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Data Ref. Fim</label>
                    <Input
                      type="date"
                      value={dataReferenciaFim}
                      onChange={(e) => { setDataReferenciaFim(e.target.value); setPaginaAtual(1); }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Buscar</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Código, descrição, paciente..."
                        value={buscaItens}
                        onChange={(e) => { setBuscaItens(e.target.value); setPaginaAtual(1); }}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumo por Tipo */}
            {itensGlosados?.resumo && itensGlosados.resumo.totalItens > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {itensGlosados.resumo.porTipo.map((tipo) => (
                  <Card key={tipo.tipo} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => {
                    const tipoValue = tipo.tipo === "Exames" ? "exame" : 
                                      tipo.tipo === "Mat/Med" ? "mat_med" :
                                      tipo.tipo === "Procedimentos" ? "procedimento" :
                                      tipo.tipo === "Taxas" ? "taxa" :
                                      tipo.tipo === "Diárias" ? "diaria" : "outros";
                    setTipoFiltro(tipoValue);
                    setPaginaAtual(1);
                  }}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div style={{ color: TIPO_COLORS[tipo.tipo] || "#6b7280" }}>
                          {TIPO_ICONS[tipo.tipo] || <HelpCircle className="h-4 w-4" />}
                        </div>
                        <span className="text-sm font-medium">{tipo.tipo}</span>
                      </div>
                      <div className="text-lg font-bold">{tipo.quantidade}</div>
                      <div className="text-xs text-red-600">{formatCurrency(tipo.valorGlosado)}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Gavel className="h-5 w-5" />
                      Itens Glosados
                      {itensGlosados?.total ? (
                        <Badge variant="secondary" className="ml-2">
                          {itensGlosados.total} itens
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      {itensGlosados?.resumo ? (
                        <>
                          Total glosado: <span className="font-semibold text-red-600">{formatCurrency(itensGlosados.resumo.totalValorGlosado)}</span>
                          {" "}de {formatCurrency(itensGlosados.resumo.totalValorCobrado)} cobrados
                        </>
                      ) : (
                        "Selecione os itens para criar recursos de glosa em lote"
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selecionarTodos}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {itensSelecionados.size > 0 ? "Desmarcar Todos" : "Selecionar Todos"}
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={abrirDialogRecurso}
                      disabled={itensSelecionados.size === 0}
                    >
                      <Gavel className="h-4 w-4 mr-2" />
                      Criar Recurso ({itensSelecionados.size})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingItens ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : itensGlosados?.items && itensGlosados.items.length > 0 ? (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="w-[100px]">Tipo</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Convênio</TableHead>
                            <TableHead className="text-right">Cobrado</TableHead>
                            <TableHead className="text-right">Glosa</TableHead>
                            <TableHead>Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itensGlosados.items.map((item) => {
                            const tipoInfo = getTipoInfo(item.tipo);
                            return (
                              <TableRow 
                                key={item.id} 
                                className={`${itensSelecionados.has(item.id) ? "bg-muted/50" : ""} ${item.nomeMedico ? "border-l-2 border-l-blue-500" : ""}`}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={itensSelecionados.has(item.id)}
                                    onCheckedChange={() => toggleItemSelecionado(item.id)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant="outline" 
                                    className="flex items-center gap-1 w-fit"
                                    style={{ borderColor: tipoInfo.color, color: tipoInfo.color }}
                                  >
                                    {tipoInfo.icon}
                                    <span className="text-xs">{tipoInfo.label}</span>
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                                <TableCell className="max-w-[200px]">
                                  <div className="truncate" title={item.descricao}>{item.descricao}</div>
                                  {item.nomeMedico && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                      <User className="h-3 w-3" />
                                      {item.nomeMedico} {item.crmMedico && `(${item.crmMedico})`}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[150px]">
                                  <div className="truncate" title={item.pacienteNome}>{item.pacienteNome || "-"}</div>
                                  {item.guiaNumero && (
                                    <div className="text-xs text-muted-foreground">Guia: {item.guiaNumero}</div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="truncate max-w-[120px]" title={item.convenioNome}>{item.convenioNome}</div>
                                  {item.dataReferencia && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(item.dataReferencia).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(item.valorCobrado)}</TableCell>
                                <TableCell className="text-right font-medium text-red-600">
                                  {formatCurrency(item.valorGlosado)}
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                  <Badge variant="outline" className="text-xs" title={item.motivoGlosa}>
                                    {item.codigoGlosa && <span className="font-mono mr-1">{item.codigoGlosa}:</span>}
                                    {item.motivoGlosa.length > 25 ? item.motivoGlosa.substring(0, 25) + "..." : item.motivoGlosa}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginação */}
                    {totalPaginas > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <div className="text-sm text-muted-foreground">
                          Página {paginaAtual} de {totalPaginas} ({itensGlosados.total} itens)
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                            disabled={paginaAtual === 1}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                            disabled={paginaAtual === totalPaginas}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum item glosado encontrado</p>
                    <p className="text-sm mt-2">Importe arquivos retornados (PDF/Excel) dos convênios para visualizar as glosas</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Por Categoria */}
          <TabsContent value="categorias" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico de Pizza */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Distribuição por Categoria
                  </CardTitle>
                  <CardDescription>Principais motivos de glosa</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingResumo ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartsPie>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CATEGORIA_COLORS[entry.name] || COLORS[index % COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => [
                            `${value} ocorrências (${formatCurrency(props.payload.valor)})`,
                            props.payload.name
                          ]}
                        />
                        <Legend />
                      </RechartsPie>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <FileWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Nenhuma glosa registrada</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabela de Categorias */}
              <Card>
                <CardHeader>
                  <CardTitle>Detalhamento por Categoria</CardTitle>
                  <CardDescription>Ranking de motivos de glosa</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingResumo ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : resumoGlosa?.categorias && resumoGlosa.categorias.length > 0 ? (
                    <div className="space-y-4">
                      {resumoGlosa.categorias
                        .sort((a, b) => b.quantidade - a.quantidade)
                        .map((cat, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-sm">{cat.categoria}</span>
                              <span className="text-sm text-muted-foreground">
                                {cat.quantidade} ({formatPercent(cat.percentual)})
                              </span>
                            </div>
                            <Progress 
                              value={cat.percentual} 
                              className="h-2"
                              style={{ 
                                backgroundColor: "#e5e7eb",
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Valor: {formatCurrency(cat.valor)}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma categoria de glosa encontrada
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Por Convênio */}
          <TabsContent value="convenios" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico de Barras */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Glosa por Convênio
                  </CardTitle>
                  <CardDescription>Quantidade e valor de glosas</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingConvenio ? (
                    <Skeleton className="h-[300px] w-full" />
                  ) : barConvenioData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={barConvenioData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" orientation="left" stroke="#ef4444" />
                        <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number, name: string) => [
                          name === "valor" ? formatCurrency(value) : value,
                          name === "valor" ? "Valor Glosado" : "Divergências"
                        ]} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="divergencias" name="Divergências" fill="#ef4444" />
                        <Bar yAxisId="right" dataKey="valor" name="Valor Glosado" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Nenhum dado disponível
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabela de Convênios */}
              <Card>
                <CardHeader>
                  <CardTitle>Motivos por Convênio</CardTitle>
                  <CardDescription>Principais causas de glosa em cada convênio</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-y-auto">
                  {loadingConvenio ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : glosaPorConvenio && glosaPorConvenio.length > 0 ? (
                    <div className="space-y-4">
                      {glosaPorConvenio.map((conv) => (
                        <div key={conv.convenioId} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-semibold">{conv.convenioNome}</h4>
                              <p className="text-sm text-muted-foreground">
                                {conv.totalDivergencias} divergências • {formatCurrency(conv.valorGlosado)}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {conv.motivosPrincipais.slice(0, 3).map((motivo, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: CATEGORIA_COLORS[motivo.categoriaGlosa] || "#6b7280" }}
                                />
                                <span className="text-sm flex-1">{motivo.categoriaGlosa}</span>
                                <span className="text-sm text-muted-foreground">
                                  {formatPercent(motivo.percentual)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum convênio com glosas encontrado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab: Por Procedimento */}
          <TabsContent value="procedimentos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Procedimentos Mais Glosados
                </CardTitle>
                <CardDescription>
                  Top 20 procedimentos com maior incidência de glosa
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingProcedimento ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : glosaPorProcedimento && glosaPorProcedimento.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-center">Qtd Glosas</TableHead>
                          <TableHead className="text-right">Valor Glosado</TableHead>
                          <TableHead>Motivo Principal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {glosaPorProcedimento.map((proc, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono">{proc.codigo}</TableCell>
                            <TableCell className="max-w-[300px] truncate">{proc.descricao}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="destructive">{proc.quantidadeGlosas}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-red-600">
                              {formatCurrency(proc.valorGlosado)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {proc.motivoPrincipal || "-"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum procedimento glosado encontrado</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Tendência */}
          <TabsContent value="tendencia" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5" />
                  Tendência de Glosa
                </CardTitle>
                <CardDescription>
                  Evolução mensal das glosas nos últimos {periodoMeses} meses
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTendencia ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : lineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={lineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="left" orientation="left" stroke="#ef4444" />
                      <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number, name: string) => [
                        name === "valor" ? formatCurrency(value) : value,
                        name === "valor" ? "Valor Glosado" : "Qtd Glosas"
                      ]} />
                      <Legend />
                      <Area 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="glosas" 
                        name="Qtd Glosas" 
                        stroke="#ef4444" 
                        fill="#fecaca" 
                      />
                      <Area 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="valor" 
                        name="Valor Glosado" 
                        stroke="#3b82f6" 
                        fill="#bfdbfe" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <FileWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum dado de tendência disponível</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog para criar recurso em lote */}
        <Dialog open={dialogRecurso} onOpenChange={setDialogRecurso}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileWarning className="h-5 w-5" />
                Criar Recursos de Glosa em Lote
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <Label className="text-sm font-medium">Itens Selecionados</Label>
                <p className="text-2xl font-bold text-primary">
                  {itensSelecionados.size} item(s)
                </p>
                <p className="text-xs text-muted-foreground">
                  Todos os itens receberão o mesmo argumento de recurso
                </p>
              </div>
              
              <div>
                <Label>Motivo da Glosa</Label>
                <Input
                  value={recursoForm.motivo}
                  onChange={(e) => setRecursoForm({ ...recursoForm, motivo: e.target.value })}
                  placeholder="Código ou descrição do motivo"
                />
              </div>

              <div>
                <Label>Prioridade</Label>
                <Select 
                  value={recursoForm.prioridade} 
                  onValueChange={(v) => setRecursoForm({ ...recursoForm, prioridade: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Argumento do Recurso</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSugerirArgumento}
                    disabled={carregandoSugestao || sugerirArgumentoMutation.isPending}
                    className="gap-1"
                  >
                    {carregandoSugestao ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Gerando...</>
                    ) : (
                      <><Sparkles className="h-3 w-3" /> Sugerir com IA</>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={recursoForm.argumento}
                  onChange={(e) => setRecursoForm({ ...recursoForm, argumento: e.target.value })}
                  placeholder="Descreva a justificativa para contestar a glosa..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Clique em "Sugerir com IA" para gerar um argumento baseado no histórico de contestações bem-sucedidas
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogRecurso(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCriarRecurso} 
                disabled={criarRecursoBatchMutation.isPending || !recursoForm.argumento.trim()}
                className="gap-1"
              >
                {criarRecursoBatchMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                ) : (
                  <>Criar {itensSelecionados.size} Recurso(s)</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
