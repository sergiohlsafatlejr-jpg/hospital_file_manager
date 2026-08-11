import { describe, expect, it } from 'vitest';
import { obterGuiasCandidatas } from './faturamentoUnificadoService';
import { selecionarNumeroGuiaRetorno } from './syncDemonstrativo';

describe('Conciliação CASSI - variantes de guia', () => {
  it('deve preservar no demonstrativo a guia da operadora quando o XML informa as duas guias', () => {
    const guia = selecionarNumeroGuiaRetorno({
      numeroGuiaOperadora: 'CASSI-OPERADORA-987',
      numeroGuiaPrestador: 'PRESTADOR-123',
    });

    expect(guia).toBe('CASSI-OPERADORA-987');
  });

  it('deve usar a guia do prestador quando a guia da operadora não existe', () => {
    const guia = selecionarNumeroGuiaRetorno({
      numeroGuiaOperadora: null,
      numeroGuiaPrestador: ' PRESTADOR-123 ',
    });

    expect(guia).toBe('PRESTADOR-123');
  });

  it('deve tentar operadora, prestador e conta nessa ordem', () => {
    const guias = obterGuiasCandidatas({
      numeroGuiaOperadora: 'OPERADORA-1',
      numeroGuia: 'PRESTADOR-2',
      contaNumero: 'CONTA-3',
    });

    expect(guias).toEqual(['OPERADORA-1', 'PRESTADOR-2', 'CONTA-3']);
  });

  it('deve remover duplicidades e valores vazios sem perder o fallback', () => {
    const guias = obterGuiasCandidatas({
      numeroGuiaOperadora: ' GUIA-ÚNICA ',
      numeroGuia: 'GUIA-ÚNICA',
      contaNumero: '',
    });

    expect(guias).toEqual(['GUIA-ÚNICA']);
  });
});

