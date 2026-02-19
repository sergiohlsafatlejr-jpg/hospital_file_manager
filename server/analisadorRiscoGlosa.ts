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

      // 1. Buscar dados de faturamento e recebimento dos últimos N meses
      const dataLimite = new Date();
      dataLimite.setMonth(dataLimite.getMonth() - mesesHistorico);

      let query = sql`
        SELECT 
          ft.codigo_item as codigoItem,
          ft.descricao_item as descricaoItem,
          COUNT(DISTINCT ft.id) as totalFaturado,
          SUM(CAST(ft.valor_faturado AS DECIMAL(12,2))) as valorTotalFaturado,
          AVG(CAST(ft.valor_faturado AS DECIMAL(12,2))) as valorMedioFaturado,
          
          -- Dados de recebimento (join com recebimento_tiss)
          COUNT(DISTINCT CASE WHEN rt.valor_liberado > 0 THEN rt.id END) as totalRecebido,
          SUM(CASE WHEN rt.valor_liberado > 0 THEN CAST(rt.valor_liberado AS DECIMAL(12,2)) ELSE 0 END) as valorTotalRecebido,
          AVG(CASE WHEN rt.valor_liberado > 0 THEN CAST(rt.valor_liberado AS DECIMAL(12,2)) ELSE NULL END) as valorMedioRecebido,
          
          -- Dados de glosa
          COUNT(DISTINCT CASE WHEN rt.valor_glosado > 0 THEN rt.id END) as totalGlosado,
          SUM(CASE WHEN rt.valor_glosado > 0 THEN CAST(rt.valor_glosado AS DECIMAL(12,2)) ELSE 0 END) as valorTotalGlosado,
          AVG(CASE WHEN rt.valor_glosado > 0 THEN CAST(rt.valor_glosado AS DECIMAL(12,2)) ELSE NULL END) as valorMedioGlosado
          
        FROM faturamento_tiss ft
        LEFT JOIN recebimento_tiss rt 
          ON ft.codigo_item = rt.codigo_item
          AND ft.estabelecimentoId = rt.estabelecimentoId
          AND ft.convenioId = rt.convenioId
          AND DATE(ft.data_importacao) >= DATE(${dataLimite})
          AND DATE(rt.data_importacao) >= DATE(${dataLimite})
        
        WHERE ft.estabelecimentoId = ${estabelecimentoId}
          ${convenioId ? sql`AND ft.convenioId = ${convenioId}` : sql``}
          AND DATE(ft.data_importacao) >= DATE(${dataLimite})
        
        GROUP BY ft.codigo_item, ft.descricao_item
        ORDER BY totalFaturado DESC
      `;

      const resultados = await db.execute(query);
      const dados = (resultados as any[]) || [];

      // 2. Processar resultados e calcular métricas
      const padroes: PadraoRecebimento[] = [];

      for (const row of dados) {
        const totalFaturado = Number(row.totalFaturado) || 0;
        const totalRecebido = Number(row.totalRecebido) || 0;
        const totalGlosado = Number(row.totalGlosado) || 0;

        const taxaGlosa = totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0;
        const taxaRecebimento = totalFaturado > 0 ? (totalRecebido / totalFaturado) * 100 : 0;

        // 3. Buscar motivos de glosa mais frequentes para este item
        const motivosQuery = sql`
          SELECT 
            rt.codigo_glosa as codigo,
            rt.descricao_glosa as descricao,
            COUNT(*) as frequencia
          FROM recebimento_tiss rt
          WHERE rt.codigo_item = ${row.codigoItem}
            AND rt.estabelecimentoId = ${estabelecimentoId}
            ${convenioId ? sql`AND rt.convenioId = ${convenioId}` : sql``}
            AND rt.valor_glosado > 0
            AND DATE(rt.data_importacao) >= DATE(${dataLimite})
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

      logger.info({
        message: "Iniciando análise de risco de conta",
        estabelecimentoId,
        convenioId,
        numeroGuia,
        totalItens: itens.length,
      });

      // 1. Buscar padrões de recebimento
      const padroes = await this.analisarPadroesRecebimento(
        estabelecimentoId,
        convenioId,
        mesesHistorico
      );

      // 2. Criar mapa de padrões para acesso rápido
      const mapaPatroes = new Map<string, PadraoRecebimento>();
      padroes.forEach((p) => mapaPatroes.set(p.codigoItem, p));

      // 3. Analisar cada item da conta
      const itensAnalise = itens.map((item) => {
        const padrao = mapaPatroes.get(item.codigoItem);

        if (!padrao) {
          return {
            codigoItem: item.codigoItem,
            descricaoItem: item.descricaoItem,
            quantidade: item.quantidade,
            valorFaturado: item.valorFaturado,
            riscoPrevisto: "medio" as const,
            taxaGlosaEsperada: 10, // Padrão para itens desconhecidos
            motivosGlosaProvaveis: ["Item sem histórico de recebimento"],
          };
        }

        return {
          codigoItem: item.codigoItem,
          descricaoItem: item.descricaoItem,
          quantidade: item.quantidade,
          valorFaturado: item.valorFaturado,
          riscoPrevisto: padrao.risco,
          taxaGlosaEsperada: padrao.taxaGlosa,
          motivosGlosaProvaveis: padrao.motivosGlosaFrequentes
            .slice(0, 3)
            .map((m) => `${m.codigo}: ${m.descricao} (${m.percentual.toFixed(0)}%)`),
        };
      });

      // 4. Calcular score de risco da conta
      const riscoPriority = { critico: 4, alto: 3, medio: 2, baixo: 1 };
      const scoreRisco = Math.round(
        (itensAnalise.reduce((sum, item) => sum + riscoPriority[item.riscoPrevisto], 0) /
          itensAnalise.length) *
          25
      );

      // 5. Classificar risco geral da conta
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

      // 6. Gerar alertas
      const motivosAlerta: string[] = [];

      // Alertas por risco de itens
      const itensAltoRisco = itensAnalise.filter((i) => i.riscoPrevisto === "critico" || i.riscoPrevisto === "alto");
      if (itensAltoRisco.length > 0) {
        motivosAlerta.push(
          `${itensAltoRisco.length} item(ns) com alto risco de glosa`
        );
      }

      // Alerta por valor total
      const valorTotal = itensAnalise.reduce((sum, i) => sum + i.valorFaturado, 0);
      const taxaGlosaEsperada =
        itensAnalise.reduce((sum, i) => sum + i.taxaGlosaEsperada * i.valorFaturado, 0) /
        valorTotal;

      if (taxaGlosaEsperada > 20) {
        motivosAlerta.push(
          `Taxa de glosa esperada elevada: ${taxaGlosaEsperada.toFixed(1)}%`
        );
      }

      logger.info({
        message: "Análise de risco de conta concluída",
        numeroGuia,
        riscoConta,
        scoreRisco,
        motivosAlerta: motivosAlerta.length,
      });

      return {
        numeroGuia,
        convenioId,
        valorFaturado: valorTotal,
        itens: itensAnalise,
        riscoConta,
        scoreRisco,
        motivosAlerta,
      };
    } catch (error) {
      logger.error({
        message: "Erro ao analisar risco de conta",
        error: String(error),
        numeroGuia,
      });
      throw error;
    }
  }

  /**
   * Identifica contas com maior risco em um arquivo XML importado
   */
  static async identificarContasComRisco(
    estabelecimentoId: number,
    convenioId: number,
    arquivoId: number,
    limiteRisco: "alto" | "critico" = "alto"
  ): Promise<AnaliseRiscoConta[]> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar todas as guias do arquivo
      let query = sql`
        SELECT DISTINCT 
          numero_guia_prestador as numeroGuia,
          SUM(CAST(valor_faturado AS DECIMAL(12,2))) as valorTotal
        FROM faturamento_tiss
        WHERE estabelecimentoId = ${estabelecimentoId}
          AND convenioId = ${convenioId}
          AND arquivo_id = ${arquivoId}
        GROUP BY numero_guia_prestador
      `;

      const guias = await db.execute(query);
      const guiasArray = (guias as any[]) || [];

      // 2. Para cada guia, buscar itens e analisar risco
      const contasComRisco: AnaliseRiscoConta[] = [];

      for (const guia of guiasArray) {
        // Buscar itens da guia
        let itensQuery = sql`
          SELECT 
            codigo_item as codigoItem,
            descricao_item as descricaoItem,
            quantidade,
            valor_faturado as valorFaturado
          FROM faturamento_tiss
          WHERE estabelecimentoId = ${estabelecimentoId}
            AND convenioId = ${convenioId}
            AND numero_guia_prestador = ${guia.numeroGuia}
            AND arquivo_id = ${arquivoId}
        `;

        const itensResultado = await db.execute(itensQuery);
        const itens = (itensResultado as any[]) || [];

        // Analisar risco
        const analise = await this.analisarRiscoConta(
          estabelecimentoId,
          convenioId,
          guia.numeroGuia,
          itens.map((i: any) => ({
            codigoItem: i.codigoItem,
            descricaoItem: i.descricaoItem,
            quantidade: Number(i.quantidade) || 1,
            valorFaturado: parseFloat(i.valorFaturado || 0),
          }))
        );

        // Filtrar por limite de risco
        const riscoPriority = { critico: 0, alto: 1, medio: 2, baixo: 3 };
        if (riscoPriority[analise.riscoConta] <= riscoPriority[limiteRisco]) {
          contasComRisco.push(analise);
        }
      }

      // 3. Ordenar por score de risco
      contasComRisco.sort((a, b) => b.scoreRisco - a.scoreRisco);

      logger.info({
        message: "Identificação de contas com risco concluída",
        arquivoId,
        contasComRisco: contasComRisco.length,
      });

      return contasComRisco;
    } catch (error) {
      logger.error({
        message: "Erro ao identificar contas com risco",
        error: String(error),
        arquivoId,
      });
      throw error;
    }
  }
}
