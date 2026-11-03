/** Setores configuráveis do perfil; estados finais pertencem ao fluxo de Recursos. */
export const TODOS_SETORES_OPERACIONAIS = [
  "recepcao",
  "faturamento",
  "auditoria_interna",
  "auditoria_externa",
  "limpeza_prontuario",
  "recursos",
] as const;

export type SetorOperacionalFabrica = (typeof TODOS_SETORES_OPERACIONAIS)[number];
export type SetorConsultaFabrica = SetorOperacionalFabrica | "enviado_convenio" | "finalizado";

/** Preserva o compartilhamento já aprovado entre Limpeza/Envio e Enviado/Recursos. */
export function setoresConsultaDoPerfil(
  permitidos: readonly SetorOperacionalFabrica[],
): SetorConsultaFabrica[] {
  const setores = new Set<SetorConsultaFabrica>(permitidos);
  if (setores.has("limpeza_prontuario") || setores.has("recursos")) {
    setores.add("limpeza_prontuario");
    setores.add("recursos");
    setores.add("enviado_convenio");
    setores.add("finalizado");
  }
  return [...setores];
}

export function podeAcessarSetorFabrica(
  permitidos: readonly SetorOperacionalFabrica[],
  setor: string,
): boolean {
  return setoresConsultaDoPerfil(permitidos).some((autorizado) => autorizado === setor);
}

/** Selecionar um estado compartilhado mantém apenas esse grupo, nunca os outros setores. */
export function grupoConsultaSetorFabrica(setor: SetorConsultaFabrica): SetorConsultaFabrica[] {
  if (setor === "limpeza_prontuario" || setor === "recursos" || setor === "enviado_convenio") {
    return ["limpeza_prontuario", "enviado_convenio", "recursos"];
  }
  return [setor];
}
