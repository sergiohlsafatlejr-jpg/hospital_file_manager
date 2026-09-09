import { describe, expect, it } from "vitest";
import {
  montarPagamentosBiTasy,
  montarPrevisaoRecebimentosTasy,
  normalizarMesTasy,
} from "./tasyPrevisaoRecebimentosService";

describe("contratos da previsão de recebimentos TASY", () => {
  it("normaliza competências em formatos usados nas importações", () => {
    expect(normalizarMesTasy("2026-09-30")).toBe("2026-09");
    expect(normalizarMesTasy("09/2026")).toBe("2026-09");
    expect(normalizarMesTasy(null)).toBeNull();
  });

  it("calcula faturado, projetado e sem vencimento sem duplicar a mesma conta", () => {
    const resultado = montarPrevisaoRecebimentosTasy([
      { chave: "conta-1", protocolo: "prot-1", convenio: "Unimed", mesReferencia: "2026-08", mesVencimento: "2026-09", valor: 100 },
      { chave: "conta-1", protocolo: "prot-1", convenio: "Unimed", mesReferencia: "2026-08", mesVencimento: "2026-09", valor: 100 },
      { chave: "conta-2", protocolo: "prot-2", convenio: "Unimed", mesReferencia: "08/2026", mesVencimento: null, valor: 50 },
      { chave: "conta-3", protocolo: "prot-3", convenio: "Vivacom", mesReferencia: "2026-09", mesVencimento: "2026-10", valor: 80 },
    ]);

    expect(resultado.resumo).toEqual({
      totalFaturado: 230,
      totalProjetado: 180,
      totalSemVencimento: 50,
      qtdProtocolos: 3,
    });
    expect(resultado.porMesVencimento).toEqual([
      { mes: "2026-09", valor: 100, qtd: 1 },
      { mes: "2026-10", valor: 80, qtd: 1 },
    ]);
    expect(resultado.porConvenio[0]).toMatchObject({ convenio: "Unimed", valorRef: 150, valorProj: 100, qtd: 2 });
  });

  it("consolida recebido, vinculado e saldo pendente por mês e convênio", () => {
    const resultado = montarPagamentosBiTasy([
      { estabelecimento: "Hospital A", convenio: "Unimed", mes: "2026-08", recebido: 100, vinculado: 80 },
      { estabelecimento: "Hospital A", convenio: "Unimed", mes: "08/2026", recebido: 50, vinculado: 60 },
      { estabelecimento: "Hospital A", convenio: "Vivacom", mes: "2026-09", recebido: 200, vinculado: 150 },
    ]);

    expect(resultado.resumo).toEqual({ totalRecebido: 350, totalVinculado: 290, totalAVincular: 70 });
    expect(resultado.porMes[0]).toMatchObject({ mes: "2026-08", recebido: 150, vinculado: 140, a_vincular: 20 });
    expect(resultado.pagamentosPorConvenio).toHaveLength(2);
  });
});
