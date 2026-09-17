import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sdk } from "./_core/sdk";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("hardening da autenticação por senha", () => {
  it("assina e recupera a versão revogável da sessão", async () => {
    const token = await sdk.createSessionToken("manual_test", {
      name: "Teste",
      expiresInMs: 60_000,
      sessionVersion: 4,
    });
    const session = await sdk.verifySession(token);
    expect(session).toMatchObject({ openId: "manual_test", sessionVersion: 4 });
  });

  it("valida a versão no banco e mantém compatibilidade controlada com sessões antigas", () => {
    const source = read("server/_core/sdk.ts");
    expect(source).toContain("Session revoked");
    expect(source).toContain('typeof sessionVersion === "number" ? sessionVersion : 0');
  });

  it("não confia diretamente em X-Forwarded-For", () => {
    const router = read("server/routers/passwordAuthRouter.ts");
    const server = read("server/_core/index.ts");
    expect(router).not.toContain('req.headers["x-forwarded-for"]');
    expect(router).toContain("req.ip");
    expect(server).toContain('app.set("trust proxy", 1)');
    expect(server).not.toContain("linklocal");
    expect(server).not.toContain("uniquelocal");
  });

  it("usa bcrypt custo 12 também na comparação dummy", () => {
    const service = read("server/passwordAuthService.ts");
    expect(service).toMatch(/DUMMY_PASSWORD_HASH = "\$2b\$12\$/);
  });

  it("não escolhe por heurística uma identidade com e-mail duplicado", () => {
    const migration = read("drizzle/0111_thin_hydra.sql");
    const db = read("server/db.ts");
    expect(migration).toContain("identities.identityCount = 1");
    expect(migration).not.toContain("ROW_NUMBER()");
    expect(db).toContain("const hasConflict = matches.some");
    expect(db).toContain("hasConflict ? null : canonical");
    expect(db).toContain("createdConcurrently");
    expect(db).toContain("Uma identidade diferente ganhou a corrida pelo mesmo e-mail");
    const upsertSection = db.slice(db.indexOf("export async function upsertUser"), db.indexOf("export async function getUserByOpenId"));
    expect(upsertSection).not.toContain("onDuplicateKeyUpdate");
  });

  it("obriga TLS no SMTP e não coloca o token na query string", () => {
    const email = read("server/emailService.ts");
    const service = read("server/passwordAuthService.ts");
    const resetPage = read("client/src/pages/RedefinirSenha.tsx");
    expect(email).toContain("requireTLS: port !== 465");
    expect(service).toContain("/redefinir-senha#token=");
    expect(service).not.toContain("/redefinir-senha?token=");
    expect(resetPage).toContain("window.location.hash");
  });

  it("protege todo estabelecimento informado em procedures autenticadas", () => {
    const source = read("server/_core/trpc.ts");
    expect(source).toContain('key === "estabelecimentoId"');
    expect(source).toContain('verificarPermissaoEstabelecimento(ctx.user.id, estabelecimentoId, "visualizar")');
  });
});
