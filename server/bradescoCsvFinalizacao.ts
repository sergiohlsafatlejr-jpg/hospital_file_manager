/**
 * Encerramento terminal de extrato inválido. Atualizações de estado são
 * best-effort: indisponibilidade do catálogo não transforma rejeição em sucesso.
 * O chamador deve retornar imediatamente após aguardar esta função.
 */
export async function finalizarCsvBradescoInvalido(ops: {
  marcarErro: () => Promise<unknown>;
  zerarProgresso: () => Promise<unknown>;
}): Promise<{ statusAtualizado: boolean; progressoAtualizado: boolean }> {
  let statusAtualizado = false;
  let progressoAtualizado = false;
  try {
    await ops.marcarErro();
    statusAtualizado = true;
  } catch {
    console.warn('[Upload] Não foi possível registrar a rejeição do CSV Bradesco');
  }
  try {
    await ops.zerarProgresso();
    progressoAtualizado = true;
  } catch {
    console.warn('[Upload] Não foi possível zerar o progresso do CSV Bradesco rejeitado');
  }
  return { statusAtualizado, progressoAtualizado };
}
