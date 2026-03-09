import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { AutocompleteCodigoItem } from "@/components/AutocompleteCodigoItem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ChevronLeft, PlusCircle, Trash2, CheckCircle2, Loader2, Save, Package, Eye,
  ThumbsUp, ThumbsDown, AlertTriangle, Info, XCircle, BookOpen, Building2
} from "lucide-react";

export default function EditarPadrao() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/editar-padrao/:id");
  const padraoId = params?.id ? Number(params.id) : null;
  const estabelecimentoId = estabelecimentoAtual?.id || 1;

  // Estado
  const [itens, setItens] = useState<any[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [selectedConvenioId, setSelectedConvenioId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  // Query de convênios cadastrados
  const conveniosSafatle = trpc.convenioMapeamento.conveniosSafatle.useQuery({ estabelecimentoId });

  // Buscar detalhes do padrão
  const padraoDetalhes = trpc.padroesCobranca.getPadraoDetalhes.useQuery(
    { id: padraoId! },
    { enabled: !!padraoId }
  );

  // Carregar itens quando os dados chegarem
  useEffect(() => {
    if (padraoDetalhes.data && !loaded) {
      const padrao = padraoDetalhes.data.padrao;
      const itensRaw = Array.isArray(padrao.itensAssociados)
        ? padrao.itensAssociados
        : (typeof padrao.itensAssociados === "string" ? JSON.parse(padrao.itensAssociados) : []);
      setItens(itensRaw.map((i: any) => ({ ...i })));
      setObservacoes((padrao as any).observacoes || padrao.observacoesValidacao || "");
      setSelectedConvenioId(padrao.convenioId ? String(padrao.convenioId) : "");
      setLoaded(true);
    }
  }, [padraoDetalhes.data, loaded]);

  // Mutations
  const editarPadrao = trpc.padroesCobranca.editarPadrao.useMutation({
    onSuccess: () => {
      toast.success("Padrão salvo e aprovado com sucesso!");
      handleVoltar();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const validarPadrao = trpc.padroesCobranca.validarPadrao.useMutation({
    onSuccess: () => {
      toast.success("Ação realizada com sucesso!");
      handleVoltar();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Helpers
  const addItem = () => {
    setItens([...itens, { codigo: "", descricao: "", tipo: "MAT_MED", frequencia: 100, quantidadeMedia: 1, quantidadeMin: 1, quantidadeMax: 1, valorMedio: 0 }]);
  };

  const removeItem = (idx: number) => {
    setItens(itens.filter((_, i) => i !== idx));
  };

  const handleSalvar = () => {
    if (!padraoId) return;
    editarPadrao.mutate({
      id: padraoId,
      convenioId: selectedConvenioId ? Number(selectedConvenioId) : null,
      itensAssociados: itens.map(item => ({
        ...item,
        quantidadeMedia: ((item.quantidadeMin ?? item.quantidadeMedia ?? 1) + (item.quantidadeMax ?? item.quantidadeMedia ?? 1)) / 2,
        quantidadeMin: item.quantidadeMin ?? item.quantidadeMedia ?? 1,
        quantidadeMax: item.quantidadeMax ?? item.quantidadeMedia ?? 1,
      })),
    });
  };

  const handleVoltar = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/padroes-cobranca");
    }
  };

  const formatCurrency = (val: string | number | null) => {
    const num = parseFloat(String(val || "0"));
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const padrao = padraoDetalhes.data?.padrao;
  const feedbacks = padraoDetalhes.data?.feedbacks || [];

  const statusBadge = (status: string, isGabarito?: number) => {
    if (isGabarito === 1) return <Badge className="bg-blue-600/20 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1"><BookOpen className="h-3 w-3" />Gabarito</Badge>;
    const config: Record<string, string> = {
      ativo: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
      aprendendo: "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
      revisao: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
      inativo: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    };
    return <Badge variant="outline" className={config[status] || config.aprendendo}>{status}</Badge>;
  };

  const confiancaBadge = (valor: number) => {
    if (valor >= 85) return <Badge variant="outline" className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">{valor}%</Badge>;
    if (valor >= 55) return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">{valor}%</Badge>;
    return <Badge variant="outline" className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">{valor}%</Badge>;
  };

  if (padraoDetalhes.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!padrao) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <p className="text-lg">Padrão não encontrado</p>
          <Button variant="outline" onClick={handleVoltar}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleVoltar}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              Editar Padrão
            </h1>
            <p className="text-muted-foreground">Ajuste as quantidades, frequências ou remova itens. Ao salvar, o padrão será aprovado automaticamente.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-1 text-green-600 dark:text-green-400" onClick={() => validarPadrao.mutate({ id: padraoId!, acao: "aprovar", observacoes })} disabled={validarPadrao.isPending}>
              <ThumbsUp className="h-4 w-4" /> Aprovar
            </Button>
            <Button variant="outline" className="gap-1 text-yellow-600 dark:text-yellow-400" onClick={() => validarPadrao.mutate({ id: padraoId!, acao: "revisao", observacoes })} disabled={validarPadrao.isPending}>
              <Eye className="h-4 w-4" /> Revisão
            </Button>
            <Button variant="outline" className="gap-1 text-red-600 dark:text-red-400" onClick={() => validarPadrao.mutate({ id: padraoId!, acao: "rejeitar", observacoes })} disabled={validarPadrao.isPending}>
              <ThumbsDown className="h-4 w-4" /> Rejeitar
            </Button>
          </div>
        </div>

        {/* Info do Padrão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informações do Padrão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Código</Label>
                <p className="font-mono font-semibold">{padrao.codigoProcedimentoPrincipal}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <p className="font-medium">{padrao.descricaoProcedimentoPrincipal}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status / Confiança</Label>
                <div className="flex items-center gap-2 mt-1">
                  {statusBadge(padrao.status, padrao.isGabarito)}
                  {confiancaBadge(padrao.confianca || 0)}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ocorrências / Valor Médio</Label>
                <p className="text-sm">{padrao.totalOcorrencias} ocorrências | {formatCurrency(padrao.valorMedioConta)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Convênio</Label>
                <Select value={selectedConvenioId} onValueChange={(v) => setSelectedConvenioId(v === "todos" ? "" : v)}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {(conveniosSafatle.data as any[])?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}{c.codigo ? ` (${c.codigo})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Itens do Padrão */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Itens do Padrão ({itens.length})
                </CardTitle>
                <CardDescription>Adicione, edite ou remova itens do padrão. Use o autocomplete para buscar códigos.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={addItem}>
                <PlusCircle className="h-4 w-4" /> Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header da tabela */}
              <div className="grid grid-cols-[minmax(180px,2fr)_minmax(250px,4fr)_minmax(120px,1.5fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_50px] gap-3 p-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
                <div>Código</div>
                <div>Descrição</div>
                <div>Tipo</div>
                <div>Freq %</div>
                <div>Qtd Mín</div>
                <div>Qtd Máx</div>
                <div>Valor</div>
                <div className="text-center">Ação</div>
              </div>
              {/* Linhas dos itens */}
              <div className="divide-y divide-border">
                {itens.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(180px,2fr)_minmax(250px,4fr)_minmax(120px,1.5fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_50px] gap-3 items-center p-3 hover:bg-muted/20 transition-colors">
                    <div>
                      <AutocompleteCodigoItem
                        estabelecimentoId={estabelecimentoId}
                        value={item.codigo}
                        onChange={(selected) => {
                          const newItens = [...itens];
                          newItens[idx] = {
                            ...newItens[idx],
                            codigo: selected.codigo,
                            descricao: selected.descricao,
                            tipo: selected.tipo || newItens[idx].tipo,
                            quantidadeMin: Math.max(1, Math.floor(selected.quantidadeMedia * 0.5)),
                            quantidadeMax: Math.max(1, Math.ceil(selected.quantidadeMedia * 1.5)),
                            valorMedio: selected.valorMedio || newItens[idx].valorMedio,
                          };
                          setItens(newItens);
                        }}
                        onChangeRaw={(val) => {
                          const newItens = [...itens];
                          newItens[idx].codigo = val;
                          setItens(newItens);
                        }}
                        placeholder="Buscar código..."
                      />
                    </div>
                    <div>
                      <Input value={item.descricao} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].descricao = e.target.value;
                        setItens(newItens);
                      }} placeholder="Descrição" className="h-9 text-sm" />
                    </div>
                    <div>
                      <Select value={item.tipo || "MAT_MED"} onValueChange={(v) => {
                        const newItens = [...itens];
                        newItens[idx].tipo = v;
                        setItens(newItens);
                      }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAT_MED">Mat/Med</SelectItem>
                          <SelectItem value="PROCEDIMENTO">Procedimento</SelectItem>
                          <SelectItem value="TAXA">Taxa</SelectItem>
                          <SelectItem value="DIARIA">Diária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Input type="number" min={0} max={100} value={item.frequencia} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].frequencia = Number(e.target.value);
                        setItens(newItens);
                      }} className="h-9 text-sm" />
                    </div>
                    <div>
                      <Input type="number" min={0} step={0.1} value={item.quantidadeMin ?? item.quantidadeMedia ?? 1} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].quantidadeMin = Number(e.target.value);
                        setItens(newItens);
                      }} placeholder="Mín" className="h-9 text-sm" />
                    </div>
                    <div>
                      <Input type="number" min={0} step={0.1} value={item.quantidadeMax ?? item.quantidadeMedia ?? 1} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].quantidadeMax = Number(e.target.value);
                        setItens(newItens);
                      }} placeholder="Máx" className="h-9 text-sm" />
                    </div>
                    <div>
                      <span className="text-sm text-green-600 dark:text-green-400 font-medium">{item.valorMedio ? formatCurrency(item.valorMedio) : "-"}</span>
                    </div>
                    <div className="flex justify-center">
                      <Button size="sm" variant="ghost" className="text-red-500 h-9 w-9 p-0" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feedbacks Anteriores */}
        {feedbacks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feedbacks Anteriores ({feedbacks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {feedbacks.map((fb: any) => (
                  <div key={fb.id} className="text-sm p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={fb.decisao === "aceitar" ? "text-green-600 dark:text-green-400" : fb.decisao === "rejeitar" ? "text-red-600 dark:text-red-400" : "text-gray-500"}>
                        {fb.decisao}
                      </Badge>
                      <span className="text-muted-foreground">{fb.tipoDivergencia}</span>
                      <span className="text-muted-foreground ml-auto">{fb.usuarioNome}</span>
                    </div>
                    {fb.justificativa && <p className="mt-1 italic text-muted-foreground">{fb.justificativa}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Observações (opcional)</CardTitle>
            <CardDescription>Justificativa para a decisão ou notas adicionais.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Justificativa para a decisão..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Footer com botões */}
        <div className="flex items-center justify-between pb-8">
          <Button variant="outline" onClick={handleVoltar}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-1 text-green-600 dark:text-green-400" onClick={() => validarPadrao.mutate({ id: padraoId!, acao: "aprovar", observacoes })} disabled={validarPadrao.isPending}>
              <ThumbsUp className="h-4 w-4" /> Aprovar
            </Button>
            <Button variant="outline" className="gap-1 text-red-600 dark:text-red-400" onClick={() => validarPadrao.mutate({ id: padraoId!, acao: "rejeitar", observacoes })} disabled={validarPadrao.isPending}>
              <ThumbsDown className="h-4 w-4" /> Rejeitar
            </Button>
            <Button onClick={handleSalvar} disabled={editarPadrao.isPending} className="gap-2" size="lg">
              {editarPadrao.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar e Aprovar
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
