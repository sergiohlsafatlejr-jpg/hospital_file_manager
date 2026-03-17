import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowUpDown, Download, RefreshCw, Search, X, ChevronLeft, ChevronRight, Eye,
  Users, Building2, Stethoscope, FlaskConical, Bell, Mail, Plus, Trash2, FileText,
  CheckSquare, Square, Calendar
} from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type SortColumn = "numero_atendimento" | "paciente" | "convenio" | "data_entrada" | "data_saida" | "diasParado" | "descricao_atendimento" | "codigo_servico" | "valorConta" | "etapaConta" | "medicoResp" | "matricula" | "setorEtapa" | "dtEtapa" | "userEtapa" | "tipo_atendimento";
type SortOrder = "asc" | "desc";

interface NotificacaoLinha {
  motivo: string;
  setor: string;
  medico: string;
}

interface AtendimentoUnificado {
  id: number;
  origemSistema: string;
  origemId: string;
  estabelecimentoId: number;
  numero_atendimento?: string | null;
  codigo_saida?: string | null;
  convenio?: string | null;
  paciente?: string | null;
  caracter_atendimento?: string | null;
  data_entrada?: string | Date | null;
  data_saida?: string | Date | null;
  tipo_atendimento?: string | null;
  descricao_atendimento?: string | null;
  codigo_servico?: string | null;
  codigo_procedimento?: string | null;
  destino_conta?: string | null;
  diasParado: number;
  dataSincronizacao?: string | Date | null;
  atualizadoEm?: Date | null;
  dsCategoria?: string | null;
  dsPlano?: string | null;
  competencia?: string | null;
  referencia?: string | null;
  protTasy?: string | null;
  nomeProtocolo?: string | null;
  protConv?: string | null;
  dtEntrega?: string | Date | null;
  protStatus?: string | null;
  titulo?: string | null;
  dtTitulo?: string | Date | null;
  dataVencimento?: string | Date | null;
  dsSetorEntrada?: string | null;
  dsSetorLeito?: string | null;
  etapaConta?: string | null;
  setorEtapa?: string | null;
  dtEtapa?: string | Date | null;
  userEtapa?: string | null;
  motivoDevolucao?: string | null;
  conta?: string | null;
  autorizacao?: string | null;
  valorConta?: string | number | null;
  matricula?: string | null;
  sexo?: string | null;
  idade?: string | null;
  medicoResp?: string | null;
  crm?: string | null;
  dsMotivoAlta?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  codServico?: string | null;
  centroCusto?: string | null;
}

const PAGE_SIZE = 50;

// Tipos de origem
type OrigemSistema = "tasy" | "tasy_hemolabor" | "WARLEINE" | "EASYVISION" | "all";

// Opções de motivo
const MOTIVOS_OPTIONS = [
  { value: "falta_documentacao", label: "Falta de Documentação" },
  { value: "pendencia_medica", label: "Pendência Médica" },
  { value: "pendencia_administrativa", label: "Pendência Administrativa" },
  { value: "falta_autorizacao", label: "Falta de Autorização" },
  { value: "erro_faturamento", label: "Erro de Faturamento" },
  { value: "aguardando_retorno", label: "Aguardando Retorno do Convênio" },
  { value: "conta_aberta", label: "Conta Aberta" },
  { value: "outros", label: "Outros" },
];

const SETORES_OPTIONS = [
  { value: "faturamento", label: "Faturamento" },
  { value: "recepcao", label: "Recepção" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "medico", label: "Corpo Clínico" },
  { value: "administrativo", label: "Administrativo" },
  { value: "autorizacao", label: "Autorização" },
  { value: "auditoria", label: "Auditoria" },
  { value: "outros", label: "Outros" },
];

const getMotivoLabel = (val: string) => MOTIVOS_OPTIONS.find(m => m.value === val)?.label || val || "-";
const getSetorLabel = (val: string) => SETORES_OPTIONS.find(s => s.value === val)?.label || val || "-";

// Função para gerar PDF de notificação
async function gerarPDFNotificacao(
  atendimentos: any[],
  notificacaoLinhas: NotificacaoLinha[],
  observacao: string,
  isTasy: boolean
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Carregar logo
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png";
    });
  } catch { /* fallback sem logo */ }

  function drawHeader(doc: jsPDF) {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, "F");
    if (logoImg) {
      doc.addImage(logoImg, "PNG", margin, 3, 22, 22);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("SAFATLE", margin + (logoImg ? 26 : 0), 12);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Gerenciamento Hospitalar", margin + (logoImg ? 26 : 0), 18);
    doc.setFontSize(7);
    doc.setTextColor(200, 200, 200);
    const dataAtual = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    doc.text(dataAtual, pageWidth - margin, 12, { align: "right" });
  }

  function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(6);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `© ${new Date().getFullYear()} Safatle Gerenciamento Hospitalar — Documento gerado automaticamente`,
      margin, pageHeight - 8
    );
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  drawHeader(doc);
  let y = 34;

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("NOTIFICAÇÃO DE ATENDIMENTOS PARADOS" + (isTasy ? " - TASY" : ""), margin, y);
  y += 6;

  doc.setFillColor(220, 38, 38);
  doc.rect(margin, y, 50, 1.5, "F");
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Total de atendimentos notificados: ${atendimentos.length}`, margin, y);
  y += 8;

  // Motivos
  if (notificacaoLinhas.some(l => l.motivo || l.setor || l.medico)) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("MOTIVOS DA NOTIFICAÇÃO", margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Motivo", "Setor", "Médico/Responsável"]],
      body: notificacaoLinhas
        .filter(l => l.motivo || l.setor || l.medico)
        .map(l => [getMotivoLabel(l.motivo), getSetorLabel(l.setor), l.medico || "-"]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Observação
  if (observacao) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("OBSERVAÇÃO", margin, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(observacao, pageWidth - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 6;
  }

  // Tabela de atendimentos
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("ATENDIMENTOS", margin, y);
  y += 5;

  const formatDate = (d: any) => {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
  };

  if (isTasy) {
    autoTable(doc, {
      startY: y,
      head: [["N° Atend", "Paciente", "Plano", "Dt Entrada", "Dt Saída", "Dias", "Tipo", "Serviço", "Descrição", "Etapa", "Setor Etapa", "User Etapa"]],
      body: atendimentos.map((d: any) => [
        d.numero_atendimento || "-",
        d.paciente || "-",
        d.convenio || "-",
        formatDate(d.data_entrada),
        formatDate(d.data_saida),
        String(d.diasParado || 0),
        d.tipo_atendimento || "-",
        d.codigo_servico || "-",
        d.descricao_atendimento || "-",
        d.etapaConta || "-",
        d.setorEtapa || "-",
        d.userEtapa || "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 14 }, 1: { cellWidth: 28 }, 2: { cellWidth: 20 }, 3: { cellWidth: 16 },
        4: { cellWidth: 16 }, 5: { cellWidth: 10, halign: "center" as const }, 6: { cellWidth: 22 },
        7: { cellWidth: 16 }, 8: { cellWidth: 40 }, 9: { cellWidth: 28 }, 10: { cellWidth: 28 }, 11: { cellWidth: 28 },
      },
      didDrawPage: () => { drawHeader(doc); },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["N° Atend", "Paciente", "Plano", "Dt Entrada", "Dt Saída", "Dias", "Tipo", "Serviço", "Valor", "Etapa"]],
      body: atendimentos.map((d: any) => [
        d.numero_atendimento || "-",
        d.paciente || "-",
        d.convenio || "-",
        formatDate(d.data_entrada),
        formatDate(d.data_saida),
        String(d.diasParado || 0),
        d.tipo_atendimento || "-",
        d.descricao_atendimento || d.codigo_servico || "-",
        d.valorConta ? parseFloat(d.valorConta).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-",
        d.etapaConta || "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
      didDrawPage: () => { drawHeader(doc); },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  return doc;
}

export default function AtendimentosParadosUnificados() {
  const [sortColumn, setSortColumn] = useState<SortColumn>("data_entrada");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("");
  const [filtroServico, setFiltroServico] = useState<string>("");
  const [filtroEtapa, setFiltroEtapa] = useState<string>("");
  const [filtroOrigem, setFiltroOrigem] = useState<OrigemSistema>("all");
  const [filtroProtocolo, setFiltroProtocolo] = useState<string>("all");
  const [filtroAno, setFiltroAno] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");
  const [selectedRow, setSelectedRow] = useState<AtendimentoUnificado | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Modal de notificação individual
  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<any | null>(null);
  const [notificacaoLinhas, setNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [observacao, setObservacao] = useState("");

  // Modal de notificação em lote
  const [modalLoteAberto, setModalLoteAberto] = useState(false);
  const [loteNotificacaoLinhas, setLoteNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [loteObservacao, setLoteObservacao] = useState("");

  // Email
  const [emailExpandido, setEmailExpandido] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [emailMensagem, setEmailMensagem] = useState("");

  // Aba ativa
  const [abaAtiva, setAbaAtiva] = useState("atendimentos");

  // Debounce para busca textual
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Buscar dados com paginação server-side
  const queryInput = useMemo(() => ({
    page: currentPage,
    pageSize: PAGE_SIZE,
    origemSistema: filtroOrigem !== "all" ? filtroOrigem : undefined,
    tipo: filtroTipo || undefined,
    convenio: filtroConvenio || undefined,
    etapa: filtroEtapa || undefined,
    protocolo: filtroProtocolo !== "all" ? filtroProtocolo : undefined,
    ano: filtroAno || undefined,
    mes: filtroMes || undefined,
    busca: debouncedSearch || undefined,
    descricao: filtroServico || undefined,
    sortColumn,
    sortOrder,
  }), [currentPage, filtroOrigem, filtroTipo, filtroConvenio, filtroEtapa, filtroProtocolo, filtroAno, filtroMes, debouncedSearch, filtroServico, sortColumn, sortOrder]);

  const { data: paginatedResult, isLoading, refetch, isFetching } = trpc.atendimentos.listarPaginado.useQuery(queryInput);

  const atendimentos = paginatedResult?.items || [];
  const serverTotal = paginatedResult?.total || 0;
  const serverTotalPages = paginatedResult?.totalPages || 0;
  const aggregations = paginatedResult?.aggregations;

  // Histórico de notificações
  const { data: historicoNotificacoes, refetch: refetchHistorico } = trpc.atendimentos.listarHistorico.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const salvarHistoricoMutation = trpc.atendimentos.salvarHistorico.useMutation({
    onSuccess: () => { refetchHistorico(); },
  });

  // Mutations de notificação
  const registrarNotificacao = trpc.atendimentos.registrarNotificacao.useMutation({
    onSuccess: () => {
      requestAnimationFrame(() => {
        toast.success("Notificação registrada com sucesso!");
        setModalAberto(false);
        setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
        setObservacao("");
        refetch();
      });
    },
    onError: (err) => { toast.error(`Erro ao registrar notificação: ${err.message}`); },
  });

  const registrarNotificacaoLote = trpc.atendimentos.registrarNotificacaoEmLote.useMutation({
    onSuccess: (result) => {
      const atendimentosSelecionadosData = filteredData.filter(d => selecionados.has(d.numero_atendimento || ""));
      salvarHistoricoMutation.mutate({
        qtdAtendimentos: result.count,
        observacao: loteObservacao,
        atendimentos: atendimentosSelecionadosData.map((a: any) => ({
          numatend: a.numero_atendimento || "",
          nomepac: a.paciente || "",
          nomeplaco: a.convenio || "",
          datatend: a.data_entrada ? String(a.data_entrada) : "",
          datasai: a.data_saida ? String(a.data_saida) : null,
          diasParado: a.diasParado || 0,
          tipoatendimentodescricao: a.tipo_atendimento || "",
          codserv: a.codigo_servico || "",
        })),
        notificacoes: loteNotificacaoLinhas.map(n => ({
          motivo: n.motivo,
          setor: n.setor,
          medico: n.medico,
        })),
      });

      requestAnimationFrame(() => {
        toast.success(`Notificação registrada para ${result.count} atendimentos!`);
        setModalLoteAberto(false);
        setLoteNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
        setLoteObservacao("");
        setSelecionados(new Set());
        refetch();
      });
    },
    onError: (err) => { toast.error(`Erro ao registrar notificações: ${err.message}`); },
  });

  // Mutation de envio de e-mail
  const enviarEmailMutation = trpc.atendimentos.enviarNotificacaoEmail.useMutation({
    onSuccess: () => {
      requestAnimationFrame(() => {
        toast.success("E-mail enviado com sucesso!");
        setEmailDestinatario("");
        setEmailMensagem("");
        setEmailExpandido(false);
      });
    },
    onError: (err) => { toast.error(`Erro ao enviar e-mail: ${err.message}`); },
  });

  // Notificações geradas (histórico)
  const notificacoesGeradas = useMemo(() => {
    if (!historicoNotificacoes) return [];
    return historicoNotificacoes.map((h: any) => ({
      id: `DB-${h.id}`,
      data: new Date(h.dataGeracao),
      qtdAtendimentos: h.qtdAtendimentos,
      atendimentos: (h.atendimentos as any[]) || [],
      notificacoes: (h.notificacoes as NotificacaoLinha[]) || [],
      observacao: h.observacao || "",
      usuario: h.usuario || "",
    }));
  }, [historicoNotificacoes]);

  // Com paginação server-side, filteredData = atendimentos (já filtrados e ordenados pelo servidor)
  const filteredData = atendimentos;

  const origemDetectada = useMemo((): OrigemSistema => {
    if (filtroOrigem !== "all") return filtroOrigem;
    // Usar agregações do servidor para detectar origem
    if (aggregations?.origens?.length === 1) {
      const o = aggregations.origens[0].value.toLowerCase();
      if (o === "tasy") return "tasy";
      if (o === "tasy_hemolabor") return "tasy_hemolabor";
      if (o === "warleine") return "WARLEINE";
      if (o === "easyvision") return "EASYVISION";
    }
    return "all";
  }, [aggregations, filtroOrigem]);

  const quantidadePorDescricao = useMemo(() => {
    const map: Record<string, number> = {};
    atendimentos.forEach(a => {
      const desc = (a as any).descricao_atendimento || "Sem descrição";
      map[desc] = (map[desc] || 0) + 1;
    });
    return map;
  }, [atendimentos]);

  // Paginação controlada pelo servidor
  const totalPages = serverTotalPages;
  const paginatedData = atendimentos; // Já vem paginado do servidor

  // Reset de página quando filtros mudam
  useEffect(() => { setCurrentPage(1); }, [filtroTipo, filtroConvenio, filtroServico, filtroEtapa, filtroOrigem, filtroProtocolo, filtroAno, filtroMes, debouncedSearch]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }
    else { setSortColumn(column); setSortOrder("asc"); }
  };

  // ===== Seleção múltipla =====
  const toggleSelecionado = useCallback((numatend: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(numatend)) { next.delete(numatend); } else { next.add(numatend); }
      return next;
    });
  }, []);

  const selecionarTodos = useCallback(() => {
    // Selecionar/desselecionar todos da página atual
    const pageItems = new Set(paginatedData.map(d => d.numero_atendimento || ""));
    const allSelected = paginatedData.every(d => selecionados.has(d.numero_atendimento || ""));
    if (allSelected) {
      setSelecionados(prev => {
        const next = new Set(prev);
        pageItems.forEach(item => next.delete(item));
        return next;
      });
    } else {
      setSelecionados(prev => {
        const next = new Set(prev);
        pageItems.forEach(item => next.add(item));
        return next;
      });
    }
  }, [paginatedData, selecionados]);

  const todosSelecionados = paginatedData.length > 0 && paginatedData.every(d => selecionados.has(d.numero_atendimento || ""));

  // ===== Notificação individual =====
  function abrirModalNotificacao(atendimento: any) {
    setAtendimentoSelecionado(atendimento);
    setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setObservacao("");
    setModalAberto(true);
  }

  function aplicarNotificacao() {
    if (!atendimentoSelecionado) return;
    if (!observacao.trim()) { toast.error("Preencha a observação"); return; }
    registrarNotificacao.mutate({
      numatend: atendimentoSelecionado.numero_atendimento || "",
      observacao,
      notificacoes: notificacaoLinhas,
    });
  }

  // ===== Notificação em lote =====
  function abrirModalLote() {
    if (selecionados.size === 0) { toast.error("Selecione pelo menos um atendimento"); return; }
    setLoteNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setLoteObservacao("");
    setModalLoteAberto(true);
  }

  function aplicarNotificacaoLote() {
    if (!loteObservacao.trim()) { toast.error("Preencha a observação"); return; }
    const atendimentosSelecionados = filteredData
      .filter(d => selecionados.has(d.numero_atendimento || ""))
      .map(d => ({ numatend: d.numero_atendimento || "", nomepac: d.paciente || "" }));

    registrarNotificacaoLote.mutate({
      atendimentos: atendimentosSelecionados,
      observacao: loteObservacao,
      notificacoes: loteNotificacaoLinhas,
    });
  }

  // ===== Enviar Email =====
  function enviarEmailSelecionados() {
    if (selecionados.size === 0) { toast.error("Selecione pelo menos um atendimento"); return; }
    if (!emailDestinatario.trim()) { toast.error("Informe o e-mail do destinatário"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailDestinatario.trim())) { toast.error("E-mail inválido."); return; }

    const atendimentosSelecionadosData = filteredData.filter(d => selecionados.has(d.numero_atendimento || ""));

    enviarEmailMutation.mutate({
      destinatarioEmail: emailDestinatario.trim(),
      estabelecimentoNome: "Atendimentos Parados",
      mensagemPersonalizada: emailMensagem.trim() || undefined,
      atendimentos: atendimentosSelecionadosData.map((a: any) => ({
        paciente: a.paciente || "",
        numatend: a.numero_atendimento || "",
        tipoAtendimento: a.tipo_atendimento || "-",
        plano: a.convenio || "Sem Plano",
        diasParado: a.diasParado || 0,
        dataEntrada: a.data_entrada ? new Date(a.data_entrada as string).toLocaleDateString("pt-BR") : "-",
        observacao: undefined,
      })),
    });
  }

  // ===== Download PDF =====
  async function baixarPDFSelecionados() {
    if (selecionados.size === 0) { toast.error("Selecione pelo menos um atendimento"); return; }
    try {
      toast.info("Gerando PDF...");
      const atendimentosSelecionados = filteredData.filter(d => selecionados.has(d.numero_atendimento || ""));
      const doc = await gerarPDFNotificacao(atendimentosSelecionados, [], "", isTasyLayout);
      const dataStr = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
      doc.save(`atendimentos_parados_${dataStr}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) { toast.error("Erro ao gerar PDF"); console.error(err); }
  }

  async function baixarPDFNotificacao(notif: any) {
    try {
      toast.info("Gerando PDF...");
      const doc = await gerarPDFNotificacao(notif.atendimentos, notif.notificacoes, notif.observacao, isTasyLayout);
      const dataStr = notif.data.toLocaleDateString("pt-BR").replace(/\//g, "-");
      doc.save(`notificacao_${dataStr}_${notif.qtdAtendimentos}_atendimentos.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) { toast.error("Erro ao gerar PDF"); console.error(err); }
  }

  // Exportar Excel com colunas baseadas na origem
  const handleExportExcel = () => {
    const isTasy = filtroOrigem === "tasy" || filtroOrigem === "tasy_hemolabor";
    const data = filteredData.map((a: any) => {
      if (isTasy) {
        return {
          "N° Atend": a.numero_atendimento, "Paciente": a.paciente, "Plano": a.convenio,
          "Data Entrada": a.data_entrada ? formatDate(a.data_entrada) : "-",
          "Data Saída": a.data_saida ? formatDate(a.data_saida) : "-",
          "Dias Parado": a.diasParado, "Tipo Atend.": a.tipo_atendimento,
          "Cód. Serviço": a.codigo_servico, "Descrição Atendimento": a.descricao_atendimento,
          "Etapa Conta": a.etapaConta, "Setor Etapa": a.setorEtapa,
          "Data Etapa": a.dtEtapa ? formatDate(a.dtEtapa) : "-", "Usuário Etapa": a.userEtapa,
          "Nome Protocolo": a.nomeProtocolo || "Sem protocolo",
          "Qtd. Serviço": quantidadePorDescricao[a.descricao_atendimento || "Sem descrição"] || 0,
        };
      } else {
        return {
          "N° Atend": a.numero_atendimento, "Plano": a.convenio, "Categoria": a.dsCategoria,
          "Plano Detalhe": a.dsPlano, "Paciente": a.paciente, "Matrícula": a.matricula,
          "Sexo": a.sexo, "Idade": a.idade, "Caráter": a.caracter_atendimento,
          "Data Entrada": a.data_entrada ? formatDate(a.data_entrada) : "-",
          "Data Saída": a.data_saida ? formatDate(a.data_saida) : "-",
          "Dias Parado": a.diasParado, "Tipo": a.tipo_atendimento,
          "Serviço": a.descricao_atendimento, "Proc. Principal": a.codigo_procedimento,
          "Conta": a.conta, "Autorização": a.autorizacao, "Valor Conta": a.valorConta,
          "Etapa Conta": a.etapaConta, "Setor Etapa": a.setorEtapa,
          "Data Etapa": a.dtEtapa ? formatDate(a.dtEtapa) : "-", "Usuário Etapa": a.userEtapa,
          "Motivo Devolução": a.motivoDevolucao, "Competência": a.competencia,
          "Referência": a.referencia, "Protocolo Tasy": a.protTasy,
          "Nome Protocolo": a.nomeProtocolo, "Protocolo Convênio": a.protConv,
          "Status Protocolo": a.protStatus, "Data Entrega": a.dtEntrega ? formatDate(a.dtEntrega) : "-",
          "Título": a.titulo, "Data Título": a.dtTitulo ? formatDate(a.dtTitulo) : "-",
          "Data Vencimento": a.dataVencimento ? formatDate(a.dataVencimento) : "-",
          "Setor Entrada": a.dsSetorEntrada, "Setor Leito": a.dsSetorLeito,
          "Médico Resp.": a.medicoResp, "CRM": a.crm, "Motivo Alta": a.dsMotivoAlta,
          "Centro Custo": a.centroCusto, "Origem": a.origemSistema,
        };
      }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, `atendimentos-parados${isTasy ? '-tasy' : ''}.xlsx`);
    toast.success("Arquivo exportado com sucesso!");
  };

  // KPIs baseados nas agregações do servidor
  const getQuantidadePorTipo = () => {
    return (aggregations?.tipos || []).map(t => ({ tipo: t.value, quantidade: t.count }));
  };

  const getQuantidadePorPlano = () => {
    return (aggregations?.convenios || []).map(c => ({ plano: c.value, quantidade: c.count }));
  };

  const getQuantidadePorEtapa = () => {
    return (aggregations?.etapas || []).map(e => ({ etapa: e.value, quantidade: e.count }));
  };

  // Anos e meses disponíveis baseados nas agregações do servidor
  const anosDisponiveis = useMemo(() => {
    return (aggregations?.anos || []).map(a => a.value).filter(a => a.length === 4 && !isNaN(Number(a))).sort().reverse();
  }, [aggregations]);

  const mesesDisponiveis = useMemo(() => {
    // Retornar todos os 12 meses quando um ano está selecionado (o servidor já filtra)
    return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  }, []);

  const MESES_NOMES: Record<string, string> = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
    "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
  };

  const getQuantidadePorMes = useMemo(() => {
    // Contagem por mês não está disponível nas agregações do servidor
    // Retornar vazio (o filtro de mês funciona sem contagem)
    const contagem: Record<string, number> = {};
    return contagem;
  }, []);

  const getQuantidadePorOrigem = () => {
    return (aggregations?.origens || []).map(o => ({ origem: o.value, quantidade: o.count }));
  };

  const getQuantidadePorProtocolo = useMemo(() => {
    const protocolos: Record<string, number> = {};
    let comProtocoloCount = 0;
    (aggregations?.protocolos || []).forEach(p => {
      protocolos[p.value] = p.count;
      comProtocoloCount += p.count;
    });
    const totalBase = (aggregations?.origens || []).reduce((sum, o) => sum + o.count, 0);
    const nullCount = totalBase - comProtocoloCount;
    return { nullCount, comProtocoloCount, protocolos: Object.entries(protocolos).sort((a, b) => b[1] - a[1]) };
  }, [aggregations]);

  const getQuantidadePorDescricao = useMemo(() => {
    // Usar dados da página atual para descrições (não temos agregação server-side para isso)
    const descs: Record<string, number> = {};
    atendimentos.forEach((a: any) => {
      const desc = a.descricao_atendimento || "Sem descrição";
      descs[desc] = (descs[desc] || 0) + 1;
    });
    return Object.entries(descs).sort((a, b) => b[1] - a[1]);
  }, [atendimentos]);

  const valorTotal = useMemo(() => {
    return aggregations?.totalValor || 0;
  }, [aggregations]);

  const getTypeColor = (tipo?: string | null) => {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('INTERNACAO') || t.includes('INTERNAÇÃO') || t.includes('INTERNADO')) return 'bg-orange-500 hover:bg-orange-600';
    if (t.includes('EXAME')) return 'bg-purple-500 hover:bg-purple-600';
    if (t.includes('AMBULATORIO') || t.includes('AMBULATÓRIO') || t.includes('AMBULATORIAL')) return 'bg-blue-500 hover:bg-blue-600';
    if (t.includes('PRONTO') || t.includes('SOCORRO')) return 'bg-red-500 hover:bg-red-600';
    return 'bg-slate-600 hover:bg-slate-700';
  };

  const getTypeIcon = (tipo?: string | null) => {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('INTERNACAO') || t.includes('INTERNAÇÃO') || t.includes('INTERNADO')) return <Building2 className="w-5 h-5" />;
    if (t.includes('EXAME')) return <FlaskConical className="w-5 h-5" />;
    if (t.includes('AMBULATORIO') || t.includes('AMBULATÓRIO') || t.includes('AMBULATORIAL')) return <Stethoscope className="w-5 h-5" />;
    if (t.includes('PRONTO') || t.includes('SOCORRO')) return <Users className="w-5 h-5" />;
    return <Users className="w-5 h-5" />;
  };

  const getDiasParadoColor = (dias: number) => {
    if (dias >= 30) return "bg-red-100 text-red-800";
    if (dias >= 15) return "bg-orange-100 text-orange-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const getTipoAtendimentoBadgeColor = (tipo?: string | null) => {
    const t = tipo?.toUpperCase() || '';
    if (t.includes('INTERNACAO') || t.includes('INTERNAÇÃO') || t.includes('INTERNADO')) return "bg-orange-100 text-orange-800";
    if (t.includes('AMBULATORIO') || t.includes('AMBULATÓRIO') || t.includes('AMBULATORIAL')) return "bg-blue-100 text-blue-800";
    if (t.includes('EXAME')) return "bg-purple-100 text-purple-800";
    if (t.includes('PRONTO') || t.includes('SOCORRO')) return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  };

  const getOrigemColor = (origem?: string) => {
    const o = origem?.toLowerCase() || '';
    if (o === 'tasy') return 'bg-teal-600 text-white';
    if (o === 'tasy_hemolabor') return 'bg-emerald-600 text-white';
    if (o === 'warleine') return 'bg-indigo-600 text-white';
    if (o === 'easyvision') return 'bg-amber-600 text-white';
    return 'bg-slate-600 text-white';
  };

  const getOrigemLabel = (origem?: string) => {
    const o = origem?.toLowerCase() || '';
    if (o === 'tasy') return 'TASY';
    if (o === 'tasy_hemolabor') return 'TASY HEMOLABOR';
    if (o === 'warleine') return 'WARLEINE';
    if (o === 'easyvision') return 'EASYVISION';
    return origem?.toUpperCase() || 'DESCONHECIDO';
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "-";
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch { return String(date); }
  };

  const formatCurrency = (value: string | number | null | undefined): string => {
    if (!value) return "-";
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return "-";
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const isTasyLayout = filtroOrigem === "tasy" || filtroOrigem === "tasy_hemolabor";

  // Componente de linhas de notificação reutilizável
  const NotificacaoLinhasEditor = ({ linhas, setLinhas }: { linhas: NotificacaoLinha[]; setLinhas: React.Dispatch<React.SetStateAction<NotificacaoLinha[]>> }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">Motivos da Notificação</label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
          onClick={() => setLinhas(prev => [...prev, { motivo: "", setor: "", medico: "" }])}
        >
          <Plus className="w-3 h-3 mr-1" /> Adicionar
        </Button>
      </div>
      {linhas.map((linha, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
          <select
            value={linha.motivo}
            onChange={e => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, motivo: e.target.value } : l))}
            className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm text-white"
          >
            <option value="">Motivo...</option>
            {MOTIVOS_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            value={linha.setor}
            onChange={e => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, setor: e.target.value } : l))}
            className="bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-sm text-white"
          >
            <option value="">Setor...</option>
            {SETORES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Input
            placeholder="Médico/Responsável"
            value={linha.medico}
            onChange={e => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, medico: e.target.value } : l))}
            className="bg-slate-700 border-slate-600 text-white text-sm h-8"
          />
          {linhas.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
              onClick={() => setLinhas(prev => prev.filter((_, i) => i !== idx))}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Atendimentos Parados</h1>
          <p className="text-slate-400">Acompanhe atendimentos pendentes de faturamento</p>
        </div>

        {/* Abas */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setAbaAtiva("atendimentos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              abaAtiva === "atendimentos" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" /> Atendimentos
          </button>
          <button
            onClick={() => setAbaAtiva("notificacoes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              abaAtiva === "notificacoes" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Bell className="w-4 h-4" /> Notificações Geradas
            {notificacoesGeradas.length > 0 && (
              <Badge className="bg-amber-600 text-white text-xs ml-1">{notificacoesGeradas.length}</Badge>
            )}
          </button>
        </div>

        {abaAtiva === "notificacoes" ? (
          /* ===== ABA NOTIFICAÇÕES GERADAS ===== */
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Histórico de Notificações</CardTitle>
            </CardHeader>
            <CardContent>
              {notificacoesGeradas.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhuma notificação gerada ainda.</p>
                  <p className="text-sm mt-2">Selecione atendimentos e clique em "Notificar em Lote" para gerar.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notificacoesGeradas.map((notif: any) => (
                    <div key={notif.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Badge className="bg-amber-600 text-white">{notif.qtdAtendimentos} atendimentos</Badge>
                          <span className="text-slate-400 text-sm">
                            {notif.data.toLocaleDateString("pt-BR")} às {notif.data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {notif.usuario && <span className="text-slate-500 text-xs">por {notif.usuario}</span>}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-slate-600 border-slate-500 text-white hover:bg-slate-500"
                          onClick={() => baixarPDFNotificacao(notif)}
                        >
                          <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                        </Button>
                      </div>
                      {notif.observacao && (
                        <p className="text-slate-300 text-sm mb-2"><strong>Obs:</strong> {notif.observacao}</p>
                      )}
                      {notif.notificacoes?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {notif.notificacoes.map((n: NotificacaoLinha, i: number) => (
                            <Badge key={i} className="bg-slate-600 text-slate-200 text-xs">
                              {getMotivoLabel(n.motivo)} {n.setor ? `• ${getSetorLabel(n.setor)}` : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ===== ABA ATENDIMENTOS ===== */
          <>
            {/* KPIs por Tipo de Atendimento */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">Total de Atendimentos</p>
                    <p className="text-3xl font-bold text-white">
                      {filtroOrigem !== "all"
                        ? atendimentos.filter(a => a.origemSistema?.toLowerCase() === filtroOrigem.toLowerCase()).length
                        : atendimentos.length}
                    </p>
                  </div>
                  <div className="bg-teal-500/20 p-3 rounded-xl">
                    <Users className="w-6 h-6 text-teal-400" />
                  </div>
                </CardContent>
              </Card>
              {getQuantidadePorTipo().slice(0, 3).map(({ tipo, quantidade }) => (
                <Card key={tipo} className="bg-slate-800 border-slate-700">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">{tipo}</p>
                      <p className={`text-3xl font-bold ${
                        tipo?.toUpperCase().includes('INTERNADO') ? 'text-orange-400' :
                        tipo?.toUpperCase().includes('PRONTO') ? 'text-red-400' :
                        tipo?.toUpperCase().includes('AMBULAT') ? 'text-blue-400' :
                        'text-purple-400'
                      }`}>{quantidade}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${
                      tipo?.toUpperCase().includes('INTERNADO') ? 'bg-orange-500/20' :
                      tipo?.toUpperCase().includes('PRONTO') ? 'bg-red-500/20' :
                      tipo?.toUpperCase().includes('AMBULAT') ? 'bg-blue-500/20' :
                      'bg-purple-500/20'
                    }`}>
                      {getTypeIcon(tipo)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filtro por Sistema de Origem */}
            <Card className="bg-slate-800 border-slate-700 mb-4">
              <CardHeader className="py-3">
                <CardTitle className="text-white text-sm">Sistema de Origem</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setFiltroOrigem('all'); setFiltroProtocolo('all'); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      filtroOrigem === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Todos ({atendimentos.length})
                  </button>
                  {getQuantidadePorOrigem().map(({ origem, quantidade }) => (
                    <button
                      key={origem}
                      onClick={() => { setFiltroOrigem(origem as OrigemSistema); setFiltroProtocolo('all'); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        filtroOrigem === origem ? `${getOrigemColor(origem)} shadow-lg` : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {getOrigemLabel(origem)} ({quantidade})
                    </button>
                  ))}
                </div>
                {filtroOrigem !== 'all' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className={getOrigemColor(filtroOrigem)}>Layout: {getOrigemLabel(filtroOrigem)}</Badge>
                    <span className="text-slate-400 text-xs">Colunas adaptadas para o sistema {getOrigemLabel(filtroOrigem)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filtro por Competência (Ano/Mês) */}
            <Card className="bg-slate-800 border-slate-700 mb-4">
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-400" /> Competência (Mês/Ano)
                  </CardTitle>
                  {(filtroAno || filtroMes) && (
                    <button
                      onClick={() => { setFiltroAno(""); setFiltroMes(""); }}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* Seletor de Ano */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Ano</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setFiltroAno(""); setFiltroMes(""); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!filtroAno ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                    >
                      Todos
                    </button>
                    {anosDisponiveis.map(ano => (
                      <button
                        key={ano}
                        onClick={() => { setFiltroAno(ano); setFiltroMes(""); }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroAno === ano ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        {ano}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Seletor de Mês (só aparece quando ano está selecionado) */}
                {filtroAno && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Mês</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFiltroMes("")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!filtroMes ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                      >
                        Todos
                      </button>
                      {mesesDisponiveis.map(mes => (
                        <button
                          key={mes}
                          onClick={() => setFiltroMes(mes)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroMes === mes ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                          {MESES_NOMES[mes] || mes} ({getQuantidadePorMes[mes] || 0})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(filtroAno || filtroMes) && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-600/20 text-orange-300 border-orange-600/30">
                      {filtroMes ? `${MESES_NOMES[filtroMes] || filtroMes}/${filtroAno}` : `Ano ${filtroAno}`}
                    </Badge>
                    <span className="text-slate-400 text-xs">{filteredData.length} registros</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filtro por Nome Protocolo (só TASY) */}
            {isTasyLayout && (
              <Card className="bg-slate-800 border-slate-700 mb-4">
                <CardHeader className="py-3">
                  <CardTitle className="text-white text-sm">Nome Protocolo</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                    <button onClick={() => setFiltroProtocolo('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroProtocolo === 'all' ? 'bg-cyan-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Todos</button>
                    <button onClick={() => setFiltroProtocolo('null')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroProtocolo === 'null' ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Sem Protocolo ({getQuantidadePorProtocolo.nullCount})</button>
                    <button onClick={() => setFiltroProtocolo('com_protocolo')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroProtocolo === 'com_protocolo' ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Com Protocolo ({getQuantidadePorProtocolo.comProtocoloCount})</button>
                    {getQuantidadePorProtocolo.protocolos.map(([nome, qtd]) => (
                      <button key={nome} onClick={() => setFiltroProtocolo(nome)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroProtocolo === nome ? 'bg-cyan-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{nome} ({qtd})</button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filtros por Tipo de Atendimento */}
            <Card className="bg-slate-800 border-slate-700 mb-4">
              <CardHeader className="py-3"><CardTitle className="text-white text-sm">Tipo de Atendimento</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFiltroTipo('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroTipo === '' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                    Todos ({filtroOrigem !== "all" ? atendimentos.filter(a => a.origemSistema?.toLowerCase() === filtroOrigem.toLowerCase()).length : atendimentos.length})
                  </button>
                  {getQuantidadePorTipo().map(({ tipo, quantidade }) => (
                    <button key={tipo} onClick={() => setFiltroTipo(tipo || '')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroTipo === tipo ? `${getTypeColor(tipo)} text-white shadow-lg` : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                      {tipo} ({quantidade})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Filtros por Plano */}
            <Card className="bg-slate-800 border-slate-700 mb-4">
              <CardHeader className="py-3"><CardTitle className="text-white text-sm">Plano (Convênio)</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFiltroConvenio('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroConvenio === '' ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Todos</button>
                  {getQuantidadePorPlano().map(({ plano, quantidade }) => (
                    <button key={plano} onClick={() => setFiltroConvenio(plano || '')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroConvenio === plano ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                      {plano} ({quantidade})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quantidade por Descrição de Atendimento */}
            {isTasyLayout && getQuantidadePorDescricao.length > 0 && (
              <Card className="bg-slate-800 border-slate-700 mb-4">
                <CardHeader className="py-3"><CardTitle className="text-white text-sm">Quantidade por Serviço (Descrição Atendimento)</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto">
                    {getQuantidadePorDescricao.map(([desc, qtd]) => (
                      <button key={desc} onClick={() => setFiltroServico(filtroServico === desc ? '' : desc)} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${filtroServico === desc ? 'bg-cyan-600 text-white shadow-lg' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600'}`}>
                        <span className="truncate mr-2" title={desc}>{desc}</span>
                        <span className="text-cyan-400 font-bold shrink-0">{qtd}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filtros por Etapa da Conta */}
            {getQuantidadePorEtapa().length > 0 && (
              <Card className="bg-slate-800 border-slate-700 mb-4">
                <CardHeader className="py-3"><CardTitle className="text-white text-sm">Etapa da Conta</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFiltroEtapa('')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroEtapa === '' ? 'bg-violet-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Todas</button>
                    {getQuantidadePorEtapa().map(({ etapa, quantidade }: any) => (
                      <button key={etapa} onClick={() => setFiltroEtapa(etapa || '')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filtroEtapa === etapa ? 'bg-violet-600 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                        {etapa} ({quantidade})
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Barra de ações de seleção */}
            {selecionados.size > 0 && (
              <Card className="bg-amber-900/30 border-amber-700 mb-4">
                <CardContent className="py-3 flex items-center justify-between flex-wrap gap-3">
                  <span className="text-amber-300 text-sm font-medium">
                    {selecionados.size} atendimento{selecionados.size > 1 ? 's' : ''} selecionado{selecionados.size > 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={abrirModalLote}>
                      <Bell className="w-4 h-4 mr-2" /> Notificar em Lote
                    </Button>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setEmailExpandido(!emailExpandido)}>
                      <Mail className="w-4 h-4 mr-2" /> Enviar Email
                    </Button>
                    <Button size="sm" variant="outline" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600" onClick={baixarPDFSelecionados}>
                      <FileText className="w-4 h-4 mr-2" /> Baixar PDF
                    </Button>
                    <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setSelecionados(new Set())}>
                      <X className="w-4 h-4 mr-1" /> Limpar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Painel de Email */}
            {emailExpandido && selecionados.size > 0 && (
              <Card className="bg-slate-800 border-blue-700 mb-4">
                <CardHeader className="py-3">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-400" /> Enviar Notificação por E-mail
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm text-slate-300 mb-1 block">E-mail do Destinatário *</label>
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={emailDestinatario}
                      onChange={e => setEmailDestinatario(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300 mb-1 block">Mensagem Personalizada (opcional)</label>
                    <textarea
                      placeholder="Mensagem adicional para o e-mail..."
                      value={emailMensagem}
                      onChange={e => setEmailMensagem(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-400 min-h-[60px]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={enviarEmailSelecionados}
                      disabled={enviarEmailMutation.isPending}
                    >
                      {enviarEmailMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                      Enviar para {selecionados.size} atendimento{selecionados.size > 1 ? 's' : ''}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={() => setEmailExpandido(false)}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabela de Atendimentos */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-white">Atendimentos</CardTitle>
                      {filtroOrigem !== 'all' && (
                        <Badge className={getOrigemColor(filtroOrigem)}>{getOrigemLabel(filtroOrigem)}</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => refetch()} variant="outline" size="sm" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600">
                        <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
                      </Button>
                      <Button onClick={handleExportExcel} size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                        <Download className="w-4 h-4 mr-2" /> Exportar Excel
                      </Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder={isTasyLayout ? "Buscar por N° Atend, Paciente, Plano, Serviço, Descrição, Etapa, Setor, Usuário..." : "Buscar por N° Atend, Paciente, Plano, Matrícula, Conta ou Médico..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-64 text-slate-400">Carregando...</div>
                ) : filteredData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-slate-400">Nenhum atendimento encontrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          {/* Checkbox de seleção */}
                          <th className="px-2 py-3 text-left">
                            <button onClick={selecionarTodos} className="text-slate-400 hover:text-white">
                              {todosSelecionados ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
                            </button>
                          </th>
                          {isTasyLayout ? (
                            <>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("numero_atendimento")}><div className="flex items-center gap-1">N.Atend <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("paciente")}><div className="flex items-center gap-1">Paciente <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("convenio")}><div className="flex items-center gap-1">Plano <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("data_entrada")}><div className="flex items-center gap-1">Data Entrada <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Data Saída</th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("diasParado")}><div className="flex items-center gap-1">Dias Parado <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("tipo_atendimento")}><div className="flex items-center gap-1">Tipo <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("codigo_servico")}><div className="flex items-center gap-1">Serviço <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("descricao_atendimento")}><div className="flex items-center gap-1">Descrição Atend. <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("etapaConta")}><div className="flex items-center gap-1">Etapa Conta <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("setorEtapa")}><div className="flex items-center gap-1">Setor Etapa <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("userEtapa")}><div className="flex items-center gap-1">User Etapa <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Ações</th>
                            </>
                          ) : (
                            <>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("numero_atendimento")}><div className="flex items-center gap-1">N° Atend <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("convenio")}><div className="flex items-center gap-1">Plano <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("paciente")}><div className="flex items-center gap-1">Paciente <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("matricula")}><div className="flex items-center gap-1">Matrícula <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("data_entrada")}><div className="flex items-center gap-1">Data Entrada <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Data Saída</th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("diasParado")}><div className="flex items-center gap-1">Dias Parado <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Tipo</th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("valorConta")}><div className="flex items-center gap-1">Valor <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("etapaConta")}><div className="flex items-center gap-1">Etapa <ArrowUpDown className="w-3 h-3" /></div></th>
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort("medicoResp")}><div className="flex items-center gap-1">Médico <ArrowUpDown className="w-3 h-3" /></div></th>
                              {origemDetectada === "all" && (<th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Origem</th>)}
                              <th className="px-3 py-3 text-left text-slate-300 font-semibold whitespace-nowrap">Ações</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedData.map((atendimento: any, idx) => {
                          const numatend = atendimento.numero_atendimento || "";
                          const isSelected = selecionados.has(numatend);
                          return (
                            <tr
                              key={atendimento.id || idx}
                              className={`border-b border-slate-700 hover:bg-slate-700/50 transition-colors ${isSelected ? 'bg-amber-900/20' : ''}`}
                            >
                              {/* Checkbox */}
                              <td className="px-2 py-2.5">
                                <button onClick={() => toggleSelecionado(numatend)} className="text-slate-400 hover:text-white">
                                  {isSelected ? <CheckSquare className="w-4 h-4 text-amber-400" /> : <Square className="w-4 h-4" />}
                                </button>
                              </td>
                              {isTasyLayout ? (
                                <>
                                  <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">{atendimento.numero_atendimento}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[180px] truncate" title={atendimento.paciente}>{atendimento.paciente}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[120px] truncate" title={atendimento.convenio}>{atendimento.convenio}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap">{formatDate(atendimento.data_entrada)}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap">{formatDate(atendimento.data_saida)}</td>
                                  <td className="px-3 py-2.5"><Badge className={`${getDiasParadoColor(atendimento.diasParado)} text-xs`}>{atendimento.diasParado}d</Badge></td>
                                  <td className="px-3 py-2.5"><Badge className={`${getTipoAtendimentoBadgeColor(atendimento.tipo_atendimento)} text-xs`}>{atendimento.tipo_atendimento || '-'}</Badge></td>
                                  <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">{atendimento.codigo_servico || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[200px] truncate" title={atendimento.descricao_atendimento}>{atendimento.descricao_atendimento || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[140px] truncate" title={atendimento.etapaConta}>{atendimento.etapaConta || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[120px] truncate" title={atendimento.setorEtapa}>{atendimento.setorEtapa || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[120px] truncate" title={atendimento.userEtapa}>{atendimento.userEtapa || '-'}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" onClick={() => setSelectedRow(atendimento as AtendimentoUnificado)} title="Ver detalhes"><Eye className="w-4 h-4" /></Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300" onClick={() => abrirModalNotificacao(atendimento)} title="Gerar notificação"><Bell className="w-4 h-4" /></Button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">{atendimento.numero_atendimento}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[150px] truncate" title={atendimento.convenio}>{atendimento.convenio}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[180px] truncate" title={atendimento.paciente}>{atendimento.paciente}</td>
                                  <td className="px-3 py-2.5 text-slate-200 font-mono text-xs">{atendimento.matricula || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap">{formatDate(atendimento.data_entrada)}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs whitespace-nowrap">{formatDate(atendimento.data_saida)}</td>
                                  <td className="px-3 py-2.5"><Badge className={`${getDiasParadoColor(atendimento.diasParado)} text-xs`}>{atendimento.diasParado}d</Badge></td>
                                  <td className="px-3 py-2.5"><Badge className={`${getTipoAtendimentoBadgeColor(atendimento.tipo_atendimento)} text-xs`}>{atendimento.tipo_atendimento}</Badge></td>
                                  <td className="px-3 py-2.5 text-emerald-400 font-mono text-xs whitespace-nowrap">{formatCurrency(atendimento.valorConta)}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[120px] truncate" title={atendimento.etapaConta}>{atendimento.etapaConta || '-'}</td>
                                  <td className="px-3 py-2.5 text-slate-200 text-xs max-w-[150px] truncate" title={atendimento.medicoResp}>{atendimento.medicoResp || '-'}</td>
                                  {origemDetectada === "all" && (
                                    <td className="px-3 py-2.5"><Badge className={`${getOrigemColor(atendimento.origemSistema)} text-xs`}>{getOrigemLabel(atendimento.origemSistema)}</Badge></td>
                                  )}
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" onClick={() => setSelectedRow(atendimento as AtendimentoUnificado)}><Eye className="w-4 h-4" /></Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300" onClick={() => abrirModalNotificacao(atendimento)} title="Gerar notificação"><Bell className="w-4 h-4" /></Button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Paginação */}
                <div className="mt-4 flex items-center justify-between text-slate-400 text-sm">
                  <span>Exibindo {serverTotal > 0 ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0}-{Math.min(currentPage * PAGE_SIZE, serverTotal)} de {serverTotal} atendimentos</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-white">Página {currentPage} de {totalPages || 1}</span>
                    <Button size="sm" variant="outline" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ===== MODAL NOTIFICAÇÃO INDIVIDUAL ===== */}
        {modalAberto && atendimentoSelecionado && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalAberto(false)}>
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white">Registrar Notificação</h2>
                <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs">Atendimento</p>
                  <p className="text-white font-mono">{atendimentoSelecionado.numero_atendimento} - {atendimentoSelecionado.paciente}</p>
                  <p className="text-slate-400 text-xs mt-1">{atendimentoSelecionado.convenio} | {atendimentoSelecionado.tipo_atendimento || '-'}</p>
                </div>

                <NotificacaoLinhasEditor linhas={notificacaoLinhas} setLinhas={setNotificacaoLinhas} />

                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">Observação *</label>
                  <textarea
                    placeholder="Descreva a observação da notificação..."
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-400 min-h-[80px]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={aplicarNotificacao}
                    disabled={registrarNotificacao.isPending}
                  >
                    {registrarNotificacao.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                    Registrar Notificação
                  </Button>
                  <Button variant="outline" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600" onClick={() => setModalAberto(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MODAL NOTIFICAÇÃO EM LOTE ===== */}
        {modalLoteAberto && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalLoteAberto(false)}>
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white">Notificação em Lote</h2>
                <button onClick={() => setModalLoteAberto(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3">
                  <p className="text-amber-300 text-sm font-medium">{selecionados.size} atendimentos selecionados</p>
                  <p className="text-amber-400/70 text-xs mt-1">A notificação será registrada para todos os atendimentos selecionados.</p>
                </div>

                <NotificacaoLinhasEditor linhas={loteNotificacaoLinhas} setLinhas={setLoteNotificacaoLinhas} />

                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1 block">Observação *</label>
                  <textarea
                    placeholder="Descreva a observação da notificação em lote..."
                    value={loteObservacao}
                    onChange={e => setLoteObservacao(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white placeholder-slate-400 min-h-[80px]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={aplicarNotificacaoLote}
                    disabled={registrarNotificacaoLote.isPending}
                  >
                    {registrarNotificacaoLote.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                    Notificar {selecionados.size} Atendimentos
                  </Button>
                  <Button variant="outline" className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600" onClick={() => setModalLoteAberto(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Painel Lateral - Detalhes do Atendimento */}
        {selectedRow && (
          <div className="fixed inset-0 bg-black/60 flex justify-end z-50" onClick={() => setSelectedRow(null)}>
            <div className="bg-slate-800 w-full md:w-[480px] h-screen shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">Detalhes do Atendimento</h2>
                  <Badge className={getOrigemColor(selectedRow.origemSistema)}>{getOrigemLabel(selectedRow.origemSistema)}</Badge>
                </div>
                <button onClick={() => setSelectedRow(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-1">
                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Identificação</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="N° Atendimento" value={selectedRow.numero_atendimento} mono />
                    <DetailField label="Conta" value={selectedRow.conta} mono />
                    <DetailField label="Autorização" value={selectedRow.autorizacao} mono />
                    <DetailField label="Origem" value={getOrigemLabel(selectedRow.origemSistema)} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider">Paciente</h3>
                  <DetailField label="Nome" value={selectedRow.paciente} />
                  <div className="grid grid-cols-3 gap-3">
                    <DetailField label="Matrícula" value={selectedRow.matricula} mono />
                    <DetailField label="Sexo" value={selectedRow.sexo} />
                    <DetailField label="Idade" value={selectedRow.idade} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Atendimento</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-slate-400 text-xs">Tipo</p>
                      <Badge className={getTipoAtendimentoBadgeColor(selectedRow.tipo_atendimento)}>{selectedRow.tipo_atendimento || '-'}</Badge>
                    </div>
                    <DetailField label="Caráter" value={selectedRow.caracter_atendimento} />
                    <DetailField label="Data Entrada" value={formatDate(selectedRow.data_entrada)} />
                    <DetailField label="Data Saída" value={formatDate(selectedRow.data_saida)} />
                    <div>
                      <p className="text-slate-400 text-xs">Dias Parado</p>
                      <Badge className={getDiasParadoColor(selectedRow.diasParado)}>{selectedRow.diasParado} dias</Badge>
                    </div>
                    <DetailField label="Motivo Alta" value={selectedRow.dsMotivoAlta} />
                  </div>
                  <DetailField label="Código Serviço" value={selectedRow.codigo_servico} mono />
                  <DetailField label="Descrição Atendimento" value={selectedRow.descricao_atendimento} />
                  <DetailField label="Procedimento Principal" value={selectedRow.codigo_procedimento} />
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Convênio</h3>
                  <DetailField label="Plano" value={selectedRow.convenio} />
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Categoria" value={selectedRow.dsCategoria} />
                    <DetailField label="Plano Detalhe" value={selectedRow.dsPlano} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Financeiro</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Valor Conta" value={formatCurrency(selectedRow.valorConta)} highlight />
                    <DetailField label="Competência" value={selectedRow.competencia} />
                    <DetailField label="Referência" value={selectedRow.referencia} />
                    <DetailField label="Título" value={selectedRow.titulo} />
                    <DetailField label="Data Título" value={formatDate(selectedRow.dtTitulo)} />
                    <DetailField label="Data Vencimento" value={formatDate(selectedRow.dataVencimento)} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Protocolo</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Protocolo Tasy" value={selectedRow.protTasy} mono />
                    <DetailField label="Nome Protocolo" value={selectedRow.nomeProtocolo} />
                    <DetailField label="Protocolo Convênio" value={selectedRow.protConv} />
                    <DetailField label="Status" value={selectedRow.protStatus} />
                    <DetailField label="Data Entrega" value={formatDate(selectedRow.dtEntrega)} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Etapa da Conta</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Etapa" value={selectedRow.etapaConta} />
                    <DetailField label="Setor Etapa" value={selectedRow.setorEtapa} />
                    <DetailField label="Data Etapa" value={formatDate(selectedRow.dtEtapa)} />
                    <DetailField label="Usuário" value={selectedRow.userEtapa} />
                  </div>
                  {selectedRow.motivoDevolucao && (<DetailField label="Motivo Devolução" value={selectedRow.motivoDevolucao} />)}
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">Setor / Local</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Setor Entrada" value={selectedRow.dsSetorEntrada} />
                    <DetailField label="Setor Leito" value={selectedRow.dsSetorLeito} />
                    <DetailField label="Centro Custo" value={selectedRow.centroCusto} />
                    <DetailField label="Destino Conta" value={selectedRow.destino_conta} />
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-teal-400 uppercase tracking-wider">Médico</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <DetailField label="Médico Resp." value={selectedRow.medicoResp} />
                    <DetailField label="CRM" value={selectedRow.crm} mono />
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-700 flex gap-2">
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => { setSelectedRow(null); abrirModalNotificacao(selectedRow); }}
                >
                  <Bell className="w-4 h-4 mr-2" /> Notificar
                </Button>
                <Button onClick={() => setSelectedRow(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value, mono, highlight }: { label: string; value?: string | null; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-slate-400 text-xs">{label}</p>
      <p className={`text-sm ${highlight ? 'text-emerald-400 font-bold' : 'text-white'} ${mono ? 'font-mono' : ''}`}>
        {value || '-'}
      </p>
    </div>
  );
}
