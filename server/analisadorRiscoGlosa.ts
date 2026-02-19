import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";

/**
 * Interface para padrão de recebimento de um item
 */
export interface PadraoRecebimento {
  codigoItem: string;
  descricaoItem: string;
  totalFaturado: number; // Total de vezes que foi faturado
  totalRecebido: number; // Total de vezes que foi recebido
  totalGlosado: number; // Total de vezes que foi glosado
  taxaGlosa: number; // Percentual (0-100)
  taxaRecebimento: number; // Percentual (0-100)
  valorMedioFaturado: number;
  valorMedioRecebido: number;
  valorMedioGlosado: number;
  motivosGlosaFrequentes: {
    codigo: string;
    descricao: string;
    frequencia: number;
    percentual: number;
  }[];
  risco: "baixo" | "medio" | "alto" | "critico";
}

/**
 * Interface para análise de risco de uma conta
 */
export interface AnaliseRiscoConta {
  numeroGuia: string;
  convenioId: number;
  valorFaturado: number;
  itens: {
    codigoItem: string;
    descricaoItem: string;
    quantidade: number;
    valorFaturado: number;
    riscoPrevisto: "baixo" | "medio" | "alto" | "critico";
    taxaGlosaEsperada: number;
    motivosGlosaProvaveis: string[];
  }[];
  riscoConta: "baixo" | "medio" | "alto" | "critico";
  scoreRisco: number; // 0-100
  motivosAlerta: string[];
}

/**
 * Analisador de Risco de Glosa
 * Detecta padrões de recebimento e prevê risco de glosa em novas contas
 */
export class AnalisadorRiscoGlosa {
  /**
   * Analisa padrões de recebimento a partir de dados históricos
   */
  static async analisarPadroesRecebimento(
    estabelecimentoId: number,
    convenioId?: number,
    mesesHistorico: number = 12
  ): Promise<PadraoRecebimento[]> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      logger.info({
        message: "Iniciando análise de padrões de recebimento",
        estabelecimentoId,
        convenioId,
        mesesHistorico,
      });

      // 1. Buscar dados de recebimento dos últimos N meses
      const dataLimite = new Date();
      dataLimite.setMonth(dataLimite.getMonth() - mesesHistorico);

      // Query simplificada que busca dados direto da tabela recebimento_tiss
      const query = sql`
        SELECT 
          rt.codigo_item as codigoItem,
          rt.descricao_item as descricaoItem,
          COUNT(*) as totalFaturado,
          SUM(CAST(rt.valor_faturado AS DECIMAL(12,2))) as valorTotalFaturado,
          AVG(CAST(rt.valor_faturado AS DECIMAL(12,2))) as valorMedioFaturado,
          
          COUNT(CASE WHEN rt.valor_liberado > 0 THEN 1 END) as totalRecebido,
          SUM(CASE WHEN rt.valor_liberado > 0 THEN CAST(rt.valor_liberado AS DECIMAL(12,2)) ELSE 0 END) as valorTotalRecebido,
          AVG(CASE WHEN rt.valor_liberado > 0 THEN CAST(rt.valor_liberado AS DECIMAL(12,2)) ELSE NULL END) as valorMedioRecebido,
          
          COUNT(CASE WHEN rt.valor_glosado > 0 THEN 1 END) as totalGlosado,
          SUM(CASE WHEN rt.valor_glosado > 0 THEN CAST(rt.valor_glosado AS DECIMAL(12,2)) ELSE 0 END) as valorTotalGlosado,
          AVG(CASE WHEN rt.valor_glosado > 0 THEN CAST(rt.valor_glosado AS DECIMAL(12,2)) ELSE NULL END) as valorMedioGlosado
          
        FROM recebimento_tiss rt
        
        WHERE rt.estabelecimentoId = ${estabelecimentoId}
          ${convenioId ? sql`AND rt.convenioId = ${convenioId}` : sql``}
          AND rt.data_importacao >= ${dataLimite}
        
        GROUP BY rt.codigo_item, rt.descricao_item
        ORDER BY totalFaturado DESC
      `;

      const resultados = await db.execute(query);
      const dados = (resultados as any[]) || [];

      logger.info({
        message: "Dados de recebimento recuperados",
        estabelecimentoId,
        linhas: dados.length,
      });

      // 2. Processar resultados e calcular métricas
      const padroes: PadraoRecebimento[] = [];

      for (const row of dados) {
        if (!row.codigoItem) continue; // Pular se não houver código de item
        
        const totalFaturado = Number(row.totalFaturado) || 0;
        const totalRecebido = Number(row.totalRecebido) || 0;
        const totalGlosado = Number(row.totalGlosado) || 0;

        if (totalFaturado === 0) continue; // Pular se não houver faturamento

        const taxaGlosa = (totalGlosado / totalFaturado) * 100;
        const taxaRecebimento = (totalRecebido / totalFaturado) * 100;

        // 3. Buscar motivos de glosa mais frequentes para este item
        const motivosQuery = sql`
          SELECT 
            rt.codigo_glosa as codigo,
            rt.descricao_glosa as descricao,
            COUNT(*) as frequencia
          FROM recebimento_tiss rt
          WHERE rt.codigo_item = ${String(row.codigoItem).trim()}
            AND rt.estabelecimentoId = ${estabelecimentoId}
            ${convenioId ? sql`AND rt.convenioId = ${convenioId}` : sql``}
            AND rt.valor_glosado > 0
            AND DATE(rt.data_importacao) >= DATE('${dataLimite.toISOString().split('T')[0]}')
          GROUP BY rt.codigo_glosa, rt.descricao_glosa
          ORDER BY frequencia DESC
          LIMIT 5
        `;

        const motivosResultados = await db.execute(motivosQuery);
        const motivos = (motivosResultados as any[]) || [];

        const motivosGlosaFrequentes = motivos.map((m: any) => ({
          codigo: m.codigo || "N/A",
          descricao: m.descricao || "Motivo não informado",
          frequencia: Number(m.frequencia) || 0,
          percentual: totalGlosado > 0 ? (Number(m.frequencia) / totalGlosado) * 100 : 0,
        }));

        // 4. Classificar risco
        let risco: "baixo" | "medio" | "alto" | "critico";
        if (taxaGlosa < 5) {
          risco = "baixo";
        } else if (taxaGlosa < 15) {
          risco = "medio";
        } else if (taxaGlosa < 30) {
          risco = "alto";
        } else {
          risco = "critico";
        }

        padroes.push({
          codigoItem: row.codigoItem,
          descricaoItem: row.descricaoItem,
          totalFaturado,
          totalRecebido,
          totalGlosado,
          taxaGlosa: Math.round(taxaGlosa * 100) / 100,
          taxaRecebimento: Math.round(taxaRecebimento * 100) / 100,
          valorMedioFaturado: parseFloat(row.valorMedioFaturado || 0),
          valorMedioRecebido: parseFloat(row.valorMedioRecebido || 0),
          valorMedioGlosado: parseFloat(row.valorMedioGlosado || 0),
          motivosGlosaFrequentes,
          risco,
        });
      }

      // 5. Ordenar por risco
      padroes.sort((a, b) => {
        const riscoPriority = { critico: 0, alto: 1, medio: 2, baixo: 3 };
        return riscoPriority[a.risco] - riscoPriority[b.risco];
      });

      logger.info({
        message: "Análise de padrões de recebimento concluída",
        estabelecimentoId,
        padroes: padroes.length,
      });

      return padroes;
    } catch (error) {
      logger.error({
        message: "Erro ao analisar padrões de recebimento",
        error: String(error),
        estabelecimentoId,
      });
      throw error;
    }
  }

  /**
   * Analisa risco de glosa para uma conta específica
   */
  static async analisarRiscoConta(
    estabelecimentoId: number,
    convenioId: number,
    numeroGuia: string,
    itens: Array<{
      codigoItem: string;
      descricaoItem: string;
      quantidade: number;
      valorFaturado: number;
    }>,
    mesesHistorico: number = 12
  ): Promise<AnaliseRiscoConta> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const dataLimite = new Date();
      dataLimite.setMonth(dataLimite.getMonth() - mesesHistorico);

      // Buscar padrões de risco para cada item
      let scoreRiscoTotal = 0;
      const itensComRisco: AnaliseRiscoConta["itens"] = [];
      const alertas: string[] = [];

      for (const item of itens) {
        // Buscar taxa de glosa histórica para este item
        const padraoQuery = sql`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN valor_glosado > 0 THEN 1 END) as glosado,
            AVG(CASE WHEN valor_glosado > 0 THEN valor_glosado ELSE 0 END) as mediaGlosa
          FROM recebimento_tiss
          WHERE codigo_item = ${item.codigoItem}
            AND estabelecimentoId = ${estabelecimentoId}
            AND convenioId = ${convenioId}
            AND DATE(data_importacao) >= DATE('${dataLimite.toISOString().split('T')[0]}')
        `;

        const padrao = (await db.execute(padraoQuery)) as any[];
        const padraoData = padrao[0] || { total: 0, glosado: 0, mediaGlosa: 0 };

        const taxaGlosaEsperada = padraoData.total > 0 ? (padraoData.glosado / padraoData.total) * 100 : 0;
        
        // Calcular risco do item
        let riscoPrevisto: "baixo" | "medio" | "alto" | "critico";
        if (taxaGlosaEsperada < 5) {
          riscoPrevisto = "baixo";
        } else if (taxaGlosaEsperada < 15) {
          riscoPrevisto = "medio";
        } else if (taxaGlosaEsperada < 30) {
          riscoPrevisto = "alto";
        } else {
          riscoPrevisto = "critico";
        }

        // Buscar motivos de glosa frequentes
        const motivosQuery = sql`
          SELECT DISTINCT descricao_glosa
          FROM recebimento_tiss
          WHERE codigo_item = ${item.codigoItem}
            AND estabelecimentoId = ${estabelecimentoId}
            AND convenioId = ${convenioId}
            AND valor_glosado > 0
            AND DATE(data_importacao) >= DATE('${dataLimite.toISOString().split('T')[0]}')
          LIMIT 3
        `;

        const motivos = (await db.execute(motivosQuery)) as any[];
        const motivosProvaveis = motivos.map((m: any) => m.descricao_glosa || "Motivo não informado");

        itensComRisco.push({
          codigoItem: item.codigoItem,
          descricaoItem: item.descricaoItem,
          quantidade: item.quantidade,
          valorFaturado: item.valorFaturado,
          riscoPrevisto,
          taxaGlosaEsperada: Math.round(taxaGlosaEsperada * 100) / 100,
          motivosGlosaProvaveis: motivosProvaveis,
        });

        // Acumular score de risco
        const riscoPriority = { critico: 75, alto: 50, medio: 25, baixo: 0 };
        scoreRiscoTotal += riscoPriority[riscoPrevisto];

        // Adicionar alertas
        if (riscoPrevisto === "critico") {
          alertas.push(`⚠️ CRÍTICO: ${item.descricaoItem} tem ${taxaGlosaEsperada.toFixed(1)}% de taxa de glosa`);
        } else if (riscoPrevisto === "alto") {
          alertas.push(`⚠️ ALTO: ${item.descricaoItem} tem ${taxaGlosaEsperada.toFixed(1)}% de taxa de glosa`);
        }
      }

      // Calcular score final (0-100)
      const scoreRisco = itens.length > 0 ? Math.min(100, Math.round(scoreRiscoTotal / itens.length)) : 0;

      // Classificar risco geral da conta
      let riscoConta: "baixo" | "medio" | "alto" | "critico";
      if (scoreRisco < 25) {
        riscoConta = "baixo";
      } else if (scoreRisco < 50) {
        riscoConta = "medio";
      } else if (scoreRisco < 75) {
        riscoConta = "alto";
      } else {
        riscoConta = "critico";
      }

      return {
        numeroGuia,
        convenioId,
        valorFaturado: itens.reduce((sum, i) => sum + i.valorFaturado, 0),
        itens: itensComRisco,
        riscoConta,
        scoreRisco,
        motivosAlerta: alertas,
      };
    } catch (error) {
      logger.error({
        message: "Erro ao analisar risco de conta",
        error: String(error),
        estabelecimentoId,
      });
      throw error;
    }
  }

  /**
   * Identifica contas com risco em um arquivo importado
   */
  static async identificarContasComRisco(
    estabelecimentoId: number,
    arquivoId?: number,
    limiteRisco: "alto_critico" | "critico" = "alto_critico"
  ): Promise<Array<{ numeroGuia: string; scoreRisco: number; risco: string; itensProblematicos: number }>> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const limiteScore = limiteRisco === "critico" ? 75 : 50;

      // Buscar contas com risco
      const query = sql`
        SELECT 
          rt.numero_guia as numeroGuia,
          rt.convenioId,
          COUNT(DISTINCT rt.id) as totalItens,
          COUNT(CASE WHEN rt.valor_glosado > 0 THEN 1 END) as itensGlosados,
          SUM(rt.valor_glosado) as valorGlosado,
          ROUND(COUNT(CASE WHEN rt.valor_glosado > 0 THEN 1 END) * 100.0 / COUNT(DISTINCT rt.id), 2) as taxaGlosa
        FROM recebimento_tiss rt
        WHERE rt.estabelecimentoId = ${estabelecimentoId}
          ${arquivoId ? sql`AND rt.arquivo_id = ${arquivoId}` : sql``}
        GROUP BY rt.numero_guia, rt.convenioId
        HAVING taxaGlosa >= ${limiteScore / 100 * 100}
        ORDER BY taxaGlosa DESC
      `;

      const contas = (await db.execute(query)) as any[];

      return contas.map((c: any) => ({
        numeroGuia: c.numeroGuia || "N/A",
        scoreRisco: Math.min(100, Number(c.taxaGlosa) || 0),
        risco: Number(c.taxaGlosa) >= 75 ? "CRÍTICO" : Number(c.taxaGlosa) >= 50 ? "ALTO" : "MÉDIO",
        itensProblematicos: Number(c.itensGlosados) || 0,
      }));
    } catch (error) {
      logger.error({
        message: "Erro ao identificar contas com risco",
        error: String(error),
        estabelecimentoId,
      });
      return [];
    }
  }
}
