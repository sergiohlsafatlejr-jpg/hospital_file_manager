import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";
import {
  Factory,
  Inbox,
  FileText,
  ClipboardCheck,
  Stethoscope,
  Sparkles,
  Send,
  Gavel,
  Plus,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  RotateCcw,
  Search,
  Building2,
  UserCheck,
  BarChart3,
  Target,
  ShieldAlert,
  Timer,
  Download,
  Eye,
  Play,
  Bot,
  Trash2,
  RefreshCw,
  Link2,
} from "lucide-react";

type SetorFabrica =
  | "recepcao"
  | "faturamento"
  | "auditoria_interna"
  | "auditoria_externa"
  | "limpeza_prontuario"
  | "enviado_convenio"
  | "recursos"
  | "finalizado";

const SETORES_CONFIG: Array<{
  id: SetorFabrica;
  numero: number;
  nome: string;
  curto: string;
  descricao: string;
  corBadge: string;
  corBorda: string;
  icon: any;
}> = [
  {
    id: "recepcao",
    numero: 1,
    nome: "1. Recepção de Contas",
    curto: "Recepção",
    descricao: "Cadastro inicial das contas entregues pelos hospitais",
    corBadge: "bg-slate-100 text-slate-800 border-slate-300",
    corBorda: "border-t-slate-500",
    icon: Inbox,
  },
  {
    id: "faturamento",
    numero: 2,
    nome: "2. Setor de Faturamento",
    curto: "Faturamento",
    descricao: "Lançamento no ERP do hospital e importação do XML",
    corBadge: "bg-blue-100 text-blue-800 border-blue-300",
    corBorda: "border-t-blue-600",
    icon: FileText,
  },
  {
    id: "auditoria_interna",
    numero: 3,
    nome: "3. Auditoria Interna",
    curto: "Aud. Interna",
    descricao: "Comparativo automático de regras/gabaritos e revisão interna",
    corBadge: "bg-amber-100 text-amber-800 border-amber-300",
    corBorda: "border-t-amber-500",
    icon: ClipboardCheck,
  },
  {
    id: "auditoria_externa",
    numero: 4,
    nome: "4. Auditoria Externa",
    curto: "Aud. Externa",
    descricao: "Auditoria médica e de enfermagem externa",
    corBadge: "bg-purple-100 text-purple-800 border-purple-300",
    corBorda: "border-t-purple-600",
    icon: Stethoscope,
  },
  {
    id: "limpeza_prontuario",
    numero: 5,
    nome: "5. Limpeza de Prontuários",
    curto: "Limpeza / Envio",
    descricao: "Limpeza pós-auditoria, XML final e envio automático ao convênio",
    corBadge: "bg-cyan-100 text-cyan-800 border-cyan-300",
    corBorda: "border-t-cyan-600",
    icon: Sparkles,
  },
  {
    id: "enviado_convenio",
    numero: 6,
    nome: "6. Enviado / Recursos",
    curto: "Enviado / Recursos",
    descricao: "Protocoladas no convênio, conciliação e recurso de glosa",
    corBadge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    corBorda: "border-t-emerald-600",
    icon: Gavel,
  },
];

const TIPO_ATENDIMENTO_LABELS: Record<string, string> = {
  internacao: "Internação",
  pronto_socorro: "Pronto Socorro / Urgência",
  ambulatorio_sadt: "Ambulatório / SADT",
  hospital_dia: "Hospital Dia",
  cirurgico: "Cirúrgico",
};

const TIPO_ERRO_LABELS: Record<string, string> = {
  regra_gabarito: "Divergência de Regra / Gabarito",
  item_faltante: "Item Faltante na Conta",
  quantidade_divergente: "Quantidade Divergente",
  preco_divergente: "Preço / Tabela Divergente",
  falha_prontuario: "Falha / Falta de Documento em Prontuário",
  dados_cadastrais: "Erro de Dados Cadastrais / Guia",
  autorizacao_senha: "Erro de Senha / Autorização",
  outro: "Outro Erro Operacional",
};

function formatCurrency(val: number | string | null | undefined) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!n || isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateStr(d: string | Date | null | undefined) {
  if (!d) return "-";
  const s = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) return String(d);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function FabricaFaturamento() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const abaInicial = urlParams.get("aba") || "esteira";

  const [abaPrincipal, setAbaPrincipal] = useState<string>(abaInicial);
  const [setorSelecionado, setSetorSelecionado] = useState<SetorFabrica | "todos">(
    (urlParams.get("setor") as SetorFabrica) || "recepcao"
  );

  // Filtros da Esteira
  const [hospitalFiltro, setHospitalFiltro] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [faturistaFiltro, setFaturistaFiltro] = useState<string>("todos");
  const [buscaTexto, setBuscaTexto] = useState<string>("");
  const [selecionadas, setSelecionadas] = useState<number[]>([]);

  // Formulário 1 - Cadastro Inicial na Recepção de Contas
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [recHospitalId, setRecHospitalId] = useState<string>("");
  const [recConvenioId, setRecConvenioId] = useState<string>("");
  const [recNomePaciente, setRecNomePaciente] = useState<string>("");
  const [recNumeroAtendimento, setRecNumeroAtendimento] = useState<string>("");
  const [recNumeroGuia, setRecNumeroGuia] = useState<string>("");
  const [recTipoAtendimento, setRecTipoAtendimento] = useState<
    "internacao" | "pronto_socorro" | "ambulatorio_sadt" | "hospital_dia" | "cirurgico"
  >("internacao");
  const [recDataEntrada, setRecDataEntrada] = useState<string>(hojeStr);
  const [recDataAlta, setRecDataAlta] = useState<string>(hojeStr);
  const [recDataRecebimento, setRecDataRecebimento] = useState<string>(hojeStr);
  const [recObservacoes, setRecObservacoes] = useState<string>("");
  const [recEncaminharDireto, setRecEncaminharDireto] = useState<boolean>(true);
  const [recFaturistaId, setRecFaturistaId] = useState<string>("fila_geral");
  const [manterDadosFixos, setManterDadosFixos] = useState<boolean>(true);

  // Modal de Importação de XML na Conta (Setor 2: Faturamento e Setor 5: Limpeza)
  const [modalXmlOpen, setModalXmlOpen] = useState(false);
  const [contaAlvoXml, setContaAlvoXml] = useState<any | null>(null);
  const [etapaXml, setEtapaXml] = useState<"faturamento" | "limpeza_final">("faturamento");
  const [arquivoXmlFile, setArquivoXmlFile] = useState<File | null>(null);
  const fileXmlInputRef = useRef<HTMLInputElement>(null);

  // Modal de Devolução com Erro (Auditoria Interna / Externa -> Faturamento)
  const [modalErroOpen, setModalErroOpen] = useState(false);
  const [contaAlvoErro, setContaAlvoErro] = useState<any | null>(null);
  const [tipoErro, setTipoErro] = useState<string>("regra_gabarito");
  const [codigoItemErro, setCodigoItemErro] = useState<string>("");
  const [descricaoErro, setDescricaoErro] = useState<string>("");
  const [impactoFinanceiroErro, setImpactoFinanceiroErro] = useState<string>("0");

  // Modal de Envio ao Convênio (Setor 5: Limpeza Pós -> Enviado ao Convênio)
  const [modalEnvioOpen, setModalEnvioOpen] = useState(false);
  const [contaAlvoEnvio, setContaAlvoEnvio] = useState<any | null>(null);
  const [metodoEnvio, setMetodoEnvio] = useState<"rpa_portal" | "webservice_tiss" | "manual">(
    "rpa_portal"
  );
  const [protocoloEnvio, setProtocoloEnvio] = useState<string>("");

  // Filtros e Estado dos Relatórios SAFATLE
  const [competenciaRelatorio, setCompetenciaRelatorio] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [hospitalRelatorioFiltro, setHospitalRelatorioFiltro] = useState<string>("todos");
  const [abaRelatorio, setAbaRelatorio] = useState<string>("producao");

  // Modal de Nova Meta
  const [modalMetaOpen, setModalMetaOpen] = useState(false);
  const [metaSetor, setMetaSetor] = useState<SetorFabrica>("faturamento");
  const [metaUsuarioId, setMetaUsuarioId] = useState<string>("todos");
  const [metaHospitalId, setMetaHospitalId] = useState<string>("todos");
  const [metaQtdContas, setMetaQtdContas] = useState<string>("100");
  const [metaValor, setMetaValor] = useState<string>("500000");
  const [metaSlaHoras, setMetaSlaHoras] = useState<string>("48");

  // Queries tRPC
  const { data: auxData } = trpc.fabricaFaturamento.dadosAuxiliares.useQuery();
  const hospitais = auxData?.hospitais || [];
  const listaConvenios = auxData?.convenios || [];
  const colaboradores = auxData?.colaboradores || [];

  const {
    data: resumoSetores,
    refetch: refetchResumo,
  } = trpc.fabricaFaturamento.resumoSetores.useQuery({
    hospitalEstabelecimentoId:
      hospitalFiltro !== "todos" ? Number(hospitalFiltro) : undefined,
    convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) : undefined,
  });

  const {
    data: listagemData,
    isLoading: loadingContas,
    refetch: refetchContas,
  } = trpc.fabricaFaturamento.listarContas.useQuery({
    setorAtual: setorSelecionado !== "todos" ? setorSelecionado : undefined,
    statusSetor: statusFiltro !== "todos" ? (statusFiltro as any) : undefined,
    hospitalEstabelecimentoId:
      hospitalFiltro !== "todos" ? Number(hospitalFiltro) : undefined,
    convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) : undefined,
    faturistaId: faturistaFiltro !== "todos" ? Number(faturistaFiltro) : undefined,
    search: buscaTexto || undefined,
    page: 1,
    pageSize: 100,
  });

  const {
    data: relatoriosData,
    isLoading: loadingRelatorios,
    refetch: refetchRelatorios,
  } = trpc.fabricaFaturamento.relatoriosGerenciais.useQuery({
    competencia: competenciaRelatorio,
    hospitalEstabelecimentoId:
      hospitalRelatorioFiltro !== "todos" ? Number(hospitalRelatorioFiltro) : undefined,
  });

  const recarregarTudo = () => {
    refetchResumo();
    refetchContas();
    refetchRelatorios();
  };

  // Mutations
  const cadastrarMutation = trpc.fabricaFaturamento.cadastrarContaRecepcao.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setRecNomePaciente("");
      setRecNumeroAtendimento("");
      setRecNumeroGuia("");
      setRecObservacoes("");
      if (!manterDadosFixos) {
        setRecHospitalId("");
        setRecConvenioId("");
      }
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const assumirMutation = trpc.fabricaFaturamento.assumirConta.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setSelecionadas([]);
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const transicionarMutation = trpc.fabricaFaturamento.transicionarSetor.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setSelecionadas([]);
      setModalErroOpen(false);
      setModalEnvioOpen(false);
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const importarXmlMutation = trpc.fabricaFaturamento.importarXmlNaConta.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setModalXmlOpen(false);
      setArquivoXmlFile(null);
      setContaAlvoXml(null);
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const vincularLoteMutation =
    trpc.fabricaFaturamento.vincularAutomaticoComContaConvenio.useMutation({
      onSuccess: (res) => {
        if (res.totalVinculadas > 0) {
          toast.success(res.mensagem);
        } else {
          toast.info(res.mensagem);
        }
        recarregarTudo();
      },
      onError: (err) => toast.error(err.message),
    });

  const salvarMetaMutation = trpc.fabricaFaturamento.salvarMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta cadastrada com sucesso!");
      setModalMetaOpen(false);
      refetchRelatorios();
    },
    onError: (err) => toast.error(err.message),
  });

  const excluirMetaMutation = trpc.fabricaFaturamento.excluirMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta removida.");
      refetchRelatorios();
    },
  });

  const excluirContaMutation = trpc.fabricaFaturamento.excluirConta.useMutation({
    onSuccess: () => {
      toast.success("Conta excluída da esteira.");
      recarregarTudo();
    },
  });

  // Cálculo automático de dias de internação e delay no formulário de Recepção
  const infoDatasRecepcao = useMemo(() => {
    if (!recDataEntrada || !recDataAlta) return null;
    const dEnt = new Date(recDataEntrada);
    const dAlta = new Date(recDataAlta);
    const dRec = recDataRecebimento ? new Date(recDataRecebimento) : new Date();
    const diasInternado = Math.max(
      0,
      Math.round((dAlta.getTime() - dEnt.getTime()) / 86400000)
    );
    const diasAtrasoEntregaHospital = Math.max(
      0,
      Math.round((dRec.getTime() - dAlta.getTime()) / 86400000)
    );
    return { diasInternado, diasAtrasoEntregaHospital };
  }, [recDataEntrada, recDataAlta, recDataRecebimento]);

  const handleCadastrarRecepcao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recHospitalId) {
      toast.error("Selecione o Hospital (Estabelecimento) de origem da conta.");
      return;
    }
    if (!recNomePaciente.trim()) {
      toast.error("Informe o nome do paciente.");
      return;
    }
    cadastrarMutation.mutate({
      hospitalEstabelecimentoId: Number(recHospitalId),
      convenioId: recConvenioId && recConvenioId !== "nenhum" ? Number(recConvenioId) : null,
      numeroAtendimento: recNumeroAtendimento || null,
      numeroGuia: recNumeroGuia || null,
      nomePaciente: recNomePaciente,
      tipoAtendimento: recTipoAtendimento,
      dataEntrada: recDataEntrada,
      dataAlta: recDataAlta || null,
      dataRecebimentoSafatle: recDataRecebimento,
      observacoes: recObservacoes || null,
      encaminharDiretoFaturamento: recEncaminharDireto,
      faturistaId:
        recFaturistaId && recFaturistaId !== "fila_geral" ? Number(recFaturistaId) : null,
    });
  };

  const handleConfirmarImportacaoXml = async () => {
    if (!contaAlvoXml || !arquivoXmlFile) {
      toast.error("Selecione um arquivo XML TISS para importar.");
      return;
    }
    const buffer = await arquivoXmlFile.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);

    importarXmlMutation.mutate({
      fabricaContaId: contaAlvoXml.id,
      nomeArquivo: arquivoXmlFile.name,
      conteudoBase64: base64,
      etapaXml,
      avancarSetorAutomatico: etapaXml === "faturamento",
    });
  };

  const handleConfirmarDevolucaoErro = () => {
    if (!contaAlvoErro) return;
    if (!descricaoErro.trim()) {
      toast.error("Descreva o erro encontrado para orientar a correção do faturista.");
      return;
    }
    transicionarMutation.mutate({
      contaIds: [contaAlvoErro.id],
      setorDestino: "faturamento",
      statusDestino: "devolvido_erro",
      registrarErro: {
        tipoErro: tipoErro as any,
        codigoItem: codigoItemErro || null,
        descricaoErro: descricaoErro.trim(),
        impactoFinanceiro: parseFloat(impactoFinanceiroErro) || 0,
      },
    });
  };

  const handleConfirmarEnvioConvenio = () => {
    if (!contaAlvoEnvio) return;
    transicionarMutation.mutate({
      contaIds: [contaAlvoEnvio.id],
      setorDestino: "enviado_convenio",
      statusDestino: "concluido",
      dadosEnvioConvenio: {
        metodoEnvio,
        protocoloEnvio: protocoloEnvio || null,
      },
      observacao:
        metodoEnvio === "rpa_portal"
          ? "Enviado automaticamente via Robô RPA Safatle para o portal do convênio"
          : metodoEnvio === "webservice_tiss"
            ? "Transmitido via Webservice TISS padrão ANS"
            : `Envio registrado com protocolo ${protocoloEnvio}`,
    });
  };

  const exportarRelatorioExcel = () => {
    if (!relatoriosData) return;
    const wb = XLSX.utils.book_new();

    const wsProd = XLSX.utils.json_to_sheet(
      relatoriosData.producaoPorFuncionario.map((p: any) => ({
        Colaborador: p.usuarioNome,
        "Contas Recepcionadas": p.contasRecepcionadas,
        "Contas Faturadas": p.contasFaturadas,
        "Valor Faturado (R$)": p.valorFaturado,
        "Auditadas (Interna)": p.contasAuditadasInterna,
        "Auditadas (Externa)": p.contasAuditadasExterna,
        "Limpas e Enviadas": p.contasLimpasEnviadas,
        "Tempo Médio por Etapa (min)": p.tempoMedioMinutos,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsProd, "Producao_Funcionarios");

    const wsErros = XLSX.utils.json_to_sheet(
      relatoriosData.listaErrosRecentes.map((e: any) => ({
        Hospital: e.hospitalNome,
        Paciente: e.nomePaciente,
        "Guia / Atendimento": e.numeroGuia,
        Faturista: e.faturistaNome,
        Auditor: e.auditorNome,
        "Setor que Apontou": e.setorOrigemErro,
        "Tipo de Erro": TIPO_ERRO_LABELS[e.tipoErro] || e.tipoErro,
        "Código Item": e.codigoItem || "-",
        Descrição: e.descricaoErro,
        "Impacto (R$)": e.impactoFinanceiro,
        Corrigido: e.corrigido === "sim" ? "Sim" : "Não",
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsErros, "Erros_de_Contas");

    const wsSla = XLSX.utils.json_to_sheet(
      relatoriosData.slaPorHospital.map((s: any) => ({
        Hospital: s.hospitalNome,
        "Total de Contas": s.totalContas,
        "Contas Entregues ao Convênio": s.contasEntregues,
        "Contas em Aberto na Fábrica": s.contasEmAberto,
        "Média Dias (Alta -> Recebimento Safatle)": s.mediaDiasAltaParaRecebimento,
        "Média Dias (Recebimento -> Envio Convênio)": s.mediaDiasRecebimentoParaEnvio,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsSla, "Tempo_Entrega_SLA");

    XLSX.writeFile(wb, `Relatorios_Fabrica_Safatle_${competenciaRelatorio}.xlsx`);
    toast.success("Relatório Excel exportado com sucesso!");
  };

  const contasLista = listagemData?.contas || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Cabeçalho Principal */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Factory className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Fábrica de Faturamento Safatle
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30">
                  Esteira 6 Setores
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Recepção de Contas → Faturamento (ERP Hospital + XML) → Auditoria Interna (Regras) → Auditoria Externa → Limpeza e Envio → Recursos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={abaPrincipal === "recepcao" ? "default" : "outline"}
              onClick={() => setAbaPrincipal("recepcao")}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              1. Recepcionar Conta
            </Button>
            <Button
              variant={abaPrincipal === "esteira" ? "default" : "outline"}
              onClick={() => setAbaPrincipal("esteira")}
              className="gap-2"
            >
              <Factory className="h-4 w-4" />
              Esteira de Setores ({resumoSetores?.totalGeralContas || 0})
            </Button>
            <Button
              variant={abaPrincipal === "relatorios" ? "default" : "outline"}
              onClick={() => setAbaPrincipal("relatorios")}
              className="gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Relatórios & Metas Safatle
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLocation("/conta-convenio")}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Ver no Conta Convênio
            </Button>
          </div>
        </div>

        {/* Cards dos 6 Setores da Fábrica (Sempre visíveis para acompanhamento da esteira) */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {SETORES_CONFIG.map((setor) => {
            const dados = resumoSetores?.porSetor?.[setor.id] || {
              totalContas: 0,
              devolvidasErro: 0,
              emAndamento: 0,
              emFila: 0,
              valorTotal: 0,
              mediaHorasNoSetor: 0,
            };
            const Icon = setor.icon;
            const ativo = abaPrincipal === "esteira" && setorSelecionado === setor.id;

            return (
              <Card
                key={setor.id}
                onClick={() => {
                  setSetorSelecionado(setor.id);
                  setAbaPrincipal("esteira");
                  setSelecionadas([]);
                }}
                className={`cursor-pointer transition-all hover:shadow-md border-t-4 ${setor.corBorda} ${
                  ativo ? "ring-2 ring-primary bg-primary/5" : ""
                }`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Setor {setor.numero}
                    </span>
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="font-bold text-sm leading-snug">{setor.curto}</div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-2xl font-extrabold">{dados.totalContas}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {formatCurrency(dados.valorTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                    <span>Fila: {dados.emFila}</span>
                    <span>Em curso: {dados.emAndamento}</span>
                  </div>
                  {dados.devolvidasErro > 0 && (
                    <Badge variant="destructive" className="w-full justify-center text-[10px] py-0">
                      {dados.devolvidasErro} devolvida(s) c/ erro
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ============================================================
            ABA 1: CADASTRO INICIAL — RECEPÇÃO DE CONTAS
           ============================================================ */}
        {abaPrincipal === "recepcao" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-t-4 border-t-primary shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-primary" />
                  1. Recepção de Contas — Cadastro Inicial de Prontuários
                </CardTitle>
                <CardDescription>
                  Cadastre as contas entregues pelos hospitais para a Safatle iniciar o fluxo de faturamento.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCadastrarRecepcao} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Hospital (Estabelecimento) *</Label>
                      <Select value={recHospitalId} onValueChange={setRecHospitalId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o hospital de origem..." />
                        </SelectTrigger>
                        <SelectContent>
                          {hospitais
                            .filter((h: any) => h.id !== 2160001)
                            .map((h: any) => (
                              <SelectItem key={h.id} value={String(h.id)}>
                                {h.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Convênio (Plano de Saúde)</Label>
                      <Select value={recConvenioId} onValueChange={setRecConvenioId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o convênio..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Definir depois / Via XML</SelectItem>
                          {listaConvenios.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Nome do Paciente *</Label>
                      <Input
                        value={recNomePaciente}
                        onChange={(e) => setRecNomePaciente(e.target.value)}
                        placeholder="Digite o nome completo do paciente..."
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de Atendimento *</Label>
                      <Select
                        value={recTipoAtendimento}
                        onValueChange={(v: any) => setRecTipoAtendimento(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internacao">Internação</SelectItem>
                          <SelectItem value="pronto_socorro">Pronto Socorro / Urgência</SelectItem>
                          <SelectItem value="ambulatorio_sadt">Ambulatório / SADT</SelectItem>
                          <SelectItem value="hospital_dia">Hospital Dia</SelectItem>
                          <SelectItem value="cirurgico">Cirúrgico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nº do Atendimento / Prontuário no Hospital</Label>
                      <Input
                        value={recNumeroAtendimento}
                        onChange={(e) => setRecNumeroAtendimento(e.target.value)}
                        placeholder="Ex: 1049281"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nº da Guia / Conta (se já houver)</Label>
                      <Input
                        value={recNumeroGuia}
                        onChange={(e) => setRecNumeroGuia(e.target.value)}
                        placeholder="Opcional (será preenchido pelo XML)"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Data de Entrada (Internação) *</Label>
                      <Input
                        type="date"
                        value={recDataEntrada}
                        onChange={(e) => setRecDataEntrada(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data da Alta *</Label>
                      <Input
                        type="date"
                        value={recDataAlta}
                        onChange={(e) => setRecDataAlta(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data do Recebimento na Safatle *</Label>
                      <Input
                        type="date"
                        value={recDataRecebimento}
                        onChange={(e) => setRecDataRecebimento(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {infoDatasRecepcao && (
                    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/60 px-4 py-2.5 text-xs">
                      <span>
                        <strong>Permanência no Hospital:</strong> {infoDatasRecepcao.diasInternado} dia(s)
                      </span>
                      <span>•</span>
                      <span>
                        <strong>Tempo Alta → Entrega na Safatle:</strong>{" "}
                        <span
                          className={
                            infoDatasRecepcao.diasAtrasoEntregaHospital > 10
                              ? "text-red-600 font-bold"
                              : "text-emerald-700 font-semibold"
                          }
                        >
                          {infoDatasRecepcao.diasAtrasoEntregaHospital} dia(s) após a alta
                        </span>
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Observações da Recepção</Label>
                    <Textarea
                      rows={2}
                      value={recObservacoes}
                      onChange={(e) => setRecObservacoes(e.target.value)}
                      placeholder="Ex: Prontuário físico completo, aguardando descrição cirúrgica, prioridade UTI..."
                    />
                  </div>

                  <div className="rounded-lg border p-4 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={recEncaminharDireto}
                          onChange={(e) => setRecEncaminharDireto(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Encaminhar imediatamente para o Setor de Faturamento ao salvar
                      </label>

                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={manterDadosFixos}
                          onChange={(e) => setManterDadosFixos(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        Manter Hospital/Convênio para digitação rápida em lote
                      </label>
                    </div>

                    {recEncaminharDireto && (
                      <div className="grid sm:grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Atribuir a um Faturista específico (Opcional)
                          </Label>
                          <Select value={recFaturistaId} onValueChange={setRecFaturistaId}>
                            <SelectTrigger className="h-9 bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fila_geral">
                                Deixar na Fila Geral do Setor de Faturamento
                              </SelectItem>
                              {colaboradores.map((u: any) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                  {u.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAbaPrincipal("esteira")}
                    >
                      Ver Fila da Esteira
                    </Button>
                    <Button
                      type="submit"
                      disabled={cadastrarMutation.isPending}
                      className="gap-2 px-6"
                    >
                      <Plus className="h-4 w-4" />
                      {cadastrarMutation.isPending
                        ? "Registrando..."
                        : "Cadastrar Conta e Continuar"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Card Lateral de Instruções do Fluxo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fluxo Automático da Conta</CardTitle>
                <CardDescription>
                  O que acontece após o cadastro na Recepção:
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                    1
                  </Badge>
                  <div>
                    <p className="font-semibold">Recepção → Faturamento</p>
                    <p className="text-xs text-muted-foreground">
                      A conta entra na fila do faturista com a data de entrada, alta, recebimento e hospital vinculado.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                    2
                  </Badge>
                  <div>
                    <p className="font-semibold">Lançamento no ERP + Importação XML</p>
                    <p className="text-xs text-muted-foreground">
                      Após digitar no sistema do hospital, o faturista anexa o XML. O sistema envia o XML automaticamente para o estabelecimento do hospital e para o módulo <strong>Conta Convênio</strong>.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                    3
                  </Badge>
                  <div>
                    <p className="font-semibold">Auditoria Interna (Motor de Regras)</p>
                    <p className="text-xs text-muted-foreground">
                      O Motor de Regras compara automaticamente os itens com os gabaritos do hospital/Safatle. Se houver erro, devolve ao faturista contabilizando no relatório de qualidade.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0">
                    4
                  </Badge>
                  <div>
                    <p className="font-semibold">Auditoria Externa → Limpeza Pós</p>
                    <p className="text-xs text-muted-foreground">
                      Após a auditoria externa, avança para Limpeza de Prontuários, importa o XML corrigido e dispara o envio automático ao convênio.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============================================================
            ABA 2: ESTEIRA OPERACIONAL DOS 6 SETORES
           ============================================================ */}
        {abaPrincipal === "esteira" && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {setorSelecionado === "todos"
                      ? "Todas as Contas na Fábrica"
                      : SETORES_CONFIG.find((s) => s.id === setorSelecionado)?.nome}
                  </CardTitle>
                  <CardDescription>
                    {setorSelecionado === "todos"
                      ? "Visão consolidada de todas as etapas da Fábrica de Faturamento"
                      : SETORES_CONFIG.find((s) => s.id === setorSelecionado)?.descricao}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSetorSelecionado("todos")}
                    className={setorSelecionado === "todos" ? "bg-primary/10 border-primary" : ""}
                  >
                    Ver Todos os Setores
                  </Button>

                  {(setorSelecionado === "faturamento" || setorSelecionado === "recepcao") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        vincularLoteMutation.mutate({
                          hospitalEstabelecimentoId:
                            hospitalFiltro !== "todos" ? Number(hospitalFiltro) : undefined,
                        })
                      }
                      disabled={vincularLoteMutation.isPending}
                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      <Link2 className="h-4 w-4" />
                      {vincularLoteMutation.isPending
                        ? "Sincronizando..."
                        : "Vincular Automático c/ Lotes XML"}
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={() => setAbaPrincipal("recepcao")}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Nova Conta na Recepção
                  </Button>
                </div>
              </div>

              {/* Barra de Filtros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar paciente, guia, atend..."
                    value={buscaTexto}
                    onChange={(e) => setBuscaTexto(e.target.value)}
                  />
                </div>

                <Select value={hospitalFiltro} onValueChange={setHospitalFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar Hospital..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Hospitais</SelectItem>
                    {hospitais
                      .filter((h: any) => h.id !== 2160001)
                      .map((h: any) => (
                        <SelectItem key={h.id} value={String(h.id)}>
                          {h.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar Convênio..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Convênios</SelectItem>
                    {listaConvenios.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status no Setor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Status</SelectItem>
                    <SelectItem value="fila">Aguardando na Fila</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="devolvido_erro">Devolvido com Erro (Retrabalho)</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={faturistaFiltro} onValueChange={setFaturistaFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar Faturista..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Colaboradores</SelectItem>
                    {colaboradores.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Barra de Ações em Lote quando há contas selecionadas */}
              {selecionadas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5 mt-3">
                  <span className="text-sm font-semibold">
                    {selecionadas.length} conta(s) selecionada(s)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => assumirMutation.mutate({ contaIds: selecionadas })}
                    >
                      <UserCheck className="h-4 w-4 mr-1.5" />
                      Assumir Selecionadas
                    </Button>
                    {setorSelecionado === "recepcao" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          transicionarMutation.mutate({
                            contaIds: selecionadas,
                            setorDestino: "faturamento",
                          })
                        }
                      >
                        <ArrowRight className="h-4 w-4 mr-1.5" />
                        Encaminhar p/ Faturamento
                      </Button>
                    )}
                    {setorSelecionado === "auditoria_interna" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          transicionarMutation.mutate({
                            contaIds: selecionadas,
                            setorDestino: "auditoria_externa",
                          })
                        }
                      >
                        <ArrowRight className="h-4 w-4 mr-1.5" />
                        Aprovar p/ Auditoria Externa
                      </Button>
                    )}
                    {setorSelecionado === "auditoria_externa" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          transicionarMutation.mutate({
                            contaIds: selecionadas,
                            setorDestino: "limpeza_prontuario",
                          })
                        }
                      >
                        <ArrowRight className="h-4 w-4 mr-1.5" />
                        Enviar p/ Limpeza de Prontuários
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent>
              {loadingContas ? (
                <div className="py-12 text-center text-muted-foreground">
                  Carregando contas da esteira...
                </div>
              ) : contasLista.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Inbox className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                  <p className="text-muted-foreground font-medium">
                    Nenhuma conta encontrada neste setor com os filtros atuais.
                  </p>
                  {setorSelecionado === "recepcao" && (
                    <Button onClick={() => setAbaPrincipal("recepcao")} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Cadastrar Primeira Conta na Recepção
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={
                              contasLista.length > 0 &&
                              selecionadas.length === contasLista.length
                            }
                            onChange={(e) =>
                              setSelecionadas(
                                e.target.checked ? contasLista.map((c: any) => c.id) : []
                              )
                            }
                          />
                        </TableHead>
                        <TableHead>Paciente / Atendimento</TableHead>
                        <TableHead>Hospital & Convênio</TableHead>
                        <TableHead>Entrada / Alta / Receb.</TableHead>
                        <TableHead>Setor & Status</TableHead>
                        <TableHead>XML / Regras Auditoria</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-right">Ações do Setor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contasLista.map((conta: any) => {
                        const setorInfo = SETORES_CONFIG.find(
                          (s) => s.id === conta.setorAtual
                        );
                        const isChecked = selecionadas.includes(conta.id);

                        return (
                          <TableRow
                            key={conta.id}
                            className={
                              conta.statusSetor === "devolvido_erro"
                                ? "bg-red-50/60 dark:bg-red-950/20"
                                : ""
                            }
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelecionadas([...selecionadas, conta.id]);
                                  } else {
                                    setSelecionadas(
                                      selecionadas.filter((id) => id !== conta.id)
                                    );
                                  }
                                }}
                              />
                            </TableCell>

                            <TableCell>
                              <div className="font-semibold text-foreground">
                                {conta.nomePaciente}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                <Badge variant="outline" className="text-[10px] py-0">
                                  {TIPO_ATENDIMENTO_LABELS[conta.tipoAtendimento] ||
                                    conta.tipoAtendimento}
                                </Badge>
                                {conta.numeroAtendimento && (
                                  <span>Atend: #{conta.numeroAtendimento}</span>
                                )}
                                {conta.numeroGuia && (
                                  <span className="font-mono text-primary">
                                    Guia: #{conta.numeroGuia}
                                  </span>
                                )}
                              </div>
                              {conta.ultimoMotivoRetorno &&
                                conta.statusSetor === "devolvido_erro" && (
                                  <div className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    Erro apontado: {conta.ultimoMotivoRetorno}
                                  </div>
                                )}
                            </TableCell>

                            <TableCell>
                              <div className="font-medium flex items-center gap-1 text-sm">
                                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                {conta.hospitalNome}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {conta.convenioNome}
                              </div>
                            </TableCell>

                            <TableCell className="text-xs space-y-0.5">
                              <div>
                                <span className="text-muted-foreground">Ent:</span>{" "}
                                {formatDateStr(conta.dataEntrada)}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Alta:</span>{" "}
                                {formatDateStr(conta.dataAlta)}
                              </div>
                              <div>
                                <span className="text-muted-foreground">Safatle:</span>{" "}
                                <span className="font-medium">
                                  {formatDateStr(conta.dataRecebimentoSafatle)}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="space-y-1">
                                <Badge
                                  variant="outline"
                                  className={setorInfo?.corBadge || ""}
                                >
                                  {setorInfo?.curto || conta.setorAtual}
                                </Badge>
                                <div className="flex items-center gap-1.5">
                                  {conta.statusSetor === "devolvido_erro" ? (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Devolvido c/ Erro ({conta.qtdRetrabalhos}x)
                                    </Badge>
                                  ) : conta.statusSetor === "em_andamento" ? (
                                    <Badge className="bg-blue-600 text-[10px]">
                                      Em Andamento
                                    </Badge>
                                  ) : conta.statusSetor === "concluido" ? (
                                    <Badge className="bg-emerald-600 text-[10px]">
                                      Concluído
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">
                                      Na Fila ({conta.horasNoSetorAtual}h)
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              {conta.totalItensXml > 0 ? (
                                <div className="space-y-1 text-xs">
                                  <div className="font-semibold text-foreground">
                                    {formatCurrency(
                                      conta.valorFaturadoFinal || conta.valorFaturadoInicial
                                    )}{" "}
                                    <span className="text-muted-foreground font-normal">
                                      ({conta.totalItensXml} itens)
                                    </span>
                                  </div>
                                  {conta.statusAuditoriaRegras === "divergente" ? (
                                    <Badge
                                      variant="outline"
                                      className="bg-red-50 text-red-700 border-red-200 text-[10px]"
                                    >
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      {conta.totalDivergenciasRegras} divergência(s) na regra
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Conforme nas Regras
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  Aguardando XML
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs">
                              {conta.responsavelAtualNome ? (
                                <div className="font-medium">
                                  {conta.responsavelAtualNome}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Fila Geral</span>
                              )}
                              {conta.faturistaNome && (
                                <div className="text-[11px] text-muted-foreground">
                                  Fat: {conta.faturistaNome}
                                </div>
                              )}
                              {conta.protocoloEnvioConvenio && (
                                <div className="text-[11px] font-mono text-emerald-700">
                                  Prot: {conta.protocoloEnvioConvenio}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* AÇÕES DO SETOR 1: RECEPÇÃO */}
                                {conta.setorAtual === "recepcao" && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      transicionarMutation.mutate({
                                        contaIds: [conta.id],
                                        setorDestino: "faturamento",
                                      })
                                    }
                                    className="h-8 gap-1 text-xs"
                                  >
                                    Enviar p/ Faturamento
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </Button>
                                )}

                                {/* AÇÕES DO SETOR 2: FATURAMENTO */}
                                {conta.setorAtual === "faturamento" && (
                                  <>
                                    {conta.statusSetor === "fila" && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          assumirMutation.mutate({ contaIds: [conta.id] })
                                        }
                                        className="h-8 text-xs"
                                      >
                                        Assumir
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setContaAlvoXml(conta);
                                        setEtapaXml("faturamento");
                                        setArquivoXmlFile(null);
                                        setModalXmlOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      Importar XML e Enviar p/ Aud. Interna
                                    </Button>
                                  </>
                                )}

                                {/* AÇÕES DO SETOR 3: AUDITORIA INTERNA */}
                                {conta.setorAtual === "auditoria_interna" && (
                                  <>
                                    {conta.numeroGuia && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setLocation(
                                            `/conta-convenio-detalhes?conta=${encodeURIComponent(
                                              conta.numeroGuia
                                            )}&origem=XML&estabelecimentoId=${
                                              conta.hospitalEstabelecimentoId
                                            }`
                                          )
                                        }
                                        className="h-8 gap-1 text-xs"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Auditar Regras
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setContaAlvoErro(conta);
                                        setDescricaoErro("");
                                        setCodigoItemErro("");
                                        setImpactoFinanceiroErro("0");
                                        setModalErroOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Devolver c/ Erro
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        transicionarMutation.mutate({
                                          contaIds: [conta.id],
                                          setorDestino: "auditoria_externa",
                                        })
                                      }
                                      className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                                    >
                                      Aprovar → Aud. Externa
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}

                                {/* AÇÕES DO SETOR 4: AUDITORIA EXTERNA */}
                                {conta.setorAtual === "auditoria_externa" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setContaAlvoErro(conta);
                                        setDescricaoErro("");
                                        setModalErroOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs text-red-600 border-red-200"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                      Devolver Faturamento
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        transicionarMutation.mutate({
                                          contaIds: [conta.id],
                                          setorDestino: "limpeza_prontuario",
                                        })
                                      }
                                      className="h-8 gap-1 text-xs bg-purple-600 hover:bg-purple-700"
                                    >
                                      Mudar p/ Limpeza Prontuário
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}

                                {/* AÇÕES DO SETOR 5: LIMPEZA DE PRONTUÁRIOS E ENVIO */}
                                {conta.setorAtual === "limpeza_prontuario" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setContaAlvoXml(conta);
                                        setEtapaXml("limpeza_final");
                                        setArquivoXmlFile(null);
                                        setModalXmlOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      Atualizar XML Limpo
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setContaAlvoEnvio(conta);
                                        setProtocoloEnvio("");
                                        setMetodoEnvio("rpa_portal");
                                        setModalEnvioOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs bg-cyan-600 hover:bg-cyan-700"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      Enviar XML ao Convênio
                                    </Button>
                                  </>
                                )}

                                {/* AÇÕES DO SETOR 6: ENVIADO / RECURSOS */}
                                {(conta.setorAtual === "enviado_convenio" ||
                                  conta.setorAtual === "recursos") && (
                                  <>
                                    {conta.numeroGuia && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setLocation(
                                            `/conta-convenio-detalhes?conta=${encodeURIComponent(
                                              conta.numeroGuia
                                            )}&origem=XML&estabelecimentoId=${
                                              conta.hospitalEstabelecimentoId
                                            }`
                                          )
                                        }
                                        className="h-8 gap-1 text-xs"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Ver Conta
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setLocation("/analise-glosa")}
                                      className="h-8 gap-1 text-xs"
                                    >
                                      <Gavel className="h-3.5 w-3.5" />
                                      Recurso de Glosa
                                    </Button>
                                  </>
                                )}

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Deseja remover a conta de ${conta.nomePaciente} da esteira?`
                                      )
                                    ) {
                                      excluirContaMutation.mutate({ id: conta.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
        )}

        {/* ============================================================
            ABA 3: RELATÓRIOS GERENCIAIS SAFATLE (PRODUÇÃO, METAS, ERROS, SLA)
           ============================================================ */}
        {abaPrincipal === "relatorios" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      Relatórios Gerenciais Safatle — Fábrica de Faturamento
                    </CardTitle>
                    <CardDescription>
                      Acompanhamento de Produção por Funcionário, Metas de Faturamento, Erros de Contas e Tempo de Entrega (SLA)
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Competência:</Label>
                      <Input
                        type="month"
                        value={competenciaRelatorio}
                        onChange={(e) => setCompetenciaRelatorio(e.target.value)}
                        className="w-40 h-9"
                      />
                    </div>

                    <Select
                      value={hospitalRelatorioFiltro}
                      onValueChange={setHospitalRelatorioFiltro}
                    >
                      <SelectTrigger className="w-52 h-9">
                        <SelectValue placeholder="Todos os Hospitais" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os Hospitais</SelectItem>
                        {hospitais
                          .filter((h: any) => h.id !== 2160001)
                          .map((h: any) => (
                            <SelectItem key={h.id} value={String(h.id)}>
                              {h.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportarRelatorioExcel}
                      className="gap-1.5"
                    >
                      <Download className="h-4 w-4" />
                      Exportar Excel
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {/* KPIs Resumo da Competência */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl border p-4 bg-slate-50/50 dark:bg-slate-900/30">
                    <span className="text-xs text-muted-foreground">
                      Contas Recebidas no Mês
                    </span>
                    <div className="text-2xl font-bold mt-1">
                      {relatoriosData?.resumoPeriodo?.totalRecebidas || 0}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4 bg-blue-50/50 dark:bg-blue-950/20">
                    <span className="text-xs text-muted-foreground">
                      Contas Faturadas (Com XML)
                    </span>
                    <div className="text-2xl font-bold text-blue-700 mt-1">
                      {relatoriosData?.resumoPeriodo?.totalFaturadas || 0}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <span className="text-xs text-muted-foreground">
                      Volume Total Faturado
                    </span>
                    <div className="text-2xl font-bold text-emerald-700 mt-1">
                      {formatCurrency(relatoriosData?.resumoPeriodo?.valorTotalFaturado)}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4 bg-purple-50/50 dark:bg-purple-950/20">
                    <span className="text-xs text-muted-foreground">
                      Enviadas aos Convênios
                    </span>
                    <div className="text-2xl font-bold text-purple-700 mt-1">
                      {relatoriosData?.resumoPeriodo?.totalEnviadasConvenio || 0}
                    </div>
                  </div>
                </div>

                <Tabs value={abaRelatorio} onValueChange={setAbaRelatorio}>
                  <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full mb-6">
                    <TabsTrigger value="producao" className="gap-1.5">
                      <UserCheck className="h-4 w-4" />
                      1. Produção por Funcionário
                    </TabsTrigger>
                    <TabsTrigger value="metas" className="gap-1.5">
                      <Target className="h-4 w-4" />
                      2. Metas de Faturamento
                    </TabsTrigger>
                    <TabsTrigger value="erros" className="gap-1.5">
                      <ShieldAlert className="h-4 w-4" />
                      3. Erros de Contas
                    </TabsTrigger>
                    <TabsTrigger value="sla" className="gap-1.5">
                      <Timer className="h-4 w-4" />
                      4. Tempo de Entrega (SLA)
                    </TabsTrigger>
                  </TabsList>

                  {/* SUB-ABA 1: PRODUÇÃO POR FUNCIONÁRIO */}
                  <TabsContent value="producao">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Funcionário</TableHead>
                          <TableHead className="text-center">Recepcionadas</TableHead>
                          <TableHead className="text-center">Contas Faturadas</TableHead>
                          <TableHead className="text-right">Valor Faturado (R$)</TableHead>
                          <TableHead className="text-center">Auditoria Interna</TableHead>
                          <TableHead className="text-center">Auditoria Externa</TableHead>
                          <TableHead className="text-center">Limpeza / Envio</TableHead>
                          <TableHead className="text-center">Tempo Médio / Conta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(relatoriosData?.producaoPorFuncionario || []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="text-center py-8 text-muted-foreground"
                            >
                              Nenhuma movimentação registrada neste período.
                            </TableCell>
                          </TableRow>
                        ) : (
                          relatoriosData?.producaoPorFuncionario.map((p: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-semibold">
                                {p.usuarioNome}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.contasRecepcionadas}
                              </TableCell>
                              <TableCell className="text-center font-bold text-blue-700">
                                {p.contasFaturadas}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-700">
                                {formatCurrency(p.valorFaturado)}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.contasAuditadasInterna}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.contasAuditadasExterna}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.contasLimpasEnviadas}
                              </TableCell>
                              <TableCell className="text-center">
                                {p.tempoMedioMinutos > 0
                                  ? `${p.tempoMedioMinutos} min`
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  {/* SUB-ABA 2: METAS DE FATURAMENTO */}
                  <TabsContent value="metas" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        Defina metas mensais de quantidade de contas e valor faturado por colaborador, setor ou hospital.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setModalMetaOpen(true)}
                        className="gap-1.5"
                      >
                        <Plus className="h-4 w-4" />
                        Nova Meta para {competenciaRelatorio}
                      </Button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {(relatoriosData?.metas || []).length === 0 ? (
                        <div className="col-span-2 text-center py-8 border rounded-xl text-muted-foreground">
                          Nenhuma meta cadastrada para a competência {competenciaRelatorio}. Clique em "Nova Meta" para configurar.
                        </div>
                      ) : (
                        relatoriosData?.metas.map((m: any) => {
                          const prodUser = m.usuarioId
                            ? relatoriosData.producaoPorFuncionario.find(
                                (p: any) => p.usuarioId === m.usuarioId
                              )
                            : null;
                          const qtdRealizada = prodUser
                            ? prodUser.contasFaturadas || prodUser.totalContasMovimentadas
                            : relatoriosData.resumoPeriodo.totalFaturadas;
                          const valorRealizado = prodUser
                            ? prodUser.valorFaturado
                            : relatoriosData.resumoPeriodo.valorTotalFaturado;

                          const percQtd =
                            m.metaQuantidadeContas > 0
                              ? Math.min(
                                  100,
                                  Math.round((qtdRealizada / m.metaQuantidadeContas) * 100)
                                )
                              : 0;
                          const percValor =
                            m.metaValorFaturado > 0
                              ? Math.min(
                                  100,
                                  Math.round((valorRealizado / m.metaValorFaturado) * 100)
                                )
                              : 0;

                          return (
                            <Card key={m.id} className="border-l-4 border-l-primary">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="font-bold">{m.usuarioNome}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Setor: {m.setor.toUpperCase()} • {m.hospitalNome}
                                    </div>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => excluirMetaMutation.mutate({ id: m.id })}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span>
                                      Meta de Contas: {qtdRealizada} / {m.metaQuantidadeContas}
                                    </span>
                                    <span className="font-bold">{percQtd}%</span>
                                  </div>
                                  <Progress value={percQtd} className="h-2" />
                                </div>

                                {m.metaValorFaturado > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span>
                                        Meta Financeira: {formatCurrency(valorRealizado)} /{" "}
                                        {formatCurrency(m.metaValorFaturado)}
                                      </span>
                                      <span className="font-bold">{percValor}%</span>
                                    </div>
                                    <Progress value={percValor} className="h-2" />
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </TabsContent>

                  {/* SUB-ABA 3: RELATÓRIO DE ERROS DE CONTAS */}
                  <TabsContent value="erros" className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            Erros Apontados por Faturista (Retrabalho)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Faturista</TableHead>
                                <TableHead className="text-center">Contas c/ Erro</TableHead>
                                <TableHead className="text-center">Total Erros</TableHead>
                                <TableHead className="text-right">Impacto (R$)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(relatoriosData?.errosPorFaturista || []).length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={4}
                                    className="text-center py-4 text-muted-foreground"
                                  >
                                    Zero erros registrados no período!
                                  </TableCell>
                                </TableRow>
                              ) : (
                                relatoriosData?.errosPorFaturista.map(
                                  (ef: any, idx: number) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        {ef.faturistaNome}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {ef.contasComErro}
                                      </TableCell>
                                      <TableCell className="text-center font-bold text-red-600">
                                        {ef.totalErros}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(ef.impactoFinanceiroTotal)}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )
                              )}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            Erros por Tipo / Regra Violada
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Tipo de Erro</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead className="text-center">Qtd</TableHead>
                                <TableHead className="text-right">Impacto (R$)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(relatoriosData?.errosPorTipo || []).length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={4}
                                    className="text-center py-4 text-muted-foreground"
                                  >
                                    Nenhum erro classificado no período.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                relatoriosData?.errosPorTipo.map((et: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-medium">
                                      {TIPO_ERRO_LABELS[et.tipoErro] || et.tipoErro}
                                    </TableCell>
                                    <TableCell className="text-xs uppercase">
                                      {et.setorOrigem}
                                    </TableCell>
                                    <TableCell className="text-center font-bold">
                                      {et.quantidade}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {formatCurrency(et.impactoFinanceiro)}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* SUB-ABA 4: TEMPO DE ENTREGA DE CONTAS (SLA) */}
                  <TabsContent value="sla" className="space-y-6">
                    <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {SETORES_CONFIG.map((s) => {
                        const row = (relatoriosData?.slaPorSetor || []).find(
                          (r: any) => r.setor === s.id
                        );
                        return (
                          <div key={s.id} className="rounded-lg border p-3 text-center">
                            <div className="text-xs text-muted-foreground">{s.curto}</div>
                            <div className="text-xl font-bold mt-1">
                              {row ? `${row.mediaHoras}h` : "0h"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Tempo médio no setor
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hospital (Estabelecimento)</TableHead>
                          <TableHead className="text-center">Total de Contas</TableHead>
                          <TableHead className="text-center">
                            Média Dias (Alta → Receb. Safatle)
                          </TableHead>
                          <TableHead className="text-center">
                            Média Dias (Receb. Safatle → Envio Convênio)
                          </TableHead>
                          <TableHead className="text-center">Contas Entregues</TableHead>
                          <TableHead className="text-center">Em Aberto na Fábrica</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(relatoriosData?.slaPorHospital || []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center py-8 text-muted-foreground"
                            >
                              Sem dados de SLA para o período selecionado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          relatoriosData?.slaPorHospital.map((s: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-semibold">
                                {s.hospitalNome}
                              </TableCell>
                              <TableCell className="text-center">{s.totalContas}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">
                                  {s.mediaDiasAltaParaRecebimento} dias
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                  {s.mediaDiasRecebimentoParaEnvio} dias
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-bold text-emerald-700">
                                {s.contasEntregues}
                              </TableCell>
                              <TableCell className="text-center font-semibold text-amber-700">
                                {s.contasEmAberto}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ============================================================
          MODAL 1: IMPORTAR XML TISS NA CONTA (FATURAMENTO OU LIMPEZA FINAL)
         ============================================================ */}
      <Dialog open={modalXmlOpen} onOpenChange={setModalXmlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {etapaXml === "faturamento"
                ? "Importar XML da Conta Faturada"
                : "Importar XML Final Pós-Limpeza"}
            </DialogTitle>
            <DialogDescription>
              Paciente: <strong>{contaAlvoXml?.nomePaciente}</strong> • Hospital:{" "}
              <strong>{contaAlvoXml?.hospitalNome}</strong>
              <br />O XML será gravado automaticamente no estabelecimento{" "}
              <strong>{contaAlvoXml?.hospitalNome}</strong>, carregado em{" "}
              <strong>Conta Convênio</strong> e analisado pelo{" "}
              <strong>Motor de Regras e Gabaritos</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed rounded-xl p-6 text-center space-y-2">
              <input
                ref={fileXmlInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setArquivoXmlFile(f);
                }}
              />
              <FileText className="h-10 w-10 text-primary mx-auto" />
              {arquivoXmlFile ? (
                <div className="text-sm font-semibold text-emerald-700">
                  Arquivo selecionado: {arquivoXmlFile.name} (
                  {Math.round(arquivoXmlFile.size / 1024)} KB)
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione o arquivo XML TISS exportado do sistema de gestão do hospital
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileXmlInputRef.current?.click()}
              >
                Escolher Arquivo .XML
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalXmlOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarImportacaoXml}
              disabled={!arquivoXmlFile || importarXmlMutation.isPending}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {importarXmlMutation.isPending
                ? "Processando XML e Regras..."
                : etapaXml === "faturamento"
                  ? "Importar e Enviar p/ Auditoria Interna"
                  : "Salvar XML Final no Hospital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          MODAL 2: DEVOLVER CONTA COM ERRO PARA O FATURAMENTO
         ============================================================ */}
      <Dialog open={modalErroOpen} onOpenChange={setModalErroOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <RotateCcw className="h-5 w-5" />
              Devolver Conta ao Faturamento (Registrar Erro)
            </DialogTitle>
            <DialogDescription>
              Paciente: <strong>{contaAlvoErro?.nomePaciente}</strong> • Faturista:{" "}
              <strong>{contaAlvoErro?.faturistaNome || "Fila Geral"}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Classificação do Erro *</Label>
              <Select value={tipoErro} onValueChange={setTipoErro}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_ERRO_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Código TUSS / Item (Opcional)</Label>
                <Input
                  value={codigoItemErro}
                  onChange={(e) => setCodigoItemErro(e.target.value)}
                  placeholder="Ex: 10102019"
                />
              </div>
              <div className="space-y-2">
                <Label>Impacto Financeiro Estimado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={impactoFinanceiroErro}
                  onChange={(e) => setImpactoFinanceiroErro(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição da Correção Necessária *</Label>
              <Textarea
                rows={3}
                value={descricaoErro}
                onChange={(e) => setDescricaoErro(e.target.value)}
                placeholder="Descreva o que o faturista precisa corrigir no sistema de gestão do hospital..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalErroOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmarDevolucaoErro}
              disabled={transicionarMutation.isPending}
            >
              Confirmar Devolução ao Faturamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          MODAL 3: ENVIO AUTOMÁTICO DO XML AO CONVÊNIO (SETOR 5 -> SETOR 6)
         ============================================================ */}
      <Dialog open={modalEnvioOpen} onOpenChange={setModalEnvioOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-cyan-600" />
              Enviar XML Limpo ao Convênio ({contaAlvoEnvio?.convenioNome})
            </DialogTitle>
            <DialogDescription>
              Hospital: <strong>{contaAlvoEnvio?.hospitalNome}</strong> • Paciente:{" "}
              <strong>{contaAlvoEnvio?.nomePaciente}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Mecanismo de Envio</Label>
              <Select
                value={metodoEnvio}
                onValueChange={(v: any) => setMetodoEnvio(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rpa_portal">
                    Robô RPA Safatle — Envio Automático no Portal do Convênio
                  </SelectItem>
                  <SelectItem value="webservice_tiss">
                    Webservice TISS (Transmissão Direta SOAP/ANS)
                  </SelectItem>
                  <SelectItem value="manual">
                    Protocolo Manual (Já enviado no portal)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Número de Protocolo do Convênio{" "}
                {metodoEnvio !== "manual" && "(Gerado automaticamente se em branco)"}
              </Label>
              <Input
                value={protocoloEnvio}
                onChange={(e) => setProtocoloEnvio(e.target.value)}
                placeholder="Ex: PROT-2026-994812"
              />
            </div>

            <div className="rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 p-3 text-xs text-cyan-800 dark:text-cyan-300">
              Ao confirmar, o XML final permanece vinculado ao estabelecimento{" "}
              <strong>{contaAlvoEnvio?.hospitalNome}</strong> para conciliação automática com os demonstrativos de pagamento e módulo de Recurso de Glosa.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEnvioOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarEnvioConvenio}
              disabled={transicionarMutation.isPending}
              className="gap-2 bg-cyan-600 hover:bg-cyan-700"
            >
              <Send className="h-4 w-4" />
              Confirmar Envio e Avançar p/ Recursos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          MODAL 4: CADASTRAR NOVA META DE FATURAMENTO
         ============================================================ */}
      <Dialog open={modalMetaOpen} onOpenChange={setModalMetaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Meta — Competência {competenciaRelatorio}</DialogTitle>
            <DialogDescription>
              Configure a meta mensal de produção por funcionário, setor e hospital.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Setor</Label>
                <Select
                  value={metaSetor}
                  onValueChange={(v: any) => setMetaSetor(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETORES_CONFIG.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.curto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Funcionário</Label>
                <Select value={metaUsuarioId} onValueChange={setMetaUsuarioId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Meta Geral do Setor</SelectItem>
                    {colaboradores.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hospital (Estabelecimento)</Label>
              <Select value={metaHospitalId} onValueChange={setMetaHospitalId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Hospitais</SelectItem>
                  {hospitais
                    .filter((h: any) => h.id !== 2160001)
                    .map((h: any) => (
                      <SelectItem key={h.id} value={String(h.id)}>
                        {h.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Meta Qtd Contas</Label>
                <Input
                  type="number"
                  value={metaQtdContas}
                  onChange={(e) => setMetaQtdContas(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Meta Valor (R$)</Label>
                <Input
                  type="number"
                  step="1000"
                  value={metaValor}
                  onChange={(e) => setMetaValor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>SLA Máximo (Horas)</Label>
                <Input
                  type="number"
                  value={metaSlaHoras}
                  onChange={(e) => setMetaSlaHoras(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMetaOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                salvarMetaMutation.mutate({
                  competencia: competenciaRelatorio,
                  setor: metaSetor,
                  usuarioId: metaUsuarioId !== "todos" ? Number(metaUsuarioId) : null,
                  hospitalEstabelecimentoId:
                    metaHospitalId !== "todos" ? Number(metaHospitalId) : null,
                  metaQuantidadeContas: parseInt(metaQtdContas) || 0,
                  metaValorFaturado: parseFloat(metaValor) || 0,
                  metaSlaHoras: parseInt(metaSlaHoras) || 48,
                })
              }
              disabled={salvarMetaMutation.isPending}
            >
              Salvar Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
