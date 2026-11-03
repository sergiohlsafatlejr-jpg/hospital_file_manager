import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./xmlImportacaoLoteVault", () => ({
  armazenamentoXmlImportacaoPronto: () => true,
  criarChaveStorageXmlImportacao: () => "cofre-ambulatorial.enc",
  salvarXmlImportacaoProtegido: vi.fn(async () => undefined),
  lerXmlImportacaoProtegido: vi.fn(),
  XML_IMPORTACAO_MAX_FILE_BYTES: 16 * 1024 * 1024,
}));

vi.mock("./faturamentoUnificadoService", () => ({
  popularDeXmlTissArquivoRestrito: vi.fn(async () => ({ inseridos: 1, total: 1 })),
}));

import { getDb, getConvenioById, verificarPermissaoEstabelecimento } from "./db";
import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";
import {
  tabelasPreco,
  regrasNegocio,
  itensRegraNegocio,
  fabricaContas,
} from "../drizzle/schema";

const user = {
  id: 71,
  role: "admin",
  name: "Faturista Ambulatorial",
  email: "ambulatorial@safatle.test",
};

function caller() {
  return fabricaFaturamentoRouter.createCaller({
    user,
    req: {},
    res: {},
  } as any);
}

describe("Esteira Ambulatorial (Lotes XML com Múltiplas Guias e Validador Triplo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verificarPermissaoEstabelecimento).mockResolvedValue(true);
    scope.exigirAcessoFabrica.mockResolvedValue(undefined);
    scope.exigirHospitalProprietario.mockResolvedValue(undefined);
    scope.resolverHospitaisAutorizados.mockResolvedValue([3]);
    scope.autorizarLoteHospitalar.mockResolvedValue(undefined);
  });

  it("desmembra múltiplas guias ambulatoriais do XML e avança direto para Enviado ao Convênio quando 100% conforme", async () => {
    const insertedValues: any[] = [];
    const insertMock = vi.fn(() => ({
      values: vi.fn((vals: any) => {
        insertedValues.push(vals);
        return Promise.resolve([{ insertId: insertedValues.length * 10 }]);
      }),
    }));
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const convenioUnimed = {
      id: 55,
      nome: "UNIMED GOIANIA",
      codigo: "382876",
      registroAns: "382876",
      estabelecimentoId: 3,
      ativo: "sim",
    };

    const tabelaPrecosRows = [
      {
        id: 1,
        convenioId: 55,
        estabelecimentoId: 3,
        codigo: "10101012",
        nome: "CONSULTA EM CONSULTORIO",
        valor: "120.00",
        ativo: "sim",
      },
      {
        id: 2,
        convenioId: 55,
        estabelecimentoId: 3,
        codigo: "40304361",
        nome: "HEMOGRAMA COMPLETO",
        valor: "25.00",
        ativo: "sim",
      },
    ];

    const selectMock = vi.fn(() => ({
      from: (table: any) => {
        const rows =
          table === tabelasPreco
            ? tabelaPrecosRows
            : table === regrasNegocio || table === itensRegraNegocio || table === fabricaContas
              ? []
              : [convenioUnimed];
        const query = Object.assign(Promise.resolve(rows), {
          where: () =>
            Object.assign(Promise.resolve(rows), {
              limit: async () => rows,
            }),
          limit: async () => rows,
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
      transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(db)),
    };

    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(getConvenioById).mockResolvedValue(convenioUnimed as any);

    const xmlLoteConforme = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:cabecalho>
          <ans:identificacaoTransacao>
            <ans:sequencialTransacao>5001</ans:sequencialTransacao>
          </ans:identificacaoTransacao>
        </ans:cabecalho>
        <ans:prestadorParaOperadora>
          <ans:loteGuias>
            <ans:numeroLote>LOTE-AMB-9001</ans:numeroLote>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:cabecalhoGuia>
                  <ans:registroANS>382876</ans:registroANS>
                  <ans:numeroGuiaPrestador>GUIA-AMB-001</ans:numeroGuiaPrestador>
                </ans:cabecalhoGuia>
                <ans:dadosAutorizacao>
                  <ans:numeroGuiaOperadora>GUIA-AMB-001</ans:numeroGuiaOperadora>
                  <ans:senha>SENHA-001</ans:senha>
                </ans:dadosAutorizacao>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>0099887766</ans:numeroCarteira>
                  <ans:nomeBeneficiario>MARIA AMBULATORIAL UM</ans:nomeBeneficiario>
                </ans:dadosBeneficiario>
                <ans:procedimentosExecutados>
                  <ans:procedimentoExecutado>
                    <ans:dataExecucao>2026-10-15</ans:dataExecucao>
                    <ans:procedimento>
                      <ans:codigoTabela>22</ans:codigoTabela>
                      <ans:codigoProcedimento>40304361</ans:codigoProcedimento>
                      <ans:descricaoProcedimento>HEMOGRAMA COMPLETO</ans:descricaoProcedimento>
                    </ans:procedimento>
                    <ans:quantidadeExecutada>1</ans:quantidadeExecutada>
                    <ans:valorUnitario>25.00</ans:valorUnitario>
                    <ans:valorTotal>25.00</ans:valorTotal>
                    <ans:equipeSadt>
                      <ans:nomeProf>DR JOAO</ans:nomeProf>
                      <ans:numeroConselhoProfissional>12345</ans:numeroConselhoProfissional>
                    </ans:equipeSadt>
                  </ans:procedimentoExecutado>
                </ans:procedimentosExecutados>
              </ans:guiaSP-SADT>
              <ans:guiaConsulta>
                <ans:cabecalhoGuia>
                  <ans:registroANS>382876</ans:registroANS>
                  <ans:numeroGuiaPrestador>GUIA-AMB-002</ans:numeroGuiaPrestador>
                </ans:cabecalhoGuia>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>0011223344</ans:numeroCarteira>
                  <ans:nomeBeneficiario>JOSE CONSULTA DOIS</ans:nomeBeneficiario>
                </ans:dadosBeneficiario>
                <ans:profissionalExecutante>
                  <ans:nomeProfissional>DRA ANA</ans:nomeProfissional>
                  <ans:numeroConselhoProfissional>54321</ans:numeroConselhoProfissional>
                </ans:profissionalExecutante>
                <ans:dadosAtendimento>
                  <ans:dataAtendimento>2026-10-16</ans:dataAtendimento>
                  <ans:procedimento>
                    <ans:codigoTabela>22</ans:codigoTabela>
                    <ans:codigoProcedimento>10101012</ans:codigoProcedimento>
                    <ans:valorProcedimento>120.00</ans:valorProcedimento>
                  </ans:procedimento>
                </ans:dadosAtendimento>
              </ans:guiaConsulta>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:prestadorParaOperadora>
      </ans:mensagemTISS>`;

    const res = await caller().importarLoteAmbulatorialXml({
      hospitalEstabelecimentoId: 3,
      nomeArquivo: "lote-ambulatorial-ok.xml",
      conteudoBase64: Buffer.from(xmlLoteConforme, "utf8").toString("base64"),
      enviarDiretoSeConforme: true,
      metodoEnvioConvenio: "rpa_portal",
    });

    expect(res.sucesso).toBe(true);
    expect(res.numeroLote).toBe("LOTE-AMB-9001");
    expect(res.totalGuias).toBe(2);
    expect(res.guiasConformes).toBe(2);
    expect(res.guiasDivergentes).toBe(0);
    expect(res.valorTotalLote).toBe(145);
    expect(res.enviadoDiretoConvenio).toBe(true);
    expect(res.protocoloEnvio).toContain("PROT-AMB-3-LOTE-AMB-9001");

    // Verificar que ambas as guias foram criadas em fabrica_contas já em enviado_convenio
    const contasCriadas = insertedValues.filter(
      (v) => !Array.isArray(v) && v.tipoAtendimento === "ambulatorio_sadt"
    );
    expect(contasCriadas).toHaveLength(2);
    expect(contasCriadas[0]).toMatchObject({
      numeroGuia: "GUIA-AMB-001",
      numeroLote: "LOTE-AMB-9001",
      nomePaciente: "MARIA AMBULATORIAL UM",
      setorAtual: "enviado_convenio",
      statusSetor: "concluido",
      statusAuditoriaRegras: "conforme",
    });
    expect(contasCriadas[1]).toMatchObject({
      numeroGuia: "GUIA-AMB-002",
      numeroLote: "LOTE-AMB-9001",
      nomePaciente: "JOSE CONSULTA DOIS",
      setorAtual: "enviado_convenio",
      statusSetor: "concluido",
      statusAuditoriaRegras: "conforme",
    });
  });

  it("trava o lote no Faturamento e destaca apenas as guias com erro quando há divergência de Tabela de Preços ou Regra", async () => {
    const insertedValues: any[] = [];
    const insertMock = vi.fn(() => ({
      values: vi.fn((vals: any) => {
        insertedValues.push(vals);
        return Promise.resolve([{ insertId: insertedValues.length * 10 }]);
      }),
    }));
    const updateMock = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const convenioUnimed = {
      id: 55,
      nome: "UNIMED GOIANIA",
      codigo: "382876",
      registroAns: "382876",
      estabelecimentoId: 3,
      ativo: "sim",
    };

    const tabelaPrecosRows = [
      {
        id: 2,
        convenioId: 55,
        estabelecimentoId: 3,
        codigo: "40304361",
        nome: "HEMOGRAMA COMPLETO",
        valor: "25.00", // Na tabela é R$ 25,00, mas na Guia 2 foi cobrado R$ 40,00!
        ativo: "sim",
      },
    ];

    const selectMock = vi.fn(() => ({
      from: (table: any) => {
        const rows =
          table === tabelasPreco
            ? tabelaPrecosRows
            : table === regrasNegocio || table === itensRegraNegocio || table === fabricaContas
              ? []
              : [convenioUnimed];
        const query = Object.assign(Promise.resolve(rows), {
          where: () =>
            Object.assign(Promise.resolve(rows), {
              limit: async () => rows,
            }),
          limit: async () => rows,
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
      transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(db)),
    };

    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(getConvenioById).mockResolvedValue(convenioUnimed as any);

    const xmlComDivergencia = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:prestadorParaOperadora>
          <ans:loteGuias>
            <ans:numeroLote>LOTE-AMB-9002</ans:numeroLote>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:cabecalhoGuia>
                  <ans:registroANS>382876</ans:registroANS>
                  <ans:numeroGuiaPrestador>GUIA-OK-10</ans:numeroGuiaPrestador>
                </ans:cabecalhoGuia>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>0099887766</ans:numeroCarteira>
                  <ans:nomeBeneficiario>PACIENTE CONFORME</ans:nomeBeneficiario>
                </ans:dadosBeneficiario>
                <ans:procedimentosExecutados>
                  <ans:procedimentoExecutado>
                    <ans:dataExecucao>2026-10-15</ans:dataExecucao>
                    <ans:procedimento>
                      <ans:codigoTabela>22</ans:codigoTabela>
                      <ans:codigoProcedimento>40304361</ans:codigoProcedimento>
                      <ans:descricaoProcedimento>HEMOGRAMA COMPLETO</ans:descricaoProcedimento>
                    </ans:procedimento>
                    <ans:quantidadeExecutada>1</ans:quantidadeExecutada>
                    <ans:valorUnitario>25.00</ans:valorUnitario>
                    <ans:valorTotal>25.00</ans:valorTotal>
                    <ans:equipeSadt>
                      <ans:nomeProf>DR JOAO</ans:nomeProf>
                      <ans:numeroConselhoProfissional>12345</ans:numeroConselhoProfissional>
                    </ans:equipeSadt>
                  </ans:procedimentoExecutado>
                </ans:procedimentosExecutados>
              </ans:guiaSP-SADT>
              <ans:guiaSP-SADT>
                <ans:cabecalhoGuia>
                  <ans:registroANS>382876</ans:registroANS>
                  <ans:numeroGuiaPrestador>GUIA-ERRO-20</ans:numeroGuiaPrestador>
                </ans:cabecalhoGuia>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>0055443322</ans:numeroCarteira>
                  <ans:nomeBeneficiario>PACIENTE COM PRECO DIVERGENTE</ans:nomeBeneficiario>
                </ans:dadosBeneficiario>
                <ans:procedimentosExecutados>
                  <ans:procedimentoExecutado>
                    <ans:dataExecucao>2026-10-15</ans:dataExecucao>
                    <ans:procedimento>
                      <ans:codigoTabela>22</ans:codigoTabela>
                      <ans:codigoProcedimento>40304361</ans:codigoProcedimento>
                      <ans:descricaoProcedimento>HEMOGRAMA COMPLETO</ans:descricaoProcedimento>
                    </ans:procedimento>
                    <ans:quantidadeExecutada>1</ans:quantidadeExecutada>
                    <ans:valorUnitario>40.00</ans:valorUnitario>
                    <ans:valorTotal>40.00</ans:valorTotal>
                    <ans:equipeSadt>
                      <ans:nomeProf>DR JOAO</ans:nomeProf>
                      <ans:numeroConselhoProfissional>12345</ans:numeroConselhoProfissional>
                    </ans:equipeSadt>
                  </ans:procedimentoExecutado>
                </ans:procedimentosExecutados>
              </ans:guiaSP-SADT>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:prestadorParaOperadora>
      </ans:mensagemTISS>`;

    const res = await caller().importarLoteAmbulatorialXml({
      hospitalEstabelecimentoId: 3,
      nomeArquivo: "lote-ambulatorial-divergente.xml",
      conteudoBase64: Buffer.from(xmlComDivergencia, "utf8").toString("base64"),
      enviarDiretoSeConforme: true,
    });

    expect(res.sucesso).toBe(true);
    expect(res.totalGuias).toBe(2);
    expect(res.guiasConformes).toBe(1);
    expect(res.guiasDivergentes).toBe(1);
    expect(res.enviadoDiretoConvenio).toBe(false);
    expect(res.guiasComErroResumo).toHaveLength(1);
    expect(res.guiasComErroResumo[0].numeroGuia).toBe("GUIA-ERRO-20");

    const contasCriadas = insertedValues.filter(
      (v) => !Array.isArray(v) && v.tipoAtendimento === "ambulatorio_sadt"
    );
    expect(contasCriadas).toHaveLength(2);
    // Ambas ficam retidas no faturamento até que a guia divergente seja corrigida ou justificada
    expect(contasCriadas[0]).toMatchObject({
      numeroGuia: "GUIA-OK-10",
      setorAtual: "faturamento",
      statusSetor: "concluido",
      statusAuditoriaRegras: "conforme",
    });
    expect(contasCriadas[1]).toMatchObject({
      numeroGuia: "GUIA-ERRO-20",
      setorAtual: "faturamento",
      statusSetor: "devolvido_erro",
      statusAuditoriaRegras: "divergente",
    });
  });
});
