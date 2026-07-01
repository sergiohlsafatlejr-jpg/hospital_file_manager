import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Package, FileText, Edit, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function FaturamentoRemessas() {
  const [, navigate] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;

  // Filtros
  const [filtroConvenio, setFiltroConvenio] = useState<number | undefined>();
  const [filtroStatus, setFiltroStatus] = useState<string | undefined>();
  const [filtroTipo, setFiltroTipo] = useState<string | undefined>();

  // Modal criar remessa
  const [showCriar, setShowCriar] = useState(false);
  const [novoConvenioId, setNovoConvenioId] = useState<number | undefined>();
  const [novoTipoAtendimento, setNovoTipoAtendimento] = useState<"consultas" | "exames" | "internacao">("exames");
  const [novoDataFaturamento, setNovoDataFaturamento] = useState("");
  const [novoCompetencia, setNovoCompetencia] = useState("");
  const [novoNf, setNovoNf] = useState("");
  const [novoProtocolo, setNovoProtocolo] = useState("");

  // Queries
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: lotes, refetch } = trpc.faturamentoDigitacao.listarLotes.useQuery({
    estabelecimentoId,
    convenioId: filtroConvenio,
    status: filtroStatus as any,
  });

  const criarLote = trpc.faturamentoDigitacao.criarLote.useMutation({
    onSuccess: () => {
      toast.success("Remessa criada com sucesso!");
      setShowCriar(false);
      resetForm();
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setNovoConvenioId(undefined);
    setNovoTipoAtendimento("exames");
    setNovoDataFaturamento("");
    setNovoCompetencia("");
    setNovoNf("");
    setNovoProtocolo("");
  }

  function handleCriar() {
    if (!estabelecimentoId) {
      toast.error("Selecione um estabelecimento no menu lateral");
      return;
    }
    if (!novoConvenioId) {
      toast.error("Selecione o convênio");
      return;
    }
    criarLote.mutate({
      estabelecimentoId,
      convenioId: novoConvenioId,
      tipoAtendimento: novoTipoAtendimento,
      dataFaturamento: novoDataFaturamento || undefined,
      competencia: novoCompetencia || undefined,
      nf: novoNf || undefined,
      protocoloEntrega: novoProtocolo || undefined,
    });
  }

  // Filtrar por tipo de atendimento no frontend (já que a query não suporta)
  const lotesFiltrados = useMemo(() => {
    if (!lotes) return [];
    let filtered = lotes;
    if (filtroTipo) {
      filtered = filtered.filter((l: any) => l.tipoAtendimento === filtroTipo);
    }
    return filtered;
  }, [lotes, filtroTipo]);

  // Totais por convênio
  const totaisPorConvenio = useMemo(() => {
    if (!lotesFiltrados) return {};
    const map: Record<string, { total: number; count: number }> = {};
    lotesFiltrados.forEach((l: any) => {
      const convenioNome = convenios?.find((c: any) => c.id === l.convenioId)?.nome || "Desconhecido";
      if (!map[convenioNome]) map[convenioNome] = { total: 0, count: 0 };
      map[convenioNome].total += Number(l.valorTotal || 0);
      map[convenioNome].count += 1;
    });
    return map;
  }, [lotesFiltrados, convenios]);

  const tipoLabel = (tipo: string) => {
    switch (tipo) {
      case "consultas": return "Consultas";
      case "exames": return "Exames";
      case "internacao": return "Internação";
      default: return tipo;
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

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Remessas de Faturamento</h1>
            <p className="text-muted-foreground">Gerencie as remessas (lotes) por convênio e tipo de atendimento</p>
          </div>
          <Button onClick={() => setShowCriar(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Remessa
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap">
          <Select value={filtroConvenio?.toString() || "all"} onValueChange={(v) => setFiltroConvenio(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos Convênios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Convênios</SelectItem>
              {convenios?.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroTipo || "all"} onValueChange={(v) => setFiltroTipo(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              <SelectItem value="consultas">Consultas</SelectItem>
              <SelectItem value="exames">Exames</SelectItem>
              <SelectItem value="internacao">Internação</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroStatus || "all"} onValueChange={(v) => setFiltroStatus(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Todos Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Resumo por Convênio */}
        {Object.keys(totaisPorConvenio).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(totaisPorConvenio).map(([nome, dados]) => (
              <Card key={nome}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{nome}</p>
                  <p className="text-lg font-bold text-primary">
                    R$ {dados.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground">{dados.count} remessa(s)</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabela de Remessas */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Lote</TableHead>
                  <TableHead>Convênio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data Faturamento</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Guias</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotesFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Nenhuma remessa encontrada. Clique em "Nova Remessa" para criar.
                    </TableCell>
                  </TableRow>
                ) : (
                  lotesFiltrados.map((lote: any) => (
                    <TableRow key={lote.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/faturamento/remessa/${lote.id}`)}>
                      <TableCell className="font-mono text-sm">{lote.numeroLote}</TableCell>
                      <TableCell>{convenios?.find((c: any) => c.id === lote.convenioId)?.nome || "-"}</TableCell>
                      <TableCell>{tipoLabel(lote.tipoAtendimento || "exames")}</TableCell>
                      <TableCell>{lote.dataFaturamento || "-"}</TableCell>
                      <TableCell>{lote.competencia || "-"}</TableCell>
                      <TableCell>{lote.nf || "-"}</TableCell>
                      <TableCell>{lote.protocoloEntrega || "-"}</TableCell>
                      <TableCell>{lote.totalGuias || 0}</TableCell>
                      <TableCell className="font-semibold">
                        R$ {Number(lote.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{statusBadge(lote.status)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/faturamento/remessa/${lote.id}`); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal Criar Remessa */}
        <Dialog open={showCriar} onOpenChange={setShowCriar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Remessa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Convênio *</Label>
                <Select value={novoConvenioId?.toString() || ""} onValueChange={(v) => setNovoConvenioId(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de Atendimento *</Label>
                <Select value={novoTipoAtendimento} onValueChange={(v: any) => setNovoTipoAtendimento(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultas">Consultas</SelectItem>
                    <SelectItem value="exames">Exames</SelectItem>
                    <SelectItem value="internacao">Internação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Data de Faturamento</Label>
                <Input type="date" value={novoDataFaturamento} onChange={(e) => setNovoDataFaturamento(e.target.value)} />
              </div>

              <div>
                <Label>Competência (MM/AAAA)</Label>
                <Input placeholder="07/2026" value={novoCompetencia} onChange={(e) => setNovoCompetencia(e.target.value)} />
              </div>

              <div>
                <Label>NF (Nota Fiscal)</Label>
                <Input placeholder="Número da NF" value={novoNf} onChange={(e) => setNovoNf(e.target.value)} />
              </div>

              <div>
                <Label>Protocolo de Entrega</Label>
                <Input placeholder="Protocolo" value={novoProtocolo} onChange={(e) => setNovoProtocolo(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button onClick={handleCriar} disabled={criarLote.isPending}>
                {criarLote.isPending ? "Criando..." : "Criar Remessa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
