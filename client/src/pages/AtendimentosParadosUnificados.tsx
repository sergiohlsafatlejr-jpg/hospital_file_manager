'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users, Building2, Stethoscope, FlaskConical,
  ArrowUpDown, Download, RefreshCw, Search, Clock, BarChart3, X
} from "lucide-react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { trpc } from "@/lib/trpc";

type SortColumn = "numero_atendimento" | "paciente" | "convenio" | "data_entrada" | "data_saida" | "diasParado" | "descricao_atendimento" | "codigo_servico";
type SortOrder = "asc" | "desc";

interface AtendimentoUnificado {
  id: number;
  origemSistema: string;
  origemId: string;
  estabelecimentoId: number;
  numero_atendimento?: string;
  codigo_saida?: string;
  convenio?: string;
  paciente?: string;
  caracter_atendimento?: string;
  data_entrada?: string;
  data_saida?: string | null;
  tipo_atendimento?: string;
  descricao_atendimento?: string;
  codigo_servico?: string;
  codigo_procedimento?: string;
  destino_conta?: string;
  diasParado: number;
  dataSincronizacao?: string;
}

export default function AtendimentosParadosUnificados() {
  const [sortColumn, setSortColumn] = useState<SortColumn>("data_entrada");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("");
  const [selectedRow, setSelectedRow] = useState<AtendimentoUnificado | null>(null);

  // Buscar dados
  const { data: atendimentos = [], isLoading, refetch } = trpc.atendimentos.listarParadosUnificados.useQuery();
  const { data: kpis, isLoading: loadingKPIs } = trpc.atendimentos.getKPIs.useQuery();
  const { data: quantidadePorPlano = [] } = trpc.atendimentos.getQuantidadePorPlano.useQuery();
  const { data: quantidadePorServico = [] } = trpc.atendimentos.getQuantidadePorServico.useQuery();

  // Filtrar e ordenar dados
  const filteredData = useMemo(() => {
    let filtered = [...atendimentos];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        (a.numero_atendimento?.toLowerCase().includes(term)) ||
        (a.paciente?.toLowerCase().includes(term)) ||
        (a.convenio?.toLowerCase().includes(term))
      );
    }

    if (filtroTipo) {
      filtered = filtered.filter(a => a.tipo_atendimento === filtroTipo);
    }

    if (filtroConvenio) {
      filtered = filtered.filter(a => a.convenio === filtroConvenio);
    }

    // Ordenar
    filtered.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [atendimentos, searchTerm, filtroTipo, filtroConvenio, sortColumn, sortOrder]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const handleExportExcel = () => {
    const data = filteredData.map(a => ({
      "N° Atend": a.numero_atendimento,
      "Plano": a.convenio,
      "Paciente": a.paciente,
      "Caráter": a.caracter_atendimento,
      "Data Entrada": a.data_entrada,
      "Data Saída": a.data_saida || "-",
      "Dias Parado": a.diasParado,
      "Tipo": a.tipo_atendimento,
      "Serviço": a.descricao_atendimento,
      "Proc. Principal": a.codigo_procedimento,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, "atendimentos-parados.xlsx");
    toast.success("Arquivo exportado com sucesso!");
  };

  const getKPIIcon = (tipo: string) => {
    switch (tipo) {
      case "total": return <Users className="w-6 h-6" />;
      case "internacao": return <Building2 className="w-6 h-6" />;
      case "exame": return <FlaskConical className="w-6 h-6" />;
      case "ambulatorio": return <Stethoscope className="w-6 h-6" />;
      default: return <Clock className="w-6 h-6" />;
    }
  };

  const getKPILabel = (tipo: string) => {
    switch (tipo) {
      case "total": return "Total a Faturar";
      case "internacao": return "Internação";
      case "exame": return "Exame";
      case "ambulatorio": return "Ambulatório";
      default: return tipo;
    }
  };

  const getKPIColor = (tipo: string) => {
    switch (tipo) {
      case "total": return "from-blue-600 to-blue-700";
      case "internacao": return "from-orange-600 to-orange-700";
      case "exame": return "from-purple-600 to-purple-700";
      case "ambulatorio": return "from-cyan-600 to-cyan-700";
      default: return "from-gray-600 to-gray-700";
    }
  };

  const getTipos = () => [...new Set(atendimentos.map(a => a.tipo_atendimento).filter(Boolean))];
  const getConvenios = () => [...new Set(atendimentos.map(a => a.convenio).filter(Boolean))];

  const getDiasParadoColor = (dias: number) => {
    if (dias >= 30) return "bg-red-100 text-red-800";
    if (dias >= 15) return "bg-orange-100 text-orange-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const getTipoAtendimentoBadgeColor = (tipo?: string) => {
    switch (tipo?.toUpperCase()) {
      case "INTERNACAO":
      case "INTERNAÇÃO":
        return "bg-orange-100 text-orange-800";
      case "AMBULATORIO":
      case "AMBULATÓRIO":
        return "bg-blue-100 text-blue-800";
      case "EXAME":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "-";
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return String(date);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Atendimentos Parados</h1>
          <p className="text-slate-400">Acompanhe atendimentos pendentes de faturamento</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis && Object.entries(kpis).map(([tipo, valor]: any) => (
            <Card key={tipo} className={`bg-gradient-to-br ${getKPIColor(tipo)} border-0 text-white`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-90">{getKPILabel(tipo)}</p>
                    <p className="text-3xl font-bold mt-2">{valor}</p>
                  </div>
                  <div className="opacity-50">{getKPIIcon(tipo)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Quantidade por Plano */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Quantidade por Plano (Convênio)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quantidadePorPlano && quantidadePorPlano.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={quantidadePorPlano}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="convenio" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px", color: "#f1f5f9" }} />
                    <Bar dataKey="quantidade" fill="#a78bfa" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">Sem dados</div>
              )}
            </CardContent>
          </Card>

          {/* Quantidade por Serviço */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Quantidade por Serviço
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quantidadePorServico && quantidadePorServico.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={quantidadePorServico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="servico" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px", color: "#f1f5f9" }} />
                    <Bar dataKey="quantidade" fill="#60a5fa" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">Sem dados</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filtros e Tabela */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">Atendimentos</CardTitle>
                <div className="flex gap-2">
                  <Button
                    onClick={() => refetch()}
                    variant="outline"
                    size="sm"
                    className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar
                  </Button>
                  <Button
                    onClick={handleExportExcel}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
              </div>

              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por N° Atend, Paciente ou Plano..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                  />
                </div>

                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2"
                >
                  <option value="">Todos os Tipos</option>
                  {getTipos().map(tipo => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>

                <select
                  value={filtroConvenio}
                  onChange={(e) => setFiltroConvenio(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2"
                >
                  <option value="">Todos os Planos</option>
                  {getConvenios().map(convenio => (
                    <option key={convenio} value={convenio}>{convenio}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64 text-slate-400">Carregando...</div>
            ) : filteredData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-slate-400">Nenhum atendimento encontrado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white" onClick={() => handleSort("numero_atendimento")}>
                        <div className="flex items-center gap-2">
                          N° Atend <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white" onClick={() => handleSort("convenio")}>
                        <div className="flex items-center gap-2">
                          Plano <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white" onClick={() => handleSort("paciente")}>
                        <div className="flex items-center gap-2">
                          Paciente <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold">Caráter</th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white" onClick={() => handleSort("data_entrada")}>
                        <div className="flex items-center gap-2">
                          Data Entrada <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold">Data Saída</th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold cursor-pointer hover:text-white" onClick={() => handleSort("diasParado")}>
                        <div className="flex items-center gap-2">
                          Dias Parado <ArrowUpDown className="w-4 h-4" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold">Tipo</th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold">Serviço</th>
                      <th className="px-4 py-3 text-left text-slate-300 font-semibold">Proc. Principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((atendimento, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setSelectedRow(atendimento)}
                        className="border-b border-slate-700 hover:bg-slate-700 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-200 font-mono">{atendimento.numero_atendimento}</td>
                        <td className="px-4 py-3 text-slate-200">{atendimento.convenio}</td>
                        <td className="px-4 py-3 text-slate-200">{atendimento.paciente}</td>
                        <td className="px-4 py-3 text-slate-200">{atendimento.caracter_atendimento}</td>
                        <td className="px-4 py-3 text-slate-200">{formatDate(atendimento.data_entrada)}</td>
                        <td className="px-4 py-3 text-slate-200">{formatDate(atendimento.data_saida)}</td>
                        <td className="px-4 py-3">
                          <Badge className={`${getDiasParadoColor(atendimento.diasParado)}`}>
                            {atendimento.diasParado} dias
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={getTipoAtendimentoBadgeColor(atendimento.tipo_atendimento)}>
                            {atendimento.tipo_atendimento}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-200 text-xs">{atendimento.descricao_atendimento}</td>
                        <td className="px-4 py-3 text-slate-200 font-mono text-xs">{atendimento.codigo_procedimento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 text-slate-400 text-sm">
              Exibindo {filteredData.length} de {atendimentos.length} atendimentos
            </div>
          </CardContent>
        </Card>

        {/* Painel Lateral - Detalhes do Atendimento */}
        {selectedRow && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
            <div className="bg-slate-800 w-full md:w-96 h-screen md:h-auto md:rounded-l-lg shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white">Detalhes do Atendimento</h2>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <p className="text-slate-400 text-sm">N° Atendimento</p>
                  <p className="text-white font-mono font-bold">{selectedRow.numero_atendimento}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Paciente</p>
                  <p className="text-white">{selectedRow.paciente}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Plano</p>
                  <p className="text-white">{selectedRow.convenio}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Tipo de Atendimento</p>
                  <Badge className={getTipoAtendimentoBadgeColor(selectedRow.tipo_atendimento)}>
                    {selectedRow.tipo_atendimento}
                  </Badge>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Caráter</p>
                  <p className="text-white">{selectedRow.caracter_atendimento}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Data Entrada</p>
                    <p className="text-white">{formatDate(selectedRow.data_entrada)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Data Saída</p>
                    <p className="text-white">{formatDate(selectedRow.data_saida)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Dias Parado</p>
                  <Badge className={getDiasParadoColor(selectedRow.diasParado)}>
                    {selectedRow.diasParado} dias
                  </Badge>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Serviço</p>
                  <p className="text-white">{selectedRow.descricao_atendimento}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Procedimento Principal</p>
                  <p className="text-white font-mono">{selectedRow.codigo_procedimento}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-sm">Origem do Sistema</p>
                  <p className="text-white">{selectedRow.origemSistema}</p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-700">
                <Button
                  onClick={() => setSelectedRow(null)}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
