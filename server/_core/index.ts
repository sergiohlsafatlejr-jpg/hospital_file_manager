import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeJobScheduler } from "./jobScheduler";
import { fileProcessorRouter } from "../fileProcessor";
import { uploadMultipartRouter } from "../uploadMultipart";
import { initializeWarleineImportWorker } from "../warleineFaturamentoWorker";
import { easyLocalAgendamentoHandler } from "../easyLocalAgendamentoCallback";
import { atendimentosHopDiarioCallback } from "../atendimentosHopDiarioCallback";
import { atendimentosHopProdutorRouter } from "../atendimentosHopProdutor";
import { registrarDownloadProntuarioPdf } from "../prontuarioPdfDownload";
import { registrarUploadProntuarioPdf } from "../prontuarioPdfUpload";
import { xmlImportacaoLoteUploadRouter } from "../xmlImportacaoLoteUpload";
import { initializeXmlImportacaoLoteWorker } from "../xmlImportacaoLoteWorker";
import { getRawPool } from "../db";
import { dispatchInternalFileProcessing } from "../internalFileDispatch";
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function ensureInternalProcessingInfrastructure() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const seed =
      process.env.JWT_SECRET ||
      process.env.BUILT_IN_FORGE_API_KEY ||
      process.env.DATABASE_URL ||
      randomBytes(32).toString("hex");
    process.env.JWT_SECRET = createHash("sha256")
      .update(`safatle-internal-dispatch:${seed}`)
      .digest("hex");
  }

  try {
    const pool = await getRawPool();
    if (!pool) return;
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS process_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        arquivo_id INT NOT NULL,
        level VARCHAR(20) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_process_logs_arquivo (arquivo_id)
      )
    `);
    await pool
      .execute(
        "UPDATE convenios SET estabelecimentoId = NULL WHERE estabelecimentoId IS NOT NULL"
      )
      .catch(() => undefined);
  } catch (err) {
    console.warn("[Server] Aviso ao garantir tabela process_logs:", err);
  }
}

async function resumeStuckInitialUploads() {
  try {
    const pool = await getRawPool();
    if (!pool) return;
    const [rows] = (await pool.execute(
      "SELECT id, direcao, tipoArquivo, itensProcessados, totalItens FROM arquivos WHERE status = 'processando' AND COALESCE(progresso, 0) <= 5 AND COALESCE(itensProcessados, 0) = 0 ORDER BY id DESC LIMIT 10"
    )) as any;
    if (!Array.isArray(rows) || rows.length === 0) return;
    for (const row of rows) {
      const arquivoId = Number(row.id);
      if (!Number.isSafeInteger(arquivoId) || arquivoId <= 0) continue;
      await pool
        .execute("DELETE FROM process_logs WHERE arquivo_id = ?", [arquivoId])
        .catch(() => undefined);
      void dispatchInternalFileProcessing({
        arquivoId,
        limparDadosAnteriores: !(
          row.direcao === "retornado" &&
          row.tipoArquivo === "excel" &&
          Number(row.itensProcessados || 0) === 0 &&
          !row.totalItens
        ),
      }).catch(() => undefined);
    }
  } catch (err) {
    console.warn("[Server] Aviso ao retomar uploads iniciais pendentes:", err);
  }
}

async function startServer() {
  await ensureInternalProcessingInfrastructure();
  const app = express();
  // A aplicação fica atrás de exatamente um proxy de borda da plataforma.
  // Não confiar genericamente em faixas privadas impede spoofing por hosts internos.
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Internal file processor route (called by tRPC reprocessar endpoint)
  app.use(fileProcessorRouter);
  // Multipart upload route for large files (>16MB)
  app.use(uploadMultipartRouter);
  // Lote XML coordenado: autentica antes do multipart e publica hospitalar antes de honorários.
  app.use(xmlImportacaoLoteUploadRouter);
  // Callback agendado: identidade cron validada pelo SDK; nunca usa o body para escopo.
  app.post("/api/scheduled/easylocal-importar", easyLocalAgendamentoHandler);
  app.post("/api/scheduled/atendimentos-hop-diario", atendimentosHopDiarioCallback);
  // Produtor Hop só anuncia lotes; sua credencial fixa a unidade no servidor.
  app.use("/api/hop/atendimentos", atendimentosHopProdutorRouter);
  // PDF clínico somente por sessão autenticada; nunca por URL direta de storage.
  registrarUploadProntuarioPdf(app);
  registrarDownloadProntuarioPdf(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort); process.env.PORT = String(port);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    void resumeStuckInitialUploads();
  });

  // Inicializar JobScheduler
  try {
    await initializeJobScheduler();
  } catch (error) {
    console.error("Erro ao inicializar JobScheduler:", error);
  }
  initializeWarleineImportWorker();
  initializeXmlImportacaoLoteWorker();
}

startServer().catch(console.error);
