import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, KeyRound, Globe, Building2, UserCircle, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function CredenciaisPortais() {
  const { data: credenciais, refetch, isLoading } = trpc.rpa.listarCredenciais.useQuery();
  const { data: convenios } = trpc.rpa.listarConvenios.useQuery();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<number | undefined>();
  const [convenioId, setConvenioId] = useState<number | "">("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [urlLogin, setUrlLogin] = useState("");

  const salvarMutation = trpc.rpa.salvarCredencial.useMutation({
    onSuccess: () => {
      toast.success("Credenciais salvas com sucesso!");
      setIsModalOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar credenciais: ${error.message}`);
    }
  });

  const handleNovo = () => {
    setCurrentId(undefined);
    setConvenioId("");
    setLogin("");
    setSenha("");
    setUrlLogin("");
    setIsModalOpen(true);
  };

  const handleEditar = (cred: any) => {
    setCurrentId(cred.id);
    setConvenioId(cred.convenioId);
    setLogin(cred.login);
    setSenha("********"); // Placeholder for password
    setUrlLogin(cred.urlLogin || "");
    setIsModalOpen(true);
  };

  const handleSalvar = () => {
    if (!convenioId || !login || (!senha && !currentId)) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    salvarMutation.mutate({
      id: currentId,
      convenioId: Number(convenioId),
      login,
      senha: senha === "********" ? undefined : senha, // Senha real or undefined to keep old
      urlLogin: urlLogin || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Cofre de Credenciais RPA
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os usuários e senhas que os robôs usarão para acessar os portais.
          </p>
        </div>
        <Button onClick={handleNovo}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Credencial
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead>Usuário / Login</TableHead>
                <TableHead>Portal (URL)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando credenciais...
                  </TableCell>
                </TableRow>
              ) : credenciais?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma credencial cadastrada. O robô precisará de credenciais para rodar automaticamente.
                  </TableCell>
                </TableRow>
              ) : (
                credenciais?.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        {cred.convenioNome || `ID: ${cred.convenioId}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-muted-foreground" />
                        {cred.login}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cred.urlLogin ? (
                        <div className="flex items-center gap-1 text-sm text-blue-500 max-w-[200px] truncate">
                          <Globe className="w-3 h-3" />
                          {cred.urlLogin}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Padrão do Robô</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {cred.ativo === 'sim' ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-500">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cred.ultimoAcesso ? new Date(cred.ultimoAcesso).toLocaleString('pt-BR') : 'Nunca acessado'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditar(cred)}>
                        <Edit className="w-4 h-4 text-slate-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentId ? "Editar Credencial" : "Nova Credencial"}</DialogTitle>
            <DialogDescription>
              Insira os dados de acesso ao portal do convênio. A senha será armazenada de forma segura.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Convênio</label>
              <select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={convenioId}
                onChange={(e) => setConvenioId(Number(e.target.value))}
              >
                <option value="">Selecione o Convênio...</option>
                {convenios?.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">URL de Login (Opcional)</label>
              <Input 
                placeholder="Ex: https://www.unimed.com.br/login" 
                value={urlLogin}
                onChange={e => setUrlLogin(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para usar a URL padrão do robô.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuário / Login</label>
                <Input 
                  placeholder="Seu usuário" 
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input 
                  type="password"
                  placeholder="Sua senha secreta" 
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvarMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {salvarMutation.isPending ? "Salvando..." : "Salvar no Cofre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
