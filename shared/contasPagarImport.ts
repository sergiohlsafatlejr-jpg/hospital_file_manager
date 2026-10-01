import { z } from "zod";

export const MAX_CONTAS_PAGAR_IMPORT = 500;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const [year, month, day] = v.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
});

export const contaPagarImportItemSchema = z.object({
  linha: z.number().int().min(2),
  descricao: z.string().trim().min(1).max(500),
  valor: z.string().regex(/^\d{1,13}\.\d{2}$/),
  dataVencimento: isoDate,
  dataPagamento: isoDate.optional(),
  pago: z.enum(["sim", "nao"]),
  categoriaNome: z.string().trim().max(255).optional(),
  centroCustoNome: z.string().trim().max(255).optional(),
  observacoes: z.string().max(10000).optional(),
}).refine(v => (v.pago === "sim") === Boolean(v.dataPagamento), { message: "Status e data de pagamento divergentes" });

export const contasPagarImportSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  empresaId: z.number().int().positive(),
  items: z.array(contaPagarImportItemSchema).min(1).max(MAX_CONTAS_PAGAR_IMPORT),
});
export type ContaPagarImportItem = z.infer<typeof contaPagarImportItemSchema>;

export function normalizarNome(v: string) {
  return v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function parseDataCivil(value: unknown, date1904 = false): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let result: string;
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    // A parcela fracionária representa hora. Não deixe arredondamento de fuso
    // transformar o dia civil da planilha no dia seguinte.
    const d = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(value) * 86400000);
    result = d.toISOString().slice(0, 10);
  } else {
    const v = String(value).trim();
    const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
    const iso = /^\d{4}-\d{2}-\d{2}$/.exec(v);
    if (br) result = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    else if (iso) result = v;
    else return undefined;
  }
  return isoDate.safeParse(result).success ? result : undefined;
}

export function parseValorConta(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value >= 1e13) return undefined;
    return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  }
  if (typeof value !== "string") return undefined;
  let v = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,13},\d{1,2}$/.test(v)) v = v.replace(",", ".");
  else if (!/^\d{1,13}(\.\d{1,2})?$/.test(v)) return undefined;
  const number = Number(v);
  if (!Number.isFinite(number) || number < 0 || number >= 1e13) return undefined;
  return number.toFixed(2);
}

export type ImportIssue = { linha: number; campo: string };
export function chaveContaPagar(v: Pick<ContaPagarImportItem, "descricao" | "valor" | "dataVencimento">) {
  return `${v.descricao.trim()}\u0000${v.valor}\u0000${v.dataVencimento}`;
}
export function parseContasPagarRows(rows: Record<string, unknown>[], date1904 = false) {
  const items: ContaPagarImportItem[] = [];
  const issues: ImportIssue[] = [];
  const primeirasLinhas = new Map<string, number>();
  if (rows.length > MAX_CONTAS_PAGAR_IMPORT) issues.push({ linha: 0, campo: `limite de ${MAX_CONTAS_PAGAR_IMPORT} linhas` });
  for (const [index, row] of rows.entries()) {
    const linha = index + 2;
    const descricao = String(row["Descrição"] ?? "").trim();
    const valor = parseValorConta(row["Valor"]);
    const dataVencimento = parseDataCivil(row["Vencimento"], date1904);
    const pagamentoRaw = row["Data Pagamento"];
    const dataPagamento = parseDataCivil(pagamentoRaw, date1904);
    const status = normalizarNome(String(row["Status"] ?? ""));
    const pago = status === "pago" ? "sim" as const : "nao" as const;
    if (!descricao || descricao.length > 500) issues.push({ linha, campo: "Descrição" });
    if (!valor) issues.push({ linha, campo: "Valor" });
    if (!dataVencimento) issues.push({ linha, campo: "Vencimento" });
    if (pagamentoRaw !== null && pagamentoRaw !== undefined && String(pagamentoRaw).trim() !== "" && !dataPagamento) issues.push({ linha, campo: "Data Pagamento" });
    if (!(["pago", "pendente"].includes(status))) issues.push({ linha, campo: "Status" });
    if ((pago === "sim") !== Boolean(dataPagamento)) issues.push({ linha, campo: "Status/Data Pagamento" });
    const categoriaNome = String(row["Categoria"] ?? "").trim();
    const centroCustoNome = String(row["Centro de Custo"] ?? "").trim();
    const observacoes = String(row["Observações"] ?? "").trim();
    if (categoriaNome.length > 255) issues.push({ linha, campo: "Categoria" });
    if (centroCustoNome.length > 255) issues.push({ linha, campo: "Centro de Custo" });
    if (observacoes.length > 10000) issues.push({ linha, campo: "Observações" });
    if (descricao && valor && dataVencimento && ["pago", "pendente"].includes(status) && (pago === "sim") === Boolean(dataPagamento)) {
      const item = { linha, descricao, valor, dataVencimento, dataPagamento, pago, categoriaNome, centroCustoNome, observacoes };
      const chave = chaveContaPagar(item);
      if (primeirasLinhas.has(chave)) issues.push({ linha, campo: `Duplicidade com linha ${primeirasLinhas.get(chave)}` });
      else primeirasLinhas.set(chave, linha);
      items.push(item);
    }
  }
  return { items, issues };
}
