import { TRPCError } from "@trpc/server";
import { and, eq, like } from "drizzle-orm";
import { integracaoConexoes, integracaoMapeamentos } from "../drizzle/schema";
import { assertReadOnlyAccountQuery } from "./connectors/sqlQuerySafety";
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
const QUERY_EASYVISION_ARQATEND = `SELECT CASE WHEN CAST(b.numconta AS VARCHAR(50)) = CAST($1 AS VARCHAR(50)) THEN CAST(b.numconta AS VARCHAR(50)) ELSE CAST(COALESCE(arq.numatend, b.numconta) AS VARCHAR(50)) END AS numconta, CAST(COALESCE(arq.numatend, b.numatend, b.numconta) AS VARCHAR(50)) AS numatend, COALESCE(NULLIF(TRIM(b.guiacobra), ''), NULLIF(TRIM(REPLACE(REPLACE(REPLACE(b.aihguia, CHR(13), ''), CHR(10), ''), CHR(9), '')), ''), NULLIF(TRIM(REPLACE(REPLACE(REPLACE(arq.aihguia, CHR(13), ''), CHR(10), ''), CHR(9), '')), ''), CAST(COALESCE(arq.numatend, b.numconta) AS VARCHAR(50))) AS guiacobra, REPLACE(REPLACE(REPLACE(COALESCE(b.aihguia, arq.aihguia), CHR(13), ''), CHR(10), ''), CHR(9), '') AS aihguia, TRIM(COALESCE(b.descricao, pac.nomepac)) AS nomepaciente, TRIM(COALESCE(NULLIF(TRIM(b.matricula), ''), arq.matriatend)) AS matricula, CASE WHEN TRIM(UPPER(cc.nomeconv)) IN ('IPASGO', 'IPASGO - TUSS', 'IPASGO - PP') THEN 'Ipasgo' WHEN TRIM(UPPER(cc.nomeconv)) IN ('UNIMED', 'UNIMED TISS 3.02', 'UNIMED CENTRO CLINICO', 'UNIMED-PP') THEN 'Unimed' WHEN TRIM(UPPER(cc.nomeconv)) = 'BRADESCO SAUDE' THEN 'Bradesco' WHEN TRIM(UPPER(cc.nomeconv)) = 'SUL AMERICA' THEN 'Sulamerica' WHEN TRIM(UPPER(cc.nomeconv)) = 'AFFEGO SAUDE' THEN 'Affego' WHEN TRIM(UPPER(cc.nomeconv)) = 'VIVACOM PLANOS DE SAUDE' THEN 'Vivacom' WHEN TRIM(UPPER(cc.nomeconv)) = 'SAUDE ITAU' THEN 'Fundação Itau' WHEN TRIM(UPPER(cc.nomeconv)) = 'EMBRAPA' THEN 'Casembrapa' WHEN TRIM(UPPER(cc.nomeconv)) = 'MEDERVICE' THEN 'Mediservice' WHEN TRIM(UPPER(cc.nomeconv)) = 'SAMP/AGMP' THEN 'Samp' WHEN TRIM(UPPER(cc.nomeconv)) = 'MAIS SAUDE' THEN 'Mais Saude Plano De Saude Ltda' WHEN TRIM(UPPER(cc.nomeconv)) IN ('FMS - FUNDO MUNICIPAL DE SAUDE', 'SUS', 'SIH', 'APAC', 'BPA') THEN 'Fundo Municipal de Saude - SUS' WHEN TRIM(UPPER(cc.nomeconv)) LIKE 'PARTICULAR%' THEN 'Particular' ELSE TRIM(cc.nomeconv) END AS nomeconv, TO_CHAR(COALESCE(b.dataint, arq.datatend), 'YYYY-MM') AS mesprod, COALESCE(b.dataint, arq.datatend) AS dataint, COALESCE(b.datasai, arq.datasai) AS datasai, COALESCE(b.tipoatend, arq.tipoatend) AS tipoatend, b.protocolo AS protocolo, c.numfatura AS numfatura, COALESCE(b.codplaco, arq.codplaco) AS codplaco, cdp.nomeplaco AS nomeplaco, a.data AS data, a.tipoproc AS tipoproc, a.procdisco AS procdisco, a.codproprio AS codproprio, a.descricao AS descricao, cdc.nomecc AS nomecc, cp.nomeprest AS nomeprest, cpc.nomeprest AS nomemedsolic, CASE WHEN SUM(a.vlunitab) IS NULL THEN 0 ELSE SUM(a.vlunitab) END AS vl_unitario, SUM(a.quantidade) AS quantidade, CASE WHEN SUM(a.vltotreais) IS NULL THEN 0 ELSE SUM(a.vltotreais) END AS vl_faturado FROM arqatend arq LEFT JOIN cadpac pac ON pac.codpac = arq.codpac LEFT JOIN contas b ON b.numatend = arq.numatend AND (CAST(b.numconta AS VARCHAR(50)) = CAST($1 AS VARCHAR(50)) OR b.numconta = (SELECT MAX(b2.numconta) FROM contas b2 WHERE b2.numatend = arq.numatend)) LEFT JOIN lancamen a ON a.numconta = b.numconta LEFT JOIN faturas c ON c.numfatura = b.numfatura LEFT JOIN cadplaco cdp ON cdp.codplaco = COALESCE(b.codplaco, arq.codplaco) LEFT JOIN cadconv cc ON cc.codconv = COALESCE(c.codconv, cdp.codconv) LEFT JOIN cadprest cp ON cp.codprest = a.prestexe LEFT JOIN cadprest cpc ON cpc.codprest = COALESCE(b.medsolic, arq.codprest) LEFT JOIN cadcc cdc ON cdc.codcc = a.codcc WHERE arq.numatend = CAST($1 AS NUMERIC) OR b.numconta = CAST($1 AS NUMERIC) GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23`;
  const rawQuery = String(map.queryOrigem);
  const query = connection.tipo === "postgresql" && /FROM\s+lancamen\s+a\s+LEFT\s+JOIN\s+contas\s+b/i.test(rawQuery) ? QUERY_EASYVISION_ARQATEND : rawQuery;
  return { query, tipo: String(connection.tipo), configSource: `Integrador #${map.id}`,
    config: { host: connection.host, port: Number(connection.porta), database: connection.banco, user: connection.usuario,
      password: Buffer.from(connection.senhaEncriptada, "base64").toString("utf8"), ssl: connection.ssl === "sim" } };
}
export async function lerContaFabricaBanco(db: any, hospitalId: number, numeroConta: string) {
  const origin = await configuracaoFabricaBanco(db, hospitalId);
  const params = [numeroConta.trim()];
  // Validação lexical ANTES de conectar, inclusive para usuários somente visualizadores.
  try { assertReadOnlyAccountQuery(origin.query, params); }
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
