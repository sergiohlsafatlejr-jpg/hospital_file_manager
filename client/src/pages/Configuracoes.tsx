import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { 
  Building2, 
  Code, 
  Settings2, 
  Plus, 
  Trash2, 
  Edit2,
  Save,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function Configuracoes() {
  // Convênios state
  const [novoConvenioNome, setNovoConvenioNome] = useState("");
  const [novoConvenioCodigo, setNovoConvenioCodigo] = useState("");
  const [novoConvenioPrazoRecurso, setNovoConvenioPrazoRecurso] = useState("30");
  const [editConvenioId, setEditConvenioId] = useState<number | null>(null);
  const [editConvenioNome, setEditConvenioNome] = useState("");
  const [editConvenioCodigo, setEditConvenioCodigo] = useState("");
  const [editConvenioPrazoRecurso, setEditConvenioPrazoRecurso] = useState("30");

  // Códigos state
  const [novoCodigoCodigo, setNovoCodigoCodigo] = useState("");
  const [novoCodigoDescricao, setNovoCodigoDescricao] = useState("");
  const [novoCodigoValor, setNovoCodigoValor] = useState("");
  const [novoCodigoCategoria, setNovoCodigoCategoria] = useState("");

  // Campos state
  const [novoCampoNome, setNovoCampoNome] = useState("");
  const [novoCampoOrigem, setNovoCampoOrigem] = useState("");
  const [novoCampoTolerancia, setNovoCampoTolerancia] = useState("");

  // Queries
  const { data: convenios, refetch: refetchConvenios } = trpc.convenios.list.useQuery({});
  const { data: codigos, refetch: refetchCodigos } = trpc.codigosProcedimentos.list.useQuery({});
  const { data: campos, refetch: refetchCampos } = trpc.camposComparacao.list.useQuery({});

  // Mutations
  const criarConvenioMutation = trpc.convenios.create.useMutation();
  const updateConvenioMutation = trpc.convenios.update.useMutation();
  const criarCodigoMutation = trpc.codigosProcedimentos.create.useMutation();
  const updateCodigoMutation = trpc.codigosProcedimentos.update.useMutation();
  const deleteCodigoMutation = trpc.codigosProcedimentos.delete.useMutation();
  const criarCampoMutation = trpc.camposComparacao.create.useMutation();
  const updateCampoMutation = trpc.camposComparacao.update.useMutation();

  // Handlers
  const handleCriarConvenio = async () => {
    if (!novoConvenioNome.trim()) {
      toast.error("Informe o nome do convênio");
      return;
    }
    try {
      await criarConvenioMutation.mutateAsync({
        nome: novoConvenioNome,
        codigo: novoConvenioCodigo || undefined,
        prazoRecursoGlosa: parseInt(novoConvenioPrazoRecurso) || 30,
      });
      toast.success("Convênio criado com sucesso");
      setNovoConvenioNome("");
      setNovoConvenioCodigo("");
      setNovoConvenioPrazoRecurso("30");
      refetchConvenios();
    } catch (error) {
      toast.error("Erro ao criar convênio");
    }
  };

  const handleUpdateConvenio = async () => {
    if (!editConvenioId) return;
    try {
      await updateConvenioMutation.mutateAsync({
        id: editConvenioId,
        nome: editConvenioNome,
        codigo: editConvenioCodigo || undefined,
        prazoRecursoGlosa: parseInt(editConvenioPrazoRecurso) || 30,
      });
      toast.success("Convênio atualizado");
      setEditConvenioId(null);
      refetchConvenios();
    } catch (error) {
      toast.error("Erro ao atualizar convênio");
    }
  };

  const handleToggleConvenioAtivo = async (id: number, ativo: boolean) => {
    try {
      await updateConvenioMutation.mutateAsync({
        id,
        ativo: ativo ? "sim" : "nao",
      });
      toast.success(ativo ? "Convênio ativado" : "Convênio desativado");
      refetchConvenios();
    } catch (error) {
      toast.error("Erro ao atualizar convênio");
    }
  };

  const handleCriarCodigo = async () => {
    if (!novoCodigoCodigo.trim() || !novoCodigoDescricao.trim()) {
      toast.error("Informe o código e a descrição");
      return;
    }
    try {
      await criarCodigoMutation.mutateAsync({
        codigo: novoCodigoCodigo,
        descricao: novoCodigoDescricao,
        valorReferencia: novoCodigoValor ? parseFloat(novoCodigoValor) : undefined,
        categoria: novoCodigoCategoria || undefined,
      });
      toast.success("Código criado com sucesso");
      setNovoCodigoCodigo("");
      setNovoCodigoDescricao("");
      setNovoCodigoValor("");
      setNovoCodigoCategoria("");
      refetchCodigos();
    } catch (error) {
      toast.error("Erro ao criar código");
    }
  };

  const handleDeleteCodigo = async (id: number) => {
    try {
      await deleteCodigoMutation.mutateAsync({ id });
      toast.success("Código desativado");
      refetchCodigos();
    } catch (error) {
      toast.error("Erro ao desativar código");
    }
  };

  const handleCriarCampo = async () => {
    if (!novoCampoNome.trim() || !novoCampoOrigem.trim()) {
      toast.error("Informe o nome e o campo de origem");
      return;
    }
    try {
      await criarCampoMutation.mutateAsync({
        nome: novoCampoNome,
        campoOrigem: novoCampoOrigem,
        tolerancia: novoCampoTolerancia ? parseFloat(novoCampoTolerancia) : undefined,
      });
      toast.success("Campo criado com sucesso");
      setNovoCampoNome("");
      setNovoCampoOrigem("");
      setNovoCampoTolerancia("");
      refetchCampos();
    } catch (error) {
      toast.error("Erro ao criar campo");
    }
  };

  const handleToggleCampoAtivo = async (id: number, ativo: boolean) => {
    try {
      await updateCampoMutation.mutateAsync({
        id,
        ativo: ativo ? "sim" : "nao",
      });
      toast.success(ativo ? "Campo ativado" : "Campo desativado");
      refetchCampos();
    } catch (error) {
      toast.error("Erro ao atualizar campo");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Configurações</h1>
          <p className="text-slate-500">
            Gerencie convênios, códigos de procedimentos e campos de comparação
          </p>
        </div>

        <Tabs defaultValue="convenios" className="space-y-6">
          <TabsList className="bg-slate-100 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="convenios" className="gap-2">
              <Building2 className="h-4 w-4" />
              Convênios
            </TabsTrigger>
            <TabsTrigger value="estabelecimentos" className="gap-2">
              <Building2 className="h-4 w-4" />
              Estabelecimentos
            </TabsTrigger>
            <TabsTrigger value="regras-conciliacao" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Regras de Conciliação
            </TabsTrigger>
            <TabsTrigger value="regras-negocio" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Regras de Negócio
            </TabsTrigger>
            <TabsTrigger value="tabelas-preco" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Tabelas de Preço
            </TabsTrigger>
            <TabsTrigger value="codigos" className="gap-2">
              <Code className="h-4 w-4" />
              Códigos
            </TabsTrigger>
            <TabsTrigger value="campos" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Campos
            </TabsTrigger>
          </TabsList>

          {/* Convênios Tab */}
          <TabsContent value="convenios" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Adicionar Convênio</CardTitle>
                <CardDescription>Cadastre um novo convênio no sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex-1 space-y-2">
                    <Label>Nome do Convênio</Label>
                    <Input
                      value={novoConvenioNome}
                      onChange={(e) => setNovoConvenioNome(e.target.value)}
                      placeholder="Ex: Unimed, Bradesco Saúde..."
                    />
                  </div>
                  <div className="w-full sm:w-[150px] space-y-2">
                    <Label>Código</Label>
                    <Input
                      value={novoConvenioCodigo}
                      onChange={(e) => setNovoConvenioCodigo(e.target.value)}
                      placeholder="Ex: 001"
                    />
                  </div>
                  <div className="w-full sm:w-[180px] space-y-2">
                    <Label>Prazo Recurso (dias)</Label>
                    <Input
                      type="number"
                      value={novoConvenioPrazoRecurso}
                      onChange={(e) => setNovoConvenioPrazoRecurso(e.target.value)}
                      placeholder="30"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCriarConvenio} disabled={criarConvenioMutation.isPending}>
                      {criarConvenioMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-2">Adicionar</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Convênios Cadastrados</CardTitle>
                <CardDescription>{convenios?.length || 0} convênio(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Prazo Recurso</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {convenios?.map((conv) => (
                        <TableRow key={conv.id}>
                          <TableCell className="font-medium">{conv.nome}</TableCell>
                          <TableCell>{conv.codigo || "-"}</TableCell>
                          <TableCell>{conv.prazoRecursoGlosa || 30} dias</TableCell>
                          <TableCell>
                            <Switch
                              checked={conv.ativo === "sim"}
                              onCheckedChange={(checked) => handleToggleConvenioAtivo(conv.id, checked)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditConvenioId(conv.id);
                                setEditConvenioNome(conv.nome);
                                setEditConvenioCodigo(conv.codigo || "");
                                setEditConvenioPrazoRecurso(String(conv.prazoRecursoGlosa || 30));
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Códigos Tab */}
          <TabsContent value="codigos" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Adicionar Código de Procedimento</CardTitle>
                <CardDescription>Cadastre códigos de referência para procedimentos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input
                      value={novoCodigoCodigo}
                      onChange={(e) => setNovoCodigoCodigo(e.target.value)}
                      placeholder="Ex: 10101012"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Descrição</Label>
                    <Input
                      value={novoCodigoDescricao}
                      onChange={(e) => setNovoCodigoDescricao(e.target.value)}
                      placeholder="Descrição do procedimento"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Ref.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={novoCodigoValor}
                      onChange={(e) => setNovoCodigoValor(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCriarCodigo} disabled={criarCodigoMutation.isPending} className="w-full">
                      {criarCodigoMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-2">Adicionar</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Códigos Cadastrados</CardTitle>
                <CardDescription>{codigos?.length || 0} código(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Valor Ref.</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codigos?.map((cod) => (
                        <TableRow key={cod.id} className={cod.ativo === "nao" ? "opacity-50" : ""}>
                          <TableCell className="font-mono">{cod.codigo}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{cod.descricao}</TableCell>
                          <TableCell>
                            {cod.valorReferencia 
                              ? `R$ ${parseFloat(cod.valorReferencia).toFixed(2)}`
                              : "-"
                            }
                          </TableCell>
                          <TableCell>
                            <Badge className={cod.ativo === "sim" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-slate-100 text-slate-700"
                            }>
                              {cod.ativo === "sim" ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCodigo(cod.id)}
                              disabled={cod.ativo === "nao"}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campos Tab */}
          <TabsContent value="campos" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Adicionar Campo de Comparação</CardTitle>
                <CardDescription>Configure quais campos serão comparados entre arquivos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Nome do Campo</Label>
                    <Input
                      value={novoCampoNome}
                      onChange={(e) => setNovoCampoNome(e.target.value)}
                      placeholder="Ex: Valor Total"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Campo de Origem</Label>
                    <Input
                      value={novoCampoOrigem}
                      onChange={(e) => setNovoCampoOrigem(e.target.value)}
                      placeholder="Ex: valorTotal"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tolerância (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={novoCampoTolerancia}
                      onChange={(e) => setNovoCampoTolerancia(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCriarCampo} disabled={criarCampoMutation.isPending} className="w-full">
                      {criarCampoMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-2">Adicionar</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Campos Configurados</CardTitle>
                <CardDescription>{campos?.length || 0} campo(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Nome</TableHead>
                        <TableHead>Campo Origem</TableHead>
                        <TableHead>Tolerância</TableHead>
                        <TableHead>Ativo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campos?.map((campo) => (
                        <TableRow key={campo.id}>
                          <TableCell className="font-medium">{campo.nome}</TableCell>
                          <TableCell className="font-mono text-sm">{campo.campoOrigem}</TableCell>
                          <TableCell>
                            {campo.tolerancia ? `${campo.tolerancia}%` : "-"}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={campo.ativo === "sim"}
                              onCheckedChange={(checked) => handleToggleCampoAtivo(campo.id, checked)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Estabelecimentos Tab */}
          <TabsContent value="estabelecimentos" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Estabelecimentos</CardTitle>
                <CardDescription>Gerencie os estabelecimentos do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Acesse a página de <a href="/estabelecimentos" className="text-primary underline">Estabelecimentos</a> para gerenciar.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Regras de Conciliação Tab */}
          <TabsContent value="regras-conciliacao" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Regras de Conciliação</CardTitle>
                <CardDescription>Configure as regras de conciliação de contas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Acesse a página de <a href="/regras-conciliacao" className="text-primary underline">Regras de Conciliação</a> para gerenciar.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Regras de Negócio Tab */}
          <TabsContent value="regras-negocio" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Regras de Negócio</CardTitle>
                <CardDescription>Configure as regras de negócio do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Acesse a página de <a href="/regras-negocio" className="text-primary underline">Regras de Negócio</a> para gerenciar.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tabelas de Preço Tab */}
          <TabsContent value="tabelas-preco" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Tabelas de Preço</CardTitle>
                <CardDescription>Gerencie as tabelas de preço do sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Acesse a página de <a href="/tabelas-preco" className="text-primary underline">Tabelas de Preço</a> para gerenciar.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Convênio Dialog */}
      <Dialog open={!!editConvenioId} onOpenChange={() => setEditConvenioId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Convênio</DialogTitle>
            <DialogDescription>Atualize as informações do convênio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={editConvenioNome}
                onChange={(e) => setEditConvenioNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input
                value={editConvenioCodigo}
                onChange={(e) => setEditConvenioCodigo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo de Recurso de Glosa (dias)</Label>
              <Input
                type="number"
                value={editConvenioPrazoRecurso}
                onChange={(e) => setEditConvenioPrazoRecurso(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prazo em dias para recurso de glosa após a data de pagamento
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConvenioId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateConvenio} disabled={updateConvenioMutation.isPending}>
              {updateConvenioMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
