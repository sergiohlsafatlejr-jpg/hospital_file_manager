import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Building2, Stethoscope, FlaskConical,
  ArrowUpDown, Download, Plus, X, RefreshCw,
  Search, Bell, AlertTriangle, Clock, Timer, ArrowLeft, Shield
} from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

// Motivos de notificação
const MOTIVOS = [
  { value: "anestesista", label: "Pendência com Anestesista" },
  { value: "medico", label: "Pendência Médica" },
  { value: "medcore", label: "Pendência Medcore" },
  { value: "enfermagem", label: "Pendência Enfermagem" },
  { value: "centro_cirurgico", label: "Pendência Centro Cirúrgico" },
  { value: "farmacia", label: "Pendência Farmácia" },
  { value: "exames", label: "Falta de Exames" },
  { value: "autorizacao", label: "Falta Autorização" },
  { value: "autorizacao_prorr", label: "Falta Autorização de Prorr." },
  { value: "outro", label: "Outro" },
];

const SETORES = [
  { value: "faturamento", label: "Faturamento" },
  { value: "recepcao", label: "Recepção" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "centro_cirurgico", label: "Centro Cirúrgico" },
  { value: "medico", label: "Médico" },
  { value: "uti", label: "UTI" },
];

const MEDICOS = [
  { value: "dr_adelvanio_morato", label: "Dr. Adelvanio Morato" },
  { value: "dr_alexandre", label: "Dr. Alexandre Augustus" },
  { value: "dr_augusto_Junior", label: "Dr. Augusto Junior" },
  { value: "dra_christiane_Yumi", label: "Dra. Christiane Yumi" },
  { value: "dr_cleizony", label: "Dra. Cleizony" },
  { value: "dr_delio", label: "Dr. Delio de Souza Bastos" },
  { value: "dr_elida", label: "Dra. Elida Natalie" },
  { value: "dra_fabio_cleber", label: "Dr. Fabio Cleber" },
  { value: "dr_felipe", label: "Dr. Felipe Domingues" },
  { value: "dr_flavio_madeira", label: "Dr. Flavio Madeira" },
  { value: "dr_gustavo_gomes", label: "Dr. Gustavo Gomes" },
  { value: "dr_joao_batista", label: "Dr. João Batista" },
  { value: "dr_joao_gabriel", label: "Dr. João Gabriel" },
  { value: "dr_josafa", label: "Dr. Josafa Pereira" },
  { value: "dr_jose_dias", label: "Dr. José Dias" },
  { value: "dr_jose_Israel", label: "Dr. José Israel" },
  { value: "dr_laurence", label: "Dr. Laurence Amorim" },
  { value: "dr_leandro_mendonca", label: "Dr. Leandro Mendonça" },
  { value: "dr_marcio_gasparine", label: "Dr. Marcio Gasparine" },
  { value: "dr_nadim_chater", label: "Dr. Nadim Chater" },
  { value: "dr_pedro_marcelo", label: "Dr. Pedro Marcelo" },
  { value: "dr_reginaldo", label: "Dr. Reginaldo Manata" },
  { value: "dr_rolando", label: "Dr. Rolando" },
  { value: "dr_tadeu", label: "Dr. Tadeu Gomes" },
  { value: "dr_thais", label: "Dra. Thais Domingues" },
  { value: "dr_thiago_henrique", label: "Dr. Thiago Henrique" },
  { value: "dr_walid", label: "Dr. Walid Chater" },
  { value: "dr_wilson", label: "Dr. Wilson Gomes" },
  { value: "outros", label: "Outros" },
];

type SortColumn = "numatend" | "nomepac" | "nomeplaco" | "datatend" | "datasai" | "diasParado" | "tipoatendimentodescricao" | "codserv" | "codcc_destino" | "motivo";
type SortOrder = "asc" | "desc";

interface NotificacaoLinha {
  motivo: string;
  setor: string;
  medico: string;
}

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

export default function Atendimentos() {

  const [pesquisa, setPesquisa] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("diasParado");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<{ numatend: string; nomepac: string } | null>(null);
  const [notificacaoLinhas, setNotificacaoLinhas] = useState<NotificacaoLinha[]>([{ motivo: "", setor: "", medico: "" }]);
  const [observacao, setObservacao] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroServico, setFiltroServico] = useState<string | null>(null);

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [tempoRestante, setTempoRestante] = useState<string>("");

  const POLLING_INTERVAL = 60 * 60 * 1000; // 60 minutos em ms

  const { data: atendimentos, isLoading, refetch, isFetching, dataUpdatedAt } = trpc.atendimentos.listar.useQuery(undefined, {
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

  const registrarNotificacao = trpc.atendimentos.registrarNotificacao.useMutation({
    onSuccess: () => {
      toast.success("Notificação registrada com sucesso!");
      setModalAberto(false);
      setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
      setObservacao("");
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro ao registrar notificação: ${err.message}`);
    },
  });

  const [, navigate] = useLocation();

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
  const [filtroPlano, setFiltroPlano] = useState<string | null>(null);
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
          d.numatend, d.nomepac, d.nomeplaco,
          d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
          d.datasai ? new Date(d.datasai).toLocaleDateString("pt-BR") : "",
          String(d.diasParado),
          d.tipoatendimentodescricao, d.codserv, d.codcc_destino, d.motivo,
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

  function abrirModal(numatend: string, nomepac: string) {
    setAtendimentoSelecionado({ numatend, nomepac });
    setNotificacaoLinhas([{ motivo: "", setor: "", medico: "" }]);
    setObservacao("");
    setModalAberto(true);
  }

  function adicionarLinha() {
    setNotificacaoLinhas(prev => [...prev, { motivo: "", setor: "", medico: "" }]);
  }

  function removerLinha(index: number) {
    if (notificacaoLinhas.length > 1) {
      setNotificacaoLinhas(prev => prev.filter((_, i) => i !== index));
    }
  }

  function atualizarLinha(index: number, campo: keyof NotificacaoLinha, valor: string) {
    setNotificacaoLinhas(prev => prev.map((l, i) => i === index ? { ...l, [campo]: valor } : l));
  }

  function aplicarNotificacao() {
    if (!atendimentoSelecionado) return;
    if (!observacao.trim()) {
      toast.error("Preencha a observação");
      return;
    }
    registrarNotificacao.mutate({
      numatend: atendimentoSelecionado.numatend,
      observacao,
      notificacoes: notificacaoLinhas,
    });
  }

  function exportarExcel() {
    const dadosExport = dadosFiltrados.map(d => ({
      "Nº Atend.": d.numatend,
      "Paciente": d.nomepac,
      "Plano": d.nomeplaco,
      "Data Entrada": d.datatend ? new Date(d.datatend).toLocaleDateString("pt-BR") : "",
      "Data Saída": d.datasai ? new Date(d.datasai).toLocaleDateString("pt-BR") : "",
      "Dias Parado": d.diasParado,
      "Tipo": d.tipoatendimentodescricao || "-",
      "Serviço": d.codserv,
      "CC Destino": d.codcc_destino || "-",
      "Motivo": d.motivo || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    const dataHoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    XLSX.writeFile(wb, `atendimentos_parados_${dataHoje}.xlsx`);
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
        <span className="ml-3 text-muted-foreground">Carregando atendimentos...</span>
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
          <h1 className="text-2xl font-bold">Atendimentos Parados - Instituto do Rim</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento de atendimentos pendentes de faturamento
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
                <p className="text-sm text-muted-foreground">Total de Atendimentos</p>
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
            placeholder="Buscar por Nº Atend., Paciente, Plano, Data, Tipo, Serviço, Motivo..."
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
                  { col: "nomepac" as SortColumn, label: "Paciente" },
                  { col: "nomeplaco" as SortColumn, label: "Plano" },
                  { col: "datatend" as SortColumn, label: "Data Entrada" },
                  { col: "datasai" as SortColumn, label: "Data Saída" },
                  { col: "diasParado" as SortColumn, label: "Dias Parado" },
                  { col: "tipoatendimentodescricao" as SortColumn, label: "Tipo" },
                  { col: "codserv" as SortColumn, label: "Serviço" },
                  { col: "codcc_destino" as SortColumn, label: "CC Destino" },
                  { col: "motivo" as SortColumn, label: "Motivo" },
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
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum atendimento encontrado
                  </td>
                </tr>
              ) : (
                dadosFiltrados.map((d, idx) => (
                  <tr
                    key={`${d.numatend}-${idx}`}
                    className="border-b hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium">{d.numatend}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate" title={d.nomepac}>{d.nomepac}</td>
                    <td className="px-4 py-3 max-w-[150px] truncate" title={d.nomeplaco}>{d.nomeplaco}</td>
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
                    <td className="px-4 py-3">{d.codserv}</td>
                    <td className="px-4 py-3">{d.codcc_destino || "-"}</td>
                    <td className="px-4 py-3 max-w-[150px] truncate" title={d.motivo || ""}>
                      {d.motivo ? (
                        <span className="text-amber-400">{d.motivo}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => abrirModal(d.numatend, d.nomepac)}
                      >
                        <Bell className="w-3 h-3" /> Notificar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t text-sm text-muted-foreground">
          Exibindo {dadosFiltrados.length} de {kpis.total} atendimentos
        </div>
      </Card>

      {/* Modal de Notificação */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Registro de Notificação - {atendimentoSelecionado?.nomepac}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Atendimento: <strong className="text-foreground">{atendimentoSelecionado?.numatend}</strong>
            </p>

            {notificacaoLinhas.map((linha, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/20">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Motivo</label>
                  <Select value={linha.motivo} onValueChange={v => atualizarLinha(index, "motivo", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
                  <Select value={linha.setor} onValueChange={v => atualizarLinha(index, "setor", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                    <SelectContent>
                      {SETORES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Médico</label>
                    <Select value={linha.medico} onValueChange={v => atualizarLinha(index, "medico", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                      <SelectContent>
                        {MEDICOS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {notificacaoLinhas.length > 1 && (
                    <Button variant="ghost" size="icon" className="mt-5 text-destructive h-9 w-9" onClick={() => removerLinha(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" className="gap-1" onClick={adicionarLinha}>
              <Plus className="w-3 h-3" /> Adicionar Notificação
            </Button>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Observação *</label>
              <Textarea
                placeholder="Digite a observação..."
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button
              onClick={aplicarNotificacao}
              disabled={registrarNotificacao.isPending}
              className="gap-2"
            >
              {registrarNotificacao.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
