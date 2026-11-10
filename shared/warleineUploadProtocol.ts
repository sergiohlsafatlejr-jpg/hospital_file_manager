export const WARLEINE_UPLOAD_BASE_PATH = "/api/warleine/uploads";
export const WARLEINE_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const WARLEINE_UPLOAD_MAX_FILE_BYTES = 300 * 1024 * 1024;
export const WARLEINE_UPLOAD_REQUEST_BUDGET_MS = 150_000;

export type WarleineUploadState = "recebendo" | "finalizando" | "erro" | "enfileirado";
export type WarleineUploadStart = {
  estabelecimentoId: number;
  filename: string;
  byteLength: number;
  idempotencyKey: string;
  confirmarSubstituicao: true;
};
export type WarleineUploadStatus = {
  state: WarleineUploadState;
  uploadedIndices: number[];
  totalChunks: number;
  byteLength: number;
  loteId?: number;
  jobStatus?: string;
  recoveryRequired?: boolean;
};
export type WarleineUploadReceipt = {
  loteId: number;
  status: string;
  sessionId: string;
  estabelecimentoId: number;
  success: true;
};
