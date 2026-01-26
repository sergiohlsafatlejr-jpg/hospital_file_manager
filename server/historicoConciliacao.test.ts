import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as db from './db';

// Mock do banco de dados
vi.mock('./db', () => ({
  salvarResultadoConciliacao: vi.fn(),
  listarHistoricoConciliacoes: vi.fn(),
  getDetalhesConciliacao: vi.fn(),
  getDetalhesItemConciliacao: vi.fn(),
  excluirConciliacao: vi.fn(),
  getEvolucaoConciliacoes: vi.fn(),
}));

describe('Histórico de Conciliação Tasy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('salvarResultadoConciliacao', () => {
    it('deve salvar uma conciliação com sucesso', async () => {
      const mockResult = { id: 1, success: true };
      vi.mocked(db.salvarResultadoConciliacao).mockResolvedValue(mockResult);

      const dados = {
        estabelecimentoId: 1,
        convenioId: 1,
        mesReferencia: 1,
        anoReferencia: 2025,
        totalContas: 100,
        contasOk: 80,
        contasComGlosa: 10,
        contasDivergentes: 5,
        contasNaoEncontradas: 5,
        valorTotalTasy: 100000,
        valorTotalPago: 90000,
        valorTotalGlosado: 5000,
        valorDiferenca: 5000,
        percentualGlosa: 5,
        percentualRecebido: 90,
        userId: 1,
      };

      const itens = [
        {
          contaTasyId: 1,
          nrInternoConta: '12345',
          guia: 'G001',
          paciente: 'Paciente Teste',
          valorTasy: 1000,
          valorPago: 900,
          valorGlosado: 50,
          valorDiferenca: 50,
          statusConciliacao: 'glosa' as const,
          totalProcedimentos: 5,
          totalMatMed: 10,
        },
      ];

      const result = await db.salvarResultadoConciliacao(dados, itens, new Map());

      expect(result).toEqual(mockResult);
      expect(db.salvarResultadoConciliacao).toHaveBeenCalledWith(dados, itens, expect.any(Map));
    });

    it('deve retornar erro quando falha ao salvar', async () => {
      const mockResult = { id: 0, success: false };
      vi.mocked(db.salvarResultadoConciliacao).mockResolvedValue(mockResult);

      const dados = {
        estabelecimentoId: 1,
        totalContas: 0,
        contasOk: 0,
        contasComGlosa: 0,
        contasDivergentes: 0,
        contasNaoEncontradas: 0,
        valorTotalTasy: 0,
        valorTotalPago: 0,
        valorTotalGlosado: 0,
        valorDiferenca: 0,
        percentualGlosa: 0,
        percentualRecebido: 0,
        userId: 1,
      };

      const result = await db.salvarResultadoConciliacao(dados, [], new Map());

      expect(result.success).toBe(false);
    });
  });

  describe('listarHistoricoConciliacoes', () => {
    it('deve listar histórico de conciliações', async () => {
      const mockHistorico = [
        {
          id: 1,
          estabelecimentoId: 1,
          convenioId: 1,
          mesReferencia: 1,
          anoReferencia: 2025,
          totalContas: 100,
          contasOk: 80,
          contasComGlosa: 10,
          contasDivergentes: 5,
          contasNaoEncontradas: 5,
          valorTotalTasy: '100000.00',
          valorTotalPago: '90000.00',
          valorTotalGlosado: '5000.00',
          convenioNome: 'Convênio Teste',
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.listarHistoricoConciliacoes).mockResolvedValue(mockHistorico);

      const result = await db.listarHistoricoConciliacoes(1, { limite: 50 });

      expect(result).toEqual(mockHistorico);
      expect(result.length).toBe(1);
      expect(result[0].totalContas).toBe(100);
    });

    it('deve filtrar por mês e ano', async () => {
      vi.mocked(db.listarHistoricoConciliacoes).mockResolvedValue([]);

      await db.listarHistoricoConciliacoes(1, { mesReferencia: 6, anoReferencia: 2025 });

      expect(db.listarHistoricoConciliacoes).toHaveBeenCalledWith(1, {
        mesReferencia: 6,
        anoReferencia: 2025,
      });
    });
  });

  describe('getDetalhesConciliacao', () => {
    it('deve retornar detalhes de uma conciliação', async () => {
      const mockDetalhes = {
        resultado: {
          id: 1,
          totalContas: 100,
          valorTotalTasy: '100000.00',
        },
        itens: [
          {
            id: 1,
            contaTasyId: 1,
            nrInternoConta: '12345',
            guia: 'G001',
            paciente: 'Paciente Teste',
            statusConciliacao: 'ok',
          },
        ],
        total: 1,
      };

      vi.mocked(db.getDetalhesConciliacao).mockResolvedValue(mockDetalhes);

      const result = await db.getDetalhesConciliacao(1);

      expect(result).toEqual(mockDetalhes);
      expect(result.resultado).toBeDefined();
      expect(result.itens.length).toBe(1);
    });

    it('deve filtrar itens por status', async () => {
      vi.mocked(db.getDetalhesConciliacao).mockResolvedValue({
        resultado: { id: 1 },
        itens: [],
        total: 0,
      });

      await db.getDetalhesConciliacao(1, { statusConciliacao: 'glosa' });

      expect(db.getDetalhesConciliacao).toHaveBeenCalledWith(1, { statusConciliacao: 'glosa' });
    });
  });

  describe('excluirConciliacao', () => {
    it('deve excluir uma conciliação com sucesso', async () => {
      vi.mocked(db.excluirConciliacao).mockResolvedValue(true);

      const result = await db.excluirConciliacao(1);

      expect(result).toBe(true);
      expect(db.excluirConciliacao).toHaveBeenCalledWith(1);
    });

    it('deve retornar false quando falha ao excluir', async () => {
      vi.mocked(db.excluirConciliacao).mockResolvedValue(false);

      const result = await db.excluirConciliacao(999);

      expect(result).toBe(false);
    });
  });

  describe('getEvolucaoConciliacoes', () => {
    it('deve retornar evolução das conciliações', async () => {
      const mockEvolucao = [
        {
          mesReferencia: 1,
          anoReferencia: 2025,
          totalContas: 100,
          contasOk: 80,
          contasComGlosa: 10,
          valorTotalTasy: 100000,
          valorTotalPago: 90000,
          valorTotalGlosado: 5000,
        },
        {
          mesReferencia: 12,
          anoReferencia: 2024,
          totalContas: 90,
          contasOk: 70,
          contasComGlosa: 15,
          valorTotalTasy: 95000,
          valorTotalPago: 85000,
          valorTotalGlosado: 6000,
        },
      ];

      vi.mocked(db.getEvolucaoConciliacoes).mockResolvedValue(mockEvolucao);

      const result = await db.getEvolucaoConciliacoes(1, 6);

      expect(result).toEqual(mockEvolucao);
      expect(result.length).toBe(2);
    });
  });
});
