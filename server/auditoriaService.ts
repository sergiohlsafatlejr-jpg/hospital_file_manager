/**
 * Serviço de Auditoria com Diff de Dados
 * 
 * Amplia a auditoria existente (tabela auditLog) com:
 * - Registro automático de antes/depois em ações críticas
 * - Diff detalhado mostrando exatamente quais campos mudaram
 * - Categorização por módulo e tipo de operação
 * - Busca e filtros avançados
 * - Alertas para operações sensíveis
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface DiffCampo {
  campo: string;
  valorAnterior: any;
  valorNovo: any;
}

export interface RegistroAuditoria {
  id?: number;
  tabela: string;
  registroId: number;
  tipoAcao: "INSERT" | "UPDATE" | "DELETE" | "VINCULACAO" | "CONCILIACAO" | "RECURSO" | "EXPORTACAO";
  usuarioId: number;
  usuarioNome: string;
  valoresAnteriores: Record<string, any> | null;
  valoresNovos: Record<string, any> | null;
  estabelecimentoId: number;
  modulo?: string;
  descricao?: string;
  ip?: string;
}

/**
 * Registrar uma ação de auditoria com diff automático
 */
export async function registrarAuditoria(params: RegistroAuditoria): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { tabela, registroId, tipoAcao, usuarioId, usuarioNome, 
    valoresAnteriores, valoresNovos, estabelecimentoId, modulo, descricao } = params;
  
  const result = await db.execute(
    sql.raw(`INSERT INTO auditLog 
      (tabela, registroId, tipoAcao, usuarioId, usuarioNome, valoresAnteriores, valoresNovos, estabelecimentoId)
      VALUES ('${tabela}', ${registroId}, '${tipoAcao}', ${usuarioId}, 
        '${(usuarioNome || "").replace(/'/g, "''")}',
        ${valoresAnteriores ? `'${JSON.stringify(valoresAnteriores).replace(/'/g, "''")}'` : 'NULL'},
        ${valoresNovos ? `'${JSON.stringify(valoresNovos).replace(/'/g, "''")}'` : 'NULL'},
        ${estabelecimentoId})`)
  );
  
  return Number((result as any)[0]?.insertId || 0);
}

/**
 * Calcular diff entre dois objetos
 */
export function calcularDiff(anterior: Record<string, any> | null, novo: Record<string, any> | null): DiffCampo[] {
  if (!anterior && !novo) return [];
  
  const diffs: DiffCampo[] = [];
  
  if (!anterior && novo) {
    // INSERT - todos os campos são novos
    for (const [campo, valor] of Object.entries(novo)) {
      if (valor !== null && valor !== undefined) {
        diffs.push({ campo, valorAnterior: null, valorNovo: valor });
      }
    }
    return diffs;
  }
  
  if (anterior && !novo) {
    // DELETE - todos os campos são removidos
    for (const [campo, valor] of Object.entries(anterior)) {
      if (valor !== null && valor !== undefined) {
        diffs.push({ campo, valorAnterior: valor, valorNovo: null });
      }
    }
    return diffs;
  }
  
  // UPDATE - comparar campo a campo
  const todosCampos = Array.from(new Set(Object.keys(anterior!).concat(Object.keys(novo!))));
  
  for (const campo of todosCampos) {
    const valorAnt = anterior![campo];
    const valorNov = novo![campo];
    
    // Comparar valores (tratar null/undefined como iguais)
    if (valorAnt === valorNov) continue;
    if (valorAnt == null && valorNov == null) continue;
    
    // Comparar como string para evitar problemas de tipo
    const strAnt = valorAnt != null ? String(valorAnt) : null;
    const strNov = valorNov != null ? String(valorNov) : null;
    if (strAnt === strNov) continue;
    
    diffs.push({ campo, valorAnterior: valorAnt, valorNovo: valorNov });
  }
  
  return diffs;
}

/**
 * Registrar auditoria de vinculação (aceitar/rejeitar sugestão)
 */
export async function auditarVinculacao(params: {
  vinculacaoId: number;
  acao: "aceitar" | "rejeitar" | "promover" | "despromover";
  codigoHospital: string;
  codigoConvenio: string;
  usuarioId: number;
  usuarioNome: string;
  estabelecimentoId: number;
  detalhes?: Record<string, any>;
}): Promise<void> {
  const { vinculacaoId, acao, codigoHospital, codigoConvenio, 
    usuarioId, usuarioNome, estabelecimentoId, detalhes } = params;
  
  await registrarAuditoria({
    tabela: "vinculacao_codigos",
    registroId: vinculacaoId,
    tipoAcao: "VINCULACAO",
    usuarioId,
    usuarioNome,
    valoresAnteriores: { acao, codigoHospital, codigoConvenio },
    valoresNovos: detalhes || { status: acao === "aceitar" ? "aceita" : acao },
    estabelecimentoId,
  });
}

/**
 * Registrar auditoria de conciliação
 */
export async function auditarConciliacao(params: {
  arquivoDemoId: number;
  acao: "executar" | "reprocessar" | "exportar";
  usuarioId: number;
  usuarioNome: string;
  estabelecimentoId: number;
  resultados?: Record<string, any>;
}): Promise<void> {
  const { arquivoDemoId, acao, usuarioId, usuarioNome, estabelecimentoId, resultados } = params;
  
  await registrarAuditoria({
    tabela: "conciliacao",
    registroId: arquivoDemoId,
    tipoAcao: "CONCILIACAO",
    usuarioId,
    usuarioNome,
    valoresAnteriores: null,
    valoresNovos: { acao, ...resultados },
    estabelecimentoId,
  });
}

/**
 * Registrar auditoria de recurso de glosa
 */
export async function auditarRecurso(params: {
  recursoId: number;
  acao: "criar" | "enviar" | "responder" | "cancelar";
  statusAnterior: string;
  statusNovo: string;
  usuarioId: number;
  usuarioNome: string;
  estabelecimentoId: number;
  detalhes?: Record<string, any>;
}): Promise<void> {
  const { recursoId, acao, statusAnterior, statusNovo, 
    usuarioId, usuarioNome, estabelecimentoId, detalhes } = params;
  
  await registrarAuditoria({
    tabela: "recursosGlosa",
    registroId: recursoId,
    tipoAcao: "RECURSO",
    usuarioId,
    usuarioNome,
    valoresAnteriores: { status: statusAnterior, ...detalhes },
    valoresNovos: { status: statusNovo, acao },
    estabelecimentoId,
  });
}

/**
 * Buscar logs de auditoria com filtros
 */
export async function buscarAuditoria(params: {
  estabelecimentoId: number;
  tabela?: string;
  tipoAcao?: string;
  usuarioId?: number;
  dataInicio?: string;
  dataFim?: string;
  registroId?: number;
  limite?: number;
  offset?: number;
}): Promise<{ logs: any[]; total: number }> {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  
  const { estabelecimentoId, tabela, tipoAcao, usuarioId, 
    dataInicio, dataFim, registroId, limite = 50, offset = 0 } = params;
  
  let where = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (tabela) where += ` AND tabela = '${tabela}'`;
  if (tipoAcao) where += ` AND tipoAcao = '${tipoAcao}'`;
  if (usuarioId) where += ` AND usuarioId = ${usuarioId}`;
  if (registroId) where += ` AND registroId = ${registroId}`;
  if (dataInicio) where += ` AND criadoEm >= '${dataInicio}'`;
  if (dataFim) where += ` AND criadoEm <= '${dataFim}'`;
  
  const countResult = await db.execute(
    sql.raw(`SELECT COUNT(*) as total FROM auditLog ${where}`)
  ) as unknown as any[];
  const total = Number(countResult[0]?.total) || 0;
  
  const logs = await db.execute(
    sql.raw(`SELECT * FROM auditLog ${where} ORDER BY criadoEm DESC LIMIT ${limite} OFFSET ${offset}`)
  ) as unknown as any[];
  
  // Parse JSON fields
  for (const log of logs) {
    if (log.valoresAnteriores && typeof log.valoresAnteriores === "string") {
      try { log.valoresAnteriores = JSON.parse(log.valoresAnteriores); } catch {}
    }
    if (log.valoresNovos && typeof log.valoresNovos === "string") {
      try { log.valoresNovos = JSON.parse(log.valoresNovos); } catch {}
    }
    // Calcular diff
    log.diff = calcularDiff(log.valoresAnteriores, log.valoresNovos);
  }
  
  return { logs, total };
}

/**
 * Obter estatísticas de auditoria
 */
export async function obterEstatisticasAuditoria(params: {
  estabelecimentoId: number;
  dias?: number;
}): Promise<{
  totalAcoes: number;
  acoesPorTipo: Record<string, number>;
  acoesPorModulo: Record<string, number>;
  usuariosMaisAtivos: Array<{ nome: string; total: number }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, dias = 30 } = params;
  const dataLimite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  
  const where = `WHERE estabelecimentoId = ${estabelecimentoId} AND criadoEm >= '${dataLimite}'`;
  
  const totalResult = await db.execute(
    sql.raw(`SELECT COUNT(*) as total FROM auditLog ${where}`)
  ) as unknown as any[];
  
  const porTipo = await db.execute(
    sql.raw(`SELECT tipoAcao, COUNT(*) as total FROM auditLog ${where} GROUP BY tipoAcao ORDER BY total DESC`)
  ) as unknown as any[];
  
  const porModulo = await db.execute(
    sql.raw(`SELECT tabela, COUNT(*) as total FROM auditLog ${where} GROUP BY tabela ORDER BY total DESC`)
  ) as unknown as any[];
  
  const usuarios = await db.execute(
    sql.raw(`SELECT usuarioNome as nome, COUNT(*) as total FROM auditLog ${where} GROUP BY usuarioNome ORDER BY total DESC LIMIT 10`)
  ) as unknown as any[];
  
  return {
    totalAcoes: Number(totalResult[0]?.total) || 0,
    acoesPorTipo: Object.fromEntries(porTipo.map((r: any) => [r.tipoAcao, Number(r.total)])),
    acoesPorModulo: Object.fromEntries(porModulo.map((r: any) => [r.tabela, Number(r.total)])),
    usuariosMaisAtivos: usuarios.map((u: any) => ({ nome: u.nome, total: Number(u.total) })),
  };
}
