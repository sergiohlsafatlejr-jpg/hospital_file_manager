/**
 * Extração das decisões de glosa (Sim = recursar / Não = glosa aceita) de uma
 * planilha de consultoria, a partir das linhas já lidas (array de arrays).
 *
 * Colunas reconhecidas pelo cabeçalho (sem depender da posição):
 *  - "VAMOS RECURSAR? (Sim / Não / Avaliar)"   -> decisão (obrigatória)
 *  - "Justificativa / Orientação para Recurso" -> justificativa
 *  - "Nº Protocolo", "Nº Guia Prestador", "Nº Guia Operadora", "Seq Item",
 *    "Código Procedimento", "Descrição do Item", "Vl. Glosado (R$)"
 */

export interface LinhaDecisaoExtraida {
  linha: number;
  decisao: string;
  protocolo: string | null;
  guiaPrestador: string | null;
  guiaOperadora: string | null;
  sequencialItem: string | null;
  codigoItem: string | null;
  descricaoItem: string | null;
  valorGlosa: string | null;
  justificativa: string | null;
}

export interface ResultadoExtracaoDecisoes {
  linhaCabecalho: number;
  totalLinhasDados: number;
  linhas: LinhaDecisaoExtraida[];
  contagem: { sim: number; nao: number; avaliar: number; vazio: number; outros: number };
  colunasAusentes: string[];
}

const normalizarTexto = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
};

const COLUNAS: Record<keyof Omit<LinhaDecisaoExtraida, "linha">, RegExp> = {
  decisao: /^vamos recursar/,
  justificativa: /^justificativa/,
  protocolo: /^n.? ?protocolo$|^protocolo$|^numero protocolo$/,
  guiaPrestador: /guia prestador/,
  guiaOperadora: /guia operadora/,
  sequencialItem: /^seq/,
  codigoItem: /^codigo (do )?(procedimento|item)/,
  descricaoItem: /^descricao do item/,
  valorGlosa: /^vl\.? glosado/,
};

const OBRIGATORIAS: Array<keyof typeof COLUNAS> = ["decisao", "codigoItem"];

/** Localiza o cabeçalho (linha com a coluna "VAMOS RECURSAR?") nas primeiras 30 linhas. */
export function localizarCabecalhoDecisoes(rows: unknown[][]): number {
  const limite = Math.min(rows.length, 30);
  for (let i = 0; i < limite; i++) {
    if ((rows[i] || []).some((c) => COLUNAS.decisao.test(normalizarTexto(c)))) return i;
  }
  return -1;
}

export function extrairDecisoesDeLinhas(rows: unknown[][]): ResultadoExtracaoDecisoes {
  const idxCab = localizarCabecalhoDecisoes(rows);
  if (idxCab < 0) {
    throw new Error('Coluna "VAMOS RECURSAR? (Sim / Não / Avaliar)" não encontrada na planilha.');
  }
  const cabecalho = (rows[idxCab] || []).map(normalizarTexto);
  const indices: Partial<Record<keyof typeof COLUNAS, number>> = {};
  for (const [campo, re] of Object.entries(COLUNAS) as Array<[keyof typeof COLUNAS, RegExp]>) {
    const idx = cabecalho.findIndex((h) => re.test(h));
    if (idx >= 0) indices[campo] = idx;
  }
  const colunasAusentes = (Object.keys(COLUNAS) as Array<keyof typeof COLUNAS>).filter((c) => indices[c] === undefined);
  const faltandoObrigatoria = OBRIGATORIAS.filter((c) => indices[c] === undefined);
  if (faltandoObrigatoria.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${faltandoObrigatoria.join(", ")}`);
  }
  if (indices.guiaOperadora === undefined && indices.guiaPrestador === undefined) {
    throw new Error("A planilha precisa ter a coluna Nº Guia Operadora ou Nº Guia Prestador.");
  }

  const get = (row: unknown[], campo: keyof typeof COLUNAS) =>
    indices[campo] === undefined ? null : texto(row[indices[campo]!]);

  const contagem = { sim: 0, nao: 0, avaliar: 0, vazio: 0, outros: 0 };
  const linhas: LinhaDecisaoExtraida[] = [];
  let totalLinhasDados = 0;
  for (let i = idxCab + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.some((c) => texto(c) !== null)) continue;
    totalLinhasDados++;
    const decisao = get(row, "decisao");
    const d = normalizarTexto(decisao);
    if (!d) { contagem.vazio++; continue; }
    if (d === "sim" || d === "s") contagem.sim++;
    else if (d === "nao" || d === "n") contagem.nao++;
    else if (d === "avaliar") { contagem.avaliar++; continue; }
    else { contagem.outros++; continue; }
    linhas.push({
      linha: i + 1,
      decisao: decisao!,
      protocolo: get(row, "protocolo"),
      guiaPrestador: get(row, "guiaPrestador"),
      guiaOperadora: get(row, "guiaOperadora"),
      sequencialItem: get(row, "sequencialItem"),
      codigoItem: get(row, "codigoItem"),
      descricaoItem: get(row, "descricaoItem"),
      valorGlosa: get(row, "valorGlosa"),
      justificativa: get(row, "justificativa"),
    });
  }
  return { linhaCabecalho: idxCab + 1, totalLinhasDados, linhas, contagem, colunasAusentes };
}
