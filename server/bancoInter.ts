/**
 * Integração com a API do Banco Inter
 * 
 * Endpoints:
 * - OAuth2 Token: POST /oauth/v2/token
 * - Saldo: GET /banking/v2/saldo
 * - Extrato: GET /banking/v2/extrato
 * - Extrato Completo: GET /banking/v2/extrato/completo
 * - Extrato PDF: GET /banking/v2/extrato/exportar
 * - Cobrança v3:
 *   - POST /cobranca/v3/cobrancas (Emitir boleto)
 *   - GET /cobranca/v3/cobrancas/{codigoSolicitacao} (Consultar)
 *   - GET /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf (PDF)
 *   - POST /cobranca/v3/cobrancas/{codigoSolicitacao}/cancelar (Cancelar)
 *   - GET /cobranca/v3/cobrancas (Listar)
 *   - GET /cobranca/v3/cobrancas/sumario (Sumário)
 * 
 * Autenticação: OAuth2 Client Credentials com mTLS (Certificado + Chave Privada)
 */

import https from "https";
import type { IncomingHttpHeaders } from "node:http";
import { getDb } from "./db";
import { finBancos } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { decryptBancoInterField } from "./bancoInterVault";

export interface InterConfig {
  bancoId?: number;
  bancoNome?: string;
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  contaCorrente?: string;
  baseUrl: string;
}

// Cache de tokens OAuth2 por banco, sem serializar credenciais.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Obtém as credenciais e certificados do Banco Inter.
 * Um banco específico é obrigatório; não há fallback global nem credenciais em ambiente.
 * Segredo, certificado, chave e conta são aceitos somente como envelopes AES-GCM válidos.
 */
export async function getInterConfig(bancoId?: number): Promise<InterConfig | null> {
  if (!Number.isSafeInteger(bancoId) || !bancoId || bancoId <= 0) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const [banco] = await db.select().from(finBancos).where(eq(finBancos.id, bancoId)).limit(1);
    if (!banco || !banco.interClientId || !banco.interClientSecret || !banco.interCertPem || !banco.interKeyPem) {
      return null;
    }
    return {
      bancoId: banco.id,
      bancoNome: banco.nome,
      clientId: banco.interClientId,
      clientSecret: decryptBancoInterField(banco.id, "clientSecret", banco.interClientSecret),
      certPem: decryptBancoInterField(banco.id, "certPem", banco.interCertPem),
      keyPem: decryptBancoInterField(banco.id, "keyPem", banco.interKeyPem),
      contaCorrente: banco.interContaCorrente ? decryptBancoInterField(banco.id, "contaCorrente", banco.interContaCorrente) : undefined,
      baseUrl: banco.interBaseUrl || "https://cdpj.partners.bancointer.com.br",
    };
  } catch {
    // Falha fechada: envelope, chave ou banco inválido não habilita chamada externa.
    return null;
  }
}

/**
 * Executa uma requisição HTTPS nativa com autenticação mTLS
 */
function doHttpsRequest(opts: {
  method?: string;
  hostname: string;
  port?: number;
  path: string;
  headers?: Record<string, string>;
  cert: string;
  key: string;
  body?: string;
}): Promise<{ status: number; data: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const reqOptions: https.RequestOptions = {
      method: opts.method || "GET",
      hostname: opts.hostname,
      port: opts.port || 443,
      path: opts.path,
      cert: opts.cert,
      key: opts.key,
      headers: opts.headers,
      rejectUnauthorized: true,
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode || 0, data, headers: res.headers }));
    });

    req.on("error", (err) => reject(err));
    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

/**
 * Obtém token de acesso OAuth2 usando o certificado mTLS
 */
async function getAccessToken(config: InterConfig): Promise<string> {
  const cacheKey = String(config.bancoId);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 300000) {
    return cached.token;
  }

  const url = new URL(`${config.baseUrl}/oauth/v2/token`);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: "extrato.read saldo.read boleto-cobranca.read boleto-cobranca.write",
  }).toString();

  const res = await doHttpsRequest({
    method: "POST",
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 443,
    path: url.pathname,
    cert: config.certPem,
    key: config.keyPem,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });

  if (res.status !== 200) {
    let detalhe = "";
    try {
      const parsed = JSON.parse(res.data);
      detalhe = parsed.error_description || parsed.title || parsed.detail || parsed.error || "";
    } catch {
      detalhe = res.data?.slice(0, 160) || "";
    }
    throw new Error(`Falha na autenticação OAuth Banco Inter (HTTP ${res.status})${detalhe ? `: ${detalhe}` : ""}`);
  }

  const data = JSON.parse(res.data) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  });

  return data.access_token;
}

export function invalidarCacheTokenInter(bancoId?: number) {
  if (bancoId) {
    tokenCache.delete(String(bancoId));
  } else {
    tokenCache.clear();
  }
}

/**
 * Faz requisição autenticada à API do Banco Inter
 */
async function interRequest(
  pathStr: string,
  options?: {
    method?: string;
    params?: Record<string, string>;
    body?: any;
  },
  bancoIdOrConfig?: number | InterConfig
): Promise<any> {
  let config: InterConfig | null = null;
  if (bancoIdOrConfig && typeof bancoIdOrConfig === "object") {
    config = bancoIdOrConfig;
  } else {
    config = await getInterConfig(typeof bancoIdOrConfig === "number" ? bancoIdOrConfig : undefined);
  }

  if (!config) throw new Error("inter_not_configured");

  const token = await getAccessToken(config);
  const method = options?.method || "GET";
  const url = new URL(`${config.baseUrl}${pathStr}`);

  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, v);
      }
    });
  }

  const postBody = options?.body ? JSON.stringify(options.body) : undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (config.contaCorrente) {
    headers["x-conta-corrente"] = config.contaCorrente;
  }
  if (postBody) {
    headers["Content-Length"] = String(Buffer.byteLength(postBody));
  }

  const res = await doHttpsRequest({
    method,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 443,
    path: url.pathname + url.search,
    cert: config.certPem,
    key: config.keyPem,
    headers,
    body: postBody,
  });

  if (res.status >= 400) {
    let detalhe = "";
    try {
      const parsed = JSON.parse(res.data);
      const violacoes = Array.isArray(parsed.violacoes)
        ? parsed.violacoes.map((v: any) => `${v.propriedade || ""}: ${v.razao || v.mensagem || ""}`).join("; ")
        : "";
      detalhe = violacoes || parsed.detail || parsed.title || parsed.message || parsed.mensagem || "";
    } catch {
      detalhe = res.data?.slice(0, 200) || "";
    }
    throw new Error(`Erro na API do Banco Inter (HTTP ${res.status})${detalhe ? `: ${detalhe}` : ""}`);
  }

  if (res.data) {
    try {
      return JSON.parse(res.data);
    } catch {
      return res.data;
    }
  }

  return { status: res.status };
}

// ==================== STATUS ====================

export async function getInterStatus(bancoId?: number) {
  const config = await getInterConfig(bancoId);
  return {
    configured: !!config,
    hasClientId: !!config?.clientId,
    hasClientSecret: !!config?.clientSecret,
    hasCert: !!config?.certPem,
    hasKey: !!config?.keyPem,
    hasContaCorrente: !!config?.contaCorrente,
    baseUrl: config?.baseUrl || "https://cdpj.partners.bancointer.com.br",
  };
}

function operationFailure(_err?: unknown) {
  return { configured: true, error: "Não foi possível concluir a operação com o Banco Inter." };
}

// ==================== BANKING ====================

export async function consultarSaldo(bancoId?: number | InterConfig) {
  try {
    const data = await interRequest("/banking/v2/saldo", undefined, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function consultarExtrato(dataInicio: string, dataFim: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest("/banking/v2/extrato", { params: { dataInicio, dataFim } }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function consultarExtratoCompleto(
  dataInicio: string,
  dataFim: string,
  pagina?: number,
  tamanhoPagina?: number,
  bancoId?: number | InterConfig
) {
  try {
    const params: Record<string, string> = { dataInicio, dataFim };
    if (pagina !== undefined) params.pagina = String(pagina);
    if (tamanhoPagina !== undefined) params.tamanhoPagina = String(tamanhoPagina);
    const data = await interRequest("/banking/v2/extrato/completo", { params }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function exportarExtratoPdf(dataInicio: string, dataFim: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest("/banking/v2/extrato/exportar", { params: { dataInicio, dataFim } }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

// ==================== COBRANÇA (BOLETO COM PIX) ====================

export interface PagadorBoleto {
  cpfCnpj: string;
  tipoPessoa: "FISICA" | "JURIDICA";
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  email?: string;
  ddd?: string;
  telefone?: string;
  numero?: string;
  complemento?: string;
}

export interface EmitirBoletoInput {
  bancoId?: number;
  seuNumero: string;
  valorNominal: number;
  dataVencimento: string; // YYYY-MM-DD
  numDiasAgenda: number; // 0-60
  pagador: PagadorBoleto;
  desconto?: {
    taxa: number;
    codigo: "PERCENTUALDATAINFORMADA" | "VALORFIXODATAINFORMADA";
    quantidadeDias: number;
  };
  multa?: {
    taxa: number;
    codigo: "PERCENTUAL" | "VALORFIXO";
  };
  mora?: {
    taxa: number;
    codigo: "TAXAMENSAL" | "VALORFIXO";
  };
  mensagem?: {
    linha1?: string;
    linha2?: string;
    linha3?: string;
    linha4?: string;
    linha5?: string;
  };
  formasRecebimento?: ("BOLETO" | "PIX")[];
}

export async function emitirBoleto(input: EmitirBoletoInput, bancoIdParam?: number | InterConfig) {
  try {
    const effectiveBancoId = typeof bancoIdParam === "number" ? bancoIdParam : input.bancoId;
    const config = typeof bancoIdParam === "object" ? bancoIdParam : await getInterConfig(effectiveBancoId);

    if (!config) {
      return {
        configured: false,
        message: "API do Banco Inter não configurada. Configure as credenciais no Banco correspondente.",
      };
    }

    const payload: any = {
      seuNumero: input.seuNumero.slice(0, 15),
      valorNominal: input.valorNominal,
      dataVencimento: input.dataVencimento,
      numDiasAgenda: input.numDiasAgenda ?? 30,
      pagador: input.pagador,
      ...(input.desconto && { desconto: input.desconto }),
      ...(input.multa && { multa: input.multa }),
      ...(input.mora && { mora: input.mora }),
      ...(input.mensagem && { mensagem: input.mensagem }),
      formasRecebimento: input.formasRecebimento || ["BOLETO", "PIX"],
    };

    const data = await interRequest("/cobranca/v3/cobrancas", {
      method: "POST",
      body: payload,
    }, config);

    // Se o retorno da criação tiver codigoSolicitacao mas não contiver boleto/pix completo,
    // consulta imediatamente para preencher linhaDigitavel e pixCopiaECola
    if (data?.codigoSolicitacao && (!data?.boleto || !data?.pix)) {
      try {
        const consulta = await interRequest(`/cobranca/v3/cobrancas/${data.codigoSolicitacao}`, undefined, config);
        return {
          configured: true,
          ...data,
          ...consulta,
        };
      } catch {
        return { configured: true, ...data };
      }
    }

    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function consultarBoleto(codigoSolicitacao: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest(`/cobranca/v3/cobrancas/${codigoSolicitacao}`, undefined, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function listarBoletos(
  dataInicial: string,
  dataFinal: string,
  situacao?: string,
  pagina?: number,
  itensPorPagina?: number,
  bancoId?: number | InterConfig
) {
  try {
    const params: Record<string, string> = { dataInicial, dataFinal };
    if (situacao) params.situacao = situacao;
    if (pagina !== undefined) params["paginacao.paginaAtual"] = String(pagina);
    if (itensPorPagina !== undefined) params["paginacao.itensPorPagina"] = String(itensPorPagina);
    const data = await interRequest("/cobranca/v3/cobrancas", { params }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function downloadBoletoPdf(codigoSolicitacao: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest(`/cobranca/v3/cobrancas/${codigoSolicitacao}/pdf`, undefined, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function cancelarBoleto(codigoSolicitacao: string, motivoCancelamento: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest(`/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`, {
      method: "POST",
      body: { motivoCancelamento },
    }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}

export async function sumarioBoletos(dataInicial: string, dataFinal: string, bancoId?: number | InterConfig) {
  try {
    const data = await interRequest("/cobranca/v3/cobrancas/sumario", {
      params: { dataInicial, dataFinal },
    }, bancoId);
    return { configured: true, ...data };
  } catch (err) {
    return operationFailure(err);
  }
}
