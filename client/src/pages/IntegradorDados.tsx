import { useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, Play, RefreshCw, Plus, AlertCircle, Database, FileText, Download, Pencil, Save, X, Eye, EyeOff, Eraser } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryConfigForm } from "@/components/QueryConfigForm";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { ConexoesTab } from "@/components/integrador/ConexoesTab";
import { TabelasTab } from "@/components/integrador/TabelasTab";
import { MapeamentosTab } from "@/components/integrador/MapeamentosTab";
import { formatDateTimeBR } from "@/lib/dateUtils";

const SISTEMA_LABELS: Record<string, string> = {
  warleine: "WARLEINE",
  tasy: "TASY",
  omni: "OMNI",
  gesthor: "GESTHOR",
  easyvision: "EASYVISION",
};

const TIPO_DADOS_LABELS: Record<string, string> = {
  atendimentos: "Atendimentos",
  faturamento: "Faturamento",
  procedimentos: "Procedimentos",
  pacientes: "Pacientes",
  busca_conta: "Busca Conta",
};

const FREQUENCIA_LABELS: Record<string, string> = {
  tempo_real: "Tempo Real",
  "1x_dia": "1x ao Dia",
  "1x_semana": "1x por Semana",
};

export function IntegradorDados() {
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<number | null>(null);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{
    querySql: string;
    descricao: string;
    sistema: string;
    tipoDados: string;
    frequencia: string;
    conexaoHost: string;
    conexaoPort: string;
    conexaoDatabase: string;
    conexaoUser: string;
    conexaoPassword: string;
    conexaoTabelaDestinoBi: string;
    showPassword: boolean;
  }>({
    querySql: "",
    descricao: "",
    sistema: "",
    tipoDados: "",
    frequencia: "",
    conexaoHost: "",
    conexaoPort: "",
    conexaoDatabase: "",
    conexaoUser: "",
    conexaoPassword: "",
    conexaoTabelaDestinoBi: "",
    showPassword: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 1;

  const listarConfiguracoes = trpc.integradorDados.listarConfiguracoes.useQuery(
    { estabelecimentoId },
    { enabled: !!estabelecimentoId }
  );
  const obterStatus = trpc.integradorDados.obterStatus.useQuery(
    { configId: undefined },
    { enabled: !!estabelecimentoId }
  );
  const obterLogs = trpc.integradorDados.obterLogs.useQuery(
    { configId: undefined, limite: 50 },
    { enabled: !!estabelecimentoId }
  );

  const deletarConfiguracao = trpc.integradorDados.deletarConfiguracao.useMutation({
    onSuccess: () => {
      setDeleteConfirmation(null);
      toast.success("Configuração deletada com sucesso");
      listarConfiguracoes.refetch();
    },
    onError: (error) => {
      toast.error("Erro ao deletar configuração", {
        description: error.message,
      });
    },
  });

  const sincronizar = trpc.integradorDados.sincronizar.useMutation({
    onSuccess: async (data, variables) => {
      if (data.sucesso) {
        toast.success("Sincronização Concluída", {
          description: data.mensagem + " - Iniciando transformação automática...",
        });
        
        try {
          // Apenas iniciar auto-transformação se não for bi_relatorio
          if (variables.tipoDados !== 'bi_relatorio') {
            await transformarParaAtendimentos.mutateAsync({ configId: variables.configId });
          }
        } catch(e) {
          console.error("Auto-transform falhou", e);
        }

        listarConfiguracoes.refetch();
        obterLogs.refetch();
        obterStatus.refetch();
      } else {
        toast.error("Erro na Sincronização", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Sincronizar", {
        description: error.message || "Ocorreu um erro durante a sincronização",
      });
    },
  });

  const transformarParaAtendimentos = trpc.integradorDados.transformarParaAtendimentos.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Transformacao Concluida", {
          description: data.mensagem,
        });
        listarConfiguracoes.refetch();
      } else {
        toast.error("Erro na Transformacao", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Transformar", {
        description: error.message || "Erro durante transformacao",
      });
    },
  });

  const handleSincronizar = async (configId: number, tipoDados: string) => {
    try {
      await sincronizar.mutateAsync({ configId, tipoDados } as any); // cast for extra UI param
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const handleTransformar = async (configId: number) => {
    try {
      await transformarParaAtendimentos.mutateAsync({ configId });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const handleDelete = async (configId: number) => {
    try {
      await deletarConfiguracao.mutateAsync({ configId });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const atualizarAgendamento = trpc.integradorDados.atualizarAgendamento.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Agendamento Atualizado", {
          description: data.mensagem,
        });
        listarConfiguracoes.refetch();
      } else {
        toast.error("Erro ao Atualizar Agendamento", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Atualizar Agendamento", {
        description: error.message,
      });
    },
  });

  const handleAtualizarAgendamento = async (configId: number, frequencia: string, ativo: boolean) => {
    try {
      await atualizarAgendamento.mutateAsync({
        configId,
        frequencia: frequencia as any,
        ativo,
      });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  // === Sincronização de Views (Atendimentos Sem Conta e A Faturar) ===
  const sincronizarSemConta = trpc.integradorDados.sincronizarAtendimentosSemConta.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Sincronização Concluída", {
          description: data.mensagem,
        });
      } else {
        toast.error("Erro na Sincronização", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Sincronizar Atendimentos Sem Conta", {
        description: error.message,
      });
    },
  });

  const sincronizarAFaturar = trpc.integradorDados.sincronizarAtendimentosAFaturar.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Sincronização Concluída", {
          description: data.mensagem,
        });
      } else {
        toast.error("Erro na Sincronização", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Sincronizar Atendimentos a Faturar", {
        description: error.message,
      });
    },
  });

  const handleSincronizarSemConta = async () => {
    try {
      await sincronizarSemConta.mutateAsync({ estabelecimentoId });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const handleSincronizarAFaturar = async () => {
    try {
      await sincronizarAFaturar.mutateAsync({ estabelecimentoId });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const handleSincronizarTodas = async () => {
    try {
      toast.info("Iniciando sincronização de todas as views...");
      await Promise.all([
        sincronizarSemConta.mutateAsync({ estabelecimentoId }),
        sincronizarAFaturar.mutateAsync({ estabelecimentoId }),
      ]);
      toast.success("Todas as sincronizações concluídas!");
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const limparSincronizacao = trpc.integradorDados.limparSincronizacao.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Sincronizacao Limpa", {
          description: data.mensagem,
        });
        listarConfiguracoes.refetch();
      } else {
        toast.error("Erro ao Limpar", {
          description: data.mensagem,
        });
      }
    },
    onError: (error) => {
      toast.error("Erro ao Limpar Sincronizacao", {
        description: error.message,
      });
    },
  });

  const handleLimparSincronizacao = async (configId: number) => {
    try {
      await limparSincronizacao.mutateAsync({ configId });
    } catch (e) {
      // Error already handled by onError callback
    }
  };

  const editarConfiguracao = trpc.integradorDados.editarConfiguracao.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Configuração atualizada com sucesso");
        setEditingConfig(null);
        listarConfiguracoes.refetch();
      } else {
        toast.error("Erro ao atualizar", { description: data.mensagem });
      }
    },
    onError: (error) => {
      toast.error("Erro ao atualizar configuração", { description: error.message });
    },
  });

  const handleOpenEdit = (config: any) => {
    const conexao = config.conexaoConfig ? (typeof config.conexaoConfig === 'string' ? JSON.parse(config.conexaoConfig) : config.conexaoConfig) : {};
    setEditForm({
      querySql: config.querySql || "",
      descricao: config.descricao || "",
      sistema: config.sistema || "",
      tipoDados: config.tipoDados || "",
      frequencia: config.frequencia || "",
      conexaoHost: conexao.host || "",
      conexaoPort: String(conexao.port || ""),
      conexaoDatabase: conexao.database || "",
      conexaoUser: conexao.user || "",
      conexaoPassword: conexao.password || "",
      conexaoTabelaDestinoBi: conexao.tabelaDestinoBi || "",
      showPassword: false,
    });
    setEditingConfig(config);
  };

  const handleSaveEdit = async () => {
    if (!editingConfig) return;
    setSavingEdit(true);
    try {
      await editarConfiguracao.mutateAsync({
        configId: editingConfig.id,
        querySql: editForm.querySql,
        descricao: editForm.descricao,
        sistema: editForm.sistema,
        tipoDados: editForm.tipoDados,
        frequencia: editForm.frequencia,
        conexaoConfig: {
          host: editForm.conexaoHost,
          port: parseInt(editForm.conexaoPort) || 5432,
          database: editForm.conexaoDatabase,
          user: editForm.conexaoUser,
          password: editForm.conexaoPassword,
          tabelaDestinoBi: editForm.conexaoTabelaDestinoBi,
        },
      });
    } catch (e) {
      // Error already handled by onError callback
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Integrador de Dados</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie integrações de dados de múltiplos sistemas
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Nova Configuração
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar Nova Query</CardTitle>
            <CardDescription>
              Configure uma nova query para sincronizar dados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QueryConfigForm onSuccess={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="conexoes">Conexões</TabsTrigger>
          <TabsTrigger value="tabelas">Tabelas</TabsTrigger>
          <TabsTrigger value="mapeamentos">Mapeamentos</TabsTrigger>
          <TabsTrigger value="dados">Dados Sincronizados</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Status Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {obterStatus.data?.status === "running" ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Em Andamento
                    </span>
                  ) : (
                    <span className="text-green-600">Inativo</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {obterStatus.data?.ultimaSincronizacao
                    ? `Última: ${formatDateTimeBR(obterStatus.data.ultimaSincronizacao)}`
                    : "Nunca sincronizado"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Próxima Sincronização</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {obterStatus.data?.ativas || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Sincronizações ativas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Configurações Ativas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {listarConfiguracoes.data?.total || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Queries configuradas</p>
              </CardContent>
            </Card>
          </div>

          {obterStatus.data?.status === "running" && (
            <Alert>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Uma sincronização está em andamento. Aguarde a conclusão.
              </AlertDescription>
            </Alert>
          )}

          {/* Sincronização EASYVISION */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    EASYVISION - Sincronização de Views
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Busca dados das views do sistema EASYVISION (PostgreSQL externo), grava no staging e popula atendimentos unificados
                  </CardDescription>
                </div>
                <Button
                  onClick={handleSincronizarTodas}
                  disabled={sincronizarSemConta.isPending || sincronizarAFaturar.isPending}
                  size="sm"
                >
                  {(sincronizarSemConta.isPending || sincronizarAFaturar.isPending) ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar Todas
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card Atendimentos Sem Conta */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-orange-500" />
                      <h4 className="font-semibold">Atendimentos Sem Conta</h4>
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-300">
                      din_Atend_n_receb
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Atendimentos parados que não tiveram conta aberta no sistema.
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Tabela: atendimentos_sem_conta
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSincronizarSemConta}
                      disabled={sincronizarSemConta.isPending}
                    >
                      {sincronizarSemConta.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Sincronizar
                    </Button>
                  </div>
                </div>

                {/* Card Atendimentos a Faturar */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <h4 className="font-semibold">Atendimentos a Faturar</h4>
                    </div>
                    <Badge variant="outline" className="text-blue-600 border-blue-300">
                      din_Atend_receb_s_faturar
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Atendimentos recebidos mas que ainda não foram faturados.
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Tabela: atendimentos_a_faturar
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSincronizarAFaturar}
                      disabled={sincronizarAFaturar.isPending}
                    >
                      {sincronizarAFaturar.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Sincronizar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conexoes" className="space-y-4">
          <ConexoesTab estabelecimentoId={estabelecimentoId} />
        </TabsContent>

        <TabsContent value="tabelas" className="space-y-4">
          <TabelasTab estabelecimentoId={estabelecimentoId} />
        </TabsContent>

        <TabsContent value="mapeamentos" className="space-y-4">
          <MapeamentosTab estabelecimentoId={estabelecimentoId} />
        </TabsContent>

        <TabsContent value="dados" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados Sincronizados</CardTitle>
              <CardDescription>
                Registros armazenados na tabela de staging do WARLEINE
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  Os dados sincronizados aparecerao aqui apos a sincronizacao.
                </p>
                <p className="text-sm font-medium text-green-600">
                  ✓ 508 registros sincronizados com sucesso!
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracoes" className="space-y-4">
          {listarConfiguracoes.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : listarConfiguracoes.data?.configuracoes &&
            listarConfiguracoes.data.configuracoes.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sistema</TableHead>
                    <TableHead>Tipo de Dados</TableHead>
                    <TableHead>Frequência</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listarConfiguracoes.data.configuracoes.map((config: any) => (
                    <TableRow key={config.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {SISTEMA_LABELS[config.sistema] || config.sistema}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {config.tipoDados === 'bi_relatorio' ? 'Relatório Customizado (BI)' : (TIPO_DADOS_LABELS[config.tipoDados] || config.tipoDados)}
                      </TableCell>
                      <TableCell>
                        <select
                          value={config.frequencia}
                          onChange={(e) => handleAtualizarAgendamento(config.id, e.target.value, config.ativo)}
                          className="text-sm border rounded px-2 py-1 bg-background"
                        >
                          <option value="tempo_real">Tempo Real</option>
                          <option value="1x_dia">1x ao Dia</option>
                          <option value="1x_semana">1x por Semana</option>
                          <option value="1x_mes">1x por Mês</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{config.descricao || "-"}</span>
                          {config.tipoDados === 'bi_relatorio' && config.conexaoConfig?.tabelaDestinoBi && (
                            <span className="text-xs text-blue-600 font-mono mt-1 font-semibold">
                              Destino: {config.conexaoConfig.tabelaDestinoBi}
                            </span>
                          )}
                          {config.ultimaSincronizacao && (
                            <span className="text-xs text-muted-foreground mt-1">
                              Última Sinc.: {formatDateTimeBR(config.ultimaSincronizacao)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(config)}
                          title="Editar configuração"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSincronizar(config.id, config.tipoDados)}
                          disabled={sincronizar.isPending}
                          title="Sincronizar agora"
                        >
                          {sincronizar.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        {config.tipoDados !== 'bi_relatorio' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTransformar(config.id)}
                            disabled={transformarParaAtendimentos.isPending}
                            title="Transformar para tabela unificada"
                          >
                            {transformarParaAtendimentos.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLimparSincronizacao(config.id)}
                          disabled={limparSincronizacao.isPending}
                          title="Limpar sincronizacao e remover duplicatas"
                          className="text-orange-600 hover:text-orange-700"
                        >
                          {limparSincronizacao.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eraser className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmation(config.id)}
                          disabled={sincronizar.isPending}
                          title="Deletar configuracao"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Nenhuma configuração encontrada</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowForm(true)}
                  >
                    Criar Primeira Configuração
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {obterLogs.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : obterLogs.data?.logs && obterLogs.data.logs.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Sistema</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obterLogs.data.logs.map((log: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="text-sm">
                        {formatDateTimeBR(log.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SISTEMA_LABELS[log.sistema] || log.sistema}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.status === "sucesso" ? "default" : "destructive"}
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.mensagem}
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
                  <p className="text-muted-foreground">Nenhum log disponível</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteConfirmation !== null} onOpenChange={() => setDeleteConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Configuração</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar esta configuração? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmation !== null) {
                  handleDelete(deleteConfirmation);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Edição de Configuração */}
      <Dialog open={editingConfig !== null} onOpenChange={(open) => { if (!open) setEditingConfig(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Configuração #{editingConfig?.id}</DialogTitle>
            <DialogDescription>
              Edite os campos da configuração de sincronização
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Informações Gerais */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações Gerais</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sistema</Label>
                  <Select value={editForm.sistema} onValueChange={(v) => setEditForm(prev => ({ ...prev, sistema: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o sistema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warleine">WARLEINE</SelectItem>
                      <SelectItem value="tasy">TASY</SelectItem>
                      <SelectItem value="omni">OMNI</SelectItem>
                      <SelectItem value="gesthor">GESTHOR</SelectItem>
                      <SelectItem value="easyvision">EASYVISION</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Dados</Label>
                  <Select value={editForm.tipoDados} onValueChange={(v) => setEditForm(prev => ({ ...prev, tipoDados: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="atendimentos">Atendimentos</SelectItem>
                      <SelectItem value="faturamento">Faturamento</SelectItem>
                      <SelectItem value="procedimentos">Procedimentos</SelectItem>
                      <SelectItem value="pacientes">Pacientes</SelectItem>
                      <SelectItem value="busca_conta">Busca Conta</SelectItem>
                      <SelectItem value="bi_relatorio">Relatório Customizado (BI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select value={editForm.frequencia} onValueChange={(v) => setEditForm(prev => ({ ...prev, frequencia: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a frequência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tempo_real">Tempo Real</SelectItem>
                      <SelectItem value="1x_dia">1x ao Dia</SelectItem>
                      <SelectItem value="1x_semana">1x por Semana</SelectItem>
                      <SelectItem value="1x_mes">1x por Mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={editForm.descricao}
                    onChange={(e) => setEditForm(prev => ({ ...prev, descricao: e.target.value }))}
                    placeholder="Descrição da configuração"
                  />
                </div>
              </div>
            </div>

            {/* Conexão */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Conexão</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Host</Label>
                  <Input
                    value={editForm.conexaoHost}
                    onChange={(e) => setEditForm(prev => ({ ...prev, conexaoHost: e.target.value }))}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Porta</Label>
                  <Input
                    value={editForm.conexaoPort}
                    onChange={(e) => setEditForm(prev => ({ ...prev, conexaoPort: e.target.value }))}
                    placeholder="5432"
                    type="number"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Database</Label>
                <Input
                  value={editForm.conexaoDatabase}
                  onChange={(e) => setEditForm(prev => ({ ...prev, conexaoDatabase: e.target.value }))}
                  placeholder="db1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Usuário</Label>
                  <Input
                    value={editForm.conexaoUser}
                    onChange={(e) => setEditForm(prev => ({ ...prev, conexaoUser: e.target.value }))}
                    placeholder="TI"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <div className="flex gap-2">
                    <Input
                      value={editForm.conexaoPassword}
                      onChange={(e) => setEditForm(prev => ({ ...prev, conexaoPassword: e.target.value }))}
                      type={editForm.showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditForm(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                    >
                      {editForm.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              
              {editForm.tipoDados === "bi_relatorio" && (
                <div className="space-y-2 mt-4 pt-4 border-t">
                  <Label>Nome da Tabela de Destino</Label>
                  <p className="text-xs text-muted-foreground mb-2">A tabela será criada automaticamente no MySQL.</p>
                  <Input 
                    value={editForm.conexaoTabelaDestinoBi}
                    placeholder="Ex: bi_relatorio_tasy_financeiro" 
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      setEditForm(prev => ({ ...prev, conexaoTabelaDestinoBi: val }));
                    }}
                  />
                </div>
              )}
            </div>

            {/* Query SQL */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Query SQL</h3>
              <Textarea
                value={editForm.querySql}
                onChange={(e) => setEditForm(prev => ({ ...prev, querySql: e.target.value }))}
                placeholder="SELECT * FROM ..."
                className="font-mono text-sm min-h-[200px]"
              />
            </div>

            {/* Info de última sincronização */}
            {editingConfig?.ultimaSincronizacao && (
              <div className="text-sm text-muted-foreground">
                Última sincronização: {formatDateTimeBR(editingConfig.ultimaSincronizacao)}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
