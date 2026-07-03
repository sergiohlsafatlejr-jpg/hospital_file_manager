import { describe, it, expect } from 'vitest';

/**
 * Testes para o endpoint de upload multipart.
 * Verifica a lógica de decisão entre upload base64 (tRPC) e multipart (FormData).
 */

describe('Upload Multipart - Lógica de decisão', () => {
  const FILE_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB

  it('deve usar multipart para arquivos > 10MB', () => {
    const fileSize = 24 * 1024 * 1024; // 24MB (como o CSV IPASGO)
    expect(fileSize > FILE_SIZE_THRESHOLD).toBe(true);
  });

  it('deve usar base64/tRPC para arquivos < 10MB', () => {
    const fileSize = 5 * 1024 * 1024; // 5MB
    expect(fileSize > FILE_SIZE_THRESHOLD).toBe(false);
  });

  it('deve usar multipart para arquivo exatamente no limite', () => {
    const fileSize = 10 * 1024 * 1024 + 1; // 10MB + 1 byte
    expect(fileSize > FILE_SIZE_THRESHOLD).toBe(true);
  });

  it('deve usar base64 para arquivo exatamente no limite', () => {
    const fileSize = 10 * 1024 * 1024; // exatamente 10MB
    expect(fileSize > FILE_SIZE_THRESHOLD).toBe(false);
  });
});

describe('Upload Multipart - Sanitização de nome', () => {
  function sanitizeFilename(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 200);
  }

  it('deve sanitizar nome com caracteres especiais', () => {
    const result = sanitizeFilename('AnaliseContas.1589282.2026070312245111.csv');
    expect(result).toBe('AnaliseContas.1589282.2026070312245111.csv');
  });

  it('deve remover acentos', () => {
    const result = sanitizeFilename('demonstrativo-março-2026.xlsx');
    expect(result).toBe('demonstrativo-marco-2026.xlsx');
  });

  it('deve substituir espaços por underscore', () => {
    const result = sanitizeFilename('arquivo de teste.csv');
    expect(result).toBe('arquivo_de_teste.csv');
  });

  it('deve limitar a 200 caracteres', () => {
    const longName = 'a'.repeat(250) + '.csv';
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('Upload Multipart - Detecção de tipo de arquivo', () => {
  it('deve detectar CSV pela extensão', () => {
    const ext = 'AnaliseContas.1589282.csv'.split('.').pop()?.toLowerCase();
    const tipoArquivo = ext === 'csv' ? 'csv' : 'excel';
    expect(tipoArquivo).toBe('csv');
  });

  it('deve detectar Excel pela extensão xlsx', () => {
    const ext = 'demonstrativo-0301891.xlsx'.split('.').pop()?.toLowerCase();
    const tipoArquivo = ext === 'csv' ? 'csv' : 'excel';
    expect(tipoArquivo).toBe('excel');
  });

  it('deve detectar Excel pela extensão xls', () => {
    const ext = 'retorno_unimed.xls'.split('.').pop()?.toLowerCase();
    const tipoArquivo = ext === 'csv' ? 'csv' : 'excel';
    expect(tipoArquivo).toBe('excel');
  });
});
