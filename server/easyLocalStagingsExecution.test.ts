import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const fns = vi.hoisted(() => ({
  getRawPool: vi.fn(),
  config: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./db", () => ({ getRawPool: fns.getRawPool }));
vi.mock("./easyLocalCadastroStore", () => ({
  resolverEasyLocalConfig: fns.config,
}));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: fns.create,
  updateHeartbeatJob: fns.update,
  deleteHeartbeatJob: fns.remove,
}));

import { exigirDestinoEasyLocalExecutavel } from "./easyLocalDestinoGuard";
import {
  preverEasyLocalImportacao,
  preverEasyLocalImportacaoAgendada,
  executarEasyLocalImportacao,
  executarEasyLocalImportacaoAgendada,
} from "./easyLocalImportacaoService";
import {
  preverEasyLocalAgendamento,
  retomarEasyLocalAgendamento,
  executarEasyLocalAgendamentoPorTaskUid,
} from "./easyLocalAgendamentoService";

const names = [
  "stagion_atendimentos_parados_urologico",
  "stagion_faturado_recebido_urologico",
  "stagion_atendimentos_parados_iad",
  "stagion_faturado_recebido_iad",
];
const marker = JSON.stringify({
  marker: "easylocal-staging-v1",
  execucaoLiberada: true,
});

function fakeDestination(name: string, state = "ativo") {
  const execute = vi.fn(async (statement: string | { sql: string }) => {
    const sql = typeof statement === "string" ? statement : statement.sql;
    if (sql === "SELECT VERSION() AS versao")
      return [[{ versao: "8.0.36" }], []];
    if (sql === "START TRANSACTION" || sql === "COMMIT" || sql === "ROLLBACK")
      return [{ affectedRows: 0 }, []];
    if (sql.includes("FROM integracao_easylocal_agendamentos"))
      return [
        [
          {
            id: 10,
            leituraId: 4,
            estabelecimentoId: 1260036,
            criadoPor: 9,
            scheduleCronTaskUid: "task-staging",
            estado: state,
            frequencia: "15min",
            operacaoToken: "operation",
            execucaoToken: null,
            horarioBrasilia: null,
            cronUtc: "0 */15 * * * *",
            revisaoAprovada: "a".repeat(64),
            ultimoSlot: null,
            leaseAtiva: 0,
            leaseExpirada: 0,
          },
        ],
        [],
      ];
    if (sql.includes("FROM users")) return [[{ id: 9, role: "admin" }], []];
    if (sql.includes("FROM estabelecimentos")) return [[{ id: 1260036 }], []];
    if (sql.includes("FROM integracao_mapeamentos"))
      return [
        [
          {
            id: 4,
            tabelaDestinoId: 77,
            conexaoOrigemId: 3,
            descricao: marker,
            tabelaNome: name,
            tabelaDescricao: marker,
            leituraDescricao: marker,
            queryOrigem: "{}",
            ativo: "nao",
            frequencia: "manual",
            modoImportacao: "incremental",
          },
        ],
        [],
      ];
    if (sql.includes("FROM integracao_tabelas"))
      return [
        [{ id: 77, nome: name, descricao: marker, criadaNoBanco: "sim" }],
        [],
      ];
    if (sql.startsWith("UPDATE integracao_easylocal_agendamentos"))
      return [{ affectedRows: 1 }, []];
    throw new Error("Consulta inesperada no simulador isolado.");
  });
  const connection = {
    execute,
    query: vi.fn(async () => [[{ versao: "8.0.36" }], []]),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
  };
  fns.getRawPool.mockResolvedValue({ getConnection: async () => connection });
  return connection;
}

function noBusinessEffect(connection: ReturnType<typeof fakeDestination>) {
  const sql = connection.execute.mock.calls
    .map(([statement]) =>
      typeof statement === "string" ? statement : statement.sql
    )
    .join("\n");
  expect(sql).not.toMatch(
    /(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP).*`stagion_/i
  );
  expect(sql).not.toMatch(
    /FROM `stagion_|FROM integracao_conexoes|information_schema/i
  );
  expect(fns.config).not.toHaveBeenCalled();
  expect(fns.create).not.toHaveBeenCalled();
  expect(fns.update).not.toHaveBeenCalled();
  expect(fns.remove).not.toHaveBeenCalled();
}

describe("stagings existentes: vínculo não libera execução", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(names)("bloqueia nome aprovado mesmo sem marcador: %s", name => {
    expect(() => exigirDestinoEasyLocalExecutavel(name, "{}")).toThrow(
      /sem carga ou horário liberado/
    );
  });
  it("bloqueia marcador mesmo se alguém adulterar o nome e o bit de execução", () => {
    expect(() =>
      exigirDestinoEasyLocalExecutavel("el_1260036_falsa", marker)
    ).toThrow(/sem carga/);
  });
  it("mantém o destino novo e deixa as validações originais rejeitarem descritores malformados", () => {
    expect(() =>
      exigirDestinoEasyLocalExecutavel(
        "el_12_teste",
        '{"marker":"easylocal-direto-v1"}'
      )
    ).not.toThrow();
    expect(() =>
      exigirDestinoEasyLocalExecutavel("el_12_teste", "JSON inválido")
    ).not.toThrow();
  });
  it.each(names)("prévia manual rejeita %s antes da origem", async name => {
    const connection = fakeDestination(name);
    await expect(
      preverEasyLocalImportacao({ estabelecimentoId: 1260036, leituraId: 4 }, 9)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(connection.rollback).toHaveBeenCalledOnce();
    noBusinessEffect(connection);
  });
  it("prévia paginada rejeita destino existente sem consultar linhas", async () => {
    const connection = fakeDestination(names[0]!);
    await expect(
      preverEasyLocalImportacaoAgendada(
        { estabelecimentoId: 1260036, leituraId: 4 },
        9
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    noBusinessEffect(connection);
  });
  it("prévia de horário não cria job nem token de execução para uma staging", async () => {
    const connection = fakeDestination(names[0]!);
    await expect(
      preverEasyLocalAgendamento(
        { estabelecimentoId: 1260036, leituraId: 4, frequencia: "15min" },
        9
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    noBusinessEffect(connection);
  });
  it("confirmação manual assinada não contorna o bloqueio do destino existente", async () => {
    vi.stubEnv("JWT_SECRET", "segredo-exclusivamente-sintetico-staging");
    const tokenPrevia = await new SignJWT({
      leituraId: 4,
      estabelecimentoId: 1260036,
      fingerprint: "a".repeat(64),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("safatle-easylocal-importacao")
      .setAudience("safatle-easylocal-importacao")
      .setSubject("9")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const connection = fakeDestination(names[0]!);
    await expect(
      executarEasyLocalImportacao(
        {
          estabelecimentoId: 1260036,
          leituraId: 4,
          confirmarImportacao: true,
          tokenPrevia,
        },
        9
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    noBusinessEffect(connection);
  });
  it("execução paginada também bloqueia antes da origem e do INSERT", async () => {
    const connection = fakeDestination(names[0]!);
    await expect(
      executarEasyLocalImportacaoAgendada(
        { estabelecimentoId: 1260036, leituraId: 4 },
        9,
        "a".repeat(64)
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    noBusinessEffect(connection);
  });
  it("retomada bloqueia antes de habilitar a plataforma", async () => {
    const connection = fakeDestination(names[0]!, "pausado");
    await expect(
      retomarEasyLocalAgendamento(
        { estabelecimentoId: 1260036, agendamentoId: 10 },
        9,
        "session-test"
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    noBusinessEffect(connection);
  });
  it("callback já existente é bloqueado, sem lease ou importação", async () => {
    const connection = fakeDestination(names[0]!);
    await expect(
      executarEasyLocalAgendamentoPorTaskUid(
        "task-staging",
        new Date("2026-10-15T15:15:00Z")
      )
    ).resolves.toEqual({ status: "bloqueado" });
    const sql = connection.execute.mock.calls
      .map(([statement]) =>
        typeof statement === "string" ? statement : statement.sql
      )
      .join("\n");
    expect(sql).toContain("estado = 'erro'");
    expect(sql).not.toContain("execucao_token = ?, lease_ate");
    noBusinessEffect(connection);
  });
});
