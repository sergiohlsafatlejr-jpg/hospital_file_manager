import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import type { HupConciliacaoGuia } from "../../../server/hupConciliacaoPilotoGuias";
import ConciliacaoGuiasTabela, {
  criarLinhaGuiaTabela,
  type ConciliacaoGuiaTabelaRow,
} from "./ConciliacaoGuiasTabela";
import HupComparativoGuiaDetalhes from "./HupComparativoGuiaDetalhes";
import { paginaBancoValida } from "@/lib/conciliacaoBancoContexto";

export type HupConciliacaoBancoStatus =
  | "todos"
  | "candidato"
  | "ambiguo"
  | "sem_candidato"
  | "medico_direto"
  | "dados_incompletos"
  | "misto";

export type HupConciliacaoPilotoProps = {
  estabelecimentoId: number;
  competencia?: string;
  convenioId?: number;
  status?: HupConciliacaoBancoStatus | null;
  busca?: string;
  mesPagamento?: string;
  pagina?: number;
  onPaginaChange?: (pagina: number) => void;
  /** Parent-owned refresh trigger. A positive value after mount refetches safely. */
  atualizacao?: number;
};

type Selecionada = {
  sourceKey: string;
  businessKey: string;
  guiaChave: string;
  guia: string;
  conta: string;
  guiaPrestador: string;
  guiaOperadora: string;
};

const competenciaValida = (value: string | undefined): value is string =>
  Boolean(value && /^(19|20|21|22)\d{2}\/(0[1-9]|1[0-2])$/.test(value));
const mesPagamentoValido = (value: string | undefined) =>
  value == null || /^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/.test(value);
const formatarCompetenciaBanco = (value: string) =>
  competenciaValida(value) ? `${value.slice(5)}/${value.slice(0, 4)}` : value;
const textoOuTraco = (value: string | null | undefined) => value?.trim() || "—";

function descricaoStatusBanco(
  status: HupConciliacaoGuia["status"],
  diferenca: string | null
) {
  const diferencaPositiva =
    diferenca != null &&
    !diferenca.startsWith("-") &&
    !/^0(?:\.0+)?$/.test(diferenca);
  const complemento = diferencaPositiva
    ? " Diferença positiva disponível nos detalhes."
    : "";
  switch (status) {
    case "candidato":
      return {
        statusLabel: "Candidato à revisão",
        statusVariant: "candidato" as const,
        statusReason: `Candidato exclusivo em leitura; vínculo não gravado.${complemento}`,
      };
    case "ambiguo":
    case "misto":
      return {
        statusLabel: "Revisar",
        statusVariant: "ambiguo" as const,
        statusReason: `Há candidatos ambíguos ou situação mista.${complemento}`,
      };
    case "sem_candidato":
    case "dados_incompletos":
      return {
        statusLabel: "Em revisão",
        statusVariant: "pendente" as const,
        statusReason: `Comparação ainda não conclusiva.${complemento}`,
      };
    case "medico_direto":
      return {
        statusLabel: "Médico direto",
        statusVariant: "medico_direto" as const,
        statusReason: "Médico direto não compõe pendência hospitalar.",
      };
  }
}

function pontosDaGuia(contagens: HupConciliacaoGuia["statusContagens"]) {
  const candidatos = contagens.candidato || 0;
  const ambiguos = contagens.ambiguo || 0;
  const pendentes =
    (contagens.sem_candidato || 0) + (contagens.dados_incompletos || 0);
  return [
    candidatos > 0
      ? { label: `${candidatos} candidato(s) à revisão`, color: "bg-blue-500" }
      : null,
    ambiguos > 0
      ? { label: `${ambiguos} grupo(s) para revisar`, color: "bg-amber-500" }
      : null,
    pendentes > 0
      ? { label: `${pendentes} grupo(s) em revisão`, color: "bg-slate-400" }
      : null,
  ].filter((dot): dot is { label: string; color: string } => dot !== null);
}

function acrescimoSeguro(guia: HupConciliacaoGuia): string | null {
  // The engine only exposes a complete guide difference when every hospital
  // group is comparable. Keep an exact decimal string; never coerce money to Number.
  if (
    !guia.comparacaoCompleta ||
    guia.diferencaGuia == null ||
    !/^-\d+(?:\.\d+)?$/.test(guia.diferencaGuia)
  )
    return null;
  return guia.diferencaGuia.slice(1);
}

function linhaBanco(
  guia: HupConciliacaoGuia,
  competencia: string
): ConciliacaoGuiaTabelaRow {
  const guiaVisual = guia.guiaOperadora || guia.guiaPrestador || "—";
  const pendentesHospitalares =
    guia.gruposHospitalares > 0
      ? Math.max(0, guia.gruposHospitalares - guia.gruposComparaveis)
      : null;
  const status = descricaoStatusBanco(guia.status, guia.diferencaGuia);
  return criarLinhaGuiaTabela({
    chave: guia.chave,
    guia: guiaVisual,
    paciente: null,
    competencia,
    lote: null,
    protocolo: null,
    totalItens: guia.totalItens,
    // Receber=N é médico direto: visível para revisão, fora do faturado hospitalar.
    valorFaturado: guia.valorFaturadoHospital,
    valorRecebido: guia.valorPagoCandidato,
    valorGlosado: guia.valorGlosaCandidata,
    valorAcrescimo: acrescimoSeguro(guia),
    desassociados: pendentesHospitalares,
    dots: pontosDaGuia(guia.statusContagens),
    conta: guia.conta || undefined,
    detailsTitle: `Ver detalhes da guia ${guiaVisual}`,
    coberturaCandidata:
      guia.gruposHospitalares > 0
        ? {
            recebidos: guia.gruposComPago,
            glosados: guia.gruposComGlosa,
            total: guia.gruposHospitalares,
          }
        : undefined,
    ...status,
  });
}

/**
 * Banco body embedded in ConciliacaoCruzadaAtual. The parent owns its frame,
 * filters and actions; this component deliberately offers no second page shell.
 */
export default function HupConciliacaoPiloto({
  estabelecimentoId,
  competencia,
  convenioId,
  status = "todos",
  busca,
  mesPagamento,
  pagina,
  onPaginaChange,
  atualizacao,
}: HupConciliacaoPilotoProps) {
  const [paginaInterna, setPaginaInterna] = useState(() => paginaBancoValida(pagina));
  const page = paginaBancoValida(pagina ?? paginaInterna);
  const setPage = useCallback((proxima: number) => {
    const valida = paginaBancoValida(proxima);
    setPaginaInterna(valida);
    onPaginaChange?.(valida);
  }, [onPaginaChange]);
  const [selecionada, setSelecionada] = useState<Selecionada | null>(null);
  const statusAplicado = status ?? "todos";
  const competenciaOk = competenciaValida(competencia);
  const convenioOk = Number.isSafeInteger(convenioId) && (convenioId ?? 0) > 0;
  const pagamentoOk = mesPagamentoValido(mesPagamento);
  const competenciaAplicada = competenciaOk ? competencia : "1900/01";
  const convenioAplicado =
    convenioOk && typeof convenioId === "number" ? convenioId : 1;
  const mesPagamentoAplicado = pagamentoOk ? mesPagamento : undefined;
  const buscaAplicada = busca?.trim() || undefined;

  const filtrosKey = useMemo(
    () =>
      JSON.stringify({
        estabelecimentoId,
        competencia: competencia ?? null,
        convenioId: convenioId ?? null,
        status: statusAplicado,
        busca: buscaAplicada ?? null,
        mesPagamento: mesPagamento ?? null,
      }),
    [
      estabelecimentoId,
      competencia,
      convenioId,
      statusAplicado,
      buscaAplicada,
      mesPagamento,
    ]
  );

  const queryInput = useMemo(
    () => ({
      estabelecimentoId,
      competencia: competenciaAplicada,
      convenioId: convenioAplicado,
      status: statusAplicado,
      busca: buscaAplicada,
      mesPagamento: mesPagamentoAplicado,
      page,
      pageSize: 50 as const,
    }),
    [
      estabelecimentoId,
      competenciaAplicada,
      convenioAplicado,
      statusAplicado,
      buscaAplicada,
      mesPagamentoAplicado,
      page,
    ]
  );

  const enabled =
    estabelecimentoId === 1260036 && competenciaOk && convenioOk && pagamentoOk;
  const sourceKey = useMemo(() => JSON.stringify(queryInput), [queryInput]);
  // The parent refresh action is not part of the API input, but it is part of
  // the live-source identity used to decide whether an open drilldown is safe.
  const selecaoSourceKey = useMemo(
    () => `${sourceKey}:${atualizacao ?? 0}`,
    [sourceKey, atualizacao]
  );
  const { data, error, isFetching, refetch } =
    trpc.hupConciliacaoPiloto.guias.useQuery(queryInput, {
      enabled,
      retry: false,
      staleTime: 0,
    });

  // Restaurar não é mudar filtro. Só um recorte novo volta à primeira página.
  const filtrosAnteriores = useRef(filtrosKey);
  useEffect(() => {
    if (filtrosAnteriores.current !== filtrosKey) setPage(1);
    filtrosAnteriores.current = filtrosKey;
    setSelecionada(null);
  }, [filtrosKey, setPage]);

  useEffect(() => {
    if (isFetching || error || !enabled) setSelecionada(null);
  }, [isFetching, error, enabled]);

  const ultimaAtualizacao = useRef<number | undefined>(atualizacao);
  useEffect(() => {
    const mudou =
      atualizacao != null &&
      atualizacao > 0 &&
      ultimaAtualizacao.current != null &&
      atualizacao !== ultimaAtualizacao.current;
    ultimaAtualizacao.current = atualizacao;
    if (!mudou || !enabled) return;
    setSelecionada(null);
    void refetch();
  }, [atualizacao, enabled, refetch]);

  // Never draw cached data from a former recorte while the new key is loading.
  const result =
    enabled &&
    !isFetching &&
    !error &&
    data?.competencia === competenciaAplicada
      ? data
      : undefined;
  const linhas = useMemo(
    () => result?.items.map(guia => linhaBanco(guia, result.competencia)) ?? [],
    [result]
  );
  const totalPaginas = Math.max(1, Math.ceil((result?.total ?? 0) / 50));
  useEffect(() => {
    // O snapshot pode diminuir enquanto a pessoa está fora da página.
    if (result?.status === "ok" && page > totalPaginas) setPage(totalPaginas);
  }, [result, page, totalPaginas, setPage]);
  const selecionadaAtual =
    selecionada?.sourceKey === selecaoSourceKey ? selecionada : null;

  if (!competenciaOk || !convenioOk) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          Selecione competência e convênio...
        </CardContent>
      </Card>
    );
  }

  if (!pagamentoOk) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          Selecione o mês do pagamento para consultar as guias do Banco.
        </CardContent>
      </Card>
    );
  }

  if (selecionadaAtual) {
    return (
      <div className="space-y-3 min-w-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelecionada(null)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar às guias
        </Button>
        <div className="border-b pb-3">
          <h2 className="text-lg font-semibold">
            Guia: {selecionadaAtual.guia}
          </h2>
          {selecionadaAtual.conta ? (
            <p className="text-sm text-muted-foreground">
              Conta {selecionadaAtual.conta}
            </p>
          ) : null}
        </div>
        <HupComparativoGuiaDetalhes
          key={`${selecionadaAtual.sourceKey}:${selecionadaAtual.businessKey}`}
          guiaChave={selecionadaAtual.guiaChave}
          identificadores={{
            conta: selecionadaAtual.conta,
            guiaPrestador: selecionadaAtual.guiaPrestador,
            guiaOperadora: selecionadaAtual.guiaOperadora,
          }}
          recorte={{
            estabelecimentoId,
            competencia: competenciaAplicada,
            convenioId: convenioAplicado,
            mesPagamento: mesPagamentoAplicado,
          }}
        />
      </div>
    );
  }

  if (isFetching) {
    return (
      <p className="py-5 text-sm text-muted-foreground" role="status">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Consultando guias do Banco…
      </p>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-destructive" role="alert">
          Não foi possível consultar as guias do Banco: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!result || result.status !== "ok") {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          {result?.aviso || "Nenhuma consulta disponível para este recorte."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-3 text-sm">
        <Badge
          variant="outline"
          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
        >
          Banco · em revisão
        </Badge>
        <span className="font-medium">
          {result.total.toLocaleString("pt-BR")} guias
        </span>
        <span className="text-muted-foreground">
          {formatarCompetenciaBanco(result.competencia)} · {result.convenioNome}
        </span>
        <span className="basis-full text-xs text-muted-foreground">
          Valores candidatos; vínculos não gravados.
        </span>
      </div>
      <ConciliacaoGuiasTabela
        rows={linhas}
        ariaLabel="Guias e contas da fonte Banco"
        modo="banco"
        colunaPendentes="Pendentes"
        formatarCompetencia={formatarCompetenciaBanco}
        mensagemVazia="Nenhuma guia encontrada para os filtros selecionados."
        onAbrir={chave => {
          const guia = result.items.find(item => item.chave === chave);
          if (!guia) return;
          setSelecionada({
            sourceKey: selecaoSourceKey,
            businessKey: JSON.stringify([
              guia.conta,
              guia.guiaPrestador,
              guia.guiaOperadora,
            ]),
            guiaChave: guia.chave,
            guia: textoOuTraco(guia.guiaOperadora || guia.guiaPrestador),
            conta: guia.conta,
            guiaPrestador: guia.guiaPrestador,
            guiaOperadora: guia.guiaOperadora,
          });
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-muted-foreground">
          Página {page} de {totalPaginas} (
          {result.total.toLocaleString("pt-BR")} guias)
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              setSelecionada(null);
              setPage(page - 1);
            }}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPaginas}
            onClick={() => {
              setSelecionada(null);
              setPage(page + 1);
            }}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
