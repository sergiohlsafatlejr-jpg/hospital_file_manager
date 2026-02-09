import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Files,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  DollarSign,
  TrendingDown,
  Layers2,
  Trash2,
  FolderOpen,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface FileItem {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const MAX_FILES = 30;

export default function RecebimentosExcel() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [activeTab, setActiveTab] = useState("listagem");

  // Upload state
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [convenioId, setConvenioId] = useState<string>("");
  const [dataReferencia, setDataReferencia] = useState<string>("");
  const [dataPagamento, setDataPagamento] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [estabelecimentoSelecionado, setEstabelecimentoSelecionado] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listagem state
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Competência
  const [mesRef, setMesRef] = useState<string>("");
  const [anoRef, setAnoRef] = useState<string>("");

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: estabelecimentos } = trpc.estabelecimentos.list.useQuery({});
  const uploadMutation = trpc.arquivos.upload.useMutation();
  const utils = trpc.useUtils();

  // Buscar dados de recebimentos_excel
  const mesReferencia = mesRef ? parseInt(mesRef) : undefined;
  const anoReferencia = anoRef ? parseInt(anoRef) : undefined;

  const { data: recebimentoData, isLoading, refetch } = trpc.recebimentosExcel.list.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: filtroConvenio ? parseInt(filtroConvenio) : undefined,
      search: buscaDebounced || undefined,
      mesReferencia,
      anoReferencia,
      page,
      limit: pageSize,
    },
    { enabled: !!estabelecimentoAtual }
  );

  const { data: resumo } = trpc.recebimentosExcel.resumo.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: filtroConvenio ? parseInt(filtroConvenio) : undefined,
      mesReferencia,
      anoReferencia,
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaDebounced(busca);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => { setPage(1); }, [filtroConvenio, mesRef, anoRef]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    // Apenas Excel
    const validFiles = fileArray.filter(file => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ext === "xlsx" || ext === "xls";
    });
    if (validFiles.length !== fileArray.length) {
      toast.warning("Apenas arquivos Excel (.xlsx, .xls) são aceitos nesta tela. Outros formatos foram ignorados.");
    }
    if (validFiles.length === 0) return;

    setSelectedFiles(prev => {
      const newFiles = validFiles.map(file => ({ file, status: "pending" as const }));
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_FILES) {
        toast.error(`Máximo de ${MAX_FILES} arquivos permitidos.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) addFiles(files);
  }, [addFiles]);

  const removeFile = (index: number) => setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  const clearAllFiles = () => setSelectedFiles([]);

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !convenioId) {
      toast.error("Selecione pelo menos um arquivo Excel e um convênio");
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
      setSelectedFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "uploading" as const } : f));

      try {
        const buffer = await fileItem.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const CHUNK_SIZE = 32768;
        let base64 = '';
        for (let j = 0; j < bytes.length; j += CHUNK_SIZE) {
          const chunk = bytes.subarray(j, Math.min(j + CHUNK_SIZE, bytes.length));
          base64 += String.fromCharCode.apply(null, Array.from(chunk));
        }
        base64 = btoa(base64);

        const estabId = estabelecimentoSelecionado
          ? parseInt(estabelecimentoSelecionado)
          : (estabelecimentoAtual?.id || 0);

        await uploadMutation.mutateAsync({
          nome: fileItem.file.name,
          tipoArquivo: "excel",
          direcao: "retornado",
          convenioId: parseInt(convenioId),
          estabelecimentoId: estabId,
          conteudo: base64,
          dataReferencia: dataReferencia || undefined,
          dataPagamento: dataPagamento || undefined,
        });

        setSelectedFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "success" as const } : f));
        successCount++;
      } catch (error) {
        console.error("Upload error:", error);
        setSelectedFiles(prev => prev.map((f, idx) => idx === fileIndex ? { ...f, status: "error" as const, error: "Erro ao enviar" } : f));
        errorCount++;
      }
      setUploadProgress(Math.round(((i + 1) / pendingFiles.length) * 100));
    }

    if (successCount > 0 && errorCount === 0) toast.success(`${successCount} arquivo(s) Excel importado(s) com sucesso! Demonstrativo atualizado.`);
    else if (successCount > 0) toast.warning(`${successCount} importado(s), ${errorCount} com erro`);
    else toast.error(`Erro ao importar ${errorCount} arquivo(s)`);

    // Invalidar queries
    utils.recebimentosExcel.list.invalidate();
    utils.recebimentosExcel.resumo.invalidate();
    utils.demonstrativo.contas.invalidate();
    utils.demonstrativo.resumo.invalidate();
    utils.demonstrativo.competencias.invalidate();
    utils.arquivos.list.invalidate();

    setIsUploading(false);
    if (successCount > 0) setActiveTab("listagem");
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = typeof value === "string" ? parseFloat(value) : (value || 0);
    if (isNaN(num)) return "R$ 0,00";
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return "-";
    try {
      const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
      return d.toLocaleDateString("pt-BR");
    } catch { return "-"; }
  };

  const handleExportExcel = () => {
    if (!recebimentoData?.items || recebimentoData.items.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    const excelData = (recebimentoData.items as any[]).map((item: any) => ({
      "Guia": item.numeroGuia || "",
      "Beneficiário": item.nomeBeneficiario || "",
      "Código": item.codigoProcedimento || "",
      "Descrição": item.descricaoProcedimento || "",
      "Tipo Lançamento": item.tipoLancamento || "",
      "Valor Cobrado": parseFloat(item.valorCobrado || "0"),
      "Valor Pago": parseFloat(item.valorPago || "0"),
      "Valor Glosado": parseFloat(item.valorGlosado || "0"),
      "Código Glosa": item.codigoGlosa || "",
      "Situação": item.situacaoItem || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = Array(10).fill({ wch: 18 });
    XLSX.utils.book_append_sheet(wb, ws, "Recebimentos Excel");
    XLSX.writeFile(wb, `recebimentos_excel_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Exportação concluída!");
  };

  const pendingCount = selectedFiles.filter(f => f.status === "pending").length;
  const successCountFiles = selectedFiles.filter(f => f.status === "success").length;
  const errorCountFiles = selectedFiles.filter(f => f.status === "error").length;

  const anos = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  const meses = [
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" }, { value: "4", label: "Abril" },
    { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const items = recebimentoData?.items || [];
  const totalItems = recebimentoData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
              Recebimentos Excel
            </h1>
            <p className="text-slate-500 mt-1">
              Importe planilhas Excel de retorno dos convênios. Os dados populam automaticamente o Demonstrativo.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetch(); toast.success("Dados atualizados"); }}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Itens</p>
                  <p className="text-2xl font-bold text-slate-900">{resumo?.totalItens?.toLocaleString("pt-BR") || totalItems.toLocaleString("pt-BR") || 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Layers2 className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Valor Total</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(resumo?.valorTotal)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Itens Pagos</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(resumo?.totalPagos)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Itens Glosados</p>
                  <p className="text-2xl font-bold text-red-600">{resumo?.totalGlosados?.toLocaleString("pt-BR") || 0}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="listagem">Itens Recebidos</TabsTrigger>
            <TabsTrigger value="arquivos">Arquivos Importados</TabsTrigger>
            <TabsTrigger value="upload">Importar Excel</TabsTrigger>
          </TabsList>

          {/* Tab: Listagem */}
          <TabsContent value="listagem" className="space-y-4">
            {/* Filtros */}
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input placeholder="Buscar por guia, paciente, código..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10" />
                    </div>
                  </div>
                  <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos Convênios" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Convênios</SelectItem>
                      {convenios?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={mesRef} onValueChange={setMesRef}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Todos Meses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Meses</SelectItem>
                      {meses.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={anoRef} onValueChange={setAnoRef}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Todos Anos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Anos</SelectItem>
                      {anos.map(a => (
                        <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tabela */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileSpreadsheet className="h-16 w-16 text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-600">Nenhum recebimento Excel encontrado</h3>
                    <p className="text-sm text-slate-400 mt-1">Importe planilhas Excel de retorno na aba "Importar Excel"</p>
                    <Button className="mt-4" onClick={() => setActiveTab("upload")}>
                      <UploadIcon className="h-4 w-4 mr-2" /> Importar Excel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Guia</TableHead>
                            <TableHead>Beneficiário</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Tipo Lançamento</TableHead>
                            <TableHead className="text-right">Vl. Cobrado</TableHead>
                            <TableHead className="text-right">Vl. Pago</TableHead>
                            <TableHead className="text-right">Vl. Glosado</TableHead>
                            <TableHead>Cód. Glosa</TableHead>
                            <TableHead>Situação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item: any, idx: number) => {
                            const valorGlosado = parseFloat(item.valorGlosado || "0");
                            return (
                              <TableRow key={item.id || idx} className={valorGlosado > 0 ? "bg-red-50/50" : ""}>
                                <TableCell className="font-mono text-xs">{item.numeroGuia || "-"}</TableCell>
                                <TableCell className="max-w-[150px] truncate text-sm">{item.nomeBeneficiario || "-"}</TableCell>
                                <TableCell className="font-mono text-xs">{item.codigoProcedimento || "-"}</TableCell>
                                <TableCell className="max-w-[200px] truncate text-sm">{item.descricaoProcedimento || "-"}</TableCell>
                                <TableCell className="text-xs">{item.tipoLancamento || "-"}</TableCell>
                                <TableCell className="text-right text-sm">{formatCurrency(item.valorCobrado)}</TableCell>
                                <TableCell className="text-right text-sm font-medium text-green-700">{formatCurrency(item.valorPago)}</TableCell>
                                <TableCell className="text-right text-sm font-medium text-red-600">{valorGlosado > 0 ? formatCurrency(valorGlosado) : "-"}</TableCell>
                                <TableCell>
                                  {item.codigoGlosa ? (
                                    <Badge variant="destructive" className="text-xs font-mono">{item.codigoGlosa}</Badge>
                                  ) : "-"}
                                </TableCell>
                                <TableCell>
                                  {item.situacaoItem ? (
                                    <Badge variant={item.situacaoItem === "PAGO" ? "default" : "secondary"} className="text-xs">
                                      {item.situacaoItem}
                                    </Badge>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Paginação */}
                    <div className="flex items-center justify-between px-6 py-4 border-t">
                      <p className="text-sm text-slate-500">
                        Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, totalItems)} de {totalItems.toLocaleString("pt-BR")} itens
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-slate-600">Página {page} de {totalPages || 1}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Upload */}
          <TabsContent value="upload" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                    Importar Excel de Retorno
                  </CardTitle>
                  <CardDescription>
                    Arraste e solte planilhas Excel de retorno dos convênios. Os dados serão processados e consolidados no Demonstrativo automaticamente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Drop Zone */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      isDragOver ? "border-emerald-500 bg-emerald-50 scale-[1.02]" :
                      selectedFiles.length > 0 ? "border-green-300 bg-green-50" :
                      "border-slate-200 hover:border-emerald-400 hover:bg-slate-50"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" multiple />
                    {isDragOver ? (
                      <div className="flex flex-col items-center gap-3">
                        <Files className="h-12 w-12 text-emerald-500 animate-bounce" />
                        <p className="font-medium text-emerald-600">Solte as planilhas aqui</p>
                      </div>
                    ) : selectedFiles.length > 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                        <p className="font-medium text-slate-900">{selectedFiles.length} arquivo(s) selecionado(s)</p>
                        <p className="text-sm text-slate-500">Clique ou arraste para adicionar mais</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <UploadIcon className="h-12 w-12 text-slate-400" />
                        <p className="font-medium text-slate-900">Arraste e solte as planilhas Excel aqui</p>
                        <p className="text-sm text-slate-500">ou clique para selecionar</p>
                        <p className="text-xs text-slate-400">Apenas arquivos Excel (.xlsx, .xls) de retorno dos convênios</p>
                      </div>
                    )}
                  </div>

                  {/* File List */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Arquivos selecionados</Label>
                        <Button variant="ghost" size="sm" onClick={clearAllFiles} className="text-xs h-auto py-1">Limpar todos</Button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                        {selectedFiles.map((item, index) => (
                          <div key={index} className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                            item.status === "success" ? "bg-green-50 text-green-700" :
                            item.status === "error" ? "bg-red-50 text-red-700" :
                            item.status === "uploading" ? "bg-emerald-50 text-emerald-700" :
                            "bg-slate-50 text-slate-700"
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              {item.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> :
                               item.status === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> :
                               item.status === "error" ? <AlertCircle className="h-4 w-4 shrink-0" /> :
                               <FileText className="h-4 w-4 shrink-0" />}
                              <span className="truncate">{item.file.name}</span>
                            </div>
                            {item.status === "pending" && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); removeFile(index); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      {(successCountFiles > 0 || errorCountFiles > 0) && (
                        <div className="flex gap-4 text-xs text-slate-500 pt-2">
                          {successCountFiles > 0 && <span className="text-green-600">✓ {successCountFiles} importado(s)</span>}
                          {errorCountFiles > 0 && <span className="text-red-600">✗ {errorCountFiles} com erro</span>}
                          {pendingCount > 0 && <span>• {pendingCount} pendente(s)</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Progress */}
                  {isUploading && (
                    <div className="space-y-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                        <span className="font-medium text-emerald-900">Importando planilhas...</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-emerald-600">Os dados serão sincronizados automaticamente com o Demonstrativo.</p>
                    </div>
                  )}

                  {/* Form Fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Convênio</Label>
                      <Select value={convenioId} onValueChange={setConvenioId}>
                        <SelectTrigger><SelectValue placeholder="Selecione um convênio" /></SelectTrigger>
                        <SelectContent>
                          {convenios?.map((conv: any) => (
                            <SelectItem key={conv.id} value={conv.id.toString()}>
                              {conv.nome} {conv.codigo ? `(${conv.codigo})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estabelecimento</Label>
                      <Select value={estabelecimentoSelecionado || (estabelecimentoAtual?.id?.toString() || "")} onValueChange={setEstabelecimentoSelecionado}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {estabelecimentos?.map((est: any) => (
                            <SelectItem key={est.id} value={est.id.toString()}>{est.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data de Referência (opcional)</Label>
                      <Input type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Data de Pagamento (opcional)</Label>
                      <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Para cálculo do prazo de recurso de glosa</p>
                    </div>
                  </div>

                  <Button className="w-full" size="lg" onClick={handleUpload} disabled={selectedFiles.length === 0 || !convenioId || isUploading || pendingCount === 0}>
                    {isUploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando...</>
                    ) : (
                      <><UploadIcon className="h-4 w-4 mr-2" /> Importar {pendingCount > 0 ? `${pendingCount} Planilha(s)` : "Planilhas"}</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Instruções */}
              <div className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Como funciona</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-medium text-emerald-600">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Selecione as planilhas de retorno</p>
                        <p className="text-sm text-slate-500">Arraste ou clique para selecionar até {MAX_FILES} arquivos Excel de retorno do convênio</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-medium text-emerald-600">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Informe o convênio</p>
                        <p className="text-sm text-slate-500">Selecione o convênio que enviou o retorno</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Demonstrativo atualizado</p>
                        <p className="text-sm text-slate-500">Os dados são processados e o Demonstrativo é populado automaticamente com os valores de pagamento e glosa</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-emerald-50">
                  <CardContent className="pt-6">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-medium text-emerald-900">Fluxo de dados</p>
                        <p className="text-sm text-emerald-700">
                          Excel de retorno → Recebimentos Excel → <strong>Demonstrativo</strong> (consolidado automaticamente)
                        </p>
                        <p className="text-sm text-emerald-700 mt-2">
                          O Demonstrativo consolida dados de Recebimentos XML e Recebimentos Excel.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          {/* Tab: Arquivos Importados */}
          <TabsContent value="arquivos" className="space-y-4">
            <ArquivosImportadosExcelTab
              estabelecimentoId={estabelecimentoAtual?.id}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              onDeleted={() => {
                utils.recebimentosExcel.list.invalidate();
                utils.recebimentosExcel.resumo.invalidate();
                utils.demonstrativo.contas.invalidate();
                utils.demonstrativo.resumo.invalidate();
                utils.demonstrativo.competencias.invalidate();
                utils.arquivos.list.invalidate();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// Componente separado para a aba de Arquivos Importados
function ArquivosImportadosExcelTab({
  estabelecimentoId,
  formatCurrency,
  formatDate,
  onDeleted,
}: {
  estabelecimentoId?: number;
  formatCurrency: (v: any) => string;
  formatDate: (v: any) => string;
  onDeleted: () => void;
}) {
  const { data: arquivos, isLoading, refetch } = trpc.arquivos.list.useQuery(
    {
      estabelecimentoId,
      direcao: "retornado",
      tipoArquivo: "excel",
    },
    { enabled: !!estabelecimentoId }
  );

  const deleteMutation = trpc.arquivos.delete.useMutation({
    onSuccess: () => {
      toast.success("Arquivo e todos os dados relacionados foram excluídos com sucesso!");
      refetch();
      onDeleted();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const arquivosList = (arquivos as any[])?.filter((a: any) => a.direcao === "retornado" && (a.tipoArquivo === "excel" || a.nome?.toLowerCase().endsWith(".xlsx") || a.nome?.toLowerCase().endsWith(".xls"))) || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-emerald-600" />
          Arquivos Excel Importados
        </CardTitle>
        <CardDescription>
          Lista de arquivos Excel de retorno importados. Ao excluir um arquivo, todos os dados relacionados (recebimentos e demonstrativo) serão removidos automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : arquivosList.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Nenhum arquivo Excel importado</p>
            <p className="text-sm mt-1">Importe arquivos Excel na aba "Importar Excel"</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Arquivo</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead>Data Import.</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arquivosList.map((arquivo: any) => (
                <TableRow key={arquivo.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                      <span className="truncate max-w-[250px]">{arquivo.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell>{arquivo.convenioNome || "-"}</TableCell>
                  <TableCell>{formatDate(arquivo.createdAt)}</TableCell>
                  <TableCell className="text-right">{arquivo.totalItens || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={arquivo.status === "processado" ? "default" : "secondary"} className="text-xs">
                      {arquivo.status || "pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir arquivo e dados relacionados?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação irá excluir o arquivo <strong>{arquivo.nome}</strong> e todos os dados relacionados:
                            <ul className="list-disc ml-4 mt-2 space-y-1">
                              <li>Itens de recebimentos Excel</li>
                              <li>Registros no demonstrativo</li>
                            </ul>
                            <p className="mt-2 font-medium text-red-600">Esta ação não pode ser desfeita.</p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => deleteMutation.mutate({ id: arquivo.id })}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
