import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { 
  FileText, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight,
  Eye,
  Download,
  Loader2,
  Trash2,
  RefreshCw
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Arquivos() {
  const [, setLocation] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroDirecao, setFiltroDirecao] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");
  const [selectedArquivo, setSelectedArquivo] = useState<number | null>(null);
  const [arquivoToDelete, setArquivoToDelete] = useState<{ id: number; nome: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: arquivos, isLoading } = trpc.arquivos.list.useQuery({
    busca: busca || undefined,
    tipoArquivo: filtroTipo !== "todos" ? filtroTipo as "xml" | "excel" | "pdf" : undefined,
    direcao: filtroDirecao !== "todos" ? filtroDirecao as "enviado" | "retornado" : undefined,
    status: filtroStatus !== "todos" ? filtroStatus as "pendente" | "processado" | "erro" : undefined,
    convenioId: filtroConvenio !== "todos" ? parseInt(filtroConvenio) : undefined,
    estabelecimentoId,
  }, {
    // Poll every 2 seconds if there are files being processed
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasProcessing = data?.some((a) => a.status === "processando" || a.status === "pendente");
      return hasProcessing ? 2000 : false;
    },
  });

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: procedimentos, isLoading: loadingProcs } = trpc.arquivos.procedimentos.useQuery(
    { arquivoId: selectedArquivo! },
    { enabled: !!selectedArquivo }
  );

  const deleteArquivo = trpc.arquivos.delete.useMutation({
    onSuccess: () => {
      toast.success("Arquivo excluído com sucesso");
      utils.arquivos.list.invalidate();
      utils.arquivos.stats.invalidate();
      utils.dashboard.resumo.invalidate();
      setArquivoToDelete(null);
      setIsDeleting(false);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir arquivo");
      setIsDeleting(false);
    },
  });

  const reprocessarArquivo = trpc.arquivos.reprocessar.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      utils.arquivos.list.invalidate();
      utils.arquivos.stats.invalidate();
      utils.dashboard.resumo.invalidate();
      setIsReprocessing(null);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao reprocessar arquivo");
      setIsReprocessing(null);
    },
  });

  const handleReprocessar = (arquivoId: number) => {
    setIsReprocessing(arquivoId);
    reprocessarArquivo.mutate({ id: arquivoId });
  };

  const handleDeleteArquivo = () => {
    if (!arquivoToDelete) return;
    setIsDeleting(true);
    deleteArquivo.mutate({ id: arquivoToDelete.id });
  };

  const getStatusBadge = (arquivo: any) => {
    const { status, progresso, itensProcessados, totalItens } = arquivo;
    switch (status) {
      case "processado":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Processado</Badge>;
      case "erro":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Erro</Badge>;
      case "processando":
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse">
              Processando {progresso || 0}%
            </Badge>
            {totalItens > 0 && (
              <span className="text-xs text-slate-500">
                {itensProcessados || 0}/{totalItens} itens
              </span>
            )}
          </div>
        );
      default:
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendente</Badge>;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "xml":
        return <Badge variant="outline" className="border-blue-200 text-blue-700">XML</Badge>;
      case "excel":
        return <Badge variant="outline" className="border-green-200 text-green-700">Excel</Badge>;
      default:
        return <Badge variant="outline" className="border-red-200 text-red-700">PDF</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Arquivos</h1>
          <p className="text-slate-500">
            Visualize e gerencie todos os arquivos processados
          </p>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nome do arquivo..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos tipos</SelectItem>
                    <SelectItem value="xml">XML</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroDirecao} onValueChange={setFiltroDirecao}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Direção" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas direções</SelectItem>
                    <SelectItem value="enviado">Enviados</SelectItem>
                    <SelectItem value="retornado">Retornados</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos status</SelectItem>
                    <SelectItem value="processado">Processado</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="erro">Erro</SelectItem>
                  </SelectContent>
                </Select>

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
                    setBusca("");
                    setFiltroTipo("todos");
                    setFiltroDirecao("todos");
                    setFiltroStatus("todos");
                    setFiltroConvenio("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Lista de Arquivos</CardTitle>
                <CardDescription>
                  {arquivos?.length || 0} arquivo(s) encontrado(s)
                </CardDescription>
              </div>
              <Button onClick={() => setLocation("/upload")}>
                Novo Upload
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : arquivos?.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Nenhum arquivo encontrado</p>
                <Button variant="outline" className="mt-4" onClick={() => setLocation("/upload")}>
                  Fazer upload
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Direção</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arquivos?.map((arquivo) => (
                      <TableRow key={arquivo.id} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                              arquivo.direcao === "enviado" ? "bg-blue-100" : "bg-green-100"
                            }`}>
                              {arquivo.direcao === "enviado" ? (
                                <ArrowUpRight className="h-5 w-5 text-blue-600" />
                              ) : (
                                <ArrowDownRight className="h-5 w-5 text-green-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 truncate max-w-[200px]">
                                {arquivo.nome}
                              </p>
                              <p className="text-xs text-slate-500">
                                {arquivo.tamanho ? `${(arquivo.tamanho / 1024).toFixed(1)} KB` : "-"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getTipoBadge(arquivo.tipoArquivo)}</TableCell>
                        <TableCell>
                          <span className={`text-sm ${
                            arquivo.direcao === "enviado" ? "text-blue-600" : "text-green-600"
                          }`}>
                            {arquivo.direcao === "enviado" ? "Enviado" : "Retornado"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600">
                            {convenios?.find(c => c.id === arquivo.convenioId)?.nome || "-"}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(arquivo)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-500">
                            {new Date(arquivo.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedArquivo(arquivo.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(arquivo.s3Url, "_blank")}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => handleReprocessar(arquivo.id)}
                              disabled={isReprocessing === arquivo.id}
                              title="Reprocessar arquivo"
                            >
                              {isReprocessing === arquivo.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setArquivoToDelete({ id: arquivo.id, nome: arquivo.nome })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Procedimentos Dialog */}
      <Dialog open={!!selectedArquivo} onOpenChange={() => setSelectedArquivo(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Procedimentos Extraídos</DialogTitle>
            <DialogDescription>
              Lista de procedimentos identificados no arquivo
            </DialogDescription>
          </DialogHeader>
          {loadingProcs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : procedimentos?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">Nenhum procedimento encontrado neste arquivo</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor Unit.</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedimentos?.map((proc) => (
                    <TableRow key={proc.id}>
                      <TableCell className="font-mono text-sm">{proc.codigo}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {proc.descricao || "-"}
                      </TableCell>
                      <TableCell className="text-right">{proc.quantidade || 1}</TableCell>
                      <TableCell className="text-right">
                        {proc.valorUnitario 
                          ? `R$ ${parseFloat(proc.valorUnitario).toFixed(2)}`
                          : "-"
                        }
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {proc.valorTotal 
                          ? `R$ ${parseFloat(proc.valorTotal).toFixed(2)}`
                          : "-"
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!arquivoToDelete} onOpenChange={() => !isDeleting && setArquivoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o arquivo <strong>"{arquivoToDelete?.nome}"</strong>?
              <br /><br />
              Esta ação irá remover permanentemente o arquivo e todos os procedimentos extraídos dele.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteArquivo}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Arquivo"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
