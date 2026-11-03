import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TODOS_SETORES_OPERACIONAIS, setoresConsultaDoPerfil, type SetorOperacionalFabrica } from "@shared/fabricaSetores";
import {
  SETORES_VISIVEIS_FABRICA,
  podeAcessarSetorVisivelFabrica,
  resolverAcessoFabrica,
  resolverAbaFabrica,
  resolverSelecaoSetorFabrica,
} from "./fabricaSetoresVisiveis";

function aux(setores: readonly SetorOperacionalFabrica[], gestor = false, equipe = false, relatorios = false) {
  return {
    meuPerfil: { setoresPermitidos: setores, isGestorFabrica: gestor, verRelatoriosGerenciais: relatorios },
    podeGerenciarEquipe: equipe,
  };
}

function acesso(setores: readonly SetorOperacionalFabrica[]) {
  return resolverAcessoFabrica(aux(setores), "success");
}

describe("Issue155: setores visíveis e consultas falham fechados", () => {
  it.each(["pending", "error"] as const)("bloqueia %s mesmo com DTO admin em cache", (status) => {
    const bloqueado = resolverAcessoFabrica(aux([], true, true, true), status);
    expect(bloqueado.perfilValido).toBe(false);
    expect(bloqueado.setoresVisiveis).toEqual([]);
    expect(bloqueado.setoresConsulta).toEqual([]);
    expect(bloqueado.podeConsultarSetores).toBe(false);
    expect(bloqueado.podeRecepcionar).toBe(false);
    expect(bloqueado.podeVerRelatorios).toBe(false);
    expect(bloqueado.podeGerenciarEquipe).toBe(false);
    expect(resolverSelecaoSetorFabrica(bloqueado, "todos")).toBeNull();
    expect(podeAcessarSetorVisivelFabrica(bloqueado, "faturamento")).toBe(false);
  });

  it.each([
    undefined, null, {}, { meuPerfil: null },
    { meuPerfil: { isGestorFabrica: false, verRelatoriosGerenciais: false } },
    { meuPerfil: { isGestorFabrica: false, verRelatoriosGerenciais: false, setoresPermitidos: ["desconhecido"] } },
    { meuPerfil: { isGestorFabrica: "true", verRelatoriosGerenciais: false, setoresPermitidos: [] } },
  ])("não concede acesso para DTO ausente/inválido %#", (dto) => {
    const bloqueado = resolverAcessoFabrica(dto, "success");
    expect(bloqueado.perfilValido).toBe(false);
    expect(bloqueado.setoresVisiveis).toEqual([]);
    expect(bloqueado.podeConsultarSetores).toBe(false);
    expect(resolverSelecaoSetorFabrica(bloqueado, "recepcao")).toBeNull();
  });

  it("perfil [] é válido com zero setores, sem fallback nem consultas", () => {
    const vazio = acesso([]);
    expect(vazio.perfilValido).toBe(true);
    expect(vazio.setoresVisiveis).toEqual([]);
    expect(vazio.podeConsultarSetores).toBe(false);
    expect(resolverSelecaoSetorFabrica(vazio, "todos")).toBeNull();
    expect(resolverSelecaoSetorFabrica(vazio, "faturamento")).toBeNull();
  });

  it("só faturamento esconde todos os outros setores no menu e na tela", () => {
    const restrito = acesso(["faturamento"]);
    expect(restrito.setoresVisiveis).toEqual(["faturamento"]);
    expect(restrito.setoresConsulta).toEqual(["faturamento"]);
    expect(restrito.podeConsultarSetores).toBe(true);
    expect(restrito.podeRecepcionar).toBe(false);
    expect(restrito.podeVerRelatorios).toBe(false);
    for (const setor of TODOS_SETORES_OPERACIONAIS) {
      expect(podeAcessarSetorVisivelFabrica(restrito, setor)).toBe(setor === "faturamento");
    }
  });

  it.each(["limpeza_prontuario", "recursos"] as const)("%s mantém Limpeza/Recursos compartilhados no menu e na tela", (setor) => {
    const compartilhado = acesso([setor]);
    expect(compartilhado.setoresVisiveis).toEqual(["limpeza_prontuario", "enviado_convenio"]);
    expect(compartilhado.setoresConsulta).toEqual(setoresConsultaDoPerfil([setor]));
    for (const permitido of ["limpeza_prontuario", "recursos", "enviado_convenio", "finalizado"]) {
      expect(podeAcessarSetorVisivelFabrica(compartilhado, permitido)).toBe(true);
    }
    expect(podeAcessarSetorVisivelFabrica(compartilhado, "recepcao")).toBe(false);
    expect(podeAcessarSetorVisivelFabrica(compartilhado, "faturamento")).toBe(false);
    expect(resolverSelecaoSetorFabrica(compartilhado, "recursos")).toBe("enviado_convenio");
    expect(resolverSelecaoSetorFabrica(compartilhado, "enviado_convenio")).toBe("enviado_convenio");
  });

  it("DTO admin isGestorFabrica libera todos os setores e relatórios", () => {
    const admin = resolverAcessoFabrica(aux([], true, true), "success");
    expect(admin.setoresVisiveis).toEqual(SETORES_VISIVEIS_FABRICA);
    expect(admin.setoresPermitidos).toEqual(TODOS_SETORES_OPERACIONAIS);
    expect(admin.podeVerRelatorios).toBe(true);
    expect(admin.podeRecepcionar).toBe(true);
    expect(admin.podeGerenciarEquipe).toBe(true);
  });

  it("preserva o DTO legado válido com todos os setores e não presume relatórios", () => {
    const legado = acesso(TODOS_SETORES_OPERACIONAIS);
    expect(legado.setoresVisiveis).toEqual(SETORES_VISIVEIS_FABRICA);
    expect(legado.podeVerRelatorios).toBe(false);
    expect(legado.podeGerenciarEquipe).toBe(false);
  });

  it("gestor da equipe continua restrito ao faturamento operacional", () => {
    const gestorEquipe = resolverAcessoFabrica(aux(["faturamento"], false, true), "success");
    expect(gestorEquipe.podeGerenciarEquipe).toBe(true);
    expect(gestorEquipe.setoresVisiveis).toEqual(["faturamento"]);
    expect(gestorEquipe.podeRecepcionar).toBe(false);
    expect(resolverAbaFabrica(gestorEquipe, "equipe")).toBe("equipe");
    const equipeSemSetores = resolverAcessoFabrica(aux([], false, true), "success");
    expect(equipeSemSetores.podeGerenciarEquipe).toBe(true);
    expect(equipeSemSetores.podeConsultarSetores).toBe(false);
    expect(resolverAbaFabrica(equipeSemSetores, "equipe")).toBe("equipe");
  });
});

describe("Issue155: seleção direta da URL nunca concede setor", () => {
  it.each(["recepcao", "auditoria_interna", "auditoria_externa", "limpeza_prontuario", "recursos", "enviado_convenio", "finalizado", "invalido"])("normaliza URL setor=%s para o setor autorizado", (solicitado) => {
    const restrito = acesso(["faturamento"]);
    const seguro = resolverSelecaoSetorFabrica(restrito, solicitado);
    expect(seguro).toBe("faturamento");
    expect(resolverSelecaoSetorFabrica(restrito, seguro)).toBe(seguro);
  });

  it("Todos é somente a consulta agregada dos setores autorizados", () => {
    const restrito = acesso(["faturamento"]);
    expect(resolverSelecaoSetorFabrica(restrito, "todos")).toBe("todos");
    expect(restrito.setoresConsulta).toEqual(["faturamento"]);
    expect(resolverSelecaoSetorFabrica(acesso([]), "todos")).toBeNull();
  });

  it("nega abas recepção/relatórios/equipe sem suas permissões", () => {
    for (const aba of ["recepcao", "relatorios", "equipe", "desconhecida"]) {
      expect(resolverAbaFabrica(acesso(["faturamento"]), aba)).toBe("esteira");
    }
    expect(resolverAbaFabrica(acesso(["recepcao"]), "recepcao")).toBe("recepcao");
    const relatorios = resolverAcessoFabrica(aux(["faturamento"], false, false, true), "success");
    expect(resolverAbaFabrica(relatorios, "relatorios")).toBe("relatorios");
  });
});

describe("Issue155: helper realmente conectado aos consumidores (sem render/backend)", () => {
  const menu = readFileSync(new URL("../components/DashboardLayout.tsx", import.meta.url), "utf8");
  const tela = readFileSync(new URL("../pages/FabricaFaturamento.tsx", import.meta.url), "utf8");

  it("menu usa status do query e a regra canônica compartilhada", () => {
    expect(menu).toContain("resolverAcessoFabrica(fabricaAux, fabricaAuxStatus)");
    expect(menu).toContain("!podeAcessarSetorVisivelFabrica(acessoFabrica, child.setorFabrica)");
    expect(menu).toContain("!acessoFabrica.podeVerRelatorios");
    expect(menu).not.toContain("meuPerfilFabrica &&");
  });

  it("tela deriva seleção segura antes de consultar, sem efeito que reabre a URL", () => {
    expect(tela).toContain("resolverAcessoFabrica(auxData, auxStatus)");
    expect(tela).toContain("acessoFabrica.setoresVisiveis.some((id) => id === setor.id)");
    expect(tela).toContain("resolverSelecaoSetorFabrica(acessoFabrica, setorSolicitado)");
    expect(tela.indexOf("resolverSelecaoSetorFabrica(acessoFabrica, setorSolicitado)")).toBeLessThan(tela.indexOf("listarContas.useQuery"));
    expect(tela).not.toContain("filtrados.length > 0 ? filtrados : SETORES_CONFIG");
    expect(tela).not.toContain("setSetorSelecionado(setoresVisiveis[0].id)");
    expect(tela).toContain("if (!perfilValido)");
    expect(tela).toContain("Nenhum setor liberado");
  });

  it("negócio/refetch/sugestões exigem permissão, equipe tem guarda própria", () => {
    expect(tela).toContain("{ enabled: podeListarContas }");
    expect(tela).toContain("{ enabled: podeConsultarSetores }");
    expect(tela).toContain("{ enabled: podeVerRelatorios }");
    expect(tela).toContain('enabled: podeRecepcionar && abaPrincipal === "recepcao"');
    expect(tela).toContain("if (podeListarContas) refetchContas()");
    expect(tela).toContain('abaPrincipal === "equipe" && podeGerenciarEquipe');
    expect(tela).toContain("acessoFabrica.setoresConsulta.some((setor) => setor === conta.setorAtual)");
    expect(tela).toContain("modalPerfilOpen && podeGerenciarEquipe");
    expect(tela).toContain("modalMetaOpen && podeVerRelatorios");
    expect(tela).toContain("modalXmlOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoXml?.setorAtual)");
    expect(tela).toContain("modalErroOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoErro?.setorAtual)");
    expect(tela).toContain("modalEnvioOpen && podeAcessarSetorVisivelFabrica(acessoFabrica, contaAlvoEnvio?.setorAtual)");
    expect(tela).toContain("podeConsultarSetores ? resumoSetores?.totalGeralContas || 0 : 0");
  });
});
