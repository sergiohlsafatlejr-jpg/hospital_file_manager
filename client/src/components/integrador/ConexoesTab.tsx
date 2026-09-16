import { useState } from "react";
import { toast } from "sonner";
import { formatDateTimeBR } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, Plug, CheckCircle, XCircle, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ConexoesTabProps {
  estabelecimentoId: number;
}

const TIPO_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlserver: "SQL Server",
  oracle: "Oracle",
};

export function ConexoesTab({ estabelecimentoId }: ConexoesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<string>("postgresql");
  const [host, setHost] = useState("");
  const [porta, setPorta] = useState(5432);
  const [banco, setBanco] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ssl, setSsl] = useState<string>("nao");

  const conexoes = trpc.integradorDados.conexoes.listar.useQuery({ estabelecimentoId });

  const criarConexao = trpc.integradorDados.conexoes.criar.useMutation({
    onSuccess: () => {
      toast.success("Conexão criada com sucesso");
      resetForm();
      conexoes.refetch();
    },
    onError: (e) => toast.error("Erro ao criar conexão", { description: e.message }),
  });

  const atualizarConexao = trpc.integradorDados.conexoes.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Conexão atualizada com sucesso");
      resetForm();
      conexoes.refetch();
    },
    onError: (e) => toast.error("Erro ao atualizar", { description: e.message }),
  });

  const excluirConexao = trpc.integradorDados.conexoes.excluir.useMutation({
    onSuccess: () => {
      toast.success("Conexão excluída");
      setDeleteId(null);
      conexoes.refetch();
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message }),
  });

  const testarConexao = trpc.integradorDados.conexoes.testar.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Conexão OK", { description: data.mensagem });
      } else {
        toast.error("Falha na conexão", { description: data.mensagem });
      }
      conexoes.refetch();
    },
    onError: (e) => toast.error("Erro ao testar", { description: e.message }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditando(null);
    setNome("");
    setDescricao("");
    setTipo("postgresql");
    setHost("");
    setPorta(5432);
    setBanco("");
    setUsuario("");
    setSenha("");
    setSsl("nao");
  };

  const handleEditar = (conn: any) => {
    setEditando(conn);
    setNome(conn.nome);
    setDescricao(conn.descricao || "");
    setTipo(conn.tipo);
    setHost(conn.host);
    setPorta(conn.porta);
    setBanco(conn.banco);
    setUsuario(conn.usuario);
    setSenha("");
    setSsl(conn.ssl || "nao");
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!nome || !host || !banco || !usuario) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (editando) {
      atualizarConexao.mutate({
        id: editando.id,
        nome,
        descricao,
        tipo: tipo as any,
        host,
        porta,
        banco,
        usuario,
        ...(senha ? { senha } : {}),
        ssl: ssl as any,
      });
    } else {
      if (!senha) {
        toast.error("Senha é obrigatória para nova conexão");
        return;
      }
      criarConexao.mutate({
        nome,
        descricao,
        tipo: tipo as any,
        host,
        porta,
        banco,
        usuario,
        senha,
        ssl: ssl as any,
        estabelecimentoId,
      });
    }
  };

  const portaPadrao: Record<string, number> = {
    postgresql: 5432,
    mysql: 3306,
    sqlserver: 1433,
    oracle: 1521,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Conexões de Banco de Dados</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie as conexões com os bancos de dados dos hospitais
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Conexão
        </Button>
      </div>

      {conexoes.data && conexoes.data.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Verificação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conexoes.data.map((conn: any) => (
                <TableRow key={conn.id}>
                  <TableCell className="font-medium">{conn.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TIPO_LABELS[conn.tipo] || conn.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{conn.host}:{conn.porta}</TableCell>
                  <TableCell className="text-sm">{conn.banco}</TableCell>
                  <TableCell>
                    <div className="max-w-sm space-y-1">
                      {conn.statusConexao === "ok" ? (
                        <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> OK</Badge>
                      ) : conn.statusConexao === "erro" ? (
                        <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Erro</Badge>
                      ) : (
                        <Badge variant="secondary">Não testado</Badge>
                      )}
                      {conn.statusConexao === "erro" && conn.erroConexao && (
                        <p className="text-xs text-destructive" title={conn.erroConexao}>{conn.erroConexao}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {conn.ultimoTesteConexao ? formatDateTimeBR(conn.ultimoTesteConexao) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testarConexao.mutate({ id: conn.id })}
                        disabled={testarConexao.isPending}
                      >
                        {testarConexao.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleEditar(conn)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteId(conn.id)} className="text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma conexão cadastrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique em "Nova Conexão" para adicionar uma conexão de banco de dados
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Formulário */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Conexão" : "Nova Conexão"}</DialogTitle>
            <DialogDescription>
              Configure os dados de conexão com o banco de dados do hospital
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: EASYVISION Produção" />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional" />
              </div>
              <div>
                <Label>Tipo de Banco *</Label>
                <Select value={tipo} onValueChange={(v) => { setTipo(v); setPorta(portaPadrao[v] || 5432); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="sqlserver">SQL Server</SelectItem>
                    <SelectItem value="oracle">Oracle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>SSL</Label>
                <Select value={ssl} onValueChange={setSsl}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Host *</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Ex: 192.168.1.100" />
              </div>
              <div>
                <Label>Porta *</Label>
                <Input type="number" value={porta} onChange={(e) => setPorta(Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <Label>Nome do Banco *</Label>
                <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ex: hospital_db" />
              </div>
              <div>
                <Label>Usuário *</Label>
                <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuário do banco" />
              </div>
              <div>
                <Label>Senha {editando ? "(deixe vazio para manter)" : "*"}</Label>
                <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={criarConexao.isPending || atualizarConexao.isPending}
              >
                {(criarConexao.isPending || atualizarConexao.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editando ? "Salvar Alterações" : "Criar Conexão"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conexão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conexão? Os mapeamentos associados também serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && excluirConexao.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
