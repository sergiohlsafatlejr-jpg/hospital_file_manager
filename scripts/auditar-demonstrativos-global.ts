import { getRawPool } from "../server/db";
import { storageGet } from "../server/storage";

type ArquivoRetorno = {
  id: number;
  nome: string;
  tipoArquivo: "xml" | "excel" | "csv" | "txt";
  estabelecimentoId: number;
  estabelecimento: string;
  status: string;
  s3Key: string;
  s3Url: string;
  itensFonte: number;
  itensDemonstrativo: number;
};

async function verificarArquivo(arquivo: ArquivoRetorno) {
  if (arquivo.itensFonte > 0) {
    return { acessivel: null, motivo: "fonte_normalizada_disponivel" };
  }

  const urls: string[] = [];
  try {
    const atual = await storageGet(arquivo.s3Key, 600);
    if (atual?.url) urls.push(atual.url);
  } catch {
    // A chave pode pertencer ao armazenamento histórico.
  }
  if (arquivo.s3Url && !urls.includes(arquivo.s3Url)) urls.push(arquivo.s3Url);

  const erros: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
      if (response.ok || response.status === 206) {
        return { acessivel: true, motivo: `http_${response.status}` };
      }
      erros.push(`HTTP ${response.status}`);
    } catch (error) {
      erros.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    acessivel: false,
    motivo: erros.length > 0 ? [...new Set(erros)].join("; ") : "sem_url_utilizavel",
  };
}

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
    a.status,
    a.s3Key,
    a.s3Url,
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
  ORDER BY e.nome, a.id
`);

const arquivos = (rows as any[]).map((row) => ({
  ...row,
  id: Number(row.id),
  estabelecimentoId: Number(row.estabelecimentoId),
  itensFonte: Number(row.itensFonte || 0),
  itensDemonstrativo: Number(row.itensDemonstrativo || 0),
})) as ArquivoRetorno[];

const detalhes = [] as Array<ArquivoRetorno & { categoria: string; acessivel: boolean | null; motivo: string }>;
for (const arquivo of arquivos) {
  const verificacao = await verificarArquivo(arquivo);
  const categoria = arquivo.itensFonte > 0 && arquivo.itensDemonstrativo === 0
    ? "recuperavel_da_fonte"
    : arquivo.itensFonte === 0 && verificacao.acessivel
      ? "reprocessavel_do_arquivo"
      : arquivo.itensFonte === 0
        ? "arquivo_historico_indisponivel"
        : arquivo.itensFonte !== arquivo.itensDemonstrativo
          ? "divergencia_de_quantidade"
          : "completo";
  detalhes.push({ ...arquivo, categoria, ...verificacao });
}

const porEstabelecimento = Array.from(new Set(detalhes.map((item) => item.estabelecimentoId))).map((id) => {
  const grupo = detalhes.filter((item) => item.estabelecimentoId === id);
  return {
    estabelecimentoId: id,
    estabelecimento: grupo[0]?.estabelecimento,
    arquivos: grupo.length,
    completos: grupo.filter((item) => item.categoria === "completo").length,
    recuperaveisDaFonte: grupo.filter((item) => item.categoria === "recuperavel_da_fonte").length,
    reprocessaveisDoArquivo: grupo.filter((item) => item.categoria === "reprocessavel_do_arquivo").length,
    indisponiveis: grupo.filter((item) => item.categoria === "arquivo_historico_indisponivel").length,
    divergentes: grupo.filter((item) => item.categoria === "divergencia_de_quantidade").length,
    itensFonte: grupo.reduce((total, item) => total + item.itensFonte, 0),
    itensDemonstrativo: grupo.reduce((total, item) => total + item.itensDemonstrativo, 0),
  };
});

console.log(JSON.stringify({
  geradoEm: new Date().toISOString(),
  resumo: {
    arquivos: detalhes.length,
    completos: detalhes.filter((item) => item.categoria === "completo").length,
    recuperaveisDaFonte: detalhes.filter((item) => item.categoria === "recuperavel_da_fonte").length,
    reprocessaveisDoArquivo: detalhes.filter((item) => item.categoria === "reprocessavel_do_arquivo").length,
    indisponiveis: detalhes.filter((item) => item.categoria === "arquivo_historico_indisponivel").length,
    divergentes: detalhes.filter((item) => item.categoria === "divergencia_de_quantidade").length,
  },
  porEstabelecimento,
  pendencias: detalhes.filter((item) => item.categoria !== "completo"),
}, null, 2));

await pool.end();
