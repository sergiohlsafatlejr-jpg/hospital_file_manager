import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { type SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), getConvenioById: vi.fn(), verificarPermissaoEstabelecimento: vi.fn(),
}));
vi.mock("./db", () => mocks);
import { registrarGlosaManualSegura, type RegistrarGlosaManualInput } from "./glosaManualService";
import { exigirPermissaoGlosaManual } from "./glosaManualPermissions";

const dialect = new MySqlDialect();
const item = {
  codigoItem: "PROC-QA", descricaoItem: "Procedimento sintético", dataExecucao: "2026-10-01",
  valorInformado: 0.3, valorPago: 0.1, valorGlosa: 0.2, justificativa: "Justificativa sintética",
};
const input: RegistrarGlosaManualInput = {
  estabelecimentoId: 9, convenioId: 7, userId: 5, idempotencyKey: "request-qa-001",
  numeroGuia: "GUIA-QA", protocolo: "PROTOCOLO-QA", nomeBeneficiario: "Paciente sintético",
  dataPagamento: "2026-10-20", itens: [{ ...item }],
};
type Registro = Record<string, any>;
type Estado = { arquivos: Registro[]; demonstrativo: Registro[]; recursos: Registro[] };
type Opcoes = {
  hospital?: boolean; ativoHospital?: string; usuario?: boolean; role?: string;
  hospitalId?: unknown; usuarioId?: unknown; convenioId?: unknown;
  permissao?: Partial<Registro> | null; convenio?: boolean; convenioHospital?: unknown;
  convenioAtivo?: string; falhar?: "arquivo" | "item" | "segundo-item" | "recurso" | "vinculo";
  idInvalido?: boolean;
  antesTransaction?: () => void;
};

/** Fake sem drivers: snapshot só após adquirir lock real simulado, commit/rollback de todas as tabelas. */
function bancoFake(opcoes: Opcoes = {}) {
  let estado: Estado = { arquivos: [], demonstrativo: [], recursos: [] };
  const calls: Array<{ tx: number; sql: string; params: unknown[] }> = [];
  let proximoId = 100;
  let proximaTx = 1;
  let lockTail = Promise.resolve();
  let ativos = 0;
  let maxLocks = 0;
  let rollbacks = 0;
  let commits = 0;
  const db = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      opcoes.antesTransaction?.();
      const txId = proximaTx++;
      let release: (() => void) | undefined;
      let local: Estado | undefined;
      const tx = {
        execute: vi.fn(async (query: SQL) => {
          const q = dialect.sqlToQuery(query);
          const text = q.sql.replace(/\s+/g, " ").trim();
          calls.push({ tx: txId, sql: text, params: q.params });
          if (text.includes("FROM estabelecimentos")) {
            expect(text).toContain("FOR UPDATE");
            const anterior = lockTail;
            lockTail = new Promise<void>(resolve => { release = resolve; });
            await anterior;
            ativos++;
            maxLocks = Math.max(maxLocks, ativos);
            local = structuredClone(estado);
            return [opcoes.hospital === false ? [] : [{ id: Object.hasOwn(opcoes, "hospitalId") ? opcoes.hospitalId : q.params[0], ativo: opcoes.ativoHospital ?? "sim" }]];
          }
          if (!local) throw new Error("Consulta anterior ao lock do hospital");
          if (text.includes("FROM users")) {
            expect(text).toContain("FOR UPDATE");
            return [opcoes.usuario === false ? [] : [{ id: Object.hasOwn(opcoes, "usuarioId") ? opcoes.usuarioId : q.params[0], role: opcoes.role ?? "user" }]];
          }
          if (text.includes("FROM permissoesEstabelecimento")) {
            expect(text).toContain("FOR UPDATE");
            return [opcoes.permissao === null ? [] : [{
              podeVisualizar: "sim", podeEditar: "sim", acessoDemonstrativo: "sim",
              acessoRecursos: "sim", acessoRecursosGlosa: "nao", ...opcoes.permissao,
            }]];
          }
          if (text.includes("FROM convenios")) {
            expect(text).toContain("FOR UPDATE");
            return [opcoes.convenio === false ? [] : [{
              id: Object.hasOwn(opcoes, "convenioId") ? opcoes.convenioId : q.params[0],
              estabelecimentoId: Object.hasOwn(opcoes, "convenioHospital") ? opcoes.convenioHospital : 9,
              ativo: opcoes.convenioAtivo ?? "sim",
            }]];
          }
          if (text.startsWith("SELECT") && text.includes("FROM arquivos")) {
            expect(text).toContain("FOR UPDATE");
            const [hospital, prefixo] = q.params;
            return [local.arquivos.filter(a => a.estabelecimentoId === hospital && a.nome.startsWith(String(prefixo).slice(0, -1)))];
          }
          if (text.startsWith("SELECT") && text.includes("FROM demonstrativo")) {
            const [arquivo, hospital, convenio] = q.params;
            return [local.demonstrativo.filter(d => d.arquivo_id === arquivo && d.estabelecimentoId === hospital && d.convenio_id === convenio)
              .sort((a, b) => a.id - b.id).map(d => ({ id: d.id, recursoId: d.recurso_id,
                recursoVinculado: local!.recursos.find(r => r.id === d.recurso_id && r.estabelecimentoId === hospital && r.convenioId === convenio)?.id,
              }))];
          }
          if (text.includes("FROM motivosGlosa")) return [[]];
          if (text.startsWith("INSERT")) {
            const match = text.match(/^INSERT INTO (\w+) \((.*?)\) VALUES \((.*?)\)$/)!;
            if (!match) throw new Error(`Insert não reconhecido: ${text}`);
            const [, tabela, colunas, valores] = match;
            if ((tabela === "arquivos" && opcoes.falhar === "arquivo") ||
                (tabela === "demonstrativo" && (opcoes.falhar === "item" ||
                  (opcoes.falhar === "segundo-item" && local.demonstrativo.length === 1))) ||
                (tabela === "recursosGlosa" && opcoes.falhar === "recurso")) throw new Error("Falha sintética de insert");
            const registro: Registro = { id: proximoId++ };
            let posicao = 0;
            const tokens = valores.split(",").map(v => v.trim());
            colunas.split(",").map(c => c.trim()).forEach((coluna, i) => {
              const token = tokens[i];
              registro[coluna] = token === "?" ? q.params[posicao++] :
                token.startsWith("'") ? token.slice(1, -1) : Number(token);
            });
            expect(posicao).toBe(q.params.length);
            if (tabela === "arquivos") local.arquivos.push(registro);
            else if (tabela === "demonstrativo") local.demonstrativo.push(registro);
            else if (tabela === "recursosGlosa") local.recursos.push(registro);
            else throw new Error("Tabela fora do escopo");
            return [{ insertId: opcoes.idInvalido ? 0 : registro.id }];
          }
          if (text.startsWith("UPDATE demonstrativo")) {
            if (opcoes.falhar === "vinculo") return [{ affectedRows: 0 }];
            const [recursoId, demonstrativoId, arquivoId, hospital, convenio] = q.params;
            const d = local.demonstrativo.find(d => d.id === demonstrativoId && d.arquivo_id === arquivoId &&
              d.estabelecimentoId === hospital && d.convenio_id === convenio && d.recurso_id == null);
            if (!d) return [{ affectedRows: 0 }];
            d.recurso_id = recursoId;
            d.recurso_status = "recurso_criado";
            d.classificacao_glosa = "recursar";
            return [{ affectedRows: 1 }];
          }
          throw new Error(`SQL fora do contrato: ${text}`);
        }),
      };
      try {
        const result = await fn(tx);
        estado = local!;
        commits++;
        return result;
      } catch (error) {
        rollbacks++;
        throw error;
      } finally {
        if (local) ativos--;
        release?.();
      }
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  return {
    db, calls, get estado() { return estado; }, get maxLocks() { return maxLocks; },
    get rollbacks() { return rollbacks; }, get commits() { return commits; },
  };
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useRealTimers();
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.getConvenioById.mockResolvedValue({ id: input.convenioId, estabelecimentoId: null, ativo: "sim" });
});

describe("lançamento manual seguro isolado", () => {
  it("mantém dinheiro decimal exato, protocolo externo e âncora somente metadata", async () => {
    const fake = bancoFake();
    const result = await registrarGlosaManualSegura(input);
    expect(result).toEqual({ success: true, totalInseridos: 1, idsInseridos: [101], dataPagamento: "2026-10-20", competencia: "2026-10" });
    expect(fake.estado.arquivos[0]).toMatchObject({ s3Key: "", s3Url: "", tamanho: 0, tipoArquivo: "txt", status: "processado" });
    expect(fake.estado.arquivos[0].nome).toMatch(/^manual-glosa:v1:[a-f0-9]{64}:[a-f0-9]{64}:2026-10-20$/);
    expect(fake.estado.arquivos[0].nome).not.toContain(input.idempotencyKey);
    expect(fake.estado.demonstrativo[0]).toMatchObject({ arquivo_id: 100, protocolo: "PROTOCOLO-QA", valor_informado: "0.30", valor_pago: "0.10", valor_glosa: "0.20", recurso_id: 102 });
    expect(fake.estado.recursos[0]).toMatchObject({ valorCobrado: "0.20", valorGlosado: "0.20", justificativaRecurso: item.justificativa });
    expect(fake.commits).toBe(1);
    expect(fake.db.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(["user", "admin"])("GLOBAL ativo é aceito por %s e cada arquivo/item/recurso tem hospital explícito", async role => {
    const fake = bancoFake({ convenioHospital: null, role });
    const result = await registrarGlosaManualSegura({ ...input, itens: [{ ...item }, { ...item, justificativa: undefined }] });
    expect(result).toMatchObject({ success: true, totalInseridos: 2 });
    expect(fake.estado.arquivos).toHaveLength(1);
    expect(fake.estado.demonstrativo).toHaveLength(2);
    expect(fake.estado.recursos).toHaveLength(1);
    for (const registro of [...fake.estado.arquivos, ...fake.estado.demonstrativo, ...fake.estado.recursos]) {
      expect(registro.estabelecimentoId).toBe(input.estabelecimentoId);
      expect(registro.convenioId ?? registro.convenio_id).toBe(input.convenioId);
    }
    expect(fake.estado.arquivos[0]).toMatchObject({ s3Key: "", s3Url: "", tamanho: 0, tipoArquivo: "txt" });
    expect(fake.estado.demonstrativo[0].recurso_id).toBe(fake.estado.recursos[0].id);
    expect(fake.calls.filter(c => c.sql.includes("FROM convenios"))).toEqual([
      expect.objectContaining({ sql: "SELECT id, estabelecimentoId, ativo FROM convenios WHERE id = ? FOR UPDATE", params: [input.convenioId] }),
    ]);
    expect(fake.calls.some(c => /^(INSERT|UPDATE|DELETE).*convenios\b/.test(c.sql))).toBe(false);
    expect(fake.calls.some(c => /\b(storage|faturamento_unificado|faturamento_tiss)\b/.test(c.sql))).toBe(false);
  });

  it("dois hospitais com mesmo GLOBAL, guia e chave mantêm âncoras, itens e recursos isolados", async () => {
    const fake = bancoFake({ convenioHospital: null });
    const outroHospital = { ...input, estabelecimentoId: 10 };
    const [a, b] = await Promise.all([registrarGlosaManualSegura(input), registrarGlosaManualSegura(outroHospital)]);
    expect(a.idsInseridos).not.toEqual(b.idsInseridos);
    expect(fake.estado.arquivos).toHaveLength(2);
    expect(new Set(fake.estado.arquivos.map(a => a.nome)).size).toBe(2);
    expect(fake.estado.demonstrativo).toHaveLength(2);
    expect(fake.estado.recursos).toHaveLength(2);
    for (const payload of [input, outroHospital]) {
      const [arquivo] = fake.estado.arquivos.filter(a => a.estabelecimentoId === payload.estabelecimentoId);
      const [demo] = fake.estado.demonstrativo.filter(d => d.estabelecimentoId === payload.estabelecimentoId);
      const [recurso] = fake.estado.recursos.filter(r => r.estabelecimentoId === payload.estabelecimentoId);
      expect(arquivo.convenioId).toBe(input.convenioId);
      expect(demo).toMatchObject({ arquivo_id: arquivo.id, convenio_id: input.convenioId, recurso_id: recurso.id });
      expect(recurso.convenioId).toBe(input.convenioId);
    }
    const posicao = fake.calls.length;
    expect(await registrarGlosaManualSegura(input)).toEqual(a);
    expect(await registrarGlosaManualSegura(outroHospital)).toEqual(b);
    expect(fake.calls.slice(posicao).filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    // Corrupção no vínculo do hospital B não interfere no replay do hospital A.
    fake.estado.recursos.find(r => r.estabelecimentoId === 10)!.estabelecimentoId = 11;
    expect(await registrarGlosaManualSegura(input)).toEqual(a);
    await expect(registrarGlosaManualSegura(outroHospital)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("bloqueia owner alterado de GLOBAL para alheio entre pré-check e transação antes de qualquer escrita", async () => {
    const opcoes: Opcoes = { convenioHospital: null };
    opcoes.antesTransaction = () => { opcoes.convenioHospital = 10; };
    const fake = bancoFake(opcoes);
    await expect(exigirPermissaoGlosaManual(input.userId, input.estabelecimentoId, input.convenioId)).resolves.toMatchObject({ estabelecimentoId: null });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.calls.map(c => c.sql.match(/FROM (\w+)/)?.[1])).toEqual([
      "estabelecimentos", "users", "permissoesEstabelecimento", "convenios",
    ]);
    expect(fake.estado).toEqual({ arquivos: [], demonstrativo: [], recursos: [] });
    expect(fake.rollbacks).toBe(1);
  });

  it.each([
    { ativoHospital: "nao" }, { usuario: false }, { convenio: false }, { convenioAtivo: "nao" },
  ])("não confia no pré-check após mudança de hospital/usuário/convênio: %j", async alteracao => {
    const opcoes: Opcoes = { convenioHospital: null };
    opcoes.antesTransaction = () => { Object.assign(opcoes, alteracao); };
    const fake = bancoFake(opcoes);
    await expect(exigirPermissaoGlosaManual(input.userId, input.estabelecimentoId, input.convenioId)).resolves.toMatchObject({ ativo: "sim" });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.calls.every(c => c.sql.endsWith("FOR UPDATE"))).toBe(true);
    expect(fake.rollbacks).toBe(1);
  });

  it("papel admin é relido sob lock e um usuário rebaixado sem permissão não grava", async () => {
    const opcoes: Opcoes = { convenioHospital: null, role: "admin", permissao: null };
    opcoes.antesTransaction = () => { opcoes.role = "user"; };
    const fake = bancoFake(opcoes);
    await exigirPermissaoGlosaManual(input.userId, input.estabelecimentoId, input.convenioId);
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.some(c => c.sql.includes("FROM users") && c.sql.endsWith("FOR UPDATE"))).toBe(true);
    expect(fake.calls.some(c => c.sql.includes("FROM permissoesEstabelecimento"))).toBe(true);
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
  });

  it.each([
    { podeEditar: "nao" }, { podeVisualizar: "nao" }, { acessoDemonstrativo: "nao" },
    { acessoRecursos: "nao", acessoRecursosGlosa: "nao" },
  ])("revalida permissão revogada entre pré-check e transação: %j", async permissao => {
    const opcoes: Opcoes = { convenioHospital: null };
    opcoes.antesTransaction = () => { opcoes.permissao = permissao; };
    const fake = bancoFake(opcoes);
    await expect(exigirPermissaoGlosaManual(input.userId, input.estabelecimentoId, input.convenioId)).resolves.toMatchObject({ ativo: "sim" });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.calls.some(c => c.sql.includes("FROM permissoesEstabelecimento") && c.sql.endsWith("FOR UPDATE"))).toBe(true);
    expect(fake.calls.some(c => c.sql.includes("FROM convenios"))).toBe(false);
    expect(fake.rollbacks).toBe(1);
  });

  it("replay GLOBAL não ignora revogação de editar após o primeiro commit", async () => {
    const opcoes: Opcoes = { convenioHospital: null };
    const fake = bancoFake(opcoes);
    await registrarGlosaManualSegura(input);
    opcoes.permissao = { podeEditar: "nao" };
    const posicao = fake.calls.length;
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.slice(posicao).filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.estado.demonstrativo).toHaveLength(1);
    expect(fake.commits).toBe(1);
  });

  it("preserva dois procedimentos legítimos de mesmo código com vínculos exatos", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item, sequencialItem: 1 }, { ...item, sequencialItem: 2, valorInformado: 100.01, valorPago: 20.01, valorGlosa: 80 }] });
    expect(fake.estado.demonstrativo).toHaveLength(2);
    expect(fake.estado.recursos).toHaveLength(2);
    expect(fake.estado.demonstrativo.map(d => d.recurso_id)).toEqual(fake.estado.recursos.map(r => r.id));
    expect(fake.estado.recursos.map(r => r.valorCobrado)).toEqual(["0.20", "80.00"]);
    expect(fake.calls.filter(c => c.sql.startsWith("UPDATE"))).toHaveLength(2);
    expect(fake.calls.filter(c => c.sql.startsWith("UPDATE")).every(c => c.sql.includes("WHERE id = ? AND arquivo_id = ? AND estabelecimentoId = ? AND convenio_id = ?"))).toBe(true);
  });
  it("permite mesmo código e sequencial em datas distintas", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item, sequencialItem: 1 }, { ...item, sequencialItem: 1, dataExecucao: "2026-10-02" }] });
    expect(fake.estado.recursos).toHaveLength(2);
  });
  it("não cria recurso para pagamento integral, nem infere glosa a partir de zero explícito", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item, valorInformado: 100, valorPago: 100, valorGlosa: 0 }, { ...item, valorInformado: 100, valorPago: 30, valorGlosa: 0 }] });
    expect(fake.estado.recursos).toHaveLength(0);
    expect(fake.estado.demonstrativo).toHaveLength(2);
    expect(fake.estado.demonstrativo.every(d => d.valor_glosa === "0.00" && d.recurso_status === "sem_recurso")).toBe(true);
  });
  it("cria somente recurso do item justificado, sem bloquear ou marcar demais itens da guia", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item }, { ...item, justificativa: "  " }] });
    expect(fake.estado.recursos).toHaveLength(1);
    expect(fake.estado.demonstrativo[1]).toMatchObject({ recurso_status: "sem_recurso", classificacao_glosa: "pendente", justificativa_recurso: null });
  });
  it("repetição idêntica relê IDs persistidos e não escreve", async () => {
    const fake = bancoFake();
    const primeiro = await registrarGlosaManualSegura(input);
    const posicao = fake.calls.length;
    const segundo = await registrarGlosaManualSegura(structuredClone(input));
    expect(segundo).toEqual(primeiro);
    expect(fake.calls.slice(posicao).filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.estado.arquivos).toHaveLength(1);
  });
  it("repetição após mudança do dia mantém a data original se omitida", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    bancoFake();
    const payload = { ...input, dataPagamento: undefined };
    const primeiro = await registrarGlosaManualSegura(payload);
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
    expect(await registrarGlosaManualSegura(payload)).toEqual(primeiro);
  });
  it("mesma chave e payload diferente retorna CONFLICT sem sobrescrever protocolo", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura(input);
    await expect(registrarGlosaManualSegura({ ...input, protocolo: "ALTERADO-QA" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.estado.demonstrativo[0].protocolo).toBe("PROTOCOLO-QA");
    expect(fake.estado.demonstrativo).toHaveLength(1);
  });
  it("serializa repetições concorrentes antes de reler âncora", async () => {
    const fake = bancoFake();
    const resultados = await Promise.all(Array.from({ length: 8 }, () => registrarGlosaManualSegura(structuredClone(input))));
    expect(resultados.every(r => JSON.stringify(r) === JSON.stringify(resultados[0]))).toBe(true);
    expect(fake.estado.arquivos).toHaveLength(1);
    expect(fake.estado.demonstrativo).toHaveLength(1);
    expect(fake.estado.recursos).toHaveLength(1);
    expect(fake.maxLocks).toBe(1);
    const txIds = new Set(fake.calls.map(c => c.tx));
    for (const tx of txIds) {
      const calls = fake.calls.filter(c => c.tx === tx);
      expect(calls[0].sql).toContain("FROM estabelecimentos");
      expect(calls.find(c => c.sql.includes("FROM arquivos"))?.sql).toContain("FOR UPDATE");
    }
  });
  it("colisão concorrente de payload diferente só permite um commit", async () => {
    const fake = bancoFake();
    const results = await Promise.allSettled([registrarGlosaManualSegura(input), registrarGlosaManualSegura({ ...input, protocolo: "ALTERADO-QA" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("CONFLICT");
    expect(fake.estado.demonstrativo).toHaveLength(1);
  });
  it("convênios com guia homônima e pedidos distintos não compartilham IDs", async () => {
    const fake = bancoFake();
    const a = await registrarGlosaManualSegura(input);
    const b = await registrarGlosaManualSegura({ ...input, convenioId: 8, idempotencyKey: "request-qa-002" });
    expect(a.idsInseridos).not.toEqual(b.idsInseridos);
    expect(fake.estado.recursos.map(r => r.convenioId)).toEqual([7, 8]);
    expect(fake.estado.demonstrativo.map(d => d.convenio_id)).toEqual([7, 8]);
    expect(fake.estado.demonstrativo.map(d => d.recurso_id)).toEqual(fake.estado.recursos.map(r => r.id));
  });
  it("não deixa trocar convênio reaproveitando a mesma chave", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura(input);
    await expect(registrarGlosaManualSegura({ ...input, convenioId: 8 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.estado.recursos).toHaveLength(1);
  });
  it.each(["arquivo", "item", "segundo-item", "recurso", "vinculo"] as const)("rollback completo quando falha %s", async falhar => {
    const fake = bancoFake({ falhar });
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item }, { ...item }] })).rejects.toThrow();
    expect(fake.estado).toEqual({ arquivos: [], demonstrativo: [], recursos: [] });
    expect(fake.rollbacks).toBe(1);
    expect(fake.commits).toBe(0);
  });
  it("rollback também quando insert não retorna ID", async () => {
    const fake = bancoFake({ idInvalido: true });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.estado.arquivos).toHaveLength(0);
  });
  it("não repara âncora parcial silenciosamente", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura(input);
    fake.estado.demonstrativo.splice(0);
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.estado.demonstrativo).toHaveLength(0);
  });
  it("não declara replay íntegro se recurso foi excluído ou mudou de convênio", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura(input);
    fake.estado.recursos[0].convenioId = 8;
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.estado.demonstrativo).toHaveLength(1);
    expect(fake.estado.recursos).toHaveLength(1);
  });
  it.each([
    { hospital: false }, { ativoHospital: "nao" }, { usuario: false }, { permissao: null },
    { permissao: { podeEditar: "nao" } }, { permissao: { podeVisualizar: "nao" } },
    { permissao: { acessoDemonstrativo: "nao" } }, { permissao: { acessoRecursos: "nao", acessoRecursosGlosa: "nao" } },
    { convenio: false }, { convenioHospital: 10 }, { convenioHospital: undefined }, { convenioHospital: 0 },
    { convenioHospital: "9" }, { convenioHospital: false }, { convenioAtivo: "nao" },
    { convenioHospital: null, convenioAtivo: "nao" },
    { hospitalId: 10 }, { usuarioId: 6 }, { convenioId: 8 }, { convenioId: "7" },
  ])("nega autorização/convênio estritos antes de escrever: %j", async opcoes => {
    const fake = bancoFake(opcoes);
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
  });
  it("admin existente tem acesso de edição mas não ignora convênio de outro hospital", async () => {
    const fake = bancoFake({ role: "admin", permissao: null });
    await registrarGlosaManualSegura(input);
    expect(fake.calls.some(c => c.sql.includes("FROM permissoesEstabelecimento"))).toBe(false);
    bancoFake({ role: "admin", convenioHospital: 10 });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([
    { hospital: false }, { ativoHospital: "nao" }, { usuario: false }, { convenio: false },
    { convenioHospital: 10 }, { convenioHospital: undefined }, { convenioHospital: 0 },
    { convenioHospital: "9" }, { convenioAtivo: "nao" }, { convenioHospital: null, convenioAtivo: "nao" },
  ])("admin não contorna hospital/convênio inválidos: %j", async opcoes => {
    const fake = bancoFake({ ...opcoes, role: "admin", permissao: null });
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
    expect(fake.commits).toBe(0);
  });
  it("permite acessoRecursosGlosa equivalente ao módulo recursos", async () => {
    bancoFake({ convenioHospital: null, permissao: { acessoRecursos: "nao", acessoRecursosGlosa: "sim" } });
    await expect(registrarGlosaManualSegura(input)).resolves.toMatchObject({ success: true });
  });
  it("edição simples continua exigindo módulos mesmo sem justificativa ou recurso novo", async () => {
    const fake = bancoFake({ convenioHospital: null, permissao: { acessoRecursos: "nao", acessoRecursosGlosa: "nao" } });
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item, justificativa: undefined }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.calls.filter(c => /^(INSERT|UPDATE)/.test(c.sql))).toHaveLength(0);
  });
  it.each([
    { valorInformado: -1 }, { valorPago: 1 }, { valorGlosa: 0.21 }, { valorGlosa: -1 },
    { valorGlosa: Infinity }, { valorPago: NaN }, { valorInformado: 10000000000 },
    { valorGlosa: 0.001 }, { valorInformado: 0.1 + 0.2 }, { quantidade: 0 }, { quantidade: -1 },
    { quantidade: 1000000000 }, { quantidade: 1.0001 }, { sequencialItem: 0 },
    { dataExecucao: "2026-02-29" }, { dataExecucao: "2026-04-31" }, { dataExecucao: "2026-13-01" },
  ])("rejeita item inválido antes de obter banco: %j", async alteracao => {
    bancoFake();
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item, ...alteracao }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each([
    { estabelecimentoId: 0 }, { convenioId: -1 }, { userId: 2147483648 }, { idempotencyKey: "" },
    { estabelecimentoId: undefined }, { estabelecimentoId: null }, { convenioId: undefined },
    { dataPagamento: "2026-02-30" }, { dataPagamento: "0999-01-01" }, { numeroGuia: "x".repeat(51) },
    { nomeBeneficiario: "x\u0000" }, { itens: [] },
  ])("rejeita cabeçalho inválido antes de obter banco: %j", async alteracao => {
    bancoFake();
    await expect(registrarGlosaManualSegura({ ...input, ...alteracao } as RegistrarGlosaManualInput)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("aceita calendário bissexto, quantidade decimal e limite financeiro exato", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, dataPagamento: "2024-02-29", itens: [{ ...item, quantidade: 1.125, valorInformado: 99999999.99, valorPago: 0, valorGlosa: 99999999.99 }] });
    expect(fake.estado.demonstrativo[0]).toMatchObject({ quantidade: "1.125", valor_informado: "99999999.99" });
  });
  it("usa limite DECIMAL12,2 no informado/pago e DECIMAL10,2 somente no recurso", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item,
      valorInformado: 9999999999.99, valorPago: 9999999999.79, valorGlosa: 0.2,
    }] });
    expect(fake.estado.recursos[0].valorCobrado).toBe("0.20");
    mocks.getDb.mockClear();
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item,
      valorInformado: 100000000, valorPago: 0, valorGlosa: 100000000,
    }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("não reduz DECIMAL12,2 do demonstrativo quando não existe recurso DECIMAL10,2", async () => {
    const fake = bancoFake({ convenioHospital: null });
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item,
      valorInformado: 9999999999.99, valorPago: 0, valorGlosa: 9999999999.99, justificativa: undefined,
    }] });
    expect(fake.estado.demonstrativo[0]).toMatchObject({ valor_informado: "9999999999.99", valor_glosa: "9999999999.99", valor_recurso: "0.00" });
    expect(fake.estado.recursos).toHaveLength(0);
  });
  it("aceita justificativa multilinha legítima e tipo em branco usa CON", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, itens: [{ ...item, tipoLancamento: "  ", justificativa: "Linha QA 1\nLinha QA 2" }] });
    expect(fake.estado.recursos[0].justificativaRecurso).toBe("Linha QA 1\nLinha QA 2");
    expect(fake.estado.demonstrativo[0].tipo_lancamento).toBe("CON");
  });
  it("rejeita identidade repetida sem deduplicar por código somente", async () => {
    bancoFake();
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item, sequencialItem: 1 }, { ...item, sequencialItem: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejeita identidade efetiva repetida após fallback da data", async () => {
    const fake = bancoFake();
    await expect(registrarGlosaManualSegura({ ...input, itens: [
      { ...item, sequencialItem: 1, dataExecucao: undefined },
      { ...item, sequencialItem: 1, dataExecucao: input.dataPagamento },
    ] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fake.estado.arquivos).toHaveLength(0);
  });
  it("rejeita texto que estoura bytes UTF-8 do campo TEXT", async () => {
    bancoFake();
    await expect(registrarGlosaManualSegura({ ...input, itens: [{ ...item, justificativa: "á".repeat(40000) }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("envia caracteres SQL exclusivamente como parâmetros", async () => {
    const fake = bancoFake();
    await registrarGlosaManualSegura({ ...input, numeroGuia: "QA'\\--", itens: [{ ...item, descricaoItem: "QA'); DROP TABLE exemplo; --" }] });
    expect(fake.calls.some(c => c.sql.includes("DROP TABLE"))).toBe(false);
    expect(fake.estado.demonstrativo[0].numero_guia).toBe("QA'\\--");
  });
  it("falha fechada sem banco", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(registrarGlosaManualSegura(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
