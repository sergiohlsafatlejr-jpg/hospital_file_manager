import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { UsuarioHospital } from "./hospitalScope";
import {
  TODOS_SETORES_OPERACIONAIS,
  grupoConsultaSetorFabrica,
  setoresConsultaDoPerfil,
  type SetorOperacionalFabrica,
  type SetorConsultaFabrica,
} from "../shared/fabricaSetores";

export { TODOS_SETORES_OPERACIONAIS };
export type { SetorOperacionalFabrica };

export interface PerfilColaboradorFabrica {
  usuarioId: number;
  usuarioNome: string;
  cargoSetor: string;
  setoresPermitidos: SetorOperacionalFabrica[];
  hospitaisPermitidos: number[];
  verRelatoriosGerenciais: boolean;
  isGestorFabrica: boolean;
}

type DbComExecute = {
  execute(query: unknown): Promise<unknown>;
};

type RegistroPerfilFabrica = {
  usuario_nome?: unknown;
  observacao?: unknown;
};

const MENSAGEM_PERFIL_NAO_VALIDADO =
  "Não foi possível validar seu perfil na Fábrica de Faturamento.";
const MENSAGEM_SETOR_NAO_AUTORIZADO =
  "Seu perfil na Fábrica de Faturamento não possui acesso a este setor.";
const MENSAGEM_HOSPITAL_NAO_AUTORIZADO =
  "Seu perfil na Fábrica não está habilitado para operar contas deste hospital.";

function erroPerfilNaoValidado(): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: MENSAGEM_PERFIL_NAO_VALIDADO,
  });
}

function idPositivoSeguro(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0;
}

function objetoRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function setorOperacionalValido(valor: unknown): valor is SetorOperacionalFabrica {
  return typeof valor === "string"
    && (TODOS_SETORES_OPERACIONAIS as readonly string[]).includes(valor);
}

function validarCargoSetor(valor: unknown): string {
  if (typeof valor !== "string") throw erroPerfilNaoValidado();

  const cargoSetor = valor.trim();
  if (cargoSetor.length < 2 || cargoSetor.length > 120) {
    throw erroPerfilNaoValidado();
  }
  return cargoSetor;
}

function validarSetoresPermitidos(valor: unknown): SetorOperacionalFabrica[] {
  if (!Array.isArray(valor) || !valor.every(setorOperacionalValido)) {
    throw erroPerfilNaoValidado();
  }

  // Uma lista vazia é válida como configuração explícita, mas não autoriza setor algum.
  return [...new Set(valor)];
}

function validarHospitaisPermitidos(valor: unknown): number[] {
  if (!Array.isArray(valor) || !valor.every(idPositivoSeguro)) {
    throw erroPerfilNaoValidado();
  }

  return [...new Set(valor)];
}

/**
 * Interpreta somente o formato canônico persistido em `fabrica_metas.observacao`.
 * Um perfil persistido corrompido nunca recebe permissões por fallback.
 */
export function parsePerfilObservacao(
  raw: string | null | undefined,
  usuarioId: number,
  usuarioNome: string,
): PerfilColaboradorFabrica {
  if (typeof raw !== "string" || !idPositivoSeguro(usuarioId) || typeof usuarioNome !== "string") {
    throw erroPerfilNaoValidado();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw erroPerfilNaoValidado();
  }

  if (!objetoRegistro(parsed)) throw erroPerfilNaoValidado();

  const cargoSetor = validarCargoSetor(parsed.cargoSetor);
  const setoresPermitidos = validarSetoresPermitidos(parsed.setoresPermitidos);
  const hospitaisPermitidos = validarHospitaisPermitidos(parsed.hospitaisPermitidos);
  if (typeof parsed.verRelatoriosGerenciais !== "boolean") {
    throw erroPerfilNaoValidado();
  }

  return {
    usuarioId,
    usuarioNome,
    cargoSetor,
    setoresPermitidos,
    hospitaisPermitidos,
    verRelatoriosGerenciais: parsed.verRelatoriosGerenciais,
    // Gestão da equipe é separada: não neutraliza um perfil operacional salvo.
    isGestorFabrica: false,
  };
}

function nomePerfil(row: RegistroPerfilFabrica, fallback: string): string {
  return typeof row.usuario_nome === "string" && row.usuario_nome.trim()
    ? row.usuario_nome.trim()
    : fallback;
}

/**
 * Retorna `null` exclusivamente quando não há linha de perfil para o usuário.
 * Problemas para ler ou interpretar uma linha existente são negados, sem expor
 * detalhes de banco ou do JSON ao colaborador.
 */
export async function obterPerfilPersonalizadoColaborador(
  db: DbComExecute | null | undefined,
  usuario: UsuarioHospital,
  usuarioNomeFallback = `Usuário #${usuario.id}`,
): Promise<PerfilColaboradorFabrica | null> {
  if (usuario.role === "admin") return null;
  if (!idPositivoSeguro(usuario.id) || !db || typeof db.execute !== "function") {
    throw erroPerfilNaoValidado();
  }

  try {
    const resultado = await db.execute(
      sql`SELECT id, usuario_id, usuario_nome, observacao FROM fabrica_metas
          WHERE competencia = 'PERFIL' AND usuario_id = ${usuario.id}
          ORDER BY id DESC LIMIT 1`,
    );

    // mysql2/Drizzle retorna [rows, fields]. A primeira linha é rows[0].
    if (!Array.isArray(resultado)) throw erroPerfilNaoValidado();
    const [rows] = resultado;
    if (!Array.isArray(rows)) throw erroPerfilNaoValidado();

    const row = rows[0];
    if (row === undefined) return null;
    if (!objetoRegistro(row) || typeof row.observacao !== "string" || !row.observacao.trim()) {
      throw erroPerfilNaoValidado();
    }

    return parsePerfilObservacao(
      row.observacao,
      usuario.id,
      nomePerfil(row, usuarioNomeFallback),
    );
  } catch {
    throw erroPerfilNaoValidado();
  }
}

/**
 * Aplica o perfil opcional sem quebrar o comportamento legado de colaboradores
 * que ainda não possuem nenhuma linha de perfil salva.
 */
export async function exigirSetorColaborador(
  db: DbComExecute | null | undefined,
  usuario: UsuarioHospital,
  setoresRequeridos: readonly SetorOperacionalFabrica[],
  hospitalIds?: readonly number[],
): Promise<void> {
  if (usuario.role === "admin") return;

  const perfil = await obterPerfilPersonalizadoColaborador(db, usuario);
  exigirPerfilNoSetor(perfil, setoresRequeridos, hospitalIds);
}

function exigirPerfilNoSetor(
  perfil: PerfilColaboradorFabrica | null,
  setoresRequeridos: readonly SetorOperacionalFabrica[],
  hospitalIds?: readonly number[],
): void {
  if (!perfil || perfil.isGestorFabrica) return;

  const setoresExpandidos = new Set<string>(setoresConsultaDoPerfil(perfil.setoresPermitidos));
  const temSetor = setoresRequeridos.some((setor) => setoresExpandidos.has(setor));
  if (!temSetor) {
    throw new TRPCError({ code: "FORBIDDEN", message: MENSAGEM_SETOR_NAO_AUTORIZADO });
  }

  if (!hospitalIds || hospitalIds.length === 0) return;
  if (!hospitalIds.every(idPositivoSeguro)) {
    throw erroPerfilNaoValidado();
  }

  // Lista vazia no perfil significa que o perfil não adiciona restrição hospitalar.
  if (perfil.hospitaisPermitidos.length === 0) return;

  if (hospitalIds.some((hospitalId) => !perfil.hospitaisPermitidos.includes(hospitalId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: MENSAGEM_HOSPITAL_NAO_AUTORIZADO });
  }
}

/** Todo o lote é validado antes da primeira escrita, com uma única leitura do perfil. */
export async function exigirSetoresLoteColaborador(
  db: DbComExecute | null | undefined,
  usuario: UsuarioHospital,
  contas: readonly { setorAtual: string; hospitalEstabelecimentoId: number }[],
): Promise<void> {
  if (usuario.role === "admin") return;
  const perfil = await obterPerfilPersonalizadoColaborador(db, usuario);
  for (const conta of contas) {
    const setoresRequeridos: readonly SetorOperacionalFabrica[] = conta.setorAtual === "enviado_convenio"
      ? ["recursos", "limpeza_prontuario"]
      : [conta.setorAtual as SetorOperacionalFabrica];
    exigirPerfilNoSetor(perfil, setoresRequeridos, [conta.hospitalEstabelecimentoId]);
  }
}

/**
 * Leitura e contagem usam o mesmo perfil efetivo das guardas operacionais.
 * Admin e ausência comprovada de linha preservam o legado; perfil vazio não
 * ganha setores. A permissão gerenciar na Central não amplia perfis salvos.
 */
export async function resolverEscopoLeituraFabrica(
  db: DbComExecute | null | undefined,
  usuario: UsuarioHospital,
  hospitalIds: readonly number[],
  setorSolicitado?: SetorConsultaFabrica,
): Promise<{ setores: SetorConsultaFabrica[]; hospitais: number[] }> {
  if (!hospitalIds.every(idPositivoSeguro)) throw erroPerfilNaoValidado();
  const perfil = await obterPerfilPersonalizadoColaborador(db, usuario);
  let setores = setoresConsultaDoPerfil(perfil?.setoresPermitidos ?? TODOS_SETORES_OPERACIONAIS);
  if (setorSolicitado !== undefined) {
    if (!setores.includes(setorSolicitado)) {
      throw new TRPCError({ code: "FORBIDDEN", message: MENSAGEM_SETOR_NAO_AUTORIZADO });
    }
    const grupo = grupoConsultaSetorFabrica(setorSolicitado);
    setores = setores.filter((setor) => grupo.includes(setor));
  }
  const hospitais = [...new Set(hospitalIds)].filter((hospitalId) =>
    !perfil || perfil.hospitaisPermitidos.length === 0 || perfil.hospitaisPermitidos.includes(hospitalId),
  );
  return { setores, hospitais };
}
