import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  BarChart3,
  Table as TableIcon,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  Package as PackageIcon,
  Gavel,
} from "lucide-react";
import { MetricCard } from "@/components/bi/MetricCard";
import { BIFilters } from "@/components/bi/BIFilters";
import { ConvenioBarChart, TiposPieChart, EvolucaoMensalChart } from "@/components/bi/BICharts";
import { ConvenioTable, GlosaTable, DescricaoTable } from "@/components/bi/BITables";
import { StackedProgressChart } from "@/components/bi/StackedProgressChart";
import { TopGlosasChart } from "@/components/bi/TopGlosasChart";
import { InsightCards } from "@/components/bi/InsightCards";
import { BIFaturadoRecebido } from "@/components/bi/BIFaturadoRecebido";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import * as XLSX from "xlsx";


const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;


export default function RelatoriosBI() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [ano, setAno] = useState("2025");
  const [mes, setMes] = useState("todos");
  const [convenio, setConvenio] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [prestador, setPrestador] = useState("todos");
  const [dataInicial, setDataInicial] = useState<Date | undefined>();
  const [dataFinal, setDataFinal] = useState<Date | undefined>();


  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);


  type MetricKey = "faturado" | "recebido" | "glosado" | "recursado" | "taxaGlosa" | "ticketMedio";
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(["faturado", "recebido", "glosado", "recursado", "taxaGlosa", "ticketMedio"])
  );

  const toggleMetric = useCallback((key: MetricKey) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Buscar dados do backend com estabelecimentoId
  const { data: biData, isLoading } = trpc.relatoriosBI.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
      anoReferencia: parseInt(ano),
      mesReferencia: mes !== "todos" ? parseInt(mes) : undefined,
      convenioId: convenio !== "todos" ? parseInt(convenio) : undefined,
      tipo: tipo !== "todos" ? tipo : undefined,
      codigoPrestadorExecutante: prestador !== "todos" ? prestador : undefined,
    },
    { enabled: !!estabelecimentoId }
  );

  interface BIItem {
    chave: string;
    valorFaturado: number;
    valorRecebido: number;
    valorGlosado: number;
    valorRecursado?: number;
    valorRecuperado?: number;
    quantidade: number;
  }

  // Dados por convênio (vindos do backend)
  const conveniosData = useMemo((): BIItem[] => {
    if (!biData?.porConvenio) return [];
    return biData.porConvenio.map((item: any) => ({
      chave: item.chave,
      valorFaturado: item.valorFaturado || 0,
      valorRecebido: item.valorRecebido || 0,
      valorGlosado: item.valorGlosado || 0,
      valorRecursado: item.valorRecursado || 0,
      valorRecuperado: item.valorRecuperado || 0,
      quantidade: item.quantidade || 0,
    }));
  }, [biData]);

  // Dados por tipo
  const tiposData = useMemo((): BIItem[] => {
    if (!biData?.porTipo) return [];
    return biData.porTipo.map((item: BIItem) => ({
      chave: item.chave,
      valorFaturado: item.valorFaturado || 0,
      valorRecebido: item.valorRecebido || 0,
      valorGlosado: item.valorGlosado || 0,
      quantidade: item.quantidade || 0,
    }));
  }, [biData]);

  // Dados por mês (para evolução)
  const mesesData = useMemo(() => {
    if (!biData?.porMes) return [];
    return biData.porMes.map((item: BIItem) => ({
      mes: item.chave,
      faturado: item.valorFaturado || 0,
      recebido: item.valorRecebido || 0,
      glosado: item.valorGlosado || 0,
    }));
  }, [biData]);

  // Dados de motivos de glosa
  const motivosGlosaData = useMemo(() => {
    if (!biData?.porMotivoGlosa) return [];
    const totalGlosa = biData.porMotivoGlosa.reduce(
      (sum: number, item: BIItem) => sum + (item.valorGlosado || 0),
      0
    );
    return biData.porMotivoGlosa.map((item: BIItem) => ({
      chave: item.chave,
      quantidade: item.quantidade || 0,
      valor: item.valorGlosado || 0,
      percentual: totalGlosa > 0 ? Number(((item.valorGlosado / totalGlosa) * 100).toFixed(1)) : 0,
    }));
  }, [biData]);

  // Dados por descrição
  const descricaoData = useMemo(() => {
    if (!biData?.porDescricao) return [];
    return biData.porDescricao.map((item: BIItem) => ({
      chave: item.chave,
      quantidade: item.quantidade || 0,
      valor: item.valorFaturado || 0,
    }));
  }, [biData]);

  // Dados formatados para gráfico de barras
  const dadosPorConvenio = useMemo(
    () =>
      conveniosData.map((item) => ({
        convenio: item.chave,
        faturado: item.valorFaturado,
        recebido: item.valorRecebido,
        glosado: item.valorGlosado,
        itens: item.quantidade,
      })),
    [conveniosData]
  );

  // Dados formatados para gráfico de pizza (donut)
  const dadosPorTipo = useMemo(() => {
    const total = tiposData.reduce((sum, item) => sum + item.valorRecebido, 0);
    return tiposData.map((item) => ({
      tipo: item.chave,
      valor: item.valorRecebido,
      quantidade: item.quantidade,
      percentual: total > 0 ? ((item.valorRecebido / total) * 100).toFixed(1) : "0",
    }));
  }, [tiposData]);

  // Handler para clique no donut - filtra pelo tipo selecionado
  const handleTipoClick = useCallback((clickedTipo: string | null) => {
    setTipoSelecionado(clickedTipo);
    if (clickedTipo) {
      setTipo(clickedTipo);
      toast.info(`Filtrado por tipo: ${clickedTipo}`);
    } else {
      setTipo("todos");
      toast.info("Filtro de tipo removido");
    }
  }, []);

  // Métricas calculadas
  const metricas = useMemo(() => {
    if (!biData?.resumo) {
      return { faturado: 0, recebido: 0, glosado: 0, itens: 0, percentualGlosa: "0", ticketMedio: 0 };
    }
    const { totalFaturado, totalRecebido, totalGlosado, totalItens } = biData.resumo;
    const percentualGlosa =
      totalFaturado > 0 ? ((totalGlosado / totalFaturado) * 100).toFixed(1) : "0";
    const ticketMedio = totalItens > 0 ? totalFaturado / totalItens : 0;
    const totalRecursado = biData.resumo.totalRecursado || 0;
    const totalRecuperado = biData.resumo.totalRecuperado || 0;
    return {
      faturado: totalFaturado,
      recebido: totalRecebido,
      glosado: totalGlosado,
      recursado: totalRecursado,
      recuperado: totalRecuperado,
      itens: totalItens,
      percentualGlosa,
      ticketMedio,
    };
  }, [biData]);

  // Calcular trends baseados nos dados mensais
  const trends = useMemo(() => {
    if (mesesData.length < 2) {
      return { faturado: 0, recebido: 0, glosado: 0 };
    }
    const sorted = [...mesesData].filter(m => (m.faturado || 0) > 0 || (m.recebido || 0) > 0);
    if (sorted.length < 2) return { faturado: 0, recebido: 0, glosado: 0 };
    const ultimo = sorted[sorted.length - 1];
    const penultimo = sorted[sorted.length - 2];
    const calcTrend = (atual: number, anterior: number) =>
      anterior > 0 ? Number((((atual - anterior) / anterior) * 100).toFixed(1)) : 0;
    return {
      faturado: calcTrend(ultimo.faturado || 0, penultimo.faturado || 0),
      recebido: calcTrend(ultimo.recebido || 0, penultimo.recebido || 0),
      glosado: calcTrend(ultimo.glosado || 0, penultimo.glosado || 0),
    };
  }, [mesesData]);

  // Lista de convênios para o filtro
  const conveniosList = useMemo(() => {
    return conveniosData.map((c) => c.chave);
  }, [conveniosData]);

  // Exportar Excel
  const handleExportar = () => {
    if (!biData?.porConvenio || biData.porConvenio.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo Geral
    const resumoSheet = [
      { Metrica: "Valor Faturado", Valor: metricas.faturado },
      { Metrica: "Valor Recebido", Valor: metricas.recebido },
      { Metrica: "Valor Glosado", Valor: metricas.glosado },
      { Metrica: "Taxa de Glosa (%)", Valor: metricas.percentualGlosa },
      { Metrica: "Ticket Médio", Valor: metricas.ticketMedio },
      { Metrica: "Valor Recursado", Valor: metricas.recursado ?? 0 },
      { Metrica: "Valor Recuperado", Valor: metricas.recuperado ?? 0 },
    ];
    const wsResumo = XLSX.utils.json_to_sheet(resumoSheet);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    // Aba 2: Por Convênio
    const wsConvenio = XLSX.utils.json_to_sheet(
      conveniosData.map((c) => {
        const recursado = c.valorRecursado ?? 0;
        const recuperado = c.valorRecuperado ?? 0;
        const taxaRecup = recursado > 0 ? ((recuperado / recursado) * 100).toFixed(1) + "%" : "-";
        return {
          Convenio: c.chave,
          Faturado: c.valorFaturado,
          Recebido: c.valorRecebido,
          Glosado: c.valorGlosado,
          Recursado: recursado,
          Recuperado: recuperado,
          "Taxa Recuperação": taxaRecup,
          Itens: Math.round(c.quantidade),
        };
      })
    );
    XLSX.utils.book_append_sheet(wb, wsConvenio, "Por Convenio");

    // Aba 3: Motivos de Glosa
    const wsMotivos = XLSX.utils.json_to_sheet(
      motivosGlosaData.map((m) => ({
        Motivo: m.chave,
        Quantidade: m.quantidade,
        Valor: m.valor,
        "Percentual (%)": m.percentual,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsMotivos, "Motivos Glosa");

    // Aba 4: Por Descrição
    const wsDescricao = XLSX.utils.json_to_sheet(
      descricaoData.map((d) => ({
        Descricao: d.chave,
        Quantidade: d.quantidade,
        Valor: d.valor,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsDescricao, "Por Descricao");

    XLSX.writeFile(wb, `relatorio-bi-${ano}-${mes}-${new Date().getTime()}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };


  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Faturado x Recebido x Glosado
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Análise de Faturamento, Recebimento, Glosas e Recursos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleExportar} disabled={isLoading} className="gap-2 shadow-sm">
              <Download className="h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </motion.div>

        {/* Filters */}
        <BIFilters
          ano={ano}
          setAno={setAno}
          mes={mes}
          setMes={setMes}
          convenio={convenio}
          setConvenio={setConvenio}
          tipo={tipo}
          setTipo={setTipo}
          prestador={prestador}
          setPrestador={setPrestador}
          convenios={conveniosList}
          dataInicial={dataInicial}
          setDataInicial={setDataInicial}
          dataFinal={dataFinal}
          setDataFinal={setDataFinal}
        />

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
              <p className="text-muted-foreground text-sm">Carregando dados...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Metric Cards - Clickable Filters */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Clique nos cards para filtrar os dados exibidos
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <MetricCard
                  title="Faturado"
                  value={fmtCurrency(metricas.faturado)}
                  subtitle="Valor total faturado"
                  icon={DollarSign}
                  variant="primary"
                  delay={0.05}
                  trend={{ value: trends.faturado, label: "vs mês anterior" }}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: c.valorFaturado,
                  }))}
                  active={activeMetrics.has("faturado")}
                  onClick={() => toggleMetric("faturado")}
                />
                <MetricCard
                  title="Recebido"
                  value={fmtCurrency(metricas.recebido)}
                  subtitle="Valor efetivamente recebido"
                  icon={CheckCircle2}
                  variant="success"
                  delay={0.1}
                  trend={{ value: trends.recebido, label: "vs mês anterior" }}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: c.valorRecebido,
                  }))}
                  active={activeMetrics.has("recebido")}
                  onClick={() => toggleMetric("recebido")}
                />
                <MetricCard
                  title="Glosado"
                  value={fmtCurrency(metricas.glosado)}
                  subtitle="Valor total glosado"
                  icon={AlertTriangle}
                  variant="danger"
                  delay={0.15}
                  trend={{ value: trends.glosado * -1, label: "vs mês anterior" }}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: c.valorGlosado,
                  }))}
                  active={activeMetrics.has("glosado")}
                  onClick={() => toggleMetric("glosado")}
                />
                <MetricCard
                  title="Taxa de Glosa"
                  value={`${metricas.percentualGlosa}%`}
                  subtitle="Percentual sobre faturado"
                  icon={TrendingDown}
                  variant="warning"
                  delay={0.2}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: Number(
                      c.valorFaturado > 0
                        ? ((c.valorGlosado / c.valorFaturado) * 100).toFixed(1)
                        : 0
                    ),
                  }))}
                  active={activeMetrics.has("taxaGlosa")}
                  onClick={() => toggleMetric("taxaGlosa")}
                />
                <MetricCard
                  title="Recursado"
                  value={fmtCurrency(metricas.recursado ?? 0)}
                  subtitle={`Recuperado: ${fmtCurrency(metricas.recuperado ?? 0)}`}
                  icon={Gavel}
                  variant="info"
                  delay={0.25}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: c.valorRecursado ?? 0,
                  }))}
                  active={activeMetrics.has("recursado")}
                  onClick={() => toggleMetric("recursado")}
                />
                <MetricCard
                  title="Ticket Médio"
                  value={fmtCurrency(metricas.ticketMedio)}
                  subtitle={`${Math.round(metricas.itens).toLocaleString("pt-BR")} itens`}
                  icon={PackageIcon}
                  variant="primary"
                  delay={0.3}
                  breakdown={conveniosData.map((c) => ({
                    nome: c.chave,
                    valor: c.quantidade > 0 ? c.valorFaturado / c.quantidade : 0,
                  }))}
                  active={activeMetrics.has("ticketMedio")}
                  onClick={() => toggleMetric("ticketMedio")}
                />
              </div>
            </div>

            {/* Insight Cards */}
            <InsightCards convenios={conveniosData} meses={mesesData} />

            {/* Charts & Tables in Tabs */}
            <Tabs defaultValue="graficos" className="space-y-4">
              <TabsList className="bg-muted/60">
                <TabsTrigger value="graficos" className="gap-1.5 text-xs">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Gráficos
                </TabsTrigger>
                <TabsTrigger value="tabelas" className="gap-1.5 text-xs">
                  <TableIcon className="h-3.5 w-3.5" />
                  Tabelas
                </TabsTrigger>
                <TabsTrigger value="evolucao" className="gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Evolução
                </TabsTrigger>
                <TabsTrigger value="faturadoRecebido" className="gap-1.5 text-xs">
                  <DollarSign className="h-3.5 w-3.5" />
                  Faturado x Recebido
                </TabsTrigger>
              </TabsList>

              <TabsContent value="graficos" className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <ConvenioBarChart
                    data={dadosPorConvenio}
                    visibleSeries={{
                      faturado: activeMetrics.has("faturado"),
                      recebido: activeMetrics.has("recebido"),
                      glosado: activeMetrics.has("glosado"),
                    }}
                  />
                  {activeMetrics.has("recebido") && (
                    <TiposPieChart
                      data={dadosPorTipo}
                      onTipoClick={handleTipoClick}
                      tipoSelecionado={tipoSelecionado}
                    />
                  )}
                  {(activeMetrics.has("faturado") ||
                    activeMetrics.has("recebido") ||
                    activeMetrics.has("glosado")) && (
                    <StackedProgressChart data={conveniosData} />
                  )}
                  {activeMetrics.has("glosado") && <TopGlosasChart data={motivosGlosaData} />}
                </div>
              </TabsContent>

              <TabsContent value="tabelas" className="space-y-6">
                <ConvenioTable data={conveniosData} />
                <GlosaTable data={motivosGlosaData} />
                <DescricaoTable data={descricaoData} />
              </TabsContent>

              <TabsContent value="evolucao" className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <EvolucaoMensalChart
                    data={mesesData}
                    visibleSeries={{
                      faturado: activeMetrics.has("faturado"),
                      recebido: activeMetrics.has("recebido"),
                      glosado: activeMetrics.has("glosado"),
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="faturadoRecebido" className="space-y-6">
                <BIFaturadoRecebido />
              </TabsContent>

            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
