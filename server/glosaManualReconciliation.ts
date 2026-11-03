import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { glosaManualReconciliationSchema, MAX_ITENS_GLOSA_MANUAL, type GlosaManualReconciliationResult } from "../shared/glosaManualSubmission";

export type ConsultarStatusGlosaManualInput = {
  estabelecimentoId: number;
  idempotencyKey: string;
  /** Sempre obtido da sessão pelo router, jamais do input tRPC. */
  userId: number;
};
type Banco = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = Pick<Banco, "execute">;
type Linha = Record<string, unknown>;
function falhar(code: "BAD_REQUEST" | "FORBIDDEN" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}
const idValido = (value: unknown) => (typeof value === "number" || typeof value === "string") &&
  Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2_147_483_647;
async function linhas(tx: Executor, query: SQL): Promise<Linha[]> {
  const [rows] = await tx.execute(query);
  if (!Array.isArray(rows)) falhar("PRECONDITION_FAILED", "Resposta inesperada na reconciliação; revisão necessária");
  return rows as Linha[];
}

/** Consulta corrente sob o MESMO lock do escritor. Não escreve/exclui âncora,
 * não lê pacientes/guias/valores/IDs de itens e não executa sincronização.
 * nao_confirmado NÃO é autorização para abandonar a chave: o original pode
 * chegar ao lock depois desta consulta e ainda concluir o commit.
 */
export async function consultarStatusGlosaManual(params: ConsultarStatusGlosaManualInput): Promise<GlosaManualReconciliationResult> {
  const input = glosaManualReconciliationSchema.safeParse({
    estabelecimentoId: params.estabelecimentoId, idempotencyKey: params.idempotencyKey,
  });
  if (!input.success || typeof params.userId !== "number" || !idValido(params.userId)) {
    falhar("BAD_REQUEST", "Hospital, usuário e UUID válidos são obrigatórios");
  }
  const { estabelecimentoId, idempotencyKey } = input.data;
  const { userId } = params;
  const chaveHash = createHash("sha256").update(JSON.stringify([estabelecimentoId, idempotencyKey])).digest("hex");
  const prefixo = `manual-glosa:v1:${chaveHash}:`;
  const db = await getDb();
  if (!db) falhar("INTERNAL_SERVER_ERROR", "Banco indisponível; resultado não confirmado");
  return db.transaction(async tx => {
    const hospitais = await linhas(tx, sql`SELECT id, ativo FROM estabelecimentos WHERE id = ${estabelecimentoId} FOR UPDATE`);
    if (hospitais.length !== 1 || Number(hospitais[0].id) !== estabelecimentoId || hospitais[0].ativo !== "sim") {
      falhar("FORBIDDEN", "Estabelecimento indisponível");
    }
    const usuarios = await linhas(tx, sql`SELECT id, role FROM users WHERE id = ${userId} FOR UPDATE`);
    if (usuarios.length !== 1 || Number(usuarios[0].id) !== userId) falhar("FORBIDDEN", "Usuário não autorizado");
    // Admin é relido do banco dentro da transação, não confiado ao input/sessão.
    if (usuarios[0].role !== "admin") {
      const permissoes = await linhas(tx, sql`
        SELECT podeVisualizar, podeEditar, acessoDemonstrativo, acessoRecursos, acessoRecursosGlosa
        FROM permissoesEstabelecimento
        WHERE userId = ${userId} AND estabelecimentoId = ${estabelecimentoId} FOR UPDATE
      `);
      const p = permissoes[0];
      if (permissoes.length !== 1 || p.podeVisualizar !== "sim" || p.podeEditar !== "sim" ||
          p.acessoDemonstrativo !== "sim" || (p.acessoRecursos !== "sim" && p.acessoRecursosGlosa !== "sim")) {
        falhar("FORBIDDEN", "Sem permissão de edição de demonstrativos e recursos neste estabelecimento");
      }
    }
    const ancoras = await linhas(tx, sql`
      SELECT id, nome, estabelecimentoId, userId, totalItens, itensProcessados,
        tipoArquivo, direcao, tamanho, progresso, s3Key, s3Url, status
      FROM arquivos WHERE estabelecimentoId = ${estabelecimentoId}
        AND userId = ${userId} AND nome LIKE ${`${prefixo}%`} FOR UPDATE
    `);
    if (ancoras.length === 0) return { status: "nao_confirmado" };
    if (ancoras.length !== 1) falhar("PRECONDITION_FAILED", "Âncora manual ambígua; revisão responsável necessária");
    const a = ancoras[0];
    const marcador = typeof a.nome === "string" ? /^manual-glosa:v1:([a-f0-9]{64}):([a-f0-9]{64}):(\d{4}-\d{2}-\d{2})$/.exec(a.nome) : null;
    const dataPagamento = marcador?.[3];
    const parsed = dataPagamento ? new Date(`${dataPagamento}T12:00:00.000Z`) : null;
    const total = Number(a.totalItens);
    if (!marcador || marcador[1] !== chaveHash || !dataPagamento || dataPagamento < "1000-01-01" ||
        !parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dataPagamento ||
        !idValido(a.id) || Number(a.estabelecimentoId) !== estabelecimentoId || Number(a.userId) !== userId ||
        a.status !== "processado" || a.s3Key !== "" || a.s3Url !== "" || a.tipoArquivo !== "txt" ||
        a.direcao !== "retornado" || Number(a.tamanho) !== 0 || Number(a.progresso) !== 100 ||
        !Number.isSafeInteger(total) || total < 1 || total > MAX_ITENS_GLOSA_MANUAL || Number(a.itensProcessados) !== total) {
      falhar("PRECONDITION_FAILED", "Âncora manual inconsistente; revisão responsável necessária");
    }
    return { status: "concluido", totalInseridos: total, dataPagamento, competencia: dataPagamento.slice(0, 7) };
  });
}
