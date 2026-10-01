import { detectarFonteProcedimentoPorNome, encontrarLinhaCabecalhoProcedimentos, normalizarProcedimentos, type ProcedimentoFonte, type ProcedimentoImportItem } from "./procedimentosTabela";

export type ProcedimentoLoteArquivo = {
  nomeArquivo: string;
  formatoArquivo: "excel" | "csv" | "dbf";
  conteudo: string;
};

export type ProcedimentoConsolidado = ProcedimentoImportItem & {
  procedimentoFonte: "dados_completo" | "site";
};

export type ProcedimentoLoteResultado = {
  items: ProcedimentoConsolidado[];
  totalEntrada: number;
  totalDadosCompletos: number;
  totalSite: number;
  totalDuplicadosSite: number;
};

const FONTES_OBRIGATORIAS: ProcedimentoFonte[] = [
  "preco_portes",
  "porte_anestesico",
  "dados_completo",
  "site",
];

function fonteDoArquivo(nomeArquivo: string): ProcedimentoFonte {
  const fonte = detectarFonteProcedimentoPorNome(nomeArquivo);
  if (!fonte) {
    throw new Error(
      `Arquivo não reconhecido: ${nomeArquivo}. Use atualizacao_Preco_Porte.xlsx, atualizacao_Porte_Anestesico.xlsx, atualizacao_Dados_Completo.xlsx e atualizacao_Tabela_Unimed_Site.xlsx.`,
    );
  }
  return fonte;
}

async function lerArquivo(arquivo: ProcedimentoLoteArquivo): Promise<{ fonte: ProcedimentoFonte; rows: Array<Record<string, unknown>> }> {
  const fonte = fonteDoArquivo(arquivo.nomeArquivo);
  const buffer = Buffer.from(arquivo.conteudo, "base64");

  if (arquivo.formatoArquivo === "excel") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: true,
      }) as unknown[][];
      const headerRow = encontrarLinhaCabecalhoProcedimentos(rows, fonte);
      if (headerRow >= 0) {
        return {
          fonte,
          rows: XLSX.utils.sheet_to_json(sheet, {
            range: headerRow,
            defval: null,
            raw: true,
          }) as Array<Record<string, unknown>>,
        };
      }
    }
    throw new Error(`O arquivo ${arquivo.nomeArquivo} não contém as colunas esperadas para ${fonte}.`);
  }

  if (arquivo.formatoArquivo === "csv") {
    const { parse } = await import("csv-parse/sync");
    return {
      fonte,
      rows: parse(buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
      }) as Array<Record<string, unknown>>,
    };
  }

  const DBFFile = await import("dbffile");
  const tempPath = `/tmp/import_procedimentos_${Date.now()}_${Math.random().toString(36).slice(2)}.dbf`;
  const fs = await import("fs/promises");
  try {
    await fs.writeFile(tempPath, buffer);
    const dbf = await DBFFile.DBFFile.open(tempPath);
    return { fonte, rows: await dbf.readRecords() as Array<Record<string, unknown>> };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function chaveProcedimento(item: ProcedimentoImportItem): string {
  const codigo = item.codigo.trim().replace(/^0+/, "") || "0";
  const beneficiario = (item.tipoBeneficiario || "").trim().replace(/\s+/g, " ").toUpperCase();
  return `${codigo}\u001f${beneficiario}`;
}

/**
 * Valida as quatro fontes em memória, usa as duas tabelas auxiliares como lookup
 * e mantém Dados Completos quando o mesmo procedimento também existe no Site.
 */
export function consolidarProcedimentosUnimed(
  fontes: Record<ProcedimentoFonte, Array<Record<string, unknown>>>,
): ProcedimentoLoteResultado {
  const precoPortesNormalizado = normalizarProcedimentos(fontes.preco_portes, "preco_portes");
  const porteAnestesicoNormalizado = normalizarProcedimentos(fontes.porte_anestesico, "porte_anestesico");
  const precoPortes = new Map(precoPortesNormalizado.items.map((item) => [item.codigo, Number(item.valor)]));
  const portesAnestesicos = new Map(
    porteAnestesicoNormalizado.items.map((item) => [`AN${item.codigo}`, Number(item.valor)]),
  );

  const dadosCompletos = normalizarProcedimentos(
    fontes.dados_completo,
    "dados_completo",
    precoPortes,
    portesAnestesicos,
  );
  const site = normalizarProcedimentos(fontes.site, "site");
  const erros = [
    ...precoPortesNormalizado.errors.map((error) => `[preco_portes] ${error}`),
    ...porteAnestesicoNormalizado.errors.map((error) => `[porte_anestesico] ${error}`),
    ...dadosCompletos.errors.map((error) => `[dados_completo] ${error}`),
    ...site.errors.map((error) => `[site] ${error}`),
  ];
  if (erros.length > 0) {
    throw new Error(`Validação dos quatro arquivos falhou: ${erros.slice(0, 20).join(" | ")}`);
  }

  const porChave = new Map<string, ProcedimentoConsolidado>();
  for (const item of dadosCompletos.items) {
    const key = chaveProcedimento(item);
    if (!porChave.has(key)) {
      porChave.set(key, { ...item, procedimentoFonte: "dados_completo" });
    }
  }

  let totalDuplicadosSite = 0;
  for (const item of site.items) {
    const key = chaveProcedimento(item);
    if (porChave.has(key)) {
      totalDuplicadosSite += 1;
      continue;
    }
    porChave.set(key, { ...item, procedimentoFonte: "site" });
  }

  return {
    items: Array.from(porChave.values()),
    totalEntrada: dadosCompletos.items.length + site.items.length,
    totalDadosCompletos: dadosCompletos.items.length,
    totalSite: site.items.length,
    totalDuplicadosSite,
  };
}

export async function lerEConsolidarArquivosProcedimentos(
  arquivos: ProcedimentoLoteArquivo[],
): Promise<ProcedimentoLoteResultado> {
  if (arquivos.length !== FONTES_OBRIGATORIAS.length) {
    throw new Error("A importação consolidada exige exatamente os quatro arquivos de procedimentos.");
  }

  const lidos = await Promise.all(arquivos.map(lerArquivo));
  const fontes = Object.fromEntries(lidos.map(({ fonte, rows }) => [fonte, rows])) as Partial<Record<ProcedimentoFonte, Array<Record<string, unknown>>>>;
  const faltantes = FONTES_OBRIGATORIAS.filter((fonte) => !fontes[fonte]);
  if (faltantes.length > 0) {
    throw new Error(`Faltam arquivos obrigatórios: ${faltantes.join(", ")}.`);
  }

  return consolidarProcedimentosUnimed(fontes as Record<ProcedimentoFonte, Array<Record<string, unknown>>>);
}
