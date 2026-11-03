import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "../_core/context";
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), permissao: vi.fn(), construir: vi.fn(), executar: vi.fn(), decrypt: vi.fn(),
}));
vi.mock("../db", () => ({ getDb: mocks.getDb, verificarPermissaoEstabelecimento: mocks.permissao, verificarAcessoModulo: vi.fn() }));
vi.mock("../_core/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../_core/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("./cofreCredenciais", async (original) => ({ ...await original<typeof import("./cofreCredenciais")>(), obterSenhaParaRobo: mocks.decrypt }));
vi.mock("./robos/RoboUnimed", () => ({ RoboUnimed: class { constructor() { mocks.construir("UNIMED"); } executar = mocks.executar; } }));
vi.mock("./robos/RoboIpasgo", () => ({ RoboIpasgo: class { constructor() { mocks.construir("IPASGO"); } executar = mocks.executar; } }));
vi.mock("./robos/RoboSaudeCaixa", () => ({ RoboSaudeCaixa: class { constructor() { mocks.construir("SAUDE_CAIXA"); } executar = mocks.executar; } }));
vi.mock("./robos/RoboCassi", () => ({ RoboCassi: class { constructor() { mocks.construir("CASSI"); } executar = mocks.executar; } }));
import { rpaRouter } from "../routers/rpaRouter";
const dialect = new MySqlDialect();
type Row = Record<string, unknown>;
let cadastro: Row;
let vinculos: Row[];
let credenciais: Row[];
let consultas: Array<{ table: string; params: unknown[] }>;
const input = { convenioNome: "UNIMED" as const, estabelecimentoId: 71, convenioId: 81, codigoPrestadorOperadora: "SYNTH-PAY", url: "https://portal.unimedgoiania.coop.br/login", login: "synthetic", senha: "synthetic", competencia: "04/2026" };
const caller = () => rpaRouter.createCaller({ user: { id: 7, role: "admin" } } as TrpcContext);
function bancoSintetico() {
  return {
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: (condition: SQL) => {
      const name = getTableName(table);
      const { params } = dialect.sqlToQuery(condition);
      consultas.push({ table: name, params });
      const rows = name === "convenios" ? [cadastro] : name === "convenioEstabelecimentoPrestador" ? vinculos : credenciais;
      return Object.assign(Promise.resolve(rows), { limit: (n: number) => Promise.resolve(rows.slice(0, n)) });
    } }) }),
    update: () => ({ set: () => ({ where: vi.fn(async () => []) }) }),
  };
}
beforeEach(() => {
  vi.clearAllMocks(); consultas = [];
  cadastro = { id: 81, estabelecimentoId: null, nome: "Unimed Goiânia", registroAns: "382876", ativo: "sim" };
  vinculos = [{ estabelecimentoId: 71, convenioId: 81, codigoPrestador: "SYNTH-PAY", ativo: "sim" }];
  credenciais = [{ id: 91, estabelecimentoId: 71, convenioId: 81, codigoPrestadorOperadora: "SYNTH-PAY", registroAns: "382876", ativo: "sim", statusCredencial: "ATIVA", login: "synthetic", senha: "synthetic-cipher", urlLogin: input.url }];
  mocks.getDb.mockResolvedValue(bancoSintetico()); mocks.permissao.mockResolvedValue(true);
  mocks.decrypt.mockReturnValue("synthetic-only");
  mocks.executar.mockResolvedValue({ arquivosBaixados: 2, pastaDownload: "/synthetic/private", screenshotBase64: "synthetic-secret", login: "synthetic-secret" });
});
describe("caller real executarRoboBuscaDemonstrativo", () => {
  it.each(["UNIMED", "IPASGO", "CASSI", "SAUDE_CAIXA"] as const)("passa escopo completo e ANS canônico ao robô %s sem consultar cofre para login manual", async operadora => {
    const nomes = { UNIMED: "Unimed Goiânia", IPASGO: "IPASGO", CASSI: "CASSI", SAUDE_CAIXA: "Saúde Caixa" };
    const urls = { UNIMED: input.url, IPASGO: "https://portalos.ipasgo.go.gov.br/login", CASSI: "https://servicosonline.cassi.com.br/login", SAUDE_CAIXA: "https://autenticacao.saude.caixa.gov.br/" };
    cadastro.nome = nomes[operadora]; cadastro.registroAns = undefined;
    if (operadora === "UNIMED") cadastro.registroAns = "382876";
    const result = await caller().executarRoboBuscaDemonstrativo({ ...input, convenioNome: operadora, url: urls[operadora] });
    expect(mocks.executar).toHaveBeenCalledWith({ url: urls[operadora], login: input.login, senha: input.senha, estabelecimentoId: 71, convenioId: 81, codigoPrestadorOperadora: "SYNTH-PAY", registroAns: cadastro.registroAns }, { competencia: "04/2026" });
    expect(mocks.construir).toHaveBeenCalledTimes(1);
    expect(mocks.construir).toHaveBeenCalledWith(operadora);
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(consultas.some(q => q.table === "credenciais_portais")).toBe(false);
    expect(result).toEqual({ sucesso: true, resultado: { status: "sucesso", mensagem: "Execução do robô finalizada.", arquivosBaixados: 2 } });
    expect(consultas[0].params).toEqual([81]);
    expect(consultas[1].params).toEqual([71, 81, "sim"]);
  });
  it.each(["convenioId", "codigoPrestadorOperadora"])("recusa contrato incompleto %s antes de construir", async campo => {
    const incompleto: Record<string, unknown> = { ...input }; delete incompleto[campo];
    await expect(caller().executarRoboBuscaDemonstrativo(incompleto as typeof input)).rejects.toThrow();
    expect(mocks.construir).not.toHaveBeenCalled(); expect(mocks.executar).not.toHaveBeenCalled();
  });
  it.each(["hospital", "inativo", "operadora", "ans", "prestador", "ambiguo"])("rejeita conflito canônico %s com credenciais manuais antes de construir", async conflito => {
    if (conflito === "hospital") cadastro.estabelecimentoId = 72;
    if (conflito === "inativo") cadastro.ativo = "nao";
    if (conflito === "operadora") cadastro.nome = "CASSI";
    if (conflito === "ans") cadastro.registroAns = "999999";
    if (conflito === "prestador") vinculos[0].estabelecimentoId = 72;
    if (conflito === "ambiguo") vinculos.push({ ...vinculos[0] });
    await expect(caller().executarRoboBuscaDemonstrativo({ ...input, registroAns: "382876" })).rejects.toThrow("Execução RPA recusada");
    expect(mocks.construir).not.toHaveBeenCalled(); expect(mocks.executar).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("resolve somente a credencial ativa do hospital/convênio/prestador informado", async () => {
    await caller().executarRoboBuscaDemonstrativo({ ...input, login: "", senha: "" });
    expect(consultas.at(-1)?.params).toEqual([81, 71, "SYNTH-PAY", "sim", "ATIVA"]);
    expect(mocks.decrypt).toHaveBeenCalledWith("synthetic-cipher");
    expect(mocks.executar.mock.calls[0][0].registroAns).toBe("382876");
  });
  it.each(["duplicada", "pausada", "outraAns", "outroHospital"])("não escolhe primeira credencial %s", async modo => {
    if (modo === "duplicada") credenciais.push({ ...credenciais[0], id: 92 });
    if (modo === "pausada") credenciais[0].statusCredencial = "PAUSADA";
    if (modo === "outraAns") credenciais[0].registroAns = "999999";
    if (modo === "outroHospital") credenciais[0].estabelecimentoId = 72;
    await expect(caller().executarRoboBuscaDemonstrativo({ ...input, login: "", senha: "" })).rejects.toThrow("Execução RPA recusada");
    expect(mocks.construir).not.toHaveBeenCalled(); expect(mocks.executar).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it("recusa hospital não autorizado antes de consultar cadastro", async () => {
    mocks.permissao.mockResolvedValue(false);
    await expect(caller().executarRoboBuscaDemonstrativo(input)).rejects.toThrow("sem permissão");
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.construir).not.toHaveBeenCalled();
  });
  it.each(["url", "ansCanonico"])("recusa %s de outra operadora sem construir/navegar", async modo => {
    if (modo === "ansCanonico") cadastro.registroAns = "346659";
    await expect(caller().executarRoboBuscaDemonstrativo({ ...input, url: modo === "url" ? "https://servicosonline.cassi.com.br/login" : input.url })).rejects.toThrow("Execução RPA recusada");
    expect(mocks.construir).not.toHaveBeenCalled(); expect(mocks.executar).not.toHaveBeenCalled();
  });
});
