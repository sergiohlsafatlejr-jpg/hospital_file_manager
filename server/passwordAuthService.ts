import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";
import { getRawPool } from "./db";
import { enviarEmail } from "./emailService";

const RESET_EXPIRATION_MINUTES = 30;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_EMAIL_LIMIT = 5;
const LOGIN_IP_LIMIT = 20;
const RESET_WINDOW_MINUTES = 60;
const RESET_EMAIL_LIMIT = 3;
const RESET_IP_LIMIT = 10;
const MIN_RESET_RESPONSE_MS = 450;
const DUMMY_PASSWORD_HASH = "$2b$12$ptqc8UpzRIjhhHs3pPhHlO4VCGCTMTu5yeoWo/wIgxJKdr.5b5U1C";

type RateLimitScope = "login_email" | "login_ip" | "reset_email" | "reset_ip";

export type PasswordAuthUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin" | "tasy_user";
  loginMethod: string | null;
  passwordHash: string | null;
  sessionVersion: number;
  activeAccesses: number;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashSensitiveValue(value: string) {
  return createHmac("sha256", ENV.cookieSecret).update(value).digest("hex");
}

export function hashResetToken(token: string) {
  return hashSensitiveValue(token);
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 10) return "A senha deve ter pelo menos 10 caracteres";
  if (password.length > 128) return "A senha deve ter no máximo 128 caracteres";
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula";
  if (!/\d/.test(password)) return "Inclua pelo menos um número";
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] || char);
}

async function getPool() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  return pool;
}

export async function findUserForPasswordAuth(email: string): Promise<PasswordAuthUser | null> {
  const pool = await getPool();
  const normalized = normalizeEmail(email);
  const [rows] = await pool.execute<any[]>(`
    SELECT u.id,u.openId,u.name,u.email,u.role,u.loginMethod,u.passwordHash,u.sessionVersion,
      (SELECT COUNT(*) FROM permissoesEstabelecimento pe
       WHERE pe.userId=u.id AND pe.podeVisualizar='sim') AS activeAccesses
    FROM users u
    WHERE u.emailCanonical=?
    LIMIT 1
  `, [normalized]);
  return rows[0] ? {
    ...rows[0],
    sessionVersion: Number(rows[0].sessionVersion || 0),
    activeAccesses: Number(rows[0].activeAccesses || 0),
  } : null;
}

function rateBucket(scope: RateLimitScope, valueHash: string) {
  return hashSensitiveValue(`${scope}:${valueHash}`);
}

async function reserveRateLimit(
  scope: RateLimitScope,
  valueHash: string,
  windowMinutes: number,
  limit: number,
) {
  const pool = await getPool();
  const bucketHash = rateBucket(scope, valueHash);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT IGNORE INTO authRateLimits (bucketHash,scope,attemptCount,windowStartedAt) VALUES (?,?,0,NOW())`,
      [bucketHash, scope],
    );
    const [rows] = await connection.execute<any[]>(`
      SELECT attemptCount,
        CASE WHEN windowStartedAt<DATE_SUB(NOW(),INTERVAL ? MINUTE) THEN 1 ELSE 0 END AS expired
      FROM authRateLimits WHERE bucketHash=? LIMIT 1 FOR UPDATE
    `, [windowMinutes, bucketHash]);
    const expired = Number(rows[0]?.expired || 0) === 1;
    const nextCount = expired ? 1 : Number(rows[0]?.attemptCount || 0) + 1;
    await connection.execute(`
      UPDATE authRateLimits
      SET attemptCount=?,windowStartedAt=CASE WHEN ?=1 THEN NOW() ELSE windowStartedAt END,updatedAt=NOW()
      WHERE bucketHash=?
    `, [nextCount, expired ? 1 : 0, bucketHash]);
    await connection.commit();
    return { allowed: nextCount <= limit, count: nextCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function clearRateLimit(scope: RateLimitScope, valueHash: string) {
  const pool = await getPool();
  await pool.execute(`DELETE FROM authRateLimits WHERE bucketHash=?`, [rateBucket(scope, valueHash)]);
}

async function registerEvent(
  eventType: "login_success" | "login_failure" | "reset_request",
  emailHash: string,
  ipHash: string,
  userId?: number | null,
) {
  const pool = await getPool();
  await pool.execute(
    `INSERT INTO authSecurityEvents (userId,eventType,emailHash,ipHash) VALUES (?,?,?,?)`,
    [userId || null, eventType, emailHash, ipHash],
  );
}

async function cleanupExpiredAuthData() {
  const pool = await getPool();
  await Promise.all([
    pool.execute(`DELETE FROM authSecurityEvents WHERE createdAt<DATE_SUB(NOW(),INTERVAL 90 DAY)`),
    pool.execute(`DELETE FROM passwordResetTokens WHERE expiresAt<DATE_SUB(NOW(),INTERVAL 7 DAY)`),
    pool.execute(`DELETE FROM authRateLimits WHERE updatedAt<DATE_SUB(NOW(),INTERVAL 2 DAY)`),
  ]);
}

function scheduleCleanup() {
  if (Math.random() < 0.01) void cleanupExpiredAuthData().catch(() => undefined);
}

async function waitMinimum(startedAt: number) {
  const remaining = MIN_RESET_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

export async function authenticateWithPassword(email: string, password: string, clientIp: string) {
  scheduleCleanup();
  const normalized = normalizeEmail(email);
  const emailHash = hashSensitiveValue(normalized);
  const ipHash = hashSensitiveValue(clientIp || "unknown");
  const [emailQuota, ipQuota] = await Promise.all([
    reserveRateLimit("login_email", emailHash, LOGIN_WINDOW_MINUTES, LOGIN_EMAIL_LIMIT),
    reserveRateLimit("login_ip", ipHash, LOGIN_WINDOW_MINUTES, LOGIN_IP_LIMIT),
  ]);
  if (!emailQuota.allowed || !ipQuota.allowed) {
    return { success: false as const, rateLimited: true as const };
  }

  const user = await findUserForPasswordAuth(normalized);
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  const hasAccess = user?.role === "admin" || Number(user?.activeAccesses || 0) > 0;
  if (!user || !user.passwordHash || !valid || !hasAccess) {
    await registerEvent("login_failure", emailHash, ipHash, user?.id);
    return { success: false as const, rateLimited: false as const };
  }

  const pool = await getPool();
  await Promise.all([
    registerEvent("login_success", emailHash, ipHash, user.id),
    pool.execute(`UPDATE users SET lastSignedIn=NOW() WHERE id=?`, [user.id]),
    clearRateLimit("login_email", emailHash),
  ]);
  return { success: true as const, user };
}

async function sendResetEmail(user: PasswordAuthUser, token: string, tokenId: number, appOrigin: string) {
  const pool = await getPool();
  const resetUrl = `${appOrigin}/redefinir-senha#token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(user.name?.trim() || "usuário");
  const emailResult = await enviarEmail({
    destinatario: user.email!,
    assunto: "Redefinição de senha — Portal Safatle",
    conteudoTexto: `Olá, ${user.name?.trim() || "usuário"}. Use este link para criar uma nova senha no Portal Safatle: ${resetUrl}. O link expira em ${RESET_EXPIRATION_MINUTES} minutos e só pode ser usado uma vez. Se você não solicitou, ignore este e-mail.`,
    conteudoHtml: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:#0f2745;padding:24px 28px;color:#fff"><strong style="font-size:20px">Portal Safatle</strong><div style="margin-top:6px;color:#bfdbfe">Redefinição segura de senha</div></div><div style="padding:28px"><p>Olá, ${safeName}.</p><p>Recebemos uma solicitação para criar uma nova senha para sua conta.</p><p style="margin:28px 0"><a href="${resetUrl}" style="display:inline-block;background:#0f2745;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Criar nova senha</a></p><p style="font-size:14px;color:#475569">Este link expira em ${RESET_EXPIRATION_MINUTES} minutos e só pode ser usado uma vez.</p><p style="font-size:13px;color:#64748b">Se você não solicitou esta alteração, ignore este e-mail. Sua conta continuará protegida.</p></div></div></body></html>`,
  });

  if (!emailResult.ok) {
    await pool.execute(`DELETE FROM passwordResetTokens WHERE id=?`, [tokenId]);
    console.error("[PasswordAuth] Falha ao enviar e-mail de recuperação");
  }
}

export async function requestPasswordReset(email: string, clientIp: string, appOrigin: string) {
  const startedAt = Date.now();
  scheduleCleanup();
  const normalized = normalizeEmail(email);
  const emailHash = hashSensitiveValue(normalized);
  const ipHash = hashSensitiveValue(clientIp || "unknown");
  const [emailQuota, ipQuota] = await Promise.all([
    reserveRateLimit("reset_email", emailHash, RESET_WINDOW_MINUTES, RESET_EMAIL_LIMIT),
    reserveRateLimit("reset_ip", ipHash, RESET_WINDOW_MINUTES, RESET_IP_LIMIT),
  ]);

  const user = await findUserForPasswordAuth(normalized);
  await registerEvent("reset_request", emailHash, ipHash, user?.id);
  const hasAccess = user?.role === "admin" || Number(user?.activeAccesses || 0) > 0;
  if (!emailQuota.allowed || !ipQuota.allowed || !user?.email || !hasAccess) {
    await waitMinimum(startedAt);
    return { accepted: true as const, rateLimited: !emailQuota.allowed || !ipQuota.allowed };
  }

  const pool = await getPool();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const connection = await pool.getConnection();
  let insertedTokenId: number;
  try {
    await connection.beginTransaction();
    await connection.execute(`SELECT id FROM users WHERE id=? FOR UPDATE`, [user.id]);
    await connection.execute(`UPDATE passwordResetTokens SET usedAt=NOW() WHERE userId=? AND usedAt IS NULL`, [user.id]);
    const [insert] = await connection.execute<any>(`
      INSERT INTO passwordResetTokens (userId,tokenHash,expiresAt)
      VALUES (?,?,DATE_ADD(NOW(), INTERVAL ? MINUTE))
    `, [user.id, tokenHash, RESET_EXPIRATION_MINUTES]);
    insertedTokenId = Number(insert.insertId);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  void sendResetEmail(user, token, insertedTokenId, appOrigin).catch(async () => {
    await pool.execute(`DELETE FROM passwordResetTokens WHERE id=?`, [insertedTokenId]).catch(() => undefined);
  });
  await waitMinimum(startedAt);
  return { accepted: true as const, rateLimited: false as const };
}

export async function isResetTokenValid(token: string) {
  if (!token || token.length < 32 || token.length > 200) return false;
  const pool = await getPool();
  const [rows] = await pool.execute<any[]>(`
    SELECT id FROM passwordResetTokens
    WHERE tokenHash=? AND usedAt IS NULL AND expiresAt>NOW()
    LIMIT 1
  `, [hashResetToken(token)]);
  return rows.length === 1;
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const policyError = validateNewPassword(newPassword);
  if (policyError) return { success: false as const, message: policyError };
  if (!token || token.length < 32 || token.length > 200) {
    return { success: false as const, message: "Link inválido ou expirado" };
  }

  const pool = await getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(`
      SELECT id,userId FROM passwordResetTokens
      WHERE tokenHash=? AND usedAt IS NULL AND expiresAt>NOW()
      LIMIT 1 FOR UPDATE
    `, [hashResetToken(token)]);
    const reset = rows[0];
    if (!reset) {
      await connection.rollback();
      return { success: false as const, message: "Link inválido, expirado ou já utilizado" };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await connection.execute(`UPDATE users SET passwordHash=?,sessionVersion=sessionVersion+1,updatedAt=NOW() WHERE id=?`, [passwordHash, reset.userId]);
    await connection.execute(`UPDATE passwordResetTokens SET usedAt=NOW() WHERE userId=? AND usedAt IS NULL`, [reset.userId]);
    const [users] = await connection.execute<any[]>(`SELECT sessionVersion FROM users WHERE id=?`, [reset.userId]);
    await connection.commit();
    return { success: true as const, userId: Number(reset.userId), sessionVersion: Number(users[0]?.sessionVersion || 0) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
