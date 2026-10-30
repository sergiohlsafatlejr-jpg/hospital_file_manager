import DashboardLayout from "@/components/DashboardLayout";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { estadoRetentativaXml } from "@/lib/xmlImportacaoRetry";
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
  X,
  Files,
  Search,
  Database,
  ArrowRight,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface FileItem {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const MAX_FILES = 30;

function detectFileType(file: File): "xml" | "excel" | "pdf" | "csv" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xml") return "xml";
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  return "xml";
}

export default function Upload() {
  const { estabelecimentoAtual, estabelecimentos: estabelecimentosPermitidos } = useEstabelecimento();
  const searchString = useSearch();
  const reenvioInicializadoRef = useRef<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [direcao, setDirecao] = useState<"enviado" | "retornado">("enviado");
  const [estabelecimentoSelecionado, setEstabelecimentoSelecionado] =
    useState<string>("");
  const [convenioId, setConvenioId] = useState<string>("");
  const [dataReferencia, setDataReferencia] = useState<string>("");
  const [dataPagamento, setDataPagamento] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [novoConvenioNome, setNovoConvenioNome] = useState("");
  const [novoConvenioCodigo, setNovoConvenioCodigo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlLoteIdempotencyRef = useRef<{
    assinatura: string;
    chave: string;
  } | null>(null);

  const invalidarRetentativaXml = useCallback(() => {
    xmlLoteIdempotencyRef.current = null;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (
      params.get("reenvioLote") !== "1" ||
      reenvioInicializadoRef.current === searchString
    ) {
      return;
    }
    reenvioInicializadoRef.current = searchString;
    const isId = (value: string | null) =>
      Boolean(value && /^\d+$/.test(value));
    const isDate = (value: string | null) =>
      Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
    const unidade = params.get("estabelecimentoId");
    const convenio = params.get("convenioId");
    const referencia = params.get("dataReferencia");
    const pagamento = params.get("dataPagamento");
    if (isId(unidade)) setEstabelecimentoSelecionado(unidade!);
    if (isId(convenio)) setConvenioId(convenio!);
    if (isDate(referencia)) setDataReferencia(referencia!);
    if (isDate(pagamento)) setDataPagamento(pagamento!);
    toast.info(
      "Reenvio integral: selecione novamente todos os XMLs da seleção.",
      {
        duration: 7000,
      }
    );
  }, [searchString]);

  const estabIdFiltroConvenio =
    estabelecimentoSelecionado && !Number.isNaN(Number(estabelecimentoSelecionado))
      ? Number(estabelecimentoSelecionado)
      : estabelecimentoAtivo?.id;
  const { data: convenios, refetch: refetchConvenios } =
    trpc.convenios.list.useQuery({
      ativo: "sim",
      ...(estabIdFiltroConvenio ? { estabelecimentoId: estabIdFiltroConvenio } : {}),
    });
  const { data: todosEstabelecimentos } = trpc.estabelecimentos.list.useQuery({});
  const estabelecimentos =
    estabelecimentosPermitidos && estabelecimentosPermitidos.length > 0
      ? estabelecimentosPermitidos
      : todosEstabelecimentos;
  const uploadMutation = trpc.arquivos.upload.useMutation();
  const criarConvenioMutation = trpc.convenios.create.useMutation();
  const utils = trpc.useUtils();

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      invalidarRetentativaXml();
      const fileArray = Array.from(files);
      const validExtensions = [".xml", ".xlsx", ".xls", ".pdf"];

      const validFiles = fileArray.filter(file => {
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        return validExtensions.includes(ext);
      });

      if (validFiles.length !== fileArray.length) {
        toast.warning(
          "Alguns arquivos foram ignorados. Formatos aceitos: XML, Excel, PDF"
        );
      }

      setSelectedFiles(prev => {
        const newFiles = validFiles.map(file => ({
          file,
          status: "pending" as const,
        }));
        const combined = [...prev, ...newFiles];

        if (combined.length > MAX_FILES) {
          toast.error(
            `Máximo de ${MAX_FILES} arquivos permitidos. Alguns arquivos foram ignorados.`
          );
          return combined.slice(0, MAX_FILES);
        }

        return combined;
      });
    },
    [invalidarRetentativaXml]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    // Reset input to allow selecting same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  const removeFile = (index: number) => {
    invalidarRetentativaXml();
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    invalidarRetentativaXml();
    setSelectedFiles([]);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !convenioId) {
      toast.error("Por favor, selecione pelo menos um arquivo e um convênio");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const pendingFiles = selectedFiles.filter(
      f => f.status === "pending" || f.status === "error"
    );
    const estabId = estabelecimentoSelecionado
      ? parseInt(estabelecimentoSelecionado)
      : estabelecimentoAtual?.id || 0;
    const possuiXmlDeEnvio =
      direcao === "enviado" &&
      pendingFiles.some(item => detectFileType(item.file) === "xml");

    if (
      possuiXmlDeEnvio &&
      !pendingFiles.every(item => detectFileType(item.file) === "xml")
    ) {
      toast.error(
        "Envie XMLs de guias em uma seleção exclusiva; arquivos Excel e PDF devem ser enviados separadamente."
      );
      setIsUploading(false);
      return;
    }

    // XMLs de envio entram juntos em um lote durável: primeiro todos os
    // snapshots hospitalares são publicados, depois os honorários são ligados
    // apenas aos snapshots do mesmo lote. Outros formatos seguem o fluxo legado.
    if (
      direcao === "enviado" &&
      pendingFiles.length > 0 &&
      pendingFiles.every(item => detectFileType(item.file) === "xml")
    ) {
      if (!Number.isSafeInteger(estabId) || estabId <= 0) {
        toast.error(
          "Selecione um estabelecimento válido antes de enviar os XMLs."
        );
        setIsUploading(false);
        return;
      }
      setSelectedFiles(prev =>
        prev.map(item =>
          pendingFiles.some(pending => pending.file === item.file)
            ? { ...item, status: "uploading" as const, error: undefined }
            : item
        )
      );
      try {
        const form = new FormData();
        pendingFiles.forEach(item =>
          form.append("files", item.file, item.file.name)
        );
        const assinatura = JSON.stringify({
          estabelecimentoId: estabId,
          convenioId,
          dataReferencia,
          dataPagamento,
          arquivos: pendingFiles.map(item => [
            item.file.name,
            item.file.size,
            item.file.lastModified,
          ]),
        });
        if (xmlLoteIdempotencyRef.current?.assinatura !== assinatura) {
          xmlLoteIdempotencyRef.current = {
            assinatura,
            chave: crypto.randomUUID().replace(/-/g, ""),
          };
        }
        const response = await fetch("/api/xml-importacoes/lotes", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "x-estabelecimento-id": String(estabId),
            "x-convenio-id": convenioId,
            "x-idempotency-key": xmlLoteIdempotencyRef.current.chave,
            ...(dataReferencia ? { "x-data-referencia": dataReferencia } : {}),
            ...(dataPagamento ? { "x-data-pagamento": dataPagamento } : {}),
          },
          body: form,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            payload?.error || "Não foi possível iniciar o lote XML."
          );
        if (payload?.lote?.estado === "recebendo") {
          throw new Error(
            "Não foi possível gravar a seleção protegida. Tente novamente com os mesmos XMLs; nenhum arquivo foi processado."
          );
        }
        setSelectedFiles(prev =>
          prev.map(item =>
            pendingFiles.some(pending => pending.file === item.file)
              ? { ...item, status: "success" as const, error: undefined }
              : item
          )
        );
        xmlLoteIdempotencyRef.current = null;
        setUploadProgress(100);
        toast.success(
          `${pendingFiles.length} XML(s) enviados em um único lote. O processamento hospitalar e médico foi enfileirado.`,
          {
            duration: 7000,
          }
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Erro ao iniciar o lote XML.";
        setSelectedFiles(prev =>
          prev.map(item =>
            pendingFiles.some(pending => pending.file === item.file)
              ? { ...item, status: "error" as const, error: message }
              : item
          )
        );
        toast.error(message);
      } finally {
        utils.arquivos.list.invalidate();
        utils.arquivos.stats.invalidate();
        utils.dashboard.resumo.invalidate();
        utils.dashboard.ultimosArquivos.invalidate();
        setIsUploading(false);
      }
      return;
    }

    if (
      direcao === "enviado" &&
      pendingFiles.some(item => detectFileType(item.file) === "xml")
    ) {
      setSelectedFiles(prev =>
        prev.map(item =>
          pendingFiles.some(pending => pending.file === item.file)
            ? {
                ...item,
                status: "error" as const,
                error:
                  "Envie os XMLs de guias em uma seleção separada dos demais formatos.",
              }
            : item
        )
      );
      toast.error(
        "Envie os XMLs de guias separadamente para manter a associação hospitalar e médica no mesmo lote protegido."
      );
      setIsUploading(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i];
      const fileIndex = selectedFiles.findIndex(f => f.file === fileItem.file);

      // Update status to uploading
      setSelectedFiles(prev =>
        prev.map((f, idx) =>
          idx === fileIndex ? { ...f, status: "uploading" as const } : f
        )
      );

      try {
        // Validar arquivo vazio antes de enviar
        if (fileItem.file.size === 0) {
          toast.error(
            `Arquivo "${fileItem.file.name}" está vazio (0 bytes). Verifique o arquivo e tente novamente.`
          );
          setSelectedFiles(prev =>
            prev.map((f, idx) =>
              idx === fileIndex
                ? {
                    ...f,
                    status: "error" as const,
                    error: "Arquivo vazio (0 bytes)",
                  }
                : f
            )
          );
          errorCount++;
          setUploadProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
          continue;
        }

        // Show progress for large files
        const fileSizeMB = fileItem.file.size / (1024 * 1024);
        if (fileSizeMB > 1) {
          toast.info(
            `Processando ${fileItem.file.name} (${fileSizeMB.toFixed(1)} MB)...`,
            {
              id: `processing-${fileIndex}`,
              duration: 60000,
            }
          );
        }

        // Convert file to base64 with optimized chunked processing
        const buffer = await fileItem.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Use chunked base64 encoding for large files to avoid stack overflow
        const CHUNK_SIZE = 32768; // 32KB chunks
        let base64 = "";
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.subarray(
            i,
            Math.min(i + CHUNK_SIZE, bytes.length)
          );
          base64 += String.fromCharCode.apply(null, Array.from(chunk));
        }
        base64 = btoa(base64);

        // Usar estabelecimento selecionado, detectado ou o atual do contexto
        const result = await uploadMutation.mutateAsync({
          nome: fileItem.file.name,
          tipoArquivo: detectFileType(fileItem.file),
          direcao,
          convenioId: parseInt(convenioId),
          estabelecimentoId: estabId,
          conteudo: base64,
          dataReferencia: dataReferencia || undefined,
          dataPagamento: dataPagamento || undefined,
        });

        // Dismiss processing toast
        toast.dismiss(`processing-${fileIndex}`);

        // Update status to success
        setSelectedFiles(prev =>
          prev.map((f, idx) =>
            idx === fileIndex ? { ...f, status: "success" as const } : f
          )
        );

        // Mostrar feedback se foi reimportação ou processamento em background
        if (result.reimportado) {
          toast.info(
            `Arquivo "${fileItem.file.name}" atualizado (reimportação)`
          );
        }
        if (result.processandoEmBackground) {
          toast.info(
            `Arquivo "${fileItem.file.name}" enviado! Processamento em andamento...`,
            {
              duration: 5000,
              description:
                "Você pode continuar navegando. O progresso será atualizado automaticamente.",
            }
          );
        }
        successCount++;
      } catch (error) {
        console.error("Upload error:", error);
        // Update status to error
        setSelectedFiles(prev =>
          prev.map((f, idx) =>
            idx === fileIndex
              ? { ...f, status: "error" as const, error: "Erro ao enviar" }
              : f
          )
        );
        errorCount++;
      }

      // Update progress
      setUploadProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
    }

    // Show summary toast
    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(
        `${successCount} arquivo(s) enviado(s), ${errorCount} com erro`
      );
    } else if (errorCount > 0) {
      toast.error(`Erro ao enviar ${errorCount} arquivo(s)`);
    }

    // Invalidate queries
    utils.arquivos.list.invalidate();
    utils.arquivos.stats.invalidate();
    utils.dashboard.resumo.invalidate();
    utils.dashboard.ultimosArquivos.invalidate();
    utils.procedimentos.list.invalidate();
    utils.faturadoRecebidoUnificado.dados.invalidate();

    setIsUploading(false);
  };

  const handleCriarConvenio = async () => {
    if (!novoConvenioNome.trim()) {
      toast.error("Por favor, informe o nome do convênio");
      return;
    }

    try {
      const result = await criarConvenioMutation.mutateAsync({
        nome: novoConvenioNome,
        codigo: novoConvenioCodigo || undefined,
      });

      toast.success("Convênio criado com sucesso!");
      setConvenioId(result.id.toString());
      setNovoConvenioNome("");
      setNovoConvenioCodigo("");
      setDialogOpen(false);
      refetchConvenios();
    } catch (error) {
      toast.error("Erro ao criar convênio");
    }
  };

  const estadoRetryXml = estadoRetentativaXml(
    selectedFiles.map(item => item.status)
  );
  const pendingCount = estadoRetryXml.pendentes;
  const successCount = selectedFiles.filter(f => f.status === "success").length;
  const errorCount = estadoRetryXml.comErro;
  const retryableCount = estadoRetryXml.reenviaveis;
  const retentativaXmlProtegida =
    Boolean(xmlLoteIdempotencyRef.current) &&
    pendingCount === 0 &&
    errorCount > 0 &&
    selectedFiles.every(item => item.status === "error");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Upload de Arquivos
          </h1>
          <p className="text-slate-500">
            Envie até {MAX_FILES} arquivos XML, Excel ou PDF de uma vez. O
            processamento começa após o envio.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Form */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Enviar Arquivos</span>
                {selectedFiles.length > 0 && (
                  <span className="text-sm font-normal text-slate-500">
                    {selectedFiles.length}/{MAX_FILES} arquivos
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Arraste e solte os arquivos ou clique para selecionar. Após o
                envio, o processamento continua em segundo plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* File Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : selectedFiles.length > 0
                      ? "border-green-300 bg-green-50"
                      : "border-slate-200 hover:border-primary hover:bg-slate-50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,.xlsx,.xls,.csv,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                />
                {isDragOver ? (
                  <div className="flex flex-col items-center gap-3">
                    <Files className="h-12 w-12 text-primary animate-bounce" />
                    <p className="font-medium text-primary">
                      Solte os arquivos aqui
                    </p>
                  </div>
                ) : selectedFiles.length > 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="font-medium text-slate-900">
                        {selectedFiles.length} arquivo(s) selecionado(s)
                      </p>
                      <p className="text-sm text-slate-500">
                        Clique ou arraste para adicionar mais
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <UploadIcon className="h-12 w-12 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">
                        Arraste e solte os arquivos aqui
                      </p>
                      <p className="text-sm text-slate-500">
                        ou clique para selecionar
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      XML, Excel (.xlsx), CSV ou PDF • Até {MAX_FILES} arquivos
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                XML de honorários é somente informativo e aguarda associação
                segura à conta; não altera a cobrança no envio.
              </p>

              {/* File List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Arquivos selecionados</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFiles}
                      className="text-xs h-auto py-1"
                    >
                      Limpar todos
                    </Button>
                  </div>
                  {retentativaXmlProtegida ? (
                    <p className="text-xs text-amber-700" role="status">
                      Retentativa protegida ativa: a seleção e o escopo foram
                      mantidos. Para trocar arquivos, use “Limpar todos”.
                    </p>
                  ) : null}
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {selectedFiles.map((item, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                          item.status === "success"
                            ? "bg-green-50 text-green-700"
                            : item.status === "error"
                              ? "bg-red-50 text-red-700"
                              : item.status === "uploading"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.status === "uploading" ? (
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          ) : item.status === "success" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                          ) : item.status === "error" ? (
                            <AlertCircle className="h-4 w-4 shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="block truncate">
                              {item.file.name}
                            </span>
                            {item.status === "error" && item.error ? (
                              <span className="block text-xs" role="alert">
                                {item.error}
                              </span>
                            ) : null}
                          </div>
                          <span className="sr-only">
                            {item.status === "uploading"
                              ? "Enviando arquivo; o processamento ocorrerá após o envio."
                              : item.status === "success"
                                ? "Arquivo enviado; processamento posterior em andamento ou aguardando atualização."
                                : item.status === "error"
                                  ? "Não foi possível enviar o arquivo."
                                  : "Arquivo aguardando envio."}
                          </span>
                        </div>
                        {item.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={e => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {(successCount > 0 || errorCount > 0) && (
                    <div className="flex gap-4 text-xs text-slate-500 pt-2">
                      {successCount > 0 && (
                        <span className="text-green-600">
                          ✓ {successCount} enviado(s)
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-red-600">
                          ✗ {errorCount} com erro
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span>• {pendingCount} pendente(s)</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div
                  className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="font-medium text-blue-900">
                      Enviando arquivos; o processamento começa após cada envio.
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-blue-700">
                      <span>
                        Arquivo{" "}
                        {Math.min(
                          Math.ceil(
                            (uploadProgress / 100) *
                              selectedFiles.filter(
                                f =>
                                  f.status === "pending" || f.status === "error"
                              ).length
                          ) || 1,
                          selectedFiles.filter(
                            f => f.status === "pending" || f.status === "error"
                          ).length
                        )}{" "}
                        de{" "}
                        {
                          selectedFiles.filter(
                            f => f.status === "pending" || f.status === "error"
                          ).length
                        }
                      </span>
                      <span className="font-medium">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                  <p className="text-xs text-blue-600">
                    O processamento dos itens ocorre em segundo plano após o
                    upload. XML de honorários permanece apenas informativo e
                    aguarda associação segura à conta. Você pode acompanhar o
                    progresso na tela de Arquivos.
                  </p>
                </div>
              )}

              {/* Form Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="direcao">Direção</Label>
                  <Select
                    value={direcao}
                    onValueChange={v => {
                      invalidarRetentativaXml();
                      setDirecao(v as typeof direcao);
                    }}
                    disabled={retentativaXmlProtegida}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enviado">
                        Enviado ao Convênio
                      </SelectItem>
                      <SelectItem value="retornado">
                        Retornado do Convênio
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="convenio">Convênio</Label>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto py-1 px-2 text-xs"
                          disabled={retentativaXmlProtegida}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Novo
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Novo Convênio</DialogTitle>
                          <DialogDescription>
                            Adicione um novo convênio ao sistema
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="nomeConvenio">
                              Nome do Convênio
                            </Label>
                            <Input
                              id="nomeConvenio"
                              value={novoConvenioNome}
                              onChange={e =>
                                setNovoConvenioNome(e.target.value)
                              }
                              placeholder="Ex: Unimed, Bradesco Saúde..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="codigoConvenio">
                              Código (opcional)
                            </Label>
                            <Input
                              id="codigoConvenio"
                              value={novoConvenioCodigo}
                              onChange={e =>
                                setNovoConvenioCodigo(e.target.value)
                              }
                              placeholder="Ex: 001, UNI..."
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleCriarConvenio}
                            disabled={criarConvenioMutation.isPending}
                          >
                            {criarConvenioMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Criar Convênio
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select
                    value={convenioId}
                    onValueChange={value => {
                      invalidarRetentativaXml();
                      setConvenioId(value);
                    }}
                    disabled={retentativaXmlProtegida}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um convênio" />
                    </SelectTrigger>
                    <SelectContent>
                      {convenios?.map(conv => (
                        <SelectItem key={conv.id} value={conv.id.toString()}>
                          {conv.nome} {conv.codigo ? `(${conv.codigo})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* A unidade é sempre uma decisão explícita do usuário. */}
              <div className="space-y-2">
                <Label htmlFor="estabelecimento">Estabelecimento</Label>
                <Select
                  value={
                    estabelecimentoSelecionado ||
                    estabelecimentoAtual?.id?.toString() ||
                    ""
                  }
                  onValueChange={value => {
                    invalidarRetentativaXml();
                    setEstabelecimentoSelecionado(value);
                  }}
                  disabled={retentativaXmlProtegida}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um estabelecimento" />
                  </SelectTrigger>
                  <SelectContent>
                    {estabelecimentos?.map(est => (
                      <SelectItem key={est.id} value={est.id.toString()}>
                        {est.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Para XMLs enviados, a unidade e o convênio selecionados
                  definem o escopo protegido do lote.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataReferencia">
                  {direcao === "enviado"
                    ? "Competência das guias (data de referência)"
                    : "Competência do demonstrativo (data de referência)"}
                </Label>
                <Input
                  id="dataReferencia"
                  type="date"
                  value={dataReferencia}
                  onChange={e => {
                    invalidarRetentativaXml();
                    setDataReferencia(e.target.value);
                  }}
                  disabled={retentativaXmlProtegida}
                />
                <p className="text-xs text-muted-foreground">
                  Informe o mês ao qual os atendimentos pertencem
                  (preferencialmente dia 01), não a data do upload nem a data do
                  pagamento.
                </p>
              </div>

              {/* Campo de Data de Pagamento - aparece apenas para arquivos retornados */}
              {direcao === "retornado" && (
                <div className="space-y-2">
                  <Label htmlFor="dataPagamento">
                    Data de Pagamento (opcional)
                  </Label>
                  <Input
                    id="dataPagamento"
                    type="date"
                    value={dataPagamento}
                    onChange={e => {
                      invalidarRetentativaXml();
                      setDataPagamento(e.target.value);
                    }}
                    disabled={retentativaXmlProtegida}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe a data de pagamento para calcular o prazo de recurso
                    de glosa
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleUpload}
                disabled={
                  selectedFiles.length === 0 ||
                  !convenioId ||
                  isUploading ||
                  retryableCount === 0
                }
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Enviando{" "}
                    {selectedFiles.filter(f => f.status === "uploading")
                      .length > 0
                      ? "..."
                      : ""}
                  </>
                ) : (
                  <>
                    <UploadIcon className="h-4 w-4 mr-2" />
                    {estadoRetryXml.rotuloAcao}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Instructions */}
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Instruções</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-600">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Arraste ou selecione os arquivos
                    </p>
                    <p className="text-sm text-slate-500">
                      Até {MAX_FILES} arquivos por vez: XML (TISS), Excel
                      (.xlsx) e PDF
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-600">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Informe a direção
                    </p>
                    <p className="text-sm text-slate-500">
                      Indique se os arquivos foram enviados ou retornados do
                      convênio
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-600">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Selecione o convênio
                    </p>
                    <p className="text-sm text-slate-500">
                      Todos os arquivos serão associados ao convênio selecionado
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">
                      Processamento automático
                    </p>
                    <p className="text-sm text-slate-500">
                      Depois que o envio terminar, o sistema iniciará o
                      processamento dos arquivos em segundo plano.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-900">Dica</p>
                    <p className="text-sm text-amber-700">
                      Para melhor extração de dados, utilize arquivos XML no
                      formato TISS ou planilhas Excel com colunas padronizadas
                      (código, descrição, quantidade, valor).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Buscar Conta no Banco do Cliente */}
        <BuscarContaSection estabelecimentoId={estabelecimentoAtual?.id} />
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// COMPONENTE: Buscar Conta no Banco do Cliente
// ============================================================
function BuscarContaSection({
  estabelecimentoId,
}: {
  estabelecimentoId?: number;
}) {
  const [numeroConta, setNumeroConta] = useState("");
  const [, setLocation] = useLocation();
  const buscarContaMutation = trpc.contasConvenio.buscarConta.useMutation();

  const handleBuscarConta = async () => {
    if (!numeroConta.trim()) {
      toast.error("Informe o número da conta");
      return;
    }
    if (!estabelecimentoId) {
      toast.error("Selecione um estabelecimento");
      return;
    }

    try {
      const result = await buscarContaMutation.mutateAsync({
        numeroConta: numeroConta.trim(),
        estabelecimentoId,
      });

      if (result.sucesso) {
        toast.success(result.mensagem);
        // Redirecionar automaticamente para a tela de Conta Convênio Detalhes
        setTimeout(() => {
          setLocation(
            `/conta-convenio-detalhes?numeroConta=${encodeURIComponent(numeroConta.trim())}`
          );
        }, 1000);
      } else {
        toast.error(result.mensagem);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar conta");
    }
  };

  return (
    <Card className="border-0 shadow-sm border-l-4 border-l-indigo-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-indigo-600" />
          Buscar Conta no Sistema do Hospital
        </CardTitle>
        <CardDescription>
          Busque uma conta diretamente no banco de dados do hospital (Warleine)
          pelo número da conta. Os itens serão importados automaticamente para
          análise e comparação com padrões de cobrança.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="numeroConta">Número da Conta</Label>
            <Input
              id="numeroConta"
              placeholder="Ex: 123456"
              value={numeroConta}
              onChange={e => setNumeroConta(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleBuscarConta()}
              className="font-mono"
            />
          </div>
          <Button
            onClick={handleBuscarConta}
            disabled={
              buscarContaMutation.isPending ||
              !numeroConta.trim() ||
              !estabelecimentoId
            }
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {buscarContaMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Buscar Conta
              </>
            )}
          </Button>
        </div>

        {buscarContaMutation.data?.sucesso && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700 mb-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Conta importada com sucesso!</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-green-600">Convênio:</span>
                <p className="font-medium text-green-800">
                  {buscarContaMutation.data.convenio || "-"}
                </p>
              </div>
              <div>
                <span className="text-green-600">Paciente:</span>
                <p className="font-medium text-green-800">
                  {buscarContaMutation.data.paciente || "-"}
                </p>
              </div>
              <div>
                <span className="text-green-600">Itens:</span>
                <p className="font-medium text-green-800">
                  {buscarContaMutation.data.totalItens}
                </p>
              </div>
              <div>
                <span className="text-green-600">Valor Total:</span>
                <p className="font-medium text-green-800">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(buscarContaMutation.data.valorTotal || 0)}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
              onClick={() =>
                setLocation(
                  `/conta-convenio-detalhes?numeroConta=${encodeURIComponent(numeroConta.trim())}`
                )
              }
            >
              Ver Conta <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {buscarContaMutation.data && !buscarContaMutation.data.sucesso && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">
                {buscarContaMutation.data.mensagem}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
