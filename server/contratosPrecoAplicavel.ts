import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { contratosConvenios, convenios, tabelasPreco, type TabelaPreco } from "../drizzle/schema";
import type { getDb } from "./db";

export type BancoContratosPreco = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type PrecoAplicavel = Pick<TabelaPreco,
  "id" | "convenioId" | "estabelecimentoId" | "codigo" | "nome" | "valor" |
  "tipo" | "porte" | "vigenciaInicio" | "ativo"
>;
export type ConsultaPrecoAplicavel = {
  estabelecimentoId: number;
  convenioId: number;
  codigos: string[];
  dataReferencia: string;
};

/** Datas da API permanecem ISO; não interpretar datas locais ambíguas. */
export function validarDataReferenciaIso(valor: string): string {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error("dataReferencia deve estar no formato YYYY-MM-DD");
  }
  const data = new Date(`${valor}T00:00:00.000Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error("dataReferencia deve ser uma data válida");
  }
  return valor;
}

export function normalizarDataExecucao(valor: unknown): string | undefined {
  let dia: string;
  if (valor instanceof Date && Number.isFinite(valor.getTime())) {
    dia = valor.toISOString().slice(0, 10);
  } else if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}(?:(?:T| )\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(valor)) {
    if (valor.length > 10) {
      const horario = valor.slice(11).match(/^(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))?$/);
      if (!horario || Number(horario[1]) > 23 || Number(horario[2]) > 59 || Number(horario[3]) > 59 ||
          (horario[4] && (Number(horario[5]) > 23 || Number(horario[6]) > 59))) return undefined;
    }
    dia = valor.slice(0, 10);
  } else {
    return undefined;
  }
  try {
    return validarDataReferenciaIso(dia);
  } catch {
    return undefined;
  }
}

export function dataReferenciaUnica(valores: readonly unknown[]): string | undefined {
  if (!valores.length) return undefined;
  const datas = valores.map(normalizarDataExecucao);
  if (datas.some(data => !data)) return undefined;
  const unicas = new Set(datas);
  return unicas.size === 1 ? datas[0] : undefined;
}

function validarConsulta(params: ConsultaPrecoAplicavel): void {
  if (!Number.isSafeInteger(params.estabelecimentoId) || params.estabelecimentoId <= 0 ||
      !Number.isSafeInteger(params.convenioId) || params.convenioId <= 0) {
    throw new Error("Hospital e convênio devem ser IDs positivos seguros");
  }
  validarDataReferenciaIso(params.dataReferencia);
}

/** Hospital específico > global; início mais recente > maior ID no empate. */
export function selecionarPrecosAplicaveis(
  precos: readonly PrecoAplicavel[],
  params: ConsultaPrecoAplicavel,
): PrecoAplicavel[] {
  validarConsulta(params);
  const codigos = new Set(params.codigos.map(codigo => codigo.trim()).filter(Boolean));
  const elegiveis = precos.filter(preco => {
    const inicio = normalizarDataExecucao(preco.vigenciaInicio);
    return preco.ativo === "sim" && preco.convenioId === params.convenioId &&
      (preco.estabelecimentoId === params.estabelecimentoId || preco.estabelecimentoId === null) &&
      codigos.has(preco.codigo.trim()) && inicio !== undefined && inicio <= params.dataReferencia;
  }).sort((a, b) =>
    Number(b.estabelecimentoId === params.estabelecimentoId) - Number(a.estabelecimentoId === params.estabelecimentoId) ||
    b.vigenciaInicio.getTime() - a.vigenciaInicio.getTime() || b.id - a.id,
  );
  const vistos = new Set<string>();
  return elegiveis.filter(preco => {
    const codigo = preco.codigo.trim();
    if (vistos.has(codigo)) return false;
    vistos.add(codigo);
    return true;
  });
}

export async function buscarPrecosAplicaveis(
  db: BancoContratosPreco,
  params: ConsultaPrecoAplicavel,
): Promise<PrecoAplicavel[]> {
  validarConsulta(params);
  const codigos = [...new Set(params.codigos.map(codigo => codigo.trim()).filter(Boolean))];
  if (!codigos.length) return [];
  const precos = await db.select({
    id: tabelasPreco.id,
    convenioId: tabelasPreco.convenioId,
    estabelecimentoId: tabelasPreco.estabelecimentoId,
    codigo: tabelasPreco.codigo,
    nome: tabelasPreco.nome,
    valor: tabelasPreco.valor,
    tipo: tabelasPreco.tipo,
    porte: tabelasPreco.porte,
    vigenciaInicio: tabelasPreco.vigenciaInicio,
    ativo: tabelasPreco.ativo,
  }).from(tabelasPreco).innerJoin(convenios, eq(convenios.id, tabelasPreco.convenioId)).where(and(
    eq(tabelasPreco.convenioId, params.convenioId),
    eq(convenios.ativo, "sim"),
    or(eq(convenios.estabelecimentoId, params.estabelecimentoId), isNull(convenios.estabelecimentoId)),
    or(eq(tabelasPreco.estabelecimentoId, params.estabelecimentoId), isNull(tabelasPreco.estabelecimentoId)),
    eq(tabelasPreco.ativo, "sim"),
    sql`DATE(${tabelasPreco.vigenciaInicio}) <= ${params.dataReferencia}`,
    inArray(tabelasPreco.codigo, codigos),
    sql`EXISTS (
      SELECT 1 FROM ${contratosConvenios}
      WHERE ${contratosConvenios.estabelecimentoId} = ${params.estabelecimentoId}
        AND ${contratosConvenios.convenioId} = ${params.convenioId}
        AND ${contratosConvenios.status} IN ('ativo', 'vencendo', 'renovado')
        AND (${contratosConvenios.dataInicio} IS NULL OR ${contratosConvenios.dataInicio} <= ${params.dataReferencia})
        AND (${contratosConvenios.dataFim} IS NULL OR ${contratosConvenios.dataFim} >= ${params.dataReferencia})
    )`,
  )).orderBy(
    sql`CASE WHEN ${tabelasPreco.estabelecimentoId} = ${params.estabelecimentoId} THEN 0 ELSE 1 END`,
    desc(tabelasPreco.vigenciaInicio),
    desc(tabelasPreco.id),
  );
  // Nenhum LIMIT antes da seleção: versões repetidas não podem ocultar códigos.
  return selecionarPrecosAplicaveis(precos, params);
}

export type ItemParaPreco = {
  convenioId?: unknown;
  dataExecucao?: unknown;
  codigoItem?: unknown;
  codigoItemTuss?: unknown;
};

/** Nunca usar o convênio/data do primeiro item para enriquecer os demais. */
export async function buscarPrecosPorItens(
  db: BancoContratosPreco,
  estabelecimentoId: number,
  itens: readonly ItemParaPreco[],
): Promise<Array<PrecoAplicavel | undefined>> {
  const grupos = new Map<string, { convenioId: number; dataReferencia: string; codigos: string[] }>();
  for (const item of itens) {
    const convenioId = Number(item.convenioId);
    const dataReferencia = normalizarDataExecucao(item.dataExecucao);
    if (!Number.isSafeInteger(convenioId) || convenioId <= 0 || !dataReferencia) continue;
    const chave = `${convenioId}:${dataReferencia}`;
    const grupo = grupos.get(chave) ?? { convenioId, dataReferencia, codigos: [] };
    grupo.codigos.push(...[item.codigoItem, item.codigoItemTuss].map(codigo => String(codigo ?? "").trim()).filter(Boolean));
    grupos.set(chave, grupo);
  }
  const precosPorGrupo = new Map<string, Map<string, PrecoAplicavel>>();
  for (const [chave, grupo] of grupos) {
    const precos = await buscarPrecosAplicaveis(db, { estabelecimentoId, ...grupo });
    precosPorGrupo.set(chave, new Map(precos.map(preco => [preco.codigo.trim(), preco])));
  }
  return itens.map(item => {
    const grupo = precosPorGrupo.get(`${Number(item.convenioId)}:${normalizarDataExecucao(item.dataExecucao)}`);
    return grupo?.get(String(item.codigoItem ?? "").trim()) ?? grupo?.get(String(item.codigoItemTuss ?? "").trim());
  });
}
