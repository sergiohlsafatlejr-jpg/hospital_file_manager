import { beforeEach, describe, it, expect, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getTableColumns } from "drizzle-orm";
const m = vi.hoisted(() => ({ getDb: vi.fn(), permission: vi.fn(), compare: vi.fn(), remote: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("./db", async original => ({ ...(await original<any>()), getDb: m.getDb, verificarPermissaoEstabelecimento: m.permission }));
vi.mock("./services/comparadorPadroes", () => ({ compararItensComPadroes: m.compare, compararContaComPadroes: vi.fn(), executarComparacaoESalvar: vi.fn(), resolverConvenioIdParaConta: vi.fn() }));
vi.mock("./contaContextoMedicoDrizzle", () => ({ criarServicoContaContextoMedicoParaUsuario: vi.fn() }));
vi.mock("./faturamentoUnificadoService", () => ({ popularDeXmlTissArquivoRestrito: vi.fn() }));
vi.mock("./fabricaXmlSeguro", () => ({ criarArquivoXmlFabricaProtegido: vi.fn(), confirmarArquivoXmlFabrica: vi.fn(), decodificarXmlFabricaBase64: vi.fn() }));
vi.mock("./connectors/EasyVisionConnector", () => ({ EasyVisionConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/OracleConnector", () => ({ OracleConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/MysqlConnector", () => ({ MysqlConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
vi.mock("./connectors/SqlServerConnector", () => ({ SqlServerConnector: class { conectar = m.connect; executarQuerySomenteLeitura = m.remote; desconectar = m.disconnect; } }));
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";
import { contasConvenioRouter } from "./routers/contasConvenioRouter";
import { fabricaContas, fabricaHistoricoFluxo, contasConvenioItens, contasConvenioResumo, integracaoMapeamentos, integracaoConexoes, estabelecimentos, permissoesEstabelecimento, convenios } from "../drizzle/schema";
import { versaoContaBanco, prepararColecaoBanco } from "./fabricaBancoSnapshot";
import { filtroItemBancoAtivo, filtroResumoBancoAtivo } from "./fabricaBancoLeitura";
const dialect = new MySqlDialect();
const user = { id: 71, role: "user", name: "Operador sintético", email: "synthetic@example.invalid" };
const caller = () => fabricaFaturamentoRouter.createCaller({ user, req: {}, res: {} } as any);
const details = () => contasConvenioRouter.createCaller({ user, req: {}, res: {} } as any);
const row = { numconta: "CONTA-A", numatend: "ATEND-A", guiacobra: "GUIA-A", pacientenome: "Paciente sintético", nomeconv: "Convênio sintético", codconv: "SYN", codigoitem: "ITEM-A", descricao: "Procedimento sintético", quantidade: "1", valorunitario: "50.00", valortotal: "50.00", dataexecucao: "2026-10-01", competencia: "2026-10", datainternacao: "2026-10-01" };
const account = { id: 9, hospitalEstabelecimentoId: 20, setorAtual: "faturamento", statusSetor: "em_andamento", numeroContaHospital: "CONTA-A", numeroAtendimento: "ATEND-A", numeroGuia: "GUIA-A", nomePaciente: "Paciente sintético", tipoAtendimento: "internacao", convenioId: 30, convenioNome: "Convênio sintético", entradaSetorAtualEm: new Date("2026-10-01T12:00:00Z"), updatedAt: new Date("2026-10-01T12:00:00Z"), valorFaturadoInicial: "40.00", valorFaturadoFinal: "40.00", totalItensXml: 1, contaConvenioResumoId: 80, statusAuditoriaRegras: "conforme" };
function fixture(opts: any = {}) {
  const initial = { ...account, ...opts.account };
  const state = new Map<any, any[]>([
    [fabricaContas, opts.noAccount ? [] : [initial]],
    [integracaoMapeamentos, opts.maps ?? [{ id: 1, nome: "Busca Conta", queryOrigem: opts.query ?? "SELECT numconta FROM contas WHERE numconta = $1", conexaoOrigemId: 2, estabelecimentoId: 20, ativo: "sim" }]],
    [integracaoConexoes, opts.connections ?? [{ id: 2, tipo: opts.tipo ?? "sqlserver", estabelecimentoId: 20, ativo: "sim", host: "example.invalid", porta: 1, banco: "synthetic", usuario: "synthetic", senhaEncriptada: Buffer.from("synthetic-only").toString("base64") }]],
    [estabelecimentos, [{ id: 20, ativo: "sim" }]], [convenios, [{ id: 30, nome: "Convênio sintético", codigo: "SYN", estabelecimentoId: 20, ativo: "sim" }]],
    [permissoesEstabelecimento, [{ userId: 71, estabelecimentoId: 20, podeVisualizar: "sim", podeEditar: "sim" }]],
    [contasConvenioItens, [{ id: 70, numeroConta: "CONTA-A", estabelecimentoId: 20, convenioId: 30, origem: "BANCO_CLIENTE", numeroLote: "BANCO:v1:80", competencia: "2026-10", valorTotal: "40.00" }]],
    [contasConvenioResumo, [{ id: 80, numeroConta: "CONTA-A", estabelecimentoId: 20, convenioId: 30, origem: "BANCO_CLIENTE", numeroLote: "BANCO:v1:80", competencia: "2026-10", totalItens: 1, valorTotal: "40.00", ...opts.snapshot }]], [fabricaHistoricoFluxo, []],
  ]);
  const events: any[] = [], writes: any[] = [];
  let sequence = 200, transactionTail = Promise.resolve();
  function filtered(table: any, condition: any) {
    let rows = state.get(table) || [];
    if (!condition) return rows;
    const compiled = dialect.sqlToQuery(condition), columns = getTableColumns(table);
    const mapping = Object.fromEntries(Object.entries(columns).map(([key, value]: any) => [value.name, key]));
    const pairs: [string, any][] = [];
    const regex = /`[^`]+`\.`([^`]+)`\s*(?:=|<=>)\s*\?/g;
    for (const match of compiled.sql.matchAll(regex)) { const index = (compiled.sql.slice(0, match.index).match(/\?/g) || []).length; pairs.push([mapping[match[1]] || match[1], compiled.params[index]]); }
    return rows.filter(row => pairs.every(([key, value]) => {
      // Único OR utilizado nesta fixture: proprietário hospital OU NULL global.
      if (table === convenios && key === "estabelecimentoId" && compiled.sql.includes("is null")) return row[key] === null || row[key] === value;
      const a = row[key] ?? null, b = value ?? null;
      // Drizzle mapToDriverValue(timestamp) serializa UTC sem sufixo Z;
      // não interpretar esse bind como horário local de process.env.TZ.
      const instant = (v: any) => v instanceof Date ? v.getTime() : new Date(String(v).replace(" ", "T") + "Z").getTime();
      if (a instanceof Date || b instanceof Date) return instant(a) === instant(b);
      return a === b || String(a) === String(b);
    }));
  }
  const db: any = {
    select: vi.fn((projection: any) => ({ from: (table: any) => {
      let condition: any;
      const read = () => { const rows = filtered(table, condition); if (!projection || Object.values(projection).some((v: any) => !v?.name)) return rows.map(r => ({ ...r }));
        return rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, col]: any) => [key, row[Object.entries(getTableColumns(table)).find(([, c]: any) => c.name === col.name)?.[0] || key]]))); };
      const q: any = { where: (c: any) => { condition = c; events.push({ type: "select", table, query: dialect.sqlToQuery(c) }); return q; }, limit: () => q, offset: () => q, orderBy: () => q, groupBy: () => q,
        for: (lock: string) => { events.push({ type: "lock", table, lock }); return q; }, then: (resolve: any, reject: any) => Promise.resolve(read()).then(resolve, reject) };
      return q;
    } })),
    execute: vi.fn(async (query: any) => { const q = dialect.sqlToQuery(query); events.push({ type: "execute", query: q });
      if (q.sql.includes("fabrica_metas")) return [[{ observacao: JSON.stringify({ cargoSetor: "Sintético", setoresPermitidos: opts.sectors ?? ["faturamento", "recepcao", "auditoria_interna"], hospitaisPermitidos: [20], verRelatoriosGerenciais: false }) }], []]; return [[], []]; }),
    insert: vi.fn((table: any) => ({ values: async (values: any) => {
      writes.push({ type: "insert", table, values });
      if (opts.fail === table) throw new Error("SYNTHETIC_INSERT_FAILURE");
      const id = ++sequence; const rows = (Array.isArray(values) ? values : [values]).map((v: any, i: number) => ({ ...v, id: id + i, updatedAt: new Date("2026-11-05T12:00:00Z") }));
      state.set(table, [...(state.get(table) || []), ...rows]); return [{ insertId: id, affectedRows: rows.length }];
    } })),
    update: vi.fn((table: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
      writes.push({ type: "update", table, values, query: dialect.sqlToQuery(condition) });
      if (opts.failUpdate === table) throw new Error("SYNTHETIC_UPDATE_FAILURE");
      const rows = filtered(table, condition); if (opts.affectedZero && table === fabricaContas) return [{ affectedRows: 0 }];
      for (const row of rows) Object.assign(row, values, { updatedAt: new Date("2026-11-05T12:00:00Z") }); return [{ affectedRows: rows.length }];
    } }) })),
    transaction: vi.fn((work: any) => {
      const pending = transactionTail.then(async () => { const saved = new Map([...state].map(([t, rows]) => [t, rows.map(r => ({ ...r }))])); const before = writes.length;
        events.push({ type: "begin" }); try { const result = await work(db); events.push({ type: "commit" }); return result; }
        catch (e) { state.clear(); for (const [t, rows] of saved) state.set(t, rows); writes.splice(before); events.push({ type: "rollback" }); throw e; } });
      transactionTail = pending.then(() => undefined, () => undefined); return pending;
    }),
  };
  m.getDb.mockResolvedValue(db);
  return { db, state, events, writes, get account() { return state.get(fabricaContas)![0]; }, set account(v: any) { state.set(fabricaContas, [v]); }, get items() { return state.get(contasConvenioItens)!; }, get summaries() { return state.get(contasConvenioResumo)!; }, get history() { return state.get(fabricaHistoricoFluxo)!; } };
}
const search = () => caller().buscarContaNoBancoHospital({ hospitalEstabelecimentoId: 20, numeroConta: "CONTA-A" });
const sync = (f: ReturnType<typeof fixture>, extra: any = {}) => caller().sincronizarContaDoBancoNaEsteira({ fabricaContaId: 9, expectedVersion: versaoContaBanco(f.account), ...extra });
beforeEach(() => { vi.clearAllMocks(); m.permission.mockResolvedValue(true); m.connect.mockResolvedValue(true); m.disconnect.mockResolvedValue(undefined); m.remote.mockResolvedValue([row]); m.compare.mockImplementation(async ({ itens }: any) => ({ statusGeral: "conforme", totalItensAnalisados: itens.length, divergencias: [], scoreRisco: { score: 0 } })); });
describe("Issue168 — provas corrigidas offline, routers e guardas reais", () => {
  it("token é idêntico entre SQL snake_case e Drizzle camelCase", () => {
    const camel = { ...account, dataEntrada: "2026-10-01", dataAlta: "2026-10-02", dataEnvioConvenio: null };
    const columns = getTableColumns(fabricaContas);
    const raw = Object.fromEntries(Object.entries(camel).map(([key, value]) => [(columns as any)[key]?.name || key, value]));
    expect(versaoContaBanco(raw)).toBe(versaoContaBanco(camel));
    expect(versaoContaBanco({ ...camel, contaConvenioResumoId: 81 })).not.toBe(versaoContaBanco(camel));
  });
  it("overview exclui históricos e legados BANCO sem escopo, sem usar arquivo falso", () => {
    const r = dialect.sqlToQuery(filtroResumoBancoAtivo()).sql, i = dialect.sqlToQuery(filtroItemBancoAtivo()).sql;
    expect(r).toContain("LIKE 'BANCO:v1:%' AND EXISTS"); expect(r).toContain("conta_convenio_resumo_id");
    expect(i).toContain("r168.numeroLote"); expect(i).toContain("r168.competencia <=>");
    expect(i).not.toContain("arquivoId");
  });
  it("snapshot zero é referência presente e detalhes exatos permanecem vazios", async () => {
    const f = fixture(); m.remote.mockResolvedValue([]); const r = await sync(f);
    const d = await details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, origem: "BANCO_CLIENTE", fabricaContaId: 9, resumoId: r.contaConvenioResumoId });
    expect(d.items).toHaveLength(0); expect(d.snapshot?.id).toBe(r.contaConvenioResumoId); expect(d.snapshot?.valorTotal).toBe("0.00");
  });
  it("alteração financeira do resumo durante rede causa conflito de snapshot", async () => {
    const f = fixture(); m.remote.mockImplementation(async () => { f.summaries[0].valorTotal = "999.00"; return [row]; });
    await expect(sync(f)).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.writes).toHaveLength(0);
  });
  it("alteração de origem do snapshot durante rede é reautorizada sob lock", async () => {
    const f = fixture(); m.remote.mockImplementation(async () => { f.summaries[0].origem = "XML"; return [row]; });
    await expect(sync(f)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.writes).toHaveLength(0);
  });

  it.each(["mysql", "sqlserver", "oracle", "postgresql"])("schema correto seleciona %s e preview não grava", async tipo => { const f = fixture({ tipo }); const r = await search(); expect(r.encontrada).toBe(true); expect(m.remote).toHaveBeenCalledWith("SELECT numconta FROM contas WHERE numconta = $1", ["CONTA-A"]); expect(f.writes).toHaveLength(0); expect(r.contaExistenteNaEsteira?.expectedVersion).toBe(versaoContaBanco(f.account)); });
  it.each(["UPDATE contas SET valor=0 WHERE id=$1; SELECT 1", "SELECT numconta FROM contas WHERE numconta=$1; DELETE FROM contas", "WITH x AS (DELETE FROM contas RETURNING *) SELECT * FROM x WHERE id=$1"])("visualizador nega SQL de escrita antes de conectar", async query => { const f = fixture({ query }); m.permission.mockImplementation(async (_u, _h, action) => action === "visualizar"); await expect(search()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(m.connect).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0); });
  it.each([{ maps: [] }, { maps: [{ id: 1 }, { id: 2 }] }, { connections: [{ id: 2, ativo: "nao", estabelecimentoId: 20 }] }, { connections: [{ id: 2, ativo: "sim", estabelecimentoId: 31 }] }])("config inválida/ambígua não conecta nem usa ENV/cache", async opts => { const f = fixture(opts); await expect(search()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(m.connect).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0); });
  it.each(["finalizado", "enviado_convenio", "recursos"])("nega sincronização no setor %s", async setor => { const f = fixture({ sectors: ["recursos"], account: { setorAtual: setor } }); await expect(sync(f)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(m.remote).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0); });
  it("nega XML ativo e status concluído", async () => { for (const change of [{ arquivoXmlFinalId: 90 }, { statusSetor: "concluido" }]) { const f = fixture({ account: change }); await expect(sync(f)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.writes).toHaveLength(0); } });
  it("override não pode trocar identidade", async () => { const f = fixture(); await expect(sync(f, { numeroContaOverride: "CONTA-B" })).rejects.toMatchObject({ code: "CONFLICT" }); expect(m.remote).not.toHaveBeenCalled(); expect(f.account.numeroContaHospital).toBe("CONTA-A"); });
  it("mesma guia com duas contas é recusada sem soma", async () => { const f = fixture(); m.remote.mockResolvedValue([row, { ...row, numconta: "CONTA-B" }]); await expect(sync(f)).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.writes).toHaveLength(0); });
  it("paciente/atendimento divergente não revincula cadastro", async () => { const f = fixture(); m.remote.mockResolvedValue([{ ...row, pacientenome: "Outro sintético" }]); await expect(sync(f)).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.writes).toHaveLength(0); });
  it.each([contasConvenioItens, contasConvenioResumo, fabricaHistoricoFluxo])("falha no insert faz rollback preservando snapshot", async fail => { const f = fixture({ fail }); await expect(sync(f)).rejects.toThrow("SYNTHETIC_INSERT_FAILURE"); expect(f.items).toHaveLength(1); expect(f.summaries).toHaveLength(1); expect(f.account.contaConvenioResumoId).toBe(80); expect(f.history).toHaveLength(0); expect(f.events.some(e => e.type === "rollback")).toBe(true); });
  it.each([contasConvenioResumo, fabricaContas])("falha no update faz rollback", async failUpdate => { const f = fixture({ failUpdate }); await expect(sync(f)).rejects.toThrow("SYNTHETIC_UPDATE_FAILURE"); expect(f.items).toHaveLength(1); expect(f.summaries).toHaveLength(1); });
  it("CAS affectedRows zero é conflito e rollback", async () => { const f = fixture({ affectedZero: true }); await expect(sync(f)).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.summaries).toHaveLength(1); });
  it("incompleta permanece pendente e não inventa data", async () => { const f = fixture(); m.remote.mockResolvedValue([{ ...row, dataexecucao: null }]); m.compare.mockResolvedValue({ statusGeral: "incompleta", totalItensAnalisados: 1, divergencias: [], scoreRisco: { score: 0 } }); const r = await sync(f); expect(r.statusAuditoriaRegras).toBe("pendente"); expect(r.motivoAuditoriaPendente).toMatch(/incompleta/); expect(f.items[1].dataExecucao).toBeNull(); expect(m.compare.mock.calls[0][0].itens).toHaveLength(1); expect(m.compare.mock.calls[0][0].itens[0].origem).toBe("BANCO_CLIENTE"); });
  it("divergência por código sem itemId seguro permanece pendente", async () => { const f = fixture(); m.compare.mockResolvedValue({ statusGeral: "divergente", totalItensAnalisados: 1, divergencias: [{ tipo: "PRECO", codigoItem: "ITEM-A" }], scoreRisco: { score: 4 } }); expect((await sync(f)).statusAuditoriaRegras).toBe("pendente"); expect(f.items[1].statusAnalise).toBe("pendente"); });
  it("erro de comparador é pendente sem falso conforme", async () => { const f = fixture(); m.compare.mockRejectedValue(new Error("SYNTHETIC_COMPARE_FAILURE")); const r = await sync(f); expect(r.statusAuditoriaRegras).toBe("pendente"); expect(r.motivoAuditoriaPendente).toMatch(/não concluiu/); });
  it("TOCTOU durante remoto nega transição sob lock", async () => { const f = fixture({ sectors: ["faturamento", "recursos"] }); const expectedVersion = versaoContaBanco(f.account); m.remote.mockImplementation(async () => { f.account = { ...f.account, setorAtual: "enviado_convenio", statusSetor: "concluido" }; return [row]; }); await expect(sync(f, { expectedVersion, avancarParaAuditoriaInterna: true })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.account.setorAtual).toBe("enviado_convenio"); expect(f.writes).toHaveLength(0); });
  it("edição durante remoto causa conflito de versão", async () => { const f = fixture(); const expectedVersion = versaoContaBanco(f.account); m.remote.mockImplementation(async () => { f.account = { ...f.account, observacoes: "Edição concorrente" }; return [row]; }); await expect(sync(f, { expectedVersion })).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.writes).toHaveLength(0); });
  it("replay exato é local; pedido diferente com a mesma chave falha", async () => { const f = fixture(); const expectedVersion = versaoContaBanco(f.account); const extra = { expectedVersion, idempotencyKey: "retry-synthetic" }; const first = await sync(f, extra), second = await sync(f, extra); expect(second.replay).toBe(true); expect(second.contaConvenioResumoId).toBe(first.contaConvenioResumoId); expect(f.history).toHaveLength(1); expect(f.summaries).toHaveLength(2); m.remote.mockRejectedValue(new Error("ORIGIN_DOWN")); expect((await sync(f, extra)).replay).toBe(true); expect(m.remote).toHaveBeenCalledTimes(1); await expect(sync(f, { ...extra, avancarParaAuditoriaInterna: true })).rejects.toMatchObject({ code: "CONFLICT" }); });
  it("duas syncs concorrentes com mesma versão não intercalam snapshots", async () => { const f = fixture(); const expectedVersion = versaoContaBanco(f.account); const results = await Promise.allSettled([sync(f, { expectedVersion, idempotencyKey: "one" }), sync(f, { expectedVersion, idempotencyKey: "two" })]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1); expect(f.history).toHaveLength(1); expect(f.summaries).toHaveLength(2); });
  it.each([{ rows: [] }, { rows: [{ ...row, codigoitem: null, descricao: null, valortotal: "0" }] }])("vazio autoritativo cria snapshot zero sem apagar histórico", async ({ rows }) => { const f = fixture(); m.remote.mockResolvedValue(rows); const result = await sync(f); expect(result.totalItens).toBe(0); expect(result.contaConvenioResumoId).toBeGreaterThan(80); expect(f.account.totalItensXml).toBe(0); expect(f.account.valorFaturadoFinal).toBe("0.00"); expect(f.account.statusAuditoriaRegras).toBe("pendente"); expect(f.items).toHaveLength(1); expect(f.summaries).toHaveLength(2); });
  it("falha remota não ressuscita cache nem invalida financeiro", async () => { const f = fixture(); m.remote.mockRejectedValue(new Error("driver synthetic")); await expect(sync(f)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.account.valorFaturadoFinal).toBe("40.00"); expect(f.writes).toHaveLength(0); expect(m.disconnect).toHaveBeenCalled(); });
  it("detalhes resolvem resumoId exato da fábrica e não misturam versões", async () => { const f = fixture(); const result = await sync(f); const r = await details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, origem: "BANCO_CLIENTE", fabricaContaId: 9, resumoId: result.contaConvenioResumoId }); expect(r.items).toHaveLength(1); expect(r.items[0].numeroLote).toBe(`BANCO:v1:${result.contaConvenioResumoId}`); await expect(details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, origem: "BANCO_CLIENTE" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); await expect(details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, fabricaContaId: 9, resumoId: 80 })).rejects.toMatchObject({ code: "CONFLICT" }); });
  it("preview de contasConvenio não escreve snapshot financeiro", async () => { const f = fixture(); const r = await details().buscarConta({ numeroConta: "CONTA-A", estabelecimentoId: 20 }); expect(r.sucesso).toBe(true); expect(f.writes).toHaveLength(0); });
  it("banco sem escopo não aceita reanálise genérica", async () => { fixture(); await expect(details().compararComPadroes({ numeroConta: "CONTA-A", estabelecimentoId: 20 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); });
  it("central isolada não concede proprietário", async () => { const f = fixture(); m.permission.mockImplementation(async (_u, hospital) => hospital === 2160001); await expect(sync(f)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(m.remote).not.toHaveBeenCalled(); });
  it("perfil recepção não concede sync de conta em faturamento", async () => { const f = fixture({ sectors: ["recepcao"] }); await expect(sync(f)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(m.remote).not.toHaveBeenCalled(); });
  it("perfil vazio não concede finalizado", async () => { const f = fixture({ sectors: [], account: { setorAtual: "finalizado" } }); await expect(sync(f)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(m.remote).not.toHaveBeenCalled(); });
  it("cadastro sincronizado e retry são atômicos e idempotentes", async () => {
    const f = fixture({ noAccount: true });
    const input = { hospitalEstabelecimentoId: 20, convenioId: 30, numeroContaHospital: "CONTA-A", numeroAtendimento: "ATEND-A", numeroGuia: "GUIA-A", nomePaciente: "Paciente sintético", dataEntrada: "2026-10-01", dataRecebimentoSafatle: "2026-10-02", idempotencyKey: "reception-retry-synthetic" };
    const first = await caller().cadastrarContaRecepcao(input), second = await caller().cadastrarContaRecepcao(input);
    expect(second.id).toBe(first.id); expect(second.replay).toBe(true); expect(f.state.get(fabricaContas)).toHaveLength(1);
    expect(f.history.filter(h => h.acao === "recepcionado_banco")).toHaveLength(1);
    expect(f.summaries).toHaveLength(2);
  });
  it("cadastro sincronizado falho rollback conta+histórico+snapshot", async () => { const f = fixture({ noAccount: true, fail: contasConvenioItens }); const before = f.summaries.length; await expect(caller().cadastrarContaRecepcao({ hospitalEstabelecimentoId: 20, convenioId: 30, numeroContaHospital: "CONTA-A", numeroAtendimento: "ATEND-A", numeroGuia: "GUIA-A", nomePaciente: "Paciente sintético", dataEntrada: "2026-10-01", dataRecebimentoSafatle: "2026-10-02" })).rejects.toThrow("SYNTHETIC_INSERT_FAILURE"); expect(f.state.get(fabricaContas)).toHaveLength(0); expect(f.history).toHaveLength(0); expect(f.summaries).toHaveLength(before); });
});

describe("Issue168 — guardas da auditoria independente", () => {
  it.each(["listarItens", "getDivergencias"] as const)("%s nega resumo sem setor tanto com como sem conta", async endpoint => {
    fixture({ sectors: ["recepcao"], account: { setorAtual: "auditoria_interna" } });
    const input = { numeroConta: "CONTA-A", estabelecimentoId: 20, origem: "BANCO_CLIENTE" as const, resumoId: 80 };
    await expect(details()[endpoint](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(details()[endpoint]({ ...input, fabricaContaId: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("resumo sozinho permite o mesmo snapshot ao proprietário autorizado", async () => {
    fixture(); expect((await details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, resumoId: 80 })).items).toHaveLength(1);
  });
  it.each(["ausente", "duplicado", "convenio", "xml", "outraReferencia"])("referência sem proprietário consistente %s falha fechada", async mode => {
    const f = fixture();
    if (mode === "ausente") f.state.set(fabricaContas, []);
    if (mode === "duplicado") f.state.set(fabricaContas, [f.account, { ...f.account, id: 10 }]);
    if (mode === "convenio") f.account.convenioId = 31;
    if (mode === "xml") f.account.arquivoXmlFinalId = 99;
    if (mode === "outraReferencia") f.account.contaConvenioResumoId = 81;
    await expect(details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, resumoId: 80 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("convênio global ativo tem ID canônico e sincroniza na transação", async () => {
    const f = fixture(); f.state.get(convenios)![0].estabelecimentoId = null;
    const result = await sync(f); expect(result.sucesso).toBe(true); expect(f.summaries[1].convenioId).toBe(30);
  });
  it.each(["inativo", "outroHospital", "ambiguoCodigo", "ambiguoNome", "codigoErrado"])("origem recusa convênio %s sem fallback", async mode => {
    const f = fixture(), c = f.state.get(convenios)![0];
    if (mode === "inativo") c.ativo = "nao";
    if (mode === "outroHospital") c.estabelecimentoId = 21;
    if (mode.startsWith("ambiguo")) f.state.set(convenios, [c, { ...c, id: 31, estabelecimentoId: null }]);
    const remote = { ...row, ...(mode === "ambiguoNome" ? { codconv: null } : mode === "codigoErrado" ? { codconv: "OTHER" } : {}) };
    await expect(prepararColecaoBanco(f.db, 20, "CONTA-A", [remote])).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(f.writes).toHaveLength(0);
  });
  it("convênio desativado após remoto é revalidado no tx", async () => {
    const f = fixture(), transaction = f.db.transaction;
    f.db.transaction = (work: any) => transaction(async (tx: any) => { f.state.get(convenios)![0].ativo = "nao"; return work(tx); });
    await expect(sync(f)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.writes).toHaveLength(0);
  });
  it.each(["2026-10", "2026/10"])("competência %s persiste YYYY/MM e listarItens aceita o filtro real", async competencia => {
    const f = fixture(); m.remote.mockResolvedValue([{ ...row, competencia }]); const result = await sync(f);
    expect(f.summaries[1].competencia).toBe("2026/10");
    const d = await details().listarItens({ numeroConta: "CONTA-A", estabelecimentoId: 20, resumoId: result.contaConvenioResumoId, competencia: "2026/10" });
    expect(d.items).toHaveLength(1); expect(d.items[0].competencia).toBe("2026/10");
  });
  it("retry idêntico já em voo reconcilia sem passar pelo CAS de nova escrita", async () => {
    const f = fixture(), expectedVersion = versaoContaBanco(f.account); let release!: () => void, arrived!: () => void, calls = 0;
    const hold = new Promise<void>(r => release = r), ready = new Promise<void>(r => arrived = r);
    m.remote.mockImplementation(async () => { if (++calls === 2) { arrived(); await hold; } return [row]; });
    const input = { expectedVersion, idempotencyKey: "same-inflight" };
    const first = sync(f, input), second = sync(f, input); await ready; const a = await first; release(); const b = await second;
    expect(b.replay).toBe(true); expect(b.contaConvenioResumoId).toBe(a.contaConvenioResumoId); expect(f.history).toHaveLength(1); expect(f.summaries).toHaveLength(2);
  });
  it("retry após avanço retorna recibo mínimo e não autoriza novo setor ou leitura", async () => {
    const f = fixture({ sectors: ["recepcao"], account: { setorAtual: "recepcao" } });
    const input = { expectedVersion: versaoContaBanco(f.account), idempotencyKey: "receipt-only", avancarParaAuditoriaInterna: true };
    await sync(f, input); m.remote.mockRejectedValue(new Error("ORIGIN_DOWN")); const b = await sync(f, input);
    expect(b.reconciliacaoRestrita).toBe(true); expect(b.replay).toBe(true); expect(b).not.toHaveProperty("expectedVersion"); expect(b).not.toHaveProperty("valorTotal"); expect(b).not.toHaveProperty("contaConvenioResumoId");
    expect(m.remote).toHaveBeenCalledTimes(1);
    await expect(sync(f, { idempotencyKey: "new-request" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(details().listarItens({ estabelecimentoId: 20, numeroConta: "CONTA-A", resumoId: f.account.contaConvenioResumoId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.history).toHaveLength(1);
  });
  it.each(["versao", "avanco", "snapshot", "edicao", "hospitalRevogado", "convenioInativo", "setorRevogado"])("replay recusa alteração %s", async mode => {
    const sectors = ["faturamento"], f = fixture({ sectors }), input = { expectedVersion: versaoContaBanco(f.account), idempotencyKey: "guarded-retry" };
    await sync(f, input); const before = f.writes.length;
    if (mode === "snapshot") f.summaries[1].valorTotal = "99.00";
    if (mode === "edicao") f.account.dataRecebimentoSafatle = "2026-11-03 08:00:00";
    if (mode === "hospitalRevogado") m.permission.mockResolvedValue(false);
    if (mode === "convenioInativo") f.state.get(convenios)![0].ativo = "nao";
    if (mode === "setorRevogado") sectors.splice(0);
    const extra = mode === "versao" ? { expectedVersion: versaoContaBanco(f.account) } : mode === "avanco" ? { avancarParaAuditoriaInterna: true } : {};
    await expect(sync(f, { ...input, ...extra })).rejects.toMatchObject({ code: ["hospitalRevogado", "setorRevogado"].includes(mode) ? "FORBIDDEN" : mode === "convenioInativo" ? "PRECONDITION_FAILED" : "CONFLICT" });
    expect(f.writes).toHaveLength(before); expect(f.history).toHaveLength(1);
  });
  it.each(["dataRecebimentoSafatle", "numeroLote", "senhaAutorizacao", "convenioNome", "responsavelAtualNome", "auditorInternoNome", "ultimoMotivoRetorno", "qtdRetrabalhos"])("versão detecta coluna persistida %s no mesmo segundo", async key => {
    const f = fixture(), expectedVersion = versaoContaBanco(f.account), value = key === "dataRecebimentoSafatle" ? "2026-11-02 08:00:00" : key === "qtdRetrabalhos" ? 2 : "EDITED";
    m.remote.mockImplementation(async () => { f.account[key] = value; return [row]; });
    await expect(sync(f, { expectedVersion })).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.writes).toHaveLength(0);
  });
  it("timestamp SQL e Date produzem token idêntico independentemente de TZ", () => {
    const a = { ...account, updatedAt: new Date("2026-10-01T12:00:00Z"), entradaSetorAtualEm: new Date("2026-10-01T12:00:00Z") };
    const b = { ...a, updatedAt: "2026-10-01 12:00:00.000", entradaSetorAtualEm: "2026-10-01 12:00:00" };
    expect(versaoContaBanco(a)).toBe(versaoContaBanco(b));
  });
  it("outliers AVG/STDDEV usam filtro de snapshot ativo", async () => {
    const f = fixture(); f.summaries[0].convenio = "Convênio sintético";
    await details().listarContas({ estabelecimentoId: 20 });
    const stats = f.events.find(e => e.type === "execute" && e.query.sql.includes("STDDEV"));
    expect(stats.query.sql).toContain("LIKE 'BANCO:v1:%' AND EXISTS"); expect(stats.query.sql).toContain("conta_convenio_resumo_id");
  });
  it.each([0, undefined])("tx não interpreta proprietário %s como NULL global", async owner => {
    const f = fixture(), transaction = f.db.transaction;
    f.db.transaction = (work: any) => transaction(async (tx: any) => { f.state.get(convenios)![0].estabelecimentoId = owner; return work(tx); });
    await expect(sync(f)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(f.writes).toHaveLength(0);
  });
  it("fixture CAS preserva round-trip timestamp do mapper Drizzle UTC", async () => {
    const f = fixture(); await sync(f);
    const update = f.writes.find(w => w.table === fabricaContas && w.type === "update");
    const bind = update.query.params.at(-1);
    expect(bind).toBe(fabricaContas.updatedAt.mapToDriverValue(account.updatedAt));
    expect(fabricaContas.updatedAt.mapFromDriverValue(bind).toISOString()).toBe(account.updatedAt.toISOString());
  });
});
