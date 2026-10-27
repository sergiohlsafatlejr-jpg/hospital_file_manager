import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { AutocompleteCodigoItem } from "@/components/AutocompleteCodigoItem";
import { GrupoAlternativoFields } from "@/components/padroes/GrupoAlternativoFields";
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
  ThumbsUp, ThumbsDown, AlertTriangle, Info, XCircle, BookOpen, Building2,
  ShieldCheck, ShieldQuestion, ShieldOff, Layers
} from "lucide-react";

const CATEGORIA_CONFIG = {
  obrigatorio: { label: "Obrigatório", icon: ShieldCheck, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", badgeClass: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30" },
  condicional: { label: "Condicional", icon: ShieldQuestion, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", badgeClass: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  opcional: { label: "Opcional", icon: ShieldOff, color: "text-gray-500 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800", badgeClass: "bg-gray-500/20 text-gray-500 dark:text-gray-400 border-gray-500/30" },
};

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
  const [codigoPrincipal, setCodigoPrincipal] = useState("");
  const [descricaoPrincipal, setDescricaoPrincipal] = useState("");
  const [setorPadrao, setSetorPadrao] = useState<string | null>(null);
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
      setItens(itensRaw.map((i: any) => ({
        ...i,
        categoria: i.categoria || "obrigatorio",
        grupo: i.grupo || "",
      })));
      setObservacoes((padrao as any).observacoes || padrao.observacoesValidacao || "");
      setSelectedConvenioId(padrao.convenioId ? String(padrao.convenioId) : "");
      setCodigoPrincipal(padrao.codigoProcedimentoPrincipal || "");
      setDescricaoPrincipal(padrao.descricaoProcedimentoPrincipal || "");
      setSetorPadrao((padrao as any).setor || null);
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

  // Grupos existentes (extraídos dos itens)
  const gruposExistentes = useMemo(() => {
    const grupos = new Set<string>();
    itens.forEach(item => {
      if (item.grupo) grupos.add(item.grupo);
    });
    return Array.from(grupos).sort();
  }, [itens]);

  // Helpers
  const addItem = () => {
    setItens([...itens, { codigo: "", descricao: "", tipo: "MAT_MED", frequencia: 100, quantidadeMedia: 1, quantidadeMin: 1, quantidadeMax: 1, valorMedio: 0, categoria: "obrigatorio", grupo: "" }]);
  };

  const removeItem = (idx: number) => {
    setItens(itens.filter((_, i) => i !== idx));
  };

  const handleSalvar = () => {
    if (!padraoId) return;
    editarPadrao.mutate({
      id: padraoId,
      convenioId: selectedConvenioId ? Number(selectedConvenioId) : null,
      codigoProcedimentoPrincipal: codigoPrincipal || undefined,
      descricaoProcedimentoPrincipal: descricaoPrincipal || undefined,
      setor: setorPadrao,
      itensAssociados: itens.map(item => ({
        ...item,
        quantidadeMedia: ((item.quantidadeMin ?? item.quantidadeMedia ?? 1) + (item.quantidadeMax ?? item.quantidadeMedia ?? 1)) / 2,
        quantidadeMin: item.quantidadeMin ?? item.quantidadeMedia ?? 1,
        quantidadeMax: item.quantidadeMax ?? item.quantidadeMedia ?? 1,
        categoria: item.categoria || "obrigatorio",
        grupo: item.grupo || undefined,
        grupoAlternativo: item.grupoAlternativo?.trim() || undefined,
        grupoObrigatorio: item.grupoAlternativo?.trim() ? item.grupoObrigatorio === true : undefined,
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

  // Aplicar categoria em lote a itens selecionados por grupo
  const aplicarCategoriaGrupo = (grupo: string, categoria: string) => {
    setItens(itens.map(item => item.grupo === grupo ? { ...item, categoria } : item));
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

  // Resumo de categorias
  const resumoCategorias = useMemo(() => {
    const r = { obrigatorio: 0, condicional: 0, opcional: 0 };
    itens.forEach(item => {
      const cat = item.categoria || "obrigatorio";
      if (cat in r) r[cat as keyof typeof r]++;
    });
    return r;
  }, [itens]);

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
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Código do Procedimento</Label>
                <Input
                  value={codigoPrincipal}
                  onChange={(e) => setCodigoPrincipal(e.target.value)}
                  className="font-mono font-semibold h-9 mt-1"
                  placeholder="Ex: 31102360 + 31102050"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <Input
                  value={descricaoPrincipal}
                  onChange={(e) => setDescricaoPrincipal(e.target.value)}
                  className="font-medium h-9 mt-1"
                  placeholder="Descrição do procedimento"
                />
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
                <Label className="text-xs text-muted-foreground">Setor</Label>
                <Input
                  value={setorPadrao || ""}
                  onChange={(e) => setSetorPadrao(e.target.value || null)}
                  className="h-9 mt-1"
                  placeholder="Ex: CENTRO CIRURGICO"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Convênio</Label>
                <Select value={selectedConvenioId} onValueChange={(v) => setSelectedConvenioId(v === "todos" ? "" : v)}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="Todos os convênios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os convênios</SelectItem>
                    {(conveniosSafatle.data || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}{c.codigo ? ` (${c.codigo})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legenda de Categorias e Grupos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5" />
              Categorias e Grupos de Itens
            </CardTitle>
            <CardDescription>
              Defina a obrigatoriedade de cada item e agrupe itens condicionais para controlar alertas de itens faltantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <div key={key} className={`rounded-lg border p-3 ${cfg.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                      <Badge variant="outline" className={cfg.badgeClass}>{resumoCategorias[key as keyof typeof resumoCategorias]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {key === "obrigatorio" && "Sempre deve estar presente. Gera alerta CRÍTICO se faltar."}
                      {key === "condicional" && "Depende do caso. Se algum item do GRUPO estiver na conta, todos do grupo são cobrados."}
                      {key === "opcional" && "Pode ou não aparecer. NÃO gera alerta se faltar."}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Grupos existentes */}
            {gruposExistentes.length > 0 && (
              <div className="mt-3">
                <Label className="text-xs text-muted-foreground mb-2 block">Grupos definidos:</Label>
                <div className="flex flex-wrap gap-2">
                  {gruposExistentes.map(grupo => {
                    const count = itens.filter(i => i.grupo === grupo).length;
                    return (
                      <Badge key={grupo} variant="outline" className="gap-1 bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">
                        <Layers className="h-3 w-3" />
                        {grupo} ({count} itens)
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Itens do Padrão */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Itens definidos no gabarito ({itens.length})
                </CardTitle>
                <CardDescription>Adicione, edite ou remova itens do padrão. Defina a categoria e grupo de cada item.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={addItem}>
                <PlusCircle className="h-4 w-4" /> Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header da tabela */}
              <div className="grid grid-cols-[minmax(120px,1fr)_minmax(80px,0.8fr)_minmax(180px,2fr)_minmax(200px,3fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(80px,1fr)_minmax(120px,1.2fr)_40px] gap-2 p-3 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                <div>Categoria</div>
                <div>Grupo</div>
                <div>Código</div>
                <div>Descrição</div>
                <div>Tipo</div>
                <div>Freq%</div>
                <div>Mín</div>
                <div>Máx</div>
                <div>Valor</div>
                <div>Ações</div>
                <div></div>
              </div>
              {/* Linhas dos itens */}
              <div className="divide-y divide-border">
                {itens.map((item, idx) => {
                  const catConfig = CATEGORIA_CONFIG[item.categoria as keyof typeof CATEGORIA_CONFIG] || CATEGORIA_CONFIG.obrigatorio;
                  const CatIcon = catConfig.icon;
                  return (
                    <div key={idx} className={`grid grid-cols-[minmax(120px,1fr)_minmax(80px,0.8fr)_minmax(180px,2fr)_minmax(200px,3fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(60px,0.6fr)_minmax(80px,1fr)_minmax(120px,1.2fr)_40px] gap-2 items-center p-2 hover:bg-muted/20 transition-colors ${item.categoria === 'opcional' ? 'opacity-60' : ''}`}>
                      {/* Categoria */}
                      <div>
                        <Select value={item.categoria || "obrigatorio"} onValueChange={(v) => {
                          const newItens = [...itens];
                          newItens[idx].categoria = v;
                          if (v !== "condicional") {
                            newItens[idx].grupo = "";
                          }
                          setItens(newItens);
                        }}>
                          <SelectTrigger className={`h-8 text-xs ${catConfig.color}`}>
                            <div className="flex items-center gap-1">
                              <CatIcon className="h-3 w-3" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="obrigatorio">
                              <div className="flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3 text-red-500" /> Obrigatório
                              </div>
                            </SelectItem>
                            <SelectItem value="condicional">
                              <div className="flex items-center gap-1">
                                <ShieldQuestion className="h-3 w-3 text-amber-500" /> Condicional
                              </div>
                            </SelectItem>
                            <SelectItem value="opcional">
                              <div className="flex items-center gap-1">
                                <ShieldOff className="h-3 w-3 text-gray-400" /> Opcional
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Grupo */}
                      <div>
                        {item.categoria === "condicional" ? (
                          <Input
                            value={item.grupo || ""}
                            onChange={(e) => {
                              const newItens = [...itens];
                              newItens[idx].grupo = e.target.value;
                              setItens(newItens);
                            }}
                            placeholder="Grupo"
                            className="h-8 text-xs"
                            list="grupos-list"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                      {/* Código */}
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
                      {/* Descrição */}
                      <div>
                        <Input value={item.descricao} onChange={(e) => {
                          const newItens = [...itens];
                          newItens[idx].descricao = e.target.value;
                          setItens(newItens);
                        }} placeholder="Descrição" className="h-8 text-xs" />
                      </div>
                      {/* Tipo */}
                      <div>
                        <Select value={item.tipo || "MAT_MED"} onValueChange={(v) => {
                          const newItens = [...itens];
                          newItens[idx].tipo = v;
                          setItens(newItens);
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MAT_MED">Mat/Med</SelectItem>
                            <SelectItem value="PROCEDIMENTO">Proced.</SelectItem>
                            <SelectItem value="TAXA">Taxa</SelectItem>
                            <SelectItem value="DIARIA">Diária</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Frequência */}
                      <div>
                        <Input type="number" min={0} max={100} value={item.frequencia} onChange={(e) => {
                          const newItens = [...itens];
                          newItens[idx].frequencia = Number(e.target.value);
                          setItens(newItens);
                        }} className="h-8 text-xs" />
                      </div>
                      {/* Qtd Mín */}
                      <div>
                        <Input type="number" min={0} step={0.1} value={item.quantidadeMin ?? item.quantidadeMedia ?? 1} onChange={(e) => {
                          const newItens = [...itens];
                          newItens[idx].quantidadeMin = Number(e.target.value);
                          setItens(newItens);
                        }} className="h-8 text-xs" />
                      </div>
                      {/* Qtd Máx */}
                      <div>
                        <Input type="number" min={0} step={0.1} value={item.quantidadeMax ?? item.quantidadeMedia ?? 1} onChange={(e) => {
                          const newItens = [...itens];
                          newItens[idx].quantidadeMax = Number(e.target.value);
                          setItens(newItens);
                        }} className="h-8 text-xs" />
                      </div>
                      {/* Valor */}
                      <div className="w-24">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.valorMedio || ""}
                          placeholder="R$ 0,00"
                          onChange={(e) => {
                            const newItens = [...itens];
                            newItens[idx].valorMedio = Number(e.target.value);
                            setItens(newItens);
                          }}
                          className="h-8 text-xs text-green-600 dark:text-green-400"
                        />
                      </div>
                      {/* Ações rápidas de categoria */}
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={item.categoria === "obrigatorio" ? "default" : "ghost"}
                          className={`h-7 w-7 p-0 ${item.categoria === "obrigatorio" ? "bg-red-500 hover:bg-red-600" : "text-red-400 hover:text-red-500"}`}
                          onClick={() => {
                            const newItens = [...itens];
                            newItens[idx].categoria = "obrigatorio";
                            newItens[idx].grupo = "";
                            setItens(newItens);
                          }}
                          title="Obrigatório"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={item.categoria === "condicional" ? "default" : "ghost"}
                          className={`h-7 w-7 p-0 ${item.categoria === "condicional" ? "bg-amber-500 hover:bg-amber-600" : "text-amber-400 hover:text-amber-500"}`}
                          onClick={() => {
                            const newItens = [...itens];
                            newItens[idx].categoria = "condicional";
                            setItens(newItens);
                          }}
                          title="Condicional"
                        >
                          <ShieldQuestion className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={item.categoria === "opcional" ? "default" : "ghost"}
                          className={`h-7 w-7 p-0 ${item.categoria === "opcional" ? "bg-gray-500 hover:bg-gray-600" : "text-gray-400 hover:text-gray-500"}`}
                          onClick={() => {
                            const newItens = [...itens];
                            newItens[idx].categoria = "opcional";
                            newItens[idx].grupo = "";
                            setItens(newItens);
                          }}
                          title="Opcional"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {/* Remover */}
                      <div className="flex justify-center">
                        <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="col-span-full rounded-md border border-dashed bg-muted/20 p-2">
                        <GrupoAlternativoFields
                          id={`editar-item-${idx}`}
                          value={{ grupoAlternativo: item.grupoAlternativo, grupoObrigatorio: item.grupoObrigatorio }}
                          onChange={(next) => {
                            const newItens = [...itens];
                            newItens[idx] = { ...newItens[idx], ...next };
                            setItens(newItens);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Datalist para sugestão de grupos */}
            <datalist id="grupos-list">
              {gruposExistentes.map(g => <option key={g} value={g} />)}
            </datalist>
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
