import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, Loader2, ThumbsDown, ThumbsUp, Upload, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  extrairDecisoesDeLinhas,
  localizarCabecalhoDecisoes,
  type ResultadoExtracaoDecisoes,
} from "../../../../shared/planilhaDecisoesGlosa";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estabelecimentoId: number | undefined;
  convenios: Array<{ id: number; nome: string }> | undefined;
  convenioInicial?: string;
  onImportado?: () => void;
};

/** Escolhe a aba que contém a coluna "VAMOS RECURSAR?" (prioriza abas "8." / "Oportunidades"). */
async function lerPlanilha(file: File) {
  const buffer = await file.arrayBuffer();
  const nomes = XLSX.read(buffer, { type: "array", bookSheets: true }).SheetNames;
  const ordem = [
    ...nomes.filter((n) => /^8\.\s|oportunidade/i.test(n)),
    ...nomes.filter((n) => !/^8\.\s|oportunidade/i.test(n)),
  ];
  for (const nome of ordem) {
    const wb = XLSX.read(buffer, { type: "array", sheets: [nome] });
    const ws = wb.Sheets[nome];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
    if (localizarCabecalhoDecisoes(rows) >= 0) {
      return { aba: nome, extracao: extrairDecisoesDeLinhas(rows) };
    }
  }
  throw new Error('Nenhuma aba com a coluna "VAMOS RECURSAR? (Sim / Não / Avaliar)" foi encontrada.');
}

export function ImportarDecisoesGlosaDialog({
  open,
  onOpenChange,
  estabelecimentoId,
  convenios,
  convenioInicial,
  onImportado,
}: Props) {
  const [convenio, setConvenio] = useState<string>(convenioInicial ?? "todos");
  const [arquivoNome, setArquivoNome] = useState("");
  const [aba, setAba] = useState("");
  const [lendo, setLendo] = useState(false);
  const [extracao, setExtracao] = useState<ResultadoExtracaoDecisoes | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const mutation = trpc.recursos.importarDecisoesPlanilha.useMutation();
  const previa = mutation.data && mutation.data.aplicados === 0 ? mutation.data : null;

  const resetar = () => {
    setArquivoNome("");
    setAba("");
    setExtracao(null);
    setInputKey((k) => k + 1);
    mutation.reset();
  };

  const montarPayload = (aplicar: boolean) => ({
    estabelecimentoId: estabelecimentoId!,
    convenioId: convenio !== "todos" ? parseInt(convenio) : undefined,
    aplicar,
    linhas: extracao!.linhas,
  });

  const handleArquivo = async (file: File | undefined) => {
    if (!file || !estabelecimentoId) return;
    mutation.reset();
    setLendo(true);
    setArquivoNome(file.name);
    try {
      const { aba, extracao } = await lerPlanilha(file);
      setAba(aba);
      setExtracao(extracao);
      if (extracao.linhas.length === 0) {
        toast.warning('Nenhuma linha com "Sim" ou "Não" na coluna VAMOS RECURSAR?');
        return;
      }
      await mutation.mutateAsync({
        estabelecimentoId,
        convenioId: convenio !== "todos" ? parseInt(convenio) : undefined,
        aplicar: false,
        linhas: extracao.linhas,
      });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao ler a planilha");
      setExtracao(null);
    } finally {
      setLendo(false);
    }
  };

  const reanalisar = async () => {
    if (!extracao?.linhas.length || !estabelecimentoId) return;
    try {
      await mutation.mutateAsync(montarPayload(false));
    } catch (e: any) {
      toast.error(e?.message || "Erro ao analisar a planilha");
    }
  };

  const aplicar = async () => {
    if (!extracao?.linhas.length || !estabelecimentoId) return;
    try {
      const r = await mutation.mutateAsync(montarPayload(true));
      toast.success(`${r.aplicados} decisão(ões) importada(s): ${r.aRecursar} a recursar, ${r.aAceitar} glosa(s) aceita(s).`);
      onImportado?.();
      onOpenChange(false);
      resetar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao aplicar as decisões");
    }
  };

  const naoEncontrados = previa?.resultados.filter((r) => r.status !== "casado") ?? [];
  const jaClassificados = previa?.resultados.filter((r) => r.status === "casado" && r.classificacaoAtual && r.classificacaoAtual !== "pendente").length ?? 0;
  const ocupado = lendo || mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!ocupado) {
          onOpenChange(o);
          if (!o) resetar();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            Importar decisões de recurso (Excel)
          </DialogTitle>
          <DialogDescription>
            Coluna <b>VAMOS RECURSAR?</b>: <b>Sim</b> = Recursar · <b>Não</b> = Glosa Aceita · Avaliar/vazio = ignorado.
            A coluna <b>Justificativa / Orientação para Recurso</b> é gravada como justificativa do item; na Glosa Aceita,
            o motivo do aceite vem da coluna <b>Sugestão da consultoria</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Convênio (opcional)</Label>
            <Select value={convenio} onValueChange={setConvenio} disabled={ocupado}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {convenios?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="importar-decisoes-arquivo">Planilha (.xlsx)</Label>
            <Input
              key={inputKey}
              id="importar-decisoes-arquivo"
              type="file"
              accept=".xlsx,.xls"
              disabled={ocupado || !estabelecimentoId}
              onChange={(e) => handleArquivo(e.target.files?.[0])}
            />
          </div>
        </div>

        {ocupado && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {lendo && !mutation.isPending ? "Lendo planilha..." : "Vinculando itens com o portal..."}
          </div>
        )}

        {extracao && (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium">
              {arquivoNome} {aba && <span className="text-muted-foreground">— aba "{aba}"</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Sim: {extracao.contagem.sim}</Badge>
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Não: {extracao.contagem.nao}</Badge>
              <Badge variant="outline">Avaliar: {extracao.contagem.avaliar}</Badge>
              <Badge variant="outline">Sem decisão: {extracao.contagem.vazio}</Badge>
              {extracao.contagem.outros > 0 && <Badge variant="destructive">Valor inválido: {extracao.contagem.outros}</Badge>}
            </div>
          </div>
        )}

        {previa && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Vinculados</div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> {previa.casados}
                </div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Recursar</div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  <ThumbsDown className="h-4 w-4 text-orange-600" /> {previa.aRecursar}
                </div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Glosa aceita</div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  <ThumbsUp className="h-4 w-4 text-green-600" /> {previa.aAceitar}
                </div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Não encontrados</div>
                <div className="text-lg font-bold flex items-center justify-center gap-1">
                  <XCircle className="h-4 w-4 text-red-600" /> {naoEncontrados.length}
                </div>
              </div>
            </div>

            {jaClassificados > 0 && (
              <p className="text-xs text-amber-700">
                {jaClassificados} item(ns) já possuem classificação no portal e serão sobrescritos pela decisão da planilha.
              </p>
            )}

            {naoEncontrados.length > 0 && (
              <div className="rounded-lg border">
                <div className="px-3 py-2 text-sm font-medium border-b">
                  Linhas não vinculadas ({naoEncontrados.length}) — confira estabelecimento/convênio
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Linha</TableHead>
                        <TableHead>Guia</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {naoEncontrados.slice(0, 300).map((r) => (
                        <TableRow key={r.linha}>
                          <TableCell>{r.linha}</TableCell>
                          <TableCell className="font-mono text-xs">{r.guia}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-mono">{r.codigoItem}</div>
                            <div className="text-muted-foreground truncate max-w-[220px]">{r.descricaoItem}</div>
                          </TableCell>
                          <TableCell className="text-xs">{r.detalhe}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          {extracao && extracao.linhas.length > 0 && (
            <Button variant="outline" onClick={reanalisar} disabled={ocupado}>
              <Upload className="h-4 w-4 mr-2" /> Reanalisar
            </Button>
          )}
          <Button
            onClick={aplicar}
            disabled={ocupado || !previa || previa.casados === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Aplicar {previa?.casados ?? 0} decisão(ões)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportarDecisoesGlosaDialog;
