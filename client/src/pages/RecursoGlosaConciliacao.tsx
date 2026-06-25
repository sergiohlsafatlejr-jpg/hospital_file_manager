import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileSpreadsheet, FileCode, Search, Filter, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Download, Sparkles, Loader2, Pencil, Copy, List, Tag, Users, Ban, Check, ThumbsDown } from "lucide-react";
import * as XLSX from "xlsx";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RecursoGlosaConciliacao() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competencia, setCompetencia] = useState<string>("todos");
  const [dataPagto, setDataPagto] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [agrupamento, setAgrupamento] = useState<"guia" | "data" | "lote" | "item" | "motivo">("guia");
  const [busca, setBusca] = useState("");
  const [apenasNaoRecursados, setApenasNaoRecursados] = useState(true);
  const [guiasSelecionadas, setGuiasSelecionadas] = useState<Set<string>>(new Set());
  const [guiaExpandida, setGuiaExpandida] = useState<string | null>(null);
  const [itemExpandido, setItemExpandido] = useState<string | null>(null);
  const [motivoExpandido, setMotivoExpandido] = useState<string | null>(null);
  const [dialogXml, setDialogXml] = useState(false);
  const [dialogExcel, setDialogExcel] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [registroANS, setRegistroANS] = useState("");
  const [cnpjOperadora, setCnpjOperadora] = useState("");
  const [numeroDemonstrativo, setNumeroDemonstrativo] = useState("");
  const [numeroProtocolo, setNumeroProtocolo] = useState("");
  
  // Estado para justificativas individuais por item (id -> texto)
  const [justificativasItens, setJustificativasItens] = useState<Record<number, string>>({});
  const [gerandoIA, setGerandoIA] = useState(false);
  const [editandoJustificativa, setEditandoJustificativa] = useState<number | null>(null);
  const [replicandoJustificativas, setReplicandoJustificativas] = useState(false);
  // Estado para valor do recurso editável por item (id -> valor)
  const [valoresRecurso, setValoresRecurso] = useState<Record<number, string>>({});
  const [editandoValorRecurso, setEditandoValorRecurso] = useState<number | null>(null);
  // Estado para itens marcados como glosa aceita (id -> true)
  const [itensGlosaAceita, setItensGlosaAceita] = useState<Record<number, boolean>>({});
  const [salvandoGlosaAceita, setSalvandoGlosaAceita] = useState(false);

  // Queries
  const { data: competencias } = trpc.faturamentoUnificado.competenciasConciliados.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual?.id }
  );

  const { data: convenios } = trpc.faturamentoUnificado.conveniosConciliados.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual?.id }
  );

  const { data: datasPagamento } = trpc.faturamentoUnificado.datasPagamento.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      competencia: competencia !== "todos" ? competencia : undefined,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id }
  );

  const { data: itensGlosados, isLoading, refetch } = trpc.faturamentoUnificado.itensGlosadosParaRecurso.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      competencia: competencia !== "todos" ? competencia : undefined,
      dataPagto: dataPagto !== "todos" ? dataPagto : undefined,
      agrupamento,
      busca: busca || undefined,
      apenasNaoRecursados,
      limit: 100,
    },
    { enabled: !!estabelecimentoAtual?.id }
  );

  // Detalhe da guia expandida
  const { data: detalheGuia } = trpc.faturamentoUnificado.itensGlosadosDetalheGuia.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      numeroGuia: guiaExpandida || "",
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      competencia: competencia !== "todos" ? competencia : undefined,
      dataPagto: dataPagto !== "todos" ? dataPagto : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id && !!guiaExpandida && agrupamento === 'guia' }
  );

  // Detalhe por item expandido
  const { data: detalheItem } = trpc.faturamentoUnificado.itensGlosadosDetalhePorItem.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      codigoItem: itemExpandido || "",
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      competencia: competencia !== "todos" ? competencia : undefined,
      dataPagto: dataPagto !== "todos" ? dataPagto : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id && !!itemExpandido && agrupamento === 'item' }
  );

  // Detalhe por motivo expandido
  const { data: detalheMotivo } = trpc.faturamentoUnificado.itensGlosadosDetalhePorMotivo.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      codigoGlosa: motivoExpandido || "",
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      competencia: competencia !== "todos" ? competencia : undefined,
      dataPagto: dataPagto !== "todos" ? dataPagto : undefined,
    },
    { enabled: !!estabelecimentoAtual?.id && !!motivoExpandido && agrupamento === 'motivo' }
  );

  // Mutations
  const gerarExcelMutation = trpc.faturamentoUnificado.gerarExcelRecursoConciliacao.useMutation({
    onSuccess: (data) => {
      const ws = XLSX.utils.json_to_sheet(data.dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Recurso Glosa");

      const totaisSheet = XLSX.utils.json_to_sheet([{
        "Total de Itens": data.totais.totalItens,
        "Total de Guias": data.totais.totalGuias,
        "Total Valor Faturado": data.totais.totalValorFaturado,
        "Total Valor Pago": data.totais.totalValorPago,
        "Total Valor Glosa": data.totais.totalValorGlosa,
        "Total Valor Recursado": data.totais.totalValorRecursado,
      }]);
      XLSX.utils.book_append_sheet(wb, totaisSheet, "Totais");

      XLSX.writeFile(wb, `recurso_glosa_conciliacao_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`Excel gerado com ${data.totais.totalItens} itens!`);
      setDialogExcel(false);
      setJustificativa("");
    },
    onError: (error) => {
      toast.error("Erro ao gerar Excel: " + error.message);
    },
  });

  const gerarXmlMutation = trpc.faturamentoUnificado.gerarXmlRecursoConciliacao.useMutation({
    onSuccess: (data: any) => {
      toast.success(`XML TISS gerado com ${data.totalGuias} guias e ${data.totalItens} itens!`);
      setDialogXml(false);
      refetch();
      if (data.xmlUrl) {
        window.open(data.xmlUrl, '_blank');
      }
    },
    onError: (error) => {
      toast.error("Erro ao gerar XML: " + error.message);
    },
  });

  // Mutation para gerar justificativas com IA
  const gerarJustificativasIAMutation = trpc.faturamentoUnificado.gerarJustificativasIA.useMutation({
    onSuccess: (data) => {
      if (data.justificativas) {
        const novasJustificativas: Record<number, string> = { ...justificativasItens };
        for (const j of data.justificativas) {
          novasJustificativas[j.id] = j.justificativa;
        }
        setJustificativasItens(novasJustificativas);
        toast.success(`Justificativas geradas para ${data.justificativas.length} itens!`);
      }
      setGerandoIA(false);
    },
    onError: (error) => {
      toast.error("Erro ao gerar justificativas: " + error.message);
      setGerandoIA(false);
    },
  });

  // Mutation para replicar justificativas em outras guias com mesmo motivo/item
  const replicarJustificativasMutation = trpc.faturamentoUnificado.replicarJustificativas.useMutation({
    onSuccess: (data) => {
      toast.success(`Justificativas replicadas para ${data.totalReplicados} itens em ${data.totalGuias} guias!`);
      setReplicandoJustificativas(false);
    },
    onError: (error) => {
      toast.error("Erro ao replicar justificativas: " + error.message);
      setReplicandoJustificativas(false);
    },
  });

  // Mutation para marcar item como glosa aceita
  const marcarGlosaAceitaMutation = trpc.faturamentoUnificado.marcarGlosaAceita.useMutation({
    onSuccess: () => {
      toast.success("Item marcado com sucesso!");
      setSalvandoGlosaAceita(false);
    },
    onError: (error) => {
      toast.error("Erro ao marcar glosa aceita: " + error.message);
      setSalvandoGlosaAceita(false);
    },
  });

  // Mutation para salvar valor do recurso
  const salvarValorRecursoMutation = trpc.faturamentoUnificado.salvarValorRecurso.useMutation({
    onSuccess: () => {
      toast.success("Valor do recurso salvo!");
    },
    onError: (error) => {
      toast.error("Erro ao salvar valor: " + error.message);
    },
  });

  // Handlers
  const toggleGuiaSelecionada = (chave: string) => {
    setGuiasSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
      } else {
        next.add(chave);
      }
      return next;
    });
  };

  const toggleTodas = () => {
    if (!itensGlosados?.items) return;
    if (guiasSelecionadas.size === itensGlosados.items.length) {
      setGuiasSelecionadas(new Set());
    } else {
      setGuiasSelecionadas(new Set(itensGlosados.items.map((i: any) => i.chave)));
    }
  };

  const guiasSelecionadasArray = useMemo(() => {
    if (!itensGlosados?.items) return [];
    return itensGlosados.items
      .filter((i: any) => guiasSelecionadas.has(i.chave))
      .map((i: any) => i.numeroGuia)
      .filter(Boolean);
  }, [guiasSelecionadas, itensGlosados]);

  const handleGerarExcel = () => {
    if (guiasSelecionadasArray.length === 0) {
      toast.error("Selecione pelo menos uma guia");
      return;
    }
    gerarExcelMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      guias: guiasSelecionadasArray,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      justificativa,
      competencia: competencia !== "todos" ? competencia : undefined,
    });
  };

  const handleGerarXml = () => {
    if (guiasSelecionadasArray.length === 0) {
      toast.error("Selecione pelo menos uma guia");
      return;
    }
    gerarXmlMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      guias: guiasSelecionadasArray,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      registroANS: registroANS || undefined,
      cnpjOperadora: cnpjOperadora || undefined,
      numeroDemonstrativo: numeroDemonstrativo || undefined,
      numeroProtocolo: numeroProtocolo || undefined,
    });
  };

  // Handler para gerar justificativas com IA para os itens da guia expandida
  const handleGerarJustificativasIA = () => {
    if (!detalheGuia || detalheGuia.length === 0) {
      toast.error("Nenhum item para gerar justificativa");
      return;
    }

    // Encontrar o nome do convênio
    const convenioNome = itensGlosados?.items?.find((i: any) => i.numeroGuia === guiaExpandida)?.convenio;

    setGerandoIA(true);
    gerarJustificativasIAMutation.mutate({
      itens: detalheGuia.map((d: any) => ({
        id: d.id,
        codigoItem: d.codigoItem || '',
        descricaoItem: d.descricaoItem || '',
        codigoGlosa: d.codigoGlosa || undefined,
        motivoGlosa: d.motivoGlosa || undefined,
        valorFaturado: String(d.valorFaturado || 0),
        valorPago: String(d.valorPago || 0),
        valorGlosa: String(d.valorGlosa || 0),
        tipoLancamento: d.tipoItem || undefined,
      })),
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      convenioNome: convenioNome || undefined,
    });
  };

  // Handler para gerar justificativas de TODAS as guias selecionadas
  const handleGerarJustificativasTodasIA = () => {
    if (!detalheGuia || detalheGuia.length === 0) {
      toast.error("Expanda uma guia primeiro para gerar justificativas");
      return;
    }
    handleGerarJustificativasIA();
  };

  // Handler para replicar justificativas para mesmo motivo/item em outras guias
  const handleReplicarJustificativas = () => {
    if (!detalheGuia || Object.keys(justificativasItens).length === 0) {
      toast.error("Nenhuma justificativa para replicar");
      return;
    }
    setReplicandoJustificativas(true);
    
    // Mapear motivo/item -> justificativa
    const justificativasPorMotivo: Record<string, string> = {};
    const justificativasPorItem: Record<string, string> = {};
    
    for (const d of detalheGuia) {
      const justificativa = justificativasItens[d.id];
      if (justificativa) {
        if (d.codigoGlosa) {
          const key = `${d.codigoGlosa}-${d.codigoItem || ''}`;
          justificativasPorMotivo[key] = justificativa;
        }
        if (d.codigoItem) {
          justificativasPorItem[d.codigoItem] = justificativa;
        }
      }
    }
    
    replicarJustificativasMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      justificativasPorMotivo,
      justificativasPorItem,
      guiaOrigem: guiaExpandida || '',
      competencia: competencia !== 'todos' ? competencia : undefined,
      convenioId: convenioFiltro !== 'todos' ? parseInt(convenioFiltro) : undefined,
    });
  };

  // Handler para replicar justificativas a partir da aba "Por Item"
  const handleReplicarJustificativasItem = () => {
    if (!detalheItem || Object.keys(justificativasItens).length === 0) {
      toast.error("Nenhuma justificativa para replicar");
      return;
    }
    setReplicandoJustificativas(true);
    const justificativasPorMotivo: Record<string, string> = {};
    const justificativasPorItem: Record<string, string> = {};
    for (const d of detalheItem) {
      const justificativa = justificativasItens[d.id];
      if (justificativa) {
        if (d.codigoGlosa) {
          const key = `${d.codigoGlosa}-${d.codigoItem || ''}`;
          justificativasPorMotivo[key] = justificativa;
        }
        if (d.codigoItem) {
          justificativasPorItem[d.codigoItem] = justificativa;
        }
      }
    }
    replicarJustificativasMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      justificativasPorMotivo,
      justificativasPorItem,
      guiaOrigem: detalheItem[0]?.numeroGuia || '',
      competencia: competencia !== 'todos' ? competencia : undefined,
      convenioId: convenioFiltro !== 'todos' ? parseInt(convenioFiltro) : undefined,
    });
  };

  // Handler para replicar justificativas a partir da aba "Por Motivo"
  const handleReplicarJustificativasMotivo = () => {
    if (!detalheMotivo || Object.keys(justificativasItens).length === 0) {
      toast.error("Nenhuma justificativa para replicar");
      return;
    }
    setReplicandoJustificativas(true);
    const justificativasPorMotivo: Record<string, string> = {};
    const justificativasPorItem: Record<string, string> = {};
    for (const d of detalheMotivo) {
      const justificativa = justificativasItens[d.id];
      if (justificativa) {
        if (d.codigoGlosa) {
          const key = `${d.codigoGlosa}-${d.codigoItem || ''}`;
          justificativasPorMotivo[key] = justificativa;
        }
        if (d.codigoItem) {
          justificativasPorItem[d.codigoItem] = justificativa;
        }
      }
    }
    replicarJustificativasMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      justificativasPorMotivo,
      justificativasPorItem,
      guiaOrigem: detalheMotivo[0]?.numeroGuia || '',
      competencia: competencia !== 'todos' ? competencia : undefined,
      convenioId: convenioFiltro !== 'todos' ? parseInt(convenioFiltro) : undefined,
    });
  };

  const resumo = itensGlosados?.resumo;

  // Contagem de justificativas preenchidas
  const totalJustificativasPreenchidas = detalheGuia
    ? detalheGuia.filter((d: any) => justificativasItens[d.id]).length
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Recurso de Glosa - Conciliação</h1>
            <p className="text-sm text-muted-foreground">
              Gere recursos de glosa a partir dos itens identificados na conciliação cruzada
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogExcel(true)}
              disabled={guiasSelecionadas.size === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Gerar Excel ({guiasSelecionadas.size})
            </Button>
            <Button
              onClick={() => setDialogXml(true)}
              disabled={guiasSelecionadas.size === 0}
            >
              <FileCode className="h-4 w-4 mr-2" />
              Gerar XML TISS ({guiasSelecionadas.size})
            </Button>
          </div>
        </div>

        {/* Cards de Resumo */}
        {resumo && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Guias</p>
                <p className="text-xl font-bold">{resumo.totalGuias}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Itens Glosados</p>
                <p className="text-xl font-bold">{resumo.totalItens}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Valor Faturado</p>
                <p className="text-xl font-bold text-blue-600">{formatarMoeda(resumo.totalValorFaturado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Valor Glosa</p>
                <p className="text-xl font-bold text-red-600">{formatarMoeda(resumo.totalValorGlosa)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Já Recursados</p>
                <p className="text-xl font-bold text-green-600">{resumo.totalJaRecursados}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtros */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={competencia} onValueChange={setCompetencia}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Data de Referência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas Referências</SelectItem>
                    {competencias?.map((c: any) => (
                      <SelectItem key={c.competencia || c} value={c.competencia || c}>{c.competencia || c} ({c.total || ''})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Select value={dataPagto} onValueChange={setDataPagto}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Data Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas Datas Pgto</SelectItem>
                  {datasPagamento?.map((dp: any) => (
                    <SelectItem key={dp.dataPagto} value={dp.dataPagto}>
                      {new Date(dp.dataPagto + 'T12:00:00').toLocaleDateString('pt-BR')} ({dp.total})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Convênios</SelectItem>
                  {convenios?.map((c: any) => (
                    <SelectItem key={c.convenioId || c.id} value={String(c.convenioId || c.id)}>{c.convenio || c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>



              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-[200px]"
                  placeholder="Buscar guia, paciente..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="naoRecursados"
                  checked={apenasNaoRecursados}
                  onCheckedChange={(v) => setApenasNaoRecursados(!!v)}
                />
                <label htmlFor="naoRecursados" className="text-sm">Apenas não recursados</label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Abas de Agrupamento */}
        <Tabs value={agrupamento} onValueChange={(v: any) => { setAgrupamento(v); setGuiasSelecionadas(new Set()); setGuiaExpandida(null); setItemExpandido(null); setMotivoExpandido(null); }} className="w-full">
          <TabsList className="bg-muted/60 flex-wrap h-auto gap-1 p-1 mb-4">
            <TabsTrigger value="guia" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Por Guia/Paciente
            </TabsTrigger>
            <TabsTrigger value="item" className="gap-1.5">
              <List className="h-3.5 w-3.5" />
              Por Item
            </TabsTrigger>
            <TabsTrigger value="motivo" className="gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Por Motivo de Glosa
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Tabela de Guias */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Carregando itens glosados...</span>
              </div>
            ) : !itensGlosados?.items?.length ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p>Nenhum item glosado encontrado com os filtros selecionados</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 w-8">
                        <Checkbox
                          checked={guiasSelecionadas.size === itensGlosados.items.length && itensGlosados.items.length > 0}
                          onCheckedChange={toggleTodas}
                        />
                      </th>
                      <th className="p-2 w-8"></th>
                      {agrupamento === 'guia' && (
                        <>
                          <th className="p-2 text-left">Guia</th>
                          <th className="p-2 text-left">Matrícula</th>
                          <th className="p-2 text-left">Lote</th>
                          <th className="p-2 text-left">Protocolo</th>
                          <th className="p-2 text-left">Nome</th>
                          <th className="p-2 text-left">Data Início</th>
                          <th className="p-2 text-left">Data Fim</th>
                        </>
                      )}
                      {agrupamento === 'item' && (
                        <>
                          <th className="p-2 text-left">Código</th>
                          <th className="p-2 text-left">Descrição</th>
                          <th className="p-2 text-left">Justificativa</th>
                        </>
                      )}
                      {agrupamento === 'motivo' && (
                        <>
                          <th className="p-2 text-left">Cód. Glosa</th>
                          <th className="p-2 text-left">Motivo</th>
                          <th className="p-2 text-left">Justificativa</th>
                        </>
                      )}
                      {agrupamento === 'data' && <th className="p-2 text-left">Data</th>}
                      {agrupamento === 'lote' && <th className="p-2 text-left">Lote</th>}
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-right">Valor Glosa</th>
                      {agrupamento === 'guia' && (
                        <>
                          <th className="p-2 text-right">Vlr Recursado</th>
                          <th className="p-2 text-right">Vlr Aceita</th>
                        </>
                      )}
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensGlosados.items.map((item: any) => [
                      <tr
                          key={item.chave}
                          className={`border-b hover:bg-muted/30 cursor-pointer ${guiasSelecionadas.has(item.chave) ? 'bg-primary/5' : ''}`}
                          onClick={() => {
                            if (agrupamento === 'guia' && item.numeroGuia) {
                              setGuiaExpandida(guiaExpandida === item.numeroGuia ? null : item.numeroGuia);
                            } else if (agrupamento === 'item' && item.codigoItem) {
                              setItemExpandido(itemExpandido === item.codigoItem ? null : item.codigoItem);
                            } else if (agrupamento === 'motivo') {
                              const motivoKey = item.codigoGlosa || 'SEM_CODIGO';
                              setMotivoExpandido(motivoExpandido === motivoKey ? null : motivoKey);
                            }
                          }}
                        >
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={guiasSelecionadas.has(item.chave)}
                              onCheckedChange={() => toggleGuiaSelecionada(item.chave)}
                            />
                          </td>
                          <td className="p-2">
                            {agrupamento === 'guia' && (
                              guiaExpandida === item.numeroGuia
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />
                            )}
                            {agrupamento === 'item' && (
                              itemExpandido === item.codigoItem
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />
                            )}
                            {agrupamento === 'motivo' && (
                              motivoExpandido === (item.codigoGlosa || 'SEM_CODIGO')
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          {agrupamento === 'guia' && (
                            <>
                              <td className="p-2 font-mono font-medium">{item.numeroGuia}</td>
                              <td className="p-2 text-xs">{item.matricula || '-'}</td>
                              <td className="p-2 text-xs">{item.lote || '-'}</td>
                              <td className="p-2 text-xs">{item.protocolo || '-'}</td>
                              <td className="p-2 max-w-[150px] truncate">{item.pacienteNome || '-'}</td>
                              <td className="p-2 text-xs">{item.dataInicio ? new Date(item.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                              <td className="p-2 text-xs">{item.dataFim ? new Date(item.dataFim + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                            </>
                          )}
                          {agrupamento === 'item' && (
                            <>
                              <td className="p-2 font-mono font-medium">{item.codigoItem}</td>
                              <td className="p-2 max-w-[200px] truncate">{item.descricaoItem || '-'}</td>
                              <td className="p-2 max-w-[200px]">
                                {detalheItem && itemExpandido === item.codigoItem ? (
                                  <span className="text-xs text-green-700">
                                    {detalheItem.filter((d: any) => justificativasItens[d.id]).length > 0
                                      ? `${detalheItem.filter((d: any) => justificativasItens[d.id]).length}/${detalheItem.length} preenchidas`
                                      : <span className="text-muted-foreground italic">Expandir para preencher</span>}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Expandir para preencher</span>
                                )}
                              </td>
                            </>
                          )}
                          {agrupamento === 'motivo' && (
                            <>
                              <td className="p-2 font-mono">{item.codigoGlosa || '-'}</td>
                              <td className="p-2 max-w-[200px] truncate">{item.motivoGlosaDesc || '-'}</td>
                              <td className="p-2 max-w-[200px]">
                                {detalheMotivo && motivoExpandido === (item.codigoGlosa || 'SEM_CODIGO') ? (
                                  <span className="text-xs text-green-700">
                                    {detalheMotivo.filter((d: any) => justificativasItens[d.id]).length > 0
                                      ? `${detalheMotivo.filter((d: any) => justificativasItens[d.id]).length}/${detalheMotivo.length} preenchidas`
                                      : <span className="text-muted-foreground italic">Expandir para preencher</span>}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Expandir para preencher</span>
                                )}
                              </td>
                            </>
                          )}
                          {agrupamento === 'data' && <td className="p-2 font-mono">{item.dataExecucao}</td>}
                          {agrupamento === 'lote' && <td className="p-2 font-mono">{item.lote || '-'}</td>}
                          <td className="p-2">{item.convenio || '-'}</td>
                          <td className="p-2 text-right font-medium">{item.totalItensGlosados}</td>
                          <td className="p-2 text-right">{formatarMoeda(item.valorFaturado)}</td>
                          <td className="p-2 text-right">{formatarMoeda(item.valorPago)}</td>
                          <td className="p-2 text-right font-medium text-red-600">{formatarMoeda(item.valorGlosa)}</td>
                          {agrupamento === 'guia' && (
                            <>
                              <td className="p-2 text-right text-blue-700 font-medium">{formatarMoeda(item.valorRecursado || 0)}</td>
                              <td className="p-2 text-right text-orange-600 font-medium">{formatarMoeda(item.valorGlosaAceita || 0)}</td>
                            </>
                          )}
                          <td className="p-2 text-center">
                            {item.statusRecurso === 'finalizado' ? (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Finalizado
                              </Badge>
                            ) : item.statusRecurso === 'iniciado' ? (
                              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                <Loader2 className="h-3 w-3 mr-1" />
                                Iniciado
                              </Badge>
                            ) : item.xmlGerado ? (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Recursado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                Pendente
                              </Badge>
                            )}
                          </td>
                        </tr>,
                        /* Detalhe expandido - por item */
                        agrupamento === 'item' && itemExpandido === item.codigoItem && detalheItem && (
                          <tr key={`detail-item-${item.chave}`}>
                            <td colSpan={8} className="p-0">
                              <div className="bg-muted/20 border-l-4 border-blue-400/50 p-3 mx-2 mb-2 rounded">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Guias com item {item.codigoItem} ({detalheItem.length} ocorrências)
                                  </p>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleGerarJustificativasIA(); }} disabled={gerandoIA} className="text-xs">
                                      {gerandoIA ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Gerando...</> : <><Sparkles className="h-3 w-3 mr-1" />Gerar com IA</>}
                                    </Button>
                                    {detalheItem.some((d: any) => justificativasItens[d.id]) && (
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleReplicarJustificativasItem(); }} disabled={replicandoJustificativas} className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                                        {replicandoJustificativas ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Replicando...</> : <><Copy className="h-3 w-3 mr-1" />Replicar em Todas as Contas</>}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-1 text-left">Guia</th>
                                      <th className="p-1 text-left">Paciente</th>
                                      <th className="p-1 text-left">Data</th>
                                      <th className="p-1 text-center">Qtde</th>
                                      <th className="p-1 text-right">Faturado</th>
                                      <th className="p-1 text-right">Pago</th>
                                      <th className="p-1 text-right">Glosa</th>
                                      <th className="p-1 text-left">Cód. Glosa</th>
                                      <th className="p-1 text-left">Motivo</th>
                                      <th className="p-1 text-right">Vlr Recurso</th>
                                      <th className="p-1 text-center">Aceita</th>
                                      <th className="p-1 text-left min-w-[200px]">Justificativa</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalheItem.map((d: any) => (
                                      <tr key={d.id} className={`border-b border-dashed ${d.glosaAceita || itensGlosaAceita[d.id] ? 'bg-orange-50' : ''}`}>
                                        <td className="p-1 font-mono">{d.numeroGuia}</td>
                                        <td className="p-1 max-w-[120px] truncate">{d.pacienteNome || '-'}</td>
                                        <td className="p-1">{d.dataExecucao ? new Date(d.dataExecucao).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="p-1 text-center">{d.quantidade}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorFaturado)}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorPago)}</td>
                                        <td className="p-1 text-right text-red-600">{formatarMoeda(d.valorGlosa)}</td>
                                        <td className="p-1">{d.codigoGlosa && <Badge variant="outline" className="text-xs">{d.codigoGlosa}</Badge>}</td>
                                        <td className="p-1 max-w-[100px] truncate text-muted-foreground">{d.motivoGlosa || '-'}</td>
                                        <td className="p-1 text-right">
                                          <span className={`text-xs ${(itensGlosaAceita[d.id] || d.glosaAceita) ? 'text-muted-foreground line-through' : 'text-blue-700'}`}>
                                            {formatarMoeda((itensGlosaAceita[d.id] || d.glosaAceita) ? 0 : Number(valoresRecurso[d.id] ?? d.valorRecurso ?? d.valorGlosa))}
                                          </span>
                                        </td>
                                        <td className="p-1 text-center">
                                          <Button
                                            variant={(itensGlosaAceita[d.id] || d.glosaAceita) ? "destructive" : "outline"}
                                            size="sm"
                                            className="h-5 px-1 text-[10px]"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const novoEstado = !(itensGlosaAceita[d.id] || d.glosaAceita);
                                              setItensGlosaAceita(prev => ({ ...prev, [d.id]: novoEstado }));
                                              marcarGlosaAceitaMutation.mutate({ conciliadoId: d.id, aceita: novoEstado });
                                            }}
                                          >
                                            {(itensGlosaAceita[d.id] || d.glosaAceita) ? (
                                              <><ThumbsDown className="h-3 w-3 mr-0.5" /> Aceita</>
                                            ) : (
                                              <><Check className="h-3 w-3 mr-0.5" /> Aceitar</>
                                            )}
                                          </Button>
                                          {(itensGlosaAceita[d.id] || d.glosaAceita) && (d.glosaAceitaPor) && (
                                            <span className="text-[9px] text-muted-foreground block">{d.glosaAceitaPor}</span>
                                          )}
                                        </td>
                                        <td className="p-1 min-w-[200px]">
                                          {editandoJustificativa === d.id ? (
                                            <Input className="h-6 text-xs" value={justificativasItens[d.id] || ''} onChange={(e) => setJustificativasItens(prev => ({...prev, [d.id]: e.target.value}))} maxLength={150} placeholder="Justificativa" onBlur={() => setEditandoJustificativa(null)} onKeyDown={(e) => { if (e.key === 'Enter') setEditandoJustificativa(null); }} autoFocus />
                                          ) : (
                                            <div className={`flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 ${justificativasItens[d.id] || d.justificativaRecurso ? 'text-green-700 bg-green-50' : 'text-muted-foreground italic'}`} onClick={(e) => { e.stopPropagation(); setEditandoJustificativa(d.id); if (!justificativasItens[d.id] && d.justificativaRecurso) setJustificativasItens(prev => ({...prev, [d.id]: d.justificativaRecurso})); }}>
                                              {justificativasItens[d.id] || d.justificativaRecurso ? <span className="truncate max-w-[180px] text-xs">{justificativasItens[d.id] || d.justificativaRecurso}</span> : <span className="text-xs">Clique para adicionar</span>}
                                              <Pencil className="h-3 w-3 flex-shrink-0" />
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ),
                        /* Detalhe expandido - por motivo */
                        agrupamento === 'motivo' && motivoExpandido === (item.codigoGlosa || 'SEM_CODIGO') && detalheMotivo && (
                          <tr key={`detail-motivo-${item.chave}`}>
                            <td colSpan={8} className="p-0">
                              <div className="bg-muted/20 border-l-4 border-orange-400/50 p-3 mx-2 mb-2 rounded">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Itens com motivo "{item.motivoGlosaDesc || item.codigoGlosa}" ({detalheMotivo.length} ocorrências)
                                  </p>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleGerarJustificativasIA(); }} disabled={gerandoIA} className="text-xs">
                                      {gerandoIA ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Gerando...</> : <><Sparkles className="h-3 w-3 mr-1" />Gerar com IA</>}
                                    </Button>
                                    {detalheMotivo.some((d: any) => justificativasItens[d.id]) && (
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleReplicarJustificativasMotivo(); }} disabled={replicandoJustificativas} className="text-xs text-orange-600 border-orange-200 hover:bg-orange-50">
                                        {replicandoJustificativas ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Replicando...</> : <><Copy className="h-3 w-3 mr-1" />Replicar em Todas as Contas</>}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-1 text-left">Guia</th>
                                      <th className="p-1 text-left">Paciente</th>
                                      <th className="p-1 text-left">Código Item</th>
                                      <th className="p-1 text-left">Descrição</th>
                                      <th className="p-1 text-left">Data</th>
                                      <th className="p-1 text-right">Faturado</th>
                                      <th className="p-1 text-right">Pago</th>
                                      <th className="p-1 text-right">Glosa</th>
                                      <th className="p-1 text-right">Vlr Recurso</th>
                                      <th className="p-1 text-center">Aceita</th>
                                      <th className="p-1 text-left min-w-[200px]">Justificativa</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalheMotivo.map((d: any) => (
                                      <tr key={d.id} className={`border-b border-dashed ${d.glosaAceita || itensGlosaAceita[d.id] ? 'bg-orange-50' : ''}`}>
                                        <td className="p-1 font-mono">{d.numeroGuia}</td>
                                        <td className="p-1 max-w-[120px] truncate">{d.pacienteNome || '-'}</td>
                                        <td className="p-1 font-mono">{d.codigoItem}</td>
                                        <td className="p-1 max-w-[120px] truncate">{d.descricaoItem || '-'}</td>
                                        <td className="p-1">{d.dataExecucao ? new Date(d.dataExecucao).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorFaturado)}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorPago)}</td>
                                        <td className="p-1 text-right text-red-600">{formatarMoeda(d.valorGlosa)}</td>
                                        <td className="p-1 text-right">
                                          <span className={`text-xs ${(itensGlosaAceita[d.id] || d.glosaAceita) ? 'text-muted-foreground line-through' : 'text-blue-700'}`}>
                                            {formatarMoeda((itensGlosaAceita[d.id] || d.glosaAceita) ? 0 : Number(valoresRecurso[d.id] ?? d.valorRecurso ?? d.valorGlosa))}
                                          </span>
                                        </td>
                                        <td className="p-1 text-center">
                                          <Button
                                            variant={(itensGlosaAceita[d.id] || d.glosaAceita) ? "destructive" : "outline"}
                                            size="sm"
                                            className="h-5 px-1 text-[10px]"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const novoEstado = !(itensGlosaAceita[d.id] || d.glosaAceita);
                                              setItensGlosaAceita(prev => ({ ...prev, [d.id]: novoEstado }));
                                              marcarGlosaAceitaMutation.mutate({ conciliadoId: d.id, aceita: novoEstado });
                                            }}
                                          >
                                            {(itensGlosaAceita[d.id] || d.glosaAceita) ? (
                                              <><ThumbsDown className="h-3 w-3 mr-0.5" /> Aceita</>
                                            ) : (
                                              <><Check className="h-3 w-3 mr-0.5" /> Aceitar</>
                                            )}
                                          </Button>
                                          {(itensGlosaAceita[d.id] || d.glosaAceita) && (d.glosaAceitaPor) && (
                                            <span className="text-[9px] text-muted-foreground block">{d.glosaAceitaPor}</span>
                                          )}
                                        </td>
                                        <td className="p-1 min-w-[200px]">
                                          {editandoJustificativa === d.id ? (
                                            <Input className="h-6 text-xs" value={justificativasItens[d.id] || ''} onChange={(e) => setJustificativasItens(prev => ({...prev, [d.id]: e.target.value}))} maxLength={150} placeholder="Justificativa" onBlur={() => setEditandoJustificativa(null)} onKeyDown={(e) => { if (e.key === 'Enter') setEditandoJustificativa(null); }} autoFocus />
                                          ) : (
                                            <div className={`flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 ${justificativasItens[d.id] || d.justificativaRecurso ? 'text-green-700 bg-green-50' : 'text-muted-foreground italic'}`} onClick={(e) => { e.stopPropagation(); setEditandoJustificativa(d.id); if (!justificativasItens[d.id] && d.justificativaRecurso) setJustificativasItens(prev => ({...prev, [d.id]: d.justificativaRecurso})); }}>
                                              {justificativasItens[d.id] || d.justificativaRecurso ? <span className="truncate max-w-[180px] text-xs">{justificativasItens[d.id] || d.justificativaRecurso}</span> : <span className="text-xs">Clique para adicionar</span>}
                                              <Pencil className="h-3 w-3 flex-shrink-0" />
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ),
                        /* Detalhe expandido da guia com campo de justificativa */
                        agrupamento === 'guia' && guiaExpandida === item.numeroGuia && detalheGuia && (
                          <tr key={`detail-${item.chave}`}>
                            <td colSpan={16} className="p-0">
                              <div className="bg-muted/20 border-l-4 border-primary/30 p-3 mx-2 mb-2 rounded">
                                {/* Header do detalhe com botão IA */}
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Itens glosados da guia {item.numeroGuia} ({detalheGuia.length} itens)
                                    {totalJustificativasPreenchidas > 0 && (
                                      <Badge variant="outline" className="ml-2 text-green-600 border-green-200 bg-green-50">
                                        {totalJustificativasPreenchidas}/{detalheGuia.length} justificativas
                                      </Badge>
                                    )}
                                  </p>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleGerarJustificativasIA();
                                      }}
                                      disabled={gerandoIA}
                                      className="text-xs"
                                    >
                                      {gerandoIA ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Gerando...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="h-3 w-3 mr-1" />
                                          Gerar com IA
                                        </>
                                      )}
                                    </Button>
                                    {totalJustificativasPreenchidas > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleReplicarJustificativas();
                                        }}
                                        disabled={replicandoJustificativas}
                                        className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                      >
                                        {replicandoJustificativas ? (
                                          <>
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            Replicando...
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="h-3 w-3 mr-1" />
                                            Replicar em Outras Guias
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-1 text-left">Código</th>
                                      <th className="p-1 text-left">Descrição</th>
                                      <th className="p-1 text-left">Tipo</th>
                                      <th className="p-1 text-left">Data</th>
                                      <th className="p-1 text-center">Qtde</th>
                                      <th className="p-1 text-right">Faturado</th>
                                      <th className="p-1 text-right">Pago</th>
                                      <th className="p-1 text-right">Glosa</th>
                                      <th className="p-1 text-left">Cód. Glosa</th>
                                      <th className="p-1 text-left">Motivo</th>
                                      <th className="p-1 text-right">Vlr Recurso</th>
                                      <th className="p-1 text-center">Aceita</th>
                                      <th className="p-1 text-left min-w-[200px]">Justificativa Recurso</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalheGuia.map((d: any) => (
                                      <tr key={d.id} className={`border-b border-dashed ${itensGlosaAceita[d.id] ? 'bg-orange-50' : ''}`}>
                                        <td className="p-1 font-mono">{d.codigoItem}</td>
                                        <td className="p-1 max-w-[180px] truncate">{d.descricaoItem}</td>
                                        <td className="p-1">{d.tipoItem || '-'}</td>
                                        <td className="p-1 text-xs">{d.dataExecucao ? new Date(d.dataExecucao).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="p-1 text-center">{d.quantidade}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorFaturado)}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorPago)}</td>
                                        <td className="p-1 text-right text-red-600">{formatarMoeda(d.valorGlosa)}</td>
                                        <td className="p-1">
                                          {d.codigoGlosa && (
                                            <Badge variant="outline" className="text-xs">{d.codigoGlosa}</Badge>
                                          )}
                                        </td>
                                        <td className="p-1 max-w-[120px] truncate text-muted-foreground">{d.motivoGlosa || '-'}</td>
                                        <td className="p-1 text-right">
                                          {editandoValorRecurso === d.id ? (
                                            <Input
                                              className="h-6 text-xs w-20"
                                              type="number"
                                              step="0.01"
                                              value={valoresRecurso[d.id] ?? d.valorGlosa}
                                              onChange={(e) => setValoresRecurso(prev => ({ ...prev, [d.id]: e.target.value }))}
                                              onBlur={() => {
                                                setEditandoValorRecurso(null);
                                                const val = parseFloat(valoresRecurso[d.id] ?? String(d.valorGlosa));
                                                if (!isNaN(val)) {
                                                  salvarValorRecursoMutation.mutate({ conciliadoId: d.id, valorRecurso: val });
                                                }
                                              }}
                                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                              autoFocus
                                            />
                                          ) : (
                                            <span
                                              className="cursor-pointer hover:underline text-blue-700 text-xs"
                                              onClick={(e) => { e.stopPropagation(); setEditandoValorRecurso(d.id); if (!valoresRecurso[d.id]) setValoresRecurso(prev => ({ ...prev, [d.id]: String(d.valorRecurso ?? d.valorGlosa) })); }}
                                            >
                                              {formatarMoeda(Number(valoresRecurso[d.id] ?? d.valorRecurso ?? d.valorGlosa))}
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-1 text-center">
                                          <Button
                                            variant={itensGlosaAceita[d.id] || d.glosaAceita ? "destructive" : "outline"}
                                            size="sm"
                                            className="h-5 px-1 text-[10px]"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const novoEstado = !(itensGlosaAceita[d.id] || d.glosaAceita);
                                              setItensGlosaAceita(prev => ({ ...prev, [d.id]: novoEstado }));
                                              marcarGlosaAceitaMutation.mutate({ conciliadoId: d.id, aceita: novoEstado });
                                            }}
                                          >
                                            {itensGlosaAceita[d.id] || d.glosaAceita ? (
                                              <><ThumbsDown className="h-3 w-3 mr-0.5" /> Aceita</>
                                            ) : (
                                              <><Check className="h-3 w-3 mr-0.5" /> Aceitar</>
                                            )}
                                          </Button>
                                          {(itensGlosaAceita[d.id] || d.glosaAceita) && d.glosaAceitaPor && (
                                            <span className="text-[9px] text-muted-foreground block">{d.glosaAceitaPor}</span>
                                          )}
                                        </td>
                                        <td className="p-1 min-w-[200px]">
                                          {editandoJustificativa === d.id ? (
                                            <div className="flex gap-1">
                                              <Input
                                                className="h-6 text-xs"
                                                value={justificativasItens[d.id] || ''}
                                                onChange={(e) => setJustificativasItens(prev => ({
                                                  ...prev,
                                                  [d.id]: e.target.value
                                                }))}
                                                maxLength={150}
                                                placeholder="Justificativa (max 150 chars)"
                                                onBlur={() => setEditandoJustificativa(null)}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') setEditandoJustificativa(null);
                                                }}
                                                autoFocus
                                              />
                                            </div>
                                          ) : (
                                            <div
                                              className={`flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50 ${justificativasItens[d.id] ? 'text-green-700 bg-green-50' : 'text-muted-foreground italic'}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditandoJustificativa(d.id);
                                              }}
                                            >
                                              {justificativasItens[d.id] ? (
                                                <span className="truncate max-w-[180px] text-xs">{justificativasItens[d.id]}</span>
                                              ) : (
                                                <span className="text-xs">Clique para adicionar</span>
                                              )}
                                              <Pencil className="h-3 w-3 flex-shrink-0" />
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ),
                    ])}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog Gerar Excel */}
      <Dialog open={dialogExcel} onOpenChange={setDialogExcel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Excel de Recurso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Será gerado um arquivo Excel com {guiasSelecionadas.size} guia(s) selecionada(s).
              </p>
              {Object.keys(justificativasItens).length > 0 && (
                <p className="text-xs text-green-600">
                  <CheckCircle2 className="h-3 w-3 inline mr-1" />
                  {Object.keys(justificativasItens).length} justificativa(s) individual(is) serão incluídas
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Justificativa Padrão (para itens sem justificativa individual)</label>
              <Textarea
                className="mt-1"
                placeholder="Digite a justificativa padrão que será aplicada aos itens sem justificativa individual..."
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">Máx. 150 caracteres para XML TISS</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogExcel(false)}>Cancelar</Button>
            <Button onClick={handleGerarExcel} disabled={gerarExcelMutation.isPending}>
              <Download className="h-4 w-4 mr-2" />
              {gerarExcelMutation.isPending ? "Gerando..." : "Gerar Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Gerar XML TISS */}
      <Dialog open={dialogXml} onOpenChange={setDialogXml}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar XML TISS de Recurso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Será gerado um XML no formato TISS com {guiasSelecionadas.size} guia(s) selecionada(s), incluindo todos os itens (pagos e glosados).
            </p>
            {Object.keys(justificativasItens).length > 0 && (
              <p className="text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3 inline mr-1" />
                {Object.keys(justificativasItens).length} justificativa(s) individual(is) serão incluídas no XML
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Registro ANS</label>
                <Input
                  className="mt-1"
                  placeholder="Ex: 302147"
                  value={registroANS}
                  onChange={(e) => setRegistroANS(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">CNPJ Operadora</label>
                <Input
                  className="mt-1"
                  placeholder="Apenas números"
                  value={cnpjOperadora}
                  onChange={(e) => setCnpjOperadora(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nº Demonstrativo</label>
                <Input
                  className="mt-1"
                  placeholder="Opcional"
                  value={numeroDemonstrativo}
                  onChange={(e) => setNumeroDemonstrativo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nº Protocolo</label>
                <Input
                  className="mt-1"
                  placeholder="Opcional"
                  value={numeroProtocolo}
                  onChange={(e) => setNumeroProtocolo(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogXml(false)}>Cancelar</Button>
            <Button onClick={handleGerarXml} disabled={gerarXmlMutation.isPending}>
              <FileCode className="h-4 w-4 mr-2" />
              {gerarXmlMutation.isPending ? "Gerando..." : "Gerar XML TISS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
