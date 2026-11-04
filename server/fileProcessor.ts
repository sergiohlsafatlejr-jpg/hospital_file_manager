/**
 * Processador de arquivos assíncrono com auto-continuação.
 * 
 * Estratégia para Cloud Run (180s timeout, 512 MiB RAM):
 * 
 * 1. O endpoint tRPC "reprocessar" dispara POST /api/internal/process-file
 *    sem await e retorna imediato ao frontend.
 * 
 * 2. A rota interna processa o arquivo COMPLETO em uma única request,
 *    usando o parser streaming (xlsx-stream-reader) que consome apenas ~94 MB.
 *    Os INSERTs são feitos inline durante o streaming (sem acumular dados).
 * 
 * 3. Se o processamento falhar por qualquer motivo, o status é marcado como "erro".
 * 
 * Otimização chave: o parser Unimed streaming processa linha por linha,
 * inserindo no banco a cada 500 registros (não acumula 2000).
 * Isso mantém o pico de memória baixo e distribui a carga de I/O.
 */
import { Router } from "express";
import * as db from "./db";
import type {
  InsertFaturamentoTiss,
  InsertRecebimentoExcel,
} from "../drizzle/schema";
import { deveLimparExcelRetorno } from "./retornoUploadDispatch";
import { resolveInternalProcessingSecret } from "./internalFileDispatch";
import {
  GLOSA_MANUAL_NO_ORIGINAL_MESSAGE,
  isGlosaManualOriginName,
} from "../shared/glosaManualOrigin";

const router = Router();

// Log persistente no banco para diagnóstico em produção
async function plog(arquivoId: number, level: string, message: string) {
  try {
    const pool = await db.getRawPool();
    if (pool) {
      await pool.execute(
        "INSERT INTO process_logs (arquivo_id, level, message) VALUES (?, ?, ?)",
        [arquivoId, level, message.substring(0, 5000)]
      );
    }
  } catch (e) {
    // Silenciar erros de log para não interferir no processamento
  }
  console.log(`[PLog:${level}] [${arquivoId}] ${message}`);
}

router.post("/api/internal/process-file", async (req, res) => {
  const {
    arquivoId,
    secret,
    skipContaConvenioSync = false,
    limparDadosAnteriores,
  } = req.body;
  
  // A mesma seleção do emissor, sem derivação ou fallback de chave dedicada inválida.
  let internalSecret: string;
  try {
    internalSecret = resolveInternalProcessingSecret();
  } catch {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (typeof secret !== "string" || secret !== internalSecret) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  if (!arquivoId) {
    return res.status(400).json({ error: "arquivoId is required" });
  }
  
  // PROCESSAMENTO SÍNCRONO: manter a request HTTP ativa durante todo o processamento.
  // No Cloud Run, a instância só permanece viva enquanto há requests HTTP em andamento.
  // Se respondermos imediatamente, o Cloud Run pode reciclar a instância antes do parse terminar.
  // Com o parser streaming (26 MB heap, ~30s), cabe no timeout de 180s.
  try {
    const arquivo = await db.getArquivoById(arquivoId);
    if (!arquivo) {
      await plog(arquivoId, "error", "Arquivo não encontrado no banco");
      await db.updateArquivoStatus(arquivoId, "erro");
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }

    // Recusa esperada, não falha de processamento: não lançar no catch que marca erro.
    // A âncora manual precisa permanecer processada e intacta para retries idempotentes.
    if (isGlosaManualOriginName(arquivo.nome)) {
      return res.status(409).json({ error: GLOSA_MANUAL_NO_ORIGINAL_MESSAGE });
    }

    await plog(arquivoId, "info", "Iniciando processamento");
    await plog(
      arquivoId,
      "info",
      `Baixando arquivo para processamento (direção: ${arquivo.direcao})`
    );
    const downloadController = new AbortController();
    const downloadTimer = setTimeout(() => downloadController.abort(), 60_000);
    let buffer: Buffer;
    try {
      const response = await fetch(arquivo.s3Url, { signal: downloadController.signal });
      if (!response.ok) {
        await plog(
          arquivoId,
          "error",
          `Erro HTTP ${response.status} ao baixar do S3`
        );
        await db.updateArquivoStatus(arquivoId, "erro");
        return res.status(500).json({ error: "Erro ao baixar arquivo do S3" });
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(downloadTimer);
    }
    
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    await plog(
      arquivoId,
      "info",
      `Download concluído: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`
    );
    
    if (arquivo.direcao === "retornado") {
      await processRetornado(
        arquivoId,
        arquivo,
        buffer,
        deveLimparExcelRetorno(limparDadosAnteriores)
      );
      
      // Aplicar padrões de aceite automático de glosa nos itens recém-importados
      try {
        await aplicarAceiteAutomaticoGlosa(
          arquivoId,
          arquivo.convenioId ?? undefined,
          arquivo.estabelecimentoId ?? undefined
        );
      } catch {
        console.error(
          "[FileProcessor] Erro ao aplicar aceite automático."
        );
        await plog(
          arquivoId,
          "info",
          "Aviso: Erro ao aplicar aceite automático de glosa."
        );
      }
    } else {
      await processEnvio(
        arquivoId,
        arquivo,
        buffer,
        Boolean(skipContaConvenioSync)
      );
    }
    
    await plog(arquivoId, "info", "Processamento concluído com sucesso");
    res.json({ success: true, message: "Processing completed" });
  } catch {
    // Não propagar texto de falhas de storage, parser ou banco: ele pode conter
    // detalhes de XML, URL, chave de storage, carteira ou valores.
    await plog(
      arquivoId,
      "error",
      "Processamento interrompido por falha interna"
    );
    try {
      await db.updateArquivoStatus(arquivoId, "erro");
    } catch (e) {
      // ignore
    }
    res.status(500).json({ error: "Processing failed" });
  }
});

async function conciliarRetornoSeAplicavel(
  arquivo: any,
  dataReferencia: Date | undefined
) {
  const competencia = dataReferencia
    ? `${dataReferencia.getUTCFullYear()}-${String(dataReferencia.getUTCMonth() + 1).padStart(2, "0")}`
    : undefined;
  const estabelecimentoId = Number(arquivo.estabelecimentoId);
  const convenioId = Number(arquivo.convenioId);
  if (
    !competencia ||
    !Number.isSafeInteger(estabelecimentoId) ||
    estabelecimentoId <= 0 ||
    !Number.isSafeInteger(convenioId) ||
    convenioId <= 0
  )
    return;
  try {
    const { executarConciliacaoAutomatica } = await import(
      "./faturamentoUnificadoService"
    );
    await executarConciliacaoAutomatica({
      estabelecimentoId,
      competencia,
      convenioId,
    });
  } catch {
    // A importação e o demonstrativo permanecem válidos; a conciliação poderá
    // ser repetida pela tela sem marcar o arquivo como falho.
  }
}

async function processRetornado(
  arquivoId: number,
  arquivo: any,
  buffer: Buffer,
  limparExcel = true
) {
  const nomeInferido = String(arquivo.nome || "").toLowerCase(); const tipoArquivo = arquivo.tipoArquivo; const tipoArquivoEfetivo = tipoArquivo ?? (nomeInferido.endsWith(".xml") ? "xml" : nomeInferido.endsWith(".csv") ? "csv" : nomeInferido.endsWith(".txt") ? "txt" : nomeInferido.endsWith(".xlsx") || nomeInferido.endsWith(".xls") ? "excel" : undefined);
  if (!["xml", "csv", "excel", "txt"].includes(tipoArquivoEfetivo)) {
    await db.updateArquivoStatus(arquivoId, "erro");
    await plog(
      arquivoId,
      "error",
      "Formato de retorno não possui processamento disponível."
    );
    return;
  }
  // Corrigir timezone: extrair apenas a data (YYYY-MM-DD) para evitar que UTC-3 mude o dia
  const dataReferenciaUpload = arquivo.dataReferencia 
    ? new Date(
        new Date(arquivo.dataReferencia).toISOString().split("T")[0] +
          "T12:00:00Z"
      )
    : undefined;
  const dataPagamentoUpload = arquivo.dataPagamento 
    ? new Date(
        new Date(arquivo.dataPagamento).toISOString().split("T")[0] +
          "T12:00:00Z"
      )
    : undefined;
  
  let totalProcessados = 0;
  
  // CSV retornado - detectar formato IPASGO
  if (tipoArquivoEfetivo === "csv") {
    await plog(arquivoId, "info", "Processando CSV retornado.");

    // Bradesco exporta um CSV hierárquico iniciado por "Extrato de Pagamento".
    // Esse formato já possui parser próprio, mas anteriormente não estava ligado
    // ao pipeline e era rejeitado como se todo CSV fosse IPASGO.
    const csvUtf8 = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const isBradesco = csvUtf8.slice(0, 500).includes("Extrato de Pagamento");
    if (isBradesco) {
      const { parseBradescoCSV } = await import("./parsers/parseBradescoCSV");
      const result = parseBradescoCSV(
        csvUtf8,
        arquivoId,
        arquivo.convenioId,
        arquivo.estabelecimentoId || undefined,
        dataReferenciaUpload,
        dataPagamentoUpload
      );

      if (!result.success || result.items.length === 0) {
        await plog(
          arquivoId,
          "error",
          "Bradesco CSV sem itens processáveis."
        );
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }

      await db.deleteRecebimentosExcelByArquivo(arquivoId);
      await db.deleteDemonstrativoByArquivo(arquivoId);
      await db.updateArquivoProgresso(arquivoId, 20, 0, result.items.length);

      const BATCH_SIZE = 1000;
      for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
        const batch = result.items.slice(i, i + BATCH_SIZE);
        const inserted = await db.insertRecebimentosExcelBatch(batch);
        totalProcessados += inserted;
        const progresso = Math.round(
          20 + (totalProcessados / result.items.length) * 60
        );
        await db.updateArquivoProgresso(
          arquivoId,
          Math.min(progresso, 85),
          totalProcessados,
          result.items.length
        );
      }

      const { syncDemonstrativoByArquivo } = await import(
        "./syncDemonstrativo"
      );
      const syncResult = await syncDemonstrativoByArquivo(arquivoId, "excel");
      await plog(
        arquivoId,
        "info",
        `Bradesco CSV: ${result.totalItens} itens / ${result.totalGuias} guias / ${result.totalLotes} lotes; demonstrativo ${syncResult.total}`
      );
      await conciliarRetornoSeAplicavel(arquivo, dataReferenciaUpload);
      await db.updateArquivoStatus(arquivoId, "processado");
      await db.updateArquivoProgresso(
        arquivoId,
        100,
        totalProcessados,
        totalProcessados
      );
      return;
    }
    
    const { decodeIpasgoBuffer, detectIpasgoFormat, parseIpasgoCSV } =
      await import("./parsers/parseIpasgoCSV");
    
    // Decodificar buffer (pode ser UTF-16LE ou ISO-8859-1)
    let csvContent = decodeIpasgoBuffer(buffer);
    
    // Se não detectou como UTF-16LE, tentar ISO-8859-1
    if (!detectIpasgoFormat(csvContent)) {
      csvContent = buffer.toString("latin1");
    }
    
    if (detectIpasgoFormat(csvContent)) {
      await plog(arquivoId, "info", "Formato IPASGO detectado, processando...");
      
      // Excluir dados antigos
      await db.deleteRecebimentosExcelByArquivo(arquivoId);
      await db.deleteDemonstrativoByArquivo(arquivoId);
      
      const result = parseIpasgoCSV(
        csvContent,
        arquivoId,
        arquivo.convenioId,
        arquivo.estabelecimentoId || undefined,
        dataReferenciaUpload,
        dataPagamentoUpload
      );
      
      if (result.success && result.items.length > 0) {
        await plog(
          arquivoId,
          "info",
          `IPASGO parsed: ${result.items.length} itens, ${result.totalGuias} guias, ${result.totalLotes} lotes`
        );
        await db.updateArquivoProgresso(arquivoId, 20, 0, result.items.length);
        
        // Inserir em batches
        const BATCH_SIZE = 1000;
        for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
          const batch = result.items.slice(i, i + BATCH_SIZE);
          const inserted = await db.insertRecebimentosExcelBatch(batch);
          totalProcessados += inserted;
          const progresso = Math.round(
            20 + (totalProcessados / result.items.length) * 60
          );
          await db.updateArquivoProgresso(
            arquivoId,
            Math.min(progresso, 85),
            totalProcessados,
            result.items.length
          );
        }
        
        // Sincronizar demonstrativo
        if (totalProcessados > 0) {
          await db.updateArquivoProgresso(
            arquivoId,
            90,
            totalProcessados,
            totalProcessados
          );
          try {
            const { syncDemonstrativoByArquivo } = await import(
              "./syncDemonstrativo"
            );
            const syncResult = await syncDemonstrativoByArquivo(
              arquivoId,
              "excel"
            );
            await plog(
              arquivoId,
              "info",
              `Demonstrativo sincronizado: ${syncResult.total} itens`
            );
          } catch {
            await plog(
              arquivoId,
              "error",
              "Erro ao sincronizar demonstrativo."
            );
          }
        }
      } else {
        await plog(
          arquivoId,
          "error",
          "IPASGO sem itens processáveis."
        );
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }
    } else {
      // CSV não é IPASGO - tentar parser genérico
      await plog(
        arquivoId,
        "error",
        "CSV não reconhecido como formato IPASGO."
      );
      await db.updateArquivoStatus(arquivoId, "erro");
      return;
    }
    
    await conciliarRetornoSeAplicavel(arquivo, dataReferenciaUpload);
    await db.updateArquivoStatus(arquivoId, "processado");
    await db.updateArquivoProgresso(
      arquivoId,
      100,
      totalProcessados,
      totalProcessados
    );
    await plog(
      arquivoId,
      "info",
      `CSV IPASGO concluído: ${totalProcessados} itens`
    );
    return;
  }

  if (tipoArquivoEfetivo === "txt") {
    // TXT de retorno é um formato explícito (Unimed Cerrado), nunca tratado
    // como planilha por exclusão. A limpeza é limitada ao próprio arquivo.
    await db.deleteRecebimentoTissByArquivo(arquivoId);
    await db.deleteDemonstrativoByArquivo(arquivoId);
    const { parseUnimedCerradoTxt } = await import(
      "./parsers/parseUnimedCerradoTxt"
    );
    const resultadoTxt = parseUnimedCerradoTxt(
      buffer,
      arquivoId,
      arquivo.estabelecimentoId || 0,
      arquivo.convenioId,
      dataReferenciaUpload,
      dataPagamentoUpload
    );
    if (!resultadoTxt.success || resultadoTxt.items.length === 0) {
      await db.updateArquivoStatus(arquivoId, "erro");
      await plog(arquivoId, "error", "TXT de retorno sem itens processáveis.");
      return;
    }
    await db.updateArquivoProgresso(
      arquivoId,
      20,
      0,
      resultadoTxt.items.length
    );
    totalProcessados = await db.insertRecebimentoTiss(
      resultadoTxt.items,
      async (inseridos, total) => {
        await db.updateArquivoProgresso(
          arquivoId,
          Math.round(20 + (inseridos / total) * 60),
          inseridos,
          total
        );
      }
    );
    const { syncDemonstrativoByArquivo } = await import("./syncDemonstrativo");
    await syncDemonstrativoByArquivo(arquivoId, "xml");
    await conciliarRetornoSeAplicavel(arquivo, dataReferenciaUpload);
    await db.updateArquivoStatus(arquivoId, "processado");
    await db.updateArquivoProgresso(
      arquivoId,
      100,
      totalProcessados,
      totalProcessados
    );
    return;
  }
  
  if (tipoArquivoEfetivo === "excel") {
    // Novos IDs Excel não possuem dados anteriores. Reprocessamentos e chamadas
    // antigas continuam limpando; sem índice por arquivo, o DELETE vazio é caro.
    if (limparExcel) {
      await db.deleteRecebimentosExcelByArquivo(arquivoId);
      await db.deleteDemonstrativoByArquivo(arquivoId);
    }
    
    await db.updateArquivoProgresso(arquivoId, 12, 0);
    
    const isLargeFile = buffer.length > 2 * 1024 * 1024;
    
    // Para arquivos grandes com nome "demonstrativo", usar parser streaming Unimed
    let usedUnimedParser = false;
    const isLikelyUnimed = arquivo.nome.toLowerCase().includes("demonstrativo");
    
    if (isLargeFile && isLikelyUnimed) {
      try {
        await plog(
          arquivoId,
          "info",
          `Parser Unimed: arquivo ${(buffer.length / 1024 / 1024).toFixed(1)}MB | Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB | RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`
        );
        
        const { parseUnimedExcelChunked } = await import(
          "./parsers/unimedExcelParser"
        );
        await plog(
          arquivoId,
          "info",
          "Parser importado OK, iniciando parse streaming..."
        );
        
        const CHUNK_SIZE = 500;
        
        const result = await parseUnimedExcelChunked(
          buffer,
          arquivoId,
          arquivo.convenioId,
          dataReferenciaUpload,
          dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined,
          CHUNK_SIZE,
          async (
            records: InsertRecebimentoExcel[],
            chunkIdx: number,
            totalRows: number
          ) => {
            try {
              const inserted = await db.insertRecebimentosExcelBatch(records);
              totalProcessados += inserted;
              const progresso = Math.round(
                12 + (totalProcessados / totalRows) * 73
              );
              await db.updateArquivoProgresso(
                arquivoId,
                Math.min(progresso, 85),
                totalProcessados,
                totalRows
              );
              if (chunkIdx % 10 === 0) {
                await plog(
                  arquivoId,
                  "info",
                  `Chunk ${chunkIdx}: +${inserted} (total: ${totalProcessados}/${totalRows}) | Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`
                );
              }
            } catch (insertErr: any) {
              await plog(
                arquivoId,
                "error",
                `Falha de inserção no chunk ${chunkIdx}: ${records.length} registros.`
              );
              throw insertErr; // Re-throw para parar o processamento
            }
          }
        );
        
        if (result.totalRecords >= 0) {
          usedUnimedParser = true;
          await plog(
            arquivoId,
            "info",
            `Parser concluído: ${result.totalRecords} registros inseridos`
          );
        }
      } catch {
        await plog(
          arquivoId,
          "error",
          "Falha interna no parser Unimed."
        );
        await db.updateArquivoStatus(arquivoId, "erro");
        return;
      }
    }
    
    if (!usedUnimedParser) {
      const {
        parseExcelRecebimentosExcel,
        parseExcelRecebimentosExcelChunked,
      } = await import("./recebimentosExcelParser");
      
      if (isLargeFile) {
        console.log(
          `[FileProcessor] Arquivo grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB) - usando processamento em chunks`
        );
        const CHUNK_SIZE = 500;
        
        const result = await parseExcelRecebimentosExcelChunked(
          buffer,
          arquivoId,
          arquivo.convenioId,
          dataReferenciaUpload,
          dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined,
          CHUNK_SIZE,
          async (
            records: InsertRecebimentoExcel[],
            chunkIdx: number,
            totalRows: number
          ) => {
            const inserted = await db.insertRecebimentosExcelBatch(records);
            totalProcessados += inserted;
            const progresso = Math.round(
              12 + (totalProcessados / totalRows) * 73
            );
            await db.updateArquivoProgresso(
              arquivoId,
              Math.min(progresso, 85),
              totalProcessados,
              totalRows
            );
            console.log(
              `[FileProcessor] Chunk ${chunkIdx}: +${inserted} (total: ${totalProcessados}/${totalRows})`
            );
          }
        );
        
        console.log(
          `[FileProcessor] Excel chunked: ${result.totalRecords} registros`
        );
      } else {
        // ARQUIVO NORMAL (< 2MB)
        const recordsExcel = parseExcelRecebimentosExcel(
          buffer,
          arquivoId,
          arquivo.convenioId,
          dataReferenciaUpload,
          dataPagamentoUpload,
          arquivo.estabelecimentoId || undefined
        );
        
        await db.updateArquivoProgresso(arquivoId, 20, 0, recordsExcel.length);
        console.log(
          `[FileProcessor] Excel parsed: ${recordsExcel.length} registros`
        );
        
        if (recordsExcel.length > 0) {
          totalProcessados = await db.insertRecebimentosExcelBatch(
            recordsExcel,
            async (inserted: number, total: number) => {
            const progresso = Math.round(20 + (inserted / total) * 60);
              await db.updateArquivoProgresso(
                arquivoId,
                progresso,
                inserted,
                total
              );
            }
          );
        }
      }
    }
    
    // Sincronizar demonstrativo
    if (totalProcessados > 0) {
      await db.updateArquivoProgresso(
        arquivoId,
        90,
        totalProcessados,
        totalProcessados
      );
      try {
        const { syncDemonstrativoByArquivo } = await import(
          "./syncDemonstrativo"
        );
        const syncResult = await syncDemonstrativoByArquivo(arquivoId, "excel");
        console.log(
          "[FileProcessor] Demonstrativo sincronizado:",
          syncResult.total,
          "itens"
        );
      } catch {
        console.error(
          "[FileProcessor] Erro ao sincronizar demonstrativo."
        );
      }
    }
  } else {
    // XML de retorno
    await db.deleteRecebimentoTissByArquivo(arquivoId);
    await db.deleteDemonstrativoByArquivo(arquivoId);
    
    const { parseXmlRecebimentoTiss } = await import("./recebimentoTissParser");
    await db.updateArquivoProgresso(arquivoId, 10, 0);
    
    const recebimentoResult = await parseXmlRecebimentoTiss(
      buffer,
      arquivoId,
      arquivo.estabelecimentoId || 0,
      arquivo.convenioId,
      dataReferenciaUpload,
      dataPagamentoUpload
    );
    
    if (
      recebimentoResult &&
      recebimentoResult.success &&
      recebimentoResult.items.length > 0
    ) {
      await db.updateArquivoProgresso(
        arquivoId,
        20,
        0,
        recebimentoResult.items.length
      );
      
      totalProcessados = await db.insertRecebimentoTiss(
        recebimentoResult.items,
        async (inserted: number, total: number) => {
        const progresso = Math.round(20 + (inserted / total) * 60);
          await db.updateArquivoProgresso(
            arquivoId,
            progresso,
            inserted,
            total
          );
        }
      );
      
      // Sincronizar demonstrativo
      try {
        const { syncDemonstrativoByArquivo } = await import(
          "./syncDemonstrativo"
        );
        const syncResult = await syncDemonstrativoByArquivo(arquivoId, "xml");
        console.log(
          "[FileProcessor] Demonstrativo sincronizado:",
          syncResult.total,
          "itens"
        );
      } catch {
        console.error(
          "[FileProcessor] Erro ao sincronizar demonstrativo."
        );
      }
    }
  }
  
  if (totalProcessados > 0)
    await conciliarRetornoSeAplicavel(arquivo, dataReferenciaUpload);
  await db.updateArquivoStatus(arquivoId, "processado");
  await db.updateArquivoProgresso(
    arquivoId,
    100,
    totalProcessados,
    totalProcessados
  );
  console.log(
    `[FileProcessor] Concluído: ${totalProcessados} itens extraídos de arquivo retornado.`
  );
}

async function processEnvio(
  arquivoId: number,
  arquivo: any,
  buffer: Buffer,
  skipContaConvenioSync = false,
  ignorarRoteamentoContextoMedico = false,
  restringirAoEscopoArquivo = false,
  loteClaim?: { id: number; claimToken: string }
) {
  // XMLs de honorários são classificados antes de qualquer DELETE/INSERT
  // financeiro. Honorários puros seguem somente o contexto informativo; XML
  // misto ou ambíguo falha fechado.
  const eXml =
    arquivo.tipoArquivo === "xml" ||
    String(arquivo.nome || "")
      .toLowerCase()
      .endsWith(".xml");
  if (eXml && !ignorarRoteamentoContextoMedico) {
    const { rotearEnvioXmlParaContextoMedico } = await import(
      "./importacaoAutomaticaContextoMedico"
        );
    const roteamento = await rotearEnvioXmlParaContextoMedico(
      {
        id: arquivoId,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: arquivo.estabelecimentoId,
        convenioId: arquivo.convenioId,
      },
      buffer
          );
    if (roteamento.destino === "contexto_informativo") {
      await db.updateArquivoStatus(arquivoId, "processado");
      await db.updateArquivoProgresso(
        arquivoId,
        100,
        roteamento.indexadas + roteamento.jaIndexadas,
        roteamento.indexadas + roteamento.jaIndexadas
      );
      await plog(
        arquivoId,
        "info",
        `XML de honorários associado ao contexto informativo: ${roteamento.indexadas} nova(s), ${roteamento.jaIndexadas} já existente(s)`
      );
      return;
      }
    }
  
  // O parser e a escolha de unidade acontecem antes da primeira exclusão de
  // reimportação. Assim um arquivo inválido ou sem estabelecimento aplicável
  // não remove a versão financeira anterior.
  const { parseFile } = await import("./parsers");
  const parseResult = await parseFile(buffer, arquivo.nome);
  if (!parseResult.success) {
    throw new Error("Falha ao interpretar o arquivo de envio");
  }
  if (parseResult.procedimentos.length === 0) {
    if (!loteClaim) {
      await db.updateArquivoStatus(arquivoId, "processado");
      await db.updateArquivoProgresso(arquivoId, 100, 0, 0);
    }
    await plog(arquivoId, "info", "Arquivo de envio sem itens processáveis");
    return;
  }

  const estabelecimentoPadrao = Number(arquivo.estabelecimentoId);
  if (
    !Number.isSafeInteger(estabelecimentoPadrao) ||
    estabelecimentoPadrao <= 0
  ) {
    throw new Error("Arquivo de envio sem estabelecimento válido");
  }
  if (
    !Number.isSafeInteger(Number(arquivo.convenioId)) ||
    Number(arquivo.convenioId) <= 0
  ) {
    throw new Error("Arquivo de envio sem convênio válido");
  }
  
  // Um prestador só muda a unidade do item se houver vínculo ativo para o mesmo
  // convênio. Sem vínculo, preservamos explicitamente a unidade escolhida no
  // upload; nenhum código é copiado ou inferido entre hospitais.
  const estabelecimentosPorPrestador = new Map<string, number>();
  for (const procedimento of parseResult.procedimentos) {
    const codigo = String(procedimento.codigoPrestadorExecutante || "").trim();
    if (!codigo || estabelecimentosPorPrestador.has(codigo)) continue;
    const vinculo = await db.getPrestadorPorCodigo(
      codigo,
      Number(arquivo.convenioId)
    );
    const estabelecimentoVinculado = Number(vinculo?.estabelecimentoId);
    const usarVinculo =
      vinculo?.ativo === "sim" &&
      Number.isSafeInteger(estabelecimentoVinculado) &&
      estabelecimentoVinculado > 0;
    if (
      restringirAoEscopoArquivo &&
      usarVinculo &&
      estabelecimentoVinculado !== estabelecimentoPadrao
    ) {
      throw new Error("PRESTADOR_FORA_ESCOPO_DO_LOTE");
    }
    estabelecimentosPorPrestador.set(
      codigo,
      usarVinculo ? estabelecimentoVinculado : estabelecimentoPadrao
    );
  }
    
  const { mapTipoDespesaParaTipoItem } = await import("./routers");
  const faturamentoRecords: InsertFaturamentoTiss[] =
    parseResult.procedimentos.map((proc: any, idx: number) => {
      const codigoPrestador = String(
        proc.codigoPrestadorExecutante || ""
      ).trim();
      const estabelecimentoId = codigoPrestador
        ? (estabelecimentosPorPrestador.get(codigoPrestador) ??
          estabelecimentoPadrao)
        : estabelecimentoPadrao;
      return {
      numeroLote: proc.numeroLote || undefined,
      sequencialTransacao: proc.sequencialTransacao || undefined,
      registroAns: proc.registroANS || undefined,
      numeroGuiaPrestador: proc.guiaNumero || undefined,
      numeroGuiaOperadora: proc.numeroGuiaOperadora || undefined,
      senha: proc.senha || undefined,
      carteiraBeneficiario: proc.pacienteCarteirinha || undefined,
      tipoItem: mapTipoDespesaParaTipoItem(proc.tipoDespesa),
      sequencialItem: idx + 1,
      dataExecucao: proc.dataExecucao || undefined,
      codigoTabela: proc.codigoDespesa || undefined,
      codigoItem: proc.codigo,
      descricaoItem: proc.descricao || undefined,
        quantidade: proc.quantidade ? String(proc.quantidade) : "1",
        valorUnitario: proc.valorUnitario
          ? String(proc.valorUnitario)
          : undefined,
      valorFaturado: proc.valorTotal ? String(proc.valorTotal) : undefined,
      nomeProf: proc.nomeMedico || undefined,
      conselhoProf: proc.crmMedico || undefined,
      codigoPrestadorExecutante: proc.codigoPrestadorExecutante || undefined,
        estabelecimentoId,
        arquivoId,
      convenioId: arquivo.convenioId,
      dataReferencia: arquivo.dataReferencia || undefined,
      competencia: arquivo.dataReferencia 
          ? `${new Date(arquivo.dataReferencia).getUTCFullYear()}/${String(new Date(arquivo.dataReferencia).getUTCMonth() + 1).padStart(2, "0")}`
        : undefined,
      };
    });
    
  // A publicação troca somente os itens TISS deste arquivo em uma transação.
  // A projeção Conta Convênio é reconstruída depois por arquivo, lote e
  // competência, sem recalcular ou excluir snapshots de outras versões.
  const totalProcessados = await db.replaceFaturamentoTissByArquivo(
    arquivoId,
    faturamentoRecords,
    loteClaim
  );
  if (!loteClaim) {
    await db.updateArquivoProgresso(
      arquivoId,
      90,
      totalProcessados,
      faturamentoRecords.length,
    );
  }

      if (skipContaConvenioSync) {
    await plog(
      arquivoId,
      "info",
      "Sincronização imediata de Conta Convênio adiada para reconstrução em lote"
    );
      } else {
    const { syncContaConvenioFromFaturamentoTiss } = await import(
      "./syncContaConvenio"
    );
    const estabelecimentosAfetados = [
      ...new Set(
        faturamentoRecords
          .map(registro => Number(registro.estabelecimentoId))
          .filter(id => Number.isSafeInteger(id) && id > 0)
      ),
    ];
    let totalContas = 0;
    for (const estabelecimentoId of estabelecimentosAfetados) {
      const syncResult = await syncContaConvenioFromFaturamentoTiss({
        estabelecimentoId,
        arquivoId,
      });
      totalContas += syncResult.totalContas;
    }
      await plog(
        arquivoId,
      "info",
      `Conta Convênio sincronizada para ${estabelecimentosAfetados.length} unidade(s) e ${totalContas} conta(s)`
      );
      }

    if (!loteClaim) {
      await db.updateArquivoStatus(arquivoId, "processado");
      await db.updateArquivoProgresso(
        arquivoId,
        100,
        totalProcessados,
        faturamentoRecords.length,
      );
    }
  console.log(
    `[FileProcessor] Concluído: ${totalProcessados} itens extraídos de arquivo enviado.`
  );
}

/**
 * Fronteira exclusivamente interna do lote coordenado. O item já foi
 * classificado como hospitalar e seu buffer foi lido do cofre cifrado; portanto
 * não reclassifica nem permite que o vínculo de prestador desloque a unidade.
 * A materialização de Conta Convênio ocorre em fase posterior do lote.
 */
export async function processarArquivoHospitalarDeLote(input: {
  arquivoId: number;
  buffer: Buffer;
  loteClaim: { id: number; claimToken: string };
}) {
  const arquivo = await db.getArquivoById(input.arquivoId);
  if (
    !arquivo ||
    arquivo.tipoArquivo !== "xml" ||
    arquivo.direcao !== "enviado" ||
    !Number.isSafeInteger(Number(arquivo.estabelecimentoId)) ||
    !Number.isSafeInteger(Number(arquivo.convenioId))
  ) {
    throw new Error("ARQUIVO_HOSPITALAR_DE_LOTE_INVALIDO");
  }
  await processEnvio(
    input.arquivoId,
    arquivo,
    input.buffer,
    true,
    true,
    true,
    input.loteClaim
  );
}

/**
 * Aplica padrões de aceite automático de glosa nos itens recém-importados.
 * Verifica a tabela glosas_aceite_automatico e marca os itens correspondentes.
 */
async function aplicarAceiteAutomaticoGlosa(
  arquivoId: number,
  convenioId?: number,
  estabelecimentoId?: number
) {
  const { getDb } = await import("./db");
  const { glosasAceiteAutomatico } = await import("../drizzle/schema");
  const { eq, and, or, isNull, sql } = await import("drizzle-orm");
  
  const database = await getDb();
  if (!database) return;
  
  // Buscar padrões ativos que se aplicam a este convênio/estabelecimento
  const conditions: any[] = [eq(glosasAceiteAutomatico.ativo, "sim")];
  
  // Padrões que se aplicam: sem convênio específico OU com o convênio do arquivo
  // E sem estabelecimento específico OU com o estabelecimento do arquivo
  const padroes = await database
    .select()
    .from(glosasAceiteAutomatico)
    .where(eq(glosasAceiteAutomatico.ativo, "sim"));
  
  if (padroes.length === 0) return;
  
  // Filtrar padrões aplicáveis
  const padroesAplicaveis = padroes.filter(p => {
    // Verificar convênio: null = todos, ou deve bater
    if (p.convenioId && convenioId && p.convenioId !== convenioId) return false;
    // Verificar estabelecimento: null = todos, ou deve bater
    if (
      p.estabelecimentoId &&
      estabelecimentoId &&
      p.estabelecimentoId !== estabelecimentoId
    )
      return false;
    return true;
  });
  
  if (padroesAplicaveis.length === 0) return;
  
  let totalAceitos = 0;
  
  for (const padrao of padroesAplicaveis) {
    const codigoEscapado = padrao.codigoGlosa.replace(/'/g, "''");
    
    // Aplicar na tabela demonstrativo (itens do arquivo recém-importado)
    const sqlDemo = `
      UPDATE demonstrativo 
      SET glosa_aceita = 1, 
          glosa_aceita_por = 'Sistema (Aceite Auto: ${codigoEscapado})', 
          glosa_aceita_em = NOW(),
          valor_recurso = 0,
          recurso_status = 'sem_recurso'
      WHERE arquivo_id = ${arquivoId}
        AND codigo_glosa = '${codigoEscapado}'
        AND (glosa_aceita IS NULL OR glosa_aceita = 0)
        AND valor_glosa > 0
    `;
    
    try {
      const [demoResult] = await database.execute(sql.raw(sqlDemo));
      totalAceitos += (demoResult as any)?.affectedRows || 0;
    } catch (e) {
      // tabela pode não ter arquivo_id, tentar sem
    }
    
    // Aplicar na tabela recebimentos_excel (itens do arquivo recém-importado)
    const sqlExcel = `
      UPDATE recebimentos_excel 
      SET glosa_aceita = 1, 
          glosa_aceita_por = 'Sistema (Aceite Auto: ${codigoEscapado})', 
          glosa_aceita_em = NOW(),
          valor_recurso = 0,
          status_recurso_item = 'aceita'
      WHERE arquivoId = ${arquivoId}
        AND codigo_glosa = '${codigoEscapado}'
        AND (glosa_aceita IS NULL OR glosa_aceita = 0)
        AND (valor_glosa > 0 OR erro_tiss IS NOT NULL)
    `;
    
    try {
      const [excelResult] = await database.execute(sql.raw(sqlExcel));
      totalAceitos += (excelResult as any)?.affectedRows || 0;
    } catch (e) {
      // ignore
    }
  }
  
  if (totalAceitos > 0) {
    console.log(
      `[AceiteAutomatico] ${totalAceitos} itens marcados como aceite automático no arquivo ${arquivoId}`
    );
    await plog(
      arquivoId,
      "info",
      `Aceite automático: ${totalAceitos} itens glosados aceitos automaticamente (${padroesAplicaveis.length} padrões aplicados)`
    );
  }
}

export { router as fileProcessorRouter };
