/*
 * Primeira publicação do snapshot físico Hop/HUP (formato bruto, NÃO a staging 0130).
 * Executar com `node --import tsx scripts/publicar-hop-urologico.mts` para prévia.
 * Execução de escrita requer PR revisada, job legado inativo, banco esperado e
 * contagem/fingerprint da prévia em variáveis privadas (não em argumentos CLI).
 * Nunca imprimir nomes ou registros de pacientes.
 */
import mysql from 'mysql2/promise';
import { HUP_ESTABELECIMENTO_ID as E, HUP_ORIGEM as ORIGEM, validarSnapshotHop, validarElegibilidadePrimeiraCarga, mapearHopUrologico, type HopUrologicoRow } from '../server/hopUrologicoMap';

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
  const esperadoHash = process.env.SAFATLE_HUP_EXPECTED_SHA256;
  const bancoEsperado = process.env.SAFATLE_HUP_EXPECTED_DATABASE;
  if (aplicar && (!args.includes('--confirm-complete-snapshot') || !args.includes('--confirm-reviewed-pr') || !/^[0-9]+$/.test(previstos ?? '') || !/^[a-f0-9]{64}$/.test(esperadoHash ?? '') || !bancoEsperado)) {
    throw new Error('Faltam confirmações, banco esperado e manifesto privado da prévia.');
  }
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true });
  let iniciado = false;
  try {
    if (aplicar) {
      const [[current]] = await db.query<mysql.RowDataPacket[]>('SELECT DATABASE() banco');
      if (current.banco !== bancoEsperado) throw new Error('Banco inesperado; publicação suspensa.');
    }
    // A staging atual foi alterada pelo Hop e não coincide com o schema Drizzle 0130.
    const [colunas] = await db.query<mysql.RowDataPacket[]>(
      "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (?,?)", [SOURCE, DEST]);
    const nomes = new Set(colunas.filter(r => r.table_name === SOURCE).map(r => r.column_name));
    for (const campo of ['numatend', 'Estabelecimentos_id', 'codtipsai', 'nomeplaco',
      'nomepac', 'carater', 'datatend', 'datasai', 'tipoatend', 'codserv', 'procprin',
      'codcc_destino', 'tipoatendimentodescricao']) {
      if (!nomes.has(campo)) throw new Error('Layout físico da staging mudou; publicação suspensa.');
    }
    // O banco físico usa DATETIME em ambas as pontas: passar string civil literalmente, sem UTC.
    // O Drizzle hoje declara timestamp() para o destino; esta PR não altera o schema legado.
    for (const [tabela, campo] of [[SOURCE, 'datatend'], [SOURCE, 'datasai'],
      [DEST, 'data_entrada'], [DEST, 'data_saida']]) {
      if (colunas.find(r => r.table_name === tabela && r.column_name === campo)?.data_type !== 'datetime') {
        throw new Error('Tipo físico de data mudou; publicação suspensa.');
      }
    }
    const [unique] = await db.query<mysql.RowDataPacket[]>(
      "SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) campos FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND non_unique=0 GROUP BY index_name", [DEST]);
    if (!unique.some(x => x.campos === 'estabelecimentoId,origemSistema,origemId')) {
      throw new Error('Índice único do destino indisponível; publicação suspensa.');
    }
    await db.beginTransaction(); iniciado = true;
    const [[sourceCount]] = await db.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) n FROM ${SOURCE}`);
    if (Number(sourceCount.n) < 1 || Number(sourceCount.n) > 100000) {
      throw new Error('Tamanho do snapshot fora do intervalo seguro.');
    }
    const [linhas] = await db.query<mysql.RowDataPacket[]>(
      `SELECT * FROM ${SOURCE} ORDER BY numatend${aplicar ? ' FOR UPDATE' : ''}`);
    const dados = linhas as HopUrologicoRow[];
    const { total, sha256 } = validarSnapshotHop(dados);
    if (total !== Number(sourceCount.n)) throw new Error('Snapshot mudou durante a leitura.');
    const [destino] = await db.query<mysql.RowDataPacket[]>(
      `SELECT origemSistema,COUNT(*) n FROM ${DEST} WHERE estabelecimentoId=? GROUP BY origemSistema`, [E]);
    const [[job]] = await db.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) n FROM query_configuracoes WHERE estabelecimentoId=? AND LOWER(sistema)='warleine' AND LOWER(tipoDados) LIKE '%atend%' AND ativo=1", [E]);
    console.log(JSON.stringify({ modo: aplicar ? 'APLICAR' : 'PREVIA_SEM_ESCRITA', linhas: total,
      sha256, destinoExistente: destino.reduce((s, x) => s + Number(x.n), 0), jobLegadoAtivo: Number(job.n) }));
    if (!aplicar) return;
    validarElegibilidadePrimeiraCarga({
      total, sha256, esperadoTotal: Number(previstos), esperadoSha256: esperadoHash!,
      destinoExistente: destino.reduce((s, x) => s + Number(x.n), 0),
      jobsLegadosAtivos: Number(job.n),
    });
    const registros = dados.map(mapearHopUrologico);
    const cols = COLUNAS.map(x => `\`${x}\``).join(',');
    const rowPlaceholders = `(${COLUNAS.map(() => '?').join(',')})`;
    for (let i = 0; i < registros.length; i += 200) {
      const lote = registros.slice(i, i + 200);
      const params = lote.flatMap(r => COLUNAS.map(k => r[k]));
      await db.query(`INSERT INTO ${DEST} (${cols}) VALUES ${lote.map(() => rowPlaceholders).join(',')}`, params);
    }
    const [[after]] = await db.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) n,COUNT(DISTINCT origemId) chaves,SUM(ativoNaFonte=1) ativos FROM ${DEST} WHERE estabelecimentoId=? AND origemSistema=?`, [E, ORIGEM]);
    if (Number(after.n) !== total || Number(after.chaves) !== total || Number(after.ativos) !== total) {
      throw new Error('Pós-condição falhou; transação será revertida.');
    }
    // Leitura bloqueante de escrita; além dela o Hop precisa ter terminado antes da execução.
    const [recheck] = await db.query<mysql.RowDataPacket[]>(`SELECT * FROM ${SOURCE} ORDER BY numatend FOR UPDATE`);
    if (validarSnapshotHop(recheck as HopUrologicoRow[]).sha256 !== sha256) {
      throw new Error('Staging mudou durante a transação; publicação cancelada.');
    }
    await db.commit(); iniciado = false;
    console.log(JSON.stringify({ resultado: 'PUBLICADO', estabelecimentoId: E, quantidade: total }));
  } finally {
    if (iniciado) await db.rollback();
    await db.end();
  }
}

executar().catch(err => {
  // Não imprimir a mensagem do driver SQL: ela pode conter SQL, conexão ou valores de pacientes.
  console.error('PUBLICACAO_ABORTADA:', typeof err?.code === 'string' ? err.code : 'FALHA_DE_VALIDACAO');
  process.exitCode = 1;
});
