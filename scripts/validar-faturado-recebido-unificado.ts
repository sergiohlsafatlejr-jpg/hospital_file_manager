import { faturadoRecebidoUnificadoRouter } from "../server/routers/faturadoRecebidoUnificadoRouter";

const caller = faturadoRecebidoUnificadoRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

const callerRestritoPsi = faturadoRecebidoUnificadoRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 8520261, role: "user", name: "Validação de permissão restrita" } as any,
});

async function carregarEstabelecimento(estabelecimentoId: number) {
  const dados = await caller.dados({ estabelecimentoId, limite: 10 });
  if (dados.estabelecimento.id !== estabelecimentoId) {
    throw new Error(`A consulta ${estabelecimentoId} retornou dados da unidade ${dados.estabelecimento.id}`);
  }
  if (!dados.porConvenio.length || !dados.porMes.length) {
    throw new Error(`${dados.estabelecimento.nome}: painel sem agrupamentos por convênio ou mês`);
  }
  if (dados.resumo.totalFaturado <= 0 || dados.resumo.totalRecebido <= 0) {
    throw new Error(`${dados.estabelecimento.nome}: valores financeiros reais não foram retornados`);
  }
  return dados;
}

const [psi, imec] = await Promise.all([
  carregarEstabelecimento(1),
  carregarEstabelecimento(2550001),
]);

if (psi.estabelecimento.nome === imec.estabelecimento.nome) {
  throw new Error("Duas unidades distintas retornaram a mesma identificação");
}
if (psi.resumo.totalFaturado === imec.resumo.totalFaturado && psi.resumo.totalRecebido === imec.resumo.totalRecebido) {
  throw new Error("PSI e Imec retornaram os mesmos totais, indicando possível mistura entre unidades");
}

const permitidoPsi = await callerRestritoPsi.dados({ estabelecimentoId: 1, limite: 5 });
if (permitidoPsi.estabelecimento.id !== 1) throw new Error("Usuário restrito ao PSI não recebeu sua unidade autorizada");
let bloqueioConfirmado = false;
try {
  await callerRestritoPsi.dados({ estabelecimentoId: 2550001, limite: 5 });
} catch (error: any) {
  bloqueioConfirmado = error?.code === "FORBIDDEN";
}
if (!bloqueioConfirmado) throw new Error("Usuário restrito ao PSI conseguiu consultar o Imec");

const competencia = psi.filtrosDisponiveis.competencias.find((item) => item === "2026/08") || psi.filtrosDisponiveis.competencias[0];
const convenio = psi.porConvenio.find((item: any) => item.totalGlosado > 0)?.convenio || psi.filtrosDisponiveis.convenios[0];
if (!competencia || !convenio) throw new Error("PSI: não há mês e convênio para validar os filtros cruzados");

const [porMes, porConvenio, combinado] = await Promise.all([
  caller.dados({ estabelecimentoId: 1, competencia, limite: 10 }),
  caller.dados({ estabelecimentoId: 1, convenio, limite: 10 }),
  caller.dados({ estabelecimentoId: 1, competencia, convenio, limite: 10 }),
]);

if (porMes.estabelecimento.id !== 1 || porConvenio.estabelecimento.id !== 1 || combinado.estabelecimento.id !== 1) {
  throw new Error("Um filtro cruzado do PSI retornou outro estabelecimento");
}
if (porMes.filtrosAplicados.competencia !== competencia) throw new Error("O filtro Mês/Ano não foi aplicado");
if (porConvenio.filtrosAplicados.convenio !== convenio) throw new Error("O clique por convênio não foi aplicado");
if (combinado.resumo.totalFaturado > porMes.resumo.totalFaturado + 0.02 || combinado.resumo.totalGlosado > porConvenio.resumo.totalGlosado + 0.02) {
  throw new Error("A combinação mês + convênio retornou total superior ao recorte pai");
}

console.log(JSON.stringify({
  estabelecimentos: [
    { ...psi.estabelecimento, resumo: psi.resumo, competencias: psi.filtrosDisponiveis.competencias.length, convenios: psi.filtrosDisponiveis.convenios.length },
    { ...imec.estabelecimento, resumo: imec.resumo, competencias: imec.filtrosDisponiveis.competencias.length, convenios: imec.filtrosDisponiveis.convenios.length },
  ],
  recortePsi: {
    competencia,
    convenio,
    resumoMes: porMes.resumo,
    resumoConvenio: porConvenio.resumo,
    resumoCombinado: combinado.resumo,
    motivos: combinado.motivosGlosa.length,
    itens: combinado.itensGlosados.length,
  },
  isolamentoConfirmado: true,
  permissaoRestritaConfirmada: bloqueioConfirmado,
}, null, 2));

process.exit(0);
