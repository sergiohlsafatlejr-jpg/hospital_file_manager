import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Building2, Stethoscope, FlaskConical,
  ArrowUpDown, Download, X, RefreshCw,
  Search, AlertTriangle, Clock, Timer, FileText, ArrowLeft, Shield
} from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

type SortColumn = "numatend" | "nomeplaco" | "nomepac" | "datatend" | "datasai" | "diasParado" | "tipoatendimentodescricao" | "codserv" | "carater" | "procprin";
type SortOrder = "asc" | "desc";

function getDiasParadoColor(dias: number): string {
  if (dias >= 7) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (dias >= 3) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
}

function getTipoBadgeColor(tipo: string | null): string {
  switch (tipo?.toUpperCase()) {
    case "INTERNACAO": return "bg-amber-500 text-white";
    case "EXAME": return "bg-violet-500 text-white";
    case "AMBULATORIO": return "bg-blue-500 text-white";
    default: return "bg-slate-500 text-white";
  }
}

export default function AtendimentosFaturar() {
  const [pesquisa, setPesquisa] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("diasParado");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroServico, setFiltroServico] = useState<string | null>(null);
  const [filtroPlano, setFiltroPlano] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [tempoRestante, setTempoRestante] = useState<string>("");

  const POLLING_INTERVAL = 60 * 60 * 1000; // 60 minutos em ms

  const { data: atendimentos, isLoading, refetch, isFetching, dataUpdatedAt } = trpc.atendimentosFaturar.listar.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: POLLING_INTERVAL,
    refetchIntervalInBackground: false,
  });

  // Atualizar timestamp da última atualização quando dados mudam
  useEffect(() => {
    if (dataUpdatedAt) {
      setUltimaAtualizacao(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Countdown para próxima atualização
  useEffect(() => {
    if (!ultimaAtualizacao) return;
    const interval = setInterval(() => {
      const agora = Date.now();
      const proximaAtualizacao = ultimaAtualizacao.getTime() + POLLING_INTERVAL;
      const diff = proximaAtualizacao - agora;
      if (diff <= 0) {
        setTempoRestante("Atualizando...");
        return;
      }
      const minutos = Math.floor(diff / 60000);
      const segundos = Math.floor((diff % 60000) / 1000);
      setTempoRestante(`${minutos}min ${segundos.toString().padStart(2, "0")}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [ultimaAtualizacao]);

  // KPIs
  const kpis = useMemo(() => {
    if (!atendimentos) return { total: 0, internacao: 0, exame: 0, ambulatorio: 0 };
    return {
      total: atendimentos.length,
      internacao: atendimentos.filter(d => d.tipoatendimentodescricao === "INTERNACAO").length,
      exame: atendimentos.filter(d => d.tipoatendimentodescricao === "EXAME").length,
      ambulatorio: atendimentos.filter(d => d.tipoatendimentodescricao === "AMBULATORIO").length,
    };
  }, [atendimentos]);

  // KPIs por plano (convênio)
  const planosContagem = useMemo(() => {
    if (!atendimentos) return [];
    const contagem: Record<string, number> = {};
    atendimentos.forEach(d => {
      const plano = d.nomeplaco || "Sem Plano";
      contagem[plano] = (contagem[plano] || 0) + 1;
    });
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  }, [atendimentos]);

  // Contagem por serviço
  const servicosContagem = useMemo(() => {
    if (!atendimentos) return [];
    const contagem: Record<string, number> = {};
    atendimentos.forEach(d => {
      const servico = d.codserv || "Sem Serviço";
      contagem[servico] = (contagem[servico] || 0) + 1;
    });
    return Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  }, [atendimentos]);

  // Filtro e ordenação
  const dadosFiltrados = useMemo(() => {
    if (!atendimentos) return [];
    let filtrados = [...atendimentos];

    // Filtro por tipo
    if (filtroTipo !== "todos") {
      filtrados = filtrados.filter(d => d.tipoatendimentodescricao === filtroTipo);
    }

    // Filtro por serviço
    if (filtroServico) {
      filtrados = filtrados.filter(d => (d.codserv || "Sem Serviço") === filtroServico);
    }

    // Filtro por plano
    if (filtroPlano) {
      filtrados = filtrados.filter(d => (d.nomeplaco || "Sem Plano") === filtroPlano);
    }

    // Filtro de pesquisa
    if (pesquisa) {
      const termo = pesquisa.toLowerCase();
      filtrados = filtrados.filter(d => {
        const campos = [
          d.numatend, d.nomeplaco, d.nomepac,
          d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
          d.datasai ? new Date(d.datasai).toLocaleDateString("pt-BR") : "",
          String(d.diasParado),
          d.tipoatendimentodescricao, d.codserv,
          d.carater, d.procprin,
        ];
        return campos.some(c => (c || "").toLowerCase().includes(termo));
      });
    }

    // Ordenação
    filtrados.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];
      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (sortColumn === "datatend" || sortColumn === "datasai") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (sortColumn === "diasParado" || sortColumn === "numatend") {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtrados;
  }, [atendimentos, pesquisa, sortColumn, sortOrder, filtroTipo, filtroServico, filtroPlano]);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortOrder("asc");
    }
  }

  function exportarExcel() {
    const dadosExport = dadosFiltrados.map(d => ({
      "Nº Atend.": d.numatend,
      "Plano": d.nomeplaco,
      "Paciente": d.nomepac || "-",
      "Caráter": d.carater || "-",
      "Data Entrada": d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
      "Data Saída": d.datasai ? new Date(d.datasai).toLocaleDateString("pt-BR") : "",
      "Dias Parado": d.diasParado,
      "Tipo": d.tipoatendimentodescricao || "-",
      "Serviço": d.codserv || "-",
      "Proc. Principal": d.procprin || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos a Faturar");
    const dataHoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    XLSX.writeFile(wb, `atendimentos_a_faturar_${dataHoje}.xlsx`);
  }

  const SortIcon = ({ col }: { col: SortColumn }) => (
    <span className="ml-1 text-xs opacity-60">
      {sortColumn === col ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Carregando atendimentos a faturar...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate("/")} className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-7 h-7 text-primary" />
              Atendimentos a Faturar - Instituto do Rim
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Atendimentos com alta nos últimos 90 dias pendentes de faturamento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Indicador de última atualização */}
          {ultimaAtualizacao && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Timer className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Atualizado: {ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                {tempoRestante && (
                  <span className="text-[10px] opacity-70">Próxima em {tempoRestante}</span>
                )}
              </div>
            </div>
          )}
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFiltroTipo("todos")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total a Faturar</p>
                <p className="text-3xl font-bold mt-1">{kpis.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-amber-500/50 transition-colors ${filtroTipo === "INTERNACAO" ? "border-amber-500" : ""}`} onClick={() => setFiltroTipo(f => f === "INTERNACAO" ? "todos" : "INTERNACAO")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Internação</p>
                <p className="text-3xl font-bold mt-1 text-amber-500">{kpis.internacao}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-violet-500/50 transition-colors ${filtroTipo === "EXAME" ? "border-violet-500" : ""}`} onClick={() => setFiltroTipo(f => f === "EXAME" ? "todos" : "EXAME")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Exame</p>
                <p className="text-3xl font-bold mt-1 text-violet-500">{kpis.exame}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-blue-500/50 transition-colors ${filtroTipo === "AMBULATORIO" ? "border-blue-500" : ""}`} onClick={() => setFiltroTipo(f => f === "AMBULATORIO" ? "todos" : "AMBULATORIO")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ambulatório</p>
                <p className="text-3xl font-bold mt-1 text-blue-500">{kpis.ambulatorio}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPIs por Plano */}
      {planosContagem.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground">Quantidade por Plano (Convênio)</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {planosContagem.map(([plano, qtd]) => (
                <div
                  key={plano}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 ${
                    filtroPlano === plano
                      ? "bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500/30"
                      : "bg-muted/50"
                  }`}
                  onClick={() => setFiltroPlano(prev => prev === plano ? null : plano)}
                >
                  <span className={`truncate mr-2 text-xs ${filtroPlano === plano ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>{plano}</span>
                  <span className="font-bold text-emerald-600">{qtd}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quantidade por Serviço */}
      {servicosContagem.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Quantidade por Serviço</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {servicosContagem.map(([servico, qtd]) => (
                <div
                  key={servico}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm cursor-pointer transition-all hover:border-primary/50 hover:bg-primary/5 ${
                    filtroServico === servico
                      ? "bg-primary/10 border-primary ring-1 ring-primary/30"
                      : "bg-muted/50"
                  }`}
                  onClick={() => setFiltroServico(prev => prev === servico ? null : servico)}
                >
                  <span className={`truncate mr-2 ${filtroServico === servico ? "text-primary font-medium" : "text-muted-foreground"}`}>{servico}</span>
                  <span className="font-bold text-primary">{qtd}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros e Ações */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por Nº Atend., Paciente, Plano, Data, Tipo, Serviço, Proc. Principal..."
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={exportarExcel} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Download className="w-4 h-4" /> Exportar Excel
        </Button>
      </div>

      {(filtroTipo !== "todos" || filtroServico || filtroPlano) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-blue-400 bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/20">
          <AlertTriangle className="w-4 h-4" />
          <span>Filtros ativos:</span>
          {filtroTipo !== "todos" && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroTipo("todos")}>
              Tipo: {filtroTipo} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtroServico && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroServico(null)}>
              Serviço: {filtroServico} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtroPlano && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => setFiltroPlano(null)}>
              Plano: {filtroPlano} <X className="w-3 h-3" />
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => { setFiltroTipo("todos"); setFiltroServico(null); setFiltroPlano(null); }}>
            <X className="w-3 h-3 mr-1" /> Limpar Todos
          </Button>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {[
                  { col: "numatend" as SortColumn, label: "Nº Atend." },
                  { col: "nomeplaco" as SortColumn, label: "Plano" },
                  { col: "nomepac" as SortColumn, label: "Paciente" },
                  { col: "carater" as SortColumn, label: "Caráter" },
                  { col: "datatend" as SortColumn, label: "Data Entrada" },
                  { col: "datasai" as SortColumn, label: "Data Saída" },
                  { col: "diasParado" as SortColumn, label: "Dias Parado" },
                  { col: "tipoatendimentodescricao" as SortColumn, label: "Tipo" },
                  { col: "codserv" as SortColumn, label: "Serviço" },
                  { col: "procprin" as SortColumn, label: "Proc. Principal" },
                ].map(({ col, label }) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left font-semibold cursor-pointer hover:bg-muted/50 select-none whitespace-nowrap"
                    onClick={() => handleSort(col)}
                  >
                    {label}
                    <SortIcon col={col} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum atendimento a faturar encontrado
                  </td>
                </tr>
              ) : (
                dadosFiltrados.map((d, idx) => (
                  <tr
                    key={`${d.numatend}-${idx}`}
                    className="border-b hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium">{d.numatend}</td>
                    <td className="px-4 py-3 max-w-[150px] truncate" title={d.nomeplaco}>{d.nomeplaco}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate" title={d.nomepac || ""}>{d.nomepac || "-"}</td>
                    <td className="px-4 py-3">
                      {d.carater ? (
                        <Badge variant="outline" className="text-xs">
                          {d.carater === "UR" ? "Urgência" : d.carater === "EL" ? "Eletivo" : d.carater}
                        </Badge>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {d.datasai ? new Date(d.datasai).toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${getDiasParadoColor(d.diasParado)}`}>
                        <Clock className="w-3 h-3" />
                        {d.diasParado} {d.diasParado === 1 ? "dia" : "dias"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${getTipoBadgeColor(d.tipoatendimentodescricao)} text-xs`}>
                        {d.tipoatendimentodescricao || "-"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{d.codserv || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.procprin || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t text-sm text-muted-foreground">
          Exibindo {dadosFiltrados.length} de {kpis.total} atendimentos a faturar
        </div>
      </Card>
    </div>
  );
}
