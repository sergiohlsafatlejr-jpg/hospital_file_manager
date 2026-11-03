import { useState, useRef, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Send,
  Search,
  FileText,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Eye,
  RefreshCw,
  Layers,
  CheckCheck,
  Sparkles,
} from "lucide-react";

interface EsteiraAmbulatorialPanelProps {
  hospitais: Array<{ id: number; nome: string; cnpj?: string | null; cnes?: string | null }>;
  convenios: Array<{
    id: number;
    nome: string;
    codigo?: string | null;
    registroAns?: string | null;
    estabelecimentoId?: number | null;
  }>;
  hospitalFiltroGlobal: string;
  convenioFiltroGlobal: string;
  onRecarregarEsteiraGeral?: () => void;
}

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

export default function EsteiraAmbulatorialPanel({
  hospitais,
  convenios,
  hospitalFiltroGlobal,
  convenioFiltroGlobal,
  onRecarregarEsteiraGeral,
}: EsteiraAmbulatorialPanelProps) {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado do Importador de Lote XML Ambulatorial
  const hospitaisValidos = useMemo(
    () => hospitais.filter((h) => h.id !== 2160001),
    [hospitais]
  );
  const [impHospitalId, setImpHospitalId] = useState<string>(
    hospitalFiltroGlobal !== "todos"
      ? hospitalFiltroGlobal
      : hospitaisValidos[0]
        ? String(hospitaisValidos[0].id)
        : ""
  );
  const [impConvenioId, setImpConvenioId] = useState<string>("auto");
  const [impNumeroLoteManual, setImpNumeroLoteManual] = useState<string>("");
  const [impEnviarDireto, setImpEnviarDireto] = useState<boolean>(true);
  const [impExigirSenhaSadt, setImpExigirSenhaSadt] = useState<boolean>(false);
  const [impMetodoEnvio, setImpMetodoEnvio] = useState<
    "rpa_portal" | "webservice_tiss" | "manual"
  >("rpa_portal");
  const [impProtocoloManual, setImpProtocoloManual] = useState<string>("");
  const [arquivoXmlLote, setArquivoXmlLote] = useState<File | null>(null);
  const [ultimoResultadoImportacao, setUltimoResultadoImportacao] = useState<any | null>(null);

  // Filtros da Esteira Ambulatorial
  const [loteSelecionado, setLoteSelecionado] = useState<string>("todos");
  const [filtroConformidade, setFiltroConformidade] = useState<
    "todas" | "divergentes" | "conformes" | "revisadas" | "enviadas"
  >("todas");
  const [buscaGuia, setBuscaGuia] = useState<string>("");
  const [guiasSelecionadas, setGuiasSelecionadas] = useState<number[]>([]);

  // Modal de Justificativa / Liberação de Divergência
  const [modalJustificativaOpen, setModalJustificativaOpen] = useState<boolean>(false);
  const [contasAlvoJustificativa, setContasAlvoJustificativa] = useState<number[]>([]);
  const [textoJustificativa, setTextoJustificativa] = useState<string>("");
  const [enviarAposJustificar, setEnviarAposJustificar] = useState<boolean>(true);
  const [protocoloLiberacao, setProtocoloLiberacao] = useState<string>("");

  const hospitalQueryId =
    hospitalFiltroGlobal !== "todos" ? Number(hospitalFiltroGlobal) : undefined;
  const convenioQueryId =
    convenioFiltroGlobal !== "todos" ? Number(convenioFiltroGlobal) : undefined;

  // Query 1: Resumo dos Lotes Ambulatoriais
  const {
    data: resumoLotesData,
    isLoading: loadingLotes,
    refetch: refetchLotes,
  } = trpc.fabricaFaturamento.resumoLotesAmbulatoriais.useQuery({
    hospitalEstabelecimentoId: hospitalQueryId,
    convenioId: convenioQueryId,
  });

  // Query 2: Listagem de Guias Ambulatoriais (cada guia = 1 conta em fabrica_contas)
  const {
    data: guiasData,
    isLoading: loadingGuias,
    refetch: refetchGuias,
  } = trpc.fabricaFaturamento.listarContas.useQuery({
    tipoAtendimento: "ambulatorio_sadt",
    hospitalEstabelecimentoId: hospitalQueryId,
    convenioId: convenioQueryId,
    numeroLote: loteSelecionado !== "todos" ? loteSelecionado : undefined,
    setorAtual: filtroConformidade === "enviadas" ? "enviado_convenio" : undefined,
    statusAuditoriaRegras:
      filtroConformidade === "divergentes"
        ? "divergente"
        : filtroConformidade === "conformes"
          ? "conforme"
          : filtroConformidade === "revisadas"
            ? "revisado"
            : undefined,
    apenasComDivergencia: filtroConformidade === "divergentes" ? true : undefined,
    search: buscaGuia.trim() || undefined,
    page: 1,
    pageSize: 300,
  });

  const recarregarTudoAmbulatorial = () => {
    refetchLotes();
    refetchGuias();
    setGuiasSelecionadas([]);
    onRecarregarEsteiraGeral?.();
  };

  // Mutation 1: Importar Lote XML Ambulatorial
  const importarLoteMutation =
    trpc.fabricaFaturamento.importarLoteAmbulatorialXml.useMutation({
      onSuccess: (res) => {
        setUltimoResultadoImportacao(res);
        setArquivoXmlLote(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setLoteSelecionado(res.numeroLote);
        if (res.guiasDivergentes > 0) {
          setFiltroConformidade("divergentes");
          toast.warning(res.mensagem);
        } else {
          setFiltroConformidade("todas");
          toast.success(res.mensagem);
        }
        recarregarTudoAmbulatorial();
      },
      onError: (err) => toast.error(err.message),
    });

  // Mutation 2: Justificar Divergências e Liberar
  const justificarMutation =
    trpc.fabricaFaturamento.justificarELiberarGuiasAmbulatoriais.useMutation({
      onSuccess: (res) => {
        toast.success(res.mensagem);
        setModalJustificativaOpen(false);
        setTextoJustificativa("");
        setContasAlvoJustificativa([]);
        setFiltroConformidade("todas");
        recarregarTudoAmbulatorial();
      },
      onError: (err) => toast.error(err.message),
    });

  // Mutation 3: Liberar Lote Inteiro para Envio ao Convênio
  const liberarLoteMutation =
    trpc.fabricaFaturamento.liberarLoteAmbulatorialEnvio.useMutation({
      onSuccess: (res) => {
        toast.success(res.mensagem);
        recarregarTudoAmbulatorial();
      },
      onError: (err) => toast.error(err.message),
    });

  const fileToBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleImportarLoteXml = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!impHospitalId) {
      toast.error("Selecione o Hospital (Estabelecimento) do lote ambulatorial.");
      return;
    }
    if (!arquivoXmlLote) {
      toast.error("Selecione o arquivo XML do lote ambulatorial.");
      return;
    }
    const base64 = await fileToBase64(arquivoXmlLote);
    const convSelecionado =
      impConvenioId && impConvenioId !== "auto"
        ? convenios.find((c) => String(c.id) === impConvenioId)
        : null;

    importarLoteMutation.mutate({
      hospitalEstabelecimentoId: Number(impHospitalId),
      convenioId: convSelecionado ? Number(convSelecionado.id) : null,
      convenioNome: convSelecionado ? convSelecionado.nome : null,
      nomeArquivo: arquivoXmlLote.name,
      conteudoBase64: base64,
      numeroLoteManual: impNumeroLoteManual.trim() || null,
      enviarDiretoSeConforme: impEnviarDireto,
      exigirSenhaSadt: impExigirSenhaSadt,
      metodoEnvioConvenio: impMetodoEnvio,
      protocoloEnvio: impProtocoloManual.trim() || null,
    });
  };

  const handleAbrirJustificativa = (ids: number[]) => {
    if (!ids.length) {
      toast.error("Selecione pelo menos uma guia com divergência.");
      return;
    }
    setContasAlvoJustificativa(ids);
    setTextoJustificativa("");
    setEnviarAposJustificar(true);
    setModalJustificativaOpen(true);
  };

  const handleConfirmarJustificativa = () => {
    if (!textoJustificativa.trim() || textoJustificativa.trim().length < 3) {
      toast.error("Informe a justificativa técnica/contratual para aceitar a divergência.");
      return;
    }
    justificarMutation.mutate({
      contaIds: contasAlvoJustificativa,
      justificativa: textoJustificativa.trim(),
      enviarAoConvenioAgora: enviarAposJustificar,
      metodoEnvioConvenio: impMetodoEnvio,
      protocoloEnvio: protocoloLiberacao.trim() || null,
    });
  };

  const lotes = resumoLotesData?.lotes || [];
  const guias = guiasData?.contas || [];

  const conveniosDoHospitalImportacao = useMemo(() => {
    if (!impHospitalId) return convenios;
    return convenios.filter(
      (c) =>
        !c.estabelecimentoId || Number(c.estabelecimentoId) === Number(impHospitalId)
    );
  }, [convenios, impHospitalId]);

  const guiasDivergentesVisiveis = useMemo(
    () => guias.filter((g: any) => g.statusAuditoriaRegras === "divergente"),
    [guias]
  );

  return (
    <div className="space-y-6">
      {/* ============================================================
          1. PAINEL DE IMPORTAÇÃO DE LOTE XML AMBULATORIAL + REGRAS
         ============================================================ */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-t-4 border-t-indigo-600 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-600" />
                Setor Faturamento Ambulatorial — Importação de Lote XML (SADT / Consultas)
              </CardTitle>
              <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300">
                Auto-Recepção em Lote • Sem digitação na Recepção
              </Badge>
            </div>
            <CardDescription>
              Importe o arquivo XML com múltiplas guias ambulatoriais. O sistema cria cada guia como uma conta separada, valida <strong>Tabela de Preços</strong>, <strong>Gabaritos/Regras</strong> e <strong>Campos TISS</strong>, e se estiver 100% OK já envia direto para <strong>Enviado ao Convênio</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleImportarLoteXml} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Hospital (Estabelecimento) *</Label>
                  <Select value={impHospitalId} onValueChange={setImpHospitalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o hospital..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitaisValidos.map((h) => (
                        <SelectItem key={h.id} value={String(h.id)}>
                          {h.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Convênio</Label>
                  <Select value={impConvenioId} onValueChange={setImpConvenioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Detectar pelo Registro ANS..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Detectar automático pelo XML (Registro ANS)
                      </SelectItem>
                      {conveniosDoHospitalImportacao.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Nº do Lote (Opcional)</Label>
                  <Input
                    value={impNumeroLoteManual}
                    onChange={(e) => setImpNumeroLoteManual(e.target.value)}
                    placeholder="Extraído automático do XML..."
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label>Arquivo XML do Lote Ambulatorial (Múltiplas Guias) *</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    onChange={(e) => setArquivoXmlLote(e.target.files?.[0] || null)}
                    className="cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Canal de Envio ao Convênio (quando 100% OK)</Label>
                  <Select
                    value={impMetodoEnvio}
                    onValueChange={(v: any) => setImpMetodoEnvio(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rpa_portal">
                        Robô RPA Portal do Convênio
                      </SelectItem>
                      <SelectItem value="webservice_tiss">
                        Webservice TISS ANS
                      </SelectItem>
                      <SelectItem value="manual">
                        Protocolo Manual no Portal
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={impEnviarDireto}
                      onChange={(e) => setImpEnviarDireto(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span>
                      <strong>Fast-Track:</strong> Se 100% das guias passarem nas regras do convênio, avançar direto para <strong>Enviado ao Convênio</strong>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={impExigirSenhaSadt}
                      onChange={(e) => setImpExigirSenhaSadt(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    Exigir senha de autorização em todas as guias SADT
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  disabled={importarLoteMutation.isPending}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6"
                >
                  <Upload className="h-4 w-4" />
                  {importarLoteMutation.isPending
                    ? "Desmembrando Guias e Validando Regras..."
                    : "Importar Lote XML e Validar Regras do Convênio"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Card Lateral: Validador Triplo de Regras Ambulatoriais */}
        <Card className="border-t-4 border-t-emerald-600 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Motor de Regras Ambulatorial (3 Camadas)
            </CardTitle>
            <CardDescription>
              Verificações executadas em cada guia do XML importado:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-2.5 rounded-lg border bg-muted/40 space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  1
                </Badge>
                Tabela de Preços Contratual
              </div>
              <p className="text-muted-foreground">
                Compara o valor unitário cobrado em cada exame/procedimento/mat/med do XML com a tabela vigente do convênio.
              </p>
            </div>

            <div className="p-2.5 rounded-lg border bg-muted/40 space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  2
                </Badge>
                Gabaritos e Regras de Cobrança
              </div>
              <p className="text-muted-foreground">
                Verifica itens obrigatórios faltantes, códigos incompatíveis/proibidos e limites de quantidade por procedimento.
              </p>
            </div>

            <div className="p-2.5 rounded-lg border bg-muted/40 space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  3
                </Badge>
                Campos Obrigatórios TISS
              </div>
              <p className="text-muted-foreground">
                Valida carteirinha do beneficiário, senha de autorização SADT, CRM/prestador executante e itens com valor zerado.
              </p>
            </div>

            {ultimoResultadoImportacao && (
              <div
                className={`p-3 rounded-lg border ${
                  ultimoResultadoImportacao.guiasDivergentes > 0
                    ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    : "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                }`}
              >
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>Último Lote: #{ultimoResultadoImportacao.numeroLote}</span>
                  <span>{formatCurrency(ultimoResultadoImportacao.valorTotalLote)}</span>
                </div>
                <div className="mt-1 text-[11px]">
                  Total: <strong>{ultimoResultadoImportacao.totalGuias} guias</strong> •{" "}
                  <span className="text-emerald-700 font-semibold">
                    {ultimoResultadoImportacao.guiasConformes} OK
                  </span>{" "}
                  •{" "}
                  <span className="text-red-600 font-semibold">
                    {ultimoResultadoImportacao.guiasDivergentes} c/ divergência
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============================================================
          2. SELETOR DE LOTES AMBULATORIAIS IMPORTADOS
         ============================================================ */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-600" />
                Lotes XML Ambulatoriais na Esteira ({resumoLotesData?.totalLotes || 0} lotes •{" "}
                {resumoLotesData?.totalGuiasGeral || 0} guias •{" "}
                {formatCurrency(resumoLotesData?.valorTotalGeral || 0)})
              </CardTitle>
              <CardDescription>
                Clique em um lote para filtrar suas guias ou liberar o lote inteiro para Envio ao Convênio.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {loteSelecionado !== "todos" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoteSelecionado("todos")}
                >
                  Mostrar Todos os Lotes
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={recarregarTudoAmbulatorial}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLotes ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Carregando lotes ambulatoriais...
            </div>
          ) : lotes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum lote ambulatorial importado ainda para este filtro. Use o painel acima para importar um arquivo XML com múltiplas guias.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {lotes.map((lote: any) => {
                const selecionado = loteSelecionado === lote.numeroLote;
                const temErro = lote.guiasDivergentes > 0;
                const jaEnviado = lote.statusLote === "enviado_convenio";

                return (
                  <div
                    key={`${lote.hospitalEstabelecimentoId}-${lote.numeroLote}`}
                    onClick={() => {
                      setLoteSelecionado(
                        selecionado ? "todos" : String(lote.numeroLote)
                      );
                      if (temErro) {
                        setFiltroConformidade("divergentes");
                      } else {
                        setFiltroConformidade("todas");
                      }
                    }}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
                      selecionado
                        ? "ring-2 ring-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30"
                        : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span>Lote #{lote.numeroLote}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[190px]">
                          {lote.convenioNome} • {lote.hospitalNome}
                        </div>
                      </div>
                      {jaEnviado ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                          Enviado
                        </Badge>
                      ) : temErro ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {lote.guiasDivergentes} c/ Erro
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">
                          100% OK
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-lg font-extrabold">
                        {lote.totalGuias} guia(s)
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {formatCurrency(lote.valorTotalLote)}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t flex items-center justify-between text-[11px]">
                      <span className="text-emerald-700 font-medium">
                        ✓ {lote.guiasConformes + lote.guiasRevisadas} conformes
                      </span>
                      <span
                        className={
                          temErro
                            ? "text-red-600 font-bold"
                            : "text-muted-foreground"
                        }
                      >
                        ⚠ {lote.guiasDivergentes} divergentes
                      </span>
                    </div>

                    {!jaEnviado && !temErro && (
                      <div className="mt-2.5 pt-2 border-t">
                        <Button
                          size="sm"
                          className="w-full h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={liberarLoteMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            liberarLoteMutation.mutate({
                              hospitalEstabelecimentoId:
                                lote.hospitalEstabelecimentoId,
                              numeroLote: lote.numeroLote,
                              metodoEnvioConvenio: impMetodoEnvio,
                            });
                          }}
                        >
                          <Send className="h-3 w-3" />
                          Enviar Lote ao Convênio
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          3. TABELA DE GUIAS AMBULATORIAIS (CONTAS SEPARADAS POR PACIENTE)
         ============================================================ */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Guias Ambulatoriais Desmembradas
                {loteSelecionado !== "todos" && (
                  <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300">
                    Filtrado: Lote #{loteSelecionado}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Cada guia do XML é uma conta individual na esteira. Se houver divergência nas regras do convênio, corrija/reimporte o XML ou justifique para liberar o envio.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={filtroConformidade === "todas" ? "default" : "outline"}
                onClick={() => setFiltroConformidade("todas")}
                className="h-8 text-xs"
              >
                Todas ({guiasData?.total || 0})
              </Button>
              <Button
                size="sm"
                variant={
                  filtroConformidade === "divergentes" ? "destructive" : "outline"
                }
                onClick={() => setFiltroConformidade("divergentes")}
                className="h-8 text-xs gap-1"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Apenas com Divergência ({resumoLotesData?.totalGuiasDivergentesGeral || 0})
              </Button>
              <Button
                size="sm"
                variant={filtroConformidade === "conformes" ? "default" : "outline"}
                onClick={() => setFiltroConformidade("conformes")}
                className="h-8 text-xs"
              >
                100% Conformes
              </Button>
              <Button
                size="sm"
                variant={filtroConformidade === "revisadas" ? "default" : "outline"}
                onClick={() => setFiltroConformidade("revisadas")}
                className="h-8 text-xs"
              >
                Revisadas / Justificadas
              </Button>
              <Button
                size="sm"
                variant={filtroConformidade === "enviadas" ? "default" : "outline"}
                onClick={() => setFiltroConformidade("enviadas")}
                className="h-8 text-xs"
              >
                Enviadas ao Convênio ({resumoLotesData?.totalGuiasEnviadasGeral || 0})
              </Button>
            </div>
          </div>

          {/* Barra de Busca e Ações em Massa */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={buscaGuia}
                onChange={(e) => setBuscaGuia(e.target.value)}
                placeholder="Buscar por paciente, nº da guia, lote ou convênio..."
                className="pl-9 h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {guiasDivergentesVisiveis.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-50"
                  onClick={() =>
                    handleAbrirJustificativa(
                      guiasDivergentesVisiveis.map((g: any) => g.id)
                    )
                  }
                >
                  <CheckCheck className="h-4 w-4" />
                  Justificar Todas as {guiasDivergentesVisiveis.length} Divergente(s) e Liberar Lote
                </Button>
              )}

              {guiasSelecionadas.length > 0 && (
                <Button
                  size="sm"
                  className="h-9 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => handleAbrirJustificativa(guiasSelecionadas)}
                >
                  <Sparkles className="h-4 w-4" />
                  Justificar / Liberar Selecionadas ({guiasSelecionadas.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loadingGuias ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Carregando guias ambulatoriais...
            </div>
          ) : guias.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg">
              Nenhuma guia ambulatorial encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={
                          guias.length > 0 &&
                          guiasSelecionadas.length === guias.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setGuiasSelecionadas(guias.map((g: any) => g.id));
                          } else {
                            setGuiasSelecionadas([]);
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead>Lote / Guia</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Hospital / Convênio</TableHead>
                    <TableHead className="text-right">Itens / Valor</TableHead>
                    <TableHead>Comparativo Regras do Convênio</TableHead>
                    <TableHead>Status na Esteira</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guias.map((g: any) => {
                    const isDivergente = g.statusAuditoriaRegras === "divergente";
                    const isRevisado = g.statusAuditoriaRegras === "revisado";
                    const isEnviado = g.setorAtual === "enviado_convenio";
                    const checked = guiasSelecionadas.includes(g.id);

                    return (
                      <TableRow
                        key={g.id}
                        className={
                          isDivergente
                            ? "bg-red-50/40 dark:bg-red-950/20"
                            : isEnviado
                              ? "bg-emerald-50/20 dark:bg-emerald-950/10"
                              : ""
                        }
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setGuiasSelecionadas((prev) => [...prev, g.id]);
                              } else {
                                setGuiasSelecionadas((prev) =>
                                  prev.filter((id) => id !== g.id)
                                );
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </TableCell>

                        <TableCell>
                          <div className="font-bold text-xs text-indigo-700 dark:text-indigo-400">
                            Lote #{g.numeroLote || "-"}
                          </div>
                          <div className="font-mono text-xs font-semibold">
                            Guia: {g.numeroGuia || g.numeroContaHospital || "-"}
                          </div>
                          {g.senhaAutorizacao && (
                            <div className="text-[11px] text-muted-foreground">
                              Senha: {g.senhaAutorizacao}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="font-semibold text-sm">{g.nomePaciente}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Atend: {formatDateStr(g.dataEntrada)} • Faturista:{" "}
                            {g.faturistaNome || "-"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="text-xs font-semibold">{g.convenioNome}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {g.hospitalNome}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="font-bold text-sm">
                            {formatCurrency(
                              g.valorFaturadoFinal > 0
                                ? g.valorFaturadoFinal
                                : g.valorFaturadoInicial
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {g.totalItensXml || 0} item(ns)
                          </div>
                        </TableCell>

                        <TableCell className="max-w-xs">
                          {isDivergente ? (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <ShieldAlert className="h-3 w-3" />
                                {g.totalDivergenciasRegras || 1} Divergência(s) nas Regras
                              </Badge>
                              {g.ultimoMotivoRetorno && (
                                <p className="text-[11px] text-red-700 dark:text-red-300 leading-snug line-clamp-2">
                                  {g.ultimoMotivoRetorno}
                                </p>
                              )}
                            </div>
                          ) : isRevisado ? (
                            <div className="space-y-1">
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Revisada / Justificada
                              </Badge>
                              {g.observacoes && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1">
                                  {g.observacoes}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              100% Conforme Regras
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell>
                          {isEnviado ? (
                            <div className="space-y-0.5">
                              <Badge className="bg-emerald-600 text-white text-[10px]">
                                Enviado ao Convênio
                              </Badge>
                              {g.protocoloEnvioConvenio && (
                                <div className="text-[10px] font-mono text-muted-foreground">
                                  {g.protocoloEnvioConvenio}
                                </div>
                              )}
                            </div>
                          ) : isDivergente ? (
                            <Badge
                              variant="outline"
                              className="border-red-400 text-red-700 bg-red-50 text-[10px]"
                            >
                              Retida no Faturamento (Erro)
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-blue-400 text-blue-700 bg-blue-50 text-[10px]"
                            >
                              Pronta p/ Envio
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {g.numeroGuia && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() =>
                                  setLocation(
                                    `/conta-convenio/${encodeURIComponent(
                                      g.numeroGuia
                                    )}?estabelecimentoId=${g.hospitalEstabelecimentoId}&origem=XML`
                                  )
                                }
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Itens
                              </Button>
                            )}

                            {isDivergente && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs border-amber-400 text-amber-800 hover:bg-amber-50"
                                onClick={() => handleAbrirJustificativa([g.id])}
                              >
                                Justificar / Liberar
                              </Button>
                            )}
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

      {/* ============================================================
          MODAL: JUSTIFICAR DIVERGÊNCIA AMBULATORIAL E LIBERAR ENVIO
         ============================================================ */}
      <Dialog open={modalJustificativaOpen} onOpenChange={setModalJustificativaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Justificar Divergência e Liberar ({contasAlvoJustificativa.length} guia(s))
            </DialogTitle>
            <DialogDescription>
              Use quando a divergência apontada pelo motor de regras possui respaldo contratual ou autorização especial. Caso seja um erro real de digitação, corrija no sistema do hospital e reimporte o XML do lote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Justificativa Técnica / Contratual *</Label>
              <Textarea
                rows={3}
                value={textoJustificativa}
                onChange={(e) => setTextoJustificativa(e.target.value)}
                placeholder="Ex: Valor negociado em aditivo contratual / Atendimento de urgência dispensado de senha prévia..."
              />
            </div>

            <div className="rounded-lg border p-3 bg-muted/40 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={enviarAposJustificar}
                  onChange={(e) => setEnviarAposJustificar(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Avançar imediatamente a(s) guia(s) e o lote desbloqueado para Enviado ao Convênio
              </label>

              {enviarAposJustificar && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Protocolo de Envio (opcional — gerado automático se vazio)
                  </Label>
                  <Input
                    value={protocoloLiberacao}
                    onChange={(e) => setProtocoloLiberacao(e.target.value)}
                    placeholder="Ex: PROT-UNIMED-99482"
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalJustificativaOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarJustificativa}
              disabled={justificarMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              <Send className="h-4 w-4" />
              {justificarMutation.isPending
                ? "Processando..."
                : enviarAposJustificar
                  ? "Confirmar e Enviar ao Convênio"
                  : "Confirmar Revisão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
