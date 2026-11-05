/**
 * Conservative lexical checks, not a SQL parser or a proof of database privileges.
 * Read-only credentials and reviewed, account-scoped queries are still required.
 * Ambiguous quoting/SQL modes, executable comments and unknown functions fail closed.
 */
type Dialect = "mysql" | "sqlserver";
type ReadOnlyDialect = Dialect | "oracle" | "postgres";
type TokenKind = "word" | "identifier" | "literal" | "number" | "placeholder" | "native" | "symbol";
interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  index?: number;
}

const invalidQuery = () => new Error("Consulta SQL inválida ou não permitida.");
const invalidParams = () => new Error("Parâmetros SQL inválidos ou incompatíveis.");
const wordStart = /[A-Za-z_]/;
const wordPart = /[A-Za-z0-9_$]/;
const whitespace = /[ \t\r\n\f\v]/;

/** No values are ever converted to SQL text. Both drivers support these types. */
function validateParams(params: unknown[]): void {
  if (!Array.isArray(params)) throw invalidParams();
  for (const value of params) {
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number" && Number.isFinite(value)) continue;
    if (value instanceof Date && Number.isFinite(value.getTime())) continue;
    if (Buffer.isBuffer(value)) continue;
    throw invalidParams();
  }
}

function tokenize(query: string, dialect?: Dialect): Token[] {
  if (typeof query !== "string" || !query.trim() || query.includes("\0")) throw invalidQuery();
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, start: number, index?: number) => {
    tokens.push({ kind, text: query.slice(start, i), start, end: i, index });
  };
  while (i < query.length) {
    const start = i;
    const c = query[i];
    if (whitespace.test(c)) { i++; continue; }
    if (query.startsWith("--", i)) {
      // MySQL requires whitespace after '--'; do not silently hide executable SQL.
      if (dialect !== "sqlserver" && i + 2 < query.length && !whitespace.test(query[i + 2])) throw invalidQuery();
      i += 2;
      while (i < query.length && query[i] !== "\n" && query[i] !== "\r") i++;
      continue;
    }
    if (query.startsWith("/*", i)) {
      // MySQL/MariaDB executable comments and optimizer hints can change semantics.
      if (/[!+]/.test(query[i + 2] || "") || /^M!/i.test(query.slice(i + 2, i + 4))) throw invalidQuery();
      const end = query.indexOf("*/", i + 2);
      if (end < 0 || query.slice(i + 2, end).includes("/*")) throw invalidQuery();
      i = end + 2;
      continue;
    }
    if (c === "#" && dialect === "mysql") {
      while (i < query.length && query[i] !== "\n" && query[i] !== "\r") i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || (c === "[" && dialect !== "mysql")) {
      const close = c === "[" ? "]" : c;
      i++;
      let closed = false;
      while (i < query.length) {
        // Backslash escapes depend on SQL_MODE / dialect. Never guess quote boundaries.
        if (query[i] === "\\") throw invalidQuery();
        if (query[i] === close) {
          if (query[i + 1] === close) { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw invalidQuery();
      push(c === "'" ? "literal" : "identifier", start);
      continue;
    }
    if (c === "$") {
      i++;
      while (/[0-9]/.test(query[i] || "")) i++;
      const digits = query.slice(start + 1, i);
      if (!/^[1-9][0-9]*$/.test(digits) || wordPart.test(query[i] || "")) throw invalidParams();
      const index = Number(digits);
      if (!Number.isSafeInteger(index)) throw invalidParams();
      push("placeholder", start, index);
      continue;
    }
    if (c === "?") { i++; push("placeholder", start); continue; }
    if (c === "@" || (c === ":" && query[i + 1] !== ":" && /[A-Za-z_0-9]/.test(query[i + 1] || ""))) {
      i++;
      if (query[i] === "@") i++;
      while (wordPart.test(query[i] || "")) i++;
      push("native", start);
      continue;
    }
    if (wordStart.test(c)) {
      i++;
      while (wordPart.test(query[i] || "")) i++;
      push("word", start);
      continue;
    }
    if (/[0-9]/.test(c)) {
      i++;
      while (/[0-9]/.test(query[i] || "")) i++;
      push("number", start);
      continue;
    }
    // Unquoted identifiers are deliberately ASCII-only. Splitting Unicode names
    // could incorrectly turn an unknown/user function into an allowlisted suffix.
    if (!/[()+\-*\/%=<>!~|&^.,;:\[\]]/.test(c)) throw invalidQuery();
    if (query.startsWith("::", i)) i += 2;
    else i++;
    push("symbol", start);
  }
  return tokens;
}

function positionalBindings(tokens: Token[], params: unknown[]): Token[] {
  validateParams(params);
  const placeholders = tokens.filter(token => token.kind === "placeholder");
  const numbered = placeholders.some(token => token.index !== undefined);
  const question = placeholders.some(token => token.index === undefined);
  if (numbered && question) throw invalidParams();
  if (tokens.some(token => token.kind === "native")) {
    // A parameterless SQL Server session expression is an existing non-bind use.
    // Single-@ variables / named binds are not accepted as positional parameters.
    if (placeholders.length || params.length || tokens.some(token => token.kind === "native" && !token.text.startsWith("@@"))) throw invalidParams();
  }
  const used = new Set<number>();
  placeholders.forEach((token, ordinal) => {
    const index = token.index ?? ordinal + 1;
    if (index > params.length) throw invalidParams();
    used.add(index);
  });
  // No silent unused values (including gaps such as only $3 with three values).
  if (used.size !== params.length) throw invalidParams();
  return placeholders;
}

/**
 * Accepts $1..$N (repeated/reordered) OR sequential ?, never mixed/native binds.
 * MySQL values follow occurrences; names is empty. SQL Server values/names follow
 * first occurrence of each distinct bind; repeated $N reuse the same native name.
 * Untouched spans (literals, quoted identifiers, ordinary comments) remain exact.
 */
export function compilePositionalQuery(
  query: string,
  params: unknown[],
  dialect: Dialect,
): { sql: string; values: unknown[]; names: string[] } {
  if (dialect !== "mysql" && dialect !== "sqlserver") throw invalidQuery();
  const tokens = tokenize(query, dialect);
  const placeholders = positionalBindings(tokens, params);
  const values: unknown[] = [];
  const names: string[] = [];
  const bound = new Set<number>();
  const chunks: string[] = [];
  let previous = 0;
  placeholders.forEach((token, ordinal) => {
    const index = token.index ?? ordinal + 1;
    chunks.push(query.slice(previous, token.start));
    if (dialect === "mysql") {
      chunks.push("?");
      values.push(params[index - 1]);
    } else {
      const name = `safatle_p${index}`;
      chunks.push(`@${name}`);
      if (!bound.has(index)) {
        bound.add(index);
        names.push(name);
        values.push(params[index - 1]);
      }
    }
    previous = token.end;
  });
  chunks.push(query.slice(previous));
  return { sql: chunks.join(""), values, names };
}

/** Account-only compilation for the safe driver methods; never rewrites values. */
export function compileReadOnlyAccountQuery(
  query: string,
  params: unknown[],
  dialect: ReadOnlyDialect,
): { sql: string; values: unknown[]; names: string[] } {
  assertReadOnlyAccountQuery(query, params);
  if (dialect === "mysql" || dialect === "sqlserver") return compilePositionalQuery(query, params, dialect);
  if (dialect !== "oracle" && dialect !== "postgres") throw invalidQuery();
  const tokens = tokenize(query);
  const placeholders = positionalBindings(tokens, params);
  const chunks: string[] = [];
  let previous = 0;
  placeholders.forEach(token => {
    chunks.push(query.slice(previous, token.start), dialect === "oracle" ? ":safatle_p1" : "$1");
    previous = token.end;
  });
  // Oracle execute does not accept a SQL statement terminator. Remove the actual
  // final semicolon token only, not semicolons in literals/comments.
  const terminator = dialect === "oracle" ? tokens.find(token => token.text === ";") : undefined;
  if (terminator) {
    chunks.push(query.slice(previous, terminator.start), query.slice(terminator.end));
  } else chunks.push(query.slice(previous));
  return { sql: chunks.join(""), values: [...params], names: dialect === "oracle" ? ["safatle_p1"] : [] };
}

const forbiddenWords = new Set((
  "INSERT UPDATE DELETE MERGE REPLACE UPSERT CREATE ALTER DROP TRUNCATE RENAME " +
  "GRANT REVOKE DENY CALL EXEC EXECUTE DO DECLARE BEGIN END COMMIT ROLLBACK SAVEPOINT " +
  "SET RESET SESSION TRANSACTION USE ATTACH DETACH VACUUM ANALYZE ANALYSE OPTIMIZE " +
  "REPAIR FLUSH KILL SHUTDOWN LOAD UNLOAD COPY BULK BACKUP RESTORE DBCC PRAGMA " +
  "INTO OUTFILE DUMPFILE FOR LOCK LOCKS LOCKED UNLOCK UPDLOCK XLOCK HOLDLOCK " +
  "TABLOCK TABLOCKX NOLOCK READPAST SERIALIZABLE READCOMMITTED SNAPSHOT " +
  "NEXTVAL SETVAL OPENROWSET OPENQUERY OPENDATASOURCE WAITFOR DELAY " +
  "PROCEDURE FUNCTION TRIGGER SEQUENCE SYNONYM RETURNING RETURN OUTPUT " +
  "SQL_CALC_FOUND_ROWS SQL_BUFFER_RESULT HIGH_PRIORITY STRAIGHT_JOIN " +
  "IDENTIFIED PASSWORD HANDLER PREPARE DEALLOCATE LISTEN NOTIFY UNLISTEN " +
  "OPTION GO OUT APPLY LATERAL PIVOT UNPIVOT"
).split(/\s+/));
// END is needed by ordinary CASE expressions (not procedural BEGIN/END blocks).
forbiddenWords.delete("END");

// Only unqualified, reviewed builtins. UDFs, schema-qualified calls and unknown
// functions (including table-valued functions) must be reviewed, not guessed safe.
const safeFunctions = new Set((
  "ABS CEIL CEILING FLOOR ROUND TRUNC TRUNCATE SIGN MOD POWER SQRT " +
  "COUNT SUM AVG MIN MAX COALESCE NULLIF IFNULL ISNULL NVL NVL2 GREATEST LEAST " +
  "CAST CONVERT TRY_CAST TRY_CONVERT TO_CHAR TO_DATE TO_NUMBER DATE_FORMAT " +
  "UPPER LOWER LENGTH CHAR_LENGTH CHARACTER_LENGTH LEN OCTET_LENGTH " +
  "TRIM LTRIM RTRIM SUBSTRING SUBSTR LEFT RIGHT REPLACE CONCAT CONCAT_WS " +
  "EXTRACT DATE YEAR MONTH DAY DAYOFMONTH DATEPART DATEDIFF DATEADD " +
  "ROW_NUMBER RANK DENSE_RANK CHARINDEX INSTR POSITION " +
  "CHAR VARCHAR NCHAR NVARCHAR DECIMAL NUMERIC NUMBER FLOAT DOUBLE SIGNED UNSIGNED"
).split(/\s+/));
const groupingWords = new Set((
  "SELECT DISTINCT ALL AS IN EXISTS NOT AND OR ON WHERE HAVING FROM JOIN " +
  "OVER PARTITION BY ORDER WHEN THEN ELSE CASE UNION INTERSECT EXCEPT TOP"
).split(/\s+/));

function upper(token: Token | undefined): string {
  return token?.kind === "word" ? token.text.toUpperCase() : "";
}

/**
 * One SELECT/WITH statement and exactly one real account bind ($1 or ?).
 * Optional trailing semicolon and ordinary comments are allowed. This checks
 * lexical shape, not the semantic account filter, views, synonyms or DB grants.
 */
export function assertReadOnlyAccountQuery(query: string, params: unknown[]): void {
  const tokens = tokenize(query);
  const placeholders = positionalBindings(tokens, params);
  if (params.length !== 1 || !placeholders.length) throw invalidParams();
  const semicolons = tokens.filter(token => token.text === ";");
  if (semicolons.length > 1 || (semicolons.length && tokens[tokens.length - 1].text !== ";")) throw invalidQuery();
  if (semicolons.length) tokens.pop();
  if (!tokens.length) throw invalidQuery();

  const pairs = new Map<number, number>();
  const stack: number[] = [];
  tokens.forEach((token, index) => {
    if (token.text === "(") stack.push(index);
    if (token.text === ")") {
      const open = stack.pop();
      if (open === undefined) throw invalidQuery();
      pairs.set(open, index);
    }
    if (token.kind === "native" || forbiddenWords.has(upper(token))) throw invalidQuery();
    if (token.text === ":" || token.text === "[" || token.text === "]") throw invalidQuery();
    // Avoid alternative string syntaxes (Oracle q'', PostgreSQL E'', introducers).
    if (token.kind === "literal" && index > 0 && tokens[index - 1].end === token.start && tokens[index - 1].kind === "word" && upper(tokens[index - 1]) !== "N") throw invalidQuery();
  });
  if (stack.length) throw invalidQuery();

  const cteNames = new Set<number>();
  const withStarts = new Set<number>();
  const validateStatement = (start: number, end: number, depth: number): void => {
    if (depth > 64) throw invalidQuery();
    let cursor = start;
    if (upper(tokens[cursor]) === "WITH") {
      withStarts.add(cursor++);
      if (upper(tokens[cursor]) === "RECURSIVE") cursor++;
      do {
        if (!["word", "identifier"].includes(tokens[cursor]?.kind)) throw invalidQuery();
        cteNames.add(cursor++);
        if (tokens[cursor]?.text === "(") {
          const close = pairs.get(cursor);
          if (close === undefined || close >= end) throw invalidQuery();
          // A CTE column list can only contain names separated by commas.
          for (let j = cursor + 1; j < close; j++) {
            if ((j - cursor) % 2 === 1 ? !["word", "identifier"].includes(tokens[j].kind) : tokens[j].text !== ",") throw invalidQuery();
          }
          if ((close - cursor) % 2 !== 0) throw invalidQuery();
          cursor = close + 1;
        }
        if (upper(tokens[cursor++]) !== "AS" || tokens[cursor]?.text !== "(") throw invalidQuery();
        const close = pairs.get(cursor);
        if (close === undefined || close >= end) throw invalidQuery();
        validateStatement(cursor + 1, close, depth + 1);
        cursor = close + 1;
        if (tokens[cursor]?.text !== ",") break;
        cursor++;
      } while (cursor < end);
    }
    if (upper(tokens[cursor]) !== "SELECT") throw invalidQuery();
    const firstSelect = cursor;
    for (; cursor < end; cursor++) {
      if (tokens[cursor].text === "(") {
        const close = pairs.get(cursor);
        if (close === undefined || close >= end) throw invalidQuery();
        if (["SELECT", "WITH"].includes(upper(tokens[cursor + 1]))) validateStatement(cursor + 1, close, depth + 1);
        cursor = close;
        continue;
      }
      if (upper(tokens[cursor]) === "WITH") throw invalidQuery(); // e.g. table hints
      if (upper(tokens[cursor]) === "SELECT" && cursor !== firstSelect) {
        let previous = cursor - 1;
        if (["ALL", "DISTINCT"].includes(upper(tokens[previous]))) previous--;
        if (!["UNION", "INTERSECT", "EXCEPT"].includes(upper(tokens[previous]))) throw invalidQuery();
      }
    }
  };
  validateStatement(0, tokens.length, 0);

  tokens.forEach((token, index) => {
    if (upper(token) === "WITH" && !withStarts.has(index)) throw invalidQuery();
    if (tokens[index + 1]?.text !== "(" || cteNames.has(index)) return;
    if (token.kind !== "word" && token.kind !== "identifier") return;
    if (tokens[index - 1]?.text === "." || token.kind === "identifier") throw invalidQuery();
    if (!safeFunctions.has(upper(token)) && !groupingWords.has(upper(token))) throw invalidQuery();
  });
}
