import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Table2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  HOP_DIARIO_FUSO,
  HOP_DIARIO_HORARIO,
  HOP_DIARIO_UNIDADES,
  type HopDiarioContagens,
  type HopDiarioEscopo,
  type HopDiarioExecucaoResumo,
  type HopDiarioPrevia,
  type HopDiarioResumo,
} from "@shared/atendimentosHopDiario";

const LIMITE_PREVIA_MS = 15 * 60 * 1000;

type UnidadeHopDiarioHabilitada = keyof typeof HOP_DIARIO_UNIDADES;
export type AcaoHopDiario =
  | "confirmarCarga"
  | "gerarCredencial"
  | "prever"
  | "publicar"
  | "ativar";

type DialogoHopDiario = AcaoHopDiario | null;

export type FonteHopDiario = {
  estabelecimentoId: UnidadeHopDiarioHabilitada;
  unidade: string;
  staging: string;
  origem: "WARLEINE";
  chave: "numatend";
  destino: "atendimentos_unificados";
};

export function fonteHopDiario(
  estabelecimentoId: number | null
): FonteHopDiario | null {
  if (estabelecimentoId !== 1260036 && estabelecimentoId !== 2550002) {
    return null;
  }

  const unidade =
    HOP_DIARIO_UNIDADES[estabelecimentoId as UnidadeHopDiarioHabilitada];
  return {
    estabelecimentoId: estabelecimentoId as UnidadeHopDiarioHabilitada,
    unidade: unidade.nome,
    staging: unidade.tabela,
    origem: "WARLEINE",
    chave: "numatend",
    destino: "atendimentos_unificados",
  };
}

export function criarChaveEscopoHopDiario(
  estabelecimentoId: number | null
): string {
  return `atendimentos-hop-diario:${estabelecimentoId ?? "sem-unidade"}`;
}

export function previaEstaValida(
  previa: HopDiarioPrevia | null,
  agora = Date.now()
): boolean {
  if (!previa) return false;
  const expiraEm = Date.parse(previa.expiraEm);
  return Number.isFinite(expiraEm) && expiraEm > agora;
}

export function podeConfirmarCargaInicial(
  resumo: HopDiarioResumo | null,
  confirmarCargaCompleta: boolean,
  confirmarHopParado: boolean
): boolean {
  return Boolean(
    resumo &&
      !resumo.configuracaoPendente &&
      resumo.podeGerenciar &&
      !resumo.ultimoLote &&
      resumo.estado !== "preparando" &&
      resumo.estado !== "incerto" &&
      resumo.estado !== "ativo" &&
      confirmarCargaCompleta &&
      confirmarHopParado
  );
}

export type AcoesHopDiario = {
  bloqueadoPorConcorrencia: boolean;
  bloqueadoPorRevisaoTecnica: boolean;
  podeGerarCredencial: boolean;
  podeRegistrarCarga: boolean;
  podePrepararPrevia: boolean;
  podePublicar: boolean;
  podeAtivar: boolean;
  podePausar: boolean;
};

export function avaliarAcoesHopDiario(
  resumo: HopDiarioResumo | null,
  previa: HopDiarioPrevia | null
): AcoesHopDiario {
  const concorrenciaIncerta =
    resumo?.estado === "preparando" || resumo?.estado === "incerto";
  const requerRevisaoTecnica = resumo?.estado === "erro";
  const baseBloqueada = Boolean(
    !resumo ||
      resumo.configuracaoPendente ||
      !resumo.podeGerenciar ||
      concorrenciaIncerta ||
      requerRevisaoTecnica
  );
  const loteCompleto = resumo?.ultimoLote?.estado === "completo";
  const previaValida = previaEstaValida(previa);

  return {
    bloqueadoPorConcorrencia: concorrenciaIncerta,
    bloqueadoPorRevisaoTecnica: requerRevisaoTecnica,
    podeGerarCredencial: Boolean(
      !baseBloqueada &&
        !resumo?.credencialHopConfigurada &&
        resumo?.estado !== "ativo"
    ),
    podeRegistrarCarga: Boolean(
      !baseBloqueada && !resumo?.ultimoLote && resumo?.estado !== "ativo"
    ),
    podePrepararPrevia: Boolean(
      !baseBloqueada && loteCompleto && resumo?.estado !== "ativo"
    ),
    podePublicar: Boolean(
      !baseBloqueada &&
        previaValida &&
        loteCompleto &&
        resumo?.estado !== "ativo"
    ),
    podeAtivar: Boolean(
      !baseBloqueada &&
        previaValida &&
        loteCompleto &&
        resumo?.credencialHopConfigurada &&
        resumo?.estado !== "ativo"
    ),
    podePausar: Boolean(
      !baseBloqueada && resumo?.estado === "ativo" && resumo.podeGerenciar
    ),
  };
}

export function rotuloEstadoHopDiario(
  estado: HopDiarioResumo["estado"]
): string {
  const rotulos: Record<HopDiarioResumo["estado"], string> = {
    nao_configurado: "Configuração pendente",
    pausado: "Pausado",
    preparando: "Carga em andamento",
    ativo: "Diário ativo",
    erro: "Erro — revisão necessária",
    incerto: "Resultado incerto — bloqueado",
  };
  return rotulos[estado];
}

function rotuloLote(
  estado: HopDiarioResumo["ultimoLote"] extends infer T
    ? T extends { estado: infer E }
      ? E
      : never
    : never
): string {
  const rotulos: Record<string, string> = {
    carregando: "Carregando",
    completo: "Completo",
    publicado: "Publicado",
    falhou: "Falhou",
    incerto: "Incerto",
  };
  return rotulos[String(estado)] ?? String(estado);
}

function dataBrasilia(valor: string | null): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    timeZone: HOP_DIARIO_FUSO,
    dateStyle: "short",
    timeStyle: "short",
  });
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

function estadoExecucao(execucao: HopDiarioExecucaoResumo): string {
  const estado = execucao.estado.trim();
  return estado ? estado.replaceAll("_", " ") : "—";
}

function Contagem({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{numero(valor)}</p>
    </div>
  );
}

function ContagensPrevia({ contagens }: { contagens: HopDiarioContagens }) {
  return (
    <div className="space-y-3" data-testid="hop-diario-contagens-previa">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Contagem rotulo="Total na fonte" valor={contagens.totalFonte} />
        <Contagem rotulo="Ativos antes" valor={contagens.ativosAntes} />
        <Contagem rotulo="Novos" valor={contagens.novos} />
        <Contagem rotulo="Atualizados" valor={contagens.atualizados} />
        <Contagem rotulo="Reativados" valor={contagens.reativados} />
        <Contagem rotulo="Inativados" valor={contagens.inativados} />
        <Contagem rotulo="Inalterados" valor={contagens.inalterados} />
        <Contagem rotulo="Ativos depois" valor={contagens.ativosDepois} />
      </div>
      <p className="text-xs text-muted-foreground">
        Registros ausentes no snapshot completo serão marcados como inativos;
        isso não exclui histórico, anotações, notificações, dados financeiros ou
        registros de outras origens.
      </p>
    </div>
  );
}

export type AtendimentosHopDiarioPainelProps = {
  estabelecimentoId: number | null;
  resumo: HopDiarioResumo | null;
  previa: HopDiarioPrevia | null;
  carregando?: boolean;
  erro?: boolean;
  ocupado?: boolean;
  mensagem?: string | null;
  onAbrirAcao?: (acao: AcaoHopDiario) => void;
  onPausar?: () => void;
  onAtualizar?: () => void;
};

/**
 * Painel puramente apresentacional. Pode ser renderizado por fixture em testes
 * de DOM/Playwright sem montar hooks tRPC ou qualquer backend.
 */
export function AtendimentosHopDiarioPainel({
  estabelecimentoId,
  resumo,
  previa,
  carregando = false,
  erro = false,
  ocupado = false,
  mensagem = null,
  onAbrirAcao,
  onPausar,
  onAtualizar,
}: AtendimentosHopDiarioPainelProps) {
  const fonte = fonteHopDiario(estabelecimentoId);

  if (!fonte) {
    return (
      <Card data-testid="hop-diario-unidade-bloqueada">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5" /> Snapshot diário de atendimentos
          </CardTitle>
          <CardDescription>
            Este fluxo só aceita as unidades liberadas para as duas stagings
            contratadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unidade fora da allowlist</AlertTitle>
            <AlertDescription>
              Selecione Hospital Urológico (ID 1260036) ou IAD (ID 2550002).
              Nenhuma consulta, prévia, credencial ou mutação foi liberada para
              a unidade atual.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const acoes = avaliarAcoesHopDiario(resumo, previa);
  const previaValida = previaEstaValida(previa);
  const botaoBloqueado = ocupado || carregando || erro || !resumo;
  const podeAbrirAcao = Boolean(onAbrirAcao);

  return (
    <section
      aria-labelledby="hop-diario-title"
      className="space-y-4"
      data-testid="hop-diario-painel"
    >
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle
              id="hop-diario-title"
              className="flex items-center gap-2 text-base"
            >
              <Database className="h-5 w-5" /> Snapshot diário de atendimentos
              em aberto
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Espelhamento controlado de contas abertas para
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                atendimentos_unificados
              </code>
              todos os dias às {HOP_DIARIO_HORARIO} · {HOP_DIARIO_FUSO}.
            </CardDescription>
          </div>
          {resumo ? (
            <Badge
              variant={
                resumo.estado === "ativo"
                  ? "secondary"
                  : resumo.estado === "erro" || resumo.estado === "incerto"
                    ? "destructive"
                    : "outline"
              }
              data-testid="hop-diario-estado"
            >
              {rotuloEstadoHopDiario(resumo.estado)}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Unidade selecionada
              </p>
              <p className="mt-1 font-medium">
                {fonte.unidade} · ID {fonte.estabelecimentoId}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fonte staging</p>
              <code className="mt-1 block break-all text-xs">
                {fonte.staging}
              </code>
              <p className="mt-1 text-xs text-muted-foreground">
                Origem {fonte.origem} · chave {fonte.chave}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Destino</p>
              <code className="mt-1 block text-xs">{fonte.destino}</code>
              <p className="mt-1 text-xs text-muted-foreground">
                Somente campos mapeados do Hop são atualizados.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Rotina fixa</p>
              <p className="mt-1 font-medium">
                {HOP_DIARIO_HORARIO} · Brasília
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Horário não configurável nesta entrega.
              </p>
            </div>
          </div>

          {carregando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando situação
              da unidade…
            </p>
          ) : null}

          {erro ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Situação indisponível</AlertTitle>
              <AlertDescription>
                A situação não foi confirmada. Atualize somente para consultar o
                resumo antes de repetir qualquer ação; nenhuma mutação será
                refeita automaticamente.
              </AlertDescription>
            </Alert>
          ) : null}

          {resumo?.configuracaoPendente ? (
            <Alert
              variant="destructive"
              data-testid="hop-diario-config-pendente"
            >
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                Configuração pendente — fluxo ainda não funcional
              </AlertTitle>
              <AlertDescription>
                Não há controle/lote confirmado para esta unidade. Não inicie
                nem conclua o Hop por esta tela. A implantação deve configurar o
                Hop para sinalizar início antes de qualquer escrita na staging e
                sinalizar conclusão somente depois do commit de todos os
                pipelines; uma falha não deve concluir o lote.
              </AlertDescription>
            </Alert>
          ) : null}

          {resumo && !resumo.configuracaoPendente ? (
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Última execução</p>
                <p className="mt-1 font-medium">
                  {dataBrasilia(resumo.ultimaExecucao)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Próxima execução
                </p>
                <p className="mt-1 font-medium">
                  {resumo.estado === "ativo"
                    ? dataBrasilia(resumo.proximaExecucao)
                    : resumo.estado === "pausado"
                      ? "Pausado — sem próxima execução"
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Último lote</p>
                <p className="mt-1 font-medium">
                  {resumo.ultimoLote
                    ? `${rotuloLote(resumo.ultimoLote.estado)} · #${resumo.ultimoLote.id}`
                    : "Nenhum lote registrado"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Credencial Hop</p>
                <p className="mt-1 font-medium">
                  {resumo.credencialHopConfigurada
                    ? "Registrada — segredo não é exibido"
                    : "Ainda não gerada"}
                </p>
              </div>
            </div>
          ) : null}

          {resumo?.podeGerenciar === false ? (
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                Somente o administrador proprietário da configuração pode
                registrar carga, gerar credencial, publicar, ativar ou pausar.
              </AlertDescription>
            </Alert>
          ) : null}

          {acoes.bloqueadoPorConcorrencia ? (
            <Alert
              variant="destructive"
              data-testid="hop-diario-concorrencia-bloqueada"
            >
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {resumo?.estado === "incerto"
                  ? "Resultado incerto bloqueia novas mutações"
                  : "Carga em andamento bloqueia novas mutações"}
              </AlertTitle>
              <AlertDescription>
                Preserve o estado e confira o lote antes de tentar novamente.
                Nenhum lease é liberado automaticamente por esta interface.
              </AlertDescription>
            </Alert>
          ) : null}

          {acoes.bloqueadoPorRevisaoTecnica ? (
            <Alert
              variant="destructive"
              data-testid="hop-diario-erro-bloqueado"
            >
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Erro requer conferência técnica</AlertTitle>
              <AlertDescription>
                O estado não confirma se a execução anterior terminou de forma
                segura. Preserve as evidências, confirme que a rotina está
                pausada e solicite conferência técnica antes de qualquer nova
                mutação.
              </AlertDescription>
            </Alert>
          ) : null}

          {mensagem ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{mensagem}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAtualizar}
              disabled={ocupado || !onAtualizar}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar situação
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAbrirAcao?.("gerarCredencial")}
              disabled={
                botaoBloqueado || !podeAbrirAcao || !acoes.podeGerarCredencial
              }
            >
              <KeyRound className="mr-2 h-4 w-4" /> Gerar credencial do produtor
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAbrirAcao?.("confirmarCarga")}
              disabled={
                botaoBloqueado || !podeAbrirAcao || !acoes.podeRegistrarCarga
              }
            >
              <Table2 className="mr-2 h-4 w-4" /> Registrar carga atual
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onAbrirAcao?.("prever")}
              disabled={
                botaoBloqueado || !podeAbrirAcao || !acoes.podePrepararPrevia
              }
            >
              <Clock3 className="mr-2 h-4 w-4" /> Preparar prévia
            </Button>
            {resumo?.estado === "ativo" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onPausar}
                disabled={botaoBloqueado || !onPausar || !acoes.podePausar}
              >
                <Pause className="mr-2 h-4 w-4" /> Pausar rotina
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Atualizar situação é somente leitura. Nenhuma prévia, publicação,
            ativação ou pausa é disparada ao abrir esta página ou ao atualizar o
            resumo.
          </p>
        </CardContent>
      </Card>

      {previaValida ? (
        <Card data-testid="hop-diario-previa">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Prévia do espelhamento
              </CardTitle>
              <CardDescription className="mt-1">
                Lote #{previa!.loteId} · autorização válida até{" "}
                {dataBrasilia(previa!.expiraEm)}. A prévia não publicou nem
                ativou a rotina.
              </CardDescription>
            </div>
            <Badge variant="outline">Token temporário</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContagensPrevia contagens={previa!.contagens} />
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button
                type="button"
                onClick={() => onAbrirAcao?.("publicar")}
                disabled={ocupado || !podeAbrirAcao || !acoes.podePublicar}
              >
                <Play className="mr-2 h-4 w-4" /> Publicar agora
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onAbrirAcao?.("ativar")}
                disabled={ocupado || !podeAbrirAcao || !acoes.podeAtivar}
              >
                <CalendarClock className="mr-2 h-4 w-4" /> Ativar diariamente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : previa ? (
        <Alert variant="destructive" data-testid="hop-diario-previa-expirada">
          <Clock3 className="h-4 w-4" />
          <AlertTitle>Prévia expirada</AlertTitle>
          <AlertDescription>
            As contagens e o token desta prévia foram descartados. Prepare uma
            nova prévia antes de publicar ou ativar.
          </AlertDescription>
        </Alert>
      ) : null}

      {resumo && !resumo.configuracaoPendente ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Execuções recentes</CardTitle>
            <CardDescription>
              São exibidos no máximo os 10 últimos registros agregados, sem
              linhas hospitalares e sem credenciais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resumo.execucoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma execução registrada para esta unidade.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Início</th>
                      <th className="p-3 font-medium">Modo</th>
                      <th className="p-3 font-medium">Estado</th>
                      <th className="p-3 font-medium">Fim</th>
                      <th className="p-3 font-medium">Resultado agregado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resumo.execucoes.slice(0, 10).map(execucao => (
                      <tr key={execucao.id}>
                        <td className="p-3">
                          {dataBrasilia(execucao.iniciadoEm)}
                        </td>
                        <td className="p-3">{execucao.modo}</td>
                        <td className="p-3">{estadoExecucao(execucao)}</td>
                        <td className="p-3">
                          {dataBrasilia(execucao.terminadoEm)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {execucao.contagens
                            ? `${numero(execucao.contagens.novos)} novos · ${numero(execucao.contagens.atualizados)} atualizados · ${numero(execucao.contagens.reativados)} reativados · ${numero(execucao.contagens.inativados)} inativados`
                            : (execucao.codigo ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

export type FixtureHopDiarioPainel = AtendimentosHopDiarioPainelProps;

/** Dados estritamente sintéticos para previews visuais e testes externos. */
export function criarFixtureHopDiarioPainel(
  sobrescrever: Partial<FixtureHopDiarioPainel> = {}
): FixtureHopDiarioPainel {
  const contagens: HopDiarioContagens = {
    totalFonte: 48,
    ativosAntes: 45,
    novos: 6,
    atualizados: 12,
    reativados: 2,
    inalterados: 28,
    inativados: 5,
    ativosDepois: 48,
  };
  const resumo: HopDiarioResumo = {
    estabelecimentoId: 1260036,
    unidade: "Hospital Urológico",
    origem: "WARLEINE",
    destino: "atendimentos_unificados",
    horario: HOP_DIARIO_HORARIO,
    fuso: HOP_DIARIO_FUSO,
    configuracaoPendente: false,
    estado: "pausado",
    podeGerenciar: true,
    credencialHopConfigurada: true,
    ultimaExecucao: "2030-01-15T13:00:00.000Z",
    proximaExecucao: null,
    ultimoLote: {
      id: 41,
      estado: "completo",
      totalEsperado: 48,
      concluidoEm: "2030-01-15T12:58:00.000Z",
    },
    execucoes: [
      {
        id: 91,
        estado: "concluida",
        modo: "manual",
        iniciadoEm: "2030-01-15T13:00:00.000Z",
        terminadoEm: "2030-01-15T13:01:00.000Z",
        codigo: null,
        contagens,
      },
    ],
  };
  const previa: HopDiarioPrevia = {
    tokenPrevia: "fixture-token-nao-produtivo",
    expiraEm: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    loteId: 41,
    contagens,
  };

  return {
    estabelecimentoId: 1260036,
    resumo,
    previa,
    carregando: false,
    erro: false,
    ocupado: false,
    mensagem: null,
    onAbrirAcao: () => undefined,
    onPausar: () => undefined,
    onAtualizar: () => undefined,
    ...sobrescrever,
  };
}

export type AtendimentosHopDiarioProps = {
  estabelecimentoId: number | null;
};

/**
 * Controlador tRPC do painel. Não executa prévia nem mutação no mount; a única
 * consulta automática é resumo, exclusivamente para apresentar a situação.
 */
export function AtendimentosHopDiario({
  estabelecimentoId,
}: AtendimentosHopDiarioProps) {
  const fonte = fonteHopDiario(estabelecimentoId);
  const scopeKey = criarChaveEscopoHopDiario(estabelecimentoId);

  if (!fonte) {
    return (
      <AtendimentosHopDiarioPainel
        estabelecimentoId={estabelecimentoId}
        resumo={null}
        previa={null}
      />
    );
  }

  return (
    <AtendimentosHopDiarioControlador
      key={scopeKey}
      escopo={{ estabelecimentoId: fonte.estabelecimentoId }}
    />
  );
}

function AtendimentosHopDiarioControlador({
  escopo,
}: {
  escopo: HopDiarioEscopo;
}) {
  const [dialogo, setDialogo] = useState<DialogoHopDiario>(null);
  const [confirmarCargaCompleta, setConfirmarCargaCompleta] = useState(false);
  const [confirmarHopParado, setConfirmarHopParado] = useState(false);
  const [confirmarEspelhamento, setConfirmarEspelhamento] = useState(false);
  const [confirmarProtocoloEscritores, setConfirmarProtocoloEscritores] =
    useState(false);
  const [confirmarLeituraCredencial, setConfirmarLeituraCredencial] =
    useState(false);
  const [confirmarGuardaSeguraCredencial, setConfirmarGuardaSeguraCredencial] =
    useState(false);
  const [credencialGerada, setCredencialGerada] = useState<string | null>(null);
  const [previa, setPrevia] = useState<HopDiarioPrevia | null>(null);
  const [resumoSobreposto, setResumoSobreposto] =
    useState<HopDiarioResumo | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const resumoQuery = trpc.atendimentosHopDiario.resumo.useQuery(escopo, {
    enabled: true,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const resumo = resumoSobreposto ?? resumoQuery.data ?? null;

  const confirmarCarga = trpc.atendimentosHopDiario.confirmarCarga.useMutation({
    retry: false,
    onSuccess: resultado => {
      setResumoSobreposto(resultado);
      setPrevia(null);
      setMensagem("Lote registrado. Nenhuma publicação foi executada.");
      fecharDialogo();
    },
    onError: () =>
      setMensagem(
        "O registro da carga não foi confirmado. Atualize a situação antes de repetir; não criaremos outro lote automaticamente."
      ),
  });
  const gerarCredencial =
    trpc.atendimentosHopDiario.gerarCredencial.useMutation({
      retry: false,
      onSuccess: resultado => {
        setCredencialGerada(resultado.credencial);
        setResumoSobreposto(atual =>
          atual ? { ...atual, credencialHopConfigurada: true } : atual
        );
      },
      onError: () =>
        setMensagem(
          "A credencial não foi confirmada. Atualize a situação antes de tentar novamente."
        ),
    });
  const prever = trpc.atendimentosHopDiario.prever.useMutation({
    retry: false,
    onSuccess: resultado => {
      setPrevia(resultado);
      setMensagem(null);
      fecharDialogo();
    },
    onError: () =>
      setMensagem(
        "A prévia não foi confirmada. Atualize a situação e revise o lote antes de tentar novamente."
      ),
  });
  const publicar = trpc.atendimentosHopDiario.publicar.useMutation({
    retry: false,
    onSuccess: resultado => {
      setResumoSobreposto(resultado);
      setPrevia(null);
      setMensagem("Publicação confirmada pelo servidor.");
      fecharDialogo();
    },
    onError: () =>
      setMensagem(
        "A publicação não foi confirmada. Preserve o estado e atualize a situação antes de repetir."
      ),
  });
  const ativar = trpc.atendimentosHopDiario.ativar.useMutation({
    retry: false,
    onSuccess: resultado => {
      setResumoSobreposto(resultado);
      setPrevia(null);
      setMensagem(
        "Ativação diária confirmada pelo servidor; ela não executa o espelhamento agora."
      );
      fecharDialogo();
    },
    onError: () =>
      setMensagem(
        "A ativação não foi confirmada. Atualize a situação antes de repetir; a rotina não será criada automaticamente."
      ),
  });
  const pausar = trpc.atendimentosHopDiario.pausar.useMutation({
    retry: false,
    onSuccess: resultado => {
      setResumoSobreposto(resultado);
      setMensagem("Pausa confirmada pelo servidor.");
    },
    onError: () =>
      setMensagem(
        "A pausa não foi confirmada. Preserve o estado e atualize a situação antes de tentar novamente."
      ),
  });

  const ocupado =
    confirmarCarga.isPending ||
    gerarCredencial.isPending ||
    prever.isPending ||
    publicar.isPending ||
    ativar.isPending ||
    pausar.isPending;

  const previaExpirada = previa !== null && !previaEstaValida(previa);
  useEffect(() => {
    if (!previa) return;
    const expiraEm = Date.parse(previa.expiraEm);
    const atraso = Number.isFinite(expiraEm)
      ? Math.max(0, Math.min(expiraEm - Date.now(), LIMITE_PREVIA_MS))
      : 0;
    const timer = window.setTimeout(() => {
      setPrevia(null);
      setConfirmarEspelhamento(false);
      setMensagem(
        "A prévia expirou após no máximo 15 minutos; as contagens foram descartadas."
      );
    }, atraso);
    return () => window.clearTimeout(timer);
  }, [previa?.tokenPrevia, previa?.expiraEm]);

  const acoes = useMemo(
    () => avaliarAcoesHopDiario(resumo, previa),
    [resumo, previa]
  );

  function limparConfirmacoes() {
    setConfirmarCargaCompleta(false);
    setConfirmarHopParado(false);
    setConfirmarEspelhamento(false);
    setConfirmarProtocoloEscritores(false);
    setConfirmarLeituraCredencial(false);
    setConfirmarGuardaSeguraCredencial(false);
  }

  function fecharDialogo() {
    setDialogo(null);
    limparConfirmacoes();
    setCredencialGerada(null);
    gerarCredencial.reset();
  }

  function atualizarSituacao() {
    setMensagem(null);
    setResumoSobreposto(null);
    void resumoQuery.refetch();
  }

  function abrirAcao(acao: AcaoHopDiario) {
    setMensagem(null);
    if (
      (acao === "publicar" || acao === "ativar") &&
      (previaExpirada || !previa)
    ) {
      setPrevia(null);
      setConfirmarEspelhamento(false);
      setMensagem("A prévia expirou ou não existe. Prepare uma nova prévia.");
      return;
    }
    setDialogo(acao);
  }

  function confirmarRegistroCarga() {
    if (
      !podeConfirmarCargaInicial(
        resumo,
        confirmarCargaCompleta,
        confirmarHopParado
      )
    ) {
      return;
    }
    confirmarCarga.mutate({
      ...escopo,
      confirmarCargaCompleta: true,
      confirmarHopParado: true,
    });
  }

  function solicitarCredencial() {
    if (
      !confirmarLeituraCredencial ||
      !confirmarGuardaSeguraCredencial ||
      credencialGerada ||
      !acoes.podeGerarCredencial
    ) {
      return;
    }
    gerarCredencial.mutate(escopo);
  }

  function solicitarPrevia() {
    if (!acoes.podePrepararPrevia) return;
    prever.mutate(escopo);
  }

  function confirmarPublicacao() {
    if (!previa || !confirmarEspelhamento || !acoes.podePublicar) return;
    publicar.mutate({
      ...escopo,
      tokenPrevia: previa.tokenPrevia,
      confirmarEspelhamento: true,
    });
  }

  function confirmarAtivacao() {
    if (
      !previa ||
      !confirmarEspelhamento ||
      !confirmarProtocoloEscritores ||
      !acoes.podeAtivar
    ) {
      return;
    }
    ativar.mutate({
      ...escopo,
      tokenPrevia: previa.tokenPrevia,
      confirmarEspelhamento: true,
    });
  }

  return (
    <>
      <AtendimentosHopDiarioPainel
        estabelecimentoId={escopo.estabelecimentoId}
        resumo={resumo}
        previa={previa}
        carregando={resumoQuery.isLoading}
        erro={resumoQuery.isError}
        ocupado={ocupado}
        mensagem={mensagem}
        onAbrirAcao={abrirAcao}
        onPausar={() => {
          if (acoes.podePausar) pausar.mutate(escopo);
        }}
        onAtualizar={atualizarSituacao}
      />

      <Dialog
        open={dialogo === "confirmarCarga"}
        onOpenChange={aberto => {
          if (!aberto && !ocupado) fecharDialogo();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar a carga atual</DialogTitle>
            <DialogDescription>
              Esta confirmação registra somente o lote já carregado na staging
              da unidade. Ela não publica dados em atendimentos_unificados e não
              ativa a rotina diária.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Use apenas para uma carga completa já existente. O Hop deve estar
              parado para que nenhum escritor altere a staging durante este
              registro.
            </AlertDescription>
          </Alert>
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <Checkbox
                checked={confirmarCargaCompleta}
                disabled={ocupado}
                onCheckedChange={valor =>
                  setConfirmarCargaCompleta(Boolean(valor))
                }
              />
              <span>
                Confirmo que a carga atual está completa para esta unidade.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <Checkbox
                checked={confirmarHopParado}
                disabled={ocupado}
                onCheckedChange={valor => setConfirmarHopParado(Boolean(valor))}
              />
              <span>
                Confirmo que o Hop está parado e não gravará nesta staging
                durante o registro.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={fecharDialogo}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                ocupado ||
                !podeConfirmarCargaInicial(
                  resumo,
                  confirmarCargaCompleta,
                  confirmarHopParado
                )
              }
              onClick={confirmarRegistroCarga}
            >
              {confirmarCarga.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Registrar lote sem publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogo === "gerarCredencial"}
        onOpenChange={aberto => {
          if (!aberto && !ocupado) fecharDialogo();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Credencial do produtor Hop</DialogTitle>
            <DialogDescription>
              Esta área exibe uma credencial aleatória dedicada exclusivamente à
              unidade selecionada. O Portal guarda apenas seu hash.
            </DialogDescription>
          </DialogHeader>
          {credencialGerada ? (
            <div className="space-y-3">
              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertTitle>
                  Copie agora: a credencial será exibida uma única vez
                </AlertTitle>
                <AlertDescription>
                  Ao fechar esta janela, a credencial será apagada da tela e não
                  poderá ser recuperada em resumo, histórico ou logs.
                </AlertDescription>
              </Alert>
              <div className="rounded-md border bg-muted/30 p-3">
                <code
                  className="block break-all text-sm"
                  data-testid="hop-diario-credencial-efemera"
                >
                  {credencialGerada}
                </code>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Aviso único antes da geração</AlertTitle>
                <AlertDescription>
                  A credencial não é gerada automaticamente, não é registrada em
                  logs e não é armazenada neste navegador. Guarde-a no local
                  seguro autorizado antes de fechar esta área.
                </AlertDescription>
              </Alert>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={confirmarLeituraCredencial}
                  disabled={ocupado}
                  onCheckedChange={valor =>
                    setConfirmarLeituraCredencial(Boolean(valor))
                  }
                />
                <span>
                  Entendo que a credencial será exibida somente uma vez nesta
                  janela e que devo configurá-la no Hop fora deste Portal.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={confirmarGuardaSeguraCredencial}
                  disabled={ocupado}
                  onCheckedChange={valor =>
                    setConfirmarGuardaSeguraCredencial(Boolean(valor))
                  }
                />
                <span>
                  Confirmo que tenho um local seguro autorizado para guardar a
                  credencial e que não a salvarei neste navegador.
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={fecharDialogo}
            >
              Fechar e limpar
            </Button>
            {!credencialGerada ? (
              <Button
                type="button"
                disabled={
                  ocupado ||
                  !confirmarLeituraCredencial ||
                  !confirmarGuardaSeguraCredencial
                }
                onClick={solicitarCredencial}
              >
                {gerarCredencial.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Gerar credencial agora
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogo === "prever"}
        onOpenChange={aberto => {
          if (!aberto && !ocupado) fecharDialogo();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preparar prévia do espelhamento</DialogTitle>
            <DialogDescription>
              A prévia calcula contagens agregadas para o lote atual e emite um
              token temporário. Ela não publica e não ativa a rotina.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <Clock3 className="h-4 w-4" />
            <AlertDescription>
              O token vale no máximo 15 minutos e fica vinculado à unidade, lote
              e estado atual. Contagens não são reutilizadas após expirar.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={fecharDialogo}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={ocupado || !acoes.podePrepararPrevia}
              onClick={solicitarPrevia}
            >
              {prever.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Gerar prévia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogo === "publicar" || dialogo === "ativar"}
        onOpenChange={aberto => {
          if (!aberto && !ocupado) fecharDialogo();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogo === "publicar"
                ? "Confirmar publicação agora"
                : "Confirmar ativação diária"}
            </DialogTitle>
            <DialogDescription>
              {dialogo === "publicar"
                ? "Publicar agora aplica o espelhamento desta prévia e não ativa uma rotina diária."
                : `Ativar diariamente agenda o horário fixo de ${HOP_DIARIO_HORARIO} em Brasília; esta confirmação não executa o espelhamento agora.`}
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Revise as contagens da prévia. Novos, atualizados e reativados
              serão espelhados; ausentes serão inativados sem exclusão de
              histórico.
            </AlertDescription>
          </Alert>
          {previa && previaEstaValida(previa) ? (
            <ContagensPrevia contagens={previa.contagens} />
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                A prévia expirou. Feche esta confirmação e gere uma nova prévia.
              </AlertDescription>
            </Alert>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmarEspelhamento}
              disabled={ocupado || !previaEstaValida(previa)}
              onCheckedChange={valor =>
                setConfirmarEspelhamento(Boolean(valor))
              }
            />
            <span>
              {dialogo === "publicar"
                ? "Confirmo este espelhamento para publicação agora nesta unidade."
                : "Confirmo este espelhamento e a ativação diária nesta unidade, sabendo que não haverá execução agora."}
            </span>
          </label>
          {dialogo === "ativar" ? (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">
                Protocolo obrigatório para todos os escritores das stagings
              </p>
              <p className="text-muted-foreground">
                Cada pipeline deve registrar início antes de qualquer escrita na
                staging e registrar conclusão somente após o commit bem-sucedido
                de todos os seus escritores. O legado concorrente deve estar
                desativado; falha ou estado incerto permanece pausado para
                conferência técnica.
              </p>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={confirmarProtocoloEscritores}
                  disabled={ocupado || !previaEstaValida(previa)}
                  onCheckedChange={valor =>
                    setConfirmarProtocoloEscritores(Boolean(valor))
                  }
                />
                <span>
                  Confirmo que todos os escritores das duas stagings cumprem
                  esse protocolo, sem fluxo legado concorrente, antes de ativar.
                </span>
              </label>
              {!resumo?.credencialHopConfigurada ? (
                <Alert variant="destructive">
                  <KeyRound className="h-4 w-4" />
                  <AlertDescription>
                    A ativação exige a credencial Hop configurada. Gere-a e
                    configure-a no produtor antes de continuar.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={fecharDialogo}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                ocupado ||
                !confirmarEspelhamento ||
                !previaEstaValida(previa) ||
                (dialogo === "publicar"
                  ? !acoes.podePublicar
                  : !acoes.podeAtivar || !confirmarProtocoloEscritores)
              }
              onClick={
                dialogo === "publicar" ? confirmarPublicacao : confirmarAtivacao
              }
            >
              {publicar.isPending || ativar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {dialogo === "publicar"
                ? "Confirmar e publicar agora"
                : "Confirmar e ativar diariamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
