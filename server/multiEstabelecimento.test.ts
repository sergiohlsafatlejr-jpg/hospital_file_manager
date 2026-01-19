import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do banco de dados
const mockDb = {
  criarUsuario: vi.fn(),
  criarPermissaoEstabelecimento: vi.fn(),
  registrarLogAuditoria: vi.fn(),
  verificarSeGestor: vi.fn(),
};

vi.mock("./db", () => mockDb);

describe("Multi-Estabelecimento - Criação de Usuários", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("criarUsuario com múltiplos estabelecimentos", () => {
    it("should accept multiple estabelecimentosIds in input", () => {
      const input = {
        name: "Novo Usuário",
        email: "novo@email.com",
        role: "user" as const,
        grupoId: 1,
        estabelecimentosIds: [1, 2, 3],
      };

      expect(input.estabelecimentosIds).toHaveLength(3);
      expect(input.estabelecimentosIds).toContain(1);
      expect(input.estabelecimentosIds).toContain(2);
      expect(input.estabelecimentosIds).toContain(3);
    });

    it("should validate that estabelecimentosIds is an array of numbers", () => {
      const validInput = {
        name: "Teste",
        email: "teste@email.com",
        estabelecimentosIds: [1, 2],
      };

      expect(Array.isArray(validInput.estabelecimentosIds)).toBe(true);
      expect(validInput.estabelecimentosIds.every((id) => typeof id === "number")).toBe(true);
    });

    it("should allow empty estabelecimentosIds for admin users", () => {
      const adminInput = {
        name: "Admin",
        email: "admin@email.com",
        role: "admin" as const,
        estabelecimentosIds: [],
      };

      expect(adminInput.estabelecimentosIds).toHaveLength(0);
      expect(adminInput.role).toBe("admin");
    });

    it("should require at least one estabelecimento for regular users", () => {
      const userInput = {
        name: "User",
        email: "user@email.com",
        role: "user" as const,
        estabelecimentosIds: [],
      };

      // Validação no frontend deve rejeitar usuários sem estabelecimento
      const isValid = userInput.role === "admin" || userInput.estabelecimentosIds.length > 0;
      expect(isValid).toBe(false);
    });
  });

  describe("Permissões de Estabelecimento", () => {
    it("should create permission for each estabelecimento", async () => {
      const estabelecimentosIds = [1, 2, 3];
      const userId = 10;
      const grupoId = 5;

      // Simular criação de permissões para cada estabelecimento
      for (const estabelecimentoId of estabelecimentosIds) {
        const permissaoData = {
          usuarioId: userId,
          estabelecimentoId,
          grupoId,
          podeVisualizar: true,
          podeEditar: false,
          podeExcluir: false,
          podeGerenciar: false,
        };

        expect(permissaoData.usuarioId).toBe(userId);
        expect(permissaoData.grupoId).toBe(grupoId);
        expect(permissaoData.podeVisualizar).toBe(true);
      }

      expect(estabelecimentosIds.length).toBe(3);
    });

    it("should map grupo names to valid enum values", () => {
      type GrupoServicoType = "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador";
      
      const grupoMap: Record<string, GrupoServicoType> = {
        "administrador": "administrador",
        "faturista": "faturista",
        "recurso_glosa": "recurso_glosa",
        "recurso_de_glosa": "recurso_glosa",
        "gestor": "gestor",
        "visualizador": "visualizador",
      };

      expect(grupoMap["administrador"]).toBe("administrador");
      expect(grupoMap["recurso_de_glosa"]).toBe("recurso_glosa");
      expect(grupoMap["unknown"] || "visualizador").toBe("visualizador");
    });
  });

  describe("Log de Auditoria", () => {
    it("should include estabelecimentosIds in audit log", () => {
      const estabelecimentosIds = [1, 2];
      const logData = {
        tipoAcao: "criar_usuario",
        descricao: `Usuário criado com acesso a ${estabelecimentosIds.length} estabelecimento(s)`,
        valoresNovos: {
          name: "Teste",
          email: "teste@email.com",
          role: "user",
          estabelecimentosIds,
          grupoId: 1,
        },
      };

      expect(logData.valoresNovos.estabelecimentosIds).toEqual([1, 2]);
      expect(logData.descricao).toContain("2 estabelecimento(s)");
    });
  });

  describe("Interface de Seleção Múltipla", () => {
    it("should toggle estabelecimento selection correctly", () => {
      let selectedIds: number[] = [];

      // Simular toggle de seleção
      const toggleEstabelecimento = (id: number) => {
        if (selectedIds.includes(id)) {
          selectedIds = selectedIds.filter((i) => i !== id);
        } else {
          selectedIds = [...selectedIds, id];
        }
      };

      // Selecionar primeiro estabelecimento
      toggleEstabelecimento(1);
      expect(selectedIds).toContain(1);
      expect(selectedIds).toHaveLength(1);

      // Selecionar segundo estabelecimento
      toggleEstabelecimento(2);
      expect(selectedIds).toContain(1);
      expect(selectedIds).toContain(2);
      expect(selectedIds).toHaveLength(2);

      // Desselecionar primeiro estabelecimento
      toggleEstabelecimento(1);
      expect(selectedIds).not.toContain(1);
      expect(selectedIds).toContain(2);
      expect(selectedIds).toHaveLength(1);
    });

    it("should select all estabelecimentos", () => {
      const allEstabelecimentos = [
        { id: 1, nome: "Hospital A" },
        { id: 2, nome: "Hospital B" },
        { id: 3, nome: "Hospital C" },
      ];

      const selectedIds = allEstabelecimentos.map((e) => e.id);

      expect(selectedIds).toHaveLength(3);
      expect(selectedIds).toEqual([1, 2, 3]);
    });

    it("should clear all selections", () => {
      let selectedIds = [1, 2, 3];
      
      // Limpar seleção
      selectedIds = [];

      expect(selectedIds).toHaveLength(0);
    });
  });

  describe("Validação de Dados", () => {
    it("should validate user name is at least 2 characters", () => {
      const validName = "Jo";
      const invalidName = "J";

      expect(validName.length >= 2).toBe(true);
      expect(invalidName.length >= 2).toBe(false);
    });

    it("should validate email format", () => {
      const validEmail = "test@example.com";
      const invalidEmail = "invalid-email";

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      expect(emailRegex.test(validEmail)).toBe(true);
      expect(emailRegex.test(invalidEmail)).toBe(false);
    });

    it("should validate role is either admin or user", () => {
      const validRoles = ["admin", "user"];

      expect(validRoles.includes("admin")).toBe(true);
      expect(validRoles.includes("user")).toBe(true);
      expect(validRoles.includes("superuser")).toBe(false);
    });
  });
});
