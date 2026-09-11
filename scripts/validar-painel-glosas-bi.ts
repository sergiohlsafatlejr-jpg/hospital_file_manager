import { relatoriosGlosasBiRouter } from "../server/routers/relatoriosGlosasBiRouter";

const caller = relatoriosGlosasBiRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

const [prontoSocorro, imec, filtrosProntoSocorro] = await Promise.all([
  caller.painelExecutivo({ estabelecimentoId: 1, limite: 10 }),
  caller.painelExecutivo({ estabelecimentoId: 2550001, limite: 10 }),
  caller.filtros({ estabelecimentoId: 1 }),
]);

if (!prontoSocorro.porMesPagamento.length || !prontoSocorro.porItem.length || !prontoSocorro.porConvenio.length || !prontoSocorro.porProcedimento.length) {
  throw new Error("O painel não retornou todos os quatro agrupamentos obrigatórios");
}

if (prontoSocorro.resumo.valorGlosado === imec.resumo.valorGlosado) {
  throw new Error("Falha de isolamento: estabelecimentos distintos retornaram o mesmo total de glosa");
}

if (!filtrosProntoSocorro.competencias.length || !filtrosProntoSocorro.convenios.length || !filtrosProntoSocorro.categoriasGlosa.length) {
  throw new Error("Os filtros por pagamento, convênio e categoria não foram carregados");
}

console.log(JSON.stringify({
  prontoSocorroInfantil: {
    resumo: prontoSocorro.resumo,
    mesesPagamento: prontoSocorro.porMesPagamento.length,
    convenios: prontoSocorro.porConvenio.length,
    itens: prontoSocorro.porItem.length,
    procedimentos: prontoSocorro.porProcedimento.length,
    filtros: {
      mesesPagamento: filtrosProntoSocorro.competencias.length,
      convenios: filtrosProntoSocorro.convenios.length,
      categorias: filtrosProntoSocorro.categoriasGlosa.length,
    },
  },
  imec: {
    resumo: imec.resumo,
    mesesPagamento: imec.porMesPagamento.length,
    convenios: imec.porConvenio.length,
  },
  isolamentoConfirmado: true,
}, null, 2));

process.exit(0);
