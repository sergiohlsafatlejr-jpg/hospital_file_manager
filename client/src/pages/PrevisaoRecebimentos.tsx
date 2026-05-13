import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return formatCurrency(v);
};

const formatMesLabel = (mes: string) => {
  if (!mes || typeof mes !== 'string') return String(mes);
  
  // Formato ideal: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1] || m}/${y}`;
  }
  
  // Qualquer outro formato com 7 chars que tenha traço/barra no meio
  const parts = mes.split(/[-\/]/);
  if (parts.length >= 2) {
    const mStr = parts[1];
    const mNum = parseInt(mStr);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      const y = parts[0].length === 4 ? parts[0] : parts.length > 2 ? parts[2] : parts[0];
      return `${meses[mNum - 1]}/${y}`;
    }
  }
  
  return mes;
};

const CHART_COLORS = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#be123c"
];

export default function PrevisaoRecebimentos() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [selectedConvenios, setSelectedConvenios] = useState<string[]>([]);
  const [searchConvenio, setSearchConvenio] = useState("");
  const [selectedMes, setSelectedMes] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = trpc.tasy.getPrevisaoRecebimentos.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0, staleTime: 60_000 }
  );

  // Lista de convênios disponíveis
  const conveniosList = useMemo(() => {
    if (!data?.porConvenio) return [];
    return data.porConvenio.map((c: any) => c.convenio);
  }, [data]);

  // Filtra convênios pela busca
  const filteredConvenios = useMemo(() => {
    if (!searchConvenio) return conveniosList;
    const term = searchConvenio.toLowerCase();
    return conveniosList.filter((c: string) => c.toLowerCase().includes(term));
  }, [conveniosList, searchConvenio]);

  // Gráfico de competência (não filtrado)
  const chartReferencia = useMemo(() => {
    if (!data?.porMesReferencia) return [];
    return data.porMesReferencia.map((m: any) => ({
      name: formatMesLabel(m.mes),
      Faturado: m.valor,
      Protocolos: m.qtd,
    }));
  }, [data]);

  // Gráfico de projeção FILTRADO por convênios selecionados
  const chartVencimento = useMemo(() => {
    if (!data) return [];

    // Se nenhum filtro selecionado, mostra tudo (dados agregados)
    if (selectedConvenios.length === 0) {
      return (data.porMesVencimento || []).map((m: any) => ({
        name: formatMesLabel(m.mes),
        Projetado: m.valor,
        Qtd: m.qtd,
      }));
    }

    // Filtrar usando os dados cruzados mês×convênio
    const vencConv = data.vencimentoPorConvenio || [];
    const filtered = vencConv.filter((v: any) => selectedConvenios.includes(v.convenio));

    // Reagrupar por mês
    const mapMes = new Map<string, { valor: number; qtd: number }>();
    for (const item of filtered) {
      if (!mapMes.has(item.mes)) mapMes.set(item.mes, { valor: 0, qtd: 0 });
      const m = mapMes.get(item.mes)!;
      m.valor += item.valor;
      m.qtd += item.qtd;
    }

    return Array.from(mapMes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({
        name: formatMesLabel(mes),
        Projetado: v.valor,
        Qtd: v.qtd,
      }));
  }, [data, selectedConvenios]);

  // Tabela de convênios filtrada
  const tabelaConvenios = useMemo(() => {
    if (!data?.porConvenio) return [];
    if (selectedConvenios.length === 0) return data.porConvenio;
    return data.porConvenio.filter((c: any) => selectedConvenios.includes(c.convenio));
  }, [data, selectedConvenios]);

  // Resumo recalculado com filtro
  const resumoFiltrado = useMemo(() => {
    if (!data?.resumo) return { totalFaturado: 0, totalProjetado: 0, totalSemVencimento: 0, qtdProtocolos: 0 };
    if (selectedConvenios.length === 0) return data.resumo;
    const filtrados = data.porConvenio.filter((c: any) => selectedConvenios.includes(c.convenio));
    const totalFaturado = filtrados.reduce((acc: number, c: any) => acc + c.valorRef, 0);
    const totalProjetado = filtrados.reduce((acc: number, c: any) => acc + c.valorProj, 0);
    return {
      totalFaturado,
      totalProjetado,
      totalSemVencimento: totalFaturado - totalProjetado,
      qtdProtocolos: filtrados.reduce((acc: number, c: any) => acc + c.qtd, 0),
    };
  }, [data, selectedConvenios]);

  const toggleConvenio = (convenio: string) => {
    setSelectedConvenios(prev =>
      prev.includes(convenio) ? prev.filter(c => c !== convenio) : [...prev, convenio]
    );
  };

  const selectAll = () => setSelectedConvenios([...conveniosList]);
  const clearAll = () => setSelectedConvenios([]);

  if (estabelecimentoId <= 0) {
    return (
      <DashboardLayout>
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          <h2>Selecione um estabelecimento para visualizar a Previsão de Recebimentos</h2>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", margin: 0 }}>
            📊 Previsão de Recebimentos
          </h1>
          <p style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
            Projeção financeira baseada nos protocolos de {estabelecimentoAtual?.nome || "—"}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
            fontSize: 14, fontWeight: 500, color: "#475569", cursor: (isRefetching || isLoading) ? "not-allowed" : "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}
        >
          <span style={{ fontSize: 16 }}>{isRefetching ? "⏳" : "🔄"}</span>
          {isRefetching ? "Atualizando..." : "Atualizar Dados"}
        </button>
      </div>

      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          Carregando dados...
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 16, color: "#dc2626" }}>
          Erro ao carregar dados: {error.message}
        </div>
      )}

      <Tabs defaultValue="previsao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="previsao">Visão Consolidada (Previsão / Controle Título)</TabsTrigger>
          <TabsTrigger value="pagamentos">Controle de Pagamentos (Recepção de Arquivos)</TabsTrigger>
        </TabsList>
        <TabsContent value="previsao" className="space-y-4">
        {data && (
          <>
            {/* Cards Resumo */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <SummaryCard title="Total Faturado" value={formatCurrency(resumoFiltrado.totalFaturado || 0)} subtitle={`${resumoFiltrado.qtdProtocolos || 0} protocolos`} color="#2563eb" />
              <SummaryCard title="Projeção c/ Vencimento" value={formatCurrency(resumoFiltrado.totalProjetado || 0)} subtitle="Com título vinculado" color="#059669" />
              <SummaryCard title="Sem Vencimento" value={formatCurrency(resumoFiltrado.totalSemVencimento || 0)} subtitle="Sem título atrelado" color="#d97706" />
              <SummaryCard
                title="% Cobertura"
                value={resumoFiltrado.totalFaturado > 0 ? `${((resumoFiltrado.totalProjetado / resumoFiltrado.totalFaturado) * 100).toFixed(1)}%` : "0%"}
                subtitle="Protocolos com projeção"
                color="#7c3aed"
              />
            </div>
            {/* Filtro de Convênios */}
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, marginBottom: 24
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: 0 }}>
                  🔍 Filtrar por Convênio
                  {selectedConvenios.length > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#2563eb", marginLeft: 8 }}>
                      ({selectedConvenios.length} selecionado{selectedConvenios.length > 1 ? 's' : ''})
                    </span>
                  )}
                </h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selectAll} style={{
                    padding: "4px 12px", borderRadius: 6, border: "1px solid #e2e8f0",
                    background: "#f8fafc", fontSize: 12, cursor: "pointer", color: "#475569"
                  }}>Todos</button>
                  <button onClick={clearAll} style={{
                    padding: "4px 12px", borderRadius: 6, border: "1px solid #e2e8f0",
                    background: selectedConvenios.length > 0 ? "#fef2f2" : "#f8fafc",
                    fontSize: 12, cursor: "pointer",
                    color: selectedConvenios.length > 0 ? "#dc2626" : "#475569"
                  }}>Limpar</button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Pesquisar convênio..."
                value={searchConvenio}
                onChange={e => setSearchConvenio(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0",
                  marginBottom: 10, fontSize: 13, outline: "none",
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 180, overflowY: "auto", padding: "4px 0" }}>
                {filteredConvenios.map((c: string, i: number) => {
                  const isSelected = selectedConvenios.includes(c);
                  const convObj = data.porConvenio.find((p: any) => p.convenio === c);
                  const tagColor = CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <button
                      key={c}
                      onClick={() => toggleConvenio(c)}
                      title={`Clique para ${isSelected ? 'remover' : 'filtrar por'} ${c}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                        border: isSelected ? `2px solid ${tagColor}` : "1px solid #d1d5db",
                        background: isSelected ? `${tagColor}18` : "#ffffff",
                        color: isSelected ? tagColor : "#374151",
                        fontWeight: isSelected ? 600 : 500,
                        transition: "all 0.2s ease",
                        boxShadow: isSelected ? `0 0 0 1px ${tagColor}40` : "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                        background: isSelected ? tagColor : "#fff",
                        border: isSelected ? `2px solid ${tagColor}` : "2px solid #d1d5db",
                        transition: "all 0.15s ease",
                        flexShrink: 0,
                      }}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      <span style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: tagColor, flexShrink: 0,
                        border: "1px solid rgba(255,255,255,0.5)",
                        boxShadow: `0 0 3px ${tagColor}40`,
                      }} />
                      {c}
                      <span style={{ fontSize: 10, color: isSelected ? tagColor : "#9ca3af", fontWeight: 400 }}>
                        ({convObj ? formatCompact(convObj.valorProj) : '—'})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>
                💰 Faturado por Competência (DT_MESANO_REFERENCIA)
              </h2>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chartReferencia} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                  <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} labelStyle={{ fontWeight: 600 }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Legend />
                  <Bar dataKey="Faturado" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", margin: 0 }}>
                  📈 Projeção de Recebimento (VENC_TITULO)
                </h2>
                {selectedConvenios.length > 0 && (
                  <span style={{
                    padding: "4px 12px", borderRadius: 20, background: "#eff6ff",
                    color: "#2563eb", fontSize: 12, fontWeight: 600,
                  }}>
                    Filtrado: {selectedConvenios.length} convênio{selectedConvenios.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {chartVencimento.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={chartVencimento} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    onClick={(e: any) => {
                      if (e?.activeLabel) {
                        const mesRaw = e.activeLabel;
                        setSelectedMes(prev => prev === mesRaw ? null : mesRaw);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                    <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelStyle={{ fontWeight: 600 }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Bar dataKey="Projetado" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
                  Nenhum dado de projeção para os convênios selecionados.
                </div>
              )}
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>💡 Clique em uma barra para ver o detalhamento por convênio do mês</p>
            </div>

            {selectedMes && (() => {
              const vencConv = data.vencimentoPorConvenio || [];
              const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
              let mesOriginal = "";
              for (const item of data.porMesVencimento || []) {
                if (formatMesLabel(item.mes) === selectedMes) {
                  mesOriginal = item.mes;
                  break;
                }
              }
              const detalhes = vencConv
                .filter((v: any) => v.mes === mesOriginal)
                .sort((a: any, b: any) => b.valor - a.valor);
              const totalMes = detalhes.reduce((acc: number, d: any) => acc + d.valor, 0);

              return (
                <div style={{
                  background: "#fff", borderRadius: 12, border: "2px solid #059669",
                  padding: 24, marginBottom: 24, animation: "fadeIn 0.3s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: "#059669", margin: 0 }}>
                      📅 Detalhamento: {selectedMes}
                      <span style={{ fontSize: 14, fontWeight: 400, color: "#64748b", marginLeft: 8 }}>
                        Total: {formatCurrency(totalMes)} — {detalhes.length} convênio{detalhes.length > 1 ? 's' : ''}
                      </span>
                    </h2>
                    <button onClick={() => setSelectedMes(null)} style={{
                      padding: "6px 16px", borderRadius: 8, border: "1px solid #e2e8f0",
                      background: "#f8fafc", fontSize: 12, cursor: "pointer", color: "#64748b",
                    }}>✕ Fechar</button>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                          <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#475569" }}>Convênio</th>
                          <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: "#475569" }}>Valor Projetado</th>
                          <th style={{ textAlign: "center", padding: "10px 16px", fontWeight: 600, color: "#475569" }}>Protocolos</th>
                          <th style={{ textAlign: "right", padding: "10px 16px", fontWeight: 600, color: "#475569" }}>% do Mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhes.map((d: any, idx: number) => {
                          const pct = totalMes > 0 ? ((d.valor / totalMes) * 100) : 0;
                          return (
                            <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#f0fdf4" : "#fff" }}>
                              <td style={{ padding: "10px 16px", fontWeight: 500, color: "#1e293b" }}>{d.convenio}</td>
                              <td style={{ padding: "10px 16px", textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatCurrency(d.valor)}</td>
                              <td style={{ padding: "10px 16px", textAlign: "center", color: "#64748b" }}>{d.qtd}</td>
                              <td style={{ padding: "10px 16px", textAlign: "right" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                                  <div style={{ width: 60, height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 3, background: "#059669" }} />
                                  </div>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>
                🏥 Detalhamento por Convênio
                {selectedConvenios.length > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b", marginLeft: 8 }}>
                    (filtrado)
                  </span>
                )}
              </h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Convênio</th>
                      <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Valor Faturado</th>
                      <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Projeção Recebimento</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Protocolos</th>
                      <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Sem Vencimento</th>
                      <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabelaConvenios.map((c: any, i: number) => {
                      const semVenc = c.valorRef - c.valorProj;
                      const cobertura = c.valorRef > 0 ? ((c.valorProj / c.valorRef) * 100) : 0;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fafbfc" : "#fff" }}>
                          <td style={{ padding: "10px 16px", fontWeight: 500, color: "#1e293b" }}>{c.convenio}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#2563eb", fontWeight: 600 }}>{formatCurrency(c.valorRef)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatCurrency(c.valorProj)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "center", color: "#64748b" }}>{c.qtd}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", color: semVenc > 0 ? "#d97706" : "#94a3b8" }}>{formatCurrency(semVenc)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                              background: cobertura >= 80 ? "#dcfce7" : cobertura >= 40 ? "#fef9c3" : "#fee2e2",
                              color: cobertura >= 80 ? "#166534" : cobertura >= 40 ? "#854d0e" : "#991b1b",
                            }}>
                              {cobertura.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        </TabsContent>
        <TabsContent value="pagamentos" className="space-y-4">
           <PagamentosTab />
        </TabsContent>
      </Tabs>
    </div>
    </DashboardLayout>
  );
}

function PagamentosTab() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  
  const { data, isLoading, error, refetch, isRefetching } = trpc.tasy.getPagamentosBi.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0, staleTime: 60_000 }
  );

  const [selectedMes, setSelectedMes] = useState<string>("TUDO");
  
  const months = useMemo(() => {
    if (!data?.porMes) return [];
    return data.porMes.map((m: any) => m.mes).sort((a: any, b: any) => b.localeCompare(a));
  }, [data]);

  const tabelaFiltrada = useMemo(() => {
     if (!data) return [];
     if (selectedMes === "TUDO") {
       return data.porConvenio;
     }
     return data.pagamentosPorConvenio.filter((p: any) => p.mes === selectedMes);
  }, [data, selectedMes]);

  const resumoFiltrado = useMemo(() => {
     if (!data) return { recebido: 0, vinculado: 0, a_vincular: 0 };
     if (selectedMes === "TUDO") {
       return {
         recebido: data.resumo.totalRecebido || 0,
         vinculado: data.resumo.totalVinculado || 0,
         a_vincular: data.resumo.totalAVincular || 0,
       };
     }
     const m = data.porMes.find((x: any) => x.mes === selectedMes);
     return m || { recebido: 0, vinculado: 0, a_vincular: 0 };
  }, [data, selectedMes]);

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>Carregando dados de pagamentos...</div>
  }

  if (error) {
    return <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 16, color: "#dc2626" }}>Erro: {error.message}</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
       <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
         <div>
           <h2 className="text-lg font-semibold text-slate-800">Controle de Baixas e Arquivos de Retorno</h2>
           <p className="text-sm text-slate-500">Compare os créditos em conta com as conciliações sistêmicas para identificar Pendências a Vincular.</p>
         </div>
         <div className="flex gap-2 items-center">
            <button
              onClick={() => refetch()}
              disabled={isRefetching || isLoading}
              className="mr-2 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-base">{isRefetching ? "⏳" : "🔄"}</span>
              {isRefetching ? "Atualizando..." : "Atualizar"}
            </button>
            <span className="text-sm font-medium text-slate-500">Filtrar Competência:</span>
            <select
              value={selectedMes}
              onChange={e => setSelectedMes(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm outline-none w-[160px] bg-white text-slate-800 font-medium"
            >
              <option value="TUDO">Todo o Período</option>
              {months.map((m: string) => (
                <option key={m} value={m}>{formatMesLabel(m)}</option>
              ))}
            </select>
         </div>
       </div>
       
       <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <SummaryCard title="Recebido Banco (Depósito)" value={formatCurrency(resumoFiltrado.recebido || 0)} subtitle="Valor mapeado na importação" color="#2563eb" />
          <SummaryCard title="Vinculado TASY (Baixado)" value={formatCurrency(resumoFiltrado.vinculado || 0)} subtitle="Sincronizado na fatura" color="#059669" />
          <SummaryCard title="A Vincular (Pendente)" value={formatCurrency(resumoFiltrado.a_vincular || 0)} subtitle="Diferença pendente de ajuste" color="#dc2626" />
       </div>

       <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>
            🏥 Performance de Integração Bancária por Convênio
            {selectedMes !== "TUDO" && (
              <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b", marginLeft: 8 }}>
                (filtrado para {formatMesLabel(selectedMes)})
              </span>
            )}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Estabelecimento</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Convênio</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Depósito Banco (R$)</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>Baixado Sistema (R$)</th>
                  <th style={{ textAlign: "center", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>% Baixado</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 600, color: "#475569" }}>A Vincular (R$)</th>
                </tr>
              </thead>
              <tbody>
                {tabelaFiltrada.map((c: any, i: number) => {
                  const perc = c.recebido > 0 ? (c.vinculado / c.recebido) * 100 : 0;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fafbfc" : "#fff" }}>
                      <td style={{ padding: "10px 16px", fontWeight: 500, color: "#64748b", fontSize: 13 }}>{c.estabelecimento || '—'}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 500, color: "#1e293b" }}>{c.convenio}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#2563eb", fontWeight: 600 }}>{formatCurrency(c.recebido)}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatCurrency(c.vinculado)}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                          background: perc >= 95 ? "#dcfce7" : perc >= 80 ? "#fef9c3" : "#fee2e2",
                          color: perc >= 95 ? "#166534" : perc >= 80 ? "#854d0e" : "#991b1b",
                        }}>
                          {perc.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: c.a_vincular > 0 ? "#dc2626" : "#64748b" }}>{formatCurrency(c.a_vincular)}</td>
                    </tr>
                  )
                })}
              </tbody>
             </table>
          </div>
       </div>
    </div>
  )
}

function SummaryCard({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
      padding: "20px 24px", borderTop: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}
