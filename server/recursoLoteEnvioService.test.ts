import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import {
  confirmarEnvioLote,
  confirmarEnvioLoteSchema,
  dataEnvioValida,
} from "./recursoLoteEnvioService";

const escopo = { estabelecimentoId: 9, convenioId: 7 };
const input = {
  loteId: 12,
  protocoloEnvio: "PROTOCOLO-QA",
  dataEnvio: "2026-10-20",
  confirmar: true as const,
};
const dialect = new MySqlDialect();
function bancoFake(
  options: {
    status?: string;
    protocolo?: string;
    data?: Date | string | null;
    unidade?: number;
    recursos?: any[];
    modernos?: any[];
    conciliados?: any[];
    falharAuditoria?: boolean;
    semLote?: boolean;
  } = {}
) {
  const lote = {
    id: 12,
    estabelecimentoId: options.unidade ?? 9,
    convenioId: 7,
    status: options.status ?? "pendente_envio",
    protocoloEnvio: options.protocolo ?? null,
    dataEnvio: options.data ?? null,
  };
  const recursos = options.recursos ?? [
    { id: 15, estabelecimentoId: 9, convenioId: 7, status: "pendente_envio" },
  ];
  const calls: Array<{ text: string; params: unknown[] }> = [];
  let rollback = false;
  const db = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      try {
        return await fn({
          execute: vi.fn(async (query: ReturnType<typeof sql>) => {
            const q = dialect.sqlToQuery(query);
            calls.push({ text: q.sql, params: q.params });
            if (
              q.sql.includes(
                "SELECT id, estabelecimentoId, convenioId, status, protocoloEnvio"
              )
            )
              return [options.semLote ? [] : [lote]];
            if (
              q.sql.includes(
                "SELECT id, estabelecimentoId, convenioId, status FROM recursosGlosa"
              )
            )
              return [recursos];
            if (
              q.sql.includes(
                "SELECT id, estabelecimentoId, convenio_id AS convenioId FROM demonstrativo"
              )
            )
              return [options.modernos ?? []];
            if (
              q.sql.includes(
                "SELECT id, estabelecimentoId, convenioId FROM conciliados_automatico"
              )
            ) {
              const consultaEstaNoEscopo =
                q.sql.includes("AND estabelecimentoId = ?") &&
                q.sql.includes("AND convenioId = ?");
              const conciliados = options.conciliados ?? [];
              return [
                consultaEstaNoEscopo
                  ? conciliados.filter(
                      item =>
                        item.estabelecimentoId === lote.estabelecimentoId &&
                        item.convenioId === lote.convenioId
                    )
                  : conciliados,
              ];
            }
            if (
              q.sql.includes("INSERT INTO historicoRecursos") &&
              options.falharAuditoria
            )
              throw new Error("Falha sintética");
            return [{ affectedRows: 1 }];
          }),
        });
      } catch (error) {
        rollback = true;
        throw error;
      }
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  return {
    db,
    calls,
    get rollback() {
      return rollback;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("confirmação explícita de envio externo", () => {
  it("exige protocolo, data válida, IDs positivos e confirmação", () => {
    expect(
      confirmarEnvioLoteSchema.safeParse({ ...input, protocoloEnvio: "  " })
        .success
    ).toBe(false);
    expect(
      confirmarEnvioLoteSchema.safeParse({ ...input, confirmar: false }).success
    ).toBe(false);
    expect(
      confirmarEnvioLoteSchema.safeParse({ ...input, loteId: -1 }).success
    ).toBe(false);
    expect(
      confirmarEnvioLoteSchema.safeParse({ ...input, dataEnvio: "2026-02-30" })
        .success
    ).toBe(false);
    expect(
      confirmarEnvioLoteSchema.safeParse({ ...input, exportado: true }).success
    ).toBe(false);
    expect(dataEnvioValida("2024-02-29")).toBe(true);
    expect(dataEnvioValida("2026-02-29")).toBe(false);
  });
  it("registra envio e histórico na mesma transação com dia brasileiro preservado", async () => {
    const fake = bancoFake();
    await expect(confirmarEnvioLote(input, 5, escopo)).resolves.toEqual({
      success: true,
      jaConfirmado: false,
      status: "enviado",
    });
    expect(fake.calls[0].text).toContain("FOR UPDATE");
    const updates = fake.calls.filter(c => c.text.includes("UPDATE"));
    expect(updates.some(c => c.text.includes("UPDATE lotesRecurso"))).toBe(
      true
    );
    expect(
      fake.calls.some(
        c =>
          c.text.includes("INSERT INTO historicoRecursos") &&
          c.params.includes(5)
      )
    ).toBe(true);
    expect(
      fake.calls
        .flatMap(c => c.params)
        .filter(x => x instanceof Date)
        .every(x => (x as Date).toISOString() === "2026-10-20T15:00:00.000Z")
    ).toBe(true);
  });
  it.each(["enviado", "em_analise", "respondido", "finalizado"])(
    "repetição idêntica preserva %s sem nova escrita",
    async status => {
      const fake = bancoFake({
        status,
        protocolo: input.protocoloEnvio,
        data: new Date("2026-10-20T15:00:00Z"),
      });
      await expect(confirmarEnvioLote(input, 5, escopo)).resolves.toMatchObject(
        { jaConfirmado: true, status }
      );
      expect(
        fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))
      ).toHaveLength(0);
    }
  );
  it("mantém idempotência com data civil textual retornada pelo driver", async () => {
    const fake = bancoFake({
      status: "enviado",
      protocolo: input.protocoloEnvio,
      data: "2026-10-20",
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).resolves.toMatchObject({
      jaConfirmado: true,
      status: "enviado",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("não troca protocolo de lote já enviado", async () => {
    const fake = bancoFake({
      status: "respondido",
      protocolo: "OUTRO",
      data: new Date("2026-10-20T15:00:00Z"),
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("rejeita mudança da unidade entre autorização e lock", async () => {
    const fake = bancoFake({ unidade: 8 });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("rejeita recurso filho de outro convênio antes de escrever", async () => {
    const fake = bancoFake({
      recursos: [
        {
          id: 15,
          estabelecimentoId: 9,
          convenioId: 8,
          status: "pendente_envio",
        },
      ],
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("rejeita demonstrativo de outra unidade antes de escrever", async () => {
    const fake = bancoFake({
      modernos: [{ id: 20, estabelecimentoId: 8, convenioId: 7 }],
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("rejeita demonstrativo de outro convênio antes de escrever", async () => {
    const fake = bancoFake({
      modernos: [{ id: 20, estabelecimentoId: 9, convenioId: 8 }],
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(fake.calls.filter(c => /UPDATE |INSERT /.test(c.text))).toHaveLength(
      0
    );
  });
  it("ignora colisão legada de conciliação fora do escopo composto do lote", async () => {
    const fake = bancoFake({
      conciliados: [
        { id: 30, estabelecimentoId: 8, convenioId: 6 },
        { id: 31, estabelecimentoId: 9, convenioId: 7 },
      ],
    });
    await expect(confirmarEnvioLote(input, 5, escopo)).resolves.toMatchObject({
      success: true,
      jaConfirmado: false,
    });
    const leitura = fake.calls.find(call =>
      call.text.includes("SELECT id, estabelecimentoId, convenioId FROM conciliados_automatico")
    );
    expect(leitura?.text).toContain("AND estabelecimentoId = ?");
    expect(leitura?.text).toContain("AND convenioId = ?");
    expect(leitura?.params).toEqual(expect.arrayContaining([12, 9, 7]));
  });
  it("preserva resposta e acatamento já registrados nos itens", async () => {
    const fake = bancoFake({
      recursos: [
        { id: 15, estabelecimentoId: 9, convenioId: 7, status: "deferido" },
      ],
    });
    await confirmarEnvioLote(input, 5, escopo);
    expect(
      fake.calls.find(c => c.text.includes("UPDATE recursosGlosa"))?.text
    ).toContain("status IN ('rascunho', 'pendente_envio')");
    expect(
      fake.calls.find(c => c.text.includes("UPDATE demonstrativo"))?.text
    ).toContain("recurso_status = 'recurso_criado'");
    expect(
      fake.calls.find(c => c.text.includes("UPDATE conciliados_automatico"))
        ?.text
    ).toContain("statusRecursoItem = 'iniciado'");
  });
  it("reverte a transação se o histórico falhar", async () => {
    const fake = bancoFake({ falharAuditoria: true });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toThrow(
      "Falha sintética"
    );
    expect(fake.rollback).toBe(true);
  });
  it("não permite enviar com data futura", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T17:00:00Z"));
    await expect(
      confirmarEnvioLote({ ...input, dataEnvio: "2026-10-27" }, 5, escopo)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("falha sem banco ou lote, sem declarar sucesso", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    bancoFake({ semLote: true });
    await expect(confirmarEnvioLote(input, 5, escopo)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
