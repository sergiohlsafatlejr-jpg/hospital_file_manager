import pg from "pg";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { relatorioAtendimentosCache, relatorioAtendimentosSyncMeta } from "../drizzle/schema-integracao";
import { eq, and, gte, lte, like, sql, count, desc } from "drizzle-orm";

const { Pool } = pg;

let warleinePool: pg.Pool | null = null;

function getWarleinePool(): pg.Pool {
  if (!warleinePool) {
    warleinePool = new Pool({
      host: ENV.warleineDbHost,
      port: parseInt(ENV.warleineDbPort, 10),
      database: ENV.warleineDbName,
      user: ENV.warleineDbUser,
      password: ENV.warleineDbPassword,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
  }
  return warleinePool;
}

export interface FiltroRelatorioAtendimentos {
  dataInicio: string;
  dataFim: string;
  tipoAtendimento?: string;
  codServ?: string;
  codPlaco?: string;
  codPrest?: string;
  codCc?: string;
  carater?: string;
  limit?: number;
  offset?: number;
}

export interface AtendimentoRelatorio {
  numatend: string;
  tipo_atendimento: string;
  codserv: string;
  servico: string | null;
  codplaco: string;
  plano_convenio: string | null;
  codproven: string | null;
  proveniente: string | null;
  data_atendimento: string;
  data_saida: string | null;
  censo: string | null;
  codcc: string | null;
  centro_custo: string | null;
  codprest: string | null;
  prestador: string | null;
  procprin: string | null;
  procedimento_principal: string | null;
  cidprin: string | null;
  diagnostico_cid: string | null;
  carater_atendimento: string | null;
  codpac: string | null;
  paciente: string | null;
}

export interface RelatorioAtendimentosResult {
  dados: AtendimentoRelatorio[];
  total: number;
  pagina: number;
  totalPaginas: number;
  fonte: "cache_local" | "postgresql_direto";
}

// ============================================================
// BUSCAR ATENDIMENTOS - Tenta cache local, fallback PostgreSQL
// ============================================================

export async function buscarAtendimentos(
  filtros: FiltroRelatorioAtendimentos
): Promise<RelatorioAtendimentosResult> {
  const limit = filtros.limit || 100;
  const offset = filtros.offset || 0;

  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);
      
      if (cacheCount[0]?.total > 0) {
        return buscarDoCache(db, filtros, limit, offset);
      }
    }
  } catch (e) {
    console.warn("[RelatorioAtendimentos] Cache local indisponível, usando PostgreSQL:", (e as Error).message);
  }

  // Fallback: PostgreSQL direto
  return buscarDoPostgresql(filtros, limit, offset);
}

// ============================================================
// BUSCAR DO CACHE LOCAL (MySQL/TiDB)
// ============================================================

async function buscarDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  filtros: FiltroRelatorioAtendimentos,
  limit: number,
  offset: number
): Promise<RelatorioAtendimentosResult> {
  const conditions: any[] = [];

  // Filtro de data
  conditions.push(gte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataInicio)));
  conditions.push(lte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataFim)));

  // Filtros opcionais
  if (filtros.tipoAtendimento) {
    // Mapear código para descrição
    const tipoMap: Record<string, string> = {
      "I": "Internação",
      "A": "Ambulatorial",
      "E": "Emergência",
      "U": "Urgência",
    };
    const tipoDesc = tipoMap[filtros.tipoAtendimento] || filtros.tipoAtendimento;
    conditions.push(eq(relatorioAtendimentosCache.tipoAtendimento, tipoDesc));
  }

  if (filtros.codServ) {
    conditions.push(eq(relatorioAtendimentosCache.codserv, filtros.codServ));
  }

  if (filtros.codPlaco) {
    conditions.push(eq(relatorioAtendimentosCache.codplaco, filtros.codPlaco));
  }

  if (filtros.codPrest) {
    conditions.push(eq(relatorioAtendimentosCache.codprest, filtros.codPrest));
  }

  if (filtros.codCc) {
    conditions.push(eq(relatorioAtendimentosCache.codcc, filtros.codCc));
  }

  if (filtros.carater) {
    const caraterMap: Record<string, string> = {
      "UR": "Urgência",
      "EL": "Eletivo",
    };
    const caraterDesc = caraterMap[filtros.carater] || filtros.carater;
    conditions.push(eq(relatorioAtendimentosCache.caraterAtendimento, caraterDesc));
  }

  const whereClause = and(...conditions);

  // Contagem total
  const countResult = await db
    .select({ total: count() })
    .from(relatorioAtendimentosCache)
    .where(whereClause);
  
  const total = countResult[0]?.total || 0;

  // Buscar dados
  const dados = await db
    .select()
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .orderBy(desc(relatorioAtendimentosCache.dataAtendimento))
    .limit(limit)
    .offset(offset);

  // Mapear para o formato esperado
  const dadosMapeados: AtendimentoRelatorio[] = dados.map((d) => ({
    numatend: d.numatend,
    tipo_atendimento: d.tipoAtendimento || "",
    codserv: d.codserv || "",
    servico: d.servico,
    codplaco: d.codplaco || "",
    plano_convenio: d.planoConvenio,
    codproven: d.codproven,
    proveniente: d.proveniente,
    data_atendimento: d.dataAtendimento ? d.dataAtendimento.toISOString() : "",
    data_saida: d.dataSaida ? d.dataSaida.toISOString() : null,
    censo: d.censo,
    codcc: d.codcc,
    centro_custo: d.centroCusto,
    codprest: d.codprest,
    prestador: d.prestador,
    procprin: d.procprin,
    procedimento_principal: d.procedimentoPrincipal,
    cidprin: d.cidprin,
    diagnostico_cid: d.diagnosticoCid,
    carater_atendimento: d.caraterAtendimento,
    codpac: d.codpac,
    paciente: d.paciente,
  }));

  return {
    dados: dadosMapeados,
    total,
    pagina: Math.floor(offset / limit) + 1,
    totalPaginas: Math.ceil(total / limit),
    fonte: "cache_local",
  };
}

// ============================================================
// BUSCAR DO POSTGRESQL DIRETO (Fallback)
// ============================================================

async function buscarDoPostgresql(
  filtros: FiltroRelatorioAtendimentos,
  limit: number,
  offset: number
): Promise<RelatorioAtendimentosResult> {
  const client = await getWarleinePool().connect();
  try {
    // Construir WHERE dinâmico
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    conditions.push(`a.datatend >= $${paramIndex}`);
    params.push(filtros.dataInicio);
    paramIndex++;

    conditions.push(`a.datatend <= $${paramIndex}`);
    params.push(filtros.dataFim);
    paramIndex++;

    if (filtros.tipoAtendimento) {
      conditions.push(`a.tipoatend = $${paramIndex}`);
      params.push(filtros.tipoAtendimento);
      paramIndex++;
    }

    if (filtros.codServ) {
      conditions.push(`a.codserv = $${paramIndex}`);
      params.push(filtros.codServ);
      paramIndex++;
    }

    if (filtros.codPlaco) {
      conditions.push(`a.codplaco = $${paramIndex}`);
      params.push(filtros.codPlaco);
      paramIndex++;
    }

    if (filtros.codPrest) {
      conditions.push(`a.codprest = $${paramIndex}`);
      params.push(filtros.codPrest);
      paramIndex++;
    }

    if (filtros.codCc) {
      conditions.push(`a.codcc = $${paramIndex}`);
      params.push(filtros.codCc);
      paramIndex++;
    }

    if (filtros.carater) {
      conditions.push(`a.carater = $${paramIndex}`);
      params.push(filtros.carater);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Query de contagem
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM "PACIENTE".arqatend a 
      ${whereClause}
    `;
    const countResult = await client.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Query principal
    const query = `
      SELECT
        a.numatend,
        CASE a.tipoatend 
          WHEN 'A' THEN 'Ambulatorial'
          WHEN 'I' THEN 'Internação'
          WHEN 'E' THEN 'Emergência'
          WHEN 'U' THEN 'Urgência'
          ELSE a.tipoatend
        END AS tipo_atendimento,
        a.codserv,
        s.nomeserv AS servico,
        a.codplaco,
        p.nomeplaco AS plano_convenio,
        a.codproven,
        pv.nomeproven AS proveniente,
        a.datatend AS data_atendimento,
        a.datasai AS data_saida,
        a.censo,
        a.codcc,
        cc.nomecc AS centro_custo,
        a.codprest,
        pr.nomeprest AS prestador,
        a.procprin,
        COALESCE(a.dsprocprin, fp.descrproc) AS procedimento_principal,
        a.cidprin,
        cid.descrcid AS diagnostico_cid,
        CASE a.carater
          WHEN 'UR' THEN 'Urgência'
          WHEN 'EL' THEN 'Eletivo'
          ELSE a.carater
        END AS carater_atendimento,
        a.codpac,
        pac.nomepac AS paciente
      FROM "PACIENTE".arqatend a
      LEFT JOIN "PACIENTE".cadserv s ON s.codserv = a.codserv
      LEFT JOIN "PACIENTE".cadplaco p ON p.codplaco = a.codplaco
      LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
      LEFT JOIN "PACIENTE".cadcc cc ON cc.codcc = a.codcc
      LEFT JOIN "PACIENTE".cadprest pr ON pr.codprest = a.codprest
      LEFT JOIN "PACIENTE".filanpro fp ON fp.codproc = a.procprin
      LEFT JOIN "PACIENTE".tabcid cid ON cid.codcid = a.cidprin
      LEFT JOIN "PACIENTE".cadpac pac ON pac.codpac = a.codpac
      ${whereClause}
      ORDER BY a.datatend DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await client.query(query, [...params, limit, offset]);

    return {
      dados: dataResult.rows,
      total,
      pagina: Math.floor(offset / limit) + 1,
      totalPaginas: Math.ceil(total / limit),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ============================================================
// BUSCAR OPÇÕES DE FILTRO - Cache local ou PostgreSQL
// ============================================================

export async function buscarOpcoesFiltro(): Promise<{
  servicos: { codserv: string; nomeserv: string }[];
  planos: { codplaco: string; nomeplaco: string }[];
  centrosCusto: { codcc: string; nomecc: string }[];
  prestadores: { codprest: string; nomeprest: string }[];
  fonte: "cache_local" | "postgresql_direto";
}> {
  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);
      
      if (cacheCount[0]?.total > 0) {
        return buscarOpcoesFiltroDoCache(db);
      }
    }
  } catch (e) {
    console.warn("[RelatorioAtendimentos] Cache local indisponível para filtros:", (e as Error).message);
  }

  // Fallback: PostgreSQL direto
  return buscarOpcoesFiltroDoPostgresql();
}

async function buscarOpcoesFiltroDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<{
  servicos: { codserv: string; nomeserv: string }[];
  planos: { codplaco: string; nomeplaco: string }[];
  centrosCusto: { codcc: string; nomecc: string }[];
  prestadores: { codprest: string; nomeprest: string }[];
  fonte: "cache_local" | "postgresql_direto";
}> {
  const [servicos, planos, centrosCusto, prestadores] = await Promise.all([
    db.selectDistinct({
      codserv: relatorioAtendimentosCache.codserv,
      nomeserv: relatorioAtendimentosCache.servico,
    })
    .from(relatorioAtendimentosCache)
    .where(sql`${relatorioAtendimentosCache.codserv} IS NOT NULL`)
    .orderBy(relatorioAtendimentosCache.servico),

    db.selectDistinct({
      codplaco: relatorioAtendimentosCache.codplaco,
      nomeplaco: relatorioAtendimentosCache.planoConvenio,
    })
    .from(relatorioAtendimentosCache)
    .where(sql`${relatorioAtendimentosCache.codplaco} IS NOT NULL`)
    .orderBy(relatorioAtendimentosCache.planoConvenio),

    db.selectDistinct({
      codcc: relatorioAtendimentosCache.codcc,
      nomecc: relatorioAtendimentosCache.centroCusto,
    })
    .from(relatorioAtendimentosCache)
    .where(sql`${relatorioAtendimentosCache.codcc} IS NOT NULL`)
    .orderBy(relatorioAtendimentosCache.centroCusto),

    db.selectDistinct({
      codprest: relatorioAtendimentosCache.codprest,
      nomeprest: relatorioAtendimentosCache.prestador,
    })
    .from(relatorioAtendimentosCache)
    .where(sql`${relatorioAtendimentosCache.codprest} IS NOT NULL`)
    .orderBy(relatorioAtendimentosCache.prestador)
    .limit(500),
  ]);

  return {
    servicos: servicos.filter(s => s.codserv) as { codserv: string; nomeserv: string }[],
    planos: planos.filter(p => p.codplaco) as { codplaco: string; nomeplaco: string }[],
    centrosCusto: centrosCusto.filter(c => c.codcc) as { codcc: string; nomecc: string }[],
    prestadores: prestadores.filter(p => p.codprest) as { codprest: string; nomeprest: string }[],
    fonte: "cache_local",
  };
}

async function buscarOpcoesFiltroDoPostgresql(): Promise<{
  servicos: { codserv: string; nomeserv: string }[];
  planos: { codplaco: string; nomeplaco: string }[];
  centrosCusto: { codcc: string; nomecc: string }[];
  prestadores: { codprest: string; nomeprest: string }[];
  fonte: "cache_local" | "postgresql_direto";
}> {
  const client = await getWarleinePool().connect();
  try {
    const [servicos, planos, centrosCusto, prestadores] = await Promise.all([
      client.query(`SELECT codserv, nomeserv FROM "PACIENTE".cadserv WHERE inativo IS NULL OR inativo != 'S' ORDER BY nomeserv`),
      client.query(`SELECT codplaco, nomeplaco FROM "PACIENTE".cadplaco WHERE inativo IS NULL OR inativo != 'S' ORDER BY nomeplaco`),
      client.query(`SELECT codcc, nomecc FROM "PACIENTE".cadcc WHERE inativo IS NULL OR inativo != 'S' ORDER BY nomecc`),
      client.query(`SELECT codprest, nomeprest FROM "PACIENTE".cadprest WHERE inativo IS NULL OR inativo != 'S' ORDER BY nomeprest LIMIT 500`),
    ]);

    return {
      servicos: servicos.rows,
      planos: planos.rows,
      centrosCusto: centrosCusto.rows,
      prestadores: prestadores.rows,
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ============================================================
// SINCRONIZAÇÃO: Warleine → Cache Local
// ============================================================

export async function sincronizarRelatorioAtendimentos(
  estabelecimentoId: number,
  dataInicio: string,
  dataFim: string,
  executadoPor?: number,
  executadoPorNome?: string
): Promise<{
  sucesso: boolean;
  mensagem: string;
  totalRegistros: number;
  duracaoSegundos: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      sucesso: false,
      mensagem: "Banco de dados local não disponível",
      totalRegistros: 0,
      duracaoSegundos: 0,
    };
  }

  const inicio = Date.now();

  // Atualizar status para em_andamento
  await upsertSyncMeta(db, estabelecimentoId, {
    status: "em_andamento",
    dataInicioSync: dataInicio,
    dataFimSync: dataFim,
    executadoPor: executadoPor || null,
    executadoPorNome: executadoPorNome || null,
  });

  try {
    // Buscar dados do PostgreSQL
    const client = await getWarleinePool().connect();
    let totalRegistros = 0;

    try {
      const query = `
        SELECT
          a.numatend,
          CASE a.tipoatend 
            WHEN 'A' THEN 'Ambulatorial'
            WHEN 'I' THEN 'Internação'
            WHEN 'E' THEN 'Emergência'
            WHEN 'U' THEN 'Urgência'
            ELSE a.tipoatend
          END AS tipo_atendimento,
          a.codserv,
          s.nomeserv AS servico,
          a.codplaco,
          p.nomeplaco AS plano_convenio,
          a.codproven,
          pv.nomeproven AS proveniente,
          a.datatend AS data_atendimento,
          a.datasai AS data_saida,
          a.censo,
          a.codcc,
          cc.nomecc AS centro_custo,
          a.codprest,
          pr.nomeprest AS prestador,
          a.procprin,
          COALESCE(a.dsprocprin, fp.descrproc) AS procedimento_principal,
          a.cidprin,
          cid.descrcid AS diagnostico_cid,
          CASE a.carater
            WHEN 'UR' THEN 'Urgência'
            WHEN 'EL' THEN 'Eletivo'
            ELSE a.carater
          END AS carater_atendimento,
          a.codpac,
          pac.nomepac AS paciente
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cadserv s ON s.codserv = a.codserv
        LEFT JOIN "PACIENTE".cadplaco p ON p.codplaco = a.codplaco
        LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
        LEFT JOIN "PACIENTE".cadcc cc ON cc.codcc = a.codcc
        LEFT JOIN "PACIENTE".cadprest pr ON pr.codprest = a.codprest
        LEFT JOIN "PACIENTE".filanpro fp ON fp.codproc = a.procprin
        LEFT JOIN "PACIENTE".tabcid cid ON cid.codcid = a.cidprin
        LEFT JOIN "PACIENTE".cadpac pac ON pac.codpac = a.codpac
        WHERE a.datatend >= $1 AND a.datatend <= $2
        ORDER BY a.datatend DESC
      `;

      const result = await client.query(query, [dataInicio, dataFim]);
      const rows = result.rows;
      totalRegistros = rows.length;

      if (totalRegistros > 0) {
        // Limpar cache antigo para o período
        await db.delete(relatorioAtendimentosCache)
          .where(
            and(
              eq(relatorioAtendimentosCache.estabelecimentoId, estabelecimentoId),
              gte(relatorioAtendimentosCache.dataAtendimento, new Date(dataInicio)),
              lte(relatorioAtendimentosCache.dataAtendimento, new Date(dataFim))
            )
          );

        // Inserir em lotes de 500
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          await db.insert(relatorioAtendimentosCache).values(
            batch.map((row: any) => ({
              estabelecimentoId,
              numatend: String(row.numatend || ""),
              tipoAtendimento: row.tipo_atendimento || null,
              codserv: row.codserv ? String(row.codserv) : null,
              servico: row.servico || null,
              codplaco: row.codplaco ? String(row.codplaco) : null,
              planoConvenio: row.plano_convenio || null,
              codproven: row.codproven ? String(row.codproven) : null,
              proveniente: row.proveniente || null,
              dataAtendimento: row.data_atendimento ? new Date(row.data_atendimento) : null,
              dataSaida: row.data_saida ? new Date(row.data_saida) : null,
              censo: row.censo || null,
              codcc: row.codcc ? String(row.codcc) : null,
              centroCusto: row.centro_custo || null,
              codprest: row.codprest ? String(row.codprest) : null,
              prestador: row.prestador || null,
              procprin: row.procprin ? String(row.procprin) : null,
              procedimentoPrincipal: row.procedimento_principal || null,
              cidprin: row.cidprin || null,
              diagnosticoCid: row.diagnostico_cid || null,
              caraterAtendimento: row.carater_atendimento || null,
              codpac: row.codpac ? String(row.codpac) : null,
              paciente: row.paciente || null,
            }))
          );
        }
      }
    } finally {
      client.release();
    }

    const duracaoSegundos = Math.round((Date.now() - inicio) / 1000);

    // Atualizar status para sucesso
    await upsertSyncMeta(db, estabelecimentoId, {
      status: "sucesso",
      ultimaSincronizacao: new Date(),
      totalRegistros,
      duracaoSegundos,
      mensagemErro: null,
    });

    return {
      sucesso: true,
      mensagem: `Sincronizados ${totalRegistros.toLocaleString("pt-BR")} atendimentos em ${duracaoSegundos}s`,
      totalRegistros,
      duracaoSegundos,
    };
  } catch (error) {
    const duracaoSegundos = Math.round((Date.now() - inicio) / 1000);
    const mensagemErro = (error as Error).message;

    // Atualizar status para erro
    await upsertSyncMeta(db, estabelecimentoId, {
      status: "erro",
      duracaoSegundos,
      mensagemErro,
    });

    return {
      sucesso: false,
      mensagem: mensagemErro,
      totalRegistros: 0,
      duracaoSegundos,
    };
  }
}

// ============================================================
// STATUS DE SINCRONIZAÇÃO
// ============================================================

export async function obterStatusSincronizacao(estabelecimentoId: number): Promise<{
  status: string;
  ultimaSincronizacao: Date | null;
  totalRegistrosCache: number;
  duracaoSegundos: number;
  mensagemErro: string | null;
  dataInicioSync: string | null;
  dataFimSync: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Buscar metadados de sync
    const meta = await db
      .select()
      .from(relatorioAtendimentosSyncMeta)
      .where(eq(relatorioAtendimentosSyncMeta.estabelecimentoId, estabelecimentoId))
      .limit(1);

    // Contar registros no cache
    const cacheCount = await db
      .select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(eq(relatorioAtendimentosCache.estabelecimentoId, estabelecimentoId));

    const totalRegistrosCache = cacheCount[0]?.total || 0;

    if (meta.length === 0) {
      return {
        status: "nunca",
        ultimaSincronizacao: null,
        totalRegistrosCache,
        duracaoSegundos: 0,
        mensagemErro: null,
        dataInicioSync: null,
        dataFimSync: null,
      };
    }

    const m = meta[0];
    return {
      status: m.status,
      ultimaSincronizacao: m.ultimaSincronizacao,
      totalRegistrosCache,
      duracaoSegundos: m.duracaoSegundos || 0,
      mensagemErro: m.mensagemErro,
      dataInicioSync: m.dataInicioSync,
      dataFimSync: m.dataFimSync,
    };
  } catch (e) {
    console.warn("[RelatorioAtendimentos] Erro ao obter status:", (e as Error).message);
    return null;
  }
}

// ============================================================
// HELPER: Upsert sync metadata
// ============================================================

async function upsertSyncMeta(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  estabelecimentoId: number,
  data: Partial<{
    status: string;
    ultimaSincronizacao: Date | null;
    dataInicioSync: string | null;
    dataFimSync: string | null;
    totalRegistros: number;
    duracaoSegundos: number;
    mensagemErro: string | null;
    executadoPor: number | null;
    executadoPorNome: string | null;
  }>
) {
  const existing = await db
    .select()
    .from(relatorioAtendimentosSyncMeta)
    .where(eq(relatorioAtendimentosSyncMeta.estabelecimentoId, estabelecimentoId))
    .limit(1);

  const updateData: any = { ...data, atualizadoEm: new Date() };

  if (existing.length === 0) {
    await db.insert(relatorioAtendimentosSyncMeta).values({
      estabelecimentoId,
      ...updateData,
    });
  } else {
    await db
      .update(relatorioAtendimentosSyncMeta)
      .set(updateData)
      .where(eq(relatorioAtendimentosSyncMeta.estabelecimentoId, estabelecimentoId));
  }
}
