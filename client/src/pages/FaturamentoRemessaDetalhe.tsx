import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Edit, Trash2, Lock, AlertTriangle, RefreshCw, Unlock, FileText } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function FaturamentoRemessaDetalhe() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const loteId = Number(params.id);
  const { estabelecimentoAtual } = useEstabelecimento();

  // Modal editar remessa
  const [showEditar, setShowEditar] = useState(false);
  const [editNf, setEditNf] = useState("");
  const [editProtocolo, setEditProtocolo] = useState("");
  const [editDataFat, setEditDataFat] = useState("");
  const [editCompetencia, setEditCompetencia] = useState("");

  // Modal confirmar fechamento
  const [showConfirmarFechar, setShowConfirmarFechar] = useState(false);

  // Queries
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: lotes, refetch: refetchLotes } = trpc.faturamentoDigitacao.listarLotes.useQuery({});
  const lote = lotes?.find((l: any) => l.id === loteId);

  const { data: guiasData, refetch: refetchGuias } = trpc.faturamentoDigitacao.listarGuias.useQuery({
    estabelecimentoId: estabelecimentoAtual?.id,
    loteId,
  });
  const guias = guiasData?.guias || [];

  const atualizarLote = trpc.faturamentoDigitacao.atualizarLote.useMutation({
    onSuccess: () => {
      toast.success("Remessa atualizada!");
      setShowEditar(false);
      refetchLotes();
    },
    onError: (err) => toast.error(err.message),
  });

  const fecharLote = trpc.faturamentoDigitacao.fecharLote.useMutation({
    onSuccess: (data) => {
      toast.success(`Remessa fechada com sucesso! ${data.totalGuias} guia(s) no lote.`);
      setShowConfirmarFechar(false);
      refetchLotes();
    },
    onError: (err) => toast.error(err.message),
  });

  const removerGuia = trpc.faturamentoDigitacao.removerGuiaDoLote.useMutation({
    onSuccess: () => {
      toast.success("Guia removida da remessa");
      refetchGuias();
    },
    onError: (err) => toast.error(err.message),
  });

  const gerarXml = trpc.faturamentoDigitacao.gerarXmlTiss.useMutation({
    onSuccess: (data) => {
      toast.success("XML regenerado com sucesso!");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(`Erro ao gerar XML: ${err.message}`),
  });

  const reabrirLote = trpc.faturamentoDigitacao.reabrirLote.useMutation({
    onSuccess: () => {
      toast.success("Remessa reaberta com sucesso!");
      refetchLotes();
    },
    onError: (err) => toast.error(`Erro ao reabrir: ${err.message}`),
  });

  const isFechada = lote?.status === "fechado" || lote?.status === "enviado";

  function openEditar() {
    setEditNf(lote?.nf || "");
    setEditProtocolo(lote?.protocoloEntrega || "");
    setEditDataFat(lote?.dataFaturamento || "");
    setEditCompetencia(lote?.competencia || "");
    setShowEditar(true);
  }

  function handleAtualizar() {
    atualizarLote.mutate({
      id: loteId,
      nf: editNf || undefined,
      protocoloEntrega: editProtocolo || undefined,
      dataFaturamento: editDataFat || undefined,
      competencia: editCompetencia || undefined,
    });
  }

  const tipoLabel = (tipo: string) => {
    switch (tipo) {
      case "consultas": return "Consultas";
      case "exames": return "Exames";
      case "internacao": return "Internação";
      default: return tipo || "-";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "aberto": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Aberto</Badge>;
      case "fechado": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Fechado</Badge>;
      case "enviado": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Enviado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!lote) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <p className="text-muted-foreground">Carregando remessa...</p>
        </div>
      </DashboardLayout>
    );
  }

  const convenioNome = convenios?.find((c: any) => c.id === lote.convenioId)?.nome || "-";

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/faturamento/lotes")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Remessa: {lote.numeroLote}</h1>
            <p className="text-muted-foreground">
              {convenioNome} | {tipoLabel(lote.tipoAtendimento)} | {statusBadge(lote.status)}
            </p>
          </div>
          {!isFechada && (
            <>
              <Button variant="outline" onClick={openEditar}>
                <Edit className="w-4 h-4 mr-2" /> Editar
              </Button>
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setShowConfirmarFechar(true)}
              >
                <Lock className="w-4 h-4 mr-2" /> Fechar Remessa
              </Button>
            </>
          )}
          {isFechada && (
            <>
              <Button
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => gerarXml.mutate({ loteId })}
                disabled={gerarXml.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {gerarXml.isPending ? "Gerando..." : "Regenerar XML"}
              </Button>
              <Button
                variant="outline"
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={() => { if (confirm("Reabrir esta remessa para edição?")) reabrirLote.mutate({ id: loteId }); }}
                disabled={reabrirLote.isPending}
              >
                <Unlock className="w-4 h-4 mr-2" />
                Reabrir Remessa
              </Button>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 px-4 py-2 text-sm">
                <Lock className="w-4 h-4 mr-2 inline" /> Remessa Fechada
              </Badge>
            </>
          )}
          <Button onClick={() => navigate(`/faturamento/guia/nova?loteId=${loteId}&convenioId=${lote.convenioId}`)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Guia
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Data Faturamento</p>
              <p className="font-semibold">{lote.dataFaturamento || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Competência</p>
              <p className="font-semibold">{lote.competencia || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">NF</p>
              <p className="font-semibold">{lote.nf || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Protocolo Entrega</p>
              <p className="font-semibold">{lote.protocoloEntrega || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Valor Total</p>
              <p className="font-semibold text-primary">
                R$ {Number(lote.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Guias da Remessa */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Guias da Remessa ({guias.length})</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Guia</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Carteirinha</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(guias.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma guia nesta remessa. {!isFechada && 'Clique em "Nova Guia" para adicionar.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  guias.map((guia: any) => (
                    <TableRow key={guia.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/faturamento/guia/${guia.id}`)}>
                      <TableCell className="font-mono">{guia.numeroGuiaPrestador || guia.id}</TableCell>
                      <TableCell>{guia.nomePaciente}</TableCell>
                      <TableCell>{guia.carteirinha || "-"}</TableCell>
                      <TableCell>{guia.dataAtendimento || guia.dataInicio || "-"}</TableCell>
                      <TableCell className="font-semibold">
                        R$ {Number(guia.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={guia.status === "finalizada" ? "bg-green-50 text-green-700" : "bg-gray-50"}>
                          {guia.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/faturamento/guia/${guia.id}`); }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!isFechada && (
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Remover guia desta remessa?")) {
                                removerGuia.mutate({ guiaId: guia.id, loteId });
                              }
                            }}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal Editar Remessa */}
        <Dialog open={showEditar} onOpenChange={setShowEditar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Remessa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Data de Faturamento</Label>
                <Input type="date" value={editDataFat} onChange={(e) => setEditDataFat(e.target.value)} />
              </div>
              <div>
                <Label>Competência (MM/AAAA)</Label>
                <Input placeholder="07/2026" value={editCompetencia} onChange={(e) => setEditCompetencia(e.target.value)} />
              </div>
              <div>
                <Label>NF (Nota Fiscal)</Label>
                <Input placeholder="Número da NF" value={editNf} onChange={(e) => setEditNf(e.target.value)} />
              </div>
              <div>
                <Label>Protocolo de Entrega</Label>
                <Input placeholder="Protocolo" value={editProtocolo} onChange={(e) => setEditProtocolo(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditar(false)}>Cancelar</Button>
              <Button onClick={handleAtualizar} disabled={atualizarLote.isPending}>
                {atualizarLote.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Confirmar Fechamento */}
        <Dialog open={showConfirmarFechar} onOpenChange={setShowConfirmarFechar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Fechar Remessa
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ao fechar esta remessa, não será mais possível adicionar, editar ou remover guias.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm"><strong>Remessa:</strong> {lote.numeroLote}</p>
                <p className="text-sm"><strong>Convênio:</strong> {convenioNome}</p>
                <p className="text-sm"><strong>Guias:</strong> {guias.length}</p>
                <p className="text-sm"><strong>Valor Total:</strong> R$ {Number(lote.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <p className="text-sm font-medium text-amber-600">
                Deseja confirmar o fechamento?
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmarFechar(false)}>Cancelar</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => fecharLote.mutate({ id: loteId })}
                disabled={fecharLote.isPending}
              >
                {fecharLote.isPending ? "Fechando..." : "Confirmar Fechamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
