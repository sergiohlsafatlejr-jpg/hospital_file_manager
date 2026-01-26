import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Upload as UploadIcon, FileText, CheckCircle2, AlertCircle, Plus, Loader2, X, Files } from "lucide-react";
import { useState, useRef, useCallback } from "react";
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

export default function Upload() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [direcao, setDirecao] = useState<"enviado" | "retornado">("enviado");
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

  const { data: convenios, refetch: refetchConvenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: estabelecimentos } = trpc.estabelecimentos.list.useQuery({});
  const uploadMutation = trpc.arquivos.upload.useMutation();
  const detectarPrestadoresMutation = trpc.arquivos.detectarPrestadores.useMutation();
  const criarConvenioMutation = trpc.convenios.create.useMutation();
  const utils = trpc.useUtils();

  // Estado para detecção automática de prestador
  const [prestadorDetectado, setPrestadorDetectado] = useState<{
    codigoPrestador: string;
    estabelecimentoId: number;
    estabelecimentoNome: string;
    convenioNome: string;
  } | null>(null);
  const [prestadoresNaoCadastrados, setPrestadoresNaoCadastrados] = useState<string[]>([]);
  const [isDetectando, setIsDetectando] = useState(false);
  const [estabelecimentoSelecionado, setEstabelecimentoSelecionado] = useState<string>("");

  const detectFileType = (file: File): "xml" | "excel" | "pdf" => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xml") return "xml";
    if (ext === "xlsx" || ext === "xls") return "excel";
    if (ext === "pdf") return "pdf";
    return "xml";
  };

  // Função para detectar prestadores de um arquivo XML
  const detectarPrestadorDoArquivo = useCallback(async (file: File) => {
    if (detectFileType(file) !== "xml" || !convenioId) return;
    
    setIsDetectando(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const CHUNK_SIZE = 32768;
      let base64 = '';
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
        base64 += String.fromCharCode.apply(null, Array.from(chunk));
      }
      base64 = btoa(base64);

      const result = await detectarPrestadoresMutation.mutateAsync({
        conteudo: base64,
        convenioId: parseInt(convenioId),
      });

      if (result.success && result.estabelecimentoSugerido) {
        setPrestadorDetectado(result.estabelecimentoSugerido);
        setEstabelecimentoSelecionado(result.estabelecimentoSugerido.estabelecimentoId.toString());
        toast.success(
          `Prestador detectado: ${result.estabelecimentoSugerido.codigoPrestador} - ${result.estabelecimentoSugerido.estabelecimentoNome}`,
          { duration: 5000 }
        );
      }

      if (result.prestadoresNaoCadastrados && result.prestadoresNaoCadastrados.length > 0) {
        setPrestadoresNaoCadastrados(result.prestadoresNaoCadastrados);
        toast.warning(
          `${result.prestadoresNaoCadastrados.length} prestador(es) não cadastrado(s): ${result.prestadoresNaoCadastrados.join(", ")}`,
          { duration: 8000 }
        );
      }
    } catch (error) {
      console.error("Erro ao detectar prestador:", error);
    } finally {
      setIsDetectando(false);
    }
  }, [convenioId, detectarPrestadoresMutation]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validExtensions = [".xml", ".xlsx", ".xls", ".pdf"];
    
    const validFiles = fileArray.filter(file => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      return validExtensions.includes(ext);
    });

    if (validFiles.length !== fileArray.length) {
      toast.warning("Alguns arquivos foram ignorados. Formatos aceitos: XML, Excel, PDF");
    }

    setSelectedFiles(prev => {
      const newFiles = validFiles.map(file => ({ file, status: "pending" as const }));
      const combined = [...prev, ...newFiles];
      
      if (combined.length > MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} arquivos permitidos. Alguns arquivos foram ignorados.`);
        return combined.slice(0, MAX_FILES);
      }
      
      return combined;
    });

    // Detectar prestador do primeiro arquivo XML
    const primeiroXml = validFiles.find(f => detectFileType(f) === "xml");
    if (primeiroXml && convenioId) {
      detectarPrestadorDoArquivo(primeiroXml);
    }
  }, [convenioId, detectarPrestadorDoArquivo]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !convenioId) {
      toast.error("Por favor, selecione pelo menos um arquivo e um convênio");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const pendingFiles = selectedFiles.filter(f => f.status === "pending" || f.status === "error");
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileItem = pendingFiles[i];
      const fileIndex = selectedFiles.findIndex(f => f.file === fileItem.file);
      
      // Update status to uploading
      setSelectedFiles(prev => prev.map((f, idx) => 
        idx === fileIndex ? { ...f, status: "uploading" as const } : f
      ));

      try {
        // Show progress for large files
        const fileSizeMB = fileItem.file.size / (1024 * 1024);
        if (fileSizeMB > 1) {
          toast.info(`Processando ${fileItem.file.name} (${fileSizeMB.toFixed(1)} MB)...`, {
            id: `processing-${fileIndex}`,
            duration: 60000,
          });
        }
        
        // Convert file to base64 with optimized chunked processing
        const buffer = await fileItem.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        
        // Use chunked base64 encoding for large files to avoid stack overflow
        const CHUNK_SIZE = 32768; // 32KB chunks
        let base64 = '';
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
          base64 += String.fromCharCode.apply(null, Array.from(chunk));
        }
        base64 = btoa(base64);

        // Usar estabelecimento selecionado, detectado ou o atual do contexto
        const estabId = estabelecimentoSelecionado 
          ? parseInt(estabelecimentoSelecionado) 
          : (prestadorDetectado?.estabelecimentoId || estabelecimentoAtual?.id || 0);

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
        setSelectedFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: "success" as const } : f
        ));
        
        // Mostrar feedback se foi reimportação ou processamento em background
        if (result.reimportado) {
          toast.info(`Arquivo "${fileItem.file.name}" atualizado (reimportação)`);
        }
        if (result.processandoEmBackground) {
          toast.info(`Arquivo "${fileItem.file.name}" enviado! Processamento em andamento...`, {
            duration: 5000,
            description: "Você pode continuar navegando. O progresso será atualizado automaticamente."
          });
        }
        successCount++;
      } catch (error) {
        console.error("Upload error:", error);
        // Update status to error
        setSelectedFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: "error" as const, error: "Erro ao enviar" } : f
        ));
        errorCount++;
      }

      // Update progress
      setUploadProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
    }

    // Show summary toast
    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} arquivo(s) enviado(s) com sucesso!`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`${successCount} arquivo(s) enviado(s), ${errorCount} com erro`);
    } else if (errorCount > 0) {
      toast.error(`Erro ao enviar ${errorCount} arquivo(s)`);
    }

    // Invalidate queries
    utils.arquivos.list.invalidate();
    utils.arquivos.stats.invalidate();
    utils.dashboard.resumo.invalidate();
    utils.dashboard.ultimosArquivos.invalidate();
    utils.procedimentos.list.invalidate();

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

  const pendingCount = selectedFiles.filter(f => f.status === "pending").length;
  const successCount = selectedFiles.filter(f => f.status === "success").length;
  const errorCount = selectedFiles.filter(f => f.status === "error").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Upload de Arquivos</h1>
          <p className="text-slate-500">
            Envie até {MAX_FILES} arquivos XML, Excel ou PDF de uma vez
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
                Arraste e solte os arquivos ou clique para selecionar
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
                  accept=".xml,.xlsx,.xls,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                />
                {isDragOver ? (
                  <div className="flex flex-col items-center gap-3">
                    <Files className="h-12 w-12 text-primary animate-bounce" />
                    <p className="font-medium text-primary">Solte os arquivos aqui</p>
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
                      <p className="font-medium text-slate-900">Arraste e solte os arquivos aqui</p>
                      <p className="text-sm text-slate-500">ou clique para selecionar</p>
                    </div>
                    <p className="text-xs text-slate-400">XML, Excel (.xlsx) ou PDF • Até {MAX_FILES} arquivos</p>
                  </div>
                )}
              </div>

              {/* File List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Arquivos selecionados</Label>
                    <Button variant="ghost" size="sm" onClick={clearAllFiles} className="text-xs h-auto py-1">
                      Limpar todos
                    </Button>
                  </div>
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
                          <span className="truncate">{item.file.name}</span>
                        </div>
                        {item.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
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
                        <span className="text-green-600">✓ {successCount} enviado(s)</span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-red-600">✗ {errorCount} com erro</span>
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
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Enviando arquivos...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* Form Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="direcao">Direção</Label>
                  <Select value={direcao} onValueChange={(v) => setDirecao(v as typeof direcao)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enviado">Enviado ao Convênio</SelectItem>
                      <SelectItem value="retornado">Retornado do Convênio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="convenio">Convênio</Label>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs">
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
                            <Label htmlFor="nomeConvenio">Nome do Convênio</Label>
                            <Input
                              id="nomeConvenio"
                              value={novoConvenioNome}
                              onChange={(e) => setNovoConvenioNome(e.target.value)}
                              placeholder="Ex: Unimed, Bradesco Saúde..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="codigoConvenio">Código (opcional)</Label>
                            <Input
                              id="codigoConvenio"
                              value={novoConvenioCodigo}
                              onChange={(e) => setNovoConvenioCodigo(e.target.value)}
                              placeholder="Ex: 001, UNI..."
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancelar
                          </Button>
                          <Button onClick={handleCriarConvenio} disabled={criarConvenioMutation.isPending}>
                            {criarConvenioMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Criar Convênio
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <Select value={convenioId} onValueChange={setConvenioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um convênio" />
                    </SelectTrigger>
                    <SelectContent>
                      {convenios?.map((conv) => (
                        <SelectItem key={conv.id} value={conv.id.toString()}>
                          {conv.nome} {conv.codigo ? `(${conv.codigo})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Seleção de Estabelecimento */}
              <div className="space-y-2">
                <Label htmlFor="estabelecimento">Estabelecimento</Label>
                {prestadorDetectado ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Prestador detectado automaticamente</span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      Código: <span className="font-mono">{prestadorDetectado.codigoPrestador}</span> → {prestadorDetectado.estabelecimentoNome}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-auto py-1 px-2 text-xs text-green-700"
                      onClick={() => {
                        setPrestadorDetectado(null);
                        setEstabelecimentoSelecionado("");
                      }}
                    >
                      Alterar estabelecimento
                    </Button>
                  </div>
                ) : (
                  <Select 
                    value={estabelecimentoSelecionado || (estabelecimentoAtual?.id?.toString() || "")}
                    onValueChange={setEstabelecimentoSelecionado}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um estabelecimento" />
                    </SelectTrigger>
                    <SelectContent>
                      {estabelecimentos?.map((est) => (
                        <SelectItem key={est.id} value={est.id.toString()}>
                          {est.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {isDetectando && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Detectando prestador do XML...
                  </div>
                )}
              </div>

              {/* Alerta de prestadores não cadastrados */}
              {prestadoresNaoCadastrados.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-700">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Prestadores não cadastrados</span>
                  </div>
                  <p className="text-sm text-yellow-600 mt-1">
                    Os seguintes códigos de prestador não estão cadastrados no sistema:
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {prestadoresNaoCadastrados.map((codigo) => (
                      <span key={codigo} className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-mono rounded">
                        {codigo}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-yellow-600 mt-2">
                    Cadastre os prestadores em Configurações → Prestadores para detecção automática.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="dataReferencia">Data de Referência (opcional)</Label>
                <Input
                  id="dataReferencia"
                  type="date"
                  value={dataReferencia}
                  onChange={(e) => setDataReferencia(e.target.value)}
                />
              </div>

              {/* Campo de Data de Pagamento - aparece apenas para arquivos retornados */}
              {direcao === "retornado" && (
                <div className="space-y-2">
                  <Label htmlFor="dataPagamento">Data de Pagamento (opcional)</Label>
                  <Input
                    id="dataPagamento"
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe a data de pagamento para calcular o prazo de recurso de glosa
                  </p>
                </div>
              )}

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || !convenioId || isUploading || pendingCount === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Enviando {selectedFiles.filter(f => f.status === "uploading").length > 0 ? "..." : ""}
                  </>
                ) : (
                  <>
                    <UploadIcon className="h-4 w-4 mr-2" />
                    Enviar {pendingCount > 0 ? `${pendingCount} Arquivo(s)` : "Arquivos"}
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
                    <p className="font-medium text-slate-900">Arraste ou selecione os arquivos</p>
                    <p className="text-sm text-slate-500">
                      Até {MAX_FILES} arquivos por vez: XML (TISS), Excel (.xlsx) e PDF
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-600">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Informe a direção</p>
                    <p className="text-sm text-slate-500">
                      Indique se os arquivos foram enviados ou retornados do convênio
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-blue-600">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Selecione o convênio</p>
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
                    <p className="font-medium text-slate-900">Processamento automático</p>
                    <p className="text-sm text-slate-500">
                      O sistema extrairá automaticamente os procedimentos de cada arquivo
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
                      Para melhor extração de dados, utilize arquivos XML no formato TISS 
                      ou planilhas Excel com colunas padronizadas (código, descrição, quantidade, valor).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
