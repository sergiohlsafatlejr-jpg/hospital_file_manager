import { describe, expect, it } from "vitest";
import { estrutura0142Completa } from "./schema0142Capabilities";

const camposCompletos = [
  ["conta_contexto_medico_fontes", "lote_importacao_id"],
  ["conta_contexto_medico_fontes", "versao_snapshot_hospitalar"],
  ["contas_convenio_itens", "loteImportacaoId"],
  ["contas_convenio_resumo", "arquivoHospitalId"],
  ["contas_convenio_resumo", "loteImportacaoId"],
  ["xml_importacao_lotes", "id"],
  ["xml_importacao_itens", "id"],
].map(([table_name, column_name]) => ({ table_name, column_name }));

function catalogo(rows: unknown[]) {
  return {
    execute: async () => [rows],
  };
}

describe("estrutura 0142", () => {
  it("mantém o fluxo novo pendente quando o catálogo pré-0142 não tem todas as colunas", async () => {
    await expect(
      estrutura0142Completa(catalogo(camposCompletos.slice(0, -1)))
    ).resolves.toBe(false);
  });

  it("habilita o fluxo coordenado somente com o contrato físico completo", async () => {
    await expect(estrutura0142Completa(catalogo(camposCompletos))).resolves.toBe(
      true
    );
  });
});
