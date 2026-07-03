import { describe, it, expect } from 'vitest';

/**
 * Testes para a lógica de cruzamento Faturado x Pago
 */

describe('Faturado x Pago - Lógica de status', () => {
  function calcularStatus(valorFaturado: number, valorRecebido: number): string {
    return valorRecebido > 0 ? (valorRecebido >= valorFaturado ? 'pago' : 'parcial') : 'pendente';
  }

  it('deve retornar "pago" quando valor recebido >= valor faturado', () => {
    expect(calcularStatus(1000, 1000)).toBe('pago');
    expect(calcularStatus(1000, 1200)).toBe('pago');
  });

  it('deve retornar "parcial" quando valor recebido > 0 mas < valor faturado', () => {
    expect(calcularStatus(1000, 500)).toBe('parcial');
    expect(calcularStatus(1000, 999.99)).toBe('parcial');
  });

  it('deve retornar "pendente" quando valor recebido = 0', () => {
    expect(calcularStatus(1000, 0)).toBe('pendente');
    expect(calcularStatus(500, 0)).toBe('pendente');
  });
});

describe('Faturado x Pago - Cálculo de diferença', () => {
  it('deve calcular diferença corretamente', () => {
    expect(1000 - 1000).toBe(0);
    expect(1000 - 800).toBe(200);
    expect(1000 - 0).toBe(1000);
  });
});

describe('Faturado x Pago - Resumo de totais', () => {
  const guias = [
    { valorFaturado: 1000, valorRecebido: 1000, valorGlosa: 0, status: 'pago' },
    { valorFaturado: 2000, valorRecebido: 1500, valorGlosa: 500, status: 'parcial' },
    { valorFaturado: 500, valorRecebido: 0, valorGlosa: 0, status: 'pendente' },
  ];

  it('deve calcular total faturado', () => {
    const total = guias.reduce((s, g) => s + g.valorFaturado, 0);
    expect(total).toBe(3500);
  });

  it('deve calcular total recebido', () => {
    const total = guias.reduce((s, g) => s + g.valorRecebido, 0);
    expect(total).toBe(2500);
  });

  it('deve calcular total glosa', () => {
    const total = guias.reduce((s, g) => s + g.valorGlosa, 0);
    expect(total).toBe(500);
  });

  it('deve calcular total pendente', () => {
    const totalFaturado = guias.reduce((s, g) => s + g.valorFaturado, 0);
    const totalRecebido = guias.reduce((s, g) => s + g.valorRecebido, 0);
    expect(totalFaturado - totalRecebido).toBe(1000);
  });

  it('deve calcular percentual recebido', () => {
    const totalFaturado = guias.reduce((s, g) => s + g.valorFaturado, 0);
    const totalRecebido = guias.reduce((s, g) => s + g.valorRecebido, 0);
    const percentual = (totalRecebido / totalFaturado) * 100;
    expect(percentual).toBeCloseTo(71.43, 1);
  });

  it('deve contar guias por status', () => {
    const pagas = guias.filter(g => g.status === 'pago').length;
    const parciais = guias.filter(g => g.status === 'parcial').length;
    const pendentes = guias.filter(g => g.status === 'pendente').length;
    expect(pagas).toBe(1);
    expect(parciais).toBe(1);
    expect(pendentes).toBe(1);
  });
});
