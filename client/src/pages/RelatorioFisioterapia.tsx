import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useBiAutoRefresh } from "@/hooks/useBiAutoRefresh";
import { BiAutoRefreshBar } from "@/components/bi/BiAutoRefreshBar";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Download, Loader2, Search, DollarSign, Calendar, Users, Activity,
  ChevronDown, ChevronRight, FileText
} from "lucide-react";

const fmt = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v || 0);
  if (isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  } catch { return "-"; }
};

const MESES_LABEL: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

const fmtMesAno = (mes: string | null | undefined) => {
  if (!mes || typeof mes !== "string") return "-";
  const [ano, mesNum] = mes.split("-");
  if (!ano || !mesNum) return mes;
  return `${MESES_LABEL[mesNum] || mesNum}/${ano}`;
};

export default function RelatorioFisioterapia() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [mesAno, setMesAno] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [expandedPacientes, setExpandedPacientes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => { setBuscaDebounced(busca); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const {
    autoRefreshAtivo,
    toggleAutoRefresh,
    arquivosEmProcessamento,
    queryOptions,
  } = useBiAutoRefresh({
    estabelecimentoId: estabelecimentoAtual?.id,
    enabled: !!estabelecimentoAtual,
    onRefresh: () => {
      void mesesQuery.refetch();
      void dadosQuery.refetch();
    },
  });

  // Buscar meses disponíveis
  const mesesQuery = trpc.relatorioFisioterapia.getMesesDisponiveis.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id! },
    { enabled: !!estabelecimentoAtual, ...queryOptions }
  );
  const mesesDisponiveis = mesesQuery.data;

  const mesesValidos = useMemo(
    () => (mesesDisponiveis || []).filter((m: any) => typeof m?.mes === "string" && m.mes.includes("-")),
    [mesesDisponiveis]
  );

  // Auto-selecionar o mês mais recente
  useEffect(() => {
    if (mesesValidos.length && !mesAno) {
      setMesAno(mesesValidos[0].mes);
    }
  }, [mesesValidos, mesAno]);

  // Buscar dados do relatório
  const dadosQuery = trpc.relatorioFisioterapia.getDados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id!,
      mesAno: mesAno || undefined,
    },
    { enabled: !!estabelecimentoAtual && !!mesAno, ...queryOptions }
  );
  const { data, isLoading } = dadosQuery;

  // Filtrar pacientes pela busca
  const pacientesFiltrados = useMemo(() => {
    if (!data?.pacientes) return [];
    if (!buscaDebounced) return data.pacientes;
    const termo = buscaDebounced.toLowerCase();
    return data.pacientes.filter((p: any) =>
      String(p.paciente || "").toLowerCase().includes(termo) ||
      String(p.numeroGuia || "").toLowerCase().includes(termo)
    );
  }, [data?.pacientes, buscaDebounced]);

  const togglePaciente = (key: string) => {
    setExpandedPacientes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandirTodos = () => {
    if (!pacientesFiltrados.length) return;
    const allKeys = pacientesFiltrados.map((p: any) => `${p.paciente}|${p.numeroGuia}`);
    setExpandedPacientes(new Set(allKeys));
  };

  const recolherTodos = () => {
    setExpandedPacientes(new Set());
  };

  // Exportar para Excel
  const handleExportExcel = () => {
    if (!pacientesFiltrados?.length) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const rows: any[] = [];
    for (const pac of pacientesFiltrados) {
      for (const item of pac.itens) {
        rows.push({
          "Paciente": pac.paciente,
          "Guia": pac.numeroGuia,
          "Código": item.codigoItem,
          "Descrição": item.descricaoItem,
          "Data Execução": fmtDate(item.dataExecucao),
          "Quantidade": item.quantidade,
          "Valor Pago": Number(item.valorPago).toFixed(2),
          "Situação": item.situacao,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fisioterapia");

    // Ajustar largura das colunas
    ws["!cols"] = [
      { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 55 },
      { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    ];

    const mesLabel = mesAno ? mesAno.replace("-", "_") : "todos";
    XLSX.writeFile(wb, `relatorio_fisioterapia_ox_uti_${mesLabel}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  const mesLabel = mesAno ? fmtMesAno(mesAno) : "";

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Relatório de Fisioterapia - Ox UTI
            </h1>
            <p className="text-muted-foreground mt-1">
              Pacientes pagos no demonstrativo para códigos de fisioterapia (20103093, 20203047)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!pacientesFiltrados?.length}>
              <Download className="h-4 w-4 mr-1" />
              Exportar Excel
            </Button>
          </div>
        </div>

        <BiAutoRefreshBar
          autoRefreshAtivo={autoRefreshAtivo}
          onToggleAutoRefresh={toggleAutoRefresh}
          isFetching={dadosQuery.isFetching}
          isError={dadosQuery.isError}
          dataUpdatedAt={dadosQuery.dataUpdatedAt}
          arquivosEmProcessamento={arquivosEmProcessamento}
          showRefreshButton
          onRefresh={() => {
            void dadosQuery.refetch();
          }}
        />

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select value={mesAno} onValueChange={setMesAno}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesValidos.map((m: any) => (
                      <SelectItem key={m.mes} value={m.mes}>
                        {fmtMesAno(m.mes)} ({m.pacientes} pac.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar paciente ou guia..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={expandirTodos}>
                  Expandir Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={recolherTodos}>
                  Recolher Todos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards de Resumo */}
        {data?.resumo && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pacientes</p>
                    <p className="text-2xl font-bold">{data.resumo.totalPacientes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <DollarSign className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Pago</p>
                    <p className="text-2xl font-bold">{fmt(data.resumo.totalGeralPago)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Activity className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Sessões</p>
                    <p className="text-2xl font-bold">{data.resumo.totalGeralSessoes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <FileText className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Registros</p>
                    <p className="text-2xl font-bold">{data.resumo.totalRegistros}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabela de Pacientes */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Carregando dados...</span>
          </div>
        ) : pacientesFiltrados.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Nenhum registro de fisioterapia encontrado para o período selecionado.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Pacientes com Fisioterapia Paga - {mesLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pacientesFiltrados.map((pac: any) => {
                  const key = `${pac.paciente}|${pac.numeroGuia}`;
                  const isExpanded = expandedPacientes.has(key);
                  return (
                    <div key={key} className="border rounded-lg overflow-hidden">
                      {/* Linha do paciente */}
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => togglePaciente(key)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{pac.paciente}</span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              Guia {pac.numeroGuia}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>{fmtDate(pac.dataInicio)} a {fmtDate(pac.dataFim)}</span>
                            <span>{pac.totalSessoes} sessões</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-green-600">{fmt(pac.totalPago)}</p>
                        </div>
                      </div>

                      {/* Detalhes expandidos */}
                      {isExpanded && (
                        <div className="border-t bg-muted/20">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[100px]">Código</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-[110px]">Data</TableHead>
                                <TableHead className="w-[60px] text-center">Qtd</TableHead>
                                <TableHead className="w-[110px] text-right">Valor Pago</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pac.itens.map((item: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-xs">{item.codigoItem}</TableCell>
                                  <TableCell className="text-sm">{item.descricaoItem}</TableCell>
                                  <TableCell className="text-sm">{fmtDate(item.dataExecucao)}</TableCell>
                                  <TableCell className="text-center">{item.quantidade}</TableCell>
                                  <TableCell className="text-right font-medium">{fmt(item.valorPago)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
