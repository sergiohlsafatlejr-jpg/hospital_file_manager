import { TRPCError } from "@trpc/server";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import { detectarEasyLocalCampos } from "./easyLocalMetadata";
import {
  easyLocalCriarTabela,
  easyLocalLeitura,
  easyLocalNomeFisico,
  type EasyLocalColuna,
  type EasyLocalTabelaInput,
  type EasyLocalLeituraInput,
  type EasyLocalTabelaResumo,
  type EasyLocalLeituraResumo,
} from "../shared/easyLocalIntegrador";

const CONNECTION_ALIAS = "__EASYLOCAL_SERVER__";
const MARKER = "easylocal-direto-v1";
function erro(
  code: "CONFLICT" | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}
async function conexao(): Promise<PoolConnection> {
  const pool = await getRawPool();
  if (!pool)
    erro("INTERNAL_SERVER_ERROR", "Catálogo do integrador indisponível.");
  return pool.getConnection();
}
function tipoSql(c: EasyLocalColuna): string {
  switch (c.tipo) {
    case "varchar":
      return `VARCHAR(${c.tamanho ?? 255})`;
    case "decimal":
      return `DECIMAL(${c.tamanho ?? 18},${c.escala ?? 2})`;
    case "boolean":
      return "TINYINT(1)";
    default:
      return c.tipo.toUpperCase();
  }
}
export function ddlEasyLocalTabela(raw: EasyLocalTabelaInput): string {
  const t = easyLocalCriarTabela.parse(raw);
  return (
    `CREATE TABLE \`${easyLocalNomeFisico(t.estabelecimentoId, t.nome)}\` (\n` +
    `  \`_id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,\n` +
    `  \`estabelecimento_id\` INT NOT NULL DEFAULT ${t.estabelecimentoId},\n` +
    t.colunas
      .map(
        c =>
          `  \`${c.nome}\` ${tipoSql(c)} ${c.obrigatorio ? "NOT NULL" : "NULL"}`
      )
      .join(",\n") +
    `,\n  \`_sincronizado_em\` DATETIME NULL,\n  INDEX \`idx_estabelecimento\` (\`estabelecimento_id\`)\n)`
  );
}
function descriptor(
  text: string | null
): { marker: string; usuarioId: number; colunas: EasyLocalColuna[] } | null {
  try {
    const x = JSON.parse(text ?? "null");
    return x?.marker === MARKER && Array.isArray(x.colunas) ? x : null;
  } catch {
    return null;
  }
}
async function unidade(
  conn: PoolConnection,
  estabelecimentoId: number,
  lock = false
): Promise<void> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM estabelecimentos WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [estabelecimentoId]
  );
  if (rows.length !== 1) erro("NOT_FOUND", "Estabelecimento não encontrado.");
}
function seguro(error: unknown, message: string): never {
  if (error instanceof TRPCError) throw error;
  erro("INTERNAL_SERVER_ERROR", message);
}
async function iniciarTransacao(conn: PoolConnection): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT VERSION() AS versao"
  );
  if (rows.length !== 1 || typeof rows[0]?.versao !== "string")
    erro("INTERNAL_SERVER_ERROR", "Modo transacional não confirmado.");
  if (/tidb/i.test(rows[0].versao)) await conn.query("BEGIN PESSIMISTIC");
  else await conn.beginTransaction();
}

/** Reserva metadados numa transação serializada pela linha existente da unidade.
 * DDL é separado e jamais repetido automaticamente: uma falha pode deixar tabela vazia
 * ou reserva pendente, que exige conferência. Não usa IF NOT EXISTS para adotar tabelas.
 */
export async function criarEasyLocalTabela(
  raw: EasyLocalTabelaInput,
  usuarioId: number
) {
  const t = easyLocalCriarTabela.parse(raw);
  const conn = await conexao();
  const nomeMeta = `el_${t.estabelecimentoId}_${t.nome}`;
  const nomeFisico = easyLocalNomeFisico(t.estabelecimentoId, t.nome);
  let tabelaId = 0;
  let reservaConfirmada = false;
  try {
    await iniciarTransacao(conn);
    await unidade(conn, t.estabelecimentoId, true);
    const [registradas] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM integracao_tabelas WHERE nome = ?",
      [nomeMeta]
    );
    const [fisicas] = await conn.execute<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [nomeFisico]
    );
    if (registradas.length || fisicas.length)
      erro(
        "CONFLICT",
        "Nome já utilizado ou reservado. A tabela existente não foi alterada."
      );
    const [insert] = await conn.execute<any>(
      "INSERT INTO integracao_tabelas (nome, nomeExibicao, descricao, estabelecimentoId, criadaNoBanco, totalRegistros) VALUES (?, ?, ?, ?, 'nao', 0)",
      [
        nomeMeta,
        t.nomeExibicao,
        JSON.stringify({ marker: MARKER, usuarioId, colunas: t.colunas }),
        t.estabelecimentoId,
      ]
    );
    tabelaId = Number(insert.insertId);
    if (!Number.isSafeInteger(tabelaId) || tabelaId <= 0)
      erro("INTERNAL_SERVER_ERROR", "Reserva de tabela não confirmada.");
    for (const [ordem, c] of t.colunas.entries()) {
      await conn.execute(
        "INSERT INTO integracao_colunas (tabelaId, nome, nomeExibicao, tipo, tamanho, precisao, obrigatorio, chaveUnica, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, 'nao', ?)",
        [
          tabelaId,
          c.nome,
          c.nome,
          c.tipo,
          c.tamanho ?? null,
          c.escala ?? null,
          c.obrigatorio ? "sim" : "nao",
          ordem,
        ]
      );
    }
    await conn.commit();
    reservaConfirmada = true;
    await conn.query(ddlEasyLocalTabela(t));
    const [cols] = await conn.execute<RowDataPacket[]>(
      "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [nomeFisico]
    );
    if (
      cols.length !== t.colunas.length + 3 ||
      cols[0]?.COLUMN_NAME !== "_id" ||
      cols[1]?.COLUMN_NAME !== "estabelecimento_id" ||
      cols.at(-1)?.COLUMN_NAME !== "_sincronizado_em"
    ) {
      erro(
        "INTERNAL_SERVER_ERROR",
        "Criação requer conferência física; a reserva foi preservada. Não repita a operação."
      );
    }
    const id = cols[0],
      estab = cols[1],
      sync = cols.at(-1)!;
    if (
      id.DATA_TYPE !== "bigint" ||
      id.IS_NULLABLE !== "NO" ||
      id.COLUMN_KEY !== "PRI" ||
      !String(id.EXTRA).includes("auto_increment") ||
      estab.DATA_TYPE !== "int" ||
      estab.IS_NULLABLE !== "NO" ||
      Number(estab.COLUMN_DEFAULT) !== t.estabelecimentoId ||
      sync.DATA_TYPE !== "datetime" ||
      sync.IS_NULLABLE !== "YES"
    ) {
      erro(
        "INTERNAL_SERVER_ERROR",
        "Colunas técnicas não confirmadas; mantenha a reserva para conferência."
      );
    }
    for (const [i, c] of t.colunas.entries()) {
      const p = cols[i + 2];
      const dataType = c.tipo === "boolean" ? "tinyint" : c.tipo;
      if (
        p.COLUMN_NAME !== c.nome ||
        String(p.DATA_TYPE).toLowerCase() !== dataType ||
        p.IS_NULLABLE !== (c.obrigatorio ? "NO" : "YES") ||
        (c.tipo === "varchar" &&
          Number(p.CHARACTER_MAXIMUM_LENGTH) !== (c.tamanho ?? 255)) ||
        (c.tipo === "decimal" &&
          (Number(p.NUMERIC_PRECISION) !== (c.tamanho ?? 18) ||
            Number(p.NUMERIC_SCALE) !== (c.escala ?? 2)))
      ) {
        erro(
          "INTERNAL_SERVER_ERROR",
          "Tipos físicos não confirmados; a reserva foi preservada. Não repita a operação."
        );
      }
    }
    await conn.execute(
      "UPDATE integracao_tabelas SET criadaNoBanco = 'sim' WHERE id = ? AND estabelecimentoId = ? AND nome = ?",
      [tabelaId, t.estabelecimentoId, nomeMeta]
    );
    return { sucesso: true as const, tabelaId, nomeFisico };
  } catch (error) {
    if (!reservaConfirmada) {
      try {
        await conn.rollback();
      } catch {
        /* não imprimir driver */
      }
    }
    seguro(
      error,
      "Criação não confirmada. Confira o catálogo antes de repetir; nenhum dado existente foi apagado."
    );
  } finally {
    conn.release();
  }
}

export async function listarEasyLocalTabelas(
  estabelecimentoId: number
): Promise<EasyLocalTabelaResumo[]> {
  const conn = await conexao();
  try {
    await unidade(conn, estabelecimentoId);
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id, nome, nomeExibicao, descricao, criadaNoBanco, criadoEm FROM integracao_tabelas WHERE estabelecimentoId = ? AND nome LIKE ? ORDER BY id DESC LIMIT 201",
      [estabelecimentoId, `el_${estabelecimentoId}_%`]
    );
    const gerenciadas = rows.filter(
      r =>
        descriptor(r.descricao) &&
        String(r.nome).startsWith(`el_${estabelecimentoId}_`)
    );
    if (rows.length > 200)
      erro(
        "BAD_REQUEST",
        "Mais de 200 tabelas; refine o catálogo antes de continuar."
      );
    return gerenciadas.map(r => ({
      id: Number(r.id),
      nomeFisico: `integ_${r.nome}`,
      nomeExibicao: r.nomeExibicao,
      estado: r.criadaNoBanco === "sim" ? "criada" : "pendente_conferencia",
      colunas: descriptor(r.descricao)!.colunas,
      criadoEm:
        r.criadoEm instanceof Date
          ? r.criadoEm.toISOString()
          : r.criadoEm
            ? String(r.criadoEm)
            : null,
    }));
  } catch (e) {
    seguro(e, "Não foi possível consultar o catálogo.");
  } finally {
    conn.release();
  }
}

export async function salvarEasyLocalLeitura(
  raw: EasyLocalLeituraInput,
  usuarioId: number
) {
  const input = easyLocalLeitura.parse(raw);
  // Consultar apenas catálogo da origem, nunca registros, e não exigir teste manual prévio.
  const campos = await detectarEasyLocalCampos(input.origem);
  const nomes = new Set(campos.map(c => c.nome));
  if (!nomes.has(input.colunaEstabelecimento) || !nomes.has(input.campoChave))
    erro(
      "BAD_REQUEST",
      "Chave e coluna de estabelecimento precisam existir na origem."
    );
  const conn = await conexao();
  try {
    await iniciarTransacao(conn);
    await unidade(conn, input.estabelecimentoId, true);
    const [tabelas] = await conn.execute<RowDataPacket[]>(
      "SELECT nome, descricao, criadaNoBanco FROM integracao_tabelas WHERE id = ? AND estabelecimentoId = ? FOR UPDATE",
      [input.tabelaId, input.estabelecimentoId]
    );
    const tab = tabelas[0];
    const desc = tab && descriptor(tab.descricao);
    if (
      !desc ||
      !String(tab.nome).startsWith(`el_${input.estabelecimentoId}_`) ||
      tab.criadaNoBanco !== "sim"
    )
      erro("NOT_FOUND", "Escolha uma tabela criada e conferida desta unidade.");
    if (
      !desc.colunas.some(c => c.nome === input.campoChave) ||
      desc.colunas.some(c => !nomes.has(c.nome))
    )
      erro(
        "BAD_REQUEST",
        "As colunas de destino precisam existir na origem; revise o mapeamento pelo mesmo nome."
      );
    const [exists] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM integracao_mapeamentos WHERE tabelaDestinoId = ? AND estabelecimentoId = ?",
      [input.tabelaId, input.estabelecimentoId]
    );
    if (exists.length)
      erro(
        "CONFLICT",
        "Esta tabela já possui configuração. Não foi criada outra leitura concorrente."
      );
    const [aliases] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM integracao_conexoes WHERE nome = ? AND estabelecimentoId = ?",
      [CONNECTION_ALIAS, input.estabelecimentoId]
    );
    let conexaoId = Number(aliases[0]?.id ?? 0);
    if (!conexaoId) {
      const [alias] = await conn.execute<any>(
        "INSERT INTO integracao_conexoes (nome, descricao, tipo, host, porta, banco, usuario, senhaEncriptada, `ssl`, estabelecimentoId, ativo) VALUES (?, ?, 'postgresql', 'segredos-do-servidor', 5432, 'EASYLocal', 'role-servidor', 'REFERENCIA_ENV_SEM_CREDENCIAL', 'sim', ?, 'nao')",
        [CONNECTION_ALIAS, MARKER, input.estabelecimentoId]
      );
      conexaoId = Number(alias.insertId);
    }
    const [insert] = await conn.execute<any>(
      "INSERT INTO integracao_mapeamentos (nome, descricao, conexaoOrigemId, tabelaDestinoId, queryOrigem, campoChave, frequencia, ativo, estabelecimentoId, modoImportacao) VALUES (?, ?, ?, ?, ?, ?, 'manual', 'nao', ?, 'incremental')",
      [
        `EASYLocal: ${tab.nome}`,
        JSON.stringify({
          marker: MARKER,
          usuarioId,
          estado: "preparada_sem_execucao",
        }),
        conexaoId,
        input.tabelaId,
        JSON.stringify(input),
        input.campoChave,
        input.estabelecimentoId,
      ]
    );
    const leituraId = Number(insert.insertId);
    await conn.commit();
    return { sucesso: true as const, leituraId, execucaoAtiva: false as const };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* sanitizado */
    }
    seguro(
      e,
      "Configuração não confirmada. Confira a listagem antes de repetir."
    );
  } finally {
    conn.release();
  }
}

export async function listarEasyLocalLeituras(
  estabelecimentoId: number
): Promise<EasyLocalLeituraResumo[]> {
  const conn = await conexao();
  try {
    await unidade(conn, estabelecimentoId);
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT m.id, m.tabelaDestinoId, m.queryOrigem, m.descricao, m.ativo, t.nomeExibicao FROM integracao_mapeamentos m JOIN integracao_tabelas t ON t.id = m.tabelaDestinoId AND t.estabelecimentoId = m.estabelecimentoId WHERE m.estabelecimentoId = ? AND t.nome LIKE ? ORDER BY m.id DESC LIMIT 201",
      [estabelecimentoId, `el_${estabelecimentoId}_%`]
    );
    if (rows.length > 200)
      erro("BAD_REQUEST", "Mais de 200 configurações; refine o catálogo.");
    return rows.flatMap(r => {
      try {
        if (JSON.parse(r.descricao).marker !== MARKER || r.ativo !== "nao")
          return [];
        const c = easyLocalLeitura.parse(JSON.parse(r.queryOrigem));
        if (
          c.estabelecimentoId !== estabelecimentoId ||
          c.tabelaId !== Number(r.tabelaDestinoId)
        )
          return [];
        return [
          {
            id: Number(r.id),
            tabelaId: c.tabelaId,
            nomeTabela: r.nomeExibicao,
            origem: c.origem,
            colunaEstabelecimento: c.colunaEstabelecimento,
            valorEstabelecimento: c.valorEstabelecimento,
            campoChave: c.campoChave,
            dominio: c.dominio,
            frequenciaDesejada: c.frequenciaDesejada,
            estado: "preparada_sem_execucao" as const,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch (e) {
    seguro(e, "Não foi possível listar as configurações.");
  } finally {
    conn.release();
  }
}
