import { getRawPool } from "../server/db";
import { MODULE_PERMISSION_KEYS, getModulePermissionsForGroup } from "../shared/permissions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [columns] = await pool.execute<any[]>(`
      SELECT COLUMN_NAME columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='permissoesEstabelecimento'
        AND COLUMN_NAME IN ('grupoId','acessoRelatoriosGlosasBi')
      ORDER BY COLUMN_NAME
    `);
    const [summary] = await pool.execute<any[]>(`
      SELECT COUNT(*) total,
        COUNT(DISTINCT userId) usuarios,
        COUNT(DISTINCT estabelecimentoId) estabelecimentos,
        SUM(CASE WHEN grupoId IS NOT NULL THEN 1 ELSE 0 END) comGrupoPersonalizado,
        SUM(CASE WHEN acessoRelatoriosGlosasBi='sim' THEN 1 ELSE 0 END) comBiGlosas,
        SUM(CASE WHEN acessoRelatoriosGlosasBi='sim' AND acessoRelatoriosBi<>'sim' THEN 1 ELSE 0 END) biSemModuloPai
      FROM permissoesEstabelecimento
    `);
    const [orphanGroups] = await pool.execute<any[]>(`
      SELECT COUNT(*) total
      FROM permissoesEstabelecimento pe
      LEFT JOIN gruposServico gs ON gs.id=pe.grupoId
      WHERE pe.grupoId IS NOT NULL AND gs.id IS NULL
    `);
    const [duplicateAccess] = await pool.execute<any[]>(`
      SELECT userId,estabelecimentoId,COUNT(*) total
      FROM permissoesEstabelecimento
      GROUP BY userId,estabelecimentoId
      HAVING COUNT(*)>1
    `);
    const [uniqueIndex] = await pool.execute<any[]>(`
      SELECT INDEX_NAME indexName
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='permissoesEstabelecimento'
        AND INDEX_NAME='uq_permissoes_user_estabelecimento'
      LIMIT 1
    `);

    assert(columns.length === 2, "Colunas novas de permissão não estão disponíveis");
    assert(Number(summary[0]?.total || 0) > 0, "Nenhuma permissão encontrada");
    assert(Number(summary[0]?.biSemModuloPai || 0) === 0, "Há BI de Glosas sem módulo pai habilitado");
    assert(Number(orphanGroups[0]?.total || 0) === 0, "Há vínculos com grupos personalizados inexistentes");
    assert(duplicateAccess.length === 0, "Há permissões duplicadas por usuário e estabelecimento");
    assert(uniqueIndex.length === 1, "Índice único de usuário e estabelecimento ausente");
    assert(MODULE_PERMISSION_KEYS.length >= 40, "Catálogo de módulos incompleto");
    assert(getModulePermissionsForGroup("gestor").acessoPermissoes === "sim", "Perfil Gestor sem gestão de permissões");
    assert(getModulePermissionsForGroup("visualizador").acessoRelatoriosBi === "nao", "Visualizador recebeu BI indevidamente");

    console.log(JSON.stringify({
      validado: true,
      catalogoModulos: MODULE_PERMISSION_KEYS.length,
      permissoes: {
        total: Number(summary[0].total),
        usuarios: Number(summary[0].usuarios),
        estabelecimentos: Number(summary[0].estabelecimentos),
        comGrupoPersonalizado: Number(summary[0].comGrupoPersonalizado),
        comBiGlosas: Number(summary[0].comBiGlosas),
      },
      biSemModuloPai: 0,
      gruposOrfaos: 0,
      vinculosDuplicados: 0,
      indiceUnico: true,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
