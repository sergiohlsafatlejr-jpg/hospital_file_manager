import { describe, expect, it } from "vitest";
import { easyLocalCriarTabela } from "../shared/easyLocalIntegrador";
import { ddlEasyLocalTabela } from "./easyLocalIntegradorService";

describe("coluna de negócio id", () => {
  it("preserva id da origem sem substituir a chave técnica _id", () => {
    const t = easyLocalCriarTabela.parse({
      estabelecimentoId: 12,
      nome: "origem",
      nomeExibicao: "Origem sintética",
      confirmarCriacao: true,
      colunas: [{ nome: "id", tipo: "bigint", obrigatorio: true }],
    });
    const ddl = ddlEasyLocalTabela(t);
    expect(ddl).toContain("`_id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY");
    expect(ddl).toContain("`id` BIGINT NOT NULL");
    expect(
      easyLocalCriarTabela.safeParse({
        ...t,
        colunas: [{ nome: "_id", tipo: "bigint", obrigatorio: true }],
      }).success
    ).toBe(false);
  });
});
