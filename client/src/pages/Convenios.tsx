// Tela de Convênios - CRUD completo com associação de prestadores
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  ToggleLeft,
  ToggleRight,
  FileText,
  Building2,
  ChevronDown,
  ChevronRight,
  Link2,
} from "lucide-react";

export default function Convenios() {
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [registroAns, setRegistroAns] = useState("");
  const [prazoRecurso, setPrazoRecurso] = useState(30);
  const [expandedConvenio, setExpandedConvenio] = useState<number | null>(null);

  // Dialog de prestador
  const [prestadorDialogOpen, setPrestadorDialogOpen] = useState(false);
  const [prestadorConvenioId, setPrestadorConvenioId] = useState<number | null>(null);
  const [prestadorEstabelecimentoId, setPrestadorEstabelecimentoId] = useState<number | null>(null);
  const [prestadorCodigo, setPrestadorCodigo] = useState("");
  const [prestadorNome, setPrestadorNome] = useState("");

  const utils = trpc.useUtils();
  const { data: convenios, isLoading } = trpc.convenios.list.useQuery({});
  const { data: estabelecimentos } = trpc.estabelecimentos.list.useQuery();

  const createMutation = trpc.convenios.create.useMutation({
    onSuccess: () => {
      toast.success("Convênio criado com sucesso!");
      utils.convenios.list.invalidate();
      fecharDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.convenios.update.useMutation({
    onSuccess: () => {
      toast.success("Convênio atualizado com sucesso!");
      utils.convenios.list.invalidate();
      fecharDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const upsertPrestadorMutation = trpc.convenios.upsertPrestador.useMutation({
    onSuccess: () => {
      toast.success("Prestador vinculado com sucesso!");
      if (expandedConvenio) {
        utils.convenios.listarPrestadores.invalidate({ convenioId: expandedConvenio });
      }
      fecharPrestadorDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const excluirPrestadorMutation = trpc.convenios.excluirPrestador.useMutation({
    onSuccess: () => {
      toast.success("Prestador removido!");
      if (expandedConvenio) {
        utils.convenios.listarPrestadores.invalidate({ convenioId: expandedConvenio });
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const fecharDialog = () => {
    setDialogOpen(false);
    setEditando(null);
    setNome("");
    setCodigo("");
    setRegistroAns("");
    setPrazoRecurso(30);
  };

  const fecharPrestadorDialog = () => {
    setPrestadorDialogOpen(false);
    setPrestadorConvenioId(null);
    setPrestadorEstabelecimentoId(null);
    setPrestadorCodigo("");
    setPrestadorNome("");
  };

  const abrirEditar = (conv: any) => {
    setEditando(conv);
    setNome(conv.nome);
    setCodigo(conv.codigo || "");
    setRegistroAns(conv.registroAns || "");
    setPrazoRecurso(conv.prazoRecursoGlosa || 30);
    setDialogOpen(true);
  };

  const abrirNovo = () => {
    setEditando(null);
    setNome("");
    setCodigo("");
    setRegistroAns("");
    setPrazoRecurso(30);
    setDialogOpen(true);
  };

  const abrirVincularPrestador = (convenioId: number) => {
    setPrestadorConvenioId(convenioId);
    setPrestadorEstabelecimentoId(null);
    setPrestadorCodigo("");
    setPrestadorNome("");
    setPrestadorDialogOpen(true);
  };

  const salvar = () => {
    if (!nome.trim()) {
      toast.error("Nome do convênio é obrigatório");
      return;
    }

    if (editando) {
      updateMutation.mutate({
        id: editando.id,
        nome: nome.trim(),
        codigo: codigo.trim() || undefined,
        registroAns: registroAns.trim() || undefined,
        prazoRecursoGlosa: prazoRecurso,
      });
    } else {
      createMutation.mutate({
        nome: nome.trim(),
        codigo: codigo.trim() || undefined,
        registroAns: registroAns.trim() || undefined,
        prazoRecursoGlosa: prazoRecurso,
      });
    }
  };

  const salvarPrestador = () => {
    if (!prestadorConvenioId || !prestadorEstabelecimentoId || !prestadorCodigo.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    upsertPrestadorMutation.mutate({
      convenioId: prestadorConvenioId,
      estabelecimentoId: prestadorEstabelecimentoId,
      codigoPrestador: prestadorCodigo.trim(),
      nomePrestador: prestadorNome.trim() || undefined,
    });
  };

  const toggleAtivo = (conv: any) => {
    updateMutation.mutate({
      id: conv.id,
      ativo: conv.ativo === "sim" ? "nao" : "sim",
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedConvenio(expandedConvenio === id ? null : id);
  };

  const conveniosFiltrados = useMemo(() => {
    return (
      convenios?.filter(
        (c: any) =>
          c.nome?.toLowerCase().includes(busca.toLowerCase()) ||
          c.codigo?.toLowerCase().includes(busca.toLowerCase())
      ) || []
    );
  }, [convenios, busca]);

  const totalAtivos = convenios?.filter((c: any) => c.ativo === "sim").length || 0;
  const totalInativos = convenios?.filter((c: any) => c.ativo !== "sim").length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Convênios</h1>
            <p className="text-muted-foreground">
              Gerencie os convênios, planos de saúde e códigos de prestador
            </p>
          </div>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Convênio
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Convênios</p>
                  <p className="text-2xl font-bold">{convenios?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <ToggleRight className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ativos</p>
                  <p className="text-2xl font-bold text-green-600">{totalAtivos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <ToggleLeft className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Inativos</p>
                  <p className="text-2xl font-bold text-red-600">{totalInativos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Convênios */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Lista de Convênios
            </CardTitle>
            <CardDescription>
              Clique em um convênio para ver os prestadores vinculados por estabelecimento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou código..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando convênios...
              </div>
            ) : conveniosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {busca
                  ? "Nenhum convênio encontrado para a busca"
                  : "Nenhum convênio cadastrado"}
              </div>
            ) : (
              <div className="space-y-2">
                {conveniosFiltrados.map((conv: any) => (
                  <ConvenioRow
                    key={conv.id}
                    convenio={conv}
                    isExpanded={expandedConvenio === conv.id}
                    onToggleExpand={() => toggleExpand(conv.id)}
                    onEditar={() => abrirEditar(conv)}
                    onToggleAtivo={() => toggleAtivo(conv)}
                    onVincularPrestador={() => abrirVincularPrestador(conv.id)}
                    onExcluirPrestador={(prestadorId: number) =>
                      excluirPrestadorMutation.mutate({ id: prestadorId })
                    }
                    estabelecimentos={estabelecimentos || []}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Criar/Editar Convênio */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editando ? "Editar Convênio" : "Novo Convênio"}
              </DialogTitle>
              <DialogDescription>
                {editando
                  ? "Atualize as informações do convênio"
                  : "Preencha os dados do novo convênio"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: UNIMED GOIANIA"
                />
              </div>
              <div>
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ex: 001"
                />
              </div>
              <div>
                <Label htmlFor="registroAns">Registro ANS</Label>
                <Input
                  id="registroAns"
                  value={registroAns}
                  onChange={(e) => setRegistroAns(e.target.value)}
                  placeholder="Ex: 999999"
                  maxLength={6}
                />
              </div>
              <div>
                <Label htmlFor="prazo">Prazo para Recurso de Glosa (dias)</Label>
                <Input
                  id="prazo"
                  type="number"
                  value={prazoRecurso}
                  onChange={(e) => setPrazoRecurso(parseInt(e.target.value) || 30)}
                  min={1}
                  max={365}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fecharDialog}>
                Cancelar
              </Button>
              <Button
                onClick={salvar}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Salvando..."
                  : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de Vincular Prestador */}
        <Dialog open={prestadorDialogOpen} onOpenChange={setPrestadorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Prestador</DialogTitle>
              <DialogDescription>
                Associe um código de prestador a um estabelecimento para este
                convênio
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Estabelecimento *</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={prestadorEstabelecimentoId || ""}
                  onChange={(e) =>
                    setPrestadorEstabelecimentoId(
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                >
                  <option value="">Selecione um estabelecimento</option>
                  {estabelecimentos?.map((est: any) => (
                    <option key={est.id} value={est.id}>
                      {est.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="prestadorCodigo">Código do Prestador *</Label>
                <Input
                  id="prestadorCodigo"
                  value={prestadorCodigo}
                  onChange={(e) => setPrestadorCodigo(e.target.value)}
                  placeholder="Ex: 123456"
                />
              </div>
              <div>
                <Label htmlFor="prestadorNome">Nome do Prestador</Label>
                <Input
                  id="prestadorNome"
                  value={prestadorNome}
                  onChange={(e) => setPrestadorNome(e.target.value)}
                  placeholder="Ex: Hospital São Lucas"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fecharPrestadorDialog}>
                Cancelar
              </Button>
              <Button
                onClick={salvarPrestador}
                disabled={upsertPrestadorMutation.isPending}
              >
                {upsertPrestadorMutation.isPending ? "Salvando..." : "Vincular"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Componente de linha expandível para cada convênio
function ConvenioRow({
  convenio,
  isExpanded,
  onToggleExpand,
  onEditar,
  onToggleAtivo,
  onVincularPrestador,
  onExcluirPrestador,
  estabelecimentos,
}: {
  convenio: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditar: () => void;
  onToggleAtivo: () => void;
  onVincularPrestador: () => void;
  onExcluirPrestador: (id: number) => void;
  estabelecimentos: any[];
}) {
  const { data: prestadores } = trpc.convenios.listarPrestadores.useQuery(
    { convenioId: convenio.id },
    { enabled: isExpanded }
  );

  const getEstabelecimentoNome = (id: number) => {
    const est = estabelecimentos.find((e: any) => e.id === id);
    return est?.nome || `ID ${id}`;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Linha principal */}
      <div
        className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
          isExpanded ? "bg-muted/30 border-b" : ""
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{convenio.nome}</span>
            {convenio.codigo && (
              <Badge variant="outline" className="text-xs shrink-0">
                {convenio.codigo}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Prazo recurso: {convenio.prazoRecursoGlosa || 30} dias
          </p>
        </div>
        <Badge
          variant={convenio.ativo === "sim" ? "default" : "secondary"}
          className="shrink-0"
        >
          {convenio.ativo === "sim" ? "Ativo" : "Inativo"}
        </Badge>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={onEditar} title="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleAtivo}
            title={convenio.ativo === "sim" ? "Desativar" : "Ativar"}
          >
            {convenio.ativo === "sim" ? (
              <ToggleRight className="h-4 w-4 text-green-500" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-red-500" />
            )}
          </Button>
        </div>
      </div>

      {/* Área expandida - Prestadores */}
      {isExpanded && (
        <div className="p-4 bg-muted/10">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Prestadores por Estabelecimento
            </h4>
            <Button size="sm" variant="outline" onClick={onVincularPrestador}>
              <Plus className="h-3 w-3 mr-1" />
              Vincular Prestador
            </Button>
          </div>

          {!prestadores || prestadores.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              Nenhum prestador vinculado a este convênio.
              <br />
              Clique em "Vincular Prestador" para associar um código de prestador a um estabelecimento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estabelecimento</TableHead>
                  <TableHead>Código Prestador</TableHead>
                  <TableHead>Nome Prestador</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prestadores.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {getEstabelecimentoNome(p.estabelecimentoId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.codigoPrestador}</Badge>
                    </TableCell>
                    <TableCell>{p.nomePrestador || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => onExcluirPrestador(p.id)}
                      >
                        Remover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
