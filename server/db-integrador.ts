import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  integracaoConexoes,
  InsertIntegracaoConexao,
  integracaoTabelas,
  InsertIntegracaoTabela,
  integracaoColunas,
  InsertIntegracaoColuna,
  integracaoMapeamentos,
  InsertIntegracaoMapeamento,
  integracaoMapeamentoCampos,
  InsertIntegracaoMapeamentoCampo,
  integracaoSincronizacoes,
  InsertIntegracaoSincronizacao,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[DB-Integrador] Failed to connect:", error);
      return null;
    }
  }
  return _db;
}

/** Força reconexão descartando a instância cacheada */
function resetDb() {
  _db = null;
}

/**
 * Wrapper que executa uma operação de banco com retry automático.
 * Se a query falhar com erro de conexão (ECONNRESET, EPIPE, PROTOCOL_CONNECTION_LOST, etc.),
 * descarta a conexão cacheada e tenta novamente.
 */
async function withRetry<T>(operation: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const msg = error?.message || error?.cause?.message || String(error);
      const isConnectionError = 
        msg.includes('ECONNRESET') ||
        msg.includes('EPIPE') ||
        msg.includes('PROTOCOL_CONNECTION_LOST') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Connection lost') ||
        msg.includes('read ECONNRESET') ||
        msg.includes('password authentication failed') ||
        (error?.cause && String(error.cause).includes('ECONNRESET'));
      
      if (isConnectionError && attempt < retries) {
        console.warn(`[DB-Integrador] Erro de conexão (tentativa ${attempt + 1}/${retries + 1}), reconectando...`, msg.substring(0, 150));
        resetDb();
        // Pequeno delay antes de reconectar
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        // Forçar nova conexão
        await getDb();
        continue;
      }
      throw error;
    }
  }
  throw new Error('Falha após todas as tentativas de retry');
}

// =====================================================
// CONEXÕES
// =====================================================

export async function listarConexoes(estabelecimentoId?: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    let query = db.select().from(integracaoConexoes);
    if (estabelecimentoId) {
      query = query.where(eq(integracaoConexoes.estabelecimentoId, estabelecimentoId)) as any;
    }
    return query.orderBy(desc(integracaoConexoes.criadoEm));
  });
}

export async function obterConexao(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const [conexao] = await db.select().from(integracaoConexoes).where(eq(integracaoConexoes.id, id));
    return conexao || null;
  });
}

export async function criarConexao(dados: Omit<InsertIntegracaoConexao, "id" | "criadoEm" | "atualizadoEm">) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    const [result] = await db.insert(integracaoConexoes).values(dados);
    return result.insertId;
  });
}

export async function atualizarConexao(id: number, dados: Partial<InsertIntegracaoConexao>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.update(integracaoConexoes).set(dados).where(eq(integracaoConexoes.id, id));
  });
}

export async function excluirConexao(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.delete(integracaoConexoes).where(eq(integracaoConexoes.id, id));
  });
}

export async function atualizarStatusConexao(id: number, status: "ok" | "erro" | "nao_testado", erro?: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return;
    await db.update(integracaoConexoes).set({
      statusConexao: status,
      erroConexao: erro || null,
      ultimoTesteConexao: new Date(),
    }).where(eq(integracaoConexoes.id, id));
  });
}

// =====================================================
// TABELAS
// =====================================================

export async function listarTabelas(estabelecimentoId?: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    let query = db.select().from(integracaoTabelas);
    if (estabelecimentoId) {
      query = query.where(eq(integracaoTabelas.estabelecimentoId, estabelecimentoId)) as any;
    }
    return query.orderBy(desc(integracaoTabelas.criadoEm));
  });
}

export async function obterTabela(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const [tabela] = await db.select().from(integracaoTabelas).where(eq(integracaoTabelas.id, id));
    return tabela || null;
  });
}

export async function criarTabela(dados: Omit<InsertIntegracaoTabela, "id" | "criadoEm" | "atualizadoEm">) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    const [result] = await db.insert(integracaoTabelas).values(dados);
    return result.insertId;
  });
}

export async function atualizarTabela(id: number, dados: Partial<InsertIntegracaoTabela>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.update(integracaoTabelas).set(dados).where(eq(integracaoTabelas.id, id));
  });
}

export async function excluirTabela(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    // Excluir colunas primeiro
    await db.delete(integracaoColunas).where(eq(integracaoColunas.tabelaId, id));
    await db.delete(integracaoTabelas).where(eq(integracaoTabelas.id, id));
  });
}

// =====================================================
// COLUNAS
// =====================================================

export async function listarColunas(tabelaId: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(integracaoColunas)
      .where(eq(integracaoColunas.tabelaId, tabelaId))
      .orderBy(integracaoColunas.ordem);
  });
}

export async function criarColuna(dados: Omit<InsertIntegracaoColuna, "id" | "criadoEm">) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    const [result] = await db.insert(integracaoColunas).values(dados);
    return result.insertId;
  });
}

export async function criarColunasEmLote(colunas: Omit<InsertIntegracaoColuna, "id" | "criadoEm">[]) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    if (colunas.length === 0) return;
    await db.insert(integracaoColunas).values(colunas);
  });
}

export async function atualizarColuna(id: number, dados: Partial<InsertIntegracaoColuna>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.update(integracaoColunas).set(dados).where(eq(integracaoColunas.id, id));
  });
}

export async function excluirColuna(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.delete(integracaoColunas).where(eq(integracaoColunas.id, id));
  });
}

// =====================================================
// MAPEAMENTOS
// =====================================================

export async function listarMapeamentos(estabelecimentoId?: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    let query = db.select().from(integracaoMapeamentos);
    if (estabelecimentoId) {
      query = query.where(eq(integracaoMapeamentos.estabelecimentoId, estabelecimentoId)) as any;
    }
    return query.orderBy(desc(integracaoMapeamentos.criadoEm));
  });
}

export async function buscarMapeamentoPorTabela(tabelaDestinoId: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const [mapeamento] = await db.select().from(integracaoMapeamentos).where(eq(integracaoMapeamentos.tabelaDestinoId, tabelaDestinoId)).limit(1);
    return mapeamento || null;
  });
}

export async function obterMapeamento(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const [mapeamento] = await db.select().from(integracaoMapeamentos).where(eq(integracaoMapeamentos.id, id));
    return mapeamento || null;
  });
}

export async function criarMapeamento(dados: Omit<InsertIntegracaoMapeamento, "id" | "criadoEm" | "atualizadoEm">) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    const [result] = await db.insert(integracaoMapeamentos).values(dados);
    return result.insertId;
  });
}

export async function atualizarMapeamento(id: number, dados: Partial<InsertIntegracaoMapeamento>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.update(integracaoMapeamentos).set(dados).where(eq(integracaoMapeamentos.id, id));
  });
}

export async function excluirMapeamento(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    // Excluir campos do mapeamento primeiro
    await db.delete(integracaoMapeamentoCampos).where(eq(integracaoMapeamentoCampos.mapeamentoId, id));
    await db.delete(integracaoMapeamentos).where(eq(integracaoMapeamentos.id, id));
  });
}

// =====================================================
// MAPEAMENTO DE CAMPOS
// =====================================================

export async function listarCamposMapeamento(mapeamentoId: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(integracaoMapeamentoCampos)
      .where(eq(integracaoMapeamentoCampos.mapeamentoId, mapeamentoId));
  });
}

export async function salvarCamposMapeamento(mapeamentoId: number, campos: Omit<InsertIntegracaoMapeamentoCampo, "id" | "criadoEm" | "mapeamentoId">[]) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    // Limpar campos existentes e inserir novos
    await db.delete(integracaoMapeamentoCampos).where(eq(integracaoMapeamentoCampos.mapeamentoId, mapeamentoId));
    if (campos.length > 0) {
      await db.insert(integracaoMapeamentoCampos).values(
        campos.map(c => ({ ...c, mapeamentoId }))
      );
    }
  });
}

// =====================================================
// SINCRONIZAÇÕES (LOG)
// =====================================================

export async function listarSincronizacoes(mapeamentoId?: number, limite = 50) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];
    let query = db.select().from(integracaoSincronizacoes);
    if (mapeamentoId) {
      query = query.where(eq(integracaoSincronizacoes.mapeamentoId, mapeamentoId)) as any;
    }
    return query.orderBy(desc(integracaoSincronizacoes.iniciadoEm)).limit(limite);
  });
}

export async function criarSincronizacao(dados: Omit<InsertIntegracaoSincronizacao, "id" | "iniciadoEm">) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    const [result] = await db.insert(integracaoSincronizacoes).values(dados);
    return result.insertId;
  });
}

export async function atualizarSincronizacao(id: number, dados: Partial<InsertIntegracaoSincronizacao>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");
    await db.update(integracaoSincronizacoes).set(dados).where(eq(integracaoSincronizacoes.id, id));
  });
}

export async function obterSincronizacao(id: number) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(integracaoSincronizacoes).where(eq(integracaoSincronizacoes.id, id)).limit(1);
    return row ?? null;
  });
}

// =====================================================
// DDL DINÂMICO - Criar/Alterar tabelas no MySQL
// =====================================================

function tipoMySQLParaColuna(col: { tipo: string; tamanho?: number | null; precisao?: number | null }): string {
  switch (col.tipo) {
    case "varchar": return `VARCHAR(${col.tamanho || 255})`;
    case "int": return "INT";
    case "bigint": return "BIGINT";
    case "decimal": return `DECIMAL(${col.tamanho || 18}, ${col.precisao || 2})`;
    case "text": return "TEXT";
    case "date": return "DATE";
    case "datetime": return "DATETIME";
    case "boolean": return "TINYINT(1)";
    default: return "VARCHAR(255)";
  }
}

export async function executarDDLCriarTabela(nomeTabela: string, colunas: Array<{
  nome: string;
  tipo: string;
  tamanho?: number | null;
  precisao?: number | null;
  obrigatorio: string;
  chaveUnica: string;
  valorPadrao?: string | null;
}>) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    // Validar nome da tabela (prevenir SQL injection)
    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    if (nomeSeguro !== nomeTabela) {
      throw new Error("Nome da tabela contém caracteres inválidos. Use apenas letras, números e underscore.");
    }

    const colunasSQL = colunas.map(col => {
      const nomeCol = col.nome.replace(/[^a-zA-Z0-9_]/g, "");
      const tipoSQL = tipoMySQLParaColuna(col);
      const notNull = col.obrigatorio === "sim" ? " NOT NULL" : "";
      const defaultVal = col.valorPadrao ? ` DEFAULT '${col.valorPadrao.replace(/'/g, "''")}'` : "";
      return `  \`${nomeCol}\` ${tipoSQL}${notNull}${defaultVal}`;
    });

    // Adicionar coluna id auto-increment, estabelecimento_id e timestamps
    const ddl = `CREATE TABLE IF NOT EXISTS \`integ_${nomeSeguro}\` (
    \`_id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`estabelecimento_id\` INT DEFAULT NULL,
  ${colunasSQL.join(",\n")},
    \`_sincronizado_em\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    \`_atualizado_em\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX \`idx_estabelecimento\` (\`estabelecimento_id\`)
  )`;

    await db.execute(sql.raw(ddl));
    return `integ_${nomeSeguro}`;
  });
}

export async function executarDDLAdicionarColuna(nomeTabela: string, coluna: {
  nome: string;
  tipo: string;
  tamanho?: number | null;
  precisao?: number | null;
  obrigatorio: string;
  valorPadrao?: string | null;
}) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    const nomeCol = coluna.nome.replace(/[^a-zA-Z0-9_]/g, "");
    const tipoSQL = tipoMySQLParaColuna(coluna);
    const notNull = coluna.obrigatorio === "sim" ? " NOT NULL" : "";
    const defaultVal = coluna.valorPadrao ? ` DEFAULT '${coluna.valorPadrao.replace(/'/g, "''")}'` : "";

    const ddl = `ALTER TABLE \`${nomeSeguro}\` ADD COLUMN \`${nomeCol}\` ${tipoSQL}${notNull}${defaultVal}`;
    await db.execute(sql.raw(ddl));
  });
}

export async function executarDDLRemoverTabela(nomeTabela: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    // Só permite remover tabelas com prefixo integ_ por segurança
    if (!nomeSeguro.startsWith("integ_")) {
      throw new Error("Só é possível remover tabelas criadas pelo integrador (prefixo integ_)");
    }

    await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${nomeSeguro}\``));
  });
}

export async function limparDadosTabela(nomeTabela: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    // Só permite limpar tabelas com prefixo integ_ por segurança
    if (!nomeSeguro.startsWith("integ_")) {
      throw new Error("Só é possível limpar tabelas criadas pelo integrador (prefixo integ_)");
    }

    await db.execute(sql.raw(`DELETE FROM \`${nomeSeguro}\``));
  });
}

/**
 * Sanitiza um valor para inserção SQL no MySQL.
 * Trata datas em formato JavaScript toString(), objetos Date, e strings genéricas.
 */
function sanitizarValorSQL(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  
  // Se for um objeto Date nativo
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "NULL";
    return `'${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')} ${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}:${String(v.getSeconds()).padStart(2, '0')}'`;
  }
  
  const str = String(v);
  
  // Detectar datas no formato JavaScript toString()
  // Ex: "Thu Feb 06 2025 11:04:00 GMT-0500 (Eastern Standard Time)"
  const jsDateRegex = /^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}\s\d{4}\s\d{2}:\d{2}:\d{2}\s/;
  if (jsDateRegex.test(str)) {
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getUTCFullYear();
        const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        const d = String(parsed.getUTCDate()).padStart(2, '0');
        const h = String(parsed.getUTCHours()).padStart(2, '0');
        const mi = String(parsed.getUTCMinutes()).padStart(2, '0');
        const s = String(parsed.getUTCSeconds()).padStart(2, '0');
        return `'${y}-${m}-${d} ${h}:${mi}:${s}'`;
      }
    } catch {
      // Se falhar o parse, tratar como string normal
    }
  }
  
  // Detectar datas ISO 8601 (ex: "2025-02-06T16:04:00.000Z")
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  if (isoDateRegex.test(str)) {
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getUTCFullYear();
        const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        const d = String(parsed.getUTCDate()).padStart(2, '0');
        const h = String(parsed.getUTCHours()).padStart(2, '0');
        const mi = String(parsed.getUTCMinutes()).padStart(2, '0');
        const s = String(parsed.getUTCSeconds()).padStart(2, '0');
        return `'${y}-${m}-${d} ${h}:${mi}:${s}'`;
      }
    } catch {
      // Se falhar o parse, tratar como string normal
    }
  }
  
  // Truncar strings muito longas para evitar erros de VARCHAR(255)
  const truncated = str.length > 250 ? str.substring(0, 250) : str;
  const escaped = truncated.replace(/'/g, "''").replace(/\\/g, "\\\\");
  return `'${escaped}'`;;
}

export async function inserirDadosTabela(nomeTabela: string, registros: Record<string, any>[], campoChave?: string) {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    if (registros.length === 0) {
      console.log(`[inserirDadosTabela] Nenhum registro para inserir na tabela ${nomeTabela}`);
      return { inseridos: 0 };
    }

    console.log(`[inserirDadosTabela] Iniciando inserção de ${registros.length} registros na tabela ${nomeTabela}`);
    console.log(`[inserirDadosTabela] Primeiro registro:`, JSON.stringify(registros[0]).substring(0, 300));
    console.log(`[inserirDadosTabela] Colunas:`, Object.keys(registros[0]));

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    const colunas = Object.keys(registros[0]);
    const colunasSQL = colunas.map(c => `\`${c.replace(/[^a-zA-Z0-9_]/g, "")}\``).join(", ");
    console.log(`[inserirDadosTabela] Nome tabela seguro: ${nomeSeguro}, Colunas SQL: ${colunasSQL}`);

    let inseridos = 0;
    // Inserir em lotes de 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const lote = registros.slice(i, i + BATCH_SIZE);
      const valoresSQL = lote.map(reg => {
        const vals = colunas.map(c => sanitizarValorSQL(reg[c]));
        return `(${vals.join(", ")})`;
      }).join(",\n");

      let insertSQL = `INSERT INTO \`${nomeSeguro}\` (${colunasSQL}) VALUES\n${valoresSQL}`;
      console.log(`[inserirDadosTabela] Lote ${i}-${i + lote.length}: SQL length=${insertSQL.length}, primeiros 300 chars:`, insertSQL.substring(0, 300));
      
      // Se tem campo chave, usar ON DUPLICATE KEY UPDATE para upsert
      if (campoChave) {
        const updateCols = colunas
          .filter(c => c !== campoChave)
          .map(c => {
            const safe = `\`${c.replace(/[^a-zA-Z0-9_]/g, "")}\``;
            return `${safe} = VALUES(${safe})`;
          })
          .join(", ");
        if (updateCols) {
          insertSQL += ` ON DUPLICATE KEY UPDATE ${updateCols}`;
        }
      }
      
      try {
        await db.execute(sql.raw(insertSQL));
        inseridos += lote.length;
        console.log(`[inserirDadosTabela] Lote ${i}-${i + lote.length} inserido com sucesso. Total acumulado: ${inseridos}`);
      } catch (err: any) {
        console.error(`[inserirDadosTabela] Erro ao inserir lote ${i}-${i + lote.length} na tabela ${nomeSeguro}:`, err.message);
        // Tentar inserir registro por registro para identificar o problemático
        for (const reg of lote) {
          try {
            const vals = colunas.map(c => sanitizarValorSQL(reg[c]));
            const singleSQL = `INSERT INTO \`${nomeSeguro}\` (${colunasSQL}) VALUES (${vals.join(", ")})`;
            await db.execute(sql.raw(singleSQL));
            inseridos++;
          } catch (singleErr: any) {
            console.error(`[inserirDadosTabela] Registro ignorado:`, singleErr.message?.substring(0, 200));
          }
        }
      }
    }

    console.log(`[inserirDadosTabela] Inserção concluída. Total de registros inseridos: ${inseridos}`);
    return { inseridos };
  });
}

export async function contarRegistrosTabela(nomeTabela: string): Promise<number> {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return 0;

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    try {
      const result = await db.execute(sql.raw(`SELECT COUNT(*) as total FROM \`${nomeSeguro}\``));
      const rows = result[0] as unknown as any[];
      return rows[0]?.total || 0;
    } catch {
      return 0;
    }
  });
}

export async function consultarDadosTabela(nomeTabela: string, limite = 100, offset = 0): Promise<any[]> {
  return withRetry(async () => {
    const db = await getDb();
    if (!db) return [];

    const nomeSeguro = nomeTabela.replace(/[^a-zA-Z0-9_]/g, "");
    try {
      const result = await db.execute(sql.raw(`SELECT * FROM \`${nomeSeguro}\` ORDER BY _id DESC LIMIT ${limite} OFFSET ${offset}`));
      return result[0] as unknown as any[];
    } catch {
      return [];
    }
  });
}
