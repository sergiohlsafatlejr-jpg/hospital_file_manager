import { tasyRouter } from "../server/routers/tasyRouter";

const IMEC_ESTABELECIMENTO_ID = 2550001 as const;

const caller = tasyRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
  estabelecimentoId: IMEC_ESTABELECIMENTO_ID,
});

const [previsao, pagamentos] = await Promise.all([
  caller.getPrevisaoRecebimentos({ estabelecimentoId: IMEC_ESTABELECIMENTO_ID }),
  caller.getPagamentosBi({ estabelecimentoId: IMEC_ESTABELECIMENTO_ID }),
]);

let bloqueioPrevisaoOutroEstabelecimento = false;
let bloqueioPagamentosOutroEstabelecimento = false;
try {
  await caller.getPrevisaoRecebimentos({ estabelecimentoId: 1260036 as any });
} catch {
  bloqueioPrevisaoOutroEstabelecimento = true;
}
try {
  await caller.getPagamentosBi({ estabelecimentoId: 1260036 as any });
} catch {
  bloqueioPagamentosOutroEstabelecimento = true;
}

const pagamentosSomenteImec = pagamentos.porConvenio.every(
  (item: any) => item.estabelecimento === "Imec Senador Canedo",
);

if (!bloqueioPrevisaoOutroEstabelecimento || !bloqueioPagamentosOutroEstabelecimento || !pagamentosSomenteImec) {
  throw new Error("Falha no isolamento: as rotas de previsão devem aceitar e retornar somente o Imec 2550001");
}

console.log(JSON.stringify({
  procedimentosDisponiveis: {
    getPrevisaoRecebimentos: Boolean(previsao?.resumo),
    getPagamentosBi: Boolean(pagamentos?.resumo),
  },
  isolamento: {
    estabelecimentoId: IMEC_ESTABELECIMENTO_ID,
    bloqueioPrevisaoOutroEstabelecimento,
    bloqueioPagamentosOutroEstabelecimento,
    pagamentosSomenteImec,
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
