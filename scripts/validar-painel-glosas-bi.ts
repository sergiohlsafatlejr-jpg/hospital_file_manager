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

const itemBase = prontoSocorro.porItem[0];
const convenioBase = prontoSocorro.porConvenio[0];
const procedimentoBase = prontoSocorro.porProcedimento[0];
const motivoBase = prontoSocorro.porMotivo[0];
const mesBase = prontoSocorro.porMesPagamento.at(-1);

if (!itemBase || !convenioBase || !procedimentoBase || !motivoBase || !mesBase) {
  throw new Error("Não há dimensões suficientes para validar a interação cruzada");
}

const [porItem, porConvenio, porProcedimento, porMotivo, porMes] = await Promise.all([
  caller.painelExecutivo({ estabelecimentoId: 1, itemDescricao: itemBase.nome, limite: 10 }),
  caller.painelExecutivo({ estabelecimentoId: 1, convenioId: convenioBase.convenioId, limite: 10 }),
  caller.painelExecutivo({ estabelecimentoId: 1, procedimentoCodigo: procedimentoBase.codigoItem, limite: 10 }),
  caller.painelExecutivo({ estabelecimentoId: 1, motivoCodigo: motivoBase.codigoGlosa, limite: 10 }),
  caller.painelExecutivo({ estabelecimentoId: 1, mesPagamento: mesBase.mesPagamento, limite: 10 }),
]);

const recortes = [porItem, porConvenio, porProcedimento, porMotivo, porMes];
if (recortes.some((recorte) => recorte.resumo.valorGlosado <= 0 || recorte.resumo.valorGlosado > prontoSocorro.resumo.valorGlosado)) {
  throw new Error("Um filtro cruzado retornou um total inválido ou superior à visão geral");
}

if (!porConvenio.porConvenio.some((item) => item.convenioId === convenioBase.convenioId)) {
  throw new Error("O ranking de convênios deixou de manter a dimensão selecionada navegável");
}
if (!porMes.porMesPagamento.some((item) => item.mesPagamento === mesBase.mesPagamento)) {
  throw new Error("O gráfico mensal deixou de manter o mês selecionado navegável");
}

const mesDoItem = porItem.porMesPagamento.at(-1)?.mesPagamento;
const recorteCombinado = mesDoItem
  ? await caller.painelExecutivo({ estabelecimentoId: 1, itemDescricao: itemBase.nome, mesPagamento: mesDoItem, limite: 10 })
  : null;
if (recorteCombinado && (recorteCombinado.resumo.valorGlosado <= 0 || recorteCombinado.resumo.valorGlosado > porItem.resumo.valorGlosado)) {
  throw new Error("A combinação item + mês não recalculou corretamente o painel");
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
  filtrosCruzados: {
    item: { selecionado: itemBase.nome, valorGlosado: porItem.resumo.valorGlosado },
    convenio: { selecionado: convenioBase.nome, valorGlosado: porConvenio.resumo.valorGlosado },
    procedimento: { selecionado: procedimentoBase.codigoItem, valorGlosado: porProcedimento.resumo.valorGlosado },
    motivo: { selecionado: motivoBase.codigoGlosa, valorGlosado: porMotivo.resumo.valorGlosado },
    mesPagamento: { selecionado: mesBase.mesPagamento, valorGlosado: porMes.resumo.valorGlosado },
    combinacaoItemMes: recorteCombinado?.resumo.valorGlosado ?? 0,
  },
  isolamentoConfirmado: true,
}, null, 2));

process.exit(0);
