import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Search, Briefcase, Calendar, Edit2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Colaboradores() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const utils = trpc.useContext();
  const [busca, setBusca] = useState("");
  const [colaboradorEdit, setColaboradorEdit] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: colaboradores = [], isLoading } = trpc.rh.listColaboradores.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id },
    { enabled: !!estabelecimentoAtual }
  );

  const updateMutation = trpc.rh.updateColaborador.useMutation({
    onSuccess: () => {
      toast.success("Colaborador atualizado com sucesso!");
      setIsDialogOpen(false);
      utils.rh.listColaboradores.invalidate();
      utils.rh.listFolha.invalidate(); // Invalidate Folha too
    },
    onError: (err) => {
      toast.error("Erro ao atualizar colaborador: " + err.message);
    }
  });

  const createMutation = trpc.rh.createColaborador.useMutation({
    onSuccess: () => {
      toast.success("Colaborador criado com sucesso!");
      setIsDialogOpen(false);
      utils.rh.listColaboradores.invalidate();
      utils.rh.listFolha.invalidate();
    },
    onError: (err) => {
      toast.error("Erro ao criar colaborador: " + err.message);
    }
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (colaboradorEdit && !colaboradorEdit.isNew) {
      updateMutation.mutate({
        originalCpf: colaboradorEdit.cpf,
        originalNome: colaboradorEdit.colaboradorNome,
        nome: formData.get("nome") as string,
        cpf: formData.get("cpf") as string,
        unidade: formData.get("unidade") as string,
        cargo: formData.get("cargo") as string,
        empresa: formData.get("empresa") as string,
        dataAdmissao: formData.get("dataAdmissao") as string || null,
        dataDemissao: formData.get("dataDemissao") as string || null,
        dataNascimento: formData.get("dataNascimento") as string || null,
      });
    } else {
      createMutation.mutate({
        estabelecimentoId: estabelecimentoAtual!.id,
        nome: formData.get("nome") as string,
        cpf: formData.get("cpf") as string,
        unidade: formData.get("unidade") as string,
        cargo: formData.get("cargo") as string,
        empresa: formData.get("empresa") as string,
        dataAdmissao: formData.get("dataAdmissao") as string || null,
        dataDemissao: formData.get("dataDemissao") as string || null,
        dataNascimento: formData.get("dataNascimento") as string || null,
      });
    }
  };

  const openEditModal = (colab: any) => {
    setColaboradorEdit(colab);
    setIsDialogOpen(true);
  };

  const openCreateModal = () => {
    setColaboradorEdit({ isNew: true, colaboradorNome: "", cpf: "", unidade: "", empresa: "", cargo: "", dataAdmissao: null, dataNascimento: null });
    setIsDialogOpen(true);
  };

  const formatData = (data: Date | string | null) => {
    if (!data) return "-";
    try {
      const d = typeof data === 'string' ? new Date(data) : data;
      return format(d, "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  const colaboradoresFiltrados = colaboradores.filter(c => {
    if (!busca) return true;
    const term = busca.toLowerCase();
    return (
      (c.colaboradorNome?.toLowerCase().includes(term)) ||
      (c.cpf?.includes(term)) ||
      (c.cargo?.toLowerCase().includes(term)) ||
      (c.unidade?.toLowerCase().includes(term))
    );
  });

  if (!estabelecimentoAtual) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Selecione um Estabelecimento</h2>
          <p className="text-muted-foreground">Você precisa selecionar um estabelecimento (ex: Safatle) no canto superior direito para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-8 overflow-y-auto min-h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quadro de Colaboradores</h1>
          <p className="text-muted-foreground mt-1">
            Gestão e listagem de todos os funcionários ativos da rede.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={openCreateModal}>Novo Colaborador</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 shrink-0">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Colaboradores Ativos</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{colaboradores.filter(c => !c.dataDemissao).length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {colaboradores.filter(c => c.dataDemissao).length} demitidos (Total: {colaboradores.length})
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admissões (Últimos 12m)</CardTitle>
            <Calendar className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {colaboradores.filter(c => {
                if (!c.dataAdmissao) return false;
                const d = new Date(c.dataAdmissao);
                const aYearAgo = new Date();
                aYearAgo.setFullYear(aYearAgo.getFullYear() - 1);
                return d >= aYearAgo;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Funcionários recentes</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cargos Diferentes</CardTitle>
            <Briefcase className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(colaboradores.map(c => c.cargo).filter(Boolean)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex flex-col border-border mt-2 mb-8">
        <div className="p-4 border-b bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">
          <h2 className="font-semibold">Lista de Funcionários</h2>
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por nome, CPF, cargo ou unidade..."
              className="pl-9 bg-background w-full"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Unidade / Empresa</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Carregando colaboradores...
                  </TableCell>
                </TableRow>
              ) : colaboradoresFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhum colaborador encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                colaboradoresFiltrados.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {row.colaboradorNome}
                        {row.dataDemissao && (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-destructive/10 text-destructive border-destructive/20">
                            Demitido
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">CPF: {row.cpf}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.unidade || "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.empresa || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                        {row.cargo || "-"}
                      </div>
                    </TableCell>
                    <TableCell>{formatData(row.dataAdmissao)}</TableCell>
                    <TableCell>{formatData(row.dataNascimento)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(row)} title="Editar Colaborador">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{colaboradorEdit?.isNew ? 'Novo Colaborador' : 'Editar Colaborador'}</DialogTitle>
          </DialogHeader>
          {colaboradorEdit && (
            <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nome">Nome do Colaborador</Label>
                <Input id="nome" name="nome" defaultValue={colaboradorEdit.colaboradorNome} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" name="cpf" defaultValue={colaboradorEdit.cpf} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dataNascimento">Data Nascimento</Label>
                  <Input id="dataNascimento" name="dataNascimento" type="date" defaultValue={colaboradorEdit.dataNascimento ? new Date(colaboradorEdit.dataNascimento).toISOString().split('T')[0] : ''} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unidade">Unidade / Lotação</Label>
                <Input id="unidade" name="unidade" defaultValue={colaboradorEdit.unidade} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="empresa">Empresa</Label>
                <Input id="empresa" name="empresa" defaultValue={colaboradorEdit.empresa} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input id="cargo" name="cargo" defaultValue={colaboradorEdit.cargo} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="dataAdmissao">Data Admissão</Label>
                  <Input id="dataAdmissao" name="dataAdmissao" type="date" defaultValue={colaboradorEdit.dataAdmissao ? new Date(colaboradorEdit.dataAdmissao).toISOString().split('T')[0] : ''} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dataDemissao">Data Demissão</Label>
                  <Input id="dataDemissao" name="dataDemissao" type="date" defaultValue={colaboradorEdit.dataDemissao ? new Date(colaboradorEdit.dataDemissao).toISOString().split('T')[0] : ''} />
                </div>
              </div>
              
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={updateMutation.isPending || createMutation.isPending}>
                  {(updateMutation.isPending || createMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {colaboradorEdit?.isNew ? 'Criar Colaborador' : 'Salvar Alterações'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
