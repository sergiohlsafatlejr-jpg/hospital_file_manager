import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql, { type Connection } from "mysql2/promise";

const enabled = process.env.EASYLOCAL_AGENDA_HOMOLOG_LOCAL === "sim";
const socket = "/home/ubuntu/private/easylocal-homolog-db/mysql.sock";
const database = "easylocal_agenda_0136_homolog";
const table = "integracao_easylocal_agendamentos";
const sql = readFileSync(
  new URL("../drizzle/0136_lame_dreadnoughts.sql", import.meta.url),
  "utf8"
);
const statements = sql
  .split("--> statement-breakpoint")
  .map(s => s.trim())
  .filter(Boolean);
let c: Connection;

describe("0136: contrato SQL de charset", () => {
  it("fixa utf8mb4 explicitamente sem depender do default do Portal", () => {
    expect(statements[0]).toMatch(
      /DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin/
    );
    expect(statements).toHaveLength(3);
    expect(statements.every(s => /^CREATE (TABLE|INDEX)\b/.test(s))).toBe(true);
  });
});

describe.skipIf(!enabled)(
  "0136: SQL exclusivamente em homologação local sintética",
  () => {
    beforeAll(async () => {
      c = await mysql.createConnection({
        socketPath: socket,
        user: "root",
        multipleStatements: false,
        charset: "utf8mb4",
      });
      // Banco e fixtures exclusivos deste ensaio; nunca usa DATABASE_URL.
      await c.query(
        `CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET latin1 COLLATE latin1_bin`
      );
      await c.query(
        `ALTER DATABASE ${database} CHARACTER SET latin1 COLLATE latin1_bin`
      );
      await c.changeUser({ database });
      await c.query(`DROP TABLE IF EXISTS ${table}`);
      await c.query(
        "CREATE TABLE IF NOT EXISTS legado_sintetico (id int PRIMARY KEY, marcador varchar(30))"
      );
      await c.query(
        "INSERT INTO legado_sintetico VALUES (1,'preservado') ON DUPLICATE KEY UPDATE marcador='preservado'"
      );
      for (const command of statements) await c.query(command);
    });
    afterAll(async () => {
      if (c) await c.end();
    });
    const insert = (leitura: number, unidade: number, uid: string | null) =>
      c.execute(
        `INSERT INTO ${table} (leitura_id,estabelecimento_id,criado_por,schedule_cron_task_uid,frequencia,cron_utc,revisao_aprovada,criado_em,atualizado_em) VALUES (?,?,1,?,'1hora','0 0 * * * *',?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
        [leitura, unidade, uid, "r".repeat(64)]
      );
    it("aplica somente os três comandos da 0136 e preserva o legado", async () => {
      const [rows]: any = await c.query(
        "SELECT marcador FROM legado_sintetico WHERE id=1"
      );
      expect(rows[0].marcador).toBe("preservado");
      const [others]: any = await c.query(
        "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=? AND table_name LIKE 'banco\\_%'",
        [database]
      );
      expect(Number(others[0].total)).toBe(0);
    });
    it("confere todas as colunas e os índices gerados", async () => {
      const expected = [
        "id",
        "leitura_id",
        "estabelecimento_id",
        "criado_por",
        "schedule_cron_task_uid",
        "estado",
        "frequencia",
        "horario_brasilia",
        "fuso",
        "cron_utc",
        "revisao_aprovada",
        "operacao_token",
        "execucao_token",
        "lease_ate",
        "ultimo_slot",
        "ultima_execucao",
        "proxima_execucao",
        "ultimo_resultado",
        "criado_em",
        "atualizado_em",
      ];
      const [columns]: any = await c.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position",
        [database, table]
      );
      expect(columns.map((x: any) => x.column_name ?? x.COLUMN_NAME)).toEqual(
        expected
      );
      const [indexes]: any = await c.query(`SHOW INDEX FROM ${table}`);
      expect(new Set(indexes.map((x: any) => x.Key_name))).toEqual(
        new Set([
          "PRIMARY",
          "uq_el_agenda_leitura_unidade",
          "uq_el_agenda_task_uid",
          "idx_el_agenda_unidade",
          "idx_el_agenda_estado_lease",
        ])
      );
    });
    it("isola a leitura por unidade e permite múltiplos UIDs ainda não associados", async () => {
      await insert(1, 101, null);
      await insert(1, 102, null);
      const [rows]: any = await c.query(
        `SELECT estado,fuso FROM ${table} WHERE leitura_id=1`
      );
      expect(rows).toHaveLength(2);
      expect(
        rows.every(
          (x: any) =>
            x.estado === "preparando" && x.fuso === "America/Sao_Paulo"
        )
      ).toBe(true);
    });
    it("rejeita leitura/unidade duplicada e UID reutilizado em outra agenda", async () => {
      await expect(insert(1, 101, null)).rejects.toMatchObject({
        code: "ER_DUP_ENTRY",
      });
      await insert(2, 101, "cron_sintetico_0136");
      await expect(insert(3, 102, "cron_sintetico_0136")).rejects.toMatchObject(
        { code: "ER_DUP_ENTRY" }
      );
    });
    it("guarda datas com milissegundos e apenas contadores JSON no resultado sintético", async () => {
      await c.query(
        `UPDATE ${table} SET estado='ativo',execucao_token='token_sintetico',lease_ate=TIMESTAMP('2026-10-14 19:30:00.123'),ultimo_resultado=? WHERE leitura_id=2 AND estabelecimento_id=101`,
        [
          JSON.stringify({
            registrosLidos: 10,
            registrosInseridos: 3,
            registrosAtualizados: 7,
          }),
        ]
      );
      const [rows]: any = await c.query(
        `SELECT DATE_FORMAT(lease_ate,'%Y-%m-%d %H:%i:%s.%f') AS lease,ultimo_resultado AS resultado FROM ${table} WHERE leitura_id=2 AND estabelecimento_id=101`
      );
      expect(rows[0].lease).toBe("2026-10-14 19:30:00.123000");
      expect(JSON.parse(rows[0].resultado)).toEqual({
        registrosLidos: 10,
        registrosInseridos: 3,
        registrosAtualizados: 7,
      });
    });
    it("preserva Unicode com quatro bytes mesmo quando o banco tem default latin1", async () => {
      const [metadata]: any = await c.query(
        "SELECT TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?",
        [database, table]
      );
      expect(metadata[0].collation).toBe("utf8mb4_bin");
      const [columns]: any = await c.query(
        "SELECT CHARACTER_SET_NAME AS charset,COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND DATA_TYPE IN ('varchar','enum','text')",
        [database, table]
      );
      expect(columns.length).toBeGreaterThan(0);
      expect(
        columns.every(
          (x: any) => x.charset === "utf8mb4" && x.collation === "utf8mb4_bin"
        )
      ).toBe(true);
      const text = "Revisão sintética \u{1D11E}";
      await c.execute(
        `UPDATE ${table} SET ultimo_slot=? WHERE leitura_id=2 AND estabelecimento_id=101`,
        [text]
      );
      const [rows]: any = await c.query(
        `SELECT ultimo_slot FROM ${table} WHERE leitura_id=2 AND estabelecimento_id=101`
      );
      expect(rows[0].ultimo_slot).toBe(text);
    });
  }
);
