import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, Building2, Stethoscope, FlaskConical,
  ArrowUpDown, Download, Plus, X, RefreshCw,
  Search, Bell, AlertTriangle, Clock, Timer, ArrowLeft, Shield,
  CheckSquare, FileText, Mail, Send, Activity
} from "lucide-react";
import { useLocation } from "wouter";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Motivos de notificação
const MOTIVOS = [
  { value: "anestesista", label: "Pendência com Anestesista" },
  { value: "medico", label: "Pendência Médica" },
  { value: "medcore", label: "Pendência Medcore" },
  { value: "enfermagem", label: "Pendência Enfermagem" },
  { value: "centro_cirurgico", label: "Pendência Centro Cirúrgico" },
  { value: "farmacia", label: "Pendência Farmácia" },
  { value: "exames", label: "Falta de Exames" },
  { value: "autorizacao", label: "Falta Autorização" },
  { value: "autorizacao_prorr", label: "Falta Autorização de Prorr." },
  { value: "enviado_faturamento", label: "Enviado ao Faturamento" },
  { value: "pendencia_uti", label: "Pendência UTI" },
  { value: "outro", label: "Outro" },
];

const SETORES = [
  { value: "faturamento", label: "Faturamento" },
  { value: "recepcao", label: "Recepção" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "centro_cirurgico", label: "Centro Cirúrgico" },
  { value: "medico", label: "Médico" },
  { value: "uti", label: "UTI" },
  { value: "controle_contas", label: "Controle de Contas" },
];

const MEDICOS = [
  { value: "dr_adelvanio_morato", label: "Dr. Adelvanio Morato" },
  { value: "dr_alexandre", label: "Dr. Alexandre Augustus" },
  { value: "dr_augusto_Junior", label: "Dr. Augusto Junior" },
  { value: "dra_christiane_Yumi", label: "Dra. Christiane Yumi" },
  { value: "dr_cleizony", label: "Dra. Cleizony" },
  { value: "dr_delio", label: "Dr. Delio de Souza Bastos" },
  { value: "dr_elida", label: "Dra. Elida Natalie" },
  { value: "dra_fabio_cleber", label: "Dr. Fabio Cleber" },
  { value: "dr_felipe", label: "Dr. Felipe Domingues" },
  { value: "dr_flavio_madeira", label: "Dr. Flavio Madeira" },
  { value: "dr_gustavo_gomes", label: "Dr. Gustavo Gomes" },
  { value: "dr_joao_batista", label: "Dr. João Batista" },
  { value: "dr_joao_gabriel", label: "Dr. João Gabriel" },
  { value: "dr_josafa", label: "Dr. Josafa Pereira" },
  { value: "dr_jose_dias", label: "Dr. José Dias" },
  { value: "dr_jose_Israel", label: "Dr. José Israel" },
  { value: "dr_laurence", label: "Dr. Laurence Amorim" },
  { value: "dr_leandro_mendonca", label: "Dr. Leandro Mendonça" },
  { value: "dr_marcio_gasparine", label: "Dr. Marcio Gasparine" },
  { value: "dr_nadim_chater", label: "Dr. Nadim Chater" },
  { value: "dr_pedro_marcelo", label: "Dr. Pedro Marcelo" },
  { value: "dr_reginaldo", label: "Dr. Reginaldo Manata" },
  { value: "dr_rolando", label: "Dr. Rolando" },
  { value: "dr_tadeu", label: "Dr. Tadeu Gomes" },
  { value: "dr_thais", label: "Dra. Thais Domingues" },
  { value: "dr_thiago_henrique", label: "Dr. Thiago Henrique" },
  { value: "dr_walid", label: "Dr. Walid Chater" },
  { value: "dr_wilson", label: "Dr. Wilson Gomes" },
  { value: "outros", label: "Outros" },
];

type SortColumn = string;
type SortOrder = "asc" | "desc";

interface NotificacaoLinha {
  motivo: string;
  setor: string;
  medico: string;
}

interface AtendimentoData {
  numatend: string;
  nomepac: string;
  nomeplaco: string;
  datatend: string;
  datasai: string | null;
  diasParado: number;
  tipoatendimentodescricao: string;
  codserv: string;
  codcc_destino: string;
  motivo: string | null;
  origemSistema?: string;
  tipoatend?: string;
  etapaConta?: string;
  setorEtapa?: string;
  dtEtapa?: string | null;
  userEtapa?: string;
  codServico?: string;
  nomeProtocolo?: string | null;
  [key: string]: any;
}

function getDiasParadoColor(dias: number): string {
  if (dias >= 7) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (dias >= 3) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
}

function getTipoBadgeColor(tipo: string | null): string {
  const t = tipo?.toUpperCase() || "";
  if (t.includes("INTERNADO") || t.includes("INTERNACAO") || t.includes("INTERNAÇÃO")) return "bg-amber-500 text-white";
  if (t.includes("EXAME")) return "bg-violet-500 text-white";
  if (t.includes("AMBULAT")) return "bg-blue-500 text-white";
  if (t.includes("PRONTO") || t.includes("SOCORRO")) return "bg-orange-500 text-white";
  return "bg-slate-500 text-white";
}

function getMotivoLabel(value: string): string {
  return MOTIVOS.find(m => m.value === value)?.label || value;
}

function getSetorLabel(value: string): string {
  return SETORES.find(s => s.value === value)?.label || value;
}

function getMedicoLabel(value: string): string {
  return MEDICOS.find(m => m.value === value)?.label || value;
}

function getDataSaida(d: AtendimentoData): string {
  const tipoUpper = d.tipoatendimentodescricao?.toUpperCase();
  if (d.datasai) return new Date(d.datasai).toLocaleDateString("pt-BR");
  if ((tipoUpper === "EXAME" || tipoUpper === "AMBULATÓRIO" || tipoUpper === "AMBULATORIO") && d.datatend) {
    return new Date(d.datatend).toLocaleDateString("pt-BR");
  }
  return "-";
}

// ===== Geração de PDF com layout Safatle =====
async function gerarPDFNotificacao(
  atendimentos: AtendimentoData[],
  notificacaoLinhas: NotificacaoLinha[],
  observacao: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

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
    doc.rect(0, 0, pageWidth, 32, "F");
    if (logoImg) {
      doc.addImage(logoImg, "PNG", margin, 4, 24, 24);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SAFATLE", margin + (logoImg ? 28 : 0), 14);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Gerenciamento Hospitalar", margin + (logoImg ? 28 : 0), 20);
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    const dataAtual = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    doc.text(dataAtual, pageWidth - margin, 14, { align: "right" });
    doc.text("Notificação de Atendimentos", pageWidth - margin, 20, { align: "right" });
  }

  function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Safatle Sistemas - Gerenciamento Hospitalar", margin, pageHeight - 10);
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  }

  drawHeader(doc);

  let startY = 40;

  // Título
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Notificação de Atendimentos Parados", margin, startY);
  startY += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Total de atendimentos: ${atendimentos.length}`, margin, startY);
  startY += 8;

  // Tabela de atendimentos
  const tableData = atendimentos.map(a => [
    a.numatend,
    (a.nomepac || "").substring(0, 30),
    a.nomeplaco || "-",
    a.datatend ? new Date(a.datatend).toLocaleDateString("pt-BR") : "-",
    getDataSaida(a),
    `${a.diasParado} dias`,
    a.tipoatendimentodescricao || a.tipoatend || "-",
    a.codserv || a.codServico || "-",
  ]);

  autoTable(doc, {
    startY,
    head: [["Nº Atend.", "Paciente", "Plano", "Entrada", "Saída", "Dias", "Tipo", "Serviço"]],
    body: tableData,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    didDrawPage: () => {
      drawHeader(doc);
    },
  });

  // Notificações
  if (notificacaoLinhas.length > 0 && notificacaoLinhas.some(n => n.motivo)) {
    const currentY = (doc as any).lastAutoTable?.finalY || startY + 20;
    const notifData = notificacaoLinhas.filter(n => n.motivo).map(n => [
      getMotivoLabel(n.motivo),
      getSetorLabel(n.setor),
      getMedicoLabel(n.medico),
    ]);
    autoTable(doc, {
      startY: currentY + 8,
      head: [["Motivo", "Setor", "Médico"]],
      body: notifData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255], fontStyle: "bold" },
    });
  }

  // Observação
  if (observacao) {
    const obsY = (doc as any).lastAutoTable?.finalY || startY + 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("Observação:", margin, obsY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(observacao, pageWidth - 2 * margin);
    doc.text(lines, margin, obsY + 16);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  return doc;
}

export default function Atendimentos() {
  const [pesquisa, setPesquisa] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("diasParado");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [modalAberto, setModalAberto] = useState(false);
  const [modalLoteAberto, setModalLoteAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<{ numatend: string; nomepac: string } | null>(null);
  const [notificacaoLinhas, setNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [observacao, setObservacao] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroServico, setFiltroServico] = useState<string | null>(null);
  const [filtroPlano, setFiltroPlano] = useState<string | null>(null);

  // Filtro por sistema de origem (TASY)
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todos");
  // Filtro por nome_protocolo (TASY)
  const [filtroProtocolo, setFiltroProtocolo] = useState<string>("todos");

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Notificação em lote
  const [loteNotificacaoLinhas, setLoteNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [loteObservacao, setLoteObservacao] = useState("");

  // E-mail
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [emailMensagem, setEmailMensagem] = useState("");
  const [emailExpandido, setEmailExpandido] = useState(false);

  // Aba ativa
  const [abaAtiva, setAbaAtiva] = useState("atendimentos");

  // Histórico de notificações
  const { data: historicoNotificacoes, refetch: refetchHistorico } = trpc.atendimentos.listarHistorico.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const salvarHistoricoMutation = trpc.atendimentos.salvarHistorico.useMutation({
    onSuccess: () => {
      refetchHistorico();
    },
  });

  const notificacoesGeradas = useMemo(() => {
    if (!historicoNotificacoes) return [];
    return historicoNotificacoes.map(h => ({
      id: `DB-${h.id}`,
      data: new Date(h.dataGeracao),
      qtdAtendimentos: h.qtdAtendimentos,
      atendimentos: (h.atendimentos as AtendimentoData[]) || [],
      notificacoes: (h.notificacoes as NotificacaoLinha[]) || [],
      observacao: h.observacao || "",
      usuario: h.usuario || "",
    }));
  }, [historicoNotificacoes]);

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [tempoRestante, setTempoRestante] = useState<string>("");

  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id;

  const POLLING_INTERVAL = 60 * 60 * 1000;

  const { data: atendimentos, isLoading, refetch, isFetching, dataUpdatedAt } = trpc.atendimentos.listar.useQuery({ estabelecimentoId: estabelecimentoId || undefined }, {
    refetchOnWindowFocus: false,
    refetchInterval: POLLING_INTERVAL,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (dataUpdatedAt) {
      setUltimaAtualizacao(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  useEffect(() => {
    if (!ultimaAtualizacao) return;
    const interval = setInterval(() => {
      const agora = Date.now();
      const proximaAtualizacao = ultimaAtualizacao.getTime() + POLLING_INTERVAL;
      const diff = proximaAtualizacao - agora;
      if (diff <= 0) {
        setTempoRestante("Atualizando...");
        return;
      }
      const minutos = Math.floor(diff / 60000);
      const segundos = Math.floor((diff % 60000) / 1000);
      setTempoRestante(`${minutos}min ${segundos.toString().padStart(2, "0")}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [ultimaAtualizacao]);

  // ===== Detectar se é layout TASY =====
  const isTasyLayout = useMemo(() => {
    if (filtroOrigem === "tasy") return true;
    if (filtroOrigem !== "todos") return false;
    // Se todos os dados são TASY, ativar layout TASY
    if (atendimentos && atendimentos.length > 0) {
      return atendimentos.every(d => d.origemSistema === "tasy");
    }
    return false;
  }, [filtroOrigem, atendimentos]);

  // Origens disponíveis
  const origensDisponiveis = useMemo(() => {
    if (!atendimentos) return [];
    const origens = new Set(atendimentos.map(d => d.origemSistema || "desconhecido"));
    return Array.from(origens).sort();
  }, [atendimentos]);

  // Protocolos disponíveis (TASY)
  const protocolosDisponiveis = useMemo(() => {
    if (!atendimentos) return [];
    const protocolos = new Set<string>();
    atendimentos
      .filter(d => d.origemSistema === "tasy")
      .forEach(d => {
        const prot = d.nomeProtocolo;
        if (prot && prot.trim() !== "") {
          protocolos.add(prot);
        }
      });
    return Array.from(protocolos).sort();
  }, [atendimentos]);

  // Contar TASY sem protocolo
  const tasyTotalSemProtocolo = useMemo(() => {
    if (!atendimentos) return 0;
    return atendimentos.filter(d => d.origemSistema === "tasy" && (!d.nomeProtocolo || d.nomeProtocolo.trim() === "")).length;
  }, [atendimentos]);

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
    onError: (err) => {
      toast.error(`Erro ao registrar notificação: ${err.message}`);
    },
  });

  const registrarNotificacaoLote = trpc.atendimentos.registrarNotificacaoEmLote.useMutation({
    onSuccess: (result) => {
      const atendimentosSelecionadosData = dadosFiltrados.filter(d => selecionados.has(d.numatend));
      salvarHistoricoMutation.mutate({
        qtdAtendimentos: result.count,
        observacao: loteObservacao,
        atendimentos: atendimentosSelecionadosData.map(a => ({
          numatend: a.numatend,
          nomepac: a.nomepac,
          nomeplaco: a.nomeplaco || "",
          datatend: a.datatend || "",
          datasai: a.datasai || null,
          diasParado: a.diasParado || 0,
          tipoatendimentodescricao: a.tipoatendimentodescricao || "",
          codserv: a.codserv || "",
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
    onError: (err) => {
      toast.error(`Erro ao registrar notificações: ${err.message}`);
    },
  });

  const enviarEmailMutation = trpc.atendimentos.enviarNotificacaoEmail.useMutation({
    onSuccess: () => {
      requestAnimationFrame(() => {
        toast.success(`E-mail enviado com sucesso!`);
        setEmailDestinatario("");
        setEmailMensagem("");
        setEmailExpandido(false);
      });
    },
    onError: (err) => {
      toast.error(`Erro ao enviar e-mail: ${err.message}`);
    },
  });

  function enviarEmailSelecionados() {
    if (selecionados.size === 0) {
      toast.error("Selecione pelo menos um atendimento");
      return;
    }
    if (!emailDestinatario.trim()) {
      toast.error("Informe o e-mail do destinatário");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailDestinatario.trim())) {
      toast.error("E-mail inválido. Verifique o endereço informado.");
      return;
    }

    const atendimentosSelecionadosData = dadosFiltrados.filter(d => selecionados.has(d.numatend));
    const nomeEstab = estabelecimentoAtual?.nome || "Estabelecimento";

    enviarEmailMutation.mutate({
      destinatarioEmail: emailDestinatario.trim(),
      estabelecimentoNome: nomeEstab,
      mensagemPersonalizada: emailMensagem.trim() || undefined,
      atendimentos: atendimentosSelecionadosData.map(a => ({
        paciente: a.nomepac || "",
        numatend: a.numatend || "",
        tipoAtendimento: a.tipoatendimentodescricao || "-",
        plano: a.nomeplaco || "Sem Plano",
        diasParado: a.diasParado || 0,
        dataEntrada: a.datatend ? new Date(a.datatend).toLocaleDateString("pt-BR") : "-",
        observacao: a.motivo || undefined,
      })),
    });
  }

  const [, navigate] = useLocation();

  // ===== KPIs =====
  const kpis = useMemo(() => {
    if (!atendimentos) return { total: 0, internacao: 0, exame: 0, ambulatorio: 0, prontoSocorro: 0 };
    // Filtrar por origem se necessário
    let dados = [...atendimentos];
    if (filtroOrigem !== "todos") {
      dados = dados.filter(d => d.origemSistema === filtroOrigem);
    }
    if (filtroProtocolo !== "todos") {
      if (filtroProtocolo === "__sem_protocolo__") {
        dados = dados.filter(d => !d.nomeProtocolo || d.nomeProtocolo.trim() === "");
      } else {
        dados = dados.filter(d => d.nomeProtocolo === filtroProtocolo);
      }
    }

    if (isTasyLayout) {
      // TASY: usar tipo_atendimento (campo tipoatend no retorno da procedure)
      return {
        total: dados.length,
        internacao: dados.filter(d => {
          const tipo = (d.tipoatend || d.tipoatendimentodescricao || "").toUpperCase();
          return tipo.includes("INTERNADO") || tipo.includes("INTERNACAO") || tipo.includes("INTERNAÇÃO");
        }).length,
        prontoSocorro: dados.filter(d => {
          const tipo = (d.tipoatend || d.tipoatendimentodescricao || "").toUpperCase();
          return tipo.includes("PRONTO") || tipo.includes("SOCORRO");
        }).length,
        ambulatorio: dados.filter(d => {
          const tipo = (d.tipoatend || d.tipoatendimentodescricao || "").toUpperCase();
          return tipo.includes("AMBULAT");
        }).length,
        exame: dados.filter(d => {
          const tipo = (d.tipoatend || d.tipoatendimentodescricao || "").toUpperCase();
          return tipo.includes("EXAME");
        }).length,
      };
    }

    // Layout padrão (Warleine/EasyVision)
    return {
      total: dados.length,
      internacao: dados.filter(d => d.tipoatendimentodescricao?.toUpperCase().includes("INTERNACAO")).length,
      exame: dados.filter(d => d.tipoatendimentodescricao?.toUpperCase().includes("EXAME")).length,
      ambulatorio: dados.filter(d => d.tipoatendimentodescricao?.toUpperCase().includes("AMBULATORIO") || d.tipoatendimentodescricao?.toUpperCase().includes("AMBULATÓRIO")).length,
      prontoSocorro: 0,
    };
  }, [atendimentos, isTasyLayout, filtroOrigem, filtroProtocolo]);

  // KPIs por plano
  const planosContagem = useMemo(() => {
    if (!atendimentos) return [];
    let dados = [...atendimentos];
    if (filtroOrigem !== "todos") dados = dados.filter(d => d.origemSistema === filtroOrigem);
    if (filtroProtocolo !== "todos") {
      if (filtroProtocolo === "__sem_protocolo__") {
        dados = dados.filter(d => !d.nomeProtocolo || d.nomeProtocolo.trim() === "");
      } else {
        dados = dados.filter(d => d.nomeProtocolo === filtroProtocolo);
      }
    }
    const contagem: Record<string, number> = {};
    dados.forEach(d => {
      const plano = d.nomeplaco || "Sem Plano";
      contagem[plano] = (contagem[plano] || 0) + 1;
    });
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  }, [atendimentos, filtroOrigem, filtroProtocolo]);

  // Contagem por serviço
  const servicosContagem = useMemo(() => {
    if (!atendimentos) return [];
    let dados = [...atendimentos];
    if (filtroOrigem !== "todos") dados = dados.filter(d => d.origemSistema === filtroOrigem);
    if (filtroProtocolo !== "todos") {
      if (filtroProtocolo === "__sem_protocolo__") {
        dados = dados.filter(d => !d.nomeProtocolo || d.nomeProtocolo.trim() === "");
      } else {
        dados = dados.filter(d => d.nomeProtocolo === filtroProtocolo);
      }
    }
    const contagem: Record<string, number> = {};
    dados.forEach(d => {
      // Para TASY: usar descricao_atendimento; para outros: usar codserv
      const servico = isTasyLayout
        ? (d.tipoatendimentodescricao || "Sem Descrição")
        : (d.codserv || "Sem Serviço");
      contagem[servico] = (contagem[servico] || 0) + 1;
    });
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  }, [atendimentos, isTasyLayout, filtroOrigem, filtroProtocolo]);

  // Filtro e ordenação
  const dadosFiltrados = useMemo(() => {
    if (!atendimentos) return [];
    let filtrados = [...atendimentos] as AtendimentoData[];

    // Filtro por origem
    if (filtroOrigem !== "todos") {
      filtrados = filtrados.filter(d => d.origemSistema === filtroOrigem);
    }

    // Filtro por protocolo (TASY)
    if (filtroProtocolo !== "todos") {
      if (filtroProtocolo === "__sem_protocolo__") {
        filtrados = filtrados.filter(d => !d.nomeProtocolo || d.nomeProtocolo.trim() === "");
      } else {
        filtrados = filtrados.filter(d => d.nomeProtocolo === filtroProtocolo);
      }
    }

    if (filtroTipo !== "todos") {
      filtrados = filtrados.filter(d => {
        const tipo = isTasyLayout
          ? (d.tipoatend || d.tipoatendimentodescricao || "").toUpperCase()
          : (d.tipoatendimentodescricao || "").toUpperCase();
        return tipo.includes(filtroTipo.toUpperCase());
      });
    }
    if (filtroServico) {
      if (isTasyLayout) {
        filtrados = filtrados.filter(d => (d.tipoatendimentodescricao || "Sem Descrição") === filtroServico);
      } else {
        filtrados = filtrados.filter(d => (d.codserv || "Sem Serviço") === filtroServico);
      }
    }
    if (filtroPlano) {
      filtrados = filtrados.filter(d => (d.nomeplaco || "Sem Plano") === filtroPlano);
    }
    if (pesquisa) {
      const termo = pesquisa.toLowerCase();
      filtrados = filtrados.filter(d => {
        const campos = [
          d.numatend, d.nomepac, d.nomeplaco,
          d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
          getDataSaida(d),
          String(d.diasParado),
          d.tipoatendimentodescricao, d.codserv, d.codcc_destino, d.motivo,
          d.tipoatend, d.etapaConta, d.setorEtapa, d.userEtapa, d.codServico,
          d.nomeProtocolo,
        ];
        return campos.some(c => (c || "").toLowerCase().includes(termo));
      });
    }

    filtrados.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];
      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (sortColumn === "datatend" || sortColumn === "datasai" || sortColumn === "dtEtapa") {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (sortColumn === "diasParado" || sortColumn === "numatend") {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtrados;
  }, [atendimentos, pesquisa, sortColumn, sortOrder, filtroTipo, filtroServico, filtroPlano, filtroOrigem, filtroProtocolo, isTasyLayout]);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortOrder("asc");
    }
  }

  function abrirModal(numatend: string, nomepac: string) {
    setAtendimentoSelecionado({ numatend, nomepac });
    setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setObservacao("");
    setModalAberto(true);
  }

  function adicionarLinha() {
    setNotificacaoLinhas(prev => [...prev, { motivo: "", setor: "", medico: "" }]);
  }

  function removerLinha(index: number) {
    if (notificacaoLinhas.length > 1) {
      setNotificacaoLinhas(prev => prev.filter((_, i) => i !== index));
    }
  }

  function atualizarLinha(index: number, campo: keyof NotificacaoLinha, valor: string) {
    setNotificacaoLinhas(prev => prev.map((l, i) => i === index ? { ...l, [campo]: valor } : l));
  }

  function aplicarNotificacao() {
    if (!atendimentoSelecionado) return;
    if (!observacao.trim()) {
      toast.error("Preencha a observação");
      return;
    }
    registrarNotificacao.mutate({
      numatend: atendimentoSelecionado.numatend,
      observacao,
      notificacoes: notificacaoLinhas,
    });
  }

  // ===== Seleção múltipla =====
  const toggleSelecionado = useCallback((numatend: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(numatend)) {
        next.delete(numatend);
      } else {
        next.add(numatend);
      }
      return next;
    });
  }, []);

  const selecionarTodos = useCallback(() => {
    if (selecionados.size === dadosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(dadosFiltrados.map(d => d.numatend)));
    }
  }, [dadosFiltrados, selecionados.size]);

  const todosSelecionados = dadosFiltrados.length > 0 && selecionados.size === dadosFiltrados.length;

  // ===== Notificação em lote =====
  function abrirModalLote() {
    if (selecionados.size === 0) {
      toast.error("Selecione pelo menos um atendimento");
      return;
    }
    setLoteNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setLoteObservacao("");
    setModalLoteAberto(true);
  }

  function adicionarLinhaLote() {
    setLoteNotificacaoLinhas(prev => [...prev, { motivo: "", setor: "", medico: "" }]);
  }

  function removerLinhaLote(index: number) {
    if (loteNotificacaoLinhas.length > 1) {
      setLoteNotificacaoLinhas(prev => prev.filter((_, i) => i !== index));
    }
  }

  function atualizarLinhaLote(index: number, campo: keyof NotificacaoLinha, valor: string) {
    setLoteNotificacaoLinhas(prev => prev.map((l, i) => i === index ? { ...l, [campo]: valor } : l));
  }

  function aplicarNotificacaoLote() {
    if (!loteObservacao.trim()) {
      toast.error("Preencha a observação");
      return;
    }
    const atendimentosSelecionados = dadosFiltrados
      .filter(d => selecionados.has(d.numatend))
      .map(d => ({ numatend: d.numatend, nomepac: d.nomepac }));

    registrarNotificacaoLote.mutate({
      atendimentos: atendimentosSelecionados,
      observacao: loteObservacao,
      notificacoes: loteNotificacaoLinhas,
    });
  }

  // ===== Download PDF =====
  async function baixarPDFNotificacao(notif: { data: Date; qtdAtendimentos: number; atendimentos: AtendimentoData[]; notificacoes: NotificacaoLinha[]; observacao: string }) {
    try {
      toast.info("Gerando PDF...");
      const doc = await gerarPDFNotificacao(notif.atendimentos, notif.notificacoes, notif.observacao);
      const dataStr = notif.data.toLocaleDateString("pt-BR").replace(/\//g, "-");
      doc.save(`notificacao_${dataStr}_${notif.qtdAtendimentos}_atendimentos.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) {
      toast.error("Erro ao gerar PDF");
      console.error(err);
    }
  }

  async function baixarPDFSelecionados() {
    if (selecionados.size === 0) {
      toast.error("Selecione pelo menos um atendimento");
      return;
    }
    try {
      toast.info("Gerando PDF...");
      const atendimentosSelecionados = dadosFiltrados.filter(d => selecionados.has(d.numatend));
      const doc = await gerarPDFNotificacao(atendimentosSelecionados, [], "");
      const dataStr = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
      doc.save(`atendimentos_parados_${dataStr}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) {
      toast.error("Erro ao gerar PDF");
      console.error(err);
    }
  }

  function exportarExcel() {
    let dadosExport;
    if (isTasyLayout) {
      dadosExport = dadosFiltrados.map(d => ({
        "Nº Atend.": d.numatend,
        "Paciente": d.nomepac,
        "Plano": d.nomeplaco,
        "Data Entrada": d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
        "Data Saída": getDataSaida(d),
        "Dias Parado": d.diasParado,
        "Tipo Atend.": d.tipoatend || d.tipoatendimentodescricao || "-",
        "Etapa Conta": d.etapaConta || "-",
        "Setor Etapa": d.setorEtapa || "-",
        "Dt. Etapa": d.dtEtapa ? new Date(d.dtEtapa).toLocaleDateString("pt-BR") : "-",
        "User Etapa": d.userEtapa || "-",
        "Cód. Serviço": d.codServico || d.codserv || "-",
        "Descrição Atend.": d.tipoatendimentodescricao || "-",
        "Nome Protocolo": d.nomeProtocolo || "-",
      }));
    } else {
      dadosExport = dadosFiltrados.map(d => ({
        "Nº Atend.": d.numatend,
        "Paciente": d.nomepac,
        "Plano": d.nomeplaco,
        "Data Entrada": d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
        "Data Saída": getDataSaida(d),
        "Dias Parado": d.diasParado,
        "Tipo": d.tipoatendimentodescricao || "-",
        "Serviço": d.codserv,
        "CC Destino": d.codcc_destino || "-",
        "Motivo": d.motivo || "-",
      }));
    }
    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    const dataHoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    XLSX.writeFile(wb, `atendimentos_parados_${dataHoje}.xlsx`);
  }

  const SortIcon = ({ col }: { col: SortColumn }) => (
    <span className="ml-1 text-xs opacity-60">
      {sortColumn === col ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando atendimentos...</span>
      </div>
    );
  }

  // ===== Colunas da tabela =====
  const tasyColumns = [
    { col: "numatend", label: "Nº Atend." },
    { col: "nomepac", label: "Paciente" },
    { col: "nomeplaco", label: "Plano" },
    { col: "datatend", label: "Data Entrada" },
    { col: "datasai", label: "Data Saída" },
    { col: "diasParado", label: "Dias Parado" },
    { col: "tipoatend", label: "Tipo Atend." },
    { col: "etapaConta", label: "Etapa Conta" },
    { col: "setorEtapa", label: "Setor Etapa" },
    { col: "dtEtapa", label: "Dt. Etapa" },
    { col: "userEtapa", label: "User Etapa" },
    { col: "codServico", label: "Cód. Serviço" },
    { col: "tipoatendimentodescricao", label: "Descrição Atend." },
  ];

  const defaultColumns = [
    { col: "numatend", label: "Nº Atend." },
    { col: "nomepac", label: "Paciente" },
    { col: "nomeplaco", label: "Plano" },
    { col: "datatend", label: "Data Entrada" },
    { col: "datasai", label: "Data Saída" },
    { col: "diasParado", label: "Dias Parado" },
    { col: "tipoatendimentodescricao", label: "Tipo" },
    { col: "codserv", label: "Serviço" },
    { col: "codcc_destino", label: "CC Destino" },
    { col: "motivo", label: "Motivo" },
  ];

  const columns = isTasyLayout ? tasyColumns : defaultColumns;

  function renderCellValue(d: AtendimentoData, col: string) {
    switch (col) {
      case "numatend":
        return <span className="font-mono font-medium">{d.numatend}</span>;
      case "nomepac":
        return <span className="max-w-[180px] truncate block" title={d.nomepac}>{d.nomepac}</span>;
      case "nomeplaco":
        return <span className="max-w-[130px] truncate block" title={d.nomeplaco}>{d.nomeplaco}</span>;
      case "datatend":
        return <span className="whitespace-nowrap">{d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "-"}</span>;
      case "datasai":
        return <span className="whitespace-nowrap">{getDataSaida(d)}</span>;
      case "diasParado":
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${getDiasParadoColor(d.diasParado)}`}>
            <Clock className="w-3 h-3" />
            {d.diasParado} {d.diasParado === 1 ? "dia" : "dias"}
          </span>
        );
      case "tipoatend":
        return (
          <Badge className={`${getTipoBadgeColor(d.tipoatend || d.tipoatendimentodescricao)} text-xs`}>
            {d.tipoatend || d.tipoatendimentodescricao || "-"}
          </Badge>
        );
      case "tipoatendimentodescricao":
        if (isTasyLayout) {
          // No layout TASY, esta coluna é "Descrição Atend."
          return <span className="max-w-[250px] truncate block text-xs" title={d.tipoatendimentodescricao}>{d.tipoatendimentodescricao || "-"}</span>;
        }
        return (
          <Badge className={`${getTipoBadgeColor(d.tipoatendimentodescricao)} text-xs`}>
            {d.tipoatendimentodescricao || "-"}
          </Badge>
        );
      case "codserv":
        return <span>{d.codserv || "-"}</span>;
      case "codServico":
        return <span>{d.codServico || d.codserv || "-"}</span>;
      case "codcc_destino":
        return <span>{d.codcc_destino || "-"}</span>;
      case "motivo":
        return d.motivo ? (
          <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
            {getMotivoLabel(d.motivo)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      case "etapaConta":
        return <span className="text-xs">{d.etapaConta || "-"}</span>;
      case "setorEtapa":
        return <span className="text-xs">{d.setorEtapa || "-"}</span>;
      case "dtEtapa":
        return <span className="whitespace-nowrap text-xs">{d.dtEtapa ? new Date(d.dtEtapa).toLocaleDateString("pt-BR") : "-"}</span>;
      case "userEtapa":
        return <span className="text-xs max-w-[120px] truncate block" title={d.userEtapa}>{d.userEtapa || "-"}</span>;
      default:
        return <span>{d[col] || "-"}</span>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/")} className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Atendimentos Parados{estabelecimentoAtual ? ` - ${estabelecimentoAtual.nome}` : ""}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitoramento de atendimentos pendentes de faturamento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Timer className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Atualizado: {ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                {tempoRestante && (
                  <span className="text-[10px] opacity-70">Próxima em {tempoRestante}</span>
                )}
              </div>
            </div>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Filtros de Origem e Protocolo */}
      {origensDisponiveis.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">Sistema:</span>
            <div className="flex gap-1">
              <Button
                variant={filtroOrigem === "todos" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setFiltroOrigem("todos"); setFiltroProtocolo("todos"); }}
              >
                Todos
              </Button>
              {origensDisponiveis.map(origem => (
                <Button
                  key={origem}
                  variant={filtroOrigem === origem ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setFiltroOrigem(origem); if (origem !== "tasy") setFiltroProtocolo("todos"); }}
                >
                  {origem.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Filtro por Protocolo (só aparece quando TASY está ativo) */}
          {isTasyLayout && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-medium">Protocolo:</span>
              <Select value={filtroProtocolo} onValueChange={setFiltroProtocolo}>
                <SelectTrigger className="h-7 text-xs w-[220px]">
                  <SelectValue placeholder="Todos os protocolos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Protocolos</SelectItem>
                  <SelectItem value="__sem_protocolo__">Sem Protocolo ({tasyTotalSemProtocolo})</SelectItem>
                  {protocolosDisponiveis.map(prot => (
                    <SelectItem key={prot} value={prot}>{prot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList>
          <TabsTrigger value="atendimentos" className="gap-2">
            <Users className="w-4 h-4" /> Atendimentos
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="gap-2">
            <FileText className="w-4 h-4" /> Notificações Geradas
            {notificacoesGeradas.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{notificacoesGeradas.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atendimentos" className="space-y-6 mt-4">
          {/* KPIs */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${isTasyLayout ? "lg:grid-cols-4" : "lg:grid-cols-4"} gap-4`}>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFiltroTipo("todos")}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total de Atendimentos</p>
                    <p className="text-3xl font-bold mt-1">{kpis.total}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {isTasyLayout ? (
              <>
                <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${filtroTipo === "INTERNADO" ? "border-amber-500" : ""}`} onClick={() => setFiltroTipo(f => f === "INTERNADO" ? "todos" : "INTERNADO")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Internado</p>
                        <p className="text-3xl font-bold mt-1 text-amber-500">{kpis.internacao}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-amber-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`cursor-pointer hover:border-orange-500/50 transition-colors ${filtroTipo === "PRONTO SOCORRO" ? "border-orange-500" : ""}`} onClick={() => setFiltroTipo(f => f === "PRONTO SOCORRO" ? "todos" : "PRONTO SOCORRO")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pronto Socorro</p>
                        <p className="text-3xl font-bold mt-1 text-orange-500">{kpis.prontoSocorro}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                        <Activity className="w-6 h-6 text-orange-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`cursor-pointer hover:border-blue-500/50 transition-colors ${filtroTipo === "AMBULAT" ? "border-blue-500" : ""}`} onClick={() => setFiltroTipo(f => f === "AMBULAT" ? "todos" : "AMBULAT")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Ambulatorial</p>
                        <p className="text-3xl font-bold mt-1 text-blue-500">{kpis.ambulatorio}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Stethoscope className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${filtroTipo === "INTERNACAO" ? "border-amber-500" : ""}`} onClick={() => setFiltroTipo(f => f === "INTERNACAO" ? "todos" : "INTERNACAO")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Internação</p>
                        <p className="text-3xl font-bold mt-1 text-amber-500">{kpis.internacao}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-amber-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`cursor-pointer hover:border-violet-500/50 transition-colors ${filtroTipo === "EXAME" ? "border-violet-500" : ""}`} onClick={() => setFiltroTipo(f => f === "EXAME" ? "todos" : "EXAME")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Exame</p>
                        <p className="text-3xl font-bold mt-1 text-violet-500">{kpis.exame}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                        <FlaskConical className="w-6 h-6 text-violet-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className={`cursor-pointer hover:border-blue-500/50 transition-colors ${filtroTipo === "AMBULATORIO" ? "border-blue-500" : ""}`} onClick={() => setFiltroTipo(f => f === "AMBULATORIO" ? "todos" : "AMBULATORIO")}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Ambulatório</p>
                        <p className="text-3xl font-bold mt-1 text-blue-500">{kpis.ambulatorio}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Stethoscope className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* KPIs por Plano */}
          {planosContagem.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground">Quantidade por Plano (Convênio)</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {planosContagem.map(([plano, qtd]) => (
                    <div
                      key={plano}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 ${
                        filtroPlano === plano
                          ? "bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/30"
                          : "bg-muted/50"
                      }`}
                      onClick={() => setFiltroPlano(prev => prev === plano ? null : plano)}
                    >
                      <span className={`truncate mr-2 text-xs ${filtroPlano === plano ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>{plano}</span>
                      <span className="font-bold text-emerald-600">{qtd}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quantidade por Serviço / Descrição */}
          {servicosContagem.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                  {isTasyLayout ? "Quantidade por Descrição de Atendimento" : "Quantidade por Serviço"}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {servicosContagem.map(([servico, qtd]) => (
                    <div
                      key={servico}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all hover:border-primary/50 hover:bg-primary/5 ${
                        filtroServico === servico
                          ? "bg-primary/10 border-primary ring-1 ring-primary/30"
                          : "bg-muted/50"
                      }`}
                      onClick={() => setFiltroServico(prev => prev === servico ? null : servico)}
                    >
                      <span className={`truncate mr-2 text-xs ${filtroServico === servico ? "text-primary font-medium" : "text-muted-foreground"}`}>{servico}</span>
                      <span className="font-bold text-primary">{qtd}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Barra de seleção */}
          {selecionados.size > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 animate-in fade-in slide-in-from-top-2 space-y-3">
              <div className="flex items-center gap-3">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">
                  {selecionados.size} atendimento{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={baixarPDFSelecionados}>
                    <FileText className="w-3.5 h-3.5" /> Baixar PDF
                  </Button>
                  <Button size="sm" className="gap-1.5 h-8 bg-amber-600 hover:bg-amber-700" onClick={abrirModalLote}>
                    <Bell className="w-3.5 h-3.5" /> Notificar Selecionados
                  </Button>
                  <Button
                    size="sm"
                    variant={emailExpandido ? "default" : "outline"}
                    className={`gap-1.5 h-8 ${emailExpandido ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    onClick={() => setEmailExpandido(!emailExpandido)}
                  >
                    <Mail className="w-3.5 h-3.5" /> Enviar por E-mail
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setSelecionados(new Set())}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Painel de e-mail expandido */}
              {emailExpandido && (
                <div className="bg-background/50 rounded-lg p-4 border space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">E-mail do Destinatário *</label>
                      <Input
                        placeholder="email@exemplo.com"
                        value={emailDestinatario}
                        onChange={e => setEmailDestinatario(e.target.value)}
                        type="email"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Mensagem Personalizada (opcional)</label>
                      <Input
                        placeholder="Mensagem adicional no corpo do e-mail..."
                        value={emailMensagem}
                        onChange={e => setEmailMensagem(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={enviarEmailSelecionados}
                      disabled={enviarEmailMutation.isPending || !emailDestinatario.trim()}
                    >
                      {enviarEmailMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {enviarEmailMutation.isPending ? 'Enviando...' : 'Enviar E-mail'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filtros e Ações */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isTasyLayout
                  ? "Buscar por Nº Atend., Paciente, Plano, Tipo, Serviço, Etapa, Setor..."
                  : "Buscar por Nº Atend., Paciente, Plano, Data, Tipo, Serviço, Motivo..."
                }
                value={pesquisa}
                onChange={e => setPesquisa(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={exportarExcel} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Download className="w-4 h-4" /> Exportar Excel
            </Button>
          </div>

          {(filtroTipo !== "todos" || filtroServico || filtroPlano || filtroOrigem !== "todos" || filtroProtocolo !== "todos") && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-blue-400 bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/20">
              <AlertTriangle className="w-4 h-4" />
              <span>Filtros ativos:</span>
              {filtroOrigem !== "todos" && (
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => { setFiltroOrigem("todos"); setFiltroProtocolo("todos"); }}>
                  Sistema: {filtroOrigem.toUpperCase()} <X className="w-3 h-3" />
                </Badge>
              )}
              {filtroProtocolo !== "todos" && (
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroProtocolo("todos")}>
                  Protocolo: {filtroProtocolo === "__sem_protocolo__" ? "Sem Protocolo" : filtroProtocolo} <X className="w-3 h-3" />
                </Badge>
              )}
              {filtroTipo !== "todos" && (
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroTipo("todos")}>
                  Tipo: {filtroTipo} <X className="w-3 h-3" />
                </Badge>
              )}
              {filtroServico && (
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroServico(null)}>
                  {isTasyLayout ? "Descrição" : "Serviço"}: {filtroServico} <X className="w-3 h-3" />
                </Badge>
              )}
              {filtroPlano && (
                <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroPlano(null)}>
                  Plano: {filtroPlano} <X className="w-3 h-3" />
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => { setFiltroTipo("todos"); setFiltroServico(null); setFiltroPlano(null); setFiltroOrigem("todos"); setFiltroProtocolo("todos"); }}>
                <X className="w-3 h-3 mr-1" /> Limpar Todos
              </Button>
            </div>
          )}

          {/* Tabela */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-3 w-10">
                      <Checkbox
                        checked={todosSelecionados}
                        onCheckedChange={selecionarTodos}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    {columns.map(({ col, label }) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-muted/50 select-none whitespace-nowrap"
                        onClick={() => handleSort(col)}
                      >
                        {label}
                        <SortIcon col={col} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 2} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhum atendimento encontrado
                      </td>
                    </tr>
                  ) : (
                    dadosFiltrados.map((d, idx) => (
                      <tr
                        key={`${d.numatend}-${idx}`}
                        className={`border-b hover:bg-muted/20 transition-colors ${selecionados.has(d.numatend) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selecionados.has(d.numatend)}
                            onCheckedChange={() => toggleSelecionado(d.numatend)}
                            aria-label={`Selecionar ${d.nomepac}`}
                          />
                        </td>
                        {columns.map(({ col }) => (
                          <td key={col} className="px-4 py-3">
                            {renderCellValue(d, col)}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={() => abrirModal(d.numatend, d.nomepac)}
                            >
                              <Bell className="w-3 h-3" /> Notificar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t text-sm text-muted-foreground flex items-center justify-between">
              <span>Exibindo {dadosFiltrados.length} de {kpis.total} atendimentos</span>
              {selecionados.size > 0 && (
                <span className="text-primary font-medium">{selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}</span>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Aba de Notificações Geradas */}
        <TabsContent value="notificacoes" className="space-y-6 mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Notificações Geradas</h2>
                  <p className="text-sm text-muted-foreground">Baixe as notificações em PDF com o layout da Safatle</p>
                </div>
              </div>

              {notificacoesGeradas.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma notificação gerada</h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Selecione atendimentos na aba anterior e clique em "Notificar Selecionados" para gerar notificações que poderão ser baixadas em PDF aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notificacoesGeradas.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-red-500/10">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            Notificação — {notif.qtdAtendimentos} atendimento{notif.qtdAtendimentos > 1 ? "s" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Gerada em {notif.data.toLocaleDateString("pt-BR")} às {notif.data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            {notif.usuario ? ` por ${notif.usuario}` : ""}
                          </p>
                          {notif.notificacoes.filter(n => n.motivo).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {notif.notificacoes.filter(n => n.motivo).map((n, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] h-5">
                                  {getMotivoLabel(n.motivo)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 h-9"
                        onClick={() => baixarPDFNotificacao(notif)}
                      >
                        <Download className="w-4 h-4" /> Baixar PDF
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Notificação Individual */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Registro de Notificação - {atendimentoSelecionado?.nomepac}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Atendimento: <strong className="text-foreground">{atendimentoSelecionado?.numatend}</strong>
            </p>

            {notificacaoLinhas.map((linha, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/20">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Motivo</label>
                  <Select value={linha.motivo} onValueChange={v => atualizarLinha(index, "motivo", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
                  <Select value={linha.setor} onValueChange={v => atualizarLinha(index, "setor", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                    <SelectContent>
                      {SETORES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Médico</label>
                    <Select value={linha.medico} onValueChange={v => atualizarLinha(index, "medico", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                      <SelectContent>
                        {MEDICOS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {notificacaoLinhas.length > 1 && (
                    <Button variant="ghost" size="icon" className="mt-5 text-destructive h-9 w-9" onClick={() => removerLinha(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" className="gap-1" onClick={adicionarLinha}>
              <Plus className="w-3 h-3" /> Adicionar Notificação
            </Button>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Observação *</label>
              <Textarea
                placeholder="Digite a observação..."
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button
              onClick={aplicarNotificacao}
              disabled={registrarNotificacao.isPending}
              className="gap-2"
            >
              {registrarNotificacao.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Notificação em Lote */}
      <Dialog open={modalLoteAberto} onOpenChange={setModalLoteAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificação em Lote — {selecionados.size} atendimento{selecionados.size > 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 border">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Atendimentos selecionados:</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {dadosFiltrados
                  .filter(d => selecionados.has(d.numatend))
                  .map(d => (
                    <Badge key={d.numatend} variant="secondary" className="text-xs">
                      {d.numatend} — {d.nomepac?.split(" ").slice(0, 2).join(" ")}
                    </Badge>
                  ))}
              </div>
            </div>

            {loteNotificacaoLinhas.map((linha, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/20">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Motivo</label>
                  <Select value={linha.motivo} onValueChange={v => atualizarLinhaLote(index, "motivo", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
                  <Select value={linha.setor} onValueChange={v => atualizarLinhaLote(index, "setor", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                    <SelectContent>
                      {SETORES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Médico</label>
                    <Select value={linha.medico} onValueChange={v => atualizarLinhaLote(index, "medico", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                      <SelectContent>
                        {MEDICOS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {loteNotificacaoLinhas.length > 1 && (
                    <Button variant="ghost" size="icon" className="mt-5 text-destructive h-9 w-9" onClick={() => removerLinhaLote(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" className="gap-1" onClick={adicionarLinhaLote}>
              <Plus className="w-3 h-3" /> Adicionar Notificação
            </Button>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Observação *</label>
              <Textarea
                placeholder="Digite a observação que será aplicada a todos os atendimentos selecionados..."
                value={loteObservacao}
                onChange={e => setLoteObservacao(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalLoteAberto(false)}>Cancelar</Button>
            <Button
              onClick={aplicarNotificacaoLote}
              disabled={registrarNotificacaoLote.isPending}
              className="gap-2 bg-amber-600 hover:bg-amber-700"
            >
              {registrarNotificacaoLote.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              Notificar {selecionados.size} Atendimento{selecionados.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
