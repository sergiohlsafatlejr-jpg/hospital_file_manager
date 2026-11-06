import { describe, expect, it } from "vitest";
import { assertReadOnlyAccountQuery, compilePositionalQuery, compileReadOnlyAccountQuery } from "./connectors/sqlQuerySafety";
import { TEMPLATES_MAPEAMENTO } from "../client/src/lib/templates-mapeamento";

const account = ["SYNTHETIC-ACCOUNT"];

describe("assertReadOnlyAccountQuery — lexical fail-closed guard", () => {
  it.each(TEMPLATES_MAPEAMENTO.filter(template => template.nome.includes("Busca Conta")))("accepts existing reviewed template $id", template => {
    expect(() => assertReadOnlyAccountQuery(template.querySQL, account)).not.toThrow();
  });

  it.each([
    "SELECT numconta FROM contas WHERE numconta = $1",
    "SELECT numconta FROM contas WHERE numconta = $1;",
    "/* ordinary comment */ SELECT numconta FROM contas WHERE numconta = $1; -- end\n",
    "SELECT numconta FROM contas WHERE numconta = ?",
    "SELECT c.numconta FROM contas c WHERE c.numconta = $1 OR c.parent = $1",
    "SELECT '$1; UPDATE contas SET x=1' AS label FROM contas WHERE numconta = $1",
    "SELECT \"$1\", `field` FROM contas WHERE numconta = $1",
    "SELECT [numconta] FROM [contas] WHERE [numconta] = $1",
    "WITH c AS (SELECT numconta FROM contas WHERE numconta = $1) SELECT * FROM c",
    "WITH c(numconta) AS (SELECT numconta FROM contas WHERE numconta = $1), d AS (SELECT * FROM c) SELECT * FROM d",
    "WITH RECURSIVE c AS (SELECT numconta FROM contas WHERE numconta = $1 UNION ALL SELECT numconta FROM contas WHERE numconta = $1) SELECT * FROM c",
    "WITH c AS (WITH d AS (SELECT * FROM contas WHERE numconta = $1) SELECT * FROM d) SELECT * FROM c",
    "SELECT * FROM (SELECT * FROM contas WHERE numconta = $1) c",
    "SELECT * FROM contas WHERE numconta = $1 UNION ALL SELECT * FROM antigas WHERE numconta = $1",
    "SELECT ROUND(SUM(valor), 2), COUNT(*) FROM contas WHERE numconta = $1",
    "SELECT CAST(numconta AS VARCHAR(40)), COALESCE(valor, 0), CASE WHEN valor > 0 THEN valor ELSE 0 END FROM contas WHERE numconta = $1",
    "SELECT ROW_NUMBER() OVER (PARTITION BY numconta ORDER BY valor) FROM contas WHERE numconta = $1",
    "SELECT * FROM contas WHERE numconta = $1 AND EXISTS (SELECT 1 FROM itens WHERE itens.numconta = contas.numconta)",
    "SELECT TO_CHAR(numconta) FROM contas WHERE TO_CHAR(numconta) = $1",
  ])("accepts reviewed read-only lexical form: %s", query => {
    expect(() => assertReadOnlyAccountQuery(query, account)).not.toThrow();
  });

  it.each([
    "UPDATE contas SET valor = $1",
    "DELETE FROM contas WHERE numconta = $1",
    "INSERT INTO contas VALUES ($1)",
    "DROP TABLE contas; SELECT $1",
    "CALL p($1)",
    "EXEC p $1",
    "SELECT $1; SELECT 2",
    "SELECT $1;;",
    ";SELECT $1",
    "SELECT $1 SELECT 2",
    "SELECT $1\nGO\nSELECT 2",
    "WITH c AS (UPDATE contas SET valor = $1 RETURNING *) SELECT * FROM c",
    "WITH c AS (DELETE FROM contas WHERE numconta = $1) SELECT * FROM c",
    "WITH c AS (SELECT $1) UPDATE contas SET valor = 0",
    "WITH c AS (SELECT $1) SELECT * INTO backup FROM c",
    "WITH c AS (SELECT $1), bad AS (INSERT INTO contas VALUES (1)) SELECT * FROM c",
    "SELECT $1 INTO contas",
    "SELECT $1 INTO OUTFILE '/tmp/synthetic'",
    "SELECT $1 INTO DUMPFILE '/tmp/synthetic'",
    "SELECT * FROM contas WHERE numconta = $1 FOR UPDATE",
    "SELECT * FROM contas WHERE numconta = $1 FOR SHARE",
    "SELECT * FROM contas WHERE numconta = $1 LOCK IN SHARE MODE",
    "SELECT * FROM contas WITH (UPDLOCK) WHERE numconta = $1",
    "SELECT * FROM contas WITH (NOLOCK) WHERE numconta = $1",
    "SELECT @x := $1",
    "SELECT @@session.sql_mode, $1",
    "SELECT $1; SET SESSION sql_mode = ''",
    "SELECT $1 /*! INTO OUTFILE '/tmp/synthetic' */",
    "SELECT $1 /*M! DELETE FROM contas */",
    "SELECT /*+ SET_VAR(x=1) */ $1",
    "SELECT $1 /* nested /* comment */ */",
    "SELECT $1 /* unterminated",
    "SELECT '$1",
    "SELECT '$1' FROM contas",
    "SELECT 1 -- $1\nFROM contas",
    "SELECT 1 /* $1 */ FROM contas",
    "SELECT \"$1\" FROM contas",
    "SELECT [num$1] FROM contas",
    "SELECT $2 FROM contas",
    "SELECT ? FROM contas WHERE numconta = $1",
    "SELECT LOAD_FILE($1)",
    "SELECT SLEEP($1)",
    "SELECT BENCHMARK(1, $1)",
    "SELECT GET_LOCK($1, 10)",
    "SELECT RELEASE_LOCK($1)",
    "SELECT IS_FREE_LOCK($1)",
    "SELECT SETVAL($1, 1)",
    "SELECT NEXT VALUE FOR seq FROM contas WHERE numconta = $1",
    "SELECT xp_cmdshell($1)",
    "SELECT OPENROWSET($1)",
    "SELECT dangerous_udf($1)",
    "SELECT dbo.ROUND($1, 2)",
    "SELECT \"ROUND\"($1, 2)",
    "SELECT ಠROUND($1, 2)",
    "SELECT * FROM custom_table_function($1)",
    "SELECT 1 FROM contas WHERE numconta = $1 OPTION (MAXDOP 1)",
    "SELECT q'[danger]' FROM contas WHERE numconta = $1",
    "SELECT E'escaped' FROM contas WHERE numconta = $1",
    "SELECT 'back\\slash' FROM contas WHERE numconta = $1",
    "SELECT $1--not-a-portable-comment",
    "SELECT ($1",
    "SELECT $1)",
    "WITH c AS (VALUES ($1)) SELECT * FROM c",
    "WITH c(a,) AS (SELECT $1) SELECT * FROM c",
    "WITH c AS SELECT $1 SELECT * FROM c",
    "SELECT $1\0",
  ])("rejects unsafe/ambiguous form: %s", query => {
    expect(() => assertReadOnlyAccountQuery(query, account)).toThrow();
  });

  it("requires exactly one usable account value", () => {
    for (const params of [[], [undefined], ["one", "extra"], [NaN], [{}]]) {
      expect(() => assertReadOnlyAccountQuery("SELECT * FROM contas WHERE numconta = $1", params)).toThrow();
    }
  });

  it.each([null, 42, "$' OR 1=1 --", "$`", "$&", "$$", "$2", "a'b\\c Unicode ã"])(
    "account data never changes the lexical decision: %s", value => {
      expect(() => assertReadOnlyAccountQuery("SELECT * FROM contas WHERE numconta = $1", [value])).not.toThrow();
    },
  );

  it("sanitizes lexical/parameter errors", () => {
    const secret = "SYNTHETIC-SECRET-NOT-REAL";
    for (const query of [`UPDATE ${secret} SET x=$1`, `SELECT '${secret}`, `SELECT $1 /* ${secret}`]) {
      try {
        assertReadOnlyAccountQuery(query, [secret]);
        expect.fail("should reject");
      } catch (error) {
        expect(String(error)).not.toContain(secret);
        expect(String(error)).not.toContain(query);
      }
    }
  });
});

describe("compilePositionalQuery — lexical binds, no interpolation", () => {
  it.each(["mysql", "sqlserver"] as const)("supports repeated $1/$10, reordered and exact indices (%s)", dialect => {
    const params = Array.from({ length: 10 }, (_, i) => `value-${i + 1}`);
    const query = "SELECT $10, $1, $2, $3, $4, $5, $6, $7, $8, $9, $1, $10";
    const compiled = compilePositionalQuery(query, params, dialect);
    if (dialect === "mysql") {
      expect(compiled.sql).toBe("SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?");
      expect(compiled.values).toEqual([params[9], ...params.slice(0, 9), params[0], params[9]]);
      expect(compiled.names).toEqual([]);
    } else {
      expect(compiled.sql).toBe("SELECT @safatle_p10, @safatle_p1, @safatle_p2, @safatle_p3, @safatle_p4, @safatle_p5, @safatle_p6, @safatle_p7, @safatle_p8, @safatle_p9, @safatle_p1, @safatle_p10");
      expect(compiled.values).toEqual([params[9], ...params.slice(0, 9)]);
      expect(compiled.names).toEqual(["safatle_p10", ...Array.from({ length: 9 }, (_, i) => `safatle_p${i + 1}`)]);
    }
  });

  it.each(["mysql", "sqlserver"] as const)("ignores literals, escaped quotes, identifiers and comments (%s)", dialect => {
    const query = "SELECT '$1 '' ? $10', \"$1\", `?`, $1 /* $9 ? */ -- $4 ?\n";
    const compiled = compilePositionalQuery(query, ["value"], dialect);
    expect(compiled.sql).toBe(query.replace(", $1 /*", dialect === "mysql" ? ", ? /*" : ", @safatle_p1 /*"));
    expect(compiled.values).toEqual(["value"]);
  });

  it("ignores SQL Server bracket quoting and MySQL # comments", () => {
    expect(compilePositionalQuery("SELECT [$1], [a]]?], $1", [1], "sqlserver").sql).toBe("SELECT [$1], [a]]?], @safatle_p1");
    expect(compilePositionalQuery("SELECT $1 # $2 ?\n", [1], "mysql").sql).toBe("SELECT ? # $2 ?\n");
  });

  it.each(["mysql", "sqlserver"] as const)("supports sequential ? without mixing (%s)", dialect => {
    const compiled = compilePositionalQuery("SELECT ?, '?' AS label, ?", [null, 42], dialect);
    expect(compiled.sql).toBe(dialect === "mysql" ? "SELECT ?, '?' AS label, ?" : "SELECT @safatle_p1, '?' AS label, @safatle_p2");
    expect(compiled.values).toEqual([null, 42]);
  });

  it.each(["$'", "$`", "$&", "$$", "$2", "O'Reilly", "back\\slash", "Unicode ã 日本語", null, 0, -12.5, false])("keeps values out of SQL: %s", value => {
    const compiled = compilePositionalQuery("SELECT $1 AS synthetic", [value], "mysql");
    expect(compiled.sql).toBe("SELECT ? AS synthetic");
    expect(compiled.values).toEqual([value]);
  });

  it("accepts Date and Buffer without stringifying", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const buffer = Buffer.from("synthetic");
    expect(compilePositionalQuery("SELECT $1, $2", [date, buffer], "mysql").values).toEqual([date, buffer]);
  });

  it.each([
    ["SELECT $1", []],
    ["SELECT ?", []],
    ["SELECT 1", [1]],
    ["SELECT '$1'", [1]],
    ["SELECT 1 /* $1 */", [1]],
    ["SELECT $1", [1, 2]],
    ["SELECT $3", [1, 2, 3]],
    ["SELECT $1, $10", [1]],
    ["SELECT $1, ?", [1, 2]],
    ["SELECT $1, @named", [1]],
    ["SELECT @named", []],
    ["SELECT :named", []],
    ["SELECT $1, :1", [1]],
    ["SELECT $0", [1]],
    ["SELECT $01", [1]],
    ["SELECT $1abc", [1]],
    ["SELECT $99999999999999999999", [1]],
    ["SELECT $$body$$", []],
    ["SELECT $1 /*! dangerous */", [1]],
  ] as [string, unknown[]][])("rejects invalid placeholder set: %s", (query, params) => {
    for (const dialect of ["mysql", "sqlserver"] as const) {
      expect(() => compilePositionalQuery(query, params, dialect)).toThrow();
    }
  });

  it.each([undefined, NaN, Infinity, -Infinity, 1n, {}, [], /x/, Symbol("x"), () => 1, new Date(NaN)])("rejects unsupported parameter type: %s", value => {
    expect(() => compilePositionalQuery("SELECT $1", [value], "mysql")).toThrow("Parâmetros SQL inválidos");
  });

  it("preserves legitimate parameterless SQL without adding binds", () => {
    for (const dialect of ["mysql", "sqlserver"] as const) {
      expect(compilePositionalQuery("SELECT 1 AS ok; -- ordinary\n", [], dialect)).toEqual({ sql: "SELECT 1 AS ok; -- ordinary\n", values: [], names: [] });
    }
    expect(compilePositionalQuery("SELECT @@VERSION", [], "sqlserver").values).toEqual([]);
  });

  it("rejects null/non-array params, malformed quoting and invalid dialect at runtime", () => {
    expect(() => compilePositionalQuery("SELECT 1", null as any, "mysql")).toThrow();
    expect(() => compilePositionalQuery("SELECT 1", {} as any, "mysql")).toThrow();
    expect(() => compilePositionalQuery("SELECT 'unfinished", [], "mysql")).toThrow();
    expect(() => compilePositionalQuery("SELECT 1", [], "other" as any)).toThrow();
  });
});

describe("compileReadOnlyAccountQuery — native read paths", () => {
  it("Oracle removes only the real trailing semicolon and binds repeated occurrences by name", () => {
    const compiled = compileReadOnlyAccountQuery("SELECT ';$1' AS label FROM contas WHERE numconta = $1 OR parent = $1; /* ;$1 */", ["$'"], "oracle");
    expect(compiled).toEqual({
      sql: "SELECT ';$1' AS label FROM contas WHERE numconta = :safatle_p1 OR parent = :safatle_p1 /* ;$1 */",
      names: ["safatle_p1"], values: ["$'"],
    });
  });

  it("PostgreSQL preserves casts and ordinal bind tokens with repeated occurrences", () => {
    const compiled = compileReadOnlyAccountQuery("SELECT numconta::text FROM contas WHERE numconta::text = $1 OR parent::text = $1;", ["$2"], "postgres");
    expect(compiled).toEqual({
      sql: "SELECT numconta::text FROM contas WHERE numconta::text = $1 OR parent::text = $1;",
      names: [], values: ["$2"],
    });
  });

  it.each(["oracle", "postgres", "mysql", "sqlserver"] as const)("%s shares the account guard and never accepts an unsafe native query", dialect => {
    expect(() => compileReadOnlyAccountQuery("UPDATE contas SET numconta=$1", account, dialect)).toThrow();
    expect(() => compileReadOnlyAccountQuery("SELECT '$1'", account, dialect)).toThrow();
    expect(() => compileReadOnlyAccountQuery("SELECT ambiguous_udf($1)", account, dialect)).toThrow();
    expect(() => compileReadOnlyAccountQuery("SELECT $1", account, dialect)).not.toThrow();
  });
});
