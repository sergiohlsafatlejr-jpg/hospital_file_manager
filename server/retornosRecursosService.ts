import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  RETORNO_PDF_MAX_BYTES,
  RETORNO_REVIEW_MAX_ITENS,
  RETORNO_XML_MAX_BYTES,
  retornoDataCivilValida,
  type RetornoCandidato,
  type RetornoEscopo,
  type RetornoPrevia,
  type RetornoXmlDocumento,
  type RetornoXmlLinha,
} from "../shared/retornosRecursos";
import {
  convenios,
  convenioEstabelecimentoPrestador,
  demonstrativo,
  lotesRecurso,
  recursosRetornosImportacoes,
  recursosRetornosLinhas,
  recursosRetornosPagamentos,
  recursosRetornosRevisoes,
} from "../drizzle/schema";
import { getDb, verificarAcessoModulo } from "./db";
import { exigirAcessoEstabelecimento } from "./recursoGlosaPermissions";
import {
  armazenamentoRetornosPronto,
  lerArquivoRetorno,
  salvarArquivoRetorno,
} from "./retornosRecursosStorage";
import { parseRetornoCassiXml } from "./retornosRecursosParser";
import {
  chaveEstavelDemonstrativo,
  sugerirVinculoRetorno,
  validarCandidatoRetorno,
} from "./retornosRecursosMatcher";

const CONFIGURACAO_PENDENTE =
  "O módulo de retornos está sendo configurado. Tente novamente em instantes.";
const ERRO_ARQUIVO = "Não foi possível processar o arquivo informado.";
const ERRO_CONFLITO =
  "Já existe uma resposta diferente para este documento. Revise o histórico antes de continuar.";
const TOKEN_TTL_SEGUNDOS = 15 * 60;
const LIMITE_CONSULTA_CANDIDATOS = 20_001;

type Db = any;
type Importacao = typeof recursosRetornosImportacoes.$inferSelect;
type Linha = typeof recursosRetornosLinhas.$inferSelect;
type Revisao = typeof recursosRetornosRevisoes.$inferSelect;
type Pagamento = typeof recursosRetornosPagamentos.$inferSelect;

type TokenPrevia = {
  aud: "retornos-recursos";
  exp: number;
  iat: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoHash: string;
  respostaHash: string;
};

type DetalheImportacao = {
  id: number;
  estabelecimentoId: number;
  convenioId: number;
  arquivoHash: string;
  respostaHash: string;
  conteudoSemanticoHash: string;
  arquivoStorageKey: string;
  protocoloPdfStorageKey: string | null;
  protocoloPdfHash: string | null;
  nomeArquivoXml: string;
  nomeArquivoPdf: string | null;
  origemRecurso: "externo" | "portal";
  lotePortalId: number | null;
  formato: string;
  versaoTiss: string;
  registroAns: string;
  codigoPrestador: string;
  numeroLote: string;
  protocoloRecurso: string;
  guiaRecursoPrestador: string;
  guiaRecursoOperadora: string;
  dataResposta: string;
  dataRecurso: string;
  totalRecursadoCabecalho: string | null;
  totalAcatadoCabecalho: string | null;
  totalRecursadoItens: string;
  totalAcatadoItens: string;
  cabecalhoDivergente: "sim" | "nao";
  alertas: unknown;
  criadoEm: Date;
};

function erro(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}

function erroConfiguracao(): never {
  return erro("PRECONDITION_FAILED", CONFIGURACAO_PENDENTE);
}

function isSchemaMissing(error: unknown): boolean {
  const pendentes: unknown[] = [error];
  const vistos = new Set<unknown>();
  while (pendentes.length) {
    const atual = pendentes.pop();
    if (!atual || typeof atual !== "object" || vistos.has(atual)) continue;
    vistos.add(atual);
    const code = String((atual as any).code ?? "");
    const message = String((atual as any).message ?? "");
    if (
      ["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR", "42P01"].includes(code) ||
      /doesn't exist|no such table|unknown table/i.test(message)
    )
      return true;
    pendentes.push(
      (atual as any).cause,
      (atual as any).driverError,
      (atual as any).originalError
    );
  }
  return false;
}

function tratarBanco(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (isSchemaMissing(error)) erroConfiguracao();
  erro(
    "INTERNAL_SERVER_ERROR",
    "Não foi possível concluir esta operação. Tente novamente."
  );
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    erro("PRECONDITION_FAILED", CONFIGURACAO_PENDENTE);
  return parsed;
}

function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function dataCivil(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  const text = texto(value);
  if (retornoDataCivilValida(text)) return text;
  return null;
}

function hojeCivil(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function decimalPositivo(value: string, campo: string): Decimal {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.lte(0) || parsed.decimalPlaces() > 2)
      throw new Error("invalid");
    return parsed;
  } catch {
    erro("BAD_REQUEST", `Informe ${campo} com duas casas decimais.`);
  }
}

function decimalDocumento(value: unknown): Decimal {
  try {
    const parsed = new Decimal(String(value ?? ""));
    if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 2)
      throw new Error("invalid");
    return parsed;
  } catch {
    erro("BAD_REQUEST", ERRO_ARQUIVO);
  }
}

function moeda(value: Decimal): string {
  return value.toFixed(2);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonEstavel(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonEstavel).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${jsonEstavel(object[key])}`)
    .join(",")}}`;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function segredoToken(): Buffer {
  const secret = process.env.RETORNOS_RECURSOS_CONFIRMATION_SECRET ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32)
    erro(
      "PRECONDITION_FAILED",
      "A confirmação segura de importação precisa ser configurada pelo administrador."
    );
  return Buffer.from(secret, "utf8");
}

/** JWT HMAC pequeno e de escopo único; o conteúdo nunca é usado como hash exibível. */
export function retornosAssinarTokenPrevia(
  payload: Omit<TokenPrevia, "aud" | "iat" | "exp">,
  now = Date.now()
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      ...payload,
      aud: "retornos-recursos",
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + TOKEN_TTL_SEGUNDOS,
    })
  );
  const signature = createHmac("sha256", segredoToken())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function retornosVerificarTokenPrevia(
  token: string,
  escopo: RetornoEscopo,
  arquivoHash: string,
  respostaHash: string,
  now = Date.now()
): void {
  const parts = token.split(".");
  if (parts.length !== 3)
    erro(
      "BAD_REQUEST",
      "A confirmação da prévia expirou. Gere uma nova prévia."
    );
  const [header, body, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", segredoToken())
    .update(`${header}.${body}`)
    .digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    erro(
      "BAD_REQUEST",
      "A confirmação da prévia expirou. Gere uma nova prévia."
    );
  }
  if (
    expected.length !== received!.length ||
    !timingSafeEqual(expected, received!)
  )
    erro(
      "BAD_REQUEST",
      "A confirmação da prévia expirou. Gere uma nova prévia."
    );
  let parsed: TokenPrevia;
  let parsedHeader: { alg?: unknown; typ?: unknown };
  try {
    parsedHeader = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8")
    );
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    erro(
      "BAD_REQUEST",
      "A confirmação da prévia expirou. Gere uma nova prévia."
    );
  }
  const current = Math.floor(now / 1000);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsedHeader ||
    typeof parsedHeader !== "object" ||
    parsedHeader.alg !== "HS256" ||
    parsedHeader.typ !== "JWT" ||
    parsed.aud !== "retornos-recursos" ||
    !Number.isInteger(parsed.iat) ||
    !Number.isInteger(parsed.exp) ||
    parsed.iat > current ||
    parsed.exp < current ||
    parsed.exp <= parsed.iat ||
    parsed.exp - parsed.iat > TOKEN_TTL_SEGUNDOS ||
    current - parsed.iat > TOKEN_TTL_SEGUNDOS ||
    parsed.estabelecimentoId !== escopo.estabelecimentoId ||
    parsed.convenioId !== escopo.convenioId ||
    parsed.arquivoHash !== arquivoHash ||
    parsed.respostaHash !== respostaHash
  )
    erro(
      "BAD_REQUEST",
      "A confirmação da prévia expirou. Gere uma nova prévia."
    );
}

function decodificarBase64(value: string, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0)
    erro("BAD_REQUEST", ERRO_ARQUIVO);
  const decoded = Buffer.from(value, "base64");
  if (
    !decoded.length ||
    decoded.length > maxBytes ||
    decoded.toString("base64") !== value
  )
    erro("BAD_REQUEST", ERRO_ARQUIVO);
  return decoded;
}

function referenciasNormalizadas(
  line: Pick<
    RetornoXmlLinha,
    | "guiaPrestador"
    | "guiaOperadora"
    | "sequencialItem"
    | "codigoItem"
    | "codigoGlosa"
    | "dataExecucao"
  >
): Record<string, unknown> {
  return {
    guia: normalizarTexto(line.guiaPrestador || line.guiaOperadora),
    sequencial: line.sequencialItem ? Number(line.sequencialItem) : null,
    item: normalizarTexto(line.codigoItem),
    glosa: normalizarTexto(line.codigoGlosa),
    data: dataCivil(line.dataExecucao),
  };
}

function identidadeDocumento(documento: RetornoXmlDocumento): string {
  return sha256(
    jsonEstavel({
      formato: documento.formato,
      registroAns: normalizarTexto(documento.registroAns),
      codigoPrestador: normalizarTexto(documento.codigoPrestador),
      numeroLote: normalizarTexto(documento.numeroLote),
      protocoloRecurso: normalizarTexto(documento.protocoloRecurso),
      guiaRecursoPrestador: normalizarTexto(documento.guiaRecursoPrestador),
      guiaRecursoOperadora: normalizarTexto(documento.guiaRecursoOperadora),
    })
  );
}

function conteudoSemantico(documento: RetornoXmlDocumento): string {
  return sha256(
    jsonEstavel({
      documento: {
        dataResposta: documento.dataResposta,
        dataRecurso: documento.dataRecurso,
        totalRecursadoCabecalho: documento.totalRecursadoCabecalho,
        totalAcatadoCabecalho: documento.totalAcatadoCabecalho,
        totalRecursadoItens: documento.totalRecursadoItens,
        totalAcatadoItens: documento.totalAcatadoItens,
      },
      linhas: documento.linhas.map(line => ({
        ...line,
        guiaPrestador: normalizarTexto(line.guiaPrestador),
        guiaOperadora: normalizarTexto(line.guiaOperadora),
        codigoItem: normalizarTexto(line.codigoItem),
        codigoGlosa: normalizarTexto(line.codigoGlosa),
      })),
    })
  );
}

function cabecalhoDivergente(documento: RetornoXmlDocumento): boolean {
  const recursado =
    documento.totalRecursadoCabecalho === null
      ? null
      : decimalDocumento(documento.totalRecursadoCabecalho);
  const acatado =
    documento.totalAcatadoCabecalho === null
      ? null
      : decimalDocumento(documento.totalAcatadoCabecalho);
  return (
    (recursado !== null &&
      !recursado.eq(decimalDocumento(documento.totalRecursadoItens))) ||
    (acatado !== null &&
      !acatado.eq(decimalDocumento(documento.totalAcatadoItens)))
  );
}

function validarDocumento(documento: RetornoXmlDocumento): void {
  if (
    documento.bloqueios.length ||
    !documento.linhas.length ||
    documento.linhas.length > 2000
  )
    erro("BAD_REQUEST", ERRO_ARQUIVO);
  if (
    !retornoDataCivilValida(documento.dataResposta) ||
    !retornoDataCivilValida(documento.dataRecurso) ||
    documento.dataResposta > hojeCivil()
  )
    erro("BAD_REQUEST", "A data da resposta não pode ser futura.");
  const uniquePositions = new Set<number>();
  for (const line of documento.linhas) {
    if (
      !Number.isSafeInteger(line.posicao) ||
      line.posicao < 1 ||
      uniquePositions.has(line.posicao)
    )
      erro("BAD_REQUEST", ERRO_ARQUIVO);
    uniquePositions.add(line.posicao);
    const recursado = decimalDocumento(line.valorRecursado);
    const acatado = decimalDocumento(line.valorAcatado);
    if (acatado.gt(recursado)) erro("BAD_REQUEST", ERRO_ARQUIVO);
  }
}

async function retornosDb(): Promise<Db> {
  const db = await getDb();
  if (!db) erroConfiguracao();
  return db;
}

async function retornosExigirEscopo(
  userId: number,
  escopo: RetornoEscopo,
  permissao: "visualizar" | "editar"
): Promise<void> {
  await exigirAcessoEstabelecimento(
    userId,
    escopo.estabelecimentoId,
    permissao
  );
  const modulo = await verificarAcessoModulo(
    userId,
    escopo.estabelecimentoId,
    "recursosGlosa"
  );
  if (!modulo)
    erro(
      "FORBIDDEN",
      "Sem permissão para acessar os retornos de recursos deste estabelecimento."
    );
  const db = await retornosDb();
  const [convenio] = await db
    .select({
      id: convenios.id,
      nome: convenios.nome,
      codigo: convenios.codigo,
      registroAns: convenios.registroAns,
      ativo: convenios.ativo,
      estabelecimentoId: convenios.estabelecimentoId,
    })
    .from(convenios)
    .where(eq(convenios.id, escopo.convenioId))
    .limit(1);
  if (
    !convenio ||
    (convenio.estabelecimentoId &&
      convenio.estabelecimentoId !== escopo.estabelecimentoId)
  )
    erro("FORBIDDEN", "O convênio não pertence ao estabelecimento informado.");
  if (convenio.ativo !== "sim")
    erro(
      "PRECONDITION_FAILED",
      "O convênio CASSI selecionado está inativo. Ative-o antes de importar retornos."
    );
  const identidade = `${convenio.nome ?? ""} ${convenio.codigo ?? ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (!identidade.includes("CASSI"))
    erro(
      "BAD_REQUEST",
      "Selecione o convênio CASSI cadastrado para este estabelecimento."
    );
}

/** Confirma a identidade declarada no XML contra o cadastro local, sem normalizar zeros à esquerda. */
async function retornosExigirDocumentoCassi(
  escopo: RetornoEscopo,
  documento: Pick<RetornoXmlDocumento, "registroAns" | "codigoPrestador">,
  database?: Db
): Promise<void> {
  const db = database ?? (await retornosDb());
  const [convenio] = await db
    .select({ registroAns: convenios.registroAns, ativo: convenios.ativo })
    .from(convenios)
    .where(eq(convenios.id, escopo.convenioId))
    .limit(1);
  if (!convenio || convenio.ativo !== "sim")
    erro(
      "PRECONDITION_FAILED",
      "O convênio CASSI selecionado precisa estar ativo antes de importar retornos."
    );
  const ansCadastrado = texto(convenio.registroAns);
  if (!ansCadastrado)
    erro(
      "PRECONDITION_FAILED",
      "Cadastre o registro ANS do convênio CASSI antes de importar retornos."
    );
  if (texto(documento.registroAns) !== ansCadastrado)
    erro(
      "FORBIDDEN",
      "O registro ANS declarado no XML não corresponde ao convênio CASSI selecionado."
    );

  const associacoes = await db
    .select({
      codigoPrestador: convenioEstabelecimentoPrestador.codigoPrestador,
      ativo: convenioEstabelecimentoPrestador.ativo,
    })
    .from(convenioEstabelecimentoPrestador)
    .where(
      and(
        eq(convenioEstabelecimentoPrestador.convenioId, escopo.convenioId),
        eq(
          convenioEstabelecimentoPrestador.estabelecimentoId,
          escopo.estabelecimentoId
        )
      )
    );
  if (!associacoes.length) {
    erro(
      "PRECONDITION_FAILED",
      "Cadastre e ative o código do prestador para este convênio e estabelecimento antes de importar retornos."
    );
  }
  const associacao = associacoes.find(
    (item: any) =>
      texto(item.codigoPrestador) === texto(documento.codigoPrestador)
  );
  if (!associacao)
    erro(
      "FORBIDDEN",
      "O código de prestador declarado no XML não pertence ao convênio e estabelecimento selecionados."
    );
  if (associacao.ativo !== "sim") {
    erro(
      "PRECONDITION_FAILED",
      "Ative o código do prestador cadastrado para este convênio e estabelecimento antes de importar retornos."
    );
  }
}

/** Fonte Portal legada é somente leitura; o ledger de retornos nunca a atualiza. */
async function validarLotePortal(
  tx: Db,
  escopo: RetornoEscopo,
  lotePortalId: number | undefined,
  documento: RetornoXmlDocumento
): Promise<void> {
  if (
    !Number.isSafeInteger(lotePortalId) ||
    !lotePortalId ||
    lotePortalId < 1
  ) {
    erro(
      "PRECONDITION_FAILED",
      "Selecione um lote preparado no Portal antes de importar esta resposta."
    );
  }
  const [lote] = await tx
    .select({
      id: lotesRecurso.id,
      estabelecimentoId: lotesRecurso.estabelecimentoId,
      convenioId: lotesRecurso.convenioId,
      status: lotesRecurso.status,
      protocoloEnvio: lotesRecurso.protocoloEnvio,
    })
    .from(lotesRecurso)
    .where(eq(lotesRecurso.id, lotePortalId))
    .limit(1)
    .for("update");
  if (!lote)
    erro("NOT_FOUND", "O lote selecionado não foi encontrado no Portal.");
  if (
    Number(lote.estabelecimentoId) !== escopo.estabelecimentoId ||
    Number(lote.convenioId) !== escopo.convenioId
  ) {
    erro(
      "FORBIDDEN",
      "O lote selecionado não pertence ao estabelecimento e convênio informados."
    );
  }
  if (
    !["enviado", "em_analise", "respondido", "finalizado"].includes(
      String(lote.status)
    )
  ) {
    erro(
      "PRECONDITION_FAILED",
      "O lote Portal precisa estar enviado antes de receber uma resposta."
    );
  }
  const protocolo = texto(lote.protocoloEnvio);
  if (!protocolo)
    erro(
      "PRECONDITION_FAILED",
      "Registre o protocolo do lote Portal antes de importar a resposta."
    );
  if (protocolo !== texto(documento.protocoloRecurso)) {
    erro(
      "FORBIDDEN",
      "O protocolo declarado no XML não corresponde ao lote Portal selecionado."
    );
  }
}

function candidatoDaLinha(row: any): RetornoCandidato {
  return {
    id: asNumber(row.id),
    arquivoId: asNumber(row.arquivoId),
    estabelecimentoId: Number(row.estabelecimentoId),
    convenioId: Number(row.convenioId),
    numeroGuia: row.numeroGuia ?? null,
    sequencialItem:
      row.sequencialItem === null || row.sequencialItem === undefined
        ? null
        : Number(row.sequencialItem),
    dataExecucao: row.dataExecucao ?? null,
    codigoItem: row.codigoItem ?? null,
    codigoGlosa: row.codigoGlosa ?? null,
    valorGlosa:
      row.valorGlosa === null || row.valorGlosa === undefined
        ? null
        : String(row.valorGlosa),
    protocolo: row.protocolo ?? null,
    lotePrestador: row.lotePrestador ?? null,
    codigoPrestador: row.codigoPrestador ?? null,
    descricaoItem: row.descricaoItem ?? null,
  };
}

async function buscarCandidatos(
  tx: Db,
  escopo: RetornoEscopo,
  linhas: Array<Pick<RetornoXmlLinha, "guiaPrestador" | "guiaOperadora">>,
  lock = false
): Promise<RetornoCandidato[]> {
  const guias = [
    ...new Set(
      linhas
        .flatMap(line => [texto(line.guiaPrestador), texto(line.guiaOperadora)])
        .filter(Boolean)
    ),
  ];
  if (!guias.length) return [];
  let query = tx
    .select({
      id: demonstrativo.id,
      arquivoId: demonstrativo.arquivoId,
      estabelecimentoId: demonstrativo.estabelecimentoId,
      convenioId: demonstrativo.convenioId,
      numeroGuia: demonstrativo.numeroGuia,
      sequencialItem: demonstrativo.sequencialItem,
      dataExecucao: demonstrativo.dataExecucao,
      codigoItem: demonstrativo.codigoItem,
      codigoGlosa: demonstrativo.codigoGlosa,
      valorGlosa: demonstrativo.valorGlosa,
      protocolo: demonstrativo.protocolo,
      lotePrestador: demonstrativo.lotePrestador,
      codigoPrestador: demonstrativo.codigoPrestador,
      descricaoItem: demonstrativo.descricaoItem,
    })
    .from(demonstrativo)
    .where(
      and(
        eq(demonstrativo.estabelecimentoId, escopo.estabelecimentoId),
        eq(demonstrativo.convenioId, escopo.convenioId),
        inArray(demonstrativo.numeroGuia, guias)
      )
    )
    .limit(LIMITE_CONSULTA_CANDIDATOS);
  if (lock) query = query.for("update");
  const rows = await query;
  if (rows.length >= LIMITE_CONSULTA_CANDIDATOS)
    erro(
      "PRECONDITION_FAILED",
      "Foram encontrados candidatos demais para uma revisão segura. Refine o documento de origem."
    );
  return rows.map(candidatoDaLinha);
}

function snapshotMatch(
  line: RetornoXmlLinha,
  candidatos: RetornoCandidato[],
  escopo: RetornoEscopo
) {
  const match = sugerirVinculoRetorno(line, candidatos, escopo);
  return {
    ...match,
    candidatos: match.candidatos.map(candidate => ({
      ...candidate,
      chave: chaveEstavelDemonstrativo(candidate),
    })),
  };
}

/** Reserva do item entre documentos, independente do valor e da reimportação. */
function chaveReservaAprovacao(candidate: RetornoCandidato): string {
  const identidade = (valor: unknown) =>
    texto(valor).normalize("NFKC").toUpperCase();
  return sha256(
    jsonEstavel({
      estabelecimentoId: candidate.estabelecimentoId,
      convenioId: candidate.convenioId,
      guia: identidade(candidate.numeroGuia),
      sequencial: candidate.sequencialItem,
      data: dataCivil(candidate.dataExecucao),
      item: identidade(candidate.codigoItem),
      glosa: identidade(candidate.codigoGlosa),
      protocolo: identidade(candidate.protocolo),
      lote: identidade(candidate.lotePrestador),
      prestador: identidade(candidate.codigoPrestador),
    })
  );
}

/** Metadados mínimos para revisão; snapshots internos nunca são devolvidos diretamente. */
function candidatoPublico(candidate: unknown) {
  const row = candidate as Partial<RetornoCandidato>;
  return {
    id: Number(row.id),
    numeroGuia: row.numeroGuia ?? null,
    sequencialItem: row.sequencialItem ?? null,
    dataExecucao: row.dataExecucao ?? null,
    codigoItem: row.codigoItem ?? null,
    codigoGlosa: row.codigoGlosa ?? null,
    valorGlosa: row.valorGlosa ?? null,
    protocolo: row.protocolo ?? null,
    lotePrestador: row.lotePrestador ?? null,
    codigoPrestador: row.codigoPrestador ?? null,
    descricaoItem: row.descricaoItem ?? null,
  };
}

async function buscarImportacao(
  tx: Db,
  escopo: RetornoEscopo,
  importacaoId: number,
  lock = false
): Promise<DetalheImportacao | null> {
  let query = tx
    .select()
    .from(recursosRetornosImportacoes)
    .where(
      and(
        eq(recursosRetornosImportacoes.id, importacaoId),
        eq(
          recursosRetornosImportacoes.estabelecimentoId,
          escopo.estabelecimentoId
        ),
        eq(recursosRetornosImportacoes.convenioId, escopo.convenioId)
      )
    )
    .limit(1);
  if (lock) query = query.for("update");
  const [row] = await query;
  return row ? (row as DetalheImportacao) : null;
}

function importacaoPublica(row: DetalheImportacao) {
  return {
    id: row.id,
    origemRecurso: row.origemRecurso,
    lotePortalId: row.lotePortalId,
    nomeArquivoXml: row.nomeArquivoXml,
    nomeArquivoPdf: row.nomeArquivoPdf,
    formato: row.formato,
    versaoTiss: row.versaoTiss,
    registroAns: row.registroAns,
    codigoPrestador: row.codigoPrestador,
    numeroLote: row.numeroLote,
    protocoloRecurso: row.protocoloRecurso,
    guiaRecursoPrestador: row.guiaRecursoPrestador,
    guiaRecursoOperadora: row.guiaRecursoOperadora,
    dataResposta: dataCivil(row.dataResposta),
    dataRecurso: dataCivil(row.dataRecurso),
    totalRecursadoCabecalho: row.totalRecursadoCabecalho,
    totalAcatadoCabecalho: row.totalAcatadoCabecalho,
    totalRecursadoItens: row.totalRecursadoItens,
    totalAcatadoItens: row.totalAcatadoItens,
    cabecalhoDivergente: row.cabecalhoDivergente,
    alertas: Array.isArray(row.alertas) ? row.alertas : [],
    criadoEm: row.criadoEm,
  };
}

function resumoPagamentos(pagamentos: Pagamento[]) {
  return pagamentos.reduce(
    (sum, payment) =>
      sum.plus(
        payment.tipo === "recebimento"
          ? String(payment.valor)
          : new Decimal(String(payment.valor)).negated()
      ),
    new Decimal(0)
  );
}

function hashPagamento(value: Record<string, unknown>): string {
  return sha256(jsonEstavel(value));
}

function revisaoAtual(revisoes: Revisao[]): Map<number, Revisao> {
  const result = new Map<number, Revisao>();
  for (const review of [...revisoes].sort(
    (a, b) => Number(a.id) - Number(b.id)
  )) {
    if (review.tipo === "aprovacao" && review.linhaId)
      result.set(Number(review.linhaId), review);
  }
  return result;
}

function colisaoConcorrenteConhecida(error: unknown): boolean {
  const visitados = new Set<unknown>();
  let atual: unknown = error;
  while (atual && typeof atual === "object" && !visitados.has(atual)) {
    visitados.add(atual);
    const value = atual as { code?: string; cause?: unknown };
    if (
      ["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(
        value.code ?? ""
      )
    )
      return true;
    atual = value.cause;
  }
  return false;
}

async function recuperarImportacaoConcorrente(
  db: Db,
  escopo: RetornoEscopo,
  arquivoHash: string,
  respostaHash: string,
  semanticoHash: string,
  error: unknown
) {
  if (!colisaoConcorrenteConhecida(error)) throw error;
  // Somente leituras após rollback da transação perdedora; nunca reenvia o anexo.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    if (tentativa)
      await new Promise(resolve => setTimeout(resolve, tentativa * 75));
    const [file] = await db
      .select()
      .from(recursosRetornosImportacoes)
      .where(
        and(
          eq(
            recursosRetornosImportacoes.estabelecimentoId,
            escopo.estabelecimentoId
          ),
          eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
          eq(recursosRetornosImportacoes.arquivoHash, arquivoHash)
        )
      )
      .limit(1);
    if (file) return { kind: "idempotente" as const, id: Number(file.id) };
    const [logical] = await db
      .select()
      .from(recursosRetornosImportacoes)
      .where(
        and(
          eq(
            recursosRetornosImportacoes.estabelecimentoId,
            escopo.estabelecimentoId
          ),
          eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
          eq(recursosRetornosImportacoes.respostaHash, respostaHash)
        )
      )
      .limit(1);
    if (logical) {
      if (logical.conteudoSemanticoHash === semanticoHash)
        return { kind: "idempotente" as const, id: Number(logical.id) };
      erro("CONFLICT", ERRO_CONFLITO);
    }
  }
  throw error;
}

export async function retornosPrever(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    conteudoBase64: string;
  },
  userId: number
): Promise<RetornoPrevia> {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "visualizar");
    const buffer = decodificarBase64(
      input.conteudoBase64,
      RETORNO_XML_MAX_BYTES
    );
    const documento = parseRetornoCassiXml(buffer);
    validarDocumento(documento);
    await retornosExigirDocumentoCassi(escopo, documento);
    const arquivoHash = sha256(buffer);
    const respostaHash = identidadeDocumento(documento);
    const db = await retornosDb();
    const [sameFile] = await db
      .select({ id: recursosRetornosImportacoes.id })
      .from(recursosRetornosImportacoes)
      .where(
        and(
          eq(
            recursosRetornosImportacoes.estabelecimentoId,
            escopo.estabelecimentoId
          ),
          eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
          eq(recursosRetornosImportacoes.arquivoHash, arquivoHash)
        )
      )
      .limit(1);
    const [sameDocument] = sameFile
      ? [sameFile]
      : await db
          .select({ id: recursosRetornosImportacoes.id })
          .from(recursosRetornosImportacoes)
          .where(
            and(
              eq(
                recursosRetornosImportacoes.estabelecimentoId,
                escopo.estabelecimentoId
              ),
              eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
              eq(recursosRetornosImportacoes.respostaHash, respostaHash)
            )
          )
          .limit(1);
    const candidates = await buscarCandidatos(db, escopo, documento.linhas);
    const contagens: RetornoPrevia["contagens"] = {
      sugerido: 0,
      ambiguo: 0,
      sem_vinculo: 0,
      divergente: 0,
    };
    for (const line of documento.linhas)
      contagens[snapshotMatch(line, candidates, escopo).estado] += 1;
    const { linhas: _linhas, ...cabecalho } = documento;
    return {
      documento: cabecalho,
      totalItens: documento.linhas.length,
      contagens,
      tokenPrevia: retornosAssinarTokenPrevia({
        ...escopo,
        arquivoHash,
        respostaHash,
      }),
      jaImportado: Boolean(sameDocument),
      ...(sameDocument ? { importacaoId: Number(sameDocument.id) } : {}),
      armazenamentoPronto: armazenamentoRetornosPronto(),
    };
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosImportar(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    conteudoBase64: string;
    nomeArquivo: string;
    origemRecurso: "externo" | "portal";
    lotePortalId?: number;
    tokenPrevia: string;
    confirmar: true;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "editar");
    if (!armazenamentoRetornosPronto())
      erro(
        "PRECONDITION_FAILED",
        "O armazenamento protegido dos retornos precisa ser configurado pelo administrador."
      );
    const buffer = decodificarBase64(
      input.conteudoBase64,
      RETORNO_XML_MAX_BYTES
    );
    const documento = parseRetornoCassiXml(buffer);
    validarDocumento(documento);
    await retornosExigirDocumentoCassi(escopo, documento);
    const arquivoHash = sha256(buffer);
    const respostaHash = identidadeDocumento(documento);
    const semanticoHash = conteudoSemantico(documento);
    retornosVerificarTokenPrevia(
      input.tokenPrevia,
      escopo,
      arquivoHash,
      respostaHash
    );
    const db = await retornosDb();
    const candidates = await buscarCandidatos(db, escopo, documento.linhas);
    const existingByFile = await db
      .select({ id: recursosRetornosImportacoes.id })
      .from(recursosRetornosImportacoes)
      .where(
        and(
          eq(
            recursosRetornosImportacoes.estabelecimentoId,
            escopo.estabelecimentoId
          ),
          eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
          eq(recursosRetornosImportacoes.arquivoHash, arquivoHash)
        )
      )
      .limit(1);
    if (existingByFile[0])
      return {
        importacaoId: Number(existingByFile[0].id),
        jaImportado: true,
        mensagem: "Esta resposta já foi importada.",
      };

    // A gravação de arquivo ocorre antes da transação. O registro só é confirmado se a transação completar.
    const arquivo = await salvarArquivoRetorno(buffer, escopo, "xml");
    const outcome = await db
      .transaction(async (tx: Db) => {
        await retornosExigirDocumentoCassi(escopo, documento, tx);
        if (input.origemRecurso === "portal")
          await validarLotePortal(tx, escopo, input.lotePortalId, documento);
        const [fileLocked] = await tx
          .select()
          .from(recursosRetornosImportacoes)
          .where(
            and(
              eq(
                recursosRetornosImportacoes.estabelecimentoId,
                escopo.estabelecimentoId
              ),
              eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
              eq(recursosRetornosImportacoes.arquivoHash, arquivoHash)
            )
          )
          .limit(1)
          .for("update");
        if (fileLocked)
          return { kind: "idempotente" as const, id: Number(fileLocked.id) };
        const [logical] = await tx
          .select()
          .from(recursosRetornosImportacoes)
          .where(
            and(
              eq(
                recursosRetornosImportacoes.estabelecimentoId,
                escopo.estabelecimentoId
              ),
              eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
              eq(recursosRetornosImportacoes.respostaHash, respostaHash)
            )
          )
          .limit(1)
          .for("update");
        if (logical) {
          if (logical.conteudoSemanticoHash === semanticoHash)
            return { kind: "idempotente" as const, id: Number(logical.id) };
          const conflictHash = sha256(
            `${String(logical.conteudoSemanticoHash)}:${semanticoHash}`
          );
          const [prior] = await tx
            .select({ id: recursosRetornosRevisoes.id })
            .from(recursosRetornosRevisoes)
            .where(
              and(
                eq(recursosRetornosRevisoes.importacaoId, logical.id),
                eq(recursosRetornosRevisoes.tipo, "conflito"),
                eq(recursosRetornosRevisoes.conflitoHash, conflictHash)
              )
            )
            .limit(1);
          if (!prior)
            await tx.insert(recursosRetornosRevisoes).values({
              importacaoId: logical.id,
              tipo: "conflito",
              aprovado: null,
              demonstrativoId: null,
              demonstrativoChave: null,
              arquivoFonteId: null,
              arquivoFonteHash: null,
              candidatosSnapshot: null,
              justificativa:
                "Foi recebida uma resposta divergente para a mesma identidade documental.",
              conflitoHash: conflictHash,
              revisadoPor: userId,
            });
          return { kind: "conflito" as const };
        }
        const headerDivergente = cabecalhoDivergente(documento);
        const [inserted] = await tx.insert(recursosRetornosImportacoes).values({
          estabelecimentoId: escopo.estabelecimentoId,
          convenioId: escopo.convenioId,
          criadoPor: userId,
          origemRecurso: input.origemRecurso,
          lotePortalId:
            input.origemRecurso === "portal"
              ? (input.lotePortalId ?? null)
              : null,
          nomeArquivoXml: input.nomeArquivo,
          arquivoHash,
          arquivoStorageKey: arquivo.key,
          respostaHash,
          conteudoSemanticoHash: semanticoHash,
          formato: documento.formato,
          versaoTiss: documento.versaoTiss,
          registroAns: documento.registroAns,
          codigoPrestador: documento.codigoPrestador,
          numeroLote: documento.numeroLote,
          protocoloRecurso: documento.protocoloRecurso,
          guiaRecursoPrestador: documento.guiaRecursoPrestador,
          guiaRecursoOperadora: documento.guiaRecursoOperadora,
          dataResposta: documento.dataResposta,
          dataRecurso: documento.dataRecurso,
          totalRecursadoCabecalho: documento.totalRecursadoCabecalho
            ? moeda(decimalDocumento(documento.totalRecursadoCabecalho))
            : null,
          totalAcatadoCabecalho: documento.totalAcatadoCabecalho
            ? moeda(decimalDocumento(documento.totalAcatadoCabecalho))
            : null,
          totalRecursadoItens: moeda(
            decimalDocumento(documento.totalRecursadoItens)
          ),
          totalAcatadoItens: moeda(
            decimalDocumento(documento.totalAcatadoItens)
          ),
          cabecalhoDivergente: headerDivergente ? "sim" : "nao",
          alertas: documento.alertas,
        });
        const importacaoId = Number(inserted.insertId);
        const linhas = documento.linhas.map(line => {
          const match = snapshotMatch(line, candidates, escopo);
          return {
            importacaoId,
            posicao: line.posicao,
            guiaPrestador: line.guiaPrestador,
            guiaOperadora: line.guiaOperadora,
            sequencialItem: line.sequencialItem,
            dataExecucao: line.dataExecucao,
            codigoTabela: line.codigoTabela,
            codigoItem: line.codigoItem,
            codigoGlosa: line.codigoGlosa,
            valorRecursado: moeda(decimalDocumento(line.valorRecursado)),
            valorAcatado: moeda(decimalDocumento(line.valorAcatado)),
            justificativaPrestador: line.justificativaPrestador,
            justificativaOperadora: line.justificativaOperadora,
            referenciasNormalizadas: referenciasNormalizadas(line),
            estadoSugestao: match.estado,
            motivoSugestao: match.motivo,
            candidatosSnapshot: match.candidatos,
            demonstrativoAtualId: null,
          };
        });
        await tx.insert(recursosRetornosLinhas).values(linhas);
        return { kind: "novo" as const, id: importacaoId };
      })
      .catch((error: unknown) =>
        recuperarImportacaoConcorrente(
          db,
          escopo,
          arquivoHash,
          respostaHash,
          semanticoHash,
          error
        )
      );
    if (outcome.kind === "conflito") erro("CONFLICT", ERRO_CONFLITO);
    return {
      importacaoId: outcome.id,
      jaImportado: outcome.kind === "idempotente",
      mensagem:
        outcome.kind === "novo"
          ? "Resposta importada para revisão."
          : "Esta resposta já foi importada.",
    };
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosListar(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    inicio?: string;
    fim?: string;
    pagina: number;
    limite: number;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "visualizar");
    const db = await retornosDb();
    const filters = [
      eq(
        recursosRetornosImportacoes.estabelecimentoId,
        escopo.estabelecimentoId
      ),
      eq(recursosRetornosImportacoes.convenioId, escopo.convenioId),
    ];
    if (input.inicio)
      filters.push(gte(recursosRetornosImportacoes.dataResposta, input.inicio));
    if (input.fim)
      filters.push(lte(recursosRetornosImportacoes.dataResposta, input.fim));
    const [totalRow] = await db
      .select({ total: sql<number>`count(*)` })
      .from(recursosRetornosImportacoes)
      .where(and(...filters));
    const rows = await db
      .select()
      .from(recursosRetornosImportacoes)
      .where(and(...filters))
      .orderBy(
        desc(recursosRetornosImportacoes.dataResposta),
        desc(recursosRetornosImportacoes.id)
      )
      .limit(input.limite)
      .offset((input.pagina - 1) * input.limite);
    const ids = rows.map((row: Importacao) => Number(row.id));
    const lineCounts = ids.length
      ? await db
          .select({
            importacaoId: recursosRetornosLinhas.importacaoId,
            totalItens: sql<number>`count(*)`,
          })
          .from(recursosRetornosLinhas)
          .where(inArray(recursosRetornosLinhas.importacaoId, ids))
          .groupBy(recursosRetornosLinhas.importacaoId)
      : [];
    const approvalCounts = ids.length
      ? await db
          .select({
            importacaoId: recursosRetornosRevisoes.importacaoId,
            aprovadas: sql<number>`count(*)`,
          })
          .from(recursosRetornosRevisoes)
          .where(
            and(
              inArray(recursosRetornosRevisoes.importacaoId, ids),
              eq(recursosRetornosRevisoes.tipo, "aprovacao"),
              eq(recursosRetornosRevisoes.aprovado, "sim")
            )
          )
          .groupBy(recursosRetornosRevisoes.importacaoId)
      : [];
    const lineMap = new Map<number, number>(
      lineCounts.map((row: any): [number, number] => [
        Number(row.importacaoId),
        Number(row.totalItens),
      ])
    );
    const approvalMap = new Map<number, number>(
      approvalCounts.map((row: any): [number, number] => [
        Number(row.importacaoId),
        Number(row.aprovadas),
      ])
    );
    return {
      registros: (rows as Importacao[]).map(row => ({
        ...importacaoPublica(row as DetalheImportacao),
        totalItens: lineMap.get(Number(row.id)) ?? 0,
        aprovacoes: approvalMap.get(Number(row.id)) ?? 0,
      })),
      total: Number(totalRow?.total ?? 0),
      pagina: input.pagina,
      limite: input.limite,
    };
  } catch (error) {
    if (isSchemaMissing(error))
      return {
        registros: [],
        total: 0,
        pagina: input.pagina,
        limite: input.limite,
        configuracaoPendente: true,
        mensagem: CONFIGURACAO_PENDENTE,
      };
    return tratarBanco(error);
  }
}

async function dadosDetalhe(
  tx: Db,
  escopo: RetornoEscopo,
  importacaoId: number,
  lock = false
) {
  const imported = await buscarImportacao(tx, escopo, importacaoId, lock);
  if (!imported) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
  const linhas = lock
    ? await tx
        .select()
        .from(recursosRetornosLinhas)
        .where(eq(recursosRetornosLinhas.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosLinhas.posicao))
        .for("update")
    : await tx
        .select()
        .from(recursosRetornosLinhas)
        .where(eq(recursosRetornosLinhas.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosLinhas.posicao));
  const revisoes = lock
    ? await tx
        .select()
        .from(recursosRetornosRevisoes)
        .where(eq(recursosRetornosRevisoes.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosRevisoes.id))
        .for("update")
    : await tx
        .select()
        .from(recursosRetornosRevisoes)
        .where(eq(recursosRetornosRevisoes.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosRevisoes.id));
  const pagamentos = lock
    ? await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(eq(recursosRetornosPagamentos.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosPagamentos.id))
        .for("update")
    : await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(eq(recursosRetornosPagamentos.importacaoId, importacaoId))
        .orderBy(asc(recursosRetornosPagamentos.id));
  return {
    imported,
    linhas: linhas as Linha[],
    revisoes: revisoes as Revisao[],
    pagamentos: pagamentos as Pagamento[],
  };
}

export async function retornosDetalhe(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "visualizar");
    const db = await retornosDb();
    const { imported, linhas, revisoes, pagamentos } = await dadosDetalhe(
      db,
      escopo,
      input.importacaoId
    );
    const atuais = revisaoAtual(revisoes);
    const approvedIds = [
      ...new Set(
        [...atuais.values()]
          .map(review => review.demonstrativoId)
          .filter(
            (id): id is number =>
              id !== null && Number.isSafeInteger(id) && id > 0
          )
      ),
    ];
    const demos = approvedIds.length
      ? await db
          .select({
            id: demonstrativo.id,
            arquivoId: demonstrativo.arquivoId,
            estabelecimentoId: demonstrativo.estabelecimentoId,
            convenioId: demonstrativo.convenioId,
            numeroGuia: demonstrativo.numeroGuia,
            sequencialItem: demonstrativo.sequencialItem,
            dataExecucao: demonstrativo.dataExecucao,
            codigoItem: demonstrativo.codigoItem,
            codigoGlosa: demonstrativo.codigoGlosa,
            valorGlosa: demonstrativo.valorGlosa,
            protocolo: demonstrativo.protocolo,
            lotePrestador: demonstrativo.lotePrestador,
            codigoPrestador: demonstrativo.codigoPrestador,
            descricaoItem: demonstrativo.descricaoItem,
          })
          .from(demonstrativo)
          .where(
            and(
              eq(demonstrativo.estabelecimentoId, escopo.estabelecimentoId),
              eq(demonstrativo.convenioId, escopo.convenioId),
              inArray(demonstrativo.id, approvedIds)
            )
          )
      : [];
    const demoMap = new Map<number, RetornoCandidato>(
      demos.map((row: any): [number, RetornoCandidato] => [
        Number(row.id),
        candidatoDaLinha(row),
      ])
    );
    const linhasPublicas = linhas.map(line => {
      const review = atuais.get(Number(line.id));
      const approved =
        review?.aprovado === "sim" && review.demonstrativoId ? review : null;
      const current = approved
        ? demoMap.get(Number(approved.demonstrativoId))
        : undefined;
      const rawCandidates = Array.isArray(line.candidatosSnapshot)
        ? line.candidatosSnapshot.map(candidatoPublico)
        : [];
      const vinculoAtual = !approved
        ? { status: "ausente" as const }
        : !current
          ? { status: "ausente" as const }
          : validarCandidatoRetorno(
                {
                  posicao: Number(line.posicao),
                  guiaPrestador: line.guiaPrestador,
                  guiaOperadora: line.guiaOperadora,
                  sequencialItem: line.sequencialItem,
                  dataExecucao: line.dataExecucao,
                  codigoTabela: line.codigoTabela,
                  codigoItem: line.codigoItem,
                  codigoGlosa: line.codigoGlosa,
                  valorRecursado: String(line.valorRecursado),
                  valorAcatado: String(line.valorAcatado),
                  justificativaPrestador: line.justificativaPrestador,
                  justificativaOperadora: line.justificativaOperadora,
                },
                current,
                escopo
              ) &&
              approved.arquivoFonteHash === chaveEstavelDemonstrativo(current)
            ? { status: "valido" as const, demonstrativoId: current.id }
            : { status: "alterado" as const };
      return {
        id: Number(line.id),
        posicao: Number(line.posicao),
        guiaPrestador: line.guiaPrestador,
        guiaOperadora: line.guiaOperadora,
        sequencialItem: line.sequencialItem,
        dataExecucao: line.dataExecucao,
        codigoTabela: line.codigoTabela,
        codigoItem: line.codigoItem,
        codigoGlosa: line.codigoGlosa,
        valorRecursado: String(line.valorRecursado),
        valorAcatado: String(line.valorAcatado),
        justificativaPrestador: line.justificativaPrestador,
        justificativaOperadora: line.justificativaOperadora,
        estado: approved ? ("aprovado" as const) : line.estadoSugestao,
        motivo: approved
          ? "Vínculo revisado manualmente."
          : line.motivoSugestao,
        candidatos: rawCandidates,
        aprovacao: approved
          ? {
              id: Number(approved.id),
              demonstrativoId: approved.demonstrativoId,
              justificativa: approved.justificativa,
              revisadoEm: approved.revisadoEm,
            }
          : null,
        vinculoAtual,
      };
    });
    const approvedLines = linhas.filter(
      line => atuais.get(Number(line.id))?.aprovado === "sim"
    );
    const recursadoAprovado = approvedLines.reduce(
      (sum, line) => sum.plus(String(line.valorRecursado)),
      new Decimal(0)
    );
    const acatadoAprovado = approvedLines.reduce(
      (sum, line) => sum.plus(String(line.valorAcatado)),
      new Decimal(0)
    );
    const liquido = resumoPagamentos(pagamentos);
    return {
      importacao: importacaoPublica(imported),
      linhas: linhasPublicas,
      pagamentos: pagamentos.map(payment => ({
        id: Number(payment.id),
        tipo: payment.tipo,
        pagamentoOrigemId: payment.pagamentoOrigemId
          ? Number(payment.pagamentoOrigemId)
          : null,
        valor: String(payment.valor),
        dataEvento: payment.dataEvento,
        referencia: payment.referencia,
        observacao: payment.observacao,
        registradoEm: payment.registradoEm,
      })),
      historico: revisoes.map(review => ({
        id: Number(review.id),
        linhaId: review.linhaId ? Number(review.linhaId) : null,
        tipo: review.tipo,
        demonstrativoId: review.demonstrativoId,
        justificativa: review.justificativa,
        revisadoEm: review.revisadoEm,
      })),
      resumo: {
        recursado: String(imported.totalRecursadoItens),
        acatado: String(imported.totalAcatadoItens),
        aprovacoes: approvedLines.length,
        recursadoAprovado: moeda(recursadoAprovado),
        acatadoAprovado: moeda(acatadoAprovado),
        recebidoInformado: moeda(liquido),
        liquido: moeda(liquido),
        saldoAcatado: moeda(Decimal.max(acatadoAprovado.minus(liquido), 0)),
        diferencaRecursadoVsAprovado: moeda(
          recursadoAprovado.minus(acatadoAprovado)
        ),
      },
    };
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosRebuscar(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "editar");
    const db = await retornosDb();
    return await db.transaction(async (tx: Db) => {
      const { imported, linhas, revisoes } = await dadosDetalhe(
        tx,
        escopo,
        input.importacaoId,
        true
      );
      void imported;
      const atuais = revisaoAtual(revisoes);
      const candidates = await buscarCandidatos(
        tx,
        escopo,
        linhas.map(line => ({
          guiaPrestador: line.guiaPrestador,
          guiaOperadora: line.guiaOperadora,
        }))
      );
      let atualizadas = 0;
      for (const line of linhas) {
        if (atuais.get(Number(line.id))?.aprovado === "sim") continue;
        const source: RetornoXmlLinha = {
          posicao: Number(line.posicao),
          guiaPrestador: line.guiaPrestador,
          guiaOperadora: line.guiaOperadora,
          sequencialItem: line.sequencialItem,
          dataExecucao: line.dataExecucao,
          codigoTabela: line.codigoTabela,
          codigoItem: line.codigoItem,
          codigoGlosa: line.codigoGlosa,
          valorRecursado: String(line.valorRecursado),
          valorAcatado: String(line.valorAcatado),
          justificativaPrestador: line.justificativaPrestador,
          justificativaOperadora: line.justificativaOperadora,
        };
        const match = snapshotMatch(source, candidates, escopo);
        await tx
          .update(recursosRetornosLinhas)
          .set({
            estadoSugestao: match.estado,
            motivoSugestao: match.motivo,
            candidatosSnapshot: match.candidatos,
          })
          .where(
            and(
              eq(recursosRetornosLinhas.id, line.id),
              eq(recursosRetornosLinhas.importacaoId, input.importacaoId)
            )
          );
        await tx
          .insert(recursosRetornosRevisoes)
          .values({
            importacaoId: input.importacaoId,
            linhaId: line.id,
            tipo: "rebusca",
            aprovado: null,
            demonstrativoId: null,
            demonstrativoChave: null,
            arquivoFonteId: null,
            arquivoFonteHash: null,
            candidatosSnapshot: match.candidatos,
            justificativa:
              "Sugestões atualizadas sem alterar revisões aprovadas.",
            conflitoHash: null,
            revisadoPor: userId,
          });
        atualizadas += 1;
      }
      return { success: true, atualizadas };
    });
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosRevisar(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
    itens: Array<{
      linhaId: number;
      demonstrativoId: number;
      justificativa: string;
    }>;
    confirmar: true;
    confirmarDivergenciasCabecalho?: boolean;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    if (
      !input.itens.length ||
      input.itens.length > RETORNO_REVIEW_MAX_ITENS ||
      new Set(input.itens.map(item => item.linhaId)).size !==
        input.itens.length ||
      new Set(input.itens.map(item => item.demonstrativoId)).size !==
        input.itens.length
    )
      erro("BAD_REQUEST", "Revise linhas e demonstrativos sem repetições.");
    await retornosExigirEscopo(userId, escopo, "editar");
    const db = await retornosDb();
    return await db.transaction(async (tx: Db) => {
      const { imported, linhas, revisoes } = await dadosDetalhe(
        tx,
        escopo,
        input.importacaoId,
        true
      );
      if (
        imported.cabecalhoDivergente === "sim" &&
        input.confirmarDivergenciasCabecalho !== true
      )
        erro(
          "PRECONDITION_FAILED",
          "Confirme a divergência do cabeçalho antes de aprovar vínculos."
        );
      const byId = new Map(linhas.map(line => [Number(line.id), line]));
      const selected = input.itens.map(item => ({
        ...item,
        line: byId.get(item.linhaId),
      }));
      if (selected.some(item => !item.line))
        erro(
          "FORBIDDEN",
          "A revisão contém uma linha fora da resposta selecionada."
        );
      const candidates = await buscarCandidatos(
        tx,
        escopo,
        selected.map(item => ({
          guiaPrestador: item.line!.guiaPrestador,
          guiaOperadora: item.line!.guiaOperadora,
        })),
        true
      );
      const candidateById = new Map(
        candidates.map(candidate => [candidate.id, candidate])
      );
      const atuais = revisaoAtual(revisoes);
      let aprovadas = 0;
      for (const item of selected) {
        const line = item.line!;
        const candidate = candidateById.get(item.demonstrativoId);
        const source: RetornoXmlLinha = {
          posicao: Number(line.posicao),
          guiaPrestador: line.guiaPrestador,
          guiaOperadora: line.guiaOperadora,
          sequencialItem: line.sequencialItem,
          dataExecucao: line.dataExecucao,
          codigoTabela: line.codigoTabela,
          codigoItem: line.codigoItem,
          codigoGlosa: line.codigoGlosa,
          valorRecursado: String(line.valorRecursado),
          valorAcatado: String(line.valorAcatado),
          justificativaPrestador: line.justificativaPrestador,
          justificativaOperadora: line.justificativaOperadora,
        };
        if (!candidate || !validarCandidatoRetorno(source, candidate, escopo))
          erro(
            "BAD_REQUEST",
            "O demonstrativo selecionado não é compatível com a linha de recurso."
          );
        const prior = atuais.get(item.linhaId);
        if (prior?.aprovado === "sim") {
          if (
            prior.demonstrativoId === item.demonstrativoId &&
            prior.justificativa === item.justificativa
          )
            continue;
          erro(
            "CONFLICT",
            "Esta linha já possui uma revisão aprovada. Uma nova versão explícita será necessária."
          );
        }
        const reserva = chaveReservaAprovacao(candidate);
        const [reservada] = await tx
          .select({ id: recursosRetornosRevisoes.id })
          .from(recursosRetornosRevisoes)
          .where(
            and(
              eq(recursosRetornosRevisoes.tipo, "aprovacao"),
              eq(recursosRetornosRevisoes.demonstrativoChave, reserva)
            )
          )
          .limit(1)
          .for("update");
        if (reservada)
          erro(
            "CONFLICT",
            "Este item já possui vínculo aprovado em outra resposta. Revise o histórico antes de continuar."
          );
        await tx.insert(recursosRetornosRevisoes).values({
          importacaoId: input.importacaoId,
          linhaId: line.id,
          tipo: "aprovacao",
          aprovado: "sim",
          demonstrativoId: candidate.id,
          demonstrativoChave: reserva,
          arquivoFonteId: candidate.arquivoId,
          arquivoFonteHash: chaveEstavelDemonstrativo(candidate),
          candidatosSnapshot: snapshotMatch(source, candidates, escopo)
            .candidatos,
          justificativa: item.justificativa,
          conflitoHash: null,
          revisadoPor: userId,
        });
        aprovadas += 1;
      }
      return {
        success: true,
        aprovadas,
        jaAprovadas: input.itens.length - aprovadas,
      };
    });
  } catch (error) {
    if (colisaoConcorrenteConhecida(error))
      erro(
        "CONFLICT",
        "Outra revisão concorreu por este item. Recarregue a resposta e confira o histórico antes de tentar novamente."
      );
    return tratarBanco(error);
  }
}

export async function retornosAnexarProtocolo(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
    nomeArquivo: string;
    conteudoBase64: string;
    confirmar: true;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "editar");
    if (!armazenamentoRetornosPronto())
      erro(
        "PRECONDITION_FAILED",
        "O armazenamento protegido dos retornos precisa ser configurado pelo administrador."
      );
    const buffer = decodificarBase64(
      input.conteudoBase64,
      RETORNO_PDF_MAX_BYTES
    );
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
      erro("BAD_REQUEST", "O anexo deve ser um PDF válido.");
    const db = await retornosDb();
    const current = await buscarImportacao(db, escopo, input.importacaoId);
    if (!current) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
    if (current.protocoloPdfStorageKey)
      erro(
        "CONFLICT",
        "Já existe um protocolo anexado. Uma nova versão explícita será necessária."
      );
    const arquivo = await salvarArquivoRetorno(buffer, escopo, "pdf");
    await db.transaction(async (tx: Db) => {
      const locked = await buscarImportacao(
        tx,
        escopo,
        input.importacaoId,
        true
      );
      if (!locked) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
      if (locked.protocoloPdfStorageKey)
        erro(
          "CONFLICT",
          "Já existe um protocolo anexado. Uma nova versão explícita será necessária."
        );
      await tx
        .update(recursosRetornosImportacoes)
        .set({
          nomeArquivoPdf: input.nomeArquivo,
          protocoloPdfHash: sha256(buffer),
          protocoloPdfStorageKey: arquivo.key,
        })
        .where(eq(recursosRetornosImportacoes.id, input.importacaoId));
      await tx
        .insert(recursosRetornosRevisoes)
        .values({
          importacaoId: input.importacaoId,
          linhaId: null,
          tipo: "anexo_protocolo",
          aprovado: null,
          demonstrativoId: null,
          demonstrativoChave: null,
          arquivoFonteId: null,
          arquivoFonteHash: sha256(buffer),
          candidatosSnapshot: null,
          justificativa: "Protocolo em PDF anexado ao histórico.",
          conflitoHash: null,
          revisadoPor: userId,
        });
    });
    return { success: true };
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosArquivo(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
    tipo: "xml" | "protocolo_pdf";
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    await retornosExigirEscopo(userId, escopo, "visualizar");
    const db = await retornosDb();
    const imported = await buscarImportacao(db, escopo, input.importacaoId);
    if (!imported) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
    const isPdf = input.tipo === "protocolo_pdf";
    const key = isPdf
      ? imported.protocoloPdfStorageKey
      : imported.arquivoStorageKey;
    const nomeArquivo = isPdf
      ? imported.nomeArquivoPdf
      : imported.nomeArquivoXml;
    if (!key || !nomeArquivo)
      erro("NOT_FOUND", "O arquivo solicitado não está disponível.");
    const content = await lerArquivoRetorno(key, escopo, isPdf ? "pdf" : "xml");
    return {
      nomeArquivo,
      mime: isPdf ? "application/pdf" : "application/xml",
      conteudoBase64: content.toString("base64"),
    };
  } catch (error) {
    return tratarBanco(error);
  }
}

async function aprovacaoFinanceira(tx: Db, importacaoId: number) {
  const [lines, revisions] = await Promise.all([
    tx
      .select()
      .from(recursosRetornosLinhas)
      .where(eq(recursosRetornosLinhas.importacaoId, importacaoId)),
    tx
      .select()
      .from(recursosRetornosRevisoes)
      .where(eq(recursosRetornosRevisoes.importacaoId, importacaoId))
      .orderBy(asc(recursosRetornosRevisoes.id)),
  ]);
  const atuais = revisaoAtual(revisions as Revisao[]);
  const acatado = (lines as Linha[])
    .filter(line => atuais.get(Number(line.id))?.aprovado === "sim")
    .reduce((sum, line) => sum.plus(String(line.valorAcatado)), new Decimal(0));
  return { acatado, aprovacoes: atuais.size };
}

async function exigirFontesAprovadasAtuais(
  tx: Db,
  escopo: RetornoEscopo,
  importacaoId: number
): Promise<void> {
  const { linhas, revisoes } = await dadosDetalhe(
    tx,
    escopo,
    importacaoId,
    true
  );
  const aprovadas = [...revisaoAtual(revisoes).values()].filter(
    review => review.aprovado === "sim" && review.demonstrativoId
  );
  if (!aprovadas.length)
    erro(
      "PRECONDITION_FAILED",
      "Registre recebimentos somente após aprovar pelo menos um vínculo."
    );
  const ids = aprovadas.map(review => Number(review.demonstrativoId));
  const rows = await tx
    .select({
      id: demonstrativo.id,
      arquivoId: demonstrativo.arquivoId,
      estabelecimentoId: demonstrativo.estabelecimentoId,
      convenioId: demonstrativo.convenioId,
      numeroGuia: demonstrativo.numeroGuia,
      sequencialItem: demonstrativo.sequencialItem,
      dataExecucao: demonstrativo.dataExecucao,
      codigoItem: demonstrativo.codigoItem,
      codigoGlosa: demonstrativo.codigoGlosa,
      valorGlosa: demonstrativo.valorGlosa,
      protocolo: demonstrativo.protocolo,
      lotePrestador: demonstrativo.lotePrestador,
      codigoPrestador: demonstrativo.codigoPrestador,
      descricaoItem: demonstrativo.descricaoItem,
    })
    .from(demonstrativo)
    .where(
      and(
        eq(demonstrativo.estabelecimentoId, escopo.estabelecimentoId),
        eq(demonstrativo.convenioId, escopo.convenioId),
        inArray(demonstrativo.id, ids)
      )
    )
    .for("update");
  const candidatos = new Map<number, RetornoCandidato>(
    rows.map((row: any): [number, RetornoCandidato] => [
      Number(row.id),
      candidatoDaLinha(row),
    ])
  );
  const linhasPorId = new Map(linhas.map(line => [Number(line.id), line]));
  for (const revisao of aprovadas) {
    const linha = revisao.linhaId
      ? linhasPorId.get(Number(revisao.linhaId))
      : undefined;
    const candidato = candidatos.get(Number(revisao.demonstrativoId));
    if (
      !linha ||
      !candidato ||
      revisao.arquivoFonteHash !== chaveEstavelDemonstrativo(candidato)
    ) {
      erro(
        "PRECONDITION_FAILED",
        "Uma fonte aprovada foi alterada, removida ou reimportada. Revise os vínculos antes de registrar recebimentos."
      );
    }
  }
}

export async function retornosRegistrarPagamento(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
    valor: string;
    dataRecebimento: string;
    referencia: string;
    observacao: string;
    chaveOperacao: string;
    confirmar: true;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    if (
      !retornoDataCivilValida(input.dataRecebimento) ||
      input.dataRecebimento > hojeCivil()
    )
      erro("BAD_REQUEST", "A data de recebimento não pode ser futura.");
    const value = decimalPositivo(input.valor, "um valor positivo");
    await retornosExigirEscopo(userId, escopo, "editar");
    const db = await retornosDb();
    return await db.transaction(async (tx: Db) => {
      const imported = await buscarImportacao(
        tx,
        escopo,
        input.importacaoId,
        true
      );
      if (!imported) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
      const payloadHash = hashPagamento({
        tipo: "recebimento",
        importacaoId: input.importacaoId,
        valor: moeda(value),
        data: input.dataRecebimento,
        referencia: input.referencia,
        observacao: input.observacao,
      });
      const [operation] = await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(
          and(
            eq(
              recursosRetornosPagamentos.estabelecimentoId,
              escopo.estabelecimentoId
            ),
            eq(recursosRetornosPagamentos.convenioId, escopo.convenioId),
            eq(recursosRetornosPagamentos.chaveOperacao, input.chaveOperacao)
          )
        )
        .limit(1)
        .for("update");
      if (operation) {
        if (
          operation.tipo === "recebimento" &&
          operation.payloadHash === payloadHash
        )
          return { id: Number(operation.id), idempotente: true };
        erro(
          "CONFLICT",
          "A chave de operação já foi usada com informações diferentes."
        );
      }
      await exigirFontesAprovadasAtuais(tx, escopo, input.importacaoId);
      const { acatado } = await aprovacaoFinanceira(tx, input.importacaoId);
      const payments = await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(eq(recursosRetornosPagamentos.importacaoId, input.importacaoId))
        .for("update");
      const saldo = acatado.minus(resumoPagamentos(payments as Pagamento[]));
      if (value.gt(saldo))
        erro(
          "PRECONDITION_FAILED",
          "O valor informado excede o saldo acatado aprovado."
        );
      const [sameReference] = await tx
        .select({ id: recursosRetornosPagamentos.id })
        .from(recursosRetornosPagamentos)
        .where(
          and(
            eq(recursosRetornosPagamentos.importacaoId, input.importacaoId),
            eq(recursosRetornosPagamentos.tipo, "recebimento"),
            eq(recursosRetornosPagamentos.referencia, input.referencia)
          )
        )
        .limit(1);
      if (sameReference)
        erro(
          "CONFLICT",
          "A referência de recebimento já foi registrada para esta resposta."
        );
      const [created] = await tx
        .insert(recursosRetornosPagamentos)
        .values({
          importacaoId: input.importacaoId,
          estabelecimentoId: escopo.estabelecimentoId,
          convenioId: escopo.convenioId,
          tipo: "recebimento",
          pagamentoOrigemId: null,
          valor: moeda(value),
          dataEvento: input.dataRecebimento,
          referencia: input.referencia,
          observacao: input.observacao,
          chaveOperacao: input.chaveOperacao,
          payloadHash,
          registradoPor: userId,
        });
      return { id: Number(created.insertId), idempotente: false };
    });
  } catch (error) {
    return tratarBanco(error);
  }
}

export async function retornosEstornarPagamento(
  input: {
    estabelecimentoId: number;
    convenioId: number;
    importacaoId: number;
    pagamentoId: number;
    dataEstorno: string;
    justificativa: string;
    chaveOperacao: string;
    confirmar: true;
  },
  userId: number
) {
  const escopo = {
    estabelecimentoId: input.estabelecimentoId,
    convenioId: input.convenioId,
  };
  try {
    if (
      !retornoDataCivilValida(input.dataEstorno) ||
      input.dataEstorno > hojeCivil()
    )
      erro("BAD_REQUEST", "A data do estorno não pode ser futura.");
    await retornosExigirEscopo(userId, escopo, "editar");
    const db = await retornosDb();
    return await db.transaction(async (tx: Db) => {
      const imported = await buscarImportacao(
        tx,
        escopo,
        input.importacaoId,
        true
      );
      if (!imported) erro("NOT_FOUND", "Resposta de recurso não encontrada.");
      const [original] = await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(
          and(
            eq(recursosRetornosPagamentos.id, input.pagamentoId),
            eq(recursosRetornosPagamentos.importacaoId, input.importacaoId),
            eq(
              recursosRetornosPagamentos.estabelecimentoId,
              escopo.estabelecimentoId
            ),
            eq(recursosRetornosPagamentos.convenioId, escopo.convenioId),
            eq(recursosRetornosPagamentos.tipo, "recebimento")
          )
        )
        .limit(1)
        .for("update");
      if (!original)
        erro(
          "NOT_FOUND",
          "O recebimento informado não pertence a esta resposta."
        );
      if (input.dataEstorno < String(original.dataEvento))
        erro(
          "BAD_REQUEST",
          "A data do estorno não pode ser anterior ao recebimento."
        );
      const payloadHash = hashPagamento({
        tipo: "estorno",
        importacaoId: input.importacaoId,
        pagamentoId: input.pagamentoId,
        valor: String(original.valor),
        data: input.dataEstorno,
        justificativa: input.justificativa,
      });
      const [operation] = await tx
        .select()
        .from(recursosRetornosPagamentos)
        .where(
          and(
            eq(
              recursosRetornosPagamentos.estabelecimentoId,
              escopo.estabelecimentoId
            ),
            eq(recursosRetornosPagamentos.convenioId, escopo.convenioId),
            eq(recursosRetornosPagamentos.chaveOperacao, input.chaveOperacao)
          )
        )
        .limit(1)
        .for("update");
      if (operation) {
        if (
          operation.tipo === "estorno" &&
          operation.payloadHash === payloadHash
        )
          return { id: Number(operation.id), idempotente: true };
        erro(
          "CONFLICT",
          "A chave de operação já foi usada com informações diferentes."
        );
      }
      const [reversal] = await tx
        .select({ id: recursosRetornosPagamentos.id })
        .from(recursosRetornosPagamentos)
        .where(eq(recursosRetornosPagamentos.pagamentoOrigemId, original.id))
        .limit(1)
        .for("update");
      if (reversal)
        erro("CONFLICT", "Este recebimento já possui um estorno registrado.");
      const [created] = await tx
        .insert(recursosRetornosPagamentos)
        .values({
          importacaoId: input.importacaoId,
          estabelecimentoId: escopo.estabelecimentoId,
          convenioId: escopo.convenioId,
          tipo: "estorno",
          pagamentoOrigemId: original.id,
          valor: String(original.valor),
          dataEvento: input.dataEstorno,
          referencia: original.referencia,
          observacao: input.justificativa,
          chaveOperacao: input.chaveOperacao,
          payloadHash,
          registradoPor: userId,
        });
      return { id: Number(created.insertId), idempotente: false };
    });
  } catch (error) {
    return tratarBanco(error);
  }
}
