import type { InsertRecebimentoExcel } from "../drizzle/schema";
import { getRawPool } from "../server/db";
import {
  parseExcelRecebimentosExcel,
  parseExcelRecebimentosExcelChunked,
} from "../server/recebimentosExcelParser";
import { parseUnimedExcelChunked } from "../server/parsers/unimedExcelParser";
import { storageGet } from "../server/storage";

type ArquivoUnimed = {
  id: number;
  nome: string;
  tipoArquivo: "excel" | "csv";
  status: string;
  tamanho: number | null;
  s3Key: string;
  s3Url: string;
  convenioId: number;
  estabelecimentoId: number;
  estabelecimento: string;
  convenio: string;
  dataReferencia: Date | null;
  dataPagamento: Date | null;
  itensFonte: number;
  glosaFonte: number;
  itensDemo: number;
  glosaDemo: number;
};

type Estatisticas = {
  itens: number;
  itensComGlosa: number;
  itensMarcadosGlosa: number;
  itensMarcadosGlosaSemValor: number;
  valorPago: number;
  valorGlosa: number;
  valorInformado: number;
};

const numero = (valor: unknown) => {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

function acumular(estatisticas: Estatisticas, registros: InsertRecebimentoExcel[]) {
  for (const registro of registros) {
    const valorGlosa = numero(registro.valorGlosa);
    const situacao = String(registro.situacaoItem ?? "").toUpperCase();
    estatisticas.itens++;
    estatisticas.valorPago += numero(registro.valorPagamento);
    estatisticas.valorGlosa += valorGlosa;
    estatisticas.valorInformado += numero(registro.valorInformado);
    if (valorGlosa > 0) estatisticas.itensComGlosa++;
    if (situacao.includes("GLOS")) {
      estatisticas.itensMarcadosGlosa++;
      if (valorGlosa === 0) estatisticas.itensMarcadosGlosaSemValor++;
    }
  }
}

function novasEstatisticas(): Estatisticas {
  return {
    itens: 0,
    itensComGlosa: 0,
    itensMarcadosGlosa: 0,
    itensMarcadosGlosaSemValor: 0,
    valorPago: 0,
    valorGlosa: 0,
    valorInformado: 0,
  };
}

async function baixarArquivo(arquivo: ArquivoUnimed) {
  const urls: string[] = [];
  try {
    const atual = await storageGet(arquivo.s3Key, 600);
    if (atual?.url) urls.push(atual.url);
  } catch {
    // Alguns arquivos históricos pertencem a uma chave de armazenamento antiga.
  }
  if (arquivo.s3Url && !urls.includes(arquivo.s3Url)) urls.push(arquivo.s3Url);

  const erros: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      erros.push(`HTTP ${response.status}`);
    } catch (error) {
      erros.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(erros.length > 0 ? [...new Set(erros)].join("; ") : "sem_url_utilizavel");
}

async function analisarOriginal(arquivo: ArquivoUnimed, buffer: Buffer) {
  const estatisticas = novasEstatisticas();
  const isLargeFile = buffer.length > 2 * 1024 * 1024;
  const isLikelyUnimed = arquivo.nome.toLowerCase().includes("demonstrativo");

  if (isLargeFile && isLikelyUnimed) {
    await parseUnimedExcelChunked(
      buffer,
      arquivo.id,
      arquivo.convenioId,
      arquivo.dataReferencia ?? undefined,
      arquivo.dataPagamento ?? undefined,
      arquivo.estabelecimentoId,
      500,
      async (registros) => acumular(estatisticas, registros),
    );
  } else if (isLargeFile) {
    await parseExcelRecebimentosExcelChunked(
      buffer,
      arquivo.id,
      arquivo.convenioId,
      arquivo.dataReferencia ?? undefined,
      arquivo.dataPagamento ?? undefined,
      arquivo.estabelecimentoId,
      500,
      async (registros) => acumular(estatisticas, registros),
    );
  } else {
    acumular(
      estatisticas,
      parseExcelRecebimentosExcel(
        buffer,
        arquivo.id,
        arquivo.convenioId,
        arquivo.dataReferencia ?? undefined,
        arquivo.dataPagamento ?? undefined,
        arquivo.estabelecimentoId,
      ),
    );
  }

  return {
    ...estatisticas,
    valorPago: arredondar(estatisticas.valorPago),
    valorGlosa: arredondar(estatisticas.valorGlosa),
    valorInformado: arredondar(estatisticas.valorInformado),
  };
}

const pool = await getRawPool();
if (!pool) throw new Error("Banco de dados indisponível");

try {
  const [rows] = await pool.execute(`
    WITH fonte AS (
      SELECT
        arquivo_id,
        COUNT(*) AS itens_fonte,
        ROUND(SUM(COALESCE(valor_glosa, 0)), 2) AS glosa_fonte
      FROM recebimentos_excel
      GROUP BY arquivo_id
    ), demo AS (
      SELECT
        arquivo_id,
        COUNT(*) AS itens_demo,
        ROUND(SUM(COALESCE(valor_glosa, 0)), 2) AS glosa_demo
      FROM demonstrativo
      GROUP BY arquivo_id
    )
    SELECT
      a.id,
      a.nome,
      a.tipoArquivo,
      a.status,
      a.tamanho,
      a.s3Key,
      a.s3Url,
      a.convenioId,
      a.estabelecimentoId,
      a.dataReferencia,
      a.dataPagamento,
      e.nome AS estabelecimento,
      c.nome AS convenio,
      COALESCE(fonte.itens_fonte, 0) AS itensFonte,
      COALESCE(fonte.glosa_fonte, 0) AS glosaFonte,
      COALESCE(demo.itens_demo, 0) AS itensDemo,
      COALESCE(demo.glosa_demo, 0) AS glosaDemo
    FROM arquivos a
    JOIN estabelecimentos e ON e.id = a.estabelecimentoId
    JOIN convenios c ON c.id = a.convenioId
    LEFT JOIN fonte ON fonte.arquivo_id = a.id
    LEFT JOIN demo ON demo.arquivo_id = a.id
    WHERE a.direcao = 'retornado'
      AND a.tipoArquivo = 'excel'
      AND UPPER(c.nome) LIKE '%UNIMED%'
    ORDER BY e.nome, a.id
  `);

  const arquivos = (rows as any[]).map((row) => ({
    ...row,
    id: Number(row.id),
    tamanho: row.tamanho === null ? null : Number(row.tamanho),
    convenioId: Number(row.convenioId),
    estabelecimentoId: Number(row.estabelecimentoId),
    itensFonte: Number(row.itensFonte ?? 0),
    glosaFonte: numero(row.glosaFonte),
    itensDemo: Number(row.itensDemo ?? 0),
    glosaDemo: numero(row.glosaDemo),
  })) as ArquivoUnimed[];

  const detalhes: any[] = [];
  for (const arquivo of arquivos) {
    try {
      const buffer = await baixarArquivo(arquivo);
      const esperado = await analisarOriginal(arquivo, buffer);
      const diferencaFonte = arredondar(esperado.valorGlosa - arquivo.glosaFonte);
      const diferencaDemo = arredondar(esperado.valorGlosa - arquivo.glosaDemo);
      const categoria = esperado.itens !== arquivo.itensFonte
        ? "divergencia_quantidade"
        : diferencaFonte > 0.009 || diferencaDemo > 0.009
          ? "glosa_subestimada"
          : diferencaFonte < -0.009 || diferencaDemo < -0.009
            ? "glosa_superestimada"
            : esperado.itensMarcadosGlosaSemValor > 0
              ? "glosa_sem_valor_no_original"
              : "correto";

      detalhes.push({
        arquivoId: arquivo.id,
        estabelecimentoId: arquivo.estabelecimentoId,
        estabelecimento: arquivo.estabelecimento.trim(),
        convenio: arquivo.convenio,
        arquivo: arquivo.nome,
        status: arquivo.status,
        tamanhoBytes: buffer.length,
        categoria,
        atual: {
          itensFonte: arquivo.itensFonte,
          itensDemo: arquivo.itensDemo,
          glosaFonte: arredondar(arquivo.glosaFonte),
          glosaDemo: arredondar(arquivo.glosaDemo),
        },
        esperado,
        diferencaFonte,
        diferencaDemo,
      });
    } catch (error) {
      detalhes.push({
        arquivoId: arquivo.id,
        estabelecimentoId: arquivo.estabelecimentoId,
        estabelecimento: arquivo.estabelecimento.trim(),
        convenio: arquivo.convenio,
        arquivo: arquivo.nome,
        status: arquivo.status,
        categoria: "arquivo_indisponivel_ou_invalido",
        erro: error instanceof Error ? error.message : String(error),
        atual: {
          itensFonte: arquivo.itensFonte,
          itensDemo: arquivo.itensDemo,
          glosaFonte: arredondar(arquivo.glosaFonte),
          glosaDemo: arredondar(arquivo.glosaDemo),
        },
      });
    }
  }

  const categorias = Array.from(new Set(detalhes.map((item) => item.categoria)));
  const resumoCategorias = Object.fromEntries(
    categorias.map((categoria) => [categoria, detalhes.filter((item) => item.categoria === categoria).length]),
  );
  const porEstabelecimento = Array.from(new Set(detalhes.map((item) => item.estabelecimentoId))).map((id) => {
    const grupo = detalhes.filter((item) => item.estabelecimentoId === id);
    return {
      estabelecimentoId: id,
      estabelecimento: grupo[0]?.estabelecimento,
      arquivos: grupo.length,
      afetados: grupo.filter((item) => item.categoria === "glosa_subestimada").length,
      corretos: grupo.filter((item) => item.categoria === "correto" || item.categoria === "glosa_sem_valor_no_original").length,
      indisponiveisOuInvalidos: grupo.filter((item) => item.categoria === "arquivo_indisponivel_ou_invalido").length,
      glosaAtual: arredondar(grupo.reduce((total, item) => total + numero(item.atual?.glosaDemo), 0)),
      glosaEsperada: arredondar(grupo.reduce((total, item) => total + numero(item.esperado?.valorGlosa), 0)),
    };
  });

  const resultado = {
    geradoEm: new Date().toISOString(),
    resumo: {
      arquivos: detalhes.length,
      ...resumoCategorias,
    },
    porEstabelecimento,
    pendencias: detalhes.filter((item) => item.categoria !== "correto"),
  };

  console.log(`UNIMED_AUDIT_RESULT=${JSON.stringify(resultado)}`);
} finally {
  await pool.end();
}
