import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

const COFRE_PREFIX = "ENC:v1:";
const IV_BYTES = 12;

const DOMINIOS_PORTAIS_APROVADOS: ReadonlyArray<{
  convenioTermos: string[];
  ansCodigos: string[];
  hostsPermitidos: string[];
}> = [
  {
    convenioTermos: ["UNIMED"],
    ansCodigos: ["382876"],
    hostsPermitidos: ["unimedgoiania.coop.br", "unimed.coop.br", "unimedcerrado.com.br"],
  },
  {
    convenioTermos: ["IPASGO"],
    ansCodigos: ["417548", "000000"],
    hostsPermitidos: ["ipasgo.go.gov.br", "go.gov.br"],
  },
  {
    convenioTermos: ["CASSI"],
    ansCodigos: ["346659"],
    hostsPermitidos: ["cassi.com.br"],
  },
  {
    convenioTermos: ["CAIXA", "SAUDE CAIXA"],
    ansCodigos: ["312924"],
    hostsPermitidos: ["saudecaixa.com.br", "caixa.gov.br"],
  },
  {
    convenioTermos: ["BRADESCO"],
    ansCodigos: ["005711", "5711"],
    hostsPermitidos: ["bradescosaude.com.br"],
  },
  {
    convenioTermos: ["SULAMERICA", "SUL AMERICA"],
    ansCodigos: ["006246", "6246"],
    hostsPermitidos: ["sulamerica.com.br"],
  },
  {
    convenioTermos: ["AMIL"],
    ansCodigos: ["326305"],
    hostsPermitidos: ["amil.com.br"],
  },
  {
    convenioTermos: ["GEAP"],
    ansCodigos: ["323080"],
    hostsPermitidos: ["geap.org.br"],
  },
];

const TODOS_HOSTS_APROVADOS = DOMINIOS_PORTAIS_APROVADOS.flatMap((g) => g.hostsPermitidos);

/**
 * Verifica se a chave exclusiva dedicada do Cofre RPA (RPA_COFRE_SECRET_KEY) está configurada.
 * Sem fallback para outras chaves nem constantes previsíveis.
 */
export function cofreRpaKeyAvailable(): boolean {
  const raw = process.env.RPA_COFRE_SECRET_KEY?.trim();
  return Boolean(raw && raw.length >= 32);
}

function obterChaveMestraCofre(): Buffer {
  const segredoBruto = process.env.RPA_COFRE_SECRET_KEY?.trim();
  if (!segredoBruto || segredoBruto.length < 32) {
    throw new Error(
      "Chave exclusiva do Cofre RPA (RPA_COFRE_SECRET_KEY) ausente ou inválida (mínimo 32 caracteres)."
    );
  }
  if (/^[a-fA-F0-9]{64}$/.test(segredoBruto)) {
    return Buffer.from(segredoBruto, "hex");
  }
  return createHash("sha256").update(segredoBruto, "utf8").digest();
}

export function estaCriptografadaNoCofre(valor?: string | null): boolean {
  if (typeof valor !== "string" || !valor.startsWith(COFRE_PREFIX)) return false;
  const partes = valor.slice(COFRE_PREFIX.length).split(":");
  return (
    partes.length === 3 &&
    /^[a-fA-F0-9]{24}$/.test(partes[0]) &&
    /^[a-fA-F0-9]{32}$/.test(partes[1]) &&
    /^[a-fA-F0-9]{2,}$/.test(partes[2])
  );
}

/**
 * Criptografa a senha do portal usando AES-256-GCM antes de gravar no banco de dados.
 * Falha fechada caso a chave exclusiva não esteja configurada.
 */
export function salvarSenhaCofre(senhaPlana: string): string {
  const limpa = String(senhaPlana ?? "").trim();
  if (!limpa) {
    throw new Error("A senha não pode ser vazia para gravação no Cofre.");
  }
  if (estaCriptografadaNoCofre(limpa)) {
    // Valida que o envelope pertence à chave atual
    obterSenhaParaRobo(limpa);
    return limpa;
  }

  const chave = obterChaveMestraCofre();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const encrypted = Buffer.concat([cipher.update(limpa, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${COFRE_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Descriptografa a senha exclusivamente em memória RAM no instante do login pelo Worker RPA.
 * Falha fechada: recusa texto plano legado ou envelope corrompido.
 */
export function obterSenhaParaRobo(senhaArmazenada?: string | null): string {
  const valor = String(senhaArmazenada ?? "").trim();
  if (!valor) {
    throw new Error("Credencial sem senha armazenada no Cofre.");
  }
  if (!estaCriptografadaNoCofre(valor)) {
    throw new Error(
      "Formato de senha legado/não criptografado recusado pelo Cofre RPA. Regrave a credencial com chave dedicada."
    );
  }

  const payload = valor.slice(COFRE_PREFIX.length);
  const [ivHex, tagHex, cipherHex] = payload.split(":");
  const chave = obterChaveMestraCofre();
  const decipher = createDecipheriv("aes-256-gcm", chave, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Valida se uma URL de portal é estritamente HTTPS e pertence ao domínio aprovado da operadora.
 * Bloqueia IPs literais, localhost, portas não-padrão e domínios arbitrários.
 */
export function validarUrlPortalConvenio(
  urlInput?: string | null,
  convenioNome?: string | null,
  registroAns?: string | null
): string {
  const raw = String(urlInput ?? "").trim();
  if (!raw) {
    throw new Error("URL do portal obrigatória.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("URL do portal inválida.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Apenas destinos HTTPS são permitidos para portais de convênios.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL do portal não pode conter credenciais embutidas.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("Porta não padrão não permitida na URL do portal.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.startsWith("[")
  ) {
    throw new Error("Destino de rede local ou IP literal não permitido.");
  }

  const nomeNorm = String(convenioNome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const ansNorm = String(registroAns ?? "").replace(/\D/g, "");

  const regraEspecifica = DOMINIOS_PORTAIS_APROVADOS.find(
    (g) =>
      (nomeNorm && g.convenioTermos.some((t) => nomeNorm.includes(t))) ||
      (ansNorm && g.ansCodigos.includes(ansNorm))
  );

  const dominiosValidos = regraEspecifica
    ? regraEspecifica.hostsPermitidos
    : TODOS_HOSTS_APROVADOS;

  if (!dominiosValidos.some((dom) => hostMatchesDomain(host, dom))) {
    throw new Error(
      `Domínio "${host}" não faz parte da allowlist HTTPS aprovada para este convênio.`
    );
  }

  return parsed.toString();
}

/**
 * Sanitiza um identificador de lote para uso apenas em exibição/metadados (sem caracteres de controle ou separadores de caminho).
 */
export function sanitizarNumeroLoteTiss(valor?: string | null, fallbackHash?: string): string {
  const limpo = String(valor ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  if (limpo.length > 0) return limpo;
  const sufixo = String(fallbackHash ?? "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  return `LOTE_${sufixo || "PADRAO"}`;
}

/**
 * Resolve e valida com contenção estrita o caminho privado de armazenamento de um arquivo XML da fila RPA.
 * Nunca incorpora segmentos fornecidos pelo XML ou pelo nome original do arquivo no caminho físico.
 */
export function resolverCaminhoSeguroXmlRpa(
  baseRootDir: string,
  estabelecimentoId: number,
  convenioId: number,
  hashXml: string,
  anoMesInput?: string
): { pastaDestino: string; caminhoCompleto: string } {
  if (!Number.isSafeInteger(estabelecimentoId) || estabelecimentoId <= 0) {
    throw new Error("estabelecimentoId inválido para armazenamento XML.");
  }
  if (!Number.isSafeInteger(convenioId) || convenioId <= 0) {
    throw new Error("convenioId inválido para armazenamento XML.");
  }
  const hashLimpo = String(hashXml ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hashLimpo)) {
    throw new Error("Hash SHA-256 inválido para armazenamento XML.");
  }

  const anoMes =
    anoMesInput && /^\d{4}-\d{2}$/.test(anoMesInput)
      ? anoMesInput
      : new Date().toISOString().slice(0, 7);

  const raizSegura = path.resolve(baseRootDir, "uploads", "storage_rpa_xml");
  const pastaDestino = path.resolve(
    raizSegura,
    `estab_${estabelecimentoId}`,
    anoMes,
    `conv_${convenioId}`,
    "xml_envio"
  );

  if (!pastaDestino.startsWith(`${raizSegura}${path.sep}`)) {
    throw new Error("Violação de contenção de diretório no armazenamento XML RPA.");
  }

  const nomeInterno = `xml_${hashLimpo.slice(0, 16)}_${randomUUID()}.xml`;
  const caminhoCompleto = path.resolve(pastaDestino, nomeInterno);

  if (!caminhoCompleto.startsWith(`${pastaDestino}${path.sep}`)) {
    throw new Error("Violação de contenção de caminho de arquivo XML RPA.");
  }

  return { pastaDestino, caminhoCompleto };
}

/**
 * Verifica que um caminho de arquivo XML existente está estritamente contido dentro da raiz privada `uploads/storage_rpa_xml`.
 */
export function validarCaminhoContidoXmlRpa(
  baseRootDir: string,
  caminhoCandidato: string
): string {
  const raizSegura = path.resolve(baseRootDir, "uploads", "storage_rpa_xml");
  const resolvido = path.resolve(String(caminhoCandidato ?? ""));
  if (
    !resolvido.startsWith(`${raizSegura}${path.sep}`) ||
    path.extname(resolvido).toLowerCase() !== ".xml"
  ) {
    throw new Error("Caminho de arquivo XML fora do diretório privado permitido.");
  }
  return resolvido;
}
