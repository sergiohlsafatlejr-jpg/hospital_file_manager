import { createHash } from "node:crypto";
import type {
  CandidatoGabarito,
  ContaContextoMedicoResultado,
  ContextoMedicoInfo,
  DiagnosticoSnapshotHospitalar,
  FonteMedicaInfo,
  ItemAssociadoGabarito,
  ProcedimentoMedicoInfo,
  ScopeContaMedica,
} from "../shared/contaContextoMedico";
import {
  compararComposicaoInformativa,
  type GabaritoComposicaoInformativa,
  type ItemHospitalarInformativo,
} from "./contaComposicaoInformativa";
import {
  parseContaHonorarios,
  type GuiaHonorariosParseada,
  type ParseContaHonorariosResultado,
} from "./contaHonorariosParser";

/** Chave normalizada internamente. Campos opcionais nunca são omitidos no banco. */
export interface ScopeContaMedicaNormalizado {
  estabelecimentoId: number;
  convenioId: number;
  numeroConta: string;
  arquivoHospitalId: number;
  numeroLote: string;
  competencia: string;
}

/** Erro deliberadamente sanitizado para tradução pelo router. */
export class ContaContextoMedicoErro extends Error {
  constructor(
    public readonly codigo:
      | "CONFIGURACAO_PENDENTE"
      | "ESCOPO_INVALIDO"
      | "NAO_ENCONTRADO"
      | "FORBIDDEN"
      | "PRECONDICAO"
      | "CONCORRENCIA",
    message: string,
  ) {
    super(message);
    this.name = "ContaContextoMedicoErro";
  }
}

export interface ArquivoMedicoInfoInterno {
  id: number;
  nome: string;
  tamanho: number | null;
  dataReferencia: Date | string | null;
}

/**
 * Registro autorizado por consulta local. URLs, chaves e XML não saem deste
 * contrato para DTOs; `s3Key` só pode ser utilizado pelo leitor injetado.
 */
export interface ArquivoMedicoAutorizado extends ArquivoMedicoInfoInterno {
  tipoArquivo: "xml";
  direcao: "enviado";
  estabelecimentoId: number;
  convenioId: number;
  s3Key: string;
}

export interface ReferenciaGuiaHospitalar {
  numeroGuiaPrestador: string | null;
  numeroGuiaOperadora: string | null;
  /** Privado: nunca retorna no resultado público ou é persistido como fonte. */
  beneficiario: string | null;
  /** Datas civis YYYY-MM-DD já derivadas de linhas hospitalares autorizadas. */
  datasExecucao: readonly string[];
}

/** Linha já validada como pertencente ao escopo completo, sem campos de valor. */
export interface ItemHospitalarEscopo extends ItemHospitalarInformativo {
  numeroGuiaPrestador?: string | null;
  numeroGuiaOperadora?: string | null;
}

/**
 * Resultado da consulta do adaptador à origem hospitalar. O adaptador deve
 * recusar zero ou múltiplas contas para a combinação exata; o serviço jamais
 * completa a chave apenas pelo número da conta.
 */
export interface SnapshotHospitalarAutorizado {
  scope: ScopeContaMedicaNormalizado;
  referenciasGuias: readonly ReferenciaGuiaHospitalar[];
  itensHospitalares: readonly ItemHospitalarEscopo[];
  setorInformado: boolean;
}

export interface FonteMedicaPersistida {
  id: number;
  scope: ScopeContaMedicaNormalizado;
  arquivoMedicoId: number;
  guiaReferencia: string;
  versaoSemantica: string;
  registros: number;
  codigosDistintos: number;
  procedimentos: readonly ProcedimentoMedicoInfo[];
  criadoEm?: Date | string;
}

export interface GabaritoManualInformativo extends GabaritoComposicaoInformativa {
  /** Deve ser verdade somente para gabaritos manuais já validados pelo adapter. */
  isGabarito: boolean;
  status: "ativo" | "aprendendo" | "revisao" | "inativo";
}

export interface ContextoMedicoPersistido {
  id: number;
  scope: ScopeContaMedicaNormalizado;
  padraoId: number | null;
  nomePadrao: string | null;
  status: "confirmado" | "invalidado" | "revisao_necessaria";
  revisao: number;
  confirmadoEm: Date | string | null;
  confirmadoPor: number | null;
  justificativa: string;
  versaoPadrao: string | null;
  fontesVersoes: readonly FonteVersaoPrivada[];
  versaoItensHospitalares: string;
  principaisSnapshot: readonly string[];
  abrangencia: "conta_inteira_sem_setor" | "conta_inteira";
}

export interface FonteVersaoPrivada {
  fonteId: number;
  guiaReferencia: string;
  versaoSemantica: string;
}

export interface EventoContextoMedicoNovo {
  contextoId: number;
  revisao: number;
  tipo: "confirmado" | "invalidado" | "revisao_necessaria";
  usuarioId: number;
  justificativa: string;
  padraoId: number | null;
  versaoPadrao: string | null;
  evidencia: {
    fontesVersoes: readonly FonteVersaoPrivada[];
    versaoItensHospitalares: string;
    principaisSnapshot: readonly string[];
  };
}

export interface ContextoMedicoNovo extends Omit<ContextoMedicoPersistido, "id"> {}

/**
 * A única fronteira de persistência. Implementações Drizzle devem usar:
 * - seleção exata do escopo em `faturamento_tiss` antes de produzir snapshot;
 * - insert de fonte e captura de conflito único (sem onDuplicateKeyUpdate);
 * - transação para CAS de contexto e append de evento.
 *
 * Esta interface não expõe tabelas financeiras para escrita.
 */
export interface ContaContextoMedicoRepositorio {
  configurado(): Promise<boolean>;
  resolverSnapshotHospitalar(scope: ScopeContaMedicaNormalizado): Promise<SnapshotHospitalarAutorizado | null>;
  /** Diagnóstico agregado no mesmo arquivo/unidade/convênio já autorizados. */
  diagnosticarSnapshotHospitalar(scope: ScopeContaMedicaNormalizado): Promise<DiagnosticoSnapshotHospitalar>;
  listarArquivosMedicos(scope: ScopeContaMedicaNormalizado, page: number, pageSize: number): Promise<{
    arquivos: readonly ArquivoMedicoInfoInterno[];
    temProximaPagina: boolean;
  }>;
  obterArquivoMedicoAutorizado(
    scope: ScopeContaMedicaNormalizado,
    arquivoMedicoId: number,
  ): Promise<ArquivoMedicoAutorizado | null>;
  lerXmlMedicoAutorizado(arquivo: ArquivoMedicoAutorizado): Promise<Buffer>;
  listarFontes(scope: ScopeContaMedicaNormalizado): Promise<readonly FonteMedicaPersistida[]>;
  /** Insere apenas se a versão ainda não existir. Nunca faz overwrite em conflito. */
  inserirFonteSeAusente(fonte: Omit<FonteMedicaPersistida, "id" | "criadoEm">): Promise<{
    fonte: FonteMedicaPersistida;
    criada: boolean;
  }>;
  listarGabaritosManuais(scope: ScopeContaMedicaNormalizado): Promise<readonly GabaritoManualInformativo[]>;
  obterGabaritoManual(scope: ScopeContaMedicaNormalizado, padraoId: number): Promise<GabaritoManualInformativo | null>;
  obterContexto(scope: ScopeContaMedicaNormalizado): Promise<ContextoMedicoPersistido | null>;
  /** A implementação deve executar callback em transação de banco. */
  transacionar<T>(callback: (tx: ContextoMedicoTransacao) => Promise<T>): Promise<T>;
}

export interface ContextoMedicoTransacao {
  obterContextoParaAtualizacao(scope: ScopeContaMedicaNormalizado): Promise<ContextoMedicoPersistido | null>;
  /** INSERT inicial protegido pela unique scope; conflito deve resultar em false. */
  inserirContextoInicial(contexto: ContextoMedicoNovo): Promise<ContextoMedicoPersistido | null>;
  /** UPDATE ... WHERE id = ? AND revisao = ?; false equivale a conflito otimista. */
  atualizarContextoComCas(
    contextoId: number,
    revisaoEsperada: number,
    proximo: ContextoMedicoNovo,
  ): Promise<ContextoMedicoPersistido | null>;
  anexarEvento(evento: EventoContextoMedicoNovo): Promise<void>;
}

export interface ContaContextoMedicoDependencias {
  repositorio: ContaContextoMedicoRepositorio;
  parse?: (xml: Buffer) => ParseContaHonorariosResultado;
  comparar?: typeof compararComposicaoInformativa;
  now?: () => Date;
}

const PAGE_SIZE = 20;
const MAX_JUSTIFICATIVA = 1000;
const MAX_NUMERO_CONTA = 100;
const MAX_NUMERO_LOTE = 100;
const MAX_COMPETENCIA = 20;

function erro(codigo: ContaContextoMedicoErro["codigo"], message: string): never {
  throw new ContaContextoMedicoErro(codigo, message);
}

function inteiroPositivo(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) erro("ESCOPO_INVALIDO", `${label} inválido.`);
  return value;
}

function textoChave(value: unknown, max: number, label: string, obrigatorio = false): string {
  if (typeof value !== "string") {
    if (obrigatorio) erro("ESCOPO_INVALIDO", `${label} obrigatório.`);
    return "";
  }
  const text = value.trim();
  if ((obrigatorio && !text) || text.length > max || /[\u0000-\u001F\u007F]/.test(text)) {
    erro("ESCOPO_INVALIDO", `${label} inválido.`);
  }
  return text;
}

export function normalizarScopeContaMedica(scope: ScopeContaMedica): ScopeContaMedicaNormalizado {
  if (!scope || typeof scope !== "object") erro("ESCOPO_INVALIDO", "Escopo inválido.");
  return {
    estabelecimentoId: inteiroPositivo(scope.estabelecimentoId, "Estabelecimento"),
    convenioId: inteiroPositivo(scope.convenioId, "Convênio"),
    arquivoHospitalId: inteiroPositivo(scope.arquivoHospitalId, "Arquivo hospitalar"),
    numeroConta: textoChave(scope.numeroConta, MAX_NUMERO_CONTA, "Número da conta", true),
    numeroLote: textoChave(scope.numeroLote, MAX_NUMERO_LOTE, "Número do lote"),
    competencia: textoChave(scope.competencia, MAX_COMPETENCIA, "Competência"),
  };
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function hashSemantico(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

function codigoNormalizado(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function diaCivil(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizarBeneficiario(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toUpperCase();
  return normalized || null;
}

function fontesVersoes(fontes: readonly FonteMedicaPersistida[]): FonteVersaoPrivada[] {
  return fontes
    .map(fonte => ({
      fonteId: fonte.id,
      guiaReferencia: fonte.guiaReferencia,
      versaoSemantica: fonte.versaoSemantica,
    }))
    .sort((a, b) => a.fonteId - b.fonteId || a.guiaReferencia.localeCompare(b.guiaReferencia));
}

function versaoFontes(fontes: readonly FonteMedicaPersistida[]): string {
  return hashSemantico(fontesVersoes(fontes));
}

/** Não inclui valores hospitalares: somente item/categoria/quantidade para composição. */
export function versaoItensHospitalares(itens: readonly ItemHospitalarEscopo[]): string {
  return hashSemantico(
    itens.map(item => ({
      codigo: codigoNormalizado(item.codigo),
      tipo: item.tipo,
      quantidade: item.quantidade === undefined || item.quantidade === null ? null : String(item.quantidade).trim(),
      guiaPrestador: codigoNormalizado(item.numeroGuiaPrestador),
      guiaOperadora: codigoNormalizado(item.numeroGuiaOperadora),
    })).sort((a, b) => stable(a).localeCompare(stable(b))),
  );
}

function versaoGabarito(gabarito: GabaritoManualInformativo): string {
  return hashSemantico({
    id: gabarito.padraoId,
    nome: gabarito.nome,
    estabelecimentoId: gabarito.estabelecimentoId,
    convenioId: gabarito.convenioId,
    isGabarito: gabarito.isGabarito,
    status: gabarito.status,
    principais: gabarito.principais.map(item => ({ codigo: codigoNormalizado(item.codigo) })),
    itensAssociados: gabarito.itensAssociados.map(item => ({
      codigo: codigoNormalizado(item.codigo),
      descricao: item.descricao,
      tipo: item.tipo ?? null,
      frequencia: item.frequencia,
      quantidadeMedia: item.quantidadeMedia,
      quantidadeMin: item.quantidadeMin ?? null,
      quantidadeMax: item.quantidadeMax ?? null,
      categoria: item.categoria ?? null,
      grupo: item.grupo ?? null,
      grupoAlternativo: item.grupoAlternativo ?? null,
      grupoObrigatorio: item.grupoObrigatorio ?? false,
    })),
  });
}

function fonteDto(fonte: FonteMedicaPersistida): FonteMedicaInfo {
  return {
    arquivoId: fonte.arquivoMedicoId,
    registros: fonte.registros,
    codigosDistintos: fonte.codigosDistintos,
    procedimentos: fonte.procedimentos.map(procedimento => ({
      codigo: procedimento.codigo,
      descricao: procedimento.descricao,
      dataExecucao: procedimento.dataExecucao,
      sequencial: procedimento.sequencial,
      profissionais: procedimento.profissionais.map(profissional => ({
        nome: profissional.nome,
        conselho: profissional.conselho,
        numeroConselho: profissional.numeroConselho,
      })),
    })),
  };
}

function contextoDto(contexto: ContextoMedicoPersistido | null, statusEfetivo?: ContextoMedicoPersistido["status"]): ContextoMedicoInfo | null {
  if (!contexto || contexto.padraoId === null || !contexto.nomePadrao) return null;
  return {
    padraoId: contexto.padraoId,
    nomePadrao: contexto.nomePadrao,
    status: statusEfetivo ?? contexto.status,
    revisao: contexto.revisao,
    confirmadoEm: contexto.confirmadoEm ? new Date(contexto.confirmadoEm).toISOString() : null,
    confirmadoPor: contexto.confirmadoPor,
    justificativa: contexto.justificativa,
    abrangencia: contexto.abrangencia,
  };
}

function guiasFontes(fontes: readonly FonteMedicaPersistida[]): Array<{ codigo: string }> {
  return fontes.flatMap(fonte => fonte.procedimentos.map(procedimento => ({ codigo: procedimento.codigo })));
}

function candidatosAtuais(
  scope: ScopeContaMedicaNormalizado,
  fontes: readonly FonteMedicaPersistida[],
  hospital: SnapshotHospitalarAutorizado,
  gabaritos: readonly GabaritoManualInformativo[],
  comparar: typeof compararComposicaoInformativa,
): CandidatoGabarito[] {
  const manuais = gabaritos.filter(gabarito =>
    gabarito.isGabarito &&
    gabarito.status === "ativo" &&
    gabarito.estabelecimentoId === scope.estabelecimentoId &&
    gabarito.convenioId === scope.convenioId,
  );
  return comparar({
    scope,
    gabaritos: manuais,
    procedimentosMedicos: guiasFontes(fontes),
    itensHospitalares: hospital.itensHospitalares,
  });
}

function principalSnapshot(gabarito: GabaritoManualInformativo): string[] {
  return [...new Set(gabarito.principais.map(principal => codigoNormalizado(principal.codigo)).filter(Boolean))].sort();
}

function estadoContextoAtual(
  contexto: ContextoMedicoPersistido | null,
  fontes: readonly FonteMedicaPersistida[],
  hospital: SnapshotHospitalarAutorizado,
  gabarito: GabaritoManualInformativo | null,
): ContextoMedicoPersistido["status"] | undefined {
  if (!contexto) return undefined;
  if (contexto.status === "invalidado") return "invalidado";
  if (!gabarito || !gabarito.isGabarito || gabarito.status !== "ativo") return "revisao_necessaria";
  if (contexto.versaoPadrao !== versaoGabarito(gabarito)) return "revisao_necessaria";
  if (hashSemantico(contexto.fontesVersoes) !== versaoFontes(fontes)) return "revisao_necessaria";
  if (contexto.versaoItensHospitalares !== versaoItensHospitalares(hospital.itensHospitalares)) return "revisao_necessaria";
  return contexto.status;
}

function fontesProcedimentosSemanticos(guia: GuiaHonorariosParseada): readonly ProcedimentoMedicoInfo[] {
  return guia.procedimentos.map(procedimento => ({
    codigo: codigoNormalizado(procedimento.codigo),
    descricao: procedimento.descricao.trim(),
    dataExecucao: diaCivil(procedimento.dataExecucao),
    sequencial: procedimento.sequencial ? procedimento.sequencial.trim() : null,
    profissionais: procedimento.profissionais.map(profissional => ({
      nome: profissional.nome.trim(),
      conselho: profissional.conselho ? profissional.conselho.trim() : null,
      numeroConselho: profissional.numeroConselho ? profissional.numeroConselho.trim() : null,
    })).sort((a, b) => stable(a).localeCompare(stable(b))),
  })).filter(procedimento => Boolean(procedimento.codigo)).sort((a, b) => stable(a).localeCompare(stable(b)));
}

function referenciaGuiaMedica(guia: GuiaHonorariosParseada): string | null {
  return codigoNormalizado(guia.correlacao.numeroGuiaPrestador)
    || codigoNormalizado(guia.correlacao.guiaSolicitacaoInternacao)
    || codigoNormalizado(guia.correlacao.numeroGuiaOperadora)
    || null;
}

function datasGuiaMedica(guia: GuiaHonorariosParseada): string[] {
  const dates = [diaCivil(guia.correlacao.dataAtendimento), diaCivil(guia.correlacao.dataEmissaoGuia), ...guia.procedimentos.map(procedimento => diaCivil(procedimento.dataExecucao))]
    .filter((value): value is string => Boolean(value));
  return [...new Set(dates)];
}

/**
 * Correlaciona uma guia por referência própria ou referência principal explícita.
 * Em ambos os caminhos, se os dois lados trouxerem beneficiário, a igualdade é
 * obrigatória. Não há fallback por número de conta isolado.
 */
function correlacionarGuia(
  guia: GuiaHonorariosParseada,
  referencias: readonly ReferenciaGuiaHospitalar[],
): { referencia: ReferenciaGuiaHospitalar; guiaReferencia: string; avisoData?: string } | null {
  const propria = codigoNormalizado(guia.correlacao.numeroGuiaPrestador);
  const principal = codigoNormalizado(guia.correlacao.guiaSolicitacaoInternacao)
    || codigoNormalizado(guia.correlacao.numeroGuiaOperadora);
  const medicoBeneficiario = normalizarBeneficiario(guia.correlacao.numeroCarteira);
  const datasMedicas = datasGuiaMedica(guia);

  const encontrar = (referenciaBusca: string, usarOperadora: boolean): ReferenciaGuiaHospitalar | null => {
    if (!referenciaBusca) return null;
    const candidatos = referencias.filter(referencia => {
      const candidato = usarOperadora
        ? codigoNormalizado(referencia.numeroGuiaOperadora)
        : codigoNormalizado(referencia.numeroGuiaPrestador);
      if (!candidato || candidato !== referenciaBusca) return false;
      const hospitalBeneficiario = normalizarBeneficiario(referencia.beneficiario);
      if (medicoBeneficiario && hospitalBeneficiario && medicoBeneficiario !== hospitalBeneficiario) return false;
      const datasHospitalares = referencia.datasExecucao.map(diaCivil).filter((value): value is string => Boolean(value));
      if (datasMedicas.length && datasHospitalares.length && !datasMedicas.some(data => datasHospitalares.includes(data))) return false;
      return true;
    });
    return candidatos.length === 1 ? candidatos[0] : null;
  };

  // Identificador da guia do próprio documento é obrigatório quando existir.
  let referencia = encontrar(propria, false);
  if (!referencia && principal) {
    // guiaSolicitacaoInternacao pode apontar para a guia prestador; a guia
    // operadora só é comparada contra o identificador homólogo.
    referencia = encontrar(principal, Boolean(guia.correlacao.numeroGuiaOperadora && !guia.correlacao.guiaSolicitacaoInternacao));
  }
  if (!referencia) return null;
  const guiaReferencia = propria || principal;
  const possuiDatasHospitalares = referencia.datasExecucao.some(data => Boolean(diaCivil(data)));
  return {
    referencia,
    guiaReferencia,
    avisoData: datasMedicas.length === 0 || !possuiDatasHospitalares
      ? "Datas de execução ausentes em uma das fontes; a correlação foi limitada à guia e ao beneficiário quando informado."
      : undefined,
  };
}

function pendente(): ContaContextoMedicoResultado {
  return {
    configuracaoPendente: true,
    diagnosticoSnapshot: null,
    fontes: [],
    candidatos: [],
    contexto: null,
    itensHospitalares: 0,
    setorInformado: false,
    avisos: ["Contexto médico informativo ainda não está configurado para esta instalação."],
  };
}

function semSnapshot(diagnosticoSnapshot: DiagnosticoSnapshotHospitalar): ContaContextoMedicoResultado {
  return {
    configuracaoPendente: false,
    diagnosticoSnapshot,
    fontes: [],
    candidatos: [],
    contexto: null,
    itensHospitalares: 0,
    setorInformado: false,
    avisos: [],
  };
}

function justificativaValida(value: string): string {
  if (typeof value !== "string") erro("PRECONDICAO", "Justificativa obrigatória.");
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_JUSTIFICATIVA || /[\u0000-\u001F\u007F]/.test(text)) {
    erro("PRECONDICAO", "Justificativa inválida.");
  }
  return text;
}

function revisarEsperada(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) erro("PRECONDICAO", "Revisão esperada inválida.");
  return value;
}

function mesmoScope(a: ScopeContaMedicaNormalizado, b: ScopeContaMedicaNormalizado): boolean {
  return a.estabelecimentoId === b.estabelecimentoId &&
    a.convenioId === b.convenioId &&
    a.arquivoHospitalId === b.arquivoHospitalId &&
    a.numeroConta === b.numeroConta &&
    a.numeroLote === b.numeroLote &&
    a.competencia === b.competencia;
}

export function criarContaContextoMedicoService(deps: ContaContextoMedicoDependencias) {
  const parse = deps.parse ?? parseContaHonorarios;
  const comparar = deps.comparar ?? compararComposicaoInformativa;

  async function configurado(): Promise<boolean> {
    return deps.repositorio.configurado();
  }

  async function snapshot(scope: ScopeContaMedicaNormalizado): Promise<SnapshotHospitalarAutorizado | null> {
    const result = await deps.repositorio.resolverSnapshotHospitalar(scope);
    if (!result || !mesmoScope(result.scope, scope)) {
      return null;
    }
    return result;
  }

  async function snapshotObrigatorio(scope: ScopeContaMedicaNormalizado): Promise<SnapshotHospitalarAutorizado> {
    const hospital = await snapshot(scope);
    if (!hospital) {
      erro("PRECONDICAO", "O contexto hospitalar ainda não está pronto para esta conta. Atualize a tela e tente novamente.");
    }
    return hospital;
  }

  async function estado(scope: ScopeContaMedicaNormalizado) {
    const hospital = await snapshotObrigatorio(scope);
    const [fontes, gabaritos, contexto] = await Promise.all([
      deps.repositorio.listarFontes(scope),
      deps.repositorio.listarGabaritosManuais(scope),
      deps.repositorio.obterContexto(scope),
    ]);
    const gabaritoContexto = contexto?.padraoId === null || contexto?.padraoId === undefined
      ? null
      : gabaritos.find(gabarito => gabarito.padraoId === contexto.padraoId) ??
        await deps.repositorio.obterGabaritoManual(scope, contexto.padraoId);
    return { hospital, fontes, gabaritos, contexto, gabaritoContexto };
  }

  return {
    async consultar(input: { scope: ScopeContaMedica }): Promise<ContaContextoMedicoResultado> {
      if (!await configurado()) return pendente();
      const scope = normalizarScopeContaMedica(input.scope);
      const hospital = await snapshot(scope);
      if (!hospital) {
        return semSnapshot(await deps.repositorio.diagnosticarSnapshotHospitalar(scope));
      }
      const [fontes, gabaritos, contexto] = await Promise.all([
        deps.repositorio.listarFontes(scope),
        deps.repositorio.listarGabaritosManuais(scope),
        deps.repositorio.obterContexto(scope),
      ]);
      const gabaritoContexto = contexto?.padraoId === null || contexto?.padraoId === undefined
        ? null
        : gabaritos.find(gabarito => gabarito.padraoId === contexto.padraoId) ??
          await deps.repositorio.obterGabaritoManual(scope, contexto.padraoId);
      const current = { hospital, fontes, gabaritos, contexto, gabaritoContexto };
      const candidatos = candidatosAtuais(scope, current.fontes, current.hospital, current.gabaritos, comparar);
      const avisos: string[] = [];
      if (!current.hospital.setorInformado) avisos.push("Setor não informado: a composição é avaliada sobre a conta inteira.");
      if (current.fontes.some(fonte => fonte.procedimentos.some(procedimento => procedimento.dataExecucao))) {
        avisos.push("Datas de execução são informativas e não são usadas como filtro de composição.");
      }
      if (!current.fontes.length) avisos.push("Nenhum XML médico foi indexado para este escopo.");
      const statusEfetivo = estadoContextoAtual(current.contexto, current.fontes, current.hospital, current.gabaritoContexto);
      if (statusEfetivo === "revisao_necessaria" && current.contexto?.status === "confirmado") {
        avisos.push("A fonte, os itens hospitalares ou o gabarito mudaram; a confirmação anterior precisa de revisão.");
      }
      return {
        configuracaoPendente: false,
        diagnosticoSnapshot: null,
        fontes: current.fontes.map(fonteDto),
        candidatos,
        contexto: contextoDto(current.contexto, statusEfetivo),
        itensHospitalares: current.hospital.itensHospitalares.length,
        setorInformado: current.hospital.setorInformado,
        avisos,
      };
    },

    async listarArquivos(input: { scope: ScopeContaMedica; page?: number }) {
      if (!await configurado()) return { configuracaoPendente: true, arquivos: [], page: 1, temProximaPagina: false };
      const scope = normalizarScopeContaMedica(input.scope);
      // Garante que não se lista arquivo médico de um escopo hospitalar inexistente.
      if (!await snapshot(scope)) {
        return {
          configuracaoPendente: false,
          diagnosticoSnapshot: await deps.repositorio.diagnosticarSnapshotHospitalar(scope),
          arquivos: [],
          page: 1,
          temProximaPagina: false,
        };
      }
      const page = Number.isSafeInteger(input.page) && input.page! > 0 ? input.page! : 1;
      const result = await deps.repositorio.listarArquivosMedicos(scope, page, PAGE_SIZE);
      return {
        configuracaoPendente: false,
        diagnosticoSnapshot: null,
        page,
        temProximaPagina: result.temProximaPagina,
        arquivos: result.arquivos.map(arquivo => ({
          id: arquivo.id,
          nome: arquivo.nome,
          tamanho: arquivo.tamanho,
          dataReferencia: arquivo.dataReferencia ? new Date(arquivo.dataReferencia).toISOString() : null,
        })),
      };
    },

    async indexar(input: { scope: ScopeContaMedica; arquivoMedicoId: number }) {
      if (!await configurado()) erro("CONFIGURACAO_PENDENTE", "Contexto médico ainda não está configurado.");
      const scope = normalizarScopeContaMedica(input.scope);
      const arquivoMedicoId = inteiroPositivo(input.arquivoMedicoId, "Arquivo médico");
      const hospital = await snapshotObrigatorio(scope);
      const arquivo = await deps.repositorio.obterArquivoMedicoAutorizado(scope, arquivoMedicoId);
      if (!arquivo || arquivo.id !== arquivoMedicoId || arquivo.tipoArquivo !== "xml" || arquivo.direcao !== "enviado" ||
          arquivo.estabelecimentoId !== scope.estabelecimentoId || arquivo.convenioId !== scope.convenioId) {
        erro("FORBIDDEN", "Arquivo médico não autorizado para esta unidade e convênio.");
      }
      // A leitura só acontece nesta mutação explícita e recebe o arquivo obtido do DB,
      // nunca uma URL controlada pelo cliente.
      const xml = await deps.repositorio.lerXmlMedicoAutorizado(arquivo);
      if (!Buffer.isBuffer(xml)) erro("PRECONDICAO", "Não foi possível abrir o XML médico autorizado.");
      const parsed = parse(xml);
      if (!parsed.recognized) erro("PRECONDICAO", "O XML não contém guia de honorários reconhecida.");

      const avisos = new Set<string>();
      let correlacionadas = 0;
      let criadas = 0;
      const vistos = new Set<string>();
      for (const guia of parsed.guias) {
        const match = correlacionarGuia(guia, hospital.referenciasGuias);
        if (!match) continue; // Arquivo misto: somente a guia fortemente correlacionada entra.
        const procedimentos = fontesProcedimentosSemanticos(guia);
        if (!procedimentos.length) continue;
        const semantic = {
          guiaReferencia: match.guiaReferencia,
          procedimentos,
          // Não persiste a correlação privada; só estabiliza mudança semântica relevante.
          correlacao: {
            guiaPrestador: codigoNormalizado(guia.correlacao.numeroGuiaPrestador),
            guiaOperadora: codigoNormalizado(guia.correlacao.numeroGuiaOperadora),
            guiaPrincipal: codigoNormalizado(guia.correlacao.guiaSolicitacaoInternacao),
            dataAtendimento: diaCivil(guia.correlacao.dataAtendimento),
          },
        };
        const versaoSemantica = hashSemantico(semantic);
        const dedupe = `${match.guiaReferencia}\u0000${versaoSemantica}`;
        if (vistos.has(dedupe)) continue;
        vistos.add(dedupe);
        correlacionadas += 1;
        const insertion = await deps.repositorio.inserirFonteSeAusente({
          scope,
          arquivoMedicoId,
          guiaReferencia: match.guiaReferencia,
          versaoSemantica,
          registros: procedimentos.length,
          codigosDistintos: new Set(procedimentos.map(procedimento => procedimento.codigo)).size,
          procedimentos,
        });
        if (insertion.criada) criadas += 1;
        if (match.avisoData) avisos.add(match.avisoData);
      }
      if (!correlacionadas) {
        erro("PRECONDICAO", "Nenhuma guia do XML médico corresponde de forma segura à conta selecionada.");
      }
      return { indexadas: criadas, jaIndexadas: correlacionadas - criadas, avisos: [...avisos] };
    },

    async confirmar(input: {
      scope: ScopeContaMedica;
      padraoId: number;
      justificativa: string;
      revisaoEsperada: number;
      usuarioId: number;
    }): Promise<ContextoMedicoInfo> {
      if (!await configurado()) erro("CONFIGURACAO_PENDENTE", "Contexto médico ainda não está configurado.");
      const scope = normalizarScopeContaMedica(input.scope);
      const padraoId = inteiroPositivo(input.padraoId, "Gabarito");
      const justificativa = justificativaValida(input.justificativa);
      const revisaoEsperada = revisarEsperada(input.revisaoEsperada);
      const usuarioId = inteiroPositivo(input.usuarioId, "Usuário");
      // Recompõe tudo no instante da confirmação; nenhuma conclusão vinda do cliente é aceita.
      const current = await estado(scope);
      const gabarito = await deps.repositorio.obterGabaritoManual(scope, padraoId);
      if (!gabarito || !gabarito.isGabarito || gabarito.status !== "ativo" ||
          gabarito.estabelecimentoId !== scope.estabelecimentoId || gabarito.convenioId !== scope.convenioId) {
        erro("PRECONDICAO", "Gabarito manual ativo não pertence ao escopo informado.");
      }
      const candidatos = candidatosAtuais(scope, current.fontes, current.hospital, [gabarito], comparar);
      const candidato = candidatos[0];
      if (!candidato?.elegivel) erro("PRECONDICAO", "O gabarito não está elegível para confirmação nesta conta.");
      const principais = principalSnapshot(gabarito);
      if (!principais.length || candidato.principaisEncontrados !== principais.length) {
        erro("PRECONDICAO", "Nem todos os procedimentos principais foram confirmados no snapshot atual.");
      }
      const fontesAtuais = fontesVersoes(current.fontes);
      if (!fontesAtuais.length) erro("PRECONDICAO", "Não há fonte médica indexada para confirmar.");
      const versaoPadraoAtual = versaoGabarito(gabarito);
      const versaoItensAtual = versaoItensHospitalares(current.hospital.itensHospitalares);
      const abrangencia = current.hospital.setorInformado ? "conta_inteira" : "conta_inteira_sem_setor";

      return deps.repositorio.transacionar(async tx => {
        // A transação relê a linha protegida. O adaptador deve também revalidar o
        // snapshot hospitalar no mesmo isolamento quando suportado.
        const existente = await tx.obterContextoParaAtualizacao(scope);
        if (existente && existente.revisao !== revisaoEsperada) {
          erro("CONCORRENCIA", "O contexto foi alterado por outro usuário; atualize a tela.");
        }
        if (!existente && revisaoEsperada !== 0) {
          erro("CONCORRENCIA", "O contexto ainda não possui a revisão esperada; atualize a tela.");
        }
        const proximaRevisao = (existente?.revisao ?? 0) + 1;
        const proximo: ContextoMedicoNovo = {
          scope,
          padraoId,
          nomePadrao: gabarito.nome,
          status: "confirmado",
          revisao: proximaRevisao,
          confirmadoEm: deps.now?.() ?? new Date(),
          confirmadoPor: usuarioId,
          justificativa,
          versaoPadrao: versaoPadraoAtual,
          fontesVersoes: fontesAtuais,
          versaoItensHospitalares: versaoItensAtual,
          principaisSnapshot: principais,
          abrangencia,
        };
        const salvo = existente
          ? await tx.atualizarContextoComCas(existente.id, revisaoEsperada, proximo)
          : await tx.inserirContextoInicial(proximo);
        if (!salvo) erro("CONCORRENCIA", "O contexto foi alterado por outro usuário; atualize a tela.");
        await tx.anexarEvento({
          contextoId: salvo.id,
          revisao: salvo.revisao,
          tipo: "confirmado",
          usuarioId,
          justificativa,
          padraoId,
          versaoPadrao: versaoPadraoAtual,
          evidencia: {
            fontesVersoes: fontesAtuais,
            versaoItensHospitalares: versaoItensAtual,
            principaisSnapshot: principais,
          },
        });
        return contextoDto(salvo)!;
      });
    },

    async invalidar(input: {
      scope: ScopeContaMedica;
      justificativa: string;
      revisaoEsperada: number;
      usuarioId: number;
    }): Promise<ContextoMedicoInfo | null> {
      if (!await configurado()) erro("CONFIGURACAO_PENDENTE", "Contexto médico ainda não está configurado.");
      const scope = normalizarScopeContaMedica(input.scope);
      const justificativa = justificativaValida(input.justificativa);
      const revisaoEsperada = revisarEsperada(input.revisaoEsperada);
      const usuarioId = inteiroPositivo(input.usuarioId, "Usuário");
      // Verifica a conta exata antes de produzir qualquer evento.
      const current = await estado(scope);
      const fontesAtuais = fontesVersoes(current.fontes);
      const versaoItensAtual = versaoItensHospitalares(current.hospital.itensHospitalares);

      return deps.repositorio.transacionar(async tx => {
        const existente = await tx.obterContextoParaAtualizacao(scope);
        if (!existente) erro("NAO_ENCONTRADO", "Não há contexto para invalidar.");
        if (existente.revisao !== revisaoEsperada) {
          erro("CONCORRENCIA", "O contexto foi alterado por outro usuário; atualize a tela.");
        }
        const proximo: ContextoMedicoNovo = {
          ...existente,
          status: "invalidado",
          revisao: existente.revisao + 1,
          confirmadoEm: existente.confirmadoEm,
          confirmadoPor: existente.confirmadoPor,
          justificativa,
          fontesVersoes: fontesAtuais,
          versaoItensHospitalares: versaoItensAtual,
          principaisSnapshot: existente.principaisSnapshot,
        };
        const salvo = await tx.atualizarContextoComCas(existente.id, revisaoEsperada, proximo);
        if (!salvo) erro("CONCORRENCIA", "O contexto foi alterado por outro usuário; atualize a tela.");
        await tx.anexarEvento({
          contextoId: salvo.id,
          revisao: salvo.revisao,
          tipo: "invalidado",
          usuarioId,
          justificativa,
          padraoId: salvo.padraoId,
          versaoPadrao: salvo.versaoPadrao,
          evidencia: {
            fontesVersoes: fontesAtuais,
            versaoItensHospitalares: versaoItensAtual,
            principaisSnapshot: salvo.principaisSnapshot,
          },
        });
        return contextoDto(salvo, "invalidado");
      });
    },
  };
}

export type ContaContextoMedicoService = ReturnType<typeof criarContaContextoMedicoService>;

/**
 * Fallback deliberadamente fechado. Enquanto o schema não for exportado e o
 * adaptador Drizzle não estiver registrado pelo integrador, consultas retornam
 * `configuracaoPendente` e mutações não fazem I/O nem escrita.
 */
export function criarServicoContaContextoMedicoPendente(): ContaContextoMedicoService {
  const bloqueado = async () => { erro("CONFIGURACAO_PENDENTE", "Contexto médico ainda não está configurado."); };
  const repositorio: ContaContextoMedicoRepositorio = {
    configurado: async () => false,
    resolverSnapshotHospitalar: bloqueado as never,
    diagnosticarSnapshotHospitalar: bloqueado as never,
    listarArquivosMedicos: bloqueado as never,
    obterArquivoMedicoAutorizado: bloqueado as never,
    lerXmlMedicoAutorizado: bloqueado as never,
    listarFontes: bloqueado as never,
    inserirFonteSeAusente: bloqueado as never,
    listarGabaritosManuais: bloqueado as never,
    obterGabaritoManual: bloqueado as never,
    obterContexto: bloqueado as never,
    transacionar: bloqueado as never,
  };
  return criarContaContextoMedicoService({ repositorio });
}
