import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MAGIC_V1 = Buffer.from("SFTLW01", "ascii");
const MAGIC_V2 = Buffer.from("SFTLW02", "ascii");
const KEY_ID_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type KeyCandidate = { id: string; key: Buffer };

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`warleine-faturamento:${secret}`).digest();
}

function keyId(secret: string): string {
  return createHash("sha256").update(`warleine-key-id:${secret}`).digest("hex").slice(0, KEY_ID_BYTES);
}

function encryptionCandidates(): KeyCandidate[] {
  const active = process.env.WARLEINE_FILE_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!active || active.length < 16) throw new Error("Chave de criptografia Warleine indisponível.");
  const previous = String(process.env.WARLEINE_FILE_ENCRYPTION_PREVIOUS_KEYS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length >= 16);
  const legacyJwt = process.env.JWT_SECRET && process.env.JWT_SECRET !== active ? [process.env.JWT_SECRET] : [];
  return [...new Set([active, ...previous, ...legacyJwt])].map((secret) => ({ id: keyId(secret), key: deriveKey(secret) }));
}

function decryptWithKey(payload: Buffer, key: Buffer, ivStart: number, tagStart: number, dataStart: number): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(ivStart, tagStart));
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

export function encryptWarleineFile(plain: Buffer): Buffer {
  const active = encryptionCandidates()[0];
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", active.key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC_V2, Buffer.from(active.id, "ascii"), iv, tag, encrypted]);
}

export function decryptWarleineFile(payload: Buffer): Buffer {
  const candidates = encryptionCandidates();
  if (payload.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) {
    const minimumLength = MAGIC_V2.length + KEY_ID_BYTES + IV_BYTES + TAG_BYTES;
    if (payload.length <= minimumLength) throw new Error("Arquivo durável Warleine inválido.");
    const storedKeyId = payload.subarray(MAGIC_V2.length, MAGIC_V2.length + KEY_ID_BYTES).toString("ascii");
    const candidate = candidates.find((item) => item.id === storedKeyId);
    if (!candidate) throw new Error(`Chave Warleine ${storedKeyId} não está disponível para descriptografia.`);
    const ivStart = MAGIC_V2.length + KEY_ID_BYTES;
    const tagStart = ivStart + IV_BYTES;
    const dataStart = tagStart + TAG_BYTES;
    return decryptWithKey(payload, candidate.key, ivStart, tagStart, dataStart);
  }

  const minimumLength = MAGIC_V1.length + IV_BYTES + TAG_BYTES;
  if (payload.length <= minimumLength || !payload.subarray(0, MAGIC_V1.length).equals(MAGIC_V1)) {
    throw new Error("Arquivo durável Warleine inválido ou não criptografado.");
  }
  const ivStart = MAGIC_V1.length;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + TAG_BYTES;
  for (const candidate of candidates) {
    try {
      return decryptWithKey(payload, candidate.key, ivStart, tagStart, dataStart);
    } catch {
      // Tenta a próxima chave ativa/anterior para envelopes legados sem keyId.
    }
  }
  throw new Error("Nenhuma chave disponível conseguiu descriptografar o arquivo Warleine legado.");
}
