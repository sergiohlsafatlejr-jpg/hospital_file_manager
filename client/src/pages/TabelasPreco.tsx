import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateUtils";
import { 
  Plus, 
  Upload, 
  Search, 
  Pencil, 
  Trash2, 
  FileSpreadsheet,
  Bed,
  Pill,
  Receipt,
  Stethoscope,
  Download,
  RefreshCw,
  History
} from "lucide-react";

type TipoTabela = "diarias" | "mat_med" | "taxas" | "procedimentos";
type ProcedimentoFonte = "porte_anestesico" | "preco_portes" | "dados_completo" | "site";

const procedimentoFontes: Array<{ value: ProcedimentoFonte; label: string; description: string }> = [
  { value: "preco_portes", label: "Preço de Portes", description: "Código e valor de referência do porte" },
  { value: "porte_anestesico", label: "Porte Anestésico", description: "Código, valor e beneficiário" },
  { value: "dados_completo", label: "Dados Completos", description: "Código, descrição, porte e auxiliares" },
  { value: "site", label: "Tabela Unimed (Site)", description: "Código, descrição, valor e beneficiário" },
];

const ordemImportacaoUnimed: Array<{
  etapa: number;
  fonte: ProcedimentoFonte;
  arquivo: string;
  descricao: string;
}> = [
  { etapa: 1, fonte: "preco_portes", arquivo: "atualizacao_Preco_Porte.xlsx", descricao: "Referência dos valores 1A, 1B, 2A..." },
  { etapa: 2, fonte: "porte_anestesico", arquivo: "atualizacao_Porte_Anestesico.xlsx", descricao: "Referência dos valores AN0 até AN8" },
  { etapa: 3, fonte: "dados_completo", arquivo: "atualizacao_Dados_Completo.xlsx", descricao: "Procedimentos, portes e auxiliares" },
  { etapa: 4, fonte: "site", arquivo: "atualizacao_Tabela_Unimed_Site.xlsx", descricao: "Tabela complementar publicada no site" },
];

function detectarFontePorNome(nomeArquivo: string): ProcedimentoFonte | undefined {
  const nome = nomeArquivo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (nome.includes("anestes")) return "porte_anestesico";
  if (nome.includes("preco") && nome.includes("porte")) return "preco_portes";
  if (nome.includes("dados") && nome.includes("completo")) return "dados_completo";
  if (nome.includes("unimed") && nome.includes("site")) return "site";
  return undefined;
}

const tiposTabela = [
  { value: "diarias", label: "Diárias", icon: Bed, description: "Diárias de apartamento, UTI, etc." },
  { value: "mat_med", label: "Mat/Med", icon: Pill, description: "Materiais e medicamentos" },
  { value: "taxas", label: "Taxas", icon: Receipt, description: "Taxas diversas" },
  { value: "procedimentos", label: "Procedimentos", icon: Stethoscope, description: "Procedimentos médicos" },
];

export default function TabelasPreco() {
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoTabela>("diarias");
  const [procedimentoFonte, setProcedimentoFonte] = useState<ProcedimentoFonte>("site");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [formCodigo, setFormCodigo] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formValor, setFormValor] = useState("");
  const [formVigenciaInicio, setFormVigenciaInicio] = useState("");
  const [formUnidade, setFormUnidade] = useState("");
  const [formObservacao, setFormObservacao] = useState("");
  
  // Contexto de estabelecimento
  const { estabelecimentoAtual } = useEstabelecimento();

  // Import states
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    name: string;
    fase: "preparando" | "publicando";
  } | null>(null);
  const [importSubstituir, setImportSubstituir] = useState(false);

  const handleImportFileChange = (files: File[]) => {
    setImportFiles(files);
    if (files.length && tipoSelecionado === "procedimentos") {
      const primeiraFonte = ordemImportacaoUnimed.find((etapa) =>
        files.some((file) => detectarFontePorNome(file.name) === etapa.fonte),
      );
      if (primeiraFonte) {
        setProcedimentoFonte(primeiraFonte.fonte);
        setPage(1);
      }
    }
  };

  const etapaImportacaoAtual = ordemImportacaoUnimed.find(
    (etapa) => etapa.fonte === procedimentoFonte,
  );

  // Queries
  const { data: convenios } = trpc.convenios.list.useQuery();
  const { data: tabelasData, isLoading, refetch } = trpc.tabelasPreco.list.useQuery(
    {
      convenioId,
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      tipo: tipoSelecionado,
      procedimentoFonte: tipoSelecionado === "procedimentos" ? procedimentoFonte : undefined,
      codigo: searchTerm || undefined,
      nome: searchTerm || undefined,
      apenasVigentes: false, // Mostrar todos os itens, não apenas os vigentes
      page,
      limit: 50,
    },
    { enabled: !!convenioId && !!estabelecimentoAtual?.id }
  );
  const { data: contagem } = trpc.tabelasPreco.contarPorTipo.useQuery(
    { convenioId: convenioId!, estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!convenioId && !!estabelecimentoAtual?.id }
  );
  const { data: historicoImportacoes } = trpc.tabelasPreco.historicoImportacoes.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0, convenioId },
    { enabled: !!convenioId && !!estabelecimentoAtual?.id }
  );
  const { data: historicoItem, isLoading: isLoadingHistorico } = trpc.tabelasPreco.getHistorico.useQuery(
    {
      tabelaPrecoId: selectedItemForHistory!,
      estabelecimentoId: estabelecimentoAtual?.id || 0,
    },
    { enabled: !!selectedItemForHistory && historyDialogOpen && !!estabelecimentoAtual?.id }
  );

  // Mutations
  const createMutation = trpc.tabelasPreco.create.useMutation({
    onSuccess: () => {
      toast.success("Item criado com sucesso!");
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao criar item: ${error.message}`);
    },
  });

  const updateMutation = trpc.tabelasPreco.update.useMutation({
    onSuccess: () => {
      toast.success("Item atualizado com sucesso!");
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar item: ${error.message}`);
    },
  });

  const deleteMutation = trpc.tabelasPreco.delete.useMutation({
    onSuccess: () => {
      toast.success("Item excluído com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir item: ${error.message}`);
    },
  });

  const importMutation = trpc.tabelasPreco.importar.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: () => undefined,
  });

  const importLoteMutation = trpc.tabelasPreco.importarProcedimentosLote.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: () => undefined,
  });

  const resetForm = () => {
    setFormCodigo("");
    setFormNome("");
    setFormValor("");
    setFormVigenciaInicio("");
    setFormUnidade("");
    setFormObservacao("");
    setEditingItem(null);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormCodigo(item.codigo);
    setFormNome(item.nome);
    setFormValor(item.valor);
    // Converte para formato DD/MM/AAAA para exibição
    setFormVigenciaInicio(item.vigenciaInicio ? formatDateBR(item.vigenciaInicio) : "");
    setFormUnidade(item.unidade || "");
    setFormObservacao(item.observacao || "");
    if (item.procedimentoFonte) setProcedimentoFonte(item.procedimentoFonte as ProcedimentoFonte);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!estabelecimentoAtual?.id) {
      toast.error("Selecione um estabelecimento antes de salvar.");
      return;
    }
    if (!convenioId) {
      toast.error("Selecione um convênio");
      return;
    }

    if (!formCodigo || !formNome || !formValor || !formVigenciaInicio) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Validar formato da data de início
    if (!isValidDate(formVigenciaInicio)) {
      toast.error("Data de início inválida. Use o formato DD/MM/AAAA");
      return;
    }

    // Converter datas para formato ISO (YYYY-MM-DD)
    const vigenciaInicioISO = parseDateToISO(formVigenciaInicio);

    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        estabelecimentoId: estabelecimentoAtual.id,
        codigo: formCodigo,
        nome: formNome,
        valor: formValor,
        vigenciaInicio: vigenciaInicioISO,
        procedimentoFonte: tipoSelecionado === "procedimentos" ? procedimentoFonte : undefined,
        unidade: formUnidade || undefined,
        observacao: formObservacao || undefined,
      });
    } else {
      createMutation.mutate({
        convenioId,
        estabelecimentoId: estabelecimentoAtual.id,
        tipo: tipoSelecionado,
        procedimentoFonte: tipoSelecionado === "procedimentos" ? procedimentoFonte : undefined,
        codigo: formCodigo,
        nome: formNome,
        valor: formValor,
        vigenciaInicio: vigenciaInicioISO,
        unidade: formUnidade || undefined,
        observacao: formObservacao || undefined,
      });
    }
  };

  const handleImport = async () => {
    if (!estabelecimentoAtual?.id || estabelecimentoAtual.id <= 0) {
      toast.error("Selecione um estabelecimento antes de importar.");
      return;
    }
    if (!convenioId || !importFiles.length) {
      toast.error("Selecione um convênio e os arquivos da importação.");
      return;
    }

    const arquivosComFonte = importFiles.map((file) => ({
      file,
      fonte: detectarFontePorNome(file.name),
    }));
    const fontesSelecionadas = arquivosComFonte.filter((item) => item.fonte);
    const fontesDuplicadas = new Set(
      fontesSelecionadas
        .map((item) => item.fonte)
        .filter((fonte, index, fontes) => fontes.indexOf(fonte) !== index),
    );

    if (tipoSelecionado === "procedimentos") {
      if (importFiles.length !== ordemImportacaoUnimed.length) {
        toast.error("Selecione exatamente as quatro planilhas da Unimed para criar um único lote.");
        return;
      }
      const tamanhoTotal = importFiles.reduce((total, file) => total + file.size, 0);
      if (tamanhoTotal > 30 * 1024 * 1024) {
        toast.error("O conjunto das quatro planilhas não pode ultrapassar 30 MB.");
        return;
      }
      const arquivosNaoReconhecidos = arquivosComFonte.filter((item) => !item.fonte);
      if (arquivosNaoReconhecidos.length) {
        toast.error(`Não reconheci o formato de: ${arquivosNaoReconhecidos.map((item) => item.file.name).join(", ")}. Use os nomes padrão da Unimed.`);
        return;
      }
      if (fontesDuplicadas.size) {
        toast.error("Selecione apenas um arquivo de cada etapa da importação Unimed.");
        return;
      }
    }

    const arquivosParaImportar = tipoSelecionado === "procedimentos"
      ? ordemImportacaoUnimed
          .map((etapa) => arquivosComFonte.find((item) => item.fonte === etapa.fonte)?.file)
          .filter((file): file is File => !!file)
      : [importFiles[0]];

    const lerArquivo = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve((event.target?.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${file.name}.`));
      reader.readAsDataURL(file);
    });

    const formatoDoArquivo = (file: File): "excel" | "csv" | "dbf" => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") return "csv";
      if (ext === "dbf") return "dbf";
      return "excel";
    };

    let totalItens = 0;
    let totalImportados = 0;
    let totalErros = 0;
    try {
      if (tipoSelecionado === "procedimentos") {
        const arquivosLote: Array<{
          nomeArquivo: string;
          formatoArquivo: "excel";
          conteudo: string;
        }> = [];
        for (let index = 0; index < arquivosParaImportar.length; index += 1) {
          const file = arquivosParaImportar[index];
          setImportProgress({
            current: index + 1,
            total: arquivosParaImportar.length,
            name: file.name,
            fase: "preparando",
          });
          arquivosLote.push({
            nomeArquivo: file.name,
            formatoArquivo: "excel",
            conteudo: await lerArquivo(file),
          });
        }

        setImportProgress({
          current: arquivosParaImportar.length,
          total: arquivosParaImportar.length,
          name: "Validando e publicando o lote completo",
          fase: "publicando",
        });
        const resultado = await importLoteMutation.mutateAsync({
          convenioId,
          estabelecimentoId: estabelecimentoAtual.id,
          arquivos: arquivosLote,
          substituirExistentes: true,
        });

        setImportProgress(null);
        setImportFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setImportDialogOpen(false);
        toast.success(
          `Lote concluído em ${formatDateTimeBR(resultado.momentoLote)}: ${resultado.itensImportados} de ${resultado.totalItens} itens gravados nas 4 etapas.`,
        );
        return;
      }

      for (let index = 0; index < arquivosParaImportar.length; index += 1) {
        const file = arquivosParaImportar[index];
        setImportProgress({
          current: index + 1,
          total: arquivosParaImportar.length,
          name: file.name,
          fase: "publicando",
        });
        const conteudo = await lerArquivo(file);
        const resultado = await importMutation.mutateAsync({
          convenioId,
          estabelecimentoId: estabelecimentoAtual.id,
          tipo: tipoSelecionado,
          nomeArquivo: file.name,
          formatoArquivo: formatoDoArquivo(file),
          conteudo,
          substituirExistentes: importSubstituir,
        });
        totalItens += resultado.totalItens;
        totalImportados += resultado.itensImportados;
        totalErros += resultado.itensErro;
      }
      setImportProgress(null);
      setImportFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setImportDialogOpen(false);
      toast.success(`${arquivosParaImportar.length} arquivo(s) importado(s): ${totalImportados} de ${totalItens} itens gravados${totalErros ? ` e ${totalErros} com erro` : ""}.`);
    } catch (error) {
      setImportProgress(null);
      toast.error(`Erro na importação${totalImportados ? ` após ${totalImportados} itens gravados` : ""}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num || 0);
  };

  
  // Função para formatar data no formato DD/MM/AAAA enquanto digita
  const formatDateInput = (value: string): string => {
    // Remove tudo que não for número
    const numbers = value.replace(/\D/g, "");
    
    // Aplica a máscara DD/MM/AAAA
    if (numbers.length <= 2) {
      return numbers;
    } else if (numbers.length <= 4) {
      return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    } else {
      return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
    }
  };

  // Função para converter DD/MM/AAAA para YYYY-MM-DD (formato ISO)
  const parseDateToISO = (dateStr: string): string => {
    if (!dateStr) return "";
    const parts = dateStr.split("/");
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  // Função para converter YYYY-MM-DD para DD/MM/AAAA
  const formatISOToDisplay = (isoDate: string): string => {
    if (!isoDate) return "";
    // Se já está no formato DD/MM/AAAA, retorna como está
    if (isoDate.includes("/")) return isoDate;
    // Converte de YYYY-MM-DD para DD/MM/AAAA
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };

  // Função para validar se a data está completa e válida
  const isValidDate = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const parts = dateStr.split("/");
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      return false;
    }
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
      return false;
    }
    // Verifica se a data é válida
    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
  };

  const tipoAtual = tiposTabela.find(t => t.value === tipoSelecionado);
  const IconeTipo = tipoAtual?.icon || FileSpreadsheet;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tabelas de Preços</h1>
            <p className="text-muted-foreground">
              Cadastre e gerencie tabelas de preços por convênio
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setHistoryDialogOpen(true)} disabled={!convenioId}>
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={!convenioId}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Seletor de Convênio */}
        <Card>
          <CardHeader>
            <CardTitle>Selecione o Convênio</CardTitle>
            <CardDescription>
              Escolha o convênio para visualizar e gerenciar suas tabelas de preços
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={convenioId?.toString() || ""}
              onValueChange={(v) => {
                setConvenioId(v ? parseInt(v) : undefined);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Selecione um convênio..." />
              </SelectTrigger>
              <SelectContent>
                {convenios?.map((conv) => (
                  <SelectItem key={conv.id} value={conv.id.toString()}>
                    {conv.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {convenioId && (
          <>
            {/* Cards de Contagem por Tipo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {tiposTabela.map((tipo) => {
                const Icon = tipo.icon;
                const count = contagem?.[tipo.value as keyof typeof contagem] || 0;
                const isSelected = tipoSelecionado === tipo.value;
                return (
                  <Card
                    key={tipo.value}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => {
                      setTipoSelecionado(tipo.value as TipoTabela);
                      setPage(1);
                    }}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{tipo.label}</p>
                          <p className="text-2xl font-bold">{count}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {tipoSelecionado === "procedimentos" && (
              <Card>
                <CardHeader>
                  <CardTitle>Fonte da tabela de procedimentos</CardTitle>
                  <CardDescription>
                    Selecione o formato correspondente à planilha do repositório Danilochavesc/tabelaprocedimento.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">Ordem recomendada para importar a Unimed</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Siga as etapas abaixo. Clique em uma etapa para selecionar o formato correspondente.
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        Etapa {etapaImportacaoAtual?.etapa || 1} de 4
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {ordemImportacaoUnimed.map((etapa) => {
                        const selecionada = etapa.fonte === procedimentoFonte;
                        return (
                          <button
                            key={etapa.fonte}
                            type="button"
                            onClick={() => {
                              setProcedimentoFonte(etapa.fonte);
                              setPage(1);
                            }}
                            className={`rounded-md border p-3 text-left transition-colors ${
                              selecionada
                                ? "border-primary bg-background shadow-sm"
                                : "border-transparent bg-background/60 hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                selecionada ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              }`}>
                                {etapa.etapa}
                              </span>
                              <span className="text-xs font-semibold leading-tight">
                                {procedimentoFontes.find((fonte) => fonte.value === etapa.fonte)?.label}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-[11px] text-muted-foreground" title={etapa.arquivo}>
                              {etapa.arquivo}
                            </p>
                            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                              {etapa.descricao}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Select value={procedimentoFonte} onValueChange={(value) => {
                    setProcedimentoFonte(value as ProcedimentoFonte);
                    setPage(1);
                  }}>
                    <SelectTrigger className="w-full max-w-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {procedimentoFontes.map((fonte) => (
                        <SelectItem key={fonte.value} value={fonte.value}>
                          <span className="font-medium">{fonte.label}</span>
                          <span className="ml-2 text-muted-foreground">— {fonte.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {etapaImportacaoAtual
                      ? `Selecionado: etapa ${etapaImportacaoAtual.etapa} — ${etapaImportacaoAtual.arquivo}`
                      : "Selecione o formato da planilha antes de importar."}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <IconeTipo className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle>{tipoAtual?.label}</CardTitle>
                      <CardDescription>{tipoAtual?.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar
                    </Button>
                    <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Item
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Busca */}
                <div className="flex gap-4 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por código ou nome..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Tabela */}
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : !tabelasData?.items.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum item cadastrado. Clique em "Novo Item" ou "Importar" para começar.
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Nome</TableHead>
                          {tipoSelecionado === "procedimentos" && <TableHead>Fonte</TableHead>}
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead>Vigência Início</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tabelasData.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono">{item.codigo}</TableCell>
                            <TableCell>{item.nome}</TableCell>
                            {tipoSelecionado === "procedimentos" && (
                              <TableCell>
                                <Badge variant="outline">
                                  {procedimentoFontes.find((fonte) => fonte.value === item.procedimentoFonte)?.label || "Manual"}
                                </Badge>
                                {(item.porte || item.numeroAuxiliares) && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {item.porte ? `Porte: ${item.porte}` : ""}
                                    {item.porte && item.numeroAuxiliares ? " · " : ""}
                                    {item.numeroAuxiliares ? `Auxiliares: ${item.numeroAuxiliares}` : ""}
                                    {item.valorPorteAnestesico ? ` · Anestésico: ${formatCurrency(item.valorPorteAnestesico)}` : ""}
                                  </div>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.valor)}
                            </TableCell>
                            <TableCell>{item.unidade || "-"}</TableCell>
                            <TableCell>{formatDateBR(item.vigenciaInicio)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {item.estabelecimentoId === estabelecimentoAtual?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(item)}
                                    title="Editar"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItemForHistory(item.id);
                                    setHistoryDialogOpen(true);
                                  }}
                                  title="Histórico de alterações"
                                >
                                  <History className="h-4 w-4 text-blue-500" />
                                </Button>
                                {item.estabelecimentoId === estabelecimentoAtual?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm("Deseja excluir este item?")) {
                                        deleteMutation.mutate({
                                          id: item.id,
                                          estabelecimentoId: estabelecimentoAtual.id,
                                        });
                                      }
                                    }}
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Paginação */}
                    <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {tabelasData.items.length} de {tabelasData.total} itens
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={tabelasData.items.length < 50}
                          onClick={() => setPage(p => p + 1)}
                        >
                          Próximo
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Dialog de Criar/Editar */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Item" : "Novo Item"}</DialogTitle>
              <DialogDescription>
                {editingItem ? "Atualize os dados do item" : "Preencha os dados do novo item"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input
                    id="codigo"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    placeholder="Ex: 6006632"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valor">Valor *</Label>
                  <Input
                    id="valor"
                    value={formValor}
                    onChange={(e) => setFormValor(e.target.value)}
                    placeholder="Ex: 250.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Diária de Apartamento"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vigenciaInicio">Vigência Início * (DD/MM/AAAA)</Label>
                  <Input
                    id="vigenciaInicio"
                    type="text"
                    value={formVigenciaInicio}
                    onChange={(e) => setFormVigenciaInicio(formatDateInput(e.target.value))}
                    placeholder="Ex: 01/01/2025"
                    maxLength={10}
                  />
                </div>

              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unidade">Unidade</Label>
                  <Input
                    id="unidade"
                    value={formUnidade}
                    onChange={(e) => setFormUnidade(e.target.value)}
                    placeholder="Ex: UN, ML, MG"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observacao">Observação</Label>
                  <Input
                    id="observacao"
                    value={formObservacao}
                    onChange={(e) => setFormObservacao(e.target.value)}
                    placeholder="Observações adicionais"
                  />
                </div>
              </div>
              {!editingItem && (
                <div className="space-y-2">
                  <Label htmlFor="estabelecimento">Estabelecimento obrigatório</Label>
                  <Input
                    id="estabelecimento"
                    value={estabelecimentoAtual?.nome || "Nenhum estabelecimento selecionado"}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    O item será salvo somente na unidade visualizada no cabeçalho.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingItem ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Importação */}
        <Dialog open={importDialogOpen} onOpenChange={(open) => {
          if (!open && importProgress) return;
          setImportDialogOpen(open);
          if (!open) {
            setImportFiles([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Tabela de Preços</DialogTitle>
              <DialogDescription>
                Importe uma planilha com os itens da tabela de {tipoAtual?.label.toLowerCase()}
                {tipoSelecionado === "procedimentos" && ` — ${procedimentoFontes.find((fonte) => fonte.value === procedimentoFonte)?.label}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{tipoSelecionado === "procedimentos" ? "Arquivos da Unimed (selecione os 4 de uma vez)" : "Arquivo (Excel, CSV ou DBF)"}</Label>
                <p className="text-xs text-muted-foreground">
                  Estabelecimento obrigatório: <strong>{estabelecimentoAtual?.nome || "nenhum selecionado"}</strong>
                  {tipoSelecionado === "procedimentos" && ". As quatro etapas receberão o mesmo horário de lote."}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept={tipoSelecionado === "procedimentos" ? ".xlsx,.xls" : ".xlsx,.xls,.csv,.dbf"}
                    multiple={tipoSelecionado === "procedimentos"}
                    ref={fileInputRef}
                    onChange={(e) => handleImportFileChange(Array.from(e.target.files || []))}
                  />
                </div>
                {tipoSelecionado === "procedimentos" ? (
                  <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
                    {ordemImportacaoUnimed.map((etapa) => {
                      const arquivo = importFiles.find((file) => detectarFontePorNome(file.name) === etapa.fonte);
                      return (
                        <div key={etapa.fonte} className="flex items-center gap-2 text-xs">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
                            {etapa.etapa}
                          </span>
                          <span className={arquivo ? "text-foreground" : "text-muted-foreground"}>
                            {arquivo ? arquivo.name : `${etapa.arquivo} — não selecionado`}
                          </span>
                        </div>
                      );
                    })}
                    {importFiles.some((file) => !detectarFontePorNome(file.name)) && (
                      <p className="text-xs text-destructive">
                        Há arquivo(s) com nome não reconhecido. Use os nomes padrão das planilhas Unimed.
                      </p>
                    )}
                  </div>
                ) : importFiles[0] ? (
                  <p className="text-sm text-muted-foreground">
                    Arquivo selecionado: {importFiles[0].name}
                  </p>
                ) : null}
                {importProgress && (
                  <div className="space-y-2" aria-live="polite">
                    <Progress value={(importProgress.current / importProgress.total) * 100} />
                    <p className="text-sm font-medium text-primary">
                      {importProgress.fase === "preparando" ? "Preparando" : "Publicando"} etapa {importProgress.current} de {importProgress.total}: {importProgress.name}
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium text-sm">Formato esperado das colunas:</p>
                {tipoSelecionado === "procedimentos" ? (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>site</strong>: codigo, descricao, valor, tipo_de_beneficiario</li>
                    <li>• <strong>dados_completo</strong>: codigo, descricao, porte, numero_auxiliares, valor, tipo_de_beneficiario</li>
                    <li>• <strong>preco_portes</strong>: codigo, valor, tipo_de_beneficiario</li>
                    <li>• <strong>porte_anestesico</strong>: codigo, valor, tipo_de_beneficiario</li>
                    <li>• Selecione as <strong>quatro planilhas de uma vez</strong>; o servidor valida todas antes de gravar.</li>
                    <li>• O novo lote substitui somente os procedimentos ativos deste convênio e estabelecimento.</li>
                    <li>• Reenvios do mesmo conjunto são bloqueados para evitar duplicidade.</li>
                  </ul>
                ) : (
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong>codigo</strong> - Código do item (obrigatório)</li>
                    <li>• <strong>nome</strong> ou <strong>descricao</strong> - Nome do item (obrigatório)</li>
                    <li>• <strong>valor</strong> ou <strong>preco</strong> - Valor em reais (obrigatório)</li>
                    <li>• <strong>vigencia_inicio</strong> - Data de início da vigência</li>
                    <li>• <strong>vigencia_fim</strong> - Data de fim da vigência</li>
                    <li>• <strong>unidade</strong> - Unidade de medida (opcional)</li>
                  </ul>
                )}
              </div>

              {tipoSelecionado !== "procedimentos" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="substituir"
                    checked={importSubstituir}
                    onChange={(e) => setImportSubstituir(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="substituir" className="text-sm">
                    Substituir itens existentes (desativa os anteriores)
                  </Label>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={!!importProgress}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  !estabelecimentoAtual?.id
                  || !importFiles.length
                  || importMutation.isPending
                  || importLoteMutation.isPending
                  || !!importProgress
                }
              >
                {importProgress ? `Importando ${importProgress.current}/${importProgress.total}...` : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Histórico de Alterações do Item */}
        <Dialog open={historyDialogOpen} onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open) setSelectedItemForHistory(null);
        }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de Alterações
              </DialogTitle>
              <DialogDescription>
                Visualize todas as modificações realizadas neste item
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {isLoadingHistorico ? (
                <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>
              ) : !historicoItem?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma alteração registrada para este item.
                </div>
              ) : (
                <div className="space-y-4">
                  {historicoItem.map((registro: any) => (
                    <Card key={registro.id} className="border-l-4 border-l-primary">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              registro.tipoAlteracao === "criacao" ? "default" :
                              registro.tipoAlteracao === "edicao" ? "secondary" :
                              registro.tipoAlteracao === "exclusao" ? "destructive" : "outline"
                            }>
                              {registro.tipoAlteracao === "criacao" ? "Criação" :
                               registro.tipoAlteracao === "edicao" ? "Edição" :
                               registro.tipoAlteracao === "exclusao" ? "Exclusão" : "Importação"}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              por <strong>{registro.userName || registro.userEmail || "Usuário desconhecido"}</strong>
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {registro.createdAt ? formatDateTimeBR(registro.createdAt) : "-"}
                          </span>
                        </div>
                        
                        {registro.tipoAlteracao === "criacao" && (
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Código:</span>
                              <span className="ml-2 font-medium">{registro.codigoNovo}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Nome:</span>
                              <span className="ml-2 font-medium">{registro.nomeNovo}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Valor:</span>
                              <span className="ml-2 font-medium text-green-600">
                                {formatCurrency(registro.valorNovo)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Vigência:</span>
                              <span className="ml-2 font-medium">
                                {formatDateBR(registro.vigenciaInicioNovo)}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {registro.tipoAlteracao === "edicao" && (
                          <div className="space-y-2 text-sm">
                            {registro.valorAnterior !== registro.valorNovo && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Valor:</span>
                                <span className="line-through text-red-500">{formatCurrency(registro.valorAnterior)}</span>
                                <span>→</span>
                                <span className="text-green-600 font-medium">{formatCurrency(registro.valorNovo)}</span>
                              </div>
                            )}
                            {registro.nomeAnterior !== registro.nomeNovo && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Nome:</span>
                                <span className="line-through text-red-500">{registro.nomeAnterior}</span>
                                <span>→</span>
                                <span className="text-green-600 font-medium">{registro.nomeNovo}</span>
                              </div>
                            )}
                            {registro.codigoAnterior !== registro.codigoNovo && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Código:</span>
                                <span className="line-through text-red-500">{registro.codigoAnterior}</span>
                                <span>→</span>
                                <span className="text-green-600 font-medium">{registro.codigoNovo}</span>
                              </div>
                            )}
                            {registro.vigenciaInicioAnterior?.toString() !== registro.vigenciaInicioNovo?.toString() && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Vigência:</span>
                                <span className="line-through text-red-500">
                                  {formatDateBR(registro.vigenciaInicioAnterior)}
                                </span>
                                <span>→</span>
                                <span className="text-green-600 font-medium">
                                  {formatDateBR(registro.vigenciaInicioNovo)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {registro.tipoAlteracao === "exclusao" && (
                          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span>Código:</span>
                              <span className="ml-2 line-through">{registro.codigoAnterior}</span>
                            </div>
                            <div>
                              <span>Nome:</span>
                              <span className="ml-2 line-through">{registro.nomeAnterior}</span>
                            </div>
                            <div>
                              <span>Valor:</span>
                              <span className="ml-2 line-through">{formatCurrency(registro.valorAnterior)}</span>
                            </div>
                          </div>
                        )}
                        
                        {registro.observacao && (
                          <div className="mt-2 text-sm text-muted-foreground italic">
                            Obs: {registro.observacao}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
