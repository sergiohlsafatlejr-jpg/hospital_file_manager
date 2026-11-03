import { afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const { storageGet, extrairChaveXmlDaUrl, extrairRecursosDoXml } = vi.hoisted(
  () => ({
    storageGet: vi.fn(),
    extrairChaveXmlDaUrl: vi.fn(),
    extrairRecursosDoXml: vi.fn(),
  })
);

vi.mock("./storage", () => ({ storageGet }));
vi.mock("./recursoExcelFallback", () => ({
  extrairChaveXmlDaUrl,
  extrairRecursosDoXml,
}));

import {
  criarLoteRecurso,
  getDetalhesLoteRecurso,
  getRecursosLoteParaExportacao,
  getResumoLotesRecurso,
  recalcularTotalLote,
} from "./db";

function queryChain<T>(result: T) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    offset: vi.fn(() => chain),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

function mockSelectDb(
  selectResults: unknown[],
  executeResults: unknown[] = []
) {
  const selects = [...selectResults];
  const executes = [...executeResults];
  return {
    select: vi.fn(() => queryChain(selects.shift() ?? [])),
    execute: vi.fn(async () => executes.shift() ?? [[]]),
  };
}

function mockTransactionalLoteDb(executeResults: unknown[], insertId = 901) {
  const executes = [...executeResults];
  const values = vi.fn(async () => [{ insertId }]);
  const tx = {
    execute: vi.fn(async () => executes.shift() ?? [[]]),
    insert: vi.fn(() => ({ values })),
  };
  let transactionStatus = "not_started";
  const db = {
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        transactionStatus = "running";
        try {
          const result = await callback(tx);
          transactionStatus = "committed";
          return result;
        } catch (error) {
          transactionStatus = "rolled_back";
          throw error;
        }
      }
    ),
  };
  return { db, tx, values, getTransactionStatus: () => transactionStatus };
}

function lote(overrides: Record<string, unknown> = {}) {
  return {
    id: 71,
    numeroLote: "L-71",
    estabelecimentoId: 10,
    convenioId: 20,
    status: "pendente_envio",
    quantidadeItens: 4,
    valorTotalGlosado: "150.00",
    valorTotalRecursado: "150.00",
    valorTotalRecuperado: "50.00",
    valorTotalRecebido: "99.99",
    dataEnvio: null,
    protocoloEnvio: null,
    xmlUrl: null,
    ...overrides,
  };
}

function sqlText(value: unknown) {
  return new MySqlDialect().sqlToQuery(value as any).sql;
}

function sqlQuery(value: unknown) {
  return new MySqlDialect().sqlToQuery(value as any);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Issue #106 — valores de lote de recurso", () => {
  it("separa pagamento original de recebimento manual e só acata recurso legado deferido", async () => {
    const loteAtual = lote();
    const db = mockSelectDb(
      [
        [loteAtual],
        [
          {
            id: 301,
            estabelecimentoId: 10,
            convenioId: 20,
            guiaNumero: "GUIA-LEGADA",
            pacienteCarteirinha: "C-1",
            codigoProcedimento: "PROC-1",
            descricaoProcedimento: "Procedimento legado",
            pacienteNome: "Paciente legado",
            valorGlosado: "20.00",
            valorCobrado: "20.00",
            valorRecebido: "12.34",
            dataPagamento: new Date("2026-10-01T12:00:00Z"),
            valorRecuperado: "7.25",
            status: "deferido_parcial",
            motivoGlosaConvenio: "1015",
            justificativaRecurso: "Recurso apresentado",
            createdAt: new Date(),
          },
          // Um vínculo inconsistente não pode cruzar unidade ou convênio.
          {
            id: 302,
            estabelecimentoId: 11,
            convenioId: 20,
            valorRecebido: "999.99",
            valorRecuperado: "999.99",
            status: "deferido",
          },
        ],
        [{ id: 20, nome: "Convênio teste" }],
        [{ id: 10, nome: "Unidade teste" }],
      ],
      [
        [
          [
            {
              id: 101,
              estabelecimentoId: 10,
              convenioId: 20,
              guiaNumero: "GUIA-ORIGINAL",
              pacienteCarteirinha: "C-ORIGINAL",
              codigoProcedimento: "PROC-ORIGINAL",
              descricaoProcedimento: "Pagamento original",
              pacienteNome: "Paciente original",
              valorGlosado: "80.00",
              valorRecursado: "80.00",
              valorPagoOriginal: "80.00",
              dataPagamentoOriginal: "2026-09-20",
              status: "recurso_criado",
              motivoGlosa: "1015",
              justificativa: "Contestação",
            },
            {
              id: 102,
              estabelecimentoId: 11,
              convenioId: 20,
              valorPagoOriginal: "777.77",
            },
          ],
        ],
        [
          [
            {
              id: 201,
              estabelecimentoId: 10,
              convenioId: 20,
              guiaNumero: "GUIA-CONC",
              pacienteCarteirinha: "",
              codigoProcedimento: "PROC-CONC",
              descricaoProcedimento: "Conciliação original",
              pacienteNome: "Paciente conciliação",
              valorGlosado: "30.00",
              valorRecursado: "30.00",
              valorPagoOriginal: "30.00",
              dataPagamentoOriginal: null,
              status: "iniciado",
              motivoGlosa: "2001",
              justificativa: "",
            },
          ],
        ],
      ]
    );

    const detalhes = await getDetalhesLoteRecurso(71, db);

    expect(detalhes).not.toBeNull();
    expect(detalhes!.itens).toHaveLength(3);
    const original = detalhes!.itens.find((item: any) => item.id === 101)!;
    const conciliacao = detalhes!.itens.find((item: any) => item.id === 201)!;
    const legado = detalhes!.itens.find((item: any) => item.id === 301)!;

    expect(original).toMatchObject({
      pacienteCarteirinha: "C-ORIGINAL",
      valorPagoOriginal: "80.00",
      dataPagamentoOriginal: "2026-09-20",
      valorRecebidoRecurso: "0.00",
      valorRecebido: "0.00",
      dataRecebimentoRecurso: null,
      dataPagamento: null,
      valorAcatado: "0.00",
      valorRecuperado: "0.00",
    });
    expect(conciliacao).toMatchObject({
      valorPagoOriginal: "30.00",
      valorRecebidoRecurso: "0.00",
      valorAcatado: "0.00",
    });
    expect(legado).toMatchObject({
      pacienteNome: "Paciente legado",
      guiaNumero: "GUIA-LEGADA",
      pacienteCarteirinha: "C-1",
      valorGlosado: "20.00",
      valorRecursado: "20.00",
      motivoGlosa: "1015",
      justificativa: "Recurso apresentado",
      valorPagoOriginal: null,
      dataPagamentoOriginal: null,
      valorRecebidoRecurso: "12.34",
      valorRecebido: "12.34",
      valorAcatado: "7.25",
      valorRecuperado: "7.25",
    });
    expect(legado.dataRecebimentoRecurso).toEqual(
      new Date("2026-10-01T12:00:00Z")
    );
    expect(legado.dataPagamento).toEqual(new Date("2026-10-01T12:00:00Z"));

    expect(detalhes).toMatchObject({
      valorTotalPagoOriginal: "110.00",
      valorTotalRecebido: "12.34",
      valorTotalRecebidoRecurso: "12.34",
      valorTotalRecuperado: "7.25",
      valorTotalAcatado: "7.25",
      totalHistoricoRecebido: "99.99",
      totalHistoricoAcatado: "50.00",
      divergenciaHistoricoRecebido: "87.65",
      divergenciaHistoricoAcatado: "42.75",
      inconsistenciaHistoricoRecebido: true,
      inconsistenciaHistoricoAcatado: true,
    });

    const consultas = db.execute.mock.calls
      .map(([query]: any[]) => sqlText(query))
      .join("\n");
    expect(consultas).toMatch(/d\.estabelecimentoId\s*=\s*\?/i);
    expect(consultas).toMatch(/d\.convenio_id\s*=\s*\?/i);
    expect(consultas).toMatch(/ca\.estabelecimentoId\s*=\s*\?/i);
    expect(consultas).toMatch(/ca\.convenioId\s*=\s*\?/i);
    for (const [query] of db.execute.mock.calls) {
      expect(sqlQuery(query).params).toEqual([71, 10, 20]);
    }
  });

  it("exporta campos obrigatórios e não usa solicitado como acatado", async () => {
    const loteAtual = lote({
      valorTotalRecebido: "8.88",
      valorTotalRecuperado: "66.66",
    });
    const db = mockSelectDb(
      [
        [loteAtual],
        [
          {
            id: 401,
            estabelecimentoId: 10,
            convenioId: 20,
            guiaNumero: "GUIA-LEGADA",
            pacienteCarteirinha: "C-1",
            codigoProcedimento: "PROC-1",
            descricaoProcedimento: "Legado",
            pacienteNome: "Paciente",
            dataGlosa: new Date("2026-09-01T12:00:00Z"),
            valorGlosado: "10.10",
            valorCobrado: "10.10",
            valorRecebido: "0.10",
            dataPagamento: new Date("2026-10-02T12:00:00Z"),
            // Solicitado/valor recuperado sem decisão final não é acatado.
            valorRecuperado: "10.10",
            status: "em_analise",
            motivoGlosaConvenio: "2001",
            justificativaRecurso: "Justificativa",
            quantidade: "1",
          },
          {
            id: 402,
            estabelecimentoId: 10,
            convenioId: 20,
            guiaNumero: "GUIA-DEFERIDA",
            pacienteCarteirinha: "C-2",
            codigoProcedimento: "PROC-2",
            descricaoProcedimento: "Deferido",
            pacienteNome: "Paciente 2",
            dataGlosa: new Date("2026-09-02T12:00:00Z"),
            valorGlosado: "0.20",
            valorCobrado: "0.20",
            valorRecebido: "0.20",
            dataPagamento: new Date("2026-10-03T12:00:00Z"),
            valorRecuperado: "0.20",
            status: "deferido",
            motivoGlosaConvenio: "2002",
            justificativaRecurso: "Justificativa 2",
            quantidade: "1",
          },
        ],
        [{ id: 20, nome: "Convênio teste" }],
      ],
      [[[]], [[]]]
    );

    const exportacao = await getRecursosLoteParaExportacao(71, db);

    expect(exportacao).not.toBeNull();
    expect(exportacao!.recursos).toHaveLength(2);
    const emAnalise = exportacao!.recursos.find(
      (item: any) => item.id === 401
    )!;
    const deferido = exportacao!.recursos.find((item: any) => item.id === 402)!;
    expect(emAnalise).toMatchObject({
      paciente: "Paciente",
      guia: "GUIA-LEGADA",
      carteirinha: "C-1",
      dataItem: expect.any(String),
      valorGlosado: 10.1,
      valorRecursado: 10.1,
      motivoGlosa: "2001",
      descricaoRecurso: "Justificativa",
      valorRecebidoRecurso: 0.1,
      valorRecebido: 0.1,
      valorAcatado: 0,
      valorRecuperado: 0,
      qtdeAcatado: 0,
    });
    expect(deferido).toMatchObject({
      valorRecebidoRecurso: 0.2,
      valorAcatado: 0.2,
      valorRecuperado: 0.2,
      qtdeAcatado: 1,
    });
    expect(exportacao!.totais).toMatchObject({
      totalValorRecebidoRecurso: 0.3,
      totalValorRecebido: 0.3,
      totalValorAcatado: 0.2,
      totalValorRecuperado: 0.2,
      totalHistoricoRecebido: 8.88,
      totalHistoricoAcatado: 66.66,
    });
  });

  it("mantém recebimento e acatamento zerados no fallback de XML sem evidência manual", async () => {
    const loteAtual = lote({
      xmlUrl: "https://files.example/recursos-glosa/lote.xml",
    });
    const db = mockSelectDb(
      [
        [loteAtual],
        [],
        [
          {
            pacienteNome: "Paciente XML",
            pacienteCarteirinha: "CX",
            quantidade: "1",
          },
        ],
        [{ id: 20, nome: "Convênio teste" }],
      ],
      [[[]], [[]]]
    );
    storageGet.mockResolvedValue({ url: "https://files.example/download" });
    extrairChaveXmlDaUrl.mockReturnValue("recursos-glosa/lote.xml");
    extrairRecursosDoXml.mockReturnValue([
      {
        protocoloDP: "PROTO",
        guiaNumero: "GUIA-XML",
        guiaOperadora: "OPER",
        dataAtendimento: "2026-09-01",
        codigoTabela: "22",
        codigoProcedimento: "PROC-XML",
        descricaoProcedimento: "Item XML",
        codigoGlosa: "1015",
        valorRecursado: 80,
        justificativa: "Pedido XML",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "<xml />" }))
    );

    const exportacao = await getRecursosLoteParaExportacao(71, db);

    expect(exportacao!.recursos).toHaveLength(1);
    expect(exportacao!.recursos[0]).toMatchObject({
      fonte: "xml_lote",
      status: "pendente_envio",
      valorPagoOriginal: null,
      valorRecebidoRecurso: 0,
      valorRecebido: 0,
      dataRecebimentoRecurso: null,
      valorAcatado: 0,
      valorRecuperado: 0,
      qtdeAcatado: 0,
    });
    expect(exportacao!.totais).toMatchObject({
      totalValorRecebido: 0,
      totalValorAcatado: 0,
    });
  });

  it("resume apenas registros manuais da unidade e separa histórico divergente", async () => {
    const db = mockSelectDb([
      [
        lote({
          id: 71,
          valorTotalRecebido: "9.99",
          valorTotalRecuperado: "8.88",
        }),
        lote({
          id: 72,
          valorTotalRecebido: "1.11",
          valorTotalRecuperado: "2.22",
          status: "enviado",
        }),
      ],
      [
        {
          id: 1,
          loteId: 71,
          estabelecimentoId: 10,
          convenioId: 20,
          valorRecebido: "0.10",
          valorRecuperado: "0.10",
          status: "deferido",
        },
        {
          id: 2,
          loteId: 72,
          estabelecimentoId: 10,
          convenioId: 20,
          valorRecebido: "0.20",
          valorRecuperado: "0.20",
          status: "deferido_parcial",
        },
        {
          id: 3,
          loteId: 71,
          estabelecimentoId: 99,
          convenioId: 20,
          valorRecebido: "100.00",
          valorRecuperado: "100.00",
          status: "deferido",
        },
        {
          id: 4,
          loteId: 72,
          estabelecimentoId: 10,
          convenioId: 21,
          valorRecebido: "200.00",
          valorRecuperado: "200.00",
          status: "deferido",
        },
        {
          id: 5,
          loteId: 71,
          estabelecimentoId: 10,
          convenioId: 20,
          valorRecebido: "3.00",
          valorRecuperado: "6.00",
          status: "em_analise",
        },
      ],
    ]);

    const resumo = await getResumoLotesRecurso(10, db);

    expect(resumo).toMatchObject({
      totalLotes: 2,
      lotesEnviados: 1,
      valorTotalRecebido: 3.3,
      valorTotalAcatado: 0.3,
      valorTotalRecuperado: 0.3,
      valorTotalHistoricoRecebido: 11.1,
      valorTotalHistoricoAcatado: 11.1,
      divergenciaHistoricoRecebido: 7.8,
      divergenciaHistoricoAcatado: 10.8,
      registrosRecebimentoManual: 3,
      registrosAcatados: 2,
    });
    expect(resumo.fontesValores).toMatchObject({
      recebimentoRecurso: "recursosGlosa.valorRecebido",
      acatamento: "recursosGlosa.valorRecuperado (deferido/deferido_parcial)",
    });
  });

  it("recalcula somente o recebimento manual do lote isolado, em centavos exatos", async () => {
    const loteChain = queryChain([lote()]);
    const recursosChain = queryChain([
      { valorRecebido: "0.10" },
      { valorRecebido: "0.20" },
    ]);
    const whereUpdate = vi.fn(async () => []);
    const set = vi.fn(() => ({ where: whereUpdate }));
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(loteChain)
        .mockReturnValueOnce(recursosChain),
      update: vi.fn(() => ({ set })),
    };

    const resultado = await recalcularTotalLote(71, db);

    expect(resultado).toEqual({ success: true, valorTotalRecebido: "0.30" });
    expect(set).toHaveBeenCalledWith({ valorTotalRecebido: "0.30" });
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ valorTotalRecuperado: expect.anything() })
    );

    const filtroRecursos = sqlQuery(recursosChain.where.mock.calls[0][0]);
    expect(filtroRecursos.sql).toMatch(/`recursosGlosa`\.`loteId`\s*=\s*\?/i);
    expect(filtroRecursos.sql).toMatch(
      /`recursosGlosa`\.`estabelecimentoId`\s*=\s*\?/i
    );
    expect(filtroRecursos.sql).toMatch(
      /`recursosGlosa`\.`convenioId`\s*=\s*\?/i
    );
    expect(filtroRecursos.params).toEqual([71, 10, 20]);
    const filtroAtualizacao = sqlQuery(whereUpdate.mock.calls[0][0]);
    expect(filtroAtualizacao.sql).toMatch(/`lotesRecurso`\.`id`\s*=\s*\?/i);
    expect(filtroAtualizacao.sql).toMatch(
      /`lotesRecurso`\.`estabelecimentoId`\s*=\s*\?/i
    );
    expect(filtroAtualizacao.sql).toMatch(
      /`lotesRecurso`\.`convenioId`\s*=\s*\?/i
    );
    expect(filtroAtualizacao.params).toEqual([71, 10, 20]);
  });

  it("cria lote preparado de forma atômica: bloqueia itens, deduplica IDs e mantém prazo nulo", async () => {
    const fake = mockTransactionalLoteDb([
      [[{ id: 11, valorGlosa: "0.10", valorRecurso: "0.10" }]],
      [[{ id: 12, valorGlosa: "0.20", valorRecurso: "0.20" }]],
      [{ affectedRows: 1 }],
      [{ affectedRows: 1 }],
    ]);

    const criado = await criarLoteRecurso(
      {
        convenioId: 20,
        estabelecimentoId: 10,
        userId: 1,
        recursosIds: [],
        demonstrativoIds: [11, 11],
        conciliacaoIds: [12, 12],
      },
      fake.db
    );

    expect(criado.loteId).toBe(901);
    expect(fake.getTransactionStatus()).toBe("committed");
    expect(fake.db.transaction).toHaveBeenCalledTimes(1);
    expect(fake.values).toHaveBeenCalledWith(
      expect.objectContaining({
        valorTotalGlosado: "0.30",
        valorTotalRecursado: "0.30",
        quantidadeItens: 2,
        status: "pendente_envio",
        dataPrazoResposta: null,
      })
    );
    const queries = fake.tx.execute.mock.calls.map(([query]: any[]) =>
      sqlText(query)
    );
    expect(queries[0]).toMatch(/FROM demonstrativo[\s\S]*FOR UPDATE/i);
    expect(queries[1]).toMatch(/FROM conciliados_automatico[\s\S]*FOR UPDATE/i);
    expect(sqlQuery(fake.tx.execute.mock.calls[0][0]).params).toEqual([
      11, 10, 20,
    ]);
    expect(sqlQuery(fake.tx.execute.mock.calls[1][0]).params).toEqual([
      12, 10, 20,
    ]);
    expect(queries[2]).toMatch(/SET recurso_id = \?/i);
    expect(sqlQuery(fake.tx.execute.mock.calls[2][0]).params).toEqual([
      901, 11, 10, 20,
    ]);
    expect(queries[2]).not.toMatch(/recurso_enviado/i);
    expect(queries[3]).toMatch(/SET xmlRecursoLoteId = \?/i);
    expect(sqlQuery(fake.tx.execute.mock.calls[3][0]).params).toEqual([
      901, 12, 10, 20,
    ]);
    expect(queries[3]).not.toMatch(/recurso_enviado/i);
  });

  it("faz rollback quando a reserva concorrente perde todos os itens no update condicional", async () => {
    const fake = mockTransactionalLoteDb([
      [[{ id: 11, valorGlosa: "1.00", valorRecurso: "1.00" }]],
      [{ affectedRows: 0 }],
    ]);

    await expect(
      criarLoteRecurso(
        {
          convenioId: 20,
          estabelecimentoId: 10,
          userId: 1,
          recursosIds: [11],
        },
        fake.db
      )
    ).rejects.toThrow(
      "Um ou mais itens do demonstrativo estão indisponíveis para o lote (escopo, status ou reserva)"
    );

    expect(fake.values).toHaveBeenCalledTimes(1);
    expect(fake.getTransactionStatus()).toBe("rolled_back");
    expect(sqlText(fake.tx.execute.mock.calls[1][0])).toMatch(
      /recurso_id IS NULL/i
    );
  });

  it("faz rollback se ocorrer erro depois da inserção do lote", async () => {
    const erroVinculo = new Error("falha ao vincular fonte");
    const fake = mockTransactionalLoteDb([
      [[{ id: 11, valorGlosa: "1.00", valorRecurso: "1.00" }]],
      erroVinculo,
    ]);
    const execute = fake.tx.execute;
    execute
      .mockReset()
      .mockResolvedValueOnce([
        [{ id: 11, valorGlosa: "1.00", valorRecurso: "1.00" }],
      ])
      .mockRejectedValueOnce(erroVinculo);

    await expect(
      criarLoteRecurso(
        {
          convenioId: 20,
          estabelecimentoId: 10,
          userId: 1,
          recursosIds: [11],
        },
        fake.db
      )
    ).rejects.toThrow("falha ao vincular fonte");

    expect(fake.values).toHaveBeenCalledTimes(1);
    expect(fake.getTransactionStatus()).toBe("rolled_back");
  });

  it("rejeita toda a seleção quando um item é de outra unidade antes de inserir o lote", async () => {
    const fake = mockTransactionalLoteDb([
      [[{ id: 11, valorGlosa: "1.00", valorRecurso: "1.00" }]],
    ]);

    await expect(
      criarLoteRecurso(
        {
          convenioId: 20,
          estabelecimentoId: 10,
          userId: 1,
          recursosIds: [],
          demonstrativoIds: [11, 12],
        },
        fake.db
      )
    ).rejects.toThrow(
      "Um ou mais itens do demonstrativo estão indisponíveis para o lote (escopo, status ou reserva)"
    );

    expect(fake.values).not.toHaveBeenCalled();
    expect(fake.getTransactionStatus()).toBe("rolled_back");
    expect(sqlText(fake.tx.execute.mock.calls[0][0])).toMatch(
      /estabelecimentoId = \?/i
    );
  });
});


describe("Exportação de Lote Unimed — Protocolo TISS e Erro TISS do Demonstrativo", () => {
  it("traz protocoloDP/protocoloTiss e erroTiss/motivoGlosa diretamente do demonstrativo", async () => {
    const loteUnimed = lote({
      id: 88,
      numeroLote: "L-UNIMED-88",
      estabelecimentoId: 10,
      convenioId: 20,
      protocoloEnvio: null,
    });
    const db = mockSelectDb(
      [
        [loteUnimed],
        [],
        [{ id: 20, nome: "UNIMED" }],
      ],
      [
        [
          [
            {
              id: 501,
              estabelecimentoId: 10,
              convenioId: 20,
              guiaNumero: "GUIA-UNIMED-1",
              protocoloDemonstrativo: "PROT-TISS-987654",
              sequencialItem: 1,
              erroTiss: "2012-COBRANÇA DE MATERIAL INCOMPATÍVEL COM O PROCEDIMENTO",
              motivoGlosaConvenio: "2012",
              pacienteNome: "Maria Unimed",
              pacienteCarteirinha: "00123456789",
              dataGlosa: "2026-10-15",
              valorGlosado: "120.50",
              valorRecursado: "120.50",
              justificativaRecurso: "Material utilizado conforme prescrição médica em prontuário.",
              codigoProcedimento: "70101012",
              descricaoProcedimento: "CATETER VENOSO CENTRAL",
              status: "recurso_criado",
              quantidade: "1",
              valorPagoOriginal: "0.00",
              dataPagamentoOriginal: "2026-10-20",
              fonte: "demonstrativo",
            },
          ],
        ],
        [[]],
      ]
    );

    const exportacao = await getRecursosLoteParaExportacao(88, db);
    expect(exportacao).not.toBeNull();
    expect(exportacao!.recursos).toHaveLength(1);
    const item = exportacao!.recursos[0] as any;
    expect(item.protocoloDP).toBe("PROT-TISS-987654");
    expect(item.protocoloTiss).toBe("PROT-TISS-987654");
    expect(item.erroTiss).toBe("2012-COBRANÇA DE MATERIAL INCOMPATÍVEL COM O PROCEDIMENTO");
    expect(item.motivoGlosa).toBe("2012-COBRANÇA DE MATERIAL INCOMPATÍVEL COM O PROCEDIMENTO");
  });
});
