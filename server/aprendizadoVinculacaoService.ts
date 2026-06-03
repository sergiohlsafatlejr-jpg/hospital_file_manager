/**
 * Serviço de Aprendizado de Vinculação
 * 
 * Gerencia o ciclo de vida das regras de vinculação:
 * 1. Registra feedback (confirmação/rejeição) em cada uso
 * 2. Calcula score de confiança automaticamente
 * 3. Promove regras com alta confiança para automáticas
 * 4. Sugere promoção de regras frequentes ao usuário
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface RegraVinculacao {
  id: number;
  estabelecimentoId: number;
  convenioId: number | null;
  codigoHospital: string;
  descricaoHospital: string | null;
  codigoConvenio: string;
  descricaoConvenio: string | null;
  tipoItem: string;
  ativo: string;
  metodo_match: string;
  confianca: number | null;
  vezesAplicada: number;
  vezesConfirmada: number;
  vezesRejeitada: number;
  autoPromovida: string;
  ultimaAplicacao: string | null;
  scoreConfianca: number;
}

/**
 * Registra feedback positivo (confirmação) para uma regra de vinculação
 */
export async function confirmarVinculacao(vinculacaoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE vinculacao_codigos 
      SET vezesConfirmada = vezesConfirmada + 1, 
          vezesAplicada = vezesAplicada + 1,
          ultimaAplicacao = NOW()
      WHERE id = ${vinculacaoId}`)
  );
  
  // Verificar se deve auto-promover
  await verificarAutoPromocao(vinculacaoId);
}

/**
 * Registra feedback negativo (rejeição) para uma regra de vinculação
 */
export async function rejeitarVinculacao(vinculacaoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE vinculacao_codigos 
      SET vezesRejeitada = vezesRejeitada + 1
      WHERE id = ${vinculacaoId}`)
  );
  
  // Se muitas rejeições, desativar regra
  const regra = await db.execute(
    sql.raw(`SELECT vezesConfirmada, vezesRejeitada FROM vinculacao_codigos WHERE id = ${vinculacaoId}`)
  ) as unknown as any[];
  
  if (regra.length > 0) {
    const { vezesConfirmada, vezesRejeitada } = regra[0];
    const total = Number(vezesConfirmada) + Number(vezesRejeitada);
    if (total >= 3 && Number(vezesRejeitada) / total > 0.6) {
      // Desativar regra com mais de 60% de rejeição
      await db.execute(
        sql.raw(`UPDATE vinculacao_codigos SET ativo = 'nao', autoPromovida = 'nao' WHERE id = ${vinculacaoId}`)
      );
    }
  }
}

/**
 * Verifica se uma regra deve ser auto-promovida
 * Critérios: >= 3 confirmações, 0 rejeições, ou score >= 90%
 */
async function verificarAutoPromocao(vinculacaoId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const regra = await db.execute(
    sql.raw(`SELECT vezesConfirmada, vezesRejeitada, autoPromovida FROM vinculacao_codigos WHERE id = ${vinculacaoId}`)
  ) as unknown as any[];
  
  if (regra.length === 0) return false;
  
  const { vezesConfirmada, vezesRejeitada, autoPromovida } = regra[0];
  
  if (autoPromovida === "sim") return true;
  
  const confirmadas = Number(vezesConfirmada);
  const rejeitadas = Number(vezesRejeitada);
  const total = confirmadas + rejeitadas;
  
  // Promover se: >= 3 confirmações e 0 rejeições, ou score >= 90% com >= 5 usos
  const devePromover = (confirmadas >= 3 && rejeitadas === 0) || 
    (total >= 5 && (confirmadas / total) >= 0.9);
  
  if (devePromover) {
    await db.execute(
      sql.raw(`UPDATE vinculacao_codigos SET autoPromovida = 'sim', confianca = ${(confirmadas / total * 100).toFixed(2)} WHERE id = ${vinculacaoId}`)
    );
    return true;
  }
  
  return false;
}

/**
 * Lista regras candidatas a promoção (alta confiança mas ainda não promovidas)
 */
export async function listarCandidatasPromocao(estabelecimentoId: number): Promise<RegraVinculacao[]> {
  const db = await getDb();
  if (!db) return [];
  
  const regras = await db.execute(
    sql.raw(`SELECT *, 
      CASE WHEN (vezesConfirmada + vezesRejeitada) > 0 
        THEN ROUND(vezesConfirmada * 100.0 / (vezesConfirmada + vezesRejeitada), 2)
        ELSE 0 END as scoreConfianca
      FROM vinculacao_codigos
      WHERE estabelecimentoId = ${estabelecimentoId}
        AND ativo = 'sim'
        AND autoPromovida = 'nao'
        AND vezesConfirmada >= 2
        AND vezesRejeitada = 0
      ORDER BY vezesConfirmada DESC, vezesAplicada DESC`)
  ) as unknown as RegraVinculacao[];
  
  return regras;
}

/**
 * Promover manualmente uma regra para automática
 */
export async function promoverRegra(vinculacaoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE vinculacao_codigos SET autoPromovida = 'sim', confianca = 100.00 WHERE id = ${vinculacaoId}`)
  );
}

/**
 * Despromover uma regra (voltar para manual)
 */
export async function despromoverRegra(vinculacaoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE vinculacao_codigos SET autoPromovida = 'nao' WHERE id = ${vinculacaoId}`)
  );
}

/**
 * Listar todas as regras de vinculação com estatísticas
 */
export async function listarRegrasComEstatisticas(params: {
  estabelecimentoId: number;
  convenioId?: number;
  apenasAtivas?: boolean;
  apenasAutoPromovidas?: boolean;
}): Promise<RegraVinculacao[]> {
  const db = await getDb();
  if (!db) return [];
  
  const { estabelecimentoId, convenioId, apenasAtivas = true, apenasAutoPromovidas = false } = params;
  
  let where = `WHERE estabelecimentoId = ${estabelecimentoId}`;
  if (convenioId) where += ` AND (convenioId = ${convenioId} OR convenioId IS NULL)`;
  if (apenasAtivas) where += ` AND ativo = 'sim'`;
  if (apenasAutoPromovidas) where += ` AND autoPromovida = 'sim'`;
  
  const regras = await db.execute(
    sql.raw(`SELECT *, 
      CASE WHEN (vezesConfirmada + vezesRejeitada) > 0 
        THEN ROUND(vezesConfirmada * 100.0 / (vezesConfirmada + vezesRejeitada), 2)
        ELSE 0 END as scoreConfianca
      FROM vinculacao_codigos
      ${where}
      ORDER BY vezesAplicada DESC, createdAt DESC`)
  ) as unknown as RegraVinculacao[];
  
  return regras;
}

/**
 * Estatísticas gerais do aprendizado
 */
export async function obterEstatisticasAprendizado(estabelecimentoId: number): Promise<{
  totalRegras: number;
  regrasAtivas: number;
  regrasAutoPromovidas: number;
  totalAplicacoes: number;
  totalConfirmacoes: number;
  totalRejeicoes: number;
  taxaAcertoGeral: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const stats = await db.execute(
    sql.raw(`SELECT 
      COUNT(*) as totalRegras,
      SUM(CASE WHEN ativo = 'sim' THEN 1 ELSE 0 END) as regrasAtivas,
      SUM(CASE WHEN autoPromovida = 'sim' THEN 1 ELSE 0 END) as regrasAutoPromovidas,
      SUM(vezesAplicada) as totalAplicacoes,
      SUM(vezesConfirmada) as totalConfirmacoes,
      SUM(vezesRejeitada) as totalRejeicoes
      FROM vinculacao_codigos
      WHERE estabelecimentoId = ${estabelecimentoId}`)
  ) as unknown as any[];
  
  const s = stats[0] || {};
  const totalConf = Number(s.totalConfirmacoes) || 0;
  const totalRej = Number(s.totalRejeicoes) || 0;
  const totalFeedback = totalConf + totalRej;
  
  return {
    totalRegras: Number(s.totalRegras) || 0,
    regrasAtivas: Number(s.regrasAtivas) || 0,
    regrasAutoPromovidas: Number(s.regrasAutoPromovidas) || 0,
    totalAplicacoes: Number(s.totalAplicacoes) || 0,
    totalConfirmacoes: totalConf,
    totalRejeicoes: totalRej,
    taxaAcertoGeral: totalFeedback > 0 ? Math.round((totalConf / totalFeedback) * 100) : 0,
  };
}
