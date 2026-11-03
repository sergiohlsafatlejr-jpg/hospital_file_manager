import { describe, it, expect, vi, beforeEach } from "vitest";
import { dashboardHomeRouter } from "./routers/dashboardHomeRouter";
import * as dbModule from "./db";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("dashboardHomeRouter.resumoGeral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna dados da esteira de faturamento, contas paradas nos setores e valores/quantidades faturados por estabelecimento", async () => {
    const mockExecute = vi.fn(async (queryObj: any) => {
      const sqlStr = String(queryObj?.queryChunks?.[0]?.value?.[0] ?? queryObj ?? "");

      if (sqlStr.includes("FROM estabelecimentos")) {
        return [
          [
            { id: 2160001, nome: "Safatle Central" },
            { id: 10, nome: "Hospital Santa Helena" },
            { id: 20, nome: "Hospital Samaritano" },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_contas fc") && sqlStr.includes("GROUP BY fc.hospital_estabelecimento_id, fc.setor_atual")) {
        return [
          [
            {
              hospitalId: 10,
              setor: "recepcao",
              totalContas: 4,
              emFila: 3,
              emAndamento: 1,
              devolvidasErro: 0,
              contasFaturadas: 0,
              valorTotal: 0,
              totalItensXml: 0,
              mediaHorasNoSetor: 6,
              maxHorasNoSetor: 12,
            },
            {
              hospitalId: 10,
              setor: "faturamento",
              totalContas: 8,
              emFila: 5,
              emAndamento: 2,
              devolvidasErro: 1,
              contasFaturadas: 3,
              valorTotal: 45000,
              totalItensXml: 120,
              mediaHorasNoSetor: 18,
              maxHorasNoSetor: 36,
            },
            {
              hospitalId: 10,
              setor: "auditoria_interna",
              totalContas: 5,
              emFila: 2,
              emAndamento: 3,
              devolvidasErro: 0,
              contasFaturadas: 5,
              valorTotal: 85000,
              totalItensXml: 210,
              mediaHorasNoSetor: 10,
              maxHorasNoSetor: 20,
            },
            {
              hospitalId: 20,
              setor: "enviado_convenio",
              totalContas: 12,
              emFila: 0,
              emAndamento: 0,
              devolvidasErro: 0,
              contasFaturadas: 12,
              valorTotal: 190000,
              totalItensXml: 450,
              mediaHorasNoSetor: 2,
              maxHorasNoSetor: 5,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_historico_fluxo")) {
        return [
          [
            {
              usuarioId: 1,
              usuarioNome: "Ana Faturista",
              contasRecepcionadas: 10,
              contasFaturadas: 15,
              valorFaturado: 230000,
              contasAuditadasInterna: 5,
              contasAuditadasExterna: 2,
              contasLimpasEnviadas: 12,
              totalContasMovimentadas: 20,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM fabrica_erros_conta")) {
        return [[{ totalErros: 2 }]];
      }

      if (sqlStr.includes("FROM faturamento_unificado") && sqlStr.includes("GROUP BY estabelecimentoId")) {
        return [
          [
            {
              estabelecimentoId: 10,
              totalItens: 350,
              totalContas: 15,
              valorTotalFaturado: 150000,
            },
            {
              estabelecimentoId: 20,
              totalItens: 450,
              totalContas: 12,
              valorTotalFaturado: 190000,
            },
          ],
        ];
      }

      if (sqlStr.includes("FROM contas_convenio_resumo") && sqlStr.includes("GROUP BY estabelecimentoId")) {
        return [[]];
      }

      return [[]];
    });

    vi.mocked(dbModule.getDb).mockResolvedValue({
      execute: mockExecute,
    } as any);

    const caller = dashboardHomeRouter.createCaller({
      user: { id: 1, name: "Sergio Safatle", email: "sergio@safatle.com", role: "admin" } as any,
      req: {} as any,
      res: {} as any,
    });

    const res = await caller.resumoGeral({
      estabelecimentoId: 2160001,
    });

    // 1. Verifica dados da Esteira de Faturamento
    expect(res.esteiraFaturamento.resumoProducao.totalGeralContas).toBe(29);
    expect(res.esteiraFaturamento.resumoProducao.contasParadasSetores).toBe(17); // 4 recepcao + 8 faturamento + 5 auditoria_interna
    expect(res.esteiraFaturamento.resumoProducao.contasEnviadasConvenio).toBe(12);
    expect(res.esteiraFaturamento.resumoProducao.totalDevolvidasErro).toBe(1);

    // 2. Verifica quantidade de contas paradas nos setores
    expect(res.esteiraFaturamento.porSetor.recepcao.totalContas).toBe(4);
    expect(res.esteiraFaturamento.porSetor.faturamento.totalContas).toBe(8);
    expect(res.esteiraFaturamento.porSetor.auditoria_interna.totalContas).toBe(5);
    expect(res.esteiraFaturamento.porSetor.enviado_convenio.totalContas).toBe(12);

    // 3. Verifica valores e quantidade faturados por estabelecimento
    expect(res.faturamentoPorEstabelecimento).toHaveLength(2);
    const samaritano = res.faturamentoPorEstabelecimento.find((e) => e.estabelecimentoId === 20);
    const santaHelena = res.faturamentoPorEstabelecimento.find((e) => e.estabelecimentoId === 10);

    expect(samaritano?.quantidadeFaturada).toBe(12);
    expect(samaritano?.valorFaturado).toBe(190000);
    expect(santaHelena?.contasParadasSetores).toBe(17);
    expect(santaHelena?.quantidadeFaturada).toBe(15);
    expect(santaHelena?.valorFaturado).toBe(150000);

    // 4. Verifica consolidação no topo para Safatle (2160001)
    expect(res.faturista.totalContas).toBe(27);
    expect(res.faturista.valorTotalFaturado).toBe(340000);
  });
});
