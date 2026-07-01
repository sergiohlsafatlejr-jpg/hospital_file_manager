import { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Search, Trash2, Edit, Package, Send } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function FaturamentoDigitacao() {
  const [, navigate] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [estabelecimentoId, setEstabelecimentoId] = useState<number | undefined>(
    estabelecimentoAtual && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined
  );

  // Sincronizar com o estabelecimento logado quando mudar
  useEffect(() => {
    if (estabelecimentoAtual && estabelecimentoAtual.id > 0 && !estabelecimentoId) {
      setEstabelecimentoId(estabelecimentoAtual.id);
    }
  }, [estabelecimentoAtual]);
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [tipoGuia, setTipoGuia] = useState<string | undefined>();
  const [statusFiltro, setStatusFiltro] = useState<string | undefined>();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);

  // Buscar estabelecimentos e convênios
  const { data: estabelecimentos } = trpc.estabelecimentos.list.useQuery();
  const { data: convenios } = trpc.convenios.list.useQuery(
    { ativo: "sim" }
  );

  const { data: guiasData, isLoading, refetch } = trpc.faturamentoDigitacao.listarGuias.useQuery({
    estabelecimentoId,
    convenioId,
    tipoGuia: tipoGuia as any,
    status: statusFiltro as any,
    busca: busca || undefined,
    page,
    limit: 50,
  });

  const excluirMutation = trpc.faturamentoDigitacao.excluirGuia.useMutation({
    onSuccess: () => {
      toast.success("Guia excluída com sucesso");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      rascunho: { label: "Rascunho", variant: "secondary" },
      finalizada: { label: "Finalizada", variant: "default" },
      em_lote: { label: "Em Lote", variant: "outline" },
      enviada: { label: "Enviada", variant: "default" },
    };
    const item = map[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  const tipoBadge = (tipo: string) => {
    return tipo === "sadt" 
      ? <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">SP/SADT</Badge>
      : <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Internação</Badge>;
  };

  // KPIs
  const totalGuias = guiasData?.total || 0;
  const guias = guiasData?.guias || [];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Faturamento - Digitação de Guias</h1>
            <p className="text-muted-foreground">Crie e gerencie guias SADT e Internação para faturamento</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/faturamento/lotes")}>
              <Package className="w-4 h-4 mr-2" />
              Remessas
            </Button>
            <Button onClick={() => navigate("/faturamento/nova-guia")}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Guia
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Select value={estabelecimentoId?.toString() || "all"} onValueChange={(v) => { setEstabelecimentoId(v === "all" ? undefined : Number(v)); setConvenioId(undefined); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Estabelecimento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Estabelecimentos</SelectItem>
                  {estabelecimentos?.map((e: any) => (
                    <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={convenioId?.toString() || "all"} onValueChange={(v) => { setConvenioId(v === "all" ? undefined : Number(v)); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Convênios</SelectItem>
                  {convenios?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tipoGuia || "all"} onValueChange={(v) => { setTipoGuia(v === "all" ? undefined : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de Guia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="sadt">SP/SADT</SelectItem>
                  <SelectItem value="internacao">Internação</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFiltro || "all"} onValueChange={(v) => { setStatusFiltro(v === "all" ? undefined : v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="finalizada">Finalizada</SelectItem>
                  <SelectItem value="em_lote">Em Lote</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar paciente, carteirinha..."
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total de Guias</p>
              <p className="text-2xl font-bold">{totalGuias}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Rascunhos</p>
              <p className="text-2xl font-bold text-amber-600">{guias.filter(g => g.status === "rascunho").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Finalizadas</p>
              <p className="text-2xl font-bold text-green-600">{guias.filter(g => g.status === "finalizada").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-2xl font-bold text-blue-600">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  guias.reduce((acc, g) => acc + Number(g.valorTotal || 0), 0)
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Guias */}
        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : guias.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma guia encontrada</p>
                <p className="text-muted-foreground mb-4">Comece criando uma nova guia de faturamento</p>
                <Button onClick={() => navigate("/faturamento/nova-guia")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Guia
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3">Tipo</th>
                      <th className="text-left p-3">Paciente</th>
                      <th className="text-left p-3">Carteirinha</th>
                      <th className="text-left p-3">Data</th>
                      <th className="text-left p-3">Nº Guia</th>
                      <th className="text-right p-3">Valor</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-center p-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guias.map((guia) => (
                      <tr key={guia.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/faturamento/guia/${guia.id}`)}>
                        <td className="p-3">{tipoBadge(guia.tipoGuia)}</td>
                        <td className="p-3 font-medium">{guia.nomePaciente}</td>
                        <td className="p-3 text-muted-foreground">{guia.carteirinha || "-"}</td>
                        <td className="p-3">{guia.dataAtendimento || guia.dataInicio || "-"}</td>
                        <td className="p-3">{guia.numeroGuiaPrestador || "-"}</td>
                        <td className="p-3 text-right font-medium">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(guia.valorTotal || 0))}
                        </td>
                        <td className="p-3 text-center">{statusBadge(guia.status)}</td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/faturamento/guia/${guia.id}`)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            {guia.status === "rascunho" && (
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                                onClick={() => {
                                  if (confirm("Excluir esta guia?")) excluirMutation.mutate({ id: guia.id });
                                }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {guiasData && guiasData.totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Página {page} de {guiasData.totalPages} ({guiasData.total} registros)
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={page >= guiasData.totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
