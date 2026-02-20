import { sql } from 'drizzle-orm';
import { getDb, enriquecerCodigoGlosa } from './db';
import { GLOSAS_TISS } from '../shared/glossaryGlosas';

/**
 * Obter itens agrupados por categoria (tipo_lancamento)
 */
export async function getItemsPorCategoria(input: any): Promise<any[]> {
  const db = await getDb();
  
  if (!db) return [];
  
  try {
    const result = await db.execute(
      sql`
        SELECT 
          COALESCE(ft.tipo_lancamento, 'Outros') as categoria,
          COUNT(ft.id) as quantidade,
          SUM(ft.valor_unitario * ft.quantidade) as valor
        FROM faturamento_tiss ft
        WHERE ft.estabelecimento_id = ${input.estabelecimentoId}
          ${input.anoReferencia ? sql`AND YEAR(ft.data_processamento) = ${input.anoReferencia}` : sql``}
          ${input.mesReferencia ? sql`AND MONTH(ft.data_processamento) = ${input.mesReferencia}` : sql``}
          ${input.convenioId ? sql`AND ft.convenio_id = ${input.convenioId}` : sql``}
        GROUP BY ft.tipo_lancamento
        ORDER BY valor DESC
      `
    );
    
    const total = (result as any[]).reduce((sum, row) => sum + (row.valor || 0), 0);
    
    return (result as any[]).map(row => ({
      categoria: row.categoria,
      quantidade: row.quantidade || 0,
      valor: row.valor || 0,
      percentual: total > 0 ? Math.round((row.valor / total) * 100) : 0,
      tendencia: 'stable' as const
    }));
  } catch (error) {
    console.error('Erro ao buscar itens por categoria:', error);
    return [];
  }
}

/**
 * Obter glosas agrupadas por motivo
 */
export async function getGlosasPorMotivo(input: any): Promise<any[]> {
  const db = await getDb();
  
  if (!db) return [];
  
  try {
    const result = await db.execute(
      sql`
        SELECT 
          COALESCE(ag.motivo_glosa, 'Sem Motivo') as motivo,
          COUNT(ag.id) as quantidade,
          SUM(ag.valor_glosado) as valor
        FROM analise_glosa ag
        WHERE ag.estabelecimento_id = ${input.estabelecimentoId}
          ${input.anoReferencia ? sql`AND YEAR(ag.data_analise) = ${input.anoReferencia}` : sql``}
          ${input.mesReferencia ? sql`AND MONTH(ag.data_analise) = ${input.mesReferencia}` : sql``}
          ${input.convenioId ? sql`AND ag.convenio_id = ${input.convenioId}` : sql``}
        GROUP BY ag.motivo_glosa
        ORDER BY valor DESC
      `
    );
    
    const total = (result as any[]).reduce((sum, row) => sum + (row.valor || 0), 0);
    
    return (result as any[]).map(row => ({
      motivo: enriquecerCodigoGlosa(row.motivo || ''),
      quantidade: row.quantidade || 0,
      valor: row.valor || 0,
      percentual: total > 0 ? Math.round((row.valor / total) * 100) : 0,
      porConvenio: []
    }));
  } catch (error) {
    console.error('Erro ao buscar glosas por motivo:', error);
    return [];
  }
}

/**
 * Obter performance por médico
 */
export async function getPerformanceMedico(input: any): Promise<any[]> {
  const db = await getDb();
  
  if (!db) return [];
  
  try {
    const result = await db.execute(
      sql`
        SELECT 
          ft.medico_id,
          ft.medico_nome,
          COUNT(DISTINCT ft.id) as registros,
          SUM(ft.valor_unitario * ft.quantidade) as faturado,
          COALESCE(SUM(CASE WHEN ag.id IS NOT NULL THEN ag.valor_recebido ELSE ft.valor_unitario * ft.quantidade END), 0) as recebido,
          COALESCE(SUM(ag.valor_glosado), 0) as glosado
        FROM faturamento_tiss ft
        LEFT JOIN analise_glosa ag ON ft.id = ag.faturamento_tiss_id
        WHERE ft.estabelecimento_id = ${input.estabelecimentoId}
          ${input.anoReferencia ? sql`AND YEAR(ft.data_processamento) = ${input.anoReferencia}` : sql``}
          ${input.mesReferencia ? sql`AND MONTH(ft.data_processamento) = ${input.mesReferencia}` : sql``}
        GROUP BY ft.medico_id, ft.medico_nome
        ORDER BY faturado DESC
        LIMIT 20
      `
    );
    
    return (result as any[]).map(row => {
      const faturado = row.faturado || 0;
      const glosado = row.glosado || 0;
      const taxaGlosa = faturado > 0 ? Math.round((glosado / faturado) * 100) : 0;
      
      return {
        medicoId: row.medico_id,
        medicoNome: row.medico_nome || 'Sem Médico',
        faturado,
        recebido: row.recebido || 0,
        glosado,
        taxaGlosa
      };
    });
  } catch (error) {
    console.error('Erro ao buscar performance por médico:', error);
    return [];
  }
}
