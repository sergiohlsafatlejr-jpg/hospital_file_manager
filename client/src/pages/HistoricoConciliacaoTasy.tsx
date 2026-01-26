import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  History, 
  Eye, 
  Trash2, 
  Calendar, 
  DollarSign, 
  TrendingDown, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  BarChart3
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function HistoricoConciliacaoTasy() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, navigate] = useLocation();
  const [anoFiltro, setAnoFiltro] = useState<string>("");
  const [mesFiltro, setMesFiltro] = useState<string>("");
  const [conciliacaoSelecionada, setConciliacaoSelecionada] = useState<number | null>(null);

  // Buscar histórico de conciliações
  const { data: historico, isLoading, refetch } = trpc.historicoConciliacao.listar.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      mesReferencia: mesFiltro && mesFiltro !== 'all' ? parseInt(mesFiltro) : undefined,
      anoReferencia: anoFiltro && anoFiltro !== 'all' ? parseInt(anoFiltro) : undefined,
      limite: 50,
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Mutation para excluir conciliação
  const excluirMutation = trpc.historicoConciliacao.excluir.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Conciliação excluída com sucesso!');
        refetch();
      } else {
        toast.error('Erro ao excluir conciliação');
      }
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  // Buscar evolução das conciliações
  const { data: evolucao } = trpc.historicoConciliacao.evolucao.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      meses: 6,
    },
    { enabled: !!estabelecimentoAtual }
  );

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '-';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const getMesNome = (mes: number | null | undefined) => {
    if (!mes) return 'Todos';
    const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return meses[mes] || 'Todos';
  };

  const anosDisponiveis = [2024, 2025, 2026];
  const mesesDisponiveis = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/conciliacao-tasy')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Histórico de Conciliações</h1>
              <p className="text-muted-foreground">
                Visualize e gerencie as conciliações salvas
              </p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Mês</label>
                <Select value={mesFiltro} onValueChange={setMesFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {mesesDisponiveis.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Ano</label>
                <Select value={anoFiltro} onValueChange={setAnoFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os anos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os anos</SelectItem>
                    {anosDisponiveis.map((a) => (
                      <SelectItem key={a} value={String(a)}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo da Evolução */}
        {evolucao && evolucao.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Evolução das Conciliações
              </CardTitle>
              <CardDescription>
                Resumo dos últimos meses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {evolucao.map((item, index) => (
                  <div key={index} className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {getMesNome(item.mesReferencia)}/{item.anoReferencia}
                    </p>
                    <p className="text-lg font-bold">{item.totalContas || 0}</p>
                    <p className="text-xs text-muted-foreground">contas</p>
                    <p className="text-sm text-green-600">
                      {formatCurrency(item.valorTotalPago)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de Conciliações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Conciliações Salvas
            </CardTitle>
            <CardDescription>
              {historico?.length || 0} conciliações encontradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !historico || historico.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma conciliação salva ainda.</p>
                <p className="text-sm">Acesse a tela de Conciliação Tasy para criar uma nova.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead className="text-right">Total Contas</TableHead>
                    <TableHead className="text-right">OK</TableHead>
                    <TableHead className="text-right">Glosas</TableHead>
                    <TableHead className="text-right">Valor Tasy</TableHead>
                    <TableHead className="text-right">Valor Pago</TableHead>
                    <TableHead className="text-right">Glosa %</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
                      <TableCell>
                        {item.mesReferencia && item.anoReferencia 
                          ? `${getMesNome(item.mesReferencia)}/${item.anoReferencia}`
                          : 'Todos'
                        }
                      </TableCell>
                      <TableCell>{item.convenioNome || 'Todos'}</TableCell>
                      <TableCell className="text-right">{item.totalContas}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {item.contasOk}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-red-50 text-red-700">
                          {item.contasComGlosa}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.valorTotalTasy)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.valorTotalPago)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={parseFloat(String(item.percentualGlosa || 0)) > 5 ? "destructive" : "secondary"}>
                          {parseFloat(String(item.percentualGlosa || 0)).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setConciliacaoSelecionada(item.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Detalhes da Conciliação</DialogTitle>
                                <DialogDescription>
                                  {formatDate(item.createdAt)} - {item.convenioNome || 'Todos os convênios'}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="p-3 bg-muted rounded-lg text-center">
                                    <p className="text-sm text-muted-foreground">Total Contas</p>
                                    <p className="text-xl font-bold">{item.totalContas}</p>
                                  </div>
                                  <div className="p-3 bg-green-50 rounded-lg text-center">
                                    <p className="text-sm text-green-700">Contas OK</p>
                                    <p className="text-xl font-bold text-green-700">{item.contasOk}</p>
                                  </div>
                                  <div className="p-3 bg-red-50 rounded-lg text-center">
                                    <p className="text-sm text-red-700">Com Glosa</p>
                                    <p className="text-xl font-bold text-red-700">{item.contasComGlosa}</p>
                                  </div>
                                  <div className="p-3 bg-gray-50 rounded-lg text-center">
                                    <p className="text-sm text-gray-700">Não Encontradas</p>
                                    <p className="text-xl font-bold text-gray-700">{item.contasNaoEncontradas}</p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">Valor Total Tasy</p>
                                    <p className="text-2xl font-bold">{formatCurrency(item.valorTotalTasy)}</p>
                                  </div>
                                  <div className="p-4 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">Valor Total Pago</p>
                                    <p className="text-2xl font-bold text-green-600">{formatCurrency(item.valorTotalPago)}</p>
                                  </div>
                                  <div className="p-4 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">Valor Glosado</p>
                                    <p className="text-2xl font-bold text-red-600">{formatCurrency(item.valorTotalGlosado)}</p>
                                  </div>
                                  <div className="p-4 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">Diferença</p>
                                    <p className="text-2xl font-bold text-yellow-600">{formatCurrency(item.valorDiferenca)}</p>
                                  </div>
                                </div>
                                {item.observacoes && (
                                  <div className="p-4 border rounded-lg">
                                    <p className="text-sm text-muted-foreground">Observações</p>
                                    <p>{item.observacoes}</p>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Conciliação</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir esta conciliação? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => excluirMutation.mutate({ resultadoId: item.id })}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
