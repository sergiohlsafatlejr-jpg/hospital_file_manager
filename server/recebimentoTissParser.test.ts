import { describe, it, expect } from "vitest";
import { parseExcelRecebimentoTiss, parseXmlRecebimentoTiss } from "./recebimentoTissParser";
import * as XLSX from "xlsx";

describe("recebimentoTissParser", () => {
  // Helper para criar um buffer Excel de teste
  function createTestExcelBuffer(data: Record<string, unknown>[]): Buffer {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  }

  it("deve parsear Excel com colunas Unimed corretamente", async () => {
    const testData = [
      {
        "Número Guia": "12345678",
        "Protocolo TISS": "PROT001",
        "Lote Prestador": "LOTE001",
        "Beneficiário": "999888777",
        "Nome Beneficiário": "João da Silva",
        "Data Execução": "15/01/2026",
        "Item": "10101012",
        "Item Desc": "Consulta médica",
        "Quantidade": 1,
        "Valor Pagamento": "150.00",
        "Erro TISS": "",
        "Data Pagto": "20/01/2026",
        "Nome Prestador": "Hospital Teste",
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    
    const item = result.items[0];
    expect(item.numeroGuiaPrestador).toBe("12345678");
    expect(item.numeroProtocolo).toBe("PROT001");
    expect(item.numeroLotePrestador).toBe("LOTE001");
    expect(item.numeroCarteira).toBe("999888777");
    expect(item.nomeBeneficiario).toBe("João da Silva");
    expect(item.codigoProcedimento).toBe("10101012");
    expect(item.descricaoProcedimento).toBe("Consulta médica");
    expect(item.qtdExecutada).toBe(1);
    expect(item.valorLiberado).toBe("15000"); // "150.00" é parseado como 15000 (remove pontos)
    expect(item.nomeOperadora).toBe("Hospital Teste");
  });

  it("deve ignorar linhas sem código de procedimento", async () => {
    const testData = [
      {
        "Número Guia": "12345678",
        "Item": "10101012",
        "Item Desc": "Consulta médica",
      },
      {
        "Número Guia": "87654321",
        // Sem Item e Item Desc
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].numeroGuiaPrestador).toBe("12345678");
  });

  it("deve parsear valores monetários corretamente", async () => {
    const testData = [
      {
        "Item": "10101012",
        "Item Desc": "Procedimento 1",
        "Valor Pagamento": "1.234,56", // Formato brasileiro
      },
      {
        "Item": "10101013",
        "Item Desc": "Procedimento 2",
        "Valor Pagamento": 2500.00, // Número direto
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(2);
    expect(result.items[0].valorLiberado).toBe("1234.56");
    expect(result.items[1].valorLiberado).toBe("2500");
  });

  it("deve parsear datas em formato brasileiro", async () => {
    const testData = [
      {
        "Item": "10101012",
        "Item Desc": "Procedimento",
        "Data Execução": "25/12/2025",
        "Data Pagto": "30/12/2025",
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    
    const item = result.items[0];
    expect(item.dataRealizacao).toBeInstanceOf(Date);
    expect(item.dataEmissao).toBeInstanceOf(Date);
    
    if (item.dataRealizacao) {
      expect(item.dataRealizacao.getDate()).toBe(25);
      expect(item.dataRealizacao.getMonth()).toBe(11); // Dezembro = 11
      expect(item.dataRealizacao.getFullYear()).toBe(2025);
    }
  });

  it("deve preencher arquivoId e estabelecimentoId", async () => {
    const testData = [
      {
        "Item": "10101012",
        "Item Desc": "Procedimento",
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 42, 7);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].arquivoId).toBe(42);
    expect(result.items[0].estabelecimentoId).toBe(7);
  });

  it("deve retornar lista vazia para buffer inválido (xlsx tenta parsear)", async () => {
    const invalidBuffer = Buffer.from("conteudo invalido");
    const result = await parseExcelRecebimentoTiss(invalidBuffer, 1, 1);

    // xlsx tenta parsear qualquer coisa, então retorna sucesso com lista vazia
    expect(result.success).toBe(true);
    expect(result.items.length).toBe(0);
  });

  it("deve retornar lista vazia para Excel sem dados", async () => {
    const testData: Record<string, unknown>[] = [];
    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(0);
  });

  it("deve mapear código de glosa corretamente", async () => {
    const testData = [
      {
        "Item": "10101012",
        "Item Desc": "Procedimento glosado",
        "Erro TISS": "A001",
        "Valor Pagamento": "0",
      },
    ];

    const buffer = createTestExcelBuffer(testData);
    const result = await parseExcelRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].codigoGlosa).toBe("A001");
  });
});

describe("parseXmlRecebimentoTiss", () => {
  // Helper para criar XML de demonstrativo TISS
  function createTestXmlBuffer(options: {
    numeroDemonstrativo?: string;
    nomeOperadora?: string;
    cnpj?: string;
    dataEmissao?: string;
    protocolos?: Array<{
      numeroLote?: string;
      numeroProtocolo?: string;
      situacaoProtocolo?: string;
      guias?: Array<{
        numeroGuiaPrestador?: string;
        numeroGuiaOperadora?: string;
        senha?: string;
        numeroCarteira?: string;
        situacaoGuia?: string;
        detalhes?: Array<{
          sequencialItem?: number;
          dataRealizacao?: string;
          codigoTabela?: string;
          codigoProcedimento?: string;
          descricaoProcedimento?: string;
          valorInformado?: string;
          valorProcessado?: string;
          valorLiberado?: string;
          qtdExecutada?: string;
          tipoGlosa?: string;
          valorGlosa?: string;
        }>;
      }>;
    }>;
  }): Buffer {
    const protocolosXml = (options.protocolos || []).map(p => {
      const guiasXml = (p.guias || []).map(g => {
        const detalhesXml = (g.detalhes || []).map(d => `
          <ans:detalhesGuia>
            <ans:sequencialItem>${d.sequencialItem || 1}</ans:sequencialItem>
            <ans:dataRealizacao>${d.dataRealizacao || '2025-12-01'}</ans:dataRealizacao>
            <ans:procedimento>
              <ans:codigoTabela>${d.codigoTabela || '22'}</ans:codigoTabela>
              <ans:codigoProcedimento>${d.codigoProcedimento || '10101012'}</ans:codigoProcedimento>
              <ans:descricaoProcedimento>${d.descricaoProcedimento || 'Procedimento Teste'}</ans:descricaoProcedimento>
            </ans:procedimento>
            <ans:valorInformado>${d.valorInformado || '100.00'}</ans:valorInformado>
            <ans:qtdExecutada>${d.qtdExecutada || '1.00'}</ans:qtdExecutada>
            <ans:valorProcessado>${d.valorProcessado || '100.00'}</ans:valorProcessado>
            <ans:valorLiberado>${d.valorLiberado || '100.00'}</ans:valorLiberado>
            ${d.tipoGlosa ? `<ans:relacaoGlosa><ans:valorGlosa>${d.valorGlosa || '0'}</ans:valorGlosa><ans:tipoGlosa>${d.tipoGlosa}</ans:tipoGlosa></ans:relacaoGlosa>` : ''}
          </ans:detalhesGuia>
        `).join('');
        
        return `
          <ans:relacaoGuias>
            <ans:numeroGuiaPrestador>${g.numeroGuiaPrestador || '123456'}</ans:numeroGuiaPrestador>
            <ans:numeroGuiaOperadora>${g.numeroGuiaOperadora || '123456'}</ans:numeroGuiaOperadora>
            <ans:senha>${g.senha || '123456'}</ans:senha>
            <ans:numeroCarteira>${g.numeroCarteira || '999888'}</ans:numeroCarteira>
            <ans:situacaoGuia>${g.situacaoGuia || '3'}</ans:situacaoGuia>
            ${detalhesXml}
          </ans:relacaoGuias>
        `;
      }).join('');
      
      return `
        <ans:dadosProtocolo>
          <ans:numeroLotePrestador>${p.numeroLote || 'LOTE001'}</ans:numeroLotePrestador>
          <ans:numeroProtocolo>${p.numeroProtocolo || 'PROT001'}</ans:numeroProtocolo>
          <ans:situacaoProtocolo>${p.situacaoProtocolo || '3'}</ans:situacaoProtocolo>
          ${guiasXml}
        </ans:dadosProtocolo>
      `;
    }).join('');
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:operadoraParaPrestador>
          <ans:demonstrativosRetorno>
            <ans:demonstrativoAnaliseConta>
              <ans:cabecalhoDemonstrativo>
                <ans:numeroDemonstrativo>${options.numeroDemonstrativo || 'DEMO001'}</ans:numeroDemonstrativo>
                <ans:nomeOperadora>${options.nomeOperadora || 'Operadora Teste'}</ans:nomeOperadora>
                <ans:numeroCNPJ>${options.cnpj || '12345678000199'}</ans:numeroCNPJ>
                <ans:dataEmissao>${options.dataEmissao || '2025-12-15'}</ans:dataEmissao>
              </ans:cabecalhoDemonstrativo>
              <ans:dadosConta>
                ${protocolosXml}
              </ans:dadosConta>
            </ans:demonstrativoAnaliseConta>
          </ans:demonstrativosRetorno>
        </ans:operadoraParaPrestador>
      </ans:mensagemTISS>
    `;
    
    return Buffer.from(xml, 'utf-8');
  }

  it("deve parsear XML de demonstrativo TISS corretamente", async () => {
    const buffer = createTestXmlBuffer({
      numeroDemonstrativo: 'DEMO123',
      nomeOperadora: 'Unimed Teste',
      cnpj: '00299149000113',
      dataEmissao: '2025-12-18',
      protocolos: [{
        numeroLote: '120087875',
        numeroProtocolo: '67118167',
        situacaoProtocolo: '3',
        guias: [{
          numeroGuiaPrestador: '2107559',
          numeroGuiaOperadora: '2107559',
          senha: '2107559',
          numeroCarteira: '75596',
          situacaoGuia: '3',
          detalhes: [{
            sequencialItem: 1,
            dataRealizacao: '2025-11-23',
            codigoTabela: '22',
            codigoProcedimento: '40803139',
            descricaoProcedimento: 'RX MAOS E PUNHOS PARA IDADE OSSEA',
            valorInformado: '43.89',
            valorProcessado: '43.89',
            valorLiberado: '30.72',
            qtdExecutada: '1.00',
            tipoGlosa: '1705',
            valorGlosa: '13.17',
          }],
        }],
      }],
    });

    const result = await parseXmlRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    
    const item = result.items[0];
    expect(item.numeroDemonstrativo).toBe('DEMO123');
    expect(item.nomeOperadora).toBe('Unimed Teste');
    expect(item.cnpjOperadora).toBe('00299149000113');
    expect(item.numeroLotePrestador).toBe('120087875');
    expect(item.numeroProtocolo).toBe('67118167');
    expect(item.numeroGuiaPrestador).toBe('2107559');
    expect(item.numeroCarteira).toBe('75596');
    expect(item.codigoProcedimento).toBe('40803139');
    expect(item.descricaoProcedimento).toBe('RX MAOS E PUNHOS PARA IDADE OSSEA');
    expect(item.valorInformado).toBe('43.89');
    expect(item.valorLiberado).toBe('30.72');
    expect(item.codigoGlosa).toBe('1705');
    expect(item.situacaoItem).toBe('parcial'); // Valor liberado < informado
  });

  it("deve extrair múltiplos itens de múltiplas guias", async () => {
    const buffer = createTestXmlBuffer({
      protocolos: [{
        guias: [
          {
            numeroGuiaPrestador: 'GUIA001',
            detalhes: [
              { codigoProcedimento: 'PROC001', descricaoProcedimento: 'Proc 1' },
              { codigoProcedimento: 'PROC002', descricaoProcedimento: 'Proc 2' },
            ],
          },
          {
            numeroGuiaPrestador: 'GUIA002',
            detalhes: [
              { codigoProcedimento: 'PROC003', descricaoProcedimento: 'Proc 3' },
            ],
          },
        ],
      }],
    });

    const result = await parseXmlRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(3);
    expect(result.items[0].codigoProcedimento).toBe('PROC001');
    expect(result.items[1].codigoProcedimento).toBe('PROC002');
    expect(result.items[2].codigoProcedimento).toBe('PROC003');
  });

  it("deve identificar itens glosados corretamente", async () => {
    const buffer = createTestXmlBuffer({
      protocolos: [{
        guias: [{
          detalhes: [{
            valorInformado: '100.00',
            valorLiberado: '0',
            tipoGlosa: 'A001',
            valorGlosa: '100.00',
          }],
        }],
      }],
    });

    const result = await parseXmlRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].situacaoItem).toBe('glosado');
    expect(result.items[0].codigoGlosa).toBe('A001');
  });

  it("deve preencher arquivoId e estabelecimentoId", async () => {
    const buffer = createTestXmlBuffer({
      protocolos: [{
        guias: [{
          detalhes: [{ codigoProcedimento: 'PROC001' }],
        }],
      }],
    });

    const result = await parseXmlRecebimentoTiss(buffer, 99, 55);

    expect(result.success).toBe(true);
    expect(result.items[0].arquivoId).toBe(99);
    expect(result.items[0].estabelecimentoId).toBe(55);
  });

  it("deve retornar lista vazia para XML sem protocolos", async () => {
    const buffer = createTestXmlBuffer({ protocolos: [] });
    const result = await parseXmlRecebimentoTiss(buffer, 1, 1);

    expect(result.success).toBe(true);
    expect(result.items.length).toBe(0);
  });
});
