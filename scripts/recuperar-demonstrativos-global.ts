import { getRawPool } from "../server/db";
import { syncDemonstrativoByArquivo } from "../server/syncDemonstrativo";

type Candidato = {
  id: number;
  nome: string;
  tipoArquivo: "xml" | "txt" | "excel" | "csv";
  estabelecimentoId: number;
  estabelecimento: string;
  convenioId: number;
  itensFonte: number;
  itensDemonstrativo: number;
  status: string;
};

const aplicar = process.argv.includes("--apply");
const idsArg = process.argv.find((arg) => arg.startsWith("--ids="));
const idsPermitidos = idsArg
  ? new Set(idsArg.slice("--ids=".length).split(",").map(Number).filter(Number.isInteger))
  : null;

const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

const [rows] = await pool.execute(`
  WITH ex AS (
    SELECT arquivo_id, COUNT(*) AS itens
    FROM recebimentos_excel
    WHERE arquivo_id IS NOT NULL
    GROUP BY arquivo_id
  ), rt AS (
    SELECT arquivo_id, COUNT(*) AS itens
    FROM recebimento_tiss
    WHERE arquivo_id IS NOT NULL
    GROUP BY arquivo_id
  ), dm AS (
    SELECT arquivo_id, COUNT(*) AS itens
    FROM demonstrativo
    WHERE arquivo_id IS NOT NULL
    GROUP BY arquivo_id
  )
  SELECT
    a.id,
    a.nome,
    a.tipoArquivo,
    a.estabelecimentoId,
    e.nome AS estabelecimento,
    a.convenioId,
    a.status,
    CASE
      WHEN a.tipoArquivo IN ('excel', 'csv') THEN COALESCE(ex.itens, 0)
      ELSE COALESCE(rt.itens, 0)
    END AS itensFonte,
    COALESCE(dm.itens, 0) AS itensDemonstrativo
  FROM arquivos a
  JOIN estabelecimentos e ON e.id = a.estabelecimentoId
  LEFT JOIN ex ON ex.arquivo_id = a.id
  LEFT JOIN rt ON rt.arquivo_id = a.id
  LEFT JOIN dm ON dm.arquivo_id = a.id
  WHERE a.direcao = 'retornado'
    AND a.tipoArquivo IN ('excel', 'csv', 'xml', 'txt')
    AND (
      (a.tipoArquivo IN ('excel', 'csv') AND COALESCE(ex.itens, 0) > 0)
      OR
      (a.tipoArquivo IN ('xml', 'txt') AND COALESCE(rt.itens, 0) > 0)
    )
    AND COALESCE(dm.itens, 0) = 0
  ORDER BY e.nome, a.id
`);

const candidatos = (rows as any[])
  .map((row) => ({
    ...row,
    id: Number(row.id),
    estabelecimentoId: Number(row.estabelecimentoId),
    convenioId: Number(row.convenioId),
    itensFonte: Number(row.itensFonte || 0),
    itensDemonstrativo: Number(row.itensDemonstrativo || 0),
  }))
  .filter((row) => !idsPermitidos || idsPermitidos.has(row.id)) as Candidato[];

const resumo = {
  modo: aplicar ? "apply" : "dry-run",
  candidatos: candidatos.length,
  itensPrevistos: candidatos.reduce((total, item) => total + item.itensFonte, 0),
  sucesso: 0,
  ignorados: 0,
  falhas: 0,
  itensInseridos: 0,
  resultados: [] as Array<Record<string, unknown>>,
};

for (const candidato of candidatos) {
  if (!aplicar) {
    resumo.resultados.push({
      arquivoId: candidato.id,
      estabelecimentoId: candidato.estabelecimentoId,
      estabelecimento: candidato.estabelecimento,
      nome: candidato.nome,
      itensFonte: candidato.itensFonte,
      acao: "reconstruir_da_fonte_normalizada",
    });
    continue;
  }

  const [estadoRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM demonstrativo WHERE arquivo_id = ?`,
    [candidato.id],
  );
  const totalAtual = Number((estadoRows as any[])[0]?.total || 0);
  if (totalAtual > 0) {
    resumo.ignorados++;
    resumo.resultados.push({ arquivoId: candidato.id, acao: "ignorado", motivo: "demonstrativo_ja_existente", totalAtual });
    continue;
  }

  const tabelaFonte = candidato.tipoArquivo === "excel" || candidato.tipoArquivo === "csv"
    ? "recebimentos_excel"
    : "recebimento_tiss";
  const [validacaoRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN estabelecimentoId <> ? OR convenioId <> ? THEN 1 ELSE 0 END) AS divergentes
     FROM ${tabelaFonte}
     WHERE arquivo_id = ?`,
    [candidato.estabelecimentoId, candidato.convenioId, candidato.id],
  );
  const validacao = (validacaoRows as any[])[0];
  const totalFonte = Number(validacao?.total || 0);
  const divergentes = Number(validacao?.divergentes || 0);
  if (totalFonte !== candidato.itensFonte || divergentes > 0) {
    resumo.falhas++;
    resumo.resultados.push({
      arquivoId: candidato.id,
      acao: "bloqueado",
      motivo: divergentes > 0 ? "fonte_mistura_estabelecimento_ou_convenio" : "quantidade_fonte_alterada",
      totalFonte,
      esperado: candidato.itensFonte,
      divergentes,
    });
    continue;
  }

  const origemTipo = candidato.tipoArquivo === "excel" || candidato.tipoArquivo === "csv" ? "excel" : "xml";
  const resultado = await syncDemonstrativoByArquivo(candidato.id, origemTipo);
  const [depoisRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM demonstrativo WHERE arquivo_id = ? AND estabelecimentoId = ? AND convenio_id = ?`,
    [candidato.id, candidato.estabelecimentoId, candidato.convenioId],
  );
  const totalDepois = Number((depoisRows as any[])[0]?.total || 0);

  if (!resultado.success || totalDepois !== candidato.itensFonte) {
    resumo.falhas++;
    resumo.resultados.push({
      arquivoId: candidato.id,
      acao: "falha",
      erro: resultado.error || "quantidade_inserida_divergente",
      esperado: candidato.itensFonte,
      inserido: totalDepois,
    });
    continue;
  }

  await pool.execute(
    `UPDATE arquivos
     SET status = 'processado', progresso = 100, totalItens = ?, itensProcessados = ?
     WHERE id = ?`,
    [totalDepois, totalDepois, candidato.id],
  );

  resumo.sucesso++;
  resumo.itensInseridos += totalDepois;
  resumo.resultados.push({
    arquivoId: candidato.id,
    estabelecimentoId: candidato.estabelecimentoId,
    estabelecimento: candidato.estabelecimento,
    nome: candidato.nome,
    acao: "recuperado",
    itensInseridos: totalDepois,
  });
}

console.log(`RECOVERY_RESULT=${JSON.stringify(resumo)}`);
await pool.end();
process.exit(0);
