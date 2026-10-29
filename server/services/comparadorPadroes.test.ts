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
                numeroConta: "76696626",
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

    const resultado = await executarComparacaoESalvar("76696626", 1, {
      escopoContextoMedico: {
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
        numeroConta: "76696626",
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
    expect(contaConvenioSource).toContain("estabelecimentoId: estabelecimentoAtual.id,");
    expect(contaConvenioSource).toContain("numeroConta: conta.numeroConta,");
    expect(routerSource).toContain("estabelecimentoId: input.contextoMedicoScope.estabelecimentoId ?? input.estabelecimentoId");
    expect(routerSource).toContain("numeroConta: input.contextoMedicoScope.numeroConta ?? input.numeroConta");
  });
});
