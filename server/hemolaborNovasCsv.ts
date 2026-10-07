import { createHash } from 'node:crypto';
import { HEMO_CSV_HEADERS, HEMO_ESTABELECIMENTO_ID, HEMO_FIELD_MAP, cleanHemo, hemoKey, type HemoCsvRecord } from './hemolaborPendentesCsv';
import { normalizeTasyCompetencia } from './tasyCsvImportService';

export const HEMO_NOVAS_COLUNAS = [
  'origemSistema','origemId','estabelecimentoId','configId','ultimoLoteId',
  'origemAtualizadaEm','statusConta','ativoNaFonte','hashConteudo',
  'numero_atendimento','codigo_saida','convenio','paciente','caracter_atendimento',
  'data_entrada','data_saida','tipo_atendimento','descricao_atendimento',
  'codigo_servico','codigo_procedimento','procedimentoDescricao','destino_conta',
  'dsCategoria','dsPlano','competencia','referencia','protTasy','nomeProtocolo',
  'protConv','dtEntrega','protStatus','titulo','dtTitulo','dsSetorEntrada',
  'etapaConta','setorEtapa','dtEtapa','userEtapa','motivoDevolucao','conta',
  'autorizacao','valorConta','matricula','medicoResp','codServico','centroCusto',
  'dataSincronizacao','criadoEm','atualizadoEm',
] as const;

/** O CSV do Hemolabor exporta milissegundos .000; DATETIME/TIMESTAMP não devem arredondar frações. */
export function civilHemoDate(raw: string): string | null {
  const value=cleanHemo(raw);
  if (!value) return null;
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\.000$/);
  if(!m) throw Error('DATA_FORA_DO_CONTRATO');
  const [,yy,mm,dd,hh,mi,ss]=m;const y=+yy,mo=+mm,d=+dd,h=+hh,minute=+mi,s=+ss;
  const instant=new Date(Date.UTC(y,mo-1,d,h,minute,s));
  if(y<1970||y>2037||instant.getUTCFullYear()!==y||instant.getUTCMonth()!==mo-1||instant.getUTCDate()!==d||instant.getUTCHours()!==h||instant.getUTCMinutes()!==minute||instant.getUTCSeconds()!==s)throw Error('DATA_FORA_DO_CONTRATO');
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

/** Mesma chave de conta que a importação TASY existente. Nunca utilizar o número da linha. */
export function mapHemoNewPending(row:HemoCsvRecord): Record<string,string|number|null> {
  if(!/^\d+$/.test(row.ATENDIMENTO)||!/^\d+$/.test(row.CONTA)||row.TITULO)throw Error('NAO_E_PENDENTE');
  if(!row.ENTRADA||!row.PACIENTE||!row.CONVENIO)throw Error('DADO_ESSENCIAL_AUSENTE');
  if(row.CONVENIO.toUpperCase()==='PARTICULAR')throw Error('PARTICULAR_FORA_DA_TELA');
  const value=(key:keyof HemoCsvRecord)=>cleanHemo(row[key])||null;
  const competencia=normalizeTasyCompetencia(row.COMPETENCIA);
  if(competencia.warning && row.COMPETENCIA)throw Error('COMPETENCIA_INVALIDA');
  let money:string|null=null;
  if(row.VALOR_CONTA){
    const text=row.VALOR_CONTA.includes(',')?row.VALOR_CONTA.replace(/\./g,'').replace(',','.'):row.VALOR_CONTA;
    if(!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(text))throw Error('VALOR_FORA_DE_PRECISAO');
    const [whole,fraction='']=text.split('.');
    money=`${whole}.${fraction.padEnd(2,'0')}`;
  }
  const mapped:Record<string,string|number|null>={
    origemSistema:'tasy',origemId:hemoKey(row),estabelecimentoId:HEMO_ESTABELECIMENTO_ID,
    configId:null,ultimoLoteId:null,origemAtualizadaEm:civilHemoDate(row.ATUALIZACAO),
    statusConta:value('STATUS_CONTA'),ativoNaFonte:1,
    hashConteudo:createHash('sha256').update(HEMO_CSV_HEADERS.map(k=>cleanHemo(row[k])).join('\u001f')).digest('hex'),
    numero_atendimento:value('ATENDIMENTO'),codigo_saida:value('STATUS_CONTA'),convenio:value('CONVENIO'),paciente:value('PACIENTE'),
    caracter_atendimento:value('ACOMODACAO'),data_entrada:civilHemoDate(row.ENTRADA),data_saida:civilHemoDate(row.SAIDA),
    tipo_atendimento:value('CATEGORIA'),descricao_atendimento:value('PROCEDIMENTO'),
    codigo_servico:value('CD_PROCED'),codigo_procedimento:value('CD_PROCED'),procedimentoDescricao:value('PROCEDIMENTO'),
    destino_conta:value('SETOR_ETAPA'),dsCategoria:value('CATEGORIA'),dsPlano:value('PLANO'),
    competencia:competencia.value,referencia:competencia.value,protTasy:value('PROTOCOLO'),nomeProtocolo:value('NOME_PROT'),
    protConv:value('PROTOCOLO'),dtEntrega:civilHemoDate(row.DT_DEFINITIVO),protStatus:value('STATUS_CONTA'),
    titulo:null,dtTitulo:null,dsSetorEntrada:value('SETOR_ENTRADA'),etapaConta:value('ETAPA_CONTA'),
    setorEtapa:value('SETOR_ETAPA'),dtEtapa:civilHemoDate(row.DT_ETAPA),userEtapa:value('USUARIO_ETAPA'),
    motivoDevolucao:value('MOTIVO_DEVOLUCAO'),conta:value('CONTA'),autorizacao:value('AUTORIZACAO'),
    valorConta:money,matricula:value('MATRICULA'),medicoResp:value('MEDICO'),
    codServico:value('CD_PROCED'),centroCusto:value('SETOR_ETAPA'),
    dataSincronizacao:null,criadoEm:null,atualizadoEm:null,
  };
  // O mapeamento de campos operacionais precisa coincidir com o UPDATE conservador já publicado.
  for(const [source,target] of HEMO_FIELD_MAP){const next=value(source);if(next)mapped[target]=next}
  if(Object.keys(mapped).length!==HEMO_NOVAS_COLUNAS.length||HEMO_NOVAS_COLUNAS.some(k=>!(k in mapped)))throw Error('COLUNAS_DIVERGENTES');
  return mapped;
}
