import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Database, Eye, Loader2, Search, ChevronDown, AlertTriangle } from "lucide-react";
import { formatWarleineItemCivilDate } from "@shared/warleineItemPresentation";

const STATUS = [
  ["todos", "Todos"], ["candidato", "Candidato à revisão"], ["ambiguo", "Ambíguo"],
  ["sem_candidato", "Sem candidato"], ["medico_direto", "Médico direto"], ["dados_incompletos", "Dados incompletos"],
] as const;
type Status = typeof STATUS[number][0];
type Applied = { estabelecimentoId: number; competencia: string; convenioId: number; status: Status; busca?: string; mesPagamento?: string };

export function formatPilotoMoney(value: string | null | undefined) {
  if (value == null) return "—";
  try {
    const d = new Decimal(value);
    if (!d.isFinite()) return "—";
    const [integer, fraction] = d.abs().toFixed(2).split(".");
    return `${d.isNegative() ? "−" : ""}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
  } catch { return "—"; }
}

/** Somente queries: os resultados não são vínculos nem conciliações persistidas. */
export default function HupConciliacaoPiloto({ estabelecimentoId, nome, onVoltar }: {
  estabelecimentoId: number; nome: string; onVoltar: () => void;
}) {
  const [competencia, setCompetencia] = useState("");
  const [convenio, setConvenio] = useState("");
  const [status, setStatus] = useState<Status>("todos");
  const [busca, setBusca] = useState("");
  const [mesPagamento, setMesPagamento] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: opcoes, isLoading: loadingOpcoes, error: errorOpcoes } = trpc.hupConciliacaoPiloto.opcoes.useQuery(
    { estabelecimentoId }, { enabled: estabelecimentoId === 1260036, retry: false, staleTime: 0 },
  );
  const queryInput = useMemo(() => ({ estabelecimentoId, competencia: applied?.competencia || "1900/01",
    convenioId: applied?.convenioId || 1, status: applied?.status || "todos", busca: applied?.busca,
    mesPagamento: applied?.mesPagamento, page, pageSize: 50 }), [estabelecimentoId, applied, page]);
  const { data, isFetching, error, refetch } = trpc.hupConciliacaoPiloto.comparar.useQuery(queryInput,
    { enabled: applied !== null && estabelecimentoId === 1260036, retry: false, staleTime: 0 });
  const invalidate = () => { setApplied(null); setPage(1); setExpanded(null); };
  const comparar = () => {
    if (!competencia || !convenio) return;
    setPage(1); setExpanded(null);
    const next: Applied = { estabelecimentoId, competencia, convenioId: Number(convenio), status,
      busca: busca.trim() || undefined, mesPagamento: mesPagamento || undefined };
    if (JSON.stringify(next) === JSON.stringify(applied) && page === 1) void refetch();
    else setApplied(next);
  };
  const result = applied && !error && !isFetching ? data : undefined;
  const resumo = result?.resumo;
  const pageCount = Math.max(1, Math.ceil((result?.total || 0) / 50));
  return <div className="p-4 sm:p-6 space-y-5 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl sm:text-2xl font-bold flex gap-2 items-center"><Database className="w-6 h-6 text-primary" />Conciliação Cruzada — piloto Banco</h1>
        <p className="text-sm text-muted-foreground mt-1">{nome} · faturado do snapshot Hop publicado × demonstrativos importados</p></div>
      <Button variant="outline" onClick={onVoltar}><ArrowLeft className="w-4 h-4 mr-2" />Voltar à conciliação atual</Button>
    </div>
    <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 p-4 text-sm" role="note">
      <strong className="flex items-center gap-2"><Eye className="w-4 h-4" />Somente leitura — nada será gravado</strong>
      <p className="mt-2">Esta comparação não altera conciliações existentes, não consulta a staging em carga e não soma os recebimentos do Hop. Candidatos e diferenças precisam de revisão; ausência de candidato não comprova glosa nem falta de pagamento.</p>
    </div>
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">Escolha o recorte para comparar</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="space-y-2"><Label>Competência do faturamento</Label><Select value={competencia} onValueChange={v => { invalidate(); setCompetencia(v); }}><SelectTrigger aria-label="Competência do faturamento"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{opcoes?.competencias.map(c => <SelectItem key={c} value={c}>{c.slice(5)}/{c.slice(0,4)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Convênio mapeado</Label><Select value={convenio} onValueChange={v => { invalidate(); setConvenio(v); }}><SelectTrigger aria-label="Convênio mapeado"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{opcoes?.convenios.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="piloto-pagamento">Mês do pagamento (opcional)</Label><Input id="piloto-pagamento" type="month" value={mesPagamento} onChange={e => { invalidate(); setMesPagamento(e.target.value); }} /></div>
        <div className="space-y-2"><Label>Situação da comparação</Label><Select value={status} onValueChange={v => { invalidate(); setStatus(v as Status); }}><SelectTrigger aria-label="Situação da comparação"><SelectValue /></SelectTrigger><SelectContent>{STATUS.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="piloto-busca">Conta, guia ou TUSS</Label><Input id="piloto-busca" maxLength={100} value={busca} onChange={e => { invalidate(); setBusca(e.target.value); }} placeholder="Filtrar grupos" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Button onClick={comparar} disabled={!competencia || !convenio || isFetching || loadingOpcoes || !!errorOpcoes}>
        {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}Comparar sem gravar</Button>
        <p className="text-xs text-muted-foreground">O mês de pagamento não precisa ser igual à competência do faturado. Sem mês selecionado, considera todos os retornos disponíveis.</p></div>
      {loadingOpcoes && <p role="status" className="text-sm">Carregando competências e convênios do snapshot…</p>}
      {errorOpcoes && <p role="alert" className="text-sm text-destructive">Não foi possível consultar o piloto: {errorOpcoes.message}</p>}
      {opcoes && (!opcoes.competencias.length || !opcoes.convenios.length) && <p className="text-sm text-amber-700 dark:text-amber-300">Sem snapshot Hop publicado ou sem convênio com de-para confirmado. Não há fallback para XML ou outra base.</p>}
    </CardContent></Card>
    {error && applied && <Card><CardContent className="pt-5 text-destructive" role="alert">A comparação não foi concluída: {error.message}</CardContent></Card>}
    {isFetching && applied && <div role="status" className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin" />Comparando somente dados publicados…</div>}
    {result && result.status !== "ok" && <Card><CardContent className="pt-5"><AlertTriangle className="w-5 h-5 mb-2 text-amber-600" /><p>{result.aviso}</p><p className="text-sm text-muted-foreground mt-2">A outra fonte não será usada automaticamente. Nenhum vínculo foi gravado.</p></CardContent></Card>}
    {result?.status === "ok" && resumo && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[["Faturado via hospital",resumo.valorFaturadoHospital],["Faturado médico direto",resumo.valorFaturadoMedicoDireto],["Pago nos demonstrativos",resumo.valorPagoDemonstrativo],["Glosa informada nos demonstrativos",resumo.valorGlosaDemonstrativo]].map(([title,value]) => <Card key={title}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatPilotoMoney(value)}</p></CardContent></Card>)}
      </div>
      <p className="text-xs text-muted-foreground">Faturado: competência e convênio escolhidos. Demonstrativos: convênio e mês de pagamento escolhido (ou todos os pagamentos), sem vínculo confirmado com essa competência. Não são somas de candidatos nem totais conciliados. Busca e situação filtram os grupos abaixo, não esses totais. {resumo.totalItens.toLocaleString("pt-BR")} itens faturados · {resumo.totalEventos.toLocaleString("pt-BR")} eventos de demonstrativo.</p>
      {(resumo.eventosSemValorPago > 0 || resumo.eventosSemValorGlosa > 0) && <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 p-3 text-sm">
        <strong>Valores não informados no demonstrativo:</strong> {resumo.eventosSemValorPago} evento(s) sem valor pago e {resumo.eventosSemValorGlosa} sem valor de glosa.
        <p>Os totais desse campo são parciais, somando apenas valores conhecidos; se todos estiverem ausentes, aparece “—”. Nulo não significa zero. Nenhuma diferença é calculada quando pago ou glosa do candidato não está informado.</p>
      </div>}
      <div className="flex flex-wrap gap-2">{[["Candidatos",resumo.gruposCandidatos],["Ambíguos",resumo.gruposAmbiguos],["Sem candidato",resumo.gruposSemCandidato],["Dados incompletos",resumo.gruposDadosIncompletos],["Médico direto",resumo.gruposMedicoDireto]].map(([label,value]) => <Badge key={label} variant="secondary">{label}: {Number(value).toLocaleString("pt-BR")}</Badge>)}</div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Grupos de itens e candidatos para revisão</CardTitle><p className="text-xs text-muted-foreground">Itens idênticos no mesmo recorte são apresentados em grupo, preservando sua quantidade e valor. Setores, modalidades e tipos diferentes não são misturados.</p></CardHeader><CardContent className="space-y-3">
        {result.items.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum grupo encontrado para os filtros selecionados.</p>}
        {result.items.map(item => <div key={item.chave} className="rounded-lg border overflow-hidden">
          <button type="button" aria-expanded={expanded === item.chave} onClick={() => setExpanded(expanded === item.chave ? null : item.chave)} className="w-full p-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold break-words">Conta {item.conta || "—"} · TUSS {item.codigoTuss || "—"}</p><p className="text-xs text-muted-foreground mt-1 break-words">Guia prestador: {item.guiaPrestador || "—"} · Guia operadora: {item.guiaOperadora || "—"}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{STATUS.find(s => s[0] === item.status)?.[1] || item.status}</Badge><ChevronDown className="w-4 h-4 shrink-0" /></div></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm"><div><span className="text-xs text-muted-foreground block">Data / tipo</span>{formatWarleineItemCivilDate(item.dataItem)} · {item.tipoItem || "—"}</div><div><span className="text-xs text-muted-foreground block">Setor / modalidade</span>{item.setor || "—"} · {item.modalidade === "N" ? "Médico direto" : item.modalidade === "S" ? "Hospital" : "Não informado"}</div><div><span className="text-xs text-muted-foreground block">Itens / quantidade</span>{item.totalItens} / {item.quantidade}</div><div><span className="text-xs text-muted-foreground block">Faturado do grupo</span><strong>{formatPilotoMoney(item.valorFaturado)}</strong></div></div>
          </button>
          {expanded === item.chave && <div className="border-t bg-muted/20 p-4 space-y-3"><p className="text-sm">{item.motivo}</p><p className="text-xs text-muted-foreground">{item.numeroCandidatos} evento(s) candidato(s). Exibição limitada aos primeiros cinco, sem alocação de pagamento.</p>
            {item.candidatos.map((c,index) => <div key={index} className="rounded-md border bg-card p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm"><div>Guia {c.guia || "—"}<span className="block text-xs text-muted-foreground">TUSS {c.codigoTuss || "—"} · Item {formatWarleineItemCivilDate(c.dataItem)}</span></div><div>Pagamento: {formatWarleineItemCivilDate(c.dataPagamento)}</div><div>Pago {formatPilotoMoney(c.valorPago)}<span className="block">Glosa informada {formatPilotoMoney(c.valorGlosa)}</span></div></div>)}
            {item.diferencaEstimada != null && <p className="text-sm font-medium">Diferença estimada (faturado − pago − glosa informada): {formatPilotoMoney(item.diferencaEstimada)}. Não é glosa automática nem vínculo confirmado.</p>}
          </div>}
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">{result.total.toLocaleString("pt-BR")} grupos · página {page} de {pageCount}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => { setExpanded(null); setPage(p => p-1); }}>Anterior</Button><Button variant="outline" disabled={page >= pageCount || isFetching} onClick={() => { setExpanded(null); setPage(p => p+1); }}>Próxima</Button></div></div>
      </CardContent></Card><p className="text-xs text-muted-foreground">{result.aviso} Consulta realizada em {new Date(result.geradoEm).toLocaleString("pt-BR")}.</p>
    </>}
  </div>;
}
