/**
 * Staging e publicação de atendimentos parados — uma tabela de staging por unidade.
 *
 * DESENHO
 * -------
 * Fluxo: banco de origem -> `stagion_atendimentos_parados_<unidade>` -> `atendimentos_unificados`.
 *
 * Cada unidade tem a sua própria tabela de pouso, porque cada uma tem a sua rotina de extração.
 * A recarga de uma unidade nunca alcança o dado de outra, e o escopo do que é desativado fica
 * fechado em estabelecimento + origem.
 *
 * A publicação faz upsert em `atendimentos_unificados` pelo índice único `uq_atend_estab_origem`
 * (`estabelecimentoId`, `origemSistema`, `origemId`) e desativa com `ativoNaFonte = 0` o que não
 * veio no lote atual.
 *
 * Não há `DELETE` nem `TRUNCATE` em nenhuma etapa:
 * - a carga é idempotente porque cada staging tem índice único na chave de origem;
 * - "saiu da origem" é `ativoNaFonte = 0`, não exclusão;
 * - `loteRef` identifica a carga, então a staging acumula histórico em vez de ser limpa.
 *
 * REGRA DE OURO
 * -------------
 * `origemId` precisa vir de uma chave natural estável da origem. Usar id de tabela de staging,
 * contador ou timestamp faz o banco concluir que é outro atendimento e duplicar.
 */
import { createHash } from "node:crypto";
import { and, count, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  atendimentos,
  stagingAtendimentosParadosHemolabor,
  stagingAtendimentosParadosIad,
  stagingAtendimentosParadosIrg,
  stagingAtendimentosParadosMaternidade,
  stagingAtendimentosParadosUrologico,
  type TabelaStagingAtendimentosParados,
} from "../drizzle/schema-integracao";
import { isTasySnapshotCoverageSafe } from "./tasyCsvImportService";

/** Origens gravadas em minúsculo — contrato já usado pelas telas (`origemSistema === 'tasy'`). */
const ORIGENS_MINUSCULAS = new Set(["tasy", "tasy_hemolabor"]);

/** Tamanho do lote de escrita no banco. */
const TAMANHO_LOTE = 500;

/** Unidades com tabela de staging de atendimentos parados. */
export const UNIDADES_STAGING_ATENDIMENTOS_PARADOS = [
  "urologico",
  "iad",
  "irg",
  "hemolabor",
  "maternidade",
] as const;

export type UnidadeStagingAtendimentosParados =
  (typeof UNIDADES_STAGING_ATENDIMENTOS_PARADOS)[number];

/**
 * Mapa unidade -> tabela física.
 * O nome da tabela da maternidade é o informado pela equipe e é preservado literalmente.
 */
const TABELAS_STAGING: Record<UnidadeStagingAtendimentosParados, TabelaStagingAtendimentosParados> = {
  urologico: stagingAtendimentosParadosUrologico,
  iad: stagingAtendimentosParadosIad,
  irg: stagingAtendimentosParadosIrg,
  hemolabor: stagingAtendimentosParadosHemolabor,
  maternidade: stagingAtendimentosParadosMaternidade,
};

/** Resolve a tabela de staging da unidade, falhando fechado em unidade desconhecida. */
export function resolverTabelaStaging(unidade: string): TabelaStagingAtendimentosParados {
  const chave = String(unidade ?? "").trim().toLowerCase();
  const tabela = TABELAS_STAGING[chave as UnidadeStagingAtendimentosParados];
  if (!tabela) {
    throw new Error(
      `Unidade "${unidade}" não possui tabela de staging de atendimentos parados. `
        + `Unidades conhecidas: ${UNIDADES_STAGING_ATENDIMENTOS_PARADOS.join(", ")}.`,
    );
  }
  return tabela;
}

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
  unidade: UnidadeStagingAtendimentosParados | string;
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
  const iso = agora.toISOString();
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

/** Monta a linha da staging com hash e classificação. */
export function montarLinhaStaging(linha: LinhaAtendimentoParado, escopo: EscopoPublicacao) {
  const origemSistema = normalizarOrigemSistema(escopo.origemSistema);
  const classificacao = classificarLinha(linha);
  const registro = mapearStagingParaUnificado({
    ...linha,
    estabelecimentoId: escopo.estabelecimentoId,
    origemSistema,
  });
  const valor = linha.valorConta;

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
    valorConta: valor === null || valor === undefined || valor === "" ? null : String(valor),
  };
}

// ============================================================
// Funções com banco
// ============================================================

/**
 * Grava (ou atualiza) as linhas do lote na staging da unidade.
 * Idempotente: repetir o mesmo lote atualiza as linhas em vez de duplicá-las.
 */
export async function carregarStagingParados(params: EscopoPublicacao & {
  linhas: LinhaAtendimentoParado[];
}): Promise<{ gravados: number; rejeitados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const tabela = resolverTabelaStaging(params.unidade);
  const origemSistema = normalizarOrigemSistema(params.origemSistema);
  const escopo: EscopoPublicacao = {
    unidade: params.unidade,
    estabelecimentoId: params.estabelecimentoId,
    origemSistema,
    loteRef: params.loteRef,
  };

  const linhas = params.linhas.map((linha) => montarLinhaStaging(linha, escopo));
  const rejeitados = linhas.filter((linha) => linha.statusValidacao === "rejeitado").length;
  const agora = new Date();

  const colunasAtualizaveis = [
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
  ] as const;
  const conjuntoAtualizacao = Object.fromEntries(
    colunasAtualizaveis.map((coluna) => [coluna, sql.raw(`VALUES(\`${coluna}\`)`)]),
  );

  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE).map((linha) => ({
      ...linha,
      dataSincronizacao: agora,
      atualizadoEm: agora,
    }));
    await db.insert(tabela).values(lote).onDuplicateKeyUpdate({
      set: conjuntoAtualizacao as never,
    });
  }

  return { gravados: linhas.length, rejeitados };
}

/**
 * Publica o lote da staging na tabela que as telas apresentam.
 *
 * Dentro de uma transação:
 * 1. confere que o lote não mistura unidades;
 * 2. conta as linhas publicáveis;
 * 3. valida a cobertura contra o que está ativo hoje (evita zerar a tela com arquivo parcial);
 * 4. faz upsert pela chave única;
 * 5. desativa (`ativoNaFonte = 0`) o que está ativo mas não veio neste lote.
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

  const tabela = resolverTabelaStaging(params.unidade);
  const estabelecimentoId = params.estabelecimentoId;
  const origemSistema = normalizarOrigemSistema(params.origemSistema);
  const loteRef = String(params.loteRef ?? "").trim();
  if (!loteRef) throw new Error("loteRef é obrigatório para publicar.");

  const escopoDestino = and(
    eq(atendimentos.estabelecimentoId, estabelecimentoId),
    eq(atendimentos.origemSistema, origemSistema),
  );
  const lotePublicavel = and(
    eq(tabela.loteRef, loteRef),
    ne(tabela.statusValidacao, "rejeitado"),
  );

  return db.transaction(async (tx) => {
    // Guarda: o lote precisa pertencer a uma única unidade e ser a unidade esperada.
    const unidadesNoLote = await tx
      .selectDistinct({ estabelecimentoId: tabela.estabelecimentoId })
      .from(tabela)
      .where(lotePublicavel);
    const idsNoLote = unidadesNoLote.map((linha) => Number(linha.estabelecimentoId));
    if (idsNoLote.length > 1) {
      throw new Error(
        `Lote ${loteRef} mistura estabelecimentos (${idsNoLote.join(", ")}). `
          + "A carga deve ser separada por unidade.",
      );
    }
    if (idsNoLote.length === 1 && idsNoLote[0] !== estabelecimentoId) {
      throw new Error(
        `Lote ${loteRef} pertence ao estabelecimento ${idsNoLote[0]}, `
          + `e não ao ${estabelecimentoId} informado.`,
      );
    }

    const publicaveis = idsNoLote.length === 0
      ? 0
      : Number(
          (
            await tx
              .select({ total: count() })
              .from(tabela)
              .where(and(lotePublicavel, eq(tabela.estabelecimentoId, estabelecimentoId)))
          )[0]?.total ?? 0,
        );
    if (publicaveis === 0) {
      throw new Error(`Lote ${loteRef} não contém linhas publicáveis para esta unidade.`);
    }

    const ativosAntes = Number(
      (
        await tx
          .select({ total: count() })
          .from(atendimentos)
          .where(and(escopoDestino, eq(atendimentos.ativoNaFonte, true)))
      )[0]?.total ?? 0,
    );

    const { seguro, cobertura } = avaliarCoberturaPublicacao(ativosAntes, publicaveis);
    if (!seguro && !params.permitirReducaoGrande) {
      throw new Error(
        `Publicação bloqueada: o lote tem ${publicaveis} atendimentos e há ${ativosAntes} ativos `
          + `(${cobertura.toFixed(1)}%). Se é uma carga incremental, use o modo incremental; `
          + `se o snapshot completo foi reduzido de propósito, confirme explicitamente.`,
      );
    }

    const linhas = await tx
      .select()
      .from(tabela)
      .where(and(lotePublicavel, eq(tabela.estabelecimentoId, estabelecimentoId)));

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
    ] as const;
    const conjuntoAtualizacao = Object.fromEntries(
      colunasDestino
        .filter((coluna) => coluna !== "atualizadoEm")
        .map((coluna) => [coluna, sql.raw(`VALUES(\`${coluna}\`)`)]),
    );

    let publicados = 0;
    for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
      const lote = registros.slice(i, i + TAMANHO_LOTE);
      await tx
        .insert(atendimentos)
        .values(lote)
        .onDuplicateKeyUpdate({
          set: { ...conjuntoAtualizacao, atualizadoEm: sql`NOW()` } as never,
        });
      publicados += lote.length;
    }

    // "Saiu da origem" vira desativação, não exclusão. A subconsulta olha apenas a staging
    // desta unidade, e o escopo de destino fecha em estabelecimento + origem, então publicar
    // a Urologia nunca toca linhas de outra unidade ou de outra origem.
    const presenteNoLote = tx
      .select({ um: sql`1` })
      .from(tabela)
      .where(
        and(
          eq(tabela.estabelecimentoId, estabelecimentoId),
          eq(tabela.origemSistema, origemSistema),
          eq(tabela.origemId, atendimentos.origemId),
          eq(tabela.loteRef, loteRef),
          ne(tabela.statusValidacao, "rejeitado"),
        ),
      );

    const ausentes = await tx
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(and(escopoDestino, eq(atendimentos.ativoNaFonte, true), notExists(presenteNoLote)));

    const agora = new Date();
    for (let i = 0; i < ausentes.length; i += TAMANHO_LOTE) {
      const ids = ausentes.slice(i, i + TAMANHO_LOTE).map((linha) => linha.id);
      await tx
        .update(atendimentos)
        .set({ ativoNaFonte: false, atualizadoEm: agora })
        .where(inArray(atendimentos.id, ids));
    }

    return { publicaveis, ativosAntes, cobertura, publicados, desativados: ausentes.length };
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

  const tabela = resolverTabelaStaging(params.unidade);
  const origemSistema = normalizarOrigemSistema(params.origemSistema);

  const [resumo] = await db
    .select({
      total: count(),
      publicaveis: sql<string>`SUM(CASE WHEN ${tabela.statusValidacao} <> 'rejeitado' THEN 1 ELSE 0 END)`,
      rejeitados: sql<string>`SUM(CASE WHEN ${tabela.statusValidacao} = 'rejeitado' THEN 1 ELSE 0 END)`,
      valorTotal: sql<string>`COALESCE(SUM(CASE WHEN ${tabela.statusValidacao} <> 'rejeitado' THEN ${tabela.valorConta} ELSE 0 END), 0)`,
    })
    .from(tabela)
    .where(
      and(
        eq(tabela.estabelecimentoId, params.estabelecimentoId),
        eq(tabela.origemSistema, origemSistema),
        eq(tabela.loteRef, params.loteRef),
      ),
    );

  return {
    total: Number(resumo?.total ?? 0),
    publicaveis: Number(resumo?.publicaveis ?? 0),
    rejeitados: Number(resumo?.rejeitados ?? 0),
    valorTotal: Number(resumo?.valorTotal ?? 0),
  };
}