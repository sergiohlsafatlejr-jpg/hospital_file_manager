import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scope = vi.hoisted(() => ({
  exigirAcessoFabrica: vi.fn(),
  exigirHospitalProprietario: vi.fn(),
  resolverHospitaisAutorizados: vi.fn(),
  autorizarLoteHospitalar: vi.fn(),
}));

vi.mock("./hospitalScope", () => ({
  ...scope,
  ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001,
}));

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(),
  getConvenioById: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
}));

import { getDb, getConvenioById, verificarPermissaoEstabelecimento } from "./db";
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";

const user = {
  id: 71,
  role: "user",
  name: "Operador",
  email: "operador@example.test",
};

function caller() {
  return fabricaFaturamentoRouter.createCaller({ user, req: {}, res: {} } as any);
}

function selectRows(rows: unknown[]) {
  const query = Object.assign(Promise.resolve(rows), {
    limit: async () => rows,
  });
  return () => ({
    from: () => ({
      where: () => query,
    }),
  });
}

function dbForAccounts(accounts: unknown[]) {
  const update = vi.fn(() => ({ set: () => ({ where: vi.fn() }) }));
  const insert = vi.fn(() => ({ values: vi.fn() }));
  return {
    select: selectRows(accounts),
    update,
    insert,
    delete: vi.fn(() => ({ where: vi.fn() })),
    execute: vi.fn(),
  };
}

describe("Fábrica de Faturamento: escopo hospitalar e falha fechada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    scope.exigirAcessoFabrica.mockResolvedValue(undefined);
    scope.exigirHospitalProprietario.mockResolvedValue(undefined);
    scope.resolverHospitaisAutorizados.mockResolvedValue([20]);
    scope.autorizarLoteHospitalar.mockResolvedValue(undefined);
  });

  it("nega acesso sem central antes de consultar a Fábrica", async () => {
    scope.exigirAcessoFabrica.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem acesso à central SAFATLE." }));

    await expect(caller().listarContas()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("não permite editar conta de hospital cruzado antes de atualizar", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 31 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.exigirHospitalProprietario.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem permissão." }));

    await expect(caller().editarConta({ id: 9, nomePaciente: "Paciente seguro" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.exigirHospitalProprietario).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), 31, "editar");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("não transfere proprietário por edição mesmo com acesso aos dois hospitais", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 20 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    await expect(caller().editarConta({ id: 9, hospitalEstabelecimentoId: 31 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("bloqueia lote misto antes da primeira escrita", async () => {
    const db = dbForAccounts([
      { id: 3, hospitalEstabelecimentoId: 20, setorAtual: "faturamento" },
      { id: 4, hospitalEstabelecimentoId: 31, setorAtual: "faturamento" },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.autorizarLoteHospitalar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Lote não autorizado." }));

    await expect(caller().assumirConta({ contaIds: [3, 4] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.autorizarLoteHospitalar).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), expect.arrayContaining([
      expect.objectContaining({ hospitalEstabelecimentoId: 20 }),
      expect.objectContaining({ hospitalEstabelecimentoId: 31 }),
    ]), "editar");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("não deixa visualizador cadastrar conta nem consultar dados auxiliares", async () => {
    scope.resolverHospitaisAutorizados.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Sem edição." }));

    await expect(caller().cadastrarContaRecepcao({
      hospitalEstabelecimentoId: 20,
      nomePaciente: "Paciente teste",
      tipoAtendimento: "internacao",
      dataEntrada: "2026-10-01",
      dataRecebimentoSafatle: "2026-10-02",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("meta global exige gerenciamento central real antes de inserir", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(caller().salvarMeta({ competencia: "2026-10", metaQuantidadeContas: 10 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(71, 2160001, "gerenciar");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("gerenciamento da meta hospitalar não dispensa permissão de exclusão", async () => {
    const db = dbForAccounts([{ id: 9, hospitalEstabelecimentoId: 20 }]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    scope.exigirHospitalProprietario.mockImplementation(async (_u, _h, acao) => {
      if (acao === "excluir") throw new TRPCError({ code: "FORBIDDEN", message: "Sem exclusão." });
    });
    await expect(caller().excluirMeta({ id: 9 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(scope.exigirHospitalProprietario).toHaveBeenCalledWith(expect.objectContaining({ id: 71 }), 20, "excluir");
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("converte tabela Fábrica ausente em erro de configuração e jamais em DDL", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(Object.assign(new Error("Table 'fabrica_contas' doesn't exist"), { code: "ER_NO_SUCH_TABLE" })),
    };
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(caller().listarContas()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Configuração da Fábrica de Faturamento ausente ou incompatível.",
    });
    expect(db.execute).toHaveBeenCalledTimes(2);

    const routerSource = readFileSync(
      fileURLToPath(new URL("./routers/fabricaFaturamentoRouter.ts", import.meta.url)),
      "utf8",
    );
    expect(routerSource).not.toMatch(/\b(?:CREATE|ALTER)\s+(?:TABLE|INDEX)\b/i);
    expect(routerSource).not.toContain("ensureFabricaTables");
    expect(routerSource).not.toContain(".delete(contasConvenioItens)");
    expect(routerSource).not.toContain(".delete(contasConvenioResumo)");
    expect(routerSource).toContain("arquivoHospitalId: arquivoId,");
    expect(routerSource).toContain("{ escopoContextoMedico: {");
  });

  it("exige permissão central de gerenciamento para configurar perfil de colaborador por setor", async () => {
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(false);
    await expect(
      caller().salvarPerfilColaborador({
        colaboradorId: 88,
        cargoSetor: "Faturista",
        setoresPermitidos: ["faturamento"],
        hospitaisPermitidos: [20],
        verRelatoriosGerenciais: false,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(verificarPermissaoEstabelecimento).toHaveBeenCalledWith(71, 2160001, "gerenciar");
  });

  it("exige pelo menos um XML (Conta Hospitalar ou Honorários Médicos) ao importar na conta", async () => {
    await expect(
      caller().importarXmlNaConta({
        contaId: 10,
        etapa: "faturamento",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("materializa a conta do paciente e itens padronizados no estabelecimento do hospital ao importar XML na Fábrica", async () => {
    const insertedValues: any[] = [];
    const insertMock = vi.fn(() => ({
      values: vi.fn((vals: any) => {
        insertedValues.push(vals);
        return Promise.resolve([{ insertId: insertedValues.length * 100 }]);
      }),
    }));
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const contaFabrica = {
      id: 10,
      hospitalEstabelecimentoId: 3,
      convenioId: null,
      convenioNome: "UNIMED",
      numeroGuia: "76696626",
      numeroContaHospital: "76696626",
      numeroAtendimento: "ATD-10",
      nomePaciente: "MARIA SILVA",
      tipoAtendimento: "uti",
      dataEntrada: "2026-10-01",
      dataAlta: "2026-10-05",
      setorAtual: "faturamento",
      statusSetor: "em_andamento",
    };

    const convenioHospital = {
      id: 55,
      nome: "UNIMED GOIANIA",
      codigo: "382876",
      registroAns: "382876",
      estabelecimentoId: 3,
      ativo: "sim",
    };

    const selectMock = vi.fn(() => ({
      from: (table: any) => {
        const resultRows = table === ( contaFabrica as any ) ? [contaFabrica] : [contaFabrica, convenioHospital];
        const query = Object.assign(Promise.resolve([convenioHospital]), {
          where: () =>
            Object.assign(Promise.resolve([contaFabrica]), {
              limit: async () => [contaFabrica],
            }),
          limit: async () => [contaFabrica],
        });
        return query;
      },
    }));

    const db = {
      select: selectMock,
      insert: insertMock,
      update: updateMock,
      delete: vi.fn(() => ({ where: vi.fn() })),
      execute: vi.fn().mockResolvedValue([[{ codigoPrestador: "05562645000131" }]]),
    };
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(getConvenioById).mockResolvedValue(convenioHospital as any);

    const xmlTiss = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:cabecalho>
          <ans:identificacaoTransacao>
            <ans:sequencialTransacao>1001</ans:sequencialTransacao>
          </ans:identificacaoTransacao>
        </ans:cabecalho>
        <ans:prestadorParaOperadora>
          <ans:loteGuias>
            <ans:numeroLote>202610</ans:numeroLote>
            <ans:guiasTISS>
              <ans:guiaResumoInternacao>
                <ans:cabecalhoGuia>
                  <ans:registroANS>382876</ans:registroANS>
                  <ans:numeroGuiaPrestador>76696626</ans:numeroGuiaPrestador>
                </ans:cabecalhoGuia>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>00123456789</ans:numeroCarteira>
                  <ans:nomeBeneficiario>MARIA SILVA</ans:nomeBeneficiario>
                </ans:dadosBeneficiario>
                <ans:procedimentosExecutados>
                  <ans:procedimentoExecutado>
                    <ans:dataExecucao>2026-10-02</ans:dataExecucao>
                    <ans:procedimento>
                      <ans:codigoTabela>22</ans:codigoTabela>
                      <ans:codigoProcedimento>10102019</ans:codigoProcedimento>
                      <ans:descricaoProcedimento>VISITA HOSPITALAR</ans:descricaoProcedimento>
                    </ans:procedimento>
                    <ans:quantidadeExecutada>1</ans:quantidadeExecutada>
                    <ans:valorUnitario>150.00</ans:valorUnitario>
                    <ans:valorTotal>150.00</ans:valorTotal>
                  </ans:procedimentoExecutado>
                </ans:procedimentosExecutados>
              </ans:guiaResumoInternacao>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:prestadorParaOperadora>
      </ans:mensagemTISS>`;

    const res = await caller().importarXmlNaConta({
      fabricaContaId: 10,
      nomeArquivo: "guia-76696626.xml",
      conteudoBase64: Buffer.from(xmlTiss, "utf8").toString("base64"),
      etapaXml: "faturamento",
      avancarSetorAutomatico: true,
    });

    expect(res.sucesso).toBe(true);
    expect(res.numeroGuia).toBe("76696626");

    // Verificar que inseriu em faturamento_tiss e contas_convenio_itens com tipoItem maiúsculo padronizado, setor UTI e prestador executante
    const arraysInseridos = insertedValues.filter(Array.isArray);
    expect(arraysInseridos.length).toBeGreaterThanOrEqual(2);
    const tissInserido = arraysInseridos[0][0];
    const ccItemInserido = arraysInseridos[1][0];

    expect(tissInserido).toMatchObject({
      estabelecimentoId: 3,
      numeroGuiaPrestador: "76696626",
      tipoItem: "PROCEDIMENTO",
      codigoItem: "10102019",
      codigoPrestadorExecutante: "05562645000131",
    });

    expect(ccItemInserido).toMatchObject({
      estabelecimentoId: 3,
      numeroConta: "76696626",
      pacienteNome: "MARIA SILVA",
      tipoItem: "PROCEDIMENTO",
      codigoItem: "10102019",
      codigoItemTuss: "10102019",
      setor: "UTI",
      codigoPrestadorExecutante: "05562645000131",
    });
  });
});
