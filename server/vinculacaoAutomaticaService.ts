/**
 * Serviço de Vinculação Automática
 * 
 * Processa itens com status "desassociado" e tenta vincular automaticamente
 * usando as regras de "Vinculações Padrão" cadastradas.
 * 
 * Fluxo:
 * 1. Busca itens com status "desassociado"
 * 2. Para cada item, procura regra em vinculacoes_padrao
 * 3. Se encontrar regra, vincula automaticamente (marca como "absorvido" + atualiza glosa)
 * 4. Se não encontrar, deixa disponível para vinculação manual
 */

import { getDb, getRawPool } from "./db";
import { sql } from "drizzle-orm";

interface ItemDesassociado {
  id: number;
  numeroGuia: string;
  codigoItem: string;
  descricaoItem: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosa: number;
  estabelecimentoId: number;
  convenioId: number | null;
}

interface VinculacaoPadrao {
  id: number;
  codigoFaturado: string;
  codigoRecebido: string;
  descricaoFaturado: string;
  descricaoRecebido: string;
  ativo: boolean;
}

interface ResultadoVinculacao {
  totalProcessados: number;
  totalVinculados: number;
  totalPendentes: number;
  detalhes: {
    vinculadoAutomaticamente: Array<{ itemId: number; codigoFaturado: string; codigoRecebido: string }>;
    pendentesVinculacao: Array<{ itemId: number; codigoFaturado: string }>;
  };
}

/**
 * Processa todos os itens desassociados e tenta vincular automaticamente
 */
export async function processarVinculacoesAutomaticas(
  estabelecimentoId: number,
  competencia?: string
): Promise<ResultadoVinculacao> {
  const db = await getDb();
  const pool = await getRawPool();
  if (!db || !pool) throw new Error("Database não disponível");

  const resultado: ResultadoVinculacao = {
    totalProcessados: 0,
    totalVinculados: 0,
    totalPendentes: 0,
    detalhes: {
      vinculadoAutomaticamente: [],
      pendentesVinculacao: [],
    },
  };

  try {
    // PASSO 1: Buscar itens com status "desassociado"
    let whereClause = `WHERE ca.estabelecimentoId = ${estabelecimentoId} AND ca.statusConciliacao = 'desassociado'`;
    if (competencia) {
      whereClause += ` AND DATE_FORMAT(ca.competencia, '%Y-%m') = '${competencia}'`;
    }

    const [itensDesassociados] = await (pool as any).execute(`
      SELECT 
        ca.id,
        ca.numeroGuia,
        ca.codigoItem,
        ca.descricaoItem,
        ca.valorFaturado,
        ca.valorPago,
        ca.valorGlosa,
        ca.estabelecimentoId,
        ca.convenioId
      FROM conciliados_automatico ca
      ${whereClause}
      ORDER BY ca.numeroGuia, ca.codigoItem
    `);

    resultado.totalProcessados = itensDesassociados.length;

    // PASSO 2: Para cada item desassociado, procurar regra de vinculação
    for (const itemDesassociado of itensDesassociados) {
      const regraEncontrada = await buscarRegraVinculacao(
        pool,
        itemDesassociado.codigoItem,
        itemDesassociado.estabelecimentoId,
        itemDesassociado.convenioId
      );

      if (regraEncontrada) {
        // PASSO 3a: Encontrou regra - buscar item de acréscimo correspondente
        const itemAcrescimo = await buscarItemAcrescimoPorCodigo(
          pool,
          regraEncontrada.codigoRecebido,
          itemDesassociado.numeroGuia,
          itemDesassociado.estabelecimentoId
        );

        if (itemAcrescimo) {
          // Vincular automaticamente
          await vincularAutomaticamente(
            pool,
            itemDesassociado,
            itemAcrescimo,
            regraEncontrada
          );

          resultado.totalVinculados++;
          resultado.detalhes.vinculadoAutomaticamente.push({
            itemId: itemDesassociado.id,
            codigoFaturado: itemDesassociado.codigoItem,
            codigoRecebido: regraEncontrada.codigoRecebido,
          });
        } else {
          // Regra encontrada mas item de acréscimo não existe
          resultado.totalPendentes++;
          resultado.detalhes.pendentesVinculacao.push({
            itemId: itemDesassociado.id,
            codigoFaturado: itemDesassociado.codigoItem,
          });
        }
      } else {
        // PASSO 3b: Não encontrou regra - deixar para vinculação manual
        resultado.totalPendentes++;
        resultado.detalhes.pendentesVinculacao.push({
          itemId: itemDesassociado.id,
          codigoFaturado: itemDesassociado.codigoItem,
        });
      }
    }

    return resultado;
  } catch (erro) {
    console.error("[VinculacaoAutomatica] Erro ao processar vinculações:", erro);
    throw erro;
  }
}

/**
 * Busca regra de vinculação na tabela vinculacoes_padrao
 */
async function buscarRegraVinculacao(
  pool: any,
  codigoFaturado: string,
  estabelecimentoId: number,
  convenioId: number | null
): Promise<VinculacaoPadrao | null> {
  try {
    const [regras] = await (pool as any).execute(`
      SELECT 
        id,
        codigoFaturado,
        codigoRecebido,
        descricaoFaturado,
        descricaoRecebido,
        ativo
      FROM vinculacoes_padrao
      WHERE codigoFaturado = '${codigoFaturado}'
        AND estabelecimentoId = ${estabelecimentoId}
        AND ativo = 1
        ${convenioId ? `AND (convenioId = ${convenioId} OR convenioId IS NULL)` : ""}
      LIMIT 1
    `);

    return regras.length > 0 ? regras[0] : null;
  } catch (erro) {
    console.error("[VinculacaoAutomatica] Erro ao buscar regra:", erro);
    return null;
  }
}

/**
 * Busca item de acréscimo correspondente na mesma guia
 */
async function buscarItemAcrescimoPorCodigo(
  pool: any,
  codigoRecebido: string,
  numeroGuia: string,
  estabelecimentoId: number
): Promise<any | null> {
  try {
    const [itens] = await (pool as any).execute(`
      SELECT 
        id,
        codigoItem,
        descricaoItem,
        valorPago,
        recebimentoId
      FROM conciliados_automatico
      WHERE numeroGuia = '${numeroGuia}'
        AND codigoItem = '${codigoRecebido}'
        AND statusConciliacao = 'acrescimo'
        AND estabelecimentoId = ${estabelecimentoId}
      LIMIT 1
    `);

    return itens.length > 0 ? itens[0] : null;
  } catch (erro) {
    console.error("[VinculacaoAutomatica] Erro ao buscar item de acréscimo:", erro);
    return null;
  }
}

/**
 * Realiza a vinculação automática
 */
async function vincularAutomaticamente(
  pool: any,
  itemDesassociado: ItemDesassociado,
  itemAcrescimo: any,
  regra: VinculacaoPadrao
): Promise<void> {
  try {
    // Calcular glosa real (diferença entre faturado e pago)
    const glosaReal = itemDesassociado.valorFaturado - itemAcrescimo.valorPago;
    const statusFinal = glosaReal > 0 ? "glosa_parcial" : "conciliado_manual";

    // Atualizar item de acréscimo como "absorvido"
    await pool.execute(`
      UPDATE conciliados_automatico 
      SET statusConciliacao = 'absorvido',
          metodoConciliacao = 'automatico',
          vinculadoAoId = ${itemDesassociado.id},
          diferenca = 0,
          percentualDiferenca = 0,
          executadoPorNome = 'Sistema - Vinculação Automática'
      WHERE id = ${itemAcrescimo.id}
    `);

    // Atualizar item desassociado com valores do acréscimo
    await pool.execute(`
      UPDATE conciliados_automatico 
      SET statusConciliacao = '${statusFinal}',
          metodoConciliacao = 'automatico',
          vinculadoAoId = ${itemAcrescimo.id},
          valorPago = ${itemAcrescimo.valorPago},
          recebimentoId = ${itemAcrescimo.recebimentoId || "NULL"},
          valorGlosa = CASE WHEN ${glosaReal} > 0 THEN ${glosaReal} ELSE 0 END,
          diferenca = ${glosaReal},
          percentualDiferenca = ${itemDesassociado.valorFaturado > 0 ? Math.round((glosaReal / itemDesassociado.valorFaturado) * 10000) / 100 : 0},
          executadoPorNome = 'Sistema - Vinculação Automática'
      WHERE id = ${itemDesassociado.id}
    `);

    // Registrar no aprendizado (para melhorar futuras vinculações)
    await pool.execute(`
      UPDATE vinculacoes_padrao
      SET vezesUsado = COALESCE(vezesUsado, 0) + 1
      WHERE id = ${regra.id}
    `);

    console.log(`[VinculacaoAutomatica] Vinculado: ${itemDesassociado.codigoItem} → ${regra.codigoRecebido}`);
  } catch (erro) {
    console.error("[VinculacaoAutomatica] Erro ao vincular:", erro);
    throw erro;
  }
}

/**
 * Função auxiliar para ser chamada na conciliação automática
 * Integra-se ao fluxo existente
 */
export async function aplicarVinculacoesAutomaticasPosProcessamento(
  estabelecimentoId: number,
  competencia?: string
): Promise<void> {
  try {
    const resultado = await processarVinculacoesAutomaticas(estabelecimentoId, competencia);
    console.log(
      `[VinculacaoAutomatica] Processamento concluído: ${resultado.totalVinculados} vinculados, ${resultado.totalPendentes} pendentes`
    );
  } catch (erro) {
    console.error("[VinculacaoAutomatica] Erro no processamento:", erro);
    // Não lançar erro para não interromper o fluxo de conciliação
  }
}
