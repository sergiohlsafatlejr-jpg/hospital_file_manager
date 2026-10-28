import { sql } from "drizzle-orm";

/**
 * Verifica somente por catálogo se a estrutura física exigida pelo lote XML
 * está completa. O código novo pode ser publicado antes do DDL; nesse intervalo
 * deve falhar fechado, nunca consultar/escrever colunas ainda inexistentes.
 */
export async function estrutura0142Completa(db: {
  execute(query: unknown): Promise<unknown>;
}): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND (
        (table_name = 'conta_contexto_medico_fontes'
          AND column_name IN ('lote_importacao_id', 'versao_snapshot_hospitalar'))
        OR (table_name = 'contas_convenio_itens'
          AND column_name IN ('loteImportacaoId'))
        OR (table_name = 'contas_convenio_resumo'
          AND column_name IN ('arquivoHospitalId', 'loteImportacaoId'))
        OR (table_name = 'xml_importacao_lotes' AND column_name = 'id')
        OR (table_name = 'xml_importacao_itens' AND column_name = 'id')
      )
  `);
  const rows = ((result as unknown as Array<Array<{
    table_name?: unknown;
    column_name?: unknown;
  }>>)[0] ?? []);
  const campos = new Set(
    rows.flatMap(row => {
      const table = typeof row.table_name === "string" ? row.table_name : "";
      const column = typeof row.column_name === "string" ? row.column_name : "";
      return table && column ? [`${table}.${column}`] : [];
    })
  );
  return [
    "conta_contexto_medico_fontes.lote_importacao_id",
    "conta_contexto_medico_fontes.versao_snapshot_hospitalar",
    "contas_convenio_itens.loteImportacaoId",
    "contas_convenio_resumo.arquivoHospitalId",
    "contas_convenio_resumo.loteImportacaoId",
    "xml_importacao_lotes.id",
    "xml_importacao_itens.id",
  ].every(campo => campos.has(campo));
}
