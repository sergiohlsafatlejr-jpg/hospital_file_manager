import { describe, it, expect } from "vitest";

/**
 * Tests for the Relatório para Faturista consolidation logic.
 * This logic runs on the frontend (useMemo), but we test the pure data
 * transformation here to ensure correctness.
 */

// Replicate the consolidation logic from ContaConvenioDetalhes.tsx
function buildRelatorioFaturista({
  divergencias,
  falhas,
  ajustes,
  getFeedbackForDiv,
}: {
  divergencias: any[];
  falhas: any[];
  ajustes: any[];
  getFeedbackForDiv: (div: any) => { decisao: string; justificativa: string } | null;
}) {
  const items: Array<{
    origem: string;
    codigo: string;
    descricaoItem: string;
    descricaoApontamento: string;
    severidade: string;
    decisaoAuditor: string;
    observacaoAuditor: string;
    impactoFinanceiro: number | null;
    acaoNecessaria: string;
  }> = [];

  // 1. Divergências
  for (const div of divergencias) {
    const fb = getFeedbackForDiv(div);
    const diferenca = div.diferenca != null ? parseFloat(div.diferenca) : null;

    let acaoNecessaria = "Verificar e corrigir";
    if (div.tipo === "VALOR_ACIMA") acaoNecessaria = "Revisar valor cobrado";
    else if (div.tipo === "VALOR_ABAIXO") acaoNecessaria = "Verificar se valor está correto";
    else if (div.tipo === "QUANTIDADE_DIVERGENTE") acaoNecessaria = "Corrigir quantidade";
    else if (div.tipo === "ITEM_NAO_PADRAO") acaoNecessaria = "Verificar se item é procedente";
    else if (div.tipo === "ITEM_DUPLICADO") acaoNecessaria = "Remover duplicidade";
    else if (div.tipo === "ITEM_FALTANTE") acaoNecessaria = "Adicionar item faltante";

    if (fb?.decisao === "aceitar") {
      acaoNecessaria = "Corrigir conforme auditoria (aceita)";
    } else if (fb?.decisao === "rejeitar") {
      acaoNecessaria = "Sem ação (rejeitada pelo auditor)";
    }

    items.push({
      origem: "DIVERGÊNCIA",
      codigo: div.codigoItem || "",
      descricaoItem: div.descricaoItem || "",
      descricaoApontamento: div.mensagem || div.descricao || div.tipo || "-",
      severidade: div.severidade || "info",
      decisaoAuditor: fb?.decisao || "",
      observacaoAuditor: fb?.justificativa || "",
      impactoFinanceiro: diferenca,
      acaoNecessaria,
    });
  }

  // 2. Falhas de prontuário
  for (const falha of falhas) {
    let acaoNecessaria = "Providenciar documentação";
    if (falha.status === "corrigida") acaoNecessaria = "Já corrigida";
    else if (falha.status === "justificada") acaoNecessaria = "Justificada - verificar";

    items.push({
      origem: "FALHA PRONTUÁRIO",
      codigo: "",
      descricaoItem: falha.categoriaFalha || "",
      descricaoApontamento: falha.tipoFalha + (falha.descricao ? ` - ${falha.descricao}` : ""),
      severidade: falha.severidade || "moderada",
      decisaoAuditor: falha.status || "aberta",
      observacaoAuditor: "",
      impactoFinanceiro: null,
      acaoNecessaria,
    });
  }

  // 3. Ajustes
  for (const ajuste of ajustes) {
    let descricao = "";
    let impacto: number | null = null;

    if (ajuste.tipoAjuste === "ALTERAR_QUANTIDADE") {
      descricao = `Quantidade alterada: ${ajuste.quantidadeOriginal} → ${ajuste.quantidadeAjustada}`;
      const valorUnit = parseFloat(ajuste.valorOriginal || "0");
      const qtdOrig = parseFloat(ajuste.quantidadeOriginal || "0");
      const qtdAjust = parseFloat(ajuste.quantidadeAjustada || "0");
      impacto = (qtdAjust - qtdOrig) * valorUnit;
    } else if (ajuste.tipoAjuste === "ALTERAR_VALOR") {
      descricao = `Valor alterado`;
      impacto = parseFloat(ajuste.valorAjustado || "0") - parseFloat(ajuste.valorOriginal || "0");
    } else if (ajuste.tipoAjuste === "ADICIONAR_ITEM") {
      descricao = "Item adicionado à conta";
      impacto = parseFloat(ajuste.valorAjustado || "0") * parseFloat(ajuste.quantidadeAjustada || "1");
    } else if (ajuste.tipoAjuste === "REMOVER_ITEM") {
      descricao = "Item removido da conta";
      impacto = -(parseFloat(ajuste.valorOriginal || "0") * parseFloat(ajuste.quantidadeOriginal || "1"));
    }

    if (ajuste.justificativa) {
      descricao += ` | Motivo: ${ajuste.justificativa}`;
    }

    items.push({
      origem: "AJUSTE",
      codigo: ajuste.codigoItem || "",
      descricaoItem: ajuste.descricaoItem || "",
      descricaoApontamento: descricao,
      severidade: "info",
      decisaoAuditor: ajuste.status || "aplicado",
      observacaoAuditor: ajuste.usuarioNome ? `Por ${ajuste.usuarioNome}` : "",
      impactoFinanceiro: impacto,
      acaoNecessaria: ajuste.status === "revertido" ? "Revertido - sem ação" : "Aplicar no faturamento",
    });
  }

  return items;
}

describe("Relatório para Faturista - Consolidação de dados", () => {
  it("deve retornar array vazio quando não há dados de auditoria", () => {
    const result = buildRelatorioFaturista({
      divergencias: [],
      falhas: [],
      ajustes: [],
      getFeedbackForDiv: () => null,
    });
    expect(result).toEqual([]);
  });

  it("deve consolidar divergências com origem DIVERGÊNCIA", () => {
    const divergencias = [
      {
        codigoItem: "10101039",
        descricaoItem: "Consulta em pronto socorro",
        tipo: "VALOR_ACIMA",
        mensagem: "Valor acima do padrão: R$ 130,00 vs R$ 100,00",
        diferenca: "30.00",
        severidade: "alerta",
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias,
      falhas: [],
      ajustes: [],
      getFeedbackForDiv: () => null,
    });

    expect(result).toHaveLength(1);
    expect(result[0].origem).toBe("DIVERGÊNCIA");
    expect(result[0].codigo).toBe("10101039");
    expect(result[0].descricaoItem).toBe("Consulta em pronto socorro");
    expect(result[0].descricaoApontamento).toBe("Valor acima do padrão: R$ 130,00 vs R$ 100,00");
    expect(result[0].severidade).toBe("alerta");
    expect(result[0].impactoFinanceiro).toBe(30);
    expect(result[0].acaoNecessaria).toBe("Revisar valor cobrado");
    expect(result[0].decisaoAuditor).toBe("");
  });

  it("deve alterar ação necessária quando auditor aceitou a divergência", () => {
    const divergencias = [
      {
        codigoItem: "10101039",
        tipo: "VALOR_ACIMA",
        mensagem: "Valor acima",
        diferenca: "30.00",
        severidade: "alerta",
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias,
      falhas: [],
      ajustes: [],
      getFeedbackForDiv: () => ({ decisao: "aceitar", justificativa: "Confirmo divergência" }),
    });

    expect(result[0].acaoNecessaria).toBe("Corrigir conforme auditoria (aceita)");
    expect(result[0].decisaoAuditor).toBe("aceitar");
    expect(result[0].observacaoAuditor).toBe("Confirmo divergência");
  });

  it("deve alterar ação necessária quando auditor rejeitou a divergência", () => {
    const divergencias = [
      {
        codigoItem: "10101039",
        tipo: "ITEM_DUPLICADO",
        mensagem: "Item duplicado",
        diferenca: null,
        severidade: "critico",
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias,
      falhas: [],
      ajustes: [],
      getFeedbackForDiv: () => ({ decisao: "rejeitar", justificativa: "Não é duplicado" }),
    });

    expect(result[0].acaoNecessaria).toBe("Sem ação (rejeitada pelo auditor)");
    expect(result[0].decisaoAuditor).toBe("rejeitar");
  });

  it("deve consolidar falhas de prontuário com origem FALHA PRONTUÁRIO", () => {
    const falhas = [
      {
        id: 1,
        categoriaFalha: "Documentação",
        tipoFalha: "Laudo ausente",
        descricao: "Laudo médico não encontrado no prontuário",
        severidade: "critica",
        status: "aberta",
      },
      {
        id: 2,
        categoriaFalha: "Assinatura",
        tipoFalha: "Assinatura ilegível",
        descricao: null,
        severidade: "moderada",
        status: "corrigida",
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias: [],
      falhas,
      ajustes: [],
      getFeedbackForDiv: () => null,
    });

    expect(result).toHaveLength(2);

    // Falha aberta
    expect(result[0].origem).toBe("FALHA PRONTUÁRIO");
    expect(result[0].descricaoItem).toBe("Documentação");
    expect(result[0].descricaoApontamento).toBe("Laudo ausente - Laudo médico não encontrado no prontuário");
    expect(result[0].severidade).toBe("critica");
    expect(result[0].acaoNecessaria).toBe("Providenciar documentação");
    expect(result[0].impactoFinanceiro).toBeNull();

    // Falha corrigida
    expect(result[1].acaoNecessaria).toBe("Já corrigida");
    expect(result[1].descricaoApontamento).toBe("Assinatura ilegível");
  });

  it("deve consolidar ajustes com origem AJUSTE e calcular impacto financeiro", () => {
    const ajustes = [
      {
        codigoItem: "60036761",
        descricaoItem: "Taxa de atendimento",
        tipoAjuste: "ALTERAR_QUANTIDADE",
        quantidadeOriginal: "1",
        quantidadeAjustada: "2",
        valorOriginal: "37.00",
        valorAjustado: null,
        justificativa: "Paciente atendido 2 vezes",
        status: "aplicado",
        usuarioNome: "Maria Auditora",
      },
      {
        codigoItem: "10101039",
        descricaoItem: "Consulta PS",
        tipoAjuste: "REMOVER_ITEM",
        quantidadeOriginal: "1",
        quantidadeAjustada: null,
        valorOriginal: "130.00",
        valorAjustado: null,
        justificativa: null,
        status: "revertido",
        usuarioNome: null,
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias: [],
      falhas: [],
      ajustes,
      getFeedbackForDiv: () => null,
    });

    expect(result).toHaveLength(2);

    // Ajuste de quantidade
    expect(result[0].origem).toBe("AJUSTE");
    expect(result[0].codigo).toBe("60036761");
    expect(result[0].impactoFinanceiro).toBe(37); // (2-1) * 37
    expect(result[0].acaoNecessaria).toBe("Aplicar no faturamento");
    expect(result[0].observacaoAuditor).toBe("Por Maria Auditora");
    expect(result[0].descricaoApontamento).toContain("Quantidade alterada: 1 → 2");
    expect(result[0].descricaoApontamento).toContain("Motivo: Paciente atendido 2 vezes");

    // Ajuste de remoção revertido
    expect(result[1].impactoFinanceiro).toBe(-130); // -(130 * 1)
    expect(result[1].acaoNecessaria).toBe("Revertido - sem ação");
    expect(result[1].descricaoApontamento).toContain("Item removido da conta");
  });

  it("deve consolidar todos os tipos juntos na ordem correta", () => {
    const result = buildRelatorioFaturista({
      divergencias: [
        { codigoItem: "A", tipo: "VALOR_ACIMA", mensagem: "Valor alto", diferenca: "10", severidade: "alerta" },
      ],
      falhas: [
        { categoriaFalha: "Doc", tipoFalha: "Falta laudo", descricao: null, severidade: "critica", status: "aberta" },
      ],
      ajustes: [
        {
          codigoItem: "B",
          descricaoItem: "Item B",
          tipoAjuste: "ADICIONAR_ITEM",
          valorAjustado: "50",
          quantidadeAjustada: "2",
          justificativa: null,
          status: "aplicado",
          usuarioNome: null,
        },
      ],
      getFeedbackForDiv: () => null,
    });

    expect(result).toHaveLength(3);
    expect(result[0].origem).toBe("DIVERGÊNCIA");
    expect(result[1].origem).toBe("FALHA PRONTUÁRIO");
    expect(result[2].origem).toBe("AJUSTE");
    expect(result[2].impactoFinanceiro).toBe(100); // 50 * 2
  });

  it("deve mapear corretamente cada tipo de divergência para ação necessária", () => {
    const tipos = [
      { tipo: "VALOR_ACIMA", expected: "Revisar valor cobrado" },
      { tipo: "VALOR_ABAIXO", expected: "Verificar se valor está correto" },
      { tipo: "QUANTIDADE_DIVERGENTE", expected: "Corrigir quantidade" },
      { tipo: "ITEM_NAO_PADRAO", expected: "Verificar se item é procedente" },
      { tipo: "ITEM_DUPLICADO", expected: "Remover duplicidade" },
      { tipo: "ITEM_FALTANTE", expected: "Adicionar item faltante" },
      { tipo: "OUTRO_TIPO", expected: "Verificar e corrigir" },
    ];

    for (const { tipo, expected } of tipos) {
      const result = buildRelatorioFaturista({
        divergencias: [{ codigoItem: "X", tipo, mensagem: "Teste", diferenca: null, severidade: "info" }],
        falhas: [],
        ajustes: [],
        getFeedbackForDiv: () => null,
      });
      expect(result[0].acaoNecessaria).toBe(expected);
    }
  });

  it("deve calcular impacto financeiro corretamente para ALTERAR_VALOR", () => {
    const ajustes = [
      {
        codigoItem: "X",
        descricaoItem: "Item X",
        tipoAjuste: "ALTERAR_VALOR",
        valorOriginal: "100.00",
        valorAjustado: "85.50",
        justificativa: null,
        status: "aplicado",
        usuarioNome: null,
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias: [],
      falhas: [],
      ajustes,
      getFeedbackForDiv: () => null,
    });

    expect(result[0].impactoFinanceiro).toBeCloseTo(-14.5);
  });

  it("deve tratar falha com status justificada corretamente", () => {
    const falhas = [
      {
        categoriaFalha: "Evolução",
        tipoFalha: "Evolução incompleta",
        descricao: "Falta evolução do dia 15",
        severidade: "moderada",
        status: "justificada",
      },
    ];

    const result = buildRelatorioFaturista({
      divergencias: [],
      falhas,
      ajustes: [],
      getFeedbackForDiv: () => null,
    });

    expect(result[0].acaoNecessaria).toBe("Justificada - verificar");
    expect(result[0].decisaoAuditor).toBe("justificada");
  });
});
