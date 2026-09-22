import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import ExcelJSImport from "exceljs";
import Decimal from "decimal.js";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";

const ExcelJS = ExcelJSImport as unknown as typeof import("exceljs");

export const WARLEINE_XLSX_HEADERS = [
  "nomeconv", "codconv", "mesprod", "numfatura", "codrecur", "tipoproc",
  "protocolo", "numconta", "guiacobra", "aihguia", "descricao", "matricula",
  "data", "dataint", "datasai", "procdisco", "codproprio", "codgrufi",
  "descricao", "funcaotiss", "receber", "codcc", "nomecc", "prestexe",
  "nomeprest", "quantidade", "vl_faturado", "vl_recebido", "vl_receb_a_maior",
  "vl_total_recebido", "vl_aberto", "vl_glosas", "gl_recurso", "gl_aceita",
  "gl_analise", "gl_recuperada", "codtiss", "descmotivo", "codrecur",
  "complrecur", "tipoatend", "codope", "nomeope", "data_fechou", "data_receb",
  "data_associdado_ware", "nomeplaco", "vl_unitario",
] as const;

export type WarleineCanonicalRow = {
  convenioFaturadoNome: string;
  convenioFaturadoCodigo: string;
  competencia: string;
  remessaFaturamento: string;
  codigoRecursoOrigem1: string;
  tipoItem: string;
  protocoloConvenio: string;
  numeroConta: string;
  guiaOperadora: string;
  guiaPrestador: string;
  pacienteNome: string;
  carteiraBeneficiario: string;
  dataAberturaConta: string | null;
  dataEntrada: string | null;
  dataAlta: string | null;
  codigoTuss: string;
  codigoItemInterno: string;
  codigoTipoServico: string;
  servicoNome: string;
  funcaoTiss: string;
  recebimentoViaHospital: string;
  setorCodigo: string;
  setorNome: string;
  prestadorExecutanteCodigo: string;
  prestadorExecutanteNome: string;
  quantidade: string;
  valorFaturado: string;
  valorRecebido: string;
  valorRecebidoMaior: string;
  valorTotalRecebido: string;
  valorAberto: string;
  valorGlosa: string;
  valorRecursado: string;
  valorGlosaAceita: string;
  valorGlosaAnalise: string;
  valorGlosaRecuperada: string;
  codigoGlosa: string;
  motivoGlosa: string;
  codigoMotivoInterno: string;
  observacaoGlosa: string;
  tipoAtendimento: string;
  operadorCodigo: string;
  operadorNome: string;
  dataFechamentoRemessa: string | null;
  dataPagamento: string | null;
  dataAssociacaoWarleine: string | null;
  convenioPagadorNome: string;
  valorUnitario: string;
  origemRegistroId: string | null;
  origemAtualizadoEm: string | null;
  chaveNegocioHash: string;
  linhaHash: string;
};

export type WarleineImportOptions = {
  filePath: string;
  fileName: string;
  estabelecimentoId: number;
  userId: number;
  configId?: number | null;
  publish?: boolean;
  replaceCompetencies?: boolean;
  deadlineAtMs?: number;
  claimToken: string;
  onProgress?: (progress: WarleineImportProgress) => void;
};

export type WarleineImportProgress = {
  phase: "hash" | "staging" | "publishing" | "completed";
  processedRows: number;
  validRows: number;
  warningRows: number;
  rejectedRows: number;
};

export type WarleineImportResult = WarleineImportProgress & {
  loteId: number;
  fileHash: string;
  publishedRows: number;
  reusedExistingLot: boolean;
  competencies: string[];
};

type ParsedWarleineRow = {
  canonical: WarleineCanonicalRow | null;
  errors: string[];
  warnings: string[];
  raw: Record<string, unknown>;
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

export function normalizeWarleineHeader(value: unknown): string {
  return clean(value).toLocaleLowerCase("pt-BR");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function hashWarleineFile(filePath: string): Promise<string> {
  return hashFile(filePath);
}

export async function reserveWarleineImportJob(input: {
  estabelecimentoId: number;
  userId: number;
  configId?: number | null;
  fileName: string;
  fileHash: string;
  fileSize: number;
  storageKey: string;
}): Promise<{ loteId: number; reusedExistingLot: boolean; status: string }> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [establishmentRows] = await connection.query<RowDataPacket[]>("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE", [input.estabelecimentoId]);
    if (!establishmentRows[0]) throw new Error("Estabelecimento não encontrado.");
    const [existingRows] = await connection.query<RowDataPacket[]>("SELECT id,status,claimToken,leaseExpiresAt FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND arquivoHash=? LIMIT 1 FOR UPDATE", [input.estabelecimentoId, input.fileHash]);
    const existing = existingRows[0];
    if (existing?.status === "publicado") {
      await connection.execute("UPDATE warleine_faturamento_lotes SET arquivoStorageKey=?, arquivoNome=?, arquivoTamanho=?, atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=?", [input.storageKey, input.fileName, input.fileSize, existing.id, input.estabelecimentoId]);
      await connection.commit();
      return { loteId: Number(existing.id), reusedExistingLot: true, status: "publicado" };
    }
    const leaseActive = existing?.leaseExpiresAt && new Date(existing.leaseExpiresAt).getTime() > Date.now();
    if (["processando", "reservado", "validado"].includes(String(existing?.status)) && (leaseActive || Boolean(existing?.claimToken))) {
      await connection.commit();
      return { loteId: Number(existing.id), reusedExistingLot: true, status: String(existing.status) };
    }
    if (existing) {
      await connection.execute("UPDATE warleine_faturamento_lotes SET configId=?, arquivoNome=?, arquivoTamanho=?, arquivoStorageKey=?, status='enfileirado', tentativas=0, criadoPor=?, erroResumo=NULL, claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL, atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=?", [input.configId || null, input.fileName, input.fileSize, input.storageKey, input.userId, existing.id, input.estabelecimentoId]);
      await connection.commit();
      return { loteId: Number(existing.id), reusedExistingLot: true, status: "enfileirado" };
    }
    const [insertResult] = await connection.execute("INSERT INTO warleine_faturamento_lotes (estabelecimentoId,configId,origem,arquivoNome,arquivoHash,arquivoTamanho,arquivoStorageKey,status,tentativas,criadoPor) VALUES (?,?,?,?,?,?,?,'enfileirado',0,?)", [input.estabelecimentoId, input.configId || null, "arquivo", input.fileName, input.fileHash, input.fileSize, input.storageKey, input.userId]);
    const loteId = Number((insertResult as { insertId?: number }).insertId || 0);
    await connection.commit();
    return { loteId, reusedExistingLot: false, status: "enfileirado" };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

function cellValueToPrimitive(value: unknown): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  const cell = value as { result?: unknown; text?: unknown; richText?: Array<{ text?: string }> };
  if (cell.result !== undefined) return cell.result;
  if (cell.text !== undefined) return cell.text;
  if (Array.isArray(cell.richText)) return cell.richText.map((item) => item.text || "").join("");
  return String(value);
}

function valueText(value: unknown): string {
  const primitive = cellValueToPrimitive(value);
  if (primitive instanceof Date) return formatCivilDate(primitive) || "";
  return clean(primitive);
}

function formatCivilDate(value: Date): string | null {
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  if (year < 1900 || year > 2200) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWarleineCivilDate(value: unknown): string | null {
  const primitive = cellValueToPrimitive(value);
  if (primitive instanceof Date) return formatCivilDate(primitive);
  if (typeof primitive === "number" && Number.isFinite(primitive)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return formatCivilDate(new Date(excelEpoch + Math.round(primitive) * 86_400_000));
  }
  const raw = clean(primitive);
  if (!raw) return null;
  let year = 0;
  let month = 0;
  let day = 0;
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})/);
    if (!match) return null;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return formatCivilDate(date);
}

export function normalizeWarleineCompetencia(value: unknown): string | null {
  const raw = valueText(value);
  const match = raw.match(/^(\d{4})[/-](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12) return null;
  return `${year}/${String(month).padStart(2, "0")}`;
}

export function parseWarleineDecimal(value: unknown): string | null {
  const primitive = cellValueToPrimitive(value);
  if (typeof primitive === "number") {
    if (!Number.isFinite(primitive)) return null;
    return new Decimal(String(primitive)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  }
  let raw = clean(primitive);
  if (!raw) return "0.0000";
  raw = raw.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  try {
    return new Decimal(raw).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  } catch {
    return null;
  }
}

function decimalValue(value: string): Decimal {
  return new Decimal(value || 0);
}

function safeRawValue(value: unknown): unknown {
  const primitive = cellValueToPrimitive(value);
  if (primitive instanceof Date) return formatCivilDate(primitive);
  if (typeof primitive === "string" || typeof primitive === "number" || typeof primitive === "boolean" || primitive === null) return primitive;
  return clean(primitive);
}

export function isWarleineSnapshotCoverageSafe(activeRows: Decimal.Value, incomingRows: Decimal.Value, minimumCoverage: Decimal.Value = "0.995"): boolean {
  const active = new Decimal(activeRows || 0);
  if (active.lessThanOrEqualTo(0)) return true;
  return new Decimal(incomingRows || 0).dividedBy(active).greaterThanOrEqualTo(minimumCoverage);
}

export function parseWarleineRow(values: unknown[]): ParsedWarleineRow {
  const raw: Record<string, unknown> = {};
  WARLEINE_XLSX_HEADERS.forEach((header, index) => {
    const occurrence = WARLEINE_XLSX_HEADERS.slice(0, index + 1).filter((item) => item === header).length;
    raw[occurrence > 1 ? `${header}_${occurrence}` : header] = safeRawValue(values[index]);
  });
  const extraValues = values.slice(WARLEINE_XLSX_HEADERS.length).filter((value) => valueText(value) !== "");
  const errors: string[] = [];
  const warnings: string[] = [];
  if (extraValues.length) errors.push("COLUNAS_EXCEDENTES");

  const competencia = normalizeWarleineCompetencia(values[2]);
  const numeroConta = valueText(values[7]);
  const recebimentoViaHospital = valueText(values[20]).toUpperCase();
  if (!competencia) errors.push("COMPETENCIA_INVALIDA");
  if (!numeroConta) errors.push("NUMERO_CONTA_AUSENTE");
  if (!new Set(["S", "N"]).has(recebimentoViaHospital)) errors.push("MODALIDADE_RECEBIMENTO_INVALIDA");

  const decimalIndexes = [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 47];
  const decimals = decimalIndexes.map((index) => parseWarleineDecimal(values[index]));
  if (decimals.some((value) => value === null)) errors.push("VALOR_NUMERICO_INVALIDO");
  if (errors.length || !competencia || decimals.some((value) => value === null)) {
    return { canonical: null, errors: [...new Set(errors)], warnings, raw };
  }

  const [quantidade, valorFaturado, valorRecebido, valorRecebidoMaior, valorTotalRecebido, valorAberto,
    valorGlosa, valorRecursado, valorGlosaAceita, valorGlosaAnalise, valorGlosaRecuperada, valorUnitario] = decimals as string[];
  const expectedReceived = decimalValue(valorRecebido).plus(valorRecebidoMaior).plus(valorGlosaRecuperada);
  if (decimalValue(valorTotalRecebido).minus(expectedReceived).abs().greaterThan("0.01")) warnings.push("TOTAL_RECEBIDO_DIVERGENTE");
  const expectedGlosa = decimalValue(valorRecursado).plus(valorGlosaAceita).plus(valorGlosaAnalise).plus(valorGlosaRecuperada);
  if (decimalValue(valorGlosa).minus(expectedGlosa).abs().greaterThan("0.01")) warnings.push("COMPOSICAO_GLOSA_DIVERGENTE");
  if (valueText(values[4]) !== valueText(values[38])) warnings.push("CODIGO_RECURSO_DIVERGENTE");

  const canonicalBase = {
    convenioFaturadoNome: valueText(values[0]), convenioFaturadoCodigo: valueText(values[1]), competencia,
    remessaFaturamento: valueText(values[3]), codigoRecursoOrigem1: valueText(values[4]), tipoItem: valueText(values[5]),
    protocoloConvenio: valueText(values[6]), numeroConta, guiaOperadora: valueText(values[8]), guiaPrestador: valueText(values[9]),
    pacienteNome: valueText(values[10]), carteiraBeneficiario: valueText(values[11]), dataAberturaConta: parseWarleineCivilDate(values[12]),
    dataEntrada: parseWarleineCivilDate(values[13]), dataAlta: parseWarleineCivilDate(values[14]), codigoTuss: valueText(values[15]),
    codigoItemInterno: valueText(values[16]), codigoTipoServico: valueText(values[17]), servicoNome: valueText(values[18]),
    funcaoTiss: valueText(values[19]), recebimentoViaHospital, setorCodigo: valueText(values[21]), setorNome: valueText(values[22]),
    prestadorExecutanteCodigo: valueText(values[23]), prestadorExecutanteNome: valueText(values[24]), quantidade,
    valorFaturado, valorRecebido, valorRecebidoMaior, valorTotalRecebido, valorAberto, valorGlosa, valorRecursado,
    valorGlosaAceita, valorGlosaAnalise, valorGlosaRecuperada, codigoGlosa: valueText(values[36]), motivoGlosa: valueText(values[37]),
    codigoMotivoInterno: valueText(values[38]), observacaoGlosa: valueText(values[39]), tipoAtendimento: valueText(values[40]),
    operadorCodigo: valueText(values[41]), operadorNome: valueText(values[42]), dataFechamentoRemessa: parseWarleineCivilDate(values[43]),
    dataPagamento: parseWarleineCivilDate(values[44]), dataAssociacaoWarleine: parseWarleineCivilDate(values[45]),
    convenioPagadorNome: valueText(values[46]), valorUnitario, origemRegistroId: null, origemAtualizadoEm: null,
  };
  const businessKey = [competencia, numeroConta, canonicalBase.guiaOperadora, canonicalBase.guiaPrestador,
    canonicalBase.codigoTuss, canonicalBase.codigoItemInterno, canonicalBase.dataAberturaConta,
    canonicalBase.prestadorExecutanteCodigo, quantidade, valorFaturado, valorUnitario].join("|");
  const linePayload = JSON.stringify(canonicalBase);
  return {
    canonical: { ...canonicalBase, chaveNegocioHash: hashText(businessKey), linhaHash: hashText(linePayload) },
    errors: [], warnings: [...new Set(warnings)], raw,
  };
}

function placeholders(rows: number, columns: number): string {
  return Array.from({ length: rows }, () => `(${Array(columns).fill("?").join(",")})`).join(",");
}

export function assertWarleineDeadline(deadlineAtMs?: number) {
  if (deadlineAtMs && Date.now() >= deadlineAtMs) {
    throw new Error("Tempo seguro de processamento esgotado. O lote foi preservado para nova tentativa auditável.");
  }
}

async function renewWarleineLease(connection: PoolConnection, loteId: number, estabelecimentoId: number, claimToken: string) {
  const [result] = await connection.execute<any>(`
    UPDATE warleine_faturamento_lotes
    SET leaseExpiresAt=DATE_ADD(NOW(), INTERVAL 20 MINUTE), atualizadoEm=NOW()
    WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW() AND status IN ('reservado','processando','validado')
  `, [loteId, estabelecimentoId, claimToken]);
  if (Number(result.affectedRows || 0) !== 1) throw new Error("O lease do job Warleine foi perdido para outro worker.");
}

async function withWarleineLeaseFence<T>(
  connection: PoolConnection,
  loteId: number,
  estabelecimentoId: number,
  claimToken: string,
  action: () => Promise<T>,
): Promise<T> {
  await connection.beginTransaction();
  try {
    await renewWarleineLease(connection, loteId, estabelecimentoId, claimToken);
    const result = await action();
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  }
}

async function insertStageBatch(connection: PoolConnection, rows: Array<{ loteId: number; estabelecimentoId: number; configId: number | null; line: number; status: string; warning: string | null; raw: Record<string, unknown> }>) {
  if (!rows.length) return;
  const columns = ["loteId", "estabelecimentoId", "configId", "numeroLinha", "status", "avisoCodigo", "dadosBrutos"];
  const params = rows.flatMap((row) => [row.loteId, row.estabelecimentoId, row.configId, row.line, row.status, row.warning, JSON.stringify(row.raw)]);
  await connection.execute(`INSERT INTO warleine_faturamento_staging (${columns.join(",")}) VALUES ${placeholders(rows.length, columns.length)}`, params);
}

async function insertQuarantineBatch(connection: PoolConnection, rows: Array<{ loteId: number; estabelecimentoId: number; line: number; code: string; detail: string; raw: Record<string, unknown> }>) {
  if (!rows.length) return;
  const columns = ["loteId", "estabelecimentoId", "numeroLinha", "erroCodigo", "erroDetalhe", "dadosBrutos"];
  const params = rows.flatMap((row) => [row.loteId, row.estabelecimentoId, row.line, row.code, row.detail, JSON.stringify(row.raw)]);
  await connection.execute(`INSERT INTO warleine_faturamento_quarentena (${columns.join(",")}) VALUES ${placeholders(rows.length, columns.length)}`, params);
}

async function persistWarleineStageBatch(
  connection: PoolConnection,
  loteId: number,
  estabelecimentoId: number,
  claimToken: string,
  stageRows: Array<{ loteId: number; estabelecimentoId: number; configId: number | null; line: number; status: string; warning: string | null; raw: Record<string, unknown> }>,
  quarantineRows: Array<{ loteId: number; estabelecimentoId: number; line: number; code: string; detail: string; raw: Record<string, unknown> }>,
) {
  await withWarleineLeaseFence(connection, loteId, estabelecimentoId, claimToken, async () => {
    await insertStageBatch(connection, stageRows);
    await insertQuarantineBatch(connection, quarantineRows);
  });
}

const FINAL_COLUMNS = [
  "loteId", "estabelecimentoId", "numeroLinha", "origemRegistroId", "origemAtualizadoEm", "chaveNegocioHash", "linhaHash", "ativoParaRelatorio",
  "convenioFaturadoNome", "convenioFaturadoCodigo", "competencia", "remessaFaturamento", "codigoRecursoOrigem1", "tipoItem", "protocoloConvenio",
  "numeroConta", "guiaOperadora", "guiaPrestador", "pacienteNome", "carteiraBeneficiario", "dataAberturaConta", "dataEntrada", "dataAlta", "codigoTuss",
  "codigoItemInterno", "codigoTipoServico", "servicoNome", "funcaoTiss", "recebimentoViaHospital", "setorCodigo", "setorNome",
  "prestadorExecutanteCodigo", "prestadorExecutanteNome", "quantidade", "valorFaturado", "valorRecebido", "valorRecebidoMaior", "valorTotalRecebido",
  "valorAberto", "valorGlosa", "valorRecursado", "valorGlosaAceita", "valorGlosaAnalise", "valorGlosaRecuperada", "codigoGlosa", "motivoGlosa",
  "codigoMotivoInterno", "observacaoGlosa", "tipoAtendimento", "operadorCodigo", "operadorNome", "dataFechamentoRemessa", "dataPagamento",
  "dataAssociacaoWarleine", "convenioPagadorNome", "valorUnitario",
] as const;

const MATERIALIZE_UPDATE_SQL = FINAL_COLUMNS
  .filter((column) => !["loteId", "estabelecimentoId", "numeroLinha", "ativoParaRelatorio"].includes(column))
  .map((column) => `${column}=VALUES(${column})`)
  .join(",");

function canonicalParams(loteId: number, estabelecimentoId: number, line: number, row: WarleineCanonicalRow): unknown[] {
  return [loteId, estabelecimentoId, line, row.origemRegistroId, row.origemAtualizadoEm, row.chaveNegocioHash, row.linhaHash, false,
    row.convenioFaturadoNome, row.convenioFaturadoCodigo, row.competencia, row.remessaFaturamento, row.codigoRecursoOrigem1, row.tipoItem,
    row.protocoloConvenio, row.numeroConta, row.guiaOperadora, row.guiaPrestador, row.pacienteNome, row.carteiraBeneficiario, row.dataAberturaConta,
    row.dataEntrada, row.dataAlta, row.codigoTuss, row.codigoItemInterno, row.codigoTipoServico, row.servicoNome, row.funcaoTiss,
    row.recebimentoViaHospital, row.setorCodigo, row.setorNome, row.prestadorExecutanteCodigo, row.prestadorExecutanteNome, row.quantidade,
    row.valorFaturado, row.valorRecebido, row.valorRecebidoMaior, row.valorTotalRecebido, row.valorAberto, row.valorGlosa, row.valorRecursado,
    row.valorGlosaAceita, row.valorGlosaAnalise, row.valorGlosaRecuperada, row.codigoGlosa, row.motivoGlosa, row.codigoMotivoInterno,
    row.observacaoGlosa, row.tipoAtendimento, row.operadorCodigo, row.operadorNome, row.dataFechamentoRemessa, row.dataPagamento,
    row.dataAssociacaoWarleine, row.convenioPagadorNome, row.valorUnitario];
}

async function materializePublishedItems(connection: PoolConnection, loteId: number, estabelecimentoId: number, fileHash: string, deadlineAtMs: number | undefined, claimToken: string) {
  await withWarleineLeaseFence(connection, loteId, estabelecimentoId, claimToken, async () => {
    await connection.execute("DELETE FROM warleine_faturamento_itens WHERE loteId=? AND estabelecimentoId=? AND ativoParaRelatorio=0", [loteId, estabelecimentoId]);
  });
  let cursor = 0;
  const batchSize = 500;
  while (true) {
    assertWarleineDeadline(deadlineAtMs);
    const [rows] = await connection.query<RowDataPacket[]>(`
      SELECT id, numeroLinha, dadosBrutos
      FROM warleine_faturamento_staging
      WHERE loteId=? AND estabelecimentoId=? AND status IN ('valido','aviso') AND id>?
      ORDER BY id LIMIT ?
    `, [loteId, estabelecimentoId, cursor, batchSize]);
    if (!rows.length) break;
    const parsedRows = rows.map((stage) => {
      const line = Number(stage.numeroLinha);
      const row = stage.dadosBrutos as WarleineCanonicalRow;
      return { line, row: { ...row, origemRegistroId: `${fileHash}:${line}` } };
    });
    const params = parsedRows.flatMap((item) => canonicalParams(loteId, estabelecimentoId, item.line, item.row));
    await withWarleineLeaseFence(connection, loteId, estabelecimentoId, claimToken, async () => {
      await connection.execute(`INSERT INTO warleine_faturamento_itens (${FINAL_COLUMNS.join(",")}) VALUES ${placeholders(parsedRows.length, FINAL_COLUMNS.length)} ON DUPLICATE KEY UPDATE ${MATERIALIZE_UPDATE_SQL}`, params);
    });
    cursor = Number(rows.at(-1)?.id || cursor);
  }
}

async function publishWarleineLot(connection: PoolConnection, loteId: number, estabelecimentoId: number, deadlineAtMs: number | undefined, claimToken: string) {
  assertWarleineDeadline(deadlineAtMs);
  await renewWarleineLease(connection, loteId, estabelecimentoId, claimToken);
  const [identityRows] = await connection.query<RowDataPacket[]>("SELECT arquivoHash FROM warleine_faturamento_lotes WHERE id=? AND estabelecimentoId=? LIMIT 1", [loteId, estabelecimentoId]);
  const fileHash = String(identityRows[0]?.arquivoHash || "");
  if (!fileHash) throw new Error("Lote Warleine sem hash de arquivo para identificar as ocorrências.");
  await materializePublishedItems(connection, loteId, estabelecimentoId, fileHash, deadlineAtMs, claimToken);
  assertWarleineDeadline(deadlineAtMs);
  await connection.beginTransaction();
  try {
    const [establishmentRows] = await connection.query<RowDataPacket[]>("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE", [estabelecimentoId]);
    if (!establishmentRows[0]) throw new Error("Estabelecimento não encontrado para publicar o faturamento Warleine.");
    const [lotRows] = await connection.query<RowDataPacket[]>("SELECT status, competencias, claimToken, leaseExpiresAt>NOW() AS leaseAtivo, reducaoAprovadaEm FROM warleine_faturamento_lotes WHERE id=? AND estabelecimentoId=? FOR UPDATE", [loteId, estabelecimentoId]);
    if (!lotRows[0]) throw new Error("Lote Warleine não encontrado para a unidade selecionada.");
    if (String(lotRows[0].claimToken || "") !== claimToken || !lotRows[0].leaseAtivo) throw new Error("O lease do job Warleine foi perdido antes da publicação.");
    const competencies = Array.isArray(lotRows[0].competencias) ? lotRows[0].competencias.map(String) : JSON.parse(String(lotRows[0].competencias || "[]"));
    for (const competencia of competencies) {
      assertWarleineDeadline(deadlineAtMs);
      const [incomingRows] = await connection.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total,
          COALESCE(SUM(i.valorFaturado),0) AS faturado,
          COALESCE(SUM(i.valorTotalRecebido),0) AS recebido,
          COALESCE(SUM(i.valorAberto),0) AS aberto,
          COALESCE(SUM(i.valorGlosa),0) AS glosa
        FROM warleine_faturamento_itens i
        WHERE i.loteId=? AND i.estabelecimentoId=? AND i.competencia=?
      `, [loteId, estabelecimentoId, competencia]);
      const [activeRows] = await connection.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total,
          COALESCE(SUM(valorFaturado),0) AS faturado,
          COALESCE(SUM(valorTotalRecebido),0) AS recebido,
          COALESCE(SUM(valorAberto),0) AS aberto,
          COALESCE(SUM(valorGlosa),0) AS glosa
        FROM warleine_faturamento_itens_ativos
        WHERE estabelecimentoId=? AND competencia=?
      `, [estabelecimentoId, competencia]);
      const incoming = Number(incomingRows[0]?.total || 0);
      const active = Number(activeRows[0]?.total || 0);
      const dimensions = ["faturado", "recebido", "aberto", "glosa"] as const;
      const unsafeDimensions = dimensions.filter((dimension) => !isWarleineSnapshotCoverageSafe(String(activeRows[0]?.[dimension] || 0), String(incomingRows[0]?.[dimension] || 0)));
      if ((!isWarleineSnapshotCoverageSafe(active, incoming) || unsafeDimensions.length > 0) && !lotRows[0].reducaoAprovadaEm) {
        throw new Error(`SNAPSHOT_REDUZIDO: a competência ${competencia} não cobre 99,5% do snapshot ativo em ${[!isWarleineSnapshotCoverageSafe(active, incoming) ? "quantidade" : null, ...unsafeDimensions].filter(Boolean).join(", ")}. Exige aprovação administrativa auditável.`);
      }
    }
    for (const competencia of competencies) {
      const [snapshotResult] = await connection.execute<any>(`
        INSERT INTO warleine_faturamento_snapshots_ativos
          (estabelecimentoId,competencia,loteId,ativadoEm)
        VALUES (?,?,?,NOW())
        ON DUPLICATE KEY UPDATE loteId=VALUES(loteId),ativadoEm=NOW()
      `, [estabelecimentoId, competencia, loteId]);
      if (Number(snapshotResult.affectedRows || 0) < 1) throw new Error(`Não foi possível ativar o snapshot Warleine da competência ${competencia}.`);
    }
    const [totals] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(valorFaturado),0) AS faturado, COALESCE(SUM(valorRecebido),0) AS recebido,
        COALESCE(SUM(valorTotalRecebido),0) AS totalRecebido, COALESCE(SUM(valorAberto),0) AS aberto,
        COALESCE(SUM(valorGlosa),0) AS glosa
      FROM warleine_faturamento_itens WHERE loteId=? AND estabelecimentoId=?
    `, [loteId, estabelecimentoId]);
    const total = Number(totals[0]?.total || 0);
    const [publishResult] = await connection.execute<any>(`UPDATE warleine_faturamento_lotes SET status='publicado', totalPublicadas=?, valorFaturado=?, valorRecebido=?, valorTotalRecebido=?, valorAberto=?, valorGlosa=?, publicadoEm=NOW(), erroResumo=NULL, claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()`, [total, String(totals[0]?.faturado || 0), String(totals[0]?.recebido || 0), String(totals[0]?.totalRecebido || 0), String(totals[0]?.aberto || 0), String(totals[0]?.glosa || 0), loteId, estabelecimentoId, claimToken]);
    if (Number(publishResult.affectedRows || 0) !== 1) throw new Error("O lease do job Warleine foi perdido durante a publicação.");
    await connection.commit();
    return total;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function importWarleineFaturamentoFile(options: WarleineImportOptions): Promise<WarleineImportResult> {
  if (!Number.isInteger(options.estabelecimentoId) || options.estabelecimentoId <= 0) throw new Error("Estabelecimento inválido.");
  if (!Number.isInteger(options.userId) || options.userId <= 0) throw new Error("Usuário inválido.");
  if (!options.claimToken?.trim()) throw new Error("O importador Warleine exige claimToken emitido pelo worker persistente.");
  await fs.access(options.filePath);
  assertWarleineDeadline(options.deadlineAtMs);
  const progress: WarleineImportProgress = { phase: "hash", processedRows: 0, validRows: 0, warningRows: 0, rejectedRows: 0 };
  options.onProgress?.(progress);
  const fileHash = await hashFile(options.filePath);
  assertWarleineDeadline(options.deadlineAtMs);
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const connection = await pool.getConnection();
  let loteId = 0;
  try {
    await connection.beginTransaction();
    const [establishmentRows] = await connection.query<RowDataPacket[]>("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE", [options.estabelecimentoId]);
    if (!establishmentRows[0]) throw new Error("Estabelecimento não encontrado para a importação Warleine.");
    if (options.configId) {
      const [configRows] = await connection.query<RowDataPacket[]>("SELECT id FROM query_configuracoes WHERE id=? AND estabelecimentoId=? LIMIT 1", [options.configId, options.estabelecimentoId]);
      if (!configRows[0]) throw new Error("Configuração Warleine não pertence ao estabelecimento selecionado.");
    }
    const [existingRows] = await connection.query<RowDataPacket[]>("SELECT *, leaseExpiresAt>NOW() AS leaseAtivoDb FROM warleine_faturamento_lotes WHERE estabelecimentoId=? AND arquivoHash=? LIMIT 1 FOR UPDATE", [options.estabelecimentoId, fileHash]);
    const existing = existingRows[0];
    if (existing?.status === "publicado") {
      await connection.commit();
      return { loteId: Number(existing.id), fileHash, phase: "completed", processedRows: Number(existing.totalLinhas || 0), validRows: Number(existing.totalValidas || 0), warningRows: Number(existing.totalAvisos || 0), rejectedRows: Number(existing.totalRejeitadas || 0), publishedRows: Number(existing.totalPublicadas || 0), reusedExistingLot: true, competencies: Array.isArray(existing.competencias) ? existing.competencias.map(String) : JSON.parse(String(existing.competencias || "[]")) };
    }
    if (!existing) {
      await connection.rollback();
      throw new Error("O arquivo Warleine deve ser reservado na fila persistente antes do processamento.");
    }
    if (String(existing.claimToken || "") !== options.claimToken || !existing.leaseAtivoDb) {
      await connection.rollback();
      throw new Error("O job Warleine não pertence a este worker ou o lease expirou.");
    }
    loteId = Number(existing.id);
    await connection.execute("DELETE FROM warleine_faturamento_quarentena WHERE loteId=? AND estabelecimentoId=?", [loteId, options.estabelecimentoId]);
    await connection.execute("DELETE FROM warleine_faturamento_staging WHERE loteId=? AND estabelecimentoId=?", [loteId, options.estabelecimentoId]);
    await connection.execute("DELETE FROM warleine_faturamento_itens WHERE loteId=? AND estabelecimentoId=? AND ativoParaRelatorio=0", [loteId, options.estabelecimentoId]);
    const [updateResult] = await connection.execute<any>("UPDATE warleine_faturamento_lotes SET status='processando', erroResumo=NULL, totalLinhas=0, totalValidas=0, totalAvisos=0, totalRejeitadas=0, totalPublicadas=0, atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()", [loteId, options.estabelecimentoId, options.claimToken]);
    if (Number(updateResult.affectedRows || 0) !== 1) throw new Error("O lease do job Warleine foi perdido antes do processamento.");
    await connection.commit();
    await renewWarleineLease(connection, loteId, options.estabelecimentoId, options.claimToken);

    progress.phase = "staging";
    options.onProgress?.({ ...progress });
    const stageBatch: Array<{ loteId: number; estabelecimentoId: number; configId: number | null; line: number; status: string; warning: string | null; raw: Record<string, unknown> }> = [];
    const quarantineBatch: Array<{ loteId: number; estabelecimentoId: number; line: number; code: string; detail: string; raw: Record<string, unknown> }> = [];
    const competencies = new Set<string>();
    const seenLineHashes = new Set<string>();
    let headerValidated = false;
    let worksheetCount = 0;
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(options.filePath, { worksheets: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", entries: "ignore" });
    for await (const worksheet of workbookReader) {
      worksheetCount += 1;
      if (worksheetCount > 1) {
        throw new Error("O arquivo Warleine deve conter exatamente uma aba. Separe outras abas em arquivos independentes para manter o snapshot auditável.");
      }
      for await (const row of worksheet) {
        const values = Array.from({ length: Math.max(row.cellCount, WARLEINE_XLSX_HEADERS.length) }, (_, index) => row.getCell(index + 1).value);
        if (!headerValidated) {
          const headers = values.slice(0, WARLEINE_XLSX_HEADERS.length).map(normalizeWarleineHeader);
          const mismatch = WARLEINE_XLSX_HEADERS.findIndex((expected, index) => headers[index] !== expected);
          if (mismatch >= 0) throw new Error(`Layout Warleine incompatível na coluna ${mismatch + 1}: esperado ${WARLEINE_XLSX_HEADERS[mismatch]}.`);
          headerValidated = true;
          continue;
        }
        progress.processedRows += 1;
        if (progress.processedRows % 1_000 === 0) assertWarleineDeadline(options.deadlineAtMs);
        const parsed = parseWarleineRow(values);
        if (parsed.canonical) {
          if (seenLineHashes.has(parsed.canonical.linhaHash)) parsed.warnings.push("CONTEUDO_REPETIDO_NO_ARQUIVO");
          seenLineHashes.add(parsed.canonical.linhaHash);
        }
        const status = parsed.errors.length ? "rejeitado" : parsed.warnings.length ? "aviso" : "valido";
        if (status === "rejeitado") progress.rejectedRows += 1;
        else if (status === "aviso") progress.warningRows += 1;
        else progress.validRows += 1;
        if (parsed.canonical) {
          competencies.add(parsed.canonical.competencia);
          stageBatch.push({ loteId, estabelecimentoId: options.estabelecimentoId, configId: options.configId || null, line: progress.processedRows, status, warning: parsed.warnings.join(",") || null, raw: parsed.canonical });
        } else {
          stageBatch.push({ loteId, estabelecimentoId: options.estabelecimentoId, configId: options.configId || null, line: progress.processedRows, status, warning: null, raw: parsed.raw });
          quarantineBatch.push({ loteId, estabelecimentoId: options.estabelecimentoId, line: progress.processedRows, code: parsed.errors[0] || "LINHA_INVALIDA", detail: parsed.errors.join(","), raw: parsed.raw });
        }
        if (stageBatch.length >= 300) {
          await persistWarleineStageBatch(connection, loteId, options.estabelecimentoId, options.claimToken, stageBatch.splice(0), quarantineBatch.splice(0));
        }
        if (progress.processedRows % 25_000 === 0) {
          await renewWarleineLease(connection, loteId, options.estabelecimentoId, options.claimToken);
          const progressParams = [progress.processedRows, progress.validRows, progress.warningRows, progress.rejectedRows, loteId, options.estabelecimentoId];
          const [progressResult] = await connection.execute<any>("UPDATE warleine_faturamento_lotes SET totalLinhas=?, totalValidas=?, totalAvisos=?, totalRejeitadas=?, atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()", [...progressParams, options.claimToken]);
          if (Number(progressResult.affectedRows || 0) !== 1) throw new Error("O lease do job Warleine foi perdido durante o staging.");
          options.onProgress?.({ ...progress });
        }
      }
    }
    if (!headerValidated) throw new Error("A planilha Warleine não possui cabeçalho legível.");
    await persistWarleineStageBatch(connection, loteId, options.estabelecimentoId, options.claimToken, stageBatch, quarantineBatch);
    const competencyList = [...competencies].sort();
    await renewWarleineLease(connection, loteId, options.estabelecimentoId, options.claimToken);
    const validationParams = [progress.processedRows, progress.validRows, progress.warningRows, progress.rejectedRows, JSON.stringify(competencyList), loteId, options.estabelecimentoId];
    const [validationResult] = await connection.execute<any>("UPDATE warleine_faturamento_lotes SET status='validado', totalLinhas=?, totalValidas=?, totalAvisos=?, totalRejeitadas=?, competencias=?, validadoEm=NOW(), atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()", [...validationParams, options.claimToken]);
    if (Number(validationResult.affectedRows || 0) !== 1) throw new Error("O lease do job Warleine foi perdido antes da validação.");

    let publishedRows = 0;
    if (options.publish) {
      if (!options.replaceCompetencies) throw new Error("Confirme explicitamente que o arquivo substitui as competências presentes no lote.");
      progress.phase = "publishing";
      options.onProgress?.({ ...progress });
      publishedRows = await publishWarleineLot(connection, loteId, options.estabelecimentoId, options.deadlineAtMs, options.claimToken);
    }
    progress.phase = "completed";
    options.onProgress?.({ ...progress });
    return { ...progress, loteId, fileHash, publishedRows, reusedExistingLot: false, competencies: competencyList };
  } catch (error) {
    if (loteId) {
      const errorMessage = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
      const params = [errorMessage, loteId, options.estabelecimentoId];
      await connection.execute(`UPDATE warleine_faturamento_lotes SET status='erro', erroResumo=?, claimToken=NULL, claimedBy=NULL, leaseExpiresAt=NULL, atualizadoEm=NOW() WHERE id=? AND estabelecimentoId=? AND claimToken=? AND leaseExpiresAt>NOW()`, [...params, options.claimToken]).catch(() => undefined);
    }
    throw error;
  } finally {
    connection.release();
  }
}
