import { describe, expect, it, vi } from "vitest";
import { getTableColumns, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import {
  documento,
  fresh,
  glosa,
  loadSource,
  makeDb,
  preco,
  price,
  schema,
  service,
} from "./contratosDossieIssue182Mock";
const input = (id = 77, extra = {}) => ({
  id,
  origem: "conciliacao",
  justificativa: "Fundamento contratual sintético",
  valorRecurso: 10,
  ...extra,
});
const xml = (extra = {}) => ({
  id: 1,
  numeroGuia: "GUIA-SYN",
  codigoItem: "10101012",
  descricaoItem: "Consulta sintética",
  dataExecucao: "2026-02-10",
  competencia: "2026-02",
  quantidade: 1,
  valorUnitario: 100,
  valorTotal: 100,
  senha: "SYN",
  ...extra,
});
const iaJson = {
  pontos_atencao: [
    {
      titulo: "Prazo",
      explicacao: "Validar prazo contratual",
      semaforo: "YEL",
      categoria: "glosa_recurso",
    },
  ],
  clausulas: [],
  remuneracao: [],
  tabela_valores: [],
  pendencias: [],
};
const mockIA = () =>
  vi
    .fn()
    .mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(iaJson) } }],
    });

describe("Issue182 — provas positivas de fonte real/Drizzle real", () => {
  it("P01 assinatura real de buscarPrecosPorItens retorna preços alinhados por execução e convênio", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [
          preco(1, 10, "100.00", "2026-01-01"),
          preco(2, 10, "200.00", "2026-10-01"),
        ],
      })
    );
    const rows = await price.buscarPrecosPorItens(db, 10, [
      { convenioId: 20, dataExecucao: "2026-02-10", codigoItem: "10101012" },
      { convenioId: 20, dataExecucao: "2026-11-10", codigoItem: "10101012" },
      { convenioId: 21, dataExecucao: "2026-02-10", codigoItem: "10101012" },
    ]);
    expect(rows.map((p: any) => p?.valor)).toEqual([
      "100.00",
      "200.00",
      undefined,
    ]);
    expect(db.writes).toBe(0);
  });
  it("P01 handler real itensPorGuia enriquece sem alterar valorFaturado, data ou quantidade", async () => {
    const item = {
      id: 99,
      convenioId: 20,
      codigoItem: "10101012",
      dataExecucao: "2026-02-10",
      quantidade: 2,
      valorFaturado: "200.00",
    };
    const db = makeDb(
      fresh({ tabelasPreco: [preco(1, 10, "100.00", "2026-01-01")] }),
      { raw: q => (/SELECT fu\.\*/.test(q.sql) ? [[item], []] : undefined) }
    );
    const helper = loadSource("server/faturamentoDossieIssue182.ts", {
      "decimal.js": Decimal,
      "./contratosPrecoAplicavel": price,
    });
    const handler = loadSource(
      "server/faturamentoUnificadoService.ts",
      {},
      "itensPorGuia",
      { getDb: async () => db, sql, ...helper }
    );
    const r = await handler.itensPorGuia({
      estabelecimentoId: 10,
      numeroGuia: "GUIA-SYN",
    });
    expect(r[0]).toMatchObject({
      ...item,
      valorContratadoTabela: 100,
      valorContratadoTotal: 200,
      statusCobrancaContrato: "conforme_contrato",
    });
    expect(db.writes).toBe(0);
  });
  it("P02 SQL demonstrativo usa convenio_id e deriva competência de data_referencia real", async () => {
    const columns = Object.values(getTableColumns(schema.demonstrativo)).map(
      (c: any) => c.name
    );
    expect(columns).toContain("convenio_id");
    expect(columns).not.toContain("convenioId");
    expect(columns).not.toContain("competencia");
    const db = makeDb(fresh({ demonstrativo: [glosa(1)] }), {
      raw(q) {
        if (
          /\bd\.convenioId\b|\bd\.competencia\b|AND convenioId/.test(q.sql) &&
          /demonstrativo/.test(q.sql)
        )
          throw new Error("BAD_PHYSICAL_COLUMN");
      },
    });
    await service(db).auditarGlosasPorContrato({
      contratoId: 1,
      competencia: "2026-02",
    });
    expect(
      await service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input(1, { origem: "demonstrativo" })],
      })
    ).toEqual({ atualizados: 1 });
    expect(
      db.trace
        .filter((q: any) =>
          /FROM demonstrativo|UPDATE demonstrativo/.test(q.sql || "")
        )
        .every((q: any) => q.sql.includes("convenio_id"))
    ).toBe(true);
  });
  it("P03 sincronização sem extrações novas não altera preços históricos ou reporta atualização", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [
          preco(100, 10, "100.00", "2026-01-01"),
          preco(101, 10, "200.00", "2026-10-01"),
        ],
      })
    );
    const before = structuredClone(db.data.tabelasPreco);
    expect(
      await service(db).sincronizarTabelaValoresDossie({ contratoId: 1 })
    ).toEqual({ inseridos: 0, atualizados: 0, totalSincronizado: 0 });
    expect(db.data.tabelasPreco).toEqual(before);
    expect(db.writes).toBe(0);
    expect(
      price.selecionarPrecosAplicaveis(db.data.tabelasPreco, {
        estabelecimentoId: 10,
        convenioId: 20,
        codigos: ["10101012"],
        dataReferencia: "2026-02-10",
      })[0].valor
    ).toBe("100.00");
  });
  it("P04 auditoria XML histórica usa hospital vigente, nunca global/futuro e preserva cobrança", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [
          preco(100, 10, "100.00", "2026-01-01"),
          preco(102, null, "300.00", "2027-01-01"),
          preco(103, null, "250.00", "2026-02-01"),
        ],
      }),
      {
        raw: q =>
          /FROM faturamento_tiss ft/.test(q.sql) ? [[xml()], []] : undefined,
      }
    );
    const r = await service(db).auditarCobrancaXmlPorContrato({
      contratoId: 1,
    });
    expect(r.itens[0]).toMatchObject({
      valorUnitarioContrato: 100,
      valorTotalXml: 100,
      statusCobranca: "conforme",
    });
    expect(r.resumo.valorPerdaSubfaturamento).toBe(0);
    expect(db.writes).toBe(0);
    expect(
      db.trace.find(
        (q: any) => q.table === "tabelasPreco" && q.where.sql.includes("EXISTS")
      ).where.sql
    ).toContain("`contratos_convenios`.`dataFim`");
  });
  it("P05 fundamentação persiste texto sem tirar conciliação da fila iniciado; repetição conta zero", async () => {
    const db = makeDb(fresh({ conciliados_automatico: [glosa()] }));
    const s = service(db);
    expect(
      await s.aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input()],
      })
    ).toEqual({ atualizados: 1 });
    expect(db.data.conciliados_automatico[0]).toMatchObject({
      valorRecurso: "10.00",
      statusRecurso: "iniciado",
      glosaAceita: 0,
    });
    expect(db.data.recursos_glosa_justificativas).toEqual([
      { conciliadoId: 77, justificativa: input().justificativa },
    ]);
    const writes = db.writes;
    expect(
      await s.aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input()],
      })
    ).toEqual({ atualizados: 0 });
    expect(db.writes).toBe(writes);
    expect(
      db.trace.some((q: any) => /em_recurso|CREATE|ALTER/.test(q.sql || ""))
    ).toBe(false);
  });
  it("P06 sincronizações concorrentes inserem uma versão com lock de linha estável, inclusive contratos distintos", async () => {
    const data = fresh({
      contratos_convenios_documentos: [
        documento(),
        documento({ id: 2, contratoId: 2 }),
      ],
    });
    data.contratos_convenios.push({ ...data.contratos_convenios[0], id: 2 });
    const db = makeDb(data);
    const s = service(db);
    const results = await Promise.all([
      s.sincronizarTabelaValoresDossie({ contratoId: 1 }),
      s.sincronizarTabelaValoresDossie({ contratoId: 2 }),
    ]);
    expect(results.map((r: any) => r.inseridos).sort()).toEqual([0, 1]);
    expect(db.data.tabelasPreco).toHaveLength(1);
    expect(db.data.tabelasPreco[0].vigenciaInicio.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    );
    expect(db.transactions).toBe(2);
    expect(
      db.trace.filter((q: any) => q.table === "convenios" && q.lock)
    ).toHaveLength(2);
  });
  it("P07 primeira divergência no segundo UPDATE desfaz todas as gravações", async () => {
    const db = makeDb(fresh({ demonstrativo: [glosa(1), glosa(2)] }), {
      fail: q => /UPDATE demonstrativo/.test(q.sql || "") && q.params[2] === 2,
    });
    const before = structuredClone(db.data);
    await expect(
      service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [
          input(1, { origem: "demonstrativo" }),
          input(2, { origem: "demonstrativo" }),
        ],
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.data).toEqual(before);
    expect(db.rollbacks).toBe(1);
    expect(db.transactions).toBe(1);
  });
  it("P09 obter dossiê/auditorias permanecem leitura sem escrita ou DDL", async () => {
    const db = makeDb();
    const s = service(db);
    const d = await s.obterDossieContratual(1);
    await s.auditarCobrancaXmlPorContrato({ contratoId: 1 });
    await s.auditarGlosasPorContrato({ contratoId: 1 });
    expect(d).toHaveProperty("documentos");
    expect(
      d.pontos_atencao.every((p: any) => ["RED", "YEL", "GRN"].includes(p[2]))
    ).toBe(true);
    expect(db.writes).toBe(0);
    expect(db.transactions).toBe(0);
  });
});

describe("Issue182 — gates adicionais", () => {
  it.each([null, "2026-02-30", "10/02/2026"])(
    "execução ausente/inválida %s não usa preço corrente nem extraído de PDF",
    async dataExecucao => {
      const db = makeDb(
        fresh({
          tabelasPreco: [preco(1, 10, "999.00", "2026-01-01")],
          contratos_convenios_documentos: [documento()],
        }),
        {
          raw: q =>
            /FROM faturamento_tiss ft/.test(q.sql)
              ? [[xml({ dataExecucao })], []]
              : undefined,
        }
      );
      const r = await service(db).auditarCobrancaXmlPorContrato({
        contratoId: 1,
      });
      expect(r.itens[0].valorUnitarioContrato).toBeNull();
      expect(r.itens[0].statusCobranca).toBe("sem_tabela");
      expect(r.resumo.valorPerdaSubfaturamento).toBe(0);
    }
  );
  it("auditoria glosa e XML mudam preço só pela data real de cada item", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [
          preco(1, 10, "100.00", "2026-01-01"),
          preco(2, 10, "200.00", "2026-10-01"),
          preco(3, 99, "900.00", "2026-01-01"),
          preco(4, 10, "800.00", "2026-01-01", { convenioId: 99 }),
        ],
      }),
      {
        raw: q =>
          /FROM demonstrativo d/.test(q.sql)
            ? [
                [
                  {
                    ...xml(),
                    valorFaturado: 100,
                    valorPago: 90,
                    valorGlosa: 10,
                    origem: "demonstrativo",
                  },
                  {
                    ...xml({ id: 2, dataExecucao: "2026-11-01" }),
                    valorFaturado: 200,
                    valorPago: 190,
                    valorGlosa: 10,
                    origem: "demonstrativo",
                  },
                ],
                [],
              ]
            : undefined,
      }
    );
    const r = await service(db).auditarGlosasPorContrato({ contratoId: 1 });
    expect(r.itens.map((i: any) => i.valorContratadoTabela)).toEqual([
      100, 200,
    ]);
    expect(db.writes).toBe(0);
  });
  it("convênio não autorizado ou contrato fora de vigência não habilita preço", async () => {
    for (const mudar of [
      (d: any) => (d.convenios[0].estabelecimentoId = 99),
      (d: any) =>
        (d.contratos_convenios[0].dataInicio = new Date("2026-03-01")),
      (d: any) => (d.convenios[0].ativo = "nao"),
    ]) {
      const data = fresh({
        tabelasPreco: [preco(1, 10, "100.00", "2026-01-01")],
      });
      mudar(data);
      const db = makeDb(data, {
        raw: q =>
          /FROM faturamento_tiss ft/.test(q.sql) ? [[xml()], []] : undefined,
      });
      expect(
        (await service(db).auditarCobrancaXmlPorContrato({ contratoId: 1 }))
          .itens[0].valorUnitarioContrato
      ).toBeNull();
    }
  });
  it("sincronização insere nova versão sem tocar histórico e repetição faz zero escritas", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [preco(1, 10, "100.00", "2026-01-01")],
        contratos_convenios_documentos: [documento()],
      })
    );
    const s = service(db);
    expect(
      (await s.sincronizarTabelaValoresDossie({ contratoId: 1 })).inseridos
    ).toBe(1);
    const writes = db.writes;
    expect(
      (await s.sincronizarTabelaValoresDossie({ contratoId: 1 }))
        .totalSincronizado
    ).toBe(0);
    expect(db.writes).toBe(writes);
    expect(db.data.tabelasPreco[0].valor).toBe("100.00");
    expect(db.data.tabelasPreco[1].valor).toBe("150.00");
  });
  it("tabela/aditivo sem vigência comprovada não é retrodatado por upload ou ano arbitrário", async () => {
    const db = makeDb(
      fresh({
        contratos_convenios_documentos: [
          documento({ textoExtraido: "10101012 Consulta sintética R$ 150,00" }),
        ],
      })
    );
    await expect(
      service(db).sincronizarTabelaValoresDossie({ contratoId: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.data.tabelasPreco).toHaveLength(0);
    expect(db.writes).toBe(0);
  });
  it.each([
    {
      nomeArquivo: "anexo-generico.pdf",
      textoExtraido: "10101012 Consulta sintética R$ 150,00",
    },
    {
      nomeArquivo: "contrato.pdf",
      textoExtraido:
        "Vigência: 2026-02-30\n10101012 Consulta sintética R$ 150,00",
    },
  ])(
    "PDF ambíguo/uma vigência inválida %j não herda dataInicio",
    async extra => {
      const db = makeDb(
        fresh({ contratos_convenios_documentos: [documento(extra)] })
      );
      await expect(
        service(db).sincronizarTabelaValoresDossie({ contratoId: 1 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.writes).toBe(0);
    }
  );
  it("resumo XML não declara preço único para versões diferentes nem total contratual parcial como completo", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [
          preco(1, 10, "100.00", "2026-01-01"),
          preco(2, 10, "200.00", "2026-10-01"),
        ],
      }),
      {
        raw: q =>
          /FROM faturamento_tiss ft/.test(q.sql)
            ? [
                [
                  xml(),
                  xml({
                    id: 2,
                    dataExecucao: "2026-11-01",
                    valorUnitario: 200,
                    valorTotal: 200,
                  }),
                ],
                [],
              ]
            : undefined,
      }
    );
    const r = await service(db).auditarCobrancaXmlPorContrato({
      contratoId: 1,
    });
    expect(r.resumoPorProcedimento[0]).toMatchObject({
      valorUnitarioContrato: null,
      valorTotalContrato: 300,
      statusCobranca: "conforme",
    });
    const dbMissing = makeDb(
      fresh({ tabelasPreco: [preco(1, 10, "100.00", "2026-01-01")] }),
      {
        raw: q =>
          /FROM faturamento_tiss ft/.test(q.sql)
            ? [[xml(), xml({ id: 2, dataExecucao: null })], []]
            : undefined,
      }
    );
    const missing = await service(dbMissing).auditarCobrancaXmlPorContrato({
      contratoId: 1,
    });
    expect(missing.resumoPorProcedimento[0]).toMatchObject({
      valorUnitarioContrato: null,
      valorTotalContrato: null,
      statusCobranca: "sem_tabela",
    });
  });
  it("contrato original usa dataInicio cadastrada, nunca data de upload", async () => {
    const db = makeDb(
      fresh({
        contratos_convenios_documentos: [
          documento({
            nomeArquivo: "contrato.pdf",
            textoExtraido: "10101012 Consulta sintética R$ 150,00",
          }),
        ],
      })
    );
    await service(db).sincronizarTabelaValoresDossie({ contratoId: 1 });
    expect(db.data.tabelasPreco[0].vigenciaInicio.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });
  it("divergência na versão existente não sobrescreve história", async () => {
    const db = makeDb(
      fresh({
        tabelasPreco: [preco(1, 10, "100.00", "2026-10-01")],
        contratos_convenios_documentos: [documento()],
      })
    );
    await expect(
      service(db).sincronizarTabelaValoresDossie({ contratoId: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.data.tabelasPreco[0].valor).toBe("100.00");
  });
  it("sincronização falhando segundo insert faz rollback", async () => {
    const db = makeDb(fresh(), {
      fail: q => q.kind === "insert" && q.values.codigo === "20202024",
    });
    const itens = ["10101012", "20202024"].map(codigo => ({
      codigo,
      descricao: "Sintético",
      valor: 100,
      vigenciaInicio: "2026-10-01",
    }));
    await expect(
      service(db).sincronizarTabelaValoresDossie({ contratoId: 1, itens })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.data.tabelasPreco).toHaveLength(0);
    expect(db.rollbacks).toBe(1);
  });
  it.each([
    { glosaAceita: 1 },
    { statusConciliacao: "conciliado" },
    { statusRecurso: "aceita" },
    { statusRecurso: "recurso_enviado" },
    { recursoId: 9 },
    { vinculado: 1 },
    { valorGlosa: "9.99" },
    { estabelecimentoId: 99 },
    { convenioId: 99 },
  ])(
    "fundamentação conciliação recusa estado/valor/ownership %j e desfaz item anterior",
    async extra => {
      const db = makeDb(
        fresh({ conciliados_automatico: [glosa(1), glosa(2, extra)] })
      );
      const before = structuredClone(db.data);
      await expect(
        service(db).aplicarFundamentacaoContratualGlosas({
          contratoId: 1,
          itens: [input(1), input(2)],
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.data).toEqual(before);
    }
  );
  it.each([
    { glosaAceita: 1 },
    { classificacaoGlosa: "auto_aceitar" },
    { statusRecurso: "recurso_enviado" },
    { statusRecurso: "recurso_deferido" },
    { recursoId: 9 },
    { valorGlosa: "9.99" },
  ])(
    "fundamentação demonstrativo recusa aceito/final/vinculado/excesso %j",
    async extra => {
      const db = makeDb(fresh({ demonstrativo: [glosa(1, extra)] }));
      await expect(
        service(db).aplicarFundamentacaoContratualGlosas({
          contratoId: 1,
          itens: [input(1, { origem: "demonstrativo" })],
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.writes).toBe(0);
    }
  );
  it("ID ausente, duplicado e valor não finito não são contados nem parcialmente gravados", async () => {
    for (const itens of [
      [input(1), input(999)],
      [input(1), input(1)],
      [input(1, { valorRecurso: NaN })],
      [input(1, { valorRecurso: 10.001 })],
    ]) {
      const db = makeDb(fresh({ conciliados_automatico: [glosa(1)] }));
      const before = structuredClone(db.data);
      await expect(
        service(db).aplicarFundamentacaoContratualGlosas({
          contratoId: 1,
          itens,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.data).toEqual(before);
    }
  });
  it("não descarta silenciosamente lote maior que 200", async () => {
    const db = makeDb();
    await expect(
      service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: Array.from({ length: 201 }, (_, n) => input(n + 1)),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.writes).toBe(0);
  });
  it("ausência de estrutura persistente existente falha fechado e não usa DDL", async () => {
    const db = makeDb(fresh({ conciliados_automatico: [glosa()] }), {
      fail: q => /FROM recursos_glosa_justificativas/.test(q.sql || ""),
    });
    const before = structuredClone(db.data);
    await expect(
      service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input()],
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.data).toEqual(before);
    expect(db.trace.some((q: any) => /CREATE|ALTER/.test(q.sql || ""))).toBe(
      false
    );
  });
  it("affectedRows=0 não inventa atualização de demonstrativo", async () => {
    const db = makeDb(fresh({ demonstrativo: [glosa(1)] }), { affected: 0 });
    const before = structuredClone(db.data);
    await expect(
      service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input(1, { origem: "demonstrativo" })],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.data).toEqual(before);
  });
  it.each(["zero", "readback"])(
    "justificativa sem comprovação efetiva %s não conta item e desfaz lote",
    async tipo => {
      const db = makeDb(
        fresh({ conciliados_automatico: [glosa()] }),
        tipo === "zero"
          ? { affected: 0 }
          : {
              raw: q =>
                /SELECT justificativa FROM recursos_glosa_justificativas/.test(
                  q.sql.replace(/\s+/g, " ")
                )
                  ? [[{ justificativa: "Texto divergente" }], []]
                  : undefined,
            }
      );
      const before = structuredClone(db.data);
      await expect(
        service(db).aplicarFundamentacaoContratualGlosas({
          contratoId: 1,
          itens: [input()],
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db.data).toEqual(before);
    }
  );
  it("origem:id independentes permitem mesmo id nas duas fontes sem cruzar ownership", async () => {
    const db = makeDb(
      fresh({ demonstrativo: [glosa(1)], conciliados_automatico: [glosa(1)] })
    );
    expect(
      await service(db).aplicarFundamentacaoContratualGlosas({
        contratoId: 1,
        itens: [input(1), input(1, { origem: "demonstrativo" })],
      })
    ).toEqual({ atualizados: 2 });
  });
  it("IA sem texto retorna contrato explícito sem chamar mock LLM", async () => {
    const db = makeDb();
    const llm = mockIA();
    const r = await service(db, llm).gerarDossieContratualComIA(1);
    expect(r).toMatchObject({
      geradoComIA: false,
      salvo: false,
      motivo: "sem_texto",
      dossie: { contratoId: 1 },
    });
    expect(llm).not.toHaveBeenCalled();
    expect(db.writes).toBe(0);
  });
  it("documento com hospital divergente não aparece no dossiê nem é enviado ao mock IA", async () => {
    const db = makeDb(
      fresh({
        contratos_convenios_documentos: [documento({ estabelecimentoId: 99 })],
      })
    );
    const llm = mockIA();
    expect(
      (await service(db).obterDossieContratual(1)).documentos
    ).toHaveLength(0);
    expect(await service(db, llm).gerarDossieContratualComIA(1)).toMatchObject({
      motivo: "sem_texto",
      salvo: false,
    });
    expect(llm).not.toHaveBeenCalled();
  });
  it("resposta IA com ponto válido e cláusula malformada não é persistida", async () => {
    const db = makeDb(fresh({ contratos_convenios_documentos: [documento()] }));
    const llm = vi
      .fn()
      .mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ ...iaJson, clausulas: [null] }),
            },
          },
        ],
      });
    expect(await service(db, llm).gerarDossieContratualComIA(1)).toMatchObject({
      geradoComIA: false,
      salvo: false,
      motivo: "ia_indisponivel",
    });
    expect(db.writes).toBe(0);
  });
  it.each(["erro", "json", "vazio"])(
    "IA indisponível/inválida %s retorna fallback explícito sem sucesso",
    async tipo => {
      const db = makeDb(
        fresh({ contratos_convenios_documentos: [documento()] })
      );
      const llm =
        tipo === "erro"
          ? vi.fn().mockRejectedValue(new Error("RAW_DRIVER_PASSWORD"))
          : vi
              .fn()
              .mockResolvedValue({
                choices: [
                  { message: { content: tipo === "json" ? "not json" : "{}" } },
                ],
              });
      const r = await service(db, llm).gerarDossieContratualComIA(1);
      expect(r).toMatchObject({
        geradoComIA: false,
        salvo: false,
        motivo: "ia_indisponivel",
      });
      expect(db.writes).toBe(0);
    }
  );
  it("IA anuncia sucesso apenas após affectedRows=1 e readback persistido", async () => {
    const db = makeDb(fresh({ contratos_convenios_documentos: [documento()] }));
    const r = await service(db, mockIA()).gerarDossieContratualComIA(1);
    expect(r).toMatchObject({ geradoComIA: true, salvo: true, motivo: null });
    expect(db.data.contratos_convenios_documentos[0].pontosImportantes).toEqual(
      [
        {
          categoria: "glosa_recurso",
          titulo: "Prazo",
          resumo: "Validar prazo contratual",
          prioridade: "media",
        },
      ]
    );
    expect(db.transactions).toBe(1);
  });
  it.each([
    { affected: 0 },
    { skipPersist: true },
    { fail: (q: any) => q.kind === "update" },
  ])(
    "IA falha na persistência %j rejeita e não finge fallback/sucesso",
    async options => {
      const db = makeDb(
        fresh({ contratos_convenios_documentos: [documento()] }),
        options
      );
      const before = structuredClone(db.data);
      await expect(
        service(db, mockIA()).gerarDossieContratualComIA(1)
      ).rejects.toSatisfy(
        (e: any) =>
          ["CONFLICT", "INTERNAL_SERVER_ERROR"].includes(e.code) &&
          !/SQL|DRIVER|PASSWORD|SECRET/.test(e.message)
      );
      expect(db.data).toEqual(before);
    }
  );
  it("erros de leitura são sanitizados, sem SQL/cause/driver", async () => {
    const db = makeDb(fresh(), { failSelect: "contratos_convenios" });
    await expect(service(db).obterDossieContratual(1)).rejects.toSatisfy(
      (e: any) =>
        e.code === "INTERNAL_SERVER_ERROR" &&
        !/RAW|DRIVER|PASSWORD/.test(e.message) &&
        e.cause === undefined
    );
  });
});
