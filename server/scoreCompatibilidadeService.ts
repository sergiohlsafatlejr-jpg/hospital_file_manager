/**
 * Serviço de Score de Compatibilidade
 * 
 * Calcula um score multicritério para sugerir vinculações entre itens faturados
 * e itens do demonstrativo que não foram conciliados por código direto.
 * 
 * Critérios de pontuação:
 * - Guia: 30 pontos (match exato)
 * - Código: 25 pontos (normalizado, sem zeros à esquerda)
 * - Valor: 25 pontos (proporcional à proximidade)
 * - Descrição: 15 pontos (similaridade textual)
 * - Quantidade: 5 pontos (match exato)
 * 
 * Score mínimo para sugestão: 40%
 * Score para vinculação automática: 85%
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface ItemParaMatch {
  id?: number;
  guia: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  valor: number;
}

export interface SugestaoVinculacao {
  itemFaturadoId: number;
  itemDemoId: number;
  codigoFaturado: string;
  codigoDemo: string;
  descricaoFaturado: string;
  descricaoDemo: string;
  valorFaturado: number;
  valorDemo: number;
  guia: string;
  score: number;
  detalhesScore: {
    guia: number;
    codigo: number;
    valor: number;
    descricao: number;
    quantidade: number;
  };
  confianca: "alta" | "media" | "baixa";
}

/**
 * Normaliza código removendo zeros à esquerda, espaços e caracteres especiais
 */
export function normalizarCodigo(codigo: string): string {
  if (!codigo) return "";
  return codigo
    .trim()
    .replace(/^0+/, "")       // Remove zeros à esquerda
    .replace(/[.\-\/\s]/g, "") // Remove pontos, hífens, barras e espaços
    .toUpperCase();
}

/**
 * Calcula similaridade entre duas strings usando distância de Levenshtein normalizada
 */
export function calcularSimilaridadeTexto(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toUpperCase().trim();
  const s2 = str2.toUpperCase().trim();
  
  if (s1 === s2) return 1;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  // Usar distância de Levenshtein
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Otimização: se uma string é muito maior que a outra, retornar a diferença
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.7) {
    return Math.max(len1, len2);
  }
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calcula similaridade de valor (0 a 1)
 * Quanto mais próximos os valores, maior o score
 */
export function calcularSimilaridadeValor(valor1: number, valor2: number): number {
  if (valor1 === 0 && valor2 === 0) return 1;
  if (valor1 === 0 || valor2 === 0) return 0;
  
  const menor = Math.min(valor1, valor2);
  const maior = Math.max(valor1, valor2);
  
  // Proporção entre menor e maior
  return menor / maior;
}

/**
 * Calcula o score de compatibilidade entre dois itens
 */
export function calcularScore(
  itemFaturado: ItemParaMatch,
  itemDemo: ItemParaMatch
): { score: number; detalhes: { guia: number; codigo: number; valor: number; descricao: number; quantidade: number } } {
  const PESO_GUIA = 30;
  const PESO_CODIGO = 25;
  const PESO_VALOR = 25;
  const PESO_DESCRICAO = 15;
  const PESO_QUANTIDADE = 5;
  
  // Score da guia (30 pontos)
  let scoreGuia = 0;
  if (itemFaturado.guia && itemDemo.guia) {
    const guia1 = normalizarCodigo(itemFaturado.guia);
    const guia2 = normalizarCodigo(itemDemo.guia);
    if (guia1 === guia2) {
      scoreGuia = PESO_GUIA;
    } else if (guia1.includes(guia2) || guia2.includes(guia1)) {
      scoreGuia = PESO_GUIA * 0.7;
    }
  }
  
  // Score do código (25 pontos)
  let scoreCodigo = 0;
  if (itemFaturado.codigo && itemDemo.codigo) {
    const cod1 = normalizarCodigo(itemFaturado.codigo);
    const cod2 = normalizarCodigo(itemDemo.codigo);
    if (cod1 === cod2) {
      scoreCodigo = PESO_CODIGO;
    } else if (cod1.includes(cod2) || cod2.includes(cod1)) {
      scoreCodigo = PESO_CODIGO * 0.6;
    } else {
      // Verificar se são similares (ex: 10101012 vs 10101013)
      const simCod = calcularSimilaridadeTexto(cod1, cod2);
      if (simCod > 0.8) {
        scoreCodigo = PESO_CODIGO * simCod * 0.5;
      }
    }
  }
  
  // Score do valor (25 pontos)
  let scoreValor = 0;
  const v1 = Number(itemFaturado.valor) || 0;
  const v2 = Number(itemDemo.valor) || 0;
  const simValor = calcularSimilaridadeValor(v1, v2);
  scoreValor = PESO_VALOR * simValor;
  
  // Score da descrição (15 pontos)
  let scoreDescricao = 0;
  if (itemFaturado.descricao && itemDemo.descricao) {
    const simDesc = calcularSimilaridadeTexto(itemFaturado.descricao, itemDemo.descricao);
    scoreDescricao = PESO_DESCRICAO * simDesc;
  }
  
  // Score da quantidade (5 pontos)
  let scoreQuantidade = 0;
  const q1 = Number(itemFaturado.quantidade) || 0;
  const q2 = Number(itemDemo.quantidade) || 0;
  if (q1 > 0 && q2 > 0) {
    if (q1 === q2) {
      scoreQuantidade = PESO_QUANTIDADE;
    } else {
      const simQtd = Math.min(q1, q2) / Math.max(q1, q2);
      scoreQuantidade = PESO_QUANTIDADE * simQtd;
    }
  }
  
  const scoreTotal = scoreGuia + scoreCodigo + scoreValor + scoreDescricao + scoreQuantidade;
  
  return {
    score: Math.round(scoreTotal * 100) / 100,
    detalhes: {
      guia: Math.round(scoreGuia * 100) / 100,
      codigo: Math.round(scoreCodigo * 100) / 100,
      valor: Math.round(scoreValor * 100) / 100,
      descricao: Math.round(scoreDescricao * 100) / 100,
      quantidade: Math.round(scoreQuantidade * 100) / 100,
    },
  };
}

/**
 * Gera sugestões de vinculação para itens pendentes de uma conciliação
 */
export async function gerarSugestoesVinculacao(params: {
  estabelecimentoId: number;
  arquivoDemoId: number;
  guia?: string;
  scoreMinimo?: number;
}): Promise<SugestaoVinculacao[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, arquivoDemoId, guia, scoreMinimo = 40 } = params;
  
  // Buscar itens faturados sem match (pendente vinculação)
  let queryFaturados = `SELECT id, guiaTasy as guia, codigoTasy as codigo, descricaoTasy as descricao, 
    quantidadeTasy as quantidade, valorTasy as valor
    FROM conciliacao
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND arquivoDemoId = ${arquivoDemoId}
      AND statusConciliacao = 'nao_encontrado_demo' 
      AND receberHospital = 'S' 
      AND pendenteVinculacao = 'sim'`;
  if (guia) {
    queryFaturados += ` AND guiaTasy = '${guia.replace(/'/g, "''")}'`;
  }
  
  // Buscar itens do demo sem match
  let queryDemo = `SELECT id, guiaDemo as guia, codigoDemo as codigo, descricaoDemo as descricao, 
    quantidadeDemo as quantidade, (COALESCE(valorPagoDemo,0) + COALESCE(valorGlosadoDemo,0)) as valor
    FROM conciliacao
    WHERE estabelecimentoId = ${estabelecimentoId} 
      AND arquivoDemoId = ${arquivoDemoId}
      AND statusConciliacao = 'nao_encontrado_tasy' 
      AND pendenteVinculacao = 'sim'`;
  if (guia) {
    queryDemo += ` AND guiaDemo = '${guia.replace(/'/g, "''")}'`;
  }
  
  const faturados = await db.execute(sql.raw(queryFaturados)) as unknown as ItemParaMatch[];
  const demoItens = await db.execute(sql.raw(queryDemo)) as unknown as ItemParaMatch[];
  
  if (faturados.length === 0 || demoItens.length === 0) {
    return [];
  }
  
  // Calcular scores para todos os pares possíveis
  const sugestoes: SugestaoVinculacao[] = [];
  
  for (const fat of faturados) {
    const candidatos: SugestaoVinculacao[] = [];
    
    for (const demo of demoItens) {
      const { score, detalhes } = calcularScore(fat, demo);
      
      if (score >= scoreMinimo) {
        candidatos.push({
          itemFaturadoId: (fat as any).id,
          itemDemoId: (demo as any).id,
          codigoFaturado: fat.codigo,
          codigoDemo: demo.codigo,
          descricaoFaturado: fat.descricao,
          descricaoDemo: demo.descricao,
          valorFaturado: Number(fat.valor) || 0,
          valorDemo: Number(demo.valor) || 0,
          guia: fat.guia || demo.guia,
          score,
          detalhesScore: detalhes,
          confianca: score >= 85 ? "alta" : score >= 60 ? "media" : "baixa",
        });
      }
    }
    
    // Ordenar candidatos por score e pegar o melhor
    candidatos.sort((a, b) => b.score - a.score);
    if (candidatos.length > 0) {
      sugestoes.push(candidatos[0]);
    }
  }
  
  // Ordenar sugestões por score decrescente
  sugestoes.sort((a, b) => b.score - a.score);
  
  return sugestoes;
}

/**
 * Aceitar uma sugestão de vinculação: cria a vinculação na tabela vinculacao_codigos
 * e atualiza os registros de conciliação
 */
export async function aceitarSugestaoVinculacao(params: {
  estabelecimentoId: number;
  convenioId?: number;
  itemFaturadoId: number;
  itemDemoId: number;
  codigoHospital: string;
  codigoConvenio: string;
  descricaoHospital: string;
  descricaoConvenio: string;
  userId: number;
}): Promise<{ vinculacaoId: number; mensagem: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, convenioId, itemFaturadoId, itemDemoId, 
    codigoHospital, codigoConvenio, descricaoHospital, descricaoConvenio, userId } = params;
  
  // Verificar se já existe vinculação
  const existente = await db.execute(
    sql.raw(`SELECT id FROM vinculacao_codigos 
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND codigoHospital = '${codigoHospital.replace(/'/g, "''")}'
        AND codigoConvenio = '${codigoConvenio.replace(/'/g, "''")}'
        AND ativo = 'sim' LIMIT 1`)
  ) as unknown as any[];
  
  let vinculacaoId: number;
  
  if (existente.length > 0) {
    vinculacaoId = existente[0].id;
    // Incrementar vezesConfirmada
    await db.execute(
      sql.raw(`UPDATE vinculacao_codigos 
        SET vezesConfirmada = vezesConfirmada + 1, 
            vezesAplicada = vezesAplicada + 1,
            ultimaAplicacao = NOW()
        WHERE id = ${vinculacaoId}`)
    );
  } else {
    // Criar nova vinculação
    const result = await db.execute(
      sql.raw(`INSERT INTO vinculacao_codigos 
        (estabelecimentoId, convenioId, codigoHospital, descricaoHospital, codigoConvenio, descricaoConvenio, 
         tipoItem, ativo, criadoPor, metodo_match, confianca, vezesAplicada, vezesConfirmada)
        VALUES (${estabelecimentoId}, ${convenioId || 'NULL'}, 
          '${codigoHospital.replace(/'/g, "''")}', '${(descricaoHospital || '').replace(/'/g, "''")}',
          '${codigoConvenio.replace(/'/g, "''")}', '${(descricaoConvenio || '').replace(/'/g, "''")}',
          'outros', 'sim', ${userId}, 'manual', 100.00, 1, 1)`)
    );
    vinculacaoId = Number((result as any)[0]?.insertId || 0);
  }
  
  // Atualizar os registros de conciliação para refletir a vinculação
  // Buscar dados do item demo
  const itemDemo = await db.execute(
    sql.raw(`SELECT valorPagoDemo, valorGlosadoDemo, motivoGlosaDemo, codigoDemo, descricaoDemo, quantidadeDemo, guiaDemo
      FROM conciliacao WHERE id = ${itemDemoId}`)
  ) as unknown as any[];
  
  if (itemDemo.length > 0) {
    const demo = itemDemo[0];
    const vlPago = Number(demo.valorPagoDemo) || 0;
    const vlGlosa = Number(demo.valorGlosadoDemo) || 0;
    
    // Buscar valor faturado
    const itemFat = await db.execute(
      sql.raw(`SELECT valorTasy FROM conciliacao WHERE id = ${itemFaturadoId}`)
    ) as unknown as any[];
    const vlFat = Number(itemFat[0]?.valorTasy) || 0;
    
    // Determinar novo status
    let novoStatus = "conciliado";
    if (vlGlosa > 0 && vlPago === 0) {
      novoStatus = "glosado";
    } else if (vlGlosa > 0 && vlPago > 0) {
      novoStatus = "pago_parcial";
    } else if (Math.abs(vlFat - vlPago) >= 0.02) {
      novoStatus = "divergencia_valor";
    }
    
    // Atualizar item faturado com dados do demo
    await db.execute(
      sql.raw(`UPDATE conciliacao SET 
        guiaDemo = ${demo.guiaDemo ? `'${demo.guiaDemo}'` : 'NULL'},
        codigoDemo = ${demo.codigoDemo ? `'${demo.codigoDemo.replace(/'/g, "''")}'` : 'NULL'},
        descricaoDemo = ${demo.descricaoDemo ? `'${demo.descricaoDemo.replace(/'/g, "''")}'` : 'NULL'},
        quantidadeDemo = ${demo.quantidadeDemo || 'NULL'},
        valorPagoDemo = ${vlPago},
        valorGlosadoDemo = ${vlGlosa},
        motivoGlosaDemo = ${demo.motivoGlosaDemo ? `'${demo.motivoGlosaDemo.replace(/'/g, "''")}'` : 'NULL'},
        statusConciliacao = '${novoStatus}',
        diferencaValor = ${vlFat - vlPago},
        vinculacaoId = ${vinculacaoId},
        metodoMatch = 'vinculacao',
        pendenteVinculacao = 'nao',
        scoreCompatibilidade = 100.00
      WHERE id = ${itemFaturadoId}`)
    );
    
    // Remover o item demo (já foi vinculado)
    await db.execute(
      sql.raw(`DELETE FROM conciliacao WHERE id = ${itemDemoId}`)
    );
  }
  
  return { vinculacaoId, mensagem: "Vinculação aceita e conciliação atualizada com sucesso" };
}

/**
 * Rejeitar uma sugestão de vinculação: registra feedback negativo
 */
export async function rejeitarSugestaoVinculacao(params: {
  estabelecimentoId: number;
  codigoHospital: string;
  codigoConvenio: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, codigoHospital, codigoConvenio } = params;
  
  // Verificar se já existe vinculação para incrementar rejeição
  const existente = await db.execute(
    sql.raw(`SELECT id FROM vinculacao_codigos 
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND codigoHospital = '${codigoHospital.replace(/'/g, "''")}'
        AND codigoConvenio = '${codigoConvenio.replace(/'/g, "''")}'
      LIMIT 1`)
  ) as unknown as any[];
  
  if (existente.length > 0) {
    await db.execute(
      sql.raw(`UPDATE vinculacao_codigos 
        SET vezesRejeitada = vezesRejeitada + 1
        WHERE id = ${existente[0].id}`)
    );
  }
}

/**
 * Aplicar vinculações automáticas para itens com score >= 85 e regras confirmadas
 */
export async function aplicarVinculacoesAutomaticas(params: {
  estabelecimentoId: number;
  arquivoDemoId: number;
  convenioId?: number;
}): Promise<{ vinculacoesAplicadas: number; itensAtualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  const { estabelecimentoId, arquivoDemoId, convenioId } = params;
  
  // Buscar regras de vinculação com alta confiança (auto-promovidas ou com score >= 90%)
  const convFilter = convenioId ? `AND (convenioId = ${convenioId} OR convenioId IS NULL)` : '';
  const regrasAuto = await db.execute(
    sql.raw(`SELECT id, codigoHospital, codigoConvenio FROM vinculacao_codigos
      WHERE estabelecimentoId = ${estabelecimentoId} 
        AND ativo = 'sim' ${convFilter}
        AND (autoPromovida = 'sim' OR (vezesConfirmada >= 3 AND vezesRejeitada = 0))`)
  ) as unknown as any[];
  
  let vinculacoesAplicadas = 0;
  let itensAtualizados = 0;
  
  for (const regra of regrasAuto) {
    // Buscar itens faturados pendentes com esse código
    const itensFat = await db.execute(
      sql.raw(`SELECT id, guiaTasy, valorTasy FROM conciliacao
        WHERE estabelecimentoId = ${estabelecimentoId}
          AND arquivoDemoId = ${arquivoDemoId}
          AND codigoTasy = '${regra.codigoHospital.replace(/'/g, "''")}'
          AND statusConciliacao = 'nao_encontrado_demo'
          AND pendenteVinculacao = 'sim'`)
    ) as unknown as any[];
    
    for (const fat of itensFat) {
      // Buscar item demo correspondente na mesma guia
      const itensDemo = await db.execute(
        sql.raw(`SELECT id, valorPagoDemo, valorGlosadoDemo, motivoGlosaDemo, codigoDemo, descricaoDemo, quantidadeDemo
          FROM conciliacao
          WHERE estabelecimentoId = ${estabelecimentoId}
            AND arquivoDemoId = ${arquivoDemoId}
            AND guiaDemo = '${(fat.guiaTasy || '').replace(/'/g, "''")}'
            AND codigoDemo = '${regra.codigoConvenio.replace(/'/g, "''")}'
            AND statusConciliacao = 'nao_encontrado_tasy'
            AND pendenteVinculacao = 'sim'
          LIMIT 1`)
      ) as unknown as any[];
      
      if (itensDemo.length > 0) {
        const demo = itensDemo[0];
        const vlPago = Number(demo.valorPagoDemo) || 0;
        const vlGlosa = Number(demo.valorGlosadoDemo) || 0;
        const vlFat = Number(fat.valorTasy) || 0;
        
        let novoStatus = "conciliado";
        if (vlGlosa > 0 && vlPago === 0) novoStatus = "glosado";
        else if (vlGlosa > 0 && vlPago > 0) novoStatus = "pago_parcial";
        else if (Math.abs(vlFat - vlPago) >= 0.02) novoStatus = "divergencia_valor";
        
        await db.execute(
          sql.raw(`UPDATE conciliacao SET 
            codigoDemo = '${(demo.codigoDemo || '').replace(/'/g, "''")}',
            descricaoDemo = ${demo.descricaoDemo ? `'${demo.descricaoDemo.replace(/'/g, "''")}'` : 'NULL'},
            quantidadeDemo = ${demo.quantidadeDemo || 'NULL'},
            valorPagoDemo = ${vlPago},
            valorGlosadoDemo = ${vlGlosa},
            motivoGlosaDemo = ${demo.motivoGlosaDemo ? `'${demo.motivoGlosaDemo.replace(/'/g, "''")}'` : 'NULL'},
            statusConciliacao = '${novoStatus}',
            diferencaValor = ${vlFat - vlPago},
            vinculacaoId = ${regra.id},
            metodoMatch = 'vinculacao',
            pendenteVinculacao = 'nao',
            scoreCompatibilidade = 95.00
          WHERE id = ${fat.id}`)
        );
        
        await db.execute(sql.raw(`DELETE FROM conciliacao WHERE id = ${demo.id}`));
        
        // Atualizar contadores da regra
        await db.execute(
          sql.raw(`UPDATE vinculacao_codigos SET vezesAplicada = vezesAplicada + 1, ultimaAplicacao = NOW() WHERE id = ${regra.id}`)
        );
        
        itensAtualizados++;
      }
    }
    
    if (itensFat.length > 0) vinculacoesAplicadas++;
  }
  
  return { vinculacoesAplicadas, itensAtualizados };
}
