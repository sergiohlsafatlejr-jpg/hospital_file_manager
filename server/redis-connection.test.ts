import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initRedis, closeRedis, cacheSet, cacheGet, isRedisConnected } from "../server/_core/cache";

describe("Redis Connection", () => {
  beforeAll(async () => {
    await initRedis();
  });

  afterAll(async () => {
    await closeRedis();
  });

  it("deve conectar ao Redis Cloud", async () => {
    expect(isRedisConnected()).toBe(true);
  });

  it("deve armazenar e recuperar valor do cache", async () => {
    const testKey = "test:redis:connection";
    const testValue = { message: "Redis conectado com sucesso!", timestamp: new Date() };

    // Armazena no cache
    await cacheSet(testKey, testValue, 60);

    // Recupera do cache
    const cached = await cacheGet<typeof testValue>(testKey);

    expect(cached).toBeDefined();
    expect(cached?.message).toBe("Redis conectado com sucesso!");
  });

  it("deve retornar null para chave inexistente", async () => {
    const testKey = "test:redis:nonexistent";
    const cached = await cacheGet(testKey);

    expect(cached).toBeNull();
  });
});
