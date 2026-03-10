import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import {
  ArrowLeft,
  Download, 
  RefreshCw, 
  Calendar, 
  FileSpreadsheet,
  CreditCard,
  Hash,
  User,
  DollarSign,
  FileText,
  Receipt,
  Package,
  Pill,
  Syringe,
  Bed,
  Stethoscope,
  Activity,
  Shield,
  Key,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  BarChart3,
  Loader2,
  Eye,
  ArrowUpDown,
  ShieldAlert,
  Info,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  MessageSquare,
  UserCheck,
  History,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  FileWarning,
  Wrench,
  Brain,
  Lightbulb,
  Undo2,
  CheckSquare,
  Square,
  Printer,
  ClipboardList,
  FileCheck,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useMemo, useState, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import { toast } from "sonner";

// Formatar valor em reais
const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
};

// Formatar data
const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
};

// Formatar data e hora
const formatDateTime = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

// Ícones por tipo de item
const getTipoIcon = (tipo: string) => {
  const tipoLower = (tipo || "").toLowerCase();
  if (tipoLower.includes("medicamento") || tipoLower.includes("med")) return Pill;
  if (tipoLower.includes("material") || tipoLower.includes("mat")) return Package;
  if (tipoLower.includes("diária") || tipoLower.includes("diaria")) return Bed;
  if (tipoLower.includes("taxa")) return Receipt;
  if (tipoLower.includes("procedimento") || tipoLower.includes("proc")) return Stethoscope;
  if (tipoLower.includes("exame")) return Activity;
  if (tipoLower.includes("sadt")) return Syringe;
  return FileText;
};

// Cores por tipo de item
const getTipoColor = (tipo: string) => {
  const tipoLower = (tipo || "").toLowerCase();
  if (tipoLower.includes("medicamento") || tipoLower.includes("med")) return "bg-green-100 text-green-800";
  if (tipoLower.includes("material") || tipoLower.includes("mat")) return "bg-blue-100 text-blue-800";
  if (tipoLower.includes("diária") || tipoLower.includes("diaria")) return "bg-purple-100 text-purple-800";
  if (tipoLower.includes("taxa")) return "bg-yellow-100 text-yellow-800";
  if (tipoLower.includes("procedimento") || tipoLower.includes("proc")) return "bg-red-100 text-red-800";
  if (tipoLower.includes("exame")) return "bg-cyan-100 text-cyan-800";
  if (tipoLower.includes("sadt")) return "bg-orange-100 text-orange-800";
  return "bg-gray-100 text-gray-800";
};

// Badge de status
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "conforme":
      return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Conforme</Badge>;
    case "divergente":
      return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="h-3 w-3 mr-1" />Divergente</Badge>;
    case "revisado":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Eye className="h-3 w-3 mr-1" />Revisado</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
  }
};

// Badge de severidade
const SeveridadeBadge = ({ severidade }: { severidade: string }) => {
  switch (severidade) {
    case "critico":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Crítico</Badge>;
    case "alerta":
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><AlertTriangle className="h-3 w-3 mr-1" />Alerta</Badge>;
    default:
      return <Badge variant="outline"><Info className="h-3 w-3 mr-1" />Info</Badge>;
  }
};

// Badge de decisão do auditor
const DecisaoBadge = ({ decisao }: { decisao: string }) => {
  switch (decisao) {
    case "aceitar":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <ThumbsUp className="h-3 w-3 mr-1" />Aceita
        </Badge>
      );
    case "rejeitar":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          <ThumbsDown className="h-3 w-3 mr-1" />Rejeitada
        </Badge>
      );
    case "ignorar":
      return (
        <Badge className="bg-gray-100 text-gray-700 border-gray-200">
          <XCircle className="h-3 w-3 mr-1" />Ignorada
        </Badge>
      );
    default:
      return <Badge variant="outline">{decisao}</Badge>;
  }
};

export default function ContaConvenioDetalhes() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const numeroConta = params.get("numeroConta") || "";
  const estabelecimentoId = parseInt(params.get("estabelecimentoId") || "0") || estabelecimentoAtual?.id || 0;

  const [activeTab, setActiveTab] = useState("itens");
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean;
    div: any;
    acao: "aceitar" | "rejeitar" | "ajustar";
  }>({ open: false, div: null, acao: "aceitar" });
  const [feedbackObs, setFeedbackObs] = useState("");
  const [feedbackValor, setFeedbackValor] = useState("");
  const [historicoDialog, setHistoricoDialog] = useState<{ open: boolean; div: any }>({ open: false, div: null });
  const [filtroFeedback, setFiltroFeedback] = useState<string>("todos");

  // Estado para aba de Falhas de Prontuário
  const [falhaDialog, setFalhaDialog] = useState(false);
  const [falhaCategoria, setFalhaCategoria] = useState("");
  const [falhaTipo, setFalhaTipo] = useState("");
  const [falhaDescricao, setFalhaDescricao] = useState("");
  const [falhaSeveridade, setFalhaSeveridade] = useState<"leve" | "moderada" | "grave" | "critica">("moderada");

  // Estado para aba de Ajustes de Itens
  const [ajusteDialog, setAjusteDialog] = useState<{
    open: boolean;
    tipo: "ALTERAR_QUANTIDADE" | "ALTERAR_VALOR" | "ADICIONAR_ITEM" | "REMOVER_ITEM" | "ALTERAR_SETOR";
    item?: any;
  }>({ open: false, tipo: "ALTERAR_QUANTIDADE" });
  const [ajusteQtd, setAjusteQtd] = useState("");
  const [ajusteValor, setAjusteValor] = useState("");
  const [ajusteCodigo, setAjusteCodigo] = useState("");
  const [ajusteDescricao, setAjusteDescricao] = useState("");
  const [ajusteTipoItem, setAjusteTipoItem] = useState("PROCEDIMENTO");
  const [ajusteJustificativa, setAjusteJustificativa] = useState("");
  const [ajusteSetor, setAjusteSetor] = useState("");

  // Filtros para a tabela de itens na aba Ajustes
  const [filtroSetorAjuste, setFiltroSetorAjuste] = useState<string>("todos");
  const [filtroDataAjuste, setFiltroDataAjuste] = useState<string>("");

  // Buscar itens da conta na nova tabela
  const { data: itensData, isLoading, refetch } = trpc.contasConvenio.listarItens.useQuery(
    {
      numeroConta,
      estabelecimentoId,
      tipoItem: tipoFiltro || undefined,
    },
    { enabled: !!numeroConta && !!estabelecimentoId }
  );

  // Buscar divergências
  const { data: divergenciasData, isLoading: isLoadingDiv } = trpc.contasConvenio.getDivergencias.useQuery(
    {
      numeroConta,
      estabelecimentoId,
    },
    { enabled: !!numeroConta && !!estabelecimentoId }
  );

  // Buscar falhas de prontuário
  const { data: falhasData, refetch: refetchFalhas } = trpc.auditoria.listarFalhas.useQuery(
    { numeroConta, estabelecimentoId },
    { enabled: !!numeroConta && !!estabelecimentoId }
  );

  // Buscar ajustes de auditoria
  const { data: ajustesData, refetch: refetchAjustes } = trpc.auditoria.listarAjustes.useQuery(
    { numeroConta, estabelecimentoId },
    { enabled: !!numeroConta && !!estabelecimentoId }
  );

  // Buscar categorias de falhas
  const { data: categoriasFalhas } = trpc.auditoria.categoriasFalhas.useQuery();

  // Buscar sugestões inteligentes de falhas
  const { data: sugestoesFalhas } = trpc.auditoria.sugestoesFalhas.useQuery(
    { estabelecimentoId, convenio: itensData?.items?.[0]?.convenio || undefined },
    { enabled: !!estabelecimentoId }
  );

  // Buscar sugestões de ajustes
  const { data: sugestoesAjustes } = trpc.auditoria.sugestoesAjustes.useQuery(
    { estabelecimentoId, convenio: itensData?.items?.[0]?.convenio || undefined },
    { enabled: !!estabelecimentoId }
  );

  // Mutations para falhas
  const registrarFalhaMutation = trpc.auditoria.registrarFalha.useMutation({
    onSuccess: () => {
      toast.success("Falha de prontuário registrada!");
      setFalhaDialog(false);
      setFalhaCategoria("");
      setFalhaTipo("");
      setFalhaDescricao("");
      setFalhaSeveridade("moderada");
      refetchFalhas();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarStatusFalhaMutation = trpc.auditoria.atualizarStatusFalha.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetchFalhas(); },
    onError: (err) => toast.error(err.message),
  });

  const removerFalhaMutation = trpc.auditoria.removerFalha.useMutation({
    onSuccess: () => { toast.success("Falha removida!"); refetchFalhas(); },
    onError: (err) => toast.error(err.message),
  });

  // Mutations para ajustes
  const registrarAjusteMutation = trpc.auditoria.registrarAjuste.useMutation({
    onSuccess: () => {
      toast.success("Ajuste registrado com sucesso!");
      setAjusteDialog({ open: false, tipo: "ALTERAR_QUANTIDADE" });
      setAjusteQtd(""); setAjusteValor(""); setAjusteCodigo("");
      setAjusteDescricao(""); setAjusteJustificativa(""); setAjusteSetor("");
      refetchAjustes();
      refetch(); // Recarregar itens
    },
    onError: (err) => toast.error(err.message),
  });

  const reverterAjusteMutation = trpc.auditoria.reverterAjuste.useMutation({
    onSuccess: () => {
      toast.success("Ajuste revertido!");
      refetchAjustes();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Buscar feedbacks existentes para esta conta
  const { data: feedbacksData, refetch: refetchFeedbacks } = trpc.contasConvenio.listarFeedbacks.useQuery(
    {
      numeroConta,
      estabelecimentoId,
    },
    { enabled: !!numeroConta && !!estabelecimentoId }
  );

  // Criar um mapa de feedbacks por chave (codigoItem + tipoDivergencia)
  const feedbackMap = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!feedbacksData) return map;
    for (const fb of feedbacksData) {
      const key = `${fb.codigoItem || ""}_${fb.tipoDivergencia}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(fb);
    }
    return map;
  }, [feedbacksData]);

  // Resumo de feedbacks
  const feedbackResumo = useMemo(() => {
    if (!feedbacksData) return { total: 0, aceitas: 0, rejeitadas: 0, ignoradas: 0 };
    return {
      total: feedbacksData.length,
      aceitas: feedbacksData.filter((f: any) => f.decisao === "aceitar").length,
      rejeitadas: feedbacksData.filter((f: any) => f.decisao === "rejeitar").length,
      ignoradas: feedbacksData.filter((f: any) => f.decisao === "ignorar").length,
    };
  }, [feedbacksData]);

  // Função para obter feedback mais recente de uma divergência
  const getFeedbackForDiv = (div: any) => {
    const key = `${div.codigoItem || ""}_${div.tipo}`;
    const feedbacks = feedbackMap.get(key);
    if (!feedbacks || feedbacks.length === 0) return null;
    // Retorna o mais recente
    return feedbacks[0];
  };

  // Filtrar divergências por status de feedback
  const divergenciasFiltradas = useMemo(() => {
    if (!divergenciasData?.divergencias) return [];
    if (filtroFeedback === "todos") return divergenciasData.divergencias;
    
    return divergenciasData.divergencias.filter((div: any) => {
      const fb = getFeedbackForDiv(div);
      if (filtroFeedback === "pendente") return !fb;
      if (filtroFeedback === "aceitar") return fb?.decisao === "aceitar";
      if (filtroFeedback === "rejeitar") return fb?.decisao === "rejeitar";
      return true;
    });
  }, [divergenciasData?.divergencias, filtroFeedback, feedbackMap]);

  // Mutation para registrar feedback
  const feedbackMutation = trpc.contasConvenio.registrarFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback do auditor registrado com sucesso!");
      setFeedbackDialog({ open: false, div: null, acao: "aceitar" });
      setFeedbackObs("");
      setFeedbackValor("");
      refetchFeedbacks();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFeedback = (div: any, acao: "aceitar" | "rejeitar" | "ajustar") => {
    if (acao === "aceitar") {
      // Aceitar direto sem dialog
      feedbackMutation.mutate({
        numeroConta,
        estabelecimentoId,
        padraoId: div.padraoId,
        codigoItem: div.codigoItem,
        tipoDivergencia: div.tipo,
        acao: "aceitar",
      });
    } else {
      // Abrir dialog para rejeitar ou ajustar
      setFeedbackDialog({ open: true, div, acao });
      setFeedbackObs("");
      setFeedbackValor(div.valorEsperado?.toString() || "");
    }
  };

  const submitFeedback = () => {
    if (!feedbackDialog.div) return;
    feedbackMutation.mutate({
      numeroConta,
      estabelecimentoId,
      padraoId: feedbackDialog.div.padraoId,
      codigoItem: feedbackDialog.div.codigoItem,
      tipoDivergencia: feedbackDialog.div.tipo,
      acao: feedbackDialog.acao === "ajustar" ? "ajustar" : "rejeitar",
      observacao: feedbackObs || undefined,
      valorSugerido: feedbackDialog.acao === "ajustar" ? feedbackValor : undefined,
    });
  };

  // Mutation para comparar com padrões
  const gerarSnapshotMutation = trpc.conferencia.gerarSnapshot.useMutation({
    onSuccess: (result) => {
      toast.success(`Snapshot gerado! ${result.resumo.totalItens} itens, ${result.resumo.divergenciasAceitas} divergências, ${result.resumo.falhasAbertas} falhas, ${result.resumo.ajustes} ajustes salvos.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const compararMutation = trpc.contasConvenio.compararComPadroes.useMutation({
    onSuccess: (result) => {
      if (result.statusGeral === "conforme") {
        toast.success(`Conta conforme! ${result.totalItensAnalisados} itens analisados.`);
      } else {
        toast.warning(`${result.totalDivergencias} divergência(s) encontrada(s)`);
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Dados da conta (primeiro item para info geral)
  const primeiroItem = itensData?.items?.[0];
  const resumoGeral = itensData?.resumoGeral;
  const resumoPorTipo = itensData?.resumoPorTipo || [];

  // ============================================================
  // DADOS CONSOLIDADOS PARA RELATÓRIO DO FATURISTA
  // ============================================================
  const relatorioFaturistaData = useMemo(() => {
    const items: Array<{
      origem: string;
      codigo: string;
      descricaoItem: string;
      descricaoApontamento: string;
      severidade: string;
      decisaoAuditor: string;
      observacaoAuditor: string;
      impactoFinanceiro: number | null;
      acaoNecessaria: string;
    }> = [];

    // 1. Divergências encontradas na comparação com padrões
    if (divergenciasData?.divergencias) {
      for (const div of divergenciasData.divergencias) {
        const fb = getFeedbackForDiv(div);
        const diferenca = div.diferenca != null ? parseFloat(div.diferenca) : null;
        
        let acaoNecessaria = 'Verificar e corrigir';
        if (div.tipo === 'VALOR_ACIMA') acaoNecessaria = 'Revisar valor cobrado';
        else if (div.tipo === 'VALOR_ABAIXO') acaoNecessaria = 'Verificar se valor está correto';
        else if (div.tipo === 'QUANTIDADE_DIVERGENTE') acaoNecessaria = 'Corrigir quantidade';
        else if (div.tipo === 'ITEM_NAO_PADRAO') acaoNecessaria = 'Verificar se item é procedente';
        else if (div.tipo === 'ITEM_DUPLICADO') acaoNecessaria = 'Remover duplicidade';
        else if (div.tipo === 'ITEM_FALTANTE') acaoNecessaria = 'Adicionar item faltante';

        if (fb?.decisao === 'aceitar') {
          acaoNecessaria = 'Corrigir conforme auditoria (aceita)';
        } else if (fb?.decisao === 'rejeitar') {
          acaoNecessaria = 'Sem ação (rejeitada pelo auditor)';
        }

        items.push({
          origem: 'DIVERGÊNCIA',
          codigo: div.codigoItem || '',
          descricaoItem: div.descricaoItem || '',
          descricaoApontamento: div.mensagem || div.descricao || div.tipo || '-',
          severidade: div.severidade || 'info',
          decisaoAuditor: fb?.decisao || '',
          observacaoAuditor: fb?.justificativa || '',
          impactoFinanceiro: diferenca,
          acaoNecessaria,
        });
      }
    }

    // 2. Falhas de prontuário
    if (falhasData) {
      for (const falha of falhasData) {
        let acaoNecessaria = 'Providenciar documentação';
        if (falha.status === 'corrigida') acaoNecessaria = 'Já corrigida';
        else if (falha.status === 'justificada') acaoNecessaria = 'Justificada - verificar';

        items.push({
          origem: 'FALHA PRONTUÁRIO',
          codigo: '',
          descricaoItem: falha.categoriaFalha || '',
          descricaoApontamento: falha.tipoFalha + (falha.descricao ? ` - ${falha.descricao}` : ''),
          severidade: falha.severidade || 'moderada',
          decisaoAuditor: falha.status || 'aberta',
          observacaoAuditor: '',
          impactoFinanceiro: null,
          acaoNecessaria,
        });
      }
    }

    // 3. Ajustes de auditoria aplicados
    if (ajustesData) {
      for (const ajuste of ajustesData) {
        let descricao = '';
        let impacto: number | null = null;

        if (ajuste.tipoAjuste === 'ALTERAR_QUANTIDADE') {
          descricao = `Quantidade alterada: ${ajuste.quantidadeOriginal} → ${ajuste.quantidadeAjustada}`;
          const valorUnit = parseFloat(ajuste.valorOriginal || '0');
          const qtdOrig = parseFloat(ajuste.quantidadeOriginal || '0');
          const qtdAjust = parseFloat(ajuste.quantidadeAjustada || '0');
          impacto = (qtdAjust - qtdOrig) * valorUnit;
        } else if (ajuste.tipoAjuste === 'ALTERAR_VALOR') {
          descricao = `Valor alterado: ${formatCurrency(ajuste.valorOriginal)} → ${formatCurrency(ajuste.valorAjustado)}`;
          impacto = parseFloat(ajuste.valorAjustado || '0') - parseFloat(ajuste.valorOriginal || '0');
        } else if (ajuste.tipoAjuste === 'ADICIONAR_ITEM') {
          descricao = `Item adicionado à conta`;
          impacto = parseFloat(ajuste.valorAjustado || '0') * parseFloat(ajuste.quantidadeAjustada || '1');
        } else if (ajuste.tipoAjuste === 'REMOVER_ITEM') {
          descricao = `Item removido da conta`;
          impacto = -(parseFloat(ajuste.valorOriginal || '0') * parseFloat(ajuste.quantidadeOriginal || '1'));
        } else if (ajuste.tipoAjuste === 'ALTERAR_SETOR') {
          descricao = `Setor alterado: ${ajuste.setorOriginal || 'N/D'} → ${ajuste.setorAjustado || 'N/D'}`;
          impacto = null;
        }

        if (ajuste.justificativa) {
          descricao += ` | Motivo: ${ajuste.justificativa}`;
        }

        items.push({
          origem: 'AJUSTE',
          codigo: ajuste.codigoItem || '',
          descricaoItem: ajuste.descricaoItem || '',
          descricaoApontamento: descricao,
          severidade: 'info',
          decisaoAuditor: ajuste.status || 'aplicado',
          observacaoAuditor: ajuste.usuarioNome ? `Por ${ajuste.usuarioNome}` : '',
          impactoFinanceiro: impacto,
          acaoNecessaria: ajuste.status === 'revertido' ? 'Revertido - sem ação' : 'Aplicar no faturamento',
        });
      }
    }

    return items;
  }, [divergenciasData, falhasData, ajustesData, feedbackMap]);

  // Exportar Relatório do Faturista para Excel
  const handleExportRelatorioFaturista = () => {
    if (!relatorioFaturistaData.length) return;

    const data = relatorioFaturistaData.map((item, index) => ({
      '#': index + 1,
      'Origem': item.origem,
      'Código Item': item.codigo || '-',
      'Descrição Item': item.descricaoItem || '-',
      'Apontamento': item.descricaoApontamento,
      'Severidade': item.severidade,
      'Decisão Auditor': item.decisaoAuditor || 'Pendente',
      'Observação Auditor': item.observacaoAuditor || '-',
      'Impacto Financeiro': item.impactoFinanceiro != null ? item.impactoFinanceiro : '-',
      'Ação Necessária': item.acaoNecessaria,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Ajustar largura das colunas
    ws['!cols'] = [
      { wch: 5 },   // #
      { wch: 18 },  // Origem
      { wch: 15 },  // Código
      { wch: 30 },  // Descrição Item
      { wch: 50 },  // Apontamento
      { wch: 12 },  // Severidade
      { wch: 15 },  // Decisão
      { wch: 40 },  // Observação
      { wch: 18 },  // Impacto
      { wch: 35 },  // Ação
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Auditoria');
    XLSX.writeFile(wb, `relatorio_auditoria_conta_${numeroConta}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Relatório exportado com sucesso!');
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!itensData?.items?.length) return;

    const data = itensData.items.map((item: any) => ({
      "Nº Conta": item.numeroConta,
      "Tipo Item": item.tipoItem || "-",
      "Código": item.codigoItem || "-",
      "Descrição": item.descricaoItem || "-",
      "Setor": item.setor || "-",
      "Quantidade": parseFloat(item.quantidade || "1"),
      "Valor Unitário": parseFloat(item.valorUnitario || "0"),
      "Valor Total": parseFloat(item.valorTotal || "0"),
      "Data Execução": formatDate(item.dataExecucao),
      "Status": item.statusAnalise || "pendente",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    XLSX.writeFile(wb, `conta_${numeroConta}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Voltar para lista (preserva filtros via history)
  const handleVoltar = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/conta-convenio");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleVoltar}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Conta {numeroConta}</h1>
              <p className="text-muted-foreground">
                {primeiroItem?.convenio || "Convênio não identificado"} | 
                Paciente: {primeiroItem?.pacienteNome || "-"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                compararMutation.mutate({ numeroConta, estabelecimentoId });
              }}
              disabled={compararMutation.isPending}
            >
              {compararMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-2 h-4 w-4" />
              )}
              Comparar com Padrões
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button 
              size="sm" 
              onClick={handleExportExcel}
              disabled={!itensData?.items?.length}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => gerarSnapshotMutation.mutate({ numeroConta, estabelecimentoId })}
              disabled={gerarSnapshotMutation.isPending}
            >
              {gerarSnapshotMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileCheck className="mr-2 h-4 w-4" />
              )}
              Gerar Snapshot
            </Button>
          </div>
        </div>

        {/* Informações da Conta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Informações da Conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex items-start gap-3">
                <Hash className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Número da Conta</p>
                  <p className="font-semibold font-mono">{numeroConta}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Convênio</p>
                  <p className="font-semibold">{primeiroItem?.convenio || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-semibold">{primeiroItem?.pacienteNome || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Carteirinha</p>
                  <p className="font-semibold">{primeiroItem?.carteiraBeneficiario || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Data Execução</p>
                  <p className="font-semibold">{formatDate(primeiroItem?.dataExecucao)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Database className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Origem</p>
                  <p className="font-semibold">
                    {primeiroItem?.origem === "BANCO_CLIENTE" ? "Banco Hospital" : primeiroItem?.origem || "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="font-semibold text-green-600">{formatCurrency(resumoGeral?.valorTotal)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Total de Itens</p>
                  <p className="font-semibold">{resumoGeral?.totalItens || 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs por Tipo */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Valores por Tipo de Item
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card "Todos" */}
            <Card 
              className={`cursor-pointer transition-all ${!tipoFiltro ? "ring-2 ring-primary" : "hover:shadow-md"}`}
              onClick={() => setTipoFiltro(null)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Todos</p>
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(resumoGeral?.valorTotal)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {resumoGeral?.totalItens || 0} itens
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-gray-100 text-gray-800">
                    <FileText className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
            {resumoPorTipo.map((kpi: any) => {
              const TipoIcon = getTipoIcon(kpi.tipoItem);
              const tipoColor = getTipoColor(kpi.tipoItem);
              const isActive = tipoFiltro === kpi.tipoItem;
              
              return (
                <Card 
                  key={kpi.tipoItem} 
                  className={`cursor-pointer transition-all ${isActive ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                  onClick={() => setTipoFiltro(isActive ? null : kpi.tipoItem)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{kpi.tipoItem || "Outros"}</p>
                        <p className="text-2xl font-bold text-emerald-600">{formatCurrency(kpi.valorTotal)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {kpi.totalItens} {kpi.totalItens === 1 ? "item" : "itens"}
                        </p>
                      </div>
                      <div className={`p-3 rounded-full ${tipoColor}`}>
                        <TipoIcon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Totais de Análise */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Itens</p>
                  <p className="text-3xl font-bold">{resumoGeral?.totalItens || 0}</p>
                </div>
                <FileText className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conformes</p>
                  <p className="text-3xl font-bold text-green-600">{Number(resumoGeral?.totalConformes || 0)}</p>
                </div>
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Divergentes</p>
                  <p className="text-3xl font-bold text-red-600">{Number(resumoGeral?.totalDivergentes || 0)}</p>
                </div>
                <AlertTriangle className="h-10 w-10 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="text-3xl font-bold text-emerald-600">{formatCurrency(resumoGeral?.valorTotal)}</p>
                </div>
                <DollarSign className="h-10 w-10 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Itens, Divergências e Auditoria */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 max-w-4xl">
            <TabsTrigger value="itens" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Itens ({itensData?.items?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="divergencias" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Divergências ({divergenciasData?.divergencias?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="falhas" className="flex items-center gap-2">
              <FileWarning className="h-4 w-4" />
              Prontuário ({falhasData?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="ajustes" className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Ajustes ({ajustesData?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="auditoria" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Auditoria ({feedbackResumo.total})
            </TabsTrigger>
            <TabsTrigger value="relatorio-faturista" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Rel. Faturista
            </TabsTrigger>
          </TabsList>

          {/* Tab: Itens */}
          <TabsContent value="itens">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Itens da Conta {tipoFiltro && `- ${tipoFiltro}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !itensData?.items?.length ? (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nenhum item encontrado para esta conta</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Setor</TableHead>
                          <TableHead>Data Exec.</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor Unit.</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensData.items.map((item: any, index: number) => {
                          const TipoIcon = getTipoIcon(item.tipoItem);
                          const tipoColor = getTipoColor(item.tipoItem);
                          const hasDivergencias = item.divergencias && (item.divergencias as any[]).length > 0;
                          
                          return (
                            <TableRow key={item.id || index} className={hasDivergencias ? "bg-red-50/50" : ""}>
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={tipoColor}>
                                  <TipoIcon className="h-3 w-3 mr-1" />
                                  {item.tipoItem || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{item.codigoItem || "-"}</TableCell>
                              <TableCell className="max-w-xs truncate" title={item.descricaoItem}>
                                {item.descricaoItem || "-"}
                              </TableCell>
                              <TableCell>
                                {item.setor ? (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    {item.setor}
                                  </Badge>
                                ) : "-"}
                              </TableCell>
                              <TableCell>{formatDate(item.dataExecucao)}</TableCell>
                              <TableCell className="text-right">{item.quantidade || 1}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.valorUnitario)}</TableCell>
                              <TableCell className="text-right font-semibold text-emerald-600">
                                {formatCurrency(item.valorTotal)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={item.statusAnalise || "pendente"} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Divergências */}
          <TabsContent value="divergencias">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    Divergências Encontradas
                  </CardTitle>
                  {/* Filtro por status de feedback */}
                  {divergenciasData?.divergencias?.length ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Filtrar:</span>
                      <Select value={filtroFeedback} onValueChange={setFiltroFeedback}>
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas ({divergenciasData.divergencias.length})</SelectItem>
                          <SelectItem value="pendente">
                            Pendentes ({divergenciasData.divergencias.filter((d: any) => !getFeedbackForDiv(d)).length})
                          </SelectItem>
                          <SelectItem value="aceitar">
                            Aceitas ({divergenciasData.divergencias.filter((d: any) => getFeedbackForDiv(d)?.decisao === "aceitar").length})
                          </SelectItem>
                          <SelectItem value="rejeitar">
                            Rejeitadas ({divergenciasData.divergencias.filter((d: any) => getFeedbackForDiv(d)?.decisao === "rejeitar").length})
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingDiv ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !divergenciasData?.divergencias?.length ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma divergência encontrada</h3>
                    <p className="text-muted-foreground mb-4">
                      Execute a comparação com padrões para verificar a conta.
                    </p>
                    <Button 
                      variant="outline"
                      onClick={() => compararMutation.mutate({ numeroConta, estabelecimentoId })}
                      disabled={compararMutation.isPending}
                    >
                      {compararMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <BarChart3 className="mr-2 h-4 w-4" />
                      )}
                      Comparar com Padrões
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Score de Risco + Resumo de Divergências */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {/* Score de Risco */}
                      {(() => {
                        const score = divergenciasData.scoreRisco as number | null;
                        const detalhes = divergenciasData.detalhesRisco as any;
                        const nivel = detalhes?.nivel || (score != null ? (score >= 70 ? 'CRÍTICO' : score >= 50 ? 'ALTO' : score >= 30 ? 'MÉDIO' : 'BAIXO') : null);
                        if (score == null) return null;
                        return (
                          <Card className={`border-2 ${
                            score >= 70 ? 'border-red-500 bg-red-50/30' :
                            score >= 40 ? 'border-orange-500 bg-orange-50/30' :
                            'border-green-500 bg-green-50/30'
                          }`}>
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm text-muted-foreground">Score de Risco</p>
                                  <p className={`text-3xl font-bold ${
                                    score >= 70 ? 'text-red-600' :
                                    score >= 40 ? 'text-orange-600' :
                                    'text-green-600'
                                  }`}>
                                    {score}
                                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                                  </p>
                                  <p className={`text-xs font-medium mt-1 ${
                                    nivel === 'CRÍTICO' ? 'text-red-600' :
                                    nivel === 'ALTO' ? 'text-orange-600' :
                                    nivel === 'MÉDIO' ? 'text-yellow-600' :
                                    'text-green-600'
                                  }`}>
                                    {nivel}
                                  </p>
                                </div>
                                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                                  score >= 70 ? 'bg-red-100' :
                                  score >= 40 ? 'bg-orange-100' :
                                  'bg-green-100'
                                }`}>
                                  <Shield className={`h-6 w-6 ${
                                    score >= 70 ? 'text-red-600' :
                                    score >= 40 ? 'text-orange-600' :
                                    'text-green-600'
                                  }`} />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}
                      <Card className="border-red-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Divergências</p>
                              <p className="text-2xl font-bold text-red-600">{divergenciasData.resumo.total}</p>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-red-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-red-200">
                        <CardContent className="p-4">
                          <div>
                            <p className="text-sm text-muted-foreground mb-2">Por Severidade</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(divergenciasData.resumo.porSeveridade).map(([sev, count]) => (
                                <div key={sev} className="flex items-center gap-1">
                                  <SeveridadeBadge severidade={sev} />
                                  <span className="text-sm font-medium">({count as number})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-orange-200">
                        <CardContent className="p-4">
                          <div>
                            <p className="text-sm text-muted-foreground mb-2">Por Tipo</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(divergenciasData.resumo.porTipo).map(([tipo, count]) => (
                                <Badge key={tipo} variant="outline" className="text-xs">
                                  {tipo}: {count as number}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Card de Feedback do Auditor */}
                      <Card className="border-indigo-200 bg-indigo-50/30">
                        <CardContent className="p-4">
                          <div>
                            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5" />
                              Feedback Auditoria
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                                <ThumbsUp className="h-3 w-3 mr-1" />{feedbackResumo.aceitas}
                              </Badge>
                              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                                <ThumbsDown className="h-3 w-3 mr-1" />{feedbackResumo.rejeitadas}
                              </Badge>
                              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {(divergenciasData?.divergencias?.length || 0) - feedbackResumo.aceitas - feedbackResumo.rejeitadas}
                              </Badge>
                            </div>
                            {feedbackResumo.total > 0 && (
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div 
                                    className="bg-indigo-600 h-1.5 rounded-full transition-all" 
                                    style={{ 
                                      width: `${Math.round((feedbackResumo.total / (divergenciasData?.divergencias?.length || 1)) * 100)}%` 
                                    }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {Math.round((feedbackResumo.total / (divergenciasData?.divergencias?.length || 1)) * 100)}% auditado
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Tabela de Divergências */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severidade</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Descrição da Divergência</TableHead>
                            <TableHead className="text-right">Valor Cobrado</TableHead>
                            <TableHead className="text-right">Valor Esperado</TableHead>
                            <TableHead className="text-right">Diferença</TableHead>
                            <TableHead className="text-center">Status Auditoria</TableHead>
                            <TableHead className="text-center">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {divergenciasFiltradas.map((div: any, index: number) => {
                            const fb = getFeedbackForDiv(div);
                            const rowBg = fb 
                              ? fb.decisao === "aceitar" 
                                ? "bg-green-50/50" 
                                : fb.decisao === "rejeitar" 
                                  ? "bg-red-50/30 opacity-60" 
                                  : ""
                              : div.severidade === "critico" 
                                ? "bg-red-50/50" 
                                : "";
                            
                            return (
                              <TableRow key={index} className={rowBg}>
                                <TableCell>
                                  <SeveridadeBadge severidade={div.severidade} />
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {div.tipo}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-mono text-sm">{div.codigoItem || "-"}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={div.descricaoItem}>
                                      {div.descricaoItem || "-"}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-xs">
                                  <p className="text-sm">{div.mensagem || div.descricao || "-"}</p>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {div.valorCobrado != null ? formatCurrency(div.valorCobrado) : "-"}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {div.valorEsperado != null ? formatCurrency(div.valorEsperado) : "-"}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {div.diferenca != null ? (
                                    <span className={parseFloat(div.diferenca) > 0 ? "text-red-600" : "text-green-600"}>
                                      {formatCurrency(div.diferenca)}
                                    </span>
                                  ) : "-"}
                                </TableCell>
                                {/* Status de Auditoria */}
                                <TableCell className="text-center">
                                  {fb ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <DecisaoBadge decisao={fb.decisao} />
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button 
                                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 cursor-pointer"
                                              onClick={() => setHistoricoDialog({ open: true, div })}
                                            >
                                              <UserCheck className="h-3 w-3" />
                                              {fb.usuarioNome?.split(" ")[0] || "Auditor"}
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{fb.usuarioNome} em {formatDateTime(fb.createdAt)}</p>
                                            {fb.justificativa && <p className="text-xs mt-1 max-w-xs">{fb.justificativa}</p>}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300 bg-yellow-50">
                                      <Clock className="h-3 w-3 mr-1" />Pendente
                                    </Badge>
                                  )}
                                </TableCell>
                                {/* Ações */}
                                <TableCell>
                                  <div className="flex items-center justify-center gap-1">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant={fb?.decisao === "aceitar" ? "default" : "ghost"}
                                            size="icon"
                                            className={`h-7 w-7 ${
                                              fb?.decisao === "aceitar" 
                                                ? "bg-green-600 text-white hover:bg-green-700" 
                                                : "text-green-600 hover:text-green-700 hover:bg-green-50"
                                            }`}
                                            onClick={() => handleFeedback(div, "aceitar")}
                                            disabled={feedbackMutation.isPending}
                                          >
                                            <ThumbsUp className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {fb?.decisao === "aceitar" 
                                            ? "Divergência aceita - clique para reconfirmar" 
                                            : "Aceitar divergência (padrão correto)"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant={fb?.decisao === "rejeitar" ? "default" : "ghost"}
                                            size="icon"
                                            className={`h-7 w-7 ${
                                              fb?.decisao === "rejeitar" 
                                                ? "bg-red-600 text-white hover:bg-red-700" 
                                                : "text-red-600 hover:text-red-700 hover:bg-red-50"
                                            }`}
                                            onClick={() => handleFeedback(div, "rejeitar")}
                                            disabled={feedbackMutation.isPending}
                                          >
                                            <ThumbsDown className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {fb?.decisao === "rejeitar" 
                                            ? "Divergência rejeitada - clique para alterar" 
                                            : "Rejeitar divergência (falso positivo)"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            onClick={() => handleFeedback(div, "ajustar")}
                                            disabled={feedbackMutation.isPending}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Ajustar valor esperado</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    {/* Botão de histórico */}
                                    {fb && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                              onClick={() => setHistoricoDialog({ open: true, div })}
                                            >
                                              <History className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Ver histórico de feedbacks</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Falhas de Prontuário */}
          <TabsContent value="falhas">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileWarning className="h-5 w-5 text-amber-500" />
                      Falhas de Prontuário
                    </CardTitle>
                    <CardDescription>
                      Registre falhas encontradas no prontuário do paciente durante a auditoria
                    </CardDescription>
                  </div>
                  <Button onClick={() => setFalhaDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Registrar Falha
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Sugestões Inteligentes */}
                {sugestoesFalhas && sugestoesFalhas.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">Sugestões baseadas no aprendizado</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sugestoesFalhas.map((s: any, i: number) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs border-amber-300 hover:bg-amber-100"
                          onClick={() => {
                            setFalhaCategoria(s.dadosAprendizado?.categoriaFalha || "");
                            setFalhaTipo(s.dadosAprendizado?.tipoFalha || "");
                            setFalhaSeveridade(s.dadosAprendizado?.severidade || "moderada");
                            setFalhaDialog(true);
                          }}
                        >
                          <Lightbulb className="h-3 w-3 mr-1 text-amber-500" />
                          {s.dadosAprendizado?.tipoFalha || "Falha"}
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            {s.totalOcorrencias}x
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista de falhas registradas */}
                {!falhasData?.length ? (
                  <div className="text-center py-8">
                    <FileWarning className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-medium">Nenhuma falha registrada</h3>
                    <p className="text-muted-foreground">Clique em "Registrar Falha" para documentar problemas encontrados no prontuário.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {falhasData.map((falha: any) => (
                      <div key={falha.id} className={`p-4 rounded-lg border ${
                        falha.status === "corrigida" ? "border-green-200 bg-green-50/50" :
                        falha.status === "justificada" ? "border-blue-200 bg-blue-50/50" :
                        falha.severidade === "critica" ? "border-red-300 bg-red-50/50" :
                        falha.severidade === "grave" ? "border-orange-200 bg-orange-50/50" :
                        "border-yellow-200 bg-yellow-50/50"
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">{falha.categoriaFalha}</Badge>
                              <Badge className={`text-xs ${
                                falha.severidade === "critica" ? "bg-red-100 text-red-800" :
                                falha.severidade === "grave" ? "bg-orange-100 text-orange-800" :
                                falha.severidade === "moderada" ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>{falha.severidade}</Badge>
                              <Badge className={`text-xs ${
                                falha.status === "corrigida" ? "bg-green-100 text-green-800" :
                                falha.status === "justificada" ? "bg-blue-100 text-blue-800" :
                                "bg-yellow-100 text-yellow-800"
                              }`}>{falha.status}</Badge>
                            </div>
                            <p className="font-medium text-sm">{falha.tipoFalha}</p>
                            {falha.descricao && (
                              <p className="text-sm text-muted-foreground mt-1">{falha.descricao}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Registrado por {falha.usuarioNome} em {formatDateTime(falha.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            {falha.status === "aberta" && (
                              <>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                                        onClick={() => atualizarStatusFalhaMutation.mutate({ id: falha.id, status: "corrigida" })}
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Marcar como corrigida</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                                        onClick={() => atualizarStatusFalhaMutation.mutate({ id: falha.id, status: "justificada" })}
                                      >
                                        <MessageSquare className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Marcar como justificada</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
                                    onClick={() => removerFalhaMutation.mutate({ id: falha.id })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remover falha</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Ajustes de Itens */}
          <TabsContent value="ajustes">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-blue-500" />
                      Ajustes de Auditoria
                    </CardTitle>
                    <CardDescription>
                      Altere quantidades, valores ou adicione itens faltantes na conta
                    </CardDescription>
                  </div>
                  <Button onClick={() => setAjusteDialog({ open: true, tipo: "ADICIONAR_ITEM" })} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Sugestões de Ajustes */}
                {sugestoesAjustes && sugestoesAjustes.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Ajustes frequentes aprendidos</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sugestoesAjustes.map((s: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs border-blue-300 bg-blue-50">
                          <Lightbulb className="h-3 w-3 mr-1 text-blue-500" />
                          {s.descricaoItem || s.codigoItem || "Item"}: {s.dadosAprendizado?.direcao || s.tipoAprendizado}
                          <span className="ml-1 text-muted-foreground">({s.totalOcorrencias}x)</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtros para a tabela de itens */}
                <div className="mb-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <Label className="text-xs text-muted-foreground mb-1 block">Filtrar por Setor</Label>
                      <Select value={filtroSetorAjuste} onValueChange={setFiltroSetorAjuste}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Todos os setores" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os setores</SelectItem>
                          <SelectItem value="sem_setor">Sem setor definido</SelectItem>
                          {(() => {
                            const setores = new Set<string>();
                            itensData?.items?.forEach((item: any) => {
                              if (item.setor) setores.add(item.setor);
                            });
                            return Array.from(setores).sort().map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <Label className="text-xs text-muted-foreground mb-1 block">Filtrar por Data</Label>
                      <Input
                        type="date"
                        className="h-9"
                        value={filtroDataAjuste}
                        onChange={(e) => setFiltroDataAjuste(e.target.value)}
                      />
                    </div>
                    {(filtroSetorAjuste !== "todos" || filtroDataAjuste) && (
                      <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFiltroSetorAjuste("todos"); setFiltroDataAjuste(""); }}>
                        <XCircle className="h-4 w-4 mr-1" /> Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabela de itens editáveis */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Itens da Conta (clique para ajustar)
                    {(() => {
                      const filtered = itensData?.items?.filter((item: any) => {
                        if (filtroSetorAjuste !== "todos") {
                          if (filtroSetorAjuste === "sem_setor") { if (item.setor) return false; }
                          else { if (item.setor !== filtroSetorAjuste) return false; }
                        }
                        if (filtroDataAjuste && item.dataExecucao) {
                          const itemDate = new Date(item.dataExecucao).toISOString().split("T")[0];
                          if (itemDate !== filtroDataAjuste) return false;
                        } else if (filtroDataAjuste && !item.dataExecucao) {
                          return false;
                        }
                        return true;
                      });
                      const total = itensData?.items?.length || 0;
                      const shown = filtered?.length || 0;
                      if (filtroSetorAjuste !== "todos" || filtroDataAjuste) {
                        return <Badge variant="secondary" className="text-xs ml-2">{shown} de {total}</Badge>;
                      }
                      return null;
                    })()}
                  </h4>
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : !itensData?.items?.length ? (
                    <p className="text-muted-foreground text-center py-4">Nenhum item na conta</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Setor</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Valor Unit.</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itensData.items
                            .filter((item: any) => {
                              if (filtroSetorAjuste !== "todos") {
                                if (filtroSetorAjuste === "sem_setor") { if (item.setor) return false; }
                                else { if (item.setor !== filtroSetorAjuste) return false; }
                              }
                              if (filtroDataAjuste && item.dataExecucao) {
                                const itemDate = new Date(item.dataExecucao).toISOString().split("T")[0];
                                if (itemDate !== filtroDataAjuste) return false;
                              } else if (filtroDataAjuste && !item.dataExecucao) {
                                return false;
                              }
                              return true;
                            })
                            .map((item: any, index: number) => (
                            <TableRow key={item.id || index}>
                              <TableCell className="font-mono text-sm">{item.codigoItem || "-"}</TableCell>
                              <TableCell className="max-w-[200px] truncate">{item.descricaoItem || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                                  {item.setor || "N/D"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{item.dataExecucao ? formatDate(item.dataExecucao) : "-"}</TableCell>
                              <TableCell className="text-right">{item.quantidade || 1}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.valorUnitario)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(item.valorTotal)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            setAjusteDialog({ open: true, tipo: "ALTERAR_QUANTIDADE", item });
                                            setAjusteQtd(item.quantidade?.toString() || "1");
                                            setAjusteValor(item.valorUnitario?.toString() || "0");
                                          }}
                                        >
                                          <Hash className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Alterar quantidade</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            setAjusteDialog({ open: true, tipo: "ALTERAR_VALOR", item });
                                            setAjusteValor(item.valorUnitario?.toString() || "0");
                                            setAjusteQtd(item.quantidade?.toString() || "1");
                                          }}
                                        >
                                          <DollarSign className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Alterar valor</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            setAjusteDialog({ open: true, tipo: "ALTERAR_SETOR", item });
                                            setAjusteSetor(item.setor || "");
                                          }}
                                        >
                                          <Bed className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Alterar setor</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Histórico de Ajustes */}
                {ajustesData && ajustesData.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Histórico de Ajustes ({ajustesData.length})
                    </h4>
                    <div className="space-y-2">
                      {ajustesData.map((ajuste: any) => (
                        <div key={ajuste.id} className={`p-3 rounded-lg border ${
                          ajuste.status === "aplicado" ? "border-green-200 bg-green-50/50" :
                          ajuste.status === "revertido" ? "border-gray-200 bg-gray-50/50 opacity-60" :
                          "border-yellow-200 bg-yellow-50/50"
                        }`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {ajuste.tipoAjuste === "ALTERAR_QUANTIDADE" ? "Qtd" :
                                   ajuste.tipoAjuste === "ALTERAR_VALOR" ? "Valor" :
                                   ajuste.tipoAjuste === "ADICIONAR_ITEM" ? "+ Item" :
                                   ajuste.tipoAjuste === "ALTERAR_SETOR" ? "Setor" : "- Item"}
                                </Badge>
                                <Badge className={`text-xs ${
                                  ajuste.status === "aplicado" ? "bg-green-100 text-green-800" :
                                  ajuste.status === "revertido" ? "bg-gray-100 text-gray-800" :
                                  "bg-yellow-100 text-yellow-800"
                                }`}>{ajuste.status}</Badge>
                                <span className="font-mono text-xs">{ajuste.codigoItem || "-"}</span>
                              </div>
                              <p className="text-sm">{ajuste.descricaoItem || "Item sem descrição"}</p>
                              {ajuste.tipoAjuste === "ALTERAR_QUANTIDADE" && (
                                <p className="text-xs text-muted-foreground">
                                  Quantidade: {ajuste.quantidadeOriginal} → {ajuste.quantidadeAjustada}
                                </p>
                              )}
                              {ajuste.tipoAjuste === "ALTERAR_VALOR" && (
                                <p className="text-xs text-muted-foreground">
                                  Valor: {formatCurrency(ajuste.valorOriginal)} → {formatCurrency(ajuste.valorAjustado)}
                                </p>
                              )}
                              {ajuste.tipoAjuste === "ALTERAR_SETOR" && (
                                <p className="text-xs text-muted-foreground">
                                  Setor: {ajuste.setorOriginal || "N/D"} → {ajuste.setorAjustado || "N/D"}
                                </p>
                              )}
                              {ajuste.justificativa && (
                                <p className="text-xs text-muted-foreground italic mt-1">"{ajuste.justificativa}"</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Por {ajuste.usuarioNome} em {formatDateTime(ajuste.createdAt)}
                              </p>
                            </div>
                            {ajuste.status === "aplicado" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-100"
                                      onClick={() => reverterAjusteMutation.mutate({ id: ajuste.id })}
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reverter ajuste</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Auditoria (Histórico de Feedbacks) */}
          <TabsContent value="auditoria">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                  Histórico de Auditoria
                </CardTitle>
                <CardDescription>
                  Registro de todos os feedbacks dos auditores sobre as divergências desta conta
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!feedbacksData?.length ? (
                  <div className="text-center py-8">
                    <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-medium">Nenhum feedback registrado</h3>
                    <p className="text-muted-foreground">
                      Use os botões de ação na aba "Divergências" para registrar feedbacks de auditoria.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Resumo de Auditoria */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card className="border-indigo-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Feedbacks</p>
                              <p className="text-2xl font-bold text-indigo-600">{feedbackResumo.total}</p>
                            </div>
                            <ClipboardCheck className="h-8 w-8 text-indigo-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-green-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Aceitas</p>
                              <p className="text-2xl font-bold text-green-600">{feedbackResumo.aceitas}</p>
                            </div>
                            <ThumbsUp className="h-8 w-8 text-green-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-red-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Rejeitadas</p>
                              <p className="text-2xl font-bold text-red-600">{feedbackResumo.rejeitadas}</p>
                            </div>
                            <ThumbsDown className="h-8 w-8 text-red-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-yellow-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Pendentes</p>
                              <p className="text-2xl font-bold text-yellow-600">
                                {(divergenciasData?.divergencias?.length || 0) - feedbackResumo.aceitas - feedbackResumo.rejeitadas}
                              </p>
                            </div>
                            <Clock className="h-8 w-8 text-yellow-500" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Tabela de Feedbacks */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data/Hora</TableHead>
                            <TableHead>Auditor</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Tipo Divergência</TableHead>
                            <TableHead>Decisão</TableHead>
                            <TableHead>Justificativa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feedbacksData.map((fb: any) => (
                            <TableRow key={fb.id}>
                              <TableCell className="text-sm whitespace-nowrap">
                                {formatDateTime(fb.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                                  </div>
                                  <span className="text-sm font-medium">{fb.usuarioNome || "Auditor"}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-sm">{fb.codigoItem || "-"}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{fb.tipoDivergencia}</Badge>
                              </TableCell>
                              <TableCell>
                                <DecisaoBadge decisao={fb.decisao} />
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <p className="text-sm text-muted-foreground truncate" title={fb.justificativa}>
                                  {fb.justificativa || "-"}
                                </p>
                                {fb.dadosDivergencia?.valorSugerido && (
                                  <p className="text-xs text-blue-600 mt-0.5">
                                    Valor sugerido: {formatCurrency(fb.dadosDivergencia.valorSugerido)}
                                  </p>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Relatório para Faturista */}
          <TabsContent value="relatorio-faturista">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ClipboardList className="h-5 w-5 text-violet-600" />
                      Relatório de Itens Auditados para Faturista
                    </CardTitle>
                    <CardDescription>
                      Consolidação de todos os apontamentos da auditoria que precisam de ação do faturista
                    </CardDescription>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={handleExportRelatorioFaturista}
                    disabled={!relatorioFaturistaData.length}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Exportar Relatório
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!relatorioFaturistaData.length ? (
                  <div className="text-center py-8">
                    <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-medium">Nenhum apontamento de auditoria</h3>
                    <p className="text-muted-foreground">
                      Quando a auditoria registrar divergências, falhas de prontuário ou ajustes, eles aparecerão aqui consolidados.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Resumo do Relatório */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card className="border-red-200 bg-red-50/30">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Divergências</p>
                              <p className="text-2xl font-bold text-red-600">
                                {relatorioFaturistaData.filter(r => r.origem === 'DIVERGÊNCIA').length}
                              </p>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-red-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-amber-200 bg-amber-50/30">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Falhas Prontuário</p>
                              <p className="text-2xl font-bold text-amber-600">
                                {relatorioFaturistaData.filter(r => r.origem === 'FALHA PRONTUÁRIO').length}
                              </p>
                            </div>
                            <FileWarning className="h-8 w-8 text-amber-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-blue-200 bg-blue-50/30">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Ajustes Realizados</p>
                              <p className="text-2xl font-bold text-blue-600">
                                {relatorioFaturistaData.filter(r => r.origem === 'AJUSTE').length}
                              </p>
                            </div>
                            <Wrench className="h-8 w-8 text-blue-500" />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-violet-200 bg-violet-50/30">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Apontamentos</p>
                              <p className="text-2xl font-bold text-violet-600">
                                {relatorioFaturistaData.length}
                              </p>
                            </div>
                            <ClipboardList className="h-8 w-8 text-violet-500" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Tabela do Relatório */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>Origem</TableHead>
                            <TableHead>Item / Código</TableHead>
                            <TableHead>Descrição do Apontamento</TableHead>
                            <TableHead>Severidade</TableHead>
                            <TableHead>Decisão Auditor</TableHead>
                            <TableHead className="text-right">Impacto Financeiro</TableHead>
                            <TableHead>Ação Necessária</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {relatorioFaturistaData.map((item, index) => (
                            <TableRow key={`${item.origem}-${index}`} className={`${
                              item.severidade === 'critico' || item.severidade === 'critica' ? 'bg-red-50/50' :
                              item.severidade === 'grave' || item.severidade === 'alerta' ? 'bg-orange-50/50' : ''
                            }`}>
                              <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                              <TableCell>
                                <Badge className={`text-xs ${
                                  item.origem === 'DIVERGÊNCIA' ? 'bg-red-100 text-red-800 border-red-200' :
                                  item.origem === 'FALHA PRONTUÁRIO' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                  'bg-blue-100 text-blue-800 border-blue-200'
                                }`}>
                                  {item.origem}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-mono text-sm">{item.codigo || '-'}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={item.descricaoItem}>
                                    {item.descricaoItem || '-'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-xs">
                                <p className="text-sm">{item.descricaoApontamento}</p>
                                {item.observacaoAuditor && (
                                  <p className="text-xs text-indigo-600 mt-1 italic">
                                    <UserCheck className="h-3 w-3 inline mr-1" />
                                    {item.observacaoAuditor}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.severidade === 'critico' || item.severidade === 'critica' ? (
                                  <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Crítico</Badge>
                                ) : item.severidade === 'alerta' || item.severidade === 'grave' ? (
                                  <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Alto</Badge>
                                ) : item.severidade === 'moderada' ? (
                                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs"><Info className="h-3 w-3 mr-1" />Médio</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs"><Info className="h-3 w-3 mr-1" />Info</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.decisaoAuditor ? (
                                  <DecisaoBadge decisao={item.decisaoAuditor} />
                                ) : (
                                  <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">Pendente</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {item.impactoFinanceiro != null && item.impactoFinanceiro !== 0 ? (
                                  <span className={item.impactoFinanceiro > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                    {formatCurrency(item.impactoFinanceiro)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium text-violet-700">{item.acaoNecessaria}</p>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Rodapé com total de impacto */}
                    {(() => {
                      const totalImpacto = relatorioFaturistaData.reduce((acc, r) => acc + (r.impactoFinanceiro || 0), 0);
                      return totalImpacto !== 0 ? (
                        <div className="flex items-center justify-end gap-4 p-4 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium text-muted-foreground">Impacto Financeiro Total:</span>
                          <span className={`text-xl font-bold ${totalImpacto > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(totalImpacto)}
                          </span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog de Feedback */}
        <Dialog open={feedbackDialog.open} onOpenChange={(open) => setFeedbackDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {feedbackDialog.acao === "rejeitar" ? (
                  <><ThumbsDown className="h-5 w-5 text-red-500" /> Rejeitar Divergência</>
                ) : (
                  <><Pencil className="h-5 w-5 text-blue-500" /> Ajustar Valor</>
                )}
              </DialogTitle>
              <DialogDescription>
                {feedbackDialog.acao === "rejeitar"
                  ? "Informe o motivo da rejeição. Isso ajudará a refinar os padrões de cobrança."
                  : "Informe o valor correto esperado. Isso ajustará o padrão de cobrança."}
              </DialogDescription>
            </DialogHeader>

            {feedbackDialog.div && (
              <div className="space-y-4">
                <div className="bg-muted/50 p-3 rounded-lg space-y-1">
                  <p className="text-sm"><strong>Item:</strong> {feedbackDialog.div.codigoItem} - {feedbackDialog.div.descricaoItem}</p>
                  <p className="text-sm"><strong>Tipo:</strong> {feedbackDialog.div.tipo}</p>
                  <p className="text-sm"><strong>Mensagem:</strong> {feedbackDialog.div.mensagem || feedbackDialog.div.descricao}</p>
                </div>

                {feedbackDialog.acao === "ajustar" && (
                  <div className="space-y-2">
                    <Label htmlFor="valor-sugerido">Valor Correto Esperado</Label>
                    <Input
                      id="valor-sugerido"
                      type="text"
                      value={feedbackValor}
                      onChange={(e) => setFeedbackValor(e.target.value)}
                      placeholder="Ex: 150.00"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="observacao">
                    {feedbackDialog.acao === "rejeitar" ? "Motivo da Rejeição" : "Observação"}
                  </Label>
                  <Textarea
                    id="observacao"
                    value={feedbackObs}
                    onChange={(e) => setFeedbackObs(e.target.value)}
                    placeholder={feedbackDialog.acao === "rejeitar"
                      ? "Ex: Este item é cobrado separadamente neste convênio..."
                      : "Ex: O valor correto conforme tabela do convênio é..."}
                    rows={3}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setFeedbackDialog({ open: false, div: null, acao: "aceitar" })}>
                Cancelar
              </Button>
              <Button
                onClick={submitFeedback}
                disabled={feedbackMutation.isPending}
                variant={feedbackDialog.acao === "rejeitar" ? "destructive" : "default"}
              >
                {feedbackMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : feedbackDialog.acao === "rejeitar" ? (
                  <ThumbsDown className="mr-2 h-4 w-4" />
                ) : (
                  <Pencil className="mr-2 h-4 w-4" />
                )}
                {feedbackDialog.acao === "rejeitar" ? "Rejeitar" : "Salvar Ajuste"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Registrar Falha de Prontuário */}
        <Dialog open={falhaDialog} onOpenChange={setFalhaDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileWarning className="h-5 w-5 text-amber-500" />
                Registrar Falha de Prontuário
              </DialogTitle>
              <DialogDescription>
                Selecione a categoria e o tipo de falha encontrada no prontuário.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Categoria da Falha</Label>
                <Select value={falhaCategoria} onValueChange={(v) => { setFalhaCategoria(v); setFalhaTipo(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {categoriasFalhas && Object.entries(categoriasFalhas).map(([key, cat]: [string, any]) => (
                      <SelectItem key={key} value={key}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {falhaCategoria && categoriasFalhas && (
                <div className="space-y-2">
                  <Label>Tipo de Falha</Label>
                  <Select value={falhaTipo} onValueChange={setFalhaTipo}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {(categoriasFalhas as any)[falhaCategoria]?.falhas?.map((f: string) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Severidade</Label>
                <Select value={falhaSeveridade} onValueChange={(v: any) => setFalhaSeveridade(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leve">Leve</SelectItem>
                    <SelectItem value="moderada">Moderada</SelectItem>
                    <SelectItem value="grave">Grave</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações / Motivo</Label>
                <Textarea
                  value={falhaDescricao}
                  onChange={(e) => setFalhaDescricao(e.target.value)}
                  placeholder="Descreva os motivos que levaram à marcação desta falha..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFalhaDialog(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!falhaCategoria || !falhaTipo) {
                    toast.error("Selecione a categoria e o tipo da falha");
                    return;
                  }
                  registrarFalhaMutation.mutate({
                    numeroConta,
                    estabelecimentoId,
                    tipoFalha: falhaTipo,
                    categoriaFalha: falhaCategoria,
                    descricao: falhaDescricao || undefined,
                    severidade: falhaSeveridade,
                  });
                }}
                disabled={registrarFalhaMutation.isPending}
              >
                {registrarFalhaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Falha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Ajuste de Item */}
        <Dialog open={ajusteDialog.open} onOpenChange={(open) => setAjusteDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-blue-500" />
                {ajusteDialog.tipo === "ADICIONAR_ITEM" ? "Adicionar Item Faltante" :
                 ajusteDialog.tipo === "ALTERAR_QUANTIDADE" ? "Alterar Quantidade" :
                 ajusteDialog.tipo === "ALTERAR_SETOR" ? "Alterar Setor" :
                 "Alterar Valor"}
              </DialogTitle>
              <DialogDescription>
                {ajusteDialog.tipo === "ADICIONAR_ITEM"
                  ? "Adicione um item que está faltando na conta."
                  : ajusteDialog.tipo === "ALTERAR_SETOR"
                  ? "Corrija o setor do item para o setor correto."
                  : `Ajuste ${ajusteDialog.tipo === "ALTERAR_QUANTIDADE" ? "a quantidade" : "o valor"} do item.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {ajusteDialog.item && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm"><strong>Item:</strong> {ajusteDialog.item.codigoItem} - {ajusteDialog.item.descricaoItem}</p>
                  {ajusteDialog.tipo === "ALTERAR_SETOR" ? (
                    <p className="text-sm"><strong>Setor atual:</strong> {ajusteDialog.item.setor || "Não definido"} | <strong>Data:</strong> {ajusteDialog.item.dataExecucao ? formatDate(ajusteDialog.item.dataExecucao) : "-"}</p>
                  ) : (
                    <p className="text-sm"><strong>Qtd atual:</strong> {ajusteDialog.item.quantidade} | <strong>Valor atual:</strong> {formatCurrency(ajusteDialog.item.valorUnitario)}</p>
                  )}
                </div>
              )}
              {ajusteDialog.tipo === "ADICIONAR_ITEM" && (
                <>
                  <div className="space-y-2">
                    <Label>Tipo do Item</Label>
                    <Select value={ajusteTipoItem} onValueChange={setAjusteTipoItem}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PROCEDIMENTO">Procedimento</SelectItem>
                        <SelectItem value="MEDICAMENTO">Medicamento</SelectItem>
                        <SelectItem value="MATERIAL">Material</SelectItem>
                        <SelectItem value="TAXA">Taxa</SelectItem>
                        <SelectItem value="DIARIA">Diária</SelectItem>
                        <SelectItem value="SADT">SADT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Código do Item</Label>
                    <Input value={ajusteCodigo} onChange={(e) => setAjusteCodigo(e.target.value)} placeholder="Ex: 10101012" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input value={ajusteDescricao} onChange={(e) => setAjusteDescricao(e.target.value)} placeholder="Descrição do item" />
                  </div>
                </>
              )}
              {(ajusteDialog.tipo === "ALTERAR_QUANTIDADE" || ajusteDialog.tipo === "ADICIONAR_ITEM") && (
                <div className="space-y-2">
                  <Label>{ajusteDialog.tipo === "ADICIONAR_ITEM" ? "Quantidade" : "Nova Quantidade"}</Label>
                  <Input type="number" value={ajusteQtd} onChange={(e) => setAjusteQtd(e.target.value)} placeholder="Ex: 2" />
                </div>
              )}
              {(ajusteDialog.tipo === "ALTERAR_VALOR" || ajusteDialog.tipo === "ADICIONAR_ITEM") && (
                <div className="space-y-2">
                  <Label>{ajusteDialog.tipo === "ADICIONAR_ITEM" ? "Valor Unitário" : "Novo Valor Unitário"}</Label>
                  <Input type="number" step="0.01" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)} placeholder="Ex: 150.00" />
                </div>
              )}
              {ajusteDialog.tipo === "ALTERAR_SETOR" && (
                <div className="space-y-2">
                  <Label>Novo Setor</Label>
                  <Input value={ajusteSetor} onChange={(e) => setAjusteSetor(e.target.value)} placeholder="Ex: UTI, Centro Cirúrgico, Enfermaria..." />
                </div>
              )}
              <div className="space-y-2">
                <Label>Justificativa</Label>
                <Textarea
                  value={ajusteJustificativa}
                  onChange={(e) => setAjusteJustificativa(e.target.value)}
                  placeholder="Motivo do ajuste..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAjusteDialog({ open: false, tipo: "ALTERAR_QUANTIDADE" })}>Cancelar</Button>
              <Button
                onClick={() => {
                  registrarAjusteMutation.mutate({
                    numeroConta,
                    estabelecimentoId,
                    tipoAjuste: ajusteDialog.tipo,
                    itemId: ajusteDialog.item?.id,
                    codigoItem: ajusteDialog.tipo === "ADICIONAR_ITEM" ? ajusteCodigo : ajusteDialog.item?.codigoItem,
                    descricaoItem: ajusteDialog.tipo === "ADICIONAR_ITEM" ? ajusteDescricao : ajusteDialog.item?.descricaoItem,
                    quantidadeOriginal: ajusteDialog.item?.quantidade?.toString(),
                    valorOriginal: ajusteDialog.item?.valorUnitario?.toString(),
                    quantidadeAjustada: ajusteQtd || undefined,
                    valorAjustado: ajusteValor || undefined,
                    tipoItemAdicionado: ajusteDialog.tipo === "ADICIONAR_ITEM" ? ajusteTipoItem : undefined,
                    setorOriginal: ajusteDialog.tipo === "ALTERAR_SETOR" ? (ajusteDialog.item?.setor || "") : undefined,
                    setorAjustado: ajusteDialog.tipo === "ALTERAR_SETOR" ? ajusteSetor : undefined,
                    justificativa: ajusteJustificativa || undefined,
                  });
                }}
                disabled={registrarAjusteMutation.isPending}
              >
                {registrarAjusteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {ajusteDialog.tipo === "ADICIONAR_ITEM" ? "Adicionar Item" : ajusteDialog.tipo === "ALTERAR_SETOR" ? "Salvar Setor" : "Salvar Ajuste"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Histórico de Feedbacks */}
        <Dialog open={historicoDialog.open} onOpenChange={(open) => setHistoricoDialog(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-500" />
                Histórico de Feedbacks
              </DialogTitle>
              <DialogDescription>
                {historicoDialog.div && (
                  <>Feedbacks para: {historicoDialog.div.codigoItem} - {historicoDialog.div.tipo}</>
                )}
              </DialogDescription>
            </DialogHeader>

            {historicoDialog.div && (() => {
              const key = `${historicoDialog.div.codigoItem || ""}_${historicoDialog.div.tipo}`;
              const feedbacks = feedbackMap.get(key) || [];
              
              if (feedbacks.length === 0) {
                return (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">Nenhum feedback registrado para esta divergência.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {feedbacks.map((fb: any, i: number) => (
                    <div key={fb.id} className={`p-3 rounded-lg border ${
                      fb.decisao === "aceitar" ? "border-green-200 bg-green-50/50" :
                      fb.decisao === "rejeitar" ? "border-red-200 bg-red-50/50" :
                      "border-gray-200 bg-gray-50/50"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center">
                            <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                          </div>
                          <span className="text-sm font-medium">{fb.usuarioNome || "Auditor"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DecisaoBadge decisao={fb.decisao} />
                          <span className="text-xs text-muted-foreground">{formatDateTime(fb.createdAt)}</span>
                        </div>
                      </div>
                      {fb.justificativa && (
                        <p className="text-sm text-muted-foreground mt-1 pl-8">
                          "{fb.justificativa}"
                        </p>
                      )}
                      {fb.dadosDivergencia?.valorSugerido && (
                        <p className="text-xs text-blue-600 mt-1 pl-8">
                          Valor sugerido: {formatCurrency(fb.dadosDivergencia.valorSugerido)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
