import { relatorioVisitaRouter } from "../server/routers/relatorioVisitaRouter";

const admin = relatorioVisitaRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 1, role: "admin", name: "Validação interna" } as any,
});

const usuarioRestritoPsi = relatorioVisitaRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: 8520261, role: "user", name: "Validação restrita" } as any,
});

const estabelecimentoId = 1;
const [medicos, geral, convenios] = await Promise.all([
  admin.medicos({ estabelecimentoId }),
  admin.dados({ estabelecimentoId, statusFiltro: "todos" }),
  admin.convenios({ estabelecimentoId }),
]);
const julho = await admin.dados({
  estabelecimentoId,
  mesReferencia: 7,
  anoReferencia: 2026,
  statusFiltro: "todos",
});

if (!medicos.length) throw new Error("Nenhum médico do XML foi disponibilizado no filtro");
if (geral.resumo.totalComMedico <= 0 || geral.resumo.totalMedicos <= 0) {
  throw new Error("O resumo não reconheceu os médicos vinculados ao XML");
}
if (!geral.porMedico.some((item) => item.medico && item.crm)) {
  throw new Error("A visão por médico não retornou nome e CRM");
}

const conveniosEsperados = [
  { id: 60001, nome: "Affego", visitas: 2 },
  { id: 60003, nome: "Bradesco", visitas: 69 },
  { id: 60007, nome: "Saude Caixa", visitas: 34 },
  { id: 60004, nome: "Cassi", visitas: 18 },
  { id: 210001, nome: "Fusex", visitas: 19 },
  { id: 60005, nome: "Geap", visitas: 12 },
  { id: 1, nome: "Unimed", visitas: 26 },
  { id: 60008, nome: "Vivacom", visitas: 10 },
];
for (const esperado of conveniosEsperados) {
  if (!convenios.some((item) => Number(item.id) === esperado.id)) {
    throw new Error(`${esperado.nome} não apareceu no filtro de convênios`);
  }
  const resumoConvenio = geral.porConvenio.find((item) => Number(item.convenioId) === esperado.id);
  if (!resumoConvenio || Number(resumoConvenio.totalFaturadoSemRetorno || 0) <= 0) {
    throw new Error(`${esperado.nome} não apareceu no resumo com o faturamento XML`);
  }
  const recorteConvenio = await admin.dados({
    estabelecimentoId,
    convenioId: esperado.id,
    statusFiltro: "todos",
  });
  if (recorteConvenio.resumo.totalAguardandoRetorno !== esperado.visitas) {
    throw new Error(`${esperado.nome}: esperado ${esperado.visitas} itens faturados sem correspondência no retorno, retornou ${recorteConvenio.resumo.totalAguardandoRetorno}`);
  }
  if (recorteConvenio.porConvenio.some((item) => Number(item.convenioId) !== esperado.id)) {
    throw new Error(`${esperado.nome}: o filtro retornou outro convênio`);
  }
}
if (geral.resumo.totalAguardandoRetorno !== 190) {
  throw new Error(`Conciliação global incompleta: esperado 190 itens sem retorno, retornou ${geral.resumo.totalAguardandoRetorno}`);
}
if (julho.resumo.totalItens !== 63) {
  throw new Error(`O recorte 07/2026 mudou: esperado 63 visitas, retornou ${julho.resumo.totalItens}`);
}
if (julho.resumo.totalComMedico < 54) {
  throw new Error(`A recuperação histórica de 07/2026 ficou incompleta: ${julho.resumo.totalComMedico}/63 visitas`);
}
if (!julho.itens.some((item: any) => item.origem_profissional === "XML histórico — carteirinha e convênio")) {
  throw new Error("O recorte de julho não identificou a origem histórica recuperada no banco");
}

let recorteComMedico: Awaited<ReturnType<typeof admin.dados>> | null = null;
let competenciaUsada: { mes: number; ano: number; label: string } | null = null;
for (const competencia of geral.competencias) {
  const recorte = await admin.dados({
    estabelecimentoId,
    mesReferencia: competencia.mes,
    anoReferencia: competencia.ano,
    statusFiltro: "todos",
  });
  if (recorte.itens.some((item: any) => item.medico && item.crm)) {
    recorteComMedico = recorte;
    competenciaUsada = competencia;
    break;
  }
}

if (!recorteComMedico || !competenciaUsada) {
  throw new Error("Nenhuma competência detalhada exibiu médico e CRM do XML");
}

const profissional = recorteComMedico.itens.find((item: any) => item.medico && item.crm)!;
const filtrado = await admin.dados({
  estabelecimentoId,
  mesReferencia: competenciaUsada.mes,
  anoReferencia: competenciaUsada.ano,
  statusFiltro: "todos",
  medico: profissional.medico,
  crm: profissional.crm,
});
if (!filtrado.itens.length || filtrado.itens.some((item: any) => item.medico !== profissional.medico || item.crm !== profissional.crm)) {
  throw new Error("O filtro de médico/CRM retornou profissional diferente do selecionado");
}

await usuarioRestritoPsi.dados({ estabelecimentoId, statusFiltro: "todos" });
let bloqueioConfirmado = false;
try {
  await usuarioRestritoPsi.dados({ estabelecimentoId: 2550001, statusFiltro: "todos" });
} catch (error: any) {
  bloqueioConfirmado = error?.code === "FORBIDDEN";
}
if (!bloqueioConfirmado) throw new Error("Usuário restrito conseguiu acessar outro estabelecimento");

console.log(JSON.stringify({
  estabelecimentoId,
  medicosDisponiveis: medicos.length,
  cobertura: geral.resumo,
  recorteJulho2026: {
    total: julho.resumo.totalItens,
    comMedico: julho.resumo.totalComMedico,
    semMedico: julho.resumo.totalSemMedico,
    percentual: Number(((julho.resumo.totalComMedico / julho.resumo.totalItens) * 100).toFixed(2)),
  },
  competenciaValidada: competenciaUsada.label,
  medicoValidado: { medico: profissional.medico, crm: profissional.crm },
  itensNoFiltro: filtrado.itens.length,
  conveniosRecuperados: conveniosEsperados.map((item) => ({ nome: item.nome, visitas: item.visitas })),
  isolamentoConfirmado: true,
}, null, 2));

process.exit(0);
