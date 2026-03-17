import { describe, it, expect } from "vitest";

/**
 * Testes para validar que os defaults de permissões de relatórios BI
 * são "nao" (sem acesso) por padrão, e que o módulo pai relatoriosBi
 * aparece quando qualquer relatório individual está habilitado.
 */

// Simular a lógica de resolução de permissões do EstabelecimentoContext
function resolverPermissoesRelatoriosBi(permissao: Record<string, any>) {
  return {
    acessoDashboard: permissao.acessoDashboard || "nao",
    acessoRelatoriosBi: permissao.acessoRelatoriosBi || "nao",
    acessoRelFaturadoRecebido: permissao.acessoRelFaturadoRecebido || "nao",
    acessoRelRecebimentoGeral: permissao.acessoRelRecebimentoGeral || "nao",
    acessoRelFaturamento: permissao.acessoRelFaturamento || "nao",
    acessoRelAtendimentos: permissao.acessoRelAtendimentos || "nao",
    acessoRelCustos: permissao.acessoRelCustos || "nao",
    acessoRelNaoRecebidos: permissao.acessoRelNaoRecebidos || "nao",
    acessoRelPrevisaoGlosa: permissao.acessoRelPrevisaoGlosa || "nao",
    grupoServico: permissao.grupoServico || null,
  };
}

// Campos de relatórios BI individuais (mesma lista do EstabelecimentoContext)
const camposRelatoriosBiIndividuais = [
  "acessoRelFaturadoRecebido",
  "acessoRelRecebimentoGeral",
  "acessoRelFaturamento",
  "acessoRelAtendimentos",
  "acessoRelCustos",
  "acessoRelNaoRecebidos",
  "acessoRelPrevisaoGlosa",
];

// Simular a lógica corrigida de temAcessoModulo
const moduloParaCampo: Record<string, string> = {
  dashboard: "acessoDashboard",
  relatoriosBi: "acessoRelatoriosBi",
  relFaturadoRecebido: "acessoRelFaturadoRecebido",
  relRecebimentoGeral: "acessoRelRecebimentoGeral",
  relFaturamento: "acessoRelFaturamento",
  relAtendimentos: "acessoRelAtendimentos",
  relCustos: "acessoRelCustos",
  relNaoRecebidos: "acessoRelNaoRecebidos",
  relPrevisaoGlosa: "acessoRelPrevisaoGlosa",
};

function temAcessoModulo(
  permissoesModulo: Record<string, any>,
  modulo: string,
  isAdmin = false,
  isGestor = false
): boolean {
  if (isAdmin) return true;
  if (isGestor) return true;
  if (!permissoesModulo) return false;
  if (permissoesModulo.grupoServico === "administrador") return true;

  // Para relatoriosBi: verificar campo pai OU qualquer relatório individual
  if (modulo === "relatoriosBi") {
    if (permissoesModulo.acessoRelatoriosBi === "sim") return true;
    return camposRelatoriosBiIndividuais.some(
      (campo) => permissoesModulo[campo] === "sim"
    );
  }

  const campo = moduloParaCampo[modulo];
  return permissoesModulo[campo] === "sim";
}

// Simular sincronização de acessoRelatoriosBi ao salvar
function sincronizarRelatoriosBi(permissao: Record<string, any>) {
  const temAlgumRelBi = camposRelatoriosBiIndividuais.some(
    (campo) => permissao[campo] === "sim"
  );
  return {
    ...permissao,
    acessoRelatoriosBi: temAlgumRelBi ? "sim" : permissao.acessoRelatoriosBi,
  };
}

describe("Permissões Relatórios BI - Defaults", () => {
  it("deve negar acesso a todos os relatórios quando campos são undefined", () => {
    const resolvido = resolverPermissoesRelatoriosBi({});
    expect(resolvido.acessoRelFaturadoRecebido).toBe("nao");
    expect(resolvido.acessoRelRecebimentoGeral).toBe("nao");
    expect(resolvido.acessoRelFaturamento).toBe("nao");
    expect(resolvido.acessoRelAtendimentos).toBe("nao");
    expect(resolvido.acessoRelCustos).toBe("nao");
    expect(resolvido.acessoRelNaoRecebidos).toBe("nao");
    expect(resolvido.acessoRelPrevisaoGlosa).toBe("nao");
    expect(resolvido.acessoDashboard).toBe("nao");
    expect(resolvido.acessoRelatoriosBi).toBe("nao");
  });

  it("deve negar acesso quando campos são null", () => {
    const resolvido = resolverPermissoesRelatoriosBi({
      acessoRelFaturadoRecebido: null,
      acessoRelRecebimentoGeral: null,
      acessoDashboard: null,
      acessoRelatoriosBi: null,
    });
    expect(resolvido.acessoRelFaturadoRecebido).toBe("nao");
    expect(resolvido.acessoRelRecebimentoGeral).toBe("nao");
    expect(resolvido.acessoDashboard).toBe("nao");
    expect(resolvido.acessoRelatoriosBi).toBe("nao");
  });

  it("deve permitir acesso somente aos relatórios explicitamente habilitados", () => {
    const resolvido = resolverPermissoesRelatoriosBi({
      acessoRelFaturamento: "sim",
      acessoRelAtendimentos: "sim",
      acessoRelCustos: "sim",
    });
    expect(resolvido.acessoRelFaturamento).toBe("sim");
    expect(resolvido.acessoRelAtendimentos).toBe("sim");
    expect(resolvido.acessoRelCustos).toBe("sim");
    expect(resolvido.acessoRelFaturadoRecebido).toBe("nao");
    expect(resolvido.acessoRelRecebimentoGeral).toBe("nao");
  });
});

describe("Permissões Relatórios BI - temAcessoModulo com lógica de módulo pai", () => {
  it("deve mostrar módulo relatoriosBi quando campo pai é 'sim'", () => {
    const permissoes = resolverPermissoesRelatoriosBi({
      acessoRelatoriosBi: "sim",
    });
    expect(temAcessoModulo(permissoes, "relatoriosBi")).toBe(true);
  });

  it("deve mostrar módulo relatoriosBi quando qualquer relatório individual está habilitado (mesmo com campo pai 'nao')", () => {
    const permissoes = resolverPermissoesRelatoriosBi({
      acessoRelatoriosBi: "nao",
      acessoRelFaturamento: "sim",
    });
    expect(temAcessoModulo(permissoes, "relatoriosBi")).toBe(true);
  });

  it("deve ocultar módulo relatoriosBi quando nenhum relatório está habilitado", () => {
    const permissoes = resolverPermissoesRelatoriosBi({
      acessoRelatoriosBi: "nao",
    });
    expect(temAcessoModulo(permissoes, "relatoriosBi")).toBe(false);
  });

  it("cenário aragraciotte: módulo BI deve aparecer com relatórios individuais habilitados", () => {
    // Simula exatamente os dados do banco do aragraciotte
    const permissoes = resolverPermissoesRelatoriosBi({
      acessoDashboard: "nao",
      acessoRelatoriosBi: "nao", // Campo pai estava "nao" no banco!
      acessoRelFaturadoRecebido: "nao",
      acessoRelRecebimentoGeral: "sim",
      acessoRelFaturamento: "sim",
      acessoRelAtendimentos: "sim",
      acessoRelCustos: "sim",
      acessoRelNaoRecebidos: "nao",
      acessoRelPrevisaoGlosa: "nao",
    });

    // Módulo pai deve aparecer (porque tem relatórios individuais habilitados)
    expect(temAcessoModulo(permissoes, "relatoriosBi")).toBe(true);
    // Dashboard deve estar oculto
    expect(temAcessoModulo(permissoes, "dashboard")).toBe(false);
    // Relatórios individuais corretos
    expect(temAcessoModulo(permissoes, "relRecebimentoGeral")).toBe(true);
    expect(temAcessoModulo(permissoes, "relFaturamento")).toBe(true);
    expect(temAcessoModulo(permissoes, "relAtendimentos")).toBe(true);
    expect(temAcessoModulo(permissoes, "relCustos")).toBe(true);
    expect(temAcessoModulo(permissoes, "relFaturadoRecebido")).toBe(false);
    expect(temAcessoModulo(permissoes, "relNaoRecebidos")).toBe(false);
    expect(temAcessoModulo(permissoes, "relPrevisaoGlosa")).toBe(false);
  });

  it("admin sempre tem acesso a tudo", () => {
    const permissoes = resolverPermissoesRelatoriosBi({});
    expect(temAcessoModulo(permissoes, "relatoriosBi", true)).toBe(true);
    expect(temAcessoModulo(permissoes, "dashboard", true)).toBe(true);
  });

  it("gestor sempre tem acesso a tudo", () => {
    const permissoes = resolverPermissoesRelatoriosBi({});
    expect(temAcessoModulo(permissoes, "relatoriosBi", false, true)).toBe(true);
  });

  it("administrador do estabelecimento tem acesso total", () => {
    const permissoes = resolverPermissoesRelatoriosBi({
      grupoServico: "administrador",
    });
    expect(temAcessoModulo(permissoes, "relatoriosBi")).toBe(true);
    expect(temAcessoModulo(permissoes, "dashboard")).toBe(true);
  });
});

describe("Sincronização acessoRelatoriosBi ao salvar permissões", () => {
  it("deve setar acessoRelatoriosBi para 'sim' quando relatório individual está habilitado", () => {
    const permissao = {
      acessoRelatoriosBi: "nao",
      acessoRelFaturamento: "sim",
      acessoRelAtendimentos: "nao",
    };
    const resultado = sincronizarRelatoriosBi(permissao);
    expect(resultado.acessoRelatoriosBi).toBe("sim");
  });

  it("deve manter acessoRelatoriosBi como 'nao' quando nenhum relatório individual está habilitado", () => {
    const permissao = {
      acessoRelatoriosBi: "nao",
      acessoRelFaturamento: "nao",
      acessoRelAtendimentos: "nao",
    };
    const resultado = sincronizarRelatoriosBi(permissao);
    expect(resultado.acessoRelatoriosBi).toBe("nao");
  });

  it("deve sincronizar corretamente com múltiplos relatórios habilitados", () => {
    const permissao = {
      acessoRelatoriosBi: "nao",
      acessoRelRecebimentoGeral: "sim",
      acessoRelFaturamento: "sim",
      acessoRelAtendimentos: "sim",
      acessoRelCustos: "sim",
    };
    const resultado = sincronizarRelatoriosBi(permissao);
    expect(resultado.acessoRelatoriosBi).toBe("sim");
  });
});

describe("SettingsMenu - Filtragem por Permissão", () => {
  type SettingsMenuItem = {
    label: string;
    adminOnly?: boolean;
    modulo?: string;
  };

  const settingsMenuItems: SettingsMenuItem[] = [
    { label: "Estabelecimentos", modulo: "estabelecimentos" },
    { label: "Convênios", modulo: "convenios" },
    { label: "Tabelas de Preço", modulo: "tabelasPreco" },
    { label: "Usuários e Permissões", modulo: "permissoes" },
    { label: "Integrador de Dados", adminOnly: true },
    { label: "Mapeamento Convênios", adminOnly: true },
    { label: "Regras de IA", adminOnly: true },
    { label: "Dicionário de Glosas", modulo: "dicionarioGlosas" },
    { label: "Avisos Internos", adminOnly: true },
    { label: "Notificações", adminOnly: true },
    { label: "Backup e Dados", adminOnly: true },
  ];

  function filterSettingsItems(
    items: SettingsMenuItem[],
    isGestor: boolean,
    temAcesso: (modulo: string) => boolean
  ) {
    return items.filter((item) => {
      if (item.adminOnly) return isGestor;
      if (item.modulo) return temAcesso(item.modulo);
      return true;
    });
  }

  it("deve retornar lista vazia para usuário sem permissões (Notificações agora é adminOnly)", () => {
    const filtered = filterSettingsItems(settingsMenuItems, false, () => false);
    expect(filtered).toHaveLength(0);
  });

  it("deve mostrar todos os itens para gestor", () => {
    const filtered = filterSettingsItems(settingsMenuItems, true, () => true);
    expect(filtered.length).toBe(settingsMenuItems.length);
  });

  it("deve mostrar apenas itens com módulo permitido para usuário com permissões parciais", () => {
    const permissoes = new Set(["estabelecimentos", "convenios"]);
    const filtered = filterSettingsItems(settingsMenuItems, false, (modulo) =>
      permissoes.has(modulo)
    );
    const labels = filtered.map((i) => i.label);
    expect(labels).toContain("Estabelecimentos");
    expect(labels).toContain("Convênios");
    expect(labels).not.toContain("Notificações");
    expect(labels).not.toContain("Tabelas de Preço");
    expect(labels).not.toContain("Integrador de Dados");
    expect(labels).not.toContain("Backup e Dados");
  });

  it("Configurações não deve aparecer quando lista filtrada está vazia", () => {
    const filtered = filterSettingsItems(settingsMenuItems, false, () => false);
    // Se filteredItems.length === 0, o SettingsMenu retorna null
    expect(filtered.length).toBe(0);
  });
});
