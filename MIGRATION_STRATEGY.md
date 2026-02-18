# Estratégia de Migração de Procedures - Strangler Pattern

## Visão Geral

Este documento descreve a estratégia de migração gradual do monolito para módulos modularizados usando o **Strangler Pattern** com **Feature Flags** e **Canary Deployment**.

## Fases de Migração

### Fase 1: Faturamento (5% de tráfego)
- **Status**: ✅ Implementado
- **Procedures Migradas**: create, list, get, update, delete
- **Cache**: Redis com TTL 1 hora
- **Feature Flag**: `ENABLE_MODULO_FATURAMENTO=true`
- **Tráfego**: 5% (canary deployment)
- **Fallback**: Automático para monolito se erro > 5%

### Fase 2: Glosa (5% de tráfego)
- **Status**: ✅ Implementado
- **Procedures Migradas**: create, list, get, update, delete
- **Cache**: Redis com TTL 1 hora
- **Feature Flag**: `ENABLE_MODULO_GLOSA=true`
- **Tráfego**: 5% (canary deployment)
- **Fallback**: Automático para monolito se erro > 5%

### Fase 3: Comparações (10% de tráfego)
- **Status**: ✅ Implementado
- **Procedures Migradas**: create, list, get, update, delete
- **Cache**: Redis com TTL 30 minutos
- **Feature Flag**: `ENABLE_MODULO_COMPARACOES=true`
- **Tráfego**: 10% (canary deployment)
- **Fallback**: Automático para monolito se erro > 5%

### Fase 4: Tasy (10% de tráfego)
- **Status**: ⏳ Pendente
- **Procedures Esperadas**: importar, listar, validar
- **Cache**: Redis com TTL 2 horas
- **Feature Flag**: `ENABLE_MODULO_TASY=true`
- **Tráfego**: 10% (canary deployment)

### Fase 5: Relatórios (20% de tráfego)
- **Status**: ⏳ Pendente
- **Procedures Esperadas**: gerar, listar, exportar
- **Cache**: Redis com TTL 4 horas
- **Feature Flag**: `ENABLE_MODULO_RELATORIOS=true`
- **Tráfego**: 20% (canary deployment)

## Arquitetura de Feature Flags

### Arquivo: `server/_core/featureFlags.ts`

```typescript
export const featureFlags = {
  faturamento: {
    enabled: process.env.ENABLE_MODULO_FATURAMENTO === 'true',
    trafficPercentage: 5,           // 5% de tráfego
    canaryDeployment: true,         // Usar hash de userId
    fallbackToMonolith: true,       // Fallback automático
    maxErrorRate: 5,                // Máximo 5% de erro
  },
  // ... outros módulos
};
```

### Uso em Procedures

```typescript
export function shouldUseModule(moduleName: string, userId?: string): boolean {
  const config = featureFlags[moduleName];
  
  if (!config || !config.enabled) return false;
  
  // Canary deployment: hash do userId
  if (config.canaryDeployment) {
    const hash = userId ? hashUserId(userId) : Math.random() * 100;
    if (hash > config.trafficPercentage) return false;
  }
  
  return true;
}
```

## Padrão de Implementação

### 1. Criar Router Modularizado

```typescript
// server/routers/novoRouter.ts
import { router, trackedProtectedProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { logger } from "../_core/logger";
import { sql } from "drizzle-orm";

const ENABLE_NOVO_MODULO = process.env.ENABLE_MODULO_NOVO === "true";

export const novoRouter = router({
  create: trackedProtectedProcedure
    .input(z.object({ /* ... */ }))
    .mutation(async ({ input, ctx }) => {
      if (!ENABLE_NOVO_MODULO) {
        throw new Error("Módulo não ativado");
      }
      // Implementação
    }),
  // ... outras procedures
});
```

### 2. Registrar no Agregador

```typescript
// server/routers/index.ts
import { novoRouter } from "./novoRouter";

export const modulesRouter = router({
  novo: novoRouter,
  // ... outros routers
});

export const MODULOS_ATIVOS = {
  novo: process.env.ENABLE_MODULO_NOVO === "true",
  // ... outros módulos
};
```

### 3. Implementar Cache Redis

```typescript
// server/_core/cache.ts
export const CACHE_TTL = {
  NOVO: 3600, // 1 hora
};

export async function invalidateNovoCache(id: number): Promise<void> {
  const keys = await redis.keys(`novo:${id}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export function generateNovoKey(id: number, tipo: string): string {
  return `novo:${id}:${tipo}`;
}
```

### 4. Criar Testes Vitest

```typescript
// server/routers/novoRouter.test.ts
import { describe, it, expect } from "vitest";
import { novoRouter } from "./novoRouter";

describe("novoRouter", () => {
  it("deve ter as procedures esperadas", () => {
    const caller = novoRouter.createCaller({} as any);
    expect(caller.create).toBeDefined();
    expect(caller.list).toBeDefined();
    expect(caller.get).toBeDefined();
    expect(caller.update).toBeDefined();
    expect(caller.delete).toBeDefined();
  });
});
```

## Rollout Gradual

### Passo 1: Ativar com 5% de Tráfego
```bash
export ENABLE_MODULO_FATURAMENTO=true
export FATURAMENTO_TRAFFIC_PERCENTAGE=5
```

### Passo 2: Monitorar Métricas
- Acessar `/cache-dashboard`
- Verificar hit rate, erros, tempo de resposta
- Alertas automáticos se hit rate < 70%

### Passo 3: Expandir Gradualmente
```bash
# Dia 1: 5%
export FATURAMENTO_TRAFFIC_PERCENTAGE=5

# Dia 2: 10%
export FATURAMENTO_TRAFFIC_PERCENTAGE=10

# Dia 3: 25%
export FATURAMENTO_TRAFFIC_PERCENTAGE=25

# Dia 4: 50%
export FATURAMENTO_TRAFFIC_PERCENTAGE=50

# Dia 5: 100%
export FATURAMENTO_TRAFFIC_PERCENTAGE=100
```

### Passo 4: Validar Estabilidade
- Verificar logs de erro
- Comparar performance com monolito
- Validar dados em produção

## Fallback Automático

Se a taxa de erro exceder 5%, o sistema automaticamente volta para o monolito:

```typescript
export function recordModuleError(moduleName: string): void {
  if (!errorMetrics[moduleName]) {
    errorMetrics[moduleName] = { errors: 0, total: 0 };
  }
  errorMetrics[moduleName].errors++;
  errorMetrics[moduleName].total++;
}

// Se errorRate > 5%, shouldUseModule retorna false
```

## Dashboard de Cache

Acesso em: `http://localhost:3000/cache-dashboard`

**Métricas Disponíveis:**
- Total de requisições
- Cache hits (acertos)
- Cache misses (falhas)
- Hit rate (taxa de acerto)
- Tempo médio de resposta
- Uso de memória
- Status de conexão Redis
- Chaves em cache com TTL

**Alertas:**
- ⚠️ Hit rate < 70% (amarelo)
- 🔴 Hit rate < 50% (vermelho)

## Procedures Migradas por Módulo

### Faturamento
- ✅ create: Criar faturamento
- ✅ list: Listar faturamentos
- ✅ get: Obter faturamento por ID
- ✅ update: Atualizar faturamento
- ✅ delete: Deletar faturamento

### Glosa
- ✅ create: Criar glosa
- ✅ list: Listar glosas
- ✅ get: Obter glosa por ID
- ✅ update: Atualizar glosa
- ✅ delete: Deletar glosa

### Comparações
- ✅ create: Criar comparação
- ✅ list: Listar comparações
- ✅ get: Obter comparação por ID
- ✅ update: Atualizar comparação
- ✅ delete: Deletar comparação

## Próximas Etapas

1. **Ativar módulo de faturamento** com 5% de tráfego
2. **Monitorar por 24h** e expandir para 10%
3. **Migrar módulo de glosa** com mesmo padrão
4. **Implementar histórico de validações XML**
5. **Migrar 50% das procedures restantes**

## Referências

- [Strangler Pattern](https://martinfowler.com/bliki/StranglerFigApplication.html)
- [Canary Deployment](https://martinfowler.com/bliki/CanaryRelease.html)
- [Feature Flags](https://martinfowler.com/articles/feature-toggles.html)
