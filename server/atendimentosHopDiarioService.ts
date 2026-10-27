import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import {
  construirPlanoHop,
  slotHopDiario,
  validarCoberturaHop,
  type PlanoHop,
} from "./atendimentosHopSnapshot";
import {
  HOP_DIARIO_CRON,
  HOP_DIARIO_FUSO,
  HOP_DIARIO_HORARIO,
  HOP_DIARIO_UNIDADES,
  hopDiarioConfirmacao,
  hopDiarioConfirmarCarga,
  hopDiarioEscopo,
  hopDiarioProdutor,
  type HopDiarioContagens,
  type HopDiarioEscopo,
  type HopDiarioExecucaoResumo,
  type HopDiarioLoteResumo,
  type HopDiarioPrevia,
  type HopDiarioResumo,
} from "../shared/atendimentosHopDiario";

/**
 * Implementação persistente do espelhamento Hop diário.
 *
 * O módulo puro `atendimentosHopSnapshot` é importado estaticamente para que
 * esbuild o empacote. A dependência injetável mantém este adaptador testável
 * com planos sintéticos e evita copiar regras de mapeamento ou fingerprints
 * aqui. A adaptação padrão é real: usa getRawPool/mysql2,
 * tabelas allowlisted e Heartbeat nativo quando a integração registrar as rotas.
 */
const CONTROLES = "atendimentos_hop_controles";
const LOTES = "atendimentos_hop_lotes";
const EXECUCOES = "atendimentos_hop_execucoes";
const DESTINO = "atendimentos_unificados";
const ORIGEM = "WARLEINE";
const PREVIEW_ISSUER = "safatle-atendimentos-hop-diario";
const PREVIEW_AUDIENCE = "safatle-atendimentos-hop-diario";
const PREVIEW_TTL_SECONDS = 15 * 60;
const LEASE_SECONDS = 120;
const LIMITE_SNAPSHOT = 100_000;
const TAMANHO_LOTE = 500;

type SqlRow = RowDataPacket & Record<string, unknown>;
type SqlConnection = Pick<PoolConnection, "query" | "execute" | "beginTransaction" | "commit" | "rollback" | "release" | "destroy">;
type EstadoControle = "pausado" | "preparando" | "ativo" | "erro" | "incerto";
type EstadoLote = "carregando" | "completo" | "publicado" | "falhou" | "incerto";
type EstadoExecucao = "reservada" | "concluida" | "falhou" | "incerto";
type ModoExecucao = "cron" | "manual";

/** Campos Hop permitidos no destino. A ordem é também a ordem do INSERT. */
const CAMPOS_HOP = [
  "estabelecimentoId",
  "origemSistema",
  "origemId",
  "numero_atendimento",
  "codigo_saida",
  "convenio",
  "paciente",
  "caracter_atendimento",
  "data_entrada",
  "data_saida",
  "tipo_atendimento",
  "descricao_atendimento",
  "codigo_servico",
  "codigo_procedimento",
  "destino_conta",
  "ativoNaFonte",
] as const;

type HopMappedRow = Record<(typeof CAMPOS_HOP)[number], unknown>;
type PureHopModule = {
  construirPlanoHop: typeof construirPlanoHop;
  validarCoberturaHop: typeof validarCoberturaHop;
  slotHopDiario: typeof slotHopDiario;
};
type PreviewClaims = {
  actorId: number;
  estabelecimentoId: number;
  loteId: number;
  loteRef: string;
  /** Compromisso HMAC de lote/fingerprint; nunca expõe o hash privado. */
  compromisso: string;
  contagens: HopDiarioContagens;
};
type ControleRow = {
  id: number;
  estabelecimentoId: number;
  criadoPor: number;
  estado: EstadoControle;
  taskUid: string | null;
  cronUtc: string;
  fuso: string;
  operacaoToken: string | null;
  execucaoToken: string | null;
  leaseAte: unknown;
  ultimoSlot: string | null;
  ultimaExecucao: unknown;
  proximaExecucao: unknown;
  producerTokenHash: string | null;
  leaseAtiva: boolean;
  leaseExpirada: boolean;
};
type LoteRow = {
  id: number;
  controleId: number;
  estabelecimentoId: number;
  loteRef: string;
  estado: EstadoLote;
  totalEsperado: number | null;
  totalObservado: number | null;
  fingerprintPrivado: string | null;
  iniciadoEm: unknown;
  concluidoEm: unknown;
  publicadoEm: unknown;
  falhouEm: unknown;
  codigo: string | null;
};
type ExecucaoRow = {
  id: number;
  controleId: number;
  loteId: number | null;
  slot: string;
  modo: ModoExecucao;
  estado: EstadoExecucao;
  contagens: unknown;
  codigo: string | null;
  iniciadoEm: unknown;
  terminadoEm: unknown;
};

type HeartbeatApi = {
  create: typeof createHeartbeatJob;
  update: typeof updateHeartbeatJob;
};
export type AtendimentosHopDiarioDeps = {
  getPool?: () => Promise<Pool | null>;
  heartbeat?: HeartbeatApi;
  now?: () => Date;
  randomUuid?: () => string;
  randomToken?: () => string;
  previewSecret?: () => Uint8Array;
  pure?: () => Promise<PureHopModule>;
};

export type ProdutorResultado = { aceito: boolean; estado: "carregando" | "completo" | "publicado" | "falhou" };
export type CallbackResultado = { status: "executado" | "ignorado" | "bloqueado" | "falhou" | "incerto" };

class CommitUncertainError extends Error {
  constructor() {
    super("COMMIT_UNCERTAIN");
  }
}
class ApplicationDeadlineError extends Error {
  constructor() {
    super("APPLICATION_DEADLINE_EXCEEDED");
  }
}

function fail(code: TRPCError["code"], message: string): never {
  throw new TRPCError({ code, message });
}
function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: unknown; errno?: unknown; message?: unknown };
  return candidate?.code === "ER_NO_SUCH_TABLE" || candidate?.errno === 1146 || /no such table|doesn't exist/i.test(String(candidate?.message ?? ""));
}
function safeError(error: unknown, fallback: string): never {
  if (error instanceof TRPCError) throw error;
  if (isMissingTableError(error)) {
    fail("PRECONDITION_FAILED", "A migração controlada do snapshot Hop diário ainda não está disponível.");
  }
  fail("INTERNAL_SERVER_ERROR", fallback);
}
function requireActor(actorId: number): void {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) fail("FORBIDDEN", "Administrador responsável inválido.");
}
function numberValue(value: unknown): number {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : 0;
}
function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function utcIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = new Date(`${String(value).replace(" ", "T").replace(/\.\d+$/, "")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function utcMysql(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}
function nextHopExecutionUtc(after: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOP_DIARIO_FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(after).filter(part => part.type !== "literal").reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const nextCivilDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 13, 0, 0));
  return utcMysql(nextCivilDay.toISOString())!;
}
function parseControlState(value: unknown): EstadoControle {
  return ["pausado", "preparando", "ativo", "erro", "incerto"].includes(String(value)) ? value as EstadoControle : "incerto";
}
function parseLoteState(value: unknown): EstadoLote {
  return ["carregando", "completo", "publicado", "falhou", "incerto"].includes(String(value)) ? value as EstadoLote : "incerto";
}
function parseExecState(value: unknown): EstadoExecucao {
  return ["reservada", "concluida", "falhou", "incerto"].includes(String(value)) ? value as EstadoExecucao : "incerto";
}
function parseCounts(value: unknown): HopDiarioContagens | null {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  const keys: Array<keyof HopDiarioContagens> = ["totalFonte", "ativosAntes", "novos", "atualizados", "reativados", "inalterados", "inativados", "ativosDepois"];
  const result = {} as HopDiarioContagens;
  for (const key of keys) {
    const valueNumber = Number(raw[key]);
    if (!Number.isSafeInteger(valueNumber) || valueNumber < 0) return null;
    result[key] = valueNumber;
  }
  return result;
}
function asControle(row: SqlRow): ControleRow {
  return {
    id: numberValue(row.id), estabelecimentoId: numberValue(row.estabelecimentoId), criadoPor: numberValue(row.criadoPor),
    estado: parseControlState(row.estado), taskUid: textValue(row.taskUid), cronUtc: textValue(row.cronUtc) ?? HOP_DIARIO_CRON,
    fuso: textValue(row.fuso) ?? HOP_DIARIO_FUSO, operacaoToken: textValue(row.operacaoToken), execucaoToken: textValue(row.execucaoToken),
    leaseAte: row.leaseAte, ultimoSlot: textValue(row.ultimoSlot), ultimaExecucao: row.ultimaExecucao, proximaExecucao: row.proximaExecucao,
    producerTokenHash: textValue(row.producerTokenHash), leaseAtiva: Number(row.leaseAtiva) === 1, leaseExpirada: Number(row.leaseExpirada) === 1,
  };
}
function asLote(row: SqlRow): LoteRow {
  return {
    id: numberValue(row.id), controleId: numberValue(row.controleId), estabelecimentoId: numberValue(row.estabelecimentoId), loteRef: textValue(row.loteRef) ?? "",
    estado: parseLoteState(row.estado), totalEsperado: row.totalEsperado === null || row.totalEsperado === undefined ? null : numberValue(row.totalEsperado),
    totalObservado: row.totalObservado === null || row.totalObservado === undefined ? null : numberValue(row.totalObservado),
    fingerprintPrivado: textValue(row.fingerprintPrivado), iniciadoEm: row.iniciadoEm, concluidoEm: row.concluidoEm,
    publicadoEm: row.publicadoEm, falhouEm: row.falhouEm, codigo: textValue(row.codigo),
  };
}
function asExecucao(row: SqlRow): ExecucaoRow {
  return {
    id: numberValue(row.id), controleId: numberValue(row.controleId), loteId: row.loteId === null || row.loteId === undefined ? null : numberValue(row.loteId),
    slot: textValue(row.slot) ?? "", modo: row.modo === "manual" ? "manual" : "cron", estado: parseExecState(row.estado),
    contagens: row.contagens, codigo: textValue(row.codigo), iniciadoEm: row.iniciadoEm, terminadoEm: row.terminadoEm,
  };
}

const controleColumns = `
  id, estabelecimento_id AS estabelecimentoId, criado_por AS criadoPor, estado,
  task_uid AS taskUid, cron_utc AS cronUtc, fuso, operacao_token AS operacaoToken,
  execucao_token AS execucaoToken, lease_ate AS leaseAte, ultimo_slot AS ultimoSlot,
  ultima_execucao AS ultimaExecucao, proxima_execucao AS proximaExecucao,
  producer_token_hash AS producerTokenHash`;
const loteColumns = `
  id, controle_id AS controleId, estabelecimento_id AS estabelecimentoId, lote_ref AS loteRef,
  estado, total_esperado AS totalEsperado, total_observado AS totalObservado,
  fingerprint_privado AS fingerprintPrivado, iniciado_em AS iniciadoEm, concluido_em AS concluidoEm,
  publicado_em AS publicadoEm, falhou_em AS falhouEm, codigo`;
const execucaoColumns = `
  id, controle_id AS controleId, lote_id AS loteId, slot, modo, estado, contagens,
  codigo, iniciado_em AS iniciadoEm, terminado_em AS terminadoEm`;

function sourceTable(estabelecimentoId: number): string {
  const unit = HOP_DIARIO_UNIDADES[estabelecimentoId as keyof typeof HOP_DIARIO_UNIDADES];
  if (!unit) fail("BAD_REQUEST", "Unidade não habilitada para este fluxo.");
  // Valor vem exclusivamente da allowlist congelada em shared, nunca do request.
  return unit.tabela;
}
function sourceSql(estabelecimentoId: number): string {
  const table = sourceTable(estabelecimentoId);
  // DATE_FORMAT mantém datas civis. Não se altera timezone e nunca se cria Date
  // para data_entrada/data_saida antes dos mapeadores puros.
  return `SELECT CAST(numatend AS CHAR) AS numatend, codtipsai, nomeplaco, nomepac, carater,
    DATE_FORMAT(datatend, '%Y-%m-%d %H:%i:%s') AS datatend,
    DATE_FORMAT(datasai, '%Y-%m-%d %H:%i:%s') AS datasai,
    tipoatend, codserv, procprin, codcc_destino, tipoatendimentodescricao,
    CAST(Estabelecimentos_id AS CHAR) AS Estabelecimentos_id
    FROM \`${table}\` WHERE CAST(Estabelecimentos_id AS CHAR) = ? LIMIT ${LIMITE_SNAPSHOT + 1}`;
}
function sourceScopeSql(estabelecimentoId: number): string {
  const table = sourceTable(estabelecimentoId);
  return `SELECT COUNT(*) AS foraDoEscopo FROM \`${table}\`
    WHERE Estabelecimentos_id IS NULL OR CAST(Estabelecimentos_id AS CHAR) <> ?`;
}
const destinationSql = `SELECT id, estabelecimentoId, origemSistema, origemId, numero_atendimento,
  codigo_saida, convenio, paciente, caracter_atendimento,
  DATE_FORMAT(data_entrada, '%Y-%m-%d %H:%i:%s') AS data_entrada,
  DATE_FORMAT(data_saida, '%Y-%m-%d %H:%i:%s') AS data_saida,
  tipo_atendimento, descricao_atendimento, codigo_servico, codigo_procedimento,
  destino_conta, ativoNaFonte
  FROM \`${DESTINO}\` WHERE estabelecimentoId = ? AND origemSistema = ?`;

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function tokenHash(value: string): string { return digest(value); }
function noSensitiveLog(_event: string, _code: string, _counts?: HopDiarioContagens): void {
  // Ponto intencionalmente sem payload: não registrar SQL, tokens, fingerprints,
  // valores de linhas, nomes, identificadores clínicos ou credenciais.
}

export function sessionTokenFromCookie(header: string | undefined): string {
  return parseCookie(header ?? "").app_session_id ?? "";
}

export function criarAtendimentosHopDiarioService(deps: AtendimentosHopDiarioDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const uuid = deps.randomUuid ?? randomUUID;
  const randomToken = deps.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const poolProvider = deps.getPool ?? getRawPool;
  const heartbeat = deps.heartbeat ?? { create: createHeartbeatJob, update: updateHeartbeatJob };
  const previewSecret = deps.previewSecret ?? (() => {
    const raw = process.env.JWT_SECRET;
    if (!raw) fail("INTERNAL_SERVER_ERROR", "Assinatura da prévia indisponível.");
    return new TextEncoder().encode(raw);
  });
  const pure = deps.pure ?? (async (): Promise<PureHopModule> => ({
    construirPlanoHop,
    validarCoberturaHop,
    slotHopDiario,
  }));

  async function acquire(): Promise<SqlConnection> {
    try {
      const pool = await poolProvider();
      if (!pool) fail("INTERNAL_SERVER_ERROR", "Serviço de snapshot indisponível.");
      return await pool.getConnection();
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      fail("INTERNAL_SERVER_ERROR", "Serviço de snapshot indisponível.");
    }
  }
  function release(connection: SqlConnection, healthy: boolean): void {
    try { healthy ? connection.release() : connection.destroy(); } catch { /* response sanitizada vence */ }
  }
  async function beginPessimistic(connection: SqlConnection): Promise<void> {
    const [rows] = await connection.query<SqlRow[]>("SELECT VERSION() AS versao");
    if (rows.length !== 1 || typeof rows[0]?.versao !== "string") fail("INTERNAL_SERVER_ERROR", "Modo transacional não confirmado.");
    if (/tidb/i.test(rows[0]!.versao)) await connection.query("BEGIN PESSIMISTIC");
    else await connection.beginTransaction();
  }
  function assertBeforeDeadline(deadlineAt: number | null): void {
    if (deadlineAt !== null && now().getTime() >= deadlineAt) throw new ApplicationDeadlineError();
  }
  async function transaction<T>(work: (connection: SqlConnection) => Promise<T>, deadlineAt: number | null = null): Promise<T> {
    const connection = await acquire();
    let begun = false;
    let commitStarted = false;
    let committed = false;
    let healthy = true;
    try {
      await beginPessimistic(connection); begun = true;
      const result = await work(connection);
      assertBeforeDeadline(deadlineAt);
      commitStarted = true;
      await connection.commit(); committed = true;
      return result;
    } catch (error) {
      if (begun && !committed) {
        if (commitStarted) { healthy = false; throw new CommitUncertainError(); }
        try { await connection.rollback(); } catch { healthy = false; }
      }
      throw error;
    } finally { release(connection, healthy); }
  }
  async function fetchControleLocked(connection: SqlConnection, estabelecimentoId: number): Promise<ControleRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${controleColumns},
        (lease_ate IS NOT NULL AND lease_ate > UTC_TIMESTAMP(3)) AS leaseAtiva,
        (lease_ate IS NOT NULL AND lease_ate <= UTC_TIMESTAMP(3)) AS leaseExpirada
       FROM ${CONTROLES} WHERE estabelecimento_id = ? FOR UPDATE`, [estabelecimentoId]);
    return rows.length === 1 ? asControle(rows[0]!) : null;
  }
  async function fetchControleByTaskLocked(connection: SqlConnection, taskUid: string): Promise<ControleRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${controleColumns},
        (lease_ate IS NOT NULL AND lease_ate > UTC_TIMESTAMP(3)) AS leaseAtiva,
        (lease_ate IS NOT NULL AND lease_ate <= UTC_TIMESTAMP(3)) AS leaseExpirada
       FROM ${CONTROLES} WHERE task_uid = ? FOR UPDATE`, [taskUid]);
    return rows.length === 1 ? asControle(rows[0]!) : null;
  }
  async function fetchControleByProducerLocked(connection: SqlConnection, hash: string): Promise<ControleRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${controleColumns},
        (lease_ate IS NOT NULL AND lease_ate > UTC_TIMESTAMP(3)) AS leaseAtiva,
        (lease_ate IS NOT NULL AND lease_ate <= UTC_TIMESTAMP(3)) AS leaseExpirada
       FROM ${CONTROLES} WHERE producer_token_hash = ? FOR UPDATE`, [hash]);
    return rows.length === 1 ? asControle(rows[0]!) : null;
  }
  async function ensureControleLocked(connection: SqlConnection, estabelecimentoId: number, actorId: number): Promise<ControleRow> {
    let control = await fetchControleLocked(connection, estabelecimentoId);
    if (control) return control;
    const operationToken = uuid();
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${CONTROLES} (estabelecimento_id, criado_por, estado, cron_utc, fuso, operacao_token, criado_em, atualizado_em)
       VALUES (?, ?, 'pausado', ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
      [estabelecimentoId, actorId, HOP_DIARIO_CRON, HOP_DIARIO_FUSO, operationToken]);
    if (!Number.isSafeInteger(Number(result.insertId)) || Number(result.insertId) <= 0) fail("INTERNAL_SERVER_ERROR", "Controle do snapshot não confirmado.");
    control = await fetchControleLocked(connection, estabelecimentoId);
    if (!control) fail("INTERNAL_SERVER_ERROR", "Controle do snapshot não confirmado.");
    return control;
  }
  function assertOwner(control: ControleRow, actorId: number): void {
    if (control.criadoPor !== actorId) fail("FORBIDDEN", "Somente o administrador responsável pode alterar este controle.");
    if (!control.operacaoToken) fail("CONFLICT", "O controle requer conferência antes de ser alterado.");
  }
  async function updateControl(connection: SqlConnection, control: ControleRow, setSql: string, params: unknown[]): Promise<void> {
    if (!control.operacaoToken) fail("CONFLICT", "O controle requer conferência antes de ser alterado.");
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE ${CONTROLES} SET ${setSql}, atualizado_em = UTC_TIMESTAMP(3)
       WHERE id = ? AND estabelecimento_id = ? AND operacao_token = ?`,
      [...params, control.id, control.estabelecimentoId, control.operacaoToken]);
    if (result.affectedRows !== 1) fail("CONFLICT", "O controle mudou durante a operação. Confira antes de repetir.");
  }
  async function fetchLoteLocked(connection: SqlConnection, controleId: number, loteRef?: string): Promise<LoteRow | null> {
    const where = loteRef ? "controle_id = ? AND lote_ref = ?" : "controle_id = ?";
    const params = loteRef ? [controleId, loteRef] : [controleId];
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${loteColumns} FROM ${LOTES} WHERE ${where} ORDER BY id DESC LIMIT 1 FOR UPDATE`, params);
    return rows.length === 1 ? asLote(rows[0]!) : null;
  }
  async function fetchLoteByIdLocked(connection: SqlConnection, loteId: number, controleId: number): Promise<LoteRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${loteColumns} FROM ${LOTES} WHERE id = ? AND controle_id = ? FOR UPDATE`, [loteId, controleId]);
    return rows.length === 1 ? asLote(rows[0]!) : null;
  }
  async function latestCompleteLoteLocked(connection: SqlConnection, control: ControleRow): Promise<LoteRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${loteColumns} FROM ${LOTES}
       WHERE controle_id = ? AND estado = 'completo' ORDER BY id DESC LIMIT 1 FOR UPDATE`, [control.id]);
    return rows.length === 1 ? asLote(rows[0]!) : null;
  }
  async function pendingLoteLocked(connection: SqlConnection, control: ControleRow): Promise<LoteRow | null> {
    const [rows] = await connection.execute<SqlRow[]>(
      `SELECT ${loteColumns} FROM ${LOTES}
       WHERE controle_id = ? AND estado IN ('carregando', 'incerto') ORDER BY id DESC LIMIT 1 FOR UPDATE`, [control.id]);
    return rows.length === 1 ? asLote(rows[0]!) : null;
  }
  async function readSource(connection: SqlConnection, estabelecimentoId: number): Promise<unknown[]> {
    const [scopeRows] = await connection.execute<SqlRow[]>(sourceScopeSql(estabelecimentoId), [String(estabelecimentoId)]);
    if (numberValue(scopeRows[0]?.foraDoEscopo) > 0) fail("CONFLICT", "A staging contém registros fora do escopo da unidade e requer conferência.");
    // TiDB rejeita LIMIT bindado como DOUBLE pelo mysql2; o limite é constante
    // interna, nunca entrada do cliente. A unidade continua parametrizada.
    const [rows] = await connection.execute<SqlRow[]>(sourceSql(estabelecimentoId), [String(estabelecimentoId)]);
    if (rows.length === 0) fail("CONFLICT", "Snapshot vazio requer conferência e não pode ser publicado.");
    if (rows.length > LIMITE_SNAPSHOT) fail("BAD_REQUEST", "Snapshot excede o limite de 100.000 registros.");
    return rows;
  }
  async function readDestination(connection: SqlConnection, estabelecimentoId: number, lock = false): Promise<unknown[]> {
    const [rows] = await connection.execute<SqlRow[]>(`${destinationSql}${lock ? " FOR UPDATE" : ""}`, [estabelecimentoId, ORIGEM]);
    return rows;
  }
  async function buildPlan(connection: SqlConnection, estabelecimentoId: number, lockDestination = false): Promise<PlanoHop> {
    const [source, destination, module] = await Promise.all([
      readSource(connection, estabelecimentoId), readDestination(connection, estabelecimentoId, lockDestination), pure(),
    ]);
    let plan: PlanoHop;
    try {
      plan = module.construirPlanoHop(
        estabelecimentoId,
        source as Parameters<PureHopModule["construirPlanoHop"]>[1],
        destination as Parameters<PureHopModule["construirPlanoHop"]>[2],
      );
    }
    catch { fail("CONFLICT", "O snapshot requer conferência antes da publicação."); }
    if (!plan || !Array.isArray(plan.fonteMapeada) || !Array.isArray(plan.inativarIds) || !plan.contagens || !/^[a-f0-9]{64}$/i.test(String(plan.fingerprint))) {
      fail("CONFLICT", "O plano do snapshot requer conferência.");
    }
    if (plan.fonteMapeada.length < 1 || plan.fonteMapeada.length > LIMITE_SNAPSHOT) fail("CONFLICT", "Cobertura do snapshot inválida.");
    try {
      if (module.validarCoberturaHop(plan.contagens).automaticoPermitido !== true)
        fail("CONFLICT", "Cobertura do snapshot requer conferência.");
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      fail("CONFLICT", "Cobertura do snapshot requer conferência.");
    }
    return plan;
  }
  async function observePlan(estabelecimentoId: number): Promise<PlanoHop> {
    const connection = await acquire();
    try { return await buildPlan(connection, estabelecimentoId); }
    finally { release(connection, true); }
  }
  function assertReductionSafe(plan: PlanoHop): void {
    const before = plan.contagens.ativosAntes;
    const after = plan.contagens.ativosDepois;
    const inactivated = plan.contagens.inativados;
    if (before > 0 && (after === 0 || after <= Math.floor(before * 0.2))) {
      fail("CONFLICT", "Redução extraordinária do snapshot requer conferência manual.");
    }
    if (before > 0 && inactivated / before >= 0.5) {
      fail("CONFLICT", "Inativação suspeita requer conferência manual.");
    }
  }
  async function signPreview(claims: PreviewClaims): Promise<{ token: string; expiresAt: string }> {
    const issued = Math.floor(now().getTime() / 1000);
    const expiration = issued + PREVIEW_TTL_SECONDS;
    const token = await new SignJWT({
      estabelecimentoId: claims.estabelecimentoId, loteId: claims.loteId, loteRef: claims.loteRef,
      compromisso: claims.compromisso, contagens: claims.contagens,
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(PREVIEW_ISSUER).setAudience(PREVIEW_AUDIENCE)
      .setSubject(String(claims.actorId)).setIssuedAt(issued).setExpirationTime(expiration).sign(previewSecret());
    return { token, expiresAt: new Date(expiration * 1000).toISOString() };
  }
  async function verifyPreview(token: string, actorId: number, input: HopDiarioEscopo): Promise<PreviewClaims> {
    try {
      const verified = await jwtVerify(token, previewSecret(), { algorithms: ["HS256"], issuer: PREVIEW_ISSUER, audience: PREVIEW_AUDIENCE });
      const payload = verified.payload;
      const rawCounts = payload.contagens;
      const claims: PreviewClaims = {
        actorId: Number(payload.sub), estabelecimentoId: Number(payload.estabelecimentoId), loteId: Number(payload.loteId),
        loteRef: typeof payload.loteRef === "string" ? payload.loteRef : "", compromisso: typeof payload.compromisso === "string" ? payload.compromisso : "",
        contagens: parseCounts(rawCounts) as HopDiarioContagens,
      };
      if (!Number.isSafeInteger(claims.actorId) || claims.actorId !== actorId || claims.estabelecimentoId !== input.estabelecimentoId ||
        !Number.isSafeInteger(claims.loteId) || claims.loteId <= 0 || !/^[a-f0-9]{64}$/i.test(claims.compromisso) || !claims.contagens ||
        !/^[0-9a-f-]{36}$/i.test(claims.loteRef)) fail("CONFLICT", "A prévia não corresponde a esta confirmação. Gere uma nova prévia.");
      return claims;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      fail("CONFLICT", "A prévia expirou ou não é válida. Gere uma nova prévia.");
    }
  }
  /** Vínculo opaco verificável apenas no servidor; o fingerprint não sai no JWT. */
  function compromissoPrevia(lote: Pick<LoteRow, "id" | "loteRef">, fingerprint: string): string {
    return createHmac("sha256", Buffer.from(previewSecret()))
      .update(`${lote.id}\u0000${lote.loteRef}\u0000${fingerprint}`)
      .digest("hex");
  }
  function toLoteResumo(row: LoteRow): HopDiarioLoteResumo {
    return { id: row.id, estado: row.estado, totalEsperado: row.totalEsperado, concluidoEm: utcIso(row.concluidoEm) };
  }
  function toExecucaoResumo(row: ExecucaoRow): HopDiarioExecucaoResumo {
    return { id: row.id, estado: row.estado, modo: row.modo, iniciadoEm: utcIso(row.iniciadoEm) ?? "", terminadoEm: utcIso(row.terminadoEm), codigo: row.codigo, contagens: parseCounts(row.contagens) };
  }
  function resumoConfiguracaoPendente(estabelecimentoId: number): HopDiarioResumo {
    const unit = HOP_DIARIO_UNIDADES[estabelecimentoId as keyof typeof HOP_DIARIO_UNIDADES];
    if (!unit) fail("BAD_REQUEST", "Unidade não habilitada para este fluxo.");
    return {
      estabelecimentoId, unidade: unit.nome, origem: ORIGEM, destino: DESTINO, horario: HOP_DIARIO_HORARIO, fuso: HOP_DIARIO_FUSO,
      configuracaoPendente: true, estado: "nao_configurado", podeGerenciar: false, credencialHopConfigurada: false,
      ultimaExecucao: null, proximaExecucao: null, ultimoLote: null, execucoes: [],
    };
  }
  async function createResumo(connection: SqlConnection, estabelecimentoId: number, actorId: number, control: ControleRow | null): Promise<HopDiarioResumo> {
    const unit = HOP_DIARIO_UNIDADES[estabelecimentoId as keyof typeof HOP_DIARIO_UNIDADES];
    if (!unit) fail("BAD_REQUEST", "Unidade não habilitada para este fluxo.");
    if (!control) return {
      estabelecimentoId, unidade: unit.nome, origem: ORIGEM, destino: DESTINO, horario: HOP_DIARIO_HORARIO, fuso: HOP_DIARIO_FUSO,
      configuracaoPendente: false, estado: "nao_configurado", podeGerenciar: true, credencialHopConfigurada: false,
      ultimaExecucao: null, proximaExecucao: null, ultimoLote: null, execucoes: [],
    };
    const [lots, executions] = await Promise.all([
      connection.execute<SqlRow[]>(`SELECT ${loteColumns} FROM ${LOTES} WHERE controle_id = ? ORDER BY id DESC LIMIT 1`, [control.id]),
      connection.execute<SqlRow[]>(`SELECT ${execucaoColumns} FROM ${EXECUCOES} WHERE controle_id = ? ORDER BY id DESC LIMIT 20`, [control.id]),
    ]);
    return {
      estabelecimentoId, unidade: unit.nome, origem: ORIGEM, destino: DESTINO, horario: HOP_DIARIO_HORARIO, fuso: HOP_DIARIO_FUSO,
      configuracaoPendente: false, estado: control.estado, podeGerenciar: control.criadoPor === actorId,
      credencialHopConfigurada: Boolean(control.producerTokenHash), ultimaExecucao: utcIso(control.ultimaExecucao),
      proximaExecucao: utcIso(control.proximaExecucao), ultimoLote: lots[0].length ? toLoteResumo(asLote(lots[0][0]!)) : null,
      execucoes: executions[0].map(asExecucao).map(toExecucaoResumo),
    };
  }
  async function resumo(raw: HopDiarioEscopo, actorId: number): Promise<HopDiarioResumo> {
    const input = hopDiarioEscopo.parse(raw); requireActor(actorId);
    const connection = await acquire();
    try {
      const [rows] = await connection.execute<SqlRow[]>(`SELECT ${controleColumns}, 0 AS leaseAtiva, 0 AS leaseExpirada FROM ${CONTROLES} WHERE estabelecimento_id = ?`, [input.estabelecimentoId]);
      return createResumo(connection, input.estabelecimentoId, actorId, rows.length ? asControle(rows[0]!) : null);
    } catch (error) {
      if (isMissingTableError(error)) return resumoConfiguracaoPendente(input.estabelecimentoId);
      safeError(error, "Não foi possível obter o resumo do snapshot.");
    }
    finally { release(connection, true); }
  }
  async function gerarCredencial(raw: HopDiarioEscopo, actorId: number): Promise<{ credencial: string }> {
    const input = hopDiarioEscopo.parse(raw); requireActor(actorId);
    const credential = randomToken();
    if (!/^[A-Za-z0-9_-]{43}$/.test(credential)) fail("INTERNAL_SERVER_ERROR", "Não foi possível gerar a credencial.");
    try {
      await transaction(async connection => {
        const control = await ensureControleLocked(connection, input.estabelecimentoId, actorId);
        assertOwner(control, actorId);
        if (control.estado !== "pausado" || control.leaseAtiva || control.leaseExpirada) {
          fail("CONFLICT", "A credencial só pode ser trocada com o controle pausado e sem execução.");
        }
        await updateControl(connection, control, "producer_token_hash = ?", [tokenHash(credential)]);
      });
      return { credencial: credential };
    } catch (error) { safeError(error, "Credencial não confirmada."); }
  }
  async function confirmarCarga(raw: unknown, actorId: number): Promise<HopDiarioResumo> {
    const input = hopDiarioConfirmarCarga.parse(raw); requireActor(actorId);
    try {
      await transaction(async connection => {
        const control = await ensureControleLocked(connection, input.estabelecimentoId, actorId);
        assertOwner(control, actorId);
        if (control.estado !== "pausado" || control.leaseAtiva || control.leaseExpirada) fail("CONFLICT", "A captura administrativa exige controle pausado e sem execução.");
        if (await pendingLoteLocked(connection, control)) fail("CONFLICT", "Há lote do produtor em carregamento ou incerto. Confira antes de capturar.");
        // O lock do controle impede o produtor de iniciar/concluir enquanto a fonte
        // é observada e o lote administrativo é materializado nesta transação.
        const fresh = await buildPlan(connection, input.estabelecimentoId, true);
        assertReductionSafe(fresh);
        await connection.execute(
          `UPDATE ${LOTES} SET estado = 'falhou', codigo = 'SUBSTITUIDO_POR_CARGA_ADMINISTRATIVA', falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
           WHERE controle_id = ? AND estado = 'completo'`, [control.id]);
        const loteRef = uuid();
        await connection.execute<ResultSetHeader>(
          `INSERT INTO ${LOTES} (controle_id, estabelecimento_id, lote_ref, estado, total_esperado, total_observado, fingerprint_privado, iniciado_em, concluido_em, criado_em, atualizado_em)
           VALUES (?, ?, ?, 'completo', ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
          [control.id, control.estabelecimentoId, loteRef, fresh.contagens.totalFonte, fresh.contagens.totalFonte, fresh.fingerprint]);
      });
      return resumo({ estabelecimentoId: input.estabelecimentoId }, actorId);
    } catch (error) { safeError(error, "A captura administrativa não foi confirmada."); }
  }
  async function prever(raw: HopDiarioEscopo, actorId: number): Promise<HopDiarioPrevia> {
    const input = hopDiarioEscopo.parse(raw); requireActor(actorId);
    try {
      const observed = await observePlan(input.estabelecimentoId);
      assertReductionSafe(observed);
      const claims = await transaction(async connection => {
        const control = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!control) fail("CONFLICT", "Registre ou anuncie uma carga completa antes da prévia.");
        const lote = await latestCompleteLoteLocked(connection, control);
        if (!lote || !lote.fingerprintPrivado) fail("CONFLICT", "Não há lote completo disponível para prévia.");
        const fresh = await buildPlan(connection, input.estabelecimentoId, true);
        if (fresh.fingerprint !== observed.fingerprint || lote.fingerprintPrivado !== fresh.fingerprint || lote.totalObservado !== fresh.contagens.totalFonte) {
          fail("CONFLICT", "O lote ou destino mudou. Gere uma nova prévia.");
        }
        return {
          actorId,
          estabelecimentoId: input.estabelecimentoId,
          loteId: lote.id,
          loteRef: lote.loteRef,
          compromisso: compromissoPrevia(lote, fresh.fingerprint),
          contagens: fresh.contagens,
        };
      });
      const signed = await signPreview(claims);
      return { tokenPrevia: signed.token, expiraEm: signed.expiresAt, loteId: claims.loteId, contagens: claims.contagens };
    } catch (error) { safeError(error, "Prévia não confirmada. Gere uma nova prévia."); }
  }
  async function insertExecution(connection: SqlConnection, control: ControleRow, loteId: number, mode: ModoExecucao, slot: string): Promise<number> {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${EXECUCOES} (controle_id, lote_id, slot, modo, estado, iniciado_em, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, 'reservada', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, [control.id, loteId, slot, mode]);
    const id = Number(result.insertId); if (!Number.isSafeInteger(id) || id <= 0) fail("INTERNAL_SERVER_ERROR", "Reserva de execução não confirmada.");
    return id;
  }
  async function reservePublication(connection: SqlConnection, control: ControleRow, lote: LoteRow, mode: ModoExecucao, slot: string): Promise<{ token: string; executionId: number }> {
    if (control.estado === "incerto" || control.leaseExpirada || control.leaseAtiva || control.execucaoToken) fail("CONFLICT", "Há execução pendente que requer conferência.");
    if (lote.estado !== "completo" || !lote.fingerprintPrivado) fail("CONFLICT", "O lote não está completo para publicação.");
    const token = uuid();
    const executionId = await insertExecution(connection, control, lote.id, mode, slot);
    await updateControl(connection, control,
      "execucao_token = ?, lease_ate = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND), ultimo_slot = ?", [token, slot]);
    return { token, executionId };
  }
  async function markUncertain(control: ControleRow, loteId: number | null, executionId: number | null, code: string): Promise<void> {
    try {
      await transaction(async connection => {
        const current = await fetchControleLocked(connection, control.estabelecimentoId);
        if (!current || current.id !== control.id) return;
        if (current.operacaoToken) await updateControl(connection, current, "estado = 'incerto', execucao_token = NULL, lease_ate = NULL", []);
        if (loteId) await connection.execute(`UPDATE ${LOTES} SET estado = 'incerto', codigo = ?, falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3) WHERE id = ? AND estado <> 'publicado'`, [code, loteId]);
        if (executionId) await connection.execute(`UPDATE ${EXECUCOES} SET estado = 'incerto', codigo = ?, terminado_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3) WHERE id = ?`, [code, executionId]);
      });
    } catch { noSensitiveLog("incerto", code); }
  }
  async function markControlUncertainByUnit(estabelecimentoId: number, code: string): Promise<void> {
    try {
      await transaction(async connection => {
        const current = await fetchControleLocked(connection, estabelecimentoId);
        if (current?.operacaoToken) await updateControl(connection, current, "estado = 'incerto', execucao_token = NULL, lease_ate = NULL", []);
      });
    } catch { noSensitiveLog("reserva-incerta-unidade", code); }
  }
  async function markControlUncertainByTask(taskUid: string, code: string): Promise<void> {
    try {
      await transaction(async connection => {
        const current = await fetchControleByTaskLocked(connection, taskUid);
        if (current?.operacaoToken) await updateControl(connection, current, "estado = 'incerto', execucao_token = NULL, lease_ate = NULL", []);
      });
    } catch { noSensitiveLog("reserva-incerta-task", code); }
  }
  /** Commit ambíguo em sinal do produtor também bloqueia novas mutações. */
  async function markProducerUncertain(token: string, code: string): Promise<void> {
    try {
      await transaction(async connection => {
        const control = await fetchControleByProducerLocked(connection, tokenHash(token));
        if (!control || !control.operacaoToken) return;
        await updateControl(connection, control, "estado = 'incerto', execucao_token = NULL, lease_ate = NULL", []);
      });
    } catch { noSensitiveLog("produtor-incerto", code); }
  }
  /** Não publica, não apaga e não reescreve lote encerrado: só fecha carregando. */
  async function markProducerFailed(control: ControleRow, loteRef: string, code: string): Promise<void> {
    try {
      await transaction(async connection => {
        const current = await fetchControleLocked(connection, control.estabelecimentoId);
        if (!current || current.id !== control.id) return;
        const lote = await fetchLoteLocked(connection, current.id, loteRef);
        if (!lote || lote.estado !== "carregando") return;
        await connection.execute(
          `UPDATE ${LOTES} SET estado = 'falhou', codigo = ?, falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
           WHERE id = ? AND estado = 'carregando'`, [code, lote.id]);
      });
    } catch { noSensitiveLog("produtor-falhou", code); }
  }
  function mappedValue(row: HopMappedRow, key: (typeof CAMPOS_HOP)[number]): unknown { return row[key] ?? null; }
  async function insertMapped(connection: SqlConnection, rows: HopMappedRow[], deadlineAt: number | null): Promise<void> {
    for (let start = 0; start < rows.length; start += TAMANHO_LOTE) {
      assertBeforeDeadline(deadlineAt);
      const batch = rows.slice(start, start + TAMANHO_LOTE);
      const values = batch.map(() => `(${CAMPOS_HOP.map(() => "?").join(",")})`).join(",");
      const params = batch.flatMap(row => CAMPOS_HOP.map(key => mappedValue(row, key)));
      await connection.execute(`INSERT INTO ${DESTINO} (${CAMPOS_HOP.join(",")}) VALUES ${values}`, params);
      assertBeforeDeadline(deadlineAt);
    }
  }
  async function updateMapped(connection: SqlConnection, estabelecimentoId: number, rows: HopMappedRow[], deadlineAt: number | null): Promise<void> {
    const fields = CAMPOS_HOP.filter(key => !["estabelecimentoId", "origemSistema", "origemId"].includes(key));
    const updates = [...fields.map(key => `${key} = VALUES(${key})`), "dataSincronizacao = UTC_TIMESTAMP()"].join(", ");
    for (let start = 0; start < rows.length; start += TAMANHO_LOTE) {
      assertBeforeDeadline(deadlineAt);
      const batch = rows.slice(start, start + TAMANHO_LOTE);
      const values = batch.map(() => `(${CAMPOS_HOP.map(() => "?").join(",")})`).join(",");
      const params = batch.flatMap(row => CAMPOS_HOP.map(key => mappedValue(row, key)));
      // A chave única do destino preserva id, notificações, financeiro e todos os
      // campos fora da lista Hop; ON DUPLICATE atualiza somente a allowlist.
      await connection.execute(
        `INSERT INTO ${DESTINO} (${CAMPOS_HOP.join(",")}) VALUES ${values}
         ON DUPLICATE KEY UPDATE ${updates}`,
        params,
      );
      assertBeforeDeadline(deadlineAt);
    }
  }
  async function inactivateAbsent(connection: SqlConnection, estabelecimentoId: number, ids: number[], deadlineAt: number | null): Promise<void> {
    for (let start = 0; start < ids.length; start += TAMANHO_LOTE) {
      assertBeforeDeadline(deadlineAt);
      const batch = ids.slice(start, start + TAMANHO_LOTE);
      if (!batch.length) continue;
      await connection.execute(
        `UPDATE ${DESTINO} SET ativoNaFonte = 0, dataSincronizacao = UTC_TIMESTAMP()
         WHERE estabelecimentoId = ? AND origemSistema = ? AND ativoNaFonte = 1 AND id IN (${batch.map(() => "?").join(",")})`,
        [estabelecimentoId, ORIGEM, ...batch]);
      assertBeforeDeadline(deadlineAt);
    }
  }
  async function applyPlan(connection: SqlConnection, estabelecimentoId: number, plan: PlanoHop, deadlineAt: number): Promise<void> {
    await insertMapped(connection, plan.novas, deadlineAt);
    await updateMapped(connection, estabelecimentoId, [...plan.atualizadas, ...plan.reativadas], deadlineAt);
    await inactivateAbsent(connection, estabelecimentoId, plan.inativarIds, deadlineAt);
    assertBeforeDeadline(deadlineAt);
  }
  async function publishReserved(params: { control: ControleRow; lote: LoteRow; token: string; executionId: number; observed: PlanoHop; mode: ModoExecucao; deadlineAt: number }): Promise<boolean> {
    return transaction(async connection => {
      const control = await fetchControleLocked(connection, params.control.estabelecimentoId);
      if (!control || control.id !== params.control.id || control.execucaoToken !== params.token || !control.leaseAtiva) fail("CONFLICT", "Reserva de publicação requer conferência.");
      if (params.mode === "cron" && !await cronPrincipalEUnidadeAtivos(connection, control)) {
        if (control.operacaoToken) await updateControl(connection, control, "estado = 'pausado', execucao_token = NULL, lease_ate = NULL, proxima_execucao = NULL", []);
        return false;
      }
      const lote = await fetchLoteByIdLocked(connection, params.lote.id, control.id);
      if (!lote || lote.estado !== "completo" || lote.fingerprintPrivado !== params.observed.fingerprint) fail("CONFLICT", "Lote alterado durante a publicação.");
      const fresh = await buildPlan(connection, control.estabelecimentoId, true);
      if (fresh.fingerprint !== params.observed.fingerprint || fresh.contagens.totalFonte !== params.observed.contagens.totalFonte || lote.fingerprintPrivado !== fresh.fingerprint) {
        fail("CONFLICT", "Fonte ou destino mudou durante a publicação.");
      }
      assertReductionSafe(fresh);
      await applyPlan(connection, control.estabelecimentoId, fresh, params.deadlineAt);
      const [loteUpdate] = await connection.execute<ResultSetHeader>(
        `UPDATE ${LOTES} SET estado = 'publicado', publicado_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
         WHERE id = ? AND estado = 'completo' AND fingerprint_privado = ?`, [lote.id, fresh.fingerprint]);
      if (loteUpdate.affectedRows !== 1) fail("CONFLICT", "Lote alterado durante a publicação.");
      await connection.execute<ResultSetHeader>(
        `UPDATE ${EXECUCOES} SET estado = 'concluida', contagens = ?, terminado_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
        WHERE id = ? AND estado = 'reservada'`, [JSON.stringify(fresh.contagens), params.executionId]);
      await updateControl(connection, control,
        `execucao_token = NULL, lease_ate = NULL, ultima_execucao = UTC_TIMESTAMP(3)${params.mode === "cron" ? ", proxima_execucao = ?" : ""}`,
        params.mode === "cron" ? [nextHopExecutionUtc(now())] : []);
      assertBeforeDeadline(params.deadlineAt);
      return true;
    }, params.deadlineAt);
  }
  async function failReserved(control: ControleRow, loteId: number, executionId: number, token: string, code: string, uncertain = false): Promise<void> {
    try {
      await transaction(async connection => {
        const current = await fetchControleLocked(connection, control.estabelecimentoId);
        if (!current || current.execucaoToken !== token) return;
        await updateControl(connection, current, `estado = '${uncertain ? "incerto" : "erro"}', execucao_token = NULL, lease_ate = NULL`, []);
        await connection.execute(`UPDATE ${LOTES} SET estado = ?, codigo = ?, falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3) WHERE id = ? AND estado = 'completo'`, [uncertain ? "incerto" : "falhou", code, loteId]);
        await connection.execute(`UPDATE ${EXECUCOES} SET estado = ?, codigo = ?, terminado_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3) WHERE id = ? AND estado = 'reservada'`, [uncertain ? "incerto" : "falhou", code, executionId]);
      });
    } catch { noSensitiveLog("falha-reserva", code); }
  }
  async function publicar(raw: unknown, actorId: number): Promise<HopDiarioResumo> {
    const input = hopDiarioConfirmacao.parse(raw); requireActor(actorId);
    const claims = await verifyPreview(input.tokenPrevia, actorId, input);
    let reservation: { control: ControleRow; lote: LoteRow; token: string; executionId: number; observed: PlanoHop } | null = null;
    try {
      const observed = await observePlan(input.estabelecimentoId);
      if (observed.contagens.totalFonte !== claims.contagens.totalFonte) fail("CONFLICT", "A prévia ficou desatualizada. Gere uma nova prévia.");
      reservation = await transaction(async connection => {
        const control = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!control) fail("CONFLICT", "Controle não configurado.");
        assertOwner(control, actorId);
        const lote = await fetchLoteByIdLocked(connection, claims.loteId, control.id);
        if (!lote || lote.loteRef !== claims.loteRef || lote.estado !== "completo" || lote.fingerprintPrivado !== observed.fingerprint ||
          claims.compromisso !== compromissoPrevia(lote, observed.fingerprint)) fail("CONFLICT", "O lote não corresponde à prévia.");
        const reserved = await reservePublication(connection, control, lote, "manual", `manual-${uuid()}`);
        return { control, lote, ...reserved, observed };
      });
      await publishReserved({ ...reservation, mode: "manual", deadlineAt: now().getTime() + LEASE_SECONDS * 1000 });
      noSensitiveLog("publicar", "CONCLUIDA", observed.contagens);
      return resumo({ estabelecimentoId: input.estabelecimentoId }, actorId);
    } catch (error) {
      if (error instanceof CommitUncertainError) {
        if (reservation) await markUncertain(reservation.control, reservation.lote.id, reservation.executionId, "COMMIT_REQUER_CONFERENCIA");
        else await markControlUncertainByUnit(input.estabelecimentoId, "COMMIT_REQUER_CONFERENCIA");
      } else if (reservation) await failReserved(reservation.control, reservation.lote.id, reservation.executionId, reservation.token, "PUBLICACAO_FALHOU");
      safeError(error, "Publicação não confirmada. Confira antes de repetir.");
    }
  }
  async function ativar(raw: unknown, actorId: number, sessionToken: string): Promise<HopDiarioResumo> {
    const input = hopDiarioConfirmacao.parse(raw); requireActor(actorId);
    if (!sessionToken) fail("UNAUTHORIZED", "Sessão administrativa indisponível para ativação.");
    const claims = await verifyPreview(input.tokenPrevia, actorId, input);
    let control: ControleRow | null = null;
    try {
      const observed = await observePlan(input.estabelecimentoId);
      if (observed.contagens.totalFonte !== claims.contagens.totalFonte) fail("CONFLICT", "A prévia ficou desatualizada. Gere uma nova prévia.");
      control = await transaction(async connection => {
        const current = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!current) fail("CONFLICT", "Controle não configurado.");
        assertOwner(current, actorId);
        if (!current.producerTokenHash) fail("CONFLICT", "Gere a credencial do produtor antes da ativação.");
        if (current.estado === "incerto" || current.leaseAtiva || current.leaseExpirada || current.execucaoToken) fail("CONFLICT", "Execução pendente requer conferência antes da ativação.");
        const lote = await fetchLoteByIdLocked(connection, claims.loteId, current.id);
        if (!lote || lote.estado !== "completo" || lote.loteRef !== claims.loteRef || lote.fingerprintPrivado !== observed.fingerprint ||
          claims.compromisso !== compromissoPrevia(lote, observed.fingerprint)) fail("CONFLICT", "Lote não corresponde à prévia de ativação.");
        if (!["pausado", "erro"].includes(current.estado)) fail("CONFLICT", "Somente controle pausado ou com erro pode ser ativado.");
        await updateControl(connection, current, "estado = 'preparando'", []);
        const refreshed = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!refreshed) fail("INTERNAL_SERVER_ERROR", "Controle não confirmado.");
        return refreshed;
      });
      let nextExecutionAt: string | null | undefined;
      let createdTaskUid: string | null = null;
      if (control.taskUid) {
        const updated = await heartbeat.update(control.taskUid, { cron: HOP_DIARIO_CRON, path: "/api/scheduled/atendimentos-hop-diario", method: "POST", payload: {}, description: `Snapshot Hop diário ${control.estabelecimentoId}`, enable: true }, sessionToken);
        nextExecutionAt = updated.nextExecutionAt;
      } else {
        const created = await heartbeat.create({ name: `atendimentos-hop-diario-${control.id}`, cron: HOP_DIARIO_CRON, path: "/api/scheduled/atendimentos-hop-diario", method: "POST", payload: {}, description: `Snapshot Hop diário ${control.estabelecimentoId}` }, sessionToken);
        createdTaskUid = created.taskUid; nextExecutionAt = created.nextExecutionAt;
      }
      await transaction(async connection => {
        const current = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!current || current.id !== control!.id || current.estado !== "preparando") fail("CONFLICT", "Controle alterado durante ativação.");
        await updateControl(connection, current, `estado = 'ativo', ${createdTaskUid ? "task_uid = ?," : ""} proxima_execucao = ?`, createdTaskUid ? [createdTaskUid, utcMysql(nextExecutionAt)] : [utcMysql(nextExecutionAt)]);
      });
      return resumo({ estabelecimentoId: input.estabelecimentoId }, actorId);
    } catch (error) {
      if (control) await markUncertain(control, null, null, "ATIVACAO_REQUER_CONFERENCIA");
      safeError(error, "Ativação não confirmada. Confira antes de repetir.");
    }
  }
  async function pausar(raw: HopDiarioEscopo, actorId: number, sessionToken: string): Promise<HopDiarioResumo> {
    const input = hopDiarioEscopo.parse(raw); requireActor(actorId);
    if (!sessionToken) fail("UNAUTHORIZED", "Sessão administrativa indisponível para pausa.");
    let control: ControleRow | null = null;
    try {
      control = await transaction(async connection => {
        const current = await fetchControleLocked(connection, input.estabelecimentoId);
        if (!current) fail("NOT_FOUND", "Controle não configurado.");
        assertOwner(current, actorId);
        if (current.estado === "incerto" || current.leaseAtiva || current.leaseExpirada || current.execucaoToken) fail("CONFLICT", "Execução pendente requer conferência antes da pausa.");
        if (!current.taskUid) fail("CONFLICT", "Heartbeat requer conferência antes da pausa.");
        if (current.estado !== "pausado") await updateControl(connection, current, "estado = 'pausado', proxima_execucao = NULL", []);
        return current;
      });
      await heartbeat.update(control.taskUid!, { enable: false }, sessionToken);
      return resumo(input, actorId);
    } catch (error) {
      if (control) await markUncertain(control, null, null, "PAUSA_REQUER_CONFERENCIA");
      safeError(error, "Pausa não confirmada. Confira antes de repetir.");
    }
  }
  async function produtorIniciar(rawToken: string, raw: unknown): Promise<ProdutorResultado> {
    const token = String(rawToken ?? "");
    const input = hopDiarioProdutor.pick({ loteRef: true }).parse(raw);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
    try {
      return await transaction(async connection => {
        const control = await fetchControleByProducerLocked(connection, tokenHash(token));
        if (!control) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
        if (control.estado === "incerto" || control.leaseAtiva || control.leaseExpirada || control.execucaoToken) fail("CONFLICT", "Publicação pendente requer conferência.");
        const same = await fetchLoteLocked(connection, control.id, input.loteRef);
        if (same) {
          if (same.estado === "carregando") return { aceito: true, estado: "carregando" };
          fail("CONFLICT", "O lote já foi encerrado e não pode ser reescrito.");
        }
        const current = await fetchLoteLocked(connection, control.id);
        if (current?.estado === "carregando") fail("CONFLICT", "Há lote de outro produtor em carregamento.");
        await connection.execute(
          `UPDATE ${LOTES} SET estado = 'falhou', codigo = 'SUBSTITUIDO_PELO_PRODUTOR', falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
           WHERE controle_id = ? AND estado = 'completo'`, [control.id]);
        await connection.execute(
          `INSERT INTO ${LOTES} (controle_id, estabelecimento_id, lote_ref, estado, iniciado_em, criado_em, atualizado_em)
           VALUES (?, ?, ?, 'carregando', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`, [control.id, control.estabelecimentoId, input.loteRef]);
        return { aceito: true, estado: "carregando" };
      });
    } catch (error) {
      if (error instanceof CommitUncertainError) await markProducerUncertain(token, "INICIO_REQUER_CONFERENCIA");
      safeError(error, "Sinal do produtor não confirmado.");
    }
  }
  async function produtorFalhar(rawToken: string, raw: unknown): Promise<ProdutorResultado> {
    const token = String(rawToken ?? "");
    const input = hopDiarioProdutor.pick({ loteRef: true }).parse(raw);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
    try {
      return await transaction(async connection => {
        const control = await fetchControleByProducerLocked(connection, tokenHash(token));
        if (!control) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
        const lote = await fetchLoteLocked(connection, control.id, input.loteRef);
        if (!lote) fail("NOT_FOUND", "Lote do produtor não encontrado.");
        if (lote.estado === "falhou") return { aceito: true, estado: "falhou" };
        if (lote.estado !== "carregando") fail("CONFLICT", "O lote já foi encerrado e não pode ser alterado.");
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE ${LOTES} SET estado = 'falhou', codigo = 'FALHA_DECLARADA_PELO_PRODUTOR', falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
           WHERE id = ? AND controle_id = ? AND estado = 'carregando'`, [lote.id, control.id]);
        if (result.affectedRows !== 1) fail("CONFLICT", "O lote mudou durante a falha declarada.");
        return { aceito: true, estado: "falhou" };
      });
    } catch (error) {
      if (error instanceof CommitUncertainError) await markProducerUncertain(token, "FALHA_REQUER_CONFERENCIA");
      safeError(error, "Falha do produtor não confirmada.");
    }
  }
  async function produtorConcluir(rawToken: string, raw: unknown): Promise<ProdutorResultado> {
    const token = String(rawToken ?? "");
    const input = hopDiarioProdutor.parse(raw);
    if (!input.totalEsperado) fail("BAD_REQUEST", "totalEsperado é obrigatório para concluir o lote.");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
    let producerControl: ControleRow | null = null;
    let failurePersisted = false;
    try {
      // Observação cooperativa separada antes da transação final. Ela não prova
      // completude por si só; a comparação dentro do lock abaixo ainda é exigida.
      const observed = await transaction(async connection => {
        const control = await fetchControleByProducerLocked(connection, tokenHash(token));
        if (!control) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
        return { control, plan: await buildPlan(connection, control.estabelecimentoId) };
      });
      producerControl = observed.control;
      const result = await transaction(async connection => {
        const control = await fetchControleByProducerLocked(connection, tokenHash(token));
        if (!control) fail("UNAUTHORIZED", "Credencial do produtor inválida.");
        producerControl = control;
        if (control.estado === "incerto" || control.leaseAtiva || control.leaseExpirada || control.execucaoToken) fail("CONFLICT", "Publicação pendente requer conferência.");
        const lote = await fetchLoteLocked(connection, control.id, input.loteRef);
        if (!lote) fail("NOT_FOUND", "Lote do produtor não encontrado.");
        if (lote.estado === "completo" && lote.totalEsperado === input.totalEsperado) {
          return { divergente: false as const, result: { aceito: true as const, estado: "completo" as const } };
        }
        if (lote.estado === "publicado" && lote.totalEsperado === input.totalEsperado) {
          return { divergente: false as const, result: { aceito: true as const, estado: "publicado" as const } };
        }
        if (lote.estado !== "carregando") fail("CONFLICT", "O lote já foi encerrado e não pode ser reescrito.");
        const plan = await buildPlan(connection, control.estabelecimentoId, true);
        if (plan.fingerprint !== observed.plan.fingerprint || plan.contagens.totalFonte !== observed.plan.contagens.totalFonte ||
          plan.contagens.totalFonte !== input.totalEsperado) {
          await connection.execute(`UPDATE ${LOTES} SET estado = 'falhou', codigo = 'CONTAGEM_DIVERGENTE', falhou_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3) WHERE id = ? AND estado = 'carregando'`, [lote.id]);
          // Retornar normalmente faz o commit do estado falhou; o conflito é
          // devolvido somente depois, fora da transação.
          return { divergente: true as const };
        }
        await connection.execute<ResultSetHeader>(
          `UPDATE ${LOTES} SET estado = 'completo', total_esperado = ?, total_observado = ?, fingerprint_privado = ?, concluido_em = UTC_TIMESTAMP(3), atualizado_em = UTC_TIMESTAMP(3)
           WHERE id = ? AND estado = 'carregando'`, [input.totalEsperado, plan.contagens.totalFonte, plan.fingerprint, lote.id]);
        return { divergente: false as const, result: { aceito: true as const, estado: "completo" as const } };
      });
      if (result.divergente) {
        failurePersisted = true;
        fail("CONFLICT", "A contagem do snapshot diverge do lote anunciado.");
      }
      return result.result;
    } catch (error) {
      if (error instanceof CommitUncertainError) await markProducerUncertain(token, "CONCLUSAO_REQUER_CONFERENCIA");
      else if (producerControl && !failurePersisted) await markProducerFailed(producerControl, input.loteRef, "CONCLUSAO_FALHOU");
      safeError(error, "Conclusão do produtor não confirmada.");
    }
  }
  async function slot(nowValue: Date): Promise<string | null> {
    const module = await pure();
    return module.slotHopDiario(nowValue);
  }
  async function cronPrincipalEUnidadeAtivos(connection: SqlConnection, control: ControleRow): Promise<boolean> {
    const [[users], [units]] = await Promise.all([
      connection.execute<SqlRow[]>("SELECT id FROM users WHERE id = ? AND role = 'admin' FOR UPDATE", [control.criadoPor]),
      connection.execute<SqlRow[]>("SELECT id FROM estabelecimentos WHERE id = ? AND ativo = 'sim' FOR UPDATE", [control.estabelecimentoId]),
    ]);
    return users.length === 1 && units.length === 1;
  }
  async function executarPorTaskUid(taskUid: string, clock = now()): Promise<CallbackResultado> {
    if (typeof taskUid !== "string" || taskUid.length < 1 || taskUid.length > 65) return { status: "bloqueado" };
    let reservation: { control: ControleRow; lote: LoteRow; token: string; executionId: number; observed: PlanoHop } | null = null;
    try {
      const currentSlot = await slot(clock);
      if (!currentSlot) return { status: "ignorado" };
      reservation = await transaction(async connection => {
        const control = await fetchControleByTaskLocked(connection, taskUid);
        if (!control || control.estado !== "ativo") return null;
        if (!await cronPrincipalEUnidadeAtivos(connection, control)) {
          if (control.operacaoToken) await updateControl(connection, control, "estado = 'pausado', execucao_token = NULL, lease_ate = NULL, proxima_execucao = NULL", []);
          return null;
        }
        if (control.leaseExpirada || control.execucaoToken) {
          if (control.operacaoToken) await updateControl(connection, control, "estado = 'incerto', execucao_token = NULL, lease_ate = NULL", []);
          return null;
        }
        if (control.ultimoSlot === currentSlot || control.leaseAtiva) return null;
        const lote = await latestCompleteLoteLocked(connection, control);
        if (!lote) return null;
        const observed = await observePlan(control.estabelecimentoId);
        if (observed.fingerprint !== lote.fingerprintPrivado) return null;
        const reserved = await reservePublication(connection, control, lote, "cron", currentSlot);
        return { control, lote, ...reserved, observed };
      });
    } catch (error) {
      if (error instanceof CommitUncertainError) {
        if (reservation) await markUncertain(reservation.control, reservation.lote.id, reservation.executionId, "RESERVA_REQUER_CONFERENCIA");
        else await markControlUncertainByTask(taskUid, "RESERVA_REQUER_CONFERENCIA");
      } else throw error;
      return { status: "incerto" };
    }
    if (!reservation) return { status: "ignorado" };
    try {
      const published = await publishReserved({ ...reservation, mode: "cron", deadlineAt: now().getTime() + LEASE_SECONDS * 1000 });
      if (!published) return { status: "ignorado" };
      noSensitiveLog("cron", "CONCLUIDA", reservation.observed.contagens);
      return { status: "executado" };
    } catch (error) {
      if (error instanceof CommitUncertainError) await markUncertain(reservation.control, reservation.lote.id, reservation.executionId, "COMMIT_REQUER_CONFERENCIA");
      else await failReserved(reservation.control, reservation.lote.id, reservation.executionId, reservation.token, "EXECUCAO_FALHOU");
      return { status: error instanceof CommitUncertainError ? "incerto" : "falhou" };
    }
  }

  return { resumo, confirmarCarga, gerarCredencial, prever, publicar, ativar, pausar, produtorIniciar, produtorFalhar, produtorConcluir, executarPorTaskUid };
}

const defaultService = criarAtendimentosHopDiarioService();
export const resumoAtendimentosHopDiario = defaultService.resumo;
export const confirmarCargaAtendimentosHopDiario = defaultService.confirmarCarga;
export const gerarCredencialAtendimentosHopDiario = defaultService.gerarCredencial;
export const preverAtendimentosHopDiario = defaultService.prever;
export const publicarAtendimentosHopDiario = defaultService.publicar;
export const ativarAtendimentosHopDiario = defaultService.ativar;
export const pausarAtendimentosHopDiario = defaultService.pausar;
export const iniciarLoteAtendimentosHopProdutor = defaultService.produtorIniciar;
export const falharLoteAtendimentosHopProdutor = defaultService.produtorFalhar;
export const concluirLoteAtendimentosHopProdutor = defaultService.produtorConcluir;
export const executarAtendimentosHopDiarioPorTaskUid = defaultService.executarPorTaskUid;

export const __atendimentosHopDiarioInternals = { sourceSql, sourceScopeSql, destinationSql, tokenHash, CAMPOS_HOP, LIMITE_SNAPSHOT, nextHopExecutionUtc };
