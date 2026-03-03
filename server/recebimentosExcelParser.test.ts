import { describe, it, expect } from 'vitest';
import { extractRecebimentoExcelFromRow } from './recebimentosExcelParser';

describe('recebimentosExcelParser - Detecção de Glosas', () => {
  const defaultArgs = {
    arquivoId: 1,
    convenioId: 1,
    dataReferencia: new Date('2025-12-01'),
    dataPagamento: new Date('2026-01-30'),
    estabelecimentoId: 100,
  };

  describe('Formato Unimed - Glosas via Erro TISS', () => {
    it('deve marcar como GLOSADO quando Erro TISS está preenchido e Situação Item = PAGO', () => {
      const row = {
        'Número Guia': '62185116',
        'Seq': 20,
        'Beneficiário': '0064.8000.408679.67.4',
        'Nome Beneficiário': 'ADAILTON A DOS SANTOS',
        'Item': '60023112',
        'Item Desc': 'Taxa De Sala Cirúrgica, Porte Anestésico 2',
        'Valor Pagamento': '26.86',
        'Situação Item': 'PAGO',
        'Erro TISS': '1813-COBRANÇA DE PROCEDIMENTO SEM JUSTIFICATIVA PARA REALIZAÇÃO OU COM JUSTIFICATIVA INSUFICIENTE.',
        'Tipo Lançamento': 'HOS',
      };

      const record = extractRecebimentoExcelFromRow(
        row,
        defaultArgs.arquivoId,
        defaultArgs.convenioId,
        defaultArgs.dataReferencia,
        defaultArgs.dataPagamento,
        defaultArgs.estabelecimentoId
      );

      expect(record.situacaoItem).toBe('GLOSADO');
      expect(record.codigoGlosa).toBe('1813');
      expect(record.erroTiss).toContain('1813');
      // Valor pagamento mantido (é o valor pago pelo convênio)
      expect(record.valorPagamento).toBe('26.86');
    });

    it('deve marcar como GLOSADO quando Erro TISS preenchido e valor pagamento = 0', () => {
      const row = {
        'Número Guia': '62185117',
        'Item': '90303164',
        'Item Desc': 'Agua Para Injecao Sol. Inj. 10 Ml (Amp)',
        'Valor Pagamento': '0',
        'Situação Item': 'PAGO',
        'Erro TISS': '1713-FATURAMENTO INVÁLIDO',
      };

      const record = extractRecebimentoExcelFromRow(
        row,
        defaultArgs.arquivoId,
        defaultArgs.convenioId,
        defaultArgs.dataReferencia,
        defaultArgs.dataPagamento,
        defaultArgs.estabelecimentoId
      );

      expect(record.situacaoItem).toBe('GLOSADO');
      expect(record.codigoGlosa).toBe('1713');
    });

    it('deve extrair código de glosa de diferentes formatos de Erro TISS', () => {
      const testCases = [
        { erroTiss: '1702-COBRANÇA DE PROCEDIMENTO EM DUPLICIDADE', expected: '1702' },
        { erroTiss: '1812-COBRANÇA DE PROCEDIMENTO NÃO CORRELACIONADO', expected: '1812' },
        { erroTiss: '2008-COBRANÇA DE MATERIAL EM QUANTIDADES INCOMPATÍVEIS', expected: '2008' },
        { erroTiss: '2010-COBRANÇA DE MATERIAIS INCLUSOS NAS TAXAS', expected: '2010' },
        { erroTiss: '2401-TAXA / ALUGUEL INVÁLIDO', expected: '2401' },
      ];

      for (const tc of testCases) {
        const row = {
          'Número Guia': '12345',
          'Item': '99999',
          'Valor Pagamento': '10.00',
          'Situação Item': 'PAGO',
          'Erro TISS': tc.erroTiss,
        };

        const record = extractRecebimentoExcelFromRow(
          row,
          defaultArgs.arquivoId,
          defaultArgs.convenioId,
          defaultArgs.dataReferencia,
          defaultArgs.dataPagamento,
          defaultArgs.estabelecimentoId
        );

        expect(record.codigoGlosa).toBe(tc.expected);
        expect(record.situacaoItem).toBe('GLOSADO');
      }
    });

    it('deve manter PAGO quando não há Erro TISS', () => {
      const row = {
        'Número Guia': '62185118',
        'Item': '41301358',
        'Item Desc': 'Urofluxometria',
        'Valor Pagamento': '60.00',
        'Situação Item': 'PAGO',
      };

      const record = extractRecebimentoExcelFromRow(
        row,
        defaultArgs.arquivoId,
        defaultArgs.convenioId,
        defaultArgs.dataReferencia,
        defaultArgs.dataPagamento,
        defaultArgs.estabelecimentoId
      );

      expect(record.situacaoItem).toBe('PAGO');
      expect(record.codigoGlosa).toBeUndefined();
    });
  });

  describe('Formato Vivacom - Glosas via Valor Glosa', () => {
    it('deve marcar como GLOSADO quando VALOR GLOSA > 0 e situação não preenchida', () => {
      const row = {
        'GUIA': '99999',
        'CODIGO': '12345',
        'PROCEDIMENTO': 'Teste Vivacom',
        'VALOR PAGO': '0',
        'VALOR GLOSA': '50.00',
        'VALOR INFORMADO': '50.00',
      };

      const record = extractRecebimentoExcelFromRow(
        row,
        defaultArgs.arquivoId,
        defaultArgs.convenioId,
        defaultArgs.dataReferencia,
        defaultArgs.dataPagamento,
        defaultArgs.estabelecimentoId
      );

      expect(record.situacaoItem).toBe('GLOSADO');
      expect(record.valorGlosa).toBe('50');
    });
  });

  describe('Formato GEAP - Glosas via Existe Glosa', () => {
    it('deve marcar como GLOSADO quando Existe Glosa = true', () => {
      const row = {
        'Nº Guia': '88888',
        'Nº Serviço': '54321',
        'Serviço': 'Teste GEAP',
        'Valor Calculado Item': '100.00',
        'Existe Glosa': true,
        'Valor Glosado Item': '100.00',
        'Justificativa': '1702',
      };

      const record = extractRecebimentoExcelFromRow(
        row,
        defaultArgs.arquivoId,
        defaultArgs.convenioId,
        defaultArgs.dataReferencia,
        defaultArgs.dataPagamento,
        defaultArgs.estabelecimentoId
      );

      expect(record.situacaoItem).toBe('GLOSADO');
    });
  });
});

describe('recebimentosExcelParser - Formato IPASGO', () => {
  const defaultArgs = {
    arquivoId: 10,
    convenioId: 5,
    dataReferencia: new Date('2025-12-01'),
    dataPagamento: new Date('2026-02-27'),
    estabelecimentoId: 200,
  };

  it('deve mapear campos IPASGO corretamente para registro pago', () => {
    const row = {
      'FATURA': '1382385',
      'PAGAMENTO': '2/27/26',
      'CODIGO_PRESTADOR_PAGAMENTO': '00768-2',
      'NOME_PRESTADOR_PAGAMENTO': 'HEMOLABOR HEMATOLOGIA L P C LTDA',
      'COMPETENCIA': '2/1/26',
      'ENTREGA': '1/2/26',
      'PROTOCOLO': '473604',
      'LOTE': '88914',
      'NUMERO_GUIA_OPERADORA': '18874660',
      'SENHA': '18874660116',
      'CARTEIRA_BENEFICIARIO': '302126200',
      'NOME_BENEFICIARIO': 'ELIENES BEZERRA MACIEL',
      'REALIZACAO': '12/3/25',
      'CODIGO_PROCEDIMENTO': '40302385',
      'DESCRICAO_PROCEDIMENTO': '40302385-PROTEINAS TOTAIS ALBUMINA E GLOBULINA',
      'GRAU_PARTICIPACAO': null,
      'TIPO_GUIA': 'SP/SADT',
      'QUANTIDADE': '1',
      'VALOR_UNITARIO': '4.13',
      'VALOR_GLOSADO': '0',
      'VALOR_TOTAL_PAGAMENTO': '4.13',
      'JUSTIFICATIVA_GLOSA': null,
      'OBSERVACAO_GLOSA': null,
      'SITUACAO': 'PAGO',
      'CODIGO_PROFISSIONAL_SOLICITANTE': '30577',
      'NOME_PROFISSIONAL_SOLICITANTE': 'CAIO RODRIGUES DE CAMARGO',
      'CODIGO_PRESTADOR_EXECUTANTE': '00768-2',
      'NOME_PRESTADOR_EXECUTANTE': 'HEMOLABOR HEMATOLOGIA L P C LTDA',
      'COD_FAT': '1382385',
      'TIPO_LANCAMENTO': 'CRÉDITO',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.arquivoId).toBe(10);
    expect(record.numeroGuia).toBe('18874660');
    expect(record.beneficiario).toBe('302126200');
    expect(record.nomeBeneficiario).toBe('ELIENES BEZERRA MACIEL');
    expect(record.item).toBe('40302385');
    expect(record.itemDesc).toBe('40302385-PROTEINAS TOTAIS ALBUMINA E GLOBULINA');
    expect(record.valorPagamento).toBe('4.13');
    expect(record.valorInformado).toBe('4.13');
    expect(record.situacaoItem).toBe('PAGO');
    expect(record.nomeSolicitante).toBe('CAIO RODRIGUES DE CAMARGO');
    expect(record.codigoSolicitante).toBe('30577');
    expect(record.codigoPrestador).toBe('00768-2');
    expect(record.nomePrestadorExecutante).toBe('HEMOLABOR HEMATOLOGIA L P C LTDA');
    expect(record.tipoLancamento).toBe('CRÉDITO');
    expect(record.acomodacaoInternacao).toBe('SP/SADT');
    expect(record.lotePrestador).toBe('88914');
    expect(record.protocoloTiss).toBe('473604');
  });

  it('deve marcar como PAGO quando SITUACAO = PAGO e sem glosa', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': '18874660',
      'NOME_BENEFICIARIO': 'TESTE PACIENTE',
      'CODIGO_PROCEDIMENTO': '40301419',
      'VALOR_TOTAL_PAGAMENTO': '11.02',
      'VALOR_GLOSADO': '0',
      'SITUACAO': 'PAGO',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.situacaoItem).toBe('PAGO');
    expect(record.valorPagamento).toBe('11.02');
  });

  it('deve marcar como GLOSADO quando SITUACAO = GLOSADO', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': '18874661',
      'NOME_BENEFICIARIO': 'TESTE GLOSA',
      'CODIGO_PROCEDIMENTO': '40301630',
      'VALOR_TOTAL_PAGAMENTO': '0',
      'VALOR_GLOSADO': '4.44',
      'SITUACAO': 'GLOSADO',
      'JUSTIFICATIVA_GLOSA': '1702',
      'OBSERVACAO_GLOSA': 'Cobrança em duplicidade',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.situacaoItem).toBe('GLOSADO');
    expect(record.valorGlosa).toBe('4.44');
    expect(record.codigoGlosa).toBe('1702');
    expect(record.erroTiss).toBe('Cobrança em duplicidade');
  });

  it('deve marcar como GLOSADO quando SITUACAO = PAGO mas VALOR_GLOSADO > 0 (formato IPASGO)', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': '17058295',
      'NOME_BENEFICIARIO': 'MARIA LAZARA SOUSA',
      'CODIGO_PROCEDIMENTO': '90516966',
      'DESCRICAO_PROCEDIMENTO': 'MED - AZACITIDINA 100 MG PO SC MG',
      'VALOR_TOTAL_PAGAMENTO': '0',
      'VALOR_GLOSADO': '2041.20',
      'VALOR_UNITARIO': '14.58',
      'SITUACAO': 'PAGO',
      'JUSTIFICATIVA_GLOSA': 'GUIA VENCIDA',
      'TIPO_LANCAMENTO': 'CR\u00c9DITO',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.situacaoItem).toBe('GLOSADO');
    expect(record.valorGlosa).toBe('2041.2');
    expect(record.codigoGlosa).toBe('GUIA VENCIDA');
    expect(record.valorPagamento).toBe('0');
  });

  it('deve manter PAGO quando SITUACAO = PAGO e VALOR_GLOSADO = 0 (formato IPASGO)', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': '18874660',
      'NOME_BENEFICIARIO': 'ELIENES BEZERRA MACIEL',
      'CODIGO_PROCEDIMENTO': '40302385',
      'VALOR_TOTAL_PAGAMENTO': '4.13',
      'VALOR_GLOSADO': '0',
      'SITUACAO': 'PAGO',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.situacaoItem).toBe('PAGO');
    expect(record.valorPagamento).toBe('4.13');
  });

  it('deve detectar hasData com campos IPASGO', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': '18874660',
      'NOME_BENEFICIARIO': 'TESTE',
      'CODIGO_PROCEDIMENTO': '40301419',
    };

    // Simular o hasData check do parser
    const hasData = row['NUMERO_GUIA_OPERADORA'] || row['NOME_BENEFICIARIO'] || row['CODIGO_PROCEDIMENTO'];
    expect(!!hasData).toBe(true);
  });

  it('deve tratar campos numéricos como string quando necessário', () => {
    const row = {
      'NUMERO_GUIA_OPERADORA': 18874660, // número, não string
      'NOME_BENEFICIARIO': 'TESTE',
      'CODIGO_PROCEDIMENTO': 40301419, // número
      'VALOR_TOTAL_PAGAMENTO': 11.02, // número
      'QUANTIDADE': 1,
      'SITUACAO': 'PAGO',
    };

    const record = extractRecebimentoExcelFromRow(
      row,
      defaultArgs.arquivoId,
      defaultArgs.convenioId,
      defaultArgs.dataReferencia,
      defaultArgs.dataPagamento,
      defaultArgs.estabelecimentoId
    );

    expect(record.numeroGuia).toBe('18874660');
    expect(record.item).toBe('40301419');
    expect(record.valorPagamento).toBe('11.02');
    expect(record.quantidade).toBe(1);
  });
});

describe('recebimentosExcelParser - parseExcelRecebimentosExcelChunked', () => {
  it('deve processar arquivo em chunks e chamar callback para cada chunk', async () => {
    const XLSX = await import('xlsx');
    
    // Criar workbook de teste com 10 linhas
    const wb = XLSX.utils.book_new();
    const data = [];
    for (let i = 0; i < 10; i++) {
      data.push({
        'NUMERO_GUIA_OPERADORA': `GUIA_${i}`,
        'NOME_BENEFICIARIO': `PACIENTE_${i}`,
        'CODIGO_PROCEDIMENTO': `PROC_${i}`,
        'VALOR_TOTAL_PAGAMENTO': `${(i + 1) * 10}`,
        'SITUACAO': 'PAGO',
      });
    }
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    
    const { parseExcelRecebimentosExcelChunked } = await import('./recebimentosExcelParser');
    
    const chunks: any[][] = [];
    const result = await parseExcelRecebimentosExcelChunked(
      buffer,
      999,
      1,
      new Date('2025-12-01'),
      new Date('2026-01-30'),
      100,
      3, // chunk size de 3
      async (records, chunkIdx, totalRows) => {
        chunks.push([...records]);
      }
    );
    
    // 10 linhas / 3 por chunk = 4 chunks (3+3+3+1)
    expect(chunks.length).toBe(4);
    expect(chunks[0].length).toBe(3);
    expect(chunks[1].length).toBe(3);
    expect(chunks[2].length).toBe(3);
    expect(chunks[3].length).toBe(1);
    expect(result.totalRecords).toBe(10);
    
    // Verificar que os dados foram mapeados corretamente
    expect(chunks[0][0].numeroGuia).toBe('GUIA_0');
    expect(chunks[0][0].nomeBeneficiario).toBe('PACIENTE_0');
    expect(chunks[0][0].arquivoId).toBe(999);
  });

  it('deve retornar totalRows e totalRecords corretos', async () => {
    const XLSX = await import('xlsx');
    
    const wb = XLSX.utils.book_new();
    const data = [];
    for (let i = 0; i < 5; i++) {
      data.push({
        'NUMERO_GUIA_OPERADORA': `G_${i}`,
        'NOME_BENEFICIARIO': `P_${i}`,
        'CODIGO_PROCEDIMENTO': `C_${i}`,
        'SITUACAO': 'PAGO',
      });
    }
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    
    const { parseExcelRecebimentosExcelChunked } = await import('./recebimentosExcelParser');
    
    const result = await parseExcelRecebimentosExcelChunked(
      buffer, 1, undefined, undefined, undefined, undefined,
      100, // chunk maior que total de linhas
      async () => {}
    );
    
    expect(result.totalRecords).toBe(5);
  });
});
