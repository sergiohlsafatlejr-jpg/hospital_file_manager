import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSAS_TISS } from "../../../shared/glossaryGlosas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Search,
  Filter,
} from "lucide-react";
import * as XLSX from "xlsx";

// Função para formatar valores monetários
const formatCurrency = (value: number | string | null | undefined): string => {
  let num = 0;
  if (typeof value === 'string') {
    num = parseFloat(value);
  } else if (typeof value === 'number') {
    num = value;
  }
  if (isNaN(num) || num === null || num === undefined) {
    num = 0;
  }
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Função para formatar competência como MM/AAAA
const formatCompetencia = (competencia: string | null | undefined): string => {
  if (!competencia) return '-';
  // Formato AAAA-MM-DD -> MM/AAAA
  const match = competencia.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[2]}/${match[1]}`;
  }
  return competencia;
};

// Tipo para os itens da conta
type ItemConta = {
  id: number;
  tipoItem: string;
  cdItem: string;
  cdItemTuss: string;
  descricao: string;
  qtd: number;
  vlFaturado: number;
  vlPago: number;
  vlGlosa: number;
  motivoGlosa: string;
  dtItem: Date | null;
};

export default function DetalhesContaFaturada() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id || 0;
  const [, params] = useRoute("/contas-faturadas/:conta");
  const [, setLocation] = useLocation();
  const conta = params?.conta ? decodeURIComponent(params.conta) : "";
  
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [buscaFiltro, setBuscaFiltro] = useState("");

  // Query de itens da conta
  const { data: dadosConta, isLoading } = trpc.faturadoTasy.itensPorConta.useQuery(
    {
      estabelecimentoId,
      conta,
    },
    { enabled: estabelecimentoId > 0 && !!conta }
  );

  // Calcular resumo
  const resumo = useMemo(() => {
    if (!dadosConta) {
      return {
        totalItens: 0,
        totalFaturado: 0,
        totalPago: 0,
        totalGlosado: 0,
        totalPendente: 0,
        convenio: '-',
        competencia: '-',
        atendimento: '-',
        protocolo: '-',
        setor: '-',
        profExec: '-',
      };
    }

    return {
      totalItens: dadosConta.itens?.length || 0,
      totalFaturado: dadosConta.valorFaturadoTotal || 0,
      totalPago: dadosConta.valorPagoTotal || 0,
      totalGlosado: dadosConta.valorGlosadoTotal || 0,
      totalPendente: Math.max(0, (dadosConta.valorFaturadoTotal || 0) - (dadosConta.valorPagoTotal || 0) - (dadosConta.valorGlosadoTotal || 0)),
      convenio: dadosConta.convenio || '-',
      competencia: formatCompetencia(dadosConta.competencia),
      atendimento: dadosConta.atendimento || '-',
      protocolo: dadosConta.protocolo || '-',
      setor: dadosConta.setor || '-',
      profExec: dadosConta.profExec || '-',
    };
  }, [dadosConta]);

  // Filtrar itens
  const itensFiltrados = useMemo(() => {
    if (!dadosConta?.itens) return [];
    
    return dadosConta.itens.filter((item: ItemConta) => {
      // Filtro por tipo
      if (tipoFiltro !== "todos") {
        if (tipoFiltro === "PROC/TAXA" && item.tipoItem !== "PROC/TAXA") return false;
        if (tipoFiltro === "MAT/MED" && item.tipoItem !== "MAT/MED") return false;
      }
      
      // Filtro por busca
      if (buscaFiltro) {
        const busca = buscaFiltro.toLowerCase();
        const descricao = (item.descricao || '').toLowerCase();
        const codigo = (item.cdItem || '').toLowerCase();
        const codigoTuss = (item.cdItemTuss || '').toLowerCase();
        if (!descricao.includes(busca) && !codigo.includes(busca) && !codigoTuss.includes(busca)) {
          return false;
        }
      }
      
      return true;
    });
  }, [dadosConta, tipoFiltro, buscaFiltro]);

  // Exportar para Excel
  const exportarExcel = () => {
    if (!itensFiltrados || itensFiltrados.length === 0) return;

    const dados = itensFiltrados.map((item: ItemConta) => ({
      'Código': item.cdItem || '',
      'Código TUSS': item.cdItemTuss || '',
      'Descrição': item.descricao || '',
      'Tipo': item.tipoItem || '',
      'Quantidade': item.qtd || 0,
      'Valor Faturado': item.vlFaturado || 0,
      'Valor Pago': item.vlPago || 0,
      'Valor Glosado': item.vlGlosa || 0,
      'Motivo Glosa': item.motivoGlosa || '',
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens da Conta');
    XLSX.writeFile(wb, `conta_${conta}_itens.xlsx`);
  };

  // Determinar status da conta
  const getStatus = () => {
    if (resumo.totalPago >= resumo.totalFaturado * 0.99) {
      return { label: 'Pago', color: 'bg-green-500', icon: CheckCircle };
    } else if (resumo.totalGlosado >= resumo.totalFaturado * 0.99) {
      return { label: 'Glosado', color: 'bg-red-500', icon: AlertTriangle };
    } else if (resumo.totalPago > 0 || resumo.totalGlosado > 0) {
      return { label: 'Parcial', color: 'bg-yellow-500', icon: Clock };
    }
    return { label: 'Pendente', color: 'bg-gray-500', icon: Clock };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  return (
    <DashboardLayout>
    <div className="container py-6 space-y-6">
      {/* Header com botão voltar */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setLocation("/contas-faturadas")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Detalhes da Conta {conta}</h1>
          <p className="text-muted-foreground">
            Visualize todos os itens faturados desta conta
          </p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faturado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(resumo.totalFaturado)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo.totalItens} itens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(resumo.totalPago)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo.totalFaturado > 0 
                ? `${((resumo.totalPago / resumo.totalFaturado) * 100).toFixed(1)}% do faturado`
                : '0%'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Glosado</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(resumo.totalGlosado)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo.totalFaturado > 0 
                ? `${((resumo.totalGlosado / resumo.totalFaturado) * 100).toFixed(1)}% do faturado`
                : '0%'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendente</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(resumo.totalPendente)}
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo.totalFaturado > 0 
                ? `${((resumo.totalPendente / resumo.totalFaturado) * 100).toFixed(1)}% do faturado`
                : '0%'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Informações da conta */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Informações da Conta
              </CardTitle>
              <CardDescription>Dados gerais do atendimento</CardDescription>
            </div>
            <Badge className={`${status.color} text-white`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Convênio</p>
              <p className="font-medium">{resumo.convenio}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Competência</p>
              <p className="font-medium">{resumo.competencia}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Atendimento</p>
              <p className="font-medium">{resumo.atendimento}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Protocolo</p>
              <p className="font-medium">{resumo.protocolo}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Setor</p>
              <p className="font-medium">{resumo.setor}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Profissional</p>
              <p className="font-medium">{resumo.profExec}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de itens */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Itens da Conta</CardTitle>
              <CardDescription>
                {itensFiltrados.length} de {dadosConta?.itens?.length || 0} itens
              </CardDescription>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou código..."
                  value={buscaFiltro}
                  onChange={(e) => setBuscaFiltro(e.target.value)}
                  className="pl-8 w-full md:w-64"
                />
              </div>
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger className="w-full md:w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="PROC/TAXA">Proc/Taxa</SelectItem>
                  <SelectItem value="MAT/MED">Mat/Med</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportarExcel}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum item encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Faturado</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">Glosado</TableHead>
                    <TableHead>Motivo Glosa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensFiltrados.map((item: ItemConta, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs">
                        {item.cdItem || '-'}
                        {item.cdItemTuss && (
                          <span className="block text-muted-foreground">
                            TUSS: {item.cdItemTuss}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={item.descricao || ''}>
                        {item.descricao || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.tipoItem === 'MAT/MED' ? 'secondary' : 'outline'}>
                          {item.tipoItem || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{item.qtd || 0}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.vlFaturado)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(item.vlPago)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrency(item.vlGlosa)}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {item.motivoGlosa ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-gray-400 hover:border-gray-600 truncate block text-xs text-muted-foreground">
                                {item.motivoGlosa}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="text-sm">
                                <p className="font-semibold mb-1">Motivo da Glosa</p>
                                <p>{item.motivoGlosa}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
