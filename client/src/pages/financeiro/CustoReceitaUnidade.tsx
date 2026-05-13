import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { Users, Banknote, Building2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function CustoReceitaUnidade() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const now = new Date();
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mesSelecionado, setMesSelecionado] = useState<string>(defaultMes);

  // You can fetch actual competencias from rh.competencias
  const { data: competencias = [] } = trpc.rh.competencias.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id },
    { enabled: !!estabelecimentoAtual }
  );

  const { data: analiseData = [], isLoading, refetch } = trpc.rh.custoReceitaUnidade.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id, mes: mesSelecionado },
    { enabled: !!estabelecimentoAtual }
  );

  const [ratearCustos, setRatearCustos] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const departamentosInternos = ["recurso glosa", "ti", "enfermeira", "administrativo", "não informada"];
  const isInterno = (nome: string) => {
    const n = nome.toLowerCase().trim();
    if (!n) return true;
    return departamentosInternos.some(d => n === d || n.includes(` ${d} `) || n.endsWith(` ${d}`) || n.startsWith(`${d} `));
  };

  let processedData = analiseData.map(item => ({
    unidade: item.unidade,
    custoDireto: item.custoBruto + item.beneficios,
    custoTotal: item.custoBruto + item.beneficios,
    receita: item.receita,
    lucro: item.receita - (item.custoBruto + item.beneficios),
    funcionarios: (item as any).funcionarios || 0,
    isInterno: isInterno(item.unidade)
  }));

  if (ratearCustos) {
    const internalCosts = processedData.filter(d => d.isInterno).reduce((acc, d) => acc + d.custoTotal, 0);
    const clientUnits = processedData.filter(d => !d.isInterno);
    const totalClientRevenue = clientUnits.reduce((acc, d) => acc + d.receita, 0);

    processedData = clientUnits.map(d => {
      let percent = totalClientRevenue > 0 ? (d.receita / totalClientRevenue) : (1 / clientUnits.length || 0);
      const rateado = internalCosts * percent;
      const novoCusto = d.custoTotal + rateado;
      return {
        ...d,
        custoTotal: novoCusto,
        lucro: d.receita - novoCusto
      };
    });
  }

  const chartData = processedData;

  const totalCusto = chartData.reduce((acc, curr) => acc + curr.custoTotal, 0);
  const totalReceita = chartData.reduce((acc, curr) => acc + curr.receita, 0);
  const totalLucro = totalReceita - totalCusto;
  const totalFuncionarios = chartData.reduce((acc, curr) => acc + curr.funcionarios, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Custo Funcionários x Receita (Contas a Receber)</CardTitle>
            <div className="flex gap-2">
              <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Competência" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const options = [...competencias.filter(c => c.competencia).map(c => c.competencia!)];
                    if (!options.includes(mesSelecionado)) {
                      options.push(mesSelecionado);
                    }
                    // Sort descending
                    options.sort((a, b) => b.localeCompare(a));
                    
                    return options.map(comp => (
                      <SelectItem key={comp} value={comp}>
                        {comp}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()} title="Atualizar">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Switch 
              id="rateio-switch" 
              checked={ratearCustos} 
              onCheckedChange={setRatearCustos} 
            />
            <Label htmlFor="rateio-switch" className="text-sm cursor-pointer">
              Ratear Custos Indiretos (TI, Administrativo, Glosa, etc) proporcionalmente aos clientes
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4 mb-6 mt-4">
            <Card className="bg-muted/10">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-500"><Users className="h-6 w-6" /></div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Funcionários (Mês)</p>
                  <p className="text-2xl font-bold">{totalFuncionarios}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/10">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-full text-red-500"><Banknote className="h-6 w-6" /></div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Custo Total (RH)</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalCusto)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/10">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-500"><Banknote className="h-6 w-6" /></div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contas a Receber (Previsto)</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalReceita)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/10">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-full ${totalLucro >= 0 ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500'}`}>
                  {totalLucro >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Margem Direta</p>
                  <p className={`text-2xl font-bold ${totalLucro >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>{formatCurrency(totalLucro)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">Carregando análise comparativa...</div>
          ) : chartData.length > 0 ? (
            <>
              <div className="h-[400px] w-full mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="unidade" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" />
                    <YAxis tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(val)} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend verticalAlign="top" height={36} />
                    <ReferenceLine y={0} stroke="#000" />
                    <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="custoTotal" name="Custo RH" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lucro" name="Margem" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-8 rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Unidade / Estabelecimento</TableHead>
                      <TableHead className="text-right">Receitas Previstas</TableHead>
                      <TableHead className="text-right">
                        {ratearCustos ? "Custo (Direto + Rateio)" : "Custo Funcionários"}
                      </TableHead>
                      <TableHead className="text-right">Lucro Bruto</TableHead>
                      <TableHead className="text-right">Margem %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chartData.map((row, i) => {
                      const percent = row.receita > 0 ? ((row.lucro / row.receita) * 100).toFixed(1) + "%" : "-";
                      const rateio = row.custoTotal - (row.custoDireto || 0);

                      return (
                        <TableRow key={i} className={row.isInterno && !ratearCustos ? "bg-muted/5 opacity-70" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {row.unidade || "Não Informada"}
                              {row.isInterno && !ratearCustos && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-2">Interno</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-emerald-500">{formatCurrency(row.receita)}</TableCell>
                          <TableCell className="text-right font-medium text-red-500">
                            {formatCurrency(row.custoTotal)}
                            {ratearCustos && rateio > 0 && (
                              <div className="text-[10px] font-normal text-muted-foreground">
                                Rateio: +{formatCurrency(rateio)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${row.lucro >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                            {formatCurrency(row.lucro)}
                          </TableCell>
                          <TableCell className="text-right">{percent}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border rounded bg-muted/5">Nenhum dado encontrado para a competência selecionada. Certifique-se de que a folha foi importada.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
