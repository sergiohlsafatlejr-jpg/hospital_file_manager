import { describe, expect, it } from 'vitest';
import { getConciliacaoStatusLabel } from '../client/src/lib/conciliacaoStatus';

describe('getConciliacaoStatusLabel', () => {
  it('mostra Associado após confirmação manual de glosa', () => {
    expect(getConciliacaoStatusLabel('glosado', {
      statusConciliacao: 'glosado',
      metodoConciliacao: 'manual_confirmacao',
    })).toBe('Associado');
  });

  it('mostra Associado para glosa total ou parcial localizada no retorno', () => {
    expect(getConciliacaoStatusLabel('glosa_total')).toBe('Associado');
    expect(getConciliacaoStatusLabel('glosa_parcial')).toBe('Associado');
  });

  it('mantém item 9999 sem confirmação como Desassociado', () => {
    expect(getConciliacaoStatusLabel('glosa_total', { codigoGlosa: '9999' })).toBe('Desassociado');
  });

  it('mostra Associado para item 9999 já vinculado', () => {
    expect(getConciliacaoStatusLabel('glosa_total', {
      codigoGlosa: '9999',
      metodoConciliacao: 'manual',
    })).toBe('Associado');
  });

  it('não retorna Glosado como status visual', () => {
    expect(['Associado', 'Desassociado']).toContain(getConciliacaoStatusLabel('glosado'));
  });
});
