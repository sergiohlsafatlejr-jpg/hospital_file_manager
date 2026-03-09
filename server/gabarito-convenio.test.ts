import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Testes para validar que o campo convenioId é aceito nos endpoints de gabarito
 */

// Schema do criarGabarito (espelho do backend)
const criarGabaritoSchema = z.object({
  estabelecimentoId: z.number(),
  convenioId: z.number().optional(),
  setor: z.string().optional(),
  codigoProcedimentoPrincipal: z.string(),
  descricaoProcedimentoPrincipal: z.string(),
  itensAssociados: z.array(z.object({
    codigo: z.string(),
    descricao: z.string(),
    tipo: z.string().optional(),
    frequencia: z.number().default(100),
    quantidadeMedia: z.number(),
    quantidadeMin: z.number().optional(),
    quantidadeMax: z.number().optional(),
    valorMedio: z.number().optional(),
  })),
  observacoes: z.string().optional(),
});

// Schema do editarPadrao (espelho do backend)
const editarPadraoSchema = z.object({
  id: z.number(),
  convenioId: z.number().nullable().optional(),
  itensAssociados: z.array(z.object({
    codigo: z.string(),
    descricao: z.string(),
    tipo: z.string().optional(),
    frequencia: z.number(),
    quantidadeMedia: z.number(),
    quantidadeMin: z.number().optional(),
    quantidadeMax: z.number().optional(),
    valorMedio: z.number().optional(),
  })),
  observacoes: z.string().optional(),
});

describe("Gabarito - Campo Convênio", () => {
  describe("criarGabarito schema", () => {
    it("deve aceitar input sem convenioId (todos os convênios)", () => {
      const input = {
        estabelecimentoId: 1,
        codigoProcedimentoPrincipal: "31003079",
        descricaoProcedimentoPrincipal: "COLECISTECTOMIA",
        itensAssociados: [
          { codigo: "MAT001", descricao: "Bisturi", frequencia: 100, quantidadeMedia: 1 },
        ],
      };
      const result = criarGabaritoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convenioId).toBeUndefined();
      }
    });

    it("deve aceitar input com convenioId numérico", () => {
      const input = {
        estabelecimentoId: 1,
        convenioId: 5,
        codigoProcedimentoPrincipal: "31003079",
        descricaoProcedimentoPrincipal: "COLECISTECTOMIA",
        itensAssociados: [
          { codigo: "MAT001", descricao: "Bisturi", frequencia: 100, quantidadeMedia: 1 },
        ],
      };
      const result = criarGabaritoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convenioId).toBe(5);
      }
    });

    it("deve rejeitar convenioId como string", () => {
      const input = {
        estabelecimentoId: 1,
        convenioId: "abc",
        codigoProcedimentoPrincipal: "31003079",
        descricaoProcedimentoPrincipal: "COLECISTECTOMIA",
        itensAssociados: [],
      };
      const result = criarGabaritoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("editarPadrao schema", () => {
    it("deve aceitar input sem convenioId (não alterar)", () => {
      const input = {
        id: 1,
        itensAssociados: [
          { codigo: "MAT001", descricao: "Bisturi", frequencia: 100, quantidadeMedia: 1 },
        ],
      };
      const result = editarPadraoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convenioId).toBeUndefined();
      }
    });

    it("deve aceitar convenioId numérico para vincular convênio", () => {
      const input = {
        id: 1,
        convenioId: 3,
        itensAssociados: [
          { codigo: "MAT001", descricao: "Bisturi", frequencia: 100, quantidadeMedia: 1 },
        ],
      };
      const result = editarPadraoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convenioId).toBe(3);
      }
    });

    it("deve aceitar convenioId null para desvincular convênio", () => {
      const input = {
        id: 1,
        convenioId: null,
        itensAssociados: [
          { codigo: "MAT001", descricao: "Bisturi", frequencia: 100, quantidadeMedia: 1 },
        ],
      };
      const result = editarPadraoSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.convenioId).toBeNull();
      }
    });
  });

  describe("Lógica de set convenioId no update", () => {
    it("deve incluir convenioId no set quando fornecido como número", () => {
      const input = { convenioId: 5 };
      const setObj: Record<string, any> = {};
      if (input.convenioId !== undefined) {
        setObj.convenioId = input.convenioId || null;
      }
      expect(setObj.convenioId).toBe(5);
    });

    it("deve incluir null no set quando convenioId é null (desvincular)", () => {
      const input = { convenioId: null as number | null };
      const setObj: Record<string, any> = {};
      if (input.convenioId !== undefined) {
        setObj.convenioId = input.convenioId || null;
      }
      expect(setObj.convenioId).toBeNull();
    });

    it("não deve incluir convenioId no set quando não fornecido", () => {
      const input = {} as { convenioId?: number | null };
      const setObj: Record<string, any> = {};
      if (input.convenioId !== undefined) {
        setObj.convenioId = input.convenioId || null;
      }
      expect(setObj.convenioId).toBeUndefined();
    });
  });
});
