export const LIMITE_AMOSTRA_TV = 500;
export const LIMITE_AMOSTRA_SETOR = 100;

/** O recorte mensal é o mesmo dos relatórios: data de recebimento na Safatle. */
export function intervaloCompetenciaTv(competencia: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (ano < 1 || mes < 1 || mes > 12) return null;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const ultimoDia = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return { dataInicio: `${competencia}-01`, dataFim: `${competencia}-${ultimoDia}` };
}

export function criarEscopoPainelTv(hospitalFiltro: string, competencia: string) {
  const periodo = intervaloCompetenciaTv(competencia);
  const hospitalId = hospitalFiltro === "todos" ? undefined : Number(hospitalFiltro);
  if (!periodo || (hospitalId !== undefined && (!Number.isSafeInteger(hospitalId) || hospitalId <= 0))) return null;
  return {
    competencia,
    hospitalEstabelecimentoId: hospitalId,
    ...periodo,
  };
}

/** Ausência/valor inválido não se transforma em zero nem em produção inferida. */
export function numeroAutoritativo(raw: unknown): number | null {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const numero = Number(raw);
  return Number.isFinite(numero) ? numero : null;
}

/** Zero final é um valor conhecido, distinto de final ausente. */
export function valorContaPainelTv(conta: { valorFaturadoFinal?: unknown; valorFaturadoInicial?: unknown }): number {
  return numeroAutoritativo(conta.valorFaturadoFinal ?? conta.valorFaturadoInicial) ?? 0;
}

export function producaoMensalPainelTv(relatorio: any) {
  return {
    contas: numeroAutoritativo(relatorio?.resumoPeriodo?.totalFaturadas),
    valor: numeroAutoritativo(relatorio?.resumoPeriodo?.valorTotalFaturado),
    metaContas: Array.isArray(relatorio?.metas)
      ? relatorio.metas.reduce((total: number, meta: any) => total + (numeroAutoritativo(meta.metaQuantidadeContas) ?? 0), 0)
      : null,
    metaValor: Array.isArray(relatorio?.metas)
      ? relatorio.metas.reduce((total: number, meta: any) => total + (numeroAutoritativo(meta.metaValorFaturado) ?? 0), 0)
      : null,
  };
}

export function realizadoMetaPainelTv(meta: { usuarioId?: number | null }, relatorio: any) {
  const producao = meta.usuarioId != null
    ? relatorio?.producaoPorFuncionario?.find((p: any) => p.usuarioId === meta.usuarioId)
    : relatorio?.resumoPeriodo;
  return {
    contas: numeroAutoritativo(meta.usuarioId != null ? producao?.contasFaturadas : producao?.totalFaturadas),
    valor: numeroAutoritativo(meta.usuarioId != null ? producao?.valorFaturado : producao?.valorTotalFaturado),
  };
}

export type EstadoDadosPainelTv = "pronto" | "carregando" | "erro" | "sem_permissao" | "indisponivel";
export interface ConsultaPainelTv<T> {
  data?: T;
  status: "pending" | "error" | "success";
  isFetching?: boolean;
  isPlaceholderData?: boolean;
  isError?: boolean;
}

/**
 * As queries são identificadas pelos inputs do escopo no cache tRPC/React Query.
 * Nunca renderizar placeholder/keepPreviousData, cache durante refetch ou erro de
 * refetch; `enabled: false` sozinho não apaga dados que já estavam no cache.
 */
export function dadosConsultaPainelTv<T>(consulta: ConsultaPainelTv<T>, permitido: boolean, escopoValido = true): { estado: EstadoDadosPainelTv; data: T | undefined } {
  if (!permitido) return { estado: "sem_permissao", data: undefined };
  if (!escopoValido) return { estado: "indisponivel", data: undefined };
  if (consulta.status === "error" || consulta.isError) return { estado: "erro", data: undefined };
  if (consulta.status === "pending" || consulta.isFetching || consulta.isPlaceholderData) return { estado: "carregando", data: undefined };
  if (consulta.data === undefined || consulta.data === null) return { estado: "indisponivel", data: undefined };
  return { estado: "pronto", data: consulta.data };
}

export function mensagemEstadoPainelTv(estado: EstadoDadosPainelTv): string {
  return {
    pronto: "Dados do escopo atual",
    carregando: "Carregando dados do escopo atual",
    erro: "Falha ao atualizar dados do escopo atual",
    sem_permissao: "Sem permissão para relatórios gerenciais",
    indisponivel: "Dados indisponíveis para o escopo atual",
  }[estado];
}

/** Nunca apresentar contagem da página ou soma de alertas como total do escopo. */
export function descreverAmostraPainelTv(quantidade: number, total: unknown, limite: number, pagina = 1): string {
  const totalConhecido = numeroAutoritativo(total);
  const base = `AMOSTRA da página ${pagina}: ${quantidade} conta(s), limite ${limite}`;
  return totalConhecido === null
    ? `${base}; total do escopo indisponível. Contagens e filtros rápidos somente nesta amostra.`
    : `${base} de ${totalConhecido} no escopo. Contagens e filtros rápidos somente nesta amostra.`;
}
