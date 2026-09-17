import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { OperationalPermissions } from "@/components/permissions/OperationalPermissions";
import { PermissionMatrix, PERMISSION_MODULES } from "@/components/permissions/PermissionMatrix";
import {
  ACTION_PROFILE_DEFAULTS,
  MODULE_PERMISSION_KEYS,
  getModulePermissionsForGroup,
  normalizeBiParent,
  sanitizeCustomModulePermissions,
  type ModulePermissionKey,
  type PermissionValue,
  type StandardServiceGroup,
} from "@shared/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Users,
  Shield,
  AlertTriangle,
  Trash2,
  UserPlus,
  FileText,
  BarChart3,
  Settings,
  FolderOpen,
  GitCompare,
  DollarSign,
  BookOpen,
  AlertCircle,
  Briefcase,
  Eye,
  Edit,
  ShieldCheck,
  Plus,
  History,
  Clock,
  User,
  Mail,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateUtils";

// Definição dos grupos de serviço pré-definidos
const GRUPOS_SERVICO_PADRAO = [
  { 
    value: "administrador", 
    label: "Administrador", 
    description: "Acesso total a todas as funcionalidades",
    icon: ShieldCheck,
    color: "bg-red-500"
  },
  { 
    value: "faturista", 
    label: "Faturista", 
    description: "Arquivos, Comparações, Faturamento, Tabelas de Preço",
    icon: FileText,
    color: "bg-blue-500"
  },
  { 
    value: "recurso_glosa", 
    label: "Recurso de Glosa", 
    description: "Análise de Glosa, Dicionário, Recursos",
    icon: AlertCircle,
    color: "bg-orange-500"
  },
  { 
    value: "gestor", 
    label: "Gestor", 
    description: "Dashboard, Relatórios, Produtividade",
    icon: BarChart3,
    color: "bg-green-500"
  },
  { 
    value: "visualizador", 
    label: "Visualizador", 
    description: "Apenas visualização (somente leitura)",
    icon: Eye,
    color: "bg-gray-500"
  },
  { 
    value: "usuario_tasy", 
    label: "Usuário Tasy", 
    description: "Importação Tasy, Contas Faturadas, Relatórios Tasy, Relatórios BI, Conciliação",
    icon: Briefcase,
    color: "bg-teal-500"
  },
];

const MODULOS = PERMISSION_MODULES;

// Cores disponíveis para grupos
const CORES_DISPONIVEIS = [
  { value: "bg-red-500", label: "Vermelho" },
  { value: "bg-blue-500", label: "Azul" },
  { value: "bg-green-500", label: "Verde" },
  { value: "bg-orange-500", label: "Laranja" },
  { value: "bg-purple-500", label: "Roxo" },
  { value: "bg-pink-500", label: "Rosa" },
  { value: "bg-yellow-500", label: "Amarelo" },
  { value: "bg-cyan-500", label: "Ciano" },
  { value: "bg-gray-500", label: "Cinza" },
];

type ActionPermissionKey = "podeVisualizar" | "podeEditar" | "podeExcluir" | "podeGerenciar";
type PermissionForm = {
  userId: number;
  grupoServico: StandardServiceGroup;
  grupoId: number | null;
} & Record<ActionPermissionKey, PermissionValue>
  & Record<ModulePermissionKey, PermissionValue>;

function createPermissionForm(
  grupoServico: StandardServiceGroup = "visualizador",
  userId = 0,
  grupoId: number | null = null,
  customModules?: unknown,
): PermissionForm {
  const modules = customModules
    ? sanitizeCustomModulePermissions(customModules)
    : getModulePermissionsForGroup(grupoServico);
  return {
    userId,
    grupoServico,
    grupoId,
    ...ACTION_PROFILE_DEFAULTS[grupoServico],
    ...modules,
  };
}

export default function GerenciarPermissoes() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("usuarios");
  const [selectedEstabelecimento, setSelectedEstabelecimento] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditEstabelecimentosDialog, setShowEditEstabelecimentosDialog] = useState(false);
  const [editingUserEstabelecimentos, setEditingUserEstabelecimentos] = useState<any>(null);
  const [selectedEstabelecimentosIds, setSelectedEstabelecimentosIds] = useState<number[]>([]);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  
  // Estado para novo usuário
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user" | "tasy_user",
    estabelecimentosIds: [] as number[],
    grupoServico: "visualizador" as StandardServiceGroup,
  });
  
  // Estado para novo grupo
  const [newGroup, setNewGroup] = useState({
    nome: "",
    descricao: "",
    cor: "bg-blue-500",
    permissoesPadrao: {} as Record<string, PermissionValue>,
  });
  
  const [newPermissao, setNewPermissao] = useState<PermissionForm>(() => createPermissionForm());

  // Verificar se é gestor
  const { data: isGestor, isLoading: loadingGestor } = trpc.permissoes.verificarGestor.useQuery();

  // Buscar somente estabelecimentos dentro do escopo administrativo do usuário
  const { data: estabelecimentos, isLoading: loadingEstabelecimentos } =
    trpc.permissoes.estabelecimentosGerenciaveis.useQuery(undefined, { enabled: isGestor === true });

  // Buscar usuários do estabelecimento selecionado
  const { data: usuarios, isLoading: loadingUsuarios, refetch: refetchUsuarios } = 
    trpc.permissoes.usuariosEstabelecimento.useQuery(
      { estabelecimentoId: selectedEstabelecimento! },
      { enabled: selectedEstabelecimento !== null && isGestor === true }
    );

  // Buscar todos os usuários do sistema
  const { data: todosUsuarios, refetch: refetchTodosUsuarios } = trpc.permissoes.listarUsuarios.useQuery(
    undefined,
    { enabled: isGestor === true }
  );

  // Buscar grupos personalizados
  const { data: gruposPersonalizados, refetch: refetchGrupos } = trpc.permissoes.listarGrupos.useQuery(
    { estabelecimentoId: selectedEstabelecimento || undefined },
    { enabled: isGestor === true && (currentUser?.role === "admin" || selectedEstabelecimento !== null) }
  );

  // Buscar logs de auditoria
  const { data: logsAuditoria, isLoading: loadingLogs } = trpc.permissoes.logsAuditoria.useQuery(
    { 
      estabelecimentoId: selectedEstabelecimento || undefined,
      limite: 50 
    },
    { enabled: isGestor === true && (currentUser?.role === "admin" || selectedEstabelecimento !== null) }
  );

  // Mutations
  const upsertPermissao = trpc.permissoes.upsertPermissao.useMutation({
    onSuccess: () => {
      toast.success("Permissão atualizada com sucesso!");
      refetchUsuarios();
      setShowAddDialog(false);
      setShowEditDialog(false);
      setEditingUser(null);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar permissão", {
        description: error.message,
      });
    },
  });

  const removerPermissao = trpc.permissoes.removerPermissao.useMutation({
    onSuccess: () => {
      toast.success("Permissão removida com sucesso!");
      refetchUsuarios();
    },
    onError: (error) => {
      toast.error("Erro ao remover permissão", {
        description: error.message,
      });
    },
  });

  const criarUsuario = trpc.permissoes.criarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      refetchTodosUsuarios();
      setShowCreateUserDialog(false);
      setNewUser({ name: "", email: "", role: "user", estabelecimentosIds: [], grupoServico: "visualizador" });
    },
    onError: (error) => {
      toast.error("Erro ao criar usuário", {
        description: error.message,
      });
    },
  });

  const criarGrupo = trpc.permissoes.criarGrupo.useMutation({
    onSuccess: () => {
      toast.success("Grupo criado com sucesso!");
      refetchGrupos();
      setShowCreateGroupDialog(false);
      setNewGroup({ nome: "", descricao: "", cor: "bg-blue-500", permissoesPadrao: {} });
    },
    onError: (error) => {
      toast.error("Erro ao criar grupo", {
        description: error.message,
      });
    },
  });

  const excluirGrupo = trpc.permissoes.excluirGrupo.useMutation({
    onSuccess: () => {
      toast.success("Grupo excluído com sucesso!");
      refetchGrupos();
    },
    onError: (error) => {
      toast.error("Erro ao excluir grupo", {
        description: error.message,
      });
    },
  });

  // Mutation para excluir usuário
  const excluirUsuario = trpc.permissoes.excluirUsuario.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso!");
      refetchTodosUsuarios();
      refetchUsuarios();
      setShowDeleteUserDialog(false);
      setUserToDelete(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir usuário", {
        description: error.message,
      });
    },
  });

  // Query para buscar estabelecimentos de um usuário específico
  const { data: estabelecimentosUsuario, refetch: refetchEstabelecimentosUsuario } = 
    trpc.permissoes.listarEstabelecimentosUsuario.useQuery(
      { userId: editingUserEstabelecimentos?.id || 0 },
      { enabled: !!editingUserEstabelecimentos?.id }
    );

  // Mutation para atualizar estabelecimentos do usuário
  const atualizarEstabelecimentosUsuario = trpc.permissoes.atualizarEstabelecimentosUsuario.useMutation({
    onSuccess: (result) => {
      toast.success(`Estabelecimentos atualizados: ${result.adicionados} adicionado(s), ${result.removidos} removido(s)`);
      refetchTodosUsuarios();
      refetchUsuarios();
      setShowEditEstabelecimentosDialog(false);
      setEditingUserEstabelecimentos(null);
      setSelectedEstabelecimentosIds([]);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar estabelecimentos", {
        description: error.message,
      });
    },
  });

  const aplicarGrupoPadrao = (grupo: StandardServiceGroup) => {
    setNewPermissao((prev) => createPermissionForm(grupo, prev.userId));
  };

  const aplicarGrupoPersonalizado = (grupo: { id: number; permissoesPadrao?: unknown }) => {
    setNewPermissao((prev) => createPermissionForm("visualizador", prev.userId, grupo.id, grupo.permissoesPadrao));
  };

  const alterarModulo = (key: ModulePermissionKey, value: PermissionValue) => {
    setNewPermissao((prev) => normalizeBiParent({ ...prev, [key]: value }) as PermissionForm);
  };

  const alterarAcao = (key: ActionPermissionKey, value: PermissionValue) => {
    setNewPermissao((prev) => ({ ...prev, [key]: value }));
  };

  const handleRemoverPermissao = (userId: number) => {
    if (!selectedEstabelecimento) return;
    
    if (confirm("Tem certeza que deseja remover todas as permissões deste usuário para este estabelecimento?")) {
      removerPermissao.mutate({
        userId,
        estabelecimentoId: selectedEstabelecimento,
      });
    }
  };

  const handleAddPermissao = () => {
    if (!selectedEstabelecimento || !newPermissao.userId) {
      toast.error("Selecione um usuário");
      return;
    }

    upsertPermissao.mutate({
      ...normalizeBiParent(newPermissao),
      estabelecimentoId: selectedEstabelecimento,
    });
  };

  const handleEditPermissao = (user: any) => {
    setEditingUser(user);
    const grupo = (user.grupoServico || "visualizador") as StandardServiceGroup;
    const base = createPermissionForm(grupo, user.userId, user.grupoId || null);
    const modules = Object.fromEntries(
      MODULE_PERMISSION_KEYS.map((key) => [key, user[key] || base[key]]),
    ) as Record<ModulePermissionKey, PermissionValue>;
    setNewPermissao(normalizeBiParent({
      ...base,
      ...modules,
      podeVisualizar: user.podeVisualizar || base.podeVisualizar,
      podeEditar: user.podeEditar || base.podeEditar,
      podeExcluir: user.podeExcluir || base.podeExcluir,
      podeGerenciar: user.podeGerenciar || base.podeGerenciar,
    }) as PermissionForm);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedEstabelecimento || !editingUser) return;
    upsertPermissao.mutate({
      ...normalizeBiParent(newPermissao),
      estabelecimentoId: selectedEstabelecimento,
    });
  };

  const handleCreateUser = () => {
    if (!newUser.name || !newUser.email) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (newUser.role === "user" && newUser.estabelecimentosIds.length === 0) {
      toast.error("Selecione pelo menos um estabelecimento para o usuário");
      return;
    }
    criarUsuario.mutate(newUser);
  };

  const handleCreateGroup = () => {
    if (!newGroup.nome) {
      toast.error("Informe o nome do grupo");
      return;
    }
    criarGrupo.mutate({
      ...newGroup,
      estabelecimentoId: selectedEstabelecimento || undefined,
    });
  };

  const handleDeleteGroup = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este grupo?")) {
      excluirGrupo.mutate({ id });
    }
  };

  const handleEditEstabelecimentos = (user: any) => {
    setEditingUserEstabelecimentos(user);
    setShowEditEstabelecimentosDialog(true);
  };

  // Effect para carregar estabelecimentos do usuário quando abrir o dialog
  useEffect(() => {
    if (estabelecimentosUsuario && showEditEstabelecimentosDialog) {
      setSelectedEstabelecimentosIds(estabelecimentosUsuario.map((e: any) => e.id));
    }
  }, [estabelecimentosUsuario, showEditEstabelecimentosDialog]);

  const handleSaveEstabelecimentos = () => {
    if (!editingUserEstabelecimentos) return;
    atualizarEstabelecimentosUsuario.mutate({
      userId: editingUserEstabelecimentos.id,
      estabelecimentosIds: selectedEstabelecimentosIds,
    });
  };

  const toggleEstabelecimento = (estabelecimentoId: number) => {
    setSelectedEstabelecimentosIds(prev => {
      if (prev.includes(estabelecimentoId)) {
        return prev.filter(id => id !== estabelecimentoId);
      } else {
        return [...prev, estabelecimentoId];
      }
    });
  };

  const selectAllEstabelecimentos = () => {
    if (estabelecimentos) {
      setSelectedEstabelecimentosIds(estabelecimentos.map(e => e.id));
    }
  };

  const clearEstabelecimentos = () => {
    setSelectedEstabelecimentosIds([]);
  };

  const getGrupoInfo = (grupoServico: string | null, grupoId?: number | null) => {
    const personalizado = grupoId ? gruposPersonalizados?.find((grupo) => grupo.id === grupoId) : undefined;
    if (personalizado) {
      return {
        value: `custom-${personalizado.id}`,
        label: personalizado.nome,
        description: personalizado.descricao || "Grupo personalizado",
        icon: Shield,
        color: personalizado.cor || "bg-indigo-500",
      };
    }
    const grupo = GRUPOS_SERVICO_PADRAO.find(g => g.value === grupoServico);
    return grupo || GRUPOS_SERVICO_PADRAO.find(g => g.value === "visualizador")!;
  };

  const formatDate = (date: Date | string) => {
    return formatDateTimeBR(date);
  };

  const getTipoAcaoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      criar_permissao: "Criou permissão",
      alterar_permissao: "Alterou permissão",
      remover_permissao: "Removeu permissão",
      criar_usuario: "Criou usuário",
      alterar_grupo: "Alterou grupo",
      criar_grupo: "Criou grupo",
      excluir_grupo: "Excluiu grupo",
    };
    return labels[tipo] || tipo;
  };

  // Filtrar usuários que ainda não têm permissão neste estabelecimento
  const usuariosDisponiveis = todosUsuarios?.filter(
    u => !usuarios?.some(p => p.userId === u.id)
  );

  if (loadingGestor || loadingEstabelecimentos) {
    return (
      <DashboardLayout>
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
      </DashboardLayout>
    );
  }

  if (!isGestor) {
    return (
      <DashboardLayout>
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para gerenciar permissões de usuários. 
            Este recurso está disponível apenas para gestores e administradores.
          </AlertDescription>
        </Alert>
      </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Gerenciar Permissões
          </h1>
          <p className="text-muted-foreground">
            Configure grupos de serviço, usuários e permissões de acesso
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateUserDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
          {currentUser?.role === "admin" && (
            <Button variant="outline" onClick={() => setShowCreateGroupDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Grupo
            </Button>
          )}
        </div>
      </div>

      {/* Tabs principais */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários e Permissões
          </TabsTrigger>
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Grupos de Serviço
          </TabsTrigger>
          <TabsTrigger value="auditoria" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Log de Auditoria
          </TabsTrigger>
        </TabsList>

        {/* Tab de Usuários e Permissões */}
        <TabsContent value="usuarios" className="space-y-6">
          {/* Legenda dos Grupos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Grupos de Serviço</CardTitle>
              <CardDescription>
                Cada grupo possui permissões pré-definidas que podem ser personalizadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                  const Icon = grupo.icon;
                  return (
                    <div key={grupo.value} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                      <div className={`p-2 rounded-lg ${grupo.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{grupo.label}</h4>
                        <p className="text-xs text-muted-foreground">{grupo.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Seleção de Estabelecimento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Selecione o Estabelecimento
              </CardTitle>
              <CardDescription>
                Escolha um estabelecimento para gerenciar suas permissões
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {estabelecimentos?.map((est) => (
                  <div
                    key={est.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedEstabelecimento === est.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary"
                        : "hover:border-primary/50 hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedEstabelecimento(est.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className={`h-5 w-5 ${
                        selectedEstabelecimento === est.id ? "text-primary" : "text-muted-foreground"
                      }`} />
                      <div>
                        <h3 className="font-semibold">{est.nome}</h3>
                        {est.cnpj && (
                          <p className="text-sm text-muted-foreground">CNPJ: {est.cnpj}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lista de Usuários com Permissões */}
          {selectedEstabelecimento && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Usuários com Acesso
                    </CardTitle>
                    <CardDescription>
                      Gerencie as permissões de cada usuário para este estabelecimento
                    </CardDescription>
                  </div>
                  <Button onClick={() => {
                    setNewPermissao(createPermissionForm("visualizador"));
                    setShowAddDialog(true);
                  }}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Usuário
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingUsuarios ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : usuarios && usuarios.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Permissões</TableHead>
                        <TableHead>Módulos</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((user) => {
                        const grupoInfo = getGrupoInfo(user.grupoServico, user.grupoId);
                        const Icon = grupoInfo.icon;
                        const modulosAtivos = MODULOS.filter(m => 
                          user[m.key as keyof typeof user] === "sim"
                        ).length;
                        
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">{user.userName || "Usuário"}</p>
                                  <p className="text-sm text-muted-foreground">{user.userEmail}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${grupoInfo.color} text-white`}>
                                <Icon className="h-3 w-3 mr-1" />
                                {grupoInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {user.podeVisualizar === "sim" && (
                                  <Badge variant="outline" className="text-xs">
                                    <Eye className="h-3 w-3 mr-1" />
                                    Ver
                                  </Badge>
                                )}
                                {user.podeEditar === "sim" && (
                                  <Badge variant="outline" className="text-xs">
                                    <Edit className="h-3 w-3 mr-1" />
                                    Editar
                                  </Badge>
                                )}
                                {user.podeGerenciar === "sim" && (
                                  <Badge variant="outline" className="text-xs">
                                    <Settings className="h-3 w-3 mr-1" />
                                    Gerenciar
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {modulosAtivos} de {MODULOS.length} módulos
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPermissao(user)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleRemoverPermissao(user.userId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum usuário com permissões neste estabelecimento</p>
                    <p className="text-sm">Clique em "Adicionar Usuário" para começar</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lista de Todos os Usuários do Sistema */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Todos os Usuários do Sistema
                  </CardTitle>
                  <CardDescription>
                    Gerencie os estabelecimentos de cada usuário
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {todosUsuarios && todosUsuarios.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Estabelecimentos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todosUsuarios.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : user.role === "tasy_user" ? "outline" : "secondary"}>
                            {user.role === "admin" ? "Administrador" : user.role === "tasy_user" ? "Usuário Tasy" : "Usuário"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {user.estabelecimentosCount || 0} estabelecimento(s)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditEstabelecimentos(user)}
                            >
                              <Building2 className="h-4 w-4 mr-2" />
                              Editar Estabelecimentos
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setUserToDelete(user);
                                setShowDeleteUserDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum usuário cadastrado no sistema</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Grupos de Serviço */}
        <TabsContent value="grupos" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Grupos de Serviço</CardTitle>
                  <CardDescription>
                    Grupos pré-definidos e personalizados para organizar permissões
                  </CardDescription>
                </div>
                <Button onClick={() => setShowCreateGroupDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Grupo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Grupos Pré-definidos */}
                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Grupos Pré-definidos (Sistema)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                      const Icon = grupo.icon;
                      return (
                        <div key={grupo.value} className="p-4 border rounded-lg bg-muted/30">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${grupo.color} text-white`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold">{grupo.label}</h4>
                              <p className="text-sm text-muted-foreground">{grupo.description}</p>
                              <Badge variant="secondary" className="mt-2 text-xs">
                                Sistema
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grupos Personalizados */}
                {gruposPersonalizados && gruposPersonalizados.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Grupos Personalizados
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {gruposPersonalizados.map((grupo) => (
                        <div key={grupo.id} className="p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${grupo.cor || "bg-blue-500"} text-white`}>
                              <Users className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold">{grupo.nome}</h4>
                              <p className="text-sm text-muted-foreground">{grupo.descricao || "Sem descrição"}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  Personalizado
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteGroup(grupo.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Log de Auditoria */}
        <TabsContent value="auditoria" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Log de Auditoria
              </CardTitle>
              <CardDescription>
                Histórico de alterações em permissões e grupos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : logsAuditoria?.logs && logsAuditoria.logs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Usuário Afetado</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsAuditoria.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {formatDateBR(log.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{log.usuarioNome || "Sistema"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getTipoAcaoLabel(log.tipoAcao)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.usuarioAfetadoNome || "-"}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {log.descricao || "-"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum registro de auditoria encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para criar novo usuário */}
      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Criar Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Adicione um novo usuário ao sistema. Após criado, você poderá atribuir permissões.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Nome Completo *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="userName"
                  placeholder="Nome do usuário"
                  className="pl-10"
                  value={newUser.name}
                  onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="userEmail"
                  type="email"
                  placeholder="email@exemplo.com"
                  className="pl-10"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de Usuário</Label>
              <Select
                value={newUser.role}
                onValueChange={(value: "admin" | "user" | "tasy_user") => setNewUser(prev => ({
                  ...prev,
                  role: value,
                  grupoServico: value === "tasy_user" ? "usuario_tasy" : prev.grupoServico,
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário Comum</SelectItem>
                  <SelectItem value="tasy_user">Usuário Tasy</SelectItem>
                  {currentUser?.role === "admin" && <SelectItem value="admin">Administrador do Sistema</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {newUser.role === "admin" && "Administradores têm acesso total ao sistema, independente das permissões por estabelecimento."}
                {newUser.role === "user" && "Usuários comuns têm acesso baseado nas permissões configuradas por estabelecimento."}
                {newUser.role === "tasy_user" && "Usuários Tasy têm acesso restrito apenas às funcionalidades do sistema Tasy (Importação, Faturado, Relatórios Tasy, etc.)."}
              </p>
            </div>

            {(newUser.role === "user" || newUser.role === "tasy_user") && (
              <>
                <div className="space-y-2">
                  <Label>Estabelecimentos com Acesso *</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Selecione os estabelecimentos que este usuário poderá acessar.
                  </p>
                  <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {estabelecimentos?.map((est) => (
                      <div key={est.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`est-${est.id}`}
                          checked={newUser.estabelecimentosIds.includes(est.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUser(prev => ({
                                ...prev,
                                estabelecimentosIds: [...prev.estabelecimentosIds, est.id]
                              }));
                            } else {
                              setNewUser(prev => ({
                                ...prev,
                                estabelecimentosIds: prev.estabelecimentosIds.filter(id => id !== est.id)
                              }));
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label htmlFor={`est-${est.id}`} className="text-sm flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {est.nome}
                        </label>
                      </div>
                    ))}
                  </div>
                  {newUser.estabelecimentosIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {newUser.estabelecimentosIds.length} estabelecimento(s) selecionado(s)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Grupo de Serviço</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Define as permissões padrão do usuário nos estabelecimentos selecionados.
                  </p>
                  <Select
                    value={newUser.grupoServico}
                    onValueChange={(value: StandardServiceGroup) => setNewUser(prev => ({ ...prev, grupoServico: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                        const Icon = grupo.icon;
                        return (
                          <SelectItem key={grupo.value} value={grupo.value}>
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded ${grupo.color}`} />
                              <Icon className="h-4 w-4" />
                              {grupo.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateUserDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={criarUsuario.isPending}>
              {criarUsuario.isPending ? "Criando..." : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para criar novo grupo */}
      <Dialog open={showCreateGroupDialog} onOpenChange={setShowCreateGroupDialog}>
        <DialogContent className="!max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Criar Novo Grupo de Serviço
            </DialogTitle>
            <DialogDescription>
              Crie um grupo personalizado com permissões específicas para sua organização.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Copiar permissões de grupo existente */}
            <div className="space-y-2">
              <Label>Copiar Permissões de</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Selecione um grupo existente para copiar suas permissões como base.
              </p>
              <Select
                onValueChange={(value) => {
                  if (value === "none") {
                    setNewGroup(prev => ({ ...prev, permissoesPadrao: {} }));
                    return;
                  }
                  
                  // Verificar se é um grupo padrão
                  const grupoPadrao = GRUPOS_SERVICO_PADRAO.find(g => g.value === value);
                  if (grupoPadrao) {
                    const permissoes = getModulePermissionsForGroup(value as StandardServiceGroup);
                    setNewGroup(prev => ({ ...prev, permissoesPadrao: permissoes }));
                    toast.success(`Permissões copiadas do grupo ${grupoPadrao.label}`);
                  } else {
                    // Verificar se é um grupo personalizado
                    const grupoPersonalizado = gruposPersonalizados?.find(g => g.id.toString() === value);
                    if (grupoPersonalizado && grupoPersonalizado.permissoesPadrao) {
                      setNewGroup(prev => ({ 
                        ...prev, 
                        permissoesPadrao: sanitizeCustomModulePermissions(grupoPersonalizado.permissoesPadrao),
                      }));
                      toast.success(`Permissões copiadas do grupo ${grupoPersonalizado.nome}`);
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um grupo para copiar (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Não copiar - começar do zero</span>
                  </SelectItem>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Grupos Padrão</div>
                  {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                    const Icon = grupo.icon;
                    return (
                      <SelectItem key={grupo.value} value={grupo.value}>
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded ${grupo.color}`} />
                          <Icon className="h-4 w-4" />
                          {grupo.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                  {gruposPersonalizados && gruposPersonalizados.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Grupos Personalizados</div>
                      {gruposPersonalizados.map((grupo) => (
                        <SelectItem key={grupo.id} value={grupo.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded ${grupo.cor || 'bg-gray-500'}`} />
                            {grupo.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="groupName">Nome do Grupo *</Label>
                <Input
                  id="groupName"
                  placeholder="Ex: Analista Financeiro"
                  value={newGroup.nome}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, nome: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Cor do Grupo</Label>
                <Select
                  value={newGroup.cor}
                  onValueChange={(value) => setNewGroup(prev => ({ ...prev, cor: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CORES_DISPONIVEIS.map((cor) => (
                      <SelectItem key={cor.value} value={cor.value}>
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded ${cor.value}`} />
                          {cor.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="groupDesc">Descrição</Label>
              <Textarea
                id="groupDesc"
                placeholder="Descreva as responsabilidades deste grupo..."
                value={newGroup.descricao}
                onChange={(e) => setNewGroup(prev => ({ ...prev, descricao: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Permissões Padrão do Grupo</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Selecione os módulos que usuários deste grupo terão acesso por padrão.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MODULOS.map((modulo) => {
                  const Icon = modulo.icon;
                  const isEnabled = newGroup.permissoesPadrao[modulo.key] === "sim";
                  return (
                    <div
                      key={modulo.key}
                      className="flex items-center justify-between p-2 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{modulo.label}</span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => 
                          setNewGroup(prev => ({
                            ...prev,
                            permissoesPadrao: {
                              ...prev.permissoesPadrao,
                              [modulo.key]: checked ? "sim" : "nao"
                            }
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroupDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateGroup} disabled={criarGrupo.isPending}>
              {criarGrupo.isPending ? "Criando..." : "Criar Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para adicionar permissão */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="!max-w-6xl w-[96vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Adicionar usuário ao estabelecimento</DialogTitle>
            <DialogDescription>Escolha o perfil, ajuste as ações e libere somente os módulos necessários.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="perfil" className="flex min-h-0 flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="perfil">1. Usuário e perfil</TabsTrigger>
              <TabsTrigger value="acoes">2. Ações</TabsTrigger>
              <TabsTrigger value="modulos">3. Módulos e BI</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <TabsContent value="perfil" className="space-y-5 pt-2">
                <div className="space-y-2">
                  <Label>Usuário</Label>
                  <Select value={newPermissao.userId ? newPermissao.userId.toString() : undefined} onValueChange={(value) => setNewPermissao((prev) => ({ ...prev, userId: Number(value) }))}>
                    <SelectTrigger><SelectValue placeholder="Escolha um usuário" /></SelectTrigger>
                    <SelectContent>
                      {usuariosDisponiveis?.map((usuario) => (
                        <SelectItem key={usuario.id} value={usuario.id.toString()}>
                          {usuario.name} ({usuario.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Perfis padrão</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                      const Icon = grupo.icon;
                      const isSelected = newPermissao.grupoId === null && newPermissao.grupoServico === grupo.value;
                      return (
                        <button
                          type="button"
                          key={grupo.value}
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/40"}`}
                          onClick={() => aplicarGrupoPadrao(grupo.value as StandardServiceGroup)}
                        >
                          <div className={`rounded-lg p-2 ${grupo.color} text-white`}><Icon className="h-4 w-4" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{grupo.label}</p>
                            <p className="text-xs text-muted-foreground">{grupo.description}</p>
                          </div>
                          {isSelected && <Badge>Aplicado</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {gruposPersonalizados && gruposPersonalizados.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Grupos personalizados</h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {gruposPersonalizados.map((grupo) => {
                          const isSelected = newPermissao.grupoId === grupo.id;
                          return (
                            <button
                              type="button"
                              key={grupo.id}
                              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${isSelected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "hover:border-indigo-300 hover:bg-indigo-50/40"}`}
                              onClick={() => aplicarGrupoPersonalizado(grupo)}
                            >
                              <div className={`rounded-lg p-2 ${grupo.cor || "bg-indigo-500"} text-white`}><Shield className="h-4 w-4" /></div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{grupo.nome}</p>
                                <p className="text-xs text-muted-foreground">{grupo.descricao || "Perfil personalizado"}</p>
                              </div>
                              {isSelected && <Badge>Aplicado</Badge>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </TabsContent>
              <TabsContent value="acoes" className="pt-3">
                <OperationalPermissions values={newPermissao} onChange={alterarAcao} />
              </TabsContent>
              <TabsContent value="modulos" className="pt-3">
                <PermissionMatrix values={newPermissao} onChange={alterarModulo} />
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddPermissao} disabled={upsertPermissao.isPending}>
              {upsertPermissao.isPending ? "Salvando..." : "Adicionar permissão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar permissão */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditingUser(null); }}>
        <DialogContent className="!max-w-6xl w-[96vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Editar permissões</DialogTitle>
            <DialogDescription>
              {editingUser?.userName || "Usuário"} — alterações válidas somente para o estabelecimento selecionado.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="perfil" className="flex min-h-0 flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="perfil">1. Perfil</TabsTrigger>
              <TabsTrigger value="acoes">2. Ações</TabsTrigger>
              <TabsTrigger value="modulos">3. Módulos e BI</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <TabsContent value="perfil" className="space-y-5 pt-2">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="font-medium">{editingUser?.userName}</p>
                  <p className="text-sm text-muted-foreground">{editingUser?.userEmail}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Perfis padrão</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                      const Icon = grupo.icon;
                      const isSelected = newPermissao.grupoId === null && newPermissao.grupoServico === grupo.value;
                      return (
                        <button
                          type="button"
                          key={grupo.value}
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/40"}`}
                          onClick={() => aplicarGrupoPadrao(grupo.value as StandardServiceGroup)}
                        >
                          <div className={`rounded-lg p-2 ${grupo.color} text-white`}><Icon className="h-4 w-4" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{grupo.label}</p>
                            <p className="text-xs text-muted-foreground">{grupo.description}</p>
                          </div>
                          {isSelected && <Badge>Aplicado</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {gruposPersonalizados && gruposPersonalizados.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Grupos personalizados</h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {gruposPersonalizados.map((grupo) => {
                          const isSelected = newPermissao.grupoId === grupo.id;
                          return (
                            <button
                              type="button"
                              key={grupo.id}
                              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${isSelected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "hover:border-indigo-300 hover:bg-indigo-50/40"}`}
                              onClick={() => aplicarGrupoPersonalizado(grupo)}
                            >
                              <div className={`rounded-lg p-2 ${grupo.cor || "bg-indigo-500"} text-white`}><Shield className="h-4 w-4" /></div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{grupo.nome}</p>
                                <p className="text-xs text-muted-foreground">{grupo.descricao || "Perfil personalizado"}</p>
                              </div>
                              {isSelected && <Badge>Aplicado</Badge>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </TabsContent>
              <TabsContent value="acoes" className="pt-3">
                <OperationalPermissions values={newPermissao} onChange={alterarAcao} />
              </TabsContent>
              <TabsContent value="modulos" className="pt-3">
                <PermissionMatrix values={newPermissao} onChange={alterarModulo} />
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingUser(null); }}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={upsertPermissao.isPending}>
              {upsertPermissao.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar estabelecimentos do usuário */}
      <Dialog open={showEditEstabelecimentosDialog} onOpenChange={(open) => {
        setShowEditEstabelecimentosDialog(open);
        if (!open) {
          setEditingUserEstabelecimentos(null);
          setSelectedEstabelecimentosIds([]);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Editar Estabelecimentos
            </DialogTitle>
            <DialogDescription>
              {editingUserEstabelecimentos && (
                <span>
                  Gerenciar estabelecimentos de <strong>{editingUserEstabelecimentos.name}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedEstabelecimentosIds.length} de {estabelecimentos?.length || 0} estabelecimento(s) selecionado(s)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllEstabelecimentos}>
                  Selecionar Todos
                </Button>
                <Button variant="outline" size="sm" onClick={clearEstabelecimentos}>
                  Limpar Seleção
                </Button>
              </div>
            </div>
            
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {estabelecimentos?.map((est) => {
                const isSelected = selectedEstabelecimentosIds.includes(est.id);
                return (
                  <div
                    key={est.id}
                    className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer transition-all ${
                      isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleEstabelecimento(est.id)}
                  >
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                    }`}>
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{est.nome}</p>
                      <p className="text-sm text-muted-foreground">{est.cnpj}</p>
                    </div>
                    <Badge variant={est.ativo === "sim" ? "default" : "secondary"}>
                      {est.ativo === "sim" ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditEstabelecimentosDialog(false);
              setEditingUserEstabelecimentos(null);
              setSelectedEstabelecimentosIds([]);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveEstabelecimentos}
              disabled={atualizarEstabelecimentosUsuario.isPending}
            >
              {atualizarEstabelecimentosUsuario.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão de usuário */}
      <AlertDialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.name}</strong>?
              <br /><br />
              Esta ação irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remover todas as permissões de estabelecimentos</li>
                <li>Excluir o usuário permanentemente do sistema</li>
              </ul>
              <br />
              <strong className="text-destructive">Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteUserDialog(false);
              setUserToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (userToDelete) {
                  excluirUsuario.mutate({ userId: userToDelete.id });
                }
              }}
              disabled={excluirUsuario.isPending}
            >
              {excluirUsuario.isPending ? "Excluindo..." : "Excluir Usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </DashboardLayout>
  );
}
