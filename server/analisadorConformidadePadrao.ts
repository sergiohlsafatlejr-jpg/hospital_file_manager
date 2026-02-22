import { getDb } from "./db";
import { logger } from "./_core/logger";
import { regrasNegocio, itensRegraNegocio } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface ItemConta {
  codigoItem: string;
  descricaoItem?: string;
  tipoItem: string;
  quantidade: number;
  valor: number;
}

export interface ContaParaAuditar {
  id: number;
  codigoProcedimento: string;
  descricaoProcedimento: string;
  convenioId: number;
  estabelecimentoId?: number;
  itens: ItemConta[];
  valorTotal: number;
}

export interface DivergenciaItem {
  codigoItem: string;
  descricaoItem: string;
  tipoItem: string;
  status: "faltante" | "excedente" | "quantidade_incorreta" | "valor_fora_tolerancia" | "conforme";
  esperado: {
    quantidade?: number;
    valor?: number;
    tolerancia?: number;
  };
  encontrado: {
    quantidade?: number;
    valor?: number;
  };
  severidade: "critica" | "alta" | "media" | "baixa";
  mensagem: string;
}

export interface RelatorioConformidade {
  contaId: number;
  codigoProcedimento: string;
  padraoId: number;
  scoreConformidade: number; // 0-100
  statusGeral: "conforme" | "nao_conforme" | "parcialmente_conforme";
  divergencias: DivergenciaItem[];
  itensConformes: number;
  itensDivergentes: number;
  recomendacoes: string[];
}

/**
 * Analisador de Conformidade de Padrões de Procedimentos
 * Compara itens de uma conta contra padrões esperados
 */
export class AnalisadorConformidadePadrao {
  /**
   * Auditar uma conta contra padrões de procedimentos
   */
  static async auditarConta(conta: ContaParaAuditar): Promise<RelatorioConformidade> {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database connection failed");
      }

      // 1. Buscar padrão de procedimento
      const padrao = await db
        .select()
        .from(regrasNegocio)
        .where(
          and(
            eq(regrasNegocio.codigoProcedimento, conta.codigoProcedimento),
            eq(regrasNegocio.tipoRegra, "padrao_procedimento" as any)
          )
        )
        .limit(1);

      if (!padrao || padrao.length === 0) {
        return {
          contaId: conta.id,
          codigoProcedimento: conta.codigoProcedimento,
          padraoId: 0,
          scoreConformidade: 0,
          statusGeral: "nao_conforme",
          divergencias: [
            {
              codigoItem: "",
              descricaoItem: "Padrão não encontrado",
              tipoItem: "",
              status: "faltante",
              esperado: {},
              encontrado: {},
              severidade: "critica",
              mensagem: `Nenhum padrão de procedimento encontrado para o código ${conta.codigoProcedimento}`,
            },
          ],
          itensConformes: 0,
          itensDivergentes: conta.itens.length,
          recomendacoes: ["Criar padrão de procedimento para este código"],
        };
      }

      const padraoReg = padrao[0];

      // 2. Buscar itens esperados do padrão
      const itensEsperados = await db
        .select()
        .from(itensRegraNegocio)
        .where(eq(itensRegraNegocio.regraId, padraoReg.id));

      // 3. Comparar itens
      const divergencias: DivergenciaItem[] = [];
      let itensConformes = 0;

      // Verificar itens esperados que faltam
      for (const itemEsperado of itensEsperados) {
        const itemEncontrado = conta.itens.find((i) => i.codigoItem === itemEsperado.codigoItem);

        if (!itemEncontrado) {
          if (itemEsperado.obrigatorio === "sim") {
            divergencias.push({
              codigoItem: itemEsperado.codigoItem,
              descricaoItem: itemEsperado.descricaoItem || "",
              tipoItem: itemEsperado.tipoItem,
              status: "faltante",
              esperado: {
                quantidade: itemEsperado.quantidadeMinima || 1,
              },
              encontrado: {},
              severidade: "critica",
              mensagem: `Item obrigatório ${itemEsperado.codigoItem} não encontrado na conta`,
            });
          }
        } else {
          // Validar quantidade
          const qtdMin = itemEsperado.quantidadeMinima || 1;
          const qtdMax = itemEsperado.quantidadeMaxima || qtdMin;

          if (itemEncontrado.quantidade < qtdMin || itemEncontrado.quantidade > qtdMax) {
            divergencias.push({
              codigoItem: itemEsperado.codigoItem,
              descricaoItem: itemEsperado.descricaoItem || "",
              tipoItem: itemEsperado.tipoItem,
              status: "quantidade_incorreta",
              esperado: {
                quantidade: qtdMin,
              },
              encontrado: {
                quantidade: itemEncontrado.quantidade,
              },
              severidade: itemEncontrado.quantidade < qtdMin ? "alta" : "media",
              mensagem: `Quantidade incorreta: esperado ${qtdMin}-${qtdMax}, encontrado ${itemEncontrado.quantidade}`,
            });
          } else {
            itensConformes++;
          }
        }
      }

      // Verificar itens extras (não esperados)
      for (const itemEncontrado of conta.itens) {
        const itemEsperado = itensEsperados.find((i) => i.codigoItem === itemEncontrado.codigoItem);

        if (!itemEsperado) {
          divergencias.push({
            codigoItem: itemEncontrado.codigoItem,
            descricaoItem: itemEncontrado.descricaoItem || "",
            tipoItem: itemEncontrado.tipoItem,
            status: "excedente",
            esperado: {},
            encontrado: {
              quantidade: itemEncontrado.quantidade,
              valor: itemEncontrado.valor,
            },
            severidade: "media",
            mensagem: `Item não esperado encontrado: ${itemEncontrado.codigoItem}`,
          });
        }
      }

      // 4. Calcular score de conformidade
      const totalItens = itensEsperados.length;
      const scoreConformidade = totalItens > 0 ? Math.round((itensConformes / totalItens) * 100) : 0;

      // 5. Determinar status geral
      let statusGeral: "conforme" | "nao_conforme" | "parcialmente_conforme" = "conforme";
      if (divergencias.length > 0) {
        const temCritica = divergencias.some((d) => d.severidade === "critica");
        statusGeral = temCritica ? "nao_conforme" : "parcialmente_conforme";
      }

      // 6. Gerar recomendações
      const recomendacoes: string[] = [];
      if (divergencias.length > 0) {
        const faltantes = divergencias.filter((d) => d.status === "faltante");
        const excedentes = divergencias.filter((d) => d.status === "excedente");
        const quantidadeErrada = divergencias.filter((d) => d.status === "quantidade_incorreta");

        if (faltantes.length > 0) {
          recomendacoes.push(`Adicionar ${faltantes.length} item(ns) faltante(s)`);
        }
        if (excedentes.length > 0) {
          recomendacoes.push(`Remover ${excedentes.length} item(ns) não esperado(s)`);
        }
        if (quantidadeErrada.length > 0) {
          recomendacoes.push(`Corrigir quantidade de ${quantidadeErrada.length} item(ns)`);
        }
      }

      // Validar score mínimo
      if (padraoReg.score_minimo_aceitavel && scoreConformidade < padraoReg.score_minimo_aceitavel) {
        recomendacoes.push(
          `Score de conformidade (${scoreConformidade}%) abaixo do mínimo aceitável (${padraoReg.score_minimo_aceitavel}%)`
        );
      }

      logger.info({
        message: "Auditoria de conformidade concluída",
        contaId: conta.id,
        codigoProcedimento: conta.codigoProcedimento,
        scoreConformidade,
        statusGeral,
        divergencias: divergencias.length,
      });

      return {
        contaId: conta.id,
        codigoProcedimento: conta.codigoProcedimento,
        padraoId: padraoReg.id,
        scoreConformidade,
        statusGeral,
        divergencias,
        itensConformes,
        itensDivergentes: divergencias.length,
        recomendacoes,
      };
    } catch (error) {
      logger.error({
        message: "Erro ao auditar conta",
        error: String(error),
        contaId: conta.id,
      });
      throw error;
    }
  }

  /**
   * Auditar múltiplas contas de um arquivo
   */
  static async auditarArquivo(contas: ContaParaAuditar[]): Promise<{
    totalContas: number;
    contasConformes: number;
    contasParcialmenteConformes: number;
    contasNaoConformes: number;
    scoreConformidadeMedia: number;
    relatorios: RelatorioConformidade[];
  }> {
    const relatorios: RelatorioConformidade[] = [];
    let contasConformes = 0;
    let contasParcialmenteConformes = 0;
    let contasNaoConformes = 0;
    let scoreTotal = 0;

    for (const conta of contas) {
      const relatorio = await this.auditarConta(conta);
      relatorios.push(relatorio);

      scoreTotal += relatorio.scoreConformidade;

      if (relatorio.statusGeral === "conforme") {
        contasConformes++;
      } else if (relatorio.statusGeral === "parcialmente_conforme") {
        contasParcialmenteConformes++;
      } else {
        contasNaoConformes++;
      }
    }

    const scoreConformidadeMedia = contas.length > 0 ? Math.round(scoreTotal / contas.length) : 0;

    return {
      totalContas: contas.length,
      contasConformes,
      contasParcialmenteConformes,
      contasNaoConformes,
      scoreConformidadeMedia,
      relatorios,
    };
  }

  /**
   * Gerar relatório consolidado de conformidade
   */
  static gerarRelatorioConsolidado(
    relatorios: RelatorioConformidade[]
  ): {
    totalContas: number;
    contasConformes: number;
    contasParcialmenteConformes: number;
    contasNaoConformes: number;
    scoreConformidadeMedia: number;
    divergenciasMaisFrequentes: Array<{ tipo: string; quantidade: number; percentual: number }>;
    recomendacoesGerais: string[];
  } {
    const divergenciasMap = new Map<string, number>();
    let contasConformes = 0;
    let contasParcialmenteConformes = 0;
    let contasNaoConformes = 0;
    let scoreTotal = 0;

    for (const relatorio of relatorios) {
      scoreTotal += relatorio.scoreConformidade;

      if (relatorio.statusGeral === "conforme") {
        contasConformes++;
      } else if (relatorio.statusGeral === "parcialmente_conforme") {
        contasParcialmenteConformes++;
      } else {
        contasNaoConformes++;
      }

      for (const divergencia of relatorio.divergencias) {
        const chave = `${divergencia.status}:${divergencia.tipoItem}`;
        divergenciasMap.set(chave, (divergenciasMap.get(chave) || 0) + 1);
      }
    }

    const scoreConformidadeMedia = relatorios.length > 0 ? Math.round(scoreTotal / relatorios.length) : 0;

    // Ordenar divergências mais frequentes
    const divergenciasMaisFrequentes = Array.from(divergenciasMap.entries())
      .map(([tipo, quantidade]) => ({
        tipo,
        quantidade,
        percentual: Math.round((quantidade / relatorios.length) * 100),
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);

    const recomendacoesGerais: string[] = [];
    if (contasNaoConformes > 0) {
      recomendacoesGerais.push(
        `${contasNaoConformes} conta(s) não conforme(s) requerem atenção imediata`
      );
    }
    if (contasParcialmenteConformes > 0) {
      recomendacoesGerais.push(
        `${contasParcialmenteConformes} conta(s) parcialmente conforme(s) precisam de ajustes`
      );
    }
    if (scoreConformidadeMedia < 70) {
      recomendacoesGerais.push("Score de conformidade geral baixo - revisar padrões de procedimentos");
    }

    return {
      totalContas: relatorios.length,
      contasConformes,
      contasParcialmenteConformes,
      contasNaoConformes,
      scoreConformidadeMedia,
      divergenciasMaisFrequentes,
      recomendacoesGerais,
    };
  }
}
