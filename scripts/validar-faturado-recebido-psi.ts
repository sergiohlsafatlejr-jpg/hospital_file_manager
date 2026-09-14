import { faturadoRecebidoPsiRouter } from "../server/routers/faturadoRecebidoPsiRouter";

const caller = faturadoRecebidoPsiRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

const geral = await caller.dados({ estabelecimentoId: 1, limite: 10 });
if (geral.estabelecimento.id !== 1) throw new Error("O endpoint retornou estabelecimento diferente do PSI");
if (!geral.porConvenio.length || !geral.porMes.length) throw new Error("O painel não retornou agrupamentos por convênio e mês");
if (geral.resumo.totalFaturado <= 0 || geral.resumo.totalRecebido <= 0 || geral.resumo.totalGlosado <= 0) {
  throw new Error("O painel não retornou os valores financeiros reais do PSI");
}

const competencia = geral.filtrosDisponiveis.competencias.find((item) => item === "2026/08") || geral.filtrosDisponiveis.competencias[0];
const convenio = geral.porConvenio.find((item: any) => item.totalGlosado > 0)?.convenio || geral.filtrosDisponiveis.convenios[0];
if (!competencia || !convenio) throw new Error("Não há mês e convênio para validar os filtros cruzados");

const [porMes, porConvenio, combinado] = await Promise.all([
  caller.dados({ estabelecimentoId: 1, competencia, limite: 10 }),
  caller.dados({ estabelecimentoId: 1, convenio, limite: 10 }),
  caller.dados({ estabelecimentoId: 1, competencia, convenio, limite: 10 }),
]);

if (porMes.filtrosAplicados.competencia !== competencia) throw new Error("O filtro Mês/Ano não foi aplicado");
if (porConvenio.filtrosAplicados.convenio !== convenio) throw new Error("O clique por convênio não foi aplicado");
if (combinado.resumo.totalFaturado > porMes.resumo.totalFaturado + 0.02 || combinado.resumo.totalGlosado > porConvenio.resumo.totalGlosado + 0.02) {
  throw new Error("A combinação mês + convênio retornou total superior ao recorte pai");
}

let bloqueouOutroEstabelecimento = false;
try {
  await caller.dados({ estabelecimentoId: 2550001 as 1, limite: 10 });
} catch {
  bloqueouOutroEstabelecimento = true;
}
if (!bloqueouOutroEstabelecimento) throw new Error("O endpoint aceitou um estabelecimento diferente do PSI");

console.log(JSON.stringify({
  estabelecimento: geral.estabelecimento,
  resumo: geral.resumo,
  filtrosDisponiveis: {
    competencias: geral.filtrosDisponiveis.competencias.length,
    convenios: geral.filtrosDisponiveis.convenios.length,
  },
  recorteValidado: {
    competencia,
    convenio,
    resumoMes: porMes.resumo,
    resumoConvenio: porConvenio.resumo,
    resumoCombinado: combinado.resumo,
    motivos: combinado.motivosGlosa.length,
    itens: combinado.itensGlosados.length,
  },
  isolamentoConfirmado: bloqueouOutroEstabelecimento,
}, null, 2));

process.exit(0);
