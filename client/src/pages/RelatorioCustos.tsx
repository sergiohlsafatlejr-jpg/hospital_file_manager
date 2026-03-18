import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardCustos from "@/components/DashboardCustos";
import ComparacaoCustoConvenio from "@/components/ComparacaoCustoConvenio";
import CustosPorConvenio from "@/components/CustosPorConvenio";
import CustosPorConta from "@/components/CustosPorConta";
import CustosPorSetor from "@/components/CustosPorSetor";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Download, ChevronLeft, ChevronRight, Filter, X,
  Package, RefreshCw, Database, Cloud, CheckCircle2, AlertCircle, Clock, Loader2,
  BarChart3, TableIcon, DollarSign, Scale, Building2,
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | null | undefined, decimals: number = 4): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const TIPO_PROD_LABELS: Record<string, string> = {
  M: "Medicamento",
  T: "Taxa",
  O: "Outros",
};

export default function RelatorioCustos() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // Tab state
  const [activeTab, setActiveTab] = useState("dashboard");

  // Dashboard filters
  const [dashTipoprod, setDashTipoprod] = useState<string>("");
  const [dashCodtbmm, setDashCodtbmm] = useState<string>("");
  const [dashLoaded, setDashLoaded] = useState(false);

  // Comparação filters
  const [compTipoprod, setCompTipoprod] = useState<string>("");
  const [compCodtbmm, setCompCodtbmm] = useState<string>("");
  const [compConvenio, setCompConvenio] = useState<string>("");
  const [compBusca, setCompBusca] = useState("");
  const [compBuscaInput, setCompBuscaInput] = useState("");
  const [compApenasComPrejuizo, setCompApenasComPrejuizo] = useState(false);
  const [compPagina, setCompPagina] = useState(1);
  const [compLoaded, setCompLoaded] = useState(false);

  // Table filters
  const [tipoprod, setTipoprod] = useState<string>("");
  const [codtbmm, setCodtbmm] = useState<string>("");
  const [tblConvenio, setTblConvenio] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [pagina, setPagina] = useState(1);
  const limit = 50;

  // Sync status - refetch a cada 5s quando em_andamento
  const statusSyncInput = useMemo(() => ({ estabelecimentoId }), [estabelecimentoId]);
  const statusSync = trpc.relatorioCustos.statusSincronizacao.useQuery(
    statusSyncInput,
    {
      enabled: estabelecimentoId > 0,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === "em_andamento" ? 5000 : false;
      },
    }
  );

  // Filter options
  const opcoesInput = useMemo(() => ({ estabelecimentoId }), [estabelecimentoId]);
  const opcoesFiltro = trpc.relatorioCustos.opcoesFiltro.useQuery(
    opcoesInput,
    { enabled: estabelecimentoId > 0 }
  );

  // Dashboard metrics
  const dashInput = useMemo(() => ({
    estabelecimentoId,
    tipoprod: dashTipoprod || undefined,
    codtbmm: dashCodtbmm || undefined,
  }), [estabelecimentoId, dashTipoprod, dashCodtbmm]);

  const dashMetricas = trpc.relatorioCustos.metricasDashboard.useQuery(
    dashInput,
    { enabled: estabelecimentoId > 0 && dashLoaded }
  );

  // Comparação data
  const compInput = useMemo(() => ({
    estabelecimentoId,
    tipoprod: compTipoprod || undefined,
    codtbmm: compCodtbmm || undefined,
    convenio: compConvenio || undefined,
    busca: compBusca || undefined,
    apenasComPrejuizo: compApenasComPrejuizo || undefined,
    limit: 50,
    offset: (compPagina - 1) * 50,
  }), [estabelecimentoId, compTipoprod, compCodtbmm, compConvenio, compBusca, compApenasComPrejuizo, compPagina]);

  const comparacaoData = trpc.relatorioCustos.comparacaoCustoConvenio.useQuery(
    compInput,
    { enabled: estabelecimentoId > 0 && compLoaded }
  );

  // Table data
  const tableInput = useMemo(() => ({
    estabelecimentoId,
    tipoprod: tipoprod || undefined,
    codtbmm: codtbmm || undefined,
    convenio: tblConvenio || undefined,
    busca: busca || undefined,
    limit,
    offset: (pagina - 1) * limit,
  }), [estabelecimentoId, tipoprod, codtbmm, tblConvenio, busca, pagina]);

  const tableData = trpc.relatorioCustos.buscar.useQuery(
    tableInput,
    { enabled: estabelecimentoId > 0 && activeTab === "tabela" }
  );

  // Sync mutation
  const utils = trpc.useUtils();
  const syncMutation = trpc.relatorioCustos.sincronizar.useMutation({
    onSuccess: (result) => {
      if (result.sucesso) {
        toast.success(result.mensagem);
        utils.relatorioCustos.statusSincronizacao.invalidate();
        utils.relatorioCustos.opcoesFiltro.invalidate();
        if (dashLoaded) {
          utils.relatorioCustos.metricasDashboard.invalidate();
        }
        if (activeTab === "tabela") {
          utils.relatorioCustos.buscar.invalidate();
        }
      } else {
        toast.error(result.mensagem);
      }
    },
    onError: (err) => {
      toast.error(`Erro na sincronizacao: ${err.message}`);
    },
  });

  const handleSync = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Selecione um estabelecimento para sincronizar");
      return;
    }
    syncMutation.mutate({ estabelecimentoId });
  };

  const handleLoadDashboard = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    setDashLoaded(true);
  };

  const handleSearch = () => {
    setBusca(buscaInput);
    setPagina(1);
  };

  const handleClearFilters = () => {
    setTipoprod("");
    setCodtbmm("");
    setTblConvenio("");
    setBusca("");
    setBuscaInput("");
    setPagina(1);
  };

  const handleClearDashFilters = () => {
    setDashTipoprod("");
    setDashCodtbmm("");
  };

  const handleLoadComparacao = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    setCompLoaded(true);
  };

  const handleCompSearch = () => {
    setCompBusca(compBuscaInput);
    setCompPagina(1);
  };

  const handleClearCompFilters = () => {
    setCompTipoprod("");
    setCompCodtbmm("");
    setCompConvenio("");
    setCompBusca("");
    setCompBuscaInput("");
    setCompApenasComPrejuizo(false);
    setCompPagina(1);
  };

  const compFilterCount = [compTipoprod, compCodtbmm, compConvenio, compBusca, compApenasComPrejuizo].filter(Boolean).length;

  const dashFilterCount = [dashTipoprod, dashCodtbmm].filter(Boolean).length;
  const tableFilterCount = [tipoprod, codtbmm, tblConvenio, busca].filter(Boolean).length;

  const handleExportCSV = () => {
    if (!tableData.data?.dados?.length) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    const headers = [
      "Codigo", "Tabela", "Descricao", "Tipo", "Cap. Estoque", "Mult. Estoque",
      "Mult. Faturas", "Unid. Estoque", "Unid. Faturas", "Custo Estoque",
      "Custo Mult. Fat.", "Valor MM", "Prevenbras", "Prefabsimp",
    ];
    const rows = tableData.data.dados.map((d: any) => [
      d.codprod, d.codtbmm, `"${(d.descricao || "").replace(/"/g, '""')}"`,
      d.tipoprodDesc, d.capacidadeEstoque ?? "", d.multEstoque ?? "",
      d.multFaturas ?? "", d.unidadeEstoque ?? "", d.unidadeFaturas ?? "",
      d.custoEstoque ?? "", d.custoMultFat ?? "", d.valormm ?? "",
      d.prevenbras ?? "", d.prefabsimp ?? "",
    ]);
    const csv = [headers.join(";"), ...rows.map((r: any[]) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custos_produtos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" />
              Relatorio de Custos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analise de custos de produtos, medicamentos e taxas
            </p>
          </div>

          {/* Sync status + button */}
          <div className="flex items-center gap-3">
            {statusSync.data && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {statusSync.data.status === "sucesso" && (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span>
                      {statusSync.data.totalRegistrosCache.toLocaleString("pt-BR")} produtos em cache
                      {statusSync.data.ultimaSincronizacao && (
                        <> | Sync: {new Date(statusSync.data.ultimaSincronizacao).toLocaleString("pt-BR")}</>
                      )}
                    </span>
                  </>
                )}
                {statusSync.data.status === "erro" && (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    <span title={statusSync.data.mensagemErro || undefined}>
                      {statusSync.data.mensagemErro
                        ? statusSync.data.mensagemErro.length > 60
                          ? statusSync.data.mensagemErro.substring(0, 60) + "..."
                          : statusSync.data.mensagemErro
                        : "Erro na ultima sincronizacao"}
                    </span>
                  </>
                )}
                {statusSync.data.status === "em_andamento" && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    <span>Sincronizando... (aguarde)</span>
                  </>
                )}
                {statusSync.data.status === "nunca" && (
                  <>
                    <Clock className="h-3.5 w-3.5 text-yellow-500" />
                    <span>Nunca sincronizado</span>
                  </>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending || estabelecimentoId <= 0 || statusSync.data?.status === "em_andamento"}
            >
              {syncMutation.isPending || statusSync.data?.status === "em_andamento" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {statusSync.data?.status === "em_andamento" ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="comparacao" className="gap-1.5">
              <Scale className="h-4 w-4" />
              Custo vs Convenio
            </TabsTrigger>
            <TabsTrigger value="custosConta" className="gap-1.5">
              <DollarSign className="h-4 w-4" />
              Custos por Conta
            </TabsTrigger>
            <TabsTrigger value="custosConvenio" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Custos por Convênio
            </TabsTrigger>
            <TabsTrigger value="custosSetor" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Custos por Setor
            </TabsTrigger>
            <TabsTrigger value="tabela" className="gap-1.5">
              <TableIcon className="h-4 w-4" />
              Tabela Detalhada
            </TabsTrigger>
          </TabsList>

          {/* ======== ABA DASHBOARD ======== */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            {/* Dashboard Filters */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Label className="text-xs text-muted-foreground">Tipo Produto</Label>
                    <Select value={dashTipoprod} onValueChange={(v) => { setDashTipoprod(v === "all" ? "" : v); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(opcoesFiltro.data?.tiposProduto || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Tabela de Preco</Label>
                    <Select value={dashCodtbmm} onValueChange={(v) => { setDashCodtbmm(v === "all" ? "" : v); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {(opcoesFiltro.data?.tabelasPreco || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button size="sm" onClick={handleLoadDashboard} disabled={estabelecimentoId <= 0}>
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Carregar Dashboard
                  </Button>

                  {dashFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleClearDashFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Limpar filtros
                      <Badge variant="secondary" className="ml-1 text-xs">{dashFilterCount}</Badge>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <DashboardCustos
              metricas={dashMetricas.data}
              isLoading={dashMetricas.isLoading && dashLoaded}
            />
          </TabsContent>

          {/* ======== ABA CUSTO VS CONVÊNIO ======== */}
          <TabsContent value="comparacao" className="space-y-4 mt-4">
            {/* Filtros da comparação */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Label className="text-xs text-muted-foreground">Tipo Produto</Label>
                    <Select value={compTipoprod} onValueChange={(v) => { setCompTipoprod(v === "all" ? "" : v); setCompPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(opcoesFiltro.data?.tiposProduto || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Tabela de Preco</Label>
                    <Select value={compCodtbmm} onValueChange={(v) => { setCompCodtbmm(v === "all" ? "" : v); setCompPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {(opcoesFiltro.data?.tabelasPreco || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Convênio</Label>
                    <Select value={compConvenio} onValueChange={(v) => { setCompConvenio(v === "all" ? "" : v); setCompPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(opcoesFiltro.data?.convenios || comparacaoData.data?.conveniosDisponiveis || []).map((c: any) => (
                          <SelectItem key={c.codplaco} value={c.codplaco}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-64">
                    <Label className="text-xs text-muted-foreground">Buscar Produto</Label>
                    <div className="flex gap-1">
                      <Input
                        className="h-9 text-sm"
                        placeholder="Codigo ou descricao..."
                        value={compBuscaInput}
                        onChange={(e) => setCompBuscaInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCompSearch()}
                      />
                      <Button variant="outline" size="sm" className="h-9 px-2" onClick={handleCompSearch}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={compApenasComPrejuizo}
                        onChange={(e) => { setCompApenasComPrejuizo(e.target.checked); setCompPagina(1); }}
                        className="rounded border-border"
                      />
                      Apenas com prejuizo
                    </label>
                  </div>

                  {compFilterCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={handleClearCompFilters}>
                      <X className="h-3.5 w-3.5 mr-1" />
                      Limpar ({compFilterCount})
                    </Button>
                  )}

                  {!compLoaded && (
                    <Button size="sm" className="h-9" onClick={handleLoadComparacao}>
                      Carregar Comparacao
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dashboard de comparação */}
            {compLoaded && comparacaoData.isLoading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-[300px]" />
              </div>
            )}

            {compLoaded && comparacaoData.data && (
              <>
                {/* Fonte dos dados */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {comparacaoData.data.fonte === "cache_local" ? (
                    <><Database className="h-3.5 w-3.5" /> Fonte: Cache Local</>
                  ) : (
                    <><Cloud className="h-3.5 w-3.5" /> Fonte: PostgreSQL Direto</>
                  )}
                </div>

                <ComparacaoCustoConvenio data={comparacaoData.data} />

                {/* Tabela detalhada de itens */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Detalhamento por Item ({comparacaoData.data.total.toLocaleString("pt-BR")} itens)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 font-medium">Codigo</th>
                            <th className="pb-2 font-medium">Descricao</th>
                            <th className="pb-2 font-medium">Tipo</th>
                            <th className="pb-2 font-medium">Convênio</th>
                            <th className="pb-2 font-medium">Tabela</th>
                            <th className="pb-2 font-medium">Un. Fat.</th>
                            <th className="pb-2 font-medium text-right">Custo Hospital</th>
                            <th className="pb-2 font-medium text-right">Valor Convenio</th>
                            <th className="pb-2 font-medium text-right">Margem R$</th>
                            <th className="pb-2 font-medium text-right">Margem %</th>
                            <th className="pb-2 font-medium text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparacaoData.data.itens.map((item, i) => (
                            <tr key={`${item.codprod}-${item.codtbmm}-${item.codplaco}-${i}`} className={`border-b border-border/30 ${item.status === "prejuizo" ? "bg-red-500/5" : item.status === "lucro" ? "bg-green-500/5" : ""}`}>
                              <td className="py-1.5 font-mono">{item.codprod}</td>
                              <td className="py-1.5 max-w-[200px] truncate" title={item.descricao}>{item.descricao}</td>
                              <td className="py-1.5">{item.tipoprodDesc}</td>
                              <td className="py-1.5 max-w-[120px] truncate" title={item.nomeConvenio}>{item.nomeConvenio || "-"}</td>
                              <td className="py-1.5">{item.tabelaPrecoDesc}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">{item.unidadeFaturas || "-"}</td>
                              <td className="py-1.5 text-right font-mono">{formatCurrency(item.custoHospital)}</td>
                              <td className="py-1.5 text-right font-mono">{formatCurrency(item.valorConvenio)}</td>
                              <td className={`py-1.5 text-right font-mono font-medium ${item.margemReais >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatCurrency(item.margemReais)}
                              </td>
                              <td className={`py-1.5 text-right font-mono ${item.margemPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {item.margemPercent >= 0 ? "+" : ""}{item.margemPercent.toFixed(1)}%
                              </td>
                              <td className="py-1.5 text-center">
                                <Badge
                                  variant={item.status === "lucro" ? "default" : item.status === "prejuizo" ? "destructive" : "secondary"}
                                  className="text-[10px] px-1.5"
                                >
                                  {item.status === "lucro" ? "Lucro" : item.status === "prejuizo" ? "Prejuizo" : "Neutro"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                          {comparacaoData.data.itens.length === 0 && (
                            <tr>
                              <td colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum item encontrado com os filtros selecionados</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginação */}
                    {comparacaoData.data.totalPaginas > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-xs text-muted-foreground">
                          Pagina {comparacaoData.data.pagina} de {comparacaoData.data.totalPaginas}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompPagina((p) => Math.max(1, p - 1))}
                            disabled={compPagina <= 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompPagina((p) => Math.min(comparacaoData.data!.totalPaginas, p + 1))}
                            disabled={compPagina >= comparacaoData.data.totalPaginas}
                          >
                            Proximo
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {!compLoaded && (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Clique em "Carregar Comparacao" para analisar custo do hospital vs valor pago pelos convenios</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ======== ABA CUSTOS POR CONTA ======== */}
          <TabsContent value="custosConta" className="space-y-4 mt-4">
            <CustosPorConta estabelecimentoId={estabelecimentoId} />
          </TabsContent>

                {/* ======== ABA CUSTOS POR CONVÊNIO ======== */}
          <TabsContent value="custosConvenio" className="space-y-4 mt-4">
            <CustosPorConvenio estabelecimentoId={estabelecimentoId} />
          </TabsContent>

          {/* ======== ABA CUSTOS POR SETOR ======== */}
          <TabsContent value="custosSetor" className="space-y-4 mt-4">
            <CustosPorSetor estabelecimentoId={estabelecimentoId} />
          </TabsContent>

          {/* ======== ABA TABELA ======== */}
          <TabsContent value="tabela" className="space-y-4 mt-4">
            {/* Table Filters */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Label className="text-xs text-muted-foreground">Tipo Produto</Label>
                    <Select value={tipoprod} onValueChange={(v) => { setTipoprod(v === "all" ? "" : v); setPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(opcoesFiltro.data?.tiposProduto || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Tabela de Preco</Label>
                    <Select value={codtbmm} onValueChange={(v) => { setCodtbmm(v === "all" ? "" : v); setPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {(opcoesFiltro.data?.tabelasPreco || []).map((t) => (
                          <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Convênio</Label>
                    <Select value={tblConvenio} onValueChange={(v) => { setTblConvenio(v === "all" ? "" : v); setPagina(1); }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {(opcoesFiltro.data?.convenios || []).map((c: any) => (
                          <SelectItem key={c.codplaco} value={c.codplaco}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-muted-foreground">Buscar</Label>
                    <div className="flex gap-2">
                      <Input
                        className="h-9 text-sm"
                        placeholder="Codigo ou descricao do produto..."
                        value={buscaInput}
                        onChange={(e) => setBuscaInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      />
                      <Button size="sm" variant="secondary" onClick={handleSearch}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {tableFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Limpar
                      <Badge variant="secondary" className="ml-1 text-xs">{tableFilterCount}</Badge>
                    </Button>
                  )}

                  <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!tableData.data?.dados?.length}>
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {tableData.isLoading ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : !tableData.data?.dados?.length ? (
                  <div className="py-16 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">Nenhum produto encontrado</h3>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      {estabelecimentoId <= 0
                        ? "Selecione um estabelecimento"
                        : "Tente sincronizar os dados ou ajustar os filtros"}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Result header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{tableData.data.total.toLocaleString("pt-BR")} produtos encontrados</span>
                        <Badge variant="secondary" className={`text-xs ${
                          tableData.data.fonte === "cache_local"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        }`}>
                          {tableData.data.fonte === "cache_local" ? (
                            <><Database className="h-3 w-3 mr-1" /> Cache</>
                          ) : (
                            <><Cloud className="h-3 w-3 mr-1" /> PG Direto</>
                          )}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Pagina {tableData.data.pagina} de {tableData.data.totalPaginas}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">Codigo</TableHead>
                            <TableHead className="w-[60px]">Tabela</TableHead>
                            <TableHead className="min-w-[200px]">Descricao</TableHead>
                            <TableHead className="w-[100px]">Tipo</TableHead>
                            <TableHead className="w-[130px]">Convênio</TableHead>
                            <TableHead className="w-[80px] text-right">Mult. Est.</TableHead>
                            <TableHead className="w-[80px] text-right">Mult. Fat.</TableHead>
                            <TableHead className="w-[70px]">Un. Est.</TableHead>
                            <TableHead className="w-[70px]">Un. Fat.</TableHead>
                            <TableHead className="w-[110px] text-right">Custo Est.</TableHead>
                            <TableHead className="w-[110px] text-right">Custo Fat.</TableHead>
                            <TableHead className="w-[110px] text-right">Valor MM</TableHead>
                            <TableHead className="w-[110px] text-right">Prevenbras</TableHead>
                            <TableHead className="w-[110px] text-right">Prefabsimp</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.data.dados.map((d: any, idx: number) => (
                            <TableRow key={`${d.codprod}-${d.codtbmm}-${d.codplaco || ''}-${idx}`} className="text-sm">
                              <TableCell className="font-mono text-xs">{d.codprod}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{d.codtbmm}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[250px] truncate" title={d.descricao}>
                                {d.descricao}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${
                                    d.tipoprod === "M" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                    : d.tipoprod === "T" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                                  }`}
                                >
                                  {d.tipoprodDesc}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs max-w-[130px] truncate" title={d.nomeConvenio || ''}>
                                {d.nomeConvenio || "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatNumber(d.multEstoque, 2)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatNumber(d.multFaturas, 2)}</TableCell>
                              <TableCell className="text-xs">{d.unidadeEstoque || "-"}</TableCell>
                              <TableCell className="text-xs">{d.unidadeFaturas || "-"}</TableCell>
                              <TableCell className="text-right font-mono text-xs font-medium">{formatCurrency(d.custoEstoque)}</TableCell>
                              <TableCell className="text-right font-mono text-xs font-medium">{formatCurrency(d.custoMultFat)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(d.valormm)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(d.prevenbras)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatCurrency(d.prefabsimp)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {tableData.data.totalPaginas > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPagina((p) => Math.max(1, p - 1))}
                          disabled={pagina <= 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {tableData.data.pagina} / {tableData.data.totalPaginas}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPagina((p) => Math.min(tableData.data!.totalPaginas, p + 1))}
                          disabled={pagina >= tableData.data.totalPaginas}
                        >
                          Proximo
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
