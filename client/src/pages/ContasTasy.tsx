import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { 
  FileSearch, 
  Download, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  FileSpreadsheet,
  Database,
  DollarSign,
  FileText,
  User,
  Hash,
  Stethoscope,
  Package,
  Eye,
  X
} from "lucide-react";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// Interface para item do Tasy
interface ItemTasy {
  id: number;
  atendimento: string;
  nrInternoConta: string | null;
  guia: string | null;
  convenio: string | null;
  paciente: string | null;
  dataFaturado: Date | string | null;
  dataConta: Date | string | null;
  codigo: string | null;
  codigoConvenio: string | null;
  descricao: string | null;
  quantidade: string | null;
  unidade: string | null;
  valorUnitario: string | null;
  valorTotal: string | null;
  setor: string | null;
  protocolo: string | null;
  statusProtocolo: string | null;
  tipo: 'MATERIAL' | 'HONORARIO';
  medico: string | null;
  funcaoMedico: string | null;
  crm: string | null;
  valorMedico: string | null;
}

// Interface para conta agrupada do Tasy
interface ContaTasy {
  atendimento: string;
  nrInternoConta: string;
  guia: string;
  convenio: string;
  paciente: string;
  dataFaturado: Date | null;
  valorTotal: number;
  setor: string;
  protocolo: string;
  statusProtocolo: string;
  quantidadeItens: number;
  itens: ItemTasy[];
}

export default function ContasTasy() {
  const { user } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();
  const [convenioFiltro, setConvenioFiltro] = useState<string>("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Filtro por mês/ano
  const currentDate = new Date();
  const [mesSelecionado, setMesSelecionado] = useState<number>(currentDate.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState<number>(currentDate.getFullYear());
  
  // Calcular data início e fim baseado no mês/ano selecionado
  const dataInicio = useMemo(() => {
    return `${anoSelecionado}-${String(mesSelecionado).padStart(2, '0')}-01`;
  }, [mesSelecionado, anoSelecionado]);
  
  const dataFim = useMemo(() => {
    const ultimoDia = new Date(anoSelecionado, mesSelecionado, 0).getDate();
    return `${anoSelecionado}-${String(mesSelecionado).padStart(2, '0')}-${ultimoDia}`;
  }, [mesSelecionado, anoSelecionado]);
  
  // Lista de meses
  const meses = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' },
  ];
  
  // Lista de anos (últimos 5 anos)
  const anos = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => anoAtual - i);
  }, []);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  
  // Estado para o modal de detalhes
  const [contaSelecionada, setContaSelecionada] = useState<ContaTasy | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  // Buscar dados do Tasy
  const { data: dadosTasy, isLoading, refetch } = trpc.importacaoTasy.dados.useQuery(
    {
      estabelecimentoId: estabelecimentoAtual?.id || 0,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      convenio: convenioFiltro || undefined,
      tipo: tipoFiltro !== 'all' ? tipoFiltro as 'MATERIAL' | 'HONORARIO' : undefined,
      limite: 10000,
    },
    { enabled: !!estabelecimentoAtual }
  );

  // Buscar estatísticas
  const { data: estatisticas } = trpc.importacaoTasy.estatisticas.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual }
  );

  // Buscar dados por convênio
  const { data: dadosPorConvenio } = trpc.importacaoTasy.porConvenio.useQuery(
    { estabelecimentoId: estabelecimentoAtual?.id || 0 },
    { enabled: !!estabelecimentoAtual }
  );

  // Agrupar dados por atendimento
  const contasAgrupadas = useMemo(() => {
    if (!dadosTasy) return [];

    const grupos: Record<string, ContaTasy> = {};
    
    for (const item of dadosTasy) {
      const chave = item.atendimento || `sem_atend_${item.id}`;
      
      if (!grupos[chave]) {
        grupos[chave] = {
          atendimento: item.atendimento || '-',
          nrInternoConta: item.nrInternoConta || '-',
          guia: item.guia || '-',
          convenio: item.convenio || '-',
          paciente: item.paciente || '-',
          dataFaturado: item.dataFaturado ? new Date(item.dataFaturado) : null,
          valorTotal: 0,
          setor: item.setor || '-',
          protocolo: item.protocolo || '-',
          statusProtocolo: item.statusProtocolo || '-',
          quantidadeItens: 0,
          itens: [],
        };
      }
      
      grupos[chave].valorTotal += parseFloat(item.valorTotal || '0');
      grupos[chave].itens.push(item as ItemTasy);
      grupos[chave].quantidadeItens++;
      
      // Usar a data mais recente
      if (item.dataFaturado) {
        const dataItem = new Date(item.dataFaturado);
        if (!grupos[chave].dataFaturado || dataItem > grupos[chave].dataFaturado) {
          grupos[chave].dataFaturado = dataItem;
        }
      }
    }
    
    // Converter para array e ordenar por data (mais recente primeiro)
    return Object.values(grupos).sort((a, b) => {
      if (!a.dataFaturado) return 1;
      if (!b.dataFaturado) return -1;
      return b.dataFaturado.getTime() - a.dataFaturado.getTime();
    });
  }, [dadosTasy]);

  // Filtrar por busca
  const contasFiltradas = useMemo(() => {
    if (!searchTerm) return contasAgrupadas;
    
    const termo = searchTerm.toLowerCase();
    return contasAgrupadas.filter(c => 
      c.atendimento.toLowerCase().includes(termo) ||
      c.guia.toLowerCase().includes(termo) ||
      c.paciente.toLowerCase().includes(termo) ||
      c.convenio.toLowerCase().includes(termo)
    );
  }, [contasAgrupadas, searchTerm]);

  // Paginação
  const totalContas = contasFiltradas.length;
  const totalPages = Math.ceil(totalContas / pageSize);
  const contasPaginadas = contasFiltradas.slice((page - 1) * pageSize, page * pageSize);

  // Totais
  const valorTotalGeral = contasFiltradas.reduce((acc, c) => acc + c.valorTotal, 0);
  const totalItens = dadosTasy?.length || 0;

  // Função para abrir modal de detalhes
  const abrirDetalhes = (conta: ContaTasy) => {
    setContaSelecionada(conta);
    setModalAberto(true);
  };

  // Função para fechar modal
  const fecharModal = () => {
    setModalAberto(false);
    setContaSelecionada(null);
  };

  const handleExportExcel = () => {
    if (!dadosTasy?.length) return;

    const excelData = dadosTasy.map((item: any) => ({
      "Atendimento": item.atendimento,
      "Nr Interno Conta": item.nrInternoConta,
      "Guia": item.guia,
      "Convênio": item.convenio,
      "Paciente": item.paciente,
      "Data Faturado": item.dataFaturado ? new Date(item.dataFaturado).toLocaleDateString("pt-BR") : "-",
      "Data Conta": item.dataConta ? new Date(item.dataConta).toLocaleDateString("pt-BR") : "-",
      "Código": item.codigo,
      "Código Convênio": item.codigoConvenio,
      "Descrição": item.descricao,
      "Quantidade": item.quantidade,
      "Valor Unitário": parseFloat(item.valorUnitario || '0'),
      "Valor Total": parseFloat(item.valorTotal || '0'),
      "Setor": item.setor,
      "Protocolo": item.protocolo,
      "Status Protocolo": item.statusProtocolo,
      "Tipo": item.tipo,
      "Médico": item.medico,
      "CRM": item.crm,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws["!cols"] = [
      { wch: 15 },  // Atendimento
      { wch: 15 },  // Nr Interno Conta
      { wch: 15 },  // Guia
      { wch: 25 },  // Convênio
      { wch: 30 },  // Paciente
      { wch: 12 },  // Data Faturado
      { wch: 12 },  // Data Conta
      { wch: 15 },  // Código
      { wch: 15 },  // Código Convênio
      { wch: 40 },  // Descrição
      { wch: 10 },  // Quantidade
      { wch: 12 },  // Valor Unitário
      { wch: 12 },  // Valor Total
      { wch: 20 },  // Setor
      { wch: 15 },  // Protocolo
      { wch: 15 },  // Status Protocolo
      { wch: 12 },  // Tipo
      { wch: 25 },  // Médico
      { wch: 12 },  // CRM
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Dados Tasy");
    XLSX.writeFile(wb, `dados_tasy_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // Exportar itens da conta selecionada
  const handleExportContaExcel = () => {
    if (!contaSelecionada?.itens?.length) return;

    const excelData = contaSelecionada.itens.map((item) => ({
      "Código": item.codigo || '-',
      "Código Convênio": item.codigoConvenio || '-',
      "Descrição": item.descricao || '-',
      "Tipo": item.tipo,
      "Quantidade": item.quantidade || 1,
      "Unidade": item.unidade || '-',
      "Valor Unitário": parseFloat(item.valorUnitario || '0'),
      "Valor Total": parseFloat(item.valorTotal || '0'),
      "Médico": item.medico || '-',
      "CRM": item.crm || '-',
      "Função": item.funcaoMedico || '-',
      "Setor": item.setor || '-',
      "Data Conta": item.dataConta ? new Date(item.dataConta).toLocaleDateString("pt-BR") : "-",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws["!cols"] = [
      { wch: 15 },  // Código
      { wch: 15 },  // Código Convênio
      { wch: 40 },  // Descrição
      { wch: 12 },  // Tipo
      { wch: 10 },  // Quantidade
      { wch: 10 },  // Unidade
      { wch: 12 },  // Valor Unitário
      { wch: 12 },  // Valor Total
      { wch: 25 },  // Médico
      { wch: 12 },  // CRM
      { wch: 15 },  // Função
      { wch: 20 },  // Setor
      { wch: 12 },  // Data Conta
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Itens da Conta");
    XLSX.writeFile(wb, `conta_${contaSelecionada.atendimento}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Lista de convênios únicos
  const conveniosUnicos = useMemo(() => {
    if (!dadosPorConvenio) return [];
    return dadosPorConvenio.map((c: any) => c.convenio).filter(Boolean);
  }, [dadosPorConvenio]);

  // Calcular totais dos itens da conta selecionada
  const totaisContaSelecionada = useMemo(() => {
    if (!contaSelecionada) return { materiais: 0, honorarios: 0, valorMateriais: 0, valorHonorarios: 0 };
    
    let materiais = 0;
    let honorarios = 0;
    let valorMateriais = 0;
    let valorHonorarios = 0;
    
    for (const item of contaSelecionada.itens) {
      if (item.tipo === 'MATERIAL') {
        materiais++;
        valorMateriais += parseFloat(item.valorTotal || '0');
      } else {
        honorarios++;
        valorHonorarios += parseFloat(item.valorTotal || '0');
      }
    }
    
    return { materiais, honorarios, valorMateriais, valorHonorarios };
  }, [contaSelecionada]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Database className="h-8 w-8" />
              Contas Tasy
            </h1>
            <p className="text-muted-foreground">
              Visualize todas as contas importadas do sistema Tasy
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={handleExportExcel} disabled={!dadosTasy?.length}>
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
            <CardDescription>Filtre os dados do Tasy por período, convênio ou tipo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Mês</label>
                <Select value={String(mesSelecionado)} onValueChange={(value) => {
                  setMesSelecionado(Number(value));
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map((mes) => (
                      <SelectItem key={mes.value} value={String(mes.value)}>
                        {mes.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ano</label>
                <Select value={String(anoSelecionado)} onValueChange={(value) => {
                  setAnoSelecionado(Number(value));
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((ano) => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio</label>
                <Select value={convenioFiltro} onValueChange={(value) => {
                  setConvenioFiltro(value === "all" ? "" : value);
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os convênios</SelectItem>
                    {conveniosUnicos.map((conv: string) => (
                      <SelectItem key={conv} value={conv}>
                        {conv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={tipoFiltro} onValueChange={(value) => {
                  setTipoFiltro(value);
                  setPage(1);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="MATERIAL">Materiais</SelectItem>
                    <SelectItem value="HONORARIO">Honorários</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <Input
                  placeholder="Atendimento, guia, paciente..."
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
                    setConvenioFiltro("");
                    setTipoFiltro("all");
                    setSearchTerm("");
                    setMesSelecionado(currentDate.getMonth() + 1);
                    setAnoSelecionado(currentDate.getFullYear());
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <div className="text-2xl font-bold">{totalItens}</div>
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
                <Package className="h-4 w-4 text-blue-500" />
                <div className="text-2xl font-bold text-blue-600">
                  {estatisticas?.totalMateriais || 0}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Materiais</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-purple-500" />
                <div className="text-2xl font-bold text-purple-600">
                  {estatisticas?.totalHonorarios || 0}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Honorários</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs para visualização */}
        <Tabs defaultValue="agrupado" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agrupado">Por Atendimento</TabsTrigger>
            <TabsTrigger value="detalhado">Detalhado</TabsTrigger>
            <TabsTrigger value="convenio">Por Convênio</TabsTrigger>
          </TabsList>

          {/* Visualização Agrupada por Atendimento */}
          <TabsContent value="agrupado">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Contas Agrupadas por Atendimento
                </CardTitle>
                <CardDescription>
                  Clique no botão de visualização para ver os detalhes dos itens de cada conta
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : contasPaginadas.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma conta encontrada. Importe dados do Tasy primeiro.
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">Ações</TableHead>
                            <TableHead>Atendimento</TableHead>
                            <TableHead>Nr Conta</TableHead>
                            <TableHead>Guia</TableHead>
                            <TableHead>Paciente</TableHead>
                            <TableHead>Convênio</TableHead>
                            <TableHead>Data Faturado</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead>Setor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contasPaginadas.map((conta, index) => (
                            <TableRow key={`${conta.atendimento}-${index}`} className="hover:bg-muted/50">
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => abrirDetalhes(conta)}
                                  title="Ver detalhes dos itens"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                              <TableCell className="font-mono font-medium">
                                {conta.atendimento}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {conta.nrInternoConta}
                              </TableCell>
                              <TableCell className="font-mono">
                                {conta.guia}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate" title={conta.paciente}>
                                {conta.paciente}
                              </TableCell>
                              <TableCell className="max-w-[150px] truncate" title={conta.convenio}>
                                {conta.convenio}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(conta.dataFaturado)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                {formatCurrency(conta.valorTotal)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary">
                                  {conta.quantidadeItens}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[150px] truncate" title={conta.setor}>
                                {conta.setor}
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
          </TabsContent>

          {/* Visualização Detalhada */}
          <TabsContent value="detalhado">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Itens Detalhados
                </CardTitle>
                <CardDescription>
                  Visualização item a item dos dados importados do Tasy
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !dadosTasy?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum dado encontrado
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Atendimento</TableHead>
                          <TableHead>Guia</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Valor Unit.</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                          <TableHead>Médico</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dadosTasy.slice(0, 100).map((item: any, index: number) => (
                          <TableRow key={`${item.id}-${index}`}>
                            <TableCell className="font-mono text-xs">
                              {item.atendimento}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.guia || '-'}
                            </TableCell>
                            <TableCell className="font-mono">
                              {item.codigo || '-'}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={item.descricao}>
                              {item.descricao || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.tipo === 'MATERIAL' ? 'default' : 'secondary'}>
                                {item.tipo === 'MATERIAL' ? 'Mat' : 'Hon'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {item.quantidade || 1}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(parseFloat(item.valorUnitario || '0'))}
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              {formatCurrency(parseFloat(item.valorTotal || '0'))}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate" title={item.medico}>
                              {item.medico || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {dadosTasy && dadosTasy.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando os primeiros 100 itens. Exporte para Excel para ver todos os {dadosTasy.length} itens.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visualização por Convênio */}
          <TabsContent value="convenio">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Resumo por Convênio
                </CardTitle>
                <CardDescription>
                  Totais agrupados por convênio
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!dadosPorConvenio?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum dado encontrado
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Convênio</TableHead>
                          <TableHead className="text-right">Total Itens</TableHead>
                          <TableHead className="text-right">Materiais</TableHead>
                          <TableHead className="text-right">Honorários</TableHead>
                          <TableHead className="text-right">Valor Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dadosPorConvenio.map((conv: any, index: number) => (
                          <TableRow key={`${conv.convenio}-${index}`}>
                            <TableCell className="font-medium">
                              {conv.convenio || 'Não informado'}
                            </TableCell>
                            <TableCell className="text-right">
                              {conv.totalItens}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              {conv.totalMateriais}
                            </TableCell>
                            <TableCell className="text-right text-purple-600">
                              {conv.totalHonorarios}
                            </TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              {formatCurrency(parseFloat(conv.valorTotal || '0'))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Detalhes da Conta */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="w-[98vw] max-w-[98vw] h-[98vh] max-h-[98vh] overflow-hidden flex flex-col p-0">
            {/* Header fixo do modal */}
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileSearch className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <span>Detalhes da Conta</span>
                    <span className="ml-2 text-muted-foreground font-normal">|</span>
                    <span className="ml-2 font-mono text-primary">Atendimento {contaSelecionada?.atendimento}</span>
                  </div>
                </DialogTitle>
                <DialogDescription className="text-base mt-1">
                  Visualize todos os itens (materiais e honorários) desta conta hospitalar
                </DialogDescription>
              </DialogHeader>
            </div>
            
            {contaSelecionada && (
              <div className="flex-1 overflow-auto px-6 py-4">
                {/* Informações da Conta - Layout melhorado */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6 p-6 bg-gradient-to-r from-muted/50 to-muted/30 rounded-xl border">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Paciente
                    </p>
                    <p className="text-lg font-semibold" title={contaSelecionada.paciente}>
                      {contaSelecionada.paciente}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Convênio
                    </p>
                    <p className="text-lg font-semibold" title={contaSelecionada.convenio}>
                      {contaSelecionada.convenio}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Guia
                    </p>
                    <p className="text-lg font-mono font-semibold">{contaSelecionada.guia}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Nr Interno Conta
                    </p>
                    <p className="text-lg font-mono font-semibold">{contaSelecionada.nrInternoConta}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Data Faturado</p>
                    <p className="text-lg font-semibold">{formatDate(contaSelecionada.dataFaturado)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Setor</p>
                    <p className="text-lg font-semibold" title={contaSelecionada.setor}>{contaSelecionada.setor}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Protocolo</p>
                    <p className="text-lg font-mono font-semibold">{contaSelecionada.protocolo}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <p className="text-lg font-semibold">{contaSelecionada.statusProtocolo}</p>
                  </div>
                </div>

                {/* Resumo de Valores - Cards maiores */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                  <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2">
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-4xl font-bold">{contaSelecionada.quantidadeItens}</div>
                      <p className="text-sm text-muted-foreground mt-2">Total de Itens</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-4xl font-bold text-blue-600">{totaisContaSelecionada.materiais}</div>
                      <p className="text-sm text-blue-600/70 mt-2">Materiais</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-2 border-purple-200 dark:border-purple-800">
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-4xl font-bold text-purple-600">{totaisContaSelecionada.honorarios}</div>
                      <p className="text-sm text-purple-600/70 mt-2">Honorários</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-2xl font-bold text-blue-600">{formatCurrency(totaisContaSelecionada.valorMateriais)}</div>
                      <p className="text-sm text-blue-600/70 mt-2">Valor Materiais</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-2 border-purple-200 dark:border-purple-800">
                    <CardContent className="pt-6 pb-6 text-center">
                      <div className="text-2xl font-bold text-purple-600">{formatCurrency(totaisContaSelecionada.valorHonorarios)}</div>
                      <p className="text-sm text-purple-600/70 mt-2">Valor Honorários</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Valor Total - Destaque maior */}
                <div className="flex items-center justify-between mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-xl border-2 border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                      <DollarSign className="h-8 w-8 text-green-600" />
                    </div>
                    <span className="text-xl font-semibold">Valor Total da Conta</span>
                  </div>
                  <span className="text-4xl font-bold text-green-600">
                    {formatCurrency(contaSelecionada.valorTotal)}
                  </span>
                </div>

                {/* Botão de Exportar */}
                <div className="flex justify-end mb-4">
                  <Button onClick={handleExportContaExcel} variant="outline" size="default" className="gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Exportar Itens para Excel
                  </Button>
                </div>

                {/* Título da Tabela */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Itens da Conta ({contaSelecionada.quantidadeItens} itens)
                  </h3>
                </div>

                {/* Tabela de Itens - Melhorada */}
                <div className="rounded-xl border-2 overflow-hidden">
                  <div className="max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-bold text-base py-4">Código</TableHead>
                          <TableHead className="font-bold text-base py-4">Cód. Convênio</TableHead>
                          <TableHead className="font-bold text-base py-4 min-w-[350px]">Descrição</TableHead>
                          <TableHead className="font-bold text-base py-4">Tipo</TableHead>
                          <TableHead className="font-bold text-base py-4 text-right">Qtd</TableHead>
                          <TableHead className="font-bold text-base py-4">Unid.</TableHead>
                          <TableHead className="font-bold text-base py-4 text-right">Valor Unit.</TableHead>
                          <TableHead className="font-bold text-base py-4 text-right">Valor Total</TableHead>
                          <TableHead className="font-bold text-base py-4 min-w-[200px]">Médico</TableHead>
                          <TableHead className="font-bold text-base py-4">CRM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contaSelecionada.itens.map((item, index) => (
                          <TableRow key={`${item.id}-${index}`} className="hover:bg-muted/50">
                            <TableCell className="font-mono text-sm py-4">
                              {item.codigo || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-sm py-4">
                              {item.codigoConvenio || '-'}
                            </TableCell>
                            <TableCell className="py-4" title={item.descricao || ''}>
                              <span className="text-sm leading-relaxed">{item.descricao || '-'}</span>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge 
                                variant={item.tipo === 'MATERIAL' ? 'default' : 'secondary'}
                                className="text-sm px-3 py-1"
                              >
                                {item.tipo === 'MATERIAL' ? 'Material' : 'Honorário'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm py-4 font-medium">
                              {item.quantidade || 1}
                            </TableCell>
                            <TableCell className="text-sm py-4">
                              {item.unidade || '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm py-4">
                              {formatCurrency(parseFloat(item.valorUnitario || '0'))}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 text-sm py-4">
                              {formatCurrency(parseFloat(item.valorTotal || '0'))}
                            </TableCell>
                            <TableCell className="py-4" title={item.medico || ''}>
                              <span className="text-sm">{item.medico || '-'}</span>
                            </TableCell>
                            <TableCell className="font-mono text-sm py-4">
                              {item.crm || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
