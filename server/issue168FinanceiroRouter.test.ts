import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { TRPCError } from "@trpc/server";
import { carregarNotaFiscalBase64, decodificarPdfNF, salvarNotaFiscalDuravel } from "./financeiroNotaFiscal";
import { codigoBoletoConfirmado, emitirBoletoReservado, fingerprintBoleto, prepararClaimBoleto } from "./financeiroBoleto";
import { valorDataCivil } from "../shared/financeiroCivilDate";

// Somente extração AST; não importa router/backend, dotenv, DB, Inter ou SMTP.
const source = readFileSync(new URL("./routers/financeiroRouter.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("router.ts", source, ts.ScriptTarget.Latest, true);
function find(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function walk(n: ts.Node) { if (!found && predicate(n)) found = n; if (!found) ts.forEachChild(n, walk); }
  walk(node); if (!found) throw Error("extraction failed"); return found;
}
function callback(name: string, query = false, admin = false) {
  const container = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === (admin ? "bancoInterRouter" : "recebiveisRouter"));
  const prop = find(container, n => ts.isPropertyAssignment(n) && n.name.getText(ast) === name);
  const call = find(prop, n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === (query ? "query" : "mutation")) as ts.CallExpression;
  return call.arguments[0].getText(ast);
}
const env = { BANCO_INTER_ENCRYPTION_KEY: "ab".repeat(32) };
const pdf = Buffer.from("%PDF-1.4\nSYNTHETIC\n%%EOF\n");
const actor = { user: { id: 88 } };
const payer = { cpfCnpj: "00000000000", tipoPessoa: "FISICA", nome: "SYNTHETIC", endereco: "SYNTHETIC", bairro: "SYNTHETIC", cidade: "SYNTHETIC", uf: "SP", cep: "00000000", email: "synthetic@example.invalid" };
function runtime({ deny = false, rollback = false, reference = null as string | null } = {}) {
  const row: any = { id: 42, empresaId: 3, bancoId: 7, clienteId: 1, valor: "100.00", dataVencimento: "2030-01-01", recebido: "nao", notaFiscalKey: null, boletoSolicitacaoId: reference, emailEnviado: "nao" };
  const company: any = { id: 3, estabelecimentoId: 9 };
  const events: string[] = [];
  const remote = new Map<string, Buffer>();
  const tables = Object.fromEntries(["finRecebiveis", "finEmpresas", "finBancos"].map(name => [name, Object.fromEntries(["id", "empresaId", "estabelecimentoId", "boletoSolicitacaoId", "notaFiscalKey", "interClientId"].map(col => [col, `${name}.${col}`]))]));
  const matches = (record: any, condition: any): boolean => !condition || (condition.kind === "and" ? condition.parts.every((part: any) => matches(record, part)) : condition.kind === "null" ? record[condition.col.split(".")[1]] === null : condition.kind === "eq" ? record[condition.col.split(".")[1]] === condition.value : true);
  const select = () => ({ from(table: any) {
    const records = table === tables.finEmpresas ? [company] : table === tables.finBancos ? [{ id: 7, estabelecimentoId: 9 }] : [row];
    return { where(condition: any) {
      const result = () => records.filter(rec => matches(rec, condition)).map(rec => ({ ...rec }));
      return { limit: async () => result(), for: async () => { events.push("row-lock"); return result(); }, then: (fn: any) => Promise.resolve(result()).then(fn) };
    } };
  } });
  const update = () => ({ set(values: any) { return { where: async (condition: any) => {
    if (!matches(row, condition)) return [{ affectedRows: 0 }];
    Object.assign(row, values); events.push(values.boletoSolicitacaoId ? "boleto-update" : "nf-update"); return [{ affectedRows: 1 }];
  } }; } });
  let queue = Promise.resolve();
  const transaction = vi.fn((fn: any) => {
    const run = queue.then(async () => {
      const snapshot = { ...row };
      try { const result = await fn({ select, update }); if (rollback) throw Error("synthetic rollback"); events.push("tx-commit"); return result; }
      catch (err) { Object.assign(row, snapshot); events.push("tx-rollback"); throw err; }
    });
    queue = run.then(() => undefined, () => undefined); return run;
  });
  const io: any = {
    put: vi.fn(async (key: string, bytes: Buffer) => { remote.set(key, Buffer.from(bytes)); events.push("storage-put"); return { key }; }),
    get: vi.fn(async (key: string) => ({ url: `https://synthetic.invalid/${key}` })),
    fetch: vi.fn(async (url: string) => new Response(remote.get(url.replace("https://synthetic.invalid/", "")), { headers: { "content-type": "application/octet-stream" } })),
    readLocal: vi.fn(async () => { throw Error("missing"); }),
  };
  const emit = vi.fn(async (_input: any) => { events.push("inter-emit"); return { configured: true, codigoSolicitacao: "PROTOCOL-SYNTH" }; });
  const download = vi.fn(async () => ({ pdf: pdf.toString("base64") }));
  const email = vi.fn(async () => true);
  const authorize = vi.fn(async () => { if (deny) throw new TRPCError({ code: "FORBIDDEN", message: "synthetic denied" }); });
  const context = vm.createContext({ ...tables, Buffer, TRPCError, console: { warn: vi.fn() }, valorDataCivil,
    eq: (col: string, value: any) => ({ kind: "eq", col, value }), and: (...parts: any[]) => ({ kind: "and", parts }), isNull: (col: string) => ({ kind: "null", col }), sql: () => true,
    getDb: async () => ({ select, update, transaction }), garantirEstruturaFinanceira: async () => undefined,
    exigirUnidadeFinanceira: authorize, exigirBancoDaUnidade: vi.fn(async () => undefined),
    decodificarPdfNF, salvarNotaFiscalDuravel: (scope: any, bytes: Buffer) => salvarNotaFiscalDuravel(scope, bytes, io, env),
    carregarNotaFiscalRecebivelBase64: (scope: any, reference: string) => carregarNotaFiscalBase64(scope, reference, io, env), notaFiscalIO: io,
    fingerprintBoleto: (value: any) => fingerprintBoleto(value, env), codigoBoletoConfirmado, prepararClaimBoleto, emitirBoletoReservado,
    emitirBoleto: (...args: any[]) => emit(args[0]), downloadBoletoPdf: download, consultarBoleto: download, cancelarBoleto: download, enviarBoletoPorEmail: email, enviarNotaFiscalPorEmail: email,
  });
  const helper = find(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === "bloquearRecebivelFinanceiro").getText(ast);
  vm.runInContext(ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const endpoint = (name: string, query = false, admin = false): any => vm.runInContext(ts.transpileModule(`(${callback(name, query, admin)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { row, company, io, emit, download, email, authorize, events, transaction, remote, endpoint };
}
const upload = { recebivelId: 42, base64File: pdf.toString("base64"), fileName: "synthetic.pdf", expectedKey: null };
const issue = { recebivelId: 42, bancoId: 7, pagador: payer };
describe("issue168 handlers extraídos com mocks em memória", () => {
  it("upload confirma durabilidade antes do commit, scoped lock e CAS", async () => {
    const r = runtime(); const result = await r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor });
    expect(result.success).toBe(true); expect(r.row.notaFiscalKey).toBe(result.key);
    expect(r.events.indexOf("storage-put")).toBeLessThan(r.events.indexOf("nf-update"));
    expect(r.events.filter(e => e === "row-lock")).toHaveLength(2);
    expect(r.remote.get(result.key)!.includes(Buffer.from("%PDF"))).toBe(false);
  });
  it("storage falha sem sucesso/associação; rollback conserva objeto órfão cifrado", async () => {
    const r = runtime(); r.io.put.mockRejectedValue(Error("synthetic outage"));
    await expect(r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor })).rejects.toThrow();
    expect(r.transaction).not.toHaveBeenCalled(); expect(r.row.notaFiscalKey).toBeNull();
    const rollback = runtime({ rollback: true });
    await expect(rollback.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor })).rejects.toThrow("não associada");
    expect(rollback.row.notaFiscalKey).toBeNull(); expect(rollback.remote.size).toBe(1);
    expect([...rollback.remote.values()][0].includes(Buffer.from("%PDF"))).toBe(false);
  });
  it("duas instâncias upload esperado null: um ganha, outro falha sem sobrescrever", async () => {
    const r = runtime(); let count = 0; let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    r.io.put.mockImplementation(async (key: string, bytes: Buffer) => { r.remote.set(key, bytes); if (++count === 2) release(); await gate; return { key }; });
    const results = await Promise.allSettled([r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor }), r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(r.remote.size).toBe(2); expect(r.row.notaFiscalKey).not.toBeNull();
  });
  it("ownership alterado depois do storage impede associação", async () => {
    const r = runtime(); r.io.put.mockImplementation(async (key: string, bytes: Buffer) => { r.remote.set(key, bytes); r.row.empresaId = 99; return { key }; });
    await expect(r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor })).rejects.toThrow("alterado");
    expect(r.row.notaFiscalKey).toBeNull();
  });
  it("nega permissão antes de todos os efeitos externos inclusive download NF", async () => {
    for (const name of ["gerarBoleto", "anexarNotaFiscal", "baixarNotaFiscal", "enviarEmailNF", "enviarEmailBoleto", "baixarBoleto"]) {
      const r = runtime({ deny: true, reference: "PROTOCOL-SYNTH" }); r.row.notaFiscalKey = "nf_42_1700000000000.pdf";
      await expect(r.endpoint(name, name === "baixarNotaFiscal")({ input: { ...issue, ...upload, email: "synthetic@example.invalid" }, ctx: actor })).rejects.toThrow("denied");
      expect(r.emit).not.toHaveBeenCalled(); expect(r.download).not.toHaveBeenCalled(); expect(r.email).not.toHaveBeenCalled(); expect(r.io.put).not.toHaveBeenCalled(); expect(r.io.get).not.toHaveBeenCalled();
    }
  });
  it("protocolo commitado responde sem tocar SMTP/NF mesmo eternamente pendentes", async () => {
    const r = runtime(); r.row.notaFiscalKey = "nf_42_1700000000000.pdf";
    r.email.mockImplementation(() => new Promise(() => undefined)); r.io.get.mockImplementation(() => new Promise(() => undefined));
    const result = await r.endpoint("gerarBoleto")({ input: issue, ctx: actor });
    expect(result.status).toBe("created"); expect(r.row.boletoSolicitacaoId).toMatch(/^fin-b1:c:/);
    expect(r.events.indexOf("tx-commit")).toBeLessThan(r.events.indexOf("inter-emit"));
    expect(r.email).not.toHaveBeenCalled(); expect(r.io.get).not.toHaveBeenCalled(); expect(r.download).not.toHaveBeenCalled();
    expect((await r.endpoint("gerarBoleto")({ input: issue, ctx: actor })).status).toBe("replayed"); expect(r.emit).toHaveBeenCalledTimes(1);
    await expect(r.endpoint("gerarBoleto")({ input: { ...issue, pagador: { ...payer, nome: "CHANGED" } }, ctx: actor })).rejects.toThrow("divergentes"); expect(r.emit).toHaveBeenCalledTimes(1);
  });
  it("claim rollback não emite; timeout incerto bloqueia retry de handler novo", async () => {
    const r = runtime({ rollback: true }); await expect(r.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow("Reserva bancária não confirmada"); expect(r.emit).not.toHaveBeenCalled(); expect(r.row.boletoSolicitacaoId).toBeNull();
    const uncertain = runtime(); uncertain.emit.mockRejectedValue(Error("timeout"));
    await expect(uncertain.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow("reconciliação");
    expect(uncertain.row.boletoSolicitacaoId).toMatch(/^fin-b1:u:/);
    await expect(uncertain.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow("reconciliação"); expect(uncertain.emit).toHaveBeenCalledTimes(1);
  });
  it("sentinel nunca chega a Inter/email; NF missing nunca marca email sim", async () => {
    const r = runtime(); r.emit.mockRejectedValue(Error("uncertain")); await expect(r.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow();
    for (const name of ["baixarBoleto", "enviarEmailBoleto"]) await expect(r.endpoint(name)({ input: { recebivelId: 42, email: "synthetic@example.invalid" }, ctx: actor })).rejects.toThrow("reconciliação");
    expect(r.download).not.toHaveBeenCalled(); expect(r.email).not.toHaveBeenCalled();
    const legacy = runtime({ reference: "PROTOCOL-SYNTH" });
    await expect(legacy.endpoint("enviarEmailBoleto")({ input: { recebivelId: 42, email: "synthetic@example.invalid" }, ctx: actor })).rejects.toThrow("NF"); expect(legacy.email).not.toHaveBeenCalled(); expect(legacy.row.emailEnviado).toBe("nao");
  });
  it("download NF retorna bytes e filename sintético, não chave/URL", async () => {
    const r = runtime(); await r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor });
    const result = await r.endpoint("baixarNotaFiscal", true)({ input: { recebivelId: 42 }, ctx: actor });
    expect(result).toEqual({ base64: pdf.toString("base64"), fileName: "nota-fiscal-42.pdf" });
  });
  it("entrega manual com NF válida inclui ambos anexos e só então marca enviado", async () => {
    const r = runtime(); await r.endpoint("anexarNotaFiscal")({ input: upload, ctx: actor });
    await r.endpoint("gerarBoleto")({ input: issue, ctx: actor });
    expect(r.row.emailEnviado).toBe("nao");
    await r.endpoint("enviarEmailBoleto")({ input: { recebivelId: 42, email: "synthetic@example.invalid" }, ctx: actor });
    expect(r.email).toHaveBeenCalledWith("synthetic@example.invalid", pdf.toString("base64"), "PROTOCOL-SYNTH", "100.00", pdf.toString("base64"));
    expect(r.row.emailEnviado).toBe("sim");
  });
  it("concurrent handlers durante Inter pendente têm reserva COMMITADA e só uma emissão", async () => {
    const r = runtime(); let resolve!: (value: any) => void;
    r.emit.mockImplementation(() => new Promise<any>(done => { resolve = done; }));
    const first = r.endpoint("gerarBoleto")({ input: issue, ctx: actor });
    while (!r.emit.mock.calls.length) await Promise.resolve();
    expect(r.row.boletoSolicitacaoId).toMatch(/^fin-b1:r:/);
    await expect(r.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow("reconciliação");
    resolve({ configured: true, codigoSolicitacao: "PROTOCOL-SYNTH" }); await first;
    expect(r.emit).toHaveBeenCalledTimes(1);
  });
  it("consultar/download/cancelar administrativos recusam sentinel e emissão avulsa é fechada", async () => {
    const r = runtime(); r.emit.mockRejectedValue(Error("uncertain"));
    await expect(r.endpoint("gerarBoleto")({ input: issue, ctx: actor })).rejects.toThrow();
    for (const name of ["consultarBoleto", "downloadBoletoPdf", "cancelarBoleto"]) {
      await expect(r.endpoint(name, name === "consultarBoleto", true)({ input: { estabelecimentoId: 9, bancoId: 7, codigoSolicitacao: r.row.boletoSolicitacaoId, motivoCancelamento: "SYNTHETIC" }, ctx: actor })).rejects.toThrow("reconciliação");
    }
    expect(r.download).not.toHaveBeenCalled();
    await expect(r.endpoint("emitirBoleto", false, true)({ input: { estabelecimentoId: 9, bancoId: 7 }, ctx: actor })).rejects.toThrow("avulsa bloqueada");
    expect(r.emit).toHaveBeenCalledTimes(1);
  });
});
