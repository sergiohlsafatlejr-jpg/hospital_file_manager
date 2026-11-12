import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
  DOSSIE_STALE_TIME, MAX_GLOSAS_DOSSIE, consultaDossiePronta, cacheDossiePronto,
  criarGuardaDossie, mensagemResultadoIA, contratoDossieProcessando,
  iniciarProcessamentoDossie, assinarProcessamentoDossie,
} from "@/lib/contratoDossieIssue182";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Gavel,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface ContratoDossieModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: number | null;
  abaInicial?: string;
  escopo?: string;
  onAbrirDocumentoPdf?: (documentoId: number) => void;
}

const SEMAFORO_META: Record<
  "RED" | "YEL" | "GRN",
  {
    label: string;
    badgeClass: string;
    cardBorder: string;
    cardBg: string;
    textColor: string;
  }
> = {
  RED: {
    label: "CRÍTICO / RISCO FINANCEIRO",
    badgeClass: "bg-red-600 text-white border-red-700",
    cardBorder: "border-red-300 dark:border-red-800",
    cardBg: "bg-red-50/70 dark:bg-red-950/30",
    textColor: "text-red-900 dark:text-red-200",
  },
  YEL: {
    label: "ATENÇÃO OPERACIONAL / XML",
    badgeClass: "bg-amber-500 text-white border-amber-600",
    cardBorder: "border-amber-300 dark:border-amber-800",
    cardBg: "bg-amber-50/70 dark:bg-amber-950/30",
    textColor: "text-amber-900 dark:text-amber-200",
  },
  GRN: {
    label: "OPORTUNIDADE / COBRANÇA",
    badgeClass: "bg-emerald-600 text-white border-emerald-700",
    cardBorder: "border-emerald-300 dark:border-emerald-800",
    cardBg: "bg-emerald-50/70 dark:bg-emerald-950/30",
    textColor: "text-emerald-900 dark:text-emerald-200",
  },
};

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  return Number(val).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ContratoDossieModal(props: ContratoDossieModalProps) {
  // Fechar/reabrir, trocar hospital/filtros/contrato reinicia abas e estado local.
  return <ContratoDossieConteudo key={`${props.open}:${props.contratoId}:${props.escopo ?? ""}`} {...props} />;
}

function ContratoDossieConteudo({
  open,
  onOpenChange,
  contratoId,
  abaInicial = "resumo",
  onAbrirDocumentoPdf,
  escopo = "",
}: ContratoDossieModalProps) {
  const [, setLocation] = useLocation();
  const [abaAtiva, setAbaAtiva] = useState<string>(abaInicial);
  const [filtroSemaforo, setFiltroSemaforo] = useState<string>("TODOS");
  const [buscaTabela, setBuscaTabela] = useState<string>("");
  const [competenciaXml, setCompetenciaXml] = useState<string>("");
  const [loteXml, setLoteXml] = useState<string>("");
  const [filtroStatusXml, setFiltroStatusXml] = useState<string>("TODOS");
  const [competenciaGlosa, setCompetenciaGlosa] = useState<string>("");
  const [filtroClassificacaoGlosa, setFiltroClassificacaoGlosaState] = useState<string>("TODOS");
  const [selecao, setSelecao] = useState<{ identidade: number; itens: Record<string, boolean> }>({ identidade: 0, itens: {} });
  const guarda = useRef(criarGuardaDossie()).current;
  const guardaExcel = useRef(criarGuardaDossie()).current;
  const queryClient = useQueryClient();
  const processando = useSyncExternalStore(assinarProcessamentoDossie,
    () => contratoDossieProcessando(contratoId), () => false);
  useEffect(() => {
    guarda.ativar(); guardaExcel.ativar();
    return () => { guarda.desativar(); guardaExcel.desativar(); };
  }, [guarda, guardaExcel]);
  useEffect(() => { if (open) setAbaAtiva(abaInicial); }, [open, abaInicial]);

  const utils = trpc.useUtils();

  const dossieQuery = trpc.contratosConvenios.obterDossie.useQuery(
    { contratoId: contratoId ?? 0 },
    { enabled: open && Boolean(contratoId), staleTime: DOSSIE_STALE_TIME }
  );

  const auditoriaXmlQuery = trpc.contratosConvenios.auditarCobrancaXml.useQuery(
    {
      contratoId: contratoId ?? 0,
      competencia: competenciaXml.trim() || undefined,
      loteXml: loteXml.trim() || undefined,
      limit: 300,
    },
    {
      enabled: open && Boolean(contratoId),
      staleTime: DOSSIE_STALE_TIME,
    }
  );

  const auditoriaGlosasQuery = trpc.contratosConvenios.auditarGlosasContrato.useQuery(
    {
      contratoId: contratoId ?? 0,
      competencia: competenciaGlosa.trim() || undefined,
      limit: MAX_GLOSAS_DOSSIE,
    },
    {
      enabled: open && Boolean(contratoId),
      staleTime: DOSSIE_STALE_TIME,
    }
  );

  const gerarDossieIAMutation = trpc.contratosConvenios.gerarDossieIA.useMutation();
  const sincronizarTabelaMutation = trpc.contratosConvenios.sincronizarTabelaDossie.useMutation();
  const aplicarFundamentacaoMutation = trpc.contratosConvenios.aplicarFundamentacaoGlosas.useMutation();
  const xmlInput = { contratoId: contratoId ?? 0, competencia: competenciaXml.trim() || undefined,
    loteXml: loteXml.trim() || undefined, limit: 300 };
  const glosaInput = { contratoId: contratoId ?? 0, competencia: competenciaGlosa.trim() || undefined,
    limit: MAX_GLOSAS_DOSSIE };
  const dossieKey = getQueryKey(trpc.contratosConvenios.obterDossie, { contratoId: contratoId ?? 0 }, "query");
  const xmlKey = getQueryKey(trpc.contratosConvenios.auditarCobrancaXml, xmlInput, "query");
  const glosaKey = getQueryKey(trpc.contratosConvenios.auditarGlosasContrato, glosaInput, "query");
  const dossiePronto = open && consultaDossiePronta(dossieQuery, contratoId);
  const xmlPronto = dossiePronto && consultaDossiePronta(auditoriaXmlQuery, contratoId);
  const glosasProntas = dossiePronto && consultaDossiePronta(auditoriaGlosasQuery, contratoId);
  const identidade = guarda.atualizar(JSON.stringify([open, contratoId, escopo,
    competenciaGlosa, filtroClassificacaoGlosa]),
    auditoriaGlosasQuery.data, auditoriaGlosasQuery.dataUpdatedAt,
    glosasProntas && !processando);
  const identidadeExcel = guardaExcel.atualizar(JSON.stringify([open, contratoId, escopo,
    competenciaXml, loteXml, competenciaGlosa, filtroClassificacaoGlosa]),
    auditoriaXmlQuery.data, auditoriaXmlQuery.dataUpdatedAt,
    xmlPronto && glosasProntas && !processando);
  const glosasSelecionadas = selecao.identidade === identidade && glosasProntas ? selecao.itens : {};
  const selecaoAtual = useRef(selecao);
  selecaoAtual.current = selecao;
  const setGlosasSelecionadas = (itens: Record<string, boolean>) => {
    const nova = { identidade: guarda.identidade(), itens };
    selecaoAtual.current = nova;
    setSelecao(nova);
  };
  // Consulta ao cache no próprio clique: isFetching/isInvalidated podem mudar
  // antes do próximo render/efeito. Nenhum handler antigo vence este guard.
  const podeUsarBase = (id: number, incluirAuditorias = false) =>
    (incluirAuditorias ? guardaExcel : guarda).atual(id) && open && !contratoDossieProcessando(contratoId) && dossiePronto &&
    cacheDossiePronto(queryClient.getQueryState(dossieKey), dossieQuery.data) &&
    (!incluirAuditorias || (xmlPronto && glosasProntas &&
      cacheDossiePronto(queryClient.getQueryState(xmlKey), auditoriaXmlQuery.data) &&
      cacheDossiePronto(queryClient.getQueryState(glosaKey), auditoriaGlosasQuery.data)));
  const podeSelecionar = (id: number) =>
    guarda.atual(id) && open && !contratoDossieProcessando(contratoId) && dossiePronto && glosasProntas &&
    cacheDossiePronto(queryClient.getQueryState(dossieKey), dossieQuery.data) &&
    cacheDossiePronto(queryClient.getQueryState(glosaKey), auditoriaGlosasQuery.data);
  // Só transições do estado protegido revogam handlers/seleção; eventos de
  // options/observer em erro persistente não são uma nova falha. XML é exclusivo
  // do Excel. Captura também ciclos completos/removal antes de um render React.
  useEffect(() => {
    const hashesBase = [hashKey(dossieKey), hashKey(glosaKey)];
    const hashXml = hashKey(xmlKey);
    const anteriores = new Map([dossieKey, glosaKey, xmlKey].map(key =>
      [hashKey(key), queryClient.getQueryState(key)]));
    return queryClient.getQueryCache().subscribe(event => {
      const hash = hashKey(event.query.queryKey);
      if (!hashesBase.includes(hash) && hash !== hashXml) return;
      if (event.type !== "updated" && event.type !== "removed") return;
      const anterior = anteriores.get(hash);
      const atual = event.type === "removed" ? undefined : event.query.state;
      anteriores.set(hash, atual);
      if (anterior?.data === atual?.data && anterior?.dataUpdatedAt === atual?.dataUpdatedAt &&
        anterior?.status === atual?.status && anterior?.fetchStatus === atual?.fetchStatus &&
        anterior?.isInvalidated === atual?.isInvalidated) return;
      if (hashesBase.includes(hash)) guarda.invalidar();
      guardaExcel.invalidar();
    });
  }, [queryClient, guarda, guardaExcel, hashKey(dossieKey), hashKey(xmlKey), hashKey(glosaKey)]);

  const executarOperacao = async (tipo: "ia" | "tabela" | "glosas" | "glosas_auto") => {
    const id = identidade;
    if (!contratoId || !(tipo === "glosas" || tipo === "glosas_auto" ? podeSelecionar(id) : podeUsarBase(id))) return;
    const selecionados =
      tipo === "glosas_auto"
        ? (auditoriaGlosasQuery.data?.itens ?? [])
            .filter(i => filtroClassificacaoGlosa === "TODOS" || i.classificacaoContrato === filtroClassificacaoGlosa)
            .filter(i => i.classificacaoContrato !== "ajuste_contratual_legitimo" && i.valorRecursoSugerido > 0)
            .slice(0, MAX_GLOSAS_DOSSIE)
        : auditoriaGlosasQuery.data?.itens.filter(i => glosasSelecionadas[`${i.origem}:${i.id}`]) ?? [];
    if ((tipo === "glosas" || tipo === "glosas_auto") && (selecionados.length === 0 || selecionados.length > MAX_GLOSAS_DOSSIE)) return;
    const finalizar = iniciarProcessamentoDossie(contratoId);
    if (!finalizar) return;
    // Identidade de operação independente do render de isPending/processando.
    const operacao = { contratoId, xmlInput, glosaInput, identidade: operacaoAtual.current };
    const aindaAtual = () => operacaoAtual.current === operacao.identidade && montado.current;
    setGlosasSelecionadas({});
    try {
      if (tipo === "ia") {
        const resultado = await gerarDossieIAMutation.mutateAsync({ contratoId: operacao.contratoId });
        if (aindaAtual()) {
          const mensagem = mensagemResultadoIA(resultado);
          if (mensagem.sucesso) toast.success(mensagem.texto); else toast.warning(mensagem.texto);
        }
        if (resultado.salvo) {
          void utils.contratosConvenios.obterDossie.invalidate({ contratoId: operacao.contratoId });
          void utils.contratosConvenios.listarDocumentos.invalidate({ contratoId: operacao.contratoId });
          // A base muda por contrato, não somente pela competência/lote aberto.
          void utils.contratosConvenios.auditarCobrancaXml.invalidate({ contratoId: operacao.contratoId });
          void utils.contratosConvenios.auditarGlosasContrato.invalidate({ contratoId: operacao.contratoId });
        }
      } else if (tipo === "tabela") {
        const res = await sincronizarTabelaMutation.mutateAsync({ contratoId: operacao.contratoId });
        if (aindaAtual()) toast.success(`Sincronização concluída: ${res.inseridos} preço(s) inserido(s) e ${res.atualizados} atualizado(s) na Tabela do Portal.`);
        void utils.contratosConvenios.obterDossie.invalidate({ contratoId: operacao.contratoId });
        void utils.contratosConvenios.auditarCobrancaXml.invalidate({ contratoId: operacao.contratoId });
        void utils.contratosConvenios.auditarGlosasContrato.invalidate({ contratoId: operacao.contratoId });
      } else {
        const res = await aplicarFundamentacaoMutation.mutateAsync({ contratoId: operacao.contratoId,
          itens: selecionados.map(i => ({ id: i.id, origem: i.origem,
            justificativa: i.justificativaContratualSugerida, valorRecurso: i.valorRecursoSugerido })) });
        if (aindaAtual()) toast.success(`Fundamentação contratual aplicada em ${res.atualizados} item(ns) de glosa!`);
        void utils.contratosConvenios.auditarGlosasContrato.invalidate({ contratoId: operacao.contratoId });
      }
    } catch (error) {
      if (aindaAtual()) toast.error(error instanceof Error ? error.message : "Falha na operação contratual.");
    } finally { finalizar(); }
  };
  const chaveOperacao = JSON.stringify([open, contratoId, escopo,
    competenciaGlosa, filtroClassificacaoGlosa]);
  const operacaoAtual = useRef({ escopo: chaveOperacao });
  if (operacaoAtual.current.escopo !== chaveOperacao) operacaoAtual.current = { escopo: chaveOperacao };
  const invalidarInteracao = () => {
    guarda.invalidar();
    guardaExcel.invalidar();
    operacaoAtual.current = { escopo: chaveOperacao };
    setGlosasSelecionadas({});
  };
  const setFiltroClassificacaoGlosa = (valor: string | ((atual: string) => string)) => {
    invalidarInteracao();
    setFiltroClassificacaoGlosaState(valor);
  };
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const dossie = dossieQuery.data;

  const pontosFiltrados = useMemo(() => {
    if (!dossie) return [];
    if (filtroSemaforo === "TODOS") return dossie.pontos_atencao;
    return dossie.pontos_atencao.filter(p => p[2] === filtroSemaforo);
  }, [dossie, filtroSemaforo]);

  const tabelaValoresFiltrada = useMemo(() => {
    if (!dossie) return [];
    const q = buscaTabela.trim().toLowerCase();
    if (!q) return dossie.tabela_valores.linhas;
    return dossie.tabela_valores.linhas.filter(
      ([codigo, descricao, , fonte]) =>
        codigo.toLowerCase().includes(q) ||
        descricao.toLowerCase().includes(q) ||
        fonte.toLowerCase().includes(q)
    );
  }, [dossie, buscaTabela]);

  const itensXmlFiltrados = useMemo(() => {
    const itens = auditoriaXmlQuery.data?.itens ?? [];
    if (filtroStatusXml === "TODOS") return itens;
    return itens.filter(i => i.statusCobranca === filtroStatusXml);
  }, [auditoriaXmlQuery.data, filtroStatusXml]);

  const itensGlosaFiltrados = useMemo(() => {
    const itens = auditoriaGlosasQuery.data?.itens ?? [];
    if (filtroClassificacaoGlosa === "TODOS") return itens;
    return itens.filter(i => i.classificacaoContrato === filtroClassificacaoGlosa);
  }, [auditoriaGlosasQuery.data, filtroClassificacaoGlosa]);

  const exportarExcelConsultoria = () => {
    if (!dossie || !podeUsarBase(identidadeExcel, true)) return;
    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo e Pontos Críticos
    const resumoRows: any[][] = [
      [`DOSSIÊ DE ANÁLISE CONTRATUAL — ${dossie.convenio.toUpperCase()}`],
      [`Hospital / Unidade: ${dossie.estabelecimentoNome}`],
      [],
      ["1. DADOS GERAIS E PRAZOS OPERACIONAIS"],
      ["Campo", "Informação Identificada no Contrato"],
      ...dossie.dados_gerais.map(([campo, valor]) => [campo, valor]),
      [],
      ["2. PRINCIPAIS PONTOS DE ATENÇÃO E OPORTUNIDADES (SEMÁFORO)"],
      ["Nível", "Ponto de Atenção / Oportunidade", "Detalhamento / Regra"],
      ...dossie.pontos_atencao.map(([titulo, detalhe, semaforo]) => [
        semaforo === "RED"
          ? "CRÍTICO (VERMELHO)"
          : semaforo === "YEL"
            ? "ATENÇÃO (AMARELO)"
            : "OPORTUNIDADE (VERDE)",
        titulo,
        detalhe,
      ]),
      [],
      ["3. PRINCIPAIS CLÁUSULAS CONTRATUAIS"],
      ["Tópico Contratual", "Resumo da Cláusula"],
      ...dossie.clausulas.map(([topico, resumo]) => [topico, resumo]),
      [],
      ["4. PENDÊNCIAS E CHECKLIST DE RECOMENDAÇÕES"],
      ["#", "Descrição da Pendência / Ação"],
      ...dossie.pendencias.map((p, i) => [i + 1, p]),
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
    wsResumo["!cols"] = [{ wch: 34 }, { wch: 48 }, { wch: 75 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo e Pontos Críticos");

    // Aba 2: Documentos
    const docRows: any[][] = [
      [`HISTÓRICO E LINHA DO TEMPO DOCUMENTAL — ${dossie.convenio.toUpperCase()}`],
      [],
      ["#", "Data", "Arquivo PDF", "Tipo", "Páginas", "O que estabelece / Resumo", "Status"],
      ...dossie.documentos.map((d, idx) => [
        idx + 1,
        d.data,
        d.arquivo,
        d.tipo,
        d.paginas,
        d.resumo,
        d.status,
      ]),
    ];
    const wsDocs = XLSX.utils.aoa_to_sheet(docRows);
    wsDocs["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 42 },
      { wch: 16 },
      { wch: 10 },
      { wch: 68 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDocs, "Documentos");

    // Aba 3: Remuneração e Reajustes
    const remRows: any[][] = [
      [`REGRAS DE REMUNERAÇÃO E HISTÓRICO DE REAJUSTES — ${dossie.convenio.toUpperCase()}`],
      [],
      ["1. ESTRUTURA DE REMUNERAÇÃO VIGENTE"],
      ["Categoria / Componente", "Regra Contratual / Tabela Referência", "Fonte / Vigência"],
      ...dossie.remuneracao.map(([cat, regra, fonte]) => [cat, regra, fonte]),
      [],
      ["2. HISTÓRICO DE REAJUSTES E ADITIVOS FINANCEIROS"],
      ["Data / Vigência", "Documento / Fonte", "Resumo / Índice", "Arquivo"],
      ...dossie.reajustes.map(([data, doc, resumo, arq]) => [data, doc, resumo, arq]),
    ];
    const wsRem = XLSX.utils.aoa_to_sheet(remRows);
    wsRem["!cols"] = [{ wch: 32 }, { wch: 58 }, { wch: 38 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsRem, "Remuneração e Reajustes");

    // Aba 4: Tabela de Valores
    const tabRows: any[][] = [
      [dossie.tabela_valores.titulo],
      [],
      dossie.tabela_valores.colunas,
      ...dossie.tabela_valores.linhas.map(([codigo, desc, valor, fonte]) => [
        codigo,
        desc,
        valor,
        fonte,
      ]),
    ];
    const wsTab = XLSX.utils.aoa_to_sheet(tabRows);
    wsTab["!cols"] = [{ wch: 20 }, { wch: 56 }, { wch: 20 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, wsTab, "Tabela de Valores");

    // Aba 5 (se disponível): Auditoria XML
    if (auditoriaXmlQuery.data && auditoriaXmlQuery.data.itens.length > 0) {
      const xmlRows: any[][] = [
        [`AUDITORIA DE COBRANÇA XML DE FATURAMENTO X CONTRATO — ${dossie.convenio.toUpperCase()}`],
        [],
        [
          "Guia",
          "Lote XML",
          "Competência",
          "Data Execução",
          "Código TUSS",
          "Descrição",
          "Qtd",
          "Cobrado no XML (R$)",
          "Devido Contrato (R$)",
          "Diferença (R$)",
          "Status",
          "Observação",
        ],
        ...auditoriaXmlQuery.data.itens.map(i => [
          i.numeroGuia,
          i.numeroLote || "",
          i.competencia || "",
          i.dataExecucao || "",
          i.codigoItem,
          i.descricaoItem,
          i.quantidade,
          i.valorTotalXml,
          i.valorTotalContrato ?? "",
          i.diferencaTotal,
          i.statusCobranca,
          i.alertaRegra || "",
        ]),
      ];
      const wsXml = XLSX.utils.aoa_to_sheet(xmlRows);
      XLSX.utils.book_append_sheet(wb, wsXml, "Auditoria Cobrança XML");
    }

    XLSX.writeFile(wb, dossie.arquivo_saida || "Analise_Contratual.xlsx");
    toast.success("Planilha Excel (.xlsx Padrão Consultoria) gerada com sucesso!");
  };

  const toggleSelecionarGlosa = (chave: string, checked: boolean) => {
    if (!podeSelecionar(identidade)) return;
    const atuais = selecaoAtual.current.identidade === identidade ? selecaoAtual.current.itens : {};
    if (checked && !atuais[chave] && Object.values(atuais).filter(Boolean).length >= MAX_GLOSAS_DOSSIE) {
      toast.warning(`Selecione no máximo ${MAX_GLOSAS_DOSSIE} glosas por aplicação.`);
      return;
    }
    setGlosasSelecionadas({ ...atuais, [chave]: checked });
  };

  const selecionarTodasGlosasContestaveis = () => {
    if (!podeSelecionar(identidade)) return;
    const contestaveis = itensGlosaFiltrados.filter(
      i => i.classificacaoContrato !== "ajuste_contratual_legitimo" && i.valorRecursoSugerido > 0
    ).slice(0, MAX_GLOSAS_DOSSIE);
    const novo: Record<string, boolean> = {};
    for (const item of contestaveis) novo[`${item.origem}:${item.id}`] = true;
    setGlosasSelecionadas(novo);
  };

  const qtdContestaveisLote = itensGlosaFiltrados.filter(
    i => i.classificacaoContrato !== "ajuste_contratual_legitimo" && i.valorRecursoSugerido > 0
  ).slice(0, MAX_GLOSAS_DOSSIE).length;
  const qtdGlosasSelecionadas = Object.values(glosasSelecionadas).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={value => {
      if (!value) { guarda.invalidar(); guardaExcel.invalidar(); montado.current = false; setGlosasSelecionadas({}); }
      onOpenChange(value);
    }}>
      <DialogContent className="sm:max-w-[96vw] max-w-[96vw] w-[1440px] max-h-[92vh] overflow-y-auto p-0">
        {/* Header fixo estilo Dossiê Executivo */}
        <div className="sticky top-0 z-20 bg-slate-900 text-white px-6 py-4 border-b border-slate-800">
          <DialogHeader>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <BookOpen className="h-5 w-5 text-blue-400" />
                  <DialogTitle className="text-lg font-bold text-white">
                    Dossiê de Leitura Contratual, Cobrança XML & Defesa de Glosas
                  </DialogTitle>
                  {dossie && (
                    <Badge className="bg-blue-600 text-white border-blue-500">
                      {dossie.convenio}
                    </Badge>
                  )}
                  {dossie?.numeroContrato && (
                    <Badge variant="outline" className="text-slate-200 border-slate-600">
                      Contrato {dossie.numeroContrato}
                    </Badge>
                  )}
                </div>
                {dossie && (
                  <p className="text-xs text-slate-300 mt-1">
                    {dossie.estabelecimentoNome} · {dossie.resumo_executivo.totalDocumentos} PDF(s) analisado(s) · Prazo Faturamento:{" "}
                    <strong>{dossie.resumo_executivo.prazoFaturamento}</strong> · Prazo Recurso Glosa:{" "}
                    <strong>{dossie.resumo_executivo.prazoRecursoGlosa}</strong>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white border-0"
                  disabled={!dossiePronto || processando}
                  onClick={() => void executarOperacao("ia")}
                >
                  {gerarDossieIAMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5" />
                  )}
                  Enriquecer Leitura com IA
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-600"
                  disabled={!xmlPronto || !glosasProntas || processando}
                  onClick={exportarExcelConsultoria}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                  Baixar Excel (.xlsx Consultoria)
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-6">
          {[dossieQuery, auditoriaXmlQuery, auditoriaGlosasQuery].some(q => q.isError) && (
            <div role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              Falha ao atualizar dossiê/auditoria. Exportação completa bloqueada até revalidação.
              {glosasProntas && !processando
                ? " Dossiê e glosas atualizados: aplicação de fundamentação nas glosas disponível, independentemente do XML."
                : " Aplicação de fundamentação nas glosas bloqueada enquanto dossiê/glosas não estiverem atualizados ou houver operação em processamento."}
              {[dossieQuery, auditoriaXmlQuery, auditoriaGlosasQuery].filter(q => q.isError).map((q, i) => <p key={i}>{q.error?.message}</p>)}
            </div>
          )}
          {(!dossiePronto || !xmlPronto || !glosasProntas || processando) && dossie && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p role="status" className="text-xs text-amber-800">
                {glosasProntas && !processando
                  ? "Dossiê e glosas atualizados: aplicação de fundamentação nas glosas disponível. XML pendente de revalidação; exportação completa bloqueada."
                  : "Dossiê/glosas em atualização, desatualizados ou operação em processamento. Aplicação de fundamentação nas glosas e exportação completa bloqueadas."}
              </p>
              <Button size="sm" variant="outline"
                disabled={processando || dossieQuery.isFetching || auditoriaXmlQuery.isFetching || auditoriaGlosasQuery.isFetching}
                onClick={() => {
                  invalidarInteracao();
                  void dossieQuery.refetch();
                  void auditoriaXmlQuery.refetch();
                  void auditoriaGlosasQuery.refetch();
                }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Revalidar base
              </Button>
            </div>
          )}
          {dossieQuery.isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">
                Consolidando leitura dos PDFs do contrato, cláusulas, tabelas e cruzamentos...
              </p>
            </div>
          ) : !dossie ? (
            <div className="py-12 text-center text-muted-foreground">
              Não foi possível carregar o dossiê deste contrato.
            </div>
          ) : (
            <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-5">
              <TabsList className="grid grid-cols-2 md:grid-cols-6 w-full h-auto gap-1 bg-muted/70 p-1">
                <TabsTrigger value="resumo" className="text-xs py-2">
                  <ShieldAlert className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                  1. Pontos de Atenção ({dossie.pontos_atencao.length})
                </TabsTrigger>
                <TabsTrigger value="documentos" className="text-xs py-2">
                  <FileText className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                  2. Documentos ({dossie.documentos.length})
                </TabsTrigger>
                <TabsTrigger value="remuneracao" className="text-xs py-2">
                  <Scale className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
                  3. Remuneração & Reajuste
                </TabsTrigger>
                <TabsTrigger value="tabela" className="text-xs py-2">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  4. Tabela de Valores ({dossie.tabela_valores.linhas.length})
                </TabsTrigger>
                <TabsTrigger value="xml" className="text-xs py-2">
                  <FileCode2 className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                  5. Cobrança XML x Contrato
                </TabsTrigger>
                <TabsTrigger value="glosas" className="text-xs py-2">
                  <Gavel className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                  6. Recursos de Glosas
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: RESUMO & PRINCIPAIS PONTOS DE ATENÇÃO */}
              <TabsContent value="resumo" className="space-y-6">
                {/* KPIs Semáforo + Conexão XML e Glosas */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <Card
                    className={`cursor-pointer border-l-4 border-l-red-600 ${
                      filtroSemaforo === "RED" ? "ring-2 ring-red-500" : ""
                    }`}
                    onClick={() =>
                      setFiltroSemaforo(prev => (prev === "RED" ? "TODOS" : "RED"))
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-red-700">
                          Risco Crítico / Glosa
                        </span>
                        <Badge className="bg-red-600 text-white">
                          {dossie.resumo_executivo.totalAlertasRed}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Prazos críticos, travas de pagamento e riscos financeiros
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer border-l-4 border-l-amber-500 ${
                      filtroSemaforo === "YEL" ? "ring-2 ring-amber-500" : ""
                    }`}
                    onClick={() =>
                      setFiltroSemaforo(prev => (prev === "YEL" ? "TODOS" : "YEL"))
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-amber-700">
                          Atenção Operacional / XML
                        </span>
                        <Badge className="bg-amber-500 text-white">
                          {dossie.resumo_executivo.totalAlertasYel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Parametrização TISS, senhas, guias, pacotes e anexos
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer border-l-4 border-l-emerald-600 ${
                      filtroSemaforo === "GRN" ? "ring-2 ring-emerald-500" : ""
                    }`}
                    onClick={() =>
                      setFiltroSemaforo(prev => (prev === "GRN" ? "TODOS" : "GRN"))
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-emerald-700">
                          Oportunidade / Cobrança
                        </span>
                        <Badge className="bg-emerald-600 text-white">
                          {dossie.resumo_executivo.totalOportunidadesGrn}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Valores reajustados, taxas, Brasíndice/Simpro e portes
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer border-l-4 border-l-blue-600 hover:bg-blue-50/40"
                    onClick={() => setAbaAtiva("xml")}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-blue-700">
                          Subfaturamento XML
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="text-base font-bold text-blue-900 mt-0.5">
                        {auditoriaXmlQuery.data
                          ? formatCurrency(
                              auditoriaXmlQuery.data.resumo.valorPerdaSubfaturamento
                            )
                          : "Ver Auditoria"}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {auditoriaXmlQuery.data
                          ? `${auditoriaXmlQuery.data.resumo.qtdSubfaturados} item(ns) cobrado(s) a menor no XML`
                          : "Cruzar XML TISS x Tabela Contratual"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer border-l-4 border-l-purple-600 hover:bg-purple-50/40"
                    onClick={() => setAbaAtiva("glosas")}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase text-purple-700">
                          Glosas Contestáveis
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="text-base font-bold text-purple-900 mt-0.5">
                        {auditoriaGlosasQuery.data
                          ? formatCurrency(
                              auditoriaGlosasQuery.data.resumo.valorContestavelContrato
                            )
                          : "Ver Glosas"}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {auditoriaGlosasQuery.data
                          ? `${auditoriaGlosasQuery.data.resumo.qtdGlosaIndevidaTabela + auditoriaGlosasQuery.data.resumo.qtdGlosaTotal} glosa(s) com defesa contratual`
                          : "Cruzar Recursos de Glosa x Contrato"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Seção 1: Principais Pontos de Atenção e Oportunidades (Semáforo) */}
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Principais Pontos de Atenção e Oportunidades (Modelo Consultoria)
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Classificação direta dos pontos críticos de glosa, prazos operacionais de XML e oportunidades de cobrança identificados nos PDFs do contrato.
                      </p>
                    </div>
                    {filtroSemaforo !== "TODOS" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiltroSemaforo("TODOS")}
                      >
                        Mostrar Todos ({dossie.pontos_atencao.length})
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pontosFiltrados.map(([titulo, detalhe, semaforo], idx) => {
                      const meta = SEMAFORO_META[semaforo] || SEMAFORO_META.YEL;
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-4 ${meta.cardBorder} ${meta.cardBg}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <Badge className={meta.badgeClass}>{meta.label}</Badge>
                            <span className={`font-semibold text-sm ${meta.textColor}`}>
                              {titulo}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/90 leading-relaxed">
                            {detalhe}
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Seção 2: Dados Gerais e Prazos Operacionais + Cláusulas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        Dados Gerais e Prazos Operacionais
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="divide-y text-xs">
                        {dossie.dados_gerais.map(([campo, valor]) => (
                          <div
                            key={campo}
                            className="py-2 grid grid-cols-12 gap-2 items-start"
                          >
                            <span className="col-span-5 font-semibold text-muted-foreground">
                              {campo}
                            </span>
                            <span className="col-span-7 font-medium text-foreground">
                              {valor}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                        Cláusulas Contratuais & Checklist de Ações
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                        {dossie.clausulas.map(([topico, resumo], i) => (
                          <div key={i} className="rounded border bg-muted/30 p-2.5 text-xs">
                            <div className="font-semibold text-blue-900 dark:text-blue-300 mb-0.5">
                              {topico}
                            </div>
                            <div className="text-muted-foreground leading-relaxed">
                              {resumo}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-3">
                        <h4 className="text-xs font-bold uppercase text-amber-800 dark:text-amber-300 mb-2">
                          Checklist Acionável (Faturamento XML & Glosas)
                        </h4>
                        <ul className="space-y-1.5 text-xs">
                          {dossie.pendencias.map((pend, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <span>{pend}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ABA 2: DOCUMENTOS ANALISADOS (LINHA DO TEMPO) */}
              <TabsContent value="documentos" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Histórico e Linha do Tempo Documental ({dossie.documentos.length} PDF(s))
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Todos os contratos, aditivos, tabelas e comunicados importados para este convênio.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {dossie.documentos.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        Nenhum arquivo PDF anexado a este contrato ainda.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead className="w-28">Data</TableHead>
                            <TableHead>Arquivo PDF</TableHead>
                            <TableHead className="w-28">Tipo</TableHead>
                            <TableHead className="w-20 text-center">Páginas</TableHead>
                            <TableHead>O que estabelece / Resumo</TableHead>
                            <TableHead className="w-44">Status</TableHead>
                            {onAbrirDocumentoPdf && (
                              <TableHead className="w-28 text-right">Ação</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dossie.documentos.map((doc, idx) => (
                            <TableRow key={doc.id}>
                              <TableCell className="font-mono text-xs">{idx + 1}</TableCell>
                              <TableCell className="text-xs font-medium">{doc.data}</TableCell>
                              <TableCell className="font-medium text-xs max-w-[260px] truncate">
                                {doc.arquivo}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {doc.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-xs">
                                {doc.paginas || "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[420px]">
                                {doc.resumo}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    doc.statusLeitura === "concluido"
                                      ? "bg-emerald-600 text-white text-xs"
                                      : "bg-amber-600 text-white text-xs"
                                  }
                                >
                                  {doc.status}
                                </Badge>
                              </TableCell>
                              {onAbrirDocumentoPdf && (
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onAbrirDocumentoPdf(doc.id)}
                                  >
                                    Ver Leitura
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA 3: REMUNERAÇÃO & REAJUSTES */}
              <TabsContent value="remuneracao" className="space-y-5">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      1. Estrutura de Remuneração Vigente por Componente
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Tabelas de referência (CBHPM/AMB/TUSS/Própria), portes, UCO, filme, diárias/taxas, Brasíndice, Simpro e pacotes.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-64">Categoria / Componente</TableHead>
                          <TableHead>Regra Contratual / Tabela Referência</TableHead>
                          <TableHead className="w-56">Fonte / Vigência</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dossie.remuneracao.map(([categoria, regra, fonte], i) => (
                          <TableRow key={i}>
                            <TableCell className="font-semibold text-xs">
                              {categoria}
                            </TableCell>
                            <TableCell className="text-xs leading-relaxed">{regra}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fonte}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      2. Histórico de Reajustes e Aditivos Financeiros
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-36">Data / Vigência</TableHead>
                          <TableHead className="w-64">Documento / Marco</TableHead>
                          <TableHead>Resumo / Índice Aplicado</TableHead>
                          <TableHead className="w-56">Fonte</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dossie.reajustes.map(([data, doc, resumo, fonte], i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium">{data}</TableCell>
                            <TableCell className="text-xs font-semibold">{doc}</TableCell>
                            <TableCell className="text-xs">{resumo}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fonte}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA 4: TABELA DE VALORES & SINCRONIZAÇÃO COM O PORTAL */}
              <TabsContent value="tabela" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">
                          {dossie.tabela_valores.titulo} ({dossie.tabela_valores.linhas.length} itens)
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Combina os valores extraídos diretamente dos PDFs contratuais com a Tabela de Preços do Portal (usada na auditoria do XML e nos Recursos de Glosa).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative w-64">
                          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar código TUSS ou descrição..."
                            value={buscaTabela}
                            onChange={e => setBuscaTabela(e.target.value)}
                            className="pl-8 h-9 text-xs"
                          />
                        </div>

                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white"
                          disabled={!dossiePronto || processando}
                          onClick={() => void executarOperacao("tabela")}
                        >
                          {sincronizarTabelaMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1.5" />
                          )}
                          Sincronizar Preços c/ Tabela do Portal
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {tabelaValoresFiltrada.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-sm">
                        Nenhum item de preço localizado para o filtro informado. Caso o PDF seja digitalizado como imagem, clique em &ldquo;Enriquecer Leitura com IA&rdquo; ou cadastre a Tabela de Preços do Convênio.
                      </div>
                    ) : (
                      <div className="max-h-[480px] overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-36">Código TUSS / Item</TableHead>
                              <TableHead>Descrição do Procedimento / Item</TableHead>
                              <TableHead className="w-40 text-right">
                                Valor Contratado (R$)
                              </TableHead>
                              <TableHead className="w-64">Observação / Fonte</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tabelaValoresFiltrada.map(([codigo, descricao, valor, fonte], idx) => (
                              <TableRow key={`${codigo}-${idx}`}>
                                <TableCell className="font-mono text-xs font-semibold">
                                  {codigo}
                                </TableCell>
                                <TableCell className="text-xs">{descricao}</TableCell>
                                <TableCell className="text-right font-bold text-xs text-emerald-700 dark:text-emerald-400">
                                  {formatCurrency(valor)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {fonte}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA 5: AUDITORIA DE COBRANÇA DO XML DO FATURAMENTO X CONTRATO */}
              <TabsContent value="xml" className="space-y-5">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileCode2 className="h-4 w-4 text-amber-600" />
                          Auditoria de Cobrança do XML de Faturamento x Tabela Contratual
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Compara automaticamente os itens faturados nos XMLs TISS deste convênio com os preços e regras do contrato (identificando cobrança a menor no XML e risco de glosa).
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          placeholder="Competência (ex: 2026-03)"
                          value={competenciaXml}
                          onChange={e => { guardaExcel.invalidar(); setCompetenciaXml(e.target.value); }}
                          className="w-44 h-9 text-xs"
                        />
                        <Input
                          placeholder="Lote XML (opcional)"
                          value={loteXml}
                          onChange={e => { guardaExcel.invalidar(); setLoteXml(e.target.value); }}
                          className="w-40 h-9 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={auditoriaXmlQuery.isFetching || processando}
                          onClick={() => { guardaExcel.invalidar(); void auditoriaXmlQuery.refetch(); }}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Recalcular
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    {auditoriaXmlQuery.isLoading ? (
                      <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                        Cruzando XMLs de faturamento com a tabela contratual...
                      </div>
                    ) : !auditoriaXmlQuery.data ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        Sem dados de auditoria de XML disponíveis.
                      </div>
                    ) : (
                      <>
                        {/* KPIs de Cobrança XML */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div
                            onClick={() => setFiltroStatusXml("TODOS")}
                            className={`cursor-pointer rounded-lg border p-3 ${
                              filtroStatusXml === "TODOS" ? "ring-2 ring-blue-500" : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                              Total Cobrado nos XMLs
                            </div>
                            <div className="text-base font-bold mt-1">
                              {formatCurrency(auditoriaXmlQuery.data.resumo.valorTotalCobradoXml)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {auditoriaXmlQuery.data.resumo.totalItensXml} itens ({auditoriaXmlQuery.data.resumo.totalGuiasXml} guias)
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroStatusXml(prev =>
                                prev === "subfaturado" ? "TODOS" : "subfaturado"
                              )
                            }
                            className={`cursor-pointer rounded-lg border border-red-300 bg-red-50/60 dark:bg-red-950/20 p-3 ${
                              filtroStatusXml === "subfaturado" ? "ring-2 ring-red-600" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-red-700">
                              <span>Cobrado a Menor no XML</span>
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            </div>
                            <div className="text-base font-bold text-red-700 mt-1">
                              {formatCurrency(
                                auditoriaXmlQuery.data.resumo.valorPerdaSubfaturamento
                              )}
                            </div>
                            <div className="text-[11px] text-red-800/80">
                              {auditoriaXmlQuery.data.resumo.qtdSubfaturados} item(ns) abaixo da tabela
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroStatusXml(prev =>
                                prev === "acima_contrato" ? "TODOS" : "acima_contrato"
                              )
                            }
                            className={`cursor-pointer rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 ${
                              filtroStatusXml === "acima_contrato"
                                ? "ring-2 ring-amber-600"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-amber-700">
                              <span>Acima do Contrato (Glosa)</span>
                              <TrendingUp className="h-4 w-4 text-amber-600" />
                            </div>
                            <div className="text-base font-bold text-amber-700 mt-1">
                              {formatCurrency(
                                auditoriaXmlQuery.data.resumo.valorRiscoGlosaAcimaTabela
                              )}
                            </div>
                            <div className="text-[11px] text-amber-800/80">
                              {auditoriaXmlQuery.data.resumo.qtdAcimaContrato} item(ns) acima da tabela
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroStatusXml(prev =>
                                prev === "conforme" ? "TODOS" : "conforme"
                              )
                            }
                            className={`cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 ${
                              filtroStatusXml === "conforme" ? "ring-2 ring-emerald-600" : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-emerald-700">
                              Conformes ao Contrato
                            </div>
                            <div className="text-base font-bold text-emerald-700 mt-1">
                              {auditoriaXmlQuery.data.resumo.qtdConformes} itens
                            </div>
                            <div className="text-[11px] text-emerald-800/80">
                              Preço XML = Preço Contratado
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroStatusXml(prev =>
                                prev === "sem_tabela" ? "TODOS" : "sem_tabela"
                              )
                            }
                            className={`cursor-pointer rounded-lg border p-3 ${
                              filtroStatusXml === "sem_tabela" ? "ring-2 ring-slate-500" : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                              Sem Preço Parametrizado
                            </div>
                            <div className="text-base font-bold mt-1">
                              {auditoriaXmlQuery.data.resumo.qtdSemTabela} itens
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {auditoriaXmlQuery.data.resumo.qtdGuiasSemSenha} guia(s) sem senha
                            </div>
                          </div>
                        </div>

                        {/* Resumo por Procedimento Divergente */}
                        {auditoriaXmlQuery.data.resumoPorProcedimento.some(
                          p => Math.abs(p.diferencaTotal) > 0.05
                        ) && (
                          <div className="rounded-lg border p-3 bg-muted/20">
                            <h4 className="text-xs font-bold uppercase mb-2 text-foreground">
                              Top Procedimentos com Divergência entre XML de Faturamento e Contrato
                            </h4>
                            <div className="max-h-44 overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-28">Código TUSS</TableHead>
                                    <TableHead>Procedimento</TableHead>
                                    <TableHead className="w-20 text-center">Qtd</TableHead>
                                    <TableHead className="w-36 text-right">Cobrado XML</TableHead>
                                    <TableHead className="w-36 text-right">
                                      Devido Contrato
                                    </TableHead>
                                    <TableHead className="w-40 text-right">
                                      Diferença (XML - Contrato)
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {auditoriaXmlQuery.data.resumoPorProcedimento
                                    .filter(p => Math.abs(p.diferencaTotal) > 0.05)
                                    .slice(0, 10)
                                    .map(proc => (
                                      <TableRow key={proc.codigoItem}>
                                        <TableCell className="font-mono text-xs font-semibold">
                                          {proc.codigoItem}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {proc.descricaoItem}
                                        </TableCell>
                                        <TableCell className="text-center text-xs">
                                          {proc.quantidadeTotal}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">
                                          {formatCurrency(proc.valorTotalXml)}
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-medium">
                                          {formatCurrency(proc.valorTotalContrato)}
                                        </TableCell>
                                        <TableCell
                                          className={`text-right text-xs font-bold ${
                                            proc.diferencaTotal < 0
                                              ? "text-red-600"
                                              : "text-amber-600"
                                          }`}
                                        >
                                          {proc.diferencaTotal < 0
                                            ? `${formatCurrency(proc.diferencaTotal)} (Subfaturado)`
                                            : `+${formatCurrency(proc.diferencaTotal)} (Acima)`}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {/* Tabela Detalhada de Guias / Itens do XML */}
                        {itensXmlFiltrados.length === 0 ? (
                          <div className="py-8 text-center text-muted-foreground text-sm">
                            Nenhum item de XML encontrado para os filtros selecionados.
                          </div>
                        ) : (
                          <div className="max-h-[420px] overflow-y-auto border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-28">Guia / Lote</TableHead>
                                  <TableHead className="w-24">Data</TableHead>
                                  <TableHead className="w-28">Código TUSS</TableHead>
                                  <TableHead>Procedimento</TableHead>
                                  <TableHead className="w-14 text-center">Qtd</TableHead>
                                  <TableHead className="w-32 text-right">Cobrado XML</TableHead>
                                  <TableHead className="w-32 text-right">
                                    Valor Contrato
                                  </TableHead>
                                  <TableHead className="w-48">Diagnóstico Contratual</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {itensXmlFiltrados.map(item => (
                                  <TableRow key={item.id}>
                                    <TableCell className="text-xs font-mono">
                                      <div>{item.numeroGuia}</div>
                                      {item.numeroLote && (
                                        <div className="text-[10px] text-muted-foreground">
                                          Lote {item.numeroLote}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {item.dataExecucao || item.competencia}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs font-semibold">
                                      {item.codigoItem}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[260px] truncate">
                                      {item.descricaoItem}
                                    </TableCell>
                                    <TableCell className="text-center text-xs">
                                      {item.quantidade}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-medium">
                                      {formatCurrency(item.valorTotalXml)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-bold text-emerald-700">
                                      {item.valorTotalContrato !== null
                                        ? formatCurrency(item.valorTotalContrato)
                                        : "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        className={
                                          item.statusCobranca === "subfaturado"
                                            ? "bg-red-600 text-white text-[10px]"
                                            : item.statusCobranca === "acima_contrato"
                                              ? "bg-amber-500 text-white text-[10px]"
                                              : item.statusCobranca === "conforme"
                                                ? "bg-emerald-600 text-white text-[10px]"
                                                : "bg-slate-500 text-white text-[10px]"
                                        }
                                      >
                                        {item.statusCobranca === "subfaturado"
                                          ? `Cobrado a Menor (${formatCurrency(item.diferencaTotal)})`
                                          : item.statusCobranca === "acima_contrato"
                                            ? "Cobrado Acima do Contrato"
                                            : item.statusCobranca === "conforme"
                                              ? "Conforme Contrato"
                                              : "Sem Preço na Tabela"}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA 6: RECURSOS DE GLOSAS X CONTRATO */}
              <TabsContent value="glosas" className="space-y-5">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Gavel className="h-4 w-4 text-purple-600" />
                          Defesa Contratual de Glosas & Geração de Recursos em Lote
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Cruza as glosas do Demonstrativo e da Conciliação com a Tabela Contratual e Cláusulas do Dossiê, gerando justificativa fundamentada no contrato.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          placeholder="Competência (ex: 2026-03)"
                          value={competenciaGlosa}
                          onChange={e => { invalidarInteracao(); setCompetenciaGlosa(e.target.value); }}
                          className="w-44 h-9 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation("/recurso-glosa-demonstrativo")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Abrir Recurso (Demonstrativo)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation("/recurso-glosa-conciliacao")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Abrir Recurso (Conciliação)
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5">
                    {auditoriaGlosasQuery.isLoading ? (
                      <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                        Cruzando glosas ativas com preços e cláusulas contratuais...
                      </div>
                    ) : !auditoriaGlosasQuery.data ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        Sem dados de glosas para este contrato.
                      </div>
                    ) : (
                      <>
                        {/* KPIs de Recursos de Glosa x Contrato */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div
                            onClick={() => setFiltroClassificacaoGlosa("TODOS")}
                            className={`cursor-pointer rounded-lg border p-3 ${
                              filtroClassificacaoGlosa === "TODOS"
                                ? "ring-2 ring-purple-600"
                                : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                              Total Glosado Analisado
                            </div>
                            <div className="text-base font-bold mt-1">
                              {formatCurrency(auditoriaGlosasQuery.data.resumo.valorTotalGlosado)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {auditoriaGlosasQuery.data.resumo.totalItensGlosados} glosa(s)
                            </div>
                          </div>

                          <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20 p-3">
                            <div className="text-[11px] font-semibold uppercase text-emerald-700">
                              Potencial Recuperável (Contrato)
                            </div>
                            <div className="text-base font-bold text-emerald-700 mt-1">
                              {formatCurrency(
                                auditoriaGlosasQuery.data.resumo.valorContestavelContrato
                              )}
                            </div>
                            <div className="text-[11px] text-emerald-800/80">
                              Prazo recurso: {auditoriaGlosasQuery.data.prazoRecursoGlosa}
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroClassificacaoGlosa(prev =>
                                prev === "glosa_indevida_abaixo_contrato"
                                  ? "TODOS"
                                  : "glosa_indevida_abaixo_contrato"
                              )
                            }
                            className={`cursor-pointer rounded-lg border border-red-300 bg-red-50/60 dark:bg-red-950/20 p-3 ${
                              filtroClassificacaoGlosa === "glosa_indevida_abaixo_contrato"
                                ? "ring-2 ring-red-600"
                                : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-red-700">
                              Pago Abaixo da Tabela
                            </div>
                            <div className="text-base font-bold text-red-700 mt-1">
                              {auditoriaGlosasQuery.data.resumo.qtdGlosaIndevidaTabela} glosa(s)
                            </div>
                            <div className="text-[11px] text-red-800/80">
                              Prova direta pelo preço contratual
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroClassificacaoGlosa(prev =>
                                prev === "glosa_total_contestavel"
                                  ? "TODOS"
                                  : "glosa_total_contestavel"
                              )
                            }
                            className={`cursor-pointer rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 ${
                              filtroClassificacaoGlosa === "glosa_total_contestavel"
                                ? "ring-2 ring-amber-600"
                                : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-amber-700">
                              Glosas Totais Contestáveis
                            </div>
                            <div className="text-base font-bold text-amber-700 mt-1">
                              {auditoriaGlosasQuery.data.resumo.qtdGlosaTotal} glosa(s)
                            </div>
                            <div className="text-[11px] text-amber-800/80">
                              Valor pago R$ 0,00
                            </div>
                          </div>

                          <div
                            onClick={() =>
                              setFiltroClassificacaoGlosa(prev =>
                                prev === "glosa_tecnica_contestavel"
                                  ? "TODOS"
                                  : "glosa_tecnica_contestavel"
                              )
                            }
                            className={`cursor-pointer rounded-lg border p-3 ${
                              filtroClassificacaoGlosa === "glosa_tecnica_contestavel"
                                ? "ring-2 ring-blue-600"
                                : ""
                            }`}
                          >
                            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                              Já c/ Justificativa Salva
                            </div>
                            <div className="text-base font-bold mt-1">
                              {auditoriaGlosasQuery.data.resumo.qtdJaComJustificativa} glosa(s)
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Prontas para exportação
                            </div>
                          </div>
                        </div>

                        {/* Barra de Ação em Lote */}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-purple-50/60 dark:bg-purple-950/20 p-3">
                          <div className="text-xs">
                            <span className="font-bold text-purple-900 dark:text-purple-200">
                              Fundamentação Contratual Automática:{" "}
                            </span>
                            <span className="text-muted-foreground">
                              Preenche a justificativa do recurso citando o Contrato{" "}
                              <strong>{dossie.numeroContrato || `#${dossie.contratoId}`}</strong>, o arquivo PDF lido e o valor contratado na tabela.
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {!glosasProntas && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  processando ||
                                  dossieQuery.isFetching ||
                                  auditoriaGlosasQuery.isFetching
                                }
                                onClick={() => {
                                  invalidarInteracao();
                                  void dossieQuery.refetch();
                                  void auditoriaXmlQuery.refetch();
                                  void auditoriaGlosasQuery.refetch();
                                }}
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Revalidar Agora
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!glosasProntas || processando}
                              onClick={selecionarTodasGlosasContestaveis}
                            >
                              Selecionar Contestáveis (máx. 200)
                            </Button>
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-500 text-white"
                              disabled={
                                qtdGlosasSelecionadas === 0 || !glosasProntas || processando
                              }
                              onClick={() => void executarOperacao("glosas")}
                            >
                              {aplicarFundamentacaoMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Gavel className="h-4 w-4 mr-1.5" />
                              )}
                              Aplicar Fundamentação nas Glosas ({qtdGlosasSelecionadas})
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-500 text-white"
                              disabled={
                                qtdContestaveisLote === 0 || !glosasProntas || processando
                              }
                              onClick={() => void executarOperacao("glosas_auto")}
                            >
                              {aplicarFundamentacaoMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1.5" />
                              )}
                              Responder Recursos Automaticamente ({qtdContestaveisLote})
                            </Button>
                          </div>
                        </div>

                        {/* Tabela de Glosas Cruzadas com o Contrato */}
                        {itensGlosaFiltrados.length === 0 ? (
                          <div className="py-8 text-center text-muted-foreground text-sm">
                            Nenhuma glosa encontrada para o filtro selecionado.
                          </div>
                        ) : (
                          <div className="max-h-[440px] overflow-y-auto border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10"></TableHead>
                                  <TableHead className="w-28">Guia / Origem</TableHead>
                                  <TableHead className="w-28">Código TUSS</TableHead>
                                  <TableHead className="w-32 text-right">Faturado</TableHead>
                                  <TableHead className="w-28 text-right">Pago</TableHead>
                                  <TableHead className="w-28 text-right">Glosado</TableHead>
                                  <TableHead className="w-32 text-right">
                                    Valor Contrato
                                  </TableHead>
                                  <TableHead className="w-40">Diagnóstico</TableHead>
                                  <TableHead>Justificativa Contratual Sugerida</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {itensGlosaFiltrados.map(item => {
                                  const chave = `${item.origem}:${item.id}`;
                                  return (
                                    <TableRow key={chave}>
                                      <TableCell>
                                        <Checkbox
                                          disabled={!glosasProntas || processando}
                                          checked={Boolean(glosasSelecionadas[chave])}
                                          onCheckedChange={v =>
                                            toggleSelecionarGlosa(chave, Boolean(v))
                                          }
                                        />
                                      </TableCell>
                                      <TableCell className="text-xs font-mono">
                                        <div>{item.numeroGuia}</div>
                                        <Badge variant="outline" className="text-[10px] mt-0.5">
                                          {item.origem === "demonstrativo"
                                            ? "Demonstrativo"
                                            : "Conciliação"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        <div className="font-mono font-semibold">
                                          {item.codigoItem || "—"}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                                          {item.descricaoItem}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-xs">
                                        {formatCurrency(item.valorFaturado)}
                                      </TableCell>
                                      <TableCell className="text-right text-xs">
                                        {formatCurrency(item.valorPago)}
                                      </TableCell>
                                      <TableCell className="text-right text-xs font-bold text-red-600">
                                        {formatCurrency(item.valorGlosa)}
                                      </TableCell>
                                      <TableCell className="text-right text-xs font-bold text-emerald-700">
                                        {item.valorContratadoTabela !== null
                                          ? formatCurrency(item.valorContratadoTabela)
                                          : "—"}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          className={
                                            item.classificacaoContrato ===
                                            "glosa_indevida_abaixo_contrato"
                                              ? "bg-red-600 text-white text-[10px]"
                                              : item.classificacaoContrato ===
                                                  "glosa_total_contestavel"
                                                ? "bg-amber-600 text-white text-[10px]"
                                                : item.classificacaoContrato ===
                                                    "ajuste_contratual_legitimo"
                                                  ? "bg-slate-500 text-white text-[10px]"
                                                  : "bg-blue-600 text-white text-[10px]"
                                          }
                                        >
                                          {item.classificacaoContrato ===
                                          "glosa_indevida_abaixo_contrato"
                                            ? "Pago < Contrato"
                                            : item.classificacaoContrato ===
                                                "glosa_total_contestavel"
                                              ? "Glosa Total"
                                              : item.classificacaoContrato ===
                                                  "ajuste_contratual_legitimo"
                                                ? "Ajuste Contratual"
                                                : "Defesa Técnica"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-[360px]">
                                        <div className="line-clamp-3">
                                          {item.justificativaContratualSugerida}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
