import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import { formatDateBR } from "@/lib/dateUtils";
import { Building2, Search, Plus, Pencil, Trash2, FileText, AlertTriangle, Eye, UploadCloud, Mail, Loader2, CheckCircle2, FileSearch, Download, FileWarning, Sparkles, BookOpen, FileCode2, Gavel } from "lucide-react";
import { adicionarPdfsAoLote, batchIdContratosPdf, chaveArquivoContrato, exigirIdNovoContrato, uploadContratoPdf, validarLoteContratosPdf, type UploadProgress, type UploadResult } from "@/lib/contratosUploadChunks";
import { ContratoDossieModal } from "@/components/ContratoDossieModal";

const STATUS_CONFIG = {
  ativo: { label: "Ativo", color: "bg-green-500" },
  vencendo: { label: "Vencendo", color: "bg-amber-500" },
  vencido: { label: "Vencido", color: "bg-red-500" },
  inativo: { label: "Inativo", color: "bg-gray-500" },
  renovado: { label: "Renovado", color: "bg-blue-500" },
};

const DOCUMENTO_STATUS_CONFIG = {
  concluido: { label: "Leitura concluída", color: "bg-green-600" },
  ocr_necessario: { label: "OCR necessário", color: "bg-amber-600" },
  processando: { label: "Processando", color: "bg-blue-600" },
  erro: { label: "Erro", color: "bg-red-600" },
};

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ContratosConvenios() {
  const [modalAberto, setModalAberto] = useState(false);
  const [contratoEditando, setContratoEditando] = useState<any>(null);
  const [busca, setBusca] = useState("");
  const [convenioSelecionado, setConvenioSelecionado] = useState<string>("");
  const [statusSelecionado, setStatusSelecionado] = useState<string>("ativo");
  const [documentosModalAberto, setDocumentosModalAberto] = useState(false);
  const [documentosContratoId, setDocumentosContratoId] = useState<number | null>(null);
  const [novoConvenioIdModal, setNovoConvenioIdModal] = useState<string>("");
  const [novoNumeroContratoModal, setNovoNumeroContratoModal] = useState<string>("");
  const [documentoDetalheId, setDocumentoDetalheId] = useState<number | null>(null);
  const [dossieModalAberto, setDossieModalAberto] = useState(false);
  const [dossieContratoId, setDossieContratoId] = useState<number | null>(null);
  const [dossieAbaInicial, setDossieAbaInicial] = useState<string>("resumo");
  const [arquivosPdf, setArquivosPdf] = useState<File[]>([]);
  const [arrastandoPdf, setArrastandoPdf] = useState(false);
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<UploadResult | null>(null);
  const [progressoPdf, setProgressoPdf] = useState<Record<string, UploadProgress>>({});
  const [criacaoContratoIncerta, setCriacaoContratoIncerta] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const arquivoInputRef = useRef<HTMLInputElement>(null);
  
  const utils = trpc.useUtils();
  const convenios = trpc.convenios.list.useQuery({}); 
  const { estabelecimentoAtual, estabelecimentos } = useEstabelecimento();
  
  // Se "Todos os estabelecimentos" (id 0) estiver selecionado, pode-se usar undefined para o query ou forçar o padrão nas criações
  const estabelecimentoIdFiltro = estabelecimentoAtual?.id === 0 ? undefined : estabelecimentoAtual?.id;
  const estabelecimentoIdMutacao = estabelecimentoAtual?.id === 0 ? estabelecimentos?.[0]?.id : estabelecimentoAtual?.id;
  const dossieEscopoAtual = JSON.stringify([estabelecimentoAtual?.id, busca, convenioSelecionado, statusSelecionado]);
  const [dossieEscopoOrigem, setDossieEscopoOrigem] = useState<string | null>(null);
  useEffect(() => {
    setDossieModalAberto(false);
    setDossieContratoId(null);
    setDossieEscopoOrigem(null);
  }, [dossieEscopoAtual]);

  useEffect(() => {
    setDocumentosContratoId(null);
    setResultadoImportacao(null);
    setProgressoPdf({});
    return () => uploadAbortRef.current?.abort();
  }, [estabelecimentoAtual?.id]);

  const contratos = trpc.contratosConvenios.listar.useQuery({ estabelecimentoId: estabelecimentoIdFiltro }, {
    enabled: !!estabelecimentoIdFiltro || estabelecimentoAtual?.id === 0,
  });
  const contratoIds = useMemo(() => (contratos.data ?? []).map(contrato => contrato.id), [contratos.data]);
  const resumoDocumentos = trpc.contratosConvenios.resumoDocumentos.useQuery({ contratoIds }, {
    enabled: contratoIds.length > 0,
    retry: false,
  });
  const documentos = trpc.contratosConvenios.listarDocumentos.useQuery(
    { contratoId: documentosContratoId ?? 0 },
    { enabled: documentosModalAberto && documentosContratoId !== null, retry: false },
  );
  const documentoDetalhe = trpc.contratosConvenios.obterDocumento.useQuery(
    { id: documentoDetalheId ?? 0 },
    { enabled: documentoDetalheId !== null, retry: false },
  );
  
  const criar = trpc.contratosConvenios.criar.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato cadastrado!");
      setModalAberto(false);
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
      console.error(error);
    }
  });

  const atualizar = trpc.contratosConvenios.atualizar.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato atualizado!");
      setModalAberto(false);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
      console.error(error);
    }
  });

  const excluir = trpc.contratosConvenios.excluir.useMutation({
    onSuccess: () => {
      utils.contratosConvenios.invalidate();
      toast.success("Contrato excluído!");
    }
  });

  const excluirDocumento = trpc.contratosConvenios.excluirDocumento.useMutation({
    onSuccess: () => {
      if (documentosContratoId) {
        utils.contratosConvenios.listarDocumentos.invalidate({ contratoId: documentosContratoId });
      }
      utils.contratosConvenios.resumoDocumentos.invalidate();
      toast.success("Documento PDF removido!");
    },
    onError: (error) => {
      toast.error(`Erro ao remover PDF: ${error.message}`);
    },
  });

  const reanalisarIA = trpc.contratosConvenios.reanalisarDocumentoIA.useMutation({
    onSuccess: (res: any) => {
      if (documentoDetalheId) {
        utils.contratosConvenios.obterDocumento.invalidate({ id: documentoDetalheId });
      }
      if (documentosContratoId) {
        utils.contratosConvenios.listarDocumentos.invalidate({ contratoId: documentosContratoId });
        utils.contratosConvenios.obterDossie.invalidate({ contratoId: documentosContratoId });
      } else {
        utils.contratosConvenios.obterDossie.invalidate();
      }
      if (res?.ocrExecutado) {
        toast.success("OCR concluído com IA! Texto, cláusulas e tabelas extraídos do PDF digitalizado.");
      } else if (res?.status === "ocr_necessario") {
        toast.warning("Não foi possível extrair texto suficiente deste PDF digitalizado no momento.");
      } else {
        toast.success("Cláusulas de glosa, tabelas e prazos extraídas com IA!");
      }
    },
    onError: (error) => {
      toast.error(`Erro na análise IA: ${error.message}`);
    },
  });

  const executarOcrContrato = trpc.contratosConvenios.executarOcrContrato.useMutation({
    onSuccess: (res) => {
      if (documentosContratoId) {
        utils.contratosConvenios.listarDocumentos.invalidate({ contratoId: documentosContratoId });
        utils.contratosConvenios.obterDossie.invalidate({ contratoId: documentosContratoId });
      }
      if (res.concluidos > 0) {
        toast.success(`OCR concluído em ${res.concluidos} de ${res.totalPendentesOcr} PDF(s) digitalizado(s)!`);
      } else if (res.totalPendentesOcr === 0) {
        toast.info("Todos os PDFs deste contrato já possuem leitura concluída.");
      } else {
        toast.warning(`Não foi possível concluir o OCR automático nos ${res.permanecemOcr} PDF(s) pendente(s).`);
      }
    },
    onError: (error) => {
      toast.error(`Erro ao executar OCR: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!estabelecimentoIdMutacao) {
      toast.error("Nenhum estabelecimento válido selecionado.");
      return;
    }
    const formData = new FormData(e.currentTarget);

    if (!convenioSelecionado) {
      toast.error("Selecione um Convênio/Operadora!");
      return;
    }

    const data = {
      estabelecimentoId: estabelecimentoIdMutacao,
      convenioId: Number(convenioSelecionado),
      numeroContrato: (formData.get("numeroContrato") as string) || undefined,
      dataInicio: (formData.get("dataInicio") as string) || undefined,
      dataFim: (formData.get("dataFim") as string) || undefined,
      observacoes: (formData.get("observacoes") as string) || undefined,
      emailContato: (formData.get("emailContato") as string) || undefined,
      reajusteProposto: formData.get("reajusteProposto") ? Number(formData.get("reajusteProposto")) : undefined,
      modeloEmailProposta: (formData.get("modeloEmailProposta") as string) || undefined,
      dataEnvioProposta: (formData.get("dataEnvioProposta") as string) || undefined,
      status: statusSelecionado as any,
    };

    if (contratoEditando) {
      atualizar.mutate({ id: contratoEditando.id, ...data });
    } else {
      criar.mutate(data);
    }
  };

  const getConvenioNome = (id: number) => {
    return convenios.data?.find((c: any) => c.id === id)?.nome || "Desconhecido";
  };

  const adicionarArquivosPdf = (arquivos: FileList | File[]) => {
    if (uploadAbortRef.current) return;
    const { files, rejected } = adicionarPdfsAoLote(arquivosPdf, Array.from(arquivos));
    setArquivosPdf(files);
    rejected.forEach(message => toast.warning(message));
  };

  const abrirDocumentos = (contratoId: number) => {
    if (uploadAbortRef.current) return;
    setDocumentosContratoId(contratoId);
    setDocumentoDetalheId(null);
    setResultadoImportacao(null);
    setProgressoPdf({});
    setArquivosPdf([]);
    setDocumentosModalAberto(true);
  };

  const abrirDossie = (contratoId: number, aba = "resumo") => {
    setDossieContratoId(contratoId);
    setDossieAbaInicial(aba);
    setDossieEscopoOrigem(dossieEscopoAtual);
    setDossieModalAberto(true);
  };

  const quantidadeDocumentos = (contratoId: number) => {
    return resumoDocumentos.data?.find((item) => item.contratoId === contratoId)?.quantidade ?? 0;
  };

  const importarPdfs = async () => {
    if (uploadAbortRef.current) return;
    let totalBytes: number;
    try {
      totalBytes = validarLoteContratosPdf(arquivosPdf);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lote inválido.");
      return;
    }
    if (!documentosContratoId && (!novoConvenioIdModal || !estabelecimentoIdMutacao)) {
      toast.error("Selecione um contrato existente ou um estabelecimento e convênio válidos.");
      return;
    }
    if (!documentosContratoId && criacaoContratoIncerta) {
      toast.error("A criação anterior ficou incerta. Selecione explicitamente o contrato existente; não criaremos outro às cegas.");
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setImportandoPdf(true);
    setResultadoImportacao(null);
    const documentosConsolidados: UploadResult["documentos"] = [];
    let totalProcessados = 0;
    try {
      let contratoIdAlvo = documentosContratoId;
      if (!contratoIdAlvo) {
        // A missing/uncertain mutation response must never select the first list row.
        setCriacaoContratoIncerta(true);
        const novoContrato = await criar.mutateAsync({
          estabelecimentoId: estabelecimentoIdMutacao!,
          convenioId: Number(novoConvenioIdModal),
          numeroContrato: novoNumeroContratoModal.trim() || undefined,
          status: "ativo",
        });
        contratoIdAlvo = exigirIdNovoContrato(novoContrato);
        if (controller.signal.aborted) throw new DOMException("Envio pausado.", "AbortError");
        setDocumentosContratoId(contratoIdAlvo);
        setCriacaoContratoIncerta(false);
      }
      const batchId = batchIdContratosPdf(contratoIdAlvo, arquivosPdf);
      for (const arquivo of arquivosPdf) {
        const itemPayload = await uploadContratoPdf(arquivo, {
          contratoId: contratoIdAlvo, batchId, batchTotalBytes: totalBytes,
          signal: controller.signal, storage: window.sessionStorage,
          onProgress: progress => setProgressoPdf(current => ({ ...current, [chaveArquivoContrato(arquivo)]: progress })),
        });
        totalProcessados += itemPayload.processados;
        documentosConsolidados.push(...itemPayload.documentos);
        setResultadoImportacao({ processados: totalProcessados, documentos: [...documentosConsolidados] });
      }
      setArquivosPdf([]);
      await Promise.all([
        utils.contratosConvenios.listar.invalidate(),
        utils.contratosConvenios.listarDocumentos.invalidate({ contratoId: contratoIdAlvo }),
        utils.contratosConvenios.resumoDocumentos.invalidate(),
      ]);
      const lidos = documentosConsolidados.filter(item => item.status === "concluido").length;
      const ocr = documentosConsolidados.filter(item => item.status === "ocr_necessario").length;
      const falhas = documentosConsolidados.filter(item => item.status === "erro").length;
      const mensagem = `${arquivosPdf.length} PDF(s) recebido(s); ${lidos} com leitura concluída; ${ocr} requer(em) OCR; ${falhas} com erro de leitura.`;
      if (ocr || falhas || !lidos) toast.warning(mensagem);
      else toast.success(mensagem);
    } catch (error) {
      if (controller.signal.aborted) toast.info("Envio pausado. Arquivos e sessão preservados; selecione os mesmos PDFs após recarregar para retomar.");
      else toast.error(error instanceof Error ? error.message : "Erro ao importar PDFs.");
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      setImportandoPdf(false);
    }
  };

  const totalLotePdf = arquivosPdf.reduce((total, arquivo) => total + arquivo.size, 0);
  const recebidoLotePdf = arquivosPdf.reduce((total, arquivo) => total + (progressoPdf[chaveArquivoContrato(arquivo)]?.receivedBytes ?? 0), 0);

  const contratosFiltrados = useMemo(() => {
    const lista = contratos.data ?? [];
    if (!busca.trim()) return lista;
    const termo = busca.trim().toLowerCase();
    return lista.filter((c) => {
      const nomeConv = getConvenioNome(c.convenioId).toLowerCase();
      const num = (c.numeroContrato || "").toLowerCase();
      return nomeConv.includes(termo) || num.includes(termo);
    });
  }, [contratos.data, busca, convenios.data]);

  // Exemplo Mock do Dashboard Superior (pode ser turbinado depois via API)
  const ativos = contratos.data?.filter(c => c.status === "ativo").length || 0;
  const expirando = contratos.data?.filter(c => c.status === "vencendo").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos de Convênios</h1>
          <p className="text-muted-foreground">Gerencie a vigência e as tabelas de preços negociadas com as Operadoras.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDocumentosContratoId(null);
              setNovoConvenioIdModal("");
              setNovoNumeroContratoModal("");
              setResultadoImportacao(null);
              setProgressoPdf({});
              setArquivosPdf([]);
              setDocumentosModalAberto(true);
            }}
            disabled={importandoPdf}
            className="gap-2"
          >
            <UploadCloud className="h-4 w-4" /> Importar PDFs (até 150 MB)
          </Button>
          <Button onClick={() => {
            setContratoEditando(null);
            setConvenioSelecionado("");
            setStatusSelecionado("ativo");
            setModalAberto(true);
          }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Contrato
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cadastrados</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{contratos.data?.length || 0}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Contratos Ativos</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{ativos}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Expiram em 45 dias</p>
                <h3 className="text-3xl font-bold mt-1 text-foreground">{expirando}</h3>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Acordos Comerciais</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Buscar convênio ou contrato..." className="pl-9 h-9" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Documentos PDF</TableHead>
                <TableHead>Dossiê & Auditoria (XML / Glosas)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contratos.isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6">Carregando...</TableCell></TableRow>
              ) : contratosFiltrados.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum contrato localizado para este estabelecimento.</TableCell></TableRow>
              ) : (
                contratosFiltrados.map((c) => {
                  const conf = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inativo;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-semibold">{getConvenioNome(c.convenioId)}</TableCell>
                      <TableCell>{c.numeroContrato || "-"}</TableCell>
                      <TableCell>{c.dataInicio ? formatDateBR(c.dataInicio) : "-"}</TableCell>
                      <TableCell>{c.dataFim ? formatDateBR(c.dataFim) : "-"}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-dashed" onClick={() => abrirDocumentos(c.id)}>
                          <FileSearch className="h-3 w-3" /> {quantidadeDocumentos(c.id)} {quantidadeDocumentos(c.id) === 1 ? "documento" : "documentos"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => abrirDossie(c.id, "resumo")}
                          >
                            <BookOpen className="h-3 w-3" /> Pontos de Atenção
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
                            onClick={() => abrirDossie(c.id, "xml")}
                          >
                            <FileCode2 className="h-3 w-3" /> Cobrança XML
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 border-purple-300 text-purple-800 hover:bg-purple-50"
                            onClick={() => abrirDossie(c.id, "glosas")}
                          >
                            <Gavel className="h-3 w-3" /> Glosas
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${conf.color} border-none`}>{conf.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { 
                          setContratoEditando(c); 
                          setConvenioSelecionado(c.convenioId?.toString() || "");
                          setStatusSelecionado(c.status || "ativo");
                          setModalAberto(true); 
                        }}>
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          if (confirm("Você tem certeza que deseja excluir o contrato?")) excluir.mutate({ id: c.id });
                        }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={documentosModalAberto} onOpenChange={(open) => {
        if (!open) uploadAbortRef.current?.abort();
        setDocumentosModalAberto(open);
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-primary" /> Leitura de contratos em PDF
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Anexe até 30 PDFs (150 MiB por arquivo; 600 MiB por lote). O recebimento em blocos preserva o original protegido e é separado da leitura; PDFs sem texto selecionável podem exigir OCR. Após recarregar, selecione o mesmo contrato e os mesmos PDFs para retomar.
            </p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {contratos.data && contratos.data.length > 0 ? (
              <div className="space-y-2">
                <Label>Contrato que receberá os documentos</Label>
                <Select
                  value={documentosContratoId ? documentosContratoId.toString() : "__novo__"}
                  disabled={importandoPdf}
                  onValueChange={(value) => {
                    if (value === "__novo__") {
                      setDocumentosContratoId(null);
                    } else {
                      setDocumentosContratoId(Number(value));
                    }
                    setResultadoImportacao(null);
                    setProgressoPdf({});
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
                  <SelectContent>
                    {contratos.data.map((contrato) => (
                      <SelectItem key={contrato.id} value={contrato.id.toString()}>
                        {getConvenioNome(contrato.convenioId)}{contrato.numeroContrato ? ` — ${contrato.numeroContrato}` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__novo__">+ Criar novo contrato para outra Operadora/Convênio...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {!documentosContratoId && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="space-y-2">
                  <Label>Operadora / Convênio (Novo Contrato)</Label>
                  <Select value={novoConvenioIdModal} onValueChange={setNovoConvenioIdModal} disabled={importandoPdf || criacaoContratoIncerta}>
                    <SelectTrigger><SelectValue placeholder="Selecione o convênio..." /></SelectTrigger>
                    <SelectContent>
                      {convenios.data?.map((conv: any) => (
                        <SelectItem key={conv.id} value={conv.id.toString()}>{conv.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nº do Contrato / Referência (opcional)</Label>
                  <Input
                    value={novoNumeroContratoModal}
                    onChange={(e) => setNovoNumeroContratoModal(e.target.value)}
                    disabled={importandoPdf || criacaoContratoIncerta}
                    placeholder="Ex: CT-2026/001"
                  />
                </div>
              </div>
            )}
            {criacaoContratoIncerta && !documentosContratoId && (
              <p role="alert" className="text-sm text-amber-700">Criação anterior incerta. Confira a lista e selecione explicitamente o contrato criado antes de enviar; a criação automática está bloqueada.</p>
            )}

            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${arrastandoPdf ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
              onDragOver={(event) => {
                event.preventDefault();
                setArrastandoPdf(true);
              }}
              onDragLeave={() => setArrastandoPdf(false)}
              onDrop={(event) => {
                event.preventDefault();
                setArrastandoPdf(false);
                adicionarArquivosPdf(event.dataTransfer.files);
              }}
            >
              <input
                ref={arquivoInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) adicionarArquivosPdf(event.target.files);
                  event.currentTarget.value = "";
                }}
                disabled={importandoPdf}
              />
              <UploadCloud className="mx-auto h-10 w-10 text-primary" />
              <p className="mt-3 font-medium">Arraste os PDFs para esta área</p>
              <p className="mt-1 text-sm text-muted-foreground">ou selecione até 30 PDFs de até 150 MiB cada (600 MiB no total)</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => arquivoInputRef.current?.click()} disabled={importandoPdf}>
                Selecionar arquivos PDF
              </Button>
            </div>

            {arquivosPdf.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between text-sm font-medium">
                  <span>{arquivosPdf.length} PDF(s) pronto(s) para importar</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setArquivosPdf([]); setProgressoPdf({}); }} disabled={importandoPdf}>Limpar seleção</Button>
                </div>
                <div className="mb-3 space-y-1" aria-live="polite">
                  <p className="text-xs text-muted-foreground">Recebido no lote: {formatarTamanho(recebidoLotePdf)} / {formatarTamanho(totalLotePdf)}. Recebimento não significa análise concluída.</p>
                  <progress className="h-2 w-full" value={recebidoLotePdf} max={totalLotePdf} aria-label="Bytes recebidos no lote" />
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {arquivosPdf.map((arquivo) => {
                    const progress = progressoPdf[chaveArquivoContrato(arquivo)];
                    return (
                      <div key={chaveArquivoContrato(arquivo)} className="space-y-1 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate"><FileText className="mr-1 inline h-3.5 w-3.5" />{arquivo.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatarTamanho(arquivo.size)}</span>
                        </div>
                        {progress && (
                          <div className="text-xs text-muted-foreground" aria-live="polite">
                            {progress.phase === "hashing" ? `Verificando integridade: ${formatarTamanho(progress.hashedBytes)} / ${formatarTamanho(arquivo.size)}`
                              : progress.phase === "processing" ? "Recebido; aguardando resultado da leitura"
                              : progress.phase === "done" ? "Recebido; consulte o resultado da leitura/OCR abaixo"
                              : `Recebido: ${formatarTamanho(progress.receivedBytes)} / ${formatarTamanho(arquivo.size)}`}
                            <progress className="mt-1 h-1 w-full" value={progress.receivedBytes} max={arquivo.size} aria-label={`Bytes recebidos de ${arquivo.name}`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {resultadoImportacao && resultadoImportacao.documentos.length > 0 && (
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">Resultado deste lote</h3>
                <div className="space-y-1.5">
                  {resultadoImportacao.documentos.map((item, index) => {
                    const conf = DOCUMENTO_STATUS_CONFIG[item.status as keyof typeof DOCUMENTO_STATUS_CONFIG] || DOCUMENTO_STATUS_CONFIG.erro;
                    return (
                      <div key={`${item.nomeArquivo}-${index}`} className="flex flex-col gap-0.5 text-sm border-b last:border-b-0 pb-1 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{item.nomeArquivo}</span>
                          <Badge className={`${conf.color} border-none shrink-0`}>{item.reutilizado ? `Já recebido · ${conf.label}` : conf.label}</Badge>
                        </div>
                        {item.erro && (
                          <span className="text-xs text-red-600">{item.erro}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold">Documentos já importados</h3>
                <div className="flex items-center gap-2">
                  {documentos.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {documentosContratoId && documentos.data?.some(d => d.status === "ocr_necessario") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={executarOcrContrato.isPending}
                      className="h-8 text-xs gap-1.5 text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100"
                      onClick={() => executarOcrContrato.mutate({ contratoId: documentosContratoId })}
                    >
                      {executarOcrContrato.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {executarOcrContrato.isPending ? "Lendo PDFs digitalizados..." : "Executar OCR nos Digitalizados (IA)"}
                    </Button>
                  )}
                  {documentosContratoId && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => abrirDossie(documentosContratoId, "resumo")}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Abrir Dossiê Consolidado (Pontos de Atenção + XML + Glosas)
                    </Button>
                  )}
                </div>
              </div>
              {documentos.isError ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Não foi possível carregar os documentos deste contrato no momento.</p>
              ) : documentos.data?.length ? (
                <div className="space-y-2">
                  {documentos.data.map((documento) => {
                    const conf = DOCUMENTO_STATUS_CONFIG[documento.status as keyof typeof DOCUMENTO_STATUS_CONFIG] || DOCUMENTO_STATUS_CONFIG.erro;
                    return (
                      <div key={documento.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{documento.nomeArquivo}</p>
                          <p className="text-xs text-muted-foreground">{documento.paginas || "-"} página(s) · {formatarTamanho(documento.tamanhoBytes)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className={`${conf.color} border-none`}>{conf.label}</Badge>
                          <Button type="button" variant="outline" size="sm" onClick={() => setDocumentoDetalheId(documento.id)}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Ver leitura
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Deseja remover o documento "${documento.nomeArquivo}"?`)) {
                                excluirDocumento.mutate({ id: documento.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum PDF foi importado para este contrato.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { uploadAbortRef.current?.abort(); setDocumentosModalAberto(false); }}>Fechar</Button>
            {importandoPdf && <Button variant="outline" onClick={() => uploadAbortRef.current?.abort()}>Pausar envio</Button>}
            <Button onClick={importarPdfs} disabled={(!documentosContratoId && (!novoConvenioIdModal || criacaoContratoIncerta)) || !arquivosPdf.length || importandoPdf} className="gap-2">
              {importandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {importandoPdf ? "Recebendo / consultando leitura..." : Object.keys(progressoPdf).length ? "Retomar / verificar PDFs" : "Importar e ler PDFs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={documentoDetalheId !== null} onOpenChange={(open) => !open && setDocumentoDetalheId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{documentoDetalhe.data?.nomeArquivo || "Leitura do documento"}</DialogTitle>
          </DialogHeader>
          {documentoDetalhe.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando leitura...</div>
          ) : documentoDetalhe.data ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${(DOCUMENTO_STATUS_CONFIG[documentoDetalhe.data.status as keyof typeof DOCUMENTO_STATUS_CONFIG] || DOCUMENTO_STATUS_CONFIG.erro).color} border-none`}>
                  {(DOCUMENTO_STATUS_CONFIG[documentoDetalhe.data.status as keyof typeof DOCUMENTO_STATUS_CONFIG] || DOCUMENTO_STATUS_CONFIG.erro).label}
                </Badge>
                {documentoDetalhe.data.downloadUrl && (
                  <a href={`/api/contratos-convenios/documentos/${documentoDetalhe.data.id}/download`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                    <Download className="h-3.5 w-3.5" /> Abrir PDF original
                  </a>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reanalisarIA.isPending}
                  onClick={() => reanalisarIA.mutate({ id: documentoDetalhe.data!.id })}
                  className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
                >
                  {reanalisarIA.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {reanalisarIA.isPending
                    ? documentoDetalhe.data.status === "ocr_necessario"
                      ? "Executando OCR..."
                      : "Extraindo cláusulas..."
                    : documentoDetalhe.data.status === "ocr_necessario"
                      ? "Ler PDF Digitalizado com OCR (IA)"
                      : "Extrair Cláusulas p/ Recurso de Glosa (IA)"}
                </Button>
              </div>
              {documentoDetalhe.data.status === "ocr_necessario" && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="flex gap-2">
                    <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Este PDF não apresentou texto selecionável suficiente (imagem escaneada). Clique ao lado para extrair o texto, cláusulas e tabelas via OCR com IA.</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={reanalisarIA.isPending}
                    onClick={() => reanalisarIA.mutate({ id: documentoDetalhe.data!.id })}
                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                  >
                    {reanalisarIA.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {reanalisarIA.isPending ? "Processando OCR..." : "Executar OCR Agora"}
                  </Button>
                </div>
              )}
              <div>
                <h3 className="mb-2 font-semibold">Pontos importantes encontrados</h3>
                {documentoDetalhe.data.pontosImportantes?.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {documentoDetalhe.data.pontosImportantes.map((ponto: any, index: number) => (
                      <div key={`${ponto.categoria}-${index}`} className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-sm font-semibold">{ponto.titulo}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{ponto.resumo}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">Nenhum ponto estruturado foi encontrado.</p>}
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Texto extraído</h3>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 text-xs leading-5">{documentoDetalhe.data.textoExtraido || "Nenhum texto extraído."}</pre>
              </div>
            </div>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">Não foi possível carregar este documento.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{contratoEditando ? "Editar Contrato" : "Novo Contrato com Convênio"}</DialogTitle>
          </DialogHeader>
          <form id="form-contrato" onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operadora / Convênio</Label>
                <Select value={convenioSelecionado} onValueChange={setConvenioSelecionado} required>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {convenios.data?.map((conv: any) => (
                      <SelectItem key={conv.id} value={conv.id.toString()}>{conv.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nº do Contrato / Referência</Label>
                <Input name="numeroContrato" defaultValue={contratoEditando?.numeroContrato || ""} placeholder="Ex: CT-2026/001" />
              </div>
              
              <div className="space-y-2">
                <Label>Data de Início Vigência</Label>
                <Input type="date" name="dataInicio" defaultValue={contratoEditando?.dataInicio ? new Date(contratoEditando.dataInicio).toISOString().split('T')[0] : ""} />
              </div>
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" name="dataFim" defaultValue={contratoEditando?.dataFim ? new Date(contratoEditando.dataFim).toISOString().split('T')[0] : ""} />
              </div>

              {contratoEditando && (
                <div className="space-y-2 col-span-2">
                  <Label>Situação do Contrato</Label>
                  <Select value={statusSelecionado} onValueChange={setStatusSelecionado}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="vencendo">Vencendo / Em Renovação</SelectItem>
                      <SelectItem value="renovado">Renovado</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="inativo">Inativo / Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2 col-span-2">
                <Label>Observações Internas (Não vai no email)</Label>
                <Textarea name="observacoes" defaultValue={contratoEditando?.observacoes || ""} rows={2} placeholder="Anotações internas..." />
              </div>
            </div>

            {/* SEÇÃO PROPOSTA COMERCIAL */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4" /> Automação de Reajuste Contratual
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email do Negociador no Convênio</Label>
                  <Input type="email" name="emailContato" defaultValue={contratoEditando?.emailContato || ""} placeholder="Ex: credenciamento@unimed.com.br" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reajuste Proposto (%)</Label>
                    <Input type="number" step="0.01" name="reajusteProposto" defaultValue={contratoEditando?.reajusteProposto || ""} placeholder="Ex: 8.5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Programada de Envio</Label>
                    <Input type="date" name="dataEnvioProposta" defaultValue={contratoEditando?.dataEnvioProposta ? new Date(contratoEditando.dataEnvioProposta).toISOString().split('T')[0] : ""} />
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Template do E-mail</Label>
                  <Textarea 
                    name="modeloEmailProposta" 
                    defaultValue={contratoEditando?.modeloEmailProposta || "Olá Equipe de Credenciamento,\n\nTendo em vista a defasagem dos custos frente ao INPC/IGPM do período, vimos por meio desta apresentar a proposta de reajuste contratual para as tabelas do ano vigente, no valor de {{REAJUSTE}}%, a partir de {{DATA_VENCIMENTO}}..."} 
                    rows={4} 
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variáveis disponíveis: <code className="bg-muted px-1 rounded">{"{{REAJUSTE}}"}</code> <code className="bg-muted px-1 rounded">{"{{DATA_VENCIMENTO}}"}</code>
                  </p>
                </div>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button type="submit" form="form-contrato" disabled={criar.isPending || atualizar.isPending}>
              {criar.isPending || atualizar.isPending ? "Salvando..." : "Salvar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dossieModalAberto && dossieEscopoOrigem === dossieEscopoAtual && <ContratoDossieModal
        key={`${dossieEscopoAtual}:${dossieContratoId}`}
        escopo={dossieEscopoAtual}
        open={dossieModalAberto}
        onOpenChange={value => { setDossieModalAberto(value); if (!value) { setDossieContratoId(null); setDossieEscopoOrigem(null); } }}
        contratoId={dossieContratoId}
        abaInicial={dossieAbaInicial}
        onAbrirDocumentoPdf={(docId) => {
          setDossieModalAberto(false);
          setDocumentoDetalheId(docId);
        }}
      />}
    </div>
  );
}
