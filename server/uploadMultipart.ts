/**
 * Endpoint de upload multipart para arquivos grandes (>16MB).
 * Evita a limitação do tRPC/JSON com base64 que estoura o limite de 32MB do Cloud Run.
 * 
 * POST /api/upload-file
 * - Recebe o arquivo via multipart/form-data
 * - Faz upload direto para S3
 * - Cria/atualiza registro no banco
 * - Dispara processamento em background
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { mkdirSync, promises as fs } from 'node:fs';
import { extname } from 'node:path';
import * as db from './db';
import { storagePut } from './storage';
import { sdk } from './_core/sdk';
import { importTasyCsvFile } from './tasyCsvImportService';
import { hashWarleineFile, reserveWarleineImportJob } from './warleineFaturamentoImportService';
import { encryptWarleineFile } from './warleineFileVault';

const router = Router();

// Configurar multer para armazenar em memória (buffer)
// Limite de 100MB para cobrir qualquer arquivo hospitalar
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const tasyUploadDir = '/tmp/portal-safatle-tasy';
mkdirSync(tasyUploadDir, { recursive: true });
const uploadTasyCsv = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, tasyUploadDir),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${nanoid()}-${sanitizeFilename(file.originalname)}`),
  }),
  limits: { fileSize: 512 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, extname(file.originalname).toLowerCase() === '.csv'),
});

const warleineUploadDir = '/tmp/portal-safatle-warleine';
mkdirSync(warleineUploadDir, { recursive: true });
const uploadWarleineXlsx = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, warleineUploadDir),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${nanoid()}-${sanitizeFilename(file.originalname)}`),
  }),
  limits: { fileSize: 128 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, extname(file.originalname).toLowerCase() === '.xlsx'),
});

type TasyUploadRequest = Request & {
  tasyUploadUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  tasyEstabelecimentoId?: number;
  tasyDeadlineAtMs?: number;
};

type WarleineUploadRequest = Request & {
  warleineUploadUser?: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  warleineEstabelecimentoId?: number;
  warleineDeadlineAtMs?: number;
};

async function authorizeWarleineUpload(req: WarleineUploadRequest, res: Response, next: NextFunction) {
  try {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const estabelecimentoId = Number(req.header('x-estabelecimento-id'));
    if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
      res.status(400).json({ error: 'Informe um estabelecimento válido antes do upload.' });
      return;
    }
    const allowedEstablishment = user.role === 'admin'
      || await db.verificarPermissaoEstabelecimento(user.id, estabelecimentoId, 'gerenciar');
    const allowedModule = user.role === 'admin'
      || await db.verificarAcessoModulo(user.id, estabelecimentoId, 'contaConvenio');
    if (!allowedEstablishment || !allowedModule) {
      res.status(403).json({ error: 'Sem permissão para importar faturamento Warleine nesta unidade.' });
      return;
    }
    req.warleineUploadUser = user;
    req.warleineEstabelecimentoId = estabelecimentoId;
    req.warleineDeadlineAtMs = Date.now() + 13 * 60 * 1000;
    next();
  } catch (error) {
    console.error('[Warleine XLSX] Erro ao autorizar upload:', error);
    res.status(500).json({ error: 'Não foi possível autorizar o upload Warleine.' });
  }
}

async function authorizeTasyUpload(req: TasyUploadRequest, res: Response, next: NextFunction) {
  try {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const estabelecimentoId = Number(req.header('x-estabelecimento-id'));
    if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
      res.status(400).json({ error: 'Informe um estabelecimento válido antes do upload.' });
      return;
    }

    const allowedEstablishment = user.role === 'admin'
      || await db.verificarPermissaoEstabelecimento(user.id, estabelecimentoId, 'gerenciar');
    if (!allowedEstablishment) {
      res.status(403).json({ error: 'Sem permissão para importar dados nesta unidade.' });
      return;
    }
    const allowedModule = user.role === 'admin'
      || await db.verificarAcessoModulo(user.id, estabelecimentoId, 'importacaoTasy');
    if (!allowedModule) {
      res.status(403).json({ error: 'Sem permissão para usar a importação Tasy nesta unidade.' });
      return;
    }

    req.tasyUploadUser = user;
    req.tasyEstabelecimentoId = estabelecimentoId;
    req.tasyDeadlineAtMs = Date.now() + 13 * 60 * 1000;
    next();
  } catch (error) {
    console.error('[Tasy CSV] Erro ao autorizar upload:', error);
    res.status(500).json({ error: 'Não foi possível autorizar o upload Tasy.' });
  }
}

// Sanitizar nome do arquivo
function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

router.post('/api/upload-file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Verificar autenticação via SDK (mesma lógica do tRPC context)
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch (e) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const userId = user.id;

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Extrair metadados do body
    const {
      nome,
      tipoArquivo,
      direcao,
      convenioId,
      estabelecimentoId,
      dataReferencia,
      dataPagamento,
    } = req.body;

    if (!nome || !tipoArquivo || !direcao || !convenioId) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, tipoArquivo, direcao, convenioId' });
    }

    const buffer = file.buffer;
    const sanitizedNome = sanitizeFilename(nome);
    const convId = parseInt(convenioId);
    const estabId = estabelecimentoId ? parseInt(estabelecimentoId) : undefined;

    console.log(`[UploadMultipart] Recebido: ${nome} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) tipo=${tipoArquivo} direcao=${direcao}`);

    // Verificar se já existe um arquivo com mesmo nome, convênio e estabelecimento
    const arquivoExistente = await db.findArquivoExistente({
      nome,
      convenioId: convId,
      estabelecimentoId: estabId || 0,
      userId,
      direcao,
    });

    let arquivoId: number;
    let s3Url: string;
    let isReimportacao = false;

    const ext = tipoArquivo === "excel" ? "xlsx" : tipoArquivo === "csv" ? "csv" : tipoArquivo;
    const s3Key = `arquivos/${userId}/${nanoid()}-${sanitizedNome}.${ext}`;
    const contentType =
      tipoArquivo === "xml" ? "application/xml"
        : tipoArquivo === "excel" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : tipoArquivo === "csv" ? "text/csv"
        : tipoArquivo === "txt" ? "text/plain"
        : "application/pdf";

    // Upload to S3
    const uploadResult = await storagePut(s3Key, buffer, contentType);
    s3Url = uploadResult.url;

    if (arquivoExistente) {
      // Reimportação
      isReimportacao = true;
      arquivoId = arquivoExistente.id;
      await db.updateArquivo(arquivoId, { s3Url, s3Key, status: 'pendente' });
      console.log(`[UploadMultipart] Reimportação do arquivo ${arquivoId}`);
    } else {
      // Novo arquivo
      const dataRef = dataReferencia ? new Date(dataReferencia) : undefined;
      const dataPag = dataPagamento ? new Date(dataPagamento) : undefined;
      const result = await db.createArquivo({
        nome,
        tipoArquivo,
        direcao,
        convenioId: convId,
        estabelecimentoId: estabId || null,
        userId,
        s3Url,
        s3Key,
        dataReferencia: dataRef,
        dataPagamento: dataPag,
      });
      arquivoId = result.id;
      console.log(`[UploadMultipart] Novo arquivo criado: ${arquivoId}`);
    }

    // Para arquivos retornados (Excel/CSV), delegar processamento em background
    if (direcao === 'retornado' && (tipoArquivo === 'excel' || tipoArquivo === 'csv')) {
      // Excluir dados antigos se reimportação
      if (isReimportacao) {
        await db.deleteRecebimentosExcelByArquivo(arquivoId);
        await db.deleteDemonstrativoByArquivo(arquivoId);
      }

      // Marcar como processando
      await db.updateArquivoStatus(arquivoId, "processando");
      await db.updateArquivoProgresso(arquivoId, 5, 0);

      // Disparar processamento em background
      const port = process.env.PORT || '3000';
      const internalUrl = `http://localhost:${port}/api/internal/process-file`;
      const secret = process.env.JWT_SECRET || 'internal-process-secret';

      fetch(internalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivoId, secret }),
      }).catch(err => {
        console.error('[UploadMultipart] Erro ao disparar processamento:', err);
        db.updateArquivoStatus(arquivoId, "erro").catch(() => {});
      });

      console.log(`[UploadMultipart] Background processing disparado para ${arquivoId}`);
    } else if (direcao === 'retornado' && tipoArquivo === 'xml') {
      // XML retornado - também background
      await db.updateArquivoStatus(arquivoId, "processando");
      await db.updateArquivoProgresso(arquivoId, 5, 0);

      const port = process.env.PORT || '3000';
      const internalUrl = `http://localhost:${port}/api/internal/process-file`;
      const secret = process.env.JWT_SECRET || 'internal-process-secret';

      fetch(internalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivoId, secret }),
      }).catch(err => {
        console.error('[UploadMultipart] Erro ao disparar processamento XML:', err);
        db.updateArquivoStatus(arquivoId, "erro").catch(() => {});
      });
    } else if (direcao === 'enviado') {
      // Arquivo de envio - background
      await db.updateArquivoStatus(arquivoId, "processando");
      await db.updateArquivoProgresso(arquivoId, 5, 0);

      const port = process.env.PORT || '3000';
      const internalUrl = `http://localhost:${port}/api/internal/process-file`;
      const secret = process.env.JWT_SECRET || 'internal-process-secret';

      fetch(internalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivoId, secret }),
      }).catch(err => {
        console.error('[UploadMultipart] Erro ao disparar processamento envio:', err);
        db.updateArquivoStatus(arquivoId, "erro").catch(() => {});
      });
    }

    res.json({
      success: true,
      id: arquivoId,
      s3Url,
      reimportado: isReimportacao,
      processandoEmBackground: true,
    });
  } catch (error: any) {
    console.error('[UploadMultipart] Erro:', error);
    res.status(500).json({ error: error.message || 'Erro interno no upload' });
  }
});

router.post(
  '/api/tasy/importar-csv',
  (req, res, next) => {
    // O lote piloto de 272 MB concluiu em cerca de quatro minutos; o limite da
    // hospedagem é de 15 minutos. O timeout precisa ser aplicado antes do multer.
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
  },
  authorizeTasyUpload,
  uploadTasyCsv.single('file'),
  async (req: TasyUploadRequest, res: Response) => {
  let tempPath = req.file?.path;
  try {
    const user = req.tasyUploadUser;
    const estabelecimentoId = req.tasyEstabelecimentoId;
    const configId = req.body.configId ? Number(req.body.configId) : null;
    const validConfigId = typeof configId === 'number' && Number.isInteger(configId) && configId > 0 ? configId : null;
    const substituirSnapshot = req.body.substituirSnapshot === 'true';
    const confirmarSubstituicao = req.body.confirmarSubstituicao === 'true';
    if (!req.file || !tempPath) return res.status(400).json({ error: 'Selecione um arquivo CSV.' });
    if (!user || !estabelecimentoId) {
      await fs.unlink(tempPath).catch(() => undefined);
      return res.status(401).json({ error: 'Autorização do upload não encontrada.' });
    }
    if (Number(req.body.estabelecimentoId) !== estabelecimentoId) {
      await fs.unlink(tempPath).catch(() => undefined);
      return res.status(400).json({ error: 'A unidade do formulário diverge da autorização do upload.' });
    }
    if (substituirSnapshot && !confirmarSubstituicao) {
      await fs.unlink(tempPath).catch(() => undefined);
      return res.status(400).json({ error: 'Confirme explicitamente que o arquivo representa o snapshot completo da unidade.' });
    }

    const originalName = req.file.originalname;
    const processingPath = tempPath;
    tempPath = undefined;
    try {
      const result = await importTasyCsvFile({
        filePath: processingPath,
        fileName: originalName,
        estabelecimentoId,
        userId: user.id,
        configId: validConfigId,
        publish: true,
        replaceSnapshot: substituirSnapshot,
        deadlineAtMs: req.tasyDeadlineAtMs,
        onProgress: (progress) => {
          if (progress.processedRows > 0 && progress.processedRows % 100_000 === 0) {
            console.log(`[Tasy CSV] estabelecimento=${estabelecimentoId} fase=${progress.phase} linhas=${progress.processedRows}`);
          }
        },
      });
      return res.status(200).json({
        success: true,
        processandoEmBackground: false,
        loteId: result.loteId,
        reutilizado: result.reusedExistingLot,
        totalContas: result.totalAccounts,
        totalPublicadas: result.publishedAccounts,
        message: result.reusedExistingLot
          ? 'Este arquivo já havia sido processado; o lote existente foi reutilizado.'
          : 'CSV validado e publicado com sucesso.',
      });
    } finally {
      await fs.unlink(processingPath).catch(() => undefined);
    }
  } catch (error: any) {
    if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
    console.error('[Tasy CSV] Erro ao receber arquivo:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Erro interno no upload Tasy.' });
  }
});

router.post(
  '/api/warleine/importar-faturamento',
  (req, res, next) => {
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
  },
  authorizeWarleineUpload,
  uploadWarleineXlsx.single('file'),
  async (req: WarleineUploadRequest, res: Response) => {
    let tempPath = req.file?.path;
    try {
      const user = req.warleineUploadUser;
      const estabelecimentoId = req.warleineEstabelecimentoId;
      if (!req.file || !tempPath) return res.status(400).json({ error: 'Selecione um arquivo XLSX do Warleine.' });
      if (!user || !estabelecimentoId) {
        await fs.unlink(tempPath).catch(() => undefined);
        return res.status(401).json({ error: 'Autorização do upload não encontrada.' });
      }
      if (Number(req.body.estabelecimentoId) !== estabelecimentoId) {
        await fs.unlink(tempPath).catch(() => undefined);
        return res.status(400).json({ error: 'A unidade do formulário diverge da autorização do upload.' });
      }
      if (req.body.confirmarSubstituicao !== 'true') {
        await fs.unlink(tempPath).catch(() => undefined);
        return res.status(400).json({ error: 'Confirme que o arquivo substitui as competências nele contidas.' });
      }

      const processingPath = tempPath;
      const fileHash = await hashWarleineFile(processingPath);
      const storageKey = `warleine-faturamento/${estabelecimentoId}/${fileHash}.bin`;
      const encryptedFile = encryptWarleineFile(await fs.readFile(processingPath));
      await storagePut(storageKey, encryptedFile, 'application/octet-stream');
      const job = await reserveWarleineImportJob({
        estabelecimentoId,
        userId: user.id,
        fileName: req.file.originalname,
        fileHash,
        fileSize: req.file.size,
        storageKey,
      });
      await fs.unlink(processingPath).catch(() => undefined);
      tempPath = undefined;
      return res.status(job.status === 'publicado' ? 200 : 202).json({
        success: true,
        processandoEmBackground: job.status !== 'publicado',
        loteId: job.loteId,
        reutilizado: job.reusedExistingLot,
        status: job.status,
        message: job.status === 'publicado'
          ? 'Este arquivo já havia sido publicado; o lote existente foi reutilizado.'
          : 'Arquivo recebido com segurança e enfileirado para validação e publicação.',
      });
    } catch (error: any) {
      if (tempPath) await fs.unlink(tempPath).catch(() => undefined);
      console.error('[Warleine XLSX] Erro ao receber arquivo:', error?.message || error);
      return res.status(500).json({ error: error?.message || 'Erro interno no upload Warleine.' });
    }
  },
);

export { router as uploadMultipartRouter };
