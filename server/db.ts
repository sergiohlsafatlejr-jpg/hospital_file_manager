import { eq, and, desc, like, sql, gte, lte, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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

export async function getConvenios(ativo?: "sim" | "nao") {
  const db = await getDb();
  if (!db) return [];

  if (ativo) {
    return db.select().from(convenios).where(eq(convenios.ativo, ativo));
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

export async function getArquivos(filters?: {
  convenioId?: number;
  direcao?: "enviado" | "retornado";
  tipoArquivo?: "xml" | "excel" | "pdf";
  status?: "pendente" | "processado" | "erro";
  userId?: number;
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
  status: "pendente" | "processado" | "erro"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(arquivos).set({ status }).where(eq(arquivos.id, id));
}

export async function getArquivosStats(userId?: number) {
  const db = await getDb();
  if (!db) return null;

  const baseCondition = userId ? eq(arquivos.userId, userId) : undefined;

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

export async function createProcedimentos(data: InsertProcedimento[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.length === 0) return { count: 0 };

  // Insert in batches to avoid "Maximum call stack size exceeded" error
  const BATCH_SIZE = 500;
  let inserted = 0;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    await db.insert(procedimentos).values(batch);
    inserted += batch.length;
    console.log(`[DB] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted}/${data.length} procedimentos`);
  }
  
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

  // Add userId filter (only show procedures from user's files)
  if (filters?.userId) {
    conditions.push(eq(arquivos.userId, filters.userId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get ALL items first to filter by statusGlosa and calculate resumo
  const allItems = await db
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
    .orderBy(desc(procedimentos.createdAt));

  // Calculate resumo from all items
  let totalPago = 0;
  let totalGlosado = 0;
  let quantidadePagos = 0;
  let quantidadeGlosados = 0;
  let quantidadeParciais = 0;

  // Filter by statusGlosa if specified
  const filteredItems = allItems.filter((item: any) => {
    const valor = parseFloat(item.valorTotal || "0");
    const extras = item.dadosExtras ? 
      (typeof item.dadosExtras === "string" ? JSON.parse(item.dadosExtras) : item.dadosExtras) : {};
    const valorGlosado = parseFloat(extras.valorGlosado || "0");
    
    // Determine status
    let status = "pago";
    if (valorGlosado > 0 && valorGlosado >= valor) {
      status = "glosado";
      quantidadeGlosados++;
      totalGlosado += valorGlosado;
    } else if (valorGlosado > 0) {
      status = "parcial";
      quantidadeParciais++;
      totalGlosado += valorGlosado;
      totalPago += valor - valorGlosado;
    } else {
      quantidadePagos++;
      totalPago += valor;
    }

    // Apply statusGlosa filter
    if (filters?.statusGlosa && filters.statusGlosa !== "todos") {
      return status === filters.statusGlosa;
    }
    return true;
  });

  const total = filteredItems.length;

  // Apply pagination to filtered items
  const paginatedItems = filteredItems.slice(offset, offset + pageSize);

  const resumo = {
    totalPago,
    totalGlosado,
    quantidadePagos,
    quantidadeGlosados,
    quantidadeParciais,
    total: allItems.length,
  };

  return { items: paginatedItems, total, resumo };
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

export async function getComparacoesStats(userId?: number) {
  const db = await getDb();
  if (!db) return null;

  const baseCondition = userId ? eq(comparacoes.userId, userId) : undefined;

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

export async function getFaturamentoPorConvenio(userId?: number): Promise<FaturamentoConvenio[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os convênios
  const convList = await db.select().from(convenios).where(eq(convenios.ativo, "sim"));
  
  const resultado: FaturamentoConvenio[] = [];

  for (const conv of convList) {
    // Buscar arquivos enviados do convênio
    const conditions = [
      eq(arquivos.convenioId, conv.id),
      eq(arquivos.direcao, "enviado"),
      eq(arquivos.status, "processado"),
    ];
    
    if (userId) {
      conditions.push(eq(arquivos.userId, userId));
    }

    const arquivosEnviados = await db
      .select()
      .from(arquivos)
      .where(and(...conditions));

    // Buscar procedimentos dos arquivos enviados
    let totalEnviado = 0;
    let quantidadeProcedimentos = 0;

    for (const arq of arquivosEnviados) {
      const procs = await db
        .select()
        .from(procedimentos)
        .where(eq(procedimentos.arquivoId, arq.id));

      for (const proc of procs) {
        totalEnviado += parseFloat(proc.valorTotal || "0");
        quantidadeProcedimentos++;
      }
    }

    // Buscar comparações do convênio para calcular glosa
    const compConditions = [eq(comparacoes.convenioId, conv.id)];
    if (userId) {
      compConditions.push(eq(comparacoes.userId, userId));
    }

    const comps = await db
      .select()
      .from(comparacoes)
      .where(and(...compConditions));

    let totalRetornado = 0;
    for (const comp of comps) {
      totalRetornado += parseFloat(comp.valorTotalRetornado || "0");
    }

    // Se não houver comparações, usar o valor enviado como retornado (sem glosa)
    if (comps.length === 0) {
      totalRetornado = totalEnviado;
    }

    const totalGlosado = totalEnviado - totalRetornado;
    const percentualGlosa = totalEnviado > 0 ? (totalGlosado / totalEnviado) * 100 : 0;

    resultado.push({
      convenioId: conv.id,
      convenioNome: conv.nome,
      totalEnviado,
      totalRetornado,
      totalGlosado,
      percentualGlosa,
      quantidadeArquivos: arquivosEnviados.length,
      quantidadeProcedimentos,
    });
  }

  return resultado.filter(r => r.quantidadeArquivos > 0);
}

export async function getFaturamentoPorMes(
  userId?: number,
  convenioId?: number,
  meses: number = 12
): Promise<FaturamentoPorMes[]> {
  const db = await getDb();
  if (!db) return [];

  const resultado: FaturamentoPorMes[] = [];
  const hoje = new Date();

  for (let i = 0; i < meses; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
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

export async function getResumoGeral(userId?: number) {
  const db = await getDb();
  if (!db) return null;

  // Total de arquivos
  const arquivosConditions: any[] = [];
  if (userId) {
    arquivosConditions.push(eq(arquivos.userId, userId));
  }

  const totalArquivos = await db
    .select({ count: sql<number>`count(*)` })
    .from(arquivos)
    .where(arquivosConditions.length > 0 ? and(...arquivosConditions) : undefined);

  // Total de procedimentos ENVIADOS (XMLs)
  const arquivosEnviadosConditions = userId 
    ? [eq(arquivos.userId, userId), eq(arquivos.direcao, "enviado"), eq(arquivos.status, "processado")]
    : [eq(arquivos.direcao, "enviado"), eq(arquivos.status, "processado")];

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
  const arquivosRetornadosConditions = userId 
    ? [eq(arquivos.userId, userId), eq(arquivos.direcao, "retornado"), eq(arquivos.status, "processado")]
    : [eq(arquivos.direcao, "retornado"), eq(arquivos.status, "processado")];

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

export async function getGlosaPorConvenio(userId?: number): Promise<GlosaPorConvenio[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar todos os convênios ativos
  const convList = await db.select().from(convenios).where(eq(convenios.ativo, "sim"));
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
  limit: number = 20
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
  meses: number = 12
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

export async function getResumoGlosa(userId?: number) {
  const db = await getDb();
  if (!db) return null;

  // Buscar todas as divergências
  const compConditions: any[] = [];
  if (userId) {
    compConditions.push(eq(comparacoes.userId, userId));
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

import { recursosGlosa, historicoRecursos, InsertRecursoGlosa, InsertHistoricoRecurso } from "../drizzle/schema";

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
  dataExecucao: string;
  codigo: string;
  descricao: string;
  pacienteNome: string;
  valorFaturado: number;
  valorPago: number;
  valorGlosado: number;
  motivoGlosa: string;
  status: "ok" | "divergente" | "glosado" | "nao_encontrado";
}

export interface ResumoConciliacao {
  convenioId: number;
  convenioNome: string;
  totalEnviados: number;
  totalRetornados: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalGlosados: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalGlosado: number;
  percentualGlosa: number;
}

export async function getConciliacaoPorConvenio(filters: {
  convenioId: number;
  userId: number;
  dataInicio?: Date;
  dataFim?: Date;
}): Promise<{ itens: ItemConciliacao[]; resumo: ResumoConciliacao | null }> {
  const db = await getDb();
  if (!db) return { itens: [], resumo: null };

  // Buscar convênio
  const [convenio] = await db
    .select()
    .from(convenios)
    .where(eq(convenios.id, filters.convenioId))
    .limit(1);

  if (!convenio) return { itens: [], resumo: null };

  // Buscar regras de conciliação configuradas para este convênio
  const regra = await getRegraConciliacaoPorConvenio(filters.convenioId);

  // Buscar arquivos enviados (XMLs)
  const arquivosEnviadosConditions = [
    eq(arquivos.convenioId, filters.convenioId),
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
    eq(arquivos.userId, filters.userId),
  ];

  if (filters.dataInicio) {
    arquivosEnviadosConditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters.dataFim) {
    arquivosEnviadosConditions.push(lte(arquivos.createdAt, filters.dataFim));
  }

  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosEnviadosConditions));

  // Buscar arquivos retornados (Excel)
  const arquivosRetornadosConditions = [
    eq(arquivos.convenioId, filters.convenioId),
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
    eq(arquivos.userId, filters.userId),
  ];

  if (filters.dataInicio) {
    arquivosRetornadosConditions.push(gte(arquivos.createdAt, filters.dataInicio));
  }
  if (filters.dataFim) {
    arquivosRetornadosConditions.push(lte(arquivos.createdAt, filters.dataFim));
  }

  const arquivosRetornados = await db
    .select()
    .from(arquivos)
    .where(and(...arquivosRetornadosConditions));

  // Buscar procedimentos enviados
  const procedimentosEnviados: any[] = [];
  for (const arq of arquivosEnviados) {
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));
    procedimentosEnviados.push(...procs);
  }

  // Buscar procedimentos retornados
  const procedimentosRetornados: any[] = [];
  for (const arq of arquivosRetornados) {
    const procs = await db
      .select()
      .from(procedimentos)
      .where(eq(procedimentos.arquivoId, arq.id));
    procedimentosRetornados.push(...procs);
  }

  // Criar mapa de procedimentos retornados por código + guia
  const retornadosMap = new Map<string, any[]>();
  for (const proc of procedimentosRetornados) {
    // Chave: código + guia (normalizado)
    const chave = `${proc.codigo}|${proc.guiaNumero || ""}`.toLowerCase();
    if (!retornadosMap.has(chave)) {
      retornadosMap.set(chave, []);
    }
    retornadosMap.get(chave)!.push(proc);
  }

  // Processar conciliação
  const itensConciliados: ItemConciliacao[] = [];
  const chavesProcessadas = new Set<string>();

  let totalEnviados = 0;
  let totalConciliados = 0;
  let totalDivergentes = 0;
  let totalGlosados = 0;
  let valorTotalFaturado = 0;
  let valorTotalPago = 0;
  let valorTotalGlosado = 0;

  for (const env of procedimentosEnviados) {
    const chave = `${env.codigo}|${env.guiaNumero || ""}`.toLowerCase();
    const retornados = retornadosMap.get(chave) || [];
    chavesProcessadas.add(chave);
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
        // Glosado total (padrão)
        itensConciliados.push({
          guiaNumero: env.guiaNumero || "",
          dataExecucao: env.dataExecucao ? new Date(env.dataExecucao).toLocaleDateString("pt-BR") : "",
          codigo: env.codigo,
          descricao: env.descricao || "",
          pacienteNome: env.pacienteNome || "",
          valorFaturado: valorEnviado,
          valorPago: 0,
          valorGlosado: valorEnviado,
          motivoGlosa: "Procedimento não encontrado no retorno",
          status: "nao_encontrado",
        });
        totalGlosados++;
        valorTotalGlosado += valorEnviado;
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
    valorTotalFaturado,
    valorTotalPago,
    valorTotalGlosado,
    percentualGlosa: valorTotalFaturado > 0 ? (valorTotalGlosado / valorTotalFaturado) * 100 : 0,
  };

  return { itens: itensConciliados, resumo };
}

export async function getResumoConciliacao(filters: {
  convenioId?: number;
  userId: number;
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
    // Buscar arquivos enviados do convênio nos últimos X meses
    const arquivosEnviados = await db
      .select()
      .from(arquivos)
      .where(
        and(
          eq(arquivos.convenioId, conv.id),
          eq(arquivos.direcao, "enviado"),
          eq(arquivos.status, "processado"),
          eq(arquivos.userId, filters.userId),
          gte(arquivos.createdAt, dataLimite)
        )
      );

    // Buscar arquivos retornados do convênio nos últimos X meses
    const arquivosRetornados = await db
      .select()
      .from(arquivos)
      .where(
        and(
          eq(arquivos.convenioId, conv.id),
          eq(arquivos.direcao, "retornado"),
          eq(arquivos.status, "processado"),
          eq(arquivos.userId, filters.userId),
          gte(arquivos.createdAt, dataLimite)
        )
      );

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

  // Buscar todos os arquivos enviados nos últimos X meses
  const arquivosEnviados = await db
    .select()
    .from(arquivos)
    .where(
      and(
        eq(arquivos.direcao, "enviado"),
        eq(arquivos.status, "processado"),
        eq(arquivos.userId, filters.userId),
        gte(arquivos.createdAt, dataLimite)
      )
    );

  // Buscar todos os arquivos retornados nos últimos X meses
  const arquivosRetornados = await db
    .select()
    .from(arquivos)
    .where(
      and(
        eq(arquivos.direcao, "retornado"),
        eq(arquivos.status, "processado"),
        eq(arquivos.userId, filters.userId),
        gte(arquivos.createdAt, dataLimite)
      )
    );

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
  dataInicio?: Date;
  dataFim?: Date;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: RepasseItem[]; total: number; resumo: any }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0, resumo: null };

  // Buscar arquivos enviados do usuário
  const arquivosConditions = [
    eq(arquivos.userId, filters.userId),
    eq(arquivos.direcao, "enviado"),
    eq(arquivos.status, "processado"),
  ];

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
  userId: number;
  convenioId?: number;
  dataReferenciaInicio?: Date;
  dataReferenciaFim?: Date;
  tipo?: string;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: ItemGlosado[]; total: number; resumo: ResumoItensGlosados }> {
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
    } 
  };

  // Buscar arquivos retornados do usuário (que contêm glosas)
  const arquivosConditions = [
    eq(arquivos.userId, filters.userId),
    eq(arquivos.direcao, "retornado"),
    eq(arquivos.status, "processado"),
  ];

  if (filters.convenioId) {
    arquivosConditions.push(eq(arquivos.convenioId, filters.convenioId));
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
      } 
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
    
    const valorGlosado = parseFloat(extras.valorGlosado || "0");
    
    // Só incluir itens com glosa
    if (valorGlosado <= 0) continue;

    const valorCobrado = parseFloat(proc.valorTotal || "0");
    const valorPago = valorCobrado - valorGlosado;
    const tipo = determinarTipoProcedimento(proc.codigo, proc.descricao || undefined);
    
    // Filtrar por tipo se especificado
    if (filters.tipo && filters.tipo !== "todos" && tipo !== filters.tipo) continue;

    const arquivo = arquivoMap.get(proc.arquivoId);
    const convenioNome = convenioMap.get(arquivo?.convenioId || 0) || "Desconhecido";
    const motivoGlosa = extras.motivoGlosa || extras.observacao || "Não informado";
    const codigoGlosa = motivoGlosa.match(/^(\d+)/)?.[1] || "";

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

  return { items: paginatedItems, total, resumo };
}
