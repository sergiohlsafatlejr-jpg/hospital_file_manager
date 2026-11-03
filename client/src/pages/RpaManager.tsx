import { useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  Play,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Upload,
  FileCode2,
  Send,
  FlaskConical,
  Eye,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Hospital,
  Building2,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CredenciaisPortais from "@/components/CredenciaisPortais";

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(val || 0));
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RpaManager() {
  // Estados da Aba 1: Fila de Envio XML TISS
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [contextoHospitalUpload, setContextoHospitalUpload] =
    useState<string>("CENTRAL");
  const [arquivosTriados, setArquivosTriados] = useState<any[]>([]);
  const [filtroHospitalFila, setFiltroHospitalFila] = useState<string>("TODOS");
  const [filtroConvenioFila, setFiltroConvenioFila] = useState<string>("TODOS");
  const [filtroStatusFila, setFiltroStatusFila] = useState<string>("TODOS");
  const [loteDetalheId, setLoteDetalheId] = useState<number | null>(null);

  // Estados da Aba 3: Testador de Demonstrativos
  const [convenio, setConvenio] = useState<
    "UNIMED" | "SAUDE_CAIXA" | "IPASGO" | "CASSI"
  >("UNIMED");
  const [url, setUrl] = useState(
    "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed"
  );
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  // Queries
  const { data: estabelecimentos } = trpc.rpa.listarEstabelecimentos.useQuery();
  const { data: conveniosLista } = trpc.rpa.listarConvenios.useQuery();
  const {
    data: filaDados,
    refetch: refetchFila,
    isLoading: isLoadingFila,
  } = trpc.rpa.listarFilaEnvioXml.useQuery({
    estabelecimentoId:
      filtroHospitalFila !== "TODOS" ? Number(filtroHospitalFila) : null,
    convenioId:
      filtroConvenioFila !== "TODOS" ? Number(filtroConvenioFila) : null,
    statusEsteira: filtroStatusFila,
  });

  const { data: detalheLote, isLoading: isLoadingDetalhe } =
    trpc.rpa.obterDetalhesLoteFila.useQuery(
      { id: loteDetalheId || 0 },
      { enabled: Boolean(loteDetalheId) }
    );

  // Mutations da Fila XML
  const triagemMutation = trpc.rpa.analisarXmlTriagem.useMutation({
    onError: (err) => {
      toast.error(`Erro ao analisar XML: ${err.message}`);
    },
  });

  const importarFilaMutation = trpc.rpa.importarLotesXmlParaFila.useMutation({
    onSuccess: (res) => {
      if (res.totalImportados > 0) {
        toast.success(
          `${res.totalImportados} lote(s) XML adicionado(s) na fila do Robô!`
        );
      }
      if (res.totalRejeitados > 0) {
        for (const rej of res.rejeitados) {
          toast.error(`${rej.nomeArquivo}: ${rej.motivo}`);
        }
      }
      setArquivosTriados([]);
      refetchFila();
    },
    onError: (err) => {
      toast.error(`Erro ao enfileirar XMLs: ${err.message}`);
    },
  });

  const dispararRoboEnvioMutation = trpc.rpa.dispararCicloEnvioRpa.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      refetchFila();
    },
    onError: (err) => {
      toast.error(`Falha no ciclo do robô: ${err.message}`);
      refetchFila();
    },
  });

  const liberarLotesMutation = trpc.rpa.liberarLotesParaRobo.useMutation({
    onSuccess: (res) => {
      toast.success(res.mensagem);
      refetchFila();
    },
  });

  const excluirLoteMutation = trpc.rpa.excluirLoteFila.useMutation({
    onSuccess: () => {
      toast.success("Lote removido da fila.");
      refetchFila();
    },
  });

  // Mutation Aba 3 (Demonstrativos)
  const rpaMutation = trpc.rpa.executarRoboBuscaDemonstrativo.useMutation({
    onSuccess: (data) => {
      toast.success("Robô finalizou a execução com sucesso!");
      setResultado(data.resultado);
    },
    onError: (error) => {
      toast.error(`Erro ao executar o robô: ${error.message}`);
      setResultado({ erro: error.message });
    },
  });

  const handleSelecionarArquivosXml = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      const payload = await Promise.all(
        files.map(async (f) => ({
          nomeArquivo: f.name,
          conteudoBase64: await arquivoParaBase64(f),
        }))
      );

      const estabCtx =
        contextoHospitalUpload !== "CENTRAL"
          ? Number(contextoHospitalUpload)
          : null;

      const res = await triagemMutation.mutateAsync({
        arquivos: payload,
        estabelecimentoIdContexto: estabCtx,
      });

      const combinados = res.resultados.map((item: any, idx: number) => ({
        ...item,
        conteudoBase64: payload[idx].conteudoBase64,
        estabelecimentoIdSelecionado: item.estabelecimentoIdDetectado || "",
        convenioIdSelecionado: item.convenioIdDetectado || "",
      }));

      setArquivosTriados(combinados);
      toast.info(
        `${combinados.length} arquivo(s) XML lido(s) pelo cabeçalho TISS.`
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmarImportacaoFila = (liberarImediatamente: boolean) => {
    const validos = arquivosTriados.filter(
      (a) => a.valido && !a.conflitoHospital
    );
    if (!validos.length) {
      toast.error(
        "Não há arquivos XML válidos sem conflito de hospital para enfileirar."
      );
      return;
    }

    importarFilaMutation.mutate({
      estabelecimentoIdContexto:
        contextoHospitalUpload !== "CENTRAL"
          ? Number(contextoHospitalUpload)
          : null,
      liberarImediatamente,
      arquivos: validos.map((a) => ({
        nomeArquivo: a.nomeArquivo,
        conteudoBase64: a.conteudoBase64,
        estabelecimentoIdOverride: a.estabelecimentoIdSelecionado
          ? Number(a.estabelecimentoIdSelecionado)
          : null,
        convenioIdOverride: a.convenioIdSelecionado
          ? Number(a.convenioIdSelecionado)
          : null,
      })),
    });
  };

  const handleExecutarDemonstrativo = () => {
    if (!url) {
      toast.error("Por favor, insira a URL do portal.");
      return;
    }
    setResultado(null);
    rpaMutation.mutate({
      convenioNome: convenio,
      url,
      login,
      senha,
    });
  };

  const handleConvenioChange = (
    value: "UNIMED" | "SAUDE_CAIXA" | "IPASGO" | "CASSI"
  ) => {
    setConvenio(value);
    if (value === "UNIMED") {
      setUrl("https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed");
    } else if (value === "IPASGO") {
      setUrl(
        "https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx"
      );
    } else if (value === "CASSI") {
      setUrl(
        "https://servicosonline.cassi.com.br/GASC/v2/Usuario/Login/Participante"
      );
    } else {
      setUrl("https://autenticacao.saude.caixa.gov.br/");
    }
  };

  const renderBadgeStatusFila = (status: string) => {
    switch (status) {
      case "PROTOCOLADO":
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
            PROTOCOLADO
          </Badge>
        );
      case "SIMULADO_OK":
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white">
            SIMULAÇÃO OK (DRY-RUN)
          </Badge>
        );
      case "LIBERADO_ENVIO":
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-800 border-amber-300"
          >
            NA FILA DO ROBÔ
          </Badge>
        );
      case "PROCESSANDO_ROBO":
        return (
          <Badge className="bg-purple-600 text-white animate-pulse">
            ENVIANDO NO PORTAL...
          </Badge>
        );
      case "ERRO_CREDENCIAL":
        return <Badge variant="destructive">ERRO CREDENCIAL / SENHA</Badge>;
      case "ERRO_PORTAL":
        return <Badge variant="destructive">CRÍTICA PORTAL</Badge>;
      case "ERRO_ROBO":
        return <Badge variant="destructive">ERRO TÉCNICO ROBÔ</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const resumo = filaDados?.resumo || {
    totalLotes: 0,
    aguardandoLiberacao: 0,
    naFilaRobo: 0,
    simuladosOk: 0,
    protocolados: 0,
    comErro: 0,
    valorTotalFila: 0,
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                RPA Central & Esteira de Envio XML
              </h1>
              <p className="text-muted-foreground mt-0.5">
                Triagem automática pelo cabeçalho TISS, Cofre Multi-Hospital
                (AES-256) e disparo agrupado por sessão.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="envio_xml" className="w-full">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="envio_xml" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Fila de Envio de Contas (XML TISS)
            </TabsTrigger>
            <TabsTrigger value="cofre" className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Cofre de Senhas Multi-Hospital
            </TabsTrigger>
            <TabsTrigger value="testador" className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Robôs de Demonstrativos
            </TabsTrigger>
          </TabsList>

          {/* ================================================================= */}
          {/* ABA 1: FILA DE ENVIO AUTOMÁTICO DE CONTAS (XML TISS)              */}
          {/* ================================================================= */}
          <TabsContent value="envio_xml" className="space-y-6 mt-0">
            {/* KPIs da Fila */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">
                  Total de Lotes
                </div>
                <div className="text-2xl font-bold mt-1">
                  {resumo.totalLotes}
                </div>
              </Card>
              <Card className="p-3 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="text-xs text-amber-700 font-medium">
                  Na Fila do Robô
                </div>
                <div className="text-2xl font-bold text-amber-800 mt-1">
                  {resumo.naFilaRobo}
                </div>
              </Card>
              <Card className="p-3 border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
                <div className="text-xs text-blue-700 font-medium">
                  Simulados (Dry-Run)
                </div>
                <div className="text-2xl font-bold text-blue-800 mt-1">
                  {resumo.simuladosOk}
                </div>
              </Card>
              <Card className="p-3 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
                <div className="text-xs text-emerald-700 font-medium">
                  Protocolados
                </div>
                <div className="text-2xl font-bold text-emerald-800 mt-1">
                  {resumo.protocolados}
                </div>
              </Card>
              <Card className="p-3 border-red-200 bg-red-50/40 dark:bg-red-950/20">
                <div className="text-xs text-red-700 font-medium">
                  Críticas / Erros
                </div>
                <div className="text-2xl font-bold text-red-700 mt-1">
                  {resumo.comErro}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">
                  Valor Total na Fila
                </div>
                <div className="text-lg font-bold text-primary mt-1 truncate">
                  {formatCurrency(resumo.valorTotalFila)}
                </div>
              </Card>
            </div>

            {/* Hub de Entrada e Triagem Automática pelo Cabeçalho XML */}
            <Card className="border-t-4 border-t-primary">
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Layers className="w-5 h-5 text-primary" />
                      1. Mesa Centralizadora — Upload e Triagem Automática de
                      XML TISS
                    </CardTitle>
                    <CardDescription>
                      Solte 1 ou dezenas de XMLs de qualquer hospital. O sistema
                      lê as tags {"<ans:origem>"} e {"<ans:destino>"}, descobre
                      o Hospital e o Convênio sozinho e bloqueia erros de
                      estabelecimento trocado.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-72">
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">
                        Modo de Operação / Trava de Hospital:
                      </label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={contextoHospitalUpload}
                        onChange={(e) =>
                          setContextoHospitalUpload(e.target.value)
                        }
                      >
                        <option value="CENTRAL">
                          🌐 Hub Central Safatle (Auto-Identificar Hospital)
                        </option>
                        {estabelecimentos?.map((e: any) => (
                          <option key={e.id} value={String(e.id)}>
                            🔒 Travar no Hospital: {e.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      multiple
                      className="hidden"
                      onChange={handleSelecionarArquivosXml}
                    />
                    <Button
                      className="mt-5"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={triagemMutation.isPending}
                    >
                      {triagemMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Selecionar XML(s) TISS
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {arquivosTriados.length > 0 && (
                <CardContent className="space-y-4 pt-2">
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-slate-900">
                        <TableRow>
                          <TableHead>Arquivo XML / Lote</TableHead>
                          <TableHead>Origem Lida no XML</TableHead>
                          <TableHead>Destino ANS</TableHead>
                          <TableHead>Hospital Identificado</TableHead>
                          <TableHead>Convênio Identificado</TableHead>
                          <TableHead className="text-center">
                            Guias / Itens
                          </TableHead>
                          <TableHead className="text-right">
                            Valor Lote
                          </TableHead>
                          <TableHead>Validação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arquivosTriados.map((arq, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileCode2 className="w-4 h-4 text-primary shrink-0" />
                                <div>
                                  <div className="font-medium text-sm">
                                    {arq.nomeArquivo}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono">
                                    Lote: {arq.numeroLote || "N/A"} • TISS{" "}
                                    {arq.versaoTiss || "3.xx"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              <div>
                                Cód: {arq.codigoPrestadorXml || "—"}
                              </div>
                              {arq.cnpjPrestadorXml && (
                                <div className="text-muted-foreground">
                                  CNPJ: {arq.cnpjPrestadorXml}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {arq.registroAns || "—"}
                            </TableCell>
                            <TableCell>
                              <select
                                className="flex h-8 w-full rounded border border-input bg-background px-2 text-xs"
                                value={arq.estabelecimentoIdSelecionado}
                                onChange={(e) => {
                                  const copia = [...arquivosTriados];
                                  copia[idx].estabelecimentoIdSelecionado =
                                    e.target.value;
                                  copia[idx].conflitoHospital = false;
                                  setArquivosTriados(copia);
                                }}
                              >
                                <option value="">
                                  Selecione o Hospital...
                                </option>
                                {estabelecimentos?.map((est: any) => (
                                  <option key={est.id} value={est.id}>
                                    {est.nome}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell>
                              <select
                                className="flex h-8 w-full rounded border border-input bg-background px-2 text-xs"
                                value={arq.convenioIdSelecionado}
                                onChange={(e) => {
                                  const copia = [...arquivosTriados];
                                  copia[idx].convenioIdSelecionado =
                                    e.target.value;
                                  setArquivosTriados(copia);
                                }}
                              >
                                <option value="">
                                  Selecione o Convênio...
                                </option>
                                {conveniosLista?.map((conv: any) => (
                                  <option key={conv.id} value={conv.id}>
                                    {conv.nome}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="text-center text-xs font-mono">
                              {arq.qtdGuias} guia(s) / {arq.qtdItens} it.
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-sm">
                              {formatCurrency(arq.valorTotal)}
                            </TableCell>
                            <TableCell>
                              {arq.conflitoHospital ? (
                                <div className="flex flex-col gap-1">
                                  <Badge
                                    variant="destructive"
                                    className="text-[11px] flex items-center gap-1 w-fit"
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    TRAVA HOSPITAL
                                  </Badge>
                                  <span className="text-[11px] text-red-600 leading-tight">
                                    {arq.mensagemConflito}
                                  </span>
                                </div>
                              ) : arq.estabelecimentoIdDetectado &&
                                arq.convenioIdDetectado ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs"
                                >
                                  Auto-Roteado OK
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                >
                                  Confirme Hospital/Convênio
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setArquivosTriados([])}
                    >
                      Limpar Seleção
                    </Button>
                    <Button
                      onClick={() => handleConfirmarImportacaoFila(true)}
                      disabled={importarFilaMutation.isPending}
                    >
                      {importarFilaMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Colocar Todos na Fila do Robô ({arquivosTriados.length})
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Painel da Fila de Envio e Disparo do Robô (Simulação vs Produção) */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bot className="w-5 h-5 text-primary" />
                      2. Fila de Disparo por Sessão (Hospital × Convênio)
                    </CardTitle>
                    <CardDescription>
                      O robô agrupa todos os lotes do mesmo Hospital e Convênio,
                      faz 1 único login, envia em loop e captura os protocolos.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchFila()}
                    >
                      <RefreshCw className="w-4 h-4 mr-1.5" />
                      Atualizar
                    </Button>

                    <Button
                      variant="secondary"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={dispararRoboEnvioMutation.isPending}
                      onClick={() =>
                        dispararRoboEnvioMutation.mutate({
                          modoExecucao: "simulacao",
                          estabelecimentoIdFiltro:
                            filtroHospitalFila !== "TODOS"
                              ? Number(filtroHospitalFila)
                              : null,
                          convenioIdFiltro:
                            filtroConvenioFila !== "TODOS"
                              ? Number(filtroConvenioFila)
                              : null,
                        })
                      }
                    >
                      {dispararRoboEnvioMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FlaskConical className="w-4 h-4 mr-2" />
                      )}
                      Validar em Simulação (Dry-Run)
                    </Button>

                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={dispararRoboEnvioMutation.isPending}
                      onClick={() =>
                        dispararRoboEnvioMutation.mutate({
                          modoExecucao: "producao",
                          estabelecimentoIdFiltro:
                            filtroHospitalFila !== "TODOS"
                              ? Number(filtroHospitalFila)
                              : null,
                          convenioIdFiltro:
                            filtroConvenioFila !== "TODOS"
                              ? Number(filtroConvenioFila)
                              : null,
                        })
                      }
                    >
                      {dispararRoboEnvioMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Disparar Envio Real (Produção)
                    </Button>
                  </div>
                </div>

                {/* Filtros da Fila */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={filtroHospitalFila}
                    onChange={(e) => setFiltroHospitalFila(e.target.value)}
                  >
                    <option value="TODOS">Todos os Hospitais</option>
                    {estabelecimentos?.map((e: any) => (
                      <option key={e.id} value={String(e.id)}>
                        {e.nome}
                      </option>
                    ))}
                  </select>

                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={filtroConvenioFila}
                    onChange={(e) => setFiltroConvenioFila(e.target.value)}
                  >
                    <option value="TODOS">Todos os Convênios</option>
                    {conveniosLista?.map((c: any) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nome}
                      </option>
                    ))}
                  </select>

                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={filtroStatusFila}
                    onChange={(e) => setFiltroStatusFila(e.target.value)}
                  >
                    <option value="TODOS">Todos os Status</option>
                    <option value="LIBERADO_ENVIO">Na Fila do Robô</option>
                    <option value="SIMULADO_OK">Simulados OK (Dry-Run)</option>
                    <option value="PROTOCOLADO">Protocolados</option>
                    <option value="ERRO_PORTAL">Crítica / Erro Portal</option>
                    <option value="ERRO_CREDENCIAL">Erro de Senha</option>
                  </select>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID / Lote TISS</TableHead>
                      <TableHead>Hospital (Estabelecimento)</TableHead>
                      <TableHead>Convênio / ANS</TableHead>
                      <TableHead className="text-center">Guias</TableHead>
                      <TableHead className="text-right">Valor Lote</TableHead>
                      <TableHead>Status Esteira</TableHead>
                      <TableHead>Protocolo / Retorno do Portal</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingFila ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          Carregando fila de envio XML...
                        </TableCell>
                      </TableRow>
                    ) : !filaDados?.itens?.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-10 text-muted-foreground"
                        >
                          Nenhum lote XML na fila. Selecione arquivos XML no
                          card acima para iniciar os testes de triagem e envio.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filaDados.itens.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-mono font-bold text-sm">
                              Lote #{item.numeroLote}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {item.nomeArquivo}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 font-medium text-sm">
                              <Hospital className="w-4 h-4 text-primary shrink-0" />
                              {item.estabelecimentoNome ||
                                `Hospital #${item.estabelecimentoId}`}
                            </div>
                            {item.codigoPrestadorXml && (
                              <div className="text-xs text-muted-foreground font-mono">
                                Prestador: {item.codigoPrestadorXml}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 font-medium text-sm">
                              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                              {item.convenioNome ||
                                `Convênio #${item.convenioId}`}
                            </div>
                            {item.registroAns && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ANS: {item.registroAns}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {item.qtdGuias} guia(s)
                            <div className="text-muted-foreground">
                              {item.qtdItens} itens
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-sm">
                            {formatCurrency(item.valorTotal)}
                          </TableCell>
                          <TableCell>
                            {renderBadgeStatusFila(item.statusEsteira)}
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            {item.protocoloRetorno && (
                              <div className="font-mono text-xs font-bold text-emerald-700">
                                Prot: {item.protocoloRetorno}
                              </div>
                            )}
                            {item.mensagemPortal ? (
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {item.mensagemPortal}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Aguardando execução do robô
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                title="Ver Print do Portal e Guias do Lote"
                                onClick={() => setLoteDetalheId(item.id)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Print / Guias
                              </Button>

                              {item.statusEsteira !== "LIBERADO_ENVIO" &&
                                item.statusEsteira !== "PROTOCOLADO" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Reenfileirar para o Robô"
                                    onClick={() =>
                                      liberarLotesMutation.mutate({
                                        loteIds: [item.id],
                                      })
                                    }
                                  >
                                    <RefreshCw className="w-4 h-4 text-blue-600" />
                                  </Button>
                                )}

                              {item.statusEsteira !== "PROTOCOLADO" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Remover da fila"
                                  onClick={() =>
                                    excluirLoteMutation.mutate({ id: item.id })
                                  }
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================================================================= */}
          {/* ABA 2: COFRE DE SENHAS MULTI-HOSPITAL                             */}
          {/* ================================================================= */}
          <TabsContent value="cofre" className="mt-0">
            <CredenciaisPortais />
          </TabsContent>

          {/* ================================================================= */}
          {/* ABA 3: TESTADOR DE BUSCA DE DEMONSTRATIVOS                        */}
          {/* ================================================================= */}
          <TabsContent value="testador" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-t-4 border-t-primary shadow-md">
                <CardHeader>
                  <CardTitle>
                    Busca Automática de Demonstrativos (Retorno)
                  </CardTitle>
                  <CardDescription>
                    Dispare o robô para baixar demonstrativos de pagamento e
                    injetar na conciliação.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Convênio Alvo</label>
                    <Select
                      value={convenio}
                      onValueChange={handleConvenioChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNIMED">
                          Unimed (Goiânia / FESP / Central)
                        </SelectItem>
                        <SelectItem value="IPASGO">IPASGO (WebPlan)</SelectItem>
                        <SelectItem value="CASSI">CASSI</SelectItem>
                        <SelectItem value="SAUDE_CAIXA">Saúde Caixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL do Portal</label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Usuário (Opcional — usa Cofre)
                      </label>
                      <Input
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        placeholder="Login do prestador"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Senha (Opcional — usa Cofre)
                      </label>
                      <Input
                        type="password"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Senha do prestador"
                      />
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex gap-3 text-sm text-amber-600 mt-4">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <p>
                      <strong>Aviso:</strong> Se deixar usuário/senha em branco,
                      o robô descriptografa automaticamente a credencial ativa
                      no Cofre.
                    </p>
                  </div>

                  <Button
                    className="w-full mt-2"
                    size="lg"
                    onClick={handleExecutarDemonstrativo}
                    disabled={rpaMutation.isPending}
                  >
                    {rpaMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Executando Robô...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Disparar Busca de Demonstrativos
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
                <CardHeader>
                  <CardTitle>Console de Execução</CardTitle>
                  <CardDescription>
                    Resultado devolvido pelo robô após a execução.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {rpaMutation.isPending ? (
                    <div className="flex flex-col items-center justify-center h-48 space-y-4 text-muted-foreground">
                      <div className="relative">
                        <Bot className="w-12 h-12 animate-pulse text-primary/50" />
                        <Loader2 className="w-6 h-6 animate-spin absolute -bottom-2 -right-2 text-primary" />
                      </div>
                      <p className="text-sm">
                        O robô está navegando no portal...
                      </p>
                    </div>
                  ) : resultado ? (
                    <div className="space-y-4">
                      {resultado.erro ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 text-sm font-mono break-all">
                          <p className="font-bold mb-1">ERRO FATAL:</p>
                          {resultado.erro}
                        </div>
                      ) : (
                        <>
                          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-700 dark:text-green-400">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="w-5 h-5" />
                              <span className="font-bold">
                                Robô executado com sucesso
                              </span>
                            </div>
                            <p className="text-sm">{resultado.mensagem}</p>
                          </div>

                          <div className="space-y-2 text-sm bg-background p-4 rounded-lg border shadow-sm">
                            <div className="grid grid-cols-[120px_1fr] gap-2 border-b pb-2">
                              <span className="font-semibold text-muted-foreground">
                                Pasta destino:
                              </span>
                              <span className="font-mono text-xs break-all">
                                {resultado.pastaDownload}
                              </span>
                            </div>
                            <div className="grid grid-cols-[120px_1fr] gap-2 pt-2">
                              <span className="font-semibold text-muted-foreground">
                                Arquivos baixados:
                              </span>
                              <span className="font-mono font-bold">
                                {resultado.arquivosBaixados}
                              </span>
                            </div>
                            {resultado.screenshotBase64 && (
                              <div className="pt-3 border-t mt-2">
                                <span className="font-semibold text-muted-foreground block mb-2">
                                  Print da Tela do Portal:
                                </span>
                                <img
                                  src={resultado.screenshotBase64}
                                  alt="Evidência Portal"
                                  className="rounded border max-h-64 w-auto object-contain"
                                />
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/50 border-2 border-dashed border-muted rounded-xl bg-muted/10">
                      <Bot className="w-12 h-12 mb-2 opacity-50" />
                      <p className="text-sm text-center px-6">
                        Aguardando disparo do robô.
                        <br />O resultado aparecerá aqui.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Modal de Evidência / Print do Portal + Guias do Lote XML */}
        <Dialog
          open={Boolean(loteDetalheId)}
          onOpenChange={(open) => !open && setLoteDetalheId(null)}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Detalhes do Lote XML #{detalheLote?.numeroLote || loteDetalheId}
              </DialogTitle>
              <DialogDescription>
                {detalheLote?.estabelecimentoNome} • {detalheLote?.convenioNome}{" "}
                • Arquivo: {detalheLote?.nomeArquivo}
              </DialogDescription>
            </DialogHeader>

            {isLoadingDetalhe ? (
              <div className="py-10 text-center text-muted-foreground">
                Carregando evidências e guias do lote...
              </div>
            ) : detalheLote ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      Status
                    </span>
                    <div className="mt-1">
                      {renderBadgeStatusFila(detalheLote.statusEsteira)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      Protocolo / Retorno
                    </span>
                    <span className="font-mono font-bold">
                      {detalheLote.protocoloRetorno || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      Cód. Prestador / ANS
                    </span>
                    <span className="font-mono text-xs">
                      {detalheLote.codigoPrestadorXml || "—"} / ANS{" "}
                      {detalheLote.registroAns || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      Valor Total ({detalheLote.qtdGuias} guias)
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {formatCurrency(detalheLote.valorTotal)}
                    </span>
                  </div>
                </div>

                {detalheLote.mensagemPortal && (
                  <div className="p-3 rounded-lg border bg-muted/40 text-sm">
                    <span className="font-semibold block mb-1">
                      Mensagem do Robô / Portal:
                    </span>
                    {detalheLote.mensagemPortal}
                  </div>
                )}

                {detalheLote.screenshotBase64 ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      Screenshot de Evidência Capturado no Portal:
                    </h4>
                    <div className="border rounded-lg overflow-hidden bg-black/5 p-2">
                      <img
                        src={detalheLote.screenshotBase64}
                        alt="Screenshot Portal"
                        className="w-full h-auto rounded border"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border border-dashed rounded-lg text-center text-sm text-muted-foreground">
                    Nenhum screenshot capturado ainda para este lote. Clique em{" "}
                    <strong>Validar em Simulação (Dry-Run)</strong> ou{" "}
                    <strong>Disparar Envio Real</strong> para o robô navegar até
                    o portal e registrar o print da tela.
                  </div>
                )}

                {detalheLote.resumoGuias?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      Guias Identificadas Dentro do Arquivo XML (
                      {detalheLote.resumoGuias.length}):
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nº Guia</TableHead>
                            <TableHead>Paciente / Beneficiário</TableHead>
                            <TableHead>Senha</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead className="text-right">
                              Valor Guia
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detalheLote.resumoGuias.map(
                            (g: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-xs font-semibold">
                                  {g.numeroGuia}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {g.pacienteNome}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {g.senha || "—"}
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs">
                                  {g.qtdItens}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs font-semibold">
                                  {formatCurrency(g.valorTotal)}
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
