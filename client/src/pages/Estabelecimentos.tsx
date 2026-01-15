import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

export default function Estabelecimentos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ nome: "", cnpj: "", endereco: "" });
  const [busca, setBusca] = useState("");

  const { data: estabelecimentos, isLoading, refetch } = trpc.estabelecimentos.list.useQuery();
  
  const createMutation = trpc.estabelecimentos.create.useMutation({
    onSuccess: () => {
      toast.success("Estabelecimento criado com sucesso!");
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.estabelecimentos.update.useMutation({
    onSuccess: () => {
      toast.success("Estabelecimento atualizado com sucesso!");
      refetch();
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData({ nome: "", cnpj: "", endereco: "" });
  };

  const openEdit = (est: { id: number; nome: string; cnpj?: string | null; endereco?: string | null }) => {
    setEditingId(est.id);
    setFormData({
      nome: est.nome,
      cnpj: est.cnpj || "",
      endereco: est.endereco || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleAtivo = (id: number, ativo: "sim" | "nao") => {
    updateMutation.mutate({ id, ativo: ativo === "sim" ? "nao" : "sim" });
  };

  const filteredEstabelecimentos = estabelecimentos?.filter((e) =>
    e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    e.cnpj?.includes(busca)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Estabelecimentos</h1>
            <p className="text-muted-foreground">Gerencie os hospitais e clínicas do sistema</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Estabelecimento
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Lista de Estabelecimentos
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CNPJ..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : !filteredEstabelecimentos?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum estabelecimento cadastrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEstabelecimentos.map((est) => (
                    <TableRow key={est.id}>
                      <TableCell className="font-medium">{est.nome}</TableCell>
                      <TableCell>{est.cnpj || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{est.endereco || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={est.ativo === "sim" ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleAtivo(est.id, est.ativo)}
                        >
                          {est.ativo === "sim" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(est)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Estabelecimento" : "Novo Estabelecimento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Hospital São Lucas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Rua das Flores, 123 - Centro"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
