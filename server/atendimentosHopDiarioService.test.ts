import { describe, expect, it, vi } from "vitest";
import {
  __atendimentosHopDiarioInternals,
  criarAtendimentosHopDiarioService,
} from "./atendimentosHopDiarioService";

const TOKEN = "t".repeat(43);
const LOTE = "00000000-0000-4000-8000-000000000001";
const FINGERPRINT = "a".repeat(64);
const contagens = {
  totalFonte: 2, ativosAntes: 2, novos: 0, atualizados: 0, reativados: 0,
  inalterados: 2, inativados: 0, ativosDepois: 2,
};
function controle() {
  return {
    id: 17, estabelecimentoId: 1260036, criadoPor: 9, estado: "pausado", taskUid: null,
    cronUtc: "0 0 13 * * *", fuso: "America/Sao_Paulo", operacaoToken: "operation",
    execucaoToken: null, leaseAte: null, ultimoSlot: null, ultimaExecucao: null, proximaExecucao: null,
    producerTokenHash: __atendimentosHopDiarioInternals.tokenHash(TOKEN), leaseAtiva: 0, leaseExpirada: 0,
  };
}
function lote(state: "carregando" | "completo" | "publicado" | "falhou" = "carregando") {
  return {
    id: 31, controleId: 17, estabelecimentoId: 1260036, loteRef: LOTE, estado: state,
    totalEsperado: null, totalObservado: null, fingerprintPrivado: null,
    iniciadoEm: "2026-10-27 13:00:00", concluidoEm: null, publicadoEm: null, falhouEm: null, codigo: null,
  };
}
function fakePool(options: {
  existingLote?: ReturnType<typeof lote> | null;
  totalFonte?: number;
  ativosAntes?: number;
  automaticoPermitido?: boolean;
  noControl?: boolean;
  missingControlTable?: boolean;
  taskControl?: ReturnType<typeof controle>;
  creatorAdmin?: boolean;
} = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = {
    query: vi.fn(async () => [[{ versao: "8.0.36" }], []]),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (options.missingControlTable && sql.includes("FROM atendimentos_hop_controles")) {
        throw Object.assign(new Error("doesn't exist"), { code: "ER_NO_SUCH_TABLE" });
      }
      if (sql.includes("FROM atendimentos_hop_controles WHERE producer_token_hash")) return [[controle()], []];
      if (sql.includes("FROM atendimentos_hop_controles WHERE task_uid")) return [options.taskControl ? [options.taskControl] : [], []];
      if (sql.includes("FROM atendimentos_hop_controles WHERE estabelecimento_id")) return [options.noControl ? [] : [controle()], []];
      if (sql.includes("FROM atendimentos_hop_lotes WHERE controle_id = ? AND lote_ref")) return [options.existingLote ? [options.existingLote] : [], []];
      if (sql.includes("FROM atendimentos_hop_lotes WHERE controle_id = ? ORDER")) return [[], []];
      if (sql.includes("FROM atendimentos_hop_lotes") && sql.includes("estado IN ('carregando', 'incerto')")) return [[], []];
      if (sql.includes("FROM atendimentos_hop_execucoes WHERE controle_id")) return [[], []];
      if (sql.includes("COUNT(*) AS foraDoEscopo")) return [[{ foraDoEscopo: 0 }], []];
      if (sql.includes("FROM users")) return [options.creatorAdmin === false ? [] : [{ id: 9 }], []];
      if (sql.includes("FROM estabelecimentos")) return [[{ id: 1260036 }], []];
      if (sql.startsWith("UPDATE atendimentos_hop_controles")) return [{ affectedRows: 1 }, []];
      if (sql.includes("FROM `stagion_atendimentos_parados_urologico`")) return [[{ numatend: "101" }], []];
      if (sql.includes("FROM `atendimentos_unificados`")) return [[], []];
      if (sql.startsWith("UPDATE atendimentos_hop_lotes")) return [{ affectedRows: 1 }, []];
      if (sql.startsWith("INSERT INTO atendimentos_hop_lotes")) return [{ insertId: 32, affectedRows: 1 }, []];
      throw new Error(`SQL não esperado: ${sql.slice(0, 70)}`);
    }),
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn(),
  };
  return {
    pool: { getConnection: vi.fn(async () => connection) },
    connection,
    calls,
    totalFonte: options.totalFonte ?? 2,
    ativosAntes: options.ativosAntes ?? 2,
    automaticoPermitido: options.automaticoPermitido,
  };
}
function service(fake: ReturnType<typeof fakePool>, options: { slot?: string | null } = {}) {
  return criarAtendimentosHopDiarioService({
    getPool: async () => fake.pool as any,
    previewSecret: () => new TextEncoder().encode("teste"),
    pure: async () => ({
      construirPlanoHop: () => ({ fonteMapeada: [{ origemId: "101" }], novas: [], atualizadas: [], reativadas: [], inalteradas: [], inativarIds: [], contagens: { ...contagens, totalFonte: fake.totalFonte, ativosAntes: fake.ativosAntes, ativosDepois: fake.totalFonte, inalterados: fake.totalFonte }, fingerprint: FINGERPRINT }),
      validarCoberturaHop: () => ({ automaticoPermitido: fake.automaticoPermitido ?? true }),
      slotHopDiario: () => options.slot ?? null,
    }),
  });
}

describe("atendimentosHopDiarioService com dependências injetadas", () => {
  it("não abre pool quando a credencial do produtor é malformada", async () => {
    const fake = fakePool();
    await expect(service(fake).produtorIniciar("token-curto", { loteRef: LOTE })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fake.pool.getConnection).not.toHaveBeenCalled();
  });

  it("inicia lote em transação pessimista e não recebe unidade/tabela pela API", async () => {
    const fake = fakePool();
    await expect(service(fake).produtorIniciar(TOKEN, { loteRef: LOTE })).resolves.toEqual({ aceito: true, estado: "carregando" });
    expect(fake.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(fake.connection.commit).toHaveBeenCalledOnce();
    const insert = fake.calls.find(call => call.sql.startsWith("INSERT INTO atendimentos_hop_lotes"));
    expect(insert?.params).toEqual([17, 1260036, LOTE]);
    expect(fake.calls.some(call => /estabelecimentoId|tabela|querySql/.test(JSON.stringify(call.params)))).toBe(false);
  });

  it("repete inicio de lote carregando sem reescrever o lote", async () => {
    const fake = fakePool({ existingLote: lote("carregando") });
    await expect(service(fake).produtorIniciar(TOKEN, { loteRef: LOTE })).resolves.toEqual({ aceito: true, estado: "carregando" });
    expect(fake.calls.some(call => call.sql.startsWith("INSERT INTO atendimentos_hop_lotes"))).toBe(false);
  });

  it("grava falhou e comita antes de devolver conflito quando a contagem diverge", async () => {
    const fake = fakePool({ existingLote: lote("carregando"), totalFonte: 2 });
    await expect(service(fake).produtorConcluir(TOKEN, { loteRef: LOTE, totalEsperado: 3 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.connection.commit).toHaveBeenCalledTimes(2);
    expect(fake.calls.some(call => call.sql.includes("CONTAGEM_DIVERGENTE"))).toBe(true);
    expect(fake.connection.rollback).not.toHaveBeenCalled();
  });

  it("usa allowlist e DATE_FORMAT para fontes/destino, sem codpac ou conversão de data civil", () => {
    const source = __atendimentosHopDiarioInternals.sourceSql(2550002);
    expect(source).toContain("FROM `stagion_atendimentos_parados_iad`");
    expect(source).toContain("DATE_FORMAT(datatend, '%Y-%m-%d %H:%i:%s')");
    expect(source).toContain("DATE_FORMAT(datasai, '%Y-%m-%d %H:%i:%s')");
    expect(source).toContain("LIMIT 100001");
    expect(source).not.toContain("LIMIT ?");
    expect(source).not.toMatch(/codpac|new Date/i);
    expect(__atendimentosHopDiarioInternals.destinationSql).toContain("DATE_FORMAT(data_entrada, '%Y-%m-%d %H:%i:%s')");
    expect(__atendimentosHopDiarioInternals.destinationSql).toContain("DATE_FORMAT(data_saida, '%Y-%m-%d %H:%i:%s')");
  });

  it("retorna resumo canônico após capturar sem enviar confirmações ao schema estrito", async () => {
    const fake = fakePool();
    await expect(service(fake).confirmarCarga({ estabelecimentoId: 1260036, confirmarCargaCompleta: true, confirmarHopParado: true }, 9)).resolves.toMatchObject({
      estabelecimentoId: 1260036, configuracaoPendente: false, estado: "pausado",
    });
    expect(fake.connection.commit).toHaveBeenCalledOnce();
    expect(fake.connection.rollback).not.toHaveBeenCalled();
    const source = fake.calls.find(call => call.sql.includes("LIMIT 100001"));
    expect(source?.params).toEqual(["1260036"]);
  });

  it("bloqueia fonte 100 versus 200 ativos por cobertura antes de qualquer DML no destino", async () => {
    const fake = fakePool({ existingLote: lote("carregando"), totalFonte: 100, ativosAntes: 200, automaticoPermitido: false });
    await expect(service(fake).produtorConcluir(TOKEN, { loteRef: LOTE, totalEsperado: 100 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.calls.some(call => call.sql.includes("atendimentos_unificados") && /INSERT|UPDATE/.test(call.sql))).toBe(false);
  });

  it("rejeita iniciar novamente um lote já publicado sem autorizar reescrita", async () => {
    const fake = fakePool({ existingLote: lote("publicado") });
    await expect(service(fake).produtorIniciar(TOKEN, { loteRef: LOTE })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.calls.some(call => call.sql.startsWith("INSERT INTO atendimentos_hop_lotes"))).toBe(false);
  });

  it("falha um lote carregando e repete somente a mesma falha sem alterar lote encerrado", async () => {
    const pending = fakePool({ existingLote: lote("carregando") });
    await expect(service(pending).produtorFalhar(TOKEN, { loteRef: LOTE })).resolves.toEqual({ aceito: true, estado: "falhou" });
    expect(pending.calls.some(call => call.sql.includes("FALHA_DECLARADA_PELO_PRODUTOR"))).toBe(true);

    const finished = fakePool({ existingLote: lote("falhou") });
    await expect(service(finished).produtorFalhar(TOKEN, { loteRef: LOTE })).resolves.toEqual({ aceito: true, estado: "falhou" });
    expect(finished.calls.some(call => call.sql.includes("FALHA_DECLARADA_PELO_PRODUTOR"))).toBe(false);
  });

  it("permite bootstrap administrativo no resumo sem controle", async () => {
    const fake = fakePool({ noControl: true });
    await expect(service(fake).resumo({ estabelecimentoId: 1260036 }, 9)).resolves.toMatchObject({
      configuracaoPendente: false, estado: "nao_configurado", podeGerenciar: true, credencialHopConfigurada: false,
    });
  });

  it("retorna resumo pendente e vazio quando as tabelas Hop ainda não existem", async () => {
    const fake = fakePool({ missingControlTable: true });
    await expect(service(fake).resumo({ estabelecimentoId: 1260036 }, 9)).resolves.toMatchObject({
      configuracaoPendente: true, estado: "nao_configurado", podeGerenciar: false, execucoes: [],
    });
  });

  it("consulta linhas fora do escopo antes da fonte filtrada e não inativa por filtro", () => {
    const scope = __atendimentosHopDiarioInternals.sourceScopeSql(1260036);
    expect(scope).toContain("Estabelecimentos_id IS NULL");
    expect(scope).toContain("<> ?");
    expect(__atendimentosHopDiarioInternals.sourceSql(1260036)).toContain("WHERE CAST(Estabelecimentos_id AS CHAR) = ?");
  });

  it("pausa o cron antes de reservar quando o criador não é mais administrador", async () => {
    const fake = fakePool({ taskControl: { ...controle(), estado: "ativo", taskUid: "task-1" }, creatorAdmin: false });
    await expect(service(fake, { slot: "2026-10-27" }).executarPorTaskUid("task-1", new Date("2026-10-27T13:00:00.000Z"))).resolves.toEqual({ status: "ignorado" });
    expect(fake.calls.some(call => call.sql.includes("estado = 'pausado'") && call.sql.includes("proxima_execucao = NULL"))).toBe(true);
  });

  it("calcula a próxima execução diária em UTC para 10:00 de Brasília", () => {
    expect(__atendimentosHopDiarioInternals.nextHopExecutionUtc(new Date("2026-10-27T13:00:00.000Z"))).toBe("2026-10-28 13:00:00.000");
  });
});
