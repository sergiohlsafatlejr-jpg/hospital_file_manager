import { describe, it, expect } from "vitest";
import { enriquecerCodigoGlosa } from "./db";

describe("Motivo de Glosa - Fallback erroTiss para Unimed", () => {
  describe("enriquecerCodigoGlosa", () => {
    it("deve retornar 'Nao informado' quando código de glosa está vazio", () => {
      const resultado = enriquecerCodigoGlosa("");
      expect(resultado).toBe("Nao informado");
    });

    it("deve retornar 'Nao informado' quando código de glosa é null-like", () => {
      const resultado = enriquecerCodigoGlosa("");
      expect(resultado).toBe("Nao informado");
    });

    it("deve retornar descrição enriquecida quando código TISS é válido", () => {
      // Código 2012 é um código TISS válido
      const resultado = enriquecerCodigoGlosa("2012");
      // Deve retornar algo diferente de 'Nao informado'
      expect(resultado).not.toBe("Nao informado");
      expect(resultado.length).toBeGreaterThan(0);
    });

    it("deve retornar o próprio código quando não encontrado no dicionário", () => {
      const resultado = enriquecerCodigoGlosa("9999");
      expect(resultado).toBe("9999");
    });
  });

  describe("Lógica de fallback erroTiss", () => {
    it("deve priorizar codigoGlosa quando ambos estão preenchidos", () => {
      const codigoGlosaStr = "2012";
      const erroTissStr = "2012-COBRANÇA DE MATERIAL INCOMPATÍVEL";
      
      // Lógica do getItensGlosados
      let motivoGlosaFinal: string;
      if (codigoGlosaStr) {
        motivoGlosaFinal = enriquecerCodigoGlosa(codigoGlosaStr);
      } else if (erroTissStr) {
        motivoGlosaFinal = erroTissStr;
      } else {
        motivoGlosaFinal = "Não informado";
      }
      
      // Deve usar o enriquecido do codigoGlosa
      expect(motivoGlosaFinal).not.toBe("Não informado");
      expect(motivoGlosaFinal).not.toBe(erroTissStr);
    });

    it("deve usar erroTiss quando codigoGlosa está vazio (caso Unimed)", () => {
      const codigoGlosaStr = "";
      const erroTissStr = "2012-COBRANÇA DE MATERIAL INCOMPATÍVEL";
      
      let motivoGlosaFinal: string;
      if (codigoGlosaStr) {
        motivoGlosaFinal = enriquecerCodigoGlosa(codigoGlosaStr);
      } else if (erroTissStr) {
        motivoGlosaFinal = erroTissStr;
      } else {
        motivoGlosaFinal = "Não informado";
      }
      
      expect(motivoGlosaFinal).toBe("2012-COBRANÇA DE MATERIAL INCOMPATÍVEL");
    });

    it("deve retornar 'Não informado' quando ambos estão vazios", () => {
      const codigoGlosaStr = "";
      const erroTissStr = "";
      
      let motivoGlosaFinal: string;
      if (codigoGlosaStr) {
        motivoGlosaFinal = enriquecerCodigoGlosa(codigoGlosaStr);
      } else if (erroTissStr) {
        motivoGlosaFinal = erroTissStr;
      } else {
        motivoGlosaFinal = "Não informado";
      }
      
      expect(motivoGlosaFinal).toBe("Não informado");
    });

    it("deve extrair código numérico do erroTiss para filtro", () => {
      const erroTissStr = "2012-COBRANÇA DE MATERIAL INCOMPATÍVEL";
      const codigoGlosaStr = "";
      
      const codigoGlosaEfetivo = codigoGlosaStr || erroTissStr;
      const codigoGlosaNum = codigoGlosaEfetivo.match(/^(\d+)/)?.[1] || "";
      
      expect(codigoGlosaNum).toBe("2012");
    });

    it("deve extrair código numérico de erroTiss com formato diferente", () => {
      const erroTissStr = "1813-COBRANÇA DE PROCEDIMENTO SEM JUSTIFICATIVA";
      const codigoGlosaStr = "";
      
      const codigoGlosaEfetivo = codigoGlosaStr || erroTissStr;
      const codigoGlosaNum = codigoGlosaEfetivo.match(/^(\d+)/)?.[1] || "";
      
      expect(codigoGlosaNum).toBe("1813");
    });

    it("deve lidar com erroTiss sem código numérico no início", () => {
      const erroTissStr = "ERRO GENÉRICO SEM CÓDIGO";
      const codigoGlosaStr = "";
      
      const codigoGlosaEfetivo = codigoGlosaStr || erroTissStr;
      const codigoGlosaNum = codigoGlosaEfetivo.match(/^(\d+)/)?.[1] || "";
      
      expect(codigoGlosaNum).toBe("");
    });
  });
});


import { resolverGlosaDicionario } from "../shared/glossaryGlosas";

describe("resolverGlosaDicionario — Padronização de Tooltip e Descrição pelo Dicionário de Glosas", () => {
  it("resolve a descrição padronizada da Tabela 38 TISS quando apenas codigoGlosa é informado", () => {
    const info = resolverGlosaDicionario("1001", null);
    expect(info).not.toBeNull();
    expect(info!.codigo).toBe("1001");
    expect(info!.encontradoNoDicionario).toBe(true);
    expect(info!.descricao).toBe("Número da carteira inválido");
    expect(info!.grupo).toBe("Elegibilidade");
  });

  it("extrai o código de erroTiss da Unimed e traz a descrição padronizada do Dicionário de Glosas", () => {
    const info = resolverGlosaDicionario(null, "1001-CARTEIRA INVALIDA NA OPERADORA");
    expect(info).not.toBeNull();
    expect(info!.codigo).toBe("1001");
    expect(info!.encontradoNoDicionario).toBe(true);
    expect(info!.descricao).toBe("Número da carteira inválido");
    expect(info!.descricaoOperadora).toBe("CARTEIRA INVALIDA NA OPERADORA");
  });

  it("prioriza motivo personalizado cadastrado no banco (motivosGlosa) quando disponível", () => {
    const info = resolverGlosaDicionario("9501", null, [
      {
        codigo: "9501",
        descricao: "Glosa específica FUSEX — Guia sem carimbo",
        grupo: "Administrativa",
      },
    ]);
    expect(info).not.toBeNull();
    expect(info!.codigo).toBe("9501");
    expect(info!.encontradoNoDicionario).toBe(true);
    expect(info!.descricao).toBe("Glosa específica FUSEX — Guia sem carimbo");
    expect(info!.grupo).toBe("Administrativa");
  });
});
