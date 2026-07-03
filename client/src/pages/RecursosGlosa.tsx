import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  RefreshCw, 
  Download,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Eye,
  Edit,
  Trash2,
  MessageSquare,
  Calendar,
  Building2,
  TrendingUp,
  Sparkles,
  BookOpen,
  Copy,
  Lightbulb,
  History,
  Zap
} from "lucide-react";
import { useState, useEffect } from "react";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import * as XLSX from "xlsx";
import { formatDateBR } from "@/lib/dateUtils";
import { 
  GLOSAS_TISS, 
  obterInfoGlosa, 
  obterArgumentoContestacao,
  obterAcoesRecomendadas,
  obterDocumentosSugeridos,
  traduzirCodigoGlosa
} from "../../../shared/glossaryGlosas";

const STATUS_CONFIG: { [key: string]: { label: string; color: string; icon: any } } = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-800", icon: FileText },
  pendente_envio: { label: "Pendente Envio", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-800", icon: Send },
  em_analise: { label: "Em Análise", color: "bg-purple-100 text-purple-800", icon: AlertCircle },
  deferido: { label: "Deferido", color: "bg-green-100 text-green-800", icon: CheckCircle },
  deferido_parcial: { label: "Deferido Parcial", color: "bg-lime-100 text-lime-800", icon: CheckCircle },
  indeferido: { label: "Indeferido", color: "bg-red-100 text-red-800", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-500", icon: XCircle },
};

const PRIORIDADE_CONFIG: { [key: string]: { label: string; color: string } } = {
  baixa: { label: "Baixa", color: "bg-gray-100 text-gray-600" },
  media: { label: "Média", color: "bg-blue-100 text-blue-600" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-600" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-600" },
};

export default function RecursosGlosa() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  
  // Estados de filtro
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<string>("todos");
  const [page, setPage] = useState(1);
  
  // Estados de modal
  const [showNovoRecurso, setShowNovoRecurso] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [recursoSelecionado, setRecursoSelecionado] = useState<number | null>(null);
  const [showEnviar, setShowEnviar] = useState(false);
  const [showResposta, setShowResposta] = useState(false);
  
  // Estados do formulário
  const [novoRecurso, setNovoRecurso] = useState({
    convenioId: "",
    codigoProcedimento: "",
    descricaoProcedimento: "",
    guiaNumero: "",
    pacienteNome: "",
    valorCobrado: "",
    valorGlosado: "",
    codigoGlosa: "",
    motivoGlosaConvenio: "",
    justificativaRecurso: "",
    prioridade: "media" as "baixa" | "media" | "alta" | "urgente",
  });
  
  // Estados de sugestão IA
  const [sugestaoIA, setSugestaoIA] = useState<any>(null);
  const [loadingIA, setLoadingIA] = useState(false);
  const [showSugestoes, setShowSugestoes] = useState(false);
  
  const [protocoloEnvio, setProtocoloEnvio] = useState("");
  const [resposta, setResposta] = useState({
    status: "deferido" as "deferido" | "deferido_parcial" | "indeferido",
    respostaConvenio: "",
    valorRecuperado: "",
  });
  const [novoComentario, setNovoComentario] = useState("");
  
  // Estados para aba de itens glosados do demonstrativo
  const [abaAtiva, setAbaAtiva] = useState<"recursos" | "itensGlosados">("recursos");
  const [pageItensGlosados, setPageItensGlosados] = useState(1);
  const [buscaItensGlosados, setBuscaItensGlosados] = useState("");
  const [convenioFiltroItens, setConvenioFiltroItens] = useState<string>("todos");
  const [mesReferenciaItens, setMesReferenciaItens] = useState<number | undefined>(undefined);
  const [anoReferenciaItens, setAnoReferenciaItens] = useState<number | undefined>(undefined);
  const [dataPagamentoItens, setDataPagamentoItens] = useState<string>("todas");
  const { estabelecimentoAtual } = useEstabelecimento();

  // Queries
  const { data: recursosData, isLoading, refetch } = trpc.recursos.list.useQuery({
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    prioridade: prioridadeFiltro !== "todos" ? prioridadeFiltro : undefined,
    busca: busca || undefined,
    page,
    limit: 15,
  });

  const { data: estatisticas } = trpc.recursos.estatisticas.useQuery();
  
  // Query para datas de pagamento disponíveis (para filtro na aba itens glosados)
  const { data: datasDisponiveis } = trpc.demonstrativo.datasPagamento.useQuery();

  // Query para itens glosados do demonstrativo
  const { data: itensGlosadosData, isLoading: loadingItensGlosados, refetch: refetchItensGlosados } = trpc.demonstrativo.itensGlosados.useQuery({
    convenioId: convenioFiltroItens !== "todos" ? parseInt(convenioFiltroItens) : undefined,
    dataPagamento: dataPagamentoItens !== "todas" ? dataPagamentoItens : undefined,
    mesReferencia: dataPagamentoItens !== "todas" ? undefined : mesReferenciaItens,
    anoReferencia: dataPagamentoItens !== "todas" ? undefined : anoReferenciaItens,
    search: buscaItensGlosados || undefined,
    page: pageItensGlosados,
    pageSize: 20,
  });
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: recursoDetalhes, refetch: refetchDetalhes } = trpc.recursos.byId.useQuery(
    { id: recursoSelecionado! },
    { enabled: !!recursoSelecionado }
  );

  // Mutations
  const createMutation = trpc.recursos.create.useMutation({
    onSuccess: () => {
      toast.success("Recurso criado com sucesso!");
      setShowNovoRecurso(false);
      resetNovoRecurso();
      refetch();
    },
    onError: (error) => {
      toast.error("Erro ao criar recurso: " + error.message);
    },
  });

  const sugerirIAMutation = trpc.recursos.sugerirArgumentoIA.useMutation({
    onSuccess: (data) => {
      setSugestaoIA(data);
      setLoadingIA(false);
      toast.success("Sugestão gerada com sucesso!");
    },
    onError: (error) => {
      setLoadingIA(false);
      toast.error("Erro ao gerar sugestão: " + error.message);
    },
  });

  const enviarMutation = trpc.recursos.enviar.useMutation({
    onSuccess: () => {
      toast.success("Recurso enviado com sucesso!");
      setShowEnviar(false);
      setProtocoloEnvio("");
      refetch();
      refetchDetalhes();
    },
    onError: (error) => {
      toast.error("Erro ao enviar recurso: " + error.message);
    },
  });

  const respostaMutation = trpc.recursos.registrarResposta.useMutation({
    onSuccess: () => {
      toast.success("Resposta registrada com sucesso!");
      setShowResposta(false);
      setResposta({ status: "deferido", respostaConvenio: "", valorRecuperado: "" });
      refetch();
      refetchDetalhes();
    },
    onError: (error) => {
      toast.error("Erro ao registrar resposta: " + error.message);
    },
  });

  const comentarioMutation = trpc.recursos.addHistorico.useMutation({
    onSuccess: () => {
      toast.success("Comentário adicionado!");
      setNovoComentario("");
      refetchDetalhes();
    },
  });

  const deleteMutation = trpc.recursos.delete.useMutation({
    onSuccess: () => {
      toast.success("Recurso excluído!");
      refetch();
    },
  });

  // Efeito para atualizar descrição da glosa quando código muda
  useEffect(() => {
    if (novoRecurso.codigoGlosa) {
      const descricao = traduzirCodigoGlosa(novoRecurso.codigoGlosa);
      if (descricao !== novoRecurso.codigoGlosa) {
        setNovoRecurso(prev => ({
          ...prev,
          motivoGlosaConvenio: `${prev.codigoGlosa} - ${descricao}`
        }));
      }
    }
  }, [novoRecurso.codigoGlosa]);

  const resetNovoRecurso = () => {
    setNovoRecurso({
      convenioId: "",
      codigoProcedimento: "",
      descricaoProcedimento: "",
      guiaNumero: "",
      pacienteNome: "",
      valorCobrado: "",
      valorGlosado: "",
      codigoGlosa: "",
      motivoGlosaConvenio: "",
      justificativaRecurso: "",
      prioridade: "media",
    });
    setSugestaoIA(null);
    setShowSugestoes(false);
  };

  const handleCriarRecurso = () => {
    if (!novoRecurso.convenioId || !novoRecurso.justificativaRecurso) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createMutation.mutate({
      ...novoRecurso,
      convenioId: parseInt(novoRecurso.convenioId),
    });
  };

  const handleBuscarSugestao = () => {
    if (!novoRecurso.codigoGlosa) {
      // Buscar sugestão do dicionário
      toast.error("Informe o código da glosa");
      return;
    }
    
    const info = obterInfoGlosa(novoRecurso.codigoGlosa);
    const argumento = obterArgumentoContestacao(novoRecurso.codigoGlosa);
    const acoes = obterAcoesRecomendadas(novoRecurso.codigoGlosa);
    const docs = obterDocumentosSugeridos(novoRecurso.codigoGlosa);
    
    setSugestaoIA({
      argumento,
      origem: "dicionario",
      acoesRecomendadas: acoes,
      documentosSugeridos: docs,
      estatisticas: null,
      confianca: info?.probabilidadeSucesso || 50,
    });
    setShowSugestoes(true);
  };

  const handleGerarComIA = () => {
    if (!novoRecurso.codigoGlosa || !novoRecurso.convenioId) {
      toast.error("Informe o código da glosa e o convênio");
      return;
    }
    
    setLoadingIA(true);
    sugerirIAMutation.mutate({
      codigoGlosa: novoRecurso.codigoGlosa,
      convenioId: parseInt(novoRecurso.convenioId),
      codigoProcedimento: novoRecurso.codigoProcedimento || undefined,
      valorGlosado: novoRecurso.valorGlosado || undefined,
    });
  };

  const handleUsarSugestao = () => {
    if (sugestaoIA?.argumento) {
      setNovoRecurso(prev => ({
        ...prev,
        justificativaRecurso: sugestaoIA.argumento
      }));
      toast.success("Sugestão aplicada!");
    }
  };

  const handleEnviarRecurso = () => {
    if (!recursoSelecionado) return;
    enviarMutation.mutate({
      id: recursoSelecionado,
      protocoloRecurso: protocoloEnvio || undefined,
    });
  };

  const handleRegistrarResposta = () => {
    if (!recursoSelecionado || !resposta.respostaConvenio) {
      toast.error("Preencha a resposta do convênio");
      return;
    }
    respostaMutation.mutate({
      id: recursoSelecionado,
      ...resposta,
    });
  };

  const handleAddComentario = () => {
    if (!recursoSelecionado || !novoComentario) return;
    comentarioMutation.mutate({
      recursoId: recursoSelecionado,
      tipo: "comentario",
      descricao: novoComentario,
    });
  };

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!num) return "R$ 0,00";
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  
  const handleExportExcel = () => {
    if (!recursosData?.recursos) return;
    
    // Dados principais
    const data = recursosData.recursos.map((r, index) => ({
      "#": index + 1,
      "Convênio": r.convenioNome,
      "Guia": r.guiaNumero || "-",
      "Paciente": r.pacienteNome || "-",
      "Código Proc.": r.codigoProcedimento || "-",
      "Descrição Proc.": r.descricaoProcedimento || "-",
      "Valor Cobrado": parseFloat(r.valorCobrado || "0"),
      "Valor Glosado": parseFloat(r.valorGlosado || "0"),
      "Valor Recuperado": parseFloat(r.valorRecuperado || "0"),
      "Motivo Glosa": r.motivoGlosaConvenio || "-",
      "Justificativa Recurso": r.justificativaRecurso || "-",
      "Status": STATUS_CONFIG[r.status]?.label || r.status,
      "Prioridade": PRIORIDADE_CONFIG[r.prioridade]?.label || r.prioridade,
      "Protocolo": r.protocoloRecurso || "-",
      "Data Glosa": formatDateBR(r.dataGlosa),
      "Data Criação": formatDateBR(r.createdAt),
      "Data Envio": formatDateBR(r.dataEnvioRecurso),
      "Data Resposta": formatDateBR(r.dataResposta),
      "Resposta Convênio": r.respostaConvenio || "-",
    }));
    
    // Calcular totais
    const totalCobrado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorCobrado || "0"), 0);
    const totalGlosado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorGlosado || "0"), 0);
    const totalRecuperado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorRecuperado || "0"), 0);
    
    // Adicionar linha de totais
    data.push({
      "#": "TOTAL",
      "Convênio": "",
      "Guia": "",
      "Paciente": "",
      "Código Proc.": "",
      "Descrição Proc.": "",
      "Valor Cobrado": totalCobrado,
      "Valor Glosado": totalGlosado,
      "Valor Recuperado": totalRecuperado,
      "Motivo Glosa": "",
      "Justificativa Recurso": "",
      "Status": `${recursosData.recursos.length} recursos`,
      "Prioridade": "",
      "Protocolo": "",
      "Data Glosa": "",
      "Data Criação": "",
      "Data Envio": "",
      "Data Resposta": "",
      "Resposta Convênio": "",
    } as any);
    
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Ajustar largura das colunas
    ws["!cols"] = [
      { wch: 5 },   // #
      { wch: 20 },  // Convênio
      { wch: 15 },  // Guia
      { wch: 25 },  // Paciente
      { wch: 12 },  // Código
      { wch: 35 },  // Descrição
      { wch: 14 },  // Valor Cobrado
      { wch: 14 },  // Valor Glosado
      { wch: 16 },  // Valor Recuperado
      { wch: 30 },  // Motivo Glosa
      { wch: 50 },  // Justificativa
      { wch: 15 },  // Status
      { wch: 12 },  // Prioridade
      { wch: 15 },  // Protocolo
      { wch: 12 },  // Data Glosa
      { wch: 12 },  // Data Criação
      { wch: 12 },  // Data Envio
      { wch: 12 },  // Data Resposta
      { wch: 40 },  // Resposta
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recursos de Glosa");
    XLSX.writeFile(wb, `recursos_glosa_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Arquivo Excel exportado com sucesso!");
  };

  const handleExportPDF = () => {
    if (!recursosData?.recursos || recursosData.recursos.length === 0) {
      toast.error("Nenhum recurso para exportar");
      return;
    }
    
    // Calcular totais
    const totalCobrado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorCobrado || "0"), 0);
    const totalGlosado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorGlosado || "0"), 0);
    const totalRecuperado = recursosData.recursos.reduce((sum, r) => sum + parseFloat(r.valorRecuperado || "0"), 0);
    
    // Criar conteúdo HTML para o PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Recursos de Glosa</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 10px; margin: 20px; }
          h1 { color: #1e3a5f; font-size: 18px; text-align: center; margin-bottom: 5px; }
          h2 { color: #666; font-size: 12px; text-align: center; margin-bottom: 20px; }
          .resumo { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .resumo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          .resumo-item { text-align: center; }
          .resumo-valor { font-size: 16px; font-weight: bold; color: #1e3a5f; }
          .resumo-label { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #1e3a5f; color: white; padding: 8px 4px; text-align: left; font-size: 9px; }
          td { padding: 6px 4px; border-bottom: 1px solid #ddd; font-size: 9px; vertical-align: top; }
          tr:nth-child(even) { background: #f9f9f9; }
          .valor { text-align: right; }
          .status { padding: 2px 6px; border-radius: 4px; font-size: 8px; }
          .status-deferido { background: #d4edda; color: #155724; }
          .status-indeferido { background: #f8d7da; color: #721c24; }
          .status-enviado { background: #cce5ff; color: #004085; }
          .status-pendente { background: #fff3cd; color: #856404; }
          .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #666; }
          .justificativa { max-width: 200px; word-wrap: break-word; }
          @media print { body { margin: 10px; } }
        </style>
      </head>
      <body>
        <h1>Relatório de Recursos de Glosa</h1>
        <h2>Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</h2>
        
        <div class="resumo">
          <div class="resumo-grid">
            <div class="resumo-item">
              <div class="resumo-valor">${recursosData.recursos.length}</div>
              <div class="resumo-label">Total de Recursos</div>
            </div>
            <div class="resumo-item">
              <div class="resumo-valor">R$ ${totalCobrado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div class="resumo-label">Valor Cobrado</div>
            </div>
            <div class="resumo-item">
              <div class="resumo-valor">R$ ${totalGlosado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div class="resumo-label">Valor Glosado</div>
            </div>
            <div class="resumo-item">
              <div class="resumo-valor">R$ ${totalRecuperado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
              <div class="resumo-label">Valor Recuperado</div>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Convênio</th>
              <th>Guia</th>
              <th>Paciente</th>
              <th>Código</th>
              <th>Descrição</th>
              <th>Vlr. Glosado</th>
              <th>Motivo Glosa</th>
              <th>Justificativa Recurso</th>
              <th>Status</th>
              <th>Protocolo</th>
            </tr>
          </thead>
          <tbody>
            ${recursosData.recursos.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${r.convenioNome}</td>
                <td>${r.guiaNumero || "-"}</td>
                <td>${r.pacienteNome || "-"}</td>
                <td>${r.codigoProcedimento || "-"}</td>
                <td>${(r.descricaoProcedimento || "-").substring(0, 40)}${(r.descricaoProcedimento || "").length > 40 ? "..." : ""}</td>
                <td class="valor">R$ ${parseFloat(r.valorGlosado || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td>${(r.motivoGlosaConvenio || "-").substring(0, 30)}${(r.motivoGlosaConvenio || "").length > 30 ? "..." : ""}</td>
                <td class="justificativa">${(r.justificativaRecurso || "-").substring(0, 80)}${(r.justificativaRecurso || "").length > 80 ? "..." : ""}</td>
                <td><span class="status status-${r.status === "deferido" || r.status === "deferido_parcial" ? "deferido" : r.status === "indeferido" ? "indeferido" : r.status === "enviado" || r.status === "em_analise" ? "enviado" : "pendente"}">${STATUS_CONFIG[r.status]?.label || r.status}</span></td>
                <td>${r.protocoloRecurso || "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Safatle Gerenciamento - Sistema de Gestão Hospitalar</p>
        </div>
      </body>
      </html>
    `;
    
    // Abrir em nova janela para impressão/PDF
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
      toast.success("Relatório PDF gerado! Use 'Salvar como PDF' na caixa de impressão.");
    } else {
      toast.error("Não foi possível abrir a janela de impressão. Verifique se popups estão bloqueados.");
    }
  };

  const totalPages = Math.ceil((recursosData?.total || 0) / 15);
  const totalPagesItensGlosados = Math.ceil((itensGlosadosData?.total || 0) / 20);

  // Lista de códigos de glosa para autocomplete
  const codigosGlosa = Object.keys(GLOSAS_TISS);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Recursos de Glosa</h1>
            <p className="text-muted-foreground">
              Gerencie contestações com sugestões inteligentes de argumentos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Select onValueChange={(value) => {
              if (value === "excel") handleExportExcel();
              else if (value === "pdf") handleExportPDF();
            }}>
              <SelectTrigger className="w-[140px]">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Excel (.xlsx)
                  </div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={showNovoRecurso} onOpenChange={(open) => {
              setShowNovoRecurso(open);
              if (!open) resetNovoRecurso();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Recurso
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Novo Recurso de Glosa com IA
                  </DialogTitle>
                  <DialogDescription>
                    Registre uma contestação com sugestões inteligentes de argumentos
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
                  {/* Coluna Esquerda - Formulário */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Convênio *</Label>
                        <Select
                          value={novoRecurso.convenioId}
                          onValueChange={(v) => setNovoRecurso({ ...novoRecurso, convenioId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {convenios?.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select
                          value={novoRecurso.prioridade}
                          onValueChange={(v: any) => setNovoRecurso({ ...novoRecurso, prioridade: v })}
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
                    </div>
                    
                    {/* Código de Glosa com busca */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Código da Glosa TISS
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={novoRecurso.codigoGlosa}
                          onChange={(e) => setNovoRecurso({ ...novoRecurso, codigoGlosa: e.target.value })}
                          placeholder="Ex: 2108"
                          list="codigos-glosa"
                          className="flex-1"
                        />
                        <datalist id="codigos-glosa">
                          {codigosGlosa.map(codigo => (
                            <option key={codigo} value={codigo}>
                              {traduzirCodigoGlosa(codigo)}
                            </option>
                          ))}
                        </datalist>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={handleBuscarSugestao}
                          disabled={!novoRecurso.codigoGlosa}
                        >
                          <Lightbulb className="h-4 w-4" />
                        </Button>
                        <Button 
                          type="button" 
                          variant="default"
                          onClick={handleGerarComIA}
                          disabled={!novoRecurso.codigoGlosa || !novoRecurso.convenioId || loadingIA}
                          className="bg-purple-600 hover:bg-purple-700"
                        >
                          {loadingIA ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          <span className="ml-1">IA</span>
                        </Button>
                      </div>
                      {novoRecurso.codigoGlosa && (
                        <p className="text-sm text-muted-foreground">
                          {traduzirCodigoGlosa(novoRecurso.codigoGlosa)}
                        </p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Código do Procedimento</Label>
                        <Input
                          value={novoRecurso.codigoProcedimento}
                          onChange={(e) => setNovoRecurso({ ...novoRecurso, codigoProcedimento: e.target.value })}
                          placeholder="Ex: 10101039"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Número da Guia</Label>
                        <Input
                          value={novoRecurso.guiaNumero}
                          onChange={(e) => setNovoRecurso({ ...novoRecurso, guiaNumero: e.target.value })}
                          placeholder="Ex: 123456"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Descrição do Procedimento</Label>
                      <Input
                        value={novoRecurso.descricaoProcedimento}
                        onChange={(e) => setNovoRecurso({ ...novoRecurso, descricaoProcedimento: e.target.value })}
                        placeholder="Ex: Consulta em pronto socorro"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Nome do Paciente</Label>
                      <Input
                        value={novoRecurso.pacienteNome}
                        onChange={(e) => setNovoRecurso({ ...novoRecurso, pacienteNome: e.target.value })}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Valor Cobrado (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={novoRecurso.valorCobrado}
                          onChange={(e) => setNovoRecurso({ ...novoRecurso, valorCobrado: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valor Glosado (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={novoRecurso.valorGlosado}
                          onChange={(e) => setNovoRecurso({ ...novoRecurso, valorGlosado: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Motivo da Glosa (informado pelo convênio)</Label>
                      <Textarea
                        value={novoRecurso.motivoGlosaConvenio}
                        onChange={(e) => setNovoRecurso({ ...novoRecurso, motivoGlosaConvenio: e.target.value })}
                        placeholder="Descreva o motivo informado pelo convênio para a glosa"
                        rows={2}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Justificativa do Recurso *</Label>
                        {sugestaoIA && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={handleUsarSugestao}
                            className="text-purple-600"
                          >
                            <Zap className="h-4 w-4 mr-1" />
                            Usar Sugestão
                          </Button>
                        )}
                      </div>
                      <Textarea
                        value={novoRecurso.justificativaRecurso}
                        onChange={(e) => setNovoRecurso({ ...novoRecurso, justificativaRecurso: e.target.value })}
                        placeholder="Descreva a justificativa para contestar a glosa"
                        rows={6}
                      />
                    </div>
                  </div>
                  
                  {/* Coluna Direita - Sugestões */}
                  <div className="space-y-4">
                    {sugestaoIA ? (
                      <Card className="border-purple-200 bg-purple-50/50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {sugestaoIA.origem === "ia_sugestao" ? (
                              <>
                                <Sparkles className="h-5 w-5 text-purple-500" />
                                Sugestão Gerada por IA
                              </>
                            ) : (
                              <>
                                <BookOpen className="h-5 w-5 text-blue-500" />
                                Sugestão do Dicionário
                              </>
                            )}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Confiança:</span>
                            <Progress value={sugestaoIA.confianca} className="w-24 h-2" />
                            <span className="text-sm font-medium">{sugestaoIA.confianca}%</span>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <Label className="text-sm font-medium">Argumento Sugerido</Label>
                            <div className="mt-1 p-3 bg-white rounded-md border text-sm max-h-40 overflow-y-auto">
                              {sugestaoIA.argumento}
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => {
                                navigator.clipboard.writeText(sugestaoIA.argumento);
                                toast.success("Argumento copiado!");
                              }}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              Copiar
                            </Button>
                          </div>
                          
                          {sugestaoIA.acoesRecomendadas && sugestaoIA.acoesRecomendadas.length > 0 && (
                            <div>
                              <Label className="text-sm font-medium">Ações Recomendadas</Label>
                              <ul className="mt-1 space-y-1">
                                {sugestaoIA.acoesRecomendadas.map((acao: string, i: number) => (
                                  <li key={i} className="text-sm flex items-start gap-2">
                                    <span className="text-purple-500 font-bold">{i + 1}.</span>
                                    {acao}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {sugestaoIA.documentosSugeridos && sugestaoIA.documentosSugeridos.length > 0 && (
                            <div>
                              <Label className="text-sm font-medium">Documentos Sugeridos</Label>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {sugestaoIA.documentosSugeridos.map((doc: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {doc}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {sugestaoIA.estatisticas && (
                            <div className="pt-2 border-t">
                              <Label className="text-sm font-medium">Estatísticas do Código</Label>
                              <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total contestações:</span>
                                  <span className="ml-1 font-medium">{sugestaoIA.estatisticas.total}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Taxa sucesso:</span>
                                  <span className="ml-1 font-medium text-green-600">{sugestaoIA.estatisticas.taxaSucesso}%</span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {sugestaoIA.argumentosHistorico && sugestaoIA.argumentosHistorico.length > 0 && (
                            <div className="pt-2 border-t">
                              <Label className="text-sm font-medium flex items-center gap-1">
                                <History className="h-4 w-4" />
                                Argumentos que Funcionaram
                              </Label>
                              <div className="mt-1 space-y-2 max-h-32 overflow-y-auto">
                                {sugestaoIA.argumentosHistorico.map((arg: any, i: number) => (
                                  <div key={i} className="p-2 bg-green-50 rounded text-xs border border-green-200">
                                    <div className="flex items-center justify-between mb-1">
                                      <Badge variant="outline" className="text-green-600 border-green-300">
                                        {arg.resultado === "deferido" ? "Deferido" : "Deferido Parcial"}
                                      </Badge>
                                      <span className="text-muted-foreground">{arg.convenioNome}</span>
                                    </div>
                                    <p className="line-clamp-2">{arg.argumentoUtilizado}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                          <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                          <h3 className="font-medium mb-2">Sugestões Inteligentes</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Informe o código da glosa e clique em <Lightbulb className="inline h-4 w-4" /> para ver sugestões do dicionário ou <Sparkles className="inline h-4 w-4" /> para gerar com IA
                          </p>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={handleBuscarSugestao}
                              disabled={!novoRecurso.codigoGlosa}
                            >
                              <Lightbulb className="h-4 w-4 mr-1" />
                              Dicionário
                            </Button>
                            <Button 
                              size="sm"
                              onClick={handleGerarComIA}
                              disabled={!novoRecurso.codigoGlosa || !novoRecurso.convenioId || loadingIA}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              <Sparkles className="h-4 w-4 mr-1" />
                              Gerar com IA
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNovoRecurso(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCriarRecurso} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Recurso"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Abas principais */}
        <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as "recursos" | "itensGlosados")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="recursos" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Recursos Criados
            </TabsTrigger>
            <TabsTrigger value="itensGlosados" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Itens Glosados (Demonstrativo)
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="recursos" className="space-y-6">
        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Recursos</p>
                  <p className="text-2xl font-bold">{estatisticas?.total || 0}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-600">{estatisticas?.pendentes || 0}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Em Análise</p>
                  <p className="text-2xl font-bold text-purple-600">{estatisticas?.emAnalise || 0}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-purple-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Deferidos</p>
                  <p className="text-2xl font-bold text-green-600">{estatisticas?.deferidos || 0}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Recuperado</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(estatisticas?.valorRecuperado || 0)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por código, guia, paciente..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Convênios</SelectItem>
                  {convenios?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {Object.entries(PRIORIDADE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Recursos */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Guia</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="text-right">Valor Glosado</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recursosData?.recursos?.map((recurso) => {
                      const StatusIcon = STATUS_CONFIG[recurso.status]?.icon || FileText;
                      return (
                        <TableRow key={recurso.id}>
                          <TableCell className="font-medium">{recurso.convenioNome}</TableCell>
                          <TableCell>{recurso.codigoProcedimento || "-"}</TableCell>
                          <TableCell>{recurso.guiaNumero || "-"}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{recurso.pacienteNome || "-"}</TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {formatCurrency(recurso.valorGlosado)}
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_CONFIG[recurso.status]?.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {STATUS_CONFIG[recurso.status]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={PRIORIDADE_CONFIG[recurso.prioridade]?.color}>
                              {PRIORIDADE_CONFIG[recurso.prioridade]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateBR(recurso.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setRecursoSelecionado(recurso.id);
                                  setShowDetalhes(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {recurso.status === "rascunho" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteMutation.mutate({ id: recurso.id })}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {((page - 1) * 15) + 1} a {Math.min(page * 15, recursosData?.total || 0)} de {recursosData?.total || 0} recursos
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Próximo
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

          </TabsContent>
          
          {/* Aba de Itens Glosados do Demonstrativo */}
          <TabsContent value="itensGlosados" className="space-y-6">
            {/* Filtros para Itens Glosados */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data Pagamento</label>
                    <Select 
                      value={dataPagamentoItens} 
                      onValueChange={(v) => { setDataPagamentoItens(v); setPageItensGlosados(1); }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as datas</SelectItem>
                        {datasDisponiveis?.map((d: any) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label} ({d.total?.toLocaleString("pt-BR")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Convênio</label>
                    <Select value={convenioFiltroItens} onValueChange={setConvenioFiltroItens}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Convênios</SelectItem>
                        {convenios?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mês Referência</label>
                    <Select 
                      value={mesReferenciaItens?.toString() || "todos"} 
                      onValueChange={(v) => setMesReferenciaItens(v === "todos" ? undefined : parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Meses</SelectItem>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {new Date(2000, m-1).toLocaleString('pt-BR', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ano Referência</label>
                    <Select 
                      value={anoReferenciaItens?.toString() || "todos"} 
                      onValueChange={(v) => setAnoReferenciaItens(v === "todos" ? undefined : parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Anos</SelectItem>
                        {[2024, 2025, 2026].map((a) => (
                          <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Buscar</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Código, descrição, paciente..."
                        value={buscaItensGlosados}
                        onChange={(e) => setBuscaItensGlosados(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" onClick={() => refetchItensGlosados()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Resumo de Itens Glosados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total de Itens Glosados</p>
                      <p className="text-2xl font-bold">{itensGlosadosData?.total || 0}</p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Total Glosado</p>
                      <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(itensGlosadosData?.items?.reduce((sum: number, item: any) => sum + parseFloat(item.valorGlosa || '0'), 0) || 0)}
                      </p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Itens na Página</p>
                      <p className="text-2xl font-bold">{itensGlosadosData?.items?.length || 0}</p>
                    </div>
                    <FileText className="h-8 w-8 text-blue-500 opacity-80" />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Tabela de Itens Glosados */}
            <Card>
              <CardHeader>
                <CardTitle>Itens Glosados do Demonstrativo</CardTitle>
                <CardDescription>
                  Itens com glosa identificados nos arquivos de retorno dos convênios. Clique em "Criar Recurso" para contestar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingItensGlosados ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guia</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor Glosa</TableHead>
                          <TableHead>Cód. Glosa</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensGlosadosData?.items?.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.numeroGuia || '-'}</TableCell>
                            <TableCell className="max-w-[150px] truncate">{item.nomeBeneficiario || '-'}</TableCell>
                            <TableCell>{item.codigoItem || '-'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.descricaoItem || '-'}</TableCell>
                            <TableCell className="text-right font-medium text-red-600">
                              {formatCurrency(item.valorGlosa)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {item.codigoGlosa || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-red-100 text-red-800">
                                {item.situacaoItem || 'Glosado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Preencher formulário de novo recurso com dados do item
                                  setNovoRecurso({
                                    convenioId: item.convenioId?.toString() || "",
                                    codigoProcedimento: item.codigoItem || "",
                                    descricaoProcedimento: item.descricaoItem || "",
                                    guiaNumero: item.numeroGuia || "",
                                    pacienteNome: item.nomeBeneficiario || "",
                                    valorCobrado: item.valorInformado?.toString() || "",
                                    valorGlosado: item.valorGlosa?.toString() || "",
                                    codigoGlosa: item.codigoGlosa || "",
                                    motivoGlosaConvenio: item.codigoGlosa ? `${item.codigoGlosa} - ${traduzirCodigoGlosa(item.codigoGlosa)}` : "",
                                    justificativaRecurso: "",
                                    prioridade: "media",
                                  });
                                  setShowNovoRecurso(true);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Criar Recurso
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!itensGlosadosData?.items || itensGlosadosData.items.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              Nenhum item glosado encontrado com os filtros selecionados.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    
                    {/* Paginação */}
                    {totalPagesItensGlosados > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                        <p className="text-sm text-muted-foreground">
                          Mostrando {((pageItensGlosados - 1) * 20) + 1} a {Math.min(pageItensGlosados * 20, itensGlosadosData?.total || 0)} de {itensGlosadosData?.total || 0} itens
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPageItensGlosados(p => Math.max(1, p - 1))}
                            disabled={pageItensGlosados === 1}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPageItensGlosados(p => Math.min(totalPagesItensGlosados, p + 1))}
                            disabled={pageItensGlosados === totalPagesItensGlosados}
                          >
                            Próximo
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Detalhes */}
        <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Recurso</DialogTitle>
            </DialogHeader>
            {recursoDetalhes && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">Informações</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                  <TabsTrigger value="acoes">Ações</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Convênio</Label>
                      <p className="font-medium">{recursoDetalhes.convenioNome}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge className={STATUS_CONFIG[recursoDetalhes.status]?.color}>
                        {STATUS_CONFIG[recursoDetalhes.status]?.label}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Código Procedimento</Label>
                      <p className="font-medium">{recursoDetalhes.codigoProcedimento || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Número da Guia</Label>
                      <p className="font-medium">{recursoDetalhes.guiaNumero || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Paciente</Label>
                      <p className="font-medium">{recursoDetalhes.pacienteNome || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Protocolo</Label>
                      <p className="font-medium">{recursoDetalhes.protocoloRecurso || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Valor Glosado</Label>
                      <p className="font-medium text-red-600">{formatCurrency(recursoDetalhes.valorGlosado)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Valor Recuperado</Label>
                      <p className="font-medium text-green-600">{formatCurrency(recursoDetalhes.valorRecuperado)}</p>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-muted-foreground">Motivo da Glosa</Label>
                    <p className="mt-1 p-3 bg-muted rounded-md">{recursoDetalhes.motivoGlosaConvenio || "-"}</p>
                  </div>
                  
                  <div>
                    <Label className="text-muted-foreground">Justificativa do Recurso</Label>
                    <p className="mt-1 p-3 bg-muted rounded-md whitespace-pre-wrap">{recursoDetalhes.justificativaRecurso}</p>
                  </div>
                  
                  {recursoDetalhes.respostaConvenio && (
                    <div>
                      <Label className="text-muted-foreground">Resposta do Convênio</Label>
                      <p className="mt-1 p-3 bg-muted rounded-md">{recursoDetalhes.respostaConvenio}</p>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="historico">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {recursoDetalhes.historico?.map((h: any) => (
                        <div key={h.id} className="flex gap-3 p-3 border rounded-lg">
                          <div className="flex-shrink-0">
                            <MessageSquare className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{h.tipo}</p>
                              <span className="text-sm text-muted-foreground">
                                {formatDateBR(h.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{h.descricao}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  
                  <div className="mt-4 flex gap-2">
                    <Input
                      placeholder="Adicionar comentário..."
                      value={novoComentario}
                      onChange={(e) => setNovoComentario(e.target.value)}
                    />
                    <Button onClick={handleAddComentario} disabled={!novoComentario}>
                      Adicionar
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="acoes" className="space-y-4">
                  {(recursoDetalhes.status === "rascunho" || recursoDetalhes.status === "pendente_envio") && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Enviar Recurso</CardTitle>
                        <CardDescription>Registre o envio do recurso ao convênio</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Protocolo de Envio (opcional)</Label>
                          <Input
                            value={protocoloEnvio}
                            onChange={(e) => setProtocoloEnvio(e.target.value)}
                            placeholder="Número do protocolo"
                          />
                        </div>
                        <Button onClick={handleEnviarRecurso} disabled={enviarMutation.isPending}>
                          <Send className="h-4 w-4 mr-2" />
                          {enviarMutation.isPending ? "Enviando..." : "Registrar Envio"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  
                  {(recursoDetalhes.status === "enviado" || recursoDetalhes.status === "em_analise") && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Registrar Resposta</CardTitle>
                        <CardDescription>Registre a resposta do convênio</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Resultado</Label>
                          <Select
                            value={resposta.status}
                            onValueChange={(v: any) => setResposta({ ...resposta, status: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="deferido">Deferido</SelectItem>
                              <SelectItem value="deferido_parcial">Deferido Parcial</SelectItem>
                              <SelectItem value="indeferido">Indeferido</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(resposta.status === "deferido" || resposta.status === "deferido_parcial") && (
                          <div className="space-y-2">
                            <Label>Valor Recuperado (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={resposta.valorRecuperado}
                              onChange={(e) => setResposta({ ...resposta, valorRecuperado: e.target.value })}
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>Resposta do Convênio</Label>
                          <Textarea
                            value={resposta.respostaConvenio}
                            onChange={(e) => setResposta({ ...resposta, respostaConvenio: e.target.value })}
                            rows={3}
                          />
                        </div>
                        <Button onClick={handleRegistrarResposta} disabled={respostaMutation.isPending}>
                          {respostaMutation.isPending ? "Registrando..." : "Registrar Resposta"}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
