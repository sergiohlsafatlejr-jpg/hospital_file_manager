import { getRawPool } from "../server/db";

type Candidato = {
  arquivoId: number;
  estabelecimentoId: number;
  estabelecimento: string;
  itens: number;
  glosaEsperada: number;
};

const CANDIDATOS_AUDITADOS: Candidato[] = [
  { arquivoId: 1530002, estabelecimentoId: 1260036, estabelecimento: "Hospital Urologico", itens: 2886, glosaEsperada: 4182.48 },
  { arquivoId: 2910012, estabelecimentoId: 1260036, estabelecimento: "Hospital Urologico", itens: 2861, glosaEsperada: 19069.03 },
  { arquivoId: 5160006, estabelecimentoId: 2550001, estabelecimento: "Imec Senador Canedo", itens: 675, glosaEsperada: 590.58 },
  { arquivoId: 5160007, estabelecimentoId: 2550001, estabelecimento: "Imec Senador Canedo", itens: 698, glosaEsperada: 1912.22 },
  { arquivoId: 2430004, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 1750, glosaEsperada: 3016.64 },
  { arquivoId: 2430005, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 2872, glosaEsperada: 12322.37 },
  { arquivoId: 2910011, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 3102, glosaEsperada: 2182.59 },
  { arquivoId: 3450001, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 2527, glosaEsperada: 362.11 },
  { arquivoId: 4320001, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 9474, glosaEsperada: 40776.34 },
  { arquivoId: 5400002, estabelecimentoId: 3, estabelecimento: "Ox Uti", itens: 4554, glosaEsperada: 3637.66 },
  { arquivoId: 1110263, estabelecimentoId: 1, estabelecimento: "Pronto Socorro Infantil", itens: 26614, glosaEsperada: 17665.94 },
  { arquivoId: 1770013, estabelecimentoId: 1, estabelecimento: "Pronto Socorro Infantil", itens: 21036, glosaEsperada: 6790.06 },
];

const aplicar = process.argv.includes("--apply");
const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

const arredondar = (valor: unknown) => Math.round(Number(valor ?? 0) * 100) / 100;

async function consultar(arquivoId: number) {
  const [rows] = await pool.execute(`
    SELECT
      a.id AS arquivoId,
      a.nome,
      a.status,
      a.estabelecimentoId,
      a.convenioId,
      c.nome AS convenio,
      (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS itensFonte,
      (SELECT ROUND(SUM(COALESCE(r.valor_glosa, 0)), 2) FROM recebimentos_excel r WHERE r.arquivo_id = a.id) AS glosaFonte,
      (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS itensDemo,
      (SELECT ROUND(SUM(COALESCE(d.valor_glosa, 0)), 2) FROM demonstrativo d WHERE d.arquivo_id = a.id) AS glosaDemo,
      (SELECT COUNT(*) FROM recebimentos_excel r WHERE r.arquivo_id = a.id AND (r.estabelecimentoId <> a.estabelecimentoId OR r.convenioId <> a.convenioId)) AS divergenciasFonte,
      (SELECT COUNT(*) FROM demonstrativo d WHERE d.arquivo_id = a.id AND (d.estabelecimentoId <> a.estabelecimentoId OR d.convenio_id <> a.convenioId)) AS divergenciasDemo
    FROM arquivos a
    JOIN convenios c ON c.id = a.convenioId
    WHERE a.id = ?
  `, [arquivoId]);
  const row = (rows as any[])[0];
  if (!row) throw new Error(`Arquivo ${arquivoId} não encontrado`);
  return {
    ...row,
    arquivoId: Number(row.arquivoId),
    estabelecimentoId: Number(row.estabelecimentoId),
    convenioId: Number(row.convenioId),
    itensFonte: Number(row.itensFonte ?? 0),
    glosaFonte: arredondar(row.glosaFonte),
    itensDemo: Number(row.itensDemo ?? 0),
    glosaDemo: arredondar(row.glosaDemo),
    divergenciasFonte: Number(row.divergenciasFonte ?? 0),
    divergenciasDemo: Number(row.divergenciasDemo ?? 0),
  };
}

async function reprocessar(arquivoId: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET indisponível para o processamento interno");
  const porta = process.env.PORT || "3000";
  const response = await fetch(`http://127.0.0.1:${porta}/api/internal/process-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arquivoId, secret }),
    signal: AbortSignal.timeout(360_000),
  });
  if (!response.ok) {
    throw new Error(`Processamento HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
}

const resultados: any[] = [];
try {
  for (const candidato of CANDIDATOS_AUDITADOS) {
    try {
      const antes = await consultar(candidato.arquivoId);
      if (antes.estabelecimentoId !== candidato.estabelecimentoId) {
        throw new Error(`Estabelecimento divergente: esperado ${candidato.estabelecimentoId}, encontrado ${antes.estabelecimentoId}`);
      }
      if (!String(antes.convenio).toUpperCase().includes("UNIMED")) {
        throw new Error(`Convênio divergente: ${antes.convenio}`);
      }
      if (antes.itensFonte !== candidato.itens || antes.itensDemo !== candidato.itens) {
        throw new Error(`Quantidade divergente antes do processamento: fonte ${antes.itensFonte}, demonstrativo ${antes.itensDemo}, esperado ${candidato.itens}`);
      }
      if (antes.divergenciasFonte !== 0 || antes.divergenciasDemo !== 0) {
        throw new Error(`Isolamento inválido antes do processamento: fonte ${antes.divergenciasFonte}, demonstrativo ${antes.divergenciasDemo}`);
      }

      if (antes.glosaFonte === candidato.glosaEsperada && antes.glosaDemo === candidato.glosaEsperada) {
        resultados.push({ ...candidato, status: "ja_corrigido", antes });
        continue;
      }

      if (!aplicar) {
        resultados.push({ ...candidato, status: "candidato", antes });
        continue;
      }

      await reprocessar(candidato.arquivoId);
      const depois = await consultar(candidato.arquivoId);
      if (depois.itensFonte !== candidato.itens || depois.itensDemo !== candidato.itens) {
        throw new Error(`Quantidade divergente após processamento: fonte ${depois.itensFonte}, demonstrativo ${depois.itensDemo}, esperado ${candidato.itens}`);
      }
      if (depois.glosaFonte !== candidato.glosaEsperada || depois.glosaDemo !== candidato.glosaEsperada) {
        throw new Error(`Glosa divergente após processamento: fonte ${depois.glosaFonte}, demonstrativo ${depois.glosaDemo}, esperado ${candidato.glosaEsperada}`);
      }
      if (depois.divergenciasFonte !== 0 || depois.divergenciasDemo !== 0) {
        throw new Error(`Isolamento inválido após processamento: fonte ${depois.divergenciasFonte}, demonstrativo ${depois.divergenciasDemo}`);
      }

      resultados.push({ ...candidato, status: "recuperado", antes, depois });
    } catch (error) {
      resultados.push({
        ...candidato,
        status: "falha",
        erro: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const resumo = {
    aplicar,
    candidatos: resultados.length,
    recuperados: resultados.filter((item) => item.status === "recuperado").length,
    jaCorrigidos: resultados.filter((item) => item.status === "ja_corrigido").length,
    pendentes: resultados.filter((item) => item.status === "candidato").length,
    falhas: resultados.filter((item) => item.status === "falha").length,
    glosaRecuperada: arredondar(resultados
      .filter((item) => item.status === "recuperado")
      .reduce((total, item) => total + item.glosaEsperada, 0)),
  };
  console.log(`UNIMED_RECOVERY_RESULT=${JSON.stringify({ resumo, resultados })}`);
  if (resumo.falhas > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
