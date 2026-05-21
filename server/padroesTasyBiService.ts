import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Analisa padrões de cobrança a partir dos dados do Tasy (tasy_faturado_itens_bi)
 * Gera padrões por composição baseando-se nos códigos de procedimento
 * e salva/atualiza na tabela padroesCobranca
 */
export async function analisarPadroesTasyBi(params: {
  estabelecimentoId: number;
  competencia?: string;
  agrupamentoProfissional?: boolean;
}): Promise<{ padroesComposicao: any[]; atuais: number; ineditos: number }> {
  const db = await getDb();
  if (!db) return { padroesComposicao: [], atuais: 0, ineditos: 0 };

  // Filtros
  let whereClause = `WHERE t.estabelecimentoId = ${params.estabelecimentoId}`;
  if (params.competencia) {
    whereClause += ` AND t.COMPETENCIA LIKE '${params.competencia.replace(/'/g, "''")}%'`;
  }

  // 1. Buscar todos os itens das contas de tasy_faturado_itens_bi
  console.log(`[TasyBI] Buscando itens para estabelecimentoId=${params.estabelecimentoId}...`);
  const [itensRows] = await db.execute(sql.raw(`
    SELECT 
      t.CONTA as numeroConta, 
      t.CD_ITEM as codigoItem, 
      t.DESCRICAO as descricaoItem, 
      t.TIPO_ITEM as tipoItem,
      t.QTD as quantidadeStr, 
      t.VL_PRODUZIDO as valorTotalStr, 
      t.PROF_EXEC as profissionalExecutante,
      t.SETOR as setor
    FROM tasy_faturado_itens_bi t
    ${whereClause}
    ORDER BY t.CONTA, t.CD_ITEM
  `));
  const rawItens = itensRows as any[];
  console.log(`[TasyBI] Total de itens encontrados: ${rawItens.length}`);

  if (rawItens.length === 0) {
    return { padroesComposicao: [], atuais: 0, ineditos: 0 };
  }

  // Conversão de números
  const parseNum = (str: any) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    // Remove espaços e trata separador decimal brasileiro
    const s = String(str).trim();
    // Se tem vírgula, é formato BR (1.200,50)
    if (s.includes(',')) {
      const cleanStr = s.replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(cleanStr);
      return isNaN(parsed) ? 0 : parsed;
    }
    const parsed = parseFloat(s);
    return isNaN(parsed) ? 0 : parsed;
  };

  const itens = rawItens.map(i => {
    const qtd = parseNum(i.quantidadeStr);
    const vT = parseNum(i.valorTotalStr);
    return {
      numeroConta: i.numeroConta,
      codigoItem: i.codigoItem,
      descricaoItem: i.descricaoItem,
      tipoItem: i.tipoItem,
      quantidade: qtd,
      valorTotal: vT,
      valorUnitario: qtd > 0 ? vT / qtd : 0,
      profissionalExecutante: i.profissionalExecutante,
      setor: i.setor
    };
  });

  // -------------------------------------------------------
  // 2. Agrupar por conta
  // -------------------------------------------------------
  const contasMap = new Map<string, any[]>();
  for (const item of itens) {
    const conta = String(item.numeroConta || '');
    if (!conta) continue;
    if (!contasMap.has(conta)) contasMap.set(conta, []);
    contasMap.get(conta)!.push(item);
  }

  const totalContas = contasMap.size;
  console.log(`[TasyBI] Total de contas distintas: ${totalContas}`);

  // -------------------------------------------------------
  // 3. Padrões de Composição (quais itens aparecem juntos)
  // -------------------------------------------------------
  const padroesPorCodigo = new Map<string, any>();

  for (const [conta, itensConta] of contasMap) {
    const codigosNaConta = new Set(itensConta.map((i: any) => String(i.codigoItem || '')));

    for (const item of itensConta) {
      const codigoBase = String(item.codigoItem || '');
      if (!codigoBase) continue;
      
      const profExec = params.agrupamentoProfissional && item.profissionalExecutante ? String(item.profissionalExecutante) : null;
      const codigo = params.agrupamentoProfissional && profExec ? `${codigoBase}_${profExec}` : codigoBase;

      if (!padroesPorCodigo.has(codigo)) {
        padroesPorCodigo.set(codigo, {
          codigo: codigoBase, // Salvar o codigo verdadeiro no db
          chave: codigo, // chave de agrupamento
          descricao: String(item.descricaoItem || ''),
          tipo: String(item.tipoItem || ''),
          setor: String(item.setor || 'GERAL'),
          profissional: profExec,
          ocorrencias: 0,
          quantidades: [] as number[],
          valoresUnitarios: [] as number[],
          valorTotal: 0,
          contasComItem: new Set<string>(),
          itensAssociados: new Map<string, any>(),
        });
      }

      const padrao = padroesPorCodigo.get(codigo)!;
      padrao.ocorrencias++;
      padrao.quantidades.push(item.quantidade);
      padrao.valoresUnitarios.push(item.valorUnitario);
      padrao.valorTotal += item.valorTotal;
      padrao.contasComItem.add(conta);

      // Itens associados na mesma conta
      for (const outroCodigo of codigosNaConta) {
        if (outroCodigo === codigo) continue;
        const outroItem = itensConta.find((i: any) => String(i.codigoItem) === outroCodigo);
        if (!outroItem) continue;

        if (!padrao.itensAssociados.has(outroCodigo)) {
          padrao.itensAssociados.set(outroCodigo, {
            codigo: outroCodigo,
            descricao: String(outroItem.descricaoItem || ''),
            tipo: String(outroItem.tipoItem || ''),
            ocorrencias: 0,
            quantidades: [] as number[],
            valoresUnitarios: [] as number[],
          });
        }
        const assoc = padrao.itensAssociados.get(outroCodigo)!;
        assoc.ocorrencias++;
        assoc.quantidades.push(outroItem.quantidade);
        assoc.valoresUnitarios.push(outroItem.valorUnitario);
      }
    }
  }

  const padroesComposicao = Array.from(padroesPorCodigo.values())
    .filter(p => p.contasComItem.size >= 3)
    .map(p => {
      const qtds = p.quantidades as number[];
      const vals = p.valoresUnitarios as number[];
      return {
        key: p.chave,
        codigoProcedimento: p.codigo,
        descricao: p.descricao,
        tipo: p.tipo,
        setor: p.setor,
        profissionalExecutante: p.profissional,
        totalOcorrencias: p.ocorrencias,
        contasComItem: p.contasComItem.size,
        frequenciaPercentual: Math.round((p.contasComItem.size / totalContas) * 10000) / 100,
        quantidadeMedia: qtds.length > 0 ? Math.round((qtds.reduce((a, b) => a + b, 0) / qtds.length) * 100) / 100 : 0,
        quantidadeMin: qtds.length > 0 ? Math.min(...qtds) : 0,
        quantidadeMax: qtds.length > 0 ? Math.max(...qtds) : 0,
        valorUnitarioMedio: vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000 : 0,
        valorUnitarioMin: vals.length > 0 ? Math.min(...vals) : 0,
        valorUnitarioMax: vals.length > 0 ? Math.max(...vals) : 0,
        valorTotalMedio: p.ocorrencias > 0 ? Math.round((p.valorTotal / p.ocorrencias) * 100) / 100 : 0,
        itensAssociados: Array.from(p.itensAssociados.values())
          .filter((a: any) => a.ocorrencias >= 2)
          .map((a: any) => ({
            codigo: a.codigo,
            descricao: a.descricao,
            tipo: a.tipo,
            frequencia: p.contasComItem.size > 0 ? Math.round((a.ocorrencias / p.contasComItem.size) * 10000) / 100 : 0,
            quantidadeMedia: a.quantidades.length > 0 ? Math.round((a.quantidades.reduce((x: number, y: number) => x + y, 0) / a.quantidades.length) * 100) / 100 : 0,
            valorUnitarioMedio: a.valoresUnitarios.length > 0 ? Math.round((a.valoresUnitarios.reduce((x: number, y: number) => x + y, 0) / a.valoresUnitarios.length) * 10000) / 10000 : 0,
          }))
          .sort((a: any, b: any) => b.frequencia - a.frequencia)
          .slice(0, 15),
      };
    })
    .sort((a, b) => b.frequenciaPercentual - a.frequenciaPercentual);

  console.log(`[TasyBI] Padrões de composição gerados: ${padroesComposicao.length}`);

  // -------------------------------------------------------
  // 4. Salvar na Tabela padroesCobranca DB (UPSERT)
  // -------------------------------------------------------
  let atualizados = 0;
  let novos = 0;

  for (const padrao of padroesComposicao) {
    const confianca = Math.min(99, Math.round((padrao.frequenciaPercentual * 0.5) + (Math.min(padrao.totalOcorrencias, 100) * 0.5)));
    const itensAssociadosJson = JSON.stringify(padrao.itensAssociados);
    const esc = (v: string) => v.replace(/'/g, "''");

    const profExecEscaped = padrao.profissionalExecutante ? `'${esc(padrao.profissionalExecutante)}'` : 'NULL';

    try {
      let queryExistente = `
        SELECT id, totalOcorrencias FROM padroesCobranca 
        WHERE estabelecimentoId = ${params.estabelecimentoId} 
          AND codigoProcedimentoPrincipal = '${esc(padrao.codigoProcedimento)}'
      `;
      if (params.agrupamentoProfissional && padrao.profissionalExecutante) {
        queryExistente += ` AND profissionalExecutante = '${esc(padrao.profissionalExecutante)}'`;
      } else {
        queryExistente += ` AND (profissionalExecutante IS NULL OR profissionalExecutante = '' OR profissionalExecutante = 'TODOS')`;
      }
      queryExistente += ` LIMIT 1`;

      const [existente] = await db.execute(sql.raw(queryExistente));
      const rows = existente as any[];

      if (rows.length > 0) {
        await db.execute(sql.raw(`
          UPDATE padroesCobranca SET
            descricaoProcedimentoPrincipal = '${esc(padrao.descricao)}',
            tipoProcedimentoPrincipal = '${esc(padrao.tipo)}',
            setor = '${esc(padrao.setor)}',
            profissionalExecutante = ${profExecEscaped},
            itensAssociados = '${esc(itensAssociadosJson)}',
            totalOcorrencias = ${padrao.totalOcorrencias},
            valorMedioConta = ${padrao.valorTotalMedio},
            valorMinConta = ${padrao.valorUnitarioMin},
            valorMaxConta = ${padrao.valorUnitarioMax},
            confianca = ${confianca}
          WHERE id = ${rows[0].id}
        `));
        atualizados++;
      } else {
        await db.execute(sql.raw(`
          INSERT INTO padroesCobranca (
            estabelecimentoId, codigoProcedimentoPrincipal, 
            descricaoProcedimentoPrincipal, tipoProcedimentoPrincipal,
            setor, profissionalExecutante,
            itensAssociados, totalOcorrencias, valorMedioConta, valorMinConta, valorMaxConta,
            confianca, status, createdAt
          ) VALUES (
            ${params.estabelecimentoId},
            '${esc(padrao.codigoProcedimento)}', '${esc(padrao.descricao)}',
            '${esc(padrao.tipo)}',
            '${esc(padrao.setor)}', ${profExecEscaped},
            '${esc(itensAssociadosJson)}', ${padrao.totalOcorrencias},
            ${padrao.valorTotalMedio}, ${padrao.valorUnitarioMin}, ${padrao.valorUnitarioMax},
            ${confianca}, 'aprendendo', NOW()
          )
        `));
        novos++;
      }
    } catch (err) {
      console.error(`[TasyBI] Erro ao salvar padrão ${padrao.codigoProcedimento}:`, err);
    }
  }

  console.log(`[TasyBI] Salvos: ${atualizados} atualizados, ${novos} novos`);
  return { padroesComposicao, atuais: atualizados, ineditos: novos };
}
