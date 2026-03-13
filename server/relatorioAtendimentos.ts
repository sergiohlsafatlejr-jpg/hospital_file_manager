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
  dsprocprin: string | null;
  procedimento_principal: string | null;
  cidprin: string | null;
  diagnostico_cid: string | null;
  carater_atendimento: string | null;
  codpac: string | null;
  paciente: string | null;
  codesp: string | null;
  especialidade: string | null;
  opecad: string | null;
  operador_cadastro: string | null;
  codcbo: string | null;
  descricao_cbo: string | null;
  sexo_paciente: string | null;
  cep_paciente: string | null;
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

  console.log("[RelatorioAtendimentos] buscarAtendimentos chamado com filtros:", JSON.stringify(filtros));

  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);
      
      console.log("[RelatorioAtendimentos] Cache count:", cacheCount[0]?.total);
      if (cacheCount[0]?.total > 0) {
        const result = await buscarDoCache(db, filtros, limit, offset);
        console.log("[RelatorioAtendimentos] Cache result: total=", result.total, "dados.length=", result.dados.length);
        return result;
      }
    }
  } catch (e) {
    console.error("[RelatorioAtendimentos] Cache local ERRO:", (e as Error).message, (e as Error).stack);
  }

  // Fallback: PostgreSQL direto
  console.log("[RelatorioAtendimentos] Usando PostgreSQL direto");
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
    conditions.push(eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, tipoDesc));
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
    conditions.push(eq(relatorioAtendimentosCache.caraterDescricao, caraterDesc));
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
    tipo_atendimento: d.tipoAtendimentoDescricao || d.tipoAtendimento || "",
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
    procedimento_principal: d.dsprocprin || null,
    cidprin: d.cidprin,
    diagnostico_cid: d.diagnosticoCid,
    carater_atendimento: d.caraterDescricao || d.caraterAtendimento || null,
    codpac: d.codpac,
    paciente: d.paciente,
    dsprocprin: d.dsprocprin || null,
    codesp: d.codesp || null,
    especialidade: d.especialidade || null,
    opecad: d.opecad || null,
    operador_cadastro: d.operadorCadastro || null,
    codcbo: d.codcbo || null,
    descricao_cbo: d.descricaoCbo || null,
    sexo_paciente: d.sexoPaciente || null,
    cep_paciente: d.cepPaciente || null,
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
        a.dsprocprin,
        COALESCE(a.dsprocprin, fp.descrproc) AS procedimento_principal,
        a.cidprin,
        cid.descrcid AS diagnostico_cid,
        CASE a.carater
          WHEN 'UR' THEN 'Urgência'
          WHEN 'EL' THEN 'Eletivo'
          ELSE a.carater
        END AS carater_atendimento,
        a.codpac,
        pac.nomepac AS paciente,
        a.codesp,
        ce.nomeesp AS especialidade,
        a.opecad,
        co.nomeope AS operador_cadastro,
        a.codcbo,
        tc.descricbo AS descricao_cbo,
        pac.sexo AS sexo_paciente,
        pac.ceppac AS cep_paciente
      FROM "PACIENTE".arqatend a
      LEFT JOIN "PACIENTE".cadserv s ON s.codserv = a.codserv
      LEFT JOIN "PACIENTE".cadplaco p ON p.codplaco = a.codplaco
      LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
      LEFT JOIN "PACIENTE".cadcc cc ON cc.codcc = a.codcc
      LEFT JOIN "PACIENTE".cadprest pr ON pr.codprest = a.codprest
      LEFT JOIN "PACIENTE".filanpro fp ON fp.codproc = a.procprin
      LEFT JOIN "PACIENTE".tabcid cid ON cid.codcid = a.cidprin
      LEFT JOIN "PACIENTE".cadpac pac ON pac.codpac = a.codpac
      LEFT JOIN "PACIENTE".cadesp ce ON ce.codesp = a.codesp
      LEFT JOIN "PACIENTE".cadope co ON co.codope = a.opecad
      LEFT JOIN "PACIENTE".tabcbo tc ON tc.codcbo = a.codcbo
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
          a.dsprocprin,
          COALESCE(a.dsprocprin, fp.descrproc) AS procedimento_principal,
          a.cidprin,
          cid.descrcid AS diagnostico_cid,
          CASE a.carater
            WHEN 'UR' THEN 'Urgência'
            WHEN 'EL' THEN 'Eletivo'
            ELSE a.carater
          END AS carater_atendimento,
          a.codpac,
          pac.nomepac AS paciente,
          a.codesp,
          ce.nomeesp AS especialidade,
          a.opecad,
          co.nomeope AS operador_cadastro,
          a.codcbo,
          tc.descricbo AS descricao_cbo,
          pac.sexo AS sexo_paciente,
          pac.ceppac AS cep_paciente
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cadserv s ON s.codserv = a.codserv
        LEFT JOIN "PACIENTE".cadplaco p ON p.codplaco = a.codplaco
        LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
        LEFT JOIN "PACIENTE".cadcc cc ON cc.codcc = a.codcc
        LEFT JOIN "PACIENTE".cadprest pr ON pr.codprest = a.codprest
        LEFT JOIN "PACIENTE".filanpro fp ON fp.codproc = a.procprin
        LEFT JOIN "PACIENTE".tabcid cid ON cid.codcid = a.cidprin
        LEFT JOIN "PACIENTE".cadpac pac ON pac.codpac = a.codpac
        LEFT JOIN "PACIENTE".cadesp ce ON ce.codesp = a.codesp
        LEFT JOIN "PACIENTE".cadope co ON co.codope = a.opecad
        LEFT JOIN "PACIENTE".tabcbo tc ON tc.codcbo = a.codcbo
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
              tipoAtendimentoDescricao: row.tipo_atendimento || null,
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
              dsprocprin: row.dsprocprin || row.procedimento_principal || null,
              cidprin: row.cidprin || null,
              diagnosticoCid: row.diagnostico_cid || null,
              caraterDescricao: row.carater_atendimento || null,
              codpac: row.codpac ? String(row.codpac) : null,
              paciente: row.paciente || null,
              codesp: row.codesp ? String(row.codesp) : null,
              especialidade: row.especialidade || null,
              opecad: row.opecad ? String(row.opecad) : null,
              operadorCadastro: row.operador_cadastro || null,
              codcbo: row.codcbo ? String(row.codcbo) : null,
              descricaoCbo: row.descricao_cbo || null,
              sexoPaciente: row.sexo_paciente || null,
              cepPaciente: row.cep_paciente || null,
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


// ============================================================
// MÉTRICAS AGREGADAS PARA DASHBOARD
// ============================================================

export interface MetricaAgrupada {
  nome: string;
  codigo: string | null;
  total: number;
}

export interface MetricaMesAno {
  mesAno: string; // "2025-01"
  total: number;
}

export interface MetricasDashboard {
  totalAtendimentos: number;
  totalMedicos: number;
  totalConvenios: number;
  totalProcedimentos: number;
  porMedico: MetricaAgrupada[];
  porTipo: MetricaAgrupada[];
  porPlano: MetricaAgrupada[];
  porServico: MetricaAgrupada[];
  porMesAno: MetricaMesAno[];
  porCid: MetricaAgrupada[];
  porProcedimento: MetricaAgrupada[];
  fonte: "cache_local" | "postgresql_direto";
}

export interface FiltrosDashboard {
  dataInicio: string;
  dataFim: string;
  tipoAtendimento?: string;
  codPlaco?: string;
  codPrest?: string;
  codServ?: string;
}

export async function buscarMetricasDashboard(
  filtros: FiltrosDashboard
): Promise<MetricasDashboard> {
  console.log("[Dashboard] buscarMetricasDashboard chamado com filtros:", JSON.stringify(filtros));
  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      console.log("[Dashboard] Cache count:", cacheCount[0]?.total);
      if (cacheCount[0]?.total > 0) {
        const result = await buscarMetricasDoCache(db, filtros as FiltrosDashboard);
        console.log("[Dashboard] Resultado do cache - totalAtendimentos:", result.totalAtendimentos, "porTipo:", result.porTipo?.length, "porMedico:", result.porMedico?.length);
        return result;
      }
    }
  } catch (e) {
    console.error("[Dashboard] Cache local ERRO:", (e as Error).message, (e as Error).stack);
  }

  // Fallback: PostgreSQL direto
  return buscarMetricasDoPostgresql(filtros);
}

async function buscarMetricasDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  filtros: FiltrosDashboard
): Promise<MetricasDashboard> {
  const baseConditions: any[] = [
    gte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataInicio)),
    lte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataFim)),
  ];

  // Filtros opcionais
  if (filtros.tipoAtendimento) {
    const tipoMap: Record<string, string> = {
      "I": "Internação", "A": "Ambulatorial", "E": "Emergência", "U": "Urgência",
    };
    const tipoDesc = tipoMap[filtros.tipoAtendimento] || filtros.tipoAtendimento;
    baseConditions.push(eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, tipoDesc));
  }
  if (filtros.codPlaco) {
    baseConditions.push(eq(relatorioAtendimentosCache.codplaco, filtros.codPlaco));
  }
  if (filtros.codPrest) {
    baseConditions.push(eq(relatorioAtendimentosCache.codprest, filtros.codPrest));
  }
  if (filtros.codServ) {
    baseConditions.push(eq(relatorioAtendimentosCache.codserv, filtros.codServ));
  }

  const dateCondition = and(...baseConditions);

  const [
    totalResult,
    porMedico,
    porTipo,
    porPlano,
    porServico,
    porMesAno,
    porCid,
    porProcedimento,
  ] = await Promise.all([
    // Total geral
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(dateCondition),

    // Por médico (top 20)
    db.select({
      nome: relatorioAtendimentosCache.prestador,
      codigo: relatorioAtendimentosCache.codprest,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.codprest} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.prestador, relatorioAtendimentosCache.codprest)
      .orderBy(desc(count()))
      .limit(20),

    // Por tipo
    db.select({
      nome: relatorioAtendimentosCache.tipoAtendimentoDescricao,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.tipoAtendimentoDescricao} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.tipoAtendimentoDescricao)
      .orderBy(desc(count())),

    // Por plano/convênio (top 20)
    db.select({
      nome: relatorioAtendimentosCache.planoConvenio,
      codigo: relatorioAtendimentosCache.codplaco,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.codplaco} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.planoConvenio, relatorioAtendimentosCache.codplaco)
      .orderBy(desc(count()))
      .limit(20),

    // Por serviço
    db.select({
      nome: relatorioAtendimentosCache.servico,
      codigo: relatorioAtendimentosCache.codserv,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.codserv} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.servico, relatorioAtendimentosCache.codserv)
      .orderBy(desc(count())),

    // Por mês/ano
    db.select({
      mesAno: sql<string>`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(dateCondition)
      .groupBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`),

    // Por CID (top 20)
    db.select({
      nome: relatorioAtendimentosCache.diagnosticoCid,
      codigo: relatorioAtendimentosCache.cidprin,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.cidprin} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.diagnosticoCid, relatorioAtendimentosCache.cidprin)
      .orderBy(desc(count()))
      .limit(20),

    // Por procedimento (top 20)
    db.select({
      nome: relatorioAtendimentosCache.dsprocprin,
      codigo: relatorioAtendimentosCache.procprin,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(dateCondition, sql`${relatorioAtendimentosCache.procprin} IS NOT NULL`))
      .groupBy(relatorioAtendimentosCache.dsprocprin, relatorioAtendimentosCache.procprin)
      .orderBy(desc(count()))
      .limit(20),
  ]);

  const totalAtendimentos = totalResult[0]?.total || 0;
  const medicosUnicos = new Set(porMedico.map(m => m.codigo)).size;
  const conveniosUnicos = new Set(porPlano.map(p => p.codigo)).size;
  const procedimentosUnicos = new Set(porProcedimento.map(p => p.codigo)).size;

  return {
    totalAtendimentos,
    totalMedicos: medicosUnicos,
    totalConvenios: conveniosUnicos,
    totalProcedimentos: procedimentosUnicos,
    porMedico: porMedico.map(m => ({ nome: m.nome || "Sem nome", codigo: m.codigo, total: m.total })),
    porTipo: porTipo.map(t => ({ nome: t.nome || "Outros", codigo: null, total: t.total })),
    porPlano: porPlano.map(p => ({ nome: p.nome || "Sem plano", codigo: p.codigo, total: p.total })),
    porServico: porServico.map(s => ({ nome: s.nome || "Sem serviço", codigo: s.codigo, total: s.total })),
    porMesAno: porMesAno.map(m => ({ mesAno: m.mesAno, total: m.total })),
    porCid: porCid.map(c => ({ nome: c.nome || c.codigo || "Sem CID", codigo: c.codigo, total: c.total })),
    porProcedimento: porProcedimento.map(p => ({ nome: p.nome || p.codigo || "Sem procedimento", codigo: p.codigo, total: p.total })),
    fonte: "cache_local",
  };
}

async function buscarMetricasDoPostgresql(
  filtros: FiltrosDashboard
): Promise<MetricasDashboard> {
  const client = await getWarleinePool().connect();
  try {
    const params: any[] = [filtros.dataInicio, filtros.dataFim];
    let paramIndex = 3;
    const extraConditions: string[] = [];

    if (filtros.tipoAtendimento) {
      extraConditions.push(`a.tipoatend = $${paramIndex}`);
      params.push(filtros.tipoAtendimento);
      paramIndex++;
    }
    if (filtros.codPlaco) {
      extraConditions.push(`a.codplaco = $${paramIndex}`);
      params.push(filtros.codPlaco);
      paramIndex++;
    }
    if (filtros.codPrest) {
      extraConditions.push(`a.codprest = $${paramIndex}`);
      params.push(filtros.codPrest);
      paramIndex++;
    }
    if (filtros.codServ) {
      extraConditions.push(`a.codserv = $${paramIndex}`);
      params.push(filtros.codServ);
      paramIndex++;
    }

    const extraWhere = extraConditions.length > 0 ? ` AND ${extraConditions.join(" AND ")}` : "";
    const dateWhere = `WHERE a.datatend >= $1 AND a.datatend <= $2${extraWhere}`;

    const [
      totalResult,
      porMedicoResult,
      porTipoResult,
      porPlanoResult,
      porServicoResult,
      porMesAnoResult,
      porCidResult,
      porProcedimentoResult,
    ] = await Promise.all([
      // Total
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere}`, params),

      // Por médico (top 20)
      client.query(`
        SELECT pr.nomeprest AS nome, a.codprest AS codigo, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cadprest pr ON pr.codprest = a.codprest
        ${dateWhere} AND a.codprest IS NOT NULL
        GROUP BY pr.nomeprest, a.codprest
        ORDER BY total DESC LIMIT 20
      `, params),

      // Por tipo
      client.query(`
        SELECT 
          CASE a.tipoatend 
            WHEN 'A' THEN 'Ambulatorial'
            WHEN 'I' THEN 'Internação'
            WHEN 'E' THEN 'Emergência'
            WHEN 'U' THEN 'Urgência'
            ELSE a.tipoatend
          END AS nome,
          COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        ${dateWhere} AND a.tipoatend IS NOT NULL
        GROUP BY a.tipoatend
        ORDER BY total DESC
      `, params),

      // Por plano (top 20)
      client.query(`
        SELECT p.nomeplaco AS nome, a.codplaco AS codigo, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cadplaco p ON p.codplaco = a.codplaco
        ${dateWhere} AND a.codplaco IS NOT NULL
        GROUP BY p.nomeplaco, a.codplaco
        ORDER BY total DESC LIMIT 20
      `, params),

      // Por serviço
      client.query(`
        SELECT s.nomeserv AS nome, a.codserv AS codigo, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cadserv s ON s.codserv = a.codserv
        ${dateWhere} AND a.codserv IS NOT NULL
        GROUP BY s.nomeserv, a.codserv
        ORDER BY total DESC
      `, params),

      // Por mês/ano
      client.query(`
        SELECT TO_CHAR(a.datatend, 'YYYY-MM') AS mes_ano, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        ${dateWhere}
        GROUP BY TO_CHAR(a.datatend, 'YYYY-MM')
        ORDER BY mes_ano
      `, params),

      // Por CID (top 20)
      client.query(`
        SELECT cid.descrcid AS nome, a.cidprin AS codigo, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".tabcid cid ON cid.codcid = a.cidprin
        ${dateWhere} AND a.cidprin IS NOT NULL
        GROUP BY cid.descrcid, a.cidprin
        ORDER BY total DESC LIMIT 20
      `, params),

      // Por procedimento (top 20)
      client.query(`
        SELECT COALESCE(a.dsprocprin, fp.descrproc) AS nome, a.procprin AS codigo, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".filanpro fp ON fp.codproc = a.procprin
        ${dateWhere} AND a.procprin IS NOT NULL
        GROUP BY COALESCE(a.dsprocprin, fp.descrproc), a.procprin
        ORDER BY total DESC LIMIT 20
      `, params),
    ]);

    const totalAtendimentos = parseInt(totalResult.rows[0]?.total || "0", 10);

    return {
      totalAtendimentos,
      totalMedicos: porMedicoResult.rows.length,
      totalConvenios: porPlanoResult.rows.length,
      totalProcedimentos: porProcedimentoResult.rows.length,
      porMedico: porMedicoResult.rows.map((r: any) => ({ nome: r.nome || "Sem nome", codigo: r.codigo, total: parseInt(r.total, 10) })),
      porTipo: porTipoResult.rows.map((r: any) => ({ nome: r.nome || "Outros", codigo: null, total: parseInt(r.total, 10) })),
      porPlano: porPlanoResult.rows.map((r: any) => ({ nome: r.nome || "Sem plano", codigo: r.codigo, total: parseInt(r.total, 10) })),
      porServico: porServicoResult.rows.map((r: any) => ({ nome: r.nome || "Sem serviço", codigo: r.codigo, total: parseInt(r.total, 10) })),
      porMesAno: porMesAnoResult.rows.map((r: any) => ({ mesAno: r.mes_ano, total: parseInt(r.total, 10) })),
      porCid: porCidResult.rows.map((r: any) => ({ nome: r.nome || r.codigo || "Sem CID", codigo: r.codigo, total: parseInt(r.total, 10) })),
      porProcedimento: porProcedimentoResult.rows.map((r: any) => ({ nome: r.nome || r.codigo || "Sem procedimento", codigo: r.codigo, total: parseInt(r.total, 10) })),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}


// ============================================================
// COMPARAÇÃO DE PERÍODOS (período atual vs anterior)
// ============================================================

export interface ComparacaoPeriodos {
  periodoAtual: {
    label: string;
    totalAtendimentos: number;
    totalMedicos: number;
    totalConvenios: number;
    totalProcedimentos: number;
  };
  periodoAnterior: {
    label: string;
    totalAtendimentos: number;
    totalMedicos: number;
    totalConvenios: number;
    totalProcedimentos: number;
  };
  fonte: "cache_local" | "postgresql_direto";
}

export async function buscarComparacaoPeriodos(
  dataInicio: string,
  dataFim: string
): Promise<ComparacaoPeriodos> {
  // Calcular período anterior com mesma duração
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const duracaoMs = fim.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracaoMs);
  const fimAnterior = new Date(inicio.getTime() - 1); // 1ms antes do início atual

  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const formatLabel = (d1: Date, d2: Date) => {
    const m1 = d1.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    const m2 = d2.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    return m1 === m2 ? m1 : `${m1} - ${m2}`;
  };

  // Buscar métricas de ambos os períodos
  const [metricasAtual, metricasAnterior] = await Promise.all([
    buscarMetricasDashboard({ dataInicio, dataFim }),
    buscarMetricasDashboard({
      dataInicio: formatDate(inicioAnterior),
      dataFim: formatDate(fimAnterior),
    }),
  ]);

  return {
    periodoAtual: {
      label: formatLabel(inicio, fim),
      totalAtendimentos: metricasAtual.totalAtendimentos,
      totalMedicos: metricasAtual.totalMedicos,
      totalConvenios: metricasAtual.totalConvenios,
      totalProcedimentos: metricasAtual.totalProcedimentos,
    },
    periodoAnterior: {
      label: formatLabel(inicioAnterior, fimAnterior),
      totalAtendimentos: metricasAnterior.totalAtendimentos,
      totalMedicos: metricasAnterior.totalMedicos,
      totalConvenios: metricasAnterior.totalConvenios,
      totalProcedimentos: metricasAnterior.totalProcedimentos,
    },
    fonte: metricasAtual.fonte,
  };
}


// ============================================================
// MÉTRICAS AVANÇADAS - Permanência, Turno, Conversão, Caráter
// ============================================================

export interface MetricasAvancadas {
  // Média de permanência (dias) para internações
  mediaPermanenciaDias: number;
  totalInternacoes: number;
  
  // Volume por turno
  porTurno: {
    manha: number;   // 06:00-11:59
    tarde: number;    // 12:00-17:59
    noite: number;    // 18:00-23:59
    madrugada: number; // 00:00-05:59
    total: number;
  };
  
  // Taxa de conversão Emergência → Internação
  taxaConversao: {
    totalEmergencias: number;
    totalConvertidos: number; // internações com proveniente = emergência
    taxa: number; // percentual
    evolucaoMensal: Array<{
      mesAno: string;
      emergencias: number;
      convertidos: number;
      taxa: number;
    }>;
  };
  
  // Comparativo detalhado por tipo
  comparativoDetalhado: {
    periodoAtual: {
      label: string;
      internacoes: number;
      ambulatoriais: number;
      emergencias: number;
      urgencias: number;
      procedimentos: number;
    };
    periodoAnterior: {
      label: string;
      internacoes: number;
      ambulatoriais: number;
      emergencias: number;
      urgencias: number;
      procedimentos: number;
    };
  };
  
  // Caráter: Eletivo vs Urgência
  porCarater: Array<{ nome: string; total: number }>;
  
  fonte: "cache_local" | "postgresql_direto";
}

export async function buscarMetricasAvancadas(
  filtros: FiltrosDashboard
): Promise<MetricasAvancadas> {
  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      if (cacheCount[0]?.total > 0) {
        return buscarMetricasAvancadasDoCache(db, filtros);
      }
    }
  } catch (e) {
    console.warn("[MetricasAvancadas] Cache local indisponível, usando PostgreSQL:", (e as Error).message);
  }

  // Fallback: PostgreSQL direto
  return buscarMetricasAvancadasDoPostgresql(filtros);
}

async function buscarMetricasAvancadasDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  filtros: FiltrosDashboard
): Promise<MetricasAvancadas> {
  const inicio = new Date(filtros.dataInicio);
  const fim = new Date(filtros.dataFim);
  
  const baseConditions: any[] = [
    gte(relatorioAtendimentosCache.dataAtendimento, inicio),
    lte(relatorioAtendimentosCache.dataAtendimento, fim),
  ];

  if (filtros.tipoAtendimento) {
    const tipoMap: Record<string, string> = {
      "I": "Internação", "A": "Ambulatorial", "E": "Emergência", "U": "Urgência",
    };
    baseConditions.push(eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, tipoMap[filtros.tipoAtendimento] || filtros.tipoAtendimento));
  }
  if (filtros.codPlaco) baseConditions.push(eq(relatorioAtendimentosCache.codplaco, filtros.codPlaco));
  if (filtros.codPrest) baseConditions.push(eq(relatorioAtendimentosCache.codprest, filtros.codPrest));
  if (filtros.codServ) baseConditions.push(eq(relatorioAtendimentosCache.codserv, filtros.codServ));

  const whereClause = and(...baseConditions);

  // Calcular período anterior
  const duracaoMs = fim.getTime() - inicio.getTime();
  const inicioAnterior = new Date(inicio.getTime() - duracaoMs);
  const fimAnterior = new Date(inicio.getTime() - 1);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];
  const formatLabel = (d1: Date, d2: Date) => {
    const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
    const m1 = d1.toLocaleDateString("pt-BR", opts);
    const m2 = d2.toLocaleDateString("pt-BR", opts);
    return m1 === m2 ? m1 : `${m1} - ${m2}`;
  };

  const whereAnterior = and(
    gte(relatorioAtendimentosCache.dataAtendimento, inicioAnterior),
    lte(relatorioAtendimentosCache.dataAtendimento, fimAnterior),
  );

  const [
    // Média de permanência
    internacoes,
    // Volume por turno
    turnoManha,
    turnoTarde,
    turnoNoite,
    turnoMadrugada,
    // Emergências e conversões
    totalEmergencias,
    totalConvertidos,
    // Conversão mensal
    emergenciasMensal,
    convertidosMensal,
    // Caráter
    porCarater,
    // Comparativo detalhado - período atual
    internacoesAtual,
    ambulatoriaisAtual,
    emergenciasAtual,
    urgenciasAtual,
    procedimentosAtual,
    // Comparativo detalhado - período anterior
    internacoesAnterior,
    ambulatoriaisAnterior,
    emergenciasAnterior,
    urgenciasAnterior,
    procedimentosAnterior,
  ] = await Promise.all([
    // 1. Internações com data_saida para média de permanência
    db.select({
      dataAtendimento: relatorioAtendimentosCache.dataAtendimento,
      dataSaida: relatorioAtendimentosCache.dataSaida,
    })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, 
        eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Internação"),
        sql`${relatorioAtendimentosCache.dataSaida} IS NOT NULL`
      )),

    // 2. Turno - Manhã (06-11)
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`HOUR(${relatorioAtendimentosCache.dataAtendimento}) >= 6 AND HOUR(${relatorioAtendimentosCache.dataAtendimento}) < 12`)),

    // 3. Turno - Tarde (12-17)
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`HOUR(${relatorioAtendimentosCache.dataAtendimento}) >= 12 AND HOUR(${relatorioAtendimentosCache.dataAtendimento}) < 18`)),

    // 4. Turno - Noite (18-23)
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`HOUR(${relatorioAtendimentosCache.dataAtendimento}) >= 18 AND HOUR(${relatorioAtendimentosCache.dataAtendimento}) < 24`)),

    // 5. Turno - Madrugada (00-05)
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`HOUR(${relatorioAtendimentosCache.dataAtendimento}) >= 0 AND HOUR(${relatorioAtendimentosCache.dataAtendimento}) < 6`)),

    // 6. Total emergências
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Emergência"))),

    // 7. Internações com proveniente contendo "emerg"
    db.select({ total: count() })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, 
        eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Internação"),
        like(relatorioAtendimentosCache.proveniente, "%merg%")
      )),

    // 8. Emergências por mês
    db.select({
      mesAno: sql<string>`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Emergência")))
      .groupBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`),

    // 9. Convertidos por mês
    db.select({
      mesAno: sql<string>`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, 
        eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Internação"),
        like(relatorioAtendimentosCache.proveniente, "%merg%")
      ))
      .groupBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(\`relatorio_atendimentos_cache\`.\`data_atendimento\`, '%Y-%m')`),

    // 10. Por caráter
    db.select({
      nome: relatorioAtendimentosCache.caraterDescricao,
      total: count(),
    })
      .from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`${relatorioAtendimentosCache.caraterDescricao} IS NOT NULL AND ${relatorioAtendimentosCache.caraterDescricao} != ''`))
      .groupBy(relatorioAtendimentosCache.caraterDescricao)
      .orderBy(desc(count())),

    // 11-15. Comparativo período atual
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Internação"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Ambulatorial"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Emergência"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereClause, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Urgência"))),
    db.select({ total: sql<number>`COUNT(DISTINCT ${relatorioAtendimentosCache.procprin})` }).from(relatorioAtendimentosCache)
      .where(and(whereClause, sql`${relatorioAtendimentosCache.procprin} IS NOT NULL`)),

    // 16-20. Comparativo período anterior
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereAnterior, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Internação"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereAnterior, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Ambulatorial"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereAnterior, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Emergência"))),
    db.select({ total: count() }).from(relatorioAtendimentosCache)
      .where(and(whereAnterior, eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, "Urgência"))),
    db.select({ total: sql<number>`COUNT(DISTINCT ${relatorioAtendimentosCache.procprin})` }).from(relatorioAtendimentosCache)
      .where(and(whereAnterior, sql`${relatorioAtendimentosCache.procprin} IS NOT NULL`)),
  ]);

  // Calcular média de permanência
  let mediaPermanenciaDias = 0;
  if (internacoes.length > 0) {
    const totalDias = internacoes.reduce((acc, curr) => {
      if (!curr.dataAtendimento || !curr.dataSaida) return acc;
      const entrada = new Date(curr.dataAtendimento).getTime();
      const saida = new Date(curr.dataSaida).getTime();
      return acc + (saida - entrada);
    }, 0);
    const mediaMs = totalDias / internacoes.length;
    mediaPermanenciaDias = parseFloat((mediaMs / (1000 * 60 * 60 * 24)).toFixed(1));
  }

  // Volume por turno
  const manhaTotal = turnoManha[0]?.total || 0;
  const tardeTotal = turnoTarde[0]?.total || 0;
  const noiteTotal = turnoNoite[0]?.total || 0;
  const madrugadaTotal = turnoMadrugada[0]?.total || 0;
  const turnoTotal = manhaTotal + tardeTotal + noiteTotal + madrugadaTotal;

  // Taxa de conversão
  const emergenciasTotal = totalEmergencias[0]?.total || 0;
  const convertidosTotal = totalConvertidos[0]?.total || 0;
  const taxaConversaoPerc = emergenciasTotal > 0 
    ? parseFloat(((convertidosTotal / emergenciasTotal) * 100).toFixed(1)) 
    : 0;

  // Evolução mensal da conversão
  const mesesEmergencia = new Map(emergenciasMensal.map(e => [e.mesAno, e.total]));
  const mesesConvertidos = new Map(convertidosMensal.map(c => [c.mesAno, c.total]));
  const todosMeses = new Set([...mesesEmergencia.keys(), ...mesesConvertidos.keys()]);
  const evolucaoMensal = Array.from(todosMeses).sort().map(mesAno => {
    const emerg = mesesEmergencia.get(mesAno) || 0;
    const conv = mesesConvertidos.get(mesAno) || 0;
    return {
      mesAno,
      emergencias: emerg,
      convertidos: conv,
      taxa: emerg > 0 ? parseFloat(((conv / emerg) * 100).toFixed(1)) : 0,
    };
  });

  return {
    mediaPermanenciaDias,
    totalInternacoes: internacoes.length,
    porTurno: {
      manha: manhaTotal,
      tarde: tardeTotal,
      noite: noiteTotal,
      madrugada: madrugadaTotal,
      total: turnoTotal,
    },
    taxaConversao: {
      totalEmergencias: emergenciasTotal,
      totalConvertidos: convertidosTotal,
      taxa: taxaConversaoPerc,
      evolucaoMensal,
    },
    comparativoDetalhado: {
      periodoAtual: {
        label: formatLabel(inicio, fim),
        internacoes: internacoesAtual[0]?.total || 0,
        ambulatoriais: ambulatoriaisAtual[0]?.total || 0,
        emergencias: emergenciasAtual[0]?.total || 0,
        urgencias: urgenciasAtual[0]?.total || 0,
        procedimentos: procedimentosAtual[0]?.total || 0,
      },
      periodoAnterior: {
        label: formatLabel(inicioAnterior, fimAnterior),
        internacoes: internacoesAnterior[0]?.total || 0,
        ambulatoriais: ambulatoriaisAnterior[0]?.total || 0,
        emergencias: emergenciasAnterior[0]?.total || 0,
        urgencias: urgenciasAnterior[0]?.total || 0,
        procedimentos: procedimentosAnterior[0]?.total || 0,
      },
    },
    porCarater: porCarater.map(c => ({ nome: c.nome || "Não informado", total: c.total })),
    fonte: "cache_local",
  };
}

async function buscarMetricasAvancadasDoPostgresql(
  filtros: FiltrosDashboard
): Promise<MetricasAvancadas> {
  const client = await getWarleinePool().connect();
  try {
    const inicio = new Date(filtros.dataInicio);
    const fim = new Date(filtros.dataFim);
    const duracaoMs = fim.getTime() - inicio.getTime();
    const inicioAnterior = new Date(inicio.getTime() - duracaoMs);
    const fimAnterior = new Date(inicio.getTime() - 1);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];
    const formatLabel = (d1: Date, d2: Date) => {
      const opts: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
      const m1 = d1.toLocaleDateString("pt-BR", opts);
      const m2 = d2.toLocaleDateString("pt-BR", opts);
      return m1 === m2 ? m1 : `${m1} - ${m2}`;
    };

    const params: any[] = [filtros.dataInicio, filtros.dataFim];
    let paramIndex = 3;
    const extraConditions: string[] = [];

    if (filtros.tipoAtendimento) {
      extraConditions.push(`a.tipoatend = $${paramIndex}`);
      params.push(filtros.tipoAtendimento);
      paramIndex++;
    }
    if (filtros.codPlaco) {
      extraConditions.push(`a.codplaco = $${paramIndex}`);
      params.push(filtros.codPlaco);
      paramIndex++;
    }
    if (filtros.codPrest) {
      extraConditions.push(`a.codprest = $${paramIndex}`);
      params.push(filtros.codPrest);
      paramIndex++;
    }
    if (filtros.codServ) {
      extraConditions.push(`a.codserv = $${paramIndex}`);
      params.push(filtros.codServ);
      paramIndex++;
    }

    const extraWhere = extraConditions.length > 0 ? ` AND ${extraConditions.join(" AND ")}` : "";
    const dateWhere = `WHERE a.datatend >= $1 AND a.datatend <= $2${extraWhere}`;

    const paramsAnterior = [formatDate(inicioAnterior), formatDate(fimAnterior), ...params.slice(2)];
    const dateWhereAnterior = `WHERE a.datatend >= $1 AND a.datatend <= $2${extraWhere}`;

    const [
      // Média de permanência
      permanenciaResult,
      // Turnos
      turnoResult,
      // Emergências
      emergResult,
      convertResult,
      // Conversão mensal
      emergMensalResult,
      convertMensalResult,
      // Caráter
      caraterResult,
      // Comparativo atual
      intAtualResult,
      ambAtualResult,
      emAtualResult,
      urgAtualResult,
      procAtualResult,
      // Comparativo anterior
      intAntResult,
      ambAntResult,
      emAntResult,
      urgAntResult,
      procAntResult,
    ] = await Promise.all([
      // 1. Permanência
      client.query(`
        SELECT a.datatend, a.datasai FROM "PACIENTE".arqatend a
        ${dateWhere} AND a.tipoatend = 'I' AND a.datasai IS NOT NULL
      `, params),

      // 2. Turnos
      client.query(`
        SELECT
          SUM(CASE WHEN EXTRACT(HOUR FROM a.datatend) >= 6 AND EXTRACT(HOUR FROM a.datatend) < 12 THEN 1 ELSE 0 END) AS manha,
          SUM(CASE WHEN EXTRACT(HOUR FROM a.datatend) >= 12 AND EXTRACT(HOUR FROM a.datatend) < 18 THEN 1 ELSE 0 END) AS tarde,
          SUM(CASE WHEN EXTRACT(HOUR FROM a.datatend) >= 18 AND EXTRACT(HOUR FROM a.datatend) < 24 THEN 1 ELSE 0 END) AS noite,
          SUM(CASE WHEN EXTRACT(HOUR FROM a.datatend) >= 0 AND EXTRACT(HOUR FROM a.datatend) < 6 THEN 1 ELSE 0 END) AS madrugada
        FROM "PACIENTE".arqatend a ${dateWhere}
      `, params),

      // 3. Emergências
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'E'`, params),

      // 4. Convertidos (internações com proveniente = emergência)
      client.query(`
        SELECT COUNT(*) as total FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
        ${dateWhere} AND a.tipoatend = 'I' AND LOWER(pv.nomeproven) LIKE '%merg%'
      `, params),

      // 5. Emergências mensal
      client.query(`
        SELECT TO_CHAR(a.datatend, 'YYYY-MM') AS mes_ano, COUNT(*) AS total
        FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'E'
        GROUP BY TO_CHAR(a.datatend, 'YYYY-MM') ORDER BY mes_ano
      `, params),

      // 6. Convertidos mensal
      client.query(`
        SELECT TO_CHAR(a.datatend, 'YYYY-MM') AS mes_ano, COUNT(*) AS total
        FROM "PACIENTE".arqatend a
        LEFT JOIN "PACIENTE".cdproven pv ON pv.codproven = a.codproven
        ${dateWhere} AND a.tipoatend = 'I' AND LOWER(pv.nomeproven) LIKE '%merg%'
        GROUP BY TO_CHAR(a.datatend, 'YYYY-MM') ORDER BY mes_ano
      `, params),

      // 7. Caráter
      client.query(`
        SELECT CASE a.carater WHEN 'UR' THEN 'Urgência' WHEN 'EL' THEN 'Eletivo' ELSE a.carater END AS nome,
        COUNT(*) AS total FROM "PACIENTE".arqatend a
        ${dateWhere} AND a.carater IS NOT NULL AND a.carater != ''
        GROUP BY a.carater ORDER BY total DESC
      `, params),

      // 8-12. Comparativo atual
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'I'`, params),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'A'`, params),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'E'`, params),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.tipoatend = 'U'`, params),
      client.query(`SELECT COUNT(DISTINCT a.procprin) as total FROM "PACIENTE".arqatend a ${dateWhere} AND a.procprin IS NOT NULL`, params),

      // 13-17. Comparativo anterior
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhereAnterior} AND a.tipoatend = 'I'`, paramsAnterior),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhereAnterior} AND a.tipoatend = 'A'`, paramsAnterior),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhereAnterior} AND a.tipoatend = 'E'`, paramsAnterior),
      client.query(`SELECT COUNT(*) as total FROM "PACIENTE".arqatend a ${dateWhereAnterior} AND a.tipoatend = 'U'`, paramsAnterior),
      client.query(`SELECT COUNT(DISTINCT a.procprin) as total FROM "PACIENTE".arqatend a ${dateWhereAnterior} AND a.procprin IS NOT NULL`, paramsAnterior),
    ]);

    // Calcular média de permanência
    let mediaPermanenciaDias = 0;
    const internacoesRows = permanenciaResult.rows;
    if (internacoesRows.length > 0) {
      const totalDias = internacoesRows.reduce((acc: number, curr: any) => {
        const entrada = new Date(curr.datatend).getTime();
        const saida = new Date(curr.datasai).getTime();
        return acc + (saida - entrada);
      }, 0);
      const mediaMs = totalDias / internacoesRows.length;
      mediaPermanenciaDias = parseFloat((mediaMs / (1000 * 60 * 60 * 24)).toFixed(1));
    }

    // Turnos
    const turnoRow = turnoResult.rows[0] || {};
    const manhaTotal = parseInt(turnoRow.manha || "0", 10);
    const tardeTotal = parseInt(turnoRow.tarde || "0", 10);
    const noiteTotal = parseInt(turnoRow.noite || "0", 10);
    const madrugadaTotal = parseInt(turnoRow.madrugada || "0", 10);
    const turnoTotal = manhaTotal + tardeTotal + noiteTotal + madrugadaTotal;

    // Conversão
    const emergenciasTotal = parseInt(emergResult.rows[0]?.total || "0", 10);
    const convertidosTotal = parseInt(convertResult.rows[0]?.total || "0", 10);
    const taxaConversaoPerc = emergenciasTotal > 0
      ? parseFloat(((convertidosTotal / emergenciasTotal) * 100).toFixed(1))
      : 0;

    // Evolução mensal
    const mesesEmergencia = new Map(emergMensalResult.rows.map((r: any) => [r.mes_ano, parseInt(r.total, 10)]));
    const mesesConvertidos = new Map(convertMensalResult.rows.map((r: any) => [r.mes_ano, parseInt(r.total, 10)]));
    const todosMeses = new Set([...mesesEmergencia.keys(), ...mesesConvertidos.keys()]);
    const evolucaoMensal = Array.from(todosMeses).sort().map(mesAno => {
      const emerg = mesesEmergencia.get(mesAno) || 0;
      const conv = mesesConvertidos.get(mesAno) || 0;
      return {
        mesAno,
        emergencias: emerg,
        convertidos: conv,
        taxa: emerg > 0 ? parseFloat(((conv / emerg) * 100).toFixed(1)) : 0,
      };
    });

    return {
      mediaPermanenciaDias,
      totalInternacoes: internacoesRows.length,
      porTurno: {
        manha: manhaTotal,
        tarde: tardeTotal,
        noite: noiteTotal,
        madrugada: madrugadaTotal,
        total: turnoTotal,
      },
      taxaConversao: {
        totalEmergencias: emergenciasTotal,
        totalConvertidos: convertidosTotal,
        taxa: taxaConversaoPerc,
        evolucaoMensal,
      },
      comparativoDetalhado: {
        periodoAtual: {
          label: formatLabel(inicio, fim),
          internacoes: parseInt(intAtualResult.rows[0]?.total || "0", 10),
          ambulatoriais: parseInt(ambAtualResult.rows[0]?.total || "0", 10),
          emergencias: parseInt(emAtualResult.rows[0]?.total || "0", 10),
          urgencias: parseInt(urgAtualResult.rows[0]?.total || "0", 10),
          procedimentos: parseInt(procAtualResult.rows[0]?.total || "0", 10),
        },
        periodoAnterior: {
          label: formatLabel(inicioAnterior, fimAnterior),
          internacoes: parseInt(intAntResult.rows[0]?.total || "0", 10),
          ambulatoriais: parseInt(ambAntResult.rows[0]?.total || "0", 10),
          emergencias: parseInt(emAntResult.rows[0]?.total || "0", 10),
          urgencias: parseInt(urgAntResult.rows[0]?.total || "0", 10),
          procedimentos: parseInt(procAntResult.rows[0]?.total || "0", 10),
        },
      },
      porCarater: caraterResult.rows.map((r: any) => ({ nome: r.nome || "Não informado", total: parseInt(r.total, 10) })),
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}


// ============================================================
// ANALÍTICAS DEMOGRÁFICAS E OPERACIONAIS
// ============================================================

export interface AnaliticasDemograficas {
  // Distribuição por Sexo
  porSexo: Array<{ sexo: string; total: number; percentual: number }>;
  porSexoTipo: Array<{ sexo: string; tipo: string; total: number }>;

  // Distribuição por CEP/Cidade (Top 20)
  porCep: Array<{ cep: string; cidade: string; total: number; percentual: number }>;
  porCepTipo: Array<{ cep: string; tipo: string; total: number }>;

  // Totais
  totalComSexo: number;
  totalComCep: number;
  totalGeral: number;

  fonte: "cache_local" | "postgresql_direto";
}

export interface AnaliticasOperacionais {
  // Distribuição por Centro de Custo
  porCentroCusto: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;

  // Distribuição por CBO (Ocupação Profissional)
  porCbo: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;

  // Distribuição por Proveniência
  porProveniencia: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  porProvenienciaTipo: Array<{ proveniencia: string; tipo: string; total: number }>;

  // Distribuição por Especialidade
  porEspecialidade: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;

  // Totais
  totalCentrosCusto: number;
  totalCbos: number;
  totalProveniencias: number;
  totalEspecialidades: number;
  totalGeral: number;

  fonte: "cache_local" | "postgresql_direto";
}

// ===== DEMOGRÁFICAS =====

export async function buscarAnaliticasDemograficas(
  filtros: FiltrosDashboard
): Promise<AnaliticasDemograficas> {
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      if (cacheCount[0]?.total > 0) {
        return buscarDemograficasDoCache(db, filtros);
      }
    }
  } catch (e) {
    console.warn("[AnaliticasDemograficas] Cache indisponível, usando PostgreSQL:", (e as Error).message);
  }
  return buscarDemograficasDoPostgresql(filtros);
}

async function buscarDemograficasDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  filtros: FiltrosDashboard
): Promise<AnaliticasDemograficas> {
  const inicio = new Date(filtros.dataInicio);
  const fim = new Date(filtros.dataFim);

  const baseConditions: any[] = [
    gte(relatorioAtendimentosCache.dataAtendimento, inicio),
    lte(relatorioAtendimentosCache.dataAtendimento, fim),
  ];

  if (filtros.tipoAtendimento) {
    const tipoMap: Record<string, string> = {
      "I": "Internação", "A": "Ambulatorial", "E": "Emergência", "U": "Urgência",
    };
    baseConditions.push(eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, tipoMap[filtros.tipoAtendimento] || filtros.tipoAtendimento));
  }
  if (filtros.codPlaco) baseConditions.push(eq(relatorioAtendimentosCache.codplaco, filtros.codPlaco));
  if (filtros.codPrest) baseConditions.push(eq(relatorioAtendimentosCache.codprest, filtros.codPrest));
  if (filtros.codServ) baseConditions.push(eq(relatorioAtendimentosCache.codserv, filtros.codServ));

  const whereClause = and(...baseConditions);

  // Total geral
  const [totalResult] = await db
    .select({ total: count() })
    .from(relatorioAtendimentosCache)
    .where(whereClause);
  const totalGeral = totalResult?.total || 0;

  // Por Sexo
  const porSexoRaw = await db
    .select({
      sexo: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('sexo_paciente')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql`COALESCE(NULLIF(TRIM(${sql.raw('sexo_paciente')}), ''), 'Não informado')`)
    .orderBy(desc(count()));

  const totalComSexo = porSexoRaw.reduce((s, r) => s + (r.sexo !== "Não informado" ? r.total : 0), 0);

  // Por Sexo × Tipo
  const porSexoTipoRaw = await db
    .select({
      sexo: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('sexo_paciente')}), ''), 'Não informado')`,
      tipo: sql<string>`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(
      sql`COALESCE(NULLIF(TRIM(${sql.raw('sexo_paciente')}), ''), 'Não informado')`,
      sql`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`
    )
    .orderBy(desc(count()));

  // Por CEP (Top 20)
  const porCepRaw = await db
    .select({
      cep: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('cep_paciente')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql`COALESCE(NULLIF(TRIM(${sql.raw('cep_paciente')}), ''), 'Não informado')`)
    .orderBy(desc(count()))
    .limit(20);

  const totalComCep = porCepRaw.reduce((s, r) => s + (r.cep !== "Não informado" ? r.total : 0), 0);

  // Por CEP × Tipo (Top 10 CEPs)
  const topCeps = porCepRaw.slice(0, 10).map(r => r.cep).filter(c => c !== "Não informado");
  let porCepTipoRaw: Array<{ cep: string; tipo: string; total: number }> = [];
  if (topCeps.length > 0) {
    porCepTipoRaw = await db
      .select({
        cep: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('cep_paciente')}), ''), 'Não informado')`,
        tipo: sql<string>`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`,
        total: count(),
      })
      .from(relatorioAtendimentosCache)
      .where(and(
        ...baseConditions,
        sql`TRIM(${sql.raw('cep_paciente')}) IN (${sql.join(topCeps.map(c => sql`${c}`), sql`, `)})`
      ))
      .groupBy(
        sql`COALESCE(NULLIF(TRIM(${sql.raw('cep_paciente')}), ''), 'Não informado')`,
        sql`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`
      )
      .orderBy(desc(count()));
  }

  // Resolver CEPs para nomes de cidades usando geocoding_cache
  const cepsParaResolver = porCepRaw
    .filter(r => r.cep !== "Não informado")
    .map(r => r.cep.replace(/\D/g, ""));

  let cidadeMap: Record<string, string> = {};
  if (cepsParaResolver.length > 0) {
    try {
      const geocodingResults = await db
        .select({
          cep: geocodingCache.cep,
          cidade: geocodingCache.cidade,
          estado: geocodingCache.estado,
        })
        .from(geocodingCache)
        .where(sql`${geocodingCache.cep} IN (${sql.join(cepsParaResolver.map(c => sql`${c}`), sql`, `)})`);

      for (const g of geocodingResults) {
        const label = g.cidade && g.estado
          ? `${g.cidade}/${g.estado}`
          : g.cidade || g.cep;
        cidadeMap[g.cep] = label;
      }
    } catch (e) {
      console.warn("[Demograficas] Erro ao resolver cidades:", (e as Error).message);
    }
  }

  return {
    porSexo: porSexoRaw.map(r => ({
      sexo: r.sexo === "M" ? "Masculino" : r.sexo === "F" ? "Feminino" : r.sexo,
      total: r.total,
      percentual: totalGeral > 0 ? Math.round((r.total / totalGeral) * 1000) / 10 : 0,
    })),
    porSexoTipo: porSexoTipoRaw.map(r => ({
      sexo: r.sexo === "M" ? "Masculino" : r.sexo === "F" ? "Feminino" : r.sexo,
      tipo: r.tipo,
      total: r.total,
    })),
    porCep: porCepRaw.map(r => {
      const cepLimpo = r.cep.replace(/\D/g, "");
      return {
        cep: r.cep,
        cidade: r.cep === "Não informado" ? "Não informado" : (cidadeMap[cepLimpo] || r.cep),
        total: r.total,
        percentual: totalGeral > 0 ? Math.round((r.total / totalGeral) * 1000) / 10 : 0,
      };
    }),
    porCepTipo: porCepTipoRaw.map(r => ({
      cep: r.cep,
      tipo: r.tipo,
      total: r.total,
    })),
    totalComSexo,
    totalComCep,
    totalGeral,
    fonte: "cache_local",
  };
}

async function buscarDemograficasDoPostgresql(
  filtros: FiltrosDashboard
): Promise<AnaliticasDemograficas> {
  const pool = getWarleinePool();
  const client = await pool.connect();
  try {
    const params: any[] = [filtros.dataInicio];
    let whereExtra = "";
    let paramIdx = 2;

    if (filtros.dataFim) {
      whereExtra += ` AND a.datatend <= $${paramIdx}`;
      params.push(filtros.dataFim);
      paramIdx++;
    }

    // Por Sexo
    const sexoResult = await client.query(
      `SELECT COALESCE(NULLIF(TRIM(cpc.sexo), ''), 'Não informado') as sexo, COUNT(*) as total
       FROM arqatend a LEFT JOIN cadpac cpc ON cpc.codpac=a.codpac
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY COALESCE(NULLIF(TRIM(cpc.sexo), ''), 'Não informado')
       ORDER BY total DESC`,
      params
    );

    // Total
    const totalResult = await client.query(
      `SELECT COUNT(*) as total FROM arqatend a WHERE a.datatend >= $1 ${whereExtra}`,
      params
    );
    const totalGeral = parseInt(totalResult.rows[0]?.total || "0", 10);

    // Por CEP (Top 20)
    const cepResult = await client.query(
      `SELECT COALESCE(NULLIF(TRIM(cpc.ceppac), ''), 'Não informado') as cep, COUNT(*) as total
       FROM arqatend a LEFT JOIN cadpac cpc ON cpc.codpac=a.codpac
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY COALESCE(NULLIF(TRIM(cpc.ceppac), ''), 'Não informado')
       ORDER BY total DESC LIMIT 20`,
      params
    );

    const porSexo = sexoResult.rows.map((r: any) => ({
      sexo: r.sexo === "M" ? "Masculino" : r.sexo === "F" ? "Feminino" : r.sexo,
      total: parseInt(r.total, 10),
      percentual: totalGeral > 0 ? Math.round((parseInt(r.total, 10) / totalGeral) * 1000) / 10 : 0,
    }));

    const porCep = cepResult.rows.map((r: any) => ({
      cep: r.cep,
      cidade: r.cep, // PostgreSQL direto não tem cache de geocodificação, usa CEP como fallback
      total: parseInt(r.total, 10),
      percentual: totalGeral > 0 ? Math.round((parseInt(r.total, 10) / totalGeral) * 1000) / 10 : 0,
    }));

    return {
      porSexo,
      porSexoTipo: [],
      porCep,
      porCepTipo: [],
      totalComSexo: porSexo.filter(s => s.sexo !== "Não informado").reduce((s, r) => s + r.total, 0),
      totalComCep: porCep.filter(c => c.cep !== "Não informado").reduce((s, r) => s + r.total, 0),
      totalGeral,
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ===== OPERACIONAIS =====

export async function buscarAnaliticasOperacionais(
  filtros: FiltrosDashboard
): Promise<AnaliticasOperacionais> {
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      if (cacheCount[0]?.total > 0) {
        return buscarOperacionaisDoCache(db, filtros);
      }
    }
  } catch (e) {
    console.warn("[AnaliticasOperacionais] Cache indisponível, usando PostgreSQL:", (e as Error).message);
  }
  return buscarOperacionaisDoPostgresql(filtros);
}

async function buscarOperacionaisDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  filtros: FiltrosDashboard
): Promise<AnaliticasOperacionais> {
  const inicio = new Date(filtros.dataInicio);
  const fim = new Date(filtros.dataFim);

  const baseConditions: any[] = [
    gte(relatorioAtendimentosCache.dataAtendimento, inicio),
    lte(relatorioAtendimentosCache.dataAtendimento, fim),
  ];

  if (filtros.tipoAtendimento) {
    const tipoMap: Record<string, string> = {
      "I": "Internação", "A": "Ambulatorial", "E": "Emergência", "U": "Urgência",
    };
    baseConditions.push(eq(relatorioAtendimentosCache.tipoAtendimentoDescricao, tipoMap[filtros.tipoAtendimento] || filtros.tipoAtendimento));
  }
  if (filtros.codPlaco) baseConditions.push(eq(relatorioAtendimentosCache.codplaco, filtros.codPlaco));
  if (filtros.codPrest) baseConditions.push(eq(relatorioAtendimentosCache.codprest, filtros.codPrest));
  if (filtros.codServ) baseConditions.push(eq(relatorioAtendimentosCache.codserv, filtros.codServ));

  const whereClause = and(...baseConditions);

  // Total geral
  const [totalResult] = await db
    .select({ total: count() })
    .from(relatorioAtendimentosCache)
    .where(whereClause);
  const totalGeral = totalResult?.total || 0;

  // Por Centro de Custo
  const porCcRaw = await db
    .select({
      codigo: relatorioAtendimentosCache.codcc,
      nome: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('nomecc')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql.raw('codcc'), sql`COALESCE(NULLIF(TRIM(${sql.raw('nomecc')}), ''), 'Não informado')`)
    .orderBy(desc(count()))
    .limit(20);

  // Por CBO
  const porCboRaw = await db
    .select({
      codigo: relatorioAtendimentosCache.codcbo,
      nome: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('descricao_cbo')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql.raw('codcbo'), sql`COALESCE(NULLIF(TRIM(${sql.raw('descricao_cbo')}), ''), 'Não informado')`)
    .orderBy(desc(count()))
    .limit(20);

  // Por Proveniência
  const porProvRaw = await db
    .select({
      codigo: relatorioAtendimentosCache.codproven,
      nome: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('nomeproven')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql.raw('codproven'), sql`COALESCE(NULLIF(TRIM(${sql.raw('nomeproven')}), ''), 'Não informado')`)
    .orderBy(desc(count()))
    .limit(20);

  // Por Proveniência × Tipo
  const porProvTipoRaw = await db
    .select({
      proveniencia: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('nomeproven')}), ''), 'Não informado')`,
      tipo: sql<string>`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(
      sql`COALESCE(NULLIF(TRIM(${sql.raw('nomeproven')}), ''), 'Não informado')`,
      sql`COALESCE(${sql.raw('tipoatend_descricao')}, 'Outros')`
    )
    .orderBy(desc(count()));

  // Por Especialidade
  const porEspRaw = await db
    .select({
      codigo: relatorioAtendimentosCache.codesp,
      nome: sql<string>`COALESCE(NULLIF(TRIM(${sql.raw('especialidade')}), ''), 'Não informado')`,
      total: count(),
    })
    .from(relatorioAtendimentosCache)
    .where(whereClause)
    .groupBy(sql.raw('codesp'), sql`COALESCE(NULLIF(TRIM(${sql.raw('especialidade')}), ''), 'Não informado')`)
    .orderBy(desc(count()))
    .limit(20);

  const mapResult = (arr: typeof porCcRaw) => arr.map(r => ({
    codigo: r.codigo,
    nome: r.nome,
    total: r.total,
    percentual: totalGeral > 0 ? Math.round((r.total / totalGeral) * 1000) / 10 : 0,
  }));

  return {
    porCentroCusto: mapResult(porCcRaw),
    porCbo: mapResult(porCboRaw),
    porProveniencia: mapResult(porProvRaw),
    porProvenienciaTipo: porProvTipoRaw.map(r => ({
      proveniencia: r.proveniencia,
      tipo: r.tipo,
      total: r.total,
    })),
    porEspecialidade: mapResult(porEspRaw),
    totalCentrosCusto: porCcRaw.length,
    totalCbos: porCboRaw.length,
    totalProveniencias: porProvRaw.length,
    totalEspecialidades: porEspRaw.length,
    totalGeral,
    fonte: "cache_local",
  };
}

async function buscarOperacionaisDoPostgresql(
  filtros: FiltrosDashboard
): Promise<AnaliticasOperacionais> {
  const pool = getWarleinePool();
  const client = await pool.connect();
  try {
    const params: any[] = [filtros.dataInicio];
    let whereExtra = "";
    let paramIdx = 2;

    if (filtros.dataFim) {
      whereExtra += ` AND a.datatend <= $${paramIdx}`;
      params.push(filtros.dataFim);
      paramIdx++;
    }

    // Por Centro de Custo
    const ccResult = await client.query(
      `SELECT a.codcc as codigo, COALESCE(NULLIF(TRIM(cd.nomecc), ''), 'Não informado') as nome, COUNT(*) as total
       FROM arqatend a LEFT JOIN cadcc cd ON cd.codcc=a.codcc
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY a.codcc, COALESCE(NULLIF(TRIM(cd.nomecc), ''), 'Não informado')
       ORDER BY total DESC LIMIT 20`,
      params
    );

    // Por CBO
    const cboResult = await client.query(
      `SELECT a.codcbo as codigo, COALESCE(NULLIF(TRIM(tc.descricbo), ''), 'Não informado') as nome, COUNT(*) as total
       FROM arqatend a LEFT JOIN tabcbo tc ON tc.codcbo=a.codcbo
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY a.codcbo, COALESCE(NULLIF(TRIM(tc.descricbo), ''), 'Não informado')
       ORDER BY total DESC LIMIT 20`,
      params
    );

    // Por Proveniência
    const provResult = await client.query(
      `SELECT a.codproven as codigo, COALESCE(NULLIF(TRIM(cpv.nomeproven), ''), 'Não informado') as nome, COUNT(*) as total
       FROM arqatend a LEFT JOIN cdproven cpv ON cpv.codproven=a.codproven
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY a.codproven, COALESCE(NULLIF(TRIM(cpv.nomeproven), ''), 'Não informado')
       ORDER BY total DESC LIMIT 20`,
      params
    );

    // Por Especialidade
    const espResult = await client.query(
      `SELECT a.codesp as codigo, COALESCE(NULLIF(TRIM(ce.nomeesp), ''), 'Não informado') as nome, COUNT(*) as total
       FROM arqatend a LEFT JOIN cadesp ce ON ce.codesp=a.codesp
       WHERE a.datatend >= $1 ${whereExtra}
       GROUP BY a.codesp, COALESCE(NULLIF(TRIM(ce.nomeesp), ''), 'Não informado')
       ORDER BY total DESC LIMIT 20`,
      params
    );

    // Total
    const totalResult = await client.query(
      `SELECT COUNT(*) as total FROM arqatend a WHERE a.datatend >= $1 ${whereExtra}`,
      params
    );
    const totalGeral = parseInt(totalResult.rows[0]?.total || "0", 10);

    const mapRows = (rows: any[]) => rows.map((r: any) => ({
      codigo: r.codigo,
      nome: r.nome,
      total: parseInt(r.total, 10),
      percentual: totalGeral > 0 ? Math.round((parseInt(r.total, 10) / totalGeral) * 1000) / 10 : 0,
    }));

    return {
      porCentroCusto: mapRows(ccResult.rows),
      porCbo: mapRows(cboResult.rows),
      porProveniencia: mapRows(provResult.rows),
      porProvenienciaTipo: [],
      porEspecialidade: mapRows(espResult.rows),
      totalCentrosCusto: ccResult.rows.length,
      totalCbos: cboResult.rows.length,
      totalProveniencias: provResult.rows.length,
      totalEspecialidades: espResult.rows.length,
      totalGeral,
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}


// ============================================================
// MAPA DE CALOR - Geocodificação de CEPs e dados geográficos
// ============================================================

import { makeRequest, type GeocodingResult } from "./_core/map";
import { geocodingCache } from "../drizzle/schema-integracao";

interface CepGeoData {
  cep: string;
  latitude: number;
  longitude: number;
  enderecoFormatado: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  totalAtendimentos: number;
}

interface HeatmapData {
  pontos: CepGeoData[];
  totalCeps: number;
  totalAtendimentos: number;
  centroMapa: { lat: number; lng: number };
  zoomInicial: number;
}

async function geocodificarCep(cep: string): Promise<{
  latitude: number;
  longitude: number;
  enderecoFormatado: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
} | null> {
  try {
    // Limpar CEP - remover caracteres não numéricos
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length < 5) return null;

    // Verificar cache no banco de dados
    const db = await getDb();
    if (db) {
      const cached = await db
        .select()
        .from(geocodingCache)
        .where(eq(geocodingCache.cep, cepLimpo))
        .limit(1);

      if (cached.length > 0) {
        return {
          latitude: parseFloat(String(cached[0].latitude)),
          longitude: parseFloat(String(cached[0].longitude)),
          enderecoFormatado: cached[0].enderecoFormatado,
          bairro: cached[0].bairro,
          cidade: cached[0].cidade,
          estado: cached[0].estado,
        };
      }
    }

    // Geocodificar via Google Maps API
    const result = await makeRequest<GeocodingResult>(
      "/maps/api/geocode/json",
      {
        address: `${cepLimpo}, Brasil`,
        components: "country:BR",
      }
    );

    if (result.status !== "OK" || result.results.length === 0) {
      console.log(`[Geocoding] CEP ${cepLimpo} não encontrado`);
      return null;
    }

    const location = result.results[0].geometry.location;
    const addressComponents = result.results[0].address_components;

    let bairro: string | null = null;
    let cidade: string | null = null;
    let estado: string | null = null;

    for (const comp of addressComponents) {
      if (comp.types.includes("sublocality_level_1") || comp.types.includes("sublocality")) {
        bairro = comp.long_name;
      }
      if (comp.types.includes("administrative_area_level_2") || comp.types.includes("locality")) {
        cidade = comp.long_name;
      }
      if (comp.types.includes("administrative_area_level_1")) {
        estado = comp.short_name;
      }
    }

    const geoData = {
      latitude: location.lat,
      longitude: location.lng,
      enderecoFormatado: result.results[0].formatted_address,
      bairro,
      cidade,
      estado,
    };

    // Salvar no cache
    if (db) {
      try {
        await db.insert(geocodingCache).values({
          cep: cepLimpo,
          latitude: String(geoData.latitude),
          longitude: String(geoData.longitude),
          enderecoFormatado: geoData.enderecoFormatado,
          bairro: geoData.bairro,
          cidade: geoData.cidade,
          estado: geoData.estado,
        });
      } catch (e) {
        // Ignorar erros de duplicata
        console.log(`[Geocoding] Erro ao salvar cache para CEP ${cepLimpo}:`, e);
      }
    }

    return geoData;
  } catch (error) {
    console.error(`[Geocoding] Erro ao geocodificar CEP ${cep}:`, error);
    return null;
  }
}

export async function buscarDadosMapaCalor(
  filtros: { dataInicio: string; dataFim: string }
): Promise<HeatmapData> {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados não disponível");
  }

  // Buscar contagem de atendimentos por CEP do cache
  const cepCounts = await db
    .select({
      cep: sql.raw('cep_paciente'),
      total: sql<number>`COUNT(*)`,
    })
    .from(relatorioAtendimentosCache)
    .where(
      and(
        gte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataInicio)),
        lte(relatorioAtendimentosCache.dataAtendimento, new Date(filtros.dataFim)),
        sql`${sql.raw('cep_paciente')} IS NOT NULL AND TRIM(${sql.raw('cep_paciente')}) != ''`
      )
    )
    .groupBy(sql.raw('cep_paciente'))
    .orderBy(sql`COUNT(*) DESC`)
    .limit(50);

  console.log(`[MapaCalor] Encontrados ${cepCounts.length} CEPs distintos`);

  // Geocodificar cada CEP
  const pontos: CepGeoData[] = [];
  let totalAtendimentos = 0;

  for (const item of cepCounts) {
    const cep = String(item.cep);
    const total = Number(item.total);
    totalAtendimentos += total;

    const geoData = await geocodificarCep(cep);
    if (geoData) {
      pontos.push({
        cep,
        latitude: geoData.latitude,
        longitude: geoData.longitude,
        enderecoFormatado: geoData.enderecoFormatado,
        bairro: geoData.bairro,
        cidade: geoData.cidade,
        estado: geoData.estado,
        totalAtendimentos: total,
      });
    }
  }

  // Calcular centro do mapa (média ponderada das coordenadas)
  let centroLat = -15.7801;  // Centro do Brasil como fallback
  let centroLng = -47.9292;
  let zoomInicial = 4;

  if (pontos.length > 0) {
    let somaLat = 0;
    let somaLng = 0;
    let somaPeso = 0;

    for (const p of pontos) {
      somaLat += p.latitude * p.totalAtendimentos;
      somaLng += p.longitude * p.totalAtendimentos;
      somaPeso += p.totalAtendimentos;
    }

    centroLat = somaLat / somaPeso;
    centroLng = somaLng / somaPeso;

    // Calcular zoom baseado na dispersão dos pontos
    const lats = pontos.map(p => p.latitude);
    const lngs = pontos.map(p => p.longitude);
    const latRange = Math.max(...lats) - Math.min(...lats);
    const lngRange = Math.max(...lngs) - Math.min(...lngs);
    const maxRange = Math.max(latRange, lngRange);

    if (maxRange < 0.1) zoomInicial = 14;
    else if (maxRange < 0.5) zoomInicial = 12;
    else if (maxRange < 1) zoomInicial = 11;
    else if (maxRange < 2) zoomInicial = 10;
    else if (maxRange < 5) zoomInicial = 8;
    else if (maxRange < 10) zoomInicial = 7;
    else zoomInicial = 5;
  }

  return {
    pontos,
    totalCeps: pontos.length,
    totalAtendimentos,
    centroMapa: { lat: centroLat, lng: centroLng },
    zoomInicial,
  };
}


// ============================================================
// PACIENTES INTERNADOS (Internações sem data de saída)
// ============================================================

export interface PacienteInternado {
  numatend: string;
  paciente: string;
  convenio: string;
  centroCusto: string;
  prestador: string;
  dataEntrada: string;
  diasInternado: number;
  procedimento: string;
  cid: string;
}

export interface DadosInternadosResult {
  totalInternados: number;
  pacientes: PacienteInternado[];
  porCentroCusto: Array<{ nome: string; total: number }>;
  porConvenio: Array<{ nome: string; total: number }>;
  mediaPermancencia: number;
  fonte: "cache_local" | "postgresql_direto";
}

export async function buscarPacientesInternados(): Promise<DadosInternadosResult> {
  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      if (cacheCount[0]?.total > 0) {
        return buscarInternadosDoCache(db);
      }
    }
  } catch (e) {
    console.warn("[PacientesInternados] Cache indisponível, usando PostgreSQL:", (e as Error).message);
  }
  return buscarInternadosDoPostgresql();
}

async function buscarInternadosDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<DadosInternadosResult> {
  // Internações: tipo = 'I' ou descrição = 'Internação', sem data de saída
  const internados = await db
    .select({
      numatend: relatorioAtendimentosCache.numatend,
      paciente: sql<string>`COALESCE(${relatorioAtendimentosCache.paciente}, 'Não informado')`,
      convenio: sql<string>`COALESCE(${relatorioAtendimentosCache.planoConvenio}, 'Não informado')`,
      centroCusto: sql<string>`COALESCE(${relatorioAtendimentosCache.centroCusto}, 'Não informado')`,
      prestador: sql<string>`COALESCE(${relatorioAtendimentosCache.prestador}, 'Não informado')`,
      dataEntrada: relatorioAtendimentosCache.dataAtendimento,
      procedimento: sql<string>`COALESCE(${relatorioAtendimentosCache.dsprocprin}, '')`,
      cid: sql<string>`COALESCE(CONCAT(${relatorioAtendimentosCache.cidprin}, ' - ', ${relatorioAtendimentosCache.diagnosticoCid}), '')`,
    })
    .from(relatorioAtendimentosCache)
    .where(
      and(
        sql`(${relatorioAtendimentosCache.tipoAtendimento} = 'I' OR ${relatorioAtendimentosCache.tipoAtendimentoDescricao} = 'Internação')`,
        sql`${relatorioAtendimentosCache.dataSaida} IS NULL`,
        sql`COALESCE(${relatorioAtendimentosCache.codplaco}, '') != 'PARIII'`
      )
    )
    .orderBy(relatorioAtendimentosCache.dataAtendimento);

  const agora = new Date();
  const pacientes: PacienteInternado[] = internados.map(r => {
    const dataEntrada = r.dataEntrada ? new Date(r.dataEntrada) : agora;
    const diasInternado = Math.max(1, Math.floor((agora.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      numatend: r.numatend,
      paciente: r.paciente,
      convenio: r.convenio,
      centroCusto: r.centroCusto,
      prestador: r.prestador,
      dataEntrada: dataEntrada.toISOString().split("T")[0],
      diasInternado,
      procedimento: r.procedimento,
      cid: r.cid,
    };
  });

  // Agrupar por centro de custo
  const ccMap = new Map<string, number>();
  for (const p of pacientes) {
    ccMap.set(p.centroCusto, (ccMap.get(p.centroCusto) || 0) + 1);
  }
  const porCentroCusto = [...ccMap.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  // Agrupar por convênio
  const convMap = new Map<string, number>();
  for (const p of pacientes) {
    convMap.set(p.convenio, (convMap.get(p.convenio) || 0) + 1);
  }
  const porConvenio = [...convMap.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  // Média de permanência
  const mediaPermancencia = pacientes.length > 0
    ? Math.round(pacientes.reduce((s, p) => s + p.diasInternado, 0) / pacientes.length * 10) / 10
    : 0;

  return {
    totalInternados: pacientes.length,
    pacientes,
    porCentroCusto,
    porConvenio,
    mediaPermancencia,
    fonte: "cache_local",
  };
}

async function buscarInternadosDoPostgresql(): Promise<DadosInternadosResult> {
  const pool = getWarleinePool();
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        a.numatend,
        COALESCE(cpc.nomepac, 'Não informado') as paciente,
        COALESCE(cp.nomeplaco, 'Não informado') as convenio,
        COALESCE(cc.nomecc, 'Não informado') as centro_custo,
        COALESCE(pr.nomeprest, 'Não informado') as prestador,
        a.datatend as data_entrada,
        COALESCE(proc.dsprocprin, '') as procedimento,
        COALESCE(a.cidprin || ' - ' || cid.descrcid, '') as cid
      FROM arqatend a
      LEFT JOIN cadpac cpc ON cpc.codpac = a.codpac
      LEFT JOIN cadplaco cp ON cp.codplaco = a.codplaco
      LEFT JOIN cadcc cc ON cc.codcc = a.codcc
      LEFT JOIN cadprest pr ON pr.codprest = a.codprest
      LEFT JOIN tabproc proc ON proc.codproc = a.procprin
      LEFT JOIN tabcid cid ON cid.codcid = a.cidprin
      WHERE a.tipoatend = 'I'
        AND a.datasai IS NULL
        AND COALESCE(a.codplaco, '') != 'PARIII'
      ORDER BY a.datatend ASC
    `);

    const agora = new Date();
    const pacientes: PacienteInternado[] = result.rows.map((r: any) => {
      const dataEntrada = r.data_entrada ? new Date(r.data_entrada) : agora;
      const diasInternado = Math.max(1, Math.floor((agora.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        numatend: r.numatend,
        paciente: r.paciente,
        convenio: r.convenio,
        centroCusto: r.centro_custo,
        prestador: r.prestador,
        dataEntrada: dataEntrada.toISOString().split("T")[0],
        diasInternado,
        procedimento: r.procedimento || "",
        cid: r.cid || "",
      };
    });

    // Agrupar por centro de custo
    const ccMap = new Map<string, number>();
    for (const p of pacientes) {
      ccMap.set(p.centroCusto, (ccMap.get(p.centroCusto) || 0) + 1);
    }
    const porCentroCusto = [...ccMap.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    // Agrupar por convênio
    const convMap = new Map<string, number>();
    for (const p of pacientes) {
      convMap.set(p.convenio, (convMap.get(p.convenio) || 0) + 1);
    }
    const porConvenio = [...convMap.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);

    const mediaPermancencia = pacientes.length > 0
      ? Math.round(pacientes.reduce((s, p) => s + p.diasInternado, 0) / pacientes.length * 10) / 10
      : 0;

    return {
      totalInternados: pacientes.length,
      pacientes,
      porCentroCusto,
      porConvenio,
      mediaPermancencia,
      fonte: "postgresql_direto",
    };
  } finally {
    client.release();
  }
}

// ==========================================
// HEMODIÁLISE - Indicador Separado
// ==========================================

export interface PacienteHemodialise {
  numatend: string;
  paciente: string;
  turno: string;
  prestador: string;
  dataEntrada: string;
  diasTratamento: number;
}

export interface DadosHemodialiseResult {
  totalPacientes: number;
  pacientes: PacienteHemodialise[];
  porTurno: Array<{ nome: string; total: number }>;
  porPrestador: Array<{ nome: string; total: number }>;
  sessoesNoMes: number;
  mediaDiasTratamento: number;
  fonte: "cache_local" | "postgresql_direto";
}

export async function buscarPacientesHemodialise(): Promise<DadosHemodialiseResult> {
  // Tentar cache local primeiro
  try {
    const db = await getDb();
    if (db) {
      const cacheCount = await db
        .select({ total: count() })
        .from(relatorioAtendimentosCache);

      if (cacheCount[0]?.total > 0) {
        return buscarHemodialiseDoCache(db);
      }
    }
  } catch (e) {
    console.warn("[Hemodialise] Cache indisponível, usando PostgreSQL:", (e as Error).message);
  }
  return buscarHemodialiseDoPostgresql();
}

function extrairTurno(centroCusto: string): string {
  const cc = centroCusto.toUpperCase();
  if (cc.includes("MATUTINO")) return "Matutino";
  if (cc.includes("VESPERTINO")) return "Vespertino";
  if (cc.includes("NOTURNO")) return "Noturno";
  if (cc.includes("HEMODIALISE") || cc.includes("HEMODIÁLISE")) return "Hemodiálise";
  return centroCusto;
}

async function buscarHemodialiseDoCache(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<DadosHemodialiseResult> {
  // Pacientes PARIII ativos (sem data de saída)
  const ativos = await db
    .select({
      numatend: relatorioAtendimentosCache.numatend,
      paciente: sql<string>`COALESCE(${relatorioAtendimentosCache.paciente}, 'Não informado')`,
      centroCusto: sql<string>`COALESCE(${relatorioAtendimentosCache.centroCusto}, 'Não informado')`,
      prestador: sql<string>`COALESCE(${relatorioAtendimentosCache.prestador}, 'Não informado')`,
      dataEntrada: relatorioAtendimentosCache.dataAtendimento,
    })
    .from(relatorioAtendimentosCache)
    .where(
      and(
        sql`COALESCE(${relatorioAtendimentosCache.codplaco}, '') = 'PARIII'`,
        sql`${relatorioAtendimentosCache.dataSaida} IS NULL`
      )
    )
    .orderBy(relatorioAtendimentosCache.dataAtendimento);

  // Contar sessões no mês atual (PARIII com data de saída)
  const mesAtual = new Date();
  const inicioMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1).toISOString().split("T")[0];
  const fimMes = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).toISOString().split("T")[0];

  const sessoesResult = await db
    .select({ total: count() })
    .from(relatorioAtendimentosCache)
    .where(
      and(
        sql`COALESCE(${relatorioAtendimentosCache.codplaco}, '') = 'PARIII'`,
        sql`${relatorioAtendimentosCache.dataSaida} IS NOT NULL`,
        sql`${relatorioAtendimentosCache.dataAtendimento} >= ${inicioMes}`,
        sql`${relatorioAtendimentosCache.dataAtendimento} <= ${fimMes}`
      )
    );

  return processarDadosHemodialise(ativos, sessoesResult[0]?.total || 0, "cache_local");
}

async function buscarHemodialiseDoPostgresql(): Promise<DadosHemodialiseResult> {
  const pool = getWarleinePool();
  const client = await pool.connect();
  try {
    // Pacientes PARIII ativos (sem alta)
    const result = await client.query(`
      SELECT 
        a.numatend,
        COALESCE(cpc.nomepac, 'Não informado') as paciente,
        COALESCE(cc.nomecc, 'Não informado') as centro_custo,
        COALESCE(pr.nomeprest, 'Não informado') as prestador,
        a.datatend as data_entrada
      FROM arqatend a
      LEFT JOIN cadpac cpc ON cpc.codpac = a.codpac
      LEFT JOIN cadcc cc ON cc.codcc = a.codcc
      LEFT JOIN cadprest pr ON pr.codprest = a.codprest
      WHERE a.codplaco = 'PARIII'
        AND a.datasai IS NULL
      ORDER BY a.datatend ASC
    `);

    // Sessões no mês atual (com alta)
    const sessoesResult = await client.query(`
      SELECT COUNT(*) as total
      FROM arqatend a
      WHERE a.codplaco = 'PARIII'
        AND a.datasai IS NOT NULL
        AND a.datatend >= DATE_TRUNC('month', CURRENT_DATE)
        AND a.datatend < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    `);

    const ativos = result.rows.map((r: any) => ({
      numatend: r.numatend,
      paciente: r.paciente,
      centroCusto: r.centro_custo,
      prestador: r.prestador,
      dataEntrada: r.data_entrada,
    }));

    return processarDadosHemodialise(ativos, parseInt(sessoesResult.rows[0]?.total || "0", 10), "postgresql_direto");
  } finally {
    client.release();
  }
}

function processarDadosHemodialise(
  ativos: Array<{ numatend: string; paciente: string; centroCusto: string; prestador: string; dataEntrada: any }>,
  sessoesNoMes: number,
  fonte: "cache_local" | "postgresql_direto"
): DadosHemodialiseResult {
  const agora = new Date();
  const pacientes: PacienteHemodialise[] = ativos.map(r => {
    const dataEntrada = r.dataEntrada ? new Date(r.dataEntrada) : agora;
    const diasTratamento = Math.max(1, Math.floor((agora.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      numatend: r.numatend,
      paciente: r.paciente,
      turno: extrairTurno(r.centroCusto),
      prestador: r.prestador,
      dataEntrada: dataEntrada.toISOString().split("T")[0],
      diasTratamento,
    };
  });

  // Agrupar por turno
  const turnoMap = new Map<string, number>();
  for (const p of pacientes) {
    turnoMap.set(p.turno, (turnoMap.get(p.turno) || 0) + 1);
  }
  const porTurno = [...turnoMap.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  // Agrupar por prestador (top 10)
  const prestMap = new Map<string, number>();
  for (const p of pacientes) {
    prestMap.set(p.prestador, (prestMap.get(p.prestador) || 0) + 1);
  }
  const porPrestador = [...prestMap.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const mediaDiasTratamento = pacientes.length > 0
    ? Math.round(pacientes.reduce((s, p) => s + p.diasTratamento, 0) / pacientes.length * 10) / 10
    : 0;

  return {
    totalPacientes: pacientes.length,
    pacientes,
    porTurno,
    porPrestador,
    sessoesNoMes,
    mediaDiasTratamento,
    fonte,
  };
}
