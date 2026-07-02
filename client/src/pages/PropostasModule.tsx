import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Trash2, Clock, CheckCircle, XCircle, MessageSquare,
  TrendingUp, DollarSign, ArrowUpDown, Building2, User, Calendar, CreditCard,
  Layers, ClipboardList, Edit3, AlertTriangle, X, Eye, Download
} from "lucide-react";
import { gerarPDFProposta } from "@/lib/propostaPdfGenerator";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dateUtils";

type ProposalStatus = "rascunho" | "aguardando" | "aprovada" | "recusada" | "negociando";

const SERVICE_CATEGORIES = [
  "Internação", "UTI", "Cirurgia", "Diagnóstico por Imagem", "Patologia Clínica",
  "Fisioterapia", "Pronto-Socorro", "Ambulatório", "Oncologia", "Hemodinâmica",
  "Materiais e Medicamentos", "Diárias Hospitalares",
];

const CLIENT_TYPES = [
  { value: "hospital", label: "Hospital" },
  { value: "clinica", label: "Clínica" },
  { value: "laboratorio", label: "Laboratório" },
  { value: "plano_saude", label: "Plano de Saúde" },
  { value: "governo", label: "Governo" },
] as const;

const statusConfig: Record<ProposalStatus, { label: string; icon: any; color: string; bgColor: string }> = {
  rascunho: { label: "Rascunho", icon: FileText, color: "text-gray-500", bgColor: "bg-gray-100 dark:bg-gray-800" },
  aguardando: { label: "Aguardando", icon: Clock, color: "text-amber-500", bgColor: "bg-amber-50 dark:bg-amber-900/20" },
  negociando: { label: "Em Negociação", icon: MessageSquare, color: "text-blue-500", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  aprovada: { label: "Aprovada", icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-50 dark:bg-green-900/20" },
  recusada: { label: "Recusada", icon: XCircle, color: "text-red-500", bgColor: "bg-red-50 dark:bg-red-900/20" },
};

function formatCurrency(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function getClientTypeLabel(type: string) {
  return CLIENT_TYPES.find(ct => ct.value === type)?.label || type;
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const config = statusConfig[status] || statusConfig.rascunho;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", config.bgColor, config.color)}>
      <Icon className="h-3 w-3" /> {config.label}
    </span>
  );
}

function KpiCards({ data, activeFilter, onFilterChange }: {
  data: any; activeFilter: ProposalStatus | "all"; onFilterChange: (f: ProposalStatus | "all") => void;
}) {
  const statusGroups: { key: ProposalStatus | "all"; label: string; icon: any; color: string }[] = [
    { key: "all", label: "Todas", icon: FileText, color: "text-foreground" },
    { key: "rascunho", label: "Rascunho", icon: FileText, color: "text-gray-500" },
    { key: "aguardando", label: "Aguardando", icon: Clock, color: "text-amber-500" },
    { key: "negociando", label: "Negociação", icon: MessageSquare, color: "text-blue-500" },
    { key: "aprovada", label: "Aprovadas", icon: CheckCircle, color: "text-green-500" },
    { key: "recusada", label: "Recusadas", icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-muted-foreground">Total de Propostas</span><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-3.5 w-3.5 text-primary" /></div></div>
          <p className="text-2xl font-bold">{data?.total || 0}</p><p className="mt-1 text-xs text-muted-foreground">Em todos os status</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-muted-foreground">Pipeline</span><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10"><DollarSign className="h-3.5 w-3.5 text-blue-500" /></div></div>
          <p className="text-xl font-bold">{formatCurrency(data?.valorTotalPipeline)}</p><p className="mt-1 text-xs text-muted-foreground">Aguardando + Negociação</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-muted-foreground">Aprovadas</span><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10"><CheckCircle className="h-3.5 w-3.5 text-green-500" /></div></div>
          <p className="text-xl font-bold">{formatCurrency(data?.valorTotalAprovadas)}</p><p className="mt-1 text-xs text-muted-foreground">{data?.aprovadas || 0} contrato(s)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-muted-foreground">Conversão</span><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><TrendingUp className="h-3.5 w-3.5 text-primary" /></div></div>
          <p className="text-2xl font-bold">{(data?.taxaConversao || 0).toFixed(0)}%</p><p className="mt-1 text-xs text-muted-foreground">Taxa de aprovação</p>
        </CardContent></Card>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
        {statusGroups.map(({ key, label, icon: Icon, color }) => {
          const count = key === "all" ? (data?.total || 0) : (data?.[key === "aprovada" ? "aprovadas" : key === "recusada" ? "recusadas" : key] || 0);
          return (
            <button key={key} onClick={() => onFilterChange(key as ProposalStatus | "all")}
              className={cn("flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                activeFilter === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className={cn("h-3.5 w-3.5", activeFilter === key ? "text-primary-foreground" : color)} />{label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-semibold", activeFilter === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-xs">{label}</span></div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function ProposalDetail({ proposta, onClose, onDelete, onStatusChange }: {
  proposta: any; onClose: () => void; onDelete: (id: number) => void; onStatusChange: (id: number, status: ProposalStatus) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = trpc.propostas.buscarPorId.useQuery({ id: proposta.id });
  const itens = detail.data?.itens || [];
  const totalBruto = itens.reduce((acc: number, s: any) => acc + s.quantidade * Number(s.precoUnitario), 0);
  const totalLiquido = itens.reduce((acc: number, s: any) => acc + s.quantidade * Number(s.precoUnitario) * (1 - Number(s.desconto || 0) / 100), 0);
  const totalDesconto = totalBruto - totalLiquido;
  const daysLeft = proposta.dataExpiracao ? Math.ceil((new Date(proposta.dataExpiracao).getTime() - Date.now()) / 86400000) : null;
  const isExpired = daysLeft !== null && daysLeft < 0 && proposta.status !== "aprovada" && proposta.status !== "recusada";

  return (
    <div className="relative flex h-full flex-col max-h-[calc(100vh-8rem)] overflow-hidden">
      {isExpired && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 px-5 py-2.5 border-b border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-xs font-medium text-red-600 dark:text-red-400">Proposta <span className="font-bold">expirada</span> há {Math.abs(daysLeft!)} dias.</p>
        </div>
      )}
      <div className="flex items-start justify-between border-b border-border bg-primary px-5 py-4">
        <div>
          <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-primary-foreground/70" /><span className="text-xs font-medium text-primary-foreground/70">{proposta.numero}</span></div>
          <h2 className="text-base font-bold text-primary-foreground leading-tight">{proposta.titulo}</h2>
          <div className="mt-2"><StatusBadge status={proposta.status} /></div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"><X className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-4 border-b border-border">
        <InfoChip icon={Building2} label="Cliente" value={proposta.cliente} />
        <InfoChip icon={Layers} label="Tipo" value={getClientTypeLabel(proposta.tipoCliente)} />
        <InfoChip icon={User} label="Responsável" value={proposta.responsavel || "-"} />
        <InfoChip icon={CreditCard} label="Pagamento" value={proposta.condicoesPagamento || "-"} />
        <InfoChip icon={Calendar} label="Criada em" value={formatDateBR(proposta.createdAt)} />
        <InfoChip icon={Calendar} label="Validade" value={proposta.dataExpiracao ? formatDateBR(proposta.dataExpiracao) : `${proposta.validadeDias || 30} dias`} />
      </div>
      {proposta.observacoes && (
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-1.5 mb-1"><ClipboardList className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium text-muted-foreground">Observações</span></div>
          <p className="text-sm">{proposta.observacoes}</p>
        </div>
      )}
      {(detail.data?.escopoTecnico || detail.data?.servicosOferecidos || detail.data?.vantagensCompetitivas || detail.data?.condicoesNegocio) && (
        <div className="px-5 py-3 border-b border-border space-y-3">
          {detail.data?.escopoTecnico && (
            <div><div className="flex items-center gap-1.5 mb-1"><ClipboardList className="h-3.5 w-3.5 text-blue-500" /><span className="text-xs font-semibold text-blue-600">Escopo Técnico</span></div><p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.data.escopoTecnico}</p></div>
          )}
          {detail.data?.servicosOferecidos && (
            <div><div className="flex items-center gap-1.5 mb-1"><ClipboardList className="h-3.5 w-3.5 text-green-500" /><span className="text-xs font-semibold text-green-600">Serviços Oferecidos</span></div><p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.data.servicosOferecidos}</p></div>
          )}
          {detail.data?.vantagensCompetitivas && (
            <div><div className="flex items-center gap-1.5 mb-1"><TrendingUp className="h-3.5 w-3.5 text-purple-500" /><span className="text-xs font-semibold text-purple-600">Vantagens Competitivas</span></div><p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.data.vantagensCompetitivas}</p></div>
          )}
          {detail.data?.condicoesNegocio && (
            <div><div className="flex items-center gap-1.5 mb-1"><CreditCard className="h-3.5 w-3.5 text-orange-500" /><span className="text-xs font-semibold text-orange-600">Condições do Negócio</span></div><p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.data.condicoesNegocio}</p></div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 mb-3"><ClipboardList className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Serviços</h3><span className="ml-auto text-xs text-muted-foreground">{itens.length} itens</span></div>
          {detail.isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : itens.length > 0 ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left">
                <thead><tr className="bg-muted/50">
                  <th className="py-2.5 pl-3 pr-2 text-xs font-semibold text-muted-foreground">Código</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground text-right">Qtd</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground text-right">Unit.</th>
                  <th className="px-2 py-2.5 text-xs font-semibold text-muted-foreground text-center">Desc.</th>
                  <th className="py-2.5 pl-2 pr-3 text-xs font-semibold text-muted-foreground text-right">Total</th>
                </tr></thead>
                <tbody>{itens.map((item: any) => {
                  const total = item.quantidade * Number(item.precoUnitario) * (1 - Number(item.desconto || 0) / 100);
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 pl-3 pr-2"><span className="font-mono text-xs text-muted-foreground">{item.codigo || "-"}</span></td>
                      <td className="px-2 py-3"><p className="text-sm font-medium">{item.descricao}</p>{item.categoria && <p className="text-xs text-muted-foreground mt-0.5">{item.categoria}</p>}</td>
                      <td className="px-2 py-3 text-right text-sm">{item.quantidade}</td>
                      <td className="px-2 py-3 text-right text-sm">{formatCurrency(item.precoUnitario)}</td>
                      <td className="px-2 py-3 text-center">{Number(item.desconto) > 0 ? <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-full">-{item.desconto}%</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                      <td className="py-3 pl-2 pr-3 text-right text-sm font-semibold">{formatCurrency(total)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item de serviço</div>}
        </div>
        {itens.length > 0 && (
          <div className="mx-5 mb-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal bruto</span><span>{formatCurrency(totalBruto)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Descontos</span><span className="text-green-600 font-medium">- {formatCurrency(totalDesconto)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-base font-bold">Total líquido</span><span className="text-base font-bold text-primary">{formatCurrency(totalLiquido)}</span></div>
            </div>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl">
          <div className="mx-4 rounded-xl border border-border bg-card shadow-lg p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 mx-auto mb-3"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
            <h3 className="text-base font-bold mb-1">Excluir proposta?</h3>
            <p className="text-sm text-muted-foreground mb-5">A proposta <span className="font-semibold">{proposta.numero}</span> será removida permanentemente.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={() => { onDelete(proposta.id); onClose(); }} className="flex-1 rounded-lg bg-red-500 text-white py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">Excluir</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-2 border-t border-border px-5 py-4">
        <button onClick={() => setConfirmDelete(true)} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-500 px-3 py-2.5 text-sm font-medium hover:bg-red-500 hover:text-white transition-colors"><Trash2 className="h-4 w-4" /></button>
        <button
          onClick={async () => {
            try {
              const toast = (await import("sonner")).toast;
              toast.info("Gerando PDF...");
              const doc = await gerarPDFProposta({ ...proposta, ...detail.data, itens });
              doc.save(`${proposta.numero}_${proposta.cliente.replace(/\s+/g, "_")}.pdf`);
              toast.success("PDF gerado com sucesso!");
            } catch (err) {
              console.error(err);
              const toast = (await import("sonner")).toast;
              toast.error("Erro ao gerar PDF");
            }
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-600 px-3 py-2.5 text-sm font-medium hover:bg-blue-600 hover:text-white transition-colors"
          title="Baixar PDF da proposta"
        >
          <Download className="h-4 w-4" /> PDF
        </button>
        {(proposta.status === "aguardando" || proposta.status === "negociando") && (<>
          <button onClick={() => onStatusChange(proposta.id, "recusada")} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-200 dark:border-red-800 py-2.5 text-sm font-medium hover:bg-red-500 hover:text-white transition-colors"><XCircle className="h-4 w-4" /> Recusar</button>
          <button onClick={() => onStatusChange(proposta.id, "aprovada")} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"><CheckCircle className="h-4 w-4" /> Aprovar</button>
        </>)}
        {proposta.status === "rascunho" && (<>
          <button onClick={() => onStatusChange(proposta.id, "negociando")} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted transition-colors"><Edit3 className="h-4 w-4" /> Negociar</button>
          <button onClick={() => onStatusChange(proposta.id, "aguardando")} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"><CheckCircle className="h-4 w-4" /> Enviar</button>
        </>)}
      </div>
    </div>
  );
}

function NewProposalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const criar = trpc.propostas.criar.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta criada!"); onOpenChange(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipoCliente, setTipoCliente] = useState("hospital");
  const [responsavel, setResponsavel] = useState("");
  const [condicoesPagamento, setCondicoesPagamento] = useState("30 dias");
  const [validadeDias, setValidadeDias] = useState(30);
  const [observacoes, setObservacoes] = useState("");
  const [escopoTecnico, setEscopoTecnico] = useState("");
  const [servicosOferecidos, setServicosOferecidos] = useState("");
  const [vantagensCompetitivas, setVantagensCompetitivas] = useState("");
  const [condicoesNegocio, setCondicoesNegocio] = useState("");
  const [itens, setItens] = useState([{ codigo: "", descricao: "", categoria: SERVICE_CATEGORIES[0], unidade: "Unidade", quantidade: 1, precoUnitario: "0", desconto: "0" }]);

  function resetForm() {
    setTitulo(""); setCliente(""); setTipoCliente("hospital"); setResponsavel("");
    setCondicoesPagamento("30 dias"); setValidadeDias(30); setObservacoes("");
    setEscopoTecnico(""); setServicosOferecidos(""); setVantagensCompetitivas(""); setCondicoesNegocio("");
    setItens([{ codigo: "", descricao: "", categoria: SERVICE_CATEGORIES[0], unidade: "Unidade", quantidade: 1, precoUnitario: "0", desconto: "0" }]);
  }
  function updateItem(i: number, field: string, value: any) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }
  function handleSave() {
    if (!titulo.trim() || !cliente.trim()) return;
    const exp = new Date(); exp.setDate(exp.getDate() + validadeDias);
    criar.mutate({ titulo: titulo.trim(), cliente: cliente.trim(), tipoCliente: tipoCliente as any, responsavel: responsavel.trim() || undefined, condicoesPagamento, validadeDias, dataExpiracao: exp.toISOString().slice(0, 10), observacoes: observacoes.trim() || undefined, escopoTecnico: escopoTecnico.trim() || undefined, servicosOferecidos: servicosOferecidos.trim() || undefined, vantagensCompetitivas: vantagensCompetitivas.trim() || undefined, condicoesNegocio: condicoesNegocio.trim() || undefined, itens });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Proposta</DialogTitle><DialogDescription>Preencha os dados para criar uma nova proposta comercial.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5"><Label>Título da Proposta *</Label><Input placeholder="Ex: Contrato UTI Adulto – Pacote Anual" value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cliente *</Label><Input placeholder="Nome do cliente" value={cliente} onChange={e => setCliente(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tipo de Cliente</Label><Select value={tipoCliente} onValueChange={setTipoCliente}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CLIENT_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Responsável</Label><Input placeholder="Nome" value={responsavel} onChange={e => setResponsavel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Condições de Pagamento</Label><Input placeholder="30/60/90 dias" value={condicoesPagamento} onChange={e => setCondicoesPagamento(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Validade (dias)</Label><Input type="number" min={1} value={validadeDias} onChange={e => setValidadeDias(Number(e.target.value))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea placeholder="Notas adicionais…" value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} /></div>
          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Descrições da Proposta</h4>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Escopo Técnico</Label><Textarea placeholder="Descreva o escopo técnico do serviço…" value={escopoTecnico} onChange={e => setEscopoTecnico(e.target.value)} rows={3} /></div>
              <div className="space-y-1.5"><Label>Serviços Oferecidos</Label><Textarea placeholder="Detalhe os serviços que serão oferecidos…" value={servicosOferecidos} onChange={e => setServicosOferecidos(e.target.value)} rows={3} /></div>
              <div className="space-y-1.5"><Label>Vantagens Competitivas</Label><Textarea placeholder="Diferenciais e vantagens da empresa…" value={vantagensCompetitivas} onChange={e => setVantagensCompetitivas(e.target.value)} rows={3} /></div>
              <div className="space-y-1.5"><Label>Condições do Negócio</Label><Textarea placeholder="Termos, condições e cláusulas do negócio…" value={condicoesNegocio} onChange={e => setCondicoesNegocio(e.target.value)} rows={3} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label className="text-sm font-semibold">Serviços</Label><Button type="button" variant="outline" size="sm" onClick={() => setItens(prev => [...prev, { codigo: "", descricao: "", categoria: SERVICE_CATEGORIES[0], unidade: "Unidade", quantidade: 1, precoUnitario: "0", desconto: "0" }])}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button></div>
            <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
              {itens.map((svc, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr_80px_80px_60px_32px] gap-2 items-end text-sm">
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Código</span>}<Input className="h-8 text-xs" placeholder="TUSS" value={svc.codigo} onChange={e => updateItem(i, "codigo", e.target.value)} /></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Descrição</span>}<Input className="h-8 text-xs" placeholder="Descrição" value={svc.descricao} onChange={e => updateItem(i, "descricao", e.target.value)} /></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Categoria</span>}<Select value={svc.categoria} onValueChange={v => updateItem(i, "categoria", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{SERVICE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Qtd</span>}<Input className="h-8 text-xs" type="number" min={1} value={svc.quantidade} onChange={e => updateItem(i, "quantidade", Number(e.target.value))} /></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Preço</span>}<Input className="h-8 text-xs" type="number" min={0} step={0.01} value={svc.precoUnitario} onChange={e => updateItem(i, "precoUnitario", e.target.value)} /></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">Desc%</span>}<Input className="h-8 text-xs" type="number" min={0} max={100} value={svc.desconto} onChange={e => updateItem(i, "desconto", e.target.value)} /></div>
                  <div>{i === 0 && <span className="text-xs text-muted-foreground">&nbsp;</span>}<Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (itens.length > 1) setItens(prev => prev.filter((_, idx) => idx !== i)); }} disabled={itens.length <= 1}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={handleSave} disabled={!titulo.trim() || !cliente.trim() || criar.isPending}>{criar.isPending ? "Salvando..." : "Criar Proposta"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PropostasModule() {
  const [activeFilter, setActiveFilter] = useState<ProposalStatus | "all">("all");
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"date" | "value" | "client">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const utils = trpc.useUtils();
  const dashboard = trpc.propostas.dashboard.useQuery();
  const lista = trpc.propostas.listar.useQuery({ status: activeFilter !== "all" ? (activeFilter as any) : undefined, busca: search || undefined, limit: 200 });
  const excluir = trpc.propostas.excluir.useMutation({ onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta excluída!"); } });
  const alterarStatus = trpc.propostas.alterarStatus.useMutation({ onSuccess: () => { utils.propostas.invalidate(); toast.success("Status alterado!"); setSelectedProposal(null); } });

  const filtered = useMemo(() => {
    let items = lista.data?.items || [];
    if (search.trim()) { const q = search.toLowerCase(); items = items.filter((p: any) => p.titulo?.toLowerCase().includes(q) || p.cliente?.toLowerCase().includes(q) || p.numero?.toLowerCase().includes(q) || p.responsavel?.toLowerCase().includes(q)); }
    items = [...items].sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "value") cmp = Number(a.valorTotal) - Number(b.valorTotal);
      else if (sortField === "client") cmp = (a.cliente || "").localeCompare(b.cliente || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [lista.data?.items, search, sortField, sortDir]);

  const totalFiltered = filtered.reduce((acc: number, p: any) => acc + Number(p.valorTotal || 0), 0);
  function toggleSort(field: "date" | "value" | "client") {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><FileText className="h-7 w-7 text-primary" /><div><h1 className="text-2xl font-bold">Propostas Comerciais</h1><p className="text-sm text-muted-foreground">Gestão de Contratos Hospitalares</p></div></div>
        <Button onClick={() => setNewDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Proposta</Button>
      </div>
      <div className="flex gap-6">
        <div className={cn("flex min-w-0 flex-1 flex-col gap-4", selectedProposal ? "hidden lg:flex" : "flex")}>
          <KpiCards data={dashboard.data} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="text" placeholder="Buscar por número, cliente, título ou responsável…" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" /></div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 py-1">
              {(["date", "value", "client"] as const).map(field => (
                <button key={field} onClick={() => toggleSort(field)} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", sortField === field ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  <ArrowUpDown className="h-3 w-3" />{{ date: "Data", value: "Valor", client: "Cliente" }[field]}{sortField === field && <span className="text-xs opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="text-sm font-semibold">{filtered.length} proposta{filtered.length !== 1 ? "s" : ""}</span><span className="text-sm font-semibold">{formatCurrency(totalFiltered)}</span></div>
            <div className="overflow-x-auto">
              {lista.isLoading ? <div className="flex flex-col items-center justify-center py-16"><div className="text-muted-foreground">Carregando...</div></div> : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-3"><FileText className="h-7 w-7 text-muted-foreground" /></div><p className="text-sm font-medium">Nenhuma proposta encontrada</p><p className="mt-1 text-xs text-muted-foreground">Tente ajustar os filtros</p></div>
              ) : (
                <table className="w-full text-left">
                  <thead><tr className="border-b border-border bg-muted/30">
                    <th className="py-3 pl-4 pr-3 text-xs font-semibold text-muted-foreground">Proposta</th>
                    <th className="px-3 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                    <th className="hidden px-3 py-3 text-xs font-semibold text-muted-foreground md:table-cell">Responsável</th>
                    <th className="hidden px-3 py-3 text-xs font-semibold text-muted-foreground lg:table-cell">Validade</th>
                    <th className="px-3 py-3 text-xs font-semibold text-muted-foreground">Valor</th>
                    <th className="px-3 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="py-3 pl-3 pr-4" />
                  </tr></thead>
                  <tbody>{filtered.map((p: any) => (
                    <tr key={p.id} onClick={() => setSelectedProposal(p)} className={cn("border-b border-border cursor-pointer transition-colors hover:bg-muted/50", selectedProposal?.id === p.id && "bg-primary/5")}>
                      <td className="py-3 pl-4 pr-3"><p className="text-sm font-semibold">{p.titulo}</p><p className="text-xs text-muted-foreground mt-0.5">{p.numero}</p></td>
                      <td className="px-3 py-3 text-sm">{p.cliente}</td>
                      <td className="hidden px-3 py-3 text-sm text-muted-foreground md:table-cell">{p.responsavel || "-"}</td>
                      <td className="hidden px-3 py-3 text-sm text-muted-foreground lg:table-cell">{p.dataExpiracao ? formatDateBR(p.dataExpiracao) : `${p.validadeDias || 30}d`}</td>
                      <td className="px-3 py-3 text-sm font-semibold">{formatCurrency(p.valorTotal)}</td>
                      <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                      <td className="py-3 pl-3 pr-4"><Eye className="h-4 w-4 text-muted-foreground" /></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        {selectedProposal && (
          <div className="w-full shrink-0 lg:w-[460px]">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <ProposalDetail proposta={selectedProposal} onClose={() => setSelectedProposal(null)} onDelete={(id) => { excluir.mutate({ id }); setSelectedProposal(null); }} onStatusChange={(id, status) => alterarStatus.mutate({ id, status })} />
            </div>
          </div>
        )}
      </div>
      <NewProposalDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
    </div>
  );
}
