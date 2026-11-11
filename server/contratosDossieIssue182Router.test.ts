import { describe, expect, it, vi } from "vitest";
import {
  fresh,
  integrity,
  loadSource,
  makeDb,
  service,
} from "./contratosDossieIssue182Mock";
const names = [
  "obterDossie",
  "obterDossiePorConvenio",
  "gerarDossieIA",
  "sincronizarTabelaDossie",
  "auditarCobrancaXml",
  "auditarGlosasContrato",
  "aplicarFundamentacaoGlosas",
];
const input = (name: string, hospital = 10, contratoId = 1) =>
  name === "obterDossiePorConvenio"
    ? { estabelecimentoId: hospital, convenioId: 20 }
    : name === "aplicarFundamentacaoGlosas"
      ? { contratoId, itens: [] }
      : { contratoId };
function harness(realService = false) {
  const data = fresh();
  data.contratos_convenios.push({
    ...data.contratos_convenios[0],
    id: 2,
    estabelecimentoId: 11,
  });
  const db = makeDb(data);
  let mode = "none";
  let dbError = false;
  const calls: string[] = [];
  const stubs: any = {};
  for (const name of [
    "obterDossieContratual",
    "gerarDossieContratualComIA",
    "sincronizarTabelaValoresDossie",
    "auditarCobrancaXmlPorContrato",
    "auditarGlosasPorContrato",
    "aplicarFundamentacaoContratualGlosas",
  ])
    stubs[name] = vi.fn(async () => {
      calls.push(name);
      return { ok: true };
    });
  const builder = {
    input(schema: any) {
      return {
        query(handler: any) {
          return {
            kind: "query",
            invoke(args: any) {
              return handler({ ...args, input: schema.parse(args.input) });
            },
          };
        },
        mutation(handler: any) {
          return {
            kind: "mutation",
            invoke(args: any) {
              return handler({ ...args, input: schema.parse(args.input) });
            },
          };
        },
      };
    },
  };
  const r = loadSource("server/routers/contratosConveniosRouter.ts", {
    "../_core/trpc": { router: (x: any) => x, protectedProcedure: builder },
    "../db": {
      getDb: async () => {
        if (dbError) throw new Error("SQL_DRIVER_PASSWORD_UNSANITIZED");
        return db;
      },
      verificarPermissaoEstabelecimento: async (
        _user: number,
        unit: number,
        kind: string
      ) =>
        unit === 10 &&
        (mode === "all" || (mode === "read" && kind === "visualizar")),
    },
    "../../drizzle/schema": loadSource("drizzle/schema.ts"),
    "../contratosConveniosPdfService": {},
    "../contratosConveniosDossieService": realService ? service(db) : stubs,
    "../contratosDossieIssue182Integridade": integrity,
  }).contratosConveniosRouter;
  return {
    r,
    db,
    calls,
    setMode(value: string) {
      mode = value;
    },
    setDbError() {
      dbError = true;
    },
    ctx: { user: { id: 5, role: "user" } },
  };
}
describe("Issue182 rotas — guardas existentes e contrato público", () => {
  it("P08 7/7 negadas sem permissão; visualizar aceita 4 leituras/nega 3 mutações; gerenciar aceita 7", async () => {
    const h = harness();
    let denied = 0,
      deniedRead = 0,
      allowedRead = 0,
      allowedAll = 0;
    for (const mode of ["none", "read", "all"]) {
      h.setMode(mode);
      for (const name of names) {
        if (
          mode === "none" ||
          (mode === "read" && h.r[name].kind === "mutation")
        ) {
          await expect(
            h.r[name].invoke({ ctx: h.ctx, input: input(name) })
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          if (mode === "none") denied++;
          else deniedRead++;
        } else {
          await h.r[name].invoke({ ctx: h.ctx, input: input(name) });
          if (mode === "read") allowedRead++;
          else allowedAll++;
        }
      }
    }
    expect([denied, deniedRead, allowedRead, allowedAll]).toEqual([7, 3, 4, 7]);
  });
  it("7/7 chamadas a outra unidade negadas antes de invocar serviço", async () => {
    const h = harness();
    h.setMode("all");
    for (const name of names)
      await expect(
        h.r[name].invoke({ ctx: h.ctx, input: input(name, 11, 2) })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.calls).toHaveLength(0);
  });
  it("gerarDossieIA integra contrato real {dossie,geradoComIA,salvo,motivo} no fallback sem texto", async () => {
    const h = harness(true);
    h.setMode("all");
    const r = await h.r.gerarDossieIA.invoke({
      ctx: h.ctx,
      input: { contratoId: 1 },
    });
    expect(r).toMatchObject({
      geradoComIA: false,
      salvo: false,
      motivo: "sem_texto",
      dossie: { contratoId: 1 },
    });
  });
  it("falha de db anterior ao serviço é sanitizada em todas as 7 rotas", async () => {
    const h = harness();
    h.setMode("all");
    h.setDbError();
    for (const name of names)
      await expect(
        h.r[name].invoke({ ctx: h.ctx, input: input(name) })
      ).rejects.toSatisfy(
        (e: any) =>
          e.code === "INTERNAL_SERVER_ERROR" &&
          !/SQL|DRIVER|PASSWORD/.test(e.message) &&
          e.cause === undefined
      );
    expect(h.calls).toHaveLength(0);
  });
  it("input Zod rejeita origem, ID ou valor negativos antes do serviço", async () => {
    const h = harness();
    h.setMode("all");
    for (const extra of [{ origem: "outra" }, { id: -1 }, { valorRecurso: -1 }])
      expect(() =>
        h.r.aplicarFundamentacaoGlosas.invoke({
          ctx: h.ctx,
          input: {
            contratoId: 1,
            itens: [
              {
                id: 1,
                origem: "conciliacao",
                justificativa: "Sintética",
                valorRecurso: 10,
                ...extra,
              },
            ],
          },
        })
      ).toThrow();
    expect(h.calls).toHaveLength(0);
  });
});
