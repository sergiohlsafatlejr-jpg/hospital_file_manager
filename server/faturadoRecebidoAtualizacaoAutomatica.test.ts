import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(resolve(process.cwd(), arquivo), "utf8");
const relatorio = ler("client/src/pages/FaturadoRecebidoUnificado.tsx");
const uploadXmlEnviado = ler("client/src/pages/Upload.tsx");
const uploadExcelRetorno = ler("client/src/pages/RecebimentosExcel.tsx");
const uploadXmlRetorno = ler("client/src/pages/RecebimentosXml.tsx");

describe("atualização automática do Faturado x Recebido", () => {
  it("sempre atualiza os dados ao abrir a página ou voltar para a aba", () => {
    expect(relatorio).toContain('refetchOnMount: "always"');
    expect(relatorio).toContain("refetchOnWindowFocus: true");
  });

  it("acompanha arquivos em processamento e atualiza ao concluir", () => {
    expect(relatorio).toContain("trpc.arquivos.processando.useQuery");
    expect(relatorio).toContain("setObservouProcessamento(true)");
    expect(relatorio).toContain("void query.refetch()");
    expect(relatorio).toContain("Importações concluídas e relatório atualizado.");
  });

  it("invalida o relatório nos três fluxos de importação", () => {
    const invalidacao = "utils.faturadoRecebidoUnificado.dados.invalidate()";
    expect(uploadXmlEnviado).toContain(invalidacao);
    expect(uploadExcelRetorno).toContain(invalidacao);
    expect(uploadXmlRetorno).toContain(invalidacao);
  });

  it("mostra na interface o estado da atualização automática", () => {
    expect(relatorio).toContain("Atualização automática ativa");
    expect(relatorio).toContain("arquivo(s) em processamento");
  });
});
