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
  Bed, Download, Loader2, Search, DollarSign, TrendingDown,
  Calendar, Users, Package, BarChart3, AlertTriangle, Activity
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

const CATEGORIA_LABEL: Record<string, string> = {
  DIARIA: "Diária",
  TAXA: "Taxa",
  MAT_MED: "Mat/Med",
  OUTROS: "Outros",
};

const CATEGORIA_COLOR: Record<string, string> = {
  DIARIA: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  TAXA: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  MAT_MED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  OUTROS: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ─── componente principal ────────────────────────────────────────────────────
export default function RelatorioOxUti() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabId = estabelecimentoAtual?.id ?? 0;

  const [mesRef, setMesRef] = useState<string>("");
  const [convenioId, setConvenioId] = useState<string>("todos");
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [buscaItem, setBuscaItem] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");

  // ── queries ──
  const { data: meses = [], isLoading: loadingMeses } = trpc.relatorioOxUti.mesesDisponiveis.useQuery(
    { estabelecimentoId: estabId },
    { enabled: estabId > 0 }
  );

  const { data: convenios = [] } = trpc.relatorioOxUti.convenios.useQuery(
    { estabelecimentoId: estabId },
    { enabled: estabId > 0 }
  );

  // Selecionar mês mais recente automaticamente
  const mesEfetivo = mesRef || (meses.length > 0 ? meses[0] : "");

  const { data, isLoading, isFetching } = trpc.relatorioOxUti.dados.useQuery(
    {
      estabelecimentoId: estabId,
      mesRef: mesEfetivo,
      convenioId: convenioId !== "todos" ? parseInt(convenioId) : undefined,
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

  // ── exportar Excel ──
  const exportarExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Aba KPIs
    const kpiData = [
      ["Relatório Ox UTI", fmtMes(mesEfetivo)],
      [],
      ["Indicador", "Valor"],
      ["Total de Guias", data.kpi.totalGuias],
      ["Total de Itens", data.kpi.totalItens],
      ["Vl. Informado", data.kpi.totalInformado],
      ["Vl. Pago", data.kpi.totalPago],
      ["Vl. Glosado", data.kpi.totalGlosado],
      ["% Glosa", `${data.kpi.percGlosa.toFixed(1)}%`],
      ["Total Diárias", data.kpi.totalDiarias],
      ["Ticket Médio (Vl. Pago / Diária)", data.kpi.ticketMedio ?? "N/A"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiData), "KPIs");

    // Aba Por Tipo
    const tipoData = [
      ["Categoria", "Qtd Itens", "Vl. Informado", "Vl. Pago", "Vl. Glosado", "Qtd Total"],
      ...data.porTipo.map(t => [
        CATEGORIA_LABEL[t.categoria] ?? t.categoria,
        t.qtdItens, t.totalInformado, t.totalPago, t.totalGlosado, t.totalQuantidade
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tipoData), "Por Tipo");

    // Aba Por Paciente
    const pacData = [
      ["Paciente", "Carteira", "Guias", "Itens", "Qtd Diárias", "Vl. Informado", "Vl. Pago", "Vl. Glosado", "Ticket Médio"],
      ...data.porPaciente.map(p => [
        p.paciente, p.carteira, p.totalGuias, p.totalItens, p.qtdDiarias,
        p.totalInformado, p.totalPago, p.totalGlosado,
        p.ticketMedioPaciente ?? "N/A"
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pacData), "Por Paciente");

    // Aba Por Item
    const itemData = [
      ["Código", "Descrição", "Categoria", "Tipo Lanç.", "Ocorrências", "Qtd Total", "Vl. Informado", "Vl. Pago", "Vl. Glosado"],
      ...data.porItem.map(i => [
        i.codigo, i.descricao, CATEGORIA_LABEL[i.categoria] ?? i.categoria,
        i.tipoLancamento, i.qtdOcorrencias, i.totalQuantidade,
        i.totalInformado, i.totalPago, i.totalGlosado
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemData), "Por Item");

    XLSX.writeFile(wb, `relatorio-ox-uti-${mesEfetivo}.xlsx`);
  };

  const loading = isLoading || isFetching;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Bed className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatório Ox UTI</h1>
              <p className="text-sm text-muted-foreground">Análise de diárias, taxas e mat/med por paciente e item</p>
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
                <Select
                  value={mesEfetivo}
                  onValueChange={setMesRef}
                  disabled={loadingMeses}
                >
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

              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os convênios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {convenios.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>

        {/* ── KPIs ── */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Total Guias</span>
                </div>
                <p className="text-2xl font-bold text-blue-400">{data.kpi.totalGuias.toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>

            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-muted-foreground">Vl. Pago</span>
                </div>
                <p className="text-lg font-bold text-green-400">{fmt(data.kpi.totalPago)}</p>
              </CardContent>
            </Card>

            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-muted-foreground">Vl. Glosado</span>
                </div>
                <p className="text-lg font-bold text-red-400">{fmt(data.kpi.totalGlosado)}</p>
              </CardContent>
            </Card>

            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  <span className="text-xs text-muted-foreground">% Glosa</span>
                </div>
                <p className="text-2xl font-bold text-orange-400">{data.kpi.percGlosa.toFixed(1)}%</p>
              </CardContent>
            </Card>

            <Card className="border-purple-500/30 bg-purple-500/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bed className="h-4 w-4 text-purple-400" />
                  <span className="text-xs text-muted-foreground">Total Diárias</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">{data.kpi.totalDiarias.toLocaleString("pt-BR")}</p>
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
                <p className="text-[10px] text-muted-foreground">Vl. Pago / Diária</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Tabelas ── */}
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
                  <CardTitle className="text-base">Resumo por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Qtd. Itens</TableHead>
                        <TableHead className="text-right">Qtd. Total</TableHead>
                        <TableHead className="text-right">Vl. Informado</TableHead>
                        <TableHead className="text-right">Vl. Pago</TableHead>
                        <TableHead className="text-right">Vl. Glosado</TableHead>
                        <TableHead className="text-right">% Glosa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.porTipo.map(t => {
                        const percGlosa = t.totalInformado > 0
                          ? (t.totalGlosado / t.totalInformado) * 100
                          : 0;
                        return (
                          <TableRow key={t.categoria}>
                            <TableCell>
                              <Badge className={`${CATEGORIA_COLOR[t.categoria] ?? ""} border`}>
                                {CATEGORIA_LABEL[t.categoria] ?? t.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{t.qtdItens.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right">{t.totalQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmt(t.totalInformado)}</TableCell>
                            <TableCell className="text-right text-green-400 font-medium">{fmt(t.totalPago)}</TableCell>
                            <TableCell className="text-right text-red-400">{fmt(t.totalGlosado)}</TableCell>
                            <TableCell className="text-right">
                              <span className={percGlosa > 20 ? "text-red-400 font-medium" : percGlosa > 10 ? "text-orange-400" : "text-muted-foreground"}>
                                {percGlosa.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                    <CardTitle className="text-base">Por Paciente</CardTitle>
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
                          <TableHead className="text-right">Guias</TableHead>
                          <TableHead className="text-right">Qtd. Diárias</TableHead>
                          <TableHead className="text-right">Vl. Informado</TableHead>
                          <TableHead className="text-right">Vl. Pago</TableHead>
                          <TableHead className="text-right">Vl. Glosado</TableHead>
                          <TableHead className="text-right">Ticket Médio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pacientesFiltrados.map((p, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium max-w-[200px] truncate">{p.paciente ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{p.carteira ?? "—"}</TableCell>
                            <TableCell className="text-right">{p.totalGuias}</TableCell>
                            <TableCell className="text-right text-purple-400 font-medium">{p.qtdDiarias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmt(p.totalInformado)}</TableCell>
                            <TableCell className="text-right text-green-400 font-medium">{fmt(p.totalPago)}</TableCell>
                            <TableCell className="text-right text-red-400">{fmt(p.totalGlosado)}</TableCell>
                            <TableCell className="text-right text-cyan-400">
                              {p.ticketMedioPaciente != null ? fmt(p.ticketMedioPaciente) : "—"}
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
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          <SelectItem value="DIARIA">Diária</SelectItem>
                          <SelectItem value="TAXA">Taxa</SelectItem>
                          <SelectItem value="MAT_MED">Mat/Med</SelectItem>
                          <SelectItem value="OUTROS">Outros</SelectItem>
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
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Ocorrências</TableHead>
                          <TableHead className="text-right">Qtd. Total</TableHead>
                          <TableHead className="text-right">Vl. Informado</TableHead>
                          <TableHead className="text-right">Vl. Pago</TableHead>
                          <TableHead className="text-right">Vl. Glosado</TableHead>
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
                              <Badge className={`${CATEGORIA_COLOR[i.categoria] ?? ""} border text-xs`}>
                                {CATEGORIA_LABEL[i.categoria] ?? i.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{i.qtdOcorrencias.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right">{i.totalQuantidade.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmt(i.totalInformado)}</TableCell>
                            <TableCell className="text-right text-green-400 font-medium">{fmt(i.totalPago)}</TableCell>
                            <TableCell className="text-right text-red-400">{fmt(i.totalGlosado)}</TableCell>
                          </TableRow>
                        ))}
                        {itensFiltrados.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
