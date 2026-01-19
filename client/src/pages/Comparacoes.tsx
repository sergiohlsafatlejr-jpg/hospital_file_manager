import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { 
  GitCompare, 
  Plus, 
  AlertTriangle, 
  CheckCircle2,
  Eye,
  Loader2,
  ArrowRight,
  Table2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Search,
  FileSpreadsheet,
  AlertCircle,
  Play,
  FileText,
  RefreshCw
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

export default function Comparacoes() {
  const [, setLocation] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [arquivoEnviadoId, setArquivoEnviadoId] = useState<string>("");
  const [arquivoRetornadoId, setArquivoRetornadoId] = useState<string>("");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [activeTab, setActiveTab] = useState("validacao");
  const [filtroCategoriaValidacao, setFiltroCategoriaValidacao] = useState<string>("todos");
  
  // Função para identificar a categoria do item baseado na descrição, código ou tipo
  const getCategoriaItem = (descricao: string, codigo: string, tipo?: string) => {
    // Se tiver tipo definido, usar diretamente
    if (tipo) {
      const tipoLower = tipo.toLowerCase();
      if (tipoLower.includes("diaria") || tipoLower === "diarias") return "diarias";
      if (tipoLower.includes("taxa") || tipoLower === "taxas") return "taxas";
      if (tipoLower.includes("mat") || tipoLower.includes("med") || tipoLower === "matmed") return "matmed";
      if (tipoLower.includes("proc") || tipoLower === "procedimentos") return "procedimentos";
    }
    
    const desc = (descricao || "").toLowerCase();
    const cod = (codigo || "");
    
    // Diárias - baseado na descrição (deve ter "diária" explicitamente ou código de diária)
    if ((desc.includes("diária") || desc.includes("diaria")) && 
        !desc.includes("fio") && !desc.includes("material") && !desc.includes("seringa")) {
      return "diarias";
    }
    // Códigos que começam com 6000 são diárias (ex: 60000694)
    if (cod.startsWith("6000") && cod.length >= 8) {
      return "diarias";
    }
    // Taxas - baseado na descrição
    if (desc.includes("taxa") || desc.includes("serviço") || desc.includes("servico")) {
      return "taxas";
    }
    // Mat/Med - baseado na descrição ou código
    if (desc.includes("medicamento") || desc.includes("material") || desc.includes("seringa") || 
        desc.includes("agulha") || desc.includes("soro") || desc.includes("agua") ||
        desc.includes("cloreto") || desc.includes("injetável") || desc.includes("injetavel") ||
        cod.startsWith("9") || cod.startsWith("1900") || cod.startsWith("7")) {
      return "matmed";
    }
    // Procedimentos - baseado no código ou descrição
    if (desc.includes("colecistectomia") || desc.includes("cirurgia") || desc.includes("procedimento") ||
        cod.startsWith("3") || cod.startsWith("2")) {
      return "procedimentos";
    }
    return "outros";
  };
  
  // Estados para validação por XML
  const [arquivoSelecionadoId, setArquivoSelecionadoId] = useState<string>("");
  const [validandoArquivo, setValidandoArquivo] = useState(false);
  const [resultadoValidacao, setResultadoValidacao] = useState<{
    divergenciasPreco: any[];
    violacoesRegras: any[];
    sugestoes: any[];
    resumo: {
      totalItens: number;
      divergenciasPreco: number;
      violacoesRegras: number;
      sugestoes: number;
      valorDiferenca: number;
    };
  } | null>(null);

  const { data: comparacoes, isLoading, refetch } = trpc.comparacoes.list.useQuery({
    convenioId: filtroConvenio !== "todos" ? parseInt(filtroConvenio) : undefined,
    status: filtroStatus !== "todos" ? filtroStatus as "pendente" | "concluida" | "erro" : undefined,
    estabelecimentoId,
  });

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: arquivosEnviados } = trpc.arquivos.list.useQuery({ 
    direcao: "enviado", 
    status: "processado",
    estabelecimentoId,
  });
  const { data: arquivosRetornados } = trpc.arquivos.list.useQuery({ 
    direcao: "retornado", 
    status: "processado",
    estabelecimentoId,
  });
  
  // Lista de arquivos XML processados para validação
  const { data: arquivosXml } = trpc.arquivos.list.useQuery({ 
    status: "processado",
    estabelecimentoId,
  });

  const criarComparacaoMutation = trpc.comparacoes.criar.useMutation();
  const compararComTabelaMutation = trpc.alertas.compararComTabela.useMutation();
  const verificarRegrasMutation = trpc.alertas.verificarRegras.useMutation();
  const salvarValidacaoMutation = trpc.alertas.salvarValidacao.useMutation();
  const { data: historicoValidacoes, refetch: refetchHistorico } = trpc.alertas.historicoValidacoes.useQuery({});
  const { data: sugestoesData, refetch: refetchSugestoes } = trpc.alertas.sugerirItens.useQuery(
    { arquivoId: arquivoSelecionadoId ? parseInt(arquivoSelecionadoId) : 0 },
    { enabled: false }
  );
  const utils = trpc.useUtils();

  // Abrir validação do histórico
  const handleAbrirValidacao = (validacao: any) => {
    // Carregar os detalhes salvos da validação
    if (validacao.detalhes) {
      try {
        const detalhes = typeof validacao.detalhes === 'string' 
          ? JSON.parse(validacao.detalhes) 
          : validacao.detalhes;
        
        setResultadoValidacao({
          divergenciasPreco: detalhes.divergenciasPreco || [],
          violacoesRegras: detalhes.violacoesRegras || [],
          sugestoes: detalhes.sugestoes || [],
          resumo: {
            totalItens: validacao.totalItens || 0,
            divergenciasPreco: validacao.divergenciasPreco || 0,
            violacoesRegras: validacao.violacoesRegras || 0,
            sugestoes: validacao.sugestoesIA || 0,
            valorDiferenca: validacao.valorDiferenca || 0,
          },
        });
        
        setArquivoSelecionadoId(validacao.arquivoId.toString());
        setActiveTab("validacao");
        toast.success("Validação carregada do histórico");
      } catch (error) {
        toast.error("Erro ao carregar detalhes da validação");
      }
    } else {
      toast.info("Detalhes não disponíveis. Execute a validação novamente.");
      setArquivoSelecionadoId(validacao.arquivoId.toString());
      setActiveTab("validacao");
    }
  };

  // Executar validação completa de um arquivo
  const handleValidarArquivo = async () => {
    if (!arquivoSelecionadoId) {
      toast.error("Selecione um arquivo XML para validar");
      return;
    }

    setValidandoArquivo(true);
    setResultadoValidacao(null);

    try {
      const arquivoId = parseInt(arquivoSelecionadoId);
      
      // Executar comparação com tabela de preços
      const resultadoPrecos = await compararComTabelaMutation.mutateAsync({ arquivoId });
      
      // Executar verificação de regras de negócio
      const resultadoRegras = await verificarRegrasMutation.mutateAsync({ arquivoId });
      
      // Buscar sugestões da IA
      const { data: sugestoes } = await refetchSugestoes();

      setResultadoValidacao({
        divergenciasPreco: resultadoPrecos.alertas || [],
        violacoesRegras: resultadoRegras.alertas || [],
        sugestoes: sugestoes || [],
        resumo: {
          totalItens: resultadoPrecos.resumo?.total || 0,
          divergenciasPreco: resultadoPrecos.resumo?.divergencias || 0,
          violacoesRegras: resultadoRegras.resumo?.violacoes || 0,
          sugestoes: sugestoes?.length || 0,
          valorDiferenca: resultadoPrecos.resumo?.valorDiferenca || 0,
        },
      });

      const totalAlertas = (resultadoPrecos.resumo?.divergencias || 0) + (resultadoRegras.resumo?.violacoes || 0);
      
      // Salvar no histórico
      const arquivoInfo = arquivosXml?.find(a => a.id === arquivoId);
      if (arquivoInfo) {
        await salvarValidacaoMutation.mutateAsync({
          arquivoId,
          convenioId: arquivoInfo.convenioId,
          totalItens: resultadoPrecos.resumo?.total || 0,
          divergenciasPreco: resultadoPrecos.resumo?.divergencias || 0,
          violacoesRegras: resultadoRegras.resumo?.violacoes || 0,
          sugestoesIA: sugestoes?.length || 0,
          valorDiferenca: resultadoPrecos.resumo?.valorDiferenca || 0,
          detalhes: {
            divergenciasPreco: resultadoPrecos.alertas || [],
            violacoesRegras: resultadoRegras.alertas || [],
            sugestoes: sugestoes || [],
          },
        });
        refetchHistorico();
      }
      
      if (totalAlertas > 0) {
        toast.warning(`Validação concluída: ${totalAlertas} alerta(s) encontrado(s)`);
      } else {
        toast.success("Validação concluída: Nenhum problema encontrado!");
      }

      // Invalidar queries relacionadas
    } catch (error: any) {
      toast.error(error.message || "Erro ao validar arquivo");
    } finally {
      setValidandoArquivo(false);
    }
  };

  const handleCriarComparacao = async () => {
    if (!arquivoEnviadoId || !arquivoRetornadoId) {
      toast.error("Selecione os arquivos para comparação");
      return;
    }

    try {
      const result = await criarComparacaoMutation.mutateAsync({
        arquivoEnviadoId: parseInt(arquivoEnviadoId),
        arquivoRetornadoId: parseInt(arquivoRetornadoId),
      });

      toast.success(`Comparação realizada! ${result.totalDivergencias} divergência(s) encontrada(s)`);
      setDialogOpen(false);
      setArquivoEnviadoId("");
      setArquivoRetornadoId("");
      
      utils.comparacoes.list.invalidate();
      utils.comparacoes.stats.invalidate();
      utils.dashboard.resumo.invalidate();
      utils.dashboard.ultimasComparacoes.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar comparação");
    }
  };

  const getStatusBadge = (status: string, divergencias: number | null) => {
    if (status === "concluida") {
      if (divergencias && divergencias > 0) {
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Com Divergências</Badge>;
      }
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">OK</Badge>;
    }
    if (status === "erro") {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Erro</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Pendente</Badge>;
  };

  const formatCurrency = (value: string | number | null) => {
    if (value === null || value === undefined) return "R$ 0,00";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const arquivoSelecionado = arquivosXml?.find(a => a.id.toString() === arquivoSelecionadoId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Comparações</h1>
          <p className="text-slate-500">
            Valide arquivos XML contra tabelas de preços e regras de negócio
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="validacao" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Validar XML
            </TabsTrigger>
            <TabsTrigger value="arquivos" className="flex items-center gap-2">
              <GitCompare className="h-4 w-4" />
              Comparar Arquivos
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* Aba de Validação por XML */}
          <TabsContent value="validacao" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-blue-500" />
                  Validar Arquivo XML
                </CardTitle>
                <CardDescription>
                  Selecione um arquivo XML processado para executar a validação completa: comparação com tabela de preços, verificação de regras de negócio e sugestões da IA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Arquivo XML</Label>
                    <Select value={arquivoSelecionadoId} onValueChange={(v) => {
                      setArquivoSelecionadoId(v);
                      setResultadoValidacao(null);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um arquivo XML processado" />
                      </SelectTrigger>
                      <SelectContent>
                        {arquivosXml?.filter(a => a.tipoArquivo === "xml").map((arq) => (
                          <SelectItem key={arq.id} value={arq.id.toString()}>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              <span>{arq.nome}</span>
                              <Badge variant="outline" className="ml-2">
                                {convenios?.find(c => c.id === arq.convenioId)?.nome || "Sem convênio"}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    onClick={handleValidarArquivo}
                    disabled={!arquivoSelecionadoId || validandoArquivo}
                    className="lg:w-auto"
                  >
                    {validandoArquivo ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Executar Validação
                      </>
                    )}
                  </Button>
                </div>

                {arquivoSelecionado && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span><strong>Arquivo:</strong> {arquivoSelecionado.nome}</span>
                      <span><strong>Convênio:</strong> {convenios?.find(c => c.id === arquivoSelecionado.convenioId)?.nome || "-"}</span>
                      <span><strong>Data:</strong> {new Date(arquivoSelecionado.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resultado da Validação */}
            {resultadoValidacao && (
              <>
                {/* Cards de Resumo */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Total de Itens</p>
                          <p className="text-2xl font-bold">{resultadoValidacao.resumo.totalItens}</p>
                        </div>
                        <FileText className="h-8 w-8 text-slate-300" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`border-0 shadow-sm ${resultadoValidacao.resumo.divergenciasPreco > 0 ? "bg-red-50" : "bg-green-50"}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Divergências de Preço</p>
                          <p className="text-2xl font-bold">{resultadoValidacao.resumo.divergenciasPreco}</p>
                        </div>
                        <DollarSign className={`h-8 w-8 ${resultadoValidacao.resumo.divergenciasPreco > 0 ? "text-red-300" : "text-green-300"}`} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`border-0 shadow-sm ${resultadoValidacao.resumo.violacoesRegras > 0 ? "bg-amber-50" : "bg-green-50"}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Violações de Regras</p>
                          <p className="text-2xl font-bold">{resultadoValidacao.resumo.violacoesRegras}</p>
                        </div>
                        <AlertTriangle className={`h-8 w-8 ${resultadoValidacao.resumo.violacoesRegras > 0 ? "text-amber-300" : "text-green-300"}`} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-500">Sugestões IA</p>
                          <p className="text-2xl font-bold">{resultadoValidacao.resumo.sugestoes}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-blue-300" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Painel de Resumo por Categoria e Convênio */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Resumo por Categoria</CardTitle>
                    <CardDescription>Total de divergências agrupadas por tipo de item</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {(() => {
                        const categorias = { diarias: 0, taxas: 0, matmed: 0, procedimentos: 0, outros: 0 };
                        resultadoValidacao.divergenciasPreco.forEach((d: any) => {
                          const cat = getCategoriaItem(d.descricaoItem || d.descricao || "", d.codigoItem || d.codigo || "", d.tipo);
                          categorias[cat as keyof typeof categorias]++;
                        });
                        return (
                          <>
                            <div className={`p-4 rounded-lg text-center ${categorias.diarias > 0 ? 'bg-purple-100' : 'bg-slate-100'}`}>
                              <p className="text-2xl font-bold text-purple-700">{categorias.diarias}</p>
                              <p className="text-sm text-slate-600">Diárias</p>
                            </div>
                            <div className={`p-4 rounded-lg text-center ${categorias.taxas > 0 ? 'bg-orange-100' : 'bg-slate-100'}`}>
                              <p className="text-2xl font-bold text-orange-700">{categorias.taxas}</p>
                              <p className="text-sm text-slate-600">Taxas</p>
                            </div>
                            <div className={`p-4 rounded-lg text-center ${categorias.matmed > 0 ? 'bg-cyan-100' : 'bg-slate-100'}`}>
                              <p className="text-2xl font-bold text-cyan-700">{categorias.matmed}</p>
                              <p className="text-sm text-slate-600">Mat/Med</p>
                            </div>
                            <div className={`p-4 rounded-lg text-center ${categorias.procedimentos > 0 ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                              <p className="text-2xl font-bold text-emerald-700">{categorias.procedimentos}</p>
                              <p className="text-sm text-slate-600">Procedimentos</p>
                            </div>
                            <div className={`p-4 rounded-lg text-center ${categorias.outros > 0 ? 'bg-slate-200' : 'bg-slate-100'}`}>
                              <p className="text-2xl font-bold text-slate-700">{categorias.outros}</p>
                              <p className="text-sm text-slate-600">Outros</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    
                    {arquivoSelecionado && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-slate-500 mb-2">Convênio do Arquivo</p>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-700">
                            {convenios?.find(c => c.id === arquivoSelecionado.convenioId)?.nome || "Não identificado"}
                          </Badge>
                          <span className="text-sm text-slate-600">
                            {resultadoValidacao.resumo.divergenciasPreco} divergência(s) de preço | {resultadoValidacao.resumo.violacoesRegras} violação(ões) de regra
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Divergências de Preço */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-red-500" />
                          Divergências de Preço
                          {resultadoValidacao.divergenciasPreco.length > 0 && (
                            <Badge className="bg-red-100 text-red-700 ml-2">
                              {resultadoValidacao.divergenciasPreco.length}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>
                          Itens com valor diferente da tabela de preços contratada
                        </CardDescription>
                      </div>
                      {resultadoValidacao.divergenciasPreco.length > 0 && (
                        <Select value={filtroCategoriaValidacao} onValueChange={setFiltroCategoriaValidacao}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Filtrar por categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas categorias ({resultadoValidacao.divergenciasPreco.length})</SelectItem>
                            <SelectItem value="diarias">Diárias ({resultadoValidacao.divergenciasPreco.filter((d: any) => getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === "diarias").length})</SelectItem>
                            <SelectItem value="taxas">Taxas ({resultadoValidacao.divergenciasPreco.filter((d: any) => getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === "taxas").length})</SelectItem>
                            <SelectItem value="matmed">Mat/Med ({resultadoValidacao.divergenciasPreco.filter((d: any) => getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === "matmed").length})</SelectItem>
                            <SelectItem value="procedimentos">Procedimentos ({resultadoValidacao.divergenciasPreco.filter((d: any) => getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === "procedimentos").length})</SelectItem>
                            <SelectItem value="outros">Outros ({resultadoValidacao.divergenciasPreco.filter((d: any) => getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === "outros").length})</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {resultadoValidacao.divergenciasPreco.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 py-4">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>Nenhuma divergência de preço encontrada</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead>Código</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="text-right">Valor Cobrado</TableHead>
                              <TableHead className="text-right">Valor Tabela</TableHead>
                              <TableHead className="text-right">Diferença</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resultadoValidacao.divergenciasPreco
                              .filter((d: any) => filtroCategoriaValidacao === "todos" || getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === filtroCategoriaValidacao)
                              .slice(0, 50).map((div: any, index: number) => (
                              <TableRow key={index} className="hover:bg-slate-50">
                                <TableCell className="font-mono text-sm text-slate-700">{div.codigoItem || div.codigo}</TableCell>
                                <TableCell className="max-w-[250px]">
                                  <span className="block truncate" title={div.descricaoItem || div.descricao || "Sem descrição"}>
                                    {div.descricaoItem || div.descricao || "Sem descrição"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(div.valorCobrado)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(div.valorEsperado || div.valorTabela)}</TableCell>
                                <TableCell className={`text-right font-medium ${parseFloat(div.diferenca) > 0 ? "text-red-600" : "text-green-600"}`}>
                                  {parseFloat(div.diferenca) > 0 ? "+" : ""}{formatCurrency(div.diferenca)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className={parseFloat(div.diferenca) > 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                                    {parseFloat(div.diferenca) > 0 ? "Acima" : "Abaixo"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {(() => {
                          const filtradas = resultadoValidacao.divergenciasPreco.filter((d: any) => 
                            filtroCategoriaValidacao === "todos" || getCategoriaItem(d.descricaoItem || d.descricao, d.codigoItem || d.codigo, d.tipo) === filtroCategoriaValidacao
                          );
                          return filtradas.length > 50 ? (
                            <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t">
                              Exibindo 50 de {filtradas.length} divergências
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Violações de Regras */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Violações de Regras de Negócio
                      {resultadoValidacao.violacoesRegras.length > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 ml-2">
                          {resultadoValidacao.violacoesRegras.length}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Itens que não atendem às regras de composição de conta cadastradas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {resultadoValidacao.violacoesRegras.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 py-4">
                        <CheckCircle2 className="h-5 w-5" />
                        <span>Nenhuma violação de regra encontrada</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {resultadoValidacao.violacoesRegras.slice(0, 20).map((violacao: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="bg-amber-200 text-amber-800">
                                    {violacao.tipoAlerta === "item_faltante" ? "Item Faltante" : 
                                     violacao.tipoAlerta === "item_nao_permitido" ? "Item Proibido" :
                                     violacao.tipoAlerta === "quantidade_incorreta" ? "Quantidade Incorreta" : "Violação"}
                                  </Badge>
                                  <Badge variant="outline" className="bg-white">
                                    {violacao.severidade === "alta" ? "Alta Prioridade" : 
                                     violacao.severidade === "media" ? "Média Prioridade" : "Baixa Prioridade"}
                                  </Badge>
                                </div>
                                <p className="font-semibold text-slate-900 mt-2">{violacao.titulo}</p>
                                <p className="text-sm text-slate-600 mt-1">{violacao.descricao}</p>
                                {violacao.codigoItem && (
                                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">Código: {violacao.codigoItem}</span>
                                    {violacao.descricaoItem && <span>{violacao.descricaoItem}</span>}
                                  </div>
                                )}
                                {violacao.sugestaoCorrecao && (
                                  <div className="mt-3 p-2 bg-white rounded border border-amber-200">
                                    <p className="text-xs font-medium text-amber-700">Sugestão de Correção:</p>
                                    <p className="text-sm text-slate-700">{violacao.sugestaoCorrecao}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Sugestões da IA */}
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-blue-500" />
                      Sugestões Inteligentes
                      {resultadoValidacao.sugestoes.length > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 ml-2">
                          {resultadoValidacao.sugestoes.length}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Análise baseada em padrões de contas anteriores
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {resultadoValidacao.sugestoes.length === 0 ? (
                      <div className="flex items-center gap-2 text-slate-500 py-4">
                        <AlertCircle className="h-5 w-5" />
                        <span>Nenhuma sugestão disponível. Importe mais arquivos para a IA aprender os padrões.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {resultadoValidacao.sugestoes.map((sugestao: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg bg-blue-50">
                            <div className="flex items-start gap-3">
                              <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-medium text-slate-900">{sugestao.item || "Item sugerido"}</p>
                                <p className="text-sm text-slate-600 mt-1">{sugestao.motivo}</p>
                                {sugestao.confianca && (
                                  <Badge className="mt-2 bg-blue-100 text-blue-700">
                                    Confiança: {(sugestao.confianca * 100).toFixed(0)}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Aba de Comparação de Arquivos */}
          <TabsContent value="arquivos" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5 text-blue-500" />
                  Comparar Arquivos
                </CardTitle>
                <CardDescription>
                  Compare um arquivo enviado com seu retorno para identificar divergências
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Comparação
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba de Histórico */}
          <TabsContent value="historico" className="space-y-6">
            {/* Filters */}
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos convênios</SelectItem>
                        {convenios?.map((conv) => (
                          <SelectItem key={conv.id} value={conv.id.toString()}>
                            {conv.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setFiltroConvenio("todos");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  </div>

                  <Button variant="outline" onClick={() => refetchHistorico()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Histórico de Validações</CardTitle>
                <CardDescription>
                  {historicoValidacoes?.length || 0} validação(ões) realizada(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!historicoValidacoes ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : historicoValidacoes?.length === 0 ? (
                  <div className="text-center py-12">
                    <GitCompare className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">Nenhuma validação realizada</p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveTab("validacao")}>
                      Validar um arquivo
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>ID</TableHead>
                          <TableHead>Arquivo</TableHead>
                          <TableHead>Convênio</TableHead>
                          <TableHead className="text-right">Total Itens</TableHead>
                          <TableHead className="text-right">Diverg. Preço</TableHead>
                          <TableHead className="text-right">Violações Regras</TableHead>
                          <TableHead className="text-right">Sugestões IA</TableHead>
                          <TableHead className="text-right">Diferença</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historicoValidacoes
                          ?.filter(v => filtroConvenio === "todos" || v.convenioId.toString() === filtroConvenio)
                          .map((validacao) => {
                            const arquivo = arquivosXml?.find(a => a.id === validacao.arquivoId);
                            return (
                              <TableRow key={validacao.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleAbrirValidacao(validacao)}>
                                <TableCell className="font-mono text-sm">#{validacao.id}</TableCell>
                                <TableCell className="max-w-[200px] truncate" title={arquivo?.nome}>
                                  {arquivo?.nome || `Arquivo #${validacao.arquivoId}`}
                                </TableCell>
                                <TableCell>{convenios?.find(c => c.id === validacao.convenioId)?.nome || "-"}</TableCell>
                                <TableCell className="text-right">{validacao.totalItens || 0}</TableCell>
                                <TableCell className="text-right">
                                  {validacao.divergenciasPreco ? (
                                    <Badge className="bg-amber-100 text-amber-700">{validacao.divergenciasPreco}</Badge>
                                  ) : (
                                    <Badge className="bg-green-100 text-green-700">0</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {validacao.violacoesRegras ? (
                                    <Badge className="bg-red-100 text-red-700">{validacao.violacoesRegras}</Badge>
                                  ) : (
                                    <Badge className="bg-green-100 text-green-700">0</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {validacao.sugestoesIA ? (
                                    <Badge className="bg-blue-100 text-blue-700">{validacao.sugestoesIA}</Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-700">0</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(validacao.valorDiferenca)}
                                </TableCell>
                                <TableCell className="text-sm text-slate-500">
                                  {new Date(validacao.createdAt).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleAbrirValidacao(validacao); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Nova Comparação Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Comparação</DialogTitle>
            <DialogDescription>
              Selecione um arquivo enviado e um retornado do mesmo convênio para comparar
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Arquivo Enviado</Label>
              <Select value={arquivoEnviadoId} onValueChange={setArquivoEnviadoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o arquivo enviado" />
                </SelectTrigger>
                <SelectContent>
                  {arquivosEnviados?.map((arq) => (
                    <SelectItem key={arq.id} value={arq.id.toString()}>
                      {arq.nome} ({convenios?.find(c => c.id === arq.convenioId)?.nome})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-center">
              <ArrowRight className="h-6 w-6 text-slate-400" />
            </div>

            <div className="space-y-2">
              <Label>Arquivo Retornado</Label>
              <Select value={arquivoRetornadoId} onValueChange={setArquivoRetornadoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o arquivo retornado" />
                </SelectTrigger>
                <SelectContent>
                  {arquivosRetornados?.map((arq) => (
                    <SelectItem key={arq.id} value={arq.id.toString()}>
                      {arq.nome} ({convenios?.find(c => c.id === arq.convenioId)?.nome})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCriarComparacao}
              disabled={!arquivoEnviadoId || !arquivoRetornadoId || criarComparacaoMutation.isPending}
            >
              {criarComparacaoMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Comparando...
                </>
              ) : (
                <>
                  <GitCompare className="h-4 w-4 mr-2" />
                  Comparar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
