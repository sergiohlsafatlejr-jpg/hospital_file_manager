import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verificarPermissaoEstabelecimento: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));

vi.mock("./hospitalScope", () => ({
  ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001,
}));

import {
  TODOS_SETORES_OPERACIONAIS,
  exigirSetorColaborador,
  obterPerfilPersonalizadoColaborador,
  parsePerfilObservacao,
  resolverEscopoLeituraFabrica,
} from "./fabricaPerfilColaborador";

const usuarioOperador = { id: 71, role: "user" };
const usuarioGestor = { id: 72, role: "user" };
const usuarioAdmin = { id: 73, role: "admin" };

function observacaoPerfil(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    cargoSetor: "Faturista",
    setoresPermitidos: ["faturamento"],
    hospitaisPermitidos: [101],
    verRelatoriosGerenciais: false,
    ...overrides,
  });
}

function dbComPerfil(observacao: unknown, usuarioNome = "Colaborador Teste") {
  return {
    execute: vi.fn().mockResolvedValue([[{
      id: 9,
      usuario_id: usuarioOperador.id,
      usuario_nome: usuarioNome,
      observacao,
    }], [{ name: "fields sintéticos" }]]),
  };
}

function dbSemPerfil() {
  return {
    execute: vi.fn().mockResolvedValue([[], [{ name: "fields sintéticos" }]]),
  };
}

describe("fabricaPerfilColaborador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
  });

  it("exporta todos os setores canônicos", () => {
    expect(TODOS_SETORES_OPERACIONAIS).toEqual([
      "recepcao",
      "faturamento",
      "auditoria_interna",
      "auditoria_externa",
      "limpeza_prontuario",
      "recursos",
    ]);
  });

  it("lê o perfil da forma real [rows, fields], usando rows[0]", async () => {
    const db = dbComPerfil(observacaoPerfil());

    await expect(obterPerfilPersonalizadoColaborador(db, usuarioOperador, "Fallback"))
      .resolves.toEqual({
        usuarioId: 71,
        usuarioNome: "Colaborador Teste",
        cargoSetor: "Faturista",
        setoresPermitidos: ["faturamento"],
        hospitaisPermitidos: [101],
        verRelatoriosGerenciais: false,
        isGestorFabrica: false,
      });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(mocks.verificarPermissaoEstabelecimento).not.toHaveBeenCalled();
  });

  it("nega recepção para perfil restrito a faturamento", async () => {
    await expect(exigirSetorColaborador(
      dbComPerfil(observacaoPerfil()),
      usuarioOperador,
      ["recepcao"],
      [101],
    )).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Seu perfil na Fábrica de Faturamento não possui acesso a este setor.",
    });
  });

  it("permite o setor faturamento e nega hospital que não consta no perfil", async () => {
    await expect(exigirSetorColaborador(
      dbComPerfil(observacaoPerfil()),
      usuarioOperador,
      ["faturamento"],
      [202],
    )).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Seu perfil na Fábrica não está habilitado para operar contas deste hospital.",
    });
  });

  it("não transforma leitura de relatórios em gestão nem dispensa setor ou hospital", async () => {
    const perfil = parsePerfilObservacao(
      observacaoPerfil({ verRelatoriosGerenciais: true }),
      usuarioOperador.id,
      "Colaborador Teste",
    );
    expect(perfil.verRelatoriosGerenciais).toBe(true);
    expect(perfil.isGestorFabrica).toBe(false);

    await expect(exigirSetorColaborador(
      dbComPerfil(observacaoPerfil({ verRelatoriosGerenciais: true })),
      usuarioOperador,
      ["recepcao"],
      [202],
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nega lista de setores vazia em perfil persistido, sem conceder todos os setores", async () => {
    const db = dbComPerfil(observacaoPerfil({ setoresPermitidos: [] }));

    await expect(exigirSetorColaborador(db, usuarioOperador, ["faturamento"], [101]))
      .rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Seu perfil na Fábrica de Faturamento não possui acesso a este setor.",
      });
  });

  it.each([
    ["JSON inválido", "{inválido"],
    ["setor não canônico", observacaoPerfil({ setoresPermitidos: ["qualquer"] })],
    ["id de hospital textual", observacaoPerfil({ hospitaisPermitidos: ["101"] })],
    ["campo booleano com tipo incorreto", observacaoPerfil({ verRelatoriosGerenciais: "sim" })],
  ])("falha fechada para %s", async (_caso, observacao) => {
    await expect(exigirSetorColaborador(
      dbComPerfil(observacao),
      usuarioOperador,
      ["faturamento"],
      [101],
    )).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Não foi possível validar seu perfil na Fábrica de Faturamento.",
    });
  });

  it("falha fechada quando a fonte do perfil falha, sem detalhar o erro de banco", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("ECONNREFUSED segredo de infraestrutura")),
    };

    await expect(exigirSetorColaborador(db, usuarioOperador, ["faturamento"], [101]))
      .rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Não foi possível validar seu perfil na Fábrica de Faturamento.",
      });
  });

  it("preserva o legado somente quando não existe linha de perfil", async () => {
    const db = dbSemPerfil();

    await expect(obterPerfilPersonalizadoColaborador(db, usuarioOperador)).resolves.toBeNull();
    await expect(exigirSetorColaborador(db, usuarioOperador, ["recepcao"], [999])).resolves.toBeUndefined();
  });

  it("gestor da central mantém o perfil salvo, sem bypass de setor, hospital ou relatórios", async () => {
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (userId, estabelecimentoId, permissao) =>
      userId === usuarioGestor.id && estabelecimentoId === 2160001 && permissao === "gerenciar",
    );
    const db = {
      execute: vi.fn().mockResolvedValue([[{
        id: 10,
        usuario_id: usuarioGestor.id,
        usuario_nome: "Gestor Central",
        observacao: observacaoPerfil({ setoresPermitidos: ["recepcao"], hospitaisPermitidos: [101] }),
      }], []]),
    };

    await expect(exigirSetorColaborador(db, usuarioGestor, ["recursos"], [101]))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("setor") });
    await expect(exigirSetorColaborador(db, usuarioGestor, ["recepcao"], [999]))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("hospital") });
    await expect(obterPerfilPersonalizadoColaborador(db, usuarioGestor)).resolves.toMatchObject({
      setoresPermitidos: ["recepcao"], hospitaisPermitidos: [101],
      isGestorFabrica: false, verRelatoriosGerenciais: false,
    });
    expect(mocks.verificarPermissaoEstabelecimento).not.toHaveBeenCalled();
  });

  it("admin mantém o bypass previsto sem consultar perfil ou banco", async () => {
    const db = { execute: vi.fn() };

    await expect(exigirSetorColaborador(db, usuarioAdmin, ["recepcao"], [999])).resolves.toBeUndefined();
    expect(db.execute).not.toHaveBeenCalled();
    expect(mocks.verificarPermissaoEstabelecimento).not.toHaveBeenCalled();
  });
});

describe("Issue #155: escopo de leitura igual ao perfil das guardas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  });

  it("todos inclui somente os setores salvos e intersecta hospitais autorizados", async () => {
    await expect(resolverEscopoLeituraFabrica(
      dbComPerfil(observacaoPerfil({ setoresPermitidos: ["faturamento", "auditoria_interna"] })),
      usuarioGestor, [101, 202],
    )).resolves.toEqual({ setores: ["faturamento", "auditoria_interna"], hospitais: [101] });
  });

  it("um filtro explícito fora do perfil é negado mesmo com gerenciamento central", async () => {
    await expect(resolverEscopoLeituraFabrica(
      dbComPerfil(observacaoPerfil()), usuarioGestor, [101], "recepcao",
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("perfil com setores vazios não autoriza nenhuma leitura", async () => {
    await expect(resolverEscopoLeituraFabrica(
      dbComPerfil(observacaoPerfil({ setoresPermitidos: [] })), usuarioOperador, [101],
    )).resolves.toEqual({ setores: [], hospitais: [101] });
  });

  it("não amplia hospitais quando a interseção do perfil é vazia", async () => {
    await expect(resolverEscopoLeituraFabrica(
      dbComPerfil(observacaoPerfil()), usuarioOperador, [202],
    )).resolves.toEqual({ setores: ["faturamento"], hospitais: [] });
  });

  it.each(["recursos", "limpeza_prontuario"] as const)("preserva o compartilhamento aprovado para %s", async (setor) => {
    const db = dbComPerfil(observacaoPerfil({ setoresPermitidos: [setor] }));
    const resultado = await resolverEscopoLeituraFabrica(db, usuarioOperador, [101]);
    expect(resultado.setores).toEqual(expect.arrayContaining([
      "limpeza_prontuario", "recursos", "enviado_convenio", "finalizado",
    ]));
    expect(resultado.setores).not.toContain("recepcao");
    expect(resultado.setores).not.toContain("faturamento");
    await expect(exigirSetorColaborador(db, usuarioOperador, ["recursos", "limpeza_prontuario"], [101]))
      .resolves.toBeUndefined();
  });

  it("filtro compartilhado restringe o grupo sem incluir setores anteriores", async () => {
    const db = dbComPerfil(observacaoPerfil({ setoresPermitidos: ["faturamento", "recursos"] }));
    await expect(resolverEscopoLeituraFabrica(db, usuarioOperador, [101], "enviado_convenio"))
      .resolves.toEqual({ setores: ["recursos", "limpeza_prontuario", "enviado_convenio"], hospitais: [101] });
  });

  it("admin mantém os oito estados sem consultar o perfil", async () => {
    const db = dbComPerfil("invalido");
    const resultado = await resolverEscopoLeituraFabrica(db, usuarioAdmin, [101, 202]);
    expect(resultado.setores).toHaveLength(8);
    expect(resultado.hospitais).toEqual([101, 202]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("ausência comprovada de perfil preserva o legado, sem extrapolar escopo hospitalar", async () => {
    const resultado = await resolverEscopoLeituraFabrica(dbSemPerfil(), usuarioOperador, [101]);
    expect(resultado.setores).toHaveLength(8);
    expect(resultado.hospitais).toEqual([101]);
  });

  it("falha de leitura ou JSON inválido bloqueia em vez de ampliar o escopo", async () => {
    await expect(resolverEscopoLeituraFabrica(dbComPerfil("invalido"), usuarioGestor, [101]))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolverEscopoLeituraFabrica({ execute: vi.fn().mockRejectedValue(new Error("falha sintética")) }, usuarioGestor, [101]))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
