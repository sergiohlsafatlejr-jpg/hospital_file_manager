import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Database, Eye, Loader2, Search, AlertTriangle, Filter, Link2, RefreshCw, ArrowLeft } from "lucide-react";
import { formatWarleineItemCivilDate } from "@shared/warleineItemPresentation";
import type { HupConciliacaoGuia } from "../../../server/hupConciliacaoPilotoGuias";

const STATUS = [
  ["todos", "Todos"], ["candidato", "Candidato à revisão"], ["ambiguo", "Ambíguo"],
  ["sem_candidato", "Sem candidato"], ["medico_direto", "Médico direto"],
  ["dados_incompletos", "Dados incompletos"], ["misto", "Situação mista"],
] as const;
type Status = typeof STATUS[number][0];
type Applied = { estabelecimentoId: number; competencia: string; convenioId: number; status: Status; busca?: string; mesPagamento?: string };
type RecorteInicial = { competencia?: string; convenioId?: number };

export function formatPilotoMoney(value: string | null | undefined) {
  if (value == null) return "—";
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) return "—";
    const [integer, fraction] = d.abs().toFixed(2).split(".");
    return `${d.isNegative() ? "−" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
  } catch { return "—"; }
}
const competenciaLabel = (c: string) => /^\d{4}\/\d{2}$/.test(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : c;
function StatusBadge({ value }: { value: string }) {
  const label = STATUS.find(s => s[0] === value)?.[1] || value;
  const style = value === "candidato" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200"
    : value === "ambiguo" || value === "misto" ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200"
    : value === "medico_direto" ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200"
    : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`whitespace-nowrap ${style}`}>{label}</Badge>;
}

/** Mesma rota e linguagem visual; somente queries, sem vínculo ou conciliação persistida. */
export default function HupConciliacaoPiloto({ estabelecimentoId, nome, onVoltar, recorteInicial = {} }: {
  estabelecimentoId: number; nome: string; onVoltar: () => void; recorteInicial?: RecorteInicial;
}) {
  const [competencia, setCompetencia] = useState((recorteInicial.competencia || "").replace("-", "/"));
  const [convenio, setConvenio] = useState(recorteInicial.convenioId ? String(recorteInicial.convenioId) : "");
  const [status, setStatus] = useState<Status>("todos");
  const [busca, setBusca] = useState("");
  const [mesPagamento, setMesPagamento] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [page, setPage] = useState(1);
  const [guiaSelecionada, setGuiaSelecionada] = useState<HupConciliacaoGuia | null>(null);
  const [recorteInicialValidado, setRecorteInicialValidado] = useState(false);
  const { data: opcoes, isLoading: loadingOpcoes, error: errorOpcoes } = trpc.hupConciliacaoPiloto.opcoes.useQuery(
    { estabelecimentoId }, { enabled: estabelecimentoId === 1260036, retry: false, staleTime: 0 },
  );
  const recorteValido = !!opcoes?.competencias.includes(competencia)
    && !!opcoes?.convenios.some(c => String(c.id) === convenio);
  const queryInput = useMemo(() => ({ estabelecimentoId, competencia: applied?.competencia || "1900/01",
    convenioId: applied?.convenioId || 1, status: applied?.status || "todos", busca: applied?.busca,
    mesPagamento: applied?.mesPagamento, page, pageSize: 50 }), [estabelecimentoId, applied, page]);
  const { data, isFetching, error, refetch } = trpc.hupConciliacaoPiloto.guias.useQuery(queryInput,
    { enabled: applied !== null && estabelecimentoId === 1260036, retry: false, staleTime: 0 });
  useEffect(() => {
    if (isFetching || error) setGuiaSelecionada(null);
  }, [isFetching, error]);
  // Reutiliza o recorte da tela principal somente após validar opções da fonte Banco.
  useEffect(() => {
    if (!opcoes || recorteInicialValidado) return;
    setRecorteInicialValidado(true);
    if (recorteInicial.competencia && recorteInicial.convenioId && recorteValido) {
      setApplied({ estabelecimentoId, competencia, convenioId: Number(convenio), status: "todos" });
    }
  }, [opcoes, recorteInicialValidado, recorteInicial.competencia, recorteInicial.convenioId, recorteValido, estabelecimentoId, competencia, convenio]);
  const invalidate = () => { setApplied(null); setPage(1); setGuiaSelecionada(null); setRecorteInicialValidado(true); };
  const buscarBanco = () => {
    if (!recorteValido) return;
    setPage(1); setGuiaSelecionada(null);
    const next: Applied = { estabelecimentoId, competencia, convenioId: Number(convenio), status,
      busca: busca.trim() || undefined, mesPagamento: mesPagamento || undefined };
    if (JSON.stringify(next) === JSON.stringify(applied) && page === 1) void refetch();
    else setApplied(next);
  };
  const atualizar = () => { setGuiaSelecionada(null); buscarBanco(); };
  const result = applied && !error && !isFetching ? data : undefined;
  const resumo = result?.resumo;
  const pageCount = Math.max(1, Math.ceil((result?.total || 0) / 50));
  return <div className="p-4 sm:p-6 space-y-4 min-w-0">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <div><h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Link2 className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />Conciliação Cruzada</h1>
        <p className="text-muted-foreground text-sm sm:text-base">Cruzamento do faturamento com recebimentos</p></div>
      <div className="flex gap-2 flex-wrap items-center">
        <Button variant="outline" disabled title="Popular Dados pertence à base atual. Volte à base atual para executar essa ação."><Database className="w-4 h-4 mr-2" />Popular Dados</Button>
        <Button onClick={buscarBanco} disabled={!recorteValido || isFetching || loadingOpcoes || !!errorOpcoes}>
          {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}Buscar dados do banco</Button>
        <Button variant="outline" onClick={atualizar} disabled={!applied || isFetching}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
        <Button variant="outline" onClick={onVoltar}><ArrowLeft className="w-4 h-4 mr-2" />Ver base atual</Button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm" role="note">
      <Badge variant="outline"><Database className="w-3 h-3 mr-1" />Fonte Banco</Badge><span className="font-medium">{nome}</span>
      <span className="text-muted-foreground">Snapshot publicado · consulta sem gravação</span>
      <p className="basis-full text-xs text-muted-foreground">Não altera conciliações, não consulta a staging em carga e não soma os recebimentos do Hop. Associar, conciliar automaticamente e resetar não estão disponíveis nesta leitura.</p>
    </div>
    <Card><CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Filter className="w-5 h-5" />Filtros</CardTitle></CardHeader><CardContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="space-y-2"><Label>Competência</Label><Select value={competencia} onValueChange={v => { invalidate(); setCompetencia(v); }}><SelectTrigger aria-label="Competência"><SelectValue placeholder="Selecione o mês" /></SelectTrigger><SelectContent>{opcoes?.competencias.map(c => <SelectItem key={c} value={c}>{competenciaLabel(c)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Convênio</Label><Select value={convenio} onValueChange={v => { invalidate(); setConvenio(v); }}><SelectTrigger aria-label="Convênio"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{opcoes?.convenios.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Situação da comparação</Label><Select value={status} onValueChange={v => { invalidate(); setStatus(v as Status); }}><SelectTrigger aria-label="Situação da comparação"><SelectValue /></SelectTrigger><SelectContent>{STATUS.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="banco-pagamento">Mês do pagamento (opcional)</Label><Input id="banco-pagamento" type="month" value={mesPagamento} onChange={e => { invalidate(); setMesPagamento(e.target.value); }} /></div>
        <div className="space-y-2"><Label htmlFor="banco-busca">Buscar</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="banco-busca" className="pl-9" maxLength={100} value={busca} onChange={e => { invalidate(); setBusca(e.target.value); }} placeholder="Guia, conta ou TUSS" /></div></div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">A competência filtra o faturado. O mês do pagamento filtra os demonstrativos; sem mês, considera todos os retornos. Lote XML não se aplica à fonte Banco.</p>
      {loadingOpcoes && <p role="status" className="text-sm mt-3">Carregando competências e convênios do snapshot…</p>}
      {errorOpcoes && <p role="alert" className="text-sm text-destructive mt-3">Não foi possível consultar a fonte Banco: {errorOpcoes.message}</p>}
      {opcoes && (!opcoes.competencias.length || !opcoes.convenios.length) && <p className="text-sm text-amber-700 dark:text-amber-300 mt-3">Sem snapshot Hop publicado ou sem convênio com de-para confirmado. Não há fallback para XML ou outra base.</p>}
      {opcoes && competencia && convenio && !recorteValido && <p role="note" className="text-xs text-amber-700 dark:text-amber-300 mt-3">O recorte da base atual não está disponível no Banco. Selecione uma competência e um convênio com de-para confirmado.</p>}
    </CardContent></Card>
    {error && applied && <Card><CardContent className="pt-5 text-destructive" role="alert">A consulta não foi concluída: {error.message}</CardContent></Card>}
    {isFetching && applied && <div role="status" className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />Buscando guias e contas publicadas…</div>}
    {!applied && !loadingOpcoes && <Card><CardContent className="py-10 text-center text-muted-foreground"><Database className="w-8 h-8 mx-auto mb-3" /><p>Selecione competência e convênio e clique em <strong>Buscar dados do banco</strong>.</p><p className="text-xs mt-1">As guias aparecerão na tabela abaixo, sem importar dados nem gravar vínculos.</p></CardContent></Card>}
    {result && result.status !== "ok" && <Card><CardContent className="pt-5"><AlertTriangle className="w-5 h-5 mb-2 text-amber-600" /><p>{result.aviso}</p><p className="text-sm text-muted-foreground mt-2">A outra fonte não será usada automaticamente. Nenhum vínculo foi gravado.</p></CardContent></Card>}
    {result?.status === "ok" && resumo && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          {title:"Faturado via hospital",value:resumo.valorFaturadoHospital,color:"border-t-blue-500 text-blue-600"},
          {title:"Faturado médico direto",value:resumo.valorFaturadoMedicoDireto,color:"border-t-purple-500 text-purple-600"},
          {title:"Pago nos demonstrativos",value:resumo.valorPagoDemonstrativo,color:"border-t-green-500 text-green-600"},
          {title:"Glosa informada nos demonstrativos",value:resumo.valorGlosaDemonstrativo,color:"border-t-red-500 text-red-600"},
        ].map(({title,value,color}) => <Card key={title} className={`border-t-4 ${color.split(" ")[0]}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${color.split(" ").slice(1).join(" ")}`}>{formatPilotoMoney(value)}</p></CardContent></Card>)}
      </div>
      <p className="text-xs text-muted-foreground">Faturado da competência e convênio escolhidos. Pago e glosa são do recorte inteiro dos demonstrativos, não valores já vinculados a estas guias. Busca e situação filtram as guias, não esses totais. {resumo.totalItens.toLocaleString("pt-BR")} itens faturados · {resumo.totalGuias.toLocaleString("pt-BR")} guias/contas · {resumo.totalEventos.toLocaleString("pt-BR")} eventos de demonstrativo.</p>
      {(resumo.eventosSemValorPago > 0 || resumo.eventosSemValorGlosa > 0) && <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 p-3 text-sm">
        <strong>Valores não informados:</strong> {resumo.eventosSemValorPago} evento(s) sem pago e {resumo.eventosSemValorGlosa} sem glosa. Os totais desse campo são parciais; “—” significa não informado, não zero. Nenhuma diferença é calculada com valores desconhecidos.
      </div>}
      <Card><CardHeader className="pb-3"><div className="flex flex-wrap justify-between items-center gap-2"><CardTitle className="text-lg">Guias / Contas ({result.total.toLocaleString("pt-BR")})</CardTitle><Badge variant="outline">Banco · somente leitura</Badge></div>
        <p className="text-xs text-muted-foreground">Uma linha por conta e par de guias. Clique no olho para ver itens e candidatos. Pago e glosa abaixo são apenas candidatos exclusivos, não recebimentos confirmados.</p></CardHeader><CardContent>
        <div className="overflow-x-auto rounded-md border"><table className="w-full text-sm min-w-[1050px]" aria-label="Guias e contas da fonte Banco">
          <thead><tr className="border-b bg-muted/40 text-left"><th className="p-3 font-medium">Guia / Conta</th><th className="p-3 font-medium">Convênio</th><th className="p-3 font-medium">Comp.</th><th className="p-3 font-medium">Origem</th><th className="p-3 font-medium text-right">Itens</th><th className="p-3 font-medium text-right">Faturado</th><th className="p-3 font-medium text-right">Pago candidato</th><th className="p-3 font-medium text-right">Glosa candidata</th><th className="p-3 font-medium">Situação</th><th className="p-3 font-medium text-center">Ações</th></tr></thead>
          <tbody>{!result.items.length && <tr><td colSpan={10} className="p-10 text-center text-muted-foreground">Nenhuma guia encontrada para os filtros selecionados.</td></tr>}
            {result.items.map(guia => <tr key={guia.chave} className="border-b last:border-b-0 hover:bg-muted/30">
              <td className="p-3"><span className="font-medium">{guia.guiaOperadora || guia.guiaPrestador || "Não informada"}</span><span className="block text-xs text-muted-foreground">Conta {guia.conta || "—"}</span>{guia.guiaPrestador && guia.guiaPrestador !== guia.guiaOperadora && <span className="block text-xs text-muted-foreground">Prestador {guia.guiaPrestador}</span>}</td>
              <td className="p-3">{result.convenioNome}</td><td className="p-3 whitespace-nowrap">{competenciaLabel(result.competencia)}</td><td className="p-3"><Badge variant="outline">Banco</Badge></td>
              <td className="p-3 text-right tabular-nums">{guia.totalItens}<span className="block text-xs text-muted-foreground">{guia.totalGrupos} grupo(s)</span></td>
              <td className="p-3 text-right whitespace-nowrap font-semibold text-blue-600 tabular-nums">{formatPilotoMoney(guia.valorFaturado)}</td>
              <td className="p-3 text-right whitespace-nowrap text-green-700 dark:text-green-400 tabular-nums">{formatPilotoMoney(guia.valorPagoCandidato)}{guia.gruposHospitalares > 0 && <span className="block text-[11px] text-muted-foreground">{guia.gruposComPago}/{guia.gruposHospitalares} grupos hospitalares</span>}</td>
              <td className="p-3 text-right whitespace-nowrap text-red-600 tabular-nums">{formatPilotoMoney(guia.valorGlosaCandidata)}{guia.gruposHospitalares > 0 && <span className="block text-[11px] text-muted-foreground">{guia.gruposComGlosa}/{guia.gruposHospitalares} grupos hospitalares</span>}</td>
              <td className="p-3"><StatusBadge value={guia.status} /></td><td className="p-3 text-center"><Button size="icon" variant="ghost" aria-label={`Ver itens da guia ${guia.guiaOperadora || guia.guiaPrestador || "não informada"}, conta ${guia.conta || "não informada"}`} onClick={() => setGuiaSelecionada(guia)}><Eye className="w-4 h-4" /></Button></td>
            </tr>)}
          </tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4"><p className="text-sm text-muted-foreground">{result.total.toLocaleString("pt-BR")} guias/contas · página {page} de {pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => { setGuiaSelecionada(null); setPage(p => p-1); }}>Anterior</Button><Button variant="outline" disabled={page >= pageCount || isFetching} onClick={() => { setGuiaSelecionada(null); setPage(p => p+1); }}>Próxima</Button></div></div>
      </CardContent></Card><p className="text-xs text-muted-foreground">{result.aviso} Consulta realizada em {new Date(result.geradoEm).toLocaleString("pt-BR")}.</p>
    </>}
    <Dialog open={!!guiaSelecionada && !!result} onOpenChange={open => { if (!open) setGuiaSelecionada(null); }}><DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Itens da guia {guiaSelecionada?.guiaOperadora || guiaSelecionada?.guiaPrestador || "não informada"}</DialogTitle><DialogDescription>Conta {guiaSelecionada?.conta || "—"} · faturado do Banco × candidatos dos demonstrativos. Nenhum vínculo confirmado.</DialogDescription></DialogHeader>
      {guiaSelecionada && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"><div><span className="text-muted-foreground block">Faturado via hospital</span><strong>{formatPilotoMoney(guiaSelecionada.valorFaturadoHospital)}</strong></div><div><span className="text-muted-foreground block">Faturado médico direto</span><strong>{formatPilotoMoney(guiaSelecionada.valorFaturadoMedicoDireto)}</strong></div><div><span className="text-muted-foreground block">Itens / grupos</span><strong>{guiaSelecionada.totalItens} / {guiaSelecionada.totalGrupos}</strong></div></div>
        <div className="flex flex-wrap gap-2">{Object.entries(guiaSelecionada.statusContagens).filter(([,v]) => v > 0).map(([k,v]) => <Badge key={k} variant="secondary">{STATUS.find(s => s[0] === k)?.[1] || k}: {v}</Badge>)}</div>
        {guiaSelecionada.detalhesLimitados && <p role="note" className="rounded-md border border-amber-200 p-3 text-sm text-amber-800 dark:text-amber-200">Exibindo os primeiros 100 de {guiaSelecionada.totalGrupos} grupos desta guia. Os totais acima incluem todos os itens; o detalhamento exibido é limitado, sem rateio ou vínculo.</p>}
        <div className="overflow-x-auto border rounded-md"><table className="w-full text-sm min-w-[1000px]" aria-label="Itens e candidatos da guia"><thead><tr className="border-b bg-muted/40 text-left">{["TUSS", "Data do item", "Tipo / setor", "Modalidade", "Itens / qtd.", "Faturado", "Pago candidato", "Glosa candidata", "Situação"].map(c => <th key={c} className="p-3 font-medium">{c}</th>)}</tr></thead><tbody>
          {guiaSelecionada.itens.map(item => <tr key={item.chave} className="border-b last:border-b-0"><td className="p-3 font-medium">{item.codigoTuss || "—"}</td><td className="p-3 whitespace-nowrap">{formatWarleineItemCivilDate(item.dataItem)}</td><td className="p-3">{item.tipoItem || "—"}<span className="block text-xs text-muted-foreground">{item.setor || "—"}</span></td><td className="p-3">{item.modalidade === "N" ? "Médico direto" : item.modalidade === "S" ? "Hospital" : "Não informada"}</td><td className="p-3">{item.totalItens} / {item.quantidade}</td><td className="p-3 whitespace-nowrap text-blue-600">{formatPilotoMoney(item.valorFaturado)}</td><td className="p-3 whitespace-nowrap">{formatPilotoMoney(item.valorPagoCandidato)}</td><td className="p-3 whitespace-nowrap">{formatPilotoMoney(item.valorGlosaCandidata)}</td><td className="p-3"><StatusBadge value={item.status} /></td></tr>)}
        </tbody></table></div>
        <div className="space-y-2">{guiaSelecionada.itens.map(item => <details key={item.chave} className="rounded-md border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">TUSS {item.codigoTuss || "—"} · {item.numeroCandidatos} evento(s) candidato(s)</summary><p className="text-sm text-muted-foreground mt-2">{item.motivo}</p>
          {item.candidatos.map((c,i) => <div key={i} className="mt-2 text-xs rounded-md bg-muted/40 p-2">Guia {c.guia || "—"} · TUSS {c.codigoTuss || "—"} · Item {formatWarleineItemCivilDate(c.dataItem)} · Pagamento {formatWarleineItemCivilDate(c.dataPagamento)} · Pago {formatPilotoMoney(c.valorPago)} · Glosa informada {formatPilotoMoney(c.valorGlosa)}</div>)}
          {item.numeroCandidatos > 5 && <p className="text-xs mt-2 text-muted-foreground">Primeiros cinco de {item.numeroCandidatos} eventos, sem alocação de pagamento.</p>}
          {item.diferencaEstimada != null && <p className="text-xs mt-2">Diferença estimada (faturado − pago − glosa informada): {formatPilotoMoney(item.diferencaEstimada)}. Não é glosa automática nem vínculo confirmado.</p>}
        </details>)}</div>
        <p className="text-xs text-muted-foreground">Setores, modalidades e tipos diferentes permanecem separados nos itens. “—” significa desconhecido, não zero. Ausência de candidato não comprova falta de pagamento ou glosa.</p>
      </>}
    </DialogContent></Dialog>
  </div>;
}
