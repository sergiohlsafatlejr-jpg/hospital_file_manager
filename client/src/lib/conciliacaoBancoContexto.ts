// Apenas preferências de navegação. Nunca armazenar linhas, guias, pacientes,
// valores ou respostas tRPC. A busca livre permanece somente em memória da aba.
export const STATUS_BANCO = ["todos", "candidato", "ambiguo", "sem_candidato", "medico_direto", "dados_incompletos", "misto"] as const;
export type StatusBanco = typeof STATUS_BANCO[number];
export type ContextoBanco = {
  competencia: string;
  convenio: string;
  status: StatusBanco;
  dataPagto: string;
  pagina: number;
  busca: string;
};
type StorageSeguro = Pick<Storage, "getItem" | "setItem">;
const buscasEmMemoria = new Map<string, string>();
const mes = /^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/;
const objeto = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const positivo = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function chaveContextoConciliacao(usuarioId: unknown, estabelecimentoId: number): string | null {
  return positivo(usuarioId) && positivo(estabelecimentoId)
    ? `conciliacao_contexto_v1_${usuarioId}_${estabelecimentoId}` : null;
}
function storageDaAba(): StorageSeguro | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
}
export function paginaBancoValida(value: unknown): number {
  return positivo(value) && (value as number) <= 100000 ? value as number : 1;
}
function normalizarBanco(value: unknown): Omit<ContextoBanco, "busca"> & { buscaAtiva: boolean } | null {
  if (!objeto(value) || value.versao !== 1) return null;
  return {
    competencia: typeof value.competencia === "string" && mes.test(value.competencia) ? value.competencia : "todos",
    convenio: typeof value.convenio === "string" && /^\d+$/.test(value.convenio) && positivo(Number(value.convenio)) ? String(Number(value.convenio)) : "todos",
    status: STATUS_BANCO.includes(value.status as StatusBanco) ? value.status as StatusBanco : "todos",
    dataPagto: value.dataPagto === "mes" || typeof value.dataPagto === "string" && mes.test(value.dataPagto) ? value.dataPagto : "todos",
    pagina: paginaBancoValida(value.pagina),
    buscaAtiva: value.buscaAtiva === true,
  };
}
export function lerFonteConciliacao(chave: string | null, bancoDisponivel: boolean, storage = storageDaAba()): "base" | "banco" {
  if (!chave || !bancoDisponivel) return "base";
  try { return storage?.getItem(`${chave}_fonte`) === "banco" ? "banco" : "base"; } catch { return "base"; }
}
export function salvarFonteConciliacao(chave: string | null, fonte: "base" | "banco", storage = storageDaAba()): void {
  if (!chave) return;
  try { storage?.setItem(`${chave}_fonte`, fonte); } catch { /* Storage bloqueado não pode interromper a tela. */ }
}
export function lerContextoBanco(chave: string | null, storage = storageDaAba()): ContextoBanco | null {
  if (!chave) return null;
  try {
    const raw = storage?.getItem(`${chave}_banco`);
    const salvo = normalizarBanco(raw ? JSON.parse(raw) : null);
    if (!salvo) return null;
    const busca = buscasEmMemoria.get(chave) || "";
    return { competencia: salvo.competencia, convenio: salvo.convenio, status: salvo.status, dataPagto: salvo.dataPagto,
      // Após F5 a busca privada não existe mais; jamais reaproveitar sua página.
      pagina: salvo.buscaAtiva && !busca ? 1 : salvo.pagina, busca };
  } catch { return null; }
}
export function salvarContextoBanco(chave: string | null, contexto: ContextoBanco, storage = storageDaAba()): void {
  if (!chave) return;
  const busca = contexto.busca.trim().slice(0, 100);
  if (busca) buscasEmMemoria.set(chave, busca); else buscasEmMemoria.delete(chave);
  // Limita a memória de texto livre; evicção nunca persiste texto em storage.
  if (buscasEmMemoria.size > 20) buscasEmMemoria.delete(buscasEmMemoria.keys().next().value!);
  const dados = normalizarBanco({ ...contexto, versao: 1, buscaAtiva: Boolean(busca) });
  if (!dados) return;
  try { storage?.setItem(`${chave}_banco`, JSON.stringify({ versao: 1, ...dados })); } catch { /* Apenas preferência, nunca requisito de acesso. */ }
}
export function limparBuscasDeOutrosUsuarios(usuarioId: unknown): void {
  const prefixo = positivo(usuarioId) ? `conciliacao_contexto_v1_${usuarioId}_` : null;
  for (const key of buscasEmMemoria.keys()) if (!prefixo || !key.startsWith(prefixo)) buscasEmMemoria.delete(key);
}
