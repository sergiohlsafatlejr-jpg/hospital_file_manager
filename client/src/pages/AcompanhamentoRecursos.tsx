import { useState, useEffect, useRef } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Eye,
  Paperclip,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Send,
  Loader2,
  Archive,
  Layers,
  RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatDateBR, toInputDateValue } from "@/lib/dateUtils";
import {
  contextoUnidadeAindaAtual,
  ContextoUnidade,
  isFonteComRecebimentoRecursoInformado,
  normalizarCamposFinanceirosRecurso,
  podeConfirmarEnvioManual,
  rotuloRecebimentoRecurso,
  validarConfirmacaoEnvioManual,
} from "@/lib/recursoEnvioUi";
import { isLoteUnimed } from "@/lib/recursoLoteExport";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const formatCurrencyOrUnknown = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  return formatCurrency(value);
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-800", icon: <FileText className="h-4 w-4" /> },
  pendente_envio: { label: "Pendente Envio", color: "bg-yellow-100 text-yellow-800", icon: <Clock className="h-4 w-4" /> },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-800", icon: <Send className="h-4 w-4" /> },
  em_analise: { label: "Em Análise", color: "bg-purple-100 text-purple-800", icon: <AlertTriangle className="h-4 w-4" /> },
  respondido: { label: "Respondido", color: "bg-orange-100 text-orange-800", icon: <CheckCircle2 className="h-4 w-4" /> },
  finalizado: { label: "Finalizado", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function AcompanhamentoRecursos() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [abaAtiva, setAbaAtiva] = useState("envio");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [loteDetalhes, setLoteDetalhes] = useState<any>(null);
  const [dialogDetalhes, setDialogDetalhes] = useState(false);
  const [exportandoLote, setExportandoLote] = useState<number | null>(null);
  const [exportandoXml, setExportandoXml] = useState<number | null>(null);
  const [exportandoZip, setExportandoZip] = useState<number | null>(null);
  const [dialogAnexarPdf, setDialogAnexarPdf] = useState(false);
  const [loteParaAnexarPdf, setLoteParaAnexarPdf] = useState<number | null>(null);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [uploadandoPdf, setUploadandoPdf] = useState(false);
  const [dialogValidacao, setDialogValidacao] = useState(false);
  const [resultadoValidacao, setResultadoValidacao] = useState<any>(null);
  const [dialogConfirmarEnvio, setDialogConfirmarEnvio] = useState(false);
  const [loteParaConfirmarEnvio, setLoteParaConfirmarEnvio] = useState<any>(null);
  const [dataEnvioConfirmacao, setDataEnvioConfirmacao] = useState("");
  const [protocoloEnvioConfirmacao, setProtocoloEnvioConfirmacao] = useState("");
  
  // Estados para edição inline de recebimento do recurso informado manualmente.
  const [editandoItem, setEditandoItem] = useState<number | null>(null);
  const [valorRecebidoRecursoEdit, setValorRecebidoRecursoEdit] = useState<string>("");
  const [dataRecebimentoRecursoEdit, setDataRecebimentoRecursoEdit] = useState<string>("");
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [loteIdParaDetalhes, setLoteIdParaDetalhes] = useState<number | null>(null);

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Query única para todos os lotes - filtro por aba feito no frontend
  const { data: todosLotes, isLoading: isLoadingLotes, refetch: refetchLotes } = trpc.recursos.listarLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    search: busca || undefined,
    limit: 100,
  }, { enabled: !!estabelecimentoAtual?.id });

  const { data: resumo } = trpc.recursos.resumoLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  }, { enabled: !!estabelecimentoAtual?.id });
  const resumoFinanceiro = resumo;

  const utils = trpc.useUtils();
  const estabelecimentoIdAtual = estabelecimentoAtual?.id ?? null;
  const contextoUnidadeRef = useRef<ContextoUnidade>({ estabelecimentoId: estabelecimentoIdAtual, versao: 0 });
  const contextoDetalhesRef = useRef<ContextoUnidade | null>(null);
  const contextoExportacoesRef = useRef(new Map<string, ContextoUnidade>());
  const contextoPagamentosRef = useRef(new Map<number, ContextoUnidade>());
  const contextoConfirmacaoRef = useRef<ContextoUnidade | null>(null);

  const capturarContextoUnidade = (): ContextoUnidade => ({ ...contextoUnidadeRef.current });
  const callbackPertenceAUnidadeAtual = (contexto: ContextoUnidade | null | undefined) =>
    contextoUnidadeAindaAtual(contexto, contextoUnidadeRef.current);

  useEffect(() => {
    if (contextoUnidadeRef.current.estabelecimentoId === estabelecimentoIdAtual) return;

    contextoUnidadeRef.current = {
      estabelecimentoId: estabelecimentoIdAtual,
      versao: contextoUnidadeRef.current.versao + 1,
    };
    contextoDetalhesRef.current = null;
    contextoExportacoesRef.current.clear();
    contextoPagamentosRef.current.clear();
    contextoConfirmacaoRef.current = null;
    setLoteDetalhes(null);
    setLoteIdParaDetalhes(null);
    setDialogDetalhes(false);
    setEditandoItem(null);
    setValorRecebidoRecursoEdit("");
    setDataRecebimentoRecursoEdit("");
    setSalvandoItem(false);
    setDialogConfirmarEnvio(false);
    setLoteParaConfirmarEnvio(null);
    setDataEnvioConfirmacao("");
    setProtocoloEnvioConfirmacao("");
    setDialogValidacao(false);
    setResultadoValidacao(null);
    setExportandoLote(null);
    setExportandoXml(null);
    setExportandoZip(null);
  }, [estabelecimentoIdAtual]);

  // A rota atual usa os aliases legados; eles representam exclusivamente o
  // recebimento do recurso, não o pagamento original da conta.
  const atualizarPagamentoMutation = trpc.recursos.atualizarPagamentoItem.useMutation({
    onSuccess: (_data, variables) => {
      const contexto = contextoPagamentosRef.current.get(variables.recursoId);
      contextoPagamentosRef.current.delete(variables.recursoId);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;

      toast.success("Recebimento do recurso atualizado com sucesso!");
      setEditandoItem(null);
      setSalvandoItem(false);
      void utils.recursos.detalhesLote.invalidate();
      void utils.recursos.listarLotes.invalidate();
      void utils.recursos.resumoLotes.invalidate();
      void refetchLotes();
    },
    onError: (error, variables) => {
      const contexto = contextoPagamentosRef.current.get(variables.recursoId);
      contextoPagamentosRef.current.delete(variables.recursoId);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;
      toast.error(error.message);
      setSalvandoItem(false);
    },
  });

  // Detalhes do lote
  const { data: detalhesLoteData } = trpc.recursos.detalhesLote.useQuery(
    { loteId: loteIdParaDetalhes! },
    { enabled: loteIdParaDetalhes !== null }
  );

  useEffect(() => {
    if (
      detalhesLoteData
      && loteIdParaDetalhes !== null
      && callbackPertenceAUnidadeAtual(contextoDetalhesRef.current)
    ) {
      const itens = detalhesLoteData.itens || detalhesLoteData.recursos || [];
      
      setLoteDetalhes({ ...detalhesLoteData, itens });
      setDialogDetalhes(true);
    }
  }, [detalhesLoteData, loteIdParaDetalhes]);

  const handleVerDetalhes = (lote: any) => {
    contextoDetalhesRef.current = capturarContextoUnidade();
    setEditandoItem(null);
    setValorRecebidoRecursoEdit("");
    setDataRecebimentoRecursoEdit("");
    setLoteIdParaDetalhes(lote.id);
  };

  const fecharDetalhes = () => {
    contextoDetalhesRef.current = null;
    setLoteIdParaDetalhes(null);
    setLoteDetalhes(null);
    setDialogDetalhes(false);
    setEditandoItem(null);
  };

  const handleEditarItem = (item: any) => {
    const financeiro = normalizarCamposFinanceirosRecurso(item);
    setEditandoItem(item.id);
    setValorRecebidoRecursoEdit(financeiro.valorRecebidoRecurso?.toString() || "");
    setDataRecebimentoRecursoEdit(financeiro.dataRecebimentoRecurso ? toInputDateValue(financeiro.dataRecebimentoRecurso) : "");
  };

  const handleSalvarPagamento = () => {
    if (!editandoItem) return;
    contextoPagamentosRef.current.set(editandoItem, capturarContextoUnidade());
    setSalvandoItem(true);
    atualizarPagamentoMutation.mutate({
      recursoId: editandoItem,
      valorRecebido: valorRecebidoRecursoEdit,
      dataPagamento: dataRecebimentoRecursoEdit,
    });
  };

  const handleCancelarEdicao = () => {
    setEditandoItem(null);
    setValorRecebidoRecursoEdit("");
    setDataRecebimentoRecursoEdit("");
  };

  const calcularDiasRestantes = (dataPrazo: Date | string | null | undefined) => {
    if (!dataPrazo) return null;
    const prazo = typeof dataPrazo === "string" ? new Date(dataPrazo) : dataPrazo;
    const hoje = new Date();
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const confirmarEnvioLoteMutation = trpc.recursos.confirmarEnvioLote.useMutation({
    onSuccess: () => {
      const contexto = contextoConfirmacaoRef.current;
      contextoConfirmacaoRef.current = null;
      if (!callbackPertenceAUnidadeAtual(contexto)) return;

      toast.success("Envio externo declarado e registrado com sucesso.");
      setDialogConfirmarEnvio(false);
      setLoteParaConfirmarEnvio(null);
      setDataEnvioConfirmacao("");
      setProtocoloEnvioConfirmacao("");
      void utils.recursos.detalhesLote.invalidate();
      void utils.recursos.listarLotes.invalidate();
      void utils.recursos.resumoLotes.invalidate();
      void refetchLotes();
    },
    onError: (error: { message: string }) => {
      const contexto = contextoConfirmacaoRef.current;
      contextoConfirmacaoRef.current = null;
      if (!callbackPertenceAUnidadeAtual(contexto)) return;
      toast.error(error.message);
    },
  });

  const exportacaoEmAndamento = exportandoLote !== null || exportandoXml !== null || exportandoZip !== null;

  // Mutation para exportar lote específico em Excel. Exportar apenas gera o
  // arquivo local; nunca declara ou altera o envio externo do lote.
  const exportarLoteMutation = trpc.recursos.exportarLote.useMutation({
    onSuccess: (data: any, variables) => {
      const contexto = contextoExportacoesRef.current.get(`excel:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`excel:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;

      setExportandoLote(null);
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
        "Pago pelo código": r.pagoPeloCodigo,
        "Pago original da conta": r.valorPagoOriginal ?? null,
        "Data pagamento original": r.dataPagamentoOriginal ?? null,
        "Recebido do recurso (informado)": r.valorRecebidoRecurso ?? null,
        "Data recebimento recurso": r.dataRecebimentoRecurso ?? null,
        "Valor acatado": r.valorAcatado ?? null,
        "Carteirinha": r.carteirinha ?? r.codigoBeneficiario ?? "",
        "Data do Item": r.dataItem ?? r.dataAtendimento ?? "",
        "Valor Glosado": r.valorGlosado ?? null,
        "Descrição do Recurso Realizado": r.descricaoRecurso ?? r.justificativaPagamento ?? "",
        "Observações": r.observacoes,
      }));
      
      const ws = XLSX.utils.json_to_sheet(dadosFormatados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Recursos do Lote");
      
      const totaisSheet = XLSX.utils.json_to_sheet([{
        "Total de Itens": data.totais.totalItens,
        "Total Valor Glosado": data.totais.totalValorGlosado,
        "Total Valor Recursado": data.totais.totalValorRecursado,
        "Valor acatado (registrado)": data.totais.totalValorAcatado ?? data.totais.totalValorRecuperado ?? 0,
        "Total recebido do recurso (informado)": data.totais.totalValorRecebidoRecurso ?? null,
      }]);
      XLSX.utils.book_append_sheet(wb, totaisSheet, "Totais");
      
      XLSX.writeFile(wb, `lote_${data.lote.numeroLote}_recursos.xlsx`);
      toast.success(`Arquivo Excel do lote ${data.lote.numeroLote} gerado com sucesso.`);
    },
    onError: (error, variables) => {
      const contexto = contextoExportacoesRef.current.get(`excel:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`excel:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;
      setExportandoLote(null);
      toast.error("Erro ao exportar lote: " + error.message);
    },
  });

  // Mutation para exportar XML ANS/TISS
  const exportarXmlMutation = trpc.recursos.exportarXml.useMutation({
    onSuccess: (data: any, variables) => {
      const contexto = contextoExportacoesRef.current.get(`xml:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`xml:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;

      setExportandoXml(null);
      
      const xmlsPorProtocolo = data.xmlsPorProtocolo as Array<{ protocolo: string; xml: string; validacao: any; guias: string[]; valorTotalRecursado: number }> | undefined;
      
      if (xmlsPorProtocolo && xmlsPorProtocolo.length > 1) {
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
          if (xmlItem.validacao && !xmlItem.validacao.valido) temErros = true;
        }
        
        if (temErros) {
          setResultadoValidacao(xmlsPorProtocolo[0].validacao);
          setDialogValidacao(true);
          toast.warning(`${xmlsPorProtocolo.length} XMLs gerados. Alguns contêm erros de validação e não foram enviados ao convênio.`);
        } else {
          toast.success(`${xmlsPorProtocolo.length} XMLs TISS gerados com sucesso.`);
        }
      } else {
        const blob = new Blob([data.xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recurso_glosa_lote_${variables.loteId}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (data.validacao) {
          setResultadoValidacao(data.validacao);
          if (data.validacao.valido) {
            toast.success("XML TISS gerado e validado com sucesso.");
          } else {
            setDialogValidacao(true);
            toast.warning(`XML gerado com ${data.validacao.erros.length} erro(s) de validação e não foi enviado ao convênio.`);
          }
        } else {
          toast.success("XML ANS/TISS gerado com sucesso.");
        }
      }
    },
    onError: (error, variables) => {
      const contexto = contextoExportacoesRef.current.get(`xml:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`xml:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;
      setExportandoXml(null);
      toast.error("Erro ao exportar XML: " + error.message);
    },
  });

  // Mutation para baixar ZIP
  const exportarZipMutation = trpc.recursos.exportarXmlZip.useMutation({
    onSuccess: (data: any, variables: any) => {
      const contexto = contextoExportacoesRef.current.get(`zip:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`zip:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;

      setExportandoZip(null);
      window.open(data.zipUrl, '_blank');
      
      const todosValidos = data.resultados.every((r: any) => r.valido);
      if (todosValidos) {
        toast.success(`Arquivo ZIP com ${data.totalXmls} XMLs gerado com sucesso.`);
      } else {
        const comErros = data.resultados.filter((r: any) => !r.valido).length;
        toast.warning(`Arquivo ZIP gerado com ${data.totalXmls} XMLs. ${comErros} contêm erros de validação e não foram enviados ao convênio.`);
      }
    },
    onError: (error, variables) => {
      const contexto = contextoExportacoesRef.current.get(`zip:${variables.loteId}`);
      contextoExportacoesRef.current.delete(`zip:${variables.loteId}`);
      if (!callbackPertenceAUnidadeAtual(contexto)) return;
      setExportandoZip(null);
      toast.error("Erro ao exportar ZIP: " + error.message);
    },
  });

  // Mutation para anexar PDF
  const anexarProtocoloMutation = trpc.recursos.anexarProtocoloLote.useMutation({
    onSuccess: () => {
      toast.success("Protocolo anexado com sucesso!");
      setDialogAnexarPdf(false);
      setLoteParaAnexarPdf(null);
      setArquivoPdf(null);
      setUploadandoPdf(false);
      refetchLotes();
    },
    onError: (error) => {
      setUploadandoPdf(false);
      toast.error("Erro ao anexar protocolo: " + error.message);
    },
  });

  const handleAbrirConfirmacaoEnvio = (lote: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!podeConfirmarEnvioManual(lote)) {
      toast.error("Este lote não pode ter o envio confirmado neste status.");
      return;
    }
    if (exportacaoEmAndamento) {
      toast.warning("Aguarde a geração do arquivo terminar antes de confirmar o envio externo.");
      return;
    }

    setLoteParaConfirmarEnvio(lote);
    setDataEnvioConfirmacao(toInputDateValue(new Date()));
    setProtocoloEnvioConfirmacao(lote.protocoloEnvio || "");
    setDialogConfirmarEnvio(true);
  };

  const handleConfirmarEnvioManual = () => {
    if (!loteParaConfirmarEnvio || !podeConfirmarEnvioManual(loteParaConfirmarEnvio)) return;
    if (exportacaoEmAndamento) {
      toast.warning("A confirmação não pode ser registrada durante uma exportação.");
      return;
    }

    const validacao = validarConfirmacaoEnvioManual({
      dataEnvio: dataEnvioConfirmacao,
      protocoloEnvio: protocoloEnvioConfirmacao,
    });
    if (!validacao.valido) {
      toast.error(validacao.erros[0]);
      return;
    }

    contextoConfirmacaoRef.current = capturarContextoUnidade();
    confirmarEnvioLoteMutation.mutate({
      loteId: loteParaConfirmarEnvio.id,
      protocoloEnvio: validacao.protocoloEnvio,
      dataEnvio: validacao.dataEnvio,
      confirmar: true,
    });
  };

  const handleExportarLote = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    contextoExportacoesRef.current.set(`excel:${loteId}`, capturarContextoUnidade());
    setExportandoLote(loteId);
    exportarLoteMutation.mutate({ loteId });
  };

  const handleExportarXml = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    contextoExportacoesRef.current.set(`xml:${loteId}`, capturarContextoUnidade());
    setExportandoXml(loteId);
    exportarXmlMutation.mutate({ loteId });
  };

  const handleExportarZip = (loteId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    contextoExportacoesRef.current.set(`zip:${loteId}`, capturarContextoUnidade());
    setExportandoZip(loteId);
    exportarZipMutation.mutate({ loteId });
  };

  const handleAbrirAnexarPdf = (loteId: number, e: React.MouseEvent, anexoPdfUrl?: string) => {
    e.stopPropagation();
    if (anexoPdfUrl) {
      window.open(anexoPdfUrl, "_blank");
      return;
    }
    setLoteParaAnexarPdf(loteId);
    setDialogAnexarPdf(true);
  };

  const handleUploadPdf = async () => {
    if (!arquivoPdf || !loteParaAnexarPdf) return;
    setUploadandoPdf(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
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

  // Renderizar card de lote
  const renderLoteCard = (lote: any, isEnvio: boolean) => {
    const statusConfig = STATUS_CONFIG[lote.status] || STATUS_CONFIG.rascunho;
    const diasRestantes = calcularDiasRestantes(lote.dataPrazoPagamento);
    const loteUnimed = isLoteUnimed(lote);
    
    return (
      <div
        key={lote.id}
        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => handleVerDetalhes(lote)}
      >
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="shrink-0 p-2 bg-primary/10 rounded-lg">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="font-semibold break-words">Lote {lote.numeroLote}</h3>
                <Badge className={statusConfig.color}>
                  {statusConfig.icon}
                  <span className="ml-1">{statusConfig.label}</span>
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {lote.convenioNome || "Convênio"}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDateBR(lote.createdAt)}
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
                <p className="text-sm mt-1 [overflow-wrap:anywhere]">
                  <span className="text-muted-foreground">Protocolo:</span>{" "}
                  <span className="font-medium">{lote.protocoloEnvio}</span>
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <div className="flex flex-col items-start sm:items-end gap-1">
              <div className="text-sm">
                <span className="text-muted-foreground">Glosado:</span>{" "}
                <span className="font-medium text-red-600">{formatCurrency(lote.valorTotalGlosado)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Recursado:</span>{" "}
                <span className="font-medium text-orange-600">{formatCurrency(lote.valorTotalRecursado)}</span>
              </div>
              {(lote.valorTotalAcatado ?? lote.valorTotalRecuperado) > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">{lote.valorTotalAcatado !== undefined ? "Acatado (registrado):" : "Total histórico (a revisar):"}</span>{" "}
                  <span className={`font-medium ${lote.valorTotalAcatado !== undefined ? "text-green-600" : "text-amber-700"}`}>{formatCurrency(lote.valorTotalAcatado ?? lote.valorTotalRecuperado)}</span>
                </div>
              )}
            </div>
            {/* Prazo de resposta */}
            {lote.dataPrazoResposta && (() => {
              const diasPrazo = calcularDiasRestantes(lote.dataPrazoResposta);
              if (diasPrazo !== null && diasPrazo >= 0) {
                return (
                  <Badge variant={diasPrazo <= 5 ? "destructive" : diasPrazo <= 10 ? "secondary" : "outline"} className="mt-2">
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
              <Badge variant={diasRestantes <= 5 ? "destructive" : "outline"} className="mt-2">
                <Clock className="h-3 w-3 mr-1" />
                {diasRestantes} dias para pagamento
              </Badge>
            )}
          </div>
        </div>
        
        {/* Botões de ação */}
        <div className="flex items-center justify-end mt-2 pt-2 border-t">
          <div className="flex gap-2 flex-wrap">
            {isEnvio ? (
              <>
                {/* Gerar arquivo não declara o envio ao convênio. */}
                <Button size="sm" variant="outline" onClick={(e) => handleExportarLote(lote.id, e)} disabled={exportandoLote === lote.id} title="Baixar relatório Excel do lote">
                  {exportandoLote === lote.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
                  Baixar Excel
                </Button>
                <Button size="sm" variant="outline" onClick={(e) => handleExportarXml(lote.id, e)} disabled={exportandoXml === lote.id} title="Gerar XML (Padrão ANS/TISS)">
                  {exportandoXml === lote.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                  Gerar XML
                </Button>
                {lote.totalProtocolos > 1 && (
                  <Button size="sm" variant="outline" onClick={(e) => handleExportarZip(lote.id, e)} disabled={exportandoZip === lote.id} title={`Baixar ZIP com ${lote.totalProtocolos} XMLs`} className="text-purple-600 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950">
                    {exportandoZip === lote.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Archive className="h-4 w-4 mr-1" />}
                    Baixar ZIP ({lote.totalProtocolos} XMLs)
                  </Button>
                )}
                {podeConfirmarEnvioManual(lote) && (
                  <Button
                    size="sm"
                    onClick={(e) => handleAbrirConfirmacaoEnvio(lote, e)}
                    disabled={exportacaoEmAndamento || confirmarEnvioLoteMutation.isPending}
                    title="Registra a declaração do envio externo; não transmite arquivos ao convênio"
                  >
                    {confirmarEnvioLoteMutation.isPending && loteParaConfirmarEnvio?.id === lote.id
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Confirmar envio
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Todo convênio pode baixar novamente o relatório sem alterar status. */}
                <Button size="sm" variant="outline" onClick={(e) => handleExportarLote(lote.id, e)} disabled={exportandoLote === lote.id} title={loteUnimed ? "Baixar planilha de recurso no modelo Unimed" : "Baixar relatório Excel do lote"} className="text-emerald-600 border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950">
                  {exportandoLote === lote.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
                  Baixar Excel
                </Button>
                {lote.xmlUrl && (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); window.open(lote.xmlUrl, '_blank'); }} title="Baixar XML gerado" className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950">
                    <Download className="h-4 w-4 mr-1" />
                    Baixar XML
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={(e) => handleExportarXml(lote.id, e)} disabled={exportandoXml === lote.id} title="Regerar XML com dados atualizados" className="text-orange-600 border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950">
                  {exportandoXml === lote.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Regerar XML
                </Button>
                <Button size="sm" variant="outline" onClick={(e) => handleAbrirAnexarPdf(lote.id, e, lote.anexoPdfUrl)}>
                  {lote.anexoPdfUrl ? <><Eye className="h-4 w-4 mr-1" /> Ver PDF</> : <><Upload className="h-4 w-4 mr-1" /> Anexar PDF</>}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleVerDetalhes(lote); }}>
              <Eye className="h-4 w-4 mr-1" />
              Ver Detalhes
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  // Filtrar lotes por aba
  const lotesParaEnvio = todosLotes?.lotes?.filter((l: any) => l.status === "pendente_envio" || l.status === "rascunho") || [];
  const lotesParaAcompanhamento = todosLotes?.lotes?.filter((l: any) => ["enviado", "em_analise", "respondido", "finalizado"].includes(l.status)) || [];

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Lotes de Recursos</h1>
          <p className="text-muted-foreground">
            Envie e acompanhe os lotes de recursos de glosa
          </p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes de Envio</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.lotesPendentes || 0}</div>
                    <p className="text-xs text-muted-foreground">lotes aguardando declaração de envio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enviados</CardTitle>
            <Send className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.lotesEnviados || 0}</div>
            <p className="text-xs text-muted-foreground">lotes enviados aos convênios</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Recursado</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(resumo?.valorTotalRecursado || 0)}</div>
            <p className="text-xs text-muted-foreground">total em recursos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Acatado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(resumoFinanceiro?.valorTotalAcatado ?? resumoFinanceiro?.valorTotalRecuperado ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              {resumoFinanceiro?.valorTotalRecursado ? `${(((resumoFinanceiro?.valorTotalAcatado ?? resumoFinanceiro?.valorTotalRecuperado ?? 0) / resumoFinanceiro.valorTotalRecursado) * 100).toFixed(1)}% acatado` : "0%"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido do recurso</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatCurrency(resumo?.valorTotalRecebido ?? 0)}</div>
            <p className="text-xs text-muted-foreground">total informado manualmente; não é o pago original</p>
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
          </div>
        </CardContent>
      </Card>

      {/* Abas: Envio de Lotes / Acompanhamento */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="envio" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Envio de Lotes
            {lotesParaEnvio.length > 0 && (
              <Badge variant="secondary" className="ml-1">{lotesParaEnvio.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acompanhamento" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Acompanhamento
            {lotesParaAcompanhamento.length > 0 && (
              <Badge variant="secondary" className="ml-1">{lotesParaAcompanhamento.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Aba Envio de Lotes */}
        <TabsContent value="envio">
          <Card>
            <CardHeader>
              <CardTitle>Lotes Pendentes de Envio</CardTitle>
              <CardDescription>
                Gere Excel, XML ou ZIP para preparar o envio. A geração não transmite nem altera o status; após o envio externo, registre a declaração manual com data e protocolo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLotes ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : lotesParaEnvio.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Não há lotes aguardando confirmação de envio.</h3>
                  <p className="text-muted-foreground">
                    Crie novos lotes na tela de "Criação de Lotes" para enviar recursos.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lotesParaEnvio.map((lote: any) => renderLoteCard(lote, true))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba Acompanhamento */}
        <TabsContent value="acompanhamento">
          <Card>
            <CardHeader>
              <CardTitle>Lotes Enviados - Acompanhamento</CardTitle>
              <CardDescription>
                Acompanhe os recursos enviados, anexe PDFs de protocolo e monitore prazos de resposta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLotes ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : lotesParaAcompanhamento.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum lote enviado ainda</h3>
                  <p className="text-muted-foreground">
                    Gere os arquivos e, após o envio externo ao convênio, confirme a declaração na aba "Envio de Lotes".
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lotesParaAcompanhamento.map((lote: any) => renderLoteCard(lote, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes do Lote */}
      <Dialog open={dialogDetalhes} onOpenChange={(aberto) => { if (!aberto) fecharDetalhes(); }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] xl:max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Lote {loteDetalhes?.numeroLote}</DialogTitle>
            <DialogDescription>Visualize os itens recursados e o status do lote</DialogDescription>
          </DialogHeader>
          
          {loteDetalhes && (
            <div className="min-w-0 space-y-6">
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
                  <p className="font-medium">{formatDateBR(loteDetalhes.dataEnvio)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-medium">{loteDetalhes.protocoloEnvio || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(loteDetalhes.valorTotalGlosado)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recursado</p>
                    <p className="text-xl font-bold text-orange-600">{formatCurrency(loteDetalhes.valorTotalRecursado)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor acatado (registrado)</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrencyOrUnknown(loteDetalhes.valorTotalAcatado ?? loteDetalhes.valorTotalRecuperado ?? null)}</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total recebido do recurso</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrencyOrUnknown(loteDetalhes.valorTotalRecebidoRecurso ?? null)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total informado nos recursos; não confirma crédito bancário.</p>
                  </CardContent>
                </Card>
              </div>

              {loteDetalhes.historicoIncompleto && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-medium">Detalhes históricos incompletos</p>
                      <p className="mt-1 text-sm">
                        O lote registra {loteDetalhes.itensRegistrados || loteDetalhes.quantidadeItens || 0} itens e {formatCurrency(loteDetalhes.valorTotalRecursado)} recursados,
                        mas somente {loteDetalhes.itensLocalizados || 0} itens possuem vínculo recuperável no banco. Os totais originais foram preservados e nenhum item foi recriado sem comprovação.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {loteDetalhes.itens && loteDetalhes.itens.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Itens Recursados ({loteDetalhes.itens.length})</h4>
                  <div className="min-w-0 max-w-full border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guia</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="text-right">Vl. Glosado</TableHead>
                          <TableHead className="text-right">Pago original da conta</TableHead>
                          <TableHead>Data pagamento original</TableHead>
                          <TableHead className="text-right">Recebimento do recurso (informado)</TableHead>
                          <TableHead>Data recebimento recurso</TableHead>
                          <TableHead className="text-right">Valor acatado</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loteDetalhes.itens.map((item: any) => {
                          const financeiro = normalizarCamposFinanceirosRecurso(item);
                          const recebimentoInformado = isFonteComRecebimentoRecursoInformado(item.fonte);
                          const rotuloRecebimento = rotuloRecebimentoRecurso(item);

                          return (
                          <TableRow key={item.chaveItem || `${item.fonte || "item"}-${item.id}`}>
                            <TableCell className="font-medium">{item.guiaNumero || "-"}</TableCell>
                            <TableCell>{item.codigoProcedimento}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.descricaoProcedimento}</TableCell>
                            <TableCell>{item.pacienteNome || "-"}</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(item.valorGlosado)}</TableCell>
                            <TableCell className="text-right">{formatCurrencyOrUnknown(financeiro.valorPagoOriginal)}</TableCell>
                            <TableCell>{financeiro.dataPagamentoOriginal ? formatDateBR(financeiro.dataPagamentoOriginal) : "-"}</TableCell>
                            <TableCell className="text-right">
                              {editandoItem === item.id ? (
                                <Input type="number" step="0.01" min="0" value={valorRecebidoRecursoEdit} onChange={(e) => setValorRecebidoRecursoEdit(e.target.value)} className="w-28 text-right text-green-600" aria-label="Recebimento do recurso informado" />
                              ) : (
                                <span className="text-green-600" title={rotuloRecebimento}>
                                  {recebimentoInformado ? formatCurrencyOrUnknown(financeiro.valorRecebidoRecurso) : rotuloRecebimento}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editandoItem === item.id ? (
                                <Input type="date" value={dataRecebimentoRecursoEdit} onChange={(e) => setDataRecebimentoRecursoEdit(e.target.value)} className="w-36" aria-label="Data de recebimento do recurso" />
                              ) : (
                                recebimentoInformado && financeiro.dataRecebimentoRecurso ? formatDateBR(financeiro.dataRecebimentoRecurso) : "-"
                              )}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrencyOrUnknown(financeiro.valorAcatado)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.status === "deferido" || item.status === "recurso_deferido" ? "Deferido" : item.status === "indeferido" || item.status === "recurso_indeferido" ? "Indeferido" : item.status === "enviado" || item.status === "recurso_enviado" ? "Enviado" : item.status === "recurso_criado" ? "Criado" : "Pendente"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {item.fonte === "demonstrativo" ? "Demonstrativo" : item.fonte === "conciliacao" ? "Conciliação" : item.fonte === "xml_lote" ? "XML histórico" : "Recurso"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.editavelPagamento !== false && editandoItem === item.id ? (
                                <div className="flex gap-1 justify-center">
                                  <Button size="sm" variant="ghost" onClick={handleSalvarPagamento} disabled={salvandoItem} className="h-7 px-2 text-green-600 hover:text-green-700">
                                    {salvandoItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={handleCancelarEdicao} disabled={salvandoItem} className="h-7 px-2 text-red-600 hover:text-red-700">
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : item.editavelPagamento !== false ? (
                                <Button size="sm" variant="ghost" onClick={() => handleEditarItem(item)} className="h-7 px-2" title="Editar pagamento">
                                  <FileText className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Somente leitura</span>
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

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
            <Button variant="outline" onClick={fecharDetalhes}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação declaratória: não executa transmissão para o convênio. */}
      <Dialog
        open={dialogConfirmarEnvio}
        onOpenChange={(aberto) => {
          if (confirmarEnvioLoteMutation.isPending) return;
          setDialogConfirmarEnvio(aberto);
          if (!aberto) {
            setLoteParaConfirmarEnvio(null);
            setDataEnvioConfirmacao("");
            setProtocoloEnvioConfirmacao("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio externo do lote</DialogTitle>
            <DialogDescription>
              Registre a declaração de que o lote {loteParaConfirmarEnvio?.numeroLote || ""} foi enviado externamente. Esta ação não envia arquivos ao convênio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-envio-lote">Data do envio externo</Label>
              <Input
                id="data-envio-lote"
                type="date"
                value={dataEnvioConfirmacao}
                onChange={(event) => setDataEnvioConfirmacao(event.target.value)}
                disabled={confirmarEnvioLoteMutation.isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="protocolo-envio-lote">Protocolo de envio</Label>
              <Input
                id="protocolo-envio-lote"
                value={protocoloEnvioConfirmacao}
                onChange={(event) => setProtocoloEnvioConfirmacao(event.target.value)}
                placeholder="Informe o protocolo fornecido pelo convênio"
                disabled={confirmarEnvioLoteMutation.isPending}
                required
              />
            </div>
            <p className="text-sm text-muted-foreground">
              A confirmação só estará disponível para lotes em rascunho ou pendentes de envio e não pode ocorrer durante a geração de arquivos.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogConfirmarEnvio(false)}
              disabled={confirmarEnvioLoteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarEnvioManual}
              disabled={exportacaoEmAndamento || confirmarEnvioLoteMutation.isPending}
            >
              {confirmarEnvioLoteMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando...</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" /> Registrar declaração</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Anexar PDF */}
      <Dialog open={dialogAnexarPdf} onOpenChange={setDialogAnexarPdf}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anexar PDF de Protocolo</DialogTitle>
            <DialogDescription>Anexe o comprovante de protocolo do recurso enviado ao convênio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Arquivo PDF</label>
              <Input type="file" accept=".pdf" onChange={(e) => setArquivoPdf(e.target.files?.[0] || null)} />
              {arquivoPdf && (
                <p className="text-sm text-muted-foreground mt-2">
                  Arquivo selecionado: {arquivoPdf.name} ({(arquivoPdf.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAnexarPdf(false); setArquivoPdf(null); }}>Cancelar</Button>
            <Button onClick={handleUploadPdf} disabled={!arquivoPdf || uploadandoPdf}>
              {uploadandoPdf ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <><Upload className="h-4 w-4 mr-2" /> Anexar PDF</>}
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
            <DialogDescription>Resultado da validação do XML contra o padrão TISS 4.01.00 da ANS</DialogDescription>
          </DialogHeader>
          
          {resultadoValidacao && (
            <div className="space-y-4">
              {resultadoValidacao.erros?.length > 0 && (
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
              
              {resultadoValidacao.avisos?.length > 0 && (
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
              
              {resultadoValidacao.valido && (!resultadoValidacao.avisos || resultadoValidacao.avisos.length === 0) && (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <p className="text-green-600 font-medium">XML válido conforme padrão TISS 4.01.00</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogValidacao(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
