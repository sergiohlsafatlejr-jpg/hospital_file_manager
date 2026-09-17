import { getRawPool } from "../server/db";

const ESTABELECIMENTO_ID = 2550001;
const CONVENIO_ID = 120006;

const CORRECOES = [
  { arquivoId: 5280001, arquivo: "Demonstrativo 01-2025.xls", referenciaCorreta: "2024-12-01" },
  { arquivoId: 5280002, arquivo: "Demonstrativo 04-2025.xls", referenciaCorreta: "2025-03-01" },
  { arquivoId: 5280003, arquivo: "Demonstrativo 05-2025.xls", referenciaCorreta: "2025-04-01" },
  { arquivoId: 5280004, arquivo: "Demonstrativo 06-2025.xls", referenciaCorreta: "2025-05-01" },
  { arquivoId: 5280005, arquivo: "Demonstrativo 07-2025.xls", referenciaCorreta: "2025-06-01" },
  { arquivoId: 5280006, arquivo: "Demonstrativo 08-2025.xls", referenciaCorreta: "2025-07-01" },
  { arquivoId: 5280007, arquivo: "Demonstrativo 09-2025.xls", referenciaCorreta: "2025-08-01" },
  { arquivoId: 5280008, arquivo: "Demonstrativo 10-2025.xls", referenciaCorreta: "2025-09-01" },
  { arquivoId: 5280009, arquivo: "Demonstrativo 11-2025.xls", referenciaCorreta: "2025-10-01" },
  { arquivoId: 5280010, arquivo: "Demonstrativo 12-2025.xls", referenciaCorreta: "2025-11-01" },
  { arquivoId: 5280011, arquivo: "Demonstrativo 01-2026.xls", referenciaCorreta: "2025-12-01" },
  { arquivoId: 5280012, arquivo: "Demonstrativo 02-2026.xls", referenciaCorreta: "2026-01-01" },
  { arquivoId: 5280013, arquivo: "Demonstrativo 03-2026.xls", referenciaCorreta: "2026-02-01" },
  { arquivoId: 5280014, arquivo: "Demonstrativo 04-2026.xls", referenciaCorreta: "2026-03-01" },
  { arquivoId: 5280015, arquivo: "Demonstrativo 05-2026.xls", referenciaCorreta: "2026-04-01" },
  { arquivoId: 5280016, arquivo: "Demonstrativo 06-2026.xls", referenciaCorreta: "2026-05-01" },
  { arquivoId: 5160001, arquivo: "dEMOSTRATIVO 07-2026.xls", referenciaCorreta: "2026-06-01" },
  { arquivoId: 5160002, arquivo: "DEMOSTRATIVO 08-2026.xls", referenciaCorreta: "2026-07-01" },
] as const;

const aplicar = process.argv.includes("--apply");
const arredondar = (valor: unknown) => Math.round(Number(valor ?? 0) * 100) / 100;

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");

  const conn = await pool.getConnection();
  try {
    const ids = CORRECOES.map((item) => item.arquivoId);
    const placeholders = ids.map(() => "?").join(",");
    const [arquivosRows] = await conn.execute<any[]>(`
      SELECT
        a.id,
        a.nome,
        a.estabelecimentoId,
        a.convenioId,
        a.direcao,
        DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d') AS referenciaArquivo,
        (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS itensFonte,
        (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS itensDemonstrativo,
        (SELECT COUNT(DISTINCT DATE_FORMAT(r.data_referencia, '%Y-%m-%d')) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS referenciasFonte,
        (SELECT COUNT(DISTINCT DATE_FORMAT(d.data_referencia, '%Y-%m-%d')) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS referenciasDemonstrativo,
        (SELECT ROUND(SUM(COALESCE(r.processado, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorProcessado,
        (SELECT ROUND(SUM(COALESCE(r.valor_pagamento, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorRecebido,
        (SELECT ROUND(SUM(COALESCE(r.valor_glosa, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorGlosado
      FROM arquivos a
      WHERE a.id IN (${placeholders})
      ORDER BY a.id
    `, ids);

    if (arquivosRows.length !== CORRECOES.length) {
      throw new Error(`Esperados ${CORRECOES.length} arquivos, encontrados ${arquivosRows.length}`);
    }

    const porId = new Map(arquivosRows.map((row) => [Number(row.id), row]));
    for (const correcao of CORRECOES) {
      const atual = porId.get(correcao.arquivoId);
      if (!atual) throw new Error(`Arquivo ${correcao.arquivoId} não encontrado`);
      if (Number(atual.estabelecimentoId) !== ESTABELECIMENTO_ID) {
        throw new Error(`Arquivo ${correcao.arquivoId} pertence ao estabelecimento ${atual.estabelecimentoId}`);
      }
      if (Number(atual.convenioId) !== CONVENIO_ID) {
        throw new Error(`Arquivo ${correcao.arquivoId} pertence ao convênio ${atual.convenioId}`);
      }
      if (atual.direcao !== "retornado") {
        throw new Error(`Arquivo ${correcao.arquivoId} não é um demonstrativo retornado`);
      }
      if (String(atual.nome).trim().toLowerCase() !== correcao.arquivo.trim().toLowerCase()) {
        throw new Error(`Nome divergente no arquivo ${correcao.arquivoId}: ${atual.nome}`);
      }
      if (Number(atual.itensFonte) <= 0 || Number(atual.itensFonte) !== Number(atual.itensDemonstrativo)) {
        throw new Error(`Arquivo ${correcao.arquivoId} sem paridade entre fonte e demonstrativo`);
      }
      if (Number(atual.referenciasFonte) > 1 || Number(atual.referenciasDemonstrativo) > 1) {
        throw new Error(`Arquivo ${correcao.arquivoId} contém mais de uma competência na mesma importação`);
      }
    }

    const totaisAntes = arquivosRows.reduce((total, row) => ({
      itens: total.itens + Number(row.itensFonte ?? 0),
      processado: total.processado + Number(row.valorProcessado ?? 0),
      recebido: total.recebido + Number(row.valorRecebido ?? 0),
      glosado: total.glosado + Number(row.valorGlosado ?? 0),
    }), { itens: 0, processado: 0, recebido: 0, glosado: 0 });

    await conn.beginTransaction();
    for (const correcao of CORRECOES) {
      await conn.execute(`
        UPDATE arquivos
        SET dataReferencia = ?
        WHERE id = ? AND estabelecimentoId = ? AND convenioId = ? AND direcao = 'retornado'
          AND (dataReferencia IS NULL OR DATE(dataReferencia) <> ?)
      `, [`${correcao.referenciaCorreta} 12:00:00`, correcao.arquivoId, ESTABELECIMENTO_ID, CONVENIO_ID, correcao.referenciaCorreta]);

      await conn.execute(`
        UPDATE recebimentos_excel
        SET data_referencia = ?
        WHERE arquivo_id = ? AND estabelecimentoId = ? AND convenioId = ?
          AND (data_referencia IS NULL OR data_referencia <> ?)
      `, [correcao.referenciaCorreta, correcao.arquivoId, ESTABELECIMENTO_ID, CONVENIO_ID, correcao.referenciaCorreta]);

      await conn.execute(`
        UPDATE demonstrativo
        SET data_referencia = ?
        WHERE arquivo_id = ? AND estabelecimentoId = ? AND convenio_id = ?
          AND (data_referencia IS NULL OR data_referencia <> ?)
      `, [correcao.referenciaCorreta, correcao.arquivoId, ESTABELECIMENTO_ID, CONVENIO_ID, correcao.referenciaCorreta]);
    }

    const [validacaoRows] = await conn.execute<any[]>(`
      SELECT
        a.id,
        DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d') AS referenciaArquivo,
        (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS itensFonte,
        (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS itensDemonstrativo,
        (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id AND DATE_FORMAT(r.data_referencia, '%Y-%m-%d') = DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d')) AS fonteNaReferencia,
        (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id AND DATE_FORMAT(d.data_referencia, '%Y-%m-%d') = DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d')) AS demonstrativoNaReferencia,
        (SELECT ROUND(SUM(COALESCE(r.processado, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorProcessado,
        (SELECT ROUND(SUM(COALESCE(r.valor_pagamento, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorRecebido,
        (SELECT ROUND(SUM(COALESCE(r.valor_glosa, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS valorGlosado
      FROM arquivos a
      WHERE a.id IN (${placeholders})
      ORDER BY a.id
    `, ids);

    for (const correcao of CORRECOES) {
      const validacao = validacaoRows.find((row) => Number(row.id) === correcao.arquivoId);
      if (!validacao || validacao.referenciaArquivo !== correcao.referenciaCorreta) {
        throw new Error(`Referência do arquivo ${correcao.arquivoId} não foi corrigida`);
      }
      if (Number(validacao.fonteNaReferencia) !== Number(validacao.itensFonte)) {
        throw new Error(`Fonte recebimentos_excel divergente no arquivo ${correcao.arquivoId}`);
      }
      if (Number(validacao.demonstrativoNaReferencia) !== Number(validacao.itensDemonstrativo)) {
        throw new Error(`Demonstrativo divergente no arquivo ${correcao.arquivoId}`);
      }
    }

    const totaisDepois = validacaoRows.reduce((total, row) => ({
      itens: total.itens + Number(row.itensFonte ?? 0),
      processado: total.processado + Number(row.valorProcessado ?? 0),
      recebido: total.recebido + Number(row.valorRecebido ?? 0),
      glosado: total.glosado + Number(row.valorGlosado ?? 0),
    }), { itens: 0, processado: 0, recebido: 0, glosado: 0 });

    const totaisPreservados = totaisAntes.itens === totaisDepois.itens
      && arredondar(totaisAntes.processado) === arredondar(totaisDepois.processado)
      && arredondar(totaisAntes.recebido) === arredondar(totaisDepois.recebido)
      && arredondar(totaisAntes.glosado) === arredondar(totaisDepois.glosado);
    if (!totaisPreservados) throw new Error("A correção alteraria valores ou quantidade de itens");

    if (aplicar) await conn.commit();
    else await conn.rollback();

    console.log(`SENAPREV_IAMESC_COMPETENCIAS=${JSON.stringify({
      modo: aplicar ? "aplicado" : "simulacao",
      estabelecimentoId: ESTABELECIMENTO_ID,
      convenioId: CONVENIO_ID,
      arquivos: CORRECOES.length,
      itens: totaisDepois.itens,
      valorProcessado: arredondar(totaisDepois.processado),
      valorRecebido: arredondar(totaisDepois.recebido),
      valorGlosado: arredondar(totaisDepois.glosado),
      referencias: CORRECOES.map((item) => ({ arquivoId: item.arquivoId, referencia: item.referenciaCorreta })),
      totaisPreservados,
    })}`);
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
