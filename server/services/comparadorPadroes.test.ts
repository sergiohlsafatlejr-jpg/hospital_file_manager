import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";
import { compararItensComPadroes, executarComparacaoESalvar } from "./comparadorPadroes";

describe("compararItensComPadroes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as any);
  });

  it("aceita valores serializados da publicação Warleine sem depender de tabelas XML", async () => {
    const resultado = await compararItensComPadroes({
      numeroConta: "conta-teste",
      estabelecimentoId: 4,
      convenio: null,
      itens: [{
        codigoItem: "90008332",
        descricaoItem: "Item faturado",
        tipoItem: "MEDICAMENTO",
        quantidade: "2.0000",
        valorUnitario: "20.7600",
        valorTotal: "41.5200",
        setor: "CENTRO CIRÚRGICO",
      }],
    });

    expect(resultado.totalItensAnalisados).toBe(1);
    expect(resultado.setoresAnalisados).toEqual(["CENTRO CIRÚRGICO"]);
    expect(resultado.divergencias).toMatchObject([
      { tipo: "COMPOSICAO", severidade: "aviso" },
    ]);
    expect(resultado.statusGeral).toBe("conforme");
  });

  it("retorna resultado vazio determinístico para uma conta publicada sem itens", async () => {
    const resultado = await compararItensComPadroes({
      numeroConta: "conta-vazia",
      estabelecimentoId: 4,
      convenio: "OPERADORA",
      itens: [],
    });

    expect(resultado).toMatchObject({
      totalItensAnalisados: 0,
      totalDivergencias: 0,
      statusGeral: "conforme",
      setoresAnalisados: [],
    });
  });

  it("persiste status dos itens, resumo da conta e log de análise quando o contexto médico é aplicado", async () => {
    const updateWhereSpy = vi.fn().mockResolvedValue(undefined);
    const updateSetSpy = vi.fn().mockReturnValue({ where: updateWhereSpy });
    const updateSpy = vi.fn().mockReturnValue({ set: updateSetSpy });
    const insertValuesSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn().mockReturnValue({ values: insertValuesSpy });

    let selectCall = 0;
    const selectMock = vi.fn().mockImplementation(() => ({
      from: () => ({
        where: () => {
          selectCall++;
          if (selectCall === 1) {
            // 1ª chamada: itens da conta em compararContaComPadroes
            return Promise.resolve([
              {
                id: 101,
                numeroConta: "CONTA-REGRESSAO-SINTETICA",
                estabelecimentoId: 1,
                convenio: "SULAMERICA",
                convenioId: 10,
                arquivoId: 50,
                codigoItem: "MAT-001",
                descricaoItem: "Material presente",
                tipoItem: "MATERIAL",
                quantidade: "1.0000",
                valorUnitario: "100.0000",
                valorTotal: "100.0000",
                setor: null,
              },
            ]);
          }
          if (selectCall === 2) {
            // 2ª chamada: itensExistentes em executarComparacaoESalvar
            return Promise.resolve([{ codigoItem: "MAT-001" }]);
          }
          // 3ª chamada: itens para atualização de status em executarComparacaoESalvar
          return Promise.resolve([{ id: 101, codigoItem: "MAT-001" }]);
        },
      }),
    }));

    vi.mocked(getDb).mockResolvedValue({
      select: selectMock,
      update: updateSpy,
      insert: insertSpy,
    } as any);

    const resultado = await executarComparacaoESalvar("CONTA-REGRESSAO-SINTETICA", 1, {
      escopoContextoMedico: {
        estabelecimentoId: 1,
        numeroConta: "CONTA-REGRESSAO-SINTETICA",
        arquivoHospitalId: 50,
        convenioId: 10,
      },
      contextoMedico: {
        configuracaoPendente: false,
        diagnosticoSnapshot: null,
        contexto: null,
        fontes: [
          { arquivoId: 99, registros: 1, codigosDistintos: 1, procedimentos: [] },
        ],
        candidatos: [
          {
            padraoId: 77,
            nome: "Gabarito Septoplastia",
            elegivel: true,
            recomendacao: true,
            motivos: [],
            principaisTotal: 1,
            principaisEncontrados: 1,
            composicao: {
              itens: [
                {
                  codigo: "MAT-FALTANTE",
                  descricao: "Tampão nasal obrigatório",
                  categoria: "obrigatorio",
                  grupo: null,
                  presenca: "ausente",
                  pendencia: true,
                  frequencia: 100,
                },
              ],
              itensEsperados: 1,
              itensPresentes: 0,
              faltantesObrigatorios: 1,
              faltantesOpcionais: 0,
              faltantesCondicionais: 0,
              gruposAlternativos: 0,
              gruposObrigatoriosAusentes: 0,
              gruposOpcionaisAusentes: 0,
              quantidadesAbaixo: 0,
              quantidadesAcima: 0,
              pendencias: 1,
            },
          },
        ],
      },
    });

    expect(resultado.statusGeral).toBe("divergente");
    expect(resultado.gabaritosUsados).toBe(1);
    expect(resultado.divergencias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "ITEM_FALTANTE",
          severidade: "critico",
          codigoItem: "MAT-FALTANTE",
        }),
      ]),
    );

    // Deve atualizar o item (1ª chamada de update) e o resumo da conta (2ª chamada de update)
    expect(updateSetSpy).toHaveBeenCalledTimes(2);
    expect(updateSetSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        statusAnalise: "conforme",
      }),
    );
    expect(updateSetSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        statusAnalise: "divergente",
        totalDivergencias: resultado.totalDivergencias,
        divergenciasGerais: expect.arrayContaining([
          expect.objectContaining({
            tipo: "ITEM_FALTANTE",
            codigoItem: "MAT-FALTANTE",
          }),
        ]),
      }),
    );

    // Deve gravar log de auditoria com o gabarito médico usado
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        numeroConta: "CONTA-REGRESSAO-SINTETICA",
        padraoId: 77,
        padraoNome: "Gabarito Septoplastia",
        statusGeral: "divergente",
      }),
    );
  });

  it("envia estabelecimentoId e numeroConta no contextoMedicoScope ao comparar na listagem de contas XML", () => {
    const contaConvenioSource = readFileSync(
      resolve(__dirname, "../../client/src/pages/ContaConvenio.tsx"),
      "utf-8",
    );
    const routerSource = readFileSync(
      resolve(__dirname, "../routers/contasConvenioRouter.ts"),
      "utf-8",
    );

    expect(contaConvenioSource).toContain("contextoMedicoScope: {");
    expect(contaConvenioSource).toContain("const estabelecimentoId = obterHospitalOrigemConta(conta);");
    expect(contaConvenioSource).toMatch(/contextoMedicoScope:\s*\{\s*estabelecimentoId,\s*numeroConta,/);
    expect(contaConvenioSource).toContain("montarPayloadComparacaoConta(conta)");
    expect(routerSource).toContain("estabelecimentoId: input.contextoMedicoScope.estabelecimentoId ?? input.estabelecimentoId");
    expect(routerSource).toContain("numeroConta: input.contextoMedicoScope.numeroConta ?? input.numeroConta");
  });

  it("valida preços contra tabelasPreco para todos os tipos (procedimentos, diárias, taxas e mat/med) com prioridade TUSS, fallback código interno e tolerância de R$ 0,02", async () => {
    const tabelaPrecosRows = [
      {
        id: 501,
        convenioId: 10,
        estabelecimentoId: 1,
        tipo: "procedimentos",
        procedimentoFonte: "dados_completo",
        codigo: "31102360",
        nome: "Ureterorrenolitotripsia",
        valor: "500.00",
        vigenciaInicio: new Date("2026-01-01"),
      },
      {
        id: 502,
        convenioId: 10,
        estabelecimentoId: null,
        tipo: "diarias",
        procedimentoFonte: null,
        codigo: "1001",
        nome: "Diária de Apartamento",
        valor: "300.00",
        vigenciaInicio: new Date("2026-01-01"),
      },
      {
        id: 503,
        convenioId: 10,
        estabelecimentoId: 1,
        tipo: "taxas",
        procedimentoFonte: null,
        codigo: "60023155",
        nome: "Taxa de Sala Cirúrgica",
        valor: "120.00",
        vigenciaInicio: new Date("2026-01-01"),
      },
      {
        id: 504,
        convenioId: 10,
        estabelecimentoId: 1,
        tipo: "mat_med",
        procedimentoFonte: null,
        codigo: "90008332",
        nome: "Fio Cirúrgico",
        valor: "25.00",
        vigenciaInicio: new Date("2026-01-01"),
      },
    ];

    let whereCall = 0;
    const bancoMock = {
      select: () => ({
        from: () => ({
          where: () => {
            whereCall++;
            if (whereCall <= 4) return Promise.resolve([]);
            if (whereCall === 5) {
              return Promise.resolve([
                { convenioId: 10, nomeOrigem: "UNIMED CATALAO", codigoOrigem: "001" },
              ]);
            }
            if (whereCall === 6) {
              return Promise.resolve(tabelaPrecosRows);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    };

    const resultado = await compararItensComPadroes({
      numeroConta: "CONTA-TABELA-PRECO",
      estabelecimentoId: 1,
      convenio: "UNIMED CATALAO",
      banco: bancoMock as any,
      itens: [
        {
          codigoItem: "INT-999",
          codigoItemTuss: "031102360",
          descricaoItem: "Ureterorrenolitotripsia",
          tipoItem: "PROCEDIMENTO",
          quantidade: "1",
          valorUnitario: "500.02",
          valorTotal: "500.02",
          setor: "CENTRO CIRURGICO",
        },
        {
          codigoItem: "1001",
          codigoItemTuss: null,
          descricaoItem: "Diária de Apartamento",
          tipoItem: "DIARIA",
          quantidade: "2",
          valorUnitario: "350.00",
          valorTotal: "700.00",
          setor: "INTERNACAO",
        },
        {
          codigoItem: "60023155",
          codigoItemTuss: null,
          descricaoItem: "Taxa de Sala Cirúrgica",
          tipoItem: "TAXA",
          quantidade: "1",
          valorUnitario: "119.97",
          valorTotal: "119.97",
          setor: "CENTRO CIRURGICO",
        },
        {
          codigoItem: "90008332",
          codigoItemTuss: "90008332",
          descricaoItem: "Fio Cirúrgico",
          tipoItem: "MAT_MED",
          quantidade: "4",
          valorUnitario: "15.00",
          valorTotal: "60.00",
          setor: "CENTRO CIRURGICO",
        },
      ],
    });

    expect(resultado.statusGeral).toBe("divergente");
    const divsPreco = resultado.divergencias.filter(d => d.tipo === "PRECO");
    expect(divsPreco).toHaveLength(3);

    const divDiaria = divsPreco.find(d => d.codigoItem === "1001");
    expect(divDiaria).toBeDefined();
    expect(divDiaria?.valorCobrado).toBe("350.00");
    expect(divDiaria?.valorEsperado).toBe("300.00");
    expect(divDiaria?.diferenca).toBe("50.00");
    expect(divDiaria?.detalhes?.diferencaTotal).toBe(100);

    const divTaxa = divsPreco.find(d => d.codigoItem === "60023155");
    expect(divTaxa).toBeDefined();
    expect(divTaxa?.valorCobrado).toBe("119.97");
    expect(divTaxa?.valorEsperado).toBe("120.00");
    expect(divTaxa?.diferenca).toBe("-0.03");

    const divMatMed = divsPreco.find(d => d.codigoItem === "90008332");
    expect(divMatMed).toBeDefined();
    expect(divMatMed?.valorCobrado).toBe("15.00");
    expect(divMatMed?.valorEsperado).toBe("25.00");
    expect(divMatMed?.diferenca).toBe("-10.00");
    expect(divMatMed?.detalhes?.diferencaTotal).toBe(-40);
  });
});
