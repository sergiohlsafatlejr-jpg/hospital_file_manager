import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";

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

export function PrevisaoGlosa() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id;

  const [convenioId, setConvenioId] = useState<number | null>(null);
  const [mesesHistorico, setMesesHistorico] = useState(12);
  const [numeroGuia, setNumeroGuia] = useState("");
  const [arquivoId, setArquivoId] = useState<number | null>(null);
  const [limiteRisco, setLimiteRisco] = useState<"alto_critico" | "critico">("alto_critico");

  // Estados para resultados
  const [padroes, setPadroes] = useState<PadraoRecebimento[]>([]);
  const [analiseRisco, setAnaliseRisco] = useState<AnaliseRiscoConta | null>(null);
  const [contasRisco, setContasRisco] = useState<any[]>([]);

  // Mutations
  const padroesMutation = trpc.motorRegras.analisarPadroesRecebimento.useMutation({
    onSuccess: (data) => {
      setPadroes(data.padroes || []);
    },
  });

  const riscoConta = trpc.motorRegras.analisarRiscoConta.useMutation({
    onSuccess: (data) => {
      setAnaliseRisco(data);
    },
  });

  const contasComRisco = trpc.motorRegras.identificarContasComRisco.useMutation({
    onSuccess: (data) => {
      setContasRisco(data.contas || []);
    },
  });

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
      case "alto":
        return <AlertTriangle className="w-4 h-4" />;
      case "medio":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <TrendingUp className="w-4 h-4" />;
    }
  };

  // Dados para gráficos
  const distribuicaoRisco = [
    { name: "Crítico", value: padroes.filter((p) => p.risco === "critico").length },
    { name: "Alto", value: padroes.filter((p) => p.risco === "alto").length },
    { name: "Médio", value: padroes.filter((p) => p.risco === "medio").length },
    { name: "Baixo", value: padroes.filter((p) => p.risco === "baixo").length },
  ];

  const coresPizza = ["#dc2626", "#f97316", "#eab308", "#22c55e"];

  const handleAnalisarPadroes = () => {
    if (!convenioId || !estabelecimentoId) return;
    padroesMutation.mutate({
      estabelecimentoId,
      convenioId,
      mesesHistorico,
    });
  };

  const handleAnalisarRisco = () => {
    if (!convenioId || !numeroGuia || !estabelecimentoId) return;
    riscoConta.mutate({
      estabelecimentoId,
      convenioId,
      numeroGuia,
      itens: [],
      mesesHistorico,
    });
  };

  const handleIdentificarContas = () => {
    if (!convenioId || !arquivoId || !estabelecimentoId) return;
    contasComRisco.mutate({
      estabelecimentoId,
      convenioId,
      arquivoId,
      limiteRisco,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Previsão de Risco de Glosa</h1>
          <p className="text-gray-600 mt-2">
            Analise padrões de recebimento e identifique contas com risco de glosa
          </p>
        </div>

        {/* SEÇÃO 1: PADRÕES DE RECEBIMENTO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Padrões de Recebimento
            </CardTitle>
            <CardDescription>
              Análise de taxa de glosa por item baseada em histórico de faturamento e recebimento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId?.toString() || ""} onValueChange={(v) => setConvenioId(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Unimed</SelectItem>
                    <SelectItem value="2">Bradesco Saúde</SelectItem>
                    <SelectItem value="3">Amil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Período (meses)</label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={mesesHistorico}
                  onChange={(e) => setMesesHistorico(parseInt(e.target.value))}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAnalisarPadroes}
                  disabled={!convenioId || padroesMutation.isPending}
                  className="w-full"
                >
                  {padroesMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    "Analisar Padrões"
                  )}
                </Button>
              </div>
            </div>

            {padroes.length > 0 && (
              <div className="space-y-4">
                {/* Gráfico de Distribuição de Risco */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="font-semibold mb-4">Distribuição de Risco</h3>
                    <ResponsiveContainer width="100%" height={300}>
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
                          {coresPizza.map((cor, index) => (
                            <Cell key={`cell-${index}`} fill={cor} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="font-semibold mb-4">Taxa de Glosa por Item</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={padroes.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="codigoItem" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="taxaGlosa" fill="#f97316" name="Taxa Glosa (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabela de Padrões */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">Código</th>
                        <th className="px-4 py-2 text-left">Descrição</th>
                        <th className="px-4 py-2 text-right">Taxa Glosa</th>
                        <th className="px-4 py-2 text-right">Total Faturado</th>
                        <th className="px-4 py-2 text-right">Total Glosado</th>
                        <th className="px-4 py-2">Risco</th>
                      </tr>
                    </thead>
                    <tbody>
                      {padroes.map((padrao) => (
                        <tr key={padrao.codigoItem} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{padrao.codigoItem}</td>
                          <td className="px-4 py-2 text-gray-700">{padrao.descricaoItem}</td>
                          <td className="px-4 py-2 text-right font-semibold">{isNaN(padrao.taxaGlosa) ? '0.00' : padrao.taxaGlosa.toFixed(2)}%</td>
                          <td className="px-4 py-2 text-right">R$ {isNaN(padrao.totalFaturado) ? '0' : padrao.totalFaturado.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-2 text-right text-red-600">R$ {isNaN(padrao.totalGlosado) ? '0' : padrao.totalGlosado.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-2">
                            <Badge className={getRiscoBadgeColor(padrao.risco)}>
                              {getRiscoIcon(padrao.risco)}
                              <span className="ml-1">{padrao.risco.toUpperCase()}</span>
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEÇÃO 2: ANÁLISE DE CONTA */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Análise de Risco de Conta
            </CardTitle>
            <CardDescription>
              Analise o risco de glosa de uma guia/conta específica
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Número da Guia</label>
                <Input
                  placeholder="Ex: 12345678"
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

            {analiseRisco && (
              <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Score de Risco</p>
                    <p className="text-2xl font-bold">{isNaN(analiseRisco.scoreRisco) ? '0' : analiseRisco.scoreRisco}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Classificação</p>
                    <Badge className={getRiscoBadgeColor(analiseRisco.riscoConta)}>
                      {analiseRisco.riscoConta.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Valor Faturado</p>
                    <p className="text-lg font-semibold">R$ {isNaN(analiseRisco.valorFaturado) ? '0' : analiseRisco.valorFaturado.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Itens</p>
                    <p className="text-lg font-semibold">{analiseRisco.itens.length}</p>
                  </div>
                </div>

                {analiseRisco.motivosAlerta.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">Alertas:</p>
                    <ul className="space-y-1">
                      {analiseRisco.motivosAlerta.map((motivo, idx) => (
                        <li key={idx} className="text-sm text-red-600 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          {motivo}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analiseRisco.itens.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-200 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left">Código</th>
                          <th className="px-4 py-2 text-left">Descrição</th>
                          <th className="px-4 py-2 text-right">Qtd</th>
                          <th className="px-4 py-2 text-right">Valor</th>
                          <th className="px-4 py-2 text-right">Taxa Glosa Esperada</th>
                          <th className="px-4 py-2">Risco</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analiseRisco.itens.map((item, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="px-4 py-2 font-mono">{item.codigoItem}</td>
                            <td className="px-4 py-2">{item.descricaoItem}</td>
                            <td className="px-4 py-2 text-right">{isNaN(item.quantidade) ? '0' : item.quantidade}</td>
                            <td className="px-4 py-2 text-right">R$ {isNaN(item.valorFaturado) ? '0' : item.valorFaturado.toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-2 text-right">{isNaN(item.taxaGlosaEsperada) ? '0.00' : item.taxaGlosaEsperada.toFixed(2)}%</td>
                            <td className="px-4 py-2">
                              <Badge className={getRiscoBadgeColor(item.riscoPrevisto)}>
                                {item.riscoPrevisto.toUpperCase()}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEÇÃO 3: CONTAS COM RISCO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Contas com Risco (Arquivo Importado)
            </CardTitle>
            <CardDescription>
              Identifique contas de risco em um arquivo XML recém-importado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium">ID do Arquivo</label>
                <Input
                  placeholder="Ex: 123"
                  type="number"
                  value={arquivoId || ""}
                  onChange={(e) => setArquivoId(e.target.value ? parseInt(e.target.value) : null)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Limite de Risco</label>
                <Select value={limiteRisco} onValueChange={(v: any) => setLimiteRisco(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alto">Alto e Crítico</SelectItem>
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
                    "Identificar Contas"
                  )}
                </Button>
              </div>
            </div>

            {contasRisco.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Guia</th>
                      <th className="px-4 py-2 text-right">Score Risco</th>
                      <th className="px-4 py-2">Classificação</th>
                      <th className="px-4 py-2 text-right">Valor Faturado</th>
                      <th className="px-4 py-2 text-right">Itens</th>
                      <th className="px-4 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasRisco.map((conta, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono">{conta.numeroGuia}</td>
                        <td className="px-4 py-2 text-right font-bold">{conta.scoreRisco}</td>
                        <td className="px-4 py-2">
                          <Badge className={getRiscoBadgeColor(conta.riscoConta)}>
                            {getRiscoIcon(conta.riscoConta)}
                            <span className="ml-1">{conta.riscoConta.toUpperCase()}</span>
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">R$ {conta.valorFaturado.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2 text-right">{conta.itens.length}</td>
                        <td className="px-4 py-2">
                          <Button size="sm" variant="outline">
                            Detalhes
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
