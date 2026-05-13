import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, DollarSign, Building2, BarChart3, AlertTriangle, Briefcase, Activity, PieChart as PieChartIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { useMemo } from "react";

export default function FolhaPagamento() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [competenciaSelecionada, setCompetenciaSelecionada] = useState<string>("todos");

  const { data: competencias = [] } = trpc.rh.competencias.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id },
    { enabled: !!estabelecimentoAtual }
  );

  const { data: folhaData = [], isLoading } = trpc.rh.listFolha.useQuery(
    { 
      estabelecimentoId: estabelecimentoAtual?.id,
      competencia: competenciaSelecionada !== "todos" ? competenciaSelecionada : undefined 
    },
    { enabled: !!estabelecimentoAtual }
  );

  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>("todas");

  const unidadesUnicas = useMemo(() => {
    const units = new Set<string>();
    folhaData.forEach(row => units.add(row.unidade || "Não Informada"));
    return Array.from(units).sort();
  }, [folhaData]);

  const folhaExibida = useMemo(() => {
    if (unidadeSelecionada === "todas") return folhaData;
    return folhaData.filter(row => (row.unidade || "Não Informada") === unidadeSelecionada);
  }, [folhaData, unidadeSelecionada]);

  const formatCurrency = (val: string | null | undefined) => {
    if (!val) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(val));
  };

  const totalSalarioBruto = folhaExibida.reduce((acc, row) => acc + (parseFloat(row.salarioBruto || "0") || 0), 0);
  const totalBeneficios = folhaExibida.reduce((acc, row) => acc + (parseFloat(row.somaBeneficios || "0") || 0), 0);
  const totalDescUnimed = folhaExibida.reduce((acc, row) => acc + (parseFloat(row.unimed || "0") || 0), 0);
  const totalDescontos = folhaExibida.reduce((acc, row) => acc + (parseFloat(row.descontoFixo || "0") || 0) + (parseFloat(row.descontosVariaveis || "0") || 0), 0);

  const resumoUnidade = useMemo(() => {
    const mapa = new Map<string, { unidade: string, salarioBruto: number, beneficios: number, total: number }>();
    folhaData.forEach(row => {
      const uni = row.unidade || "Não Informada";
      const sBruto = parseFloat(row.salarioBruto || "0") || 0;
      const ben = parseFloat(row.somaBeneficios || "0") || 0;
      if (!mapa.has(uni)) mapa.set(uni, { unidade: uni, salarioBruto: 0, beneficios: 0, total: 0 });
      const curr = mapa.get(uni)!;
      curr.salarioBruto += sBruto;
      curr.beneficios += ben;
      curr.total += (sBruto + ben);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [folhaData]);

  const resumoCargos = useMemo(() => {
    const mapa = new Map<string, { cargo: string, custo: number, qtde: number }>();
    folhaExibida.forEach(row => {
      const c = row.cargo || "Sem Cargo";
      const sBruto = parseFloat(row.salarioBruto || "0") || 0;
      if (!mapa.has(c)) mapa.set(c, { cargo: c, custo: 0, qtde: 0 });
      const curr = mapa.get(c)!;
      curr.custo += sBruto;
      curr.qtde += 1;
    });
    return Array.from(mapa.values()).sort((a, b) => b.custo - a.custo).slice(0, 7); // Top 7
  }, [folhaExibida]);

  const resumoBeneficios = useMemo(() => {
    let vt = 0, alimentacao = 0, combustivel = 0, ajudaCusto = 0, academia = 0;
    folhaExibida.forEach(row => {
      vt += parseFloat(row.vt || "0") || 0;
      alimentacao += parseFloat(row.alimentacao || "0") || 0;
      combustivel += parseFloat(row.combustivel || "0") || 0;
      ajudaCusto += parseFloat(row.ajudaCusto || "0") || 0;
      academia += parseFloat(row.academia || "0") || 0;
    });
    return [
      { name: 'Alimentação', value: alimentacao, color: '#f59e0b' },
      { name: 'Vale Transp.', value: vt, color: '#3b82f6' },
      { name: 'Combustível', value: combustivel, color: '#ef4444' },
      { name: 'Ajuda Custo', value: ajudaCusto, color: '#8b5cf6' },
      { name: 'Academia', value: academia, color: '#10b981' },
    ].filter(i => i.value > 0);
  }, [folhaExibida]);

  const inconsistencias = useMemo(() => {
    return folhaExibida.filter(row => {
      const liquido = parseFloat(row.valorPagar || "0") || 0;
      const bruto = parseFloat(row.salarioBruto || "0") || 0;
      const descontos = (parseFloat(row.descontoFixo || "0") || 0) + (parseFloat(row.descontosVariaveis || "0") || 0) + (parseFloat(row.unimed || "0") || 0);
      return liquido < 0 || (bruto > 0 && descontos > bruto * 0.7); // Desconto maior que 70% do salário
    });
  }, [folhaExibida]);

  if (!estabelecimentoAtual) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Selecione um Estabelecimento</h2>
          <p className="text-muted-foreground">Você precisa selecionar um estabelecimento (ex: Safatle) no canto superior direito para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-8 overflow-y-auto min-h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Folha de Pagamento - RH</h1>
          <p className="text-muted-foreground mt-1">
            Gestão e análise da folha de pagamento por competência.
          </p>
        </div>

        <div className="flex gap-4 items-center">
          <Select 
            value={unidadeSelecionada} 
            onValueChange={setUnidadeSelecionada}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Unidades</SelectItem>
              {unidadesUnicas.map(u => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={competenciaSelecionada} 
            onValueChange={setCompetenciaSelecionada}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Competência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as Competências</SelectItem>
              {competencias.map(c => c.competencia && (
                <SelectItem key={c.competencia} value={c.competencia}>
                  {c.competencia}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 shrink-0">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Colaboradores</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{folhaExibida.length}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Salário Bruto</CardTitle>
            <Building2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(String(totalSalarioBruto))}</div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Benefícios</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(String(totalBeneficios))}</div>
          </CardContent>
        </Card>
      </div>

      {inconsistencias.length > 0 && (
        <Card className="shrink-0 bg-red-500/10 border-red-500/20 text-red-600 p-4 mt-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-bold">Atenção! Foram encontradas inconsistências na folha:</h3>
          </div>
          <ul className="mt-2 text-sm list-disc pl-8">
            {inconsistencias.map((inc, idx) => (
              <li key={idx}>
                <strong>{inc.colaboradorNome}</strong>: Líquido negativo ou Descontos acima de 70% do Bruto.
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 shrink-0 mt-2">
        <Card className="col-span-1 xl:col-span-2 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Valor Salário + Benefícios por Unidade</h2>
          </div>
          <div className="h-[250px] w-full mt-auto">
            {resumoUnidade.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={resumoUnidade} 
                  margin={{ top: 5, right: 30, left: 20, bottom: 50 }}
                  onClick={(e: any) => {
                    if (e?.activePayload?.[0]?.payload?.unidade) {
                      setUnidadeSelecionada(e.activePayload[0].payload.unidade);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="unidade" type="category" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(value)} />
                  <Tooltip formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                  <Legend verticalAlign="top" height={36}/>
                  <Bar dataKey="salarioBruto" name="Salário Bruto" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="beneficios" name="Benefícios" stackId="a" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados para exibir</div>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <PieChartIcon className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Composição de Benefícios</h2>
          </div>
          <div className="h-[250px] w-full mt-auto">
            {resumoBeneficios.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={resumoBeneficios} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {resumoBeneficios.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados para exibir</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 shrink-0 mt-2">
        <Card className="col-span-1 xl:col-span-3 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Top 7 Cargos mais Onerosos</h2>
          </div>
          <div className="h-[250px] w-full mt-auto">
            {resumoCargos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumoCargos} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(value)} />
                  <YAxis dataKey="cargo" type="category" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                  <Bar dataKey="custo" name="Custo Total Bruto" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">Sem dados para exibir</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col border-border mt-2 mb-8">
        <div className="p-1 border-b bg-muted/20 flex justify-between items-center px-4 py-2 shrink-0">
          <h2 className="font-semibold">Detalhamento por Colaborador</h2>
        </div>
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Salário Bruto</TableHead>
                <TableHead className="text-right">Benefícios</TableHead>
                <TableHead className="text-right">Desc. Unimed</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Carregando dados...
                  </TableCell>
                </TableRow>
              ) : folhaExibida.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Nenhum colaborador encontrado para a seleção atual.
                  </TableCell>
                </TableRow>
              ) : (
                folhaExibida.map((row) => {
                  const descTotal = (parseFloat(row.descontoFixo || "0") || 0) + (parseFloat(row.descontosVariaveis || "0") || 0);
                  
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <div>{row.colaboradorNome}</div>
                        <div className="text-xs text-muted-foreground">{row.cpf}</div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={row.unidade || ""}>{row.unidade}</div>
                        <div className="text-xs text-muted-foreground truncate" title={row.empresa || ""}>{row.empresa}</div>
                      </TableCell>
                      <TableCell>{row.cargo}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.salarioBruto)}</TableCell>
                      <TableCell className="text-right text-emerald-500">{formatCurrency(row.somaBeneficios)}</TableCell>
                      <TableCell className="text-right text-red-400">{formatCurrency(row.unimed)}</TableCell>
                      <TableCell className="text-right text-red-500">{formatCurrency(String(descTotal))}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-bold text-muted-foreground">Totais:</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(String(totalSalarioBruto))}</TableCell>
                <TableCell className="text-right text-emerald-500 font-bold">{formatCurrency(String(totalBeneficios))}</TableCell>
                <TableCell className="text-right text-red-400 font-bold">{formatCurrency(String(totalDescUnimed))}</TableCell>
                <TableCell className="text-right text-red-500 font-bold">{formatCurrency(String(totalDescontos))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>
    </div>
  );
}
