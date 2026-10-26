import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Save,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  classeEstadoRetorno,
  formatarDataRetorno,
  formatarMoedaRetorno,
  haDivergenciaCabecalho,
  haVinculoAprovadoInvalido,
  linhasSugestaoExata,
  montarItensRevisao,
  parecePdf,
  rotuloEstadoRetorno,
  validarArquivoProtocoloPdf,
  valorDentroDoSaldo,
  type RetornoDetalheUi,
  type RetornoEscopoUi,
  type RetornoLinhaUi,
  type RetornoRevisaoUi,
} from "@/lib/retornosRecursosUi";

export type RevisarRetornoInput = {
  importacaoId: number;
  itens: RetornoRevisaoUi[];
  confirmar: true;
  confirmarDivergenciasCabecalho: boolean;
};

export type ArquivoRetornoTipo = "xml" | "protocolo_pdf";

export type RetornosRecursosDetalheProps = {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  detalhe: RetornoDetalheUi | null;
  escopo: RetornoEscopoUi | null;
  podeEditar: boolean;
  processando?: boolean;
  onRebuscar: (importacaoId: number) => Promise<void>;
  onRevisar: (input: RevisarRetornoInput) => Promise<void>;
  onArquivo: (input: { importacaoId: number; tipo: ArquivoRetornoTipo }) => Promise<void>;
  onAnexarProtocolo: (input: {
    importacaoId: number;
    nomeArquivo: string;
    conteudoBase64: string;
    confirmar: true;
  }) => Promise<void>;
  onRegistrarPagamento: (input: {
    importacaoId: number;
    valor: string;
    dataRecebimento: string;
    referencia: string;
    observacao: string;
    chaveOperacao: string;
    confirmar: true;
  }) => Promise<void>;
  onEstornarPagamento: (input: {
    importacaoId: number;
    pagamentoId: number;
    dataEstorno: string;
    justificativa: string;
    chaveOperacao: string;
    confirmar: true;
  }) => Promise<void>;
  onExportarLote?: (detalhe: RetornoDetalheUi) => Promise<void>;
};

function hojeCivil(): string {
  return new Date().toISOString().slice(0, 10);
}

function novaChaveOperacao(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-000000000000";
}

function lerArquivoBase64(arquivo: File): Promise<{ conteudoBase64: string; bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Não foi possível ler o arquivo."));
        return;
      }
      const bytes = new Uint8Array(reader.result);
      let binario = "";
      for (let indice = 0; indice < bytes.length; indice += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(indice, indice + 0x8000));
      }
      resolve({ conteudoBase64: btoa(binario), bytes });
    };
    reader.readAsArrayBuffer(arquivo);
  });
}

function camposCandidato(linha: RetornoLinhaUi): string[] {
  const candidato = linha.candidatos[0];
  if (!candidato) return [];
  return [
    candidato.numeroGuia ? `Guia: ${candidato.numeroGuia}` : null,
    candidato.sequencialItem !== null ? `Sequência: ${candidato.sequencialItem}` : null,
    candidato.dataExecucao ? `Data: ${formatarDataRetorno(candidato.dataExecucao)}` : null,
    candidato.codigoItem ? `Código: ${candidato.codigoItem}` : null,
  ].filter((campo): campo is string => campo !== null);
}

function LinhaRetorno({
  linha,
  podeEditar,
  marcada,
  justificativa,
  onMarcar,
  onJustificativa,
  onRevisarIndividual,
  processando,
}: {
  linha: RetornoLinhaUi;
  podeEditar: boolean;
  marcada: boolean;
  justificativa: string;
  onMarcar: (marcada: boolean) => void;
  onJustificativa: (valor: string) => void;
  onRevisarIndividual: (linha: RetornoLinhaUi, demonstrativoId: number, justificativaLinha: string) => void;
  processando: boolean;
}) {
  const exata = linha.estado === "sugerido" && linha.candidatos.length === 1;
  const ambigua = linha.estado === "ambiguo";
  const vinculoAprovadoInvalido = linha.estado === "aprovado" && linha.vinculoAtual.status !== "valido";
  const [candidatoManual, setCandidatoManual] = useState<string>("");
  const candidatoId = Number(candidatoManual);
  const podeRevisarIndividual = ambigua
    && Number.isInteger(candidatoId)
    && linha.candidatos.some((candidato) => candidato.id === candidatoId)
    && justificativa.trim().length >= 10
    && justificativa.trim().length <= 200;
  const candidato = camposCandidato(linha);

  return (
    <TableRow className="align-top">
      <TableCell className="w-10">
        {podeEditar && exata ? (
          <Checkbox
            aria-label={`Selecionar linha ${linha.posicao}`}
            checked={marcada}
            onCheckedChange={(valor) => onMarcar(Boolean(valor))}
            disabled={processando}
          />
        ) : null}
      </TableCell>
      <TableCell className="min-w-48">
        <div className="font-medium">{linha.guiaPrestador || linha.guiaOperadora || "Guia não informada"}</div>
        <div className="text-xs text-muted-foreground">Item {linha.sequencialItem || "—"} · {formatarDataRetorno(linha.dataExecucao)}</div>
      </TableCell>
      <TableCell className="min-w-56">
        <div className="font-medium">{linha.codigoItem || "Código não informado"}</div>
        <div className="mt-1 text-xs text-muted-foreground">Tabela: {linha.codigoTabela || "Não informada no XML"} · Glosa: {linha.codigoGlosa || "—"}</div>
        <div className="mt-1 text-xs text-muted-foreground break-words">Prestador: {linha.justificativaPrestador || "Não informada"}</div>
      </TableCell>
      <TableCell className="min-w-36 text-right tabular-nums">
        <div>Recursado: {formatarMoedaRetorno(linha.valorRecursado)}</div>
        <div className="text-xs text-emerald-700">Acatado: {formatarMoedaRetorno(linha.valorAcatado)}</div>
      </TableCell>
      <TableCell className="min-w-52">
        <Badge variant="outline" className={classeEstadoRetorno(linha.estado)}>{rotuloEstadoRetorno(linha.estado)}</Badge>
        <p className="mt-1 text-xs text-muted-foreground break-words">{linha.motivo}</p>
        {candidato.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">Candidato compatível: {candidato.join(" · ")}</p> : null}
      </TableCell>
      <TableCell className="min-w-80">
        {linha.estado === "aprovado" ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-emerald-700">Vínculo aprovado</p>
            <p className="text-muted-foreground">A decisão registrada é preservada; uma nova busca não a substitui.</p>
            {vinculoAprovadoInvalido ? <p className="flex items-start gap-1 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />A fonte aprovada está {linha.vinculoAtual.status === "alterado" ? "alterada" : "ausente"}; registre novamente a evidência antes de lançar recebimentos.</p> : null}
          </div>
        ) : linha.estado === "sem_vinculo" || linha.estado === "divergente" ? (
          <p className="text-sm text-muted-foreground">Este item não pode ser aceito automaticamente. Permanece pendente até uma busca segura ou nova evidência.</p>
        ) : (
          <div className="space-y-2">
            {ambigua ? (
              <Select value={candidatoManual} onValueChange={setCandidatoManual} disabled={!podeEditar || processando}>
                <SelectTrigger aria-label="Selecionar candidato compatível"><SelectValue placeholder="Escolha um candidato compatível" /></SelectTrigger>
                <SelectContent>
                  {linha.candidatos.map((candidatoItem) => (
                    <SelectItem key={candidatoItem.id} value={String(candidatoItem.id)}>
                      Guia {candidatoItem.numeroGuia || "—"} · {candidatoItem.codigoItem || "sem código"} · {formatarMoedaRetorno(candidatoItem.valorGlosa)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {podeEditar ? (
              <Textarea
                value={justificativa}
                onChange={(evento) => onJustificativa(evento.target.value)}
                maxLength={200}
                placeholder="Justificativa da revisão (10 a 200 caracteres)"
                aria-label={`Justificativa da linha ${linha.posicao}`}
                disabled={processando}
                className="min-h-20"
              />
            ) : null}
            {ambigua && podeEditar ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!podeRevisarIndividual || processando}
                onClick={() => onRevisarIndividual(linha, candidatoId, justificativa.trim())}
              >
                {processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Aprovar candidato selecionado
              </Button>
            ) : null}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function rotuloHistorico(tipo: RetornoDetalheUi["historico"][number]["tipo"]): string {
  const rotulos = {
    aprovacao: "Vínculo aprovado",
    rebusca: "Busca de vínculos refeita",
    conflito: "Resposta divergente identificada",
    anexo_protocolo: "Comprovante de protocolo anexado",
  } as const;
  return rotulos[tipo];
}

export function RetornosRecursosDetalhe({
  aberto,
  onAbertoChange,
  detalhe,
  escopo,
  podeEditar,
  processando = false,
  onRebuscar,
  onRevisar,
  onArquivo,
  onAnexarProtocolo,
  onRegistrarPagamento,
  onEstornarPagamento,
  onExportarLote,
}: RetornosRecursosDetalheProps) {
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [justificativas, setJustificativas] = useState<Record<number, string>>({});
  const [confirmouDivergencias, setConfirmouDivergencias] = useState(false);
  const [dialogPagamento, setDialogPagamento] = useState(false);
  const [dialogEstorno, setDialogEstorno] = useState<number | null>(null);
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [pagamento, setPagamento] = useState({ valor: "", dataRecebimento: hojeCivil(), referencia: "", observacao: "" });
  const [estorno, setEstorno] = useState({ dataEstorno: hojeCivil(), justificativa: "" });
  const [chavePagamento, setChavePagamento] = useState("");
  const [chaveEstorno, setChaveEstorno] = useState("");

  const importacaoId = detalhe?.importacao.id ?? null;
  const sugestoesExatas = useMemo(() => linhasSugestaoExata(detalhe?.linhas ?? []), [detalhe?.linhas]);
  const temDivergencia = haDivergenciaCabecalho(detalhe?.importacao);
  const saldoAcatado = detalhe?.resumo.saldoAcatado ?? null;
  const vinculoAprovadoInvalido = haVinculoAprovadoInvalido(detalhe?.linhas ?? []);

  useEffect(() => {
    setSelecionadas(new Set());
    setJustificativas({});
    setConfirmouDivergencias(false);
    setArquivoPdf(null);
    setDialogPagamento(false);
    setDialogEstorno(null);
    setPagamento({ valor: "", dataRecebimento: hojeCivil(), referencia: "", observacao: "" });
    setEstorno({ dataEstorno: hojeCivil(), justificativa: "" });
    setChavePagamento("");
    setChaveEstorno("");
  }, [importacaoId, escopo?.estabelecimentoId, escopo?.convenioId]);

  if (!detalhe || !importacaoId) return null;

  const { importacao } = detalhe;
  const itensRevisao = montarItensRevisao(detalhe.linhas, selecionadas, justificativas);
  const podeConfirmarLote = podeEditar
    && itensRevisao.erro === null
    && itensRevisao.itens.length > 0
    && (!temDivergencia || confirmouDivergencias);
  const podeLancarPagamento = podeEditar
    && !vinculoAprovadoInvalido
    && valorDentroDoSaldo(pagamento.valor, saldoAcatado)
    && pagamento.dataRecebimento.length === 10
    && pagamento.referencia.trim().length >= 3
    && pagamento.observacao.trim().length >= 10;
  const pagamentosEstornados = new Set(
    detalhe.pagamentos.filter((evento) => evento.tipo === "estorno" && evento.pagamentoOrigemId !== null).map((evento) => evento.pagamentoOrigemId),
  );

  const atualizarMarcacao = (linhaId: number, marcada: boolean) => {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      if (marcada) proximas.add(linhaId);
      else proximas.delete(linhaId);
      return proximas;
    });
  };

  const atualizarJustificativa = (linhaId: number, valor: string) => {
    setJustificativas((atuais) => ({ ...atuais, [linhaId]: valor }));
  };

  const revisar = async (itens: RetornoRevisaoUi[]) => {
    if (!podeEditar) return;
    if (temDivergencia && !confirmouDivergencias) {
      toast.error("Confirme que revisou a divergência do cabeçalho antes de aprovar vínculos.");
      return;
    }
    await onRevisar({
      importacaoId,
      itens,
      confirmar: true,
      confirmarDivergenciasCabecalho: confirmouDivergencias,
    });
  };

  const anexarPdf = async () => {
    const erro = validarArquivoProtocoloPdf(arquivoPdf);
    if (erro || !arquivoPdf) {
      toast.error(erro ?? "Selecione o comprovante em PDF.");
      return;
    }
    try {
      const { conteudoBase64, bytes } = await lerArquivoBase64(arquivoPdf);
      if (!parecePdf(bytes)) {
        toast.error("O arquivo selecionado não possui a assinatura de um PDF válido.");
        return;
      }
      await onAnexarProtocolo({ importacaoId, nomeArquivo: arquivoPdf.name, conteudoBase64, confirmar: true });
      setArquivoPdf(null);
    } catch {
      toast.error("Não foi possível preparar o PDF para anexar.");
    }
  };

  const abrirPagamento = () => {
    setChavePagamento(novaChaveOperacao());
    setDialogPagamento(true);
  };

  const salvarPagamento = async () => {
    if (!podeLancarPagamento || !chavePagamento) {
      toast.error("Informe uma parcela dentro do saldo acatado, com data, referência e observação.");
      return;
    }
    await onRegistrarPagamento({
      importacaoId,
      ...pagamento,
      valor: pagamento.valor.trim(),
      referencia: pagamento.referencia.trim(),
      observacao: pagamento.observacao.trim(),
      chaveOperacao: chavePagamento,
      confirmar: true,
    });
    setDialogPagamento(false);
    setChavePagamento("");
  };

  const abrirEstorno = (pagamentoId: number) => {
    setChaveEstorno(novaChaveOperacao());
    setDialogEstorno(pagamentoId);
  };

  const confirmarEstorno = async () => {
    if (!dialogEstorno || !chaveEstorno || estorno.justificativa.trim().length < 10) {
      toast.error("Informe uma justificativa de estorno com pelo menos 10 caracteres.");
      return;
    }
    await onEstornarPagamento({
      importacaoId,
      pagamentoId: dialogEstorno,
      dataEstorno: estorno.dataEstorno,
      justificativa: estorno.justificativa.trim(),
      chaveOperacao: chaveEstorno,
      confirmar: true,
    });
    setDialogEstorno(null);
    setChaveEstorno("");
  };

  return (
    <>
      <Dialog open={aberto} onOpenChange={onAbertoChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 p-0 sm:w-[calc(100vw-2rem)] xl:max-w-7xl">
          <DialogHeader className="border-b px-5 py-4 pr-12 sm:px-6">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Retorno de recurso · {importacao.protocoloRecurso}
              <Badge variant="secondary">{importacao.origemRecurso === "externo" ? "Recurso externo" : "Lote preparado no Portal"}</Badge>
            </DialogTitle>
            <DialogDescription>
              Documento de resposta em {formatarDataRetorno(importacao.dataResposta)}. A decisão de vínculo e o recebimento financeiro são registros separados.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-9rem)] min-w-0 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Lote do recurso</p><p className="mt-1 font-medium break-words">{importacao.numeroLote}</p><p className="mt-1 text-xs text-muted-foreground">Protocolo: {importacao.protocoloRecurso}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Arquivo XML</p><p className="mt-1 font-medium break-words">{importacao.nomeArquivoXml}</p><p className="mt-1 text-xs text-muted-foreground">TISS {importacao.versaoTiss}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Guia do recurso</p><p className="mt-1 text-sm break-words">Prestador: {importacao.guiaRecursoPrestador}</p><p className="mt-1 text-sm break-words">Operadora: {importacao.guiaRecursoOperadora}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Datas do documento</p><p className="mt-1 text-sm"><span className="text-muted-foreground">Recurso:</span> {formatarDataRetorno(importacao.dataRecurso)}</p><p className="mt-1 text-sm"><span className="text-muted-foreground">Resposta:</span> {formatarDataRetorno(importacao.dataResposta)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Origem</p><p className="mt-1 font-medium">{importacao.origemRecurso === "externo" ? "Apresentado externamente" : "Lote do Portal"}</p>{importacao.lotePortalId ? <p className="mt-1 text-xs text-muted-foreground">Lote Portal #{importacao.lotePortalId}</p> : null}</CardContent></Card>
              </div>

              {temDivergencia ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0"><p className="font-semibold">Diferença entre cabeçalho e itens</p><p className="mt-1 text-sm">Os totais declarados no cabeçalho divergem da soma das linhas. A aprovação não corrige nem altera esses totais.</p>{importacao.alertas.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{importacao.alertas.map((alerta) => <li key={alerta}>{alerta}</li>)}</ul> : null}{podeEditar ? <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={confirmouDivergencias} onCheckedChange={(valor) => setConfirmouDivergencias(Boolean(valor))} disabled={processando} /><span>Revisei a divergência e confirmo que a aprovação dos vínculos abaixo não altera os totais do cabeçalho.</span></label> : null}</div></div>
                </div>
              ) : null}

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recursado (itens)</p><p className="mt-1 font-semibold text-orange-700">{formatarMoedaRetorno(detalhe.resumo.recursado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Acatado (itens)</p><p className="mt-1 font-semibold text-emerald-700">{formatarMoedaRetorno(detalhe.resumo.acatado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Acatado aprovado</p><p className="mt-1 font-semibold text-emerald-700">{formatarMoedaRetorno(detalhe.resumo.acatadoAprovado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recebido informado</p><p className="mt-1 font-semibold text-sky-700">{formatarMoedaRetorno(detalhe.resumo.recebidoInformado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saldo acatado</p><p className="mt-1 font-semibold">{formatarMoedaRetorno(detalhe.resumo.saldoAcatado)}</p></CardContent></Card>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void onArquivo({ importacaoId, tipo: "xml" })} disabled={processando}><Download className="mr-2 h-4 w-4" />Baixar XML original</Button>
                {importacao.nomeArquivoPdf ? <Button variant="outline" onClick={() => void onArquivo({ importacaoId, tipo: "protocolo_pdf" })} disabled={processando}><FileDown className="mr-2 h-4 w-4" />Abrir comprovante</Button> : null}
                {podeEditar ? <Button variant="outline" onClick={() => void onRebuscar(importacaoId)} disabled={processando}><RefreshCw className="mr-2 h-4 w-4" />Refazer busca de vínculos</Button> : null}
                {onExportarLote ? <Button variant="outline" onClick={() => void onExportarLote(detalhe)} disabled={processando}><FileSpreadsheet className="mr-2 h-4 w-4" />Exportar lote</Button> : null}
              </div>

              {podeEditar && !importacao.nomeArquivoPdf ? (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" />Comprovante do protocolo</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center"><Input type="file" accept="application/pdf,.pdf" onChange={(evento) => setArquivoPdf(evento.target.files?.[0] ?? null)} disabled={processando} /><Button variant="outline" onClick={() => void anexarPdf()} disabled={!arquivoPdf || processando}><Save className="mr-2 h-4 w-4" />Anexar PDF</Button><p className="text-xs text-muted-foreground">PDF até 5 MB; o comprovante permanece protegido e não gera URL pública.</p></CardContent>
                </Card>
              ) : null}

              <section className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">Revisão dos itens</h3><p className="text-sm text-muted-foreground">Somente sugestões exatas podem ser aprovadas em lote. Vínculos ambíguos exigem escolha humana entre os candidatos já compatíveis; sem vínculo e divergentes não são aprovados.</p></div>{podeEditar ? <Button disabled={!podeConfirmarLote || processando} onClick={() => void revisar(itensRevisao.itens)}>{processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar {selecionadas.size} sugestão(ões)</Button> : null}</div>
                {itensRevisao.erro && selecionadas.size > 0 ? <p className="text-sm text-rose-700">{itensRevisao.erro}</p> : null}
                <div className="w-full min-w-0 overflow-x-auto rounded-lg border">
                  <Table className="min-w-[1080px]"><TableHeader><TableRow><TableHead className="w-10" /><TableHead>Item no retorno</TableHead><TableHead>Procedimento</TableHead><TableHead className="text-right">Valores</TableHead><TableHead>Estado</TableHead><TableHead>Revisão humana</TableHead></TableRow></TableHeader><TableBody>{detalhe.linhas.map((linha) => <LinhaRetorno key={linha.id} linha={linha} podeEditar={podeEditar} marcada={selecionadas.has(linha.id)} justificativa={justificativas[linha.id] ?? ""} onMarcar={(marcada) => atualizarMarcacao(linha.id, marcada)} onJustificativa={(valor) => atualizarJustificativa(linha.id, valor)} onRevisarIndividual={(linhaIndividual, demonstrativoId, justificativa) => void revisar([{ linhaId: linhaIndividual.id, demonstrativoId, justificativa }])} processando={processando} />)}</TableBody></Table>
                </div>
                {sugestoesExatas.length === 0 ? <p className="text-sm text-muted-foreground">Não há sugestões exatas pendentes para aprovação em lote.</p> : null}
              </section>

              <section className="space-y-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Ledger de parcelas recebidas</h3><p className="text-sm text-muted-foreground">A decisão no retorno não prova crédito. Cada recebimento e estorno permanece como evento próprio no histórico financeiro.</p></div>{podeEditar ? <Button onClick={abrirPagamento} disabled={processando || detalhe.resumo.saldoAcatado === "0.00" || vinculoAprovadoInvalido}><WalletCards className="mr-2 h-4 w-4" />Registrar parcela</Button> : null}</div>{vinculoAprovadoInvalido ? <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Fonte do vínculo aprovado precisa de revisão</p><p className="mt-1">Um ou mais demonstrativos aprovados estão ausentes ou foram alterados. Novos recebimentos ficam bloqueados até a revisão da evidência. Os lançamentos e estornos já registrados permanecem no ledger.</p></div></div> : null}<div className="w-full min-w-0 overflow-x-auto rounded-lg border"><Table className="min-w-[820px]"><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Evento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Referência</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{detalhe.pagamentos.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sem lançamento de recebimento para este retorno.</TableCell></TableRow> : detalhe.pagamentos.map((evento) => <TableRow key={evento.id}><TableCell>{formatarDataRetorno(evento.dataEvento)}</TableCell><TableCell>{evento.tipo === "estorno" ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">Estorno</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Recebimento</Badge>}</TableCell><TableCell className="text-right tabular-nums">{evento.tipo === "estorno" ? "−" : "+"}{formatarMoedaRetorno(evento.valor)}</TableCell><TableCell>{evento.referencia || "—"}</TableCell><TableCell className="max-w-80 break-words">{evento.observacao || "—"}</TableCell><TableCell className="text-right">{podeEditar && evento.tipo === "recebimento" && !pagamentosEstornados.has(evento.id) ? <Button size="sm" variant="ghost" onClick={() => abrirEstorno(evento.id)} disabled={processando}><RotateCcw className="mr-1 h-4 w-4" />Estornar</Button> : null}</TableCell></TableRow>)}</TableBody></Table></div></section>

              {detalhe.historico.length > 0 ? <section><h3 className="mb-3 flex items-center gap-2 font-semibold"><History className="h-4 w-4" />Histórico de revisão</h3><div className="space-y-2">{detalhe.historico.map((evento) => <div key={evento.id} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{rotuloHistorico(evento.tipo)}</span><span className="text-muted-foreground">{formatarDataRetorno(evento.revisadoEm)}</span></div><p className="mt-1 text-xs text-muted-foreground break-words">{evento.justificativa}</p></div>)}</div></section> : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogPagamento} onOpenChange={(aberto) => { if (!aberto) { setDialogPagamento(false); setChavePagamento(""); } }}>
        <DialogContent><DialogHeader><DialogTitle>Registrar parcela recebida</DialogTitle><DialogDescription>Registro manual de caixa: o valor acatado no XML não é recebido automaticamente.</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-md bg-muted p-3 text-sm">Saldo acatado disponível: <strong>{formatarMoedaRetorno(saldoAcatado)}</strong></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label htmlFor="valor-parcela">Valor</Label><Input id="valor-parcela" inputMode="decimal" placeholder="0.00" value={pagamento.valor} onChange={(evento) => setPagamento((atual) => ({ ...atual, valor: evento.target.value.replace(",", ".") }))} /></div><div><Label htmlFor="data-parcela">Data do recebimento</Label><Input id="data-parcela" type="date" value={pagamento.dataRecebimento} onChange={(evento) => setPagamento((atual) => ({ ...atual, dataRecebimento: evento.target.value }))} /></div></div><div><Label htmlFor="referencia-parcela">Referência da evidência</Label><Input id="referencia-parcela" maxLength={150} value={pagamento.referencia} onChange={(evento) => setPagamento((atual) => ({ ...atual, referencia: evento.target.value }))} /></div><div><Label htmlFor="observacao-parcela">Observação</Label><Textarea id="observacao-parcela" maxLength={2000} value={pagamento.observacao} onChange={(evento) => setPagamento((atual) => ({ ...atual, observacao: evento.target.value }))} placeholder="Descreva a comprovação do crédito (mínimo 10 caracteres)." /></div></div><DialogFooter><Button variant="outline" onClick={() => { setDialogPagamento(false); setChavePagamento(""); }}>Cancelar</Button><Button onClick={() => void salvarPagamento()} disabled={!podeLancarPagamento || processando}>Confirmar lançamento</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={dialogEstorno !== null} onOpenChange={(aberto) => { if (!aberto) { setDialogEstorno(null); setChaveEstorno(""); } }}>
        <DialogContent><DialogHeader><DialogTitle>Estornar parcela</DialogTitle><DialogDescription>O estorno cria um evento compensatório; o recebimento original não será sobrescrito.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="data-estorno">Data do estorno</Label><Input id="data-estorno" type="date" value={estorno.dataEstorno} onChange={(evento) => setEstorno((atual) => ({ ...atual, dataEstorno: evento.target.value }))} /></div><div><Label htmlFor="justificativa-estorno">Justificativa</Label><Textarea id="justificativa-estorno" maxLength={2000} value={estorno.justificativa} onChange={(evento) => setEstorno((atual) => ({ ...atual, justificativa: evento.target.value }))} placeholder="Explique o estorno (mínimo 10 caracteres)." /></div></div><DialogFooter><Button variant="outline" onClick={() => { setDialogEstorno(null); setChaveEstorno(""); }}>Cancelar</Button><Button variant="destructive" onClick={() => void confirmarEstorno()} disabled={estorno.justificativa.trim().length < 10 || processando}>Confirmar estorno</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  );
}

export default RetornosRecursosDetalhe;
