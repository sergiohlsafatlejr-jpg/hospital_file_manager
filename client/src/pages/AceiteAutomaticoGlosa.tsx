import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Play, Search, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";

export default function AceiteAutomaticoGlosa() {

  const { estabelecimentoAtual } = useEstabelecimento();
  
  const [dialogAberto, setDialogAberto] = useState(false);
  const [buscaCodigo, setBuscaCodigo] = useState("");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");
  
  // Form state
  const [novoCodigoGlosa, setNovoCodigoGlosa] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoConvenioId, setNovoConvenioId] = useState<string>("todos");
  const [novoMotivoAceite, setNovoMotivoAceite] = useState("");
  
  // Queries
  const { data: padroes, refetch: refetchPadroes } = trpc.aceiteAutomatico.listar.useQuery(undefined);
  const { data: convenios } = trpc.faturamentoUnificado.listarConvenios.useQuery();
  const { data: codigosDisponiveis } = trpc.aceiteAutomatico.codigosDisponiveis.useQuery(
    { busca: buscaCodigo },
    { enabled: buscaCodigo.length >= 2 }
  );
  
  // Mutations
  const criarMutation = trpc.aceiteAutomatico.criar.useMutation({
    onSuccess: () => {
      toast.success("Padrão de aceite automático cadastrado com sucesso.");
      refetchPadroes();
      setDialogAberto(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
  
  const excluirMutation = trpc.aceiteAutomatico.excluir.useMutation({
    onSuccess: () => {
      toast.success("Padrão de aceite automático desativado.");
      refetchPadroes();
    },
  });
  
  const aplicarMutation = trpc.aceiteAutomatico.aplicarNosExistentes.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchPadroes();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
  
  const resetForm = () => {
    setNovoCodigoGlosa("");
    setNovaDescricao("");
    setNovoConvenioId("todos");
    setNovoMotivoAceite("");
    setBuscaCodigo("");
  };
  
  const handleCriar = () => {
    if (!novoCodigoGlosa) {
      toast.error("Informe o código da glosa.");
      return;
    }
    
    criarMutation.mutate({
      codigoGlosa: novoCodigoGlosa,
      descricaoGlosa: novaDescricao || undefined,
      convenioId: novoConvenioId !== "todos" ? Number(novoConvenioId) : null,
      estabelecimentoId: estabelecimentoAtual?.id || null,
      motivoAceite: novoMotivoAceite || undefined,
    });
  };
  
  const handleAplicarTodos = () => {
    if (!padroes || padroes.length === 0) {
      toast.warning("Nenhum padrão cadastrado para aplicar.");
      return;
    }
    aplicarMutation.mutate({
      estabelecimentoId: estabelecimentoAtual?.id,
    });
  };
  
  const handleSelecionarCodigo = (codigo: string, descricao: string) => {
    setNovoCodigoGlosa(codigo);
    setNovaDescricao(descricao);
    setBuscaCodigo("");
  };
  
  // Filtrar padrões
  const padroesFiltrados = useMemo(() => {
    if (!padroes) return [];
    return padroes.filter(p => {
      if (filtroConvenio !== "todos" && p.convenioId !== Number(filtroConvenio)) return false;
      return true;
    });
  }, [padroes, filtroConvenio]);
  
  // Buscar nome do convênio
  const nomeConvenio = (id: number | null) => {
    if (!id || !convenios) return "Todos";
    const conv = convenios.find((c: any) => c.id === id);
    return conv?.nome || `ID ${id}`;
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Aceite Automático de Glosa
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure quais códigos de glosa são automaticamente aceitos (sem necessidade de recurso).
              Quando um item glosado tiver um código cadastrado aqui, ele será marcado como aceito automaticamente.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleAplicarTodos}
              disabled={aplicarMutation.isPending || !padroes?.length}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {aplicarMutation.isPending ? "Aplicando..." : "Aplicar nos Existentes"}
            </Button>
            <Button onClick={() => setDialogAberto(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Padrão
            </Button>
          </div>
        </div>
        
        {/* Info Card */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">Como funciona:</p>
                <ul className="mt-1 space-y-1 list-disc list-inside text-blue-700 dark:text-blue-300">
                  <li>Cadastre os códigos de glosa que sua equipe já sabe que não terão recurso</li>
                  <li>Na próxima importação de arquivo, itens com esses códigos serão marcados como "aceita" automaticamente</li>
                  <li>Use "Aplicar nos Existentes" para marcar retroativamente itens já importados</li>
                  <li>Você pode configurar por convênio (ex: código 1708 aceito apenas no IPASGO)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Filtros */}
        <div className="flex gap-4 items-center">
          <div className="w-64">
            <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por convênio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {convenios?.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {padroesFiltrados.length} padrão(ões) cadastrado(s)
          </div>
        </div>
        
        {/* Lista de Padrões */}
        {padroesFiltrados.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum padrão de aceite automático cadastrado.</p>
              <p className="text-sm text-muted-foreground mt-1">Clique em "Novo Padrão" para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {padroesFiltrados.map((padrao) => (
              <Card key={padrao.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-base">{padrao.codigoGlosa}</span>
                        {padrao.descricaoGlosa && (
                          <span className="text-sm text-muted-foreground">- {padrao.descricaoGlosa}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {nomeConvenio(padrao.convenioId)}
                        </Badge>
                        {padrao.motivoAceite && (
                          <span className="text-xs text-muted-foreground italic">
                            Motivo: {padrao.motivoAceite}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      por {padrao.criadoPorNome || "Sistema"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => excluirMutation.mutate({ id: padrao.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Dialog para criar novo padrão */}
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Padrão de Aceite Automático</DialogTitle>
              <DialogDescription>
                Cadastre um código de glosa que será automaticamente aceito (sem recurso).
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Busca de código */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Código da Glosa *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar código ou descrição..."
                    value={buscaCodigo || novoCodigoGlosa}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBuscaCodigo(val);
                      if (!val) setNovoCodigoGlosa("");
                    }}
                    className="pl-9"
                  />
                </div>
                {/* Resultados da busca */}
                {buscaCodigo.length >= 2 && codigosDisponiveis && (codigosDisponiveis as any[]).length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {(codigosDisponiveis as any[]).map((item: any) => (
                      <button
                        key={item.codigo}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
                        onClick={() => handleSelecionarCodigo(item.codigo, item.descricao)}
                      >
                        <span className="font-mono font-medium">{item.codigo}</span>
                        <span className="text-muted-foreground text-xs truncate ml-2 max-w-[250px]">{item.descricao}</span>
                      </button>
                    ))}
                  </div>
                )}
                {novoCodigoGlosa && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Selecionado: <span className="font-mono font-bold">{novoCodigoGlosa}</span>
                    {novaDescricao && <span className="text-muted-foreground">- {novaDescricao}</span>}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Você também pode digitar o código diretamente se não encontrar na busca.
                </p>
                {!novoCodigoGlosa && buscaCodigo && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs"
                    onClick={() => {
                      setNovoCodigoGlosa(buscaCodigo);
                      setBuscaCodigo("");
                    }}
                  >
                    Usar "{buscaCodigo}" como código
                  </Button>
                )}
              </div>
              
              {/* Convênio */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio (opcional)</label>
                <Select value={novoConvenioId} onValueChange={setNovoConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Deixe "Todos" para aplicar em qualquer convênio, ou selecione um específico.
                </p>
              </div>
              
              {/* Motivo */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo do Aceite (opcional)</label>
                <Textarea
                  placeholder="Ex: Glosa administrativa sem possibilidade de recurso..."
                  value={novoMotivoAceite}
                  onChange={(e) => setNovoMotivoAceite(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Justificativa para auditoria do porquê essa glosa é aceita automaticamente.
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogAberto(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button onClick={handleCriar} disabled={criarMutation.isPending || !novoCodigoGlosa}>
                {criarMutation.isPending ? "Salvando..." : "Salvar Padrão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
