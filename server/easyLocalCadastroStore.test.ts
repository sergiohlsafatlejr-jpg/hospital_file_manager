import { rootCertificates } from "node:tls";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  getConnection: vi.fn(),
  getRawPool: vi.fn(),
}));
vi.mock("./db", () => ({ getRawPool: m.getRawPool }));
import {
  obterEasyLocalCadastro,
  salvarEasyLocalCadastro,
  resolverEasyLocalConfig,
  prepararEasyLocalRascunho,
} from "./easyLocalCadastroStore";
import {
  encryptEasyLocalPayload,
  decryptEasyLocalPayload,
} from "./easyLocalCadastroVault";
import type { EasyLocalCadastroInput } from "../shared/easyLocalCadastro";
const input: EasyLocalCadastroInput = {
  nome: "Central fictícia",
  descricao: "Teste",
  tipo: "postgresql",
  host: "central.example.org",
  porta: 5432,
  banco: "db_teste",
  usuario: "leitor_teste",
  senha: "senha-ficticia",
  tls: "system",
  revisao: null,
  confirmarConexaoCentral: true,
};
const rev = "11111111-1111-4111-8111-111111111111";
const envKeys = [
  "EASYLOCAL_CONNECTION_ENCRYPTION_KEY",
  "EASYLOCAL_PG_HOST",
  "EASYLOCAL_PG_PORT",
  "EASYLOCAL_PG_DATABASE",
  "EASYLOCAL_PG_USER",
  "EASYLOCAL_PG_PASSWORD",
  "EASYLOCAL_PG_CA_CERT",
];
let original: Record<string, string | undefined>;
let rows: Record<string, unknown>[];
function row() {
  const timestamp = "2026-10-14T00:00:00.000Z";
  return {
    id: 91,
    nome: "__EASYLOCAL_SERVER__",
    descricao: "easylocal-cadastro-cifrado-v1",
    tipo: "postgresql",
    host: "configuracao-cifrada",
    porta: 5432,
    banco: "EASYLOCAL",
    usuario: "servidor",
    ssl: "sim",
    estabelecimentoId: null,
    ativo: "nao",
    senhaEncriptada: encryptEasyLocalPayload({
      v: 1,
      nome: input.nome,
      descricao: input.descricao,
      host: input.host,
      porta: input.porta,
      banco: input.banco,
      usuario: input.usuario,
      password: input.senha,
      ca: null,
      rev,
      usuarioId: 7,
      timestamp,
      audit: { acao: "salvar", usuarioId: 7, timestamp },
    }),
  };
}
function writtenPayload() {
  const call = m.execute.mock.calls.find(([sql]) =>
    /^(INSERT|UPDATE)/.test(sql)
  );
  expect(call).toBeDefined();
  const envelope = call![1].find(
    (v: unknown) => typeof v === "string" && v.startsWith('{"v":1')
  );
  return decryptEasyLocalPayload<Record<string, unknown>>(envelope);
}
beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  original = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  for (const k of envKeys) delete process.env[k];
  process.env.EASYLOCAL_CONNECTION_ENCRYPTION_KEY = "ab".repeat(32);
  m.getRawPool.mockResolvedValue({ getConnection: m.getConnection });
  m.getConnection.mockResolvedValue(m);
  m.query.mockResolvedValue([[{ versao: "8.0-TiDB" }]]);
  m.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM estabelecimentos")) return [[{ id: 1 }]];
    if (sql.includes("FROM integracao_conexoes")) return [rows];
    return [{ insertId: 91, affectedRows: 1 }];
  });
  m.commit.mockResolvedValue(undefined);
  m.rollback.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const k of envKeys) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});
describe("cadastro global EASYLocal", () => {
  it("usa ENV somente na ausência legítima de registro e não cria nada", async () => {
    Object.assign(process.env, {
      EASYLOCAL_PG_HOST: "env.example.org",
      EASYLOCAL_PG_PORT: "5432",
      EASYLOCAL_PG_DATABASE: "teste",
      EASYLOCAL_PG_USER: "leitor",
      EASYLOCAL_PG_PASSWORD: "env-ficticio",
      EASYLOCAL_PG_CA_CERT: "SYSTEM",
    });
    expect((await resolverEasyLocalConfig())?.password).toBe("env-ficticio");
    const dto = await obterEasyLocalCadastro();
    expect(dto.origem).toBe("servidor");
    expect(JSON.stringify(dto)).not.toContain("env-ficticio");
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("retorna ausente sem senha e declara a chave faltante sem fallback JWT", async () => {
    delete process.env.EASYLOCAL_CONNECTION_ENCRYPTION_KEY;
    expect(await obterEasyLocalCadastro()).toEqual({
      origem: "ausente",
      chaveDisponivel: false,
      revisao: null,
      configuracao: null,
    });
    await expect(salvarEasyLocalCadastro(input, 7)).rejects.toThrow("chave");
    expect(m.getConnection).toHaveBeenCalledTimes(1);
  });
  it("lê cadastro SYSTEM sem devolver senha, envelope ou auditoria", async () => {
    rows = [row()];
    const dto = await obterEasyLocalCadastro();
    expect(dto).toMatchObject({
      origem: "banco",
      revisao: rev,
      configuracao: { nome: input.nome, tls: "system", senhaConfigurada: true },
    });
    expect(JSON.stringify(dto)).not.toMatch(
      /senha-ficticia|ciphertext|timestamp|usuarioId/
    );
    expect((await resolverEasyLocalConfig())?.host).toBe(input.host);
  });
  it("cadastro sem chave nunca resolve ENV em substituição", async () => {
    rows = [row()];
    delete process.env.EASYLOCAL_CONNECTION_ENCRYPTION_KEY;
    expect(await obterEasyLocalCadastro()).toMatchObject({
      origem: "banco",
      chaveDisponivel: false,
      configuracao: null,
    });
    await expect(resolverEasyLocalConfig()).rejects.toThrow("chave");
  });
  it("falha fechada para registro corrompido, duplicado ou banco indisponível", async () => {
    rows = [row()];
    rows[0].senhaEncriptada = "nao-cifrado";
    await expect(resolverEasyLocalConfig()).rejects.toThrow("integridade");
    rows = [row(), row()];
    await expect(obterEasyLocalCadastro()).rejects.toMatchObject({
      code: "CONFLICT",
    });
    m.execute.mockRejectedValueOnce(new Error("host-segredo senha-ficticia"));
    await expect(resolverEasyLocalConfig()).rejects.toThrow(
      "Não foi possível consultar"
    );
    expect(m.release).toHaveBeenCalledTimes(3);
  });
  it("serializa a primeira criação e guarda apenas placeholders e envelope", async () => {
    expect(await salvarEasyLocalCadastro(input, 7)).toEqual({ sucesso: true });
    expect(m.query).toHaveBeenCalledWith("BEGIN PESSIMISTIC");
    expect(
      m.execute.mock.calls.some(
        ([s]) => s.includes("FROM estabelecimentos") && s.includes("FOR UPDATE")
      )
    ).toBe(true);
    expect(
      m.execute.mock.calls.some(
        ([s]) =>
          s.includes("FROM integracao_conexoes") && s.includes("FOR UPDATE")
      )
    ).toBe(true);
    const write = m.execute.mock.calls.find(([s]) => s.startsWith("INSERT"));
    expect(JSON.stringify(write)).not.toContain(input.senha);
    expect(JSON.stringify(write)).not.toContain(input.host);
    expect(writtenPayload()).toMatchObject({
      password: input.senha,
      usuarioId: 7,
      ca: null,
    });
    expect(m.commit).toHaveBeenCalledOnce();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it("preserva senha omitida, atualiza revisão e não repete gravação", async () => {
    rows = [row()];
    await salvarEasyLocalCadastro({ ...input, senha: "", revisao: rev }, 8);
    expect(writtenPayload()).toMatchObject({
      password: input.senha,
      usuarioId: 8,
    });
    expect(writtenPayload().rev).not.toBe(rev);
    expect(
      m.execute.mock.calls.filter(([s]) => s.startsWith("UPDATE"))
    ).toHaveLength(1);
  });
  it("recusa revisão obsoleta e marcador inesperado sem gravar", async () => {
    rows = [row()];
    await expect(salvarEasyLocalCadastro(input, 7)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    rows[0].ativo = "sim";
    await expect(
      salvarEasyLocalCadastro({ ...input, revisao: rev }, 7)
    ).rejects.toThrow("conferência");
    expect(m.commit).not.toHaveBeenCalled();
    expect(m.execute.mock.calls.some(([s]) => /^(INSERT|UPDATE)/.test(s))).toBe(
      false
    );
  });
  it("valida senha inicial, certificado e dados sem testar ou salvar", async () => {
    await expect(
      prepararEasyLocalRascunho({ ...input, senha: "" })
    ).rejects.toThrow("senha");
    await expect(
      prepararEasyLocalRascunho({
        ...input,
        tls: "custom",
        certificado:
          "-----BEGIN CERTIFICATE-----\nerrado\n-----END CERTIFICATE-----",
      })
    ).rejects.toThrow("Certificado");
    const draft = await prepararEasyLocalRascunho(input);
    expect(draft.password).toBe(input.senha);
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("salva e preserva certificado customizado sem devolvê-lo", async () => {
    await salvarEasyLocalCadastro(
      { ...input, tls: "custom", certificado: rootCertificates[0] },
      7
    );
    const payload = writtenPayload();
    expect(payload.ca).toBe(rootCertificates[0]);
    rows = [row()];
    rows[0].senhaEncriptada = encryptEasyLocalPayload(payload);
    const dto = await obterEasyLocalCadastro();
    expect(dto.configuracao?.certificadoConfigurado).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("BEGIN CERTIFICATE");
    expect(
      (
        await prepararEasyLocalRascunho({
          ...input,
          senha: "",
          tls: "custom",
          certificado: "",
          revisao: String(payload.rev),
        })
      ).ca
    ).toBe(rootCertificates[0]);
    await expect(
      prepararEasyLocalRascunho({
        ...input,
        tls: "custom",
        certificado: rootCertificates[0] + "PRIVATE KEY",
      })
    ).rejects.toThrow("Certificado");
  });
  it("commit incerto não produz sucesso ou retry automático", async () => {
    m.commit.mockRejectedValueOnce(new Error("detalhe-sensivel"));
    await expect(salvarEasyLocalCadastro(input, 7)).rejects.toThrow(
      "Confira antes de repetir"
    );
    expect(m.commit).toHaveBeenCalledOnce();
    expect(
      m.execute.mock.calls.filter(([s]) => s.startsWith("INSERT"))
    ).toHaveLength(1);
    expect(m.release).toHaveBeenCalledOnce();
  });
});
