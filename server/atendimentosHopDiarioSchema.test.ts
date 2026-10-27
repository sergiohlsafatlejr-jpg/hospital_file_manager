import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import {
  atendimentosHopDiarioControles,
  atendimentosHopDiarioExecucoes,
  atendimentosHopDiarioLotes,
} from "../drizzle/schema-atendimentos-hop-diario";

describe("schema atendimentos Hop diário", () => {
  it("define exatamente os três controles aditivos sem FKs externas", () => {
    const tables = [
      getTableConfig(atendimentosHopDiarioControles),
      getTableConfig(atendimentosHopDiarioLotes),
      getTableConfig(atendimentosHopDiarioExecucoes),
    ];
    expect(tables.map(table => table.name)).toEqual([
      "atendimentos_hop_controles",
      "atendimentos_hop_lotes",
      "atendimentos_hop_execucoes",
    ]);
    for (const table of tables) expect(table.foreignKeys).toHaveLength(0);
  });

  it("isola unidade, task UID e slot e não permite persistir PHI", () => {
    const controles = getTableConfig(atendimentosHopDiarioControles);
    const lotes = getTableConfig(atendimentosHopDiarioLotes);
    const execucoes = getTableConfig(atendimentosHopDiarioExecucoes);
    expect(controles.indexes.some(index => index.config.name === "uq_athop_controle_unidade")).toBe(true);
    expect(controles.indexes.some(index => index.config.name === "uq_athop_controle_task_uid")).toBe(true);
    expect(execucoes.indexes.some(index => index.config.name === "uq_athop_execucao_controle_slot")).toBe(true);
    expect(lotes.indexes.some(index => index.config.name === "uq_athop_lote_unidade_ref")).toBe(true);
    const names = tablesColumns([controles, lotes, execucoes]);
    expect(names).not.toEqual(expect.arrayContaining([
      "paciente", "nomepac", "matricula", "convenio", "conta", "valor", "codpac",
    ]));
    expect(names).toContain("producer_token_hash");
    expect(names).toContain("fingerprint_privado");
  });
});

function tablesColumns(tables: ReturnType<typeof getTableConfig>[]): string[] {
  return tables.flatMap(table => table.columns.map(column => column.name));
}
