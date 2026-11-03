import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { type SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { consultarStatusGlosaManual } from "./glosaManualReconciliation";

const UUID = "c5d5c0c3-a6eb-4945-ae0e-2722b7c8ce66";
const input = { estabelecimentoId: 13, userId: 7, idempotencyKey: UUID };
const hash = (hospital = 13, key = UUID) => createHash("sha256").update(JSON.stringify([hospital, key])).digest("hex");
const anchor = () => ({
  id: 101, estabelecimentoId: 13, userId: 7,
  nome: `manual-glosa:v1:${hash()}:${"a".repeat(64)}:2026-11-03`,
  totalItens: 2, itensProcessados: 2, tipoArquivo: "txt", direcao: "retornado",
  tamanho: 0, progresso: 100, s3Key: "", s3Url: "", status: "processado",
});
type Options = {
  hospitais?: Record<string, unknown>[]; usuarios?: Record<string, unknown>[];
  permissoes?: Record<string, unknown>[]; ancoras?: Record<string, unknown>[];
  respostaInvalida?: boolean;
};
function bancoFake(options: Options = {}) {
  const dialect = new MySqlDialect();
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const ancoras = options.ancoras ?? [anchor()];
  const antes = structuredClone(ancoras);
  const permissoes = options.permissoes ?? [{ podeVisualizar: "sim", podeEditar: "sim", acessoDemonstrativo: "sim", acessoRecursos: "sim", acessoRecursosGlosa: "nao" }];
  let lockObtido = false;
  const execute = vi.fn(async (query: SQL) => {
    const q = dialect.sqlToQuery(query);
    const text = q.sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: text, params: q.params });
    expect(text).toMatch(/^SELECT /);
    expect(text).toContain("FOR UPDATE");
    if (text.includes("FROM estabelecimentos")) {
      lockObtido = true;
      return [options.hospitais ?? [{ id: q.params[0], ativo: "sim" }]];
    }
    expect(lockObtido).toBe(true);
    if (text.includes("FROM users")) return [options.usuarios ?? [{ id: q.params[0], role: "user" }]];
    if (text.includes("FROM permissoesEstabelecimento")) return [permissoes];
    if (text.includes("FROM arquivos")) {
      expect(text).toContain("estabelecimentoId = ? AND userId = ? AND nome LIKE ?");
      if (options.respostaInvalida) return [{}];
      const [hospital, usuario, prefixo] = q.params;
      return [ancoras.filter(a => a.estabelecimentoId === hospital && a.userId === usuario &&
        String(a.nome).startsWith(String(prefixo).slice(0, -1)))];
    }
    throw new Error("SQL não permitido no contrato readonly");
  });
  const db = { transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn({ execute })) };
  mocks.getDb.mockResolvedValue(db);
  return { db, calls, ancoras, antes };
}
beforeEach(() => vi.clearAllMocks());

describe("Issue163: reconciliação readonly por hospital/UUID/usuário", () => {
  it("confirma exatamente uma âncora processada, sem PHI, valores ou IDs de paciente/item", async () => {
    const fake = bancoFake();
    expect(await consultarStatusGlosaManual(input)).toEqual({ status: "concluido", totalInseridos: 2, dataPagamento: "2026-11-03", competencia: "2026-11" });
    expect(fake.calls.map(c => c.sql.match(/FROM (\w+)/)?.[1])).toEqual(["estabelecimentos", "users", "permissoesEstabelecimento", "arquivos"]);
    expect(fake.calls[0].params).toEqual([13]);
    expect(fake.calls[1].params).toEqual([7]);
    expect(fake.calls[2].params).toEqual([7, 13]);
    expect(fake.calls[3].params).toEqual([13, 7, `manual-glosa:v1:${hash()}:%`]);
    expect(fake.ancoras).toEqual(fake.antes);
    expect(fake.calls.every(c => !/^(INSERT|UPDATE|DELETE|REPLACE)/.test(c.sql))).toBe(true);
    const sql = fake.calls.map(c => c.sql).join(" ");
    expect(sql).not.toMatch(/paciente|beneficiario|numero_guia|valor_|demonstrativo d|recursosGlosa r/i);
  });

  it.each([
    ["sem âncora", []], ["de outro usuário", [{ ...anchor(), userId: 8 }]],
    ["de outro hospital", [{ ...anchor(), estabelecimentoId: 14 }]],
    ["de outra UUID", [{ ...anchor(), nome: `manual-glosa:v1:${hash(13, "73b9d11a-02ae-4e1c-838f-0fe4dbff9257")}:${"a".repeat(64)}:2026-11-03` }]],
  ])("%s retorna apenas nao_confirmado sem presumir rollback", async (_label, ancoras) => {
    const fake = bancoFake({ ancoras });
    expect(await consultarStatusGlosaManual(input)).toEqual({ status: "nao_confirmado" });
    expect(fake.ancoras).toEqual(fake.antes);
    expect(fake.calls.every(c => c.sql.startsWith("SELECT"))).toBe(true);
  });

  it("consulta ausente não impede que commit original atrasado seja observado na próxima consulta", async () => {
    const ancoras: Record<string, unknown>[] = [];
    bancoFake({ ancoras });
    expect(await consultarStatusGlosaManual(input)).toEqual({ status: "nao_confirmado" });
    ancoras.push(anchor()); // simula somente o escritor original, nunca a query
    expect(await consultarStatusGlosaManual(input)).toMatchObject({ status: "concluido" });
  });

  it.each([
    { nome: `manual-glosa:v1:${hash()}:invalid:2026-11-03` },
    { nome: `manual-glosa:v1:${hash()}:${"a".repeat(64)}:2026-02-29` },
    { nome: `manual-glosa:v1:${hash()}:${"a".repeat(64)}:2026-11-31` },
    { nome: `manual-glosa:v1:${hash()}:${"a".repeat(64)}:0999-01-01` },
    { nome: `manual-glosa:v1:${hash()}:${"a".repeat(64)}:2026-11-03:extra` },
    { status: "erro" }, { status: "processando" }, { totalItens: 0 }, { totalItens: 501 },
    { totalItens: 1.5 }, { itensProcessados: 1 }, { s3Key: "object" }, { s3Url: "url" },
    { tipoArquivo: "xml" }, { direcao: "enviado" }, { tamanho: 1 }, { progresso: 99 }, { id: 0 },
  ])("marcador/estado malformado %j falha sem escrever nem informar concluído", async patch => {
    const fake = bancoFake({ ancoras: [{ ...anchor(), ...patch }] });
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.ancoras).toEqual(fake.antes);
    expect(fake.calls.every(c => c.sql.startsWith("SELECT"))).toBe(true);
  });

  it("âncora ambígua exige revisão responsável", async () => {
    const fake = bancoFake({ ancoras: [anchor(), { ...anchor(), id: 102 }] });
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.ancoras).toEqual(fake.antes);
  });
  it.each([
    { podeVisualizar: "nao" }, { podeEditar: "nao" }, { acessoDemonstrativo: "nao" },
    { acessoRecursos: "nao", acessoRecursosGlosa: "nao" },
  ])("nega permissões/módulos %j antes de ler âncora", async patch => {
    const fake = bancoFake({ permissoes: [{ podeVisualizar: "sim", podeEditar: "sim", acessoDemonstrativo: "sim", acessoRecursos: "sim", acessoRecursosGlosa: "nao", ...patch }] });
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.some(c => c.sql.includes("FROM arquivos"))).toBe(false);
  });
  it("aceita módulo legado de recursosGlosa se demonstrativo e editar autorizados", async () => {
    bancoFake({ permissoes: [{ podeVisualizar: "sim", podeEditar: "sim", acessoDemonstrativo: "sim", acessoRecursos: "nao", acessoRecursosGlosa: "sim" }] });
    expect(await consultarStatusGlosaManual(input)).toMatchObject({ status: "concluido" });
  });
  it("admin é relido no banco; não pula hospital nem escopo do próprio usuário", async () => {
    const fake = bancoFake({ usuarios: [{ id: 7, role: "admin" }], permissoes: [] });
    expect(await consultarStatusGlosaManual(input)).toMatchObject({ status: "concluido" });
    expect(fake.calls.some(c => c.sql.includes("FROM permissoesEstabelecimento"))).toBe(false);
    expect(fake.calls.find(c => c.sql.includes("FROM arquivos"))?.params[1]).toBe(7);
  });
  it.each([
    { hospitais: [] }, { hospitais: [{ id: 13, ativo: "nao" }] },
    { hospitais: [{ id: 14, ativo: "sim" }] }, { usuarios: [] },
    { usuarios: [{ id: 8, role: "admin" }] }, { permissoes: [] },
    { usuarios: [{ id: 7, role: "user" }, { id: 7, role: "admin" }] },
  ])("identidade/acesso inválido %j não consulta âncora", async options => {
    const fake = bancoFake(options);
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.some(c => c.sql.includes("FROM arquivos"))).toBe(false);
  });
  it.each([
    { estabelecimentoId: 0 }, { estabelecimentoId: 1.5 }, { estabelecimentoId: 2_147_483_648 },
    { userId: 0 }, { userId: "7" }, { idempotencyKey: "PHI-INVALIDA" },
  ])("entrada inválida %j falha ANTES de getDb", async patch => {
    await expect(consultarStatusGlosaManual({ ...input, ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("banco indisponível/retorno inválido nunca vira nao_confirmado nem concluído", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    bancoFake({ respostaInvalida: true });
    await expect(consultarStatusGlosaManual(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
