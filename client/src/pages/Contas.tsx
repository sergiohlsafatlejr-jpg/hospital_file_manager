import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { trpc } from "@/lib/trpc";
import { 
  FileSearch, 
  Download, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  FileSpreadsheet,
  Eye,
  CreditCard,
  Hash,
  User,
  DollarSign,
  FileText
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

// Interface para conta agrupada
interface ContaAgrupada {
  guiaNumero: string;
  senha: string;
  carteirinha: string;
  dataConta: Date | null;
  valorTotal: number;
  pacienteNome: string;
  convenioNome: string;
  arquivoNome: string;
  arquivoId: number;
  itens: any[];
  quantidadeItens: number;
}

export default function Contas() {
  const { user } = useAuth();
  const [convenioId, setConvenioId] = useState<string>("");
  const [arquivoId, setArquivoId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
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
      page: 1,
      pageSize: 10000, // Buscar todos para agrupar
    },
    { enabled: true }
  );

  const procedimentos = procedimentosData?.items || [];

  // Agrupar procedimentos por guia (conta)
  const contasAgrupadas = useMemo(() => {
    const grupos: Record<string, ContaAgrupada> = {};
    
    procedimentos.forEach((p: any) => {
      const chave = p.guiaNumero || `sem_guia_${p.id}`;
      
      if (!grupos[chave]) {
        grupos[chave] = {
          guiaNumero: p.guiaNumero || "-",
          senha: p.senha || p.dadosExtras?.senha || "-",
          carteirinha: p.pacienteCarteirinha || "-",
          dataConta: p.dataExecucao ? new Date(p.dataExecucao) : null,
          valorTotal: 0,
          pacienteNome: p.pacienteNome || "-",
          convenioNome: p.convenioNome || "-",
          arquivoNome: p.arquivoNome || "-",
          arquivoId: p.arquivoId,
          itens: [],
          quantidadeItens: 0,
        };
      }
      
      grupos[chave].valorTotal += parseFloat(p.valorTotal || "0");
      grupos[chave].itens.push(p);
      grupos[chave].quantidadeItens++;
      
      // Usar a data mais antiga como data da conta
      if (p.dataExecucao) {
        const dataItem = new Date(p.dataExecucao);
        if (!grupos[chave].dataConta || dataItem < grupos[chave].dataConta) {
          grupos[chave].dataConta = dataItem;
        }
      }
      
      // Preencher dados que podem estar vazios
      if (p.pacienteNome && grupos[chave].pacienteNome === "-") {
        grupos[chave].pacienteNome = p.pacienteNome;
      }
      if (p.pacienteCarteirinha && grupos[chave].carteirinha === "-") {
        grupos[chave].carteirinha = p.pacienteCarteirinha;
      }
      if ((p.senha || p.dadosExtras?.senha) && grupos[chave].senha === "-") {
        grupos[chave].senha = p.senha || p.dadosExtras?.senha;
      }
    });
    
    // Converter para array e ordenar por data (mais recente primeiro)
    return Object.values(grupos).sort((a, b) => {
      if (!a.dataConta) return 1;
      if (!b.dataConta) return -1;
      return b.dataConta.getTime() - a.dataConta.getTime();
    });
  }, [procedimentos]);

  // Paginação das contas
  const totalContas = contasAgrupadas.length;
  const totalPages = Math.ceil(totalContas / pageSize);
  const contasPaginadas = contasAgrupadas.slice((page - 1) * pageSize, page * pageSize);

  // Totais
  const valorTotalGeral = contasAgrupadas.reduce((acc, c) => acc + c.valorTotal, 0);

  const handleExportCSV = () => {
    if (!contasAgrupadas.length) return;

    const headers = ["Guia", "Senha", "Carteirinha", "Paciente", "Data Conta", "Valor Total", "Qtd Itens", "Convênio", "Arquivo"];
    const rows = contasAgrupadas.map((c) => [
      c.guiaNumero,
      c.senha,
      c.carteirinha,
      c.pacienteNome,
      c.dataConta ? c.dataConta.toLocaleDateString("pt-BR") : "-",
      c.valorTotal.toFixed(2),
      c.quantidadeItens,
      c.convenioNome,
      c.arquivoNome,
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (!contasAgrupadas.length) return;

    const excelData = contasAgrupadas.map((c) => ({
      "Guia": c.guiaNumero,
      "Senha": c.senha,
      "Carteirinha": c.carteirinha,
      "Paciente": c.pacienteNome,
      "Data Conta": c.dataConta ? c.dataConta.toLocaleDateString("pt-BR") : "-",
      "Valor Total": c.valorTotal,
      "Qtd Itens": c.quantidadeItens,
      "Convênio": c.convenioNome,
      "Arquivo": c.arquivoNome,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws["!cols"] = [
      { wch: 15 },  // Guia
      { wch: 15 },  // Senha
      { wch: 20 },  // Carteirinha
      { wch: 35 },  // Paciente
      { wch: 15 },  // Data Conta
      { wch: 15 },  // Valor Total
      { wch: 10 },  // Qtd Itens
      { wch: 25 },  // Convênio
      { wch: 40 },  // Arquivo
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Contas");
    XLSX.writeFile(wb, `contas_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return date.toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const handleVerDetalhes = (conta: ContaAgrupada) => {
    setLocation(`/contas/${encodeURIComponent(conta.guiaNumero)}`);
  };

  // Determinar tipo de despesa baseado no codigoDespesa
  const getTipoDespesa = (codigoDespesa: string | null | undefined) => {
    switch (codigoDespesa) {
      case "01": return { label: "Gás", color: "bg-purple-100 text-purple-700" };
      case "02": return { label: "Medicamento", color: "bg-blue-100 text-blue-700" };
      case "03": return { label: "Material", color: "bg-green-100 text-green-700" };
      case "05": return { label: "Diária", color: "bg-orange-100 text-orange-700" };
      case "07": return { label: "Taxa", color: "bg-red-100 text-red-700" };
      default: return { label: "Procedimento", color: "bg-gray-100 text-gray-700" };
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Contas</h1>
            <p className="text-muted-foreground">
              Visualize todas as contas (guias) importadas dos arquivos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handleExportCSV} disabled={!contasAgrupadas.length}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button onClick={handleExportExcel} disabled={!contasAgrupadas.length}>
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
            <CardDescription>Filtre as contas por convênio, arquivo ou busca</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  placeholder="Guia, carteirinha ou paciente..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
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
                    setPage(1);
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
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{totalContas}</div>
              </div>
              <p className="text-xs text-muted-foreground">Total de Contas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">
                  {procedimentos.length}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Total de Itens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(valorTotalGeral)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Valor Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">
                  {new Set(contasAgrupadas.map(c => c.pacienteNome).filter(n => n !== "-")).size}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Pacientes</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Contas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Lista de Contas
            </CardTitle>
            <CardDescription>
              Clique em uma conta para ver os detalhes dos itens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : contasPaginadas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma conta encontrada
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guia</TableHead>
                        <TableHead>Senha</TableHead>
                        <TableHead>Carteirinha</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Data Conta</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-center">Itens</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contasPaginadas.map((conta, index) => (
                        <TableRow 
                          key={`${conta.guiaNumero}-${index}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleVerDetalhes(conta)}
                        >
                          <TableCell className="font-mono font-medium">
                            {conta.guiaNumero}
                          </TableCell>
                          <TableCell className="font-mono">
                            {conta.senha}
                          </TableCell>
                          <TableCell className="font-mono">
                            {conta.carteirinha}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={conta.pacienteNome}>
                            {conta.pacienteNome}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(conta.dataConta)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(conta.valorTotal)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {conta.quantidadeItens}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVerDetalhes(conta);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, totalContas)} de {totalContas} contas
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Página {page} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
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
