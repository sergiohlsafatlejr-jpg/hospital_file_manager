import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./_core/logger";

/**
 * Interface para representar um padrão detectado
 */
export interface PadraoDetectado {
  codigoProcedimentoPrincipal: string;
  descricaoProcedimentoPrincipal: string;
  itensAssociados: {
    codigoItem: string;
    descricaoItem: string;
    tipoItem: string;
    frequencia: number; // Percentual (0-100)
    quantidadeMedia: number;
    valorMedio: number;
  }[];
  confianca: number; // Percentual (0-100) - quão confiável é o padrão
  totalOcorrencias: number;
  sugestaoAcao: "deve_conter" | "pode_conter";
  sugestaoInconsistencia: "alerta" | "sugerir_adicao";
  prioridade: number; // 1-10
}

/**
 * Analisador de Padrões
 * Detecta automaticamente padrões em XMLs importados
 */
export class AnalisadorPadroes {
  /**
   * Analisa XMLs importados e detecta padrões de itens
   */
  static async analisarPadroesXml(
    estabelecimentoId: number,
    convenioId?: number,
    limiteMinimoProcedimentos: number = 5
  ): Promise<PadraoDetectado[]> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      logger.info({
        message: "Iniciando análise de padrões de XMLs importados",
        estabelecimentoId,
        convenioId,
      });

      // 1. Agrupar procedimentos principais com seus itens associados
      let query = sql`
        SELECT 
          ft1.codigo_item as codigoProcedimentoPrincipal,
          ft1.descricao_item as descricaoProcedimentoPrincipal,
          ft2.codigo_item as codigoItemAssociado,
          ft2.descricao_item as descricaoItemAssociado,
          ft2.tipo_item as tipoItem,
          COUNT(*) as frequencia,
          AVG(CAST(ft2.quantidade AS DECIMAL(10,3))) as quantidadeMedia,
          AVG(CAST(ft2.valor_faturado AS DECIMAL(12,2))) as valorMedio,
          COUNT(DISTINCT ft1.numero_guia_prestador) as totalGuias
        FROM faturamento_tiss ft1
        INNER JOIN faturamento_tiss ft2 
          ON ft1.numero_guia_prestador = ft2.numero_guia_prestador 
          AND ft1.numero_guia_operadora = ft2.numero_guia_operadora
          AND ft1.id != ft2.id
        WHERE ft1.estabelecimentoId = ${estabelecimentoId}
          ${convenioId ? sql`AND ft1.convenioId = ${convenioId}` : sql``}
          AND ft1.tipo_item = 'PROCEDIMENTO'
          AND ft2.tipo_item IN ('PROCEDIMENTO', 'DESPESA')
        GROUP BY 
          ft1.codigo_item,
          ft1.descricao_item,
          ft2.codigo_item,
          ft2.descricao_item,
          ft2.tipo_item
        HAVING frequencia >= ${limiteMinimoProcedimentos}
        ORDER BY 
          codigoProcedimentoPrincipal,
          frequencia DESC
      `;

      const resultados = await db.execute(query);
      const dados = (resultados as any[]) || [];

      // 2. Processar resultados e criar padrões
      const padroes = new Map<string, PadraoDetectado>();

      for (const row of dados) {
        const chavePrincipal = row.codigoProcedimentoPrincipal;

        if (!padroes.has(chavePrincipal)) {
          padroes.set(chavePrincipal, {
            codigoProcedimentoPrincipal: row.codigoProcedimentoPrincipal,
            descricaoProcedimentoPrincipal: row.descricaoProcedimentoPrincipal,
            itensAssociados: [],
            confianca: 0,
            totalOcorrencias: 0,
            sugestaoAcao: "deve_conter",
            sugestaoInconsistencia: "alerta",
            prioridade: 5,
          });
        }

        const padrao = padroes.get(chavePrincipal)!;
        const frequenciaPercentual = Math.min(100, (row.frequencia / row.totalGuias) * 100);

        // Adicionar item associado se frequência > 30%
        if (frequenciaPercentual > 30) {
          padrao.itensAssociados.push({
            codigoItem: row.codigoItemAssociado,
            descricaoItem: row.descricaoItemAssociado,
            tipoItem: row.tipoItem,
            frequencia: Math.round(frequenciaPercentual),
            quantidadeMedia: parseFloat(row.quantidadeMedia || 0),
            valorMedio: parseFloat(row.valorMedio || 0),
          });
        }

        padrao.totalOcorrencias = row.totalGuias;
      }

      // 3. Calcular confiança e prioridade
      const padroesFinal: PadraoDetectado[] = [];

      for (const [_, padrao] of padroes) {
        if (padrao.itensAssociados.length > 0) {
          // Confiança = média das frequências dos itens
          const confiancaMedia =
            padrao.itensAssociados.reduce((sum, item) => sum + item.frequencia, 0) /
            padrao.itensAssociados.length;

          padrao.confianca = Math.round(confiancaMedia);

          // Prioridade baseada em ocorrências (quanto mais frequente, maior prioridade)
          padrao.prioridade = Math.max(1, Math.min(10, Math.ceil(padrao.totalOcorrencias / 10)));

          // Se confiança > 80%, sugerir "deve_conter", senão "pode_conter"
          padrao.sugestaoAcao = padrao.confianca > 80 ? "deve_conter" : "pode_conter";
          padrao.sugestaoInconsistencia = padrao.confianca > 80 ? "alerta" : "alerta";

          padroesFinal.push(padrao);
        }
      }

      // 4. Ordenar por confiança e ocorrências
      padroesFinal.sort((a, b) => {
        if (b.confianca !== a.confianca) return b.confianca - a.confianca;
        return b.totalOcorrencias - a.totalOcorrencias;
      });

      logger.info({
        message: "Análise de padrões concluída",
        estabelecimentoId,
        padroesFinal: padroesFinal.length,
      });

      return padroesFinal;
    } catch (error) {
      logger.error({
        message: "Erro ao analisar padrões de XMLs",
        error: String(error),
        estabelecimentoId,
      });
      throw error;
    }
  }

  /**
   * Detecta anomalias e outliers em contas
   */
  static async detectarAnomalias(
    estabelecimentoId: number,
    convenioId?: number
  ): Promise<{
    contasComValorAlto: any[];
    contasComValorBaixo: any[];
    contasComMuitosItens: any[];
  }> {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Calcular estatísticas
      let query = sql`
        SELECT 
          numero_guia_prestador,
          numero_guia_operadora,
          SUM(CAST(valor_faturado AS DECIMAL(12,2))) as totalGuia,
          COUNT(*) as totalItens,
          AVG(CAST(valor_faturado AS DECIMAL(12,2))) as valorMedio,
          STDDEV(CAST(valor_faturado AS DECIMAL(12,2))) as desvio
        FROM faturamento_tiss
        WHERE estabelecimentoId = ${estabelecimentoId}
          ${convenioId ? sql`AND convenioId = ${convenioId}` : sql``}
        GROUP BY numero_guia_prestador, numero_guia_operadora
      `;

      const resultados = await db.execute(query);
      const dados = (resultados as any[]) || [];

      // Calcular média geral e desvio padrão
      const valores = dados.map((d) => parseFloat(d.totalGuia || 0));
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      const desvio = Math.sqrt(
        valores.reduce((sum, val) => sum + Math.pow(val - media, 2), 0) / valores.length
      );

      const contasComValorAlto = dados.filter(
        (d) => parseFloat(d.totalGuia) > media + 2 * desvio
      );
      const contasComValorBaixo = dados.filter(
        (d) => parseFloat(d.totalGuia) < media - 2 * desvio && parseFloat(d.totalGuia) > 0
      );
      const contasComMuitosItens = dados.filter((d) => d.totalItens > 20);

      return {
        contasComValorAlto,
        contasComValorBaixo,
        contasComMuitosItens,
      };
    } catch (error) {
      logger.error({
        message: "Erro ao detectar anomalias",
        error: String(error),
        estabelecimentoId,
      });
      throw error;
    }
  }
}
