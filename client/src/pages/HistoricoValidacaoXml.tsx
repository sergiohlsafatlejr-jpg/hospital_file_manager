import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeParseDate } from "@/lib/dateUtils";
import { ArrowLeft, Download, Trash2, Filter } from "lucide-react";
import { useLocation } from "wouter";

export function HistoricoValidacaoXml() {
  const [, navigate] = useLocation();
  const [estabelecimentoId] = useState(1); // TODO: Pegar do contexto
  const [filtroData, setFiltroData] = useState("");
  const [filtroArquivo, setFiltroArquivo] = useState("");
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataFim, setDataFim] = useState<Date | undefined>();

  // Listar histórico
  const { data: historico = [], isLoading } = trpc.motorRegras.listarHistorico.useQuery({
    estabelecimentoId,
    dataInicio,
    dataFim,
    limit: 100,
    offset: 0,
  });

  // Obter estatísticas
  const { data: stats } = trpc.motorRegras.obterEstatisticas.useQuery({
    estabelecimentoId,
    dataInicio,
    dataFim,
  });

  // Deletar validação
  const deletarMutation = trpc.motorRegras.deletarValidacao.useMutation({
    onSuccess: () => {
      // Invalidar cache
      trpc.useUtils().motorRegras.listarHistorico.invalidate();
      trpc.useUtils().motorRegras.obterEstatisticas.invalidate();
    },
  });

  // Filtrar dados
  const historicoFiltrado = useMemo(() => {
    return historico.filter((item: any) => {
      const nomeArquivo = item.nomeArquivo?.toLowerCase() || "";
      const dataProcessamento = item.dataProcessamento ? format(safeParseDate(item.dataProcessamento) || new Date(), "dd/MM/yyyy") : "";

      return (
        nomeArquivo.includes(filtroArquivo.toLowerCase()) &&
        dataProcessamento.includes(filtroData)
      );
    });
  }, [historico, filtroArquivo, filtroData]);

  const handleExportarCsv = () => {
    const headers = [
      "Data de Processamento",
      "Arquivo",
      "Total de Contas",
      "Contas Válidas",
      "Contas Inválidas",
      "Score de Conformidade",
      "Taxa de Conformidade",
    ];

    const rows = historicoFiltrado.map((item: any) => [
      format(safeParseDate(item.dataProcessamento) || new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      item.nomeArquivo,
      String(item.totalContas),
      String(item.contasValidas),
      String(item.contasInvalidas),
      String(item.scoreConformidadeMedio),
      `${((item.contasValidas / item.totalContas) * 100).toFixed(2)}%`,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-validacao-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1 as any)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Histórico de Validações XML</h1>
            <p className="text-muted-foreground">Acompanhe todas as validações de arquivos XML importados</p>
          </div>
        </div>
        <Button onClick={handleExportarCsv} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Validações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalValidacoes}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Contas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalContas}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conformidade</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.taxaConformidade.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.contasValidas} de {stats.totalContas} contas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Score Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scoreConformidadeMedia.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground mt-1">de 100</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data (DD/MM/YYYY)</label>
              <Input
                placeholder="Buscar por data..."
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nome do Arquivo</label>
              <Input
                placeholder="Buscar por arquivo..."
                value={filtroArquivo}
                onChange={(e) => setFiltroArquivo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Validações Realizadas</CardTitle>
          <CardDescription>{historicoFiltrado.length} registros encontrados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando histórico...</div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma validação encontrada</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Data</th>
                    <th className="text-left py-3 px-4 font-medium">Arquivo</th>
                    <th className="text-center py-3 px-4 font-medium">Total</th>
                    <th className="text-center py-3 px-4 font-medium">Válidas</th>
                    <th className="text-center py-3 px-4 font-medium">Inválidas</th>
                    <th className="text-center py-3 px-4 font-medium">Score</th>
                    <th className="text-center py-3 px-4 font-medium">Taxa</th>
                    <th className="text-center py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoFiltrado.map((item: any) => {
                    const taxaConformidade = item.totalContas > 0 ? (item.contasValidas / item.totalContas) * 100 : 0;
                    const statusBadge = taxaConformidade >= 90 ? "success" : taxaConformidade >= 70 ? "warning" : "destructive";

                    return (
                      <tr key={item.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          {format(safeParseDate(item.dataProcessamento) || new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </td>
                        <td className="py-3 px-4 font-medium">{item.nomeArquivo}</td>
                        <td className="py-3 px-4 text-center">{item.totalContas}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="outline" className="bg-green-50">
                            {item.contasValidas}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="outline" className="bg-red-50">
                            {item.contasInvalidas}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">{item.scoreConformidadeMedio.toFixed(1)}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={statusBadge === "success" ? "default" : statusBadge === "warning" ? "secondary" : "destructive"}>
                            {taxaConformidade.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletarMutation.mutate({ id: item.id })}
                            disabled={deletarMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
