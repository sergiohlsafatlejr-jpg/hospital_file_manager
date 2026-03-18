import { useState, useMemo } from "react";
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
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Search, Check,
  Wallet, CreditCard, BarChart3, PiggyBank, Pencil, Trash2
} from "lucide-react";

function formatCurrency(value: string | number | null | undefined) {
  const num = Number(value || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-BR");
}

// ========== DASHBOARD ==========
function FinDashboard() {
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const dashboard = trpc.financeiro.dashboard.resumo.useQuery({ mes });
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Dashboard Financeiro</h2>
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-48" />
      </div>
      {dashboard.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="h-4 w-4" /> Despesas Pagas</div>
                <div className="text-2xl font-bold text-red-500">{formatCurrency(d.despesasPago)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><AlertTriangle className="h-4 w-4" /> Despesas Pendentes</div>
                <div className="text-2xl font-bold text-amber-500">{formatCurrency(d.despesasPendente)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /> Receitas Recebidas</div>
                <div className="text-2xl font-bold text-green-500">{formatCurrency(d.receitasRecebido)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /> Saldo</div>
                {(() => {
                  const saldo = Number(d.receitasRecebido) - Number(d.despesasPago);
                  return <div className={`text-2xl font-bold ${saldo >= 0 ? "text-green-500" : "text-red-500"}`}>{formatCurrency(saldo)}</div>;
                })()}
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Despesas Vencidas</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-500">{formatCurrency(d.despesasVencido)}</div>
                <p className="text-sm text-muted-foreground mt-1">Contas a pagar vencidas e não pagas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Receitas Pendentes</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-500">{formatCurrency(d.receitasPendente)}</div>
                <p className="text-sm text-muted-foreground mt-1">Contas a receber pendentes</p>
              </CardContent>
            </Card>
          </div>
          {d.evolucao && d.evolucao.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Fluxo de Caixa - Últimos 6 Meses</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.evolucao.map((f: any) => (
                      <TableRow key={f.mes}>
                        <TableCell className="font-medium">{f.mes}</TableCell>
                        <TableCell className="text-right text-green-500">{formatCurrency(f.receitas)}</TableCell>
                        <TableCell className="text-right text-red-500">{formatCurrency(f.despesas)}</TableCell>
                        <TableCell className={`text-right font-bold ${f.receitas - f.despesas >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {formatCurrency(f.receitas - f.despesas)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ========== CONTAS A PAGAR (transacoes) ==========
function ContasPagar() {
  const [busca, setBusca] = useState("");
  const [pago, setPago] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const contas = trpc.financeiro.transacoes.listar.useQuery({
    busca: busca || undefined,
    pago: pago && pago !== "todos" ? (pago as "sim" | "nao") : undefined,
    limit: 100,
  });

  const criar = trpc.financeiro.transacoes.criar.useMutation({
    onSuccess: () => { utils.financeiro.transacoes.invalidate(); toast.success("Conta criada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.financeiro.transacoes.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.transacoes.invalidate(); toast.success("Conta atualizada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.transacoes.excluir.useMutation({
    onSuccess: () => { utils.financeiro.transacoes.invalidate(); toast.success("Conta excluída!"); },
  });
  const marcarPago = trpc.financeiro.transacoes.marcarPago.useMutation({
    onSuccess: () => { utils.financeiro.transacoes.invalidate(); toast.success("Marcado como pago!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: any = {
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      pago: (fd.get("pago") as string) || "nao",
    };
    const dp = fd.get("dataPagamento") as string;
    if (dp) data.dataPagamento = dp;
    const obs = fd.get("observacoes") as string;
    if (obs) data.observacoes = obs;

    if (editItem) {
      atualizar.mutate({ id: editItem.id, ...data });
    } else {
      criar.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-xl font-bold">Contas a Pagar</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={pago} onValueChange={setPago}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nao">Pendente</SelectItem>
            <SelectItem value="sim">Pago</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editItem ? "Editar Conta" : "Nova Conta a Pagar"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Descrição *</Label><Input name="descricao" required defaultValue={editItem?.descricao || ""} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" required defaultValue={editItem?.valor || ""} /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" required defaultValue={editItem?.dataVencimento ? new Date(editItem.dataVencimento).toISOString().slice(0, 10) : ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Data Pagamento</Label><Input name="dataPagamento" type="date" defaultValue={editItem?.dataPagamento ? new Date(editItem.dataPagamento).toISOString().slice(0, 10) : ""} /></div>
                <div>
                  <Label>Status</Label>
                  <select name="pago" defaultValue={editItem?.pago || "nao"} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="nao">Pendente</option>
                    <option value="sim">Pago</option>
                  </select>
                </div>
              </div>
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
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !contas.data?.items?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma conta encontrada</TableCell></TableRow>
              ) : contas.data.items.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.descricao}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.valor)}</TableCell>
                  <TableCell>{formatDate(c.dataVencimento)}</TableCell>
                  <TableCell>
                    {c.pago === "sim" ? <Badge variant="default" className="bg-green-600">Pago</Badge> : <Badge variant="destructive">Pendente</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {c.pago !== "sim" && (
                        <Button size="sm" variant="outline" onClick={() => marcarPago.mutate({ id: c.id })}><Check className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { setEditItem(c); setDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: c.id }); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== CONTAS A RECEBER (recebiveis) ==========
function ContasReceber() {
  const [busca, setBusca] = useState("");
  const [recebido, setRecebido] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const contas = trpc.financeiro.recebiveis.listar.useQuery({
    busca: busca || undefined,
    recebido: recebido && recebido !== "todos" ? (recebido as "sim" | "nao") : undefined,
    limit: 100,
  });

  const criar = trpc.financeiro.recebiveis.criar.useMutation({
    onSuccess: () => { utils.financeiro.recebiveis.invalidate(); toast.success("Receita criada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.financeiro.recebiveis.atualizar.useMutation({
    onSuccess: () => { utils.financeiro.recebiveis.invalidate(); toast.success("Receita atualizada!"); setDialogOpen(false); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.financeiro.recebiveis.excluir.useMutation({
    onSuccess: () => { utils.financeiro.recebiveis.invalidate(); toast.success("Receita excluída!"); },
  });
  const marcarRecebido = trpc.financeiro.recebiveis.marcarRecebido.useMutation({
    onSuccess: () => { utils.financeiro.recebiveis.invalidate(); toast.success("Marcado como recebido!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: any = {
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      dataVencimento: fd.get("dataVencimento") as string,
      recebido: (fd.get("recebido") as string) || "nao",
    };
    const dr = fd.get("dataRecebimento") as string;
    if (dr) data.dataRecebimento = dr;
    const obs = fd.get("observacoes") as string;
    if (obs) data.observacoes = obs;

    if (editItem) {
      atualizar.mutate({ id: editItem.id, ...data });
    } else {
      criar.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-xl font-bold">Contas a Receber</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={recebido} onValueChange={setRecebido}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nao">Pendente</SelectItem>
            <SelectItem value="sim">Recebido</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditItem(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Receita</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editItem ? "Editar Receita" : "Nova Conta a Receber"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Descrição *</Label><Input name="descricao" required defaultValue={editItem?.descricao || ""} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" required defaultValue={editItem?.valor || ""} /></div>
                <div><Label>Vencimento *</Label><Input name="dataVencimento" type="date" required defaultValue={editItem?.dataVencimento ? new Date(editItem.dataVencimento).toISOString().slice(0, 10) : ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Data Recebimento</Label><Input name="dataRecebimento" type="date" defaultValue={editItem?.dataRecebimento ? new Date(editItem.dataRecebimento).toISOString().slice(0, 10) : ""} /></div>
                <div>
                  <Label>Status</Label>
                  <select name="recebido" defaultValue={editItem?.recebido || "nao"} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="nao">Pendente</option>
                    <option value="sim">Recebido</option>
                  </select>
                </div>
              </div>
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
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !contas.data?.items?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma receita encontrada</TableCell></TableRow>
              ) : contas.data.items.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.descricao}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.valor)}</TableCell>
                  <TableCell>{formatDate(c.dataVencimento)}</TableCell>
                  <TableCell>
                    {c.recebido === "sim" ? <Badge variant="default" className="bg-green-600">Recebido</Badge> : <Badge variant="destructive">Pendente</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {c.recebido !== "sim" && (
                        <Button size="sm" variant="outline" onClick={() => marcarRecebido.mutate({ id: c.id })}><Check className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { setEditItem(c); setDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: c.id }); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== EXTRATOS BANCÁRIOS ==========
function ExtratosBancarios() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  const extratos = trpc.financeiro.extratos.listar.useQuery({ limit: 100 });

  const criar = trpc.financeiro.extratos.criar.useMutation({
    onSuccess: () => { utils.financeiro.extratos.invalidate(); toast.success("Extrato criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const conciliar = trpc.financeiro.extratos.conciliar.useMutation({
    onSuccess: () => { utils.financeiro.extratos.invalidate(); toast.success("Conciliado!"); },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    criar.mutate({
      bancoId: Number(fd.get("bancoId")) || 1,
      data: fd.get("data") as string,
      descricao: fd.get("descricao") as string,
      valor: fd.get("valor") as string,
      tipo: fd.get("tipo") as "credito" | "debito",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Extratos Bancários</h2>
        <div className="flex-1" />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo Lançamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Data *</Label><Input name="data" type="date" required /></div>
              <div><Label>Descrição *</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Valor *</Label><Input name="valor" type="number" step="0.01" required /></div>
                <div>
                  <Label>Tipo *</Label>
                  <select name="tipo" defaultValue="debito" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="credito">Crédito</option>
                    <option value="debito">Débito</option>
                  </select>
                </div>
              </div>
              <input type="hidden" name="bancoId" value="1" />
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
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Conciliado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {extratos.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !extratos.data?.items?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum extrato encontrado</TableCell></TableRow>
              ) : extratos.data.items.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.data)}</TableCell>
                  <TableCell className="font-medium">{e.descricao}</TableCell>
                  <TableCell className={`text-right ${e.tipo === "credito" ? "text-green-500" : "text-red-500"}`}>
                    {e.tipo === "credito" ? "+" : "-"}{formatCurrency(e.valor)}
                  </TableCell>
                  <TableCell><Badge variant={e.tipo === "credito" ? "default" : "destructive"}>{e.tipo === "credito" ? "Crédito" : "Débito"}</Badge></TableCell>
                  <TableCell>{e.conciliado === "sim" ? <Badge className="bg-green-600">Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {e.conciliado !== "sim" && (
                      <Button size="sm" variant="outline" onClick={() => conciliar.mutate({ id: e.id })}><Check className="h-3 w-3 mr-1" /> Conciliar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== PREVISÃO DE RECEITA ==========
function PrevisaoReceita() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  const previsoes = trpc.financeiro.previsao.listar.useQuery({});

  const criar = trpc.financeiro.previsao.criar.useMutation({
    onSuccess: () => { utils.financeiro.previsao.invalidate(); toast.success("Previsão criada!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    criar.mutate({
      dataPrevisao: fd.get("dataPrevisao") as string,
      valorPrevisto: fd.get("valorPrevisto") as string,
      valorRealizado: (fd.get("valorRealizado") as string) || undefined,
      descricao: (fd.get("descricao") as string) || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold">Previsão de Receita</h2>
        <div className="flex-1" />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Previsão</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Previsão</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Data *</Label><Input name="dataPrevisao" type="date" required /></div>
              <div><Label>Descrição</Label><Input name="descricao" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Valor Previsto *</Label><Input name="valorPrevisto" type="number" step="0.01" required /></div>
                <div><Label>Valor Realizado</Label><Input name="valorRealizado" type="number" step="0.01" /></div>
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
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Realizado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previsoes.isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !previsoes.data?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma previsão encontrada</TableCell></TableRow>
              ) : previsoes.data.map((p: any) => {
                const diff = Number(p.valorRealizado || 0) - Number(p.valorPrevisto || 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.dataPrevisao)}</TableCell>
                    <TableCell className="font-medium">{p.descricao || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.valorPrevisto)}</TableCell>
                    <TableCell className="text-right">{p.valorRealizado ? formatCurrency(p.valorRealizado) : "-"}</TableCell>
                    <TableCell className={`text-right font-bold ${diff >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {p.valorRealizado ? formatCurrency(diff) : "-"}
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
export default function FinanceiroModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Wallet className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Módulo Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão financeira completa</p>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="pagar"><TrendingDown className="h-4 w-4 mr-1" /> Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receber"><TrendingUp className="h-4 w-4 mr-1" /> Contas a Receber</TabsTrigger>
          <TabsTrigger value="extratos"><CreditCard className="h-4 w-4 mr-1" /> Extratos</TabsTrigger>
          <TabsTrigger value="previsao"><PiggyBank className="h-4 w-4 mr-1" /> Previsão</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><FinDashboard /></TabsContent>
        <TabsContent value="pagar"><ContasPagar /></TabsContent>
        <TabsContent value="receber"><ContasReceber /></TabsContent>
        <TabsContent value="extratos"><ExtratosBancarios /></TabsContent>
        <TabsContent value="previsao"><PrevisaoReceita /></TabsContent>
      </Tabs>
    </div>
  );
}
