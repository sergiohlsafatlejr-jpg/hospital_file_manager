import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import { formatDateBR } from "@/lib/dateUtils";
import { Building2, Search, Plus, Pencil, Trash2, Calendar, FileText, AlertTriangle, Eye, UploadCloud, FileSpreadsheet, Send, Mail } from "lucide-react";

const STATUS_CONFIG = {
  ativo: { label: "Ativo", color: "bg-green-500" },
  vencendo: { label: "Vencendo", color: "bg-amber-500" },
  vencido: { label: "Vencido", color: "bg-red-500" },
  inativo: { label: "Inativo", color: "bg-gray-500" },
  renovado: { label: "Renovado", color: "bg-blue-500" },
};

export default function ContratosConvenios() {
  const [modalAberto, setModalAberto] = useState(false);
  const [contratoEditando, setContratoEditando] = useState<any>(null);
  const [busca, setBusca] = useState("");
  const [convenioSelecionado, setConvenioSelecionado] = useState<string>("");
  const [statusSelecionado, setStatusSelecionado] = useState<string>("ativo");
  
  const utils = trpc.useUtils();
  const convenios = trpc.convenios.list.useQuery({}); 
  const { estabelecimentoAtual, estabelecimentos } = useEstabelecimento();
  
  // Se "Todos os estabelecimentos" (id 0) estiver selecionado, pode-se usar undefined para o query ou forçar o padrão nas criações
  const estabelecimentoIdFiltro = estabelecimentoAtual?.id === 0 ? undefined : estabelecimentoAtual?.id;
  const estabelecimentoIdMutacao = estabelecimentoAtual?.id === 0 ? estabelecimentos?.[0]?.id : estabelecimentoAtual?.id;

  const contratos = trpc.contratosConvenios.listar.useQuery({ estabelecimentoId: estabelecimentoIdFiltro }, {
    enabled: !!estabelecimentoIdFiltro || estabelecimentoAtual?.id === 0,
  });
  
  const criar = trpc.contratosConvenios.criar.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato cadastrado!");
      setModalAberto(false);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      console.error(error);
    }
  });

  const atualizar = trpc.contratosConvenios.atualizar.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato atualizado!");
      setModalAberto(false);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
      console.error(error);
    }
  });

  const excluir = trpc.contratosConvenios.excluir.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato excluído!");
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoIdMutacao) {
      toast.error("Nenhum estabelecimento válido selecionado.");
      return;
    }
    const formData = new FormData(e.currentTarget);

    if (!convenioSelecionado) {
      toast.error("Selecione um Convênio/Operadora!");
      return;
    }

    const data = {
      estabelecimentoId: estabelecimentoIdMutacao,
      convenioId: Number(convenioSelecionado),
      numeroContrato: (formData.get("numeroContrato") as string) || undefined,
      dataInicio: (formData.get("dataInicio") as string) || undefined,
      dataFim: (formData.get("dataFim") as string) || undefined,
      observacoes: (formData.get("observacoes") as string) || undefined,
      emailContato: (formData.get("emailContato") as string) || undefined,
      reajusteProposto: formData.get("reajusteProposto") ? Number(formData.get("reajusteProposto")) : undefined,
      modeloEmailProposta: (formData.get("modeloEmailProposta") as string) || undefined,
      dataEnvioProposta: (formData.get("dataEnvioProposta") as string) || undefined,
      status: statusSelecionado as any,
    };

    if (contratoEditando) {
      atualizar.mutate({ id: contratoEditando.id, ...data });
    } else {
      criar.mutate(data);
    }
  };

  const getConvenioNome = (id: number) => {
    return convenios.data?.find((c: any) => c.id === id)?.nome || "Desconhecido";
  };

  // Exemplo Mock do Dashboard Superior (pode ser turbinado depois via API)
  const ativos = contratos.data?.filter(c => c.status === "ativo").length || 0;
  const expirando = contratos.data?.filter(c => c.status === "vencendo").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos de Convênios</h1>
          <p className="text-muted-foreground">Gerencie a vigência e as tabelas de preços negociadas com as Operadoras.</p>
        </div>
        <Button onClick={() => { 
          setContratoEditando(null); 
          setConvenioSelecionado("");
          setStatusSelecionado("ativo");
          setModalAberto(true); 
        }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Contrato
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cadastrados</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{contratos.data?.length || 0}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Contratos Ativos</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{ativos}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expiram em 45 dias</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{expirando}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Acordos Comerciais</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Buscar convênio ou contrato..." className="pl-9 h-9" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Tabelas Fechadas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratos.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6">Carregando...</TableCell></TableRow>
              ) : contratos.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum contrato localizado para este estabelecimento.</TableCell></TableRow>
              ) : (
                contratos.data?.map((c) => {
                  const conf = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inativo;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold">{getConvenioNome(c.convenioId)}</TableCell>
                      <TableCell>{c.numeroContrato || "-"}</TableCell>
                      <TableCell>{c.dataInicio ? formatDateBR(c.dataInicio) : "-"}</TableCell>
                      <TableCell>{c.dataFim ? formatDateBR(c.dataFim) : "-"}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-dashed">
                          <FileSpreadsheet className="h-3 w-3" /> 0 Tabelas
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${conf.color} border-none`}>{conf.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { 
                          setContratoEditando(c); 
                          setConvenioSelecionado(c.convenioId?.toString() || "");
                          setStatusSelecionado(c.status || "ativo");
                          setModalAberto(true); 
                        }}>
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          if (confirm("Você tem certeza que deseja excluir o contrato?")) excluir.mutate({ id: c.id });
                        }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{contratoEditando ? "Editar Contrato" : "Novo Contrato com Convênio"}</DialogTitle>
          </DialogHeader>
          <form id="form-contrato" onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operadora / Convênio</Label>
                <Select value={convenioSelecionado} onValueChange={setConvenioSelecionado} required>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {convenios.data?.map((conv: any) => (
                      <SelectItem key={conv.id} value={conv.id.toString()}>{conv.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nº do Contrato / Referência</Label>
                <Input name="numeroContrato" defaultValue={contratoEditando?.numeroContrato || ""} placeholder="Ex: CT-2026/001" />
              </div>
              
              <div className="space-y-2">
                <Label>Data de Início Vigência</Label>
                <Input type="date" name="dataInicio" defaultValue={contratoEditando?.dataInicio ? new Date(contratoEditando.dataInicio).toISOString().split('T')[0] : ""} />
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" name="dataFim" defaultValue={contratoEditando?.dataFim ? new Date(contratoEditando.dataFim).toISOString().split('T')[0] : ""} />
              </div>

              {contratoEditando && (
                <div className="space-y-2 col-span-2">
                  <Label>Situação do Contrato</Label>
                  <Select value={statusSelecionado} onValueChange={setStatusSelecionado}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="vencendo">Vencendo / Em Renovação</SelectItem>
                      <SelectItem value="renovado">Renovado</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="inativo">Inativo / Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2 col-span-2">
                <Label>Observações Internas (Não vai no email)</Label>
                <Textarea name="observacoes" defaultValue={contratoEditando?.observacoes || ""} rows={2} placeholder="Anotações internas..." />
              </div>
            </div>

            {/* SEÇÃO PROPOSTA COMERCIAL */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4" /> Automação de Reajuste Contratual
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email do Negociador no Convênio</Label>
                  <Input type="email" name="emailContato" defaultValue={contratoEditando?.emailContato || ""} placeholder="Ex: credenciamento@unimed.com.br" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reajuste Proposto (%)</Label>
                    <Input type="number" step="0.01" name="reajusteProposto" defaultValue={contratoEditando?.reajusteProposto || ""} placeholder="Ex: 8.5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Programada de Envio</Label>
                    <Input type="date" name="dataEnvioProposta" defaultValue={contratoEditando?.dataEnvioProposta ? new Date(contratoEditando.dataEnvioProposta).toISOString().split('T')[0] : ""} />
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Template do E-mail</Label>
                  <Textarea 
                    name="modeloEmailProposta" 
                    defaultValue={contratoEditando?.modeloEmailProposta || "Olá Equipe de Credenciamento,\n\nTendo em vista a defasagem dos custos frente ao INPC/IGPM do período, vimos por meio desta apresentar a proposta de reajuste contratual para as tabelas do ano vigente, no valor de {{REAJUSTE}}%, a partir de {{DATA_VENCIMENTO}}..."} 
                    rows={4} 
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{{REAJUSTE}}"}</code> <code className="bg-muted px-1 rounded">{"{{DATA_VENCIMENTO}}"}</code>
                  </p>
                </div>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button type="submit" form="form-contrato" disabled={criar.isPending || atualizar.isPending}>
              {criar.isPending || atualizar.isPending ? "Salvando..." : "Salvar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
