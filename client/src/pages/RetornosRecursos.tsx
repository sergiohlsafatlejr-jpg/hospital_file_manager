import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, FileSpreadsheet, FileUp, Loader2, RefreshCw, Search, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import RetornosRecursosDetalhe, { type ArquivoRetornoTipo, type RevisarRetornoInput } from "@/components/recursos/RetornosRecursosDetalhe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { gerarExcelRetornos } from "@/lib/retornosRecursosExcel";
import {
  baixarBlob,
  base64ParaBlob,
  callbackAindaPertenceAoEscopo,
  escopoRetornoValido,
  formatarDataRetorno,
  formatarMoedaRetorno,
  mensagemErroRetorno,
  nomeArquivoSeguro,
  pareceXml,
  validarArquivoRetornoXml,
  type RetornoDetalheUi,
  type RetornoEscopoUi,
} from "@/lib/retornosRecursosUi";
import { trpc } from "@/lib/trpc";
import type { RetornoOrigem, RetornoPrevia } from "@shared/retornosRecursos";

const LIMITE_PAGINA = 20;

function lerXmlLocal(arquivo: File): Promise<{ conteudoBase64: string; texto: string }> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler o XML selecionado."));
    leitor.onload = () => {
      if (!(leitor.result instanceof ArrayBuffer)) {
        reject(new Error("Não foi possível ler o XML selecionado."));
        return;
      }
      const bytes = new Uint8Array(leitor.result);
      let binario = "";
      for (let indice = 0; indice < bytes.length; indice += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(indice, indice + 0x8000));
      }
      resolve({
        conteudoBase64: btoa(binario),
        texto: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      });
    };
    leitor.readAsArrayBuffer(arquivo);
  });
}

function ehCassi(convenio: { nome?: string | null; codigo?: string | null }): boolean {
  return `${convenio.nome ?? ""} ${convenio.codigo ?? ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("CASSI");
}

function rotuloOrigem(origem: RetornoOrigem): string {
  return origem === "externo" ? "Externo" : "Portal";
}

function blobExcel(bytes: Uint8Array): Blob {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  return new Blob([copia.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export default function RetornosRecursos() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const utils = trpc.useUtils();
  const [convenioId, setConvenioId] = useState<string>("");
  const [origemRecurso, setOrigemRecurso] = useState<RetornoOrigem>("externo");
  const [lotePortalId, setLotePortalId] = useState<string>("");
  const [arquivoXml, setArquivoXml] = useState<File | null>(null);
  const [conteudoBase64, setConteudoBase64] = useState<string>("");
  const [previa, setPrevia] = useState<RetornoPrevia | null>(null);
  const [confirmouImportacao, setConfirmouImportacao] = useState(false);
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const [importando, setImportando] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [pagina, setPagina] = useState(1);
  const [importacaoSelecionadaId, setImportacaoSelecionadaId] = useState<number | null>(null);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [processandoDetalhe, setProcessandoDetalhe] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const escopoRef = useRef<RetornoEscopoUi | null>(null);

  const estabelecimentoId = estabelecimentoAtual?.id ?? 0;
  const convenioSelecionadoId = Number(convenioId);
  const escopo = useMemo<RetornoEscopoUi | null>(() => (
    Number.isInteger(estabelecimentoId)
    && estabelecimentoId > 0
    && Number.isInteger(convenioSelecionadoId)
    && convenioSelecionadoId > 0
      ? { estabelecimentoId, convenioId: convenioSelecionadoId }
      : null
  ), [estabelecimentoId, convenioSelecionadoId]);

  const { data: convenios, isLoading: carregandoConvenios } = trpc.convenios.list.useQuery(
    { ativo: "sim", estabelecimentoId },
    { enabled: estabelecimentoId > 0 && !visualizandoTodos },
  );
  const conveniosCassi = useMemo(() => (convenios ?? []).filter(ehCassi), [convenios]);
  const convenioSelecionado = conveniosCassi.find((convenio) => convenio.id === convenioSelecionadoId) ?? null;

  const lotesPortalQuery = trpc.recursos.listarLotes.useQuery(
    { estabelecimentoId, convenioId: convenioSelecionadoId, page: 1, limit: 50 },
    { enabled: Boolean(escopo) && origemRecurso === "portal" },
  );
  const lotesPortal = lotesPortalQuery.data?.lotes ?? [];

  const listaInput = useMemo(() => ({
    estabelecimentoId: escopo?.estabelecimentoId ?? 1,
    convenioId: escopo?.convenioId ?? 1,
    inicio: inicio || undefined,
    fim: fim || undefined,
    pagina,
    limite: LIMITE_PAGINA,
  }), [escopo, inicio, fim, pagina]);
  const listaQuery = trpc.retornosRecursos.listar.useQuery(listaInput, { enabled: Boolean(escopo) });

  const detalheInput = useMemo(() => ({
    estabelecimentoId: escopo?.estabelecimentoId ?? 1,
    convenioId: escopo?.convenioId ?? 1,
    importacaoId: importacaoSelecionadaId ?? 1,
  }), [escopo, importacaoSelecionadaId]);
  const detalheQuery = trpc.retornosRecursos.detalhe.useQuery(detalheInput, {
    enabled: Boolean(escopo) && importacaoSelecionadaId !== null && detalheAberto,
  });

  const preverMutation = trpc.retornosRecursos.prever.useMutation();
  const importarMutation = trpc.retornosRecursos.importar.useMutation();
  const rebuscarMutation = trpc.retornosRecursos.rebuscar.useMutation();
  const revisarMutation = trpc.retornosRecursos.revisar.useMutation();
  const anexarProtocoloMutation = trpc.retornosRecursos.anexarProtocolo.useMutation();
  const arquivoMutation = trpc.retornosRecursos.arquivo.useMutation();
  const registrarPagamentoMutation = trpc.retornosRecursos.registrarPagamento.useMutation();
  const estornarPagamentoMutation = trpc.retornosRecursos.estornarPagamento.useMutation();

  const limparImportacao = () => {
    setOrigemRecurso("externo");
    setLotePortalId("");
    setArquivoXml(null);
    setConteudoBase64("");
    setPrevia(null);
    setConfirmouImportacao(false);
    if (inputArquivoRef.current) inputArquivoRef.current.value = "";
  };

  useEffect(() => {
    escopoRef.current = escopo;
    limparImportacao();
    setInicio("");
    setFim("");
    setPagina(1);
    setImportacaoSelecionadaId(null);
    setDetalheAberto(false);
    setProcessandoDetalhe(false);
  }, [escopo?.estabelecimentoId, escopo?.convenioId]);

  useEffect(() => {
    if (convenioId && conveniosCassi.some((convenio) => convenio.id === Number(convenioId))) return;
    setConvenioId("");
  }, [convenioId, conveniosCassi]);

  useEffect(() => {
    setPagina(1);
  }, [inicio, fim, convenioId]);

  const podeOperar = escopoRetornoValido(escopo) && !visualizandoTodos;
  const periodoInvalido = Boolean(inicio && fim && inicio > fim);
  const totalPaginas = Math.max(1, Math.ceil((listaQuery.data?.total ?? 0) / LIMITE_PAGINA));

  const tratarSelecaoArquivo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0] ?? null;
    setPrevia(null);
    setConfirmouImportacao(false);
    setConteudoBase64("");
    setArquivoXml(null);
    if (!arquivo) return;
    const erro = validarArquivoRetornoXml(arquivo);
    if (erro) {
      toast.error(erro);
      evento.target.value = "";
      return;
    }
    try {
      const dados = await lerXmlLocal(arquivo);
      if (!pareceXml(dados.texto)) {
        toast.error("O arquivo selecionado não parece ser um XML válido.");
        evento.target.value = "";
        return;
      }
      setArquivoXml(arquivo);
      setConteudoBase64(dados.conteudoBase64);
    } catch {
      toast.error("Não foi possível preparar o XML localmente.");
      evento.target.value = "";
    }
  };

  const gerarPrevia = async () => {
    if (!escopo || !arquivoXml || !conteudoBase64) {
      toast.error("Selecione unidade, convênio CASSI e um XML antes de gerar a prévia.");
      return;
    }
    const erro = validarArquivoRetornoXml(arquivoXml);
    if (erro) {
      toast.error(erro);
      return;
    }
    const escopoCapturado = escopo;
    setGerandoPrevia(true);
    try {
      const resultado = await preverMutation.mutateAsync({ ...escopoCapturado, conteudoBase64 });
      if (!callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) return;
      setPrevia(resultado);
      setConfirmouImportacao(false);
      toast.success("Prévia gerada. Revise metadados e contagens antes de confirmar.");
    } catch (erroPrevia) {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) {
        toast.error(mensagemErroRetorno(erroPrevia, "gerar a prévia"));
      }
    } finally {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) setGerandoPrevia(false);
    }
  };

  const abrirImportacaoExistente = () => {
    if (!previa?.importacaoId) return;
    setImportacaoSelecionadaId(previa.importacaoId);
    setDetalheAberto(true);
  };

  const importar = async () => {
    if (!escopo || !arquivoXml || !conteudoBase64 || !previa || !confirmouImportacao) {
      toast.error("Gere a prévia e confirme a importação antes de continuar.");
      return;
    }
    if (origemRecurso === "portal" && !lotePortalId) {
      toast.error("Selecione o lote preparado no Portal.");
      return;
    }
    if (!previa.armazenamentoPronto) {
      toast.error("Configuração pendente para os retornos de recursos.");
      return;
    }
    const escopoCapturado = escopo;
    setImportando(true);
    try {
      const resultado = await importarMutation.mutateAsync({
        ...escopoCapturado,
        conteudoBase64,
        nomeArquivo: arquivoXml.name,
        origemRecurso,
        lotePortalId: origemRecurso === "portal" ? Number(lotePortalId) : undefined,
        tokenPrevia: previa.tokenPrevia,
        confirmar: true,
      });
      if (!callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) return;
      toast.success(resultado.jaImportado ? "Esta resposta já estava importada; o histórico foi aberto." : "Resposta importada para revisão.");
      limparImportacao();
      setImportacaoSelecionadaId(resultado.importacaoId);
      setDetalheAberto(true);
      await utils.retornosRecursos.listar.invalidate();
      await utils.retornosRecursos.detalhe.invalidate();
    } catch (erroImportacao) {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) {
        toast.error(mensagemErroRetorno(erroImportacao, "importar a resposta"));
      }
    } finally {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) setImportando(false);
    }
  };

  const executarDetalhe = async (acao: string, operacao: () => Promise<void>) => {
    const escopoCapturado = escopo;
    if (!escopoCapturado) return;
    setProcessandoDetalhe(true);
    try {
      await operacao();
      if (!callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) return;
      await utils.retornosRecursos.detalhe.invalidate();
      await utils.retornosRecursos.listar.invalidate();
      toast.success(acao);
    } catch (erroDetalhe) {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) {
        toast.error(mensagemErroRetorno(erroDetalhe, acao.toLowerCase()));
      }
    } finally {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) setProcessandoDetalhe(false);
    }
  };

  const onRebuscar = async (importacaoId: number) => executarDetalhe("Busca de vínculos atualizada.", async () => {
    if (!escopo) return;
    await rebuscarMutation.mutateAsync({ ...escopo, importacaoId });
  });

  const onRevisar = async (input: RevisarRetornoInput) => executarDetalhe("Revisão registrada.", async () => {
    if (!escopo) return;
    await revisarMutation.mutateAsync({ ...escopo, ...input });
  });

  const onAnexarProtocolo = async (input: { importacaoId: number; nomeArquivo: string; conteudoBase64: string; confirmar: true }) => executarDetalhe("Comprovante anexado.", async () => {
    if (!escopo) return;
    await anexarProtocoloMutation.mutateAsync({ ...escopo, ...input });
  });

  const onRegistrarPagamento = async (input: { importacaoId: number; valor: string; dataRecebimento: string; referencia: string; observacao: string; chaveOperacao: string; confirmar: true }) => executarDetalhe("Parcela recebida registrada.", async () => {
    if (!escopo) return;
    await registrarPagamentoMutation.mutateAsync({ ...escopo, ...input });
  });

  const onEstornarPagamento = async (input: { importacaoId: number; pagamentoId: number; dataEstorno: string; justificativa: string; chaveOperacao: string; confirmar: true }) => executarDetalhe("Estorno registrado no ledger.", async () => {
    if (!escopo) return;
    await estornarPagamentoMutation.mutateAsync({ ...escopo, ...input });
  });

  const onArquivo = async (input: { importacaoId: number; tipo: ArquivoRetornoTipo }) => {
    const escopoCapturado = escopo;
    if (!escopoCapturado) return;
    setProcessandoDetalhe(true);
    try {
      const resultado = await arquivoMutation.mutateAsync({ ...escopoCapturado, ...input });
      if (!callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) return;
      baixarBlob(base64ParaBlob(resultado.conteudoBase64, resultado.mime), resultado.nomeArquivo);
    } catch (erroArquivo) {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) {
        toast.error(mensagemErroRetorno(erroArquivo, "baixar o arquivo"));
      }
    } finally {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) setProcessandoDetalhe(false);
    }
  };

  const onExportarLote = async (detalhe: RetornoDetalheUi) => {
    const escopoCapturado = escopo;
    if (!escopoCapturado) return;
    setProcessandoDetalhe(true);
    try {
      const excel = await gerarExcelRetornos([{
        ...detalhe,
        estabelecimentoNome: estabelecimentoAtual?.nome ?? null,
        convenioNome: convenioSelecionado?.nome ?? null,
      }], { inicio: inicio || undefined, fim: fim || undefined });
      if (!callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) return;
      baixarBlob(
        blobExcel(excel.bytes),
        nomeArquivoSeguro(`lote-${detalhe.importacao.numeroLote}-${excel.nomeArquivo}`, excel.nomeArquivo),
      );
      toast.success("Excel do lote gerado localmente.");
    } catch (erroExcel) {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) {
        toast.error(mensagemErroRetorno(erroExcel, "exportar o lote"));
      }
    } finally {
      if (callbackAindaPertenceAoEscopo(escopoCapturado, escopoRef.current)) setProcessandoDetalhe(false);
    }
  };

  const abrirDetalhe = (importacaoId: number) => {
    setImportacaoSelecionadaId(importacaoId);
    setDetalheAberto(true);
  };

  if (visualizandoTodos || estabelecimentoId <= 0) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div><h1 className="text-2xl font-bold">Retornos de Recursos CASSI</h1><p className="text-muted-foreground">Importação e revisão de respostas de recursos.</p></div>
          <Card><CardContent className="flex gap-3 p-6 text-sm text-muted-foreground"><ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" /><span>Selecione uma unidade específica para consultar ou importar retornos. Esta tela não opera no contexto de todos os estabelecimentos.</span></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Retornos de Recursos CASSI</h1>
            <p className="text-muted-foreground">Importe a resposta XML, revise vínculos e registre recebimentos em ledger separado.</p>
          </div>
          <Badge variant="outline" className="w-fit">Unidade: {estabelecimentoAtual?.nome}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" />Importar resposta CASSI</CardTitle><CardDescription>A prévia lê o XML no navegador e envia apenas o conteúdo para validação. Ela não registra pagamento, aceite nem altera demonstrativos.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2"><Label htmlFor="convenio-cassi">Convênio CASSI</Label><Select value={convenioId} onValueChange={setConvenioId} disabled={carregandoConvenios}><SelectTrigger id="convenio-cassi"><SelectValue placeholder={carregandoConvenios ? "Carregando..." : "Selecione o convênio"} /></SelectTrigger><SelectContent>{conveniosCassi.map((convenio) => <SelectItem key={convenio.id} value={String(convenio.id)}>{convenio.nome}{convenio.codigo ? ` (${convenio.codigo})` : ""}</SelectItem>)}</SelectContent></Select>{!carregandoConvenios && conveniosCassi.length === 0 ? <p className="text-xs text-amber-700">Nenhum convênio CASSI ativo foi encontrado para esta unidade.</p> : null}</div>
              <div className="space-y-2"><Label htmlFor="origem-recurso">Origem do recurso</Label><Select value={origemRecurso} onValueChange={(valor: RetornoOrigem) => { setOrigemRecurso(valor); setLotePortalId(""); }}><SelectTrigger id="origem-recurso"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="externo">Apresentado externamente</SelectItem><SelectItem value="portal">Lote preparado no Portal</SelectItem></SelectContent></Select></div>
              {origemRecurso === "portal" ? <div className="space-y-2 xl:col-span-2"><Label htmlFor="lote-portal">Lote preparado no Portal</Label><Select value={lotePortalId} onValueChange={setLotePortalId} disabled={!escopo || lotesPortalQuery.isLoading}><SelectTrigger id="lote-portal"><SelectValue placeholder={lotesPortalQuery.isLoading ? "Carregando lotes..." : "Selecione o lote"} /></SelectTrigger><SelectContent>{lotesPortal.map((lote) => <SelectItem key={lote.id} value={String(lote.id)}>Lote {lote.numeroLote} · {lote.status}</SelectItem>)}</SelectContent></Select>{escopo && !lotesPortalQuery.isLoading && lotesPortal.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum lote foi encontrado para este convênio.</p> : null}</div> : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-2"><Label htmlFor="xml-resposta">XML de resposta</Label><Input ref={inputArquivoRef} id="xml-resposta" type="file" accept="application/xml,text/xml,.xml" onChange={(evento) => void tratarSelecaoArquivo(evento)} disabled={!podeOperar || gerandoPrevia || importando} /><p className="text-xs text-muted-foreground">XML CASSI até 2 MB e até 2.000 linhas. O arquivo original será guardado somente após confirmação.</p></div>
              <Button variant="outline" onClick={() => void gerarPrevia()} disabled={!podeOperar || !arquivoXml || !conteudoBase64 || gerandoPrevia || importando}>{gerandoPrevia ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Gerar prévia</Button>
            </div>

            {previa ? <div className="space-y-4 rounded-lg border bg-muted/20 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">Prévia do documento</h3><p className="text-sm text-muted-foreground">Dados do cabeçalho e contagens; nenhum valor é apresentado como pagamento.</p></div>{previa.jaImportado ? <Badge variant="secondary">Documento já importado</Badge> : previa.armazenamentoPronto ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Pronto para confirmação</Badge> : <Badge variant="outline" className="border-amber-300 text-amber-800">Configuração pendente</Badge>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div><p className="text-xs text-muted-foreground">Lote</p><p className="font-medium break-words">{previa.documento.numeroLote}</p></div><div><p className="text-xs text-muted-foreground">Protocolo do recurso</p><p className="font-medium break-words">{previa.documento.protocoloRecurso}</p></div><div><p className="text-xs text-muted-foreground">Data do recurso</p><p className="font-medium">{formatarDataRetorno(previa.documento.dataRecurso)}</p></div><div><p className="text-xs text-muted-foreground">Documento de resposta</p><p className="font-medium">{formatarDataRetorno(previa.documento.dataResposta)}</p></div><div><p className="text-xs text-muted-foreground">Itens</p><p className="font-medium">{previa.totalItens}</p></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-md bg-sky-50 p-3 text-sky-900"><p className="text-xs">Sugestões exatas</p><p className="text-lg font-semibold">{previa.contagens.sugerido}</p></div><div className="rounded-md bg-amber-50 p-3 text-amber-900"><p className="text-xs">Ambíguos</p><p className="text-lg font-semibold">{previa.contagens.ambiguo}</p></div><div className="rounded-md bg-slate-100 p-3 text-slate-800"><p className="text-xs">Sem vínculo</p><p className="text-lg font-semibold">{previa.contagens.sem_vinculo}</p></div><div className="rounded-md bg-rose-50 p-3 text-rose-900"><p className="text-xs">Divergentes</p><p className="text-lg font-semibold">{previa.contagens.divergente}</p></div></div>{previa.documento.alertas.length > 0 ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">Alertas do documento</p><ul className="mt-1 list-disc pl-5">{previa.documento.alertas.map((alerta) => <li key={alerta}>{alerta}</li>)}</ul></div> : null}{previa.jaImportado && previa.importacaoId ? <Button variant="outline" onClick={abrirImportacaoExistente}>Abrir resposta já importada</Button> : <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={confirmouImportacao} onCheckedChange={(valor) => setConfirmouImportacao(Boolean(valor))} disabled={!previa.armazenamentoPronto || importando} /><span>Confirmo que revisei a prévia e desejo registrar esta resposta para revisão. Isso não confirma recebimento financeiro.</span></label><Button onClick={() => void importar()} disabled={!confirmouImportacao || !previa.armazenamentoPronto || importando || (origemRecurso === "portal" && !lotePortalId)}>{importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Importar para revisão</Button></div>}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5" />Histórico de respostas</CardTitle><CardDescription>Filtro aplicado pela data do documento de resposta (`dataRegistroTransacao`), não pela data de pagamento ou do recurso original.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label htmlFor="inicio-resposta">Início — data do documento de resposta</Label><Input id="inicio-resposta" type="date" value={inicio} onChange={(evento) => setInicio(evento.target.value)} /></div><div className="space-y-2"><Label htmlFor="fim-resposta">Fim — data do documento de resposta</Label><Input id="fim-resposta" type="date" value={fim} onChange={(evento) => setFim(evento.target.value)} /></div><div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => { setInicio(""); setFim(""); setPagina(1); }} disabled={!inicio && !fim}>Limpar período</Button></div></div>{periodoInvalido ? <p className="text-sm text-rose-700">A data inicial deve ser anterior ou igual à data final.</p> : null}{listaQuery.isLoading ? <div className="space-y-2">{[1, 2, 3].map((indice) => <Skeleton key={indice} className="h-16 w-full" />)}</div> : listaQuery.data?.configuracaoPendente ? <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Configuração pendente para os retornos de recursos.</div> : listaQuery.isError ? <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{mensagemErroRetorno(listaQuery.error, "carregar o histórico")}</div> : (listaQuery.data?.registros.length ?? 0) === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma resposta encontrada para o escopo e período selecionados.</div> : <><div className="w-full overflow-x-auto rounded-lg border"><Table className="min-w-[920px]"><TableHeader><TableRow><TableHead>Resposta</TableHead><TableHead>Lote / protocolo</TableHead><TableHead>Origem</TableHead><TableHead>Itens</TableHead><TableHead>Revisões</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>{listaQuery.data?.registros.map((registro) => <TableRow key={registro.id}><TableCell><div className="font-medium">{formatarDataRetorno(registro.dataResposta)}</div><div className="text-xs text-muted-foreground">Recurso: {formatarDataRetorno(registro.dataRecurso)}</div></TableCell><TableCell><div className="font-medium break-words">{registro.numeroLote}</div><div className="text-xs text-muted-foreground break-words">{registro.protocoloRecurso}</div></TableCell><TableCell><Badge variant="outline">{rotuloOrigem(registro.origemRecurso)}</Badge></TableCell><TableCell>{registro.totalItens}</TableCell><TableCell>{registro.aprovacoes} aprovado(s)</TableCell><TableCell>{registro.cabecalhoDivergente === "sim" ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Cabeçalho divergente</Badge> : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">Sem divergência</Badge>}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => abrirDetalhe(registro.id)}>Abrir</Button></TableCell></TableRow>)}</TableBody></Table></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">{listaQuery.data?.total ?? 0} resposta(s) · Página {pagina} de {totalPaginas}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagina <= 1 || listaQuery.isFetching} onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>Anterior</Button><Button variant="outline" size="sm" disabled={pagina >= totalPaginas || listaQuery.isFetching} onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}>Próxima</Button><Button variant="ghost" size="sm" disabled={listaQuery.isFetching} onClick={() => void listaQuery.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Atualizar</Button></div></div></>}</CardContent>
        </Card>
      </div>

      <RetornosRecursosDetalhe
        aberto={detalheAberto}
        onAbertoChange={(aberto) => { setDetalheAberto(aberto); if (!aberto) setImportacaoSelecionadaId(null); }}
        detalhe={detalheQuery.data ?? null}
        escopo={escopo}
        podeEditar={podeOperar}
        processando={processandoDetalhe || detalheQuery.isFetching}
        onRebuscar={onRebuscar}
        onRevisar={onRevisar}
        onArquivo={onArquivo}
        onAnexarProtocolo={onAnexarProtocolo}
        onRegistrarPagamento={onRegistrarPagamento}
        onEstornarPagamento={onEstornarPagamento}
        onExportarLote={onExportarLote}
      />
    </DashboardLayout>
  );
}
