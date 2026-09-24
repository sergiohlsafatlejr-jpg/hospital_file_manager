import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dbSource = readFileSync("server/db.ts", "utf8");
const routerSource = readFileSync("server/routers.ts", "utf8");
const digitacaoSource = readFileSync("server/routers/faturamentoDigitacaoRouter.ts", "utf8");
const comparacoesSource = readFileSync("client/src/pages/Comparacoes.tsx", "utf8");

describe("isolamento das tabelas de preço por estabelecimento", () => {
  it("exige estabelecimento na busca operacional e prioriza item específico sobre global", () => {
    expect(dbSource).toContain("export async function getPrecoItem(\n  convenioId: number,\n  estabelecimentoId: number");
    expect(dbSource).toContain("CASE WHEN ${tabelasPreco.estabelecimentoId} = ${estabelecimentoId} THEN 0 ELSE 1 END");
    expect(dbSource).toContain("escopoTabelaPrecoComFallbackGlobal");
    expect(dbSource).toContain("AND NOT EXISTS");
    expect(dbSource).toContain("tp_especifica.estabelecimentoId = ${estabelecimentoId}");
  });

  it("valida convênio e permissões específicas antes de ler ou alterar", () => {
    expect(routerSource).toContain('"visualizar",');
    expect(routerSource).toContain('"editar",');
    expect(routerSource).toContain('"excluir",');
    expect(routerSource).toContain('"gerenciar",');
    expect(routerSource).toContain("await exigirConvenioDoEstabelecimento(");
    expect(dbSource).toContain("Convênio informado não está disponível para este estabelecimento.");
  });

  it("protege também a busca de preço usada no faturamento digitado", () => {
    expect(digitacaoSource).toContain('buscarItemTabelaPreco: reportProcedure("tabelasPreco")');
    expect(digitacaoSource).toContain('obterPrecoItem: reportProcedure("tabelasPreco")');
    expect(digitacaoSource).toContain("estabelecimentoId: z.number().int().positive()");
    expect(digitacaoSource).toContain("input.estabelecimentoId,\n        input.codigo");
    expect(digitacaoSource).toContain("AND NOT EXISTS");
  });

  it("isola também a comparação automática pelo estabelecimento do arquivo", () => {
    expect(routerSource).toContain('compararComTabela: reportProcedure("tabelasPreco")');
    expect(routerSource).toContain("Arquivo pertence a outro estabelecimento");
    expect(dbSource).toContain("export async function compararComTabelaPrecos(arquivoId: number, estabelecimentoId: number)");
    expect(dbSource).toContain("eq(arquivos.estabelecimentoId, estabelecimentoId)");
    expect(dbSource).toContain("if (!precoMap.has(item.codigo))");
    expect(comparacoesSource).toContain("arquivoId,\n        estabelecimentoId,");
  });
});
