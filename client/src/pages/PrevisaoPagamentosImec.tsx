import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, Landmark, Loader2, ShieldCheck, TrendingDown, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";

const IMEC_ID = 2550001 as const;

const moeda = (valor: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(valor ?? 0);

const mesLabel = (mes: string) => {
  const [ano, numeroMes] = mes.split("-");
  return new Date(Number(ano), Number(numeroMes) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
};

const dataLabel = (data: string | null) => {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
};

const confiancaLabel = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;
const confiancaClass = {
  alta: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  media: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  baixa: "bg-rose-500/15 text-rose-500 border-rose-500/30",
} as const;

const statusLabel = { realizado: "Pago", programado: "Programado", estimado: "Estimado", atrasado: "Atrasado" } as const;
const statusClass = {
  realizado: "border-slate-500/30 bg-slate-500/10 text-slate-500",
  programado: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  estimado: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  atrasado: "border-rose-500/30 bg-rose-500/10 text-rose-500",
} as const;

function Kpi({ titulo, valor, detalhe, cor, icon: Icon }: {
  titulo: string;
  valor: string;
  detalhe: string;
  cor: string;
  icon: typeof WalletCards;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <div className={`h-1 ${cor}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{titulo}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>
          </div>
          <div className="rounded-xl bg-muted p-2.5 text-muted-foreground"><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PrevisaoPagamentosImec() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [horizonteMeses, setHorizonteMeses] = useState<3 | 6 | 12>(6);
  const [convenioSelecionado, setConvenioSelecionado] = useState("todos");
  const [mesSelecionado, setMesSelecionado] = useState("todos");
  const isImec = estabelecimentoAtual?.id === IMEC_ID;

  const { data, isLoading, error, refetch, isRefetching } = trpc.previsaoPagamentosImec.dados.useQuery(
    { estabelecimentoId: IMEC_ID, horizonteMeses },
    { enabled: isImec, staleTime: 60_000 },
  );

  const convenioId = convenioSelecionado === "todos" ? null : Number(convenioSelecionado);

  const cronogramaFiltrado = useMemo(() => {
    if (!data) return [];
    return data.cronograma.filter(item =>
      (convenioId === null || item.convenioId === convenioId)
      && (mesSelecionado === "todos" || item.mes === mesSelecionado)
    );
  }, [data, convenioId, mesSelecionado]);

  const conveniosFiltrados = useMemo(() => {
    if (!data) return [];
    return data.porConvenio.filter(item => convenioId === null || item.convenioId === convenioId);
  }, [data, convenioId]);

  const mensalFiltrado = useMemo(() => {
    if (!data) return [];
    return data.mesesHorizonte
      .filter((mes: string) => mesSelecionado === "todos" || mes === mesSelecionado)
      .map((mes: string) => {
      const itens = cronogramaFiltrado.filter(item => item.mes === mes);
      return {
        mes,
        label: mesLabel(mes),
        Programado: itens.filter(item => item.status === "programado").reduce((total, item) => total + item.valorPrevisto, 0),
        Estimado: itens.filter(item => item.status === "estimado").reduce((total, item) => total + item.valorPrevisto, 0),
        Atrasado: itens.filter(item => item.status === "atrasado").reduce((total, item) => total + item.valorPrevisto, 0),
        "Glosa prevista": itens.filter(item => item.status !== "realizado").reduce((total, item) => total + item.glosaPrevista, 0),
      };
      });
  }, [data, cronogramaFiltrado, mesSelecionado]);

  const resumo = useMemo(() => {
    const futuros = cronogramaFiltrado.filter(item => item.status !== "realizado");
    return {
      previsto: futuros.reduce((total, item) => total + item.valorPrevisto, 0),
      programado: futuros.filter(item => item.status === "programado").reduce((total, item) => total + item.valorPrevisto, 0),
      estimado: futuros.filter(item => item.status === "estimado").reduce((total, item) => total + item.valorPrevisto, 0),
      realizado: cronogramaFiltrado.filter(item => item.status === "realizado").reduce((total, item) => total + item.valorPrevisto, 0),
      atrasado: futuros.filter(item => item.status === "atrasado").reduce((total, item) => total + item.valorPrevisto, 0),
      glosa: futuros.reduce((total, item) => total + item.glosaPrevista, 0),
    };
  }, [cronogramaFiltrado]);

  const exportarExcel = () => {
    if (!data) return;
    const workbook = XLSX.utils.book_new();
    const resumoConvenios = conveniosFiltrados.map(item => ({
      Convênio: item.convenio,
      "Meses de histórico": item.mesesHistorico,
      "Itens históricos": item.itensHistorico,
      "Último pagamento": dataLabel(item.ultimoPagamento),
      "Dia típico": item.diaTipicoPagamento,
      "Prazo médio (dias)": item.prazoMedioDias,
      "Taxa de pagamento (%)": item.taxaPagamento,
      "Taxa de glosa (%)": item.taxaGlosa,
      "Próxima data prevista": dataLabel(item.proximaDataPrevista),
      "Próximo valor previsto": item.valorProximoPagamento,
      Confiança: confiancaLabel[item.confianca],
    }));
    const cronograma = cronogramaFiltrado.map(item => ({
      Convênio: item.convenio,
      Mês: mesLabel(item.mes),
      "Data prevista": dataLabel(item.dataPrevista),
      Status: statusLabel[item.status],
      "Valor bruto": item.valorBruto,
      "Valor previsto": item.valorPrevisto,
      "Glosa prevista": item.glosaPrevista,
      Confiança: confiancaLabel[item.confianca],
      Origem: item.origem,
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumoConvenios), "Convênios");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cronograma), "Cronograma");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mensalFiltrado.map(item => ({
      Mês: item.label,
      Programado: item.Programado,
      Estimado: item.Estimado,
      Atrasado: item.Atrasado,
      "Glosa prevista": item["Glosa prevista"],
    }))), "Previsão Mensal");
    XLSX.writeFile(workbook, `previsao-pagamentos-imec-${data.dataBase}.xlsx`);
  };

  if (!isImec) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl p-6 md:p-10">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex gap-4 p-6">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
              <div>
                <h1 className="text-xl font-semibold">Relatório exclusivo do Imec Senador Canedo</h1>
                <p className="mt-2 text-sm text-muted-foreground">Selecione o estabelecimento Imec Senador Canedo para acessar a previsão de pagamentos por convênio.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 md:p-7">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-cyan-500/15 p-2.5 text-cyan-500"><CalendarClock className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Previsão de Pagamentos</h1>
                <p className="text-sm text-muted-foreground">Imec Senador Canedo · projeção por convênio baseada no histórico real</p>
              </div>
              <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-500">Imec</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={convenioSelecionado} onValueChange={setConvenioSelecionado}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Convênio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {data?.porConvenio.map((item: { convenioId: number; convenio: string }) => <SelectItem key={item.convenioId} value={String(item.convenioId)}>{item.convenio}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Mês/Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {data?.mesesHorizonte.map(mes => <SelectItem key={mes} value={mes}>{mesLabel(mes)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(horizonteMeses)} onValueChange={value => setHorizonteMeses(Number(value) as 3 | 6 | 12)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}><Loader2 className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : "hidden"}`} />Atualizar</Button>
            <Button onClick={exportarExcel} disabled={!data}><Download className="mr-2 h-4 w-4" />Exportar Excel</Button>
          </div>
        </header>

        <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Metodologia:</strong> pagamentos já presentes no demonstrativo são classificados como programados. Meses sem demonstrativo usam média ponderada dos últimos três meses, dia típico do convênio e taxa histórica de glosa. Valores estimados não representam confirmação bancária.
        </div>

        {isLoading && <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}
        {error && <Card className="border-destructive/40"><CardContent className="p-6 text-sm text-destructive">Não foi possível calcular a previsão: {error.message}</CardContent></Card>}

        {data && !isLoading && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Kpi titulo="Previsão total" valor={moeda(resumo.previsto)} detalhe={`Próximos ${horizonteMeses} meses`} cor="bg-cyan-500" icon={WalletCards} />
              <Kpi titulo="Programado" valor={moeda(resumo.programado)} detalhe="Demonstrativos já importados" cor="bg-emerald-500" icon={ShieldCheck} />
              <Kpi titulo="Estimado" valor={moeda(resumo.estimado)} detalhe="Projeção estatística" cor="bg-blue-500" icon={Landmark} />
              <Kpi titulo="Pago no período" valor={moeda(resumo.realizado)} detalhe="Demonstrativos com data já realizada" cor="bg-slate-500" icon={CheckCircle2} />
              <Kpi titulo="Atrasado" valor={moeda(resumo.atrasado)} detalhe="Data típica já vencida sem demonstrativo" cor="bg-amber-500" icon={Clock3} />
              <Kpi titulo="Glosa prevista" valor={moeda(resumo.glosa)} detalhe="Baseada na taxa histórica" cor="bg-rose-500" icon={TrendingDown} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
              <Card>
                <CardHeader><CardTitle className="text-base">Cronograma mensal previsto</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={mensalFiltrado} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={valor => `${Math.round(Number(valor) / 1000)} mil`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(valor: number) => moeda(Number(valor))} contentStyle={{ borderRadius: 10 }} />
                      <Legend />
                      <Bar dataKey="Programado" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="Estimado" stackId="a" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Atrasado" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Glosa prevista" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Qualidade da previsão</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(["alta", "media", "baixa"] as const).map(nivel => {
                    const quantidade = conveniosFiltrados.filter(item => item.confianca === nivel).length;
                    return <div key={nivel} className="flex items-center justify-between rounded-lg border border-border/70 p-3"><Badge variant="outline" className={confiancaClass[nivel]}>{confiancaLabel[nivel]}</Badge><span className="font-semibold">{quantidade} convênio(s)</span></div>;
                  })}
                  <p className="text-xs leading-5 text-muted-foreground">A confiança aumenta com mais meses, maior quantidade de itens e menor variação dos valores mensais.</p>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader><CardTitle className="text-base">Previsão por convênio</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Convênio</TableHead><TableHead>Histórico</TableHead><TableHead>Dia típico</TableHead><TableHead>Prazo médio</TableHead><TableHead>Próxima previsão</TableHead><TableHead className="text-right">Valor previsto</TableHead><TableHead className="text-right">Glosa</TableHead><TableHead>Confiança</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {conveniosFiltrados.map(item => (
                      <TableRow key={item.convenioId}>
                        <TableCell className="font-medium">{item.convenio}</TableCell>
                        <TableCell>{item.mesesHistorico} mês(es) · {item.guiasHistorico.toLocaleString("pt-BR")} guias</TableCell>
                        <TableCell>Dia {item.diaTipicoPagamento}</TableCell>
                        <TableCell>{item.prazoMedioDias === null ? "—" : `${Math.round(item.prazoMedioDias)} dias`}</TableCell>
                        <TableCell>{dataLabel(item.proximaDataPrevista)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-500">{moeda(item.valorProximoPagamento)}</TableCell>
                        <TableCell className="text-right text-rose-500">{moeda(item.glosaProximaPrevista)}</TableCell>
                        <TableCell><Badge variant="outline" className={confiancaClass[item.confianca]}>{confiancaLabel[item.confianca]}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Agenda de recebimentos</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Data prevista</TableHead><TableHead>Convênio</TableHead><TableHead>Status</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Valor líquido</TableHead><TableHead className="text-right">Glosa prevista</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cronogramaFiltrado.map((item, indice) => (
                      <TableRow key={`${item.convenioId}-${item.dataPrevista}-${indice}`}>
                        <TableCell className="font-medium">{dataLabel(item.dataPrevista)}</TableCell>
                        <TableCell>{item.convenio}</TableCell>
                        <TableCell><Badge variant="outline" className={statusClass[item.status]}>{statusLabel[item.status]}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.origem}</TableCell>
                        <TableCell className="text-right font-semibold">{moeda(item.valorPrevisto)}</TableCell>
                        <TableCell className="text-right text-rose-500">{moeda(item.glosaPrevista)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
