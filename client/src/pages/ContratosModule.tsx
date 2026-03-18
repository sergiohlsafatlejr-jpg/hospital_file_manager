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
  FileText, Plus, Search, Pencil, Trash2, AlertTriangle, Clock, CheckCircle2,
  XCircle, RefreshCw, BarChart3, ArrowRight, TrendingUp
} from "lucide-react";

function formatCurrency(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-500", icon: FileText },
  ativo: { label: "Ativo", color: "bg-green-600", icon: CheckCircle2 },
  suspenso: { label: "Suspenso", color: "bg-amber-500", icon: Clock },
  encerrado: { label: "Encerrado", color: "bg-red-500", icon: XCircle },
  renovacao: { label: "Renovação", color: "bg-blue-500", icon: RefreshCw },
};

// ========== DASHBOARD ==========
function ContratosDashboard() {
  const dashboard = trpc.contratos.dashboard.useQuery();
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard de Contratos</h2>
      {dashboard.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Ativos</div>
                <div className="text-3xl font-bold text-green-500">{d.ativos}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Vencendo em 30 dias</div>
                <div className="text-3xl font-bold text-amber-500">{d.vencendoEm30}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Vencidos</div>
                <div className="text-3xl font-bold text-red-500">{d.vencidos}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Valor Mensal Total</div>
                <div className="text-2xl font-bold text-blue-500">{formatCurrency(d.valorTotalMensal)}</div>
              </CardContent>
            </Card>
          </div>

          {d.alertas && d.alertas.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Alertas</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {d.alertas.map((a: any, i: number) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${a.tipo === "vencido" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                      {a.tipo === "vencido" ? <XCircle className="h-5 w-5 text-red-500" /> : <Clock className="h-5 w-5 text-amber-500" />}
                      <div>
                        <span className="font-medium">{a.contrato.contratanteNome}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {a.tipo === "vencido" ? "Vencido" : "Vence"} em {formatDate(a.contrato.dataFim)}
                        </span>
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

// ========== LISTA DE CONTRATOS ==========
function ListaContratos() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [detailItem, setDetailItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const lista = trpc.contratos.listar.useQuery({
    busca: busca || undefined,
    status: status && status !== "todos" ? (status as any) : undefined,
    limit: 100,
  });

  const criar = trpc.contratos.criar.useMutation({
    onSuccess: () => { utils.contratos.invalidate(); toast.success("Contrato criado!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.contratos.atualizar.useMutation({
    onSuccess: () => { utils.contratos.invalidate(); toast.success("Contrato atualizado!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.contratos.excluir.useMutation({
    onSuccess: () => { utils.contratos.invalidate(); toast.success("Contrato excluído!"); },
  });
  const alterarStatus = trpc.contratos.alterarStatus.useMutation({
    onSuccess: () => { utils.contratos.invalidate(); toast.success("Status alterado!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      contratanteNome: fd.get("contratanteNome") as string,
      contratanteCnpj: (fd.get("contratanteCnpj") as string) || undefined,
      contratadaNome: (fd.get("contratadaNome") as string) || undefined,
      contratadaCnpj: (fd.get("contratadaCnpj") as string) || undefined,
      valorMensal: (fd.get("valorMensal") as string) || undefined,
      prazoContrato: Number(fd.get("prazoContrato")) || undefined,
      dataInicio: (fd.get("dataInicio") as string) || undefined,
      dataFim: (fd.get("dataFim") as string) || undefined,
      status: (fd.get("status") as any) || "rascunho",
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
        <h2 className="text-xl font-bold">Contratos</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo Contrato</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editItem ? "Editar Contrato" : "Novo Contrato"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contratante *</Label><Input name="contratanteNome" required defaultValue={editItem?.contratanteNome || ""} /></div>
                <div><Label>CNPJ Contratante</Label><Input name="contratanteCnpj" defaultValue={editItem?.contratanteCnpj || ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contratada</Label><Input name="contratadaNome" defaultValue={editItem?.contratadaNome || ""} /></div>
                <div><Label>CNPJ Contratada</Label><Input name="contratadaCnpj" defaultValue={editItem?.contratadaCnpj || ""} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Valor Mensal</Label><Input name="valorMensal" type="number" step="0.01" defaultValue={editItem?.valorMensal || ""} /></div>
                <div><Label>Prazo (meses)</Label><Input name="prazoContrato" type="number" defaultValue={editItem?.prazoContrato || ""} /></div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editItem?.status || "rascunho"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Data Início</Label><Input name="dataInicio" type="date" defaultValue={editItem?.dataInicio ? new Date(editItem.dataInicio).toISOString().slice(0, 10) : ""} /></div>
                <div><Label>Data Fim</Label><Input name="dataFim" type="date" defaultValue={editItem?.dataFim ? new Date(editItem.dataFim).toISOString().slice(0, 10) : ""} /></div>
              </div>
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
                <TableHead>Contratante</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Valor Mensal</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !lista.data?.items.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum contrato encontrado</TableCell></TableRow>
              ) : lista.data.items.map((c: any) => {
                const sc = statusConfig[c.status] || statusConfig.rascunho;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.contratanteNome}</TableCell>
                    <TableCell className="text-sm">{c.contratanteCnpj || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.valorMensal)}</TableCell>
                    <TableCell>{formatDate(c.dataInicio)}</TableCell>
                    <TableCell>{formatDate(c.dataFim)}</TableCell>
                    <TableCell><Badge className={sc.color}>{sc.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setEditItem(c); setDialogOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: c.id }); }}>
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
export default function ContratosModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Módulo de Contratos</h1>
          <p className="text-sm text-muted-foreground">Gestão de contratos hospitalares</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="contratos"><FileText className="h-4 w-4 mr-1" /> Contratos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><ContratosDashboard /></TabsContent>
        <TabsContent value="contratos"><ListaContratos /></TabsContent>
      </Tabs>
    </div>
  );
}
