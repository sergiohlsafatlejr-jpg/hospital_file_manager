type Dependencias = {
  marcarProcessando: () => Promise<unknown>;
  atualizarProgresso: () => Promise<unknown>;
  disparar: (payload: { arquivoId: number; secret: string; limparDadosAnteriores: boolean }) => Promise<{ ok: boolean; status?: number }>;
  marcarErro: () => Promise<unknown>;
};

/** A conclusão pertence ao worker, não à requisição que apenas o dispara. */
export async function delegarPlanilhaRetorno(
  input: { arquivoId: number; secret: string; reimportacao: boolean; tipoArquivo: "excel" | "csv" },
  deps: Dependencias,
): Promise<void> {
  await deps.marcarProcessando();
  await deps.atualizarProgresso();
  // CSV mantém a limpeza do contrato anterior. Somente um novo Excel pode
  // dispensar a limpeza: esse ID acaba de ser criado e não tem linhas antigas.
  const limparDadosAnteriores = input.reimportacao || input.tipoArquivo !== "excel";
  void deps.disparar({ arquivoId: input.arquivoId, secret: input.secret, limparDadosAnteriores })
    .then(async (response) => {
      if (!response.ok) {
        console.warn("[UploadRetorno] Falha HTTP do worker", { arquivoId: input.arquivoId, status: response.status });
        await deps.marcarErro();
      }
    })
    .catch(async () => {
      console.warn("[UploadRetorno] Falha de despacho ou registro de status", { arquivoId: input.arquivoId });
      await deps.marcarErro();
    })
    .catch(() => {
      console.warn("[UploadRetorno] Falha ao registrar erro do processamento delegado", { arquivoId: input.arquivoId });
    });
}

/** Ausência do sinal ou qualquer valor diferente de false preserva a limpeza. */
export function deveLimparExcelRetorno(sinal: unknown): boolean {
  return sinal !== false;
}
