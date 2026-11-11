import type { Pool, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import {
  consolidarRegistrosFinanceiros,
  calcularIndicadoresFinanceiros,
  normalizarConvenio,
  type RegistroFinanceiroUnificado,
} from "./faturadoRecebidoUnificadoService";
import {
  biClientConfigSchema,
  calcularPercentualGlosaBi,
  DEFAULT_BI_CLIENT_CONFIG,
  normalizeBiClientConfig,
  type BiClientConfig,
  type BiCriterioPeriodoXml,
  type BiDimensaoSetor,
  type BiFormulaPctGlosa,
  type BiSubFonteBanco,
} from "../shared/biPersonalizadoConfig";

export type BiModoFonte = "XML" | "BANCO_CSV";

export interface BuscarPainelBiInput {
  estabelecimentoId: number;
  modoFonte: BiModoFonte;
  competencias?: string[];
  convenios?: string[];
  setores?: string[];
  criterioPeriodoXml?: BiCriterioPeriodoXml;
  subFonteBanco?: BiSubFonteBanco;
  dimensaoSetor?: BiDimensaoSetor;
}

export interface LinhaMatrizBi {
  chave: string;
  label: string;
  produzido: number;
  faturado: number;
  recebido: number;
  glosa: number;
  aReceber: number;
  pctGlosa: number;
  pctRecebido: number;
  qtdContas: number;
}

export interface LinhaMotivoGlosaBi {
  codigo: string;
  motivo: string;
  glosa: number;
  pctParticipacao: number;
  quantidade: number;
}

export interface LinhaProcedimentoBi {
  codigo: string;
  descricao: string;
  tipo: string;
  faturado: number;
  recebido: number;
  glosa: number;
  pctGlosa: number;
  quantidade: number;
}

export interface PainelBiExecutivoResponse {
  estabelecimento: {
    id: number;
    nome: string;
    cnpj: string | null;
  };
  configCliente: BiClientConfig;
  fonteAtiva: {
    modoFonte: BiModoFonte;
    subFonteResolvida: "XML_OFICIAL" | "WARLEINE" | "RECEBIMENTO_GERAL";
    criterioPeriodoXml: BiCriterioPeriodoXml;
    dimensaoSetorAtiva: BiDimensaoSetor;
    possuiSetorReal: boolean;
    atualizadoEm: string | null;
  };
  resumo: {
    produzido: number;
    faturado: number;
    recebido: number;
    aReceber: number;
    glosa: number;
    pctGlosa: number;
    pctRecebido: number;
    glosaARecursar: number;
    glosaEmRecurso: number;
    glosaRecuperada: number;
    glosaAceita: number;
    qtdContas: number;
    qtdItens: number;
  };
  porCompetencia: LinhaMatrizBi[];
  porSetor: LinhaMatrizBi[];
  porConvenio: LinhaMatrizBi[];
  porTipoItem: LinhaMatrizBi[];
  porMotivoGlosa: LinhaMotivoGlosaBi[];
  porProcedimento: LinhaProcedimentoBi[];
  porProcedimentoGlosado: LinhaProcedimentoBi[];
  filtrosDisponiveis: {
    setores: Array<{ chave: string; label: string }>;
    competencias: Array<{ chave: string; label: string }>;
    convenios: Array<{ chave: string; label: string }>;
  };
}

/**
 * A estrutura física da tabela `estabelecimento_bi_personalizado` é gerida exclusivamente
 * pela migração versionada `0146_painel_bi_personalizado` (sem DDL em runtime).
 */
function isMissingBiTableError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; sqlState?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146 || e.sqlState === "42S02") return true;
  return (
    typeof e.message === "string" &&
    e.message.includes("estabelecimento_bi_personalizado") &&
    /doesn't exist|does not exist/i.test(e.message)
  );
}

const round2 = (v: unknown): number => {
  const num = Number(v || 0);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
};

const pct = (part: number, total: number): number =>
  total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;

function formatCompetencia(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "Sem competência";
  const mIso = /^(\d{4})[-/](\d{1,2})/.exec(s);
  if (mIso) {
    return `${mIso[1]}/${mIso[2].padStart(2, "0")}`;
  }
  const mBr = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (mBr) {
    return `${mBr[2]}/${mBr[1].padStart(2, "0")}`;
  }
  return s;
}

function inPlaceholders(items: string[]): string {
  return items.map(() => "?").join(",");
}

export async function obterConfiguracaoBiCliente(
  estabelecimentoId: number,
): Promise<BiClientConfig> {
  const pool = await getRawPool();
  if (!pool) return DEFAULT_BI_CLIENT_CONFIG;

  let rows: RowDataPacket[];
  try {
    [rows] = await pool.query<RowDataPacket[]>(
      `SELECT tema_preset, logo_url, nome_exibicao, titulo_relatorio, rodape_texto, configuracao_json
       FROM estabelecimento_bi_personalizado
       WHERE estabelecimento_id = ?
       LIMIT 1`,
      [estabelecimentoId],
    );
  } catch (err) {
    if (isMissingBiTableError(err)) {
      return DEFAULT_BI_CLIENT_CONFIG;
    }
    throw err;
  }

  if (!rows.length) {
    return DEFAULT_BI_CLIENT_CONFIG;
  }

  const row = rows[0];
  let parsedJson: Record<string, unknown> = {};
  if (row.configuracao_json) {
    if (typeof row.configuracao_json === "string") {
      try {
        parsedJson = JSON.parse(row.configuracao_json);
      } catch {
        parsedJson = {};
      }
    } else if (typeof row.configuracao_json === "object") {
      parsedJson = row.configuracao_json as Record<string, unknown>;
    }
  }

  return normalizeBiClientConfig({
    ...parsedJson,
    temaPreset: row.tema_preset || parsedJson.temaPreset || "ela_petroleo",
    logoUrl: row.logo_url ?? parsedJson.logoUrl ?? null,
    nomeExibicao: row.nome_exibicao ?? parsedJson.nomeExibicao ?? null,
    tituloRelatorio:
      row.titulo_relatorio || parsedJson.tituloRelatorio || "INDICADORES DE FATURAMENTO",
    rodapeTexto:
      row.rodape_texto ||
      parsedJson.rodapeTexto ||
      "CICLO DA RECEITA - FATURADO AO RECEBIMENTO",
  });
}

export async function salvarConfiguracaoBiCliente(params: {
  estabelecimentoId: number;
  config: BiClientConfig;
  userId: number;
  userName: string | null;
}): Promise<BiClientConfig> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");

  const validConfig = biClientConfigSchema.parse(params.config);
  const jsonPayload = JSON.stringify(validConfig);

  try {
    await pool.execute(
      `INSERT INTO estabelecimento_bi_personalizado (
        estabelecimento_id,
        tema_preset,
        logo_url,
        nome_exibicao,
        titulo_relatorio,
        rodape_texto,
        configuracao_json,
        atualizado_por_id,
        atualizado_por_nome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        tema_preset = VALUES(tema_preset),
        logo_url = VALUES(logo_url),
        nome_exibicao = VALUES(nome_exibicao),
        titulo_relatorio = VALUES(titulo_relatorio),
        rodape_texto = VALUES(rodape_texto),
        configuracao_json = VALUES(configuracao_json),
        atualizado_por_id = VALUES(atualizado_por_id),
        atualizado_por_nome = VALUES(atualizado_por_nome),
        updated_at = CURRENT_TIMESTAMP`,
      [
        params.estabelecimentoId,
        validConfig.temaPreset,
        validConfig.logoUrl || null,
        validConfig.nomeExibicao || null,
        validConfig.tituloRelatorio,
        validConfig.rodapeTexto,
        jsonPayload,
        params.userId,
        params.userName || null,
      ],
    );
  } catch (err) {
    if (isMissingBiTableError(err)) {
      throw new Error(
        "A tabela de personalização do BI (migração 0146) ainda não foi aplicada neste ambiente.",
      );
    }
    throw err;
  }

  return validConfig;
}

export async function resetarConfiguracaoBiCliente(
  estabelecimentoId: number,
): Promise<BiClientConfig> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  try {
    await pool.execute(
      `DELETE FROM estabelecimento_bi_personalizado WHERE estabelecimento_id = ?`,
      [estabelecimentoId],
    );
  } catch (err) {
    if (isMissingBiTableError(err)) {
      throw new Error(
        "A tabela de personalização do BI (migração 0146) ainda não foi aplicada neste ambiente.",
      );
    }
    throw err;
  }
  return DEFAULT_BI_CLIENT_CONFIG;
}

function buildMatrizRow(
  chave: string,
  label: string,
  vals: {
    produzido?: number;
    faturado: number;
    recebido: number;
    glosa: number;
    aReceber?: number;
    qtdContas?: number;
  },
  formulaPctGlosa: BiFormulaPctGlosa,
): LinhaMatrizBi {
  const faturado = round2(vals.faturado);
  const produzido = round2(vals.produzido ?? faturado);
  const recebido = round2(vals.recebido);
  const glosa = round2(vals.glosa);
  const aReceber =
    vals.aReceber !== undefined
      ? round2(vals.aReceber)
      : round2(Math.max(faturado - recebido - glosa, 0));
  return {
    chave,
    label,
    produzido,
    faturado,
    recebido,
    glosa,
    aReceber,
    pctGlosa: calcularPercentualGlosaBi(glosa, faturado, recebido, formulaPctGlosa),
    pctRecebido: pct(recebido, faturado),
    qtdContas: Number(vals.qtdContas || 0),
  };
}

// ============================================================================
// FONTE 1: BANCO / CSV (warleine_faturamento_itens_ativos ou recebimento_geral)
// ============================================================================

async function resolverSubFonteBanco(
  pool: Pool,
  estabelecimentoId: number,
  preferencia: BiSubFonteBanco,
): Promise<"WARLEINE" | "RECEBIMENTO_GERAL"> {
  if (preferencia === "WARLEINE") return "WARLEINE";
  if (preferencia === "RECEBIMENTO_GERAL") return "RECEBIMENTO_GERAL";

  try {
    const [wRows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 AS ok FROM warleine_faturamento_itens_ativos WHERE estabelecimentoId = ? LIMIT 1`,
      [estabelecimentoId],
    );
    if (wRows.length > 0) return "WARLEINE";
  } catch {
    // View/table pode não existir em ambientes isolados
  }

  try {
    const [rgRows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 AS ok FROM recebimento_geral WHERE estabelecimentoId = ? LIMIT 1`,
      [estabelecimentoId],
    );
    if (rgRows.length > 0) return "RECEBIMENTO_GERAL";
  } catch {
    // fallback seguro
  }

  return "WARLEINE";
}

async function consultarBancoWarleine(
  pool: Pool,
  input: BuscarPainelBiInput,
  estabelecimento: { id: number; nome: string; cnpj: string | null },
  configCliente: BiClientConfig,
  dimensaoSetor: BiDimensaoSetor,
): Promise<PainelBiExecutivoResponse> {
  const convChaveSql =
    "COALESCE(NULLIF(TRIM(convenioFaturadoCodigo),''), NULLIF(TRIM(convenioFaturadoNome),''), 'SEM_CONVENIO')";
  const convNomeSql = "COALESCE(NULLIF(TRIM(convenioFaturadoNome),''), 'Sem convênio')";
  const dimSetorSql =
    dimensaoSetor === "tipo_item"
      ? "COALESCE(NULLIF(TRIM(tipoItem),''), 'Não informado')"
      : dimensaoSetor === "prestador"
        ? "COALESCE(NULLIF(TRIM(prestadorExecutanteNome),''), NULLIF(TRIM(prestadorExecutanteCodigo),''), 'Hospital / Corpo Clínico')"
        : "COALESCE(NULLIF(TRIM(setorNome),''), 'Não informado')";

  const clauses = ["estabelecimentoId = ?"];
  const params: Array<string | number> = [input.estabelecimentoId];

  if (input.competencias?.length) {
    clauses.push(`competencia IN (${inPlaceholders(input.competencias)})`);
    params.push(...input.competencias);
  }
  if (input.convenios?.length) {
    clauses.push(`(${convChaveSql} IN (${inPlaceholders(input.convenios)}) OR ${convNomeSql} IN (${inPlaceholders(input.convenios)}))`);
    params.push(...input.convenios, ...input.convenios);
  }
  if (input.setores?.length) {
    clauses.push(`${dimSetorSql} IN (${inPlaceholders(input.setores)})`);
    params.push(...input.setores);
  }

  const whereSql = clauses.join(" AND ");
  const selectMetricas = `
    COALESCE(SUM(valorFaturado), 0) AS faturado,
    COALESCE(SUM(valorTotalRecebido), 0) AS recebido,
    COALESCE(SUM(valorGlosa), 0) AS glosa,
    COALESCE(SUM(valorAberto), 0) AS aReceber,
    COALESCE(SUM(valorRecursado), 0) AS glosaEmRecurso,
    COALESCE(SUM(valorGlosaRecuperada), 0) AS glosaRecuperada,
    COALESCE(SUM(valorGlosaAceita), 0) AS glosaAceita,
    COALESCE(SUM(valorGlosaAnalise), 0) AS glosaARecursar,
    COUNT(DISTINCT numeroConta) AS qtdContas,
    COUNT(*) AS qtdItens
  `;

  const [
    [resumoRows],
    [compRows],
    [setorRows],
    [convRows],
    [tipoRows],
    [motivoRows],
    [procRows],
    [procGlosaRows],
    [dispSetoresRows],
    [dispCompRows],
    [dispConvRows],
    [lastUpdateRows],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT ${selectMetricas} FROM warleine_faturamento_itens_ativos WHERE ${whereSql}`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT competencia, ${selectMetricas}
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql}
       GROUP BY competencia
       ORDER BY competencia ASC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${dimSetorSql} AS setor, ${selectMetricas}
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql}
       GROUP BY ${dimSetorSql}
       ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${convChaveSql} AS convenioChave, MAX(${convNomeSql}) AS convenioNome, ${selectMetricas}
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql}
       GROUP BY ${convChaveSql}
       ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(tipoItem),''), 'Não informado') AS tipo, ${selectMetricas}
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql}
       GROUP BY COALESCE(NULLIF(TRIM(tipoItem),''), 'Não informado')
       ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigoGlosa),''), 'SEM_COD') AS codigo,
              COALESCE(NULLIF(TRIM(motivoGlosa),''), 'Motivo não informado') AS motivo,
              COALESCE(SUM(valorGlosa), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql} AND valorGlosa > 0
       GROUP BY COALESCE(NULLIF(TRIM(codigoGlosa),''), 'SEM_COD'), COALESCE(NULLIF(TRIM(motivoGlosa),''), 'Motivo não informado')
       ORDER BY glosa DESC
       LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigoTuss),''), NULLIF(TRIM(codigoItemInterno),''), 'S/COD') AS codigo,
              COALESCE(NULLIF(TRIM(servicoNome),''), 'Item sem descrição') AS descricao,
              COALESCE(NULLIF(TRIM(tipoItem),''), 'Não informado') AS tipo,
              COALESCE(SUM(valorFaturado), 0) AS faturado,
              COALESCE(SUM(valorTotalRecebido), 0) AS recebido,
              COALESCE(SUM(valorGlosa), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql}
       GROUP BY codigo, descricao, tipo
       ORDER BY faturado DESC
       LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigoTuss),''), NULLIF(TRIM(codigoItemInterno),''), 'S/COD') AS codigo,
              COALESCE(NULLIF(TRIM(servicoNome),''), 'Item sem descrição') AS descricao,
              COALESCE(NULLIF(TRIM(tipoItem),''), 'Não informado') AS tipo,
              COALESCE(SUM(valorFaturado), 0) AS faturado,
              COALESCE(SUM(valorTotalRecebido), 0) AS recebido,
              COALESCE(SUM(valorGlosa), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM warleine_faturamento_itens_ativos
       WHERE ${whereSql} AND valorGlosa > 0
       GROUP BY codigo, descricao, tipo
       ORDER BY glosa DESC
       LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${dimSetorSql} AS valor,
              COALESCE(NULLIF(TRIM(setorNome),''), '') AS setorBruto
       FROM warleine_faturamento_itens_ativos
       WHERE estabelecimentoId = ?
       ORDER BY valor ASC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT competencia AS valor
       FROM warleine_faturamento_itens_ativos
       WHERE estabelecimentoId = ? AND competencia IS NOT NULL AND competencia <> ''
       ORDER BY competencia DESC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${convChaveSql} AS chave, MAX(${convNomeSql}) AS label
       FROM warleine_faturamento_itens_ativos
       WHERE estabelecimentoId = ?
       GROUP BY ${convChaveSql}
       ORDER BY label ASC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT MAX(publicadoEm) AS atualizadoEm
       FROM warleine_faturamento_lotes
       WHERE estabelecimentoId = ? AND status = 'publicado'`,
      [input.estabelecimentoId],
    ),
  ]);

  const r = resumoRows[0] || {};
  const formula = configCliente.formulaPctGlosa;
  const faturado = round2(r.faturado);
  const recebido = round2(r.recebido);
  const glosa = round2(r.glosa);
  const aReceber = round2(r.aReceber);

  const possuiSetorReal = dispSetoresRows.some(
    (row) => String(row.setorBruto || "").trim().length > 0,
  );

  const totalGlosaMotivos = round2(glosa);

  return {
    estabelecimento,
    configCliente,
    fonteAtiva: {
      modoFonte: "BANCO_CSV",
      subFonteResolvida: "WARLEINE",
      criterioPeriodoXml: configCliente.criterioPeriodoXmlPadrao,
      dimensaoSetorAtiva: dimensaoSetor,
      possuiSetorReal,
      atualizadoEm: lastUpdateRows[0]?.atualizadoEm
        ? new Date(lastUpdateRows[0].atualizadoEm).toISOString()
        : null,
    },
    resumo: {
      produzido: faturado,
      faturado,
      recebido,
      aReceber,
      glosa,
      pctGlosa: calcularPercentualGlosaBi(glosa, faturado, recebido, formula),
      pctRecebido: pct(recebido, faturado),
      glosaARecursar: round2(r.glosaARecursar),
      glosaEmRecurso: round2(r.glosaEmRecurso),
      glosaRecuperada: round2(r.glosaRecuperada),
      glosaAceita: round2(r.glosaAceita),
      qtdContas: Number(r.qtdContas || 0),
      qtdItens: Number(r.qtdItens || 0),
    },
    porCompetencia: compRows.map((row) => {
      const comp = formatCompetencia(row.competencia);
      return buildMatrizRow(
        String(row.competencia || comp),
        comp,
        {
          produzido: Number(row.faturado || 0),
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: Number(row.aReceber || 0),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      );
    }),
    porSetor: setorRows.map((row) =>
      buildMatrizRow(
        String(row.setor),
        String(row.setor),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: Number(row.aReceber || 0),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porConvenio: convRows.map((row) =>
      buildMatrizRow(
        String(row.convenioChave),
        String(row.convenioNome),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: Number(row.aReceber || 0),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porTipoItem: tipoRows.map((row) =>
      buildMatrizRow(
        String(row.tipo),
        String(row.tipo),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: Number(row.aReceber || 0),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porMotivoGlosa: motivoRows.map((row) => {
      const vl = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        motivo: String(row.motivo),
        glosa: vl,
        pctParticipacao: pct(vl, totalGlosaMotivos || vl),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimento: procRows.map((row) => {
      const fat = round2(row.faturado);
      const rec = round2(row.recebido);
      const glo = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: rec,
        glosa: glo,
        pctGlosa: calcularPercentualGlosaBi(glo, fat, rec, formula),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimentoGlosado: procGlosaRows.map((row) => {
      const fat = round2(row.faturado);
      const rec = round2(row.recebido);
      const glo = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: rec,
        glosa: glo,
        pctGlosa: calcularPercentualGlosaBi(glo, fat, rec, formula),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    filtrosDisponiveis: {
      setores: dispSetoresRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: v })),
      competencias: dispCompRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: formatCompetencia(v) })),
      convenios: dispConvRows.map((r) => ({
        chave: String(r.chave),
        label: String(r.label),
      })),
    },
  };
}

async function consultarBancoRecebimentoGeral(
  pool: Pool,
  input: BuscarPainelBiInput,
  estabelecimento: { id: number; nome: string; cnpj: string | null },
  configCliente: BiClientConfig,
  dimensaoSetor: BiDimensaoSetor,
): Promise<PainelBiExecutivoResponse> {
  const compExpr = "COALESCE(NULLIF(TRIM(mes_producao),''), 'Sem competência')";
  const convExpr = "COALESCE(NULLIF(TRIM(convenio),''), 'Sem convênio')";
  const dimSetorSql =
    dimensaoSetor === "tipo_item"
      ? "COALESCE(NULLIF(TRIM(tipo_procedimento),''), NULLIF(TRIM(tipo_descricao),''), 'Não informado')"
      : dimensaoSetor === "prestador"
        ? "COALESCE(NULLIF(TRIM(nome_prestador),''), NULLIF(TRIM(prestador_executante),''), 'Hospital / Corpo Clínico')"
        : "COALESCE(NULLIF(TRIM(nome_setor),''), 'Não informado')";

  const recebidoExpr = "COALESCE(NULLIF(vl_total_recebido, 0), vl_recebido, 0)";
  const clauses = ["estabelecimentoId = ?"];
  const params: Array<string | number> = [input.estabelecimentoId];

  if (input.competencias?.length) {
    clauses.push(`${compExpr} IN (${inPlaceholders(input.competencias)})`);
    params.push(...input.competencias);
  }
  if (input.convenios?.length) {
    clauses.push(`${convExpr} IN (${inPlaceholders(input.convenios)})`);
    params.push(...input.convenios);
  }
  if (input.setores?.length) {
    clauses.push(`${dimSetorSql} IN (${inPlaceholders(input.setores)})`);
    params.push(...input.setores);
  }

  const whereSql = clauses.join(" AND ");
  const selectMetricas = `
    COALESCE(SUM(vl_faturado), 0) AS faturado,
    COALESCE(SUM(${recebidoExpr}), 0) AS recebido,
    COALESCE(SUM(vl_glosas), 0) AS glosa,
    COALESCE(SUM(vl_aberto), 0) AS aReceberInformado,
    COALESCE(SUM(vl_recurso), 0) AS glosaEmRecurso,
    COALESCE(SUM(gl_recuperado), 0) AS glosaRecuperada,
    COALESCE(SUM(gl_aceita), 0) AS glosaAceita,
    COALESCE(SUM(gl_analise), 0) AS glosaARecursar,
    COUNT(DISTINCT numero_conta) AS qtdContas,
    COUNT(*) AS qtdItens
  `;

  const [
    [resumoRows],
    [compRows],
    [setorRows],
    [convRows],
    [tipoRows],
    [motivoRows],
    [procRows],
    [procGlosaRows],
    [dispSetoresRows],
    [dispCompRows],
    [dispConvRows],
    [lastUpdateRows],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT ${selectMetricas} FROM recebimento_geral WHERE ${whereSql}`, params),
    pool.query<RowDataPacket[]>(
      `SELECT ${compExpr} AS competencia, ${selectMetricas}
       FROM recebimento_geral WHERE ${whereSql}
       GROUP BY ${compExpr} ORDER BY competencia ASC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${dimSetorSql} AS setor, ${selectMetricas}
       FROM recebimento_geral WHERE ${whereSql}
       GROUP BY ${dimSetorSql} ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${convExpr} AS convenioNome, ${selectMetricas}
       FROM recebimento_geral WHERE ${whereSql}
       GROUP BY ${convExpr} ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(tipo_procedimento),''), 'Não informado') AS tipo, ${selectMetricas}
       FROM recebimento_geral WHERE ${whereSql}
       GROUP BY COALESCE(NULLIF(TRIM(tipo_procedimento),''), 'Não informado')
       ORDER BY faturado DESC`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigo_tiss),''), 'SEM_COD') AS codigo,
              COALESCE(NULLIF(TRIM(descricao_motivo),''), 'Motivo não informado') AS motivo,
              COALESCE(SUM(vl_glosas), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM recebimento_geral
       WHERE ${whereSql} AND COALESCE(vl_glosas, 0) > 0
       GROUP BY codigo, motivo
       ORDER BY glosa DESC LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigo_sistema),''), 'S/COD') AS codigo,
              COALESCE(NULLIF(TRIM(descricao_item),''), 'Item sem descrição') AS descricao,
              COALESCE(NULLIF(TRIM(tipo_procedimento),''), 'Não informado') AS tipo,
              COALESCE(SUM(vl_faturado), 0) AS faturado,
              COALESCE(SUM(${recebidoExpr}), 0) AS recebido,
              COALESCE(SUM(vl_glosas), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM recebimento_geral WHERE ${whereSql}
       GROUP BY codigo, descricao, tipo
       ORDER BY faturado DESC LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(codigo_sistema),''), 'S/COD') AS codigo,
              COALESCE(NULLIF(TRIM(descricao_item),''), 'Item sem descrição') AS descricao,
              COALESCE(NULLIF(TRIM(tipo_procedimento),''), 'Não informado') AS tipo,
              COALESCE(SUM(vl_faturado), 0) AS faturado,
              COALESCE(SUM(${recebidoExpr}), 0) AS recebido,
              COALESCE(SUM(vl_glosas), 0) AS glosa,
              COUNT(*) AS quantidade
       FROM recebimento_geral WHERE ${whereSql} AND COALESCE(vl_glosas, 0) > 0
       GROUP BY codigo, descricao, tipo
       ORDER BY glosa DESC LIMIT 30`,
      params,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${dimSetorSql} AS valor,
              COALESCE(NULLIF(TRIM(nome_setor),''), '') AS setorBruto
       FROM recebimento_geral WHERE estabelecimentoId = ? ORDER BY valor ASC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${compExpr} AS valor FROM recebimento_geral WHERE estabelecimentoId = ? ORDER BY valor DESC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${convExpr} AS valor FROM recebimento_geral WHERE estabelecimentoId = ? ORDER BY valor ASC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT MAX(COALESCE(atualizado, sincronizado)) AS atualizadoEm FROM recebimento_geral WHERE estabelecimentoId = ?`,
      [input.estabelecimentoId],
    ),
  ]);

  const r = resumoRows[0] || {};
  const formula = configCliente.formulaPctGlosa;
  const faturado = round2(r.faturado);
  const recebido = round2(r.recebido);
  const glosa = round2(r.glosa);
  const aRecInfo = round2(r.aReceberInformado);
  const aReceber = aRecInfo > 0 ? aRecInfo : round2(Math.max(faturado - recebido - glosa, 0));

  const resolveAReceberRow = (row: RowDataPacket) => {
    const info = round2(row.aReceberInformado);
    const fat = round2(row.faturado);
    const rec = round2(row.recebido);
    const glo = round2(row.glosa);
    return info > 0 ? info : round2(Math.max(fat - rec - glo, 0));
  };

  return {
    estabelecimento,
    configCliente,
    fonteAtiva: {
      modoFonte: "BANCO_CSV",
      subFonteResolvida: "RECEBIMENTO_GERAL",
      criterioPeriodoXml: configCliente.criterioPeriodoXmlPadrao,
      dimensaoSetorAtiva: dimensaoSetor,
      possuiSetorReal: dispSetoresRows.some((s) => String(s.setorBruto || "").trim().length > 0),
      atualizadoEm: lastUpdateRows[0]?.atualizadoEm
        ? new Date(lastUpdateRows[0].atualizadoEm).toISOString()
        : null,
    },
    resumo: {
      produzido: faturado,
      faturado,
      recebido,
      aReceber,
      glosa,
      pctGlosa: calcularPercentualGlosaBi(glosa, faturado, recebido, formula),
      pctRecebido: pct(recebido, faturado),
      glosaARecursar: round2(r.glosaARecursar),
      glosaEmRecurso: round2(r.glosaEmRecurso),
      glosaRecuperada: round2(r.glosaRecuperada),
      glosaAceita: round2(r.glosaAceita),
      qtdContas: Number(r.qtdContas || 0),
      qtdItens: Number(r.qtdItens || 0),
    },
    porCompetencia: compRows.map((row) =>
      buildMatrizRow(
        String(row.competencia),
        formatCompetencia(row.competencia),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: resolveAReceberRow(row),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porSetor: setorRows.map((row) =>
      buildMatrizRow(
        String(row.setor),
        String(row.setor),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: resolveAReceberRow(row),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porConvenio: convRows.map((row) =>
      buildMatrizRow(
        String(row.convenioNome),
        String(row.convenioNome),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: resolveAReceberRow(row),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porTipoItem: tipoRows.map((row) =>
      buildMatrizRow(
        String(row.tipo),
        String(row.tipo),
        {
          faturado: Number(row.faturado || 0),
          recebido: Number(row.recebido || 0),
          glosa: Number(row.glosa || 0),
          aReceber: resolveAReceberRow(row),
          qtdContas: Number(row.qtdContas || 0),
        },
        formula,
      ),
    ),
    porMotivoGlosa: motivoRows.map((row) => {
      const vl = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        motivo: String(row.motivo),
        glosa: vl,
        pctParticipacao: pct(vl, glosa || vl),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimento: procRows.map((row) => {
      const fat = round2(row.faturado);
      const rec = round2(row.recebido);
      const glo = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: rec,
        glosa: glo,
        pctGlosa: calcularPercentualGlosaBi(glo, fat, rec, formula),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimentoGlosado: procGlosaRows.map((row) => {
      const fat = round2(row.faturado);
      const rec = round2(row.recebido);
      const glo = round2(row.glosa);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: rec,
        glosa: glo,
        pctGlosa: calcularPercentualGlosaBi(glo, fat, rec, formula),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    filtrosDisponiveis: {
      setores: dispSetoresRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: v })),
      competencias: dispCompRows
        .map((r) => String(r.valor || "").trim())
        .filter((v) => v && v !== "Sem competência")
        .map((v) => ({ chave: v, label: formatCompetencia(v) })),
      convenios: dispConvRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: v })),
    },
  };
}

// ============================================================================
// FONTE 2: BASE XML OFICIAL (contas_convenio_itens + demonstrativo + recursos + externo)
// ============================================================================

async function consultarBaseXmlOficial(
  pool: Pool,
  input: BuscarPainelBiInput,
  estabelecimento: { id: number; nome: string; cnpj: string | null },
  configCliente: BiClientConfig,
  dimensaoSetor: BiDimensaoSetor,
  criterioPeriodo: BiCriterioPeriodoXml,
): Promise<PainelBiExecutivoResponse> {
  const porMesPagamento = criterioPeriodo === "PAGAMENTO";
  const formula = configCliente.formulaPctGlosa;

  const dimCiSql =
    dimensaoSetor === "tipo_item"
      ? "COALESCE(NULLIF(TRIM(ci.tipoItem),''), 'Outros')"
      : dimensaoSetor === "prestador"
        ? "COALESCE(NULLIF(TRIM(ci.profissionalExecutante),''), NULLIF(TRIM(ci.codigoPrestadorExecutante),''), 'Hospital / Corpo Clínico')"
        : "COALESCE(NULLIF(TRIM(ci.setor),''), 'Não informado')";

  const dimRetFallbackSql =
    dimensaoSetor === "tipo_item"
      ? "COALESCE(NULLIF(TRIM(d.tipo_lancamento),''), NULLIF(TRIM(d.tipo_item),''), 'Outros')"
      : dimensaoSetor === "prestador"
        ? "COALESCE(NULLIF(TRIM(d.prestador_executante),''), NULLIF(TRIM(d.codigo_prestador),''), 'Hospital / Corpo Clínico')"
        : "'Não informado'";

  const fatParams: Array<string | number> = [input.estabelecimentoId];
  let fatWhere = `WHERE ci.estabelecimentoId = ?
    AND NOT EXISTS (
      SELECT 1
      FROM convenioEstabelecimentoPrestador cep_terceiro
      WHERE cep_terceiro.estabelecimentoId = ci.estabelecimentoId
        AND cep_terceiro.convenioId = ci.convenioId
        AND cep_terceiro.tipoPrestador = 'terceiro'
        AND TRIM(cep_terceiro.codigoPrestador) = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM convenioEstabelecimentoPrestador cep_config
        WHERE cep_config.estabelecimentoId = ci.estabelecimentoId
          AND cep_config.convenioId = ci.convenioId
          AND cep_config.tipoPrestador = 'proprio'
          AND cep_config.ativo = 'sim'
      )
      OR EXISTS (
        SELECT 1
        FROM convenioEstabelecimentoPrestador cep_match
        WHERE cep_match.estabelecimentoId = ci.estabelecimentoId
          AND cep_match.convenioId = ci.convenioId
          AND cep_match.tipoPrestador = 'proprio'
          AND cep_match.ativo = 'sim'
          AND TRIM(cep_match.codigoPrestador) = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
      )
    )`;

  if (input.competencias?.length) {
    fatWhere += ` AND ci.competencia IN (${inPlaceholders(input.competencias)})`;
    fatParams.push(...input.competencias);
  }
  if (input.convenios?.length) {
    fatWhere += ` AND COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio') IN (${inPlaceholders(input.convenios)})`;
    fatParams.push(...input.convenios);
  }
  if (input.setores?.length) {
    fatWhere += ` AND ${dimCiSql} IN (${inPlaceholders(input.setores)})`;
    fatParams.push(...input.setores);
  }

  const retornoVinculadoCte = `
    WITH prestadores_configurados AS (
      SELECT convenioId, TRIM(codigoPrestador) AS codigoPrestador, tipoPrestador, ativo
      FROM convenioEstabelecimentoPrestador
      WHERE estabelecimentoId = ?
    ), prestadores_proprios AS (
      SELECT convenioId, codigoPrestador FROM prestadores_configurados WHERE tipoPrestador='proprio' AND ativo='sim'
    ), prestadores_terceiros AS (
      SELECT convenioId, codigoPrestador FROM prestadores_configurados WHERE tipoPrestador='terceiro'
    ), faturado_base AS (
      SELECT ci.competencia, ci.convenioId,
        CONCAT_WS('|',ci.competencia,COALESCE(NULLIF(TRIM(ci.numeroConta),''),CONCAT('ID:',ci.id))) AS conta_chave,
        TRIM(COALESCE(ci.numeroGuia,'')) AS guia_prestador,
        TRIM(COALESCE(ci.numeroGuiaOperadora,'')) AS guia_operadora,
        TRIM(COALESCE(ci.codigoItem,'')) AS codigo_item,
        TRIM(COALESCE(ci.codigoItemTuss,'')) AS codigo_item_tuss,
        DATE(ci.dataExecucao) AS data_execucao,
        ${dimCiSql} AS dim_setor
      FROM contas_convenio_itens ci
      WHERE ci.estabelecimentoId = ?
        AND ci.competencia IS NOT NULL AND ci.competencia <> ''
        AND NOT EXISTS (
          SELECT 1 FROM prestadores_terceiros pt
          WHERE pt.convenioId=ci.convenioId
            AND pt.codigoPrestador=TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
        )
        AND (
          NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = ci.convenioId)
          OR EXISTS (
            SELECT 1 FROM prestadores_proprios pp_match
            WHERE pp_match.convenioId = ci.convenioId
              AND pp_match.codigoPrestador = TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
          )
        )
    ), faturado_guias AS (
      SELECT competencia, convenioId, conta_chave, guia_prestador AS guia, codigo_item, codigo_item_tuss, data_execucao, dim_setor
      FROM faturado_base WHERE guia_prestador <> ''
      UNION
      SELECT competencia, convenioId, conta_chave, guia_operadora, codigo_item, codigo_item_tuss, data_execucao, dim_setor
      FROM faturado_base WHERE guia_operadora <> ''
    ), faturado_chaves AS (
      SELECT competencia, convenioId, conta_chave, guia, codigo_item AS codigo_item, data_execucao, dim_setor
      FROM faturado_guias WHERE codigo_item <> ''
      UNION
      SELECT competencia, convenioId, conta_chave, guia, codigo_item_tuss, data_execucao, dim_setor
      FROM faturado_guias WHERE codigo_item_tuss <> ''
    ), atribuicoes AS (
      SELECT d.id AS demonstrativo_id,
        MIN(f.competencia) AS competencia_faturada,
        MIN(f.dim_setor) AS dim_setor_vinculado,
        COUNT(DISTINCT f.conta_chave) AS quantidade_contas
      FROM demonstrativo d
      JOIN faturado_chaves f
        ON f.convenioId = d.convenio_id
        AND f.guia = TRIM(COALESCE(d.numero_guia,''))
        AND f.codigo_item = TRIM(COALESCE(d.codigo_item,''))
        AND (f.data_execucao IS NULL OR d.data_execucao IS NULL OR f.data_execucao = d.data_execucao)
      WHERE d.estabelecimentoId = ?
      GROUP BY d.id
    ), vinculos_elegiveis AS (
      SELECT d.id AS demonstrativo_id, d.convenio_id,
        d.codigo_prestador, d.prestador_executante, d.codigo_prestador_pagamento,
        a.competencia_faturada,
        a.dim_setor_vinculado
      FROM demonstrativo d
      JOIN atribuicoes a ON a.demonstrativo_id=d.id AND a.quantidade_contas=1
      WHERE NOT EXISTS (
        SELECT 1 FROM prestadores_terceiros pt
        WHERE pt.convenioId=d.convenio_id
          AND pt.codigoPrestador IN (
            TRIM(COALESCE(d.codigo_prestador,'')),
            TRIM(COALESCE(d.prestador_executante,'')),
            TRIM(COALESCE(d.codigo_prestador_pagamento,''))
          )
      )
    ), aliases_prestador_vinculados AS (
      SELECT v.convenio_id AS convenioId, TRIM(v.codigo_prestador) AS codigoPrestador
      FROM vinculos_elegiveis v
      WHERE TRIM(COALESCE(v.codigo_prestador,''))<>''
      UNION
      SELECT v.convenio_id, TRIM(v.prestador_executante)
      FROM vinculos_elegiveis v
      WHERE TRIM(COALESCE(v.prestador_executante,''))<>''
      UNION
      SELECT v.convenio_id, TRIM(v.codigo_prestador_pagamento)
      FROM vinculos_elegiveis v
      WHERE TRIM(COALESCE(v.codigo_prestador_pagamento,''))<>''
    ), retorno_final AS (
      SELECT d.*,
        v.competencia_faturada,
        COALESCE(v.dim_setor_vinculado, ${dimRetFallbackSql}) AS dim_setor,
        DATE_FORMAT(d.data_referencia,'%Y/%m') AS competencia_informada,
        DATE_FORMAT(d.data_pagamento,'%Y/%m') AS mes_pagamento,
        CASE WHEN v.demonstrativo_id IS NOT NULL THEN 'vinculado' ELSE 'sem_vinculo' END AS status_vinculo
      FROM demonstrativo d
      LEFT JOIN vinculos_elegiveis v ON v.demonstrativo_id = d.id
      WHERE d.estabelecimentoId = ?
        AND NOT EXISTS (
          SELECT 1 FROM prestadores_terceiros pt
          WHERE pt.convenioId=d.convenio_id
            AND pt.codigoPrestador IN (
              TRIM(COALESCE(d.codigo_prestador,'')),
              TRIM(COALESCE(d.prestador_executante,'')),
              TRIM(COALESCE(d.codigo_prestador_pagamento,''))
            )
        )
        AND (
          NOT EXISTS (SELECT 1 FROM prestadores_proprios pp_cfg WHERE pp_cfg.convenioId = d.convenio_id)
          OR (
            v.demonstrativo_id IS NOT NULL
              OR (
                TRIM(COALESCE(d.codigo_prestador,'')) = ''
                AND TRIM(COALESCE(d.prestador_executante,'')) = ''
                AND TRIM(COALESCE(d.codigo_prestador_pagamento,'')) = ''
              )
              OR EXISTS (
                SELECT 1 FROM prestadores_proprios pp_match
                WHERE pp_match.convenioId = d.convenio_id
                  AND pp_match.codigoPrestador IN (
                    TRIM(COALESCE(d.codigo_prestador,'')),
                    TRIM(COALESCE(d.prestador_executante,'')),
                    TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                  )
              )
              OR EXISTS (
                SELECT 1 FROM aliases_prestador_vinculados alias_match
                WHERE alias_match.convenioId = d.convenio_id
                  AND alias_match.codigoPrestador IN (
                    TRIM(COALESCE(d.codigo_prestador,'')),
                    TRIM(COALESCE(d.prestador_executante,'')),
                    TRIM(COALESCE(d.codigo_prestador_pagamento,''))
                  )
              )
          )
        )
    )
  `;

  const periodoRetornoSql = porMesPagamento
    ? "d.mes_pagamento"
    : "COALESCE(d.competencia_faturada, d.competencia_informada)";

  const retParams: Array<string | number> = [
    input.estabelecimentoId,
    input.estabelecimentoId,
    input.estabelecimentoId,
    input.estabelecimentoId,
  ];
  let retWhere = "WHERE 1=1";
  if (input.competencias?.length) {
    retWhere += ` AND ${periodoRetornoSql} IN (${inPlaceholders(input.competencias)})`;
    retParams.push(...input.competencias);
  }
  if (input.convenios?.length) {
    retWhere += ` AND COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') IN (${inPlaceholders(input.convenios)})`;
    retParams.push(...input.convenios);
  }
  if (input.setores?.length) {
    retWhere += ` AND d.dim_setor IN (${inPlaceholders(input.setores)})`;
    retParams.push(...input.setores);
  }

  const temFiltroSetor = Boolean(input.setores?.length);
  const manualParams: Array<string | number> = [input.estabelecimentoId];
  let manualWhere = `WHERE fe.estabelecimento_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM convenios c_terceiro
      JOIN convenioEstabelecimentoPrestador cep_terceiro
        ON cep_terceiro.convenioId=c_terceiro.id
      WHERE cep_terceiro.estabelecimentoId=fe.estabelecimento_id
        AND cep_terceiro.tipoPrestador='terceiro'
        AND TRIM(c_terceiro.nome)=TRIM(fe.convenio)
        AND TRIM(cep_terceiro.codigoPrestador)=TRIM(COALESCE(fe.codigo_prestador,''))
    )
    AND (
      LOWER(TRIM(COALESCE(fe.origem, ''))) = 'manual'
      OR (
        NOT EXISTS (
          SELECT 1 FROM contas_convenio_itens ci_auto
          WHERE ci_auto.estabelecimentoId = fe.estabelecimento_id
            AND ci_auto.competencia = fe.mes_ano
            AND UPPER(TRIM(ci_auto.convenio)) = UPPER(TRIM(fe.convenio))
        )
        AND NOT EXISTS (
          SELECT 1 FROM demonstrativo d_auto
          LEFT JOIN convenios c_auto ON c_auto.id = d_auto.convenio_id
          WHERE d_auto.estabelecimentoId = fe.estabelecimento_id
            AND ${porMesPagamento ? "DATE_FORMAT(d_auto.data_pagamento,'%Y/%m')" : "DATE_FORMAT(d_auto.data_referencia,'%Y/%m')"} = fe.mes_ano
            AND UPPER(TRIM(COALESCE(c_auto.nome,''))) = UPPER(TRIM(fe.convenio))
        )
      )
    )`;
  if (input.competencias?.length) {
    manualWhere += ` AND fe.mes_ano IN (${inPlaceholders(input.competencias)})`;
    manualParams.push(...input.competencias);
  }
  if (input.convenios?.length) {
    manualWhere += ` AND COALESCE(NULLIF(TRIM(fe.convenio),''),'Sem convênio') IN (${inPlaceholders(input.convenios)})`;
    manualParams.push(...input.convenios);
  }

  const exigirVinculoNoRecorte =
    input.competencias?.length || input.convenios?.length || input.setores?.length
      ? "AND d.id IS NOT NULL"
      : "";
  const recParams: Array<string | number> = [...retParams, input.estabelecimentoId];

  const periodoDisponivelSql = porMesPagamento
    ? "DATE_FORMAT(data_pagamento,'%Y/%m')"
    : "DATE_FORMAT(data_referencia,'%Y/%m')";

  const [
    [fatRows],
    [fatSetorRows],
    [fatTipoRows],
    [fatProcRows],
    [fatCountRows],
    [retRows],
    [retSetorRows],
    [retTipoRows],
    [manualRows],
    [recRows],
    [motivoRows],
    [procGlosaRows],
    [dispSetorRows],
    [dispCompRows],
    [dispConvRows],
    [lastUpdateRows],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT ci.competencia,
              COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio') AS convenio,
              SUM(COALESCE(ci.valorTotal,0)) AS faturado,
              COUNT(*) AS quantidade
       FROM contas_convenio_itens ci
       ${fatWhere}
       GROUP BY ci.competencia, COALESCE(NULLIF(TRIM(ci.convenio),''),'Sem convênio')`,
      fatParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT ${dimCiSql} AS setor,
              SUM(COALESCE(ci.valorTotal,0)) AS faturado,
              COUNT(DISTINCT ci.numeroConta) AS qtdContas
       FROM contas_convenio_itens ci
       ${fatWhere}
       GROUP BY ${dimCiSql}`,
      fatParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(ci.tipoItem),''), 'Outros') AS tipo,
              SUM(COALESCE(ci.valorTotal,0)) AS faturado,
              COUNT(DISTINCT ci.numeroConta) AS qtdContas
       FROM contas_convenio_itens ci
       ${fatWhere}
       GROUP BY COALESCE(NULLIF(TRIM(ci.tipoItem),''), 'Outros')`,
      fatParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(TRIM(ci.codigoItemTuss),''), NULLIF(TRIM(ci.codigoItem),''), 'S/COD') AS codigo,
              COALESCE(NULLIF(TRIM(ci.descricaoItem),''), 'Item sem descrição') AS descricao,
              COALESCE(NULLIF(TRIM(ci.tipoItem),''), 'Outros') AS tipo,
              SUM(COALESCE(ci.valorTotal,0)) AS faturado,
              COUNT(*) AS quantidade
       FROM contas_convenio_itens ci
       ${fatWhere}
       GROUP BY codigo, descricao, tipo
       ORDER BY faturado DESC
       LIMIT 30`,
      fatParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT ci.numeroConta) AS qtdContas, COUNT(*) AS qtdItens
       FROM contas_convenio_itens ci
       ${fatWhere}`,
      fatParams,
    ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       SELECT ${periodoRetornoSql} AS competencia,
              COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') AS convenio,
              SUM(COALESCE(d.valor_pago,0)) AS recebido,
              SUM(CASE WHEN d.status_vinculo='vinculado' THEN COALESCE(d.valor_pago,0) ELSE 0 END) AS recebido_vinculado,
              SUM(CASE WHEN d.status_vinculo='sem_vinculo' THEN COALESCE(d.valor_pago,0) ELSE 0 END) AS recebido_sem_vinculo,
              SUM(COALESCE(d.valor_glosa,0)) AS glosado,
              SUM(CASE WHEN COALESCE(d.glosa_aceita,0)=1 OR d.classificacao_glosa IN ('aceitar','auto_aceitar') THEN COALESCE(d.valor_glosa,0) ELSE 0 END) AS glosa_aceita,
              COUNT(*) AS quantidade
       FROM retorno_final d
       LEFT JOIN convenios c ON c.id = d.convenio_id
       ${retWhere}
       GROUP BY ${periodoRetornoSql}, COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio')`,
      retParams,
    ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       SELECT d.dim_setor AS setor,
              SUM(COALESCE(d.valor_pago,0)) AS recebido,
              SUM(COALESCE(d.valor_glosa,0)) AS glosado,
              COUNT(DISTINCT d.numero_guia) AS qtdGuias
       FROM retorno_final d
       LEFT JOIN convenios c ON c.id = d.convenio_id
       ${retWhere}
       GROUP BY d.dim_setor`,
      retParams,
    ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       SELECT COALESCE(NULLIF(TRIM(d.tipo_lancamento),''), NULLIF(TRIM(d.tipo_item),''), 'Outros') AS tipo,
              SUM(COALESCE(d.valor_pago,0)) AS recebido,
              SUM(COALESCE(d.valor_glosa,0)) AS glosado
       FROM retorno_final d
       LEFT JOIN convenios c ON c.id = d.convenio_id
       ${retWhere}
       GROUP BY COALESCE(NULLIF(TRIM(d.tipo_lancamento),''), NULLIF(TRIM(d.tipo_item),''), 'Outros')`,
      retParams,
    ),
    temFiltroSetor
      ? Promise.resolve([[] as RowDataPacket[], []] as unknown as [RowDataPacket[], any])
      : pool.query<RowDataPacket[]>(
          `SELECT fe.id, fe.mes_ano AS competencia,
                  COALESCE(NULLIF(TRIM(fe.convenio),''),'Sem convênio') AS convenio,
                  COALESCE(fe.valor_faturado,0) AS faturado,
                  COALESCE(fe.valor_recebido,0) AS recebido,
                  COALESCE(fe.valor_glosado,0) AS glosado,
                  COALESCE(NULLIF(fe.origem,''),'manual') AS origem
           FROM faturamento_externo fe
           ${manualWhere}`,
          manualParams,
        ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       , retornos_glosados_periodo AS (
         SELECT d.*, ${periodoRetornoSql} AS competencia_recurso,
           COALESCE(NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',d.convenio_id)) AS convenio_recurso
         FROM retorno_final d
         LEFT JOIN convenios c ON c.id=d.convenio_id
         ${retWhere}
           AND COALESCE(d.valor_glosa,0)>0
       ), vinculos_legados AS (
         SELECT rg.id AS recurso_id,
           MIN(d.competencia_recurso) AS competencia,
           MIN(d.convenio_recurso) AS convenio,
           MAX(CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido') THEN 1 ELSE 0 END) AS possui_recurso_novo
         FROM recursosGlosa rg
         LEFT JOIN retornos_glosados_periodo d
           ON d.estabelecimentoId=rg.estabelecimentoId
           AND d.numero_guia=rg.guiaNumero
           AND TRIM(COALESCE(d.codigo_item,''))=TRIM(COALESCE(rg.codigoProcedimento,''))
           AND ROUND(COALESCE(d.valor_glosa,0),2)=ROUND(COALESCE(rg.valorGlosado,0),2)
         WHERE rg.estabelecimentoId=?
           AND rg.status<>'cancelado'
           AND COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0)>0
           ${exigirVinculoNoRecorte}
         GROUP BY rg.id
       ), recursos_unificados AS (
         SELECT d.competencia_recurso AS competencia, d.convenio_recurso AS convenio,
           COALESCE(NULLIF(d.valor_recurso,0),d.valor_glosa,0) AS glosa_recursada,
           CASE WHEN d.recurso_status IN ('recurso_criado','recurso_enviado') THEN COALESCE(NULLIF(d.valor_recurso,0),d.valor_glosa,0) ELSE 0 END AS glosa_em_recurso,
           0 AS glosa_recuperada
         FROM retornos_glosados_periodo d
         WHERE d.recurso_status IN ('recurso_criado','recurso_enviado','recurso_deferido','recurso_indeferido')
         UNION ALL
         SELECT vl.competencia,
           COALESCE(vl.convenio,NULLIF(TRIM(c.nome),''),CONCAT('Convênio ',rg.convenioId)) AS convenio,
           COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) AS glosa_recursada,
           CASE WHEN rg.status IN ('rascunho','pendente_envio','enviado','em_analise') THEN COALESCE(NULLIF(rg.valorGlosado,0),rg.valorCobrado,0) ELSE 0 END AS glosa_em_recurso,
           GREATEST(COALESCE(rg.valorRecebido,0),COALESCE(rg.valorRecuperado,0)) AS glosa_recuperada
         FROM vinculos_legados vl
         JOIN recursosGlosa rg ON rg.id=vl.recurso_id
         LEFT JOIN convenios c ON c.id=rg.convenioId
         WHERE COALESCE(vl.possui_recurso_novo,0)=0
       )
       SELECT competencia, convenio,
         SUM(glosa_recursada) AS glosa_recursada,
         SUM(glosa_em_recurso) AS glosa_em_recurso,
         SUM(glosa_recuperada) AS glosa_recuperada,
         COUNT(*) AS quantidade
       FROM recursos_unificados
       GROUP BY competencia, convenio`,
      recParams,
    ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       SELECT COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO') AS codigo,
         COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado') AS motivo,
         SUM(COALESCE(d.valor_glosa,0)) AS valor_glosado,
         COUNT(*) AS quantidade
       FROM retorno_final d
       LEFT JOIN convenios c ON c.id=d.convenio_id
       LEFT JOIN motivosGlosa mg ON mg.codigo=d.codigo_glosa AND mg.ativo='sim'
       ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
       GROUP BY COALESCE(NULLIF(TRIM(d.codigo_glosa),''),'S/MOTIVO'), COALESCE(NULLIF(TRIM(mg.descricao),''),NULLIF(TRIM(d.erro_tiss),''),'Glosa sem motivo informado')
       ORDER BY valor_glosado DESC
       LIMIT 30`,
      retParams,
    ),
    pool.query<RowDataPacket[]>(
      `${retornoVinculadoCte}
       SELECT COALESCE(NULLIF(TRIM(d.codigo_item),''),'S/CÓDIGO') AS codigo,
         COALESCE(NULLIF(TRIM(d.descricao_item),''),'Item sem descrição') AS descricao,
         COALESCE(NULLIF(TRIM(d.tipo_lancamento),''),NULLIF(TRIM(d.tipo_item),''),'Não informado') AS tipo,
         SUM(COALESCE(d.valor_informado, d.valor_pago + d.valor_glosa, 0)) AS faturado,
         SUM(COALESCE(d.valor_pago,0)) AS recebido,
         SUM(COALESCE(d.valor_glosa,0)) AS glosado,
         COUNT(*) AS quantidade
       FROM retorno_final d
       LEFT JOIN convenios c ON c.id=d.convenio_id
       ${retWhere} AND COALESCE(d.valor_glosa,0) > 0
       GROUP BY codigo, descricao, tipo
       ORDER BY glosado DESC
       LIMIT 30`,
      retParams,
    ),
    pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${dimCiSql} AS valor,
              COALESCE(NULLIF(TRIM(ci.setor),''), '') AS setorBruto
       FROM contas_convenio_itens ci
       WHERE ci.estabelecimentoId = ?
       ORDER BY valor ASC`,
      [input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT competencia AS valor FROM (
        SELECT DISTINCT competencia FROM contas_convenio_itens WHERE estabelecimentoId=? AND competencia IS NOT NULL AND competencia<>''
        UNION SELECT DISTINCT ${periodoDisponivelSql} FROM demonstrativo WHERE estabelecimentoId=? AND ${porMesPagamento ? "data_pagamento" : "data_referencia"} IS NOT NULL
        UNION SELECT DISTINCT mes_ano FROM faturamento_externo WHERE estabelecimento_id=? AND mes_ano IS NOT NULL AND mes_ano<>''
      ) periodos WHERE competencia IS NOT NULL AND competencia <> '' ORDER BY competencia DESC`,
      [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT convenio AS valor FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') AS convenio FROM contas_convenio_itens WHERE estabelecimentoId=?
        UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(c.nome),''),'Sem convênio') FROM demonstrativo d LEFT JOIN convenios c ON c.id=d.convenio_id WHERE d.estabelecimentoId=?
        UNION SELECT DISTINCT COALESCE(NULLIF(TRIM(convenio),''),'Sem convênio') FROM faturamento_externo WHERE estabelecimento_id=?
      ) convs ORDER BY convenio ASC`,
      [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT GREATEST(
        COALESCE((SELECT MAX(atualizadoEm) FROM contas_convenio_itens WHERE estabelecimentoId=?), '1970-01-01'),
        COALESCE((SELECT MAX(updatedAt) FROM arquivos WHERE estabelecimentoId=?), '1970-01-01'),
        COALESCE((SELECT MAX(atualizado_em) FROM faturamento_externo WHERE estabelecimento_id=?), '1970-01-01')
      ) AS atualizadoEm`,
      [input.estabelecimentoId, input.estabelecimentoId, input.estabelecimentoId],
    ),
  ]);

  // Consolidação oficial idêntica ao Faturado x Recebido Oficial
  const registros: RegistroFinanceiroUnificado[] = [];
  const nomes = new Map<string, string>();
  const nomeCanonico = (valor: string) => {
    const chave = normalizarConvenio(valor);
    if (!nomes.has(chave)) nomes.set(chave, valor || "Sem convênio");
    return nomes.get(chave)!;
  };

  for (const row of fatRows) {
    registros.push({
      competencia: row.competencia || null,
      convenio: nomeCanonico(String(row.convenio)),
      fonte: "faturado",
      origem: "automatica",
      faturado: Number(row.faturado || 0),
      quantidade: Number(row.quantidade || 0),
    });
  }
  for (const row of retRows) {
    registros.push({
      competencia: row.competencia || null,
      convenio: nomeCanonico(String(row.convenio)),
      fonte: "retorno",
      origem: "automatica",
      recebido: Number(row.recebido || 0),
      recebidoVinculado: Number(row.recebido_vinculado || 0),
      recebidoSemVinculo: Number(row.recebido_sem_vinculo || 0),
      glosado: Number(row.glosado || 0),
      glosaAceita: Number(row.glosa_aceita || 0),
      quantidade: Number(row.quantidade || 0),
    });
  }
  for (const row of manualRows) {
    const convenioManual = nomeCanonico(String(row.convenio));
    const origem = String(row.origem).trim().toLowerCase() === "manual" ? "manual" : "planilha";
    registros.push({
      competencia: row.competencia || null,
      convenio: convenioManual,
      fonte: "faturado",
      origem,
      faturado: Number(row.faturado || 0),
      quantidade: 1,
    });
    registros.push({
      competencia: row.competencia || null,
      convenio: convenioManual,
      fonte: "retorno",
      origem,
      recebido: Number(row.recebido || 0),
      recebidoSemVinculo: Number(row.recebido || 0),
      glosado: Number(row.glosado || 0),
      quantidade: 1,
    });
  }
  for (const row of recRows) {
    registros.push({
      competencia: row.competencia || null,
      convenio: nomeCanonico(String(row.convenio)),
      fonte: "recurso",
      glosaRecursada: Number(row.glosa_recursada || 0),
      glosaEmRecurso: Number(row.glosa_em_recurso || 0),
      glosaRecuperada: Number(row.glosa_recuperada || 0),
      quantidade: Number(row.quantidade || 0),
    });
  }

  const consolidados = consolidarRegistrosFinanceiros(registros);
  const resumoOficial = calcularIndicadoresFinanceiros(consolidados);

  // Agrupar por Competência
  const compMap = new Map<string, RegistroFinanceiroUnificado[]>();
  for (const reg of consolidados) {
    const key = reg.competencia || "Sem competência";
    const list = compMap.get(key) || [];
    list.push(reg);
    compMap.set(key, list);
  }
  const porCompetencia: LinhaMatrizBi[] = [...compMap.entries()]
    .filter(([k]) => k !== "Sem competência")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([comp, items]) => {
      const ind = calcularIndicadoresFinanceiros(items);
      return buildMatrizRow(
        comp,
        formatCompetencia(comp),
        {
          produzido: ind.totalFaturado,
          faturado: ind.totalFaturado,
          recebido: ind.totalRecebido,
          glosa: ind.totalGlosado,
          aReceber: ind.totalSaldo,
          qtdContas: ind.quantidade,
        },
        formula,
      );
    });

  // Agrupar por Convênio
  const convMap = new Map<string, RegistroFinanceiroUnificado[]>();
  for (const reg of consolidados) {
    const key = reg.convenio || "Sem convênio";
    const list = convMap.get(key) || [];
    list.push(reg);
    convMap.set(key, list);
  }
  const porConvenio: LinhaMatrizBi[] = [...convMap.entries()]
    .map(([conv, items]) => {
      const ind = calcularIndicadoresFinanceiros(items);
      return buildMatrizRow(
        conv,
        conv,
        {
          faturado: ind.totalFaturado,
          recebido: ind.totalRecebido,
          glosa: ind.totalGlosado,
          aReceber: ind.totalSaldo,
          qtdContas: ind.quantidade,
        },
        formula,
      );
    })
    .sort((a, b) => b.faturado - a.faturado);

  // Agrupar por Setor (unindo faturado de contas_convenio_itens + recebido/glosa vinculado do retorno)
  const setorAgg = new Map<
    string,
    { faturado: number; recebido: number; glosa: number; qtdContas: number }
  >();
  let somaFatXmlSetor = 0;
  let somaRecXmlSetor = 0;
  let somaGloXmlSetor = 0;

  for (const row of fatSetorRows) {
    const k = String(row.setor || "Não informado");
    const cur = setorAgg.get(k) || { faturado: 0, recebido: 0, glosa: 0, qtdContas: 0 };
    const fat = Number(row.faturado || 0);
    cur.faturado += fat;
    cur.qtdContas += Number(row.qtdContas || 0);
    somaFatXmlSetor += fat;
    setorAgg.set(k, cur);
  }
  for (const row of retSetorRows) {
    const k = String(row.setor || "Não informado");
    const cur = setorAgg.get(k) || { faturado: 0, recebido: 0, glosa: 0, qtdContas: 0 };
    const rec = Number(row.recebido || 0);
    const glo = Number(row.glosado || 0);
    cur.recebido += rec;
    cur.glosa += glo;
    if (!cur.qtdContas) cur.qtdContas = Number(row.qtdGuias || 0);
    somaRecXmlSetor += rec;
    somaGloXmlSetor += glo;
    setorAgg.set(k, cur);
  }

  // Se houver complemento externo/manual sem setor (quando sem filtro de setor), reconcilia para bater o Total
  if (!temFiltroSetor) {
    const diffFat = round2(resumoOficial.totalFaturado - somaFatXmlSetor);
    const diffRec = round2(resumoOficial.totalRecebido - somaRecXmlSetor);
    const diffGlo = round2(resumoOficial.totalGlosado - somaGloXmlSetor);
    if (diffFat > 0.01 || diffRec > 0.01 || diffGlo > 0.01) {
      const k = setorAgg.has("Não informado") ? "Não informado" : "Lançamento Geral / Sem Setor";
      const cur = setorAgg.get(k) || { faturado: 0, recebido: 0, glosa: 0, qtdContas: 0 };
      if (diffFat > 0) cur.faturado += diffFat;
      if (diffRec > 0) cur.recebido += diffRec;
      if (diffGlo > 0) cur.glosa += diffGlo;
      setorAgg.set(k, cur);
    }
  }

  const porSetor: LinhaMatrizBi[] = [...setorAgg.entries()]
    .map(([setor, v]) => {
      const fatReconhecido = v.faturado > 0 ? v.faturado : v.recebido + v.glosa;
      return buildMatrizRow(
        setor,
        setor,
        {
          faturado: fatReconhecido,
          recebido: v.recebido,
          glosa: v.glosa,
          qtdContas: v.qtdContas,
        },
        formula,
      );
    })
    .sort((a, b) => b.faturado - a.faturado);

  // Agrupar por Tipo de Item
  const tipoAgg = new Map<
    string,
    { faturado: number; recebido: number; glosa: number; qtdContas: number }
  >();
  for (const row of fatTipoRows) {
    const k = String(row.tipo || "Outros");
    const cur = tipoAgg.get(k) || { faturado: 0, recebido: 0, glosa: 0, qtdContas: 0 };
    cur.faturado += Number(row.faturado || 0);
    cur.qtdContas += Number(row.qtdContas || 0);
    tipoAgg.set(k, cur);
  }
  for (const row of retTipoRows) {
    const k = String(row.tipo || "Outros");
    const cur = tipoAgg.get(k) || { faturado: 0, recebido: 0, glosa: 0, qtdContas: 0 };
    cur.recebido += Number(row.recebido || 0);
    cur.glosa += Number(row.glosado || 0);
    tipoAgg.set(k, cur);
  }
  const porTipoItem: LinhaMatrizBi[] = [...tipoAgg.entries()]
    .map(([tipo, v]) => {
      const fatReconhecido = v.faturado > 0 ? v.faturado : v.recebido + v.glosa;
      return buildMatrizRow(
        tipo,
        tipo,
        {
          faturado: fatReconhecido,
          recebido: v.recebido,
          glosa: v.glosa,
          qtdContas: v.qtdContas,
        },
        formula,
      );
    })
    .sort((a, b) => b.faturado - a.faturado);

  const rawDate = lastUpdateRows[0]?.atualizadoEm;
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const validUpdated =
    parsedDate && parsedDate.getFullYear() > 1975 ? parsedDate.toISOString() : null;

  const possuiSetorReal = dispSetorRows.some(
    (r) => String(r.setorBruto || "").trim().length > 0,
  );

  return {
    estabelecimento,
    configCliente,
    fonteAtiva: {
      modoFonte: "XML",
      subFonteResolvida: "XML_OFICIAL",
      criterioPeriodoXml: criterioPeriodo,
      dimensaoSetorAtiva: dimensaoSetor,
      possuiSetorReal,
      atualizadoEm: validUpdated,
    },
    resumo: {
      produzido: resumoOficial.totalFaturado,
      faturado: resumoOficial.totalFaturado,
      recebido: resumoOficial.totalRecebido,
      aReceber: resumoOficial.totalSaldo,
      glosa: resumoOficial.totalGlosado,
      pctGlosa: calcularPercentualGlosaBi(
        resumoOficial.totalGlosado,
        resumoOficial.totalFaturado,
        resumoOficial.totalRecebido,
        formula,
      ),
      pctRecebido: resumoOficial.percentualRecebido,
      glosaARecursar: resumoOficial.glosaARecursar,
      glosaEmRecurso: resumoOficial.glosaEmRecurso,
      glosaRecuperada: resumoOficial.glosaRecuperada,
      glosaAceita: resumoOficial.glosaAceita,
      qtdContas: Number(fatCountRows[0]?.qtdContas || resumoOficial.quantidade || 0),
      qtdItens: Number(fatCountRows[0]?.qtdItens || resumoOficial.quantidade || 0),
    },
    porCompetencia,
    porSetor,
    porConvenio,
    porTipoItem,
    porMotivoGlosa: motivoRows.map((row) => {
      const vl = round2(row.valor_glosado);
      return {
        codigo: String(row.codigo),
        motivo: String(row.motivo),
        glosa: vl,
        pctParticipacao: pct(vl, resumoOficial.totalGlosado || vl),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimento: fatProcRows.map((row) => {
      const fat = round2(row.faturado);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: 0,
        glosa: 0,
        pctGlosa: 0,
        quantidade: Number(row.quantidade || 0),
      };
    }),
    porProcedimentoGlosado: procGlosaRows.map((row) => {
      const fat = round2(row.faturado);
      const rec = round2(row.recebido);
      const glo = round2(row.glosado);
      return {
        codigo: String(row.codigo),
        descricao: String(row.descricao),
        tipo: String(row.tipo),
        faturado: fat,
        recebido: rec,
        glosa: glo,
        pctGlosa: calcularPercentualGlosaBi(glo, fat, rec, formula),
        quantidade: Number(row.quantidade || 0),
      };
    }),
    filtrosDisponiveis: {
      setores: dispSetorRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: v })),
      competencias: dispCompRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: formatCompetencia(v) })),
      convenios: dispConvRows
        .map((r) => String(r.valor || "").trim())
        .filter(Boolean)
        .map((v) => ({ chave: v, label: v })),
    },
  };
}

// ============================================================================
// ENTRYPOINT UNIFICADO DO PAINEL BI EXECUTIVO PERSONALIZADO
// ============================================================================

export async function buscarDadosPainelBiExecutivo(
  input: BuscarPainelBiInput,
): Promise<PainelBiExecutivoResponse> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco de dados indisponível");

  const [estRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, nome, cnpj FROM estabelecimentos WHERE id = ? LIMIT 1`,
    [input.estabelecimentoId],
  );
  if (!estRows.length) {
    throw new Error("Estabelecimento não encontrado");
  }
  const estabelecimento = {
    id: Number(estRows[0].id),
    nome: String(estRows[0].nome),
    cnpj: estRows[0].cnpj ? String(estRows[0].cnpj) : null,
  };

  const configCliente = await obterConfiguracaoBiCliente(input.estabelecimentoId);
  const dimensaoSetor = input.dimensaoSetor || configCliente.dimensaoPainelSetores;

  if (input.modoFonte === "BANCO_CSV") {
    const pref = input.subFonteBanco || configCliente.subFonteBancoPadrao;
    const subFonte = await resolverSubFonteBanco(pool, input.estabelecimentoId, pref);
    if (subFonte === "RECEBIMENTO_GERAL") {
      return consultarBancoRecebimentoGeral(
        pool,
        input,
        estabelecimento,
        configCliente,
        dimensaoSetor,
      );
    }
    return consultarBancoWarleine(
      pool,
      input,
      estabelecimento,
      configCliente,
      dimensaoSetor,
    );
  }

  const criterio = input.criterioPeriodoXml || configCliente.criterioPeriodoXmlPadrao;
  return consultarBaseXmlOficial(
    pool,
    input,
    estabelecimento,
    configCliente,
    dimensaoSetor,
    criterio,
  );
}
