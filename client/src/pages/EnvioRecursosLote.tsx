import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Building2, 
  Package, 
  DollarSign, 
  FileText, 
  Send, 
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
  Plus,
  Calendar,
  Hash
} from "lucide-react";
import { formatDateBR } from "@/lib/dateUtils";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

export default function EnvioRecursosLote() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const utils = trpc.useUtils();
  
  const [convenioExpandido, setConvenioExpandido] = useState<number | null>(null);
  const [recursosSelecionados, setRecursosSelecionados] = useState<Set<number>>(new Set());
  const [dialogCriarLote, setDialogCriarLote] = useState(false);
  const [convenioParaLote, setConvenioParaLote] = useState<{ id: number; nome: string } | null>(null);
  const [busca, setBusca] = useState("");
  
  // Campos adicionais para criação do lote
  const [numeroLoteManual, setNumeroLoteManual] = useState("");
  const [protocoloLote, setProtocoloLote] = useState("");
  const [dataInicioConta, setDataInicioConta] = useState("");
  const [dataFimConta, setDataFimConta] = useState("");
  const [modoGuiaUnica, setModoGuiaUnica] = useState(false);

  // Buscar recursos agrupados por convênio (guias finalizadas com valor a recursar)
  const { data: recursosAgrupados, isLoading, refetch } = trpc.recursos.agrupadosPorConvenio.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  // Buscar recursos de um convênio específico
  const { data: recursosConvenio, isLoading: loadingRecursos } = trpc.recursos.recursosDoConvenio.useQuery(
    {
      convenioId: convenioExpandido!,
      estabelecimentoId: estabelecimentoAtual?.id,
      apenasNaoEnviados: true,
    },
    { enabled: !!convenioExpandido }
  );

  // Mutation para criar lote
  const criarLoteMutation = trpc.recursos.criarLote.useMutation({
    onSuccess: (data) => {
      toast.success(`Lote ${data.numeroLote} criado com sucesso! Acesse "Acompanhamento Recursos" para gerar Excel/XML e enviar.`);
      setDialogCriarLote(false);
      setNumeroLoteManual("");
      setProtocoloLote("");
      setDataInicioConta("");
      setDataFimConta("");
      setRecursosSelecionados(new Set());
      setConvenioParaLote(null);
      setModoGuiaUnica(false);
      refetch();
      utils.recursos.agrupadosPorConvenio.invalidate();
      utils.recursos.listarLotes.invalidate();
    },
    onError: (error) => toast.error("Erro ao criar lote: " + error.message),
  });

  const handleExpandirConvenio = (convenioId: number) => {
    if (convenioExpandido === convenioId) {
      setConvenioExpandido(null);
      setRecursosSelecionados(new Set());
    } else {
      setConvenioExpandido(convenioId);
      setRecursosSelecionados(new Set());
    }
  };

  const handleSelecionarRecurso = (recursoId: number, checked: boolean) => {
    const novos = new Set(recursosSelecionados);
    if (checked) {
      novos.add(recursoId);
    } else {
      novos.delete(recursoId);
    }
    setRecursosSelecionados(novos);
  };

  const handleSelecionarTodos = (recursos: any[], checked: boolean) => {
    if (checked) {
      setRecursosSelecionados(new Set(recursos.map(r => r.id)));
    } else {
      setRecursosSelecionados(new Set());
    }
  };

  const handleAbrirCriarLote = (convenioId: number, convenioNome: string) => {
    if (recursosSelecionados.size === 0) {
      toast.error("Selecione pelo menos um recurso para criar o lote");
      return;
    }
    setConvenioParaLote({ id: convenioId, nome: convenioNome });
    setDialogCriarLote(true);
  };

  const handleCriarLote = () => {
    if (!convenioParaLote || !estabelecimentoAtual) return;

    if (modoGuiaUnica) {
      // Criar um lote para cada guia selecionada
      const recursosArray = Array.from(recursosSelecionados);
      const guiasMap = new Map<string, number[]>();
      
      for (const recursoId of recursosArray) {
        const recurso = recursosConvenio?.find((r: any) => r.id === recursoId);
        if (recurso) {
          const guia = recurso.guiaNumero || "sem_guia";
          if (!guiasMap.has(guia)) {
            guiasMap.set(guia, []);
          }
          guiasMap.get(guia)!.push(recursoId);
        }
      }

      // Criar lote para cada guia
      for (const [guia, ids] of guiasMap) {
        criarLoteMutation.mutate({
          convenioId: convenioParaLote.id,
          estabelecimentoId: estabelecimentoAtual.id,
          recursosIds: [], // mantido por compatibilidade
          demonstrativoIds: ids,
          descricao: `Lote - Guia ${guia} - ${convenioParaLote.nome}`,
          protocoloEnvio: protocoloLote || undefined,
          dataInicioConta: dataInicioConta || undefined,
          dataFimConta: dataFimConta || undefined,
        });
      }
    } else {
      // Criar um único lote com todos os recursos selecionados
      criarLoteMutation.mutate({
        convenioId: convenioParaLote.id,
        estabelecimentoId: estabelecimentoAtual.id,
        recursosIds: [], // mantido por compatibilidade
        demonstrativoIds: Array.from(recursosSelecionados),
        descricao: `Lote de recursos - ${convenioParaLote.nome}`,
        protocoloEnvio: protocoloLote || undefined,
        dataInicioConta: dataInicioConta || undefined,
        dataFimConta: dataFimConta || undefined,
      });
    }
  };

  const handleCriarLoteTodos = (convenioId: number, convenioNome: string, recursos: any[]) => {
    if (recursos.length === 0) {
      toast.error("Não há recursos para criar lote");
      return;
    }
    setRecursosSelecionados(new Set(recursos.map(r => r.id)));
    setConvenioParaLote({ id: convenioId, nome: convenioNome });
    setDialogCriarLote(true);
  };

  // Filtrar recursos por busca
  const recursosFiltrados = useMemo(() => {
    if (!recursosConvenio || !busca) return recursosConvenio;
    const termo = busca.toLowerCase();
    return recursosConvenio.filter(r => 
      r.guiaNumero?.toLowerCase().includes(termo) ||
      r.pacienteNome?.toLowerCase().includes(termo) ||
      r.codigoProcedimento?.toLowerCase().includes(termo) ||
      r.descricaoProcedimento?.toLowerCase().includes(termo)
    );
  }, [recursosConvenio, busca]);

  if (!user) return null;

  const totalRecursosPendentes = recursosAgrupados?.reduce((sum, g) => sum + g.totalRecursos, 0) || 0;
  const valorTotalPendente = recursosAgrupados?.reduce((sum, g) => sum + g.valorTotalGlosado, 0) || 0;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Criação de Lotes</h1>
          <p className="text-muted-foreground">
            Selecione as guias finalizadas por convênio e crie lotes para envio de recursos
          </p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Convênios com Recursos</CardTitle>
            <Building2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recursosAgrupados?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Aguardando criação de lote
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Recursos</CardTitle>
            <FileText className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecursosPendentes}</div>
            <p className="text-xs text-muted-foreground">
              Itens pendentes de lote
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(valorTotalPendente)}
            </div>
            <p className="text-xs text-muted-foreground">
              Valor total a recursar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Convênios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Guias Finalizadas por Convênio
          </CardTitle>
          <CardDescription>
            Expanda um convênio para ver as guias e selecionar quais incluir no lote
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !recursosAgrupados || recursosAgrupados.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum recurso pendente</h3>
              <p className="text-muted-foreground">
                Todos os recursos já foram incluídos em lotes. Crie novos recursos nas telas de Recurso Glosa.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recursosAgrupados.map((grupo) => (
                <div key={grupo.convenioId} className="border rounded-lg overflow-hidden">
                  {/* Header do Convênio */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleExpandirConvenio(grupo.convenioId)}
                  >
                    <div className="flex items-center gap-3">
                      {convenioExpandido === grupo.convenioId ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <Building2 className="h-5 w-5 text-blue-500" />
                      <div>
                        <h3 className="font-semibold">{grupo.convenioNome}</h3>
                        <p className="text-sm text-muted-foreground">
                          {grupo.totalRecursos} {grupo.totalRecursos === 1 ? "recurso" : "recursos"} pendentes
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium text-red-600">
                          {formatCurrency(grupo.valorTotalGlosado)}
                        </div>
                        <div className="text-xs text-muted-foreground">Valor glosado</div>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCriarLoteTodos(grupo.convenioId, grupo.convenioNome, grupo.recursos);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Criar Lote (Todos)
                      </Button>
                    </div>
                  </div>

                  {/* Tabela de Recursos expandida */}
                  {convenioExpandido === grupo.convenioId && (
                    <div className="border-t p-4 bg-muted/20">
                      {loadingRecursos ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                          ))}
                        </div>
                      ) : (
                        <>
                          {/* Barra de ações */}
                          <div className="flex items-center justify-between mb-4 gap-4">
                            <div className="relative flex-1 max-w-sm">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar por guia, paciente, código..."
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {recursosSelecionados.size} selecionados
                              </Badge>
                              <Button
                                size="sm"
                                onClick={() => handleAbrirCriarLote(grupo.convenioId, grupo.convenioNome)}
                                disabled={recursosSelecionados.size === 0}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Criar Lote ({recursosSelecionados.size})
                              </Button>
                            </div>
                          </div>

                          {/* Tabela */}
                          <div className="rounded-md border overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[40px]">
                                    <Checkbox
                                      checked={recursosFiltrados && recursosFiltrados.length > 0 && recursosSelecionados.size === recursosFiltrados.length}
                                      onCheckedChange={(checked) => handleSelecionarTodos(recursosFiltrados || [], !!checked)}
                                    />
                                  </TableHead>
                                  <TableHead>Guia</TableHead>
                                  <TableHead>Código</TableHead>
                                  <TableHead>Descrição</TableHead>
                                  <TableHead>Paciente</TableHead>
                                  <TableHead>Data Item</TableHead>
                                  <TableHead className="text-right">Valor Glosado</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(recursosFiltrados || []).map((recurso) => (
                                  <TableRow key={recurso.id}>
                                    <TableCell>
                                      <Checkbox
                                        checked={recursosSelecionados.has(recurso.id)}
                                        onCheckedChange={(checked) => handleSelecionarRecurso(recurso.id, !!checked)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                      {recurso.guiaNumero || "-"}
                                    </TableCell>
                                    <TableCell>{recurso.codigoProcedimento || "-"}</TableCell>
                                    <TableCell className="max-w-[200px] truncate">
                                      {recurso.descricaoProcedimento || "-"}
                                    </TableCell>
                                    <TableCell>{recurso.pacienteNome || "-"}</TableCell>
                                    <TableCell>
                                      {recurso.dataGlosa ? formatDateBR(recurso.dataGlosa) : "-"}
                                    </TableCell>
                                    <TableCell className="text-right text-red-600 font-medium">
                                      {formatCurrency(recurso.valorGlosado)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="bg-green-50 text-green-700">
                                        Pronto
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Criação de Lote */}
      <Dialog open={dialogCriarLote} onOpenChange={setDialogCriarLote}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Lote de Recursos</DialogTitle>
            <DialogDescription>
              Configure os dados do lote para {convenioParaLote?.nome}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Resumo */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Convênio:</span>
                <span className="font-medium">{convenioParaLote?.nome}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recursos selecionados:</span>
                <span className="font-medium">{recursosSelecionados.size}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valor total glosado:</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(
                    recursosConvenio
                      ?.filter(r => recursosSelecionados.has(r.id))
                      .reduce((sum, r) => sum + parseFloat(r.valorGlosado || "0"), 0) || 0
                  )}
                </span>
              </div>
            </div>

            {/* Modo guia única */}
            <div className="flex items-center space-x-2 p-3 border rounded-lg">
              <Checkbox
                id="modoGuiaUnica"
                checked={modoGuiaUnica}
                onCheckedChange={(checked) => setModoGuiaUnica(!!checked)}
              />
              <label htmlFor="modoGuiaUnica" className="text-sm font-medium cursor-pointer">
                Criar um lote por guia (convênio permite somente uma guia por envio)
              </label>
            </div>

            {/* Campos adicionais */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  Número do Lote (opcional)
                </label>
                <Input
                  placeholder="Gerado automaticamente se não informado"
                  value={numeroLoteManual}
                  onChange={(e) => setNumeroLoteManual(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para gerar automaticamente
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  Protocolo (opcional)
                </label>
                <Input
                  placeholder="Ex: 2024-001234"
                  value={protocoloLote}
                  onChange={(e) => setProtocoloLote(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Data Início Conta
                  </label>
                  <Input
                    type="date"
                    value={dataInicioConta}
                    onChange={(e) => setDataInicioConta(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Data Fim Conta
                  </label>
                  <Input
                    type="date"
                    value={dataFimConta}
                    onChange={(e) => setDataFimConta(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCriarLote(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCriarLote}
              disabled={criarLoteMutation.isPending}
            >
              {criarLoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando lote...
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 mr-2" />
                  {modoGuiaUnica ? "Criar Lotes (1 por guia)" : "Criar Lote"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
