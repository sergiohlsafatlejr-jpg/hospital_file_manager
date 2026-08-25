import { describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
import { getApplicationDatabaseUrl } from "./db";

describe("conexão principal do Portal Safatle", () => {
  it("prioriza APP_DATABASE_URL e executa uma consulta leve", async () => {
    expect(process.env.APP_DATABASE_URL).toBeTruthy();
    expect(getApplicationDatabaseUrl()).toBe(process.env.APP_DATABASE_URL);

    const connection = await createConnection(getApplicationDatabaseUrl()!);
    try {
      const [rows] = await connection.query("SELECT 1 AS ok");
      expect((rows as Array<{ ok: number }>)[0]?.ok).toBe(1);
    } finally {
      await connection.end();
    }
  });
});
