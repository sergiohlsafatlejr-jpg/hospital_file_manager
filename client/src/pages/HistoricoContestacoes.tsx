import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Search, 
  RefreshCw, 
  Download,
  History,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Copy,
  TrendingUp,
  BarChart3,
  Sparkles,
  BookOpen,
  FileText
} from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";
import { traduzirCodigoGlosa } from "../../../shared/glossaryGlosas";
import { formatDateBR } from "@/lib/dateUtils";

const RESULTADO_CONFIG: { [key: string]: { label: string; color: string; icon: any } } = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  deferido: { label: "Deferido", color: "bg-green-100 text-green-800", icon: CheckCircle },
  deferido_parcial: { label: "Deferido Parcial", color: "bg-lime-100 text-lime-800", icon: CheckCircle },
  indeferido: { label: "Indeferido", color: "bg-red-100 text-red-800", icon: XCircle },
};

const ORIGEM_CONFIG: { [key: string]: { label: string; color: string; icon: any } } = {
  dicionario: { label: "Dicionário", color: "bg-blue-100 text-blue-800", icon: BookOpen },
  ia_sugestao: { label: "IA", color: "bg-purple-100 text-purple-800", icon: Sparkles },
  manual: { label: "Manual", color: "bg-gray-100 text-gray-800", icon: FileText },
  historico: { label: "Histórico", color: "bg-orange-100 text-orange-800", icon: History },
};

export default function HistoricoContestacoes() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  
  // Estados de filtro
  const [busca, setBusca] = useState("");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [resultadoFiltro, setResultadoFiltro] = useState<string>("todos");
  const [page, setPage] = useState(1);
  
  // Estados de modal
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);

  // Queries
  const { data: historicoData, isLoading, refetch } = trpc.recursos.historicoContestacoes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id!,
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    codigoGlosa: busca || undefined,
    resultado: resultadoFiltro !== "todos" ? resultadoFiltro : undefined,
    page,
    limit: 20,
  }, { enabled: !!estabelecimentoAtual?.id });

  const { data: convenios } = trpc.convenios.list.useQuery(
    { ativo: "sim", estabelecimentoId: estabelecimentoAtual?.id },
    { enabled: !!estabelecimentoAtual?.id },
  );

  const formatCurrency = (value: string | number | null) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!num) return "R$ 0,00";
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  
  const handleExportExcel = () => {
    if (!historicoData?.items) return;
    const data = historicoData.items.map((item) => ({
      "Código Glosa": item.codigoGlosa,
      "Descrição Glosa": item.descricaoGlosa || traduzirCodigoGlosa(item.codigoGlosa),
      "Convênio": item.convenioNome || "-",
      "Código Procedimento": item.codigoProcedimento || "-",
      "Descrição Procedimento": item.descricaoProcedimento || "-",
      "Valor Glosado": item.valorGlosado || "0",
      "Valor Recuperado": item.valorRecuperado || "0",
      "Argumento": item.argumentoUtilizado,
      "Origem": ORIGEM_CONFIG[item.argumentoOrigem]?.label || item.argumentoOrigem,
      "Resultado": RESULTADO_CONFIG[item.resultado]?.label || item.resultado,
      "Data Contestação": formatDateBR(item.dataContestacao),
      "Data Resultado": formatDateBR(item.dataResultado),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Histórico");
    XLSX.writeFile(wb, `historico_contestacoes_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleCopiarArgumento = (argumento: string) => {
    navigator.clipboard.writeText(argumento);
    toast.success("Argumento copiado!");
  };

  // Calcular estatísticas
  const totalDeferidos = historicoData?.items?.filter(i => i.resultado === "deferido" || i.resultado === "deferido_parcial").length || 0;
  const totalIndeferidos = historicoData?.items?.filter(i => i.resultado === "indeferido").length || 0;
  const taxaSucesso = historicoData?.items?.length ? Math.round((totalDeferidos / historicoData.items.length) * 100) : 0;

  const totalPages = historicoData?.totalPages || 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-8 w-8" />
              Histórico de Contestações
            </h1>
            <p className="text-muted-foreground">
              Visualize o histórico de argumentos utilizados e seus resultados para aprendizado da IA
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Contestações</p>
                  <p className="text-2xl font-bold">{historicoData?.total || 0}</p>
                </div>
                <History className="h-8 w-8 text-blue-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Deferidos</p>
                  <p className="text-2xl font-bold text-green-600">{totalDeferidos}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Indeferidos</p>
                  <p className="text-2xl font-bold text-red-600">{totalIndeferidos}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
                  <p className="text-2xl font-bold text-purple-600">{taxaSucesso}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por código de glosa..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Convênios</SelectItem>
                  {convenios?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultadoFiltro} onValueChange={setResultadoFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Resultados</SelectItem>
                  {Object.entries(RESULTADO_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Histórico */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : historicoData?.items?.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium mb-2">Nenhum histórico encontrado</h3>
                <p className="text-sm text-muted-foreground">
                  O histórico de contestações será preenchido automaticamente quando recursos forem respondidos
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código Glosa</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-right">Valor Glosado</TableHead>
                      <TableHead className="text-right">Valor Recuperado</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historicoData?.items?.map((item) => {
                      const ResultadoIcon = RESULTADO_CONFIG[item.resultado]?.icon || Clock;
                      const OrigemIcon = ORIGEM_CONFIG[item.argumentoOrigem]?.icon || FileText;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-medium">{item.codigoGlosa}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {item.descricaoGlosa || traduzirCodigoGlosa(item.codigoGlosa)}
                          </TableCell>
                          <TableCell>{item.convenioNome || "-"}</TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {formatCurrency(item.valorGlosado)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(item.valorRecuperado)}
                          </TableCell>
                          <TableCell>
                            <Badge className={ORIGEM_CONFIG[item.argumentoOrigem]?.color}>
                              <OrigemIcon className="h-3 w-3 mr-1" />
                              {ORIGEM_CONFIG[item.argumentoOrigem]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={RESULTADO_CONFIG[item.resultado]?.color}>
                              <ResultadoIcon className="h-3 w-3 mr-1" />
                              {RESULTADO_CONFIG[item.resultado]?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateBR(item.dataContestacao)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setItemSelecionado(item);
                                  setShowDetalhes(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopiarArgumento(item.argumentoUtilizado)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                    <p className="text-sm text-muted-foreground">
                      Página {page} de {totalPages} ({historicoData?.total || 0} registros)
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Próximo
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Modal de Detalhes */}
        <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Detalhes da Contestação
              </DialogTitle>
            </DialogHeader>
            {itemSelecionado && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Código da Glosa</Label>
                    <p className="font-mono font-medium text-lg">{itemSelecionado.codigoGlosa}</p>
                    <p className="text-sm text-muted-foreground">
                      {itemSelecionado.descricaoGlosa || traduzirCodigoGlosa(itemSelecionado.codigoGlosa)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Convênio</Label>
                    <p className="font-medium">{itemSelecionado.convenioNome || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Código Procedimento</Label>
                    <p className="font-medium">{itemSelecionado.codigoProcedimento || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Descrição Procedimento</Label>
                    <p className="font-medium">{itemSelecionado.descricaoProcedimento || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor Glosado</Label>
                    <p className="font-medium text-red-600">{formatCurrency(itemSelecionado.valorGlosado)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor Recuperado</Label>
                    <p className="font-medium text-green-600">{formatCurrency(itemSelecionado.valorRecuperado)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Origem do Argumento</Label>
                    <Badge className={ORIGEM_CONFIG[itemSelecionado.argumentoOrigem]?.color}>
                      {ORIGEM_CONFIG[itemSelecionado.argumentoOrigem]?.label}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Resultado</Label>
                    <Badge className={RESULTADO_CONFIG[itemSelecionado.resultado]?.color}>
                      {RESULTADO_CONFIG[itemSelecionado.resultado]?.label}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Data Contestação</Label>
                    <p className="font-medium">{formatDateBR(itemSelecionado.dataContestacao)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Data Resultado</Label>
                    <p className="font-medium">{formatDateBR(itemSelecionado.dataResultado)}</p>
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-muted-foreground">Argumento Utilizado</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleCopiarArgumento(itemSelecionado.argumentoUtilizado)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border p-4">
                    <p className="whitespace-pre-wrap text-sm">{itemSelecionado.argumentoUtilizado}</p>
                  </ScrollArea>
                </div>
                
                {itemSelecionado.resultado !== "pendente" && (
                  <div className="p-4 rounded-lg bg-muted">
                    <div className="flex items-center gap-2 mb-2">
                      {itemSelecionado.resultado === "deferido" || itemSelecionado.resultado === "deferido_parcial" ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-medium">
                        {itemSelecionado.resultado === "deferido" ? "Argumento foi efetivo!" : 
                         itemSelecionado.resultado === "deferido_parcial" ? "Argumento parcialmente efetivo" :
                         "Argumento não foi aceito"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {itemSelecionado.resultado === "deferido" || itemSelecionado.resultado === "deferido_parcial" 
                        ? "Este argumento será priorizado nas próximas sugestões da IA para este código de glosa."
                        : "A IA aprenderá com este resultado para melhorar as sugestões futuras."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
