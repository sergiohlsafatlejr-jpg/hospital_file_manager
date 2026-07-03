import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/dateUtils";

export default function AuditDashboard() {
  const [filters, setFilters] = useState({
    tipo: "all" as "all" | "CREATE" | "UPDATE" | "DELETE",
    usuario: "",
    tabela: "",
    dataInicio: "",
    dataFim: "",
  });

  const [page, setPage] = useState(1);

  // Dados simulados para demonstração
  const mockLogs = [
    {
      id: 1,
      tipo: "CREATE",
      tabela: "faturamento",
      usuarioId: 123,
      dataHora: new Date().toISOString(),
      valoresAntigos: null,
      valoresNovos: JSON.stringify({ codigo: "FAT001", valor: 1500 }),
    },
    {
      id: 2,
      tipo: "UPDATE",
      tabela: "glosa",
      usuarioId: 456,
      dataHora: new Date(Date.now() - 3600000).toISOString(),
      valoresAntigos: JSON.stringify({ status: "pendente" }),
      valoresNovos: JSON.stringify({ status: "aprovado" }),
    },
    {
      id: 3,
      tipo: "DELETE",
      tabela: "comparacoes",
      usuarioId: 789,
      dataHora: new Date(Date.now() - 7200000).toISOString(),
      valoresAntigos: JSON.stringify({ id: 999 }),
      valoresNovos: null,
    },
  ];

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case "CREATE":
        return "bg-green-100 text-green-800";
      case "UPDATE":
        return "bg-blue-100 text-blue-800";
      case "DELETE":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const filteredLogs = mockLogs.filter((log) => {
    if (filters.tipo !== "all" && log.tipo !== filters.tipo) return false;
    if (filters.usuario && !log.usuarioId.toString().includes(filters.usuario))
      return false;
    if (filters.tabela && !log.tabela.includes(filters.tabela)) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Dashboard de Auditoria</h1>
            <p className="text-gray-600 mt-2">
              Visualize e analise todas as mudanças no sistema
            </p>
          </div>

          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Select
                  value={filters.tipo}
                  onValueChange={(value) =>
                    setFilters({
                      ...filters,
                      tipo: value as "all" | "CREATE" | "UPDATE" | "DELETE",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de Operação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="CREATE">Criação</SelectItem>
                    <SelectItem value="UPDATE">Atualização</SelectItem>
                    <SelectItem value="DELETE">Exclusão</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Usuário ID"
                  value={filters.usuario}
                  onChange={(e) =>
                    setFilters({ ...filters, usuario: e.target.value })
                  }
                />

                <Input
                  placeholder="Tabela"
                  value={filters.tabela}
                  onChange={(e) =>
                    setFilters({ ...filters, tabela: e.target.value })
                  }
                />

                <Input
                  type="date"
                  value={filters.dataInicio}
                  onChange={(e) =>
                    setFilters({ ...filters, dataInicio: e.target.value })
                  }
                />

                <Input
                  type="date"
                  value={filters.dataFim}
                  onChange={(e) =>
                    setFilters({ ...filters, dataFim: e.target.value })
                  }
                />
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() =>
                    setFilters({
                      tipo: "all",
                      usuario: "",
                      tabela: "",
                      dataInicio: "",
                      dataFim: "",
                    })
                  }
                >
                  Limpar Filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Logs */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Auditoria</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhum log encontrado
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Tabela</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Data/Hora</TableHead>
                          <TableHead>Valores Antigos</TableHead>
                          <TableHead>Valores Novos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge className={getTipoBadgeColor(log.tipo)}>
                                {log.tipo}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.tabela}
                            </TableCell>
                            <TableCell>{log.usuarioId}</TableCell>
                            <TableCell className="text-sm">
                              {formatDateTimeBR(log.dataHora)}
                            </TableCell>
                            <TableCell className="text-xs">
                              <code className="bg-gray-100 p-1 rounded block max-w-xs truncate">
                                {log.valoresAntigos
                                  ? log.valoresAntigos.substring(0, 50)
                                  : "-"}
                              </code>
                            </TableCell>
                            <TableCell className="text-xs">
                              <code className="bg-gray-100 p-1 rounded block max-w-xs truncate">
                                {log.valoresNovos
                                  ? log.valoresNovos.substring(0, 50)
                                  : "-"}
                              </code>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Paginação */}
                  <div className="mt-4 flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      Total: {filteredLogs.length} registros
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setPage(page + 1)}
                        disabled={page * 20 >= filteredLogs.length}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total de Operações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl lg:text-3xl font-bold">{filteredLogs.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Criações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {filteredLogs.filter((l) => l.tipo === "CREATE").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Atualizações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {filteredLogs.filter((l) => l.tipo === "UPDATE").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Exclusões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {filteredLogs.filter((l) => l.tipo === "DELETE").length}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
