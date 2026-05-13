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
import { Search, Briefcase, DollarSign, Edit2, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PlanoSalarios() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const utils = trpc.useContext();
  const [busca, setBusca] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ salarioBase: string, tetoSalarial: string }>({ salarioBase: "", tetoSalarial: "" });

  const { data: cargosSalarios = [], isLoading } = trpc.rh.listCargosSalarios.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id },
    { enabled: !!estabelecimentoAtual }
  );

  const updateMutation = trpc.rh.updateCargoSalario.useMutation({
    onSuccess: () => {
      toast.success("Plano salarial atualizado com sucesso!");
      setEditingId(null);
      utils.rh.listCargosSalarios.invalidate();
    },
    onError: (err) => {
      toast.error("Erro ao atualizar: " + err.message);
    }
  });

  const cargosFiltrados = cargosSalarios.filter(c => {
    if (!busca) return true;
    return c.cargo?.toLowerCase().includes(busca.toLowerCase());
  });

  const handleEditClick = (cargo: any) => {
    setEditingId(cargo.id);
    setEditValues({
      salarioBase: cargo.salarioBase || "",
      tetoSalarial: cargo.tetoSalarial || ""
    });
  };

  const handleSave = (id: number) => {
    updateMutation.mutate({
      id,
      salarioBase: editValues.salarioBase ? parseFloat(editValues.salarioBase.replace(',', '.')) : null,
      tetoSalarial: editValues.tetoSalarial ? parseFloat(editValues.tetoSalarial.replace(',', '.')) : null,
    });
  };

  const formatCurrency = (val: string | number | null) => {
    if (!val) return "-";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return "-";
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (!estabelecimentoAtual) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Selecione um Estabelecimento</h2>
          <p className="text-muted-foreground">Você precisa selecionar um estabelecimento para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-8 overflow-y-auto min-h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plano de Salários</h1>
          <p className="text-muted-foreground mt-1">
            Gestão do plano de cargos e salários (piso e teto) por cargo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 shrink-0">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Cargos</CardTitle>
            <Briefcase className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cargosSalarios.length}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cargos Mapeados</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cargosSalarios.filter(c => c.salarioBase || c.tetoSalarial).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cargos com regras definidas</p>
          </CardContent>
        </Card>
      </div>

      <Card className="flex flex-col border-border mt-2 mb-8">
        <div className="p-4 border-b bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">
          <h2 className="font-semibold">Tabela Salarial</h2>
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por cargo..."
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
                <TableHead>Cargo / Função</TableHead>
                <TableHead>Salário Base (Piso)</TableHead>
                <TableHead>Teto Salarial</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando e extraindo cargos...
                    </div>
                  </TableCell>
                </TableRow>
              ) : cargosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Nenhum cargo encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                cargosFiltrados.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                        {row.cargo}
                      </div>
                    </TableCell>
                    
                    {editingId === row.id ? (
                      <>
                        <TableCell>
                          <Input 
                            value={editValues.salarioBase} 
                            onChange={e => setEditValues({...editValues, salarioBase: e.target.value})} 
                            placeholder="Ex: 2500.00"
                            className="w-[150px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={editValues.tetoSalarial} 
                            onChange={e => setEditValues({...editValues, tetoSalarial: e.target.value})} 
                            placeholder="Ex: 5000.00"
                            className="w-[150px]"
                          />
                        </TableCell>
                        <TableCell className="text-right flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleSave(row.id)} title="Salvar">
                            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> : <Save className="h-4 w-4 text-emerald-500" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingId(null)} title="Cancelar">
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className={!row.salarioBase ? "text-muted-foreground" : ""}>
                          {formatCurrency(row.salarioBase)}
                        </TableCell>
                        <TableCell className={!row.tetoSalarial ? "text-muted-foreground" : ""}>
                          {formatCurrency(row.tetoSalarial)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditClick(row)} title="Definir Valores">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
