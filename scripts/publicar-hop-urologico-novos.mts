/*
 * Complemento incremental MANUAL para atendimentos do Urológico já publicados.
 * Prévia por padrão. NÃO é sincronização completa: nunca UPDATE/DELETE/desativa.
 * Não agendar sem um protocolo durável de lote concluído pelo Hop.
 * Redirecione o resultado da prévia para arquivo privado: contém SHA-256.
 */
import mysql from 'mysql2/promise';
import { HUP_ESTABELECIMENTO_ID as E, HUP_ORIGEM as ORIGEM, validarSnapshotHop, type HopUrologicoRow } from '../server/hopUrologicoMap';
import { classificarNovosHop, conferirManifestoIncremental } from '../server/hupIncremental';

const SOURCE = 'stagion_atendimentos_parados_urologico';
const DEST = 'atendimentos_unificados';
const COLUNAS = [
  'estabelecimentoId', 'origemSistema', 'origemId', 'numero_atendimento', 'codigo_saida',
  'convenio', 'paciente', 'caracter_atendimento', 'data_entrada', 'data_saida',
  'tipo_atendimento', 'descricao_atendimento', 'codigo_servico', 'codigo_procedimento',
  'destino_conta', 'ativoNaFonte',
] as const;

async function executar() {
  if (!process.env.DATABASE_URL) throw new Error('Conexão indisponível.');
  const args = process.argv.slice(2);
  const aplicar = args.includes('--apply');
  const previstos = process.env.SAFATLE_HUP_EXPECTED_COUNT;
  const novosPrevistos = process.env.SAFATLE_HUP_EXPECTED_NEW_COUNT;
  const esperadoHash = process.env.SAFATLE_HUP_EXPECTED_SHA256;
  const bancoEsperado = process.env.SAFATLE_HUP_EXPECTED_DATABASE;
  if (aplicar && (!args.includes('--confirm-insert-only') || !args.includes('--confirm-hop-finished') ||
    !args.includes('--confirm-reviewed-pr') || !/^[1-9]\d*$/.test(previstos ?? '') ||
    !/^\d+$/.test(novosPrevistos ?? '') || !/^[a-f0-9]{64}$/.test(esperadoHash ?? '') || !bancoEsperado)) {
    throw new Error('Faltam confirmações, banco esperado ou manifesto privado; nada será inserido.');
  }
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true });
  let iniciado = false;
  try {
    if (aplicar) {
      const [[current]] = await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() banco');
      if (current.banco !== bancoEsperado) throw new Error('Banco inesperado; publicação suspensa.');
    }
    const [colunas] = await db.query<mysql.RowDataPacket[]>(
      'SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (?,?)', [SOURCE, DEST]);
    const nomes = new Set(colunas.filter(r => r.table_name === SOURCE).map(r => r.column_name));
    for (const campo of ['numatend', 'Estabelecimentos_id', 'codtipsai', 'nomeplaco',
      'nomepac', 'carater', 'datatend', 'datasai', 'tipoatend', 'codserv', 'procprin',
      'codcc_destino', 'tipoatendimentodescricao']) {
      if (!nomes.has(campo)) throw new Error('Layout da staging mudou; publicação suspensa.');
    }
    for (const [tabela, campo] of [[SOURCE, 'datatend'], [SOURCE, 'datasai'],
      [DEST, 'data_entrada'], [DEST, 'data_saida']]) {
      if (colunas.find(r => r.table_name === tabela && r.column_name === campo)?.data_type !== 'datetime') {
        throw new Error('Tipo físico de data mudou; publicação suspensa.');
      }
    }
    const [unique] = await db.query<mysql.RowDataPacket[]>(
      'SELECT index_name,GROUP_CONCAT(column_name ORDER BY seq_in_index) campos FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND non_unique=0 GROUP BY index_name', [DEST]);
    if (!unique.some(x => x.campos === 'estabelecimentoId,origemSistema,origemId')) {
      throw new Error('Índice único de atendimento indisponível; publicação suspensa.');
    }
    // A prévia não inicia transação nem contém DML. No TiDB, SET TRANSACTION READ ONLY
    // é apenas sintaxe de compatibilidade e NÃO impediria uma escrita acidental.
    if (aplicar) { await db.beginTransaction(); iniciado = true; }
    const [[sourceCount]] = await db.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) n FROM ${SOURCE}`);
    if (Number(sourceCount.n) < 1 || Number(sourceCount.n) > 100000) throw new Error('Snapshot fora do limite seguro.');
    const [linhas] = await db.query<mysql.RowDataPacket[]>(
      `SELECT * FROM ${SOURCE} ORDER BY numatend${aplicar ? ' FOR UPDATE' : ''}`);
    const fonte = linhas as HopUrologicoRow[];
    const [destino] = await db.query<mysql.RowDataPacket[]>(
      `SELECT origemId FROM ${DEST} WHERE estabelecimentoId=? AND origemSistema=?${aplicar ? ' FOR UPDATE' : ''}`, [E, ORIGEM]);
    const [ativos] = await db.query<mysql.RowDataPacket[]>(
      'SELECT id FROM query_configuracoes WHERE estabelecimentoId=? AND ativo=1', [E]);
    // Guarda conservadora: nenhuma configuração legada do integrador desta unidade pode estar ativa.
    const delta = classificarNovosHop(fonte, destino.map(r => String(r.origemId)));
    if (delta.total !== Number(sourceCount.n)) throw new Error('Snapshot mudou durante a leitura.');
    if (!aplicar) {
      const [novaLeitura] = await db.query<mysql.RowDataPacket[]>(`SELECT * FROM ${SOURCE} ORDER BY numatend`);
      if (validarSnapshotHop(novaLeitura as HopUrologicoRow[]).sha256 !== delta.sha256) {
        throw new Error('Staging mudou durante a prévia; repetir após o Hop terminar.');
      }
    }
    console.log(JSON.stringify({ modo: aplicar ? 'APLICAR_SOMENTE_NOVOS' : 'PREVIA_SEM_ESCRITA',
      totalFonte: delta.total, sha256: delta.sha256, existentesPreservados: delta.jaExistentes,
      novos: delta.novos.length, ausentesPreservados: delta.antigosAusentesNaFonte,
      integradorLegadoAtivo: ativos.length }));
    if (!aplicar) return;
    conferirManifestoIncremental({ total: delta.total, sha256: delta.sha256, novos: delta.novos.length,
      esperadoTotal: Number(previstos), esperadoSha256: esperadoHash!, esperadoNovos: Number(novosPrevistos),
      jobsLegadosAtivos: ativos.length });
    const cols = COLUNAS.map(x => `\`${x}\``).join(',');
    const placeholders = `(${COLUNAS.map(() => '?').join(',')})`;
    for (let i = 0; i < delta.novos.length; i += 200) {
      const lote = delta.novos.slice(i, i + 200);
      await db.query(`INSERT INTO ${DEST} (${cols}) VALUES ${lote.map(() => placeholders).join(',')}`,
        lote.flatMap(r => COLUNAS.map(k => r[k])));
    }
    const [[post]] = await db.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) n, COUNT(DISTINCT origemId) chaves FROM ${DEST} WHERE estabelecimentoId=? AND origemSistema=?`, [E, ORIGEM]);
    if (Number(post.n) !== destino.length + delta.novos.length || Number(post.chaves) !== Number(post.n)) {
      throw new Error('Pós-condição de chaves falhou; transação será revertida.');
    }
    // Mesmo depois dos INSERTs, abortar se a staging mudou antes do commit.
    const [recheck] = await db.query<mysql.RowDataPacket[]>(`SELECT * FROM ${SOURCE} ORDER BY numatend FOR UPDATE`);
    if (validarSnapshotHop(recheck as HopUrologicoRow[]).sha256 !== delta.sha256) {
      throw new Error('Staging mudou durante a transação; publicação será revertida.');
    }
    await db.commit(); iniciado = false;
    console.log(JSON.stringify({ resultado: 'NOVOS_INSERIDOS', novos: delta.novos.length,
      existentesPreservados: delta.jaExistentes, ausentesPreservados: delta.antigosAusentesNaFonte }));
  } finally {
    if (iniciado) await db.rollback();
    await db.end();
  }
}

executar().catch(err => {
  // Nunca imprimir mensagem do driver: pode conter conexão ou valores clínicos.
  console.error('PUBLICACAO_ABORTADA:', typeof err?.code === 'string' ? err.code : 'FALHA_DE_VALIDACAO');
  process.exitCode = 1;
});
