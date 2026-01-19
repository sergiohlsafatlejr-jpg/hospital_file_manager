import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
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
];

// Definição dos módulos do sistema
const MODULOS = [
  { key: "acessoDashboard", label: "Dashboard", icon: BarChart3 },
  { key: "acessoArquivos", label: "Arquivos", icon: FolderOpen },
  { key: "acessoComparacoes", label: "Comparações", icon: GitCompare },
  { key: "acessoFaturamento", label: "Faturamento", icon: DollarSign },
  { key: "acessoTabelasPreco", label: "Tabelas de Preço", icon: FileText },
  { key: "acessoAnaliseGlosa", label: "Análise de Glosa", icon: AlertCircle },
  { key: "acessoDicionarioGlosas", label: "Dicionário de Glosas", icon: BookOpen },
  { key: "acessoRecursosGlosa", label: "Recursos de Glosa", icon: Briefcase },
  { key: "acessoConvenios", label: "Convênios", icon: Building2 },
  { key: "acessoRegrasNegocio", label: "Regras de Negócio", icon: Settings },
  { key: "acessoProdutividade", label: "Produtividade", icon: BarChart3 },
  { key: "acessoEstabelecimentos", label: "Estabelecimentos", icon: Building2 },
  { key: "acessoPermissoes", label: "Permissões", icon: Shield },
];

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

export default function GerenciarPermissoes() {
  const [activeTab, setActiveTab] = useState("usuarios");
  const [selectedEstabelecimento, setSelectedEstabelecimento] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  // Estado para novo usuário
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user",
    estabelecimentosIds: [] as number[],
    grupoServico: "visualizador" as "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador",
  });
  
  // Estado para novo grupo
  const [newGroup, setNewGroup] = useState({
    nome: "",
    descricao: "",
    cor: "bg-blue-500",
    permissoesPadrao: {} as Record<string, string>,
  });
  
  const [newPermissao, setNewPermissao] = useState({
    userId: 0,
    grupoServico: "visualizador" as "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador",
    podeVisualizar: "sim" as "sim" | "nao",
    podeEditar: "nao" as "sim" | "nao",
    podeExcluir: "nao" as "sim" | "nao",
    podeGerenciar: "nao" as "sim" | "nao",
    acessoDashboard: "sim" as "sim" | "nao",
    acessoArquivos: "nao" as "sim" | "nao",
    acessoComparacoes: "nao" as "sim" | "nao",
    acessoFaturamento: "nao" as "sim" | "nao",
    acessoTabelasPreco: "nao" as "sim" | "nao",
    acessoAnaliseGlosa: "nao" as "sim" | "nao",
    acessoDicionarioGlosas: "nao" as "sim" | "nao",
    acessoRecursosGlosa: "nao" as "sim" | "nao",
    acessoConvenios: "nao" as "sim" | "nao",
    acessoRegrasNegocio: "nao" as "sim" | "nao",
    acessoProdutividade: "nao" as "sim" | "nao",
    acessoEstabelecimentos: "nao" as "sim" | "nao",
    acessoPermissoes: "nao" as "sim" | "nao",
  });

  // Verificar se é gestor
  const { data: isGestor, isLoading: loadingGestor } = trpc.permissoes.verificarGestor.useQuery();

  // Buscar estabelecimentos
  const { data: estabelecimentos, isLoading: loadingEstabelecimentos } = 
    trpc.estabelecimentos.list.useQuery({ ativo: "sim" });

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
    { enabled: isGestor === true }
  );

  // Buscar logs de auditoria
  const { data: logsAuditoria, isLoading: loadingLogs } = trpc.permissoes.logsAuditoria.useQuery(
    { 
      estabelecimentoId: selectedEstabelecimento || undefined,
      limite: 50 
    },
    { enabled: isGestor === true }
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

  // Aplicar permissões padrão do grupo
  const aplicarPermissoesGrupo = (grupo: string) => {
    const permissoesPadrao: Record<string, "sim" | "nao"> = {
      acessoDashboard: "nao",
      acessoArquivos: "nao",
      acessoComparacoes: "nao",
      acessoFaturamento: "nao",
      acessoTabelasPreco: "nao",
      acessoAnaliseGlosa: "nao",
      acessoDicionarioGlosas: "nao",
      acessoRecursosGlosa: "nao",
      acessoConvenios: "nao",
      acessoRegrasNegocio: "nao",
      acessoProdutividade: "nao",
      acessoEstabelecimentos: "nao",
      acessoPermissoes: "nao",
    };

    switch (grupo) {
      case "administrador":
        Object.keys(permissoesPadrao).forEach(key => {
          permissoesPadrao[key] = "sim";
        });
        break;
      case "faturista":
        permissoesPadrao.acessoDashboard = "sim";
        permissoesPadrao.acessoArquivos = "sim";
        permissoesPadrao.acessoComparacoes = "sim";
        permissoesPadrao.acessoFaturamento = "sim";
        permissoesPadrao.acessoTabelasPreco = "sim";
        permissoesPadrao.acessoConvenios = "sim";
        permissoesPadrao.acessoRegrasNegocio = "sim";
        break;
      case "recurso_glosa":
        permissoesPadrao.acessoDashboard = "sim";
        permissoesPadrao.acessoAnaliseGlosa = "sim";
        permissoesPadrao.acessoDicionarioGlosas = "sim";
        permissoesPadrao.acessoRecursosGlosa = "sim";
        break;
      case "gestor":
        permissoesPadrao.acessoDashboard = "sim";
        permissoesPadrao.acessoFaturamento = "sim";
        permissoesPadrao.acessoAnaliseGlosa = "sim";
        permissoesPadrao.acessoProdutividade = "sim";
        break;
      case "visualizador":
      default:
        permissoesPadrao.acessoDashboard = "sim";
        break;
    }

    return permissoesPadrao;
  };

  // Atualizar permissões quando o grupo muda
  useEffect(() => {
    if (newPermissao.grupoServico) {
      const permissoes = aplicarPermissoesGrupo(newPermissao.grupoServico);
      setNewPermissao(prev => ({
        ...prev,
        ...permissoes,
        podeVisualizar: "sim",
        podeEditar: prev.grupoServico === "administrador" || prev.grupoServico === "faturista" ? "sim" : "nao",
        podeExcluir: prev.grupoServico === "administrador" ? "sim" : "nao",
        podeGerenciar: prev.grupoServico === "administrador" ? "sim" : "nao",
      }));
    }
  }, [newPermissao.grupoServico]);

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
      ...newPermissao,
      estabelecimentoId: selectedEstabelecimento,
    });
  };

  const handleEditPermissao = (user: any) => {
    setEditingUser(user);
    setNewPermissao({
      userId: user.userId,
      grupoServico: (user.grupoServico || "visualizador") as "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador",
      podeVisualizar: user.podeVisualizar || "sim",
      podeEditar: user.podeEditar || "nao",
      podeExcluir: user.podeExcluir || "nao",
      podeGerenciar: user.podeGerenciar || "nao",
      acessoDashboard: user.acessoDashboard || "sim",
      acessoArquivos: user.acessoArquivos || "nao",
      acessoComparacoes: user.acessoComparacoes || "nao",
      acessoFaturamento: user.acessoFaturamento || "nao",
      acessoTabelasPreco: user.acessoTabelasPreco || "nao",
      acessoAnaliseGlosa: user.acessoAnaliseGlosa || "nao",
      acessoDicionarioGlosas: user.acessoDicionarioGlosas || "nao",
      acessoRecursosGlosa: user.acessoRecursosGlosa || "nao",
      acessoConvenios: user.acessoConvenios || "nao",
      acessoRegrasNegocio: user.acessoRegrasNegocio || "nao",
      acessoProdutividade: user.acessoProdutividade || "nao",
      acessoEstabelecimentos: user.acessoEstabelecimentos || "nao",
      acessoPermissoes: user.acessoPermissoes || "nao",
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedEstabelecimento || !editingUser) return;
    
    upsertPermissao.mutate({
      ...newPermissao,
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

  const getGrupoInfo = (grupoServico: string | null) => {
    const grupo = GRUPOS_SERVICO_PADRAO.find(g => g.value === grupoServico);
    return grupo || GRUPOS_SERVICO_PADRAO.find(g => g.value === "visualizador")!;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      <div className="container py-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!isGestor) {
    return (
      <div className="container py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para gerenciar permissões de usuários. 
            Este recurso está disponível apenas para gestores e administradores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
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
          <Button variant="outline" onClick={() => setShowCreateGroupDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Grupo
          </Button>
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
                    setNewPermissao({
                      userId: 0,
                      grupoServico: "visualizador",
                      podeVisualizar: "sim",
                      podeEditar: "nao",
                      podeExcluir: "nao",
                      podeGerenciar: "nao",
                      acessoDashboard: "sim",
                      acessoArquivos: "nao",
                      acessoComparacoes: "nao",
                      acessoFaturamento: "nao",
                      acessoTabelasPreco: "nao",
                      acessoAnaliseGlosa: "nao",
                      acessoDicionarioGlosas: "nao",
                      acessoRecursosGlosa: "nao",
                      acessoConvenios: "nao",
                      acessoRegrasNegocio: "nao",
                      acessoProdutividade: "nao",
                      acessoEstabelecimentos: "nao",
                      acessoPermissoes: "nao",
                    });
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
                        const grupoInfo = getGrupoInfo(user.grupoServico);
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
                            {formatDate(log.createdAt)}
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
                onValueChange={(value: "admin" | "user") => setNewUser(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário Comum</SelectItem>
                  <SelectItem value="admin">Administrador do Sistema</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Administradores têm acesso total ao sistema, independente das permissões por estabelecimento.
              </p>
            </div>

            {newUser.role === "user" && (
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
                    onValueChange={(value: "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador") => 
                      setNewUser(prev => ({ ...prev, grupoServico: value }))
                    }
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
        <DialogContent className="max-w-2xl">
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
                    // Definir permissões baseadas no grupo padrão
                    const permissoes: Record<string, string> = {};
                    MODULOS.forEach(modulo => {
                      if (value === "administrador") {
                        permissoes[modulo.key] = "sim";
                      } else if (value === "faturista") {
                        permissoes[modulo.key] = ["acessoDashboard", "acessoArquivos", "acessoComparacoes", "acessoFaturamento", "acessoTabelasPreco"].includes(modulo.key) ? "sim" : "nao";
                      } else if (value === "recurso_glosa") {
                        permissoes[modulo.key] = ["acessoDashboard", "acessoAnaliseGlosa", "acessoDicionarioGlosas", "acessoRecursosGlosa"].includes(modulo.key) ? "sim" : "nao";
                      } else if (value === "gestor") {
                        permissoes[modulo.key] = ["acessoDashboard", "acessoFaturamento", "acessoProdutividade", "acessoEstabelecimentos"].includes(modulo.key) ? "sim" : "nao";
                      } else if (value === "visualizador") {
                        permissoes[modulo.key] = modulo.key === "acessoDashboard" ? "sim" : "nao";
                      }
                    });
                    setNewGroup(prev => ({ ...prev, permissoesPadrao: permissoes }));
                    toast.success(`Permissões copiadas do grupo ${grupoPadrao.label}`);
                  } else {
                    // Verificar se é um grupo personalizado
                    const grupoPersonalizado = gruposPersonalizados?.find(g => g.id.toString() === value);
                    if (grupoPersonalizado && grupoPersonalizado.permissoesPadrao) {
                      setNewGroup(prev => ({ 
                        ...prev, 
                        permissoesPadrao: grupoPersonalizado.permissoesPadrao as Record<string, string>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Usuário ao Estabelecimento</DialogTitle>
            <DialogDescription>
              Selecione um usuário e configure suas permissões para este estabelecimento.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="usuario">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="usuario">Usuário e Grupo</TabsTrigger>
              <TabsTrigger value="modulos">Módulos</TabsTrigger>
            </TabsList>

            <TabsContent value="usuario" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Selecione o Usuário</Label>
                <Select
                  value={newPermissao.userId.toString()}
                  onValueChange={(value) => setNewPermissao(prev => ({ ...prev, userId: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuariosDisponiveis?.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{user.name}</span>
                          <span className="text-muted-foreground">({user.email})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Grupo de Serviço</Label>
                <div className="grid grid-cols-1 gap-2">
                  {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                    const Icon = grupo.icon;
                    const isSelected = newPermissao.grupoServico === grupo.value;
                    return (
                      <div
                        key={grupo.value}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"
                        }`}
                        onClick={() => setNewPermissao(prev => ({ 
                          ...prev, 
                          grupoServico: grupo.value as typeof prev.grupoServico 
                        }))}
                      >
                        <div className={`p-2 rounded-lg ${grupo.color} text-white`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{grupo.label}</h4>
                          <p className="text-xs text-muted-foreground">{grupo.description}</p>
                        </div>
                        {isSelected && (
                          <Badge variant="default">Selecionado</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="modulos" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Personalize os módulos que este usuário pode acessar.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MODULOS.map((modulo) => {
                  const Icon = modulo.icon;
                  const isEnabled = newPermissao[modulo.key as keyof typeof newPermissao] === "sim";
                  return (
                    <div
                      key={modulo.key}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{modulo.label}</span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => 
                          setNewPermissao(prev => ({
                            ...prev,
                            [modulo.key]: checked ? "sim" : "nao"
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddPermissao}>
              Adicionar Permissão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar permissão */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) setEditingUser(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
            <DialogDescription>
              Atualize as permissões de {editingUser?.userName || "usuário"} para este estabelecimento.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="grupo">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="grupo">Grupo de Serviço</TabsTrigger>
              <TabsTrigger value="modulos">Módulos</TabsTrigger>
            </TabsList>

            <TabsContent value="grupo" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Grupo de Serviço</Label>
                <div className="grid grid-cols-1 gap-2">
                  {GRUPOS_SERVICO_PADRAO.map((grupo) => {
                    const Icon = grupo.icon;
                    const isSelected = newPermissao.grupoServico === grupo.value;
                    return (
                      <div
                        key={grupo.value}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"
                        }`}
                        onClick={() => setNewPermissao(prev => ({ 
                          ...prev, 
                          grupoServico: grupo.value as typeof prev.grupoServico 
                        }))}
                      >
                        <div className={`p-2 rounded-lg ${grupo.color} text-white`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{grupo.label}</h4>
                          <p className="text-xs text-muted-foreground">{grupo.description}</p>
                        </div>
                        {isSelected && (
                          <Badge variant="default">Selecionado</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="modulos" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Personalize os módulos que este usuário pode acessar.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {MODULOS.map((modulo) => {
                  const Icon = modulo.icon;
                  const isEnabled = newPermissao[modulo.key as keyof typeof newPermissao] === "sim";
                  return (
                    <div
                      key={modulo.key}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{modulo.label}</span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => 
                          setNewPermissao(prev => ({
                            ...prev,
                            [modulo.key]: checked ? "sim" : "nao"
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false);
              setEditingUser(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
