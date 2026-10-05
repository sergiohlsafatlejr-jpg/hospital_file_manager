import { describe, expect, it } from 'vitest';
import { HUP_ESTABELECIMENTO_ID, mapearHopUrologico, validarElegibilidadePrimeiraCarga, validarSnapshotHop, type HopUrologicoRow } from './hopUrologicoMap';

const BASE: HopUrologicoRow = {
  numatend: 12345, codtipsai: 'A', nomeplaco: 'Convenio Exemplo', nomepac: 'Paciente Ficticio',
  carater: 'E', datatend: '2026-10-25 13:00:00', datasai: null, tipoatend: 'I',
  codserv: 'S1', procprin: 'P1', codcc_destino: null,
  tipoatendimentodescricao: 'INTERNAÇÃO', Estabelecimentos_id: String(HUP_ESTABELECIMENTO_ID),
};

describe('publicação inicial do Hop HUP', () => {
  it('mapeia as colunas brutas sem inventar valor, título ou etapa e mantém a data civil', () => {
    const x = mapearHopUrologico(BASE);
    expect(x).toMatchObject({ estabelecimentoId: HUP_ESTABELECIMENTO_ID,
      origemSistema: 'WARLEINE', origemId: '12345', numero_atendimento: '12345',
      codigo_saida: 'A', data_entrada: '2026-10-25 13:00:00', data_saida: null,
      codigo_servico: 'S1', ativoNaFonte: 1 });
    expect('valorConta' in x).toBe(false);
    expect('etapaConta' in x).toBe(false);
  });
  it('rejeita mistura de estabelecimentos, chave nula e duplicidade antes da escrita', () => {
    expect(() => mapearHopUrologico({ ...BASE, Estabelecimentos_id: '3' })).toThrow(/fora do estabelecimento/);
    expect(() => mapearHopUrologico({ ...BASE, numatend: null })).toThrow(/Número/);
    expect(() => validarSnapshotHop([BASE, BASE])).toThrow(/repetido/);
  });
  it('rejeita truncamento, ausência de data, data impossível e vazio', () => {
    expect(() => mapearHopUrologico({ ...BASE, tipoatendimentodescricao: 'a'.repeat(256) })).toThrow(/excede/);
    expect(() => mapearHopUrologico({ ...BASE, datatend: null })).toThrow(/Data de entrada/);
    expect(() => mapearHopUrologico({ ...BASE, datatend: '2026-02-30 14:00:00' })).toThrow(/Data inválida/);
    expect(() => validarSnapshotHop([])).toThrow(/vazio/);
  });
  it('gera fingerprint independente da ordem, sensível ao conteúdo', () => {
    const segunda = { ...BASE, numatend: 43210 };
    const a = validarSnapshotHop([BASE, segunda]);
    expect(a.total).toBe(2);
    expect(a.sha256).toBe(validarSnapshotHop([segunda, BASE]).sha256);
    expect(a.sha256).not.toBe(validarSnapshotHop([BASE, { ...segunda, codserv: 'S2' }]).sha256);
  });
  it('não executa a primeira carga se job antigo estiver ativo, destino não vazio ou snapshot mudado', () => {
    const base = { total: 1, sha256: 'a'.repeat(64), esperadoTotal: 1,
      esperadoSha256: 'a'.repeat(64), destinoExistente: 0, jobsLegadosAtivos: 0 };
    expect(() => validarElegibilidadePrimeiraCarga(base)).not.toThrow();
    expect(() => validarElegibilidadePrimeiraCarga({ ...base, jobsLegadosAtivos: 1 })).toThrow(/Job Warleine/);
    expect(() => validarElegibilidadePrimeiraCarga({ ...base, destinoExistente: 1 })).toThrow(/destino Urológico vazio/);
    expect(() => validarElegibilidadePrimeiraCarga({ ...base, esperadoTotal: 2 })).toThrow(/difere da prévia/);
    expect(() => validarElegibilidadePrimeiraCarga({ ...base, esperadoSha256: 'b'.repeat(64) })).toThrow(/difere da prévia/);
  });
  it('preserva chave grande como string e rejeita Number impreciso ou coluna ausente', () => {
    expect(mapearHopUrologico({ ...BASE, numatend: '9007199254740993' }).origemId).toBe('9007199254740993');
    expect(() => mapearHopUrologico({ ...BASE, numatend: 9007199254740993 })).toThrow(/faixa segura/);
    expect(() => mapearHopUrologico({ ...BASE, codserv: undefined as unknown as string })).toThrow(/Layout bruto/);
    const a = { ...BASE, numatend: '9007199254740993' };
    const b = { ...BASE, numatend: '9007199254740992' };
    expect(validarSnapshotHop([a, b]).sha256).toBe(validarSnapshotHop([b, a]).sha256);
  });
});
