import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import {
  Upload as UploadIcon,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  FileSpreadsheet,
  AlertCircle,
  Check,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number | string | null | undefined) => {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function RecebimentosPdfSaudeCaixa() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [convenioId, setConvenioId] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [dataReferencia, setDataReferencia] = useState<string>("");
  const [dataPagamento, setDataPagamento] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const importarPdf = trpc.financeiro.recebiveis.importarSaudeCaixaPdf.useMutation();
  const salvarSaudeCaixaNoDemonstrativo = trpc.financeiro.recebiveis.salvarSaudeCaixaNoDemonstrativo.useMutation();

  const handleProcessFile = async (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setLoading(true);
        const base64Data = (evt.target?.result as string).split(',')[1];
        const result = await importarPdf.mutateAsync({ base64File: base64Data });
        setItems(result.items || []);
        toast.success(`${result.items.length} itens extraídos do PDF!`);
      } catch (err: any) {
        toast.error("Erro ao importar: " + err.message);
        setSelectedFile(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProcessFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleProcessFile(file);
  }, []);

  const handleImportarTodos = async () => {
    if (items.length === 0 || !convenioId) {
      toast.error("Selecione um convênio antes de salvar");
      return;
    }
    if (!dataReferencia) {
      toast.error("Informe a Data de Referência (competência)");
      return;
    }
    try {
      setLoading(true);
      
      const itemsToSave = items.filter(i => !i.isNegativeBlock);

      await salvarSaudeCaixaNoDemonstrativo.mutateAsync({
        itens: itemsToSave,
        convenioId: parseInt(convenioId),
        dataReferencia: dataReferencia || undefined,
        dataPagamento: dataPagamento || undefined,
      });

      toast.success(`${itemsToSave.length} itens salvos no Demonstrativo com sucesso!`);
      setItems([]);
      setSelectedFile(null);
      setConvenioId("");
      setDataReferencia("");
      setDataPagamento("");
    } catch (error: any) {
      toast.error("Erro ao salvar itens: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              Importador Saúde Caixa
            </h1>
            <p className="text-slate-500 mt-1">
              Faça upload do Demonstrativo de Análise de Conta da Saúde Caixa (PDF Benner) para extrair e processar.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Lado Esquerdo - Upload e Conf */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UploadIcon className="h-5 w-5 text-blue-600" />
                  Arquivo e Configurações
                </CardTitle>
                <CardDescription>
                  Selecione o PDF e o convênio correspondente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Convênio</Label>
                  <Select value={convenioId} onValueChange={setConvenioId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o convênio" /></SelectTrigger>
                    <SelectContent>
                      {convenios?.map((conv: any) => (
                        <SelectItem key={conv.id} value={conv.id.toString()}>
                          {conv.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Data de Referência *</Label>
                    <Input 
                      type="date" 
                      value={dataReferencia} 
                      onChange={(e) => setDataReferencia(e.target.value)} 
                      placeholder="Competência"
                    />
                    <p className="text-[10px] text-slate-400">Mês/ano de competência</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Pagamento</Label>
                    <Input 
                      type="date" 
                      value={dataPagamento} 
                      onChange={(e) => setDataPagamento(e.target.value)} 
                      placeholder="Data pgto"
                    />
                    <p className="text-[10px] text-slate-400">Quando o convênio pagou</p>
                  </div>
                </div>

                {!selectedFile ? (
                  <div
                    className={`relative overflow-hidden border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer ${
                      isDragOver
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">Clique ou arraste o PDF aqui</p>
                        <p className="text-xs text-slate-500 mt-1">Apenas formato PDF do Saúde Caixa</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="h-8 w-8 text-blue-600 shrink-0" />
                      <div className="truncate">
                        <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                        <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setItems([]); }}>
                      <X className="h-4 w-4 text-slate-500" />
                    </Button>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  disabled={items.length === 0 || loading || !convenioId} 
                  onClick={handleImportarTodos}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-2" /> Salvar {items.filter(i => !i.isNegativeBlock).length} Itens no Demonstrativo</>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-blue-50/50">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900">Como funciona?</p>
                    <p className="text-sm text-blue-800 mt-1">
                      O sistema fará a leitura automática do PDF e listará todos os procedimentos, valores apresentados, valores pagos e glosas.
                    </p>
                    <p className="text-sm text-blue-800 mt-2 font-medium">
                      Ao clicar em Salvar, os dados alimentarão a tela de Demonstrativos e habilitarão os Recursos de Glosa.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lado Direito - Preview dos Dados */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-sm h-full flex flex-col">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Pré-visualização dos Dados</span>
                  {items.length > 0 && (
                    <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                      {items.length} linhas lidas
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 relative min-h-[400px]">
                {loading && items.length === 0 && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                    <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
                    <p className="text-slate-600 font-medium animate-pulse">Lendo e extraindo dados do PDF...</p>
                  </div>
                )}
                
                {items.length > 0 ? (
                  <ScrollArea className="h-[600px] w-full">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 shadow-sm">
                        <TableRow>
                          <TableHead className="w-[80px]">Guia</TableHead>
                          <TableHead className="w-[120px]">Paciente</TableHead>
                          <TableHead className="w-[85px]">Data</TableHead>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Cobrado</TableHead>
                          <TableHead className="text-right">Pago</TableHead>
                          <TableHead className="text-right">Glosa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow 
                            key={idx} 
                            className={cn(
                              item.isNegativeBlock && "opacity-50 bg-slate-50/50", 
                              item.isGlosa && !item.isNegativeBlock && "bg-orange-50/40"
                            )}
                          >
                            <TableCell className="text-xs font-mono text-blue-600">{item.guiaPrestador || "-"}</TableCell>
                            <TableCell className="text-xs truncate max-w-[120px]" title={item.pacienteNome || ""}>{item.pacienteNome || "-"}</TableCell>
                            <TableCell className="text-xs">{item.dataFaturamento}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{item.codigo}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm truncate max-w-[200px]" title={item.descricao}>{item.descricao}</span>
                                {item.motivoGlosa && (
                                  <span className="text-[10px] text-orange-600 flex items-center gap-1 mt-0.5 font-medium">
                                    <AlertTriangle className="h-3 w-3" /> Motivo: {item.motivoGlosa}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs">{item.quantidade}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(item.valorApresentado)}</TableCell>
                            <TableCell className="text-right text-xs font-medium text-emerald-600">{formatCurrency(item.valorPago)}</TableCell>
                            <TableCell className="text-right text-xs">
                              {item.valorGlosa > 0 ? (
                                <span className="text-red-600 font-semibold">-{formatCurrency(item.valorGlosa)}</span>
                              ) : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                    <FileText className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium text-slate-500">Nenhum dado para exibir</p>
                    <p className="text-sm mt-1 max-w-sm">
                      Faça o upload do PDF ao lado para visualizar a extração de dados antes de salvar no sistema.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
