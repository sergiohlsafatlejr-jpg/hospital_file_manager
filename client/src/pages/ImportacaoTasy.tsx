import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Upload,
  Database,
  FileSpreadsheet,
  Calendar,
  Package,
  Stethoscope,
  DollarSign,
  Building2,
  RefreshCw,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Search,
  Filter,
  Play,
} from "lucide-react";

// Tamanho do lote para envio ao servidor
const BATCH_SIZE = 500;

// Tipo para os dados do Tasy
interface DadoTasy {
  atendimento: string;
  nrInternoConta?: string;
  sequencia?: string;
  dataFaturado?: string;
  guia?: string;
  convenio?: string;
  paciente?: string;
  dataConta?: string;
  codigo?: string;
  codigoConvenio?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  valorUnitario?: number;
  valorTotal?: number;
  setor?: string;
  protocolo?: string;
  statusProtocolo?: string;
  tipo: 'MATERIAL' | 'HONORARIO';
  medico?: string;
  funcaoMedico?: string;
  crm?: string;
  valorMedico?: number;
}

export default function ImportacaoTasy() {
  const { estabelecimentoAtual, selecionado } = useEstabelecimento();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStats, setProcessingStats] = useState({ total: 0, processados: 0, inseridos: 0, ignorados: 0, erros: 0 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDadosDialog, setShowDadosDialog] = useState(false);
  const [filtroConvenio, setFiltroConvenio] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [pendingImportacao, setPendingImportacao] = useState<{ id: number; dados: DadoTasy[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: importacoes, refetch: refetchImportacoes } = trpc.importacaoTasy.list.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual && estabelecimentoAtual.id > 0 }
  );

  const { data: estatisticas, refetch: refetchEstatisticas } = trpc.importacaoTasy.estatisticas.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual && estabelecimentoAtual.id > 0 }
  );

  const { data: dadosPorConvenio } = trpc.importacaoTasy.porConvenio.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual && estabelecimentoAtual.id > 0 }
  );

  const { data: dadosImportados, refetch: refetchDados } = trpc.importacaoTasy.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      convenio: filtroConvenio || undefined,
      tipo: filtroTipo as 'MATERIAL' | 'HONORARIO' | undefined,
      limite: 100,
    },
    { enabled: !!estabelecimentoAtual && estabelecimentoAtual.id > 0 && showDadosDialog }
  );

  // Mutations
  const uploadMutation = trpc.importacaoTasy.upload.useMutation();
  const processarMutation = trpc.importacaoTasy.processar.useMutation();
  const deleteMutation = trpc.importacaoTasy.delete.useMutation();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Verifica extensão
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'db' && ext !== 'sqlite' && ext !== 'sqlite3') {
        toast.error("Formato inválido", {
          description: "Por favor, selecione um arquivo SQLite (.db, .sqlite ou .sqlite3)",
        });
        return;
      }
      setSelectedFile(file);
      setPendingImportacao(null);
    }
  };

  // Função para ler o SQLite usando sql.js
  const readSQLiteFile = async (file: File): Promise<DadoTasy[]> => {
    // Carrega sql.js dinamicamente
    const initSqlJs = (window as any).initSqlJs;
    if (!initSqlJs) {
      // Carrega a biblioteca se ainda não estiver carregada
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Falha ao carregar sql.js'));
        document.head.appendChild(script);
      });
    }

    // Inicializa sql.js
    const SQL = await (window as any).initSqlJs({
      locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    // Lê o arquivo como ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(arrayBuffer));

    // Busca os nomes das tabelas
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!tables.length || !tables[0].values.length) {
      throw new Error("Nenhuma tabela encontrada no arquivo SQLite");
    }

    const tableNames = tables[0].values.map((row: any[]) => row[0] as string);
    console.log("Tabelas encontradas:", tableNames);

    // Tenta encontrar a tabela de dados
    let tableName = tableNames.find((t: string) => 
      t.toLowerCase().includes('dados') || 
      t.toLowerCase().includes('tasy') ||
      t.toLowerCase().includes('material') ||
      t.toLowerCase().includes('honorario')
    ) || tableNames[0];

    // Lê todos os dados da tabela
    const result = db.exec(`SELECT * FROM "${tableName}"`);
    if (!result.length) {
      throw new Error(`Tabela "${tableName}" está vazia`);
    }

    const columns = result[0].columns.map((c: string) => c.toLowerCase());
    const rows = result[0].values;

    console.log("Colunas encontradas:", columns);
    console.log("Total de linhas:", rows.length);

    // Mapeia os dados para o formato esperado
    const dados: DadoTasy[] = rows.map((row: any[]) => {
      const getCol = (names: string[]): any => {
        for (const name of names) {
          const idx = columns.indexOf(name.toLowerCase());
          if (idx !== -1) return row[idx];
        }
        return undefined;
      };

      // Determina o tipo baseado nos dados
      const tipo = getCol(['tipo']) || 
        (getCol(['medico', 'nm_medico', 'crm', 'nr_crm']) ? 'HONORARIO' : 'MATERIAL');

      return {
        atendimento: String(getCol(['atendimento', 'nr_atendimento']) || ''),
        nrInternoConta: getCol(['nr_interno_conta', 'nrinternoConta', 'conta']) ? String(getCol(['nr_interno_conta', 'nrinternoConta', 'conta'])) : undefined,
        sequencia: getCol(['sequencia', 'nr_sequencia', 'sequencia_item']) ? String(getCol(['sequencia', 'nr_sequencia', 'sequencia_item'])) : undefined,
        dataFaturado: getCol(['data_faturado', 'dt_mesano_referencia', 'data']) || undefined,
        guia: getCol(['guia', 'nr_doc_convenio']) ? String(getCol(['guia', 'nr_doc_convenio'])) : undefined,
        convenio: getCol(['convenio', 'ds_convenio']) || undefined,
        paciente: getCol(['paciente', 'nm_paciente']) || undefined,
        dataConta: getCol(['data_conta', 'dt_conta', 'data_procedimento', 'dt_procedimento']) || undefined,
        codigo: getCol(['codigo', 'cod_material', 'cd_material', 'cd_procedimento', 'codigo_tasy']) ? String(getCol(['codigo', 'cod_material', 'cd_material', 'cd_procedimento', 'codigo_tasy'])) : undefined,
        codigoConvenio: getCol(['codigo_convenio', 'cd_procedimento_convenio']) ? String(getCol(['codigo_convenio', 'cd_procedimento_convenio'])) : undefined,
        descricao: getCol(['descricao', 'ds_material', 'ds_proc_convenio']) || undefined,
        quantidade: parseFloat(getCol(['quantidade', 'qt_material', 'qt_procedimento'])) || 1,
        unidade: getCol(['unidade', 'cd_unidade_medida']) || undefined,
        valorUnitario: parseFloat(getCol(['valor_unitario', 'vl_unitario', 'vl_procedimento'])) || 0,
        valorTotal: parseFloat(getCol(['valor_total', 'vl_total', 'vl_material'])) || 0,
        setor: getCol(['setor', 'ds_setor_atendimento']) || undefined,
        protocolo: getCol(['protocolo', 'nr_protocolo', 'protocolo_convenio']) ? String(getCol(['protocolo', 'nr_protocolo', 'protocolo_convenio'])) : undefined,
        statusProtocolo: getCol(['status_protocolo', 'ie_status_protocolo']) || undefined,
        tipo: tipo.toUpperCase() === 'HONORARIO' ? 'HONORARIO' : 'MATERIAL',
        medico: getCol(['medico', 'nm_medico']) || undefined,
        funcaoMedico: getCol(['funcao_medico', 'ds_funcao', 'funcao']) || undefined,
        crm: getCol(['crm', 'nr_crm']) ? String(getCol(['crm', 'nr_crm'])) : undefined,
        valorMedico: parseFloat(getCol(['valor_medico', 'vl_medico'])) || undefined,
      };
    }).filter((d: DadoTasy) => d.atendimento); // Remove registros sem atendimento

    db.close();
    return dados;
  };

  const handleUpload = async () => {
    if (!selectedFile || !estabelecimentoAtual || estabelecimentoAtual.id === 0) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Lê o arquivo SQLite
      toast.info("Lendo arquivo SQLite...");
      const dados = await readSQLiteFile(selectedFile);
      setUploadProgress(50);

      if (dados.length === 0) {
        toast.error("Arquivo vazio", {
          description: "Nenhum dado válido encontrado no arquivo SQLite",
        });
        return;
      }

      toast.info(`${dados.length.toLocaleString()} registros encontrados`);

      // Cria o registro de importação (sem enviar o arquivo completo)
      const result = await uploadMutation.mutateAsync({
        estabelecimentoId: estabelecimentoAtual.id,
        nomeArquivo: selectedFile.name,
        tamanhoArquivo: selectedFile.size,
        conteudoBase64: btoa('placeholder'), // Não precisamos armazenar o arquivo
      });

      setUploadProgress(70);

      // Armazena os dados para processamento
      setPendingImportacao({ id: result.id, dados });
      setUploadProgress(100);

      toast.success("Arquivo lido com sucesso!", {
        description: `${dados.length.toLocaleString()} registros prontos para importação. Clique em "Processar" para iniciar.`,
      });

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      refetchImportacoes();
    } catch (error: any) {
      console.error("Erro ao processar arquivo:", error);
      toast.error("Erro ao processar arquivo", {
        description: error.message || "Não foi possível ler o arquivo SQLite",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleProcessar = async () => {
    if (!pendingImportacao) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingStats({ total: pendingImportacao.dados.length, processados: 0, inseridos: 0, ignorados: 0, erros: 0 });

    const { id, dados } = pendingImportacao;
    let totalInseridos = 0;
    let totalIgnorados = 0;
    let totalErros = 0;

    try {
      // Processa em lotes
      const totalBatches = Math.ceil(dados.length / BATCH_SIZE);
      
      for (let i = 0; i < dados.length; i += BATCH_SIZE) {
        const batch = dados.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        try {
          const result = await processarMutation.mutateAsync({
            importacaoId: id,
            dados: batch,
          });

          totalInseridos += result.inseridos;
          totalIgnorados += result.ignorados;
          totalErros += result.erros;

          const processados = Math.min(i + BATCH_SIZE, dados.length);
          const progress = Math.round((processados / dados.length) * 100);
          
          setProcessingProgress(progress);
          setProcessingStats({
            total: dados.length,
            processados,
            inseridos: totalInseridos,
            ignorados: totalIgnorados,
            erros: totalErros,
          });

          // Pequena pausa entre lotes para não sobrecarregar
          if (i + BATCH_SIZE < dados.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          console.error(`Erro no lote ${batchNum}:`, error);
          totalErros += batch.length;
        }
      }

      toast.success("Importação concluída!", {
        description: `${totalInseridos.toLocaleString()} inseridos, ${totalIgnorados.toLocaleString()} ignorados, ${totalErros.toLocaleString()} erros`,
      });

      setPendingImportacao(null);
      refetchImportacoes();
      refetchEstatisticas();
    } catch (error: any) {
      toast.error("Erro na importação", {
        description: error.message || "Ocorreu um erro durante a importação",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Importação excluída", {
        description: "A importação e seus dados foram excluídos com sucesso",
      });
      refetchImportacoes();
      refetchEstatisticas();
    } catch (error: any) {
      toast.error("Erro ao excluir", {
        description: error.message || "Não foi possível excluir a importação",
      });
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "0";
    return num.toLocaleString("pt-BR");
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "aguardando":
        return <Badge variant="outline" className="bg-gray-100"><Clock className="h-3 w-3 mr-1" />Aguardando</Badge>;
      case "processando":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>;
      case "concluido":
        return <Badge variant="outline" className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Concluído</Badge>;
      case "concluido_parcial":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-700"><AlertTriangle className="h-3 w-3 mr-1" />Parcial</Badge>;
      case "erro":
        return <Badge variant="outline" className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6" />
              Importação de Dados do Tasy
            </h1>
            <p className="text-muted-foreground mt-1">
              Importe dados de materiais e honorários do sistema Tasy
            </p>
          </div>
          <Button onClick={() => setShowDadosDialog(true)} variant="outline">
            <Eye className="h-4 w-4 mr-2" />
            Ver Dados Importados
          </Button>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Registros</p>
                  <p className="text-2xl font-bold">{formatNumber(estatisticas?.totalRegistros)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Materiais</p>
                  <p className="text-2xl font-bold">{formatNumber(estatisticas?.totalMateriais)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(estatisticas?.valorTotalMateriais))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Stethoscope className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Honorários</p>
                  <p className="text-2xl font-bold">{formatNumber(estatisticas?.totalHonorarios)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(estatisticas?.valorTotalHonorarios))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Building2 className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Convênios</p>
                  <p className="text-2xl font-bold">{formatNumber(estatisticas?.totalConvenios)}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(estatisticas?.totalAtendimentos)} atendimentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Arquivo SQLite
            </CardTitle>
            <CardDescription>
              Selecione o arquivo SQLite exportado do Tasy com os dados unificados de materiais e honorários
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label htmlFor="file">Arquivo SQLite</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".db,.sqlite,.sqlite3"
                    onChange={handleFileSelect}
                    ref={fileInputRef}
                    disabled={isUploading || isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formatos aceitos: .db, .sqlite, .sqlite3
                  </p>
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading || isProcessing}
                  className="mt-6"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Lendo...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Ler Arquivo
                    </>
                  )}
                </Button>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Lendo arquivo SQLite... {uploadProgress}%
                  </p>
                </div>
              )}

              {selectedFile && !isUploading && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Tamanho: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}

              {/* Área de processamento pendente */}
              {pendingImportacao && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-amber-800">
                        {pendingImportacao.dados.length.toLocaleString()} registros prontos para importação
                      </p>
                      <p className="text-sm text-amber-700">
                        Clique em "Processar" para iniciar a importação em lotes
                      </p>
                    </div>
                    <Button
                      onClick={handleProcessar}
                      disabled={isProcessing}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Processar
                        </>
                      )}
                    </Button>
                  </div>

                  {isProcessing && (
                    <div className="space-y-2">
                      <Progress value={processingProgress} />
                      <div className="flex justify-between text-sm text-amber-700">
                        <span>
                          {processingStats.processados.toLocaleString()} / {processingStats.total.toLocaleString()} registros
                        </span>
                        <span>
                          {processingStats.inseridos.toLocaleString()} inseridos | {processingStats.ignorados.toLocaleString()} ignorados | {processingStats.erros.toLocaleString()} erros
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Instruções */}
        <Card>
          <CardHeader>
            <CardTitle>Como usar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <p className="font-medium">Exporte os dados do Tasy</p>
                  <p className="text-sm text-muted-foreground">
                    Execute seu script Python que conecta no Tasy, executa as queries de materiais e honorários, e gera um arquivo SQLite unificado.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <p className="font-medium">Faça upload do arquivo</p>
                  <p className="text-sm text-muted-foreground">
                    Selecione o arquivo SQLite gerado e clique em "Ler Arquivo". O sistema lerá os dados diretamente no seu navegador.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <p className="font-medium">Processe os dados</p>
                  <p className="text-sm text-muted-foreground">
                    Clique em "Processar" para enviar os dados em lotes de {BATCH_SIZE} registros. Apenas registros novos serão inseridos.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Campos esperados na tabela:</strong> atendimento, nr_interno_conta, sequencia, data_faturado, guia, convenio, paciente, data_conta, codigo, codigo_convenio, descricao, quantidade, unidade, valor_unitario, valor_total, setor, protocolo, status_protocolo, tipo (MATERIAL ou HONORARIO), medico, funcao_medico, crm, valor_medico.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Histórico de Importações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Histórico de Importações</span>
              <Button variant="ghost" size="sm" onClick={() => refetchImportacoes()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {importacoes && importacoes.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                    <TableHead className="text-right">Importados</TableHead>
                    <TableHead className="text-right">Ignorados</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importacoes.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell className="font-medium">{imp.nomeArquivo}</TableCell>
                      <TableCell>{formatDate(imp.createdAt)}</TableCell>
                      <TableCell>{getStatusBadge(imp.status)}</TableCell>
                      <TableCell className="text-right">{formatNumber(imp.totalRegistros)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatNumber(imp.registrosImportados)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(imp.registrosIgnorados)}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação irá excluir a importação e todos os dados associados. Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(imp.id)} className="bg-red-600 hover:bg-red-700">
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma importação realizada ainda</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados por Convênio */}
        {dadosPorConvenio && dadosPorConvenio.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Dados por Convênio</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Materiais</TableHead>
                    <TableHead className="text-right">Honorários</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosPorConvenio.map((conv, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{conv.convenio || "Não informado"}</TableCell>
                      <TableCell className="text-right">{formatNumber(conv.totalRegistros)}</TableCell>
                      <TableCell className="text-right">{formatNumber(conv.totalMateriais)}</TableCell>
                      <TableCell className="text-right">{formatNumber(conv.totalHonorarios)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(conv.valorTotal))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Dialog para ver dados importados */}
        <Dialog open={showDadosDialog} onOpenChange={setShowDadosDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dados Importados do Tasy</DialogTitle>
              <DialogDescription>
                Visualize os dados importados com filtros
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <Label>Convênio</Label>
                <Input
                  placeholder="Filtrar por convênio..."
                  value={filtroConvenio}
                  onChange={(e) => setFiltroConvenio(e.target.value)}
                />
              </div>
              <div className="w-48">
                <Label>Tipo</Label>
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="MATERIAL">Materiais</SelectItem>
                    <SelectItem value="HONORARIO">Honorários</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="mt-6" onClick={() => refetchDados()}>
                <Search className="h-4 w-4 mr-2" />
                Buscar
              </Button>
            </div>

            {dadosImportados && dadosImportados.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atendimento</TableHead>
                      <TableHead>Guia</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosImportados.map((dado) => (
                      <TableRow key={dado.id}>
                        <TableCell className="font-mono text-sm">{dado.atendimento}</TableCell>
                        <TableCell>{dado.guia || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{dado.paciente || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{dado.convenio || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{dado.codigo || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{dado.descricao || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={dado.tipo === "MATERIAL" ? "default" : "secondary"}>
                            {dado.tipo === "MATERIAL" ? <Package className="h-3 w-3 mr-1" /> : <Stethoscope className="h-3 w-3 mr-1" />}
                            {dado.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{dado.quantidade || 1}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(dado.valorTotal))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum dado encontrado</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDadosDialog(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
