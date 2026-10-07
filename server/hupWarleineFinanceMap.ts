import { createHash } from "node:crypto";
import {
  parseWarleineRow,
  WARLEINE_XLSX_HEADERS,
  type WarleineCanonicalRow,
} from "./warleineFaturamentoImportService";

export const HUP_FINANCE_ESTABELECIMENTO = 1260036;

// No banco físico alimentado pelo Hop estes seis campos do layout XLSX Warleine
// não existem. O parser os recebe como vazios: jamais inferir data de pagamento.
export const HUP_HOP_COLUMNS = [
  "nomeconv", "codconv", "mesprod", "numfatura", "codrecur", "tipoproc",
  "protocolo", "numconta", "guiacobra", "aihguia", "descricao", "matricula",
  "data", "dataint", "datasai", "procdisco", "codproprio", "codgrufi",
  "descricao_1", "funcaotiss", "receber", "codcc", "nomecc", "prestexe",
  "nomeprest", "quantidade", "vl_faturado", "vl_recebido", "vl_receb_a_maior",
  "vl_total_recebido", "vl_aberto", "vl_glosas", "gl_recurso", "gl_aceita",
  "gl_analise", "gl_recuperada", "codtiss", "descmotivo", "codrecur_1",
  "complrecur", "tipoatend", "vl_unitario", "estabelecimentos_id",
] as const;

type HupPhysicalRow = Record<string, unknown>;

const physicalByPosition = WARLEINE_XLSX_HEADERS.map((name, index) => {
  if (index === 18) return "descricao_1";
  if (index === 38) return "codrecur_1";
  if (index >= 41 && index <= 46) return null;
  return name;
});

export function parseHupFinanceRow(row: HupPhysicalRow): WarleineCanonicalRow {
  if (String(row.estabelecimentos_id ?? "").trim() !== String(HUP_FINANCE_ESTABELECIMENTO)) {
    throw new Error("UNIDADE_HUP_DIVERGENTE");
  }
  const values = physicalByPosition.map((column) => column ? row[column] ?? null : null);
  const parsed = parseWarleineRow(values);
  if (!parsed.canonical || parsed.errors.length || parsed.warnings.length) {
    throw new Error(`LAYOUT_HUP_INVALIDO:${[...parsed.errors, ...parsed.warnings].join(",")}`);
  }
  if (parsed.canonical.competencia !== String(row.mesprod).trim()) {
    throw new Error("COMPETENCIA_HUP_FORA_DO_PADRAO");
  }
  return parsed.canonical;
}

export function fingerprintHupFinance(rows: readonly WarleineCanonicalRow[]) {
  // A staging física não tem PK/numeroLinha: ordenar pelo hash canônico e manter
  // TODAS as ocorrências iguais. A origem do fato é hash + ordinal de ocorrência.
  const ordered = [...rows].sort((a, b) => a.linhaHash.localeCompare(b.linhaHash, "en"));
  const hash = createHash("sha256");
  for (const row of ordered) hash.update(row.linhaHash).update("\n");
  return { hash: hash.digest("hex"), ordered };
}

export function originForHupFinance(row: WarleineCanonicalRow, occurrence: number) {
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) throw new Error("OCORRENCIA_INVALIDA");
  return `hop_hup:${row.linhaHash}:${occurrence}`;
}
