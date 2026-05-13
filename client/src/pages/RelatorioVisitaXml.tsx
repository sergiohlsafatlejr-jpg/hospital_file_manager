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
  Stethoscope, Download, Loader2, Search,
  DollarSign, Calendar, ChevronLeft, ChevronRight, FileText, RefreshCw, Building2, Users, UserCheck
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

export default function RelatorioVisitaXml() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competencia, setCompetencia] = useState<string>("");
  const [convenioId, setConvenioId] = useState<string>("todos");
  const [medicoFilter, setMedicoFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [viewMode, setViewMode] = useState<"medico" | "convenio" | "detalhado">("medico");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    const t = setTimeout(() => { setBuscaDebounced(busca); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const convId = convenioId !== "todos" ? Number(convenioId) : undefined;
  const medFilter = medicoFilter !== "todos" ? medicoFilter : undefined;

  const { data: convenios } = trpc.relatorioVisitaXml.convenios.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id! },
    { enabled: !!estabelecimentoAtual }
  );

  const { data: competencias } = trpc.relatorioVisitaXml.competencias.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id! },
    { enabled: !!estabelecimentoAtual }
  );

  const { data, isLoading, refetch } = trpc.relatorioVisitaXml.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id!,
      competencia: competencia && competencia !== "all" ? competencia : undefined,
      convenioId: convId,
      medico: medFilter,
    },
    { enabled: !!estabelecimentoAtual }
  );

  useEffect(() => {
    if (competencias?.length && !competencia) {
      setCompetencia(competencias[0].value);
    }
  }, [competencias, competencia]);

  const resumo = data?.resumo || { totalVisitas: 0, totalGuias: 0, totalMedicos: 0, totalFaturado: 0 };
  const porMedico = data?.porMedico || [];
  const porConvenio = data?.porConvenio || [];

  const itensFiltrados = useMemo(() => {
    if (!data?.itens) return [];
    let items = data.itens;
    if (buscaDebounced) {
      const s = buscaDebounced.toLowerCase();
      items = items.filter((i: any) =>
        (i.guia || "").toLowerCase().includes(s) ||
        (i.procedimento || "").toLowerCase().includes(s) ||
        (i.medico || "").toLowerCase().includes(s) ||
        (i.convenioNome || "").toLowerCase().includes(s) ||
        (i.carteira || "").toLowerCase().includes(s)
      );
    }
    return items;
  }, [data?.itens, buscaDebounced]);

  const totalPages = Math.ceil(itensFiltrados.length / pageSize);
  const itensPaginados = itensFiltrados.slice((page - 1) * pageSize, page * pageSize);

  // Distinct médicos for filter
  const medicosDisponiveis = useMemo(() => {
    return porMedico.map(m => m.medico).filter(Boolean);
  }, [porMedico]);

  const handleExportExcel = () => {
    if (!data) return;
    let rows: any[] = [];
    if (viewMode === "medico") {
      rows = porMedico.map(r => ({
        "Médico": r.medico, "CRM": r.crm, "Qtd Visitas": r.qtdVisitas,
        "Qtd Guias": r.qtdGuias, "Total Faturado": r.totalFaturado,
      }));
    } else if (viewMode === "convenio") {
      rows = porConvenio.map(r => ({
        "Convênio": r.convenioNome, "Qtd Visitas": r.qtdVisitas,
        "Qtd Guias": r.qtdGuias, "Total Faturado": r.totalFaturado,
      }));
    } else {
      rows = itensFiltrados.map((i: any) => ({
        "Guia": i.guia, "Procedimento": i.procedimento, "Valor": i.valor,
        "Médico": i.medico, "CRM": i.crm, "Data Execução": fmtDate(i.dataExecucao),
        "Convênio": i.convenioNome || "-", "Competência": i.competencia,
      }));
    }
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Array(Object.keys(rows[0]).length).fill({ wch: 22 });
    XLSX.utils.book_append_sheet(wb, ws, "Visitas XML");
    const compLabel = competencia || "todos";
    XLSX.writeFile(wb, `relatorio_visitas_faturadas_${compLabel.replace("/", "-")}.xlsx`);
    toast.success("Excel exportado!");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Stethoscope className="h-8 w-8 text-teal-500" />
              Visitas Faturadas (XML)
            </h1>
            <p className="text-muted-foreground">Código TUSS 10102019 — Visita Hospitalar (dados do faturamento XML enviado)</p>
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
                    {(competencias || []).map((c: any) => (
                      <SelectItem key={c.value} value={c.value}>{c.label} ({c.total} visitas)</SelectItem>
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
                <label className="text-sm font-medium">Médico</label>
                <Select value={medicoFilter} onValueChange={(v) => { setMedicoFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Médicos</SelectItem>
                    {medicosDisponiveis.map((m: string) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Visualização</label>
                <Select value={viewMode} onValueChange={(v: any) => { setViewMode(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medico">Por Médico</SelectItem>
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
                    <Input placeholder="Guia, médico, convênio..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleExportExcel} disabled={isLoading}><Download className="h-4 w-4 mr-2" /> Exportar Excel</Button>
              <Button variant="outline" onClick={() => { setCompetencia("all"); setConvenioId("todos"); setMedicoFilter("todos"); setBusca(""); }}>Limpar Filtros</Button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Total Visitas</p><p className="text-xl font-bold">{resumo.totalVisitas.toLocaleString("pt-BR")}</p></div>
          </div></CardContent></Card>

          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-teal-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Guias</p><p className="text-xl font-bold">{resumo.totalGuias.toLocaleString("pt-BR")}</p></div>
          </div></CardContent></Card>

          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Total Faturado</p><p className="text-sm font-bold text-emerald-600">{fmt(resumo.totalFaturado)}</p></div>
          </div></CardContent></Card>

          <Card><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 shrink-0" />
            <div><p className="text-xs text-muted-foreground">Médicos</p><p className="text-xl font-bold text-purple-600">{resumo.totalMedicos}</p></div>
          </div></CardContent></Card>
        </div>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {viewMode === "medico" ? <><UserCheck className="h-5 w-5 text-teal-600"/> Visitas por Médico ({porMedico.length})</>
               : viewMode === "convenio" ? <><Building2 className="h-5 w-5 text-blue-600"/> Visitas por Convênio ({porConvenio.length})</>
               : `Itens Detalhados (${itensFiltrados.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : viewMode === "medico" ? (
              /* ========== VISÃO POR MÉDICO ========== */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Médico</TableHead>
                      <TableHead>CRM</TableHead>
                      <TableHead className="text-center">Visitas</TableHead>
                      <TableHead className="text-center">Guias</TableHead>
                      <TableHead className="text-right">Total Faturado</TableHead>
                      <TableHead className="text-right">Média/Visita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porMedico.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado</TableCell></TableRow>
                    ) : porMedico.map((r, i) => (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => { setMedicoFilter(r.medico); setViewMode("detalhado"); }}>
                        <TableCell className="font-semibold">{r.medico}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{r.crm}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="font-mono">{r.qtdVisitas}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">{r.qtdGuias}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{fmt(r.totalFaturado)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-blue-600">{fmt(r.totalFaturado / (r.qtdVisitas || 1))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {porMedico.length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg flex justify-between text-sm font-semibold">
                    <span>Total: {porMedico.length} médicos</span>
                    <span>{porMedico.reduce((s, r) => s + r.qtdVisitas, 0)} visitas</span>
                    <span className="text-emerald-600">Faturado: {fmt(porMedico.reduce((s, r) => s + r.totalFaturado, 0))}</span>
                  </div>
                )}
              </div>
            ) : viewMode === "convenio" ? (
              /* ========== VISÃO POR CONVÊNIO ========== */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-center">Visitas</TableHead>
                      <TableHead className="text-center">Guias</TableHead>
                      <TableHead className="text-right">Total Faturado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porConvenio.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum dado</TableCell></TableRow>
                    ) : porConvenio.map((r, i) => (
                      <TableRow key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => { setConvenioId(String(r.convenioId)); setViewMode("detalhado"); }}>
                        <TableCell className="font-semibold">{r.convenioNome}</TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="font-mono">{r.qtdVisitas}</Badge></TableCell>
                        <TableCell className="text-center text-sm">{r.qtdGuias}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{fmt(r.totalFaturado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {porConvenio.length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg flex justify-between text-sm font-semibold">
                    <span>Total: {porConvenio.length} convênios</span>
                    <span>{porConvenio.reduce((s, r) => s + r.qtdVisitas, 0)} visitas</span>
                    <span className="text-emerald-600">Faturado: {fmt(porConvenio.reduce((s, r) => s + r.totalFaturado, 0))}</span>
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
                        <TableHead>Guia</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead>CRM</TableHead>
                        <TableHead>Data Execução</TableHead>
                        <TableHead>Convênio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensPaginados.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhum item encontrado
                        </TableCell></TableRow>
                      ) : itensPaginados.map((item: any, i: number) => (
                        <TableRow key={item.id || i}>
                          <TableCell className="font-mono text-sm text-blue-600 font-semibold">{item.guia || "-"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={item.procedimento}>{item.procedimento}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{fmt(item.valor)}</TableCell>
                          <TableCell className="text-sm font-medium">{item.medico || "-"}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{item.crm || "-"}</TableCell>
                          <TableCell className="text-sm">{fmtDate(item.dataExecucao)}</TableCell>
                          <TableCell className="text-sm">{item.convenioNome || "-"}</TableCell>
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
