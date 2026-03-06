import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Plus, Trash2, Play, ArrowRight, GitBranch, RotateCcw, Zap, RefreshCw, Info, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface MapeamentosTabProps {
  estabelecimentoId: number;
}

const FREQUENCIA_LABELS: Record<string, string> = {
  manual: "Manual",
  "5min": "A cada 5 min",
  "15min": "A cada 15 min",
  "30min": "A cada 30 min",
  "1hora": "A cada 1 hora",
  "6horas": "A cada 6 horas",
  "12horas": "A cada 12 horas",
  diario: "Diário",
};

interface CampoMapeamento {
  colunaOrigemNome: string;
  colunaDestinoId: number;
  transformacao?: string;
}

export function MapeamentosTab({ estabelecimentoId }: MapeamentosTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [conexaoOrigemId, setConexaoOrigemId] = useState<number>(0);
  const [tabelaDestinoId, setTabelaDestinoId] = useState<number>(0);
  const [queryOrigem, setQueryOrigem] = useState("");
  const [campoChave, setCampoChave] = useState("");
  const [frequencia, setFrequencia] = useState("manual");
  const [modoImportacao, setModoImportacao] = useState<"completa" | "incremental">("completa");
  const [colunaControle, setColunaControle] = useState("");
  const [campos, setCampos] = useState<CampoMapeamento[]>([]);

  const mapeamentos = trpc.integradorDados.mapeamentos.listar.useQuery({ estabelecimentoId });
  const conexoes = trpc.integradorDados.conexoes.listar.useQuery({ estabelecimentoId });
  const tabelas = trpc.integradorDados.tabelas.listar.useQuery({ estabelecimentoId });

  // Buscar detalhes do mapeamento para edição
  const mapeamentoDetalhe = trpc.integradorDados.mapeamentos.obter.useQuery(
    { id: editingId! },
    { enabled: editingId !== null && editingId > 0 }
  );

  // Buscar colunas da tabela de destino selecionada
  const tabelaDetalhe = trpc.integradorDados.tabelas.obter.useQuery(
    { id: tabelaDestinoId },
    { enabled: tabelaDestinoId > 0 }
  );

  const criarMapeamento = trpc.integradorDados.mapeamentos.criar.useMutation({
    onSuccess: () => {
      toast.success("Mapeamento criado com sucesso");
      resetForm();
      mapeamentos.refetch();
    },
    onError: (e) => toast.error("Erro ao criar mapeamento", { description: e.message }),
  });

  const atualizarMapeamento = trpc.integradorDados.mapeamentos.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Mapeamento atualizado com sucesso");
      resetForm();
      mapeamentos.refetch();
    },
    onError: (e) => toast.error("Erro ao atualizar mapeamento", { description: e.message }),
  });

  const excluirMapeamento = trpc.integradorDados.mapeamentos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Mapeamento excluído");
      setDeleteId(null);
      mapeamentos.refetch();
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message }),
  });

  const executarMapeamento = trpc.integradorDados.mapeamentos.executar.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        toast.success("Sincronização concluída", { description: data.mensagem });
        mapeamentos.refetch();
        syncLogs.refetch();
      } else {
        toast.error("Erro na sincronização", { description: data.mensagem });
      }
    },
    onError: (e) => toast.error("Erro ao executar", { description: e.message }),
  });

  const resetarIncremental = trpc.integradorDados.mapeamentos.resetarIncremental.useMutation({
    onSuccess: (data) => {
      toast.success("Controle incremental resetado", { description: data.mensagem });
      mapeamentos.refetch();
    },
    onError: (e) => toast.error("Erro ao resetar", { description: e.message }),
  });

  const syncLogs = trpc.integradorDados.sincronizacoesLog.listar.useQuery({ limite: 20 });

  // Preencher formulário quando os dados do mapeamento são carregados para edição
  useEffect(() => {
    if (editingId && mapeamentoDetalhe.data) {
      const m = mapeamentoDetalhe.data;
      setNome(m.nome || "");
      setDescricao(m.descricao || "");
      setConexaoOrigemId(m.conexaoOrigemId || 0);
      setTabelaDestinoId(m.tabelaDestinoId || 0);
      setQueryOrigem(m.queryOrigem || "");
      setCampoChave(m.campoChave || "");
      setFrequencia(m.frequencia || "manual");
      setModoImportacao(m.modoImportacao || "completa");
      setColunaControle(m.colunaControle || "");
      setCampos(m.campos?.map((c: any) => ({
        colunaOrigemNome: c.colunaOrigemNome,
        colunaDestinoId: c.colunaDestinoId,
        transformacao: c.transformacao || undefined,
      })) || []);
      setShowForm(true);
    }
  }, [editingId, mapeamentoDetalhe.data]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setNome("");
    setDescricao("");
    setConexaoOrigemId(0);
    setTabelaDestinoId(0);
    setQueryOrigem("");
    setCampoChave("");
    setFrequencia("manual");
    setModoImportacao("completa");
    setColunaControle("");
    setCampos([]);
  };

  const handleEditClick = (mapId: number) => {
    setEditingId(mapId);
  };

  const adicionarCampo = () => {
    setCampos([...campos, { colunaOrigemNome: "", colunaDestinoId: 0 }]);
  };

  const removerCampo = (idx: number) => {
    setCampos(campos.filter((_, i) => i !== idx));
  };

  const atualizarCampo = (idx: number, campo: keyof CampoMapeamento, valor: any) => {
    const novos = [...campos];
    (novos[idx] as any)[campo] = valor;
    setCampos(novos);
  };

  const handleSubmit = () => {
    if (!nome || !conexaoOrigemId || !tabelaDestinoId || !queryOrigem) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (modoImportacao === "incremental" && !colunaControle) {
      toast.error("Para importação incremental, informe a coluna de controle");
      return;
    }

    const camposValidos = campos.filter((c) => c.colunaOrigemNome && c.colunaDestinoId > 0);

    if (editingId) {
      // Atualizar mapeamento existente
      atualizarMapeamento.mutate({
        id: editingId,
        nome,
        descricao,
        queryOrigem,
        campoChave: campoChave || undefined,
        frequencia: frequencia as any,
        modoImportacao: modoImportacao as any,
        colunaControle: colunaControle || null,
        campos: camposValidos.length > 0 ? camposValidos : undefined,
      });
    } else {
      // Criar novo mapeamento
      criarMapeamento.mutate({
        nome,
        descricao,
        conexaoOrigemId,
        tabelaDestinoId,
        queryOrigem,
        campoChave: campoChave || undefined,
        frequencia: frequencia as any,
        estabelecimentoId,
        modoImportacao,
        colunaControle: colunaControle || undefined,
        campos: camposValidos.length > 0 ? camposValidos : undefined,
      });
    }
  };

  const isSubmitting = criarMapeamento.isPending || atualizarMapeamento.isPending;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Mapeamentos de Dados</h3>
            <p className="text-sm text-muted-foreground">
              Configure como os dados da origem são mapeados para as tabelas de destino
            </p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Mapeamento
          </Button>
        </div>

        {mapeamentos.data && mapeamentos.data.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Conexão Origem</TableHead>
                  <TableHead>Tabela Destino</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Sincronização</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapeamentos.data.map((map: any) => (
                  <TableRow key={map.id}>
                    <TableCell className="font-medium">
                      <div>
                        {map.nome}
                        {map.modoImportacao === "incremental" && map.ultimoValorControle && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Último: {map.ultimoValorControle}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {map.modoImportacao === "incremental" ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge className="bg-blue-600 hover:bg-blue-700 cursor-help">
                              <Zap className="w-3 h-3 mr-1" />
                              Incremental
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold">Importação Incremental</p>
                            <p className="text-xs mt-1">
                              Importa apenas registros novos/alterados desde a última sincronização.
                              {map.colunaControle && (
                                <> Coluna de controle: <code className="bg-muted px-1 rounded">{map.colunaControle}</code></>
                              )}
                            </p>
                            {map.totalRegistrosImportados > 0 && (
                              <p className="text-xs mt-1">
                                Total acumulado: {map.totalRegistrosImportados.toLocaleString()} registros
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant="outline">Completa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{map.conexaoNome || `#${map.conexaoOrigemId}`}</TableCell>
                    <TableCell className="text-sm">{map.tabelaNome || `#${map.tabelaDestinoId}`}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{FREQUENCIA_LABELS[map.frequencia] || map.frequencia}</Badge>
                    </TableCell>
                    <TableCell>
                      {map.ativo === "sim" ? (
                        <Badge className="bg-green-600">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {map.ultimaSincronizacao
                        ? new Date(map.ultimaSincronizacao).toLocaleString()
                        : map.ultimaExecucao
                          ? new Date(map.ultimaExecucao).toLocaleString()
                          : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {/* Botão Editar */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(map.id)}
                              disabled={editingId === map.id && mapeamentoDetalhe.isLoading}
                            >
                              {editingId === map.id && mapeamentoDetalhe.isLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Pencil className="w-3 h-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar mapeamento</TooltipContent>
                        </Tooltip>

                        {/* Botão Executar */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => executarMapeamento.mutate({ id: map.id })}
                              disabled={executarMapeamento.isPending}
                              title="Executar sincronização"
                            >
                              {executarMapeamento.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {map.modoImportacao === "incremental"
                              ? "Executar importação incremental"
                              : "Executar importação completa"}
                          </TooltipContent>
                        </Tooltip>

                        {/* Botão Forçar Completa (apenas para incrementais) */}
                        {map.modoImportacao === "incremental" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executarMapeamento.mutate({ id: map.id, forcarCompleta: true })}
                                disabled={executarMapeamento.isPending}
                              >
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Forçar importação completa (reimportar tudo)</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Botão Resetar Incremental */}
                        {map.modoImportacao === "incremental" && map.ultimoValorControle && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetarIncremental.mutate({ id: map.id })}
                                disabled={resetarIncremental.isPending}
                                className="text-orange-600"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Resetar controle incremental (próxima execução importa tudo)</TooltipContent>
                          </Tooltip>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteId(map.id)}
                          className="text-destructive"
                        >
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
                <GitBranch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum mapeamento cadastrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Primeiro crie uma conexão e uma tabela, depois crie um mapeamento para sincronizar os dados
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log de Sincronizações Recentes */}
        {syncLogs.data && syncLogs.data.length > 0 && (
          <Card>
            <div className="p-4">
              <h4 className="font-semibold mb-3">Últimas Sincronizações</h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Mapeamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Registros</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.data.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.iniciadoEm).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{log.mapeamentoNome || `#${log.mapeamentoId}`}</TableCell>
                        <TableCell>
                          {log.status === "sucesso" ? (
                            <Badge className="bg-green-600">Sucesso</Badge>
                          ) : log.status === "erro" ? (
                            <Badge variant="destructive">Erro</Badge>
                          ) : (
                            <Badge variant="secondary">{log.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{log.registrosProcessados || 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.finalizadoEm && log.iniciadoEm
                            ? `${((new Date(log.finalizadoEm).getTime() - new Date(log.iniciadoEm).getTime()) / 1000).toFixed(1)}s`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {log.mensagem || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Card>
        )}

        {/* Dialog de Criação/Edição de Mapeamento */}
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Mapeamento" : "Novo Mapeamento de Dados"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Altere a query SQL, frequência e outras configurações do mapeamento"
                  : "Configure a origem dos dados, a tabela de destino e o mapeamento de campos"}
              </DialogDescription>
            </DialogHeader>

            {editingId && mapeamentoDetalhe.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Carregando dados do mapeamento...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Info Básica */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Nome do Mapeamento *</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Atendimentos EASYVISION → Faturamento" />
                  </div>
                  <div className="col-span-2">
                    <Label>Descrição</Label>
                    <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional" />
                  </div>
                </div>

                {/* Origem e Destino */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Conexão de Origem *</Label>
                    <Select
                      value={String(conexaoOrigemId || "")}
                      onValueChange={(v) => setConexaoOrigemId(Number(v))}
                      disabled={!!editingId}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione a conexão" /></SelectTrigger>
                      <SelectContent>
                        {conexoes.data?.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingId && (
                      <p className="text-xs text-muted-foreground mt-1">Conexão e tabela não podem ser alteradas após criação</p>
                    )}
                  </div>
                  <div>
                    <Label>Tabela de Destino *</Label>
                    <Select
                      value={String(tabelaDestinoId || "")}
                      onValueChange={(v) => setTabelaDestinoId(Number(v))}
                      disabled={!!editingId}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione a tabela" /></SelectTrigger>
                      <SelectContent>
                        {tabelas.data?.map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.nomeExibicao}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Query SQL */}
                <div>
                  <Label>Query SQL de Origem *</Label>
                  <Textarea
                    value={queryOrigem}
                    onChange={(e) => setQueryOrigem(e.target.value)}
                    placeholder="SELECT * FROM tabela_origem WHERE ..."
                    className="font-mono text-sm min-h-[150px]"
                  />
                  {editingId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Edite a query SQL acima para alterar os dados que serão importados
                    </p>
                  )}
                </div>

                {/* Configurações */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Campo Chave (para upsert)</Label>
                    <Input value={campoChave} onChange={(e) => setCampoChave(e.target.value)} placeholder="Ex: id ou numatend" />
                  </div>
                  <div>
                    <Label>Frequência de Sincronização</Label>
                    <Select value={frequencia} onValueChange={setFrequencia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(FREQUENCIA_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Modo de Importação */}
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-500" />
                    <Label className="text-base font-semibold">Modo de Importação</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setModoImportacao("completa")}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        modoImportacao === "completa"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="font-medium text-sm">Completa</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Reimporta todos os registros a cada execução. Limpa os dados antigos antes de inserir.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoImportacao("incremental")}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        modoImportacao === "incremental"
                          ? "border-blue-500 bg-blue-500/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-500" />
                        Incremental
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Importa apenas registros novos/alterados desde a última sincronização. Mais rápido e eficiente.
                      </div>
                    </button>
                  </div>

                  {modoImportacao === "incremental" && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <Label className="flex items-center gap-1">
                          Coluna de Controle *
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Nome da coluna na query de origem usada para identificar registros novos. Deve ser um campo que cresce monotonicamente (ex: ID auto-increment, timestamp de criação/atualização).</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <Input
                          value={colunaControle}
                          onChange={(e) => setColunaControle(e.target.value)}
                          placeholder="Ex: id, updated_at, data_modificacao"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Use o nome exato da coluna como aparece na query SQL de origem.
                          Na primeira execução, todos os registros serão importados. Nas próximas, apenas os novos.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mapeamento de Campos */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">Mapeamento de Campos</Label>
                    <Button variant="outline" size="sm" onClick={adicionarCampo}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar Campo
                    </Button>
                  </div>

                  {campos.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-4">Campo Origem (SQL)</div>
                        <div className="col-span-1 text-center">→</div>
                        <div className="col-span-4">Coluna Destino</div>
                        <div className="col-span-2">Transformação</div>
                        <div className="col-span-1"></div>
                      </div>
                      {campos.map((campo, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4">
                            <Input
                              value={campo.colunaOrigemNome}
                              onChange={(e) => atualizarCampo(idx, "colunaOrigemNome", e.target.value)}
                              placeholder="nome_campo_origem"
                              className="text-sm font-mono"
                            />
                          </div>
                          <div className="col-span-1 text-center">
                            <ArrowRight className="w-4 h-4 mx-auto text-muted-foreground" />
                          </div>
                          <div className="col-span-4">
                            <Select
                              value={campo.colunaDestinoId ? String(campo.colunaDestinoId) : undefined}
                              onValueChange={(v) => atualizarCampo(idx, "colunaDestinoId", Number(v))}
                            >
                              <SelectTrigger className="text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {tabelaDetalhe.data?.colunas?.map((col: any) => (
                                  <SelectItem key={col.id} value={String(col.id)}>
                                    {col.nomeExibicao} ({col.nome})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={campo.transformacao || "none"}
                              onValueChange={(v) => atualizarCampo(idx, "transformacao", v === "none" ? undefined : v)}
                            >
                              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                <SelectItem value="UPPER">Maiúsculo</SelectItem>
                                <SelectItem value="LOWER">Minúsculo</SelectItem>
                                <SelectItem value="TRIM">Trim</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1">
                            <Button variant="ghost" size="sm" onClick={() => removerCampo(idx)} className="text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground border rounded-md">
                      Nenhum campo mapeado. Se não adicionar campos, todos os campos da query serão inseridos diretamente.
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                  <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingId ? "Salvar Alterações" : "Criar Mapeamento"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Exclusão */}
        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Mapeamento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este mapeamento? Os dados já sincronizados não serão afetados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && excluirMapeamento.mutate({ id: deleteId })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
