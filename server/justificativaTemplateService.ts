/**
 * Serviço de Templates de Justificativa para Recursos de Glosa
 * 
 * Gerencia templates reutilizáveis de justificativa por código de glosa.
 * Permite:
 * - Criar/editar/excluir templates
 * - Buscar templates por código de glosa
 * - Registrar uso e taxa de sucesso
 * - Sugerir templates com base no histórico
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface JustificativaTemplate {
  id: number;
  estabelecimentoId: number;
  codigoGlosa: string;
  titulo: string;
  texto: string;
  fundamentacaoLegal: string | null;
  ativo: string;
  vezesUsada: number;
  taxaSucesso: number | null;
  criadoPor: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Criar um novo template de justificativa
 */
export async function criarTemplate(params: {
  estabelecimentoId: number;
  codigoGlosa: string;
  titulo: string;
  texto: string;
  fundamentacaoLegal?: string;
  criadoPor?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, codigoGlosa, titulo, texto, fundamentacaoLegal, criadoPor } = params;
  
  const result = await db.execute(
    sql.raw(`INSERT INTO justificativas_recurso 
      (estabelecimentoId, codigoGlosa, titulo, texto, fundamentacaoLegal, criadoPor)
      VALUES (${estabelecimentoId}, '${codigoGlosa.replace(/'/g, "''")}', 
        '${titulo.replace(/'/g, "''")}', '${texto.replace(/'/g, "''")}', 
        ${fundamentacaoLegal ? `'${fundamentacaoLegal.replace(/'/g, "''")}'` : 'NULL'},
        ${criadoPor || 'NULL'})`)
  );
  
  return Number((result as any)[0]?.insertId || 0);
}

/**
 * Atualizar um template existente
 */
export async function atualizarTemplate(params: {
  id: number;
  titulo?: string;
  texto?: string;
  fundamentacaoLegal?: string | null;
  ativo?: "sim" | "nao";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { id, titulo, texto, fundamentacaoLegal, ativo } = params;
  
  const sets: string[] = [];
  if (titulo !== undefined) sets.push(`titulo = '${titulo.replace(/'/g, "''")}'`);
  if (texto !== undefined) sets.push(`texto = '${texto.replace(/'/g, "''")}'`);
  if (fundamentacaoLegal !== undefined) {
    sets.push(`fundamentacaoLegal = ${fundamentacaoLegal ? `'${fundamentacaoLegal.replace(/'/g, "''")}'` : 'NULL'}`);
  }
  if (ativo !== undefined) sets.push(`ativo = '${ativo}'`);
  
  if (sets.length === 0) return;
  
  await db.execute(
    sql.raw(`UPDATE justificativas_recurso SET ${sets.join(", ")} WHERE id = ${id}`)
  );
}

/**
 * Buscar templates por código de glosa
 */
export async function buscarTemplatesPorGlosa(params: {
  estabelecimentoId: number;
  codigoGlosa: string;
}): Promise<JustificativaTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  
  const { estabelecimentoId, codigoGlosa } = params;
  
  const templates = await db.execute(
    sql.raw(`SELECT * FROM justificativas_recurso 
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND codigoGlosa = '${codigoGlosa.replace(/'/g, "''")}'
        AND ativo = 'sim'
      ORDER BY vezesUsada DESC, taxaSucesso DESC`)
  ) as unknown as JustificativaTemplate[];
  
  return templates;
}

/**
 * Listar todos os templates de um estabelecimento
 */
export async function listarTemplates(params: {
  estabelecimentoId: number;
  apenasAtivos?: boolean;
  codigoGlosa?: string;
}): Promise<JustificativaTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  
  const { estabelecimentoId, apenasAtivos = true, codigoGlosa } = params;
  
  let where = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (apenasAtivos) where += ` AND ativo = 'sim'`;
  if (codigoGlosa) where += ` AND codigoGlosa = '${codigoGlosa.replace(/'/g, "''")}'`;
  
  const templates = await db.execute(
    sql.raw(`SELECT * FROM justificativas_recurso ${where} ORDER BY codigoGlosa, vezesUsada DESC`)
  ) as unknown as JustificativaTemplate[];
  
  return templates;
}

/**
 * Registrar uso de um template (incrementa contador)
 */
export async function registrarUsoTemplate(templateId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE justificativas_recurso SET vezesUsada = vezesUsada + 1 WHERE id = ${templateId}`)
  );
}

/**
 * Atualizar taxa de sucesso de um template
 * Chamado quando um recurso que usou esse template é respondido
 */
export async function atualizarTaxaSucesso(templateId: number, sucesso: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  // Buscar dados atuais
  const template = await db.execute(
    sql.raw(`SELECT vezesUsada, taxaSucesso FROM justificativas_recurso WHERE id = ${templateId}`)
  ) as unknown as any[];
  
  if (template.length === 0) return;
  
  const { vezesUsada, taxaSucesso } = template[0];
  const usosAnteriores = Number(vezesUsada) || 1;
  const taxaAnterior = Number(taxaSucesso) || 0;
  
  // Calcular nova taxa de sucesso (média ponderada)
  const novaTaxa = ((taxaAnterior * (usosAnteriores - 1)) + (sucesso ? 100 : 0)) / usosAnteriores;
  
  await db.execute(
    sql.raw(`UPDATE justificativas_recurso SET taxaSucesso = ${novaTaxa.toFixed(2)} WHERE id = ${templateId}`)
  );
}

/**
 * Sugerir templates com base no código de glosa e histórico de sucesso
 * Retorna os 3 melhores templates ordenados por taxa de sucesso e uso
 */
export async function sugerirTemplates(params: {
  estabelecimentoId: number;
  codigoGlosa: string;
  limite?: number;
}): Promise<JustificativaTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  
  const { estabelecimentoId, codigoGlosa, limite = 3 } = params;
  
  // Primeiro buscar templates exatos para o código de glosa
  let templates = await db.execute(
    sql.raw(`SELECT * FROM justificativas_recurso 
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND codigoGlosa = '${codigoGlosa.replace(/'/g, "''")}'
        AND ativo = 'sim'
      ORDER BY 
        CASE WHEN taxaSucesso IS NOT NULL THEN taxaSucesso ELSE 0 END DESC,
        vezesUsada DESC
      LIMIT ${limite}`)
  ) as unknown as JustificativaTemplate[];
  
  // Se não encontrou templates exatos, buscar templates genéricos (código 'GERAL')
  if (templates.length === 0) {
    templates = await db.execute(
      sql.raw(`SELECT * FROM justificativas_recurso 
        WHERE estabelecimentoId = ${estabelecimentoId} 
          AND codigoGlosa = 'GERAL'
          AND ativo = 'sim'
        ORDER BY vezesUsada DESC
        LIMIT ${limite}`)
    ) as unknown as JustificativaTemplate[];
  }
  
  return templates;
}

/**
 * Excluir (desativar) um template
 */
export async function excluirTemplate(templateId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE justificativas_recurso SET ativo = 'nao' WHERE id = ${templateId}`)
  );
}

/**
 * Obter estatísticas dos templates por estabelecimento
 */
export async function obterEstatisticasTemplates(estabelecimentoId: number): Promise<{
  totalTemplates: number;
  templatesAtivos: number;
  totalUsos: number;
  taxaSucessoMedia: number;
  topCodigosGlosa: Array<{ codigoGlosa: string; quantidade: number; taxaSucesso: number }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const stats = await db.execute(
    sql.raw(`SELECT 
      COUNT(*) as totalTemplates,
      SUM(CASE WHEN ativo = 'sim' THEN 1 ELSE 0 END) as templatesAtivos,
      SUM(vezesUsada) as totalUsos,
      AVG(CASE WHEN taxaSucesso IS NOT NULL THEN taxaSucesso ELSE NULL END) as taxaSucessoMedia
      FROM justificativas_recurso
      WHERE estabelecimentoId = ${estabelecimentoId}`)
  ) as unknown as any[];
  
  const topCodigos = await db.execute(
    sql.raw(`SELECT codigoGlosa, COUNT(*) as quantidade, 
      AVG(CASE WHEN taxaSucesso IS NOT NULL THEN taxaSucesso ELSE NULL END) as taxaSucesso
      FROM justificativas_recurso
      WHERE estabelecimentoId = ${estabelecimentoId} AND ativo = 'sim'
      GROUP BY codigoGlosa
      ORDER BY COUNT(*) DESC
      LIMIT 10`)
  ) as unknown as any[];
  
  const s = stats[0] || {};
  
  return {
    totalTemplates: Number(s.totalTemplates) || 0,
    templatesAtivos: Number(s.templatesAtivos) || 0,
    totalUsos: Number(s.totalUsos) || 0,
    taxaSucessoMedia: Number(s.taxaSucessoMedia) || 0,
    topCodigosGlosa: topCodigos.map((c: any) => ({
      codigoGlosa: c.codigoGlosa,
      quantidade: Number(c.quantidade),
      taxaSucesso: Number(c.taxaSucesso) || 0,
    })),
  };
}
