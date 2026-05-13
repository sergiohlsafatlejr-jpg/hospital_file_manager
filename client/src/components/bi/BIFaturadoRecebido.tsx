import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Table as TableIcon,
  Search,
  Download,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Building2,
  FileText,
} from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const fmtPercent = (v: number) => `${v.toFixed(1)}%`;

type SortField = "descricaoItem" | "totalFaturado" | "totalRecebido" | "totalGlosado" | "totalPendente" | "taxaRecebimento" | "taxaGlosa" | "quantidade";
type SortDir = "asc" | "desc";

export function BIFaturadoRecebido() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // Filtros
  const [competenciasSel, setCompetenciasSel] = useState<string[]>([]);
  const [conveniosSel, setConveniosSel] = useState<string[]>([]);
  const [setorSel, setSetorSel] = useState<string[]>([]);
  const [searchProc, setSearchProc] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalFaturado");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showTop, setShowTop] = useState(50);

  // Query
  const { data, isLoading } = trpc.relatoriosBI.faturadoRecebido.useQuery(
    {
      estabelecimentoId,
      competencias: competenciasSel.length > 0 ? competenciasSel : undefined,
      convenios: conveniosSel.length > 0 ? conveniosSel : undefined,
      setor: setorSel.length === 1 ? setorSel[0] : undefined,
    },
    { enabled: !!estabelecimentoId }
  );

  // Opções de filtro
  const competenciaOptions = useMemo(() => {
    if (!data?.filtrosDisponiveis?.competencias) return [];
    return data.filtrosDisponiveis.competencias.map((c: string) => ({
      label: c,
      value: c,
    }));
  }, [data?.filtrosDisponiveis?.competencias]);

  const convenioOptions = useMemo(() => {
    if (!data?.filtrosDisponiveis?.convenios) return [];
    return data.filtrosDisponiveis.convenios.map((c: string) => ({
      label: c,
      value: c,
    }));
  }, [data?.filtrosDisponiveis?.convenios]);

  const setorOptions = useMemo(() => {
    if (!data?.filtrosDisponiveis?.setores) return [];
    return data.filtrosDisponiveis.setores.map((s: string) => ({
      label: s,
      value: s,
    }));
  }, [data?.filtrosDisponiveis?.setores]);

  // Dados filtrados e ordenados por procedimento
  const procedimentosFiltrados = useMemo(() => {
    if (!data?.porProcedimento) return [];
    let items = [...data.porProcedimento];
    if (searchProc) {
      const term = searchProc.toLowerCase();
      items = items.filter(
        (p) =>
          p.descricaoItem.toLowerCase().includes(term) ||
          p.codigoItem.toLowerCase().includes(term)
      );
    }
    items.sort((a, b) => {
      const aVal = a[sortField] as unknown;
      const bVal = b[sortField] as unknown;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return items;
  }, [data?.porProcedimento, searchProc, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  // Exportar Excel
  const exportarExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Aba Resumo
    const resumoData = [
      ["Métrica", "Valor"],
      ["Total Faturado", data.resumo.totalFaturado],
      ["Total Recebido", data.resumo.totalRecebido],
      ["Total Glosado", data.resumo.totalGlosado],
      ["Total Pendente", data.resumo.totalPendente],
      ["Total Itens", data.resumo.totalItens],
      ["Taxa Recebimento (%)", data.resumo.taxaRecebimento],
      ["Taxa Glosa (%)", data.resumo.taxaGlosa],
      ["Ticket Médio", data.resumo.ticketMedio],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoData), "Resumo");

    // Aba Procedimentos
    const procData = [
      ["Código", "Descrição", "Faturado", "Recebido", "Glosado", "Pendente", "Qtd", "% Receb.", "% Glosa"],
      ...procedimentosFiltrados.map((p) => [
        p.codigoItem,
        p.descricaoItem,
        p.totalFaturado,
        p.totalRecebido,
        p.totalGlosado,
        p.totalPendente,
        p.quantidade,
        p.taxaRecebimento,
        p.taxaGlosa,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(procData), "Procedimentos");

    // Aba Por Mês
    if (data.porMes?.length) {
      const mesData = [
        ["Competência", "Faturado", "Recebido", "Glosado", "Pendente", "Qtd"],
        ...data.porMes.map((m) => [m.competencia, m.totalFaturado, m.totalRecebido, m.totalGlosado, m.totalPendente, m.quantidade]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mesData), "Por Mês");
    }

    // Aba Por Convênio
    if (data.porConvenio?.length) {
      const convData = [
        ["Convênio", "Faturado", "Recebido", "Glosado", "Pendente", "Qtd"],
        ...data.porConvenio.map((c) => [c.convenio, c.totalFaturado, c.totalRecebido, c.totalGlosado, c.totalPendente, c.quantidade]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(convData), "Por Convênio");
    }

    // Aba Por Setor
    if (data.porSetor?.length) {
      const setorData = [
        ["Setor", "Faturado", "Recebido", "Glosado", "Pendente", "Qtd"],
        ...data.porSetor.map((s) => [s.setor, s.totalFaturado, s.totalRecebido, s.totalGlosado, s.totalPendente, s.quantidade]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setorData), "Por Setor");
    }

    XLSX.writeFile(wb, `BI_Faturado_x_Recebido_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-muted-foreground">Carregando dados...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p>Nenhum dado encontrado para este estabelecimento.</p>
        <p className="text-sm mt-1">Verifique se existem dados na tabela faturamento_unificado.</p>
      </div>
    );
  }

  const { resumo } = data;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Competência</label>
              <MultiSelect
                options={competenciaOptions}
                selected={competenciasSel}
                onChange={setCompetenciasSel}
                placeholder="Todas"
              />
            </div>
            <div className="min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Convênio</label>
              <MultiSelect
                options={convenioOptions}
                selected={conveniosSel}
                onChange={setConveniosSel}
                placeholder="Todos"
              />
            </div>
            <div className="min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Setor</label>
              <MultiSelect
                options={setorOptions}
                selected={setorSel}
                onChange={setSetorSel}
                placeholder="Todos"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportarExcel} className="ml-auto gap-1.5">
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Faturado</span>
            </div>
            <p className="text-sm font-bold text-blue-500">{fmtCurrency(resumo.totalFaturado)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Recebido</span>
            </div>
            <p className="text-sm font-bold text-emerald-500">{fmtCurrency(resumo.totalRecebido)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Glosado</span>
            </div>
            <p className="text-sm font-bold text-red-500">{fmtCurrency(resumo.totalGlosado)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Pendente</span>
            </div>
            <p className="text-sm font-bold text-amber-500">{fmtCurrency(resumo.totalPendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Itens</span>
            </div>
            <p className="text-sm font-bold">{resumo.totalItens.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/10">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">% Receb.</span>
            </div>
            <p className="text-sm font-bold text-emerald-400">{fmtPercent(resumo.taxaRecebimento)}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/10">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">% Glosa</span>
            </div>
            <p className="text-sm font-bold text-red-400">{fmtPercent(resumo.taxaGlosa)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase">Ticket Médio</span>
            </div>
            <p className="text-sm font-bold">{fmtCurrency(resumo.ticketMedio)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas de visualização */}
      <Tabs defaultValue="procedimentos" className="space-y-4">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="procedimentos" className="gap-1.5 text-xs">
            <TableIcon className="h-3.5 w-3.5" />
            Por Procedimento
          </TabsTrigger>
          <TabsTrigger value="mensal" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            Por Mês
          </TabsTrigger>
          <TabsTrigger value="convenio" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            Por Convênio
          </TabsTrigger>
          <TabsTrigger value="setor" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            Por Setor
          </TabsTrigger>
        </TabsList>

        {/* === POR PROCEDIMENTO === */}
        <TabsContent value="procedimentos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Faturado x Recebido por Procedimento</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar procedimento..."
                      value={searchProc}
                      onChange={(e) => setSearchProc(e.target.value)}
                      className="pl-9 h-9 w-[250px]"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {procedimentosFiltrados.length} itens
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("descricaoItem")} className="flex items-center gap-1 hover:text-foreground">
                          Procedimento <SortIcon field="descricaoItem" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("totalFaturado")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Faturado <SortIcon field="totalFaturado" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("totalRecebido")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Recebido <SortIcon field="totalRecebido" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("totalGlosado")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Glosado <SortIcon field="totalGlosado" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("totalPendente")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Pendente <SortIcon field="totalPendente" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("quantidade")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          Qtd <SortIcon field="quantidade" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("taxaRecebimento")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          % Receb. <SortIcon field="taxaRecebimento" />
                        </button>
                      </th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">
                        <button onClick={() => toggleSort("taxaGlosa")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                          % Glosa <SortIcon field="taxaGlosa" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {procedimentosFiltrados.slice(0, showTop).map((p, i) => (
                      <tr key={p.codigoItem + i} className="border-b border-border/20 hover:bg-muted/30">
                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-xs">{p.descricaoItem}</span>
                            <span className="text-[10px] text-muted-foreground">{p.codigoItem}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-2 text-blue-400 font-medium">{fmtCurrency(p.totalFaturado)}</td>
                        <td className="text-right py-2 px-2 text-emerald-400 font-medium">{fmtCurrency(p.totalRecebido)}</td>
                        <td className="text-right py-2 px-2 text-red-400 font-medium">{fmtCurrency(p.totalGlosado)}</td>
                        <td className="text-right py-2 px-2 text-amber-400 font-medium">{fmtCurrency(p.totalPendente)}</td>
                        <td className="text-right py-2 px-2">{p.quantidade.toLocaleString("pt-BR")}</td>
                        <td className="text-right py-2 px-2">
                          <span className={p.taxaRecebimento >= 90 ? "text-emerald-400" : p.taxaRecebimento >= 70 ? "text-amber-400" : "text-red-400"}>
                            {fmtPercent(p.taxaRecebimento)}
                          </span>
                        </td>
                        <td className="text-right py-2 px-2">
                          <span className={p.taxaGlosa <= 5 ? "text-emerald-400" : p.taxaGlosa <= 15 ? "text-amber-400" : "text-red-400"}>
                            {fmtPercent(p.taxaGlosa)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {procedimentosFiltrados.length > showTop && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" size="sm" onClick={() => setShowTop((prev) => prev + 50)}>
                    Mostrar mais ({procedimentosFiltrados.length - showTop} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === POR MÊS === */}
        <TabsContent value="mensal" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evolução Mensal - Faturado x Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Gráfico de barras simples */}
              {data.porMes && data.porMes.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-end gap-1 h-[200px]">
                    {data.porMes.map((m) => {
                      const maxVal = Math.max(...data.porMes.map((x) => Math.max(x.totalFaturado, x.totalRecebido)));
                      const hFat = maxVal > 0 ? (m.totalFaturado / maxVal) * 180 : 0;
                      const hRec = maxVal > 0 ? (m.totalRecebido / maxVal) * 180 : 0;
                      return (
                        <div key={m.competencia} className="flex-1 flex flex-col items-center gap-1">
                          <div className="flex items-end gap-0.5 h-[180px]">
                            <div
                              className="w-3 bg-blue-500 rounded-t-sm transition-all"
                              style={{ height: `${hFat}px` }}
                              title={`Faturado: ${fmtCurrency(m.totalFaturado)}`}
                            />
                            <div
                              className="w-3 bg-emerald-500 rounded-t-sm transition-all"
                              style={{ height: `${hRec}px` }}
                              title={`Recebido: ${fmtCurrency(m.totalRecebido)}`}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground">{m.competencia.slice(5)}/{m.competencia.slice(2, 4)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-blue-500" />
                      <span className="text-xs text-muted-foreground">Faturado</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <span className="text-xs text-muted-foreground">Recebido</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-red-500" />
                      <span className="text-xs text-muted-foreground">Glosado</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela mensal */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Competência</th>
                      <th className="text-right py-2 px-2 font-medium text-blue-400">Faturado</th>
                      <th className="text-right py-2 px-2 font-medium text-emerald-400">Recebido</th>
                      <th className="text-right py-2 px-2 font-medium text-red-400">Glosado</th>
                      <th className="text-right py-2 px-2 font-medium text-amber-400">Pendente</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">Qtd</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">% Receb.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porMes?.map((m) => {
                      const txReceb = m.totalFaturado > 0 ? (m.totalRecebido / m.totalFaturado) * 100 : 0;
                      return (
                        <tr key={m.competencia} className="border-b border-border/20 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">{m.competencia}</td>
                          <td className="text-right py-2 px-2 text-blue-400">{fmtCurrency(m.totalFaturado)}</td>
                          <td className="text-right py-2 px-2 text-emerald-400">{fmtCurrency(m.totalRecebido)}</td>
                          <td className="text-right py-2 px-2 text-red-400">{fmtCurrency(m.totalGlosado)}</td>
                          <td className="text-right py-2 px-2 text-amber-400">{fmtCurrency(m.totalPendente)}</td>
                          <td className="text-right py-2 px-2">{m.quantidade.toLocaleString("pt-BR")}</td>
                          <td className="text-right py-2 px-2">
                            <span className={txReceb >= 90 ? "text-emerald-400" : txReceb >= 70 ? "text-amber-400" : "text-red-400"}>
                              {fmtPercent(txReceb)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totais */}
                    {data.porMes && data.porMes.length > 0 && (
                      <tr className="border-t-2 border-border font-bold">
                        <td className="py-2 px-2">TOTAL</td>
                        <td className="text-right py-2 px-2 text-blue-400">
                          {fmtCurrency(data.porMes.reduce((s, m) => s + m.totalFaturado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-emerald-400">
                          {fmtCurrency(data.porMes.reduce((s, m) => s + m.totalRecebido, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-red-400">
                          {fmtCurrency(data.porMes.reduce((s, m) => s + m.totalGlosado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-amber-400">
                          {fmtCurrency(data.porMes.reduce((s, m) => s + m.totalPendente, 0))}
                        </td>
                        <td className="text-right py-2 px-2">
                          {data.porMes.reduce((s, m) => s + m.quantidade, 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right py-2 px-2">
                          {fmtPercent(resumo.taxaRecebimento)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === POR CONVÊNIO === */}
        <TabsContent value="convenio" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Faturado x Recebido por Convênio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Convênio</th>
                      <th className="text-right py-2 px-2 font-medium text-blue-400">Faturado</th>
                      <th className="text-right py-2 px-2 font-medium text-emerald-400">Recebido</th>
                      <th className="text-right py-2 px-2 font-medium text-red-400">Glosado</th>
                      <th className="text-right py-2 px-2 font-medium text-amber-400">Pendente</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">Qtd</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">% Receb.</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">% Glosa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porConvenio?.map((c) => {
                      const txReceb = c.totalFaturado > 0 ? (c.totalRecebido / c.totalFaturado) * 100 : 0;
                      const txGlosa = c.totalFaturado > 0 ? (c.totalGlosado / c.totalFaturado) * 100 : 0;
                      return (
                        <tr key={c.convenio} className="border-b border-border/20 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">{c.convenio}</td>
                          <td className="text-right py-2 px-2 text-blue-400">{fmtCurrency(c.totalFaturado)}</td>
                          <td className="text-right py-2 px-2 text-emerald-400">{fmtCurrency(c.totalRecebido)}</td>
                          <td className="text-right py-2 px-2 text-red-400">{fmtCurrency(c.totalGlosado)}</td>
                          <td className="text-right py-2 px-2 text-amber-400">{fmtCurrency(c.totalPendente)}</td>
                          <td className="text-right py-2 px-2">{c.quantidade.toLocaleString("pt-BR")}</td>
                          <td className="text-right py-2 px-2">
                            <span className={txReceb >= 90 ? "text-emerald-400" : txReceb >= 70 ? "text-amber-400" : "text-red-400"}>
                              {fmtPercent(txReceb)}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2">
                            <span className={txGlosa <= 5 ? "text-emerald-400" : txGlosa <= 15 ? "text-amber-400" : "text-red-400"}>
                              {fmtPercent(txGlosa)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totais */}
                    {data.porConvenio && data.porConvenio.length > 0 && (
                      <tr className="border-t-2 border-border font-bold">
                        <td className="py-2 px-2">TOTAL</td>
                        <td className="text-right py-2 px-2 text-blue-400">
                          {fmtCurrency(data.porConvenio.reduce((s, c) => s + c.totalFaturado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-emerald-400">
                          {fmtCurrency(data.porConvenio.reduce((s, c) => s + c.totalRecebido, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-red-400">
                          {fmtCurrency(data.porConvenio.reduce((s, c) => s + c.totalGlosado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-amber-400">
                          {fmtCurrency(data.porConvenio.reduce((s, c) => s + c.totalPendente, 0))}
                        </td>
                        <td className="text-right py-2 px-2">
                          {data.porConvenio.reduce((s, c) => s + c.quantidade, 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right py-2 px-2">{fmtPercent(resumo.taxaRecebimento)}</td>
                        <td className="text-right py-2 px-2">{fmtPercent(resumo.taxaGlosa)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === POR SETOR === */}
        <TabsContent value="setor" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Faturado x Recebido por Setor</CardTitle>
            </CardHeader>
            <CardContent>
              {data.porSetor && data.porSetor.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 px-2 font-medium text-muted-foreground">Setor</th>
                        <th className="text-right py-2 px-2 font-medium text-blue-400">Faturado</th>
                        <th className="text-right py-2 px-2 font-medium text-emerald-400">Recebido</th>
                        <th className="text-right py-2 px-2 font-medium text-red-400">Glosado</th>
                        <th className="text-right py-2 px-2 font-medium text-amber-400">Pendente</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">Qtd</th>
                        <th className="text-right py-2 px-2 font-medium text-muted-foreground">% Receb.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.porSetor.map((s) => {
                        const txReceb = s.totalFaturado > 0 ? (s.totalRecebido / s.totalFaturado) * 100 : 0;
                        return (
                          <tr key={s.setor} className="border-b border-border/20 hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{s.setor}</td>
                            <td className="text-right py-2 px-2 text-blue-400">{fmtCurrency(s.totalFaturado)}</td>
                            <td className="text-right py-2 px-2 text-emerald-400">{fmtCurrency(s.totalRecebido)}</td>
                            <td className="text-right py-2 px-2 text-red-400">{fmtCurrency(s.totalGlosado)}</td>
                            <td className="text-right py-2 px-2 text-amber-400">{fmtCurrency(s.totalPendente)}</td>
                            <td className="text-right py-2 px-2">{s.quantidade.toLocaleString("pt-BR")}</td>
                            <td className="text-right py-2 px-2">
                              <span className={txReceb >= 90 ? "text-emerald-400" : txReceb >= 70 ? "text-amber-400" : "text-red-400"}>
                                {fmtPercent(txReceb)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-border font-bold">
                        <td className="py-2 px-2">TOTAL</td>
                        <td className="text-right py-2 px-2 text-blue-400">
                          {fmtCurrency(data.porSetor.reduce((s, x) => s + x.totalFaturado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-emerald-400">
                          {fmtCurrency(data.porSetor.reduce((s, x) => s + x.totalRecebido, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-red-400">
                          {fmtCurrency(data.porSetor.reduce((s, x) => s + x.totalGlosado, 0))}
                        </td>
                        <td className="text-right py-2 px-2 text-amber-400">
                          {fmtCurrency(data.porSetor.reduce((s, x) => s + x.totalPendente, 0))}
                        </td>
                        <td className="text-right py-2 px-2">
                          {data.porSetor.reduce((s, x) => s + x.quantidade, 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="text-right py-2 px-2">{fmtPercent(resumo.taxaRecebimento)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum dado de setor disponível.</p>
                  <p className="text-xs mt-1">Os dados de setor vêm da tabela faturamento_unificado.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
