import { tasyRouter } from "../server/routers/tasyRouter";

const caller = tasyRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
  estabelecimentoId: 1260036,
});

const [previsao, pagamentos] = await Promise.all([
  caller.getPrevisaoRecebimentos({ estabelecimentoId: 1260036 }),
  caller.getPagamentosBi({ estabelecimentoId: 1260036 }),
]);

console.log(JSON.stringify({
  procedimentosDisponiveis: {
    getPrevisaoRecebimentos: Boolean(previsao?.resumo),
    getPagamentosBi: Boolean(pagamentos?.resumo),
  },
  previsao: {
    resumo: previsao.resumo,
    convenios: previsao.porConvenio.length,
    mesesVencimento: previsao.porMesVencimento.length,
  },
  pagamentos: {
    resumo: pagamentos.resumo,
    convenios: pagamentos.porConvenio.length,
    meses: pagamentos.porMes.length,
  },
}, null, 2));

process.exit(0);
