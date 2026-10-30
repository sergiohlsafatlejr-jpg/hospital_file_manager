/**
 * Service Unificado de Dados para Relatórios
 * 
 * Abstrai a fonte de dados por estabelecimento, permitindo que o mesmo relatório
 * funcione para todos os estabelecimentos buscando de fontes diferentes.
 * 
 * Fontes possíveis:
 * - integ_faturado: dados sincronizados do banco do hospital (Warleine/Tasy/EasyVision)
 * - contas_convenio_itens: dados importados via XML ou busca por conta
 * - faturamento_tiss: dados brutos do XML TISS
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { estabelecimentoFonteRelatorios } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================
// INTERFACES PADRONIZADAS (formato unificado de saída)
// ============================================================

export interface ItemFaturadoPadronizado {
  numeroConta: string;
  numeroGuia: string | null;
  convenio: string;
  competencia: string; // formato YYYY/MM
  codigoItem: string | null;
  descricaoItem: string | null;
  tipoItem: string | null; // PROCEDIMENTO, DIARIA, MAT_MED, TAXA, GASES
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  dataExecucao: Date | null;
  setor: string | null;
  profissional: string | null;
  pacienteNome: string | null;
  tipoAtendimento: string | null;
}

export interface ConfiguracaoFonte {
  id: number;
  estabelecimentoId: number;
  fonteFaturamento: "integ_faturado" | "contas_convenio_itens" | "faturamento_tiss";
  origemPreferida: "XML" | "BANCO_CLIENTE" | "AMBOS" | null;
  sistemaOrigem: string | null;
  mapeamentoCampos: any;
}

export interface FiltroRelatorioUnificado {
  estabelecimentoId: number;
  anoAtual?: number;
  anoAnterior?: number;
  competencia?: string; // YYYY/MM
  convenio?: string;
  setor?: string;
}

export interface ResumoFaturamentoPadronizado {
  totalFaturado: number;
  qtdContas: number;
  qtdItens: number;
}

export interface FaturamentoPorMesPadronizado {
  mes: string;        // "YYYY/MM"
  mesFormatado: string; // "Jan/2025"
  totalFaturado: number;
  qtdContas: number;
}

export interface FaturamentoPorConvenioPadronizado {
  convenio: string;
  totalFaturado: number;
  qtdContas: number;
  percentual: number;
}

export interface FaturamentoPorSetorPadronizado {
  setor: string;
  totalFaturado: number;
  qtdContas: number;
  percentual: number;
}

export interface FaturamentoPorTipoPadronizado {
  tipo: string;
  tipoDescricao: string;
  totalFaturado: number;
  qtdContas: number;
  percentual: number;
}

export interface TabelaComparativaPadronizada {
  mes: string;        // "01", "02", etc.
  mesNome: string;    // "Janeiro", "Fevereiro", etc.
  faturadoAtual: number;
  faturadoAnterior: number;
  qtdContasAtual: number;
  qtdContasAnterior: number;
  variacao: number;   // percentual
}

export interface RelatorioFaturamentoPadronizado {
  fonte: string; // qual fonte foi usada
  sistemaOrigem: string | null;
  acumulado: {
    anoAtual: number;
    anoAnterior: number;
    totalFaturadoAtual: number;
    totalFaturadoAnterior: number;
    variacaoPercentual: number;
    qtdContasAtual: number;
    qtdContasAnterior: number;
  };
  porSetor: FaturamentoPorSetorPadronizado[];
  porMes: FaturamentoPorMesPadronizado[];
  porTipoAtendimento: FaturamentoPorTipoPadronizado[];
  porConvenio: FaturamentoPorConvenioPadronizado[];
  tabelaComparativa: TabelaComparativaPadronizada[];
}

// ============================================================
// HELPERS
// ============================================================

const MESES_NOMES: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

const MESES_ABREV: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

const TIPO_ATENDIMENTO_DESC: Record<string, string> = {
  "I": "Internação", "A": "Ambulatorial", "U": "Urgência/Emergência",
  "E": "Exame", "C": "Consulta", "P": "Pronto Socorro",
};

function parseValor(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// ============================================================
// OBTER CONFIGURAÇÃO DE FONTE
// ============================================================

/**
 * Busca a configuração de fonte de dados para um estabelecimento.
 * Se não houver configuração, retorna um default baseado em integ_faturado.
 */
export async function obterConfiguracaoFonte(
  estabelecimentoId: number
): Promise<ConfiguracaoFonte> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const [config] = await db
    .select()
    .from(estabelecimentoFonteRelatorios)
    .where(eq(estabelecimentoFonteRelatorios.estabelecimentoId, estabelecimentoId))
    .limit(1);

  if (config) {
    return {
      id: config.id,
      estabelecimentoId: config.estabelecimentoId,
      fonteFaturamento: config.fonteFaturamento as ConfiguracaoFonte["fonteFaturamento"],
      origemPreferida: config.origemPreferida as ConfiguracaoFonte["origemPreferida"],
      sistemaOrigem: config.sistemaOrigem,
      mapeamentoCampos: config.mapeamentoCampos,
    };
  }

  // Default: integ_faturado (comportamento legado)
  return {
    id: 0,
    estabelecimentoId,
    fonteFaturamento: "integ_faturado",
    origemPreferida: "AMBOS",
    sistemaOrigem: null,
    mapeamentoCampos: null,
  };
}

// ============================================================
// QUERIES POR FONTE: integ_faturado
// ============================================================

async function queryIntegFaturado_Acumulado(
  db: any,
  estabId: number,
  prefixo: string
): Promise<ResumoFaturamentoPadronizado> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas,
        COUNT(*) as qtd_itens
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixo}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
    `)
  );
  const row = (rows as any)[0];
  return {
    totalFaturado: parseValor(row?.total_faturado),
    qtdContas: Number(row?.qtd_contas) || 0,
    qtdItens: Number(row?.qtd_itens) || 0,
  };
}

async function queryIntegFaturado_PorMes(
  db: any,
  estabId: number,
  prefixoAtual: string,
  prefixoAnterior: string
): Promise<FaturamentoPorMesPadronizado[]> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        mesprod as mes,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND (mesprod LIKE '${prefixoAtual}%' OR mesprod LIKE '${prefixoAnterior}%')
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY mesprod
      ORDER BY mesprod ASC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => {
    const mesStr = String(r.mes || "").trim();
    const parts = mesStr.split("/");
    const ano = parts[0] || "";
    const mesNum = (parts[1] || "").trim().padStart(2, "0");
    const abrev = MESES_ABREV[mesNum] || mesNum;
    return {
      mes: mesStr,
      mesFormatado: `${abrev}/${ano}`,
      totalFaturado: parseValor(r.total_faturado),
      qtdContas: Number(r.qtd_contas) || 0,
    };
  });
}

async function queryIntegFaturado_PorSetor(
  db: any,
  estabId: number,
  prefixo: string,
  limit = 20
): Promise<FaturamentoPorSetorPadronizado[]> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(nomecc), 'Não informado') as setor,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixo}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY COALESCE(TRIM(nomecc), 'Não informado')
      ORDER BY total_faturado DESC
      LIMIT ${limit}
    `)
  );
  return (rows as unknown as any[]).map((r: any) => ({
    setor: r.setor || "Não informado",
    totalFaturado: parseValor(r.total_faturado),
    qtdContas: Number(r.qtd_contas) || 0,
    percentual: 0, // calculado depois
  }));
}

async function queryIntegFaturado_PorConvenio(
  db: any,
  estabId: number,
  prefixo: string,
  limit = 15
): Promise<FaturamentoPorConvenioPadronizado[]> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(nomeconv), 'Não informado') as convenio,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixo}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY COALESCE(TRIM(nomeconv), 'Não informado')
      ORDER BY total_faturado DESC
      LIMIT ${limit}
    `)
  );
  return (rows as unknown as any[]).map((r: any) => ({
    convenio: r.convenio || "Não informado",
    totalFaturado: parseValor(r.total_faturado),
    qtdContas: Number(r.qtd_contas) || 0,
    percentual: 0,
  }));
}

async function queryIntegFaturado_PorTipo(
  db: any,
  estabId: number,
  prefixo: string
): Promise<FaturamentoPorTipoPadronizado[]> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(tipoatend), 'N/I') as tipo,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixo}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY COALESCE(TRIM(tipoatend), 'N/I')
      ORDER BY total_faturado DESC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => {
    const tipo = String(r.tipo || "N/I").trim();
    return {
      tipo,
      tipoDescricao: TIPO_ATENDIMENTO_DESC[tipo] || tipo,
      totalFaturado: parseValor(r.total_faturado),
      qtdContas: Number(r.qtd_contas) || 0,
      percentual: 0,
    };
  });
}

async function queryIntegFaturado_TabelaComparativa(
  db: any,
  estabId: number,
  prefixoAtual: string,
  prefixoAnterior: string
): Promise<TabelaComparativaPadronizada[]> {
  const [mesAtualRows] = await db.execute(
    sql.raw(`
      SELECT 
        SUBSTRING(mesprod, 6, 2) as mes_num,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixoAtual}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY SUBSTRING(mesprod, 6, 2)
      ORDER BY mes_num ASC
    `)
  );

  const [mesAnteriorRows] = await db.execute(
    sql.raw(`
      SELECT 
        SUBSTRING(mesprod, 6, 2) as mes_num,
        COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numconta) as qtd_contas
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND mesprod LIKE '${prefixoAnterior}%'
        AND vl_faturado IS NOT NULL
        AND vl_faturado != ''
      GROUP BY SUBSTRING(mesprod, 6, 2)
      ORDER BY mes_num ASC
    `)
  );

  const mapAtual = new Map<string, { faturado: number; contas: number }>();
  for (const r of mesAtualRows as unknown as any[]) {
    const mesNum = String(r.mes_num || "").trim().padStart(2, "0");
    mapAtual.set(mesNum, { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
  }

  const mapAnterior = new Map<string, { faturado: number; contas: number }>();
  for (const r of mesAnteriorRows as unknown as any[]) {
    const mesNum = String(r.mes_num || "").trim().padStart(2, "0");
    mapAnterior.set(mesNum, { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
  }

  const tabela: TabelaComparativaPadronizada[] = [];
  for (let i = 1; i <= 12; i++) {
    const mesKey = String(i).padStart(2, "0");
    const atual = mapAtual.get(mesKey) || { faturado: 0, contas: 0 };
    const anterior = mapAnterior.get(mesKey) || { faturado: 0, contas: 0 };
    const variacao = anterior.faturado > 0
      ? Math.round(((atual.faturado - anterior.faturado) / anterior.faturado) * 10000) / 100
      : (atual.faturado > 0 ? 100 : 0);
    tabela.push({
      mes: mesKey,
      mesNome: MESES_NOMES[mesKey] || mesKey,
      faturadoAtual: atual.faturado,
      faturadoAnterior: anterior.faturado,
      qtdContasAtual: atual.contas,
      qtdContasAnterior: anterior.contas,
      variacao,
    });
  }
  return tabela;
}

async function queryIntegFaturado_ListarConvenios(
  db: any,
  estabId: number
): Promise<string[]> {
  const [rows] = await db.execute(
    sql.raw(`
      SELECT DISTINCT COALESCE(TRIM(nomeconv), 'Não informado') as convenio
      FROM integ_faturado
      WHERE estabelecimento_id = ${estabId}
        AND nomeconv IS NOT NULL
        AND TRIM(nomeconv) != ''
      ORDER BY convenio ASC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => String(r.convenio || "").trim()).filter(Boolean);
}

// ============================================================
// QUERIES POR FONTE: contas_convenio_itens
// ============================================================

function buildOrigemFilter(origemPreferida: string | null): string {
  if (origemPreferida === "XML") return "AND origem = 'XML'";
  if (origemPreferida === "BANCO_CLIENTE") return "AND origem = 'BANCO_CLIENTE'";
  return ""; // AMBOS = sem filtro de origem
}

/**
 * Converte competencia de contas_convenio_itens para o formato comparável.
 * contas_convenio_itens usa competencia como "2025/05" ou "2025-05" ou "05/2025"
 * integ_faturado usa mesprod como "2025/05"
 * Vamos padronizar para "YYYY/MM" e filtrar com LIKE
 */
function buildCompetenciaFilter(prefixo: string, origemFilter: string): string {
  // prefixo vem como "2025/" - queremos filtrar competencia LIKE '2025/%' ou '2025-%'
  const ano = prefixo.replace("/", "");
  return `AND (competencia LIKE '${ano}/%' OR competencia LIKE '${ano}-%')`;
}

async function queryContasConvenio_Acumulado(
  db: any,
  estabId: number,
  prefixo: string,
  origemPreferida: string | null
): Promise<ResumoFaturamentoPadronizado> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const ano = prefixo.replace("/", "");
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas,
        COUNT(*) as qtd_itens
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${ano}/%' OR competencia LIKE '${ano}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
    `)
  );
  const row = (rows as any)[0];
  return {
    totalFaturado: parseValor(row?.total_faturado),
    qtdContas: Number(row?.qtd_contas) || 0,
    qtdItens: Number(row?.qtd_itens) || 0,
  };
}

async function queryContasConvenio_PorMes(
  db: any,
  estabId: number,
  anoAtual: number,
  anoAnterior: number,
  origemPreferida: string | null
): Promise<FaturamentoPorMesPadronizado[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        competencia as mes,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (
          competencia LIKE '${anoAtual}/%' OR competencia LIKE '${anoAtual}-%'
          OR competencia LIKE '${anoAnterior}/%' OR competencia LIKE '${anoAnterior}-%'
        )
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY competencia
      ORDER BY competencia ASC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => {
    const mesStr = String(r.mes || "").trim().replace("-", "/");
    const parts = mesStr.split("/");
    const ano = parts[0] || "";
    const mesNum = (parts[1] || "").trim().padStart(2, "0");
    const abrev = MESES_ABREV[mesNum] || mesNum;
    return {
      mes: `${ano}/${mesNum}`,
      mesFormatado: `${abrev}/${ano}`,
      totalFaturado: parseValor(r.total_faturado),
      qtdContas: Number(r.qtd_contas) || 0,
    };
  });
}

async function queryContasConvenio_PorSetor(
  db: any,
  estabId: number,
  prefixo: string,
  origemPreferida: string | null,
  limit = 20
): Promise<FaturamentoPorSetorPadronizado[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const ano = prefixo.replace("/", "");
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(setor), 'Não informado') as setor,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${ano}/%' OR competencia LIKE '${ano}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY COALESCE(TRIM(setor), 'Não informado')
      ORDER BY total_faturado DESC
      LIMIT ${limit}
    `)
  );
  return (rows as unknown as any[]).map((r: any) => ({
    setor: r.setor || "Não informado",
    totalFaturado: parseValor(r.total_faturado),
    qtdContas: Number(r.qtd_contas) || 0,
    percentual: 0,
  }));
}

async function queryContasConvenio_PorConvenio(
  db: any,
  estabId: number,
  prefixo: string,
  origemPreferida: string | null,
  limit = 15
): Promise<FaturamentoPorConvenioPadronizado[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const ano = prefixo.replace("/", "");
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(convenio), 'Não informado') as convenio,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${ano}/%' OR competencia LIKE '${ano}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY COALESCE(TRIM(convenio), 'Não informado')
      ORDER BY total_faturado DESC
      LIMIT ${limit}
    `)
  );
  return (rows as unknown as any[]).map((r: any) => ({
    convenio: r.convenio || "Não informado",
    totalFaturado: parseValor(r.total_faturado),
    qtdContas: Number(r.qtd_contas) || 0,
    percentual: 0,
  }));
}

async function queryContasConvenio_PorTipo(
  db: any,
  estabId: number,
  prefixo: string,
  origemPreferida: string | null
): Promise<FaturamentoPorTipoPadronizado[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const ano = prefixo.replace("/", "");
  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        COALESCE(TRIM(tipoItem), 'N/I') as tipo,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${ano}/%' OR competencia LIKE '${ano}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY COALESCE(TRIM(tipoItem), 'N/I')
      ORDER BY total_faturado DESC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => {
    const tipo = String(r.tipo || "N/I").trim();
    return {
      tipo,
      tipoDescricao: TIPO_ATENDIMENTO_DESC[tipo] || tipo,
      totalFaturado: parseValor(r.total_faturado),
      qtdContas: Number(r.qtd_contas) || 0,
      percentual: 0,
    };
  });
}

async function queryContasConvenio_TabelaComparativa(
  db: any,
  estabId: number,
  anoAtual: number,
  anoAnterior: number,
  origemPreferida: string | null
): Promise<TabelaComparativaPadronizada[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);

  const [mesAtualRows] = await db.execute(
    sql.raw(`
      SELECT 
        CASE 
          WHEN competencia LIKE '${anoAtual}/%' THEN SUBSTRING(competencia, 6, 2)
          WHEN competencia LIKE '${anoAtual}-%' THEN SUBSTRING(competencia, 6, 2)
          ELSE '00'
        END as mes_num,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${anoAtual}/%' OR competencia LIKE '${anoAtual}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY mes_num
      ORDER BY mes_num ASC
    `)
  );

  const [mesAnteriorRows] = await db.execute(
    sql.raw(`
      SELECT 
        CASE 
          WHEN competencia LIKE '${anoAnterior}/%' THEN SUBSTRING(competencia, 6, 2)
          WHEN competencia LIKE '${anoAnterior}-%' THEN SUBSTRING(competencia, 6, 2)
          ELSE '00'
        END as mes_num,
        COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
        COUNT(DISTINCT numeroConta) as qtd_contas
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND (competencia LIKE '${anoAnterior}/%' OR competencia LIKE '${anoAnterior}-%')
        AND valorTotal IS NOT NULL
        AND valorTotal > 0
        ${origemFilter}
      GROUP BY mes_num
      ORDER BY mes_num ASC
    `)
  );

  const mapAtual = new Map<string, { faturado: number; contas: number }>();
  for (const r of mesAtualRows as unknown as any[]) {
    const mesNum = String(r.mes_num || "").trim().padStart(2, "0");
    mapAtual.set(mesNum, { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
  }

  const mapAnterior = new Map<string, { faturado: number; contas: number }>();
  for (const r of mesAnteriorRows as unknown as any[]) {
    const mesNum = String(r.mes_num || "").trim().padStart(2, "0");
    mapAnterior.set(mesNum, { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
  }

  const tabela: TabelaComparativaPadronizada[] = [];
  for (let i = 1; i <= 12; i++) {
    const mesKey = String(i).padStart(2, "0");
    const atual = mapAtual.get(mesKey) || { faturado: 0, contas: 0 };
    const anterior = mapAnterior.get(mesKey) || { faturado: 0, contas: 0 };
    const variacao = anterior.faturado > 0
      ? Math.round(((atual.faturado - anterior.faturado) / anterior.faturado) * 10000) / 100
      : (atual.faturado > 0 ? 100 : 0);
    tabela.push({
      mes: mesKey,
      mesNome: MESES_NOMES[mesKey] || mesKey,
      faturadoAtual: atual.faturado,
      faturadoAnterior: anterior.faturado,
      qtdContasAtual: atual.contas,
      qtdContasAnterior: anterior.contas,
      variacao,
    });
  }
  return tabela;
}

async function queryContasConvenio_ListarConvenios(
  db: any,
  estabId: number,
  origemPreferida: string | null
): Promise<string[]> {
  const origemFilter = buildOrigemFilter(origemPreferida);
  const [rows] = await db.execute(
    sql.raw(`
      SELECT DISTINCT COALESCE(TRIM(convenio), 'Não informado') as convenio
      FROM contas_convenio_itens
      WHERE estabelecimentoId = ${estabId}
        AND convenio IS NOT NULL
        AND TRIM(convenio) != ''
        ${origemFilter}
      ORDER BY convenio ASC
    `)
  );
  return (rows as unknown as any[]).map((r: any) => String(r.convenio || "").trim()).filter(Boolean);
}

// ============================================================
// FUNÇÃO PRINCIPAL: RELATÓRIO UNIFICADO
// ============================================================

/**
 * Gera o relatório de faturamento padronizado, buscando da fonte correta
 * conforme a configuração do estabelecimento.
 */
export async function buscarRelatorioUnificado(
  filtro: FiltroRelatorioUnificado
): Promise<RelatorioFaturamentoPadronizado> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const config = await obterConfiguracaoFonte(filtro.estabelecimentoId);
  const anoAtual = filtro.anoAtual || new Date().getFullYear();
  const anoAnterior = filtro.anoAnterior || anoAtual - 1;
  const prefixoAtual = `${anoAtual}/`;
  const prefixoAnterior = `${anoAnterior}/`;

  let acumuladoAtual: ResumoFaturamentoPadronizado;
  let acumuladoAnterior: ResumoFaturamentoPadronizado;
  let porMes: FaturamentoPorMesPadronizado[];
  let porSetor: FaturamentoPorSetorPadronizado[];
  let porConvenio: FaturamentoPorConvenioPadronizado[];
  let porTipoAtendimento: FaturamentoPorTipoPadronizado[];
  let tabelaComparativa: TabelaComparativaPadronizada[];

  if (config.fonteFaturamento === "integ_faturado") {
    // ===== FONTE: integ_faturado =====
    acumuladoAtual = await queryIntegFaturado_Acumulado(db, filtro.estabelecimentoId, prefixoAtual);
    acumuladoAnterior = await queryIntegFaturado_Acumulado(db, filtro.estabelecimentoId, prefixoAnterior);
    porMes = await queryIntegFaturado_PorMes(db, filtro.estabelecimentoId, prefixoAtual, prefixoAnterior);
    porSetor = await queryIntegFaturado_PorSetor(db, filtro.estabelecimentoId, prefixoAtual);
    porConvenio = await queryIntegFaturado_PorConvenio(db, filtro.estabelecimentoId, prefixoAtual);
    porTipoAtendimento = await queryIntegFaturado_PorTipo(db, filtro.estabelecimentoId, prefixoAtual);
    tabelaComparativa = await queryIntegFaturado_TabelaComparativa(db, filtro.estabelecimentoId, prefixoAtual, prefixoAnterior);

    // Fallback inteligente: se o estabelecimento está com o padrão integ_faturado (sem dados no integrador),
    // mas possui contas importadas via XML/Fábrica em contas_convenio_itens, popula o relatório a partir de contas_convenio_itens
    if (acumuladoAtual.qtdContas === 0 && acumuladoAnterior.qtdContas === 0 && porMes.length === 0) {
      const origem = config.origemPreferida;
      const ccAcumAtual = await queryContasConvenio_Acumulado(db, filtro.estabelecimentoId, prefixoAtual, origem);
      const ccAcumAnt = await queryContasConvenio_Acumulado(db, filtro.estabelecimentoId, prefixoAnterior, origem);
      if (ccAcumAtual.qtdContas > 0 || ccAcumAnt.qtdContas > 0) {
        acumuladoAtual = ccAcumAtual;
        acumuladoAnterior = ccAcumAnt;
        porMes = await queryContasConvenio_PorMes(db, filtro.estabelecimentoId, anoAtual, anoAnterior, origem);
        porSetor = await queryContasConvenio_PorSetor(db, filtro.estabelecimentoId, prefixoAtual, origem);
        porConvenio = await queryContasConvenio_PorConvenio(db, filtro.estabelecimentoId, prefixoAtual, origem);
        porTipoAtendimento = await queryContasConvenio_PorTipo(db, filtro.estabelecimentoId, prefixoAtual, origem);
        tabelaComparativa = await queryContasConvenio_TabelaComparativa(db, filtro.estabelecimentoId, anoAtual, anoAnterior, origem);
      }
    }
  } else {
    // ===== FONTE: contas_convenio_itens (ou faturamento_tiss) =====
    const origem = config.origemPreferida;
    acumuladoAtual = await queryContasConvenio_Acumulado(db, filtro.estabelecimentoId, prefixoAtual, origem);
    acumuladoAnterior = await queryContasConvenio_Acumulado(db, filtro.estabelecimentoId, prefixoAnterior, origem);
    porMes = await queryContasConvenio_PorMes(db, filtro.estabelecimentoId, anoAtual, anoAnterior, origem);
    porSetor = await queryContasConvenio_PorSetor(db, filtro.estabelecimentoId, prefixoAtual, origem);
    porConvenio = await queryContasConvenio_PorConvenio(db, filtro.estabelecimentoId, prefixoAtual, origem);
    porTipoAtendimento = await queryContasConvenio_PorTipo(db, filtro.estabelecimentoId, prefixoAtual, origem);
    tabelaComparativa = await queryContasConvenio_TabelaComparativa(db, filtro.estabelecimentoId, anoAtual, anoAnterior, origem);
  }

  // Calcular percentuais
  const totalAtual = acumuladoAtual.totalFaturado;
  for (const s of porSetor) {
    s.percentual = totalAtual > 0 ? Math.round((s.totalFaturado / totalAtual) * 10000) / 100 : 0;
  }
  for (const c of porConvenio) {
    c.percentual = totalAtual > 0 ? Math.round((c.totalFaturado / totalAtual) * 10000) / 100 : 0;
  }
  for (const t of porTipoAtendimento) {
    t.percentual = totalAtual > 0 ? Math.round((t.totalFaturado / totalAtual) * 10000) / 100 : 0;
  }

  // Variação percentual acumulada
  const variacaoPercentual = acumuladoAnterior.totalFaturado > 0
    ? Math.round(((acumuladoAtual.totalFaturado - acumuladoAnterior.totalFaturado) / acumuladoAnterior.totalFaturado) * 10000) / 100
    : (acumuladoAtual.totalFaturado > 0 ? 100 : 0);

  return {
    fonte: config.fonteFaturamento,
    sistemaOrigem: config.sistemaOrigem,
    acumulado: {
      anoAtual,
      anoAnterior,
      totalFaturadoAtual: acumuladoAtual.totalFaturado,
      totalFaturadoAnterior: acumuladoAnterior.totalFaturado,
      variacaoPercentual,
      qtdContasAtual: acumuladoAtual.qtdContas,
      qtdContasAnterior: acumuladoAnterior.qtdContas,
    },
    porSetor,
    porMes,
    porTipoAtendimento,
    porConvenio,
    tabelaComparativa,
  };
}

// ============================================================
// LISTAR CONVÊNIOS (unificado)
// ============================================================

export async function listarConveniosUnificado(
  estabelecimentoId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const config = await obterConfiguracaoFonte(estabelecimentoId);

  if (config.fonteFaturamento === "integ_faturado") {
    const lista = await queryIntegFaturado_ListarConvenios(db, estabelecimentoId);
    if (lista.length > 0) return lista;
    return queryContasConvenio_ListarConvenios(db, estabelecimentoId, config.origemPreferida);
  } else {
    return queryContasConvenio_ListarConvenios(db, estabelecimentoId, config.origemPreferida);
  }
}

// ============================================================
// TABELA COMPARATIVA POR CONVÊNIO ESPECÍFICO (unificado)
// ============================================================

export async function buscarTabelaPorConvenioUnificado(
  filtro: { estabelecimentoId: number; anoAtual: number; anoAnterior: number; convenio: string }
): Promise<TabelaComparativaPadronizada[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const config = await obterConfiguracaoFonte(filtro.estabelecimentoId);
  const { anoAtual, anoAnterior, convenio } = filtro;
  const convenioEscaped = convenio.replace(/'/g, "''");

  if (config.fonteFaturamento === "integ_faturado") {
    const prefixoAtual = `${anoAtual}/`;
    const prefixoAnterior = `${anoAnterior}/`;

    const [mesAtualRows] = await db.execute(
      sql.raw(`
        SELECT 
          SUBSTRING(mesprod, 6, 2) as mes_num,
          COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
          COUNT(DISTINCT numconta) as qtd_contas
        FROM integ_faturado
        WHERE estabelecimento_id = ${filtro.estabelecimentoId}
          AND mesprod LIKE '${prefixoAtual}%'
          AND COALESCE(TRIM(nomeconv), 'Não informado') = '${convenioEscaped}'
          AND vl_faturado IS NOT NULL
          AND vl_faturado != ''
        GROUP BY SUBSTRING(mesprod, 6, 2)
        ORDER BY mes_num ASC
      `)
    );

    const [mesAnteriorRows] = await db.execute(
      sql.raw(`
        SELECT 
          SUBSTRING(mesprod, 6, 2) as mes_num,
          COALESCE(SUM(CAST(REPLACE(REPLACE(vl_faturado, ',', '.'), ' ', '') AS DECIMAL(14,2))), 0) as total_faturado,
          COUNT(DISTINCT numconta) as qtd_contas
        FROM integ_faturado
        WHERE estabelecimento_id = ${filtro.estabelecimentoId}
          AND mesprod LIKE '${prefixoAnterior}%'
          AND COALESCE(TRIM(nomeconv), 'Não informado') = '${convenioEscaped}'
          AND vl_faturado IS NOT NULL
          AND vl_faturado != ''
        GROUP BY SUBSTRING(mesprod, 6, 2)
        ORDER BY mes_num ASC
      `)
    );

    if (
      (mesAtualRows as unknown as any[]).length === 0 &&
      (mesAnteriorRows as unknown as any[]).length === 0
    ) {
      const origemFilter = buildOrigemFilter(config.origemPreferida);
      const [ccAtualRows] = await db.execute(
        sql.raw(`
          SELECT
            CASE
              WHEN competencia LIKE '${anoAtual}/%' THEN SUBSTRING(competencia, 6, 2)
              WHEN competencia LIKE '${anoAtual}-%' THEN SUBSTRING(competencia, 6, 2)
              ELSE '00'
            END as mes_num,
            COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
            COUNT(DISTINCT numeroConta) as qtd_contas
          FROM contas_convenio_itens
          WHERE estabelecimentoId = ${filtro.estabelecimentoId}
            AND (competencia LIKE '${anoAtual}/%' OR competencia LIKE '${anoAtual}-%')
            AND COALESCE(TRIM(convenio), 'Não informado') = '${convenioEscaped}'
            AND valorTotal IS NOT NULL
            AND valorTotal > 0
            ${origemFilter}
          GROUP BY mes_num
          ORDER BY mes_num ASC
        `)
      );
      const [ccAnteriorRows] = await db.execute(
        sql.raw(`
          SELECT
            CASE
              WHEN competencia LIKE '${anoAnterior}/%' THEN SUBSTRING(competencia, 6, 2)
              WHEN competencia LIKE '${anoAnterior}-%' THEN SUBSTRING(competencia, 6, 2)
              ELSE '00'
            END as mes_num,
            COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
            COUNT(DISTINCT numeroConta) as qtd_contas
          FROM contas_convenio_itens
          WHERE estabelecimentoId = ${filtro.estabelecimentoId}
            AND (competencia LIKE '${anoAnterior}/%' OR competencia LIKE '${anoAnterior}-%')
            AND COALESCE(TRIM(convenio), 'Não informado') = '${convenioEscaped}'
            AND valorTotal IS NOT NULL
            AND valorTotal > 0
            ${origemFilter}
          GROUP BY mes_num
          ORDER BY mes_num ASC
        `)
      );
      if (
        (ccAtualRows as unknown as any[]).length > 0 ||
        (ccAnteriorRows as unknown as any[]).length > 0
      ) {
        (mesAtualRows as unknown as any[]).push(...(ccAtualRows as unknown as any[]));
        (mesAnteriorRows as unknown as any[]).push(...(ccAnteriorRows as unknown as any[]));
      }
    }

    const mapAtual = new Map<string, { faturado: number; contas: number }>();
    for (const r of mesAtualRows as unknown as any[]) {
      mapAtual.set(String(r.mes_num || "").trim().padStart(2, "0"), { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
    }
    const mapAnterior = new Map<string, { faturado: number; contas: number }>();
    for (const r of mesAnteriorRows as unknown as any[]) {
      mapAnterior.set(String(r.mes_num || "").trim().padStart(2, "0"), { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
    }

    const tabela: TabelaComparativaPadronizada[] = [];
    for (let i = 1; i <= 12; i++) {
      const mesKey = String(i).padStart(2, "0");
      const atual = mapAtual.get(mesKey) || { faturado: 0, contas: 0 };
      const anterior = mapAnterior.get(mesKey) || { faturado: 0, contas: 0 };
      const variacao = anterior.faturado > 0
        ? Math.round(((atual.faturado - anterior.faturado) / anterior.faturado) * 10000) / 100
        : (atual.faturado > 0 ? 100 : 0);
      tabela.push({ mes: mesKey, mesNome: MESES_NOMES[mesKey] || mesKey, faturadoAtual: atual.faturado, faturadoAnterior: anterior.faturado, qtdContasAtual: atual.contas, qtdContasAnterior: anterior.contas, variacao });
    }
    return tabela;
  } else {
    // contas_convenio_itens
    const origemFilter = buildOrigemFilter(config.origemPreferida);

    const [mesAtualRows] = await db.execute(
      sql.raw(`
        SELECT 
          CASE 
            WHEN competencia LIKE '${anoAtual}/%' THEN SUBSTRING(competencia, 6, 2)
            WHEN competencia LIKE '${anoAtual}-%' THEN SUBSTRING(competencia, 6, 2)
            ELSE '00'
          END as mes_num,
          COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
          COUNT(DISTINCT numeroConta) as qtd_contas
        FROM contas_convenio_itens
        WHERE estabelecimentoId = ${filtro.estabelecimentoId}
          AND (competencia LIKE '${anoAtual}/%' OR competencia LIKE '${anoAtual}-%')
          AND COALESCE(TRIM(convenio), 'Não informado') = '${convenioEscaped}'
          AND valorTotal IS NOT NULL
          AND valorTotal > 0
          ${origemFilter}
        GROUP BY mes_num
        ORDER BY mes_num ASC
      `)
    );

    const [mesAnteriorRows] = await db.execute(
      sql.raw(`
        SELECT 
          CASE 
            WHEN competencia LIKE '${anoAnterior}/%' THEN SUBSTRING(competencia, 6, 2)
            WHEN competencia LIKE '${anoAnterior}-%' THEN SUBSTRING(competencia, 6, 2)
            ELSE '00'
          END as mes_num,
          COALESCE(SUM(CAST(valorTotal AS DECIMAL(14,2))), 0) as total_faturado,
          COUNT(DISTINCT numeroConta) as qtd_contas
        FROM contas_convenio_itens
        WHERE estabelecimentoId = ${filtro.estabelecimentoId}
          AND (competencia LIKE '${anoAnterior}/%' OR competencia LIKE '${anoAnterior}-%')
          AND COALESCE(TRIM(convenio), 'Não informado') = '${convenioEscaped}'
          AND valorTotal IS NOT NULL
          AND valorTotal > 0
          ${origemFilter}
        GROUP BY mes_num
        ORDER BY mes_num ASC
      `)
    );

    const mapAtual = new Map<string, { faturado: number; contas: number }>();
    for (const r of mesAtualRows as unknown as any[]) {
      mapAtual.set(String(r.mes_num || "").trim().padStart(2, "0"), { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
    }
    const mapAnterior = new Map<string, { faturado: number; contas: number }>();
    for (const r of mesAnteriorRows as unknown as any[]) {
      mapAnterior.set(String(r.mes_num || "").trim().padStart(2, "0"), { faturado: parseValor(r.total_faturado), contas: Number(r.qtd_contas) || 0 });
    }

    const tabela: TabelaComparativaPadronizada[] = [];
    for (let i = 1; i <= 12; i++) {
      const mesKey = String(i).padStart(2, "0");
      const atual = mapAtual.get(mesKey) || { faturado: 0, contas: 0 };
      const anterior = mapAnterior.get(mesKey) || { faturado: 0, contas: 0 };
      const variacao = anterior.faturado > 0
        ? Math.round(((atual.faturado - anterior.faturado) / anterior.faturado) * 10000) / 100
        : (atual.faturado > 0 ? 100 : 0);
      tabela.push({ mes: mesKey, mesNome: MESES_NOMES[mesKey] || mesKey, faturadoAtual: atual.faturado, faturadoAnterior: anterior.faturado, qtdContasAtual: atual.contas, qtdContasAnterior: anterior.contas, variacao });
    }
    return tabela;
  }
}
