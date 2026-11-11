/**
 * Contrato físico existente: recursos_glosa_justificativas possui conciliadoId,
 * justificativa e id autoincremental; não possui hospital/convênio/origem próprios.
 * O ownership vem exclusivamente da PK de conciliados_automatico (alias ca),
 * nunca de um ID de demonstrativo, guia, procedimento ou recebimento.
 *
 * Subconsulta escalar: não multiplica itens/valores. A constraint legada espera
 * uma linha por conciliadoId; em duplicatas legadas, a versão de maior id vence
 * deterministicamente (não a data, que pode empatar). Não busca texto antigo se
 * a versão escolhida estiver vazia. Ausência/incompatibilidade física propaga
 * erro de leitura, sem ensure/DDL ou escrita.
 */
export function projetarJustificativaConciliacaoIssue182(
  estabelecimentoId: number,
  convenioId?: number,
): string {
  if (
    !Number.isSafeInteger(estabelecimentoId) || estabelecimentoId <= 0 ||
    (convenioId !== undefined && (!Number.isSafeInteger(convenioId) || convenioId <= 0))
  ) {
    throw new Error("Escopo da fundamentação de conciliação indisponível.");
  }
  return `(SELECT rj.justificativa
    FROM recursos_glosa_justificativas rj
    WHERE rj.conciliadoId = ca.id
      AND ca.estabelecimentoId = ${estabelecimentoId}
      AND ca.convenioId IS NOT NULL
      ${convenioId === undefined ? "" : `AND ca.convenioId = ${convenioId}`}
      AND rj.id = (
        SELECT MAX(rjv.id)
        FROM recursos_glosa_justificativas rjv
        WHERE rjv.conciliadoId = ca.id
      ))`;
}

/** Falha fechada sem descartar itens legítimos ou devolver fundamentação vazia. */
export function exigirJustificativasConciliacaoIssue182(
  itens: unknown,
  campo: "justificativa" | "justificativaRecurso",
): void {
  if (!Array.isArray(itens)) throw new Error("Fundamentação persistida de conciliação indisponível.");
  for (const item of itens) {
    if (!item || typeof item !== "object" || typeof item[campo] !== "string" || !item[campo].trim()) {
      throw new Error("Fundamentação persistida de conciliação indisponível.");
    }
  }
}
