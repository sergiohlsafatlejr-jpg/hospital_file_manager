import { getRawPool } from "../server/db";
import { relatoriosGlosasBiRouter } from "../server/routers/relatoriosGlosasBiRouter";

const ESTABELECIMENTO_ID = 2550001;
const CONVENIO_ID = 120006;
const REFERENCIAS = new Map<number, string>([
  [5280001, "2024-12-01"],
  [5280002, "2025-03-01"],
  [5280003, "2025-04-01"],
  [5280004, "2025-05-01"],
  [5280005, "2025-06-01"],
  [5280006, "2025-07-01"],
  [5280007, "2025-08-01"],
  [5280008, "2025-09-01"],
  [5280009, "2025-10-01"],
  [5280010, "2025-11-01"],
  [5280011, "2025-12-01"],
  [5280012, "2026-01-01"],
  [5280013, "2026-02-01"],
  [5280014, "2026-03-01"],
  [5280015, "2026-04-01"],
  [5280016, "2026-05-01"],
  [5160001, "2026-06-01"],
  [5160002, "2026-07-01"],
]);

const EXPECTED = {
  arquivos: 18,
  itens: 17285,
  valorProcessado: 1700795.74,
  valorRecebido: 1669767.20,
  valorGlosado: 31028.54,
};
const arredondar = (valor: unknown) => Math.round(Number(valor ?? 0) * 100) / 100;

const caller = relatoriosGlosasBiRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  try {
    const ids = [...REFERENCIAS.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await pool.execute<any[]>(`
      SELECT
        a.id,
        a.estabelecimentoId,
        a.convenioId,
        DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d') AS referenciaArquivo,
        (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS itensFonte,
        (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS itensDemonstrativo,
        (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id AND DATE_FORMAT(r.data_referencia, '%Y-%m-%d') = DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d')) AS fonteNaReferencia,
        (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id AND DATE_FORMAT(d.data_referencia, '%Y-%m-%d') = DATE_FORMAT(DATE(a.dataReferencia), '%Y-%m-%d')) AS demonstrativoNaReferencia
      FROM arquivos a
      WHERE a.id IN (${placeholders})
      ORDER BY a.id
    `, ids);

    if (rows.length !== EXPECTED.arquivos) throw new Error(`Quantidade de arquivos divergente: ${rows.length}`);
    for (const row of rows) {
      const referenciaEsperada = REFERENCIAS.get(Number(row.id));
      if (Number(row.estabelecimentoId) !== ESTABELECIMENTO_ID || Number(row.convenioId) !== CONVENIO_ID) {
        throw new Error(`Escopo divergente no arquivo ${row.id}`);
      }
      if (row.referenciaArquivo !== referenciaEsperada) {
        throw new Error(`Referência divergente no arquivo ${row.id}: ${row.referenciaArquivo}`);
      }
      if (Number(row.itensFonte) !== Number(row.fonteNaReferencia)) {
        throw new Error(`Fonte recebimentos_excel fora da referência no arquivo ${row.id}`);
      }
      if (Number(row.itensDemonstrativo) !== Number(row.demonstrativoNaReferencia)) {
        throw new Error(`Demonstrativo fora da referência no arquivo ${row.id}`);
      }
    }

    const [totaisRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*) AS itens,
        ROUND(SUM(COALESCE(processado, 0)), 2) AS valorProcessado,
        ROUND(SUM(COALESCE(valor_pagamento, 0)), 2) AS valorRecebido,
        ROUND(SUM(COALESCE(valor_glosa, 0)), 2) AS valorGlosado
      FROM recebimentos_excel
      WHERE arquivo_id IN (${placeholders})
        AND estabelecimentoId = ?
        AND convenioId = ?
    `, [...ids, ESTABELECIMENTO_ID, CONVENIO_ID]);
    const totais = totaisRows[0];
    if (Number(totais.itens) !== EXPECTED.itens
      || arredondar(totais.valorProcessado) !== EXPECTED.valorProcessado
      || arredondar(totais.valorRecebido) !== EXPECTED.valorRecebido
      || arredondar(totais.valorGlosado) !== EXPECTED.valorGlosado) {
      throw new Error(`Totais financeiros divergentes: ${JSON.stringify(totais)}`);
    }

    const [competenciasTela] = await pool.execute<any[]>(`
      SELECT
        MONTH(data_referencia) AS mes,
        YEAR(data_referencia) AS ano,
        COUNT(*) AS total
      FROM demonstrativo
      WHERE data_referencia IS NOT NULL
        AND estabelecimentoId = ?
        AND convenio_id = ?
      GROUP BY MONTH(data_referencia), YEAR(data_referencia)
      ORDER BY ano DESC, mes DESC
    `, [ESTABELECIMENTO_ID, CONVENIO_ID]);
    const referenciasEsperadas = new Set([...REFERENCIAS.values()].map((item) => `${item.slice(5, 7)}/${item.slice(0, 4)}`));
    for (const referencia of referenciasEsperadas) {
      if (!competenciasTela.some((item) => `${String(item.mes).padStart(2, "0")}/${item.ano}` === referencia)) {
        throw new Error(`A competência ${referencia} não aparece na tela Demonstrativo`);
      }
    }

    const [marco2025, julho2026, agosto2026] = await Promise.all([
      caller.painelExecutivo({ estabelecimentoId: ESTABELECIMENTO_ID, convenioId: CONVENIO_ID, mesPagamento: "2025/03", limite: 15 }),
      caller.painelExecutivo({ estabelecimentoId: ESTABELECIMENTO_ID, convenioId: CONVENIO_ID, mesPagamento: "2026/07", limite: 15 }),
      caller.painelExecutivo({ estabelecimentoId: ESTABELECIMENTO_ID, convenioId: CONVENIO_ID, mesPagamento: "2026/08", limite: 15 }),
    ]);
    if (arredondar(marco2025.resumo.valorProcessado) !== 239157.16
      || arredondar(marco2025.resumo.valorPago) !== 238818.30
      || arredondar(marco2025.resumo.valorGlosado) !== 338.86) {
      throw new Error(`Painel divergente em 03/2025: ${JSON.stringify(marco2025.resumo)}`);
    }
    if (arredondar(julho2026.resumo.valorProcessado) !== 87571.63
      || arredondar(julho2026.resumo.valorPago) !== 75350.63
      || arredondar(julho2026.resumo.valorGlosado) !== 12221.00) {
      throw new Error(`Painel divergente em 07/2026: ${JSON.stringify(julho2026.resumo)}`);
    }
    if (arredondar(agosto2026.resumo.valorProcessado) !== 0
      || arredondar(agosto2026.resumo.valorPago) !== 0
      || arredondar(agosto2026.resumo.valorGlosado) !== 0) {
      throw new Error(`Senaprev-IAMESc ainda aparece indevidamente em 08/2026: ${JSON.stringify(agosto2026.resumo)}`);
    }

    console.log(`SENAPREV_IAMESC_VALIDATION=${JSON.stringify({
      estabelecimentoId: ESTABELECIMENTO_ID,
      convenioId: CONVENIO_ID,
      arquivos: rows.length,
      referencias: [...referenciasEsperadas].sort(),
      totais: {
        itens: Number(totais.itens),
        valorProcessado: arredondar(totais.valorProcessado),
        valorRecebido: arredondar(totais.valorRecebido),
        valorGlosado: arredondar(totais.valorGlosado),
      },
      painel: {
        marco2025: marco2025.resumo,
        julho2026: julho2026.resumo,
        agosto2026: agosto2026.resumo,
      },
      isolamento: true,
    })}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
