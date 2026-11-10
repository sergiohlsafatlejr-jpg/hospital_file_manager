import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  clearWarleineAttempt, getWarleineUploadStatus, isWarleinePublished,
  readWarleineAttempt, statusWarleineMessage, uploadWarleineInParts,
  type WarleineAttempt, type WarleineUploadStatus,
} from "@/lib/warleineUpload";
import { WARLEINE_UPLOAD_MAX_FILE_BYTES } from "../../../../shared/warleineUploadProtocol";
import { AlertCircle, CheckCircle2, Clock, Database, FileArchive, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

const money = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(Number(value ?? 0));

export function ImportarWarleineDialog({
  estabelecimentoId, estabelecimentoNome, open, onOpenChange, onImported,
}: {
  estabelecimentoId: number;
  estabelecimentoNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const { user } = useAuth();
  const userId = Number(user?.id ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [confirmarSubstituicao, setConfirmarSubstituicao] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState<WarleineAttempt | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<WarleineUploadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const current = useRef({ open, userId, estabelecimentoId });
  current.current = { open, userId, estabelecimentoId };
  const requestRef = useRef<AbortController | null>(null);
  const notifiedRef = useRef<string | null>(null);
  const importedRef = useRef(onImported);
  importedRef.current = onImported;

  const lotesQuery = trpc.warleineFaturamento.lotesRelatorio.useQuery(
    { estabelecimentoId },
    { enabled: open && estabelecimentoId > 0, refetchInterval: open ? 10000 : false },
  );
  const lotes = lotesQuery.data || [];

  useEffect(() => {
    requestRef.current?.abort();
    setUploading(false);
    setFile(null);
    setFileInputKey(k => k + 1);
    setProgress(0);
    setConfirmarSubstituicao(false);
    setAttemptStatus(null);
    setError(null);
    setStorageAvailable(false);
    if (!open || userId <= 0 || estabelecimentoId <= 0) return;
    try {
      const saved = readWarleineAttempt(sessionStorage, userId, estabelecimentoId);
      setAttempt(saved);
      setStorageAvailable(true);
    } catch {
      setAttempt(null);
      setError("Não foi possível ler a tentativa preservada. Verificação necessária antes de novo envio.");
    }
    return () => { requestRef.current?.abort(); };
  }, [open, userId, estabelecimentoId]);

  const acceptStatus = (status: WarleineUploadStatus, captured: { userId: number; estabelecimentoId: number }, signal: AbortSignal) => {
    if (signal.aborted || !current.current.open || current.current.userId !== captured.userId
      || current.current.estabelecimentoId !== captured.estabelecimentoId) return;
    setAttemptStatus(status);
    setError(status.state === "erro" || status.jobStatus === "erro"
      ? "O lote apresentou erro. Nenhuma publicação foi confirmada por esta tentativa."
      : status.state === "expirado" ? "A sessão expirou; verificação necessária antes de novo envio." : null);
    if (!isWarleinePublished(status.jobStatus) || !status.loteId) return;
    const receiptIdentity = `${captured.userId}:${captured.estabelecimentoId}:${status.loteId}`;
    if (notifiedRef.current === receiptIdentity) return;
    notifiedRef.current = receiptIdentity;
    toast.success(`Lote #${status.loteId} Warleine publicado com sucesso.`);
    importedRef.current?.();
    setFile(null);
    setFileInputKey(k => k + 1);
    setConfirmarSubstituicao(false);
    try {
      clearWarleineAttempt(sessionStorage, captured.userId, captured.estabelecimentoId);
      setAttempt(null);
    } catch {
      setError("Publicação confirmada, mas a tentativa local não pôde ser limpa. Verifique antes de novo envio.");
      setStorageAvailable(false);
    }
    void lotesQuery.refetch();
  };

  // A status read is the authority for this exact session. The disappearance of
  // another lot from the history, an empty response or a network error is not success.
  useEffect(() => {
    if (!open || !attempt?.sessionId || uploading || userId <= 0) return;
    const abort = new AbortController();
    const captured = { userId, estabelecimentoId };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const status = await getWarleineUploadStatus(estabelecimentoId, attempt.sessionId!, abort.signal);
        acceptStatus(status, captured, abort.signal);
        if (!abort.signal.aborted && !isWarleinePublished(status.jobStatus)) {
          timer = setTimeout(() => { void read(); }, status.state === "recebendo" ? 10000 : 3000);
        }
      } catch {
        if (!abort.signal.aborted && current.current.estabelecimentoId === captured.estabelecimentoId
          && current.current.userId === captured.userId) {
          setError("Não foi possível confirmar o estado. A mesma tentativa foi preservada; não inicie outro envio.");
          timer = setTimeout(() => { void read(); }, 10000);
        }
      }
    };
    void read();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
    // onImported/cache callbacks are deliberately read through refs, not polling dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt?.sessionId, uploading, userId, estabelecimentoId]);

  const verifyAttempt = async () => {
    if (!attempt?.sessionId || uploading) return;
    const abort = new AbortController();
    requestRef.current?.abort();
    requestRef.current = abort;
    try {
      const status = await getWarleineUploadStatus(estabelecimentoId, attempt.sessionId, abort.signal);
      acceptStatus(status, { userId, estabelecimentoId }, abort.signal);
    } catch {
      if (!abort.signal.aborted) setError("Estado ainda não confirmado. A mesma tentativa permanece preservada.");
    }
  };

  const handleUpload = async () => {
    if (!file || !confirmarSubstituicao || !storageAvailable || uploading || userId <= 0) return;
    if (file.size <= 0 || file.size > WARLEINE_UPLOAD_MAX_FILE_BYTES) {
      setError("Selecione um arquivo de até 300 MiB.");
      return;
    }
    const abort = new AbortController();
    const captured = { userId, estabelecimentoId };
    requestRef.current?.abort();
    requestRef.current = abort;
    setUploading(true);
    setProgress(0);
    setError(null);
    const isCurrent = () => !abort.signal.aborted && current.current.open
      && current.current.userId === captured.userId && current.current.estabelecimentoId === captured.estabelecimentoId;
    try {
      const receipt = await uploadWarleineInParts({
        file, userId, hospitalId: estabelecimentoId, storage: sessionStorage, signal: abort.signal,
        onAttempt: saved => { if (isCurrent()) setAttempt(saved); },
        onProgress: (bytes, total) => { if (isCurrent()) setProgress(Math.floor(bytes / total * 100)); },
      });
      if (!isCurrent()) return;
      setFile(null);
      setFileInputKey(k => k + 1);
      setConfirmarSubstituicao(false);
      if (receipt.status === "erro") toast.error(statusWarleineMessage(receipt.status));
      else if (receipt.status !== "publicado") toast.info(statusWarleineMessage(receipt.status));
      const status = await getWarleineUploadStatus(estabelecimentoId, receipt.sessionId, abort.signal);
      acceptStatus(status, captured, abort.signal);
      await lotesQuery.refetch();
    } catch (failure) {
      if (isCurrent()) {
        const message = failure instanceof Error ? failure.message : "Resultado ainda não confirmado. Retome a mesma tentativa.";
        // The helper never forwards a backend exception or response body here.
        setError(message);
        toast.error(message);
      }
    } finally {
      if (isCurrent()) setUploading(false);
    }
  };

  const pending = attempt !== null;
  const receiving = !attemptStatus || attemptStatus.state === "recebendo";
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) requestRef.current?.abort(); onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-600" />
            Importar Faturamento Warleine — {estabelecimentoNome}
          </DialogTitle>
          <DialogDescription>
            Envie CSV separado por ponto e vírgula, ZIP com um CSV ou XLSX com as 48 colunas padrão.
            Limite de 300 MiB por arquivo; envio em partes de até 4 MiB, cifradas no armazenamento durável.
            O recebimento do arquivo não confirma sua publicação.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}
          {pending && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <p>Tentativa preservada nesta unidade. {attemptStatus?.loteId ? `Lote #${attemptStatus.loteId}. ` : ""}
                {attemptStatus?.jobStatus ? statusWarleineMessage(attemptStatus.jobStatus)
                  : attemptStatus?.state === "finalizando" ? "Confirmando integridade e recebimento; não inicie outra tentativa."
                  : "Para retomar o upload, selecione o mesmo arquivo original. Nenhuma nova tentativa será criada."}</p>
              {attempt?.sessionId && <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => { void verifyAttempt(); }}>
                <RefreshCw className="mr-1 h-3 w-3" />Verificar tentativa
              </Button>}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="warleine-file-input">Arquivo Warleine (.zip, .csv ou .xlsx)</Label>
              <Input key={fileInputKey} id="warleine-file-input" type="file" accept=".zip,.csv,.xlsx"
                disabled={uploading || !storageAvailable || !receiving}
                onChange={e => setFile(e.target.files?.[0] || null)} className="bg-white cursor-pointer" />
              {file && <p className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
                <FileArchive className="h-3.5 w-3.5 text-indigo-600" />
                <span>Selecionado: <strong>{file.name}</strong> ({(file.size / (1024 * 1024)).toFixed(2)} MiB)</span>
              </p>}
            </div>
            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="confirmar-substituicao" checked={confirmarSubstituicao}
                disabled={uploading || !receiving} onCheckedChange={checked => setConfirmarSubstituicao(checked === true)} />
              <Label htmlFor="confirmar-substituicao" className="text-xs leading-5 text-slate-600 font-normal cursor-pointer">
                Confirmo que este arquivo representa o snapshot completo das competências nele contidas para <strong>{estabelecimentoNome}</strong>,
                mantendo isolamento das demais unidades e fontes. A substituição só ocorrerá após validação e publicação confirmadas.
              </Label>
            </div>
            {uploading && <div role="status" className="text-xs text-indigo-700">{progress < 100 ? `Enviando partes: ${progress}%` : "Partes enviadas. Confirmando recebimento durável..."}</div>}
            <div className="flex justify-end">
              <Button type="button" onClick={() => { void handleUpload(); }}
                disabled={!file || !confirmarSubstituicao || uploading || !storageAvailable || !receiving}
                className="bg-indigo-600 text-white hover:bg-indigo-700">
                {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando partes...</>
                  : <><Upload className="mr-2 h-4 w-4" />{pending ? "Retomar a mesma tentativa" : "Enviar para validação"}</>}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico de lotes da unidade</h3>
              {lotesQuery.isFetching && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Atualizando...</span>}
            </div>
            {lotesQuery.isError ? <p role="alert" className="text-xs text-rose-700">Histórico indisponível. Isso não confirma a conclusão de nenhum lote.</p>
              : lotes.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">Nenhum lote Warleine disponível para {estabelecimentoNome}.</div>
              : <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200"><table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200"><tr>
                  <th className="px-3 py-2">Lote / Arquivo</th><th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Linhas</th><th className="px-3 py-2 text-right">Faturado</th><th className="px-3 py-2 text-right">Recebido</th>
                </tr></thead><tbody className="divide-y divide-slate-100">{lotes.map(lote => <tr key={lote.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2"><div className="font-medium text-slate-900">#{lote.id} — {lote.arquivoNome}</div>
                    {lote.competencias?.length > 0 && <div className="text-[11px] text-slate-500">Competências: {lote.competencias.join(", ")}</div>}
                    {lote.erroResumo && <div className="text-[11px] text-rose-600 mt-0.5">{lote.erroResumo}</div>}
                  </td>
                  <td className="px-3 py-2">{lote.status === "publicado" ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="mr-1 h-3 w-3" />Publicado</Badge>
                    : lote.status === "erro" ? <Badge className="bg-rose-100 text-rose-800 border-rose-200"><AlertCircle className="mr-1 h-3 w-3" />Erro</Badge>
                    : <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Clock className="mr-1 h-3 w-3" />{lote.status}</Badge>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(lote.status === "publicado" ? lote.totalPublicadas : lote.totalLinhas ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{money(lote.valorFaturado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-teal-700 font-medium">{money(lote.valorTotalRecebido)}</td>
                </tr>)}</tbody></table></div>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => { requestRef.current?.abort(); onOpenChange(false); }}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
