import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  DollarSign, BarChart3, Loader2, Wallet, Receipt, AlertCircle, RefreshCcw, Heart, Building2, DownloadCloud, FileX, Scissors, ShieldAlert, LayoutDashboard, ArrowDownRight, FolderOpen
} from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import ChartCard from "@/components/dashboard/ChartCard";
import { toast } from "sonner";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatCurrency(value);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1 max-w-[280px] truncate">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function BiFinanceiroTasy() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  const anoCorrente = new Date().getFullYear();
  const [anoFiltro, setAnoFiltro] = useState(anoCorrente - 1);
  const [carregado, setCarregado] = useState(false);
  const [queryAno, setQueryAno] = useState(anoFiltro);

  const { data, isLoading, error, refetch } = trpc.tasy.getDashboardBI.useQuery(
    { estabelecimentoId, anoInicial: queryAno },
    { enabled: estabelecimentoId >= 0 && carregado }
  );

  const syncMutation = trpc.tasy.syncRelatorioFinanceiro.useMutation({
    onSuccess: (res) => {
      toast.success(`Sincronização concluída! ${res.processados} registros. ${res.mensagem}`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Falha na sincronização: ${err.message}`);
    }
  });

  const handleCarregar = () => {
    setQueryAno(anoFiltro);
    setCarregado(true);
  };

  const handleSincronizar = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Para sincronizar do banco Oracle, selecione um Estabelecimento específico no topo.");
      return;
    }
    syncMutation.mutate({
      estabelecimentoId,
      dtInicial: `01/01/${anoFiltro}`,
      dtFinal: `31/12/${anoFiltro}`,
    });
  };

  // ===================== MEMORIZAÇÃO VISÃO GERAL =====================
  const chartMeses = useMemo(() => {
    if (!data?.historicoMeses) return [];
    return data.historicoMeses.map((m:any) => ({
      name: m.competencia.replace('/', '-'),
      Faturado: m.faturado,
      Recebido: m.recebido,
      Glosado: m.glosado,
      "A Receber": m.a_receber
    }));
  }, [data]);

  const chartConvenio = useMemo(() => {
    if (!data?.porConvenio) return [];
    return data.porConvenio.slice(0, 10).map((c:any) => ({
      name: c.convenio.length > 20 ? c.convenio.substring(0, 20) + '...' : c.convenio,
      Faturado: c.faturado,
      Glosado: c.glosado
    }));
  }, [data]);

  const chartSetor = useMemo(() => {
    if (!data?.porSetor) return [];
    return data.porSetor.slice(0, 10).map((s:any) => ({
      name: s.setor.length > 20 ? s.setor.substring(0, 20) + '...' : s.setor,
      Faturado: s.faturado,
      Recebido: s.recebido
    }));
  }, [data]);

  // ===================== MEMORIZAÇÃO GLOSAS =====================
  const chartMotivos = useMemo(() => {
    if (!data?.porMotivoGlosa) return [];
    return data.porMotivoGlosa.slice(0, 10).map((m: any) => ({
      name: m.motivo.length > 30 ? m.motivo.substring(0, 30) + "..." : m.motivo,
      Glosado: m.glosado
    }));
  }, [data]);

  const chartItensGlosa = useMemo(() => {
    if (!data?.porItemGlosa) return [];
    return data.porItemGlosa.slice(0, 10).map((i: any) => ({
      name: i.item.length > 25 ? i.item.substring(0, 25) + "..." : i.item,
      Glosado: i.glosado
    }));
  }, [data]);

  const chartSetorGlosa = useMemo(() => {
    if (!data?.porSetor) return [];
    const setoresGL = [...data.porSetor].sort((a: any, b: any) => b.glosado - a.glosado).slice(0, 10);
    return setoresGL.map((s: any) => ({
      name: s.setor.length > 20 ? s.setor.substring(0, 20) + "..." : s.setor,
      Glosado: s.glosado
    }));
  }, [data]);

  // ===================== MEMORIZAÇÃO CONTAS A RECEBER =====================
  const chartContasAberto = useMemo(() => {
    if (!data?.contasAbertoPorConvenio) return [];
    return data.contasAbertoPorConvenio.slice(0, 10).map((c: any) => ({
      name: c.convenio.length > 20 ? c.convenio.substring(0, 20) + "..." : c.convenio,
      "A Receber": c.a_receber
    }));
  }, [data]);

  const tabelaContasAberto = useMemo(() => {
    if (!data?.contasAbertoPorConvenio) return [];
    return data.contasAbertoPorConvenio;
  }, [data]);

  const anosDisponiveis = [anoCorrente, anoCorrente - 1, anoCorrente - 2, anoCorrente - 3];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-card-foreground flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              BI Financeiro TASY
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão macro consolidadando processos TASY (Aba Staging)
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">A partir do ano</label>
                <Select value={String(anoFiltro)} onValueChange={(v) => setAnoFiltro(Number(v))}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(a => (<SelectItem key={a} value={String(a)}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCarregar} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                Ler da Staging (BI)
              </Button>
              <Button onClick={handleSincronizar} variant="outline" disabled={syncMutation.isPending || isLoading}>
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
                Extrair do Oracle ({anoFiltro})
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading && carregado && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-32 rounded-xl" />))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}

        {!carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BarChart3 className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Selecione o ano base e clique em "Ler da Staging"</p>
          </div>
        )}

        {error && carregado && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <AlertCircle className="h-16 w-16 mb-4 opacity-30 text-red-500" />
            <p className="text-lg text-red-400 font-medium">Erro ao carregar dados do BI</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {data && data.historicoMeses.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-xl bg-slate-50/50 border border-slate-100 dark:bg-zinc-900/50 dark:border-zinc-800">
            <DownloadCloud className="h-16 w-16 mb-4 text-slate-300 dark:text-zinc-700" />
            <p className="text-lg text-slate-600 dark:text-zinc-400 font-medium mb-2">A Staging Area está vazia para este período!</p>
            <p className="text-sm text-slate-500 dark:text-zinc-500 max-w-md mx-auto mb-6">
              Os dados deste BI são consolidados diretamente através do Extrator do Oracle TASY. Clique em <b>Extrair do Oracle ({anoFiltro})</b> para preencher o banco de dados.
            </p>
            <Button onClick={handleSincronizar} disabled={syncMutation.isPending} size="lg" className="shadow-sm">
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
                {syncMutation.isPending ? "Puxando do Oracle TASY em background..." : `Iniciar Extração Oracle: Módulo ${anoFiltro}`}
            </Button>
          </div>
        )}

        {data && data.historicoMeses.length > 0 && !isLoading && !error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            
            {/* ABAS DO DASHBOARD */}
            <Tabs defaultValue="geral" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="geral" className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" /> Visão Geral
                </TabsTrigger>
                <TabsTrigger value="glosas" className="flex items-center gap-2">
                  <Scissors className="h-4 w-4" /> Análise de Glosas
                </TabsTrigger>
                <TabsTrigger value="aberto" className="flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Contas a Receber
                </TabsTrigger>
              </TabsList>

              {/*================= ABA 1: VISÃO GERAL =================*/}
              <TabsContent value="geral" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard title="Produção Faturada" value={formatCurrency(data.kpis.totalFaturado)} subtitle="Bruto (Procedimentos + Mats)" icon={DollarSign} gradient="blue" />
                  <KpiCard title="Total Recebido" value={formatCurrency(data.kpis.totalRecebido)} subtitle="Valor efetivo com baixa" icon={Wallet} gradient="emerald" />
                  <KpiCard title="Total Glosado" value={formatCurrency(data.kpis.totalGlosado)} subtitle="Glosas definitivas e recuperáveis" icon={AlertCircle} gradient="amber" />
                  <KpiCard title="Saldo a Receber" value={formatCurrency(data.kpis.totalAReceber)} subtitle="Pendente na operadora" icon={Receipt} gradient="amber" />
                </div>
                <ChartCard title="Faturado vs Recebido vs Glosado por Mês" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={380}>
                    <ComposedChart data={chartMeses}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Bar dataKey="Faturado" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      <Bar dataKey="Glosado" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
                      <Line type="monotone" dataKey="A Receber" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Top Convênios (Faturado x Glosado)" icon={Heart}>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartConvenio} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompact} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="Faturado" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                        <Bar dataKey="Glosado" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Top Setores (Faturado x Recebido)" icon={Building2}>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartSetor} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompact} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar dataKey="Faturado" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={12} />
                        <Bar dataKey="Recebido" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </TabsContent>

              {/*================= ABA 2: GLOSAS =================*/}
              <TabsContent value="glosas" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <KpiCard title="Impacto Total Glosado" value={formatCurrency(data.kpis.totalGlosado)} subtitle="Neste período" icon={ShieldAlert} gradient="amber" />
                  <div className="md:col-span-2">
                    <ChartCard title="Top 10 Motivos de Glosa (R$)" icon={FileX}>
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={chartMotivos} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                          <XAxis type="number" tickFormatter={formatCompact} />
                          <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="Glosado" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16}>
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Glosas por Item Faturado (Top 10)" icon={Scissors}>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartItensGlosa} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompact} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="Glosado" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={16} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  
                  <ChartCard title="Glosas por Setor de Atendimento (Top 10)" icon={Building2}>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartSetorGlosa} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                        <XAxis type="number" tickFormatter={formatCompact} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="Glosado" fill="#fb923c" radius={[0, 4, 4, 0]} barSize={16} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </TabsContent>

              {/*================= ABA 3: CONTAS A RECEBER =================*/}
              <TabsContent value="aberto" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  <div className="col-span-1 space-y-6">
                    <KpiCard title="Saldo em Aberto" value={formatCurrency(data.kpis.totalAReceber)} subtitle="Montante total a buscar" icon={Receipt} gradient="amber" />
                    
                    <ChartCard title="Ofensores na Cobrança" icon={ArrowDownRight}>
                      <ResponsiveContainer width="100%" height={345}>
                        <ComposedChart data={chartContasAberto} layout="vertical" margin={{ left: 20, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                          <XAxis type="number" tickFormatter={formatCompact} />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="A Receber" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  <div className="col-span-1 lg:col-span-2">
                    <Card className="h-full border border-border/50 shadow-sm overflow-hidden flex flex-col">
                      <div className="px-6 py-4 border-b bg-card">
                        <h3 className="font-semibold flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-emerald-500" /> Detalhamento de Saldos por Convênio
                        </h3>
                      </div>
                      <div className="flex-1 overflow-auto max-h-[500px]">
                        <Table>
                          <TableHeader className="bg-muted/30 sticky top-0">
                            <TableRow>
                              <TableHead>Convênio</TableHead>
                              <TableHead className="text-right">Faturado Bruto</TableHead>
                              <TableHead className="text-right text-amber-600 font-medium">Falta Receber</TableHead>
                              <TableHead className="text-right">% Pendente</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tabelaContasAberto.map((item: any, idx: number) => {
                              const perc = item.faturado > 0 ? (item.a_receber / item.faturado) * 100 : 0;
                              return (
                                <TableRow key={idx}>
                                  <TableCell className="font-medium">{item.convenio}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{formatCurrency(item.faturado)}</TableCell>
                                  <TableCell className="text-right font-medium text-amber-600">{formatCurrency(item.a_receber)}</TableCell>
                                  <TableCell className="text-right">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${perc > 50 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : perc > 10 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                      {perc.toFixed(1)}%
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {tabelaContasAberto.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                  Nenhuma conta pendente identificada neste período.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  </div>

                </div>
              </TabsContent>

            </Tabs>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
