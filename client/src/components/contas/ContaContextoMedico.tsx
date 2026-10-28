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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type {
  CandidatoGabarito,
  ContaContextoMedicoResultado,
  ContextoMedicoInfo,
  DiagnosticoSnapshotHospitalar,
  FonteMedicaInfo,
  ProcedimentoMedicoInfo,
  ScopeContaMedica,
} from "@shared/contaContextoMedico";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  Info,
  Loader2,
  Stethoscope,
  UserRound,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

export type ContaContextoMedicoScopeState =
  | { ready: true; scope: ScopeContaMedica }
  | { ready: false; reason: string };

type ConfirmAction = {
  padraoId: number;
  nome: string;
};

export type ContaContextoMedicoConteudoProps = {
  resultado?: ContaContextoMedicoResultado;
  isLoading?: boolean;
  errorMessage?: string;
  isConfirming?: boolean;
  isInvalidating?: boolean;
  onConfirmar?: (padraoId: number, justificativa: string) => void;
  onInvalidar?: (justificativa: string) => void;
  onRecarregar?: () => void;
};

const MAX_PROCEDIMENTOS_VISIVEIS = 6;
const MAX_CODIGOS_VISIVEIS = 2;

function getStatusContexto(contexto: ContextoMedicoInfo | null | undefined) {
  if (!contexto) return null;
  if (contexto.status === "confirmado") {
    return {
      label: "Confirmado",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (contexto.status === "invalidado") {
    return {
      label: "Invalidado",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }
  return {
    label: "Revisão necessária",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function mensagemPrecondicaoSnapshot(
  diagnostico: DiagnosticoSnapshotHospitalar | null | undefined
): string | null {
  if (!diagnostico) return null;
  const total = (
    etapa: DiagnosticoSnapshotHospitalar["etapas"][number]["etapa"]
  ) => diagnostico.etapas.find(item => item.etapa === etapa)?.totalLinhas ?? 0;
  if (total("arquivo_hospitalar") === 0) {
    return "Os itens hospitalares ainda não estão disponíveis para preparar este contexto.";
  }
  if (total("identificacao_conta") === 0) {
    return "Os itens hospitalares ainda não possuem uma identificação de conta compatível para preparar este contexto.";
  }
  if (total("lote") === 0) {
    return "Os itens hospitalares ainda não possuem um lote compatível para preparar este contexto.";
  }
  return "Os itens hospitalares ainda não possuem uma competência compatível para preparar este contexto.";
}

function ProcedimentoCard({
  procedimento,
}: {
  procedimento: ProcedimentoMedicoInfo;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">
            {procedimento.codigo}
          </p>
          <p className="text-sm text-foreground">{procedimento.descricao}</p>
        </div>
        {procedimento.dataExecucao ? (
          <Badge variant="outline" className="font-normal">
            {procedimento.dataExecucao}
          </Badge>
        ) : null}
      </div>
      {procedimento.profissionais.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {procedimento.profissionais.map((profissional, index) => {
            const registro = [
              profissional.conselho,
              profissional.numeroConselho,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <Badge
                key={`${profissional.nome}-${registro}-${index}`}
                variant="secondary"
                className="max-w-full gap-1.5 whitespace-normal text-left font-normal"
              >
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {profissional.nome}
                  {registro ? ` — ${registro}` : ""}
                </span>
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Profissional não informado no XML.
        </p>
      )}
    </div>
  );
}

function FonteMedicaCard({ fonte }: { fonte: FonteMedicaInfo }) {
  const [expandida, setExpandida] = useState(false);
  const procedimentosVisiveis = expandida
    ? fonte.procedimentos
    : fonte.procedimentos.slice(0, MAX_PROCEDIMENTOS_VISIVEIS);
  const todosCodigos = Array.from(
    new Set(fonte.procedimentos.map(item => item.codigo))
  );
  const codigosVisiveis = expandida
    ? todosCodigos
    : todosCodigos.slice(0, MAX_CODIGOS_VISIVEIS);
  const temConteudoOculto =
    fonte.procedimentos.length > MAX_PROCEDIMENTOS_VISIVEIS ||
    todosCodigos.length > MAX_CODIGOS_VISIVEIS;

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-sky-700" />
              XML médico indexado
            </CardTitle>
            <CardDescription className="mt-1">
              Fonte médica indexada exclusivamente para consulta informativa.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{fonte.registros} registros</Badge>
            <Badge variant="outline">{fonte.codigosDistintos} códigos</Badge>
          </div>
        </div>
        {codigosVisiveis.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {codigosVisiveis.map(codigo => (
              <Badge
                key={codigo}
                className="bg-sky-100 text-sky-800 hover:bg-sky-100"
              >
                {codigo}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {procedimentosVisiveis.map((procedimento, index) => (
          <ProcedimentoCard
            key={`${procedimento.codigo}-${procedimento.sequencial ?? "sem-sequencial"}-${index}`}
            procedimento={procedimento}
          />
        ))}
        {temConteudoOculto ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandida(value => !value)}
            className="gap-1"
          >
            {expandida ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {expandida
              ? "Mostrar menos"
              : `Ver todos os ${fonte.procedimentos.length} procedimentos e ${todosCodigos.length} códigos`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CandidateCard({
  candidato,
  onConfirmar,
  confirmando,
  confirmacaoBloqueada,
}: {
  candidato: CandidatoGabarito;
  onConfirmar: () => void;
  confirmando: boolean;
  confirmacaoBloqueada: boolean;
}) {
  const composicao = candidato.composicao;
  const items = composicao?.itens ?? [];

  return (
    <div
      className={`rounded-lg border p-4 ${candidato.elegivel ? "border-emerald-200 bg-emerald-50/30" : "border-border bg-muted/20"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{candidato.nome}</h4>
            {candidato.recomendacao ? (
              <Badge className="bg-emerald-600">Recomendado</Badge>
            ) : null}
            <Badge
              variant={candidato.elegivel ? "default" : "outline"}
              className={candidato.elegivel ? "bg-emerald-600" : ""}
            >
              {candidato.elegivel ? "Elegível" : "Inelegível"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Principais encontrados: {candidato.principaisEncontrados} de{" "}
            {candidato.principaisTotal}.
          </p>
        </div>
        <Button
          size="sm"
          onClick={onConfirmar}
          disabled={!candidato.elegivel || confirmando || confirmacaoBloqueada}
        >
          {confirmando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Confirmar composição
        </Button>
      </div>

      {candidato.motivos.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          {candidato.motivos.map(motivo => (
            <li key={motivo} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{motivo}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 rounded-md border bg-background/80 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Prévia da composição hospitalar
          </p>
          <div className="space-y-2 text-sm">
            {items.map(item => (
              <div
                key={`${item.codigo}-${item.descricao}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs">{item.codigo}</span>
                  <span className="mx-1.5 text-muted-foreground">—</span>
                  <span>{item.descricao}</span>
                  {item.categoria ? (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {item.categoria}
                    </Badge>
                  ) : null}
                  {item.grupo ? (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      OR: {item.grupo}
                    </Badge>
                  ) : null}
                </div>
                <Badge
                  variant={
                    item.presenca === "presente" ||
                    item.presenca === "satisfeito_por_grupo"
                      ? "secondary"
                      : "outline"
                  }
                  className={
                    item.presenca === "presente" ||
                    item.presenca === "satisfeito_por_grupo"
                      ? "bg-emerald-100 text-emerald-800"
                      : item.pendencia
                        ? "border-amber-300 text-amber-800"
                        : "border-slate-200 text-slate-600"
                  }
                >
                  {item.presenca === "presente"
                    ? "Presente"
                    : item.presenca === "satisfeito_por_grupo"
                      ? "Satisfeito por grupo"
                      : item.pendencia
                        ? "Ausente — pendência"
                        : "Ausente — sem pendência"}
                </Badge>
              </div>
            ))}
            {composicao.gruposAlternativos > 0 ? (
              <p className="rounded border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
                {composicao.gruposAlternativos} grupo(s) alternativo(s):{" "}
                {composicao.gruposObrigatoriosAusentes} obrigatório(s)
                ausente(s) e {composicao.gruposOpcionaisAusentes} opcional(is)
                ausente(s), sem pendência automática para grupos opcionais.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ContaContextoMedicoConteudo({
  resultado,
  isLoading = false,
  errorMessage,
  isConfirming = false,
  isInvalidating = false,
  onConfirmar,
  onInvalidar,
  onRecarregar,
}: ContaContextoMedicoConteudoProps) {
  const podeConfirmar =
    justificativaConfirmacao.trim().length > 0 &&
    Boolean(confirmAction) &&
    !isConfirming;
  const podeInvalidar =
    justificativaInvalidacao.trim().length > 0 &&
    Boolean(contexto) &&
    !isInvalidating;

  const confirmar = () => {
    if (!confirmAction || !onConfirmar || !justificativaConfirmacao.trim())
      return;
    onConfirmar(confirmAction.padraoId, justificativaConfirmacao.trim());
  };
  const invalidar = () => {
    if (!onInvalidar || !justificativaInvalidacao.trim()) return;
    onInvalidar(justificativaInvalidacao.trim());
  };

  return (
    <div className="space-y-4">
      <Card className="border-sky-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-sky-950 dark:text-sky-100">
                <Stethoscope className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                Contexto médico informativo
              </CardTitle>
              <CardDescription className="mt-1">
                Informações médicas do XML são apenas informativas e não alteram
                cobrança. A identificação do profissional fica fora do
                financeiro.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="w-fit border-sky-200 bg-sky-50 text-sky-800"
            >
              Setor: Não informado no XML
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>
                Não foi possível consultar o contexto médico
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Não foi possível carregar o contexto médico agora. Recarregue
                  a tela e tente novamente.
                </p>
                {onRecarregar ? (
                  <Button variant="outline" size="sm" onClick={onRecarregar}>
                    Recarregar contexto
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {mensagemSnapshot ? (
            <Alert>
              <Info />
              <AlertTitle>Contexto hospitalar ainda não está pronto</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{mensagemSnapshot}</p>
                {onRecarregar ? (
                  <Button variant="outline" size="sm" onClick={onRecarregar}>
                    Recarregar contexto
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {resultado?.configuracaoPendente ? (
            <Alert>
              <Info />
              <AlertTitle>Configuração pendente</AlertTitle>
              <AlertDescription>
                O contexto é apenas informativo e não pode ser confirmado
                enquanto a configuração necessária não estiver disponível.
              </AlertDescription>
            </Alert>
          ) : null}
          {resultado?.avisos.map(aviso => (
            <Alert key={aviso}>
              <Info />
              <AlertDescription>{aviso}</AlertDescription>
            </Alert>
          ))}

          <Alert className="border-sky-200 bg-sky-50/50">
            <Info />
            <AlertTitle>Associação automática no upload</AlertTitle>
                <AlertDescription>
              Ao importar um XML médico de honorários, o Portal associa as guias
              somente quando encontra uma correspondência única no mesmo
              hospital e convênio. Nenhum vínculo financeiro é criado. Arquivos
              ambíguos ou sem correspondência ficam bloqueados para revisão.
                </AlertDescription>
              </Alert>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : null}

          {!isLoading && resultado ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Itens hospitalares avaliados
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {resultado.itensHospitalares}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Setor</p>
                  <p className="mt-1 text-sm font-medium">
                    {resultado.setorInformado
                      ? "Informado no XML"
                      : "Não informado no XML"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Abrangência</p>
                  <p className="mt-1 text-sm font-medium">
                    {contexto?.abrangencia === "conta_inteira_sem_setor"
                      ? "Conta inteira, sem setor"
                      : "Conta inteira"}
                  </p>
                </div>
              </div>

              {resultado.fontes.length > 0 ? (
                <div className="space-y-3">
                  {resultado.fontes.map((fonte, indice) => (
                    <FonteMedicaCard
                      key={`${fonte.arquivoId}-${indice}`}
                      fonte={fonte}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Nenhum XML médico indexado</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Importe o XML médico de honorários pela tela de Arquivos.
                    Quando a correspondência for única, os procedimentos e
                    profissionais aparecerão automaticamente nesta conta.
                  </p>
                </div>
              )}

              <Separator />
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">Composição por gabarito</h3>
                  <p className="text-sm text-muted-foreground">
                    A recomendação só aparece quando todos os procedimentos
                    principais do escopo exato estão presentes e há um único
                    candidato elegível. Pendências de composição permanecem
                    visíveis para revisão humana e não reclassificam o
                    candidato.
                  </p>
                </div>
                {resultado.candidatos.length > 0 ? (
                  resultado.candidatos.map(candidato => (
                    <CandidateCard
                      key={candidato.padraoId}
                      candidato={candidato}
                      confirmando={isConfirming}
                      confirmacaoBloqueada={configuracaoPendente}
                      onConfirmar={() => {
                        setConfirmAction({
                          padraoId: candidato.padraoId,
                          nome: candidato.nome,
                        });
                        setJustificativaConfirmacao("");
                      }}
                    />
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Não há candidatos de gabarito para este escopo.
                  </p>
                )}
              </div>

              {contexto ? (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          Histórico da composição
                        </h3>
                        {statusContexto ? (
                          <Badge
                            variant="outline"
                            className={statusContexto.className}
                          >
                            {statusContexto.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {contexto.nomePadrao} · revisão {contexto.revisao} ·{" "}
                        {contexto.abrangencia === "conta_inteira_sem_setor"
                          ? "conta inteira sem setor"
                          : "conta inteira"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contexto.confirmadoEm
                          ? `Registrado em ${formatDateTime(contexto.confirmadoEm)}.`
                          : "Sem data de confirmação disponível."}{" "}
                        Uma alteração de revisão exige nova confirmação.
                      </p>
                      {contexto.justificativa ? (
                        <p className="mt-2 text-sm">
                          Justificativa: {contexto.justificativa}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      className="border-amber-300 text-amber-800 hover:bg-amber-50"
                      onClick={() => {
                        setInvalidarAberto(true);
                        setJustificativaInvalidacao("");
                      }}
                      disabled={isInvalidating}
                    >
                      <History className="mr-2 h-4 w-4" />
                      Invalidar com histórico
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={open => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar composição informativa</DialogTitle>
            <DialogDescription>
              Você confirmará “{confirmAction?.nome}” para a conta inteira. Esta
              ação registra somente uma decisão informativa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="justificativa-confirmacao">
              Justificativa obrigatória
            </Label>
            <Textarea
              id="justificativa-confirmacao"
              value={justificativaConfirmacao}
              onChange={event =>
                setJustificativaConfirmacao(event.target.value)
              }
              placeholder="Descreva a revisão humana da composição."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={isConfirming}
            >
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar}>
              {isConfirming ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invalidarAberto} onOpenChange={setInvalidarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalidar confirmação</DialogTitle>
            <DialogDescription>
              A invalidação mantém o histórico, incrementa a revisão e exige
              nova confirmação antes de qualquer uso informativo futuro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="justificativa-invalidacao">
              Justificativa obrigatória
            </Label>
            <Textarea
              id="justificativa-invalidacao"
              value={justificativaInvalidacao}
              onChange={event =>
                setJustificativaInvalidacao(event.target.value)
              }
              placeholder="Explique por que a composição deve ser invalidada."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInvalidarAberto(false)}
              disabled={isInvalidating}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={invalidar}
              disabled={!podeInvalidar}
            >
              {isInvalidating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Invalidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContaContextoMedicoDisponivel({ scope }: { scope: ScopeContaMedica }) {
  const utils = trpc.useUtils();
  const consulta = trpc.contaContextoMedico.consultar.useQuery({ scope });

  const atualizar = async () => {
    await utils.contaContextoMedico.consultar.invalidate({ scope });
  };

  const confirmar = trpc.contaContextoMedico.confirmar.useMutation({
    onSuccess: async () => {
      toast.success("Composição informativa confirmada.");
      await atualizar();
    },
    onError: error => toast.error(error.message),
  });
  const invalidar = trpc.contaContextoMedico.invalidar.useMutation({
    onSuccess: async () => {
      toast.success("Confirmação invalidada; o histórico foi preservado.");
      await atualizar();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <ContaContextoMedicoConteudo
      resultado={consulta.data}
      isLoading={consulta.isLoading}
      errorMessage={consulta.error?.message}
      isConfirming={confirmar.isPending}
      isInvalidating={invalidar.isPending}
      onRecarregar={() => {
        void atualizar();
      }}
      onConfirmar={(padraoId, justificativa) =>
        confirmar.mutate({
          scope,
          padraoId,
          justificativa,
          revisaoEsperada: consulta.data?.contexto?.revisao ?? 0,
        })
      }
      onInvalidar={justificativa =>
        invalidar.mutate({
          scope,
          justificativa,
          revisaoEsperada: consulta.data?.contexto?.revisao ?? 0,
        })
      }
    />
  );
}

function ContaContextoMedicoIndisponivel({ reason }: { reason: string }) {
  void reason;
  return (
    <Card className="border-sky-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Stethoscope className="h-5 w-5 text-sky-700" />
          Contexto médico informativo
        </CardTitle>
        <CardDescription>
          Honorários: informação médica — fora do financeiro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertTriangle />
          <AlertTitle>Contexto indisponível para esta conta</AlertTitle>
          <AlertDescription>
            Não foi possível preparar o contexto médico para esta conta.
            Recarregue a tela e tente novamente.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export function ContaContextoMedico({
  scopeState,
}: {
  scopeState: ContaContextoMedicoScopeState;
}) {
  return scopeState.ready ? (
    <ContaContextoMedicoDisponivel scope={scopeState.scope} />
  ) : (
    <ContaContextoMedicoIndisponivel reason={scopeState.reason} />
  );
}
