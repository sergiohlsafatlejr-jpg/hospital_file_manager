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
import { toast } from "sonner";
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

const tiposTabela = [
  { value: "diarias", label: "Diárias", icon: Bed, description: "Diárias de apartamento, UTI, etc." },
  { value: "mat_med", label: "Mat/Med", icon: Pill, description: "Materiais e medicamentos" },
  { value: "taxas", label: "Taxas", icon: Receipt, description: "Taxas diversas" },
  { value: "procedimentos", label: "Procedimentos", icon: Stethoscope, description: "Procedimentos médicos" },
];

export default function TabelasPreco() {
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoTabela>("diarias");
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
  const [formEstabelecimentoId, setFormEstabelecimentoId] = useState<number | undefined>();
  
  // Contexto de estabelecimento
  const { estabelecimentoAtual, estabelecimentos } = useEstabelecimento();

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSubstituir, setImportSubstituir] = useState(false);

  // Queries
  const { data: convenios } = trpc.convenios.list.useQuery();
  const { data: tabelasData, isLoading, refetch } = trpc.tabelasPreco.list.useQuery(
    {
      convenioId,
      tipo: tipoSelecionado,
      codigo: searchTerm || undefined,
      nome: searchTerm || undefined,
      apenasVigentes: false, // Mostrar todos os itens, não apenas os vigentes
      page,
      limit: 50,
    },
    { enabled: !!convenioId }
  );
  const { data: contagem } = trpc.tabelasPreco.contarPorTipo.useQuery(
    { convenioId: convenioId! },
    { enabled: !!convenioId }
  );
  const { data: historicoImportacoes } = trpc.tabelasPreco.historicoImportacoes.useQuery(
    { convenioId },
    { enabled: !!convenioId }
  );
  const { data: historicoItem, isLoading: isLoadingHistorico } = trpc.tabelasPreco.getHistorico.useQuery(
    { tabelaPrecoId: selectedItemForHistory! },
    { enabled: !!selectedItemForHistory && historyDialogOpen }
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
    onSuccess: (result) => {
      toast.success(`Importação concluída! ${result.itensImportados} itens importados.`);
      refetch();
      setImportDialogOpen(false);
      setImportFile(null);
    },
    onError: (error) => {
      toast.error(`Erro na importação: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormCodigo("");
    setFormNome("");
    setFormValor("");
    setFormVigenciaInicio("");
    setFormUnidade("");
    setFormObservacao("");
    setFormEstabelecimentoId(estabelecimentoAtual?.id); // Pré-seleciona o estabelecimento atual
    setEditingItem(null);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormCodigo(item.codigo);
    setFormNome(item.nome);
    setFormValor(item.valor);
    // Converte para formato DD/MM/AAAA para exibição
    if (item.vigenciaInicio) {
      const date = new Date(item.vigenciaInicio);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      setFormVigenciaInicio(`${day}/${month}/${year}`);
    } else {
      setFormVigenciaInicio("");
    }
    setFormUnidade(item.unidade || "");
    setFormObservacao(item.observacao || "");
    setFormEstabelecimentoId(item.estabelecimentoId || undefined);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
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
        codigo: formCodigo,
        nome: formNome,
        valor: formValor,
        vigenciaInicio: vigenciaInicioISO,
        unidade: formUnidade || undefined,
        observacao: formObservacao || undefined,
      });
    } else {
      createMutation.mutate({
        convenioId,
        estabelecimentoId: formEstabelecimentoId,
        tipo: tipoSelecionado,
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
    if (!convenioId || !importFile) {
      toast.error("Selecione um convênio e um arquivo");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      const ext = importFile.name.split(".").pop()?.toLowerCase();
      let formato: "excel" | "csv" | "dbf" = "excel";
      if (ext === "csv") formato = "csv";
      else if (ext === "dbf") formato = "dbf";

      importMutation.mutate({
        convenioId,
        estabelecimentoId: estabelecimentoAtual?.id && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined,
        tipo: tipoSelecionado,
        nomeArquivo: importFile.name,
        formatoArquivo: formato,
        conteudo: base64,
        substituirExistentes: importSubstituir,
      });
    };
    reader.readAsDataURL(importFile);
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num || 0);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
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
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.valor)}
                            </TableCell>
                            <TableCell>{item.unidade || "-"}</TableCell>
                            <TableCell>{formatDate(item.vigenciaInicio)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(item)}
                                  title="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("Deseja excluir este item?")) {
                                      deleteMutation.mutate({ id: item.id });
                                    }
                                  }}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Paginação */}
                    <div className="flex items-center justify-between mt-4">
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
                  <Label htmlFor="estabelecimento">Estabelecimento (opcional)</Label>
                  <Select
                    value={formEstabelecimentoId?.toString() || "global"}
                    onValueChange={(value) => setFormEstabelecimentoId(value === "global" ? undefined : parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um estabelecimento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (todos os estabelecimentos)</SelectItem>
                      {estabelecimentos?.map((est) => (
                        <SelectItem key={est.id} value={est.id.toString()}>
                          {est.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Deixe como "Global" para que a tabela seja visível em todos os estabelecimentos
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
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Tabela de Preços</DialogTitle>
              <DialogDescription>
                Importe uma planilha com os itens da tabela de {tipoAtual?.label.toLowerCase()}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Arquivo (Excel, CSV ou DBF)</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv,.dbf"
                    ref={fileInputRef}
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                </div>
                {importFile && (
                  <p className="text-sm text-muted-foreground">
                    Arquivo selecionado: {importFile.name}
                  </p>
                )}
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium text-sm">Formato esperado das colunas:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>codigo</strong> - Código do item (obrigatório)</li>
                  <li>• <strong>nome</strong> ou <strong>descricao</strong> - Nome do item (obrigatório)</li>
                  <li>• <strong>valor</strong> ou <strong>preco</strong> - Valor em reais (obrigatório)</li>
                  <li>• <strong>vigencia_inicio</strong> - Data de início da vigência</li>
                  <li>• <strong>vigencia_fim</strong> - Data de fim da vigência</li>
                  <li>• <strong>unidade</strong> - Unidade de medida (opcional)</li>
                </ul>
              </div>

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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={!importFile || importMutation.isPending}>
                {importMutation.isPending ? "Importando..." : "Importar"}
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
                            {registro.createdAt ? new Date(registro.createdAt).toLocaleString("pt-BR") : "-"}
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
                                {formatDate(registro.vigenciaInicioNovo)}
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
                                  {formatDate(registro.vigenciaInicioAnterior)}
                                </span>
                                <span>→</span>
                                <span className="text-green-600 font-medium">
                                  {formatDate(registro.vigenciaInicioNovo)}
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
