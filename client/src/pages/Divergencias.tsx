import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Filter,
  Gavel,
  Plus
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateBR } from "@/lib/dateUtils";

export default function Divergencias() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const comparacaoIdParam = params.get("comparacaoId");
  const [, navigate] = useLocation();

  const [selectedComparacaoId, setSelectedComparacaoId] = useState<string>(comparacaoIdParam || "");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroResolvido, setFiltroResolvido] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todos");
  
  // Estado para criar recurso
  const [showCriarRecurso, setShowCriarRecurso] = useState(false);
  const [divergenciaSelecionada, setDivergenciaSelecionada] = useState<any>(null);
  const [justificativaRecurso, setJustificativaRecurso] = useState("");
  const [documentosAnexos, setDocumentosAnexos] = useState("");

  const { data: comparacoes } = trpc.comparacoes.list.useQuery({});
  const { data: comparacao, isLoading } = trpc.comparacoes.get.useQuery(
    { id: parseInt(selectedComparacaoId) },
    { enabled: !!selectedComparacaoId }
  );
  const { data: convenios } = trpc.convenios.list.useQuery();

  const resolverMutation = trpc.comparacoes.resolverDivergencia.useMutation();
  const criarRecursoMutation = trpc.recursos.create.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (comparacaoIdParam) {
      setSelectedComparacaoId(comparacaoIdParam);
    }
  }, [comparacaoIdParam]);

  const handleResolver = async (id: number, resolvido: boolean) => {
    try {
      await resolverMutation.mutateAsync({
        id,
        resolvido: resolvido ? "sim" : "nao",
      });
      toast.success(resolvido ? "Divergência marcada como resolvida" : "Divergência reaberta");
      utils.comparacoes.get.invalidate({ id: parseInt(selectedComparacaoId) });
    } catch (error) {
      toast.error("Erro ao atualizar divergência");
    }
  };

  const handleAbrirCriarRecurso = (divergencia: any) => {
    setDivergenciaSelecionada(divergencia);
    // Preencher justificativa com dados da divergência
    const valorEnviado = divergencia.valorEnviado || "N/A";
    const valorRetornado = divergencia.valorRetornado || "N/A";
    const diferenca = divergencia.diferenca 
      ? `R$ ${parseFloat(divergencia.diferenca).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      : "N/A";
    
    setJustificativaRecurso(
      `Solicitamos a revisão da glosa referente ao procedimento abaixo:\n\n` +
      `Descrição: ${divergencia.descricao}\n` +
      `Tipo de divergência: ${getTipoLabel(divergencia.tipo)}\n` +
      `Valor cobrado: ${valorEnviado}\n` +
      `Valor pago: ${valorRetornado}\n` +
      `Diferença: ${diferenca}\n\n` +
      `Justificativa:\n` +
      `[Descreva aqui a justificativa para contestação da glosa]`
    );
    setDocumentosAnexos("");
    setShowCriarRecurso(true);
  };

  const handleCriarRecurso = async () => {
    if (!divergenciaSelecionada || !justificativaRecurso) {
      toast.error("Preencha a justificativa do recurso");
      return;
    }

    // Encontrar o convênio da comparação
    // Buscar convênio da comparação
    const convenioId = comparacao?.arquivoEnviadoId 
      ? 1 // Usar convênio padrão ou buscar do arquivo
      : undefined;

    if (!convenioId) {
      toast.error("Não foi possível identificar o convênio");
      return;
    }

    try {
      const valorGlosado = divergenciaSelecionada.diferenca 
        ? Math.abs(parseFloat(divergenciaSelecionada.diferenca)).toString()
        : "0";

      await criarRecursoMutation.mutateAsync({
        convenioId,
        divergenciaId: divergenciaSelecionada.id,
        codigoProcedimento: divergenciaSelecionada.campo || "",
        descricaoProcedimento: divergenciaSelecionada.descricao || "",
        valorGlosado,
        // motivoGlosa será definido automaticamente
        justificativaRecurso,
        // documentosAnexos será adicionado posteriormente
        prioridade: parseFloat(valorGlosado) > 500 ? "alta" : "media",
      });

      toast.success("Recurso criado com sucesso!");
      setShowCriarRecurso(false);
      setDivergenciaSelecionada(null);
      setJustificativaRecurso("");
      setDocumentosAnexos("");
      
      // Marcar divergência como resolvida (recurso criado)
      await resolverMutation.mutateAsync({
        id: divergenciaSelecionada.id,
        resolvido: "sim",
      });
      utils.comparacoes.get.invalidate({ id: parseInt(selectedComparacaoId) });
    } catch (error) {
      toast.error("Erro ao criar recurso");
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "valor": return "Divergência de Valor";
      case "quantidade": return "Divergência de Quantidade";
      case "ausente_retorno": return "Procedimento Ausente no Retorno";
      case "ausente_envio": return "Procedimento Ausente no Envio";
      default: return "Divergência de Dados";
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "valor":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Valor</Badge>;
      case "quantidade":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Quantidade</Badge>;
      case "ausente_retorno":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Ausente no Retorno</Badge>;
      case "ausente_envio":
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Ausente no Envio</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Dados</Badge>;
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "valor":
        return <TrendingDown className="h-4 w-4 text-amber-600" />;
      case "quantidade":
        return <ArrowLeftRight className="h-4 w-4 text-blue-600" />;
      case "ausente_retorno":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "ausente_envio":
        return <TrendingUp className="h-4 w-4 text-purple-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-slate-600" />;
    }
  };

  // Função para identificar a categoria do item baseado na descrição ou código
  const getCategoriaItem = (descricao: string, campo: string) => {
    const desc = (descricao || "").toLowerCase();
    const cod = (campo || "").toLowerCase();
    
    // Diárias
    if (desc.includes("diária") || desc.includes("diaria") || cod.startsWith("6000")) {
      return "diarias";
    }
    // Taxas
    if (desc.includes("taxa") || cod.startsWith("4399") || cod.startsWith("6002")) {
      return "taxas";
    }
    // Mat/Med
    if (desc.includes("medicamento") || desc.includes("material") || 
        cod.startsWith("9") || cod.startsWith("1900") || cod.startsWith("7")) {
      return "matmed";
    }
    // Procedimentos
    if (cod.startsWith("3") || cod.startsWith("2") || cod.startsWith("1") && !cod.startsWith("1900")) {
      return "procedimentos";
    }
    return "outros";
  };

  const divergenciasFiltradas = comparacao?.divergencias?.filter((div) => {
    if (filtroTipo !== "todos" && div.tipo !== filtroTipo) return false;
    if (filtroResolvido === "sim" && div.resolvido !== "sim") return false;
    if (filtroResolvido === "nao" && div.resolvido !== "nao") return false;
    if (filtroCategoria !== "todos") {
      const categoria = getCategoriaItem(div.descricao || "", div.campo || "");
      if (categoria !== filtroCategoria) return false;
    }
    return true;
  });

  // Contagem por categoria
  const contagemPorCategoria = comparacao?.divergencias?.reduce((acc, div) => {
    const categoria = getCategoriaItem(div.descricao || "", div.campo || "");
    acc[categoria] = (acc[categoria] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const resumo = {
    total: comparacao?.divergencias?.length || 0,
    resolvidas: comparacao?.divergencias?.filter(d => d.resolvido === "sim").length || 0,
    pendentes: comparacao?.divergencias?.filter(d => d.resolvido === "nao").length || 0,
    porTipo: comparacao?.divergencias?.reduce((acc, d) => {
      acc[d.tipo] = (acc[d.tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {},
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Divergências</h1>
          <p className="text-slate-500">
            Visualize e gerencie as divergências encontradas nas comparações
          </p>
        </div>

        {/* Selector */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="flex-1">
                <Select value={selectedComparacaoId} onValueChange={setSelectedComparacaoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma comparação para visualizar" />
                  </SelectTrigger>
                  <SelectContent>
                    {comparacoes?.map((comp) => (
                      <SelectItem key={comp.id} value={comp.id.toString()}>
                        Comparação #{comp.id} - {formatDateBR(comp.createdAt)} 
                        ({comp.totalDivergencias || 0} divergências)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedComparacaoId && (
                <div className="flex flex-wrap gap-2">
                  <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos tipos</SelectItem>
                      <SelectItem value="valor">Valor</SelectItem>
                      <SelectItem value="quantidade">Quantidade</SelectItem>
                      <SelectItem value="ausente_retorno">Ausente no Retorno</SelectItem>
                      <SelectItem value="ausente_envio">Ausente no Envio</SelectItem>
                      <SelectItem value="dados">Dados</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas categorias</SelectItem>
                      <SelectItem value="diarias">Diárias ({contagemPorCategoria.diarias || 0})</SelectItem>
                      <SelectItem value="taxas">Taxas ({contagemPorCategoria.taxas || 0})</SelectItem>
                      <SelectItem value="matmed">Mat/Med ({contagemPorCategoria.matmed || 0})</SelectItem>
                      <SelectItem value="procedimentos">Procedimentos ({contagemPorCategoria.procedimentos || 0})</SelectItem>
                      <SelectItem value="outros">Outros ({contagemPorCategoria.outros || 0})</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filtroResolvido} onValueChange={setFiltroResolvido}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="nao">Pendentes</SelectItem>
                      <SelectItem value="sim">Resolvidas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedComparacaoId && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{resumo.total}</p>
                      <p className="text-sm text-slate-500">Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{resumo.pendentes}</p>
                      <p className="text-sm text-slate-500">Pendentes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{resumo.resolvidas}</p>
                      <p className="text-sm text-slate-500">Resolvidas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {comparacao?.diferencaValor 
                          ? `R$ ${Math.abs(parseFloat(comparacao.diferencaValor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "R$ 0,00"
                        }
                      </p>
                      <p className="text-sm text-slate-500">Diferença Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Divergencias Table */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Lista de Divergências</CardTitle>
                <CardDescription>
                  {divergenciasFiltradas?.length || 0} divergência(s) encontrada(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : divergenciasFiltradas?.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-green-300 mx-auto mb-4" />
                    <p className="text-slate-500">Nenhuma divergência encontrada com os filtros aplicados</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-[50px]">Resolvido</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Valor Enviado</TableHead>
                          <TableHead>Valor Retornado</TableHead>
                          <TableHead>Diferença</TableHead>
                          <TableHead className="w-[120px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {divergenciasFiltradas?.map((div) => (
                          <TableRow 
                            key={div.id} 
                            className={`hover:bg-slate-50 ${div.resolvido === "sim" ? "opacity-60" : ""}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={div.resolvido === "sim"}
                                onCheckedChange={(checked) => handleResolver(div.id, !!checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTipoIcon(div.tipo)}
                                {getTipoBadge(div.tipo)}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <p className="text-sm text-slate-700 truncate">{div.descricao}</p>
                              {div.campo && (
                                <p className="text-xs text-slate-400">Campo: {div.campo}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono">
                                {div.valorEnviado || "-"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono">
                                {div.valorRetornado || "-"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {div.diferenca ? (
                                <span className={`text-sm font-medium ${
                                  parseFloat(div.diferenca) > 0 ? "text-red-600" : "text-green-600"
                                }`}>
                                  {parseFloat(div.diferenca) > 0 ? "+" : ""}
                                  R$ {parseFloat(div.diferenca).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>
                              {div.resolvido !== "sim" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-xs"
                                  onClick={() => handleAbrirCriarRecurso(div)}
                                >
                                  <Gavel className="h-3 w-3" />
                                  Recurso
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!selectedComparacaoId && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12">
              <div className="text-center">
                <Filter className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Selecione uma comparação para visualizar as divergências</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal Criar Recurso */}
      <Dialog open={showCriarRecurso} onOpenChange={setShowCriarRecurso}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-amber-600" />
              Criar Recurso de Glosa
            </DialogTitle>
            <DialogDescription>
              Crie um recurso para contestar esta divergência junto ao convênio
            </DialogDescription>
          </DialogHeader>

          {divergenciaSelecionada && (
            <div className="space-y-4">
              {/* Resumo da Divergência */}
              <Card className="bg-slate-50 border-0">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Tipo</p>
                      <p className="font-medium">{getTipoLabel(divergenciaSelecionada.tipo)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Diferença</p>
                      <p className="font-medium text-red-600">
                        {divergenciaSelecionada.diferenca 
                          ? `R$ ${Math.abs(parseFloat(divergenciaSelecionada.diferenca)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "N/A"
                        }
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-500">Descrição</p>
                      <p className="font-medium">{divergenciaSelecionada.descricao}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Formulário */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="justificativa">Justificativa do Recurso *</Label>
                  <Textarea
                    id="justificativa"
                    value={justificativaRecurso}
                    onChange={(e) => setJustificativaRecurso(e.target.value)}
                    rows={10}
                    className="mt-1 font-mono text-sm"
                    placeholder="Descreva a justificativa para contestação..."
                  />
                </div>

                <div>
                  <Label htmlFor="documentos">Documentos Anexos (opcional)</Label>
                  <Input
                    id="documentos"
                    value={documentosAnexos}
                    onChange={(e) => setDocumentosAnexos(e.target.value)}
                    className="mt-1"
                    placeholder="Liste os documentos que serão anexados ao recurso"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCriarRecurso(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCriarRecurso}
              disabled={criarRecursoMutation.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {criarRecursoMutation.isPending ? "Criando..." : "Criar Recurso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
