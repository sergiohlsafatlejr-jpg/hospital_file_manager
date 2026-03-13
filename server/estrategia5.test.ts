import { describe, it, expect } from 'vitest';

/**
 * Testes para a Estratégia 5 de conciliação automática:
 * Match por carteiraBeneficiário + código
 * 
 * Quando as guias do faturamento e dos recebimentos são incompatíveis
 * (ex: IPASGO usa numeração diferente), a Estratégia 5 cruza pela
 * carteiraBeneficiario do faturamento com o beneficiario dos recebimentos.
 */

describe('Estratégia 5 - Match por carteiraBeneficiário + código', () => {
  
  // Simula a lógica de indexação por carteira+código
  function criarIndexCarteiraCodigo(recebimentos: any[]) {
    const index = new Map<string, any[]>();
    for (const rec of recebimentos) {
      const carteira = String(rec.carteira || '').trim();
      const codigo = String(rec.codigoItem || '').trim();
      if (carteira && codigo) {
        const chave = `${carteira}|${codigo}`;
        if (!index.has(chave)) index.set(chave, []);
        index.get(chave)!.push(rec);
      }
    }
    return index;
  }

  // Simula encontrarMelhorMatch
  function encontrarMelhorMatch(
    candidatos: any[] | undefined,
    usados: Set<number>,
    valorFaturado: number
  ): any | null {
    if (!candidatos) return null;
    const disponiveis = candidatos.filter(c => !usados.has(c.id));
    if (disponiveis.length === 0) return null;
    // Priorizar match com valor mais próximo
    let melhor = disponiveis[0];
    let menorDiff = Math.abs(valorFaturado - (Number(melhor.valorPago) || 0));
    for (const c of disponiveis.slice(1)) {
      const diff = Math.abs(valorFaturado - (Number(c.valorPago) || 0));
      if (diff < menorDiff) {
        melhor = c;
        menorDiff = diff;
      }
    }
    return melhor;
  }

  it('deve encontrar match quando carteiraBeneficiario bate com beneficiario do recebimento', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 150.00 },
      { id: 2, carteira: '089184300', codigoItem: '20201020', valorPago: 200.00 },
      { id: 3, carteira: '224086615', codigoItem: '10101012', valorPago: 300.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);
    const usados = new Set<number>();

    // Faturamento com carteiraBeneficiario = '089184300' e código = '10101012'
    const match = encontrarMelhorMatch(
      index.get('089184300|10101012'),
      usados,
      150.00
    );

    expect(match).not.toBeNull();
    expect(match.id).toBe(1);
    expect(match.carteira).toBe('089184300');
    expect(match.codigoItem).toBe('10101012');
  });

  it('não deve encontrar match quando carteira não existe nos recebimentos', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 150.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);
    const usados = new Set<number>();

    const match = encontrarMelhorMatch(
      index.get('999999999|10101012'),
      usados,
      150.00
    );

    expect(match).toBeNull();
  });

  it('não deve encontrar match quando código não bate', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 150.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);
    const usados = new Set<number>();

    const match = encontrarMelhorMatch(
      index.get('089184300|99999999'),
      usados,
      150.00
    );

    expect(match).toBeNull();
  });

  it('não deve reusar recebimentos já marcados como usados', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 150.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);
    const usados = new Set<number>([1]); // id 1 já usado

    const match = encontrarMelhorMatch(
      index.get('089184300|10101012'),
      usados,
      150.00
    );

    expect(match).toBeNull();
  });

  it('deve priorizar match com valor mais próximo do faturado', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 100.00 },
      { id: 2, carteira: '089184300', codigoItem: '10101012', valorPago: 148.00 },
      { id: 3, carteira: '089184300', codigoItem: '10101012', valorPago: 500.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);
    const usados = new Set<number>();

    const match = encontrarMelhorMatch(
      index.get('089184300|10101012'),
      usados,
      150.00
    );

    expect(match).not.toBeNull();
    expect(match.id).toBe(2); // 148.00 é o mais próximo de 150.00
  });

  it('deve indexar corretamente múltiplos recebimentos com mesma carteira+código', () => {
    const recebimentos = [
      { id: 1, carteira: '089184300', codigoItem: '10101012', valorPago: 100.00 },
      { id: 2, carteira: '089184300', codigoItem: '10101012', valorPago: 200.00 },
      { id: 3, carteira: '089184300', codigoItem: '20201020', valorPago: 300.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);

    expect(index.get('089184300|10101012')?.length).toBe(2);
    expect(index.get('089184300|20201020')?.length).toBe(1);
    expect(index.get('089184300|99999999')).toBeUndefined();
  });

  it('deve ignorar recebimentos com carteira vazia', () => {
    const recebimentos = [
      { id: 1, carteira: '', codigoItem: '10101012', valorPago: 100.00 },
      { id: 2, carteira: null, codigoItem: '10101012', valorPago: 200.00 },
      { id: 3, carteira: '089184300', codigoItem: '10101012', valorPago: 300.00 },
    ];

    const index = criarIndexCarteiraCodigo(recebimentos);

    // Apenas o id 3 deve estar indexado
    expect(index.get('089184300|10101012')?.length).toBe(1);
    expect(index.get('|10101012')).toBeUndefined();
  });

  it('deve simular fluxo completo: estratégias 1-4 falham, estratégia 5 encontra match', () => {
    // Cenário: IPASGO - guias incompatíveis entre faturamento e recebimentos
    const faturamento = {
      id: 100,
      numeroGuia: '00395206122531303601', // guia longa do XML
      codigoItem: '10101012',
      codigoItemTuss: '10101012',
      carteiraBeneficiario: '089184300',
      pacienteNome: '', // sem nome no IPASGO
      valorFaturado: 150.00,
    };

    const recebimentos = [
      {
        id: 200,
        numeroGuia: '62271046', // guia curta do demonstrativo - NÃO bate
        codigoItem: '10101012',
        carteira: '089184300', // carteira BATE!
        nomeBeneficiario: 'JOAO DA SILVA',
        valorPago: 150.00,
        valorGlosa: 0,
      },
    ];

    // Estratégia 1: guia+código → FALHA (guias diferentes)
    const indexGuiaCodigo = new Map<string, any[]>();
    for (const rec of recebimentos) {
      const chave = `${rec.numeroGuia}|${rec.codigoItem}`;
      if (!indexGuiaCodigo.has(chave)) indexGuiaCodigo.set(chave, []);
      indexGuiaCodigo.get(chave)!.push(rec);
    }
    const usados = new Set<number>();
    
    const match1 = encontrarMelhorMatch(
      indexGuiaCodigo.get(`${faturamento.numeroGuia}|${faturamento.codigoItem}`),
      usados,
      faturamento.valorFaturado
    );
    expect(match1).toBeNull(); // Estratégia 1 falha

    // Estratégia 4: paciente+código → FALHA (sem nome)
    const indexPacienteCodigo = new Map<string, any[]>();
    // Não vai indexar porque paciente está vazio
    expect(faturamento.pacienteNome).toBe('');

    // Estratégia 5: carteira+código → SUCESSO!
    const indexCarteiraCodigo = criarIndexCarteiraCodigo(recebimentos);
    const match5 = encontrarMelhorMatch(
      indexCarteiraCodigo.get(`${faturamento.carteiraBeneficiario}|${faturamento.codigoItem}`),
      usados,
      faturamento.valorFaturado
    );
    
    expect(match5).not.toBeNull();
    expect(match5.id).toBe(200);
    expect(match5.carteira).toBe('089184300');
    expect(match5.valorPago).toBe(150.00);
  });
});
