import { getRawPool } from "../server/db";
import {
  executarConciliacaoAutomatica,
  popularDeXmlTiss,
} from "../server/faturamentoUnificadoService";

const ESTABELECIMENTO_ID = 4;
const CONVENIO_ID = 1;
const COMPETENCIA = "2026-08";
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!APPLY) {
    const pool = await getRawPool();
    if (!pool) throw new Error("Banco indisponível");
    try {
      const [rows] = await pool.execute<any[]>(`
        SELECT
          (SELECT COUNT(*) FROM faturamento_unificado WHERE estabelecimentoId=? AND convenioId=? AND competencia=?) AS itensFaturamento,
          (SELECT COUNT(DISTINCT COALESCE(numeroGuia,contaNumero)) FROM faturamento_unificado WHERE estabelecimentoId=? AND convenioId=? AND competencia=?) AS guiasFaturamento,
          (SELECT COUNT(*) FROM conciliados_automatico WHERE estabelecimentoId=? AND convenioId=? AND competencia=?) AS itensConciliacao,
          (SELECT COUNT(DISTINCT COALESCE(numeroGuia,contaNumero)) FROM conciliados_automatico WHERE estabelecimentoId=? AND convenioId=? AND competencia=?) AS guiasConciliacao
      `, [
        ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
        ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
        ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
        ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
      ]);
      console.log(JSON.stringify({ modo: "simulacao", competencia: COMPETENCIA, estadoAtual: rows[0] }, null, 2));
      return;
    } finally {
      await pool.end();
    }
  }

  const popular = await popularDeXmlTiss(ESTABELECIMENTO_ID, COMPETENCIA);
  const conciliacao = await executarConciliacaoAutomatica({
    estabelecimentoId: ESTABELECIMENTO_ID,
    convenioId: CONVENIO_ID,
    competencia: COMPETENCIA,
  });

  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [resumoRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*) AS itens,
        COUNT(DISTINCT COALESCE(numeroGuia,contaNumero)) AS guias,
        ROUND(SUM(COALESCE(valorFaturado,0)),2) AS faturado,
        ROUND(SUM(COALESCE(valorPago,0)),2) AS pago,
        ROUND(SUM(COALESCE(valorGlosa,0)),2) AS glosa,
        SUM(CASE WHEN recebimentoId IS NOT NULL THEN 1 ELSE 0 END) AS itensComRetorno,
        SUM(CASE WHEN statusConciliacao IN ('sem_pagamento','nao_recebido') THEN 1 ELSE 0 END) AS itensSemPagamento
      FROM conciliados_automatico
      WHERE estabelecimentoId=? AND convenioId=? AND competencia=?
    `, [ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA]);

    const [statusRows] = await pool.execute<any[]>(`
      SELECT statusConciliacao, COUNT(*) AS itens,
        COUNT(DISTINCT COALESCE(numeroGuia,contaNumero)) AS guias,
        ROUND(SUM(COALESCE(valorFaturado,0)),2) AS faturado,
        ROUND(SUM(COALESCE(valorPago,0)),2) AS pago,
        ROUND(SUM(COALESCE(valorGlosa,0)),2) AS glosa
      FROM conciliados_automatico
      WHERE estabelecimentoId=? AND convenioId=? AND competencia=?
      GROUP BY statusConciliacao
      ORDER BY statusConciliacao
    `, [ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA]);

    const conciliacaoResumo = {
      totalProcessados: conciliacao.totalProcessados,
      totalConciliados: conciliacao.totalConciliados,
      totalDivergentes: conciliacao.totalDivergentes,
      totalNaoRecebidos: conciliacao.totalNaoRecebidos,
      totalGlosados: conciliacao.totalGlosados,
      totalGlosaTotal: conciliacao.totalGlosaTotal,
      totalGlosaParcial: conciliacao.totalGlosaParcial,
      totalTerceiros: conciliacao.totalTerceiros,
      totalAcrescimos: conciliacao.totalAcrescimos,
      totalJaConciliados: conciliacao.totalJaConciliados,
      detalhes: conciliacao.detalhes,
    };
    console.log(JSON.stringify({ popular, conciliacao: conciliacaoResumo, resumo: resumoRows[0], status: statusRows }, null, 2));
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
