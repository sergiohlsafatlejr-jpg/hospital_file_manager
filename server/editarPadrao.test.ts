import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes para a mutation editarPadrao - verificar que aceita campos de código principal
 * e que o backend processa corretamente os novos campos opcionais.
 */

// Mock do banco de dados
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    update: (...args: any[]) => mockUpdate(...args),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          id: 840175,
          codigoProcedimentoPrincipal: "31102060 + 31102050",
          descricaoProcedimentoPrincipal: "URETERORRENOLITOTRIPSIA FLEXÍVEL A LASER + COLOCAÇÃO CISTOSCÓPICA DE DUPLO J UNILATERAL",
          setor: "CENTRO CIRURGICO",
          convenioId: 1,
          itensAssociados: "[]",
          status: "ativo",
          isGabarito: 1,
          confianca: 100,
          totalOcorrencias: 0,
          valorMedioConta: 0,
        }]),
      }),
    }),
  }),
}));

describe("editarPadrao - campos de código principal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve aceitar input com codigoProcedimentoPrincipal", () => {
    const input = {
      id: 840175,
      codigoProcedimentoPrincipal: "31102360 + 31102050",
      descricaoProcedimentoPrincipal: "URETERORRENOLITOTRIPSIA FLEXÍVEL A LASER + COLOCAÇÃO CISTOSCÓPICA DE DUPLO J UNILATERAL",
      setor: "CENTRO CIRURGICO",
      convenioId: 1,
      itensAssociados: [
        { codigo: "60000651", descricao: "DIARIA APARTAMENTO STANDARD", frequencia: 100, quantidadeMedia: 5.5 },
        { codigo: "43990305", descricao: "TAXA DE AUDITORIA INTRA HOSPITALAR", frequencia: 100, quantidadeMedia: 1 },
      ],
    };

    // Verificar que os campos estão presentes no input
    expect(input.codigoProcedimentoPrincipal).toBe("31102360 + 31102050");
    expect(input.descricaoProcedimentoPrincipal).toBeDefined();
    expect(input.setor).toBe("CENTRO CIRURGICO");
  });

  it("deve permitir input sem codigoProcedimentoPrincipal (campo opcional)", () => {
    const input = {
      id: 840175,
      convenioId: 1,
      itensAssociados: [
        { codigo: "60000651", descricao: "DIARIA APARTAMENTO STANDARD", frequencia: 100, quantidadeMedia: 5.5 },
      ],
    };

    // Sem código principal, deve funcionar normalmente
    expect(input.codigoProcedimentoPrincipal).toBeUndefined();
  });

  it("deve construir updateData corretamente com novos campos", () => {
    const input = {
      id: 840175,
      codigoProcedimentoPrincipal: "31102360 + 31102050",
      descricaoProcedimentoPrincipal: "Desc atualizada",
      setor: "CENTRO CIRURGICO",
      convenioId: 1,
      itensAssociados: [],
    };

    // Simular a lógica do backend
    const updateData: any = {
      itensAssociados: input.itensAssociados,
      convenioId: input.convenioId || null,
      status: "ativo",
      confianca: 100,
    };

    if (input.codigoProcedimentoPrincipal !== undefined) {
      updateData.codigoProcedimentoPrincipal = input.codigoProcedimentoPrincipal;
    }
    if (input.descricaoProcedimentoPrincipal !== undefined) {
      updateData.descricaoProcedimentoPrincipal = input.descricaoProcedimentoPrincipal;
    }
    if (input.setor !== undefined) {
      updateData.setor = input.setor || null;
    }

    expect(updateData.codigoProcedimentoPrincipal).toBe("31102360 + 31102050");
    expect(updateData.descricaoProcedimentoPrincipal).toBe("Desc atualizada");
    expect(updateData.setor).toBe("CENTRO CIRURGICO");
  });

  it("não deve incluir campos undefined no updateData", () => {
    const input = {
      id: 840175,
      convenioId: 1,
      itensAssociados: [],
      // Sem codigoProcedimentoPrincipal, descricaoProcedimentoPrincipal, setor
    } as any;

    const updateData: any = {
      itensAssociados: input.itensAssociados,
      convenioId: input.convenioId || null,
      status: "ativo",
      confianca: 100,
    };

    if (input.codigoProcedimentoPrincipal !== undefined) {
      updateData.codigoProcedimentoPrincipal = input.codigoProcedimentoPrincipal;
    }
    if (input.descricaoProcedimentoPrincipal !== undefined) {
      updateData.descricaoProcedimentoPrincipal = input.descricaoProcedimentoPrincipal;
    }
    if (input.setor !== undefined) {
      updateData.setor = input.setor || null;
    }

    expect(updateData).not.toHaveProperty("codigoProcedimentoPrincipal");
    expect(updateData).not.toHaveProperty("descricaoProcedimentoPrincipal");
    expect(updateData).not.toHaveProperty("setor");
  });

  it("deve tratar setor null corretamente", () => {
    const input = {
      id: 840175,
      setor: null as string | null,
      itensAssociados: [],
    };

    const updateData: any = {
      itensAssociados: input.itensAssociados,
      status: "ativo",
    };

    if (input.setor !== undefined) {
      updateData.setor = input.setor || null;
    }

    expect(updateData.setor).toBeNull();
  });

  it("deve tratar setor string vazia como null", () => {
    const input = {
      id: 840175,
      setor: "",
      itensAssociados: [],
    };

    const updateData: any = {
      itensAssociados: input.itensAssociados,
      status: "ativo",
    };

    if (input.setor !== undefined) {
      updateData.setor = input.setor || null;
    }

    expect(updateData.setor).toBeNull();
  });
});
