import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Save, Copy, Search, ArrowLeft, CheckCircle } from "lucide-react";

export default function DigitacaoGuiaSadt() {
  const [estabelecimentoId, setEstabelecimentoId] = useState<number | null>(null);
  const [convenioId, setConvenioId] = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [guiaAberta, setGuiaAberta] = useState<number | null>(null);
  const [showNovaGuia, setShowNovaGuia] = useState(false);

  const { data: estabelecimentos } = trpc.faturamentoUnificado.estabelecimentos.useQuery();
  const { data: convenios } = trpc.faturamentoUnificado.conveniosEstabelecimento.useQuery(
    { estabelecimentoId: estabelecimentoId! },
    { enabled: !!estabelecimentoId }
  );

  const { data: guiasData, refetch: refetchGuias } = trpc.faturamentoDigitacao.listarGuias.useQuery(
    {
      estabelecimentoId: estabelecimentoId!,
      tipoGuia: "sadt",
      status: filtroStatus !== "todos" ? filtroStatus as any : undefined,
      convenioId: convenioId || undefined,
      busca: busca || undefined,
    },
    { enabled: !!estabelecimentoId }
  );

  const excluirGuiaMutation = trpc.faturamentoDigitacao.excluirGuia.useMutation({
    onSuccess: () => { toast.success("Guia excluída"); refetchGuias(); },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicarGuiaMutation = trpc.faturamentoDigitacao.duplicarGuia.useMutation({
    onSuccess: (data: any) => { toast.success("Guia duplicada"); refetchGuias(); setGuiaAberta(data.id); },
    onError: (e: any) => toast.error(e.message),
  });

  if (guiaAberta) {
    return <FormularioGuiaSadt guiaId={guiaAberta} estabelecimentoId={estabelecimentoId!} onVoltar={() => { setGuiaAberta(null); refetchGuias(); }} />;
  }

  if (showNovaGuia) {
    return <FormularioGuiaSadt guiaId={null} estabelecimentoId={estabelecimentoId!} convenioIdInicial={convenioId || undefined} onVoltar={() => { setShowNovaGuia(false); refetchGuias(); }} />;
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Digitação de Guias - SP/SADT</h1>
            <p className="text-muted-foreground text-sm">Crie e gerencie guias de faturamento SP/SADT</p>
          </div>
          <Button onClick={() => setShowNovaGuia(true)} disabled={!estabelecimentoId}>
            <Plus className="w-4 h-4 mr-2" /> Nova Guia SADT
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Estabelecimento</Label>
                <Select value={estabelecimentoId?.toString() || ""} onValueChange={(v) => setEstabelecimentoId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {estabelecimentos?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Convênio</Label>
                <Select value={convenioId?.toString() || "todos"} onValueChange={(v) => setConvenioId(v === "todos" ? null : Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {convenios?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="finalizada">Finalizada</SelectItem>
                    <SelectItem value="em_lote">Em Lote</SelectItem>
                    <SelectItem value="enviada">Enviada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Busca</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Paciente, guia, carteirinha..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guia</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Carteirinha</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Convênio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guiasData?.guias?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {estabelecimentoId ? "Nenhuma guia encontrada. Clique em 'Nova Guia SADT' para começar." : "Selecione um estabelecimento para ver as guias."}
                    </TableCell>
                  </TableRow>
                )}
                {guiasData?.guias?.map((guia: any) => (
                  <TableRow key={guia.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setGuiaAberta(guia.id)}>
                    <TableCell className="font-mono text-xs">{guia.numeroGuiaPrestador || `#${guia.id}`}</TableCell>
                    <TableCell className="font-medium">{guia.nomePaciente}</TableCell>
                    <TableCell className="text-xs">{guia.carteirinha || "-"}</TableCell>
                    <TableCell className="text-xs">{guia.dataAtendimento ? new Date(guia.dataAtendimento).toLocaleDateString('pt-BR') : "-"}</TableCell>
                    <TableCell className="text-xs">{convenios?.find((c: any) => c.id === guia.convenioId)?.nome || "-"}</TableCell>
                    <TableCell className="text-right font-mono">R$ {Number(guia.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={guia.status === "finalizada" ? "default" : guia.status === "em_lote" ? "secondary" : guia.status === "enviada" ? "outline" : "destructive"}>
                        {guia.status === "rascunho" ? "Rascunho" : guia.status === "finalizada" ? "Finalizada" : guia.status === "em_lote" ? "Em Lote" : "Enviada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicarGuiaMutation.mutate({ guiaId: guia.id })} title="Duplicar">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {(guia.status === "rascunho" || guia.status === "finalizada") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                            if (confirm("Excluir esta guia?")) excluirGuiaMutation.mutate({ guiaId: guia.id });
                          }} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {guiasData?.total ? (
          <p className="text-xs text-muted-foreground text-right">{guiasData.total} guia(s) encontrada(s)</p>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function FormularioGuiaSadt({ guiaId, estabelecimentoId, convenioIdInicial, onVoltar }: {
  guiaId: number | null;
  estabelecimentoId: number;
  convenioIdInicial?: number;
  onVoltar: () => void;
}) {
  const isEdicao = guiaId !== null;
  const { data: guiaExistente, refetch: refetchGuia } = trpc.faturamentoDigitacao.obterGuia.useQuery(
    { guiaId: guiaId! },
    { enabled: isEdicao }
  );
  const { data: convenios } = trpc.faturamentoUnificado.conveniosEstabelecimento.useQuery({ estabelecimentoId });

  const [formData, setFormData] = useState<any>({
    convenioId: convenioIdInicial || null,
    nomePaciente: "",
    carteirinha: "",
    numeroGuiaPrestador: "",
    numeroGuiaOperadora: "",
    senha: "",
    dataAtendimento: "",
    nomeSolicitante: "",
    conselhoProfSolicitante: "CRM",
    numeroConselhoProfSolicitante: "",
    ufConselhoProfSolicitante: "",
    nomeExecutante: "",
    conselhoProfExecutante: "CRM",
    numeroConselhoProfExecutante: "",
    ufConselhoProfExecutante: "",
    indicacaoClinica: "",
    observacoes: "",
  });

  const [itens, setItens] = useState<any[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [formLoaded, setFormLoaded] = useState(!isEdicao);

  useMemo(() => {
    if (guiaExistente && !formLoaded) {
      setFormData({
        convenioId: guiaExistente.convenioId,
        nomePaciente: guiaExistente.nomePaciente || "",
        carteirinha: guiaExistente.carteirinha || "",
        numeroGuiaPrestador: guiaExistente.numeroGuiaPrestador || "",
        numeroGuiaOperadora: guiaExistente.numeroGuiaOperadora || "",
        senha: guiaExistente.senha || "",
        dataAtendimento: guiaExistente.dataAtendimento || "",
        nomeSolicitante: guiaExistente.nomeSolicitante || "",
        conselhoProfSolicitante: guiaExistente.conselhoProfSolicitante || "CRM",
        numeroConselhoProfSolicitante: guiaExistente.numeroConselhoProfSolicitante || "",
        ufConselhoProfSolicitante: guiaExistente.ufConselhoProfSolicitante || "",
        nomeExecutante: guiaExistente.nomeExecutante || "",
        conselhoProfExecutante: guiaExistente.conselhoProfExecutante || "CRM",
        numeroConselhoProfExecutante: guiaExistente.numeroConselhoProfExecutante || "",
        ufConselhoProfExecutante: guiaExistente.ufConselhoProfExecutante || "",
        indicacaoClinica: guiaExistente.indicacaoClinica || "",
        observacoes: guiaExistente.observacoes || "",
      });
      setItens(guiaExistente.itens || []);
      setFormLoaded(true);
    }
  }, [guiaExistente, formLoaded]);

  const criarGuiaMutation = trpc.faturamentoDigitacao.criarGuia.useMutation({
    onSuccess: (data: any) => { toast.success("Guia criada!"); onVoltar(); },
    onError: (e: any) => toast.error(e.message),
  });

  const atualizarGuiaMutation = trpc.faturamentoDigitacao.atualizarGuia.useMutation({
    onSuccess: () => toast.success("Guia salva!"),
    onError: (e: any) => toast.error(e.message),
  });

  const removerItemMutation = trpc.faturamentoDigitacao.removerItem.useMutation({
    onSuccess: () => { toast.success("Item removido"); refetchGuia(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSalvar = (status: "rascunho" | "finalizada" = "rascunho") => {
    if (!formData.convenioId) { toast.error("Selecione um convênio"); return; }
    if (!formData.nomePaciente) { toast.error("Informe o nome do paciente"); return; }

    if (isEdicao) {
      atualizarGuiaMutation.mutate({ guiaId: guiaId!, ...formData, status });
    } else {
      criarGuiaMutation.mutate({ estabelecimentoId, tipoGuia: "sadt", ...formData, status });
    }
  };

  const valorTotal = itens.reduce((sum: number, item: any) => sum + Number(item.valorTotal || 0), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onVoltar}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-xl font-bold">{isEdicao ? "Editar Guia SP/SADT" : "Nova Guia SP/SADT"}</h1>
              {isEdicao && <p className="text-xs text-muted-foreground">Guia #{guiaId}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSalvar("rascunho")}><Save className="w-4 h-4 mr-2" /> Salvar Rascunho</Button>
            <Button onClick={() => handleSalvar("finalizada")}><CheckCircle className="w-4 h-4 mr-2" /> Finalizar Guia</Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Dados da Guia e Beneficiário</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Convênio *</Label>
                <Select value={formData.convenioId?.toString() || ""} onValueChange={(v) => setFormData({ ...formData, convenioId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {convenios?.map((c: any) => (<SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nº Guia Prestador</Label>
                <Input value={formData.numeroGuiaPrestador} onChange={(e) => setFormData({ ...formData, numeroGuiaPrestador: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Nº Guia Operadora</Label>
                <Input value={formData.numeroGuiaOperadora} onChange={(e) => setFormData({ ...formData, numeroGuiaOperadora: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Senha</Label>
                <Input value={formData.senha} onChange={(e) => setFormData({ ...formData, senha: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Nome do Paciente *</Label>
                <Input value={formData.nomePaciente} onChange={(e) => setFormData({ ...formData, nomePaciente: e.target.value })} placeholder="Nome completo do beneficiário" />
              </div>
              <div>
                <Label className="text-xs">Carteirinha</Label>
                <Input value={formData.carteirinha} onChange={(e) => setFormData({ ...formData, carteirinha: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Data Atendimento</Label>
                <Input type="date" value={formData.dataAtendimento} onChange={(e) => setFormData({ ...formData, dataAtendimento: e.target.value })} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Profissional Solicitante</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label className="text-xs">Nome</Label>
                <Input value={formData.nomeSolicitante} onChange={(e) => setFormData({ ...formData, nomeSolicitante: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Conselho</Label>
                <Select value={formData.conselhoProfSolicitante} onValueChange={(v) => setFormData({ ...formData, conselhoProfSolicitante: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRM">CRM</SelectItem>
                    <SelectItem value="CRO">CRO</SelectItem>
                    <SelectItem value="CREFITO">CREFITO</SelectItem>
                    <SelectItem value="COREN">COREN</SelectItem>
                    <SelectItem value="CRF">CRF</SelectItem>
                    <SelectItem value="CRP">CRP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nº Conselho</Label>
                <Input value={formData.numeroConselhoProfSolicitante} onChange={(e) => setFormData({ ...formData, numeroConselhoProfSolicitante: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={formData.ufConselhoProfSolicitante} onChange={(e) => setFormData({ ...formData, ufConselhoProfSolicitante: e.target.value })} maxLength={2} placeholder="GO" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Profissional Executante</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label className="text-xs">Nome</Label>
                <Input value={formData.nomeExecutante} onChange={(e) => setFormData({ ...formData, nomeExecutante: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Conselho</Label>
                <Select value={formData.conselhoProfExecutante} onValueChange={(v) => setFormData({ ...formData, conselhoProfExecutante: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRM">CRM</SelectItem>
                    <SelectItem value="CRO">CRO</SelectItem>
                    <SelectItem value="CREFITO">CREFITO</SelectItem>
                    <SelectItem value="COREN">COREN</SelectItem>
                    <SelectItem value="CRF">CRF</SelectItem>
                    <SelectItem value="CRP">CRP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nº Conselho</Label>
                <Input value={formData.numeroConselhoProfExecutante} onChange={(e) => setFormData({ ...formData, numeroConselhoProfExecutante: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input value={formData.ufConselhoProfExecutante} onChange={(e) => setFormData({ ...formData, ufConselhoProfExecutante: e.target.value })} maxLength={2} placeholder="GO" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Indicação Clínica</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={formData.indicacaoClinica} onChange={(e) => setFormData({ ...formData, indicacaoClinica: e.target.value })} placeholder="Indicação clínica / hipótese diagnóstica" rows={2} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Procedimentos / Itens</CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">Total: R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                {isEdicao && (
                  <Button size="sm" onClick={() => setShowAddItem(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item</Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead className="text-right">Vlr Unit.</TableHead>
                  <TableHead className="text-right">Vlr Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                      {isEdicao ? "Nenhum item. Clique em 'Adicionar Item'." : "Salve a guia primeiro para adicionar itens."}
                    </TableCell>
                  </TableRow>
                )}
                {itens.map((item: any, idx: number) => (
                  <TableRow key={item.id || idx}>
                    <TableCell className="text-xs text-muted-foreground">{item.sequencial || idx + 1}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{item.tipoItem === "procedimento" ? "Proc" : item.tipoItem === "material" ? "Mat" : item.tipoItem === "medicamento" ? "Med" : item.tipoItem === "taxa" ? "Taxa" : item.tipoItem === "diaria" ? "Diária" : item.tipoItem}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{item.codigoProcedimento}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{item.descricao}</TableCell>
                    <TableCell className="text-xs">{item.dataExecucao ? new Date(item.dataExecucao).toLocaleDateString('pt-BR') : "-"}</TableCell>
                    <TableCell className="text-right">{Number(item.quantidade)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">R$ {Number(item.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-mono font-medium">R$ {Number(item.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      {isEdicao && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => {
                          if (confirm("Remover este item?")) removerItemMutation.mutate({ itemId: item.id, guiaId: guiaId! });
                        }}><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} placeholder="Observações adicionais..." rows={2} />
          </CardContent>
        </Card>
      </div>

      {showAddItem && guiaId && (
        <DialogAdicionarItem guiaId={guiaId} onClose={() => setShowAddItem(false)} onAdicionado={() => { setShowAddItem(false); refetchGuia(); }} />
      )}
    </DashboardLayout>
  );
}

function DialogAdicionarItem({ guiaId, onClose, onAdicionado }: { guiaId: number; onClose: () => void; onAdicionado: () => void }) {
  const [itemData, setItemData] = useState({
    tipoItem: "procedimento" as any,
    codigoTabela: "22",
    codigoProcedimento: "",
    descricao: "",
    dataExecucao: "",
    horaInicio: "",
    horaFim: "",
    quantidade: 1,
    valorUnitario: 0,
    fatorReducao: 1,
    registroAnvisa: "",
  });

  const adicionarItemMutation = trpc.faturamentoDigitacao.adicionarItem.useMutation({
    onSuccess: () => { toast.success("Item adicionado!"); onAdicionado(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleAdicionar = () => {
    if (!itemData.codigoProcedimento) { toast.error("Informe o código do procedimento"); return; }
    if (!itemData.descricao) { toast.error("Informe a descrição"); return; }
    adicionarItemMutation.mutate({ guiaId, ...itemData });
  };

  const valorTotal = itemData.quantidade * itemData.valorUnitario * itemData.fatorReducao;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={itemData.tipoItem} onValueChange={(v) => setItemData({ ...itemData, tipoItem: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="procedimento">Procedimento</SelectItem>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="medicamento">Medicamento</SelectItem>
                <SelectItem value="taxa">Taxa</SelectItem>
                <SelectItem value="diaria">Diária</SelectItem>
                <SelectItem value="opme">OPME</SelectItem>
                <SelectItem value="gases">Gases</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tabela</Label>
            <Select value={itemData.codigoTabela} onValueChange={(v) => setItemData({ ...itemData, codigoTabela: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="22">22 - TUSS</SelectItem>
                <SelectItem value="18">18 - Mat SIMPRO</SelectItem>
                <SelectItem value="19">19 - Med SIMPRO</SelectItem>
                <SelectItem value="20">20 - Brasíndice</SelectItem>
                <SelectItem value="00">00 - Própria</SelectItem>
                <SelectItem value="90">90 - AMB</SelectItem>
                <SelectItem value="98">98 - CBHPM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Código *</Label>
            <Input value={itemData.codigoProcedimento} onChange={(e) => setItemData({ ...itemData, codigoProcedimento: e.target.value })} placeholder="Ex: 20104219" />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Descrição *</Label>
            <Input value={itemData.descricao} onChange={(e) => setItemData({ ...itemData, descricao: e.target.value })} placeholder="Descrição do procedimento/material" />
          </div>
          <div>
            <Label className="text-xs">Data Execução</Label>
            <Input type="date" value={itemData.dataExecucao} onChange={(e) => setItemData({ ...itemData, dataExecucao: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Hora Início</Label>
            <Input type="time" value={itemData.horaInicio} onChange={(e) => setItemData({ ...itemData, horaInicio: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Hora Fim</Label>
            <Input type="time" value={itemData.horaFim} onChange={(e) => setItemData({ ...itemData, horaFim: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Quantidade</Label>
            <Input type="number" min={1} value={itemData.quantidade} onChange={(e) => setItemData({ ...itemData, quantidade: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Valor Unitário (R$)</Label>
            <Input type="number" step="0.01" min={0} value={itemData.valorUnitario} onChange={(e) => setItemData({ ...itemData, valorUnitario: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="text-xs">Fator Redução</Label>
            <Input type="number" step="0.01" min={0} value={itemData.fatorReducao} onChange={(e) => setItemData({ ...itemData, fatorReducao: Number(e.target.value) })} />
          </div>
          {(itemData.tipoItem === "material" || itemData.tipoItem === "opme") && (
            <div>
              <Label className="text-xs">Registro ANVISA</Label>
              <Input value={itemData.registroAnvisa} onChange={(e) => setItemData({ ...itemData, registroAnvisa: e.target.value })} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-4 border-t">
          <span className="font-semibold">Valor Total: R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleAdicionar}>Adicionar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
