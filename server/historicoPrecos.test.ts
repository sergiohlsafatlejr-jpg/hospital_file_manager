import { describe, it, expect } from "vitest";
import * as db from "./db";

describe("Histórico de Preços", () => {
  describe("registrarHistoricoPreco", () => {
    it("deve ter a função registrarHistoricoPreco exportada", () => {
      expect(typeof db.registrarHistoricoPreco).toBe("function");
    });

    it("deve ter a função getHistoricoPreco exportada", () => {
      expect(typeof db.getHistoricoPreco).toBe("function");
    });

    it("deve ter a função getHistoricoPrecosPorConvenio exportada", () => {
      expect(typeof db.getHistoricoPrecosPorConvenio).toBe("function");
    });
  });

  describe("getHistoricoPreco", () => {
    it("deve retornar array vazio para item inexistente", async () => {
      const historico = await db.getHistoricoPreco(999999);
      expect(Array.isArray(historico)).toBe(true);
    });
  });

  describe("getHistoricoPrecosPorConvenio", () => {
    it("deve retornar objeto com items e total para convênio inexistente", async () => {
      const result = await db.getHistoricoPrecosPorConvenio(999999, 999999);
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.total).toBe(0);
    });

    it("deve aceitar filtros opcionais", async () => {
      const result = await db.getHistoricoPrecosPorConvenio(1, 1, {
        tipoAlteracao: "criacao",
        page: 1,
        limit: 10,
      });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
    });
  });
});
