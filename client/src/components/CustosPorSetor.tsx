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
  Loader2, Database, ArrowUpDown, ArrowUp, ArrowDown, Building2,
  ChevronDown, ChevronRight, BarChart3, HandCoins, ShieldAlert, Clock,
} from "lucide-react";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface CustosPorSetorProps {
  estabelecimentoId: number;
}

type SortField = "setor" | "totalLancamentos" | "totalItens" | "totalContas" | "totalFaturado" | "totalCusto" | "totalRecebido" | "totalGlosado" | "pendente" | "margem" | "margemPercent" | "taxaRecebimento" | "taxaGlosa";
type SortDir = "asc" | "desc";

export default function CustosPorSetor({ estabelecimentoId }: CustosPorSetorProps) {
  const [setor, setSetor] = useState<string>("");
  const [convenio, setConvenio] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [activeTab, setActiveTab] = useState<"resumo" | "detalhado" | "prejuizo" | "lucro">("resumo");
  const [sortField, setSortField] = useState<SortField>("totalFaturado");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedSetor, setExpandedSetor] = useState<string | null>(null);

  const queryInput = useMemo(() => ({
    estabelecimentoId,
    setor: setor && setor !== "todos" ? setor : undefined,
    convenio: convenio && convenio !== "todos" ? convenio : undefined,
    competencia: competencia && competencia !== "todos" ? competencia : undefined,
    busca: busca || undefined,
  }), [estabelecimentoId, setor, convenio, competencia, busca]);

  const { data, isLoading, error } = trpc.relatorioCustos.custosPorSetor.useQuery(queryInput, {
    staleTime: 5 * 60 * 1000,
  });

  const handleBusca = () => {
    setBusca(buscaInput);
  };

  const limparFiltros = () => {
    setSetor("");
    setConvenio("");
    setCompetencia("");
    setBusca("");
    setBuscaInput("");
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedResumo = useMemo(() => {
    if (!data?.resumoPorSetor) return [];
    return [...data.resumoPorSetor].sort((a, b) => {
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
  }, [data?.resumoPorSetor, sortField, sortDir]);

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
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Custos por Setor</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Análise de custos agrupados por setor/centro de custo. Identifique quais setores geram mais custo,
            quais têm <span className="text-green-600 font-medium">lucro</span> e quais operam com{" "}
            <span className="text-red-600 font-medium">prejuízo</span>. Inclui valores{" "}
            <span className="text-blue-600 font-medium">recebidos</span> e{" "}
            <span className="text-amber-600 font-medium">glosados</span>.
          </p>
        </CardHeader>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
              <Select value={setor} onValueChange={setSetor}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {data?.setoresDisponiveis.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
          {/* KPIs - Linha 1: Financeiro */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Setores</p>
                <p className="text-xl font-bold text-blue-600">{data.kpis.totalSetores}</p>
                <p className="text-xs text-muted-foreground">{data.kpis.totalLancamentos.toLocaleString("pt-BR")} lançamentos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Faturado</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(data.kpis.valorFaturadoTotal)}</p>
                <p className="text-xs text-muted-foreground">valor cobrado total</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Custo Total</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(data.kpis.custoTotal)}</p>
                <p className="text-xs text-muted-foreground">custo estoque/vlcusto</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Margem Total</p>
                <p className={`text-xl font-bold ${data.kpis.margemTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(data.kpis.margemTotal)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.kpis.setoresComLucro} lucro | {data.kpis.setoresComPrejuizo} prejuízo
                </p>
              </CardContent>
            </Card>
          </div>

          {/* KPIs - Linha 2: Recebido / Glosado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <HandCoins className="h-3.5 w-3.5 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Total Recebido</p>
                </div>
                <p className="text-xl font-bold text-blue-600">{formatCurrency((data.kpis as any).totalRecebido)}</p>
                <p className="text-xs text-muted-foreground">
                  Taxa: <span className="font-medium text-blue-600">{(data.kpis as any).taxaRecebimento?.toFixed(1) ?? '0.0'}%</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-xs text-muted-foreground">Total Glosado</p>
                </div>
                <p className="text-xl font-bold text-amber-600">{formatCurrency((data.kpis as any).totalGlosado)}</p>
                <p className="text-xs text-muted-foreground">
                  Taxa: <span className="font-medium text-amber-600">{(data.kpis as any).taxaGlosa?.toFixed(1) ?? '0.0'}%</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5 text-purple-500" />
                  <p className="text-xs text-muted-foreground">Pendente</p>
                </div>
                <p className="text-xl font-bold text-purple-600">
                  {formatCurrency((data.kpis.valorFaturadoTotal || 0) - ((data.kpis as any).totalRecebido || 0) - ((data.kpis as any).totalGlosado || 0))}
                </p>
                <p className="text-xs text-muted-foreground">faturado - recebido - glosado</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-xs text-muted-foreground">Perda Líquida</p>
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency((data.kpis as any).perdaLiquida)}</p>
                <p className="text-xs text-muted-foreground">faturado - recebido</p>
              </CardContent>
            </Card>
          </div>

          {/* Abas internas */}
          <div className="flex gap-1 border-b">
            {[
              { key: "resumo" as const, label: "Resumo por Setor", icon: <BarChart3 className="h-4 w-4 mr-1" /> },
              { key: "detalhado" as const, label: "Tabela Detalhada", icon: <Database className="h-4 w-4 mr-1" /> },
              { key: "prejuizo" as const, label: "Top Prejuízo", icon: <TrendingDown className="h-4 w-4 mr-1" /> },
              { key: "lucro" as const, label: "Top Lucro", icon: <TrendingUp className="h-4 w-4 mr-1" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* ======== ABA RESUMO POR SETOR ======== */}
          {activeTab === "resumo" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Resumo por Setor / Centro de Custo</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Visão consolidada por setor com faturado, recebido, glosado e margem. Clique em um setor para ver os top 5 itens.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8"></TableHead>
                        <SortableHead field="setor">Setor</SortableHead>
                        <SortableHead field="totalLancamentos" className="text-right">Lanç.</SortableHead>
                        <SortableHead field="totalContas" className="text-right">Contas</SortableHead>
                        <SortableHead field="totalFaturado" className="text-right">Faturado</SortableHead>
                        <SortableHead field="totalRecebido" className="text-right">Recebido</SortableHead>
                        <SortableHead field="totalGlosado" className="text-right">Glosado</SortableHead>
                        <SortableHead field="pendente" className="text-right">Pendente</SortableHead>
                        <SortableHead field="totalCusto" className="text-right">Custo</SortableHead>
                        <SortableHead field="margem" className="text-right">Margem</SortableHead>
                        <SortableHead field="taxaRecebimento" className="text-right">% Receb.</SortableHead>
                        <SortableHead field="taxaGlosa" className="text-right">% Glosa</SortableHead>
                        <TableHead className="text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedResumo.map((s) => (
                        <>
                          <TableRow
                            key={s.setor}
                            className={`cursor-pointer hover:bg-muted/30 ${s.resultado === "prejuizo" ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}
                            onClick={() => setExpandedSetor(expandedSetor === s.setor ? null : s.setor)}
                          >
                            <TableCell className="w-8 px-2">
                              {expandedSetor === s.setor
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                {s.setor}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{s.totalLancamentos.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.totalContas.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatCurrency(s.totalFaturado)}</TableCell>
                            <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency((s as any).totalRecebido)}</TableCell>
                            <TableCell className="text-right tabular-nums text-amber-600">{formatCurrency((s as any).totalGlosado)}</TableCell>
                            <TableCell className="text-right tabular-nums text-purple-600">{formatCurrency((s as any).pendente)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(s.totalCusto)}</TableCell>
                            <TableCell className={`text-right tabular-nums font-bold ${s.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(s.margem)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-blue-600">{(s as any).taxaRecebimento?.toFixed(1) ?? '0.0'}%</TableCell>
                            <TableCell className="text-right tabular-nums text-amber-600">{(s as any).taxaGlosa?.toFixed(1) ?? '0.0'}%</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={s.resultado === "lucro" ? "default" : s.resultado === "prejuizo" ? "destructive" : "secondary"}
                                className={s.resultado === "lucro" ? "bg-green-600 hover:bg-green-700" : ""}>
                                {s.resultado === "lucro" ? (
                                  <><TrendingUp className="h-3 w-3 mr-1" />Lucro</>
                                ) : s.resultado === "prejuizo" ? (
                                  <><TrendingDown className="h-3 w-3 mr-1" />Prejuízo</>
                                ) : "Empate"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {/* Expandido: top 5 itens do setor */}
                          {expandedSetor === s.setor && s.topItens.length > 0 && (
                            <TableRow key={`${s.setor}-expanded`}>
                              <TableCell colSpan={13} className="bg-muted/20 p-0">
                                <div className="p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">
                                    Top 5 itens de maior custo em "{s.setor}"
                                  </p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead className="text-xs">Item</TableHead>
                                        <TableHead className="text-xs text-right">Quantidade</TableHead>
                                        <TableHead className="text-xs text-right">Custo Total</TableHead>
                                        <TableHead className="text-xs text-right">Valor Cobrado</TableHead>
                                        <TableHead className="text-xs text-right">Recebido</TableHead>
                                        <TableHead className="text-xs text-right">Glosado</TableHead>
                                        <TableHead className="text-xs text-right">Margem</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {s.topItens.map((item: any, idx: number) => (
                                        <TableRow key={idx} className="text-xs">
                                          <TableCell className="py-1.5">{item.descricao}</TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums">
                                            {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                                          </TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(item.custoTotal)}</TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(item.valorCobrado)}</TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums text-blue-600">{formatCurrency(item.recebido)}</TableCell>
                                          <TableCell className="py-1.5 text-right tabular-nums text-amber-600">{formatCurrency(item.glosado)}</TableCell>
                                          <TableCell className={`py-1.5 text-right tabular-nums font-medium ${item.margem >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {formatCurrency(item.margem)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                      {sortedResumo.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                            Nenhum setor encontrado para os filtros selecionados
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ======== ABA TABELA DETALHADA ======== */}
          {activeTab === "detalhado" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tabela Detalhada - Itens por Setor</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cada linha = 1 item + 1 setor. Mostra custo unitário, valor cobrado, recebido, glosado e margem.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Código</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Tipo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                        <TableHead className="text-right">Vlr Cobrado</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="text-center">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.itensDetalhados.map((item: any, idx: number) => (
                        <TableRow
                          key={`${item.codprod}-${item.setor}-${idx}`}
                          className={item.resultado === "prejuizo" ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{item.codprod}</TableCell>
                          <TableCell className="text-xs font-medium whitespace-nowrap max-w-[150px] truncate" title={item.setor}>
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              {item.setor}
                            </div>
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
                                item.tipoItemLabel === "Serviço" ? "border-purple-400 text-purple-600" :
                                "border-gray-400 text-gray-600"
                              }`}
                            >
                              {item.tipoItemLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.custoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatCurrency(item.valorCobradoTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(item.recebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-600">{formatCurrency(item.glosado)}</TableCell>
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
                      {data.itensDetalhados.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                            Nenhum item encontrado para os filtros selecionados
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {data.totalItensDetalhados > 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center border-t">
                    Exibindo {data.itensDetalhados.length} registros (máx. 1000). Use os filtros para refinar.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ======== ABA TOP PREJUÍZO ======== */}
          {activeTab === "prejuizo" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Top 10 Setores com Maior Prejuízo
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Setores onde o custo total supera o valor faturado.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>#</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead className="text-right">Lanç.</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Prejuízo</TableHead>
                        <TableHead className="text-right">% Glosa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topSetoresPrejuizo.map((s: any, idx: number) => (
                        <TableRow key={s.setor} className="bg-red-50/30 dark:bg-red-950/10">
                          <TableCell className="font-bold text-red-600">{idx + 1}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-red-400" />
                              {s.setor}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{s.totalLancamentos.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.totalFaturado)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency((s as any).totalRecebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-600">{formatCurrency((s as any).totalGlosado)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.totalCusto)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-red-600">{formatCurrency(s.margem)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-600">{(s as any).taxaGlosa?.toFixed(1) ?? '0.0'}%</TableCell>
                        </TableRow>
                      ))}
                      {data.topSetoresPrejuizo.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            Nenhum setor com prejuízo encontrado
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
                  Top 10 Setores com Maior Lucro
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Setores onde o valor faturado supera o custo total.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>#</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead className="text-right">Lanç.</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Recebido</TableHead>
                        <TableHead className="text-right">Glosado</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Lucro</TableHead>
                        <TableHead className="text-right">% Receb.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topSetoresLucro.map((s: any, idx: number) => (
                        <TableRow key={s.setor} className="bg-green-50/30 dark:bg-green-950/10">
                          <TableCell className="font-bold text-green-600">{idx + 1}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-green-400" />
                              {s.setor}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{s.totalLancamentos.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.totalFaturado)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency((s as any).totalRecebido)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-600">{formatCurrency((s as any).totalGlosado)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(s.totalCusto)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-green-600">{formatCurrency(s.margem)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600">{(s as any).taxaRecebimento?.toFixed(1) ?? '0.0'}%</TableCell>
                        </TableRow>
                      ))}
                      {data.topSetoresLucro.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            Nenhum setor com lucro encontrado
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
