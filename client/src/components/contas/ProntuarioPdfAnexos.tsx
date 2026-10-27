import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import type { ScopeContaMedica } from "@shared/contaContextoMedico";
import {
  Download,
  FileLock2,
  FileText,
  Info,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 5 * 1024 * 1024;

function formatarBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function validarPdfNoCliente(file: File): string | null {
  if (file.size === 0) return "O PDF está vazio.";
  if (file.size > MAX_BYTES) return "O PDF deve ter no máximo 5 MB.";
  if (!/\.pdf$/i.test(file.name))
    return "Selecione um arquivo com extensão .pdf.";
  return null;
}

/**
 * Não há preview, iframe, OCR ou URL de storage. A leitura é apenas por download
 * autenticado como attachment após o serviço validar o escopo completo no servidor.
 */
export function ProntuarioPdfAnexos({ scope }: { scope: ScopeContaMedica }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(
    null
  );
  const [enviando, setEnviando] = useState(false);
  const utils = trpc.useUtils();
  // O contrato do anexo usa strings vazias como parte explícita da chave canônica
  // quando lote ou competência não vierem materializados no XML.
  const escopo = {
    ...scope,
    numeroLote: scope.numeroLote ?? "",
    competencia: scope.competencia ?? "",
  };
  const anexos = trpc.prontuarioPdf.listar.useQuery(escopo);

  const atualizar = async () => {
    await utils.prontuarioPdf.listar.invalidate(escopo);
  };

  const inativar = trpc.prontuarioPdf.inativar.useMutation({
    onSuccess: async () => {
      toast.success("Anexo de prontuário inativado.");
      await atualizar();
    },
    onError: error => toast.error(error.message),
  });

  const selecionarArquivo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const erro = validarPdfNoCliente(file);
    if (erro) {
      event.target.value = "";
      setArquivoSelecionado(null);
      toast.error(erro);
      return;
    }
    setArquivoSelecionado(file);
  };

  const enviar = async () => {
    if (!arquivoSelecionado || enviando) return;
    setEnviando(true);
    try {
      const formulario = new FormData();
      formulario.set("file", arquivoSelecionado, arquivoSelecionado.name);
      formulario.set("estabelecimentoId", String(escopo.estabelecimentoId));
      formulario.set("convenioId", String(escopo.convenioId));
      formulario.set("arquivoHospitalId", String(escopo.arquivoHospitalId));
      formulario.set("numeroConta", escopo.numeroConta);
      formulario.set("numeroLote", escopo.numeroLote);
      formulario.set("competencia", escopo.competencia);
      formulario.set("nomeArquivo", arquivoSelecionado.name);
      formulario.set("confirmar", "true");

      const response = await fetch("/api/prontuario-pdf/upload", {
        method: "POST",
        body: formulario,
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Não foi possível anexar o PDF de prontuário."
        );
      }
      setArquivoSelecionado(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success("PDF de prontuário anexado de forma protegida.");
      await atualizar();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar o PDF de prontuário."
      );
    } finally {
      setEnviando(false);
    }
  };

  const baixar = (anexoId: number) => {
    const query = new URLSearchParams({
      estabelecimentoId: String(scope.estabelecimentoId),
      convenioId: String(scope.convenioId),
      arquivoHospitalId: String(scope.arquivoHospitalId),
      numeroConta: scope.numeroConta,
      numeroLote: escopo.numeroLote,
      competencia: escopo.competencia,
      anexoId: String(anexoId),
    });
    window.location.assign(`/api/prontuario-pdf/download?${query.toString()}`);
  };

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-blue-950">
              <FileLock2 className="h-5 w-5 text-blue-700" />
              Anexos seguros de prontuário
            </CardTitle>
            <CardDescription className="mt-1">
              PDF vinculado ao XML hospitalar canônico desta conta, somente para
              apoio clínico.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="gap-1 border-blue-200 bg-blue-50 text-blue-800"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> AES-256-GCM
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Somente download protegido</AlertTitle>
          <AlertDescription>
            Máximo de 5 MB. O PDF não possui prévia, iframe, OCR ou URL pública
            e não compõe informações financeiras.
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border border-dashed border-blue-200 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="prontuario-pdf-arquivo">
                Novo PDF de prontuário
              </Label>
              <Input
                ref={inputRef}
                id="prontuario-pdf-arquivo"
                type="file"
                accept="application/pdf,.pdf"
                onChange={selecionarArquivo}
                disabled={enviando}
              />
              <p className="text-xs text-muted-foreground">
                {arquivoSelecionado
                  ? `${arquivoSelecionado.name} · ${formatarBytes(arquivoSelecionado.size)}`
                  : "Selecione um PDF de até 5 MB."}
              </p>
            </div>
            <Button onClick={enviar} disabled={!arquivoSelecionado || enviando}>
              {enviando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Anexar PDF
            </Button>
          </div>
        </div>

        <Separator />
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">PDFs ativos</h3>
          {anexos.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : anexos.error ? (
            <Alert variant="destructive">
              <AlertTitle>Não foi possível listar os anexos</AlertTitle>
              <AlertDescription>{anexos.error.message}</AlertDescription>
            </Alert>
          ) : !anexos.data?.length ? (
            <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 h-7 w-7 opacity-60" />
              Nenhum PDF de prontuário ativo para este escopo.
            </div>
          ) : (
            <div className="space-y-2">
              {anexos.data.map(anexo => (
                <div
                  key={anexo.id}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {anexo.nomeArquivo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatarBytes(anexo.tamanhoBytes)} · anexado em{" "}
                      {new Date(anexo.criadoEm).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => baixar(anexo.id)}
                    >
                      <Download className="mr-2 h-4 w-4" /> Baixar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={inativar.isPending}
                      onClick={() =>
                        inativar.mutate({
                          ...escopo,
                          anexoId: anexo.id,
                          confirmar: true,
                        })
                      }
                    >
                      {inativar.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Inativar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
