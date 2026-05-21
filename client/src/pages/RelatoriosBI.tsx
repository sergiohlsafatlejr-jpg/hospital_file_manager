import React, { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileSpreadsheet, BarChart3, TrendingDown, AlertTriangle, Target, Printer, ArrowLeftRight, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";

const COLORS = ["#f43f5e","#8b5cf6","#3b82f6","#06b6d4","#10b981","#f59e0b","#ec4899","#6366f1","#14b8a6","#ef4444",
  "#a855f7","#0ea5e9","#22c55e","#eab308","#d946ef","#818cf8","#2dd4bf","#fb923c","#e879f9","#38bdf8"];

function fmtCur(v: number): string {
  if (!v || isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number): string {
  if (!v || isNaN(v)) return "0,00%";
  return `${v.toFixed(2)}%`;
}
function fmtNum(v: number): string {
  return v?.toLocaleString("pt-BR") || "0";
}

export default function RelatoriosBI() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const nomeEstabelecimento = estabelecimentoAtual?.nome || "Selecione um estabelecimento";
  const [competencia, setCompetencia] = useState<string>("todas");
  const [convenio, setConvenio] = useState<string>("todos");
  const reportRef = useRef<HTMLDivElement>(null);

  // ═══ COMPARAÇÃO DE MESES ═══
  const [modoComparativo, setModoComparativo] = useState(false);
  const [mesA, setMesA] = useState<string>("");
  const [mesB, setMesB] = useState<string>("");
  const [analiseComparativa, setAnaliseComparativa] = useState<any>(null);
  const [loadingComparacao, setLoadingComparacao] = useState(false);

  const { data, isLoading } = trpc.tasy.gerarRelatorioGlosas.useQuery({
    estabelecimentoId,
    competencia: competencia !== "todas" ? competencia : undefined,
    convenio: convenio !== "todos" ? convenio : undefined,
  }, { refetchOnWindowFocus: false, enabled: estabelecimentoId > 0 });

  const resumo = data?.resumo;
  const fonte = (data as any)?.fonte || 'nenhuma';

  // Queries para comparação de meses
  const { data: dadosMesA } = trpc.tasy.gerarRelatorioGlosas.useQuery({
    estabelecimentoId, competencia: mesA || undefined,
    convenio: convenio !== "todos" ? convenio : undefined,
  }, { refetchOnWindowFocus: false, enabled: estabelecimentoId > 0 && !!mesA && modoComparativo });

  const { data: dadosMesB } = trpc.tasy.gerarRelatorioGlosas.useQuery({
    estabelecimentoId, competencia: mesB || undefined,
    convenio: convenio !== "todos" ? convenio : undefined,
  }, { refetchOnWindowFocus: false, enabled: estabelecimentoId > 0 && !!mesB && modoComparativo });

  const gerarComparativaMut = trpc.tasy.gerarAnaliseComparativaIA.useMutation();

  // Pareto acumulado para motivos
  const motivosComPareto = useMemo(() => {
    if (!data?.porMotivo) return [];
    let acc = 0;
    return data.porMotivo.map((m: any) => {
      acc += m.participacao;
      return { ...m, paretoAcum: acc };
    });
  }, [data?.porMotivo]);

  // Handler para gerar análise comparativa
  const handleCompararMeses = async () => {
    if (!mesA || !mesB || !dadosMesA?.resumo || !dadosMesB?.resumo) {
      toast.error('Selecione dois meses com dados disponíveis');
      return;
    }
    setLoadingComparacao(true);
    toast.info('🤖 Gerando análise comparativa com IA... aguarde ~15s');
    try {
      const res = await gerarComparativaMut.mutateAsync({
        nomeEstabelecimento,
        mesA: {
          competencia: mesA,
          vlCobrado: dadosMesA.resumo.vlCobrado, vlPago: dadosMesA.resumo.vlPago,
          vlGlosa: dadosMesA.resumo.vlGlosa, pctGlosa: dadosMesA.resumo.pctGlosa,
          linhas: dadosMesA.resumo.linhas, conveniosDistintos: dadosMesA.resumo.conveniosDistintos,
          topMotivos: dadosMesA.porMotivo?.slice(0, 5),
          topConvenios: dadosMesA.porConvenio?.slice(0, 5),
          topItens: dadosMesA.porItem?.slice(0, 5),
        },
        mesB: {
          competencia: mesB,
          vlCobrado: dadosMesB.resumo.vlCobrado, vlPago: dadosMesB.resumo.vlPago,
          vlGlosa: dadosMesB.resumo.vlGlosa, pctGlosa: dadosMesB.resumo.pctGlosa,
          linhas: dadosMesB.resumo.linhas, conveniosDistintos: dadosMesB.resumo.conveniosDistintos,
          topMotivos: dadosMesB.porMotivo?.slice(0, 5),
          topConvenios: dadosMesB.porConvenio?.slice(0, 5),
          topItens: dadosMesB.porItem?.slice(0, 5),
        },
      });
      setAnaliseComparativa(res.analise);
      toast.success('✅ Análise comparativa gerada!');
    } catch {
      toast.error('Falha ao gerar análise comparativa');
    } finally {
      setLoadingComparacao(false);
    }
  };

  // Helper para variação
  const varDelta = (a: number, b: number) => {
    const d = b - a;
    const pct = a > 0 ? (d / a) * 100 : 0;
    return { delta: d, pct };
  };

  // Export Excel
  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    // Resumo
    const wsResumo = XLSX.utils.json_to_sheet([{
      "Linhas Analisadas": resumo?.linhas, "Convênios Distintos": resumo?.conveniosDistintos,
      "Valor Cobrado": resumo?.vlCobrado, "Valor Pago": resumo?.vlPago,
      "Valor Glosado": resumo?.vlGlosa, "% Glosa": resumo?.pctGlosa,
      "Valor A Receber": resumo?.vlAReceber, "Competência Inicial": resumo?.compIni,
      "Competência Final": resumo?.compFim,
    }]);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Geral");
    // Motivos
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porMotivo.map((m: any) => ({
      Motivo: m.motivo, "Vl Glosa": m.vlGlosa, "Vl Cobrado": m.vlCobrado,
      "% Glosa": m.pctGlosa, "Participação %": m.participacao, Qtd: m.qtd,
    }))), "Por Motivo");
    // Convênios
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porConvenio.map((c: any) => ({
      Convênio: c.convenio, "Vl Glosa": c.vlGlosa, "Vl Cobrado": c.vlCobrado,
      "Vl Pago": c.vlPago, "% Glosa": c.pctGlosa, "Qtd Glosados": c.qtdGlosados, Qtd: c.qtd,
    }))), "Por Convênio");
    // Setores
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porSetor.map((s: any) => ({
      Setor: s.setor, "Vl Glosa": s.vlGlosa, "Vl Cobrado": s.vlCobrado, "% Glosa": s.pctGlosa, Qtd: s.qtd,
    }))), "Por Setor");
    // Itens
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porItem.map((i: any) => ({
      Descrição: i.descricao, Código: i.codigo, "Motivo Glosa": i.motivo || 'N/I', "Vl Glosa": i.vlGlosa, "Vl Cobrado": i.vlCobrado, Qtd: i.qtd,
    }))), "Por Item");
    // Evolução Mensal
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.evolucaoMensal.map((e: any) => ({
      Competência: e.comp, "Vl Cobrado": e.vlCobrado, "Vl Pago": e.vlPago,
      "Vl Glosa": e.vlGlosa, "% Glosa": e.pctGlosa, Qtd: e.qtd,
    }))), "Evolução Mensal");
    // Oportunidades
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.oportunidades.map((o: any) => ({
      Motivo: o.motivo, Convênio: o.convenio, "Vl Glosa": o.vlGlosa,
      "Vl Cobrado": o.vlCobrado, "% Glosa": o.pctGlosa, Qtd: o.qtd,
    }))), "Oportunidades");
    XLSX.writeFile(wb, `Relatorio_Glosas_${competencia === "todas" ? "GERAL" : competencia}.xlsx`);
    toast.success("Relatório Excel exportado com sucesso!");
  };

  // ═══ AI-Powered PDF Export ═══
  const gerarAnaliseIAMut = trpc.tasy.gerarAnaliseIA.useMutation();

  const handleExportPDF = async () => {
    if (!data || !resumo) return;
    toast.info('🤖 Gerando análise com IA... aguarde ~15s');

    // 1) Chamar IA para gerar textos analíticos
    let ia: any = null;
    try {
      const res = await gerarAnaliseIAMut.mutateAsync({
        nomeEstabelecimento,
        resumo: { vlCobrado: resumo.vlCobrado, vlPago: resumo.vlPago, vlGlosa: resumo.vlGlosa, pctGlosa: resumo.pctGlosa, linhas: resumo.linhas, conveniosDistintos: resumo.conveniosDistintos, compIni: resumo.compIni, compFim: resumo.compFim },
        topMotivos: data.porMotivo?.slice(0, 10),
        topConvenios: data.porConvenio?.slice(0, 8),
        topItens: data.porItem?.slice(0, 8),
        evolucao: data.evolucaoMensal?.slice(-6),
      });
      ia = res.analise;
    } catch { ia = null; }
    if (!ia) { toast.error('Falha na IA, gerando relatório básico.'); }

    // 2) Montar PDF profissional
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const hdr = (title: string) => { doc.setFillColor(13,27,62); doc.rect(0,0,W,18,'F'); doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.text(title, 14, 12); doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.text(`${nomeEstabelecimento} | ${new Date().toLocaleDateString('pt-BR')}`, W-14, 12, {align:'right'}); doc.setTextColor(0,0,0); };
    const addBlock = (text: string, startY: number, maxW: number = W - 28) => { doc.setFontSize(9); doc.setFont('helvetica','normal'); const lines = doc.splitTextToSize(text, maxW); doc.text(lines, 14, startY); return startY + lines.length * 4.2; };
    const sectionTitle = (text: string, y: number) => { doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(59,130,246); doc.text(text, 14, y); doc.setTextColor(0,0,0); return y + 6; };

    // ═══ PAGE 1: CAPA ═══
    doc.setFillColor(13,27,62); doc.rect(0,0,W,H,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(28); doc.setFont('helvetica','bold');
    doc.text('RELATÓRIO DE ANÁLISE', W/2, 55, {align:'center'});
    doc.text('DE GLOSAS', W/2, 68, {align:'center'});
    doc.setFontSize(10); doc.setDrawColor(59,130,246); doc.setLineWidth(0.8); doc.line(W/2-60,78,W/2+60,78);
    doc.setFontSize(16); doc.setFont('helvetica','normal'); doc.setTextColor(136,153,187);
    doc.text(nomeEstabelecimento, W/2, 90, {align:'center'});
    doc.setFontSize(12);
    doc.text(`Período: ${resumo.compIni||'N/A'} a ${resumo.compFim||'N/A'}`, W/2, 100, {align:'center'});
    doc.setFontSize(10); doc.setTextColor(100,120,160);
    doc.text(`Plano de Redução de Falhas e Recuperação de Receita`, W/2, 112, {align:'center'});
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, W/2, 122, {align:'center'});
    // badge IA
    if (ia) { doc.setFontSize(8); doc.setTextColor(16,185,129); doc.text('✦ Análise gerada por Inteligência Artificial', W/2, 140, {align:'center'}); }

    // ═══ PAGE 2: SUMÁRIO EXECUTIVO + KPIs ═══
    doc.addPage(); hdr('1. SUMÁRIO EXECUTIVO');
    let y = 26;
    // KPI boxes
    const kpis = [
      { label: 'VALOR COBRADO', value: fmtCur(resumo.vlCobrado), color: [59,130,246] },
      { label: 'VALOR PAGO', value: fmtCur(resumo.vlPago), color: [16,185,129] },
      { label: 'VALOR GLOSADO', value: fmtCur(resumo.vlGlosa), color: [244,63,94] },
      { label: 'TAXA DE GLOSA', value: fmtPct(resumo.pctGlosa), color: [245,158,11] },
      { label: 'A RECEBER', value: fmtCur(resumo.vlAReceber || 0), color: [139,92,246] },
    ];
    kpis.forEach((k, i) => {
      const x = 14 + i * 55;
      doc.setFillColor(240,242,248); doc.roundedRect(x, y, 50, 22, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,120); doc.text(k.label, x+25, y+7, {align:'center'});
      doc.setFontSize(12); doc.setTextColor(k.color[0],k.color[1],k.color[2]); doc.text(k.value, x+25, y+17, {align:'center'});
    });
    y += 32;
    y = sectionTitle('Visão Geral', y);
    if (ia?.sumarioExecutivo) y = addBlock(ia.sumarioExecutivo, y);
    else y = addBlock(`O hospital ${nomeEstabelecimento} apresentou taxa de glosa de ${fmtPct(resumo.pctGlosa)}, totalizando ${fmtCur(resumo.vlGlosa)} sobre ${fmtCur(resumo.vlCobrado)} cobrados, a partir de ${fmtNum(resumo.linhas)} itens e ${resumo.conveniosDistintos} convênios.`, y);

    // ═══ PAGE 3: TOP MOTIVOS ═══
    doc.addPage(); hdr('2. ANÁLISE POR MOTIVO DE GLOSA');
    y = 24;
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [244,63,94], fontSize: 8, textColor: [255,255,255] }, bodyStyles: { fontSize: 7 }, columnStyles: { 0: {cellWidth:90} },
      head: [['Motivo', 'Valor Glosa', '% s/ Cobrado', 'Participação %', 'Pareto', 'Qtd']],
      body: motivosComPareto.slice(0,15).map((m: any) => [m.motivo?.substring(0,70), fmtCur(m.vlGlosa), fmtPct(m.pctGlosa), fmtPct(m.participacao), fmtPct(m.paretoAcum), String(m.qtd)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    if (ia?.analiseMotivos) { y = sectionTitle('Análise dos Motivos', y); y = addBlock(ia.analiseMotivos, y); }

    // ═══ PAGE 4: TOP CONVÊNIOS ═══
    doc.addPage(); hdr('3. ANÁLISE POR CONVÊNIO');
    y = 24;
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [139,92,246], fontSize: 8, textColor: [255,255,255] }, bodyStyles: { fontSize: 7 },
      head: [['Convênio', 'Vl Cobrado', 'Vl Pago', 'Vl Glosa', '% Glosa', 'Registros', 'Glosados']],
      body: data.porConvenio.map((c: any) => [c.convenio, fmtCur(c.vlCobrado), fmtCur(c.vlPago), fmtCur(c.vlGlosa), fmtPct(c.pctGlosa), String(c.qtd), String(c.qtdGlosados)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    if (ia?.analiseConvenios) { y = sectionTitle('Análise dos Convênios', y); y = addBlock(ia.analiseConvenios, y); }

    // ═══ PAGE 5: TOP ITENS ═══
    doc.addPage(); hdr('4. ITENS DE ALTO VALOR GLOSADO');
    y = 24;
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [16,185,129], fontSize: 8, textColor: [255,255,255] }, bodyStyles: { fontSize: 7 },
      head: [['Código', 'Descrição', 'Motivo Glosa', 'Vl Glosa', 'Qtd', 'Ticket Médio']],
      body: data.porItem.slice(0,20).map((i: any) => [i.codigo, i.descricao?.substring(0,50), (i.motivo||'N/I')?.substring(0,40), fmtCur(i.vlGlosa), String(i.qtd), fmtCur(i.qtd>0 ? i.vlGlosa/i.qtd : 0)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    if (ia?.analiseItens) { y = sectionTitle('Análise dos Itens', y); y = addBlock(ia.analiseItens, y); }

    // ═══ PAGE 6: EVOLUÇÃO + TENDÊNCIA ═══
    doc.addPage(); hdr('5. EVOLUÇÃO MENSAL E TENDÊNCIA');
    y = 24;
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [59,130,246], fontSize: 8, textColor: [255,255,255] }, bodyStyles: { fontSize: 8 },
      head: [['Competência', 'Vl Cobrado', 'Vl Pago', 'Vl Glosa', '% Glosa', 'Qtd']],
      body: data.evolucaoMensal.map((e: any) => [e.comp, fmtCur(e.vlCobrado), fmtCur(e.vlPago), fmtCur(e.vlGlosa), fmtPct(e.pctGlosa), String(e.qtd)]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    if (ia?.tendencia) { y = sectionTitle('Tendência', y); y = addBlock(ia.tendencia, y); }

    // ═══ PAGE 7: SIMULAÇÃO + ESTRATÉGIA ═══
    doc.addPage(); hdr('6. SIMULAÇÃO DE IMPACTO E ESTRATÉGIA');
    y = 24;
    y = sectionTitle('Cenários de Redução de Glosa', y);
    const vG = resumo.vlGlosa;
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [245,158,11], fontSize: 9, textColor: [0,0,0] }, bodyStyles: { fontSize: 9 },
      head: [['Cenário', 'Redução', 'Economia Estimada', 'Nova Taxa de Glosa']],
      body: [
        ['Conservador', '5%', fmtCur(vG*0.05), fmtPct(resumo.pctGlosa*0.95)],
        ['Realista', '10%', fmtCur(vG*0.10), fmtPct(resumo.pctGlosa*0.90)],
        ['Otimista', '20%', fmtCur(vG*0.20), fmtPct(resumo.pctGlosa*0.80)],
        ['Agressivo', '30%', fmtCur(vG*0.30), fmtPct(resumo.pctGlosa*0.70)],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    if (ia?.estrategiaReducao) { y = sectionTitle('Estratégia de Redução', y); y = addBlock(ia.estrategiaReducao, y); }

    // ═══ PAGE 8: PLANO DE AÇÃO + CONCLUSÃO ═══
    doc.addPage(); hdr('7. PLANO DE AÇÃO E CONCLUSÃO');
    y = 24;
    y = sectionTitle('Ações Recomendadas', y);
    const acoes = ia?.acoes || [
      { area:'Faturamento', problema:'Glosas recorrentes', acao:'Revisão de processos', meta:'Reduzir 15%', prazo:'30 dias' },
      { area:'Auditoria', problema:'Itens de alto custo', acao:'Dupla checagem pré-envio', meta:'Zero glosas documentais', prazo:'15 dias' },
    ];
    autoTable(doc, { startY: y, theme: 'grid', headStyles: { fillColor: [244,63,94], fontSize: 8, textColor: [255,255,255] }, bodyStyles: { fontSize: 7 },
      head: [['Área', 'Problema', 'Ação Proposta', 'Meta', 'Prazo']],
      body: acoes.map((a: any) => [a.area, a.problema, a.acao, a.meta, a.prazo]),
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    if (ia?.conclusao) { y = sectionTitle('Conclusão', y); y = addBlock(ia.conclusao, y); }
    // assinatura
    y += 10;
    doc.setFontSize(8); doc.setTextColor(120,130,150); doc.text('Relatório gerado automaticamente pelo Sistema Safatle com suporte de Inteligência Artificial.', W/2, y, {align:'center'});

    doc.save(`Relatorio_Analise_Glosas_${nomeEstabelecimento.replace(/\s/g,'_')}_${competencia}.pdf`);
    toast.success('✅ PDF com análise IA exportado com sucesso!');
  };



  // ═══ AI-Powered PowerPoint Export ═══
  const handleExportPPTX = async () => {
    if (!data || !resumo) return;
    toast.info('🤖 Gerando apresentação com IA... aguarde ~15s');

    let ia: any = null;
    try {
      const res = await gerarAnaliseIAMut.mutateAsync({
        nomeEstabelecimento,
        resumo: { vlCobrado: resumo.vlCobrado, vlPago: resumo.vlPago, vlGlosa: resumo.vlGlosa, pctGlosa: resumo.pctGlosa, linhas: resumo.linhas, conveniosDistintos: resumo.conveniosDistintos, compIni: resumo.compIni, compFim: resumo.compFim },
        topMotivos: data.porMotivo?.slice(0, 10),
        topConvenios: data.porConvenio?.slice(0, 8),
        topItens: data.porItem?.slice(0, 8),
        evolucao: data.evolucaoMensal?.slice(-6),
      });
      ia = res.analise;
    } catch { ia = null; }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Safatle Sistema + IA';
    pptx.title = `Análise de Glosas — ${nomeEstabelecimento}`;
    const bg = '0D1B3E'; const card = '162350'; const blue = '3B82F6'; const rose = 'F43F5E'; const green = '10B981'; const amber = 'F59E0B';
    let slide: any;
    // Slide 1: Capa
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('RELATÓRIO DE ANÁLISE DE GLOSAS', { x: 0.8, y: 1.2, w: 11, fontSize: 32, color: 'FFFFFF', bold: true });
    slide.addText(nomeEstabelecimento, { x: 0.8, y: 2.3, w: 11, fontSize: 20, color: blue });
    slide.addText(`Período: ${resumo.compIni||'N/A'} a ${resumo.compFim||'N/A'}`, { x: 0.8, y: 3.0, w: 11, fontSize: 14, color: '8899BB' });
    slide.addText(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, { x: 0.8, y: 3.5, w: 11, fontSize: 12, color: '667799' });
    if (ia) slide.addText('✦ Análise gerada por Inteligência Artificial', { x: 0.8, y: 4.2, w: 11, fontSize: 10, color: green });

    // Slide 2: KPIs + Sumário
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('RESUMO EXECUTIVO', { x: 0.5, y: 0.2, w: 12, fontSize: 22, color: 'FFFFFF', bold: true });
    const kpArr = [
      { l: 'COBRADO', v: fmtCur(resumo.vlCobrado), c: blue },
      { l: 'PAGO', v: fmtCur(resumo.vlPago), c: green },
      { l: 'GLOSADO', v: fmtCur(resumo.vlGlosa), c: rose },
      { l: '% GLOSA', v: fmtPct(resumo.pctGlosa), c: amber },
    ];
    kpArr.forEach((k, i) => {
      const x = 0.5 + i * 3.1;
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 0.9, w: 2.8, h: 1.5, fill: { color: card }, rectRadius: 0.1 });
      slide.addText(k.l, { x, y: 1.0, w: 2.8, fontSize: 9, color: '8899BB', align: 'center' });
      slide.addText(k.v, { x, y: 1.4, w: 2.8, fontSize: 20, color: k.c, align: 'center', bold: true });
    });
    if (ia?.sumarioExecutivo) {
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 2.7, w: 12, h: 2.5, fill: { color: card }, rectRadius: 0.1 });
      slide.addText('Visão Geral (IA)', { x: 0.7, y: 2.8, w: 11.6, fontSize: 12, color: blue, bold: true });
      slide.addText(ia.sumarioExecutivo, { x: 0.7, y: 3.3, w: 11.6, fontSize: 10, color: 'CCCCCC', breakLine: true });
    }

    // Slide 3: Motivos + Insight IA
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('TOP MOTIVOS DE GLOSA', { x: 0.5, y: 0.2, w: 12, fontSize: 22, color: 'FFFFFF', bold: true });
    const mRows = data.porMotivo.slice(0,10).map((m: any) => [
      { text: m.motivo?.substring(0,45)||'', options: { fontSize: 8, color: 'FFFFFF' } },
      { text: fmtCur(m.vlGlosa), options: { fontSize: 8, color: rose, align: 'right' as const } },
      { text: fmtPct(m.participacao), options: { fontSize: 8, color: '8899BB', align: 'right' as const } },
    ]);
    slide.addTable(
      [[{ text:'Motivo', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose}} },
        { text:'Valor', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose},align:'right' as const} },
        { text:'Partic.', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose},align:'right' as const} }],
      ...mRows], { x:0.5, y:0.8, w:6, colW:[3.5,1.5,1], border:{type:'solid',pt:0.5,color:'2A3A5E'}, rowH:0.3 });
    if (ia?.analiseMotivos) {
      slide.addShape(pptx.ShapeType.roundRect, { x:7, y:0.8, w:5.5, h:4, fill:{color:card}, rectRadius:0.1 });
      slide.addText('Insight IA', { x:7.2, y:0.9, w:5.1, fontSize:11, color:blue, bold:true });
      slide.addText(ia.analiseMotivos, { x:7.2, y:1.4, w:5.1, fontSize:9, color:'CCCCCC', breakLine:true });
    }

    // Slide 4: Convênios + Insight
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('GLOSA POR CONVÊNIO', { x:0.5, y:0.2, w:12, fontSize:22, color:'FFFFFF', bold:true });
    const cRows = data.porConvenio.slice(0,10).map((c: any) => [
      { text:c.convenio, options:{fontSize:8,color:'FFFFFF'} },
      { text:fmtCur(c.vlCobrado), options:{fontSize:8,color:blue,align:'right' as const} },
      { text:fmtCur(c.vlGlosa), options:{fontSize:8,color:rose,align:'right' as const} },
      { text:fmtPct(c.pctGlosa), options:{fontSize:8,color:amber,align:'right' as const} },
    ]);
    slide.addTable(
      [[{ text:'Convênio', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:'8B5CF6'}} },
        { text:'Cobrado', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:'8B5CF6'},align:'right' as const} },
        { text:'Glosa', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:'8B5CF6'},align:'right' as const} },
        { text:'%', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:'8B5CF6'},align:'right' as const} }],
      ...cRows], { x:0.5, y:0.8, w:7, colW:[2.5,1.8,1.5,1.2], border:{type:'solid',pt:0.5,color:'2A3A5E'}, rowH:0.3 });
    if (ia?.analiseConvenios) {
      slide.addShape(pptx.ShapeType.roundRect, { x:8, y:0.8, w:4.5, h:4, fill:{color:card}, rectRadius:0.1 });
      slide.addText('Insight IA', { x:8.2, y:0.9, w:4.1, fontSize:11, color:blue, bold:true });
      slide.addText(ia.analiseConvenios, { x:8.2, y:1.4, w:4.1, fontSize:9, color:'CCCCCC', breakLine:true });
    }

    // Slide 5: Itens + Evolução
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('TOP ITENS E EVOLUÇÃO MENSAL', { x:0.5, y:0.2, w:12, fontSize:22, color:'FFFFFF', bold:true });
    const iRows = data.porItem.slice(0,8).map((i: any) => [
      { text:i.descricao?.substring(0,24)||'S/D', options:{fontSize:7,color:'FFFFFF'} },
      { text:(i.motivo||'N/I')?.substring(0,22), options:{fontSize:7,color:amber} },
      { text:fmtCur(i.vlGlosa), options:{fontSize:7,color:rose,align:'right' as const} },
    ]);
    slide.addTable(
      [[{ text:'Item', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:green}} },
        { text:'Motivo', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:green}} },
        { text:'Glosa', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:green},align:'right' as const} }],
      ...iRows], { x:0.5, y:0.8, w:5.5, colW:[2.2,1.8,1.5], border:{type:'solid',pt:0.5,color:'2A3A5E'}, rowH:0.3 });
    const eRows = data.evolucaoMensal.slice(-8).map((e: any) => [
      { text:e.comp, options:{fontSize:8,color:'FFFFFF'} },
      { text:fmtCur(e.vlGlosa), options:{fontSize:8,color:rose,align:'right' as const} },
      { text:fmtPct(e.pctGlosa), options:{fontSize:8,color:amber,align:'right' as const} },
    ]);
    slide.addTable(
      [[{ text:'Mês', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:blue}} },
        { text:'Glosado', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:blue},align:'right' as const} },
        { text:'%', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:blue},align:'right' as const} }],
      ...eRows], { x:6, y:0.8, w:6.5, colW:[2,2.5,2], border:{type:'solid',pt:0.5,color:'2A3A5E'}, rowH:0.3 });

    // Slide 6: Simulação + Estratégia IA
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('SIMULAÇÃO DE IMPACTO E ESTRATÉGIA', { x:0.5, y:0.2, w:12, fontSize:22, color:'FFFFFF', bold:true });
    slide.addShape(pptx.ShapeType.roundRect, { x:0.5, y:0.8, w:4, h:2.2, fill:{color:card}, rectRadius:0.1 });
    slide.addText('Meta: Redução de 10%', { x:0.5, y:1.0, w:4, fontSize:14, color:green, align:'center', bold:true });
    slide.addText('Economia Estimada:', { x:0.5, y:1.5, w:4, fontSize:11, color:'8899BB', align:'center' });
    slide.addText(fmtCur(resumo.vlGlosa*0.10), { x:0.5, y:2.0, w:4, fontSize:24, color:'FFFFFF', align:'center', bold:true });
    if (ia?.estrategiaReducao) {
      slide.addShape(pptx.ShapeType.roundRect, { x:5, y:0.8, w:7.5, h:4.2, fill:{color:card}, rectRadius:0.1 });
      slide.addText('Estratégia de Redução (IA)', { x:5.2, y:0.9, w:7.1, fontSize:12, color:blue, bold:true });
      slide.addText(ia.estrategiaReducao, { x:5.2, y:1.5, w:7.1, fontSize:10, color:'CCCCCC', breakLine:true });
    }

    // Slide 7: Plano de Ação + Conclusão
    slide = pptx.addSlide(); slide.background = { color: bg };
    slide.addText('PLANO DE AÇÃO E CONCLUSÃO', { x:0.5, y:0.2, w:12, fontSize:22, color:'FFFFFF', bold:true });
    const acoes = (ia?.acoes || []).slice(0, 5);
    if (acoes.length > 0) {
      const aRows = acoes.map((a: any) => [
        { text:a.area, options:{fontSize:8,color:'FFFFFF',bold:true} },
        { text:a.acao?.substring(0,50), options:{fontSize:8,color:'CCCCCC'} },
        { text:a.meta, options:{fontSize:8,color:green} },
        { text:a.prazo, options:{fontSize:8,color:amber} },
      ]);
      slide.addTable(
        [[{ text:'Área', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose}} },
          { text:'Ação', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose}} },
          { text:'Meta', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose}} },
          { text:'Prazo', options:{bold:true,fontSize:8,color:'FFFFFF',fill:{color:rose}} }],
        ...aRows], { x:0.5, y:0.8, w:12, colW:[2,5,3,2], border:{type:'solid',pt:0.5,color:'2A3A5E'}, rowH:0.35 });
    }
    if (ia?.conclusao) {
      slide.addShape(pptx.ShapeType.roundRect, { x:0.5, y:3.5, w:12, h:1.8, fill:{color:card}, rectRadius:0.1 });
      slide.addText('Conclusão', { x:0.7, y:3.6, w:11.6, fontSize:12, color:blue, bold:true });
      slide.addText(ia.conclusao, { x:0.7, y:4.1, w:11.6, fontSize:10, color:'CCCCCC', breakLine:true });
    }
    slide.addText('Safatle Sistema — Relatório gerado com Inteligência Artificial', { x:0.5, y:5.2, w:12, fontSize:8, color:'445566', align:'center' });

    pptx.writeFile({ fileName: `Apresentacao_Glosas_${nomeEstabelecimento.replace(/\s/g,'_')}_${competencia}.pptx` });
    toast.success('✅ PowerPoint com análise IA exportado!');
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 print:p-0" ref={reportRef}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="h-7 w-7 text-blue-400" />
              RELATÓRIO DE ANÁLISE DE GLOSAS
            </h1>
            <p className="text-blue-300/70 text-sm mt-1">
              Geração automática • {nomeEstabelecimento}
              {fonte !== 'nenhuma' && (
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${fonte === 'tasy_bi' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                  Fonte: {fonte === 'tasy_bi' ? 'Tasy BI' : 'Demonstrativo'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={competencia} onValueChange={setCompetencia}>
              <SelectTrigger className="w-[160px] bg-[#0d1b3e] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas Comp.</SelectItem>
                {data?.competencias?.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={convenio} onValueChange={setConvenio}>
              <SelectTrigger className="w-[180px] bg-[#0d1b3e] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Convênios</SelectItem>
                {data?.convenios?.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleExportExcel} variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button onClick={handleExportPDF} variant="outline" className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10">
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button onClick={handleExportPPTX} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
              <Printer className="h-4 w-4 mr-2" /> PowerPoint
            </Button>
            <Button
              onClick={() => { setModoComparativo(!modoComparativo); setAnaliseComparativa(null); }}
              variant={modoComparativo ? "default" : "outline"}
              className={modoComparativo ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white" : "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" /> Comparar Meses
            </Button>
          </div>
        </div>

        {/* ═══ PAINEL COMPARATIVO ═══ */}
        {modoComparativo && (
          <Card className="bg-gradient-to-br from-[#0a1628] to-[#0d1b3e] border-cyan-500/20 shadow-lg shadow-cyan-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-cyan-400" />
                ANÁLISE COMPARATIVA ENTRE MESES
              </CardTitle>
              <CardDescription className="text-cyan-300/50">Selecione dois meses para comparar e gerar análise com IA</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Seletores */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-white/50 uppercase tracking-wider">Mês A (Base)</label>
                  <Select value={mesA} onValueChange={setMesA}>
                    <SelectTrigger className="w-[160px] bg-[#162350] border-blue-500/20 text-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {data?.competencias?.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ArrowLeftRight className="h-5 w-5 text-cyan-400/50 mb-2" />
                <div className="space-y-1">
                  <label className="text-xs text-white/50 uppercase tracking-wider">Mês B (Comparação)</label>
                  <Select value={mesB} onValueChange={setMesB}>
                    <SelectTrigger className="w-[160px] bg-[#162350] border-purple-500/20 text-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {data?.competencias?.filter((c: string) => c !== mesA).map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleCompararMeses}
                  disabled={!mesA || !mesB || loadingComparacao || !dadosMesA?.resumo || !dadosMesB?.resumo}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white"
                >
                  {loadingComparacao ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" /> Analisando...</>
                  ) : (
                    <><BarChart3 className="h-4 w-4 mr-2" /> Gerar Análise Comparativa</>
                  )}
                </Button>
              </div>

              {/* KPIs Comparativos lado a lado */}
              {dadosMesA?.resumo && dadosMesB?.resumo && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {([
                      { label: "Valor Cobrado", a: dadosMesA.resumo.vlCobrado, b: dadosMesB.resumo.vlCobrado, fmt: fmtCur, colorA: "text-blue-400", colorB: "text-blue-300" },
                      { label: "Valor Pago", a: dadosMesA.resumo.vlPago, b: dadosMesB.resumo.vlPago, fmt: fmtCur, colorA: "text-emerald-400", colorB: "text-emerald-300" },
                      { label: "Valor Glosado", a: dadosMesA.resumo.vlGlosa, b: dadosMesB.resumo.vlGlosa, fmt: fmtCur, colorA: "text-rose-400", colorB: "text-rose-300", invertDelta: true },
                      { label: "Taxa de Glosa", a: dadosMesA.resumo.pctGlosa, b: dadosMesB.resumo.pctGlosa, fmt: fmtPct, colorA: "text-amber-400", colorB: "text-amber-300", invertDelta: true },
                    ] as const).map((kpi, i) => {
                      const d = varDelta(kpi.a, kpi.b);
                      const good = kpi.invertDelta ? d.delta < 0 : d.delta > 0;
                      return (
                        <Card key={i} className="bg-[#162350]/80 border-white/5">
                          <CardContent className="p-3">
                            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">{kpi.label}</p>
                            <div className="flex justify-between items-baseline gap-1">
                              <div className="text-center flex-1">
                                <p className="text-[9px] text-white/30">{mesA}</p>
                                <p className={`text-sm font-bold ${kpi.colorA}`}>{kpi.fmt(kpi.a)}</p>
                              </div>
                              <div className="text-center flex-1">
                                <p className="text-[9px] text-white/30">{mesB}</p>
                                <p className={`text-sm font-bold ${kpi.colorB}`}>{kpi.fmt(kpi.b)}</p>
                              </div>
                            </div>
                            <div className={`mt-2 text-center text-xs font-medium flex items-center justify-center gap-1 ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {good ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Gráfico comparativo */}
                  <Card className="bg-[#162350]/50 border-white/5">
                    <CardContent className="p-4 h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: mesA, Cobrado: dadosMesA.resumo.vlCobrado, Pago: dadosMesA.resumo.vlPago, Glosado: dadosMesA.resumo.vlGlosa },
                          { name: mesB, Cobrado: dadosMesB.resumo.vlCobrado, Pago: dadosMesB.resumo.vlPago, Glosado: dadosMesB.resumo.vlGlosa },
                        ]} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                          <XAxis dataKey="name" tick={{ fill: "#ffffff80", fontSize: 12 }} />
                          <YAxis tick={{ fill: "#ffffff60", fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                          <RTooltip contentStyle={{ background: "#0d1b3e", border: "1px solid #ffffff15", borderRadius: 8 }} formatter={(v: number) => fmtCur(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Cobrado" fill="#3b82f6" radius={[4,4,0,0]} />
                          <Bar dataKey="Pago" fill="#10b981" radius={[4,4,0,0]} />
                          <Bar dataKey="Glosado" fill="#f43f5e" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Análise IA Comparativa */}
              {analiseComparativa && (
                <div className="space-y-4 mt-4">
                  <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">✦</span> Análise Comparativa por Inteligência Artificial
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {([
                      { title: "Visão Geral", content: analiseComparativa.visaoGeral, color: "border-blue-500/30" },
                      { title: "Análise das Variações", content: analiseComparativa.analiseVariacoes, color: "border-purple-500/30" },
                      { title: "Comparativo de Motivos", content: analiseComparativa.comparativoMotivos, color: "border-rose-500/30" },
                      { title: "Comparativo de Convênios", content: analiseComparativa.comparativoConvenios, color: "border-amber-500/30" },
                      { title: "Diagnóstico", content: analiseComparativa.diagnostico, color: "border-cyan-500/30" },
                      { title: "Recomendações", content: analiseComparativa.recomendacoes, color: "border-emerald-500/30" },
                    ]).map((sec, i) => (
                      <Card key={i} className={`bg-[#162350]/60 ${sec.color}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-white/80">{sec.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-white/60 leading-relaxed">{sec.content}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Ações Prioritárias */}
                  {analiseComparativa.acoesPrioritarias?.length > 0 && (
                    <Card className="bg-[#162350]/60 border-rose-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-white/80">🎯 Ações Prioritárias</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader><TableRow className="border-white/5">
                            <TableHead className="text-white/60 text-xs">Área</TableHead>
                            <TableHead className="text-white/60 text-xs">Situação</TableHead>
                            <TableHead className="text-white/60 text-xs">Ação</TableHead>
                            <TableHead className="text-white/60 text-xs text-right">Impacto Estimado</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {analiseComparativa.acoesPrioritarias.map((a: any, i: number) => (
                              <TableRow key={i} className="border-white/5">
                                <TableCell className="text-cyan-300 text-xs font-medium">{a.area}</TableCell>
                                <TableCell className="text-white/50 text-xs">{a.situacao}</TableCell>
                                <TableCell className="text-white/60 text-xs">{a.acao}</TableCell>
                                <TableCell className="text-emerald-400 text-xs text-right font-medium">{a.impactoEstimado}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Conclusão */}
                  {analiseComparativa.conclusao && (
                    <Card className="bg-gradient-to-r from-[#162350]/80 to-[#0d1b3e]/80 border-emerald-500/20">
                      <CardContent className="p-4">
                        <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Conclusão</p>
                        <p className="text-sm text-white/70 leading-relaxed">{analiseComparativa.conclusao}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
          </div>
        ) : !resumo ? (
          <Card className="bg-[#0d1b3e] border-white/5"><CardContent className="p-8 text-center text-white/50">Sem dados disponíveis</CardContent></Card>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Valor Cobrado", value: fmtCur(resumo.vlCobrado), icon: BarChart3, color: "text-blue-400" },
                { label: "Valor Pago", value: fmtCur(resumo.vlPago), icon: TrendingDown, color: "text-emerald-400" },
                { label: "Valor Glosado", value: fmtCur(resumo.vlGlosa), icon: AlertTriangle, color: "text-rose-400" },
                { label: "Taxa de Glosa", value: fmtPct(resumo.pctGlosa), icon: Target, color: "text-amber-400" },
              ].map((kpi, i) => (
                <Card key={i} className="bg-gradient-to-br from-[#0d1b3e] to-[#162350] border-white/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      <span className="text-xs text-white/50 uppercase tracking-wider">{kpi.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Info strip */}
            <div className="flex flex-wrap gap-3 text-xs text-white/40">
              <Badge variant="outline" className="border-white/10 text-white/50">{fmtNum(resumo.linhas)} itens analisados</Badge>
              <Badge variant="outline" className="border-white/10 text-white/50">{resumo.conveniosDistintos} convênios</Badge>
              <Badge variant="outline" className="border-white/10 text-white/50">Período: {resumo.compIni} a {resumo.compFim}</Badge>
              <Badge variant="outline" className="border-white/10 text-white/50">A Receber: {fmtCur(resumo.vlAReceber)}</Badge>
            </div>

            {/* Evolução Mensal */}
            <Card className="bg-[#0d1b3e] border-white/5">
              <CardHeader className="pb-2"><CardTitle className="text-white text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" />EVOLUÇÃO MENSAL: FATURADO × GLOSADO</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.evolucaoMensal?.slice(-12)} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="comp" tick={{ fill: "#ffffff60", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#ffffff60", fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <RTooltip contentStyle={{ background: "#0d1b3e", border: "1px solid #ffffff15", borderRadius: 8 }}
                      formatter={(v: number) => fmtCur(v)} labelStyle={{ color: "#fff" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="vlCobrado" name="Cobrado" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="vlGlosa" name="Glosado" fill="#f43f5e" radius={[4,4,0,0]} />
                    <Bar dataKey="vlPago" name="Pago" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Two columns: Motivos + Convênios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Motivos de Glosa */}
              <Card className="bg-[#0d1b3e] border-white/5">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm">🔍 TOP MOTIVOS DE GLOSA</CardTitle></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow className="border-white/5">
                        <TableHead className="text-white/60 text-xs">Motivo</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">Vl Glosa</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">%</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">Pareto</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {motivosComPareto.map((m: any, i: number) => (
                          <TableRow key={i} className="border-white/5 hover:bg-white/5">
                            <TableCell className="text-blue-100 text-xs py-1.5 max-w-[200px] truncate">{m.motivo}</TableCell>
                            <TableCell className="text-rose-400 text-xs py-1.5 text-right font-medium">{fmtCur(m.vlGlosa)}</TableCell>
                            <TableCell className="text-amber-400 text-xs py-1.5 text-right">{fmtPct(m.participacao)}</TableCell>
                            <TableCell className="text-white/50 text-xs py-1.5 text-right">{fmtPct(m.paretoAcum)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Glosa por Convênio (Pie) */}
              <Card className="bg-[#0d1b3e] border-white/5">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm">🏥 GLOSA POR CONVÊNIO</CardTitle></CardHeader>
                <CardContent className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data?.porConvenio?.slice(0, 8)} dataKey="vlGlosa" nameKey="convenio"
                        cx="50%" cy="50%" outerRadius={100} label={({ convenio, pctGlosa }) => `${convenio?.substring(0,12)} (${pctGlosa?.toFixed(1)}%)`}
                        labelLine={{ stroke: "#ffffff30" }} >
                        {data?.porConvenio?.slice(0, 8).map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip contentStyle={{ background: "#0d1b3e", border: "1px solid #ffffff15", borderRadius: 8 }}
                        formatter={(v: number) => fmtCur(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Tabela Convênios completa */}
            <Card className="bg-[#0d1b3e] border-white/5">
              <CardHeader className="pb-2"><CardTitle className="text-white text-sm">📊 DETALHAMENTO POR CONVÊNIO</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader><TableRow className="border-white/5">
                      <TableHead className="text-white/60 text-xs">Convênio</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Vl Cobrado</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Vl Pago</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Vl Glosa</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">% Glosa</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Qtd Glosados</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data?.porConvenio?.map((c: any, i: number) => (
                        <TableRow key={i} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-blue-100 text-xs py-1.5 font-medium">{c.convenio}</TableCell>
                          <TableCell className="text-white text-xs py-1.5 text-right">{fmtCur(c.vlCobrado)}</TableCell>
                          <TableCell className="text-emerald-400 text-xs py-1.5 text-right">{fmtCur(c.vlPago)}</TableCell>
                          <TableCell className="text-rose-400 text-xs py-1.5 text-right font-medium">{fmtCur(c.vlGlosa)}</TableCell>
                          <TableCell className="text-amber-400 text-xs py-1.5 text-right">{fmtPct(c.pctGlosa)}</TableCell>
                          <TableCell className="text-white/50 text-xs py-1.5 text-right">{fmtNum(c.qtdGlosados)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Two columns: Setores + Itens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-[#0d1b3e] border-white/5">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm">🏢 GLOSA POR SETOR</CardTitle></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    <Table>
                      <TableHeader><TableRow className="border-white/5">
                        <TableHead className="text-white/60 text-xs">Setor</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">Vl Glosa</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">% Glosa</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {data?.porSetor?.map((s: any, i: number) => (
                          <TableRow key={i} className="border-white/5 hover:bg-white/5">
                            <TableCell className="text-blue-100 text-xs py-1.5">{s.setor}</TableCell>
                            <TableCell className="text-rose-400 text-xs py-1.5 text-right font-medium">{fmtCur(s.vlGlosa)}</TableCell>
                            <TableCell className="text-amber-400 text-xs py-1.5 text-right">{fmtPct(s.pctGlosa)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="bg-[#0d1b3e] border-white/5">
                <CardHeader className="pb-2"><CardTitle className="text-white text-sm">💊 TOP ITENS GLOSADOS</CardTitle></CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader><TableRow className="border-white/5">
                        <TableHead className="text-white/60 text-xs">Item</TableHead>
                        <TableHead className="text-white/60 text-xs">Motivo Glosa</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">Vl Glosa</TableHead>
                        <TableHead className="text-white/60 text-xs text-right">Qtd</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {data?.porItem?.map((it: any, i: number) => (
                          <TableRow key={i} className="border-white/5 hover:bg-white/5">
                            <TableCell className="text-blue-100 text-xs py-1.5 max-w-[180px] truncate">{it.descricao}</TableCell>
                            <TableCell className="text-amber-300/80 text-xs py-1.5 max-w-[180px] truncate">{it.motivo || 'N/I'}</TableCell>
                            <TableCell className="text-rose-400 text-xs py-1.5 text-right font-medium">{fmtCur(it.vlGlosa)}</TableCell>
                            <TableCell className="text-white/50 text-xs py-1.5 text-right">{fmtNum(it.qtd)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Oportunidades (Motivo x Convênio) */}
            <Card className="bg-[#0d1b3e] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">🎯 TOP 30 OPORTUNIDADES DE RECUPERAÇÃO (Motivo × Convênio)</CardTitle>
                <CardDescription className="text-white/40 text-xs">Cruzamento de maior impacto financeiro para ação prioritária</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader><TableRow className="border-white/5">
                      <TableHead className="text-white/60 text-xs">Motivo</TableHead>
                      <TableHead className="text-white/60 text-xs">Convênio</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Vl Glosa</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Vl Cobrado</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">% Glosa</TableHead>
                      <TableHead className="text-white/60 text-xs text-right">Qtd</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data?.oportunidades?.map((o: any, i: number) => (
                        <TableRow key={i} className="border-white/5 hover:bg-white/5">
                          <TableCell className="text-blue-100 text-xs py-1.5 max-w-[200px] truncate">{o.motivo}</TableCell>
                          <TableCell className="text-purple-300 text-xs py-1.5">{o.convenio}</TableCell>
                          <TableCell className="text-rose-400 text-xs py-1.5 text-right font-bold">{fmtCur(o.vlGlosa)}</TableCell>
                          <TableCell className="text-white text-xs py-1.5 text-right">{fmtCur(o.vlCobrado)}</TableCell>
                          <TableCell className="text-amber-400 text-xs py-1.5 text-right">{fmtPct(o.pctGlosa)}</TableCell>
                          <TableCell className="text-white/50 text-xs py-1.5 text-right">{fmtNum(o.qtd)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
