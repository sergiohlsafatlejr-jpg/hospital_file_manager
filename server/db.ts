import { eq, and, desc, like, sql, gte, lte, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { isNull } from "drizzle-orm";
import {
  InsertUser,
  users,
  convenios,
  arquivos,
  procedimentos,
  comparacoes,
  divergencias,
  codigosProcedimentos,
  camposComparacao,
  itensManuals,
  InsertConvenio,
  InsertArquivo,
  InsertProcedimento,
  InsertComparacao,
  InsertDivergencia,
  InsertCodigoProcedimento,
  InsertCampoComparacao,
  InsertItemManual,
  historicoContestacoes,
  argumentosConvenio,
  estabelecimentos,
  regrasConciliacao,
  InsertRegraConciliacao,
  decisoesGlosa,
  InsertDecisaoGlosa,
  tabelasPreco,
  InsertTabelaPreco,
  importacoesTabela,
  InsertImportacaoTabela,
  regrasNegocio,
  InsertRegraNegocio,
  itensRegraNegocio,
  InsertItemRegraNegocio,
  alertasDivergencia,
  InsertAlertaDivergencia,
  padroesContas,
  InsertPadraoConta,
  historicoValidacoes,
  InsertHistoricoValidacao,
  permissoesEstabelecimento,
  InsertPermissaoEstabelecimento,
  motivosGlosa,
  InsertMotivoGlosa,
  historicoPrecos,
  InsertHistoricoPreco,
  padroesCobranca,
  InsertPadraoCobranca,
  insightsIA,
  InsertInsightIA,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER FUNCTIONS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ CONVENIO FUNCTIONS ============

export async function createConvenio(data: InsertConvenio) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(convenios).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getConvenios(ativo?: "sim" | "nao", estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  
  if (ativo) {
    conditions.push(eq(convenios.ativo, ativo));
  }
  
  // Filtrar por estabelecimento: mostrar convênios do estabelecimento ou convênios globais (estabelecimentoId = null)
  if (estabelecimentoId) {
    conditions.push(
      or(
        eq(convenios.estabelecimentoId, estabelecimentoId),
        isNull(convenios.estabelecimentoId)
      )
    );
  }
  
  if (conditions.length > 0) {
    return db.select().from(convenios).where(and(...conditions)).orderBy(desc(convenios.createdAt));
  }
  return db.select().from(convenios).orderBy(desc(convenios.createdAt));
}

export async function getConvenioById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(convenios)
    .where(eq(convenios.id, id))
    .limit(1);
  return result[0] || null;
}

export async function updateConvenio(
  id: number,
  data: Partial<InsertConvenio>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(convenios).set(data).where(eq(convenios.id, id));
}

// ============ ARQUIVO FUNCTIONS ============

export async function createArquivo(data: InsertArquivo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(arquivos).values(data);
  return { id: Number(result[0].insertId) };
}

/**
 * Busca arquivo existente por nome, convênio e estabelecimento
 * Usado para detectar reimportação de arquivos
 */
export async function findArquivoExistente(params: {
  nome: string;
  convenioId: number;
  estabelecimentoId: number;
  userId: number;
  direcao: "enviado" | "retornado";
}) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(arquivos)
    .where(
      and(
        eq(arquivos.nome, params.nome),
        eq(arquivos.convenioId, params.convenioId),
        eq(arquivos.estabelecimentoId, params.estabelecimentoId),
        eq(arquivos.userId, params.userId),
        eq(arquivos.direcao, params.direcao)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Atualiza um arquivo existente (para reimportação)
 */
export async function updateArquivo(id: number, data: Partial<InsertArquivo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(arquivos).set(data).where(eq(arquivos.id, id));
  return { success: true };
}

export async function getArquivos(filters?: {
  convenioId?: number;
  direcao?: "enviado" | "retornado";
  tipoArquivo?: "xml" | "excel" | "pdf";
  status?: "pendente" | "processado" | "erro";
  userId?: number;
  estabelecimentoId?: number;
  dataInicio?: Date;
  dataFim?: Date;
  busca?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.convenioId) {
    conditions.push(eq(arquivos.convenioId, filters.convenioId));
  }
  if (filters?.direcao) {
    conditions.push(eq(arquivos.direcao, filters.direcao));
  }
  if (filters?.tipoArquivo) {
    conditions.push(eq(arquivos.tipoArquivo, filters.tipoArquivo));
  }
  if (filters?.status) {
    conditions.push(eq(arquivos.status, filters.status));
  }
  if (filters?.userId) {
    conditions.push(eq(arquivos.userId, filters.userId));
  }
  if (filters?.estabelecimentoId && filters.estabelecimentoId > 0) {
    conditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }
  if (filters?.dataInicio) {
    conditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters?.dataFim) {
    conditions.push(lte(arquivos.createdAt, filters.dataFim));
  }
  if (filters?.busca) {
    conditions.push(like(arquivos.nome, `%${filters.busca}%`));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(arquivos)
      .where(and(...conditions))
      .orderBy(desc(arquivos.createdAt));
  }

  return db.select().from(arquivos).orderBy(desc(arquivos.createdAt));
}

export async function getArquivoById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(arquivos)
    .where(eq(arquivos.id, id))
    .limit(1);
  return result[0] || null;
}

export async function updateArquivoStatus(
  id: number,
  status: "pendente" | "processado" | "erro" | "processando"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(arquivos).set({ status }).where(eq(arquivos.id, id));
}

export async function updateArquivoProgresso(
  id: number,
  progresso: number,
  itensProcessados: number,
  totalItens?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { progresso, itensProcessados };
  if (totalItens !== undefined) {
    updateData.totalItens = totalItens;
  }

  await db.update(arquivos).set(updateData).where(eq(arquivos.id, id));
}

export async function getArquivosStats(userId?: number, estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return null;

  const conditions: SQL[] = [];
  if (userId) conditions.push(eq(arquivos.userId, userId));
  if (estabelecimentoId && estabelecimentoId > 0) conditions.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  const baseCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [total, enviados, retornados, pendentes, processados, erros] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(baseCondition),
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(
          baseCondition
            ? and(baseCondition, eq(arquivos.direcao, "enviado"))
            : eq(arquivos.direcao, "enviado")
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(
          baseCondition
            ? and(baseCondition, eq(arquivos.direcao, "retornado"))
            : eq(arquivos.direcao, "retornado")
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(
          baseCondition
            ? and(baseCondition, eq(arquivos.status, "pendente"))
            : eq(arquivos.status, "pendente")
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(
          baseCondition
            ? and(baseCondition, eq(arquivos.status, "processado"))
            : eq(arquivos.status, "processado")
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(arquivos)
        .where(
          baseCondition
            ? and(baseCondition, eq(arquivos.status, "erro"))
            : eq(arquivos.status, "erro")
        ),
    ]);

  return {
    total: total[0]?.count || 0,
    enviados: enviados[0]?.count || 0,
    retornados: retornados[0]?.count || 0,
    pendentes: pendentes[0]?.count || 0,
    processados: processados[0]?.count || 0,
    erros: erros[0]?.count || 0,
  };
}

export async function deleteArquivo(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(arquivos).where(eq(arquivos.id, id));
  return { success: true };
}

// ============ PROCEDIMENTO FUNCTIONS ============

export async function createProcedimentos(
  data: InsertProcedimento[],
  arquivoId?: number,
  onProgress?: (progresso: number, itensProcessados: number, totalItens: number) => Promise<void>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.length === 0) return { count: 0 };

  // Use larger batch size for faster insertion
  // MySQL can handle larger batches efficiently - increased to 5000 for better throughput
  const BATCH_SIZE = 5000;
  let inserted = 0;
  const totalItens = data.length;
  const startTime = Date.now();
  
  // Process batches
  const batches: InsertProcedimento[][] = [];
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    batches.push(data.slice(i, i + BATCH_SIZE));
  }
  
  // Insert batches with optimized approach
  // Use Promise.all for parallel insertion of smaller groups (3 at a time)
  const PARALLEL_BATCHES = 3;
  
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const batchGroup = batches.slice(i, i + PARALLEL_BATCHES);
    
    // Insert batches in parallel
    await Promise.all(
      batchGroup.map(batch => db.insert(procedimentos).values(batch))
    );
    
    inserted += batchGroup.reduce((sum, b) => sum + b.length, 0);
    
    // Calculate progress percentage
    const progresso = Math.round((inserted / totalItens) * 100);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? inserted / elapsed : 0;
    const remaining = totalItens - inserted;
    const eta = rate > 0 ? remaining / rate : 0;
    
    // Only log every 3 batch groups or at the end to reduce log spam
    if ((i / PARALLEL_BATCHES) % 3 === 0 || i + PARALLEL_BATCHES >= batches.length) {
      console.log(`[DB] Progress: ${inserted}/${totalItens} (${progresso}%) - ${Math.round(rate)} items/sec - ETA: ${Math.round(eta)}s`);
    }
    
    // Report progress if callback provided (less frequently for better performance)
    if (onProgress && ((i / PARALLEL_BATCHES) % 2 === 0 || i + PARALLEL_BATCHES >= batches.length)) {
      await onProgress(progresso, inserted, totalItens);
    }
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`[DB] Completed: ${totalItens} procedimentos in ${totalTime.toFixed(1)}s (${Math.round(totalItens / totalTime)} items/sec)`);
  
  return { count: data.length };
}

export async function getProcedimentosByArquivoId(arquivoId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(procedimentos)
    .where(eq(procedimentos.arquivoId, arquivoId));
}

export async function deleteProcedimentosByArquivoId(arquivoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(procedimentos).where(eq(procedimentos.arquivoId, arquivoId));
  return { success: true };
}

/**
 * Verifica se já existem procedimentos com a mesma chave composta (numeroLote + sequencialTransacao)
 * Retorna os IDs dos arquivos que contêm esses procedimentos duplicados
 */
export async function verificarDuplicatasPorChaveComposta(
  numeroLote: string,
  sequencialTransacao: string,
  estabelecimentoId?: number
): Promise<{ arquivoId: number; count: number }[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];

  try {
    // Buscar procedimentos com a mesma chave composta
    const conditions = [
      eq(procedimentos.numeroLote, numeroLote),
      eq(procedimentos.sequencialTransacao, sequencialTransacao),
    ];

    const result = await dbConn
      .select({
        arquivoId: procedimentos.arquivoId,
        count: sql<number>`count(*)`
      })
      .from(procedimentos)
      .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
      .where(
        estabelecimentoId
          ? and(...conditions, eq(arquivos.estabelecimentoId, estabelecimentoId))
          : and(...conditions)
      )
      .groupBy(procedimentos.arquivoId);

    return result;
  } catch (error) {
    console.error('[DB] Erro ao verificar duplicatas:', error);
    return [];
  }
}

/**
 * Busca procedimentos existentes por chave composta para atualização
 */
export async function getProcedimentosPorChaveComposta(
  numeroLote: string,
  sequencialTransacao: string,
  guiaNumero?: string
): Promise<{ id: number; arquivoId: number; guiaNumero: string | null }[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];

  try {
    const conditions = [
      eq(procedimentos.numeroLote, numeroLote),
      eq(procedimentos.sequencialTransacao, sequencialTransacao),
    ];

    if (guiaNumero) {
      conditions.push(eq(procedimentos.guiaNumero, guiaNumero));
    }

    const result = await dbConn
      .select({
        id: procedimentos.id,
        arquivoId: procedimentos.arquivoId,
        guiaNumero: procedimentos.guiaNumero,
      })
      .from(procedimentos)
      .where(and(...conditions));

    return result;
  } catch (error) {
    console.error('[DB] Erro ao buscar procedimentos por chave composta:', error);
    return [];
  }
}

export async function getProcedimentoById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(procedimentos)
    .where(eq(procedimentos.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getProcedimentosPaginated(filters?: {
  arquivoId?: number;
  convenioId?: number;
  search?: string;
  nomeMedico?: string;
  crmMedico?: string;
  statusGlosa?: string;
  page?: number;
  pageSize?: number;
  userId?: number;
  estabelecimentoId?: number;
  apenasRetornados?: boolean;
  mesReferencia?: number; // 1-12
  anoReferencia?: number; // ex: 2025
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, resumo: null };

  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const offset = (page - 1) * pageSize;

  // Build conditions
  const conditions = [];

  if (filters?.arquivoId) {
    conditions.push(eq(procedimentos.arquivoId, filters.arquivoId));
  }

  if (filters?.search) {
    conditions.push(
      or(
        like(procedimentos.codigo, `%${filters.search}%`),
        like(procedimentos.descricao, `%${filters.search}%`),
        like(procedimentos.guiaNumero, `%${filters.search}%`),
        like(procedimentos.pacienteNome, `%${filters.search}%`)
      )
    );
  }

  if (filters?.nomeMedico) {
    conditions.push(like(procedimentos.nomeMedico, `%${filters.nomeMedico}%`));
  }

  if (filters?.crmMedico) {
    conditions.push(like(procedimentos.crmMedico, `%${filters.crmMedico}%`));
  }

  // Add convenioId filter
  if (filters?.convenioId) {
    conditions.push(eq(arquivos.convenioId, filters.convenioId));
  }

  // Add estabelecimentoId filter (show all procedures from the establishment, not just user's files)
  if (filters?.estabelecimentoId && filters.estabelecimentoId > 0) {
    conditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  // Add filter for only returned files (for Demonstrativo)
  if (filters?.apenasRetornados) {
    conditions.push(eq(arquivos.direcao, "retornado"));
  }

  // Add filter for reference month/year (based on dataReferencia from arquivo - set during upload)
  if (filters?.mesReferencia && filters?.anoReferencia) {
    // Filter by month and year of arquivo.dataReferencia
    conditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia} AND YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters?.anoReferencia) {
    // Filter by year only
    conditions.push(
      sql`YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters?.mesReferencia) {
    // Filter by month only (all years)
    conditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia}`
    );
  }

  // Add filter for status glosa (pago, glosado, parcial)
  if (filters?.statusGlosa && filters.statusGlosa !== "todos") {
    if (filters.statusGlosa === "pago") {
      // Pago: valorGlosado é null, 0 ou vazio
      conditions.push(
        or(
          isNull(procedimentos.valorGlosado),
          eq(procedimentos.valorGlosado, "0"),
          eq(procedimentos.valorGlosado, ""),
          sql`CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) = 0`
        )
      );
    } else if (filters.statusGlosa === "glosado") {
      // Glosado: valorGlosado >= valorTotal (glosa total)
      conditions.push(
        sql`CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) > 0 AND CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) >= CAST(${procedimentos.valorTotal} AS DECIMAL(12,2))`
      );
    } else if (filters.statusGlosa === "parcial") {
      // Parcial: valorGlosado > 0 mas < valorTotal
      conditions.push(
        sql`CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) > 0 AND CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) < CAST(${procedimentos.valorTotal} AS DECIMAL(12,2))`
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get paginated items with optimized query
  const items = await db
    .select({
      id: procedimentos.id,
      arquivoId: procedimentos.arquivoId,
      codigo: procedimentos.codigo,
      descricao: procedimentos.descricao,
      quantidade: procedimentos.quantidade,
      valorUnitario: procedimentos.valorUnitario,
      valorTotal: procedimentos.valorTotal,
      dataExecucao: procedimentos.dataExecucao,
      pacienteNome: procedimentos.pacienteNome,
      pacienteCarteirinha: procedimentos.pacienteCarteirinha,
      guiaNumero: procedimentos.guiaNumero,
      nomeMedico: procedimentos.nomeMedico,
      crmMedico: procedimentos.crmMedico,
      valorGlosado: procedimentos.valorGlosado,
      motivoGlosa: procedimentos.motivoGlosa,
      codigoDespesa: procedimentos.codigoDespesa,
      tipoDespesa: procedimentos.tipoDespesa,
      dadosExtras: procedimentos.dadosExtras,
      createdAt: procedimentos.createdAt,
      arquivoNome: arquivos.nome,
      arquivoConvenioId: arquivos.convenioId,
      convenioNome: convenios.nome,
    })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .leftJoin(convenios, eq(arquivos.convenioId, convenios.id))
    .where(whereClause)
    .orderBy(desc(procedimentos.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Get total count with optimized query (only count, no data)
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(whereClause);
  
  const total = countResult[0]?.count || 0;

  // Get resumo with aggregation query from ALL items (not just paginated)
  const resumoResult = await db
    .select({
      totalValor: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(12,2))), 0)`,
      totalGlosado: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2))), 0)`,
      quantidadeGlosados: sql<number>`SUM(CASE WHEN ${procedimentos.valorGlosado} > 0 AND CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) >= CAST(${procedimentos.valorTotal} AS DECIMAL(12,2)) THEN 1 ELSE 0 END)`,
      quantidadeParciais: sql<number>`SUM(CASE WHEN ${procedimentos.valorGlosado} > 0 AND CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2)) < CAST(${procedimentos.valorTotal} AS DECIMAL(12,2)) THEN 1 ELSE 0 END)`,
      quantidadePagos: sql<number>`SUM(CASE WHEN ${procedimentos.valorGlosado} IS NULL OR ${procedimentos.valorGlosado} = 0 OR ${procedimentos.valorGlosado} = '0' THEN 1 ELSE 0 END)`,
      totalRegistros: sql<number>`count(*)`
    })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(whereClause);

  const resumoData = resumoResult[0] || {};
  const totalValor = parseFloat(String(resumoData.totalValor || 0));
  const totalGlosadoDb = parseFloat(String(resumoData.totalGlosado || 0));
  const quantidadeGlosados = parseInt(String(resumoData.quantidadeGlosados || 0));
  const quantidadeParciais = parseInt(String(resumoData.quantidadeParciais || 0));
  const quantidadePagos = parseInt(String(resumoData.quantidadePagos || 0));

  const resumo = {
    totalPago: totalValor - totalGlosadoDb,
    totalGlosado: totalGlosadoDb,
    quantidadePagos,
    quantidadeGlosados,
    quantidadeParciais,
    total,
  };

  return { items, total, resumo };
}

// ============ COMPARACAO FUNCTIONS ============

export async function createComparacao(data: InsertComparacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(comparacoes).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getComparacoes(filters?: {
  convenioId?: number;
  userId?: number;
  estabelecimentoId?: number;
  status?: "pendente" | "concluida" | "erro";
  dataInicio?: Date;
  dataFim?: Date;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.convenioId) {
    conditions.push(eq(comparacoes.convenioId, filters.convenioId));
  }
  if (filters?.userId) {
    conditions.push(eq(comparacoes.userId, filters.userId));
  }
  if (filters?.estabelecimentoId && filters.estabelecimentoId > 0) {
    conditions.push(eq(comparacoes.estabelecimentoId, filters.estabelecimentoId));
  }
  if (filters?.status) {
    conditions.push(eq(comparacoes.status, filters.status));
  }
  if (filters?.dataInicio) {
    conditions.push(gte(comparacoes.createdAt, filters.dataInicio));
  }
  if (filters?.dataFim) {
    conditions.push(lte(comparacoes.createdAt, filters.dataFim));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(comparacoes)
      .where(and(...conditions))
      .orderBy(desc(comparacoes.createdAt));
  }

  return db.select().from(comparacoes).orderBy(desc(comparacoes.createdAt));
}

export async function getComparacaoById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(comparacoes)
    .where(eq(comparacoes.id, id))
    .limit(1);
  return result[0] || null;
}

export async function updateComparacao(
  id: number,
  data: Partial<InsertComparacao>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(comparacoes).set(data).where(eq(comparacoes.id, id));
}

export async function getComparacoesStats(userId?: number, estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return null;

  const conditions: SQL[] = [];
  if (userId) conditions.push(eq(comparacoes.userId, userId));
  if (estabelecimentoId && estabelecimentoId > 0) conditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
  const baseCondition = conditions.length > 0 ? and(...conditions) : undefined;

  const [total, concluidas, pendentes, comDivergencias] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(comparacoes)
      .where(baseCondition),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comparacoes)
      .where(
        baseCondition
          ? and(baseCondition, eq(comparacoes.status, "concluida"))
          : eq(comparacoes.status, "concluida")
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comparacoes)
      .where(
        baseCondition
          ? and(baseCondition, eq(comparacoes.status, "pendente"))
          : eq(comparacoes.status, "pendente")
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(comparacoes)
      .where(
        baseCondition
          ? and(
              baseCondition,
              eq(comparacoes.status, "concluida"),
              sql`${comparacoes.totalDivergencias} > 0`
            )
          : and(
              eq(comparacoes.status, "concluida"),
              sql`${comparacoes.totalDivergencias} > 0`
            )
      ),
  ]);

  return {
    total: total[0]?.count || 0,
    concluidas: concluidas[0]?.count || 0,
    pendentes: pendentes[0]?.count || 0,
    comDivergencias: comDivergencias[0]?.count || 0,
  };
}

// ============ DIVERGENCIA FUNCTIONS ============

export async function createDivergencias(data: InsertDivergencia[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.length === 0) return { count: 0 };

  await db.insert(divergencias).values(data);
  return { count: data.length };
}

export async function getDivergenciasByComparacaoId(comparacaoId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(divergencias)
    .where(eq(divergencias.comparacaoId, comparacaoId));
}

export async function updateDivergenciaResolvido(
  id: number,
  resolvido: "sim" | "nao"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(divergencias).set({ resolvido }).where(eq(divergencias.id, id));
}

// ============ CODIGO PROCEDIMENTO FUNCTIONS ============

export async function createCodigoProcedimento(data: InsertCodigoProcedimento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(codigosProcedimentos).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getCodigosProcedimentos(ativo?: "sim" | "nao") {
  const db = await getDb();
  if (!db) return [];

  if (ativo) {
    return db
      .select()
      .from(codigosProcedimentos)
      .where(eq(codigosProcedimentos.ativo, ativo));
  }
  return db.select().from(codigosProcedimentos);
}

export async function updateCodigoProcedimento(
  id: number,
  data: Partial<InsertCodigoProcedimento>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(codigosProcedimentos)
    .set(data)
    .where(eq(codigosProcedimentos.id, id));
}

export async function deleteCodigoProcedimento(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(codigosProcedimentos)
    .set({ ativo: "nao" })
    .where(eq(codigosProcedimentos.id, id));
}

// ============ CAMPO COMPARACAO FUNCTIONS ============

export async function createCampoComparacao(data: InsertCampoComparacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(camposComparacao).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getCamposComparacao(ativo?: "sim" | "nao") {
  const db = await getDb();
  if (!db) return [];

  if (ativo) {
    return db
      .select()
      .from(camposComparacao)
      .where(eq(camposComparacao.ativo, ativo));
  }
  return db.select().from(camposComparacao);
}

export async function updateCampoComparacao(
  id: number,
  data: Partial<InsertCampoComparacao>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(camposComparacao)
    .set(data)
    .where(eq(camposComparacao.id, id));
}

// ============ ITEM MANUAL FUNCTIONS ============

export async function createItemManual(data: InsertItemManual) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(itensManuals).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getItensManuals(filters?: {
  arquivoId?: number;
  comparacaoId?: number;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filters?.arquivoId) {
    conditions.push(eq(itensManuals.arquivoId, filters.arquivoId));
  }
  if (filters?.comparacaoId) {
    conditions.push(eq(itensManuals.comparacaoId, filters.comparacaoId));
  }
  if (filters?.userId) {
    conditions.push(eq(itensManuals.userId, filters.userId));
  }

  if (conditions.length > 0) {
    return db
      .select()
      .from(itensManuals)
      .where(and(...conditions))
      .orderBy(desc(itensManuals.createdAt));
  }

  return db.select().from(itensManuals).orderBy(desc(itensManuals.createdAt));
}

export async function deleteItemManual(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(itensManuals).where(eq(itensManuals.id, id));
}

// ============ FATURAMENTO E GLOSA FUNCTIONS ============

export interface FaturamentoConvenio {
  convenioId: number;
  convenioNome: string;
  totalEnviado: number;
  totalRetornado: number;
  totalGlosado: number;
  percentualGlosa: number;
  quantidadeArquivos: number;
  quantidadeProcedimentos: number;
}

export interface FaturamentoPorMes {
  mes: string;
  ano: number;
  totalEnviado: number;
  totalRetornado: number;
  totalGlosado: number;
}

export async function getFaturamentoPorConvenio(
  userId?: number, 
  estabelecimentoId?: number,
  mesReferencia?: number,
  anoReferencia?: number
): Promise<FaturamentoConvenio[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os convênios (filtrados por estabelecimento se especificado)
  const convConditions = [eq(convenios.ativo, "sim")];
  if (estabelecimentoId && estabelecimentoId > 0) {
    convConditions.push(eq(convenios.estabelecimentoId, estabelecimentoId));
  }
  const convList = await db.select().from(convenios).where(and(...convConditions));
  
  const resultado: FaturamentoConvenio[] = [];

  for (const conv of convList) {
    // Buscar arquivos ENVIADOS do convênio (XMLs enviados para o convênio)
    const conditionsEnviados: any[] = [
      eq(arquivos.convenioId, conv.id),
      eq(arquivos.direcao, "enviado"),
      eq(arquivos.status, "processado"),
    ];
    
    if (userId) {
      conditionsEnviados.push(eq(arquivos.userId, userId));
    }
    if (estabelecimentoId && estabelecimentoId > 0) {
      conditionsEnviados.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
    }
    // Filtrar por mês/ano usando dataReferencia
    if (mesReferencia && anoReferencia) {
      const dataInicio = new Date(anoReferencia, mesReferencia - 1, 1);
      const dataFim = new Date(anoReferencia, mesReferencia, 0, 23, 59, 59);
      conditionsEnviados.push(gte(arquivos.dataReferencia, dataInicio));
      conditionsEnviados.push(lte(arquivos.dataReferencia, dataFim));
    } else if (anoReferencia) {
      const dataInicio = new Date(anoReferencia, 0, 1);
      const dataFim = new Date(anoReferencia, 11, 31, 23, 59, 59);
      conditionsEnviados.push(gte(arquivos.dataReferencia, dataInicio));
      conditionsEnviados.push(lte(arquivos.dataReferencia, dataFim));
    }

    const arquivosEnviados = await db
      .select()
      .from(arquivos)
      .where(and(...conditionsEnviados));

    // Buscar arquivos RETORNADOS do convênio (demonstrativos recebidos)
    const conditionsRetornados: any[] = [
      eq(arquivos.convenioId, conv.id),
      eq(arquivos.direcao, "retornado"),
      eq(arquivos.status, "processado"),
    ];
    
    if (userId) {
      conditionsRetornados.push(eq(arquivos.userId, userId));
    }
    if (estabelecimentoId && estabelecimentoId > 0) {
      conditionsRetornados.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
    }
    // Filtrar por mês/ano usando dataReferencia
    if (mesReferencia && anoReferencia) {
      const dataInicio = new Date(anoReferencia, mesReferencia - 1, 1);
      const dataFim = new Date(anoReferencia, mesReferencia, 0, 23, 59, 59);
      conditionsRetornados.push(gte(arquivos.dataReferencia, dataInicio));
      conditionsRetornados.push(lte(arquivos.dataReferencia, dataFim));
    } else if (anoReferencia) {
      const dataInicio = new Date(anoReferencia, 0, 1);
      const dataFim = new Date(anoReferencia, 11, 31, 23, 59, 59);
      conditionsRetornados.push(gte(arquivos.dataReferencia, dataInicio));
      conditionsRetornados.push(lte(arquivos.dataReferencia, dataFim));
    }

    const arquivosRetornados = await db
      .select()
      .from(arquivos)
      .where(and(...conditionsRetornados));

    // Calcular totais dos arquivos ENVIADOS
    let totalEnviado = 0;
    let quantidadeProcedimentosEnviados = 0;

    for (const arq of arquivosEnviados) {
      const procs = await db
        .select({
          valorTotal: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(12,2))), 0)`,
          count: sql<number>`count(*)`
        })
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      totalEnviado += parseFloat(String(procs[0]?.valorTotal || 0));
      quantidadeProcedimentosEnviados += parseInt(String(procs[0]?.count || 0));
    }

    // Calcular totais dos arquivos RETORNADOS (incluindo glosas)
    let totalRetornado = 0;
    let totalGlosado = 0;
    let quantidadeProcedimentosRetornados = 0;

    for (const arq of arquivosRetornados) {
      const procs = await db
        .select({
          valorTotal: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(12,2))), 0)`,
          valorGlosado: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorGlosado} AS DECIMAL(12,2))), 0)`,
          count: sql<number>`count(*)`
        })
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      totalRetornado += parseFloat(String(procs[0]?.valorTotal || 0));
      totalGlosado += parseFloat(String(procs[0]?.valorGlosado || 0));
      quantidadeProcedimentosRetornados += parseInt(String(procs[0]?.count || 0));
    }

    // Se não houver arquivos retornados, usar valores enviados
    if (arquivosRetornados.length === 0) {
      totalRetornado = totalEnviado;
    }

    // O valor pago é o total retornado menos o glosado
    const totalPago = totalRetornado - totalGlosado;
    const percentualGlosa = totalRetornado > 0 ? (totalGlosado / totalRetornado) * 100 : 0;

    resultado.push({
      convenioId: conv.id,
      convenioNome: conv.nome,
      totalEnviado,
      totalRetornado: totalPago, // Valor efetivamente pago
      totalGlosado,
      percentualGlosa,
      quantidadeArquivos: arquivosEnviados.length + arquivosRetornados.length,
      quantidadeProcedimentos: quantidadeProcedimentosEnviados + quantidadeProcedimentosRetornados,
    });
  }

  return resultado.filter(r => r.quantidadeArquivos > 0);
}

export async function getFaturamentoPorMes(
  userId?: number,
  convenioId?: number,
  meses: number = 12,
  estabelecimentoId?: number,
  anoReferencia?: number
): Promise<FaturamentoPorMes[]> {
  const db = await getDb();
  if (!db) return [];

  const resultado: FaturamentoPorMes[] = [];
  const hoje = new Date();
  const anoBase = anoReferencia || hoje.getFullYear();

  for (let i = 0; i < meses; i++) {
    const data = new Date(anoBase, hoje.getMonth() - i, 1);
    const mes = data.toLocaleString("pt-BR", { month: "short" });
    const ano = data.getFullYear();
    const inicioMes = new Date(data.getFullYear(), data.getMonth(), 1);
    const fimMes = new Date(data.getFullYear(), data.getMonth() + 1, 0, 23, 59, 59);

    // Buscar arquivos do mês
    const conditions: any[] = [
      eq(arquivos.direcao, "enviado"),
      eq(arquivos.status, "processado"),
      gte(arquivos.createdAt, inicioMes),
      lte(arquivos.createdAt, fimMes),
    ];

    if (userId) {
      conditions.push(eq(arquivos.userId, userId));
    }
    if (convenioId) {
      conditions.push(eq(arquivos.convenioId, convenioId));
    }
    if (estabelecimentoId && estabelecimentoId > 0) {
      conditions.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
    }

    const arquivosMes = await db
      .select()
      .from(arquivos)
      .where(and(...conditions));

    let totalEnviado = 0;
    for (const arq of arquivosMes) {
      const procs = await db
        .select()
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      for (const proc of procs) {
        totalEnviado += parseFloat(proc.valorTotal || "0");
      }
    }

    // Buscar comparações do mês
    const compConditions: any[] = [
      gte(comparacoes.createdAt, inicioMes),
      lte(comparacoes.createdAt, fimMes),
    ];

    if (userId) {
      compConditions.push(eq(comparacoes.userId, userId));
    }
    if (convenioId) {
      compConditions.push(eq(comparacoes.convenioId, convenioId));
    }
    if (estabelecimentoId && estabelecimentoId > 0) {
      compConditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
    }

    const compsMes = await db
      .select()
      .from(comparacoes)
      .where(and(...compConditions));

    let totalRetornado = 0;
    for (const comp of compsMes) {
      totalRetornado += parseFloat(comp.valorTotalRetornado || "0");
    }

    // Se não houver comparações, usar o valor enviado
    if (compsMes.length === 0) {
      totalRetornado = totalEnviado;
    }

    resultado.push({
      mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      ano,
      totalEnviado,
      totalRetornado,
      totalGlosado: totalEnviado - totalRetornado,
    });
  }

  return resultado.reverse();
}

export async function getResumoGeral(
  userId?: number, 
  estabelecimentoId?: number,
  mesReferencia?: number,
  anoReferencia?: number
) {
  const db = await getDb();
  if (!db) return null;

  // Função auxiliar para adicionar filtros de período
  const addPeriodoConditions = (conditions: any[]) => {
    if (mesReferencia && anoReferencia) {
      const dataInicio = new Date(anoReferencia, mesReferencia - 1, 1);
      const dataFim = new Date(anoReferencia, mesReferencia, 0, 23, 59, 59);
      conditions.push(gte(arquivos.dataReferencia, dataInicio));
      conditions.push(lte(arquivos.dataReferencia, dataFim));
    } else if (anoReferencia) {
      const dataInicio = new Date(anoReferencia, 0, 1);
      const dataFim = new Date(anoReferencia, 11, 31, 23, 59, 59);
      conditions.push(gte(arquivos.dataReferencia, dataInicio));
      conditions.push(lte(arquivos.dataReferencia, dataFim));
    }
  };

  // Total de arquivos
  const arquivosConditions: any[] = [];
  if (userId) {
    arquivosConditions.push(eq(arquivos.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    arquivosConditions.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  }
  addPeriodoConditions(arquivosConditions);

  const totalArquivos = await db
    .select({ count: sql<number>`count(*)` })
    .from(arquivos)
    .where(arquivosConditions.length > 0 ? and(...arquivosConditions) : undefined);

  // Total de procedimentos ENVIADOS (XMLs)
  const arquivosEnviadosConditions: any[] = [eq(arquivos.direcao, "enviado"), eq(arquivos.status, "processado")];
  if (userId) {
    arquivosEnviadosConditions.push(eq(arquivos.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    arquivosEnviadosConditions.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  }
  addPeriodoConditions(arquivosEnviadosConditions);

  const arquivosEnviados = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(and(...arquivosEnviadosConditions));

  let valorTotalEnviado = 0;
  let totalProcedimentosEnviados = 0;

  if (arquivosEnviados.length > 0) {
    const enviadosIds = arquivosEnviados.map(a => a.id);
    const procEnviadosStats = await db
      .select({ 
        count: sql<number>`count(*)`,
        valorTotal: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(15,2))), 0)`
      })
      .from(procedimentos)
      .where(inArray(procedimentos.arquivoId, enviadosIds));
    
    valorTotalEnviado = Number(procEnviadosStats[0]?.valorTotal) || 0;
    totalProcedimentosEnviados = Number(procEnviadosStats[0]?.count) || 0;
  }

  // Total de procedimentos RETORNADOS (Excel)
  const arquivosRetornadosConditions: any[] = [eq(arquivos.direcao, "retornado"), eq(arquivos.status, "processado")];
  if (userId) {
    arquivosRetornadosConditions.push(eq(arquivos.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    arquivosRetornadosConditions.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  }
  addPeriodoConditions(arquivosRetornadosConditions);

  const arquivosRetornados = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(and(...arquivosRetornadosConditions));

  let valorTotalRetornado = 0;
  let totalProcedimentosRetornados = 0;

  if (arquivosRetornados.length > 0) {
    const retornadosIds = arquivosRetornados.map(a => a.id);
    const procRetornadosStats = await db
      .select({ 
        count: sql<number>`count(*)`,
        valorTotal: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(15,2))), 0)`
      })
      .from(procedimentos)
      .where(inArray(procedimentos.arquivoId, retornadosIds));
    
    valorTotalRetornado = Number(procRetornadosStats[0]?.valorTotal) || 0;
    totalProcedimentosRetornados = Number(procRetornadosStats[0]?.count) || 0;
  }

  // Total de comparações e divergências
  const compConditions: any[] = [];
  if (userId) {
    compConditions.push(eq(comparacoes.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    compConditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
  }

  const compStats = await db
    .select({
      total: sql<number>`count(*)`,
      totalDivergencias: sql<number>`COALESCE(SUM(${comparacoes.totalDivergencias}), 0)`,
    })
    .from(comparacoes)
    .where(compConditions.length > 0 ? and(...compConditions) : undefined);

  // Calcular glosa baseado nos valores reais
  const valorGlosado = valorTotalEnviado > valorTotalRetornado 
    ? valorTotalEnviado - valorTotalRetornado 
    : 0;

  return {
    totalArquivos: Number(totalArquivos[0]?.count) || 0,
    totalProcedimentos: totalProcedimentosEnviados,
    totalProcedimentosRetornados,
    totalComparacoes: Number(compStats[0]?.total) || 0,
    totalDivergencias: Number(compStats[0]?.totalDivergencias) || 0,
    valorTotalEnviado,
    valorTotalRetornado,
    valorGlosado,
    percentualGlosa: valorTotalEnviado > 0 ? (valorGlosado / valorTotalEnviado) * 100 : 0,
  };
}

// ============ ANÁLISE DE GLOSA FUNCTIONS ============

export interface GlosaPorMotivo {
  categoriaGlosa: string;
  quantidade: number;
  valorTotal: number;
  percentual: number;
}

export interface GlosaPorConvenio {
  convenioId: number;
  convenioNome: string;
  totalDivergencias: number;
  valorGlosado: number;
  motivosPrincipais: GlosaPorMotivo[];
}

export interface GlosaPorProcedimento {
  codigo: string;
  descricao: string;
  quantidadeGlosas: number;
  valorGlosado: number;
  motivoPrincipal: string;
}

export interface TendenciaGlosa {
  mes: string;
  ano: number;
  totalGlosas: number;
  valorGlosado: number;
  categorias: { [key: string]: number };
}

const CATEGORIAS_GLOSA_LABELS: { [key: string]: string } = {
  valor_divergente: "Valor Divergente",
  procedimento_nao_autorizado: "Procedimento Não Autorizado",
  documentacao_incompleta: "Documentação Incompleta",
  prazo_excedido: "Prazo Excedido",
  duplicidade: "Duplicidade",
  codigo_invalido: "Código Inválido",
  quantidade_excedente: "Quantidade Excedente",
  paciente_nao_elegivel: "Paciente Não Elegível",
  outros: "Outros",
};

export async function getGlosaPorConvenio(userId?: number, estabelecimentoId?: number, convenioId?: number): Promise<GlosaPorConvenio[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os convênios ativos
  const convConditions: any[] = [eq(convenios.ativo, "sim")];
  if (estabelecimentoId) {
    convConditions.push(eq(convenios.estabelecimentoId, estabelecimentoId));
  }
  if (convenioId) {
    convConditions.push(eq(convenios.id, convenioId));
  }
  const convList = await db.select().from(convenios).where(and(...convConditions));
  const resultado: GlosaPorConvenio[] = [];

  for (const conv of convList) {
    // Buscar comparações do convênio
    const compConditions: any[] = [eq(comparacoes.convenioId, conv.id)];
    if (userId) {
      compConditions.push(eq(comparacoes.userId, userId));
    }

    const comps = await db
      .select()
      .from(comparacoes)
      .where(and(...compConditions));

    if (comps.length === 0) continue;

    // Buscar divergências das comparações
    let totalDivergencias = 0;
    let valorGlosado = 0;
    const motivosCount: { [key: string]: { quantidade: number; valor: number } } = {};

    for (const comp of comps) {
      const divs = await db
        .select()
        .from(divergencias)
        .where(eq(divergencias.comparacaoId, comp.id));

      for (const div of divs) {
        totalDivergencias++;
        const diferenca = parseFloat(div.diferenca || "0");
        valorGlosado += Math.abs(diferenca);

        // Determinar categoria baseada no tipo se não tiver categoria definida
        let categoria = div.categoriaGlosa || "outros";
        if (!div.categoriaGlosa) {
          switch (div.tipo) {
            case "valor":
              categoria = "valor_divergente";
              break;
            case "quantidade":
              categoria = "quantidade_excedente";
              break;
            case "ausente_retorno":
              categoria = "procedimento_nao_autorizado";
              break;
            case "ausente_envio":
              categoria = "outros";
              break;
            case "dados":
              categoria = "documentacao_incompleta";
              break;
          }
        }

        if (!motivosCount[categoria]) {
          motivosCount[categoria] = { quantidade: 0, valor: 0 };
        }
        motivosCount[categoria].quantidade++;
        motivosCount[categoria].valor += Math.abs(diferenca);
      }
    }

    if (totalDivergencias === 0) continue;

    // Converter para array e calcular percentuais
    const motivosPrincipais: GlosaPorMotivo[] = Object.entries(motivosCount)
      .map(([cat, data]) => ({
        categoriaGlosa: CATEGORIAS_GLOSA_LABELS[cat] || cat,
        quantidade: data.quantidade,
        valorTotal: data.valor,
        percentual: (data.quantidade / totalDivergencias) * 100,
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);

    resultado.push({
      convenioId: conv.id,
      convenioNome: conv.nome,
      totalDivergencias,
      valorGlosado,
      motivosPrincipais,
    });
  }

  return resultado.sort((a, b) => b.valorGlosado - a.valorGlosado);
}

export async function getGlosaPorProcedimento(
  userId?: number,
  convenioId?: number,
  limit: number = 20,
  estabelecimentoId?: number
): Promise<GlosaPorProcedimento[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar comparações
  const compConditions: any[] = [];
  if (userId) {
    compConditions.push(eq(comparacoes.userId, userId));
  }
  if (convenioId) {
    compConditions.push(eq(comparacoes.convenioId, convenioId));
  }
  if (estabelecimentoId) {
    compConditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
  }

  const comps = await db
    .select()
    .from(comparacoes)
    .where(compConditions.length > 0 ? and(...compConditions) : undefined);

  const procedimentosGlosados: {
    [key: string]: {
      codigo: string;
      descricao: string;
      quantidade: number;
      valor: number;
      motivos: { [key: string]: number };
    };
  } = {};

  for (const comp of comps) {
    const divs = await db
      .select()
      .from(divergencias)
      .where(eq(divergencias.comparacaoId, comp.id));

    for (const div of divs) {
      if (!div.procedimentoEnviadoId) continue;

      // Buscar procedimento
      const proc = await db
        .select()
        .from(procedimentos)
        .where(eq(procedimentos.id, div.procedimentoEnviadoId))
        .limit(1);

      if (proc.length === 0) continue;

      const p = proc[0];
      const key = p.codigo;
      const diferenca = Math.abs(parseFloat(div.diferenca || "0"));

      if (!procedimentosGlosados[key]) {
        procedimentosGlosados[key] = {
          codigo: p.codigo,
          descricao: p.descricao || "",
          quantidade: 0,
          valor: 0,
          motivos: {},
        };
      }

      procedimentosGlosados[key].quantidade++;
      procedimentosGlosados[key].valor += diferenca;

      const categoria = div.categoriaGlosa || div.tipo || "outros";
      procedimentosGlosados[key].motivos[categoria] =
        (procedimentosGlosados[key].motivos[categoria] || 0) + 1;
    }
  }

  // Converter para array e ordenar
  return Object.values(procedimentosGlosados)
    .map((p) => {
      const motivoPrincipal = Object.entries(p.motivos).sort(
        (a, b) => b[1] - a[1]
      )[0];
      return {
        codigo: p.codigo,
        descricao: p.descricao,
        quantidadeGlosas: p.quantidade,
        valorGlosado: p.valor,
        motivoPrincipal: CATEGORIAS_GLOSA_LABELS[motivoPrincipal?.[0]] || motivoPrincipal?.[0] || "Outros",
      };
    })
    .sort((a, b) => b.valorGlosado - a.valorGlosado)
    .slice(0, limit);
}

export async function getTendenciaGlosa(
  userId?: number,
  convenioId?: number,
  meses: number = 12,
  estabelecimentoId?: number
): Promise<TendenciaGlosa[]> {
  const db = await getDb();
  if (!db) return [];

  const resultado: TendenciaGlosa[] = [];
  const hoje = new Date();

  for (let i = 0; i < meses; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = data.toLocaleString("pt-BR", { month: "short" });
    const ano = data.getFullYear();
    const inicioMes = new Date(data.getFullYear(), data.getMonth(), 1);
    const fimMes = new Date(data.getFullYear(), data.getMonth() + 1, 0, 23, 59, 59);

    // Buscar comparações do mês
    const compConditions: any[] = [
      gte(comparacoes.createdAt, inicioMes),
      lte(comparacoes.createdAt, fimMes),
    ];

    if (userId) {
      compConditions.push(eq(comparacoes.userId, userId));
    }
    if (estabelecimentoId) {
      compConditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
    }
    if (convenioId) {
      compConditions.push(eq(comparacoes.convenioId, convenioId));
    }

    const compsMes = await db
      .select()
      .from(comparacoes)
      .where(and(...compConditions));

    let totalGlosas = 0;
    let valorGlosado = 0;
    const categorias: { [key: string]: number } = {};

    for (const comp of compsMes) {
      const divs = await db
        .select()
        .from(divergencias)
        .where(eq(divergencias.comparacaoId, comp.id));

      for (const div of divs) {
        totalGlosas++;
        valorGlosado += Math.abs(parseFloat(div.diferenca || "0"));

        const categoria = div.categoriaGlosa || div.tipo || "outros";
        categorias[categoria] = (categorias[categoria] || 0) + 1;
      }
    }

    resultado.push({
      mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      ano,
      totalGlosas,
      valorGlosado,
      categorias,
    });
  }

  return resultado.reverse();
}

export async function getResumoGlosa(userId?: number, estabelecimentoId?: number, convenioId?: number) {
  const db = await getDb();
  if (!db) return null;

  // Buscar todas as divergências
  const compConditions: any[] = [];
  if (userId) {
    compConditions.push(eq(comparacoes.userId, userId));
  }
  if (estabelecimentoId) {
    compConditions.push(eq(comparacoes.estabelecimentoId, estabelecimentoId));
  }
  if (convenioId) {
    compConditions.push(eq(comparacoes.convenioId, convenioId));
  }

  const comps = await db
    .select()
    .from(comparacoes)
    .where(compConditions.length > 0 ? and(...compConditions) : undefined);

  let totalDivergencias = 0;
  let valorTotalGlosado = 0;
  const categorias: { [key: string]: { quantidade: number; valor: number } } = {};

  for (const comp of comps) {
    const divs = await db
      .select()
      .from(divergencias)
      .where(eq(divergencias.comparacaoId, comp.id));

    for (const div of divs) {
      totalDivergencias++;
      const diferenca = Math.abs(parseFloat(div.diferenca || "0"));
      valorTotalGlosado += diferenca;

      let categoria = div.categoriaGlosa || "outros";
      if (!div.categoriaGlosa) {
        switch (div.tipo) {
          case "valor":
            categoria = "valor_divergente";
            break;
          case "quantidade":
            categoria = "quantidade_excedente";
            break;
          case "ausente_retorno":
            categoria = "procedimento_nao_autorizado";
            break;
          default:
            categoria = "outros";
        }
      }

      if (!categorias[categoria]) {
        categorias[categoria] = { quantidade: 0, valor: 0 };
      }
      categorias[categoria].quantidade++;
      categorias[categoria].valor += diferenca;
    }
  }

  // Encontrar categoria principal
  const categoriaPrincipal = Object.entries(categorias).sort(
    (a, b) => b[1].quantidade - a[1].quantidade
  )[0];

  return {
    totalDivergencias,
    valorTotalGlosado,
    categoriaPrincipal: categoriaPrincipal
      ? {
          nome: CATEGORIAS_GLOSA_LABELS[categoriaPrincipal[0]] || categoriaPrincipal[0],
          quantidade: categoriaPrincipal[1].quantidade,
          valor: categoriaPrincipal[1].valor,
          percentual: (categoriaPrincipal[1].quantidade / totalDivergencias) * 100,
        }
      : null,
    categorias: Object.entries(categorias).map(([cat, data]) => ({
      categoria: CATEGORIAS_GLOSA_LABELS[cat] || cat,
      quantidade: data.quantidade,
      valor: data.valor,
      percentual: totalDivergencias > 0 ? (data.quantidade / totalDivergencias) * 100 : 0,
    })),
  };
}

// ============ RECURSOS DE GLOSA FUNCTIONS ============

import { recursosGlosa, historicoRecursos, InsertRecursoGlosa, InsertHistoricoRecurso, lotesRecurso } from "../drizzle/schema";

export async function createRecursoGlosa(recurso: InsertRecursoGlosa) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(recursosGlosa).values(recurso);
  const insertId = result[0].insertId;

  // Criar histórico de criação
  await db.insert(historicoRecursos).values({
    recursoId: insertId,
    userId: recurso.userId,
    tipo: "criacao",
    statusNovo: recurso.status || "rascunho",
    descricao: "Recurso criado",
  });

  return insertId;
}

// Verificar se já existe recurso criado para um procedimento
export async function verificarRecursoExistente(procedimentoId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [procedimento] = await db
    .select({ recursoStatus: procedimentos.recursoStatus })
    .from(procedimentos)
    .where(eq(procedimentos.id, procedimentoId))
    .limit(1);

  return procedimento?.recursoStatus !== "sem_recurso" && procedimento?.recursoStatus !== null;
}

// Marcar procedimentos como "recurso criado" em lote
export async function marcarProcedimentosComRecurso(procedimentoIds: number[], recursoId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (procedimentoIds.length === 0) return;

  await db
    .update(procedimentos)
    .set({ 
      recursoStatus: "recurso_criado",
      recursoId: recursoId || null
    })
    .where(inArray(procedimentos.id, procedimentoIds));
}

// Atualizar status de recurso nos procedimentos quando o recurso mudar de status
export async function atualizarStatusRecursoProcedimentos(
  recursoId: number, 
  novoStatus: "recurso_enviado" | "recurso_deferido" | "recurso_indeferido"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(procedimentos)
    .set({ recursoStatus: novoStatus })
    .where(eq(procedimentos.recursoId, recursoId));
}

export async function updateRecursoGlosa(
  id: number,
  userId: number,
  data: Partial<InsertRecursoGlosa>,
  descricaoAlteracao?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar status anterior
  const [recursoAtual] = await db
    .select()
    .from(recursosGlosa)
    .where(eq(recursosGlosa.id, id))
    .limit(1);

  if (!recursoAtual) throw new Error("Recurso não encontrado");

  // Atualizar recurso
  await db.update(recursosGlosa).set(data).where(eq(recursosGlosa.id, id));

  // Registrar histórico se status mudou
  if (data.status && data.status !== recursoAtual.status) {
    await db.insert(historicoRecursos).values({
      recursoId: id,
      userId,
      tipo: "status_alterado",
      statusAnterior: recursoAtual.status,
      statusNovo: data.status,
      descricao: descricaoAlteracao || `Status alterado de ${recursoAtual.status} para ${data.status}`,
    });
  } else if (descricaoAlteracao) {
    await db.insert(historicoRecursos).values({
      recursoId: id,
      userId,
      tipo: "edicao",
      descricao: descricaoAlteracao,
    });
  }
}

export async function getRecursosGlosa(
  userId: number,
  filters?: {
    convenioId?: number;
    status?: string;
    prioridade?: string;
    dataInicio?: Date;
    dataFim?: Date;
    busca?: string;
  },
  page: number = 1,
  limit: number = 20
) {
  const db = await getDb();
  if (!db) return { recursos: [], total: 0 };

  const conditions: any[] = [eq(recursosGlosa.userId, userId)];

  if (filters?.convenioId) {
    conditions.push(eq(recursosGlosa.convenioId, filters.convenioId));
  }
  if (filters?.status) {
    conditions.push(eq(recursosGlosa.status, filters.status as any));
  }
  if (filters?.prioridade) {
    conditions.push(eq(recursosGlosa.prioridade, filters.prioridade as any));
  }
  if (filters?.dataInicio) {
    conditions.push(gte(recursosGlosa.createdAt, filters.dataInicio));
  }
  if (filters?.dataFim) {
    conditions.push(lte(recursosGlosa.createdAt, filters.dataFim));
  }
  if (filters?.busca) {
    conditions.push(
      or(
        like(recursosGlosa.codigoProcedimento, `%${filters.busca}%`),
        like(recursosGlosa.descricaoProcedimento, `%${filters.busca}%`),
        like(recursosGlosa.guiaNumero, `%${filters.busca}%`),
        like(recursosGlosa.pacienteNome, `%${filters.busca}%`),
        like(recursosGlosa.protocoloRecurso, `%${filters.busca}%`)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Contar total
  const allRecursos = await db
    .select()
    .from(recursosGlosa)
    .where(whereClause);

  const total = allRecursos.length;

  // Buscar com paginação
  const recursos = await db
    .select()
    .from(recursosGlosa)
    .where(whereClause)
    .orderBy(desc(recursosGlosa.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // Enriquecer com nome do convênio
  const recursosEnriquecidos = await Promise.all(
    recursos.map(async (r) => {
      const [conv] = await db
        .select()
        .from(convenios)
        .where(eq(convenios.id, r.convenioId))
        .limit(1);
      return {
        ...r,
        convenioNome: conv?.nome || "Desconhecido",
      };
    })
  );

  return { recursos: recursosEnriquecidos, total };
}

export async function getRecursoById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [recurso] = await db
    .select()
    .from(recursosGlosa)
    .where(eq(recursosGlosa.id, id))
    .limit(1);

  if (!recurso) return null;

  // Buscar convênio
  const [conv] = await db
    .select()
    .from(convenios)
    .where(eq(convenios.id, recurso.convenioId))
    .limit(1);

  // Buscar histórico
  const historico = await db
    .select()
    .from(historicoRecursos)
    .where(eq(historicoRecursos.recursoId, id))
    .orderBy(desc(historicoRecursos.createdAt));

  return {
    ...recurso,
    convenioNome: conv?.nome || "Desconhecido",
    historico,
  };
}

/**
 * Buscar recursos para exportação (sem paginação)
 */
export async function getRecursosParaExportacao(
  userId: number,
  filters?: {
    convenioId?: number;
    estabelecimentoId?: number;
    status?: string;
    dataInicio?: Date;
    dataFim?: Date;
    ids?: number[];
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [eq(recursosGlosa.userId, userId)];

  if (filters?.convenioId) {
    conditions.push(eq(recursosGlosa.convenioId, filters.convenioId));
  }
  if (filters?.estabelecimentoId) {
    conditions.push(eq(recursosGlosa.estabelecimentoId, filters.estabelecimentoId));
  }
  if (filters?.status) {
    conditions.push(eq(recursosGlosa.status, filters.status as any));
  }
  if (filters?.dataInicio) {
    conditions.push(gte(recursosGlosa.createdAt, filters.dataInicio));
  }
  if (filters?.dataFim) {
    conditions.push(lte(recursosGlosa.createdAt, filters.dataFim));
  }
  if (filters?.ids && filters.ids.length > 0) {
    conditions.push(inArray(recursosGlosa.id, filters.ids));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const recursos = await db
    .select()
    .from(recursosGlosa)
    .where(whereClause)
    .orderBy(desc(recursosGlosa.createdAt));

  // Enriquecer com nome do convênio e estabelecimento
  const convenioIds = Array.from(new Set(recursos.map(r => r.convenioId)));
  const estabelecimentoIds = Array.from(new Set(recursos.filter(r => r.estabelecimentoId).map(r => r.estabelecimentoId!)));

  const conveniosList = convenioIds.length > 0 
    ? await db.select().from(convenios).where(inArray(convenios.id, convenioIds))
    : [];
  const convenioMap = new Map(conveniosList.map(c => [c.id, c.nome]));

  const estabelecimentosList = estabelecimentoIds.length > 0
    ? await db.select().from(estabelecimentos).where(inArray(estabelecimentos.id, estabelecimentoIds))
    : [];
  const estabelecimentoMap = new Map(estabelecimentosList.map(e => [e.id, e.nome]));

  return recursos.map(r => ({
    ...r,
    convenioNome: convenioMap.get(r.convenioId) || "Desconhecido",
    estabelecimentoNome: r.estabelecimentoId ? estabelecimentoMap.get(r.estabelecimentoId) || "N/A" : "N/A",
  }));
}

export async function deleteRecursoGlosa(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Deletar histórico primeiro
  await db.delete(historicoRecursos).where(eq(historicoRecursos.recursoId, id));
  // Deletar recurso
  await db.delete(recursosGlosa).where(eq(recursosGlosa.id, id));
}

export async function addHistoricoRecurso(historico: InsertHistoricoRecurso) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(historicoRecursos).values(historico);
}

export async function getEstatisticasRecursos(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const recursos = await db
    .select()
    .from(recursosGlosa)
    .where(eq(recursosGlosa.userId, userId));

  const stats = {
    total: recursos.length,
    porStatus: {} as { [key: string]: number },
    valorTotalGlosado: 0,
    valorRecuperado: 0,
    taxaRecuperacao: 0,
    pendentes: 0,
    emAnalise: 0,
    deferidos: 0,
    indeferidos: 0,
  };

  for (const r of recursos) {
    stats.porStatus[r.status] = (stats.porStatus[r.status] || 0) + 1;
    stats.valorTotalGlosado += parseFloat(r.valorGlosado || "0");
    stats.valorRecuperado += parseFloat(r.valorRecuperado || "0");

    if (r.status === "pendente_envio" || r.status === "rascunho") {
      stats.pendentes++;
    } else if (r.status === "enviado" || r.status === "em_analise") {
      stats.emAnalise++;
    } else if (r.status === "deferido" || r.status === "deferido_parcial") {
      stats.deferidos++;
    } else if (r.status === "indeferido") {
      stats.indeferidos++;
    }
  }

  if (stats.valorTotalGlosado > 0) {
    stats.taxaRecuperacao = (stats.valorRecuperado / stats.valorTotalGlosado) * 100;
  }

  return stats;
}


// ============ CONCILIAÇÃO AUTOMÁTICA FUNCTIONS ============

export interface ItemConciliacao {
  guiaNumero: string;
  numeroLote: string;
  dataExecucao: string;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  status: "ok" | "divergente" | "glosado" | "nao_encontrado" | "nao_recebido";
}

export interface ResumoConciliacao {
  convenioId: number;
  convenioNome: string;
  totalEnviados: number;
  totalRetornados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalGlosados: number;
  totalNaoRecebidos: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalGlosado: number;
  valorTotalNaoRecebido: number;
  percentualGlosa: number;
}

export async function getConciliacaoPorConvenio(filters: {
  convenioId: number;
  userId: number;
  estabelecimentoId?: number;
  dataInicio?: Date;
  dataFim?: Date;
  mesReferencia?: number; // 1-12
  anoReferencia?: number; // ex: 2025
  pagina?: number;
  itensPorPagina?: number;
}): Promise<{ itens: ItemConciliacao[]; resumo: ResumoConciliacao | null; total: number }> {
  const db = await getDb();
  if (!db) return { itens: [], resumo: null, total: 0 };

  // Buscar convênio
  const [convenio] = await db
    .select()
    .from(convenios)
    .where(eq(convenios.id, filters.convenioId))
    .limit(1);

  if (!convenio) return { itens: [], resumo: null, total: 0 };

  // Buscar regras de conciliação configuradas para este convênio
  const regra = await getRegraConciliacaoPorConvenio(filters.convenioId);

  // Buscar arquivos enviados (XMLs)
  const arquivosEnviadosConditions: any[] = [
    eq(arquivos.convenioId, filters.convenioId),
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];
  
  // Filtrar por estabelecimento se informado
  if (filters.estabelecimentoId) {
    arquivosEnviadosConditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  if (filters.dataInicio) {
    arquivosEnviadosConditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters.dataFim) {
    arquivosEnviadosConditions.push(lte(arquivos.createdAt, filters.dataFim));
  }
  // Filtrar por mês/ano de referência do arquivo (informado no upload)
  if (filters.mesReferencia && filters.anoReferencia) {
    arquivosEnviadosConditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia} AND YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters.anoReferencia) {
    arquivosEnviadosConditions.push(
      sql`YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters.mesReferencia) {
    arquivosEnviadosConditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia}`
    );
  }

  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosEnviadosConditions));

  // Buscar arquivos retornados (Excel)
  const arquivosRetornadosConditions: any[] = [
    eq(arquivos.convenioId, filters.convenioId),
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];
  
  // Filtrar por estabelecimento se informado
  if (filters.estabelecimentoId) {
    arquivosRetornadosConditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  if (filters.dataInicio) {
    arquivosRetornadosConditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters.dataFim) {
    arquivosRetornadosConditions.push(lte(arquivos.createdAt, filters.dataFim));
  }
  // Filtrar por mês/ano de referência do arquivo (informado no upload)
  if (filters.mesReferencia && filters.anoReferencia) {
    arquivosRetornadosConditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia} AND YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters.anoReferencia) {
    arquivosRetornadosConditions.push(
      sql`YEAR(${arquivos.dataReferencia}) = ${filters.anoReferencia}`
    );
  } else if (filters.mesReferencia) {
    arquivosRetornadosConditions.push(
      sql`MONTH(${arquivos.dataReferencia}) = ${filters.mesReferencia}`
    );
  }

  const arquivosRetornados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosRetornadosConditions));

  // Buscar procedimentos enviados - OTIMIZADO: query única com IN
  const arquivosEnviadosIds = arquivosEnviados.map(a => a.id);
  const procedimentosEnviados = arquivosEnviadosIds.length > 0 
    ? await db
        .select()
        .from(procedimentos)
        .where(inArray(procedimentos.arquivoId, arquivosEnviadosIds))
    : [];

  // Buscar procedimentos retornados - OTIMIZADO: query única com IN
  const arquivosRetornadosIds = arquivosRetornados.map(a => a.id);
  const procedimentosRetornados = arquivosRetornadosIds.length > 0
    ? await db
        .select()
        .from(procedimentos)
        .where(inArray(procedimentos.arquivoId, arquivosRetornadosIds))
    : [];

  // Criar mapa de procedimentos retornados por chave composta
  // Chave: GUIA + LOTE + CÓDIGO + QUANTIDADE + DATA
  const retornadosMap = new Map<string, any[]>();
  
  // Função para gerar chave composta
  const gerarChaveComposta = (proc: any): string => {
    const guia = (proc.guiaNumero || "").toString().toLowerCase().trim();
    const lote = (proc.numeroLote || "").toString().toLowerCase().trim();
    const codigo = (proc.codigo || "").toString().toLowerCase().trim();
    const quantidade = (proc.quantidade || 1).toString();
    // Normalizar data para formato YYYY-MM-DD
    let dataStr = "";
    if (proc.dataExecucao) {
      const data = new Date(proc.dataExecucao);
      if (!isNaN(data.getTime())) {
        dataStr = data.toISOString().split('T')[0];
      }
    }
    return `${guia}|${lote}|${codigo}|${quantidade}|${dataStr}`;
  };
  
  // Função para gerar chave simplificada (fallback sem lote e data)
  const gerarChaveSimplificada = (proc: any): string => {
    const guia = (proc.guiaNumero || "").toString().toLowerCase().trim();
    const codigo = (proc.codigo || "").toString().toLowerCase().trim();
    const quantidade = (proc.quantidade || 1).toString();
    return `${guia}|${codigo}|${quantidade}`;
  };
  
  // Mapa adicional para busca simplificada (fallback) - OTIMIZAÇÃO: evita iteração O(n²)
  const retornadosMapSimplificado = new Map<string, any[]>();
  
  for (const proc of procedimentosRetornados) {
    const chave = gerarChaveComposta(proc);
    const chaveSimples = gerarChaveSimplificada(proc);
    
    if (!retornadosMap.has(chave)) {
      retornadosMap.set(chave, []);
    }
    retornadosMap.get(chave)!.push(proc);
    
    // Também indexar pela chave simplificada
    if (!retornadosMapSimplificado.has(chaveSimples)) {
      retornadosMapSimplificado.set(chaveSimples, []);
    }
    retornadosMapSimplificado.get(chaveSimples)!.push(proc);
  }

  // Processar conciliação
  const itensConciliados: ItemConciliacao[] = [];
  const chavesProcessadas = new Set<string>();

  let totalEnviados = 0;
  let totalConciliados = 0;
  let totalDivergentes = 0;
  let totalGlosados = 0;
  let totalNaoRecebidos = 0;
  let valorTotalFaturado = 0;
  let valorTotalPago = 0;
  let valorTotalGlosado = 0;
  let valorTotalNaoRecebido = 0;

  for (const env of procedimentosEnviados) {
    // Usar chave composta para buscar correspondência exata
    const chaveComposta = gerarChaveComposta(env);
    const chaveSimplificada = gerarChaveSimplificada(env);
    
    // Primeiro tenta buscar pela chave composta (mais precisa)
    let retornados = retornadosMap.get(chaveComposta) || [];
    let chaveUsada = chaveComposta;
    
    // Se não encontrou, tenta pela chave simplificada (fallback) - OTIMIZADO: lookup O(1)
    if (retornados.length === 0) {
      const procsSimplificados = retornadosMapSimplificado.get(chaveSimplificada) || [];
      if (procsSimplificados.length > 0) {
        // Encontrou correspondência - verificar se os valores batem
        const valorEnv = parseFloat(env.valorTotal || "0");
        for (const proc of procsSimplificados) {
          const valorRet = parseFloat(proc.valorTotal || "0");
          if (Math.abs(valorEnv - valorRet) < 0.01) {
            retornados = [proc];
            chaveUsada = gerarChaveComposta(proc);
            break;
          }
        }
        // Se não encontrou por valor, pega o primeiro
        if (retornados.length === 0 && procsSimplificados.length > 0) {
          retornados = [procsSimplificados[0]];
          chaveUsada = gerarChaveComposta(procsSimplificados[0]);
        }
      }
    }
    
    chavesProcessadas.add(chaveUsada);
    totalEnviados++;

    const valorEnviado = parseFloat(env.valorTotal || "0");
    valorTotalFaturado += valorEnviado;

    if (retornados.length === 0) {
      // Não encontrado no retorno - usar regra configurada ou fallback para Bradesco
      const comportamento = regra?.itensNaoEncontrados || 
        (convenio.nome.toLowerCase().includes("bradesco") ? "pago" : "glosado");
      
      if (comportamento === "pago") {
        // Itens não encontrados são considerados pagos
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          numeroLote: env.numeroLote || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: valorEnviado,
          valorGlosado: 0,
          motivoGlosa: "",
          status: "ok",
        });
        totalConciliados++;
        valorTotalPago += valorEnviado;
      } else if (comportamento === "divergente") {
        // Marcar para análise manual
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          numeroLote: env.numeroLote || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: 0,
          valorGlosado: 0,
          motivoGlosa: "Procedimento não encontrado - requer análise",
          status: "divergente",
        });
        totalDivergentes++;
      } else {
        // Não recebido (padrão) - NÃO é glosa, apenas não foi processado ainda
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          numeroLote: env.numeroLote || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: 0,
          valorGlosado: 0,
          motivoGlosa: "Aguardando retorno do convênio",
          status: "nao_recebido",
        });
        totalNaoRecebidos++;
        valorTotalNaoRecebido += valorEnviado;
      }
    } else {
      // Encontrado - comparar valores
      const ret = retornados[0];
      const valorRetornado = parseFloat(ret.valorTotal || "0");
      
      // Extrair motivo de glosa e valor glosado do dadosExtras se existir
      let motivoGlosa = "";
      let valorGlosadoExplicito = 0;
      if (ret.dadosExtras) {
        const extras = typeof ret.dadosExtras === "string" 
          ? JSON.parse(ret.dadosExtras) 
          : ret.dadosExtras;
        motivoGlosa = extras.motivoGlosa || extras.observacao || extras.glosa || "";
        valorGlosadoExplicito = parseFloat(extras.valorGlosado || "0") || 0;
      }
      
      // Verificar se o convênio é Bradesco ou similar (retorno só lista glosas)
      const isBradescoStyle = convenio.nome.toLowerCase().includes("bradesco") || 
                              regra?.formatoRetorno === "excel_glosas";
      
      // Para Bradesco: se item aparece no XML com valorGlosado > 0 = glosado, senão = pago
      // Para outros: comparar valores normalmente
      if (isBradescoStyle && valorGlosadoExplicito > 0) {
        // Item com glosa explícita no retorno
        const valorPago = valorEnviado - valorGlosadoExplicito;
        valorTotalPago += valorPago;
        valorTotalGlosado += valorGlosadoExplicito;
        
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          numeroLote: env.numeroLote || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: valorPago,
          valorGlosado: valorGlosadoExplicito,
          motivoGlosa: motivoGlosa || "Glosa identificada no retorno",
          status: "glosado",
        });
        totalGlosados++;
      } else if (isBradescoStyle && valorGlosadoExplicito === 0) {
        // Item aparece no retorno sem glosa = pago integralmente
        valorTotalPago += valorEnviado;
        
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          numeroLote: env.numeroLote || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: valorEnviado,
          valorGlosado: 0,
          motivoGlosa: "",
          status: "ok",
        });
        totalConciliados++;
      } else {
        // Lógica padrão: comparar valores
        const diferenca = valorEnviado - valorRetornado;
        valorTotalPago += valorRetornado;

        if (Math.abs(diferenca) < 0.01) {
          // Valores iguais - OK
          itensConciliados.push({
            guiaNumero: env.guiaNumero || "",
            numeroLote: env.numeroLote || "",
            dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
            codigo: env.codigo,
            descricao: env.descricao || "",
            pacienteNome: env.pacienteNome || "",
            valorFaturado: valorEnviado,
            valorPago: valorRetornado,
            valorGlosado: 0,
            motivoGlosa: "",
            status: "ok",
          });
          totalConciliados++;
        } else if (diferenca > 0) {
          // Glosa parcial
          itensConciliados.push({
            guiaNumero: env.guiaNumero || "",
            numeroLote: env.numeroLote || "",
            dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
            codigo: env.codigo,
            descricao: env.descricao || "",
            pacienteNome: env.pacienteNome || "",
            valorFaturado: valorEnviado,
            valorPago: valorRetornado,
            valorGlosado: diferenca,
            motivoGlosa: motivoGlosa || "Valor divergente",
            status: "glosado",
          });
          totalGlosados++;
          valorTotalGlosado += diferenca;
        } else {
          // Valor retornado maior que enviado (divergência)
          itensConciliados.push({
            guiaNumero: env.guiaNumero || "",
            numeroLote: env.numeroLote || "",
            dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
            codigo: env.codigo,
            descricao: env.descricao || "",
            pacienteNome: env.pacienteNome || "",
            valorFaturado: valorEnviado,
            valorPago: valorRetornado,
            valorGlosado: 0,
            motivoGlosa: motivoGlosa || "",
            status: "divergente",
          });
          totalDivergentes++;
        }
      }
    }
  }

  // Adicionar itens extras do retorno (não enviados)
  for (const [chave, itens] of Array.from(retornadosMap.entries())) {
    if (!chavesProcessadas.has(chave)) {
      for (const ret of itens) {
        const valorRetornado = parseFloat(ret.valorTotal || "0");
        valorTotalPago += valorRetornado;
        
        itensConciliados.push({
          guiaNumero: ret.guiaNumero || "",
          numeroLote: ret.numeroLote || "",
          dataExecucao: ret.dataExecucao ? new Date(ret.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: ret.codigo,
          descricao: ret.descricao || "",
          pacienteNome: ret.pacienteNome || "",
          valorFaturado: 0,
          valorPago: valorRetornado,
          valorGlosado: 0,
          motivoGlosa: "Procedimento extra no retorno",
          status: "divergente",
        });
        totalDivergentes++;
      }
    }
  }

  // Ordenar por guia e data
  itensConciliados.sort((a, b) => {
    if (a.guiaNumero !== b.guiaNumero) {
      return a.guiaNumero.localeCompare(b.guiaNumero);
    }
    return a.dataExecucao.localeCompare(b.dataExecucao);
  });

  const resumo: ResumoConciliacao = {
    convenioId: convenio.id,
    convenioNome: convenio.nome,
    totalEnviados,
    totalRetornados: procedimentosRetornados.length,
    totalConciliados,
    totalDivergentes,
    totalGlosados,
    totalNaoRecebidos,
    valorTotalFaturado,
    valorTotalPago,
    valorTotalGlosado,
    valorTotalNaoRecebido,
    percentualGlosa: valorTotalFaturado > 0 ? (valorTotalGlosado / valorTotalFaturado) * 100 : 0,
  };

  // Aplicar paginação
  const total = itensConciliados.length;
  const pagina = filters.pagina || 1;
  const itensPorPagina = filters.itensPorPagina || 100;
  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const itensPaginados = itensConciliados.slice(inicio, fim);

  return { itens: itensPaginados, resumo, total };
}

// Interface para conta agrupada na conciliação
export interface ContaConciliacao {
  guiaNumero: string;
  numeroLote: string;
  pacienteNome: string;
  dataExecucao: string;
  valorTotalFaturado: number;
  valorTotalRecebido: number;
  valorTotalGlosado: number;
  status: "ok" | "glosado" | "nao_encontrado" | "parcial";
  totalItens: number;
  itens: ItemConciliacao[];
}

// Função para agrupar conciliação por conta
export async function getConciliacaoAgrupadaPorConta(filters: {
  convenioId: number;
  userId: number;
  estabelecimentoId?: number;
  mesReferencia?: number;
  anoReferencia?: number;
  pagina?: number;
  itensPorPagina?: number;
}): Promise<{ contas: ContaConciliacao[]; resumo: ResumoConciliacao | null; total: number }> {
  // Buscar todos os itens da conciliação
  const resultado = await getConciliacaoPorConvenio({
    ...filters,
    pagina: 1,
    itensPorPagina: 50000, // Buscar todos para agrupar
  });

  // Se não houver resumo, retornar vazio
  if (!resultado.resumo) {
    return { contas: [], resumo: null, total: 0 };
  }

  // Agrupar por guia (conta)
  const contasMap = new Map<string, ContaConciliacao>();

  for (const item of resultado.itens) {
    const chave = item.guiaNumero || "SEM_GUIA";
    
    if (!contasMap.has(chave)) {
      contasMap.set(chave, {
        guiaNumero: item.guiaNumero,
        numeroLote: item.numeroLote,
        pacienteNome: item.pacienteNome,
        dataExecucao: item.dataExecucao,
        valorTotalFaturado: 0,
        valorTotalRecebido: 0,
        valorTotalGlosado: 0,
        status: "ok",
        totalItens: 0,
        itens: [],
      });
    }

    const conta = contasMap.get(chave)!;
    conta.valorTotalFaturado += item.valorFaturado;
    conta.valorTotalRecebido += item.valorPago;
    conta.valorTotalGlosado += item.valorGlosado;
    conta.totalItens++;
    conta.itens.push(item);

    // Atualizar status da conta
    if (item.status === "nao_recebido") {
      if (conta.status === "ok") {
        conta.status = "nao_encontrado";
      }
    } else if (item.status === "glosado") {
      if (conta.status === "ok" || conta.status === "nao_encontrado") {
        conta.status = "glosado";
      }
    } else if (item.status === "divergente") {
      if (conta.status === "ok") {
        conta.status = "parcial";
      }
    }
  }

  // Converter para array e ordenar
  const contasArray = Array.from(contasMap.values());
  contasArray.sort((a, b) => {
    // Ordenar por status (glosado primeiro, depois não encontrado, depois ok)
    const statusOrder = { glosado: 0, nao_encontrado: 1, parcial: 2, ok: 3 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return a.guiaNumero.localeCompare(b.guiaNumero);
  });

  // Aplicar paginação
  const total = contasArray.length;
  const pagina = filters.pagina || 1;
  const itensPorPagina = filters.itensPorPagina || 50;
  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const contasPaginadas = contasArray.slice(inicio, fim);

  return { contas: contasPaginadas, resumo: resultado.resumo, total };
}

// Função para buscar itens não recebidos (pendentes de pagamento)
export async function getItensNaoRecebidos(filters: {
  convenioId?: number;
  userId: number;
  estabelecimentoId?: number;
  mesReferencia?: number;
  anoReferencia?: number;
  pagina?: number;
  itensPorPagina?: number;
}): Promise<{ itens: ItemConciliacao[]; resumo: { totalItens: number; valorTotal: number; porConvenio: { convenioId: number; convenioNome: string; totalItens: number; valorTotal: number }[] }; total: number }> {
  const db = await getDb();
  if (!db) return { itens: [], resumo: { totalItens: 0, valorTotal: 0, porConvenio: [] }, total: 0 };

  // Buscar todos os convênios do usuário
  const conveniosConditions: any[] = [];
  if (filters.convenioId) {
    conveniosConditions.push(eq(convenios.id, filters.convenioId));
  }
  
  const listaConvenios = await db.select().from(convenios).where(conveniosConditions.length > 0 ? and(...conveniosConditions) : undefined);
  
  const todosItensNaoRecebidos: ItemConciliacao[] = [];
  const porConvenio: { convenioId: number; convenioNome: string; totalItens: number; valorTotal: number }[] = [];
  
  for (const convenio of listaConvenios) {
    // Buscar conciliação para cada convênio
    const resultado = await getConciliacaoPorConvenio({
      convenioId: convenio.id,
      userId: filters.userId,
      estabelecimentoId: filters.estabelecimentoId,
      mesReferencia: filters.mesReferencia,
      anoReferencia: filters.anoReferencia,
      pagina: 1,
      itensPorPagina: 10000, // Buscar todos para filtrar
    });
    
    // Filtrar apenas itens não recebidos
    const itensNaoRecebidos = resultado.itens.filter(item => item.status === "nao_recebido");
    
    if (itensNaoRecebidos.length > 0) {
      const valorTotalConvenio = itensNaoRecebidos.reduce((acc, item) => acc + item.valorFaturado, 0);
      porConvenio.push({
        convenioId: convenio.id,
        convenioNome: convenio.nome,
        totalItens: itensNaoRecebidos.length,
        valorTotal: valorTotalConvenio,
      });
      todosItensNaoRecebidos.push(...itensNaoRecebidos);
    }
  }
  
  // Ordenar por valor faturado (maior primeiro)
  todosItensNaoRecebidos.sort((a, b) => b.valorFaturado - a.valorFaturado);
  
  // Calcular totais
  const totalItens = todosItensNaoRecebidos.length;
  const valorTotal = todosItensNaoRecebidos.reduce((acc, item) => acc + item.valorFaturado, 0);
  
  // Aplicar paginação
  const pagina = filters.pagina || 1;
  const itensPorPagina = filters.itensPorPagina || 50;
  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const itensPaginados = todosItensNaoRecebidos.slice(inicio, fim);
  
  return {
    itens: itensPaginados,
    resumo: {
      totalItens,
      valorTotal,
      porConvenio,
    },
    total: totalItens,
  };
}

export async function getResumoConciliacao(filters: {
  convenioId?: number;
  userId: number;
  estabelecimentoId?: number;
}): Promise<ResumoConciliacao[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar convênios
  let convList;
  if (filters.convenioId) {
    convList = await db
      .select()
      .from(convenios)
      .where(eq(convenios.id, filters.convenioId));
  } else {
    convList = await db
      .select()
      .from(convenios)
      .where(eq(convenios.ativo, "sim"));
  }

  const resultado: ResumoConciliacao[] = [];

  for (const conv of convList) {
    const { resumo } = await getConciliacaoPorConvenio({
      convenioId: conv.id,
      userId: filters.userId,
      estabelecimentoId: filters.estabelecimentoId,
    });

    if (resumo && (resumo.totalEnviados > 0 || resumo.totalRetornados > 0)) {
      resultado.push(resumo);
    }
  }

  return resultado.sort((a, b) => b.valorTotalFaturado - a.valorTotalFaturado);
}


// ============ TENDÊNCIAS DE GLOSA FUNCTIONS ============

export interface TendenciaMensal {
  mes: string;
  ano: number;
  mesAno: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  percentualGlosa: number;
  quantidadeEnviados: number;
  quantidadeGlosados: number;
}

export interface TendenciaConvenio {
  convenioId: number;
  convenioNome: string;
  tendencias: TendenciaMensal[];
  totalFaturado: number;
  totalGlosado: number;
  mediaPercentualGlosa: number;
  tendenciaGlosa: "aumentando" | "diminuindo" | "estavel";
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export async function getTendenciasGlosa(filters: {
  userId: number;
  convenioId?: number;
  estabelecimentoId?: number;
  meses?: number;
}): Promise<TendenciaConvenio[]> {
  const db = await getDb();
  if (!db) return [];

  const numMeses = filters.meses || 6;
  const dataLimite = new Date();
  dataLimite.setMonth(dataLimite.getMonth() - numMeses);

  // Buscar convênios
  let convList;
  if (filters.convenioId) {
    convList = await db
      .select()
      .from(convenios)
      .where(eq(convenios.id, filters.convenioId));
  } else {
    convList = await db
      .select()
      .from(convenios)
      .where(eq(convenios.ativo, "sim"));
  }

  const resultado: TendenciaConvenio[] = [];

  for (const conv of convList) {
    // Condições base para arquivos enviados
    const condEnviados: any[] = [
      eq(arquivos.convenioId, conv.id),
      eq(arquivos.direcao, "enviado"),
      eq(arquivos.status, "processado"),
      gte(arquivos.createdAt, dataLimite)
    ];
    if (filters.estabelecimentoId) {
      condEnviados.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
    }

    // Buscar arquivos enviados do convênio nos últimos X meses
    const arquivosEnviados = await db
      .select()
      .from(arquivos)
      .where(and(...condEnviados));

    // Condições base para arquivos retornados
    const condRetornados: any[] = [
      eq(arquivos.convenioId, conv.id),
      eq(arquivos.direcao, "retornado"),
      eq(arquivos.status, "processado"),
      gte(arquivos.createdAt, dataLimite)
    ];
    if (filters.estabelecimentoId) {
      condRetornados.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
    }

    // Buscar arquivos retornados do convênio nos últimos X meses
    const arquivosRetornados = await db
      .select()
      .from(arquivos)
      .where(and(...condRetornados));

    // Agrupar procedimentos por mês
    const dadosPorMes: { [key: string]: TendenciaMensal } = {};

    // Inicializar os últimos X meses
    for (let i = 0; i < numMeses; i++) {
      const data = new Date();
      data.setMonth(data.getMonth() - i);
      const mes = data.getMonth();
      const ano = data.getFullYear();
      const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;
      
      dadosPorMes[chave] = {
        mes: MESES_PT[mes],
        ano,
        mesAno: `${MESES_PT[mes].substring(0, 3)}/${ano}`,
        valorFaturado: 0,
        valorPago: 0,
        valorGlosado: 0,
        percentualGlosa: 0,
        quantidadeEnviados: 0,
        quantidadeGlosados: 0,
      };
    }

    // Processar procedimentos enviados
    for (const arq of arquivosEnviados) {
      const procs = await db
        .select()
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      for (const proc of procs) {
        const dataProc = proc.dataExecucao || arq.createdAt;
        if (!dataProc) continue;

        const data = new Date(dataProc);
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;

        if (dadosPorMes[chave]) {
          dadosPorMes[chave].valorFaturado += parseFloat(proc.valorTotal || "0");
          dadosPorMes[chave].quantidadeEnviados++;
        }
      }
    }

    // Processar procedimentos retornados
    for (const arq of arquivosRetornados) {
      const procs = await db
        .select()
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      for (const proc of procs) {
        const dataProc = proc.dataExecucao || arq.createdAt;
        if (!dataProc) continue;

        const data = new Date(dataProc);
        const mes = data.getMonth();
        const ano = data.getFullYear();
        const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;

        if (dadosPorMes[chave]) {
          dadosPorMes[chave].valorPago += parseFloat(proc.valorTotal || "0");
        }
      }
    }

    // Calcular glosas e percentuais
    let totalFaturado = 0;
    let totalGlosado = 0;
    const tendencias: TendenciaMensal[] = [];

    for (const chave of Object.keys(dadosPorMes).sort()) {
      const dados = dadosPorMes[chave];
      
      // Calcular glosa como diferença entre faturado e pago
      dados.valorGlosado = Math.max(0, dados.valorFaturado - dados.valorPago);
      dados.percentualGlosa = dados.valorFaturado > 0 
        ? (dados.valorGlosado / dados.valorFaturado) * 100 
        : 0;
      dados.quantidadeGlosados = dados.valorGlosado > 0 ? 1 : 0;

      totalFaturado += dados.valorFaturado;
      totalGlosado += dados.valorGlosado;

      tendencias.push(dados);
    }

    // Determinar tendência (comparando últimos 3 meses com 3 meses anteriores)
    let tendenciaGlosa: "aumentando" | "diminuindo" | "estavel" = "estavel";
    if (tendencias.length >= 4) {
      const metade = Math.floor(tendencias.length / 2);
      const primeiraParte = tendencias.slice(0, metade);
      const segundaParte = tendencias.slice(metade);

      const mediaPrimeira = primeiraParte.reduce((acc, t) => acc + t.percentualGlosa, 0) / primeiraParte.length;
      const mediaSegunda = segundaParte.reduce((acc, t) => acc + t.percentualGlosa, 0) / segundaParte.length;

      if (mediaSegunda > mediaPrimeira * 1.1) {
        tendenciaGlosa = "aumentando";
      } else if (mediaSegunda < mediaPrimeira * 0.9) {
        tendenciaGlosa = "diminuindo";
      }
    }

    // Só adicionar se tiver dados
    if (totalFaturado > 0 || totalGlosado > 0) {
      resultado.push({
        convenioId: conv.id,
        convenioNome: conv.nome,
        tendencias,
        totalFaturado,
        totalGlosado,
        mediaPercentualGlosa: totalFaturado > 0 ? (totalGlosado / totalFaturado) * 100 : 0,
        tendenciaGlosa,
      });
    }
  }

  return resultado.sort((a, b) => b.totalGlosado - a.totalGlosado);
}

export async function getTendenciaGeral(filters: {
  userId: number;
  estabelecimentoId?: number;
  meses?: number;
}): Promise<TendenciaMensal[]> {
  const db = await getDb();
  if (!db) return [];

  const numMeses = filters.meses || 6;
  const dataLimite = new Date();
  dataLimite.setMonth(dataLimite.getMonth() - numMeses);

  // Inicializar os últimos X meses
  const dadosPorMes: { [key: string]: TendenciaMensal } = {};
  for (let i = 0; i < numMeses; i++) {
    const data = new Date();
    data.setMonth(data.getMonth() - i);
    const mes = data.getMonth();
    const ano = data.getFullYear();
    const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    
    dadosPorMes[chave] = {
      mes: MESES_PT[mes],
      ano,
      mesAno: `${MESES_PT[mes].substring(0, 3)}/${ano}`,
      valorFaturado: 0,
      valorPago: 0,
      valorGlosado: 0,
      percentualGlosa: 0,
      quantidadeEnviados: 0,
      quantidadeGlosados: 0,
    };
  }

  // Condições base para arquivos enviados
  const condEnviados: any[] = [
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
    gte(arquivos.createdAt, dataLimite)
  ];
  if (filters.estabelecimentoId) {
    condEnviados.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  // Buscar todos os arquivos enviados nos últimos X meses
  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...condEnviados));

  // Condições base para arquivos retornados
  const condRetornados: any[] = [
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
    gte(arquivos.createdAt, dataLimite)
  ];
  if (filters.estabelecimentoId) {
    condRetornados.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  // Buscar todos os arquivos retornados nos últimos X meses
  const arquivosRetornados = await db
    .select()
    .from(arquivos)
    .where(and(...condRetornados));

  // Processar procedimentos enviados
  for (const arq of arquivosEnviados) {
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));

    for (const proc of procs) {
      const dataProc = proc.dataExecucao || arq.createdAt;
      if (!dataProc) continue;

      const data = new Date(dataProc);
      const mes = data.getMonth();
      const ano = data.getFullYear();
      const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;

      if (dadosPorMes[chave]) {
        dadosPorMes[chave].valorFaturado += parseFloat(proc.valorTotal || "0");
        dadosPorMes[chave].quantidadeEnviados++;
      }
    }
  }

  // Processar procedimentos retornados
  for (const arq of arquivosRetornados) {
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));

    for (const proc of procs) {
      const dataProc = proc.dataExecucao || arq.createdAt;
      if (!dataProc) continue;

      const data = new Date(dataProc);
      const mes = data.getMonth();
      const ano = data.getFullYear();
      const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;

      if (dadosPorMes[chave]) {
        dadosPorMes[chave].valorPago += parseFloat(proc.valorTotal || "0");
      }
    }
  }

  // Calcular glosas e percentuais
  const tendencias: TendenciaMensal[] = [];
  for (const chave of Object.keys(dadosPorMes).sort()) {
    const dados = dadosPorMes[chave];
    dados.valorGlosado = Math.max(0, dados.valorFaturado - dados.valorPago);
    dados.percentualGlosa = dados.valorFaturado > 0 
      ? (dados.valorGlosado / dados.valorFaturado) * 100 
      : 0;
    tendencias.push(dados);
  }

  return tendencias;
}

// ============ REPASSE MÉDICO ============
export interface RepasseItem {
  id: number;
  guiaNumero: string;
  dataExecucao: Date | null;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  nomeMedico: string;
  crmMedico: string;
  convenioNome: string;
  valorFaturado: string;
  valorPago: string;
  valorGlosado: string;
}

export async function getRepasseData(filters: {
  userId: number;
  convenioId?: number;
  estabelecimentoId?: number;
  dataInicio?: Date;
  dataFim?: Date;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: RepasseItem[]; total: number; resumo: any }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0, resumo: null };

  // Buscar arquivos enviados do usuário
  const arquivosConditions: any[] = [
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];

  if (filters.estabelecimentoId) {
    arquivosConditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  if (filters.convenioId) {
    arquivosConditions.push(eq(arquivos.convenioId, filters.convenioId));
  }

  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosConditions));

  if (arquivosEnviados.length === 0) {
    return { items: [], total: 0, resumo: null };
  }

  const arquivoIds = arquivosEnviados.map(a => a.id);

  // Buscar procedimentos enviados
  const procConditions: any[] = [
    inArray(procedimentos.arquivoId, arquivoIds),
  ];

  if (filters.dataInicio) {
    procConditions.push(gte(procedimentos.dataExecucao, filters.dataInicio));
  }
  if (filters.dataFim) {
    procConditions.push(lte(procedimentos.dataExecucao, filters.dataFim));
  }

  // Adicionar filtro de busca
  if (filters.search) {
    procConditions.push(
      or(
        like(procedimentos.codigo, `%${filters.search}%`),
        like(procedimentos.descricao, `%${filters.search}%`),
        like(procedimentos.guiaNumero, `%${filters.search}%`),
        like(procedimentos.pacienteNome, `%${filters.search}%`),
        like(procedimentos.nomeMedico, `%${filters.search}%`)
      )
    );
  }

  // Buscar TODOS os procedimentos para calcular resumo
  const allProcsEnviados = await db
    .select()
    .from(procedimentos)
    .where(and(...procConditions))
    .orderBy(desc(procedimentos.dataExecucao));

  // Buscar arquivos retornados para comparar
  const arquivosRetornadosConditions = [
    eq(arquivos.userId, filters.userId),
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];

  if (filters.convenioId) {
    arquivosRetornadosConditions.push(eq(arquivos.convenioId, filters.convenioId));
  }

  const arquivosRetornados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosRetornadosConditions));

  // Criar mapa de procedimentos retornados
  const retornadosMap = new Map<string, any>();
  
  for (const arq of arquivosRetornados) {
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));
    
    for (const proc of procs) {
      const chave = `${proc.codigo}|${proc.guiaNumero || ""}`.toLowerCase();
      if (!retornadosMap.has(chave)) {
        retornadosMap.set(chave, proc);
      }
    }
  }

  // Buscar convênios para nomes
  const convList = await db.select().from(convenios);
  const convMap = new Map(convList.map(c => [c.id, c.nome]));

  // Mapear arquivo para convênio
  const arquivoConvenioMap = new Map(arquivosEnviados.map(a => [a.id, a.convenioId]));

  // Processar itens de repasse
  const items: RepasseItem[] = allProcsEnviados.map((proc: any) => {
    const chave = `${proc.codigo}|${proc.guiaNumero || ""}`.toLowerCase();
    const retornado = retornadosMap.get(chave);
    
    const valorFaturado = parseFloat(proc.valorTotal || "0");
    let valorPago = 0;
    let valorGlosado = 0;

    if (retornado) {
      valorPago = parseFloat(retornado.valorTotal || "0");
      
      // Verificar se há valor glosado nos dados extras
      if (retornado.dadosExtras) {
        const extras = typeof retornado.dadosExtras === "string" 
          ? JSON.parse(retornado.dadosExtras) 
          : retornado.dadosExtras;
        valorGlosado = parseFloat(extras.valorGlosado || "0");
        if (valorGlosado > 0) {
          valorPago = valorFaturado - valorGlosado;
        }
      }
    } else {
      // Não encontrado no retorno - considerar glosado
      valorGlosado = valorFaturado;
    }

    const convenioId = arquivoConvenioMap.get(proc.arquivoId);

    return {
      id: proc.id,
      guiaNumero: proc.guiaNumero || "",
      dataExecucao: proc.dataExecucao,
      codigo: proc.codigo,
      descricao: proc.descricao || "",
      pacienteNome: proc.pacienteNome || "",
      nomeMedico: proc.nomeMedico || "",
      crmMedico: proc.crmMedico || "",
      convenioNome: convenioId ? convMap.get(convenioId) || "" : "",
      valorFaturado: valorFaturado.toFixed(2),
      valorPago: valorPago.toFixed(2),
      valorGlosado: valorGlosado.toFixed(2),
    };
  });

  // Calcular resumo de todos os itens
  let totalFaturado = 0;
  let totalPago = 0;
  let totalGlosado = 0;
  const medicos = new Set<string>();

  for (const item of items) {
    totalFaturado += parseFloat(item.valorFaturado);
    totalPago += parseFloat(item.valorPago);
    totalGlosado += parseFloat(item.valorGlosado);
    if (item.nomeMedico) medicos.add(item.nomeMedico);
  }

  const resumo = {
    totalFaturado,
    totalPago,
    totalGlosado,
    totalItens: items.length,
    totalMedicos: medicos.size,
  };

  // Aplicar paginação
  const offset = (filters.page - 1) * filters.pageSize;
  const paginatedItems = items.slice(offset, offset + filters.pageSize);

  return { items: paginatedItems, total: items.length, resumo };
}


// ============ HISTÓRICO DE CONTESTAÇÕES E IA ============

import { invokeLLM } from "./_core/llm";
import { 
  obterInfoGlosa, 
  obterArgumentoContestacao, 
  obterAcoesRecomendadas,
  obterDocumentosSugeridos,
  traduzirCodigoGlosa
} from "../shared/glossaryGlosas";
import type { SQL } from "drizzle-orm";

export async function registrarHistoricoContestacao(data: {
  recursoId?: number;
  convenioId: number;
  userId: number;
  codigoGlosa: string;
  descricaoGlosa?: string;
  codigoProcedimento?: string;
  descricaoProcedimento?: string;
  valorGlosado?: string;
  valorRecuperado?: string;
  argumentoUtilizado: string;
  argumentoOrigem: "dicionario" | "ia_sugestao" | "manual" | "historico";
  resultado: "pendente" | "deferido" | "deferido_parcial" | "indeferido";
  argumentoEfetivo?: "sim" | "nao" | "parcial";
  documentosAnexados?: any;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(historicoContestacoes).values({
    recursoId: data.recursoId,
    convenioId: data.convenioId,
    userId: data.userId,
    codigoGlosa: data.codigoGlosa,
    descricaoGlosa: data.descricaoGlosa,
    codigoProcedimento: data.codigoProcedimento,
    descricaoProcedimento: data.descricaoProcedimento,
    valorGlosado: data.valorGlosado,
    valorRecuperado: data.valorRecuperado,
    argumentoUtilizado: data.argumentoUtilizado,
    argumentoOrigem: data.argumentoOrigem,
    resultado: data.resultado,
    argumentoEfetivo: data.argumentoEfetivo,
    documentosAnexados: data.documentosAnexados,
    dataResultado: data.resultado !== "pendente" ? new Date() : null,
  });
  return (result as any).insertId || (result as any)[0]?.insertId;
}

export async function getHistoricoContestacoes(params: {
  userId: number;
  convenioId?: number;
  codigoGlosa?: string;
  resultado?: string;
  page: number;
  limit: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, totalPages: 0 };
  
  const conditions: SQL[] = [];
  
  if (params.convenioId) {
    conditions.push(eq(historicoContestacoes.convenioId, params.convenioId));
  }
  if (params.codigoGlosa) {
    conditions.push(eq(historicoContestacoes.codigoGlosa, params.codigoGlosa));
  }
  if (params.resultado) {
    conditions.push(eq(historicoContestacoes.resultado, params.resultado as any));
  }

  const offset = (params.page - 1) * params.limit;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: historicoContestacoes.id,
        codigoGlosa: historicoContestacoes.codigoGlosa,
        descricaoGlosa: historicoContestacoes.descricaoGlosa,
        codigoProcedimento: historicoContestacoes.codigoProcedimento,
        descricaoProcedimento: historicoContestacoes.descricaoProcedimento,
        valorGlosado: historicoContestacoes.valorGlosado,
        valorRecuperado: historicoContestacoes.valorRecuperado,
        argumentoUtilizado: historicoContestacoes.argumentoUtilizado,
        argumentoOrigem: historicoContestacoes.argumentoOrigem,
        resultado: historicoContestacoes.resultado,
        argumentoEfetivo: historicoContestacoes.argumentoEfetivo,
        dataContestacao: historicoContestacoes.dataContestacao,
        dataResultado: historicoContestacoes.dataResultado,
        convenioNome: convenios.nome,
      })
      .from(historicoContestacoes)
      .leftJoin(convenios, eq(historicoContestacoes.convenioId, convenios.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(historicoContestacoes.createdAt))
      .limit(params.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(historicoContestacoes)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items,
    total: countResult[0]?.count || 0,
    page: params.page,
    totalPages: Math.ceil((countResult[0]?.count || 0) / params.limit),
  };
}

export async function getEstatisticasContestacaoPorCodigo(params: {
  codigoGlosa: string;
  convenioId?: number;
  userId: number;
}) {
  const db = await getDb();
  if (!db) return { codigoGlosa: params.codigoGlosa, descricao: '', total: 0, deferidos: 0, deferidosParcial: 0, indeferidos: 0, pendentes: 0, taxaSucesso: 0, valorTotalGlosado: 0, valorTotalRecuperado: 0 };
  
  const conditions: SQL[] = [eq(historicoContestacoes.codigoGlosa, params.codigoGlosa)];
  
  if (params.convenioId) {
    conditions.push(eq(historicoContestacoes.convenioId, params.convenioId));
  }

  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      deferidos: sql<number>`sum(case when resultado = 'deferido' then 1 else 0 end)`,
      deferidosParcial: sql<number>`sum(case when resultado = 'deferido_parcial' then 1 else 0 end)`,
      indeferidos: sql<number>`sum(case when resultado = 'indeferido' then 1 else 0 end)`,
      pendentes: sql<number>`sum(case when resultado = 'pendente' then 1 else 0 end)`,
      valorTotalGlosado: sql<number>`sum(CAST(valor_glosado AS DECIMAL(10,2)))`,
      valorTotalRecuperado: sql<number>`sum(CAST(valor_recuperado AS DECIMAL(10,2)))`,
    })
    .from(historicoContestacoes)
    .where(and(...conditions));

  const total = stats[0]?.total || 0;
  const deferidos = stats[0]?.deferidos || 0;
  const deferidosParcial = stats[0]?.deferidosParcial || 0;
  
  return {
    codigoGlosa: params.codigoGlosa,
    descricao: traduzirCodigoGlosa(params.codigoGlosa),
    total,
    deferidos,
    deferidosParcial,
    indeferidos: stats[0]?.indeferidos || 0,
    pendentes: stats[0]?.pendentes || 0,
    taxaSucesso: total > 0 ? Math.round(((deferidos + deferidosParcial) / total) * 100) : 0,
    valorTotalGlosado: stats[0]?.valorTotalGlosado || 0,
    valorTotalRecuperado: stats[0]?.valorTotalRecuperado || 0,
  };
}

export async function getMelhoresArgumentos(params: {
  codigoGlosa: string;
  convenioId?: number;
  userId: number;
  limit: number;
}) {
  const conditions: SQL[] = [
    eq(historicoContestacoes.codigoGlosa, params.codigoGlosa),
    or(
      eq(historicoContestacoes.resultado, "deferido"),
      eq(historicoContestacoes.resultado, "deferido_parcial")
    )!,
  ];
  
  if (params.convenioId) {
    conditions.push(eq(historicoContestacoes.convenioId, params.convenioId));
  }

  const db = await getDb();
  if (!db) return [];
  
  const argumentos = await db
    .select({
      argumentoUtilizado: historicoContestacoes.argumentoUtilizado,
      resultado: historicoContestacoes.resultado,
      valorRecuperado: historicoContestacoes.valorRecuperado,
      convenioNome: convenios.nome,
      dataContestacao: historicoContestacoes.dataContestacao,
    })
    .from(historicoContestacoes)
    .leftJoin(convenios, eq(historicoContestacoes.convenioId, convenios.id))
    .where(and(...conditions))
    .orderBy(desc(historicoContestacoes.dataContestacao))
    .limit(params.limit);

  return argumentos;
}

export async function sugerirArgumentoComIA(params: {
  codigoGlosa: string;
  convenioId: number;
  codigoProcedimento?: string;
  valorGlosado?: string;
  userId: number;
}) {
  // Buscar informações do dicionário
  const infoGlosa = obterInfoGlosa(params.codigoGlosa);
  const argumentoPadrao = obterArgumentoContestacao(params.codigoGlosa);
  const acoesRecomendadas = obterAcoesRecomendadas(params.codigoGlosa);
  const documentosSugeridos = obterDocumentosSugeridos(params.codigoGlosa);
  
  // Buscar histórico de argumentos bem-sucedidos
  const argumentosSucesso = await getMelhoresArgumentos({
    codigoGlosa: params.codigoGlosa,
    convenioId: params.convenioId,
    userId: params.userId,
    limit: 3,
  });
  
  // Buscar estatísticas
  const estatisticas = await getEstatisticasContestacaoPorCodigo({
    codigoGlosa: params.codigoGlosa,
    convenioId: params.convenioId,
    userId: params.userId,
  });
  
  // Buscar nome do convênio
  const convenio = await getConvenioById(params.convenioId);
  
  // Se não há histórico suficiente, retornar argumento do dicionário
  if (argumentosSucesso.length === 0) {
    return {
      argumento: argumentoPadrao,
      origem: "dicionario" as const,
      acoesRecomendadas,
      documentosSugeridos,
      estatisticas,
      confianca: infoGlosa?.probabilidadeSucesso || 50,
    };
  }
  
  // Usar IA para gerar argumento personalizado
  try {
    const prompt = `Você é um especialista em recursos de glosa hospitalar. Gere um argumento de contestação para a seguinte situação:

CÓDIGO DE GLOSA: ${params.codigoGlosa}
DESCRIÇÃO DA GLOSA: ${infoGlosa?.descricao || traduzirCodigoGlosa(params.codigoGlosa)}
CONVÊNIO: ${convenio?.nome || "Não especificado"}
${params.codigoProcedimento ? `CÓDIGO DO PROCEDIMENTO: ${params.codigoProcedimento}` : ""}
${params.valorGlosado ? `VALOR GLOSADO: R$ ${params.valorGlosado}` : ""}

ARGUMENTO PADRÃO DO DICIONÁRIO:
${argumentoPadrao}

ARGUMENTOS QUE FUNCIONARAM ANTERIORMENTE PARA ESTE CÓDIGO:
${argumentosSucesso.map((a: { argumentoUtilizado: string | null; resultado: string }, i: number) => `${i + 1}. ${a.argumentoUtilizado} (Resultado: ${a.resultado})`).join("\n")}

ESTATÍSTICAS:
- Total de contestações: ${estatisticas.total}
- Taxa de sucesso: ${estatisticas.taxaSucesso}%
- Valor recuperado: R$ ${estatisticas.valorTotalRecuperado}

Gere um argumento de contestação personalizado, técnico e persuasivo, incorporando os elementos que funcionaram nos casos anteriores. O argumento deve ser formal, citar legislação quando aplicável, e ser específico para o convênio ${convenio?.nome || "informado"}.

Responda APENAS com o texto do argumento, sem explicações adicionais.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um especialista em faturamento hospitalar e recursos de glosa. Gere argumentos técnicos, formais e persuasivos." },
        { role: "user", content: prompt },
      ],
    });

    const argumentoIA = response.choices[0]?.message?.content || argumentoPadrao;

    return {
      argumento: argumentoIA,
      origem: "ia_sugestao" as const,
      acoesRecomendadas,
      documentosSugeridos,
      estatisticas,
      argumentosHistorico: argumentosSucesso,
      confianca: Math.min(estatisticas.taxaSucesso + 10, 95),
    };
  } catch (error) {
    // Em caso de erro na IA, retornar argumento do dicionário
    return {
      argumento: argumentoPadrao,
      origem: "dicionario" as const,
      acoesRecomendadas,
      documentosSugeridos,
      estatisticas,
      confianca: infoGlosa?.probabilidadeSucesso || 50,
      erro: "Não foi possível gerar sugestão com IA, usando argumento padrão.",
    };
  }
}


// ============ ESTABELECIMENTOS ============

export async function getEstabelecimentos(ativo?: "sim" | "nao") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ativo) {
    return db.select().from(estabelecimentos).where(eq(estabelecimentos.ativo, ativo));
  }
  return db.select().from(estabelecimentos);
}

export async function getEstabelecimentoById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(estabelecimentos).where(eq(estabelecimentos.id, id));
  return result[0] || null;
}

export async function createEstabelecimento(data: { nome: string; cnpj?: string | null; endereco?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(estabelecimentos).values({
    nome: data.nome,
    cnpj: data.cnpj,
    endereco: data.endereco,
  });
  return { id: Number(result[0].insertId), ...data };
}

export async function updateEstabelecimento(id: number, data: Partial<{ nome: string; cnpj: string; endereco: string; ativo: "sim" | "nao" }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(estabelecimentos).set(data).where(eq(estabelecimentos.id, id));
}

export async function deleteEstabelecimento(id: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verificar se existem arquivos vinculados
  const [arquivosCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(arquivos)
    .where(eq(arquivos.estabelecimentoId, id));

  if (arquivosCount.count > 0) {
    return {
      success: false,
      message: `Não é possível excluir: existem ${arquivosCount.count} arquivo(s) vinculado(s) a este estabelecimento. Remova os arquivos primeiro ou desative o estabelecimento.`,
    };
  }

  // Verificar se existem convênios vinculados
  const [conveniosCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(convenios)
    .where(eq(convenios.estabelecimentoId, id));

  if (conveniosCount.count > 0) {
    return {
      success: false,
      message: `Não é possível excluir: existem ${conveniosCount.count} convênio(s) vinculado(s) a este estabelecimento. Remova os convênios primeiro ou desative o estabelecimento.`,
    };
  }

  // Verificar se existem usuários com permissão para este estabelecimento
  const [permissoesCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(permissoesEstabelecimento)
    .where(eq(permissoesEstabelecimento.estabelecimentoId, id));

  // Remover permissões de usuários (isso é seguro pois não afeta os usuários em si)
  if (permissoesCount.count > 0) {
    await db.delete(permissoesEstabelecimento).where(eq(permissoesEstabelecimento.estabelecimentoId, id));
  }

  // Excluir o estabelecimento
  await db.delete(estabelecimentos).where(eq(estabelecimentos.id, id));

  return {
    success: true,
    message: "Estabelecimento excluído com sucesso",
  };
}

// ============ REGRAS DE CONCILIAÇÃO FUNCTIONS ============

export async function getRegrasConciliacao() {
  const db = await getDb();
  if (!db) return [];
  
  const regras = await db
    .select({
      id: regrasConciliacao.id,
      convenioId: regrasConciliacao.convenioId,
      itensNaoEncontrados: regrasConciliacao.itensNaoEncontrados,
      toleranciaValor: regrasConciliacao.toleranciaValor,
      toleranciaPercentual: regrasConciliacao.toleranciaPercentual,
      usarCodigo: regrasConciliacao.usarCodigo,
      usarGuia: regrasConciliacao.usarGuia,
      usarData: regrasConciliacao.usarData,
      usarPaciente: regrasConciliacao.usarPaciente,
      formatoRetorno: regrasConciliacao.formatoRetorno,
      prazoRecursoDias: regrasConciliacao.prazoRecursoDias,
      observacoes: regrasConciliacao.observacoes,
      ativo: regrasConciliacao.ativo,
      convenioNome: convenios.nome,
      convenioCodigo: convenios.codigo,
    })
    .from(regrasConciliacao)
    .leftJoin(convenios, eq(regrasConciliacao.convenioId, convenios.id))
    .orderBy(convenios.nome);
  
  return regras;
}

export async function getRegraConciliacaoPorConvenio(convenioId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [regra] = await db
    .select()
    .from(regrasConciliacao)
    .where(eq(regrasConciliacao.convenioId, convenioId))
    .limit(1);
  
  return regra || null;
}

export async function createRegraConciliacao(regra: InsertRegraConciliacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(regrasConciliacao).values(regra);
  return { id: Number(result[0].insertId) };
}

export async function updateRegraConciliacao(id: number, regra: Partial<InsertRegraConciliacao>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(regrasConciliacao)
    .set(regra)
    .where(eq(regrasConciliacao.id, id));
  
  return { success: true };
}

export async function deleteRegraConciliacao(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(regrasConciliacao).where(eq(regrasConciliacao.id, id));
  return { success: true };
}

export async function upsertRegraConciliacao(regra: InsertRegraConciliacao) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se já existe regra para este convênio
  const existente = await getRegraConciliacaoPorConvenio(regra.convenioId);
  
  if (existente) {
    await updateRegraConciliacao(existente.id, regra);
    return { id: existente.id, updated: true };
  } else {
    const result = await createRegraConciliacao(regra);
    return { id: result.id, updated: false };
  }
}


// ============ ITENS GLOSADOS COM FILTROS ============

export interface ItemGlosado {
  id: number;
  codigo: string;
  descricao: string;
  tipo: "exame" | "mat_med" | "procedimento" | "taxa" | "diaria" | "outros";
  pacienteNome: string;
  pacienteCarteirinha: string;
  guiaNumero: string;
  dataExecucao: Date | null;
  valorCobrado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  codigoGlosa: string;
  convenioId: number;
  convenioNome: string;
  arquivoId: number;
  arquivoNome: string;
  dataReferencia: Date | null;
  nomeMedico: string;
  crmMedico: string;
  recursoStatus: "sem_recurso" | "recurso_criado" | "recurso_enviado" | "recurso_deferido" | "recurso_indeferido" | null;
  recursoId: number | null;
  // Campos de classificação
  classificacaoGlosa: "pendente" | "aceitar" | "recursar" | "auto_aceitar" | "auto_recursar" | null;
  classificacaoConfianca: number | null;
  classificacaoMotivo: string | null;
}

export interface ResumoItensGlosados {
  totalItens: number;
  totalValorGlosado: number;
  totalValorCobrado: number;
  percentualGlosa: number;
  porTipo: {
    tipo: string;
    quantidade: number;
    valorGlosado: number;
  }[];
  porMotivo: {
    motivo: string;
    quantidade: number;
    valorGlosado: number;
  }[];
}

/**
 * Determina o tipo do procedimento baseado no código TUSS
 */
function determinarTipoProcedimento(codigo: string, descricao?: string): "exame" | "mat_med" | "procedimento" | "taxa" | "diaria" | "outros" {
  // Códigos TUSS:
  // 1xxxxx - Procedimentos gerais
  // 2xxxxx - Procedimentos diagnósticos (exames)
  // 3xxxxx - Procedimentos clínicos
  // 4xxxxx - Procedimentos cirúrgicos
  // 5xxxxx - Outros procedimentos
  // 6xxxxx - Medicamentos
  // 7xxxxx - Materiais
  // 8xxxxx - Taxas e diárias
  // 9xxxxx - Pacotes
  
  const codigoNum = codigo.replace(/\D/g, '');
  const primeiroDigito = codigoNum.charAt(0);
  const doisPrimeiros = codigoNum.substring(0, 2);
  
  // Verificar descrição para mat-med
  const descLower = (descricao || '').toLowerCase();
  if (descLower.includes('medicamento') || descLower.includes('droga') || 
      descLower.includes('ampola') || descLower.includes('frasco') ||
      descLower.includes('comprimido') || descLower.includes('injetavel') ||
      descLower.includes('solucao') || descLower.includes('soro')) {
    return 'mat_med';
  }
  
  if (descLower.includes('material') || descLower.includes('cateter') ||
      descLower.includes('seringa') || descLower.includes('agulha') ||
      descLower.includes('equipo') || descLower.includes('luva') ||
      descLower.includes('opme') || descLower.includes('protese') ||
      descLower.includes('implante')) {
    return 'mat_med';
  }
  
  // Verificar por código
  if (primeiroDigito === '6' || primeiroDigito === '7') {
    return 'mat_med';
  }
  
  if (primeiroDigito === '2' || doisPrimeiros === '40') {
    // Exames laboratoriais e de imagem
    if (descLower.includes('exame') || descLower.includes('dosagem') ||
        descLower.includes('hemograma') || descLower.includes('raio') ||
        descLower.includes('tomografia') || descLower.includes('ressonancia') ||
        descLower.includes('ultrassom') || descLower.includes('ecografia') ||
        descLower.includes('eletro') || descLower.includes('endoscopia')) {
      return 'exame';
    }
    return 'exame';
  }
  
  if (primeiroDigito === '8') {
    if (descLower.includes('diaria') || descLower.includes('internacao') ||
        descLower.includes('acomodacao') || descLower.includes('leito')) {
      return 'diaria';
    }
    return 'taxa';
  }
  
  if (primeiroDigito === '3' || primeiroDigito === '4' || primeiroDigito === '5') {
    return 'procedimento';
  }
  
  return 'outros';
}

export async function getItensGlosados(filters: {
  userId?: number;
  convenioId?: number;
  estabelecimentoId?: number;
  dataReferenciaInicio?: Date;
  dataReferenciaFim?: Date;
  tipo?: string;
  codigoGlosa?: string;
  classificacao?: "todos" | "pendente" | "aceitar" | "recursar";
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: ItemGlosado[]; total: number; resumo: ResumoItensGlosados; alertasPrazo: Array<{ convenio: string; convenioId: number; quantidade: number; valor: number; diasRestantes: number; dataLimite: Date }> }> {
  const db = await getDb();
  if (!db) return { 
    items: [], 
    total: 0, 
    resumo: { 
      totalItens: 0, 
      totalValorGlosado: 0, 
      totalValorCobrado: 0,
      percentualGlosa: 0,
      porTipo: [], 
      porMotivo: [] 
    },
    alertasPrazo: []
  };

  // Buscar arquivos retornados (que contêm glosas)
  const arquivosConditions: any[] = [
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];

  // Filtrar por usuário apenas se especificado
  if (filters.userId) {
    arquivosConditions.push(eq(arquivos.userId, filters.userId));
  }

  if (filters.convenioId) {
    arquivosConditions.push(eq(arquivos.convenioId, filters.convenioId));
  }
  if (filters.estabelecimentoId) {
    arquivosConditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  if (filters.dataReferenciaInicio) {
    arquivosConditions.push(gte(arquivos.dataReferencia, filters.dataReferenciaInicio));
  }

  if (filters.dataReferenciaFim) {
    arquivosConditions.push(lte(arquivos.dataReferencia, filters.dataReferenciaFim));
  }

  const arquivosRetornados = await db
    .select({
      id: arquivos.id,
      nome: arquivos.nome,
      convenioId: arquivos.convenioId,
      dataReferencia: arquivos.dataReferencia,
      dataPagamento: arquivos.dataPagamento,
    })
    .from(arquivos)
    .where(and(...arquivosConditions));

  if (arquivosRetornados.length === 0) {
    return { 
      items: [], 
      total: 0, 
      resumo: { 
        totalItens: 0, 
        totalValorGlosado: 0, 
        totalValorCobrado: 0,
        percentualGlosa: 0,
        porTipo: [], 
        porMotivo: [] 
      },
      alertasPrazo: []
    };
  }

  // Buscar nomes dos convênios
  const convenioIds = Array.from(new Set(arquivosRetornados.map(a => a.convenioId)));
  const conveniosList = await db
    .select()
    .from(convenios)
    .where(inArray(convenios.id, convenioIds));
  
  const convenioMap = new Map(conveniosList.map(c => [c.id, c.nome]));

  // Buscar procedimentos dos arquivos retornados
  const arquivoIds = arquivosRetornados.map(a => a.id);
  const arquivoMap = new Map(arquivosRetornados.map(a => [a.id, a]));

  const procConditions: any[] = [
    inArray(procedimentos.arquivoId, arquivoIds),
  ];

  if (filters.search) {
    procConditions.push(
      or(
        like(procedimentos.codigo, `%${filters.search}%`),
        like(procedimentos.descricao, `%${filters.search}%`),
        like(procedimentos.guiaNumero, `%${filters.search}%`),
        like(procedimentos.pacienteNome, `%${filters.search}%`)
      )
    );
  }

  const allProcs = await db
    .select()
    .from(procedimentos)
    .where(and(...procConditions))
    .orderBy(desc(procedimentos.dataExecucao));

  // Filtrar apenas itens com glosa
  const itensGlosados: ItemGlosado[] = [];
  const resumoPorTipo: { [key: string]: { quantidade: number; valorGlosado: number } } = {};
  const resumoPorMotivo: { [key: string]: { quantidade: number; valorGlosado: number } } = {};
  let totalValorGlosado = 0;
  let totalValorCobrado = 0;

  for (const proc of allProcs) {
    const extras = proc.dadosExtras ? 
      (typeof proc.dadosExtras === "string" ? JSON.parse(proc.dadosExtras) : proc.dadosExtras) : {};
    
    // Verificar se é glosado: por valorGlosado > 0 OU por situacaoItem = GLOSADO/NEGADO
    // Vivacom usa 'VALOR GLOSA' e 'COD. GLOSA' em maiúsculas com espaço
    const valorGlosadoNum = parseFloat(
      proc.valorGlosado || 
      extras.valorGlosado || 
      extras.valor_glosa || 
      extras['VALOR GLOSA'] || 
      extras['Valor Glosa'] || 
      "0"
    );
    const situacaoItem = (extras.situacaoItem || extras['Situação Item'] || extras.situacao || '').toString().toUpperCase();
    const isGlosado = valorGlosadoNum > 0 || situacaoItem === 'GLOSADO' || situacaoItem === 'NEGADO' || situacaoItem.includes('GLOS');
    
    // Só incluir itens com glosa
    if (!isGlosado) continue;

    // Se não tem valorGlosado mas é glosado pelo status, usar o valorTotal como valor glosado
    const valorCobrado = parseFloat(proc.valorTotal || "0");
    const valorGlosado = valorGlosadoNum > 0 ? valorGlosadoNum : valorCobrado;
    const valorPago = valorGlosadoNum > 0 ? (valorCobrado - valorGlosadoNum) : 0;
    const tipo = determinarTipoProcedimento(proc.codigo, proc.descricao || undefined);
    
    // Filtrar por tipo se especificado
    if (filters.tipo && filters.tipo !== "todos" && tipo !== filters.tipo) continue;

    const arquivo = arquivoMap.get(proc.arquivoId);
    const convenioNome = convenioMap.get(arquivo?.convenioId || 0) || "Desconhecido";
    // Buscar motivo de glosa em vários campos possíveis
    // Vivacom usa 'COD. GLOSA' em maiúsculas com espaço e ponto
    const motivoGlosa = extras.motivoGlosa || extras['Erro TISS'] || extras.cod_glosa || extras['COD. GLOSA'] || extras['Cod. Glosa'] || extras.observacao || "Não informado";
    const codigoGlosa = motivoGlosa.match(/^(\d+)/)?.[1] || "";

    // Filtrar por código de glosa se especificado
    if (filters.codigoGlosa && filters.codigoGlosa !== "todos" && codigoGlosa !== filters.codigoGlosa) continue;

    // Filtrar por classificação se especificado
    if (filters.classificacao && filters.classificacao !== "todos") {
      if (filters.classificacao === "pendente" && proc.classificacaoGlosa && proc.classificacaoGlosa !== "pendente") continue;
      if (filters.classificacao === "aceitar" && proc.classificacaoGlosa !== "aceitar" && proc.classificacaoGlosa !== "auto_aceitar") continue;
      if (filters.classificacao === "recursar" && proc.classificacaoGlosa !== "recursar" && proc.classificacaoGlosa !== "auto_recursar") continue;
    } else {
      // Por padrão, excluir itens já aceitos (classificados como "aceitar") - eles aparecem apenas na aba Glosas Aceitas
      if (proc.classificacaoGlosa === "aceitar" || proc.classificacaoGlosa === "auto_aceitar") continue;
    }

    itensGlosados.push({
      id: proc.id,
      codigo: proc.codigo,
      descricao: proc.descricao || "",
      tipo,
      pacienteNome: proc.pacienteNome || extras.paciente || "",
      pacienteCarteirinha: proc.pacienteCarteirinha || extras.carteirinha || "",
      guiaNumero: proc.guiaNumero || extras.guia || "",
      dataExecucao: proc.dataExecucao,
      valorCobrado,
      valorPago,
      valorGlosado,
      motivoGlosa,
      codigoGlosa,
      convenioId: arquivo?.convenioId || 0,
      convenioNome,
      arquivoId: proc.arquivoId,
      arquivoNome: arquivo?.nome || "",
      dataReferencia: arquivo?.dataReferencia || null,
      nomeMedico: proc.nomeMedico || "",
      crmMedico: proc.crmMedico || "",
      recursoStatus: proc.recursoStatus || "sem_recurso",
      recursoId: proc.recursoId || null,
      classificacaoGlosa: proc.classificacaoGlosa || "pendente",
      classificacaoConfianca: proc.classificacaoConfianca || null,
      classificacaoMotivo: proc.classificacaoMotivo || null,
    });

    // Acumular resumo
    totalValorGlosado += valorGlosado;
    totalValorCobrado += valorCobrado;

    // Por tipo
    if (!resumoPorTipo[tipo]) {
      resumoPorTipo[tipo] = { quantidade: 0, valorGlosado: 0 };
    }
    resumoPorTipo[tipo].quantidade++;
    resumoPorTipo[tipo].valorGlosado += valorGlosado;

    // Por motivo
    const motivoKey = codigoGlosa || motivoGlosa.substring(0, 50);
    if (!resumoPorMotivo[motivoKey]) {
      resumoPorMotivo[motivoKey] = { quantidade: 0, valorGlosado: 0 };
    }
    resumoPorMotivo[motivoKey].quantidade++;
    resumoPorMotivo[motivoKey].valorGlosado += valorGlosado;
  }

  // Aplicar paginação
  const total = itensGlosados.length;
  const offset = (filters.page - 1) * filters.pageSize;
  const paginatedItems = itensGlosados.slice(offset, offset + filters.pageSize);

  // Montar resumo
  const tipoLabels: { [key: string]: string } = {
    exame: "Exames",
    mat_med: "Mat/Med",
    procedimento: "Procedimentos",
    taxa: "Taxas",
    diaria: "Diárias",
    outros: "Outros",
  };

  const resumo: ResumoItensGlosados = {
    totalItens: total,
    totalValorGlosado,
    totalValorCobrado,
    percentualGlosa: totalValorCobrado > 0 ? (totalValorGlosado / totalValorCobrado) * 100 : 0,
    porTipo: Object.entries(resumoPorTipo)
      .map(([tipo, data]) => ({
        tipo: tipoLabels[tipo] || tipo,
        quantidade: data.quantidade,
        valorGlosado: data.valorGlosado,
      }))
      .sort((a, b) => b.valorGlosado - a.valorGlosado),
    porMotivo: Object.entries(resumoPorMotivo)
      .map(([motivo, data]) => ({
        motivo,
        quantidade: data.quantidade,
        valorGlosado: data.valorGlosado,
      }))
      .sort((a, b) => b.valorGlosado - a.valorGlosado)
      .slice(0, 10), // Top 10 motivos
  };

  // Calcular alertas de prazo de recurso
  const alertasPrazo: Array<{
    convenio: string;
    convenioId: number;
    quantidade: number;
    valor: number;
    diasRestantes: number;
    dataLimite: Date;
  }> = [];

  // Agrupar itens pendentes por convênio e verificar prazo
  const itensPendentes = itensGlosados.filter(item => 
    item.classificacaoGlosa === "pendente" || !item.classificacaoGlosa
  );

  // Buscar prazos dos convênios
  const conveniosComPrazo = await db
    .select()
    .from(convenios)
    .where(inArray(convenios.id, convenioIds));

  const conveniosPrazoMap = new Map(conveniosComPrazo.map(c => [c.id, c.prazoRecursoGlosa || 30]));

  // Agrupar por convênio e calcular prazo
  const alertasPorConvenio = new Map<number, {
    convenio: string;
    quantidade: number;
    valor: number;
    dataMaisAntiga: Date | null;
  }>();

  for (const item of itensPendentes) {
    const arquivo = arquivoMap.get(item.arquivoId);
    if (!arquivo || !arquivo.convenioId) continue;

    const existente = alertasPorConvenio.get(arquivo.convenioId);
    // Usar dataPagamento se disponível, senão dataReferencia
    const dataRef = arquivo.dataPagamento || arquivo.dataReferencia;

    if (existente) {
      existente.quantidade++;
      existente.valor += item.valorGlosado || 0;
      if (dataRef && (!existente.dataMaisAntiga || dataRef < existente.dataMaisAntiga)) {
        existente.dataMaisAntiga = dataRef;
      }
    } else {
      alertasPorConvenio.set(arquivo.convenioId, {
        convenio: convenioMap.get(arquivo.convenioId) || "Desconhecido",
        quantidade: 1,
        valor: item.valorGlosado || 0,
        dataMaisAntiga: dataRef || null,
      });
    }
  }

  // Calcular dias restantes e filtrar alertas relevantes
  const hoje = new Date();
  for (const [convenioId, dados] of Array.from(alertasPorConvenio.entries())) {
    if (!dados.dataMaisAntiga) continue;

    const prazo = conveniosPrazoMap.get(convenioId) || 30;
    const dataLimite = new Date(dados.dataMaisAntiga);
    dataLimite.setDate(dataLimite.getDate() + prazo);

    const diasRestantes = Math.ceil((dataLimite.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

    // Mostrar alerta se faltam 15 dias ou menos
    if (diasRestantes <= 15 && diasRestantes >= 0) {
      alertasPrazo.push({
        convenio: dados.convenio,
        convenioId,
        quantidade: dados.quantidade,
        valor: dados.valor,
        diasRestantes,
        dataLimite,
      });
    }
  }

  // Ordenar por dias restantes (mais urgentes primeiro)
  alertasPrazo.sort((a, b) => a.diasRestantes - b.diasRestantes);

  return { items: paginatedItems, total, resumo, alertasPrazo };
}


// ============ CLASSIFICAÇÃO E APRENDIZADO DE GLOSAS ============

/**
 * Registra uma decisão de glosa (aceitar ou recursar) para aprendizado
 */
export async function registrarDecisaoGlosa(decisao: InsertDecisaoGlosa): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(decisoesGlosa).values(decisao);
    return Number(result[0].insertId);
  } catch (error) {
    console.error("[Database] Erro ao registrar decisão de glosa:", error);
    return null;
  }
}

/**
 * Atualiza a classificação de um procedimento
 */
export async function atualizarClassificacaoProcedimento(
  procedimentoId: number,
  classificacao: "pendente" | "aceitar" | "recursar" | "auto_aceitar" | "auto_recursar",
  confianca?: number,
  motivo?: string,
  motivoAceite?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const updateData: any = {
      classificacaoGlosa: classificacao,
      classificacaoConfianca: confianca || null,
      classificacaoMotivo: motivo || null,
    };
    
    // Se for aceitar, registrar o motivo do aceite e a data
    if (classificacao === "aceitar" || classificacao === "auto_aceitar") {
      updateData.motivoAceite = motivoAceite || null;
      updateData.dataAceite = new Date();
    } else {
      // Se mudar de aceitar para outro status, limpar os campos
      updateData.motivoAceite = null;
      updateData.dataAceite = null;
    }
    
    await db.update(procedimentos)
      .set(updateData)
      .where(eq(procedimentos.id, procedimentoId));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar classificação:", error);
    return false;
  }
}

/**
 * Busca histórico de decisões para um código de glosa específico
 */
export async function buscarHistoricoDecisoes(
  codigoGlosa: string,
  convenioId?: number
): Promise<{
  totalDecisoes: number;
  totalAceitas: number;
  totalRecursadas: number;
  totalDeferidas: number;
  totalIndeferidas: number;
  taxaSucessoRecurso: number;
  decisaoRecomendada: "aceitar" | "recursar" | "pendente";
  confianca: number;
  motivosComuns: string[];
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalDecisoes: 0,
      totalAceitas: 0,
      totalRecursadas: 0,
      totalDeferidas: 0,
      totalIndeferidas: 0,
      taxaSucessoRecurso: 0,
      decisaoRecomendada: "pendente",
      confianca: 0,
      motivosComuns: [],
    };
  }

  try {
    const conditions = [eq(decisoesGlosa.codigoGlosa, codigoGlosa)];
    if (convenioId) {
      conditions.push(eq(decisoesGlosa.convenioId, convenioId));
    }

    const decisoes = await db.select()
      .from(decisoesGlosa)
      .where(and(...conditions));

    const totalDecisoes = decisoes.length;
    const totalAceitas = decisoes.filter(d => d.decisao === "aceitar").length;
    const totalRecursadas = decisoes.filter(d => d.decisao === "recursar").length;
    const totalDeferidas = decisoes.filter(d => d.resultadoRecurso === "deferido" || d.resultadoRecurso === "deferido_parcial").length;
    const totalIndeferidas = decisoes.filter(d => d.resultadoRecurso === "indeferido").length;

    // Calcular taxa de sucesso de recursos
    const recursosFinalizados = totalDeferidas + totalIndeferidas;
    const taxaSucessoRecurso = recursosFinalizados > 0 ? (totalDeferidas / recursosFinalizados) * 100 : 0;

    // Determinar decisão recomendada com base no histórico
    let decisaoRecomendada: "aceitar" | "recursar" | "pendente" = "pendente";
    let confianca = 0;

    if (totalDecisoes >= 3) {
      // Se temos pelo menos 3 decisões, podemos fazer uma recomendação
      if (taxaSucessoRecurso >= 70) {
        // Alta taxa de sucesso em recursos - recomendar recursar
        decisaoRecomendada = "recursar";
        confianca = Math.min(95, 50 + taxaSucessoRecurso * 0.5);
      } else if (taxaSucessoRecurso <= 30 && recursosFinalizados >= 2) {
        // Baixa taxa de sucesso - recomendar aceitar
        decisaoRecomendada = "aceitar";
        confianca = Math.min(95, 50 + (100 - taxaSucessoRecurso) * 0.5);
      } else if (totalAceitas > totalRecursadas * 2) {
        // Maioria das decisões foi aceitar
        decisaoRecomendada = "aceitar";
        confianca = Math.min(80, (totalAceitas / totalDecisoes) * 100);
      } else if (totalRecursadas > totalAceitas * 2) {
        // Maioria das decisões foi recursar
        decisaoRecomendada = "recursar";
        confianca = Math.min(80, (totalRecursadas / totalDecisoes) * 100);
      }
    }

    // Coletar motivos comuns
    const motivosComuns = decisoes
      .filter(d => d.motivoDecisao)
      .map(d => d.motivoDecisao!)
      .slice(0, 5);

    return {
      totalDecisoes,
      totalAceitas,
      totalRecursadas,
      totalDeferidas,
      totalIndeferidas,
      taxaSucessoRecurso,
      decisaoRecomendada,
      confianca,
      motivosComuns,
    };
  } catch (error) {
    console.error("[Database] Erro ao buscar histórico de decisões:", error);
    return {
      totalDecisoes: 0,
      totalAceitas: 0,
      totalRecursadas: 0,
      totalDeferidas: 0,
      totalIndeferidas: 0,
      taxaSucessoRecurso: 0,
      decisaoRecomendada: "pendente",
      confianca: 0,
      motivosComuns: [],
    };
  }
}

/**
 * Classifica automaticamente glosas com base no histórico
 */
export async function classificarGlosasAutomaticamente(
  convenioId?: number,
  limiteConfianca: number = 70
): Promise<{ classificados: number; erros: number }> {
  const db = await getDb();
  if (!db) return { classificados: 0, erros: 0 };

  let classificados = 0;
  let erros = 0;

  try {
    // Buscar procedimentos glosados pendentes de classificação
    const conditions = [
      eq(procedimentos.classificacaoGlosa, "pendente"),
    ];

    const procs = await db.select()
      .from(procedimentos)
      .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
      .where(and(...conditions))
      .limit(500);

    for (const { procedimentos: proc, arquivos: arq } of procs) {
      if (convenioId && arq.convenioId !== convenioId) continue;

      const extras = (proc.dadosExtras || {}) as Record<string, unknown>;
      const motivoGlosa = (extras.motivoGlosa || extras['Erro TISS'] || extras.cod_glosa || extras['COD. GLOSA'] || "") as string;
      const codigoGlosa = motivoGlosa.match(/^(\d+)/)?.[1] || "";

      if (!codigoGlosa) continue;

      // Buscar histórico para este código de glosa
      const historico = await buscarHistoricoDecisoes(codigoGlosa, arq.convenioId);

      if (historico.confianca >= limiteConfianca && historico.decisaoRecomendada !== "pendente") {
        const classificacao = historico.decisaoRecomendada === "aceitar" ? "auto_aceitar" : "auto_recursar";
        const sucesso = await atualizarClassificacaoProcedimento(
          proc.id,
          classificacao,
          Math.round(historico.confianca),
          `Classificado automaticamente com base em ${historico.totalDecisoes} decisões anteriores. Taxa de sucesso: ${historico.taxaSucessoRecurso.toFixed(1)}%`
        );

        if (sucesso) {
          classificados++;
        } else {
          erros++;
        }
      }
    }

    return { classificados, erros };
  } catch (error) {
    console.error("[Database] Erro ao classificar glosas automaticamente:", error);
    return { classificados, erros };
  }
}

/**
 * Busca sugestão de classificação para um item específico
 */
export async function sugerirClassificacaoGlosa(
  codigoGlosa: string,
  convenioId: number,
  codigoProcedimento?: string
): Promise<{
  sugestao: "aceitar" | "recursar" | "pendente";
  confianca: number;
  baseadoEm: number;
  taxaSucessoRecurso: number;
  motivo: string;
}> {
  const historico = await buscarHistoricoDecisoes(codigoGlosa, convenioId);

  let motivo = "";
  if (historico.decisaoRecomendada === "aceitar") {
    motivo = `Recomendado aceitar: ${historico.totalAceitas} de ${historico.totalDecisoes} decisões anteriores foram aceitas.`;
    if (historico.taxaSucessoRecurso < 30 && historico.totalIndeferidas > 0) {
      motivo += ` Taxa de sucesso em recursos: apenas ${historico.taxaSucessoRecurso.toFixed(0)}%.`;
    }
  } else if (historico.decisaoRecomendada === "recursar") {
    motivo = `Recomendado recursar: ${historico.totalRecursadas} de ${historico.totalDecisoes} decisões anteriores foram recursadas.`;
    if (historico.taxaSucessoRecurso >= 70) {
      motivo += ` Taxa de sucesso em recursos: ${historico.taxaSucessoRecurso.toFixed(0)}%.`;
    }
  } else {
    motivo = `Sem dados suficientes para recomendação (${historico.totalDecisoes} decisões registradas).`;
  }

  return {
    sugestao: historico.decisaoRecomendada,
    confianca: historico.confianca,
    baseadoEm: historico.totalDecisoes,
    taxaSucessoRecurso: historico.taxaSucessoRecurso,
    motivo,
  };
}

/**
 * Atualiza resultado de recurso e registra para aprendizado
 */
export async function atualizarResultadoRecurso(
  recursoId: number,
  resultado: "deferido" | "deferido_parcial" | "indeferido",
  valorRecuperado?: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Atualizar decisões de glosa relacionadas
    await db.update(decisoesGlosa)
      .set({
        resultadoRecurso: resultado,
        valorRecuperado: valorRecuperado?.toString() || null,
      })
      .where(eq(decisoesGlosa.recursoId, recursoId));

    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar resultado de recurso:", error);
    return false;
  }
}


/**
 * Atualiza o status dos procedimentos vinculados a um recurso
 */
export async function atualizarStatusProcedimentosPorRecurso(
  recursoId: number,
  novoStatus: "recurso_criado" | "recurso_enviado" | "recurso_deferido" | "recurso_indeferido"
): Promise<boolean> {
  const dbConn = await getDb();
  if (!dbConn) return false;

  try {
    // Buscar todos os procedimentos vinculados a este recurso
    await dbConn.update(procedimentos)
      .set({
        recursoStatus: novoStatus,
      })
      .where(eq(procedimentos.recursoId, recursoId));

    console.log(`[Database] Status dos procedimentos do recurso ${recursoId} atualizado para ${novoStatus}`);
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar status dos procedimentos por recurso:", error);
    return false;
  }
}


// ============ TABELAS DE PREÇOS FUNCTIONS ============

/**
 * Lista tabelas de preços por convênio e tipo
 */
export async function getTabelasPreco(filtros: {
  convenioId?: number;
  estabelecimentoId?: number;
  tipo?: "diarias" | "mat_med" | "taxas" | "procedimentos";
  codigo?: string;
  nome?: string;
  apenasVigentes?: boolean;
  page?: number;
  limit?: number;
}) {
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0 };

  try {
    const conditions = [];
    
    if (filtros.convenioId) {
      conditions.push(eq(tabelasPreco.convenioId, filtros.convenioId));
    }
    // Filtrar por estabelecimento: mostrar tabelas do estabelecimento ou tabelas globais (estabelecimentoId = null)
    if (filtros.estabelecimentoId) {
      conditions.push(
        or(
          eq(tabelasPreco.estabelecimentoId, filtros.estabelecimentoId),
          isNull(tabelasPreco.estabelecimentoId)
        )
      );
    }
    if (filtros.tipo) {
      conditions.push(eq(tabelasPreco.tipo, filtros.tipo));
    }
    if (filtros.codigo) {
      conditions.push(like(tabelasPreco.codigo, `%${filtros.codigo}%`));
    }
    if (filtros.nome) {
      conditions.push(like(tabelasPreco.nome, `%${filtros.nome}%`));
    }
    if (filtros.apenasVigentes) {
      const hoje = new Date();
      conditions.push(lte(tabelasPreco.vigenciaInicio, hoje));
      // Campo vigenciaFim removido - agora só verifica se a vigência já iniciou
    }
    conditions.push(eq(tabelasPreco.ativo, "sim"));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Contar total
    const countResult = await dbConn.select({ count: sql<number>`count(*)` })
      .from(tabelasPreco)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    // Buscar itens com paginação
    const page = filtros.page || 1;
    const limit = filtros.limit || 50;
    const offset = (page - 1) * limit;

    const items = await dbConn.select()
      .from(tabelasPreco)
      .where(whereClause)
      .orderBy(desc(tabelasPreco.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  } catch (error) {
    console.error("[Database] Erro ao buscar tabelas de preços:", error);
    return { items: [], total: 0 };
  }
}

/**
 * Busca um item da tabela de preços por ID
 */
export async function getTabelaPrecoById(id: number) {
  const dbConn = await getDb();
  if (!dbConn) return null;

  try {
    const result = await dbConn.select()
      .from(tabelasPreco)
      .where(eq(tabelasPreco.id, id))
      .limit(1);
    return result[0] || null;
  } catch (error) {
    console.error("[Database] Erro ao buscar tabela de preço por ID:", error);
    return null;
  }
}

/**
 * Cria um novo item na tabela de preços
 */
export async function createTabelaPreco(data: InsertTabelaPreco): Promise<number | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;

  try {
    const result = await dbConn.insert(tabelasPreco).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Erro ao criar tabela de preço:", error);
    return null;
  }
}

/**
 * Cria múltiplos itens na tabela de preços (importação em lote)
 */
export async function createTabelasPrecoEmLote(items: InsertTabelaPreco[]): Promise<{ inseridos: number; erros: number }> {
  const dbConn = await getDb();
  if (!dbConn) return { inseridos: 0, erros: 0 };

  let inseridos = 0;
  let erros = 0;

  try {
    // Inserir em lotes de 500
    const batchSize = 500;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      try {
        await dbConn.insert(tabelasPreco).values(batch);
        inseridos += batch.length;
      } catch (error) {
        console.error(`[Database] Erro ao inserir lote ${i / batchSize + 1}:`, error);
        erros += batch.length;
      }
    }
    return { inseridos, erros };
  } catch (error) {
    console.error("[Database] Erro ao criar tabelas de preço em lote:", error);
    return { inseridos, erros: items.length };
  }
}

/**
 * Atualiza um item da tabela de preços
 */
export async function updateTabelaPreco(id: number, data: Partial<InsertTabelaPreco>): Promise<boolean> {
  const dbConn = await getDb();
  if (!dbConn) return false;

  try {
    await dbConn.update(tabelasPreco)
      .set(data)
      .where(eq(tabelasPreco.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar tabela de preço:", error);
    return false;
  }
}

/**
 * Desativa um item da tabela de preços (soft delete)
 */
export async function deleteTabelaPreco(id: number): Promise<boolean> {
  const dbConn = await getDb();
  if (!dbConn) return false;

  try {
    await dbConn.update(tabelasPreco)
      .set({ ativo: "nao" })
      .where(eq(tabelasPreco.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao desativar tabela de preço:", error);
    return false;
  }
}

/**
 * Desativa todos os itens de uma tabela de preços por convênio e tipo
 */
export async function desativarTabelasPreco(convenioId: number, tipo: string): Promise<boolean> {
  const dbConn = await getDb();
  if (!dbConn) return false;

  try {
    await dbConn.update(tabelasPreco)
      .set({ ativo: "nao" })
      .where(and(
        eq(tabelasPreco.convenioId, convenioId),
        eq(tabelasPreco.tipo, tipo as any)
      ));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao desativar tabelas de preço:", error);
    return false;
  }
}

/**
 * Registra uma alteração no histórico de preços
 */
export async function registrarHistoricoPreco(data: {
  tabelaPrecoId: number;
  userId: number;
  tipoAlteracao: "criacao" | "edicao" | "exclusao" | "importacao";
  valorAnterior?: string | null;
  vigenciaInicioAnterior?: Date | null;
  nomeAnterior?: string | null;
  codigoAnterior?: string | null;
  valorNovo?: string | null;
  vigenciaInicioNovo?: Date | null;
  nomeNovo?: string | null;
  codigoNovo?: string | null;
  observacao?: string | null;
}): Promise<number | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;

  try {
    const result = await dbConn.insert(historicoPrecos).values({
      tabelaPrecoId: data.tabelaPrecoId,
      userId: data.userId,
      tipoAlteracao: data.tipoAlteracao,
      valorAnterior: data.valorAnterior || null,
      vigenciaInicioAnterior: data.vigenciaInicioAnterior || null,
      nomeAnterior: data.nomeAnterior || null,
      codigoAnterior: data.codigoAnterior || null,
      valorNovo: data.valorNovo || null,
      vigenciaInicioNovo: data.vigenciaInicioNovo || null,
      nomeNovo: data.nomeNovo || null,
      codigoNovo: data.codigoNovo || null,
      observacao: data.observacao || null,
    });
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Erro ao registrar histórico de preço:", error);
    return null;
  }
}

/**
 * Busca histórico de alterações de um item de tabela de preço
 */
export async function getHistoricoPreco(tabelaPrecoId: number): Promise<any[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];

  try {
    const result = await dbConn.select({
      id: historicoPrecos.id,
      tabelaPrecoId: historicoPrecos.tabelaPrecoId,
      userId: historicoPrecos.userId,
      userName: users.name,
      userEmail: users.email,
      tipoAlteracao: historicoPrecos.tipoAlteracao,
      valorAnterior: historicoPrecos.valorAnterior,
      vigenciaInicioAnterior: historicoPrecos.vigenciaInicioAnterior,
      nomeAnterior: historicoPrecos.nomeAnterior,
      codigoAnterior: historicoPrecos.codigoAnterior,
      valorNovo: historicoPrecos.valorNovo,
      vigenciaInicioNovo: historicoPrecos.vigenciaInicioNovo,
      nomeNovo: historicoPrecos.nomeNovo,
      codigoNovo: historicoPrecos.codigoNovo,
      observacao: historicoPrecos.observacao,
      createdAt: historicoPrecos.createdAt,
    })
      .from(historicoPrecos)
      .leftJoin(users, eq(historicoPrecos.userId, users.id))
      .where(eq(historicoPrecos.tabelaPrecoId, tabelaPrecoId))
      .orderBy(desc(historicoPrecos.createdAt));
    
    return result;
  } catch (error) {
    console.error("[Database] Erro ao buscar histórico de preço:", error);
    return [];
  }
}

/**
 * Busca histórico de alterações de preços por convênio (para relatórios)
 */
export async function getHistoricoPrecosPorConvenio(
  convenioId: number,
  filtros?: {
    tipo?: string;
    dataInicio?: Date;
    dataFim?: Date;
    userId?: number;
    tipoAlteracao?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ items: any[]; total: number }> {
  const dbConn = await getDb();
  if (!dbConn) return { items: [], total: 0 };

  try {
    // Primeiro, buscar os IDs das tabelas de preço deste convênio
    const tabelasIds = await dbConn.select({ id: tabelasPreco.id })
      .from(tabelasPreco)
      .where(eq(tabelasPreco.convenioId, convenioId));
    
    if (tabelasIds.length === 0) {
      return { items: [], total: 0 };
    }

    const ids = tabelasIds.map(t => t.id);
    
    // Construir condições de filtro
    const conditions: any[] = [inArray(historicoPrecos.tabelaPrecoId, ids)];
    
    if (filtros?.dataInicio) {
      conditions.push(gte(historicoPrecos.createdAt, filtros.dataInicio));
    }
    if (filtros?.dataFim) {
      conditions.push(lte(historicoPrecos.createdAt, filtros.dataFim));
    }
    if (filtros?.userId) {
      conditions.push(eq(historicoPrecos.userId, filtros.userId));
    }
    if (filtros?.tipoAlteracao) {
      conditions.push(eq(historicoPrecos.tipoAlteracao, filtros.tipoAlteracao as any));
    }

    const whereClause = and(...conditions);

    // Contar total
    const countResult = await dbConn.select({ count: sql<number>`count(*)` })
      .from(historicoPrecos)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    // Buscar itens com paginação
    const page = filtros?.page || 1;
    const limit = filtros?.limit || 50;
    const offset = (page - 1) * limit;

    const items = await dbConn.select({
      id: historicoPrecos.id,
      tabelaPrecoId: historicoPrecos.tabelaPrecoId,
      userId: historicoPrecos.userId,
      userName: users.name,
      userEmail: users.email,
      tipoAlteracao: historicoPrecos.tipoAlteracao,
      valorAnterior: historicoPrecos.valorAnterior,
      vigenciaInicioAnterior: historicoPrecos.vigenciaInicioAnterior,
      nomeAnterior: historicoPrecos.nomeAnterior,
      codigoAnterior: historicoPrecos.codigoAnterior,
      valorNovo: historicoPrecos.valorNovo,
      vigenciaInicioNovo: historicoPrecos.vigenciaInicioNovo,
      nomeNovo: historicoPrecos.nomeNovo,
      codigoNovo: historicoPrecos.codigoNovo,
      observacao: historicoPrecos.observacao,
      createdAt: historicoPrecos.createdAt,
      // Dados do item da tabela de preço
      itemCodigo: tabelasPreco.codigo,
      itemNome: tabelasPreco.nome,
      itemTipo: tabelasPreco.tipo,
    })
      .from(historicoPrecos)
      .leftJoin(users, eq(historicoPrecos.userId, users.id))
      .leftJoin(tabelasPreco, eq(historicoPrecos.tabelaPrecoId, tabelasPreco.id))
      .where(whereClause)
      .orderBy(desc(historicoPrecos.createdAt))
      .limit(limit)
      .offset(offset);

    return { items, total };
  } catch (error) {
    console.error("[Database] Erro ao buscar histórico de preços por convênio:", error);
    return { items: [], total: 0 };
  }
}

/**
 * Busca preço de um item por código e convênio (para uso na conciliação)
 */
export async function getPrecoItem(convenioId: number, codigo: string, tipo?: string): Promise<number | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;

  try {
    const hoje = new Date();
    const conditions = [
      eq(tabelasPreco.convenioId, convenioId),
      eq(tabelasPreco.codigo, codigo),
      eq(tabelasPreco.ativo, "sim"),
      lte(tabelasPreco.vigenciaInicio, hoje),
    ];

    if (tipo) {
      conditions.push(eq(tabelasPreco.tipo, tipo as any));
    }

    const result = await dbConn.select({ valor: tabelasPreco.valor })
      .from(tabelasPreco)
      .where(and(...conditions))
      .limit(1);

    return result[0]?.valor ? parseFloat(result[0].valor) : null;
  } catch (error) {
    console.error("[Database] Erro ao buscar preço de item:", error);
    return null;
  }
}

/**
 * Registra uma importação de tabela de preços
 */
export async function createImportacaoTabela(data: InsertImportacaoTabela): Promise<number | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;

  try {
    const result = await dbConn.insert(importacoesTabela).values(data);
    return result[0].insertId;
  } catch (error) {
    console.error("[Database] Erro ao criar importação de tabela:", error);
    return null;
  }
}

/**
 * Atualiza o status de uma importação de tabela
 */
export async function updateImportacaoTabela(id: number, data: Partial<InsertImportacaoTabela>): Promise<boolean> {
  const dbConn = await getDb();
  if (!dbConn) return false;

  try {
    await dbConn.update(importacoesTabela)
      .set(data)
      .where(eq(importacoesTabela.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar importação de tabela:", error);
    return false;
  }
}

/**
 * Lista histórico de importações de tabelas
 */
export async function getImportacoesTabela(convenioId?: number) {
  const dbConn = await getDb();
  if (!dbConn) return [];

  try {
    const conditions = convenioId ? [eq(importacoesTabela.convenioId, convenioId)] : [];
    
    const result = await dbConn.select()
      .from(importacoesTabela)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(importacoesTabela.createdAt))
      .limit(100);

    return result;
  } catch (error) {
    console.error("[Database] Erro ao buscar importações de tabela:", error);
    return [];
  }
}

/**
 * Conta itens por tipo de tabela e convênio
 */
export async function contarItensTabelaPreco(convenioId: number) {
  const dbConn = await getDb();
  if (!dbConn) return { diarias: 0, mat_med: 0, taxas: 0, procedimentos: 0 };

  try {
    const result = await dbConn.select({
      tipo: tabelasPreco.tipo,
      count: sql<number>`count(*)`
    })
      .from(tabelasPreco)
      .where(and(
        eq(tabelasPreco.convenioId, convenioId),
        eq(tabelasPreco.ativo, "sim")
      ))
      .groupBy(tabelasPreco.tipo);

    const counts = { diarias: 0, mat_med: 0, taxas: 0, procedimentos: 0 };
    result.forEach(r => {
      if (r.tipo in counts) {
        counts[r.tipo as keyof typeof counts] = r.count;
      }
    });

    return counts;
  } catch (error) {
    console.error("[Database] Erro ao contar itens da tabela de preço:", error);
    return { diarias: 0, mat_med: 0, taxas: 0, procedimentos: 0 };
  }
}


// ============ ITENS GLOSADOS ACEITOS ============

interface ItemGlosadoAceito {
  id: number;
  codigo: string;
  descricao: string;
  tipo: string;
  pacienteNome: string;
  pacienteCarteirinha: string;
  guiaNumero: string;
  dataExecucao: Date | null;
  valorCobrado: number;
  valorGlosado: number;
  motivoGlosa: string;
  codigoGlosa: string;
  convenioId: number;
  convenioNome: string;
  arquivoId: number;
  arquivoNome: string;
  dataReferencia: Date | null;
  motivoAceite: string | null;
  dataAceite: Date | null;
}

/**
 * Busca itens glosados que foram aceitos (classificacaoGlosa = 'aceitar')
 */
export async function getItensGlosadosAceitos(filters: {
  userId?: number;
  convenioId?: number;
  estabelecimentoId?: number;
  dataReferenciaInicio?: Date;
  dataReferenciaFim?: Date;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: ItemGlosadoAceito[]; total: number; totalValorGlosado: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0, totalValorGlosado: 0 };

  // Buscar arquivos retornados
  const arquivosConditions: any[] = [
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];

  // Filtrar por usuário apenas se especificado
  if (filters.userId) {
    arquivosConditions.push(eq(arquivos.userId, filters.userId));
  }
  if (filters.convenioId) {
    arquivosConditions.push(eq(arquivos.convenioId, filters.convenioId));
  }
  if (filters.estabelecimentoId) {
    arquivosConditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  if (filters.dataReferenciaInicio) {
    arquivosConditions.push(gte(arquivos.dataReferencia, filters.dataReferenciaInicio));
  }

  if (filters.dataReferenciaFim) {
    arquivosConditions.push(lte(arquivos.dataReferencia, filters.dataReferenciaFim));
  }

  const arquivosRetornados = await db
    .select({
      id: arquivos.id,
      nome: arquivos.nome,
      convenioId: arquivos.convenioId,
      dataReferencia: arquivos.dataReferencia,
      dataPagamento: arquivos.dataPagamento,
    })
    .from(arquivos)
    .where(and(...arquivosConditions));

  if (arquivosRetornados.length === 0) {
    return { items: [], total: 0, totalValorGlosado: 0 };
  }

  // Buscar nomes dos convênios
  const convenioIds = Array.from(new Set(arquivosRetornados.map(a => a.convenioId)));
  const conveniosList = await db
    .select()
    .from(convenios)
    .where(inArray(convenios.id, convenioIds));
  
  const convenioMap = new Map(conveniosList.map(c => [c.id, c.nome]));

  // Buscar procedimentos aceitos dos arquivos retornados
  const arquivoIds = arquivosRetornados.map(a => a.id);
  const arquivoMap = new Map(arquivosRetornados.map(a => [a.id, a]));

  const procConditions: any[] = [
    inArray(procedimentos.arquivoId, arquivoIds),
    eq(procedimentos.classificacaoGlosa, "aceitar"),
  ];

  if (filters.search) {
    procConditions.push(
      or(
        like(procedimentos.codigo, `%${filters.search}%`),
        like(procedimentos.descricao, `%${filters.search}%`),
        like(procedimentos.guiaNumero, `%${filters.search}%`),
        like(procedimentos.pacienteNome, `%${filters.search}%`)
      )
    );
  }

  const allProcs = await db
    .select()
    .from(procedimentos)
    .where(and(...procConditions))
    .orderBy(desc(procedimentos.dataAceite), desc(procedimentos.dataExecucao));

  // Processar itens aceitos
  const itensAceitos: ItemGlosadoAceito[] = [];
  let totalValorGlosado = 0;

  for (const proc of allProcs) {
    const extras = proc.dadosExtras ? 
      (typeof proc.dadosExtras === "string" ? JSON.parse(proc.dadosExtras) : proc.dadosExtras) : {};
    
    const valorGlosadoNum = parseFloat(
      proc.valorGlosado || 
      extras.valorGlosado || 
      extras.valor_glosa || 
      extras['VALOR GLOSA'] || 
      extras['Valor Glosa'] || 
      "0"
    );
    
    const valorCobrado = parseFloat(proc.valorTotal || "0");
    const valorGlosado = valorGlosadoNum > 0 ? valorGlosadoNum : valorCobrado;
    const tipo = determinarTipoProcedimento(proc.codigo, proc.descricao || undefined);
    
    const arquivo = arquivoMap.get(proc.arquivoId);
    const convenioNome = convenioMap.get(arquivo?.convenioId || 0) || "Desconhecido";
    const motivoGlosa = extras.motivoGlosa || extras['Erro TISS'] || extras.cod_glosa || extras['COD. GLOSA'] || extras['Cod. Glosa'] || extras.observacao || "Não informado";
    const codigoGlosa = motivoGlosa.match(/^(\d+)/)?.[1] || "";

    itensAceitos.push({
      id: proc.id,
      codigo: proc.codigo,
      descricao: proc.descricao || "",
      tipo,
      pacienteNome: proc.pacienteNome || extras.paciente || "",
      pacienteCarteirinha: proc.pacienteCarteirinha || extras.carteirinha || "",
      guiaNumero: proc.guiaNumero || extras.guia || "",
      dataExecucao: proc.dataExecucao,
      valorCobrado,
      valorGlosado,
      motivoGlosa,
      codigoGlosa,
      convenioId: arquivo?.convenioId || 0,
      convenioNome,
      arquivoId: proc.arquivoId,
      arquivoNome: arquivo?.nome || "",
      dataReferencia: arquivo?.dataReferencia || null,
      motivoAceite: proc.motivoAceite || null,
      dataAceite: proc.dataAceite || null,
    });

    totalValorGlosado += valorGlosado;
  }

  // Aplicar paginação
  const total = itensAceitos.length;
  const offset = (filters.page - 1) * filters.pageSize;
  const paginatedItems = itensAceitos.slice(offset, offset + filters.pageSize);

  return { items: paginatedItems, total, totalValorGlosado };
}


// ==================== REGRAS DE NEGÓCIO ====================

// Criar regra de negócio
export async function createRegraNegocio(data: InsertRegraNegocio) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(regrasNegocio).values(data);
  return result[0].insertId;
}

// Listar regras de negócio
export async function getRegrasNegocio(filters: {
  convenioId?: number;
  estabelecimentoId?: number;
  ativo?: "sim" | "nao";
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters.convenioId) {
    conditions.push(or(
      eq(regrasNegocio.convenioId, filters.convenioId),
      isNull(regrasNegocio.convenioId)
    ));
  }
  
  if (filters.estabelecimentoId) {
    conditions.push(or(
      eq(regrasNegocio.estabelecimentoId, filters.estabelecimentoId),
      isNull(regrasNegocio.estabelecimentoId)
    ));
  }
  
  if (filters.ativo) {
    conditions.push(eq(regrasNegocio.ativo, filters.ativo));
  }
  
  const query = conditions.length > 0
    ? db.select().from(regrasNegocio).where(and(...conditions)).orderBy(regrasNegocio.prioridade)
    : db.select().from(regrasNegocio).orderBy(regrasNegocio.prioridade);
  
  return await query;
}

// Obter regra por ID com itens
export async function getRegraNegocioById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const regra = await db.select().from(regrasNegocio).where(eq(regrasNegocio.id, id)).limit(1);
  if (regra.length === 0) return null;
  
  const itens = await db.select().from(itensRegraNegocio).where(eq(itensRegraNegocio.regraId, id));
  
  return { ...regra[0], itens };
}

// Atualizar regra de negócio
export async function updateRegraNegocio(id: number, data: Partial<InsertRegraNegocio>) {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(regrasNegocio).set(data).where(eq(regrasNegocio.id, id));
  return true;
}

// Excluir regra de negócio
export async function deleteRegraNegocio(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  // Excluir itens primeiro
  await db.delete(itensRegraNegocio).where(eq(itensRegraNegocio.regraId, id));
  // Excluir regra
  await db.delete(regrasNegocio).where(eq(regrasNegocio.id, id));
  return true;
}

// Adicionar item à regra
export async function addItemRegraNegocio(data: InsertItemRegraNegocio) {
  const db = await getDb();
  if (!db) return null;
  
  // Garantir que toleranciaValor seja uma string válida ou undefined
  const cleanData = {
    ...data,
    toleranciaValor: data.toleranciaValor ? String(data.toleranciaValor) : undefined,
    valorEsperado: data.valorEsperado ? String(data.valorEsperado) : undefined,
  };
  
  const result = await db.insert(itensRegraNegocio).values(cleanData);
  return result[0].insertId;
}

// Remover item da regra
export async function removeItemRegraNegocio(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  await db.delete(itensRegraNegocio).where(eq(itensRegraNegocio.id, id));
  return true;
}

// ==================== ALERTAS DE DIVERGÊNCIA ====================

// Criar alerta de divergência
export async function createAlertaDivergencia(data: InsertAlertaDivergencia) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(alertasDivergencia).values(data);
  return result[0].insertId;
}

// Criar múltiplos alertas
export async function createAlertasDivergenciaBatch(alertas: InsertAlertaDivergencia[]) {
  const db = await getDb();
  if (!db || alertas.length === 0) return 0;
  
  const result = await db.insert(alertasDivergencia).values(alertas);
  return alertas.length;
}

// Listar alertas por arquivo
export async function getAlertasByArquivo(arquivoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(alertasDivergencia)
    .where(eq(alertasDivergencia.arquivoId, arquivoId))
    .orderBy(desc(alertasDivergencia.severidade), alertasDivergencia.createdAt);
}

// Listar alertas pendentes
export async function getAlertasPendentes(filters: {
  convenioId?: number;
  tipoAlerta?: string;
  severidade?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  
  const conditions = [eq(alertasDivergencia.status, "pendente")];
  
  if (filters.tipoAlerta) {
    conditions.push(eq(alertasDivergencia.tipoAlerta, filters.tipoAlerta as any));
  }
  
  if (filters.severidade) {
    conditions.push(eq(alertasDivergencia.severidade, filters.severidade as any));
  }
  
  // Se filtrar por convênio, fazer join com arquivos
  let query;
  if (filters.convenioId) {
    query = db.select({
      alerta: alertasDivergencia,
      arquivo: arquivos
    })
    .from(alertasDivergencia)
    .innerJoin(arquivos, eq(alertasDivergencia.arquivoId, arquivos.id))
    .where(and(...conditions, eq(arquivos.convenioId, filters.convenioId)))
    .orderBy(desc(alertasDivergencia.severidade), desc(alertasDivergencia.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  } else {
    query = db.select()
      .from(alertasDivergencia)
      .where(and(...conditions))
      .orderBy(desc(alertasDivergencia.severidade), desc(alertasDivergencia.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }
  
  const items = await query;
  
  // Contar total
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(alertasDivergencia)
    .where(and(...conditions));
  
  return { items, total: countResult[0]?.count || 0 };
}

// Atualizar status do alerta
export async function updateAlertaStatus(
  id: number,
  status: "pendente" | "analisando" | "corrigido" | "ignorado" | "aceito",
  userId?: number,
  observacao?: string
) {
  const db = await getDb();
  if (!db) return false;
  
  const updateData: any = { status };
  
  if (status === "corrigido" || status === "ignorado" || status === "aceito") {
    updateData.resolvidoPor = userId;
    updateData.dataResolucao = new Date();
    updateData.observacaoResolucao = observacao;
  }
  
  await db.update(alertasDivergencia).set(updateData).where(eq(alertasDivergencia.id, id));
  return true;
}

// ==================== COMPARAÇÃO AUTOMÁTICA ====================

// Comparar procedimentos com tabela de preços
export async function compararComTabelaPrecos(arquivoId: number) {
  const db = await getDb();
  if (!db) return { alertas: [], resumo: { total: 0, divergencias: 0, valorDiferenca: 0 } };
  
  // Buscar arquivo e convênio
  const arquivo = await db.select().from(arquivos).where(eq(arquivos.id, arquivoId)).limit(1);
  if (arquivo.length === 0) return { alertas: [], resumo: { total: 0, divergencias: 0, valorDiferenca: 0 } };
  
  const convenioId = arquivo[0].convenioId;
  
  // LIMPAR alertas antigos de comparação de preços para este arquivo antes de criar novos
  await db.delete(alertasDivergencia).where(
    and(
      eq(alertasDivergencia.arquivoId, arquivoId),
      or(
        eq(alertasDivergencia.tipoAlerta, "valor_divergente"),
        eq(alertasDivergencia.tipoAlerta, "codigo_invalido")
      )
    )
  );
  
  // Buscar procedimentos do arquivo
  const procs = await db.select().from(procedimentos).where(eq(procedimentos.arquivoId, arquivoId));
  
  // Buscar tabela de preços do convênio (sem filtro de vigência para incluir todas as tabelas ativas)
  // O filtro de vigência pode ser aplicado posteriormente se necessário
  const tabela = await db.select()
    .from(tabelasPreco)
    .where(and(
      eq(tabelasPreco.convenioId, convenioId),
      eq(tabelasPreco.ativo, "sim")
    ));
  
  // Criar mapa de preços por código
  const precoMap = new Map<string, { valor: number; nome: string; tipo: string }>();
  for (const item of tabela) {
    precoMap.set(item.codigo, {
      valor: parseFloat(item.valor),
      nome: item.nome,
      tipo: item.tipo
    });
  }
  
  const alertasParaCriar: InsertAlertaDivergencia[] = [];
  let totalDivergencias = 0;
  let valorTotalDiferenca = 0;
  
  for (const proc of procs) {
    const precoTabela = precoMap.get(proc.codigo);
    const valorCobrado = parseFloat(proc.valorUnitario || proc.valorTotal || "0");
    
    if (!precoTabela) {
      // Código não encontrado na tabela
      alertasParaCriar.push({
        arquivoId,
        procedimentoId: proc.id,
        tipoAlerta: "codigo_invalido",
        severidade: "media",
        titulo: `Código não encontrado na tabela: ${proc.codigo}`,
        descricao: `O código ${proc.codigo} (${proc.descricao || "Sem descrição"}) não foi encontrado na tabela de preços do convênio.`,
        codigoItem: proc.codigo,
        descricaoItem: proc.descricao || undefined,
        guiaNumero: proc.guiaNumero || undefined,
        valorCobrado: valorCobrado.toString(),
        sugestaoCorrecao: "Verificar se o código está correto ou adicionar à tabela de preços.",
        status: "pendente"
      });
      totalDivergencias++;
    } else if (Math.abs(valorCobrado - precoTabela.valor) > 0.01) {
      // Valor divergente
      const diferenca = valorCobrado - precoTabela.valor;
      valorTotalDiferenca += Math.abs(diferenca);
      
      alertasParaCriar.push({
        arquivoId,
        procedimentoId: proc.id,
        tipoAlerta: "valor_divergente",
        severidade: diferenca > 0 ? "alta" : "media",
        titulo: `Valor divergente: ${proc.codigo}`,
        descricao: `O valor cobrado (R$ ${valorCobrado.toFixed(2)}) difere do valor da tabela (R$ ${precoTabela.valor.toFixed(2)}). Diferença: R$ ${diferenca.toFixed(2)}`,
        codigoItem: proc.codigo,
        descricaoItem: proc.descricao || undefined,
        guiaNumero: proc.guiaNumero || undefined,
        valorCobrado: valorCobrado.toString(),
        valorEsperado: precoTabela.valor.toString(),
        diferenca: diferenca.toString(),
        sugestaoCorrecao: diferenca > 0 
          ? `Reduzir o valor para R$ ${precoTabela.valor.toFixed(2)} conforme tabela.`
          : `Valor cobrado abaixo da tabela. Verificar se está correto.`,
        status: "pendente"
      });
      totalDivergencias++;
    }
  }
  
  // Criar alertas em batch
  if (alertasParaCriar.length > 0) {
    await createAlertasDivergenciaBatch(alertasParaCriar);
  }
  
  return {
    alertas: alertasParaCriar,
    resumo: {
      total: procs.length,
      divergencias: totalDivergencias,
      valorDiferenca: valorTotalDiferenca
    }
  };
}

// Verificar regras de negócio para um arquivo
export async function verificarRegrasNegocio(arquivoId: number) {
  const db = await getDb();
  if (!db) return { alertas: [], resumo: { total: 0, violacoes: 0 } };
  
  // Buscar arquivo e convênio
  const arquivo = await db.select().from(arquivos).where(eq(arquivos.id, arquivoId)).limit(1);
  if (arquivo.length === 0) return { alertas: [], resumo: { total: 0, violacoes: 0 } };
  
  const convenioId = arquivo[0].convenioId;
  const estabelecimentoId = arquivo[0].estabelecimentoId;
  
  // Buscar procedimentos do arquivo
  const procs = await db.select().from(procedimentos).where(eq(procedimentos.arquivoId, arquivoId));
  
  // Criar mapa de códigos presentes na conta
  const codigosPresentes = new Map<string, { quantidade: number; valor: number; descricao: string }>();
  for (const proc of procs) {
    const existing = codigosPresentes.get(proc.codigo);
    const valor = parseFloat(proc.valorTotal || "0");
    if (existing) {
      existing.quantidade += proc.quantidade || 1;
      existing.valor += valor;
    } else {
      codigosPresentes.set(proc.codigo, {
        quantidade: proc.quantidade || 1,
        valor,
        descricao: proc.descricao || ""
      });
    }
  }
  
  // Buscar regras aplicáveis
  const regras = await db.select()
    .from(regrasNegocio)
    .where(and(
      eq(regrasNegocio.ativo, "sim"),
      or(
        eq(regrasNegocio.convenioId, convenioId),
        isNull(regrasNegocio.convenioId)
      ),
      or(
        eq(regrasNegocio.estabelecimentoId, estabelecimentoId || 0),
        isNull(regrasNegocio.estabelecimentoId)
      )
    ))
    .orderBy(regrasNegocio.prioridade);
  
  const alertasParaCriar: InsertAlertaDivergencia[] = [];
  let totalViolacoes = 0;
  
  for (const regra of regras) {
    // Verificar se o procedimento principal está na conta
    const procPrincipal = codigosPresentes.get(regra.codigoProcedimentoPrincipal);
    
    if (!procPrincipal) continue; // Regra não se aplica a esta conta
    
    // Buscar itens da regra
    const itensRegra = await db.select()
      .from(itensRegraNegocio)
      .where(eq(itensRegraNegocio.regraId, regra.id));
    
    for (const itemRegra of itensRegra) {
      const itemPresente = codigosPresentes.get(itemRegra.codigoItem);
      
      if (regra.tipoVerificacao === "deve_conter" && itemRegra.obrigatorio === "sim") {
        if (!itemPresente) {
          // Item obrigatório não encontrado
          alertasParaCriar.push({
            arquivoId,
            regraId: regra.id,
            tipoAlerta: "item_faltante",
            severidade: "alta",
            titulo: `Item obrigatório faltando: ${itemRegra.codigoItem}`,
            descricao: `A regra "${regra.nome}" exige que o procedimento ${regra.codigoProcedimentoPrincipal} tenha o item ${itemRegra.codigoItem} (${itemRegra.descricaoItem || ""}), mas ele não foi encontrado na conta.`,
            codigoItem: itemRegra.codigoItem,
            descricaoItem: itemRegra.descricaoItem || undefined,
            valorEsperado: itemRegra.valorEsperado?.toString(),
            sugestaoCorrecao: `Adicionar o item ${itemRegra.codigoItem} à conta.`,
            status: "pendente"
          });
          totalViolacoes++;
        } else if (itemRegra.quantidadeMinima && itemPresente.quantidade < itemRegra.quantidadeMinima) {
          // Quantidade insuficiente
          alertasParaCriar.push({
            arquivoId,
            regraId: regra.id,
            tipoAlerta: "quantidade_incorreta",
            severidade: "media",
            titulo: `Quantidade insuficiente: ${itemRegra.codigoItem}`,
            descricao: `A regra "${regra.nome}" exige no mínimo ${itemRegra.quantidadeMinima} unidades de ${itemRegra.codigoItem}, mas foram encontradas apenas ${itemPresente.quantidade}.`,
            codigoItem: itemRegra.codigoItem,
            descricaoItem: itemRegra.descricaoItem || undefined,
            sugestaoCorrecao: `Aumentar a quantidade de ${itemRegra.codigoItem} para ${itemRegra.quantidadeMinima}.`,
            status: "pendente"
          });
          totalViolacoes++;
        }
      } else if (regra.tipoVerificacao === "nao_deve_conter" && itemPresente) {
        // Item proibido encontrado
        alertasParaCriar.push({
          arquivoId,
          regraId: regra.id,
          tipoAlerta: "item_nao_permitido",
          severidade: "alta",
          titulo: `Item não permitido: ${itemRegra.codigoItem}`,
          descricao: `A regra "${regra.nome}" indica que o procedimento ${regra.codigoProcedimentoPrincipal} NÃO deve ter o item ${itemRegra.codigoItem}, mas ele foi encontrado na conta.`,
          codigoItem: itemRegra.codigoItem,
          descricaoItem: itemRegra.descricaoItem || undefined,
          valorCobrado: itemPresente.valor.toString(),
          sugestaoCorrecao: `Remover o item ${itemRegra.codigoItem} da conta.`,
          status: "pendente"
        });
        totalViolacoes++;
      } else if (regra.tipoVerificacao === "quantidade_maxima" && itemPresente) {
        if (itemRegra.quantidadeMaxima && itemPresente.quantidade > itemRegra.quantidadeMaxima) {
          // Quantidade excedida
          alertasParaCriar.push({
            arquivoId,
            regraId: regra.id,
            tipoAlerta: "quantidade_incorreta",
            severidade: "media",
            titulo: `Quantidade excedida: ${itemRegra.codigoItem}`,
            descricao: `A regra "${regra.nome}" permite no máximo ${itemRegra.quantidadeMaxima} unidades de ${itemRegra.codigoItem}, mas foram encontradas ${itemPresente.quantidade}.`,
            codigoItem: itemRegra.codigoItem,
            descricaoItem: itemRegra.descricaoItem || undefined,
            sugestaoCorrecao: `Reduzir a quantidade de ${itemRegra.codigoItem} para ${itemRegra.quantidadeMaxima}.`,
            status: "pendente"
          });
          totalViolacoes++;
        }
      }
    }
  }
  
  // Criar alertas em batch
  if (alertasParaCriar.length > 0) {
    await createAlertasDivergenciaBatch(alertasParaCriar);
  }
  
  return {
    alertas: alertasParaCriar,
    resumo: {
      total: regras.length,
      violacoes: totalViolacoes
    }
  };
}

// ==================== PADRÕES DE CONTA (IA) ====================

// Atualizar padrões de conta baseado em contas processadas
export async function atualizarPadroesContas(convenioId: number, estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return;
  
  // Buscar arquivos do convênio
  const arquivosConvenio = await db.select()
    .from(arquivos)
    .where(and(
      eq(arquivos.convenioId, convenioId),
      eq(arquivos.direcao, "enviado"),
      eq(arquivos.status, "processado")
    ))
    .limit(100); // Últimos 100 arquivos
  
  if (arquivosConvenio.length === 0) return;
  
  // Buscar todos os procedimentos desses arquivos
  const arquivoIds = arquivosConvenio.map(a => a.id);
  const todosProcs = await db.select()
    .from(procedimentos)
    .where(inArray(procedimentos.arquivoId, arquivoIds));
  
  // Agrupar por guia para identificar contas
  const contasPorGuia = new Map<string, typeof todosProcs>();
  for (const proc of todosProcs) {
    const guia = proc.guiaNumero || `arquivo_${proc.arquivoId}`;
    const existing = contasPorGuia.get(guia) || [];
    existing.push(proc);
    contasPorGuia.set(guia, existing);
  }
  
  // Analisar padrões
  const padroes = new Map<string, {
    codigoPrincipal: string;
    descricao: string;
    itensAssociados: Map<string, { codigo: string; descricao: string; ocorrencias: number; valorTotal: number }>;
    totalOcorrencias: number;
    valorTotalContas: number;
  }>();
  
  for (const [guia, procsGuia] of Array.from(contasPorGuia)) {
    // Identificar procedimento principal (maior valor ou primeiro)
    const procPrincipal = procsGuia.reduce((a: any, b: any) => 
      parseFloat(a.valorTotal || "0") > parseFloat(b.valorTotal || "0") ? a : b
    );
    
    const key = procPrincipal.codigo;
    const padrao = padroes.get(key) || {
      codigoPrincipal: procPrincipal.codigo,
      descricao: procPrincipal.descricao || "",
      itensAssociados: new Map<string, { codigo: string; descricao: string; ocorrencias: number; valorTotal: number }>(),
      totalOcorrencias: 0,
      valorTotalContas: 0
    };
    
    padrao.totalOcorrencias++;
    padrao.valorTotalContas += procsGuia.reduce((sum: number, p: any) => sum + parseFloat(p.valorTotal || "0"), 0);
    
    // Registrar itens associados
    for (const proc of procsGuia) {
      if (proc.codigo === procPrincipal.codigo) continue;
      
      const item = padrao.itensAssociados.get(proc.codigo) || {
        codigo: proc.codigo,
        descricao: proc.descricao || "",
        ocorrencias: 0,
        valorTotal: 0
      };
      item.ocorrencias++;
      item.valorTotal += parseFloat(proc.valorTotal || "0");
      padrao.itensAssociados.set(proc.codigo, item);
    }
    
    padroes.set(key, padrao);
  }
  
  // Salvar padrões no banco
  for (const [codigo, padrao] of Array.from(padroes)) {
    if (padrao.totalOcorrencias < 3) continue; // Ignorar padrões com poucas ocorrências
    
    type ItemAssociado = { codigo: string; descricao: string; ocorrencias: number; valorTotal: number };
    const itensArray = (Array.from(padrao.itensAssociados.values()) as ItemAssociado[])
      .filter(item => item.ocorrencias >= 2) // Itens que aparecem em pelo menos 2 contas
      .map(item => ({
        codigo: item.codigo,
        descricao: item.descricao,
        frequencia: Math.round((item.ocorrencias / padrao.totalOcorrencias) * 100),
        valorMedio: item.valorTotal / item.ocorrencias
      }))
      .sort((a, b) => b.frequencia - a.frequencia);
    
    // Verificar se já existe padrão
    const existente = await db.select()
      .from(padroesContas)
      .where(and(
        eq(padroesContas.convenioId, convenioId),
        eq(padroesContas.codigoProcedimentoPrincipal, codigo)
      ))
      .limit(1);
    
    if (existente.length > 0) {
      // Atualizar
      await db.update(padroesContas)
        .set({
          itensAssociados: itensArray,
          totalOcorrencias: padrao.totalOcorrencias,
          valorMedioConta: (padrao.valorTotalContas / padrao.totalOcorrencias).toFixed(2),
          ultimaAtualizacao: new Date()
        })
        .where(eq(padroesContas.id, existente[0].id));
    } else {
      // Criar
      await db.insert(padroesContas).values({
        convenioId,
        estabelecimentoId,
        codigoProcedimentoPrincipal: codigo,
        descricaoProcedimentoPrincipal: padrao.descricao,
        itensAssociados: itensArray,
        totalOcorrencias: padrao.totalOcorrencias,
        valorMedioConta: (padrao.valorTotalContas / padrao.totalOcorrencias).toFixed(2)
      });
    }
  }
}

// Sugerir itens faltantes baseado em padrões
export async function sugerirItensFaltantes(arquivoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar arquivo e convênio
  const arquivo = await db.select().from(arquivos).where(eq(arquivos.id, arquivoId)).limit(1);
  if (arquivo.length === 0) return [];
  
  const convenioId = arquivo[0].convenioId;
  
  // Buscar procedimentos do arquivo
  const procs = await db.select().from(procedimentos).where(eq(procedimentos.arquivoId, arquivoId));
  
  // Criar set de códigos presentes
  const codigosPresentes = new Set(procs.map(p => p.codigo));
  
  // Buscar padrões para os procedimentos principais
  const sugestoes: Array<{
    codigoPrincipal: string;
    itemSugerido: string;
    descricaoItem: string;
    frequencia: number;
    valorMedio: number;
    motivo: string;
  }> = [];
  
  for (const proc of procs) {
    const padrao = await db.select()
      .from(padroesContas)
      .where(and(
        eq(padroesContas.convenioId, convenioId),
        eq(padroesContas.codigoProcedimentoPrincipal, proc.codigo)
      ))
      .limit(1);
    
    if (padrao.length === 0) continue;
    
    const itensAssociados = padrao[0].itensAssociados as Array<{
      codigo: string;
      descricao: string;
      frequencia: number;
      valorMedio: number;
    }> || [];
    
    for (const item of itensAssociados) {
      if (item.frequencia >= 70 && !codigosPresentes.has(item.codigo)) {
        sugestoes.push({
          codigoPrincipal: proc.codigo,
          itemSugerido: item.codigo,
          descricaoItem: item.descricao,
          frequencia: item.frequencia,
          valorMedio: item.valorMedio,
          motivo: `Este item aparece em ${item.frequencia}% das contas com o procedimento ${proc.codigo}`
        });
      }
    }
  }
  
  return sugestoes;
}

// Resumo de alertas por arquivo
export async function getResumoAlertasArquivo(arquivoId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const alertas = await db.select()
    .from(alertasDivergencia)
    .where(eq(alertasDivergencia.arquivoId, arquivoId));
  
  const resumo = {
    total: alertas.length,
    pendentes: 0,
    corrigidos: 0,
    ignorados: 0,
    porTipo: {} as Record<string, number>,
    porSeveridade: {} as Record<string, number>,
    valorTotalDivergencia: 0
  };
  
  for (const alerta of alertas) {
    if (alerta.status === "pendente") resumo.pendentes++;
    else if (alerta.status === "corrigido") resumo.corrigidos++;
    else if (alerta.status === "ignorado") resumo.ignorados++;
    
    resumo.porTipo[alerta.tipoAlerta] = (resumo.porTipo[alerta.tipoAlerta] || 0) + 1;
    resumo.porSeveridade[alerta.severidade] = (resumo.porSeveridade[alerta.severidade] || 0) + 1;
    
    if (alerta.diferenca) {
      resumo.valorTotalDivergencia += Math.abs(parseFloat(alerta.diferenca));
    }
  }
  
  return resumo;
}


// ============================================
// Histórico de Validações
// ============================================

// Salvar resultado de validação no histórico
export async function salvarHistoricoValidacao(dados: {
  arquivoId: number;
  convenioId: number;
  userId: number;
  totalItens: number;
  divergenciasPreco: number;
  violacoesRegras: number;
  sugestoesIA: number;
  valorDiferenca: number;
  detalhes: any;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(historicoValidacoes).values({
    arquivoId: dados.arquivoId,
    convenioId: dados.convenioId,
    userId: dados.userId,
    totalItens: dados.totalItens,
    divergenciasPreco: dados.divergenciasPreco,
    violacoesRegras: dados.violacoesRegras,
    sugestoesIA: dados.sugestoesIA,
    valorDiferenca: dados.valorDiferenca.toString(),
    detalhes: dados.detalhes,
    status: "concluida"
  });
  
  return result;
}

// Listar histórico de validações
export async function listarHistoricoValidacoes(filtros?: {
  convenioId?: number;
  arquivoId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(historicoValidacoes);
  
  const conditions = [];
  if (filtros?.convenioId) {
    conditions.push(eq(historicoValidacoes.convenioId, filtros.convenioId));
  }
  if (filtros?.arquivoId) {
    conditions.push(eq(historicoValidacoes.arquivoId, filtros.arquivoId));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  const result = await query
    .orderBy(desc(historicoValidacoes.createdAt))
    .limit(filtros?.limit || 50);
  
  return result;
}

// Buscar validação por ID
export async function getHistoricoValidacao(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select()
    .from(historicoValidacoes)
    .where(eq(historicoValidacoes.id, id))
    .limit(1);
  
  return result[0] || null;
}


// ============ PERMISSÕES DE ESTABELECIMENTO ============

/**
 * Busca as permissões de um usuário para todos os estabelecimentos
 */
export async function getPermissoesUsuario(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const permissoes = await db
    .select({
      id: permissoesEstabelecimento.id,
      userId: permissoesEstabelecimento.userId,
      estabelecimentoId: permissoesEstabelecimento.estabelecimentoId,
      grupoServico: permissoesEstabelecimento.grupoServico,
      podeVisualizar: permissoesEstabelecimento.podeVisualizar,
      podeEditar: permissoesEstabelecimento.podeEditar,
      podeExcluir: permissoesEstabelecimento.podeExcluir,
      podeGerenciar: permissoesEstabelecimento.podeGerenciar,
      acessoDashboard: permissoesEstabelecimento.acessoDashboard,
      acessoArquivos: permissoesEstabelecimento.acessoArquivos,
      acessoComparacoes: permissoesEstabelecimento.acessoComparacoes,
      acessoFaturamento: permissoesEstabelecimento.acessoFaturamento,
      acessoTabelasPreco: permissoesEstabelecimento.acessoTabelasPreco,
      acessoAnaliseGlosa: permissoesEstabelecimento.acessoAnaliseGlosa,
      acessoDicionarioGlosas: permissoesEstabelecimento.acessoDicionarioGlosas,
      acessoRecursosGlosa: permissoesEstabelecimento.acessoRecursosGlosa,
      acessoConvenios: permissoesEstabelecimento.acessoConvenios,
      acessoRegrasNegocio: permissoesEstabelecimento.acessoRegrasNegocio,
      acessoProdutividade: permissoesEstabelecimento.acessoProdutividade,
      acessoEstabelecimentos: permissoesEstabelecimento.acessoEstabelecimentos,
      acessoPermissoes: permissoesEstabelecimento.acessoPermissoes,
      estabelecimentoNome: estabelecimentos.nome,
    })
    .from(permissoesEstabelecimento)
    .leftJoin(estabelecimentos, eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentos.id))
    .where(eq(permissoesEstabelecimento.userId, userId));

  return permissoes;
}

/**
 * Busca os IDs dos estabelecimentos que um usuário pode acessar
 */
export async function getEstabelecimentosPermitidos(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const permissoes = await db
    .select({ estabelecimentoId: permissoesEstabelecimento.estabelecimentoId })
    .from(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, userId),
      eq(permissoesEstabelecimento.podeVisualizar, "sim")
    ));

  return permissoes.map(p => p.estabelecimentoId);
}

/**
 * Verifica se um usuário é gestor (tem acesso a todos os estabelecimentos ou permissão de gerenciar)
 */
export async function verificarSeGestor(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verificar se o usuário é admin
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === "admin") return true;

  // Verificar se tem permissão de gerenciar em algum estabelecimento
  const permissoes = await db
    .select()
    .from(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, userId),
      eq(permissoesEstabelecimento.podeGerenciar, "sim")
    ))
    .limit(1);

  return permissoes.length > 0;
}

/**
 * Verifica se um usuário pode acessar um estabelecimento específico
 */
export async function verificarPermissaoEstabelecimento(
  userId: number,
  estabelecimentoId: number,
  tipoPermissao: "visualizar" | "editar" | "excluir" | "gerenciar" = "visualizar"
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Admins têm acesso total
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === "admin") return true;

  const [permissao] = await db
    .select()
    .from(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, userId),
      eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentoId)
    ))
    .limit(1);

  if (!permissao) return false;

  switch (tipoPermissao) {
    case "visualizar":
      return permissao.podeVisualizar === "sim";
    case "editar":
      return permissao.podeEditar === "sim";
    case "excluir":
      return permissao.podeExcluir === "sim";
    case "gerenciar":
      return permissao.podeGerenciar === "sim";
    default:
      return false;
  }
}

/**
 * Cria ou atualiza permissão de um usuário para um estabelecimento
 */
export async function upsertPermissaoEstabelecimento(data: InsertPermissaoEstabelecimento) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verificar se já existe
  const [existente] = await db
    .select()
    .from(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, data.userId),
      eq(permissoesEstabelecimento.estabelecimentoId, data.estabelecimentoId)
    ))
    .limit(1);

  if (existente) {
    // Atualizar
    await db
      .update(permissoesEstabelecimento)
      .set({
        grupoServico: data.grupoServico,
        podeVisualizar: data.podeVisualizar,
        podeEditar: data.podeEditar,
        podeExcluir: data.podeExcluir,
        podeGerenciar: data.podeGerenciar,
        acessoDashboard: data.acessoDashboard,
        acessoArquivos: data.acessoArquivos,
        acessoComparacoes: data.acessoComparacoes,
        acessoFaturamento: data.acessoFaturamento,
        acessoTabelasPreco: data.acessoTabelasPreco,
        acessoAnaliseGlosa: data.acessoAnaliseGlosa,
        acessoDicionarioGlosas: data.acessoDicionarioGlosas,
        acessoRecursosGlosa: data.acessoRecursosGlosa,
        acessoConvenios: data.acessoConvenios,
        acessoRegrasNegocio: data.acessoRegrasNegocio,
        acessoProdutividade: data.acessoProdutividade,
        acessoEstabelecimentos: data.acessoEstabelecimentos,
        acessoPermissoes: data.acessoPermissoes,
      })
      .where(eq(permissoesEstabelecimento.id, existente.id));
    return { id: existente.id, updated: true };
  } else {
    // Criar
    const result = await db.insert(permissoesEstabelecimento).values(data);
    return { id: Number(result[0].insertId), updated: false };
  }
}

/**
 * Cria permissão de um usuário para um estabelecimento
 */
export async function criarPermissaoEstabelecimento(data: {
  usuarioId: number;
  estabelecimentoId: number;
  grupoId?: number;
  podeVisualizar?: boolean;
  podeEditar?: boolean;
  podeExcluir?: boolean;
  podeGerenciar?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar grupo de serviço se fornecido
  type GrupoServicoType = "administrador" | "faturista" | "recurso_glosa" | "gestor" | "visualizador";
  let grupoServico: GrupoServicoType = "visualizador";
  
  if (data.grupoId) {
    const [grupo] = await db
      .select()
      .from(gruposServico)
      .where(eq(gruposServico.id, data.grupoId))
      .limit(1);
    if (grupo) {
      const nomeNormalizado = grupo.nome.toLowerCase().replace(/\s+/g, "_");
      // Mapear para valores válidos do enum
      const grupoMap: Record<string, GrupoServicoType> = {
        "administrador": "administrador",
        "faturista": "faturista",
        "recurso_glosa": "recurso_glosa",
        "recurso_de_glosa": "recurso_glosa",
        "gestor": "gestor",
        "visualizador": "visualizador",
      };
      grupoServico = grupoMap[nomeNormalizado] || "visualizador";
    }
  }

  const result = await db.insert(permissoesEstabelecimento).values({
    userId: data.usuarioId,
    estabelecimentoId: data.estabelecimentoId,
    grupoServico,
    podeVisualizar: data.podeVisualizar ? "sim" : "nao",
    podeEditar: data.podeEditar ? "sim" : "nao",
    podeExcluir: data.podeExcluir ? "sim" : "nao",
    podeGerenciar: data.podeGerenciar ? "sim" : "nao",
  });
  return { id: Number(result[0].insertId) };
}

/**
 * Remove permissão de um usuário para um estabelecimento
 */
export async function deletePermissaoEstabelecimento(userId: number, estabelecimentoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, userId),
      eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentoId)
    ));
}

/**
 * Lista todos os usuários com suas permissões para um estabelecimento
 */
export async function getUsuariosEstabelecimento(estabelecimentoId: number) {
  const db = await getDb();
  if (!db) return [];

  const permissoes = await db
    .select({
      id: permissoesEstabelecimento.id,
      userId: permissoesEstabelecimento.userId,
      estabelecimentoId: permissoesEstabelecimento.estabelecimentoId,
      grupoServico: permissoesEstabelecimento.grupoServico,
      podeVisualizar: permissoesEstabelecimento.podeVisualizar,
      podeEditar: permissoesEstabelecimento.podeEditar,
      podeExcluir: permissoesEstabelecimento.podeExcluir,
      podeGerenciar: permissoesEstabelecimento.podeGerenciar,
      acessoDashboard: permissoesEstabelecimento.acessoDashboard,
      acessoArquivos: permissoesEstabelecimento.acessoArquivos,
      acessoComparacoes: permissoesEstabelecimento.acessoComparacoes,
      acessoFaturamento: permissoesEstabelecimento.acessoFaturamento,
      acessoTabelasPreco: permissoesEstabelecimento.acessoTabelasPreco,
      acessoAnaliseGlosa: permissoesEstabelecimento.acessoAnaliseGlosa,
      acessoDicionarioGlosas: permissoesEstabelecimento.acessoDicionarioGlosas,
      acessoRecursosGlosa: permissoesEstabelecimento.acessoRecursosGlosa,
      acessoConvenios: permissoesEstabelecimento.acessoConvenios,
      acessoRegrasNegocio: permissoesEstabelecimento.acessoRegrasNegocio,
      acessoProdutividade: permissoesEstabelecimento.acessoProdutividade,
      acessoEstabelecimentos: permissoesEstabelecimento.acessoEstabelecimentos,
      acessoPermissoes: permissoesEstabelecimento.acessoPermissoes,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    })
    .from(permissoesEstabelecimento)
    .leftJoin(users, eq(permissoesEstabelecimento.userId, users.id))
    .where(eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentoId));

  return permissoes;
}

/**
 * Concede acesso a todos os estabelecimentos para um usuário (para gestores)
 */
export async function concederAcessoTodosEstabelecimentos(
  userId: number,
  permissoes: { podeVisualizar?: "sim" | "nao"; podeEditar?: "sim" | "nao"; podeExcluir?: "sim" | "nao"; podeGerenciar?: "sim" | "nao" } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const todosEstabelecimentos = await db.select({ id: estabelecimentos.id }).from(estabelecimentos);

  for (const est of todosEstabelecimentos) {
    await upsertPermissaoEstabelecimento({
      userId,
      estabelecimentoId: est.id,
      podeVisualizar: permissoes.podeVisualizar || "sim",
      podeEditar: permissoes.podeEditar || "nao",
      podeExcluir: permissoes.podeExcluir || "nao",
      podeGerenciar: permissoes.podeGerenciar || "nao",
    });
  }
}

/**
 * Busca dados consolidados de todos os estabelecimentos (para dashboard de gestores)
 */
export async function getDadosConsolidados(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // Verificar se é gestor
  const isGestor = await verificarSeGestor(userId);
  if (!isGestor) return null;

  // Buscar todos os estabelecimentos ativos
  const todosEstabelecimentos = await db
    .select()
    .from(estabelecimentos)
    .where(eq(estabelecimentos.ativo, "sim"));

  const dadosConsolidados = {
    estabelecimentos: [] as any[],
    totais: {
      totalArquivos: 0,
      totalProcedimentos: 0,
      valorTotalFaturado: 0,
      valorTotalGlosado: 0,
      valorTotalPago: 0,
      percentualGlosa: 0,
    },
  };

  for (const est of todosEstabelecimentos) {
    // Contar arquivos
    const [arquivosCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(arquivos)
      .where(eq(arquivos.estabelecimentoId, est.id));

    // Buscar procedimentos e valores
    const arquivosEst = await db
      .select({ id: arquivos.id })
      .from(arquivos)
      .where(eq(arquivos.estabelecimentoId, est.id));

    let totalProcedimentos = 0;
    let valorFaturado = 0;
    let valorGlosado = 0;
    let valorPago = 0;

    if (arquivosEst.length > 0) {
      const arquivoIds = arquivosEst.map(a => a.id);
      
      const procs = await db
        .select({
          count: sql<number>`count(*)`,
          valorTotal: sql<number>`SUM(CAST(valorTotal AS DECIMAL(12,2)))`,
          valorGlosado: sql<number>`SUM(CAST(valorGlosado AS DECIMAL(12,2)))`,
        })
        .from(procedimentos)
        .where(inArray(procedimentos.arquivoId, arquivoIds));

      totalProcedimentos = procs[0]?.count || 0;
      valorFaturado = procs[0]?.valorTotal || 0;
      valorGlosado = procs[0]?.valorGlosado || 0;
      valorPago = valorFaturado - valorGlosado;
    }

    // Contar convênios
    const [conveniosCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(convenios)
      .where(eq(convenios.estabelecimentoId, est.id));

    dadosConsolidados.estabelecimentos.push({
      id: est.id,
      nome: est.nome,
      cnpj: est.cnpj,
      totalArquivos: arquivosCount?.count || 0,
      totalConvenios: conveniosCount?.count || 0,
      totalProcedimentos,
      valorFaturado,
      valorGlosado,
      valorPago,
      percentualGlosa: valorFaturado > 0 ? (valorGlosado / valorFaturado) * 100 : 0,
    });

    // Acumular totais
    dadosConsolidados.totais.totalArquivos += arquivosCount?.count || 0;
    dadosConsolidados.totais.totalProcedimentos += totalProcedimentos;
    dadosConsolidados.totais.valorTotalFaturado += valorFaturado;
    dadosConsolidados.totais.valorTotalGlosado += valorGlosado;
    dadosConsolidados.totais.valorTotalPago += valorPago;
  }

  // Calcular percentual de glosa total
  if (dadosConsolidados.totais.valorTotalFaturado > 0) {
    dadosConsolidados.totais.percentualGlosa = 
      (dadosConsolidados.totais.valorTotalGlosado / dadosConsolidados.totais.valorTotalFaturado) * 100;
  }

  return dadosConsolidados;
}

/**
 * Busca comparativo de glosas entre estabelecimentos
 */
export async function getComparativoGlosasEstabelecimentos(userId: number, periodo?: { inicio: Date; fim: Date }) {
  const db = await getDb();
  if (!db) return null;

  // Verificar se é gestor
  const isGestor = await verificarSeGestor(userId);
  if (!isGestor) return null;

  const todosEstabelecimentos = await db
    .select()
    .from(estabelecimentos)
    .where(eq(estabelecimentos.ativo, "sim"));

  const comparativo = [];

  for (const est of todosEstabelecimentos) {
    const conditions: any[] = [eq(arquivos.estabelecimentoId, est.id)];
    
    if (periodo) {
      conditions.push(gte(arquivos.dataReferencia, periodo.inicio));
      conditions.push(lte(arquivos.dataReferencia, periodo.fim));
    }

    const arquivosEst = await db
      .select({ id: arquivos.id })
      .from(arquivos)
      .where(and(...conditions));

    if (arquivosEst.length === 0) {
      comparativo.push({
        estabelecimentoId: est.id,
        estabelecimentoNome: est.nome,
        totalProcedimentos: 0,
        valorFaturado: 0,
        valorGlosado: 0,
        percentualGlosa: 0,
        topMotivosGlosa: [],
      });
      continue;
    }

    const arquivoIds = arquivosEst.map(a => a.id);

    // Buscar procedimentos
    const procs = await db
      .select()
      .from(procedimentos)
      .where(inArray(procedimentos.arquivoId, arquivoIds));

    let valorFaturado = 0;
    let valorGlosado = 0;
    const motivosGlosa: { [key: string]: { count: number; valor: number } } = {};

    for (const proc of procs) {
      valorFaturado += parseFloat(proc.valorTotal || "0");
      const glosa = parseFloat(proc.valorGlosado || "0");
      if (glosa > 0) {
        valorGlosado += glosa;
        const motivo = proc.motivoGlosa || "Não especificado";
        if (!motivosGlosa[motivo]) {
          motivosGlosa[motivo] = { count: 0, valor: 0 };
        }
        motivosGlosa[motivo].count++;
        motivosGlosa[motivo].valor += glosa;
      }
    }

    // Top 5 motivos de glosa
    const topMotivos = Object.entries(motivosGlosa)
      .sort((a, b) => b[1].valor - a[1].valor)
      .slice(0, 5)
      .map(([motivo, dados]) => ({
        motivo,
        quantidade: dados.count,
        valor: dados.valor,
      }));

    comparativo.push({
      estabelecimentoId: est.id,
      estabelecimentoNome: est.nome,
      totalProcedimentos: procs.length,
      valorFaturado,
      valorGlosado,
      percentualGlosa: valorFaturado > 0 ? (valorGlosado / valorFaturado) * 100 : 0,
      topMotivosGlosa: topMotivos,
    });
  }

  return comparativo.sort((a, b) => b.valorGlosado - a.valorGlosado);
}


// ==================== MÉTRICAS DE PRODUTIVIDADE ====================

/**
 * Busca métricas de produtividade de classificação de glosas
 */
export async function getMetricasProdutividade(filters: {
  userId?: number;
  estabelecimentoId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}): Promise<{
  porDia: Array<{
    data: string;
    totalClassificados: number;
    aceitas: number;
    recursadas: number;
    valorAceito: number;
    valorRecursado: number;
  }>;
  porUsuario: Array<{
    userId: number;
    userName: string;
    totalClassificados: number;
    aceitas: number;
    recursadas: number;
    valorAceito: number;
    valorRecursado: number;
    tempoMedioClassificacao: number;
  }>;
  totais: {
    totalClassificados: number;
    totalAceitas: number;
    totalRecursadas: number;
    totalPendentes: number;
    valorTotalAceito: number;
    valorTotalRecursado: number;
    taxaClassificacao: number;
  };
}> {
  const db = await getDb();
  if (!db) return {
    porDia: [],
    porUsuario: [],
    totais: {
      totalClassificados: 0,
      totalAceitas: 0,
      totalRecursadas: 0,
      totalPendentes: 0,
      valorTotalAceito: 0,
      valorTotalRecursado: 0,
      taxaClassificacao: 0,
    },
  };

  // Buscar decisões de glosa
  const conditions: any[] = [];
  
  if (filters.dataInicio) {
    conditions.push(gte(decisoesGlosa.createdAt, filters.dataInicio));
  }
  
  if (filters.dataFim) {
    conditions.push(lte(decisoesGlosa.createdAt, filters.dataFim));
  }

  const decisoes = await db
    .select()
    .from(decisoesGlosa)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(decisoesGlosa.createdAt));

  // Buscar usuários para mapear nomes
  const userIds = Array.from(new Set(decisoes.filter(d => d.userId).map(d => d.userId!)));
  const usuarios = userIds.length > 0 ? await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds)) : [];
  const userMap = new Map(usuarios.map(u => [u.id, u.name]));

  // Agrupar por dia
  const porDiaMap: { [key: string]: {
    totalClassificados: number;
    aceitas: number;
    recursadas: number;
    valorAceito: number;
    valorRecursado: number;
  }} = {};

  // Agrupar por usuário
  const porUsuarioMap: { [key: number]: {
    totalClassificados: number;
    aceitas: number;
    recursadas: number;
    valorAceito: number;
    valorRecursado: number;
    timestamps: number[];
  }} = {};

  let totalAceitas = 0;
  let totalRecursadas = 0;
  let valorTotalAceito = 0;
  let valorTotalRecursado = 0;

  for (const decisao of decisoes) {
    const data = decisao.createdAt ? new Date(decisao.createdAt).toISOString().split('T')[0] : 'N/A';
    const valor = parseFloat(String(decisao.valorGlosado || 0));
    const isAceita = decisao.decisao === 'aceitar';
    const isRecursada = decisao.decisao === 'recursar';

    // Por dia
    if (!porDiaMap[data]) {
      porDiaMap[data] = { totalClassificados: 0, aceitas: 0, recursadas: 0, valorAceito: 0, valorRecursado: 0 };
    }
    porDiaMap[data].totalClassificados++;
    if (isAceita) {
      porDiaMap[data].aceitas++;
      porDiaMap[data].valorAceito += valor;
      totalAceitas++;
      valorTotalAceito += valor;
    }
    if (isRecursada) {
      porDiaMap[data].recursadas++;
      porDiaMap[data].valorRecursado += valor;
      totalRecursadas++;
      valorTotalRecursado += valor;
    }

    // Por usuário
    if (decisao.userId) {
      if (!porUsuarioMap[decisao.userId]) {
        porUsuarioMap[decisao.userId] = { 
          totalClassificados: 0, aceitas: 0, recursadas: 0, 
          valorAceito: 0, valorRecursado: 0, timestamps: [] 
        };
      }
      porUsuarioMap[decisao.userId].totalClassificados++;
      if (decisao.createdAt) {
        porUsuarioMap[decisao.userId].timestamps.push(new Date(decisao.createdAt).getTime());
      }
      if (isAceita) {
        porUsuarioMap[decisao.userId].aceitas++;
        porUsuarioMap[decisao.userId].valorAceito += valor;
      }
      if (isRecursada) {
        porUsuarioMap[decisao.userId].recursadas++;
        porUsuarioMap[decisao.userId].valorRecursado += valor;
      }
    }
  }

  // Converter para arrays
  const porDia = Object.entries(porDiaMap)
    .map(([data, dados]) => ({ data, ...dados }))
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-30); // Últimos 30 dias

  const porUsuario = Object.entries(porUsuarioMap)
    .map(([userId, dados]) => {
      // Calcular tempo médio entre classificações
      let tempoMedioClassificacao = 0;
      if (dados.timestamps.length > 1) {
        const sortedTimestamps = dados.timestamps.sort((a, b) => a - b);
        let totalDiff = 0;
        for (let i = 1; i < sortedTimestamps.length; i++) {
          totalDiff += sortedTimestamps[i] - sortedTimestamps[i - 1];
        }
        tempoMedioClassificacao = totalDiff / (sortedTimestamps.length - 1) / 1000; // Em segundos
      }

      return {
        userId: parseInt(userId),
        userName: userMap.get(parseInt(userId)) || `Usuário ${userId}`,
        totalClassificados: dados.totalClassificados,
        aceitas: dados.aceitas,
        recursadas: dados.recursadas,
        valorAceito: dados.valorAceito,
        valorRecursado: dados.valorRecursado,
        tempoMedioClassificacao,
      };
    })
    .sort((a, b) => b.totalClassificados - a.totalClassificados);

  // Buscar total de itens pendentes
  const arquivosRetornados = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(and(
      eq(arquivos.direcao, "retornado"),
      eq(arquivos.status, "processado")
    ));

  let totalPendentes = 0;
  if (arquivosRetornados.length > 0) {
    const arquivoIds = arquivosRetornados.map(a => a.id);
    const procsPendentes = await db
      .select({ id: procedimentos.id })
      .from(procedimentos)
      .where(and(
        inArray(procedimentos.arquivoId, arquivoIds),
        or(
          isNull(procedimentos.classificacaoGlosa),
          eq(procedimentos.classificacaoGlosa, "pendente")
        )
      ));
    totalPendentes = procsPendentes.length;
  }

  const totalClassificados = totalAceitas + totalRecursadas;
  const taxaClassificacao = (totalClassificados + totalPendentes) > 0 
    ? (totalClassificados / (totalClassificados + totalPendentes)) * 100 
    : 0;

  return {
    porDia,
    porUsuario,
    totais: {
      totalClassificados,
      totalAceitas,
      totalRecursadas,
      totalPendentes,
      valorTotalAceito,
      valorTotalRecursado,
      taxaClassificacao,
    },
  };
}


// ============================================
// MOTIVOS DE GLOSA PERSONALIZADOS
// ============================================

/**
 * Listar motivos de glosa (personalizados + TISS)
 */
export async function getMotivosGlosa(params: {
  estabelecimentoId?: number;
  tipoOrigem?: "tiss" | "personalizado";
  ativo?: "sim" | "nao";
  search?: string;
}) {
  const conditions = [];
  
  // Filtrar por estabelecimento (null = disponível para todos)
  if (params.estabelecimentoId) {
    conditions.push(
      or(
        eq(motivosGlosa.estabelecimentoId, params.estabelecimentoId),
        isNull(motivosGlosa.estabelecimentoId)
      )
    );
  }
  
  if (params.tipoOrigem) {
    conditions.push(eq(motivosGlosa.tipoOrigem, params.tipoOrigem));
  }
  
  if (params.ativo) {
    conditions.push(eq(motivosGlosa.ativo, params.ativo));
  }
  
  if (params.search) {
    const searchTerm = `%${params.search}%`;
    conditions.push(
      or(
        like(motivosGlosa.codigo, searchTerm),
        like(motivosGlosa.descricao, searchTerm),
        like(motivosGlosa.descricaoSimplificada, searchTerm),
        like(motivosGlosa.grupo, searchTerm)
      )
    );
  }
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const result = whereClause 
    ? await db.select().from(motivosGlosa).where(whereClause).orderBy(motivosGlosa.grupo, motivosGlosa.codigo)
    : await db.select().from(motivosGlosa).orderBy(motivosGlosa.grupo, motivosGlosa.codigo);
  
  return result;
}

/**
 * Buscar motivo de glosa por código
 */
export async function getMotivoGlosaPorCodigo(codigo: string, estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (estabelecimentoId) {
    const result = await db
      .select()
      .from(motivosGlosa)
      .where(and(
        eq(motivosGlosa.codigo, codigo),
        or(
          eq(motivosGlosa.estabelecimentoId, estabelecimentoId),
          isNull(motivosGlosa.estabelecimentoId)
        )
      ))
      .limit(1);
    return result[0] || null;
  } else {
    const result = await db
      .select()
      .from(motivosGlosa)
      .where(eq(motivosGlosa.codigo, codigo))
      .limit(1);
    return result[0] || null;
  }
}

/**
 * Criar novo motivo de glosa
 */
export async function criarMotivoGlosa(data: {
  codigo: string;
  grupo: string;
  descricao: string;
  descricaoSimplificada: string;
  argumentoContestacao?: string;
  acoesRecomendadas?: string[];
  documentosSugeridos?: string[];
  dificuldadeReversao?: number;
  probabilidadeSucesso?: number;
  tipoOrigem?: "tiss" | "personalizado";
  estabelecimentoId?: number;
  criadoPor?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(motivosGlosa).values({
    codigo: data.codigo,
    grupo: data.grupo,
    descricao: data.descricao,
    descricaoSimplificada: data.descricaoSimplificada,
    argumentoContestacao: data.argumentoContestacao,
    acoesRecomendadas: data.acoesRecomendadas,
    documentosSugeridos: data.documentosSugeridos,
    dificuldadeReversao: data.dificuldadeReversao || 3,
    probabilidadeSucesso: data.probabilidadeSucesso || 50,
    tipoOrigem: data.tipoOrigem || "personalizado",
    estabelecimentoId: data.estabelecimentoId,
    criadoPor: data.criadoPor,
  });
  
  return result;
}

/**
 * Atualizar motivo de glosa
 */
export async function atualizarMotivoGlosa(id: number, data: {
  codigo?: string;
  grupo?: string;
  descricao?: string;
  descricaoSimplificada?: string;
  argumentoContestacao?: string;
  acoesRecomendadas?: string[];
  documentosSugeridos?: string[];
  dificuldadeReversao?: number;
  probabilidadeSucesso?: number;
  ativo?: "sim" | "nao";
}) {
  const updateData: any = {};
  
  if (data.codigo !== undefined) updateData.codigo = data.codigo;
  if (data.grupo !== undefined) updateData.grupo = data.grupo;
  if (data.descricao !== undefined) updateData.descricao = data.descricao;
  if (data.descricaoSimplificada !== undefined) updateData.descricaoSimplificada = data.descricaoSimplificada;
  if (data.argumentoContestacao !== undefined) updateData.argumentoContestacao = data.argumentoContestacao;
  if (data.acoesRecomendadas !== undefined) updateData.acoesRecomendadas = data.acoesRecomendadas;
  if (data.documentosSugeridos !== undefined) updateData.documentosSugeridos = data.documentosSugeridos;
  if (data.dificuldadeReversao !== undefined) updateData.dificuldadeReversao = data.dificuldadeReversao;
  if (data.probabilidadeSucesso !== undefined) updateData.probabilidadeSucesso = data.probabilidadeSucesso;
  if (data.ativo !== undefined) updateData.ativo = data.ativo;
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(motivosGlosa)
    .set(updateData)
    .where(eq(motivosGlosa.id, id));
}

/**
 * Excluir motivo de glosa
 */
export async function excluirMotivoGlosa(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(motivosGlosa).where(eq(motivosGlosa.id, id));
}

/**
 * Buscar motivo de glosa combinado (banco + dicionário TISS)
 * Prioriza o banco de dados, depois o dicionário estático
 */
export async function getMotivoGlosaCombinado(codigo: string, estabelecimentoId?: number) {
  // Primeiro tenta buscar no banco
  const motivoBanco = await getMotivoGlosaPorCodigo(codigo, estabelecimentoId);
  if (motivoBanco) {
    return {
      ...motivoBanco,
      fonte: "banco" as const,
    };
  }
  
  // Se não encontrou, busca no dicionário TISS estático
  const { GLOSAS_TISS } = await import("../shared/glossaryGlosas");
  const motivoTiss = GLOSAS_TISS[codigo];
  
  if (motivoTiss) {
    return {
      id: null,
      codigo: motivoTiss.codigo,
      grupo: motivoTiss.grupo,
      descricao: motivoTiss.descricao,
      descricaoSimplificada: motivoTiss.descricaoSimplificada,
      argumentoContestacao: motivoTiss.argumentoContestacao,
      acoesRecomendadas: motivoTiss.acoesRecomendadas,
      documentosSugeridos: motivoTiss.documentosSugeridos,
      dificuldadeReversao: motivoTiss.dificuldadeReversao,
      probabilidadeSucesso: motivoTiss.probabilidadeSucesso,
      tipoOrigem: "tiss" as const,
      estabelecimentoId: null,
      ativo: "sim" as const,
      criadoPor: null,
      createdAt: null,
      updatedAt: null,
      fonte: "tiss" as const,
    };
  }
  
  return null;
}

/**
 * Listar todos os grupos de motivos de glosa disponíveis
 */
export async function getGruposMotivosGlosa(estabelecimentoId?: number) {
  const conditions = [];
  
  if (estabelecimentoId) {
    conditions.push(
      or(
        eq(motivosGlosa.estabelecimentoId, estabelecimentoId),
        isNull(motivosGlosa.estabelecimentoId)
      )
    );
  }
  
  conditions.push(eq(motivosGlosa.ativo, "sim"));
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .selectDistinct({ grupo: motivosGlosa.grupo })
    .from(motivosGlosa)
    .where(and(...conditions))
    .orderBy(motivosGlosa.grupo);
  
  // Combinar com grupos do dicionário TISS
  const { GLOSAS_TISS } = await import("../shared/glossaryGlosas");
  const gruposTiss: string[] = Object.values(GLOSAS_TISS).map(g => g.grupo);
  const gruposBanco: string[] = result.map((r: { grupo: string }) => r.grupo);
  
  const todosGruposSet = new Set<string>([...gruposTiss, ...gruposBanco]);
  const todosGrupos = Array.from(todosGruposSet).sort();
  
  return todosGrupos;
}


// ============ MÉTRICAS DE ENVIO DE XML ============

export interface MetricasEnvioXML {
  resumo: {
    totalArquivos: number;
    totalProcedimentos: number;
    valorTotalFaturado: number;
    arquivosHoje: number;
    valorHoje: number;
  };
  porDia: Array<{
    data: string;
    arquivos: number;
    procedimentos: number;
    valorFaturado: number;
  }>;
  porUsuario: Array<{
    userId: number;
    userName: string;
    totalArquivos: number;
    totalProcedimentos: number;
    valorTotalFaturado: number;
    mediaValorPorArquivo: number;
  }>;
  porConvenio: Array<{
    convenioId: number;
    convenioNome: string;
    totalArquivos: number;
    valorFaturado: number;
  }>;
}

export async function getMetricasEnvioXML(filters: {
  dataInicio?: Date;
  dataFim?: Date;
  estabelecimentoId?: number;
}): Promise<MetricasEnvioXML> {
  const db = await getDb();
  if (!db) return {
    resumo: {
      totalArquivos: 0,
      totalProcedimentos: 0,
      valorTotalFaturado: 0,
      arquivosHoje: 0,
      valorHoje: 0,
    },
    porDia: [],
    porUsuario: [],
    porConvenio: [],
  };

  // Buscar arquivos XML enviados
  const conditions: any[] = [
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];

  if (filters.dataInicio) {
    conditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters.dataFim) {
    conditions.push(lte(arquivos.createdAt, filters.dataFim));
  }
  if (filters.estabelecimentoId) {
    conditions.push(eq(arquivos.estabelecimentoId, filters.estabelecimentoId));
  }

  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...conditions))
    .orderBy(desc(arquivos.createdAt));

  // Buscar usuários
  const userIds = Array.from(new Set(arquivosEnviados.filter(a => a.userId).map(a => a.userId!)));
  const usuariosResult = userIds.length > 0 ? await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds)) : [];
  const userMap = new Map(usuariosResult.map(u => [u.id, u.name]));

  // Buscar convênios
  const convenioIds = Array.from(new Set(arquivosEnviados.filter(a => a.convenioId).map(a => a.convenioId!)));
  const conveniosResult = convenioIds.length > 0 ? await db
    .select({ id: convenios.id, nome: convenios.nome })
    .from(convenios)
    .where(inArray(convenios.id, convenioIds)) : [];
  const convenioMap = new Map(conveniosResult.map(c => [c.id, c.nome]));

  // Calcular métricas
  const hoje = new Date().toISOString().split('T')[0];
  let totalArquivos = 0;
  let totalProcedimentos = 0;
  let valorTotalFaturado = 0;
  let arquivosHoje = 0;
  let valorHoje = 0;

  const porDiaMap: { [key: string]: { arquivos: number; procedimentos: number; valorFaturado: number } } = {};
  const porUsuarioMap: { [key: number]: { totalArquivos: number; totalProcedimentos: number; valorTotalFaturado: number } } = {};
  const porConvenioMap: { [key: number]: { totalArquivos: number; valorFaturado: number } } = {};

  for (const arq of arquivosEnviados) {
    const dataArq = arq.createdAt ? new Date(arq.createdAt).toISOString().split('T')[0] : 'N/A';
    
    // Buscar procedimentos do arquivo
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));
    
    const qtdProcedimentos = procs.length;
    const valorArquivo = procs.reduce((sum, p) => sum + parseFloat(String(p.valorTotal || 0)), 0);

    totalArquivos++;
    totalProcedimentos += qtdProcedimentos;
    valorTotalFaturado += valorArquivo;

    if (dataArq === hoje) {
      arquivosHoje++;
      valorHoje += valorArquivo;
    }

    // Por dia
    if (!porDiaMap[dataArq]) {
      porDiaMap[dataArq] = { arquivos: 0, procedimentos: 0, valorFaturado: 0 };
    }
    porDiaMap[dataArq].arquivos++;
    porDiaMap[dataArq].procedimentos += qtdProcedimentos;
    porDiaMap[dataArq].valorFaturado += valorArquivo;

    // Por usuário
    if (arq.userId) {
      if (!porUsuarioMap[arq.userId]) {
        porUsuarioMap[arq.userId] = { totalArquivos: 0, totalProcedimentos: 0, valorTotalFaturado: 0 };
      }
      porUsuarioMap[arq.userId].totalArquivos++;
      porUsuarioMap[arq.userId].totalProcedimentos += qtdProcedimentos;
      porUsuarioMap[arq.userId].valorTotalFaturado += valorArquivo;
    }

    // Por convênio
    if (arq.convenioId) {
      if (!porConvenioMap[arq.convenioId]) {
        porConvenioMap[arq.convenioId] = { totalArquivos: 0, valorFaturado: 0 };
      }
      porConvenioMap[arq.convenioId].totalArquivos++;
      porConvenioMap[arq.convenioId].valorFaturado += valorArquivo;
    }
  }

  // Converter mapas para arrays
  const porDia = Object.entries(porDiaMap)
    .map(([data, valores]) => ({ data, ...valores }))
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-30); // Últimos 30 dias

  const porUsuario = Object.entries(porUsuarioMap)
    .map(([userId, valores]) => ({
      userId: parseInt(userId),
      userName: userMap.get(parseInt(userId)) || 'Usuário Desconhecido',
      ...valores,
      mediaValorPorArquivo: valores.totalArquivos > 0 ? valores.valorTotalFaturado / valores.totalArquivos : 0,
    }))
    .sort((a, b) => b.valorTotalFaturado - a.valorTotalFaturado);

  const porConvenio = Object.entries(porConvenioMap)
    .map(([convenioId, valores]) => ({
      convenioId: parseInt(convenioId),
      convenioNome: convenioMap.get(parseInt(convenioId)) || 'Convênio Desconhecido',
      ...valores,
    }))
    .sort((a, b) => b.valorFaturado - a.valorFaturado);

  return {
    resumo: {
      totalArquivos,
      totalProcedimentos,
      valorTotalFaturado,
      arquivosHoje,
      valorHoje,
    },
    porDia,
    porUsuario,
    porConvenio,
  };
}


/**
 * Verifica se um usuário tem acesso a um módulo específico em um estabelecimento
 */
export async function verificarAcessoModulo(
  userId: number,
  estabelecimentoId: number,
  modulo: "dashboard" | "arquivos" | "comparacoes" | "faturamento" | "tabelasPreco" | "analiseGlosa" | "dicionarioGlosas" | "recursosGlosa" | "convenios" | "regrasNegocio" | "produtividade" | "estabelecimentos" | "permissoes"
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Admins têm acesso total
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === "admin") return true;

  const [permissao] = await db
    .select()
    .from(permissoesEstabelecimento)
    .where(and(
      eq(permissoesEstabelecimento.userId, userId),
      eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentoId)
    ))
    .limit(1);

  if (!permissao) return false;

  // Administradores do estabelecimento têm acesso total
  if (permissao.grupoServico === "administrador") return true;

  // Verificar permissão específica do módulo
  const moduloMap: Record<string, keyof typeof permissao> = {
    dashboard: "acessoDashboard",
    arquivos: "acessoArquivos",
    comparacoes: "acessoComparacoes",
    faturamento: "acessoFaturamento",
    tabelasPreco: "acessoTabelasPreco",
    analiseGlosa: "acessoAnaliseGlosa",
    dicionarioGlosas: "acessoDicionarioGlosas",
    recursosGlosa: "acessoRecursosGlosa",
    convenios: "acessoConvenios",
    regrasNegocio: "acessoRegrasNegocio",
    produtividade: "acessoProdutividade",
    estabelecimentos: "acessoEstabelecimentos",
    permissoes: "acessoPermissoes",
  };

  const campo = moduloMap[modulo];
  return campo ? permissao[campo] === "sim" : false;
}

/**
 * Retorna os módulos permitidos para um grupo de serviço
 */
export function getModulosPermitidosPorGrupo(grupoServico: string): Record<string, "sim" | "nao"> {
  const todosModulos = {
    acessoDashboard: "nao" as const,
    acessoArquivos: "nao" as const,
    acessoComparacoes: "nao" as const,
    acessoFaturamento: "nao" as const,
    acessoTabelasPreco: "nao" as const,
    acessoAnaliseGlosa: "nao" as const,
    acessoDicionarioGlosas: "nao" as const,
    acessoRecursosGlosa: "nao" as const,
    acessoConvenios: "nao" as const,
    acessoRegrasNegocio: "nao" as const,
    acessoProdutividade: "nao" as const,
    acessoEstabelecimentos: "nao" as const,
    acessoPermissoes: "nao" as const,
  };

  switch (grupoServico) {
    case "administrador":
      return {
        acessoDashboard: "sim",
        acessoArquivos: "sim",
        acessoComparacoes: "sim",
        acessoFaturamento: "sim",
        acessoTabelasPreco: "sim",
        acessoAnaliseGlosa: "sim",
        acessoDicionarioGlosas: "sim",
        acessoRecursosGlosa: "sim",
        acessoConvenios: "sim",
        acessoRegrasNegocio: "sim",
        acessoProdutividade: "sim",
        acessoEstabelecimentos: "sim",
        acessoPermissoes: "sim",
      };
    case "faturista":
      return {
        ...todosModulos,
        acessoDashboard: "sim",
        acessoArquivos: "sim",
        acessoComparacoes: "sim",
        acessoFaturamento: "sim",
        acessoTabelasPreco: "sim",
        acessoConvenios: "sim",
        acessoRegrasNegocio: "sim",
      };
    case "recurso_glosa":
      return {
        ...todosModulos,
        acessoDashboard: "sim",
        acessoAnaliseGlosa: "sim",
        acessoDicionarioGlosas: "sim",
        acessoRecursosGlosa: "sim",
      };
    case "gestor":
      return {
        ...todosModulos,
        acessoDashboard: "sim",
        acessoFaturamento: "sim",
        acessoAnaliseGlosa: "sim",
        acessoProdutividade: "sim",
      };
    case "visualizador":
    default:
      return {
        ...todosModulos,
        acessoDashboard: "sim",
      };
  }
}

/**
 * Lista todos os usuários do sistema (para seleção ao adicionar permissões)
 */
export async function listarTodosUsuarios() {
  const db = await getDb();
  if (!db) return [];

  const usuarios = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .orderBy(users.name);

  // Buscar contagem de estabelecimentos para cada usuário
  const usuariosComContagem = await Promise.all(
    usuarios.map(async (user) => {
      const permissoes = await db
        .select({ estabelecimentoId: permissoesEstabelecimento.estabelecimentoId })
        .from(permissoesEstabelecimento)
        .where(eq(permissoesEstabelecimento.userId, user.id));
      return {
        ...user,
        estabelecimentosCount: permissoes.length,
      };
    })
  );

  return usuariosComContagem;
}

/**
 * Exclui um usuário do sistema
 */
export async function deleteUsuario(userId: number, adminId: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verificar se o usuário existe
  const [usuario] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!usuario) {
    return { success: false, message: "Usuário não encontrado" };
  }

  // Não permitir excluir a si mesmo
  if (userId === adminId) {
    return { success: false, message: "Você não pode excluir seu próprio usuário" };
  }

  // Verificar se é o owner do sistema (não pode ser excluído)
  const ownerOpenId = process.env.OWNER_OPEN_ID;
  if (usuario.openId === ownerOpenId) {
    return { success: false, message: "O proprietário do sistema não pode ser excluído" };
  }

  // Remover permissões de estabelecimento do usuário
  await db.delete(permissoesEstabelecimento).where(eq(permissoesEstabelecimento.userId, userId));

  // Remover logs de auditoria relacionados ao usuário
  await db.delete(logAuditoriaPermissoes).where(
    or(
      eq(logAuditoriaPermissoes.usuarioId, userId),
      eq(logAuditoriaPermissoes.usuarioAfetadoId, userId)
    )
  );

  // Buscar nome do admin para o log
  const [admin] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);

  // Excluir o usuário
  await db.delete(users).where(eq(users.id, userId));

  // Registrar log de auditoria (o usuário já foi excluído, então usamos o admin como afetado também)
  await db.insert(logAuditoriaPermissoes).values({
    usuarioId: adminId,
    usuarioNome: admin?.name || "Admin",
    usuarioAfetadoId: adminId, // O usuário já foi excluído
    usuarioAfetadoNome: usuario.name || "Usuário excluído",
    tipoAcao: "remover_permissao",
    descricao: `Usuário ${usuario.name} (${usuario.email || usuario.openId}) excluído do sistema`,
  });

  return { success: true, message: "Usuário excluído com sucesso" };
}


// ============================================
// Grupos de Serviço Personalizados
// ============================================

import { gruposServico, logAuditoriaPermissoes, InsertGrupoServico, InsertLogAuditoriaPermissoes } from "../drizzle/schema";

/**
 * Lista todos os grupos de serviço (pré-definidos + personalizados)
 */
export async function listarGruposServico(estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: SQL[] = [eq(gruposServico.ativo, "sim")];
  
  // Filtrar por estabelecimento ou grupos globais
  if (estabelecimentoId) {
    conditions.push(
      or(
        isNull(gruposServico.estabelecimentoId),
        eq(gruposServico.estabelecimentoId, estabelecimentoId)
      )!
    );
  }
  
  const grupos = await db
    .select()
    .from(gruposServico)
    .where(and(...conditions))
    .orderBy(gruposServico.nome);
  
  return grupos;
}

/**
 * Cria um novo grupo de serviço personalizado
 */
export async function criarGrupoServico(dados: InsertGrupoServico) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(gruposServico).values(dados);
  return result[0].insertId;
}

/**
 * Atualiza um grupo de serviço existente
 */
export async function atualizarGrupoServico(id: number, dados: Partial<InsertGrupoServico>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(gruposServico)
    .set(dados)
    .where(eq(gruposServico.id, id));
}

/**
 * Exclui um grupo de serviço (soft delete)
 */
export async function excluirGrupoServico(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se é grupo do sistema
  const grupo = await db.select().from(gruposServico).where(eq(gruposServico.id, id)).limit(1);
  if (grupo[0]?.sistemaGrupo === "sim") {
    throw new Error("Não é possível excluir grupos do sistema");
  }
  
  await db.update(gruposServico)
    .set({ ativo: "nao" })
    .where(eq(gruposServico.id, id));
}

/**
 * Busca um grupo de serviço por ID
 */
export async function buscarGrupoServicoPorId(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const grupos = await db
    .select()
    .from(gruposServico)
    .where(eq(gruposServico.id, id))
    .limit(1);
  
  return grupos[0] || null;
}

// ============================================
// Log de Auditoria de Permissões
// ============================================

/**
 * Registra uma ação no log de auditoria
 */
export async function registrarLogAuditoria(dados: InsertLogAuditoriaPermissoes) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(logAuditoriaPermissoes).values(dados);
}

/**
 * Lista logs de auditoria com filtros
 */
export async function listarLogsAuditoria(filtros: {
  estabelecimentoId?: number;
  usuarioId?: number;
  usuarioAfetadoId?: number;
  tipoAcao?: string;
  dataInicio?: Date;
  dataFim?: Date;
  limite?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  
  const conditions: SQL[] = [];
  
  if (filtros.estabelecimentoId) {
    conditions.push(eq(logAuditoriaPermissoes.estabelecimentoId, filtros.estabelecimentoId));
  }
  if (filtros.usuarioId) {
    conditions.push(eq(logAuditoriaPermissoes.usuarioId, filtros.usuarioId));
  }
  if (filtros.usuarioAfetadoId) {
    conditions.push(eq(logAuditoriaPermissoes.usuarioAfetadoId, filtros.usuarioAfetadoId));
  }
  if (filtros.tipoAcao) {
    conditions.push(eq(logAuditoriaPermissoes.tipoAcao, filtros.tipoAcao as any));
  }
  if (filtros.dataInicio) {
    conditions.push(gte(logAuditoriaPermissoes.createdAt, filtros.dataInicio));
  }
  if (filtros.dataFim) {
    conditions.push(lte(logAuditoriaPermissoes.createdAt, filtros.dataFim));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Contar total
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(logAuditoriaPermissoes)
    .where(whereClause);
  const total = countResult[0]?.count || 0;
  
  // Buscar logs
  let query = db
    .select()
    .from(logAuditoriaPermissoes)
    .where(whereClause)
    .orderBy(desc(logAuditoriaPermissoes.createdAt));
  
  if (filtros.limite) {
    query = query.limit(filtros.limite) as any;
  }
  if (filtros.offset) {
    query = query.offset(filtros.offset) as any;
  }
  
  const logs = await query;
  
  return { logs, total };
}

/**
 * Cria um novo usuário no sistema
 */
export async function criarUsuario(dados: {
  name: string;
  email: string;
  role?: "admin" | "user";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se email já existe
  const existente = await db
    .select()
    .from(users)
    .where(eq(users.email, dados.email))
    .limit(1);
  
  if (existente.length > 0) {
    throw new Error("Email já cadastrado no sistema");
  }
  
  const result = await db.insert(users).values({
    name: dados.name,
    email: dados.email,
    role: dados.role || "user",
    openId: `manual_${Date.now()}`, // Placeholder até login OAuth
  });
  
  return result[0].insertId;
}


// ============ PASSWORD FUNCTIONS ============
import bcrypt from "bcryptjs";

/**
 * Define ou atualiza a senha de um usuário
 */
export async function setUserPassword(userId: number, newPassword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Hash da senha com bcrypt (10 rounds)
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));
  
  return true;
}

/**
 * Verifica se a senha atual do usuário está correta
 */
export async function verifyUserPassword(userId: number, password: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (!user || !user.passwordHash) {
    return false;
  }
  
  return bcrypt.compare(password, user.passwordHash);
}

/**
 * Verifica se o usuário já tem uma senha definida
 */
export async function hasUserPassword(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return !!user?.passwordHash;
}

/**
 * Altera a senha do usuário (requer senha atual)
 */
export async function changeUserPassword(
  userId: number, 
  currentPassword: string, 
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verificar se o usuário tem senha definida
  const hasPassword = await hasUserPassword(userId);
  
  if (hasPassword) {
    // Se tem senha, verificar a senha atual
    const isValid = await verifyUserPassword(userId, currentPassword);
    if (!isValid) {
      return { success: false, message: "Senha atual incorreta" };
    }
  }
  
  // Validar nova senha
  if (newPassword.length < 6) {
    return { success: false, message: "A nova senha deve ter pelo menos 6 caracteres" };
  }
  
  // Definir nova senha
  await setUserPassword(userId, newPassword);
  
  return { success: true, message: "Senha alterada com sucesso" };
}


// ============ ESTABELECIMENTOS DO USUÁRIO ============

/**
 * Busca os estabelecimentos que um usuário tem acesso
 */
export async function getEstabelecimentosUsuario(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      id: estabelecimentos.id,
      nome: estabelecimentos.nome,
      cnpj: estabelecimentos.cnpj,
      endereco: estabelecimentos.endereco,
      podeVisualizar: permissoesEstabelecimento.podeVisualizar,
      podeEditar: permissoesEstabelecimento.podeEditar,
      podeExcluir: permissoesEstabelecimento.podeExcluir,
      podeGerenciar: permissoesEstabelecimento.podeGerenciar,
    })
    .from(permissoesEstabelecimento)
    .innerJoin(
      estabelecimentos,
      eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentos.id)
    )
    .where(eq(permissoesEstabelecimento.userId, userId))
    .orderBy(estabelecimentos.nome);

  return result;
}


/**
 * Busca um usuário pelo ID
 */
export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user;
}


/**
 * Atualiza os estabelecimentos de um usuário (adiciona e remove conforme necessário)
 */
export async function atualizarEstabelecimentosUsuario(
  userId: number,
  novosEstabelecimentosIds: number[],
  adminId: number
): Promise<{ adicionados: number; removidos: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar estabelecimentos atuais do usuário
  const estabelecimentosAtuais = await getEstabelecimentosUsuario(userId);
  const idsAtuais = estabelecimentosAtuais.map(e => e.id);

  // Calcular diferenças
  const idsParaAdicionar = novosEstabelecimentosIds.filter(id => !idsAtuais.includes(id));
  const idsParaRemover = idsAtuais.filter(id => !novosEstabelecimentosIds.includes(id));

  // Remover estabelecimentos
  for (const estabelecimentoId of idsParaRemover) {
    await db
      .delete(permissoesEstabelecimento)
      .where(
        and(
          eq(permissoesEstabelecimento.userId, userId),
          eq(permissoesEstabelecimento.estabelecimentoId, estabelecimentoId)
        )
      );

    // Registrar no log de auditoria
    await registrarLogAuditoria({
      usuarioId: adminId,
      usuarioAfetadoId: userId,
      estabelecimentoId: estabelecimentoId,
      tipoAcao: "editar_estabelecimentos",
      descricao: `Removido acesso ao estabelecimento`,
    });
  }

  // Adicionar novos estabelecimentos
  for (const estabelecimentoId of idsParaAdicionar) {
    await upsertPermissaoEstabelecimento({
      userId,
      estabelecimentoId,
      grupoServico: "visualizador",
      podeVisualizar: "sim",
      podeEditar: "nao",
      podeExcluir: "nao",
      podeGerenciar: "nao",
      acessoDashboard: "sim",
      acessoArquivos: "nao",
      acessoComparacoes: "nao",
      acessoFaturamento: "nao",
      acessoTabelasPreco: "nao",
      acessoAnaliseGlosa: "nao",
      acessoDicionarioGlosas: "nao",
      acessoRecursosGlosa: "nao",
      acessoConvenios: "nao",
      acessoRegrasNegocio: "nao",
      acessoProdutividade: "nao",
      acessoEstabelecimentos: "nao",
      acessoPermissoes: "nao",
    });

    // Registrar no log de auditoria
    await registrarLogAuditoria({
      usuarioId: adminId,
      usuarioAfetadoId: userId,
      estabelecimentoId: estabelecimentoId,
      tipoAcao: "editar_estabelecimentos",
      descricao: `Adicionado acesso ao estabelecimento`,
    });
  }

  return {
    adicionados: idsParaAdicionar.length,
    removidos: idsParaRemover.length,
  };
}


// ============ LOTES DE RECURSOS ============

/**
 * Lista lotes de recursos com filtros
 */
export async function listarLotesRecurso(params: {
  estabelecimentoId?: number;
  convenioId?: number;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { lotes: [], total: 0 };

  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];

  if (params.estabelecimentoId) {
    conditions.push(eq(lotesRecurso.estabelecimentoId, params.estabelecimentoId));
  }

  if (params.convenioId) {
    conditions.push(eq(lotesRecurso.convenioId, params.convenioId));
  }

  if (params.status) {
    conditions.push(eq(lotesRecurso.status, params.status as any));
  }

  if (params.search) {
    conditions.push(
      or(
        like(lotesRecurso.numeroLote, `%${params.search}%`),
        like(lotesRecurso.protocoloEnvio, `%${params.search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const lotes = await db
    .select()
    .from(lotesRecurso)
    .where(whereClause)
    .orderBy(desc(lotesRecurso.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(lotesRecurso)
    .where(whereClause);

  return {
    lotes,
    total: countResult?.count || 0,
  };
}

/**
 * Busca resumo dos lotes de recursos
 */
export async function getResumoLotesRecurso(estabelecimentoId?: number) {
  const db = await getDb();
  if (!db) return {
    totalLotes: 0,
    lotesEnviados: 0,
    lotesRespondidos: 0,
    lotesPendentes: 0,
    valorTotalGlosado: 0,
    valorTotalRecursado: 0,
    valorTotalRecuperado: 0,
    lotesVencendo: 0,
  };

  const conditions: SQL[] = [];
  if (estabelecimentoId) {
    conditions.push(eq(lotesRecurso.estabelecimentoId, estabelecimentoId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const lotes = await db
    .select()
    .from(lotesRecurso)
    .where(whereClause);

  const hoje = new Date();
  const em7Dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);

  let totalLotes = lotes.length;
  let lotesEnviados = 0;
  let lotesRespondidos = 0;
  let lotesPendentes = 0;
  let valorTotalGlosado = 0;
  let valorTotalRecursado = 0;
  let valorTotalRecuperado = 0;
  let lotesVencendo = 0;

  for (const lote of lotes) {
    valorTotalGlosado += parseFloat(lote.valorTotalGlosado || "0");
    valorTotalRecursado += parseFloat(lote.valorTotalRecursado || "0");
    valorTotalRecuperado += parseFloat(lote.valorTotalRecuperado || "0");

    if (lote.status === "enviado" || lote.status === "em_analise") {
      lotesEnviados++;
      // Verificar se está vencendo
      if (lote.dataPrazoPagamento && new Date(lote.dataPrazoPagamento) <= em7Dias) {
        lotesVencendo++;
      }
    } else if (lote.status === "respondido" || lote.status === "finalizado") {
      lotesRespondidos++;
    } else {
      lotesPendentes++;
    }
  }

  return {
    totalLotes,
    lotesEnviados,
    lotesRespondidos,
    lotesPendentes,
    valorTotalGlosado,
    valorTotalRecursado,
    valorTotalRecuperado,
    lotesVencendo,
  };
}

/**
 * Atualiza um lote de recurso
 */
export async function atualizarLoteRecurso(params: {
  loteId: number;
  status?: string;
  protocoloEnvio?: string;
  dataEnvio?: Date;
  dataPrazoPagamento?: Date;
  dataResposta?: Date;
  valorTotalRecuperado?: string;
}) {
  const db = await getDb();
  if (!db) return { success: false };

  const updateData: any = {};

  if (params.status) updateData.status = params.status;
  if (params.protocoloEnvio) updateData.protocoloEnvio = params.protocoloEnvio;
  if (params.dataEnvio) updateData.dataEnvio = params.dataEnvio;
  if (params.dataPrazoPagamento) updateData.dataPrazoPagamento = params.dataPrazoPagamento;
  if (params.dataResposta) updateData.dataResposta = params.dataResposta;
  if (params.valorTotalRecuperado) updateData.valorTotalRecuperado = params.valorTotalRecuperado;

  await db
    .update(lotesRecurso)
    .set(updateData)
    .where(eq(lotesRecurso.id, params.loteId));

  return { success: true };
}

/**
 * Busca detalhes de um lote de recurso com seus recursos
 */
export async function getDetalhesLoteRecurso(loteId: number) {
  const db = await getDb();
  if (!db) return null;

  const [lote] = await db
    .select()
    .from(lotesRecurso)
    .where(eq(lotesRecurso.id, loteId))
    .limit(1);

  if (!lote) return null;

  // Buscar recursos do lote
  const recursosDoLote = await db
    .select()
    .from(recursosGlosa)
    .where(eq(recursosGlosa.loteId, loteId))
    .orderBy(recursosGlosa.createdAt);

  // Buscar convênio
  const [convenio] = lote.convenioId
    ? await db.select().from(convenios).where(eq(convenios.id, lote.convenioId)).limit(1)
    : [null];

  // Buscar estabelecimento
  const [estabelecimento] = lote.estabelecimentoId
    ? await db.select().from(estabelecimentos).where(eq(estabelecimentos.id, lote.estabelecimentoId)).limit(1)
    : [null];

  return {
    ...lote,
    convenioNome: convenio?.nome || "Não informado",
    estabelecimentoNome: estabelecimento?.nome || "Não informado",
    recursos: recursosDoLote,
    totalRecursos: recursosDoLote.length,
  };
}


// ============ PADRÕES DE COBRANÇA E INSIGHTS DE IA ============

/**
 * Analisa os padrões de cobrança de um estabelecimento/convênio
 * Agrupa procedimentos por tipo e calcula médias, frequências e associações
 */
export async function analisarPadroesCobranca(params: {
  estabelecimentoId: number;
  convenioId?: number;
}): Promise<{
  padroes: Array<{
    codigoProcedimento: string;
    descricao: string;
    tipo: string;
    quantidadeMedia: number;
    valorMedio: number;
    frequencia: number;
    itensAssociados: Array<{
      codigo: string;
      descricao: string;
      tipo: string;
      frequencia: number;
      quantidadeMedia: number;
    }>;
  }>;
  totalContas: number;
}> {
  const db = await getDb();
  if (!db) return { padroes: [], totalContas: 0 };

  // Buscar arquivos do estabelecimento
  const conditions: any[] = [
    eq(arquivos.estabelecimentoId, params.estabelecimentoId),
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];

  if (params.convenioId) {
    conditions.push(eq(arquivos.convenioId, params.convenioId));
  }

  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...conditions));

  if (arquivosEnviados.length === 0) {
    return { padroes: [], totalContas: 0 };
  }

  const arquivoIds = arquivosEnviados.map(a => a.id);

  // Buscar todos os procedimentos
  const procs = await db
    .select()
    .from(procedimentos)
    .where(inArray(procedimentos.arquivoId, arquivoIds));

  // Agrupar por guia (conta)
  const contasPorGuia = new Map<string, typeof procs>();
  for (const proc of procs) {
    const guia = proc.guiaNumero || `arquivo_${proc.arquivoId}`;
    if (!contasPorGuia.has(guia)) {
      contasPorGuia.set(guia, []);
    }
    contasPorGuia.get(guia)!.push(proc);
  }

  const totalContas = contasPorGuia.size;

  // Analisar padrões por código de procedimento
  const padroesPorCodigo = new Map<string, {
    codigo: string;
    descricao: string;
    tipo: string;
    ocorrencias: number;
    quantidadeTotal: number;
    valorTotal: number;
    contasComItem: Set<string>;
    itensAssociados: Map<string, {
      codigo: string;
      descricao: string;
      tipo: string;
      ocorrencias: number;
      quantidadeTotal: number;
    }>;
  }>();

  for (const [guia, procsGuia] of Array.from(contasPorGuia.entries())) {
    const codigosNaGuia = new Set(procsGuia.map(p => p.codigo));

    for (const proc of procsGuia) {
      if (!padroesPorCodigo.has(proc.codigo)) {
        padroesPorCodigo.set(proc.codigo, {
          codigo: proc.codigo,
          descricao: proc.descricao || "",
          tipo: proc.codigoDespesa || "procedimento",
          ocorrencias: 0,
          quantidadeTotal: 0,
          valorTotal: 0,
          contasComItem: new Set(),
          itensAssociados: new Map(),
        });
      }

      const padrao = padroesPorCodigo.get(proc.codigo)!;
      padrao.ocorrencias++;
      padrao.quantidadeTotal += parseFloat(String(proc.quantidade || "1"));
      padrao.valorTotal += parseFloat(proc.valorTotal || "0");
      padrao.contasComItem.add(guia);

      // Registrar itens associados (outros itens na mesma conta)
      for (const outroCodigo of Array.from(codigosNaGuia)) {
        if (outroCodigo === proc.codigo) continue;

        const outroProc = procsGuia.find(p => p.codigo === outroCodigo);
        if (!outroProc) continue;

        if (!padrao.itensAssociados.has(outroCodigo)) {
          padrao.itensAssociados.set(outroCodigo, {
            codigo: outroCodigo,
            descricao: outroProc.descricao || "",
            tipo: outroProc.codigoDespesa || "procedimento",
            ocorrencias: 0,
            quantidadeTotal: 0,
          });
        }

        const assoc = padrao.itensAssociados.get(outroCodigo)!;
        assoc.ocorrencias++;
        assoc.quantidadeTotal += parseFloat(String(outroProc.quantidade || "1"));
      }
    }
  }

  // Converter para array e calcular médias
  const padroes = Array.from(padroesPorCodigo.values())
    .filter(p => p.contasComItem.size >= 3) // Mínimo 3 ocorrências
    .map(p => ({
      codigoProcedimento: p.codigo,
      descricao: p.descricao,
      tipo: p.tipo,
      quantidadeMedia: p.quantidadeTotal / p.ocorrencias,
      valorMedio: p.valorTotal / p.ocorrencias,
      frequencia: (p.contasComItem.size / totalContas) * 100,
      itensAssociados: Array.from(p.itensAssociados.values())
        .filter(a => a.ocorrencias >= 2)
        .map(a => ({
          codigo: a.codigo,
          descricao: a.descricao,
          tipo: a.tipo,
          frequencia: (a.ocorrencias / p.contasComItem.size) * 100,
          quantidadeMedia: a.quantidadeTotal / a.ocorrencias,
        }))
        .sort((a, b) => b.frequencia - a.frequencia)
        .slice(0, 10),
    }))
    .sort((a, b) => b.frequencia - a.frequencia);

  return { padroes, totalContas };
}

/**
 * Salva um padrão de cobrança no banco de dados
 */
export async function salvarPadraoCobranca(dados: InsertPadraoCobranca): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    // Verificar se já existe padrão para este código/convênio/estabelecimento
    const conditions: any[] = [
      eq(padroesCobranca.codigoProcedimentoPrincipal, dados.codigoProcedimentoPrincipal)
    ];
    if (dados.estabelecimentoId) {
      conditions.push(eq(padroesCobranca.estabelecimentoId, dados.estabelecimentoId));
    }
    if (dados.convenioId) {
      conditions.push(eq(padroesCobranca.convenioId, dados.convenioId));
    }
    
    const existente = await db
      .select()
      .from(padroesCobranca)
      .where(and(...conditions))
      .limit(1);

    if (existente.length > 0) {
      // Atualizar existente
      await db.update(padroesCobranca)
        .set({
          ...dados,
          totalOcorrencias: (existente[0].totalOcorrencias || 0) + (dados.totalOcorrencias || 1),
          updatedAt: new Date(),
        })
        .where(eq(padroesCobranca.id, existente[0].id));
      return existente[0].id;
    }

    const result = await db.insert(padroesCobranca).values(dados);
    return Number(result[0].insertId);
  } catch (error) {
    console.error("[Database] Erro ao salvar padrão de cobrança:", error);
    return null;
  }
}

/**
 * Busca padrões de cobrança salvos
 */
export async function getPadroesCobranca(params: {
  estabelecimentoId: number;
  convenioId?: number;
  codigoProcedimento?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [
    eq(padroesCobranca.estabelecimentoId, params.estabelecimentoId),
    eq(padroesCobranca.status, "ativo"),
  ];

  if (params.convenioId) {
    conditions.push(eq(padroesCobranca.convenioId, params.convenioId));
  }

  if (params.codigoProcedimento) {
    conditions.push(eq(padroesCobranca.codigoProcedimentoPrincipal, params.codigoProcedimento));
  }

  const result = await db
    .select()
    .from(padroesCobranca)
    .where(and(...conditions))
    .orderBy(desc(padroesCobranca.totalOcorrencias));

  return result;
}

/**
 * Salva um insight de IA no banco de dados
 */
export async function salvarInsightIA(dados: InsertInsightIA): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(insightsIA).values(dados);
    return Number(result[0].insertId);
  } catch (error) {
    console.error("[Database] Erro ao salvar insight de IA:", error);
    return null;
  }
}

/**
 * Busca insights de IA
 */
export async function getInsightsIA(params: {
  estabelecimentoId?: number;
  arquivoId?: number;
  tipoInsight?: string;
  status?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];

  if (params.estabelecimentoId) {
    conditions.push(eq(insightsIA.estabelecimentoId, params.estabelecimentoId));
  }

  if (params.arquivoId) {
    conditions.push(eq(insightsIA.arquivoId, params.arquivoId));
  }

  if (params.tipoInsight) {
    conditions.push(eq(insightsIA.tipoInsight, params.tipoInsight as any));
  }

  if (params.status) {
    conditions.push(eq(insightsIA.status, params.status as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await db
    .select()
    .from(insightsIA)
    .where(whereClause)
    .orderBy(desc(insightsIA.createdAt))
    .limit(params.limit || 50);

  return result;
}

/**
 * Atualiza o status de um insight de IA
 */
export async function atualizarStatusInsightIA(
  id: number,
  status: "pendente" | "aceito" | "ignorado" | "rejeitado",
  feedback?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(insightsIA)
      .set({
        status,
        feedbackUsuario: feedback || null,
        dataProcessamento: new Date(),
      })
      .where(eq(insightsIA.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar status do insight:", error);
    return false;
  }
}

/**
 * Analisa uma conta e gera insights de IA sobre possíveis itens faltantes ou quantidades abaixo do esperado
 */
export async function gerarInsightsContaIA(params: {
  arquivoId: number;
  estabelecimentoId: number;
  convenioId?: number;
  userId: number;
}): Promise<Array<{
  tipo: string;
  titulo: string;
  descricao: string;
  impactoEstimado: number;
  confianca: number;
  detalhes: any;
}>> {
  const db = await getDb();
  if (!db) return [];

  // Buscar procedimentos do arquivo
  const procsArquivo = await db
    .select()
    .from(procedimentos)
    .where(eq(procedimentos.arquivoId, params.arquivoId));

  if (procsArquivo.length === 0) return [];

  // Buscar padrões de cobrança do estabelecimento/convênio
  const padroes = await getPadroesCobranca({
    estabelecimentoId: params.estabelecimentoId,
    convenioId: params.convenioId,
  });

  if (padroes.length === 0) {
    // Se não há padrões salvos, analisar em tempo real
    const analise = await analisarPadroesCobranca({
      estabelecimentoId: params.estabelecimentoId,
      convenioId: params.convenioId,
    });

    if (analise.padroes.length === 0) return [];

    // Usar padrões analisados
    for (const padrao of analise.padroes.slice(0, 20)) {
      await salvarPadraoCobranca({
        estabelecimentoId: params.estabelecimentoId,
        convenioId: params.convenioId,
        codigoProcedimentoPrincipal: padrao.codigoProcedimento,
        descricaoProcedimentoPrincipal: padrao.descricao,
        tipoProcedimentoPrincipal: padrao.tipo,
        valorMedioConta: padrao.valorMedio.toString(),
        confianca: Math.round(padrao.frequencia),
        itensAssociados: padrao.itensAssociados,
        totalOcorrencias: Math.round(padrao.frequencia * analise.totalContas / 100),
      });
    }
  }

  // Buscar padrões atualizados
  const padroesAtualizados = await getPadroesCobranca({
    estabelecimentoId: params.estabelecimentoId,
    convenioId: params.convenioId,
  });

  const insights: Array<{
    tipo: string;
    titulo: string;
    descricao: string;
    impactoEstimado: number;
    confianca: number;
    detalhes: any;
  }> = [];

  // Criar mapa de códigos presentes no arquivo
  const codigosPresentes = new Map<string, {
    quantidade: number;
    valor: number;
    descricao: string;
  }>();

  for (const proc of procsArquivo) {
    const qtd = parseFloat(String(proc.quantidade || "1"));
    const valor = parseFloat(proc.valorTotal || "0");

    if (codigosPresentes.has(proc.codigo)) {
      const atual = codigosPresentes.get(proc.codigo)!;
      atual.quantidade += qtd;
      atual.valor += valor;
    } else {
      codigosPresentes.set(proc.codigo, {
        quantidade: qtd,
        valor,
        descricao: proc.descricao || "",
      });
    }
  }

  // Verificar cada padrão
  for (const padrao of padroesAtualizados) {
    const presente = codigosPresentes.get(padrao.codigoProcedimentoPrincipal);
    const itensAssociados = padrao.itensAssociados as Array<{
      codigo: string;
      descricao: string;
      tipo: string;
      frequencia: number;
      quantidadeMedia: number;
    }> || [];

    if (presente) {
      // Item presente - verificar quantidade
      // Extrair quantidade média dos itens associados ou usar 1 como padrão
      const itensAssoc = padrao.itensAssociados as Array<any> || [];
      const qtdMedia = itensAssoc.length > 0 ? itensAssoc.reduce((sum: number, i: any) => sum + (i.quantidadeMedia || 1), 0) / itensAssoc.length : 1;
      const qtdAtual = presente.quantidade;

      if (qtdAtual < qtdMedia * 0.5 && qtdMedia > 1) {
        // Quantidade muito abaixo da média
        const valorMedio = parseFloat(padrao.valorMedioConta || "0");
        const impactoEstimado = (qtdMedia - qtdAtual) * (valorMedio / qtdMedia);

        insights.push({
          tipo: "quantidade_baixa",
          titulo: `Quantidade abaixo do esperado: ${padrao.codigoProcedimentoPrincipal}`,
          descricao: `O item "${padrao.descricaoProcedimentoPrincipal}" tem quantidade ${qtdAtual.toFixed(0)}, mas a média histórica é ${qtdMedia.toFixed(1)}. Possível falta de cobrança.`,
          impactoEstimado,
          confianca: Math.min(padrao.confianca || 50, 95),
          detalhes: {
            codigo: padrao.codigoProcedimentoPrincipal,
            descricao: padrao.descricaoProcedimentoPrincipal,
            quantidadeAtual: qtdAtual,
            quantidadeMedia: qtdMedia,
            valorMedio,
          },
        });
      }

      // Verificar itens associados faltantes
      for (const assoc of itensAssociados) {
        if (assoc.frequencia >= 70 && !codigosPresentes.has(assoc.codigo)) {
          // Item associado frequente está faltando
          const valorEstimado = (assoc.quantidadeMedia || 1) * (parseFloat(padrao.valorMedioConta || "0") / Math.max(qtdMedia, 1));

          insights.push({
            tipo: "item_faltante",
            titulo: `Possível item faltante: ${assoc.codigo}`,
            descricao: `Quando "${padrao.descricaoProcedimentoPrincipal}" está presente, "${assoc.descricao}" aparece em ${(assoc.frequencia || 0).toFixed(0)}% das contas. Este item não foi encontrado.`,
            impactoEstimado: valorEstimado,
            confianca: assoc.frequencia,
            detalhes: {
              codigoFaltante: assoc.codigo,
              descricaoFaltante: assoc.descricao,
              tipoFaltante: assoc.tipo,
              codigoReferencia: padrao.codigoProcedimentoPrincipal,
              descricaoReferencia: padrao.descricaoProcedimentoPrincipal,
              frequenciaAssociacao: assoc.frequencia,
              quantidadeEsperada: assoc.quantidadeMedia,
            },
          });
        }
      }
    }
  }

  // Salvar insights no banco
  for (const insight of insights) {
    await salvarInsightIA({
      estabelecimentoId: params.estabelecimentoId,
      convenioId: params.convenioId,
      arquivoId: params.arquivoId,
      tipoInsight: insight.tipo as any,
      titulo: insight.titulo,
      descricao: insight.descricao,
      codigoProcedimento: insight.detalhes.codigo || insight.detalhes.codigoFaltante,
      descricaoProcedimento: insight.detalhes.descricao || insight.detalhes.descricaoFaltante,
      quantidadeEsperada: insight.detalhes.quantidadeMedia?.toString() || insight.detalhes.quantidadeEsperada?.toString(),
      quantidadeAtual: insight.detalhes.quantidadeAtual?.toString(),
      valorEsperado: insight.detalhes.valorMedio?.toString(),
      valorEstimado: insight.impactoEstimado.toString(),
      confianca: insight.confianca,
    });
  }

  return insights;
}


/**
 * Calcula métricas de acurácia dos insights de IA
 */
export async function getMetricasAcuraciaIA(params: {
  estabelecimentoId?: number;
  convenioId?: number;
  dataInicio?: Date;
  dataFim?: Date;
}): Promise<{
  totalInsights: number;
  aceitos: number;
  rejeitados: number;
  pendentes: number;
  ignorados: number;
  taxaAcerto: number;
  taxaRejeicao: number;
  evolucaoMensal: Array<{
    mes: string;
    aceitos: number;
    rejeitados: number;
    total: number;
    taxaAcerto: number;
  }>;
  porTipoInsight: Array<{
    tipo: string;
    total: number;
    aceitos: number;
    rejeitados: number;
    taxaAcerto: number;
  }>;
  impactoRecuperado: number;
  impactoPotencial: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalInsights: 0,
      aceitos: 0,
      rejeitados: 0,
      pendentes: 0,
      ignorados: 0,
      taxaAcerto: 0,
      taxaRejeicao: 0,
      evolucaoMensal: [],
      porTipoInsight: [],
      impactoRecuperado: 0,
      impactoPotencial: 0,
    };
  }

  const conditions: any[] = [];

  if (params.estabelecimentoId) {
    conditions.push(eq(insightsIA.estabelecimentoId, params.estabelecimentoId));
  }

  if (params.convenioId) {
    conditions.push(eq(insightsIA.convenioId, params.convenioId));
  }

  if (params.dataInicio) {
    conditions.push(gte(insightsIA.createdAt, params.dataInicio));
  }

  if (params.dataFim) {
    conditions.push(lte(insightsIA.createdAt, params.dataFim));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Buscar todos os insights
  const allInsights = await db
    .select()
    .from(insightsIA)
    .where(whereClause)
    .orderBy(desc(insightsIA.createdAt));

  // Calcular métricas gerais
  const aceitos = allInsights.filter(i => i.status === "aceito").length;
  const rejeitados = allInsights.filter(i => i.status === "rejeitado").length;
  const pendentes = allInsights.filter(i => i.status === "pendente").length;
  const ignorados = allInsights.filter(i => i.status === "ignorado").length;
  const totalAvaliados = aceitos + rejeitados;
  const taxaAcerto = totalAvaliados > 0 ? Math.round((aceitos / totalAvaliados) * 100) : 0;
  const taxaRejeicao = totalAvaliados > 0 ? Math.round((rejeitados / totalAvaliados) * 100) : 0;

  // Calcular impacto
  const impactoRecuperado = allInsights
    .filter(i => i.status === "aceito")
    .reduce((sum, i) => sum + parseFloat(String(i.valorEstimado || 0)), 0);

  const impactoPotencial = allInsights
    .filter(i => i.status === "pendente")
    .reduce((sum, i) => sum + parseFloat(String(i.valorEstimado || 0)), 0);

  // Calcular evolução mensal
  const porMes = new Map<string, { aceitos: number; rejeitados: number; total: number }>();
  
  for (const insight of allInsights) {
    const data = insight.createdAt ? new Date(insight.createdAt) : new Date();
    const mes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    
    if (!porMes.has(mes)) {
      porMes.set(mes, { aceitos: 0, rejeitados: 0, total: 0 });
    }
    
    const dados = porMes.get(mes)!;
    dados.total++;
    if (insight.status === "aceito") dados.aceitos++;
    if (insight.status === "rejeitado") dados.rejeitados++;
  }

  const evolucaoMensal = Array.from(porMes.entries())
    .map(([mes, dados]) => ({
      mes,
      aceitos: dados.aceitos,
      rejeitados: dados.rejeitados,
      total: dados.total,
      taxaAcerto: dados.aceitos + dados.rejeitados > 0
        ? Math.round((dados.aceitos / (dados.aceitos + dados.rejeitados)) * 100)
        : 0,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  // Calcular por tipo de insight
  const porTipo = new Map<string, { total: number; aceitos: number; rejeitados: number }>();
  
  for (const insight of allInsights) {
    const tipo = insight.tipoInsight || "outro";
    
    if (!porTipo.has(tipo)) {
      porTipo.set(tipo, { total: 0, aceitos: 0, rejeitados: 0 });
    }
    
    const dados = porTipo.get(tipo)!;
    dados.total++;
    if (insight.status === "aceito") dados.aceitos++;
    if (insight.status === "rejeitado") dados.rejeitados++;
  }

  const porTipoInsight = Array.from(porTipo.entries())
    .map(([tipo, dados]) => ({
      tipo,
      total: dados.total,
      aceitos: dados.aceitos,
      rejeitados: dados.rejeitados,
      taxaAcerto: dados.aceitos + dados.rejeitados > 0
        ? Math.round((dados.aceitos / (dados.aceitos + dados.rejeitados)) * 100)
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalInsights: allInsights.length,
    aceitos,
    rejeitados,
    pendentes,
    ignorados,
    taxaAcerto,
    taxaRejeicao,
    evolucaoMensal,
    porTipoInsight,
    impactoRecuperado,
    impactoPotencial,
  };
}

/**
 * Verifica insights críticos e notifica o proprietário
 */
export async function verificarENotificarInsightsCriticos(params: {
  estabelecimentoId: number;
  limiarImpacto?: number; // Valor mínimo para considerar crítico (default: 500)
  limiarConfianca?: number; // Confiança mínima para notificar (default: 70)
}): Promise<{
  notificado: boolean;
  insightsCriticos: number;
  valorTotalImpacto: number;
}> {
  const db = await getDb();
  if (!db) {
    return { notificado: false, insightsCriticos: 0, valorTotalImpacto: 0 };
  }

  const limiarImpacto = params.limiarImpacto || 500;
  const limiarConfianca = params.limiarConfianca || 70;

  // Buscar insights pendentes críticos (alto impacto e alta confiança)
  const insightsCriticos = await db
    .select()
    .from(insightsIA)
    .where(and(
      eq(insightsIA.estabelecimentoId, params.estabelecimentoId),
      eq(insightsIA.status, "pendente"),
      gte(insightsIA.valorEstimado, limiarImpacto.toString()),
      gte(insightsIA.confianca, limiarConfianca)
    ))
    .orderBy(desc(insightsIA.valorEstimado))
    .limit(10);

  if (insightsCriticos.length === 0) {
    return { notificado: false, insightsCriticos: 0, valorTotalImpacto: 0 };
  }

  const valorTotalImpacto = insightsCriticos.reduce(
    (sum, i) => sum + parseFloat(String(i.valorEstimado || 0)),
    0
  );

  // Montar conteúdo da notificação
  const detalhesInsights = insightsCriticos
    .slice(0, 5)
    .map((i, idx) => `${idx + 1}. ${i.titulo} - Impacto: R$ ${parseFloat(String(i.valorEstimado || 0)).toFixed(2)} (${i.confianca}% confiança)`)
    .join("\n");

  const conteudo = `A IA detectou ${insightsCriticos.length} divergência(s) significativa(s) em contas recentes.

Valor total de impacto potencial: R$ ${valorTotalImpacto.toFixed(2)}

Principais divergências:
${detalhesInsights}

Acesse o sistema para revisar e tomar as ações necessárias.`;

  // Enviar notificação ao proprietário
  try {
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: `⚠️ ${insightsCriticos.length} Divergência(s) Crítica(s) Detectada(s) pela IA`,
      content: conteudo,
    });

    return {
      notificado: true,
      insightsCriticos: insightsCriticos.length,
      valorTotalImpacto,
    };
  } catch (error) {
    console.error("[Notificação] Erro ao notificar insights críticos:", error);
    return {
      notificado: false,
      insightsCriticos: insightsCriticos.length,
      valorTotalImpacto,
    };
  }
}

/**
 * Processa insights automaticamente após importação de arquivo
 * e notifica se houver divergências críticas
 */
export async function processarInsightsAutomaticos(params: {
  arquivoId: number;
  estabelecimentoId: number;
  convenioId?: number;
  userId: number;
}): Promise<{
  insightsGerados: number;
  insightsCriticos: number;
  notificacaoEnviada: boolean;
}> {
  // Gerar insights para o arquivo
  const insights = await gerarInsightsContaIA(params);

  if (insights.length === 0) {
    return {
      insightsGerados: 0,
      insightsCriticos: 0,
      notificacaoEnviada: false,
    };
  }

  // Salvar insights no banco
  for (const insight of insights) {
    await salvarInsightIA({
      arquivoId: params.arquivoId,
      estabelecimentoId: params.estabelecimentoId,
      convenioId: params.convenioId,
      tipoInsight: insight.tipo as any,
      titulo: insight.titulo,
      descricao: insight.descricao,
      valorEstimado: insight.impactoEstimado.toString(),
      confianca: insight.confianca,
      status: "pendente",
    });
  }

  // Verificar e notificar insights críticos
  const notificacao = await verificarENotificarInsightsCriticos({
    estabelecimentoId: params.estabelecimentoId,
  });

  return {
    insightsGerados: insights.length,
    insightsCriticos: notificacao.insightsCriticos,
    notificacaoEnviada: notificacao.notificado,
  };
}


// ============ RECURSOS AGRUPADOS POR CONVÊNIO ============

/**
 * Busca recursos agrupados por convênio para envio em lote
 */
export async function getRecursosAgrupadosPorConvenio(params: {
  estabelecimentoId?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [];

  // Filtrar apenas recursos não enviados (rascunho ou pendente_envio)
  if (params.status) {
    conditions.push(eq(recursosGlosa.status, params.status as any));
  } else {
    conditions.push(
      or(
        eq(recursosGlosa.status, "rascunho"),
        eq(recursosGlosa.status, "pendente_envio")
      )!
    );
  }

  // Filtrar por estabelecimento (ou recursos sem estabelecimento definido)
  if (params.estabelecimentoId) {
    conditions.push(
      or(
        eq(recursosGlosa.estabelecimentoId, params.estabelecimentoId),
        isNull(recursosGlosa.estabelecimentoId)
      )!
    );
  }

  // Filtrar recursos sem lote (ainda não enviados em lote)
  conditions.push(isNull(recursosGlosa.loteId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const recursos = await db
    .select()
    .from(recursosGlosa)
    .where(whereClause)
    .orderBy(recursosGlosa.convenioId, recursosGlosa.createdAt);

  // Agrupar por convênio
  const convenioMap = new Map<number, {
    convenioId: number;
    convenioNome: string;
    recursos: typeof recursos;
    totalRecursos: number;
    valorTotalGlosado: number;
    valorTotalCobrado: number;
  }>();

  // Buscar nomes dos convênios
  const convenioIds = Array.from(new Set(recursos.map(r => r.convenioId)));
  const conveniosData = convenioIds.length > 0
    ? await db.select().from(convenios).where(inArray(convenios.id, convenioIds))
    : [];
  const convenioNomeMap = new Map(conveniosData.map(c => [c.id, c.nome]));

  for (const recurso of recursos) {
    if (!convenioMap.has(recurso.convenioId)) {
      convenioMap.set(recurso.convenioId, {
        convenioId: recurso.convenioId,
        convenioNome: convenioNomeMap.get(recurso.convenioId) || "Convênio Desconhecido",
        recursos: [],
        totalRecursos: 0,
        valorTotalGlosado: 0,
        valorTotalCobrado: 0,
      });
    }

    const grupo = convenioMap.get(recurso.convenioId)!;
    grupo.recursos.push(recurso);
    grupo.totalRecursos++;
    grupo.valorTotalGlosado += parseFloat(recurso.valorGlosado || "0");
    grupo.valorTotalCobrado += parseFloat(recurso.valorCobrado || "0");
  }

  return Array.from(convenioMap.values()).sort((a, b) => b.totalRecursos - a.totalRecursos);
}

/**
 * Cria um lote de recursos e associa os recursos selecionados
 */
export async function criarLoteRecurso(params: {
  convenioId: number;
  estabelecimentoId: number;
  userId: number;
  recursosIds: number[];
  descricao?: string;
}): Promise<{ loteId: number; numeroLote: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Gerar número do lote
  const dataAtual = new Date();
  const ano = dataAtual.getFullYear();
  const mes = String(dataAtual.getMonth() + 1).padStart(2, "0");
  const dia = String(dataAtual.getDate()).padStart(2, "0");
  const hora = String(dataAtual.getHours()).padStart(2, "0");
  const minuto = String(dataAtual.getMinutes()).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const numeroLote = `L${ano}${mes}${dia}${hora}${minuto}${random}`;

  // Buscar recursos para calcular totais
  const recursosParaLote = await db
    .select()
    .from(recursosGlosa)
    .where(inArray(recursosGlosa.id, params.recursosIds));

  let valorTotalGlosado = 0;
  let valorTotalRecursado = 0;

  for (const recurso of recursosParaLote) {
    valorTotalGlosado += parseFloat(recurso.valorGlosado || "0");
    valorTotalRecursado += parseFloat(recurso.valorGlosado || "0"); // Valor recursado = valor glosado inicialmente
  }

  // Calcular prazo de resposta (30 dias úteis após criação - padrão ANS)
  const dataPrazoResposta = new Date(dataAtual);
  dataPrazoResposta.setDate(dataPrazoResposta.getDate() + 30);

  // Criar o lote
  const [result] = await db.insert(lotesRecurso).values({
    convenioId: params.convenioId,
    estabelecimentoId: params.estabelecimentoId,
    userId: params.userId,
    numeroLote,
    descricao: params.descricao || `Lote de recursos - ${params.recursosIds.length} itens`,
    valorTotalGlosado: valorTotalGlosado.toFixed(2),
    valorTotalRecursado: valorTotalRecursado.toFixed(2),
    valorTotalRecuperado: "0",
    quantidadeItens: params.recursosIds.length,
    status: "pendente_envio",
    dataPrazoResposta,
    createdAt: new Date(),
  });

  const loteId = result.insertId;

  // Atualizar recursos com o loteId e status
  await db
    .update(recursosGlosa)
    .set({
      loteId,
      status: "pendente_envio",
    })
    .where(inArray(recursosGlosa.id, params.recursosIds));

  return { loteId, numeroLote };
}

/**
 * Envia um lote de recursos (atualiza status para enviado)
 */
export async function enviarLoteRecurso(params: {
  loteId: number;
  protocoloEnvio?: string;
  dataPrazoPagamento?: Date;
}): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };

  // Atualizar lote
  await db
    .update(lotesRecurso)
    .set({
      status: "enviado",
      protocoloEnvio: params.protocoloEnvio || null,
      dataEnvio: new Date(),
      dataPrazoPagamento: params.dataPrazoPagamento || null,
    })
    .where(eq(lotesRecurso.id, params.loteId));

  // Atualizar recursos do lote
  await db
    .update(recursosGlosa)
    .set({
      status: "enviado",
      dataEnvioRecurso: new Date(),
      protocoloRecurso: params.protocoloEnvio || null,
    })
    .where(eq(recursosGlosa.loteId, params.loteId));

  return { success: true };
}

/**
 * Busca recursos de um convênio específico para exibição detalhada
 */
export async function getRecursosDoConvenio(params: {
  convenioId: number;
  estabelecimentoId?: number;
  status?: string;
  apenasNaoEnviados?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [eq(recursosGlosa.convenioId, params.convenioId)];

  if (params.estabelecimentoId) {
    conditions.push(eq(recursosGlosa.estabelecimentoId, params.estabelecimentoId));
  }

  if (params.status) {
    conditions.push(eq(recursosGlosa.status, params.status as any));
  }

  if (params.apenasNaoEnviados) {
    conditions.push(isNull(recursosGlosa.loteId));
    conditions.push(
      or(
        eq(recursosGlosa.status, "rascunho"),
        eq(recursosGlosa.status, "pendente_envio")
      )!
    );
  }

  const whereClause = and(...conditions);

  const recursos = await db
    .select()
    .from(recursosGlosa)
    .where(whereClause)
    .orderBy(desc(recursosGlosa.createdAt));

  return recursos;
}


/**
 * Busca recursos de um lote para exportação com dados detalhados
 */
export async function getRecursosLoteParaExportacao(loteId: number) {
  const db = await getDb();
  if (!db) return null;

  // Buscar lote
  const [lote] = await db
    .select()
    .from(lotesRecurso)
    .where(eq(lotesRecurso.id, loteId))
    .limit(1);

  if (!lote) return null;

  // Buscar recursos do lote
  const recursosDoLote = await db
    .select()
    .from(recursosGlosa)
    .where(eq(recursosGlosa.loteId, loteId))
    .orderBy(recursosGlosa.pacienteNome, recursosGlosa.guiaNumero);

  // Buscar convênio
  const [convenio] = lote.convenioId
    ? await db.select().from(convenios).where(eq(convenios.id, lote.convenioId)).limit(1)
    : [null];

  // Formatar dados para exportação - Padrão Unimed
  const dadosExportacao = recursosDoLote.map((recurso, index) => ({
    // Campos padrão
    numero: index + 1,
    paciente: recurso.pacienteNome || "N/A",
    guia: recurso.guiaNumero || "N/A",
    carteirinha: recurso.pacienteCarteirinha || "N/A",
    dataItem: recurso.dataGlosa ? new Date(recurso.dataGlosa).toLocaleDateString("pt-BR") : "N/A",
    valorGlosado: recurso.valorGlosado ? parseFloat(recurso.valorGlosado) : 0,
    valorRecursado: recurso.valorGlosado ? parseFloat(recurso.valorGlosado) : 0,
    motivoGlosa: recurso.motivoGlosaConvenio || "N/A",
    descricaoRecurso: recurso.justificativaRecurso || "N/A",
    codigoProcedimento: recurso.codigoProcedimento || "N/A",
    descricaoProcedimento: recurso.descricaoProcedimento || "N/A",
    status: recurso.status,
    valorRecuperado: recurso.valorRecuperado ? parseFloat(recurso.valorRecuperado) : 0,
    // Campos adicionais para padrão Unimed
    sequencial: index + 1,
    protocoloDP: lote.protocoloEnvio || "",
    seqDP: recurso.guiaNumero || "",
    codigoBeneficiario: recurso.pacienteCarteirinha || "",
    dataAtendimento: recurso.dataGlosa ? new Date(recurso.dataGlosa).toLocaleDateString("pt-BR") : "",
    periodoAtendimento: recurso.dataGlosa ? new Date(recurso.dataGlosa).toLocaleDateString("pt-BR") : "",
    codigoServico: recurso.codigoProcedimento || "",
    descricao: recurso.descricaoProcedimento || "",
    participacao: "",
    quantidade: 1, // Quantidade padrão
    localAtendimento: "",
    justificativaPagamento: recurso.justificativaRecurso || "",
    anexo: "",
    qtdeAcatado: 0,
    valorAcatado: 0,
    pagoPeloCodigo: "",
    observacoes: "",
  }));

  // Calcular totais
  const totais = {
    totalItens: dadosExportacao.length,
    totalValorGlosado: dadosExportacao.reduce((sum, r) => sum + r.valorGlosado, 0),
    totalValorRecursado: dadosExportacao.reduce((sum, r) => sum + r.valorRecursado, 0),
    totalValorRecuperado: dadosExportacao.reduce((sum, r) => sum + r.valorRecuperado, 0),
  };

  return {
    lote: {
      id: lote.id,
      numeroLote: lote.numeroLote,
      convenioNome: convenio?.nome || "N/A",
      status: lote.status,
      dataEnvio: lote.dataEnvio,
      protocoloEnvio: lote.protocoloEnvio,
    },
    recursos: dadosExportacao,
    totais,
  };
}

/**
 * Atualiza o anexo de protocolo de um lote
 */
export async function atualizarAnexoProtocoloLote(
  loteId: number,
  anexoUrl: string,
  anexoKey: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(lotesRecurso)
      .set({
        anexoPdfUrl: anexoUrl,
        anexoPdfKey: anexoKey,
      })
      .where(eq(lotesRecurso.id, loteId));
    return true;
  } catch (error) {
    console.error("[Database] Erro ao atualizar anexo do lote:", error);
    return false;
  }
}


// ============ DETALHES DA CONTA DE CONCILIAÇÃO ============
interface DetalhesContaParams {
  convenioId: number;
  guiaNumero: string;
  userId?: number;
  estabelecimentoId?: number;
  mesReferencia?: number;
  anoReferencia?: number;
}

export async function getDetalhesConta(params: DetalhesContaParams) {
  const db = await getDb();
  if (!db) return null;

  const { convenioId, guiaNumero, userId, estabelecimentoId, mesReferencia, anoReferencia } = params;

  // Buscar arquivos enviados do convênio
  const conditionsEnviados: any[] = [
    eq(arquivos.convenioId, convenioId),
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];
  
  if (userId) {
    conditionsEnviados.push(eq(arquivos.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    conditionsEnviados.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  }
  if (mesReferencia && anoReferencia) {
    const dataInicio = new Date(anoReferencia, mesReferencia - 1, 1);
    const dataFim = new Date(anoReferencia, mesReferencia, 0, 23, 59, 59);
    conditionsEnviados.push(gte(arquivos.dataReferencia, dataInicio));
    conditionsEnviados.push(lte(arquivos.dataReferencia, dataFim));
  }

  const arquivosEnviados = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(and(...conditionsEnviados));

  if (arquivosEnviados.length === 0) {
    return null;
  }

  const arquivosEnviadosIds = arquivosEnviados.map(a => a.id);

  // Buscar procedimentos enviados da guia específica
  const procsEnviados = await db
    .select()
    .from(procedimentos)
    .where(
      and(
        inArray(procedimentos.arquivoId, arquivosEnviadosIds),
        eq(procedimentos.guiaNumero, guiaNumero)
      )
    );

  if (procsEnviados.length === 0) {
    return null;
  }

  // Buscar arquivos retornados
  const conditionsRetornados: any[] = [
    eq(arquivos.convenioId, convenioId),
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];
  
  if (userId) {
    conditionsRetornados.push(eq(arquivos.userId, userId));
  }
  if (estabelecimentoId && estabelecimentoId > 0) {
    conditionsRetornados.push(eq(arquivos.estabelecimentoId, estabelecimentoId));
  }
  if (mesReferencia && anoReferencia) {
    const dataInicio = new Date(anoReferencia, mesReferencia - 1, 1);
    const dataFim = new Date(anoReferencia, mesReferencia, 0, 23, 59, 59);
    conditionsRetornados.push(gte(arquivos.dataReferencia, dataInicio));
    conditionsRetornados.push(lte(arquivos.dataReferencia, dataFim));
  }

  const arquivosRetornados = await db
    .select({ id: arquivos.id })
    .from(arquivos)
    .where(and(...conditionsRetornados));

  const arquivosRetornadosIds = arquivosRetornados.map(a => a.id);

  // Buscar procedimentos retornados da guia
  const procsRetornados = arquivosRetornadosIds.length > 0
    ? await db
        .select()
        .from(procedimentos)
        .where(
          and(
            inArray(procedimentos.arquivoId, arquivosRetornadosIds),
            eq(procedimentos.guiaNumero, guiaNumero)
          )
        )
    : [];

  // Criar mapa de retornados por código
  const retornadosMap = new Map<string, typeof procsRetornados[0]>();
  for (const proc of procsRetornados) {
    retornadosMap.set(proc.codigo, proc);
  }

  // Montar itens da conta
  const itens: any[] = [];
  let valorTotalFaturado = 0;
  let valorTotalRecebido = 0;
  let valorTotalGlosado = 0;
  let pacienteNome = "";
  let dataExecucao = "";

  for (const procEnv of procsEnviados) {
    const valorFaturado = parseFloat(String(procEnv.valorTotal || 0));
    valorTotalFaturado += valorFaturado;
    
    if (!pacienteNome && procEnv.pacienteNome) {
      pacienteNome = procEnv.pacienteNome;
    }
    if (!dataExecucao && procEnv.dataExecucao) {
      dataExecucao = procEnv.dataExecucao instanceof Date 
        ? procEnv.dataExecucao.toLocaleDateString("pt-BR")
        : String(procEnv.dataExecucao);
    }

    const procRet = retornadosMap.get(procEnv.codigo);
    
    let valorPago = 0;
    let valorGlosado = 0;
    let motivoGlosa = "";
    let status: "ok" | "divergente" | "glosado" | "nao_encontrado" | "nao_recebido" = "nao_recebido";

    if (procRet) {
      valorPago = parseFloat(String(procRet.valorTotal || 0));
      valorGlosado = parseFloat(String(procRet.valorGlosado || 0));
      motivoGlosa = procRet.motivoGlosa || "";
      valorTotalRecebido += valorPago;
      valorTotalGlosado += valorGlosado;

      if (valorGlosado > 0) {
        status = "glosado";
      } else if (Math.abs(valorFaturado - valorPago) < 0.01) {
        status = "ok";
      } else {
        status = "divergente";
      }
    }

    itens.push({
      guiaNumero: procEnv.guiaNumero || guiaNumero,
      numeroLote: procEnv.numeroLote || "",
      dataExecucao: procEnv.dataExecucao instanceof Date 
        ? procEnv.dataExecucao.toLocaleDateString("pt-BR")
        : String(procEnv.dataExecucao || ""),
      codigo: procEnv.codigo,
      descricao: procEnv.descricao || "",
      pacienteNome: procEnv.pacienteNome || "",
      valorFaturado,
      valorPago,
      valorGlosado,
      motivoGlosa,
      status,
    });
  }

  // Determinar status geral da conta
  let statusConta: "ok" | "glosado" | "nao_encontrado" | "parcial" = "ok";
  if (valorTotalGlosado > 0) {
    statusConta = valorTotalRecebido > 0 ? "parcial" : "glosado";
  } else if (valorTotalRecebido === 0 && valorTotalFaturado > 0) {
    statusConta = "nao_encontrado";
  }

  return {
    guiaNumero,
    numeroLote: procsEnviados[0]?.numeroLote || "",
    pacienteNome,
    dataExecucao,
    valorTotalFaturado,
    valorTotalRecebido,
    valorTotalGlosado,
    status: statusConta,
    totalItens: itens.length,
    itens,
  };
}


// ============ ANÁLISE INTELIGENTE DE CONTAS (IA) ============

/**
 * Obtém estatísticas de valores por código de procedimento para comparação
 */
export async function getEstatisticasPorCodigo(estabelecimentoId: number, convenioId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  const whereConditions = [
    eq(procedimentos.tipoDespesa, "procedimento"),
    sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`,
    sql`${arquivos.direcao} = 'enviado'`,
  ];
  
  if (convenioId) {
    whereConditions.push(sql`${arquivos.convenioId} = ${convenioId}`);
  }

  const stats = await db
    .select({
      codigo: procedimentos.codigo,
      descricao: procedimentos.descricao,
      convenioId: arquivos.convenioId,
      totalContas: sql<number>`COUNT(*)`,
      valorMedio: sql<number>`AVG(CAST(${procedimentos.valorTotal} AS DECIMAL(10,2)))`,
      valorMinimo: sql<number>`MIN(CAST(${procedimentos.valorTotal} AS DECIMAL(10,2)))`,
      valorMaximo: sql<number>`MAX(CAST(${procedimentos.valorTotal} AS DECIMAL(10,2)))`,
      desvioPadrao: sql<number>`STDDEV(CAST(${procedimentos.valorTotal} AS DECIMAL(10,2)))`,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(and(...whereConditions))
    .groupBy(procedimentos.codigo, procedimentos.descricao, arquivos.convenioId)
    .having(sql`COUNT(*) >= 3`); // Mínimo de 3 contas para ter estatísticas significativas

  return stats;
}

/**
 * Identifica contas com valores fora da média (outliers)
 */
export async function getContasOutliers(estabelecimentoId: number, convenioId?: number, limiteDesvio: number = 2) {
  // Primeiro, obtém as estatísticas por código
  const estatisticas = await getEstatisticasPorCodigo(estabelecimentoId, convenioId);
  
  // Cria um mapa para lookup rápido
  const statsMap = new Map<string, typeof estatisticas[0]>();
  for (const stat of estatisticas) {
    const key = `${stat.codigo}-${stat.convenioId}`;
    statsMap.set(key, stat);
  }

  // Busca procedimentos recentes (últimos 90 dias)
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 90);

  const whereConditions = [
    sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`,
    sql`${arquivos.direcao} = 'enviado'`,
    sql`${arquivos.createdAt} >= ${dataLimite}`,
  ];
  
  if (convenioId) {
    whereConditions.push(sql`${arquivos.convenioId} = ${convenioId}`);
  }

  const db2 = await getDb();
  if (!db2) throw new Error('Database connection failed');
  const procedimentosRecentes = await db2
    .select({
      id: procedimentos.id,
      codigo: procedimentos.codigo,
      descricao: procedimentos.descricao,
      valorTotal: procedimentos.valorTotal,
      guiaNumero: procedimentos.guiaNumero,
      pacienteNome: procedimentos.pacienteNome,
      dataExecucao: procedimentos.dataExecucao,
      convenioId: arquivos.convenioId,
      arquivoId: arquivos.id,
      arquivoNome: arquivos.nome,
      userId: arquivos.userId,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(and(...whereConditions));

  // Identifica outliers
  const outliers: Array<{
    procedimento: typeof procedimentosRecentes[0];
    tipo: 'abaixo_media' | 'acima_media';
    valorMedio: number;
    desvioPadrao: number;
    diferencaPercentual: number;
  }> = [];

  for (const proc of procedimentosRecentes) {
    const key = `${proc.codigo}-${proc.convenioId}`;
    const stat = statsMap.get(key);
    
    if (stat && stat.desvioPadrao && stat.valorMedio) {
      const valor = Number(proc.valorTotal) || 0;
      const media = Number(stat.valorMedio);
      const desvio = Number(stat.desvioPadrao);
      
      if (desvio > 0) {
        const zScore = Math.abs((valor - media) / desvio);
        
        if (zScore >= limiteDesvio) {
          const diferencaPercentual = ((valor - media) / media) * 100;
          outliers.push({
            procedimento: proc,
            tipo: valor < media ? 'abaixo_media' : 'acima_media',
            valorMedio: media,
            desvioPadrao: desvio,
            diferencaPercentual,
          });
        }
      }
    }
  }

  // Ordena por diferença percentual (maior primeiro)
  outliers.sort((a, b) => Math.abs(b.diferencaPercentual) - Math.abs(a.diferencaPercentual));

  return outliers;
}

/**
 * Detecta padrões de erro por funcionário (faturista)
 */
export async function getPadroesErroPorFuncionario(estabelecimentoId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  // Busca glosas agrupadas por usuário que fez o upload
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 180); // Últimos 6 meses

  const errosPorUsuario = await db
    .select({
      userId: arquivos.userId,
      totalContas: sql<number>`COUNT(DISTINCT ${arquivos.id})`,
      totalProcedimentos: sql<number>`COUNT(${procedimentos.id})`,
      totalGlosados: sql<number>`SUM(CASE WHEN ${procedimentos.valorGlosado} > 0 THEN 1 ELSE 0 END)`,
      valorTotalFaturado: sql<number>`SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(10,2)))`,
      valorTotalGlosado: sql<number>`SUM(CAST(${procedimentos.valorGlosado} AS DECIMAL(10,2)))`,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(and(
      sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`,
      sql`${arquivos.direcao} = 'enviado'`,
      sql`${arquivos.createdAt} >= ${dataLimite}`,
    ))
    .groupBy(arquivos.userId);

  // Busca nomes dos usuários
  const userIds = errosPorUsuario.map((e: { userId: number }) => e.userId);
  const usuariosInfo = userIds.length > 0 ? await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, userIds)) : [];

  const userMap = new Map(usuariosInfo.map((u: { id: number; name: string | null; email: string | null }) => [u.id, u]));

  // Calcula métricas e identifica padrões
  const resultado = errosPorUsuario.map((erro: { userId: number; totalContas: number; totalProcedimentos: number; totalGlosados: number; valorTotalFaturado: number; valorTotalGlosado: number }) => {
    const user = userMap.get(erro.userId);
    const taxaGlosa = erro.totalProcedimentos > 0 
      ? (erro.totalGlosados / erro.totalProcedimentos) * 100 
      : 0;
    const valorGlosaPercentual = erro.valorTotalFaturado > 0
      ? (erro.valorTotalGlosado / erro.valorTotalFaturado) * 100
      : 0;

    return {
      userId: erro.userId,
      userName: user?.name || 'Usuário não identificado',
      userEmail: user?.email || '',
      totalContas: erro.totalContas,
      totalProcedimentos: erro.totalProcedimentos,
      totalGlosados: erro.totalGlosados,
      valorTotalFaturado: erro.valorTotalFaturado,
      valorTotalGlosado: erro.valorTotalGlosado,
      taxaGlosa: Math.round(taxaGlosa * 100) / 100,
      valorGlosaPercentual: Math.round(valorGlosaPercentual * 100) / 100,
    };
  });

  // Ordena por taxa de glosa (maior primeiro)
  resultado.sort((a, b) => b.taxaGlosa - a.taxaGlosa);

  return resultado;
}

/**
 * Busca motivos de glosa mais frequentes por funcionário
 */
export async function getMotivosGlosaPorFuncionario(estabelecimentoId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 180);

  const motivos = await db
    .select({
      motivoGlosa: procedimentos.motivoGlosa,
      codigo: procedimentos.codigo,
      descricao: procedimentos.descricao,
      quantidade: sql<number>`COUNT(*)`,
      valorTotal: sql<number>`SUM(CAST(${procedimentos.valorGlosado} AS DECIMAL(10,2)))`,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(and(
      sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`,
      sql`${arquivos.userId} = ${userId}`,
      sql`${procedimentos.valorGlosado} > 0`,
      sql`${arquivos.createdAt} >= ${dataLimite}`,
    ))
    .groupBy(procedimentos.motivoGlosa, procedimentos.codigo, procedimentos.descricao)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(20);

  return motivos;
}

/**
 * Calcula score de risco de glosa para contas
 */
export async function calcularRiscoGlosa(estabelecimentoId: number, arquivoId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  // Busca histórico de glosas por código de procedimento
  const historicoGlosas = await db
    .select({
      codigo: procedimentos.codigo,
      convenioId: arquivos.convenioId,
      totalContas: sql<number>`COUNT(*)`,
      totalGlosadas: sql<number>`SUM(CASE WHEN ${procedimentos.valorGlosado} > 0 THEN 1 ELSE 0 END)`,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`)
    .groupBy(procedimentos.codigo, arquivos.convenioId);

  // Cria mapa de taxa de glosa por código/convênio
  const taxaGlosaMap = new Map<string, number>();
  for (const h of historicoGlosas) {
    const key = `${h.codigo}-${h.convenioId}`;
    const taxa = h.totalContas > 0 ? (h.totalGlosadas / h.totalContas) * 100 : 0;
    taxaGlosaMap.set(key, taxa);
  }

  // Busca contas para análise
  const whereConditions = [
    sql`${arquivos.estabelecimentoId} = ${estabelecimentoId}`,
    sql`${arquivos.direcao} = 'enviado'`,
  ];
  
  if (arquivoId) {
    whereConditions.push(sql`${arquivos.id} = ${arquivoId}`);
  } else {
    // Últimos 30 dias se não especificado arquivo
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);
    whereConditions.push(sql`${arquivos.createdAt} >= ${dataLimite}`);
  }

  const db2 = await getDb();
  if (!db2) throw new Error('Database connection failed');
  const contas = await db2
    .select({
      arquivoId: arquivos.id,
      arquivoNome: arquivos.nome,
      convenioId: arquivos.convenioId,
      guiaNumero: procedimentos.guiaNumero,
      pacienteNome: procedimentos.pacienteNome,
      codigo: procedimentos.codigo,
      descricao: procedimentos.descricao,
      valorTotal: procedimentos.valorTotal,
      dataExecucao: procedimentos.dataExecucao,
    })
    .from(procedimentos)
    .innerJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(and(...whereConditions));

  // Agrupa por guia e calcula risco
  const contasAgrupadas = new Map<string, {
    guiaNumero: string;
    pacienteNome: string;
    arquivoId: number;
    arquivoNome: string;
    convenioId: number;
    dataExecucao: Date | null;
    itens: Array<{
      codigo: string;
      descricao: string | null;
      valorTotal: string | null;
      riscoIndividual: number;
    }>;
    valorTotal: number;
    riscoMedio: number;
    riscoMaximo: number;
  }>();

  for (const conta of contas) {
    const key = `${conta.arquivoId}-${conta.guiaNumero}`;
    const taxaKey = `${conta.codigo}-${conta.convenioId}`;
    const riscoIndividual = taxaGlosaMap.get(taxaKey) || 0;

    if (!contasAgrupadas.has(key)) {
      contasAgrupadas.set(key, {
        guiaNumero: conta.guiaNumero || '',
        pacienteNome: conta.pacienteNome || '',
        arquivoId: conta.arquivoId,
        arquivoNome: conta.arquivoNome,
        convenioId: conta.convenioId,
        dataExecucao: conta.dataExecucao,
        itens: [],
        valorTotal: 0,
        riscoMedio: 0,
        riscoMaximo: 0,
      });
    }

    const grupo = contasAgrupadas.get(key)!;
    grupo.itens.push({
      codigo: conta.codigo,
      descricao: conta.descricao,
      valorTotal: conta.valorTotal,
      riscoIndividual,
    });
    grupo.valorTotal += Number(conta.valorTotal) || 0;
    grupo.riscoMaximo = Math.max(grupo.riscoMaximo, riscoIndividual);
  }

  // Calcula risco médio e converte para array
  const resultado = Array.from(contasAgrupadas.values()).map(conta => {
    const somaRiscos = conta.itens.reduce((sum, item) => sum + item.riscoIndividual, 0);
    conta.riscoMedio = conta.itens.length > 0 ? somaRiscos / conta.itens.length : 0;
    return conta;
  });

  // Ordena por risco máximo (maior primeiro)
  resultado.sort((a, b) => b.riscoMaximo - a.riscoMaximo);

  return resultado;
}

/**
 * Gera alertas e recomendações da IA para o dashboard
 */
export async function gerarAlertasIA(estabelecimentoId: number) {
  const alertas: Array<{
    tipo: 'critico' | 'alerta' | 'info';
    categoria: 'outlier' | 'padrao_erro' | 'risco_glosa' | 'tendencia';
    titulo: string;
    descricao: string;
    dados?: any;
  }> = [];

  // 1. Verifica outliers
  const outliers = await getContasOutliers(estabelecimentoId, undefined, 2);
  const outliersAbaixo = outliers.filter(o => o.tipo === 'abaixo_media').slice(0, 5);
  const outliersAcima = outliers.filter(o => o.tipo === 'acima_media').slice(0, 5);

  if (outliersAbaixo.length > 0) {
    alertas.push({
      tipo: 'alerta',
      categoria: 'outlier',
      titulo: `${outliersAbaixo.length} conta(s) com valor muito abaixo da média`,
      descricao: `Foram identificadas contas com valores significativamente menores que a média histórica. Verifique se há itens faltando ou valores incorretos.`,
      dados: outliersAbaixo,
    });
  }

  if (outliersAcima.length > 0) {
    alertas.push({
      tipo: 'info',
      categoria: 'outlier',
      titulo: `${outliersAcima.length} conta(s) com valor acima da média`,
      descricao: `Foram identificadas contas com valores acima da média histórica. Verifique se os valores estão corretos antes de enviar.`,
      dados: outliersAcima,
    });
  }

  // 2. Verifica padrões de erro por funcionário
  const padroes = await getPadroesErroPorFuncionario(estabelecimentoId);
  const funcionariosProblematicos = padroes.filter((p: { taxaGlosa: number; totalProcedimentos: number }) => p.taxaGlosa > 20 && p.totalProcedimentos >= 50);

  if (funcionariosProblematicos.length > 0) {
    alertas.push({
      tipo: 'critico',
      categoria: 'padrao_erro',
      titulo: `${funcionariosProblematicos.length} funcionário(s) com taxa de glosa elevada`,
      descricao: `Funcionários com taxa de glosa acima de 20% foram identificados. Recomenda-se treinamento ou revisão dos processos.`,
      dados: funcionariosProblematicos,
    });
  }

  // 3. Verifica contas com alto risco de glosa
  const contasRisco = await calcularRiscoGlosa(estabelecimentoId);
  const contasAltoRisco = contasRisco.filter(c => c.riscoMaximo > 50).slice(0, 10);

  if (contasAltoRisco.length > 0) {
    alertas.push({
      tipo: 'alerta',
      categoria: 'risco_glosa',
      titulo: `${contasAltoRisco.length} conta(s) com alto risco de glosa`,
      descricao: `Contas com procedimentos que historicamente têm alta taxa de glosa. Revise antes de enviar ao convênio.`,
      dados: contasAltoRisco,
    });
  }

  return alertas;
}
