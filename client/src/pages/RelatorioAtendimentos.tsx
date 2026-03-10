import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Download, ChevronLeft, ChevronRight, Users, Calendar, Filter, X,
  Activity, RefreshCw, Database, Cloud, CheckCircle2, AlertCircle, Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function getTipoColor(tipo: string) {
  switch (tipo) {
    case "Internação": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Ambulatorial": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "Emergência": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "Urgência": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}

export default function RelatorioAtendimentos() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  // Filtros
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [dataInicio, setDataInicio] = useState(inicioMes.toISOString().split("T")[0]);
  const [dataFim, setDataFim] = useState(hoje.toISOString().split("T")[0]);
  const [tipoAtendimento, setTipoAtendimento] = useState<string>("");
  const [codServ, setCodServ] = useState<string>("");
  const [codPlaco, setCodPlaco] = useState<string>("");
  const [codPrest, setCodPrest] = useState<string>("");
  const [codCc, setCodCc] = useState<string>("");
  const [carater, setCarater] = useState<string>("");
  const [pagina, setPagina] = useState(1);
  const [buscaAtiva, setBuscaAtiva] = useState(false);
  const itensPorPagina = 50;

  // Sync period inputs
  const [syncDataInicio, setSyncDataInicio] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [syncDataFim, setSyncDataFim] = useState(hoje.toISOString().split("T")[0]);

  // Status de sincronização
  const statusSyncInput = useMemo(() => ({ estabelecimentoId }), [estabelecimentoId]);
  const { data: statusSync, refetch: refetchStatus } = trpc.relatorioAtendimentos.statusSincronizacao.useQuery(
    statusSyncInput,
    { enabled: estabelecimentoId > 0 }
  );

  // Mutation de sincronização
  const syncMutation = trpc.relatorioAtendimentos.sincronizar.useMutation({
    onSuccess: (result) => {
      if (result.sucesso) {
        toast.success(result.mensagem);
        refetchStatus();
        // Se já tinha busca ativa, refaz a busca para usar cache novo
        if (buscaAtiva) {
          setBuscaAtiva(false);
          setTimeout(() => setBuscaAtiva(true), 100);
        }
      } else {
        toast.error(`Erro na sincronização: ${result.mensagem}`);
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Buscar opções de filtro
  const { data: opcoesFiltro, isLoading: loadingFiltros } = trpc.relatorioAtendimentos.opcoesFiltro.useQuery();

  // Buscar atendimentos
  const filtrosQuery = useMemo(() => ({
    dataInicio,
    dataFim: dataFim + "T23:59:59",
    tipoAtendimento: tipoAtendimento || undefined,
    codServ: codServ || undefined,
    codPlaco: codPlaco || undefined,
    codPrest: codPrest || undefined,
    codCc: codCc || undefined,
    carater: carater || undefined,
    limit: itensPorPagina,
    offset: (pagina - 1) * itensPorPagina,
  }), [dataInicio, dataFim, tipoAtendimento, codServ, codPlaco, codPrest, codCc, carater, pagina]);

  const { data: resultado, isLoading, isFetching } = trpc.relatorioAtendimentos.buscar.useQuery(
    filtrosQuery,
    { enabled: buscaAtiva }
  );

  const handleBuscar = () => {
    setPagina(1);
    setBuscaAtiva(true);
  };

  const handleLimparFiltros = () => {
    setTipoAtendimento("");
    setCodServ("");
    setCodPlaco("");
    setCodPrest("");
    setCodCc("");
    setCarater("");
    setPagina(1);
  };

  const handleSincronizar = () => {
    if (estabelecimentoId <= 0) {
      toast.error("Selecione um estabelecimento para sincronizar");
      return;
    }
    syncMutation.mutate({
      estabelecimentoId,
      dataInicio: syncDataInicio,
      dataFim: syncDataFim + "T23:59:59",
    });
  };

  const handleExportarExcel = () => {
    if (!resultado?.dados || resultado.dados.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const headers = [
      "N Atendimento", "Tipo", "Servico", "Plano/Convenio", "Proveniente",
      "Data Atendimento", "Data Saida", "Centro de Custo", "Prestador",
      "Procedimento Principal", "CID", "Diagnostico", "Carater", "Paciente"
    ];

    const rows = resultado.dados.map(a => [
      a.numatend,
      a.tipo_atendimento,
      a.servico || a.codserv,
      a.plano_convenio || a.codplaco,
      a.proveniente || "-",
      formatDateShort(a.data_atendimento),
      formatDateShort(a.data_saida),
      a.centro_custo || a.codcc || "-",
      a.prestador || a.codprest || "-",
      a.procedimento_principal || a.procprin || "-",
      a.cidprin || "-",
      a.diagnostico_cid || "-",
      a.carater_atendimento || "-",
      a.paciente || "-",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(";"))
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_atendimentos_${dataInicio}_${dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Relatorio exportado com sucesso!");
  };

  const totalFiltrosAtivos = [tipoAtendimento, codServ, codPlaco, codPrest, codCc, carater].filter(Boolean).length;

  // Render sync status badge
  const renderSyncStatus = () => {
    if (!statusSync) return null;

    const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      sucesso: {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: "Sincronizado",
        color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      },
      em_andamento: {
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
        label: "Sincronizando...",
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      },
      erro: {
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        label: "Erro",
        color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      },
      nunca: {
        icon: <Clock className="h-3.5 w-3.5" />,
        label: "Nunca sincronizado",
        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      },
      pendente: {
        icon: <Clock className="h-3.5 w-3.5" />,
        label: "Pendente",
        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      },
    };

    const config = statusConfig[statusSync.status] || statusConfig.pendente;

    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className={`text-xs py-1 px-2 ${config.color}`}>
          {config.icon}
          <span className="ml-1">{config.label}</span>
        </Badge>
        {statusSync.totalRegistrosCache > 0 && (
          <Badge variant="outline" className="text-xs py-1 px-2">
            <Database className="h-3 w-3 mr-1" />
            {statusSync.totalRegistrosCache.toLocaleString("pt-BR")} em cache
          </Badge>
        )}
        {statusSync.ultimaSincronizacao && (
          <span className="text-xs text-muted-foreground">
            Atualizado em {formatDate(new Date(statusSync.ultimaSincronizacao).toISOString())}
          </span>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Relatorio de Atendimentos
            </h1>
            <p className="text-muted-foreground mt-1">
              Consulte os atendimentos realizados com dados descritivos completos
            </p>
          </div>
          {resultado && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-sm py-1 px-3">
                <Users className="h-3.5 w-3.5 mr-1" />
                {resultado.total.toLocaleString("pt-BR")} atendimentos
              </Badge>
              {/* Fonte dos dados */}
              <Badge
                variant="secondary"
                className={`text-xs py-1 px-2 ${
                  resultado.fonte === "cache_local"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                }`}
              >
                {resultado.fonte === "cache_local" ? (
                  <><Database className="h-3 w-3 mr-1" /> Cache Local</>
                ) : (
                  <><Cloud className="h-3 w-3 mr-1" /> PostgreSQL Direto</>
                )}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleExportarExcel} disabled={!resultado.dados.length}>
                <Download className="h-4 w-4 mr-1" />
                Exportar CSV
              </Button>
            </div>
          )}
        </div>

        {/* Sincronização */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Sincronizacao de Dados
              </div>
              {renderSyncStatus()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs font-medium">Periodo Inicio</Label>
                <Input
                  type="date"
                  value={syncDataInicio}
                  onChange={(e) => setSyncDataInicio(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs font-medium">Periodo Fim</Label>
                <Input
                  type="date"
                  value={syncDataFim}
                  onChange={(e) => setSyncDataFim(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                onClick={handleSincronizar}
                disabled={syncMutation.isPending || estabelecimentoId <= 0}
                className="h-9"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                {syncMutation.isPending ? "Sincronizando..." : "Sincronizar Agora"}
              </Button>
            </div>
            {statusSync?.status === "erro" && statusSync.mensagemErro && (
              <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                Ultimo erro: {statusSync.mensagemErro}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              A sincronizacao copia os dados do Warleine (PostgreSQL) para o cache local, permitindo consultas mais rapidas e disponiveis mesmo offline.
              {statusSync?.status === "nunca" && " Recomendamos sincronizar antes de usar o relatorio."}
            </p>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros de Pesquisa
              {totalFiltrosAtivos > 0 && (
                <Badge variant="secondary" className="ml-2">{totalFiltrosAtivos} filtro(s)</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Período */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Data Inicio</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Data Fim</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Tipo Atendimento */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tipo Atendimento</Label>
                <Select value={tipoAtendimento} onValueChange={setTipoAtendimento}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="I">Internacao</SelectItem>
                    <SelectItem value="A">Ambulatorial</SelectItem>
                    <SelectItem value="E">Emergencia</SelectItem>
                    <SelectItem value="U">Urgencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Caráter */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Carater</Label>
                <Select value={carater} onValueChange={setCarater}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="UR">Urgencia</SelectItem>
                    <SelectItem value="EL">Eletivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Serviço */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Servico</Label>
                <Select value={codServ} onValueChange={setCodServ}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {opcoesFiltro?.servicos?.map((s) => (
                      <SelectItem key={s.codserv} value={s.codserv}>
                        {s.nomeserv?.trim() || s.codserv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plano/Convênio */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Plano/Convenio</Label>
                <Select value={codPlaco} onValueChange={setCodPlaco}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {opcoesFiltro?.planos?.map((p) => (
                      <SelectItem key={p.codplaco} value={p.codplaco}>
                        {p.nomeplaco?.trim() || p.codplaco}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Centro de Custo */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Centro de Custo</Label>
                <Select value={codCc} onValueChange={setCodCc}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {opcoesFiltro?.centrosCusto?.map((c) => (
                      <SelectItem key={c.codcc} value={c.codcc}>
                        {c.nomecc?.trim() || c.codcc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prestador */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Prestador</Label>
                <Select value={codPrest} onValueChange={setCodPrest}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {opcoesFiltro?.prestadores?.map((p) => (
                      <SelectItem key={p.codprest} value={p.codprest}>
                        {p.nomeprest?.trim() || p.codprest}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button onClick={handleBuscar} disabled={isLoading}>
                <Search className="h-4 w-4 mr-1" />
                Buscar
              </Button>
              {totalFiltrosAtivos > 0 && (
                <Button variant="ghost" size="sm" onClick={handleLimparFiltros}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {!buscaAtiva && (
          <Card>
            <CardContent className="py-16 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Selecione o periodo e clique em Buscar</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {statusSync?.totalRegistrosCache && statusSync.totalRegistrosCache > 0
                  ? `${statusSync.totalRegistrosCache.toLocaleString("pt-BR")} atendimentos em cache local disponiveis`
                  : "Os dados serao consultados diretamente do banco de dados do hospital"}
              </p>
            </CardContent>
          </Card>
        )}

        {buscaAtiva && isLoading && (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {buscaAtiva && resultado && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="whitespace-nowrap font-semibold">N Atend.</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Tipo</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Paciente</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Plano/Convenio</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Servico</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Data Atend.</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Data Saida</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Centro Custo</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Prestador</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Procedimento</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">CID</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Carater</TableHead>
                      <TableHead className="whitespace-nowrap font-semibold">Proveniente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.dados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                          Nenhum atendimento encontrado para os filtros selecionados
                        </TableCell>
                      </TableRow>
                    ) : (
                      resultado.dados.map((a, idx) => (
                        <TableRow key={`${a.numatend}-${idx}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm font-medium">{a.numatend}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-xs ${getTipoColor(a.tipo_atendimento)}`}>
                              {a.tipo_atendimento}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={a.paciente || ""}>
                            {a.paciente || "-"}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate" title={a.plano_convenio || ""}>
                            {a.plano_convenio || a.codplaco}
                          </TableCell>
                          <TableCell className="text-sm">{a.servico || a.codserv}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateShort(a.data_atendimento)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateShort(a.data_saida)}</TableCell>
                          <TableCell className="max-w-[150px] truncate text-sm" title={a.centro_custo || ""}>
                            {a.centro_custo || a.codcc || "-"}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm" title={a.prestador || ""}>
                            {a.prestador || a.codprest || "-"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm" title={a.procedimento_principal || ""}>
                            {a.procedimento_principal || a.procprin || "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.cidprin ? (
                              <span title={a.diagnostico_cid || ""} className="cursor-help">
                                {a.cidprin}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {a.carater_atendimento ? (
                              <Badge variant="outline" className="text-xs">
                                {a.carater_atendimento}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-sm">{a.proveniente || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              {resultado.totalPaginas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Pagina {resultado.pagina} de {resultado.totalPaginas} ({resultado.total.toLocaleString("pt-BR")} registros)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina(p => Math.max(1, p - 1))}
                      disabled={pagina <= 1 || isFetching}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagina(p => Math.min(resultado.totalPaginas, p + 1))}
                      disabled={pagina >= resultado.totalPaginas || isFetching}
                    >
                      Proxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPIs resumo */}
        {buscaAtiva && resultado && resultado.dados.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Total Atendimentos</p>
                <p className="text-2xl font-bold">{resultado.total.toLocaleString("pt-BR")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Internacoes</p>
                <p className="text-2xl font-bold text-blue-600">
                  {resultado.dados.filter(d => d.tipo_atendimento === "Internação").length}
                </p>
                <p className="text-xs text-muted-foreground">(nesta pagina)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Ambulatoriais</p>
                <p className="text-2xl font-bold text-green-600">
                  {resultado.dados.filter(d => d.tipo_atendimento === "Ambulatorial").length}
                </p>
                <p className="text-xs text-muted-foreground">(nesta pagina)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">Emergencias</p>
                <p className="text-2xl font-bold text-red-600">
                  {resultado.dados.filter(d => d.tipo_atendimento === "Emergência").length}
                </p>
                <p className="text-xs text-muted-foreground">(nesta pagina)</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
