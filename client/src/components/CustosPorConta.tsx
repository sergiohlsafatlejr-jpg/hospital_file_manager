import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, ArrowLeft, TrendingUp, TrendingDown, DollarSign, FileText,
  AlertTriangle, CheckCircle2, Minus, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface CustosPorContaProps {
  estabelecimentoId: number;
}

export default function CustosPorConta({ estabelecimentoId }: CustosPorContaProps) {
  const [convenio, setConvenio] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [setor, setSetor] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [contaSelecionada, setContaSelecionada] = useState<string | null>(null);

  // Samaritano = 2280016
  const isSamaritano = estabelecimentoId === 2280016;

  // Query principal - lista de contas
  const contasInput = useMemo(() => ({
    estabelecimentoId,
    convenio: convenio || undefined,
    competencia: competencia || undefined,
    setor: setor || undefined,
    busca: busca || undefined,
  }), [estabelecimentoId, convenio, competencia, setor, busca]);

  const contasQuery = trpc.relatorioCustos.custosPorConta.useQuery(
    contasInput,
    { enabled: estabelecimentoId > 0 && !contaSelecionada }
  );

  // Query de detalhe - itens da conta selecionada
  const detalheInput = useMemo(() => ({
    estabelecimentoId,
    numconta: contaSelecionada || "",
  }), [estabelecimentoId, contaSelecionada]);

  const detalheQuery = trpc.relatorioCustos.detalheContaCusto.useQuery(
    detalheInput,
    { enabled: estabelecimentoId > 0 && !!contaSelecionada }
  );

  const handleSearch = () => {
    setBusca(buscaInput);
  };

  const handleClear = () => {
    setConvenio("");
    setCompetencia("");
    setSetor("");
    setBusca("");
    setBuscaInput("");
  };

  const handleVoltar = () => {
    setContaSelecionada(null);
  };

  // ============ TELA DE DETALHE DA CONTA ============
  if (contaSelecionada) {
    const detalhe = detalheQuery.data;
    const isLoading = detalheQuery.isLoading;

    return (
      <div className="space-y-4">
        {/* Header com botão voltar */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleVoltar}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h3 className="text-lg font-semibold">Conta {contaSelecionada}</h3>
            {detalhe && (
              <p className="text-sm text-muted-foreground">
                {detalhe.paciente} — {detalhe.convenio} — {detalhe.dataExecucao}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : detalhe ? (
          <>
            {/* KPIs da conta */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Custo Total</p>
                  <p className="text-lg font-bold text-red-500">{formatCurrency(detalhe.custoTotal)}</p>
                  <p className="text-xs text-muted-foreground">{detalhe.totalItens} itens</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Valor Cobrado</p>
                  <p className="text-lg font-bold text-emerald-500">{formatCurrency(detalhe.valorCobrado)}</p>
                </CardContent>
              </Card>
              <Card className={detalhe.resultado === "lucro" ? "border-emerald-500/30" : detalhe.resultado === "prejuizo" ? "border-red-500/30" : ""}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Margem</p>
                  <p className={`text-lg font-bold ${detalhe.resultado === "lucro" ? "text-emerald-500" : detalhe.resultado === "prejuizo" ? "text-red-500" : "text-muted-foreground"}`}>
                    {formatCurrency(detalhe.margem)}
                  </p>
                  <p className="text-xs text-muted-foreground">{detalhe.margemPercent.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Itens c/ Prejuízo</p>
                  <p className="text-lg font-bold text-red-500">{detalhe.itensPrejuizo}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Itens s/ Custo</p>
                  <p className="text-lg font-bold text-amber-500">{detalhe.itensSemCusto}</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabela de itens */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Itens da Conta ({detalhe.totalItens})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        {isSamaritano && <TableHead>Setor</TableHead>}
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-center">Un. Fat.</TableHead>
                        <TableHead className="text-right">Custo Unit.</TableHead>
                        <TableHead className="text-right">Custo Total</TableHead>
                        <TableHead className="text-right">Cobrado Unit.</TableHead>
                        <TableHead className="text-right">Cobrado Total</TableHead>
                        <TableHead className="text-right">Margem</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalhe.itens.map((item, idx) => (
                        <TableRow key={`${item.codprod}-${idx}`} className={item.resultado === "prejuizo" ? "bg-red-500/5" : item.resultado === "lucro" ? "bg-emerald-500/5" : ""}>
                          <TableCell className="font-mono text-xs">{item.codprod}</TableCell>
                          <TableCell className="text-sm max-w-[250px] truncate" title={item.descricao}>{item.descricao}</TableCell>
                          {isSamaritano && <TableCell className="text-xs">{(item as any).setor || "-"}</TableCell>}
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{item.tipoItemLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{item.quantidade}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{item.unidade}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(item.custoUnitario)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(item.custoTotal)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(item.valorCobradoUnitario)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-500">{formatCurrency(item.valorCobradoTotal)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm font-semibold ${item.resultado === "lucro" ? "text-emerald-600" : item.resultado === "prejuizo" ? "text-red-600" : "text-muted-foreground"}`}>
                            {formatCurrency(item.margem)}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.resultado === "lucro" ? (
                              <TrendingUp className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : item.resultado === "prejuizo" ? (
                              <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />
                            ) : (
                              <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Conta não encontrada
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ============ TELA PRINCIPAL - LISTA DE CONTAS ============
  const data = contasQuery.data;
  const isLoading = contasQuery.isLoading;

  return (
    <div className="space-y-4">
      {/* Descrição */}
      <Card className="border-primary/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Custos por Conta</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {isSamaritano ? "Dados importados do Excel (Samaritano)." : "Dados do Warleine (PostgreSQL)."} Cada linha é uma conta (numconta) com paciente, convênio, custo total vs valor cobrado = <span className="text-emerald-500 font-medium">lucro</span> ou <span className="text-red-500 font-medium">prejuízo</span>. Clique em uma conta para ver os itens detalhados.
          </p>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Label className="text-xs text-muted-foreground">Convênio</Label>
              <Select value={convenio || "all"} onValueChange={(v) => setConvenio(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {data?.conveniosDisponiveis?.map((c) => (
                    <SelectItem key={c.codplaco} value={c.codplaco}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSamaritano && (data as any)?.setoresDisponiveis?.length > 0 && (
              <div className="w-48">
                <Label className="text-xs text-muted-foreground">Setor</Label>
                <Select value={setor || "all"} onValueChange={(v) => setSetor(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(data as any).setoresDisponiveis.map((s: string) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-48">
              <Label className="text-xs text-muted-foreground">Competência</Label>
              <Select value={competencia || "all"} onValueChange={(v) => setCompetencia(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Últimos 12 meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Últimos 12 meses</SelectItem>
                  {data?.competenciasDisponiveis?.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Buscar Conta/Paciente</Label>
              <div className="flex gap-1">
                <Input
                  className="h-9 text-sm"
                  placeholder="Número da conta ou nome do paciente..."
                  value={buscaInput}
                  onChange={(e) => setBuscaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button size="sm" className="h-9 px-3" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-9" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data?.kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase">Total Cobrado</p>
              <p className="text-xl font-bold text-emerald-500">{formatCurrency(data.kpis.valorCobradoGeral)}</p>
              <p className="text-xs text-muted-foreground">{data.kpis.totalContas} contas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase">Custo Total</p>
              <p className="text-xl font-bold text-red-500">{formatCurrency(data.kpis.custoTotalGeral)}</p>
              <p className="text-xs text-muted-foreground">{data.kpis.totalItens} itens</p>
            </CardContent>
          </Card>
          <Card className={data.kpis.margemGeral > 0 ? "border-emerald-500/30" : "border-red-500/30"}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase">Margem Total</p>
              <p className={`text-xl font-bold ${data.kpis.margemGeral > 0 ? "text-emerald-500" : "text-red-500"}`}>
                {formatCurrency(data.kpis.margemGeral)}
              </p>
              <p className="text-xs text-muted-foreground">{data.kpis.margemMediaPercent.toFixed(1)}% média</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">C/ Lucro</p>
                  <p className="text-lg font-bold text-emerald-500">{data.kpis.contasComLucro}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">C/ Prejuízo</p>
                  <p className="text-lg font-bold text-red-500">{data.kpis.contasComPrejuizo}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela de contas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Contas ({data?.totalContas || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.contas?.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Itens</TableHead>
                    <TableHead className="text-right">Custo Total</TableHead>
                    <TableHead className="text-right">Valor Cobrado</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contas.map((conta) => (
                    <TableRow
                      key={conta.numconta}
                      className={`cursor-pointer hover:bg-accent/50 transition-colors ${conta.resultado === "prejuizo" ? "bg-red-500/5" : conta.resultado === "lucro" ? "bg-emerald-500/5" : ""}`}
                      onClick={() => setContaSelecionada(conta.numconta)}
                    >
                      <TableCell className="font-mono font-semibold text-primary">{conta.numconta}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={conta.paciente}>{conta.paciente}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{conta.convenio}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{conta.dataExecucao}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{conta.totalItens}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(conta.custoTotal)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-500">{formatCurrency(conta.valorCobrado)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${conta.resultado === "lucro" ? "text-emerald-600" : conta.resultado === "prejuizo" ? "text-red-600" : "text-muted-foreground"}`}>
                        {formatCurrency(conta.margem)}
                        <span className="text-xs ml-1">({conta.margemPercent.toFixed(1)}%)</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {conta.resultado === "lucro" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                            <TrendingUp className="h-3 w-3 mr-0.5" />
                            Lucro
                          </Badge>
                        ) : conta.resultado === "prejuizo" ? (
                          <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
                            <TrendingDown className="h-3 w-3 mr-0.5" />
                            Prejuízo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Minus className="h-3 w-3 mr-0.5" />
                            Empate
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma conta encontrada com os filtros selecionados</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Prejuízo e Top Lucro */}
      {data && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top Prejuízo */}
          <Card className="border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-500">
                <TrendingDown className="h-4 w-4" />
                Top 20 Contas com Prejuízo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-right">Prejuízo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topContasPrejuizo.map((c) => (
                      <TableRow
                        key={c.numconta}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setContaSelecionada(c.numconta)}
                      >
                        <TableCell className="font-mono text-xs text-primary">{c.numconta}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{c.paciente}</TableCell>
                        <TableCell className="text-xs">{c.convenio}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 font-semibold">{formatCurrency(c.margem)}</TableCell>
                      </TableRow>
                    ))}
                    {data.topContasPrejuizo.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          Nenhuma conta com prejuízo
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Top Lucro */}
          <Card className="border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-500">
                <TrendingUp className="h-4 w-4" />
                Top 20 Contas com Lucro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-right">Lucro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topContasLucro.map((c) => (
                      <TableRow
                        key={c.numconta}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => setContaSelecionada(c.numconta)}
                      >
                        <TableCell className="font-mono text-xs text-primary">{c.numconta}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{c.paciente}</TableCell>
                        <TableCell className="text-xs">{c.convenio}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600 font-semibold">{formatCurrency(c.margem)}</TableCell>
                      </TableRow>
                    ))}
                    {data.topContasLucro.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                          Nenhuma conta com lucro
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
