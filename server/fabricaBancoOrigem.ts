import { TRPCError } from "@trpc/server";
import { and, eq, like } from "drizzle-orm";
import { integracaoConexoes, integracaoMapeamentos } from "../drizzle/schema";
import { compileReadOnlyAccountQuery } from "./connectors/sqlQuerySafety";
import { MysqlConnector } from "./connectors/MysqlConnector";
import { SqlServerConnector } from "./connectors/SqlServerConnector";
import { OracleConnector } from "./connectors/OracleConnector";
import { EasyVisionConnector } from "./connectors/EasyVisionConnector";

/** Não usa ENV nem cache/query_config sem conexão proprietária. Configuração ambígua não autoriza origem. */
export async function configuracaoFabricaBanco(db: any, hospitalId: number) {
  const maps = await db.select().from(integracaoMapeamentos).where(and(
    eq(integracaoMapeamentos.estabelecimentoId, hospitalId), eq(integracaoMapeamentos.ativo, "sim"), like(integracaoMapeamentos.nome, "%Busca Conta%"),
  ));
  if (maps.length !== 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure exatamente um mapeamento Busca Conta ativo para o hospital proprietário." });
  const map = maps[0];
  if (Number(map.estabelecimentoId) !== hospitalId || map.ativo !== "sim" || !map.queryOrigem || !map.conexaoOrigemId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Mapeamento Busca Conta incompleto ou de outro hospital." });
  }
  const rows = await db.select().from(integracaoConexoes).where(and(
    eq(integracaoConexoes.id, map.conexaoOrigemId), eq(integracaoConexoes.estabelecimentoId, hospitalId), eq(integracaoConexoes.ativo, "sim"),
  ));
  const connection = rows[0];
  if (rows.length !== 1 || Number(connection.id) !== Number(map.conexaoOrigemId) || Number(connection.estabelecimentoId) !== hospitalId || connection.ativo !== "sim"
    || !["mysql", "sqlserver", "postgresql", "oracle"].includes(connection.tipo)
    || !connection.host || !connection.banco || !connection.usuario || !connection.senhaEncriptada || !connection.porta) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A conexão deve estar ativa, completa e pertencer ao hospital proprietário." });
  }
  // A query aprovada é a fonte do escopo: não inferir ERP/template nem substituir
  // JOINs, filtros ou identificadores. Binds são compilados pelo connector seguro.
  const query = String(map.queryOrigem);
  return { query, tipo: String(connection.tipo), configSource: `Integrador #${map.id}`,
    config: { host: connection.host, port: Number(connection.porta), database: connection.banco, user: connection.usuario,
      password: Buffer.from(connection.senhaEncriptada, "base64").toString("utf8"), ssl: connection.ssl === "sim" } };
}
export async function lerContaFabricaBanco(db: any, hospitalId: number, numeroConta: string) {
  const origin = await configuracaoFabricaBanco(db, hospitalId);
  const params = [numeroConta.trim()];
  // Validação lexical e dos binds no dialeto ANTES de conectar. O connector
  // recebe a query original e recompila para o driver, nunca recebe SQL interpolada.
  try { compileReadOnlyAccountQuery(origin.query, params, origin.tipo === "postgresql" ? "postgres" : origin.tipo as "mysql" | "sqlserver" | "oracle"); }
  catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Busca Conta exige uma única consulta parametrizada somente leitura SELECT/WITH." }); }
  const connector = origin.tipo === "mysql" ? new MysqlConnector(origin.config)
    : origin.tipo === "sqlserver" ? new SqlServerConnector(origin.config)
      : origin.tipo === "oracle" ? new OracleConnector(origin.config) : new EasyVisionConnector(origin.config);
  try {
    if (typeof connector.executarQuerySomenteLeitura !== "function" || !await connector.conectar()) throw new Error("ORIGIN_UNAVAILABLE");
    const dados = await connector.executarQuerySomenteLeitura(origin.query, params);
    if (!Array.isArray(dados) || dados.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("ORIGIN_INVALID_RESPONSE");
    return { dados, configSource: origin.configSource, fonteDados: "BANCO_REMOTO" as const };
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A leitura do hospital não foi concluída. Nenhum cache ou snapshot anterior foi aplicado." });
  } finally {
    try { await connector.desconectar(); }
    catch { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível encerrar a leitura hospitalar com segurança." }); }
  }
}
