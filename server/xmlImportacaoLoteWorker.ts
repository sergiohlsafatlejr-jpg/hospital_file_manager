import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getRawPool } from "./db";
import { classificarXmlHonorarios } from "./contaHonorariosClassificador";
import { rotearEnvioXmlParaContextoMedico } from "./importacaoAutomaticaContextoMedico";
import { processarArquivoHospitalarDeLote } from "./fileProcessor";
import { syncContaConvenioFromFaturamentoTiss } from "./syncContaConvenio";
import { lerXmlImportacaoProtegido } from "./xmlImportacaoLoteVault";
import { criarServicoContaContextoMedicoParaUsuario } from "./contaContextoMedicoDrizzle";
import { executarComparacaoESalvar } from "./services/comparadorPadroes";

type SqlRow = RowDataPacket & Record<string, unknown>;

type LoteClaim = {
  loteId: number;
  estabelecimentoId: number;
  convenioId: number;
  claimToken: string;
  tentativas: number;
  itens: Array<{
    id: number;
    arquivoId: number;
    storageKey: string;
    sha256: string;
    tamanhoBytes: number;
    tipo: string;
    estado: string;
  }>;
};

const LEASE_MS = 30 * 60_000;
let processing = false;

function numberId(value: unknown): number {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function validarManifestoDoItem(
  item: LoteClaim["itens"][number],
  xml: Buffer
): void {
  const sha256 = createHash("sha256").update(xml).digest("hex");
  if (xml.length !== item.tamanhoBytes || sha256 !== item.sha256) {
    throw new Error("XML_IMPORTACAO_MANIFESTO_DIVERGENTE");
  }
}

async function claimNext(): Promise<LoteClaim | null> {
  const pool = await getRawPool();
  if (!pool) return null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<SqlRow[]>(
      `SELECT id,estabelecimento_id,convenio_id,tentativas
       FROM xml_importacao_lotes
       WHERE (
         (estado='enfileirado' AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= NOW()))
         OR (estado='processando' AND lease_expires_at < NOW())
       )
       ORDER BY COALESCE(proxima_tentativa_em, created_at), id
       LIMIT 1 FOR UPDATE`
    );
    const row = rows[0];
    if (!row) {
      await connection.commit();
      return null;
    }
    const loteId = numberId(row.id);
    const estabelecimentoId = numberId(row.estabelecimento_id);
    const convenioId = numberId(row.convenio_id);
    if (!loteId || !estabelecimentoId || !convenioId)
      throw new Error("XML_IMPORTACAO_CLAIM_INVALID");
    const claimToken = randomUUID().replace(/-/g, "");
    const [claimResult] = await connection.execute(
      `UPDATE xml_importacao_lotes
       SET estado='processando', claim_token=?, claimed_by=?, lease_expires_at=?, heartbeat_em=NOW(),
           iniciado_em=COALESCE(iniciado_em,NOW()), tentativas=tentativas+1, updated_at=NOW()
       WHERE id=?
         AND (
           (estado='enfileirado' AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= NOW()))
           OR (estado='processando' AND lease_expires_at < NOW())
         )`,
      [
        claimToken,
        `portal-${process.pid}`,
        new Date(Date.now() + LEASE_MS),
        loteId,
      ]
    );
    if (
      Number((claimResult as { affectedRows?: number }).affectedRows ?? 0) !== 1
    ) {
      throw new Error("LOTE_CLAIM_CONCORRENTE");
    }
    const [itemRows] = await connection.query<SqlRow[]>(
      `SELECT id,arquivo_id,storage_key,sha256,tamanho_bytes,tipo_classificado,estado
       FROM xml_importacao_itens WHERE lote_id=? ORDER BY ordem FOR UPDATE`,
      [loteId]
    );
    await connection.commit();
    return {
      loteId,
      estabelecimentoId,
      convenioId,
      claimToken,
      tentativas: Number(row.tentativas ?? 0) + 1,
      itens: itemRows.map(item => ({
        id: numberId(item.id),
        arquivoId: numberId(item.arquivo_id),
        storageKey: text(item.storage_key),
        sha256: text(item.sha256),
        tamanhoBytes: Number(item.tamanho_bytes ?? 0),
        tipo: text(item.tipo_classificado),
        estado: text(item.estado),
      })),
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function touch(
  connection: PoolConnection,
  lote: LoteClaim,
  fase: string
) {
  const [result] = await connection.execute(
    `UPDATE xml_importacao_lotes SET fase=?, heartbeat_em=NOW(), lease_expires_at=?, updated_at=NOW()
     WHERE id=? AND claim_token=? AND estado='processando' AND lease_expires_at > NOW()`,
    [fase, new Date(Date.now() + LEASE_MS), lote.loteId, lote.claimToken]
  );
  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function updateItem(
  connection: PoolConnection,
  lote: LoteClaim,
  itemId: number,
  values: {
    estado?: string;
    fase?: string;
    tipo?: string;
    erroCodigo?: string | null;
    erroResumo?: string | null;
    totalItens?: number;
    totalGuias?: number;
  }
) {
  const fields: string[] = [];
  const params: unknown[] = [];
  if (values.estado) {
    fields.push("estado=?");
    params.push(values.estado);
  }
  if (values.fase) {
    fields.push("fase=?");
    params.push(values.fase);
  }
  if (values.tipo) {
    fields.push("tipo_classificado=?");
    params.push(values.tipo);
  }
  if (values.erroCodigo !== undefined) {
    fields.push("erro_codigo=?");
    params.push(values.erroCodigo);
  }
  if (values.erroResumo !== undefined) {
    fields.push("erro_resumo=?");
    params.push(values.erroResumo);
  }
  if (values.totalItens !== undefined) {
    fields.push("total_itens=?");
    params.push(values.totalItens);
  }
  if (values.totalGuias !== undefined) {
    fields.push("total_guias=?");
    params.push(values.totalGuias);
  }
  fields.push(
    "processado_em=CASE WHEN ? IN ('bloqueado','erro','concluido') THEN NOW() ELSE processado_em END",
    "updated_at=NOW()"
  );
  params.push(values.estado ?? "");
  params.push(lote.loteId, itemId, lote.loteId, lote.claimToken);
  const [result] = await connection.execute(
    `UPDATE xml_importacao_itens SET ${fields.join(", ")}
     WHERE lote_id=? AND id=?
       AND EXISTS (
         SELECT 1 FROM xml_importacao_lotes
         WHERE id=? AND claim_token=? AND estado='processando' AND lease_expires_at > NOW()
       )`,
    params
  );
  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function finalizarHonorario(
  connection: PoolConnection,
  lote: LoteClaim,
  itemId: number
) {
  const [result] = await connection.execute(
    `UPDATE xml_importacao_itens
     SET estado=CASE WHEN estado='honorario_indexado' THEN 'concluido' ELSE estado END,
         fase='finalizar', updated_at=NOW()
     WHERE lote_id=? AND id=?
       AND EXISTS (
         SELECT 1 FROM xml_importacao_lotes
         WHERE id=? AND claim_token=? AND estado='processando' AND lease_expires_at > NOW()
       )`,
    [lote.loteId, itemId, lote.loteId, lote.claimToken]
  );
  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function reagendarLote(
  lote: LoteClaim,
  errorCode: string,
  userMessage: string
) {
  const pool = await getRawPool();
  if (!pool) return;
  const terminal = lote.tentativas >= 3;
  if (terminal) {
    await pool.execute(
      `UPDATE xml_importacao_itens i
       INNER JOIN xml_importacao_lotes l ON l.id=i.lote_id
       SET i.estado='erro', i.fase='finalizar', i.erro_codigo='LOTE_TENTATIVAS_ESGOTADAS',
           i.erro_resumo='O lote excedeu as tentativas de processamento e requer nova importação.',
           i.processado_em=NOW(), i.updated_at=NOW()
       WHERE i.lote_id=?
         AND i.estado IN (
           'recebido', 'classificado', 'hospitalar_persistido',
           'conta_materializada', 'honorario_indexado'
         )
         AND l.claim_token=? AND l.estado='processando' AND l.lease_expires_at > NOW()`,
      [lote.loteId, lote.claimToken]
    );
    await pool.execute(
      `UPDATE arquivos a
       INNER JOIN xml_importacao_itens i ON i.arquivo_id=a.id AND i.lote_id=?
       INNER JOIN xml_importacao_lotes l ON l.id=i.lote_id
       SET a.status='erro', a.progresso=100
       WHERE i.estado='erro' AND i.erro_codigo='LOTE_TENTATIVAS_ESGOTADAS'
         AND l.claim_token=? AND l.estado='processando' AND l.lease_expires_at > NOW()`,
      [lote.loteId, lote.claimToken]
    );
  }
  const [result] = await pool.execute(
    `UPDATE xml_importacao_lotes
     SET estado=?, fase=?, erro_codigo=?, erro_resumo=?,
         proxima_tentativa_em=?, concluido_em=CASE WHEN ? THEN NOW() ELSE NULL END,
         claim_token=NULL, claimed_by=NULL, lease_expires_at=NULL, updated_at=NOW()
     WHERE id=? AND claim_token=? AND estado='processando' AND lease_expires_at > NOW()`,
    [
      terminal ? "concluido_com_erros" : "enfileirado",
      terminal ? "finalizar" : "processar_hospitalares",
      errorCode,
      userMessage,
      terminal
        ? null
        : new Date(Date.now() + Math.min(15, lote.tentativas) * 60_000),
      terminal,
      lote.loteId,
      lote.claimToken,
    ]
  );
  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function finalize(lote: LoteClaim) {
  const pool = await getRawPool();
  if (!pool) throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  const [countsRows] = await pool.query<SqlRow[]>(
    `SELECT
      COUNT(*) total,
      SUM(tipo_classificado='hospitalar') hospitalares,
      SUM(tipo_classificado='honorarios') honorarios,
      SUM(estado='bloqueado') bloqueados,
      SUM(estado='erro') erros
     FROM xml_importacao_itens WHERE lote_id=?`,
    [lote.loteId]
  );
  const counts = countsRows[0] ?? {};
  const erroCount = Number(counts.erros || 0);
  const bloqueado = Number(counts.bloqueados || 0);
  const estado = erroCount || bloqueado ? "concluido_com_erros" : "concluido";
  const [finalizeResult] = await pool.execute(
    `UPDATE xml_importacao_lotes
     SET estado=?, fase='finalizar', total_hospitalares=?, total_honorarios=?, total_bloqueados=?, total_erros=?,
         concluido_em=NOW(), claim_token=NULL, claimed_by=NULL, lease_expires_at=NULL, updated_at=NOW()
     WHERE id=? AND claim_token=? AND estado='processando' AND lease_expires_at > NOW()`,
    [
      estado,
      Number(counts.hospitalares || 0),
      Number(counts.honorarios || 0),
      bloqueado,
      erroCount,
      lote.loteId,
      lote.claimToken,
    ]
  );
  if (
    Number((finalizeResult as { affectedRows?: number }).affectedRows ?? 0) !==
    1
  ) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function atualizarArquivoStatus(
  lote: LoteClaim,
  arquivoId: number,
  status: "processado" | "erro"
) {
  const pool = await getRawPool();
  if (!pool) throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  const [result] = await pool.execute(
    `UPDATE arquivos a
     INNER JOIN xml_importacao_itens i ON i.arquivo_id=a.id AND i.lote_id=?
     INNER JOIN xml_importacao_lotes l ON l.id=i.lote_id
     SET a.status=?, a.progresso=100
     WHERE a.id=? AND l.claim_token=? AND l.estado='processando' AND l.lease_expires_at > NOW()`,
    [lote.loteId, status, arquivoId, lote.claimToken]
  );
  if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
    throw new Error("LOTE_LEASE_PERDIDO");
  }
}

async function bloquearClassificadosPorFalhaNoLote(
  connection: PoolConnection,
  lote: LoteClaim,
  classificados: ReadonlyArray<{ item: LoteClaim["itens"][number] }>
) {
  for (const { item } of classificados) {
    await updateItem(connection, lote, item.id, {
      estado: "bloqueado",
      fase: "finalizar",
      erroCodigo: "LOTE_COM_DOCUMENTO_INVALIDO",
      erroResumo:
        "O documento foi bloqueado porque outro XML do mesmo lote não pôde ser validado.",
    });
    await atualizarArquivoStatus(lote, item.arquivoId, "erro");
  }
}

async function analisarContasMaterializadasDoLote(
  connection: PoolConnection,
  lote: LoteClaim,
  arquivoHospitalIds: readonly number[]
) {
  if (!arquivoHospitalIds.length) return;
  try {
    const placeholders = arquivoHospitalIds.map(() => "?").join(", ");
    const [rows] = await connection.query<SqlRow[]>(
      `SELECT numeroConta, arquivoHospitalId, convenioId, numeroLote, competencia
       FROM contas_convenio_resumo
       WHERE estabelecimentoId = ?
         AND origem = 'XML'
         AND arquivoHospitalId IN (${placeholders})`,
      [lote.estabelecimentoId, ...arquivoHospitalIds]
    );
    if (!rows.length) return;

    const servicoContexto = criarServicoContaContextoMedicoParaUsuario(0);
    for (const row of rows) {
      const numeroConta = text(row.numeroConta).trim();
      const arquivoHospitalId = numberId(row.arquivoHospitalId);
      const convenioId = numberId(row.convenioId) || lote.convenioId;
      if (!numeroConta || !arquivoHospitalId || !convenioId) continue;

      const scope = {
        estabelecimentoId: lote.estabelecimentoId,
        convenioId,
        numeroConta,
        arquivoHospitalId,
        numeroLote: text(row.numeroLote).trim(),
        competencia: text(row.competencia).trim(),
      };

      try {
        const contextoMedico = await servicoContexto
          .consultar({ scope })
          .catch(() => undefined);
        await executarComparacaoESalvar(numeroConta, lote.estabelecimentoId, {
          escopoContextoMedico: scope,
          contextoMedico,
        });
      } catch {
        // Falha na análise de uma guia específica não bloqueia a finalização do lote.
      }
    }
  } catch {
    // Análise automática pós-lote é best-effort e nunca impede a publicação do lote.
  }
}

async function executar(lote: LoteClaim): Promise<void> {
  const pool = await getRawPool();
  if (!pool) throw new Error("XML_IMPORTACAO_DATABASE_UNAVAILABLE");
  const connection = await pool.getConnection();
  try {
    await touch(connection, lote, "classificar");
    const classificados: Array<{
      item: LoteClaim["itens"][number];
      tipo: string;
    }> = [];
    for (const item of lote.itens) {
      try {
        const xml = await lerXmlImportacaoProtegido(
          {
            loteId: lote.loteId,
            estabelecimentoId: lote.estabelecimentoId,
            convenioId: lote.convenioId,
            arquivoId: item.arquivoId,
          },
          item.storageKey
        );
        validarManifestoDoItem(item, xml);
        const classification = classificarXmlHonorarios(xml);
        const tipo =
          classification.tipo === "nao_honorarios"
            ? "hospitalar"
            : classification.tipo === "honorarios_puro"
              ? "honorarios"
              : "misto_ou_ambiguo";
        if (tipo === "misto_ou_ambiguo") {
          await updateItem(connection, lote, item.id, {
            estado: "bloqueado",
            fase: "classificar",
            tipo,
            erroCodigo: "XML_MISTO_OU_AMBIGUO",
            erroResumo:
              "O documento mistura estruturas incompatíveis e não foi publicado.",
          });
          await atualizarArquivoStatus(lote, item.arquivoId, "erro");
          continue;
        }
        await updateItem(connection, lote, item.id, {
          estado: "classificado",
          fase: "classificar",
          tipo,
        });
        classificados.push({ item, tipo });
      } catch {
        await updateItem(connection, lote, item.id, {
          estado: "erro",
          fase: "classificar",
          tipo: "invalido",
          erroCodigo: "CLASSIFICACAO_FALHOU",
          erroResumo: "Não foi possível validar a estrutura do documento XML.",
        });
        await atualizarArquivoStatus(lote, item.arquivoId, "erro");
      }
    }

    // Não há publicação parcial quando existe documento inválido/misto: o lote
    // fica visível e auditável, mas nenhuma conta ou fonte médica é associada.
    if (classificados.length !== lote.itens.length) {
      await bloquearClassificadosPorFalhaNoLote(connection, lote, classificados);
      await finalize(lote);
      return;
    }
    const hospitalares = classificados.filter(
      entry => entry.tipo === "hospitalar"
    );
    const honorarios = classificados.filter(
      entry => entry.tipo === "honorarios"
    );
    if (!hospitalares.length) {
      for (const { item } of honorarios) {
        await updateItem(connection, lote, item.id, {
          estado: "bloqueado",
          fase: "classificar",
          erroCodigo: "SNAPSHOT_HOSPITALAR_AUSENTE",
          erroResumo:
            "O XML de honorários aguarda um XML hospitalar no mesmo lote.",
        });
        await atualizarArquivoStatus(lote, item.arquivoId, "erro");
      }
      await finalize(lote);
      return;
    }

    await touch(connection, lote, "processar_hospitalares");
    for (const { item } of hospitalares) {
      try {
        await touch(connection, lote, "processar_hospitalares");
        const xml = await lerXmlImportacaoProtegido(
          {
            loteId: lote.loteId,
            estabelecimentoId: lote.estabelecimentoId,
            convenioId: lote.convenioId,
            arquivoId: item.arquivoId,
          },
          item.storageKey
        );
        validarManifestoDoItem(item, xml);
        await processarArquivoHospitalarDeLote({
          arquivoId: item.arquivoId,
          buffer: xml,
          loteClaim: { id: lote.loteId, claimToken: lote.claimToken },
        });
        await updateItem(connection, lote, item.id, {
          estado: "hospitalar_persistido",
          fase: "processar_hospitalares",
        });
      } catch {
        await updateItem(connection, lote, item.id, {
          estado: "erro",
          fase: "processar_hospitalares",
          erroCodigo: "PUBLICACAO_HOSPITALAR_FALHOU",
          erroResumo:
            "Não foi possível publicar o snapshot hospitalar deste documento.",
        });
        await atualizarArquivoStatus(lote, item.arquivoId, "erro");
        await reagendarLote(
          lote,
          "PUBLICACAO_HOSPITALAR_FALHOU",
          "A publicação do snapshot hospitalar será retomada com segurança."
        );
        return;
      }
    }

    await touch(connection, lote, "materializar_contas");
    await syncContaConvenioFromFaturamentoTiss({
      estabelecimentoId: lote.estabelecimentoId,
      arquivoIds: hospitalares.map(({ item }) => item.arquivoId),
      loteImportacaoId: lote.loteId,
      loteClaim: { id: lote.loteId, claimToken: lote.claimToken },
    });
    for (const { item } of hospitalares) {
      await updateItem(connection, lote, item.id, {
        estado: "conta_materializada",
        fase: "materializar_contas",
      });
    }

    await touch(connection, lote, "processar_honorarios");
    const arquivoHospitalIdsPermitidos = hospitalares.map(
      ({ item }) => item.arquivoId
    );
    for (const { item } of honorarios) {
      try {
        await touch(connection, lote, "processar_honorarios");
        const xml = await lerXmlImportacaoProtegido(
          {
            loteId: lote.loteId,
            estabelecimentoId: lote.estabelecimentoId,
            convenioId: lote.convenioId,
            arquivoId: item.arquivoId,
          },
          item.storageKey
        );
        validarManifestoDoItem(item, xml);
        const result = await rotearEnvioXmlParaContextoMedico(
          {
            id: item.arquivoId,
            tipoArquivo: "xml",
            direcao: "enviado",
            estabelecimentoId: lote.estabelecimentoId,
            convenioId: lote.convenioId,
          },
          xml,
          {},
          {
            arquivoHospitalIdsPermitidos,
            loteImportacaoId: lote.loteId,
            loteClaim: { id: lote.loteId, claimToken: lote.claimToken },
          }
        );
        if (result.destino !== "contexto_informativo")
          throw new Error("NOT_MEDICAL_XML");
        await updateItem(connection, lote, item.id, {
          estado: "honorario_indexado",
          fase: "processar_honorarios",
        });
        await atualizarArquivoStatus(lote, item.arquivoId, "processado");
      } catch {
        await updateItem(connection, lote, item.id, {
          estado: "bloqueado",
          fase: "processar_honorarios",
          erroCodigo: "ASSOCIACAO_MEDICA_NAO_SEGURA",
          erroResumo:
            "O XML médico não possui associação única com os snapshots deste lote.",
        });
        await atualizarArquivoStatus(lote, item.arquivoId, "erro");
      }
    }

    for (const { item } of hospitalares) {
      await updateItem(connection, lote, item.id, {
        estado: "concluido",
        fase: "finalizar",
      });
      await atualizarArquivoStatus(lote, item.arquivoId, "processado");
    }
    for (const { item } of honorarios) {
      await finalizarHonorario(connection, lote, item.id);
    }
    await analisarContasMaterializadasDoLote(
      connection,
      lote,
      arquivoHospitalIdsPermitidos
    );
    await finalize(lote);
  } finally {
    connection.release();
  }
}

/** Executa um lote por vez; pode ser chamado pela rota após armazenar e por um timer de retomada. */
export async function processarProximoLoteXmlImportacao(): Promise<void> {
  if (processing) return;
  processing = true;
  let lote: LoteClaim | null = null;
  try {
    lote = await claimNext();
    if (lote) await executar(lote);
  } catch (error) {
    // O fencing impede que um claimant vencido agende ou altere o lote do novo
    // worker. Demais falhas são retomáveis e nunca deixam publicação parcial.
    if (
      lote &&
      !(error instanceof Error && error.message === "LOTE_LEASE_PERDIDO")
    ) {
      await reagendarLote(
        lote,
        "PROCESSAMENTO_INTERROMPIDO",
        "O processamento será retomado automaticamente com segurança."
      ).catch(() => undefined);
    }
  } finally {
    processing = false;
  }
}

export function dispararProcessamentoLoteXml(): void {
  void processarProximoLoteXmlImportacao();
}

/**
 * Retomada leve para lotes cujo processo foi interrompido. O lease no banco
 * impede duplicidade entre instâncias; o timer não processa arquivos nem cria
 * lote algum quando não há trabalho pendente.
 */
export function initializeXmlImportacaoLoteWorker(): void {
  void processarProximoLoteXmlImportacao();
  const timer = setInterval(
    () => void processarProximoLoteXmlImportacao(),
    60_000
  );
  timer.unref();
}
