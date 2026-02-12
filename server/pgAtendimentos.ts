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
  codtipsai: string | null;
  nomeplaco: string;
  nomepac: string;
  carater: string;
  datatend: string;
  datasai: string | null;
  tipoatend: string;
  tipoatendimentodescricao: string;
  codserv: string;
  procprin: string;
  codcc_destino: string | null;
}

export async function getAtendimentosAFaturar(): Promise<AtendimentoFaturarRow[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<AtendimentoFaturarRow>(`
      -- INTERNAÇÕES
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'INTERNACAO' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend AND b.codplaco <> 'PAR001'
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'I'
        AND a.datasai IS NOT NULL
        AND B.numconta IS NULL
        AND a.codplaco <> 'PAR001'
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')

      UNION

      -- EXAMES
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'EXAME' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend AND b.codplaco <> 'PAR001'
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'E'
        AND B.numconta IS NULL
        AND a.codplaco <> 'PAR001'
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')

      UNION

      -- AMBULATORIAL SEM CONSULTA E SEM RETORNO
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'AMBULATORIO' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend AND b.codplaco <> 'PAR001'
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'A'
        AND a.numatend NOT IN ('806851','813911','814667','814357','815198','814986','814986','827698')
        AND a.codserv NOT IN ('CO','RE')
        AND B.numconta IS NULL
        AND a.codplaco <> 'PAR001'
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')

      UNION

      -- AMBULATORIAL CONSULTA URGÊNCIA
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'AMBULATORIO' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend
        AND b.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','SINUFG')
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'A'
        AND a.codserv IN ('CO')
        AND A.carater = 'UR'
        AND B.numconta IS NULL
        AND a.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','SINUFG')
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')

      UNION

      -- AMBULATORIAL CONSULTA ELETIVA (exclusão planos)
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'AMBULATORIO' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend
        AND b.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','SINUFG')
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'A'
        AND a.codserv IN ('CO')
        AND A.carater = 'EL'
        AND B.numconta IS NULL
        AND a.codplaco NOT IN ('IPN002','PAR001','IPN001','UNI001','CAPSAU','CORTES','IMAAPT','SINUFG')
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')

      UNION

      -- AMBULATORIAL CONSULTA ELETIVA (prestadores específicos)
      SELECT 
        a.numatend::text,
        (SELECT Y.CODTIPSAI FROM ARQINT Y WHERE Y.numatend=A.numatend) as codtipsai,
        (SELECT Z.nomeplaco FROM CADPLACO Z WHERE Z.codplaco=A.codplaco) as nomeplaco,
        (SELECT d.nomepac FROM CADPAC D WHERE D.codpac=A.codpac) as nomepac,
        A.carater,
        a.datatend::text,
        A.datasai::text,
        A.tipoatend,
        'AMBULATORIO' AS tipoatendimentodescricao,
        (SELECT g.nomeserv FROM cadserv g WHERE g.codserv=a.codserv) as codserv,
        a.procprin,
        X.codcc_destino
      FROM arqatend a
      LEFT JOIN contas b ON a.numatend = b.numatend
        AND b.codplaco NOT IN ('PAR001','CAPSAU','CORTES','IMAAPT','SINUFG')
      LEFT JOIN XX_LOTE_ATEND L ON L.numatend = A.numatend
        AND L.sequencia = (SELECT max(sequencia) FROM XX_LOTE_ATEND WHERE numatend = A.numatend)
      LEFT JOIN XX_LOTE X ON X.lote = L.lote
      WHERE a.datatend BETWEEN CURRENT_DATE - '90 days'::interval AND CURRENT_DATE
        AND A.censo = 'S'
        AND a.tipoatend = 'A'
        AND a.codserv IN ('CO')
        AND A.carater = 'EL'
        AND A.codprest IN ('026007','018439','016293')
        AND B.numconta IS NULL
        AND a.codplaco IN ('IPN002','IPN001','UNI001')
        AND L.status = 'R'
        AND X.codcc_destino IN ('BN2028', '000022', 'BN100')
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
