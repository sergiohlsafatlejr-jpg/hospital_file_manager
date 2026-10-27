/**
 * Contratos públicos do contexto médico informativo da conta de convênio.
 *
 * Estes tipos não devem transportar valores, recebimentos, carteirinha,
 * autorização, URL/hash do XML ou o XML original. A correlação necessária ao
 * servidor pertence somente ao parser em `server/contaHonorariosParser.ts`.
 */

/** Chave validada no servidor contra a conta e o arquivo hospitalar selecionados. */
export interface ScopeContaMedica {
  estabelecimentoId: number;
  convenioId: number;
  numeroConta: string;
  arquivoHospitalId: number;
  numeroLote?: string;
  competencia?: string;
}

export type CategoriaItemGabarito = "obrigatorio" | "condicional" | "opcional";

/**
 * Formato do JSON `itensAssociados` de um gabarito manual.
 *
 * `grupoAlternativo` representa uma escolha OR explícita. Quando informado,
 * basta um item do mesmo grupo estar presente. `grupoObrigatorio` só altera a
 * ausência do grupo: um grupo obrigatório ausente gera uma pendência única;
 * um grupo opcional ausente não gera pendência. A categoria permanece no item
 * para não alterar a semântica já cadastrada.
 */
export interface ItemAssociadoGabarito {
  codigo: string;
  descricao: string;
  tipo?: string;
  frequencia: number;
  quantidadeMedia: number;
  quantidadeMin?: number;
  quantidadeMax?: number;
  categoria?: CategoriaItemGabarito;
  /** Grupo condicional legado, preservado sem inferências por nome. */
  grupo?: string;
  /** Grupo OR explícito entre itens associados. */
  grupoAlternativo?: string;
  /** Só tem efeito quando `grupoAlternativo` estiver definido. */
  grupoObrigatorio?: boolean;
}

export interface ProfissionalMedicoInfo {
  nome: string;
  conselho: string | null;
  numeroConselho: string | null;
}

/** Procedimento de guia de honorários, exclusivamente informativo e sem valores. */
export interface ProcedimentoMedicoInfo {
  codigo: string;
  descricao: string;
  dataExecucao: string | null;
  profissionais: ProfissionalMedicoInfo[];
  sequencial: string | null;
}

/** Fonte médica previamente indexada; `versao` nunca é um hash público. */
export interface FonteMedicaInfo {
  arquivoId: number;
  registros: number;
  codigosDistintos: number;
  procedimentos: ProcedimentoMedicoInfo[];
  versao?: string;
}

export type PresencaComposicao = "presente" | "ausente" | "satisfeito_por_grupo";
export type SituacaoQuantidadeComposicao = "abaixo" | "dentro" | "acima" | "nao_avaliada";

/** Resultado auditável de um item do gabarito contra itens hospitalares reais. */
export interface ItemResumoComposicao {
  codigo: string;
  descricao: string;
  categoria: CategoriaItemGabarito;
  grupo: string | null;
  presenca: PresencaComposicao;
  quantidadeEncontrada?: string;
  quantidadeEsperada?: number;
  quantidadeMin?: number;
  quantidadeMax?: number;
  frequencia?: number;
  situacaoQuantidade?: SituacaoQuantidadeComposicao;
  /** Verdadeiro somente para uma pendência que exige análise humana. */
  pendencia: boolean;
}

/**
 * Resumo sem dados financeiros. Contagens de faltas opcionais e condicionais
 * são exibidas para auditoria, mas não constituem confirmação automática.
 */
export interface ResumoComposicao {
  itens: ItemResumoComposicao[];
  itensEsperados: number;
  itensPresentes: number;
  faltantesObrigatorios: number;
  faltantesOpcionais: number;
  faltantesCondicionais: number;
  gruposAlternativos: number;
  gruposObrigatoriosAusentes: number;
  gruposOpcionaisAusentes: number;
  quantidadesAbaixo: number;
  quantidadesAcima: number;
  pendencias: number;
}

/** Candidato manual; a recomendação nunca confirma ou grava uma associação. */
export interface CandidatoGabarito {
  padraoId: number;
  nome: string;
  elegivel: boolean;
  motivos: string[];
  principaisTotal: number;
  principaisEncontrados: number;
  recomendacao: boolean;
  composicao: ResumoComposicao;
}

export interface ContextoMedicoInfo {
  padraoId: number;
  nomePadrao: string;
  status: "confirmado" | "invalidado" | "revisao_necessaria";
  revisao: number;
  confirmadoEm: string | null;
  confirmadoPor: number | null;
  justificativa: string;
  abrangencia: "conta_inteira_sem_setor" | "conta_inteira";
}

/**
 * Diagnóstico agregado e seguro da pré-condição do snapshot hospitalar.
 *
 * Não transporta guia, arquivo, paciente, valores nem conteúdo de item. Os
 * totais apenas indicam, por etapa canônica, se há linhas no mesmo escopo já
 * autorizado (unidade, convênio e arquivo hospitalar exatos).
 */
export type EtapaDiagnosticoSnapshotHospitalar =
  | "arquivo_hospitalar"
  | "identificacao_conta"
  | "lote"
  | "competencia";

export interface DiagnosticoSnapshotHospitalar {
  etapas: Array<{
    etapa: EtapaDiagnosticoSnapshotHospitalar;
    totalLinhas: number;
  }>;
}

export interface ContaContextoMedicoResultado {
  configuracaoPendente: boolean;
  /** Preenchido somente quando não há snapshot hospitalar para o escopo exato. */
  diagnosticoSnapshot: DiagnosticoSnapshotHospitalar | null;
  fontes: FonteMedicaInfo[];
  candidatos: CandidatoGabarito[];
  contexto: ContextoMedicoInfo | null;
  itensHospitalares: number;
  setorInformado: boolean;
  avisos: string[];
}
