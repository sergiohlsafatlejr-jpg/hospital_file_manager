import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Package, 
  Calendar, 
  DollarSign, 
  FileText, 
  Upload, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Search,
  Filter,
  Eye,
  Paperclip,
  Building2,
  ChevronRight
} from "lucide-react";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR");
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-800", icon: <FileText className="h-4 w-4" /> },
  pendente_envio: { label: "Pendente Envio", color: "bg-yellow-100 text-yellow-800", icon: <Clock className="h-4 w-4" /> },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-800", icon: <Upload className="h-4 w-4" /> },
  em_analise: { label: "Em Análise", color: "bg-purple-100 text-purple-800", icon: <AlertTriangle className="h-4 w-4" /> },
  respondido: { label: "Respondido", color: "bg-orange-100 text-orange-800", icon: <CheckCircle2 className="h-4 w-4" /> },
  finalizado: { label: "Finalizado", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function AcompanhamentoRecursos() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [loteDetalhes, setLoteDetalhes] = useState<any>(null);
  const [dialogDetalhes, setDialogDetalhes] = useState(false);
  const [dialogAnexo, setDialogAnexo] = useState(false);
  const [loteParaAnexo, setLoteParaAnexo] = useState<number | null>(null);
  const [protocoloEnvio, setProtocoloEnvio] = useState("");

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  const { data: lotes, isLoading, refetch } = trpc.recursos.listarLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    status: statusFiltro !== "todos" ? statusFiltro as any : undefined,
    search: busca || undefined,
  });

  const { data: resumo } = trpc.recursos.resumoLotes.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const atualizarLoteMutation = trpc.recursos.atualizarLote.useMutation({
    onSuccess: () => {
      toast.success("Lote atualizado com sucesso!");
      refetch();
      setDialogAnexo(false);
      setLoteParaAnexo(null);
      setProtocoloEnvio("");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleVerDetalhes = async (lote: any) => {
    setLoteDetalhes(lote);
    setDialogDetalhes(true);
  };

  const handleAbrirAnexo = (loteId: number) => {
    setLoteParaAnexo(loteId);
    setDialogAnexo(true);
  };

  const handleSalvarProtocolo = () => {
    if (!loteParaAnexo) return;
    
    atualizarLoteMutation.mutate({
      loteId: loteParaAnexo,
      protocoloEnvio,
      status: "enviado",
      dataEnvio: new Date(),
    });
  };

  const calcularDiasRestantes = (dataPrazo: Date | string | null | undefined) => {
    if (!dataPrazo) return null;
    const prazo = typeof dataPrazo === "string" ? new Date(dataPrazo) : dataPrazo;
    const hoje = new Date();
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Acompanhamento de Recursos</h1>
          <p className="text-muted-foreground">
            Gerencie os lotes de recursos enviados aos convênios
          </p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Lotes</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.totalLotes || 0}</div>
            <p className="text-xs text-muted-foreground">
              {resumo?.lotesEnviados || 0} enviados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Glosado</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(resumo?.valorTotalGlosado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total em recursos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Recursado</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(resumo?.valorTotalRecursado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando resposta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Recuperado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(resumo?.valorTotalRecuperado || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo?.valorTotalRecursado ? `${((resumo.valorTotalRecuperado / resumo.valorTotalRecursado) * 100).toFixed(1)}% de sucesso` : "0% de sucesso"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número do lote ou protocolo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="min-w-[180px]">
              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os convênios</SelectItem>
                  {convenios?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Lotes */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes de Recursos</CardTitle>
          <CardDescription>
            Clique em um lote para ver os detalhes e itens recursados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : !lotes || !lotes.lotes || lotes.lotes.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum lote encontrado</h3>
              <p className="text-muted-foreground">
                Os lotes de recursos aparecerão aqui quando você criar recursos na tela de Análise de Glosa
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotes.lotes.map((lote: any) => {
                const statusConfig = STATUS_CONFIG[lote.status] || STATUS_CONFIG.rascunho;
                const diasRestantes = calcularDiasRestantes(lote.dataPrazoPagamento);
                
                return (
                  <div
                    key={lote.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleVerDetalhes(lote)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Package className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">Lote {lote.numeroLote}</h3>
                            <Badge className={statusConfig.color}>
                              {statusConfig.icon}
                              <span className="ml-1">{statusConfig.label}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {lote.convenioNome || "Convênio"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(lote.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              {lote.quantidadeItens || 0} itens
                            </span>
                          </div>
                          {lote.protocoloEnvio && (
                            <p className="text-sm mt-1">
                              <span className="text-muted-foreground">Protocolo:</span>{" "}
                              <span className="font-medium">{lote.protocoloEnvio}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Glosado:</span>{" "}
                            <span className="font-medium text-red-600">
                              {formatCurrency(lote.valorTotalGlosado)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Recursado:</span>{" "}
                            <span className="font-medium text-orange-600">
                              {formatCurrency(lote.valorTotalRecursado)}
                            </span>
                          </div>
                          {lote.valorTotalRecuperado > 0 && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Recuperado:</span>{" "}
                              <span className="font-medium text-green-600">
                                {formatCurrency(lote.valorTotalRecuperado)}
                              </span>
                            </div>
                          )}
                        </div>
                        {diasRestantes !== null && diasRestantes >= 0 && (
                          <Badge 
                            variant={diasRestantes <= 5 ? "destructive" : "outline"} 
                            className="mt-2"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {diasRestantes} dias para pagamento
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t">
                      <div className="flex gap-2">
                        {!lote.protocoloEnvio && lote.status === "pendente_envio" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAbrirAnexo(lote.id);
                            }}
                          >
                            <Paperclip className="h-4 w-4 mr-1" />
                            Registrar Envio
                          </Button>
                        )}
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes do Lote */}
      <Dialog open={dialogDetalhes} onOpenChange={setDialogDetalhes}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Lote {loteDetalhes?.numeroLote}</DialogTitle>
            <DialogDescription>
              Visualize os itens recursados e o status do lote
            </DialogDescription>
          </DialogHeader>
          
          {loteDetalhes && (
            <div className="space-y-6">
              {/* Informações do Lote */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={STATUS_CONFIG[loteDetalhes.status]?.color || "bg-gray-100"}>
                    {STATUS_CONFIG[loteDetalhes.status]?.label || loteDetalhes.status}
                  </Badge>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Convênio</p>
                  <p className="font-medium">{loteDetalhes.convenioNome}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Data Envio</p>
                  <p className="font-medium">{formatDate(loteDetalhes.dataEnvio)}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-medium">{loteDetalhes.protocoloEnvio || "-"}</p>
                </div>
              </div>

              {/* Valores */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                    <p className="text-xl font-bold text-red-600">
                      {formatCurrency(loteDetalhes.valorTotalGlosado)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recursado</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(loteDetalhes.valorTotalRecursado)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor Recuperado</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(loteDetalhes.valorTotalRecuperado)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de Itens */}
              {loteDetalhes.itens && loteDetalhes.itens.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Itens Recursados ({loteDetalhes.itens.length})</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Guia</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="text-right">Vl. Glosado</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loteDetalhes.itens.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.guiaNumero || "-"}</TableCell>
                            <TableCell>{item.codigoProcedimento}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {item.descricaoProcedimento}
                            </TableCell>
                            <TableCell>{item.pacienteNome || "-"}</TableCell>
                            <TableCell className="text-right text-red-600">
                              {formatCurrency(item.valorGlosado)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.status === "deferido" ? "Deferido" : 
                                 item.status === "indeferido" ? "Indeferido" : 
                                 item.status === "enviado" ? "Enviado" : "Pendente"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Anexo PDF */}
              {loteDetalhes.anexoPdfUrl && (
                <div>
                  <h4 className="font-medium mb-3">Comprovante de Envio</h4>
                  <Button variant="outline" asChild>
                    <a href={loteDetalhes.anexoPdfUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 mr-2" />
                      Visualizar PDF
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDetalhes(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Registrar Envio */}
      <Dialog open={dialogAnexo} onOpenChange={setDialogAnexo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Envio do Recurso</DialogTitle>
            <DialogDescription>
              Informe o protocolo de envio para registrar que o recurso foi enviado ao convênio
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Protocolo de Envio</label>
              <Input
                placeholder="Ex: 2024-001234"
                value={protocoloEnvio}
                onChange={(e) => setProtocoloEnvio(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAnexo(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSalvarProtocolo}
              disabled={!protocoloEnvio || atualizarLoteMutation.isPending}
            >
              {atualizarLoteMutation.isPending ? "Salvando..." : "Registrar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
