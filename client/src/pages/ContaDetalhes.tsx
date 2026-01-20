import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  ArrowLeft, 
  Download, 
  FileSpreadsheet,
  FileText,
  User,
  CreditCard,
  Hash,
  Calendar,
  DollarSign,
  Pill,
  Package,
  BedDouble,
  Receipt,
  Flame,
  Stethoscope
} from "lucide-react";
import { useParams, useLocation } from "wouter";
import * as XLSX from "xlsx";

// Mapeamento de código de despesa para nome e ícone
const TIPOS_DESPESA: Record<string, { label: string; color: string; icon: any }> = {
  "01": { label: "Gás", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", icon: Flame },
  "02": { label: "Medicamento", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: Pill },
  "03": { label: "Material", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: Package },
  "05": { label: "Diária", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", icon: BedDouble },
  "07": { label: "Taxa", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: Receipt },
  "00": { label: "Procedimento", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: Stethoscope },
};

const getTipoDespesa = (codigoDespesa: string | null | undefined) => {
  if (!codigoDespesa) return TIPOS_DESPESA["00"];
  return TIPOS_DESPESA[codigoDespesa] || TIPOS_DESPESA["00"];
};

export default function ContaDetalhes() {
  const { user } = useAuth();
  const params = useParams<{ guiaNumero: string }>();
  const [, setLocation] = useLocation();
  const guiaNumero = decodeURIComponent(params.guiaNumero || "");

  // Buscar procedimentos da guia
  const { data: procedimentosData, isLoading } = trpc.procedimentos.list.useQuery(
    {
      search: guiaNumero,
      page: 1,
      pageSize: 1000,
    },
    { enabled: !!guiaNumero }
  );

  const procedimentos = procedimentosData?.items || [];
  
  // Filtrar apenas os itens desta guia
  const itensGuia = procedimentos.filter((p: any) => p.guiaNumero === guiaNumero);

  // Calcular totais
  const valorTotal = itensGuia.reduce((acc: number, p: any) => acc + parseFloat(p.valorTotal || "0"), 0);
  
  // Agrupar por tipo de despesa
  const totaisPorTipo = itensGuia.reduce((acc: Record<string, { quantidade: number; valor: number }>, p: any) => {
    const tipo = getTipoDespesa(p.codigoDespesa);
    if (!acc[tipo.label]) {
      acc[tipo.label] = { quantidade: 0, valor: 0 };
    }
    acc[tipo.label].quantidade += 1;
    acc[tipo.label].valor += parseFloat(p.valorTotal || "0");
    return acc;
  }, {});

  // Informações da conta (pegar do primeiro item)
  const primeiroItem = itensGuia[0];
  const infoConta = {
    guiaNumero: guiaNumero,
    senha: (primeiroItem as any)?.senha || (primeiroItem as any)?.dadosExtras?.senha || "-",
    carteirinha: primeiroItem?.pacienteCarteirinha || "-",
    pacienteNome: primeiroItem?.pacienteNome || "-",
    dataConta: primeiroItem?.dataExecucao ? new Date(primeiroItem.dataExecucao) : null,
    convenioNome: primeiroItem?.convenioNome || "-",
    arquivoNome: primeiroItem?.arquivoNome || "-",
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return date.toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const handleExportExcel = () => {
    if (!itensGuia.length) return;

    const excelData = itensGuia.map((item: any) => ({
      "Tipo": getTipoDespesa(item.codigoDespesa).label,
      "Código": item.codigo || "",
      "Descrição": item.descricao || "",
      "Quantidade": item.quantidade || 1,
      "Valor Unitário": item.valorUnitario ? parseFloat(item.valorUnitario) : 0,
      "Valor Total": item.valorTotal ? parseFloat(item.valorTotal) : 0,
      "Data Execução": item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString("pt-BR") : "",
      "Médico": item.nomeMedico || "",
      "CRM": item.crmMedico || "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws["!cols"] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 50 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Conta ${guiaNumero}`);
    XLSX.writeFile(wb, `conta_${guiaNumero}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!itensGuia.length) return;

    const headers = ["Tipo", "Código", "Descrição", "Quantidade", "Valor Unitário", "Valor Total", "Data Execução", "Médico", "CRM"];
    const rows = itensGuia.map((item: any) => [
      getTipoDespesa(item.codigoDespesa).label,
      item.codigo || "",
      item.descricao || "",
      item.quantidade || 1,
      item.valorUnitario || "",
      item.valorTotal || "",
      item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString("pt-BR") : "",
      item.nomeMedico || "",
      item.crmMedico || "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conta_${guiaNumero}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/contas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Detalhes da Conta</h1>
              <p className="text-muted-foreground">
                Guia: <span className="font-mono font-medium">{guiaNumero}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={!itensGuia.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={handleExportExcel} disabled={!itensGuia.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : itensGuia.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum item encontrado para esta guia</p>
              <Button variant="outline" className="mt-4" onClick={() => setLocation("/contas")}>
                Voltar para Contas
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Informações da Conta */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações da Conta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      Guia
                    </div>
                    <p className="font-mono font-medium text-lg">{infoConta.guiaNumero}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      Senha
                    </div>
                    <p className="font-mono">{infoConta.senha}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CreditCard className="h-3 w-3" />
                      Carteirinha
                    </div>
                    <p className="font-mono">{infoConta.carteirinha}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      Paciente
                    </div>
                    <p className="font-medium">{infoConta.pacienteNome}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Data da Conta
                    </div>
                    <p>{formatDate(infoConta.dataConta)}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      Valor Total
                    </div>
                    <p className="font-bold text-green-600 text-lg">{formatCurrency(valorTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumo por Tipo de Despesa */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Object.entries(totaisPorTipo).map(([tipo, dados]) => {
                const tipoInfo = Object.values(TIPOS_DESPESA).find(t => t.label === tipo) || TIPOS_DESPESA["00"];
                const Icon = tipoInfo.icon;
                return (
                  <Card key={tipo}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-2 rounded-lg ${tipoInfo.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium text-sm">{tipo}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-2xl font-bold">{dados.quantidade}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(dados.valor)}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <CardTitle>Itens da Conta</CardTitle>
                <CardDescription>
                  {itensGuia.length} {itensGuia.length === 1 ? "item" : "itens"} encontrados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Tipo</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Valor Unit.</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead>Data Exec.</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead>CRM</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensGuia.map((item: any, idx: number) => {
                        const tipo = getTipoDespesa(item.codigoDespesa);
                        const Icon = tipo.icon;
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Badge className={`${tipo.color} flex items-center gap-1 w-fit`}>
                                <Icon className="h-3 w-3" />
                                {tipo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.codigo}
                            </TableCell>
                            <TableCell className="max-w-[300px]" title={item.descricao || "-"}>
                              <span className="line-clamp-2">{item.descricao || "-"}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.quantidade || 1}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.valorUnitario ? formatCurrency(parseFloat(item.valorUnitario)) : "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {item.valorTotal ? formatCurrency(parseFloat(item.valorTotal)) : "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString("pt-BR") : "-"}
                            </TableCell>
                            <TableCell className="max-w-[150px]" title={item.nomeMedico || "-"}>
                              {item.nomeMedico ? (
                                <span className="truncate block">{item.nomeMedico}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.crmMedico || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totalizador */}
                <div className="mt-4 flex justify-end">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between gap-8">
                      <span className="text-muted-foreground">Total de Itens:</span>
                      <span className="font-medium">{itensGuia.length}</span>
                    </div>
                    <div className="flex justify-between gap-8 border-t pt-2">
                      <span className="font-medium">Valor Total:</span>
                      <span className="font-bold text-green-600 text-lg">{formatCurrency(valorTotal)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
