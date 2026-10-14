import pg from "pg";
import {
  easyLocalOrigem,
  type EasyLocalCampoOrigem,
} from "../shared/easyLocalIntegrador";
import { resolverEasyLocalConfig } from "./easyLocalCadastroStore";

const CONNECTION_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_MS = 5000;
const CLEANUP_TIMEOUT_MS = 1500;
const MAX_ORIGENS = 200;

const CONFIGURATION_ERROR =
  "A configuração do catálogo EASYLocal está indisponível.";
const PRIVILEGED_ROLE_ERROR =
  "A credencial EASYLocal possui privilégios administrativos.";
const CATALOG_ERROR = "Não foi possível consultar o catálogo EASYLocal.";
const TOO_MANY_ORIGINS_ERROR =
  "Há mais de 200 origens elegíveis no catálogo EASYLocal.";
const INVALID_ORIGIN_ERROR = "A origem informada é inválida.";

class EasyLocalMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EasyLocalMetadataError";
  }
}

type CatalogColumnRow = {
  nome: string | null;
  tipo_postgres: string | null;
  tamanho: number | null;
  precisao: number | null;
  escala: number | null;
  nullable: string | null;
};

type CatalogOriginRow = {
  schema: string | null;
  tabela: string | null;
};

/**
 * Encerra o socket mesmo quando o driver não completar client.end(). Nenhuma falha
 * de limpeza deve vazar detalhes de rede, certificado ou credencial.
 */
async function closeEasyLocalClient(client: pg.Client): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.end(),
      new Promise<void>(resolve => {
        timer = setTimeout(() => {
          try {
            const connection = client as unknown as {
              connection?: { stream?: { destroy(): void } };
            };
            connection.connection?.stream?.destroy();
          } catch {
            // Limpeza é estritamente best effort.
          }
          resolve();
        }, CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Erros de cleanup nunca devem substituir o erro sanitizado da consulta.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function suggestedType(
  row: CatalogColumnRow
): EasyLocalCampoOrigem["tipoSugerido"] {
  switch (row.tipo_postgres) {
    case "smallint":
    case "integer":
      return "int";
    case "bigint":
      return "bigint";
    case "numeric":
    case "decimal":
      // Sem precisão/escala declaradas não há uma sugestão fiel para o formulário.
      return isSafeInteger(row.precisao) &&
        row.precisao >= 1 &&
        row.precisao <= 65 &&
        isSafeInteger(row.escala) &&
        row.escala >= 0 &&
        row.escala <= row.precisao &&
        row.escala <= 30
        ? "decimal"
        : null;
    case "character varying":
    case "character":
      return isSafeInteger(row.tamanho) &&
        row.tamanho >= 1 &&
        row.tamanho <= 4096
        ? "varchar"
        : "text";
    case "text":
      return "text";
    case "date":
      return "date";
    case "timestamp without time zone":
      return "datetime";
    case "boolean":
      return "boolean";
    // timestamp with time zone é deliberadamente incompatível: requer decisão explícita de fuso.
    default:
      return null;
  }
}

function toEasyLocalCampo(row: CatalogColumnRow): EasyLocalCampoOrigem {
  const tipoSugerido = suggestedType(row);
  const campo: EasyLocalCampoOrigem = {
    nome: typeof row.nome === "string" ? row.nome : "",
    tipoPostgres:
      typeof row.tipo_postgres === "string" ? row.tipo_postgres : "",
    tipoSugerido,
    obrigatorio: row.nullable === "NO",
  };

  if (
    tipoSugerido === "varchar" &&
    isSafeInteger(row.tamanho) &&
    row.tamanho >= 1 &&
    row.tamanho <= 4096
  ) {
    campo.tamanho = row.tamanho;
  }
  if (
    tipoSugerido === "decimal" &&
    isSafeInteger(row.precisao) &&
    isSafeInteger(row.escala)
  ) {
    campo.tamanho = row.precisao;
    campo.escala = row.escala;
  }
  return campo;
}

async function ensureNonPrivilegedRole(client: pg.Client): Promise<void> {
  const privileges = await client.query<{ privilegiada: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles r
       WHERE (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication
         OR has_database_privilege(r.oid, current_database(), 'CREATE'))
         AND (r.rolname = current_user OR pg_has_role(session_user, r.oid, 'MEMBER'))
     ) AS privilegiada`
  );

  // Rejeita também resposta parcial/desconhecida; a credencial só é aceita com false explícito.
  if (
    privileges.rows.length !== 1 ||
    privileges.rows[0]?.privilegiada !== false
  ) {
    throw new EasyLocalMetadataError(PRIVILEGED_ROLE_ERROR);
  }
}

async function withEasyLocalCatalog<T>(
  operation: (client: pg.Client) => Promise<T>
): Promise<T> {
  let client: pg.Client | undefined;
  let readOnlyTransactionStarted = false;
  try {
    const config = await resolverEasyLocalConfig();
    if (!config) throw new EasyLocalMetadataError(CONFIGURATION_ERROR);
    client = new pg.Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: {
        ...(config.ca ? { ca: config.ca } : {}),
        rejectUnauthorized: true,
        servername: config.host,
      },
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      query_timeout: QUERY_TIMEOUT_MS,
      statement_timeout: QUERY_TIMEOUT_MS,
      application_name: "safatle-easylocal-catalog",
    });
    await client.connect();
    await client.query("BEGIN READ ONLY");
    readOnlyTransactionStarted = true;
    await ensureNonPrivilegedRole(client);
    return await operation(client);
  } catch (error) {
    if (error instanceof EasyLocalMetadataError) throw error;
    throw new EasyLocalMetadataError(CATALOG_ERROR);
  } finally {
    if (client && readOnlyTransactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // client.end() abaixo ainda é obrigatório; não vazar erro do driver.
      }
    }
    if (client) await closeEasyLocalClient(client);
  }
}

/**
 * Lista apenas nomes de tabelas/views visíveis e selecionáveis. A busca usa 201
 * registros para detectar excesso e falhar, em vez de omitir silenciosamente a 201ª origem.
 */
export async function listarEasyLocalOrigens(): Promise<
  Array<{ schema: string; tabela: string }>
> {
  return withEasyLocalCatalog(async client => {
    const result = await client.query<CatalogOriginRow>(
      `SELECT table_schema AS schema, table_name AS tabela
       FROM information_schema.tables
       WHERE table_type IN ('BASE TABLE', 'VIEW')
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
         AND has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'SELECT')
       ORDER BY table_schema, table_name
       LIMIT $1`,
      [MAX_ORIGENS + 1]
    );

    if (result.rows.length > MAX_ORIGENS)
      throw new EasyLocalMetadataError(TOO_MANY_ORIGINS_ERROR);
    // information_schema entrega estes campos não nulos; manter a checagem impede propagar catálogo malformado.
    return result.rows
      .filter(
        (row): row is { schema: string; tabela: string } =>
          typeof row.schema === "string" && typeof row.tabela === "string"
      )
      .map(({ schema, tabela }) => ({ schema, tabela }));
  });
}

/**
 * Lê exclusivamente metadados de colunas da origem validada. Schema e tabela são
 * sempre parâmetros PostgreSQL, nunca interpolação de entrada de navegador.
 */
export async function detectarEasyLocalCampos(origem: {
  schema: string;
  tabela: string;
}): Promise<EasyLocalCampoOrigem[]> {
  const parsedOrigin = easyLocalOrigem.safeParse(origem);
  if (!parsedOrigin.success)
    throw new EasyLocalMetadataError(INVALID_ORIGIN_ERROR);

  return withEasyLocalCatalog(async client => {
    const result = await client.query<CatalogColumnRow>(
      `SELECT c.column_name AS nome,
              c.data_type AS tipo_postgres,
              c.character_maximum_length AS tamanho,
              c.numeric_precision AS precisao,
              c.numeric_scale AS escala,
              c.is_nullable AS nullable
       FROM information_schema.columns c
       WHERE c.table_schema = $1
         AND c.table_name = $2
         AND EXISTS (
           SELECT 1
           FROM information_schema.tables t
           WHERE t.table_schema = c.table_schema
             AND t.table_name = c.table_name
             AND t.table_type IN ('BASE TABLE', 'VIEW')
             AND has_table_privilege(current_user, format('%I.%I', t.table_schema, t.table_name), 'SELECT')
         )
       ORDER BY c.ordinal_position`,
      [parsedOrigin.data.schema, parsedOrigin.data.tabela]
    );
    return result.rows.map(toEasyLocalCampo);
  });
}
