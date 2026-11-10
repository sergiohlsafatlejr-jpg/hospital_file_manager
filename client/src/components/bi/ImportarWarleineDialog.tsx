import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FileArchive,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );

export function ImportarWarleineDialog({
  estabelecimentoId,
  estabelecimentoNome,
  open,
  onOpenChange,
  onImported,
}: {
  estabelecimentoId: number;
  estabelecimentoNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [confirmarSubstituicao, setConfirmarSubstituicao] = useState(true);
  const [uploading, setUploading] = useState(false);
  const hadProcessingRef = useRef(false);

  const lotesQuery = trpc.warleineFaturamento.lotesRelatorio.useQuery(
    { estabelecimentoId },
    {
      enabled: open && estabelecimentoId > 0,
      refetchInterval: (state) => {
        const rows = state.state.data || [];
        const active = rows.some((row) =>
          ["enfileirado", "reservado", "processando", "validado"].includes(
            row.status,
          ),
        );
        return active ? 3000 : 10000;
      },
    },
  );

  const lotes = lotesQuery.data || [];
  const emProcessamento = lotes.some((row) =>
    ["enfileirado", "reservado", "processando", "validado"].includes(
      row.status,
    ),
  );

  useEffect(() => {
    if (emProcessamento) {
      hadProcessingRef.current = true;
      return;
    }
    if (hadProcessingRef.current) {
      hadProcessingRef.current = false;
      toast.success("Lote Warleine processado e publicado com sucesso!");
      onImported?.();
    }
  }, [emProcessamento, onImported]);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Selecione um arquivo CSV, ZIP ou XLSX do Warleine.");
      return;
    }
    if (!confirmarSubstituicao) {
      toast.error(
        "Confirme que o arquivo substitui o snapshot das competências nele contidas.",
      );
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("estabelecimentoId", String(estabelecimentoId));
      formData.append(
        "confirmarSubstituicao",
        confirmarSubstituicao ? "true" : "false",
      );

      const response = await fetch("/api/warleine/importar-faturamento", {
        method: "POST",
        headers: {
          "x-estabelecimento-id": String(estabelecimentoId),
        },
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || "Não foi possível enviar o arquivo Warleine.",
        );
      }

      toast.success(
        payload.message ||
          "Arquivo recebido e enfileirado para processamento.",
      );
      setFile(null);
      await lotesQuery.refetch();
      if (payload.status === "publicado") {
        onImported?.();
      } else {
        hadProcessingRef.current = true;
      }
    } catch (error: any) {
      toast.error(error?.message || "Falha ao importar arquivo Warleine.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-600" />
            Importar Faturamento Warleine — {estabelecimentoNome}
          </DialogTitle>
          <DialogDescription>
            Envie o arquivo extraído do Warleine (<strong>.zip</strong>,{" "}
            <strong>.csv</strong> separado por ponto e vírgula ou{" "}
            <strong>.xlsx</strong> com as 48 colunas padrão) para atualizar o
            painel Faturado x Recebido desta unidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="warleine-file-input">
                Arquivo Warleine (.zip, .csv ou .xlsx)
              </Label>
              <Input
                id="warleine-file-input"
                type="file"
                accept=".zip,.csv,.xlsx"
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="bg-white cursor-pointer"
              />
              {file && (
                <p className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
                  <FileArchive className="h-3.5 w-3.5 text-indigo-600" />
                  <span>
                    Selecionado: <strong>{file.name}</strong> (
                    {(file.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="confirmar-substituicao"
                checked={confirmarSubstituicao}
                onCheckedChange={(checked) =>
                  setConfirmarSubstituicao(checked === true)
                }
              />
              <Label
                htmlFor="confirmar-substituicao"
                className="text-xs leading-5 text-slate-600 font-normal cursor-pointer"
              >
                Confirmo que este arquivo representa o snapshot completo das
                competências nele contidas para{" "}
                <strong>{estabelecimentoNome}</strong>, mantendo isolamento
                total das demais unidades e fontes.
              </Label>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!file || !confirmarSubstituicao || uploading}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando arquivo...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Enviar e Publicar Lote
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Histórico de lotes da unidade
              </h3>
              {lotesQuery.isFetching && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Atualizando...
                </span>
              )}
            </div>

            {lotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                Nenhum lote Warleine importado ainda para {estabelecimentoNome}.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Lote / Arquivo</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Linhas</th>
                      <th className="px-3 py-2 text-right">Faturado</th>
                      <th className="px-3 py-2 text-right">Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lotes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">
                            #{lote.id} — {lote.arquivoNome}
                          </div>
                          {lote.competencias?.length > 0 && (
                            <div className="text-[11px] text-slate-500">
                              Competências: {lote.competencias.join(", ")}
                            </div>
                          )}
                          {lote.erroResumo && (
                            <div className="text-[11px] text-rose-600 mt-0.5">
                              {lote.erroResumo}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {lote.status === "publicado" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Publicado
                            </Badge>
                          ) : lote.status === "erro" ? (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Erro
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              <Clock className="mr-1 h-3 w-3 animate-spin" />
                              {lote.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(
                            lote.totalPublicadas ||
                            lote.totalLinhas ||
                            0
                          ).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {money(lote.valorFaturado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-teal-700 font-medium">
                          {money(lote.valorTotalRecebido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
