import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { 
  Upload, 
  FileSpreadsheet, 
  GitCompare, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  ArrowRight,
  Download,
  RefreshCw,
  Loader2
} from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ConciliacaoResultado {
  totalEnviados: number;
  totalRetornados: number;
  conciliados: number;
  divergentes: number;
  naoEncontrados: number;
  valorTotalEnviado: number;
  valorTotalRetornado: number;
  diferencaTotal: number;
  itens: ItemConciliacao[];
}

interface ItemConciliacao {
  codigo: string;
  descricao: string;
  guia: string;
  dataExecucao: string;
  qtdEnviada: number;
  qtdRetornada: number;
  valorEnviado: number;
  valorRetornado: number;
  diferenca: number;
  status: "ok" | "divergente" | "nao_encontrado" | "extra";
}

export default function Conciliacao() {
  const { user } = useAuth();
  const [convenioId, setConvenioId] = useState<string>("");
  const [arquivoEnviadoId, setArquivoEnviadoId] = useState<string>("");
  const [arquivoRetorno, setArquivoRetorno] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultado, setResultado] = useState<ConciliacaoResultado | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });

  // Buscar arquivos enviados do convênio selecionado
  const { data: arquivosEnviados } = trpc.arquivos.list.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      direcao: "enviado",
      status: "processado"
    },
    { enabled: !!convenioId }
  );

  // Buscar procedimentos do arquivo selecionado
  const { data: procedimentosEnviados } = trpc.procedimentos.list.useQuery(
    { arquivoId: arquivoEnviadoId ? parseInt(arquivoEnviadoId) : undefined, pageSize: 1000 },
    { enabled: !!arquivoEnviadoId }
  );

  // Upload mutation
  const uploadMutation = trpc.arquivos.upload.useMutation();
  const utils = trpc.useUtils();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (["xlsx", "xls", "csv", "xml", "pdf"].includes(ext || "")) {
        setArquivoRetorno(file);
      } else {
        toast.error("Formato não suportado. Use Excel, CSV, XML ou PDF.");
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setArquivoRetorno(files[0]);
    }
  };

  const parseRetornoExcel = async (file: File): Promise<ItemConciliacao[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          // Encontrar cabeçalhos
          const headers = jsonData[0] || [];
          const rows = jsonData.slice(1);

          // Mapear colunas (flexível para diferentes formatos)
          const findColumn = (names: string[]) => {
            return headers.findIndex((h: string) => 
              names.some(n => String(h).toLowerCase().includes(n.toLowerCase()))
            );
          };

          const colCodigo = findColumn(["codigo", "código", "cod", "procedimento"]);
          const colDescricao = findColumn(["descricao", "descrição", "desc", "nome"]);
          const colGuia = findColumn(["guia", "numero_guia", "nº guia"]);
          const colQtd = findColumn(["quantidade", "qtd", "qtde"]);
          const colValor = findColumn(["valor", "total", "valor_total", "vlr"]);
          const colData = findColumn(["data", "data_execucao", "dt_exec"]);

          const itensRetorno: ItemConciliacao[] = rows
            .filter(row => row.length > 0 && row[colCodigo])
            .map(row => ({
              codigo: String(row[colCodigo] || "").trim(),
              descricao: colDescricao >= 0 ? String(row[colDescricao] || "") : "",
              guia: colGuia >= 0 ? String(row[colGuia] || "") : "",
              dataExecucao: colData >= 0 ? String(row[colData] || "") : "",
              qtdEnviada: 0,
              qtdRetornada: colQtd >= 0 ? Number(row[colQtd]) || 1 : 1,
              valorEnviado: 0,
              valorRetornado: colValor >= 0 ? parseFloat(String(row[colValor]).replace(",", ".")) || 0 : 0,
              diferenca: 0,
              status: "extra" as const,
            }));

          resolve(itensRetorno);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const executarConciliacao = async () => {
    if (!arquivoEnviadoId || !arquivoRetorno) {
      toast.error("Selecione o arquivo enviado e importe o arquivo de retorno");
      return;
    }

    setIsProcessing(true);

    try {
      // Parse do arquivo de retorno
      const itensRetorno = await parseRetornoExcel(arquivoRetorno);
      
      // Procedimentos enviados
      const enviados = procedimentosEnviados?.items || [];

      // Criar mapa de retornados por código + guia
      const retornadosMap = new Map<string, ItemConciliacao[]>();
      for (const item of itensRetorno) {
        const chave = `${item.codigo}|${item.guia}`;
        if (!retornadosMap.has(chave)) {
          retornadosMap.set(chave, []);
        }
        retornadosMap.get(chave)!.push(item);
      }

      // Processar conciliação
      const itensConciliados: ItemConciliacao[] = [];
      const chavesProcessadas = new Set<string>();

      for (const env of enviados) {
        const chave = `${env.codigo}|${env.guiaNumero || ""}`;
        const retornados = retornadosMap.get(chave) || [];
        chavesProcessadas.add(chave);

        if (retornados.length === 0) {
          // Não encontrado no retorno
          itensConciliados.push({
            codigo: env.codigo,
            descricao: env.descricao || "",
            guia: env.guiaNumero || "",
            dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
            qtdEnviada: env.quantidade || 0,
            qtdRetornada: 0,
            valorEnviado: parseFloat(env.valorTotal || "0"),
            valorRetornado: 0,
            diferenca: parseFloat(env.valorTotal || "0"),
            status: "nao_encontrado",
          });
        } else {
          // Encontrado - comparar valores
          const ret = retornados[0];
          const valorEnv = parseFloat(env.valorTotal || "0");
          const valorRet = ret.valorRetornado;
          const diferenca = valorEnv - valorRet;
          const status = Math.abs(diferenca) < 0.01 ? "ok" : "divergente";

          itensConciliados.push({
            codigo: env.codigo,
            descricao: env.descricao || "",
            guia: env.guiaNumero || "",
            dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
            qtdEnviada: env.quantidade || 0,
            qtdRetornada: ret.qtdRetornada,
            valorEnviado: valorEnv,
            valorRetornado: valorRet,
            diferenca,
            status,
          });
        }
      }

      // Adicionar itens extras do retorno (não enviados)
      for (const [chave, itens] of Array.from(retornadosMap.entries())) {
        if (!chavesProcessadas.has(chave)) {
          for (const item of itens) {
            itensConciliados.push({
              ...item,
              status: "extra",
              diferenca: -item.valorRetornado,
            });
          }
        }
      }

      // Calcular totais
      const valorTotalEnviado = itensConciliados.reduce((sum, i) => sum + i.valorEnviado, 0);
      const valorTotalRetornado = itensConciliados.reduce((sum, i) => sum + i.valorRetornado, 0);

      setResultado({
        totalEnviados: enviados.length,
        totalRetornados: itensRetorno.length,
        conciliados: itensConciliados.filter(i => i.status === "ok").length,
        divergentes: itensConciliados.filter(i => i.status === "divergente").length,
        naoEncontrados: itensConciliados.filter(i => i.status === "nao_encontrado").length,
        valorTotalEnviado,
        valorTotalRetornado,
        diferencaTotal: valorTotalEnviado - valorTotalRetornado,
        itens: itensConciliados,
      });

      // Fazer upload do arquivo de retorno para o sistema
      const fileBuffer = await arquivoRetorno.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      await uploadMutation.mutateAsync({
        nome: arquivoRetorno.name,
        conteudo: base64,
        tipoArquivo: arquivoRetorno.name.endsWith(".xml") ? "xml" : "excel",
        direcao: "retornado",
        convenioId: parseInt(convenioId),
      });

      utils.arquivos.list.invalidate();
      utils.dashboard.resumo.invalidate();

      toast.success("Conciliação realizada com sucesso!");
    } catch (error: any) {
      console.error("Erro na conciliação:", error);
      toast.error(error.message || "Erro ao processar conciliação");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = () => {
    if (!resultado) return;

    const excelData = resultado.itens.map(item => ({
      "Código": item.codigo,
      "Descrição": item.descricao,
      "Guia": item.guia,
      "Data Execução": item.dataExecucao,
      "Qtd Enviada": item.qtdEnviada,
      "Qtd Retornada": item.qtdRetornada,
      "Valor Enviado": item.valorEnviado,
      "Valor Retornado": item.valorRetornado,
      "Diferença": item.diferenca,
      "Status": item.status === "ok" ? "OK" : 
               item.status === "divergente" ? "Divergente" :
               item.status === "nao_encontrado" ? "Não Encontrado" : "Extra",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Conciliação");
    XLSX.writeFile(wb, `conciliacao_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge className="bg-green-100 text-green-700">OK</Badge>;
      case "divergente":
        return <Badge className="bg-amber-100 text-amber-700">Divergente</Badge>;
      case "nao_encontrado":
        return <Badge className="bg-red-100 text-red-700">Não Encontrado</Badge>;
      case "extra":
        return <Badge className="bg-blue-100 text-blue-700">Extra</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const itensFiltrados = resultado?.itens.filter(item => {
    if (filtroStatus === "todos") return true;
    return item.status === filtroStatus;
  }) || [];

  const formatCurrency = (value: number) => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conciliação Automática</h1>
          <p className="text-muted-foreground">
            Compare arquivos enviados com retornos dos convênios para identificar divergências
          </p>
        </div>

        {/* Seleção de arquivos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Arquivo Enviado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Arquivo Enviado
              </CardTitle>
              <CardDescription>Selecione o arquivo XML que foi enviado ao convênio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={(value) => {
                  setConvenioId(value);
                  setArquivoEnviadoId("");
                  setResultado(null);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {convenios?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Arquivo</label>
                <Select 
                  value={arquivoEnviadoId} 
                  onValueChange={(value) => {
                    setArquivoEnviadoId(value);
                    setResultado(null);
                  }}
                  disabled={!convenioId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o arquivo enviado" />
                  </SelectTrigger>
                  <SelectContent>
                    {arquivosEnviados?.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {arquivoEnviadoId && procedimentosEnviados && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600">
                    <strong>{procedimentosEnviados.total}</strong> procedimentos encontrados
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Arquivo de Retorno */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                Arquivo de Retorno
              </CardTitle>
              <CardDescription>Importe o arquivo Excel retornado pelo convênio</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-slate-200"
                } ${arquivoRetorno ? "bg-green-50 border-green-300" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {arquivoRetorno ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
                    <p className="font-medium">{arquivoRetorno.name}</p>
                    <p className="text-sm text-slate-500">
                      {(arquivoRetorno.size / 1024).toFixed(1)} KB
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setArquivoRetorno(null);
                        setResultado(null);
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 text-slate-400 mx-auto" />
                    <p className="text-slate-600">
                      Arraste o arquivo aqui ou{" "}
                      <label className="text-primary cursor-pointer hover:underline">
                        clique para selecionar
                        <input
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls,.csv,.xml,.pdf"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400">Excel, CSV, XML ou PDF</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botão de Conciliação */}
        <div className="flex justify-center">
          <Button 
            size="lg" 
            onClick={executarConciliacao}
            disabled={!arquivoEnviadoId || !arquivoRetorno || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <GitCompare className="h-5 w-5 mr-2" />
                Executar Conciliação
              </>
            )}
          </Button>
        </div>

        {/* Resultado da Conciliação */}
        {resultado && (
          <>
            {/* Cards de Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Conciliados</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700 mt-2">{resultado.conciliados}</p>
                </CardContent>
              </Card>

              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">Divergentes</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700 mt-2">{resultado.divergentes}</p>
                </CardContent>
              </Card>

              <Card className="bg-red-50 border-red-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-700">Não Encontrados</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700 mt-2">{resultado.naoEncontrados}</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-5 w-5 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">Diferença Total</span>
                  </div>
                  <p className={`text-2xl font-bold mt-2 ${resultado.diferencaTotal > 0 ? "text-red-600" : resultado.diferencaTotal < 0 ? "text-green-600" : "text-slate-700"}`}>
                    {formatCurrency(resultado.diferencaTotal)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Resumo de Valores */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-slate-500">Valor Total Enviado</p>
                    <p className="text-xl font-bold">{formatCurrency(resultado.valorTotalEnviado)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Valor Total Retornado</p>
                    <p className="text-xl font-bold">{formatCurrency(resultado.valorTotalRetornado)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Taxa de Conciliação</p>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(resultado.conciliados / resultado.totalEnviados) * 100} 
                        className="h-2 flex-1"
                      />
                      <span className="text-sm font-medium">
                        {((resultado.conciliados / resultado.totalEnviados) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Detalhes da Conciliação</CardTitle>
                    <CardDescription>
                      {itensFiltrados.length} item(ns) {filtroStatus !== "todos" ? `com status "${filtroStatus}"` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Filtrar status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="divergente">Divergentes</SelectItem>
                        <SelectItem value="nao_encontrado">Não Encontrados</SelectItem>
                        <SelectItem value="extra">Extras</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={handleExportExcel}>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Guia</TableHead>
                        <TableHead className="text-center">Qtd Env.</TableHead>
                        <TableHead className="text-center">Qtd Ret.</TableHead>
                        <TableHead className="text-right">Valor Env.</TableHead>
                        <TableHead className="text-right">Valor Ret.</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensFiltrados.slice(0, 100).map((item, index) => (
                        <TableRow key={index} className={item.status !== "ok" ? "bg-amber-50/50" : ""}>
                          <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                            {item.descricao || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.guia || "-"}</TableCell>
                          <TableCell className="text-center">{item.qtdEnviada}</TableCell>
                          <TableCell className="text-center">{item.qtdRetornada}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valorEnviado)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valorRetornado)}</TableCell>
                          <TableCell className={`text-right font-medium ${item.diferenca > 0 ? "text-red-600" : item.diferenca < 0 ? "text-green-600" : ""}`}>
                            {formatCurrency(item.diferenca)}
                          </TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {itensFiltrados.length > 100 && (
                  <p className="text-sm text-slate-500 mt-4 text-center">
                    Mostrando 100 de {itensFiltrados.length} itens. Exporte para ver todos.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
