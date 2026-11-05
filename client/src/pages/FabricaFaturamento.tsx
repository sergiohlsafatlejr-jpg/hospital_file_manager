import { useState, useMemo, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EsteiraAmbulatorialPanel from "@/components/EsteiraAmbulatorialPanel";
import { caminhoContaFabricaImportada, caminhoContaFabricaBancoCliente } from "@/lib/fabricaContaDestino";
import { Database, Zap } from "lucide-react";
import { podeAcessarSetorVisivelFabrica, resolverAcessoFabrica, resolverAbaFabrica, resolverSelecaoSetorFabrica } from "@/lib/fabricaSetoresVisiveis";
import type { SetorConsultaFabrica } from "@shared/fabricaSetores";
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

type SetorFabrica = SetorConsultaFabrica;

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

  const [abaSolicitada, setAbaPrincipal] = useState<string>(abaInicial);
  const [setorSolicitado, setSetorSelecionado] = useState<string>(
    urlParams.get("setor") || "faturamento"
  );

  // Filtros da Esteira
  const [hospitalFiltro, setHospitalFiltro] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [faturistaFiltro, setFaturistaFiltro] = useState<string>("todos");
  const [filtroFilaRapida, setFiltroFilaRapida] = useState<
    "todas" | "minhas" | "fila_geral" | "devolvidas"
  >("todas");
  const [buscaTexto, setBuscaTexto] = useState<string>("");
  const [selecionadas, setSelecionadas] = useState<number[]>([]);

  // Formulário 1 - Cadastro Inicial na Recepção de Contas
  const hojeStr = new Date().toISOString().slice(0, 10);
  const [recHospitalId, setRecHospitalId] = useState<string>("");
  const [recConvenioId, setRecConvenioId] = useState<string>("");
  const [recNomePaciente, setRecNomePaciente] = useState<string>("");
  const [mostrarSugestoesPaciente, setMostrarSugestoesPaciente] = useState<boolean>(false);
  const [recNumeroAtendimento, setRecNumeroAtendimento] = useState<string>("");
  const [recNumeroGuia, setRecNumeroGuia] = useState<string>("");
  const [recNumeroContaHospital, setRecNumeroContaHospital] = useState<string>("");
  const [recConvenioNomeBanco, setRecConvenioNomeBanco] = useState<string>("");
  const [recSincronizarItensDoBanco, setRecSincronizarItensDoBanco] = useState<boolean>(true);
  const [previewBuscaBanco, setPreviewBuscaBanco] = useState<any | null>(null);
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

  // Modal de Importação de XML na Conta (Setor 2: Faturamento, Setor 3: Aud. Interna e Setor 5: Limpeza)
  const [modalXmlOpen, setModalXmlOpen] = useState(false);
  const [contaAlvoXml, setContaAlvoXml] = useState<any | null>(null);
  const [etapaXml, setEtapaXml] = useState<"faturamento" | "limpeza_final">("faturamento");
  const [arquivoXmlFile, setArquivoXmlFile] = useState<File | null>(null);
  const [arquivoXmlHonorariosFile, setArquivoXmlHonorariosFile] = useState<File | null>(null);
  const fileXmlInputRef = useRef<HTMLInputElement>(null);
  const fileXmlHonorariosInputRef = useRef<HTMLInputElement>(null);

  // Modal de Configuração de Perfil de Colaborador por Setor / Hospital
  const [modalPerfilOpen, setModalPerfilOpen] = useState(false);
  const [colabAlvoPerfil, setColabAlvoPerfil] = useState<any | null>(null);
  const [perfilCargoSetor, setPerfilCargoSetor] = useState<string>("Faturista");
  const [perfilSetores, setPerfilSetores] = useState<string[]>(["faturamento"]);
  const [perfilHospitais, setPerfilHospitais] = useState<number[]>([]);
  const [perfilVerRelatorios, setPerfilVerRelatorios] = useState<boolean>(false);

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
  const { data: auxData, status: auxStatus, refetch: refetchAuxData } = trpc.fabricaFaturamento.dadosAuxiliares.useQuery(undefined, {
    retry: false,
    staleTime: 30000,
  });
  const hospitais = auxData?.hospitais || [];
  const todosHospitaisEscopo = auxData?.todosHospitaisEscopo || hospitais;
  const listaConvenios = auxData?.convenios || [];
  const colaboradores = auxData?.colaboradores || [];
  const meuPerfil = auxData?.meuPerfil;
  const acessoFabrica = useMemo(() => resolverAcessoFabrica(auxData, auxStatus), [auxData, auxStatus]);
  const { perfilValido, podeConsultarSetores, podeGerenciarEquipe, podeVerRelatorios, podeRecepcionar } = acessoFabrica;
  const setoresVisiveis = useMemo(() => SETORES_CONFIG.filter((setor) =>
    acessoFabrica.setoresVisiveis.some((id) => id === setor.id)
  ), [acessoFabrica]);
  // Derivação síncrona: não consultar/renderizar a seleção crua da URL nem corrigir estado em loop.
  const setorSelecionado = resolverSelecaoSetorFabrica(acessoFabrica, setorSolicitado);
  const abaPrincipal = resolverAbaFabrica(acessoFabrica, abaSolicitada);
  const podeListarContas = podeConsultarSetores && setorSelecionado !== null;

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    setAbaPrincipal(params.get("aba") || "esteira");
    setSetorSelecionado(params.get("setor") || "faturamento");
    setSelecionadas([]);
  }, [searchString]);

  useEffect(() => {
    setSelecionadas([]);
  }, [setorSelecionado, perfilValido]);

  // Sugestões de autocompletar pacientes recorrentes na Recepção
  const { data: sugestoesPacientes } = trpc.fabricaFaturamento.buscarPacientesSugestao.useQuery(
    {
      termo: recNomePaciente.trim(),
      hospitalEstabelecimentoId: recHospitalId ? Number(recHospitalId) : undefined,
    },
    {
      enabled: podeRecepcionar && abaPrincipal === "recepcao" && recNomePaciente.trim().length >= 2 && mostrarSugestoesPaciente,
    }
  );

  // Meu desempenho pessoal no mês
  const { data: meuDesempenho, refetch: refetchMeuDesempenho } =
    trpc.fabricaFaturamento.meuDesempenhoSetor.useQuery({
      competencia: competenciaRelatorio,
    }, { enabled: podeConsultarSetores });

  const {
    data: resumoSetores,
    refetch: refetchResumo,
  } = trpc.fabricaFaturamento.resumoSetores.useQuery({
    hospitalEstabelecimentoId:
      hospitalFiltro !== "todos" ? Number(hospitalFiltro) : undefined,
    convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) : undefined,
  }, { enabled: podeConsultarSetores });

  const {
    data: listagemData,
    isLoading: loadingContas,
    refetch: refetchContas,
  } = trpc.fabricaFaturamento.listarContas.useQuery({
    setorAtual: setorSelecionado && setorSelecionado !== "todos" ? setorSelecionado : undefined,
    statusSetor: statusFiltro !== "todos" ? (statusFiltro as any) : undefined,
    hospitalEstabelecimentoId:
      hospitalFiltro !== "todos" ? Number(hospitalFiltro) : undefined,
    convenioId: convenioFiltro !== "todos" ? Number(convenioFiltro) : undefined,
    faturistaId: faturistaFiltro !== "todos" ? Number(faturistaFiltro) : undefined,
    search: buscaTexto || undefined,
    page: 1,
    pageSize: 100,
  }, { enabled: podeListarContas });

  const {
    data: relatoriosData,
    isLoading: loadingRelatorios,
    refetch: refetchRelatorios,
  } = trpc.fabricaFaturamento.relatoriosGerenciais.useQuery(
    {
      competencia: competenciaRelatorio,
      hospitalEstabelecimentoId:
        hospitalRelatorioFiltro !== "todos" ? Number(hospitalRelatorioFiltro) : undefined,
    },
    { enabled: podeVerRelatorios }
  );

  const recarregarTudo = () => {
    refetchAuxData();
    if (podeConsultarSetores) {
      refetchResumo();
      refetchMeuDesempenho();
    }
    if (podeListarContas) refetchContas();
    if (podeVerRelatorios) refetchRelatorios();
  };

  // Mutations
  const cadastrarMutation = trpc.fabricaFaturamento.cadastrarContaRecepcao.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setRecNomePaciente("");
      setMostrarSugestoesPaciente(false);
      setRecNumeroAtendimento("");
      setRecNumeroGuia("");
      setRecNumeroContaHospital("");
      setRecConvenioNomeBanco("");
      setPreviewBuscaBanco(null);
      setRecObservacoes("");
      if (!manterDadosFixos) {
        setRecHospitalId("");
        setRecConvenioId("");
      }
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const buscarContaBancoRecepcaoMutation =
    trpc.fabricaFaturamento.buscarContaNoBancoHospital.useMutation({
      onSuccess: (res) => {
        if (!res.encontrada) {
          setPreviewBuscaBanco(null);
          toast.error(res.mensagem);
          return;
        }
        setPreviewBuscaBanco(res);
        const cab = res.cabecalho;
        if (cab.nomePaciente) setRecNomePaciente(cab.nomePaciente);
        if (cab.numeroContaHospital) setRecNumeroContaHospital(cab.numeroContaHospital);
        if (cab.numeroAtendimento) setRecNumeroAtendimento(cab.numeroAtendimento);
        if (cab.numeroGuia) setRecNumeroGuia(cab.numeroGuia);
        else if (cab.numeroContaHospital && !recNumeroGuia) setRecNumeroGuia(cab.numeroContaHospital);
        if (cab.convenioId) setRecConvenioId(String(cab.convenioId));
        if (cab.convenioNome) setRecConvenioNomeBanco(cab.convenioNome);
        if (cab.tipoAtendimento) setRecTipoAtendimento(cab.tipoAtendimento as any);
        if (cab.dataEntrada) setRecDataEntrada(cab.dataEntrada);
        if (cab.dataAlta) setRecDataAlta(cab.dataAlta);

        if (res.itensInfo.possuiItensBaixados) {
          toast.success(
            `Conta #${cab.numeroContaHospital} localizada no banco com ${res.itensInfo.totalItens} itens baixados (R$ ${res.itensInfo.valorTotal.toFixed(2)})!`
          );
        } else {
          toast.info(
            `Cabeçalho da conta #${cab.numeroContaHospital} carregado do banco (sem itens baixados ainda — abrirá para faturamento).`
          );
        }
      },
      onError: (err) => toast.error(err.message),
    });

  const sincronizarContaBancoEsteiraMutation =
    trpc.fabricaFaturamento.sincronizarContaDoBancoNaEsteira.useMutation({
      onSuccess: (res) => {
        if (res.possuiItensBaixados) {
          toast.success(res.mensagem);
        } else {
          toast.warning(res.mensagem);
        }
        recarregarTudo();
      },
      onError: (err) => toast.error(err.message),
    });

  const handleBuscarContaNoBancoRecepcao = () => {
    if (!recHospitalId) {
      toast.error("Selecione primeiro o Hospital (Estabelecimento) para buscar a conta no banco.");
      return;
    }
    const num = (recNumeroContaHospital || recNumeroGuia || recNumeroAtendimento).trim();
    if (!num) {
      toast.error("Digite o Nº da Conta do Hospital para buscar.");
      return;
    }
    buscarContaBancoRecepcaoMutation.mutate({
      hospitalEstabelecimentoId: Number(recHospitalId),
      numeroConta: num,
    });
  };

  const assumirMutation = trpc.fabricaFaturamento.assumirConta.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      setSelecionadas([]);
      recarregarTudo();
    },
    onError: (err) => toast.error(err.message),
  });

  const atribuirResponsavelMutation =
    trpc.fabricaFaturamento.atribuirResponsavelConta.useMutation({
      onSuccess: (res) => {
        toast.success(res.mensagem);
        setSelecionadas([]);
        recarregarTudo();
      },
      onError: (err) => toast.error(err.message),
    });

  const salvarPerfilColaboradorMutation =
    trpc.fabricaFaturamento.salvarPerfilColaborador.useMutation({
      onSuccess: (res) => {
        toast.success(res.mensagem);
        setModalPerfilOpen(false);
        refetchAuxData();
      },
      onError: (err) => toast.error(err.message),
    });

  const liberarAcessoEquipeMutation =
    trpc.fabricaFaturamento.liberarAcessoEquipeRecepcao.useMutation({
      onSuccess: (res) => {
        toast.success(res.mensagem);
        refetchAuxData();
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
      setArquivoXmlHonorariosFile(null);
      setContaAlvoXml(null);
      recarregarTudo();
      setLocation(caminhoContaFabricaImportada(res.destinoContaConvenio));
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
      if (podeVerRelatorios) refetchRelatorios();
    },
    onError: (err) => toast.error(err.message),
  });

  const excluirMetaMutation = trpc.fabricaFaturamento.excluirMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta removida.");
      if (podeVerRelatorios) refetchRelatorios();
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
      convenioNome: recConvenioNomeBanco || null,
      numeroContaHospital: recNumeroContaHospital || recNumeroGuia || null,
      sincronizarItensDoBanco: recSincronizarItensDoBanco,
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

  const fileToBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleConfirmarImportacaoXml = async () => {
    if (!contaAlvoXml) return;
    if (!arquivoXmlFile && !arquivoXmlHonorariosFile) {
      toast.error("Selecione o XML da Conta Hospitalar e/ou o XML dos Honorários Médicos.");
      return;
    }
    const base64Conta = arquivoXmlFile ? await fileToBase64(arquivoXmlFile) : "";
    const base64Hon = arquivoXmlHonorariosFile
      ? await fileToBase64(arquivoXmlHonorariosFile)
      : null;

    importarXmlMutation.mutate({
      fabricaContaId: contaAlvoXml.id,
      nomeArquivo: arquivoXmlFile?.name || "",
      conteudoBase64: base64Conta,
      nomeArquivoHonorarios: arquivoXmlHonorariosFile?.name || null,
      conteudoHonorariosBase64: base64Hon,
      etapaXml,
      avancarSetorAutomatico:
        etapaXml === "faturamento" && contaAlvoXml.setorAtual === "faturamento",
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

  const contasListaBruta = useMemo(() => podeListarContas
    ? (listagemData?.contas || []).filter((conta: { setorAtual: string }) =>
      acessoFabrica.setoresConsulta.some((setor) => setor === conta.setorAtual)
    )
    : [], [listagemData, podeListarContas, acessoFabrica]);
  const contasLista = useMemo(() => {
    if (filtroFilaRapida === "minhas" && meuPerfil?.usuarioId) {
      return contasListaBruta.filter(
        (c: any) =>
          c.responsavelAtualId === meuPerfil.usuarioId ||
          c.faturistaId === meuPerfil.usuarioId
      );
    }
    if (filtroFilaRapida === "fila_geral") {
      return contasListaBruta.filter(
        (c: any) => !c.responsavelAtualId && c.statusSetor === "fila"
      );
    }
    if (filtroFilaRapida === "devolvidas") {
      return contasListaBruta.filter((c: any) => c.statusSetor === "devolvido_erro");
    }
    return contasListaBruta;
  }, [contasListaBruta, filtroFilaRapida, meuPerfil?.usuarioId]);

  if (!perfilValido) {
    return (
      <DashboardLayout>
        <Card role="status">
          <CardHeader>
            <CardTitle>Esteira de Faturamento Safatle</CardTitle>
            <CardDescription>
              {auxStatus === "pending"
                ? "Carregando seu perfil de acesso..."
                : "Não foi possível validar seu perfil de acesso. Os setores permanecem bloqueados."}
            </CardDescription>
          </CardHeader>
          {auxStatus !== "pending" && (
            <CardContent>
              <Button variant="outline" onClick={() => refetchAuxData()}>Tentar novamente</Button>
            </CardContent>
          )}
        </Card>
      </DashboardLayout>
    );
  }

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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">
                  Esteira de Faturamento Safatle
                </h1>
                <Badge className="bg-primary/15 text-primary border-primary/30">
                  {meuPerfil?.isGestorFabrica
                    ? "Visão Gestor • 6 Setores"
                    : `${meuPerfil?.cargoSetor || "Operacional"} • ${setoresVisiveis.length} Setor(es)`}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Recepção de Contas → Faturamento (ERP Hospital + 2 XMLs) → Auditoria Interna (Regras + Honorários) → Auditoria Externa → Limpeza e Envio → Recursos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {podeRecepcionar && (
              <Button
                variant={abaPrincipal === "recepcao" ? "default" : "outline"}
                onClick={() => setAbaPrincipal("recepcao")}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                1. Recepcionar Conta
              </Button>
            )}
            <Button
              variant={abaPrincipal === "esteira" ? "default" : "outline"}
              onClick={() => setAbaPrincipal("esteira")}
              className="gap-2"
            >
              <Factory className="h-4 w-4" />
              Esteira de Setores ({podeConsultarSetores ? resumoSetores?.totalGeralContas || 0 : 0})
            </Button>
            {podeConsultarSetores && (
              <Button
                variant={abaPrincipal === "ambulatorial" ? "default" : "outline"}
                onClick={() => setAbaPrincipal("ambulatorial")}
                className="gap-2 border-indigo-300"
              >
                <FileText className="h-4 w-4" />
                Esteira Ambulatorial (Lotes XML)
              </Button>
            )}
            {podeVerRelatorios && (
              <Button
                variant={abaPrincipal === "relatorios" ? "default" : "outline"}
                onClick={() => setAbaPrincipal("relatorios")}
                className="gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Relatórios & Metas Safatle
              </Button>
            )}
            {podeGerenciarEquipe && (
              <Button
                variant={abaPrincipal === "equipe" ? "default" : "outline"}
                onClick={() => setAbaPrincipal("equipe")}
                className="gap-2"
              >
                <UserCheck className="h-4 w-4" />
                Equipe & Setores ({colaboradores.length})
              </Button>
            )}
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

        {/* Cards dos Setores Liberados para o Colaborador */}
        <div
          className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-${Math.min(
            6,
            Math.max(2, setoresVisiveis.length)
          )} gap-3`}
        >
          {setoresVisiveis.map((setor) => {
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

        {/* Painel Compacto: Meu Desempenho e Meta Individual no Setor */}
        {podeConsultarSetores && meuDesempenho && (
          <div className="rounded-xl border bg-slate-50/70 dark:bg-slate-900/40 px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge variant="outline" className="bg-background font-semibold">
                <Target className="h-3.5 w-3.5 mr-1 text-primary" />
                Minha Produção ({meuDesempenho.competencia})
              </Badge>
              <span>
                Em andamento comigo:{" "}
                <strong className="text-blue-700">{meuDesempenho.minhasEmAndamento || 0}</strong>
              </span>
              <span>•</span>
              <span>
                Recepcionadas: <strong>{meuDesempenho.recepcionadasMes || 0}</strong>
              </span>
              <span>•</span>
              <span>
                Faturadas c/ XML:{" "}
                <strong className="text-emerald-700">
                  {meuDesempenho.faturadasMes || 0} ({formatCurrency(meuDesempenho.valorFaturadoMes)})
                </strong>
              </span>
              <span>•</span>
              <span>
                Auditadas:{" "}
                <strong>
                  {(meuDesempenho.auditadasInternaMes || 0) +
                    (meuDesempenho.auditadasExternaMes || 0)}
                </strong>
              </span>
              <span>•</span>
              <span>
                Enviadas: <strong>{meuDesempenho.limpasEnviadasMes || 0}</strong>
              </span>
              {(meuDesempenho.minhasDevolvidasErro || 0) > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {meuDesempenho.minhasDevolvidasErro} devolvida(s) p/ correção
                </Badge>
              )}
            </div>

            {meuDesempenho.metas && meuDesempenho.metas.length > 0 && (
              <div className="flex items-center gap-3 min-w-[240px]">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium">
                      Meta do Mês ({meuDesempenho.metas[0].metaQuantidadeContas} contas)
                    </span>
                    <span className="font-bold text-primary">
                      {Math.min(
                        100,
                        Math.round(
                          (((meuDesempenho.faturadasMes || 0) +
                            (meuDesempenho.auditadasInternaMes || 0) +
                            (meuDesempenho.recepcionadasMes || 0)) /
                            Math.max(1, meuDesempenho.metas[0].metaQuantidadeContas)) *
                            100
                        )
                      )}
                      %
                    </span>
                  </div>
                  <Progress
                    value={Math.min(
                      100,
                      Math.round(
                        (((meuDesempenho.faturadasMes || 0) +
                          (meuDesempenho.auditadasInternaMes || 0) +
                          (meuDesempenho.recepcionadasMes || 0)) /
                          Math.max(1, meuDesempenho.metas[0].metaQuantidadeContas)) *
                          100
                      )
                    )}
                    className="h-2"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            ABA 1: CADASTRO INICIAL — RECEPÇÃO DE CONTAS
           ============================================================ */}
        {abaPrincipal === "recepcao" && podeRecepcionar && (
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-t-4 border-t-primary shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-primary" />
                  1. Recepção de Contas — Cadastro Inicial de Prontuários
                </CardTitle>
                <CardDescription>
                  Cadastre as contas entregues pelos hospitais para a Safatle iniciar o fluxo de faturamento. Ao digitar o nome de um paciente já atendido, o sistema preenche automaticamente Hospital, Convênio e Atendimento.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCadastrarRecepcao} className="space-y-4">
                  {/* Barra de Busca Direta no Sistema do Hospital pelo Nº da Conta */}
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-emerald-50/40 dark:from-indigo-950/30 dark:to-emerald-950/20 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Database className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                            Busca Direta no Banco do Hospital (Integrador de Dados)
                            <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-300 text-[10px]">
                              Por Nº da Conta
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Digite o Nº da Conta para puxar Paciente, Convênio, Atendimento, Datas e Itens (se o hospital já tiver baixas de farmácia/setores).
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-5 space-y-1">
                        <Label className="text-xs font-medium">1º Hospital (Estabelecimento) *</Label>
                        <Select
                          value={recHospitalId}
                          onValueChange={(val) => {
                            setRecHospitalId(val);
                            setPreviewBuscaBanco(null);
                          }}
                        >
                          <SelectTrigger className="bg-background h-9">
                            <SelectValue placeholder="Selecione o hospital..." />
                          </SelectTrigger>
                          <SelectContent>
                            {hospitais
                              .filter((h: any) => h.id !== 2160001)
                              .map((h: any) => (
                                <SelectItem key={h.id} value={String(h.id)}>
                                  {h.nome}
                                  {h.possuiBuscaDiretaBanco ? " ⚡ (Integrado)" : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="sm:col-span-4 space-y-1">
                        <Label className="text-xs font-medium">2º Nº da Conta no Hospital</Label>
                        <Input
                          value={recNumeroContaHospital}
                          onChange={(e) => setRecNumeroContaHospital(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleBuscarContaNoBancoRecepcao();
                            }
                          }}
                          placeholder="Ex: 584920"
                          className="bg-background h-9 font-mono"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <Button
                          type="button"
                          onClick={handleBuscarContaNoBancoRecepcao}
                          disabled={buscarContaBancoRecepcaoMutation.isPending}
                          className="w-full h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          {buscarContaBancoRecepcaoMutation.isPending ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Buscando...
                            </>
                          ) : (
                            <>
                              <Search className="h-3.5 w-3.5" />
                              Buscar Conta
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {previewBuscaBanco && (
                      <div
                        className={`rounded-lg border p-3 text-xs space-y-2 ${
                          previewBuscaBanco.itensInfo?.possuiItensBaixados
                            ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
                            : "bg-amber-50/90 border-amber-300 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold flex items-center gap-1.5">
                            {previewBuscaBanco.itensInfo?.possuiItensBaixados ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span>
                                  Conta #{previewBuscaBanco.cabecalho?.numeroContaHospital} com{" "}
                                  <strong>{previewBuscaBanco.itensInfo.totalItens} itens baixados</strong> (
                                  {formatCurrency(previewBuscaBanco.itensInfo.valorTotal)})
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                                <span>
                                  Conta #{previewBuscaBanco.cabecalho?.numeroContaHospital} localizada apenas com{" "}
                                  <strong>cabeçalho (sem itens baixados ainda)</strong>
                                </span>
                              </>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-white/80">
                            Fonte: {previewBuscaBanco.configSource}
                          </Badge>
                        </div>

                        {previewBuscaBanco.itensInfo?.possuiItensBaixados ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-200/70">
                            <span>
                              O hospital já possui itens cobrados nesta conta. Ao cadastrar, os itens já serão importados e pré-auditados pelo Motor de Regras para o faturista revisar.
                            </span>
                            <label className="flex items-center gap-1.5 font-medium cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={recSincronizarItensDoBanco}
                                onChange={(e) => setRecSincronizarItensDoBanco(e.target.checked)}
                                className="h-3.5 w-3.5 rounded"
                              />
                              Já importar os {previewBuscaBanco.itensInfo.totalItens} itens na abertura
                            </label>
                          </div>
                        ) : (
                          <p className="text-[11px] opacity-90">
                            Como o sistema do hospital ainda não possui as baixas de farmácia/setores para esta conta, ela será aberta no{" "}
                            <strong>Setor 2 (Faturamento)</strong> com os dados do paciente preenchidos para lançamento no ERP.
                          </p>
                        )}

                        {previewBuscaBanco.contaExistenteNaEsteira && (
                          <div className="rounded bg-red-100/90 border border-red-300 px-2.5 py-1.5 text-red-900 font-medium flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            Atenção: Esta conta já consta na Esteira (ID #{previewBuscaBanco.contaExistenteNaEsteira.id} — Setor:{" "}
                            {previewBuscaBanco.contaExistenteNaEsteira.setorAtual}).
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                          {listaConvenios
                            .filter(
                              (c: any) =>
                                !recHospitalId ||
                                !c.estabelecimentoId ||
                                Number(c.estabelecimentoId) === Number(recHospitalId)
                            )
                            .map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-2 relative">
                      <div className="flex items-center justify-between">
                        <Label>Nome do Paciente *</Label>
                        <span className="text-[11px] text-muted-foreground">
                          Busca automática de pacientes recorrentes
                        </span>
                      </div>
                      <Input
                        value={recNomePaciente}
                        onChange={(e) => {
                          setRecNomePaciente(e.target.value);
                          setMostrarSugestoesPaciente(true);
                        }}
                        onFocus={() => setMostrarSugestoesPaciente(true)}
                        placeholder="Digite o nome do paciente (se já tiver conta anterior, clique para puxar os dados)..."
                        required
                      />
                      {mostrarSugestoesPaciente &&
                        recNomePaciente.trim().length >= 2 &&
                        (sugestoesPacientes?.length || 0) > 0 && (
                          <div className="absolute z-30 left-0 right-0 top-[68px] rounded-lg border bg-popover shadow-lg max-h-60 overflow-y-auto divide-y">
                            <div className="px-3 py-1.5 bg-muted/60 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                              <span>
                                Pacientes já cadastrados ({sugestoesPacientes?.length}) — clique para preencher automático
                              </span>
                              <button
                                type="button"
                                className="text-xs hover:underline"
                                onClick={() => setMostrarSugestoesPaciente(false)}
                              >
                                Fechar
                              </button>
                            </div>
                            {sugestoesPacientes?.map((sug: any, idx: number) => (
                              <button
                                key={`${sug.nomePaciente}-${idx}`}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors flex items-center justify-between gap-2"
                                onClick={() => {
                                  setRecNomePaciente(sug.nomePaciente);
                                  if (sug.hospitalEstabelecimentoId) {
                                    setRecHospitalId(String(sug.hospitalEstabelecimentoId));
                                  }
                                  if (sug.convenioId) {
                                    setRecConvenioId(String(sug.convenioId));
                                  }
                                  if (sug.tipoAtendimento) {
                                    setRecTipoAtendimento(sug.tipoAtendimento);
                                  }
                                  if (sug.numeroAtendimento && !recNumeroAtendimento) {
                                    setRecNumeroAtendimento(sug.numeroAtendimento);
                                  }
                                  setMostrarSugestoesPaciente(false);
                                  toast.success(
                                    `Dados de ${sug.nomePaciente} preenchidos automaticamente!`
                                  );
                                }}
                              >
                                <div>
                                  <div className="font-semibold text-sm">{sug.nomePaciente}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {sug.hospitalNome || "Hospital"} •{" "}
                                    {sug.convenioNome || "Convênio"}
                                    {sug.ultimaGuia ? ` • Última Guia: #${sug.ultimaGuia}` : ""}
                                  </div>
                                </div>
                                <Badge variant="secondary" className="text-[10px] shrink-0">
                                  {sug.totalContasAnteriores || 1} conta(s)
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
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
        {abaPrincipal === "ambulatorial" && podeConsultarSetores && (
          <EsteiraAmbulatorialPanel
            hospitais={hospitais}
            convenios={listaConvenios}
            hospitalFiltroGlobal={hospitalFiltro}
            convenioFiltroGlobal={convenioFiltro}
            onRecarregarEsteiraGeral={recarregarTudo}
          />
        )}

        {abaPrincipal === "esteira" && !podeConsultarSetores && (
          <Card role="status">
            <CardHeader>
              <CardTitle>Nenhum setor liberado</CardTitle>
              <CardDescription>
                Seu perfil não possui setores autorizados na esteira. Solicite ao gestor a configuração do seu acesso.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        {abaPrincipal === "esteira" && podeListarContas && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {setorSelecionado === "todos"
                      ? "Contas dos Setores Liberados"
                      : SETORES_CONFIG.find((s) => s.id === setorSelecionado)?.nome}
                  </CardTitle>
                  <CardDescription>
                    {setorSelecionado === "todos"
                      ? "Visão consolidada apenas dos setores autorizados no seu perfil"
                      : SETORES_CONFIG.find((s) => s.id === setorSelecionado)?.descricao}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(meuPerfil?.isGestorFabrica || setoresVisiveis.length > 1) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSetorSelecionado("todos")}
                      className={setorSelecionado === "todos" ? "bg-primary/10 border-primary font-semibold" : ""}
                    >
                      Ver Todos os Setores Liberados
                    </Button>
                  )}

                  {setoresVisiveis.some((s) => s.id === "faturamento") &&
                    setoresVisiveis.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSetorSelecionado("faturamento");
                          setFiltroFilaRapida("todas");
                        }}
                        className={
                          setorSelecionado === "faturamento"
                            ? "bg-amber-50 border-amber-400 text-amber-900 font-semibold"
                            : ""
                        }
                      >
                        Contas Encaminhadas p/ Faturamento
                      </Button>
                    )}

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

                  {podeRecepcionar && (
                    <Button
                      size="sm"
                      onClick={() => setAbaPrincipal("recepcao")}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Nova Conta na Recepção
                    </Button>
                  )}
                </div>
              </div>

              {/* Atalhos Rápidos de Fila (Minhas Contas / Fila Geral / Devolvidas) */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant={filtroFilaRapida === "todas" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFiltroFilaRapida("todas")}
                >
                  Todas do Setor ({contasListaBruta.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filtroFilaRapida === "minhas" ? "default" : "outline"}
                  className="h-7 text-xs gap-1"
                  onClick={() => setFiltroFilaRapida("minhas")}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Minhas Contas (
                  {
                    contasListaBruta.filter(
                      (c: any) =>
                        meuPerfil?.usuarioId &&
                        (c.responsavelAtualId === meuPerfil.usuarioId ||
                          c.faturistaId === meuPerfil.usuarioId)
                    ).length
                  }
                  )
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filtroFilaRapida === "fila_geral" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFiltroFilaRapida("fila_geral")}
                >
                  Fila Geral Disponível (
                  {
                    contasListaBruta.filter(
                      (c: any) => !c.responsavelAtualId && c.statusSetor === "fila"
                    ).length
                  }
                  )
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={filtroFilaRapida === "devolvidas" ? "destructive" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setFiltroFilaRapida("devolvidas")}
                >
                  Devolvidas c/ Erro (
                  {contasListaBruta.filter((c: any) => c.statusSetor === "devolvido_erro").length})
                </Button>
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
                    {podeGerenciarEquipe && (
                      <Select
                        onValueChange={(val) =>
                          atribuirResponsavelMutation.mutate({
                            contaIds: selecionadas,
                            responsavelId: val === "fila_geral" ? null : Number(val),
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-52 bg-background text-xs">
                          <SelectValue placeholder="Direcionar p/ Colaborador..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fila_geral">Devolver p/ Fila Geral</SelectItem>
                          {colaboradores.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              Direcionar: {u.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
                  {setorSelecionado === "recepcao" && podeRecepcionar && (
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
                        <TableHead>Responsável / Fila</TableHead>
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
                                {conta.numeroLote && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] py-0 font-mono bg-blue-100 text-blue-800"
                                  >
                                    Lote XML: #{conta.numeroLote}
                                  </Badge>
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
                                    {!conta.arquivoXmlFinalId && !conta.arquivoXmlFaturamentoId && (
                                      <Badge
                                        variant="outline"
                                        className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] mr-1.5"
                                      >
                                        <Database className="h-2.5 w-2.5 mr-1" />
                                        Banco Hospital
                                      </Badge>
                                    )}
                                    {formatCurrency(
                                      conta.valorFaturadoFinal || conta.valorFaturadoInicial
                                    )}{" "}
                                    <span className="text-muted-foreground font-normal">
                                      ({conta.totalItensXml} itens)
                                    </span>
                                  </div>
                                  {(Boolean(
                                    conta.arquivoXmlFaturamentoId &&
                                      conta.arquivoXmlFinalId &&
                                      Number(conta.arquivoXmlFinalId) !==
                                        Number(conta.arquivoXmlFaturamentoId)
                                  ) ||
                                    (conta.qtdRetrabalhos > 0 &&
                                      conta.statusSetor !== "devolvido_erro")) && (
                                    <div className="flex flex-col gap-0.5">
                                      <Badge
                                        variant="outline"
                                        className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] w-fit"
                                      >
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        XML Corrigido pelo Faturista
                                      </Badge>
                                      {Number(conta.valorFaturadoInicial) > 0 &&
                                        Number(conta.valorFaturadoFinal) !==
                                          Number(conta.valorFaturadoInicial) && (
                                          <span className="text-[10px] text-muted-foreground">
                                            1º XML: {formatCurrency(conta.valorFaturadoInicial)} → Atual:{" "}
                                            {formatCurrency(conta.valorFaturadoFinal)}
                                          </span>
                                        )}
                                    </div>
                                  )}
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
                                  Aguardando Busca no Banco / XML
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="text-xs space-y-1">
                              <Select
                                value={
                                  conta.responsavelAtualId
                                    ? String(conta.responsavelAtualId)
                                    : "fila_geral"
                                }
                                onValueChange={(val) =>
                                  atribuirResponsavelMutation.mutate({
                                    contaIds: [conta.id],
                                    responsavelId: val === "fila_geral" ? null : Number(val),
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 w-40 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fila_geral">Fila Geral do Setor</SelectItem>
                                  {colaboradores.map((u: any) => (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                      {u.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                                {/* AÇÕES DO SETOR 2: FATURAMENTO */}
                                {conta.setorAtual === "faturamento" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={sincronizarContaBancoEsteiraMutation.isPending}
                                      onClick={() =>
                                        sincronizarContaBancoEsteiraMutation.mutate({
                                          fabricaContaId: conta.id,
                                          avancarParaAuditoriaInterna: false,
                                        })
                                      }
                                      className="h-8 gap-1 text-xs border-indigo-300 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100"
                                      title="Busca ou atualiza os itens da conta diretamente no banco de dados do hospital (sem precisar exportar XML)"
                                    >
                                      <Zap className="h-3.5 w-3.5" />
                                      {conta.totalItensXml > 0 ? "Atualizar do Banco" : "Buscar Conta no Banco"}
                                    </Button>
                                    {conta.totalItensXml > 0 && (conta.numeroContaHospital || conta.numeroGuia) && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const numRef = conta.numeroContaHospital || conta.numeroGuia;
                                            if (conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId) {
                                              setLocation(
                                                `/conta-convenio-detalhes?numeroConta=${encodeURIComponent(
                                                  numRef
                                                )}&origem=XML&sourceHospitalId=${
                                                  conta.hospitalEstabelecimentoId
                                                }&estabelecimentoId=${
                                                  conta.hospitalEstabelecimentoId
                                                }&numeroLote=${encodeURIComponent(
                                                  conta.numeroLote || ""
                                                )}&arquivoId=${
                                                  conta.arquivoXmlFinalId ||
                                                  conta.arquivoXmlFaturamentoId ||
                                                  ""
                                                }&fabricaContaId=${conta.id}`
                                              );
                                            } else {
                                              setLocation(
                                                caminhoContaFabricaBancoCliente({
                                                  estabelecimentoId: conta.hospitalEstabelecimentoId,
                                                  numeroConta: numRef,
                                                  fabricaContaId: conta.id,
                                                })
                                              );
                                            }
                                          }}
                                          className="h-8 gap-1 text-xs border-emerald-300 text-emerald-800 bg-emerald-50/60 hover:bg-emerald-100"
                                          title="Abrir itens cobrados e pré-auditoria do Motor de Regras"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                          Auditar Itens ({conta.totalItensXml})
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            transicionarMutation.mutate({
                                              contaIds: [conta.id],
                                              setorDestino: "auditoria_interna",
                                            })
                                          }
                                          className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                                          title="Concluir faturamento desta conta e enviar para Auditoria Interna"
                                        >
                                          Enviar p/ Aud. Interna
                                          <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </>
                                )}
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
                                        setArquivoXmlHonorariosFile(null);
                                        setModalXmlOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs bg-blue-600 hover:bg-blue-700"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      Importar XML (Conta + Honorários)
                                    </Button>
                                  </>
                                )}

                                {/* AÇÕES DO SETOR 3: AUDITORIA INTERNA */}
                                {/* AÇÕES DO SETOR 3: AUDITORIA INTERNA */}
                                {conta.setorAtual === "auditoria_interna" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={sincronizarContaBancoEsteiraMutation.isPending}
                                      onClick={() =>
                                        sincronizarContaBancoEsteiraMutation.mutate({
                                          fabricaContaId: conta.id,
                                          avancarParaAuditoriaInterna: false,
                                        })
                                      }
                                      className="h-8 gap-1 text-xs border-indigo-300 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100"
                                      title="Reimportar itens diretamente do banco do hospital para conferir se os ajustes foram realizados"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Atualizar do Banco
                                    </Button>
                                    {!(conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId) && (conta.numeroContaHospital || conta.numeroGuia) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setLocation(
                                            caminhoContaFabricaBancoCliente({
                                              estabelecimentoId: conta.hospitalEstabelecimentoId,
                                              numeroConta: conta.numeroContaHospital || conta.numeroGuia,
                                              fabricaContaId: conta.id,
                                            })
                                          )
                                        }
                                        className="h-8 gap-1 text-xs"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Auditar Regras (Banco)
                                      </Button>
                                    )}
                                  </>
                                )}
                                {conta.setorAtual === "auditoria_interna" && (
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
                                      variant="outline"
                                      onClick={() => {
                                        setContaAlvoXml(conta);
                                        setEtapaXml("faturamento");
                                        setArquivoXmlFile(null);
                                        setArquivoXmlHonorariosFile(null);
                                        setModalXmlOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs border-blue-200 text-blue-700"
                                      title="Anexar XML dos Honorários Médicos para ativar regras por procedimento"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      + XML Honorários
                                    </Button>
                                    {conta.numeroGuia && (conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setLocation(
                                            `/conta-convenio-detalhes?numeroConta=${encodeURIComponent(
                                              conta.numeroGuia
                                            )}&origem=XML&sourceHospitalId=${
                                              conta.hospitalEstabelecimentoId
                                            }&estabelecimentoId=${
                                              conta.hospitalEstabelecimentoId
                                            }&numeroLote=${encodeURIComponent(
                                              conta.numeroLote || ""
                                            )}&arquivoId=${
                                              conta.arquivoXmlFinalId ||
                                              conta.arquivoXmlFaturamentoId ||
                                              ""
                                            }&fabricaContaId=${conta.id}`
                                          )
                                        }
                                        className="h-8 gap-1 text-xs"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        Auditar Regras (Lote Isolado)
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
                                        setArquivoXmlHonorariosFile(null);
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
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setContaAlvoXml(conta);
                                        setEtapaXml("limpeza_final");
                                        setArquivoXmlFile(null);
                                        setArquivoXmlHonorariosFile(null);
                                        setModalXmlOpen(true);
                                      }}
                                      className="h-8 gap-1 text-xs"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      {conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId
                                        ? "Atualizar XML"
                                        : "Enviar XML ao Hospital"}
                                    </Button>
                                  )}
                                {(conta.setorAtual === "enviado_convenio" ||
                                  conta.setorAtual === "recursos") && (
                                  <>
                                    {conta.numeroGuia && (conta.arquivoXmlFinalId || conta.arquivoXmlFaturamentoId) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setLocation(
                                            `/conta-convenio-detalhes?numeroConta=${encodeURIComponent(
                                              conta.numeroGuia
                                            )}&origem=XML&sourceHospitalId=${
                                              conta.hospitalEstabelecimentoId
                                            }&estabelecimentoId=${
                                              conta.hospitalEstabelecimentoId
                                            }&numeroLote=${encodeURIComponent(
                                              conta.numeroLote || ""
                                            )}&arquivoId=${
                                              conta.arquivoXmlFinalId ||
                                              conta.arquivoXmlFaturamentoId ||
                                              ""
                                            }&fabricaContaId=${conta.id}`
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

        {/* ============================================================
            ABA 4: EQUIPE & PERMISSÕES POR SETOR / HOSPITAIS
           ============================================================ */}
        {abaPrincipal === "equipe" && podeGerenciarEquipe && (
          <Card className="shadow-sm border-t-4 border-t-primary">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    Gestão de Colaboradores por Setor & Hospital — Fábrica Safatle
                  </CardTitle>
                  <CardDescription>
                    Todos os usuários cadastrados no sistema aparecem abaixo. Ao clicar em{" "}
                    <strong>Configurar / Liberar Acesso</strong> (ou no botão em lote ao lado), o sistema libera automaticamente a Central Safatle e os hospitais selecionados para o usuário acessar as contas encaminhadas pela Recepção.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => liberarAcessoEquipeMutation.mutate()}
                  disabled={liberarAcessoEquipeMutation.isPending}
                  className="gap-2 shrink-0"
                >
                  <UserCheck className="h-4 w-4" />
                  {liberarAcessoEquipeMutation.isPending
                    ? "Liberando..."
                    : "Liberar Contas da Recepção p/ Todos os Usuários"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Função / Cargo</TableHead>
                    <TableHead>Setores Liberados na Fábrica</TableHead>
                    <TableHead>Hospitais Atendidos</TableHead>
                    <TableHead className="text-center">Contas em Curso</TableHead>
                    <TableHead className="text-center">Relatórios Gerenciais</TableHead>
                    <TableHead className="text-right">Configurar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colaboradores.map((u: any) => {
                    const setoresLabels = (u.setoresPermitidos || []).map(
                      (sid: string) =>
                        SETORES_CONFIG.find((s) => s.id === sid)?.curto || sid
                    );
                    const hospLabels =
                      !u.hospitaisPermitidos || u.hospitaisPermitidos.length === 0
                        ? ["Todos os Hospitais"]
                        : u.hospitaisPermitidos.map(
                            (hid: number) =>
                              todosHospitaisEscopo.find((h: any) => h.id === hid)?.nome ||
                              `Hospital #${hid}`
                          );
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-semibold">{u.nome}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.cargoSetor || "Operacional"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {setoresLabels.map((lbl: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">
                                {lbl}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {hospLabels.map((hl: string, idx: number) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-[10px] bg-slate-50"
                              >
                                {hl}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-blue-700">
                          {u.contasEmAndamento || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {u.verRelatoriosGerenciais ? (
                            <Badge className="bg-emerald-600 text-[10px]">Liberado</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Somente Meta Individual
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setColabAlvoPerfil(u);
                              setPerfilCargoSetor(u.cargoSetor || "Faturista");
                              setPerfilSetores(
                                Array.isArray(u.setoresPermitidos) &&
                                  u.setoresPermitidos.length > 0
                                  ? u.setoresPermitidos
                                  : ["faturamento"]
                              );
                              setPerfilHospitais(
                                Array.isArray(u.hospitaisPermitidos)
                                  ? u.hospitaisPermitidos
                                  : []
                              );
                              setPerfilVerRelatorios(Boolean(u.verRelatoriosGerenciais));
                              setModalPerfilOpen(true);
                            }}
                          >
                            Configurar / Liberar Acesso
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================================
          MODAL 1: IMPORTAR XML TISS NA CONTA (SUPORTA 2 ARQUIVOS: CONTA + HONORÁRIOS)
         ============================================================ */}
      <Dialog open={modalXmlOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoXml?.setorAtual)} onOpenChange={setModalXmlOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {etapaXml === "faturamento"
                ? "Importar XML da Conta Faturada (Conta + Honorários)"
                : "Importar XML Final Pós-Limpeza"}
            </DialogTitle>
            <DialogDescription>
              Paciente: <strong>{contaAlvoXml?.nomePaciente}</strong> • Hospital:{" "}
              <strong>{contaAlvoXml?.hospitalNome}</strong>
              {contaAlvoXml?.numeroGuia ? (
                <>
                  {" "}
                  • Guia: <strong>#{contaAlvoXml.numeroGuia}</strong>
                </>
              ) : null}
              <br />O sistema aceita <strong>2 arquivos XML</strong> (1º XML da Conta Hospitalar + 2º XML dos Honorários Médicos) para que o{" "}
              <strong>Motor de Regras e Gabaritos</strong> identifique o procedimento cirúrgico/clínico dos honorários e audite automaticamente a conta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 1º ARQUIVO: XML DA CONTA HOSPITALAR */}
            <div className="border-2 border-dashed rounded-xl p-4 text-center space-y-2 bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center justify-between text-xs font-semibold text-left px-1">
                <span className="text-primary">
                  1º Arquivo: XML da Conta Hospitalar (Internação / SADT / Despesas)
                </span>
                {contaAlvoXml?.totalItensXml > 0 && !arquivoXmlFile && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                    Já importado ({contaAlvoXml.totalItensXml} itens) — opcional substituir
                  </Badge>
                )}
              </div>
              <input
                ref={fileXmlInputRef}
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) {
                    setArquivoXmlFile(null);
                    return;
                  }
                  setArquivoXmlFile(files[0]);
                  if (files.length >= 2) {
                    setArquivoXmlHonorariosFile(files[1]);
                    toast.info(
                      "2 arquivos XML selecionados: Conta Hospitalar + Honorários Médicos!"
                    );
                  }
                }}
              />
              <FileText className="h-8 w-8 text-primary mx-auto" />
              {arquivoXmlFile ? (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
                  <span>
                    Conta: {arquivoXmlFile.name} ({Math.round(arquivoXmlFile.size / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => setArquivoXmlFile(null)}
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Selecione o XML da Conta Hospitalar (ou selecione os 2 XMLs de uma só vez)
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileXmlInputRef.current?.click()}
              >
                Escolher XML da Conta Hospitalar
              </Button>
            </div>

            {/* 2º ARQUIVO: XML DOS HONORÁRIOS MÉDICOS (CONTEXTO MÉDICO PARA MOTOR DE REGRAS) */}
            <div className="border-2 border-dashed border-blue-300 dark:border-blue-800 rounded-xl p-4 text-center space-y-2 bg-blue-50/30 dark:bg-blue-950/20">
              <div className="flex items-center justify-between text-xs font-semibold text-left px-1">
                <span className="text-blue-700 dark:text-blue-300">
                  2º Arquivo: XML dos Honorários Médicos (Ativa Regras por Procedimento / Gabarito)
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  Motor de Regras
                </Badge>
              </div>
              <input
                ref={fileXmlHonorariosInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setArquivoXmlHonorariosFile(f);
                }}
              />
              <Stethoscope className="h-8 w-8 text-blue-600 mx-auto" />
              {arquivoXmlHonorariosFile ? (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-700">
                  <span>
                    Honorários: {arquivoXmlHonorariosFile.name} (
                    {Math.round(arquivoXmlHonorariosFile.size / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => setArquivoXmlHonorariosFile(null)}
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Anexe o XML dos Honorários Médicos (SP/SADT ou Honorários) para vincular os procedimentos médicos à conta hospitalar e disparar os gabaritos do Motor de Regras
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => fileXmlHonorariosInputRef.current?.click()}
              >
                Escolher XML dos Honorários Médicos
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalXmlOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarImportacaoXml}
              disabled={
                (!arquivoXmlFile && !arquivoXmlHonorariosFile) ||
                importarXmlMutation.isPending
              }
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {importarXmlMutation.isPending
                ? "Processando XML(s) e Regras..."
                : arquivoXmlFile && arquivoXmlHonorariosFile
                  ? "Importar 2 XMLs (Conta + Honorários) e Auditar Regras"
                  : !arquivoXmlFile && arquivoXmlHonorariosFile
                    ? "Vincular XML de Honorários e Reavaliar Regras"
                    : etapaXml === "faturamento"
                      ? "Importar XML e Enviar p/ Auditoria Interna"
                      : "Salvar XML Final no Hospital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          MODAL 5: CONFIGURAR PERFIL E SETORES DO COLABORADOR
         ============================================================ */}
      <Dialog open={modalPerfilOpen && podeGerenciarEquipe} onOpenChange={setModalPerfilOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Permissões por Setor — {colabAlvoPerfil?.nome}
            </DialogTitle>
            <DialogDescription>
              Configure quais setores da Esteira de Faturamento este colaborador pode acessar e operar, mantendo sua tela focada na sua etapa e meta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Função / Cargo na Esteira de Faturamento</Label>
              <Input
                value={perfilCargoSetor}
                onChange={(e) => setPerfilCargoSetor(e.target.value)}
                placeholder="Ex: Faturista, Auditora Interna, Recepção, Limpeza..."
              />
            </div>

            <div className="space-y-2">
              <Label>Setores Liberados para este Colaborador *</Label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                {[
                  { id: "recepcao", nome: "1. Recepção de Contas" },
                  { id: "faturamento", nome: "2. Setor de Faturamento" },
                  { id: "auditoria_interna", nome: "3. Auditoria Interna" },
                  { id: "auditoria_externa", nome: "4. Auditoria Externa" },
                  { id: "limpeza_prontuario", nome: "5. Limpeza / Envio" },
                  { id: "recursos", nome: "6. Enviado / Recursos" },
                ].map((s) => {
                  const checked = perfilSetores.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-xs font-medium cursor-pointer p-1.5 rounded hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPerfilSetores([...perfilSetores, s.id]);
                          } else {
                            setPerfilSetores(perfilSetores.filter((x) => x !== s.id));
                          }
                        }}
                      />
                      {s.nome}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Hospitais Atendidos pelo Colaborador</Label>
                <span className="text-[11px] text-muted-foreground">
                  Em branco = atende todos os hospitais autorizados
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 max-h-40 overflow-y-auto">
                {todosHospitaisEscopo
                  .filter((h: any) => h.id !== 2160001)
                  .map((h: any) => {
                    const checked = perfilHospitais.includes(h.id);
                    return (
                      <label
                        key={h.id}
                        className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPerfilHospitais([...perfilHospitais, h.id]);
                            } else {
                              setPerfilHospitais(
                                perfilHospitais.filter((id) => id !== h.id)
                              );
                            }
                          }}
                        />
                        {h.nome}
                      </label>
                    );
                  })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={perfilVerRelatorios}
                onChange={(e) => setPerfilVerRelatorios(e.target.checked)}
              />
              Permitir visualizar a aba completa de Relatórios Gerenciais Safatle (Coordenador/Supervisor)
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalPerfilOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!colabAlvoPerfil) return;
                if (perfilSetores.length === 0) {
                  toast.error("Selecione pelo menos 1 setor para o colaborador.");
                  return;
                }
                salvarPerfilColaboradorMutation.mutate({
                  colaboradorId: colabAlvoPerfil.id,
                  cargoSetor: perfilCargoSetor.trim() || "Operacional",
                  setoresPermitidos: perfilSetores as any,
                  hospitaisPermitidos: perfilHospitais,
                  verRelatoriosGerenciais: perfilVerRelatorios,
                });
              }}
              disabled={salvarPerfilColaboradorMutation.isPending}
            >
              Salvar Permissões do Colaborador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================
          MODAL 2: DEVOLVER CONTA COM ERRO PARA O FATURAMENTO
         ============================================================ */}
      <Dialog open={modalErroOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoErro?.setorAtual)} onOpenChange={setModalErroOpen}>
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
      <Dialog open={modalEnvioOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoEnvio?.setorAtual)} onOpenChange={setModalEnvioOpen}>
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
      <Dialog open={modalMetaOpen && podeVerRelatorios} onOpenChange={setModalMetaOpen}>
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
