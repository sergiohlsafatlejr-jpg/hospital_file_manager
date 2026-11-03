// Protocolo público: nunca inclui chaves ou URLs do armazenamento.
export const CONTRATOS_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const CONTRATOS_UPLOAD_MAX_FILE_BYTES = 150 * 1024 * 1024;
export const CONTRATOS_UPLOAD_MAX_BATCH_BYTES = 600 * 1024 * 1024;
export const CONTRATOS_UPLOAD_MAX_BATCH_FILES = 30;
export const CONTRATOS_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const CONTRATOS_UPLOAD_FINALIZE_TIMEOUT_MS = 15 * 60 * 1000;
export const CONTRATOS_UPLOAD_BASE_PATH = "/api/contratos-convenios/upload-sessoes";

export interface ContratosUploadInicio {
  contratoId: number;
  filename: string;
  byteLength: number;
  sha256: string;
  batchId?: string;
  batchTotalBytes?: number;
}
export interface ContratosUploadInicioResposta {
  sessionId: string;
  chunkSize: number;
  maxFileBytes: number;
  maxBatchBytes: number;
}
export type ContratosUploadState =
  | "recebendo" | "finalizando" | "concluido" | "erro" | "expirado" | "interrompido";
export interface ContratosUploadStatus {
  uploadedIndices: number[];
  totalChunks: number;
  state: ContratosUploadState;
  // Falhas/interrupções não são retomadas automaticamente pelo finalizador.
  recoveryRequired?: boolean;
}
export interface ContratosUploadDocumento {
  id: number;
  nomeArquivo: string;
  status: "concluido" | "ocr_necessario";
  paginas: number;
  pontosImportantes: unknown[];
  reutilizado: boolean;
}
export interface ContratosUploadFinalizado {
  success: boolean;
  contratoId: number;
  total: number;
  processados: number;
  documentos: ContratosUploadDocumento[];
}
