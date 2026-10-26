import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { contextoVinculoAprovado, gerarExcelRetornos } from "../client/src/lib/retornosRecursosExcel";

describe("retornosRecursosExcel", () => {
  it("gera e reabre planilha com dados do retorno e eventos financeiros separados", async () => {
    const arquivo = await gerarExcelRetornos([{
      estabelecimentoNome: "Hospital sintético",
      convenioNome: "CASSI sintético",
      importacao: {
        id: 1,
        origemRecurso: "externo",
        lotePortalId: null,
        nomeArquivoXml: "resposta.xml",
        nomeArquivoPdf: null,
        formato: "cassi-resposta-recurso-4.01-v1",
        versaoTiss: "4.01.00",
        registroAns: "006246",
        codigoPrestador: "PREST-01",
        numeroLote: "LOTE-01",
        protocoloRecurso: "PR-01",
        guiaRecursoPrestador: "REC-PREST-01",
        guiaRecursoOperadora: "REC-OPER-01",
        dataRecurso: "2026-09-29",
        dataResposta: "2026-10-26",
        totalRecursadoCabecalho: "100.00",
        totalAcatadoCabecalho: "80.00",
        totalRecursadoItens: "100.00",
        totalAcatadoItens: "80.00",
        cabecalhoDivergente: "nao",
        alertas: [],
        criadoEm: "2026-10-26",
      },
      resumo: {
        recursado: "100.00",
        acatado: "80.00",
        aprovacoes: 1,
        recursadoAprovado: "100.00",
        acatadoAprovado: "80.00",
        recebidoInformado: "20.00",
        liquido: "20.00",
        saldoAcatado: "60.00",
        diferencaRecursadoVsAprovado: "20.00",
      },
      linhas: [{
        id: 10,
        posicao: 1,
        estado: "aprovado",
        motivo: "Vínculo revisado manualmente.",
        guiaPrestador: "GUIA-01",
        guiaOperadora: "GUIA-OPER-01",
        sequencialItem: "1",
        dataExecucao: "2026-10-01",
        codigoTabela: "22",
        codigoItem: "PROC-01",
        codigoGlosa: "1001",
        valorRecursado: "100.00",
        valorAcatado: "80.00",
        justificativaPrestador: "Recurso realizado para teste",
        justificativaOperadora: "Aceito para teste",
        candidatos: [{
          id: 25,
          numeroGuia: "GUIA-01",
          sequencialItem: 1,
          dataExecucao: "2026-10-01",
          codigoItem: "PROC-01",
          codigoGlosa: "1001",
          valorGlosa: "120.00",
          protocolo: "PROTO-DEMO-01",
          lotePrestador: "LOTE-01",
          codigoPrestador: "PREST-01",
          descricaoItem: "Procedimento sintético",
        }],
        aprovacao: { id: 2, demonstrativoId: 25, justificativa: "Vínculo confirmado em revisão.", revisadoEm: "2026-10-26" },
        vinculoAtual: { status: "valido", demonstrativoId: 25 },
      }],
      pagamentos: [{
        id: 5,
        tipo: "recebimento",
        pagamentoOrigemId: null,
        valor: "20.00",
        dataEvento: "2026-10-25",
        referencia: "REC-01",
        observacao: "Parcela sintética informada",
        registradoEm: "2026-10-25",
      }],
      historico: [],
    }], { inicio: "2026-10-01", fim: "2026-10-31" });

    const workbook = XLSX.read(arquivo.bytes, { type: "array" });
    expect(workbook.SheetNames).toEqual(["Resumo por lote", "Itens de retorno", "Eventos financeiros"]);

    const itens = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["Itens de retorno"]!);
    expect(itens[0]).toMatchObject({
      "Hospital": "Hospital sintético",
      "Convênio": "CASSI sintético",
      "Guia prestador": "GUIA-01",
      "Nome": "",
      "Carteirinha": "",
      "Data original do recurso": "2026-09-29",
      "Data do documento de resposta": "2026-10-26",
      "Data do item": "2026-10-01",
      "Código": "PROC-01",
      "Código da tabela": "22",
      "Descrição": "Procedimento sintético",
      "Valor glosado": 120,
      "Valor recursado": 100,
      "Justificativa do prestador": "Recurso realizado para teste",
      "Protocolo do recurso": "PR-01",
      "Lote": "LOTE-01",
      "Demonstrativo aprovado": 25,
    });

    const eventos = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets["Eventos financeiros"]!);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ "Tipo": "Recebimento", "Valor": 20, "Referência": "REC-01" });
  });

  it("prefixa texto perigoso sem converter o conteúdo em fórmula", async () => {
    const arquivo = await gerarExcelRetornos([{
      importacao: {
        id: 1,
        origemRecurso: "externo",
        lotePortalId: null,
        nomeArquivoXml: "resposta.xml",
        nomeArquivoPdf: null,
        formato: "cassi-resposta-recurso-4.01-v1",
        versaoTiss: "4.01.00",
        registroAns: "006246",
        codigoPrestador: "PREST-01",
        numeroLote: "=LOTE",
        protocoloRecurso: "+PROTOCOLO",
        guiaRecursoPrestador: "GUIA-1",
        guiaRecursoOperadora: "GUIA-2",
        dataRecurso: null,
        dataResposta: null,
        totalRecursadoCabecalho: null,
        totalAcatadoCabecalho: null,
        totalRecursadoItens: "1.00",
        totalAcatadoItens: "0.00",
        cabecalhoDivergente: "nao",
        alertas: [],
        criadoEm: null,
      },
      resumo: { recursado: "1.00", acatado: "0.00", aprovacoes: 0, recursadoAprovado: "0.00", acatadoAprovado: "0.00", recebidoInformado: "0.00", liquido: "0.00", saldoAcatado: "0.00", diferencaRecursadoVsAprovado: "0.00" },
      linhas: [{ id: 1, posicao: 1, estado: "sem_vinculo", motivo: "Sem vínculo", guiaPrestador: "GUIA", guiaOperadora: "", sequencialItem: null, dataExecucao: null, codigoTabela: "22", codigoItem: "=PROC", codigoGlosa: "1001", valorRecursado: "1.00", valorAcatado: "0.00", justificativaPrestador: "=JUSTIFICATIVA", justificativaOperadora: "", candidatos: [], aprovacao: null, vinculoAtual: { status: "ausente" } }],
      pagamentos: [],
      historico: [],
    }]);
    const workbook = XLSX.read(arquivo.bytes, { type: "array" });
    const itens = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Itens de retorno"]!);
    expect(itens[0]?.["Lote"]).toBe("'=LOTE");
    expect(itens[0]?.["Código"]).toBe("'=PROC");
    expect(itens[0]?.["Justificativa do prestador"]).toBe("'=JUSTIFICATIVA");
  });

  it("não infere dados do demonstrativo quando o vínculo aprovado não está no snapshot", async () => {
    const linha = {
      id: 9,
      posicao: 1,
      estado: "aprovado" as const,
      motivo: "Vínculo revisado manualmente.",
      guiaPrestador: "GUIA-XML",
      guiaOperadora: "GUIA-OPER-XML",
      sequencialItem: "1",
      dataExecucao: "2026-10-01",
      codigoTabela: "22",
      codigoItem: "PROC-XML",
      codigoGlosa: "1001",
      valorRecursado: "50.00",
      valorAcatado: "25.00",
      justificativaPrestador: "Justificativa que veio no XML.",
      justificativaOperadora: "Resposta que veio no XML.",
      candidatos: [],
      aprovacao: { id: 1, demonstrativoId: 999, justificativa: "Vínculo histórico preservado.", revisadoEm: "2026-10-26" },
      vinculoAtual: { status: "ausente" as const },
    };

    expect(contextoVinculoAprovado(linha)).toBeNull();
  });
});
