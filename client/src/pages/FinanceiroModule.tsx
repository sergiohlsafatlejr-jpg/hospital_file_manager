import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Search, Check,
  Wallet, CreditCard, BarChart3, PiggyBank, Trash2, Building2, Users,
  ArrowUpDown, Calendar, FileText, Download, ChevronDown, ChevronRight,
  Banknote, Receipt, CircleDollarSign, Percent, ArrowDownRight, ArrowUpRight,
  Clock, CheckCircle, XCircle, Eye, Landmark, List, Upload, Target, Edit, ToggleLeft,
  RefreshCw, AlertCircle, CheckCircle2, WifiOff, ExternalLink, Loader2, MapPin,
  Filter, SortAsc, X, FileSpreadsheet, Copy
} from "lucide-react";
import * as XLSX from "xlsx";

// ==================== HELPERS ====================
function formatCurrency(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return String(d); }
}

const MONTHS = [
  { value: "01", label: "Janeiro" }, { value: "02", label: "Fevereiro" }, { value: "03", label: "Março" },
  { value: "04", label: "Abril" }, { value: "05", label: "Maio" }, { value: "06", label: "Junho" },
  { value: "07", label: "Julho" }, { value: "08", label: "Agosto" }, { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

// ==================== DASHBOARD ====================
function FinDashboard() {
  const now = new Date();
  const [mes, setMes] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const dashboard = trpc.financeiro.dashboard.resumo.useQuery({ mes });
  const d = dashboard.data;

  const [ano, mesNum] = mes.split("-");
  const mesLabel = MONTHS[Number(mesNum) - 1]?.label || mesNum;

  const saldo = d ? Number(d.receitasRecebido) - Number(d.despesasPago) : 0;
  const totalDespesas = d ? Number(d.despesasPago) + Number(d.despesasPendente) : 0;
  const totalReceitas = d ? Number(d.receitasRecebido) + Number(d.receitasPendente) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Dashboard Financeiro</h2>
          <p className="text-sm text-muted-foreground">{mesLabel} {ano}</p>
        </div>
        <div className="flex gap-2">
          <Select value={mesNum} onValueChange={v => setMes(`${ano}-${v}`)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ano} onValueChange={v => setMes(`${v}-${mesNum}`)}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {dashboard.isLoading ? <div className="text-center py-12 text-muted-foreground">Carregando...</div> : d ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="h-4 w-4" /> Despesas Pagas</div>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(d.despesasPago)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Clock className="h-4 w-4" /> Despesas Pendentes</div>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(d.despesasPendente)}</p>
                {Number(d.despesasVencido) > 0 && <p className="text-xs text-red-500 mt-1 font-medium">Vencidas: {formatCurrency(d.despesasVencido)}</p>}
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /> Receitas Recebidas</div>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(d.receitasRecebido)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Clock className="h-4 w-4" /> Receitas Pendentes</div>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(d.receitasPendente)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-l-4", saldo >= 0 ? "border-l-emerald-500" : "border-l-red-500")}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Percent className="h-4 w-4" /> Saldo do Mês</div>
                <p className={cn("text-2xl font-bold", saldo >= 0 ? "text-emerald-600" : "text-red-600")}>{formatCurrency(saldo)}</p>
              </CardContent>
            </Card>
          </div>

          {/* DRE Simplificado */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" /> DRE Gerencial — {mesLabel}/{ano}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0"><tr>
                    <th className="text-left p-3 font-semibold">Conta</th>
                    <th className="text-right p-3 font-semibold">Valor</th>
                    <th className="text-right p-3 font-semibold">% Receita</th>
                  </tr></thead>
                  <tbody>
                    {[
                      { label: "Receita Bruta (Recebimentos)", value: totalReceitas, highlight: true, bold: true },
                      { label: "  Recebido", value: Number(d.receitasRecebido), indent: 1 },
                      { label: "  A Receber", value: Number(d.receitasPendente), indent: 1 },
                      { label: "(-) Despesas Totais", value: -totalDespesas, highlight: true, bold: true },
                      { label: "  Pagas", value: -Number(d.despesasPago), indent: 1 },
                      { label: "  Pendentes", value: -Number(d.despesasPendente), indent: 1 },
                      { label: "  Vencidas", value: -Number(d.despesasVencido), indent: 1, warn: true },
                      { label: "Resultado do Período", value: saldo, highlight: true, bold: true, total: true },
                    ].map((row, i) => (
                      <tr key={i} className={cn("border-t border-border/50 transition-colors hover:bg-muted/30",
                        row.highlight && "bg-muted/20", row.total && "bg-primary/5")}>
                        <td className="p-3" style={{ paddingLeft: row.indent ? `${12 + row.indent * 24}px` : undefined }}>
                          <span className={cn(row.bold && "font-semibold", row.warn && "text-red-500")}>{row.label}</span>
                        </td>
                        <td className={cn("p-3 text-right tabular-nums whitespace-nowrap font-medium",
                          row.total && row.value >= 0 && "text-emerald-600 font-bold",
                          row.total && row.value < 0 && "text-red-600 font-bold",
                          !row.total && row.value < 0 && "text-red-500/80",
                          row.warn && "text-red-500")}>
                          {row.value !== 0 ? formatCurrency(row.value) : "—"}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                          {totalReceitas > 0 && row.value !== 0 ? `${(Math.abs(row.value) / totalReceitas * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Evolução 6 meses */}
          {d.evolucao && d.evolucao.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Evolução — Últimos 6 Meses</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 gap-2">
                  {d.evolucao.map((e: any, i: number) => (
                    <div key={i} className="text-center rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground mb-2">{e.mes}</p>
                      <p className="text-sm font-semibold text-green-600">{formatCurrency(e.receitas)}</p>
                      <p className="text-sm font-semibold text-red-500">{formatCurrency(e.despesas)}</p>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", e.receitas >= e.despesas ? "bg-green-500" : "bg-red-500")}
                          style={{ width: `${Math.min(100, e.receitas > 0 ? (Math.min(e.receitas, e.despesas) / Math.max(e.receitas, e.despesas)) * 100 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ==================== CONTAS A PAGAR ====================
function ContasPagar() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroCentroCusto, setFiltroCentroCusto] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todo");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [ordenacao, setOrdenacao] = useState<"data" | "az" | "valor">("data");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Calcular datas do período
  const periodoFiltro = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "mes") {
      return { dataInicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "trimestre") {
      const m = hoje.getMonth();
      const qi = m - (m % 3);
      return { dataInicio: new Date(hoje.getFullYear(), qi, 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), qi + 3, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "ano") {
      return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: `${hoje.getFullYear()}-12-31` };
    }
    return {};
  }, [filtroPeriodo]);

  const lista = trpc.financeiro.transacoes.listar.useQuery({
    busca: busca || undefined,
    pago: filtroStatus === "todos" ? undefined : filtroStatus as any,
    empresaId: filtroEmpresa !== "todas" ? Number(filtroEmpresa) : undefined,
    categoriaId: filtroCategoria !== "todas" ? Number(filtroCategoria) : undefined,
    centroCustoId: filtroCentroCusto !== "todos" ? Number(filtroCentroCusto) : undefined,
    dataInicio: periodoFiltro.dataInicio,
    dataFim: periodoFiltro.dataFim,
    limit: 500,
  });
  const empresas = trpc.financeiro.empresas.listar.useQuery();
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const bancos = trpc.financeiro.bancos.listar.useQuery();
  const centrosCusto = trpc.financeiro.centrosCusto.listar.useQuery();

  const criar = trpc.financeiro.transacoes.criar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta criada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const marcarPago = trpc.financeiro.transacoes.marcarPago.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Marcado como pago!"); },
  });
  const atualizar = trpc.financeiro.transacoes.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta atualizada!"); setEditDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.transacoes.excluir.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta excluída!"); },
  });
  const duplicar = trpc.financeiro.transacoes.duplicar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Conta duplicada!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirEmLote = trpc.financeiro.transacoes.excluirEmLote.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Contas excluídas!"); setSelectedIds(new Set()); },
  });

  const rawItems = lista.data?.items || [];
  const hoje = new Date().toISOString().slice(0, 10);

  // Ordenação
  const items = useMemo(() => {
    const sorted = [...rawItems];
    if (ordenacao === "az") sorted.sort((a: any, b: any) => (a.descricao || "").localeCompare(b.descricao || ""));
    else if (ordenacao === "valor") sorted.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
    // default "data" já vem ordenado do backend
    return sorted;
  }, [rawItems, ordenacao]);

  const totalPendente = items.filter((t: any) => t.pago === "nao").reduce((s: number, t: any) => s + Number(t.valor), 0);
  const totalVencido = items.filter((t: any) => t.pago === "nao" && t.dataVencimento && new Date(t.dataVencimento) < new Date(hoje)).reduce((s: number, t: any) => s + Number(t.valor), 0);
  const totalPago = items.filter((t: any) => t.pago === "sim").reduce((s: number, t: any) => s + Number(t.valor), 0);

  const totalSelecionado = useMemo(() => {
    return items.filter((t: any) => selectedIds.has(t.id)).reduce((s: number, t: any) => s + Number(t.valor), 0);
  }, [items, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((t: any) => t.id)));
  };

  const temFiltrosAtivos = filtroEmpresa !== "todas" || filtroCategoria !== "todas" || filtroCentroCusto !== "todos" || filtroPeriodo !== "todo" || filtroStatus !== "todos";

  const limparFiltros = () => {
    setFiltroEmpresa("todas"); setFiltroCategoria("todas"); setFiltroCentroCusto("todos"); setFiltroPeriodo("todo"); setFiltroStatus("todos"); setBusca("");
  };

  // Importar Excel
  const handleImportExcel = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".xlsx,.xls,.csv";
    input.onchange = async (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
          let importados = 0;
          for (const row of data) {
            const descricao = row["Descrição"] || row["descricao"] || row["DESCRICAO"] || "";
            const valor = String(row["Valor"] || row["valor"] || row["VALOR"] || "0").replace(",", ".");
            const venc = row["Vencimento"] || row["vencimento"] || row["DATA_VENCIMENTO"] || row["dataVencimento"] || "";
            if (descricao && valor) {
              await criar.mutateAsync({ descricao, valor, dataVencimento: venc || new Date().toISOString().slice(0, 10) });
              importados++;
            }
          }
          toast.success(`${importados} contas importadas com sucesso!`);
          utils.financeiro.invalidate();
        } catch (err) { toast.error("Erro ao importar arquivo"); }
      };
      reader.readAsBinaryString(file);
    };
    input.click();
  };

  // Exportar Excel
  const handleExportExcel = () => {
    const data = items.map((t: any) => ({
      "Descrição": t.descricao,
      "Valor": Number(t.valor),
      "Vencimento": t.dataVencimento ? new Date(t.dataVencimento).toLocaleDateString("pt-BR") : "",
      "Data Pagamento": t.dataPagamento ? new Date(t.dataPagamento).toLocaleDateString("pt-BR") : "",
      "Status": t.pago === "sim" ? "Pago" : "Pendente",
      "Categoria": t.categoriaNome || "",
      "Centro de Custo": t.centroCustoNome || "",
      "Observações": t.observacoes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas_pagar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado!");
  };

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    criar.mutate({
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      empresaId: fd.get("empresaId") ? Number(fd.get("empresaId")) : undefined,
      categoriaId: fd.get("categoriaId") ? Number(fd.get("categoriaId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      centroCustoId: fd.get("centroCustoId") ? Number(fd.get("centroCustoId")) : undefined,
      dataPagamento: (fd.get("dataPagamento") as string) || undefined,
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const handleEditar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const fd = new FormData(e.currentTarget);
    atualizar.mutate({
      id: editItem.id,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      empresaId: fd.get("empresaId") ? Number(fd.get("empresaId")) : undefined,
      categoriaId: fd.get("categoriaId") ? Number(fd.get("categoriaId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      centroCustoId: fd.get("centroCustoId") ? Number(fd.get("centroCustoId")) : undefined,
      dataPagamento: (fd.get("dataPagamento") as string) || undefined,
      pago: (fd.get("pago") as string) as any || "nao",
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const abrirEdicao = (item: any) => {
    setEditItem(item);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Contas a Pagar</h2>
          <div className="flex gap-4 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">Pendente: <span className="font-semibold text-amber-600">{formatCurrency(totalPendente)}</span></span>
            {totalVencido > 0 && <span className="text-sm text-red-500 font-medium">Vencido: {formatCurrency(totalVencido)}</span>}
            <span className="text-sm text-muted-foreground">Pago: <span className="font-semibold text-green-600">{formatCurrency(totalPago)}</span></span>
            {selectedIds.size > 0 && <span className="text-sm font-medium text-primary">Selecionado ({selectedIds.size}): <span className="font-bold">{formatCurrency(totalSelecionado)}</span></span>}
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova Conta a Pagar</DialogTitle><DialogDescription>Registre uma nova despesa.</DialogDescription></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Pagamento</Label><Input name="dataPagamento" type="date" /></div>
                <div><Label>Centro de Custo</Label><select name="centroCustoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(centrosCusto.data || []).map((cc: any) => <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.nome}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Empresa</Label><select name="empresaId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Categoria</Label><select name="categoriaId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(categorias.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} /></div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="w-36 h-8 text-xs"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todo">Todo período</SelectItem><SelectItem value="mes">Este mês</SelectItem><SelectItem value="trimestre">Este trimestre</SelectItem><SelectItem value="ano">Este ano</SelectItem></SelectContent>
          </Select>
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-36 h-8 text-xs"><Building2 className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Safatle</SelectItem>{(empresas.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-36 h-8 text-xs"><Target className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem>{(categorias.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCentroCusto} onValueChange={setFiltroCentroCusto}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{(centrosCusto.data || []).map((cc: any) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="nao">Pendentes</SelectItem><SelectItem value="sim">Pagos</SelectItem></SelectContent>
          </Select>
          {temFiltrosAtivos && <button onClick={limparFiltros} className="text-xs text-primary hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Limpar filtros</button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleImportExcel}><Upload className="h-3 w-3 mr-1" /> Importar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportExcel}><Download className="h-3 w-3 mr-1" /> Exportar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOrdenacao(ordenacao === "az" ? "data" : "az")}><SortAsc className="h-3 w-3 mr-1" /> Ordenar A-Z</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { utils.financeiro.invalidate(); toast.success("Dados atualizados!"); }}><RefreshCw className="h-3 w-3 mr-1" /> Atualizar custos</Button>
          <div className="ml-auto relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 w-48 text-xs" /></div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {lista.isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : items.length === 0 ? (
            <div className="py-12 text-center"><Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma conta encontrada</p></div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="py-3 pl-3 pr-1 w-8"><Checkbox checked={items.length > 0 && selectedIds.size === items.length} onCheckedChange={toggleSelectAll} /></th>
                <th className="py-3 pl-2 pr-2 text-xs font-semibold text-muted-foreground">Descrição</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground text-right">Valor</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Vencimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Categoria</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Centro de Custo</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Dt. Pagamento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="py-3 pl-2 pr-4 text-xs font-semibold text-muted-foreground text-right">Ações</th>
              </tr></thead>
              <tbody>{items.map((t: any) => {
                const vencido = t.pago === "nao" && t.dataVencimento && new Date(t.dataVencimento) < new Date(hoje);
                return (
                  <tr key={t.id} className={cn("border-b border-border hover:bg-muted/30 transition-colors", vencido && "bg-red-50/50 dark:bg-red-900/10", selectedIds.has(t.id) && "bg-primary/5")}>
                    <td className="py-3 pl-3 pr-1 w-8"><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></td>
                    <td className="py-3 pl-2 pr-2"><p className="font-medium">{t.descricao}</p>{t.observacoes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{t.observacoes}</p>}</td>
                    <td className="px-2 py-3 text-right font-semibold text-red-600 whitespace-nowrap">{formatCurrency(t.valor)}</td>
                    <td className="px-2 py-3 whitespace-nowrap"><span className={cn(vencido && "text-red-500 font-medium")}>{formatDate(t.dataVencimento)}</span></td>
                    <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.categoriaNome || <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.centroCustoNome || <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3 text-xs whitespace-nowrap">{t.dataPagamento ? <span className="text-green-600 font-medium">{formatDate(t.dataPagamento)}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                    <td className="px-2 py-3">{t.pago === "sim" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-xs font-semibold text-green-600"><CheckCircle className="h-3 w-3" /> Pago</span> : vencido ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-xs font-semibold text-red-500"><AlertTriangle className="h-3 w-3" /> Vencido</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-semibold text-amber-600"><Clock className="h-3 w-3" /> Pendente</span>}</td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => abrirEdicao(t)} title="Editar"><Edit className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-500" onClick={() => duplicar.mutate({ id: t.id })} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                        {t.pago === "nao" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcarPago.mutate({ id: t.id })}><Check className="h-3 w-3 mr-1" /> Pagar</Button>}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: t.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} item(ns) selecionado(s) — Total: <span className="font-bold text-primary">{formatCurrency(totalSelecionado)}</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3 mr-1" /> Limpar</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm(`Excluir ${selectedIds.size} conta(s)?`)) excluirEmLote.mutate({ ids: Array.from(selectedIds) }); }}><Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados</Button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground text-right">{items.length} registro(s) encontrado(s)</div>

      {/* Dialog de Edição - Contas a Pagar */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Conta a Pagar</DialogTitle><DialogDescription>Altere os dados da conta.</DialogDescription></DialogHeader>
          {editItem && (
            <form onSubmit={handleEditar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" defaultValue={editItem.descricao} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" defaultValue={Number(editItem.valor)} required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" defaultValue={editItem.dataVencimento ? new Date(editItem.dataVencimento).toISOString().slice(0, 10) : ""} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Pagamento</Label><Input name="dataPagamento" type="date" defaultValue={editItem.dataPagamento ? new Date(editItem.dataPagamento).toISOString().slice(0, 10) : ""} /></div>
                <div><Label>Status</Label><select name="pago" defaultValue={editItem.pago || "nao"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Pago</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Centro de Custo</Label><select name="centroCustoId" defaultValue={editItem.centroCustoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(centrosCusto.data || []).map((cc: any) => <option key={cc.id} value={cc.id}>{cc.codigo} - {cc.nome}</option>)}</select></div>
                <div><Label>Categoria</Label><select name="categoriaId" defaultValue={editItem.categoriaId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(categorias.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><select name="empresaId" defaultValue={editItem.empresaId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" defaultValue={editItem.bancoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} defaultValue={editItem.observacoes || ""} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={atualizar.isPending}>{atualizar.isPending ? "Salvando..." : "Salvar Alterações"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== CONTAS A RECEBER ====================
function ContasReceber() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("todas");
  const [filtroTipoServico, setFiltroTipoServico] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todo");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [ordenacao, setOrdenacao] = useState<"data" | "az" | "valor">("data");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  // Calcular datas do período
  const periodoFiltro = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "mes") {
      return { dataInicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "trimestre") {
      const m = hoje.getMonth();
      const qi = m - (m % 3);
      return { dataInicio: new Date(hoje.getFullYear(), qi, 1).toISOString().slice(0, 10), dataFim: new Date(hoje.getFullYear(), qi + 3, 0).toISOString().slice(0, 10) };
    }
    if (filtroPeriodo === "ano") {
      return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: `${hoje.getFullYear()}-12-31` };
    }
    return {};
  }, [filtroPeriodo]);

  const lista = trpc.financeiro.recebiveis.listar.useQuery({
    busca: busca || undefined,
    recebido: filtroStatus === "todos" ? undefined : filtroStatus as any,
    empresaId: filtroEmpresa !== "todas" ? Number(filtroEmpresa) : undefined,
    clienteId: filtroCliente !== "todos" ? Number(filtroCliente) : undefined,
    tipoServico: filtroTipoServico !== "todos" ? filtroTipoServico : undefined,
    dataInicio: periodoFiltro.dataInicio,
    dataFim: periodoFiltro.dataFim,
    limit: 500,
  });
  const empresas = trpc.financeiro.empresas.listar.useQuery();
  const clientes = trpc.financeiro.clientes.listar.useQuery();
  const bancos = trpc.financeiro.bancos.listar.useQuery();
  const tiposServicoDistintos = trpc.financeiro.recebiveis.tiposServicoDistintos.useQuery();

  const criar = trpc.financeiro.recebiveis.criar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const marcarRecebido = trpc.financeiro.recebiveis.marcarRecebido.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Marcado como recebido!"); },
  });
  const atualizarRecebivel = trpc.financeiro.recebiveis.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível atualizado!"); setEditDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.recebiveis.excluir.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível excluído!"); },
  });
  const duplicarRecebivel = trpc.financeiro.recebiveis.duplicar.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebível duplicado!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirEmLoteRecebivel = trpc.financeiro.recebiveis.excluirEmLote.useMutation({
    onSuccess: () => { utils.financeiro.invalidate(); toast.success("Recebíveis excluídos!"); setSelectedIds(new Set()); },
  });

  const rawItems = lista.data?.items || [];

  // Ordenação
  const items = useMemo(() => {
    const sorted = [...rawItems];
    if (ordenacao === "az") sorted.sort((a: any, b: any) => (a.descricao || "").localeCompare(b.descricao || ""));
    else if (ordenacao === "valor") sorted.sort((a: any, b: any) => Number(b.valor) - Number(a.valor));
    return sorted;
  }, [rawItems, ordenacao]);

  const totalPendente = items.filter((r: any) => r.recebido === "nao").reduce((s: number, r: any) => s + Number(r.valor), 0);
  const totalRecebido = items.filter((r: any) => r.recebido === "sim").reduce((s: number, r: any) => s + Number(r.valor), 0);

  const totalSelecionado = useMemo(() => {
    return items.filter((r: any) => selectedIds.has(r.id)).reduce((s: number, r: any) => s + Number(r.valor), 0);
  }, [items, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((r: any) => r.id)));
  };

  const temFiltrosAtivos = filtroEmpresa !== "todas" || filtroTipoServico !== "todos" || filtroCliente !== "todos" || filtroPeriodo !== "todo" || filtroStatus !== "todos";

  const limparFiltros = () => {
    setFiltroEmpresa("todas"); setFiltroTipoServico("todos"); setFiltroCliente("todos"); setFiltroPeriodo("todo"); setFiltroStatus("todos"); setBusca("");
  };

  // Tipos de serviço pré-definidos para o select do formulário
  const tiposServicoPadrao = ["Consulta", "Exame", "Cirurgia", "Internação", "Procedimento", "Fisioterapia", "Urgência/Emergência", "Home Care", "Telemedicina", "Outros"];

  // Exportar Excel
  const handleExportExcel = () => {
    const data = items.map((r: any) => ({
      "Descrição": r.descricao,
      "Valor": Number(r.valor),
      "Vencimento": r.dataVencimento ? new Date(r.dataVencimento).toLocaleDateString("pt-BR") : "",
      "Dt. Recebimento": r.dataRecebimento ? new Date(r.dataRecebimento).toLocaleDateString("pt-BR") : "",
      "Status": r.recebido === "sim" ? "Recebido" : "Pendente",
      "Tipo de Serviço": r.tipoServico || "",
      "Descrição do Serviço": r.descricaoServico || "",
      "Cliente": r.clienteNome || "",
      "Observações": r.observacoes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Receber");
    XLSX.writeFile(wb, `contas_receber_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado!");
  };

  // Importar Excel
  const handleImportExcel = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".xlsx,.xls,.csv";
    input.onchange = async (ev: any) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
          let importados = 0;
          for (const row of data) {
            const descricao = row["Descrição"] || row["descricao"] || row["DESCRICAO"] || "";
            const valor = String(row["Valor"] || row["valor"] || row["VALOR"] || "0").replace(",", ".");
            const venc = row["Vencimento"] || row["vencimento"] || row["DATA_VENCIMENTO"] || row["dataVencimento"] || "";
            const tipoServ = row["Tipo de Serviço"] || row["tipoServico"] || row["TIPO_SERVICO"] || "";
            const descServ = row["Descrição do Serviço"] || row["descricaoServico"] || row["DESCRICAO_SERVICO"] || "";
            if (descricao && valor) {
              await criar.mutateAsync({
                descricao, valor, dataVencimento: venc || new Date().toISOString().slice(0, 10),
                tipoServico: tipoServ || undefined, descricaoServico: descServ || undefined,
              });
              importados++;
            }
          }
          toast.success(`${importados} recebíveis importados com sucesso!`);
          utils.financeiro.invalidate();
        } catch (err) { toast.error("Erro ao importar arquivo"); }
      };
      reader.readAsBinaryString(file);
    };
    input.click();
  };

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    criar.mutate({
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      empresaId: fd.get("empresaId") ? Number(fd.get("empresaId")) : undefined,
      clienteId: fd.get("clienteId") ? Number(fd.get("clienteId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      tipoServico: (fd.get("tipoServico") as string) || undefined,
      descricaoServico: (fd.get("descricaoServico") as string) || undefined,
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const handleEditarRecebivel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const fd = new FormData(e.currentTarget);
    atualizarRecebivel.mutate({
      id: editItem.id,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      dataRecebimento: (fd.get("dataRecebimento") as string) || undefined,
      empresaId: fd.get("empresaId") ? Number(fd.get("empresaId")) : undefined,
      clienteId: fd.get("clienteId") ? Number(fd.get("clienteId")) : undefined,
      bancoId: fd.get("bancoId") ? Number(fd.get("bancoId")) : undefined,
      tipoServico: (fd.get("tipoServico") as string) || undefined,
      descricaoServico: (fd.get("descricaoServico") as string) || undefined,
      recebido: (fd.get("recebido") as string) as any || "nao",
      observacoes: (fd.get("observacoes") as string) || undefined,
    });
  };

  const abrirEdicaoRecebivel = (item: any) => {
    setEditItem(item);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Contas a Receber</h2>
          <div className="flex gap-4 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">Pendente: <span className="font-semibold text-blue-600">{formatCurrency(totalPendente)}</span></span>
            <span className="text-sm text-muted-foreground">Recebido: <span className="font-semibold text-green-600">{formatCurrency(totalRecebido)}</span></span>
            {selectedIds.size > 0 && <span className="text-sm font-medium text-primary">Selecionado ({selectedIds.size}): <span className="font-bold">{formatCurrency(totalSelecionado)}</span></span>}
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Recebível</Button>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Recebível</DialogTitle><DialogDescription>Registre uma nova receita a receber.</DialogDescription></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo de Serviço</Label><select name="tipoServico" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{tiposServicoPadrao.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><Label>Cliente</Label><select name="clienteId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(clientes.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div><Label>Descrição do Serviço</Label><Textarea name="descricaoServico" rows={2} placeholder="Descreva detalhes do serviço prestado..." /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Empresa</Label><select name="empresaId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
                <div></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} /></div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filtros:</span>
          <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
            <SelectTrigger className="w-36 h-8 text-xs"><Calendar className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todo">Todo período</SelectItem><SelectItem value="mes">Este mês</SelectItem><SelectItem value="trimestre">Este trimestre</SelectItem><SelectItem value="ano">Este ano</SelectItem></SelectContent>
          </Select>
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="w-36 h-8 text-xs"><Building2 className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas</SelectItem>{(empresas.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroCliente} onValueChange={setFiltroCliente}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{(clientes.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroTipoServico} onValueChange={setFiltroTipoServico}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{(tiposServicoDistintos.data || []).map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="nao">Pendentes</SelectItem><SelectItem value="sim">Recebidos</SelectItem></SelectContent>
          </Select>
          {temFiltrosAtivos && <button onClick={limparFiltros} className="text-xs text-primary hover:underline flex items-center gap-1"><X className="h-3 w-3" /> Limpar filtros</button>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleImportExcel}><Upload className="h-3 w-3 mr-1" /> Importar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExportExcel}><Download className="h-3 w-3 mr-1" /> Exportar Excel</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOrdenacao(ordenacao === "az" ? "data" : "az")}><SortAsc className="h-3 w-3 mr-1" /> Ordenar A-Z</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { utils.financeiro.invalidate(); toast.success("Dados atualizados!"); }}><RefreshCw className="h-3 w-3 mr-1" /> Atualizar</Button>
          <div className="ml-auto relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 w-48 text-xs" /></div>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          {lista.isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : items.length === 0 ? (
            <div className="py-12 text-center"><Banknote className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum recebível encontrado</p></div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="py-3 pl-3 pr-1 w-8"><Checkbox checked={items.length > 0 && selectedIds.size === items.length} onCheckedChange={toggleSelectAll} /></th>
                <th className="py-3 pl-2 pr-2 text-xs font-semibold text-muted-foreground">Descrição</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground text-right">Valor</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Vencimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Tipo de Serviço</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Desc. Serviço</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Dt. Recebimento</th>
                <th className="px-2 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="py-3 pl-2 pr-4 text-xs font-semibold text-muted-foreground text-right">Ações</th>
              </tr></thead>
              <tbody>{items.map((r: any) => (
                <tr key={r.id} className={cn("border-b border-border hover:bg-muted/30 transition-colors", selectedIds.has(r.id) && "bg-primary/5")}>
                  <td className="py-3 pl-3 pr-1 w-8"><Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></td>
                  <td className="py-3 pl-2 pr-2"><p className="font-medium">{r.descricao}</p>{r.observacoes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{r.observacoes}</p>}</td>
                  <td className="px-2 py-3 text-right font-semibold text-green-600 whitespace-nowrap">{formatCurrency(r.valor)}</td>
                  <td className="px-2 py-3 whitespace-nowrap">{formatDate(r.dataVencimento)}</td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap">{r.tipoServico ? <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">{r.tipoServico}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3 text-xs text-muted-foreground"><p className="truncate max-w-[200px]" title={r.descricaoServico || ""}>{r.descricaoServico || <span className="text-muted-foreground/50">—</span>}</p></td>
                  <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.clienteNome || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap">{r.dataRecebimento ? <span className="text-green-600 font-medium">{formatDate(r.dataRecebimento)}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-2 py-3">{r.recebido === "sim" ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-xs font-semibold text-green-600"><CheckCircle className="h-3 w-3" /> Recebido</span> : <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-semibold text-blue-600"><Clock className="h-3 w-3" /> Pendente</span>}</td>
                  <td className="py-3 pl-2 pr-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500" onClick={() => abrirEdicaoRecebivel(r)} title="Editar"><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-500" onClick={() => duplicarRecebivel.mutate({ id: r.id })} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                      {r.recebido === "nao" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marcarRecebido.mutate({ id: r.id })}><Check className="h-3 w-3 mr-1" /> Receber</Button>}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="text-sm font-medium">{selectedIds.size} item(ns) selecionado(s) — Total: <span className="font-bold text-primary">{formatCurrency(totalSelecionado)}</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}><X className="h-3 w-3 mr-1" /> Limpar</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm(`Excluir ${selectedIds.size} recebível(is)?`)) excluirEmLoteRecebivel.mutate({ ids: Array.from(selectedIds) }); }}><Trash2 className="h-3 w-3 mr-1" /> Excluir selecionados</Button>
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground text-right">{items.length} registro(s) encontrado(s)</div>

      {/* Dialog de Edição - Contas a Receber */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Recebível</DialogTitle><DialogDescription>Altere os dados do recebível.</DialogDescription></DialogHeader>
          {editItem && (
            <form onSubmit={handleEditarRecebivel} className="space-y-3">
              <div><Label>Descrição *</Label><Input name="descricao" defaultValue={editItem.descricao} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" min="0" defaultValue={Number(editItem.valor)} required /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" defaultValue={editItem.dataVencimento ? new Date(editItem.dataVencimento).toISOString().slice(0, 10) : ""} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de Recebimento</Label><Input name="dataRecebimento" type="date" defaultValue={editItem.dataRecebimento ? new Date(editItem.dataRecebimento).toISOString().slice(0, 10) : ""} /></div>
                <div><Label>Status</Label><select name="recebido" defaultValue={editItem.recebido || "nao"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="nao">Pendente</option><option value="sim">Recebido</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo de Serviço</Label><select name="tipoServico" defaultValue={editItem.tipoServico || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{tiposServicoPadrao.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><Label>Cliente</Label><select name="clienteId" defaultValue={editItem.clienteId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(clientes.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
              </div>
              <div><Label>Descrição do Serviço</Label><Textarea name="descricaoServico" rows={2} defaultValue={editItem.descricaoServico || ""} placeholder="Descreva detalhes do serviço prestado..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Empresa</Label><select name="empresaId" defaultValue={editItem.empresaId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(empresas.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
                <div><Label>Banco</Label><select name="bancoId" defaultValue={editItem.bancoId || ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">-</option>{(bancos.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} defaultValue={editItem.observacoes || ""} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button><Button type="submit" disabled={atualizarRecebivel.isPending}>{atualizarRecebivel.isPending ? "Salvando..." : "Salvar Alterações"}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== BANCOS ====================
function BancosView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();
  const bancos = trpc.financeiro.bancos.listar.useQuery();
  const criar = trpc.financeiro.bancos.criar.useMutation({
    onSuccess: () => { utils.financeiro.bancos.invalidate(); toast.success("Banco criado!"); setDialogOpen(false); },
  });
  const excluir = trpc.financeiro.bancos.excluir.useMutation({
    onSuccess: () => { utils.financeiro.bancos.invalidate(); toast.success("Banco excluído!"); },
  });

  const handleCriar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    criar.mutate({ nome: fd.get("nome") as string, cor: (fd.get("cor") as string) || "#3b82f6", saldoInicial: (fd.get("saldoInicial") as string) || "0" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Contas Bancárias</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Banco</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Conta Bancária</DialogTitle></DialogHeader>
            <form onSubmit={handleCriar} className="space-y-3">
              <div><Label>Nome *</Label><Input name="nome" required placeholder="Ex: Banco do Brasil" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cor</Label><Input name="cor" type="color" defaultValue="#3b82f6" /></div>
                <div><Label>Saldo Inicial</Label><Input name="saldoInicial" type="number" step="0.01" defaultValue="0" /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={criar.isPending}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bancos.isLoading ? <div className="col-span-3 text-center py-8 text-muted-foreground">Carregando...</div> : (bancos.data || []).length === 0 ? (
          <div className="col-span-3 text-center py-12"><Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada</p></div>
        ) : (bancos.data || []).map((b: any) => (
          <Card key={b.id} className="border-l-4" style={{ borderLeftColor: b.cor || "#3b82f6" }}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><Landmark className="h-4 w-4" style={{ color: b.cor || "#3b82f6" }} /><span className="font-semibold">{b.nome}</span></div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: b.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="text-lg font-bold">{formatCurrency(b.saldoInicial)}</p>
              <p className="text-xs text-muted-foreground">Saldo inicial</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ==================== CENTROS DE CUSTO ====================
function CentrosCusto() {
  const utils = trpc.useUtils();
  const centros = trpc.financeiro.centrosCusto.listar.useQuery();
  const resumo = trpc.financeiro.centrosCusto.resumo.useQuery();
  const [dialog, setDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const criar = trpc.financeiro.centrosCusto.criar.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo criado!"); setDialog(false); },
  });
  const atualizar = trpc.financeiro.centrosCusto.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo atualizado!"); setEditItem(null); },
  });
  const excluir = trpc.financeiro.centrosCusto.excluir.useMutation({
    onSuccess: () => { utils.financeiro.centrosCusto.invalidate(); toast.success("Centro de custo excluído!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      codigo: fd.get("codigo") as string,
      nome: fd.get("nome") as string,
      descricao: (fd.get("descricao") as string) || undefined,
      responsavel: (fd.get("responsavel") as string) || undefined,
      orcamentoMensal: (fd.get("orcamentoMensal") as string) || undefined,
    };
    if (editItem) {
      atualizar.mutate({ id: editItem.id, ...data, ativo: editItem.ativo });
    } else {
      criar.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Target className="h-5 w-5" /> Centros de Custo</h2>
        <Button onClick={() => { setEditItem(null); setDialog(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Centro de Custo</Button>
      </div>

      {/* Resumo por Centro de Custo */}
      {(resumo.data || []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(resumo.data || []).map((r: any, i: number) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-mono">{r.ccCodigo}</span>
                  {r.ccNome || "Sem centro"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Geral</span>
                  <span className="font-semibold">{formatCurrency(r.totalGeral)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Pago</span>
                  <span className="text-green-600 font-medium">{formatCurrency(r.totalPago)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Pendente</span>
                  <span className="text-amber-600 font-medium">{formatCurrency(r.totalPendente)}</span>
                </div>
                {r.ccOrcamento && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Orçamento</span>
                      <span>{formatCurrency(r.ccOrcamento)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={cn("h-2 rounded-full", Number(r.totalGeral) > Number(r.ccOrcamento) ? "bg-red-500" : "bg-green-500")}
                        style={{ width: `${Math.min(100, (Number(r.totalGeral) / Number(r.ccOrcamento)) * 100)}%` }}
                      />
                    </div>
                    <p className={cn("text-xs mt-1", Number(r.totalGeral) > Number(r.ccOrcamento) ? "text-red-500" : "text-green-600")}>
                      {((Number(r.totalGeral) / Number(r.ccOrcamento)) * 100).toFixed(1)}% utilizado
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lista de Centros de Custo */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Código</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Responsável</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Orçamento Mensal</th>
                <th className="text-center p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(centros.data || []).map((cc: any) => (
                <tr key={cc.id} className="border-b hover:bg-muted/20">
                  <td className="p-3 font-mono text-sm">{cc.codigo}</td>
                  <td className="p-3 text-sm font-medium">{cc.nome}</td>
                  <td className="p-3 text-sm text-muted-foreground">{cc.responsavel || "-"}</td>
                  <td className="p-3 text-sm text-right">{cc.orcamentoMensal ? formatCurrency(cc.orcamentoMensal) : "-"}</td>
                  <td className="p-3 text-center">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", cc.ativo === "sim" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {cc.ativo === "sim" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditItem(cc); setDialog(true); }}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        atualizar.mutate({ id: cc.id, codigo: cc.codigo, nome: cc.nome, ativo: cc.ativo === "sim" ? "nao" : "sim" });
                      }}><ToggleLeft className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => excluir.mutate({ id: cc.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(centros.data || []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum centro de custo cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Editar" : "Novo"} Centro de Custo</DialogTitle><DialogDescription>Preencha os dados do centro de custo</DialogDescription></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Código *</Label><Input name="codigo" defaultValue={editItem?.codigo || ""} required /></div>
              <div><Label>Nome *</Label><Input name="nome" defaultValue={editItem?.nome || ""} required /></div>
            </div>
            <div><Label>Descrição</Label><Textarea name="descricao" defaultValue={editItem?.descricao || ""} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Responsável</Label><Input name="responsavel" defaultValue={editItem?.responsavel || ""} /></div>
              <div><Label>Orçamento Mensal (R$)</Label><Input name="orcamentoMensal" type="number" step="0.01" defaultValue={editItem?.orcamentoMensal || ""} /></div>
            </div>
            <DialogFooter><Button type="submit">{editItem ? "Salvar" : "Criar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== IMPORTADOR EXCEL ====================
function ImportadorExcel() {
  const utils = trpc.useUtils();
  const empresas = trpc.financeiro.empresas.listar.useQuery();
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const centrosCusto = trpc.financeiro.centrosCusto.listar.useQuery();
  const bancos = trpc.financeiro.bancos.listar.useQuery();
  const clientes = trpc.financeiro.clientes.listar.useQuery();

  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [preview, setPreview] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number; total: number } | null>(null);
  const [defaultEmpresaId, setDefaultEmpresaId] = useState<string>("");
  const [defaultCategoriaId, setDefaultCategoriaId] = useState<string>("");
  const [defaultCentroCustoId, setDefaultCentroCustoId] = useState<string>("");
  const [defaultBancoId, setDefaultBancoId] = useState<string>("");
  const [defaultClienteId, setDefaultClienteId] = useState<string>("");

  const importarPagar = trpc.financeiro.importador.importarContasPagar.useMutation({
    onSuccess: (data) => { setResult(data); utils.financeiro.transacoes.invalidate(); toast.success(`${data.imported} contas importadas!`); },
    onError: (err) => toast.error(err.message),
  });
  const importarReceber = trpc.financeiro.importador.importarContasReceber.useMutation({
    onSuccess: (data) => { setResult(data); utils.financeiro.recebiveis.invalidate(); toast.success(`${data.imported} contas importadas!`); },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        if (data.length === 0) { toast.error("Planilha vazia"); return; }
        const hdrs = Object.keys(data[0]);
        setHeaders(hdrs);
        setPreview(data.slice(0, 10));
        // Auto-mapping
        const autoMap: Record<string, string> = {};
        hdrs.forEach(h => {
          const hl = h.toLowerCase().trim();
          if (hl.includes("descri")) autoMap["descricao"] = h;
          else if (hl.includes("valor")) autoMap["valor"] = h;
          else if (hl.includes("vencimento")) autoMap["dataVencimento"] = h;
          else if (hl.includes("pagamento") || hl.includes("recebimento")) autoMap[tipo === "pagar" ? "dataPagamento" : "dataRecebimento"] = h;
          else if (hl.includes("observa") || hl.includes("obs")) autoMap["observacoes"] = h;
          else if (hl.includes("status") || hl.includes("pago") || hl.includes("recebido")) autoMap[tipo === "pagar" ? "pago" : "recebido"] = h;
        });
        setMapping(autoMap);
        toast.success(`${data.length} linhas encontradas`);
      } catch { toast.error("Erro ao ler arquivo"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const input = document.createElement("input");
    input.type = "file";
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    handleFile({ target: input } as any);
  };

  const parseDate = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === "number") {
      // Excel serial date
      const d = new Date((val - 25569) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const str = String(val).trim();
    // DD/MM/YYYY
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    return str;
  };

  const parseStatus = (val: any): "sim" | "nao" => {
    const s = String(val).toLowerCase().trim();
    return ["sim", "s", "pago", "recebido", "yes", "1", "true"].includes(s) ? "sim" : "nao";
  };

  const handleImport = () => {
    if (!mapping.descricao || !mapping.valor || !mapping.dataVencimento) {
      toast.error("Mapeie pelo menos: Descrição, Valor e Data Vencimento");
      return;
    }
    setImporting(true);
    // Re-read full data
    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    const file = input?.files?.[0];
    if (!file) { toast.error("Selecione o arquivo novamente"); setImporting(false); return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allData = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      if (tipo === "pagar") {
        const items = allData.map(row => ({
          descricao: String(row[mapping.descricao] || "").trim(),
          valor: String(row[mapping.valor] || "0").replace(/[^\d.,-]/g, "").replace(",", "."),
          dataVencimento: parseDate(row[mapping.dataVencimento]) || new Date().toISOString().slice(0, 10),
          dataPagamento: mapping.dataPagamento ? parseDate(row[mapping.dataPagamento]) : undefined,
          pago: mapping.pago ? parseStatus(row[mapping.pago]) : undefined,
          empresaId: defaultEmpresaId ? Number(defaultEmpresaId) : undefined,
          categoriaId: defaultCategoriaId ? Number(defaultCategoriaId) : undefined,
          centroCustoId: defaultCentroCustoId ? Number(defaultCentroCustoId) : undefined,
          bancoId: defaultBancoId ? Number(defaultBancoId) : undefined,
          observacoes: mapping.observacoes ? String(row[mapping.observacoes] || "") : undefined,
        })).filter(i => i.descricao && i.valor !== "0");
        importarPagar.mutate({ items }, { onSettled: () => setImporting(false) });
      } else {
        const items = allData.map(row => ({
          descricao: String(row[mapping.descricao] || "").trim(),
          valor: String(row[mapping.valor] || "0").replace(/[^\d.,-]/g, "").replace(",", "."),
          dataVencimento: parseDate(row[mapping.dataVencimento]) || new Date().toISOString().slice(0, 10),
          dataRecebimento: mapping.dataRecebimento ? parseDate(row[mapping.dataRecebimento]) : undefined,
          recebido: mapping.recebido ? parseStatus(row[mapping.recebido]) : undefined,
          empresaId: defaultEmpresaId ? Number(defaultEmpresaId) : undefined,
          clienteId: defaultClienteId ? Number(defaultClienteId) : undefined,
          bancoId: defaultBancoId ? Number(defaultBancoId) : undefined,
          observacoes: mapping.observacoes ? String(row[mapping.observacoes] || "") : undefined,
        })).filter(i => i.descricao && i.valor !== "0");
        importarReceber.mutate({ items }, { onSettled: () => setImporting(false) });
      }
    };
    reader.readAsBinaryString(file);
  };

  const requiredFields = tipo === "pagar"
    ? ["descricao", "valor", "dataVencimento", "dataPagamento", "pago", "observacoes"]
    : ["descricao", "valor", "dataVencimento", "dataRecebimento", "recebido", "observacoes"];
  const fieldLabels: Record<string, string> = {
    descricao: "Descrição *", valor: "Valor *", dataVencimento: "Data Vencimento *",
    dataPagamento: "Data Pagamento", dataRecebimento: "Data Recebimento",
    pago: "Status (Pago/Não)", recebido: "Status (Recebido/Não)", observacoes: "Observações",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Excel</h2>
        <div className="flex gap-2">
          <Button variant={tipo === "pagar" ? "default" : "outline"} size="sm" onClick={() => setTipo("pagar")}>
            <Receipt className="h-4 w-4 mr-1" /> Contas a Pagar
          </Button>
          <Button variant={tipo === "receber" ? "default" : "outline"} size="sm" onClick={() => setTipo("receber")}>
            <Banknote className="h-4 w-4 mr-1" /> Contas a Receber
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <Card>
        <CardContent className="p-8">
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.querySelector<HTMLInputElement>("input[type=file]")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium">{fileName || "Arraste o arquivo Excel aqui"}</p>
            <p className="text-sm text-muted-foreground mt-1">Ou clique para selecionar (.xlsx, .xls, .csv)</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          {/* Mapeamento de Colunas */}
          <Card>
            <CardHeader><CardTitle className="text-base">Mapeamento de Colunas</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {requiredFields.map(field => (
                  <div key={field}>
                    <Label className="text-xs">{fieldLabels[field]}</Label>
                    <Select value={mapping[field] || ""} onValueChange={v => setMapping(prev => ({ ...prev, [field]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar coluna" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">-- Não mapear --</SelectItem>
                        {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Valores Padrão */}
          <Card>
            <CardHeader><CardTitle className="text-base">Valores Padrão (aplicados a todas as linhas)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <Select value={defaultEmpresaId} onValueChange={setDefaultEmpresaId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">-- Nenhuma --</SelectItem>
                      {(empresas.data || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {tipo === "pagar" ? (
                  <>
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <Select value={defaultCategoriaId} onValueChange={setDefaultCategoriaId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Nenhuma --</SelectItem>
                          {(categorias.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Centro de Custo</Label>
                      <Select value={defaultCentroCustoId} onValueChange={setDefaultCentroCustoId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Nenhum --</SelectItem>
                          {(centrosCusto.data || []).map((cc: any) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.codigo} - {cc.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div>
                    <Label className="text-xs">Cliente</Label>
                    <Select value={defaultClienteId} onValueChange={setDefaultClienteId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">-- Nenhum --</SelectItem>
                        {(clientes.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Banco</Label>
                  <Select value={defaultBancoId} onValueChange={setDefaultBancoId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">-- Nenhum --</SelectItem>
                      {(bancos.data || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pré-visualização (primeiras 10 linhas)</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {headers.map(h => <th key={h} className="p-2 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b">
                      {headers.map(h => <td key={h} className="p-2 max-w-[200px] truncate">{String(row[h] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Botão Importar */}
          <div className="flex items-center gap-4">
            <Button onClick={handleImport} disabled={importing} size="lg">
              {importing ? "Importando..." : `Importar ${tipo === "pagar" ? "Contas a Pagar" : "Contas a Receber"}`}
            </Button>
            {result && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle className="h-4 w-4" /> {result.imported} importadas</span>
                {result.errors > 0 && <span className="text-red-500 font-medium flex items-center gap-1"><XCircle className="h-4 w-4" /> {result.errors} erros</span>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== CADASTROS ====================
function Cadastros() {
  const utils = trpc.useUtils();
  const empresas = trpc.financeiro.empresas.listar.useQuery();
  const categorias = trpc.financeiro.categorias.listar.useQuery();
  const clientes = trpc.financeiro.clientes.listar.useQuery();

  const [empDialog, setEmpDialog] = useState(false);
  const [catDialog, setCatDialog] = useState(false);
  const [cliDialog, setCliDialog] = useState(false);
  const [editCliente, setEditCliente] = useState<any>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const criarEmpresa = trpc.financeiro.empresas.criar.useMutation({ onSuccess: () => { utils.financeiro.empresas.invalidate(); toast.success("Empresa criada!"); setEmpDialog(false); } });
  const criarCategoria = trpc.financeiro.categorias.criar.useMutation({ onSuccess: () => { utils.financeiro.categorias.invalidate(); toast.success("Categoria criada!"); setCatDialog(false); } });
  const criarCliente = trpc.financeiro.clientes.criar.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente criado!"); setCliDialog(false); setEditCliente(null); } });
  const atualizarCliente = trpc.financeiro.clientes.atualizar.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente atualizado!"); setCliDialog(false); setEditCliente(null); } });
  const excluirEmpresa = trpc.financeiro.empresas.excluir.useMutation({ onSuccess: () => { utils.financeiro.empresas.invalidate(); toast.success("Empresa excluída!"); } });
  const excluirCategoria = trpc.financeiro.categorias.excluir.useMutation({ onSuccess: () => { utils.financeiro.categorias.invalidate(); toast.success("Categoria excluída!"); } });
  const excluirCliente = trpc.financeiro.clientes.excluir.useMutation({ onSuccess: () => { utils.financeiro.clientes.invalidate(); toast.success("Cliente excluído!"); } });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Cadastros</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Empresas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Empresas</CardTitle>
              <Dialog open={empDialog} onOpenChange={setEmpDialog}><Button size="sm" variant="outline" onClick={() => setEmpDialog(true)}><Plus className="h-3.5 w-3.5" /></Button>
                <DialogContent><DialogHeader><DialogTitle>Nova Empresa</DialogTitle></DialogHeader><form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); criarEmpresa.mutate({ nome: fd.get("nome") as string, cnpj: (fd.get("cnpj") as string) || undefined }); }} className="space-y-3"><div><Label>Nome *</Label><Input name="nome" required /></div><div><Label>CNPJ</Label><Input name="cnpj" /></div><DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-auto">
              {(empresas.data || []).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-2 border-b border-border hover:bg-muted/30">
                  <div><p className="text-sm font-medium">{e.nome}</p>{e.cnpj && <p className="text-xs text-muted-foreground">{e.cnpj}</p>}</div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => excluirEmpresa.mutate({ id: e.id })}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {(empresas.data || []).length === 0 && <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma empresa</p>}
            </div>
          </CardContent>
        </Card>

        {/* Categorias */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><List className="h-4 w-4" /> Categorias</CardTitle>
              <Dialog open={catDialog} onOpenChange={setCatDialog}><Button size="sm" variant="outline" onClick={() => setCatDialog(true)}><Plus className="h-3.5 w-3.5" /></Button>
                <DialogContent><DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader><form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); criarCategoria.mutate({ nome: fd.get("nome") as string }); }} className="space-y-3"><div><Label>Nome *</Label><Input name="nome" required /></div><DialogFooter><Button type="submit">Salvar</Button></DialogFooter></form></DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-auto">
              {(categorias.data || []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2 border-b border-border hover:bg-muted/30">
                  <p className="text-sm font-medium">{c.nome}</p>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => excluirCategoria.mutate({ id: c.id })}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {(categorias.data || []).length === 0 && <p className="text-center py-4 text-xs text-muted-foreground">Nenhuma categoria</p>}
            </div>
          </CardContent>
        </Card>

        {/* Clientes */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Clientes</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setEditCliente(null); setCliDialog(true); }}><Plus className="h-3.5 w-3.5 mr-1" /> Novo Cliente</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium">Nome</th>
                    <th className="py-2 px-3 font-medium">CNPJ/CPF</th>
                    <th className="py-2 px-3 font-medium">Email</th>
                    <th className="py-2 px-3 font-medium">Telefone</th>
                    <th className="py-2 px-3 font-medium">Cidade/UF</th>
                    <th className="py-2 px-3 font-medium">CNPJ Safatle</th>
                    <th className="py-2 px-3 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(clientes.data || []).map((c: any) => (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium">{c.nome}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cnpj || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.email || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.telefone || "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cidade ? `${c.cidade}/${c.uf}` : "-"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.cnpjSafatle || "24.785.393/0001-54"}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditCliente(c); setCliDialog(true); }}><Edit className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" onClick={() => excluirCliente.mutate({ id: c.id })}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(clientes.data || []).length === 0 && (
                    <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum cliente cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Dialog Novo/Editar Cliente */}
        <Dialog open={cliDialog} onOpenChange={(open) => { setCliDialog(open); if (!open) setEditCliente(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload = {
                nome: fd.get("nome") as string,
                cnpj: (fd.get("cnpj") as string) || undefined,
                email: (fd.get("email") as string) || undefined,
                telefone: (fd.get("telefone") as string) || undefined,
                valorContrato: (fd.get("valorContrato") as string) || undefined,
                cep: (fd.get("cep") as string) || undefined,
                endereco: (fd.get("endereco") as string) || undefined,
                numero: (fd.get("numero") as string) || undefined,
                complemento: (fd.get("complemento") as string) || undefined,
                bairro: (fd.get("bairro") as string) || undefined,
                cidade: (fd.get("cidade") as string) || undefined,
                uf: (fd.get("uf") as string) || undefined,
                cnpjSafatle: (fd.get("cnpjSafatle") as string) || "24.785.393/0001-54",
              };
              if (editCliente) {
                atualizarCliente.mutate({ id: editCliente.id, ...payload });
              } else {
                criarCliente.mutate(payload);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Nome *</Label><Input name="nome" required defaultValue={editCliente?.nome || ""} /></div>
                <div><Label>CNPJ/CPF</Label><Input name="cnpj" defaultValue={editCliente?.cnpj || ""} placeholder="00.000.000/0000-00" /></div>
                <div><Label>Email</Label><Input name="email" type="email" defaultValue={editCliente?.email || ""} /></div>
                <div><Label>Telefone</Label><Input name="telefone" defaultValue={editCliente?.telefone || ""} placeholder="(00) 00000-0000" /></div>
                <div><Label>Valor Contrato (R$)</Label><Input name="valorContrato" defaultValue={editCliente?.valorContrato || ""} placeholder="0,00" /></div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>CEP</Label>
                    <div className="flex gap-2">
                      <Input name="cep" id="cep-input" defaultValue={editCliente?.cep || ""} placeholder="00000-000" 
                        onBlur={async (ev) => {
                          const cep = ev.target.value.replace(/\D/g, "");
                          if (cep.length !== 8) return;
                          setCepLoading(true);
                          try {
                            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                            const data = await res.json();
                            if (!data.erro) {
                              const form = ev.target.closest("form")!;
                              const setVal = (name: string, val: string) => { const el = form.querySelector(`[name="${name}"]`) as HTMLInputElement; if (el && val) el.value = val; };
                              setVal("endereco", data.logradouro);
                              setVal("bairro", data.bairro);
                              setVal("cidade", data.localidade);
                              setVal("uf", data.uf);
                              setVal("complemento", data.complemento);
                              toast.success("Endereço encontrado!");
                            } else {
                              toast.error("CEP não encontrado");
                            }
                          } catch { toast.error("Erro ao buscar CEP"); }
                          setCepLoading(false);
                        }}
                      />
                      {cepLoading && <div className="flex items-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
                    </div>
                  </div>
                  <div className="col-span-2"><Label>Endereço</Label><Input name="endereco" defaultValue={editCliente?.endereco || ""} placeholder="Rua, Avenida..." /></div>
                  <div><Label>Número</Label><Input name="numero" defaultValue={editCliente?.numero || ""} placeholder="123" /></div>
                  <div><Label>Complemento</Label><Input name="complemento" defaultValue={editCliente?.complemento || ""} placeholder="Sala, Andar..." /></div>
                  <div><Label>Bairro</Label><Input name="bairro" defaultValue={editCliente?.bairro || ""} /></div>
                  <div><Label>Cidade</Label><Input name="cidade" defaultValue={editCliente?.cidade || ""} /></div>
                  <div><Label>UF</Label><Input name="uf" defaultValue={editCliente?.uf || ""} maxLength={2} placeholder="GO" /></div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold mb-3">Vínculo Safatle</h4>
                <div><Label>CNPJ Safatle</Label><Input name="cnpjSafatle" defaultValue={editCliente?.cnpjSafatle || "24.785.393/0001-54"} /></div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCliDialog(false); setEditCliente(null); }}>Cancelar</Button>
                <Button type="submit">{editCliente ? "Atualizar" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ==================== BANCO INTER ====================
function BancoInterView() {
  const [subTab, setSubTab] = useState("extrato");
  const [periodo, setPeriodo] = useState(() => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return {
      dataInicio: inicio.toISOString().split('T')[0],
      dataFim: hoje.toISOString().split('T')[0],
    };
  });
  const [boletoPeriodo, setBoletoPeriodo] = useState(() => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
    return {
      dataInicial: inicio.toISOString().split('T')[0],
      dataFinal: hoje.toISOString().split('T')[0],
    };
  });
  const [showEmitirDialog, setShowEmitirDialog] = useState(false);
  const [showCancelarDialog, setShowCancelarDialog] = useState(false);
  const [boletoSelecionado, setBoletoSelecionado] = useState<string | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("");
  const [novoBoleto, setNovoBoleto] = useState({
    seuNumero: "",
    valorNominal: 0,
    dataVencimento: "",
    numDiasAgenda: 30,
    pagador: {
      cpfCnpj: "", tipoPessoa: "FISICA" as "FISICA" | "JURIDICA",
      nome: "", endereco: "", bairro: "", cidade: "", uf: "", cep: "",
      email: "", ddd: "", telefone: "",
    },
    multaTaxa: 2, moraTaxa: 1,
    mensagem: "",
  });

  const statusQuery = trpc.financeiro.bancoInter.status.useQuery();
  const saldoQuery = trpc.financeiro.bancoInter.saldo.useQuery(undefined, {
    enabled: statusQuery.data?.configured === true,
  });
  const extratoQuery = trpc.financeiro.bancoInter.extrato.useQuery(periodo, {
    enabled: statusQuery.data?.configured === true && subTab === "extrato",
  });
  const boletosQuery = trpc.financeiro.bancoInter.listarBoletos.useQuery({
    ...boletoPeriodo,
    situacao: filtroSituacao || undefined,
  }, {
    enabled: statusQuery.data?.configured === true && subTab === "boletos",
  });

  const emitirMutation = trpc.financeiro.bancoInter.emitirBoleto.useMutation({
    onSuccess: (data: any) => {
      if (data.error) { toast.error(data.error); return; }
      toast.success(`Boleto emitido! Código: ${data.codigoSolicitacao}`);
      setShowEmitirDialog(false);
      boletosQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelarMutation = trpc.financeiro.bancoInter.cancelarBoleto.useMutation({
    onSuccess: (data: any) => {
      if (data.error) { toast.error(data.error); return; }
      toast.success("Boleto cancelado com sucesso");
      setShowCancelarDialog(false);
      boletosQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const downloadPdfMutation = trpc.financeiro.bancoInter.downloadBoletoPdf.useMutation({
    onSuccess: (data: any) => {
      if (data.error) { toast.error(data.error); return; }
      if (data.pdf) {
        const byteChars = atob(data.pdf);
        const byteNums = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const isConfigured = statusQuery.data?.configured;

  if (statusQuery.isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!isConfigured) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-amber-500/10"><WifiOff className="h-8 w-8 text-amber-500" /></div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">API do Banco Inter Não Configurada</h3>
                <p className="text-sm text-muted-foreground">Para utilizar a integração com o Banco Inter, configure as credenciais de acesso:</p>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mt-2">
                  <li><strong>Client ID</strong> e <strong>Client Secret</strong> - Internet Banking do Inter</li>
                  <li><strong>Certificado Digital (.crt)</strong> e <strong>Chave Privada (.key)</strong> - mTLS em PEM</li>
                  <li><strong>Conta Corrente</strong> (opcional) - Para múltiplas contas</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Status da Configuração</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Client ID", ok: statusQuery.data?.hasClientId },
                { label: "Client Secret", ok: statusQuery.data?.hasClientSecret },
                { label: "Certificado", ok: statusQuery.data?.hasCert },
                { label: "Chave Privada", ok: statusQuery.data?.hasKey },
                { label: "Conta Corrente", ok: !!statusQuery.data?.contaCorrente },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 p-3 rounded-lg border">
                  {item.ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const situacaoColors: Record<string, string> = {
    RECEBIDO: "bg-green-500/10 text-green-600",
    A_RECEBER: "bg-blue-500/10 text-blue-600",
    MARCADO_RECEBIDO: "bg-green-500/10 text-green-500",
    ATRASADO: "bg-red-500/10 text-red-600",
    CANCELADO: "bg-gray-500/10 text-gray-500",
    EXPIRADO: "bg-orange-500/10 text-orange-600",
    EM_PROCESSAMENTO: "bg-yellow-500/10 text-yellow-600",
    FALHA_EMISSAO: "bg-red-500/10 text-red-500",
    PROTESTO: "bg-purple-500/10 text-purple-600",
  };

  const situacaoLabels: Record<string, string> = {
    RECEBIDO: "Recebido", A_RECEBER: "A Receber", MARCADO_RECEBIDO: "Marcado Recebido",
    ATRASADO: "Atrasado", CANCELADO: "Cancelado", EXPIRADO: "Expirado",
    EM_PROCESSAMENTO: "Processando", FALHA_EMISSAO: "Falha", PROTESTO: "Protesto",
  };

  function handleEmitir() {
    if (!novoBoleto.seuNumero || !novoBoleto.valorNominal || !novoBoleto.dataVencimento || !novoBoleto.pagador.cpfCnpj || !novoBoleto.pagador.nome) {
      toast.error("Preencha todos os campos obrigatórios"); return;
    }
    emitirMutation.mutate({
      seuNumero: novoBoleto.seuNumero,
      valorNominal: novoBoleto.valorNominal,
      dataVencimento: novoBoleto.dataVencimento,
      numDiasAgenda: novoBoleto.numDiasAgenda,
      pagador: novoBoleto.pagador,
      multa: novoBoleto.multaTaxa > 0 ? { taxa: novoBoleto.multaTaxa, codigo: "PERCENTUAL" } : undefined,
      mora: novoBoleto.moraTaxa > 0 ? { taxa: novoBoleto.moraTaxa, codigo: "TAXAMENSAL" } : undefined,
      mensagem: novoBoleto.mensagem ? { linha1: novoBoleto.mensagem } : undefined,
      formasRecebimento: ["BOLETO", "PIX"],
    });
  }

  return (
    <div className="space-y-6">
      {/* Status e Saldo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Status</p><p className="text-lg font-bold text-green-500">Conectado</p></div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Saldo Disponível</p>
                <p className="text-lg font-bold">{saldoQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : saldoQuery.data?.error ? <span className="text-red-500 text-sm">Erro</span> : formatCurrency(saldoQuery.data?.disponivel || 0)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Bloqueado</p>
                <p className="text-lg font-bold">{saldoQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(saldoQuery.data?.bloqueadoCheque || 0)}</p>
              </div>
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">Limite</p>
                <p className="text-lg font-bold">{saldoQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : formatCurrency(saldoQuery.data?.limite || 0)}</p>
              </div>
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-abas: Extrato / Boletos */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="extrato"><List className="h-4 w-4 mr-1" /> Extrato</TabsTrigger>
          <TabsTrigger value="boletos"><FileText className="h-4 w-4 mr-1" /> Boletos</TabsTrigger>
        </TabsList>

        {/* ---- EXTRATO ---- */}
        <TabsContent value="extrato">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Extrato Bancário</CardTitle>
                <div className="flex items-center gap-2">
                  <Input type="date" value={periodo.dataInicio} onChange={(e) => setPeriodo(p => ({ ...p, dataInicio: e.target.value }))} className="w-40" />
                  <span className="text-muted-foreground">até</span>
                  <Input type="date" value={periodo.dataFim} onChange={(e) => setPeriodo(p => ({ ...p, dataFim: e.target.value }))} className="w-40" />
                  <Button variant="outline" size="sm" onClick={() => { extratoQuery.refetch(); saldoQuery.refetch(); }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {extratoQuery.isLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2 text-muted-foreground">Consultando extrato...</span></div>
              ) : extratoQuery.data?.error ? (
                <div className="text-center py-8"><AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" /><p className="text-sm text-red-500">{extratoQuery.data.error}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left p-2">Data</th><th className="text-left p-2">Descrição</th><th className="text-left p-2">Tipo</th><th className="text-right p-2">Valor</th></tr></thead>
                    <tbody>
                      {(extratoQuery.data?.transacoes || []).length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma transação encontrada no período.</td></tr>
                      ) : (
                        (extratoQuery.data?.transacoes || []).map((t: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/50">
                            <td className="p-2">{t.dataEntrada || t.dataMovimento || '-'}</td>
                            <td className="p-2">{t.titulo || t.descricao || '-'}</td>
                            <td className="p-2"><span className={cn("px-2 py-0.5 rounded text-xs font-medium", t.tipoOperacao === 'C' || t.tipo === 'C' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>{t.tipoOperacao === 'C' || t.tipo === 'C' ? 'Crédito' : 'Débito'}</span></td>
                            <td className={cn("p-2 text-right font-medium", t.tipoOperacao === 'C' || t.tipo === 'C' ? "text-green-500" : "text-red-500")}>{t.tipoOperacao === 'C' || t.tipo === 'C' ? '+' : '-'}{formatCurrency(Math.abs(t.valor || 0))}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- BOLETOS ---- */}
        <TabsContent value="boletos">
          <div className="space-y-4">
            {/* Filtros e Ações */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Input type="date" value={boletoPeriodo.dataInicial} onChange={(e) => setBoletoPeriodo(p => ({ ...p, dataInicial: e.target.value }))} className="w-40" />
                    <span className="text-muted-foreground">até</span>
                    <Input type="date" value={boletoPeriodo.dataFinal} onChange={(e) => setBoletoPeriodo(p => ({ ...p, dataFinal: e.target.value }))} className="w-40" />
                    <Select value={filtroSituacao} onValueChange={setFiltroSituacao}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Todas situações" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas</SelectItem>
                        <SelectItem value="A_RECEBER">A Receber</SelectItem>
                        <SelectItem value="RECEBIDO">Recebido</SelectItem>
                        <SelectItem value="ATRASADO">Atrasado</SelectItem>
                        <SelectItem value="CANCELADO">Cancelado</SelectItem>
                        <SelectItem value="EM_PROCESSAMENTO">Processando</SelectItem>
                        <SelectItem value="EXPIRADO">Expirado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => boletosQuery.refetch()}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                    </Button>
                  </div>
                  <Button onClick={() => setShowEmitirDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Emitir Boleto
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Lista de Boletos */}
            <Card>
              <CardHeader><CardTitle className="text-base">Boletos Emitidos</CardTitle></CardHeader>
              <CardContent>
                {boletosQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2 text-muted-foreground">Consultando boletos...</span></div>
                ) : boletosQuery.data?.error ? (
                  <div className="text-center py-8"><AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" /><p className="text-sm text-red-500">{boletosQuery.data.error}</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Seu Número</th>
                          <th className="text-left p-2">Pagador</th>
                          <th className="text-left p-2">Vencimento</th>
                          <th className="text-right p-2">Valor</th>
                          <th className="text-center p-2">Situação</th>
                          <th className="text-center p-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(boletosQuery.data?.cobrancas || []).length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum boleto encontrado no período.</td></tr>
                        ) : (
                          (boletosQuery.data?.cobrancas || []).map((b: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-muted/50">
                              <td className="p-2 font-mono text-xs">{b.seuNumero || '-'}</td>
                              <td className="p-2">{b.pagador?.nome || '-'}</td>
                              <td className="p-2">{b.dataVencimento ? formatDate(b.dataVencimento) : '-'}</td>
                              <td className="p-2 text-right font-medium">{formatCurrency(b.valorNominal || 0)}</td>
                              <td className="p-2 text-center">
                                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", situacaoColors[b.situacao] || "bg-gray-500/10 text-gray-500")}>
                                  {situacaoLabels[b.situacao] || b.situacao}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button variant="ghost" size="sm" title="Download PDF" onClick={() => downloadPdfMutation.mutate({ codigoSolicitacao: b.codigoSolicitacao })}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {(b.situacao === 'A_RECEBER' || b.situacao === 'EM_PROCESSAMENTO') && (
                                    <Button variant="ghost" size="sm" title="Cancelar" className="text-red-500 hover:text-red-600" onClick={() => { setBoletoSelecionado(b.codigoSolicitacao); setShowCancelarDialog(true); }}>
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    {boletosQuery.data?.totalElementos > 0 && (
                      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                        <span>{boletosQuery.data.totalElementos} boleto(s) encontrado(s)</span>
                        <span>Página {(boletosQuery.data.paginaAtual || 0) + 1} de {boletosQuery.data.totalPaginas || 1}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Emitir Boleto */}
      <Dialog open={showEmitirDialog} onOpenChange={setShowEmitirDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir Novo Boleto</DialogTitle>
            <DialogDescription>Preencha os dados para emissão do boleto com código de barras e QR Code Pix.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Seu Número *</Label><Input value={novoBoleto.seuNumero} onChange={(e) => setNovoBoleto(p => ({ ...p, seuNumero: e.target.value }))} placeholder="Número de referência" maxLength={15} /></div>
              <div><Label>Valor Nominal (R$) *</Label><Input type="number" step="0.01" min="2.50" value={novoBoleto.valorNominal || ''} onChange={(e) => setNovoBoleto(p => ({ ...p, valorNominal: parseFloat(e.target.value) || 0 }))} placeholder="0,00" /></div>
              <div><Label>Data Vencimento *</Label><Input type="date" value={novoBoleto.dataVencimento} onChange={(e) => setNovoBoleto(p => ({ ...p, dataVencimento: e.target.value }))} /></div>
              <div><Label>Dias p/ Cancelamento Auto</Label><Input type="number" min={0} max={60} value={novoBoleto.numDiasAgenda} onChange={(e) => setNovoBoleto(p => ({ ...p, numDiasAgenda: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-3">Dados do Pagador</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Nome *</Label><Input value={novoBoleto.pagador.nome} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, nome: e.target.value } }))} /></div>
                <div><Label>CPF/CNPJ *</Label><Input value={novoBoleto.pagador.cpfCnpj} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, cpfCnpj: e.target.value } }))} placeholder="Somente números" /></div>
                <div>
                  <Label>Tipo Pessoa</Label>
                  <Select value={novoBoleto.pagador.tipoPessoa} onValueChange={(v) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, tipoPessoa: v as "FISICA" | "JURIDICA" } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FISICA">Pessoa Física</SelectItem>
                      <SelectItem value="JURIDICA">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>E-mail</Label><Input value={novoBoleto.pagador.email} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, email: e.target.value } }))} /></div>
                <div className="col-span-2"><Label>Endereço *</Label><Input value={novoBoleto.pagador.endereco} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, endereco: e.target.value } }))} /></div>
                <div><Label>Bairro *</Label><Input value={novoBoleto.pagador.bairro} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, bairro: e.target.value } }))} /></div>
                <div><Label>Cidade *</Label><Input value={novoBoleto.pagador.cidade} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, cidade: e.target.value } }))} /></div>
                <div><Label>UF *</Label><Input value={novoBoleto.pagador.uf} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, uf: e.target.value.toUpperCase() } }))} maxLength={2} /></div>
                <div><Label>CEP *</Label><Input value={novoBoleto.pagador.cep} onChange={(e) => setNovoBoleto(p => ({ ...p, pagador: { ...p.pagador, cep: e.target.value } }))} placeholder="Somente números" /></div>
              </div>
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-3">Encargos (opcional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Multa (%)</Label><Input type="number" step="0.01" min={0} value={novoBoleto.multaTaxa} onChange={(e) => setNovoBoleto(p => ({ ...p, multaTaxa: parseFloat(e.target.value) || 0 }))} /></div>
                <div><Label>Mora Mensal (%)</Label><Input type="number" step="0.01" min={0} value={novoBoleto.moraTaxa} onChange={(e) => setNovoBoleto(p => ({ ...p, moraTaxa: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
            </div>
            <div><Label>Mensagem no Boleto</Label><Textarea value={novoBoleto.mensagem} onChange={(e) => setNovoBoleto(p => ({ ...p, mensagem: e.target.value }))} placeholder="Mensagem opcional no corpo do boleto" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmitirDialog(false)}>Cancelar</Button>
            <Button onClick={handleEmitir} disabled={emitirMutation.isPending}>
              {emitirMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Emitindo...</> : <><FileText className="h-4 w-4 mr-1" /> Emitir Boleto</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cancelar Boleto */}
      <Dialog open={showCancelarDialog} onOpenChange={setShowCancelarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Boleto</DialogTitle>
            <DialogDescription>Informe o motivo do cancelamento. Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div><Label>Motivo do Cancelamento *</Label><Input value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Ex: Pagamento realizado por outra forma" maxLength={50} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelarDialog(false)}>Voltar</Button>
            <Button variant="destructive" onClick={() => { if (!motivoCancelamento.trim()) { toast.error("Informe o motivo"); return; } if (boletoSelecionado) cancelarMutation.mutate({ codigoSolicitacao: boletoSelecionado, motivoCancelamento }); }} disabled={cancelarMutation.isPending}>
              {cancelarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />} Cancelar Boleto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-green-500" />
            <span>Integração ativa com Banco Inter</span>
            <span className="mx-2">|</span>
            <span>Base URL: {statusQuery.data?.baseUrl}</span>
            {statusQuery.data?.contaCorrente && (<><span className="mx-2">|</span><span>Conta: {statusQuery.data.contaCorrente}</span></>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== MÓDULO PRINCIPAL ====================
export default function FinanceiroModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <CircleDollarSign className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Módulo Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão Financeira Hospitalar</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="pagar"><Receipt className="h-4 w-4 mr-1" /> Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receber"><Banknote className="h-4 w-4 mr-1" /> Contas a Receber</TabsTrigger>
          <TabsTrigger value="bancos"><Landmark className="h-4 w-4 mr-1" /> Bancos</TabsTrigger>
          <TabsTrigger value="centros-custo"><Target className="h-4 w-4 mr-1" /> Centros de Custo</TabsTrigger>
          <TabsTrigger value="importador"><Upload className="h-4 w-4 mr-1" /> Importar Excel</TabsTrigger>
          <TabsTrigger value="cadastros"><Building2 className="h-4 w-4 mr-1" /> Cadastros</TabsTrigger>
          <TabsTrigger value="banco-inter"><Landmark className="h-4 w-4 mr-1" /> Banco Inter</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><FinDashboard /></TabsContent>
        <TabsContent value="pagar"><ContasPagar /></TabsContent>
        <TabsContent value="receber"><ContasReceber /></TabsContent>
        <TabsContent value="bancos"><BancosView /></TabsContent>
        <TabsContent value="centros-custo"><CentrosCusto /></TabsContent>
        <TabsContent value="importador"><ImportadorExcel /></TabsContent>
        <TabsContent value="cadastros"><Cadastros /></TabsContent>
        <TabsContent value="banco-inter"><BancoInterView /></TabsContent>
      </Tabs>
    </div>
  );
}
