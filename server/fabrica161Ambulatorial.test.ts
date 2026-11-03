import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getConvenioById: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  parseXML: vi.fn(),
  validarGuia: vi.fn(),
  contexto: vi.fn(),
  criarXml: vi.fn(),
  confirmarXml: vi.fn(),
  popular: vi.fn(),
  scope: {
    exigirAcessoFabrica: vi.fn(),
    exigirHospitalProprietario: vi.fn(),
    resolverHospitaisAutorizados: vi.fn(),
    autorizarLoteHospitalar: vi.fn(),
  },
}));
vi.mock("./db", async (original) => ({ ...(await original<typeof import("./db")>()),
  getDb: mocks.getDb, getConvenioById: mocks.getConvenioById,
  verificarPermissaoEstabelecimento: mocks.verificarPermissaoEstabelecimento,
}));
vi.mock("./hospitalScope", () => ({ ...mocks.scope, ESTABELECIMENTO_CENTRAL_SAFATLE: 2160001 }));
vi.mock("./parsers", () => ({ parseXML: mocks.parseXML }));
vi.mock("./services/esteiraAmbulatorialService", () => ({
  carregarContextoRegrasConvenioAmbulatorial: mocks.contexto, validarGuiaAmbulatorial: mocks.validarGuia,
}));
vi.mock("./fabricaXmlSeguro", () => ({
  decodificarXmlFabricaBase64: (s: string) => Buffer.from(s, "base64"),
  criarArquivoXmlFabricaProtegido: mocks.criarXml, confirmarArquivoXmlFabrica: mocks.confirmarXml,
}));
vi.mock("./faturamentoUnificadoService", () => ({ popularDeXmlTissArquivoRestrito: mocks.popular }));

import { fabricaFaturamentoRouter } from "./routers/fabricaFaturamentoRouter";
import { fabricaContas, fabricaErrosConta, fabricaHistoricoFluxo, contasConvenioResumo } from "../drizzle/schema";

const usuario = { id: 71, role: "user", name: "Faturista sintético", email: "factory161@example.test" };
const caller = () => fabricaFaturamentoRouter.createCaller({ user: usuario, req: {}, res: {} } as any);
const identidade = { hospitalEstabelecimentoId: 3, convenioId: 55, numeroLote: "MESMO|LOTE", competencia: "2026/10", arquivoXmlFinalId: 100 };
const perfil = { cargoSetor: "Faturista", setoresPermitidos: ["faturamento"], hospitaisPermitidos: [3], verRelatoriosGerenciais: false };

function conta(id: number, extras: any = {}) {
  return {
    id, hospitalEstabelecimentoId: 3, convenioId: 55, convenioNome: "CONVÊNIO A", numeroGuia: `GUIA-${id}`,
    numeroLote: identidade.numeroLote, tipoAtendimento: "ambulatorio_sadt", dataEntrada: "2026-10-15",
    setorAtual: "faturamento", statusSetor: "concluido", statusAuditoriaRegras: "conforme", totalDivergenciasRegras: 0,
    arquivoXmlFaturamentoId: 90, arquivoXmlFinalId: 100, contaConvenioResumoId: 1000 + id,
    nomePaciente: "PACIENTE SINTÉTICO", valorFaturadoInicial: "25.00", valorFaturadoFinal: "25.00",
    entradaSetorAtualEm: new Date("2026-10-15T12:00:00Z"), updatedAt: new Date("2026-10-15T12:00:00Z"),
    ...extras,
  };
}
function resumo(c: any, extras: any = {}) {
  return { id: c.contaConvenioResumoId, estabelecimentoId: c.hospitalEstabelecimentoId, convenioId: c.convenioId,
    numeroConta: c.numeroGuia, numeroLote: c.numeroLote, competencia: "2026/10", origem: "XML", arquivoHospitalId: c.arquivoXmlFinalId, ...extras };
}
function divergente(id: number, extras: any = {}) {
  return conta(id, { statusAuditoriaRegras: "divergente", totalDivergenciasRegras: 1, statusSetor: "devolvido_erro", ...extras });
}
function expectedSnapshots(contas: any[]) {
  return contas.map(c => ({ contaId: c.id, arquivoXmlFinalId: c.arquivoXmlFinalId,
    contaConvenioResumoId: c.contaConvenioResumoId, updatedAt: c.updatedAt.toISOString() }));
}
const campos: Record<string, string> = {
  hospital_estabelecimento_id: "hospitalEstabelecimentoId", convenio_id: "convenioId", numero_guia: "numeroGuia",
  numero_lote: "numeroLote", arquivo_xml_final_id: "arquivoXmlFinalId", conta_convenio_resumo_id: "contaConvenioResumoId",
  tipo_atendimento: "tipoAtendimento", setor_atual: "setorAtual", status_setor: "statusSetor", status_auditoria_regras: "statusAuditoriaRegras",
  total_divergencias_regras: "totalDivergenciasRegras", updated_at: "updatedAt", fabrica_conta_id: "fabricaContaId",
};
const dialect = new MySqlDialect();
function corresponde(row: any, condition: any) {
  const { sql, params } = dialect.sqlToQuery(condition);
  const regex = /`[^`]+`\.`([^`]+)`\s*(=|<=>|in)\s*(\?|\([^)]*\))/gi;
  let index = 0;
  for (const match of sql.matchAll(regex)) {
    const quantidade = (match[3].match(/\?/g) || []).length;
    const valores = params.slice(index, index + quantidade);
    index += quantidade;
    const value = row[campos[match[1]] || match[1]];
    const normalizar = (v: any) => v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ")
      : typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(v) ? v.slice(0, 19).replace("T", " ") : v;
    if (!valores.some(v => normalizar(v) === normalizar(value))) return false;
  }
  if (index !== params.length) throw new Error(`Condição não reconhecida no mock: ${sql}`);
  return true;
}

/** Conexão externa recusa queries de recursos; estado só é publicado no commit. */
function banco(contas: any[], options: { snapshots?: any[]; erroHistorico?: boolean; stale?: boolean; perfil?: any } = {}) {
  let estado = { contas: structuredClone(contas), snapshots: structuredClone(options.snapshots || contas.map(c => resumo(c))),
    erros: contas.map(c => ({ fabricaContaId: c.id, hospitalEstabelecimentoId: c.hospitalEstabelecimentoId, convenioId: c.convenioId, corrigido: "nao" })), historico: [] as any[] };
  const consultas: { tabela: string; sql: string; params: any[]; lock: string }[] = [];
  const escritas: { tabela: string; valores: any }[] = [];
  const commits = vi.fn();
  const rollbacks = vi.fn();
  let nextId = 2000;
  const execute = vi.fn(async () => [[{ observacao: JSON.stringify(options.perfil || perfil) }], []]);
  const outer = {
    execute,
    select: vi.fn(() => { throw new Error("Select de recurso fora da transação"); }),
    update: vi.fn(() => { throw new Error("Update fora da transação"); }),
    insert: vi.fn(() => { throw new Error("Histórico fora da transação"); }),
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      const pendente = structuredClone(estado);
      function rows(table: any) {
        return table === fabricaContas ? pendente.contas : table === contasConvenioResumo ? pendente.snapshots : table === fabricaErrosConta ? pendente.erros : [];
      }
      const tx = {
        execute,
        select: () => ({ from: (table: any) => ({ where: (condition: any) => ({
          for: async (lock: string) => {
            const query = dialect.sqlToQuery(condition);
            consultas.push({ tabela: getTableName(table), ...query, lock });
            return structuredClone(rows(table).filter(r => corresponde(r, condition)));
          },
        }) }) }),
        update: (table: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
          escritas.push({ tabela: getTableName(table), valores: structuredClone(values) });
          if (table === fabricaContas && options.stale) return [{ affectedRows: 0 }];
          const encontrados = rows(table).filter(r => corresponde(r, condition));
          encontrados.forEach(row => Object.assign(row, values));
          return [{ affectedRows: encontrados.length }];
        } }) }),
        insert: (table: any) => ({ values: async (values: any) => {
          escritas.push({ tabela: getTableName(table), valores: structuredClone(values) });
          if (table === fabricaHistoricoFluxo && options.erroHistorico) throw new Error("Falha sintética de histórico");
          const id = ++nextId;
          const lista = Array.isArray(values) ? values : [values];
          if (table === fabricaContas) pendente.contas.push(...lista.map(v => ({ id, updatedAt: new Date(), ...v })));
          if (table === contasConvenioResumo) pendente.snapshots.push(...lista.map(v => ({ id, ...v })));
          if (table === fabricaHistoricoFluxo) pendente.historico.push(...lista);
          if (table === fabricaErrosConta) pendente.erros.push(...lista);
          return [{ insertId: id }];
        } }),
      };
      try {
        const result = await fn(tx);
        estado = pendente;
        commits();
        return result;
      } catch (e) { rollbacks(); throw e; }
    }),
  };
  mocks.getDb.mockResolvedValue(outer);
  return { outer, consultas, escritas, commits, rollbacks, estado: () => estado };
}
const importInput = { hospitalEstabelecimentoId: 3, convenioId: 55, nomeArquivo: "synthetic.xml", numeroLoteManual: identidade.numeroLote,
  conteudoBase64: Buffer.from("<synthetic/>").toString("base64"), enviarDiretoSeConforme: false };
const validacaoConforme = { statusAuditoriaRegras: "conforme", totalDivergencias: 0, scoreRisco: 0, erros: [], divergenciasPadrao: [], resumoMotivoRetorno: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.getConvenioById.mockImplementation(async (id: number) => ({ id, estabelecimentoId: 3, nome: `CONVÊNIO ${id}`, ativo: "sim" }));
  mocks.scope.exigirAcessoFabrica.mockResolvedValue(undefined);
  mocks.scope.exigirHospitalProprietario.mockResolvedValue(undefined);
  mocks.scope.resolverHospitaisAutorizados.mockResolvedValue([3]);
  mocks.scope.autorizarLoteHospitalar.mockImplementation(async (_u, contas) => {
    if (contas.some((c: any) => c.hospitalEstabelecimentoId !== 3)) throw new TRPCError({ code: "FORBIDDEN" });
  });
  mocks.parseXML.mockResolvedValue({ success: true, procedimentos: [{ codigo: "40304361", quantidade: 1, valorUnitario: 25, valorTotal: 25,
    guiaNumero: "GUIA-1", pacienteNome: "PACIENTE SINTÉTICO", pacienteCarteirinha: "SINTETICA", dataExecucao: new Date("2026-10-15T12:00:00Z"), codigoPrestadorExecutante: "SINTETICO" }] });
  mocks.contexto.mockResolvedValue({});
  mocks.validarGuia.mockResolvedValue(validacaoConforme);
  mocks.criarXml.mockResolvedValue(200);
  mocks.confirmarXml.mockResolvedValue(undefined);
  mocks.popular.mockResolvedValue({ inseridos: 1 });
});

describe("Issue161: identidade canônica e atomicidade ambulatorial", () => {
  it("libera somente o convênio/snapshot/competência selecionados, mesmo lote e guia repetidos", async () => {
    const a = conta(1);
    const b = conta(2, { convenioId: 56, numeroGuia: a.numeroGuia });
    const c = conta(3, { numeroGuia: a.numeroGuia, arquivoXmlFinalId: 101 });
    const d = conta(4, { numeroGuia: a.numeroGuia });
    const db = banco([a, b, c, d], { snapshots: [resumo(a), resumo(b), resumo(c), resumo(d, { competencia: "2026/09" })] });
    expect(await caller().liberarLoteAmbulatorialEnvio(identidade)).toMatchObject({ totalLiberadas: 1 });
    expect(db.estado().contas.map(c => c.setorAtual)).toEqual(["enviado_convenio", "faturamento", "faturamento", "faturamento"]);
    expect(db.commits).toHaveBeenCalledOnce();
    expect(db.consultas.every(q => q.lock === "update")).toBe(true);
    expect(db.outer.select).not.toHaveBeenCalled();
  });

  it("exige convênio, competência e XML vigente no contrato de liberar lote", async () => {
    banco([conta(1)]);
    for (const campo of ["convenioId", "competencia", "arquivoXmlFinalId"]) {
      const input: any = { ...identidade };
      delete input[campo];
      await expect(caller().liberarLoteAmbulatorialEnvio(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("irmã em setor não autorizado impede revisão inteira antes da primeira escrita", async () => {
    const db = banco([divergente(1), conta(2, { setorAtual: "auditoria_interna" })]);
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([divergente(1)]), justificativa: "Exceção contratual sintética", enviarAoConvenioAgora: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.escritas).toHaveLength(0);
    expect(db.rollbacks).toHaveBeenCalledOnce();
    expect(db.estado().contas[0].statusAuditoriaRegras).toBe("divergente");
  });

  it("não mistura irmãs de outro convênio ao justificar a mesma guia/lote", async () => {
    const a = divergente(1);
    const b = divergente(2, { convenioId: 56, numeroGuia: a.numeroGuia, setorAtual: "auditoria_interna" });
    const db = banco([a, b, conta(3)]);
    expect(await caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([a]), justificativa: "Exceção sintética" }))
      .toMatchObject({ totalRevisadas: 1, guiasConformesLiberadasJunto: 1 });
    expect(db.estado().contas[0]).toMatchObject({ statusAuditoriaRegras: "revisado", setorAtual: "enviado_convenio" });
    expect(db.estado().contas[1]).toMatchObject({ statusAuditoriaRegras: "divergente", setorAtual: "auditoria_interna" });
    expect(db.estado().contas[2]).toMatchObject({ statusAuditoriaRegras: "conforme", setorAtual: "enviado_convenio" });
  });

  it("recusa internação na revisão sem corrigir erros nem gravar histórico", async () => {
    const db = banco([divergente(1, { tipoAtendimento: "internacao" })]);
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([divergente(1)]), justificativa: "Exceção sintética" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.escritas).toHaveLength(0);
  });

  it.each([
    { statusAuditoriaRegras: "pendente" },
    { statusSetor: "em_andamento" },
    { statusSetor: "aguardando_terceiro" },
    { setorAtual: "recursos" },
    { setorAtual: "finalizado" },
    { totalDivergenciasRegras: 1 },
    { tipoAtendimento: "internacao" },
  ])("lote parcialmente inelegível falha fechado: %j", async (extras) => {
    const db = banco([conta(1), conta(2, extras)], { perfil: {
      ...perfil, setoresPermitidos: ["faturamento", "recursos", "limpeza_prontuario"],
    } });
    await expect(caller().liberarLoteAmbulatorialEnvio(identidade)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.escritas).toHaveLength(0);
    expect(db.commits).not.toHaveBeenCalled();
  });

  it.each(["liberar", "revisar"])("falha no histórico causa rollback de contas e corrigidos: %s", async (op) => {
    const db = banco([op === "revisar" ? divergente(1) : conta(1)], { erroHistorico: true });
    const inicial = structuredClone(db.estado());
    const action = op === "revisar"
      ? caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([divergente(1)]), justificativa: "Exceção sintética", enviarAoConvenioAgora: false })
      : caller().liberarLoteAmbulatorialEnvio(identidade);
    await expect(action).rejects.toThrow("Falha sintética de histórico");
    expect(db.escritas.some(e => e.tabela === "fabrica_contas")).toBe(true);
    expect(db.estado()).toEqual(inicial);
    expect(db.rollbacks).toHaveBeenCalledOnce();
    expect(db.commits).not.toHaveBeenCalled();
  });

  it("UPDATE stale com affectedRows=0 aborta todo o lote", async () => {
    const db = banco([conta(1), conta(2)], { stale: true });
    await expect(caller().liberarLoteAmbulatorialEnvio(identidade)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.estado().historico).toHaveLength(0);
    expect(db.rollbacks).toHaveBeenCalledOnce();
  });

  it("commit conforme legítimo não reclassifica regras nem corrige erros arbitrariamente", async () => {
    const db = banco([conta(1), conta(2, { statusAuditoriaRegras: "revisado" })]);
    expect(await caller().liberarLoteAmbulatorialEnvio(identidade)).toMatchObject({ sucesso: true, totalLiberadas: 2 });
    expect(db.estado().historico).toHaveLength(2);
    expect(db.estado().contas.map(c => c.statusAuditoriaRegras)).toEqual(["conforme", "revisado"]);
    expect(db.estado().erros.every(e => e.corrigido === "nao")).toBe(true);
    expect(db.outer.transaction).toHaveBeenCalledOnce();
  });

  it("preserva guarda comum Enviado/Recursos para lote já enviado", async () => {
    const db = banco([conta(1, { setorAtual: "enviado_convenio" })], {
      perfil: { ...perfil, setoresPermitidos: ["recursos"] },
    });
    expect(await caller().liberarLoteAmbulatorialEnvio(identidade)).toMatchObject({ totalLiberadas: 0 });
    expect(db.escritas).toHaveLength(0);
    expect(db.commits).toHaveBeenCalledOnce();
  });

  it("reimporta somente a mesma identidade e preserva XML original, dono, tipo e convênio", async () => {
    const a = divergente(1);
    const b = divergente(2, { convenioId: 56, numeroGuia: a.numeroGuia });
    const db = banco([a, b]);
    expect(await caller().importarLoteAmbulatorialXml(importInput)).toMatchObject({ totalAtualizadas: 1, totalCriadas: 0 });
    expect(db.estado().contas[0]).toMatchObject({ hospitalEstabelecimentoId: 3, convenioId: 55, tipoAtendimento: "ambulatorio_sadt",
      arquivoXmlFaturamentoId: 90, arquivoXmlFinalId: 200, statusAuditoriaRegras: "conforme" });
    expect(db.estado().contas[1]).toEqual(b);
    expect(db.estado().erros.map(e => e.corrigido)).toEqual(["sim", "nao"]);
    expect(mocks.criarXml).toHaveBeenCalledOnce();
    expect(mocks.confirmarXml).toHaveBeenCalledOnce();
  });

  it("mesma guia em competência diferente cria snapshot sem sobrescrever anterior", async () => {
    const a = divergente(1);
    const db = banco([a], { snapshots: [resumo(a, { competencia: "2026/09" })] });
    expect(await caller().importarLoteAmbulatorialXml(importInput)).toMatchObject({ totalAtualizadas: 0, totalCriadas: 1 });
    expect(db.estado().contas[0]).toEqual(a);
    expect(db.estado().contas[1]).toMatchObject({ arquivoXmlFaturamentoId: 200, arquivoXmlFinalId: 200 });
  });

  it.each([
    { setorAtual: "auditoria_interna" },
    { setorAtual: "enviado_convenio" },
    { setorAtual: "finalizado" },
    { tipoAtendimento: "internacao" },
  ])("reimportação valida setor/estado/tipo de conta encontrada antes de qualquer escrita: %j", async (extras) => {
    const db = banco([divergente(1, extras)]);
    await expect(caller().importarLoteAmbulatorialXml(importInput)).rejects.toBeInstanceOf(TRPCError);
    expect(db.escritas).toHaveLength(0);
    expect(mocks.criarXml).not.toHaveBeenCalled();
  });

  it("snapshot incompatível impede revisão sem writes", async () => {
    const a = divergente(1);
    const db = banco([a], { snapshots: [resumo(a, { convenioId: 56 })] });
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([a]), justificativa: "Exceção sintética" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.escritas).toHaveLength(0);
  });

  it("erro no serviço de validação propaga e rollback mantém conta e histórico", async () => {
    const db = banco([divergente(1)]);
    const inicial = structuredClone(db.estado());
    mocks.validarGuia.mockRejectedValue(new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Validação indisponível" }));
    await expect(caller().importarLoteAmbulatorialXml(importInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.estado()).toEqual(inicial);
    expect(db.rollbacks).toHaveBeenCalledOnce();
    expect(db.commits).not.toHaveBeenCalled();
  });

  it("falha de materialização e de histórico na importação não é ignorada", async () => {
    const db = banco([divergente(1)]);
    const inicial = structuredClone(db.estado());
    mocks.popular.mockRejectedValueOnce(new Error("Materialização sintética falhou"));
    await expect(caller().importarLoteAmbulatorialXml(importInput)).rejects.toThrow("Materialização sintética falhou");
    expect(db.estado()).toEqual(inicial);
    const db2 = banco([divergente(1)], { erroHistorico: true });
    const inicial2 = structuredClone(db2.estado());
    await expect(caller().importarLoteAmbulatorialXml(importInput)).rejects.toThrow("Falha sintética de histórico");
    expect(db2.estado()).toEqual(inicial2);
    expect(db2.rollbacks).toHaveBeenCalledOnce();
  });

  it("irmã divergente não selecionada bloqueia envio de lote parcial antes de writes", async () => {
    const db = banco([divergente(1), divergente(2)]);
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([divergente(1)]), justificativa: "Exceção sintética" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.escritas).toHaveLength(0);
    expect(db.estado().contas.every(c => c.statusAuditoriaRegras === "divergente")).toBe(true);
  });

  it("revisão mista conforme/divergente não reclassifica a guia conforme", async () => {
    const db = banco([divergente(1), conta(2)]);
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1, 2], expectedSnapshots: expectedSnapshots([divergente(1), conta(2)]), justificativa: "Exceção sintética", enviarAoConvenioAgora: false }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.escritas).toHaveLength(0);
  });

  it.each([
    { statusAuditoriaRegras: "pendente" },
    { statusAuditoriaRegras: "conforme", totalDivergencias: 1 },
  ])("validação incompleta/incoerente nunca avança guia: %j", async (extras) => {
    const db = banco([divergente(1)]);
    const inicial = structuredClone(db.estado());
    mocks.validarGuia.mockResolvedValue({ ...validacaoConforme, ...extras });
    await expect(caller().importarLoteAmbulatorialXml({ ...importInput, enviarDiretoSeConforme: true }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.estado()).toEqual(inicial);
    expect(db.commits).not.toHaveBeenCalled();
  });

  it("identidade duplicada na reimportação falha fechado antes de criar XML", async () => {
    const db = banco([divergente(1), divergente(2, { numeroGuia: "GUIA-1" })]);
    await expect(caller().importarLoteAmbulatorialXml(importInput)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.escritas).toHaveLength(0);
    expect(mocks.criarXml).not.toHaveBeenCalled();
  });

  it("conexão sem transaction não admite fallback permissivo", async () => {
    const db = banco([conta(1)]);
    mocks.getDb.mockResolvedValue({ ...db.outer, transaction: undefined });
    await expect(caller().liberarLoteAmbulatorialEnvio(identidade)).rejects.toBeInstanceOf(TRPCError);
    expect(db.escritas).toHaveLength(0);
    expect(db.outer.select).not.toHaveBeenCalled();
  });

  it.each([
    { arquivoXmlFinalId: 200 },
    { contaConvenioResumoId: 2001 },
    { updatedAt: new Date("2026-10-15T12:00:01Z") },
  ])("snapshot humano stale em lote misto rejeita todas antes de writes/histórico: %j", async alteracao => {
    const abertaA = divergente(1);
    const abertaB = divergente(2);
    const expected = expectedSnapshots([abertaA, abertaB]);
    const db = banco([abertaA, divergente(2, alteracao)]);
    const inicial = structuredClone(db.estado());
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1, 2], expectedSnapshots: expected,
      justificativa: "Justificativa da versão X", enviarAoConvenioAgora: false })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.escritas).toEqual([]);
    expect(db.estado()).toEqual(inicial);
    expect(db.estado().historico).toEqual([]);
    expect(db.consultas[0].lock).toBe("update");
    expect(db.commits).not.toHaveBeenCalled();
  });

  it("reimportação X→Y mantém id; justificativa X falha e a versão Y conferida é válida", async () => {
    const abertaX = divergente(1);
    const expectedX = expectedSnapshots([abertaX]);
    const db = banco([abertaX]);
    mocks.validarGuia.mockResolvedValue({ ...validacaoConforme, statusAuditoriaRegras: "divergente", totalDivergencias: 1,
      erros: [{ tipoErro: "preco_divergente", camada: "TABELA_PRECO", severidade: "critico", descricaoErro: "Versão Y", impactoFinanceiro: 1 }] });
    await caller().importarLoteAmbulatorialXml(importInput);
    const conferidaY = db.estado().contas[0];
    expect(conferidaY.id).toBe(abertaX.id);
    expect(conferidaY.arquivoXmlFinalId).not.toBe(abertaX.arquivoXmlFinalId);
    expect(conferidaY.contaConvenioResumoId).not.toBe(abertaX.contaConvenioResumoId);
    const antes = db.escritas.length;
    const historicoAntes = db.estado().historico.length;
    await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedX,
      justificativa: "Justificativa X", enviarAoConvenioAgora: false })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.escritas).toHaveLength(antes);
    expect(db.estado().historico).toHaveLength(historicoAntes);
    expect(await caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expectedSnapshots([conferidaY]),
      justificativa: "Justificativa Y conferida", enviarAoConvenioAgora: false })).toMatchObject({ totalRevisadas: 1 });
    expect(db.estado().contas[0].statusAuditoriaRegras).toBe("revisado");
  });

  it.each([undefined, [], expectedSnapshots([divergente(2)]), [...expectedSnapshots([divergente(1)]), ...expectedSnapshots([divergente(1)])]])(
    "não aceita expected ausente, incompleto, extra ou duplicado (%j)", async expected => {
      const db = banco([divergente(1)]);
      await expect(caller().justificarELiberarGuiasAmbulatoriais({ contaIds: [1], expectedSnapshots: expected,
        justificativa: "Exceção sintética", enviarAoConvenioAgora: false } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(db.escritas).toEqual([]);
    });
});
