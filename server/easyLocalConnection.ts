import { isIP } from "node:net";
import pg from "pg";

export type EasyLocalConnectionResult =
  | { status: "configuracao_pendente" }
  | { status: "conectado" }
  | { status: "falha_conexao" };

type EasyLocalConnectionConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ca?: string;
};

const CLEANUP_TIMEOUT_MS = 1500;

async function closeEasyLocalClient(client: pg.Client): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.end(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          // pg 8.x: destruir o socket se o driver não completar o encerramento.
          // A consulta já terminou ou falhou e este cliente não será reutilizado.
          try {
            const connection = client as unknown as { connection?: { stream?: { destroy(): void } } };
            connection.connection?.stream?.destroy();
          } catch {
            // Falha de limpeza não deve alterar o resultado sanitizado.
          }
          resolve();
        }, CLEANUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Erros de cleanup não devem expor o driver nem o destino externo.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Configuração exclusivamente no backend. Nunca reutilizar DATABASE_URL do Portal. */
export function readEasyLocalConfig(env: NodeJS.ProcessEnv = process.env): EasyLocalConnectionConfig | null {
  const host = env.EASYLOCAL_PG_HOST?.trim();
  const port = Number(env.EASYLOCAL_PG_PORT);
  const database = env.EASYLOCAL_PG_DATABASE?.trim();
  const user = env.EASYLOCAL_PG_USER?.trim();
  const password = env.EASYLOCAL_PG_PASSWORD;
  // SYSTEM significa usar as CAs públicas confiáveis do runtime Node, não desativar TLS.
  // Um PEM customizado pode ser fornecido multiline ou com quebras de linha escapadas.
  const ca = env.EASYLOCAL_PG_CA_CERT?.replace(/\\n/g, "\n").trim();

  if (!host || !database || !user || !password || !ca || !env.EASYLOCAL_PG_PORT) return null;
  // Exigir DNS, cujo nome deve ser verificado contra o certificado do servidor.
  if (isIP(host) || host.length > 253 || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (ca !== "SYSTEM" && (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----"))) return null;
  return { host, port, database, user, password, ca: ca === "SYSTEM" ? undefined : ca };
}

/**
 * Prova restrita de conectividade: sem parâmetros SQL, sem acesso a tabelas,
 * sem log de URL, hostname, credencial, certificado ou erro bruto do driver.
 */
export async function testarConexaoEasyLocal(): Promise<EasyLocalConnectionResult> {
  const config = readEasyLocalConfig();
  if (!config) return { status: "configuracao_pendente" };

  let client: pg.Client | undefined;
  try {
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
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      statement_timeout: 5000,
      application_name: "safatle-easylocal-connectivity",
    });
    await client.connect();
    const result = await client.query("SELECT 1 AS conectividade");
    return result.rows[0]?.conectividade === 1
      ? { status: "conectado" }
      : { status: "falha_conexao" };
  } catch {
    return { status: "falha_conexao" };
  } finally {
    if (client) await closeEasyLocalClient(client);
  }
}
