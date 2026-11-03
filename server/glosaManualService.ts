import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "./db";
import { resolverGlosaDicionario } from "../shared/glossaryGlosas";
import { GLOSA_MANUAL_LIMITES, MAX_ITENS_GLOSA_MANUAL } from "../shared/glosaManualSubmission";

/** Mesmo payload do lançamento legado, acrescido da chave obrigatória por submissão. */
export type RegistrarGlosaManualInput = {
  estabelecimentoId: number;
  convenioId: number;
  /** Deve ser inferido da sessão autenticada pelo router, nunca do cliente. */
  userId: number;
  idempotencyKey: string;
  numeroGuia: string;
  protocolo?: string;
  lotePrestador?: string;
  dataPagamento?: string;
  carteiraBeneficiario?: string;
  nomeBeneficiario: string;
  itens: Array<{
    sequencialItem?: number;
    codigoItem: string;
    descricaoItem: string;
    tipoLancamento?: string;
    dataExecucao?: string;
    quantidade?: number;
    valorInformado: number;
    valorPago: number;
    valorGlosa: number;
    codigoGlosa?: string;
    erroTiss?: string;
    justificativa?: string;
  }>;
};

/** Repetições retornam exatamente os mesmos IDs, contagem e data da primeira submissão. */
export type RegistrarGlosaManualResult = {
  success: true;
  totalInseridos: number;
  idsInseridos: number[];
  dataPagamento: string;
  competencia: string;
};

type Banco = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = { execute: Banco["execute"] };
type Linha = Record<string, unknown>;
const MAX_ID = 2_147_483_647;
const MAX_DINHEIRO = new Decimal("9999999999.99"); // demonstrativo: DECIMAL(12,2)
const MAX_RECURSO = new Decimal("99999999.99"); // recursosGlosa: DECIMAL(10,2)
const PREFIXO = "manual-glosa:v1:";

function falhar(code: "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR", message: string): never {
  throw new TRPCError({ code, message });
}
function id(valor: number, campo: string): number {
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > MAX_ID) {
    falhar("BAD_REQUEST", `${campo} deve ser um ID positivo válido`);
  }
  return valor;
}
function texto(valor: unknown, campo: string, limite: number, obrigatorio = false): string | null {
  if (valor === undefined && !obrigatorio) return null;
  if (typeof valor !== "string") falhar("BAD_REQUEST", `${campo} inválido`);
  const v = valor.trim();
  const controles = limite === 65_535 ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if ((obrigatorio && !v) || v.length > limite || controles.test(v)) {
    falhar("BAD_REQUEST", `${campo} inválido`);
  }
  if (limite === 65_535 && Buffer.byteLength(v, "utf8") > limite) falhar("BAD_REQUEST", `${campo} excede o limite de bytes`);
  return v || null;
}
function data(valor: unknown, campo: string): string | null {
  if (valor === undefined) return null;
  const v = texto(valor, campo, 10, true)!;
  const parsed = new Date(`${v}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "1000-01-01" ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v) {
    falhar("BAD_REQUEST", `${campo} deve ser uma data calendário válida (YYYY-MM-DD)`);
  }
  return v;
}
function dinheiro(valor: number, campo: string): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) falhar("BAD_REQUEST", `${campo} inválido`);
  const v = new Decimal(String(valor));
  if (v.isNegative() || v.gt(MAX_DINHEIRO) || v.decimalPlaces() > 2) {
    falhar("BAD_REQUEST", `${campo} deve ter no máximo 2 casas e estar entre 0 e 9999999999.99`);
  }
  return v.toFixed(2);
}
function normalizar(params: RegistrarGlosaManualInput) {
  const estabelecimentoId = id(params.estabelecimentoId, "estabelecimentoId");
  const convenioId = id(params.convenioId, "convenioId");
  const userId = id(params.userId, "userId");
  const requestKey = texto(params.idempotencyKey, "idempotencyKey", 128, true)!;
  const numeroGuia = texto(params.numeroGuia, "numeroGuia", 50, true)!;
  const protocolo = texto(params.protocolo, "protocolo", 50);
  const lotePrestador = texto(params.lotePrestador, "lotePrestador", 50);
  const dataPagamento = data(params.dataPagamento, "dataPagamento");
  const carteiraBeneficiario = texto(params.carteiraBeneficiario, "carteiraBeneficiario", 50);
  const nomeBeneficiario = texto(params.nomeBeneficiario, "nomeBeneficiario", 255, true)!;
  if (!Array.isArray(params.itens) || !params.itens.length || params.itens.length > MAX_ITENS_GLOSA_MANUAL) {
    falhar("BAD_REQUEST", `Informe de 1 a ${MAX_ITENS_GLOSA_MANUAL} itens`);
  }
  const identidades = new Set<string>();
  const itens = params.itens.map((item, indice) => {
    if (!item || typeof item !== "object") falhar("BAD_REQUEST", "Item inválido");
    const sequencialItem = id(item.sequencialItem ?? indice + 1, "sequencialItem");
    const codigoItem = texto(item.codigoItem, "codigoItem", 50, true)!;
    const descricaoItem = texto(item.descricaoItem, "descricaoItem", GLOSA_MANUAL_LIMITES.descricaoItem, true)!;
    const tipoLancamento = texto(item.tipoLancamento, "tipoLancamento", 100) ?? "CON";
    const dataExecucao = data(item.dataExecucao, "dataExecucao");
    const q = item.quantidade ?? 1;
    if (typeof q !== "number" || !Number.isFinite(q)) falhar("BAD_REQUEST", "quantidade inválida");
    const qtd = new Decimal(String(q));
    if (qtd.lte(0) || qtd.gt("999999999.999") || qtd.decimalPlaces() > 3) {
      falhar("BAD_REQUEST", "quantidade deve ser positiva com no máximo 3 casas, até 999999999.999");
    }
    const valorInformado = dinheiro(item.valorInformado, "valorInformado");
    const valorPago = dinheiro(item.valorPago, "valorPago");
    const valorGlosa = dinheiro(item.valorGlosa, "valorGlosa");
    const justificativa = texto(item.justificativa, "justificativa", GLOSA_MANUAL_LIMITES.justificativa);
    if (justificativa && new Decimal(valorGlosa).gt(MAX_RECURSO)) {
      falhar("BAD_REQUEST", "Valor recursado excede o limite de 99999999.99 de recursosGlosa");
    }
    const saldo = new Decimal(valorInformado).minus(valorPago);
    if (saldo.isNegative() || new Decimal(valorGlosa).gt(saldo)) {
      falhar("BAD_REQUEST", "Valores incoerentes: pago <= informado e glosa <= informado - pago");
    }
    const identidade = JSON.stringify([codigoItem, dataExecucao, sequencialItem]);
    if (identidades.has(identidade)) falhar("BAD_REQUEST", "Identidade de item repetida (código/data/sequencial)");
    identidades.add(identidade);
    return {
      sequencialItem, codigoItem, descricaoItem, tipoLancamento, dataExecucao,
      quantidade: qtd.toFixed(3), valorInformado, valorPago, valorGlosa,
      codigoGlosa: texto(item.codigoGlosa, "codigoGlosa", 500),
      erroTiss: texto(item.erroTiss, "erroTiss", 500),
      justificativa,
    };
  });
  return {
    requestKey,
    payload: { estabelecimentoId, convenioId, userId, numeroGuia, protocolo, lotePrestador,
      dataPagamento, carteiraBeneficiario, nomeBeneficiario, itens },
  };
}
const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");
async function linhas(tx: Executor, consulta: SQL): Promise<Linha[]> {
  const [rows] = await tx.execute(consulta);
  if (!Array.isArray(rows)) falhar("PRECONDITION_FAILED", "Resposta inesperada do banco");
  return rows as Linha[];
}
async function inserir(tx: Executor, consulta: SQL): Promise<number> {
  const [header] = await tx.execute(consulta);
  const insertId = Number((header as { insertId?: unknown }).insertId);
  if (!Number.isSafeInteger(insertId) || insertId <= 0 || insertId > MAX_ID) {
    falhar("PRECONDITION_FAILED", "Inserção sem ID válido; transação cancelada");
  }
  return insertId;
}
function resultado(idsInseridos: number[], dataPagamento: string): RegistrarGlosaManualResult {
  return { success: true, totalInseridos: idsInseridos.length, idsInseridos,
    dataPagamento, competencia: dataPagamento.slice(0, 7) };
}

/**
 * Caminho exclusivamente manual: não chama o sincronizador por hospital/guia.
 * Âncora durável em arquivos.nome = prefixo + hash(chave) + hash(payload) + data.
 * tipoArquivo='txt' e origem_tipo='excel' são discriminadores de compatibilidade:
 * s3Key/s3Url vazios, tamanho=0, nenhum storage/arquivo físico criado.
 * valor_recurso/justificativa_recurso são colunas legadas confirmadas pelo
 * preflight somente metadata da integração, embora ausentes do schema TS.
 * demonstrativo.recurso_id é o vínculo persistente com o recurso exato.
 * A exclusão administrativa da âncora destrói a memória de idempotência e não
 * deve ser oferecida no fluxo manual. Todos os escritores deste caminho devem
 * tomar o mesmo lock de estabelecimento; não se presume unique/gap lock/GET_LOCK.
 */
export async function registrarGlosaManualSegura(params: RegistrarGlosaManualInput): Promise<RegistrarGlosaManualResult> {
  const { requestKey, payload: p } = normalizar(params);
  const chaveHash = hash(JSON.stringify([p.estabelecimentoId, requestKey]));
  const payloadHash = hash(JSON.stringify(p));
  const prefixoChave = `${PREFIXO}${chaveHash}:`;
  const db = await getDb();
  if (!db) falhar("INTERNAL_SERVER_ERROR", "Banco indisponível");
  return db.transaction(async tx => {
    // A linha real existe antes de qualquer submissão: serialização TiDB sem gap locks.
    const hospitais = await linhas(tx, sql`
      SELECT id, ativo FROM estabelecimentos WHERE id = ${p.estabelecimentoId} FOR UPDATE
    `);
    if (hospitais.length !== 1 || hospitais[0].id !== p.estabelecimentoId || hospitais[0].ativo !== "sim") {
      falhar("FORBIDDEN", "Estabelecimento indisponível");
    }
    const usuarios = await linhas(tx, sql`
      SELECT id, role FROM users WHERE id = ${p.userId} FOR UPDATE
    `);
    if (usuarios.length !== 1 || usuarios[0].id !== p.userId) falhar("FORBIDDEN", "Usuário não autorizado");
    if (usuarios[0].role !== "admin") {
      const permissoes = await linhas(tx, sql`
        SELECT podeVisualizar, podeEditar, acessoDemonstrativo, acessoRecursos, acessoRecursosGlosa
        FROM permissoesEstabelecimento
        WHERE userId = ${p.userId} AND estabelecimentoId = ${p.estabelecimentoId} FOR UPDATE
      `);
      const permissao = permissoes[0];
      if (permissoes.length !== 1 || permissao.podeVisualizar !== "sim" || permissao.podeEditar !== "sim" ||
          permissao.acessoDemonstrativo !== "sim" ||
          (permissao.acessoRecursos !== "sim" && permissao.acessoRecursosGlosa !== "sim")) {
        falhar("FORBIDDEN", "Sem permissão de edição de demonstrativos e recursos neste estabelecimento");
      }
    }
    const convenios = await linhas(tx, sql`
      SELECT id, estabelecimentoId, ativo FROM convenios WHERE id = ${p.convenioId} FOR UPDATE
    `);
    const convenio = convenios[0];
    // Convênio global canônico continua global; todos os registros recebem o hospital explícito.
    if (convenios.length !== 1 || convenio.id !== p.convenioId || convenio.ativo !== "sim" ||
        (convenio.estabelecimentoId !== null && convenio.estabelecimentoId !== p.estabelecimentoId)) {
      falhar("FORBIDDEN", "Convênio não é global nem pertence ao estabelecimento ou está indisponível");
    }
    // Leitura corrente DEPOIS do lock: snapshot antigo não pode decidir deduplicação.
    const ancoras = await linhas(tx, sql`
      SELECT id, nome, convenioId, userId, totalItens, s3Key, s3Url, status
      FROM arquivos WHERE estabelecimentoId = ${p.estabelecimentoId}
        AND nome LIKE ${`${prefixoChave}%`} FOR UPDATE
    `);
    if (ancoras.length) {
      if (ancoras.length !== 1) falhar("PRECONDITION_FAILED", "Âncora manual ambígua; revisão necessária");
      const a = ancoras[0];
      const nome = String(a.nome);
      const dataGravada = nome.slice(-10);
      if (nome !== `${prefixoChave}${payloadHash}:${dataGravada}`) {
        falhar("CONFLICT", "Chave de idempotência já utilizada com payload diferente");
      }
      if (Number(a.convenioId) !== p.convenioId || Number(a.userId) !== p.userId ||
          a.s3Key !== "" || a.s3Url !== "" || a.status !== "processado" ||
          Number(a.totalItens) !== p.itens.length) {
        falhar("PRECONDITION_FAILED", "Âncora manual inconsistente; revisão necessária");
      }
      data(dataGravada, "dataPagamento persistida");
      const itens = await linhas(tx, sql`
        SELECT d.id, d.recurso_id AS recursoId, r.id AS recursoVinculado
        FROM demonstrativo d LEFT JOIN recursosGlosa r ON r.id = d.recurso_id
          AND r.estabelecimentoId = d.estabelecimentoId AND r.convenioId = d.convenio_id
        WHERE d.arquivo_id = ${Number(a.id)}
          AND d.estabelecimentoId = ${p.estabelecimentoId} AND d.convenio_id = ${p.convenioId}
        ORDER BY d.id FOR UPDATE
      `);
      if (itens.length !== p.itens.length) falhar("PRECONDITION_FAILED", "Itens da submissão ausentes; revisão necessária");
      for (let i = 0; i < itens.length; i++) {
        if (p.itens[i].justificativa && new Decimal(p.itens[i].valorGlosa).gt(0) &&
            (!Number(itens[i].recursoId) || Number(itens[i].recursoId) !== Number(itens[i].recursoVinculado))) {
          falhar("PRECONDITION_FAILED", "Vínculo do recurso da submissão ausente; revisão necessária");
        }
      }
      const ids = itens.map(item => Number(item.id));
      if (ids.some(v => !Number.isSafeInteger(v) || v <= 0)) falhar("PRECONDITION_FAILED", "IDs persistidos inválidos");
      return resultado(ids, dataGravada);
    }
    const dataPagamento = p.dataPagamento ?? new Date().toISOString().slice(0, 10);
    const identidadesEfetivas = new Set<string>();
    for (const item of p.itens) {
      const identidade = JSON.stringify([item.codigoItem, item.dataExecucao ?? dataPagamento, item.sequencialItem]);
      if (identidadesEfetivas.has(identidade)) falhar("BAD_REQUEST", "Identidade efetiva de item repetida");
      identidadesEfetivas.add(identidade);
    }
    const arquivoId = await inserir(tx, sql`
      INSERT INTO arquivos (nome, tipoArquivo, direcao, convenioId, estabelecimentoId, userId,
        s3Key, s3Url, tamanho, status, progresso, totalItens, itensProcessados, dataReferencia, dataPagamento)
      VALUES (${`${prefixoChave}${payloadHash}:${dataPagamento}`}, 'txt', 'retornado',
        ${p.convenioId}, ${p.estabelecimentoId}, ${p.userId}, '', '', 0, 'processado', 100,
        ${p.itens.length}, ${p.itens.length}, ${dataPagamento}, ${dataPagamento})
    `);
    const motivosDb = await linhas(tx, sql`
      SELECT codigo, descricao, descricaoSimplificada, grupo FROM motivosGlosa WHERE ativo = 'sim'
    `);
    const motivosValidos = motivosDb.filter(m => typeof m.codigo === "string" && typeof m.descricao === "string")
      .map(m => ({ codigo: String(m.codigo), descricao: String(m.descricao) }));
    const idsInseridos: number[] = [];
    for (const item of p.itens) {
      const info = resolverGlosaDicionario(item.codigoGlosa, item.erroTiss, motivosValidos);
      const codigoGlosa = texto(info?.codigo ?? item.codigoGlosa ?? undefined, "codigoGlosa", 500);
      const erroTiss = texto(item.erroTiss ?? info?.textoFormatado ?? codigoGlosa ?? undefined, "erroTiss", 500);
      const criarRecurso = new Decimal(item.valorGlosa).gt(0) && !!item.justificativa;
      const situacaoItem = new Decimal(item.valorGlosa).gt(0) ? "GLOSADO_MANUAL" :
        item.valorInformado === item.valorPago ? "PAGO_MANUAL" : "SALDO_MANUAL";
      const demonstrativoId = await inserir(tx, sql`
        INSERT INTO demonstrativo (arquivo_id, origem_tipo, estabelecimentoId, convenio_id,
          numero_guia, protocolo, lote_prestador, data_pagamento, data_referencia,
          carteira_beneficiario, nome_beneficiario, sequencial_item, codigo_item, descricao_item,
          tipo_lancamento, data_execucao, quantidade, valor_informado, valor_pago, valor_glosa,
          valor_recurso, justificativa_recurso,
          codigo_glosa, erro_tiss, situacao_item, recurso_status, classificacao_glosa)
        VALUES (${arquivoId}, 'excel', ${p.estabelecimentoId}, ${p.convenioId}, ${p.numeroGuia},
          ${p.protocolo}, ${p.lotePrestador}, ${dataPagamento}, ${dataPagamento},
          ${p.carteiraBeneficiario}, ${p.nomeBeneficiario}, ${item.sequencialItem}, ${item.codigoItem},
          ${item.descricaoItem}, ${item.tipoLancamento}, ${item.dataExecucao ?? dataPagamento},
          ${item.quantidade}, ${item.valorInformado}, ${item.valorPago}, ${item.valorGlosa},
          ${criarRecurso ? item.valorGlosa : "0.00"}, ${item.justificativa},
          ${codigoGlosa}, ${erroTiss}, ${situacaoItem},
          'sem_recurso', 'pendente')
      `);
      idsInseridos.push(demonstrativoId);
      if (!criarRecurso) continue;
      // Neste fluxo legado, valorCobrado representa o valor recursado, não o informado.
      const recursoId = await inserir(tx, sql`
        INSERT INTO recursosGlosa (convenioId, estabelecimentoId, userId, codigoProcedimento,
          descricaoProcedimento, guiaNumero, pacienteNome, pacienteCarteirinha, valorCobrado,
          valorGlosado, motivoGlosaConvenio, justificativaRecurso, status, prioridade)
        VALUES (${p.convenioId}, ${p.estabelecimentoId}, ${p.userId}, ${item.codigoItem},
          ${item.descricaoItem}, ${p.numeroGuia}, ${p.nomeBeneficiario}, ${p.carteiraBeneficiario},
          ${item.valorGlosa}, ${item.valorGlosa}, ${erroTiss ?? codigoGlosa ?? ""},
          ${item.justificativa}, 'pendente_envio', 'media')
      `);
      const [header] = await tx.execute(sql`
        UPDATE demonstrativo SET recurso_id = ${recursoId}, recurso_status = 'recurso_criado',
          classificacao_glosa = 'recursar'
        WHERE id = ${demonstrativoId} AND arquivo_id = ${arquivoId}
          AND estabelecimentoId = ${p.estabelecimentoId} AND convenio_id = ${p.convenioId}
          AND recurso_id IS NULL
      `);
      if (Number((header as { affectedRows?: unknown }).affectedRows) !== 1) {
        falhar("PRECONDITION_FAILED", "Falha no vínculo exato do recurso; transação cancelada");
      }
    }
    return resultado(idsInseridos, dataPagamento);
  });
}
