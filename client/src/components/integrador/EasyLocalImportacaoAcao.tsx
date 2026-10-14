import { useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Previa = {
  tokenPrevia: string;
  registrosLidos: number;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosInalterados: number;
  nomeTabela: string;
  limite: number;
  expiraEm: string;
};

export function EasyLocalImportacaoAcao({
  estabelecimentoId,
  leituraId,
  nomeTabela,
}: {
  estabelecimentoId: number;
  leituraId: number;
  nomeTabela: string;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const utils = trpc.useUtils();
  const preview = trpc.easyLocalIntegrador.preverImportacao.useMutation({
    retry: false,
    onSuccess: data => {
      setPrevia(data);
      setConfirmado(false);
      setMensagem(null);
      setErro(false);
    },
    onError: () => {
      setPrevia(null);
      setErro(true);
      setMensagem(
        "Prévia não confirmada. Confira a conexão, a chave única, os tipos e o limite do lote. Nenhum dado foi importado."
      );
    },
  });
  const execute = trpc.easyLocalIntegrador.executarImportacao.useMutation({
    retry: false,
    onSuccess: data => {
      setPrevia(null);
      setConfirmado(false);
      setErro(false);
      setMensagem(
        `Importação confirmada: ${data.registrosInseridos} inseridos, ${data.registrosAtualizados} atualizados e ${data.registrosInalterados} inalterados.`
      );
      void utils.easyLocalIntegrador.listarTabelas.invalidate({
        estabelecimentoId,
      });
      void utils.easyLocalIntegrador.listarLeituras.invalidate({
        estabelecimentoId,
      });
    },
    onError: () => {
      setPrevia(null);
      setConfirmado(false);
      setErro(true);
      setMensagem(
        "Resultado da importação não confirmado. Confira o destino antes de repetir e gere uma nova prévia; não há repetição automática."
      );
    },
  });
  const busy = preview.isPending || execute.isPending;
  const expirada = previa ? Date.parse(previa.expiraEm) <= Date.now() : true;
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          setPrevia(null);
          preview.mutate({ estabelecimentoId, leituraId });
        }}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Search className="mr-2 h-4 w-4" />
        )}
        Revisar importação
      </Button>
      {mensagem && (
        <p
          role="status"
          className={`max-w-sm text-xs ${erro ? "text-destructive" : "text-muted-foreground"}`}
        >
          {mensagem}
        </p>
      )}
      <Dialog
        open={Boolean(previa)}
        onOpenChange={open => {
          if (!open && !execute.isPending) {
            setPrevia(null);
            setConfirmado(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar EASYLocal → Portal</DialogTitle>
            <DialogDescription>
              Confira a prévia antes de importar para {nomeTabela}. A origem não
              recebe alterações.
            </DialogDescription>
          </DialogHeader>
          {previa && (
            <>
              <div className="rounded-md border p-3 text-sm">
                <p className="break-all">
                  <strong>Destino no Portal:</strong> {previa.nomeTabela}
                </p>
                <p>
                  <strong>Estabelecimento:</strong> {estabelecimentoId}
                </p>
                <p>
                  <strong>Registros lidos:</strong> {previa.registrosLidos}
                </p>
                <p>
                  <strong>Novos:</strong> {previa.registrosInseridos}
                </p>
                <p>
                  <strong>Alterados:</strong> {previa.registrosAtualizados}
                </p>
                <p>
                  <strong>Inalterados:</strong> {previa.registrosInalterados}
                </p>
              </div>
              <Alert>
                <AlertTitle>Uma execução manual, sem limpeza</AlertTitle>
                <AlertDescription>
                  Até {previa.limite} registros por lote. O destino não será
                  truncado e registros ausentes na origem não serão excluídos.
                  Esta importação preenche a tabela gerenciada; a publicação nas
                  páginas finais depende do adaptador do domínio. Não ativa os
                  horários de busca.
                </AlertDescription>
              </Alert>
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`importacao-${leituraId}`}
                  checked={confirmado}
                  disabled={execute.isPending}
                  onCheckedChange={value => setConfirmado(value === true)}
                />
                <Label
                  htmlFor={`importacao-${leituraId}`}
                  className="text-sm leading-5"
                >
                  Confirmo a inserção e atualização deste recorte no destino
                  indicado.
                </Label>
              </div>
              {expirada && (
                <p className="text-sm text-destructive">
                  A prévia expirou. Feche e gere uma nova prévia.
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={execute.isPending}
              onClick={() => {
                setPrevia(null);
                setConfirmado(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!previa || !confirmado || expirada || execute.isPending}
              onClick={() => {
                if (previa && confirmado)
                  execute.mutate({
                    estabelecimentoId,
                    leituraId,
                    confirmarImportacao: true,
                    tokenPrevia: previa.tokenPrevia,
                  });
              }}
            >
              {execute.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}{" "}
              Importar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
