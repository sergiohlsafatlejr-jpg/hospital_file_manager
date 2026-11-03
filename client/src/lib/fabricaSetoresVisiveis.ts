import {
  TODOS_SETORES_OPERACIONAIS,
  podeAcessarSetorFabrica,
  setoresConsultaDoPerfil,
  type SetorConsultaFabrica,
  type SetorOperacionalFabrica,
} from "@shared/fabricaSetores";

export const SETORES_VISIVEIS_FABRICA = [
  "recepcao",
  "faturamento",
  "auditoria_interna",
  "auditoria_externa",
  "limpeza_prontuario",
  "enviado_convenio",
] as const;

export type SetorVisivelFabrica = (typeof SETORES_VISIVEIS_FABRICA)[number];
export type SelecaoSetorFabrica = SetorVisivelFabrica | "todos" | null;
export type StatusPerfilFabrica = "pending" | "error" | "success";

export interface AcessoFabrica {
  perfilValido: boolean;
  setoresPermitidos: readonly SetorOperacionalFabrica[];
  setoresConsulta: readonly SetorConsultaFabrica[];
  setoresVisiveis: readonly SetorVisivelFabrica[];
  podeConsultarSetores: boolean;
  podeRecepcionar: boolean;
  podeVerRelatorios: boolean;
  podeGerenciarEquipe: boolean;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function setorOperacional(valor: unknown): valor is SetorOperacionalFabrica {
  return TODOS_SETORES_OPERACIONAIS.some((setor) => setor === valor);
}

/** Ausência/erro/loading não é o perfil legado: apenas o DTO válido pode conceder acesso. */
export function resolverAcessoFabrica(
  dadosAuxiliares: unknown,
  status: StatusPerfilFabrica,
): AcessoFabrica {
  const aux = objeto(dadosAuxiliares);
  const perfil = objeto(aux?.meuPerfil);
  const permitidos = perfil?.setoresPermitidos;
  const perfilValido = status === "success" && perfil !== null &&
    typeof perfil.isGestorFabrica === "boolean" &&
    typeof perfil.verRelatoriosGerenciais === "boolean" &&
    Array.isArray(permitidos) && permitidos.every(setorOperacional);
  const setoresPermitidos: readonly SetorOperacionalFabrica[] = perfilValido
    ? perfil?.isGestorFabrica ? TODOS_SETORES_OPERACIONAIS : permitidos as SetorOperacionalFabrica[]
    : [];
  const setoresConsulta = setoresConsultaDoPerfil(setoresPermitidos);
  const setoresVisiveis = SETORES_VISIVEIS_FABRICA.filter((setor) =>
    podeAcessarSetorFabrica(setoresPermitidos, setor),
  );
  return {
    perfilValido,
    setoresPermitidos,
    setoresConsulta,
    setoresVisiveis,
    podeConsultarSetores: perfilValido && setoresVisiveis.length > 0,
    podeRecepcionar: perfilValido && podeAcessarSetorFabrica(setoresPermitidos, "recepcao"),
    podeVerRelatorios: perfilValido &&
      (perfil?.isGestorFabrica === true || perfil?.verRelatoriosGerenciais === true),
    // Gerenciar a equipe não transforma o operador em gestor operacional.
    podeGerenciarEquipe: perfilValido && aux?.podeGerenciarEquipe === true,
  };
}

export function podeAcessarSetorVisivelFabrica(acesso: AcessoFabrica, setor: string): boolean {
  return acesso.perfilValido && podeAcessarSetorFabrica(acesso.setoresPermitidos, setor);
}

/** Aplicada no render, antes das queries; a URL nunca vira uma consulta proibida. */
export function resolverSelecaoSetorFabrica(
  acesso: AcessoFabrica,
  solicitado: string | null,
): SelecaoSetorFabrica {
  if (!acesso.podeConsultarSetores) return null;
  if (solicitado === "todos") return "todos";
  const canonico = solicitado === "recursos" || solicitado === "finalizado"
    ? "enviado_convenio"
    : solicitado;
  const autorizado = acesso.setoresVisiveis.find((setor) => setor === canonico);
  return autorizado ?? acesso.setoresVisiveis[0] ?? null;
}

export function resolverAbaFabrica(acesso: AcessoFabrica, solicitada: string): string {
  if (solicitada === "recepcao" && acesso.podeRecepcionar) return solicitada;
  if (solicitada === "ambulatorial" && acesso.podeConsultarSetores) return solicitada;
  if (solicitada === "relatorios" && acesso.podeVerRelatorios) return solicitada;
  if (solicitada === "equipe" && acesso.podeGerenciarEquipe) return solicitada;
  return "esteira";
}
