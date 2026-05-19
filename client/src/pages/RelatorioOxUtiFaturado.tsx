import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Bed, Download, Loader2, Search, DollarSign,
  Calendar, Users, Package, BarChart3, Activity,
  FileText, ChevronRight
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v: number | null | undefined) => {
  const n = v ?? 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtMes = (mesRef: string) => {
  if (!mesRef) return mesRef;
  const [ano, mes] = mesRef.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[parseInt(mes) - 1]}/${ano}`;
};

// Mapeamento de tipoItem do banco para label amigável
const TIPO_LABEL: Record<string, string> = {
  "DIÁRIA": "Diária",
  "TAXA/ALUGUÉIS": "Taxa/Aluguéis",
  "MEDICAMENTO": "Medicamento",
  "MATERIAL": "Material",
  "PROCEDIMENTO": "Procedimento",
  "GÁS MEDICINAL": "Gás Medicinal",
  "NÃO INFORMADO": "Não Informado",
};

const TIPO_COLOR: Record<string, string> = {
  "DIÁRIA": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "TAXA/ALUGUÉIS": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "MEDICAMENTO": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "MATERIAL": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "PROCEDIMENTO": "bg-green-500/20 text-green-400 border-green-500/30",
  "GÁS MEDICINAL": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "NÃO INFORMADO": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ─── componente principal ────────────────────────────────────────────────────
export default function RelatorioOxUtiFaturado() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabId = estabelecimentoAtual?.id ?? 0;

  const [mesRef, setMesRef] = useState<string>("");
  const [convenio, setConvenio] = useState<string>("todos");
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");

  // ── queries ──
  const { data: meses = [], isLoading: loadingMeses } = trpc.relatorioOxUtiFaturado.mesesDisponiveis.useQuery(
    { estabelecimentoId: estabId },
    { enabled: estabId > 0 }
  );

  const { data: convenios = [] } = trpc.relatorioOxUtiFaturado.convenios.useQuery(
    { estabelecimentoId: estabId },
    { enabled: estabId > 0 }
  );

  const mesEfetivo = mesRef || (meses.length > 0 ? meses[0] : "");

  const { data, isLoading, isFetching } = trpc.relatorioOxUtiFaturado.dados.useQuery(
    {
      estabelecimentoId: estabId,
      mesRef: mesEfetivo,
      convenio: convenio !== "todos" ? convenio : undefined,
    },
    { enabled: estabId > 0 && !!mesEfetivo }
  );

  // ── filtros ──
  const pacientesFiltrados = useMemo(() => {
    if (!data?.porPaciente) return [];
    return data.porPaciente.filter(p =>
      !buscaPaciente || p.paciente?.toLowerCase().includes(buscaPaciente.toLowerCase())
    );
  }, [data?.porPaciente, buscaPaciente]);

  const itensFiltrados = useMemo(() => {
    if (!data?.porItem) return [];
    return data.porItem.filter(i => {
      const matchBusca = !buscaItem ||
        i.descricao?.toLowerCase().includes(buscaItem.toLowerCase()) ||
        i.codigo?.toLowerCase().includes(buscaItem.toLowerCase());
      const matchCategoria = categoriaFiltro === "todos" || i.categoria === categoriaFiltro;
      return matchBusca && matchCategoria;
    });
  }, [data?.porItem, buscaItem, categoriaFiltro]);

  // Categorias únicas para o filtro
  const categoriasUnicas = useMemo(() => {
    if (!data?.porItem) return [];
    return [...new Set(data.porItem.map(i => i.categoria))].sort();
  }, [data?.porItem]);

  // ── exportar Excel ──
  const exportarExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const kpiData = [
      ["Relatório Ox UTI - Faturado (XML Enviado)", fmtMes(mesEfetivo)],
      [],
      ["Indicador", "Valor"],
      ["Total de Guias", data.kpi.totalGuias],
      ["Total de Itens", data.kpi.totalItens],
      ["Total Pacientes", data.kpi.totalPacientes],
      ["Vl. Faturado (XML)", data.kpi.totalFaturado],
      ["Total Diárias", data.kpi.totalDiarias],
      ["Ticket Médio (Vl. Faturado / Diária)", data.kpi.ticketMedio ?? "N/A"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), "KPIs");

    const tipoData = [
      ["Tipo Item", "Qtd Itens", "Qtd Total", "Vl. Faturado"],
      ...data.porTipo.map(t => [
        TIPO_LABEL[t.categoria] ?? t.categoria,
        t.qtdItens,
        t.totalQuantidade,
        t.totalFaturado,
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tipoData), "Por Tipo");

    const pacData = [
      ["Paciente", "Carteira", "Convênios", "Guias", "Itens", "Qtd Diárias", "Vl. Faturado", "Ticket Médio"],
      ...data.porPaciente.map(p => [
        p.paciente, p.carteira, p.convenios, p.totalGuias, p.totalItens, p.qtdDiarias,
        p.totalFaturado, p.ticketMedioPaciente ?? "N/A"
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pacData), "Por Paciente");

    const itemData = [
      ["Código", "Descrição", "Tipo Item", "Ocorrências", "Qtd Total", "Vl. Unit. Médio", "Vl. Faturado"],
      ...data.porItem.map(i => [
        i.codigo, i.descricao, TIPO_LABEL[i.categoria] ?? i.categoria,
        i.qtdOcorrencias, i.totalQuantidade, i.valorUnitarioMedio, i.totalFaturado
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemData), "Por Item");

    XLSX.writeFile(wb, `relatorio-ox-uti-faturado-${mesEfetivo}.xlsx`);
  };

  const loading = isLoading || isFetching;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <FileText className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatório Ox UTI — Faturado</h1>
              <p className="text-sm text-muted-foreground">Análise do XML enviado: por tipo, por paciente e por item</p>
            </div>
          </div>
          <Button onClick={exportarExcel} disabled={!data} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>

        {/* ── Filtros ── */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={mesEfetivo} onValueChange={setMesRef} disabled={loadingMeses}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Mês de referência" />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map(m => (
                      <SelectItem key={m} value={m}>{fmtMes(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Select value={convenio} onValueChange={setConvenio}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Todos os convênios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {convenios.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>

        {/* ── KPIs ── */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Total Guias</span>
                </div>
                <p className="text-2xl font-bold text-blue-400">{data.kpi.totalGuias.toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-muted-foreground">Vl. Faturado</span>
                </div>
                <p className="text-lg font-bold text-emerald-400">{fmt(data.kpi.totalFaturado)}</p>
                <p className="text-[10px] text-muted-foreground">XML enviado</p>
              </CardContent>
            </Card>

            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bed className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Total Diárias</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">{data.kpi.totalDiarias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</p>
              </CardContent>
            </Card>

            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-orange-400" />
                  <span className="text-xs text-muted-foreground">Pacientes</span>
                </div>
                <p className="text-2xl font-bold text-orange-400">{data.kpi.totalPacientes.toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/30 bg-cyan-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs text-muted-foreground">Ticket Médio</span>
                </div>
                <p className="text-lg font-bold text-cyan-400">
                  {data.kpi.ticketMedio != null ? fmt(data.kpi.ticketMedio) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Vl. Faturado / Diária</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Estado vazio ── */}
        {!data && !loading && mesEfetivo && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum dado encontrado para o período selecionado.
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* ── Tabelas ── */}
        {data && !loading && (
          <Tabs defaultValue="tipo">
            <TabsList className="mb-4">
              <TabsTrigger value="tipo" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Por Tipo
              </TabsTrigger>
              <TabsTrigger value="paciente" className="gap-2">
                <Users className="h-4 w-4" />
                Por Paciente
              </TabsTrigger>
              <TabsTrigger value="item" className="gap-2">
                <Package className="h-4 w-4" />
                Por Item
              </TabsTrigger>
            </TabsList>

            {/* ── Aba Por Tipo ── */}
            <TabsContent value="tipo">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumo por Tipo de Item</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo Item</TableHead>
                        <TableHead className="text-right">Qtd. Itens</TableHead>
                        <TableHead className="text-right">Qtd. Total</TableHead>
                        <TableHead className="text-right">Vl. Faturado</TableHead>
                        <TableHead className="text-right">% do Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.porTipo.map(t => {
                        const percTotal = data.kpi.totalFaturado > 0
                          ? (t.totalFaturado / data.kpi.totalFaturado) * 100
                          : 0;
                        return (
                          <TableRow key={t.categoria}>
                            <TableCell>
                              <Badge className={`${TIPO_COLOR[t.categoria] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"} border`}>
                                {TIPO_LABEL[t.categoria] ?? t.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{t.qtdItens.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right">{t.totalQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                            <TableCell className="text-right text-emerald-400 font-medium">{fmt(t.totalFaturado)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-muted rounded-full h-1.5">
                                  <div
                                    className="bg-emerald-400 h-1.5 rounded-full"
                                    style={{ width: `${Math.min(percTotal, 100)}%` }}
                                  />
                                </div>
                                <span className="text-muted-foreground text-sm w-10 text-right">
                                  {percTotal.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Linha de total */}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{data.kpi.totalItens.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right text-emerald-400">{fmt(data.kpi.totalFaturado)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Aba Por Paciente ── */}
            <TabsContent value="paciente">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Por Paciente</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Ordenado por maior valor faturado</p>
                    </div>
                    <div className="relative w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar paciente..."
                        value={buscaPaciente}
                        onChange={e => setBuscaPaciente(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Carteira</TableHead>
                          <TableHead>Convênio(s)</TableHead>
                          <TableHead className="text-right">Guias</TableHead>
                          <TableHead className="text-right">Qtd. Diárias</TableHead>
                          <TableHead className="text-right">Vl. Faturado</TableHead>
                          <TableHead className="text-right">Ticket Médio</TableHead>
                          <TableHead className="w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pacientesFiltrados.map((p, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="font-medium max-w-[200px] truncate">{p.paciente ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm font-mono">{p.carteira ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs max-w-[160px] truncate">{p.convenios ?? "—"}</TableCell>
                            <TableCell className="text-right">{p.totalGuias}</TableCell>
                            <TableCell className="text-right text-purple-400 font-medium">
                              {p.qtdDiarias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell className="text-right text-emerald-400 font-medium">{fmt(p.totalFaturado)}</TableCell>
                            <TableCell className="text-right text-cyan-400">
                              {p.ticketMedioPaciente != null ? fmt(p.ticketMedioPaciente) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ))}
                        {pacientesFiltrados.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              Nenhum paciente encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{pacientesFiltrados.length} paciente(s) exibido(s)</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Aba Por Item ── */}
            <TabsContent value="item">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">Por Item</CardTitle>
                    <div className="flex gap-2">
                      <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Tipo de item" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os tipos</SelectItem>
                          {categoriasUnicas.map(c => (
                            <SelectItem key={c} value={c}>{TIPO_LABEL[c] ?? c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative w-56">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar item..."
                          value={buscaItem}
                          onChange={e => setBuscaItem(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Ocorrências</TableHead>
                          <TableHead className="text-right">Qtd. Total</TableHead>
                          <TableHead className="text-right">Vl. Unit. Médio</TableHead>
                          <TableHead className="text-right">Vl. Faturado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensFiltrados.map((i, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm text-muted-foreground">{i.codigo ?? "—"}</TableCell>
                            <TableCell className="max-w-[280px]">
                              <span className="text-sm leading-tight line-clamp-2">{i.descricao ?? "—"}</span>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${TIPO_COLOR[i.categoria] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30"} border text-xs`}>
                                {TIPO_LABEL[i.categoria] ?? i.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{i.qtdOcorrencias.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right">{i.totalQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmt(i.valorUnitarioMedio)}</TableCell>
                            <TableCell className="text-right text-emerald-400 font-medium">{fmt(i.totalFaturado)}</TableCell>
                          </TableRow>
                        ))}
                        {itensFiltrados.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Nenhum item encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{itensFiltrados.length} item(ns) exibido(s)</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
