import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  X,
  Zap,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowLeftRight,
} from "lucide-react";

export default function MapeamentoConvenios() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabId = estabelecimentoAtual?.id;

  const [filtro, setFiltro] = useState<"todos" | "mapeados" | "naoMapeados">("todos");
  const [buscaNome, setBuscaNome] = useState("");

  // Queries
  const { data: sugestoes, isLoading: loadingSugestoes, refetch: refetchSugestoes } = 
    trpc.convenioMapeamento.sugerir.useQuery(
      { estabelecimentoId: estabId! },
      { enabled: !!estabId }
    );

  const { data: mapeamentos, isLoading: loadingMapeamentos, refetch: refetchMapeamentos } = 
    trpc.convenioMapeamento.listar.useQuery(
      { estabelecimentoId: estabId! },
      { enabled: !!estabId }
    );

  const { data: conveniosSafatle } = 
    trpc.convenioMapeamento.conveniosSafatle.useQuery({ estabelecimentoId: estabId! }, { enabled: !!estabId });

  const { data: estatisticas, refetch: refetchEstatisticas } = 
    trpc.convenioMapeamento.estatisticas.useQuery(
      { estabelecimentoId: estabId! },
      { enabled: !!estabId }
    );

  // Mutations
  const salvarMut = trpc.convenioMapeamento.salvar.useMutation({
    onSuccess: () => {
      toast.success("Mapeamento salvo com sucesso!");
      refetchAll();
    },
    onError: (err) => {
      toast.error("Erro ao salvar", { description: err.message });
    },
  });

  const removerMut = trpc.convenioMapeamento.remover.useMutation({
    onSuccess: () => {
      toast.success("Mapeamento removido");
      refetchAll();
    },
  });

  const aplicarAutoMut = trpc.convenioMapeamento.aplicarAutomaticos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.total} mapeamentos aplicados automaticamente!`, {
        description: data.aplicados.map(a => a.nomeOrigem).join(", "),
      });
      refetchAll();
    },
    onError: (err) => {
      toast.error("Erro", { description: err.message });
    },
  });

  function refetchAll() {
    refetchSugestoes();
    refetchMapeamentos();
    refetchEstatisticas();
  }

  // Estado para seleções manuais
  const [selecoesManuais, setSelecoesManuais] = useState<Record<string, number>>({});

  function handleSelecionarConvenio(nomeOrigem: string, convenioId: number) {
    setSelecoesManuais(prev => ({ ...prev, [nomeOrigem]: convenioId }));
  }

  function handleSalvarManual(nomeOrigem: string, codigoOrigem: string | null) {
    const convenioId = selecoesManuais[nomeOrigem];
    if (!convenioId || !estabId) return;
    
    salvarMut.mutate({
      estabelecimentoId: estabId,
      nomeOrigem,
      codigoOrigem,
      convenioId,
      metodoMatch: "manual",
    });
    
    // Limpar seleção
    setSelecoesManuais(prev => {
      const next = { ...prev };
      delete next[nomeOrigem];
      return next;
    });
  }

  function handleAplicarSugestao(nomeOrigem: string, codigoOrigem: string | null, convenioId: number, confianca: number) {
    if (!estabId) return;
    salvarMut.mutate({
      estabelecimentoId: estabId,
      nomeOrigem,
      codigoOrigem,
      convenioId,
      metodoMatch: "automatico",
      confianca,
    });
  }

  function handleAplicarTodosAutomaticos() {
    if (!estabId) return;
    aplicarAutoMut.mutate({ estabelecimentoId: estabId, threshold: 75 });
  }

  // Filtrar sugestões
  const sugestoesFiltradas = useMemo(() => {
    if (!sugestoes) return [];
    let items = sugestoes;
    if (buscaNome) {
      items = items.filter(s => s.nomeOrigem.toLowerCase().includes(buscaNome.toLowerCase()));
    }
    return items;
  }, [sugestoes, buscaNome]);

  // Mapeamentos ativos
  const mapeamentosAtivos = useMemo(() => {
    if (!mapeamentos) return [];
    let items = mapeamentos.filter((m: any) => m.ativo === "sim");
    if (buscaNome) {
      items = items.filter((m: any) => 
        m.nomeOrigem.toLowerCase().includes(buscaNome.toLowerCase()) ||
        (m.nomeSafatle || "").toLowerCase().includes(buscaNome.toLowerCase())
      );
    }
    return items;
  }, [mapeamentos, buscaNome]);

  if (!estabId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
              <p className="text-lg font-medium">Selecione um estabelecimento</p>
              <p className="text-muted-foreground mt-2">
                É necessário selecionar um estabelecimento para configurar o mapeamento de convênios.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  function getConfiancaColor(score: number) {
    if (score >= 90) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    if (score >= 50) return "text-orange-400";
    return "text-red-400";
  }

  function getConfiancaBadge(score: number) {
    if (score >= 90) return "default";
    if (score >= 70) return "secondary";
    return "outline";
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6 text-blue-500" />
              Mapeamento de Convênios
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure a correspondência entre os nomes dos convênios do hospital e os cadastrados no Safatle
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchAll()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={handleAplicarTodosAutomaticos}
              disabled={aplicarAutoMut.isPending || !sugestoesFiltradas?.length}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Zap className="h-4 w-4 mr-1" />
              {aplicarAutoMut.isPending ? "Aplicando..." : "Auto-mapear Todos"}
            </Button>
          </div>
        </div>

        {/* Estatísticas */}
        {estatisticas && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Convênios</p>
                <p className="text-2xl font-bold">{estatisticas.totalConveniosHospital}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Mapeados</p>
                <p className="text-2xl font-bold text-green-500">{estatisticas.totalMapeados}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Não Mapeados</p>
                <p className="text-2xl font-bold text-red-500">{estatisticas.totalNaoMapeados}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Cobertura</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{estatisticas.percentualMapeado}%</p>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${estatisticas.percentualMapeado}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Busca e Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar convênio..."
              value={buscaNome}
              onChange={(e) => setBuscaNome(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-md border bg-background text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filtro === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("todos")}
            >
              Todos
            </Button>
            <Button
              variant={filtro === "naoMapeados" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("naoMapeados")}
            >
              <Unlink className="h-3 w-3 mr-1" />
              Não Mapeados
            </Button>
            <Button
              variant={filtro === "mapeados" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro("mapeados")}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Mapeados
            </Button>
          </div>
        </div>

        {/* Convênios Não Mapeados (com sugestões) */}
        {(filtro === "todos" || filtro === "naoMapeados") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Convênios Não Mapeados
                {sugestoesFiltradas && (
                  <Badge variant="secondary">{sugestoesFiltradas.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Convênios do hospital que ainda não foram vinculados a um convênio do Safatle. 
                Clique em uma sugestão para aceitar ou selecione manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSugestoes ? (
                <div className="text-center py-8 text-muted-foreground">Carregando sugestões...</div>
              ) : sugestoesFiltradas && sugestoesFiltradas.length > 0 ? (
                <div className="space-y-4">
                  {sugestoesFiltradas.map((item) => (
                    <div key={item.nomeOrigem} className="border rounded-lg p-4 space-y-3">
                      {/* Nome do hospital */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-base">{item.nomeOrigem}</span>
                          {item.codigoOrigem && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Cód: {item.codigoOrigem}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Sugestões automáticas */}
                      {item.sugestoes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Sugestões automáticas:</p>
                          <div className="flex flex-wrap gap-2">
                            {item.sugestoes.map((sug) => (
                              <Button
                                key={sug.convenioId}
                                variant="outline"
                                size="sm"
                                className="h-auto py-1.5 px-3"
                                onClick={() => handleAplicarSugestao(
                                  item.nomeOrigem, 
                                  item.codigoOrigem, 
                                  sug.convenioId, 
                                  sug.confianca
                                )}
                                disabled={salvarMut.isPending}
                              >
                                <span className="mr-2">{sug.nomeSafatle}</span>
                                <Badge variant={getConfiancaBadge(sug.confianca) as any} className="text-xs">
                                  <span className={getConfiancaColor(sug.confianca)}>
                                    {sug.confianca}%
                                  </span>
                                </Badge>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Seleção manual */}
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select
                          value={selecoesManuais[item.nomeOrigem]?.toString() || ""}
                          onValueChange={(val) => handleSelecionarConvenio(item.nomeOrigem, Number(val))}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Selecionar convênio Safatle..." />
                          </SelectTrigger>
                          <SelectContent>
                            {conveniosSafatle?.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>
                                {c.nome} {c.codigo ? `(${c.codigo})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!selecoesManuais[item.nomeOrigem] || salvarMut.isPending}
                          onClick={() => handleSalvarManual(item.nomeOrigem, item.codigoOrigem)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p className="text-lg font-medium">Todos os convênios estão mapeados!</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Não há convênios pendentes de mapeamento para este estabelecimento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Mapeamentos Existentes */}
        {(filtro === "todos" || filtro === "mapeados") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-green-500" />
                Mapeamentos Configurados
                {mapeamentosAtivos && (
                  <Badge variant="secondary">{mapeamentosAtivos.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Convênios do hospital já vinculados aos convênios do Safatle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMapeamentos ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : mapeamentosAtivos && mapeamentosAtivos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Nome Hospital</th>
                        <th className="pb-2 font-medium text-muted-foreground">Cód. Hospital</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">→</th>
                        <th className="pb-2 font-medium text-muted-foreground">Convênio Safatle</th>
                        <th className="pb-2 font-medium text-muted-foreground">Cód. Safatle</th>
                        <th className="pb-2 font-medium text-muted-foreground">Método</th>
                        <th className="pb-2 font-medium text-muted-foreground">Confiança</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapeamentosAtivos.map((m: any) => (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 font-medium">{m.nomeOrigem}</td>
                          <td className="py-3 text-muted-foreground">{m.codigoOrigem || "—"}</td>
                          <td className="py-3 text-center">
                            <ArrowRight className="h-4 w-4 mx-auto text-blue-500" />
                          </td>
                          <td className="py-3 font-medium text-green-500">{m.nomeSafatle || "—"}</td>
                          <td className="py-3 text-muted-foreground">{m.codigoSafatle || "—"}</td>
                          <td className="py-3">
                            <Badge variant={m.metodoMatch === "automatico" ? "secondary" : "outline"} className="text-xs">
                              {m.metodoMatch === "automatico" ? "Auto" : "Manual"}
                            </Badge>
                          </td>
                          <td className="py-3">
                            {m.confianca ? (
                              <span className={`font-mono text-sm ${getConfiancaColor(Number(m.confianca))}`}>
                                {Number(m.confianca).toFixed(0)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removerMut.mutate({ id: m.id })}
                              disabled={removerMut.isPending}
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum mapeamento configurado ainda.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
