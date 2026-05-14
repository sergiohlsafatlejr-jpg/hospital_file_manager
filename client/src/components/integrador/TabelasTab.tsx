import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateUtils";
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
import { Loader2, Plus, Trash2, Eye, TableIcon, X, Wand2, Play, CheckCircle2, Database, RefreshCw, Zap, Info, Pencil, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface TabelasTabProps {
  estabelecimentoId: number;
}

const TIPOS_COLUNA = [
  { value: "varchar", label: "Texto (VARCHAR)" },
  { value: "int", label: "Inteiro (INT)" },
  { value: "bigint", label: "Inteiro Grande (BIGINT)" },
  { value: "decimal", label: "Decimal" },
  { value: "text", label: "Texto Longo (TEXT)" },
  { value: "date", label: "Data" },
  { value: "datetime", label: "Data e Hora" },
  { value: "boolean", label: "Sim/Não (BOOLEAN)" },
];

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

interface ColunaForm {
  nome: string;
  nomeExibicao: string;
  tipo: string;
  tamanho?: number;
  precisao?: number;
  obrigatorio: string;
  chaveUnica: string;
  valorPadrao?: string;
}

export function TabelasTab({ estabelecimentoId }: TabelasTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [showDados, setShowDados] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Estado para edição de query do mapeamento
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editMapeamento, setEditMapeamento] = useState<any>(null);
  const [editQuery, setEditQuery] = useState("");
  const [editModoImportacao, setEditModoImportacao] = useState<"completa" | "incremental">("completa");
  const [editColunaControle, setEditColunaControle] = useState("");
  const [editCampoChave, setEditCampoChave] = useState("");
  const [editFrequencia, setEditFrequencia] = useState("manual");

  // Form manual
  const [nomeTabela, setNomeTabela] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [descricao, setDescricao] = useState("");
  const [colunas, setColunas] = useState<ColunaForm[]>([
    { nome: "", nomeExibicao: "", tipo: "varchar", tamanho: 255, obrigatorio: "nao", chaveUnica: "nao" },
  ]);

  // Form automático
  const [autoConexaoId, setAutoConexaoId] = useState<string>("");
  const [autoQuery, setAutoQuery] = useState("");
  const [autoNome, setAutoNome] = useState("");
  const [autoNomeTecnico, setAutoNomeTecnico] = useState("");
  const [autoDescricao, setAutoDescricao] = useState("");
  const [autoModoImportacao, setAutoModoImportacao] = useState<"completa" | "incremental">("incremental");
  const [autoColunaControle, setAutoColunaControle] = useState("");
  const [autoCampoChave, setAutoCampoChave] = useState("");
  const [autoFrequencia, setAutoFrequencia] = useState("manual");
  const [camposDetectados, setCamposDetectados] = useState<Array<{ nome: string; tipo: string; exemplo: string | null }> | null>(null);
  const [amostraDados, setAmostraDados] = useState<Record<string, any>[] | null>(null);
  const [etapaAuto, setEtapaAuto] = useState<"query" | "preview" | "criando">("query");

  const tabelas = trpc.integradorDados.tabelas.listar.useQuery({ estabelecimentoId });
  const conexoes = trpc.integradorDados.conexoes.listar.useQuery();

  const dadosTabela = trpc.integradorDados.tabelas.consultarDados.useQuery(
    { id: showDados || 0, limite: 100, offset: 0 },
    { enabled: !!showDados }
  );

  const tabelaDetalhe = trpc.integradorDados.tabelas.obter.useQuery(
    { id: showDados || 0 },
    { enabled: !!showDados }
  );

  const criarTabela = trpc.integradorDados.tabelas.criar.useMutation({
    onSuccess: () => {
      toast.success("Tabela criada com sucesso");
      resetForm();
      tabelas.refetch();
    },
    onError: (e) => toast.error("Erro ao criar tabela", { description: e.message }),
  });

  const executarQueryMutation = trpc.integradorDados.conexoes.executarQuery.useMutation({
    onSuccess: (data) => {
      if (data.sucesso && data.campos && data.campos.length > 0) {
        setCamposDetectados(data.campos);
        setAmostraDados(data.amostra || null);
        setEtapaAuto("preview");
        toast.success(`${data.totalCampos} campos detectados automaticamente`);
      } else {
        toast.error("Nenhum campo detectado", { description: data.mensagem });
      }
    },
    onError: (e) => toast.error("Erro ao executar query", { description: e.message }),
  });

  const criarAPartirDeQuery = trpc.integradorDados.tabelas.criarAPartirDeQuery.useMutation({
    onSuccess: (data) => {
      const msgMapeamento = data.mapeamentoId
        ? " Mapeamento de sincronização salvo automaticamente!"
        : "";
      toast.success(`Tabela criada com ${data.camposDetectados} colunas.${msgMapeamento}`);
      resetAutoForm();
      tabelas.refetch();
    },
    onError: (e) => toast.error("Erro ao criar tabela", { description: e.message }),
  });

  // Polling de status para sincronizações em background
  const [syncEmAndamento, setSyncEmAndamento] = useState<{ syncId: number } | null>(null);

  const statusSincronizacao = trpc.integradorDados.tabelas.statusSincronizacao.useQuery(
    { syncId: syncEmAndamento?.syncId ?? 0 },
    { enabled: !!syncEmAndamento, refetchInterval: 3000 }
  );

  useEffect(() => {
    if (!syncEmAndamento || !statusSincronizacao.data) return;
    const { status, registrosInseridos, mensagem } = statusSincronizacao.data;
    if (status === "sucesso") {
      toast.success(`Sincronização concluída! ${registrosInseridos ?? 0} registros importados.`, { description: mensagem });
      setSyncEmAndamento(null);
      tabelas.refetch();
    } else if (status === "erro") {
      toast.error("Sincronização falhou", { description: mensagem || "Verifique os logs para detalhes." });
      setSyncEmAndamento(null);
      tabelas.refetch();
    }
  }, [statusSincronizacao.data, syncEmAndamento]);

  const sincronizarTabela = trpc.integradorDados.tabelas.sincronizarTabela.useMutation({
    onSuccess: (data) => {
      if (data.sucesso) {
        if ((data as any).emAndamento && (data as any).syncId) {
          setSyncEmAndamento({ syncId: (data as any).syncId });
          toast.info("Sincronização iniciada", { description: "Processando em background... Você será notificado ao concluir." });
        } else {
          toast.success("Sincronização concluída!", { description: data.mensagem });
          tabelas.refetch();
        }
      }
    },
    onError: (e) => toast.error("Erro na sincronização", { description: e.message }),
  });

  const excluirTabela = trpc.integradorDados.tabelas.excluir.useMutation({
    onSuccess: () => {
      toast.success("Tabela excluída");
      setDeleteId(null);
      tabelas.refetch();
    },
    onError: (e) => toast.error("Erro ao excluir", { description: e.message }),
  });

  const atualizarMapeamento = trpc.integradorDados.mapeamentos.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Configuração do mapeamento atualizada com sucesso!");
      setShowEditDialog(false);
      setEditMapeamento(null);
      tabelas.refetch();
    },
    onError: (e) => toast.error("Erro ao atualizar mapeamento", { description: e.message }),
  });

  const resetForm = () => {
    setShowForm(false);
    setNomeTabela("");
    setNomeExibicao("");
    setDescricao("");
    setColunas([{ nome: "", nomeExibicao: "", tipo: "varchar", tamanho: 255, obrigatorio: "nao", chaveUnica: "nao" }]);
  };

  const resetAutoForm = () => {
    setShowAutoForm(false);
    setAutoConexaoId("");
    setAutoQuery("");
    setAutoNome("");
    setAutoNomeTecnico("");
    setAutoDescricao("");
    setAutoModoImportacao("incremental");
    setAutoColunaControle("");
    setAutoCampoChave("");
    setAutoFrequencia("manual");
    setCamposDetectados(null);
    setAmostraDados(null);
    setEtapaAuto("query");
  };

  const adicionarColuna = () => {
    setColunas([...colunas, { nome: "", nomeExibicao: "", tipo: "varchar", tamanho: 255, obrigatorio: "nao", chaveUnica: "nao" }]);
  };

  const removerColuna = (idx: number) => {
    if (colunas.length <= 1) return;
    setColunas(colunas.filter((_, i) => i !== idx));
  };

  const atualizarColuna = (idx: number, campo: keyof ColunaForm, valor: any) => {
    const novas = [...colunas];
    (novas[idx] as any)[campo] = valor;
    if (campo === "nomeExibicao") {
      novas[idx].nome = valor
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    }
    setColunas(novas);
  };

  const handleSubmit = () => {
    if (!nomeTabela || !nomeExibicao) {
      toast.error("Nome da tabela e nome de exibição são obrigatórios");
      return;
    }
    const colunasValidas = colunas.filter((c) => c.nome && c.nomeExibicao && c.tipo);
    if (colunasValidas.length === 0) {
      toast.error("Adicione pelo menos uma coluna");
      return;
    }

    criarTabela.mutate({
      nome: nomeTabela,
      nomeExibicao,
      descricao,
      estabelecimentoId,
      colunas: colunasValidas.map((c) => ({
        nome: c.nome,
        nomeExibicao: c.nomeExibicao,
        tipo: c.tipo as any,
        tamanho: c.tamanho,
        precisao: c.precisao,
        obrigatorio: c.obrigatorio as any,
        chaveUnica: c.chaveUnica as any,
        valorPadrao: c.valorPadrao,
      })),
    });
  };

  const autoNomeTabela2 = (exibicao: string) => {
    setNomeExibicao(exibicao);
    setNomeTabela(
      exibicao
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
    );
  };

  const handleExecutarQuery = () => {
    if (!autoConexaoId || !autoQuery.trim()) {
      toast.error("Selecione uma conexão e informe a query SQL");
      return;
    }
    executarQueryMutation.mutate({
      id: Number(autoConexaoId),
      querySql: autoQuery,
      limite: 5,
    });
  };

  const handleCriarAutomatico = () => {
    if (!autoNome || !autoNomeTecnico) {
      toast.error("Informe o nome da tabela");
      return;
    }
    if (autoModoImportacao === "incremental" && !autoColunaControle) {
      toast.error("Para importação incremental, informe a coluna de controle");
      return;
    }
    setEtapaAuto("criando");
    criarAPartirDeQuery.mutate({
      conexaoId: Number(autoConexaoId),
      querySql: autoQuery,
      nomeTabela: autoNomeTecnico,
      nomeExibicao: autoNome,
      descricao: autoDescricao || undefined,
      estabelecimentoId,
      modoImportacao: autoModoImportacao,
      colunaControle: autoColunaControle || undefined,
      campoChave: autoCampoChave || undefined,
      frequencia: autoFrequencia as any,
    });
  };

  const autoGerarNomeTecnico = (exibicao: string) => {
    setAutoNome(exibicao);
    setAutoNomeTecnico(
      exibicao
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
    );
  };

  const tipoLabel = (tipo: string) => {
    const t = TIPOS_COLUNA.find(tc => tc.value === tipo);
    return t ? t.label : tipo;
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Tabelas de Destino</h3>
            <p className="text-sm text-muted-foreground">
              Crie e gerencie tabelas para armazenar os dados sincronizados
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { resetAutoForm(); setShowAutoForm(true); }}>
              <Wand2 className="w-4 h-4 mr-2" />
              Criar a partir de Query
            </Button>
            <Button onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Tabela Manual
            </Button>
          </div>
        </div>

        {tabelas.data && tabelas.data.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Nome Técnico</TableHead>
                  <TableHead>Colunas</TableHead>
                  <TableHead>Registros</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelas.data.map((tab: any) => (
                  <TabelaRow
                    key={tab.id}
                    tabela={tab}
                    onView={() => setShowDados(tab.id)}
                    onDelete={() => setDeleteId(tab.id)}
                    onSync={(forcarCompleta) => sincronizarTabela.mutate({ tabelaId: tab.id, forcarCompleta })}
                    onEdit={(mapeamentoData) => {
                      setEditMapeamento(mapeamentoData);
                      setEditQuery(mapeamentoData.queryOrigem || "");
                      setEditModoImportacao(mapeamentoData.modoImportacao || "completa");
                      setEditColunaControle(mapeamentoData.colunaControle || "");
                      setEditCampoChave(mapeamentoData.campoChave || "");
                      setEditFrequencia(mapeamentoData.frequencia || "manual");
                      setShowEditDialog(true);
                    }}
                    isSyncing={sincronizarTabela.isPending || !!syncEmAndamento}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <TableIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma tabela cadastrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique em "Criar a partir de Query" para detectar campos automaticamente ou "Nova Tabela Manual" para definir manualmente
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========== Dialog de Criação Automática a partir de Query ========== */}
        <Dialog open={showAutoForm} onOpenChange={(open) => { if (!open) resetAutoForm(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="w-5 h-5" />
                Criar Tabela a partir de Query
              </DialogTitle>
              <DialogDescription>
                Execute uma query SQL na conexão de origem. A tabela e o mapeamento de sincronização serão criados automaticamente.
              </DialogDescription>
            </DialogHeader>

            {/* Indicador de etapas */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                etapaAuto === "query" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
                Executar Query
              </div>
              <div className="w-8 h-px bg-border" />
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                etapaAuto === "preview" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
                Revisar e Configurar
              </div>
              <div className="w-8 h-px bg-border" />
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                etapaAuto === "criando" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">3</span>
                Criar Tabela
              </div>
            </div>

            {/* Etapa 1: Executar Query */}
            {etapaAuto === "query" && (
              <div className="space-y-4">
                <div>
                  <Label>Conexão de Origem *</Label>
                  <Select value={autoConexaoId} onValueChange={setAutoConexaoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conexão..." />
                    </SelectTrigger>
                    <SelectContent>
                      {conexoes.data?.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          <span className="flex items-center gap-2">
                            <Database className="w-3 h-3" />
                            {c.nome} ({c.tipo})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Query SQL *</Label>
                  <Textarea
                    value={autoQuery}
                    onChange={(e) => setAutoQuery(e.target.value)}
                    placeholder={"SELECT * FROM tabela_origem WHERE condição = 'valor'"}
                    className="font-mono text-sm min-h-[120px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    A query será executada com LIMIT 10 para detectar os campos. Não precisa incluir LIMIT.
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={resetAutoForm}>Cancelar</Button>
                  <Button
                    onClick={handleExecutarQuery}
                    disabled={executarQueryMutation.isPending || !autoConexaoId || !autoQuery.trim()}
                  >
                    {executarQueryMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Executar e Detectar Campos
                  </Button>
                </div>
              </div>
            )}

            {/* Etapa 2: Revisar Campos Detectados + Configurar Sincronização */}
            {etapaAuto === "preview" && camposDetectados && (
              <div className="space-y-4">
                {/* Nome da tabela */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome de Exibição *</Label>
                    <Input
                      value={autoNome}
                      onChange={(e) => autoGerarNomeTecnico(e.target.value)}
                      placeholder="Ex: Faturamento Recebido"
                    />
                  </div>
                  <div>
                    <Label>Nome Técnico (auto-gerado)</Label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground font-mono">integ_</span>
                      <Input
                        value={autoNomeTecnico}
                        onChange={(e) => setAutoNomeTecnico(e.target.value)}
                        className="font-mono"
                        placeholder="faturamento_recebido"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>Descrição</Label>
                    <Input
                      value={autoDescricao}
                      onChange={(e) => setAutoDescricao(e.target.value)}
                      placeholder="Descrição opcional da tabela"
                    />
                  </div>
                </div>

                {/* Configuração de Sincronização Automática */}
                <div className="border rounded-lg p-4 space-y-4 bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-500" />
                    <Label className="text-base font-semibold">Configuração de Sincronização</Label>
                    <Badge variant="outline" className="text-xs">Salva automaticamente</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">
                    A configuração de sincronização será salva junto com a tabela. Você poderá re-executar a importação a qualquer momento sem precisar recriar.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAutoModoImportacao("incremental")}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        autoModoImportacao === "incremental"
                          ? "border-blue-500 bg-blue-500/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-500" />
                        Incremental (Recomendado)
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Importa apenas registros novos/alterados. Mais rápido e eficiente.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoModoImportacao("completa")}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        autoModoImportacao === "completa"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="font-medium text-sm">Completa</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Reimporta todos os registros a cada execução.
                      </div>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {autoModoImportacao === "incremental" && (
                      <div>
                        <Label className="flex items-center gap-1 text-sm">
                          Coluna de Controle *
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Campo usado para identificar registros novos (ex: ID auto-increment, timestamp de atualização).</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <Select value={autoColunaControle} onValueChange={setAutoColunaControle}>
                          <SelectTrigger className="font-mono text-sm">
                            <SelectValue placeholder="Selecione o campo..." />
                          </SelectTrigger>
                          <SelectContent>
                            {camposDetectados.map((campo) => (
                              <SelectItem key={campo.nome} value={campo.nome}>
                                {campo.nome} ({campo.tipo})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="flex items-center gap-1 text-sm">
                        Campo Chave (upsert)
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-3 h-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Campo usado para evitar duplicatas. Se um registro com o mesmo valor já existir, será atualizado em vez de duplicado.</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Select value={autoCampoChave} onValueChange={setAutoCampoChave}>
                        <SelectTrigger className="font-mono text-sm">
                          <SelectValue placeholder="Opcional..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {camposDetectados.map((campo) => (
                            <SelectItem key={campo.nome} value={campo.nome}>
                              {campo.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm">Frequência de Sincronização</Label>
                      <Select value={autoFrequencia} onValueChange={setAutoFrequencia}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FREQUENCIA_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Campos detectados */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <Label className="text-base font-semibold">
                      {camposDetectados.length} Campos Detectados Automaticamente
                    </Label>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Campo</TableHead>
                          <TableHead>Tipo Detectado</TableHead>
                          <TableHead>Exemplo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {camposDetectados.map((campo, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{campo.nome}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {tipoLabel(campo.tipo)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                              {campo.exemplo || <span className="italic">NULL</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Amostra de dados */}
                {amostraDados && amostraDados.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Amostra de Dados ({amostraDados.length} registros)</Label>
                    <div className="rounded-md border overflow-x-auto max-h-[200px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(amostraDados[0]).map((col) => (
                              <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {amostraDados.map((row, idx) => (
                            <TableRow key={idx}>
                              {Object.values(row).map((val: any, cidx) => (
                                <TableCell key={cidx} className="text-xs whitespace-nowrap max-w-[150px] truncate">
                                  {val === null ? <span className="text-muted-foreground italic">NULL</span> : String(val)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => { setCamposDetectados(null); setAmostraDados(null); setEtapaAuto("query"); }}>
                    Voltar
                  </Button>
                  <Button
                    onClick={handleCriarAutomatico}
                    disabled={criarAPartirDeQuery.isPending || !autoNome || !autoNomeTecnico}
                  >
                    {criarAPartirDeQuery.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Criar Tabela e Salvar Sincronização
                  </Button>
                </div>
              </div>
            )}

            {/* Etapa 3: Criando */}
            {etapaAuto === "criando" && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Criando tabela, colunas e mapeamento de sincronização...</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ========== Dialog de Criação Manual ========== */}
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Nova Tabela (Manual)</DialogTitle>
              <DialogDescription>
                Defina o nome e as colunas da tabela que será criada no banco de dados
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome de Exibição *</Label>
                  <Input
                    value={nomeExibicao}
                    onChange={(e) => autoNomeTabela2(e.target.value)}
                    placeholder="Ex: Faturamento IPASGO"
                  />
                </div>
                <div>
                  <Label>Nome Técnico (auto-gerado)</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground font-mono">integ_</span>
                    <Input
                      value={nomeTabela}
                      onChange={(e) => setNomeTabela(e.target.value)}
                      className="font-mono"
                      placeholder="faturamento_ipasgo"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional da tabela" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Colunas</Label>
                  <Button variant="outline" size="sm" onClick={adicionarColuna}>
                    <Plus className="w-3 h-3 mr-1" /> Adicionar Coluna
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                    <div className="col-span-3">Nome Exibição</div>
                    <div className="col-span-2">Nome Técnico</div>
                    <div className="col-span-2">Tipo</div>
                    <div className="col-span-1">Tam.</div>
                    <div className="col-span-1">Obrig.</div>
                    <div className="col-span-1">Único</div>
                    <div className="col-span-1">Padrão</div>
                    <div className="col-span-1"></div>
                  </div>

                  {colunas.map((col, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <Input
                          value={col.nomeExibicao}
                          onChange={(e) => atualizarColuna(idx, "nomeExibicao", e.target.value)}
                          placeholder="Nome do campo"
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          value={col.nome}
                          onChange={(e) => atualizarColuna(idx, "nome", e.target.value)}
                          placeholder="campo"
                          className="text-sm font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <Select value={col.tipo} onValueChange={(v) => atualizarColuna(idx, "tipo", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPOS_COLUNA.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={col.tamanho || ""}
                          onChange={(e) => atualizarColuna(idx, "tamanho", Number(e.target.value) || undefined)}
                          placeholder="255"
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Select value={col.obrigatorio} onValueChange={(v) => atualizarColuna(idx, "obrigatorio", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nao">Não</SelectItem>
                            <SelectItem value="sim">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Select value={col.chaveUnica} onValueChange={(v) => atualizarColuna(idx, "chaveUnica", v)}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nao">Não</SelectItem>
                            <SelectItem value="sim">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1">
                        <Input
                          value={col.valorPadrao || ""}
                          onChange={(e) => atualizarColuna(idx, "valorPadrao", e.target.value)}
                          placeholder="-"
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removerColuna(idx)}
                          disabled={colunas.length <= 1}
                          className="text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={criarTabela.isPending}>
                  {criarTabela.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Tabela
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Visualização de Dados */}
        <Dialog open={showDados !== null} onOpenChange={(open) => { if (!open) setShowDados(null); }}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Dados da Tabela: {tabelaDetalhe.data?.nomeExibicao || "..."}
              </DialogTitle>
              <DialogDescription>
                {dadosTabela.data?.total || 0} registros encontrados
              </DialogDescription>
            </DialogHeader>
            {dadosTabela.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : dadosTabela.data?.dados && dadosTabela.data.dados.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(dadosTabela.data.dados[0]).map((col) => (
                        <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosTabela.data.dados.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        {Object.values(row).map((val: any, cidx: number) => (
                          <TableCell key={cidx} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                            {val === null ? <span className="text-muted-foreground italic">NULL</span> : String(val)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum dado encontrado nesta tabela
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ========== Dialog de Edição de Query/Mapeamento ========== */}
        <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditMapeamento(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5" />
                Editar Configuração de Sincronização
              </DialogTitle>
              <DialogDescription>
                Edite a query SQL e as configurações do mapeamento vinculado a esta tabela.
              </DialogDescription>
            </DialogHeader>

            {editMapeamento && (
              <div className="space-y-4">
                {/* Info do mapeamento */}
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Info className="w-4 h-4" />
                    <span>Mapeamento: <strong>{editMapeamento.nome}</strong> (ID: {editMapeamento.id})</span>
                  </div>
                </div>

                {/* Query SQL */}
                <div>
                  <Label className="text-sm font-medium">Query SQL de Origem</Label>
                  <Textarea
                    value={editQuery}
                    onChange={(e) => setEditQuery(e.target.value)}
                    placeholder="SELECT * FROM tabela_origem"
                    className="font-mono text-sm min-h-[180px] mt-1.5"
                  />
                </div>

                {/* Modo de Importação */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Modo de Importação</Label>
                    <Select value={editModoImportacao} onValueChange={(v) => setEditModoImportacao(v as "completa" | "incremental")}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="completa">Completa (reimporta tudo)</SelectItem>
                        <SelectItem value="incremental">Incremental (só novos)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Frequência</Label>
                    <Select value={editFrequencia} onValueChange={setEditFrequencia}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FREQUENCIA_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Coluna de Controle (só para incremental) */}
                {editModoImportacao === "incremental" && (
                  <div>
                    <Label className="text-sm font-medium">Coluna de Controle (para importação incremental)</Label>
                    <Input
                      value={editColunaControle}
                      onChange={(e) => setEditColunaControle(e.target.value)}
                      placeholder="Ex: id, updated_at, data_modificacao"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Campo usado para rastrear quais registros já foram importados. Deve ser um campo que cresce monotonicamente (ID auto-increment ou timestamp).
                    </p>
                  </div>
                )}

                {/* Campo Chave */}
                <div>
                  <Label className="text-sm font-medium">Campo Chave (opcional - para upsert)</Label>
                  <Input
                    value={editCampoChave}
                    onChange={(e) => setEditCampoChave(e.target.value)}
                    placeholder="Ex: id, protocolo"
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Se informado, registros com a mesma chave serão atualizados em vez de duplicados.
                  </p>
                </div>

                {/* Botões */}
                <div className="flex gap-3 justify-end pt-2">
                  <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditMapeamento(null); }}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      if (!editQuery.trim()) {
                        toast.error("A query SQL não pode estar vazia");
                        return;
                      }
                      if (editModoImportacao === "incremental" && !editColunaControle.trim()) {
                        toast.error("Para importação incremental, informe a coluna de controle");
                        return;
                      }
                      atualizarMapeamento.mutate({
                        id: editMapeamento.id,
                        queryOrigem: editQuery,
                        modoImportacao: editModoImportacao,
                        colunaControle: editModoImportacao === "incremental" ? editColunaControle : null,
                        campoChave: editCampoChave || undefined,
                        frequencia: editFrequencia as any,
                      });
                    }}
                    disabled={atualizarMapeamento.isPending}
                  >
                    {atualizarMapeamento.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>
                    )}
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
              <AlertDialogTitle>Excluir Tabela</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta tabela? Todos os dados armazenados nela serão perdidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && excluirTabela.mutate({ id: deleteId })}
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

// Componente de linha da tabela com verificação de mapeamento vinculado
function TabelaRow({ tabela, onView, onDelete, onSync, onEdit, isSyncing }: {
  tabela: any;
  onView: () => void;
  onDelete: () => void;
  onSync: (forcarCompleta: boolean) => void;
  onEdit: (mapeamentoData: any) => void;
  isSyncing: boolean;
}) {
  const mapeamento = trpc.integradorDados.tabelas.obterMapeamentoVinculado.useQuery(
    { tabelaId: tabela.id },
    { enabled: tabela.criadaNoBanco === "sim" }
  );

  const hasMapeamento = !!mapeamento.data;
  const isIncremental = mapeamento.data?.modoImportacao === "incremental";

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>
          {tabela.nomeExibicao}
          {hasMapeamento && (
            <div className="flex items-center gap-1 mt-0.5">
              {isIncremental ? (
                <Badge className="bg-blue-600 hover:bg-blue-700 text-[10px] px-1.5 py-0">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />
                  Incremental
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Completa</Badge>
              )}
              {mapeamento.data?.ultimaSincronizacao && (
                <span className="text-[10px] text-muted-foreground">
                  Última: {formatDateTimeBR(mapeamento.data.ultimaSincronizacao)}
                </span>
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm font-mono text-muted-foreground">integ_{tabela.nome}</TableCell>
      <TableCell>{tabela.totalColunas || 0}</TableCell>
      <TableCell>{tabela.totalRegistros?.toLocaleString() || 0}</TableCell>
      <TableCell>
        {tabela.criadaNoBanco === "sim" ? (
          <Badge className="bg-green-600">Ativa</Badge>
        ) : (
          <Badge variant="secondary">Pendente</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {tabela.criadaEm ? formatDateBR(tabela.criadaEm) : "-"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          {/* Botão Editar - só aparece se tem mapeamento vinculado */}
          {hasMapeamento && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(mapeamento.data)}
                  className="text-amber-600"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar query e configurações</TooltipContent>
            </Tooltip>
          )}
          {/* Botão Sincronizar - só aparece se tem mapeamento vinculado */}
          {hasMapeamento && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSync(false)}
                    disabled={isSyncing}
                    className="text-blue-600"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isIncremental ? "Sincronizar (incremental)" : "Sincronizar (completa)"}
                </TooltipContent>
              </Tooltip>
              {isIncremental && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSync(true)}
                      disabled={isSyncing}
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Forçar importação completa</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onView}>
                <Eye className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver dados</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive">
                <Trash2 className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir tabela</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
