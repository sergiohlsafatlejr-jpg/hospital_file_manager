import { getDb } from "./db";
import { atendimentos } from "../drizzle/schema-integracao";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Busca atendimentos parados (sem data de saída) da tabela unificada
 * @param estabelecimentoId - ID do estabelecimento (opcional)
 * @returns Lista de atendimentos parados
 */
export async function getAtendimentosParadosUnificados(estabelecimentoId?: number) {
  try {
    const db = await getDb();
    if (!db) {
      console.error("Banco de dados não disponível");
      return [];
    }

    // Buscar atendimentos que não têm data_saida (parados)
    let result;
    
    if (estabelecimentoId) {
      // Se estabelecimentoId for fornecido, filtrar por ele
      result = await db
        .select()
        .from(atendimentos)
        .where(
          and(
            eq(atendimentos.estabelecimentoId, estabelecimentoId),
            isNull(atendimentos.data_saida)
          )
        )
        .orderBy(atendimentos.data_entrada);
    } else {
      // Caso contrário, retorna todos os atendimentos parados
      result = await db
        .select()
        .from(atendimentos)
        .where(isNull(atendimentos.data_saida))
        .orderBy(atendimentos.data_entrada);
    }

    return result;
  } catch (error) {
    console.error("Erro ao buscar atendimentos parados unificados:", error);
    return [];
  }
}

/**
 * Calcula dias parado para atendimentos unificados
 * @param dataEntrada - Data de entrada do atendimento
 * @param dataSaida - Data de saída (null se parado)
 * @returns Número de dias parado
 */
export function calcularDiasParadoUnificado(dataEntrada?: string | Date, dataSaida?: string | Date): number {
  if (!dataEntrada) return 0;

  const entrada = new Date(dataEntrada);
  const saida = dataSaida ? new Date(dataSaida) : new Date();

  const diffMs = saida.getTime() - entrada.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}
