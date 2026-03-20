import { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Upload, Building2, Users, AlertTriangle,
  Clock, CheckCircle, XCircle, Download, Eye, Pencil, Trash2,
  BarChart3, TrendingUp, Calendar, Filter, FileUp, Brain,
  ChevronLeft, ChevronRight, AlertCircle, ArrowUpDown,
} from "lucide-react";

// ============================================================
// DASHBOARD TAB
// ============================================================
function DashboardTab() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const estabId = (!visualizandoTodos && estabelecimentoAtual?.id) ? estabelecimentoAtual.id : undefined;
  const [hospitalFilter, setHospitalFilter] = useState<number | undefined>();
  const { data: hospitais } = trpc.nfse.hospitais.listar.useQuery(estabId ? { estabelecimentoId: estabId } : undefined);
  const { data: dashboard, isLoading } = trpc.nfse.notas.dashboard.useQuery({
    hospitalId: hospitalFilter,
    estabelecimentoId: estabId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const kpis = dashboard?.kpis;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* Filtro hospital */}
      <div className="flex items-center gap-3">
        <Select
          value={hospitalFilter ? String(hospitalFilter) : "todos"}
          onValueChange={(v) => setHospitalFilter(v === "todos" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Todos os hospitais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os hospitais</SelectItem>
            {hospitais?.map(h => (
              <SelectItem key={h.id} value={String(h.id)}>{h.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <FileText className="h-4 w-4" />
              Total de Notas
            </div>
            <div className="text-2xl font-bold">{kpis?.totalNotas ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Valor Bruto
            </div>
            <div className="text-2xl font-bold text-green-600">{fmt(kpis?.totalBruto ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle className="h-4 w-4" />
              Emitidas
            </div>
            <div className="text-2xl font-bold text-blue-600">{kpis?.totalEmitidas ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="h-4 w-4" />
              Pendentes
            </div>
            <div className="text-2xl font-bold text-amber-600">{kpis?.totalPendentes ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo por hospital */}
      {dashboard?.resumoPorHospital && dashboard.resumoPorHospital.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo por Hospital</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital</TableHead>
                  <TableHead className="text-right">Notas</TableHead>
                  <TableHead className="text-right">Valor Bruto</TableHead>
                  <TableHead className="text-right">Valor Líquido</TableHead>
                  <TableHead className="text-right">Pendentes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.resumoPorHospital.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.hospitalNome}</TableCell>
                    <TableCell className="text-right">{Number(r.totalNotas)}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.totalBruto))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.totalLiquido))}</TableCell>
                    <TableCell className="text-right">
                      {Number(r.pendentes) > 0 ? (
                        <Badge variant="destructive">{Number(r.pendentes)}</Badge>
                      ) : (
                        <Badge variant="secondary">0</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Últimas notas */}
      {dashboard?.ultimasNotas && dashboard.ultimasNotas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas Notas Registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Convênio</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead className="text-right">Valor Bruto</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.ultimasNotas.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono">{n.numeroNf}</TableCell>
                    <TableCell>{n.hospitalNome}</TableCell>
                    <TableCell>{n.convenioNome || "-"}</TableCell>
                    <TableCell>{n.dataEmissao ? new Date(n.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell className="text-right">{fmt(Number(n.valorBruto))}</TableCell>
                    <TableCell>
                      {n.nfEmitida === "sim" ? (
                        <Badge className="bg-green-100 text-green-800">Emitida</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Pendente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// NOTAS FISCAIS TAB (CRUD)
// ============================================================
function NotasFiscaisTab() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const estabId = (!visualizandoTodos && estabelecimentoAtual?.id) ? estabelecimentoAtual.id : undefined;
  const [busca, setBusca] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<"sim" | "nao" | undefined>();
  const [page, setPage] = useState(0);
  const [editingNota, setEditingNota] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: hospitais } = trpc.nfse.hospitais.listar.useQuery(estabId ? { estabelecimentoId: estabId } : undefined);
  const { data: convenios } = trpc.nfse.convenios.listar.useQuery();
  const { data: notasData, isLoading } = trpc.nfse.notas.listar.useQuery({
    hospitalId: hospitalFilter,
    estabelecimentoId: estabId,
    nfEmitida: statusFilter,
    busca: busca || undefined,
    limit: 20,
    offset: page * 20,
  });

  const utils = trpc.useUtils();
  const criarMutation = trpc.nfse.notas.criar.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); utils.nfse.notas.dashboard.invalidate(); toast.success("Nota criada com sucesso"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.nfse.notas.atualizar.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); utils.nfse.notas.dashboard.invalidate(); toast.success("Nota atualizada"); setEditingNota(null); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.nfse.notas.excluir.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); utils.nfse.notas.dashboard.invalidate(); toast.success("Nota excluída"); },
    onError: (e) => toast.error(e.message),
  });
  const toggleXmlMutation = trpc.nfse.notas.toggleXml.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); },
  });
  const toggleNfMutation = trpc.nfse.notas.toggleNfEmitida.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); utils.nfse.notas.dashboard.invalidate(); },
  });
  const importarPdfMutation = trpc.nfse.notas.importarPdfComIA.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      toast.success("PDF analisado com sucesso!");
    },
    onError: (e) => toast.error("Erro ao analisar PDF: " + e.message),
  });

  const fmt = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 16MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      importarPdfMutation.mutate({ fileName: file.name, fileBase64: base64 });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (formData: FormData) => {
    const data = {
      hospitalId: Number(formData.get("hospitalId")),
      convenioId: formData.get("convenioId") ? Number(formData.get("convenioId")) : undefined,
      numeroNf: formData.get("numeroNf") as string,
      dataEmissao: formData.get("dataEmissao") as string,
      dataFaturamento: (formData.get("dataFaturamento") as string) || undefined,
      valorBruto: Number(formData.get("valorBruto")) || 0,
      valorLiquido: Number(formData.get("valorLiquido")) || 0,
      xmlDemonstrativoEmitido: formData.get("xmlDemonstrativoEmitido") === "on" ? "sim" as const : "nao" as const,
      nfEmitida: formData.get("nfEmitida") === "on" ? "sim" as const : "nao" as const,
      observacoes: (formData.get("observacoes") as string) || undefined,
    };

    if (editingNota) {
      atualizarMutation.mutate({ ...data, id: editingNota.id });
    } else {
      criarMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número NF..."
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select
          value={hospitalFilter ? String(hospitalFilter) : "todos"}
          onValueChange={(v) => { setHospitalFilter(v === "todos" ? undefined : Number(v)); setPage(0); }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Hospital" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {hospitais?.map(h => (
              <SelectItem key={h.id} value={String(h.id)}>{h.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || "todos"}
          onValueChange={(v) => { setStatusFilter(v === "todos" ? undefined : v as "sim" | "nao"); setPage(0); }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sim">Emitidas</SelectItem>
            <SelectItem value="nao">Pendentes</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2 ml-auto">
          <input type="file" ref={fileInputRef} accept=".pdf" className="hidden" onChange={handlePdfImport} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importarPdfMutation.isPending}>
            <Brain className="h-4 w-4 mr-2" />
            {importarPdfMutation.isPending ? "Analisando..." : "Importar PDF com IA"}
          </Button>
          <Button onClick={() => { setEditingNota(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Nota
          </Button>
        </div>
      </div>

      {/* Resultado da importação por IA */}
      {importResult && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-600" />
              Dados Extraídos do PDF
            </CardTitle>
            <CardDescription>Revise os dados e clique em "Criar Nota" para salvar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <div><span className="text-muted-foreground">Nº NF:</span> <strong>{importResult.extractedData.numero_nf || "-"}</strong></div>
              <div><span className="text-muted-foreground">Data:</span> <strong>{importResult.extractedData.data_emissao || "-"}</strong></div>
              <div><span className="text-muted-foreground">Valor Bruto:</span> <strong>{importResult.extractedData.valor_bruto ? fmt(importResult.extractedData.valor_bruto) : "-"}</strong></div>
              <div><span className="text-muted-foreground">Valor Líquido:</span> <strong>{importResult.extractedData.valor_liquido ? fmt(importResult.extractedData.valor_liquido) : "-"}</strong></div>
              <div><span className="text-muted-foreground">Hospital:</span> <strong>{importResult.extractedData.hospital_nome || "-"}</strong></div>
              <div><span className="text-muted-foreground">Convênio:</span> <strong>{importResult.extractedData.convenio_nome || "-"}</strong></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                setEditingNota(null);
                setShowForm(true);
                // Pre-fill form data will be handled by the form
              }}>
                Criar Nota com Estes Dados
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportResult(null)}>Descartar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário de criação/edição */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingNota ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(e.currentTarget)); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Hospital *</Label>
                  <Select name="hospitalId" defaultValue={editingNota?.hospitalId ? String(editingNota.hospitalId) : importResult?.matchedHospitalId ? String(importResult.matchedHospitalId) : undefined}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {hospitais?.map(h => (
                        <SelectItem key={h.id} value={String(h.id)}>{h.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Convênio</Label>
                  <Select name="convenioId" defaultValue={editingNota?.convenioId ? String(editingNota.convenioId) : importResult?.matchedConvenioId ? String(importResult.matchedConvenioId) : undefined}>
                    <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {convenios?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Número NF *</Label>
                  <Input name="numeroNf" required defaultValue={editingNota?.numeroNf || importResult?.extractedData?.numero_nf || ""} />
                </div>
                <div>
                  <Label>Data Emissão *</Label>
                  <Input type="date" name="dataEmissao" required defaultValue={editingNota?.dataEmissao ? String(editingNota.dataEmissao).substring(0, 10) : importResult?.extractedData?.data_emissao || ""} />
                </div>
                <div>
                  <Label>Data Faturamento</Label>
                  <Input type="date" name="dataFaturamento" defaultValue={editingNota?.dataFaturamento ? String(editingNota.dataFaturamento).substring(0, 10) : importResult?.extractedData?.data_faturamento || ""} />
                </div>
                <div>
                  <Label>Valor Bruto</Label>
                  <Input type="number" step="0.01" name="valorBruto" defaultValue={editingNota?.valorBruto || importResult?.extractedData?.valor_bruto || 0} />
                </div>
                <div>
                  <Label>Valor Líquido</Label>
                  <Input type="number" step="0.01" name="valorLiquido" defaultValue={editingNota?.valorLiquido || importResult?.extractedData?.valor_liquido || 0} />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox name="xmlDemonstrativoEmitido" defaultChecked={editingNota?.xmlDemonstrativoEmitido === "sim"} />
                    <span className="text-sm">XML Emitido</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox name="nfEmitida" defaultChecked={editingNota?.nfEmitida === "sim"} />
                    <span className="text-sm">NF Emitida</span>
                  </label>
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea name="observacoes" defaultValue={editingNota?.observacoes || importResult?.extractedData?.observacoes || ""} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={criarMutation.isPending || atualizarMutation.isPending}>
                  {criarMutation.isPending || atualizarMutation.isPending ? "Salvando..." : editingNota ? "Atualizar" : "Criar Nota"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingNota(null); setImportResult(null); }}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabela de notas */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NF</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead>Data Emissão</TableHead>
                <TableHead className="text-right">Valor Bruto</TableHead>
                <TableHead className="text-right">Valor Líquido</TableHead>
                <TableHead className="text-center">XML</TableHead>
                <TableHead className="text-center">NF</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !notasData?.notas.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma nota encontrada</TableCell></TableRow>
              ) : (
                notasData.notas.map((nota) => (
                  <TableRow key={nota.id}>
                    <TableCell className="font-mono font-medium">{nota.numeroNf}</TableCell>
                    <TableCell>{nota.hospitalNome}</TableCell>
                    <TableCell>{nota.convenioNome || "-"}</TableCell>
                    <TableCell>{nota.dataEmissao ? new Date(nota.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell className="text-right">{fmt(nota.valorBruto)}</TableCell>
                    <TableCell className="text-right">{fmt(nota.valorLiquido)}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={nota.xmlDemonstrativoEmitido === "sim"}
                        onCheckedChange={(checked) => toggleXmlMutation.mutate({ id: nota.id, valor: checked ? "sim" : "nao" })}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={nota.nfEmitida === "sim"}
                        onCheckedChange={(checked) => toggleNfMutation.mutate({ id: nota.id, valor: checked ? "sim" : "nao" })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingNota(nota); setShowForm(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => {
                          if (confirm("Excluir esta nota fiscal?")) excluirMutation.mutate({ id: nota.id });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {nota.pdfUrl && (
                          <Button size="icon" variant="ghost" asChild>
                            <a href={nota.pdfUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {notasData && notasData.total > 20 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Mostrando {page * 20 + 1}-{Math.min((page + 1) * 20, notasData.total)} de {notasData.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * 20 >= notasData.total} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PENDENTES TAB
// ============================================================
function PendentesTab() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const estabId = (!visualizandoTodos && estabelecimentoAtual?.id) ? estabelecimentoAtual.id : undefined;
  const [hospitalFilter, setHospitalFilter] = useState<number | undefined>();
  const { data: hospitais } = trpc.nfse.hospitais.listar.useQuery(estabId ? { estabelecimentoId: estabId } : undefined);
  const { data: pendentesData, isLoading } = trpc.nfse.notas.pendentes.useQuery({
    hospitalId: hospitalFilter,
    estabelecimentoId: estabId,
  });
  const utils = trpc.useUtils();
  const toggleNfMutation = trpc.nfse.notas.toggleNfEmitida.useMutation({
    onSuccess: () => { utils.nfse.notas.invalidate(); toast.success("Status atualizado"); },
  });

  const fmt = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const urgenciaColor = (u: string) => {
    if (u === "urgente") return "bg-red-100 text-red-800 border-red-200";
    if (u === "atencao") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={hospitalFilter ? String(hospitalFilter) : "todos"}
          onValueChange={(v) => setHospitalFilter(v === "todos" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Todos os hospitais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os hospitais</SelectItem>
            {hospitais?.map(h => (
              <SelectItem key={h.id} value={String(h.id)}>{h.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo de urgência */}
      {pendentesData?.resumo && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-red-200">
            <CardContent className="pt-4 pb-3 text-center">
              <AlertCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-red-600">{pendentesData.resumo.urgentes}</div>
              <div className="text-xs text-muted-foreground">Urgentes (&gt;30 dias)</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="pt-4 pb-3 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-amber-600">{pendentesData.resumo.atencao}</div>
              <div className="text-xs text-muted-foreground">Atenção (15-30 dias)</div>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-4 pb-3 text-center">
              <Clock className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <div className="text-2xl font-bold text-green-600">{pendentesData.resumo.normais}</div>
              <div className="text-xs text-muted-foreground">Normal (&lt;15 dias)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <div className="text-2xl font-bold">{pendentesData.resumo.total}</div>
              <div className="text-xs text-muted-foreground">Total Pendentes</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista de pendentes */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Urgência</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Hospital</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead>Data Emissão</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead className="text-right">Valor Bruto</TableHead>
                <TableHead className="text-center">Marcar Emitida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !pendentesData?.pendentes.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma nota pendente</TableCell></TableRow>
              ) : (
                pendentesData.pendentes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge className={urgenciaColor(p.urgencia)}>
                        {p.urgencia === "urgente" ? "Urgente" : p.urgencia === "atencao" ? "Atenção" : "Normal"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{p.numeroNf}</TableCell>
                    <TableCell>{p.hospitalNome}</TableCell>
                    <TableCell>{p.convenioNome || "-"}</TableCell>
                    <TableCell>{p.dataEmissao ? new Date(p.dataEmissao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.diasDesdeEmissao}d</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmt(p.valorBruto)}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" onClick={() => toggleNfMutation.mutate({ id: p.id, valor: "sim" })}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Emitir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ACOMPANHAMENTO TAB
// ============================================================
function AcompanhamentoTab() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const estabId = (!visualizandoTodos && estabelecimentoAtual?.id) ? estabelecimentoAtual.id : undefined;
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [hospitalFilter, setHospitalFilter] = useState<number | undefined>();
  const { data: hospitais } = trpc.nfse.hospitais.listar.useQuery(estabId ? { estabelecimentoId: estabId } : undefined);
  const { data: acompData, isLoading } = trpc.nfse.notas.acompanhamentoEnvios.useQuery({
    hospitalId: hospitalFilter,
    estabelecimentoId: estabId,
    mes,
    ano,
  });

  const fmt = (v: number | string) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meses.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(a => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={hospitalFilter ? String(hospitalFilter) : "todos"}
          onValueChange={(v) => setHospitalFilter(v === "todos" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Todos os hospitais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os hospitais</SelectItem>
            {hospitais?.map(h => (
              <SelectItem key={h.id} value={String(h.id)}>{h.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !acompData?.envios.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum envio registrado para {meses[mes - 1]} {ano}</p>
          </CardContent>
        </Card>
      ) : (
        acompData.envios.map((hospital) => (
          <Card key={hospital.hospitalId}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {hospital.hospitalNome}
                </CardTitle>
                <div className="flex gap-3 text-sm">
                  <span>{hospital.totalNotas} notas</span>
                  <span className="text-green-600 font-medium">{fmt(hospital.totalBruto)}</span>
                  {hospital.pendentes > 0 && (
                    <Badge variant="destructive">{hospital.pendentes} pendentes</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead className="text-right">Notas</TableHead>
                    <TableHead className="text-right">Valor Bruto</TableHead>
                    <TableHead className="text-right">Valor Líquido</TableHead>
                    <TableHead className="text-right">Emitidas</TableHead>
                    <TableHead className="text-right">Pendentes</TableHead>
                    <TableHead className="text-right">XML</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hospital.convenios.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{c.convenioNome || "Sem convênio"}</TableCell>
                      <TableCell className="text-right">{Number(c.totalNotas)}</TableCell>
                      <TableCell className="text-right">{fmt(c.totalBruto)}</TableCell>
                      <TableCell className="text-right">{fmt(c.totalLiquido)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-green-100 text-green-800">{Number(c.emitidas)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(c.pendentes) > 0 ? (
                          <Badge variant="destructive">{Number(c.pendentes)}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{Number(c.xmlEmitidos)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ============================================================
// HOSPITAIS CONFIG TAB
// ============================================================
function HospitaisTab() {
  const { estabelecimentoAtual, visualizandoTodos } = useEstabelecimento();
  const estabId = (!visualizandoTodos && estabelecimentoAtual?.id) ? estabelecimentoAtual.id : undefined;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const { data: hospitais, isLoading } = trpc.nfse.hospitais.listar.useQuery(estabId ? { estabelecimentoId: estabId } : undefined);
  const utils = trpc.useUtils();
  const criarMutation = trpc.nfse.hospitais.criar.useMutation({
    onSuccess: () => { utils.nfse.hospitais.invalidate(); toast.success("Hospital criado"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.nfse.hospitais.atualizar.useMutation({
    onSuccess: () => { utils.nfse.hospitais.invalidate(); toast.success("Hospital atualizado"); setEditing(null); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.nfse.hospitais.excluir.useMutation({
    onSuccess: () => { utils.nfse.hospitais.invalidate(); toast.success("Hospital desativado"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      nome: fd.get("nome") as string,
      cnpj: (fd.get("cnpj") as string) || undefined,
      cpfNf: (fd.get("cpfNf") as string) || undefined,
      senhaNf: (fd.get("senhaNf") as string) || undefined,
      endereco: (fd.get("endereco") as string) || undefined,
      telefone: (fd.get("telefone") as string) || undefined,
    };
    if (editing) {
      atualizarMutation.mutate({ ...data, id: editing.id });
    } else {
      criarMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Configure os hospitais que emitem NFS-e</p>
        <Button onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Hospital
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? "Editar Hospital" : "Novo Hospital"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome *</Label>
                  <Input name="nome" required defaultValue={editing?.nome || ""} />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input name="cnpj" defaultValue={editing?.cnpj || ""} />
                </div>
                <div>
                  <Label>CPF para NF</Label>
                  <Input name="cpfNf" defaultValue={editing?.cpfNf || ""} />
                </div>
                <div>
                  <Label>Senha NF</Label>
                  <Input name="senhaNf" type="password" defaultValue={editing?.senhaNf || ""} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input name="telefone" defaultValue={editing?.telefone || ""} />
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input name="endereco" defaultValue={editing?.endereco || ""} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={criarMutation.isPending || atualizarMutation.isPending}>Salvar</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>CPF/Usuário NF</TableHead>
                <TableHead>Senha NF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !hospitais?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum hospital cadastrado</TableCell></TableRow>
              ) : (
                hospitais.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.nome}</TableCell>
                    <TableCell>{h.cnpj || "-"}</TableCell>
                    <TableCell>
                      {h.cpfNf ? (
                        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{h.cpfNf}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {h.senhaNf ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                            {showPasswords[h.id] ? h.senhaNf : "••••••"}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setShowPasswords(prev => ({ ...prev, [h.id]: !prev[h.id] }))}
                            title={showPasswords[h.id] ? "Ocultar senha" : "Mostrar senha"}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{h.telefone || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(h); setShowForm(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => {
                        if (confirm("Desativar este hospital?")) excluirMutation.mutate({ id: h.id });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CONVÊNIOS CONFIG TAB
// ============================================================
function ConveniosNfseTab() {
  const { data: conveniosSistema, isLoading } = trpc.nfse.convenios.listar.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Convênios carregados automaticamente do cadastro principal do sistema.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Para adicionar ou editar convênios, acesse o menu <strong>Gerenciamento &gt; Convênios</strong>.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {conveniosSistema?.length || 0} convênios ativos
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !conveniosSistema?.length ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum convênio cadastrado no sistema</TableCell></TableRow>
              ) : (
                conveniosSistema.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{c.codigo || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="default" className="bg-green-600 text-xs">Ativo</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN MODULE PAGE
// ============================================================
export default function NfseModule() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Módulo NFS-e</h1>
          <p className="text-muted-foreground">Gestão de Notas Fiscais de Serviço Eletrônicas</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="dashboard" className="text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="notas" className="text-xs sm:text-sm">
              <FileText className="h-4 w-4 mr-1 hidden sm:inline" />
              Notas
            </TabsTrigger>
            <TabsTrigger value="pendentes" className="text-xs sm:text-sm">
              <AlertTriangle className="h-4 w-4 mr-1 hidden sm:inline" />
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="acompanhamento" className="text-xs sm:text-sm">
              <Calendar className="h-4 w-4 mr-1 hidden sm:inline" />
              Envios
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs sm:text-sm">
              <Building2 className="h-4 w-4 mr-1 hidden sm:inline" />
              Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="notas" className="mt-4">
            <NotasFiscaisTab />
          </TabsContent>
          <TabsContent value="pendentes" className="mt-4">
            <PendentesTab />
          </TabsContent>
          <TabsContent value="acompanhamento" className="mt-4">
            <AcompanhamentoTab />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <Tabs defaultValue="hospitais">
              <TabsList>
                <TabsTrigger value="hospitais">
                  <Building2 className="h-4 w-4 mr-1" />
                  Hospitais
                </TabsTrigger>
                <TabsTrigger value="convenios">
                  <Users className="h-4 w-4 mr-1" />
                  Convênios
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hospitais" className="mt-4">
                <HospitaisTab />
              </TabsContent>
              <TabsContent value="convenios" className="mt-4">
                <ConveniosNfseTab />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
