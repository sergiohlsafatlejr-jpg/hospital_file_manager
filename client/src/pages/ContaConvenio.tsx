import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
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
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";

// Interface para conta agrupada (Master)
// Usa chave composta (guiaNumero + numeroLote + sequencialTransacao) para identificar faturamentos únicos
interface ContaAgrupada {
  chave: string; // Chave composta para identificação única
  guiaNumero: string;
  numeroLote: string;
  sequencialTransacao: string;
  senha: string;
  carteirinha: string;
  dataConta: Date | null;
  valorTotal: number;
  pacienteNome: string;
  convenioNome: string;
  arquivoNome: string;
  arquivoId: number;
  itens: any[]; // Lista de procedimentos (Detail)
  quantidadeItens: number;
}

export default function ContaConvenio() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioId, setConvenioId] = useState<string>("");
  const [arquivoId, setArquivoId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [anoReferencia, setAnoReferencia] = useState<string>("");
  const [prestadorExecutante, setPrestadorExecutante] = useState<string>("");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const pageSize = 50;

  // Buscar convênios
  const { data: convenios } = trpc.convenios.list.useQuery({});

  // Buscar prestadores executantes únicos para o filtro
  const { data: prestadoresExecutantes } = trpc.procedimentos.listarPrestadoresExecutantes.useQuery(
    { 
      estabelecimentoId: estabelecimentoAtual?.id,
      convenioId: convenioId ? parseInt(convenioId) : undefined
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Buscar prestador vinculado ao estabelecimento atual (para filtro automático)
  const { data: prestadorVinculado } = trpc.convenios.getPrestador.useQuery(
    { 
      convenioId: convenioId ? parseInt(convenioId) : 0,
      estabelecimentoId: estabelecimentoAtual?.id || 0
    },
    { enabled: !!estabelecimentoAtual && !!convenioId }
  );

  // Determinar o código do prestador a ser usado no filtro
  // IMPORTANTE: Usar apenas o prestador selecionado manualmente pelo usuário
  const codigoPrestadorFiltro = prestadorExecutante || undefined;

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
      estabelecimentoId: estabelecimentoAtual?.id,
      search: searchTerm || undefined,
      mesReferencia: mesReferencia ? parseInt(mesReferencia) : undefined,
      anoReferencia: anoReferencia ? parseInt(anoReferencia) : undefined,
      codigoPrestadorExecutante: codigoPrestadorFiltro,
      direcaoArquivo: "enviado" as const,
      page: 1,
      pageSize: 10000,
    },
    { enabled: !!estabelecimentoAtual }
  );

  const procedimentos = procedimentosData?.items || [];

  // Agrupar procedimentos por chave composta: guiaNumero + numeroLote + sequencialTransacao
  // Cada grupo representa uma transação única de faturamento (separa Altas Administrativas)
  const contasAgrupadas = useMemo(() => {
    const grupos: Record<string, ContaAgrupada> = {};
    
    procedimentos.forEach((p: any) => {
      // Chave composta: guiaNumero + numeroLote + sequencialTransacao
      // Se lote ou sequencial forem 'null' (string), nulos ou vazios, usar ID do banco para evitar soma indevida
      const loteValido = p.numeroLote && p.numeroLote !== 'null' && p.numeroLote.trim() !== '';
      const seqValido = p.sequencialTransacao && p.sequencialTransacao !== 'null' && p.sequencialTransacao.trim() !== '';
      
      // Se não tiver lote válido, cada registro vira uma linha separada (usa ID)
      const chave = loteValido 
        ? `${p.guiaNumero || 'sem_guia'}_${p.numeroLote}_${seqValido ? p.sequencialTransacao : 'sem_seq'}`
        : p.id.toString();
      
      if (!grupos[chave]) {
        grupos[chave] = {
          chave,
          guiaNumero: p.guiaNumero || "-",
          numeroLote: p.numeroLote || "-",
          sequencialTransacao: p.sequencialTransacao || "-",
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
      
      // Acumular valores e itens APENAS dentro da mesma transação
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
  const totalItens = contasAgrupadas.reduce((acc, c) => acc + c.quantidadeItens, 0);

  // Toggle expansão de linha
  const toggleExpand = (chave: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chave)) {
        newSet.delete(chave);
      } else {
        newSet.add(chave);
      }
      return newSet;
    });
  };

  const handleExportCSV = () => {
    if (!contasAgrupadas.length) return;

    const headers = ["Guia", "Nº Lote", "Seq. Transação", "Senha", "Carteirinha", "Paciente", "Data Conta", "Valor Total", "Qtd Itens", "Convênio", "Arquivo"];
    const rows = contasAgrupadas.map((c) => [
      c.guiaNumero,
      c.numeroLote,
      c.sequencialTransacao,
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
      "Nº Lote": c.numeroLote,
      "Seq. Transação": c.sequencialTransacao,
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
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 10 },
      { wch: 25 },
      { wch: 40 },
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
    setLocation(`/contas/${encodeURIComponent(conta.guiaNumero)}?origem=conta-convenio`);
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
            <h1 className="text-3xl font-bold tracking-tight">Conta Convênio</h1>
            <p className="text-muted-foreground">
              Arquivos XML enviados para as operadoras
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
            <CardDescription>
              Filtre as contas por convênio, arquivo, prestador executante ou busca
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Mês Referência</label>
                <Select value={mesReferencia} onValueChange={(v) => { setMesReferencia(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    <SelectItem value="1">Janeiro</SelectItem>
                    <SelectItem value="2">Fevereiro</SelectItem>
                    <SelectItem value="3">Março</SelectItem>
                    <SelectItem value="4">Abril</SelectItem>
                    <SelectItem value="5">Maio</SelectItem>
                    <SelectItem value="6">Junho</SelectItem>
                    <SelectItem value="7">Julho</SelectItem>
                    <SelectItem value="8">Agosto</SelectItem>
                    <SelectItem value="9">Setembro</SelectItem>
                    <SelectItem value="10">Outubro</SelectItem>
                    <SelectItem value="11">Novembro</SelectItem>
                    <SelectItem value="12">Dezembro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ano Referência</label>
                <Select value={anoReferencia} onValueChange={(v) => { setAnoReferencia(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os anos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os anos</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioId} onValueChange={(v) => { setConvenioId(v); setArquivoId(""); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Arquivo</label>
                <Select value={arquivoId} onValueChange={(v) => { setArquivoId(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os arquivos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os arquivos</SelectItem>
                    {arquivos?.filter((a: any) => a.direcao === "enviado").map((a: any) => (
                      <SelectItem key={a.id} value={a.id.toString()}>
                        {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Prestador Executante</label>
                <Select value={prestadorExecutante} onValueChange={(v) => { setPrestadorExecutante(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os prestadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os prestadores</SelectItem>
                    {prestadoresExecutantes?.map((p: any) => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        {p.codigo}
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
                    setMesReferencia("");
                    setAnoReferencia("");
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
                  {totalItens}
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

        {/* Tabela de Contas com Master-Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Lista de Contas
            </CardTitle>
            <CardDescription>
              Clique na seta para expandir e ver os itens de cada transação
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
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Guia</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead>Seq.</TableHead>
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
                      {contasPaginadas.map((conta, index) => {
                        const isExpanded = expandedRows.has(conta.chave);
                        return (
                          <React.Fragment key={conta.chave}>
                            {/* Linha Master */}
                            <TableRow 
                              key={conta.chave}
                              className="cursor-pointer hover:bg-muted/50"
                            >
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => toggleExpand(conta.chave)}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className="font-mono font-medium">
                                <div className="flex items-center gap-2">
                                  {conta.guiaNumero}
                                  {/* Badge para indicar Alta Administrativa (múltiplas transações da mesma guia) */}
                                  {contasAgrupadas.filter(c => c.guiaNumero === conta.guiaNumero && c.guiaNumero !== '-').length > 1 && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-300">
                                      Alta Adm.
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {/* Exibir valor real do lote, mesmo que seja 'null' como string */}
                                {conta.numeroLote && conta.numeroLote !== '-' && conta.numeroLote !== 'null' ? conta.numeroLote : '-'}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {conta.sequencialTransacao && conta.sequencialTransacao !== '-' && conta.sequencialTransacao !== 'null' ? conta.sequencialTransacao : '-'}
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
                            
                            {/* Linha Detail (Expandida) */}
                            {isExpanded && (
                              <TableRow key={`${conta.chave}-detail`}>
                                <TableCell colSpan={11} className="bg-muted/30 p-0">
                                  <div className="p-4">
                                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                                      Itens da Transação ({conta.quantidadeItens} itens)
                                    </h4>
                                    <div className="rounded-md border bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Código</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead className="text-center">Qtd</TableHead>
                                            <TableHead className="text-right">Valor Unit.</TableHead>
                                            <TableHead className="text-right">Valor Total</TableHead>
                                            <TableHead>Data Exec.</TableHead>
                                            <TableHead>Médico</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {conta.itens.map((item: any, itemIndex: number) => {
                                            const tipoDespesa = getTipoDespesa(item.codigoDespesa);
                                            return (
                                              <TableRow key={item.id || itemIndex}>
                                                <TableCell className="font-mono text-xs">
                                                  {item.codigo}
                                                </TableCell>
                                                <TableCell className="max-w-[250px] truncate" title={item.descricao}>
                                                  {item.descricao || "-"}
                                                </TableCell>
                                                <TableCell>
                                                  <Badge className={`${tipoDespesa.color} text-xs`}>
                                                    {tipoDespesa.label}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                  {item.quantidade || 1}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">
                                                  {formatCurrency(parseFloat(item.valorUnitario || "0"))}
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-green-600">
                                                  {formatCurrency(parseFloat(item.valorTotal || "0"))}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-xs">
                                                  {item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString("pt-BR") : "-"}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                  {item.nomeMedico || "-"}
                                                  {item.crmMedico && <span className="text-muted-foreground ml-1">({item.crmMedico})</span>}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
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
