/**
 * Serviço de Faturamento Externo
 * Gerencia importação de planilhas Excel com dados de faturamento/recebimento
 * de estabelecimentos que não possuem integração direta com banco de dados.
 * Os dados importados são integrados ao Relatório de Faturamento.
 */
import { getDb, getRawPool } from "./db";
import { sql } from "drizzle-orm";

// ============================================================
// INTERFACES
// ============================================================

export interface FaturamentoExternoRow {
  id: number;
  estabelecimentoId: number;
  convenio: string;
  mesAno: string; // "YYYY/MM"
  codigoPrestador: string | null;
  valorFaturado: number;
  valorRecebido: number;
  valorGlosado: number;
  arquivoOrigem: string | null;
  origem: string;
  observacao: string | null;
  importadoPorNome: string | null;
  atualizadoPorNome: string | null;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
}

export interface ImportacaoExcelRow {
  convenio: string;
  mesAno: string; // "YYYY/MM"
  valorFaturado: number;
  valorRecebido: number;
  valorGlosado?: number;
}

export interface LancamentoManualInput {
  id?: number;
  estabelecimentoId: number;
  convenio: string;
  mesAno: string;
  codigoPrestador?: string | null;
  valorFaturado: number;
  valorRecebido: number;
  valorGlosado: number;
  observacao?: string | null;
}

export interface ImportacaoResult {
  totalLinhas: number;
  inseridos: number;
  atualizados: number;
  erros: string[];
}

// ============================================================
// LISTAR DADOS IMPORTADOS
// ============================================================

export async function listarFaturamentoExterno(
  estabelecimentoId: number,
  ano?: number
): Promise<FaturamentoExternoRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const filtroAno = ano ? `AND mes_ano LIKE '${ano}/%'` : "";

  const [rows] = await db.execute(
    sql.raw(`
      SELECT id, estabelecimento_id, convenio, mes_ano, 
             codigo_prestador, valor_faturado, valor_recebido, valor_glosado,
             arquivo_origem, origem, observacao, importado_por_nome,
             atualizado_por_nome, criado_em, atualizado_em
      FROM faturamento_externo
      WHERE estabelecimento_id = ${estabelecimentoId}
        ${filtroAno}
      ORDER BY mes_ano ASC, convenio ASC
    `)
  );

  return (rows as unknown as any[]).map((r: any) => ({
    id: r.id,
    estabelecimentoId: r.estabelecimento_id,
    convenio: r.convenio,
    mesAno: r.mes_ano,
    codigoPrestador: r.codigo_prestador,
    valorFaturado: parseFloat(r.valor_faturado) || 0,
    valorRecebido: parseFloat(r.valor_recebido) || 0,
    valorGlosado: parseFloat(r.valor_glosado) || 0,
    arquivoOrigem: r.arquivo_origem,
    origem: r.origem || "excel",
    observacao: r.observacao,
    importadoPorNome: r.importado_por_nome,
    atualizadoPorNome: r.atualizado_por_nome,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  }));
}

// ============================================================
// LISTAR CONVÊNIOS EXTERNOS
// ============================================================

export async function listarConveniosExternos(
  estabelecimentoId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const [rows] = await db.execute(
    sql.raw(`
      SELECT DISTINCT convenio
      FROM faturamento_externo
      WHERE estabelecimento_id = ${estabelecimentoId}
      ORDER BY convenio ASC
    `)
  );

  return (rows as unknown as any[]).map((r: any) => String(r.convenio));
}

// ============================================================
// IMPORTAR DADOS DO EXCEL
// ============================================================

export async function importarFaturamentoExterno(
  estabelecimentoId: number,
  dados: ImportacaoExcelRow[],
  arquivoOrigem: string,
  userId: number,
  userName: string
): Promise<ImportacaoResult> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const result: ImportacaoResult = {
    totalLinhas: dados.length,
    inseridos: 0,
    atualizados: 0,
    erros: [],
  };

  for (const row of dados) {
    try {
      const convenioEscaped = row.convenio.replace(/'/g, "''").trim();
      const mesAno = row.mesAno.trim();
      const valorFaturado = isNaN(row.valorFaturado) ? 0 : row.valorFaturado;
      const valorRecebido = isNaN(row.valorRecebido) ? 0 : row.valorRecebido;
      const valorGlosado = isNaN(Number(row.valorGlosado)) ? 0 : Number(row.valorGlosado);
      const arquivoEscaped = (arquivoOrigem || "").replace(/'/g, "''");
      const userNameEscaped = (userName || "").replace(/'/g, "''");

      // Verificar se já existe registro para esse convênio/mês
      const [existing] = await db.execute(
        sql.raw(`
          SELECT id FROM faturamento_externo
          WHERE estabelecimento_id = ${estabelecimentoId}
            AND convenio = '${convenioEscaped}'
            AND mes_ano = '${mesAno}'
          LIMIT 1
        `)
      );

      const existingRows = existing as unknown as any[];
      if (existingRows.length > 0) {
        // Atualizar registro existente
        await db.execute(
          sql.raw(`
            UPDATE faturamento_externo
            SET valor_faturado = ${valorFaturado},
                valor_recebido = ${valorRecebido},
                valor_glosado = ${valorGlosado},
                arquivo_origem = '${arquivoEscaped}',
                origem = 'excel',
                importado_por = ${userId},
                importado_por_nome = '${userNameEscaped}',
                atualizado_por = ${userId},
                atualizado_por_nome = '${userNameEscaped}',
                atualizado_em = NOW()
            WHERE id = ${existingRows[0].id}
          `)
        );
        result.atualizados++;
      } else {
        // Inserir novo registro
        await db.execute(
          sql.raw(`
            INSERT INTO faturamento_externo 
              (estabelecimento_id, convenio, mes_ano, valor_faturado, valor_recebido,
               valor_glosado, arquivo_origem, origem, importado_por, importado_por_nome,
               atualizado_por, atualizado_por_nome)
            VALUES 
              (${estabelecimentoId}, '${convenioEscaped}', '${mesAno}', 
               ${valorFaturado}, ${valorRecebido}, ${valorGlosado},
               '${arquivoEscaped}', 'excel', ${userId}, '${userNameEscaped}',
               ${userId}, '${userNameEscaped}')
          `)
        );
        result.inseridos++;
      }
    } catch (err: any) {
      result.erros.push(`Linha ${row.convenio}/${row.mesAno}: ${err.message?.substring(0, 200)}`);
    }
  }

  return result;
}

export function normalizarLancamentoManual(input: LancamentoManualInput): LancamentoManualInput {
  return {
    ...input,
    convenio: input.convenio.trim().replace(/\s+/g, " "),
    mesAno: input.mesAno.trim(),
    codigoPrestador: input.codigoPrestador?.trim() || null,
    valorFaturado: Number(Number(input.valorFaturado || 0).toFixed(2)),
    valorRecebido: Number(Number(input.valorRecebido || 0).toFixed(2)),
    valorGlosado: Number(Number(input.valorGlosado || 0).toFixed(2)),
    observacao: input.observacao?.trim() || null,
  };
}

export async function salvarFaturamentoExternoManual(
  input: LancamentoManualInput,
  userId: number,
  userName: string
): Promise<FaturamentoExternoRow> {
  const pool = await getRawPool();
  if (!pool) throw new Error("Database não disponível");

  const item = normalizarLancamentoManual(input);
  const [duplicados] = await pool.execute<any[]>(
    `SELECT id FROM faturamento_externo
      WHERE estabelecimento_id = ? AND UPPER(TRIM(convenio)) = UPPER(TRIM(?))
        AND mes_ano = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
    [item.estabelecimentoId, item.convenio, item.mesAno, item.id ?? null, item.id ?? null]
  );
  if (duplicados.length > 0) {
    throw new Error("Já existe um lançamento para este estabelecimento, convênio e competência. Edite o registro existente.");
  }

  if (item.id) {
    const [resultado] = await pool.execute<any>(
      `UPDATE faturamento_externo SET convenio=?, mes_ano=?, codigo_prestador=?,
        valor_faturado=?, valor_recebido=?, valor_glosado=?, origem='manual',
        observacao=?, atualizado_por=?, atualizado_por_nome=?, atualizado_em=NOW()
       WHERE id=? AND estabelecimento_id=?`,
      [item.convenio, item.mesAno, item.codigoPrestador, item.valorFaturado,
        item.valorRecebido, item.valorGlosado, item.observacao, userId, userName,
        item.id, item.estabelecimentoId]
    );
    if (!resultado.affectedRows) throw new Error("Lançamento não encontrado neste estabelecimento");
  } else {
    const [resultado] = await pool.execute<any>(
      `INSERT INTO faturamento_externo
        (estabelecimento_id, convenio, mes_ano, codigo_prestador, valor_faturado,
         valor_recebido, valor_glosado, origem, observacao, arquivo_origem,
         importado_por, importado_por_nome, atualizado_por, atualizado_por_nome)
       VALUES (?,?,?,?,?,?,?,'manual',?,'Cadastro manual',?,?,?,?)`,
      [item.estabelecimentoId, item.convenio, item.mesAno, item.codigoPrestador,
        item.valorFaturado, item.valorRecebido, item.valorGlosado, item.observacao,
        userId, userName, userId, userName]
    );
    item.id = Number(resultado.insertId);
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT id, estabelecimento_id, convenio, mes_ano, codigo_prestador,
      valor_faturado, valor_recebido, valor_glosado, arquivo_origem, origem,
      observacao, importado_por_nome, atualizado_por_nome, criado_em, atualizado_em
     FROM faturamento_externo WHERE id=? AND estabelecimento_id=? LIMIT 1`,
    [item.id, item.estabelecimentoId]
  );
  const row = rows[0];
  if (!row) throw new Error("Não foi possível confirmar o lançamento salvo");
  return {
    id: Number(row.id), estabelecimentoId: Number(row.estabelecimento_id),
    convenio: String(row.convenio), mesAno: String(row.mes_ano),
    codigoPrestador: row.codigo_prestador, valorFaturado: Number(row.valor_faturado || 0),
    valorRecebido: Number(row.valor_recebido || 0), valorGlosado: Number(row.valor_glosado || 0),
    arquivoOrigem: row.arquivo_origem, origem: row.origem || "manual", observacao: row.observacao,
    importadoPorNome: row.importado_por_nome, atualizadoPorNome: row.atualizado_por_nome,
    criadoEm: row.criado_em, atualizadoEm: row.atualizado_em,
  };
}

// ============================================================
// EXCLUIR DADOS IMPORTADOS
// ============================================================

export async function excluirFaturamentoExterno(
  id: number,
  estabelecimentoId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  await db.execute(
    sql.raw(`
      DELETE FROM faturamento_externo
      WHERE id = ${id} AND estabelecimento_id = ${estabelecimentoId}
    `)
  );
  return true;
}

// ============================================================
// BUSCAR TOTAIS POR MÊS (para integração com Relatório de Faturamento)
// ============================================================

export async function buscarTotaisFaturamentoExterno(
  estabelecimentoId: number,
  ano: number
): Promise<{ mesAno: string; mesNum: string; totalFaturado: number; totalRecebido: number; convenios: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const prefixo = `${ano}/`;

  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        mes_ano,
        SUBSTRING(mes_ano, 6, 2) as mes_num,
        SUM(valor_faturado) as total_faturado,
        SUM(valor_recebido) as total_recebido,
        COUNT(DISTINCT convenio) as convenios
      FROM faturamento_externo
      WHERE estabelecimento_id = ${estabelecimentoId}
        AND mes_ano LIKE '${prefixo}%'
      GROUP BY mes_ano
      ORDER BY mes_ano ASC
    `)
  );

  return (rows as unknown as any[]).map((r: any) => ({
    mesAno: r.mes_ano,
    mesNum: String(r.mes_num || "").trim().padStart(2, "0"),
    totalFaturado: parseFloat(r.total_faturado) || 0,
    totalRecebido: parseFloat(r.total_recebido) || 0,
    convenios: Number(r.convenios) || 0,
  }));
}

// ============================================================
// BUSCAR TOTAIS POR CONVÊNIO (para integração com Relatório de Faturamento)
// ============================================================

export async function buscarTotaisPorConvenioExterno(
  estabelecimentoId: number,
  ano: number
): Promise<{ convenio: string; totalFaturado: number; totalRecebido: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");

  const prefixo = `${ano}/`;

  const [rows] = await db.execute(
    sql.raw(`
      SELECT 
        convenio,
        SUM(valor_faturado) as total_faturado,
        SUM(valor_recebido) as total_recebido
      FROM faturamento_externo
      WHERE estabelecimento_id = ${estabelecimentoId}
        AND mes_ano LIKE '${prefixo}%'
      GROUP BY convenio
      ORDER BY total_faturado DESC
    `)
  );

  return (rows as unknown as any[]).map((r: any) => ({
    convenio: r.convenio,
    totalFaturado: parseFloat(r.total_faturado) || 0,
    totalRecebido: parseFloat(r.total_recebido) || 0,
  }));
}
