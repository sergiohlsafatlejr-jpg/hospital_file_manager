import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  FlaskConical, Download, Loader2, Search, CheckCircle2, XCircle, AlertCircle,
  DollarSign, TrendingDown, Calendar, ChevronLeft, ChevronRight, FileText, Banknote, RefreshCw, Building2
} from "lucide-react";

const fmt = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v || 0);
  if (isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return "-"; }
};

export default function RelatorioLaboratorio() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competencia, setCompetencia] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [convenioId, setConvenioId] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [viewMode, setViewMode] = useState<"agrupado" | "detalhado" | "convenio">("agrupado");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => { setBuscaDebounced(busca); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const { mesRef, anoRef } = useMemo(() => {
    if (!competencia || competencia === "all") return { mesRef: undefined, anoRef: undefined };
    const [m, a] = competencia.split("-").map(Number);
    return { mesRef: m, anoRef: a };
  }, [competencia]);

  const convId = convenioId !== "todos" ? Number(convenioId) : undefined;

  const { data: convenios } = trpc.relatorioLaboratorio.convenios.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id! },
    { enabled: !!estabelecimentoAtual }
  );

  const { data, isLoading, refetch } = trpc.relatorioLaboratorio.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id!,
      mesReferencia: mesRef,
      anoReferencia: anoRef,
      convenioId: convId,
      statusFiltro: statusFiltro as any,
    },
    { enabled: !!estabelecimentoAtual }
  );

  useEffect(() => {
    if (data?.competencias?.length && !competencia) {
      setCompetencia(data.competencias[0].value);
    }
  }, [data?.competencias, competencia]);

  const competencias = data?.competencias || [];
  const resumo = data?.resumo || { totalItens: 0, totalPago: 0, totalGlosa: 0, totalInformado: 0, codigosUnicos: 0 };
  const porSituacao = data?.porSituacao || [];
  const porConvenio = data?.porConvenio || [];

  const agrupado = useMemo(() => {
    if (!data?.porCodigo) return [];
    const map: Record<string, { codigo: string; descricao: string; qtdPago: number; qtdGlosado: number; totalPago: number; totalGlosa: number }> = {};
    for (const r of data.porCodigo) {
      if (!map[r.codigo_item]) map[r.codigo_item] = { codigo: r.codigo_item, descricao: r.descricao || r.codigo_item, qtdPago: 0, qtdGlosado: 0, totalPago: 0, totalGlosa: 0 };
      const e = map[r.codigo_item];
      const sit = String(r.situacao_item || "").toUpperCase();
      if (sit === "PAGO") { e.qtdPago += Number(r.qtd || 0); e.totalPago += Number(r.total_pago || 0); }
      else if (sit === "GLOSADO") { e.qtdGlosado += Number(r.qtd || 0); e.totalGlosa += Number(r.total_glosa || 0); }
      else { e.qtdPago += Number(r.qtd || 0); e.totalPago += Number(r.total_pago || 0); e.totalGlosa += Number(r.total_glosa || 0); }
    }
    return Object.values(map).sort((a, b) => b.totalPago - a.totalPago);
  }, [data?.porCodigo]);

  const itensFiltrados = useMemo(() => {
    if (!data?.itens) return [];
    let items = data.itens;
    if (buscaDebounced) {
      const s = buscaDebounced.toLowerCase();
      items = items.filter((i: any) =>
        (i.codigo_item || "").toLowerCase().includes(s) ||
        (i.descricao_item || "").toLowerCase().includes(s) ||
        (i.nome_beneficiario || "").toLowerCase().includes(s) ||
        (i.numero_guia || "").toLowerCase().includes(s) ||
        (i.convenio_nome || "").toLowerCase().includes(s)
      );
    }
    return items;
  }, [data?.itens, buscaDebounced]);

  const totalPages = Math.ceil(itensFiltrados.length / pageSize);
  const itensPaginados = itensFiltrados.slice((page - 1) * pageSize, page * pageSize);

  const handleExportExcel = () => {
    if (!data) return;
    let rows: any[] = [];
    if (viewMode === "convenio") {
      rows = porConvenio.map(r => ({ "Convênio": r.convenioNome, "Qtd Itens": r.qtd, "Códigos": r.codigos, "Valor Pago": r.totalPago, "Valor Glosa": r.totalGlosa }));
    } else if (viewMode === "agrupado") {
      rows = agrupado.map(r => ({ "Código TUSS": r.codigo, "Descrição": r.descricao, "Qtd Pagos": r.qtdPago, "Qtd Glosados": r.qtdGlosado, "Valor Pago": r.totalPago, "Valor Glosa": r.totalGlosa }));
    } else {
      rows = itensFiltrados.map((i: any) => ({ "Código": i.codigo_item, "Descrição": i.descricao_item, "Convênio": i.convenio_nome || "-", "Guia": i.numero_guia, "Paciente": i.nome_beneficiario, "Dt Execução": fmtDate(i.data_execucao), "Vl Pago": Number(i.valor_pago || 0), "Vl Glosa": Number(i.valor_glosa || 0), "Situação": i.situacao_item }));
    }
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Array(Object.keys(rows[0]).length).fill({ wch: 22 });
    XLSX.utils.book_append_sheet(wb, ws, "Laboratório");
    const compLabel = competencias.find((c: any) => c.value === competencia)?.label || "todos";
    XLSX.writeFile(wb, `relatorio_lab_PS_${compLabel.replace("/", "-")}.xlsx`);
    toast.success("Excel exportado!");
  };

  const getStatusBadge = (sit: string) => {
    const s = (sit || "").toUpperCase();
    if (s === "GLOSADO") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Glosado</Badge>;
    if (s === "PARCIAL") return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3" /> Parcial</Badge>;
    return <Badge variant="outline" className="gap-1 border-green-500 text-green-600"><CheckCircle2 className="h-3 w-3" /> Pago</Badge>;
  };

  const pctGlosa = resumo.totalPago + resumo.totalGlosa > 0
    ? ((resumo.totalGlosa / (resumo.totalPago + resumo.totalGlosa)) * 100).toFixed(1)
    : "0.0";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-8 w-8 text-purple-500" />
              Relatório de Laboratório
            </h1>
            <p className="text-muted-foreground">Exames laboratoriais (TUSS 402xx/403xx) — Pronto Socorro</p>
          </div>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Competência</label>
                <Select value={competencia} onValueChange={(v) => { setCompetencia(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os períodos</SelectItem>
                    {competencias.map((c: any) => (
                      <SelectItem key={c.value} value={c.value}>{c.label} ({c.total.toLocaleString("pt-BR")} itens)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={(v) => { setConvenioId(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Convênios</SelectItem>
                    {(convenios || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pago">Pagos</SelectItem>
                    <SelectItem value="glosado">Glosados</SelectItem>
                    <SelectItem value="parcial">Parciais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Visualização</label>
                <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agrupado">Por Código TUSS</SelectItem>
                    <SelectItem value="convenio">Por Convênio</SelectItem>
                    <SelectItem value="detalhado">Detalhado (itens)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {viewMode === "detalhado" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Busca</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Código, paciente..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleExportExcel} disabled={isLoading}><Download className="h-4 w-4 mr-2" /> Exportar Excel</Button>
              <Button variant="outline" onClick={() => { setCompetencia("all"); setStatusFiltro("todos"); setConvenioId("todos"); setBusca(""); }}>Limpar Filtros</Button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Total Itens</p><p className="text-xl font-bold">{resumo.totalItens.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">{resumo.codigosUnicos} códigos</p></div>
          </div></CardContent></Card>

          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFiltro === "pago" ? "ring-2 ring-green-500" : ""}`} onClick={() => setStatusFiltro(statusFiltro === "pago" ? "todos" : "pago")}>
            <CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600 shrink-0" />
              <div><p className="text-xs text-muted-foreground">Vl. Pago</p><p className="text-sm font-bold text-emerald-600">{fmt(resumo.totalPago)}</p></div>
            </div></CardContent>
          </Card>

          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFiltro === "glosado" ? "ring-2 ring-red-500" : ""}`} onClick={() => setStatusFiltro(statusFiltro === "glosado" ? "todos" : "glosado")}>
            <CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600 shrink-0" />
              <div><p className="text-xs text-muted-foreground">Vl. Glosado</p><p className="text-sm font-bold text-red-600">{fmt(resumo.totalGlosa)}</p></div>
            </div></CardContent>
          </Card>

          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-indigo-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">% Glosa</p><p className="text-sm font-bold text-indigo-600">{pctGlosa}%</p></div>
          </div></CardContent></Card>

          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Convênios</p><p className="text-sm font-bold text-purple-600">{porConvenio.length} ativos</p></div>
          </div></CardContent></Card>
        </div>

        {/* Por Situação */}
        {porSituacao.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {porSituacao.map((s: any, i: number) => (
              <Card key={i} className="border-l-4" style={{ borderLeftColor: s.situacao_item === "PAGO" ? "#10b981" : s.situacao_item === "GLOSADO" ? "#ef4444" : "#f59e0b" }}>
                <CardContent className="pt-4 pb-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold">{s.situacao_item}</p>
                    <p className="text-xs text-muted-foreground">{Number(s.total).toLocaleString("pt-BR")} itens</p>
                  </div>
                  <div className="text-right">
                    {Number(s.vl_pago || 0) > 0 && <p className="text-sm font-bold text-emerald-600">{fmt(s.vl_pago)}</p>}
                    {Number(s.vl_glosa || 0) > 0 && <p className="text-sm font-bold text-red-600">{fmt(s.vl_glosa)}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle>
              {viewMode === "agrupado" ? "Resumo por Código TUSS" : viewMode === "convenio" ? "Resumo por Convênio" : `Itens Detalhados (${itensFiltrados.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : viewMode === "convenio" ? (
              /* ========== VISÃO POR CONVÊNIO ========== */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-center">Qtd Itens</TableHead>
                      <TableHead className="text-center">Códigos</TableHead>
                      <TableHead className="text-right">Valor Pago</TableHead>
                      <TableHead className="text-right">Valor Glosa</TableHead>
                      <TableHead className="text-center">% Glosa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porConvenio.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum dado</TableCell></TableRow>
                    ) : porConvenio.map((r, i) => {
                      const pct = r.totalPago + r.totalGlosa > 0 ? ((r.totalGlosa / (r.totalPago + r.totalGlosa)) * 100).toFixed(1) : "0.0";
                      return (
                        <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => { setConvenioId(String(r.convenioId)); setViewMode("agrupado"); }}>
                          <TableCell className="font-semibold">{r.convenioNome}</TableCell>
                          <TableCell className="text-center">{r.qtd.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-center">{r.codigos}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600 font-semibold">{fmt(r.totalPago)}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">{fmt(r.totalGlosa)}</TableCell>
                          <TableCell className="text-center">{pct}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {porConvenio.length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg flex justify-between text-sm font-semibold">
                    <span>Total: {porConvenio.length} convênios</span>
                    <span className="text-emerald-600">Pago: {fmt(porConvenio.reduce((s, r) => s + r.totalPago, 0))}</span>
                    <span className="text-red-600">Glosa: {fmt(porConvenio.reduce((s, r) => s + r.totalGlosa, 0))}</span>
                  </div>
                )}
              </div>
            ) : viewMode === "agrupado" ? (
              /* ========== VISÃO AGRUPADA POR CÓDIGO ========== */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código TUSS</TableHead>
                      <TableHead className="max-w-[300px]">Descrição</TableHead>
                      <TableHead className="text-center">Qtd Pagos</TableHead>
                      <TableHead className="text-center">Qtd Glosados</TableHead>
                      <TableHead className="text-right">Total Pago</TableHead>
                      <TableHead className="text-right">Total Glosa</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agrupado.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</TableCell></TableRow>
                    ) : agrupado.map((r, i) => (
                      <TableRow key={i} className={r.totalGlosa > 0 ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                        <TableCell className="font-mono text-sm font-semibold">{r.codigo}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-sm">{r.descricao}</TableCell>
                        <TableCell className="text-center">{r.qtdPago}</TableCell>
                        <TableCell className="text-center">{r.qtdGlosado > 0 ? <span className="text-red-600 font-semibold">{r.qtdGlosado}</span> : "0"}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{fmt(r.totalPago)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">{fmt(r.totalGlosa)}</TableCell>
                        <TableCell className="text-center">{r.qtdGlosado > 0 && r.qtdPago > 0 ? getStatusBadge("PARCIAL") : r.qtdGlosado > 0 ? getStatusBadge("GLOSADO") : getStatusBadge("PAGO")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {agrupado.length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg flex justify-between text-sm font-semibold">
                    <span>Total: {agrupado.length} códigos</span>
                    <span className="text-emerald-600">Pago: {fmt(agrupado.reduce((s, r) => s + r.totalPago, 0))}</span>
                    <span className="text-red-600">Glosa: {fmt(agrupado.reduce((s, r) => s + r.totalGlosa, 0))}</span>
                  </div>
                )}
              </div>
            ) : (
              /* ========== VISÃO DETALHADA ========== */
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead className="max-w-[180px]">Descrição</TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead>Guia</TableHead>
                        <TableHead className="max-w-[130px]">Paciente</TableHead>
                        <TableHead className="text-right">Vl. Pago</TableHead>
                        <TableHead className="text-right">Vl. Glosa</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensPaginados.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          {!mesRef ? "Selecione uma competência para ver itens individuais" : "Nenhum item encontrado"}
                        </TableCell></TableRow>
                      ) : itensPaginados.map((item: any, i: number) => (
                        <TableRow key={item.id || i} className={Number(item.valor_glosa || 0) > 0 ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                          <TableCell className="font-mono text-sm">{item.codigo_item}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm">{item.descricao_item}</TableCell>
                          <TableCell className="text-sm">{item.convenio_nome || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{item.numero_guia || "-"}</TableCell>
                          <TableCell className="max-w-[130px] truncate text-sm">{item.nome_beneficiario || "-"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{fmt(item.valor_pago)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">{fmt(item.valor_glosa)}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(item.situacao_item)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, itensFiltrados.length)} de {itensFiltrados.length}</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
                      <span className="text-sm">Página {page} de {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
