import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const COFRE_PREFIX = "ENC:v1:";
const IV_BYTES = 12;

function obterChaveMestraCofre(): Buffer {
  const segredoBruto =
    process.env.RPA_COFRE_SECRET_KEY ||
    process.env.FERNET_SECRET_KEY ||
    process.env.XML_IMPORTACAO_FILE_KEY ||
    process.env.JWT_SECRET ||
    "safatle-sistema-rpa-cofre-master-key-2026";

  return createHash("sha256").update(segredoBruto, "utf8").digest();
}

export function estaCriptografadaNoCofre(valor?: string | null): boolean {
  return typeof valor === "string" && valor.startsWith(COFRE_PREFIX);
}

/**
 * Criptografa a senha do portal usando AES-256-GCM antes de gravar no banco de dados.
 */
export function salvarSenhaCofre(senhaPlana: string): string {
  const limpa = String(senhaPlana || "");
  if (!limpa) return "";
  if (estaCriptografadaNoCofre(limpa)) return limpa;

  const chave = obterChaveMestraCofre();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const encrypted = Buffer.concat([cipher.update(limpa, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${COFRE_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Descriptografa a senha exclusivamente em memória RAM no instante do login pelo Worker RPA.
 * Possui fallback compatível caso exista alguma credencial legada ainda em texto plano.
 */
export function obterSenhaParaRobo(senhaArmazenada?: string | null): string {
  const valor = String(senhaArmazenada || "");
  if (!valor) return "";
  if (!estaCriptografadaNoCofre(valor)) {
    return valor;
  }

  const payload = valor.slice(COFRE_PREFIX.length);
  const partes = payload.split(":");
  if (partes.length !== 3) {
    throw new Error("Formato de senha criptografada inválido no Cofre de Credenciais.");
  }

  const [ivHex, tagHex, cipherHex] = partes;
  const chave = obterChaveMestraCofre();
  const decipher = createDecipheriv("aes-256-gcm", chave, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
