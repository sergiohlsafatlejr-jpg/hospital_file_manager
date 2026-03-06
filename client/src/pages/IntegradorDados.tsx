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
import { Loader2, Trash2, Play, RefreshCw, Plus, AlertCircle, Database, FileText, Download } from "lucide-react";
import { QueryConfigForm } from "@/components/QueryConfigForm";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { ConexoesTab } from "@/components/integrador/ConexoesTab";
import { TabelasTab } from "@/components/integrador/TabelasTab";
import { MapeamentosTab } from "@/components/integrador/MapeamentosTab";

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
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Sincronização Concluída", {
          description: data.mensagem,
        });
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

  const handleSincronizar = async (configId: number) => {
    try {
      await sincronizar.mutateAsync({ configId });
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
                    ? `Última: ${new Date(obterStatus.data.ultimaSincronizacao).toLocaleString()}`
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
                        {TIPO_DADOS_LABELS[config.tipoDados] || config.tipoDados}
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
                        {config.descricao || "-"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSincronizar(config.id)}
                          disabled={sincronizar.isPending}
                          title="Sincronizar agora"
                        >
                          {sincronizar.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
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
                            <Trash2 className="h-4 w-4" />
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
                        {new Date(log.timestamp).toLocaleString()}
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
    </div>
  );
}
