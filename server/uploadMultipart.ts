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
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import * as db from './db';
import { storagePut } from './storage';
import { sdk } from './_core/sdk';

const router = Router();

// Configurar multer para armazenar em memória (buffer)
// Limite de 100MB para cobrir qualquer arquivo hospitalar
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

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

export { router as uploadMultipartRouter };
