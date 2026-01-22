import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Download, FileWarning, DollarSign, Clock, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";

export default function NaoRecebidos() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [mesReferencia, setMesReferencia] = useState<number>(new Date().getMonth() + 1);
  const [anoReferencia, setAnoReferencia] = useState<number>(new Date().getFullYear());
  const [convenioId, setConvenioId] = useState<number | undefined>(undefined);
  const [pagina, setPagina] = useState(1);
  const [filtroAplicado, setFiltroAplicado] = useState(false);

  const { data: convenios } = trpc.convenios.list.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  const { data, isLoading, refetch } = trpc.conciliacao.naoRecebidos.useQuery(
    {
      convenioId,
      estabelecimentoId: estabelecimentoAtual?.id,
      mesReferencia,
      anoReferencia,
      pagina,
      itensPorPagina: 50,
    },
    { enabled: filtroAplicado }
  );

  const meses = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  const anos = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => anoAtual - i);
  }, []);

  const handleAplicarFiltro = () => {
    setPagina(1);
    setFiltroAplicado(true);
    refetch();
  };

  const handleExportarExcel = () => {
    if (!data?.itens || data.itens.length === 0) return;

    const dadosExport = data.itens.map((item) => ({
      "Guia": item.guiaNumero,
      "Lote": item.numeroLote,
      "Data Execução": item.dataExecucao,
      "Código": item.codigo,
      "Descrição": item.descricao,
      "Paciente": item.pacienteNome,
      "Valor Faturado": item.valorFaturado,
      "Status": "Não Recebido",
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens Não Recebidos");
    XLSX.writeFile(wb, `itens-nao-recebidos-${mesReferencia}-${anoReferencia}.xlsx`);
  };

  const totalPaginas = Math.ceil((data?.total || 0) / 50);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Tela inicial de seleção de período
  if (!filtroAplicado) {
    return (
      <div className="container py-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <CardTitle className="text-2xl">Itens Não Recebidos</CardTitle>
              <CardDescription>
                Acompanhe as contas pendentes de pagamento separadamente das glosas.
                Selecione o período de referência para visualizar os itens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mês de Referência</label>
                  <Select
                    value={mesReferencia.toString()}
                    onValueChange={(v) => setMesReferencia(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meses.map((mes) => (
                        <SelectItem key={mes.value} value={mes.value.toString()}>
                          {mes.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ano de Referência</label>
                  <Select
                    value={anoReferencia.toString()}
                    onValueChange={(v) => setAnoReferencia(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {anos.map((ano) => (
                        <SelectItem key={ano} value={ano.toString()}>
                          {ano}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio (opcional)</label>
                <Select
                  value={convenioId?.toString() || "todos"}
                  onValueChange={(v) => setConvenioId(v === "todos" ? undefined : parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {convenios?.map((conv) => (
                      <SelectItem key={conv.id} value={conv.id.toString()}>
                        {conv.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" size="lg" onClick={handleAplicarFiltro}>
                <Calendar className="w-4 h-4 mr-2" />
                Buscar Itens Não Recebidos
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Itens Não Recebidos</h1>
          <p className="text-muted-foreground">
            Referência: {meses.find((m) => m.value === mesReferencia)?.label} / {anoReferencia}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltroAplicado(false)}>
            <Calendar className="w-4 h-4 mr-2" />
            Alterar Período
          </Button>
          <Button variant="outline" onClick={handleExportarExcel} disabled={!data?.itens?.length}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Itens</CardTitle>
            <FileWarning className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{data?.resumo?.totalItens || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Aguardando retorno</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Pendente</CardTitle>
            <DollarSign className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">
                {formatCurrency(data?.resumo?.valorTotal || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">A receber dos convênios</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Convênios</CardTitle>
            <Building2 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{data?.resumo?.porConvenio?.length || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Com itens pendentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por Convênio */}
      {data?.resumo?.porConvenio && data.resumo.porConvenio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo por Convênio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.resumo.porConvenio.map((conv) => (
                <div
                  key={conv.convenioId}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{conv.convenioNome}</p>
                    <p className="text-sm text-muted-foreground">{conv.totalItens} itens</p>
                  </div>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    {formatCurrency(conv.valorTotal)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Itens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhamento dos Itens</CardTitle>
          <CardDescription>
            {data?.total || 0} itens encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.itens && data.itens.length > 0 ? (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guia</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.itens.map((item, index) => (
                      <TableRow key={`${item.guiaNumero}-${item.codigo}-${index}`}>
                        <TableCell className="font-medium">{item.guiaNumero || "-"}</TableCell>
                        <TableCell>{item.numeroLote || "-"}</TableCell>
                        <TableCell>{item.dataExecucao || "-"}</TableCell>
                        <TableCell>{item.codigo}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                          {item.descricao || "-"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={item.pacienteNome}>
                          {item.pacienteNome || "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.valorFaturado)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendente
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {pagina} de {totalPaginas}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      disabled={pagina === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                      disabled={pagina === totalPaginas}
                    >
                      Próxima
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Nenhum item não recebido</h3>
              <p className="text-muted-foreground">
                Todos os itens do período selecionado foram processados pelos convênios.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
