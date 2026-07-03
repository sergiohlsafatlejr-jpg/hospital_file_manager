import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";
import {
  Link2, Plus, Trash2, Search, BookOpen, Zap, ArrowRightLeft
} from "lucide-react";

export default function VinculacoesPadrao() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;

  const [modalAberto, setModalAberto] = useState(false);
  const [codigoFaturado, setCodigoFaturado] = useState("");
  const [codigoRecebido, setCodigoRecebido] = useState("");
  const [descricaoFaturado, setDescricaoFaturado] = useState("");
  const [descricaoRecebido, setDescricaoRecebido] = useState("");
  const [tipoItem, setTipoItem] = useState("");
  const [filtro, setFiltro] = useState("");

  const { data: vinculacoes, isLoading, refetch } = trpc.faturamentoUnificado.listarVinculacoesPadrao.useQuery(
    { estabelecimentoId },
    { enabled: estabelecimentoId > 0 }
  );

  const salvarMut = trpc.faturamentoUnificado.salvarVinculacaoPadrao.useMutation({
    onSuccess: () => {
      toast.success("Vinculação padrão salva com sucesso!");
      refetch();
      setModalAberto(false);
      limparForm();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const excluirMut = trpc.faturamentoUnificado.excluirVinculacaoPadrao.useMutation({
    onSuccess: () => {
      toast.success("Vinculação removida");
      refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const limparForm = () => {
    setCodigoFaturado("");
    setCodigoRecebido("");
    setDescricaoFaturado("");
    setDescricaoRecebido("");
    setTipoItem("");
  };

  const vinculacoesFiltradas = (vinculacoes || []).filter((v: any) => {
    if (!filtro) return true;
    const f = filtro.toLowerCase();
    return (
      v.codigoFaturado?.toLowerCase().includes(f) ||
      v.codigoRecebido?.toLowerCase().includes(f) ||
      v.descricaoFaturado?.toLowerCase().includes(f) ||
      v.descricaoRecebido?.toLowerCase().includes(f)
    );
  });

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-primary" />
              Vinculações Padrão
            </h1>
            <p className="text-muted-foreground">
              Cadastre vinculações entre códigos faturados e recebidos para o sistema aprender e aplicar automaticamente
            </p>
          </div>
          <Button onClick={() => setModalAberto(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Vinculação
          </Button>
        </div>

        {/* Explicação */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">Como funciona o aprendizado automático?</p>
                <p className="text-muted-foreground mt-1">
                  Quando você faz uma vinculação manual na tela de Conciliação Cruzada, o sistema registra automaticamente 
                  a associação entre os códigos. Nas próximas conciliações, o sistema usará essas vinculações para associar 
                  itens automaticamente. Você também pode cadastrar vinculações manualmente aqui.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtro */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary">{vinculacoesFiltradas.length} vinculações</Badge>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : vinculacoesFiltradas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ArrowRightLeft className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhuma vinculação padrão cadastrada</p>
                <p className="text-sm mt-1">Cadastre vinculações ou faça vinculações manuais na Conciliação Cruzada para o sistema aprender.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Código Faturado</th>
                      <th className="text-left p-3 font-medium">Descrição Faturado</th>
                      <th className="text-center p-3 font-medium w-10">
                        <ArrowRightLeft className="w-4 h-4 mx-auto" />
                      </th>
                      <th className="text-left p-3 font-medium">Código Recebido</th>
                      <th className="text-left p-3 font-medium">Descrição Recebido</th>
                      <th className="text-center p-3 font-medium">Tipo</th>
                      <th className="text-center p-3 font-medium">Usos</th>
                      <th className="text-left p-3 font-medium">Criado Por</th>
                      <th className="text-center p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vinculacoesFiltradas.map((v: any) => (
                      <tr key={v.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-sm font-medium text-blue-600">{v.codigoFaturado}</td>
                        <td className="p-3 text-sm max-w-[180px] truncate" title={v.descricaoFaturado}>{v.descricaoFaturado || '-'}</td>
                        <td className="p-3 text-center">
                          <ArrowRightLeft className="w-4 h-4 mx-auto text-muted-foreground" />
                        </td>
                        <td className="p-3 font-mono text-sm font-medium text-teal-600">{v.codigoRecebido}</td>
                        <td className="p-3 text-sm max-w-[180px] truncate" title={v.descricaoRecebido}>{v.descricaoRecebido || '-'}</td>
                        <td className="p-3 text-center">
                          {v.tipoItem ? <Badge variant="outline" className="text-xs">{v.tipoItem}</Badge> : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="secondary" className="text-xs">{v.vezesUsado}x</Badge>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{v.criadoPor || '-'}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Remover vinculação ${v.codigoFaturado} ↔ ${v.codigoRecebido}?`)) {
                                excluirMut.mutate({ id: v.id, estabelecimentoId });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Nova Vinculação */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Nova Vinculação Padrão
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código Faturado *</Label>
                  <Input
                    placeholder="Ex: 40601110"
                    value={codigoFaturado}
                    onChange={(e) => setCodigoFaturado(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Código usado pelo hospital</p>
                </div>
                <div>
                  <Label>Código Recebido *</Label>
                  <Input
                    placeholder="Ex: 40601200"
                    value={codigoRecebido}
                    onChange={(e) => setCodigoRecebido(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Código usado pelo convênio</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Descrição Faturado</Label>
                  <Input
                    placeholder="Descrição do item"
                    value={descricaoFaturado}
                    onChange={(e) => setDescricaoFaturado(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Descrição Recebido</Label>
                  <Input
                    placeholder="Descrição do item"
                    value={descricaoRecebido}
                    onChange={(e) => setDescricaoRecebido(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Tipo do Item</Label>
                <Select value={tipoItem} onValueChange={setTipoItem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                    <SelectItem value="medicamento">Medicamento</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="taxa">Taxa</SelectItem>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="gas">Gás</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setModalAberto(false); limparForm(); }}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!codigoFaturado || !codigoRecebido) {
                    toast.error("Preencha os códigos faturado e recebido");
                    return;
                  }
                  salvarMut.mutate({
                    estabelecimentoId,
                    codigoFaturado,
                    codigoRecebido,
                    descricaoFaturado: descricaoFaturado || undefined,
                    descricaoRecebido: descricaoRecebido || undefined,
                    tipoItem: tipoItem || undefined,
                  });
                }}
                disabled={salvarMut.isPending}
              >
                {salvarMut.isPending ? "Salvando..." : "Salvar Vinculação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
