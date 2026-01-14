import { eq, and, desc, like, sql, gte, lte, or } from "drizzle-orm";
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

  await db.insert(procedimentos).values(data);
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
  page?: number;
  pageSize?: number;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

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
        like(procedimentos.descricao, `%${filters.search}%`)
      )
    );
  }

  if (filters?.nomeMedico) {
    conditions.push(like(procedimentos.nomeMedico, `%${filters.nomeMedico}%`));
  }

  if (filters?.crmMedico) {
    conditions.push(like(procedimentos.crmMedico, `%${filters.crmMedico}%`));
  }

  // If convenioId is specified, we need to filter by arquivo's convenioId
  let baseQuery = db
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
      createdAt: procedimentos.createdAt,
      arquivoNome: arquivos.nome,
      arquivoConvenioId: arquivos.convenioId,
      convenioNome: convenios.nome,
    })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .leftJoin(convenios, eq(arquivos.convenioId, convenios.id));

  // Add convenioId filter
  if (filters?.convenioId) {
    conditions.push(eq(arquivos.convenioId, filters.convenioId));
  }

  // Add userId filter (only show procedures from user's files)
  if (filters?.userId) {
    conditions.push(eq(arquivos.userId, filters.userId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id))
    .where(whereClause);

  const total = countResult[0]?.count || 0;

  // Get paginated items
  const items = await baseQuery
    .where(whereClause)
    .orderBy(desc(procedimentos.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { items, total };
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

  // Total de procedimentos
  const procQuery = db
    .select({ 
      count: sql<number>`count(*)`,
      valorTotal: sql<number>`COALESCE(SUM(CAST(${procedimentos.valorTotal} AS DECIMAL(15,2))), 0)`
    })
    .from(procedimentos)
    .leftJoin(arquivos, eq(procedimentos.arquivoId, arquivos.id));

  if (userId) {
    procQuery.where(eq(arquivos.userId, userId));
  }

  const procStats = await procQuery;

  // Total de comparações e divergências
  const compConditions: any[] = [];
  if (userId) {
    compConditions.push(eq(comparacoes.userId, userId));
  }

  const compStats = await db
    .select({
      total: sql<number>`count(*)`,
      totalDivergencias: sql<number>`COALESCE(SUM(${comparacoes.totalDivergencias}), 0)`,
      valorRetornado: sql<number>`COALESCE(SUM(CAST(${comparacoes.valorTotalRetornado} AS DECIMAL(15,2))), 0)`,
      valorEnviado: sql<number>`COALESCE(SUM(CAST(${comparacoes.valorTotalEnviado} AS DECIMAL(15,2))), 0)`,
    })
    .from(comparacoes)
    .where(compConditions.length > 0 ? and(...compConditions) : undefined);

  const valorTotalEnviado = Number(procStats[0]?.valorTotal) || 0;
  const valorTotalRetornado = Number(compStats[0]?.valorRetornado) || 0;
  const valorGlosado = Number(compStats[0]?.valorEnviado || 0) - valorTotalRetornado;

  return {
    totalArquivos: Number(totalArquivos[0]?.count) || 0,
    totalProcedimentos: Number(procStats[0]?.count) || 0,
    totalComparacoes: Number(compStats[0]?.total) || 0,
    totalDivergencias: Number(compStats[0]?.totalDivergencias) || 0,
    valorTotalEnviado,
    valorTotalRetornado,
    valorGlosado: valorGlosado > 0 ? valorGlosado : 0,
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
