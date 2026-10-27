import { and, desc, eq, sql } from "drizzle-orm";
import {
  arquivos,
  contaContextoMedicoContextos,
  contaContextoMedicoEventos,
  contaContextoMedicoFontes,
  faturamentoTiss,
  padroesCobranca,
} from "../drizzle/schema";
import type {
  DiagnosticoSnapshotHospitalar,
  ItemAssociadoGabarito,
  ProcedimentoMedicoInfo,
} from "../shared/contaContextoMedico";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { storageGet } from "./storage";
import {
  ContaContextoMedicoErro,
  criarContaContextoMedicoService,
  type ArquivoMedicoAutorizado,
  type ArquivoMedicoInfoInterno,
  type ContextoMedicoNovo,
  type ContextoMedicoPersistido,
  type ContextoMedicoTransacao,
  type ContaContextoMedicoRepositorio,
  type EventoContextoMedicoNovo,
  type FonteMedicaPersistida,
  type GabaritoManualInformativo,
  type ScopeContaMedicaNormalizado,
  type SnapshotHospitalarAutorizado,
} from "./contaContextoMedicoService";

const LIMITE_XML_BYTES = 16 * 1024 * 1024;
const TIMEOUT_LEITURA_XML_MS = 15_000;

type BancoDrizzle = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type TransacaoDrizzle = Parameters<Parameters<BancoDrizzle["transaction"]>[0]>[0];

type ArquivoMedicoInterno = ArquivoMedicoAutorizado & { s3Url?: string | null };

type LinhaFonteDb = {
  id: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoHospitalId: number;
  arquivoMedicoId: number;
  numeroConta: string;
  numeroLote: string;
  competencia: string;
  guiaReferencia: string;
  versaoSemantica: string;
  registros: number;
  codigosDistintos: number;
  procedimentosJson: unknown;
  criadoEm: Date;
};

type LinhaContextoDb = {
  id: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoHospitalId: number;
  numeroConta: string;
  numeroLote: string;
  competencia: string;
  padraoId: number | null;
  nomePadrao: string | null;
  status: "confirmado" | "invalidado" | "revisao_necessaria";
  revisao: number;
  confirmadoEm: Date | null;
  confirmadoPor: number | null;
  justificativa: string;
  versaoPadrao: string | null;
  fontesVersoesJson: unknown;
  versaoItensHospitalares: string;
  principaisSnapshotJson: unknown;
  abrangencia: "conta_inteira_sem_setor" | "conta_inteira";
};

export type LeitorXmlSeguroDependencias = {
  storageGet?: typeof storageGet;
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  /** Origins HTTPS do servidor de storage; usado em testes e implantações específicas. */
  origensStoragePermitidas?: readonly string[];
};

export type ContaContextoMedicoDrizzleDependencias = LeitorXmlSeguroDependencias & {
  /**
   * Injeção para testes. A função padrão é lazy e só pede conexão em uma chamada
   * do repositório, nunca ao importar ou construir o serviço.
   */
  getDb?: () => Promise<BancoDrizzle | null>;
};

function erroConfiguracao(): never {
  throw new ContaContextoMedicoErro(
    "CONFIGURACAO_PENDENTE",
    "Contexto médico informativo ainda não está configurado para esta instalação.",
  );
}

function erroLeituraXml(): never {
  throw new ContaContextoMedicoErro("PRECONDICAO", "Não foi possível abrir o XML médico autorizado.");
}

function bancoIndisponivel(): never {
  throw new ContaContextoMedicoErro("PRECONDICAO", "Não foi possível consultar o contexto médico no momento.");
}

function texto(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function numero(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inteiro(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function dataCivil(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function registro(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function procedimentosSanitizados(value: unknown): ProcedimentoMedicoInfo[] {
  if (!Array.isArray(value)) return [];
  const procedimentos: ProcedimentoMedicoInfo[] = [];
  for (const item of value) {
    const source = registro(item);
    const codigo = texto(source?.codigo);
    const descricao = texto(source?.descricao);
    if (!source || !codigo || !descricao) continue;
    const profissionais = Array.isArray(source.profissionais)
      ? source.profissionais.flatMap((profissional) => {
        const raw = registro(profissional);
        const nome = texto(raw?.nome);
        return nome ? [{
          nome,
          conselho: texto(raw?.conselho),
          numeroConselho: texto(raw?.numeroConselho),
        }] : [];
      })
      : [];
    procedimentos.push({
      codigo,
      descricao,
      dataExecucao: dataCivil(texto(source.dataExecucao)),
      sequencial: texto(source.sequencial),
      profissionais,
    });
  }
  return procedimentos;
}

function fontesVersoesSanitizadas(value: unknown): ContextoMedicoPersistido["fontesVersoes"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const raw = registro(item);
    const fonteId = inteiro(raw?.fonteId);
    const guiaReferencia = texto(raw?.guiaReferencia);
    const versaoSemantica = texto(raw?.versaoSemantica);
    return fonteId && guiaReferencia && versaoSemantica
      ? [{ fonteId, guiaReferencia, versaoSemantica }]
      : [];
  });
}

function principaisSanitizados(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => texto(item) ?? []))];
}

function fonteDbParaDominio(row: LinhaFonteDb): FonteMedicaPersistida {
  return {
    id: row.id,
    scope: {
      estabelecimentoId: row.estabelecimentoId,
      convenioId: row.convenioId,
      arquivoHospitalId: row.arquivoHospitalId,
      numeroConta: row.numeroConta,
      numeroLote: row.numeroLote,
      competencia: row.competencia,
    },
    arquivoMedicoId: row.arquivoMedicoId,
    guiaReferencia: row.guiaReferencia,
    versaoSemantica: row.versaoSemantica,
    registros: row.registros,
    codigosDistintos: row.codigosDistintos,
    procedimentos: procedimentosSanitizados(row.procedimentosJson),
    criadoEm: row.criadoEm,
  };
}

function contextoDbParaDominio(row: LinhaContextoDb): ContextoMedicoPersistido {
  return {
    id: row.id,
    scope: {
      estabelecimentoId: row.estabelecimentoId,
      convenioId: row.convenioId,
      arquivoHospitalId: row.arquivoHospitalId,
      numeroConta: row.numeroConta,
      numeroLote: row.numeroLote,
      competencia: row.competencia,
    },
    padraoId: row.padraoId,
    nomePadrao: row.nomePadrao,
    status: row.status,
    revisao: row.revisao,
    confirmadoEm: row.confirmadoEm,
    confirmadoPor: row.confirmadoPor,
    justificativa: row.justificativa,
    versaoPadrao: row.versaoPadrao,
    fontesVersoes: fontesVersoesSanitizadas(row.fontesVersoesJson),
    versaoItensHospitalares: row.versaoItensHospitalares,
    principaisSnapshot: principaisSanitizados(row.principaisSnapshotJson),
    abrangencia: row.abrangencia,
  };
}

function condicaoFonte(scope: ScopeContaMedicaNormalizado) {
  return and(
    eq(contaContextoMedicoFontes.estabelecimentoId, scope.estabelecimentoId),
    eq(contaContextoMedicoFontes.convenioId, scope.convenioId),
    eq(contaContextoMedicoFontes.arquivoHospitalId, scope.arquivoHospitalId),
    eq(contaContextoMedicoFontes.numeroConta, scope.numeroConta),
    eq(contaContextoMedicoFontes.numeroLote, scope.numeroLote),
    eq(contaContextoMedicoFontes.competencia, scope.competencia),
  );
}

function condicaoContexto(scope: ScopeContaMedicaNormalizado) {
  return and(
    eq(contaContextoMedicoContextos.estabelecimentoId, scope.estabelecimentoId),
    eq(contaContextoMedicoContextos.convenioId, scope.convenioId),
    eq(contaContextoMedicoContextos.arquivoHospitalId, scope.arquivoHospitalId),
    eq(contaContextoMedicoContextos.numeroConta, scope.numeroConta),
    eq(contaContextoMedicoContextos.numeroLote, scope.numeroLote),
    eq(contaContextoMedicoContextos.competencia, scope.competencia),
  );
}

/**
 * Expressões canônicas idênticas às usadas ao materializar `contas_convenio_itens`.
 * Todas são avaliadas somente depois de restringir unidade, convênio e arquivo.
 */
function contaCanonica() {
  return sql<string>`COALESCE(
    NULLIF(TRIM(${faturamentoTiss.numeroGuiaPrestador}), ''),
    NULLIF(TRIM(${faturamentoTiss.numeroGuiaOperadora}), ''),
    CONCAT('SEM_GUIA_', ${faturamentoTiss.arquivoId})
  )`;
}

function loteCanonico() {
  return sql<string>`COALESCE(NULLIF(TRIM(${faturamentoTiss.numeroLote}), ''), '')`;
}

function competenciaCanonica() {
  return sql<string>`COALESCE(
    NULLIF(TRIM(${faturamentoTiss.competencia}), ''),
    DATE_FORMAT(COALESCE(${faturamentoTiss.dataReferencia}, ${arquivos.dataReferencia}, ${faturamentoTiss.dataExecucao}), '%Y/%m'),
    ''
  )`;
}

function condicaoArquivoHospitalar(scope: ScopeContaMedicaNormalizado) {
  return and(
    eq(faturamentoTiss.arquivoId, scope.arquivoHospitalId),
    eq(faturamentoTiss.estabelecimentoId, scope.estabelecimentoId),
    eq(faturamentoTiss.convenioId, scope.convenioId),
  );
}

function condicaoGuia(scope: ScopeContaMedicaNormalizado) {
  return eq(contaCanonica(), scope.numeroConta);
}

function camposFonte() {
  return {
    id: contaContextoMedicoFontes.id,
    estabelecimentoId: contaContextoMedicoFontes.estabelecimentoId,
    convenioId: contaContextoMedicoFontes.convenioId,
    arquivoHospitalId: contaContextoMedicoFontes.arquivoHospitalId,
    arquivoMedicoId: contaContextoMedicoFontes.arquivoMedicoId,
    numeroConta: contaContextoMedicoFontes.numeroConta,
    numeroLote: contaContextoMedicoFontes.numeroLote,
    competencia: contaContextoMedicoFontes.competencia,
    guiaReferencia: contaContextoMedicoFontes.guiaReferencia,
    versaoSemantica: contaContextoMedicoFontes.versaoSemantica,
    registros: contaContextoMedicoFontes.registros,
    codigosDistintos: contaContextoMedicoFontes.codigosDistintos,
    procedimentosJson: contaContextoMedicoFontes.procedimentosJson,
    criadoEm: contaContextoMedicoFontes.criadoEm,
  };
}

function camposContexto() {
  return {
    id: contaContextoMedicoContextos.id,
    estabelecimentoId: contaContextoMedicoContextos.estabelecimentoId,
    convenioId: contaContextoMedicoContextos.convenioId,
    arquivoHospitalId: contaContextoMedicoContextos.arquivoHospitalId,
    numeroConta: contaContextoMedicoContextos.numeroConta,
    numeroLote: contaContextoMedicoContextos.numeroLote,
    competencia: contaContextoMedicoContextos.competencia,
    padraoId: contaContextoMedicoContextos.padraoId,
    nomePadrao: contaContextoMedicoContextos.nomePadrao,
    status: contaContextoMedicoContextos.status,
    revisao: contaContextoMedicoContextos.revisao,
    confirmadoEm: contaContextoMedicoContextos.confirmadoEm,
    confirmadoPor: contaContextoMedicoContextos.confirmadoPor,
    justificativa: contaContextoMedicoContextos.justificativa,
    versaoPadrao: contaContextoMedicoContextos.versaoPadrao,
    fontesVersoesJson: contaContextoMedicoContextos.fontesVersoesJson,
    versaoItensHospitalares: contaContextoMedicoContextos.versaoItensHospitalares,
    principaisSnapshotJson: contaContextoMedicoContextos.principaisSnapshotJson,
    abrangencia: contaContextoMedicoContextos.abrangencia,
  };
}

function valoresContexto(contexto: ContextoMedicoNovo) {
  return {
    estabelecimentoId: contexto.scope.estabelecimentoId,
    convenioId: contexto.scope.convenioId,
    arquivoHospitalId: contexto.scope.arquivoHospitalId,
    numeroConta: contexto.scope.numeroConta,
    numeroLote: contexto.scope.numeroLote,
    competencia: contexto.scope.competencia,
    padraoId: contexto.padraoId,
    nomePadrao: contexto.nomePadrao,
    status: contexto.status,
    revisao: contexto.revisao,
    confirmadoEm: contexto.confirmadoEm ? new Date(contexto.confirmadoEm) : null,
    confirmadoPor: contexto.confirmadoPor,
    justificativa: contexto.justificativa,
    versaoPadrao: contexto.versaoPadrao,
    fontesVersoesJson: [...contexto.fontesVersoes],
    versaoItensHospitalares: contexto.versaoItensHospitalares,
    principaisSnapshotJson: [...contexto.principaisSnapshot],
    abrangencia: contexto.abrangencia,
  };
}

function eConflitoUnico(error: unknown): boolean {
  const raw = registro(error);
  return raw?.code === "ER_DUP_ENTRY" || raw?.code === "23505" || raw?.errno === 1062;
}

function tipoHospitalar(value: string | null): "procedimento" | "outro" {
  return value?.trim().toUpperCase() === "PROCEDIMENTO" ? "procedimento" : "outro";
}

function itemAssociadoSeguro(value: unknown): ItemAssociadoGabarito | null {
  const raw = registro(value);
  const codigo = texto(raw?.codigo);
  const descricao = texto(raw?.descricao);
  const frequencia = numero(raw?.frequencia);
  const quantidadeMedia = numero(raw?.quantidadeMedia);
  if (!codigo || !descricao || frequencia === null || quantidadeMedia === null) return null;
  const categoria = raw?.categoria;
  const quantidadeMin = numero(raw?.quantidadeMin);
  const quantidadeMax = numero(raw?.quantidadeMax);
  return {
    codigo,
    descricao,
    tipo: texto(raw?.tipo) ?? undefined,
    frequencia,
    quantidadeMedia,
    quantidadeMin: quantidadeMin ?? undefined,
    quantidadeMax: quantidadeMax ?? undefined,
    categoria: categoria === "obrigatorio" || categoria === "condicional" || categoria === "opcional"
      ? categoria
      : undefined,
    grupo: texto(raw?.grupo) ?? undefined,
    grupoAlternativo: texto(raw?.grupoAlternativo) ?? undefined,
    grupoObrigatorio: raw?.grupoObrigatorio === true,
  };
}

function itensAssociadosSeguros(value: unknown): ItemAssociadoGabarito[] {
  return Array.isArray(value)
    ? value.flatMap(item => {
      const seguro = itemAssociadoSeguro(item);
      return seguro ? [seguro] : [];
    })
    : [];
}

function normalizarGabarito(row: {
  id: number;
  estabelecimentoId: number | null;
  convenioId: number | null;
  codigoProcedimentoPrincipal: string;
  descricaoProcedimentoPrincipal: string | null;
  itensAssociados: unknown;
  status: "aprendendo" | "ativo" | "revisao" | "inativo";
  isGabarito: number;
}): GabaritoManualInformativo | null {
  if (!row.estabelecimentoId || !row.convenioId || row.status !== "ativo" || row.isGabarito !== 1) return null;
  const codigo = texto(row.codigoProcedimentoPrincipal);
  if (!codigo) return null;
  const descricao = texto(row.descricaoProcedimentoPrincipal);
  const principais = Array.from(new Set(codigo.split(/\s*\+\s*/u).map(parte => parte.trim()).filter(Boolean)));
  if (!principais.length) return null;
  return {
    padraoId: row.id,
    nome: descricao ? `${codigo} — ${descricao}` : `Gabarito ${codigo}`,
    estabelecimentoId: row.estabelecimentoId,
    convenioId: row.convenioId,
    isGabarito: true,
    status: "ativo",
    principais: principais.map(codigo => ({ codigo })),
    itensAssociados: itensAssociadosSeguros(row.itensAssociados),
  };
}

function origensStoragePermitidas(deps: LeitorXmlSeguroDependencias): Set<string> {
  const candidatas = deps.origensStoragePermitidas ?? [ENV.forgeApiUrl, ENV.publicAppUrl];
  const origens = new Set<string>();
  for (const candidata of candidatas) {
    try {
      const url = new URL(candidata);
      if (url.protocol === "https:" && !url.username && !url.password) origens.add(url.origin);
    } catch {
      // Uma configuração inválida não abre a allowlist.
    }
  }
  return origens;
}

function urlPublicaHttps(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
    // Um URL de leitura autenticado pelo storage pode usar origem/CDN distinta
    // do proxy. Não aceitar userinfo, hosts locais ou literais de rede privada.
    if (url.protocol !== "https:" || url.username || url.password
      || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || host === "::1" || host.startsWith("fc") && host.includes(":") || host.startsWith("fd") && host.includes(":")
      || host.startsWith("fe80:") || host.includes(":")) return null;
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/u);
    if (ipv4) {
      const a = Number(ipv4[1]), b = Number(ipv4[2]);
      if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254
        || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
        || a === 100 && b >= 64 && b <= 127 || a >= 224) return null;
    }
    return url.toString();
  } catch { return null; }
}

function urlHttpsSegura(valor: string | null | undefined, origensPermitidas: ReadonlySet<string>): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password || !origensPermitidas.has(url.origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function chaveStorageSegura(value: string): boolean {
  return /^arquivos\/[\w./-]+$/u.test(value) &&
    !value.includes("..") &&
    !value.includes("//");
}

async function lerRespostaComLimite(response: Response, limite: number): Promise<Buffer> {
  const tamanhoCabecalho = response.headers.get("content-length");
  if (tamanhoCabecalho && (!/^\d+$/.test(tamanhoCabecalho) || Number(tamanhoCabecalho) > limite)) {
    erroLeituraXml();
  }
  if (!response.body) erroLeituraXml();
  const reader = response.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const proxima = await reader.read();
    if (proxima.done) break;
    total += proxima.value.byteLength;
    if (total > limite) {
      await reader.cancel().catch(() => undefined);
      erroLeituraXml();
    }
    partes.push(proxima.value);
  }
  return Buffer.concat(partes.map(parte => Buffer.from(parte)));
}

/**
 * Leitor para o único ponto de rede da feature: `indexar`. A URL nunca vem do
 * cliente; vem da chave persistida e/ou da URL persistida do arquivo já autorizado.
 */
export async function lerXmlMedicoAutorizadoSeguro(
  arquivo: ArquivoMedicoInterno,
  deps: LeitorXmlSeguroDependencias = {},
): Promise<Buffer> {
  const obterStorage = deps.storageGet ?? storageGet;
  const executarFetch = deps.fetch ?? fetch;
  const limite = deps.maxBytes ?? LIMITE_XML_BYTES;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_LEITURA_XML_MS;
  const origensPermitidas = origensStoragePermitidas(deps);
  const urlPersistida = urlHttpsSegura(arquivo.s3Url, origensPermitidas);
  if (!chaveStorageSegura(arquivo.s3Key) || !urlPublicaHttps(arquivo.s3Url)) erroLeituraXml();

  let urlLeitura: string | null = null;
  try {
    const assinatura = await obterStorage(arquivo.s3Key);
    // A autoridade vem do SDK autenticado e da chave exata já autorizada,
    // não da origem arbitrária de um URL persistido ou enviado pelo usuário.
    if (assinatura.key === arquivo.s3Key) urlLeitura = urlPublicaHttps(assinatura.url);
  } catch {
    // O fallback preserva o fail-closed: só utiliza a URL persistida HTTPS da
    // mesma origem conhecida do storage, nunca uma URL vinda da requisição.
    urlLeitura = null;
  }
  urlLeitura ??= urlPersistida;
  if (!urlLeitura) erroLeituraXml();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await executarFetch(urlLeitura, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/xml, text/xml;q=0.9, application/*+xml;q=0.8",
      },
    });
    if (!response.ok) erroLeituraXml();
    const contentType = response.headers.get("content-type");
    if (contentType && !/^(application|text)\/(xml|[^;]+\+xml)(?:;|$)/i.test(contentType.trim())) {
      erroLeituraXml();
    }
    return await lerRespostaComLimite(response, limite);
  } catch (error) {
    if (error instanceof ContaContextoMedicoErro) throw error;
    erroLeituraXml();
  } finally {
    clearTimeout(timeout);
  }
}

function criarTransacao(tx: TransacaoDrizzle): ContextoMedicoTransacao {
  return {
    async obterContextoParaAtualizacao(scope) {
      const [row] = await tx.select(camposContexto())
        .from(contaContextoMedicoContextos)
        .where(condicaoContexto(scope))
        .for("update")
        .limit(1);
      return row ? contextoDbParaDominio(row) : null;
    },

    async inserirContextoInicial(contexto) {
      try {
        await tx.insert(contaContextoMedicoContextos).values(valoresContexto(contexto));
      } catch (error) {
        if (eConflitoUnico(error)) return null;
        bancoIndisponivel();
      }
      const [row] = await tx.select(camposContexto())
        .from(contaContextoMedicoContextos)
        .where(condicaoContexto(contexto.scope))
        .limit(1);
      return row ? contextoDbParaDominio(row) : null;
    },

    async atualizarContextoComCas(contextoId, revisaoEsperada, proximo) {
      const resultado = await tx.update(contaContextoMedicoContextos)
        .set(valoresContexto(proximo))
        .where(and(
          eq(contaContextoMedicoContextos.id, contextoId),
          eq(contaContextoMedicoContextos.revisao, revisaoEsperada),
        ));
      if (Number(resultado[0]?.affectedRows ?? 0) !== 1) return null;
      const [row] = await tx.select(camposContexto())
        .from(contaContextoMedicoContextos)
        .where(and(
          eq(contaContextoMedicoContextos.id, contextoId),
          eq(contaContextoMedicoContextos.revisao, proximo.revisao),
        ))
        .limit(1);
      return row ? contextoDbParaDominio(row) : null;
    },

    async anexarEvento(evento: EventoContextoMedicoNovo) {
      await tx.insert(contaContextoMedicoEventos).values({
        contextoId: evento.contextoId,
        revisao: evento.revisao,
        tipo: evento.tipo,
        usuarioId: evento.usuarioId,
        justificativa: evento.justificativa,
        padraoId: evento.padraoId,
        versaoPadrao: evento.versaoPadrao,
        evidenciaJson: {
          fontesVersoes: [...evento.evidencia.fontesVersoes],
          versaoItensHospitalares: evento.evidencia.versaoItensHospitalares,
          principaisSnapshot: [...evento.evidencia.principaisSnapshot],
        },
      });
    },
  };
}

/**
 * Adaptador de persistência exclusivamente informativa. Não importa, insere ou
 * atualiza nenhuma tabela financeira: `faturamento_tiss` é somente origem de
 * leitura com projeção mínima para correlação e composição.
 */
export function criarContaContextoMedicoRepositorioDrizzle(
  deps: ContaContextoMedicoDrizzleDependencias = {},
): ContaContextoMedicoRepositorio {
  const obterDb = deps.getDb ?? getDb;

  async function dbOuErro(): Promise<BancoDrizzle> {
    const db = await obterDb();
    if (!db) erroConfiguracao();
    return db;
  }

  return {
    async configurado() {
      let db: BancoDrizzle | null;
      try {
        db = await obterDb();
        if (!db) return false;
        // As três tabelas fazem parte da mesma configuração atômica da feature.
        // Se uma delas ainda não foi aplicada, consultas ficam pendentes e
        // mutações não alcançam nenhuma escrita parcial.
        await Promise.all([
          db.select({ id: contaContextoMedicoContextos.id })
            .from(contaContextoMedicoContextos)
            .limit(1),
          db.select({ id: contaContextoMedicoFontes.id })
            .from(contaContextoMedicoFontes)
            .limit(1),
          db.select({ id: contaContextoMedicoEventos.id })
            .from(contaContextoMedicoEventos)
            .limit(1),
        ]);
        return true;
      } catch {
        // Enquanto as três tabelas da migração não existirem, a feature fica
        // explicitamente pendente e não tenta nenhuma mutação.
        return false;
      }
    },

    async resolverSnapshotHospitalar(scope) {
      const db = await dbOuErro();
      const linhas = await db.select({
        // Projeção deliberadamente sem valor_unitario, valor_faturado ou totais.
        numeroGuiaPrestador: faturamentoTiss.numeroGuiaPrestador,
        numeroGuiaOperadora: faturamentoTiss.numeroGuiaOperadora,
        carteiraBeneficiario: faturamentoTiss.carteiraBeneficiario,
        dataExecucao: faturamentoTiss.dataExecucao,
        codigoItem: faturamentoTiss.codigoItem,
        descricaoItem: faturamentoTiss.descricaoItem,
        quantidade: faturamentoTiss.quantidade,
        tipoItem: faturamentoTiss.tipoItem,
      })
        .from(faturamentoTiss)
        .leftJoin(arquivos, eq(arquivos.id, faturamentoTiss.arquivoId))
        .where(and(
          condicaoArquivoHospitalar(scope),
          // A conta XML materializa a guia prestador; só quando ela estiver
          // ausente, a guia da operadora representa a mesma conta.
          condicaoGuia(scope),
          eq(loteCanonico(), scope.numeroLote),
          eq(competenciaCanonica(), scope.competencia),
        ));
      if (!linhas.length) return null;

      const referencias = new Map<string, {
        numeroGuiaPrestador: string | null;
        numeroGuiaOperadora: string | null;
        beneficiario: string | null;
        datasExecucao: string[];
      }>();
      const itensHospitalares: Array<SnapshotHospitalarAutorizado["itensHospitalares"][number]> = [];
      for (const linha of linhas) {
        const guiaPrestador = texto(linha.numeroGuiaPrestador);
        const guiaOperadora = texto(linha.numeroGuiaOperadora);
        if (guiaPrestador || guiaOperadora) {
          const chave = `${guiaPrestador ?? ""}\u0000${guiaOperadora ?? ""}\u0000${texto(linha.carteiraBeneficiario) ?? ""}`;
          const existente = referencias.get(chave) ?? {
            numeroGuiaPrestador: guiaPrestador,
            numeroGuiaOperadora: guiaOperadora,
            beneficiario: texto(linha.carteiraBeneficiario),
            datasExecucao: [],
          };
          const data = dataCivil(linha.dataExecucao);
          if (data && !existente.datasExecucao.includes(data)) existente.datasExecucao.push(data);
          referencias.set(chave, existente);
        }
        const codigo = texto(linha.codigoItem);
        if (!codigo) continue;
        itensHospitalares.push({
          codigo,
          descricao: texto(linha.descricaoItem) ?? undefined,
          quantidade: texto(linha.quantidade) ?? undefined,
          tipo: tipoHospitalar(linha.tipoItem),
          numeroGuiaPrestador: guiaPrestador,
          numeroGuiaOperadora: guiaOperadora,
        });
      }
      if (!referencias.size) return null;
      return {
        scope,
        referenciasGuias: [...referencias.values()],
        itensHospitalares,
        // faturamento_tiss não possui setor; não inferir um setor inexistente.
        setorInformado: false,
      };
    },

    async diagnosticarSnapshotHospitalar(scope) {
      const db = await dbOuErro();
      // Cada contador adiciona uma única etapa canônica, sempre no mesmo
      // arquivo/unidade/convênio. A projeção não contém identificadores ou dados
      // clínicos/financeiros; é apropriada apenas para explicar a pré-condição.
      const [totais] = await db.select({
        arquivoHospitalar: sql<number>`COUNT(*)`,
        identificacaoConta: sql<number>`SUM(CASE WHEN ${condicaoGuia(scope)} THEN 1 ELSE 0 END)`,
        lote: sql<number>`SUM(CASE WHEN ${condicaoGuia(scope)} AND ${eq(loteCanonico(), scope.numeroLote)} THEN 1 ELSE 0 END)`,
        competencia: sql<number>`SUM(CASE WHEN ${condicaoGuia(scope)} AND ${eq(loteCanonico(), scope.numeroLote)} AND ${eq(competenciaCanonica(), scope.competencia)} THEN 1 ELSE 0 END)`,
      })
        .from(faturamentoTiss)
        .leftJoin(arquivos, eq(arquivos.id, faturamentoTiss.arquivoId))
        .where(condicaoArquivoHospitalar(scope));
      const totalSeguro = (value: unknown): number => {
        const total = Number(value);
        return Number.isSafeInteger(total) && total >= 0 ? total : 0;
      };
      return {
        etapas: [
          { etapa: "arquivo_hospitalar", totalLinhas: totalSeguro(totais?.arquivoHospitalar) },
          { etapa: "identificacao_conta", totalLinhas: totalSeguro(totais?.identificacaoConta) },
          { etapa: "lote", totalLinhas: totalSeguro(totais?.lote) },
          { etapa: "competencia", totalLinhas: totalSeguro(totais?.competencia) },
        ],
      } satisfies DiagnosticoSnapshotHospitalar;
    },

    async listarArquivosMedicos(scope, page, pageSize) {
      const db = await dbOuErro();
      const rows = await db.select({
        id: arquivos.id,
        nome: arquivos.nome,
        tamanho: arquivos.tamanho,
        dataReferencia: arquivos.dataReferencia,
      })
        .from(arquivos)
        .where(and(
          eq(arquivos.estabelecimentoId, scope.estabelecimentoId),
          eq(arquivos.convenioId, scope.convenioId),
          eq(arquivos.tipoArquivo, "xml"),
          eq(arquivos.direcao, "enviado"),
        ))
        .orderBy(desc(arquivos.createdAt), desc(arquivos.id))
        .limit(pageSize + 1)
        .offset((page - 1) * pageSize);
      const temProximaPagina = rows.length > pageSize;
      return {
        arquivos: rows.slice(0, pageSize).map((row): ArquivoMedicoInfoInterno => ({
          id: row.id,
          nome: row.nome,
          tamanho: row.tamanho,
          dataReferencia: row.dataReferencia,
        })),
        temProximaPagina,
      };
    },

    async obterArquivoMedicoAutorizado(scope, arquivoMedicoId) {
      const db = await dbOuErro();
      const [row] = await db.select({
        id: arquivos.id,
        nome: arquivos.nome,
        tamanho: arquivos.tamanho,
        dataReferencia: arquivos.dataReferencia,
        tipoArquivo: arquivos.tipoArquivo,
        direcao: arquivos.direcao,
        estabelecimentoId: arquivos.estabelecimentoId,
        convenioId: arquivos.convenioId,
        s3Key: arquivos.s3Key,
        s3Url: arquivos.s3Url,
      })
        .from(arquivos)
        .where(and(
          eq(arquivos.id, arquivoMedicoId),
          eq(arquivos.estabelecimentoId, scope.estabelecimentoId),
          eq(arquivos.convenioId, scope.convenioId),
          eq(arquivos.tipoArquivo, "xml"),
          eq(arquivos.direcao, "enviado"),
        ))
        .limit(1);
      if (!row || row.estabelecimentoId === null) return null;
      return {
        id: row.id,
        nome: row.nome,
        tamanho: row.tamanho,
        dataReferencia: row.dataReferencia,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: row.estabelecimentoId,
        convenioId: row.convenioId,
        s3Key: row.s3Key,
        s3Url: row.s3Url,
      } satisfies ArquivoMedicoInterno;
    },

    async lerXmlMedicoAutorizado(arquivo) {
      return lerXmlMedicoAutorizadoSeguro(arquivo as ArquivoMedicoInterno, deps);
    },

    async listarFontes(scope) {
      const db = await dbOuErro();
      const rows = await db.select(camposFonte())
        .from(contaContextoMedicoFontes)
        .where(condicaoFonte(scope))
        .orderBy(desc(contaContextoMedicoFontes.criadoEm), desc(contaContextoMedicoFontes.id));
      // Reimportações são append-only; somente a versão mais recente por arquivo
      // médico + guia participa da composição atual. As anteriores permanecem na
      // tabela e nas evidências dos eventos já gravados.
      const atuais = new Map<string, FonteMedicaPersistida>();
      for (const row of rows) {
        const fonte = fonteDbParaDominio(row);
        const chave = `${fonte.arquivoMedicoId}\u0000${fonte.guiaReferencia}`;
        if (!atuais.has(chave)) atuais.set(chave, fonte);
      }
      return [...atuais.values()];
    },

    async inserirFonteSeAusente(fonte) {
      const db = await dbOuErro();
      const valores = {
        estabelecimentoId: fonte.scope.estabelecimentoId,
        convenioId: fonte.scope.convenioId,
        arquivoHospitalId: fonte.scope.arquivoHospitalId,
        arquivoMedicoId: fonte.arquivoMedicoId,
        numeroConta: fonte.scope.numeroConta,
        numeroLote: fonte.scope.numeroLote,
        competencia: fonte.scope.competencia,
        guiaReferencia: fonte.guiaReferencia,
        versaoSemantica: fonte.versaoSemantica,
        registros: fonte.registros,
        codigosDistintos: fonte.codigosDistintos,
        procedimentosJson: [...fonte.procedimentos],
      };
      try {
        const result = await db.insert(contaContextoMedicoFontes).values(valores);
        const insertId = Number(result[0]?.insertId ?? 0);
        if (Number.isSafeInteger(insertId) && insertId > 0) {
          const [row] = await db.select(camposFonte())
            .from(contaContextoMedicoFontes)
            .where(eq(contaContextoMedicoFontes.id, insertId))
            .limit(1);
          if (row) return { fonte: fonteDbParaDominio(row), criada: true };
        }
      } catch (error) {
        if (!eConflitoUnico(error)) bancoIndisponivel();
      }
      const [existente] = await db.select(camposFonte())
        .from(contaContextoMedicoFontes)
        .where(and(
          condicaoFonte(fonte.scope),
          eq(contaContextoMedicoFontes.arquivoMedicoId, fonte.arquivoMedicoId),
          eq(contaContextoMedicoFontes.guiaReferencia, fonte.guiaReferencia),
          eq(contaContextoMedicoFontes.versaoSemantica, fonte.versaoSemantica),
        ))
        .limit(1);
      if (!existente) bancoIndisponivel();
      return { fonte: fonteDbParaDominio(existente), criada: false };
    },

    async listarGabaritosManuais(scope) {
      const db = await dbOuErro();
      const rows = await db.select({
        id: padroesCobranca.id,
        estabelecimentoId: padroesCobranca.estabelecimentoId,
        convenioId: padroesCobranca.convenioId,
        codigoProcedimentoPrincipal: padroesCobranca.codigoProcedimentoPrincipal,
        descricaoProcedimentoPrincipal: padroesCobranca.descricaoProcedimentoPrincipal,
        itensAssociados: padroesCobranca.itensAssociados,
        status: padroesCobranca.status,
        isGabarito: padroesCobranca.isGabarito,
      })
        .from(padroesCobranca)
        .where(and(
          eq(padroesCobranca.estabelecimentoId, scope.estabelecimentoId),
          eq(padroesCobranca.convenioId, scope.convenioId),
          eq(padroesCobranca.status, "ativo"),
          eq(padroesCobranca.isGabarito, 1),
        ));
      return rows.flatMap(row => {
        const gabarito = normalizarGabarito(row);
        return gabarito ? [gabarito] : [];
      });
    },

    async obterGabaritoManual(scope, padraoId) {
      const db = await dbOuErro();
      const [row] = await db.select({
        id: padroesCobranca.id,
        estabelecimentoId: padroesCobranca.estabelecimentoId,
        convenioId: padroesCobranca.convenioId,
        codigoProcedimentoPrincipal: padroesCobranca.codigoProcedimentoPrincipal,
        descricaoProcedimentoPrincipal: padroesCobranca.descricaoProcedimentoPrincipal,
        itensAssociados: padroesCobranca.itensAssociados,
        status: padroesCobranca.status,
        isGabarito: padroesCobranca.isGabarito,
      })
        .from(padroesCobranca)
        .where(and(
          eq(padroesCobranca.id, padraoId),
          eq(padroesCobranca.estabelecimentoId, scope.estabelecimentoId),
          eq(padroesCobranca.convenioId, scope.convenioId),
          eq(padroesCobranca.status, "ativo"),
          eq(padroesCobranca.isGabarito, 1),
        ))
        .limit(1);
      return row ? normalizarGabarito(row) : null;
    },

    async obterContexto(scope) {
      const db = await dbOuErro();
      const [row] = await db.select(camposContexto())
        .from(contaContextoMedicoContextos)
        .where(condicaoContexto(scope))
        .limit(1);
      return row ? contextoDbParaDominio(row) : null;
    },

    async transacionar(callback) {
      const db = await dbOuErro();
      try {
        return await db.transaction(async tx => callback(criarTransacao(tx)));
      } catch (error) {
        if (error instanceof ContaContextoMedicoErro) throw error;
        bancoIndisponivel();
      }
    },
  };
}

/** Cria a composição real sem tocar no banco até a primeira operação do serviço. */
export function criarServicoContaContextoMedicoParaUsuario(
  _usuarioId: number,
  deps: ContaContextoMedicoDrizzleDependencias = {},
) {
  return criarContaContextoMedicoService({
    repositorio: criarContaContextoMedicoRepositorioDrizzle(deps),
  });
}
