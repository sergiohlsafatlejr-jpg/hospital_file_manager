import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Pencil, Trash2, BarChart3, ArrowRight, Send,
  CheckCircle2, XCircle, Clock, MessageSquare, Target
} from "lucide-react";

function formatCurrency(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const statusConfig: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-500" },
  aguardando: { label: "Aguardando", color: "bg-amber-500" },
  aprovada: { label: "Aprovada", color: "bg-green-600" },
  recusada: { label: "Recusada", color: "bg-red-500" },
  negociando: { label: "Em Negociação", color: "bg-blue-500" },
};

const tipoClienteLabels: Record<string, string> = {
  hospital: "Hospital",
  clinica: "Clínica",
  laboratorio: "Laboratório",
  plano_saude: "Plano de Saúde",
  governo: "Governo",
};

// ========== DASHBOARD ==========
function PropostasDashboard() {
  const dashboard = trpc.propostas.dashboard.useQuery();
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard de Propostas</h2>
      {dashboard.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Aguardando</div>
                <div className="text-3xl font-bold text-amber-500">{d.aguardando}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Em Negociação</div>
                <div className="text-3xl font-bold text-blue-500">{d.negociando}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Aprovadas</div>
                <div className="text-3xl font-bold text-green-500">{d.aprovadas}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Taxa Conversão</div>
                <div className="text-3xl font-bold text-purple-500">{d.taxaConversao.toFixed(1)}%</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Valor Total Aprovadas</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-500">{formatCurrency(d.valorTotalAprovadas)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Valor no Pipeline</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-500">{formatCurrency(d.valorTotalPipeline)}</div>
                <p className="text-sm text-muted-foreground mt-1">Aguardando + Em Negociação</p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ========== LISTA DE PROPOSTAS ==========
function ListaPropostas() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const lista = trpc.propostas.listar.useQuery({
    busca: busca || undefined,
    status: status && status !== "todos" ? (status as any) : undefined,
    limit: 100,
  });

  const criar = trpc.propostas.criar.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta criada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.propostas.atualizar.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta atualizada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.propostas.excluir.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta excluída!"); },
  });
  const alterarStatus = trpc.propostas.alterarStatus.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Status alterado!"); },
  });
  const converter = trpc.propostas.converterEmContrato.useMutation({
    onSuccess: () => { utils.propostas.invalidate(); toast.success("Proposta convertida em contrato!"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      titulo: fd.get("titulo") as string,
      cliente: fd.get("cliente") as string,
      tipoCliente: (fd.get("tipoCliente") as any) || "hospital",
      responsavel: (fd.get("responsavel") as string) || undefined,
      condicoesPagamento: (fd.get("condicoesPagamento") as string) || undefined,
      validadeDias: Number(fd.get("validadeDias")) || 30,
      observacoes: (fd.get("observacoes") as string) || undefined,
    };
    if (editItem) {
      atualizar.mutate({ id: editItem.id, ...data });
    } else {
      criar.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-xl font-bold">Propostas</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Proposta</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editItem ? "Editar Proposta" : "Nova Proposta"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Título *</Label><Input name="titulo" required defaultValue={editItem?.titulo || ""} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cliente *</Label><Input name="cliente" required defaultValue={editItem?.cliente || ""} /></div>
                <div>
                  <Label>Tipo de Cliente</Label>
                  <Select name="tipoCliente" defaultValue={editItem?.tipoCliente || "hospital"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(tipoClienteLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Responsável</Label><Input name="responsavel" defaultValue={editItem?.responsavel || ""} /></div>
                <div><Label>Validade (dias)</Label><Input name="validadeDias" type="number" defaultValue={editItem?.validadeDias || 30} /></div>
              </div>
              <div><Label>Condições de Pagamento</Label><Input name="condicoesPagamento" defaultValue={editItem?.condicoesPagamento || ""} /></div>
              <div><Label>Observações</Label><Textarea name="observacoes" defaultValue={editItem?.observacoes || ""} /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !lista.data?.items.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma proposta encontrada</TableCell></TableRow>
              ) : lista.data.items.map((p: any) => {
                const sc = statusConfig[p.status] || statusConfig.rascunho;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.numero}</TableCell>
                    <TableCell className="font-medium">{p.titulo}</TableCell>
                    <TableCell>{p.cliente}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.valorTotal)}</TableCell>
                    <TableCell><Badge className={sc.color}>{sc.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {p.status === "rascunho" && (
                          <Button size="sm" variant="outline" onClick={() => alterarStatus.mutate({ id: p.id, status: "aguardando" })} title="Enviar">
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                        {p.status === "aguardando" && (
                          <>
                            <Button size="sm" variant="outline" className="text-green-500" onClick={() => converter.mutate({ propostaId: p.id })} title="Aprovar e converter">
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-blue-500" onClick={() => alterarStatus.mutate({ id: p.id, status: "negociando" })} title="Negociar">
                              <MessageSquare className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {p.status === "negociando" && (
                          <Button size="sm" variant="outline" className="text-green-500" onClick={() => converter.mutate({ propostaId: p.id })} title="Aprovar e converter">
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => { setEditItem(p); setDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: p.id }); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== MÓDULO PRINCIPAL ==========
export default function PropostasModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Target className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Módulo de Propostas</h1>
          <p className="text-sm text-muted-foreground">Gestão de propostas comerciais</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="propostas"><FileText className="h-4 w-4 mr-1" /> Propostas</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><PropostasDashboard /></TabsContent>
        <TabsContent value="propostas"><ListaPropostas /></TabsContent>
      </Tabs>
    </div>
  );
}
