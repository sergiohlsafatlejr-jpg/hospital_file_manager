import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, DollarSign, BarChart3,
  Download, FileText, Presentation, ArrowLeftRight, Loader2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const fmtK = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase" style={{ color: "#6b8cae" }}>
        <Icon size={14} />{label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#6b8cae" }}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px" }}>
      <p style={{ color: "#6b8cae", marginBottom: 6, fontSize: 12 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, fontSize: 12, margin: "2px 0" }}>
          {p.name}: {fmtCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function RelatoriosGlosasBi() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabId = estabelecimentoAtual?.id || 0;
  const estabNome = estabelecimentoAtual?.nome || "—";

  const [competenciaInicio, setCompetenciaInicio] = useState<string | undefined>();
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [showComparar, setShowComparar] = useState(false);
  const [comp1, setComp1] = useState<string>("");
  const [comp2, setComp2] = useState<string>("");
  const [comparativoResult, setComparativoResult] = useState<any>(null);
  const [comparativoLoading, setComparativoLoading] = useState(false);

  const { data: filtros } = trpc.relatoriosGlosasBi.filtros.useQuery(
    { estabelecimentoId: estabId }, { enabled: !!estabId }
  );

  const kpisInput = useMemo(() => ({ estabelecimentoId: estabId, convenioId, competenciaInicio }), [estabId, convenioId, competenciaInicio]);
  const { data: kpis, isLoading: kpisLoading } = trpc.relatoriosGlosasBi.kpis.useQuery(kpisInput, { enabled: !!estabId });

  const tendenciaInput = useMemo(() => ({ estabelecimentoId: estabId, convenioId, meses: 12 }), [estabId, convenioId]);
  const { data: tendencia } = trpc.relatoriosGlosasBi.tendenciaMensal.useQuery(tendenciaInput, { enabled: !!estabId });

  const codigoInput = useMemo(() => ({ estabelecimentoId: estabId, convenioId, competenciaInicio, limite: 20 }), [estabId, convenioId, competenciaInicio]);
  const { data: porCodigo } = trpc.relatoriosGlosasBi.porCodigo.useQuery(codigoInput, { enabled: !!estabId });

  const comparativoMutation = trpc.relatoriosGlosasBi.comparativoMeses.useMutation({
    onSuccess: (data) => { setComparativoResult(data); setComparativoLoading(false); },
    onError: (err) => { toast.error("Erro: " + err.message); setComparativoLoading(false); },
  });

  const handleComparar = () => {
    if (!comp1 || !comp2) { toast.error("Selecione os dois períodos"); return; }
    setComparativoLoading(true);
    comparativoMutation.mutate({ estabelecimentoId: estabId, competencia1: comp1, competencia2: comp2, convenioId });
  };

  const topMotivosComPareto = useMemo(() => {
    if (!porCodigo?.length) return [];
    const total = porCodigo.reduce((s, r) => s + r.totalGlosa, 0);
    let acumulado = 0;
    return porCodigo.map((r) => {
      const pct = total > 0 ? (r.totalGlosa / total) * 100 : 0;
      acumulado += pct;
      return { ...r, pct, pareto: acumulado };
    });
  }, [porCodigo]);

  const periodoLabel = useMemo(() => {
    if (competenciaInicio) return `A partir de ${competenciaInicio}`;
    if (tendencia?.length) {
      const sorted = [...tendencia].sort((a, b) => a.competencia.localeCompare(b.competencia));
      return `${sorted[0]?.competencia} a ${sorted[sorted.length - 1]?.competencia}`;
    }
    return "Todas as competências";
  }, [competenciaInicio, tendencia]);

  const chartData = useMemo(() => {
    if (!tendencia) return [];
    return tendencia.map((r) => ({ name: r.competencia, Cobrado: r.totalInformado, Pago: r.totalPago, Glosado: r.totalGlosa }));
  }, [tendencia]);

  const handleExportExcel = () => {
    if (!topMotivosComPareto.length && !kpis) { toast.error("Sem dados para exportar"); return; }
    const wb = XLSX.utils.book_new();
    if (kpis) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Métrica", "Valor"],
        ["Valor Cobrado", kpis.totalInformado], ["Valor Pago", kpis.totalPago],
        ["Valor Glosado", kpis.totalGlosa], ["Taxa de Glosa (%)", kpis.taxaGlosa],
        ["Total Itens", kpis.totalItens], ["Itens Glosados", kpis.totalGlosados],
        ["Total Guias", kpis.totalGuias], ["Guias com Glosa", kpis.guiasComGlosa],
        ["Total Recuperado", kpis.totalRecuperado], ["Em Recurso", kpis.totalEmRecurso],
      ]), "KPIs");
    }
    if (topMotivosComPareto.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Código", "Motivo", "Vl Glosa", "%", "Pareto%"],
        ...topMotivosComPareto.map((r) => [r.codigoGlosa, r.descricao, r.totalGlosa, r.pct.toFixed(2), r.pareto.toFixed(2)]),
      ]), "Top Motivos");
    }
    if (tendencia?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Competência", "Cobrado", "Pago", "Glosado", "Taxa Glosa%"],
        ...tendencia.map((r) => [r.competencia, r.totalInformado, r.totalPago, r.totalGlosa, r.taxaGlosa]),
      ]), "Evolução Mensal");
    }
    XLSX.writeFile(wb, `relatorio-glosas-${estabNome}-${Date.now()}.xlsx`);
    toast.success("Excel exportado!");
  };

  if (!estabId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64" style={{ color: "#6b8cae" }}>
          Selecione um estabelecimento para visualizar o relatório.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ background: "#060f1a", minHeight: "100vh", padding: "24px" }}>

        {/* HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <BarChart3 size={22} style={{ color: "#4fc3f7" }} />
              <h1 className="text-xl font-bold tracking-wide" style={{ color: "#e8f4fd" }}>
                RELATÓRIO DE ANÁLISE DE GLOSAS
              </h1>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: "#6b8cae" }}>
              <span>Geração automática • {estabNome}</span>
              <span style={{ background: "#1a3a5c", color: "#4fc3f7", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                Fonte: Demonstrativo
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={competenciaInicio || "todas"} onValueChange={(v) => setCompetenciaInicio(v === "todas" ? undefined : v)}>
              <SelectTrigger style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e8f4fd", width: 160 }}>
                <SelectValue placeholder="Todas Comp." />
              </SelectTrigger>
              <SelectContent style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }}>
                <SelectItem value="todas" style={{ color: "#e8f4fd" }}>Todas Comp.</SelectItem>
                {filtros?.competencias.map((c) => (
                  <SelectItem key={c} value={c} style={{ color: "#e8f4fd" }}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={convenioId?.toString() || "todos"} onValueChange={(v) => setConvenioId(v === "todos" ? undefined : parseInt(v))}>
              <SelectTrigger style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e8f4fd", width: 180 }}>
                <SelectValue placeholder="Todos Convênios" />
              </SelectTrigger>
              <SelectContent style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }}>
                <SelectItem value="todos" style={{ color: "#e8f4fd" }}>Todos Convênios</SelectItem>
                {filtros?.convenios.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()} style={{ color: "#e8f4fd" }}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline"
              style={{ background: "#0d2a1a", border: "1px solid #1a5c2a", color: "#4caf50" }}
              onClick={handleExportExcel}>
              <Download size={14} className="mr-1" /> Excel
            </Button>
            <Button size="sm" variant="outline"
              style={{ background: "#1a0d2a", border: "1px solid #3a1a5c", color: "#ce93d8" }}
              onClick={() => toast.info("Use Ctrl+P para salvar como PDF")}>
              <FileText size={14} className="mr-1" /> PDF
            </Button>
            <Button size="sm" variant="outline"
              style={{ background: "#2a1a0d", border: "1px solid #5c3a1a", color: "#ffb74d" }}
              onClick={() => toast.info("Exportação PowerPoint em desenvolvimento")}>
              <Presentation size={14} className="mr-1" /> PowerPoint
            </Button>
            <Button size="sm" variant="outline"
              style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#4fc3f7" }}
              onClick={() => setShowComparar(true)}>
              <ArrowLeftRight size={14} className="mr-1" /> Comparar Meses
            </Button>
          </div>
        </div>

        {/* KPI CARDS */}
        {kpisLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <KpiCard label="Valor Cobrado" value={fmtCurrency(kpis.totalInformado)} icon={DollarSign} color="#4fc3f7" sub={kpis.totalFaturadoTiss > 0 ? `Fonte: XML enviado (${kpis.totalItens.toLocaleString("pt-BR")} itens)` : `Fonte: Demonstrativo (${kpis.totalItens.toLocaleString("pt-BR")} itens)`} />
            <KpiCard label="Valor Pago" value={fmtCurrency(kpis.totalPago)} icon={TrendingUp} color="#4caf50" sub={`${kpis.totalGuias.toLocaleString("pt-BR")} guias`} />
            <KpiCard label="Valor Glosado" value={fmtCurrency(kpis.totalGlosa)} icon={AlertTriangle} color="#ef5350" sub={`${kpis.totalGlosados.toLocaleString("pt-BR")} itens glosados`} />
            <KpiCard label="Taxa de Glosa" value={`${kpis.taxaGlosa}%`} icon={TrendingDown} color="#ffb74d" sub={`Recuperado: ${fmtCurrency(kpis.totalRecuperado)}`} />
          </div>
        ) : null}

        {/* BARRA DE RESUMO */}
        {kpis && (
          <div className="flex flex-wrap gap-3 mb-6 text-xs" style={{ color: "#6b8cae" }}>
            <span style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", padding: "4px 12px", borderRadius: 20 }}>
              {kpis.totalItens.toLocaleString("pt-BR")} itens analisados
            </span>
            <span style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", padding: "4px 12px", borderRadius: 20 }}>
              Período: {periodoLabel}
            </span>
            {kpis.totalEmRecurso > 0 && (
              <span style={{ background: "#0d2a1a", border: "1px solid #1a5c2a", color: "#4caf50", padding: "4px 12px", borderRadius: 20 }}>
                Em Recurso: {fmtCurrency(kpis.totalEmRecurso)}
              </span>
            )}
            {kpis.totalRecuperado > 0 && (
              <span style={{ background: "#1a2a0d", border: "1px solid #3a5c1a", color: "#8bc34a", padding: "4px 12px", borderRadius: 20 }}>
                A Receber: {fmtCurrency(kpis.totalRecuperado)}
              </span>
            )}
          </div>
        )}

        {/* GRÁFICO EVOLUÇÃO MENSAL */}
        <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} style={{ color: "#4fc3f7" }} />
            <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#6b8cae" }}>
              EVOLUÇÃO MENSAL: FATURADO × GLOSADO
            </span>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#6b8cae", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fill: "#6b8cae", fontSize: 11 }} axisLine={false} tickLine={false} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: "#6b8cae", fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="Cobrado" fill="#4fc3f7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Glosado" fill="#ef5350" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Pago" fill="#4caf50" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40" style={{ color: "#6b8cae" }}>
              Sem dados de evolução mensal
            </div>
          )}
        </div>

        {/* TOP MOTIVOS DE GLOSA */}
        <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span style={{ color: "#ef5350" }}>🔴</span>
            <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#6b8cae" }}>
              TOP MOTIVOS DE GLOSA
            </span>
          </div>
          {topMotivosComPareto.length > 0 ? (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                    <th style={{ color: "#6b8cae", textAlign: "left", padding: "8px 12px", fontWeight: 500 }}>Motivo</th>
                    <th style={{ color: "#6b8cae", textAlign: "right", padding: "8px 12px", fontWeight: 500 }}>Vl Glosa</th>
                    <th style={{ color: "#6b8cae", textAlign: "right", padding: "8px 12px", fontWeight: 500 }}>%</th>
                    <th style={{ color: "#6b8cae", textAlign: "right", padding: "8px 12px", fontWeight: 500 }}>Pareto</th>
                  </tr>
                </thead>
                <tbody>
                  {topMotivosComPareto.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #0d2a3a" }} className="hover:bg-[#0d2a3a] transition-colors">
                      <td style={{ color: "#e8f4fd", padding: "10px 12px" }}>
                        <span style={{ color: "#4fc3f7", marginRight: 8, fontSize: 11 }}>{r.codigoGlosa}</span>
                        {r.descricao.length > 60 ? r.descricao.substring(0, 60) + "…" : r.descricao}
                      </td>
                      <td style={{ color: "#ef5350", textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>
                        {fmtCurrency(r.totalGlosa)}
                      </td>
                      <td style={{ color: "#ffb74d", textAlign: "right", padding: "10px 12px" }}>
                        {r.pct.toFixed(2)}%
                      </td>
                      <td style={{ color: "#6b8cae", textAlign: "right", padding: "10px 12px" }}>
                        {r.pareto.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-20" style={{ color: "#6b8cae" }}>
              Sem dados de motivos de glosa
            </div>
          )}
        </div>

        {/* COMPARATIVO IA (loading) */}
        {comparativoLoading && (
          <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-8 mb-6 flex items-center justify-center gap-3">
            <Loader2 size={20} style={{ color: "#4fc3f7" }} className="animate-spin" />
            <span style={{ color: "#6b8cae" }}>Analisando com Inteligência Artificial...</span>
          </div>
        )}

        {/* COMPARATIVO IA (resultado) */}
        {comparativoResult && !comparativoLoading && (
          <ComparativoIASection result={comparativoResult} />
        )}

      </div>

      {/* MODAL COMPARAR MESES */}
      <Dialog open={showComparar} onOpenChange={setShowComparar}>
        <DialogContent style={{ background: "#0d1b2a", border: "1px solid #1e3a5f", color: "#e8f4fd" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#4fc3f7" }}>Comparar Meses</DialogTitle>
            <DialogDescription style={{ color: "#6b8cae" }}>
              Selecione dois períodos para análise comparativa com Inteligência Artificial
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#6b8cae" }}>Período 1</label>
              <Select value={comp1 || ""} onValueChange={setComp1}>
                <SelectTrigger style={{ background: "#060f1a", border: "1px solid #1e3a5f", color: "#e8f4fd" }}>
                  <SelectValue placeholder="Selecione o período 1" />
                </SelectTrigger>
                <SelectContent style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }}>
                  {filtros?.competencias.map((c) => (
                    <SelectItem key={c} value={c} style={{ color: "#e8f4fd" }}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#6b8cae" }}>Período 2</label>
              <Select value={comp2 || ""} onValueChange={setComp2}>
                <SelectTrigger style={{ background: "#060f1a", border: "1px solid #1e3a5f", color: "#e8f4fd" }}>
                  <SelectValue placeholder="Selecione o período 2" />
                </SelectTrigger>
                <SelectContent style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }}>
                  {filtros?.competencias.map((c) => (
                    <SelectItem key={c} value={c} style={{ color: "#e8f4fd" }}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              style={{ background: "#1a3a5c", color: "#4fc3f7", border: "1px solid #1e3a5f" }}
              onClick={() => { setShowComparar(false); handleComparar(); }}
              disabled={!comp1 || !comp2}>
              <Sparkles size={14} className="mr-2" /> Gerar Análise Comparativa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ComparativoIASection({ result }: { result: any }) {
  const { analise, periodo1, periodo2, variacoes } = result;
  const fmtC = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const cards = [
    { title: "Visão Geral", content: analise.visaoGeral },
    { title: "Análise das Variações", content: analise.analiseVariacoes },
    { title: "Comparativo de Motivos", content: analise.comparativoMotivos },
    { title: "Comparativo de Convênios", content: analise.comparativoConvenios },
    { title: "Diagnóstico", content: analise.diagnostico },
    { title: "Recomendações", content: analise.recomendacoes },
  ];

  return (
    <div style={{ background: "#0d1b2a", border: "1px solid #1e3a5f" }} className="rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={16} style={{ color: "#4caf50" }} />
        <span className="text-sm font-semibold" style={{ color: "#e8f4fd" }}>
          Análise Comparativa por Inteligência Artificial
        </span>
        <span className="text-xs ml-2" style={{ color: "#6b8cae" }}>
          {periodo1.competencia} × {periodo2.competencia}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Variação Faturado", value: variacoes.faturado, isValue: true },
          { label: "Variação Glosado", value: variacoes.glosa, isValue: true },
          { label: "Variação Taxa", value: variacoes.taxa, isValue: false },
        ].map((item) => (
          <div key={item.label} style={{ background: "#060f1a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "12px 16px" }}>
            <div className="text-xs mb-1" style={{ color: "#6b8cae" }}>{item.label}</div>
            <div className="text-base font-bold" style={{ color: item.value >= 0 ? "#ef5350" : "#4caf50" }}>
              {item.value >= 0 ? "+" : ""}
              {item.isValue ? fmtC(Math.abs(item.value)) : `${Math.abs(item.value).toFixed(2)} p.p.`}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {cards.map((card) => (
          <div key={card.title} style={{ background: "#060f1a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "16px" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: "#e8f4fd" }}>{card.title}</div>
            <div className="text-sm leading-relaxed" style={{ color: "#8aaccc" }}>{card.content}</div>
          </div>
        ))}
      </div>

      {analise.acoesPrioritarias?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: "#ef5350" }}>🎯</span>
            <span className="text-sm font-semibold" style={{ color: "#e8f4fd" }}>Ações Prioritárias</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                {["Área", "Situação", "Ação", "Impacto Estimado"].map((h) => (
                  <th key={h} style={{ color: "#6b8cae", textAlign: h === "Impacto Estimado" ? "right" : "left", padding: "8px 12px", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analise.acoesPrioritarias.map((a: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #0d2a3a" }}>
                  <td style={{ padding: "10px 12px", color: "#4fc3f7", fontWeight: 600 }}>{a.area}</td>
                  <td style={{ padding: "10px 12px", color: "#8aaccc" }}>{a.situacao}</td>
                  <td style={{ padding: "10px 12px", color: "#e8f4fd" }}>{a.acao}</td>
                  <td style={{ padding: "10px 12px", color: "#4caf50", textAlign: "right", fontWeight: 600 }}>
                    {fmtC(a.impactoEstimado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
