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
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Gavel, Search, CheckCircle2, Loader2, Sparkles, BookOpen, FileText, Send, XCircle, ThumbsUp, ThumbsDown, Brain, Zap, Clock } from "lucide-react";
import * as XLSX from "xlsx";
import { GLOSAS_TISS, GlosaInfo } from "../../../shared/glossaryGlosas";
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
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [periodoMeses, setPeriodoMeses] = useState<string>("12");

  // Filtros para itens glosados
  const [convenioItens, setConvenioItens] = useState<string>("todos");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [codigoGlosaFiltro, setCodigoGlosaFiltro] = useState<string>("todos");
  const [classificacaoFiltro, setClassificacaoFiltro] = useState<string>("todos");
  const [buscaItens, setBuscaItens] = useState("");
  const [dataReferenciaInicio, setDataReferenciaInicio] = useState<string>("");
  const [dataReferenciaFim, setDataReferenciaFim] = useState<string>("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [dialogRecurso, setDialogRecurso] = useState(false);
  const [recursoForm, setRecursoForm] = useState({ motivo: "", argumento: "", prioridade: "media" as "baixa" | "media" | "alta" | "urgente" });
  const [carregandoSugestao, setCarregandoSugestao] = useState(false);
  const [classificandoItem, setClassificandoItem] = useState<number | null>(null);
  const [dialogAceite, setDialogAceite] = useState(false);
  const [itemParaAceitar, setItemParaAceitar] = useState<number | null>(null);
  const [motivoAceiteForm, setMotivoAceiteForm] = useState("");
  const [paginaAceitos, setPaginaAceitos] = useState(1);
  const [dialogAceiteLote, setDialogAceiteLote] = useState(false);
  const [aceitandoLote, setAceitandoLote] = useState(false);

  // Buscar dados gerais
  const { data: glosaPorConvenio, isLoading: loadingConvenio, refetch: refetchConvenio } = 
    trpc.glosa.porConvenio.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
    });
  
  const { data: glosaPorProcedimento, isLoading: loadingProcedimento, refetch: refetchProcedimento } = 
    trpc.glosa.porProcedimento.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      limit: 20,
    });

  const { data: tendenciaGlosa, isLoading: loadingTendencia, refetch: refetchTendencia } = 
    trpc.glosa.tendencia.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      meses: parseInt(periodoMeses),
    });

  const { data: resumoGlosa, isLoading: loadingResumo } = 
    trpc.glosa.resumo.useQuery({
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
    });

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar itens glosados com novos filtros
  const { data: itensGlosados, isLoading: loadingItens, refetch: refetchItens } = 
    trpc.glosa.itensGlosados.useQuery({
      convenioId: convenioItens !== "todos" ? parseInt(convenioItens) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      tipo: tipoFiltro !== "todos" ? tipoFiltro : undefined,
      codigoGlosa: codigoGlosaFiltro !== "todos" ? codigoGlosaFiltro : undefined,
      classificacao: classificacaoFiltro !== "todos" ? classificacaoFiltro as "pendente" | "aceitar" | "recursar" : undefined,
      search: buscaItens || undefined,
      dataReferenciaInicio: dataReferenciaInicio ? new Date(dataReferenciaInicio) : undefined,
      dataReferenciaFim: dataReferenciaFim ? new Date(dataReferenciaFim) : undefined,
      page: paginaAtual,
      pageSize: 50,
    });

  // Buscar itens glosados aceitos (separados)
  const { data: itensAceitos, isLoading: loadingAceitos, refetch: refetchAceitos } = 
    trpc.glosa.itensGlosadosAceitos.useQuery({
      convenioId: convenioItens !== "todos" ? parseInt(convenioItens) : undefined,
      estabelecimentoId: estabelecimentoAtual?.id,
      search: buscaItens || undefined,
      dataReferenciaInicio: dataReferenciaInicio ? new Date(dataReferenciaInicio) : undefined,
      dataReferenciaFim: dataReferenciaFim ? new Date(dataReferenciaFim) : undefined,
      page: paginaAceitos,
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
        
        // Verificar se o argumento é válido (não vazio e não genérico)
        const argumentoLimpo = argumentoTexto.trim();
        if (argumentoLimpo.length < 20 || argumentoLimpo.toLowerCase().includes('não foi possível')) {
          toast.warning(
            "A IA não conseguiu gerar uma sugestão específica para este motivo de glosa. " +
            "Isso pode ocorrer quando não há histórico de contestações similares ou o código de glosa não está no dicionário. " +
            "Por favor, insira o argumento manualmente.",
            { duration: 8000 }
          );
        } else {
          setRecursoForm(prev => ({ ...prev, argumento: argumentoLimpo }));
          toast.success("Sugestão de argumento gerada com IA!");
        }
      } else {
        toast.warning(
          "A IA não conseguiu gerar uma sugestão para este item. " +
          "Possíveis motivos: código de glosa desconhecido, sem histórico de contestações similares, ou dados insuficientes. " +
          "Por favor, insira o argumento manualmente.",
          { duration: 8000 }
        );
      }
      setCarregandoSugestao(false);
    },
    onError: (error) => {
      toast.error(
        "Erro ao gerar sugestão com IA: " + error.message + 
        ". Por favor, tente novamente ou insira o argumento manualmente.",
        { duration: 6000 }
      );
      setCarregandoSugestao(false);
    },
  });

  // Mutation para classificar glosa (aceitar ou recursar)
  const classificarGlosaMutation = trpc.recursos.classificarGlosa.useMutation({
    onSuccess: () => {
      toast.success("Glosa classificada com sucesso!");
      setClassificandoItem(null);
      setDialogAceite(false);
      setItemParaAceitar(null);
      setMotivoAceiteForm("");
      refetchItens();
      refetchAceitos();
    },
    onError: (error) => {
      toast.error("Erro ao classificar glosa: " + error.message);
      setClassificandoItem(null);
    },
  });

  // Função para abrir modal de aceite
  const abrirModalAceite = (itemId: number) => {
    setItemParaAceitar(itemId);
    setMotivoAceiteForm("");
    setDialogAceite(true);
  };

  // Função para confirmar aceite com motivo
  const confirmarAceite = () => {
    if (!itemParaAceitar) return;
    setClassificandoItem(itemParaAceitar);
    classificarGlosaMutation.mutate({
      procedimentoId: itemParaAceitar,
      classificacao: "aceitar",
      motivoAceite: motivoAceiteForm || undefined,
    });
  };

  // Função para abrir modal de aceite em lote
  const abrirModalAceiteLote = () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item para aceitar em lote");
      return;
    }
    setMotivoAceiteForm("");
    setDialogAceiteLote(true);
  };

  // Função para confirmar aceite em lote
  const confirmarAceiteLote = async () => {
    if (itensSelecionados.size === 0) return;
    
    setAceitandoLote(true);
    const idsParaAceitar = Array.from(itensSelecionados);
    let sucessos = 0;
    let erros = 0;
    
    for (const id of idsParaAceitar) {
      try {
        await classificarGlosaMutation.mutateAsync({
          procedimentoId: id,
          classificacao: "aceitar",
          motivoAceite: motivoAceiteForm || undefined,
        });
        sucessos++;
      } catch (error) {
        erros++;
      }
    }
    
    setAceitandoLote(false);
    setDialogAceiteLote(false);
    setItensSelecionados(new Set());
    setMotivoAceiteForm("");
    
    if (erros === 0) {
      toast.success(`${sucessos} item(s) aceito(s) com sucesso!`);
    } else {
      toast.warning(`${sucessos} aceito(s), ${erros} erro(s)`);
    }
    
    refetchItens();
    refetchAceitos();
  };

  // Função para desfazer aceite (voltar para pendente)
  const desfazerAceite = (itemId: number) => {
    setClassificandoItem(itemId);
    classificarGlosaMutation.mutate({
      procedimentoId: itemId,
      classificacao: "recursar", // Volta para recursar para poder ser reavaliado
    });
  };

  // Buscar sugestão de classificação para o código de glosa selecionado
  const { data: sugestaoClassificacao } = trpc.recursos.sugerirClassificacao.useQuery(
    {
      codigoGlosa: codigoGlosaFiltro !== "todos" ? codigoGlosaFiltro : "",
      convenioId: convenioItens !== "todos" ? parseInt(convenioItens) : 0,
    },
    {
      enabled: codigoGlosaFiltro !== "todos" && convenioItens !== "todos",
    }
  );

  // Buscar histórico de decisões para o código de glosa selecionado
  const { data: historicoDecisoes } = trpc.recursos.historicoDecisoes.useQuery(
    {
      codigoGlosa: codigoGlosaFiltro !== "todos" ? codigoGlosaFiltro : "",
      convenioId: convenioItens !== "todos" ? parseInt(convenioItens) : undefined,
    },
    {
      enabled: codigoGlosaFiltro !== "todos",
    }
  );

  const handleClassificarGlosa = (procedimentoId: number, classificacao: "aceitar" | "recursar", motivo?: string) => {
    setClassificandoItem(procedimentoId);
    classificarGlosaMutation.mutate({
      procedimentoId,
      classificacao,
      motivo,
    });
  };

  const toggleItemSelecionado = (id: number) => {
    const newSet = new Set(itensSelecionados);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setItensSelecionados(newSet);
  };

  // Filtrar apenas itens sem recurso criado
  const itensSemRecurso = useMemo(() => {
    return itensGlosados?.items?.filter(i => !i.recursoStatus || i.recursoStatus === "sem_recurso") || [];
  }, [itensGlosados?.items]);

  const selecionarTodos = () => {
    if (!itensGlosados?.items) return;
    // Selecionar apenas itens que ainda não têm recurso
    const itensSelecionaveis = itensSemRecurso;
    if (itensSelecionados.size === itensSelecionaveis.length && itensSelecionaveis.length > 0) {
      setItensSelecionados(new Set());
    } else {
      setItensSelecionados(new Set(itensSelecionaveis.map(i => i.id)));
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
        procedimentoId: item.id, // ID do procedimento para marcar como "recurso criado"
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

        {/* Alerta de Prazo de Recurso */}
        {itensGlosados?.alertasPrazo && itensGlosados.alertasPrazo.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-red-700">
                <Clock className="h-5 w-5" />
                Alertas de Prazo de Recurso
              </CardTitle>
              <CardDescription className="text-red-600">
                Itens com prazo de recurso próximo do vencimento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {itensGlosados.alertasPrazo.map((alerta: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`h-5 w-5 ${alerta.diasRestantes <= 5 ? 'text-red-600' : 'text-orange-500'}`} />
                      <div>
                        <p className="font-medium">{alerta.convenio}</p>
                        <p className="text-sm text-muted-foreground">
                          {alerta.quantidade} item(ns) - Valor: {formatCurrency(alerta.valor)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={alerta.diasRestantes <= 5 ? "destructive" : "outline"} className="mb-1">
                        {alerta.diasRestantes} dia(s) restante(s)
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        Vence em: {new Date(alerta.dataLimite).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="itens">Itens Glosados</TabsTrigger>
            <TabsTrigger value="aceitas">Glosas Aceitas</TabsTrigger>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
                    <label className="text-sm font-medium mb-2 block">Cód. Glosa</label>
                    <Select value={codigoGlosaFiltro} onValueChange={(v) => { setCodigoGlosaFiltro(v); setPaginaAtual(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os códigos</SelectItem>
                        {itensGlosados?.resumo?.porMotivo
                          ?.filter(m => m.motivo.match(/^\d+$/))
                          ?.sort((a, b) => b.quantidade - a.quantidade)
                          ?.slice(0, 20)
                          ?.map((motivo) => {
                            const glosaInfo = GLOSAS_TISS[motivo.motivo];
                            return (
                              <SelectItem key={motivo.motivo} value={motivo.motivo}>
                                <span className="font-medium">{motivo.motivo}</span>
                                <span className="text-muted-foreground ml-1">({motivo.quantidade})</span>
                                {glosaInfo && (
                                  <span className="text-xs text-muted-foreground ml-1 truncate max-w-[200px]">
                                    - {glosaInfo.descricaoSimplificada}
                                  </span>
                                )}
                              </SelectItem>
                            );
                          })
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Classificação</label>
                    <Select value={classificacaoFiltro} onValueChange={(v) => { setClassificacaoFiltro(v); setPaginaAtual(1); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        <SelectItem value="pendente">
                          <span className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-gray-500" />
                            Pendentes
                          </span>
                        </SelectItem>
                        <SelectItem value="aceitar">
                          <span className="flex items-center gap-2">
                            <ThumbsUp className="h-3 w-3 text-green-500" />
                            Aceitas
                          </span>
                        </SelectItem>
                        <SelectItem value="recursar">
                          <span className="flex items-center gap-2">
                            <ThumbsDown className="h-3 w-3 text-orange-500" />
                            Para Recursar
                          </span>
                        </SelectItem>
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

            {/* Card de Informações do Código de Glosa Selecionado */}
            {codigoGlosaFiltro !== "todos" && GLOSAS_TISS[codigoGlosaFiltro] && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                          Código {codigoGlosaFiltro}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {GLOSAS_TISS[codigoGlosaFiltro].grupo}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">
                        {GLOSAS_TISS[codigoGlosaFiltro].descricaoSimplificada}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {GLOSAS_TISS[codigoGlosaFiltro].descricao}
                      </p>
                    </div>
                    <div className="flex-1 border-l pl-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-medium">Sugestão de Contestação</span>
                        {GLOSAS_TISS[codigoGlosaFiltro].probabilidadeSucesso && (
                          <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200">
                            {GLOSAS_TISS[codigoGlosaFiltro].probabilidadeSucesso}% sucesso
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {GLOSAS_TISS[codigoGlosaFiltro].argumentoContestacao || "Argumento não disponível no dicionário."}
                      </p>
                      {GLOSAS_TISS[codigoGlosaFiltro].acoesRecomendadas && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-muted-foreground">Ações recomendadas:</span>
                          <ul className="text-xs text-muted-foreground list-disc list-inside">
                            {GLOSAS_TISS[codigoGlosaFiltro].acoesRecomendadas?.slice(0, 2).map((acao, i) => (
                              <li key={i}>{acao}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <Button 
                          size="sm" 
                          className="w-full bg-amber-600 hover:bg-amber-700"
                          onClick={() => {
                            // Selecionar todos os itens do código de glosa atual
                            if (itensGlosados?.items) {
                              const itensDoCodigoAtual = itensGlosados.items.filter(item => {
                                const codigoItem = item.codigoGlosa || item.motivoGlosa?.match(/\d{4}/)?.[0] || "";
                                return codigoItem === codigoGlosaFiltro;
                              });
                              setItensSelecionados(new Set(itensDoCodigoAtual.map(i => i.id)));
                              // Abrir dialog com argumento pré-preenchido do dicionário
                              setRecursoForm({
                                motivo: `Código ${codigoGlosaFiltro}: ${GLOSAS_TISS[codigoGlosaFiltro].descricaoSimplificada}`,
                                argumento: GLOSAS_TISS[codigoGlosaFiltro].argumentoContestacao || "",
                                prioridade: "media",
                              });
                              setDialogRecurso(true);
                            }
                          }}
                        >
                          <Gavel className="h-4 w-4 mr-2" />
                          Criar Recurso em Lote para Todos os Itens ({itensGlosados?.items?.filter(item => {
                            const codigoItem = item.codigoGlosa || item.motivoGlosa?.match(/\d{4}/)?.[0] || "";
                            return codigoItem === codigoGlosaFiltro;
                          }).length || 0})
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Card de Classificação com Aprendizado Automático */}
            {codigoGlosaFiltro !== "todos" && (historicoDecisoes || sugestaoClassificacao) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card de Histórico de Decisões */}
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">Histórico de Decisões</h3>
                      <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-700 border-blue-200">
                        {historicoDecisoes?.totalDecisoes || 0} decisões
                      </Badge>
                    </div>
                    
                    {historicoDecisoes && historicoDecisoes.totalDecisoes > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-green-100 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-green-700">{historicoDecisoes.totalAceitas}</div>
                            <div className="text-xs text-green-600">Aceitas</div>
                          </div>
                          <div className="bg-orange-100 rounded-lg p-2 text-center">
                            <div className="text-lg font-bold text-orange-700">{historicoDecisoes.totalRecursadas}</div>
                            <div className="text-xs text-orange-600">Recursadas</div>
                          </div>
                        </div>
                        
                        {historicoDecisoes.totalRecursadas > 0 && (
                          <div className="bg-white rounded-lg p-2 border">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Taxa de Sucesso em Recursos</span>
                              <span className="text-sm font-semibold">
                                {historicoDecisoes.taxaSucessoRecurso.toFixed(0)}%
                              </span>
                            </div>
                            <Progress 
                              value={historicoDecisoes.taxaSucessoRecurso} 
                              className="h-2"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span>{historicoDecisoes.totalDeferidas} deferidas</span>
                              <span>{historicoDecisoes.totalIndeferidas} indeferidas</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma decisão registrada para este código</p>
                        <p className="text-xs">Classifique itens para treinar o sistema</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Card de Sugestão Automática */}
                <Card className={`border-2 ${
                  sugestaoClassificacao?.sugestao === "aceitar" 
                    ? "border-green-300 bg-green-50/50" 
                    : sugestaoClassificacao?.sugestao === "recursar"
                    ? "border-orange-300 bg-orange-50/50"
                    : "border-gray-200 bg-gray-50/50"
                }`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className={`h-5 w-5 ${
                        sugestaoClassificacao?.sugestao === "aceitar" 
                          ? "text-green-600" 
                          : sugestaoClassificacao?.sugestao === "recursar"
                          ? "text-orange-600"
                          : "text-gray-500"
                      }`} />
                      <h3 className="font-semibold">Sugestão do Sistema</h3>
                      {sugestaoClassificacao?.confianca && sugestaoClassificacao.confianca > 0 && (
                        <Badge variant="outline" className={`ml-auto ${
                          sugestaoClassificacao.confianca >= 70 
                            ? "bg-green-100 text-green-700 border-green-200" 
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                        }`}>
                          {sugestaoClassificacao.confianca.toFixed(0)}% confiança
                        </Badge>
                      )}
                    </div>

                    {sugestaoClassificacao && sugestaoClassificacao.sugestao !== "pendente" ? (
                      <div className="space-y-3">
                        <div className={`rounded-lg p-3 ${
                          sugestaoClassificacao.sugestao === "aceitar" 
                            ? "bg-green-100" 
                            : "bg-orange-100"
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {sugestaoClassificacao.sugestao === "aceitar" ? (
                              <ThumbsUp className="h-5 w-5 text-green-700" />
                            ) : (
                              <ThumbsDown className="h-5 w-5 text-orange-700" />
                            )}
                            <span className={`font-semibold ${
                              sugestaoClassificacao.sugestao === "aceitar" 
                                ? "text-green-700" 
                                : "text-orange-700"
                            }`}>
                              {sugestaoClassificacao.sugestao === "aceitar" 
                                ? "Recomendado: ACEITAR glosa" 
                                : "Recomendado: RECURSAR glosa"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {sugestaoClassificacao.motivo}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-green-300 text-green-700 hover:bg-green-100"
                            onClick={() => {
                              // Classificar todos os itens pendentes como "aceitar"
                              const itensPendentes = itensGlosados?.items?.filter(
                                i => !i.classificacaoGlosa || i.classificacaoGlosa === "pendente"
                              ) || [];
                              if (itensPendentes.length > 0) {
                                itensPendentes.forEach(item => {
                                  handleClassificarGlosa(item.id, "aceitar", "Aceito com base na sugestão do sistema");
                                });
                              }
                            }}
                          >
                            <ThumbsUp className="h-4 w-4 mr-1" />
                            Aceitar Todos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-100"
                            onClick={() => {
                              // Classificar todos os itens pendentes como "recursar"
                              const itensPendentes = itensGlosados?.items?.filter(
                                i => !i.classificacaoGlosa || i.classificacaoGlosa === "pendente"
                              ) || [];
                              if (itensPendentes.length > 0) {
                                itensPendentes.forEach(item => {
                                  handleClassificarGlosa(item.id, "recursar", "Recursado com base na sugestão do sistema");
                                });
                              }
                            }}
                          >
                            <ThumbsDown className="h-4 w-4 mr-1" />
                            Recursar Todos
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Dados insuficientes para sugestão</p>
                        <p className="text-xs">Classifique mais itens para treinar o sistema</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

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
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={selecionarTodos}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {itensSelecionados.size > 0 ? "Desmarcar Todos" : "Selecionar Todos"}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800"
                      onClick={abrirModalAceiteLote}
                      disabled={itensSelecionados.size === 0}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Aceitar Selecionados ({itensSelecionados.size})
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
                            <TableHead className="text-center">Recurso</TableHead>
                            <TableHead className="text-center">Classificação</TableHead>
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
                                    disabled={!!(item.recursoStatus && item.recursoStatus !== "sem_recurso")}
                                    title={item.recursoStatus && item.recursoStatus !== "sem_recurso" ? "Já existe recurso para este item" : ""}
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
                                <TableCell className="max-w-[250px]">
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="outline" className="text-xs w-fit" title={item.motivoGlosa}>
                                      {item.codigoGlosa && <span className="font-mono mr-1">{item.codigoGlosa}:</span>}
                                      {item.motivoGlosa.length > 25 ? item.motivoGlosa.substring(0, 25) + "..." : item.motivoGlosa}
                                    </Badge>
                                    {item.codigoGlosa && GLOSAS_TISS[item.codigoGlosa] && (
                                      <span className="text-xs text-muted-foreground truncate" title={GLOSAS_TISS[item.codigoGlosa].descricao}>
                                        {GLOSAS_TISS[item.codigoGlosa].descricaoSimplificada}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  {item.recursoStatus === "sem_recurso" || !item.recursoStatus ? (
                                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
                                      Sem recurso
                                    </Badge>
                                  ) : item.recursoStatus === "recurso_criado" ? (
                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                      <FileText className="h-3 w-3 mr-1" />
                                      Criado
                                    </Badge>
                                  ) : item.recursoStatus === "recurso_enviado" ? (
                                    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-600 border-yellow-200">
                                      <Send className="h-3 w-3 mr-1" />
                                      Enviado
                                    </Badge>
                                  ) : item.recursoStatus === "recurso_deferido" ? (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Deferido
                                    </Badge>
                                  ) : item.recursoStatus === "recurso_indeferido" ? (
                                    <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Indeferido
                                    </Badge>
                                  ) : null}
                                </TableCell>
                                <TableCell className="text-center">
                                  {classificandoItem === item.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                  ) : item.classificacaoGlosa === "aceitar" || item.classificacaoGlosa === "auto_aceitar" ? (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                                      <ThumbsUp className="h-3 w-3 mr-1" />
                                      {item.classificacaoGlosa === "auto_aceitar" ? "Auto-Aceita" : "Aceita"}
                                    </Badge>
                                  ) : item.classificacaoGlosa === "recursar" || item.classificacaoGlosa === "auto_recursar" ? (
                                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                                      <ThumbsDown className="h-3 w-3 mr-1" />
                                      {item.classificacaoGlosa === "auto_recursar" ? "Auto-Recursar" : "Recursar"}
                                    </Badge>
                                  ) : (
                                    <div className="flex gap-1 justify-center">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-green-600 hover:bg-green-100"
                                        onClick={() => abrirModalAceite(item.id)}
                                        title="Aceitar glosa (informar motivo)"
                                      >
                                        <ThumbsUp className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-100"
                                        onClick={() => handleClassificarGlosa(item.id, "recursar")}
                                        title="Marcar para recursar"
                                      >
                                        <ThumbsDown className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}
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

          {/* Tab: Glosas Aceitas */}
          <TabsContent value="aceitas" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ThumbsUp className="h-5 w-5 text-green-500" />
                      Glosas Aceitas
                    </CardTitle>
                    <CardDescription>
                      Itens marcados como "aceitar glosa" (sem recurso a ser feito)
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {itensAceitos?.total || 0} itens aceitos
                    </Badge>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {formatCurrency(itensAceitos?.totalValorGlosado || 0)} em glosas aceitas
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingAceitos ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (itensAceitos?.items?.length || 0) === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ThumbsUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma glosa aceita ainda</p>
                    <p className="text-sm mt-2">Clique em "Aceitar Glosa" nos itens da aba "Itens Glosados" para movê-los para cá</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Convênio</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Guia</TableHead>
                            <TableHead className="text-right">Valor Glosado</TableHead>
                            <TableHead>Motivo Glosa</TableHead>
                            <TableHead>Motivo Aceite</TableHead>
                            <TableHead>Data Aceite</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itensAceitos?.items?.map((item) => {
                            const glosaInfo = item.codigoGlosa ? GLOSAS_TISS[item.codigoGlosa] : null;
                            return (
                              <TableRow key={item.id}>
                                <TableCell>
                                  <Badge variant="outline">{item.convenioNome}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                                <TableCell className="max-w-[200px] truncate" title={item.descricao}>{item.descricao}</TableCell>
                                <TableCell className="font-mono text-sm">{item.guiaNumero || "-"}</TableCell>
                                <TableCell className="text-right font-medium text-red-600">
                                  {formatCurrency(item.valorGlosado || 0)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="secondary" className="w-fit">
                                      {item.codigoGlosa || "N/A"}
                                    </Badge>
                                    {glosaInfo && (
                                      <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={glosaInfo.descricao}>
                                        {glosaInfo.descricao}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {item.motivoAceite ? (
                                    <span className="text-sm text-muted-foreground max-w-[200px] truncate block" title={item.motivoAceite}>
                                      {item.motivoAceite}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">Não informado</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {item.dataAceite ? new Date(item.dataAceite).toLocaleDateString("pt-BR") : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => desfazerAceite(item.id)}
                                    disabled={classificandoItem === item.id}
                                    title="Desfazer aceite e voltar para análise"
                                  >
                                    {classificandoItem === item.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-orange-500" />
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginação */}
                    {(itensAceitos?.total || 0) > 50 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {((paginaAceitos - 1) * 50) + 1} a {Math.min(paginaAceitos * 50, itensAceitos?.total || 0)} de {itensAceitos?.total || 0} itens
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaginaAceitos(p => Math.max(1, p - 1))}
                            disabled={paginaAceitos === 1}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaginaAceitos(p => p + 1)}
                            disabled={paginaAceitos * 50 >= (itensAceitos?.total || 0)}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Resumo por Motivo de Glosa Aceita */}
            {(itensAceitos?.items?.length || 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Resumo por Motivo de Glosa Aceita
                  </CardTitle>
                  <CardDescription>
                    Análise dos motivos mais frequentes de glosas aceitas para aprendizado
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(
                      (itensAceitos?.items || [])
                        .reduce((acc: Record<string, { count: number; valor: number }>, item) => {
                          const motivo = item.codigoGlosa || "Sem motivo";
                          if (!acc[motivo]) {
                            acc[motivo] = { count: 0, valor: 0 };
                          }
                          acc[motivo].count++;
                          acc[motivo].valor += item.valorGlosado || 0;
                          return acc;
                        }, {} as Record<string, { count: number; valor: number }>)
                    )
                      .sort((a, b) => (b[1] as { count: number; valor: number }).count - (a[1] as { count: number; valor: number }).count)
                      .slice(0, 6)
                      .map(([motivo, dadosRaw]) => {
                        const dados = dadosRaw as { count: number; valor: number };
                        const glosaInfo = GLOSAS_TISS[motivo];
                        return (
                          <Card key={motivo} className="bg-green-50 border-green-200">
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline" className="bg-white">{motivo}</Badge>
                                <span className="text-sm font-medium">{dados.count} itens</span>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                {glosaInfo?.descricao || "Motivo não catalogado"}
                              </p>
                              <p className="text-lg font-bold text-green-700">
                                {formatCurrency(dados.valor)}
                              </p>
                              {glosaInfo && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Probabilidade de sucesso em recurso: {glosaInfo.probabilidadeSucesso}%
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
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
                {recursoForm.motivo.startsWith("Código ") && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <BookOpen className="h-3 w-3 mr-1" />
                      Argumento do Dicionário TISS
                    </Badge>
                  </div>
                )}
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

        {/* Dialog para aceitar glosa com motivo */}
        <Dialog open={dialogAceite} onOpenChange={setDialogAceite}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-green-500" />
                Aceitar Glosa
              </DialogTitle>
              <DialogDescription>
                Informe o motivo pelo qual esta glosa está sendo aceita (sem recurso).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="motivoAceite">Motivo do Aceite</Label>
                <Textarea
                  id="motivoAceite"
                  placeholder="Ex: Valor cobrado incorretamente, erro de faturamento, procedimento não realizado..."
                  value={motivoAceiteForm}
                  onChange={(e) => setMotivoAceiteForm(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Este motivo será registrado para análise futura e aprendizado do sistema.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogAceite(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={confirmarAceite}
                disabled={classificarGlosaMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {classificarGlosaMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
                ) : (
                  <>Confirmar Aceite</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para aceitar glosa em lote */}
        <Dialog open={dialogAceiteLote} onOpenChange={setDialogAceiteLote}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 text-green-500" />
                Aceitar Glosas em Lote
              </DialogTitle>
              <DialogDescription>
                Você está prestes a aceitar {itensSelecionados.size} item(s) glosado(s).
                Informe o motivo que será aplicado a todos os itens.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  {itensSelecionados.size} item(s) selecionado(s)
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Todos receberão o mesmo motivo de aceite
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="motivoAceiteLote">Motivo do Aceite</Label>
                <Textarea
                  id="motivoAceiteLote"
                  placeholder="Ex: Valor cobrado incorretamente, erro de faturamento, procedimento não realizado..."
                  value={motivoAceiteForm}
                  onChange={(e) => setMotivoAceiteForm(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Este motivo será registrado para análise futura e aprendizado do sistema.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogAceiteLote(false)} disabled={aceitandoLote}>
                Cancelar
              </Button>
              <Button 
                onClick={confirmarAceiteLote}
                disabled={aceitandoLote}
                className="bg-green-600 hover:bg-green-700"
              >
                {aceitandoLote ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Aceitando {itensSelecionados.size} itens...</>
                ) : (
                  <>Aceitar {itensSelecionados.size} Item(s)</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
