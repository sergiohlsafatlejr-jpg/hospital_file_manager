import { getDb } from "./db";
import { atendimentos } from "../drizzle/schema-integracao";
import { eq, and, isNull, or } from "drizzle-orm";

/**
 * Busca todos os atendimentos parados da tabela unificada.
 * Mostra todos os registros de todos os sistemas.
 * O filtro de data_saida IS NULL é aplicado apenas para TASY na tela listarPaginado.
 * Para WARLEINE/EASYVISION: mostra todos os registros (a query externa já traz apenas os relevantes).
 * @returns Lista de atendimentos parados
 */
export async function getAtendimentosParadosUnificados() {
  try {
    const db = await getDb();
    if (!db) {
      console.error("Banco de dados não disponível");
      return [];
    }

    // Buscar todos os registros - sem filtro de data_saida
    // Para TASY: CSV já traz só contas paradas
    // Para WARLEINE/EASYVISION: a query externa já traz apenas os atendimentos relevantes
    const result = await db
      .select()
      .from(atendimentos)
      .orderBy(atendimentos.data_entrada);

    return result;
  } catch (error) {
    console.error("Erro ao buscar atendimentos parados unificados:", error);
    return [];
  }
}

/**
 * Busca atendimentos parados da tabela unificada por estabelecimento
 * @param estabelecimentoId - ID do estabelecimento
 * @returns Lista de atendimentos parados
 */
export async function getAtendimentosParadosPorEstabelecimento(estabelecimentoId: number) {
  try {
    const db = await getDb();
    if (!db) {
      console.error("Banco de dados não disponível");
      return [];
    }

    // Buscar todos os registros do estabelecimento - sem filtro de data_saida
    // Para TASY: CSV já traz só contas paradas
    // Para WARLEINE/EASYVISION: a query externa já traz apenas os atendimentos relevantes
    const result = await db
      .select()
      .from(atendimentos)
      .where(
        and(
          eq(atendimentos.estabelecimentoId, estabelecimentoId),
          eq(atendimentos.ativoNaFonte, true),
        )
      )
      .orderBy(atendimentos.data_entrada);

    return result;
  } catch (error) {
    console.error("Erro ao buscar atendimentos parados por estabelecimento:", error);
    return [];
  }
}

/**
 * Calcula dias parado para atendimentos unificados.
 * Para TASY: usa dtEntrega (ou dtEtapa como fallback) até hoje, pois o CSV já traz só contas paradas.
 * Para outros sistemas: usa data_entrada até data_saida (ou hoje se sem saída).
 * @param params - Parâmetros do atendimento
 * @returns Número de dias parado
 */
export function calcularDiasParadoUnificado(
  dataEntrada?: string | Date | null,
  dataSaida?: string | Date | null,
  origemSistema?: string | null,
  dtEntrega?: string | Date | null,
  dtEtapa?: string | Date | null
): number {
  // Para TASY: calcular dias desde dtEntrega (ou dtEtapa) até hoje
  if (origemSistema?.toLowerCase() === 'tasy' || origemSistema?.toLowerCase() === 'tasy_hemolabor') {
    const dataRef = dtEntrega || dtEtapa;
    if (!dataRef) return 0;
    const ref = new Date(dataRef);
    const hoje = new Date();
    const diffMs = hoje.getTime() - ref.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  // Para outros sistemas: data_entrada até data_saida (ou hoje)
  if (!dataEntrada) return 0;
  const entrada = new Date(dataEntrada);
  const saida = dataSaida ? new Date(dataSaida) : new Date();
  const diffMs = saida.getTime() - entrada.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Busca estatísticas de atendimentos parados por estabelecimento
 * @param estabelecimentoId - ID do estabelecimento
 * @returns Estatísticas
 */
export async function getEstatisticasAtendimentosParadosUnificados(estabelecimentoId?: number) {
  try {
    const atendimentosParados = estabelecimentoId 
      ? await getAtendimentosParadosPorEstabelecimento(estabelecimentoId)
      : await getAtendimentosParadosUnificados();

    if (atendimentosParados.length === 0) {
      return {
        total: 0,
        diasParadoTotal: 0,
        mediaDias: 0,
        porTipo: {},
        porConvenio: {},
        porOrigem: {},
      };
    }

    const diasParadoTotal = atendimentosParados.reduce((sum, a) => {
      return sum + calcularDiasParadoUnificado(a.data_entrada, a.data_saida || undefined, a.origemSistema, a.dtEntrega, a.dtEtapa);
    }, 0);

    const mediaDias = Math.round(diasParadoTotal / atendimentosParados.length);

    const porTipo: Record<string, number> = {};
    const porConvenio: Record<string, number> = {};
    const porOrigem: Record<string, number> = {};

    atendimentosParados.forEach(a => {
      const dias = calcularDiasParadoUnificado(a.data_entrada, a.data_saida || undefined, a.origemSistema, a.dtEntrega, a.dtEtapa);
      if (a.tipo_atendimento) {
        porTipo[a.tipo_atendimento] = (porTipo[a.tipo_atendimento] || 0) + 1;
      }
      if (a.convenio) {
        porConvenio[a.convenio] = (porConvenio[a.convenio] || 0) + 1;
      }
      if (a.origemSistema) {
        porOrigem[a.origemSistema] = (porOrigem[a.origemSistema] || 0) + 1;
      }
    });

    return {
      total: atendimentosParados.length,
      diasParadoTotal,
      mediaDias,
      porTipo,
      porConvenio,
      porOrigem,
    };
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    return {
      total: 0,
      diasParadoTotal: 0,
      mediaDias: 0,
      porTipo: {},
      porConvenio: {},
      porOrigem: {},
    };
  }
}

/**
 * Calcula KPIs por tipo de atendimento
 * @returns KPIs agrupados por tipo
 */
export async function getKPIsPorTipo() {
  try {
    const atendimentosParados = await getAtendimentosParadosUnificados();
    
    const kpis = {
      totalAFaturar: 0,
      internacao: 0,
      exame: 0,
      ambulatorio: 0,
    };

    atendimentosParados.forEach(a => {
      const tipo = a.tipo_atendimento?.toLowerCase() || '';
      
      if (tipo.includes('internacao') || tipo.includes('internação')) {
        kpis.internacao++;
      } else if (tipo.includes('exame')) {
        kpis.exame++;
      } else if (tipo.includes('ambulatorio') || tipo.includes('ambulatório')) {
        kpis.ambulatorio++;
      }
      
      kpis.totalAFaturar++;
    });

    return kpis;
  } catch (error) {
    console.error("Erro ao calcular KPIs por tipo:", error);
    return {
      totalAFaturar: 0,
      internacao: 0,
      exame: 0,
      ambulatorio: 0,
    };
  }
}

/**
 * Calcula quantidade de atendimentos por plano (convênio)
 * @returns Dados agregados por plano
 */
export async function getQuantidadePorPlano() {
  try {
    const atendimentosParados = await getAtendimentosParadosUnificados();
    
    const porPlano: Record<string, number> = {};

    atendimentosParados.forEach(a => {
      const plano = a.convenio || 'Sem Plano';
      porPlano[plano] = (porPlano[plano] || 0) + 1;
    });

    // Ordenar por quantidade decrescente e pegar top 10
    return Object.entries(porPlano)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([plano, quantidade]) => ({ plano, quantidade }));
  } catch (error) {
    console.error("Erro ao calcular quantidade por plano:", error);
    return [];
  }
}

/**
 * Calcula quantidade de atendimentos por serviço
 * @returns Dados agregados por serviço
 */
export async function getQuantidadePorServico() {
  try {
    const atendimentosParados = await getAtendimentosParadosUnificados();
    
    const porServico: Record<string, number> = {};

    atendimentosParados.forEach(a => {
      const servico = a.codigo_servico || 'Sem Serviço';
      porServico[servico] = (porServico[servico] || 0) + 1;
    });

    // Ordenar por quantidade decrescente e pegar top 10
    return Object.entries(porServico)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([servico, quantidade]) => ({ servico, quantidade }));
  } catch (error) {
    console.error("Erro ao calcular quantidade por serviço:", error);
    return [];
  }
}

/**
 * Busca atendimentos parados com filtros
 * @param estabelecimentoId - ID do estabelecimento
 * @param filtros - Filtros opcionais
 * @returns Lista de atendimentos parados filtrados
 */
export async function getAtendimentosParadosComFiltros(
  filtros?: {
    tipo?: string;
    convenio?: string;
    origem?: string;
    diasMinimoParado?: number;
    estabelecimentoId?: number;
  }
) {
  try {
    let atendimentosParados = filtros?.estabelecimentoId
      ? await getAtendimentosParadosPorEstabelecimento(filtros.estabelecimentoId)
      : await getAtendimentosParadosUnificados();

    if (filtros?.tipo) {
      atendimentosParados = atendimentosParados.filter(
        a => a.tipo_atendimento === filtros.tipo
      );
    }

    if (filtros?.convenio) {
      atendimentosParados = atendimentosParados.filter(
        a => a.convenio === filtros.convenio
      );
    }

    if (filtros?.origem) {
      atendimentosParados = atendimentosParados.filter(
        a => a.origemSistema === filtros.origem
      );
    }

    if (filtros?.diasMinimoParado) {
      atendimentosParados = atendimentosParados.filter(a => {
        const dias = calcularDiasParadoUnificado(a.data_entrada, a.data_saida || undefined, a.origemSistema, a.dtEntrega, a.dtEtapa);
        return dias >= filtros.diasMinimoParado!;
      });
    }

    return atendimentosParados;
  } catch (error) {
    console.error("Erro ao buscar atendimentos com filtros:", error);
    return [];
  }
}
