import { describe, it, expect } from 'vitest';
import { enriquecerCodigoGlosa } from './db';

describe('enriquecerCodigoGlosa', () => {
  it('deve retornar descricao simplificada para codigo valido', () => {
    const resultado = enriquecerCodigoGlosa('1001');
    expect(resultado).toBe('Carteirinha inválida');
  });

  it('deve retornar descricao simplificada para codigo com sufixo', () => {
    const resultado = enriquecerCodigoGlosa('1001-Carteira inválida');
    expect(resultado).toBe('Carteirinha inválida');
  });

  it('deve retornar descricao simplificada para outro codigo valido', () => {
    const resultado = enriquecerCodigoGlosa('1003');
    expect(resultado).toBe('Atendimento antes da inclusão no plano');
  });

  it('deve retornar codigo original para codigo invalido', () => {
    const resultado = enriquecerCodigoGlosa('9999');
    expect(resultado).toBe('9999');
  });

  it('deve retornar "Nao informado" para string vazia', () => {
    const resultado = enriquecerCodigoGlosa('');
    expect(resultado).toBe('Nao informado');
  });

  it('deve extrair codigo numerico corretamente', () => {
    const resultado = enriquecerCodigoGlosa('1005-Atendimento anterior');
    expect(resultado).toBe('Atendimento antes da inclusão no plano');
  });
});
