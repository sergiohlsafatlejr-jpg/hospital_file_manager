import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { parse } from "csv-parse";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";

export const TASY_CSV_HEADERS = [
  "SEQUENCIA", "ATUALIZACAO", "CONVENIO", "CATEGORIA", "PLANO", "ACOMODACAO",
  "ENTRADA", "SAIDA", "ALTA", "DT_DEFINITIVO", "COMPETENCIA", "SETOR_ENTRADA",
  "DT_ETAPA", "ETAPA_CONTA", "SETOR_ETAPA", "USUARIO_ETAPA", "MOTIVO_DEVOLUCAO",
  "STATUS_CONTA", "PROTOCOLO", "NOME_PROT", "TITULO", "ATENDIMENTO", "CONTA",
  "AUTORIZACAO", "MATRICULA", "PACIENTE", "TIPO_GUIA", "CD_PROCED", "PROCEDIMENTO",
  "MEDICO", "VALOR_CONTA",
] as const;

export const TASY_FINALIZED_STAGE = "conta em protocolo com titulo (finalizada)";

export interface TasyCsvImportOptions {
  filePath: string;
  fileName: string;
  estabelecimentoId: number;
  userId: number;
  configId?: number | null;
  publish?: boolean;
  replaceSnapshot?: boolean;
  allowLargeSnapshotReduction?: boolean;
  deadlineAtMs?: number;
  onProgress?: (progress: TasyImportProgress) => void;
}

export interface TasyImportProgress {
  phase: "hash" | "staging" | "publishing" | "completed";
  processedRows: number;
  validRows: number;
  warningRows: number;
  rejectedRows: number;
}

export interface TasyCsvImportResult extends TasyImportProgress {
  loteId: number;
  fileHash: string;
  totalAccounts: number;
  publishedAccounts: number;
  totalValue: number;
  reusedExistingLot: boolean;
}

type StageValues = Array<string | number | Date | null>;

type ParsedStageRow = {
  stageValues: StageValues;
  quarantine?: {
    line: number;
    code: string;
    detail: string;
    hash: string;
  };
  warnings: string[];
};

function clean(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized === "NULL" ? "" : normalized;
}

export function normalizeTasyHeader(value: string): string {
  return clean(value).replace(/^\uFEFF/, "").replace(/^"|"$/g, "").toUpperCase();
}

export function repairTasyCsvRecord(record: string[]): string[] | null {
  if (record.length === TASY_CSV_HEADERS.length) return record;
  if (record.length === TASY_CSV_HEADERS.length + 1) {
    return [...record.slice(0, -2), `${record.at(-2) || ""}.${record.at(-1) || ""}`];
  }
  return null;
}

export function parseTasyDecimal(value: string): number | null {
  const raw = clean(value);
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function normalizeTasyCompetencia(value: string): { value: string | null; warning?: string } {
  const raw = clean(value);
  if (!raw) return { value: null, warning: "COMPETENCIA_AUSENTE" };
  const match = raw.match(/^(\d{4})[\/-](\d{1,2})$/);
  if (!match) return { value: raw, warning: "COMPETENCIA_FORMATO_INVALIDO" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    return { value: raw, warning: "COMPETENCIA_FORA_DA_FAIXA" };
  }
  return { value: `${year}/${String(month).padStart(2, "0")}` };
}

export function isTasyFinalizedStage(value?: string | null): boolean {
  return clean(value).toLocaleLowerCase("pt-BR") === TASY_FINALIZED_STAGE;
}

export function isTasySnapshotCoverageSafe(
  activeAccounts: number,
  incomingAccounts: number,
  minimumCoverage = 0.8,
): boolean {
  if (activeAccounts < 100) return true;
  return incomingAccounts / activeAccounts >= minimumCoverage;
}

export function assertTasyImportWithinDeadline(deadlineAtMs?: number): void {
  if (deadlineAtMs && Date.now() >= deadlineAtMs) {
    throw new Error("Tempo seguro da importação excedido; reenvie o mesmo arquivo para retomar o lote.");
  }
}

function parseDate(value: string): Date | null {
  const raw = clean(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = iso;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, y, hh = "00", mm = "00", ss = "00"] = br;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function stableHash(values: string[]): string {
  return createHash("sha256").update(values.join("\u001f")).digest("hex");
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function parseStageRow(record: string[], line: number, loteId: number, estabelecimentoId: number, configId?: number | null): ParsedStageRow {
  const repaired = repairTasyCsvRecord(record);
  if (!repaired) {
    const hash = stableHash(record.map(clean));
    return {
      stageValues: [],
      quarantine: { line, code: "COLUNAS_INVALIDAS", detail: `Esperadas 31 colunas; recebidas ${record.length}.`, hash },
      warnings: [],
    };
  }

  const values = Object.fromEntries(TASY_CSV_HEADERS.map((header, index) => [header, clean(repaired[index])]));
  const atendimento = values.ATENDIMENTO;
  const conta = values.CONTA;
  const rowHash = stableHash(repaired.map(clean));
  if (!atendimento || !conta) {
    return {
      stageValues: [],
      quarantine: {
        line,
        code: "CHAVE_DA_CONTA_AUSENTE",
        detail: "ATENDIMENTO e CONTA são obrigatórios para identificar a conta.",
        hash: rowHash,
      },
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const competencia = normalizeTasyCompetencia(values.COMPETENCIA);
  if (competencia.warning) warnings.push(competencia.warning);
  if (!values.SEQUENCIA) warnings.push("SEQUENCIA_AUSENTE");
  if (!values.ETAPA_CONTA) warnings.push("ETAPA_AUSENTE");
  const valorConta = parseTasyDecimal(values.VALOR_CONTA);
  if (values.VALOR_CONTA && valorConta === null) warnings.push("VALOR_INVALIDO");
  if (!values.VALOR_CONTA) warnings.push("VALOR_AUSENTE");

  const origemId = `${atendimento}:${conta}`;
  const statusValidacao = warnings.length > 0 ? "aviso" : "valido";
  return {
    warnings,
    stageValues: [
      loteId,
      estabelecimentoId,
      configId ?? null,
      line,
      values.SEQUENCIA || null,
      origemId,
      parseDate(values.ATUALIZACAO),
      values.CONVENIO || null,
      values.CATEGORIA || null,
      values.PLANO || null,
      values.ACOMODACAO || null,
      parseDate(values.ENTRADA),
      parseDate(values.SAIDA),
      parseDate(values.ALTA),
      parseDate(values.DT_DEFINITIVO),
      competencia.value,
      values.SETOR_ENTRADA || null,
      parseDate(values.DT_ETAPA),
      values.ETAPA_CONTA || null,
      values.SETOR_ETAPA || null,
      values.USUARIO_ETAPA || null,
      values.MOTIVO_DEVOLUCAO || null,
      values.STATUS_CONTA || null,
      values.PROTOCOLO || null,
      values.NOME_PROT || null,
      values.TITULO || null,
      atendimento,
      conta,
      values.AUTORIZACAO || null,
      values.MATRICULA || null,
      values.PACIENTE || null,
      values.TIPO_GUIA || null,
      values.CD_PROCED || null,
      values.PROCEDIMENTO || null,
      values.MEDICO || null,
      valorConta,
      statusValidacao,
      warnings.join(",") || null,
      rowHash,
    ],
  };
}

const STAGE_COLUMNS = [
  "loteId", "estabelecimentoId", "configId", "linhaArquivo", "sequencia", "origemId",
  "origemAtualizadaEm", "convenio", "categoria", "plano", "acomodacao", "entrada", "saida",
  "alta", "dataDefinitivo", "competencia", "setorEntrada", "dataEtapa", "etapaConta",
  "setorEtapa", "usuarioEtapa", "motivoDevolucao", "statusConta", "protocolo",
  "nomeProtocolo", "titulo", "atendimento", "conta", "autorizacao", "matricula", "paciente",
  "tipoGuia", "codigoProcedimento", "procedimento", "medico", "valorConta",
  "statusValidacao", "erroValidacao", "hashConteudo",
] as const;

async function flushBatch(connection: PoolConnection, stageRows: StageValues[], quarantineRows: StageValues[]) {
  if (stageRows.length > 0) {
    await connection.query(
      `INSERT INTO tasy_atendimentos_staging (${STAGE_COLUMNS.map((column) => `\`${column}\``).join(",")}) VALUES ?`,
      [stageRows],
    );
    stageRows.length = 0;
  }
  if (quarantineRows.length > 0) {
    await connection.query(
      `INSERT INTO tasy_integracao_quarentena
       (loteId, estabelecimentoId, linhaArquivo, codigoErro, detalhe, referenciaHash)
       VALUES ?`,
      [quarantineRows],
    );
    quarantineRows.length = 0;
  }
}

export async function publishTasyLot(
  connection: PoolConnection,
  loteId: number,
  estabelecimentoId: number,
  replaceSnapshot: boolean,
  allowLargeSnapshotReduction = false,
  deadlineAtMs?: number,
): Promise<{ totalAccounts: number; publishedAccounts: number; totalValue: number }> {
  assertTasyImportWithinDeadline(deadlineAtMs);
  await connection.beginTransaction();
  try {
    const [establishmentRows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE`,
      [estabelecimentoId],
    );
    if (!establishmentRows[0]) throw new Error("Estabelecimento não encontrado para publicação Tasy.");

    const [lotRows] = await connection.query<RowDataPacket[]>(`
      SELECT id, status
      FROM tasy_integracao_lotes
      WHERE id = ? AND estabelecimentoId = ?
      LIMIT 1
      FOR UPDATE
    `, [loteId, estabelecimentoId]);
    if (!lotRows[0]) throw new Error("Lote Tasy não encontrado nesta unidade.");
    if (!['validado', 'publicado'].includes(String(lotRows[0].status))) {
      throw new Error("Somente lotes validados podem ser publicados.");
    }

    const [summary] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS totalAccounts, COALESCE(SUM(valorConta), 0) AS totalValue
      FROM (
        SELECT valorConta,
          ROW_NUMBER() OVER (
            PARTITION BY origemId
            ORDER BY origemAtualizadaEm DESC, dataEtapa DESC,
                     CAST(COALESCE(NULLIF(sequencia, ''), '0') AS UNSIGNED) DESC,
                     linhaArquivo DESC
          ) AS rn
        FROM tasy_atendimentos_staging
        WHERE loteId = ? AND estabelecimentoId = ? AND statusValidacao != 'rejeitado'
      ) latest
      WHERE rn = 1
    `, [loteId, estabelecimentoId]);

    const totalAccounts = Number(summary[0]?.totalAccounts || 0);
    const totalValue = Number(summary[0]?.totalValue || 0);
    if (totalAccounts === 0) throw new Error("O lote não contém contas válidas para publicação.");
    assertTasyImportWithinDeadline(deadlineAtMs);

    if (replaceSnapshot) {
      const [activeSummary] = await connection.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS total
        FROM atendimentos_unificados
        WHERE estabelecimentoId = ?
          AND origemSistema IN ('tasy', 'tasy_hemolabor')
          AND ativoNaFonte = 1
      `, [estabelecimentoId]);
      const activeAccounts = Number(activeSummary[0]?.total || 0);
      if (!allowLargeSnapshotReduction && !isTasySnapshotCoverageSafe(activeAccounts, totalAccounts)) {
        const coverage = activeAccounts > 0 ? (totalAccounts / activeAccounts) * 100 : 100;
        throw new Error(
          `Publicação bloqueada: o CSV contém ${totalAccounts} contas, apenas ${coverage.toFixed(1)}% das ${activeAccounts} contas ativas. Confirme que é um snapshot completo ou faça a carga incremental.`,
        );
      }
    }

    if (replaceSnapshot) {
      await connection.execute(
        `UPDATE atendimentos_unificados
         SET ativoNaFonte = 0, atualizadoEm = NOW()
         WHERE estabelecimentoId = ?
           AND origemSistema IN ('tasy', 'tasy_hemolabor')
           AND ativoNaFonte = 1`,
        [estabelecimentoId],
      );
    }

    await connection.execute(`
      INSERT INTO atendimentos_unificados (
        origemSistema, origemId, estabelecimentoId, configId, ultimoLoteId,
        origemAtualizadaEm, statusConta, ativoNaFonte, hashConteudo,
        numero_atendimento, codigo_saida, convenio, paciente, caracter_atendimento,
        data_entrada, data_saida, tipo_atendimento, descricao_atendimento,
        codigo_servico, codigo_procedimento, procedimentoDescricao, destino_conta,
        dsCategoria, dsPlano, competencia, referencia, protTasy, nomeProtocolo,
        protConv, dtEntrega, protStatus, titulo, dtTitulo, dsSetorEntrada,
        etapaConta, setorEtapa, dtEtapa, userEtapa, motivoDevolucao, conta,
        autorizacao, valorConta, matricula, medicoResp, codServico, centroCusto,
        dataSincronizacao, criadoEm, atualizadoEm
      )
      SELECT
        'tasy', origemId, estabelecimentoId, configId, loteId,
        origemAtualizadaEm, statusConta, 1, hashConteudo,
        atendimento, statusConta, convenio, paciente, acomodacao,
        entrada, saida, tipoGuia, procedimento,
        codigoProcedimento, codigoProcedimento, procedimento, setorEtapa,
        categoria, plano, competencia, competencia, protocolo, nomeProtocolo,
        protocolo, dataDefinitivo, statusConta, titulo, NULL, setorEntrada,
        etapaConta, setorEtapa, dataEtapa, usuarioEtapa, motivoDevolucao, conta,
        autorizacao, valorConta, matricula, medico, codigoProcedimento, setorEtapa,
        NOW(), NOW(), NOW()
      FROM (
        SELECT s.*,
          ROW_NUMBER() OVER (
            PARTITION BY origemId
            ORDER BY origemAtualizadaEm DESC, dataEtapa DESC,
                     CAST(COALESCE(NULLIF(sequencia, ''), '0') AS UNSIGNED) DESC,
                     linhaArquivo DESC
          ) AS rn
        FROM tasy_atendimentos_staging s
        WHERE loteId = ? AND estabelecimentoId = ? AND statusValidacao != 'rejeitado'
      ) latest
      WHERE rn = 1
      ON DUPLICATE KEY UPDATE
        configId = VALUES(configId),
        ultimoLoteId = VALUES(ultimoLoteId),
        origemAtualizadaEm = VALUES(origemAtualizadaEm),
        statusConta = VALUES(statusConta),
        ativoNaFonte = 1,
        hashConteudo = VALUES(hashConteudo),
        numero_atendimento = VALUES(numero_atendimento),
        codigo_saida = VALUES(codigo_saida),
        convenio = VALUES(convenio),
        paciente = VALUES(paciente),
        caracter_atendimento = VALUES(caracter_atendimento),
        data_entrada = VALUES(data_entrada),
        data_saida = VALUES(data_saida),
        tipo_atendimento = VALUES(tipo_atendimento),
        descricao_atendimento = VALUES(descricao_atendimento),
        codigo_servico = VALUES(codigo_servico),
        codigo_procedimento = VALUES(codigo_procedimento),
        procedimentoDescricao = VALUES(procedimentoDescricao),
        destino_conta = VALUES(destino_conta),
        dsCategoria = VALUES(dsCategoria),
        dsPlano = VALUES(dsPlano),
        competencia = VALUES(competencia),
        referencia = VALUES(referencia),
        protTasy = VALUES(protTasy),
        nomeProtocolo = VALUES(nomeProtocolo),
        protConv = VALUES(protConv),
        dtEntrega = VALUES(dtEntrega),
        protStatus = VALUES(protStatus),
        titulo = VALUES(titulo),
        dsSetorEntrada = VALUES(dsSetorEntrada),
        etapaConta = VALUES(etapaConta),
        setorEtapa = VALUES(setorEtapa),
        dtEtapa = VALUES(dtEtapa),
        userEtapa = VALUES(userEtapa),
        motivoDevolucao = VALUES(motivoDevolucao),
        conta = VALUES(conta),
        autorizacao = VALUES(autorizacao),
        valorConta = VALUES(valorConta),
        matricula = VALUES(matricula),
        medicoResp = VALUES(medicoResp),
        codServico = VALUES(codServico),
        centroCusto = VALUES(centroCusto),
        dataSincronizacao = NOW(),
        atualizadoEm = NOW()
    `, [loteId, estabelecimentoId]);

    const [published] = await connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS total
      FROM atendimentos_unificados
      WHERE estabelecimentoId = ? AND origemSistema = 'tasy' AND ultimoLoteId = ? AND ativoNaFonte = 1
    `, [estabelecimentoId, loteId]);
    const publishedAccounts = Number(published[0]?.total || 0);
    assertTasyImportWithinDeadline(deadlineAtMs);

    await connection.execute(`
      UPDATE tasy_integracao_lotes
      SET status = 'publicado', totalContas = ?, totalPublicadas = ?,
          valorConsolidado = ?, publicadoEm = NOW(), erroResumo = NULL
      WHERE id = ? AND estabelecimentoId = ?
    `, [totalAccounts, publishedAccounts, totalValue.toFixed(2), loteId, estabelecimentoId]);

    await connection.commit();
    return { totalAccounts, publishedAccounts, totalValue };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function importTasyCsvFile(options: TasyCsvImportOptions): Promise<TasyCsvImportResult> {
  if (!Number.isInteger(options.estabelecimentoId) || options.estabelecimentoId <= 0) {
    throw new Error("Estabelecimento inválido para a importação Tasy.");
  }
  assertTasyImportWithinDeadline(options.deadlineAtMs);
  const stat = await fs.stat(options.filePath);
  const progress: TasyImportProgress = {
    phase: "hash",
    processedRows: 0,
    validRows: 0,
    warningRows: 0,
    rejectedRows: 0,
  };
  options.onProgress?.(progress);
  const fileHash = await hashFile(options.filePath);
  assertTasyImportWithinDeadline(options.deadlineAtMs);

  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  const connection = await pool.getConnection();
  let loteId = 0;

  try {
    let reusableLot: RowDataPacket | undefined;
    let validatedLotToPublish: RowDataPacket | undefined;
    await connection.beginTransaction();
    try {
      // O lock da unidade impede dois CSVs concorrentes de iniciarem snapshots em ordem indefinida.
      const [establishmentRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE`,
        [options.estabelecimentoId],
      );
      if (!establishmentRows[0]) throw new Error("Estabelecimento não encontrado para a importação Tasy.");

      if (options.configId) {
        const [configRows] = await connection.query<RowDataPacket[]>(`
          SELECT id
          FROM query_configuracoes
          WHERE id = ? AND estabelecimentoId = ?
          LIMIT 1
        `, [options.configId, options.estabelecimentoId]);
        if (!configRows[0]) throw new Error("Configuração Tasy não pertence ao estabelecimento selecionado.");
      }

      await connection.execute(`
        UPDATE tasy_integracao_lotes
        SET status = 'erro', erroResumo = 'Importação interrompida; lote liberado para retomada.', atualizadoEm = NOW()
        WHERE estabelecimentoId = ? AND status = 'processando'
          AND atualizadoEm < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      `, [options.estabelecimentoId]);

      const [existing] = await connection.query<RowDataPacket[]>(`
        SELECT id, status, totalLinhas, totalValidas, totalAvisos, totalRejeitadas,
               totalContas, totalPublicadas, valorConsolidado,
               TIMESTAMPDIFF(MINUTE, atualizadoEm, NOW()) AS minutosSemAtualizacao
        FROM tasy_integracao_lotes
        WHERE estabelecimentoId = ? AND arquivoHash = ?
        LIMIT 1
        FOR UPDATE
      `, [options.estabelecimentoId, fileHash]);

      const lot = existing[0];
      if (lot && (lot.status === "publicado" || (lot.status === "validado" && !options.publish))) {
        reusableLot = lot;
        loteId = Number(lot.id);
      } else if (lot && lot.status === "validado" && options.publish) {
        validatedLotToPublish = lot;
        loteId = Number(lot.id);
      } else {
        const [otherProcessing] = await connection.query<RowDataPacket[]>(`
          SELECT id FROM tasy_integracao_lotes
          WHERE estabelecimentoId = ? AND status = 'processando'
            AND id != COALESCE(?, 0)
            AND atualizadoEm >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
          LIMIT 1
        `, [options.estabelecimentoId, lot?.id ?? null]);
        if (otherProcessing[0]) {
          throw new Error("Já existe uma importação Tasy em processamento para este estabelecimento.");
        }

        if (lot && lot.status === "processando" && Number(lot.minutosSemAtualizacao || 0) < 30) {
          throw new Error("Este mesmo arquivo já está em processamento. Aguarde a conclusão pelo histórico de lotes.");
        }

        if (lot) {
          loteId = Number(lot.id);
          await connection.execute(`DELETE FROM tasy_integracao_quarentena WHERE loteId = ?`, [loteId]);
          await connection.execute(`DELETE FROM tasy_atendimentos_staging WHERE loteId = ?`, [loteId]);
          await connection.execute(`
            UPDATE tasy_integracao_lotes
            SET configId = ?, arquivoNome = ?, arquivoTamanho = ?, status = 'processando',
                totalLinhas = 0, totalValidas = 0, totalAvisos = 0, totalRejeitadas = 0,
                totalContas = 0, totalPublicadas = 0, valorConsolidado = 0,
                erroResumo = NULL, criadoPor = ?, iniciadoEm = NOW(), validadoEm = NULL,
                publicadoEm = NULL, atualizadoEm = NOW()
            WHERE id = ? AND estabelecimentoId = ?
          `, [options.configId ?? null, options.fileName.slice(0, 255), stat.size, options.userId, loteId, options.estabelecimentoId]);
        } else {
          const [insertLot] = await connection.execute<any>(`
            INSERT INTO tasy_integracao_lotes
              (estabelecimentoId, configId, arquivoNome, arquivoHash, arquivoTamanho, status, criadoPor)
            VALUES (?, ?, ?, ?, ?, 'processando', ?)
          `, [
            options.estabelecimentoId,
            options.configId ?? null,
            options.fileName.slice(0, 255),
            fileHash,
            stat.size,
            options.userId,
          ]);
          loteId = Number(insertLot.insertId);
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    if (reusableLot) {
      return {
        loteId: Number(reusableLot.id),
        fileHash,
        phase: "completed",
        processedRows: Number(reusableLot.totalLinhas || 0),
        validRows: Number(reusableLot.totalValidas || 0),
        warningRows: Number(reusableLot.totalAvisos || 0),
        rejectedRows: Number(reusableLot.totalRejeitadas || 0),
        totalAccounts: Number(reusableLot.totalContas || 0),
        publishedAccounts: Number(reusableLot.totalPublicadas || 0),
        totalValue: Number(reusableLot.valorConsolidado || 0),
        reusedExistingLot: true,
      };
    }

    if (validatedLotToPublish) {
      progress.phase = "publishing";
      progress.processedRows = Number(validatedLotToPublish.totalLinhas || 0);
      progress.validRows = Number(validatedLotToPublish.totalValidas || 0);
      progress.warningRows = Number(validatedLotToPublish.totalAvisos || 0);
      progress.rejectedRows = Number(validatedLotToPublish.totalRejeitadas || 0);
      options.onProgress?.({ ...progress });
      const published = await publishTasyLot(
        connection,
        loteId,
        options.estabelecimentoId,
        Boolean(options.replaceSnapshot),
        Boolean(options.allowLargeSnapshotReduction),
        options.deadlineAtMs,
      );
      progress.phase = "completed";
      options.onProgress?.({ ...progress });
      return {
        ...progress,
        loteId,
        fileHash,
        totalAccounts: published.totalAccounts,
        publishedAccounts: published.publishedAccounts,
        totalValue: published.totalValue,
        reusedExistingLot: true,
      };
    }

    const stageRows: StageValues[] = [];
    const quarantineRows: StageValues[] = [];
    let headerValidated = false;
    progress.phase = "staging";

    const parser = createReadStream(options.filePath).pipe(parse({
      bom: true,
      delimiter: ",",
      quote: '"',
      relax_column_count: true,
      skip_empty_lines: true,
    }));

    for await (const rawRecord of parser) {
      const record = rawRecord as string[];
      if (!headerValidated) {
        const normalizedHeader = record.map(normalizeTasyHeader);
        if (normalizedHeader.length !== TASY_CSV_HEADERS.length || normalizedHeader.some((value, index) => value !== TASY_CSV_HEADERS[index])) {
          throw new Error("Cabeçalho do CSV Tasy não corresponde ao modelo esperado de 31 colunas.");
        }
        headerValidated = true;
        continue;
      }

      progress.processedRows += 1;
      const parsed = parseStageRow(record, progress.processedRows + 1, loteId, options.estabelecimentoId, options.configId);
      if (parsed.quarantine) {
        progress.rejectedRows += 1;
        quarantineRows.push([
          loteId,
          options.estabelecimentoId,
          parsed.quarantine.line,
          parsed.quarantine.code,
          parsed.quarantine.detail,
          parsed.quarantine.hash,
        ]);
      } else {
        stageRows.push(parsed.stageValues);
        if (parsed.warnings.length > 0) progress.warningRows += 1;
        else progress.validRows += 1;
      }

      if (stageRows.length >= 500 || quarantineRows.length >= 500) {
        assertTasyImportWithinDeadline(options.deadlineAtMs);
        await flushBatch(connection, stageRows, quarantineRows);
      }
      if (progress.processedRows % 25_000 === 0) {
        await connection.execute(`
          UPDATE tasy_integracao_lotes
          SET totalLinhas = ?, totalValidas = ?, totalAvisos = ?, totalRejeitadas = ?, atualizadoEm = NOW()
          WHERE id = ? AND estabelecimentoId = ? AND status = 'processando'
        `, [
          progress.processedRows,
          progress.validRows,
          progress.warningRows,
          progress.rejectedRows,
          loteId,
          options.estabelecimentoId,
        ]);
        options.onProgress?.({ ...progress });
      }
    }
    if (!headerValidated) throw new Error("Arquivo CSV vazio ou sem cabeçalho.");
    assertTasyImportWithinDeadline(options.deadlineAtMs);
    await flushBatch(connection, stageRows, quarantineRows);

    await connection.execute(`
      UPDATE tasy_integracao_lotes
      SET status = 'validado', totalLinhas = ?, totalValidas = ?, totalAvisos = ?,
          totalRejeitadas = ?, validadoEm = NOW(), erroResumo = NULL
      WHERE id = ? AND estabelecimentoId = ?
    `, [
      progress.processedRows,
      progress.validRows,
      progress.warningRows,
      progress.rejectedRows,
      loteId,
      options.estabelecimentoId,
    ]);

    let published = { totalAccounts: 0, publishedAccounts: 0, totalValue: 0 };
    if (options.publish) {
      progress.phase = "publishing";
      options.onProgress?.({ ...progress });
      published = await publishTasyLot(
        connection,
        loteId,
        options.estabelecimentoId,
        Boolean(options.replaceSnapshot),
        Boolean(options.allowLargeSnapshotReduction),
        options.deadlineAtMs,
      );
    }

    progress.phase = "completed";
    options.onProgress?.({ ...progress });
    return {
      ...progress,
      loteId,
      fileHash,
      totalAccounts: published.totalAccounts,
      publishedAccounts: published.publishedAccounts,
      totalValue: published.totalValue,
      reusedExistingLot: false,
    };
  } catch (error) {
    if (loteId > 0) {
      await connection.execute(`
        UPDATE tasy_integracao_lotes
        SET status = 'erro', erroResumo = ?
        WHERE id = ? AND estabelecimentoId = ?
      `, [error instanceof Error ? error.message.slice(0, 2000) : "Erro desconhecido", loteId, options.estabelecimentoId]);
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function listTasyImportLots(estabelecimentoId: number, limit = 20) {
  const pool = await getRawPool();
  if (!pool) return [];
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id, estabelecimentoId, arquivoNome, arquivoHash, arquivoTamanho, status,
           totalLinhas, totalValidas, totalAvisos, totalRejeitadas, totalContas,
           totalPublicadas, valorConsolidado, iniciadoEm, validadoEm, publicadoEm, atualizadoEm
    FROM tasy_integracao_lotes
    WHERE estabelecimentoId = ?
    ORDER BY id DESC
    LIMIT ?
  `, [estabelecimentoId, Math.max(1, Math.min(limit, 100))]);
  return rows;
}

export async function getTasyImportLot(estabelecimentoId: number, loteId: number) {
  const pool = await getRawPool();
  if (!pool) return null;
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id, estabelecimentoId, arquivoNome, arquivoTamanho, status,
           totalLinhas, totalValidas, totalAvisos, totalRejeitadas, totalContas,
           totalPublicadas, valorConsolidado, erroResumo, iniciadoEm, validadoEm,
           publicadoEm, atualizadoEm
    FROM tasy_integracao_lotes
    WHERE id = ? AND estabelecimentoId = ?
    LIMIT 1
  `, [loteId, estabelecimentoId]);
  return rows[0] || null;
}
