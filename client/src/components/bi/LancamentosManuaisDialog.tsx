import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type FormState = {
  id?: number;
  competencia: string;
  convenio: string;
  codigoPrestador: string;
  valorFaturado: string;
  valorRecebido: string;
  valorGlosado: string;
  observacao: string;
};

const vazio = (): FormState => ({
  competencia: "",
  convenio: "",
  codigoPrestador: "",
  valorFaturado: "",
  valorRecebido: "",
  valorGlosado: "",
  observacao: "",
});

const numero = (value: string) => {
  const limpo = value.trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  return Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo) || 0;
};
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const competenciaInput = (value: string) => value.replace("/", "-");
const competenciaApi = (value: string) => value.replace("-", "/");

export function LancamentosManuaisDialog({
  estabelecimentoId,
  estabelecimentoNome,
  open,
  onOpenChange,
}: {
  estabelecimentoId: number;
  estabelecimentoNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<FormState>(vazio);
  const [confirmarExclusao, setConfirmarExclusao] = useState<number | null>(null);
  const { data: registros = [], isLoading } = trpc.faturamentoExterno.listar.useQuery(
    { estabelecimentoId },
    { enabled: open && estabelecimentoId > 0 }
  );
  const { data: convenios = [] } = trpc.convenios.list.useQuery(
    { ativo: "sim", estabelecimentoId },
    { enabled: open && estabelecimentoId > 0 }
  );

  useEffect(() => {
    if (!open) {
      setForm(vazio());
      setConfirmarExclusao(null);
    }
  }, [open]);

  const nomesConvenios = useMemo(
    () => [...new Set(convenios.map((item) => item.nome.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [convenios]
  );

  const atualizarConsultas = async () => {
    await Promise.all([
      utils.faturamentoExterno.listar.invalidate({ estabelecimentoId }),
      utils.faturadoRecebidoUnificado.dados.invalidate(),
    ]);
  };

  const salvar = trpc.faturamentoExterno.salvarManual.useMutation({
    onSuccess: async () => {
      toast.success(form.id ? "Lançamento atualizado." : "Lançamento manual cadastrado.");
      setForm(vazio());
      await atualizarConsultas();
    },
    onError: (error) => toast.error(error.message),
  });

  const excluir = trpc.faturamentoExterno.excluir.useMutation({
    onSuccess: async () => {
      toast.success("Lançamento excluído.");
      setConfirmarExclusao(null);
      await atualizarConsultas();
    },
    onError: (error) => toast.error(error.message),
  });

  const enviar = () => {
    if (!form.competencia || !form.convenio) {
      toast.error("Informe a competência e o convênio.");
      return;
    }
    if (numero(form.valorFaturado) <= 0) {
      toast.error("Informe um valor faturado maior que zero.");
      return;
    }
    salvar.mutate({
      id: form.id,
      estabelecimentoId,
      convenio: form.convenio,
      mesAno: competenciaApi(form.competencia),
      codigoPrestador: form.codigoPrestador || null,
      valorFaturado: numero(form.valorFaturado),
      valorRecebido: numero(form.valorRecebido),
      valorGlosado: numero(form.valorGlosado),
      observacao: form.observacao || null,
    });
  };

  const editar = (item: (typeof registros)[number]) => setForm({
    id: item.id,
    competencia: competenciaInput(item.mesAno),
    convenio: item.convenio,
    codigoPrestador: item.codigoPrestador || "",
    valorFaturado: String(item.valorFaturado || ""),
    valorRecebido: String(item.valorRecebido || ""),
    valorGlosado: String(item.valorGlosado || ""),
    observacao: item.observacao || "",
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Cadastro manual de faturado e recebido</DialogTitle>
        <DialogDescription>
          Unidade: {estabelecimentoNome}. Cadastros manuais complementam os dados automáticos; importações por planilha só entram quando não houver fonte automática equivalente.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900">{form.id ? "Editar lançamento" : "Novo lançamento"}</h3><p className="text-xs text-slate-500">Valores consolidados do mês</p></div>
            {form.id && <Button variant="ghost" size="sm" onClick={() => setForm(vazio())}>Novo</Button>}
          </div>
          <div className="space-y-2"><Label htmlFor="manual-competencia">Competência</Label><Input id="manual-competencia" type="month" value={form.competencia} onChange={(event) => setForm((atual) => ({ ...atual, competencia: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Convênio</Label><Select value={form.convenio || undefined} onValueChange={(value) => setForm((atual) => ({ ...atual, convenio: value }))}><SelectTrigger><SelectValue placeholder="Selecione o convênio" /></SelectTrigger><SelectContent>{nomesConvenios.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="manual-prestador">Código do prestador</Label><Input id="manual-prestador" value={form.codigoPrestador} onChange={(event) => setForm((atual) => ({ ...atual, codigoPrestador: event.target.value }))} placeholder="Opcional" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2"><Label htmlFor="manual-faturado">Faturado</Label><Input id="manual-faturado" inputMode="decimal" value={form.valorFaturado} onChange={(event) => setForm((atual) => ({ ...atual, valorFaturado: event.target.value }))} placeholder="0,00" /></div>
            <div className="space-y-2"><Label htmlFor="manual-recebido">Recebido</Label><Input id="manual-recebido" inputMode="decimal" value={form.valorRecebido} onChange={(event) => setForm((atual) => ({ ...atual, valorRecebido: event.target.value }))} placeholder="0,00" /></div>
            <div className="space-y-2"><Label htmlFor="manual-glosado">Glosado</Label><Input id="manual-glosado" inputMode="decimal" value={form.valorGlosado} onChange={(event) => setForm((atual) => ({ ...atual, valorGlosado: event.target.value }))} placeholder="0,00" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="manual-observacao">Observação</Label><Textarea id="manual-observacao" value={form.observacao} onChange={(event) => setForm((atual) => ({ ...atual, observacao: event.target.value }))} placeholder="Fonte, conferência ou justificativa" rows={3} /></div>
          <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={enviar} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : form.id ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {form.id ? "Salvar alterações" : "Cadastrar valores"}
          </Button>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3"><h3 className="font-semibold text-slate-900">Histórico da unidade</h3><p className="text-xs text-slate-500">Registros manuais e importados por planilha</p></div>
          <div className="max-h-[560px] overflow-auto">
            {isLoading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div> : !registros.length ? <div className="flex h-48 flex-col items-center justify-center text-sm text-slate-500"><FileSpreadsheet className="mb-2 h-8 w-8 opacity-40" />Nenhum lançamento cadastrado.</div> : <Table>
              <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Convênio</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Faturado</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Glosado</TableHead><TableHead>Atualização</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>{registros.map((item) => <TableRow key={item.id}><TableCell>{item.mesAno.replace(/^([0-9]{4})\/([0-9]{2})$/, "$2/$1")}</TableCell><TableCell><div className="font-medium text-slate-900">{item.convenio}</div>{item.codigoPrestador && <div className="text-xs text-slate-500">Prestador {item.codigoPrestador}</div>}</TableCell><TableCell><Badge variant="outline">{item.origem === "manual" ? "Manual · complemento" : "Planilha · fallback"}</Badge></TableCell><TableCell className="text-right">{money(item.valorFaturado)}</TableCell><TableCell className="text-right">{money(item.valorRecebido)}</TableCell><TableCell className="text-right text-rose-700">{money(item.valorGlosado)}</TableCell><TableCell className="text-xs text-slate-500">{item.atualizadoPorNome || item.importadoPorNome || "Sistema"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => editar(item)} aria-label={`Editar ${item.convenio}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-rose-600" onClick={() => setConfirmarExclusao(item.id)} aria-label={`Excluir ${item.convenio}`}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody>
            </Table>}
          </div>
        </section>
      </div>

      <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
        <p className="text-xs text-slate-500">Manual soma como complemento. Planilha externa só substitui uma fonte automática ausente.</p>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
      </DialogFooter>
    </DialogContent>

    <Dialog open={confirmarExclusao !== null} onOpenChange={(value) => !value && setConfirmarExclusao(null)}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Excluir lançamento?</DialogTitle><DialogDescription>O registro será removido do histórico e deixará de compor o relatório quando estiver sendo utilizado.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmarExclusao(null)}>Cancelar</Button><Button variant="destructive" disabled={excluir.isPending} onClick={() => confirmarExclusao && excluir.mutate({ id: confirmarExclusao, estabelecimentoId })}>{excluir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Excluir</Button></DialogFooter></DialogContent>
    </Dialog>
  </Dialog>;
}
