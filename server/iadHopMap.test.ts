import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { mapearHopIad, validarSnapshotIad, validarPrimeiraPublicacaoIad, type HopIadRow } from './iadHopMap';
import { HUP_ESTABELECIMENTO_ID, mapearHopUrologico } from './hopUrologicoMap';

const E = 900001;
const row = (extra: Partial<HopIadRow> = {}): HopIadRow => ({
  numatend: 123, codtipsai: null, nomeplaco: 'CONVENIO FICTICIO', nomepac: 'PACIENTE FICTICIO',
  carater: 'E', datatend: '2026-10-07 23:40:00', datasai: null, tipoatend: 'E', codserv: 'EX',
  procprin: '01', codcc_destino: 'FAT', tipoatendimentodescricao: 'EXAME',
  Estabelecimentos_id: String(E), ...extra,
});
const manifest = () => ({ estabelecimentoId:E, total:1, sha256:'a'.repeat(64), esperadoTotal:1,
  esperadoSha256:'a'.repeat(64), destinoExistente:0, integradoresAtivos:0 });

describe('IAD Hop: primeira publicação', () => {
  it('mapeia a unidade explícita, não o HUP, com chave estável', () => {
    const r = mapearHopIad(row(), E);
    expect(r.estabelecimentoId).toBe(E);
    expect(r.estabelecimentoId).not.toBe(HUP_ESTABELECIMENTO_ID);
    expect(r.origemSistema).toBe('WARLEINE');
    expect(r.origemId).toBe('123');
    expect(r.numero_atendimento).toBe('123');
    expect(r.ativoNaFonte).toBe(1);
  });
  it('preserva a saída nula, sem inventar alta para exame', () => {
    expect(mapearHopIad(row(), E).data_saida).toBeNull();
    expect(row().datasai).toBeNull();
  });
  it('preserva dia e hora civil sem conversão de fuso', () => {
    const r = mapearHopIad(row({datasai:'2026-10-08 00:10:00'}), E);
    expect(r.data_entrada).toBe('2026-10-07 23:40:00');
    expect(r.data_saida).toBe('2026-10-08 00:10:00');
  });
  it.each([0, -1, 1.5, NaN, HUP_ESTABELECIMENTO_ID])('rejeita estabelecimento inválido %s', id => {
    expect(()=>mapearHopIad(row(),id)).toThrow();
  });
  it('rejeita mistura de estabelecimentos mesmo quando o ID é válido', () => {
    expect(()=>mapearHopIad(row({Estabelecimentos_id:'999999'}),E)).toThrow();
  });
  it('rejeita número de atendimento ausente/zero', () => {
    expect(()=>mapearHopIad(row({numatend:0}),E)).toThrow();
    expect(()=>mapearHopIad(row({numatend:null}),E)).toThrow();
  });
  it('rejeita paciente ou convênio vazio', () => {
    expect(()=>mapearHopIad(row({nomepac:' '}),E)).toThrow();
    expect(()=>mapearHopIad(row({nomeplaco:null}),E)).toThrow();
  });
  it('rejeita datas inválidas ou ausentes', () => {
    expect(()=>mapearHopIad(row({datatend:'2026-02-30 12:00:00'}),E)).toThrow();
    expect(()=>mapearHopIad(row({datatend:null}),E)).toThrow();
  });
  it('rejeita saída anterior à entrada', () => {
    expect(()=>mapearHopIad(row({datasai:'2026-10-07 20:00:00'}),E)).toThrow();
  });
  it('rejeita descrição longa em vez de truncar', () => {
    expect(()=>mapearHopIad(row({tipoatendimentodescricao:'x'.repeat(256)}),E)).toThrow();
  });
  it('preserva categoria original de ambulatório/internação', () => {
    expect(mapearHopIad(row({tipoatend:'A',tipoatendimentodescricao:'AMBULATORIO'}),E).tipo_atendimento).toBe('A');
    expect(mapearHopIad(row({tipoatend:'I',tipoatendimentodescricao:'INTERNACAO'}),E).descricao_atendimento).toBe('INTERNACAO');
  });
  it('snapshot é independente da ordem e sensível à mudança de conteúdo', () => {
    const a=row(),b=row({numatend:124});
    expect(validarSnapshotIad([a,b],E)).toEqual(validarSnapshotIad([b,a],E));
    expect(validarSnapshotIad([a],E).sha256).not.toBe(validarSnapshotIad([row({datasai:'2026-10-08 00:10:00'})],E).sha256);
  });
  it('rejeita staging vazia ou com atendimento repetido', () => {
    expect(()=>validarSnapshotIad([],E)).toThrow();
    expect(()=>validarSnapshotIad([row(),row()],E)).toThrow();
  });
  it('aprova manifesto exato, destino vazio e integradores parados', () => {
    expect(()=>validarPrimeiraPublicacaoIad(manifest())).not.toThrow();
  });
  it.each([{esperadoTotal:2},{esperadoSha256:'b'.repeat(64)},{esperadoSha256:''},
    {destinoExistente:1},{integradoresAtivos:1}])('rejeita manifesto ou condição alterada %j', extra => {
    expect(()=>validarPrimeiraPublicacaoIad({...manifest(),...extra})).toThrow();
  });
  it('validador HUP continua rejeitando IAD sem adaptação', () => {
    expect(()=>mapearHopUrologico(row())).toThrow();
    expect(mapearHopUrologico(row({Estabelecimentos_id:String(HUP_ESTABELECIMENTO_ID)})).estabelecimentoId).toBe(HUP_ESTABELECIMENTO_ID);
  });
});

describe('Contrato estrutural do executor IAD', () => {
  const src = fs.readFileSync(new URL('../scripts/publicar-hop-iad.mts',import.meta.url),'utf8');
  it('exige confirmação de revisão, primeira carga e fim do Hop', () => {
    for(const flag of ['--confirm-hop-finished','--confirm-reviewed-pr','--confirm-first-load','--confirm-exclusive-iad-window']) expect(src).toContain(flag);
  });
  it('usa transação e faz rollback de falhas antes do commit', () => {
    expect(src).toContain('await db.beginTransaction()');
    expect(src).toContain('await db.commit()');
    expect(src).toContain('if(iniciado&&!commitAttempted)');
    expect(src).toContain('await db.rollback()');
    expect(src).toContain('BEGIN PESSIMISTIC');
  });
  it('não modifica registros existentes nem tabelas', () => {
    expect(src).not.toMatch(/\b(?:UPDATE|DELETE|DROP|TRUNCATE|ALTER)\s+(?:TABLE\s+)?(?:atendimentos_unificados|stagion_|\$\{DEST\})/i);
    expect(src).not.toContain('ON DUPLICATE KEY UPDATE');
    expect(src).not.toContain('INSERT IGNORE');
    expect(src).toContain('INSERT INTO ${DEST}');
  });
  it('gera manifesto privado na prévia e não o imprime', () => {
    expect(src).toContain("modo:'PREVIA_SEM_ESCRITA'");
    expect(src).toContain('writePrivateJsonExclusive(PRIVATE_ROOT,manifestPath');
    expect(src).not.toContain('console.log(snapshot.sha256)');
  });
  it('exige cadastro ativo e bloqueia ambos integradores', () => {
    expect(src).toContain("rows[0].ativo!=='sim'");
    expect(src).toContain('query_configuracoes');
    expect(src).toContain('integracao_mapeamentos');
  });
  it('amarra a execução à unidade e quantidade desta liberação', () => {
    expect(src).toContain('const E = 2550002');
    expect(src).toContain('const EXPECTED_TOTAL = 13439');
    expect(src).toContain('snapshot.total!==EXPECTED_TOTAL');
  });
  it('não alega SERIALIZABLE/gap lock e verifica todas as origens com leitura externa', () => {
    expect(src).not.toContain('ISOLATION LEVEL SERIALIZABLE');
    expect(src).toContain('REPEATABLE READ');
    expect(src).toContain('finalRows.length!==EXPECTED_TOTAL');
    expect(src).toContain('destinationRead(observer!)');
  });
  it('distingue falha pré-commit de resultado incerto pós-commit sem retry', () => {
    expect(src).toContain('RESULTADO_INCERTO_POS_COMMIT');
    expect(src).toContain('NAO_REAPLICAR');
    expect(src).toContain('tidb_retry_limit=0');
  });
});
