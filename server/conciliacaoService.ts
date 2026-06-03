/**
 * Serviço de Conciliação - Cruzamento Faturado x Demonstrativo
 * 
 * Lógica universal para todos os estabelecimentos e convênios:
 * 1. Busca itens faturados na recebimento_geral (agrupados por código dentro da mesma guia)
 * 2. Busca itens do demonstrativo (recebimentos_excel)
 * 3. Cruza por código direto → se não bater, verifica tabela de-para (vinculacao_codigos)
 * 4. Itens que não batem → marca como "PENDENTE VINCULAÇÃO"
 * 5. Itens Receber = S → cruzamento com demonstrativo
 * 6. Itens Receber = N → registrados como honorários (sem cruzar com demo)
 * 7. Salva resultado na tabela conciliacao
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { registrarFeedback } from "./aprendizadoVinculacaoService";

interface ConciliacaoInput {
  estabelecimentoId: number;
  arquivoDemoId: number;
  mesProducao: string; // formato "2025/12"
  convenioId?: number;
  processadoPor?: number;
}

interface ItemFaturado {
  guia: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  valorFaturado: number;
  receberHospital: string;
  setor?: string;
  prestador?: string;
}

interface ItemDemo {
  guia: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  valorPago: number;
  valorGlosa: number;
  situacao: string;
  erroTiss?: string;
}

interface VinculacaoCodigo {
  id: number;
  codigoHospital: string;
  codigoConvenio: string;
  descricaoHospital?: string;
  descricaoConvenio?: string;
}

interface ResultadoCruzamento {
  totalItensFaturados: number;
  totalItensDemo: number;
  itensConciliados: number;
  itensDivergentes: number;
  itensNaoConstaDemo: number;
  itensExtrasDemo: number;
  itensGlosados: number;
  itensPendenteVinculacao: number;
  valorTotalFaturado: number;
  valorTotalFaturadoHospital: number;
  valorTotalFaturadoTerceiros: number;
  valorTotalPago: number;
  valorTotalGlosa: number;
  valorDiferenca: number;
}

export async function executarConciliacao(input: ConciliacaoInput): Promise<ResultadoCruzamento> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, arquivoDemoId, mesProducao, convenioId, processadoPor } = input;
  
  // Extrair mês e ano do mesProducao (formato "2025/12")
  const [anoStr, mesStr] = mesProducao.split("/");
  const anoReferencia = parseInt(anoStr);
  const mesReferencia = parseInt(mesStr);
  
  // 1. Limpar conciliação anterior para o mesmo período/arquivo
  await db.execute(
    sql.raw(`DELETE FROM conciliacao WHERE estabelecimentoId = ${estabelecimentoId} AND arquivoDemoId = ${arquivoDemoId}`)
  );
  
  // 2. Buscar itens faturados (recebimento_geral) agrupados por código dentro da mesma guia
  const faturados = await db.execute(
    sql.raw(`SELECT 
      guia_cobranca as guia,
      codigo_sistema as codigo,
      descricao_item as descricao,
      SUM(CAST(quantidade_item AS DECIMAL(10,4))) as quantidade,
      SUM(CAST(vl_faturado AS DECIMAL(12,4))) as valorFaturado,
      receber_hospital as receberHospital,
      nome_setor as setor,
      nome_prestador as prestador
    FROM recebimento_geral
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND mes_producao = '${mesProducao}'
    GROUP BY guia_cobranca, codigo_sistema, descricao_item, receber_hospital, nome_setor, nome_prestador
    ORDER BY guia_cobranca, codigo_sistema`)
  ) as unknown as ItemFaturado[];
  
  // 3. Buscar itens do demonstrativo (recebimentos_excel)
  const demoItens = await db.execute(
    sql.raw(`SELECT 
      numero_guia as guia,
      item as codigo,
      item_desc as descricao,
      SUM(CAST(quantidade AS DECIMAL(10,4))) as quantidade,
      SUM(CASE WHEN situacao_item = 'PAGO' THEN CAST(valor_pagamento AS DECIMAL(12,4)) ELSE 0 END) as valorPago,
      SUM(CASE WHEN situacao_item = 'GLOSADO' THEN CAST(valor_pagamento AS DECIMAL(12,4)) ELSE 0 END) as valorGlosa,
      MAX(situacao_item) as situacao,
      MAX(erro_tiss) as erroTiss
    FROM recebimentos_excel
    WHERE arquivo_id = ${arquivoDemoId}
    GROUP BY numero_guia, item, item_desc
    ORDER BY numero_guia, item`)
  ) as unknown as ItemDemo[];
  
  // 4. Buscar vinculações de códigos existentes
  const convFilter = convenioId ? `AND (convenioId = ${convenioId} OR convenioId IS NULL)` : '';
  const vinculacoes = await db.execute(
    sql.raw(`SELECT id, codigoHospital, codigoConvenio, descricaoHospital, descricaoConvenio
    FROM vinculacao_codigos
    WHERE estabelecimentoId = ${estabelecimentoId} AND ativo = 'sim' ${convFilter}`)
  ) as unknown as VinculacaoCodigo[];
  
  // Criar mapas de vinculação (hospital -> convênio e convênio -> hospital)
  const mapaHospitalParaConvenio = new Map<string, VinculacaoCodigo>();
  const mapaConvenioParaHospital = new Map<string, VinculacaoCodigo>();
  for (const v of vinculacoes) {
    mapaHospitalParaConvenio.set(v.codigoHospital, v);
    mapaConvenioParaHospital.set(v.codigoConvenio, v);
  }
  
  // 5. Criar mapa do demonstrativo por guia+código
  const mapaDemo = new Map<string, ItemDemo>();
  const demoPorGuia = new Map<string, ItemDemo[]>();
  for (const item of demoItens) {
    const key = `${item.guia}|${item.codigo}`;
    mapaDemo.set(key, item);
    
    if (!demoPorGuia.has(item.guia)) {
      demoPorGuia.set(item.guia, []);
    }
    demoPorGuia.get(item.guia)!.push(item);
  }
  
  // 6. Executar cruzamento
  const registros: any[] = [];
  const demoUsados = new Set<string>();
  
  let resultado: ResultadoCruzamento = {
    totalItensFaturados: faturados.length,
    totalItensDemo: demoItens.length,
    itensConciliados: 0,
    itensDivergentes: 0,
    itensNaoConstaDemo: 0,
    itensExtrasDemo: 0,
    itensGlosados: 0,
    itensPendenteVinculacao: 0,
    valorTotalFaturado: 0,
    valorTotalFaturadoHospital: 0,
    valorTotalFaturadoTerceiros: 0,
    valorTotalPago: 0,
    valorTotalGlosa: 0,
    valorDiferenca: 0,
  };
  
  for (const fat of faturados) {
    const vlFat = Number(fat.valorFaturado) || 0;
    resultado.valorTotalFaturado += vlFat;
    
    if (fat.receberHospital === "S") {
      resultado.valorTotalFaturadoHospital += vlFat;
    } else {
      resultado.valorTotalFaturadoTerceiros += vlFat;
    }
    
    // Itens N (terceiros/médicos) → registrar como honorário sem cruzar
    if (fat.receberHospital === "N") {
      registros.push({
        estabelecimentoId,
        mesReferencia,
        anoReferencia,
        convenioId: convenioId || null,
        guiaTasy: fat.guia,
        codigoTasy: fat.codigo,
        descricaoTasy: fat.descricao,
        quantidadeTasy: fat.quantidade,
        valorTasy: vlFat,
        statusConciliacao: "nao_encontrado_demo",
        receberHospital: "N",
        metodoMatch: "codigo_direto",
        arquivoDemoId,
        pendenteVinculacao: "nao",
        observacao: "Honorário médico/terceiro - não consta no demonstrativo do hospital",
        diferencaValor: vlFat,
        processadoPor: processadoPor || null,
        dataProcessamento: new Date(),
      });
      continue;
    }
    
    // Itens S (hospital) → cruzar com demonstrativo
    const keyDireto = `${fat.guia}|${fat.codigo}`;
    let matchDemo: ItemDemo | undefined = mapaDemo.get(keyDireto);
    let metodoMatch = "codigo_direto";
    let vinculacaoId: number | null = null;
    
    // Se não encontrou por código direto, tentar por vinculação (de-para)
    if (!matchDemo) {
      const vinc = mapaHospitalParaConvenio.get(fat.codigo);
      if (vinc) {
        const keyVinc = `${fat.guia}|${vinc.codigoConvenio}`;
        matchDemo = mapaDemo.get(keyVinc);
        if (matchDemo) {
          metodoMatch = "vinculacao";
          vinculacaoId = vinc.id;
        }
      }
    }
    
    if (matchDemo) {
      const keyUsado = `${matchDemo.guia}|${matchDemo.codigo}`;
      demoUsados.add(keyUsado);
      
      const vlPago = Number(matchDemo.valorPago) || 0;
      const vlGlosa = Number(matchDemo.valorGlosa) || 0;
      resultado.valorTotalPago += vlPago;
      resultado.valorTotalGlosa += vlGlosa;
      
      let status: string;
      if (matchDemo.situacao === "GLOSADO" || vlGlosa > 0) {
        if (vlPago === 0) {
          status = "glosado";
          resultado.itensGlosados++;
        } else {
          status = "pago_parcial";
          resultado.itensGlosados++;
        }
      } else if (Math.abs(vlFat - vlPago) < 0.02) {
        status = "conciliado";
        resultado.itensConciliados++;
      } else {
        status = "divergencia_valor";
        resultado.itensDivergentes++;
      }
      
      registros.push({
        estabelecimentoId,
        mesReferencia,
        anoReferencia,
        convenioId: convenioId || null,
        guiaTasy: fat.guia,
        codigoTasy: fat.codigo,
        descricaoTasy: fat.descricao,
        quantidadeTasy: fat.quantidade,
        valorTasy: vlFat,
        guiaDemo: matchDemo.guia,
        codigoDemo: matchDemo.codigo,
        descricaoDemo: matchDemo.descricao,
        quantidadeDemo: Number(matchDemo.quantidade) || 0,
        valorPagoDemo: vlPago,
        valorGlosadoDemo: vlGlosa,
        motivoGlosaDemo: matchDemo.erroTiss || null,
        statusConciliacao: status,
        diferencaValor: vlFat - vlPago,
        diferencaQuantidade: (Number(fat.quantidade) || 0) - (Number(matchDemo.quantidade) || 0),
        receberHospital: "S",
        vinculacaoId,
        metodoMatch,
        arquivoDemoId,
        pendenteVinculacao: "nao",
        processadoPor: processadoPor || null,
        dataProcessamento: new Date(),
      });
    } else {
      // Item faturado não encontrado no demonstrativo
      // Verificar se pode ser pendente de vinculação (existe item no demo da mesma guia sem match)
      const itensDaGuia = demoPorGuia.get(fat.guia) || [];
      const itensNaoUsados = itensDaGuia.filter(d => !demoUsados.has(`${d.guia}|${d.codigo}`));
      const pendente = itensNaoUsados.length > 0 ? "sim" : "nao";
      
      if (pendente === "sim") {
        resultado.itensPendenteVinculacao++;
      } else {
        resultado.itensNaoConstaDemo++;
      }
      
      // Calcular score de compatibilidade para sugestão de vinculação
      let melhorScore = 0;
      let melhorSugestao = "";
      if (pendente === "sim" && itensNaoUsados.length > 0) {
        for (const candidato of itensNaoUsados) {
          let score = 0;
          // Similaridade de valor (peso 40%)
          const vlCand = parseFloat(candidato.valor || "0");
          if (vlFat > 0 && vlCand > 0) {
            const ratio = Math.min(vlFat, vlCand) / Math.max(vlFat, vlCand);
            score += ratio * 40;
          }
          // Mesma guia (peso 30%)
          if (candidato.guia === fat.guia) score += 30;
          // Similaridade de descrição (peso 30%)
          const descFat = (fat.descricao || "").toLowerCase();
          const descCand = (candidato.descricao || "").toLowerCase();
          if (descFat && descCand) {
            const palavrasFat = descFat.split(/\s+/);
            const palavrasCand = descCand.split(/\s+/);
            const comuns = palavrasFat.filter(p => palavrasCand.includes(p)).length;
            const total = Math.max(palavrasFat.length, palavrasCand.length);
            if (total > 0) score += (comuns / total) * 30;
          }
          if (score > melhorScore) {
            melhorScore = score;
            melhorSugestao = candidato.codigo;
          }
        }
      }
      
      registros.push({
        estabelecimentoId,
        mesReferencia,
        anoReferencia,
        convenioId: convenioId || null,
        guiaTasy: fat.guia,
        codigoTasy: fat.codigo,
        descricaoTasy: fat.descricao,
        quantidadeTasy: fat.quantidade,
        valorTasy: vlFat,
        statusConciliacao: "nao_encontrado_demo",
        diferencaValor: vlFat,
        receberHospital: "S",
        metodoMatch: "codigo_direto",
        arquivoDemoId,
        pendenteVinculacao: pendente,
        scoreCompatibilidade: melhorScore > 0 ? Math.round(melhorScore) : null,
        sugestaoVinculacao: melhorSugestao || null,
        observacao: pendente === "sim" 
          ? `Item não encontrado por código - possível vinculação pendente${melhorScore >= 70 ? " (sugestão: " + melhorSugestao + " score:" + Math.round(melhorScore) + "%)" : ""}` 
          : "Item faturado não consta no demonstrativo",
        processadoPor: processadoPor || null,
        dataProcessamento: new Date(),
      });
    }
  }
  
  // 7. Itens extras no demonstrativo (não encontrados no faturado)
  for (const dItem of demoItens) {
    const key = `${dItem.guia}|${dItem.codigo}`;
    if (!demoUsados.has(key)) {
      // Verificar se foi vinculado por de-para
      const vinc = mapaConvenioParaHospital.get(dItem.codigo);
      if (vinc) {
        // Já foi processado via vinculação, pular
        continue;
      }
      
      const vlPago = Number(dItem.valorPago) || 0;
      const vlGlosa = Number(dItem.valorGlosa) || 0;
      resultado.itensExtrasDemo++;
      resultado.valorTotalPago += vlPago;
      resultado.valorTotalGlosa += vlGlosa;
      
      registros.push({
        estabelecimentoId,
        mesReferencia,
        anoReferencia,
        convenioId: convenioId || null,
        guiaDemo: dItem.guia,
        codigoDemo: dItem.codigo,
        descricaoDemo: dItem.descricao,
        quantidadeDemo: Number(dItem.quantidade) || 0,
        valorPagoDemo: vlPago,
        valorGlosadoDemo: vlGlosa,
        motivoGlosaDemo: dItem.erroTiss || null,
        statusConciliacao: "nao_encontrado_tasy",
        diferencaValor: -(vlPago + vlGlosa),
        receberHospital: null,
        metodoMatch: "codigo_direto",
        arquivoDemoId,
        pendenteVinculacao: "sim",
        observacao: "Item no demonstrativo sem correspondência no faturado - possível código diferente",
        processadoPor: processadoPor || null,
        dataProcessamento: new Date(),
      });
    }
  }
  
  resultado.valorDiferenca = resultado.valorTotalFaturadoHospital - resultado.valorTotalPago;
  
  // 8. Inserir registros em batch
  if (registros.length > 0) {
    const BATCH_SIZE = 200;
    const columns = [
      "estabelecimentoId", "mesReferencia", "anoReferencia", "convenioId",
      "guiaTasy", "codigoTasy", "descricaoTasy", "quantidadeTasy", "valorTasy",
      "guiaDemo", "codigoDemo", "descricaoDemo", "quantidadeDemo",
      "valorPagoDemo", "valorGlosadoDemo", "motivoGlosaDemo",
      "statusConciliacao", "diferencaValor", "diferencaQuantidade",
      "observacao", "receberHospital", "vinculacaoId", "metodoMatch",
      "arquivoDemoId", "pendenteVinculacao", "processadoPor", "dataProcessamento"
    ];
    
    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const batch = registros.slice(i, i + BATCH_SIZE);
      const valuesStr = batch.map(r => {
        const vals = columns.map(c => {
          const v = r[c];
          if (v === null || v === undefined) return 'NULL';
          if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
          if (typeof v === 'number') return String(v);
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        return `(${vals.join(',')})`;
      }).join(',');
      
      await db.execute(
        sql.raw(`INSERT INTO conciliacao (${columns.join(",")}) VALUES ${valuesStr}`)
      );
    }
  }
  
  // 9. Salvar resumo
  const convFilter2 = convenioId ? `AND convenioId = ${convenioId}` : 'AND convenioId IS NULL';
  await db.execute(
    sql.raw(`DELETE FROM resumoConciliacao WHERE estabelecimentoId = ${estabelecimentoId} AND mesReferencia = ${mesReferencia} AND anoReferencia = ${anoReferencia} ${convFilter2}`)
  );
  
  const percRecebido = resultado.valorTotalFaturadoHospital > 0 
    ? ((resultado.valorTotalPago / resultado.valorTotalFaturadoHospital) * 100).toFixed(2) 
    : '0';
  const percGlosado = (resultado.valorTotalPago + resultado.valorTotalGlosa) > 0
    ? ((resultado.valorTotalGlosa / (resultado.valorTotalPago + resultado.valorTotalGlosa)) * 100).toFixed(2)
    : '0';
  
  await db.execute(
    sql.raw(`INSERT INTO resumoConciliacao (
      estabelecimentoId, mesReferencia, anoReferencia, convenioId,
      totalItensTasy, valorTotalTasy, totalItensDemo, valorTotalPago, valorTotalGlosado,
      itensConciliados, itensDivergentes, itensNaoEncontradosDemo, itensNaoEncontradosTasy, itensGlosados,
      valorDiferenca, percentualRecebido, percentualGlosado,
      dataProcessamento, processadoPor
    ) VALUES (
      ${estabelecimentoId}, ${mesReferencia}, ${anoReferencia}, ${convenioId || 'NULL'},
      ${resultado.totalItensFaturados}, ${resultado.valorTotalFaturadoHospital},
      ${resultado.totalItensDemo}, ${resultado.valorTotalPago}, ${resultado.valorTotalGlosa},
      ${resultado.itensConciliados}, ${resultado.itensDivergentes},
      ${resultado.itensNaoConstaDemo + resultado.itensPendenteVinculacao},
      ${resultado.itensExtrasDemo}, ${resultado.itensGlosados},
      ${resultado.valorDiferenca}, ${percRecebido}, ${percGlosado},
      NOW(), ${processadoPor || 'NULL'}
    )`)
  );
  
  return resultado;
}

/**
 * Helper para escapar strings em SQL
 */
function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Listar resultados da conciliação com filtros e paginação
 */
export async function listarConciliacao(filtros: {
  estabelecimentoId: number;
  arquivoDemoId?: number;
  mesReferencia?: number;
  anoReferencia?: number;
  convenioId?: number;
  status?: string;
  receberHospital?: string;
  pendenteVinculacao?: string;
  guia?: string;
  pagina?: number;
  porPagina?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const {
    estabelecimentoId, arquivoDemoId, mesReferencia, anoReferencia,
    convenioId, status, receberHospital, pendenteVinculacao, guia,
    pagina = 1, porPagina = 50
  } = filtros;
  
  let where = `WHERE c.estabelecimentoId = ${estabelecimentoId}`;
  
  if (arquivoDemoId) { where += ` AND c.arquivoDemoId = ${arquivoDemoId}`; }
  if (mesReferencia) { where += ` AND c.mesReferencia = ${mesReferencia}`; }
  if (anoReferencia) { where += ` AND c.anoReferencia = ${anoReferencia}`; }
  if (convenioId) { where += ` AND c.convenioId = ${convenioId}`; }
  if (status) { where += ` AND c.statusConciliacao = ${esc(status)}`; }
  if (receberHospital) { where += ` AND c.receberHospital = ${esc(receberHospital)}`; }
  if (pendenteVinculacao) { where += ` AND c.pendenteVinculacao = ${esc(pendenteVinculacao)}`; }
  if (guia) { where += ` AND (c.guiaTasy = ${esc(guia)} OR c.guiaDemo = ${esc(guia)})`; }
  
  // Total
  const countResult = await db.execute(
    sql.raw(`SELECT COUNT(*) as total FROM conciliacao c ${where}`)
  ) as unknown as any[];
  const total = countResult[0]?.total || 0;
  
  // Dados paginados
  const offset = (pagina - 1) * porPagina;
  const rows = await db.execute(
    sql.raw(`SELECT c.* FROM conciliacao c ${where} 
     ORDER BY c.guiaTasy, c.codigoTasy
     LIMIT ${porPagina} OFFSET ${offset}`)
  ) as unknown as any[];
  
  return {
    itens: rows,
    total,
    pagina,
    porPagina,
    totalPaginas: Math.ceil(total / porPagina),
  };
}

/**
 * Resumo da conciliação por guia (agrupado)
 */
export async function resumoConciliacaoPorGuia(filtros: {
  estabelecimentoId: number;
  arquivoDemoId: number;
  receberHospital?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, arquivoDemoId, receberHospital } = filtros;
  
  let where = `WHERE estabelecimentoId = ${estabelecimentoId} AND arquivoDemoId = ${arquivoDemoId}`;
  
  if (receberHospital) { where += ` AND receberHospital = ${esc(receberHospital)}`; }
  
  const rows = await db.execute(
    sql.raw(`SELECT 
      COALESCE(guiaTasy, guiaDemo) as guia,
      COUNT(*) as totalItens,
      SUM(CASE WHEN statusConciliacao = 'conciliado' THEN 1 ELSE 0 END) as itensConciliados,
      SUM(CASE WHEN statusConciliacao = 'divergencia_valor' THEN 1 ELSE 0 END) as itensDivergentes,
      SUM(CASE WHEN statusConciliacao = 'glosado' OR statusConciliacao = 'pago_parcial' THEN 1 ELSE 0 END) as itensGlosados,
      SUM(CASE WHEN statusConciliacao = 'nao_encontrado_demo' AND receberHospital = 'S' THEN 1 ELSE 0 END) as itensNaoConsta,
      SUM(CASE WHEN statusConciliacao = 'nao_encontrado_tasy' THEN 1 ELSE 0 END) as itensExtras,
      SUM(CASE WHEN pendenteVinculacao = 'sim' THEN 1 ELSE 0 END) as itensPendentes,
      SUM(COALESCE(valorTasy, 0)) as totalFaturado,
      SUM(COALESCE(valorPagoDemo, 0)) as totalPago,
      SUM(COALESCE(valorGlosadoDemo, 0)) as totalGlosa,
      SUM(COALESCE(diferencaValor, 0)) as totalDiferenca
    FROM conciliacao
    ${where}
    GROUP BY COALESCE(guiaTasy, guiaDemo)
    ORDER BY COALESCE(guiaTasy, guiaDemo)`)
  ) as unknown as any[];
  
  return rows;
}

/**
 * Vincular código hospital x convênio (de-para)
 */
export async function vincularCodigo(input: {
  estabelecimentoId: number;
  convenioId?: number;
  codigoHospital: string;
  descricaoHospital?: string;
  codigoConvenio: string;
  descricaoConvenio?: string;
  tipoItem?: string;
  criadoPor?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  // Verificar se já existe
  const convCheck = input.convenioId ? `AND convenioId = ${input.convenioId}` : '';
  const existing = await db.execute(
    sql.raw(`SELECT id FROM vinculacao_codigos 
     WHERE estabelecimentoId = ${input.estabelecimentoId} AND codigoHospital = ${esc(input.codigoHospital)} AND codigoConvenio = ${esc(input.codigoConvenio)}
     ${convCheck}`)
  ) as unknown as any[];
  
  if (existing.length > 0) {
    return { id: existing[0].id, created: false };
  }
  
  await db.execute(
    sql.raw(`INSERT INTO vinculacao_codigos 
     (estabelecimentoId, convenioId, codigoHospital, descricaoHospital, codigoConvenio, descricaoConvenio, tipoItem, criadoPor, metodo_match)
     VALUES (${input.estabelecimentoId}, ${input.convenioId || 'NULL'}, ${esc(input.codigoHospital)}, ${esc(input.descricaoHospital || null)}, ${esc(input.codigoConvenio)}, ${esc(input.descricaoConvenio || null)}, ${esc(input.tipoItem || 'outros')}, ${input.criadoPor || 'NULL'}, 'manual')`)
  );
  
  // Buscar o ID inserido
  const inserted = await db.execute(
    sql.raw(`SELECT LAST_INSERT_ID() as insertId`)
  ) as unknown as any[];
  
  const vinculacaoId = inserted[0]?.insertId || 0;
  
  // Registrar feedback positivo no sistema de aprendizado
  try {
    await registrarFeedback({
      vinculacaoId,
      confirmado: true,
      origemFeedback: "vinculacao_manual",
    });
  } catch (e) {
    // Não bloquear a criação da vinculação se o feedback falhar
    console.error("[Aprendizado] Erro ao registrar feedback:", e);
  }
  
  return { id: vinculacaoId, created: true };
}

/**
 * Listar vinculações de códigos
 */
export async function listarVinculacoes(filtros: {
  estabelecimentoId: number;
  convenioId?: number;
  busca?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, convenioId, busca } = filtros;
  
  let where = `WHERE estabelecimentoId = ${estabelecimentoId} AND ativo = 'sim'`;
  
  if (convenioId) { where += ` AND (convenioId = ${convenioId} OR convenioId IS NULL)`; }
  if (busca) { 
    const buscaEsc = esc(`%${busca}%`);
    where += ` AND (codigoHospital LIKE ${buscaEsc} OR codigoConvenio LIKE ${buscaEsc} OR descricaoHospital LIKE ${buscaEsc} OR descricaoConvenio LIKE ${buscaEsc})`; 
  }
  
  const rows = await db.execute(
    sql.raw(`SELECT * FROM vinculacao_codigos ${where} ORDER BY createdAt DESC`)
  ) as unknown as any[];
  
  return rows;
}

/**
 * Deletar vinculação de código
 */
export async function deletarVinculacao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  await db.execute(
    sql.raw(`UPDATE vinculacao_codigos SET ativo = 'nao' WHERE id = ${id}`)
  );
  
  return { success: true };
}

/**
 * Atualizar status de um item da conciliação
 */
export async function atualizarStatusConciliacao(id: number, status: string, observacao?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  let setClause = `statusConciliacao = ${esc(status)}`;
  if (observacao) { setClause += `, observacao = ${esc(observacao)}`; }
  
  await db.execute(
    sql.raw(`UPDATE conciliacao SET ${setClause} WHERE id = ${id}`)
  );
  
  return { success: true };
}

/**
 * Buscar itens pendentes de vinculação para uma guia específica
 */
export async function itensPendentesVinculacao(filtros: {
  estabelecimentoId: number;
  arquivoDemoId: number;
  guia: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  const { estabelecimentoId, arquivoDemoId, guia } = filtros;
  
  // Itens faturados sem match
  const faturados = await db.execute(
    sql.raw(`SELECT id, codigoTasy as codigo, descricaoTasy as descricao, quantidadeTasy as quantidade, valorTasy as valor
     FROM conciliacao
     WHERE estabelecimentoId = ${estabelecimentoId} AND arquivoDemoId = ${arquivoDemoId} AND guiaTasy = ${esc(guia)}
       AND statusConciliacao = 'nao_encontrado_demo' AND receberHospital = 'S' AND pendenteVinculacao = 'sim'`)
  ) as unknown as any[];
  
  // Itens do demo sem match
  const demoExtras = await db.execute(
    sql.raw(`SELECT id, codigoDemo as codigo, descricaoDemo as descricao, quantidadeDemo as quantidade, valorPagoDemo as valorPago, valorGlosadoDemo as valorGlosa
     FROM conciliacao
     WHERE estabelecimentoId = ${estabelecimentoId} AND arquivoDemoId = ${arquivoDemoId} AND guiaDemo = ${esc(guia)}
       AND statusConciliacao = 'nao_encontrado_tasy' AND pendenteVinculacao = 'sim'`)
  ) as unknown as any[];
  
  return {
    faturadosSemMatch: faturados,
    demoSemMatch: demoExtras,
  };
}
