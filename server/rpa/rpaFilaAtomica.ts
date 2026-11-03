import { and, eq } from "drizzle-orm";
import {
  estabelecimentos,
  filaEnvioXmlPortal,
  type InsertFilaEnvioXmlPortal,
} from "../../drizzle/schema";
import type { getDb } from "../db";
import { ESTABELECIMENTO_CENTRAL_SAFATLE } from "../hospitalScope";

type RpaDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type RpaFilaTransaction = Parameters<Parameters<RpaDatabase["transaction"]>[0]>[0];

/**
 * Todos os escritores da identidade hospital + convênio + hash devem usar esta
 * transação. O índice existente não é UNIQUE: a linha proprietária do hospital
 * serializa inclusive a primeira inserção, entre conexões/processos distintos.
 * Bytes/cloud devem ser preparados ANTES; somente metadados entram no callback.
 */
export async function inserirFilaXmlAtomica(
  db: RpaDatabase,
  valores: InsertFilaEnvioXmlPortal,
  persistirMetadados?: (tx: RpaFilaTransaction, filaId: number) => Promise<void>
) {
  if (
    !Number.isSafeInteger(valores.estabelecimentoId) ||
    valores.estabelecimentoId <= 0 ||
    valores.estabelecimentoId === ESTABELECIMENTO_CENTRAL_SAFATLE ||
    !Number.isSafeInteger(valores.convenioId) || valores.convenioId <= 0 ||
    !/^[a-f0-9]{64}$/i.test(valores.hashXml)
  ) {
    throw new Error("Identidade hospitalar do XML inválida para a fila RPA.");
  }

  return db.transaction(async (tx) => {
    const [hospital] = await tx
      .select({ id: estabelecimentos.id })
      .from(estabelecimentos)
      .where(eq(estabelecimentos.id, valores.estabelecimentoId))
      .limit(1)
      .for("update");
    if (!hospital) throw new Error("Hospital proprietário não encontrado para a fila RPA.");

    // Leitura com trava: não usar snapshot anterior à aquisição da âncora.
    // Não filtrar status, nomeArquivo ou usuário: erros também são a mesma identidade.
    const existentes = await tx
      .select()
      .from(filaEnvioXmlPortal)
      .where(and(
        eq(filaEnvioXmlPortal.estabelecimentoId, valores.estabelecimentoId),
        eq(filaEnvioXmlPortal.convenioId, valores.convenioId),
        eq(filaEnvioXmlPortal.hashXml, valores.hashXml)
      ))
      .orderBy(filaEnvioXmlPortal.id)
      .for("update");
    // Sem reparar legados: se já houver duplicatas, preferir a identidade que
    // exige reconciliação em vez de devolver um erro antigo como reenviável.
    const existente = existentes.find((item) =>
      ["PROCESSANDO_ROBO", "PROTOCOLADO", "AGUARDANDO_PORTAL"].includes(item.statusEsteira)
    ) || existentes[0];
    if (existente) {
      return {
        id: existente.id,
        numeroLote: existente.numeroLote,
        statusEsteira: existente.statusEsteira,
        reutilizado: true,
      };
    }

    const [inserido] = await tx.insert(filaEnvioXmlPortal).values(valores);
    const id = Number(inserido.insertId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID da fila RPA inválido.");
    // Metadados relacionados compartilham a mesma transação; falha faz rollback.
    if (persistirMetadados) await persistirMetadados(tx, id);
    return {
      id,
      numeroLote: valores.numeroLote,
      statusEsteira: valores.statusEsteira || "IMPORTADO",
      reutilizado: false,
    };
  });
}
