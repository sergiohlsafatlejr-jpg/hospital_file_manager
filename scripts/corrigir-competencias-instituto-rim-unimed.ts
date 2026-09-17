import { getRawPool } from "../server/db";

const APPLY = process.argv.includes("--apply");
const ESTABELECIMENTO_ID = 4;
const CONVENIO_ID = 1;
const ORIGEM = "2026-09";
const DESTINO_DATA = "2026-07-01";
const DESTINO_BARRA = "2026/07";
const DESTINO_HIFEN = "2026-07";
const GUIA_VALIDACAO = "73273636";

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const conn = await pool.getConnection();

  try {
    await conn.query("DROP TEMPORARY TABLE IF EXISTS tmp_rim_competencia_julho");
    await conn.query(`
      CREATE TEMPORARY TABLE tmp_rim_competencia_julho (
        arquivoId INT PRIMARY KEY
      )
    `);
    await conn.query(`
      INSERT INTO tmp_rim_competencia_julho (arquivoId)
      SELECT ft.arquivo_id
      FROM faturamento_tiss ft
      LEFT JOIN (
        SELECT DISTINCT estabelecimentoId, numero_guia
        FROM demonstrativo
        WHERE estabelecimentoId=?
          AND convenio_id=?
          AND DATE_FORMAT(data_referencia,'%Y-%m')=?
      ) d
        ON d.estabelecimentoId=ft.estabelecimentoId
       AND d.numero_guia=COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)
      WHERE ft.estabelecimentoId=?
        AND ft.convenioId=?
        AND DATE_FORMAT(ft.data_referencia,'%Y-%m')=?
      GROUP BY ft.arquivo_id
      HAVING COUNT(DISTINCT COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)) > 0
         AND COUNT(DISTINCT COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador))
           = COUNT(DISTINCT CASE WHEN d.numero_guia IS NOT NULL THEN COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador) END)
    `, [ESTABELECIMENTO_ID, CONVENIO_ID, DESTINO_HIFEN, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);

    const [escopoRows] = await conn.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM tmp_rim_competencia_julho) AS arquivos,
        (SELECT COUNT(*) FROM faturamento_tiss ft JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id) AS itensFaturamentoTiss,
        (SELECT COUNT(*) FROM contas_convenio_itens ci JOIN tmp_rim_competencia_julho t ON t.arquivoId=ci.arquivoId) AS itensContaConvenio,
        (SELECT COUNT(*) FROM faturamento_unificado fu JOIN faturamento_tiss ft ON fu.origemSistema='XML_TISS' AND fu.origemId=CAST(ft.id AS CHAR) JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id) AS itensUnificados,
        (SELECT COUNT(DISTINCT COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)) FROM faturamento_tiss ft JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id) AS guias,
        (SELECT ROUND(SUM(COALESCE(ft.valor_faturado,0)),2) FROM faturamento_tiss ft JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id) AS valorFaturado
    `);
    const escopo = escopoRows[0];

    if (Number(escopo.arquivos) === 0) {
      const [guiaAtual] = await conn.query<any[]>(`
        SELECT a.id AS arquivoId, DATE_FORMAT(a.dataReferencia,'%Y-%m-%d') AS arquivoReferencia,
          MIN(DATE_FORMAT(ft.data_referencia,'%Y-%m-%d')) AS itemReferencia,
          GROUP_CONCAT(DISTINCT ft.competencia ORDER BY ft.competencia) AS competencias,
          COUNT(*) AS itens, ROUND(SUM(COALESCE(ft.valor_faturado,0)),2) AS valor
        FROM faturamento_tiss ft
        JOIN arquivos a ON a.id=ft.arquivo_id
        WHERE ft.estabelecimentoId=?
          AND (ft.numero_guia_prestador=? OR ft.numero_guia_operadora=?)
        GROUP BY a.id,a.dataReferencia
      `, [ESTABELECIMENTO_ID, GUIA_VALIDACAO, GUIA_VALIDACAO]);
      if (guiaAtual.length > 0 && guiaAtual.every((row) => row.arquivoReferencia === DESTINO_DATA && row.itemReferencia === DESTINO_DATA && row.competencias === DESTINO_BARRA)) {
        console.log(JSON.stringify({ modo: "ja_aplicado", escopo, guiaAtual }, null, 2));
        return;
      }
      throw new Error("Nenhum arquivo pendente, mas a guia de validação não está na competência esperada");
    }

    if (Number(escopo.arquivos) !== 114) {
      throw new Error(`Escopo inesperado: ${escopo.arquivos} arquivos; esperado 114`);
    }

    const [guiaAntes] = await conn.query<any[]>(`
      SELECT a.id AS arquivoId, DATE_FORMAT(a.dataReferencia,'%Y-%m-%d') AS arquivoReferencia,
        MIN(DATE_FORMAT(ft.data_referencia,'%Y-%m-%d')) AS itemReferencia,
        GROUP_CONCAT(DISTINCT ft.competencia ORDER BY ft.competencia) AS competencias,
        COUNT(*) AS itens, ROUND(SUM(COALESCE(ft.valor_faturado,0)),2) AS valor
      FROM faturamento_tiss ft
      JOIN arquivos a ON a.id=ft.arquivo_id
      WHERE ft.estabelecimentoId=?
        AND (ft.numero_guia_prestador=? OR ft.numero_guia_operadora=?)
      GROUP BY a.id,a.dataReferencia
    `, [ESTABELECIMENTO_ID, GUIA_VALIDACAO, GUIA_VALIDACAO]);

    if (!APPLY) {
      console.log(JSON.stringify({ modo: "simulacao", escopo, guiaAntes }, null, 2));
      return;
    }

    await conn.beginTransaction();
    try {
      const resultados: Record<string, number> = {};

      const [arquivosResult] = await conn.query<any>(`
        UPDATE arquivos a
        JOIN tmp_rim_competencia_julho t ON t.arquivoId=a.id
        SET a.dataReferencia=?
        WHERE a.estabelecimentoId=? AND a.convenioId=?
          AND DATE_FORMAT(a.dataReferencia,'%Y-%m')=?
      `, [DESTINO_DATA, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.arquivos = Number(arquivosResult.affectedRows || 0);

      const [resumoResult] = await conn.query<any>(`
        UPDATE contas_convenio_resumo cr
        SET cr.competencia=?
        WHERE cr.estabelecimentoId=? AND cr.convenioId=? AND cr.origem='XML'
          AND REPLACE(cr.competencia,'/','-')=?
          AND EXISTS (
            SELECT 1
            FROM faturamento_tiss ft
            JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id
            WHERE COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)=cr.numeroConta
              AND COALESCE(ft.numero_lote,'')=COALESCE(cr.numeroLote,'')
          )
      `, [DESTINO_BARRA, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.resumosContaConvenio = Number(resumoResult.affectedRows || 0);

      const [contasResult] = await conn.query<any>(`
        UPDATE contas_convenio_itens ci
        JOIN tmp_rim_competencia_julho t ON t.arquivoId=ci.arquivoId
        SET ci.dataReferencia=?, ci.competencia=?
        WHERE ci.estabelecimentoId=? AND ci.convenioId=?
          AND REPLACE(ci.competencia,'/','-')=?
      `, [DESTINO_DATA, DESTINO_BARRA, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.itensContaConvenio = Number(contasResult.affectedRows || 0);

      const [unificadoResult] = await conn.query<any>(`
        UPDATE faturamento_unificado fu
        JOIN faturamento_tiss ft ON fu.origemSistema='XML_TISS' AND fu.origemId=CAST(ft.id AS CHAR)
        JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id
        SET fu.competencia=?
        WHERE fu.estabelecimentoId=? AND fu.convenioId=? AND fu.competencia=?
      `, [DESTINO_HIFEN, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.itensUnificados = Number(unificadoResult.affectedRows || 0);

      const [conciliadosResult] = await conn.query<any>(`
        UPDATE conciliados_automatico ca
        JOIN faturamento_unificado fu ON fu.id=ca.faturamentoUnificadoId
        JOIN faturamento_tiss ft ON fu.origemSistema='XML_TISS' AND fu.origemId=CAST(ft.id AS CHAR)
        JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id
        SET ca.competencia=?
        WHERE ca.estabelecimentoId=? AND ca.convenioId=? AND ca.competencia=?
      `, [DESTINO_HIFEN, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.itensConciliados = Number(conciliadosResult.affectedRows || 0);

      const [faturamentoResult] = await conn.query<any>(`
        UPDATE faturamento_tiss ft
        JOIN tmp_rim_competencia_julho t ON t.arquivoId=ft.arquivo_id
        SET ft.data_referencia=?, ft.competencia=?
        WHERE ft.estabelecimentoId=? AND ft.convenioId=?
          AND DATE_FORMAT(ft.data_referencia,'%Y-%m')=?
      `, [DESTINO_DATA, DESTINO_BARRA, ESTABELECIMENTO_ID, CONVENIO_ID, ORIGEM]);
      resultados.itensFaturamentoTiss = Number(faturamentoResult.affectedRows || 0);

      await conn.commit();

      const [guiaDepois] = await conn.query<any[]>(`
        SELECT a.id AS arquivoId, DATE_FORMAT(a.dataReferencia,'%Y-%m-%d') AS arquivoReferencia,
          MIN(DATE_FORMAT(ft.data_referencia,'%Y-%m-%d')) AS itemReferencia,
          GROUP_CONCAT(DISTINCT ft.competencia ORDER BY ft.competencia) AS competencias,
          COUNT(*) AS itens, ROUND(SUM(COALESCE(ft.valor_faturado,0)),2) AS valor
        FROM faturamento_tiss ft
        JOIN arquivos a ON a.id=ft.arquivo_id
        WHERE ft.estabelecimentoId=?
          AND (ft.numero_guia_prestador=? OR ft.numero_guia_operadora=?)
        GROUP BY a.id,a.dataReferencia
      `, [ESTABELECIMENTO_ID, GUIA_VALIDACAO, GUIA_VALIDACAO]);

      console.log(JSON.stringify({ modo: "aplicado", escopo, resultados, guiaAntes, guiaDepois }, null, 2));
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
