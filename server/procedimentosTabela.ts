export const PROCEDIMENTO_FONTES = [
  "porte_anestesico",
  "preco_portes",
  "dados_completo",
  "site",
] as const;

export type ProcedimentoFonte = (typeof PROCEDIMENTO_FONTES)[number];

export const PROCEDIMENTO_FONTE_LABELS: Record<ProcedimentoFonte, string> = {
  porte_anestesico: "Porte Anestésico",
  preco_portes: "Preço de Portes",
  dados_completo: "Dados Completos",
  site: "Tabela Unimed (Site)",
};

export type ProcedimentoImportItem = {
  codigo: string;
  nome: string;
  valor: string;
  porte?: string;
  numeroAuxiliares?: number;
  tipoBeneficiario?: string;
  valorPorteAnestesico?: string;
};

export type ProcedimentoImportResult = {
  items: ProcedimentoImportItem[];
  errors: string[];
};

const PROCEDIMENTO_COLUNA_ALIASES: Record<string, string[]> = {
  codigo: ["codigo", "cod", "codigo_procedimento"],
  descricao: ["descricao", "nome", "desc"],
  valor: ["valor", "preco", "price", "vl"],
  porte: ["porte"],
  numero_auxiliares: ["numero_auxiliares", "numero_de_auxiliares", "auxiliares"],
  tipo_de_beneficiario: ["tipo_de_beneficiario", "tipo_beneficiario", "beneficiario"],
};

const PROCEDIMENTO_COLUNAS_OBRIGATORIAS: Record<ProcedimentoFonte, string[]> = {
  porte_anestesico: ["codigo", "valor", "tipo_de_beneficiario"],
  preco_portes: ["codigo", "valor", "tipo_de_beneficiario"],
  dados_completo: ["codigo", "descricao", "porte", "numero_auxiliares", "valor", "tipo_de_beneficiario"],
  site: ["codigo", "descricao", "valor", "tipo_de_beneficiario"],
};

/**
 * Normaliza nomes de colunas da mesma forma que o importador Python de origem:
 * remove acentos, espaços e underscores excedentes e converte para snake_case.
 */
export function normalizarCabecalho(value: unknown): string {
  const text = String(value ?? "").trim();
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

/** Localiza a linha de cabeçalho em planilhas que possuem título, legenda ou abas auxiliares. */
export function encontrarLinhaCabecalhoProcedimentos(
  rows: unknown[][],
  fonte: ProcedimentoFonte,
): number {
  return rows.findIndex((row) => {
    const headers = new Set(row.map(normalizarCabecalho));
    return PROCEDIMENTO_COLUNAS_OBRIGATORIAS[fonte].every((column) => {
      return (PROCEDIMENTO_COLUNA_ALIASES[column] || [column]).some((alias) => headers.has(alias));
    });
  });
}

/** Detecta os nomes padronizados dos quatro arquivos de atualização do projeto. */
export function detectarFonteProcedimentoPorNome(value: unknown): ProcedimentoFonte | undefined {
  const name = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (name.includes("anestes")) return "porte_anestesico";
  if (name.includes("preco") && name.includes("porte")) return "preco_portes";
  if (name.includes("dados") && name.includes("completo")) return "dados_completo";
  if (name.includes("unimed") && name.includes("site")) return "site";
  return undefined;
}

function normalizarLinha(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizarCabecalho(key);
    if (normalizedKey && normalized[normalizedKey] === undefined) {
      normalized[normalizedKey] = value;
    }
  }
  return normalized;
}

/** Normaliza códigos conforme a regra do importador legado. */
export function normalizarCodigo(value: unknown, fonte: ProcedimentoFonte): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || ["nan", "none", "null"].includes(text.toLowerCase())) return "";

  if (fonte === "porte_anestesico") {
    const digits = text.match(/(\d+)/)?.[1] ?? "";
    return digits ? String(Number(digits)) : "";
  }

  const upper = text.toUpperCase();
  const withoutLeadingZeros = upper.replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

/** Converte valores monetários brasileiros e valores numéricos do Excel. */
export function parseValor(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value).trim();
  if (!text) return 0;

  let cleaned: string;
  if (text.includes(",")) {
    cleaned = text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = text.replace(/[^\d.-]/g, "");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return ["nan", "none", "null"].includes(text.toLowerCase()) ? "" : text;
}

function asInteger(value: unknown): number {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveValor(
  value: unknown,
  precoPortes: Map<string, number>,
  resolvePorteSimbolico: boolean,
): { value: number; error?: string } {
  const text = asText(value).toUpperCase();
  if (resolvePorteSimbolico && /[A-Z]$/.test(text)) {
    const codigo = text.replace(/^0+/, "") || "0";
    const resolved = precoPortes.get(codigo);
    if (resolved === undefined) {
      return { value: 0, error: `Porte ${text} não encontrado na tabela de Preço de Portes.` };
    }
    return { value: resolved };
  }
  return { value: parseValor(value) };
}

/**
 * Converte as quatro estruturas do projeto tabmprop-unimed-IRG para o modelo
 * unificado de tabelasPreco do Safatle.
 */
export function normalizarProcedimentos(
  rows: Array<Record<string, unknown>>,
  fonte: ProcedimentoFonte,
  precoPortes: Map<string, number> = new Map(),
  portesAnestesicos: Map<string, number> = new Map(),
): ProcedimentoImportResult {
  const items: ProcedimentoImportItem[] = [];
  const errors: string[] = [];

  const availableColumns = new Set(Object.keys(normalizarLinha(rows[0] || {})));
  const missingColumns = PROCEDIMENTO_COLUNAS_OBRIGATORIAS[fonte].filter((column) => {
    return !(PROCEDIMENTO_COLUNA_ALIASES[column] || [column]).some((alias) => availableColumns.has(alias));
  });
  if (missingColumns.length) {
    return { items, errors: [`Colunas obrigatórias ausentes: ${missingColumns.join(", ")}.`] };
  }

  rows.forEach((rawRow, index) => {
    const row = normalizarLinha(rawRow);
    const linha = index + 2;
    const codigo = normalizarCodigo(row.codigo ?? row.cod ?? row.codigo_procedimento, fonte);
    const descricao = asText(row.descricao ?? row.nome ?? row.desc);
    const tipoBeneficiario = asText(row.tipo_de_beneficiario ?? row.tipo_beneficiario ?? row.beneficiario);
    const porte = asText(row.porte);

    let valorPorteAnestesico: string | undefined;
    if (fonte === "dados_completo" && porte) {
      const porteNumero = porte.toUpperCase().replace(/^AN/, "");
      if (/^\d+$/.test(porteNumero)) {
        const codigoPorteAnestesico = `AN${Number(porteNumero)}`;
        const valorAnestesico = portesAnestesicos.get(codigoPorteAnestesico);
        if (valorAnestesico !== undefined) {
          valorPorteAnestesico = valorAnestesico.toFixed(2);
        } else {
          errors.push(`Linha ${linha}: Porte anestésico ${codigoPorteAnestesico} não encontrado na tabela de Porte Anestésico.`);
          return;
        }
      }
    }

    const valorRaw = row.valor ?? row.preco ?? row.price ?? row.vl;
    const resolved = resolveValor(valorRaw, precoPortes, fonte === "dados_completo");

    if (!codigo) {
      errors.push(`Linha ${linha}: código não informado.`);
      return;
    }

    if (resolved.error) {
      errors.push(`Linha ${linha}: ${resolved.error}`);
      return;
    }

    const nome = descricao || `${PROCEDIMENTO_FONTE_LABELS[fonte]} ${codigo}`;
    const numeroAuxiliares = asInteger(row.numero_auxiliares ?? row.numero_de_auxiliares);

    items.push({
      codigo,
      nome,
      valor: resolved.value.toFixed(2),
      porte: porte || undefined,
      numeroAuxiliares: fonte === "dados_completo" ? numeroAuxiliares : undefined,
      tipoBeneficiario: tipoBeneficiario || undefined,
      ...(valorPorteAnestesico ? { valorPorteAnestesico } : {}),
    });
  });

  return { items, errors };
}
