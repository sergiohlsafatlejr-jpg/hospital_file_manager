import Decimal from "decimal.js";
import type { LinhaMatrizGlosaBi } from "@/components/bi-executivo/BiGlosasMatrixTable";

export interface TotaisMatrizGlosaBi {
  valorProcessado?: number;
  valorGlosado: number;
  glosaRecursada: number;
  glosaAceita: number;
  glosaPendente: number;
  taxaGlosa?: number;
  qtdItens?: number;
}

export type ModoPercentualMatrizGlosaBi = "taxaGlosa" | "participacao";

const percentual = (parte: number, total: number) =>
  total > 0 ? new Decimal(parte).div(total).times(100).toNumber() : 0;

export function obterPercentualLinhaMatrizGlosa(
  linha: LinhaMatrizGlosaBi,
  modo: ModoPercentualMatrizGlosaBi,
  denominadorParticipacao?: number,
) {
  // Percentuais informados, inclusive zero, são autoritativos.
  return modo === "participacao"
    ? linha.percentualTotal ?? percentual(linha.valorGlosado, denominadorParticipacao ?? 0)
    : linha.taxaGlosa ?? percentual(linha.valorGlosado, linha.valorProcessado ?? 0);
}

export function calcularTotaisMatrizGlosa(
  linhas: LinhaMatrizGlosaBi[],
  modo: ModoPercentualMatrizGlosaBi,
  totaisExplicito?: TotaisMatrizGlosaBi,
  denominadorParticipacao?: number,
) {
  const campos = [
    "valorProcessado", "valorGlosado", "glosaRecursada",
    "glosaAceita", "glosaPendente", "qtdItens",
  ] as const;
  const soma = (campo: typeof campos[number]) => linhas
    .reduce((total, linha) => total.plus(linha[campo] ?? 0), new Decimal(0))
    .toNumber();
  // Somente esta matriz: nunca unir dimensões, deduplicar chaves de filtro ou
  // usar um TOP N como substituto do resumo global/da seleção.
  const valores = Object.fromEntries(campos.map((campo) => [
    campo, totaisExplicito ? totaisExplicito[campo] ?? 0 : soma(campo),
  ])) as Required<Pick<TotaisMatrizGlosaBi, typeof campos[number]>>;
  const pct = modo === "participacao"
    ? denominadorParticipacao !== undefined
      // Zero é um denominador informado, não autorização para inferir 100%.
      ? percentual(valores.valorGlosado, denominadorParticipacao)
      : totaisExplicito
        ? 0
        : linhas.reduce((total, linha) => total.plus(linha.percentualTotal ?? 0), new Decimal(0)).toNumber()
    : totaisExplicito?.taxaGlosa ?? percentual(valores.valorGlosado, valores.valorProcessado);
  return { ...valores, pct };
}
