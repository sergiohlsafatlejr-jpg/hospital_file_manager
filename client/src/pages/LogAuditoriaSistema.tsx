import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ShieldAlert, Eye, Server } from "lucide-react";

export default function LogAuditoriaSistema() {
  const [buscaUsu, setBuscaUsu] = useState("");
  const [entidadeBusca, setEntidadeBusca] = useState("");
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [jsonDetails, setJsonDetails] = useState<any>(null);

  const { data, isLoading } = trpc.auditSystem.getLogs.useQuery({
    pageSize: 100,
    page: 1,
    entidade: entidadeBusca || undefined
  });

  const logs = data?.items || [];

  const handleOpenDetalhes = (detalhes: any) => {
    setJsonDetails(detalhes);
    setDetalhesOpen(true);
  };

  const getAcaoBadge = (acao: string) => {
    switch(acao) {
      case "CRIAR": return <Badge variant="default" className="bg-green-600">CRIAR</Badge>;
      case "EDITAR": return <Badge variant="secondary" className="bg-blue-600 text-white">EDITAR</Badge>;
      case "EXCLUIR": return <Badge variant="destructive">EXCLUIR</Badge>;
      case "ACESSO": return <Badge variant="outline" className="border-purple-600 text-purple-600">ACESSO</Badge>;
      default: return <Badge variant="outline">{acao}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Logs do Sistema</h1>
            <p className="text-slate-500">
              Rastreamento de todas as alterações críticas e acessos realizados pelos administradores
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-600" />
              Auditoria de Segurança
            </CardTitle>
            <CardDescription>
              Monitoramento passivo de telemetria das configurações.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por entidade (ex: convenio)"
                  value={entidadeBusca}
                  onChange={(e) => setEntidadeBusca(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Registro (ID)</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        <div className="flex items-center justify-center gap-2">
                          <Server className="h-4 w-4 animate-pulse" />
                          Consultando telemetria...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum log encontrado para os filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{log.userNome || `ID ${log.userId}`}</div>
                        </TableCell>
                        <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                        <TableCell className="font-mono text-xs capitalize">{log.entidade}</TableCell>
                        <TableCell className="font-mono text-xs">{log.entidadeId || "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.ipAddress || "-"}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={!log.detalhes}
                            onClick={() => handleOpenDetalhes(log.detalhes)}
                            className="h-8 shadow-sm"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Visualizar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Modal de Detalhes Payload */}
        <Dialog open={detalhesOpen} onOpenChange={setDetalhesOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Payload Relacionado</DialogTitle>
              <DialogDescription>Dados trafegados no momento da ação</DialogDescription>
            </DialogHeader>
            <div className="bg-slate-950 p-4 rounded-md overflow-auto max-h-[60vh] text-green-400 font-mono text-sm shadow-inner">
              <pre>{jsonDetails ? JSON.stringify(jsonDetails, null, 2) : "Nenhum payload capturado"}</pre>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
