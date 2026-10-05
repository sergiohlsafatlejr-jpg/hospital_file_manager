import { createHash } from 'node:crypto';

/** Formato físico do Hop/HUP (não é o layout da staging Drizzle 0130). */
export type HopUrologicoRow = {
  numatend: number | string | null;
  codtipsai: string | null;
  nomeplaco: string | null;
  nomepac: string | null;
  carater: string | null;
  datatend: string | null;
  datasai: string | null;
  tipoatend: string | null;
  codserv: string | null;
  procprin: string | null;
  codcc_destino: string | null;
  tipoatendimentodescricao: string | null;
  Estabelecimentos_id: string | null;
};

export const HUP_ESTABELECIMENTO_ID = 1260036;
export const HUP_ORIGEM = 'WARLEINE';

const COLUNAS: Array<[keyof HopUrologicoRow, number]> = [
  ['codtipsai', 50], ['nomeplaco', 255], ['nomepac', 255], ['carater', 50],
  ['tipoatend', 50], ['tipoatendimentodescricao', 255], ['codserv', 100],
  ['procprin', 500], ['codcc_destino', 100],
];

function dataBanco(valor: string | null): string | null {
  if (valor === null) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(valor)) {
    throw new Error('Data da origem em formato inesperado; publicação suspensa.');
  }
  const [ano, mes, dia, hora, min, seg] = valor.split(/[- :]/).map(Number);
  const epoch = Date.UTC(ano, mes - 1, dia, hora, min, seg);
  if (new Date(epoch).toISOString().slice(0, 19).replace('T', ' ') !== valor) {
    throw new Error('Data inválida na origem; publicação suspensa.');
  }
  return valor;
}

export function mapearHopUrologico(linha: HopUrologicoRow) {
  for (const [campo] of COLUNAS) {
    if (linha[campo] === undefined) throw new Error('Layout bruto incompleto; publicação suspensa.');
  }
  if (typeof linha.numatend === 'number' && !Number.isSafeInteger(linha.numatend)) {
    throw new Error('Número de atendimento fora da faixa segura; publicação suspensa.');
  }
  if (String(linha.Estabelecimentos_id ?? '').trim() !== String(HUP_ESTABELECIMENTO_ID)) {
    throw new Error('Linha fora do estabelecimento Urológico; publicação suspensa.');
  }
  const origemId = String(linha.numatend ?? '').trim();
  if (!/^[1-9]\d*$/.test(origemId) || origemId.length > 100) {
    throw new Error('Número de atendimento inválido; publicação suspensa.');
  }
  for (const [campo, limite] of COLUNAS) {
    const valor = linha[campo];
    if (valor !== null && String(valor).length > limite) {
      throw new Error(`Campo ${campo} excede o destino; publicação suspensa.`);
    }
  }
  if (!linha.nomepac?.trim() || !linha.nomeplaco?.trim()) {
    throw new Error('Paciente ou convênio ausente; publicação suspensa.');
  }
  const dataEntrada = dataBanco(linha.datatend);
  if (!dataEntrada) throw new Error('Data de entrada ausente; publicação suspensa.');
  return {
    estabelecimentoId: HUP_ESTABELECIMENTO_ID,
    origemSistema: HUP_ORIGEM,
    origemId,
    numero_atendimento: origemId,
    codigo_saida: linha.codtipsai,
    convenio: linha.nomeplaco,
    paciente: linha.nomepac,
    caracter_atendimento: linha.carater,
    data_entrada: dataEntrada,
    data_saida: dataBanco(linha.datasai),
    tipo_atendimento: linha.tipoatend,
    descricao_atendimento: linha.tipoatendimentodescricao,
    codigo_servico: linha.codserv,
    codigo_procedimento: linha.procprin,
    destino_conta: linha.codcc_destino,
    ativoNaFonte: 1,
  } as const;
}

/** Não imprime conteúdo; o digest também exige que a carga não mude entre prévia e publicação. */
export function validarSnapshotHop(linhas: HopUrologicoRow[]) {
  if (!linhas.length) throw new Error('Snapshot vazio; publicação suspensa.');
  const ids = new Set<string>();
  const digest = createHash('sha256');
  for (const linha of [...linhas].sort((a, b) => {
    const x = String(a.numatend ?? '').trim();
    const y = String(b.numatend ?? '').trim();
    if (x.length !== y.length) return x.length - y.length;
    return x.localeCompare(y);
  })) {
    const mapped = mapearHopUrologico(linha);
    if (ids.has(mapped.origemId)) throw new Error('Número de atendimento repetido; publicação suspensa.');
    ids.add(mapped.origemId);
    digest.update(JSON.stringify(mapped));
    digest.update('\n');
  }
  return { total: ids.size, sha256: digest.digest('hex') };
}

/** Guardas da PRIMEIRA carga: não substitui snapshots já publicados nem disputa o job antigo. */
export function validarElegibilidadePrimeiraCarga(params: {
  total: number;
  sha256: string;
  esperadoTotal: number;
  esperadoSha256: string;
  destinoExistente: number;
  jobsLegadosAtivos: number;
}) {
  if (params.total !== params.esperadoTotal || params.sha256 !== params.esperadoSha256) {
    throw new Error('O snapshot difere da prévia; nada será publicado.');
  }
  if (params.jobsLegadosAtivos !== 0) {
    throw new Error('Job Warleine legado ainda ativo para o Urológico; nada será publicado.');
  }
  if (params.destinoExistente !== 0) {
    throw new Error('Primeira publicação exige destino Urológico vazio; nada será sobrescrito.');
  }
}
