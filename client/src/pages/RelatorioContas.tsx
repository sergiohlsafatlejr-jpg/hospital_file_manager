import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  FileText, 
  Download, 
  Calendar, 
  DollarSign, 
  Pill, 
  Package, 
  Bed, 
  Receipt, 
  Flame,
  BarChart3,
  PieChart
} from "lucide-react";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
};

const TIPO_DESPESA_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  "01": { label: "Gás", icon: <Flame className="h-5 w-5" />, color: "bg-orange-100 text-orange-700" },
  "02": { label: "Medicamento", icon: <Pill className="h-5 w-5" />, color: "bg-blue-100 text-blue-700" },
  "03": { label: "Material", icon: <Package className="h-5 w-5" />, color: "bg-green-100 text-green-700" },
  "05": { label: "Diária", icon: <Bed className="h-5 w-5" />, color: "bg-purple-100 text-purple-700" },
  "07": { label: "Taxa", icon: <Receipt className="h-5 w-5" />, color: "bg-yellow-100 text-yellow-700" },
  "outros": { label: "Outros", icon: <FileText className="h-5 w-5" />, color: "bg-gray-100 text-gray-700" },
};

export default function RelatorioContas() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [anoReferencia, setAnoReferencia] = useState<string>("");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  const { data: procedimentos, isLoading } = trpc.procedimentos.list.useQuery({
    convenioId: convenioFiltro !== "todos" ? parseInt(convenioFiltro) : undefined,
    estabelecimentoId: estabelecimentoAtual?.id,
    mesReferencia: mesReferencia ? parseInt(mesReferencia) : undefined,
    anoReferencia: anoReferencia ? parseInt(anoReferencia) : undefined,
    pageSize: 10000,
  }, { enabled: !!estabelecimentoAtual });

  // Agrupar dados por tipo de despesa
  const resumoPorTipo = useMemo(() => {
    if (!procedimentos?.items) return [];

    const grupos: Record<string, { 
      tipo: string; 
      quantidade: number; 
      valorTotal: number; 
      valorMedio: number;
      guias: Set<string>;
    }> = {};

    procedimentos.items.forEach((proc: any) => {
      const tipo = proc.codigoDespesa || "outros";
      const valor = parseFloat(proc.valorTotal || proc.valorUnitario || "0");

      if (!grupos[tipo]) {
        grupos[tipo] = {
          tipo,
          quantidade: 0,
          valorTotal: 0,
          valorMedio: 0,
          guias: new Set(),
        };
      }

      grupos[tipo].quantidade += 1;
      grupos[tipo].valorTotal += valor;
      if (proc.numeroGuiaPrestador) {
        grupos[tipo].guias.add(proc.numeroGuiaPrestador);
      }
    });

    // Calcular valor médio
    Object.values(grupos).forEach((grupo) => {
      grupo.valorMedio = grupo.quantidade > 0 ? grupo.valorTotal / grupo.quantidade : 0;
    });

    return Object.values(grupos).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [procedimentos]);

  // Calcular totais gerais
  const totaisGerais = useMemo(() => {
    return resumoPorTipo.reduce(
      (acc, grupo) => ({
        quantidade: acc.quantidade + grupo.quantidade,
        valorTotal: acc.valorTotal + grupo.valorTotal,
        guias: acc.guias + grupo.guias.size,
      }),
      { quantidade: 0, valorTotal: 0, guias: 0 }
    );
  }, [resumoPorTipo]);

  // Exportar para Excel
  const handleExportar = () => {
    if (!resumoPorTipo.length) return;

    const linhas = [
      ["Tipo de Despesa", "Quantidade", "Valor Total", "Valor Médio", "Qtd Guias"],
      ...resumoPorTipo.map((grupo) => {
        const config = TIPO_DESPESA_CONFIG[grupo.tipo] || TIPO_DESPESA_CONFIG.outros;
        return [
          config.label,
          grupo.quantidade.toString(),
          formatCurrency(grupo.valorTotal),
          formatCurrency(grupo.valorMedio),
          grupo.guias.size.toString(),
        ];
      }),
      ["", "", "", "", ""],
      ["TOTAL", totaisGerais.quantidade.toString(), formatCurrency(totaisGerais.valorTotal), "", totaisGerais.guias.toString()],
    ];

    const csvContent = linhas.map((linha) => linha.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-contas-${mesReferencia || "todos"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Contas</h1>
          <p className="text-muted-foreground">
            Visualize os totais agrupados por tipo de despesa
          </p>
        </div>
        <Button onClick={handleExportar} disabled={!resumoPorTipo.length}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[150px]">
              <label className="text-sm font-medium mb-2 block">Mês Referência</label>
              <Select value={mesReferencia} onValueChange={setMesReferencia}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  <SelectItem value="1">Janeiro</SelectItem>
                  <SelectItem value="2">Fevereiro</SelectItem>
                  <SelectItem value="3">Março</SelectItem>
                  <SelectItem value="4">Abril</SelectItem>
                  <SelectItem value="5">Maio</SelectItem>
                  <SelectItem value="6">Junho</SelectItem>
                  <SelectItem value="7">Julho</SelectItem>
                  <SelectItem value="8">Agosto</SelectItem>
                  <SelectItem value="9">Setembro</SelectItem>
                  <SelectItem value="10">Outubro</SelectItem>
                  <SelectItem value="11">Novembro</SelectItem>
                  <SelectItem value="12">Dezembro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <label className="text-sm font-medium mb-2 block">Ano Referência</label>
              <Select value={anoReferencia} onValueChange={setAnoReferencia}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os anos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os anos</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Convênio</label>
              <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o convênio" />
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
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Itens</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totaisGerais.quantidade.toLocaleString("pt-BR")}</div>
            <p className="text-xs text-muted-foreground">
              {resumoPorTipo.length} tipos de despesa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totaisGerais.valorTotal)}
            </div>
            <p className="text-xs text-muted-foreground">
              Soma de todos os itens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Guias</CardTitle>
            <FileText className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totaisGerais.guias.toLocaleString("pt-BR")}</div>
            <p className="text-xs text-muted-foreground">
              Guias únicas processadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards por Tipo de Despesa */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : resumoPorTipo.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <PieChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum dado encontrado</h3>
            <p className="text-muted-foreground">
              Importe arquivos XML para visualizar o relatório de contas
            </p>
          </div>
        ) : (
          resumoPorTipo.map((grupo) => {
            const config = TIPO_DESPESA_CONFIG[grupo.tipo] || TIPO_DESPESA_CONFIG.outros;
            const percentual = totaisGerais.valorTotal > 0 
              ? ((grupo.valorTotal / totaisGerais.valorTotal) * 100).toFixed(1) 
              : "0";

            return (
              <Card key={grupo.tipo} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      {config.icon}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {percentual}%
                    </span>
                  </div>
                  <CardTitle className="text-lg">{config.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantidade:</span>
                      <span className="font-medium">{grupo.quantidade.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor Total:</span>
                      <span className="font-medium text-green-600">{formatCurrency(grupo.valorTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor Médio:</span>
                      <span className="font-medium">{formatCurrency(grupo.valorMedio)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Guias:</span>
                      <span className="font-medium">{grupo.guias.size}</span>
                    </div>
                  </div>
                  {/* Barra de progresso */}
                  <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ width: `${percentual}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Tabela Detalhada */}
      {resumoPorTipo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Tipo de Despesa</CardTitle>
            <CardDescription>
              Visão consolidada dos valores por categoria
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de Despesa</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Valor Médio</TableHead>
                  <TableHead className="text-right">Qtd Guias</TableHead>
                  <TableHead className="text-right">% do Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumoPorTipo.map((grupo) => {
                  const config = TIPO_DESPESA_CONFIG[grupo.tipo] || TIPO_DESPESA_CONFIG.outros;
                  const percentual = totaisGerais.valorTotal > 0 
                    ? ((grupo.valorTotal / totaisGerais.valorTotal) * 100).toFixed(1) 
                    : "0";

                  return (
                    <TableRow key={grupo.tipo}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded ${config.color}`}>
                            {config.icon}
                          </div>
                          <span className="font-medium">{config.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{grupo.quantidade.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(grupo.valorTotal)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(grupo.valorMedio)}</TableCell>
                      <TableCell className="text-right">{grupo.guias.size}</TableCell>
                      <TableCell className="text-right">{percentual}%</TableCell>
                    </TableRow>
                  );
                })}
                {/* Linha de Total */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{totaisGerais.quantidade.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(totaisGerais.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right">{totaisGerais.guias}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
