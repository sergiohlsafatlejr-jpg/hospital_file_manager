import { createConnection, type RowDataPacket } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
import {
  FINAL_COLUMNS,
  canonicalParams,
  type WarleineCanonicalRow,
} from "../server/warleineFaturamentoImportService";
import {
  HUP_FINANCE_ESTABELECIMENTO as HUP,
  HUP_HOP_COLUMNS,
  fingerprintHupFinance,
  originForHupFinance,
  parseHupFinanceRow,
} from "../server/hupWarleineFinanceMap";

async function run() {
const apply = process.argv.includes("--apply");
const approved = process.argv.includes("--confirm-reviewed-pr");
const complete = process.argv.includes("--confirm-hop-complete");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL ausente");
const target = new URL(DB_URL);
const expectedDb = process.env.SAFATLE_HUP_FIN_EXPECTED_DATABASE;
const expectedHost = process.env.SAFATLE_HUP_FIN_EXPECTED_HOST;
const expectedPort = process.env.SAFATLE_HUP_FIN_EXPECTED_PORT;
const expectedHash = process.env.SAFATLE_HUP_FIN_EXPECTED_SHA256;
const expectedCount = Number(process.env.SAFATLE_HUP_FIN_EXPECTED_COUNT);
if (apply && (!approved || !complete || !expectedDb || !expectedHost || !expectedPort || !expectedHash || !Number.isSafeInteger(expectedCount) || expectedCount < 1)) {
  throw new Error("APLICACAO_BLOQUEADA: requer PR revisada, Hop parado e manifesto privado count/hash/banco");
}
if (apply && (target.hostname !== expectedHost || (target.port || "3306") !== expectedPort || target.pathname.slice(1) !== expectedDb || !/^[a-f0-9]{64}$/.test(expectedHash!))) {
  throw new Error("ALVO_OU_MANIFESTO_INVALIDO");
}

function connection() {
  return createConnection({ uri: DB_URL, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
}

type Snapshot = { rows: WarleineCanonicalRow[]; fingerprint: string; competencies: string[] };
async function readSnapshot(db: Awaited<ReturnType<typeof connection>>): Promise<Snapshot> {
  const [meta] = await db.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME name, COLUMN_TYPE physicalType FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stagion_faturado_recebido_urologico' ORDER BY ORDINAL_POSITION",
  );
  const columns = new Map(meta.map((row) => [String(row.name).toLowerCase(), String(row.physicalType).toLowerCase()]));
  const extra = [...columns.keys()].filter((name) => !HUP_HOP_COLUMNS.includes(name as typeof HUP_HOP_COLUMNS[number]));
  const technical = ["id", "lote_ref", "capturado_em"];
  if (HUP_HOP_COLUMNS.some((column) => !columns.has(column)) ||
      !(extra.length === 0 || (extra.length === 3 && extra.every((name) => technical.includes(name))))) {
    throw new Error("CONTRATO_FISICO_STAGING_HUP_INCOMPATIVEL");
  }
  for (const name of ["vl_faturado", "vl_recebido", "vl_receb_a_maior", "vl_total_recebido", "vl_aberto", "vl_glosas", "gl_recurso", "gl_aceita", "gl_analise", "gl_recuperada"]) {
    if (columns.get(name) !== "decimal(15,2)") throw new Error("TIPO_MONETARIO_HUP_INCOMPATIVEL");
  }
  if (columns.get("quantidade") !== "decimal(15,4)" || columns.get("vl_unitario") !== "decimal(15,4)" || columns.get("estabelecimentos_id") !== "varchar(100)") {
    throw new Error("TIPO_FISICO_HUP_INCOMPATIVEL");
  }
  const [foreign] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) n FROM stagion_faturado_recebido_urologico WHERE estabelecimentos_id IS NULL OR estabelecimentos_id<>?",
    [String(HUP)],
  );
  if (Number(foreign[0].n) > 0) throw new Error("STAGING_CONTEM_OUTRA_UNIDADE");
  const [raw] = await db.query<RowDataPacket[]>(
    `SELECT ${HUP_HOP_COLUMNS.map((column) => `\`${column}\``).join(",")}
       FROM stagion_faturado_recebido_urologico WHERE estabelecimentos_id=?`, [String(HUP)],
  );
  if (!raw.length) throw new Error("STAGING_HUP_VAZIA");
  const rows = raw.map(parseHupFinanceRow);
  const { hash, ordered } = fingerprintHupFinance(rows);
  return { rows: ordered, fingerprint: hash, competencies: [...new Set(rows.map((row) => row.competencia))].sort() };
}

function checkManifest(snapshot: Snapshot) {
  if (snapshot.rows.length !== expectedCount || snapshot.fingerprint !== expectedHash) {
    throw new Error("SNAPSHOT_HUP_DIVERGE_DO_MANIFESTO_PRIVADO");
  }
}

async function assertInitialEmpty(db: Awaited<ReturnType<typeof connection>>) {
  const [stats] = await db.query<RowDataPacket[]>(`
    SELECT (SELECT COUNT(*) FROM warleine_faturamento_lotes WHERE estabelecimentoId=?) lotes,
           (SELECT COUNT(*) FROM warleine_faturamento_itens WHERE estabelecimentoId=?) itens,
           (SELECT COUNT(*) FROM warleine_faturamento_snapshots_ativos WHERE estabelecimentoId=?) snapshots
  `, [HUP, HUP, HUP]);
  if (Number(stats[0].lotes) || Number(stats[0].itens) || Number(stats[0].snapshots)) {
    throw new Error("DESTINO_WARLEINE_HUP_NAO_ESTA_VAZIO: primeira carga proibida");
  }
}

const db = await connection();
try {
  const [identity] = await db.query<RowDataPacket[]>("SELECT DATABASE() AS db, COUNT(*) AS n FROM estabelecimentos WHERE id=?", [HUP]);
  if (Number(identity[0].n) !== 1 || (apply && identity[0].db !== expectedDb)) throw new Error("BANCO_OU_ESTABELECIMENTO_DIVERGENTE");
  await assertInitialEmpty(db);
  const preview = await readSnapshot(db);
  // Por padrão, jamais imprimir hash, valores monetários, pacientes ou linhas.
  console.log(JSON.stringify({ modo: apply ? "aplicacao" : "previa", linhas: preview.rows.length, competencias: preview.competencies.length, unidade: HUP, destinoInicialVazio: true }));
  if (!apply) {
    if (process.env.SAFATLE_HUP_FIN_PRIVATE_MANIFEST_FILE) {
      await writeFile(process.env.SAFATLE_HUP_FIN_PRIVATE_MANIFEST_FILE, JSON.stringify({
        count: preview.rows.length, sha256: preview.fingerprint, database: identity[0].db,
        hostname: target.hostname, port: target.port || "3306", competencias: preview.competencies.length,
      }) + "\n", { flag: "wx", mode: 0o600 });
    }
    process.exitCode = 0;
  }
  else {
    checkManifest(preview);
    const confirm = await readSnapshot(db);
    checkManifest(confirm);
    const [users] = await db.query<RowDataPacket[]>("SELECT id FROM users WHERE openId=? AND role='admin' LIMIT 1", [process.env.OWNER_OPEN_ID || ""]);
    if (!users[0]) throw new Error("EXECUTOR_ADMIN_NAO_IDENTIFICADO");
    // Mesma transação serializa a primeira publicação de lote, itens e ponteiros.
    await db.beginTransaction();
    let committed = false;
    try {
      const [estab] = await db.query<RowDataPacket[]>("SELECT id FROM estabelecimentos WHERE id=? FOR UPDATE", [HUP]);
      if (!estab.length) throw new Error("ESTABELECIMENTO_HUP_INDISPONIVEL");
      await assertInitialEmpty(db);
      const inside = await readSnapshot(db);
      checkManifest(inside);
      const [lot] = await db.execute<any>(`
        INSERT INTO warleine_faturamento_lotes
          (estabelecimentoId,origem,arquivoNome,arquivoHash,status,totalLinhas,totalValidas,totalPublicadas,competencias,criadoPor,validadoEm)
        VALUES (?,'hop_hup','snapshot-hop-hup',?,'validado',?,?,?,?,?,NOW())
      `, [HUP, expectedHash, expectedCount, expectedCount, 0, JSON.stringify(inside.competencies), Number(users[0].id)]);
      const loteId = Number(lot.insertId);
      if (!loteId) throw new Error("LOTE_HUP_NAO_CRIADO");
      let lastHash = "";
      let occurrence = 0;
      const batchSize = 80;
      const activeIndex = FINAL_COLUMNS.indexOf("ativoParaRelatorio");
      if (activeIndex < 0) throw new Error("COLUNA_ATIVA_AUSENTE");
      const sql = `INSERT INTO warleine_faturamento_itens (${FINAL_COLUMNS.map((column) => `\`${column}\``).join(",")}) VALUES `;
      for (let offset = 0; offset < inside.rows.length; offset += batchSize) {
        const items = inside.rows.slice(offset, offset + batchSize);
        const params = items.flatMap((row, index) => {
          if (row.linhaHash !== lastHash) { lastHash = row.linhaHash; occurrence = 0; }
          occurrence += 1;
          const canonical = { ...row, origemRegistroId: originForHupFinance(row, occurrence) };
          const values = canonicalParams(loteId, HUP, offset + index + 1, canonical);
          values[activeIndex] = true;
          return values;
        });
        const marks = items.map(() => `(${FINAL_COLUMNS.map(() => "?").join(",")})`).join(",");
        const [inserted] = await db.execute<any>(sql + marks, params);
        if (Number(inserted.affectedRows) !== items.length) throw new Error("FATOS_HUP_INCOMPLETOS");
      }
      const [totals] = await db.query<RowDataPacket[]>(`
        SELECT COUNT(*) n, COALESCE(SUM(valorFaturado),0) faturado,
          COALESCE(SUM(valorRecebido),0) recebido,
          COALESCE(SUM(valorTotalRecebido),0) totalRecebido,
          COALESCE(SUM(valorAberto),0) aberto, COALESCE(SUM(valorGlosa),0) glosa
        FROM warleine_faturamento_itens WHERE estabelecimentoId=? AND loteId=?`, [HUP, loteId]);
      if (Number(totals[0].n) !== expectedCount) throw new Error("TOTAL_HUP_INCOMPLETO");
      for (const competencia of inside.competencies) {
        await db.execute(
          "INSERT INTO warleine_faturamento_snapshots_ativos (estabelecimentoId,competencia,loteId) VALUES (?,?,?)",
          [HUP, competencia, loteId],
        );
      }
      const [updated] = await db.execute<any>(`
        UPDATE warleine_faturamento_lotes SET status='publicado',totalPublicadas=?,
          valorFaturado=?,valorRecebido=?,valorTotalRecebido=?,valorAberto=?,valorGlosa=?,publicadoEm=NOW()
        WHERE id=? AND estabelecimentoId=? AND status='validado'`,
        [expectedCount, String(totals[0].faturado), String(totals[0].recebido), String(totals[0].totalRecebido), String(totals[0].aberto), String(totals[0].glosa), loteId, HUP],
      );
      if (Number(updated.affectedRows) !== 1) throw new Error("LOTE_HUP_NAO_PUBLICADO");
      const [visible] = await db.query<RowDataPacket[]>(`
        SELECT COUNT(*) n, COUNT(DISTINCT origemRegistroId) origens,
          COUNT(DISTINCT competencia) periodos,
          COALESCE(SUM(valorFaturado),0) faturado,
          COALESCE(SUM(valorTotalRecebido),0) totalRecebido
        FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId=? AND loteId=?`, [HUP, loteId]);
      if (Number(visible[0].n) !== expectedCount || Number(visible[0].origens) !== expectedCount ||
          Number(visible[0].periodos) !== inside.competencies.length ||
          String(visible[0].faturado) !== String(totals[0].faturado) ||
          String(visible[0].totalRecebido) !== String(totals[0].totalRecebido)) {
        throw new Error("VIEW_ATIVA_HUP_DIVERGENTE");
      }
      // Nova conexão, fora do snapshot transacional, detecta mudança da staging antes do COMMIT.
      const outside = await connection();
      try { checkManifest(await readSnapshot(outside)); } finally { await outside.end(); }
      await db.commit(); committed = true;
      console.log(JSON.stringify({ resultado: "publicado", itens: expectedCount, competencias: inside.competencies.length, unidade: HUP }));
    } finally {
      if (!committed) await db.rollback().catch(() => undefined);
    }
  }
} catch (error) {
  // Nunca imprimir SQL nem diagnóstico do driver: ambos podem conter dados sensíveis.
  const message = error instanceof Error ? error.message : "ERRO_DESCONHECIDO";
  console.error(/^([A-Z0-9_,:; ]+)$/.test(message) ? message : "CARGA_HUP_INTERROMPIDA");
  process.exitCode = 1;
} finally {
  await db.end();
}
}

run().catch(() => {
  // Nenhuma mensagem de driver, URI ou parâmetro sensível deve sair no stderr.
  console.error("CARGA_HUP_INTERROMPIDA");
  process.exitCode = 1;
});
