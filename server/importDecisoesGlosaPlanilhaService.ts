/**
 * Importação de decisões de glosa (aceitar / recursar) a partir de planilha Excel
 * de consultoria (ex.: aba "8. Oportunidades Pendentes").
 *
 * Regras de negócio:
 *  - Coluna "VAMOS RECURSAR? (Sim / Não / Avaliar)":
 *      Sim     -> classificação "recursar"
 *      Não     -> classificação "aceitar" (Glosa Aceita)
 *      Avaliar / vazio -> ignorado (permanece como está no portal)
 *  - Coluna "Justificativa / Orientação para Recurso" -> justificativa gravada no item
 *    (classificacaoMotivo e, quando aceita, motivoAceite).
 *
 * O vínculo com o item glosado do portal (tabela demonstrativo) é feito por:
 *   Guia (operadora OU prestador) + Código do item (obrigatórios)
 *   Protocolo (quando ambos possuem, precisa ser igual), Seq. do item e Valor glosado
 *   são usados para desempate / pontuação.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { decisoesGlosa, demonstrativo } from "../drizzle/schema";

export type DecisaoPlanilha = "aceitar" | "recursar";

export interface LinhaDecisaoPlanilha {
  /** Linha original na planilha (1-based), apenas para relatório */
  linha: number;
  decisao: string;
  protocolo?: string | null;
  guiaPrestador?: string | null;
  guiaOperadora?: string | null;
  sequencialItem?: string | number | null;
  codigoItem?: string | null;
  descricaoItem?: string | null;
  valorGlosa?: string | number | null;
  justificativa?: string | null;
}

export interface CandidatoDemonstrativo {
  id: number;
  protocolo: string | null;
  numeroGuia: string | null;
  sequencialItem: number | null;
  codigoItem: string | null;
  valorGlosa: string | number | null;
}

export type StatusCasamento = "casado" | "nao_encontrado" | "decisao_invalida";

export interface ResultadoCasamento {
  linha: number;
  status: StatusCasamento;
  decisao: DecisaoPlanilha | null;
  demonstrativoId: number | null;
  pontuacao: number;
  detalhe: string;
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Sim -> recursar, Não -> aceitar; qualquer outro valor -> null (ignorar). */
export function normalizarDecisaoPlanilha(valor: unknown): DecisaoPlanilha | null {
  const v = s(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (v === "sim" || v === "s") return "recursar";
  if (v === "nao" || v === "n") return "aceitar";
  return null;
}

/** Normaliza identificadores numéricos (guia, protocolo, código): só alfanuméricos, sem zeros à esquerda. */
export function normalizarIdentificador(valor: unknown): string {
  return s(valor)
    .replace(/[^0-9a-zA-Z]/g, "")
    .replace(/^0+(?=.)/, "")
    .toUpperCase();
}

function paraNumero(valor: unknown): number | null {
  const t = s(valor);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Casa as linhas da planilha com os itens glosados do portal.
 * Cada item do portal é usado no máximo uma vez (linhas duplicadas na planilha
 * consomem itens duplicados no portal na ordem de melhor pontuação).
 */
export function casarDecisoesComDemonstrativo(
  linhas: LinhaDecisaoPlanilha[],
  candidatos: CandidatoDemonstrativo[],
): ResultadoCasamento[] {
  // Indexa candidatos por guia normalizada + código normalizado
  const indice = new Map<string, CandidatoDemonstrativo[]>();
  for (const c of candidatos) {
    const chave = `${normalizarIdentificador(c.numeroGuia)}|${normalizarIdentificador(c.codigoItem)}`;
    const lista = indice.get(chave);
    if (lista) lista.push(c);
    else indice.set(chave, [c]);
  }

  const consumidos = new Set<number>();
  return linhas.map((linha): ResultadoCasamento => {
    const decisao = normalizarDecisaoPlanilha(linha.decisao);
    const base = { linha: linha.linha, decisao, demonstrativoId: null, pontuacao: 0 };
    if (!decisao) {
      return { ...base, status: "decisao_invalida", detalhe: `Decisão "${s(linha.decisao)}" ignorada (use Sim ou Não)` };
    }

    const codigo = normalizarIdentificador(linha.codigoItem);
    const guias = Array.from(
      new Set([normalizarIdentificador(linha.guiaOperadora), normalizarIdentificador(linha.guiaPrestador)].filter(Boolean)),
    );
    if (!codigo || guias.length === 0) {
      return { ...base, status: "nao_encontrado", detalhe: "Linha sem guia ou código do item" };
    }

    const protocolo = normalizarIdentificador(linha.protocolo);
    const seq = paraNumero(linha.sequencialItem);
    const valor = paraNumero(linha.valorGlosa);

    let melhor: CandidatoDemonstrativo | null = null;
    let melhorPontuacao = -1;
    for (const guia of guias) {
      for (const c of indice.get(`${guia}|${codigo}`) || []) {
        if (consumidos.has(c.id)) continue;
        const protocoloCand = normalizarIdentificador(c.protocolo);
        if (protocolo && protocoloCand && protocolo !== protocoloCand) continue;
        let pontos = 1;
        if (protocolo && protocoloCand) pontos += 4;
        const valorCand = paraNumero(c.valorGlosa);
        if (valor !== null && valorCand !== null && Math.abs(valor - valorCand) < 0.01) pontos += 3;
        if (seq !== null && c.sequencialItem !== null && Number(c.sequencialItem) === seq) pontos += 2;
        if (pontos > melhorPontuacao || (pontos === melhorPontuacao && melhor && c.id < melhor.id)) {
          melhor = c;
          melhorPontuacao = pontos;
        }
      }
    }

    if (!melhor) {
      return { ...base, status: "nao_encontrado", detalhe: "Item glosado não localizado no portal (guia + código)" };
    }
    consumidos.add(melhor.id);
    return {
      ...base,
      status: "casado",
      demonstrativoId: melhor.id,
      pontuacao: melhorPontuacao,
      detalhe: melhorPontuacao >= 8 ? "Vínculo exato" : melhorPontuacao >= 4 ? "Vínculo provável" : "Vínculo por guia + código",
    };
  });
}

export interface ImportarDecisoesInput {
  estabelecimentoId: number;
  convenioId?: number;
  linhas: LinhaDecisaoPlanilha[];
  aplicar: boolean;
  userId: number;
}

export interface ImportarDecisoesResultado {
  totalLinhas: number;
  casados: number;
  naoEncontrados: number;
  ignorados: number;
  aRecursar: number;
  aAceitar: number;
  aplicados: number;
  resultados: Array<ResultadoCasamento & { codigoItem: string; guia: string; descricaoItem: string; classificacaoAtual: string | null }>;
}

const TAMANHO_LOTE = 500;

export async function importarDecisoesGlosaPlanilha(input: ImportarDecisoesInput): Promise<ImportarDecisoesResultado> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  // Busca candidatos pelas guias presentes na planilha (valores originais e normalizados)
  const guias = new Set<string>();
  for (const l of input.linhas) {
    for (const g of [l.guiaOperadora, l.guiaPrestador]) {
      const t = s(g);
      if (t) {
        guias.add(t);
        guias.add(normalizarIdentificador(t));
      }
    }
  }
  const listaGuias = Array.from(guias).filter(Boolean);

  type Linha = CandidatoDemonstrativo & {
    convenioId: number | null; codigoGlosa: string | null; tipoLancamento: string | null; classificacaoGlosa: string | null;
  };
  const candidatos: Linha[] = [];
  for (let i = 0; i < listaGuias.length; i += TAMANHO_LOTE) {
    const lote = listaGuias.slice(i, i + TAMANHO_LOTE);
    const condicoes = [
      eq(demonstrativo.estabelecimentoId, input.estabelecimentoId),
      inArray(demonstrativo.numeroGuia, lote),
      sql`COALESCE(${demonstrativo.valorGlosa}, 0) > 0`,
    ];
    if (input.convenioId) condicoes.push(eq(demonstrativo.convenioId, input.convenioId));
    const rows = await db
      .select({
        id: demonstrativo.id,
        protocolo: demonstrativo.protocolo,
        numeroGuia: demonstrativo.numeroGuia,
        sequencialItem: demonstrativo.sequencialItem,
        codigoItem: demonstrativo.codigoItem,
        valorGlosa: demonstrativo.valorGlosa,
        convenioId: demonstrativo.convenioId,
        codigoGlosa: demonstrativo.codigoGlosa,
        tipoLancamento: demonstrativo.tipoLancamento,
        classificacaoGlosa: demonstrativo.classificacaoGlosa,
      })
      .from(demonstrativo)
      .where(and(...condicoes));
    candidatos.push(...rows);
  }
  // Ordem estável para o desempate por id
  candidatos.sort((a, b) => a.id - b.id);
  const porId = new Map(candidatos.map((c) => [c.id, c]));

  const casamentos = casarDecisoesComDemonstrativo(input.linhas, candidatos);
  const linhaPorNumero = new Map(input.linhas.map((l) => [l.linha, l]));

  let aplicados = 0;
  if (input.aplicar) {
    for (const r of casamentos) {
      if (r.status !== "casado" || !r.demonstrativoId || !r.decisao) continue;
      const item = porId.get(r.demonstrativoId)!;
      const justificativa = s(linhaPorNumero.get(r.linha)?.justificativa) || null;
      const motivo = justificativa || (r.decisao === "aceitar" ? "Glosa aceita (importado da planilha)" : "Recursar (importado da planilha)");
      await db
        .update(demonstrativo)
        .set({
          classificacaoGlosa: r.decisao,
          classificacaoConfianca: 100,
          classificacaoMotivo: motivo,
          motivoAceite: r.decisao === "aceitar" ? motivo : null,
          dataAceite: r.decisao === "aceitar" ? new Date() : null,
        })
        .where(eq(demonstrativo.id, item.id));
      await db.insert(decisoesGlosa).values({
        convenioId: item.convenioId || 0,
        codigoGlosa: (s(item.codigoGlosa).match(/^(\d+)/)?.[1] || "0000").slice(0, 20),
        codigoProcedimento: s(item.codigoItem).slice(0, 50) || null,
        tipoProcedimento: item.tipoLancamento ? s(item.tipoLancamento).slice(0, 50) : null,
        decisao: r.decisao,
        valorGlosado: item.valorGlosa !== null && item.valorGlosa !== undefined ? String(item.valorGlosa) : undefined,
        motivoDecisao: motivo,
        procedimentoId: item.id,
        userId: input.userId,
      });
      aplicados++;
    }
  }

  const resultados = casamentos.map((r) => {
    const l = linhaPorNumero.get(r.linha);
    const item = r.demonstrativoId ? porId.get(r.demonstrativoId) : undefined;
    return {
      ...r,
      codigoItem: s(l?.codigoItem),
      guia: s(l?.guiaOperadora) || s(l?.guiaPrestador),
      descricaoItem: s(l?.descricaoItem),
      classificacaoAtual: item ? item.classificacaoGlosa ?? "pendente" : null,
    };
  });

  const casados = casamentos.filter((r) => r.status === "casado");
  return {
    totalLinhas: input.linhas.length,
    casados: casados.length,
    naoEncontrados: casamentos.filter((r) => r.status === "nao_encontrado").length,
    ignorados: casamentos.filter((r) => r.status === "decisao_invalida").length,
    aRecursar: casados.filter((r) => r.decisao === "recursar").length,
    aAceitar: casados.filter((r) => r.decisao === "aceitar").length,
    aplicados,
    resultados,
  };
}
