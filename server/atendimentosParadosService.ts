/**
 * Staging genérico e publicação de atendimentos parados.
 *
 * DESENHO
 * -------
 * Fluxo: banco de origem -> `atendimentos_parados_staging` -> `atendimentos_unificados`.
 *
 * A staging é a zona de pouso normalizada por estabelecimento. A publicação faz upsert em
 * `atendimentos_unificados` pelo índice único `uq_atend_estab_origem`
 * (`estabelecimentoId`, `origemSistema`, `origemId`) e desativa com `ativoNaFonte = 0` o que
 * não veio no lote atual.
 *
 * Não há `DELETE` nem `TRUNCATE` em nenhuma etapa:
 * - a carga é idempotente porque a staging também tem índice único na chave de origem;
 * - "saiu da origem" é representado por `ativoNaFonte = 0`, não por exclusão;
 * - `loteRef` identifica a carga, então a staging acumula histórico em vez de ser limpa.
 *
 * REGRA DE OURO
 * -------------
 * `origemId` precisa ser derivado de uma chave natural estável da origem. Usar id de tabela de
 * staging, contador, timestamp ou qualquer valor que mude entre cargas faz o banco concluir que
 * é outro atendimento e duplicar. Ver `GUIA-LEITURA-E-IMPORTACAO-ATENDIMENTOS.md`.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { atendimentos, atendimentosParadosStaging, type InsertAtendimentoParadoStaging } from "../drizzle/schema-integracao";
import { isTasySnapshotCoverageSafe } from "./tasyCsvImportService";

/** Origens gravadas em minúsculo — contrato já usado pelas telas (`origemSistema === 'tasy'`). */
const ORIGENS_MINUSCULAS = new Set(["tasy", "tasy_hemolabor"]);

/** Tamanho do lote de escrita no banco. */
const TAMANHO_LOTE = 500;

/** Linha normalizada que chega do banco de origem. */
export interface LinhaAtendimentoParado {
  origemId: string;
  numeroAtendimento: string;
  paciente?: string | null;
  convenio?: string | null;
  matricula?: string | null;
  conta?: string | null;
  autorizacao?: string | null;
  dataEntrada?: Date | string | null;
  dataSaida?: Date | string | null;
  dataEtapa?: Date | string | null;
  tipoAtendimento?: string | null;
  descricaoAtendimento?: string | null;
  codigoServico?: string | null;
  codigoProcedimento?: string | null;
  setorEntrada?: string | null;
  etapaConta?: string | null;
  setorEtapa?: string | null;
  usuarioEtapa?: string | null;
  competencia?: string | null;
  protocolo?: string | null;
  titulo?: string | null;
  medicoResponsavel?: string | null;
  valorConta?: string | number | null;
}

export interface EscopoPublicacao {
  estabelecimentoId: number;
  origemSistema: string;
  loteRef: string;
}

// ============================================================
// Funções puras (sem banco)
// ============================================================

/**
 * Normaliza o nome da origem para o contrato das telas.
 * `tasy`/`tasy_hemolabor` ficam em minúsculo; as demais origens ficam em maiúsculo,
 * como já fazem Warleine e Easyvision.
 */
export function normalizarOrigemSistema(origem: string): string {
  const valor = String(origem ?? "").trim();
  if (!valor) {
    throw new Error("origemSistema é obrigatório.");
  }
  const chave = valor.toLowerCase().replace(/\s+/g, "_");
  if (ORIGENS_MINUSCULAS.has(chave)) return chave;
  return chave.toUpperCase();
}

/**
 * Valida o identificador estável do atendimento na origem.
 * Rejeita vazio; aceita número de atendimento, protocolo ou id estável da origem.
 */
export function validarOrigemId(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  if (!texto) {
    throw new Error(
      "origemId vazio. Ele compõe a chave única: sem um identificador estável a carga duplica.",
    );
  }
  return texto;
}

/**
 * Referência do lote, determinística a partir do instante e do escopo.
 * Formato: `AAAAMMDDTHHMMSSZ-E<estabelecimentoId>-<ORIGEM>`.
 */
export function montarLoteRef(agora: Date, estabelecimentoId: number, origemSistema: string): string {
  const origem = normalizarOrigemSistema(origemSistema);
  const iso = agora.toISOString(); // 2026-10-01T13:45:00.000Z
  const carimbo = `${iso.slice(0, 10).replace(/-/g, "")}T${iso.slice(11, 19).replace(/:/g, "")}Z`;
  return `${carimbo}-E${estabelecimentoId}-${origem}`;
}

/** Serializa um objeto com chaves ordenadas, para o hash ser estável. */
function serializarCanonico(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(",")}]`;
  if (typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${serializarCanonico(v)}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** SHA-256 do conteúdo da linha, para detectar registro inalterado entre lotes. */
export function calcularHashConteudo(registro: Record<string, unknown>): string {
  return createHash("sha256").update(serializarCanonico(registro)).digest("hex");
}

/**
 * Extrai apenas o conteúdo do atendimento, descartando campos voláteis de sincronização.
 * Sem isso o hash mudaria a cada carga e nunca detectaria uma linha inalterada.
 */
export function extrairConteudoParaHash(
  registro: ReturnType<typeof mapearStagingParaUnificado>,
): Record<string, unknown> {
  const conteudo: Record<string, unknown> = { ...registro };
  delete conteudo.dataSincronizacao;
  delete conteudo.ativoNaFonte;
  return conteudo;
}

/** Converte valor de data vindo do conector em `Date`, ou `null`. */
export function converterData(valor: Date | string | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Classifica a linha para publicação.
 * Linha sem número de atendimento fica retida na staging como `rejeitado` e não é publicada.
 */
export function classificarLinha(
  linha: LinhaAtendimentoParado,
): { statusValidacao: "valido" | "aviso" | "rejeitado"; motivoRejeicao: string | null } {
  const numero = String(linha.numeroAtendimento ?? "").trim();
  if (!numero) {
    return { statusValidacao: "rejeitado", motivoRejeicao: "numeroAtendimento vazio" };
  }
  if (!converterData(linha.dataEntrada)) {
    return { statusValidacao: "aviso", motivoRejeicao: "dataEntrada ausente ou inválida" };
  }
  return { statusValidacao: "valido", motivoRejeicao: null };
}

/** Mantém apenas o que pode ser publicado. */
export function filtrarPublicaveis<T extends { statusValidacao: string }>(linhas: T[]): T[] {
  return linhas.filter((linha) => linha.statusValidacao !== "rejeitado");
}

/**
 * Converte a linha da staging no registro de `atendimentos_unificados`.
 * Não define `ultimoLoteId`: essa coluna pertence ao pipeline TASY por lote.
 */
export function mapearStagingParaUnificado(linha: LinhaAtendimentoParado & {
  estabelecimentoId: number;
  origemSistema: string;
}) {
  const valor = linha.valorConta;
  return {
    estabelecimentoId: linha.estabelecimentoId,
    origemSistema: linha.origemSistema,
    origemId: validarOrigemId(linha.origemId),
    numero_atendimento: String(linha.numeroAtendimento).trim(),
    paciente: linha.paciente ?? null,
    convenio: linha.convenio ?? null,
    matricula: linha.matricula ?? null,
    conta: linha.conta ?? null,
    autorizacao: linha.autorizacao ?? null,
    data_entrada: converterData(linha.dataEntrada),
    data_saida: converterData(linha.dataSaida),
    dtEtapa: converterData(linha.dataEtapa),
    tipo_atendimento: linha.tipoAtendimento ?? null,
    descricao_atendimento: linha.descricaoAtendimento ?? null,
    codigo_servico: linha.codigoServico ?? null,
    codigo_procedimento: linha.codigoProcedimento ?? null,
    dsSetorEntrada: linha.setorEntrada ?? null,
    etapaConta: linha.etapaConta ?? null,
    setorEtapa: linha.setorEtapa ?? null,
    userEtapa: linha.usuarioEtapa ?? null,
    competencia: linha.competencia ?? null,
    nomeProtocolo: linha.protocolo ?? null,
    titulo: linha.titulo ?? null,
    medicoResp: linha.medicoResponsavel ?? null,
    valorConta: valor === null || valor === undefined || valor === "" ? null : String(valor),
    ativoNaFonte: true,
    dataSincronizacao: new Date(),
  };
}

/**
 * Avalia se o lote pode substituir o snapshot ativo.
 * Reaproveita a regra já validada do pipeline TASY: com 100 ou mais contas ativas, o lote
 * precisa cobrir ao menos 80% delas. Abaixo disso, um arquivo parcial zeraria a tela.
 */
export function avaliarCoberturaPublicacao(ativosAntes: number, publicaveis: number): {
  seguro: boolean;
  cobertura: number;
} {
  const cobertura = ativosAntes > 0 ? (publicaveis / ativosAntes) * 100 : 100;
  return { seguro: isTasySnapshotCoverageSafe(ativosAntes, publicaveis), cobertura };
}

// ============================================================
// Funções com banco
// ============================================================

/**
 * Lê `affectedRows` de um resultado cru do driver, que pode vir como cabeçalho direto
 * ou embrulhado em `[cabeçalho, campos]`.
 */
function extrairLinhasAfetadas(resultado: unknown): number {
  if (!Array.isArray(resultado)) {
    const direto = resultado as { affectedRows?: number } | null;
    return Number(direto?.affectedRows ?? 0);
  }
  const primeiro = resultado[0] as { affectedRows?: number } | null;
  return Number(primeiro?.affectedRows ?? 0);
}

/** Lê a primeira linha de um resultado cru do driver em qualquer um dos formatos conhecidos. */
function extrairPrimeiraLinha(resultado: unknown): Record<string, unknown> {
  if (!Array.isArray(resultado)) return {};
  const linhas = Array.isArray(resultado[0]) ? (resultado[0] as unknown[]) : (resultado as unknown[]);
  const primeira = linhas[0];
  return primeira && typeof primeira === "object" ? (primeira as Record<string, unknown>) : {};
}

/** Monta o registro da staging com hash e classificação. */
export function montarRegistroStaging(
  linha: LinhaAtendimentoParado,
  escopo: EscopoPublicacao,
): InsertAtendimentoParadoStaging {
  const origemSistema = normalizarOrigemSistema(escopo.origemSistema);
  const classificacao = classificarLinha(linha);
  const registro = mapearStagingParaUnificado({
    ...linha,
    estabelecimentoId: escopo.estabelecimentoId,
    origemSistema,
  });

  return {
    estabelecimentoId: escopo.estabelecimentoId,
    origemSistema,
    origemId: validarOrigemId(linha.origemId),
    loteRef: escopo.loteRef,
    hashConteudo: calcularHashConteudo(extrairConteudoParaHash(registro)),
    statusValidacao: classificacao.statusValidacao,
    motivoRejeicao: classificacao.motivoRejeicao,
    numeroAtendimento: String(linha.numeroAtendimento ?? "").trim(),
    paciente: linha.paciente ?? null,
    convenio: linha.convenio ?? null,
    matricula: linha.matricula ?? null,
    conta: linha.conta ?? null,
    autorizacao: linha.autorizacao ?? null,
    dataEntrada: converterData(linha.dataEntrada),
    dataSaida: converterData(linha.dataSaida),
    dataEtapa: converterData(linha.dataEtapa),
    tipoAtendimento: linha.tipoAtendimento ?? null,
    descricaoAtendimento: linha.descricaoAtendimento ?? null,
    codigoServico: linha.codigoServico ?? null,
    codigoProcedimento: linha.codigoProcedimento ?? null,
    setorEntrada: linha.setorEntrada ?? null,
    etapaConta: linha.etapaConta ?? null,
    setorEtapa: linha.setorEtapa ?? null,
    usuarioEtapa: linha.usuarioEtapa ?? null,
    competencia: linha.competencia ?? null,
    protocolo: linha.protocolo ?? null,
    titulo: linha.titulo ?? null,
    medicoResponsavel: linha.medicoResponsavel ?? null,
    valorConta:
      linha.valorConta === null || linha.valorConta === undefined || linha.valorConta === ""
        ? null
        : String(linha.valorConta),
  };
}

/**
 * Grava (ou atualiza) as linhas do lote na staging.
 * Idempotente: repetir o mesmo lote atualiza as linhas em vez de duplicá-las.
 */
export async function carregarStagingParados(params: {
  estabelecimentoId: number;
  origemSistema: string;
  loteRef: string;
  linhas: LinhaAtendimentoParado[];
}): Promise<{ gravados: number; rejeitados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const origemSistema = normalizarOrigemSistema(params.origemSistema);
  const escopo: EscopoPublicacao = {
    estabelecimentoId: params.estabelecimentoId,
    origemSistema,
    loteRef: params.loteRef,
  };

  const registros = params.linhas.map((linha) => montarRegistroStaging(linha, escopo));
  const rejeitados = registros.filter((r) => r.statusValidacao === "rejeitado").length;

  const colunasAtualizaveis: Array<keyof InsertAtendimentoParadoStaging> = [
    "loteRef",
    "hashConteudo",
    "statusValidacao",
    "motivoRejeicao",
    "numeroAtendimento",
    "paciente",
    "convenio",
    "matricula",
    "conta",
    "autorizacao",
    "dataEntrada",
    "dataSaida",
    "dataEtapa",
    "tipoAtendimento",
    "descricaoAtendimento",
    "codigoServico",
    "codigoProcedimento",
    "setorEntrada",
    "etapaConta",
    "setorEtapa",
    "usuarioEtapa",
    "competencia",
    "protocolo",
    "titulo",
    "medicoResponsavel",
    "valorConta",
    "dataSincronizacao",
    "atualizadoEm",
  ];
  const conjuntoAtualizacao = Object.fromEntries(
    colunasAtualizaveis.map((coluna) => [coluna, sql.raw(`VALUES(\`${String(coluna)}\`)`)]),
  ) as Partial<Record<keyof InsertAtendimentoParadoStaging, unknown>>;

  const agora = new Date();
  for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
    const lote = registros.slice(i, i + TAMANHO_LOTE).map((registro) => ({
      ...registro,
      dataSincronizacao: agora,
      atualizadoEm: agora,
    }));
    await db.insert(atendimentosParadosStaging).values(lote).onDuplicateKeyUpdate({
      set: conjuntoAtualizacao as never,
    });
  }

  return { gravados: registros.length, rejeitados };
}

/**
 * Publica o lote da staging em `atendimentos_unificados`.
 *
 * Dentro de uma transação:
 * 1. conta as linhas publicáveis do lote;
 * 2. valida a cobertura contra o que está ativo hoje (evita zerar a tela com arquivo parcial);
 * 3. faz upsert pela chave única;
 * 4. desativa (`ativoNaFonte = 0`) o que está ativo mas não veio neste lote.
 */
export async function publicarAtendimentosParados(params: EscopoPublicacao & {
  permitirReducaoGrande?: boolean;
}): Promise<{
  publicaveis: number;
  ativosAntes: number;
  cobertura: number;
  publicados: number;
  desativados: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const estabelecimentoId = params.estabelecimentoId;
  const origemSistema = normalizarOrigemSistema(params.origemSistema);
  const loteRef = String(params.loteRef ?? "").trim();
  if (!loteRef) throw new Error("loteRef é obrigatório para publicar.");

  const escopoStaging = and(
    eq(atendimentosParadosStaging.estabelecimentoId, estabelecimentoId),
    eq(atendimentosParadosStaging.origemSistema, origemSistema),
    eq(atendimentosParadosStaging.loteRef, loteRef),
    sql`${atendimentosParadosStaging.statusValidacao} <> 'rejeitado'`,
  );
  const escopoDestino = and(
    eq(atendimentos.estabelecimentoId, estabelecimentoId),
    eq(atendimentos.origemSistema, origemSistema),
  );

  return db.transaction(async (tx) => {
    const linhas = await tx
      .select()
      .from(atendimentosParadosStaging)
      .where(escopoStaging);

    const publicaveis = linhas.length;
    if (publicaveis === 0) {
      throw new Error(`Lote ${loteRef} não contém linhas publicáveis.`);
    }

    const ativos = await tx
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(and(escopoDestino, eq(atendimentos.ativoNaFonte, true)));
    const ativosAntes = ativos.length;

    const { seguro, cobertura } = avaliarCoberturaPublicacao(ativosAntes, publicaveis);
    if (!seguro && !params.permitirReducaoGrande) {
      throw new Error(
        `Publicação bloqueada: o lote tem ${publicaveis} atendimentos e há ${ativosAntes} ativos `
          + `(${cobertura.toFixed(1)}%). Se é uma carga incremental, use o modo incremental; `
          + `se o snapshot completo foi reduzido de propósito, confirme explicitamente.`,
      );
    }

    const registros = linhas.map((linha) =>
      mapearStagingParaUnificado({
        origemId: linha.origemId,
        numeroAtendimento: linha.numeroAtendimento,
        paciente: linha.paciente,
        convenio: linha.convenio,
        matricula: linha.matricula,
        conta: linha.conta,
        autorizacao: linha.autorizacao,
        dataEntrada: linha.dataEntrada,
        dataSaida: linha.dataSaida,
        dataEtapa: linha.dataEtapa,
        tipoAtendimento: linha.tipoAtendimento,
        descricaoAtendimento: linha.descricaoAtendimento,
        codigoServico: linha.codigoServico,
        codigoProcedimento: linha.codigoProcedimento,
        setorEntrada: linha.setorEntrada,
        etapaConta: linha.etapaConta,
        setorEtapa: linha.setorEtapa,
        usuarioEtapa: linha.usuarioEtapa,
        competencia: linha.competencia,
        protocolo: linha.protocolo,
        titulo: linha.titulo,
        medicoResponsavel: linha.medicoResponsavel,
        valorConta: linha.valorConta,
        estabelecimentoId,
        origemSistema,
      }),
    );

    const colunasDestino = [
      "numero_atendimento",
      "paciente",
      "convenio",
      "matricula",
      "conta",
      "autorizacao",
      "data_entrada",
      "data_saida",
      "dtEtapa",
      "tipo_atendimento",
      "descricao_atendimento",
      "codigo_servico",
      "codigo_procedimento",
      "dsSetorEntrada",
      "etapaConta",
      "setorEtapa",
      "userEtapa",
      "competencia",
      "nomeProtocolo",
      "titulo",
      "medicoResp",
      "valorConta",
      "ativoNaFonte",
      "dataSincronizacao",
      "atualizadoEm",
    ];
    const conjuntoAtualizacao = Object.fromEntries(
      colunasDestino.map((coluna) => [coluna, sql.raw(`VALUES(\`${coluna}\`)`)]),
    );

    let publicados = 0;
    for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
      const lote = registros.slice(i, i + TAMANHO_LOTE);
      await tx.insert(atendimentos).values(lote).onDuplicateKeyUpdate({
        set: { ...conjuntoAtualizacao, atualizadoEm: sql`NOW()` } as never,
      });
      publicados += lote.length;
    }

    // "Saiu da origem" vira desativação, não exclusão. Escopo fechado em estabelecimento + origem,
    // então publicar Warleine nunca toca linhas de TASY.
    const resultadoDesativacao: unknown = await tx.execute(sql`
      UPDATE atendimentos_unificados AS destino
      SET destino.ativoNaFonte = 0, destino.atualizadoEm = NOW()
      WHERE destino.estabelecimentoId = ${estabelecimentoId}
        AND destino.origemSistema = ${origemSistema}
        AND destino.ativoNaFonte = 1
        AND NOT EXISTS (
          SELECT 1
          FROM atendimentos_parados_staging AS origem
          WHERE origem.estabelecimentoId = destino.estabelecimentoId
            AND origem.origemSistema = destino.origemSistema
            AND origem.origemId = destino.origemId
            AND origem.loteRef = ${loteRef}
            AND origem.statusValidacao <> 'rejeitado'
        )
    `);
    const desativados = extrairLinhasAfetadas(resultadoDesativacao);

    return { publicaveis, ativosAntes, cobertura, publicados, desativados };
  });
}

/** Resumo do que está na staging de um lote, para conferência antes de publicar. */
export async function obterResumoStaging(params: EscopoPublicacao): Promise<{
  total: number;
  publicaveis: number;
  rejeitados: number;
  valorTotal: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const origemSistema = normalizarOrigemSistema(params.origemSistema);
  const resultado: unknown = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN statusValidacao <> 'rejeitado' THEN 1 ELSE 0 END) AS publicaveis,
      SUM(CASE WHEN statusValidacao = 'rejeitado' THEN 1 ELSE 0 END) AS rejeitados,
      COALESCE(SUM(CASE WHEN statusValidacao <> 'rejeitado' THEN valorConta ELSE 0 END), 0) AS valorTotal
    FROM atendimentos_parados_staging
    WHERE estabelecimentoId = ${params.estabelecimentoId}
      AND origemSistema = ${origemSistema}
      AND loteRef = ${params.loteRef}
  `);

  const linha = extrairPrimeiraLinha(resultado);

  return {
    total: Number(linha.total ?? 0),
    publicaveis: Number(linha.publicaveis ?? 0),
    rejeitados: Number(linha.rejeitados ?? 0),
    valorTotal: Number(linha.valorTotal ?? 0),
  };
}
