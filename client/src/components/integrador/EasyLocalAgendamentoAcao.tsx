import { useState } from "react";
import { CalendarClock, Loader2, Pause, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { EasyLocalAgendaPrevia, EasyLocalAgendaResumo } from "@shared/easyLocalAgendamento";

const ROTULOS: Record<EasyLocalAgendaResumo["estado"], string> = {
  ativo: "Automático ativo", pausado: "Pausado", preparando: "Em preparação", erro: "Revisão necessária", incerto: "Resultado a conferir",
};
function dataBrasilia(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
export function EasyLocalAgendamentoAcao({ estabelecimentoId, leituraId, nomeTabela, frequenciaDesejada }: {
  estabelecimentoId: number; leituraId: number; nomeTabela: string; frequenciaDesejada: "manual" | "15min" | "1hora" | "diario";
}) {
  const [aberto, setAberto] = useState(false);
  const [frequencia, setFrequencia] = useState<"15min" | "1hora" | "diario">(frequenciaDesejada === "manual" ? "1hora" : frequenciaDesejada);
  const [horario, setHorario] = useState("03:00");
  const [previa, setPrevia] = useState<EasyLocalAgendaPrevia | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const lista = trpc.easyLocalAgendamento.listar.useQuery({ estabelecimentoId }, { retry: false });
  const agenda = (lista.data ?? []).find((item: EasyLocalAgendaResumo) => item.leituraId === leituraId);
  const prever = trpc.easyLocalAgendamento.prever.useMutation({
    retry: false,
    onSuccess: resultado => { setPrevia(resultado); setErro(null); },
    onError: () => { setPrevia(null); setErro("Não foi possível preparar o horário. Confira chave, tipos, tamanho do lote e disponibilidade da origem antes de tentar novamente."); },
  });
  const ativar = trpc.easyLocalAgendamento.ativar.useMutation({
    retry: false,
    onSuccess: () => { setPrevia(null); setAberto(false); lista.refetch(); },
    onError: () => { setPrevia(null); setErro("Ativação não confirmada. Atualize a situação antes de repetir: não criaremos outra tarefa automaticamente."); lista.refetch(); },
  });
  const pausar = trpc.easyLocalAgendamento.pausar.useMutation({
    retry: false,
    onSuccess: () => lista.refetch(),
    onError: () => { setErro("Pausa não confirmada. Confira a situação; uma execução em andamento exige aguardar sua conclusão."); lista.refetch(); },
  });
  const ocupado = prever.isPending || ativar.isPending || pausar.isPending;
  const bloqueado = lista.isLoading || lista.isError || agenda?.podeGerenciar === false || agenda?.estado === "preparando" || agenda?.estado === "incerto" || agenda?.estado === "ativo";
  function abrir() {
    setErro(null); setPrevia(null); setConfirmado(false);
    if (agenda) { setFrequencia(agenda.frequencia); setHorario(agenda.horarioBrasilia ?? "03:00"); }
    setAberto(true);
  }
  function revisar() {
    setErro(null); setPrevia(null); setConfirmado(false);
    prever.mutate({ estabelecimentoId, leituraId, frequencia, ...(frequencia === "diario" ? { horarioBrasilia: horario } : {}) });
  }
  const expirada = Boolean(previa && Date.parse(previa.expiraEm) <= Date.now());
  return <div className="min-w-[215px] space-y-2">
    {lista.isLoading ? <p className="text-xs text-muted-foreground">Consultando horários…</p> : lista.isError ? <p className="text-xs text-destructive">Controle de horários indisponível. Confira a implantação da 0136.</p> : <>
      <Badge variant={agenda?.estado === "ativo" ? "secondary" : "outline"}>{agenda ? ROTULOS[agenda.estado] : "Sem horário ativo"}</Badge>
      {agenda && <div className="text-xs text-muted-foreground">
        <p>{agenda.frequencia === "diario" ? `Diariamente às ${agenda.horarioBrasilia}` : agenda.frequencia === "15min" ? "A cada 15 minutos" : "A cada hora"} · Brasília</p>
        <p>Última: {dataBrasilia(agenda.ultimaExecucao)}</p><p>Próxima: {agenda.estado === "ativo" ? dataBrasilia(agenda.proximaExecucao) : "—"}</p>
        {agenda.ultimoResultado?.registrosLidos !== undefined && <p>{agenda.ultimoResultado.registrosLidos} lidos · {agenda.ultimoResultado.registrosInseridos ?? 0} novos · {agenda.ultimoResultado.registrosAtualizados ?? 0} atualizados</p>}
        {!agenda.podeGerenciar && <p>Gerenciado pelo usuário que criou este horário.</p>}
      </div>}
    </>}
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" onClick={abrir} disabled={bloqueado || ocupado}><CalendarClock className="mr-1 h-3.5 w-3.5" />{agenda ? "Revisar horário" : "Configurar horário"}</Button>
      {agenda?.estado === "ativo" && agenda.podeGerenciar && <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => { setErro(null); pausar.mutate({ estabelecimentoId, agendamentoId: agenda.id }); }}><Pause className="mr-1 h-3.5 w-3.5" />Pausar</Button>}
      <Button type="button" size="icon" variant="ghost" onClick={() => lista.refetch()} aria-label="Atualizar situação do horário" disabled={ocupado}><RefreshCw className="h-3.5 w-3.5" /></Button>
    </div>
    {erro && !aberto && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    <Dialog open={aberto} onOpenChange={value => { if (ocupado) return; setAberto(value); setPrevia(null); setConfirmado(false); setErro(null); prever.reset(); ativar.reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Horário de busca no EASYLocal</DialogTitle><DialogDescription>Destino no Portal: {nomeTabela} · estabelecimento {estabelecimentoId} · leitura {leituraId}. A tarefa funcionará no servidor, mesmo com esta página fechada.</DialogDescription></DialogHeader>
        <Alert><AlertDescription>A rotina atualiza somente a tabela gerenciada do Portal, sem excluir registros ausentes nem gravar no EASYLocal. As páginas finais têm publicação e validação próprias. O horário só será ativo após sua confirmação.</AlertDescription></Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor={`agenda-freq-${leituraId}`}>Periodicidade</Label><Select value={frequencia} disabled={ocupado} onValueChange={value => { setFrequencia(value as typeof frequencia); setPrevia(null); setConfirmado(false); }}><SelectTrigger id={`agenda-freq-${leituraId}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15min">A cada 15 minutos</SelectItem><SelectItem value="1hora">A cada hora</SelectItem><SelectItem value="diario">Diariamente</SelectItem></SelectContent></Select></div>
          {frequencia === "diario" && <div className="space-y-2"><Label htmlFor={`agenda-hora-${leituraId}`}>Horário de Brasília</Label><Input id={`agenda-hora-${leituraId}`} type="time" value={horario} disabled={ocupado} onChange={event => { setHorario(event.target.value); setPrevia(null); setConfirmado(false); }} /></div>}
        </div>
        <p className="text-xs text-muted-foreground">Fuso: America/Sao_Paulo. Intervalos seguem o relógio: 00, 15, 30 e 45 minutos, ou início de cada hora.</p>
        {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
        {previa && <div className="space-y-2 rounded-lg border bg-muted/20 p-4 text-sm">
          <p className="font-medium">Revisão da próxima execução</p><p>{previa.registrosLidos} registros lidos · {previa.registrosInseridos} novos · {previa.registrosAtualizados} a atualizar · {previa.registrosInalterados} inalterados.</p>
          <p>Limite validado: {previa.limite.toLocaleString("pt-BR")} registros por lote completo. Se o limite ou prazo for ultrapassado, a carga não será publicada parcialmente.</p>
          <p>{previa.frequencia === "diario" ? `Todos os dias às ${previa.horarioBrasilia}` : previa.frequencia === "15min" ? "A cada 15 minutos" : "A cada hora"} · Brasília.</p>
          <p className="text-muted-foreground">A autorização vale para esta configuração e as próximas buscas. Mudanças de origem, credencial ou estrutura exigem nova revisão. O recorte de registros pode mudar a cada horário.</p>
          {expirada && <p className="text-destructive">Prévia expirada. Revise novamente antes de ativar.</p>}
          <label className="flex items-start gap-2"><input id={`agenda-confirmar-${leituraId}`} type="checkbox" checked={confirmado} disabled={ocupado || expirada} onChange={event => setConfirmado(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>Confirmo este destino, estabelecimento e horário para as próximas buscas.</span></label>
        </div>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={ocupado} onClick={() => { setAberto(false); setPrevia(null); setErro(null); }}>Cancelar</Button>
          <Button type="button" variant="outline" onClick={revisar} disabled={ocupado || (frequencia === "diario" && !horario)}>{prever.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Revisar horário</Button>
          <Button type="button" disabled={!previa || !confirmado || expirada || ocupado} onClick={() => { if (!previa || !confirmado || Date.parse(previa.expiraEm) <= Date.now()) { setPrevia(null); setConfirmado(false); return; } ativar.mutate({ estabelecimentoId, leituraId, tokenPrevia: previa.tokenPrevia, confirmarAgendamento: true }); }}>{ativar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e ativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
