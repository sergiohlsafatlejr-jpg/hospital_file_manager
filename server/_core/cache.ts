import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

/**
 * Cache Redis com TTL (Time To Live)
 * Implementa cache distribuído para queries frequentes
 * Suporta invalidação automática e manual
 */

let redisClient: RedisClientType | null = null;

/**
 * Inicializa conexão com Redis
 */
export async function initRedis(): Promise<void> {
  if (redisClient) return;

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error("Redis: Máximo de tentativas de reconexão atingido");
            return new Error("Redis max retries exceeded");
          }
          return retries * 100;
        },
      },
    });

    redisClient.on("error", (err) => {
      logger.error("Redis Client Error", { error: err.message });
    });

    redisClient.on("connect", () => {
      logger.info("Redis: Conectado com sucesso");
    });

    await redisClient.connect();
  } catch (error) {
    logger.error("Redis: Falha ao conectar", { error });
    redisClient = null;
  }
}

/**
 * Fecha conexão com Redis
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Define valor em cache com TTL
 * @param key Chave do cache
 * @param value Valor a armazenar (será serializado como JSON)
 * @param ttlSeconds TTL em segundos (padrão: 3600s = 1 hora)
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 3600
): Promise<void> {
  if (!redisClient) {
    logger.warn("Cache: Redis não está conectado, ignorando SET", { key });
    return;
  }

  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value) as any);
    logger.debug("Cache: SET", { key, ttl: ttlSeconds });
  } catch (error) {
    logger.error("Cache: Erro ao SET", { key, error });
  }
}

/**
 * Obtém valor do cache
 * @param key Chave do cache
 * @returns Valor desserializado ou null se não encontrado
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisClient) {
    logger.warn("Cache: Redis não está conectado, ignorando GET", { key });
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (value) {
      logger.debug("Cache: HIT", { key });
      return JSON.parse(value) as T;
    }
    logger.debug("Cache: MISS", { key });
    return null;
  } catch (error) {
    logger.error("Cache: Erro ao GET", { key, error });
    return null;
  }
}

/**
 * Remove valor do cache
 * @param key Chave do cache
 */
export async function cacheDel(key: string): Promise<void> {
  if (!redisClient) return;

  try {
    await redisClient.del(key);
    logger.debug("Cache: DEL", { key });
  } catch (error) {
    logger.error("Cache: Erro ao DEL", { key, error });
  }
}

/**
 * Remove múltiplas chaves do cache
 * @param keys Array de chaves
 */
export async function cacheDelMultiple(keys: string[]): Promise<void> {
  if (!redisClient || keys.length === 0) return;

  try {
    await redisClient.del(keys);
    logger.debug("Cache: DEL MULTIPLE", { count: keys.length });
  } catch (error) {
    logger.error("Cache: Erro ao DEL MULTIPLE", { error });
  }
}

/**
 * Limpa cache com padrão (ex: "faturamento:*")
 * @param pattern Padrão de chaves (glob pattern)
 */
export async function cacheClearPattern(pattern: string): Promise<void> {
  if (!redisClient) return;

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.debug("Cache: CLEAR PATTERN", { pattern, count: keys.length });
    }
  } catch (error) {
    logger.error("Cache: Erro ao CLEAR PATTERN", { pattern, error });
  }
}

/**
 * Wrapper para cache com fallback a função
 * Se valor não está em cache, executa função e armazena resultado
 * @param key Chave do cache
 * @param fn Função que retorna valor
 * @param ttlSeconds TTL em segundos
 */
export async function cacheGetOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 3600
): Promise<T> {
  // Tenta obter do cache
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Se não está em cache, executa função
  const value = await fn();

  // Armazena em cache
  await cacheSet(key, value, ttlSeconds);

  return value;
}

/**
 * Invalidar cache de faturamento
 * Chamado quando faturamento é criado/atualizado/deletado
 */
export async function invalidateFaturamentoCache(
  estabelecimentoId: number
): Promise<void> {
  await cacheClearPattern(`faturamento:${estabelecimentoId}:*`);
  await cacheClearPattern(`relatorios:faturamento:${estabelecimentoId}:*`);
}

/**
 * Invalidar cache de glosa
 * Chamado quando glosa é criada/atualizada/deletada
 */
export async function invalidateGlosaCache(
  estabelecimentoId: number
): Promise<void> {
  await cacheClearPattern(`glosa:${estabelecimentoId}:*`);
  await cacheClearPattern(`relatorios:glosa:${estabelecimentoId}:*`);
}

/**
 * Invalidar cache de comparações
 * Chamado quando comparação é criada/atualizada/deletada
 */
export async function invalidateComparacoesCache(
  estabelecimentoId: number
): Promise<void> {
  await cacheClearPattern(`comparacoes:${estabelecimentoId}:*`);
  await cacheClearPattern(`relatorios:comparacoes:${estabelecimentoId}:*`);
}

/**
 * Gera chave de cache para faturamento
 * @param estabelecimentoId ID do estabelecimento
 * @param mes Mês (formato: YYYY-MM)
 * @param status Status do faturamento (opcional)
 */
export function generateFaturamentoKey(
  estabelecimentoId: number,
  mes: string,
  status?: string
): string {
  return `faturamento:${estabelecimentoId}:${mes}${status ? `:${status}` : ""}`;
}

/**
 * Gera chave de cache para glosa
 * @param estabelecimentoId ID do estabelecimento
 * @param faturamentoId ID do faturamento (opcional)
 * @param status Status da glosa (opcional)
 */
export function generateGlosaKey(
  estabelecimentoId: number,
  faturamentoId?: number,
  status?: string
): string {
  return `glosa:${estabelecimentoId}${faturamentoId ? `:${faturamentoId}` : ""}${status ? `:${status}` : ""}`;
}

/**
 * Gera chave de cache para comparações
 * @param estabelecimentoId ID do estabelecimento
 * @param mes Mês (formato: YYYY-MM)
 */
export function generateComparacoesKey(
  estabelecimentoId: number,
  mes: string
): string {
  return `comparacoes:${estabelecimentoId}:${mes}`;
}

/**
 * Gera chave de cache para relatórios
 * @param tipo Tipo de relatório (faturamento, glosa, comparacoes)
 * @param estabelecimentoId ID do estabelecimento
 * @param periodo Período (YYYY-MM)
 */
export function generateRelatorioKey(
  tipo: string,
  estabelecimentoId: number,
  periodo: string
): string {
  return `relatorios:${tipo}:${estabelecimentoId}:${periodo}`;
}

/**
 * Configurações de TTL por tipo de query
 */
export const CACHE_TTL = {
  // Dados de faturamento (1 hora)
  FATURAMENTO: 3600,

  // Dados de glosa (1 hora)
  GLOSA: 3600,

  // Comparações (30 minutos - mais frequentemente atualizado)
  COMPARACOES: 1800,

  // Relatórios (2 horas)
  RELATORIOS: 7200,

  // Dados de auditoria (não cachear - sempre fresco)
  AUDITORIA: 0,

  // Dados de Tasy (4 horas)
  TASY: 14400,

  // Permissões (1 dia)
  PERMISSOES: 86400,

  // Configurações (1 dia)
  CONFIGURACOES: 86400,
};

/**
 * Status da conexão Redis
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isOpen;
}

/**
 * Obtém informações de saúde do Redis
 */
export async function getRedisHealth(): Promise<{
  connected: boolean;
  info?: string;
  error?: string;
}> {
  if (!redisClient) {
    return { connected: false, error: "Redis não inicializado" };
  }

  try {
    const info = await redisClient.ping();
    return { connected: true, info };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
