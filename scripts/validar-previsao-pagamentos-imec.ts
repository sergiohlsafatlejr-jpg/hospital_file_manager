import { previsaoPagamentosImecRouter } from "../server/routers/previsaoPagamentosImecRouter";
import { IMEC_ESTABELECIMENTO_ID } from "../server/previsaoPagamentosImecService";

const caller = previsaoPagamentosImecRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
  estabelecimentoId: IMEC_ESTABELECIMENTO_ID,
});

const previsao = await caller.dados({ estabelecimentoId: IMEC_ESTABELECIMENTO_ID, mesesHorizonte: 6 });
let bloqueioOutroEstabelecimento = false;
try {
  await caller.dados({ estabelecimentoId: 3 as any, mesesHorizonte: 6 });
} catch {
  bloqueioOutroEstabelecimento = true;
}

console.log(JSON.stringify({
  bloqueioOutroEstabelecimento,
  resumo: previsao.resumo,
  porConvenio: previsao.porConvenio,
  primeirosPagamentos: previsao.cronograma.filter(item => item.status !== "realizado").slice(0, 8),
}, null, 2));
