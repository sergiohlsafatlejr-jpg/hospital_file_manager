import { getDemonstrativoResumo, getRawPool } from "../server/db";

const arquivosEsperados = [
  { arquivoId: 1530002, estabelecimentoId: 1260036, itens: 2886, glosa: 4182.48 },
  { arquivoId: 2910012, estabelecimentoId: 1260036, itens: 2861, glosa: 19069.03 },
  { arquivoId: 5160006, estabelecimentoId: 2550001, itens: 675, glosa: 590.58 },
  { arquivoId: 5160007, estabelecimentoId: 2550001, itens: 698, glosa: 1912.22 },
  { arquivoId: 2430004, estabelecimentoId: 3, itens: 1750, glosa: 3016.64 },
  { arquivoId: 2430005, estabelecimentoId: 3, itens: 2872, glosa: 12322.37 },
  { arquivoId: 2910011, estabelecimentoId: 3, itens: 3102, glosa: 2182.59 },
  { arquivoId: 3450001, estabelecimentoId: 3, itens: 2527, glosa: 362.11 },
  { arquivoId: 4320001, estabelecimentoId: 3, itens: 9474, glosa: 40776.34 },
  { arquivoId: 5400002, estabelecimentoId: 3, itens: 4554, glosa: 3637.66 },
  { arquivoId: 1110263, estabelecimentoId: 1, itens: 26614, glosa: 17665.94 },
  { arquivoId: 1770013, estabelecimentoId: 1, itens: 21036, glosa: 6790.06 },
];

const arredondar = (valor: unknown) => Math.round(Number(valor ?? 0) * 100) / 100;
const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

try {
  const ids = arquivosEsperados.map((item) => item.arquivoId);
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await pool.execute(`
    SELECT
      a.id AS arquivoId,
      a.estabelecimentoId,
      a.convenioId,
      e.nome AS estabelecimento,
      c.nome AS convenio,
      (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS itensFonte,
      (SELECT ROUND(SUM(COALESCE(r.valor_glosa, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS glosaFonte,
      (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS itensDemo,
      (SELECT ROUND(SUM(COALESCE(d.valor_glosa, 0)), 2) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS glosaDemo,
      (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id AND (r.estabelecimentoId <> a.estabelecimentoId OR r.convenioId <> a.convenioId)) AS divergenciasFonte,
      (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id AND (d.estabelecimentoId <> a.estabelecimentoId OR d.convenio_id <> a.convenioId)) AS divergenciasDemo
    FROM arquivos a
    JOIN estabelecimentos e ON e.id = a.estabelecimentoId
    JOIN convenios c ON c.id = a.convenioId
    WHERE a.id IN (${placeholders})
    ORDER BY a.estabelecimentoId, a.id
  `, ids);

  const porArquivo = (rows as any[]).map((row) => {
    const esperado = arquivosEsperados.find((item) => item.arquivoId === Number(row.arquivoId));
    if (!esperado) throw new Error(`Arquivo inesperado ${row.arquivoId}`);
    const atual = {
      arquivoId: Number(row.arquivoId),
      estabelecimentoId: Number(row.estabelecimentoId),
      convenioId: Number(row.convenioId),
      estabelecimento: String(row.estabelecimento).trim(),
      convenio: String(row.convenio),
      itensFonte: Number(row.itensFonte ?? 0),
      glosaFonte: arredondar(row.glosaFonte),
      itensDemo: Number(row.itensDemo ?? 0),
      glosaDemo: arredondar(row.glosaDemo),
      divergenciasFonte: Number(row.divergenciasFonte ?? 0),
      divergenciasDemo: Number(row.divergenciasDemo ?? 0),
    };
    const valido = atual.estabelecimentoId === esperado.estabelecimentoId
      && atual.convenio.toUpperCase().includes("UNIMED")
      && atual.itensFonte === esperado.itens
      && atual.itensDemo === esperado.itens
      && atual.glosaFonte === esperado.glosa
      && atual.glosaDemo === esperado.glosa
      && atual.divergenciasFonte === 0
      && atual.divergenciasDemo === 0;
    return { ...atual, esperado, valido };
  });

  if (porArquivo.length !== arquivosEsperados.length || porArquivo.some((item) => !item.valido)) {
    throw new Error(`Falha na validação por arquivo: ${JSON.stringify(porArquivo.filter((item) => !item.valido))}`);
  }

  const grupos = Array.from(new Map(porArquivo.map((item) => [`${item.estabelecimentoId}:${item.convenioId}`, item])).values());
  const porTela = [];
  for (const grupo of grupos) {
    const resumoTela = await getDemonstrativoResumo({
      estabelecimentoId: grupo.estabelecimentoId,
      convenioId: grupo.convenioId,
    });
    const [totalRows] = await pool.execute(`
      SELECT
        COUNT(*) AS totalItens,
        ROUND(SUM(COALESCE(valor_glosa, 0)), 2) AS valorGlosado,
        ROUND(SUM(COALESCE(valor_pago, 0)), 2) AS valorPago,
        ROUND(SUM(COALESCE(valor_informado, 0)), 2) AS valorTotal
      FROM demonstrativo
      WHERE estabelecimentoId = ? AND convenio_id = ?
    `, [grupo.estabelecimentoId, grupo.convenioId]);
    const banco = (totalRows as any[])[0];
    const esperadoTela = {
      totalItens: Number(banco.totalItens ?? 0),
      valorGlosado: arredondar(banco.valorGlosado),
      valorPago: arredondar(banco.valorPago),
      valorTotal: arredondar(banco.valorTotal),
    };
    const valido = Number(resumoTela.totalItens) === esperadoTela.totalItens
      && arredondar(resumoTela.valorGlosado) === esperadoTela.valorGlosado
      && arredondar(resumoTela.valorPago) === esperadoTela.valorPago
      && arredondar(resumoTela.valorTotal) === esperadoTela.valorTotal;
    porTela.push({
      estabelecimentoId: grupo.estabelecimentoId,
      estabelecimento: grupo.estabelecimento,
      convenioId: grupo.convenioId,
      resumoTela,
      esperadoTela,
      valido,
    });
  }

  if (porTela.some((item) => !item.valido)) {
    throw new Error(`Falha na validação da tela: ${JSON.stringify(porTela.filter((item) => !item.valido))}`);
  }

  const glosaRecuperada = arredondar(arquivosEsperados.reduce((total, item) => total + item.glosa, 0));
  console.log(`UNIMED_VALIDATION_RESULT=${JSON.stringify({
    arquivosValidados: porArquivo.length,
    estabelecimentosValidados: porTela.length,
    glosaRecuperada,
    divergencias: 0,
    porTela,
  })}`);
} finally {
  await pool.end();
}
