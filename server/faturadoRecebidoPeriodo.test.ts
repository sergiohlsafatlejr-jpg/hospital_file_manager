import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(resolve(process.cwd(), arquivo), "utf8");
const router = ler("server/routers/faturadoRecebidoUnificadoRouter.ts");
const tela = ler("client/src/pages/FaturadoRecebidoUnificado.tsx");

describe("período do Faturado x Recebido", () => {
  it("usa mês do pagamento como padrão e mantém competência do faturamento como alternativa", () => {
    expect(router).toContain('z.enum(["PAGAMENTO", "FATURAMENTO"]).default("PAGAMENTO")');
    expect(router).toContain('input.criterioPeriodo === "PAGAMENTO"');
    expect(router).toContain('"d.mes_pagamento"');
    expect(router).toContain('"COALESCE(d.competencia_faturada,d.competencia_informada)"');
  });

  it("não elimina o retorno sem vínculo e mede sua cobertura", () => {
    expect(router).toContain("LEFT JOIN vinculos_elegiveis v ON v.demonstrativo_id = d.id");
    expect(router).toContain("AS status_vinculo");
    expect(router).toContain("AS recebido_sem_vinculo");
    expect(router).not.toContain("pares_faturados AS");
  });

  it("aceita aliases somente quando aprendidos de itens já vinculados ao faturamento próprio", () => {
    expect(router).toContain("aliases_prestador_vinculados AS");
    expect(router).toContain("a.quantidade_contas=1");
    expect(router).toContain("alias_match.codigoPrestador IN");
  });

  it("exige conta única e faz a identificação de terceiro prevalecer sobre o vínculo", () => {
    expect(router).toContain("COUNT(DISTINCT f.conta_chave) AS quantidade_contas");
    expect(router).toContain("prestadores_terceiros AS");
    expect(router).toContain("cep_terceiro.tipoPrestador = 'terceiro'");
    expect(router).toContain("WHERE d.estabelecimentoId = ?\n            AND NOT EXISTS (\n              SELECT 1 FROM prestadores_terceiros pt");
    expect(router).toContain("cep_terceiro.estabelecimentoId=fe.estabelecimento_id");
    expect(router).not.toContain("cep_terceiro.ativo");
    expect(router).toContain("SELECT convenioId, codigoPrestador FROM prestadores_configurados WHERE tipoPrestador='terceiro'");
    expect(router).not.toContain("WHERE tipoPrestador='terceiro' AND ativo='sim'");
  });

  it("usa o recurso do demonstrativo como fonte principal e o legado apenas como fallback", () => {
    expect(router).toContain("retornos_glosados_periodo AS");
    expect(router).toContain("d.recurso_status IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido')");
    expect(router).toContain("COALESCE(vl.possui_recurso_novo,0)=0");
    expect(router).toContain("MIN(d.competencia_recurso) AS competencia");
  });

  it("mostra o seletor sem expor o diagnóstico técnico de vínculo na visão financeira", () => {
    expect(tela).toContain("Organizar recebido por");
    expect(tela).toContain("Mês do pagamento");
    expect(tela).toContain("Competência do faturamento");
    expect(tela).not.toContain('label="Sem vínculo"');
    expect(tela).not.toContain(">Sem vínculo</th>");
    expect(tela).not.toContain('"Recebido sem vínculo"');
    expect(router).not.toContain("sem vínculo");
    expect(tela).toContain("O recebido inclui todos os valores informados pela operadora para a unidade");
    expect(router).toContain("a correspondência técnica com uma conta é mantida somente para auditoria interna e não altera o total recebido");
  });

  it("mostra e exporta separadamente a glosa recursada", () => {
    expect(tela).toContain('label="Glosa recursada"');
    expect(tela).toContain('>Recursada</th>');
    expect(tela).toContain('["Glosa recursada", data.resumo.glosaRecursada]');
    expect(tela).toContain('"Glosa recursada": row.glosaRecursada');
  });
});
