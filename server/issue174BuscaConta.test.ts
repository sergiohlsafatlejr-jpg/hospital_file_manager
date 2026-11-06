import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const m = vi.hoisted(() => ({ connect: vi.fn(), remote: vi.fn(), disconnect: vi.fn() }));
vi.mock("./services/comparadorPadroes", () => ({ compararItensComPadroes: vi.fn(() => { throw Error("COMPARATOR_FORBIDDEN"); }) }));
vi.mock("./connectors/MysqlConnector", () => ({ MysqlConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/SqlServerConnector", () => ({ SqlServerConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/OracleConnector", () => ({ OracleConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/EasyVisionConnector", () => ({ EasyVisionConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
import { configuracaoFabricaBanco, lerContaFabricaBanco } from "./fabricaBancoOrigem";
import { exigirIdentidadeContaBanco, prepararColecaoBanco } from "./fabricaBancoSnapshot";
import { compileReadOnlyAccountQuery } from "./connectors/sqlQuerySafety";

const conv = { id: 41, nome: "CONVENIO SINTETICO", codigo: "CODE-SYN", registroAns: "123456", ativo: "sim", estabelecimentoId: 20 };
const row = { numconta: "700", numatend: "800", guiacobra: "GUIA-SYN", nomepaciente: "PACIENTE SINTETICO", matricula: "CARTEIRA-SYN-A", nomeconv: conv.nome, mesprod: "2026-10", dataint: "2026-10-01", datasai: "2026-10-03", tipoatend: "AMB", procdisco: "PROC-SYN", quantidade: "1", vl_unitario: "10.00", vl_faturado: "10.00" };
const map = { id: 11, estabelecimentoId: 20, ativo: "sim", nome: "Busca Conta - Sintetica", conexaoOrigemId: 22, queryOrigem: "SELECT b.numconta FROM lancamen a LEFT JOIN contas b ON b.numconta = a.numconta WHERE b.numconta = $1 AND b.codplaco = 123" };
const connection = { id: 22, estabelecimentoId: 20, ativo: "sim", tipo: "postgresql", host: "synthetic.invalid", banco: "SYNTHETIC", usuario: "SYNTHETIC", senhaEncriptada: Buffer.from("SYNTHETIC-NOT-REAL").toString("base64"), porta: 5432 };
function dbFixture(batches: any[][]) {
  let reads = 0;
  const filters: any[] = [];
  return { filters, get reads() { return reads; }, select() { return { from() { return { where: async (filter: any) => { filters.push(filter); return batches[reads++] ?? []; } }; } }; }, insert() { throw Error("WRITE_FORBIDDEN"); }, update() { throw Error("WRITE_FORBIDDEN"); }, execute() { throw Error("RAW_SQL_FORBIDDEN"); } };
}
const prepare = (rows: any[], insurers = [conv], request = "700") => prepararColecaoBanco(dbFixture([insurers]), 20, request, rows);
beforeEach(() => { vi.clearAllMocks(); m.connect.mockResolvedValue(true); m.remote.mockResolvedValue([row]); m.disconnect.mockResolvedValue(undefined); });

describe("Issue174 B1 — query configurada preservada e identidade conta/atendimento", () => {
  it.each(["mysql", "sqlserver", "oracle", "postgresql"])("encaminha query exata e bind separado em %s", async tipo => {
    const hostile = "SYNTHETIC-' OR 1=1; DELETE --";
    const query = map.queryOrigem + " AND (b.numconta = $1 OR b.numatend = $1)";
    const db = dbFixture([[{ ...map, queryOrigem: query }], [{ ...connection, tipo }]]);
    await lerContaFabricaBanco(db, 20, ` ${hostile} `);
    expect(m.remote).toHaveBeenCalledTimes(1);
    expect(m.remote).toHaveBeenCalledWith(query, [hostile]);
    const compiled = compileReadOnlyAccountQuery(query, [hostile], tipo === "postgresql" ? "postgres" : tipo as "mysql" | "sqlserver" | "oracle");
    expect(compiled.sql).toContain("b.codplaco = 123");
    expect(compiled.sql).not.toContain(hostile);
    expect(compiled.values).toEqual(tipo === "mysql" ? [hostile, hostile, hostile] : [hostile]);
    expect(m.disconnect).toHaveBeenCalledTimes(1);
  });
  it.each([
    map.queryOrigem,
    "--Tasy\nWITH c AS (SELECT nr_interno_conta, nr_atendimento, REPLACE(nome, '\\n', '') AS nome FROM contas WHERE nr_atendimento=$1 AND codplaco=123) SELECT * FROM c",
    "SELECT nr_interno_conta AS numconta, nr_atendimento AS numatend, LPAD(CAST($1 AS VARCHAR2(50)), 3, '0') FROM contas WHERE nr_atendimento=$1 AND ativo='S'",
  ])("não troca JOINs, filtros, comentários ou funções da query %s", async query => {
    const db = dbFixture([[{ ...map, queryOrigem: query }], [connection]]);
    expect((await configuracaoFabricaBanco(db, 20)).query).toBe(query);
    await lerContaFabricaBanco(dbFixture([[{ ...map, queryOrigem: query }], [connection]]), 20, "700");
    expect(m.remote).toHaveBeenCalledWith(query, ["700"]);
  });
  it.each([
    "UPDATE contas SET valor=$1",
    map.queryOrigem + "; DELETE FROM contas",
    "SELECT b.numconta FROM lancamen a LEFT JOIN contas b ON a.numconta=b.numconta WHERE b.numconta=$1; DELETE FROM contas",
    "SELECT numconta FROM contas WHERE numconta=:name OR numatend=$1",
  ])("query insegura que poderia conter gatilho antigo não é ocultada: %s", async query => {
    await expect(lerContaFabricaBanco(dbFixture([[{ ...map, queryOrigem: query }], [connection]]), 20, "700")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.connect).not.toHaveBeenCalled(); expect(m.remote).not.toHaveBeenCalled();
  });
  it("comentário --Tasy sem espaço em MySQL falha antes de conectar", async () => {
    await expect(lerContaFabricaBanco(dbFixture([[{ ...map, queryOrigem: "--Tasy\nSELECT numconta FROM contas WHERE numconta=$1" }], [{ ...connection, tipo: "mysql" }]]), 20, "700")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.connect).not.toHaveBeenCalled(); expect(m.remote).not.toHaveBeenCalled();
  });
  it("conta exata conserva atendimento diferente e itens só daquela conta", async () => {
    const result = await prepare([row, { ...row, procdisco: "PROC-SYN-2" }]);
    expect(result.numeroConta).toBe("700"); expect(result.cabecalho?.numeroAtendimento).toBe("800"); expect(result.valorTotal).toBe("20.00");
  });
  it("atendimento único resolve conta REAL sem usar atendimento como conta", async () => {
    const result = await prepare([row], [conv], "800");
    expect(result.numeroConta).toBe("700"); expect(result.cabecalho?.numeroContaHospital).toBe("700");
    expect(result.itens[0].numeroConta).toBe("700");
    expect(() => exigirIdentidadeContaBanco({ hospitalEstabelecimentoId: 20, numeroContaHospital: "700", numeroAtendimento: "800", numeroGuia: row.guiacobra, nomePaciente: row.nomepaciente, convenioId: 41 }, result)).not.toThrow();
    expect(() => exigirIdentidadeContaBanco({ hospitalEstabelecimentoId: 20, numeroContaHospital: "800" }, result)).toThrow();
  });
  it.each(["700", "800"])("duas contas para conta/atendimento %s são conflito; não escolhe exata/MAX", async request => {
    await expect(prepare([row, { ...row, numconta: "900", vl_faturado: "90.00" }], [conv], request)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("mesmo número de conta e atendimento não funde outra conta", async () => {
    await expect(prepare([{ ...row, numatend: "700" }, { ...row, numatend: "700", numconta: "900" }])).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each(["999", "GUIA-SYN", ""])("identificador %s não correspondente a conta/atendimento falha fechado", async request => {
    await expect(prepare([row], [conv], request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("nunca inventa conta em resultado só de atendimento", async () => {
    await expect(prepare([{ ...row, numconta: null }], [conv], "800")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("Issue174 B2 — ausência opcional não mascara conflitos explícitos", () => {
  it.each([
    ["numatend", "900"], ["guiacobra", "OUTRA-GUIA"], ["matricula", "CARTEIRA-SYN-B"],
    ["mesprod", "2026-11"], ["dataint", "2026-11-01"], ["datasai", "2026-11-03"],
    ["nomepaciente", "OUTRO PACIENTE"], ["nomeconv", "OUTRO CONVENIO"], ["codconv", "OUTRO-CODIGO"],
    ["registro_ans", "654321"], ["tipoatend", "INT"],
  ])("%s presente divergente falha em ambas as ordens", async (field, value) => {
    const base = { ...row, codconv: conv.codigo, registro_ans: conv.registroAns };
    const changed = { ...base, [field]: value };
    for (const rows of [[base, changed], [changed, base]]) {
      const db = dbFixture([[conv]]);
      await expect(prepararColecaoBanco(db, 20, "700", rows)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.reads).toBe(0);
    }
  });
  it.each(["numatend", "guiacobra", "matricula", "mesprod", "dataint", "datasai", "tipoatend", "codconv", "registro_ans"])("%s ausente é enriquecido por único valor presente", async field => {
    const full = { ...row, codconv: conv.codigo, registro_ans: conv.registroAns };
    const absent = { ...full, [field]: null };
    const a = await prepare([absent, full]), b = await prepare([full, absent]);
    expect(a.cabecalho).toEqual(b.cabecalho); expect(a.hash).toBe(b.hash); expect(a.itens).toHaveLength(2);
  });
  it("todos opcionais ausentes permanecem null sem inventar dados", async () => {
    const result = await prepare([{ ...row, matricula: " ", mesprod: null, dataint: null, datasai: null, tipoatend: null }]);
    expect(result.cabecalho).toMatchObject({ carteiraBeneficiario: null, competencia: null, dataEntrada: null, dataAlta: null, tipoAtendimento: null });
  });
  it("nomes canônicos e competência/data com formas equivalentes são aceitos", async () => {
    const result = await prepare([row, { ...row, nomepaciente: " paciente sintético ", nomeconv: "Convênio sintético", mesprod: "2026/10", dataint: new Date("2026-10-01T12:00:00Z") }]);
    expect(result.cabecalho?.competencia).toBe("2026/10"); expect(result.itens).toHaveLength(2);
  });
  it.each(["2026-02-30", "2026-13-01", "not-a-date", "01/10/2026"])("data opcional inválida presente não vira ausência: %s", async value => {
    await expect(prepare([row, { ...row, datasai: value }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it.each(["2026-00", "2026-13", "outubro"])("competência inválida presente falha: %s", async value => {
    await expect(prepare([{ ...row, mesprod: value }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it.each(["numconta", "nomepaciente"])("identidade obrigatória %s ausente em uma linha não é herdada", async field => {
    await expect(prepare([row, { ...row, [field]: null }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("sem evidência de convênio em uma linha não herda entidade", async () => {
    await expect(prepare([row, { ...row, nomeconv: null }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("nem ausência intermediária esconde A/null/B", async () => {
    await expect(prepare([row, { ...row, matricula: null }, { ...row, matricula: "B" }])).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each([{ NUMCONTA: "900" }, { nr_atendimento: "900" }, { carteira: "B" }, { competencia: "2026/11" }, { data_alta: "2026-11-03" }])("aliases presentes divergentes não usam primeiro: %j", async changes => {
    await expect(prepare([{ ...row, ...changes }])).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("Issue174 B3 — convênio canônico, global NULL ou proprietário, ativo", () => {
  it.each([20, null])("nome canônico exato resolve cadastro elegível %s", async estabelecimentoId => {
    expect((await prepare([row], [{ ...conv, estabelecimentoId } as any])).cabecalho?.convenioId).toBe(41);
  });
  it.each([{ codconv: conv.codigo }, { codconv: conv.registroAns }, { registro_ans: conv.registroAns }])("código/registro explícito resolve sem depender do nome descritivo: %j", async fields => {
    expect((await prepare([{ ...row, nomeconv: "NOME DE EXIBICAO DA ORIGEM", ...fields }])).cabecalho?.convenioId).toBe(41);
  });
  it("SQL configurada pode projetar equivalência canônica explícita", async () => {
    const query = "SELECT numconta, numatend, CASE WHEN nomeconv='ERP-SYN-ALIAS' THEN 'CONVENIO SINTETICO' ELSE nomeconv END AS nomeconv FROM contas WHERE numatend=$1 AND codplaco=123";
    const remote = await lerContaFabricaBanco(dbFixture([[{ ...map, queryOrigem: query }], [connection]]), 20, "800");
    expect(m.remote).toHaveBeenCalledWith(query, ["800"]);
    expect((await prepare(remote.dados, [conv], "800")).cabecalho?.convenioId).toBe(41);
  });
  it.each([
    { ativo: "nao" }, { estabelecimentoId: 99 }, { estabelecimentoId: undefined }, { id: 0 }, { id: "not-id" },
  ])("cadastro inativo/alheio/indefinido/inválido é recusado: %j", async changes => {
    await expect(prepare([row], [{ ...conv, ...changes } as any])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("escopo SQL exige ativo e proprietário OU NULL e pós-filtro confere", async () => {
    const db = dbFixture([[conv, { ...conv, id: 42, ativo: "nao" }, { ...conv, id: 43, estabelecimentoId: 99 }]]);
    const result = await prepararColecaoBanco(db, 20, "700", [row]);
    const filter = new MySqlDialect().sqlToQuery(db.filters[0]);
    expect(filter.sql).toContain("is null"); expect(filter.sql).toContain(" or "); expect(filter.params).toEqual([20, "sim"]);
    expect(result.cabecalho?.convenioId).toBe(41);
  });
  it.each(["CONVENIO SINTETICO PREMIUM", "SINTETICO", "CONVENIOSINTETICO", "CONVENIO-SINTETICO"])("nome parcial/pontuação diferente %s não estabelece identidade", async nomeconv => {
    await expect(prepare([{ ...row, nomeconv }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it.each([{ codconv: "WRONG" }, { registro_ans: "WRONG" }, { codconv: conv.codigo, registro_ans: "WRONG" }])("evidência explícita errada não faz fallback por nome: %j", async fields => {
    await expect(prepare([{ ...row, ...fields }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("linha sem código não herda código da outra para vincular nome não canônico", async () => {
    await expect(prepare([{ ...row, nomeconv: "ALIAS-SYN", codconv: conv.codigo }, { ...row, nomeconv: "ALIAS-SYN" }])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("linhas com evidências diferentes que resolvem entidades distintas falham", async () => {
    const other = { ...conv, id: 42, nome: "OUTRO CONVENIO", codigo: "OTHER-SYN", registroAns: "654321" };
    await expect(prepare([{ ...row, nomeconv: other.nome, codconv: conv.codigo }, { ...row, nomeconv: other.nome }], [conv, other])).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each([{}, { codconv: conv.codigo }, { registro_ans: conv.registroAns }])("global + local equivalente é ambíguo, sem preferência: %j", async fields => {
    await expect(prepare([{ ...row, ...fields }], [conv, { ...conv, id: 42, estabelecimentoId: null } as any])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
