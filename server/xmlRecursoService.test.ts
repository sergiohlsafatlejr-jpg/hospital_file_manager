/**
 * Testes para o serviço de geração de XML de recurso de glosa
 * O XML agora inclui TODOS os itens da guia (pagos e glosados)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do banco de dados
const mockExecute = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelectWhere = vi.fn();

vi.mock('./db', () => ({
  getDb: vi.fn().mockResolvedValue({
    execute: (...args: any[]) => mockExecute(...args),
    select: () => ({
      from: () => ({
        where: (...args: any[]) => mockSelectWhere(...args),
      }),
    }),
  }),
}));

// Mock do storage
vi.mock('./storage', () => ({
  storagePut: vi.fn().mockResolvedValue({
    url: 'https://storage.example.com/xml-recursos/test.xml',
    key: 'xml-recursos/test.xml',
  }),
}));

// Mock do schema import
vi.mock('../drizzle/schema', () => ({
  convenioEstabelecimentoPrestador: {
    codigoPrestador: 'codigoPrestador',
    estabelecimentoId: 'estabelecimentoId',
  },
}));

import { gerarXmlRecurso, guiasGlosadasDisponiveis, listarXmlsGerados, downloadXmlRecurso } from './xmlRecursoService';

describe('xmlRecursoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: retornar lista vazia para códigos de prestador (sem filtro de terceiros)
    mockSelectWhere.mockResolvedValue([]);
  });

  describe('gerarXmlRecurso', () => {
    it('deve lançar erro quando não há itens encontrados', async () => {
      // Mock: passo 0 - reset marcação XML
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        // Mock: retorna vazio para itens
        .mockResolvedValueOnce([[]])  // buscarDadosGuiasCompletas - itens
        ;

      await expect(
        gerarXmlRecurso({
          estabelecimentoId: 6,
          guias: ['99999999'],
        })
      ).rejects.toThrow('Nenhum item encontrado');
    });

    it('deve gerar XML com TODOS os itens da guia (pagos e glosados)', async () => {
      // Mock: passo 0 - reset marcação XML
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        // Mock: TODOS os itens da guia (pagos + glosados)
        .mockResolvedValueOnce([[
          {
            id: 1,
            numeroGuia: '18414424',
            codigoItem: '10101012',
            descricaoItem: 'CONSULTA MEDICA',
            tipoItem: 'Procedimento',
            dataExecucao: '2025-12-01',
            valorFaturado: 100.00,
            valorPago: 100.00,
            valorGlosa: 0,
            quantidade: 1,
            competencia: '2025-12',
            convenio: 'IPASGO',
            convenioId: 1,
            statusConciliacao: 'conciliado',
            codigoGlosa: null,
            motivoGlosa: null,
            pacienteNome: 'MARIA ABADIA DOS SANTOS',
            codigoPrestadorExecutante: null,
          },
          {
            id: 2,
            numeroGuia: '18414424',
            codigoItem: '30101012',
            descricaoItem: 'HEMOGRAMA',
            tipoItem: 'Procedimento',
            dataExecucao: '2025-12-01',
            valorFaturado: 50.00,
            valorPago: 0,
            valorGlosa: 50.00,
            quantidade: 1,
            competencia: '2025-12',
            convenio: 'IPASGO',
            convenioId: 1,
            statusConciliacao: 'glosado',
            codigoGlosa: '1015',
            motivoGlosa: 'Item não recebido no demonstrativo',
            pacienteNome: 'MARIA ABADIA DOS SANTOS',
            codigoPrestadorExecutante: null,
          },
          {
            id: 3,
            numeroGuia: '18414424',
            codigoItem: '20104294',
            descricaoItem: 'TERAPIA ONCOLOGICA',
            tipoItem: 'Procedimento',
            dataExecucao: '2025-12-01',
            valorFaturado: 200.00,
            valorPago: 200.00,
            valorGlosa: 0,
            quantidade: 1,
            competencia: '2025-12',
            convenio: 'IPASGO',
            convenioId: 1,
            statusConciliacao: 'conciliado',
            codigoGlosa: null,
            motivoGlosa: null,
            pacienteNome: 'MARIA ABADIA DOS SANTOS',
            codigoPrestadorExecutante: null,
          },
        ]])
        // Mock: dados do faturamento_unificado
        .mockResolvedValueOnce([[
          {
            numeroGuia: '18414424',
            numeroGuiaOperadora: '018414424',
            senha: 'ABC123',
            pacienteNome: 'MARIA ABADIA DOS SANTOS',
            carteiraBeneficiario: '0012345678',
            protocolo: 'PROT001',
            lotePrestador: 'LOTE001',
            dataInicioFat: '2025-12-01',
            dataFimFat: '2025-12-15',
          },
        ]])
        // Mock: faturamento_tiss codigo_tabela
        .mockResolvedValueOnce([[
          { numeroGuia: '18414424', codigoItem: '10101012', codigoTabela: '04' },
          { numeroGuia: '18414424', codigoItem: '30101012', codigoTabela: '04' },
          { numeroGuia: '18414424', codigoItem: '20104294', codigoTabela: '04' },
        ]])
        // Mock: buscarDadosPrestador
        .mockResolvedValueOnce([[
          { nome: 'HEMOLABOR LTDA', cnpj: '01.234.567/0001-89' },
        ]])
        // Mock: buscarDadosConvenio
        .mockResolvedValueOnce([[
          { nome: 'IPASGO', codigo: '346659' },
        ]])
        // Mock: convenioEstabelecimentoPrestador (buscarDadosConvenio)
        .mockResolvedValueOnce([[
          { codigoPrestador: 'PREST001' },
        ]])
        // Mock: lotePrestador query (step 4)
        .mockResolvedValueOnce([[
          { lotePrestador: 'LOTE001' },
        ]])
        // Mock: INSERT xml_recursos_gerados
        .mockResolvedValueOnce([{ insertId: 1 }])
        // Mock: UPDATE conciliados_automatico (marca todos os itens, não só glosados)
        .mockResolvedValueOnce([{ affectedRows: 3 }]);

      const result = await gerarXmlRecurso({
        estabelecimentoId: 6,
        guias: ['18414424'],
        convenioId: 1,
        registroANS: '346659',
        cnpjOperadora: '01234567000100',
      });

      // Deve incluir TODOS os 3 itens (2 pagos + 1 glosado)
      expect(result.totalGuias).toBe(1);
      expect(result.totalItens).toBe(3);
      expect(result.totalItensGlosados).toBe(1);
      expect(result.valorTotalGlosado).toBe(50.00);
      expect(result.valorTotalFaturado).toBe(350.00);
      expect(result.xmlUrl).toBe('https://storage.example.com/xml-recursos/test.xml');
      expect(result.nomeArquivo).toContain('recurso_guia_18414424');
    });

    it('deve gerar XML em lote para múltiplas guias com todos os itens', async () => {
      // Mock: passo 0 - reset marcação XML
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        // Mock: todos os itens de 2 guias
        .mockResolvedValueOnce([[
          {
            id: 1, numeroGuia: '18414424', codigoItem: '10101012',
            descricaoItem: 'CONSULTA', tipoItem: 'Procedimento',
            dataExecucao: '2025-12-01', valorFaturado: 100, valorPago: 100,
            valorGlosa: 0, quantidade: 1, competencia: '2025-12',
            convenio: 'IPASGO', convenioId: 1, statusConciliacao: 'conciliado',
            codigoGlosa: null, motivoGlosa: null, pacienteNome: 'MARIA',
            codigoPrestadorExecutante: null,
          },
          {
            id: 2, numeroGuia: '18414424', codigoItem: '30101012',
            descricaoItem: 'HEMOGRAMA', tipoItem: 'Procedimento',
            dataExecucao: '2025-12-01', valorFaturado: 50, valorPago: 0,
            valorGlosa: 50, quantidade: 1, competencia: '2025-12',
            convenio: 'IPASGO', convenioId: 1, statusConciliacao: 'glosado',
            codigoGlosa: '1015', motivoGlosa: 'Item não recebido', pacienteNome: 'MARIA',
            codigoPrestadorExecutante: null,
          },
          {
            id: 3, numeroGuia: '18560945', codigoItem: '20101012',
            descricaoItem: 'EXAME', tipoItem: 'Procedimento',
            dataExecucao: '2025-12-05', valorFaturado: 80, valorPago: 0,
            valorGlosa: 80, quantidade: 1, competencia: '2025-12',
            convenio: 'IPASGO', convenioId: 1, statusConciliacao: 'glosado',
            codigoGlosa: '2001', motivoGlosa: 'Procedimento não autorizado', pacienteNome: 'JOAO',
            codigoPrestadorExecutante: null,
          },
        ]])
        .mockResolvedValueOnce([[
          { numeroGuia: '18414424', numeroGuiaOperadora: '018414424', senha: null, pacienteNome: 'MARIA', carteiraBeneficiario: null, protocolo: null, lotePrestador: 'LOTE1', dataInicioFat: '2025-12-01', dataFimFat: '2025-12-01' },
          { numeroGuia: '18560945', numeroGuiaOperadora: '018560945', senha: null, pacienteNome: 'JOAO', carteiraBeneficiario: null, protocolo: null, lotePrestador: 'LOTE1', dataInicioFat: '2025-12-05', dataFimFat: '2025-12-05' },
        ]])
        .mockResolvedValueOnce([[]])  // faturamento_tiss
        .mockResolvedValueOnce([[ { nome: 'HEMOLABOR', cnpj: '01234567000189' } ]])  // prestador
        .mockResolvedValueOnce([[ { nome: 'IPASGO', codigo: '346659' } ]])  // convênio
        .mockResolvedValueOnce([[ { codigoPrestador: 'P001' } ]])  // cep
        .mockResolvedValueOnce([[ { lotePrestador: 'LOTE1' } ]])  // lotePrestador query
        .mockResolvedValueOnce([{ insertId: 2 }])  // INSERT
        .mockResolvedValueOnce([{ affectedRows: 3 }]);  // UPDATE

      const result = await gerarXmlRecurso({
        estabelecimentoId: 6,
        guias: ['18414424', '18560945'],
        convenioId: 1,
      });

      expect(result.totalGuias).toBe(2);
      expect(result.totalItens).toBe(3); // 2 itens guia 1 + 1 item guia 2
      expect(result.totalItensGlosados).toBe(2); // 1 glosado guia 1 + 1 glosado guia 2
      expect(result.valorTotalGlosado).toBe(130.00);
      expect(result.nomeArquivo).toContain('recurso_lote_2guias');
    });
  });

  describe('guiasGlosadasDisponiveis', () => {
    it('deve retornar guias pagas com itens glosados incluindo totais de todos os itens', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[
          {
            numeroGuia: '18414424',
            convenio: 'IPASGO',
            convenioId: 1,
            competencia: '2025-12',
            pacienteNome: 'MARIA',
            totalItens: 10,
            totalItensGlosados: 3,
            valorFaturado: 1000,
            valorPago: 700,
            valorGlosa: 300,
            xmlGerado: 0,
            xmlGeradoEm: null,
            xmlLoteId: null,
            loteXml: 'LOTE001',
            protocoloXml: 'PROT001',
            loteRetorno: null,
            protocoloRetorno: null,
            codigoPrestadorExecutante: null,
          },
        ]]);

      const result = await guiasGlosadasDisponiveis({
        estabelecimentoId: 6,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].numeroGuia).toBe('18414424');
      expect(result.items[0].totalItens).toBe(10);
      expect(result.items[0].totalItensGlosados).toBe(3);
      expect(result.items[0].valorGlosa).toBe(300);
    });

    it('deve filtrar apenas não geradas quando solicitado', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ total: 1 }]])
        .mockResolvedValueOnce([[
          {
            numeroGuia: '18414424', convenio: 'IPASGO', convenioId: 1,
            competencia: '2025-12', pacienteNome: 'MARIA', totalItens: 5,
            totalItensGlosados: 2, valorFaturado: 500, valorPago: 300,
            valorGlosa: 200, xmlGerado: 0, xmlGeradoEm: null, xmlLoteId: null,
            loteXml: null, protocoloXml: null, loteRetorno: null, protocoloRetorno: null,
            codigoPrestadorExecutante: null,
          },
        ]]);

      const result = await guiasGlosadasDisponiveis({
        estabelecimentoId: 6,
        apenasNaoGeradas: true,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].numeroGuia).toBe('18414424');
    });
  });

  describe('listarXmlsGerados', () => {
    it('deve retornar lista de XMLs gerados', async () => {
      mockExecute
        .mockResolvedValueOnce([[ { total: 2 } ]])  // COUNT
        .mockResolvedValueOnce([[
          { id: 1, nomeArquivo: 'recurso_guia_123.xml', convenioNome: 'IPASGO', tipo: 'individual', totalGuias: 1, totalItens: 10, valorTotalGlosado: 500, createdAt: new Date() },
          { id: 2, nomeArquivo: 'recurso_lote_3guias.xml', convenioNome: 'IPASGO', tipo: 'lote', totalGuias: 3, totalItens: 30, valorTotalGlosado: 1500, createdAt: new Date() },
        ]]);

      const result = await listarXmlsGerados({
        estabelecimentoId: 6,
      });

      expect(result.total).toBe(2);
      expect(result.registros).toHaveLength(2);
      expect(result.registros[0].tipo).toBe('individual');
      expect(result.registros[1].tipo).toBe('lote');
    });
  });

  describe('downloadXmlRecurso', () => {
    it('deve retornar URL e nome do arquivo', async () => {
      mockExecute.mockResolvedValueOnce([[
        { xmlUrl: 'https://storage.example.com/test.xml', nomeArquivo: 'recurso_guia_123.xml' },
      ]]);

      const result = await downloadXmlRecurso(1);

      expect(result.url).toBe('https://storage.example.com/test.xml');
      expect(result.nomeArquivo).toBe('recurso_guia_123.xml');
    });

    it('deve lançar erro quando registro não encontrado', async () => {
      mockExecute.mockResolvedValueOnce([[]]);

      await expect(downloadXmlRecurso(999)).rejects.toThrow('Registro de XML não encontrado');
    });
  });
});
