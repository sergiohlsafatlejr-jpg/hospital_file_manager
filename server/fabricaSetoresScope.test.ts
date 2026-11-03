import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { TODOS_SETORES_OPERACIONAIS, setoresConsultaDoPerfil } from "../shared/fabricaSetores";

const scope = vi.hoisted(() => ({
  exigirAcessoFabrica: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
  resolverHospitaisAutorizados: vi.fn(),
  autorizarLoteHospitalar: vi.fn(),
}));
vi.mock("./hospitalScope", () => ({ ...scope, ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001 }));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));
vi.mock("./xmlImportacaoLoteVault", () => ({
  armazenamentoXmlImportacaoPronto: () => true,
  criarChaveStorageXmlImportacao: () => "cofre-sintetico.enc",
  salvarXmlImportacaoProtegido: vi.fn(),
  lerXmlImportacaoProtegido: vi.fn(),
  XML_IMPORTACAO_MAX_FILE_BYTES: 16 * 1024 * 1024,
}));
vi.mock("./faturamentoUnificadoService", () => ({ popularDeXmlTissArquivoRestrito: vi.fn() }));

import { getDb, verificarPermissaoEstabelecimento } from "./db";
import { obterPerfilPersonalizadoColaborador } from "./fabricaPerfilColaborador";
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";

const dialect = new MySqlDialect();
const user = { id: 71, role: "user", name: "Operador sintético", email: "operador@example.test" };
const cadastro = {
  hospitalEstabelecimentoId: 20,
  nomePaciente: "Paciente sintético",
  tipoAtendimento: "internacao" as const,
  dataEntrada: "2026-10-01",
  dataRecebimentoSafatle: "2026-10-02",
};
const contasSinteticas = [
  { id: 1, hospital_estabelecimento_id: 20, setor_atual: "faturamento" },
  { id: 2, hospital_estabelecimento_id: 31, setor_atual: "faturamento" },
  { id: 3, hospital_estabelecimento_id: 99, setor_atual: "faturamento" },
  { id: 4, hospital_estabelecimento_id: 20, setor_atual: "recepcao" },
  { id: 5, hospital_estabelecimento_id: 20, setor_atual: "auditoria_interna" },
  { id: 6, hospital_estabelecimento_id: 20, setor_atual: "limpeza_prontuario" },
  { id: 7, hospital_estabelecimento_id: 20, setor_atual: "enviado_convenio" },
  { id: 8, hospital_estabelecimento_id: 20, setor_atual: "recursos" },
  { id: 9, hospital_estabelecimento_id: 20, setor_atual: "finalizado" },
];

type Query = { sql: string; params: unknown[] };
function caller(role = "user") {
  return fabricaFaturamentoRouter.createCaller({ user: { ...user, role }, req: {}, res: {} } as any);
}
function perfil(setoresPermitidos: string[] = ["faturamento"], hospitaisPermitidos: number[] = [20]) {
  return JSON.stringify({ cargoSetor: "Perfil sintético", setoresPermitidos, hospitaisPermitidos, verRelatoriosGerenciais: true });
}
function valoresIn(query: Query, coluna: string): unknown[] {
  const match = new RegExp(`\\b${coluna.replaceAll(".", "\\.")} IN \\(([^)]*)\\)`).exec(query.sql);
  if (!match) throw new Error(`Predicado IN ausente: ${coluna}`);
  const offset = (query.sql.slice(0, match.index).match(/\?/g) || []).length;
  const count = (match[1].match(/\?/g) || []).length;
  return query.params.slice(offset, offset + count);
}
function predicado(query: Query): string {
  return query.sql.split(/\bWHERE\b/)[1].split(/\b(?:ORDER BY|GROUP BY|LIMIT)\b/)[0].trim();
}
function mockDb(observacao: string | null, otherProfiles: any[] = []) {
  const queries: Query[] = [];
  const row = observacao === null ? [] : [{ id: 10, usuario_id: user.id, usuario_nome: "Nome salvo", observacao }];
  const execute = vi.fn(async (statement: SQL) => {
    const query = dialect.sqlToQuery(statement);
    const q: Query = { sql: query.sql.replace(/\s+/g, " ").trim(), params: query.params };
    queries.push(q);
    if (q.sql.includes("FROM fabrica_metas")) return [q.sql.includes("LIMIT 1") ? row : [...row, ...otherProfiles], []];
    if (q.sql.includes("FROM estabelecimentos")) return [[{ id: 20, nome: "Hospital 20" }, { id: 31, nome: "Hospital 31" }], []];
    if (q.sql.includes("FROM convenios")) return [[], []];
    if (q.sql.includes("FROM users")) return [[user], []];
    if (q.sql.includes("responsavel_atual_id as usuarioId")) return [[], []];
    if (!q.sql.includes("FROM fabrica_contas")) throw new Error(`SQL inesperado no mock: ${q.sql}`);
    // Interpretação estritamente in-memory dos dois predicados esperados, sem executar SQL.
    const hospitalCol = q.sql.includes("FROM fabrica_contas fc") ? "fc.hospital_estabelecimento_id" : "hospital_estabelecimento_id";
    const setorCol = hospitalCol.startsWith("fc.") ? "fc.setor_atual" : "setor_atual";
    const rows = /\bWHERE FALSE\b/.test(q.sql) ? [] : contasSinteticas.filter((conta) =>
      valoresIn(q, hospitalCol).includes(conta.hospital_estabelecimento_id) && valoresIn(q, setorCol).includes(conta.setor_atual),
    );
    if (q.sql.includes("GROUP BY setor_atual")) {
      return [[...new Set(rows.map((r) => r.setor_atual))].map((setor) => ({
        setor, totalContas: rows.filter((r) => r.setor_atual === setor).length,
        devolvidasErro: 0, emAndamento: 0, emFila: 0, valorTotal: 0, mediaHorasNoSetor: 0,
      })), []];
    }
    if (q.sql.startsWith("SELECT COUNT(*) as total")) return [[{ total: rows.length }], []];
    return [rows, []];
  });
  const db = {
    execute,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 100 }]) })),
    update: vi.fn(),
    delete: vi.fn(),
  };
  vi.mocked(getDb).mockResolvedValue(db as any);
  return { ...db, queries, accountQueries: () => queries.filter((q) => q.sql.includes("FROM fabrica_contas") && !q.sql.includes("responsavel_atual_id as usuarioId")) };
}
function esperarEscopo(query: Query, hospitais: number[], setores: string[], alias = "fc.") {
  expect(valoresIn(query, `${alias}hospital_estabelecimento_id`)).toEqual(hospitais);
  expect(new Set(valoresIn(query, `${alias}setor_atual`))).toEqual(new Set(setores));
  expect(query.sql).not.toContain("IN ()");
}

describe("Issue155: perfil salvo isolado no DTO e leituras da Fábrica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.exigirAcessoFabrica.mockResolvedValue(undefined);
    scope.exigirHospitalProprietario.mockResolvedValue(undefined);
    scope.resolverHospitaisAutorizados.mockResolvedValue([20, 31]);
    scope.autorizarLoteHospitalar.mockResolvedValue(undefined);
    // Todos os casos partem de um gerente real da Central; salvo não pode ganhar bypass.
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
  });

  it("gerente Central com perfil só Faturamento recebe DTO efetivo e cadastro Recepção é FORBIDDEN antes do insert", async () => {
    const db = mockDb(perfil());
    const efetivo = await obterPerfilPersonalizadoColaborador(db, user);
    const dto = await caller().dadosAuxiliares();
    expect(dto.meuPerfil).toEqual(efetivo);
    expect(dto.meuPerfil).toMatchObject({ setoresPermitidos: ["faturamento"], hospitaisPermitidos: [20], isGestorFabrica: false });
    expect(dto.podeGerenciarEquipe).toBe(true);
    expect(dto.hospitais.map((h: any) => h.id)).toEqual([20]);
    expect(dto.todosHospitaisEscopo.map((h: any) => h.id)).toEqual([20, 31]);
    expect(dto.colaboradores[0]).toMatchObject({ setoresPermitidos: ["faturamento"], hospitaisPermitidos: [20], isGestorFabrica: false });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(71, 2160001, "gerenciar");
    await expect(caller().cadastrarContaRecepcao(cadastro)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("perfil salvo completo também permanece efetivo sem inventar override de gestor", async () => {
    const db = mockDb(perfil([...TODOS_SETORES_OPERACIONAIS], []));
    const efetivo = await obterPerfilPersonalizadoColaborador(db, user);
    const dto = await caller().dadosAuxiliares();
    expect(dto.meuPerfil).toEqual(efetivo);
    expect(dto.meuPerfil).toMatchObject({ cargoSetor: "Perfil sintético", hospitaisPermitidos: [], verRelatoriosGerenciais: true, isGestorFabrica: false });
    expect(dto.podeGerenciarEquipe).toBe(true);
  });

  it("pedido explícito de Recepção fora do perfil é bloqueado antes da SQL das contas e count", async () => {
    const db = mockDb(perfil());
    await expect(caller().listarContas({ setorAtual: "recepcao" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.accountQueries()).toEqual([]);
  });

  it("todos é somente a união permitida; listagem e count usam o mesmo IN de setor e interseção hospitalar", async () => {
    const db = mockDb(perfil(["faturamento"], [20, 99]));
    const result = await caller().listarContas();
    expect(result.contas.map((c) => c.id)).toEqual([1]);
    expect(result).toMatchObject({ total: 1, totalPages: 1 });
    const [list, count] = db.accountQueries();
    expect(db.accountQueries()).toHaveLength(2);
    esperarEscopo(list, [20], ["faturamento"]);
    esperarEscopo(count, [20], ["faturamento"]);
    expect(predicado(list)).toBe(predicado(count));
    expect(list.params.slice(0, -2)).toEqual(count.params);
  });

  it("setor explícito autorizado continua limitado e listagem/count mantêm todos os filtros", async () => {
    const db = mockDb(perfil(["faturamento", "auditoria_interna"], [20, 99]));
    await caller().listarContas({
      setorAtual: "faturamento", statusSetor: "fila", convenioId: 55,
      faturistaId: 71, responsavelAtualId: 72, search: "sintético",
      dataInicio: "2026-10-01", dataFim: "2026-10-31", page: 2, pageSize: 10,
    });
    const [list, count] = db.accountQueries();
    esperarEscopo(list, [20], ["faturamento"]);
    esperarEscopo(count, [20], ["faturamento"]);
    expect(predicado(list)).toBe(predicado(count));
    expect(list.params.slice(0, -2)).toEqual(count.params);
    expect(count.params).toEqual([20, "faturamento", "fila", 55, 71, 72, "2026-10-01", "2026-10-31", ...Array(5).fill("%sintético%")]);
    expect(list.params.slice(-2)).toEqual([10, 10]);
  });

  it("resumo e seus COUNT agregados respeitam o mesmo escopo de listagem/count", async () => {
    const db = mockDb(perfil(["faturamento"], [20, 99]));
    await caller().listarContas();
    const result = await caller().resumoSetores();
    expect(result.totalGeralContas).toBe(1);
    expect(result.porSetor.faturamento.totalContas).toBe(1);
    expect(result.porSetor.recepcao.totalContas).toBe(0);
    const [list, count, summary] = db.accountQueries();
    esperarEscopo(summary, [20], ["faturamento"], "");
    expect(summary.sql).toContain("COUNT(*) as totalContas");
    expect(predicado(summary)).toBe(predicado(count).replaceAll("fc.", ""));
    expect(predicado(list)).toBe(predicado(count));
    expect(summary.params).toEqual(count.params);
  });

  it("selecionar hospital autorizado mas fora do perfil resulta zero, nunca amplia", async () => {
    scope.resolverHospitaisAutorizados.mockResolvedValue([31]);
    const db = mockDb(perfil());
    await expect(caller().listarContas({ hospitalEstabelecimentoId: 31 })).resolves.toMatchObject({ contas: [], total: 0 });
    await expect(caller().resumoSetores({ hospitalEstabelecimentoId: 31 })).resolves.toMatchObject({ totalGeralContas: 0 });
    expect(db.accountQueries()).toHaveLength(3);
    for (const q of db.accountQueries()) expect(predicado(q)).toBe("FALSE");
  });

  it("perfil salvo vazio produz SQL falsa em listagem/count/resumo mesmo com gerenciar Central", async () => {
    const db = mockDb(perfil([], []));
    const dto = await caller().dadosAuxiliares();
    expect(dto.meuPerfil.setoresPermitidos).toEqual([]);
    expect(dto.meuPerfil.isGestorFabrica).toBe(false);
    expect(dto.podeGerenciarEquipe).toBe(true);
    await expect(caller().listarContas()).resolves.toMatchObject({ contas: [], total: 0, totalPages: 0 });
    await expect(caller().resumoSetores()).resolves.toMatchObject({ totalGeralContas: 0, totalGeralValor: 0 });
    expect(db.accountQueries()).toHaveLength(3);
    for (const q of db.accountQueries()) {
      expect(predicado(q)).toBe("FALSE");
      expect(q.sql).not.toContain("IN ()");
    }
    await expect(caller().listarContas({ setorAtual: "faturamento" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hospitais vazios no perfil não removem autorização hospitalar legada, mas preservam setores", async () => {
    const db = mockDb(perfil(["faturamento"], []));
    const result = await caller().listarContas();
    expect(result.contas.map((c) => c.id)).toEqual([1, 2]);
    for (const q of db.accountQueries()) esperarEscopo(q, [20, 31], ["faturamento"]);
  });

  it.each(["{corrompido", perfil(["setor_invalido"]), perfil(["faturamento"], [0])])("perfil corrupto nega DTO, listagem e resumo sem fallback: %s", async (saved) => {
    const db = mockDb(saved);
    await expect(caller().dadosAuxiliares()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().listarContas()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().resumoSetores()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().cadastrarContaRecepcao(cadastro)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.accountQueries()).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("perfil de outro colaborador corrupto não derruba o perfil efetivo atual", async () => {
    const db = mockDb(perfil(), [{ id: 11, usuario_id: 88, usuario_nome: "Outro sintético", observacao: "{corrompido" }]);
    await expect(caller().dadosAuxiliares()).resolves.toMatchObject({ meuPerfil: { setoresPermitidos: ["faturamento"], isGestorFabrica: false } });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("podeGerenciarEquipe permanece independente do perfil operacional e de ver relatórios", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    mockDb(perfil());
    await expect(caller().dadosAuxiliares()).resolves.toMatchObject({
      podeGerenciarEquipe: false,
      meuPerfil: { verRelatoriosGerenciais: true, isGestorFabrica: false, setoresPermitidos: ["faturamento"] },
    });
  });

  it.each([true, false])("ausência comprovada de perfil mantém legado (gerenciar Central=%s)", async (gerenciar) => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(gerenciar);
    const db = mockDb(null);
    const dto = await caller().dadosAuxiliares();
    expect(dto.meuPerfil.setoresPermitidos).toEqual([...TODOS_SETORES_OPERACIONAIS]);
    expect(dto.meuPerfil.isGestorFabrica).toBe(gerenciar);
    expect(dto.podeGerenciarEquipe).toBe(gerenciar);
    const result = await caller().listarContas();
    expect(result.total).toBe(8);
    await expect(caller().resumoSetores()).resolves.toMatchObject({ totalGeralContas: 8 });
    for (const q of db.accountQueries()) esperarEscopo(q, [20, 31], setoresConsultaDoPerfil(TODOS_SETORES_OPERACIONAIS), q.sql.includes("FROM fabrica_contas fc") ? "fc." : "");
    await expect(caller().cadastrarContaRecepcao(cadastro)).resolves.toMatchObject({ sucesso: true });
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it.each([perfil([], [99]), "{corrompido"])("admin mantém bypass de perfil salvo vazio/corrupto sem ampliar hospitais", async (saved) => {
    const db = mockDb(saved);
    const dto = await caller("admin").dadosAuxiliares();
    expect(dto.meuPerfil).toMatchObject({ setoresPermitidos: [...TODOS_SETORES_OPERACIONAIS], hospitaisPermitidos: [], isGestorFabrica: true });
    const result = await caller("admin").listarContas();
    expect(result.total).toBe(8);
    await expect(caller("admin").resumoSetores()).resolves.toMatchObject({ totalGeralContas: 8 });
    for (const q of db.accountQueries()) esperarEscopo(q, [20, 31], setoresConsultaDoPerfil(TODOS_SETORES_OPERACIONAIS), q.sql.includes("FROM fabrica_contas fc") ? "fc." : "");
    expect(db.queries.some((q) => q.sql.includes("FROM fabrica_metas") && q.sql.includes("LIMIT 1"))).toBe(false);
    await expect(caller("admin").cadastrarContaRecepcao(cadastro)).resolves.toMatchObject({ sucesso: true });
  });

  it.each(["limpeza_prontuario", "recursos"])("perfil %s preserva grupo Limpeza/Envio/Recursos e estado final apenas permitido", async (setor) => {
    const db = mockDb(perfil([setor]));
    const all = await caller().listarContas();
    expect(all.contas.map((c) => c.id)).toEqual([6, 7, 8, 9]);
    for (const q of db.accountQueries()) esperarEscopo(q, [20], ["limpeza_prontuario", "enviado_convenio", "recursos", "finalizado"]);
    for (const selected of ["limpeza_prontuario", "enviado_convenio", "recursos"] as const) {
      const result = await caller().listarContas({ setorAtual: selected });
      expect(result.contas.map((c) => c.id)).toEqual([6, 7, 8]);
      for (const q of db.accountQueries().slice(-2)) esperarEscopo(q, [20], ["limpeza_prontuario", "enviado_convenio", "recursos"]);
    }
    await expect(caller().listarContas({ setorAtual: "finalizado" })).resolves.toMatchObject({ total: 1 });
    for (const q of db.accountQueries().slice(-2)) esperarEscopo(q, [20], ["finalizado"]);
    await expect(caller().resumoSetores()).resolves.toMatchObject({ totalGeralContas: 4 });
    esperarEscopo(db.accountQueries().at(-1)!, [20], ["limpeza_prontuario", "enviado_convenio", "recursos", "finalizado"], "");
    await expect(caller().listarContas({ setorAtual: "faturamento" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
