import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Edição de Estabelecimentos de Usuários", () => {
  let testUserId: number;
  let testEstabelecimentoId1: number;
  let testEstabelecimentoId2: number;

  beforeAll(async () => {
    // Criar usuário de teste
    const timestamp = Date.now();
    const user = await db.upsertUser({
      openId: `test-edit-estab-${timestamp}`,
      name: "Usuário Teste Edição Estabelecimentos",
      email: `test-edit-estab-${timestamp}@test.com`,
      role: "user",
    });
    testUserId = user?.id || 0;
    
    // Se não conseguiu criar, buscar pelo openId
    if (!testUserId) {
      const usuarios = await db.listarTodosUsuarios();
      const found = usuarios.find(u => u.email === `test-edit-estab-${timestamp}@test.com`);
      if (found) testUserId = found.id;
    }

    // Criar estabelecimentos de teste
    const est1 = await db.createEstabelecimento({
      nome: `Estabelecimento Teste 1 - ${timestamp}`,
      cnpj: `11.111.111/0001-${String(timestamp).slice(-2)}`,
      endereco: "Endereço Teste 1",
    });
    testEstabelecimentoId1 = est1.id;

    const est2 = await db.createEstabelecimento({
      nome: `Estabelecimento Teste 2 - ${timestamp}`,
      cnpj: `22.222.222/0001-${String(timestamp + 1).slice(-2)}`,
      endereco: "Endereço Teste 2",
    });
    testEstabelecimentoId2 = est2.id;
  });

  afterAll(async () => {
    // Limpar dados de teste
    if (testUserId) {
      // Remover permissões
      try {
        await db.removerPermissaoEstabelecimento(testUserId, testEstabelecimentoId1);
      } catch (e) {}
      try {
        await db.removerPermissaoEstabelecimento(testUserId, testEstabelecimentoId2);
      } catch (e) {}
    }
  });

  describe("listarTodosUsuarios", () => {
    it("deve retornar usuários com contagem de estabelecimentos", async () => {
      const usuarios = await db.listarTodosUsuarios();
      
      expect(Array.isArray(usuarios)).toBe(true);
      
      // Verificar que cada usuário tem a propriedade estabelecimentosCount
      const testUser = usuarios.find(u => u.id === testUserId);
      if (testUser) {
        expect(testUser).toHaveProperty("estabelecimentosCount");
        expect(typeof testUser.estabelecimentosCount).toBe("number");
      }
    });
  });

  describe("getEstabelecimentosUsuario", () => {
    it("deve retornar lista vazia para usuário sem estabelecimentos", async () => {
      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      
      expect(Array.isArray(estabelecimentos)).toBe(true);
      expect(estabelecimentos.length).toBe(0);
    });

    it("deve retornar estabelecimentos após adicionar permissão", async () => {
      // Adicionar permissão ao primeiro estabelecimento
      await db.upsertPermissaoEstabelecimento({
        userId: testUserId,
        estabelecimentoId: testEstabelecimentoId1,
        grupoServico: "visualizador",
        podeVisualizar: "sim",
        podeEditar: "nao",
        podeExcluir: "nao",
        podeGerenciar: "nao",
        acessoDashboard: "sim",
        acessoArquivos: "nao",
        acessoComparacoes: "nao",
        acessoFaturamento: "nao",
        acessoTabelasPreco: "nao",
        acessoAnaliseGlosa: "nao",
        acessoDicionarioGlosas: "nao",
        acessoRecursosGlosa: "nao",
        acessoConvenios: "nao",
        acessoRegrasNegocio: "nao",
        acessoProdutividade: "nao",
        acessoEstabelecimentos: "nao",
        acessoPermissoes: "nao",
      });

      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      
      expect(estabelecimentos.length).toBe(1);
      expect(estabelecimentos[0].id).toBe(testEstabelecimentoId1);
    });
  });

  describe("atualizarEstabelecimentosUsuario", () => {
    it("deve adicionar novos estabelecimentos", async () => {
      // Atualizar para ter os dois estabelecimentos
      const result = await db.atualizarEstabelecimentosUsuario(
        testUserId,
        [testEstabelecimentoId1, testEstabelecimentoId2],
        1 // adminId
      );

      expect(result.adicionados).toBe(1); // Já tinha o primeiro, adiciona o segundo
      expect(result.removidos).toBe(0);

      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      expect(estabelecimentos.length).toBe(2);
    });

    it("deve remover estabelecimentos", async () => {
      // Atualizar para ter apenas o segundo estabelecimento
      const result = await db.atualizarEstabelecimentosUsuario(
        testUserId,
        [testEstabelecimentoId2],
        1 // adminId
      );

      expect(result.adicionados).toBe(0);
      expect(result.removidos).toBe(1);

      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      expect(estabelecimentos.length).toBe(1);
      expect(estabelecimentos[0].id).toBe(testEstabelecimentoId2);
    });

    it("deve adicionar e remover estabelecimentos simultaneamente", async () => {
      // Atualizar para ter apenas o primeiro estabelecimento (remove segundo, adiciona primeiro)
      const result = await db.atualizarEstabelecimentosUsuario(
        testUserId,
        [testEstabelecimentoId1],
        1 // adminId
      );

      expect(result.adicionados).toBe(1);
      expect(result.removidos).toBe(1);

      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      expect(estabelecimentos.length).toBe(1);
      expect(estabelecimentos[0].id).toBe(testEstabelecimentoId1);
    });

    it("deve limpar todos os estabelecimentos quando array vazio", async () => {
      const result = await db.atualizarEstabelecimentosUsuario(
        testUserId,
        [],
        1 // adminId
      );

      expect(result.removidos).toBeGreaterThan(0);

      const estabelecimentos = await db.getEstabelecimentosUsuario(testUserId);
      expect(estabelecimentos.length).toBe(0);
    });
  });

  describe("getUserById", () => {
    it("deve retornar dados do usuário pelo ID", async () => {
      const user = await db.getUserById(testUserId);
      
      expect(user).not.toBeNull();
      expect(user?.id).toBe(testUserId);
      expect(user?.name).toBe("Usuário Teste Edição Estabelecimentos");
    });

    it("deve retornar undefined para ID inexistente", async () => {
      const user = await db.getUserById(999999);
      
      expect(user).toBeUndefined();
    });
  });
});
