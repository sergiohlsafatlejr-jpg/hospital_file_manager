import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import {
  Shield,
  Search,
  Users,
  LayoutGrid,
  DollarSign,
  FileText,
  FileSpreadsheet,
  Activity,
  Receipt,
  Eye,
  Save,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { SAFATLE_ESTABELECIMENTO_ID } from "@shared/const";

// Módulos do Safatle com ícones e descrições
const MODULOS_SAFATLE = [
  { 
    key: "acessoPainelExecutivo", 
    label: "Painel Executivo", 
    description: "Dashboard consolidado com KPIs de todos os estabelecimentos",
    icon: LayoutGrid,
    color: "text-blue-500"
  },
  { 
    key: "acessoVisaoGeral", 
    label: "Visão Geral", 
    description: "Resumo executivo de faturamento, recebimento e glosas",
    icon: Eye,
    color: "text-emerald-500"
  },
  { 
    key: "acessoFinanceiro", 
    label: "Financeiro", 
    description: "Contas a pagar/receber, DRE, bancos e extratos",
    icon: DollarSign,
    color: "text-green-500"
  },
  { 
    key: "acessoContratos", 
    label: "Contratos", 
    description: "Gestão de contratos hospitalares com convênios",
    icon: FileText,
    color: "text-orange-500"
  },
  { 
    key: "acessoPropostas", 
    label: "Propostas", 
    description: "Pipeline de propostas comerciais e negociações",
    icon: FileSpreadsheet,
    color: "text-purple-500"
  },
  {
    key: "acessoRecursosHumanos",
    label: "Recursos Humanos",
    description: "Quadro de colaboradores, plano de salários e folha de pagamento",
    icon: Users,
    color: "text-amber-500"
  },
  { 
    key: "acessoAtendimentosConsolidados", 
    label: "Atendimentos Consolidados", 
    description: "Visão consolidada de atendimentos de todos os estabelecimentos",
    icon: Activity,
    color: "text-cyan-500"
  },
  { 
    key: "acessoNfseConsolidado", 
    label: "NFS-e Consolidado", 
    description: "Notas fiscais de serviço consolidadas do grupo",
    icon: Receipt,
    color: "text-rose-500"
  },
];

interface UserPermissions {
  userId: number;
  userName: string;
  userEmail: string;
  permissions: Record<string, string>;
  hasChanges: boolean;
}

export default function PermissoesSafatle() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, string>>>({});
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkAction, setBulkAction] = useState<"enable_all" | "disable_all">("enable_all");

  // Buscar usuários e suas permissões para o Safatle (tudo em uma query)
  const { data: dadosSafatle, isLoading: loadingDados, refetch: refetchDados } = 
    trpc.permissoes.listarPermissoesSafatle.useQuery();

  const upsertMutation = trpc.permissoes.upsertPermissao.useMutation({
    onSuccess: () => {
      refetchDados();
      toast.success("Permissões atualizadas com sucesso");
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Mapear permissões por userId
  const permissoesPorUsuario = useMemo(() => {
    const map: Record<number, any> = {};
    if (dadosSafatle) {
      for (const item of dadosSafatle) {
        if (item.permissions) {
          map[item.userId] = item.permissions;
        }
      }
    }
    return map;
  }, [dadosSafatle]);

  // Filtrar usuários
  const filteredUsers = useMemo(() => {
    if (!dadosSafatle) return [];
    return dadosSafatle.filter((u: any) => {
      const term = searchTerm.toLowerCase();
      return u.userName?.toLowerCase().includes(term) || u.userEmail?.toLowerCase().includes(term);
    });
  }, [dadosSafatle, searchTerm]);

  // Obter valor da permissão (com pending changes)
  const getPermValue = (userId: number, key: string): boolean => {
    if (pendingChanges[userId]?.[key]) {
      return pendingChanges[userId][key] === "sim";
    }
    const perm = permissoesPorUsuario[userId];
    if (perm && perm[key]) {
      return perm[key] === "sim";
    }
    return false;
  };

  // Alternar permissão
  const togglePermission = (userId: number, key: string) => {
    const currentValue = getPermValue(userId, key);
    const newValue = currentValue ? "nao" : "sim";
    setPendingChanges(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [key]: newValue,
      }
    }));
  };

  // Verificar se usuário tem mudanças pendentes
  const hasPendingChanges = (userId: number): boolean => {
    return !!pendingChanges[userId] && Object.keys(pendingChanges[userId]).length > 0;
  };

  // Salvar permissões de um usuário
  const saveUserPermissions = async (userId: number) => {
    const changes = pendingChanges[userId];
    if (!changes) return;

    setSavingUserId(userId);
    try {
      await upsertMutation.mutateAsync({
        userId,
        estabelecimentoId: SAFATLE_ESTABELECIMENTO_ID,
        ...changes as any,
      });
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } finally {
      setSavingUserId(null);
    }
  };

  // Ação em massa
  const handleBulkAction = async () => {
    if (!dadosSafatle) return;
    const value = bulkAction === "enable_all" ? "sim" : "nao";
    
    for (const user of filteredUsers) {
      const changes: Record<string, string> = {};
      for (const mod of MODULOS_SAFATLE) {
        changes[mod.key] = value;
      }
      try {
        await upsertMutation.mutateAsync({
          userId: user.id,
          estabelecimentoId: SAFATLE_ESTABELECIMENTO_ID,
          ...changes as any,
        });
      } catch {
        // continue
      }
    }
    setPendingChanges({});
    setShowBulkDialog(false);
    toast.success(`Permissões ${bulkAction === "enable_all" ? "habilitadas" : "desabilitadas"} para ${filteredUsers.length} usuários`);
  };

  // Contar módulos ativos por usuário
  const countActiveModules = (userId: number): number => {
    return MODULOS_SAFATLE.filter(m => getPermValue(userId, m.key)).length;
  };

  if (loadingDados) {
    return (
      <DashboardLayout>
        <div className="container py-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-500" />
              Permissões Safatle
            </h1>
            <p className="text-muted-foreground mt-1">
              Controle de acesso granular aos módulos do Painel Executivo Safatle
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setBulkAction("enable_all"); setShowBulkDialog(true); }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Liberar Todos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setBulkAction("disable_all"); setShowBulkDialog(true); }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Bloquear Todos
            </Button>
          </div>
        </div>

        {/* Legenda dos módulos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Módulos Disponíveis</CardTitle>
            <CardDescription>Módulos do Painel Executivo que podem ser controlados por usuário</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {MODULOS_SAFATLE.map(mod => {
                const Icon = mod.icon;
                return (
                  <div key={mod.key} className="flex items-center gap-2 text-sm">
                    <Icon className={`h-4 w-4 ${mod.color} shrink-0`} />
                    <span className="truncate">{mod.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabela de usuários */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Usuário</TableHead>
                  <TableHead className="w-[120px] text-center">Módulos Ativos</TableHead>
                  {MODULOS_SAFATLE.map(mod => {
                    const Icon = mod.icon;
                    return (
                      <TableHead key={mod.key} className="text-center w-[80px]" title={mod.label}>
                        <div className="flex flex-col items-center gap-1">
                          <Icon className={`h-4 w-4 ${mod.color}`} />
                          <span className="text-[10px] leading-tight">{mod.label.split(" ")[0]}</span>
                        </div>
                      </TableHead>
                    );
                  })}
                  <TableHead className="w-[100px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={MODULOS_SAFATLE.length + 3} className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user: any) => {
                    const activeCount = countActiveModules(user.userId);
                    const hasChanges = hasPendingChanges(user.userId);
                    const isSaving = savingUserId === user.userId;

                    return (
                      <TableRow 
                        key={user.userId} 
                        className={hasChanges ? "bg-yellow-500/5" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {user.userName?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{user.userName || "Sem nome"}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.userEmail}</p>
                            </div>
                            {user.userRole === "admin" && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">Admin</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={activeCount === MODULOS_SAFATLE.length ? "default" : activeCount === 0 ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {activeCount}/{MODULOS_SAFATLE.length}
                          </Badge>
                        </TableCell>
                        {MODULOS_SAFATLE.map(mod => (
                          <TableCell key={mod.key} className="text-center">
                            <Switch
                              checked={getPermValue(user.userId, mod.key)}
                              onCheckedChange={() => togglePermission(user.userId, mod.key)}
                              className="mx-auto"
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {hasChanges && (
                            <Button
                              size="sm"
                              onClick={() => saveUserPermissions(user.userId)}
                              disabled={isSaving}
                              className="h-7 text-xs"
                            >
                              {isSaving ? (
                                <span className="animate-spin mr-1">⏳</span>
                              ) : (
                                <Save className="h-3 w-3 mr-1" />
                              )}
                              Salvar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{filteredUsers.length}</div>
              <p className="text-xs text-muted-foreground">Total de Usuários</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-500">
                {filteredUsers.filter((u: any) => countActiveModules(u.userId) === MODULOS_SAFATLE.length).length}
              </div>
              <p className="text-xs text-muted-foreground">Acesso Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-yellow-500">
                {filteredUsers.filter((u: any) => {
                  const c = countActiveModules(u.userId);
                  return c > 0 && c < MODULOS_SAFATLE.length;
                }).length}
              </div>
              <p className="text-xs text-muted-foreground">Acesso Parcial</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-red-500">
                {filteredUsers.filter((u: any) => countActiveModules(u.userId) === 0).length}
              </div>
              <p className="text-xs text-muted-foreground">Sem Acesso</p>
            </CardContent>
          </Card>
        </div>

        {/* Dialog de ação em massa */}
        <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {bulkAction === "enable_all" ? "Liberar Todos os Módulos" : "Bloquear Todos os Módulos"}
              </DialogTitle>
              <DialogDescription>
                {bulkAction === "enable_all" 
                  ? `Isso vai liberar acesso a todos os módulos Safatle para ${filteredUsers.length} usuários.`
                  : `Isso vai bloquear acesso a todos os módulos Safatle para ${filteredUsers.length} usuários.`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Usuários afetados: <strong>{filteredUsers.length}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Módulos: <strong>{MODULOS_SAFATLE.length}</strong>
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancelar</Button>
              <Button 
                variant={bulkAction === "enable_all" ? "default" : "destructive"}
                onClick={handleBulkAction}
              >
                {bulkAction === "enable_all" ? "Liberar Todos" : "Bloquear Todos"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
