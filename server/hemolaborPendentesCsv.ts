import { parseTasyDecimal, normalizeTasyCompetencia } from './tasyCsvImportService';

export const HEMO_ESTABELECIMENTO_ID = 6;
export const HEMO_CSV_HEADERS = [
  'SEQUENCIA','ATUALIZACAO','CONVENIO','CATEGORIA','PLANO','ACOMODACAO','ENTRADA',
  'SAIDA','ALTA','DT_DEFINITIVO','COMPETENCIA','SETOR_ENTRADA','DT_ETAPA',
  'ETAPA_CONTA','SETOR_ETAPA','USUARIO_ETAPA','MOTIVO_DEVOLUCAO','STATUS_CONTA',
  'PROTOCOLO','NOME_PROT','TITULO','ATENDIMENTO','CONTA','AUTORIZACAO',
  'MATRICULA','PACIENTE','TIPO_GUIA','CD_PROCED','PROCEDIMENTO','MEDICO','VALOR_CONTA',
] as const;
export type HemoCsvRecord = Record<(typeof HEMO_CSV_HEADERS)[number], string>;

export const HEMO_FIELD_MAP = [
  ['CONVENIO','convenio'],['CATEGORIA','dsCategoria'],['CATEGORIA','tipo_atendimento'],
  ['PLANO','dsPlano'],['ACOMODACAO','caracter_atendimento'],['SETOR_ENTRADA','dsSetorEntrada'],
  ['ETAPA_CONTA','etapaConta'],['SETOR_ETAPA','setorEtapa'],['SETOR_ETAPA','destino_conta'],
  ['SETOR_ETAPA','centroCusto'],['USUARIO_ETAPA','userEtapa'],
  ['MOTIVO_DEVOLUCAO','motivoDevolucao'],['STATUS_CONTA','statusConta'],
  ['STATUS_CONTA','codigo_saida'],['STATUS_CONTA','protStatus'],
  ['PROTOCOLO','protTasy'],['PROTOCOLO','protConv'],['NOME_PROT','nomeProtocolo'],
  ['AUTORIZACAO','autorizacao'],
  ['CD_PROCED','codigo_procedimento'],['CD_PROCED','codigo_servico'],
  ['CD_PROCED','codServico'],['PROCEDIMENTO','procedimentoDescricao'],
  ['PROCEDIMENTO','descricao_atendimento'],['MEDICO','medicoResp'],
] as const satisfies readonly (readonly [keyof HemoCsvRecord, string])[];

export function cleanHemo(value: unknown): string {
  const raw = String(value ?? '').trim();
  return raw === 'NULL' ? '' : raw;
}

export function parseHemoCsvRecord(fields: string[]): HemoCsvRecord {
  if (fields.length !== HEMO_CSV_HEADERS.length) throw new Error('COLUNAS_INVALIDAS');
  const row = Object.fromEntries(HEMO_CSV_HEADERS.map((key, index) => [key, cleanHemo(fields[index])])) as HemoCsvRecord;
  if (!/^\d+$/.test(row.ATENDIMENTO) || !/^\d+$/.test(row.CONTA)) throw new Error('CHAVE_INVALIDA');
  return row;
}

export function hemoKey(row: HemoCsvRecord): string {
  return `${row.ATENDIMENTO}:${row.CONTA}`;
}

export function hemoLatestOrder(row: HemoCsvRecord, line: number): string {
  const date = (text: string) => {
    if (!text) return '10000101000000';
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\.000$/);
    if (!match) throw new Error('DATA_ORDENACAO_INVALIDA');
    const [,year,month,day,hour,minute,second]=match;
    const time=new Date(Date.UTC(+year,+month-1,+day,+hour,+minute,+second));
    if(time.getUTCFullYear()!==+year||time.getUTCMonth()+1!==+month||time.getUTCDate()!==+day||
       time.getUTCHours()!==+hour||time.getUTCMinutes()!==+minute||time.getUTCSeconds()!==+second)
      throw new Error('DATA_ORDENACAO_INVALIDA');
    return match.slice(1).join('');
  };
  if (!/^\d*$/.test(row.SEQUENCIA) || row.SEQUENCIA.length > 20) throw new Error('SEQUENCIA_INVALIDA');
  return date(row.ATUALIZACAO)+date(row.DT_ETAPA)+BigInt(row.SEQUENCIA||'0').toString().padStart(20,'0')+String(line).padStart(12,'0');
}

export type HemoExisting = Record<string, unknown> & {
  origemSistema: string; origemId: string; estabelecimentoId: number;
  titulo: string | null; ativoNaFonte: number | boolean;
};

/** Atualiza SOMENTE campos informados de uma conta que segue pendente; datas/título não são modificados. */
export function planHemoPendingUpdate(row: HemoCsvRecord, old: HemoExisting): Record<string, string> | null {
  if (old.estabelecimentoId !== HEMO_ESTABELECIMENTO_ID ||
    !['tasy','tasy_hemolabor'].includes(old.origemSistema) ||
    Number(old.ativoNaFonte) !== 1 || old.origemId !== hemoKey(row) ||
    cleanHemo(old.titulo) || row.TITULO) return null;
  const update: Record<string,string> = {};
  for (const [source, target] of HEMO_FIELD_MAP) {
    const next=cleanHemo(row[source]);
    if (next && next !== cleanHemo(old[target])) update[target]=next;
  }
  const comp=normalizeTasyCompetencia(row.COMPETENCIA);
  if (!comp.warning && comp.value && comp.value !== cleanHemo(old.competencia)) {
    update.competencia=comp.value;
    update.referencia=comp.value;
  }
  if (row.VALOR_CONTA) {
    const raw = row.VALOR_CONTA.includes(',') ? row.VALOR_CONTA.replace(/\./g,'').replace(',','.') : row.VALOR_CONTA;
    if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(raw)) throw new Error('VALOR_FORA_DE_PRECISAO');
    const parsed=parseTasyDecimal(row.VALOR_CONTA);
    if (parsed === null) throw new Error('VALOR_INVALIDO');
    const money=parsed.toFixed(2);
    if (Number(old.valorConta ?? 0) !== Number(money)) update.valorConta=money;
  }
  return Object.keys(update).length ? update : null;
}
