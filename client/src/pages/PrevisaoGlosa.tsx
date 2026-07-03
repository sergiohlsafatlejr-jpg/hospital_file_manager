import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, TrendingUp, AlertTriangle, Loader2, Download, RefreshCw, Info, CheckCircle2, AlertOctagon } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface PadraoRecebimento {
  codigoItem: string;
  descricaoItem: string;
  totalFaturado: number;
  totalRecebido: number;
  totalGlosado: number;
  taxaGlosa: number;
  taxaRecebimento: number;
  valorMedioFaturado: number;
  valorMedioRecebido: number;
  valorMedioGlosado: number;
  motivosGlosaFrequentes: Array<{
    codigo: string;
    descricao: string;
    frequencia: number;
    percentual: number;
  }>;
  risco: "baixo" | "medio" | "alto" | "critico";
}

interface ItemRisco {
  codigoItem: string;
  descricaoItem: string;
  quantidade: number;
  valorFaturado: number;
  riscoPrevisto: "baixo" | "medio" | "alto" | "critico";
  taxaGlosaEsperada: number;
  motivosGlosaProvaveis: string[];
}

interface AnaliseRiscoConta {
  numeroGuia: string;
  convenioId: number;
  valorFaturado: number;
  itens: ItemRisco[];
  riscoConta: "baixo" | "medio" | "alto" | "critico";
  scoreRisco: number;
  motivosAlerta: string[];
}

// Dados de exemplo de convênios
const CONVENIOS = [
  { id: 1, nome: "Unimed" },
  { id: 2, nome: "Bradesco Saúde" },
  { id: 3, nome: "Amil" },
  { id: 4, nome: "SulAmérica" },
  { id: 5, nome: "Vivacom" },
];

const getRiscoBadgeColor = (risco: string) => {
  switch (risco) {
    case "critico":
      return "bg-red-600 text-white";
    case "alto":
      return "bg-orange-500 text-white";
    case "medio":
      return "bg-yellow-500 text-white";
    case "baixo":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

const getRiscoIcon = (risco: string) => {
  switch (risco) {
    case "critico":
      return <AlertOctagon className="w-4 h-4 text-red-600" />;
    case "alto":
      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case "medio":
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    case "baixo":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    default:
      return <Info className="w-4 h-4 text-gray-500" />;
  }
};

export function PrevisaoGlosa() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id;

  // Estados
  const [convenioId, setConvenioId] = useState<number | null>(null);
  const [mesesHistorico, setMesesHistorico] = useState(12);
  const [numeroGuia, setNumeroGuia] = useState("");
  const [itensGuia, setItensGuia] = useState<Array<{ codigoItem: string; descricaoItem: string; quantidade: number; valorFaturado: number }>>([]);
  const [arquivoId, setArquivoId] = useState<number | null>(null);
  const [limiteRisco, setLimiteRisco] = useState<"alto_critico" | "critico">("alto_critico");

  // Resultados
  const [padroes, setPadroes] = useState<PadraoRecebimento[]>([]);
  const [analiseRisco, setAnaliseRisco] = useState<AnaliseRiscoConta | null>(null);
  const [contasRisco, setContasRisco] = useState<any[]>([]);
  const [shouldFetchPadroes, setShouldFetchPadroes] = useState(false);

  // Queries e Mutations
  const padroesMutation = trpc.motorRegras.analisarPadroesRecebimento.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 0,
      convenioId: convenioId || undefined,
      mesesHistorico,
    },
    {
      enabled: shouldFetchPadroes && !!estabelecimentoId && !!convenioId,
    }
  );

  useEffect(() => {
    if (padroesMutation.data) {
      setPadroes(padroesMutation.data.padroes || []);
      setShouldFetchPadroes(false);
      toast.success(`${padroesMutation.data.padroes?.length || 0} padrões carregados`);
    }
  }, [padroesMutation.data]);

  const riscoConta = trpc.motorRegras.analisarRiscoConta.useMutation({
    onSuccess: (data) => {
      setAnaliseRisco(data);
      toast.success("Análise de risco concluída");
    },
    onError: (error) => {
      toast.error("Erro ao analisar risco: " + error.message);
    },
  });

  const contasComRisco = trpc.motorRegras.identificarContasComRisco.useMutation({
    onSuccess: (data) => {
      setContasRisco(data.contas || []);
      toast.success(`${data.total} contas com risco identificadas`);
    },
    onError: (error) => {
      toast.error("Erro ao identificar contas: " + error.message);
    },
  });

  // Handlers
  const handleAnalisarPadroes = () => {
    if (!convenioId || !estabelecimentoId) {
      toast.error("Selecione um convênio");
      return;
    }
    setShouldFetchPadroes(true);
  };

  const handleAnalisarRisco = () => {
    if (!convenioId || !numeroGuia || !estabelecimentoId) {
      toast.error("Preencha todos os campos");
      return;
    }
    riscoConta.mutate({
      estabelecimentoId,
      convenioId,
      numeroGuia,
      itens: itensGuia.length > 0 ? itensGuia : [{ codigoItem: "", descricaoItem: "", quantidade: 1, valorFaturado: 0 }],
      mesesHistorico,
    });
  };

  const handleIdentificarContas = () => {
    if (!convenioId || !arquivoId || !estabelecimentoId) {
      toast.error("Preencha todos os campos");
      return;
    }
    contasComRisco.mutate({
      estabelecimentoId,
      convenioId,
      arquivoId,
      limiteRisco,
    });
  };

  const handleExportarPadroes = () => {
    const dados = padroes.map((p) => ({
      "Código": p.codigoItem,
      "Descrição": p.descricaoItem,
      "Taxa Glosa (%)": p.taxaGlosa.toFixed(2),
      "Total Faturado": p.totalFaturado,
      "Total Glosado": p.totalGlosado,
      "Risco": p.risco,
      "Valor Médio Faturado": p.valorMedioFaturado.toFixed(2),
      "Motivos Frequentes": p.motivosGlosaFrequentes.map((m) => `${m.descricao} (${m.frequencia}x)`).join("; "),
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Padrões");
    XLSX.writeFile(wb, `padroes-glosa-${convenioId}-${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Arquivo exportado com sucesso");
  };

  // Dados para gráficos
  const distribuicaoRisco = [
    { name: "Crítico", value: padroes.filter((p) => p.risco === "critico").length, color: "#dc2626" },
    { name: "Alto", value: padroes.filter((p) => p.risco === "alto").length, color: "#f97316" },
    { name: "Médio", value: padroes.filter((p) => p.risco === "medio").length, color: "#eab308" },
    { name: "Baixo", value: padroes.filter((p) => p.risco === "baixo").length, color: "#22c55e" },
  ].filter((d) => d.value > 0);

  const top10Padroes = padroes.slice(0, 10);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Motor de Regras</h1>
            <p className="text-gray-600 mt-2">
              Análise inteligente de risco de glosa baseada em padrões históricos
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Estabelecimento: <span className="font-semibold">{estabelecimentoAtual?.nome}</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="padroes" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="padroes">Padrões de Recebimento</TabsTrigger>
            <TabsTrigger value="risco-conta">Análise de Conta</TabsTrigger>
            <TabsTrigger value="contas-risco">Contas com Risco</TabsTrigger>
          </TabsList>

          {/* TAB 1: PADRÕES DE RECEBIMENTO */}
          <TabsContent value="padroes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Padrões de Recebimento
                </CardTitle>
                <CardDescription>
                  Análise de taxa de glosa por item baseada em histórico de faturamento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Convênio</label>
                    <Select value={convenioId?.toString() || ""} onValueChange={(v) => setConvenioId(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONVENIOS.map((conv) => (
                          <SelectItem key={conv.id} value={conv.id.toString()}>
                            {conv.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Período (meses)</label>
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      value={mesesHistorico}
                      onChange={(e) => setMesesHistorico(parseInt(e.target.value))}
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button
                      onClick={handleAnalisarPadroes}
                      disabled={!convenioId || padroesMutation.isLoading}
                      className="flex-1"
                    >
                      {padroesMutation.isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Analisar
                        </>
                      )}
                    </Button>

                    {padroes.length > 0 && (
                      <Button variant="outline" onClick={handleExportarPadroes} size="icon">
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Erro */}
                {padroesMutation.error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                    <p className="font-semibold">Erro ao carregar padrões</p>
                    <p>{String(padroesMutation.error)}</p>
                  </div>
                )}

                {/* Resultados */}
                {padroes.length > 0 && (
                  <div className="space-y-4">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-gradient-to-br from-red-50 to-red-100">
                        <CardContent className="pt-4">
                          <p className="text-sm text-gray-600">Crítico</p>
                          <p className="text-2xl font-bold text-red-600">
                            {padroes.filter((p) => p.risco === "critico").length}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
                        <CardContent className="pt-4">
                          <p className="text-sm text-gray-600">Alto</p>
                          <p className="text-2xl font-bold text-orange-600">
                            {padroes.filter((p) => p.risco === "alto").length}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
                        <CardContent className="pt-4">
                          <p className="text-sm text-gray-600">Médio</p>
                          <p className="text-2xl font-bold text-yellow-600">
                            {padroes.filter((p) => p.risco === "medio").length}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-green-50 to-green-100">
                        <CardContent className="pt-4">
                          <p className="text-sm text-gray-600">Baixo</p>
                          <p className="text-2xl font-bold text-green-600">
                            {padroes.filter((p) => p.risco === "baixo").length}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Gráficos */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {distribuicaoRisco.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Distribuição de Risco</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={250}>
                              <PieChart>
                                <Pie
                                  data={distribuicaoRisco}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  label={({ name, value }) => `${name}: ${value}`}
                                  outerRadius={80}
                                  fill="#8884d8"
                                  dataKey="value"
                                >
                                  {distribuicaoRisco.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <RechartsTooltip />
                              </PieChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Top 10 - Taxa de Glosa</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={top10Padroes}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="codigoItem" angle={-45} height={80} />
                              <YAxis />
                              <RechartsTooltip />
                              <Bar dataKey="taxaGlosa" fill="#f97316" name="Taxa Glosa (%)" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Tabela */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Detalhes dos Padrões</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Taxa Glosa</TableHead>
                                <TableHead className="text-right">Total Faturado</TableHead>
                                <TableHead className="text-right">Total Glosado</TableHead>
                                <TableHead>Risco</TableHead>
                                <TableHead>Motivos</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {padroes.map((padrao) => (
                                <TableRow key={padrao.codigoItem}>
                                  <TableCell className="font-mono text-sm">{padrao.codigoItem}</TableCell>
                                  <TableCell className="text-sm">{padrao.descricaoItem}</TableCell>
                                  <TableCell className="text-right font-semibold">{padrao.taxaGlosa.toFixed(2)}%</TableCell>
                                  <TableCell className="text-right">{padrao.totalFaturado}</TableCell>
                                  <TableCell className="text-right">{padrao.totalGlosado}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getRiscoIcon(padrao.risco)}
                                      <Badge className={getRiscoBadgeColor(padrao.risco)}>
                                        {padrao.risco}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {padrao.motivosGlosaFrequentes.slice(0, 2).map((m) => (
                                      <div key={m.codigo}>{m.descricao} ({m.frequencia}x)</div>
                                    ))}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: ANÁLISE DE RISCO DE CONTA */}
          <TabsContent value="risco-conta" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Análise de Risco de Conta
                </CardTitle>
                <CardDescription>
                  Analise o risco de glosa de uma guia específica
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Convênio</label>
                    <Select value={convenioId?.toString() || ""} onValueChange={(v) => setConvenioId(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONVENIOS.map((conv) => (
                          <SelectItem key={conv.id} value={conv.id.toString()}>
                            {conv.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Número da Guia</label>
                    <Input
                      placeholder="Ex: 123456789"
                      value={numeroGuia}
                      onChange={(e) => setNumeroGuia(e.target.value)}
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      onClick={handleAnalisarRisco}
                      disabled={!convenioId || !numeroGuia || riscoConta.isPending}
                      className="w-full"
                    >
                      {riscoConta.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        "Analisar Risco"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Resultado */}
                {analiseRisco && (
                  <div className="space-y-4">
                    {/* Score Card */}
                    <Card className={`border-2 ${
                      analiseRisco.riscoConta === "critico"
                        ? "border-red-500 bg-red-50"
                        : analiseRisco.riscoConta === "alto"
                        ? "border-orange-500 bg-orange-50"
                        : analiseRisco.riscoConta === "medio"
                        ? "border-yellow-500 bg-yellow-50"
                        : "border-green-500 bg-green-50"
                    }`}>
                      <CardContent className="pt-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-gray-600">Score de Risco</p>
                            <p className="text-4xl font-bold">{analiseRisco.scoreRisco}</p>
                            <p className="text-sm text-gray-600 mt-1">de 100</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Classificação</p>
                            <Badge className={`${getRiscoBadgeColor(analiseRisco.riscoConta)} text-lg px-4 py-2`}>
                              {analiseRisco.riscoConta.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Alertas */}
                    {analiseRisco.motivosAlerta.length > 0 && (
                      <Card className="border-red-200 bg-red-50">
                        <CardHeader>
                          <CardTitle className="text-lg text-red-800">Alertas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {analiseRisco.motivosAlerta.map((alerta, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-red-700">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                {alerta}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Itens */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Itens Analisados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead>Risco</TableHead>
                                <TableHead className="text-right">Taxa Glosa Esperada</TableHead>
                                <TableHead>Motivos Prováveis</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {analiseRisco.itens.map((item) => (
                                <TableRow key={item.codigoItem}>
                                  <TableCell className="font-mono text-sm">{item.codigoItem}</TableCell>
                                  <TableCell className="text-sm">{item.descricaoItem}</TableCell>
                                  <TableCell className="text-right">R$ {item.valorFaturado.toFixed(2)}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getRiscoIcon(item.riscoPrevisto)}
                                      <Badge className={getRiscoBadgeColor(item.riscoPrevisto)}>
                                        {item.riscoPrevisto}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">{item.taxaGlosaEsperada.toFixed(2)}%</TableCell>
                                  <TableCell className="text-xs">
                                    {item.motivosGlosaProvaveis.join(", ")}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: CONTAS COM RISCO */}
          <TabsContent value="contas-risco" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5" />
                  Identificar Contas com Risco
                </CardTitle>
                <CardDescription>
                  Identifique todas as contas com risco em um arquivo importado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filtros */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Convênio</label>
                    <Select value={convenioId?.toString() || ""} onValueChange={(v) => setConvenioId(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um convênio" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONVENIOS.map((conv) => (
                          <SelectItem key={conv.id} value={conv.id.toString()}>
                            {conv.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">ID do Arquivo</label>
                    <Input
                      type="number"
                      placeholder="Ex: 123"
                      value={arquivoId || ""}
                      onChange={(e) => setArquivoId(e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Limite de Risco</label>
                    <Select value={limiteRisco} onValueChange={(v) => setLimiteRisco(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alto_critico">Alto ou Crítico</SelectItem>
                        <SelectItem value="critico">Apenas Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      onClick={handleIdentificarContas}
                      disabled={!convenioId || !arquivoId || contasComRisco.isPending}
                      className="w-full"
                    >
                      {contasComRisco.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Identificando...
                        </>
                      ) : (
                        "Identificar"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Resultado */}
                {contasRisco.length > 0 && (
                  <div className="space-y-4">
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-600">Total de Contas com Risco</p>
                        <p className="text-3xl font-bold text-blue-600">{contasRisco.length}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Contas Identificadas</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Guia</TableHead>
                                <TableHead className="text-right">Score de Risco</TableHead>
                                <TableHead>Risco</TableHead>
                                <TableHead className="text-right">Alertas</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {contasRisco.map((conta) => (
                                <TableRow key={conta.numeroGuia}>
                                  <TableCell className="font-mono">{conta.numeroGuia}</TableCell>
                                  <TableCell className="text-right font-semibold">{conta.scoreRisco}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getRiscoIcon(conta.riscoConta)}
                                      <Badge className={getRiscoBadgeColor(conta.riscoConta)}>
                                        {conta.riscoConta}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">{conta.motivosAlerta?.length || 0}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

export default PrevisaoGlosa;
