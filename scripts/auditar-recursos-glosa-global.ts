import { getRawPool } from "../server/db";

type Row = Record<string, unknown>;

async function query<T extends Row>(sql: string): Promise<T[]> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Pool do banco indisponível");
  const [rows] = await pool.query(sql);
  return rows as T[];
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

async function main() {
  const [recursosPorEstabelecimento, lotesIntegridade, recursosVinculos, decisoesIntegridade, historicosOrfaos, legado] =
    await Promise.all([
      query<{
        estabelecimento_id: number;
        estabelecimento_nome: string;
        recursos: number;
        criadores: number;
        user_ids: string | null;
        sem_lote: number;
        valor_glosado: string;
        valor_recuperado: string;
      }>(`
        SELECT
          rg.estabelecimentoId AS estabelecimento_id,
          COALESCE(e.nome, 'Sem estabelecimento') AS estabelecimento_nome,
          COUNT(*) AS recursos,
          COUNT(DISTINCT rg.userId) AS criadores,
          GROUP_CONCAT(DISTINCT rg.userId ORDER BY rg.userId) AS user_ids,
          SUM(CASE WHEN rg.loteId IS NULL THEN 1 ELSE 0 END) AS sem_lote,
          ROUND(SUM(COALESCE(rg.valorGlosado, 0)), 2) AS valor_glosado,
          ROUND(SUM(COALESCE(rg.valorRecuperado, 0)), 2) AS valor_recuperado
        FROM recursosGlosa rg
        LEFT JOIN estabelecimentos e ON e.id = rg.estabelecimentoId
        WHERE rg.status <> 'cancelado'
        GROUP BY rg.estabelecimentoId, e.nome
        ORDER BY recursos DESC
      `),
      query<{
        lote_id: number;
        estabelecimento_id: number;
        convenio_id: number;
        status: string;
        quantidade_gravada: number;
        recursos_vinculados: number;
        demonstrativos_vinculados: number;
        conciliados_vinculados: number;
        valor_gravado: string;
        valor_demo: string;
        valor_recursos: string;
        valor_conciliacao: string;
      }>(`
        SELECT
          lr.id AS lote_id,
          lr.estabelecimentoId AS estabelecimento_id,
          lr.convenioId AS convenio_id,
          lr.status,
          COALESCE(lr.quantidadeItens, 0) AS quantidade_gravada,
          (SELECT COUNT(*) FROM recursosGlosa rg WHERE rg.loteId = lr.id AND rg.estabelecimentoId = lr.estabelecimentoId) AS recursos_vinculados,
          (SELECT COUNT(*) FROM demonstrativo d WHERE d.recurso_id = lr.id AND d.estabelecimentoId = lr.estabelecimentoId) AS demonstrativos_vinculados,
          (SELECT COUNT(*) FROM conciliados_automatico ca WHERE ca.xmlRecursoLoteId = lr.id AND ca.estabelecimentoId = lr.estabelecimentoId) AS conciliados_vinculados,
          ROUND(COALESCE(lr.valorTotalRecursado, 0), 2) AS valor_gravado,
          ROUND(COALESCE((SELECT SUM(COALESCE(NULLIF(d.valor_recurso, 0), d.valor_glosa, 0)) FROM demonstrativo d WHERE d.recurso_id = lr.id AND d.estabelecimentoId = lr.estabelecimentoId), 0), 2) AS valor_demo,
          ROUND(COALESCE((SELECT SUM(COALESCE(NULLIF(rg.valorCobrado, 0), rg.valorGlosado, 0)) FROM recursosGlosa rg WHERE rg.loteId = lr.id AND rg.estabelecimentoId = lr.estabelecimentoId AND rg.status <> 'cancelado'), 0), 2) AS valor_recursos,
          ROUND(COALESCE((SELECT SUM(COALESCE(NULLIF(ca.valorRecurso, 0), ca.valorGlosa, 0)) FROM conciliados_automatico ca WHERE ca.xmlRecursoLoteId = lr.id AND ca.estabelecimentoId = lr.estabelecimentoId), 0), 2) AS valor_conciliacao
        FROM lotesRecurso lr
        ORDER BY lr.estabelecimentoId, lr.id
      `),
      query<{
        recurso_id: number;
        estabelecimento_id: number | null;
        convenio_id: number;
        lote_id: number | null;
        status: string;
        matches_demo: number;
        lotes_demo: string | null;
      }>(`
        SELECT
          rg.id AS recurso_id,
          rg.estabelecimentoId AS estabelecimento_id,
          rg.convenioId AS convenio_id,
          rg.loteId AS lote_id,
          rg.status,
          COUNT(DISTINCT d.id) AS matches_demo,
          GROUP_CONCAT(DISTINCT d.recurso_id ORDER BY d.recurso_id) AS lotes_demo
        FROM recursosGlosa rg
        LEFT JOIN demonstrativo d
          ON d.estabelecimentoId = rg.estabelecimentoId
         AND d.convenio_id = rg.convenioId
         AND TRIM(COALESCE(d.numero_guia, '')) = TRIM(COALESCE(rg.guiaNumero, ''))
         AND TRIM(COALESCE(d.codigo_item, '')) = TRIM(COALESCE(rg.codigoProcedimento, ''))
         AND ROUND(COALESCE(d.valor_glosa, 0), 2) = ROUND(COALESCE(rg.valorGlosado, 0), 2)
        WHERE rg.status <> 'cancelado'
        GROUP BY rg.id, rg.estabelecimentoId, rg.convenioId, rg.loteId, rg.status
        ORDER BY rg.id
      `),
      query<{
        total: number;
        sem_procedimento: number;
        procedimento_inexistente: number;
        convenio_divergente: number;
        recurso_inexistente: number;
      }>(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN dg.procedimentoId IS NULL THEN 1 ELSE 0 END) AS sem_procedimento,
          SUM(CASE WHEN dg.procedimentoId IS NOT NULL AND d.id IS NULL THEN 1 ELSE 0 END) AS procedimento_inexistente,
          SUM(CASE WHEN d.id IS NOT NULL AND d.convenio_id <> dg.convenioId THEN 1 ELSE 0 END) AS convenio_divergente,
          SUM(CASE WHEN dg.recursoId IS NOT NULL AND rg.id IS NULL THEN 1 ELSE 0 END) AS recurso_inexistente
        FROM decisoesGlosa dg
        LEFT JOIN demonstrativo d ON d.id = dg.procedimentoId
        LEFT JOIN recursosGlosa rg ON rg.id = dg.recursoId
      `),
      query<{
        historicos_recursos_orfaos: number;
        historicos_contestacoes_orfaos: number;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM historicoRecursos hr LEFT JOIN recursosGlosa rg ON rg.id = hr.recursoId WHERE rg.id IS NULL) AS historicos_recursos_orfaos,
          (SELECT COUNT(*) FROM historicoContestacoes hc LEFT JOIN recursosGlosa rg ON rg.id = hc.recursoId WHERE hc.recursoId IS NOT NULL AND rg.id IS NULL) AS historicos_contestacoes_orfaos
      `),
      query<{
        lotes_legados: number;
        itens_legados: number;
        justificativas_legadas: number;
        xmls_gerados: number;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM recursos_glosa_lotes) AS lotes_legados,
          (SELECT COUNT(*) FROM recursos_glosa_itens) AS itens_legados,
          (SELECT COUNT(*) FROM recursos_glosa_justificativas) AS justificativas_legadas,
          (SELECT COUNT(*) FROM xml_recursos_gerados) AS xmls_gerados
      `),
    ]);

  const lotesComProblema = lotesIntegridade.filter((row) => {
    const quantidadeReal = number(row.recursos_vinculados)
      + number(row.demonstrativos_vinculados)
      + number(row.conciliados_vinculados);
    const valorReal = number(row.valor_recursos)
      + number(row.valor_demo)
      + number(row.valor_conciliacao);
    return (
      quantidadeReal === 0 ||
      number(row.quantidade_gravada) !== quantidadeReal ||
      Math.abs(number(row.valor_gravado) - valorReal) > 0.01
    );
  });
  const lotesSemDetalhesTela = lotesIntegridade.filter(
    (row) => number(row.recursos_vinculados) === 0
      && number(row.demonstrativos_vinculados) === 0
      && number(row.conciliados_vinculados) === 0,
  );
  const lotesRecuperadosDoDemonstrativo = lotesIntegridade.filter(
    (row) => number(row.recursos_vinculados) === 0 && number(row.demonstrativos_vinculados) > 0,
  );
  const lotesHibridosCompletos = lotesIntegridade.filter(
    (row) => number(row.recursos_vinculados) > 0
      && (number(row.demonstrativos_vinculados) + number(row.conciliados_vinculados)) > 0
      && !lotesComProblema.includes(row),
  );

  const recursosSemEstabelecimento = recursosVinculos.filter((row) => row.estabelecimento_id == null);
  const recursosSemDemonstrativo = recursosVinculos.filter((row) => number(row.matches_demo) === 0);
  const recursosAmbiguos = recursosVinculos.filter((row) => number(row.matches_demo) > 1);
  const recursosComLoteRecuperavel = recursosVinculos.filter((row) => {
    if (row.lote_id != null || number(row.matches_demo) !== 1 || !row.lotes_demo) return false;
    const ids = String(row.lotes_demo).split(",").filter(Boolean);
    return ids.length === 1;
  });

  const resultado = {
    geradoEm: new Date().toISOString(),
    resumo: {
      estabelecimentosComRecursos: recursosPorEstabelecimento.length,
      recursosAtivos: recursosPorEstabelecimento.reduce((acc, row) => acc + number(row.recursos), 0),
      lotes: lotesIntegridade.length,
      lotesComProblema: lotesComProblema.length,
      lotesSemDetalhesTela: lotesSemDetalhesTela.length,
      lotesRecuperadosDoDemonstrativo: lotesRecuperadosDoDemonstrativo.length,
      lotesHibridosCompletos: lotesHibridosCompletos.length,
      recursosSemEstabelecimento: recursosSemEstabelecimento.length,
      recursosSemDemonstrativo: recursosSemDemonstrativo.length,
      recursosComMatchAmbiguo: recursosAmbiguos.length,
      recursosComLoteRecuperavel: recursosComLoteRecuperavel.length,
    },
    recursosPorEstabelecimento,
    lotesComProblema,
    lotesSemDetalhesTela,
    lotesRecuperadosDoDemonstrativo,
    lotesHibridosCompletos,
    recursosSemEstabelecimento,
    recursosSemDemonstrativo,
    recursosAmbiguos,
    recursosComLoteRecuperavel,
    decisoesIntegridade: decisoesIntegridade[0] ?? null,
    historicosOrfaos: historicosOrfaos[0] ?? null,
    legado: legado[0] ?? null,
  };

  console.log(`RECURSOS_AUDIT_RESULT=${JSON.stringify(resultado)}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
