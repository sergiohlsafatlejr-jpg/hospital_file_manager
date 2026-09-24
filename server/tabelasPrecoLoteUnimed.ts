import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import {
  detectarFonteProcedimentoPorNome,
  encontrarLinhaCabecalhoProcedimentos,
  normalizarProcedimentos,
  type ProcedimentoFonte,
  type ProcedimentoImportItem,
} from "./procedimentosTabela";

export const ORDEM_LOTE_UNIMED: readonly ProcedimentoFonte[] = [
  "preco_portes",
  "porte_anestesico",
  "dados_completo",
  "site",
] as const;

export const MAX_LOTE_UNIMED_BASE64 = 40 * 1024 * 1024;
export const MAX_LINHAS_POR_PLANILHA = 250_000;

export type ArquivoLoteUnimed = {
  nomeArquivo: string;
  formatoArquivo: "excel";
  conteudo: string;
};

export type EtapaLoteUnimedPreparada = {
  fonte: ProcedimentoFonte;
  nomeArquivo: string;
  formatoArquivo: "excel";
  totalItens: number;
  itens: ProcedimentoImportItem[];
};

export type LoteUnimedPreparado = {
  etapas: EtapaLoteUnimedPreparada[];
  totalItens: number;
  loteHash: string;
};

export function contarLinhasOriginaisDaPlanilha(
  sheet: XLSX.WorkSheet,
  headerRow: number,
): number {
  const sheetComFaixaCompleta = sheet as XLSX.WorkSheet & { "!fullref"?: string };
  const referencia = sheetComFaixaCompleta["!fullref"] || sheet["!ref"];
  if (!referencia) return 0;
  const faixa = XLSX.utils.decode_range(referencia);
  return Math.max(0, faixa.e.r - headerRow);
}

function extrairLinhas(
  arquivo: ArquivoLoteUnimed,
  fonte: ProcedimentoFonte,
): Array<Record<string, unknown>> {
  const buffer = Buffer.from(arquivo.conteudo, "base64");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    sheetRows: MAX_LINHAS_POR_PLANILHA + 100,
  });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    const headerRow = encontrarLinhaCabecalhoProcedimentos(rows, fonte);
    if (headerRow >= 0) {
      const totalLinhasOriginais = contarLinhasOriginaisDaPlanilha(sheet, headerRow);
      if (totalLinhasOriginais > MAX_LINHAS_POR_PLANILHA) {
        throw new Error(
          `${arquivo.nomeArquivo} excede o limite de ${MAX_LINHAS_POR_PLANILHA.toLocaleString("pt-BR")} linhas.`,
        );
      }
      const registros = XLSX.utils.sheet_to_json(sheet, {
        range: headerRow,
        defval: null,
        raw: true,
      }) as Array<Record<string, unknown>>;
      if (registros.length > MAX_LINHAS_POR_PLANILHA) {
        throw new Error(
          `${arquivo.nomeArquivo} excede o limite de ${MAX_LINHAS_POR_PLANILHA.toLocaleString("pt-BR")} linhas.`,
        );
      }
      return registros;
    }
  }

  throw new Error(
    `O arquivo ${arquivo.nomeArquivo} não contém as colunas esperadas para ${fonte}.`,
  );
}

function exigirResultadoValido(
  arquivo: ArquivoLoteUnimed,
  fonte: ProcedimentoFonte,
  itens: ProcedimentoImportItem[],
  errors: string[],
): ProcedimentoImportItem[] {
  if (errors.length > 0) {
    throw new Error(
      `${arquivo.nomeArquivo}: ${errors.slice(0, 5).join(" | ")}`,
    );
  }
  if (itens.length === 0) {
    throw new Error(`${arquivo.nomeArquivo}: nenhum item válido foi encontrado.`);
  }
  return itens;
}

/**
 * Valida e normaliza as quatro referências da Unimed antes de qualquer escrita.
 * Os nomes identificam fontes com cabeçalhos equivalentes (Preço de Portes e
 * Porte Anestésico), e todos os arquivos são conferidos pela estrutura interna.
 */
export function prepararLoteUnimed(
  arquivos: ArquivoLoteUnimed[],
): LoteUnimedPreparado {
  if (arquivos.length !== ORDEM_LOTE_UNIMED.length) {
    throw new Error("Selecione exatamente as quatro planilhas da Unimed para criar o lote.");
  }
  const tamanhoBase64 = arquivos.reduce((total, arquivo) => total + arquivo.conteudo.length, 0);
  if (tamanhoBase64 > MAX_LOTE_UNIMED_BASE64) {
    throw new Error("O conjunto das quatro planilhas excede o limite seguro de 30 MB.");
  }

  const porFonte = new Map<ProcedimentoFonte, ArquivoLoteUnimed>();
  for (const arquivo of arquivos) {
    const fonte = detectarFonteProcedimentoPorNome(arquivo.nomeArquivo);
    if (!fonte) {
      throw new Error(
        `Não foi possível reconhecer ${arquivo.nomeArquivo}. Use os nomes padrão das quatro planilhas Unimed.`,
      );
    }
    if (porFonte.has(fonte)) {
      throw new Error(`Há mais de um arquivo para a etapa ${fonte}.`);
    }
    porFonte.set(fonte, arquivo);
  }

  for (const fonte of ORDEM_LOTE_UNIMED) {
    if (!porFonte.has(fonte)) {
      throw new Error(`A planilha da etapa ${fonte} não foi selecionada.`);
    }
  }

  const loteHash = createHash("sha256");
  for (const fonte of ORDEM_LOTE_UNIMED) {
    const arquivo = porFonte.get(fonte)!;
    loteHash.update(fonte);
    loteHash.update("\0");
    loteHash.update(Buffer.from(arquivo.conteudo, "base64"));
    loteHash.update("\0");
  }

  const etapas: EtapaLoteUnimedPreparada[] = [];

  const arquivoPreco = porFonte.get("preco_portes")!;
  const linhasPreco = extrairLinhas(arquivoPreco, "preco_portes");
  const resultadoPreco = normalizarProcedimentos(linhasPreco, "preco_portes");
  const itensPreco = exigirResultadoValido(
    arquivoPreco,
    "preco_portes",
    resultadoPreco.items,
    resultadoPreco.errors,
  );
  etapas.push({
    fonte: "preco_portes",
    nomeArquivo: arquivoPreco.nomeArquivo,
    formatoArquivo: "excel",
    totalItens: linhasPreco.length,
    itens: itensPreco,
  });

  const arquivoAnestesico = porFonte.get("porte_anestesico")!;
  const linhasAnestesico = extrairLinhas(arquivoAnestesico, "porte_anestesico");
  const resultadoAnestesico = normalizarProcedimentos(linhasAnestesico, "porte_anestesico");
  const itensAnestesico = exigirResultadoValido(
    arquivoAnestesico,
    "porte_anestesico",
    resultadoAnestesico.items,
    resultadoAnestesico.errors,
  );
  etapas.push({
    fonte: "porte_anestesico",
    nomeArquivo: arquivoAnestesico.nomeArquivo,
    formatoArquivo: "excel",
    totalItens: linhasAnestesico.length,
    itens: itensAnestesico,
  });

  const precoPortes = new Map(
    itensPreco.map((item) => [item.codigo, Number(item.valor)]),
  );
  const portesAnestesicos = new Map(
    itensAnestesico.map((item) => [`AN${Number(item.codigo)}`, Number(item.valor)]),
  );

  const arquivoDados = porFonte.get("dados_completo")!;
  const linhasDados = extrairLinhas(arquivoDados, "dados_completo");
  const resultadoDados = normalizarProcedimentos(
    linhasDados,
    "dados_completo",
    precoPortes,
    portesAnestesicos,
  );
  const itensDados = exigirResultadoValido(
    arquivoDados,
    "dados_completo",
    resultadoDados.items,
    resultadoDados.errors,
  );
  etapas.push({
    fonte: "dados_completo",
    nomeArquivo: arquivoDados.nomeArquivo,
    formatoArquivo: "excel",
    totalItens: linhasDados.length,
    itens: itensDados,
  });

  const arquivoSite = porFonte.get("site")!;
  const linhasSite = extrairLinhas(arquivoSite, "site");
  const resultadoSite = normalizarProcedimentos(linhasSite, "site");
  const itensSite = exigirResultadoValido(
    arquivoSite,
    "site",
    resultadoSite.items,
    resultadoSite.errors,
  );
  etapas.push({
    fonte: "site",
    nomeArquivo: arquivoSite.nomeArquivo,
    formatoArquivo: "excel",
    totalItens: linhasSite.length,
    itens: itensSite,
  });

  return {
    etapas,
    totalItens: etapas.reduce((total, etapa) => total + etapa.totalItens, 0),
    loteHash: loteHash.digest("hex"),
  };
}
