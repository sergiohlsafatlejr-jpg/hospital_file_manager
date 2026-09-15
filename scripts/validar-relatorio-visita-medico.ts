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
const [medicos, geral] = await Promise.all([
  admin.medicos({ estabelecimentoId }),
  admin.dados({ estabelecimentoId, statusFiltro: "todos" }),
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
  isolamentoConfirmado: true,
}, null, 2));

process.exit(0);
