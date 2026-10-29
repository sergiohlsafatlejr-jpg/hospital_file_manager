import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "BANCO_INTER_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const PURPOSE = "safatle.banco-inter.credentials.v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export type BancoInterSensitiveField =
  | "clientSecret"
  | "certPem"
  | "keyPem"
  | "contaCorrente";

export class BancoInterVaultError extends Error {
  constructor(readonly kind: "key_unavailable" | "invalid_envelope") {
    super(kind);
    this.name = "BancoInterVaultError";
  }
}

type Envelope = {
  v: 1;
  alg: "A256GCM";
  purpose: typeof PURPOSE;
  nonce: string;
  ciphertext: string;
  tag: string;
};

function decodeBase64Url(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function keyFrom(env: NodeJS.ProcessEnv): Buffer {
  const raw = env[KEY_ENV];
  if (typeof raw !== "string" || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new BancoInterVaultError("key_unavailable");
  }
  return Buffer.from(raw, "hex");
}

function aadFor(bancoId: number, field: BancoInterSensitiveField): Buffer {
  if (!Number.isSafeInteger(bancoId) || bancoId <= 0) {
    throw new BancoInterVaultError("invalid_envelope");
  }
  return Buffer.from(`${PURPOSE}:${bancoId}:${field}`, "utf8");
}

function envelopeFrom(raw: string): { nonce: Buffer; ciphertext: Buffer; tag: Buffer } {
  let parsed: Envelope;
  try {
    parsed = JSON.parse(raw) as Envelope;
  } catch {
    throw new BancoInterVaultError("invalid_envelope");
  }

  if (
    !parsed ||
    parsed.v !== 1 ||
    parsed.alg !== "A256GCM" ||
    parsed.purpose !== PURPOSE ||
    Object.keys(parsed).length !== 6
  ) {
    throw new BancoInterVaultError("invalid_envelope");
  }

  const nonce = decodeBase64Url(parsed.nonce);
  const ciphertext = decodeBase64Url(parsed.ciphertext);
  const tag = decodeBase64Url(parsed.tag);
  if (!nonce || !ciphertext || !tag || nonce.length !== NONCE_BYTES || ciphertext.length === 0 || tag.length !== TAG_BYTES) {
    throw new BancoInterVaultError("invalid_envelope");
  }
  return { nonce, ciphertext, tag };
}

/** True only when the dedicated 32-byte hexadecimal key is configured. */
export function bancoInterEncryptionKeyAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    keyFrom(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cifra um único valor sensível com nonce aleatório e AAD vinculado ao banco e campo.
 * A chave exclusiva nunca é gravada no banco ou no envelope.
 */
export function encryptBancoInterField(
  bancoId: number,
  field: BancoInterSensitiveField,
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new BancoInterVaultError("invalid_envelope");
  }
  const key = keyFrom(env);
  const nonce = randomBytes(NONCE_BYTES);
  const source = Buffer.from(plaintext, "utf8");
  const aad = aadFor(bancoId, field);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad, { plaintextLength: source.length });
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    alg: "A256GCM",
    purpose: PURPOSE,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
  return JSON.stringify(envelope);
}

/** Decifra apenas um envelope autêntico destinado ao mesmo banco e campo. */
export function decryptBancoInterField(
  bancoId: number,
  field: BancoInterSensitiveField,
  raw: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = keyFrom(env);
  const { nonce, ciphertext, tag } = envelopeFrom(raw);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadFor(bancoId, field), { plaintextLength: ciphertext.length });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof BancoInterVaultError) throw error;
    throw new BancoInterVaultError("invalid_envelope");
  }
}
