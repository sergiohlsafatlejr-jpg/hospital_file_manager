import pg from "pg";
import { ENV } from "./_core/env";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: ENV.pgAtendimentosHost,
      port: parseInt(ENV.pgAtendimentosPort, 10),
      database: ENV.pgAtendimentosDatabase,
      user: ENV.pgAtendimentosUser,
      password: ENV.pgAtendimentosPassword,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
  }
  return pool;
}

export interface AtendimentoRow {
  numatend: string;
  nomeplaco: string;
  nomepac: string;
  carater: string;
  datatend: string;
  datasai: string;
  tipoatend: string;
  tipoatendimentodescricao: string;
  codserv: string;
  procprin: string;
  codcc_destino: string;
  motivo: string | null;
}

export async function getAtendimentosParados(): Promise<AtendimentoRow[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<AtendimentoRow>(`
      SELECT a.numatend,
             a.nomeplaco,
             a.nomepac,
             a.carater,
             a.datatend,
             COALESCE(a.datasai, a.datatend) AS datasai,
             a.tipoatend,
             a.tipoatendimentodescricao,
             a.codserv,
             a.procprin,
             a.codcc_destino,
             rni.motivo
      FROM c33581562000206.din_Atend_n_receb a
      LEFT JOIN (
        SELECT rn.numatend, MAX(rn.id) AS max_rn_id
        FROM c33581562000206.registro_notificacao rn
        GROUP BY rn.numatend
      ) rn_max ON rn_max.numatend::text = a.numatend
      LEFT JOIN c33581562000206.registro_notificacao_item rni
        ON rni.notificacao_id = rn_max.max_rn_id
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function salvarNotificacao(
  numatend: string,
  observacao: string,
  notificacoes: Array<{ motivo: string; setor: string; medico: string }>
): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const insertResult = await client.query<{ id: number }>(
      `INSERT INTO c33581562000206.registro_notificacao (numatend, observacao)
       VALUES ($1, $2) RETURNING id`,
      [numatend, observacao]
    );

    const notificacaoId = insertResult.rows[0].id;

    for (const item of notificacoes) {
      await client.query(
        `INSERT INTO c33581562000206.registro_notificacao_item
           (notificacao_id, motivo, setor, medico)
         VALUES ($1, $2, $3, $4)`,
        [notificacaoId, item.motivo, item.setor, item.medico]
      );
    }

    await client.query("COMMIT");
    return notificacaoId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface AtendimentoFaturarRow {
  numatend: string;
  nomeplaco: string;
  nomepac: string;
  carater: string;
  datatend: string;
  datasai: string | null;
  tipoatend: string;
  tipoatendimentodescricao: string;
  codserv: string;
  procprin: string;
}

export async function getAtendimentosAFaturar(): Promise<AtendimentoFaturarRow[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<AtendimentoFaturarRow>(`
      SELECT 
        a.numatend::text,
        a.nomeplaco,
        a.nomepac,
        a.carater,
        a.datatend::text,
        a.datasai::text,
        a.tipoatend,
        a.tipoatendimentodescricao,
        a.codserv,
        a.procprin
      FROM c33581562000206.din_Atend_receb_s_faturar a
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    client.release();
  }
}
