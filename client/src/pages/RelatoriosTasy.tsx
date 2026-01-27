import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  BarChart3, 
  PieChart, 
  LineChart,
  RefreshCw, 
  FileSpreadsheet,
  Columns,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Building2,
  User,
  Calendar,
  ChevronDown,
  Save,
  FolderOpen,
  Star,
  StarOff,
  Trash2,
  Eye,
  X,
  ArrowLeftRight,
  Info,
  Sparkles,
  GripVertical,
  Lightbulb,
  FileText,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  Layout,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
  Monitor,
  Clock,
  Settings2
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, DragEvent } from "react";
import * as XLSX from "xlsx";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import { toast } from "sonner";

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Definição das colunas disponíveis
const colunasDisponiveis = [
  { id: 'atendimento', label: 'Atendimento', tipo: 'texto' },
  { id: 'nrInternoConta', label: 'Nr Interno Conta', tipo: 'texto' },
  { id: 'guia', label: 'Guia', tipo: 'texto' },
  { id: 'convenio', label: 'Convênio', tipo: 'texto' },
  { id: 'paciente', label: 'Paciente', tipo: 'texto' },
  { id: 'dataFaturado', label: 'Data Faturado', tipo: 'data' },
  { id: 'dataConta', label: 'Data Conta', tipo: 'data' },
  { id: 'codigo', label: 'Código (Procedimento)', tipo: 'texto' },
  { id: 'codigoConvenio', label: 'Código Convênio', tipo: 'texto' },
  { id: 'descricao', label: 'Descrição', tipo: 'texto' },
  { id: 'quantidade', label: 'Quantidade', tipo: 'numero' },
  { id: 'valorUnitario', label: 'Valor Unitário', tipo: 'moeda' },
  { id: 'valorTotal', label: 'Valor Faturado', tipo: 'moeda' },
  { id: 'valorPago', label: 'Valor Pago', tipo: 'moeda' },
  { id: 'valorGlosado', label: 'Valor Glosado', tipo: 'moeda' },
  { id: 'motivoGlosa', label: 'Motivo Glosa', tipo: 'texto' },
  { id: 'setor', label: 'Setor', tipo: 'texto' },
  { id: 'protocolo', label: 'Protocolo', tipo: 'texto' },
  { id: 'statusProtocolo', label: 'Status Protocolo', tipo: 'texto' },
  { id: 'tipo', label: 'Tipo', tipo: 'texto' },
  { id: 'medico', label: 'Médico', tipo: 'texto' },
  { id: 'crm', label: 'CRM', tipo: 'texto' },
  { id: 'funcaoMedico', label: 'Função Médico', tipo: 'texto' },
  { id: 'unidade', label: 'Unidade', tipo: 'texto' },
];

// Campos disponíveis para agrupamento (drag-and-drop)
const camposDisponiveis = [
  // Dimensões principais
  { id: 'convenio', label: 'Convênio', icon: Building2, tipo: 'dimensao' },
  { id: 'setor', label: 'Setor', icon: Building2, tipo: 'dimensao' },
  { id: 'tipo', label: 'Tipo (Mat/Hon)', icon: Package, tipo: 'dimensao' },
  { id: 'medico', label: 'Médico', icon: User, tipo: 'dimensao' },
  // Novos campos de análise
  { id: 'paciente', label: 'Paciente', icon: User, tipo: 'dimensao' },
  { id: 'codigo', label: 'Procedimento (Código)', icon: FileText, tipo: 'dimensao' },
  { id: 'descricao', label: 'Descrição', icon: FileText, tipo: 'dimensao' },
  { id: 'protocolo', label: 'Protocolo', icon: FileText, tipo: 'dimensao' },
  { id: 'statusProtocolo', label: 'Status Protocolo', icon: FileText, tipo: 'dimensao' },
  { id: 'guia', label: 'Guia', icon: FileText, tipo: 'dimensao' },
  { id: 'atendimento', label: 'Atendimento', icon: FileText, tipo: 'dimensao' },
  { id: 'crm', label: 'CRM', icon: User, tipo: 'dimensao' },
  { id: 'funcaoMedico', label: 'Função Médico', icon: User, tipo: 'dimensao' },
  // Dimensões temporais
  { id: 'mesAno', label: 'Mês/Ano', icon: Calendar, tipo: 'dimensao' },
  { id: 'trimestre', label: 'Trimestre', icon: Calendar, tipo: 'dimensao' },
  { id: 'ano', label: 'Ano', icon: Calendar, tipo: 'dimensao' },
  // Métricas
  { id: 'valorTotal', label: 'Valor Faturado (R$)', icon: DollarSign, tipo: 'metrica' },
  { id: 'valorPago', label: 'Valor Pago (R$)', icon: DollarSign, tipo: 'metrica' },
  { id: 'valorGlosado', label: 'Valor Glosado (R$)', icon: DollarSign, tipo: 'metrica' },
  { id: 'quantidade', label: 'Quantidade', icon: Package, tipo: 'metrica' },
  { id: 'valorUnitario', label: 'Valor Unitário (R$)', icon: DollarSign, tipo: 'metrica' },
  // Dimensões de pagamento
  { id: 'motivoGlosa', label: 'Motivo Glosa', icon: AlertTriangle, tipo: 'dimensao' },
];

// Templates de relatórios pré-configurados
const templatesRelatorios = [
  {
    id: 'faturamento_mensal',
    nome: 'Faturamento Mensal',
    descricao: 'Análise do faturamento mensal por convênio',
    icon: DollarSign,
    config: {
      tipoGrafico: 'bar' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'convenio',
      eixoX: 'convenio',
      eixoY: 'valorTotal',
    }
  },
  {
    id: 'analise_glosas',
    nome: 'Análise de Glosas',
    descricao: 'Identificação de padrões de glosa por setor',
    icon: AlertTriangle,
    config: {
      tipoGrafico: 'pie' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'setor',
      eixoX: 'setor',
      eixoY: 'valorTotal',
    }
  },
  {
    id: 'producao_medica',
    nome: 'Produção Médica',
    descricao: 'Produtividade por médico',
    icon: User,
    config: {
      tipoGrafico: 'bar' as const,
      metricaGrafico: 'quantidade' as const,
      agrupamento: 'medico',
      eixoX: 'medico',
      eixoY: 'quantidade',
    }
  },
  {
    id: 'evolucao_trimestral',
    nome: 'Evolução Trimestral',
    descricao: 'Tendência de faturamento por trimestre',
    icon: TrendingUp,
    config: {
      tipoGrafico: 'line' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'trimestre',
      eixoX: 'trimestre',
      eixoY: 'valorTotal',
    }
  },
  {
    id: 'materiais_vs_honorarios',
    nome: 'Materiais vs Honorários',
    descricao: 'Comparação entre tipos de faturamento',
    icon: Package,
    config: {
      tipoGrafico: 'pie' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'tipo',
      eixoX: 'tipo',
      eixoY: 'valorTotal',
    }
  },
  {
    id: 'comparativo_anual',
    nome: 'Comparativo Anual',
    descricao: 'Comparação de faturamento entre anos',
    icon: ArrowLeftRight,
    config: {
      tipoGrafico: 'bar' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'ano',
      eixoX: 'ano',
      eixoY: 'valorTotal',
    }
  },
  // Templates de Pagamento
  {
    id: 'faturado_vs_pago',
    nome: 'Faturado vs Pago',
    descricao: 'Comparação entre valores faturados e pagos por convênio',
    icon: DollarSign,
    config: {
      tipoGrafico: 'bar' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'convenio',
      eixoX: 'convenio',
      eixoY: 'valorPago',
    }
  },
  {
    id: 'glosas_por_convenio',
    nome: 'Glosas por Convênio',
    descricao: 'Análise de valores glosados por convênio',
    icon: AlertTriangle,
    config: {
      tipoGrafico: 'pie' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'convenio',
      eixoX: 'convenio',
      eixoY: 'valorGlosado',
    }
  },
  {
    id: 'motivos_glosa',
    nome: 'Motivos de Glosa',
    descricao: 'Distribuição por motivo de glosa',
    icon: AlertTriangle,
    config: {
      tipoGrafico: 'pie' as const,
      metricaGrafico: 'quantidade' as const,
      agrupamento: 'motivoGlosa',
      eixoX: 'motivoGlosa',
      eixoY: 'quantidade',
    }
  },
  {
    id: 'evolucao_pagamentos',
    nome: 'Evolução de Pagamentos',
    descricao: 'Tendência de pagamentos ao longo do tempo',
    icon: TrendingUp,
    config: {
      tipoGrafico: 'line' as const,
      metricaGrafico: 'valor' as const,
      agrupamento: 'mesAno',
      eixoX: 'mesAno',
      eixoY: 'valorPago',
    }
  },
];

// Cores para gráficos
const coresGraficos = [
  'rgba(59, 130, 246, 0.8)',
  'rgba(16, 185, 129, 0.8)',
  'rgba(245, 158, 11, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(139, 92, 246, 0.8)',
  'rgba(236, 72, 153, 0.8)',
  'rgba(20, 184, 166, 0.8)',
  'rgba(249, 115, 22, 0.8)',
  'rgba(99, 102, 241, 0.8)',
  'rgba(34, 197, 94, 0.8)',
];

// Lista de meses
const meses = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

// Componente de Resumo do Relatório
const ResumoRelatorio = ({ dados }: { dados: any[] }) => {
  const totais = dados.reduce((acc, curr) => ({
    faturado: acc.faturado + (curr.valorTotal || 0),
    pago: acc.pago + (curr.valorPago || 0),
    glosa: acc.glosa + (curr.valorGlosado || 0),
  }), { faturado: 0, pago: 0, glosa: 0 });

  return (
    <div className="flex gap-5 mb-5">
      <div className="flex-1 p-5 rounded-lg bg-white shadow text-center">
        <h4 className="text-muted-foreground m-0">Total Faturado</h4>
        <p className="text-2xl font-bold text-slate-800 mt-2 mb-0">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totais.faturado)}
        </p>
      </div>
      <div className="flex-1 p-5 rounded-lg bg-white shadow text-center">
        <h4 className="text-muted-foreground m-0">Total Pago</h4>
        <p className="text-2xl font-bold text-green-600 mt-2 mb-0">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totais.pago)}
        </p>
      </div>
      <div className="flex-1 p-5 rounded-lg bg-white shadow text-center">
        <h4 className="text-muted-foreground m-0">Total Glosado</h4>
        <p className="text-2xl font-bold text-red-500 mt-2 mb-0">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totais.glosa)}
        </p>
      </div>
    </div>
  );
};

export default function RelatoriosTasy() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const utils = trpc.useUtils();
  
  // Estados para filtros
  const currentDate = new Date();
  const [mesSelecionado, setMesSelecionado] = useState<number>(currentDate.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState<number>(currentDate.getFullYear());
  const [convenioFiltro, setConvenioFiltro] = useState<string>("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("all");
  const [setorFiltro, setSetorFiltro] = useState<string>("");
  
  // Estados para configuração do relatório
  const [colunasVisiveis, setColunasVisiveis] = useState<string[]>([
    'atendimento', 'guia', 'convenio', 'paciente', 'tipo', 'valorTotal', 'setor'
  ]);
  const [agrupamento, setAgrupamento] = useState<string>('convenio');
  const [tipoGrafico, setTipoGrafico] = useState<'bar' | 'pie' | 'line'>('bar');
  const [metricaGrafico, setMetricaGrafico] = useState<'valor' | 'quantidade'>('valor');
  
  // Estados para drag-and-drop
  const [eixoX, setEixoX] = useState<string>('convenio');
  const [eixoY, setEixoY] = useState<string[]>(['valorTotal']); // Agora suporta múltiplos valores
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  
  // Estados para comparativo
  const [comparativoAtivo, setComparativoAtivo] = useState(false);
  const [periodo2Mes, setPeriodo2Mes] = useState<number>(currentDate.getMonth());
  const [periodo2Ano, setPeriodo2Ano] = useState<number>(currentDate.getFullYear());
  
  // Estados para drill-down
  const [drillDownAberto, setDrillDownAberto] = useState(false);
  const [drillDownDados, setDrillDownDados] = useState<any[]>([]);
  const [drillDownTitulo, setDrillDownTitulo] = useState("");
  
  // Estados para salvar dashboard
  const [salvarDialogAberto, setSalvarDialogAberto] = useState(false);
  const [carregarDialogAberto, setCarregarDialogAberto] = useState(false);
  const [nomeDashboard, setNomeDashboard] = useState("");
  const [descricaoDashboard, setDescricaoDashboard] = useState("");
  const [dashboardParaExcluir, setDashboardParaExcluir] = useState<number | null>(null);
  
  // Estados para IA
  const [sugestoesIAAberto, setSugestoesIAAberto] = useState(false);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [sugestoesIA, setSugestoesIA] = useState<any[]>([]);
  
  // Estado para seleção de fonte de dados
  const [fonteDados, setFonteDados] = useState<'antiga' | 'faturadoTasy'>('antiga');

  // Estados para modo apresentação
  const [modoApresentacao, setModoApresentacao] = useState(false);
  const [slideAtual, setSlideAtual] = useState(0);
  const [rotacaoAutomatica, setRotacaoAutomatica] = useState(true);
  const [intervaloRotacao, setIntervaloRotacao] = useState(10); // segundos
  const [slidesApresentacao, setSlidesApresentacao] = useState<Array<{
    titulo: string;
    tipoGrafico: 'bar' | 'pie' | 'line';
    agrupamento: string;
    metrica: 'valor' | 'quantidade';
  }>>([
    { titulo: 'Faturamento por Convênio', tipoGrafico: 'bar', agrupamento: 'convenio', metrica: 'valor' },
    { titulo: 'Distribuição por Tipo', tipoGrafico: 'pie', agrupamento: 'tipo', metrica: 'valor' },
    { titulo: 'Evolução Mensal', tipoGrafico: 'line', agrupamento: 'mesAno', metrica: 'valor' },
    { titulo: 'Produção por Setor', tipoGrafico: 'bar', agrupamento: 'setor', metrica: 'quantidade' },
    { titulo: 'Produção por Médico', tipoGrafico: 'bar', agrupamento: 'medico', metrica: 'valor' },
  ]);
  
  // Lista de anos
  const anos = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => anoAtual - i);
  }, []);

  // Buscar dados do Tasy (fonte antiga)
  const { data: dadosTasyAntigo, isLoading: isLoadingAntigo } = trpc.importacaoTasy.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      dataInicio: new Date(anoSelecionado, mesSelecionado - 1, 1).toISOString(),
      dataFim: new Date(anoSelecionado, mesSelecionado, 0).toISOString(),
      convenio: convenioFiltro || undefined,
      tipo: tipoFiltro === "all" ? undefined : (tipoFiltro as "MATERIAL" | "HONORARIO"),
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual?.id && fonteDados === 'antiga' }
  );

  // Buscar dados do FaturadoTasy (fonte nova)
  const { data: dadosFaturadoTasy, isLoading: isLoadingNovo } = trpc.faturadoTasy.dadosRelatorio.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      dataInicio: new Date(anoSelecionado, mesSelecionado - 1, 1).toISOString(),
      dataFim: new Date(anoSelecionado, mesSelecionado, 0).toISOString(),
      convenio: convenioFiltro || undefined,
      tipo: tipoFiltro === "all" ? undefined : (tipoFiltro as "MATERIAL" | "HONORARIO"),
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual?.id && fonteDados === 'faturadoTasy' }
  );

  // Combinar dados baseado na fonte selecionada
  const dadosTasy = fonteDados === 'faturadoTasy' ? dadosFaturadoTasy : dadosTasyAntigo;
  const isLoading = fonteDados === 'faturadoTasy' ? isLoadingNovo : isLoadingAntigo;

  // Buscar dados do período 2 para comparativo (fonte antiga)
  const { data: dadosTasyPeriodo2Antigo } = trpc.importacaoTasy.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      dataInicio: new Date(periodo2Ano, periodo2Mes - 1, 1).toISOString(),
      dataFim: new Date(periodo2Ano, periodo2Mes, 0).toISOString(),
      convenio: convenioFiltro || undefined,
      tipo: tipoFiltro === "all" ? undefined : (tipoFiltro as "MATERIAL" | "HONORARIO"),
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual?.id && comparativoAtivo && fonteDados === 'antiga' }
  );

  // Buscar dados do período 2 para comparativo (fonte nova)
  const { data: dadosFaturadoTasyPeriodo2 } = trpc.faturadoTasy.dadosRelatorio.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      dataInicio: new Date(periodo2Ano, periodo2Mes - 1, 1).toISOString(),
      dataFim: new Date(periodo2Ano, periodo2Mes, 0).toISOString(),
      convenio: convenioFiltro || undefined,
      tipo: tipoFiltro === "all" ? undefined : (tipoFiltro as "MATERIAL" | "HONORARIO"),
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual?.id && comparativoAtivo && fonteDados === 'faturadoTasy' }
  );

  // Combinar dados do período 2
  const dadosTasyPeriodo2 = fonteDados === 'faturadoTasy' ? dadosFaturadoTasyPeriodo2 : dadosTasyPeriodo2Antigo;

  // Buscar dashboards salvos
  const { data: dashboardsSalvos } = trpc.dashboards.listar.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual?.id }
  );

  // Mutations
  const salvarDashboardMutation = trpc.dashboards.salvar.useMutation({
    onSuccess: () => {
      toast.success("Dashboard salvo com sucesso!");
      setSalvarDialogAberto(false);
      setNomeDashboard("");
      setDescricaoDashboard("");
      utils.dashboards.listar.invalidate();
    },
    onError: () => {
      toast.error("Erro ao salvar dashboard");
    }
  });

  const excluirDashboardMutation = trpc.dashboards.excluir.useMutation({
    onSuccess: () => {
      toast.success("Dashboard excluído");
      setDashboardParaExcluir(null);
      utils.dashboards.listar.invalidate();
    }
  });

  const atualizarDashboardMutation = trpc.dashboards.atualizar.useMutation({
    onSuccess: () => {
      utils.dashboards.listar.invalidate();
    }
  });

  // Effect para rotação automática no modo apresentação
  useEffect(() => {
    if (!modoApresentacao || !rotacaoAutomatica) return;
    
    const timer = setInterval(() => {
      setSlideAtual((prev) => (prev + 1) % slidesApresentacao.length);
    }, intervaloRotacao * 1000);
    
    return () => clearInterval(timer);
  }, [modoApresentacao, rotacaoAutomatica, intervaloRotacao, slidesApresentacao.length]);
  
  // Effect para tecla ESC sair do modo apresentação
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modoApresentacao) return;
      
      switch (e.key) {
        case 'Escape':
          setModoApresentacao(false);
          break;
        case 'ArrowRight':
        case ' ':
          setSlideAtual((prev) => (prev + 1) % slidesApresentacao.length);
          break;
        case 'ArrowLeft':
          setSlideAtual((prev) => (prev - 1 + slidesApresentacao.length) % slidesApresentacao.length);
          break;
        case 'p':
        case 'P':
          setRotacaoAutomatica((prev) => !prev);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modoApresentacao, slidesApresentacao.length]);

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    return dadosTasy || [];
  }, [dadosTasy]);

  // Convênios únicos para filtro
  const conveniosUnicos = useMemo(() => {
    const convenios = new Set<string>();
    dadosFiltrados.forEach((item: any) => {
      if (item.convenio) convenios.add(item.convenio);
    });
    return Array.from(convenios).sort();
  }, [dadosFiltrados]);

  // Setores únicos para filtro
  const setoresUnicos = useMemo(() => {
    const setores = new Set<string>();
    dadosFiltrados.forEach((item: any) => {
      if (item.setor) setores.add(item.setor);
    });
    return Array.from(setores).sort();
  }, [dadosFiltrados]);

  // Calcular totais
  const totais = useMemo(() => {
    let valor = 0;
    let quantidade = 0;
    let materiais = 0;
    let honorarios = 0;
    
    dadosFiltrados.forEach((item: any) => {
      const v = parseFloat(item.valorTotal || '0');
      const q = parseInt(item.quantidade || '0');
      valor += v;
      quantidade += q;
      if (item.tipo === 'MATERIAL') materiais += v;
      else honorarios += v;
    });
    
    return { valor, quantidade, materiais, honorarios };
  }, [dadosFiltrados]);

  // Agrupar dados para gráficos
  const dadosAgrupados = useMemo(() => {
    const grupos: Record<string, { valor: number; valorPago: number; valorGlosado: number; quantidade: number; itens: any[] }> = {};
    
    dadosFiltrados.forEach((item: any) => {
      let chave = '';
      
      switch (eixoX) {
        case 'convenio':
          chave = item.convenio || 'Sem Convênio';
          break;
        case 'setor':
          chave = item.setor || 'Sem Setor';
          break;
        case 'tipo':
          chave = item.tipo || 'Sem Tipo';
          break;
        case 'medico':
          chave = item.medico || 'Sem Médico';
          break;
        case 'paciente':
          chave = item.paciente || 'Sem Paciente';
          break;
        case 'codigo':
          chave = item.codigo || 'Sem Código';
          break;
        case 'descricao':
          chave = item.descricao || 'Sem Descrição';
          break;
        case 'protocolo':
          chave = item.protocolo || 'Sem Protocolo';
          break;
        case 'statusProtocolo':
          chave = item.statusProtocolo || 'Sem Status';
          break;
        case 'guia':
          chave = item.guia || 'Sem Guia';
          break;
        case 'atendimento':
          chave = item.atendimento || 'Sem Atendimento';
          break;
        case 'crm':
          chave = item.crm || 'Sem CRM';
          break;
        case 'funcaoMedico':
          chave = item.funcaoMedico || 'Sem Função';
          break;
        case 'motivoGlosa':
          chave = item.motivoGlosa || 'Sem Glosa';
          break;
        case 'mesAno':
          const data = new Date(item.dataFaturado || item.dataConta);
          chave = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
          break;
        case 'trimestre':
          const dataT = new Date(item.dataFaturado || item.dataConta);
          const trimestre = Math.ceil((dataT.getMonth() + 1) / 3);
          chave = `T${trimestre}/${dataT.getFullYear()}`;
          break;
        case 'ano':
          const dataA = new Date(item.dataFaturado || item.dataConta);
          chave = String(dataA.getFullYear());
          break;
        default:
          chave = item[eixoX] || 'Outros';
      }
      
      if (!grupos[chave]) {
        grupos[chave] = { valor: 0, valorPago: 0, valorGlosado: 0, quantidade: 0, itens: [] };
      }
      
      grupos[chave].valor += parseFloat(item.valorTotal || '0');
      grupos[chave].valorPago += parseFloat(item.valorPago || '0');
      grupos[chave].valorGlosado += parseFloat(item.valorGlosado || '0');
      grupos[chave].quantidade += parseInt(item.quantidade || '0');
      grupos[chave].itens.push(item);
    });
    
    return Object.entries(grupos)
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.valor - a.valor);
  }, [dadosFiltrados, eixoX]);

  // Dados para o gráfico - agora suporta múltiplos valores no eixo Y
  const dadosGrafico = useMemo(() => {
    const labels = dadosAgrupados.slice(0, 10).map(g => g.label);
    
    const labelMap: Record<string, string> = {
      'valorTotal': 'Valor Faturado (R$)',
      'valorPago': 'Valor Pago (R$)',
      'valorGlosado': 'Valor Glosado (R$)',
      'quantidade': 'Quantidade',
      'valorUnitario': 'Valor Unitário (R$)',
    };
    
    const coresPorMetrica: Record<string, string> = {
      'valorTotal': 'rgba(59, 130, 246, 0.8)',
      'valorPago': 'rgba(16, 185, 129, 0.8)',
      'valorGlosado': 'rgba(239, 68, 68, 0.8)',
      'quantidade': 'rgba(245, 158, 11, 0.8)',
      'valorUnitario': 'rgba(139, 92, 246, 0.8)',
    };
    
    // Se for gráfico de pizza, usar apenas o primeiro valor do eixoY
    if (tipoGrafico === 'pie') {
      const metrica = eixoY[0] || 'valorTotal';
      const valores = dadosAgrupados.slice(0, 10).map(g => {
        switch (metrica) {
          case 'valorTotal': return g.valor;
          case 'valorPago': return g.valorPago;
          case 'valorGlosado': return g.valorGlosado;
          case 'quantidade': return g.quantidade;
          default: return g.valor;
        }
      });
      
      return {
        labels,
        datasets: [{
          label: labelMap[metrica] || 'Valor (R$)',
          data: valores,
          backgroundColor: coresGraficos,
          borderColor: coresGraficos.map(c => c.replace('0.8', '1')),
          borderWidth: 1,
        }]
      };
    }
    
    // Para gráficos de barra e linha, criar um dataset para cada métrica selecionada
    const datasets = eixoY.map((metrica, index) => {
      const valores = dadosAgrupados.slice(0, 10).map(g => {
        switch (metrica) {
          case 'valorTotal': return g.valor;
          case 'valorPago': return g.valorPago;
          case 'valorGlosado': return g.valorGlosado;
          case 'quantidade': return g.quantidade;
          default: return g.valor;
        }
      });
      
      const cor = coresPorMetrica[metrica] || coresGraficos[index % coresGraficos.length];
      
      return {
        label: labelMap[metrica] || metrica,
        data: valores,
        backgroundColor: cor,
        borderColor: cor.replace('0.8', '1'),
        borderWidth: 1,
      };
    });
    
    return {
      labels,
      datasets,
    };
  }, [dadosAgrupados, eixoY, tipoGrafico]);

  // Dados para gráfico comparativo
  const dadosGraficoComparativo = useMemo(() => {
    if (!comparativoAtivo || !dadosTasyPeriodo2?.length) return null;
    
    const dadosPeriodo2 = dadosTasyPeriodo2;
    const grupos2: Record<string, number> = {};
    
    dadosPeriodo2.forEach((item: any) => {
      let chave = '';
      switch (eixoX) {
        case 'convenio': chave = item.convenio || 'Sem Convênio'; break;
        case 'setor': chave = item.setor || 'Sem Setor'; break;
        case 'tipo': chave = item.tipo || 'Sem Tipo'; break;
        case 'medico': chave = item.medico || 'Sem Médico'; break;
        case 'paciente': chave = item.paciente || 'Sem Paciente'; break;
        case 'codigo': chave = item.codigo || 'Sem Código'; break;
        case 'descricao': chave = item.descricao || 'Sem Descrição'; break;
        case 'protocolo': chave = item.protocolo || 'Sem Protocolo'; break;
        case 'statusProtocolo': chave = item.statusProtocolo || 'Sem Status'; break;
        case 'guia': chave = item.guia || 'Sem Guia'; break;
        case 'atendimento': chave = item.atendimento || 'Sem Atendimento'; break;
        case 'crm': chave = item.crm || 'Sem CRM'; break;
        case 'funcaoMedico': chave = item.funcaoMedico || 'Sem Função'; break;
        default: chave = item[eixoX] || 'Outros';
      }
      
      if (!grupos2[chave]) grupos2[chave] = 0;
      const metricaPrincipal = eixoY[0] || 'valorTotal';
      grupos2[chave] += metricaPrincipal === 'valorTotal' 
        ? parseFloat(item.valorTotal || '0')
        : parseInt(item.quantidade || '0');
    });
    
    const labels = dadosAgrupados.slice(0, 10).map(g => g.label);
    const metricaPrincipal = eixoY[0] || 'valorTotal';
    const valores1 = dadosAgrupados.slice(0, 10).map(g => 
      metricaPrincipal === 'valorTotal' ? g.valor : g.quantidade
    );
    const valores2 = labels.map(label => grupos2[label] || 0);
    
    return {
      labels,
      datasets: [
        {
          label: `${meses[mesSelecionado - 1]?.label}/${anoSelecionado}`,
          data: valores1,
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
        },
        {
          label: `${meses[periodo2Mes - 1]?.label}/${periodo2Ano}`,
          data: valores2,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1,
        }
      ]
    };
  }, [comparativoAtivo, dadosTasyPeriodo2, dadosAgrupados, eixoX, eixoY, mesSelecionado, anoSelecionado, periodo2Mes, periodo2Ano]);

  // Opções do gráfico com drill-down
  const opcoesGrafico = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_: any, elements: any[]) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const grupo = dadosAgrupados[index];
        if (grupo) {
          setDrillDownTitulo(`Detalhes: ${grupo.label}`);
          setDrillDownDados(grupo.itens);
          setDrillDownAberto(true);
        }
      }
    },
    plugins: {
      legend: { display: tipoGrafico === 'pie' || eixoY.length > 1 },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw;
            const datasetLabel = context.dataset.label || '';
            // Verificar se é uma métrica de valor monetário
            if (datasetLabel.includes('R$') || datasetLabel.includes('Valor')) {
              return `${datasetLabel}: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            }
            return `${datasetLabel}: ${value.toLocaleString('pt-BR')} itens`;
          }
        }
      }
    },
    scales: tipoGrafico !== 'pie' ? {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => {
            // Verificar se alguma métrica selecionada é monetária
            const temMetricaMonetaria = eixoY.some(m => ['valorTotal', 'valorPago', 'valorGlosado', 'valorUnitario'].includes(m));
            if (temMetricaMonetaria) {
              return `R$ ${(value / 1000).toFixed(0)}k`;
            }
            return value;
          }
        }
      }
    } : undefined
  }), [dadosAgrupados, tipoGrafico, eixoY]);

  // Handlers de drag-and-drop
  const handleDragStart = (e: DragEvent<HTMLDivElement>, fieldId: string) => {
    setDraggedField(fieldId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, target: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(target);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, target: 'eixoX' | 'eixoY') => {
    e.preventDefault();
    if (draggedField) {
      const campo = camposDisponiveis.find(c => c.id === draggedField);
      if (campo) {
        if (target === 'eixoX' && campo.tipo === 'dimensao') {
          setEixoX(draggedField);
          setAgrupamento(draggedField);
        } else if (target === 'eixoY' && campo.tipo === 'metrica') {
          // Adicionar ao array se não existir, ou substituir se já existir
          setEixoY(prev => {
            if (prev.includes(draggedField)) {
              return prev; // Já existe, não adicionar novamente
            }
            return [...prev, draggedField]; // Adicionar ao array
          });
          setMetricaGrafico(draggedField === 'valorTotal' ? 'valor' : 'quantidade');
        }
      }
    }
    setDraggedField(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    setDragOverTarget(null);
  };

  // Handler para aplicar template
  const handleAplicarTemplate = (template: typeof templatesRelatorios[0]) => {
    setTipoGrafico(template.config.tipoGrafico);
    setMetricaGrafico(template.config.metricaGrafico);
    setAgrupamento(template.config.agrupamento);
    setEixoX(template.config.eixoX);
    setEixoY([template.config.eixoY]); // Converter para array
    toast.success(`Template "${template.nome}" aplicado!`);
  };

  // Handler para salvar dashboard
  const handleSalvarDashboard = () => {
    if (!nomeDashboard.trim()) {
      toast.error("Digite um nome para o dashboard");
      return;
    }
    
    salvarDashboardMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      nome: nomeDashboard,
      descricao: descricaoDashboard,
      configuracao: {
        tipoGrafico,
        agrupamento,
        colunasSelecionadas: colunasVisiveis,
        filtros: {
          mes: mesSelecionado,
          ano: anoSelecionado,
          convenio: convenioFiltro || undefined,
          tipo: tipoFiltro === 'all' ? undefined : tipoFiltro,
          setor: setorFiltro || undefined,
        },
      },
      comparativoAtivo,
      periodo1Mes: mesSelecionado,
      periodo1Ano: anoSelecionado,
      periodo2Mes,
      periodo2Ano,
    });
  };

  // Handler para carregar dashboard
  const handleCarregarDashboard = (dashboard: any) => {
    try {
      const config = JSON.parse(dashboard.configuracao);
      setTipoGrafico(config.tipoGrafico || 'bar');
      setMetricaGrafico(config.metricaGrafico || 'valor');
      setAgrupamento(config.agrupamento || 'convenio');
      setEixoX(config.eixoX || 'convenio');
      setEixoY(Array.isArray(config.eixoY) ? config.eixoY : [config.eixoY || 'valorTotal']);
      if (config.colunasVisiveis) setColunasVisiveis(config.colunasVisiveis);
      if (config.mesSelecionado) setMesSelecionado(config.mesSelecionado);
      if (config.anoSelecionado) setAnoSelecionado(config.anoSelecionado);
      if (config.convenioFiltro !== undefined) setConvenioFiltro(config.convenioFiltro);
      if (config.tipoFiltro) setTipoFiltro(config.tipoFiltro);
      if (config.setorFiltro !== undefined) setSetorFiltro(config.setorFiltro);
      if (config.comparativoAtivo !== undefined) setComparativoAtivo(config.comparativoAtivo);
      if (config.periodo2Mes) setPeriodo2Mes(config.periodo2Mes);
      if (config.periodo2Ano) setPeriodo2Ano(config.periodo2Ano);
      
      toast.success(`Dashboard "${dashboard.nome}" carregado!`);
      setCarregarDialogAberto(false);
    } catch (error) {
      toast.error("Erro ao carregar dashboard");
    }
  };

  // Handler para toggle favorito
  const handleToggleFavorito = (dashboard: any) => {
    atualizarDashboardMutation.mutate({
      id: dashboard.id,
      favorito: !dashboard.favorito,
    });
  };

  // Handler para análise da IA
  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    setSugestoesIAAberto(true);
    
    // Simular análise da IA baseada nos dados
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const sugestoes = [];
    
    // Analisar distribuição dos dados
    const totalConvenios = conveniosUnicos.length;
    const totalSetores = setoresUnicos.length;
    const proporcaoMateriais = totais.materiais / (totais.valor || 1);
    
    // Sugestão baseada na quantidade de convênios
    if (totalConvenios > 5) {
      sugestoes.push({
        tipo: 'grafico',
        titulo: 'Gráfico de Barras por Convênio',
        descricao: `Com ${totalConvenios} convênios, um gráfico de barras permite comparar facilmente o faturamento entre eles.`,
        config: { tipoGrafico: 'bar', eixoX: 'convenio', eixoY: 'valorTotal' },
        confianca: 95,
      });
    }
    
    // Sugestão para análise temporal
    sugestoes.push({
      tipo: 'grafico',
      titulo: 'Gráfico de Linha Temporal',
      descricao: 'Visualize a evolução do faturamento ao longo do tempo para identificar tendências.',
      config: { tipoGrafico: 'line', eixoX: 'mesAno', eixoY: 'valorTotal' },
      confianca: 88,
    });
    
    // Sugestão baseada na proporção materiais/honorários
    if (proporcaoMateriais > 0.3 && proporcaoMateriais < 0.7) {
      sugestoes.push({
        tipo: 'grafico',
        titulo: 'Gráfico de Pizza - Materiais vs Honorários',
        descricao: `A distribuição está equilibrada (${(proporcaoMateriais * 100).toFixed(0)}% materiais). Um gráfico de pizza mostra bem essa proporção.`,
        config: { tipoGrafico: 'pie', eixoX: 'tipo', eixoY: 'valorTotal' },
        confianca: 92,
      });
    }
    
    // Sugestão para análise por setor
    if (totalSetores > 3) {
      sugestoes.push({
        tipo: 'grafico',
        titulo: 'Análise por Setor',
        descricao: `Identifique quais dos ${totalSetores} setores geram mais faturamento.`,
        config: { tipoGrafico: 'bar', eixoX: 'setor', eixoY: 'valorTotal' },
        confianca: 85,
      });
    }
    
    // Sugestão de anomalia
    const mediaValor = totais.valor / (dadosFiltrados.length || 1);
    const valoresAltos = dadosFiltrados.filter((d: any) => parseFloat(d.valorTotal || '0') > mediaValor * 3);
    if (valoresAltos.length > 0) {
      sugestoes.push({
        tipo: 'alerta',
        titulo: 'Valores Atípicos Detectados',
        descricao: `Encontrados ${valoresAltos.length} itens com valor 3x acima da média. Recomenda-se revisão.`,
        config: null,
        confianca: 90,
      });
    }
    
    // Sugestão de comparativo
    sugestoes.push({
      tipo: 'acao',
      titulo: 'Ativar Comparativo de Períodos',
      descricao: 'Compare o período atual com o mês anterior para identificar variações significativas.',
      config: { comparativoAtivo: true },
      confianca: 80,
    });
    
    setSugestoesIA(sugestoes);
    setAnalisandoIA(false);
  };

  // Handler para aplicar sugestão da IA
  const handleAplicarSugestaoIA = (sugestao: any) => {
    if (sugestao.config) {
      if (sugestao.config.tipoGrafico) setTipoGrafico(sugestao.config.tipoGrafico);
      if (sugestao.config.eixoX) {
        setEixoX(sugestao.config.eixoX);
        setAgrupamento(sugestao.config.eixoX);
      }
      if (sugestao.config.eixoY) {
        setEixoY([sugestao.config.eixoY]);
        setMetricaGrafico(sugestao.config.eixoY === 'valorTotal' ? 'valor' : 'quantidade');
      }
      if (sugestao.config.comparativoAtivo !== undefined) {
        setComparativoAtivo(sugestao.config.comparativoAtivo);
      }
      toast.success(`Sugestão "${sugestao.titulo}" aplicada!`);
    }
    setSugestoesIAAberto(false);
  };

  // Effect para rotação automática dos slides
  useEffect(() => {
    if (!modoApresentacao || !rotacaoAutomatica) return;
    
    const timer = setInterval(() => {
      setSlideAtual((prev) => (prev + 1) % slidesApresentacao.length);
    }, intervaloRotacao * 1000);
    
    return () => clearInterval(timer);
  }, [modoApresentacao, rotacaoAutomatica, intervaloRotacao, slidesApresentacao.length]);

  // Effect para controles de teclado no modo apresentação
  useEffect(() => {
    if (!modoApresentacao) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setModoApresentacao(false);
          break;
        case 'ArrowLeft':
          setSlideAtual((prev) => (prev - 1 + slidesApresentacao.length) % slidesApresentacao.length);
          break;
        case 'ArrowRight':
        case ' ':
          setSlideAtual((prev) => (prev + 1) % slidesApresentacao.length);
          break;
        case 'p':
        case 'P':
          setRotacaoAutomatica((prev) => !prev);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modoApresentacao, slidesApresentacao.length]);

  // Função para gerar dados do gráfico para o modo apresentação
  const gerarDadosSlide = useCallback((slide: typeof slidesApresentacao[0]) => {
    const grupos = new Map<string, { valor: number; quantidade: number }>();
    
    dadosFiltrados.forEach((item: any) => {
      let chave = '';
      switch (slide.agrupamento) {
        case 'convenio':
          chave = item.convenio || 'Sem Convênio';
          break;
        case 'setor':
          chave = item.setor || 'Sem Setor';
          break;
        case 'tipo':
          chave = item.tipo || 'Sem Tipo';
          break;
        case 'medico':
          chave = item.medico || 'Sem Médico';
          break;
        case 'mesAno':
          if (item.dataFaturado) {
            const d = new Date(item.dataFaturado);
            chave = `${d.getMonth() + 1}/${d.getFullYear()}`;
          } else {
            chave = 'Sem Data';
          }
          break;
        default:
          chave = 'Outros';
      }
      
      const atual = grupos.get(chave) || { valor: 0, quantidade: 0 };
      atual.valor += parseFloat(item.valorTotal || '0');
      atual.quantidade += parseInt(item.quantidade || '0');
      grupos.set(chave, atual);
    });
    
    const labels = Array.from(grupos.keys()).slice(0, 10);
    const valores = labels.map(l => {
      const g = grupos.get(l)!;
      return slide.metrica === 'valor' ? g.valor : g.quantidade;
    });
    
    return {
      labels,
      datasets: [{
        label: slide.metrica === 'valor' ? 'Valor (R$)' : 'Quantidade',
        data: valores,
        backgroundColor: coresGraficos,
        borderColor: coresGraficos.map(c => c.replace('0.8', '1')),
        borderWidth: 1,
      }]
    };
  }, [dadosFiltrados]);

  // Exportar para Excel
  const handleExportarExcel = () => {
    const excelData = dadosFiltrados.map((item: any) => {
      const row: Record<string, any> = {};
      colunasVisiveis.forEach(colId => {
        const coluna = colunasDisponiveis.find(c => c.id === colId);
        if (coluna) {
          let valor = item[colId];
          if (coluna.tipo === 'moeda') {
            valor = parseFloat(valor || '0');
          } else if (coluna.tipo === 'data' && valor) {
            valor = new Date(valor).toLocaleDateString('pt-BR');
          }
          row[coluna.label] = valor;
        }
      });
      return row;
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `relatorio_tasy_${mesSelecionado}_${anoSelecionado}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  if (!estabelecimentoAtual) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <p className="text-muted-foreground">Selecione um estabelecimento para continuar</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Relatórios Tasy</h1>
            <p className="text-muted-foreground">
              Análise avançada dos dados importados do Tasy com IA
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleAnalisarIA}>
              <Sparkles className="h-4 w-4 mr-2" />
              Sugestões da IA
            </Button>
            <Button variant="outline" onClick={handleExportarExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
            <Button 
              onClick={() => setModoApresentacao(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Monitor className="h-4 w-4 mr-2" />
              Modo Apresentação
            </Button>
          </div>
        </div>

        {/* Resumo do Relatório */}
        {dadosTasy && dadosTasy.length > 0 && (
          <ResumoRelatorio dados={dadosTasy} />
        )}

        {/* Tabs */}
        <Tabs defaultValue="construtor" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="construtor" className="flex items-center gap-2">
              <Layout className="h-4 w-4" />
              Construtor
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="tabela" className="flex items-center gap-2">
              <Columns className="h-4 w-4" />
              Tabela
            </TabsTrigger>
            <TabsTrigger value="comparativo" className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Comparativo
            </TabsTrigger>
          </TabsList>

          {/* Aba Construtor com Drag-and-Drop */}
          <TabsContent value="construtor">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Painel de Campos (Drag Source) */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <GripVertical className="h-4 w-4" />
                    Campos Disponíveis
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Arraste os campos para os eixos do gráfico
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Dimensões */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">DIMENSÕES (Eixo X)</Label>
                    <div className="space-y-1">
                      {camposDisponiveis.filter(c => c.tipo === 'dimensao').map((campo) => (
                        <div
                          key={campo.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, campo.id)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-2 p-2 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${
                            draggedField === campo.id ? 'opacity-50 border-primary' : 'hover:bg-accent'
                          } ${eixoX === campo.id ? 'bg-blue-50 border-blue-300 dark:bg-blue-950' : ''}`}
                        >
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                          <campo.icon className="h-4 w-4 text-blue-500" />
                          <span className="text-sm">{campo.label}</span>
                          {eixoX === campo.id && (
                            <Badge variant="secondary" className="ml-auto text-xs">X</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Métricas */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">MÉTRICAS (Eixo Y)</Label>
                    <div className="space-y-1">
                      {camposDisponiveis.filter(c => c.tipo === 'metrica').map((campo) => (
                        <div
                          key={campo.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, campo.id)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-2 p-2 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${
                            draggedField === campo.id ? 'opacity-50 border-primary' : 'hover:bg-accent'
                          } ${eixoY.includes(campo.id) ? 'bg-green-50 border-green-300 dark:bg-green-950' : ''}`}
                        >
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                          <campo.icon className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{campo.label}</span>
                          {eixoY.includes(campo.id) && (
                            <Badge variant="secondary" className="ml-auto text-xs">Y</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tipo de Gráfico */}
                  <div className="pt-4 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">TIPO DE GRÁFICO</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={tipoGrafico === 'bar' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTipoGrafico('bar')}
                        className="flex flex-col items-center py-3 h-auto"
                      >
                        <BarChart3 className="h-5 w-5 mb-1" />
                        <span className="text-xs">Barras</span>
                      </Button>
                      <Button
                        variant={tipoGrafico === 'pie' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTipoGrafico('pie')}
                        className="flex flex-col items-center py-3 h-auto"
                      >
                        <PieChart className="h-5 w-5 mb-1" />
                        <span className="text-xs">Pizza</span>
                      </Button>
                      <Button
                        variant={tipoGrafico === 'line' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTipoGrafico('line')}
                        className="flex flex-col items-center py-3 h-auto"
                      >
                        <LineChart className="h-5 w-5 mb-1" />
                        <span className="text-xs">Linha</span>
                      </Button>
                    </div>
                  </div>

                  {/* Fonte de Dados */}
                  <div className="pt-4 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">FONTE DE DADOS</Label>
                    <Select value={fonteDados} onValueChange={(v) => setFonteDados(v as 'antiga' | 'faturadoTasy')}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione a fonte" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="antiga">Importação Tasy (Antiga)</SelectItem>
                        <SelectItem value="faturadoTasy">Faturado Tasy (Nova)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Período */}
                  <div className="pt-4 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">PERÍODO</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(parseInt(v))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Mês" />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((mes) => (
                            <SelectItem key={mes.value} value={String(mes.value)}>
                              {mes.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(parseInt(v))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map((ano) => (
                            <SelectItem key={ano} value={String(ano)}>
                              {ano}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="pt-4 border-t space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setSalvarDialogAberto(true)}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Dashboard
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setCarregarDialogAberto(true)}
                    >
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Carregar Dashboard
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Área do Gráfico com Drop Zones */}
              <div className="lg:col-span-3 space-y-4">
                {/* Drop Zones */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Drop Zone Eixo X */}
                  <div
                    onDragOver={(e) => handleDragOver(e, 'eixoX')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'eixoX')}
                    className={`p-4 border-2 border-dashed rounded-lg transition-colors ${
                      dragOverTarget === 'eixoX' 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                        : 'border-muted-foreground/25'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      <span>Eixo X (Categorias):</span>
                      <Badge variant="outline" className="ml-auto">
                        {camposDisponiveis.find(c => c.id === eixoX)?.label || eixoX}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Drop Zone Eixo Y */}
                  <div
                    onDragOver={(e) => handleDragOver(e, 'eixoY')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'eixoY')}
                    className={`p-4 border-2 border-dashed rounded-lg transition-colors ${
                      dragOverTarget === 'eixoY' 
                        ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                        : 'border-muted-foreground/25'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                      <TrendingUp className="h-4 w-4" />
                      <span>Eixo Y (Valores):</span>
                      <div className="flex gap-1 flex-wrap ml-auto">
                        {eixoY.map(metrica => (
                          <Badge 
                            key={metrica} 
                            variant="outline" 
                            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => {
                              if (eixoY.length > 1) {
                                setEixoY(prev => prev.filter(m => m !== metrica));
                              }
                            }}
                            title={eixoY.length > 1 ? "Clique para remover" : ""}
                          >
                            {camposDisponiveis.find(c => c.id === metrica)?.label || metrica}
                            {eixoY.length > 1 && <X className="h-3 w-3 ml-1" />}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-green-600">
                        {totais.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <p className="text-xs text-muted-foreground">Valor Total</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{totais.quantidade.toLocaleString('pt-BR')}</div>
                      <p className="text-xs text-muted-foreground">Quantidade</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-blue-600">
                        {totais.materiais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <p className="text-xs text-muted-foreground">Materiais</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-purple-600">
                        {totais.honorarios.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <p className="text-xs text-muted-foreground">Honorários</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Gráfico */}
                <Card>
                  <CardContent className="pt-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-[400px]">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : !dadosFiltrados.length ? (
                      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                        <BarChart3 className="h-16 w-16 mb-4 opacity-50" />
                        <p>Nenhum dado encontrado para o período selecionado</p>
                      </div>
                    ) : (
                      <div className="h-[400px]">
                        {tipoGrafico === 'bar' ? (
                          <Bar data={dadosGrafico} options={opcoesGrafico} />
                        ) : tipoGrafico === 'pie' ? (
                          <Pie data={dadosGrafico} options={opcoesGrafico} />
                        ) : (
                          <Line data={dadosGrafico} options={opcoesGrafico} />
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Clique em uma barra ou fatia para ver os detalhes
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Aba Templates */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Templates de Relatórios
                </CardTitle>
                <CardDescription>
                  Selecione um template pré-configurado para começar rapidamente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templatesRelatorios.map((template) => (
                    <Card 
                      key={template.id} 
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleAplicarTemplate(template)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-lg bg-primary/10">
                            <template.icon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{template.nome}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.descricao}
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <Badge variant="outline">
                                {template.config.tipoGrafico === 'bar' ? 'Barras' : 
                                 template.config.tipoGrafico === 'pie' ? 'Pizza' : 'Linha'}
                              </Badge>
                              <Badge variant="secondary">
                                {template.config.metricaGrafico === 'valor' ? 'Valor' : 'Quantidade'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Tabela */}
          <TabsContent value="tabela">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Dados Detalhados</CardTitle>
                    <CardDescription>
                      {dadosFiltrados.length.toLocaleString('pt-BR')} registros encontrados
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Columns className="h-4 w-4 mr-2" />
                        Colunas
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {colunasDisponiveis.map((coluna) => (
                        <DropdownMenuCheckboxItem
                          key={coluna.id}
                          checked={colunasVisiveis.includes(coluna.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setColunasVisiveis([...colunasVisiveis, coluna.id]);
                            } else {
                              setColunasVisiveis(colunasVisiveis.filter(c => c !== coluna.id));
                            }
                          }}
                        >
                          {coluna.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        {colunasVisiveis.map((colId) => {
                          const coluna = colunasDisponiveis.find(c => c.id === colId);
                          return (
                            <TableHead key={colId} className={coluna?.tipo === 'moeda' || coluna?.tipo === 'numero' ? 'text-right' : ''}>
                              {coluna?.label}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dadosFiltrados.slice(0, 100).map((item: any, index: number) => (
                        <TableRow key={`row-${index}`}>
                          {colunasVisiveis.map((colId) => {
                            const coluna = colunasDisponiveis.find(c => c.id === colId);
                            let valor = item[colId];
                            
                            if (coluna?.tipo === 'moeda') {
                              valor = parseFloat(valor || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            } else if (coluna?.tipo === 'data' && valor) {
                              valor = new Date(valor).toLocaleDateString('pt-BR');
                            }
                            
                            return (
                              <TableCell 
                                key={colId} 
                                className={`${coluna?.tipo === 'moeda' || coluna?.tipo === 'numero' ? 'text-right' : ''} ${coluna?.tipo === 'moeda' ? 'font-medium text-green-600' : ''}`}
                              >
                                {valor || '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {dadosFiltrados.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando os primeiros 100 registros de {dadosFiltrados.length.toLocaleString('pt-BR')}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Comparativo */}
          <TabsContent value="comparativo">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="h-5 w-5" />
                  Comparativo entre Períodos
                </CardTitle>
                <CardDescription>
                  Compare o faturamento entre dois períodos diferentes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Período 1 */}
                  <div className="space-y-2">
                    <Label>Período 1</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Mês" />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((mes) => (
                            <SelectItem key={mes.value} value={String(mes.value)}>
                              {mes.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map((ano) => (
                            <SelectItem key={ano} value={String(ano)}>
                              {ano}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {totais.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {totais.quantidade.toLocaleString('pt-BR')} itens
                      </p>
                    </div>
                  </div>
                  
                  {/* Período 2 */}
                  <div className="space-y-2">
                    <Label>Período 2</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={String(periodo2Mes)} onValueChange={(v) => setPeriodo2Mes(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Mês" />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((mes) => (
                            <SelectItem key={mes.value} value={String(mes.value)}>
                              {mes.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(periodo2Ano)} onValueChange={(v) => setPeriodo2Ano(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map((ano) => (
                            <SelectItem key={ano} value={String(ano)}>
                              {ano}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      {dadosTasyPeriodo2 ? (
                        <>
                          <p className="text-2xl font-bold text-green-600">
                            {dadosTasyPeriodo2.reduce((acc: number, item: any) => acc + parseFloat(item.valorTotal || '0'), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {dadosTasyPeriodo2.reduce((acc: number, item: any) => acc + parseInt(item.quantidade || '0'), 0).toLocaleString('pt-BR')} itens
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Carregando...</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gráfico Comparativo */}
                {dadosTasyPeriodo2 && (
                  <div className="h-[400px]">
                    <Bar 
                      data={{
                        labels: dadosAgrupados.slice(0, 10).map(g => g.label),
                        datasets: [
                          {
                            label: `${meses[mesSelecionado - 1]?.label}/${anoSelecionado}`,
                            data: dadosAgrupados.slice(0, 10).map(g => g.valor),
                            backgroundColor: 'rgba(59, 130, 246, 0.8)',
                          },
                          {
                            label: `${meses[periodo2Mes - 1]?.label}/${periodo2Ano}`,
                            data: dadosAgrupados.slice(0, 10).map(g => {
                              const grupo2 = dadosTasyPeriodo2.filter((item: any) => {
                                switch (eixoX) {
                                  case 'convenio': return item.convenio === g.label;
                                  case 'setor': return item.setor === g.label;
                                  case 'tipo': return item.tipo === g.label;
                                  case 'medico': return item.medico === g.label;
                                  default: return false;
                                }
                              });
                              return grupo2.reduce((acc: number, item: any) => acc + parseFloat(item.valorTotal || '0'), 0);
                            }),
                            backgroundColor: 'rgba(16, 185, 129, 0.8)',
                          }
                        ]
                      }} 
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: true },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
                              callback: (value: any) => `R$ ${(value / 1000).toFixed(0)}k`
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Drill-down */}
        <Dialog open={drillDownAberto} onOpenChange={setDrillDownAberto}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {drillDownTitulo}
              </DialogTitle>
              <DialogDescription>
                {drillDownDados.length} itens encontrados
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Atendimento</TableHead>
                    <TableHead>Guia</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillDownDados.slice(0, 100).map((item: any, index: number) => (
                    <TableRow key={`drill-${index}`}>
                      <TableCell>{item.atendimento}</TableCell>
                      <TableCell>{item.guia}</TableCell>
                      <TableCell>{item.paciente}</TableCell>
                      <TableCell>{item.codigo || item.codigoConvenio}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.descricao}</TableCell>
                      <TableCell className="text-right">{item.quantidade}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {parseFloat(item.valorTotal || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {drillDownDados.length > 100 && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Mostrando os primeiros 100 itens de {drillDownDados.length}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDrillDownAberto(false)}>
                Fechar
              </Button>
              <Button onClick={() => {
                const excelData = drillDownDados.map((item: any) => ({
                  'Atendimento': item.atendimento,
                  'Guia': item.guia,
                  'Paciente': item.paciente,
                  'Código': item.codigo || item.codigoConvenio,
                  'Descrição': item.descricao,
                  'Quantidade': item.quantidade,
                  'Valor Total': parseFloat(item.valorTotal || '0'),
                }));
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(excelData);
                XLSX.utils.book_append_sheet(wb, ws, "Detalhes");
                XLSX.writeFile(wb, `detalhes_${drillDownTitulo.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
              }}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Sugestões da IA */}
        <Dialog open={sugestoesIAAberto} onOpenChange={setSugestoesIAAberto}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Sugestões da IA
              </DialogTitle>
              <DialogDescription>
                Análise inteligente dos seus dados com recomendações personalizadas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[400px] overflow-auto">
              {analisandoIA ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Analisando seus dados...</p>
                </div>
              ) : sugestoesIA.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma sugestão disponível
                </div>
              ) : (
                sugestoesIA.map((sugestao, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleAplicarSugestaoIA(sugestao)}
                  >
                    <div className={`p-2 rounded-lg ${
                      sugestao.tipo === 'grafico' ? 'bg-blue-100 dark:bg-blue-900' :
                      sugestao.tipo === 'alerta' ? 'bg-yellow-100 dark:bg-yellow-900' :
                      'bg-green-100 dark:bg-green-900'
                    }`}>
                      {sugestao.tipo === 'grafico' ? (
                        <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : sugestao.tipo === 'alerta' ? (
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      ) : (
                        <Lightbulb className="h-5 w-5 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{sugestao.titulo}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {sugestao.confianca}% confiança
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {sugestao.descricao}
                      </p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSugestoesIAAberto(false)}>
                Fechar
              </Button>
              <Button onClick={handleAnalisarIA} disabled={analisandoIA}>
                <Wand2 className="h-4 w-4 mr-2" />
                Analisar Novamente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Salvar Dashboard */}
        <Dialog open={salvarDialogAberto} onOpenChange={setSalvarDialogAberto}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Salvar Dashboard
              </DialogTitle>
              <DialogDescription>
                Salve a configuração atual para acesso rápido
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Dashboard</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Faturamento Mensal por Convênio"
                  value={nomeDashboard}
                  onChange={(e) => setNomeDashboard(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição (opcional)</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva o propósito deste dashboard..."
                  value={descricaoDashboard}
                  onChange={(e) => setDescricaoDashboard(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSalvarDialogAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvarDashboard} disabled={salvarDashboardMutation.isPending}>
                {salvarDashboardMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Carregar Dashboard */}
        <Dialog open={carregarDialogAberto} onOpenChange={setCarregarDialogAberto}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Carregar Dashboard
              </DialogTitle>
              <DialogDescription>
                Selecione um dashboard salvo para carregar
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {!dashboardsSalvos?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum dashboard salvo
                </div>
              ) : (
                dashboardsSalvos.map((dashboard: any) => (
                  <div
                    key={dashboard.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => handleCarregarDashboard(dashboard)}
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorito(dashboard);
                        }}
                      >
                        {dashboard.favorito ? (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <div>
                        <p className="font-medium">{dashboard.nome}</p>
                        {dashboard.descricao && (
                          <p className="text-sm text-muted-foreground">{dashboard.descricao}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(dashboard.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDashboardParaExcluir(dashboard.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCarregarDialogAberto(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação de Exclusão */}
        <AlertDialog open={!!dashboardParaExcluir} onOpenChange={() => setDashboardParaExcluir(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Dashboard</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este dashboard? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (dashboardParaExcluir) {
                    excluirDashboardMutation.mutate({ id: dashboardParaExcluir });
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modo Apresentação em Tela Cheia */}
        {modoApresentacao && (
          <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header do Modo Apresentação */}
            <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent z-10">
              <div className="flex items-center gap-4">
                <div className="text-white">
                  <h2 className="text-xl font-bold">{estabelecimentoAtual?.nome}</h2>
                  <p className="text-sm text-white/70">
                    {meses.find(m => m.value === mesSelecionado)?.label} {anoSelecionado}
                  </p>
                </div>
              </div>
              
              {/* Controles */}
              <div className="flex items-center gap-2">
                {/* Seletor de Intervalo */}
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                  <Clock className="h-4 w-4 text-white/70" />
                  <Select
                    value={intervaloRotacao.toString()}
                    onValueChange={(v) => setIntervaloRotacao(parseInt(v))}
                  >
                    <SelectTrigger className="w-20 h-8 bg-transparent border-0 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5s</SelectItem>
                      <SelectItem value="10">10s</SelectItem>
                      <SelectItem value="15">15s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                      <SelectItem value="60">1min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Navegação */}
                <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setSlideAtual((prev) => (prev - 1 + slidesApresentacao.length) % slidesApresentacao.length)}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setRotacaoAutomatica(!rotacaoAutomatica)}
                  >
                    {rotacaoAutomatica ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/20"
                    onClick={() => setSlideAtual((prev) => (prev + 1) % slidesApresentacao.length)}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Indicador de Slide */}
                <div className="bg-white/10 rounded-lg px-3 py-1.5 text-white text-sm">
                  {slideAtual + 1} / {slidesApresentacao.length}
                </div>
                
                {/* Botão Fechar */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/20"
                  onClick={() => setModoApresentacao(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {/* Conteúdo do Slide */}
            <div className="flex items-center justify-center h-full p-16">
              <div className="w-full max-w-6xl">
                {/* Título do Slide */}
                <h3 className="text-3xl font-bold text-white text-center mb-8">
                  {slidesApresentacao[slideAtual]?.titulo}
                </h3>
                
                {/* Gráfico */}
                <div className="bg-white/5 backdrop-blur rounded-2xl p-8 shadow-2xl">
                  <div className="h-[500px]">
                    {slidesApresentacao[slideAtual]?.tipoGrafico === 'bar' && (
                      <Bar
                        data={gerarDadosSlide(slidesApresentacao[slideAtual])}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              display: true,
                              position: 'top',
                              labels: { color: 'white', font: { size: 14 } }
                            },
                          },
                          scales: {
                            x: {
                              ticks: { color: 'white', font: { size: 12 } },
                              grid: { color: 'rgba(255,255,255,0.1)' }
                            },
                            y: {
                              ticks: { color: 'white', font: { size: 12 } },
                              grid: { color: 'rgba(255,255,255,0.1)' }
                            }
                          }
                        }}
                      />
                    )}
                    {slidesApresentacao[slideAtual]?.tipoGrafico === 'pie' && (
                      <Pie
                        data={gerarDadosSlide(slidesApresentacao[slideAtual])}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              display: true,
                              position: 'right',
                              labels: { color: 'white', font: { size: 14 } }
                            },
                          },
                        }}
                      />
                    )}
                    {slidesApresentacao[slideAtual]?.tipoGrafico === 'line' && (
                      <Line
                        data={gerarDadosSlide(slidesApresentacao[slideAtual])}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              display: true,
                              position: 'top',
                              labels: { color: 'white', font: { size: 14 } }
                            },
                          },
                          scales: {
                            x: {
                              ticks: { color: 'white', font: { size: 12 } },
                              grid: { color: 'rgba(255,255,255,0.1)' }
                            },
                            y: {
                              ticks: { color: 'white', font: { size: 12 } },
                              grid: { color: 'rgba(255,255,255,0.1)' }
                            }
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
                
                {/* Totais */}
                <div className="flex justify-center gap-8 mt-8">
                  <div className="bg-white/10 rounded-xl px-6 py-3 text-center">
                    <p className="text-white/70 text-sm">Valor Total</p>
                    <p className="text-2xl font-bold text-white">
                      {totais.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl px-6 py-3 text-center">
                    <p className="text-white/70 text-sm">Quantidade</p>
                    <p className="text-2xl font-bold text-white">
                      {totais.quantidade.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl px-6 py-3 text-center">
                    <p className="text-white/70 text-sm">Registros</p>
                    <p className="text-2xl font-bold text-white">
                      {dadosFiltrados.length.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Indicadores de Slide (Dots) */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
              {slidesApresentacao.map((_, index) => (
                <button
                  key={index}
                  className={`w-3 h-3 rounded-full transition-all ${
                    index === slideAtual 
                      ? 'bg-white scale-125' 
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                  onClick={() => setSlideAtual(index)}
                />
              ))}
            </div>
            
            {/* Instruções de Teclado */}
            <div className="absolute bottom-4 right-4 text-white/50 text-xs">
              ESC para sair • ←→ navegar • P pausar • Espaço avançar
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
