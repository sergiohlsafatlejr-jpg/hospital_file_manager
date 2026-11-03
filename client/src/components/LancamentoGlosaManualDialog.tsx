import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { GLOSAS_TISS, resolverGlosaDicionario } from "@shared/glossaryGlosas";
import { FilePlus2, Loader2, Plus, Search, Trash2, CheckCircle2 } from "lucide-react";
import { criarControleSubmissaoGlosaManual, glosaManualSubmissionSchema, MAX_ITENS_GLOSA_MANUAL, type GlosaManualReconciliationResult } from "@shared/glosaManualSubmission";

interface ItemGlosaManualForm {
  codigoItem: string;
  descricaoItem: string;
  tipoLancamento: string;
  dataExecucao: string;
  quantidade: number;
  valorInformado: number;
  valorPago: number;
  valorGlosa: number;
  codigoGlosa: string;
  justificativa: string;
}

interface LancamentoGlosaManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estabelecimentoId: number;
  convenioIdInicial?: number;
  onSuccess?: (info: { convenioId: number; competencia: string; dataPagamento: string; numeroGuia: string }) => void;
}

const criarItemVazio = (dataPadrao: string, codigoGlosaPadrao = ""): ItemGlosaManualForm => ({
  codigoItem: "",
  descricaoItem: "",
  tipoLancamento: "CON",
  dataExecucao: dataPadrao,
  quantidade: 1,
  valorInformado: 0,
  valorPago: 0,
  valorGlosa: 0,
  codigoGlosa: codigoGlosaPadrao,
  justificativa: "",
});

export function LancamentoGlosaManualDialog(props: LancamentoGlosaManualDialogProps) {
  const { user } = useAuth();
  if (!user || !Number.isInteger(props.estabelecimentoId) || props.estabelecimentoId <= 0) return null;
  // Mudança de usuário/hospital desmonta a memória de PHI, não a chave durável.
  return <LancamentoGlosaManualDialogSessao key={`${user.id}:${props.estabelecimentoId}`} {...props} userId={user.id} />;
}

function LancamentoGlosaManualDialogSessao({
  open,
  onOpenChange,
  estabelecimentoId,
  convenioIdInicial,
  onSuccess,
  userId,
}: LancamentoGlosaManualDialogProps & { userId: number }) {
  const hoje = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [submissao] = useState(() => criarControleSubmissaoGlosaManual({
    userId, estabelecimentoId, storage: () => window.sessionStorage,
  }));
  const [estadoTentativa, setEstadoTentativa] = useState(() => submissao.estado());
  const [retomarOriginal, setRetomarOriginal] = useState(false);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const utils = trpc.useUtils();

  const [convenioId, setConvenioId] = useState<string>(convenioIdInicial ? String(convenioIdInicial) : "");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [lotePrestador, setLotePrestador] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [nomeBeneficiario, setNomeBeneficiario] = useState("");
  const [carteiraBeneficiario, setCarteiraBeneficiario] = useState("");
  const [codigoGlosaPadrao, setCodigoGlosaPadrao] = useState("");
  const [buscaMotivo, setBuscaMotivo] = useState("");

  // Busca opcional de guia no faturamento
  const [termoBuscaFaturamento, setTermoBuscaFaturamento] = useState("");
  const [termoSubmetido, setTermoSubmetido] = useState("");

  const [itens, setItens] = useState<ItemGlosaManualForm[]>([criarItemVazio(hoje)]);

  const { data: conveniosLista } = trpc.convenios.list.useQuery(
    { ativo: "sim", estabelecimentoId },
    { enabled: open && estabelecimentoId > 0 }
  );
  // Política canônica: globais ativos OU pertencentes ao hospital ativo, por ID.
  const conveniosAutorizados = (conveniosLista || []).filter(c => (c.estabelecimentoId === null || c.estabelecimentoId === estabelecimentoId) && c.ativo === "sim");
  const convenioAutorizado = conveniosAutorizados.some(c => c.id === Number(convenioId));
  const { data: motivosGlosaDb } = trpc.motivosGlosa.list.useQuery(undefined, { enabled: open });

  const { data: guiasFaturamento, isFetching: buscandoFaturamento } =
    trpc.faturamentoUnificado.buscarGuiaFaturamentoParaGlosaManual.useQuery(
      {
        estabelecimentoId,
        termo: termoSubmetido,
        convenioId: convenioId && convenioId !== "todos" ? Number(convenioId) : undefined,
      },
      {
        enabled: open && estabelecimentoId > 0 && convenioAutorizado && termoSubmetido.trim().length >= 2,
      }
    );

  const limparFormulario = () => {
    setConvenioId(""); setNumeroGuia(""); setProtocolo(""); setLotePrestador("");
    setDataPagamento(""); setNomeBeneficiario(""); setCarteiraBeneficiario("");
    setCodigoGlosaPadrao(""); setBuscaMotivo(""); setTermoBuscaFaturamento(""); setTermoSubmetido("");
    setItens([criarItemVazio("")]); setRetomarOriginal(false);
  };
  const confirmar = (res: GlosaManualReconciliationResult, key: string) => {
    submissao.reconciliar(res, key);
    if (res.status !== "concluido") return; // ausência nunca descarta UUID
    limparFormulario(); // TODOS os campos/itens antes de reset/fechar
    submissao.resetAposConfirmacao(key);
    setEstadoTentativa(submissao.estado());
  };
  const lancarMutation = trpc.faturamentoUnificado.lancarGlosaManualDemonstrativo.useMutation({
    onSuccess: (res, variables) => {
      try {
        confirmar({ status: "concluido", totalInseridos: res.totalInseridos, competencia: res.competencia, dataPagamento: res.dataPagamento }, variables.idempotencyKey);
      } catch (error) {
        setEstadoTentativa(submissao.estado());
        toast.error(error instanceof Error ? error.message : "Falha na confirmação local; solicite revisão responsável.");
        return;
      }
      if (!montado.current) return;
      toast.success(`Glosa manual confirmada (${res.totalInseridos} item(ns)).`);
      onSuccess?.({ convenioId: variables.convenioId, competencia: res.competencia, dataPagamento: res.dataPagamento, numeroGuia: variables.numeroGuia });
      void utils.faturamentoUnificado.invalidate();
      onOpenChange(false);
    },
    onError: (err, variables) => {
      submissao.falhou(variables.idempotencyKey);
      setEstadoTentativa(submissao.estado());
      toast.error(`${err.message || "Resposta não recebida."} Resultado incerto: a mesma tentativa foi preservada. Consulte o status ou retome os dados originais; não inicie outro lançamento.`);
    },
  });
  const [consultandoStatus, setConsultandoStatus] = useState(false);
  const consultarStatus = async () => {
    const key = submissao.estado().key;
    if (!key || submissao.estado().emVoo || consultandoStatus) return;
    setConsultandoStatus(true);
    try {
      const res = await utils.faturamentoUnificado.consultarStatusGlosaManual.fetch({ estabelecimentoId, idempotencyKey: key }, { staleTime: 0 });
      confirmar(res, key);
      if (!montado.current) return;
      if (res.status === "concluido") {
        toast.success(`Lançamento original confirmado (${res.totalInseridos} item(ns)). Formulário limpo.`);
        void utils.faturamentoUnificado.invalidate();
        onOpenChange(false);
      } else {
        toast.info("Resultado ainda não confirmado. O envio original pode concluir depois; a chave permanece preservada. Retome somente a tentativa original ou solicite revisão responsável.");
      }
    } catch (error) {
      setEstadoTentativa(submissao.estado());
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o resultado. A tentativa foi preservada.");
    } finally { setConsultandoStatus(false); }
  };
  const formularioBloqueado = estadoTentativa.emVoo || lancarMutation.isPending || consultandoStatus || !!estadoTentativa.erroPersistencia ||
    (estadoTentativa.pendente && (estadoTentativa.temPayload || !retomarOriginal));

  // Lista combinada do Dicionário de Glosas (Banco + ANS/TISS)
  const opcoesDicionarioGlosa = useMemo(() => {
    const mapa = new Map<string, { codigo: string; descricao: string; grupo?: string }>();
    for (const g of Object.values(GLOSAS_TISS)) {
      mapa.set(g.codigo, { codigo: g.codigo, descricao: g.descricao, grupo: g.grupo });
    }
    if (motivosGlosaDb) {
      for (const m of motivosGlosaDb as any[]) {
        if (m.codigo && m.descricao) {
          mapa.set(String(m.codigo).trim(), {
            codigo: String(m.codigo).trim(),
            descricao: String(m.descricao).trim(),
            grupo: m.grupo || undefined,
          });
        }
      }
    }
    const lista = Array.from(mapa.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    if (!buscaMotivo.trim()) return lista.slice(0, 80);
    const q = buscaMotivo.trim().toLowerCase();
    return lista
      .filter((x) => x.codigo.toLowerCase().includes(q) || x.descricao.toLowerCase().includes(q))
      .slice(0, 80);
  }, [motivosGlosaDb, buscaMotivo]);

  const handleCarregarGuiaFaturamento = (guia: any) => {
    if (!conveniosAutorizados.some(c => c.id === Number(guia.convenioId))) {
      toast.error("A guia não possui convênio ativo global ou pertencente ao hospital selecionado.");
      return;
    }
    if (guia.itens?.length > MAX_ITENS_GLOSA_MANUAL) {
      toast.error(`Informe no máximo ${MAX_ITENS_GLOSA_MANUAL} itens por lançamento.`);
      return;
    }
    if (guia.convenioId) setConvenioId(String(guia.convenioId));
    setNumeroGuia(guia.numeroGuia || guia.contaNumero || "");
    if (guia.protocolo) setProtocolo(guia.protocolo);
    if (guia.lote) setLotePrestador(guia.lote);
    setNomeBeneficiario(guia.pacienteNome || "");
    setCarteiraBeneficiario(guia.carteiraBeneficiario || "");

    if (guia.itens && guia.itens.length > 0) {
      setItens(
        guia.itens.map((it: any) => {
          const vFat = Number(it.valorFaturado) || 0;
          return {
            codigoItem: it.codigoItem || "",
            descricaoItem: it.descricaoItem || "",
            tipoLancamento: it.tipoItem || "CON",
            dataExecucao: it.dataExecucao || dataPagamento || hoje,
            quantidade: Number(it.quantidade) || 1,
            valorInformado: vFat,
            valorPago: 0,
            valorGlosa: vFat,
            codigoGlosa: codigoGlosaPadrao || "",
            justificativa: "",
          };
        })
      );
      toast.success(`Guia ${guia.numeroGuia} carregada com ${guia.itens.length} item(ns) do faturamento!`);
    }
  };

  const atualizarItem = (idx: number, patch: Partial<ItemGlosaManualForm>) => {
    setItens((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const atualizado = { ...item, ...patch };
        if ("valorInformado" in patch || "valorPago" in patch) {
          const calcGlosa = Math.max(0, Number(atualizado.valorInformado || 0) - Number(atualizado.valorPago || 0));
          atualizado.valorGlosa = Math.round(calcGlosa * 100) / 100;
        }
        return atualizado;
      })
    );
  };

  const aplicarMotivoPadraoEmTodos = (codigo: string) => {
    setCodigoGlosaPadrao(codigo);
    setItens((prev) => prev.map((it) => ({ ...it, codigoGlosa: codigo })));
  };

  const handleSalvar = () => {
    if (submissao.estado().emVoo || lancarMutation.isPending || consultandoStatus || estadoTentativa.erroPersistencia) return;
    if (estadoTentativa.pendente && !estadoTentativa.temPayload && !retomarOriginal) return;
    if (estadoTentativa.temPayload) {
      try {
        // preparar ignora alterações do formulário e repete o payload original em memória.
        const tentativa = submissao.preparar();
        setEstadoTentativa(submissao.estado());
        lancarMutation.mutate(tentativa);
      } catch (error) {
        const key = submissao.estado().key;
        if (key) submissao.falhou(key);
        setEstadoTentativa(submissao.estado());
        toast.error(error instanceof Error ? error.message : "Tentativa preservada; solicite revisão responsável.");
      }
      return;
    }
    if (!convenioAutorizado) {
      toast.error("Selecione um convênio ativo global ou pertencente ao hospital.");
      return;
    }
    if (!numeroGuia.trim()) {
      toast.error("Informe o número da guia.");
      return;
    }
    if (!nomeBeneficiario.trim()) {
      toast.error("Informe o nome do beneficiário/paciente.");
      return;
    }
    if (itens.some(it => !it.codigoItem.trim() || !it.descricaoItem.trim() || !(it.valorGlosa > 0))) {
      toast.error("Preencha todos os itens com código, descrição e valor glosado maior que zero.");
      return;
    }

    const payload = {
      estabelecimentoId,
      convenioId: Number(convenioId),
      numeroGuia: numeroGuia.trim(),
      protocolo: protocolo.trim() || undefined,
      lotePrestador: lotePrestador.trim() || undefined,
      dataPagamento: dataPagamento || hoje,
      carteiraBeneficiario: carteiraBeneficiario.trim() || undefined,
      nomeBeneficiario: nomeBeneficiario.trim(),
      itens: itens.map((it, idx) => {
        const info = resolverGlosaDicionario(it.codigoGlosa, undefined, motivosGlosaDb as any[]);
        return {
          sequencialItem: idx + 1,
          codigoItem: it.codigoItem.trim(),
          descricaoItem: it.descricaoItem.trim(),
          tipoLancamento: it.tipoLancamento || "CON",
          dataExecucao: it.dataExecucao || dataPagamento || hoje,
          quantidade: Number(it.quantidade),
          valorInformado: Number(it.valorInformado),
          valorPago: Number(it.valorPago),
          valorGlosa: Number(it.valorGlosa),
          codigoGlosa: info?.codigo || it.codigoGlosa.trim() || undefined,
          erroTiss: info?.textoFormatado || it.codigoGlosa.trim() || undefined,
          justificativa: it.justificativa.trim() || undefined,
        };
      }),
    };
    const validacao = glosaManualSubmissionSchema.omit({ idempotencyKey: true }).safeParse(payload);
    if (!validacao.success) {
      toast.error(validacao.error.issues[0]?.message || "Revise os campos do lançamento manual.");
      return;
    }
    try {
      const tentativa = submissao.preparar(validacao.data);
      setEstadoTentativa(submissao.estado());
      lancarMutation.mutate(tentativa);
    } catch (error) {
      const key = submissao.estado().key;
      if (key) submissao.falhou(key);
      setEstadoTentativa(submissao.estado());
      toast.error(error instanceof Error ? error.message : "Não foi possível preservar a chave segura; nenhum envio permitido.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submissao.estado().emVoo && !consultandoStatus) onOpenChange(value); }}>
      <DialogContent className="max-w-5xl sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-blue-600" />
            Lançar Glosa Manual (Convênios sem Demonstrativo — Ex.: FUSEX)
          </DialogTitle>
          <DialogDescription>
            Utilize este lançamento para convênios que não fornecem demonstrativo XML/Excel para importação.
            Você pode puxar uma guia já faturada no sistema ou digitar os itens manualmente. Após salvar, a guia segue todo o fluxo de Recurso de Glosa (IA, Lote e Acompanhamento).
          </DialogDescription>
        </DialogHeader>

        {estadoTentativa.erroPersistencia && <p role="alert" className="text-sm text-red-700">{estadoTentativa.erroPersistencia}</p>}
        {estadoTentativa.pendente && <div role="status" className="rounded border border-amber-400 p-3 space-y-2 text-sm">
          <p>Há uma tentativa pendente neste usuário/hospital. Falha HTTP não significa que ela não foi registrada. Nenhum novo lançamento será iniciado até confirmação. A consulta sem confirmação não libera outra chave.</p>
          <p>Após recarregar, somente o UUID é recuperado, nunca dados de paciente. Retome exatamente os dados originais; diferenças podem gerar CONFLICT e exigem revisão responsável.</p>
          <Button type="button" variant="outline" onClick={consultarStatus} disabled={estadoTentativa.emVoo || lancarMutation.isPending || consultandoStatus}>
            {consultandoStatus ? "Consultando..." : "Consultar resultado da tentativa"}
          </Button>
          {!estadoTentativa.temPayload && !retomarOriginal && <Button type="button" variant="outline" onClick={() => setRetomarOriginal(true)} disabled={consultandoStatus || !!estadoTentativa.erroPersistencia}>Retomar os dados originais com a mesma chave</Button>}
        </div>}
        <fieldset disabled={formularioBloqueado} className="space-y-5 py-2 min-w-0">
          {/* Passo Opcional: Buscar Guia do Faturamento */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  1. Buscar Guia/Conta Faturada no Sistema (Opcional)
                </p>
                <p className="text-xs text-muted-foreground">
                  Pesquise por Nº da Guia, Nº da Conta ou Nome do Paciente para preencher os itens automaticamente.
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Nº guia, conta ou paciente..."
                  value={termoBuscaFaturamento}
                  onChange={(e) => setTermoBuscaFaturamento(e.target.value)}
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setTermoSubmetido(termoBuscaFaturamento);
                    }
                  }}
                  className="h-8 text-xs sm:w-64"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  onClick={() => setTermoSubmetido(termoBuscaFaturamento)}
                  disabled={!convenioAutorizado || buscandoFaturamento || termoBuscaFaturamento.trim().length < 2}
                >
                  {buscandoFaturamento ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                  Buscar
                </Button>
              </div>
            </div>

            {guiasFaturamento && guiasFaturamento.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Guia / Conta</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead className="text-center">Itens</TableHead>
                      <TableHead className="text-right">Total Faturado</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guiasFaturamento.map((g: any) => (
                      <TableRow key={g.chave} className="text-xs">
                        <TableCell className="font-mono font-medium">
                          {g.numeroGuia}
                          {g.contaNumero && g.contaNumero !== g.numeroGuia ? ` (Conta ${g.contaNumero})` : ""}
                        </TableCell>
                        <TableCell>{g.pacienteNome}</TableCell>
                        <TableCell>{g.convenio}</TableCell>
                        <TableCell className="text-center">{g.itens.length}</TableCell>
                        <TableCell className="text-right font-mono">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(g.valorTotalFaturado || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleCarregarGuiaFaturamento(g)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Carregar Guia
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {termoSubmetido && !buscandoFaturamento && guiasFaturamento?.length === 0 && (
              <p className="text-xs text-amber-700">
                Nenhuma guia encontrada no faturamento para "{termoSubmetido}". Você pode preencher os dados manualmente abaixo.
              </p>
            )}
          </div>

          {/* Dados da Guia / Beneficiário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Convênio *</Label>
              <Select value={convenioId} onValueChange={setConvenioId} disabled={formularioBloqueado}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o convênio (ex: FUSEX)" />
                </SelectTrigger>
                <SelectContent>
                  {conveniosAutorizados.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Nº da Guia *</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Ex: 2026000123"
                value={numeroGuia}
                onChange={(e) => setNumeroGuia(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Protocolo TISS / DP</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Protocolo (opcional)"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Data Pagto / Referência *</Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nome do Beneficiário / Paciente *</Label>
              <Input
                className="h-9 text-xs"
                placeholder="Nome completo do paciente"
                value={nomeBeneficiario}
                onChange={(e) => setNomeBeneficiario(e.target.value)}
                maxLength={255}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Carteirinha / Matrícula</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Código do beneficiário"
                value={carteiraBeneficiario}
                onChange={(e) => setCarteiraBeneficiario(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lote Prestador</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Nº do lote (opcional)"
                value={lotePrestador}
                onChange={(e) => setLotePrestador(e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          {/* Seleção rápida do Dicionário de Glosas */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label className="text-xs font-semibold">
                Motivo de Glosa Padrão (Dicionário de Glosas ANS/TISS)
              </Label>
              <Input
                placeholder="Filtrar código ou descrição no dicionário (ex: 1705, material, taxa)..."
                value={buscaMotivo}
                onChange={(e) => setBuscaMotivo(e.target.value)}
                className="h-7 text-xs sm:w-80"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <Select value={codigoGlosaPadrao} onValueChange={aplicarMotivoPadraoEmTodos} disabled={formularioBloqueado}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Selecione um motivo do Dicionário de Glosas para aplicar aos itens..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {opcoesDicionarioGlosa.map((op) => (
                    <SelectItem key={op.codigo} value={op.codigo} className="text-xs">
                      {op.codigo} — {op.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {codigoGlosaPadrao && (
                <Badge variant="secondary" className="text-xs">
                  Aplicado: {codigoGlosaPadrao}
                </Badge>
              )}
            </div>
          </div>

          {/* Tabela de Itens Glosados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Itens Glosados da Guia ({itens.length})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setItens((prev) => [...prev, criarItemVazio(dataPagamento || hoje, codigoGlosaPadrao)])}
                disabled={itens.length >= MAX_ITENS_GLOSA_MANUAL || lancarMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar Item
              </Button>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-[110px]">Código *</TableHead>
                    <TableHead className="min-w-[180px]">Descrição do Procedimento/Item *</TableHead>
                    <TableHead className="w-[90px]">Tipo</TableHead>
                    <TableHead className="w-[70px]">Qtde</TableHead>
                    <TableHead className="w-[110px]">Vlr. Faturado</TableHead>
                    <TableHead className="w-[110px]">Vlr. Pago</TableHead>
                    <TableHead className="w-[110px]">Vlr. Glosa *</TableHead>
                    <TableHead className="w-[130px]">Cód. Glosa</TableHead>
                    <TableHead className="w-[44px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it, idx) => {
                    const infoDic = resolverGlosaDicionario(it.codigoGlosa, undefined, motivosGlosaDb as any[]);
                    return (
                      <TableRow key={idx} className="align-top">
                        <TableCell className="p-1.5">
                          <Input
                            className="h-8 text-xs font-mono"
                            placeholder="Código"
                            value={it.codigoItem}
                            onChange={(e) => atualizarItem(idx, { codigoItem: e.target.value })}
                            maxLength={50}
                          />
                        </TableCell>
                        <TableCell className="p-1.5 space-y-1">
                          <Input
                            className="h-8 text-xs"
                            placeholder="Descrição do item"
                            value={it.descricaoItem}
                            onChange={(e) => atualizarItem(idx, { descricaoItem: e.target.value })}
                            maxLength={65535}
                          />
                          <Textarea
                            className="min-h-[34px] text-xs py-1"
                            placeholder="Justificativa do recurso (opcional — pode ser gerada com IA depois)"
                            value={it.justificativa}
                            onChange={(e) => atualizarItem(idx, { justificativa: e.target.value })}
                            maxLength={65535}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Select
                            value={it.tipoLancamento}
                            onValueChange={(v) => atualizarItem(idx, { tipoLancamento: v })}
                            disabled={formularioBloqueado}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CON">Proc.</SelectItem>
                              <SelectItem value="MAT">Mat.</SelectItem>
                              <SelectItem value="MED">Med.</SelectItem>
                              <SelectItem value="EXA">Exame</SelectItem>
                              <SelectItem value="HOS">Diária</SelectItem>
                              <SelectItem value="TAX">Taxa</SelectItem>
                              <SelectItem value="HON">Honor.</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            min="0.001"
                            max="999999999.999"
                            step="0.001"
                            className="h-8 text-xs font-mono"
                            value={it.quantidade}
                            onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-xs font-mono"
                            value={it.valorInformado || ""}
                            onChange={(e) => atualizarItem(idx, { valorInformado: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-xs font-mono"
                            value={it.valorPago || ""}
                            onChange={(e) => atualizarItem(idx, { valorPago: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 text-xs font-mono text-red-600 font-semibold"
                            value={it.valorGlosa || ""}
                            onChange={(e) => atualizarItem(idx, { valorGlosa: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            className="h-8 text-xs font-mono"
                            placeholder="Ex: 1705"
                            value={it.codigoGlosa}
                            onChange={(e) => atualizarItem(idx, { codigoGlosa: e.target.value })}
                            maxLength={500}
                          />
                          {infoDic && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2" title={infoDic.descricao}>
                              {infoDic.descricao}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-600"
                            onClick={() => setItens((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                            disabled={itens.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </fieldset>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={estadoTentativa.emVoo || lancarMutation.isPending || consultandoStatus}>
            {estadoTentativa.pendente ? "Fechar mantendo tentativa" : "Cancelar"}
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={estadoTentativa.emVoo || lancarMutation.isPending || consultandoStatus || !!estadoTentativa.erroPersistencia || (!estadoTentativa.temPayload && !convenioAutorizado) || (estadoTentativa.pendente && !estadoTentativa.temPayload && !retomarOriginal)}>
            {lancarMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {estadoTentativa.pendente ? "Reenviar a mesma tentativa original" : "Salvar e Incluir no Recurso de Glosa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
