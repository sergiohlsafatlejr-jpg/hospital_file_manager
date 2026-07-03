import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Eye, Lock, Download } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function FaturamentoRemessasFechadas() {
  const [, navigate] = useLocation();
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual && estabelecimentoAtual.id > 0 ? estabelecimentoAtual.id : undefined;

  // Filtros
  const [filtroConvenio, setFiltroConvenio] = useState<number | undefined>();
  const [filtroTipo, setFiltroTipo] = useState<string | undefined>();

  // Queries
  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: lotes } = trpc.faturamentoDigitacao.listarLotes.useQuery({
    estabelecimentoId,
    convenioId: filtroConvenio,
    status: "fechado",
  });

  // Mutations para exportação
  const gerarXml = trpc.faturamentoDigitacao.gerarXmlTiss.useMutation({
    onSuccess: (data) => {
      toast.success("XML TISS gerado com sucesso!");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(`Erro ao gerar XML: ${err.message}`),
  });

  const gerarExcel = trpc.faturamentoDigitacao.gerarExcelUnimed.useMutation({
    onSuccess: (data) => {
      toast.success("Excel gerado com sucesso!");
      window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(`Erro ao gerar Excel: ${err.message}`),
  });

  // Filtrar por tipo de atendimento no frontend
  const lotesFiltrados = useMemo(() => {
    if (!lotes) return [];
    let filtered = lotes;
    if (filtroTipo) {
      filtered = filtered.filter((l: any) => l.tipoAtendimento === filtroTipo);
    }
    return filtered;
  }, [lotes, filtroTipo]);

  // Totais
  const totais = useMemo(() => {
    const total = lotesFiltrados.reduce((acc: number, l: any) => acc + Number(l.valorTotal || 0), 0);
    const totalGuias = lotesFiltrados.reduce((acc: number, l: any) => acc + Number(l.totalGuias || 0), 0);
    return { valor: total, guias: totalGuias, remessas: lotesFiltrados.length };
  }, [lotesFiltrados]);

  const tipoLabel = (tipo: string) => {
    switch (tipo) {
      case "consultas": return "Consultas";
      case "exames": return "Exames";
      case "internacao": return "Internação";
      default: return tipo || "-";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lock className="w-6 h-6 text-amber-600" />
              Remessas Fechadas
            </h1>
            <p className="text-muted-foreground">Remessas finalizadas prontas para exportação (XML TISS / Excel)</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap">
          <Select value={filtroConvenio?.toString() || "all"} onValueChange={(v) => setFiltroConvenio(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[220px]">
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
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total de Remessas</p>
              <p className="text-2xl font-bold">{totais.remessas}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total de Guias</p>
              <p className="text-2xl font-bold">{totais.guias}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-2xl font-bold text-primary">
                R$ {totais.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Remessas Fechadas */}
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
                  <TableHead>Guias</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Exportar</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotesFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhuma remessa fechada encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  lotesFiltrados.map((lote: any) => (
                    <TableRow key={lote.id}>
                      <TableCell className="font-mono text-sm">{lote.numeroLote}</TableCell>
                      <TableCell>{convenios?.find((c: any) => c.id === lote.convenioId)?.nome || "-"}</TableCell>
                      <TableCell>{tipoLabel(lote.tipoAtendimento || "exames")}</TableCell>
                      <TableCell>{lote.dataFaturamento || "-"}</TableCell>
                      <TableCell>{lote.competencia || "-"}</TableCell>
                      <TableCell>{lote.nf || "-"}</TableCell>
                      <TableCell>{lote.totalGuias || 0}</TableCell>
                      <TableCell className="font-semibold">
                        R$ {Number(lote.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => gerarXml.mutate({ loteId: lote.id })}
                            disabled={gerarXml.isPending}
                            title="Gerar XML TISS"
                          >
                            <FileText className="w-4 h-4 mr-1" />
                            XML
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => gerarExcel.mutate({ loteId: lote.id })}
                            disabled={gerarExcel.isPending}
                            title="Gerar Excel"
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-1" />
                            Excel
                          </Button>
                          {lote.xmlUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-purple-600"
                              onClick={() => window.open(lote.xmlUrl, "_blank")}
                              title="Baixar último XML gerado"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/faturamento/remessa/${lote.id}`)}>
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
      </div>
    </DashboardLayout>
  );
}
