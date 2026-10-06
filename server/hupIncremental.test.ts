import { describe, expect, it } from 'vitest';
import { classificarNovosHop, conferirManifestoIncremental } from './hupIncremental';
import type { HopUrologicoRow } from './hopUrologicoMap';

function item(numatend: string, nomepac = 'Paciente fictício'): HopUrologicoRow {
  return {
    numatend, codtipsai: 'A', nomeplaco: 'Convênio fictício', nomepac,
    carater: 'E', datatend: '2026-10-01 12:30:00', datasai: null,
    tipoatend: 'I', codserv: '01', procprin: '02', codcc_destino: '03',
    tipoatendimentodescricao: 'Internação', Estabelecimentos_id: '1260036',
  };
}

describe('atendimentos HUP: inserir só novos', () => {
  it('mantém os existentes e os ausentes e separa somente chaves novas', () => {
    const resultado = classificarNovosHop([item('101', 'Nome alterado'), item('102')], ['101', '100']);
    expect(resultado.total).toBe(2);
    expect(resultado.novos.map(r => r.origemId)).toEqual(['102']);
    expect(resultado.jaExistentes).toBe(1);
    expect(resultado.antigosAusentesNaFonte).toBe(1);
    expect(resultado.novos[0]).toMatchObject({ estabelecimentoId: 1260036, origemSistema: 'WARLEINE', ativoNaFonte: 1 });
  });

  it('é idempotente se as chaves já estiverem no destino', () => {
    const resultado = classificarNovosHop([item('101'), item('102')], ['101', '102']);
    expect(resultado.novos).toHaveLength(0);
    expect(resultado.antigosAusentesNaFonte).toBe(0);
  });

  it('rejeita duplicação, unidade errada e destino com chaves duplicadas', () => {
    expect(() => classificarNovosHop([item('101'), item('101')], [])).toThrow();
    expect(() => classificarNovosHop([{ ...item('101'), Estabelecimentos_id: '999' }], [])).toThrow();
    expect(() => classificarNovosHop([item('101')], ['100', '100'])).toThrow();
  });

  it('rejeita manifesto defasado, novos divergentes ou job legado ativo', () => {
    const base = { total: 2, sha256: 'a'.repeat(64), novos: 1, esperadoTotal: 2,
      esperadoSha256: 'a'.repeat(64), esperadoNovos: 1, jobsLegadosAtivos: 0 };
    expect(() => conferirManifestoIncremental(base)).not.toThrow();
    expect(() => conferirManifestoIncremental({ ...base, esperadoNovos: 2 })).toThrow();
    expect(() => conferirManifestoIncremental({ ...base, esperadoSha256: 'b'.repeat(64) })).toThrow();
    expect(() => conferirManifestoIncremental({ ...base, jobsLegadosAtivos: 1 })).toThrow();
  });
});
