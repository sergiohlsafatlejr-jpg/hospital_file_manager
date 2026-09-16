import { contasConvenioRouter } from "../server/routers/contasConvenioRouter";

const caller = contasConvenioRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

const setembro = await caller.listarContas({
  estabelecimentoId: 3,
  competenciaAno: 2026,
  competenciaMes: 9,
  page: 1,
  pageSize: 50,
});

const resumo = setembro.resumo as any;
const contaRepetida = setembro.contas.find((conta: any) => conta.numeroConta === "74087824");

if (!contaRepetida) throw new Error("A conta 74087824 não apareceu no recorte de setembro do OX UTI");
if (Math.abs(Number(contaRepetida.valorTotal) - 13126.15) > 0.01 || Number(contaRepetida.totalItens) !== 137) {
  throw new Error(`Conta 74087824 ainda mistura competências: ${contaRepetida.totalItens} itens / R$ ${contaRepetida.valorTotal}`);
}
if (Math.abs(Number(resumo.valorTotal) - 130877.36) > 0.01) {
  throw new Error(`Conta Convênio 09/2026 deveria totalizar R$ 130.877,36, retornou R$ ${resumo.valorTotal}`);
}
if (Math.abs(Number(resumo.valorPrestadorProprio) - 125918.22) > 0.01) {
  throw new Error(`Prestador próprio 1101060 deveria totalizar R$ 125.918,22, retornou R$ ${resumo.valorPrestadorProprio}`);
}
if (Math.abs(Number(resumo.valorOutrosPrestadores) - 4959.14) > 0.01) {
  throw new Error(`Prestadores terceiros deveriam totalizar R$ 4.959,14, retornaram R$ ${resumo.valorOutrosPrestadores}`);
}

const detalhe = await caller.listarItens({
  estabelecimentoId: 3,
  numeroConta: "74087824",
  competencia: "2026/09",
});

if (Number(detalhe.resumoGeral.totalItens) !== 137 || Math.abs(Number(detalhe.resumoGeral.valorTotal) - 13126.15) > 0.01) {
  throw new Error(`Detalhe da conta 74087824 ainda mistura meses: ${detalhe.resumoGeral.totalItens} itens / R$ ${detalhe.resumoGeral.valorTotal}`);
}

console.log(JSON.stringify({
  competencia: "2026/09",
  totalContas: Number(resumo.totalContas),
  todosPrestadores: Number(resumo.valorTotal),
  prestadorProprio: Number(resumo.valorPrestadorProprio),
  outrosPrestadores: Number(resumo.valorOutrosPrestadores),
  conta74087824: {
    itens: Number(contaRepetida.totalItens),
    valor: Number(contaRepetida.valorTotal),
  },
}, null, 2));

process.exit(0);
