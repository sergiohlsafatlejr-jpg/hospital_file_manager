import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { trpc } from "@/lib/trpc";
import { formatWarleineItemCivilDate } from "@shared/warleineItemPresentation";
import {
  AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Database, DollarSign, FileText, Loader2, Package, Receipt, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

const formatCurrency = (value: unknown) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(Number(value || 0));

function StatusBadge({ status }: { status: string }) {
  if (status === "conforme") return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="mr-1 h-3 w-3" />Conforme</Badge>;
  if (status === "divergente") return <Badge className="bg-red-100 text-red-800 border-red-200"><AlertTriangle className="mr-1 h-3 w-3" />Divergente</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critico: "bg-red-100 text-red-800 border-red-200",
    alerta: "bg-orange-100 text-orange-800 border-orange-200",
    aviso: "bg-yellow-100 text-yellow-800 border-yellow-200",
    info: "bg-blue-100 text-blue-800 border-blue-200",
  };
  return <Badge variant="outline" className={colors[severity] || ""}>{severity || "info"}</Badge>;
}

export default function ContaConvenioWarleineDetalhes() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const { estabelecimentoAtual } = useEstabelecimento();
  const numeroConta = params.get("numeroConta") || "";
  const competencia = params.get("competencia") || "";
  const convenioChave = params.get("convenioChave") || "";
  const estabelecimentoId = Number(params.get("estabelecimentoId") || estabelecimentoAtual?.id || 0);
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const detail = trpc.warleineFaturamento.detalharConta.useQuery(
    { estabelecimentoId, competencia, numeroConta, convenioChave, page, pageSize },
    { enabled: !!estabelecimentoId && !!competencia && !!numeroConta && !!convenioChave },
  );
  const compare = trpc.warleineFaturamento.compararComPadroes.useMutation({
    onSuccess: (result) => {
      toast[result.statusGeral === "conforme" ? "success" : "warning"](
        result.statusGeral === "conforme"
          ? `Conta conforme: ${result.totalItensAnalisados} itens analisados.`
          : `${result.totalDivergencias} divergência(s) encontrada(s).`,
      );
      detail.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const data = detail.data;
  const items = data?.items || [];
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / pageSize));
  const analysis = data?.analysis;
  const canCompare = !!estabelecimentoId && !!competencia && !!numeroConta && !!convenioChave;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" onClick={() => setLocation("/conta-convenio?fonte=WARLEINE")} aria-label="Voltar para Conta Convênio">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Conta Convênio</h1>
                <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200"><Database className="mr-1 h-3 w-3" />Warleine</Badge>
                <StatusBadge status={analysis?.statusAnalise || "pendente"} />
              </div>
              <p className="text-muted-foreground">Conta <span className="font-mono">{numeroConta}</span> · Competência {competencia || "—"}</p>
            </div>
          </div>
          <Button onClick={() => compare.mutate({ estabelecimentoId, competencia, numeroConta, convenioChave })} disabled={compare.isPending || !canCompare}>
            {compare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
            Analisar com padrões
          </Button>
        </div>

        {detail.isLoading ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-28" />)}</div> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Itens faturados</p><p className="text-2xl font-bold">{Number(analysis?.totalItensAnalisados || data?.total || 0).toLocaleString("pt-BR")}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Faturado da conta</p><p className="text-2xl font-bold text-green-600">{formatCurrency(data?.resumoConta?.valorFaturado)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Divergências</p><p className="text-2xl font-bold text-red-600">{analysis?.totalDivergencias || 0}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Score de risco</p><p className="text-2xl font-bold text-amber-600">{analysis?.scoreRisco || 0}</p></CardContent></Card>
            </div>

            <Tabs defaultValue="itens" className="space-y-4">
              <TabsList><TabsTrigger value="itens">Itens faturados</TabsTrigger><TabsTrigger value="regras">Motor de regras</TabsTrigger></TabsList>
              <TabsContent value="itens">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Itens da conta</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto"><Table>
                      <TableHeader><TableRow><TableHead>Data do item</TableHead><TableHead>Código TUSS</TableHead><TableHead>Código interno</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo de item (codgrufi)</TableHead><TableHead>Tipo de procedimento</TableHead><TableHead>Recebimento</TableHead><TableHead>Setor</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Unitário</TableHead><TableHead className="text-right">Faturado</TableHead><TableHead>Análise</TableHead></TableRow></TableHeader>
                      <TableBody>{items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatWarleineItemCivilDate(item.dataItem)}
                            {!item.dataItem && item.dataOrigem && <span className="block text-xs text-muted-foreground" title={item.dataOrigemRotulo}>Origem/abertura: {formatWarleineItemCivilDate(item.dataOrigem)}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.codigoTuss || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{item.codigoItemInterno || "—"}</TableCell>
                          <TableCell className="max-w-[360px] truncate" title={item.descricaoItem || ""}>{item.descricaoItem || "—"}</TableCell>
                          <TableCell><Badge variant="outline">{item.tipoItemCodigo || "—"}</Badge></TableCell>
                          <TableCell><Badge variant="outline">{item.tipoItem || "—"}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap"><Badge variant="outline" title={`receber: ${item.modalidadeRecebimento || "não informado"}`}>{item.modalidadeRecebimentoRotulo || "Não informado"}</Badge></TableCell>
                          <TableCell>{item.setor || "—"}</TableCell>
                          <TableCell className="text-right">{item.quantidade || "0"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valorUnitario)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.valorFaturado)}</TableCell>
                          <TableCell>{item.divergencias?.length ? <Badge className="bg-red-100 text-red-800 border-red-200">{item.divergencias.length} ocorrência(s)</Badge> : <span className="text-xs text-muted-foreground">{analysis ? "Sem ocorrência" : "Não analisado"}</span>}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table></div>
                    {totalPages > 1 && <div className="flex items-center justify-between p-4 border-t"><span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button></div></div>}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="regras">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Resultado do motor de regras</CardTitle></CardHeader>
                  <CardContent>
                    {!analysis ? <div className="py-10 text-center text-muted-foreground"><FileText className="mx-auto mb-3 h-10 w-10" />Esta conta ainda não foi analisada. Use “Analisar com padrões” para aplicar as mesmas regras da Conta Convênio.</div> : analysis.divergencias?.length ? <div className="space-y-3">{analysis.divergencias.map((div: any, index: number) => <div key={`${div.codigoItem || "sem-codigo"}-${index}`} className="flex flex-col gap-2 rounded-lg border p-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={div.severidade} /><span className="font-medium">{div.tipo}</span>{div.codigoItem && <span className="font-mono text-xs text-muted-foreground">{div.codigoItem}</span>}</div><p className="mt-2 text-sm">{div.mensagem}</p></div></div>)}</div> : <div className="py-10 text-center text-green-700"><CheckCircle2 className="mx-auto mb-3 h-10 w-10" />Nenhuma divergência encontrada para os padrões disponíveis.</div>}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
