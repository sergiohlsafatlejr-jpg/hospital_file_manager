import { getDb } from "../db";
import { contasConvenioItens, contasConvenioResumo, padraoPrecoConvenio, padraoGlosaConvenio, padraoQuantidadeItem, padroesCobranca, logAnaliseComparacao, convenios } from "../../drizzle/schema";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { logger } from "../_core/logger";

/**
 * Motor de Comparação de Padrões de Cobrança (com suporte a Gabarito e Setor)
 * 
 * Compara os itens de uma conta contra os padrões ATIVOS e GABARITOS:
 * 1. Preço: valor unitário/total vs média ± 2 desvios
 * 2. Quantidade: qtd vs média ± 2 desvios
 * 3. Glosa: risco de glosa baseado no histórico
 * 4. Composição: itens faltantes ou extras vs kit padrão (gabarito tem prioridade)
 * 
 * NOVO: Padrões agora consideram o setor de atendimento.
 * Hierarquia de match: setor específico > setor NULL (genérico)
 * Um paciente pode ter itens em múltiplos setores na mesma conta.
 */

export interface Divergencia {
  tipo: "PRECO" | "QUANTIDADE" | "GLOSA_RISCO" | "ITEM_FALTANTE" | "ITEM_EXTRA" | "COMPOSICAO";
  severidade: "info" | "aviso" | "alerta" | "critico";
  mensagem: string;
  campo?: string;
  valorEsperado?: string;
  valorEncontrado?: string;
  padraoId?: number;
  codigoItem?: string;
  descricaoItem?: string;
  isGabarito?: boolean;
  setor?: string;
  detalhes?: Record<string, any>;
}

export interface DetalhesScoreRisco {
  score: number;
  composicao: number;
  preco: number;
  quantidade: number;
  glosa: number;
  detalhes: string[];
}

export interface PadraoUsadoDetalhe {
  padraoId: number;
  padraoNome: string;
  isGabarito: boolean;
  convenioNome?: string;
  setor?: string;
  scoreMatch: number;
  motivoSelecao: string;
}

export interface ResultadoComparacao {
  numeroConta: string;
  totalItensAnalisados: number;
  totalDivergencias: number;
  totalAlertas: number;
  totalCriticos: number;
  divergencias: Divergencia[];
  resumoPorTipo: Record<string, number>;
  statusGeral: "conforme" | "divergente";
  gabaritosUsados: number;
  padroesUsados: number;
  setoresAnalisados: string[];
  scoreRisco: DetalhesScoreRisco;
  padroesDetalhados: PadraoUsadoDetalhe[];
}

/**
 * Forma mínima exigida pelo motor. A origem permanece externa: essa interface
 * permite analisar a publicação Warleine sem copiar itens para a fonte XML.
 */
export interface ItemParaComparacao {
  codigoItem?: string | null;
  descricaoItem?: string | null;
  tipoItem?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
  valorTotal?: string | number | null;
  setor?: string | null;
  codigoProcedimento?: string | null;
  [campo: string]: unknown;
}

/**
 * Seleciona o melhor padrão de composição considerando setor.
 * Prioridade: gabarito com setor > gabarito sem setor > padrão com setor > padrão sem setor
 */
function selecionarMelhorPadrao(
  padroes: Array<{ id: number; codigoProcedimentoPrincipal: string; setor: string | null; isGabarito: number; [key: string]: any }>,
  codigoProc: string,
  setorItem: string | null
): typeof padroes[0] | null {
  const candidatos = padroes.filter(p => p.codigoProcedimentoPrincipal === codigoProc);
  if (candidatos.length === 0) return null;

  // Ordenar por prioridade: gabarito+setor > gabarito+genérico > padrão+setor > padrão+genérico
  const scored = candidatos.map(p => {
    let score = 0;
    if (p.isGabarito === 1) score += 100;
    if (p.setor && setorItem && p.setor.trim().toUpperCase() === setorItem.trim().toUpperCase()) score += 50;
    else if (!p.setor) score += 10; // genérico é melhor que setor errado
    else score -= 50; // setor diferente = penalidade
    return { padrao: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  
  // Só retornar se o score é positivo (não retornar padrão de setor errado)
  if (scored[0].score >= 0) return scored[0].padrao;
  return null;
}

/**
 * Compara todos os itens de uma conta contra os padrões de cobrança
 * Prioriza gabaritos (isGabarito=1) sobre padrões aprendidos
 * Filtra apenas padrões com status "ativo"
 * NOVO: Considera o setor de atendimento dos itens
 */
export async function compararContaComPadroes(
  numeroConta: string,
  estabelecimentoId: number
): Promise<ResultadoComparacao> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  // 1. Buscar itens da conta
  const itens = await db
    .select()
    .from(contasConvenioItens)
    .where(and(
      eq(contasConvenioItens.numeroConta, numeroConta),
      eq(contasConvenioItens.estabelecimentoId, estabelecimentoId),
    ));

  return compararItensComPadroes({
    numeroConta,
    estabelecimentoId,
    convenio: itens[0]?.convenio ?? null,
    itens: itens as unknown as ItemParaComparacao[],
  });
}

/**
 * Executa a mesma regra de preço, quantidade, glosa e composição sobre uma
 * coleção já autorizada de itens. O chamador deve preservar a fonte e a
 * versão do snapshot ao persistir o resultado.
 */
export async function compararItensComPadroes({
  numeroConta,
  estabelecimentoId,
  convenio,
  itens,
}: {
  numeroConta: string;
  estabelecimentoId: number;
  convenio: string | null | undefined;
  itens: ItemParaComparacao[];
}): Promise<ResultadoComparacao> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  if (itens.length === 0) {
    return {
      numeroConta,
      totalItensAnalisados: 0,
      totalDivergencias: 0,
      totalAlertas: 0,
      totalCriticos: 0,
      divergencias: [],
      resumoPorTipo: {},
      statusGeral: "conforme",
      gabaritosUsados: 0,
      padroesUsados: 0,
      setoresAnalisados: [],
      scoreRisco: { score: 0, composicao: 0, preco: 0, quantidade: 0, glosa: 0, detalhes: [] },
      padroesDetalhados: [],
    };
  }

  // 2. Identificar o convênio e setores da conta
  const convenioNormalizado = convenio?.trim() || null;
  const setoresNaConta = [...new Set(itens.map(i => typeof i.setor === "string" ? i.setor : null).filter(Boolean))] as string[];
  
  if (!convenioNormalizado) {
    logger.warn({ message: "Conta sem convênio identificado", numeroConta });
    return {
      numeroConta,
      totalItensAnalisados: itens.length,
      totalDivergencias: 0,
      totalAlertas: 0,
      totalCriticos: 0,
      divergencias: [{
        tipo: "COMPOSICAO",
        severidade: "aviso",
        mensagem: "Convênio não identificado na conta. Não é possível comparar com padrões.",
      }],
      resumoPorTipo: { COMPOSICAO: 1 },
      statusGeral: "conforme",
      gabaritosUsados: 0,
      padroesUsados: 0,
      setoresAnalisados: setoresNaConta,
      scoreRisco: { score: 0, composicao: 0, preco: 0, quantidade: 0, glosa: 0, detalhes: [] },
      padroesDetalhados: [],
    };
  }

  const divergencias: Divergencia[] = [];

  // 3. Buscar padrões de preço para este convênio (com suporte a setor)
  const padroesPreco = await db
    .select()
    .from(padraoPrecoConvenio)
    .where(and(
      eq(padraoPrecoConvenio.estabelecimentoId, estabelecimentoId),
      eq(padraoPrecoConvenio.convenio, convenioNormalizado),
    ));

  // Indexar padrões de preço por código para match com setor
  const mapPrecoPorCodigo = new Map<string, typeof padroesPreco>();
  for (const p of padroesPreco) {
    if (!p.codigoItem) continue;
    if (!mapPrecoPorCodigo.has(p.codigoItem)) mapPrecoPorCodigo.set(p.codigoItem, []);
    mapPrecoPorCodigo.get(p.codigoItem)!.push(p);
  }

  // 4. Buscar padrões de quantidade (agora com setor)
  const padroesQtd = await db
    .select()
    .from(padraoQuantidadeItem)
    .where(eq(padraoQuantidadeItem.estabelecimentoId, estabelecimentoId));

  const padroesQtdFiltrados = padroesQtd.filter(p => 
    p.convenio === convenioNormalizado || !p.convenio
  );
  
  // Indexar padrões de quantidade por código+setor para match mais preciso
  const mapQtdPorCodigo = new Map<string, typeof padroesQtdFiltrados>();
  for (const p of padroesQtdFiltrados) {
    if (!p.codigoItem) continue;
    if (!mapQtdPorCodigo.has(p.codigoItem)) mapQtdPorCodigo.set(p.codigoItem, []);
    mapQtdPorCodigo.get(p.codigoItem)!.push(p);
  }

  // 5. Buscar padrões de glosa
  const padroesGlosa = await db
    .select()
    .from(padraoGlosaConvenio)
    .where(and(
      eq(padraoGlosaConvenio.estabelecimentoId, estabelecimentoId),
      eq(padraoGlosaConvenio.convenio, convenioNormalizado),
    ));

  const mapGlosa = new Map(padroesGlosa.map(p => [p.codigoItem, p]));

  // 6. Buscar padrões de composição - APENAS ATIVOS (inclui gabaritos)
  const padroesComposicao = await db
    .select()
    .from(padroesCobranca)
    .where(and(
      eq(padroesCobranca.estabelecimentoId, estabelecimentoId),
      eq(padroesCobranca.status, "ativo"),
    ));

  // Buscar mapa de convênios (id -> nome) para match por nome quando convenioId da conta é null
  const convenioIdsUnicos = [...new Set(padroesComposicao.map(p => p.convenioId).filter(Boolean))] as number[];
  const mapaConvenioNomes = new Map<number, string>();
  if (convenioIdsUnicos.length > 0) {
    try {
      const convRows = await db
        .select({ id: convenios.id, nome: convenios.nome })
        .from(convenios)
        .where(inArray(convenios.id, convenioIdsUnicos));
      for (const c of convRows) {
        mapaConvenioNomes.set(c.id, c.nome.trim().toUpperCase());
      }
    } catch(e) {
      logger.warn({ message: "Erro ao buscar nomes de convênios", error: (e as Error).message });
    }
  }

  // Filtrar por convênio
  // Quando a conta não tem convenioId (null), incluir todos os padrões:
  // - Gabaritos sempre são incluídos (isGabarito=1) pois são criados manualmente
  // - Padrões sem convenioId (genéricos) são incluídos
  // - Padrões com convenioId são incluídos apenas se bate com o da conta
  const convenioIdConta = itens[0].convenioId;
  const padroesCompFiltrados = padroesComposicao.filter(p => {
    // Gabaritos manuais sempre são incluídos (foram criados especificamente para este cenário)
    if (p.isGabarito === 1) return true;
    // Padrões sem convenioId (genéricos) sempre passam
    if (!p.convenioId) return true;
    // Padrões com convenioId: só incluir se bate com o da conta
    if (convenioIdConta && p.convenioId === convenioIdConta) return true;
    // Se a conta não tem convenioId, incluir todos (melhor ter mais padrões que menos)
    if (!convenioIdConta) return true;
    return false;
  });

  let gabaritosUsados = 0;
  let padroesUsados = 0;
  const padroesDetalhados: PadraoUsadoDetalhe[] = [];

  // 7. Analisar cada item
  for (const item of itens) {
    const codigo = item.codigoItem ? String(item.codigoItem) : "";
    if (!codigo) continue;

    const valorUnitario = parseFloat(String(item.valorUnitario ?? "0"));
    const valorTotal = parseFloat(String(item.valorTotal ?? "0"));
    const quantidade = parseFloat(String(item.quantidade ?? "0"));
    const setorItem = (item as any).setor || null;

    // 7a. Comparação de PREÇO (com suporte a setor)
    const candidatosPreco = mapPrecoPorCodigo.get(codigo) || [];
    // Selecionar o melhor padrão de preço: setor específico > genérico
    let padraoP = candidatosPreco.find(p => p.setor && setorItem && p.setor.trim().toUpperCase() === setorItem.trim().toUpperCase());
    if (!padraoP) padraoP = candidatosPreco.find(p => !p.setor); // fallback genérico
    if (!padraoP && candidatosPreco.length > 0) padraoP = candidatosPreco[0]; // qualquer um como último recurso
    if (padraoP) {
      const mediaUnit = parseFloat(padraoP.mediaUnitario || "0");
      const desvioUnit = parseFloat(padraoP.desvioUnitario || "0");
      const minUnit = parseFloat(padraoP.minUnitario || "0");
      const maxUnit = parseFloat(padraoP.maxUnitario || "0");

      if (mediaUnit > 0 && valorUnitario > 0) {
        const limiteInferior = Math.max(0, mediaUnit - 2 * desvioUnit);
        const limiteSuperior = mediaUnit + 2 * desvioUnit;

        if (valorUnitario > limiteSuperior) {
          const percentAcima = ((valorUnitario - mediaUnit) / mediaUnit * 100).toFixed(1);
          const severidade = valorUnitario > maxUnit ? "critico" : "alerta";
          divergencias.push({
            tipo: "PRECO",
            severidade,
            mensagem: `Valor unitário ${percentAcima}% acima da média (R$ ${mediaUnit.toFixed(2)}). Limite superior: R$ ${limiteSuperior.toFixed(2)}${padraoP.setor ? ` [Setor: ${padraoP.setor}]` : ''}`,
            campo: "valorUnitario",
            valorEsperado: `R$ ${mediaUnit.toFixed(2)} (±R$ ${desvioUnit.toFixed(2)})`,
            valorEncontrado: `R$ ${valorUnitario.toFixed(2)}`,
            padraoId: padraoP.id,
            codigoItem: codigo,
            descricaoItem: item.descricaoItem || undefined,
            setor: setorItem || undefined,
            detalhes: { mediaUnit, desvioUnit, minUnit, maxUnit, limiteInferior, limiteSuperior },
          });
        } else if (valorUnitario < limiteInferior && limiteInferior > 0) {
          const percentAbaixo = ((mediaUnit - valorUnitario) / mediaUnit * 100).toFixed(1);
          divergencias.push({
            tipo: "PRECO",
            severidade: "info",
            mensagem: `Valor unitário ${percentAbaixo}% abaixo da média (R$ ${mediaUnit.toFixed(2)}).${padraoP.setor ? ` [Setor: ${padraoP.setor}]` : ''}`,
            campo: "valorUnitario",
            valorEsperado: `R$ ${mediaUnit.toFixed(2)} (±R$ ${desvioUnit.toFixed(2)})`,
            valorEncontrado: `R$ ${valorUnitario.toFixed(2)}`,
            padraoId: padraoP.id,
            codigoItem: codigo,
            descricaoItem: item.descricaoItem || undefined,
            setor: setorItem || undefined,
          });
        }
      }
    }

    // 7b. Comparação de QUANTIDADE (com suporte a setor)
    const candidatosQtd = mapQtdPorCodigo.get(codigo) || [];
    // Selecionar o melhor padrão de quantidade: setor específico > genérico
    let padraoQ = candidatosQtd.find(p => p.setor && setorItem && p.setor.trim().toUpperCase() === setorItem.trim().toUpperCase());
    if (!padraoQ) padraoQ = candidatosQtd.find(p => !p.setor); // fallback genérico
    
    if (padraoQ && quantidade > 0) {
      const mediaQtd = parseFloat(padraoQ.mediaQuantidade || "0");
      const limiteSup = parseFloat(padraoQ.limiteSuperior || "0");
      const limiteInf = parseFloat(padraoQ.limiteInferior || "0");

      if (mediaQtd > 0) {
        if (limiteSup > 0 && quantidade > limiteSup) {
          const percentAcima = ((quantidade - mediaQtd) / mediaQtd * 100).toFixed(1);
          divergencias.push({
            tipo: "QUANTIDADE",
            severidade: quantidade > limiteSup * 1.5 ? "critico" : "alerta",
            mensagem: `Quantidade ${percentAcima}% acima da média (${mediaQtd.toFixed(2)}). Limite: ${limiteSup.toFixed(2)}${padraoQ.setor ? ` [Setor: ${padraoQ.setor}]` : ''}`,
            campo: "quantidade",
            valorEsperado: `${mediaQtd.toFixed(2)} (limite: ${limiteSup.toFixed(2)})`,
            valorEncontrado: `${quantidade.toFixed(2)}`,
            padraoId: padraoQ.id,
            codigoItem: codigo,
            descricaoItem: item.descricaoItem || undefined,
            setor: setorItem || undefined,
          });
        } else if (limiteInf > 0 && quantidade < limiteInf) {
          divergencias.push({
            tipo: "QUANTIDADE",
            severidade: "info",
            mensagem: `Quantidade abaixo do limite inferior (${limiteInf.toFixed(2)}). Média: ${mediaQtd.toFixed(2)}${padraoQ.setor ? ` [Setor: ${padraoQ.setor}]` : ''}`,
            campo: "quantidade",
            valorEsperado: `${mediaQtd.toFixed(2)} (limite: ${limiteInf.toFixed(2)})`,
            valorEncontrado: `${quantidade.toFixed(2)}`,
            padraoId: padraoQ.id,
            codigoItem: codigo,
            descricaoItem: item.descricaoItem || undefined,
            setor: setorItem || undefined,
          });
        }
      }
    }

    // 7c. Risco de GLOSA
    const padraoG = mapGlosa.get(codigo);
    if (padraoG) {
      const taxaGlosa = parseFloat(padraoG.taxaGlosa || "0");
      const nivelRisco = padraoG.nivelRisco;

      if (taxaGlosa > 10 || nivelRisco === "alto" || nivelRisco === "critico") {
        const severidade = nivelRisco === "critico" ? "critico" : nivelRisco === "alto" ? "alerta" : "aviso";
        divergencias.push({
          tipo: "GLOSA_RISCO",
          severidade,
          mensagem: `Item com risco ${nivelRisco} de glosa (taxa histórica: ${taxaGlosa.toFixed(1)}%). Valor em risco: R$ ${valorTotal.toFixed(2)}`,
          codigoItem: codigo,
          descricaoItem: item.descricaoItem || undefined,
          padraoId: padraoG.id,
          setor: setorItem || undefined,
          detalhes: {
            taxaGlosa,
            nivelRisco,
            valorEmRisco: valorTotal * (taxaGlosa / 100),
            codigosGlosaFrequentes: padraoG.codigosGlosaFrequentes,
          },
        });
      }
    }
  }

  // 8. Verificar composição (itens faltantes no kit) usando gabaritos prioritários
  // NOVO: Agrupar itens por setor para comparar com padrão do setor correto
  const codigosNaConta = new Set(itens.map(i => i.codigoItem).filter(Boolean) as string[]);
  
  // Identificar procedimentos na conta (vários formatos de tipo)
  const tiposProcedimento = new Set(["PROCEDIMENTO", "P", "C", "O", "01", "PROC"]);
  
  // Agrupar itens por setor
  const itensPorSetor = new Map<string, typeof itens>();
  for (const item of itens) {
    const setor = (item as any).setor || 'GERAL';
    if (!itensPorSetor.has(setor)) itensPorSetor.set(setor, []);
    itensPorSetor.get(setor)!.push(item);
  }

  // Para cada setor, verificar composição
  const procedimentosJaAnalisados = new Set<string>();
  // Track quais procedimentos foram cobertos por gabaritos compostos (para não duplicar com padrão individual)
  const procedimentosCobertosGabarito = new Set<string>();
  
  for (const [setor, itensDoSetor] of Array.from(itensPorSetor.entries())) {
    const procedimentosNoSetor = itensDoSetor
      .filter(i => {
        const tipo = (i.tipoItem || "").toUpperCase().trim();
        return tiposProcedimento.has(tipo) || tipo.includes("PROC");
      })
      .map(i => i.codigoItem)
      .filter(Boolean);

    const codigosNoSetor = new Set(itensDoSetor.map(i => i.codigoItem).filter(Boolean) as string[]);

    // FASE 1: Buscar gabaritos compostos PRIMEIRO (prioridade máxima)
    // Gabaritos compostos cobrem múltiplos procedimentos e devem ter prioridade sobre padrões individuais
    const gabaritosCompostos = padroesCompFiltrados.filter(p => 
      p.isGabarito === 1 && p.codigoProcedimentoPrincipal.includes(" + ")
    );
    
    // Agrupar gabaritos compostos por chave (proc+setor) para selecionar o melhor por convênio
    const gabaritosCompostosPorChave = new Map<string, typeof gabaritosCompostos>();
    for (const gabCombo of gabaritosCompostos) {
      const codigosCombinados = gabCombo.codigoProcedimentoPrincipal.split(" + ").map(c => c.trim());
      const todosPresentes = codigosCombinados.every(c => codigosNaConta.has(c));
      const algumNoSetor = codigosCombinados.some(c => codigosNoSetor.has(c));
      if (!todosPresentes || !algumNoSetor) continue;
      
      const setorMatch = !gabCombo.setor || (setor !== 'GERAL' && gabCombo.setor.trim().toUpperCase() === setor.trim().toUpperCase());
      if (!setorMatch) continue;
      
      const chaveCombo = `${gabCombo.codigoProcedimentoPrincipal}|${setor}`;
      if (!gabaritosCompostosPorChave.has(chaveCombo)) gabaritosCompostosPorChave.set(chaveCombo, []);
      gabaritosCompostosPorChave.get(chaveCombo)!.push(gabCombo);
    }
    
    // Para cada chave, selecionar o melhor gabarito baseado no match de convênio
    for (const [chaveCombo, candidatos] of Array.from(gabaritosCompostosPorChave.entries())) {
      if (procedimentosJaAnalisados.has(chaveCombo)) continue;
      procedimentosJaAnalisados.add(chaveCombo);
      
      // Pontuar cada candidato por match de convênio
      const convenioNomeConta = (convenio || '').trim().toUpperCase();
      const pontuados = candidatos.map(g => {
        let score = 0;
        // Match exato de convenioId
        if (convenioIdConta && g.convenioId === convenioIdConta) score += 100;
        // Match por nome de convênio (quando convenioId é null na conta)
        else if (!convenioIdConta && g.convenioId) {
          // Buscar o nome do convênio pelo ID usando o mapa carregado
          const nomeConvGabarito = mapaConvenioNomes.get(g.convenioId as number) || '';
          if (nomeConvGabarito && convenioNomeConta) {
            if (nomeConvGabarito.includes(convenioNomeConta) || convenioNomeConta.includes(nomeConvGabarito)) {
              score += 80; // Match por nome de convênio
            }
          }
        }
        // Gabarito sem convênio (genérico) é melhor que convênio errado
        if (!g.convenioId) score += 10;
        // Mais itens = mais completo = melhor
        try {
          const itensGab = typeof g.itensAssociados === 'string' ? JSON.parse(g.itensAssociados) : g.itensAssociados || [];
          score += Math.min(itensGab.length, 50); // bonus por completude (max 50)
        } catch(e) {}
        return { gabarito: g, score };
      });
      
      pontuados.sort((a, b) => b.score - a.score);
      const melhorGabarito = pontuados[0].gabarito;
      
      const codigosCombinados = melhorGabarito.codigoProcedimentoPrincipal.split(" + ").map(c => c.trim());
      
      // Marcar todos os procedimentos do gabarito como cobertos
      for (const c of codigosCombinados) {
        procedimentosCobertosGabarito.add(`${c}|${setor}`);
      }
      
      processarPadraoComposicao(melhorGabarito, codigosNoSetor, codigosNaConta, itensDoSetor, itens, setor, divergencias, tiposProcedimento);
      gabaritosUsados++;
      
      const scoreCombo = 200; // Gabarito composto = máxima prioridade
      padroesDetalhados.push({
        padraoId: melhorGabarito.id,
        padraoNome: `${melhorGabarito.codigoProcedimentoPrincipal} - ${melhorGabarito.descricaoProcedimentoPrincipal || 'Sem nome'}`,
        isGabarito: true,
        convenioNome: (melhorGabarito as any).convenioNome || undefined,
        setor: (melhorGabarito as any).setor || setor,
        scoreMatch: scoreCombo,
        motivoSelecao: `Gabarito composto selecionado para setor ${setor} (melhor match convênio entre ${candidatos.length} candidatos)`,
      });
      
      logger.info({ 
        message: "Gabarito composto selecionado (melhor match convênio)", 
        padraoId: melhorGabarito.id, 
        proc: melhorGabarito.codigoProcedimentoPrincipal, 
        setor, 
        numeroConta,
        totalCandidatos: candidatos.length,
        scoreVencedor: pontuados[0].score,
      });
    }

    // FASE 2: Para procedimentos NÃO cobertos por gabaritos compostos, buscar padrão individual ou combinado
    for (const codigoProc of procedimentosNoSetor) {
      if (!codigoProc) continue;
      
      // Evitar analisar o mesmo procedimento+setor duas vezes
      const chaveAnalise = `${codigoProc}|${setor}`;
      if (procedimentosJaAnalisados.has(chaveAnalise)) continue;
      
      // Se este procedimento já foi coberto por um gabarito composto, pular
      if (procedimentosCobertosGabarito.has(chaveAnalise)) continue;
      procedimentosJaAnalisados.add(chaveAnalise);

      // Selecionar o melhor padrão para este procedimento+setor
      const padrao = selecionarMelhorPadrao(padroesCompFiltrados as any, codigoProc, setor !== 'GERAL' ? setor : null);
      
      // Se não encontrou padrão individual, tentar match com padrões combinados (não-gabarito)
      if (!padrao) {
        for (const p of padroesCompFiltrados) {
          if (!p.codigoProcedimentoPrincipal.includes(" + ")) continue;
          const codigosCombinados = p.codigoProcedimentoPrincipal.split(" + ").map(c => c.trim());
          if (codigosCombinados.includes(codigoProc)) {
            const todosPresentes = codigosCombinados.every(c => codigosNaConta.has(c));
            if (todosPresentes) {
              const chaveCombo = `${p.codigoProcedimentoPrincipal}|${setor}`;
              if (!procedimentosJaAnalisados.has(chaveCombo)) {
                procedimentosJaAnalisados.add(chaveCombo);
                processarPadraoComposicao(p, codigosNoSetor, codigosNaConta, itensDoSetor, itens, setor, divergencias, tiposProcedimento);
                if (p.isGabarito === 1) gabaritosUsados++;
                else padroesUsados++;
                padroesDetalhados.push({
                  padraoId: p.id,
                  padraoNome: `${p.codigoProcedimentoPrincipal} - ${p.descricaoProcedimentoPrincipal || 'Sem nome'}`,
                  isGabarito: p.isGabarito === 1,
                  convenioNome: (p as any).convenioNome || undefined,
                  setor: (p as any).setor || setor,
                  scoreMatch: p.isGabarito === 1 ? 200 : 30,
                  motivoSelecao: `Match combinado ${p.isGabarito === 1 ? '(gabarito)' : '(aprendido)'} no setor ${setor}`,
                });
              }
            }
          }
        }
        continue;
      }

      processarPadraoComposicao(padrao, codigosNoSetor, codigosNaConta, itensDoSetor, itens, setor, divergencias, tiposProcedimento);
      if (padrao.isGabarito === 1) gabaritosUsados++;
      else padroesUsados++;
      padroesDetalhados.push({
        padraoId: padrao.id,
        padraoNome: `${padrao.codigoProcedimentoPrincipal} - ${padrao.descricaoProcedimentoPrincipal || 'Sem nome'}`,
        isGabarito: padrao.isGabarito === 1,
        convenioNome: (padrao as any).convenioNome || undefined,
        setor: (padrao as any).setor || setor,
        scoreMatch: padrao.isGabarito === 1 ? 150 : 50,
        motivoSelecao: padrao.isGabarito === 1 ? `Gabarito manual selecionado para setor ${setor}` : `Padrão aprendido selecionado para setor ${setor}`,
      });
    }
  }

  // 9. Calcular resumo
  const resumoPorTipo: Record<string, number> = {};
  let totalAlertas = 0;
  let totalCriticos = 0;

  for (const div of divergencias) {
    resumoPorTipo[div.tipo] = (resumoPorTipo[div.tipo] || 0) + 1;
    if (div.severidade === "alerta") totalAlertas++;
    if (div.severidade === "critico") totalCriticos++;
  }

  const statusGeral = divergencias.some(d => d.severidade === "critico" || d.severidade === "alerta" || d.severidade === "aviso")
    ? "divergente" as const
    : "conforme" as const;

  // 10. Calcular Score de Risco
  const scoreRisco = calcularScoreRisco(divergencias, resumoPorTipo, itens.length);

  return {
    numeroConta,
    totalItensAnalisados: itens.length,
    totalDivergencias: divergencias.length,
    totalAlertas,
    totalCriticos,
    divergencias,
    resumoPorTipo,
    statusGeral,
    gabaritosUsados,
    padroesUsados,
    setoresAnalisados: setoresNaConta,
    scoreRisco,
    padroesDetalhados,
  };
}

/**
 * Processa um padrão de composição contra os itens de um setor
 */
function processarPadraoComposicao(
  padrao: any,
  codigosNoSetor: Set<string>,
  codigosNaConta: Set<string>,
  itensDoSetor: any[],
  todosItens: any[],
  setor: string,
  divergencias: Divergencia[],
  tiposProcedimento: Set<string>
) {
  const isGab = padrao.isGabarito === 1;
  const setorPadrao = padrao.setor || 'GERAL';
  const setorLabel = setor !== 'GERAL' ? ` [Setor: ${setor}]` : '';
  const fonteLabel = isGab ? "gabarito" : "padrão aprendido";
  const fonteSetorLabel = padrao.setor ? ` (setor: ${padrao.setor})` : ' (geral)';

  let itensAssociados: Array<{
    codigo: string;
    descricao: string;
    tipo: string;
    frequencia: number;
    quantidadeMedia: number;
    quantidadeMin?: number;
    quantidadeMax?: number;
    valorMedio?: number;
    categoria?: 'obrigatorio' | 'condicional' | 'opcional';
    grupo?: string;
  }>;

  // Parse itensAssociados - pode vir como string JSON do banco ou como array
  const rawItens = padrao.itensAssociados;
  if (typeof rawItens === 'string') {
    try {
      itensAssociados = JSON.parse(rawItens);
    } catch(e) {
      logger.warn({ message: "Erro ao parsear itensAssociados", padraoId: padrao.id, error: (e as Error).message });
      return;
    }
  } else if (Array.isArray(rawItens)) {
    itensAssociados = rawItens;
  } else {
    return;
  }

  if (!Array.isArray(itensAssociados)) return;

  // ========== LÓGICA DE GRUPOS CONDICIONAIS (Opção 3) ==========
  // Montar mapa de grupos e verificar quais estão "ativos" na conta
  // Um grupo está ativo se QUALQUER item do grupo estiver presente na conta
  const gruposMap = new Map<string, typeof itensAssociados>();
  const gruposAtivos = new Set<string>();
  
  for (const item of itensAssociados) {
    if (item.categoria === 'condicional' && item.grupo) {
      if (!gruposMap.has(item.grupo)) gruposMap.set(item.grupo, []);
      gruposMap.get(item.grupo)!.push(item);
      // Se algum item do grupo está na conta, o grupo está ativo
      if (codigosNaConta.has(item.codigo)) {
        gruposAtivos.add(item.grupo);
      }
    }
  }

  for (const itemEsperado of itensAssociados) {
    const categoria = itemEsperado.categoria || 'obrigatorio';
    const limiteFrequencia = isGab ? 50 : 70;
    
    // Verificar se o item está no setor correto (ou na conta inteira)
    const itemNoSetor = codigosNoSetor.has(itemEsperado.codigo);
    const itemNaConta = codigosNaConta.has(itemEsperado.codigo);
    
    // ========== REGRAS DE CATEGORIA (Opção 2) ==========
    // - obrigatorio: sempre gera alerta crítico se faltar
    // - condicional: só gera alerta se o GRUPO estiver ativo (algum item do grupo presente)
    // - opcional: NUNCA gera alerta de ITEM_FALTANTE
    
    if (itemEsperado.frequencia >= limiteFrequencia && !itemNaConta) {
      // Determinar se deve gerar alerta baseado na categoria
      let deveGerarAlerta = false;
      let categoriaLabel = '';
      
      if (categoria === 'obrigatorio') {
        deveGerarAlerta = true;
        categoriaLabel = 'OBRIGATÓRIO';
      } else if (categoria === 'condicional') {
        // Só gera alerta se o grupo está ativo (algum item do grupo está na conta)
        if (itemEsperado.grupo && gruposAtivos.has(itemEsperado.grupo)) {
          deveGerarAlerta = true;
          categoriaLabel = `CONDICIONAL (grupo: ${itemEsperado.grupo})`;
        }
        // Se o grupo não está ativo, não gera alerta
      } else if (categoria === 'opcional') {
        deveGerarAlerta = false; // Nunca gera alerta
      }
      
      if (deveGerarAlerta) {
        const severidade = categoria === 'obrigatorio'
          ? (isGab ? "critico" : "alerta")
          : (isGab ? "alerta" : "aviso"); // condicional tem severidade menor
        
        divergencias.push({
          tipo: "ITEM_FALTANTE",
          severidade,
          mensagem: `Item "${itemEsperado.descricao || itemEsperado.codigo}" [${categoriaLabel}] esperado no kit de "${padrao.descricaoProcedimentoPrincipal}" (frequência: ${itemEsperado.frequencia.toFixed(0)}%) não encontrado na conta.${setorLabel} [Fonte: ${fonteLabel}${fonteSetorLabel}]`,
          codigoItem: itemEsperado.codigo,
          descricaoItem: itemEsperado.descricao,
          padraoId: padrao.id,
          isGabarito: isGab,
          setor: setor !== 'GERAL' ? setor : undefined,
          detalhes: {
            procedimentoPrincipal: padrao.codigoProcedimentoPrincipal,
            descricaoProcedimentoPrincipal: padrao.descricaoProcedimentoPrincipal,
            frequenciaEsperada: itemEsperado.frequencia,
            quantidadeMedia: itemEsperado.quantidadeMedia,
            valorMedio: itemEsperado.valorMedio,
            fonte: fonteLabel,
            setorPadrao: padrao.setor || null,
            setorConta: setor,
            categoria: categoria,
            grupo: itemEsperado.grupo || null,
          },
        });
      }
    }

    // Verificar quantidade se o item existe na conta
    if (itemNaConta && (itemEsperado.quantidadeMedia > 0 || (itemEsperado.quantidadeMin ?? 0) > 0 || (itemEsperado.quantidadeMax ?? 0) > 0)) {
      // Buscar item no setor específico primeiro, depois na conta inteira
      const itemNaContaObj = itensDoSetor.find(i => i.codigoItem === itemEsperado.codigo) 
        || todosItens.find(i => i.codigoItem === itemEsperado.codigo);
      
      if (itemNaContaObj) {
        const qtdNaConta = parseFloat(itemNaContaObj.quantidade || "0");
        const qtdMin = itemEsperado.quantidadeMin ?? itemEsperado.quantidadeMedia;
        const qtdMax = itemEsperado.quantidadeMax ?? itemEsperado.quantidadeMedia;
        const qtdEsperada = itemEsperado.quantidadeMedia;
        
        if (qtdMin > 0 || qtdMax > 0) {
          if (qtdNaConta < qtdMin) {
            divergencias.push({
              tipo: "COMPOSICAO",
              severidade: isGab ? "alerta" : "aviso",
              mensagem: `Quantidade de "${itemEsperado.descricao || itemEsperado.codigo}" ABAIXO do mínimo permitido pelo ${fonteLabel}: mínimo ${qtdMin}, encontrado ${qtdNaConta.toFixed(1)}${setorLabel}`,
              codigoItem: itemEsperado.codigo,
              descricaoItem: itemEsperado.descricao,
              valorEsperado: `${qtdMin} - ${qtdMax}`,
              valorEncontrado: `${qtdNaConta.toFixed(1)}`,
              padraoId: padrao.id,
              isGabarito: isGab,
              setor: setor !== 'GERAL' ? setor : undefined,
              detalhes: {
                procedimentoPrincipal: padrao.codigoProcedimentoPrincipal,
                fonte: fonteLabel,
                setorPadrao: padrao.setor || null,
                quantidadeMin: qtdMin,
                quantidadeMax: qtdMax,
              },
            });
          } else if (qtdNaConta > qtdMax) {
            divergencias.push({
              tipo: "COMPOSICAO",
              severidade: isGab ? "alerta" : "aviso",
              mensagem: `Quantidade de "${itemEsperado.descricao || itemEsperado.codigo}" ACIMA do máximo permitido pelo ${fonteLabel}: máximo ${qtdMax}, encontrado ${qtdNaConta.toFixed(1)}${setorLabel}`,
              codigoItem: itemEsperado.codigo,
              descricaoItem: itemEsperado.descricao,
              valorEsperado: `${qtdMin} - ${qtdMax}`,
              valorEncontrado: `${qtdNaConta.toFixed(1)}`,
              padraoId: padrao.id,
              isGabarito: isGab,
              setor: setor !== 'GERAL' ? setor : undefined,
              detalhes: {
                procedimentoPrincipal: padrao.codigoProcedimentoPrincipal,
                fonte: fonteLabel,
                setorPadrao: padrao.setor || null,
                quantidadeMin: qtdMin,
                quantidadeMax: qtdMax,
              },
            });
          }
        } else if (qtdNaConta > 0 && qtdEsperada > 0) {
          const diffPercent = Math.abs(qtdNaConta - qtdEsperada) / qtdEsperada * 100;
          if (diffPercent > 50) {
            divergencias.push({
              tipo: "COMPOSICAO",
              severidade: isGab ? "alerta" : "aviso",
              mensagem: `Quantidade de "${itemEsperado.descricao || itemEsperado.codigo}" divergente do ${fonteLabel}: esperado ~${qtdEsperada.toFixed(1)}, encontrado ${qtdNaConta.toFixed(1)} (diferença de ${diffPercent.toFixed(0)}%)${setorLabel}`,
              codigoItem: itemEsperado.codigo,
              descricaoItem: itemEsperado.descricao,
              valorEsperado: `${qtdEsperada.toFixed(1)}`,
              valorEncontrado: `${qtdNaConta.toFixed(1)}`,
              padraoId: padrao.id,
              isGabarito: isGab,
              setor: setor !== 'GERAL' ? setor : undefined,
              detalhes: {
                procedimentoPrincipal: padrao.codigoProcedimentoPrincipal,
                fonte: fonteLabel,
                setorPadrao: padrao.setor || null,
              },
            });
          }
        }
      }
    }
  }

  // Verificar itens extras (na conta mas não no kit) - apenas para gabaritos
  if (isGab) {
    const codigosEsperados = new Set(itensAssociados.map(i => i.codigo));
    const itensNaoProc = itensDoSetor.filter(i => {
      const tipo = (i.tipoItem || "").toUpperCase().trim();
      return !tiposProcedimento.has(tipo) && !tipo.includes("PROC");
    });
    
    for (const itemNaConta of itensNaoProc) {
      if (itemNaConta.codigoItem && !codigosEsperados.has(itemNaConta.codigoItem)) {
        divergencias.push({
          tipo: "ITEM_EXTRA",
          severidade: "info",
          mensagem: `Item "${itemNaConta.descricaoItem || itemNaConta.codigoItem}" presente na conta mas não definido no gabarito de "${padrao.descricaoProcedimentoPrincipal}".${setorLabel}`,
          codigoItem: itemNaConta.codigoItem,
          descricaoItem: itemNaConta.descricaoItem || undefined,
          padraoId: padrao.id,
          isGabarito: true,
          setor: setor !== 'GERAL' ? setor : undefined,
          detalhes: {
            procedimentoPrincipal: padrao.codigoProcedimentoPrincipal,
            fonte: "gabarito",
            setorPadrao: padrao.setor || null,
          },
        });
      }
    }
  }
}

/**
 * Executa a comparação e salva os resultados nos itens e no resumo da conta
 */
export async function executarComparacaoESalvar(
  numeroConta: string,
  estabelecimentoId: number
): Promise<ResultadoComparacao> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const resultado = await compararContaComPadroes(numeroConta, estabelecimentoId);

  // Separar divergências: as que têm item correspondente na conta vs as órfãs (ITEM_FALTANTE)
  const divPorItem = new Map<string, Divergencia[]>();
  const divergenciasGerais: Divergencia[] = []; // Divergências sem item na conta (ITEM_FALTANTE, etc.)
  
  // Buscar todos os códigos de itens que existem na conta
  const itensExistentes = await db
    .select({ codigoItem: contasConvenioItens.codigoItem })
    .from(contasConvenioItens)
    .where(and(
      eq(contasConvenioItens.numeroConta, numeroConta),
      eq(contasConvenioItens.estabelecimentoId, estabelecimentoId),
    ));
  const codigosExistentes = new Set(itensExistentes.map(i => i.codigoItem).filter(Boolean));
  
  for (const div of resultado.divergencias) {
    if (div.tipo === "ITEM_FALTANTE" || (div.codigoItem && !codigosExistentes.has(div.codigoItem))) {
      // Item faltante: não existe na conta, salvar como divergência geral
      divergenciasGerais.push(div);
    } else if (div.codigoItem) {
      if (!divPorItem.has(div.codigoItem)) divPorItem.set(div.codigoItem, []);
      divPorItem.get(div.codigoItem)!.push(div);
    } else {
      // Divergência sem código de item - também salvar como geral
      divergenciasGerais.push(div);
    }
  }

  // Atualizar cada item com suas divergências
  const itens = await db
    .select({ id: contasConvenioItens.id, codigoItem: contasConvenioItens.codigoItem })
    .from(contasConvenioItens)
    .where(and(
      eq(contasConvenioItens.numeroConta, numeroConta),
      eq(contasConvenioItens.estabelecimentoId, estabelecimentoId),
    ));

  for (const item of itens) {
    const divs = item.codigoItem ? divPorItem.get(item.codigoItem) : undefined;
    // Classificar status: qualquer divergência (incluindo aviso) marca como divergente
    // Apenas "info" puro é considerado conforme
    const status = divs && divs.some(d => d.severidade === "critico" || d.severidade === "alerta" || d.severidade === "aviso")
      ? "divergente" as const
      : divs && divs.length > 0
        ? "conforme" as const
        : "conforme" as const;

    await db.update(contasConvenioItens)
      .set({
        statusAnalise: status,
        divergencias: divs || null,
      })
      .where(eq(contasConvenioItens.id, item.id));
  }

  // Atualizar resumo da conta (com score de risco e divergências gerais)
  await db.update(contasConvenioResumo)
    .set({
      statusAnalise: resultado.statusGeral,
      totalDivergencias: resultado.totalDivergencias,
      totalAlertas: resultado.totalAlertas + resultado.totalCriticos,
      scoreRisco: resultado.scoreRisco.score,
      detalhesRisco: resultado.scoreRisco,
      divergenciasGerais: divergenciasGerais.length > 0 ? divergenciasGerais : null,
    })
    .where(and(
      eq(contasConvenioResumo.numeroConta, numeroConta),
      eq(contasConvenioResumo.estabelecimentoId, estabelecimentoId),
    ));

  // Salvar log de análise para rastreabilidade
  const divCritico = resultado.divergencias.filter(d => d.severidade === "critico").length;
  const divAlerta = resultado.divergencias.filter(d => d.severidade === "alerta").length;
  const divAviso = resultado.divergencias.filter(d => d.severidade === "aviso").length;
  const divInfo = resultado.divergencias.filter(d => d.severidade === "info").length;

  // Registrar um log para cada padrão/gabarito usado
  if (resultado.padroesDetalhados.length > 0) {
    for (const pd of resultado.padroesDetalhados) {
      try {
        await db.insert(logAnaliseComparacao).values({
          numeroConta,
          estabelecimentoId,
          padraoId: pd.padraoId,
          padraoNome: pd.padraoNome,
          padraoTipo: pd.isGabarito ? 'gabarito_manual' : 'padrao_aprendido',
          isGabarito: pd.isGabarito ? 1 : 0,
          convenioNome: pd.convenioNome || null,
          setorPadrao: pd.setor || null,
          procedimentosConta: resultado.setoresAnalisados.join(', '),
          totalItensAnalisados: resultado.totalItensAnalisados,
          totalDivergencias: resultado.totalDivergencias,
          divergenciasCritico: divCritico,
          divergenciasAlerta: divAlerta,
          divergenciasAviso: divAviso,
          divergenciasInfo: divInfo,
          scoreMatch: pd.scoreMatch,
          motivoSelecao: pd.motivoSelecao,
          statusGeral: resultado.statusGeral,
        });
      } catch (e) {
        logger.warn({ message: "Erro ao salvar log de análise", error: e });
      }
    }
  } else {
    // Nenhum padrão usado - registrar mesmo assim para rastreabilidade
    try {
      await db.insert(logAnaliseComparacao).values({
        numeroConta,
        estabelecimentoId,
        padraoNome: 'Nenhum padrão encontrado',
        padraoTipo: 'nenhum',
        isGabarito: 0,
        totalItensAnalisados: resultado.totalItensAnalisados,
        totalDivergencias: resultado.totalDivergencias,
        divergenciasCritico: divCritico,
        divergenciasAlerta: divAlerta,
        divergenciasAviso: divAviso,
        divergenciasInfo: divInfo,
        statusGeral: resultado.statusGeral,
      });
    } catch (e) {
      logger.warn({ message: "Erro ao salvar log de análise (sem padrão)", error: e });
    }
  }

  logger.info({
    message: "Comparação com padrões concluída",
    numeroConta,
    totalDivergencias: resultado.totalDivergencias,
    gabaritosUsados: resultado.gabaritosUsados,
    padroesUsados: resultado.padroesUsados,
    padroesDetalhados: resultado.padroesDetalhados.map(p => `${p.padraoNome} (${p.isGabarito ? 'gabarito' : 'padrão'})`),
    setoresAnalisados: resultado.setoresAnalisados,
    statusGeral: resultado.statusGeral,
  });

  return resultado;
}

/**
 * Calcula o Score de Risco Consolidado (0-100) de uma conta
 * Combina divergências de composição, preço, quantidade e glosa
 * Pesos: Composição 35%, Preço 25%, Quantidade 20%, Glosa 20%
 */
function calcularScoreRisco(
  divergencias: Divergencia[],
  resumoPorTipo: Record<string, number>,
  totalItens: number
): DetalhesScoreRisco {
  if (divergencias.length === 0 || totalItens === 0) {
    return { score: 0, composicao: 0, preco: 0, quantidade: 0, glosa: 0, detalhes: [] };
  }

  const detalhes: string[] = [];
  
  // Score de Composição (0-100): itens faltantes e extras
  let scoreComposicao = 0;
  const divComposicao = divergencias.filter(d => d.tipo === "ITEM_FALTANTE" || d.tipo === "ITEM_EXTRA" || d.tipo === "COMPOSICAO");
  if (divComposicao.length > 0) {
    const criticos = divComposicao.filter(d => d.severidade === "critico" || d.severidade === "alerta").length;
    const avisos = divComposicao.filter(d => d.severidade === "aviso" || d.severidade === "info").length;
    scoreComposicao = Math.min(100, criticos * 25 + avisos * 10);
    detalhes.push(`Composição: ${divComposicao.length} divergência(s) (${criticos} críticas)`);
  }

  // Score de Preço (0-100): valores fora da faixa
  let scorePreco = 0;
  const divPreco = divergencias.filter(d => d.tipo === "PRECO");
  if (divPreco.length > 0) {
    const criticos = divPreco.filter(d => d.severidade === "critico" || d.severidade === "alerta").length;
    const avisos = divPreco.filter(d => d.severidade === "aviso" || d.severidade === "info").length;
    scorePreco = Math.min(100, criticos * 30 + avisos * 8);
    detalhes.push(`Preço: ${divPreco.length} item(ns) fora da faixa (${criticos} críticos)`);
  }

  // Score de Quantidade (0-100): quantidades anormais
  let scoreQuantidade = 0;
  const divQtd = divergencias.filter(d => d.tipo === "QUANTIDADE");
  if (divQtd.length > 0) {
    const criticos = divQtd.filter(d => d.severidade === "critico" || d.severidade === "alerta").length;
    const avisos = divQtd.filter(d => d.severidade === "aviso" || d.severidade === "info").length;
    scoreQuantidade = Math.min(100, criticos * 30 + avisos * 10);
    detalhes.push(`Quantidade: ${divQtd.length} item(ns) com quantidade anormal`);
  }

  // Score de Glosa (0-100): risco de glosa
  let scoreGlosa = 0;
  const divGlosa = divergencias.filter(d => d.tipo === "GLOSA_RISCO");
  if (divGlosa.length > 0) {
    const criticos = divGlosa.filter(d => d.severidade === "critico" || d.severidade === "alerta").length;
    const avisos = divGlosa.filter(d => d.severidade === "aviso" || d.severidade === "info").length;
    scoreGlosa = Math.min(100, criticos * 35 + avisos * 15);
    detalhes.push(`Glosa: ${divGlosa.length} item(ns) com risco de glosa`);
  }

  // Score consolidado com pesos
  const score = Math.min(100, Math.round(
    scoreComposicao * 0.35 +
    scorePreco * 0.25 +
    scoreQuantidade * 0.20 +
    scoreGlosa * 0.20
  ));

  return {
    score,
    composicao: scoreComposicao,
    preco: scorePreco,
    quantidade: scoreQuantidade,
    glosa: scoreGlosa,
    detalhes,
  };
}
