import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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

export function LancamentoGlosaManualDialog({
  open,
  onOpenChange,
  estabelecimentoId,
  convenioIdInicial,
  onSuccess,
}: LancamentoGlosaManualDialogProps) {
  const hoje = useMemo(() => new Date().toISOString().split("T")[0], []);

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

  const { data: conveniosLista } = trpc.convenios.list.useQuery({}, { enabled: open });
  const { data: motivosGlosaDb } = trpc.motivosGlosa.list.useQuery(undefined, { enabled: open });

  const { data: guiasFaturamento, isFetching: buscandoFaturamento } =
    trpc.faturamentoUnificado.buscarGuiaFaturamentoParaGlosaManual.useQuery(
      {
        estabelecimentoId,
        termo: termoSubmetido,
        convenioId: convenioId && convenioId !== "todos" ? Number(convenioId) : undefined,
      },
      {
        enabled: open && estabelecimentoId > 0 && termoSubmetido.trim().length >= 2,
      }
    );

  const lancarMutation = trpc.faturamentoUnificado.lancarGlosaManualDemonstrativo.useMutation({
    onSuccess: (res) => {
      toast.success(`Glosa manual registrada com sucesso (${res.totalInseridos} item(ns))! A guia já está disponível para análise e lote.`);
      onSuccess?.({
        convenioId: Number(convenioId),
        competencia: res.competencia,
        dataPagamento: res.dataPagamento,
        numeroGuia: numeroGuia.trim(),
      });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao registrar glosa manual.");
    },
  });

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
    if (!convenioId || Number(convenioId) <= 0) {
      toast.error("Selecione o convênio (ex.: FUSEX).");
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
    const itensValidos = itens.filter(
      (it) => it.codigoItem.trim() !== "" && it.descricaoItem.trim() !== "" && Number(it.valorGlosa) > 0
    );
    if (itensValidos.length === 0) {
      toast.error("Preencha pelo menos um item com código, descrição e valor glosado maior que zero.");
      return;
    }

    lancarMutation.mutate({
      estabelecimentoId,
      convenioId: Number(convenioId),
      numeroGuia: numeroGuia.trim(),
      protocolo: protocolo.trim() || undefined,
      lotePrestador: lotePrestador.trim() || undefined,
      dataPagamento: dataPagamento || hoje,
      carteiraBeneficiario: carteiraBeneficiario.trim() || undefined,
      nomeBeneficiario: nomeBeneficiario.trim(),
      itens: itensValidos.map((it, idx) => {
        const info = resolverGlosaDicionario(it.codigoGlosa, undefined, motivosGlosaDb as any[]);
        return {
          sequencialItem: idx + 1,
          codigoItem: it.codigoItem.trim(),
          descricaoItem: it.descricaoItem.trim(),
          tipoLancamento: it.tipoLancamento || "CON",
          dataExecucao: it.dataExecucao || dataPagamento || hoje,
          quantidade: Number(it.quantidade) || 1,
          valorInformado: Number(it.valorInformado) || 0,
          valorPago: Number(it.valorPago) || 0,
          valorGlosa: Number(it.valorGlosa) || 0,
          codigoGlosa: info?.codigo || it.codigoGlosa.trim() || undefined,
          erroTiss: info?.textoFormatado || it.codigoGlosa.trim() || undefined,
          justificativa: it.justificativa.trim() || undefined,
        };
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
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

        <div className="space-y-5 py-2">
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
                  disabled={buscandoFaturamento || termoBuscaFaturamento.trim().length < 2}
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
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o convênio (ex: FUSEX)" />
                </SelectTrigger>
                <SelectContent>
                  {(conveniosLista || []).map((c: any) => (
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
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Protocolo TISS / DP</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Protocolo (opcional)"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
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
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Carteirinha / Matrícula</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Código do beneficiário"
                value={carteiraBeneficiario}
                onChange={(e) => setCarteiraBeneficiario(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lote Prestador</Label>
              <Input
                className="h-9 text-xs font-mono"
                placeholder="Nº do lote (opcional)"
                value={lotePrestador}
                onChange={(e) => setLotePrestador(e.target.value)}
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
              <Select value={codigoGlosaPadrao} onValueChange={aplicarMotivoPadraoEmTodos}>
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
                          />
                        </TableCell>
                        <TableCell className="p-1.5 space-y-1">
                          <Input
                            className="h-8 text-xs"
                            placeholder="Descrição do item"
                            value={it.descricaoItem}
                            onChange={(e) => atualizarItem(idx, { descricaoItem: e.target.value })}
                          />
                          <Textarea
                            className="min-h-[34px] text-xs py-1"
                            placeholder="Justificativa do recurso (opcional — pode ser gerada com IA depois)"
                            value={it.justificativa}
                            onChange={(e) => atualizarItem(idx, { justificativa: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Select
                            value={it.tipoLancamento}
                            onValueChange={(v) => atualizarItem(idx, { tipoLancamento: v })}
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
                            min="1"
                            step="1"
                            className="h-8 text-xs font-mono"
                            value={it.quantidade}
                            onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) || 1 })}
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
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSalvar} disabled={lancarMutation.isPending}>
            {lancarMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar e Incluir no Recurso de Glosa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
