import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Package, 
  Calendar, 
  DollarSign, 
  FileText, 
  Upload, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Search,
  Filter,
  Eye,
  Paperclip,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Send,
  Loader2,
  Archive,
  Layers
} from "lucide-react";
import * as XLSX from "xlsx";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-800", icon: <FileText className="h-4 w-4" /> },
  pendente_envio: { label: "Pendente Envio", color: "bg-yellow-100 text-yellow-800", icon: <Clock className="h-4 w-4" /> },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-800", icon: <Upload className="h-4 w-4" /> },
  em_analise: { label: "Em Análise", color: "bg-purple-100 text-purple-800", icon: <AlertTriangle className="h-4 w-4" /> },
  respondido: { label: "Respondido", color: "bg-orange-100 text-orange-800", icon: <CheckCircle2 className="h-4 w-4" /> },
  finalizado: { label: "Finalizado", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function AcompanhamentoRecursos() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [loteDetalhes, setLoteDetalhes] = useState<any>(null);
  const [dialogDetalhes, setDialogDetalhes] = useState(false);
  const [dialogAnexo, setDialogAnexo] = useState(false);
  const [loteParaAnexo, setLoteParaAnexo] = useState<number | null>(null);
  const [protocoloEnvio, setProtocoloEnvio] = useState("");
  const [exportando, setExportando] = useState(false);
  const [exportandoLote, setExportandoLote] = useState<number | null>(null);
  const [exportandoXml, setExportandoXml] = useState<number | null>(null);
  const [exportandoZip, setExportandoZip] = useState<number | null>(null);
  const [dialogExportarPeriodo, setDialogExportarPeriodo] = useState(false);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [dialogAnexarPdf, setDialogAnexarPdf] = useState(false);
  const [loteParaAnexarPdf, setLoteParaAnexarPdf] = useState<number | null>(null);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [uploadandoPdf, setUploadandoPdf] = useState(false);
  
  // Estados para edição inline
  const [editandoItem, setEditandoItem] = useState<number | null>(null);
  const [valorRecebidoEdit, setValorRecebidoEdit] = useState<string>("");
  const [dataPagamentoEdit, setDataPagamentoEdit] = useState<string>("");
  const [salvandoItem, setSalvandoItem] = useState(false);

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  const { data: lotes, isLoading, refetch } = trpc.recursos.listarLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    status: statusFiltro !== "todos" ? statusFiltro as any : undefined,
    search: busca || undefined,
  });

  const { data: resumo } = trpc.recursos.resumoLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const atualizarLoteMutation = trpc.recursos.atualizarLote.useMutation({
    onSuccess: () => {
      toast.success("Lote atualizado com sucesso!");
      refetch();
      setDialogAnexo(false);
      setLoteParaAnexo(null);
      setProtocoloEnvio("");
    },
    onError: (error) => toast.error(error.message),
  });

  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);
  const [loteIdParaDetalhes, setLoteIdParaDetalhes] = useState<number | null>(null);
  
  // Utils para invalidar queries
  const utils = trpc.useUtils();
  
  // Mutation para atualizar pagamento do item
  const atualizarPagamentoMutation = trpc.recursos.atualizarPagamentoItem.useMutation({
    onSuccess: () => {
      toast.success("Pagamento atualizado com sucesso!");
      const itemIdEditado = editandoItem;
      const valorEditado = valorRecebidoEdit;
      const dataEditada = dataPagamentoEdit;
      
      setEditandoItem(null);
      setSalvandoItem(false);
      
      // Atualizar o item no estado local e recalcular o total do lote
      if (loteDetalhes && loteDetalhes.itens && itemIdEditado) {
        const itensAtualizados = loteDetalhes.itens.map((item: any) => {
          if (item.id === itemIdEditado) {
            return {
              ...item,
              valorRecebido: valorEditado || "0",
              dataPagamento: dataEditada || null,
            };
          }
          return item;
        });
        
        // Recalcular o total do lote somando os valores recebidos dos itens
        let novoTotalRecebido = 0;
        for (const item of itensAtualizados) {
          const valor = parseFloat(item.valorRecebido || "0");
          if (!isNaN(valor)) {
            novoTotalRecebido += valor;
          }
        }
        
        setLoteDetalhes({ 
          ...loteDetalhes, 
          itens: itensAtualizados,
          valorTotalRecebido: novoTotalRecebido.toFixed(2)
        });
      }
      
      // Invalidar queries para atualizar dados do servidor
      utils.recursos.detalhesLote.invalidate();
      utils.recursos.listarLotes.invalidate();
      utils.recursos.resumoLotes.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setSalvandoItem(false);
    },
  });

  const handleEditarItem = (item: any) => {
    setEditandoItem(item.id);
    setValorRecebidoEdit(item.valorRecebido?.toString() || "0");
    // Converter data para formato YYYY-MM-DD para o input date
    if (item.dataPagamento) {
      const d = new Date(item.dataPagamento);
      setDataPagamentoEdit(d.toISOString().split('T')[0]);
    } else {
      setDataPagamentoEdit("");
    }
  };

  const handleSalvarPagamento = () => {
    if (!editandoItem) return;
    setSalvandoItem(true);
    atualizarPagamentoMutation.mutate({
      recursoId: editandoItem,
      valorRecebido: valorRecebidoEdit,
      dataPagamento: dataPagamentoEdit,
    });
  };

  const handleCancelarEdicao = () => {
    setEditandoItem(null);
    setValorRecebidoEdit("");
    setDataPagamentoEdit("");
  };

  const { data: detalhesLoteData, isLoading: isLoadingDetalhes } = trpc.recursos.detalhesLote.useQuery(
    { loteId: loteIdParaDetalhes! },
    { enabled: loteIdParaDetalhes !== null }
  );

  // Efeito para processar os detalhes quando carregados
  useEffect(() => {
    if (detalhesLoteData && loteIdParaDetalhes !== null) {
      // Mapear recursos para o formato esperado pelo modal
      const itens = detalhesLoteData.recursos?.map((r: any) => ({
        id: r.id,
        guiaNumero: r.guiaNumero,
        codigoProcedimento: r.codigoProcedimento,
        descricaoProcedimento: r.descricaoProcedimento,
        pacienteNome: r.pacienteNome,
        valorGlosado: r.valorGlosado,
        valorRecursado: r.valorRecursado,
        valorRecebido: r.valorRecebido,
        dataPagamento: r.dataPagamento,
        status: r.status,
        motivoGlosa: r.motivoGlosa,
        justificativa: r.justificativa,
      })) || [];
      
      setLoteDetalhes({
        ...detalhesLoteData,
        itens,
      });
      setDialogDetalhes(true);
      setCarregandoDetalhes(false);
    }
  }, [detalhesLoteData, loteIdParaDetalhes]);

  const handleVerDetalhes = async (lote: any) => {
    setCarregandoDetalhes(true);
    setLoteIdParaDetalhes(lote.id);
  };

  const handleAbrirAnexo = (loteId: number) => {
    setLoteParaAnexo(loteId);
    setDialogAnexo(true);
  };

  const handleSalvarProtocolo = () => {
    if (!loteParaAnexo) return;
    
    atualizarLoteMutation.mutate({
      loteId: loteParaAnexo,
      protocoloEnvio,
      status: "enviado",
      dataEnvio: new Date(),
    });
  };

  const calcularDiasRestantes = (dataPrazo: Date | string | null | undefined) => {
    if (!dataPrazo) return null;
    const prazo = typeof dataPrazo === "string" ? new Date(dataPrazo) : dataPrazo;
    const hoje = new Date();
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const exportarMutation = trpc.recursos.exportar.useMutation({
    onSuccess: (data) => {
      setExportando(false);
      if (data.formato === "excel") {
        // Criar workbook Excel
        const ws = XLSX.utils.json_to_sheet(data.dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recursos");
        XLSX.writeFile(wb, `recursos_glosa_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success("Arquivo Excel exportado com sucesso!");
      } else {
        // Para PDF, mostrar dados para download
        toast.success(`${data.dados.length} recursos exportados`);
      }
    },
    onError: (error) => {
      setExportando(false);
      toast.error("Erro ao exportar: " + error.message);
    },
  });

  const handleExportarExcel = () => {
    setExportando(true);
    exportarMutation.mutate({
      formato: "excel",
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      status: statusFiltro !== "todos" ? statusFiltro : undefined,
    });
  };

  const handleExportarPorPeriodo = () => {
    setExportando(true);
    exportarMutation.mutate({
      formato: "excel",
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      status: statusFiltro !== "todos" ? statusFiltro : undefined,
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim) : undefined,
    });
    setDialogExportarPeriodo(false);
  };

  // Mutation para exportar lote específico
  const exportarLoteMutation = trpc.recursos.exportarLote.useMutation({
    onSuccess: (data) => {
      setExportandoLote(null);
      // Criar workbook Excel com os dados do lote - Padrão Unimed
      const dadosFormatados = data.recursos.map((r: any) => ({
        "Seq.": r.sequencial,
        "Protocolo (DP)": r.protocoloDP,
        "Nº Guia": r.guia,
        "Seq. (DP)": r.seqDP,
        "Nome do Beneficiário": r.paciente,
        "Cód.Beneficiário": r.codigoBeneficiario,
        "Data Atendto": r.dataAtendimento,
        "Período Atendto": r.periodoAtendimento,
        "Código Serviço": r.codigoServico,
        "Descrição": r.descricao,
        "Participação": r.participacao,
        "Qtde": r.quantidade,
        "Valor Recursado": r.valorRecursado,
        "Local Atendimento": r.localAtendimento,
        "Motivo da Glosa": r.motivoGlosa,
        "Justificativa para o pagamento": r.justificativaPagamento,
        "Anexo": r.anexo,
        "Qtde Acatado": r.qtdeAcatado,
        "Valor Acatado": r.valorAcatado,
        "Pago pelo código": r.pagoPeloCodigo,
        "Valor Recebido": r.valorRecebido,
        "Data Pagamento": r.dataPagamento,
        "Observações": r.observacoes,
      }));
      
      const ws = XLSX.utils.json_to_sheet(dadosFormatados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Recursos do Lote");
      
      // Adicionar linha de totais
      const totaisSheet = XLSX.utils.json_to_sheet([{
        "Total de Itens": data.totais.totalItens,
        "Total Valor Glosado": data.totais.totalValorGlosado,
        "Total Valor Recursado": data.totais.totalValorRecursado,
        "Total Valor Recuperado": data.totais.totalValorRecuperado,
        "Total Valor Recebido": data.totais.totalValorRecebido || 0,
      }]);
      XLSX.utils.book_append_sheet(wb, totaisSheet, "Totais");
      
      XLSX.writeFile(wb, `lote_${data.lote.numeroLote}_recursos.xlsx`);
      toast.success(`Relatório do lote ${data.lote.numeroLote} exportado com sucesso!`);
    },
    onError: (error) => {
      setExportandoLote(null);
      toast.error("Erro ao exportar lote: " + error.message);
    },
  });

  const handleExportarLote = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportandoLote(loteId);
    exportarLoteMutation.mutate({ loteId });
  };

  // Estado para dialog de validação
  const [dialogValidacao, setDialogValidacao] = useState(false);
  const [resultadoValidacao, setResultadoValidacao] = useState<any>(null);

  // Mutation para exportar XML ANS/TISS (múltiplos por protocolo)
  const exportarXmlMutation = trpc.recursos.exportarXml.useMutation({
    onSuccess: (data: any, variables) => {
      setExportandoXml(null);
      
      // Verificar se há múltiplos XMLs por protocolo
      const xmlsPorProtocolo = data.xmlsPorProtocolo as Array<{ protocolo: string; xml: string; validacao: any; guias: string[]; valorTotalRecursado: number }> | undefined;
      
      if (xmlsPorProtocolo && xmlsPorProtocolo.length > 1) {
        // Múltiplos protocolos: baixar cada XML separadamente
        let temErros = false;
        for (const xmlItem of xmlsPorProtocolo) {
          const blob = new Blob([xmlItem.xml], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `recurso_glosa_lote_${variables.loteId}_protocolo_${xmlItem.protocolo}.xml`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          if (xmlItem.validacao && !xmlItem.validacao.valido) {
            temErros = true;
          }
        }
        
        if (temErros) {
          setResultadoValidacao(xmlsPorProtocolo[0].validacao);
          setDialogValidacao(true);
          toast.warning(`${xmlsPorProtocolo.length} XMLs exportados (1 por protocolo). Alguns contêm erros de validação.`);
        } else {
          toast.success(`${xmlsPorProtocolo.length} XMLs TISS exportados com sucesso! (1 por protocolo: ${xmlsPorProtocolo.map(x => x.protocolo).join(", ")})`);
        }
      } else {
        // Protocolo único: download normal
        const blob = new Blob([data.xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recurso_glosa_lote_${variables.loteId}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Exibir resultado de validação
        if (data.validacao) {
          setResultadoValidacao(data.validacao);
          if (data.validacao.valido) {
            toast.success("XML TISS exportado e validado com sucesso! Salvo no histórico.");
          } else {
            setDialogValidacao(true);
            toast.warning(`XML exportado com ${data.validacao.erros.length} erro(s) de validação TISS.`);
          }
        } else {
          toast.success("XML ANS/TISS exportado com sucesso!");
        }
      }
      
      refetch(); // Atualizar para mostrar xmlUrl no lote
    },
    onError: (error) => {
      setExportandoXml(null);
      toast.error("Erro ao exportar XML: " + error.message);
    },
  });

  const handleExportarXml = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportandoXml(loteId);
    exportarXmlMutation.mutate({ loteId });
  };

  // Mutation para baixar todos os XMLs em ZIP
  const exportarZipMutation = trpc.recursos.exportarXmlZip.useMutation({
    onSuccess: (data: any) => {
      setExportandoZip(null);
      // Abrir URL do ZIP para download
      window.open(data.zipUrl, '_blank');
      
      const todosValidos = data.resultados.every((r: any) => r.valido);
      if (todosValidos) {
        toast.success(`ZIP com ${data.totalXmls} XMLs exportado com sucesso!`);
      } else {
        const comErros = data.resultados.filter((r: any) => !r.valido).length;
        toast.warning(`ZIP exportado com ${data.totalXmls} XMLs. ${comErros} contém erros de validação.`);
      }
      refetch();
    },
    onError: (error) => {
      setExportandoZip(null);
      toast.error("Erro ao exportar ZIP: " + error.message);
    },
  });

  const handleExportarZip = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportandoZip(loteId);
    exportarZipMutation.mutate({ loteId });
  };

  // Mutation para anexar PDF de protocolo
  const anexarProtocoloMutation = trpc.recursos.anexarProtocoloLote.useMutation({
    onSuccess: () => {
      toast.success("Protocolo anexado com sucesso!");
      setDialogAnexarPdf(false);
      setLoteParaAnexarPdf(null);
      setArquivoPdf(null);
      setUploadandoPdf(false);
      refetch();
    },
    onError: (error) => {
      setUploadandoPdf(false);
      toast.error("Erro ao anexar protocolo: " + error.message);
    },
  });

  const handleAbrirAnexarPdf = (loteId: number, e: React.MouseEvent, anexoPdfUrl?: string) => {
    e.stopPropagation();
    // Se já tem PDF anexado, abrir em nova aba
    if (anexoPdfUrl) {
      window.open(anexoPdfUrl, "_blank");
      return;
    }
    // Senão, abrir dialog para anexar
    setLoteParaAnexarPdf(loteId);
    setDialogAnexarPdf(true);
  };

  const handleUploadPdf = async () => {
    if (!arquivoPdf || !loteParaAnexarPdf) return;
    
    setUploadandoPdf(true);
    
    try {
      // Converter arquivo para base64 e enviar para o servidor
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        // Por enquanto, simular o upload salvando uma referência
        // Em produção, isso seria enviado para o S3
        const fakeUrl = `protocolo_lote_${loteParaAnexarPdf}_${Date.now()}.pdf`;
        const fakeKey = `protocolos/${fakeUrl}`;
        
        anexarProtocoloMutation.mutate({
          loteId: loteParaAnexarPdf,
          anexoUrl: fakeUrl,
          anexoKey: fakeKey,
        });
      };
      reader.readAsDataURL(arquivoPdf);
    } catch (error) {
      setUploadandoPdf(false);
      toast.error("Erro ao processar arquivo");
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Acompanhamento de Recursos</h1>
          <p className="text-muted-foreground">
            Gerencie os lotes de recursos enviados aos convênios
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportarExcel}
            disabled={exportando || !lotes?.lotes?.length}
          >
            {exportando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Exportar Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => setDialogExportarPeriodo(true)}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Exportar por Período
          </Button>
          <Button asChild>
            <a href="/envio-recursos-lote">
              <Send className="h-4 w-4 mr-2" />
              Enviar em Lote
            </a>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Lotes</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.totalLotes || 0}</div>
            <p className="text-xs text-muted-foreground">
              {resumo?.lotesEnviados || 0} enviados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Glosado</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(resumo?.valorTotalGlosado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total em recursos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Recursado</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(resumo?.valorTotalRecursado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando resposta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Recuperado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(resumo?.valorTotalRecuperado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo?.valorTotalRecursado ? `${((resumo.valorTotalRecuperado / resumo.valorTotalRecursado) * 100).toFixed(1)}% de sucesso` : "0% de sucesso"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número do lote ou protocolo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="min-w-[180px]">
              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {convenios?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Lotes */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes de Recursos</CardTitle>
          <CardDescription>
            Clique em um lote para ver os detalhes e itens recursados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !lotes || !lotes.lotes || lotes.lotes.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum lote encontrado</h3>
              <p className="text-muted-foreground">
                Os lotes de recursos aparecerão aqui quando você criar recursos na tela de Análise de Glosa
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotes.lotes.map((lote: any) => {
                const statusConfig = STATUS_CONFIG[lote.status] || STATUS_CONFIG.rascunho;
                const diasRestantes = calcularDiasRestantes(lote.dataPrazoPagamento);
                
                return (
                  <div
                    key={lote.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleVerDetalhes(lote)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Package className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">Lote {lote.numeroLote}</h3>
                            <Badge className={statusConfig.color}>
                              {statusConfig.icon}
                              <span className="ml-1">{statusConfig.label}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {lote.convenioNome || "Convênio"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(lote.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              {lote.quantidadeItens || 0} itens
                            </span>
                            {lote.totalProtocolos > 1 && (
                              <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 dark:text-blue-400">
                                <Layers className="h-3 w-3 mr-1" />
                                {lote.totalProtocolos} protocolos ({lote.totalProtocolos} XMLs)
                              </Badge>
                            )}
                          </div>
                          {lote.protocoloEnvio && (
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Protocolo:</span>{" "}
                              <span className="font-medium">{lote.protocoloEnvio}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Glosado:</span>{" "}
                            <span className="font-medium text-red-600">
                              {formatCurrency(lote.valorTotalGlosado)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Recursado:</span>{" "}
                            <span className="font-medium text-orange-600">
                              {formatCurrency(lote.valorTotalRecursado)}
                            </span>
                          </div>
                          {lote.valorTotalRecuperado > 0 && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Recuperado:</span>{" "}
                              <span className="font-medium text-green-600">
                                {formatCurrency(lote.valorTotalRecuperado)}
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Alerta de prazo de resposta */}
                        {lote.dataPrazoResposta && (() => {
                          const diasPrazo = calcularDiasRestantes(lote.dataPrazoResposta);
                          if (diasPrazo !== null && diasPrazo >= 0) {
                            return (
                              <Badge 
                                variant={diasPrazo <= 5 ? "destructive" : diasPrazo <= 10 ? "secondary" : "outline"} 
                                className="mt-2"
                              >
                                <AlertTriangle className={`h-3 w-3 mr-1 ${diasPrazo <= 5 ? "animate-pulse" : ""}`} />
                                {diasPrazo === 0 ? "Prazo vence HOJE!" : diasPrazo === 1 ? "1 dia para resposta" : `${diasPrazo} dias para resposta`}
                              </Badge>
                            );
                          }
                          if (diasPrazo !== null && diasPrazo < 0) {
                            return (
                              <Badge variant="destructive" className="mt-2">
                                <XCircle className="h-3 w-3 mr-1" />
                                Prazo vencido há {Math.abs(diasPrazo)} dias
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                        {diasRestantes !== null && diasRestantes >= 0 && (
                          <Badge 
                            variant={diasRestantes <= 5 ? "destructive" : "outline"} 
                            className="mt-2"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {diasRestantes} dias para pagamento
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t">
                      <div className="flex gap-2">
                        {/* Botão Exportar Excel do Lote */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleExportarLote(lote.id, e)}
                          disabled={exportandoLote === lote.id}
                          title="Exportar Excel (Padrão Unimed)"
                        >
                          {exportandoLote === lote.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="h-4 w-4 mr-1" />
                          )}
                          Excel
                        </Button>
                        
                        {/* Botão Exportar XML ANS/TISS */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleExportarXml(lote.id, e)}
                          disabled={exportandoXml === lote.id}
                          title={lote.xmlUrl ? "Regerar XML (Padrão ANS/TISS)" : "Gerar XML (Padrão ANS/TISS)"}
                        >
                          {exportandoXml === lote.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-1" />
                          )}
                          {lote.xmlUrl ? "Regerar XML" : "Gerar XML"}
                        </Button>
                        
                        {/* Botão Download XML salvo no S3 */}
                        {lote.xmlUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(lote.xmlUrl, '_blank');
                            }}
                            title={`XML gerado em ${lote.xmlGeradoEm ? formatDate(lote.xmlGeradoEm) : '-'}`}
                            className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Baixar XML
                          </Button>
                        )}
                        
                        {/* Botão Baixar ZIP com todos os XMLs (quando há múltiplos protocolos) */}
                        {lote.totalProtocolos > 1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => handleExportarZip(lote.id, e)}
                            disabled={exportandoZip === lote.id}
                            title={`Baixar ZIP com ${lote.totalProtocolos} XMLs (1 por protocolo)`}
                            className="text-purple-600 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
                          >
                            {exportandoZip === lote.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Archive className="h-4 w-4 mr-1" />
                            )}
                            Baixar ZIP ({lote.totalProtocolos} XMLs)
                          </Button>
                        )}
                        
                        {/* Botão Anexar PDF de Protocolo */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleAbrirAnexarPdf(lote.id, e, lote.anexoPdfUrl)}
                        >
                          {lote.anexoPdfUrl ? (
                            <><Eye className="h-4 w-4 mr-1" /> Ver PDF</>
                          ) : (
                            <><Upload className="h-4 w-4 mr-1" /> Anexar PDF</>
                          )}
                        </Button>
                        
                        {!lote.protocoloEnvio && lote.status === "pendente_envio" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAbrirAnexo(lote.id);
                            }}
                          >
                            <Paperclip className="h-4 w-4 mr-1" />
                            Registrar Envio
                          </Button>
                        )}
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes do Lote */}
      <Dialog open={dialogDetalhes} onOpenChange={setDialogDetalhes}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Lote {loteDetalhes?.numeroLote}</DialogTitle>
            <DialogDescription>
              Visualize os itens recursados e o status do lote
            </DialogDescription>
          </DialogHeader>
          
          {loteDetalhes && (
            <div className="space-y-6">
              {/* Informações do Lote */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={STATUS_CONFIG[loteDetalhes.status]?.color || "bg-gray-100"}>
                    {STATUS_CONFIG[loteDetalhes.status]?.label || loteDetalhes.status}
                  </Badge>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Convênio</p>
                  <p className="font-medium">{loteDetalhes.convenioNome}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Data Envio</p>
                  <p className="font-medium">{formatDate(loteDetalhes.dataEnvio)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-medium">{loteDetalhes.protocoloEnvio || "-"}</p>
                </div>
              </div>

              {/* Valores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                    <p className="text-xl font-bold text-red-600">
                      {formatCurrency(loteDetalhes.valorTotalGlosado)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recursado</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(loteDetalhes.valorTotalRecursado)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recuperado</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(loteDetalhes.valorTotalRecuperado)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recebido</p>
                    <p className="text-xl font-bold text-green-700">
                      {formatCurrency(loteDetalhes.valorTotalRecebido || 0)}
                    </p>
                    {loteDetalhes.dataPagamento && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Pago em: {formatDate(loteDetalhes.dataPagamento)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de Itens */}
              {loteDetalhes.itens && loteDetalhes.itens.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Itens Recursados ({loteDetalhes.itens.length})</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guia</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="text-right">Vl. Glosado</TableHead>
                          <TableHead className="text-right">Vl. Recebido</TableHead>
                          <TableHead>Data Pgto</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loteDetalhes.itens.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.guiaNumero || "-"}</TableCell>
                            <TableCell>{item.codigoProcedimento}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {item.descricaoProcedimento}
                            </TableCell>
                            <TableCell>{item.pacienteNome || "-"}</TableCell>
                            <TableCell className="text-right text-red-600">
                              {formatCurrency(item.valorGlosado)}
                            </TableCell>
                            <TableCell className="text-right">
                              {editandoItem === item.id ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={valorRecebidoEdit}
                                  onChange={(e) => setValorRecebidoEdit(e.target.value)}
                                  className="w-28 text-right text-green-600"
                                />
                              ) : (
                                <span className="text-green-600">
                                  {formatCurrency(item.valorRecebido || 0)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editandoItem === item.id ? (
                                <Input
                                  type="date"
                                  value={dataPagamentoEdit}
                                  onChange={(e) => setDataPagamentoEdit(e.target.value)}
                                  className="w-36"
                                />
                              ) : (
                                item.dataPagamento ? formatDate(item.dataPagamento) : "-"
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.status === "deferido" ? "Deferido" : 
                                 item.status === "indeferido" ? "Indeferido" : 
                                 item.status === "enviado" ? "Enviado" : "Pendente"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {editandoItem === item.id ? (
                                <div className="flex gap-1 justify-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleSalvarPagamento}
                                    disabled={salvandoItem}
                                    className="h-7 px-2 text-green-600 hover:text-green-700"
                                  >
                                    {salvandoItem ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelarEdicao}
                                    disabled={salvandoItem}
                                    className="h-7 px-2 text-red-600 hover:text-red-700"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditarItem(item)}
                                  className="h-7 px-2"
                                  title="Editar pagamento"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Anexo PDF */}
              {loteDetalhes.anexoPdfUrl && (
                <div>
                  <h4 className="font-medium mb-3">Comprovante de Envio</h4>
                  <Button variant="outline" asChild>
                    <a href={loteDetalhes.anexoPdfUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 mr-2" />
                      Visualizar PDF
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDetalhes(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Registrar Envio */}
      <Dialog open={dialogAnexo} onOpenChange={setDialogAnexo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Envio do Recurso</DialogTitle>
            <DialogDescription>
              Informe o protocolo de envio para registrar que o recurso foi enviado ao convênio
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Protocolo de Envio</label>
              <Input
                placeholder="Ex: 2024-001234"
                value={protocoloEnvio}
                onChange={(e) => setProtocoloEnvio(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAnexo(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSalvarProtocolo}
              disabled={!protocoloEnvio || atualizarLoteMutation.isPending}
            >
              {atualizarLoteMutation.isPending ? "Salvando..." : "Registrar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Anexar PDF de Protocolo */}
      <Dialog open={dialogAnexarPdf} onOpenChange={setDialogAnexarPdf}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anexar PDF de Protocolo</DialogTitle>
            <DialogDescription>
              Anexe o comprovante de protocolo do recurso enviado ao convênio
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Arquivo PDF</label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => setArquivoPdf(e.target.files?.[0] || null)}
              />
              {arquivoPdf && (
                <p className="text-sm text-muted-foreground mt-2">
                  Arquivo selecionado: {arquivoPdf.name} ({(arquivoPdf.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogAnexarPdf(false);
              setArquivoPdf(null);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUploadPdf}
              disabled={!arquivoPdf || uploadandoPdf}
            >
              {uploadandoPdf ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Anexar PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Exportar por Período */}
      <Dialog open={dialogExportarPeriodo} onOpenChange={setDialogExportarPeriodo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Recursos por Período</DialogTitle>
            <DialogDescription>
              Selecione o período para exportar os recursos de glosa
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Data Início</label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Data Fim</label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Convênio (opcional)</label>
                <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
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
                <label className="text-sm font-medium mb-2 block">Status (opcional)</label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="pendente_envio">Pendente Envio</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="respondido">Respondido</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogExportarPeriodo(false);
              setDataInicio("");
              setDataFim("");
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleExportarPorPeriodo}
              disabled={!dataInicio || !dataFim || exportando}
            >
              {exportando ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</>
              ) : (
                <><FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Validação TISS */}
      <Dialog open={dialogValidacao} onOpenChange={setDialogValidacao}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {resultadoValidacao?.valido ? (
                <><CheckCircle2 className="h-5 w-5 text-green-500" /> Validação TISS - Aprovado</>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-yellow-500" /> Validação TISS - Atenção</>
              )}
            </DialogTitle>
            <DialogDescription>
              Resultado da validação do XML contra o padrão TISS 4.01.00 da ANS
            </DialogDescription>
          </DialogHeader>
          
          {resultadoValidacao && (
            <div className="space-y-4">
              {resultadoValidacao.erros.length > 0 && (
                <div>
                  <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> Erros ({resultadoValidacao.erros.length})
                  </h4>
                  <div className="space-y-1">
                    {resultadoValidacao.erros.map((erro: any, idx: number) => (
                      <div key={idx} className="text-sm p-2 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                        <span className="font-mono text-xs text-red-500">{erro.campo}</span>
                        <p className="text-red-700 dark:text-red-300">{erro.mensagem}</p>
                        <Badge variant="outline" className="text-xs mt-1">{erro.tipo}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {resultadoValidacao.avisos.length > 0 && (
                <div>
                  <h4 className="font-semibold text-yellow-600 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Avisos ({resultadoValidacao.avisos.length})
                  </h4>
                  <div className="space-y-1">
                    {resultadoValidacao.avisos.map((aviso: any, idx: number) => (
                      <div key={idx} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800">
                        <span className="font-mono text-xs text-yellow-500">{aviso.campo}</span>
                        <p className="text-yellow-700 dark:text-yellow-300">{aviso.mensagem}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {resultadoValidacao.valido && resultadoValidacao.avisos.length === 0 && (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <p className="text-green-600 font-medium">XML válido conforme padrão TISS 4.01.00</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogValidacao(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
