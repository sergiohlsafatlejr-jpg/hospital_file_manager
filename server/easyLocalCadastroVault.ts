import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "EASYLOCAL_CONNECTION_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const PURPOSE = "safatle.easylocal.connection.v1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class EasyLocalVaultError extends Error {
  constructor(readonly kind: "key_unavailable" | "invalid_envelope") {
    super(kind);
    this.name = "EasyLocalVaultError";
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
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
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
    throw new EasyLocalVaultError("key_unavailable");
  }
  return Buffer.from(raw, "hex");
}

function envelopeFrom(raw: string): {
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
} {
  let parsed: Envelope;
  try {
    parsed = JSON.parse(raw) as Envelope;
  } catch {
    throw new EasyLocalVaultError("invalid_envelope");
  }
  if (
    !parsed ||
    parsed.v !== 1 ||
    parsed.alg !== "A256GCM" ||
    parsed.purpose !== PURPOSE ||
    Object.keys(parsed).length !== 6
  ) {
    throw new EasyLocalVaultError("invalid_envelope");
  }
  const nonce = decodeBase64Url(parsed.nonce);
  const ciphertext = decodeBase64Url(parsed.ciphertext);
  const tag = decodeBase64Url(parsed.tag);
  if (
    !nonce ||
    !ciphertext ||
    !tag ||
    nonce.length !== NONCE_BYTES ||
    ciphertext.length === 0 ||
    tag.length !== TAG_BYTES
  ) {
    throw new EasyLocalVaultError("invalid_envelope");
  }
  return { nonce, ciphertext, tag };
}

/** True only for the dedicated 32-byte hexadecimal key; no other application key is accepted. */
export function easyLocalEncryptionKeyAvailable(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    keyFrom(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts UTF-8 JSON with a fresh GCM nonce and a fixed purpose-bound AAD.
 * The result is an envelope suitable only for the dedicated EasyLocal column.
 */
export function encryptEasyLocalPayload(
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = keyFrom(env);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  } catch {
    throw new EasyLocalVaultError("invalid_envelope");
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(Buffer.from(PURPOSE, "utf8"), {
    plaintextLength: plaintext.length,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
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

/** Decrypts only an authentic envelope made for this exact EasyLocal purpose. */
export function decryptEasyLocalPayload<T>(
  envelope: string,
  env: NodeJS.ProcessEnv = process.env
): T {
  const key = keyFrom(env);
  const { nonce, ciphertext, tag } = envelopeFrom(envelope);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(PURPOSE, "utf8"), {
      plaintextLength: ciphertext.length,
    });
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch (error) {
    if (error instanceof EasyLocalVaultError) throw error;
    throw new EasyLocalVaultError("invalid_envelope");
  }
}
