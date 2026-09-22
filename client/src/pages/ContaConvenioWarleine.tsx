import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, ChevronLeft, ChevronRight, Database, Download, Eye, FileSearch, Filter, Loader2, Receipt, RefreshCw, TrendingDown, Upload, WalletCards } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const monthLabel = (value: string) => /^\d{4}\/\d{2}$/.test(value) ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : value;

export default function ContaConvenioWarleine() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const { user } = useAuth();
  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const [competencia, setCompetencia] = useState<string | undefined>();
  const [convenio, setConvenio] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [contaSelecionada, setContaSelecionada] = useState<any>(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageSize = 20;
  const input = useMemo(() => ({ estabelecimentoId, competencia, convenio, search: search.trim() || undefined, page, pageSize }), [estabelecimentoId, competencia, convenio, search, page]);
  const query = trpc.warleineFaturamento.listarContas.useQuery(input, { enabled: estabelecimentoId > 0, staleTime: 60_000, placeholderData: (previous) => previous });
  const lotesQuery = trpc.warleineFaturamento.lotes.useQuery({ estabelecimentoId }, { enabled: estabelecimentoId > 0, refetchInterval: (queryState) => {
    const lote = queryState.state.data?.[0];
    return lote && (lote.status !== "publicado" && (lote.status !== "erro" || Number(lote.tentativas || 0) < 3)) ? 5_000 : false;
  } });
  const approveReduction = trpc.warleineFaturamento.aprovarReducaoSnapshot.useMutation({
    onSuccess: async () => {
      toast.success("Redução aprovada e lote reenfileirado com auditoria.");
      await lotesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const itemsQuery = trpc.warleineFaturamento.listarItensConta.useQuery({
    estabelecimentoId,
    competencia: contaSelecionada?.competencia || "2000/01",
    numeroConta: contaSelecionada?.numeroConta || "-",
    convenioChave: contaSelecionada?.convenioChave || "-",
    page: itemsPage,
    pageSize: 100,
  }, { enabled: estabelecimentoId > 0 && Boolean(contaSelecionada) });
  const data = query.data;
  const loteAtual = lotesQuery.data?.[0];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  const itemsTotalPages = Math.max(1, Math.ceil((itemsQuery.data?.total || 0) / 100));

  useEffect(() => {
    if (loteAtual?.status === "publicado") void query.refetch();
  }, [loteAtual?.id, loteAtual?.status]);

  const clear = () => { setCompetencia(undefined); setConvenio(undefined); setSearch(""); setPage(1); };
  const handleUpload = async (file?: File) => {
    if (!file || !estabelecimentoId) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) return toast.error("Selecione um arquivo XLSX do Warleine.");
    const confirmed = window.confirm("Confirma que este arquivo representa o conteúdo completo das competências nele contidas? As versões Warleine anteriores dessas competências serão desativadas somente após a validação integral.");
    if (!confirmed) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    const form = new FormData();
    form.append("file", file);
    form.append("estabelecimentoId", String(estabelecimentoId));
    form.append("confirmarSubstituicao", "true");
    setIsUploading(true);
    try {
      const response = await fetch("/api/warleine/importar-faturamento", { method: "POST", body: form, headers: { "x-estabelecimento-id": String(estabelecimentoId) }, credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao importar o arquivo Warleine.");
      if (result.processandoEmBackground) toast.info(`${result.message} Lote ${result.loteId}.`);
      else toast.success(result.message);
      await Promise.all([query.refetch(), lotesQuery.refetch()]);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao importar o arquivo Warleine.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleApproveReduction = () => {
    if (!loteAtual || !estabelecimentoAtual) return;
    const motivo = window.prompt("Informe a justificativa administrativa para substituir o snapshot por um arquivo menor:")?.trim();
    if (!motivo || motivo.length < 10) return toast.error("Informe uma justificativa com pelo menos 10 caracteres.");
    const confirmed = window.confirm(`Confirmar exceção de redução do snapshot?\n\nEstabelecimento: ${estabelecimentoAtual.nome}\nLote: ${loteAtual.id}\nJustificativa: ${motivo}\n\nO lote será reenfileirado e poderá substituir as competências após nova validação integral.`);
    if (!confirmed) return;
    approveReduction.mutate({ estabelecimentoId, loteId: loteAtual.id, motivo });
  };
  const exportExcel = () => {
    if (!data?.contas.length) return toast.error("Não há contas para exportar.");
    const rows = data.contas.map((conta) => ({
      "Competência": conta.competencia,
      "Conta": conta.numeroConta,
      "Convênio": conta.convenio,
      "Paciente": conta.pacienteNome,
      "Carteirinha": conta.carteiraBeneficiario,
      "Itens": conta.totalItens,
      "Faturado": conta.valorFaturado,
      "Recebido": conta.valorRecebido,
      "Em aberto": conta.valorAberto,
      "Glosado": conta.valorGlosa,
      "Fonte": "Warleine",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Contas Warleine");
    XLSX.writeFile(wb, `contas-convenio-warleine-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exportado com o recorte atual.");
  };

  if (!estabelecimentoAtual) return <DashboardLayout><main className="flex min-h-[65vh] items-center justify-center bg-slate-50 p-6"><div className="rounded-2xl border bg-white p-8 text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" /><p className="font-semibold">Selecione um estabelecimento</p></div></main></DashboardLayout>;

  return <DashboardLayout><main className="min-h-screen bg-[#f4f7fb] px-4 py-5 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1700px] space-y-5">
    <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="h-1.5 bg-gradient-to-r from-slate-900 via-indigo-600 to-cyan-500" /><div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-4"><div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700"><Database className="h-6 w-6" /></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-slate-950">Conta Convênio — Sistema Warleine</h1><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-indigo-700">Fonte isolada</span></div><p className="mt-1 text-sm text-slate-500">{estabelecimentoAtual.nome} • contas e itens do lote Warleine ativo, sem misturar XMLs ou demonstrativos</p></div></div><div className="flex flex-wrap gap-2"><input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void handleUpload(event.target.files?.[0])} /><Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>{isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{isUploading ? "Importando..." : "Importar XLSX"}</Button><Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isRefetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isRefetching ? "animate-spin" : ""}`} />Atualizar</Button><Button size="sm" className="bg-slate-900 text-white" onClick={exportExcel} disabled={!data?.contas.length}><Download className="mr-2 h-4 w-4" />Exportar página atual</Button></div></div></header>

    <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Filtros</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-[180px_260px_1fr_auto]">
      <Select value={competencia || "todos"} onValueChange={(value) => { setCompetencia(value === "todos" ? undefined : value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Competência" /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as competências</SelectItem>{data?.filtros.competencias.map((item) => <SelectItem key={item} value={item}>{monthLabel(item)}</SelectItem>)}</SelectContent></Select>
      <Select value={convenio || "todos"} onValueChange={(value) => { setConvenio(value === "todos" ? undefined : value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Convênio" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os convênios</SelectItem>{data?.filtros.conveniosDetalhes.map((item) => <SelectItem key={item.chave} value={item.chave}>{item.nome}</SelectItem>)}</SelectContent></Select>
      <div className="relative"><FileSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Conta, paciente, convênio ou guia..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
      <Button variant="outline" onClick={clear} disabled={!competencia && !convenio && !search}>Limpar</Button>
    </div></CardContent></Card>

    {loteAtual && <div className={`rounded-2xl border px-4 py-3 text-sm ${loteAtual.status === "erro" ? "border-rose-200 bg-rose-50 text-rose-800" : loteAtual.status === "publicado" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>Lote {loteAtual.id} — {loteAtual.status}</strong><span>{Number(loteAtual.totalLinhas || 0).toLocaleString("pt-BR")} linhas • {Number(loteAtual.totalPublicadas || 0).toLocaleString("pt-BR")} publicadas</span></div>{loteAtual.status !== "publicado" && loteAtual.status !== "erro" && <p className="mt-1 text-xs">O arquivo está protegido no armazenamento e o processamento continuará mesmo se esta página for fechada.</p>}{loteAtual.status === "erro" && loteAtual.erroResumo && <p className="mt-1 text-xs">{loteAtual.erroResumo}</p>}{loteAtual.status === "erro" && loteAtual.erroResumo?.startsWith("SNAPSHOT_REDUZIDO:") && user?.role === "admin" && <Button size="sm" variant="destructive" className="mt-3" onClick={handleApproveReduction} disabled={approveReduction.isPending}>{approveReduction.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Aprovar redução excepcional</Button>}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Contas", Number(data?.resumo.totalContas || 0).toLocaleString("pt-BR"), Receipt, "text-slate-800"],
        ["Faturado", money(data?.resumo.valorFaturado || 0), WalletCards, "text-blue-700"],
        ["Recebido", money(data?.resumo.valorRecebido || 0), Receipt, "text-teal-700"],
        ["Em aberto", money(data?.resumo.valorAberto || 0), WalletCards, "text-amber-700"],
        ["Glosado", money(data?.resumo.valorGlosa || 0), TrendingDown, "text-rose-700"],
      ].map(([label, value, Icon, tone]) => <Card key={String(label)}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{String(label)}</p><p className={`mt-2 text-xl font-bold ${tone}`}>{String(value)}</p></div><Icon className={`h-6 w-6 ${tone}`} /></CardContent></Card>)}
    </section>

    {query.isLoading ? <div className="flex min-h-64 items-center justify-center rounded-2xl bg-white"><Loader2 className="mr-3 h-6 w-6 animate-spin" />Carregando contas Warleine...</div> : query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">{query.error.message}</div> : !data?.contas.length ? <Card><CardContent className="p-10 text-center text-slate-500">Nenhuma conta Warleine publicada para este recorte.</CardContent></Card> : <div className="space-y-3">{data.contas.map((conta) => <Card key={conta.virtualId} className="transition-shadow hover:shadow-md"><CardContent className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold">Conta {conta.numeroConta}</span><span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase text-indigo-700">Warleine</span><span className="text-xs text-slate-500">{monthLabel(conta.competencia)}</span></div><p className="mt-1 truncate text-sm text-slate-600">{conta.pacienteNome || "Paciente não informado"}</p></div><div><p className="text-sm font-medium text-slate-800">{conta.convenio}</p><p className="text-xs text-slate-500">{conta.totalItens.toLocaleString("pt-BR")} itens</p></div><div className="grid grid-cols-2 gap-x-4 text-xs"><span className="text-slate-500">Faturado</span><strong className="text-right">{money(conta.valorFaturado)}</strong><span className="text-slate-500">Glosado</span><strong className="text-right text-rose-700">{money(conta.valorGlosa)}</strong></div><Button size="sm" onClick={() => { setContaSelecionada(conta); setItemsPage(1); }}><Eye className="mr-2 h-4 w-4" />Ver itens</Button></CardContent></Card>)}</div>}

    {totalPages > 1 && <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Página {page} de {totalPages} • {data?.total.toLocaleString("pt-BR")} contas</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}

    <Dialog open={Boolean(contaSelecionada)} onOpenChange={(open) => { if (!open) { setContaSelecionada(null); setItemsPage(1); } }}><DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Itens da conta {contaSelecionada?.numeroConta}</DialogTitle><DialogDescription>{contaSelecionada?.convenio} • {contaSelecionada?.competencia} • fonte Warleine somente leitura</DialogDescription></DialogHeader>{itemsQuery.isLoading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead><tr className="border-b bg-slate-50 text-left text-slate-500"><th className="p-3">Código</th><th className="p-3">Serviço</th><th className="p-3">Tipo</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-right">Faturado</th><th className="p-3 text-right">Recebido</th><th className="p-3 text-right">Aberto</th><th className="p-3 text-right">Glosa</th><th className="p-3">Motivo</th></tr></thead><tbody>{itemsQuery.data?.items.map((item) => <tr key={item.id} className="border-b"><td className="p-3 font-mono">{item.codigoTuss || item.codigoItemInterno || "-"}</td><td className="p-3">{item.servicoNome || "-"}</td><td className="p-3">{item.tipoItem || "-"}</td><td className="p-3 text-right">{item.quantidade.toLocaleString("pt-BR")}</td><td className="p-3 text-right">{money(item.valorFaturado)}</td><td className="p-3 text-right text-teal-700">{money(item.valorRecebido)}</td><td className="p-3 text-right text-amber-700">{money(item.valorAberto)}</td><td className="p-3 text-right text-rose-700">{money(item.valorGlosa)}</td><td className="p-3">{item.codigoGlosa ? `${item.codigoGlosa} — ${item.motivoGlosa || "Motivo não informado"}` : "-"}</td></tr>)}</tbody></table></div>{itemsTotalPages > 1 && <div className="flex items-center justify-between border-t pt-3"><p className="text-xs text-slate-500">Página {itemsPage} de {itemsTotalPages} • {itemsQuery.data?.total.toLocaleString("pt-BR")} itens</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={itemsPage === 1} onClick={() => setItemsPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={itemsPage >= itemsTotalPages} onClick={() => setItemsPage((value) => Math.min(itemsTotalPages, value + 1))}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}</>}</DialogContent></Dialog>
  </div></main></DashboardLayout>;
}
