import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, Search } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function FaturamentoGuiaEditor() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const isEditing = !!params.id;
  const guiaId = params.id ? Number(params.id) : null;

  // Form state
  const [tipoGuia, setTipoGuia] = useState<"sadt" | "internacao">("sadt");
  const [estabelecimentoId, setEstabelecimentoId] = useState<number | undefined>();
  const [convenioId, setConvenioId] = useState<number | undefined>();
  const [nomePaciente, setNomePaciente] = useState("");
  const [carteirinha, setCarteirinha] = useState("");
  const [dataAtendimento, setDataAtendimento] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [numeroGuiaPrestador, setNumeroGuiaPrestador] = useState("");
  const [numeroGuiaOperadora, setNumeroGuiaOperadora] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeSolicitante, setNomeSolicitante] = useState("");
  const [conselhoProfSolicitante, setConselhoProfSolicitante] = useState("");
  const [numeroConselhoProfSolicitante, setNumeroConselhoProfSolicitante] = useState("");
  const [ufConselhoProfSolicitante, setUfConselhoProfSolicitante] = useState("");
  const [cbosConselhoProfSolicitante, setCbosConselhoProfSolicitante] = useState("");
  const [nomeExecutante, setNomeExecutante] = useState("");
  const [conselhoProfExecutante, setConselhoProfExecutante] = useState("");
  const [numeroConselhoProfExecutante, setNumeroConselhoProfExecutante] = useState("");
  const [ufConselhoProfExecutante, setUfConselhoProfExecutante] = useState("");
  const [cbosConselhoProfExecutante, setCbosConselhoProfExecutante] = useState("");
  const [caraterAtendimento, setCaraterAtendimento] = useState<"eletivo" | "urgencia">("eletivo");
  const [tipoInternacao, setTipoInternacao] = useState("");
  const [regimeInternacao, setRegimeInternacao] = useState("");
  const [cid10Principal, setCid10Principal] = useState("");
  const [cid10Secundario, setCid10Secundario] = useState("");
  const [indicacaoClinica, setIndicacaoClinica] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [tipoServico, setTipoServico] = useState("");

  // Item dialog
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [itemTipo, setItemTipo] = useState<string>("procedimento");
  const [itemCodigo, setItemCodigo] = useState("");
  const [itemDescricao, setItemDescricao] = useState("");
  const [itemDataExecucao, setItemDataExecucao] = useState("");
  const [itemQtd, setItemQtd] = useState("1");
  const [itemValorUnit, setItemValorUnit] = useState("0");
  const [itemValorTotal, setItemValorTotal] = useState("0");
  const [itemCodigoTabela, setItemCodigoTabela] = useState("22");
  const [itemViaAcesso, setItemViaAcesso] = useState("");
  const [itemTecnica, setItemTecnica] = useState("");
  const [itemGrauParticipacao, setItemGrauParticipacao] = useState("");
  const [buscaTuss, setBuscaTuss] = useState("");
  const [buscaTabPreco, setBuscaTabPreco] = useState("");
  const [fonteBusca, setFonteBusca] = useState<"tuss" | "tabela_preco">("tabela_preco");

  // Queries
  const { data: estabelecimentos } = trpc.estabelecimentos.list.useQuery();
  const { data: convenios } = trpc.convenios.list.useQuery(
    { ativo: "sim" }
  );
  const { data: guiaData, refetch: refetchGuia } = trpc.faturamentoDigitacao.obterGuia.useQuery(
    { id: guiaId! },
    { enabled: !!guiaId }
  );
  const { data: resultadosTuss } = trpc.faturamentoDigitacao.buscarProcedimentoTuss.useQuery(
    { busca: buscaTuss },
    { enabled: buscaTuss.length >= 2 && fonteBusca === "tuss" }
  );

  // Mapeamento de tipo de item para tipo da tabela de preço
  const mapTipoParaTabela = (tipo: string): "procedimentos" | "mat_med" | "taxas" | "diarias" | undefined => {
    switch (tipo) {
      case "procedimento": return "procedimentos";
      case "material": case "medicamento": case "opme": case "gases": return "mat_med";
      case "taxa": return "taxas";
      case "diaria": return "diarias";
      default: return undefined;
    }
  };

  const { data: resultadosTabPreco } = trpc.faturamentoDigitacao.buscarItemTabelaPreco.useQuery(
    {
      convenioId: convenioId!,
      estabelecimentoId,
      tipo: mapTipoParaTabela(itemTipo),
      busca: buscaTabPreco,
    },
    { enabled: fonteBusca === "tabela_preco" && buscaTabPreco.length >= 2 && !!convenioId }
  );

  // Load guia data when editing
  useEffect(() => {
    if (guiaData) {
      setTipoGuia(guiaData.tipoGuia as any);
      setEstabelecimentoId(guiaData.estabelecimentoId);
      setConvenioId(guiaData.convenioId);
      setNomePaciente(guiaData.nomePaciente || "");
      setCarteirinha(guiaData.carteirinha || "");
      setDataAtendimento(guiaData.dataAtendimento || "");
      setDataInicio(guiaData.dataInicio || "");
      setDataFim(guiaData.dataFim || "");
      setNumeroGuiaPrestador(guiaData.numeroGuiaPrestador || "");
      setNumeroGuiaOperadora(guiaData.numeroGuiaOperadora || "");
      setSenha(guiaData.senha || "");
      setNomeSolicitante(guiaData.nomeSolicitante || "");
      setConselhoProfSolicitante(guiaData.conselhoProfSolicitante || "");
      setNumeroConselhoProfSolicitante(guiaData.numeroConselhoProfSolicitante || "");
      setUfConselhoProfSolicitante(guiaData.ufConselhoProfSolicitante || "");
      setCbosConselhoProfSolicitante(guiaData.cbosConselhoProfSolicitante || "");
      setNomeExecutante(guiaData.nomeExecutante || "");
      setConselhoProfExecutante(guiaData.conselhoProfExecutante || "");
      setNumeroConselhoProfExecutante(guiaData.numeroConselhoProfExecutante || "");
      setUfConselhoProfExecutante(guiaData.ufConselhoProfExecutante || "");
      setCbosConselhoProfExecutante(guiaData.cbosConselhoProfExecutante || "");
      setCaraterAtendimento((guiaData.caraterAtendimento as any) || "eletivo");
      setTipoInternacao(guiaData.tipoInternacao || "");
      setRegimeInternacao(guiaData.regimeInternacao || "");
      setCid10Principal(guiaData.cid10Principal || "");
      setCid10Secundario(guiaData.cid10Secundario || "");
      setIndicacaoClinica(guiaData.indicacaoClinica || "");
      setObservacoes(guiaData.observacoes || "");
      setTipoServico(guiaData.tipoServico || "");
    }
  }, [guiaData]);

  // Mutations
  const criarGuiaMutation = trpc.faturamentoDigitacao.criarGuia.useMutation({
    onSuccess: (data) => {
      toast.success("Guia criada com sucesso!");
      navigate(`/faturamento/guia/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarGuiaMutation = trpc.faturamentoDigitacao.atualizarGuia.useMutation({
    onSuccess: () => {
      toast.success("Guia atualizada!");
      refetchGuia();
    },
    onError: (err) => toast.error(err.message),
  });

  const adicionarItemMutation = trpc.faturamentoDigitacao.adicionarItem.useMutation({
    onSuccess: () => {
      toast.success("Item adicionado!");
      setShowItemDialog(false);
      resetItemForm();
      refetchGuia();
    },
    onError: (err) => toast.error(err.message),
  });

  const removerItemMutation = trpc.faturamentoDigitacao.removerItem.useMutation({
    onSuccess: () => {
      toast.success("Item removido!");
      refetchGuia();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetItemForm = () => {
    setItemTipo("procedimento");
    setItemCodigo("");
    setItemDescricao("");
    setItemDataExecucao("");
    setItemQtd("1");
    setItemValorUnit("0");
    setItemValorTotal("0");
    setItemCodigoTabela("22");
    setItemViaAcesso("");
    setItemTecnica("");
    setItemGrauParticipacao("");
    setBuscaTuss("");
  };

  const handleSalvar = (status: "rascunho" | "finalizada" = "rascunho") => {
    if (!estabelecimentoId || !convenioId || !nomePaciente.trim()) {
      toast.error("Preencha os campos obrigatórios: Estabelecimento, Convênio e Paciente");
      return;
    }

    const dados = {
      estabelecimentoId,
      convenioId,
      tipoGuia,
      nomePaciente: nomePaciente.trim(),
      carteirinha: carteirinha || undefined,
      dataAtendimento: dataAtendimento || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      numeroGuiaPrestador: numeroGuiaPrestador || undefined,
      numeroGuiaOperadora: numeroGuiaOperadora || undefined,
      senha: senha || undefined,
      nomeSolicitante: nomeSolicitante || undefined,
      conselhoProfSolicitante: conselhoProfSolicitante || undefined,
      numeroConselhoProfSolicitante: numeroConselhoProfSolicitante || undefined,
      ufConselhoProfSolicitante: ufConselhoProfSolicitante || undefined,
      cbosConselhoProfSolicitante: cbosConselhoProfSolicitante || undefined,
      nomeExecutante: nomeExecutante || undefined,
      conselhoProfExecutante: conselhoProfExecutante || undefined,
      numeroConselhoProfExecutante: numeroConselhoProfExecutante || undefined,
      ufConselhoProfExecutante: ufConselhoProfExecutante || undefined,
      cbosConselhoProfExecutante: cbosConselhoProfExecutante || undefined,
      caraterAtendimento,
      tipoInternacao: tipoInternacao || undefined,
      regimeInternacao: regimeInternacao || undefined,
      cid10Principal: cid10Principal || undefined,
      cid10Secundario: cid10Secundario || undefined,
      indicacaoClinica: indicacaoClinica || undefined,
      observacoes: observacoes || undefined,
      tipoServico: tipoServico || undefined,
      status,
    };

    if (isEditing && guiaId) {
      atualizarGuiaMutation.mutate({ id: guiaId, ...dados });
    } else {
      criarGuiaMutation.mutate(dados);
    }
  };

  const handleAdicionarItem = () => {
    if (!guiaId) {
      toast.error("Salve a guia primeiro antes de adicionar itens");
      return;
    }
    if (!itemCodigo || !itemDescricao) {
      toast.error("Preencha código e descrição do item");
      return;
    }
    adicionarItemMutation.mutate({
      guiaId,
      tipoItem: itemTipo as any,
      codigoTabela: itemCodigoTabela || undefined,
      codigoProcedimento: itemCodigo,
      descricao: itemDescricao,
      dataExecucao: itemDataExecucao || undefined,
      quantidade: itemQtd,
      valorUnitario: itemValorUnit,
      valorTotal: itemValorTotal,
      viaAcesso: itemViaAcesso || undefined,
      tecnica: itemTecnica || undefined,
      grauParticipacao: itemGrauParticipacao || undefined,
    });
  };

  const handleSelecionarTuss = (proc: any) => {
    setItemCodigo(proc.codigo);
    setItemDescricao(proc.descricao);
    if (proc.valor_referencia) setItemValorUnit(String(proc.valor_referencia));
    setBuscaTuss("");
  };

  const handleSelecionarTabPreco = (item: any) => {
    setItemCodigo(item.codigo);
    setItemDescricao(item.nome);
    setItemValorUnit(String(item.valor));
    setBuscaTabPreco("");
    toast.success(`Valor preenchido da tabela do convênio: R$ ${Number(item.valor).toFixed(2)}`);
  };

  // Calcular valor total do item
  useEffect(() => {
    const qtd = parseFloat(itemQtd) || 0;
    const vUnit = parseFloat(itemValorUnit) || 0;
    setItemValorTotal((qtd * vUnit).toFixed(2));
  }, [itemQtd, itemValorUnit]);

  const itens = guiaData?.itens || [];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/faturamento")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isEditing ? "Editar Guia" : "Nova Guia de Faturamento"}
              </h1>
              {guiaData && (
                <p className="text-muted-foreground">
                  ID: {guiaData.id} | Criado por: {guiaData.criadoPorNome}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSalvar("rascunho")}>
              <Save className="w-4 h-4 mr-2" />
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSalvar("finalizada")} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Finalizar Guia
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dados" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dados">Dados da Guia</TabsTrigger>
            <TabsTrigger value="itens">Procedimentos/Itens ({itens.length})</TabsTrigger>
            <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
          </TabsList>

          {/* Aba Dados */}
          <TabsContent value="dados">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Dados Principais */}
              <Card>
                <CardHeader><CardTitle>Dados Principais</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo de Guia *</Label>
                      <Select value={tipoGuia} onValueChange={(v) => setTipoGuia(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sadt">SP/SADT</SelectItem>
                          <SelectItem value="internacao">Internação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Caráter</Label>
                      <Select value={caraterAtendimento} onValueChange={(v) => setCaraterAtendimento(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="eletivo">Eletivo</SelectItem>
                          <SelectItem value="urgencia">Urgência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Estabelecimento *</Label>
                    <Select value={estabelecimentoId?.toString() || ""} onValueChange={(v) => { setEstabelecimentoId(Number(v)); setConvenioId(undefined); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {estabelecimentos?.map((e: any) => (
                          <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Convênio *</Label>
                    <Select value={convenioId?.toString() || ""} onValueChange={(v) => setConvenioId(Number(v))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {convenios?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nº Guia Prestador</Label>
                      <Input value={numeroGuiaPrestador} onChange={(e) => setNumeroGuiaPrestador(e.target.value)} />
                    </div>
                    <div>
                      <Label>Nº Guia Operadora</Label>
                      <Input value={numeroGuiaOperadora} onChange={(e) => setNumeroGuiaOperadora(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label>Senha</Label>
                    <Input value={senha} onChange={(e) => setSenha(e.target.value)} />
                  </div>

                  {tipoGuia === "sadt" && (
                    <div>
                      <Label>Data Atendimento</Label>
                      <Input type="date" value={dataAtendimento} onChange={(e) => setDataAtendimento(e.target.value)} />
                    </div>
                  )}

                  {tipoGuia === "internacao" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Data Início</Label>
                        <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                      </div>
                      <div>
                        <Label>Data Fim</Label>
                        <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Paciente */}
              <Card>
                <CardHeader><CardTitle>Paciente</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome do Paciente *</Label>
                    <Input value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>Carteirinha</Label>
                    <Input value={carteirinha} onChange={(e) => setCarteirinha(e.target.value)} placeholder="Número da carteirinha" />
                  </div>

                  {tipoGuia === "internacao" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Tipo Internação</Label>
                          <Select value={tipoInternacao} onValueChange={setTipoInternacao}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Clínica</SelectItem>
                              <SelectItem value="2">Cirúrgica</SelectItem>
                              <SelectItem value="3">Obstétrica</SelectItem>
                              <SelectItem value="4">Pediátrica</SelectItem>
                              <SelectItem value="5">Psiquiátrica</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Regime</Label>
                          <Select value={regimeInternacao} onValueChange={setRegimeInternacao}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Hospitalar</SelectItem>
                              <SelectItem value="2">Hospital-Dia</SelectItem>
                              <SelectItem value="3">Domiciliar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>CID-10 Principal</Label>
                      <Input value={cid10Principal} onChange={(e) => setCid10Principal(e.target.value)} placeholder="Ex: Z01.0" />
                    </div>
                    <div>
                      <Label>CID-10 Secundário</Label>
                      <Input value={cid10Secundario} onChange={(e) => setCid10Secundario(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label>Indicação Clínica</Label>
                    <Textarea value={indicacaoClinica} onChange={(e) => setIndicacaoClinica(e.target.value)} rows={3} />
                  </div>

                  <div>
                    <Label>Observações</Label>
                    <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Aba Itens */}
          <TabsContent value="itens">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Procedimentos e Itens</CardTitle>
                  <Button onClick={() => { resetItemForm(); setShowItemDialog(true); }} disabled={!guiaId}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Item
                  </Button>
                </div>
                {!guiaId && (
                  <p className="text-sm text-amber-600">Salve a guia primeiro para adicionar itens</p>
                )}
              </CardHeader>
              <CardContent>
                {itens.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum item adicionado ainda
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2">Seq</th>
                          <th className="text-left p-2">Tipo</th>
                          <th className="text-left p-2">Código</th>
                          <th className="text-left p-2">Descrição</th>
                          <th className="text-left p-2">Data</th>
                          <th className="text-right p-2">Qtd</th>
                          <th className="text-right p-2">Vlr Unit</th>
                          <th className="text-right p-2">Vlr Total</th>
                          <th className="text-center p-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item: any) => (
                          <tr key={item.id} className="border-b">
                            <td className="p-2">{item.sequencial}</td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs">{item.tipoItem}</Badge>
                            </td>
                            <td className="p-2 font-mono text-xs">{item.codigoProcedimento}</td>
                            <td className="p-2 max-w-[200px] truncate">{item.descricao}</td>
                            <td className="p-2">{item.dataExecucao || "-"}</td>
                            <td className="p-2 text-right">{item.quantidade}</td>
                            <td className="p-2 text-right">R$ {Number(item.valorUnitario).toFixed(2)}</td>
                            <td className="p-2 text-right font-medium">R$ {Number(item.valorTotal).toFixed(2)}</td>
                            <td className="p-2 text-center">
                              <Button size="sm" variant="ghost" className="text-red-500"
                                onClick={() => removerItemMutation.mutate({ id: item.id, guiaId: guiaId! })}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td colSpan={7} className="p-2 text-right">Total:</td>
                          <td className="p-2 text-right">
                            R$ {itens.reduce((acc: number, i: any) => acc + Number(i.valorTotal || 0), 0).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aba Profissionais */}
          <TabsContent value="profissionais">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Profissional Solicitante</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome</Label>
                    <Input value={nomeSolicitante} onChange={(e) => setNomeSolicitante(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Conselho</Label>
                      <Select value={conselhoProfSolicitante} onValueChange={setConselhoProfSolicitante}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRM">CRM</SelectItem>
                          <SelectItem value="CRO">CRO</SelectItem>
                          <SelectItem value="CREFITO">CREFITO</SelectItem>
                          <SelectItem value="COREN">COREN</SelectItem>
                          <SelectItem value="CRF">CRF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nº Conselho</Label>
                      <Input value={numeroConselhoProfSolicitante} onChange={(e) => setNumeroConselhoProfSolicitante(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>UF</Label>
                      <Input value={ufConselhoProfSolicitante} onChange={(e) => setUfConselhoProfSolicitante(e.target.value)} maxLength={2} placeholder="GO" />
                    </div>
                    <div>
                      <Label>CBOS</Label>
                      <Input value={cbosConselhoProfSolicitante} onChange={(e) => setCbosConselhoProfSolicitante(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Profissional Executante</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome</Label>
                    <Input value={nomeExecutante} onChange={(e) => setNomeExecutante(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Conselho</Label>
                      <Select value={conselhoProfExecutante} onValueChange={setConselhoProfExecutante}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CRM">CRM</SelectItem>
                          <SelectItem value="CRO">CRO</SelectItem>
                          <SelectItem value="CREFITO">CREFITO</SelectItem>
                          <SelectItem value="COREN">COREN</SelectItem>
                          <SelectItem value="CRF">CRF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nº Conselho</Label>
                      <Input value={numeroConselhoProfExecutante} onChange={(e) => setNumeroConselhoProfExecutante(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>UF</Label>
                      <Input value={ufConselhoProfExecutante} onChange={(e) => setUfConselhoProfExecutante(e.target.value)} maxLength={2} placeholder="GO" />
                    </div>
                    <div>
                      <Label>CBOS</Label>
                      <Input value={cbosConselhoProfExecutante} onChange={(e) => setCbosConselhoProfExecutante(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialog Adicionar Item */}
        <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar Item/Procedimento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Fonte de busca */}
              <div className="flex items-center gap-4 mb-2">
                <Label className="text-sm font-medium">Buscar em:</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={fonteBusca === "tabela_preco" ? "default" : "outline"}
                    onClick={() => setFonteBusca("tabela_preco")}
                    className="text-xs"
                  >
                    Tabela do Convênio
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={fonteBusca === "tuss" ? "default" : "outline"}
                    onClick={() => setFonteBusca("tuss")}
                    className="text-xs"
                  >
                    Tabela TUSS
                  </Button>
                </div>
              </div>

              {/* Busca Tabela de Preço do Convênio */}
              {fonteBusca === "tabela_preco" && (
                <div>
                  <Label>Buscar na Tabela do Convênio {!convenioId && <span className="text-red-500 text-xs">(selecione um convênio primeiro)</span>}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={buscaTabPreco}
                      onChange={(e) => setBuscaTabPreco(e.target.value)}
                      placeholder="Digite código ou nome do item..."
                      className="pl-9"
                      disabled={!convenioId}
                    />
                  </div>
                  {resultadosTabPreco && (resultadosTabPreco as any[]).length > 0 && buscaTabPreco.length >= 2 && (
                    <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-background">
                      {(resultadosTabPreco as any[]).map((item: any, idx: number) => (
                        <div key={idx} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm"
                          onClick={() => handleSelecionarTabPreco(item)}>
                          <span className="font-mono text-xs text-blue-600">{item.codigo}</span> - {item.nome}
                          <span className="ml-2 text-green-600 font-medium">R$ {Number(item.valor).toFixed(2)}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{item.tipo}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {resultadosTabPreco && (resultadosTabPreco as any[]).length === 0 && buscaTabPreco.length >= 2 && convenioId && (
                    <p className="text-xs text-muted-foreground mt-1">Nenhum item encontrado na tabela do convênio. Tente buscar na Tabela TUSS.</p>
                  )}
                </div>
              )}

              {/* Busca TUSS */}
              {fonteBusca === "tuss" && (
                <div>
                  <Label>Buscar na Tabela TUSS</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={buscaTuss}
                      onChange={(e) => setBuscaTuss(e.target.value)}
                      placeholder="Digite código ou descrição..."
                      className="pl-9"
                    />
                  </div>
                  {resultadosTuss && (resultadosTuss as any[]).length > 0 && buscaTuss.length >= 2 && (
                    <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                      {(resultadosTuss as any[]).map((proc: any, idx: number) => (
                        <div key={idx} className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0 text-sm"
                          onClick={() => handleSelecionarTuss(proc)}>
                          <span className="font-mono text-xs text-blue-600">{proc.codigo}</span> - {proc.descricao}
                          {proc.valor_referencia && <span className="ml-2 text-green-600">R$ {Number(proc.valor_referencia).toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={itemTipo} onValueChange={setItemTipo}>
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
                  <Label>Tabela</Label>
                  <Select value={itemCodigoTabela} onValueChange={setItemCodigoTabela}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22">22 - TUSS</SelectItem>
                      <SelectItem value="19">19 - CBHPM</SelectItem>
                      <SelectItem value="20">20 - AMB</SelectItem>
                      <SelectItem value="00">00 - Própria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data Execução</Label>
                  <Input type="date" value={itemDataExecucao} onChange={(e) => setItemDataExecucao(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label>Código *</Label>
                  <Input value={itemCodigo} onChange={(e) => setItemCodigo(e.target.value)} />
                </div>
                <div className="col-span-3">
                  <Label>Descrição *</Label>
                  <Input value={itemDescricao} onChange={(e) => setItemDescricao(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" value={itemQtd} onChange={(e) => setItemQtd(e.target.value)} min="0" step="0.01" />
                </div>
                <div>
                  <Label>Valor Unitário</Label>
                  <Input type="number" value={itemValorUnit} onChange={(e) => setItemValorUnit(e.target.value)} min="0" step="0.01" />
                </div>
                <div>
                  <Label>Valor Total</Label>
                  <Input value={itemValorTotal} readOnly className="bg-muted" />
                </div>
              </div>

              {itemTipo === "procedimento" && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Via de Acesso</Label>
                    <Select value={itemViaAcesso} onValueChange={setItemViaAcesso}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Única</SelectItem>
                        <SelectItem value="2">Mesma Via</SelectItem>
                        <SelectItem value="3">Diferentes Vias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Técnica</Label>
                    <Select value={itemTecnica} onValueChange={setItemTecnica}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Convencional</SelectItem>
                        <SelectItem value="2">Videolaparoscopia</SelectItem>
                        <SelectItem value="3">Robótica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Grau Participação</Label>
                    <Select value={itemGrauParticipacao} onValueChange={setItemGrauParticipacao}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="00">Cirurgião</SelectItem>
                        <SelectItem value="01">1º Auxiliar</SelectItem>
                        <SelectItem value="02">2º Auxiliar</SelectItem>
                        <SelectItem value="03">3º Auxiliar</SelectItem>
                        <SelectItem value="04">Instrumentador</SelectItem>
                        <SelectItem value="05">Anestesista</SelectItem>
                        <SelectItem value="06">Auxiliar Anestesista</SelectItem>
                        <SelectItem value="07">Consultor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancelar</Button>
              <Button onClick={handleAdicionarItem}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
