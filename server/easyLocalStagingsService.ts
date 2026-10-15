import { TRPCError } from "@trpc/server";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getRawPool } from "./db";
import { detectarEasyLocalCampos } from "./easyLocalMetadata";
import {
  EASYLOCAL_CONNECTION_MARKER,
  EASYLOCAL_STAGING_MARKER,
  bloqueiosBaseStaging,
  colunasFisicasStaging,
  criarDescritorMapeamentoStaging,
  criarDescritorTabelaStaging,
  easyLocalLeituraStaging,
  easyLocalStagingContracts,
  lerDescritorMapeamentoStaging,
  lerDescritorTabelaStaging,
  obterEasyLocalStagingContract,
  validarEasyLocalLeituraStaging,
  type EasyLocalLeituraStagingInput,
  type EasyLocalStagingContract,
  type EasyLocalStagingResumo,
} from "../shared/easyLocalStagings";

const CONNECTION_ALIAS = "__EASYLOCAL_SERVER__";

type CatalogColumn = RowDataPacket & {
  COLUMN_NAME?: unknown;
  DATA_TYPE?: unknown;
  COLUMN_TYPE?: unknown;
  IS_NULLABLE?: unknown;
  CHARACTER_SET_NAME?: unknown;
  COLLATION_NAME?: unknown;
};

type CatalogIndex = RowDataPacket & { NON_UNIQUE?: unknown };

type MetadataTable = RowDataPacket & {
  id?: unknown;
  nome?: unknown;
  estabelecimentoId?: unknown;
  descricao?: unknown;
};

type MappingRow = RowDataPacket & {
  id?: unknown;
  tabelaDestinoId?: unknown;
  estabelecimentoId?: unknown;
  descricao?: unknown;
  queryOrigem?: unknown;
  campoChave?: unknown;
  frequencia?: unknown;
  ativo?: unknown;
  modoImportacao?: unknown;
};

function fail(
  code: "CONFLICT" | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR",
  message: string
): never {
  throw new TRPCError({ code, message });
}

function sanitize(error: unknown, message: string): never {
  if (error instanceof TRPCError) throw error;
  fail("INTERNAL_SERVER_ERROR", message);
}

function assertActor(usuarioId: number): void {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0)
    fail("BAD_REQUEST", "Usuário responsável pelo vínculo é inválido.");
}

async function connection(): Promise<PoolConnection> {
  try {
    const pool = await getRawPool();
    if (!pool)
      fail("INTERNAL_SERVER_ERROR", "Catálogo do integrador indisponível.");
    return await pool.getConnection();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    fail("INTERNAL_SERVER_ERROR", "Catálogo do integrador indisponível.");
  }
}

async function assertUnit(
  conn: PoolConnection,
  estabelecimentoId: number,
  lock = false
): Promise<void> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM estabelecimentos WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [estabelecimentoId]
  );
  if (rows.length !== 1) fail("NOT_FOUND", "Estabelecimento não encontrado.");
}

async function beginTransaction(conn: PoolConnection): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT VERSION() AS versao"
  );
  if (rows.length !== 1 || typeof rows[0]?.versao !== "string")
    fail("INTERNAL_SERVER_ERROR", "Modo transacional não confirmado.");
  if (/tidb/i.test(rows[0].versao)) await conn.query("BEGIN PESSIMISTIC");
  else await conn.beginTransaction();
}

function normalized(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

/**
 * A comparação é deliberadamente posicional e exata: as tabelas legadas não
 * recebem colunas técnicas, PK, transformação de tipos ou reordenação.
 */
export function estruturaFisicaStagingCompativel(
  contract: EasyLocalStagingContract,
  rows: readonly CatalogColumn[]
): boolean {
  const expected = colunasFisicasStaging(contract);
  return (
    rows.length === expected.length &&
    rows.every((row, index) => {
      const field = expected[index];
      return (
        String(row.COLUMN_NAME ?? "") === field.nome &&
        normalized(row.DATA_TYPE) === field.dataType &&
        normalized(row.COLUMN_TYPE) === field.columnType &&
        String(row.IS_NULLABLE ?? "") === field.nullable &&
        normalized(row.CHARACTER_SET_NAME) === normalized(field.charset) &&
        normalized(row.COLLATION_NAME) === normalized(field.collation)
      );
    })
  );
}

async function physicalColumns(
  conn: PoolConnection,
  nomeStaging: string
): Promise<CatalogColumn[]> {
  const [rows] = await conn.execute<CatalogColumn[]>(
    "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, CHARACTER_SET_NAME, COLLATION_NAME, ORDINAL_POSITION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    [nomeStaging]
  );
  return rows;
}

async function hasUniqueIndex(
  conn: PoolConnection,
  nomeStaging: string
): Promise<boolean> {
  const [rows] = await conn.execute<CatalogIndex[]>(
    "SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME, NON_UNIQUE",
    [nomeStaging]
  );
  return rows.some(row => Number(row.NON_UNIQUE) === 0);
}

function sameNumber(value: unknown, expected: number): boolean {
  return Number(value) === expected;
}

function contractsForUnit(
  estabelecimentoId: number
): EasyLocalStagingContract[] {
  const contracts = easyLocalStagingContracts.filter(
    contract => contract.estabelecimentoId === estabelecimentoId
  );
  if (!contracts.length)
    fail(
      "BAD_REQUEST",
      "A unidade não possui stagings EASYLocal permitidas nesta preparação."
    );
  return [...contracts];
}

function metadataCompatible(
  row: MetadataTable,
  contract: EasyLocalStagingContract
): boolean {
  return (
    sameNumber(row.estabelecimentoId, contract.estabelecimentoId) &&
    String(row.nome ?? "") === contract.nomeStaging &&
    lerDescritorTabelaStaging(row.descricao, contract) !== null
  );
}

async function metadataRows(
  conn: PoolConnection,
  nomeStaging: string,
  lock = false
): Promise<MetadataTable[]> {
  const [rows] = await conn.execute<MetadataTable[]>(
    `SELECT id, nome, estabelecimentoId, descricao FROM integracao_tabelas WHERE nome = ?${
      lock ? " FOR UPDATE" : ""
    }`,
    [nomeStaging]
  );
  return rows;
}

function summary(
  contract: EasyLocalStagingContract,
  physical: CatalogColumn[],
  unique: boolean,
  tableRows: MetadataTable[]
): EasyLocalStagingResumo {
  const physicalOk = estruturaFisicaStagingCompativel(contract, physical);
  const metadata = tableRows.filter(row => metadataCompatible(row, contract));
  const metadataOk = metadata.length === 1 && tableRows.length === 1;
  const bloqueios = bloqueiosBaseStaging(contract, unique);

  if (physical.length === 0) {
    bloqueios.unshift("Staging física allowlist não encontrada.");
    return {
      nomeFisico: contract.nomeStaging,
      nomeExibicao: contract.nomeExibicao,
      dominio: contract.dominio,
      origem: contract.origem,
      estado: "ausente",
      totalColunas: 0,
      escritorAtual: "nao_confirmado",
      execucaoLiberada: false,
      bloqueios,
      tabelaId: null,
    };
  }

  if (!physicalOk) {
    bloqueios.unshift(
      "Contrato físico auditado não confere; vínculo bloqueado."
    );
    return {
      nomeFisico: contract.nomeStaging,
      nomeExibicao: contract.nomeExibicao,
      dominio: contract.dominio,
      origem: contract.origem,
      estado: "incompativel",
      totalColunas: physical.length,
      escritorAtual: "nao_confirmado",
      execucaoLiberada: false,
      bloqueios,
      tabelaId: null,
    };
  }

  if (tableRows.length > 0 && !metadataOk) {
    bloqueios.unshift(
      "Metadado existente não é o descritor de staging permitido para esta unidade."
    );
    return {
      nomeFisico: contract.nomeStaging,
      nomeExibicao: contract.nomeExibicao,
      dominio: contract.dominio,
      origem: contract.origem,
      estado: "incompativel",
      totalColunas: physical.length,
      escritorAtual: "nao_confirmado",
      execucaoLiberada: false,
      bloqueios,
      tabelaId: null,
    };
  }

  return {
    nomeFisico: contract.nomeStaging,
    nomeExibicao: contract.nomeExibicao,
    dominio: contract.dominio,
    origem: contract.origem,
    estado: "disponivel",
    totalColunas: physical.length,
    escritorAtual: "nao_confirmado",
    execucaoLiberada: false,
    bloqueios,
    tabelaId: metadataOk ? Number(metadata[0]?.id) : null,
  };
}

/**
 * Só lê information_schema e as tabelas de catálogo do Portal. Não consulta
 * sequer uma linha das stagings ou da origem hospitalar.
 */
export async function listarEasyLocalStagingsExistentes(
  estabelecimentoId: number
): Promise<EasyLocalStagingResumo[]> {
  const contracts = contractsForUnit(estabelecimentoId);
  const conn = await connection();
  try {
    await assertUnit(conn, estabelecimentoId);
    const result: EasyLocalStagingResumo[] = [];
    for (const contract of contracts) {
      const [columns, unique, tables] = await Promise.all([
        physicalColumns(conn, contract.nomeStaging),
        hasUniqueIndex(conn, contract.nomeStaging),
        metadataRows(conn, contract.nomeStaging),
      ]);
      result.push(summary(contract, columns, unique, tables));
    }
    return result;
  } catch (error) {
    sanitize(error, "Não foi possível consultar o catálogo das stagings.");
  } finally {
    conn.release();
  }
}

function parseStoredInput(
  raw: unknown,
  contract: EasyLocalStagingContract
): EasyLocalLeituraStagingInput | null {
  try {
    const input = easyLocalLeituraStaging.parse(
      typeof raw === "string" ? JSON.parse(raw) : raw
    );
    return validarEasyLocalLeituraStaging(input) === contract ? input : null;
  } catch {
    return null;
  }
}

function sameInput(
  left: EasyLocalLeituraStagingInput,
  right: EasyLocalLeituraStagingInput
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mappingCompatible(
  row: MappingRow,
  contract: EasyLocalStagingContract,
  tableId: number
): EasyLocalLeituraStagingInput | null {
  if (
    !sameNumber(row.tabelaDestinoId, tableId) ||
    !sameNumber(row.estabelecimentoId, contract.estabelecimentoId) ||
    String(row.campoChave ?? "") !== contract.campoChave ||
    String(row.frequencia ?? "") !== "manual" ||
    String(row.ativo ?? "") !== "nao" ||
    String(row.modoImportacao ?? "") !== "incremental" ||
    lerDescritorMapeamentoStaging(row.descricao, contract) === null
  )
    return null;
  return parseStoredInput(row.queryOrigem, contract);
}

async function tableMetadataForSave(
  conn: PoolConnection,
  contract: EasyLocalStagingContract
): Promise<number> {
  const rows = await metadataRows(conn, contract.nomeStaging, true);
  if (rows.length > 1)
    fail(
      "CONFLICT",
      "Há mais de um metadado para esta staging; confira o catálogo."
    );
  const existing = rows[0];
  if (existing) {
    if (!metadataCompatible(existing, contract))
      fail(
        "CONFLICT",
        "Nome de staging já está em uso por metadado legado ou outra unidade."
      );
    const id = Number(existing.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      fail("INTERNAL_SERVER_ERROR", "Metadado de staging não confirmado.");
    return id;
  }

  const [insert] = await conn.execute<ResultSetHeader>(
    "INSERT INTO integracao_tabelas (nome, nomeExibicao, descricao, estabelecimentoId, criadaNoBanco, totalRegistros) VALUES (?, ?, ?, ?, 'sim', 0)",
    [
      contract.nomeStaging,
      contract.nomeExibicao,
      JSON.stringify(criarDescritorTabelaStaging(contract)),
      contract.estabelecimentoId,
    ]
  );
  const tableId = Number(insert.insertId);
  if (!Number.isSafeInteger(tableId) || tableId <= 0)
    fail("INTERNAL_SERVER_ERROR", "Metadado de staging não confirmado.");
  return tableId;
}

async function sourceConnectionId(
  conn: PoolConnection,
  estabelecimentoId: number
): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    "SELECT id, descricao FROM integracao_conexoes WHERE nome = ? AND estabelecimentoId = ? FOR UPDATE",
    [CONNECTION_ALIAS, estabelecimentoId]
  );
  if (rows.length > 1)
    fail(
      "CONFLICT",
      "Há mais de uma referência central EASYLocal nesta unidade."
    );
  const existing = rows[0];
  if (existing) {
    if (String(existing.descricao ?? "") !== EASYLOCAL_CONNECTION_MARKER)
      fail(
        "CONFLICT",
        "A referência central EASYLocal existente não é compatível."
      );
    const id = Number(existing.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      fail(
        "INTERNAL_SERVER_ERROR",
        "Referência central EASYLocal não confirmada."
      );
    return id;
  }
  const [insert] = await conn.execute<ResultSetHeader>(
    "INSERT INTO integracao_conexoes (nome, descricao, tipo, host, porta, banco, usuario, senhaEncriptada, `ssl`, estabelecimentoId, ativo) VALUES (?, ?, 'postgresql', 'segredos-do-servidor', 5432, 'EASYLocal', 'role-servidor', 'REFERENCIA_ENV_SEM_CREDENCIAL', 'sim', ?, 'nao')",
    [CONNECTION_ALIAS, EASYLOCAL_CONNECTION_MARKER, estabelecimentoId]
  );
  const id = Number(insert.insertId);
  if (!Number.isSafeInteger(id) || id <= 0)
    fail(
      "INTERNAL_SERVER_ERROR",
      "Referência central EASYLocal não confirmada."
    );
  return id;
}

async function lockedStagingMappings(
  conn: PoolConnection,
  tableId: number
): Promise<MappingRow[]> {
  const [rows] = await conn.execute<MappingRow[]>(
    "SELECT id, tabelaDestinoId, estabelecimentoId, descricao, queryOrigem, campoChave, frequencia, ativo, modoImportacao FROM integracao_mapeamentos WHERE tabelaDestinoId = ? OR descricao LIKE ? FOR UPDATE",
    [tableId, `%\"marker\":\"${EASYLOCAL_STAGING_MARKER}\"%`]
  );
  return rows;
}

function assertNoCrossUnitOrigin(
  mappings: MappingRow[],
  input: EasyLocalLeituraStagingInput
): void {
  for (const row of mappings) {
    let parsed: EasyLocalLeituraStagingInput | null = null;
    try {
      parsed = easyLocalLeituraStaging.parse(
        typeof row.queryOrigem === "string"
          ? JSON.parse(row.queryOrigem)
          : row.queryOrigem
      );
    } catch {
      continue;
    }
    let stagingMarker = false;
    try {
      const descriptor = JSON.parse(
        typeof row.descricao === "string" ? row.descricao : "null"
      ) as unknown;
      stagingMarker =
        !!descriptor &&
        typeof descriptor === "object" &&
        !Array.isArray(descriptor) &&
        (descriptor as { marker?: unknown }).marker ===
          EASYLOCAL_STAGING_MARKER;
    } catch {
      // Registro malformado não se passa por vínculo deste marcador.
    }
    if (
      stagingMarker &&
      parsed.estabelecimentoId !== input.estabelecimentoId &&
      parsed.origem.schema === input.origem.schema &&
      parsed.origem.tabela === input.origem.tabela &&
      parsed.colunaEstabelecimento === input.colunaEstabelecimento &&
      parsed.valorEstabelecimento === input.valorEstabelecimento
    )
      fail(
        "CONFLICT",
        "O mesmo valor de origem já está vinculado a outra unidade."
      );
  }
}

/**
 * Prepara exclusivamente os metadados de um destino físico allowlist. Nenhum
 * dado é lido/escrito na staging e o registro resultante segue inativo/manual.
 */
export async function salvarEasyLocalLeituraStaging(
  raw: EasyLocalLeituraStagingInput,
  usuarioId: number
): Promise<{
  sucesso: true;
  leituraId: number;
  tabelaId: number;
  execucaoAtiva: false;
  idempotente: boolean;
}> {
  const input = easyLocalLeituraStaging.parse(raw);
  assertActor(usuarioId);
  const contract = validarEasyLocalLeituraStaging(input);
  if (!contract)
    fail(
      "BAD_REQUEST",
      "Unidade, staging, domínio, origem e coluna de estabelecimento precisam formar um par permitido."
    );

  // A origem é conferida por catálogo somente leitura; nunca assumimos PortalID.
  const fields = await detectarEasyLocalCampos(input.origem);
  if (!fields.some(field => field.nome === "estabelecimentos_id"))
    fail(
      "BAD_REQUEST",
      "A coluna estabelecimentos_id precisa existir na origem permitida."
    );

  const conn = await connection();
  let healthyForRelease = true;
  try {
    await beginTransaction(conn);
    // Serializa tentativas da mesma unidade antes de toda reserva/INSERT.
    await assertUnit(conn, input.estabelecimentoId, true);

    // Releitura física dentro da transação imediatamente anterior aos INSERTs.
    const [columns, unique] = await Promise.all([
      physicalColumns(conn, contract.nomeStaging),
      hasUniqueIndex(conn, contract.nomeStaging),
    ]);
    if (columns.length === 0)
      fail(
        "NOT_FOUND",
        "A staging allowlist não está presente no catálogo físico."
      );
    if (!estruturaFisicaStagingCompativel(contract, columns))
      fail("CONFLICT", "O contrato físico auditado da staging não confere.");
    // Ausência de PK/unique é bloqueio de carga, deliberadamente não de vínculo.
    void unique;

    const tableId = await tableMetadataForSave(conn, contract);
    const mappings = await lockedStagingMappings(conn, tableId);
    assertNoCrossUnitOrigin(mappings, input);

    const sameTable = mappings.filter(row =>
      sameNumber(row.tabelaDestinoId, tableId)
    );
    if (sameTable.length > 1)
      fail(
        "CONFLICT",
        "A staging já possui mais de um vínculo; nenhum novo foi criado."
      );
    const existing = sameTable[0];
    if (existing) {
      const saved = mappingCompatible(existing, contract, tableId);
      if (!saved || !sameInput(saved, input))
        fail(
          "CONFLICT",
          "Esta staging já possui um vínculo diferente ou legado."
        );
      const leituraId = Number(existing.id);
      if (!Number.isSafeInteger(leituraId) || leituraId <= 0)
        fail("INTERNAL_SERVER_ERROR", "Vínculo de staging não confirmado.");
      await conn.commit();
      return {
        sucesso: true,
        leituraId,
        tabelaId: tableId,
        execucaoAtiva: false,
        idempotente: true,
      };
    }

    const conexaoId = await sourceConnectionId(conn, input.estabelecimentoId);
    const [insert] = await conn.execute<ResultSetHeader>(
      "INSERT INTO integracao_mapeamentos (nome, descricao, conexaoOrigemId, tabelaDestinoId, queryOrigem, campoChave, frequencia, ativo, estabelecimentoId, modoImportacao) VALUES (?, ?, ?, ?, ?, ?, 'manual', 'nao', ?, 'incremental')",
      [
        `EASYLocal staging: ${contract.nomeStaging}`,
        JSON.stringify(criarDescritorMapeamentoStaging(contract, usuarioId)),
        conexaoId,
        tableId,
        JSON.stringify(input),
        contract.campoChave,
        input.estabelecimentoId,
      ]
    );
    const leituraId = Number(insert.insertId);
    if (!Number.isSafeInteger(leituraId) || leituraId <= 0)
      fail("INTERNAL_SERVER_ERROR", "Vínculo de staging não confirmado.");
    await conn.commit();
    return {
      sucesso: true,
      leituraId,
      tabelaId: tableId,
      execucaoAtiva: false,
      idempotente: false,
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Não devolver ao pool uma conexão cujo rollback não foi confirmado.
      healthyForRelease = false;
      try {
        conn.destroy();
      } catch {
        // A resposta continua sanitizada; não vazar driver ou dados hospitalares.
      }
    }
    return sanitize(
      error,
      "Vínculo não confirmado. Confira a listagem antes de repetir."
    );
  } finally {
    if (healthyForRelease) conn.release();
  }
}

/** Reutilizado por listarEasyLocalLeituras para reconhecer apenas o marcador novo. */
export function leituraStagingResumo(
  row: {
    id?: unknown;
    tabelaDestinoId?: unknown;
    estabelecimentoId?: unknown;
    nomeExibicao?: unknown;
    tabelaNome?: unknown;
    tabelaDescricao?: unknown;
    descricao?: unknown;
    queryOrigem?: unknown;
    campoChave?: unknown;
    frequencia?: unknown;
    ativo?: unknown;
    modoImportacao?: unknown;
  },
  estabelecimentoId: number
) {
  const tableName = String(row.tabelaNome ?? "");
  const contract = easyLocalStagingContracts.find(
    item =>
      item.estabelecimentoId === estabelecimentoId &&
      item.nomeStaging === tableName
  );
  if (
    !contract ||
    !obterEasyLocalStagingContract(estabelecimentoId, tableName as any)
  )
    return null;
  if (lerDescritorTabelaStaging(row.tabelaDescricao, contract) === null)
    return null;
  const input = mappingCompatible(
    row as MappingRow,
    contract,
    Number(row.tabelaDestinoId)
  );
  if (!input) return null;
  const id = Number(row.id);
  const tableId = Number(row.tabelaDestinoId);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(tableId) ||
    tableId <= 0
  )
    return null;
  return {
    id,
    tabelaId: tableId,
    nomeTabela:
      typeof row.nomeExibicao === "string" && row.nomeExibicao.trim()
        ? row.nomeExibicao
        : contract.nomeExibicao,
    origem: input.origem,
    colunaEstabelecimento: input.colunaEstabelecimento,
    valorEstabelecimento: input.valorEstabelecimento,
    campoChave: contract.campoChave,
    dominio: input.dominio,
    frequenciaDesejada: input.frequenciaDesejada,
    estado: "preparada_sem_execucao" as const,
    tipoDestino: "staging_existente" as const,
    execucaoLiberada: false,
    bloqueios: bloqueiosBaseStaging(contract, false),
  };
}
