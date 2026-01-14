import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { FileSearch, Download, Filter, RefreshCw, ChevronLeft, ChevronRight, Calendar, User, Hash, FileSpreadsheet } from "lucide-react";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

export default function ItensImportados() {
  const { user } = useAuth();
  const [convenioId, setConvenioId] = useState<string>("");
  const [arquivoId, setArquivoId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [nomeMedico, setNomeMedico] = useState("");
  const [crmMedico, setCrmMedico] = useState("");
  const [page, setPage] = useState(1);
  const [agruparPorDia, setAgruparPorDia] = useState(false);
  const pageSize = 50;

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({});

  // Buscar arquivos do convênio selecionado
  const { data: arquivos } = trpc.arquivos.list.useQuery(
    { convenioId: convenioId ? parseInt(convenioId) : undefined },
    { enabled: true }
  );

  // Buscar procedimentos
  const { data: procedimentosData, isLoading, refetch } = trpc.procedimentos.list.useQuery(
    {
      arquivoId: arquivoId ? parseInt(arquivoId) : undefined,
      convenioId: convenioId ? parseInt(convenioId) : undefined,
      search: searchTerm || undefined,
      nomeMedico: nomeMedico || undefined,
      crmMedico: crmMedico || undefined,
      page,
      pageSize,
    },
    { enabled: true }
  );

  const procedimentos = procedimentosData?.items || [];
  const totalItems = procedimentosData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Agrupar procedimentos por data de execução
  const procedimentosAgrupados = useMemo(() => {
    if (!agruparPorDia) return null;
    
    const grupos: Record<string, typeof procedimentos> = {};
    procedimentos.forEach((p: any) => {
      const dataKey = p.dataExecucao 
        ? new Date(p.dataExecucao).toLocaleDateString("pt-BR") 
        : "Sem data";
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(p);
    });
    
    // Ordenar por data (mais recente primeiro)
    return Object.entries(grupos).sort((a, b) => {
      if (a[0] === "Sem data") return 1;
      if (b[0] === "Sem data") return -1;
      const dateA = a[0].split("/").reverse().join("-");
      const dateB = b[0].split("/").reverse().join("-");
      return dateB.localeCompare(dateA);
    });
  }, [procedimentos, agruparPorDia]);

  const handleExportCSV = () => {
    if (!procedimentos.length) return;

    const headers = ["Código", "Descrição", "Quantidade", "Valor Unitário", "Valor Total", "Data Execução", "Médico", "CRM", "Guia", "Arquivo"];
    const rows = procedimentos.map((p: any) => [
      p.codigo,
      p.descricao || "",
      p.quantidade,
      p.valorUnitario || "",
      p.valorTotal || "",
      p.dataExecucao ? new Date(p.dataExecucao).toLocaleDateString("pt-BR") : "",
      p.nomeMedico || "",
      p.crmMedico || "",
      p.guiaNumero || "",
      p.arquivoNome || "",
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `itens_importados_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (!procedimentos.length) return;

    // Preparar dados para Excel
    const excelData = procedimentos.map((p: any) => ({
      "Código": p.codigo || "",
      "Descrição": p.descricao || "",
      "Quantidade": p.quantidade || 0,
      "Valor Unitário": p.valorUnitario ? parseFloat(p.valorUnitario) : 0,
      "Valor Total": p.valorTotal ? parseFloat(p.valorTotal) : 0,
      "Data Execução": p.dataExecucao ? new Date(p.dataExecucao).toLocaleDateString("pt-BR") : "",
      "Médico": p.nomeMedico || "",
      "CRM": p.crmMedico || "",
      "Guia": p.guiaNumero || "",
      "Convênio": p.convenioNome || "",
      "Arquivo": p.arquivoNome || "",
    }));

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Definir largura das colunas
    ws["!cols"] = [
      { wch: 15 },  // Código
      { wch: 50 },  // Descrição
      { wch: 12 },  // Quantidade
      { wch: 15 },  // Valor Unitário
      { wch: 15 },  // Valor Total
      { wch: 15 },  // Data Execução
      { wch: 30 },  // Médico
      { wch: 12 },  // CRM
      { wch: 15 },  // Guia
      { wch: 20 },  // Convênio
      { wch: 40 },  // Arquivo
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, "Itens Importados");

    // Gerar arquivo e fazer download
    const fileName = `itens_importados_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR");
    } catch {
      return "-";
    }
  };

  const renderTable = (items: any[], showDateColumn = true) => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-center">Qtd</TableHead>
            <TableHead className="text-right">Valor Unit.</TableHead>
            <TableHead className="text-right">Valor Total</TableHead>
            {showDateColumn && <TableHead>Data Exec.</TableHead>}
            <TableHead>Médico</TableHead>
            <TableHead>CRM</TableHead>
            <TableHead>Guia</TableHead>
            <TableHead>Arquivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((proc: any) => (
            <TableRow 
              key={proc.id} 
              className={proc.nomeMedico ? "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/30" : ""}
            >
              <TableCell className="font-mono text-sm">
                {proc.codigo}
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={proc.descricao || "-"}>
                {proc.descricao || <span className="text-muted-foreground italic">Sem descrição</span>}
              </TableCell>
              <TableCell className="text-center">{proc.quantidade}</TableCell>
              <TableCell className="text-right">
                {proc.valorUnitario ? `R$ ${parseFloat(proc.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
              </TableCell>
              <TableCell className="text-right font-medium">
                {proc.valorTotal ? `R$ ${parseFloat(proc.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
              </TableCell>
              {showDateColumn && (
                <TableCell className="whitespace-nowrap">
                  {formatDate(proc.dataExecucao)}
                </TableCell>
              )}
              <TableCell className="max-w-[150px]" title={proc.nomeMedico || "-"}>
                {proc.nomeMedico ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="truncate font-medium text-blue-700 dark:text-blue-400">{proc.nomeMedico}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {proc.crmMedico ? (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
                    {proc.crmMedico}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {proc.guiaNumero || "-"}
              </TableCell>
              <TableCell className="max-w-[150px] truncate" title={proc.arquivoNome || "-"}>
                {proc.arquivoNome || "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Itens Importados</h1>
            <p className="text-muted-foreground">
              Visualize todos os procedimentos extraídos dos arquivos por convênio
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={!procedimentos.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={handleExportExcel} disabled={!procedimentos.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
            <CardDescription>Filtre os itens por convênio, arquivo, médico ou busca</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={(value) => {
                  setConvenioId(value === "all" ? "" : value);
                  setArquivoId("");
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Arquivo</label>
                <Select value={arquivoId} onValueChange={(value) => {
                  setArquivoId(value === "all" ? "" : value);
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os arquivos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os arquivos</SelectItem>
                    {arquivos?.map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <Input
                  placeholder="Código ou descrição..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Médico</label>
                <Input
                  placeholder="Nome do médico..."
                  value={nomeMedico}
                  onChange={(e) => {
                    setNomeMedico(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">CRM</label>
                <Input
                  placeholder="Número do CRM..."
                  value={crmMedico}
                  onChange={(e) => {
                    setCrmMedico(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Visualização</label>
                <div className="flex items-center space-x-2 h-10">
                  <Switch
                    id="agrupar-dia"
                    checked={agruparPorDia}
                    onCheckedChange={setAgruparPorDia}
                  />
                  <Label htmlFor="agrupar-dia" className="text-sm cursor-pointer">
                    Agrupar por dia
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">&nbsp;</label>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setConvenioId("");
                    setArquivoId("");
                    setSearchTerm("");
                    setNomeMedico("");
                    setCrmMedico("");
                    setPage(1);
                    setAgruparPorDia(false);
                  }}
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{totalItems}</div>
              </div>
              <p className="text-xs text-muted-foreground">Total de itens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {procedimentos.reduce((acc: number, p: any) => acc + (p.quantidade || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground">Quantidade total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                R$ {procedimentos.reduce((acc: number, p: any) => acc + parseFloat(p.valorTotal || "0"), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">Valor total (página atual)</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-500" />
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {procedimentos.filter((p: any) => p.nomeMedico).length}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Procedimentos com médico</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {new Set(procedimentos.filter((p: any) => p.nomeMedico).map((p: any) => p.nomeMedico)).size} médico(s) diferente(s)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Itens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Procedimentos Importados
              {agruparPorDia && procedimentosAgrupados && (
                <Badge variant="secondary" className="ml-2">
                  <Calendar className="h-3 w-3 mr-1" />
                  {procedimentosAgrupados.length} dia(s)
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span>{totalItems} item(ns) encontrado(s)</span>
              <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Linhas destacadas = procedimentos com médico associado
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : procedimentos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileSearch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum item encontrado</p>
                <p className="text-sm">Importe arquivos para ver os procedimentos aqui</p>
              </div>
            ) : agruparPorDia && procedimentosAgrupados ? (
              <div className="space-y-6">
                {procedimentosAgrupados.map(([data, items]) => (
                  <div key={data} className="space-y-3">
                    <div className="flex items-center gap-3 sticky top-0 bg-background py-2 z-10">
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        <Calendar className="h-4 w-4 mr-2" />
                        {data}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {items.length} procedimento(s) • 
                        R$ {items.reduce((acc: number, p: any) => acc + parseFloat(p.valorTotal || "0"), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {renderTable(items, false)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                {renderTable(procedimentos)}

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Página {page} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
