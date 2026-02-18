import crypto from "crypto";
import { logger } from "./logger";

/**
 * Sistema de Idempotência para Tasy
 * Previne duplicação de operações em caso de retry ou falhas de rede
 */

export interface IdempotencyKey {
  key: string;
  hash: string;
  timestamp: number;
  status: "pendente" | "sucesso" | "erro";
  resultado?: any;
  erro?: string;
}

/**
 * Cache em memória para idempotência (em produção, usar Redis)
 */
const idempotencyCache = new Map<string, IdempotencyKey>();

/**
 * Gera hash para operação baseado em dados
 */
export function gerarHashOperacao(dados: any): string {
  const json = JSON.stringify(dados);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Cria chave de idempotência
 */
export function criarChaveIdempotencia(
  operacao: string,
  dados: any,
  usuarioId: number,
  estabelecimentoId: number
): string {
  const componentes = [
    operacao,
    usuarioId,
    estabelecimentoId,
    gerarHashOperacao(dados),
  ];
  return crypto
    .createHash("sha256")
    .update(componentes.join("|"))
    .digest("hex");
}

/**
 * Verifica se operação já foi executada (idempotência)
 */
export function verificarIdempotencia(chave: string): IdempotencyKey | null {
  const registro = idempotencyCache.get(chave);

  if (!registro) {
    return null;
  }

  // Verificar se expirou (24 horas)
  const agora = Date.now();
  const idade = agora - registro.timestamp;
  const EXPIRACAO = 24 * 60 * 60 * 1000; // 24 horas

  if (idade > EXPIRACAO) {
    idempotencyCache.delete(chave);
    return null;
  }

  return registro;
}

/**
 * Registra execução de operação para idempotência
 */
export function registrarIdempotencia(
  chave: string,
  status: "pendente" | "sucesso" | "erro",
  resultado?: any,
  erro?: string
): void {
  const registro: IdempotencyKey = {
    key: chave,
    hash: gerarHashOperacao({ resultado, erro }),
    timestamp: Date.now(),
    status,
    resultado,
    erro,
  };

  idempotencyCache.set(chave, registro);

  logger.info({
    tipo: "idempotencia_registrada",
    chave,
    status,
    resultado: resultado ? "sim" : "nao",
  });
}

/**
 * Limpa cache de idempotência expirado
 */
export function limparCacheExpirado(): number {
  const agora = Date.now();
  const EXPIRACAO = 24 * 60 * 60 * 1000;
  let removidos = 0;

  for (const [chave, registro] of Array.from(idempotencyCache.entries())) {
    const idade = agora - registro.timestamp;
    if (idade > EXPIRACAO) {
      idempotencyCache.delete(chave);
      removidos++;
    }
  }

  logger.info({
    tipo: "idempotencia_limpeza",
    removidos,
    totalRestante: idempotencyCache.size,
  });

  return removidos;
}

/**
 * Obtém estatísticas do cache de idempotência
 */
export function obterEstatisticasIdempotencia() {
  const total = idempotencyCache.size;
  let sucesso = 0;
  let erro = 0;
  let pendente = 0;

  for (const registro of Array.from(idempotencyCache.values())) {
    if (registro.status === "sucesso") sucesso++;
    if (registro.status === "erro") erro++;
    if (registro.status === "pendente") pendente++;
  }

  return {
    total,
    sucesso,
    erro,
    pendente,
    percentualSucesso: total > 0 ? ((sucesso / total) * 100).toFixed(2) : "0",
  };
}

/**
 * Wrapper para executar operação com idempotência
 */
export async function executarComIdempotencia<T>(
  chave: string,
  operacao: () => Promise<T>,
  onDuplicata?: (resultado: any) => Promise<void>
): Promise<T> {
  // Verificar se já foi executado
  const jaExecutado = verificarIdempotencia(chave);

  if (jaExecutado) {
    logger.warn({
      tipo: "operacao_duplicada_detectada",
      chave,
      status: jaExecutado.status,
    });

    if (jaExecutado.status === "sucesso" && jaExecutado.resultado) {
      if (onDuplicata) {
        await onDuplicata(jaExecutado.resultado);
      }
      return jaExecutado.resultado;
    }

    if (jaExecutado.status === "erro" && jaExecutado.erro) {
      throw new Error(`Operação anterior falhou: ${jaExecutado.erro}`);
    }
  }

  try {
    // Registrar como pendente
    registrarIdempotencia(chave, "pendente");

    // Executar operação
    const resultado = await operacao();

    // Registrar sucesso
    registrarIdempotencia(chave, "sucesso", resultado);

    return resultado;
  } catch (erro) {
    // Registrar erro
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    registrarIdempotencia(chave, "erro", undefined, mensagem);

    throw erro;
  }
}

/**
 * Middleware para idempotência em tRPC
 */
export function idempotenciaMiddleware(
  operacao: string,
  usuarioId: number,
  estabelecimentoId: number
) {
  return (dados: any) => {
    const chave = criarChaveIdempotencia(
      operacao,
      dados,
      usuarioId,
      estabelecimentoId
    );
    return chave;
  };
}

/**
 * Limpar cache periodicamente (executar a cada 1 hora)
 */
export function iniciarLimpezaPeriodica(): NodeJS.Timeout {
  return setInterval(() => {
    limparCacheExpirado();
  }, 60 * 60 * 1000); // 1 hora
}
