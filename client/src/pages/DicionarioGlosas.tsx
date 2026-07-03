import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  BookOpen, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  ChevronRight,
  Target,
  FileCheck,
  TrendingUp,
  Info,
  Plus,
  Pencil,
  Trash2,
  Loader2
} from "lucide-react";
import { 
  GLOSAS_TISS, 
  GlosaInfo, 
  listarGruposGlosa, 
  listarGlosasPorGrupo,
  buscarGlosas,
  obterEstatisticasPorGrupo
} from "../../../shared/glossaryGlosas";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";

interface MotivoGlosaDB {
  id: number;
  codigo: string;
  grupo: string;
  descricao: string;
  descricaoSimplificada: string;
  argumentoContestacao?: string | null;
  acoesRecomendadas?: string[] | null;
  documentosSugeridos?: string[] | null;
  dificuldadeReversao?: number | null;
  probabilidadeSucesso?: number | null;
  tipoOrigem: "tiss" | "personalizado";
  estabelecimentoId?: number | null;
  ativo: "sim" | "nao";
}

export default function DicionarioGlosas() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrupo, setSelectedGrupo] = useState<string>("all");
  const [selectedGlosa, setSelectedGlosa] = useState<GlosaInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tiss");
  
  // Estados para criar/editar motivo
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingMotivo, setEditingMotivo] = useState<MotivoGlosaDB | null>(null);
  const [formData, setFormData] = useState({
    codigo: "",
    grupo: "",
    descricao: "",
    descricaoSimplificada: "",
    argumentoContestacao: "",
    acoesRecomendadas: "",
    documentosSugeridos: "",
    dificuldadeReversao: 3,
    probabilidadeSucesso: 50,
  });

  // Queries
  const { data: motivosPersonalizados, isLoading: loadingMotivos, refetch: refetchMotivos } = trpc.motivosGlosa.list.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    tipoOrigem: "personalizado",
    ativo: "sim",
  });

  const { data: gruposDB } = trpc.motivosGlosa.grupos.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
  });

  // Mutations
  const criarMotivoMutation = trpc.motivosGlosa.criar.useMutation({
    onSuccess: () => {
      toast.success("Motivo de glosa criado com sucesso!");
      setCreateDialogOpen(false);
      resetForm();
      refetchMotivos();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao criar motivo de glosa");
    },
  });

  const atualizarMotivoMutation = trpc.motivosGlosa.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Motivo de glosa atualizado com sucesso!");
      setCreateDialogOpen(false);
      setEditingMotivo(null);
      resetForm();
      refetchMotivos();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar motivo de glosa");
    },
  });

  const excluirMotivoMutation = trpc.motivosGlosa.excluir.useMutation({
    onSuccess: () => {
      toast.success("Motivo de glosa excluído com sucesso!");
      refetchMotivos();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir motivo de glosa");
    },
  });

  const grupos = useMemo(() => listarGruposGlosa(), []);
  const estatisticas = useMemo(() => obterEstatisticasPorGrupo(), []);

  const glosasFiltradas = useMemo(() => {
    let resultado: GlosaInfo[] = [];
    
    if (searchTerm.trim()) {
      resultado = buscarGlosas(searchTerm);
    } else if (selectedGrupo && selectedGrupo !== "all") {
      resultado = listarGlosasPorGrupo(selectedGrupo);
    } else {
      resultado = Object.values(GLOSAS_TISS);
    }
    
    return resultado.sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [searchTerm, selectedGrupo]);

  const motivosFiltrados = useMemo(() => {
    if (!motivosPersonalizados) return [];
    
    let resultado = motivosPersonalizados;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      resultado = resultado.filter(m => 
        m.codigo.toLowerCase().includes(term) ||
        m.descricao.toLowerCase().includes(term) ||
        m.descricaoSimplificada.toLowerCase().includes(term) ||
        m.grupo.toLowerCase().includes(term)
      );
    }
    
    if (selectedGrupo && selectedGrupo !== "all") {
      resultado = resultado.filter(m => m.grupo === selectedGrupo);
    }
    
    return resultado;
  }, [motivosPersonalizados, searchTerm, selectedGrupo]);

  const totalGlosas = Object.keys(GLOSAS_TISS).length;
  const totalPersonalizados = motivosPersonalizados?.length || 0;

  const resetForm = () => {
    setFormData({
      codigo: "",
      grupo: "",
      descricao: "",
      descricaoSimplificada: "",
      argumentoContestacao: "",
      acoesRecomendadas: "",
      documentosSugeridos: "",
      dificuldadeReversao: 3,
      probabilidadeSucesso: 50,
    });
  };

  const handleCopyArgumento = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Argumento copiado para a área de transferência");
  };

  const handleOpenDetails = (glosa: GlosaInfo) => {
    setSelectedGlosa(glosa);
    setDialogOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingMotivo(null);
    resetForm();
    setCreateDialogOpen(true);
  };

  const handleOpenEdit = (motivo: MotivoGlosaDB) => {
    setEditingMotivo(motivo);
    setFormData({
      codigo: motivo.codigo,
      grupo: motivo.grupo,
      descricao: motivo.descricao,
      descricaoSimplificada: motivo.descricaoSimplificada,
      argumentoContestacao: motivo.argumentoContestacao || "",
      acoesRecomendadas: (motivo.acoesRecomendadas || []).join("\n"),
      documentosSugeridos: (motivo.documentosSugeridos || []).join("\n"),
      dificuldadeReversao: motivo.dificuldadeReversao || 3,
      probabilidadeSucesso: motivo.probabilidadeSucesso || 50,
    });
    setCreateDialogOpen(true);
  };

  const handleSaveMotivo = () => {
    const acoesArray = formData.acoesRecomendadas
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const docsArray = formData.documentosSugeridos
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const data = {
      codigo: formData.codigo,
      grupo: formData.grupo,
      descricao: formData.descricao,
      descricaoSimplificada: formData.descricaoSimplificada,
      argumentoContestacao: formData.argumentoContestacao || undefined,
      acoesRecomendadas: acoesArray.length > 0 ? acoesArray : undefined,
      documentosSugeridos: docsArray.length > 0 ? docsArray : undefined,
      dificuldadeReversao: formData.dificuldadeReversao,
      probabilidadeSucesso: formData.probabilidadeSucesso,
      estabelecimentoId: estabelecimentoAtual?.id,
    };

    if (editingMotivo) {
      atualizarMotivoMutation.mutate({ id: editingMotivo.id, ...data });
    } else {
      criarMotivoMutation.mutate(data);
    }
  };

  const handleDeleteMotivo = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este motivo de glosa?")) {
      excluirMotivoMutation.mutate({ id });
    }
  };

  const getDificuldadeColor = (nivel?: number | null) => {
    if (!nivel) return "bg-gray-100 text-gray-700";
    if (nivel <= 2) return "bg-green-100 text-green-700";
    if (nivel <= 3) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const getDificuldadeLabel = (nivel?: number | null) => {
    if (!nivel) return "Não avaliado";
    if (nivel === 1) return "Muito Fácil";
    if (nivel === 2) return "Fácil";
    if (nivel === 3) return "Moderado";
    if (nivel === 4) return "Difícil";
    return "Muito Difícil";
  };

  const getProbabilidadeColor = (prob?: number | null) => {
    if (!prob) return "text-gray-500";
    if (prob >= 80) return "text-green-600";
    if (prob >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const todosGrupos = useMemo(() => {
    const gruposTiss = grupos;
    const gruposPersonalizados = (motivosPersonalizados || []).map(m => m.grupo);
    const combined = [...gruposTiss, ...gruposPersonalizados];
    const uniqueSet = new Set<string>(combined);
    return Array.from(uniqueSet).sort();
  }, [grupos, motivosPersonalizados]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Dicionário de Glosas</h1>
            <p className="text-muted-foreground">
              Consulte códigos de glosa, descrições e sugestões de contestação
            </p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Motivo
          </Button>
        </div>

        {/* Estatísticas */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Códigos TISS</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalGlosas}</div>
              <p className="text-xs text-muted-foreground">códigos padrão ANS</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Personalizados</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPersonalizados}</div>
              <p className="text-xs text-muted-foreground">códigos customizados</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Grupos</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todosGrupos.length}</div>
              <p className="text-xs text-muted-foreground">categorias de glosa</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resultados</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activeTab === "tiss" ? glosasFiltradas.length : motivosFiltrados.length}
              </div>
              <p className="text-xs text-muted-foreground">glosas encontradas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle>Buscar Glosas</CardTitle>
            <CardDescription>
              Pesquise por código, descrição ou argumento de contestação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o código ou descrição da glosa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                <SelectTrigger className="w-full md:w-[250px]">
                  <SelectValue placeholder="Filtrar por grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  {todosGrupos.map((grupo) => (
                    <SelectItem key={grupo} value={grupo}>
                      {grupo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs para TISS e Personalizados */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="tiss">
              Códigos TISS ({glosasFiltradas.length})
            </TabsTrigger>
            <TabsTrigger value="personalizados">
              Personalizados ({motivosFiltrados.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tiss">
            <Card>
              <CardHeader>
                <CardTitle>Códigos de Glosa TISS</CardTitle>
                <CardDescription>
                  Clique em uma glosa para ver detalhes e sugestões de contestação
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {glosasFiltradas.map((glosa) => (
                      <div
                        key={glosa.codigo}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handleOpenDetails(glosa)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              {glosa.codigo}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {glosa.grupo}
                            </Badge>
                            {glosa.argumentoContestacao && (
                              <Badge className="bg-green-100 text-green-700 text-xs">
                                Com argumento
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-medium truncate">
                            {glosa.descricaoSimplificada}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {glosa.descricao}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          {glosa.probabilidadeSucesso && (
                            <div className="text-right">
                              <p className={`text-sm font-medium ${getProbabilidadeColor(glosa.probabilidadeSucesso)}`}>
                                {glosa.probabilidadeSucesso}%
                              </p>
                              <p className="text-xs text-muted-foreground">sucesso</p>
                            </div>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="personalizados">
            <Card>
              <CardHeader>
                <CardTitle>Motivos de Glosa Personalizados</CardTitle>
                <CardDescription>
                  Códigos de glosa customizados para seu estabelecimento
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMotivos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : motivosFiltrados.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nenhum motivo de glosa personalizado cadastrado.
                    </p>
                    <Button onClick={handleOpenCreate} className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Primeiro Motivo
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {motivosFiltrados.map((motivo) => (
                        <div
                          key={motivo.id}
                          className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="font-mono">
                                {motivo.codigo}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {motivo.grupo}
                              </Badge>
                              <Badge className="bg-blue-100 text-blue-700 text-xs">
                                Personalizado
                              </Badge>
                              {motivo.argumentoContestacao && (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  Com argumento
                                </Badge>
                              )}
                            </div>
                            <p className="mt-2 text-sm font-medium truncate">
                              {motivo.descricaoSimplificada}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {motivo.descricao}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {motivo.probabilidadeSucesso && (
                              <div className="text-right mr-4">
                                <p className={`text-sm font-medium ${getProbabilidadeColor(motivo.probabilidadeSucesso)}`}>
                                  {motivo.probabilidadeSucesso}%
                                </p>
                                <p className="text-xs text-muted-foreground">sucesso</p>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(motivo as MotivoGlosaDB)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteMotivo(motivo.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog de Detalhes da Glosa TISS */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedGlosa && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                      {selectedGlosa.codigo}
                    </Badge>
                    <Badge variant="secondary">{selectedGlosa.grupo}</Badge>
                  </div>
                  <DialogTitle className="text-xl mt-2">
                    {selectedGlosa.descricaoSimplificada}
                  </DialogTitle>
                  <DialogDescription>
                    {selectedGlosa.descricao}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                  {/* Métricas */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Dificuldade de Reversão</span>
                      </div>
                      <Badge className={getDificuldadeColor(selectedGlosa.dificuldadeReversao)}>
                        {getDificuldadeLabel(selectedGlosa.dificuldadeReversao)}
                      </Badge>
                    </div>
                    <div className="p-4 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Probabilidade de Sucesso</span>
                      </div>
                      <span className={`text-2xl font-bold ${getProbabilidadeColor(selectedGlosa.probabilidadeSucesso)}`}>
                        {selectedGlosa.probabilidadeSucesso || "N/A"}%
                      </span>
                    </div>
                  </div>

                  {/* Argumento de Contestação */}
                  {selectedGlosa.argumentoContestacao && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Argumento de Contestação Sugerido
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyArgumento(selectedGlosa.argumentoContestacao!)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copiar
                        </Button>
                      </div>
                      <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                        <p className="text-sm text-green-800">
                          {selectedGlosa.argumentoContestacao}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ações Recomendadas */}
                  {selectedGlosa.acoesRecomendadas && selectedGlosa.acoesRecomendadas.length > 0 && (
                    <div>
                      <h4 className="font-semibold flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Ações Recomendadas
                      </h4>
                      <ul className="space-y-2">
                        {selectedGlosa.acoesRecomendadas.map((acao, index) => (
                          <li key={index} className="flex items-start gap-2 text-sm">
                            <span className="text-green-600 mt-1">•</span>
                            {acao}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Documentos Sugeridos */}
                  {selectedGlosa.documentosSugeridos && selectedGlosa.documentosSugeridos.length > 0 && (
                    <div>
                      <h4 className="font-semibold flex items-center gap-2 mb-2">
                        <FileCheck className="h-4 w-4" />
                        Documentos Sugeridos para Anexar
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedGlosa.documentosSugeridos.map((doc, index) => (
                          <Badge key={index} variant="outline">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog de Criar/Editar Motivo */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMotivo ? "Editar Motivo de Glosa" : "Novo Motivo de Glosa"}
              </DialogTitle>
              <DialogDescription>
                {editingMotivo 
                  ? "Atualize as informações do motivo de glosa" 
                  : "Cadastre um novo código de glosa personalizado"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input
                    id="codigo"
                    placeholder="Ex: PERS001"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grupo">Grupo/Categoria *</Label>
                  <Input
                    id="grupo"
                    placeholder="Ex: Procedimentos"
                    value={formData.grupo}
                    onChange={(e) => setFormData({ ...formData, grupo: e.target.value })}
                    list="grupos-list"
                  />
                  <datalist id="grupos-list">
                    {todosGrupos.map(g => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricaoSimplificada">Descrição Simplificada *</Label>
                <Input
                  id="descricaoSimplificada"
                  placeholder="Descrição curta para exibição rápida"
                  value={formData.descricaoSimplificada}
                  onChange={(e) => setFormData({ ...formData, descricaoSimplificada: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição Completa *</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descrição detalhada do motivo de glosa"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="argumentoContestacao">Argumento de Contestação</Label>
                <Textarea
                  id="argumentoContestacao"
                  placeholder="Sugestão de texto para contestar esta glosa"
                  value={formData.argumentoContestacao}
                  onChange={(e) => setFormData({ ...formData, argumentoContestacao: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="acoesRecomendadas">Ações Recomendadas (uma por linha)</Label>
                <Textarea
                  id="acoesRecomendadas"
                  placeholder="Verificar documentação&#10;Solicitar autorização prévia&#10;Conferir código do procedimento"
                  value={formData.acoesRecomendadas}
                  onChange={(e) => setFormData({ ...formData, acoesRecomendadas: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentosSugeridos">Documentos Sugeridos (um por linha)</Label>
                <Textarea
                  id="documentosSugeridos"
                  placeholder="Laudo médico&#10;Autorização prévia&#10;Prontuário do paciente"
                  value={formData.documentosSugeridos}
                  onChange={(e) => setFormData({ ...formData, documentosSugeridos: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dificuldadeReversao">Dificuldade de Reversão (1-5)</Label>
                  <Select 
                    value={String(formData.dificuldadeReversao)} 
                    onValueChange={(v) => setFormData({ ...formData, dificuldadeReversao: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Muito Fácil</SelectItem>
                      <SelectItem value="2">2 - Fácil</SelectItem>
                      <SelectItem value="3">3 - Moderado</SelectItem>
                      <SelectItem value="4">4 - Difícil</SelectItem>
                      <SelectItem value="5">5 - Muito Difícil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="probabilidadeSucesso">Probabilidade de Sucesso (%)</Label>
                  <Input
                    id="probabilidadeSucesso"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probabilidadeSucesso}
                    onChange={(e) => setFormData({ ...formData, probabilidadeSucesso: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveMotivo}
                disabled={
                  !formData.codigo || 
                  !formData.grupo || 
                  !formData.descricao || 
                  !formData.descricaoSimplificada ||
                  criarMotivoMutation.isPending ||
                  atualizarMotivoMutation.isPending
                }
              >
                {(criarMotivoMutation.isPending || atualizarMotivoMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingMotivo ? "Salvar Alterações" : "Criar Motivo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
