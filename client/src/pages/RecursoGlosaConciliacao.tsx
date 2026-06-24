import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileSpreadsheet, FileCode, Search, Filter, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import * as XLSX from "xlsx";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RecursoGlosaConciliacao() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competencia, setCompetencia] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [agrupamento, setAgrupamento] = useState<"guia" | "data" | "lote">("guia");
  const [busca, setBusca] = useState("");
  const [apenasNaoRecursados, setApenasNaoRecursados] = useState(true);
  const [guiasSelecionadas, setGuiasSelecionadas] = useState<Set<string>>(new Set());
  const [guiaExpandida, setGuiaExpandida] = useState<string | null>(null);
  const [dialogXml, setDialogXml] = useState(false);
  const [dialogExcel, setDialogExcel] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [registroANS, setRegistroANS] = useState("");
  const [cnpjOperadora, setCnpjOperadora] = useState("");
  const [numeroDemonstrativo, setNumeroDemonstrativo] = useState("");
  const [numeroProtocolo, setNumeroProtocolo] = useState("");

  // Queries
  const { data: competencias } = trpc.faturamentoUnificado.competenciasDisponiveis.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual?.id }
  );

  const { data: convenios } = trpc.faturamentoUnificado.conveniosConciliados.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual?.id }
  );

  const { data: itensGlosados, isLoading, refetch } = trpc.faturamentoUnificado.itensGlosadosParaRecurso.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
      competencia: competencia !== "todos" ? competencia : undefined,
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
    },
    { enabled: !!estabelecimentoAtual?.id && !!guiaExpandida }
  );

  // Mutations
  const gerarExcelMutation = trpc.faturamentoUnificado.gerarExcelRecursoConciliacao.useMutation({
    onSuccess: (data) => {
      // Criar workbook Excel
      const ws = XLSX.utils.json_to_sheet(data.dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Recurso Glosa");

      // Aba de totais
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
      // Download do XML
      if (data.xmlUrl) {
        window.open(data.xmlUrl, '_blank');
      }
    },
    onError: (error) => {
      toast.error("Erro ao gerar XML: " + error.message);
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

  const resumo = itensGlosados?.resumo;

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
                <span className="text-sm font-medium">Filtros:</span>
              </div>

              <Select value={competencia} onValueChange={setCompetencia}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Competência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {competencias?.map((c: any) => (
                    <SelectItem key={c.competencia} value={c.competencia}>
                      {c.competencia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {convenios?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={agrupamento} onValueChange={(v: any) => setAgrupamento(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Agrupar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guia">Por Guia</SelectItem>
                  <SelectItem value="data">Por Data</SelectItem>
                  <SelectItem value="lote">Por Lote</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 w-[200px]"
                  placeholder="Buscar guia, paciente..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={apenasNaoRecursados}
                  onCheckedChange={(v) => setApenasNaoRecursados(!!v)}
                />
                Apenas não recursados
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Itens Glosados */}
        <Card>
          <CardHeader className="p-3 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Itens Glosados ({itensGlosados?.total || 0})
              </CardTitle>
              {guiasSelecionadas.size > 0 && (
                <Badge variant="secondary">
                  {guiasSelecionadas.size} selecionada(s)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !itensGlosados?.items?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum item glosado encontrado com os filtros atuais</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left w-8">
                        <Checkbox
                          checked={guiasSelecionadas.size === itensGlosados.items.length && itensGlosados.items.length > 0}
                          onCheckedChange={toggleTodas}
                        />
                      </th>
                      <th className="p-2 text-left w-8"></th>
                      <th className="p-2 text-left">{agrupamento === 'guia' ? 'Guia' : agrupamento === 'data' ? 'Data' : 'Lote'}</th>
                      {agrupamento === 'guia' && <th className="p-2 text-left">Paciente</th>}
                      <th className="p-2 text-left">Convênio</th>
                      <th className="p-2 text-right">Itens Glosados</th>
                      <th className="p-2 text-right">Valor Faturado</th>
                      <th className="p-2 text-right">Valor Pago</th>
                      <th className="p-2 text-right">Valor Glosa</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensGlosados.items.map((item: any) => (
                      <>
                        <tr
                          key={item.chave}
                          className={`border-b hover:bg-muted/30 cursor-pointer ${guiasSelecionadas.has(item.chave) ? 'bg-primary/5' : ''}`}
                          onClick={() => {
                            if (agrupamento === 'guia' && item.numeroGuia) {
                              setGuiaExpandida(guiaExpandida === item.numeroGuia ? null : item.numeroGuia);
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
                          </td>
                          <td className="p-2 font-mono font-medium">
                            {agrupamento === 'guia' ? item.numeroGuia : agrupamento === 'data' ? item.dataExecucao : item.lote}
                          </td>
                          {agrupamento === 'guia' && (
                            <td className="p-2 max-w-[200px] truncate">{item.pacienteNome || '-'}</td>
                          )}
                          <td className="p-2">{item.convenio || '-'}</td>
                          <td className="p-2 text-right font-medium">{item.totalItensGlosados}</td>
                          <td className="p-2 text-right">{formatarMoeda(item.valorFaturado)}</td>
                          <td className="p-2 text-right">{formatarMoeda(item.valorPago)}</td>
                          <td className="p-2 text-right font-medium text-red-600">{formatarMoeda(item.valorGlosa)}</td>
                          <td className="p-2 text-center">
                            {item.xmlGerado ? (
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
                        </tr>
                        {/* Detalhe expandido da guia */}
                        {agrupamento === 'guia' && guiaExpandida === item.numeroGuia && detalheGuia && (
                          <tr key={`${item.chave}-detail`}>
                            <td colSpan={10} className="p-0">
                              <div className="bg-muted/20 border-l-4 border-primary/30 p-3 mx-2 mb-2 rounded">
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Itens glosados da guia {item.numeroGuia}:
                                </p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-1 text-left">Código</th>
                                      <th className="p-1 text-left">Descrição</th>
                                      <th className="p-1 text-left">Tipo</th>
                                      <th className="p-1 text-center">Qtde</th>
                                      <th className="p-1 text-right">Faturado</th>
                                      <th className="p-1 text-right">Pago</th>
                                      <th className="p-1 text-right">Glosa</th>
                                      <th className="p-1 text-left">Cód. Glosa</th>
                                      <th className="p-1 text-left">Motivo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalheGuia.map((d: any) => (
                                      <tr key={d.id} className="border-b border-dashed">
                                        <td className="p-1 font-mono">{d.codigoItem}</td>
                                        <td className="p-1 max-w-[200px] truncate">{d.descricaoItem}</td>
                                        <td className="p-1">{d.tipoItem || '-'}</td>
                                        <td className="p-1 text-center">{d.quantidade}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorFaturado)}</td>
                                        <td className="p-1 text-right">{formatarMoeda(d.valorPago)}</td>
                                        <td className="p-1 text-right text-red-600">{formatarMoeda(d.valorGlosa)}</td>
                                        <td className="p-1">
                                          {d.codigoGlosa && (
                                            <Badge variant="outline" className="text-xs">{d.codigoGlosa}</Badge>
                                          )}
                                        </td>
                                        <td className="p-1 max-w-[150px] truncate text-muted-foreground">{d.motivoGlosa || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
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
            </div>
            <div>
              <label className="text-sm font-medium">Justificativa para o Recurso (opcional)</label>
              <Textarea
                className="mt-1"
                placeholder="Digite a justificativa que será aplicada a todos os itens..."
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
