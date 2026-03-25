import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Loader2, Database, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Receipt, Ban,
} from "lucide-react";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface CustosPorConvenioProps {
  estabelecimentoId: number;
}

type SortField = "codprod" | "convenio" | "descricao" | "tipoItem" | "quantidade" | "custoUnitario" | "custoTotal" | "valorCobradoUnitario" | "valorCobradoTotal" | "recebido" | "glosado" | "margem";
type SortDir = "asc" | "desc";

export default function CustosPorConvenio({ estabelecimentoId }: CustosPorConvenioProps) {
  const [convenio, setConvenio] = useState<string>("");
  const [tipoItem, setTipoItem] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [activeTab, setActiveTab] = useState<"detalhado" | "resumo" | "prejuizo" | "lucro">("detalhado");
  const [sortField, setSortField] = useState<SortField>("descricao");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedConvenio, setExpandedConvenio] = useState<string | null>(null);

  const queryInput = useMemo(() => ({
    estabelecimentoId,
    convenio: convenio && convenio !== "todos" ? convenio : undefined,
    tipoItem: tipoItem && tipoItem !== "todos" ? tipoItem : undefined,
    competencia: competencia && competencia !== "todos" ? competencia : undefined,
    busca: busca || undefined,
  }), [estabelecimentoId, convenio, tipoItem, competencia, busca]);

  const { data, isLoading, error } = trpc.relatorioCustos.custosPorConvenio.useQuery(queryInput, {
    staleTime: 5 * 60 * 1000,
  });

  const handleBusca = () => {
    setBusca(buscaInput);
  };

  const limparFiltros = () => {
    setConvenio("");
    setTipoItem("");
    setCompetencia("");
    setBusca("");
    setBuscaInput("");
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedItensDetalhados = useMemo(() => {
    if (!data?.itensDetalhados) return [];
    return [...data.itensDetalhados].sort((a, b) => {
      let cmp = 0;
      const fieldA = (a as any)[sortField];
      const fieldB = (b as any)[sortField];
      if (typeof fieldA === "string" && typeof fieldB === "string") {
        cmp = fieldA.localeCompare(fieldB, "pt-BR");
      } else if (typeof fieldA === "number" && typeof fieldB === "number") {
        cmp = fieldA - fieldB;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data?.itensDetalhados, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-primary ${className || ""}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon field={field} />
      </div>
    </TableHead>
  );

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>Erro ao carregar dados: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Custos por Convênio</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Dados do Warleine (PostgreSQL). Cada linha mostra um item, o convênio, custo unitário, valor cobrado e se dá{" "}
            <span className="text-green-600 font-medium">lucro</span> ou{" "}
            <span className="text-red-600 font-medium">prejuízo</span>.
          </p>
        </CardHeader>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Convênio</label>
              <Select value={convenio} onValueChange={setConvenio}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {data?.conveniosDisponiveis.map((c) => (
                    <SelectItem key={c.codplaco} value={c.codplaco}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
              <Select value={tipoItem} onValueChange={setTipoItem}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="P">Produto</SelectItem>
                  <SelectItem value="M">Medicamento</SelectItem>
                  <SelectItem value="T">Taxa</SelectItem>
                  <SelectItem value="S">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px]">
              <label className="text-xs text-muted-foreground mb-1 block">Competência</label>
              <Select value={competencia} onValueChange={setCompetencia}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Últimos 12 meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Últimos 12 meses</SelectItem>
                  {data?.competenciasDisponiveis.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Buscar item</label>
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  placeholder="Nome ou código do produto..."
                  value={buscaInput}
                  onChange={(e) => setBuscaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBusca()}
                />
                <Button size="sm" className="h-9" onClick={handleBusca}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button variant="outline" size="sm" className="h-9" onClick={limparFiltros}>
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Faturado</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(data.kpis.valorFaturadoTotal)}</p>
                <p className="text-xs text-muted-foreground">{data.kpis.totalConvenios} convênios</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Custo Total</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(data.kpis.custoTotal)}</p>
                <p className="text-xs text-muted-foreground">{data.kpis.totalItensAnalisados} itens</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Margem Total</p>
                <p className={`text-xl font-bold ${data.kpis.margemTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(data.kpis.margemTotal)}
                </p>
                <p className="text-xs text-muted-foreground">{data.kpis.margemMediaPercent.toFixed(1)}% média</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Itens sem Custo</p>
                <p className="text-xl font-bold text-yellow-600">{data.kpis.totalItensSemCusto}</p>
                <p className="text-xs text-muted-foreground">sem custo cadastrado</p>
              </CardContent>
            </Card>
          </div>
          {/* KPIs Recebido/Glosado */}
          {(data.kpis as any).recebidoTotal !== undefined && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> Total Recebido</p>
                  <p className="text-xl font-bold text-blue-500">{formatCurrency((data.kpis as any).recebidoTotal)}</p>
                  <p className="text-xs text-muted-foreground">{((data.kpis as any).taxaRecebimento || 0).toFixed(1)}% do faturado</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Ban className="h-3 w-3" /> Total Glosado</p>
                  <p className="text-xl font-bold text-orange-500">{formatCurrency((data.kpis as any).glosadoTotal)}</p>
                  <p className="text-xs text-muted-foreground">{((data.kpis as any).taxaGlosa || 0).toFixed(1)}% do faturado</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Perda Líquida</p>
                  <p className="text-xl font-bold text-red-400">{formatCurrency(data.kpis.valorFaturadoTotal - ((data.kpis as any).recebidoTotal || 0))}</p>
                  <p className="text-xs text-muted-foreground">Faturado - Recebido</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Pendente</p>
                  <p className="text-xl font-bold text-amber-500">{formatCurrency(data.kpis.valorFaturadoTotal - ((data.kpis as any).recebidoTotal || 0) - ((data.kpis as any).glosadoTotal || 0))}</p>
                  <p className="text-xs text-muted-foreground">Não recebido e não glosado</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Abas */}
          <div className="flex gap-1 border-b">
            {[
              { key: "detalhado" as const, label: "Tabela Detalhada" },
              { key: "resumo" as const, label: "Resumo por Convênio" },
              { key: "prejuizo" as const, label: "Top Prejuízo" },
              { key: "lucro" as const, label: "Top Lucro" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ======== ABA TABELA DETALHADA ======== */}
          {activeTab === "detalhado" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tabela Detalhada - Custo vs. Convênio</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cada linha = 1 item + 1 convênio. Mostra custo unitário do hospital, valor cobrado ao convênio, e se dá lucro ou prejuízo.
                  Clique nos cabeçalhos para ordenar.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <SortableHead field="codprod">Código</SortableHead>
                        <SortableHead field="convenio">Convênio</SortableHead>
                        <SortableHead field="descricao">Descrição</SortableHead>
                        <SortableHead field="tipoItem" className="text-center">Tipo</SortableHead>
                        <SortableHead field="quantidade" className="text-right">Qtd</SortableHead>
                        <TableHead className="text-center">Unid.</TableHead>
                        <SortableHead field="custoUnitario" className="text-right">Custo Unit.</SortableHead>
                        <SortableHead field="custoTotal" className="text-right">Custo Total</SortableHead>
                        <SortableHead field="valorCobradoUnitario" className="text-right">Vlr Cobrado Unit.</SortableHead>
                        <SortableHead field="valorCobradoTotal" className="text-right">Vlr Cobrado Total</SortableHead>
                        <SortableHead field="recebido" className="text-right">Recebido</SortableHead>
                        <SortableHead field="glosado" className="text-right">Glosado</SortableHead>
                        <SortableHead field="margem" className="text-right">Margem</SortableHead>
                        <TableHead className="text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedItensDetalhados.map((item, idx) => (
                        <TableRow
                          key={`${item.codprod}-${item.codplaco}-${item.unidade}-${idx}`}
                          className={item.resultado === "prejuizo" ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{item.codprod}</TableCell>
                          <TableCell className="text-xs font-medium whitespace-nowrap max-w-[150px] truncate" title={item.convenio}>
                            {item.convenio}
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[250px] truncate" title={item.descricao}>
                            {item.descricao}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                item.tipoItemLabel === "Medicamento" ? "border-blue-400 text-blue-600" :
                                item.tipoItemLabel === "Taxa" ? "border-green-400 text-green-600" :
                                "border-gray-400 text-gray-600"
                              }`}
                            >
                              {item.tipoItemLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(item.quantidade)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{item.unidade}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.custoUnitario)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.custoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.valorCobradoUnitario)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatCurrency(item.valorCobradoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-500">{formatCurrency((item as any).recebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-orange-500">{formatCurrency((item as any).glosado)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-bold ${
                            item.margem > 0 ? "text-green-600" : item.margem < 0 ? "text-red-600" : "text-muted-foreground"
                          }`}>
                            {formatCurrency(item.margem)}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.resultado === "lucro" ? (
                              <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                                <TrendingUp className="h-3 w-3 mr-1" />Lucro
                              </Badge>
                            ) : item.resultado === "prejuizo" ? (
                              <Badge variant="destructive" className="text-xs">
                                <TrendingDown className="h-3 w-3 mr-1" />Prejuízo
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Empate</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedItensDetalhados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                            Nenhum item encontrado para os filtros selecionados
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {data.totalItensDetalhados > 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center border-t">
                    Exibindo {sortedItensDetalhados.length} registros. Use os filtros para refinar a busca.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ======== ABA RESUMO POR CONVÊNIO ======== */}
          {activeTab === "resumo" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resumo por Convênio</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Total faturado e custo por convênio. Clique em um convênio para ver os itens com custo unitário vs valor faturado unitário.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Lançamentos</TableHead>
                        <TableHead className="text-right">Total Faturado</TableHead>
                        <TableHead className="text-right">Total Custo</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="text-right">Margem (%)</TableHead>
                        <TableHead className="text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.resumoPorConvenio.map((conv) => {
                        const isExpanded = expandedConvenio === conv.codplaco;
                        // Filtrar itens detalhados deste convênio
                        const itensDoConvenio = data.itensDetalhados.filter(
                          (item) => item.codplaco === conv.codplaco
                        );
                        return (
                          <>
                            <TableRow
                              key={conv.codplaco}
                              className={`cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""}`}
                              onClick={() => setExpandedConvenio(isExpanded ? null : conv.codplaco)}
                            >
                              <TableCell className="w-8 text-center">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-primary" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div>
                                  <span>{conv.convenio}</span>
                                  <span className="text-xs text-muted-foreground ml-2">({conv.codplaco})</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{conv.totalLancamentos.toLocaleString("pt-BR")}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatCurrency(conv.totalFaturado)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(conv.totalCusto)}</TableCell>
                              <TableCell className="text-right tabular-nums text-blue-500">{formatCurrency((conv as any).totalRecebido)}</TableCell>
                              <TableCell className="text-right tabular-nums text-orange-500">{formatCurrency((conv as any).totalGlosado)}</TableCell>
                              <TableCell className={`text-right tabular-nums font-bold ${conv.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatCurrency(conv.margem)}
                              </TableCell>
                              <TableCell className={`text-right tabular-nums ${conv.margemPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {conv.margemPercent.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={conv.resultado === "lucro" ? "default" : conv.resultado === "prejuizo" ? "destructive" : "secondary"}
                                  className={conv.resultado === "lucro" ? "bg-green-600 hover:bg-green-700" : ""}>
                                  {conv.resultado === "lucro" ? (
                                    <><TrendingUp className="h-3 w-3 mr-1" />Lucro</>
                                  ) : conv.resultado === "prejuizo" ? (
                                    <><TrendingDown className="h-3 w-3 mr-1" />Prejuízo</>
                                  ) : "Empate"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${conv.codplaco}-detail`}>
                                <TableCell colSpan={10} className="p-0 bg-muted/10">
                                  <div className="p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <DollarSign className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-semibold">Itens de {conv.convenio}</span>
                                      <Badge variant="outline" className="text-xs">{itensDoConvenio.length} itens</Badge>
                                    </div>
                                    <div className="overflow-x-auto rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="bg-muted/30">
                                            <TableHead className="text-xs">Código</TableHead>
                                            <TableHead className="text-xs">Descrição</TableHead>
                                            <TableHead className="text-xs text-center">Tipo</TableHead>
                                            <TableHead className="text-xs text-right">Qtd</TableHead>
                                            <TableHead className="text-xs text-center">Unid.</TableHead>
                                            <TableHead className="text-xs text-right">Custo Unit.</TableHead>
                                            <TableHead className="text-xs text-right">Vlr Faturado Unit.</TableHead>
                                            <TableHead className="text-xs text-right">Margem Unit.</TableHead>
                                            <TableHead className="text-xs text-right">Custo Total</TableHead>
                                            <TableHead className="text-xs text-right">Vlr Faturado Total</TableHead>
                                            <TableHead className="text-xs text-right">Recebido</TableHead>
                                            <TableHead className="text-xs text-right">Glosado</TableHead>
                                            <TableHead className="text-xs text-right">Margem Total</TableHead>
                                            <TableHead className="text-xs text-center">Resultado</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {itensDoConvenio.map((item, idx) => {
                                            const margemUnit = (item.valorCobradoUnitario || 0) - (item.custoUnitario || 0);
                                            return (
                                              <TableRow
                                                key={`${item.codprod}-${idx}`}
                                                className={item.resultado === "prejuizo" ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                                              >
                                                <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
                                                <TableCell className="text-xs max-w-[200px] truncate" title={item.descricao}>{item.descricao}</TableCell>
                                                <TableCell className="text-center">
                                                  <Badge variant="outline" className={`text-[10px] ${
                                                    item.tipoItemLabel === "Medicamento" ? "border-blue-400 text-blue-600" :
                                                    item.tipoItemLabel === "Taxa" ? "border-green-400 text-green-600" :
                                                    "border-gray-400 text-gray-600"
                                                  }`}>{item.tipoItemLabel}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-xs">{formatNumber(item.quantidade)}</TableCell>
                                                <TableCell className="text-center text-[10px] text-muted-foreground">{item.unidade}</TableCell>
                                                <TableCell className="text-right tabular-nums text-xs">{formatCurrency(item.custoUnitario)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-xs font-medium">{formatCurrency(item.valorCobradoUnitario)}</TableCell>
                                                <TableCell className={`text-right tabular-nums text-xs font-bold ${margemUnit > 0 ? "text-green-600" : margemUnit < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                                  {formatCurrency(margemUnit)}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-xs">{formatCurrency(item.custoTotal)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-xs font-medium">{formatCurrency(item.valorCobradoTotal)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-xs text-blue-500">{formatCurrency((item as any).recebido)}</TableCell>
                                                <TableCell className="text-right tabular-nums text-xs text-orange-500">{formatCurrency((item as any).glosado)}</TableCell>
                                                <TableCell className={`text-right tabular-nums text-xs font-bold ${item.margem > 0 ? "text-green-600" : item.margem < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                                  {formatCurrency(item.margem)}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                  {item.resultado === "lucro" ? (
                                                    <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-700">
                                                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />Lucro
                                                    </Badge>
                                                  ) : item.resultado === "prejuizo" ? (
                                                    <Badge variant="destructive" className="text-[10px]">
                                                      <TrendingDown className="h-2.5 w-2.5 mr-0.5" />Prejuízo
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="secondary" className="text-[10px]">Empate</Badge>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                          {itensDoConvenio.length === 0 && (
                                            <TableRow>
                                              <TableCell colSpan={14} className="text-center text-muted-foreground py-4 text-xs">
                                                Nenhum item detalhado encontrado para este convênio
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                      {data.resumoPorConvenio.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            Nenhum dado encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ======== ABA TOP PREJUÍZO ======== */}
          {activeTab === "prejuizo" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Top 20 Itens com Maior Prejuízo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Itens onde o hospital gasta mais do que recebe do convênio.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>#</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Vlr Cobrado</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Prejuízo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topItensPrejuizo.map((item, idx) => (
                        <TableRow key={idx} className="bg-red-50/30 dark:bg-red-950/10">
                          <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
                          <TableCell className="font-medium">{item.descricao}</TableCell>
                          <TableCell className="text-sm">{item.convenio}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(item.quantidade)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.valorCobrado)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.custoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-500">{formatCurrency((item as any).recebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-orange-500">{formatCurrency((item as any).glosado)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-red-600">{formatCurrency(item.margem)}</TableCell>
                        </TableRow>
                      ))}
                      {data.topItensPrejuizo.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-green-600 py-8">
                            Nenhum item com prejuízo encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ======== ABA TOP LUCRO ======== */}
          {activeTab === "lucro" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Top 20 Itens com Maior Lucro
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Itens onde o hospital recebe mais do que gasta.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>#</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Vlr Cobrado</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Lucro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topItensLucro.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
                          <TableCell className="font-medium">{item.descricao}</TableCell>
                          <TableCell className="text-sm">{item.convenio}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(item.quantidade)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.valorCobrado)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.custoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-500">{formatCurrency((item as any).recebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-orange-500">{formatCurrency((item as any).glosado)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-green-600">{formatCurrency(item.margem)}</TableCell>
                        </TableRow>
                      ))}
                      {data.topItensLucro.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            Nenhum item com lucro encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fonte dos dados */}
          <p className="text-xs text-muted-foreground text-center">
            Fonte: PostgreSQL Warleine (lancamen + contas + cadplaco + tabprod) | {data.fonte}
          </p>
        </>
      ) : null}
    </div>
  );
}
