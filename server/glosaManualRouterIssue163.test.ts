import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => { throw new Error("Banco real proibido"); }),
  verificarAcessoModulo: vi.fn(),
  verificarPermissaoEstabelecimento: vi.fn(),
  getConvenioById: vi.fn(),
  lancarGlosaManualDemonstrativo: vi.fn(),
  buscarGuiaFaturamentoParaGlosaManual: vi.fn(),
  consultarStatusGlosaManual: vi.fn(),
}));
vi.mock("./db", () => mocks);
vi.mock("./faturamentoUnificadoService", () => ({
  lancarGlosaManualDemonstrativo: mocks.lancarGlosaManualDemonstrativo,
  buscarGuiaFaturamentoParaGlosaManual: mocks.buscarGuiaFaturamentoParaGlosaManual,
}));
vi.mock("./glosaManualReconciliation", () => ({ consultarStatusGlosaManual: mocks.consultarStatusGlosaManual }));
vi.mock("./xmlRecursoService", () => ({}));
vi.mock("./conciliacaoJobManager", () => ({ iniciarJobConciliacao: vi.fn(), consultarJob: vi.fn(), jobEmAndamento: vi.fn() }));
vi.mock("./exportacaoConciliacaoService", () => ({ exportarConciliacaoExcel: vi.fn() }));
vi.mock("./marcarGlosadoService", () => ({ marcarItemComoGlosado: vi.fn(), desfazerMarcarGlosado: vi.fn() }));

import { faturamentoUnificadoRouter } from "./routers/faturamentoUnificadoRouter";
import { criarControleSubmissaoGlosaManual, glosaManualSubmissionSchema, type GlosaManualSubmissionInput } from "../shared/glosaManualSubmission";

const UUID = "c5d5c0c3-a6eb-4945-ae0e-2722b7c8ce66";
const item = {
  codigoItem: "SINTETICO-01", descricaoItem: "Procedimento sintético", quantidade: 1,
  valorInformado: 12.34, valorPago: 2.34, valorGlosa: 10,
  dataExecucao: "2026-11-03",
};
const input: GlosaManualSubmissionInput = {
  idempotencyKey: UUID, estabelecimentoId: 13, convenioId: 31,
  numeroGuia: "GUIA-SINTETICA", nomeBeneficiario: "Beneficiário sintético",
  dataPagamento: "2026-11-03", itens: [item],
};
const result = { success: true, totalInseridos: 1, idsInseridos: [101], dataPagamento: "2026-11-03", competencia: "2026-11" };

function caller(role: "admin" | "user" = "user", userId = 7) {
  return faturamentoUnificadoRouter.createCaller({ req: {} as any, res: {} as any, user: { id: userId, role } as any });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verificarPermissaoEstabelecimento.mockResolvedValue(true);
  mocks.getConvenioById.mockResolvedValue({ id: 31, estabelecimentoId: 13, ativo: "sim" });
  mocks.lancarGlosaManualDemonstrativo.mockResolvedValue(result);
  mocks.buscarGuiaFaturamentoParaGlosaManual.mockResolvedValue([]);
  mocks.consultarStatusGlosaManual.mockResolvedValue({ status: "nao_confirmado" });
});

describe("Issue163: mutation manual protegida", () => {
  it("read-only passa visualizar mas não alcança INSERT", async () => {
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_u, _h, tipo) => tipo === "visualizar");
    await expect(caller().lancarGlosaManualDemonstrativo(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 13, "editar");
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it("hospital não autorizado não alcança serviço nem convênio", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(caller().lancarGlosaManualDemonstrativo(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getConvenioById).not.toHaveBeenCalled();
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it.each([
    ["alheio", { id: 31, estabelecimentoId: 14, ativo: "sim" }],
    ["inativo", { id: 31, estabelecimentoId: 13, ativo: "nao" }],
    ["inexistente", null],
  ])("admin também não pode registrar em convênio %s", async (_label, conv) => {
    mocks.getConvenioById.mockResolvedValue(conv);
    await expect(caller("admin").lancarGlosaManualDemonstrativo(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it.each(["user", "admin"] as const)("%s aceita convênio global ativo mantendo hospital explícito", async role => {
    mocks.getConvenioById.mockResolvedValue({ id: 31, estabelecimentoId: null, ativo: "sim" });
    await expect(caller(role).lancarGlosaManualDemonstrativo(input)).resolves.toEqual(result);
    expect(mocks.lancarGlosaManualDemonstrativo).toHaveBeenCalledWith({ ...input, userId: 7 });
  });

  it("admin legítimo encaminha UUID explícito e identidade ao serviço simulado", async () => {
    await expect(caller("admin").lancarGlosaManualDemonstrativo(input)).resolves.toEqual(result);
    expect(mocks.verificarPermissaoEstabelecimento).toHaveBeenCalledWith(7, 13, "editar");
    expect(mocks.lancarGlosaManualDemonstrativo).toHaveBeenCalledWith({ ...input, userId: 7 });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("editor legítimo também é aceito", async () => {
    await expect(caller().lancarGlosaManualDemonstrativo(input)).resolves.toEqual(result);
    expect(mocks.lancarGlosaManualDemonstrativo).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", "GUIA-SINTETICA", "c5d5c0c3-a6eb-4945-ae0e-2722b7c8ce66-PACIENTE"])("nega chave ausente/não UUID (%s) sem inventar chave no backend", async key => {
    await expect(caller("admin").lancarGlosaManualDemonstrativo({ ...input, idempotencyKey: key } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it("retry encaminha a mesma chave sem gerar identificador alternativo", async () => {
    await caller("admin").lancarGlosaManualDemonstrativo(input);
    await caller("admin").lancarGlosaManualDemonstrativo(input);
    expect(mocks.lancarGlosaManualDemonstrativo.mock.calls.map(([params]) => params.idempotencyKey)).toEqual([UUID, UUID]);
  });

  it("consulta auxiliar também exige escrita e convênio proprietário", async () => {
    mocks.verificarPermissaoEstabelecimento.mockImplementation(async (_u, _h, tipo) => tipo === "visualizar");
    await expect(caller().buscarGuiaFaturamentoParaGlosaManual({ estabelecimentoId: 13, convenioId: 31, termo: "sintético" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.buscarGuiaFaturamentoParaGlosaManual).not.toHaveBeenCalled();
  });

  it("consulta auxiliar sem convênio não permite hospital alheio ao admin", async () => {
    mocks.verificarPermissaoEstabelecimento.mockResolvedValue(false);
    await expect(caller("admin").buscarGuiaFaturamentoParaGlosaManual({ estabelecimentoId: 14, termo: "sintético" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.buscarGuiaFaturamentoParaGlosaManual).not.toHaveBeenCalled();
  });

  it("status readonly encaminha exclusivamente UUID/hospital e usuário da sessão", async () => {
    await expect(caller("user", 42).consultarStatusGlosaManual({ estabelecimentoId: 13, idempotencyKey: UUID })).resolves.toEqual({ status: "nao_confirmado" });
    expect(mocks.consultarStatusGlosaManual).toHaveBeenCalledWith({ estabelecimentoId: 13, idempotencyKey: UUID, userId: 42 });
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(faturamentoUnificadoRouter._def.procedures.consultarStatusGlosaManual._def.type).toBe("query");
  });

  it("status nega usuário injetado, ID inválido e sessão ausente", async () => {
    const consulta = { estabelecimentoId: 13, idempotencyKey: UUID };
    await expect(caller().consultarStatusGlosaManual({ ...consulta, userId: 99 } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().consultarStatusGlosaManual({ ...consulta, estabelecimentoId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const anonimo = faturamentoUnificadoRouter.createCaller({ req: {} as any, res: {} as any, user: null });
    await expect(anonimo.consultarStatusGlosaManual(consulta)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.consultarStatusGlosaManual).not.toHaveBeenCalled();
  });
});

describe("Issue163: limites de entrada sem truncar nem arredondar", () => {
  it.each([
    { numeroGuia: "g".repeat(51) }, { protocolo: "p".repeat(51) },
    { lotePrestador: "l".repeat(51) }, { carteiraBeneficiario: "c".repeat(51) },
    { nomeBeneficiario: "n".repeat(256) }, { numeroGuia: "   " },
    { dataPagamento: "2026-02-29" }, { dataPagamento: "2026-11-31" },
    { dataPagamento: "2026-11-03T00:00:00Z" }, { dataPagamento: "0999-11-03" },
    { estabelecimentoId: 2_147_483_648 }, { convenioId: 1.5 },
    { itens: [] }, { itens: Array.from({ length: 501 }, () => item) },
  ])("mutation nega cabeçalho/lote inválido %j", async patch => {
    await expect(caller("admin").lancarGlosaManualDemonstrativo({ ...input, ...patch } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it.each([
    { codigoItem: "c".repeat(51) }, { tipoLancamento: "t".repeat(101) },
    { codigoGlosa: "c".repeat(501) }, { erroTiss: "e".repeat(501) },
    { descricaoItem: "d".repeat(65_536) }, { justificativa: "j".repeat(65_536) },
    { descricaoItem: "界".repeat(22_000) }, { justificativa: "界".repeat(22_000) },
    { descricaoItem: " " }, { dataExecucao: "2026-04-31" },
    { sequencialItem: 2_147_483_648 }, { quantidade: 0 },
    { quantidade: 1.0001 }, { quantidade: 1_000_000_000 },
    { valorInformado: 10_000_000_000 }, { valorPago: 0.001 },
    { valorInformado: 100_000_000 }, { valorPago: 100_000_000 }, { valorGlosa: 100_000_000 },
    { valorGlosa: 0.001 }, { valorInformado: -1 },
    { valorGlosa: Infinity }, { quantidade: NaN },
  ])("mutation nega item inválido %j", async patch => {
    await expect(caller("admin").lancarGlosaManualDemonstrativo({ ...input, itens: [{ ...item, ...patch }] } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.lancarGlosaManualDemonstrativo).not.toHaveBeenCalled();
  });

  it("aceita exatamente 500 itens e limites físicos válidos", async () => {
    const maxItem = {
      ...item, codigoItem: "c".repeat(50), descricaoItem: "d".repeat(65_535),
      tipoLancamento: "t".repeat(100), codigoGlosa: "c".repeat(500), erroTiss: "e".repeat(500),
      justificativa: "j".repeat(65_535), sequencialItem: 2_147_483_647,
      quantidade: 999_999_999.999, valorInformado: 99_999_999.99,
      valorPago: 0, valorGlosa: 99_999_999.99, dataExecucao: "2024-02-29",
    };
    const boundary = { ...input, numeroGuia: "g".repeat(50), protocolo: "p".repeat(50), lotePrestador: "l".repeat(50), carteiraBeneficiario: "c".repeat(50), nomeBeneficiario: "n".repeat(255), itens: [maxItem, ...Array.from({ length: 499 }, () => item)] };
    await expect(caller("admin").lancarGlosaManualDemonstrativo(boundary)).resolves.toEqual(result);
    expect(mocks.lancarGlosaManualDemonstrativo).toHaveBeenCalledWith({ ...boundary, userId: 7 });
  });

  it("mantém coerência financeira como responsabilidade do serviço", () => {
    expect(glosaManualSubmissionSchema.safeParse({ ...input, itens: [{ ...item, valorPago: 100 }] }).success).toBe(true);
  });
});

describe("Issue163: tentativa durável de submissão manual da UI", () => {
  const payload = () => {
    const { idempotencyKey: _key, ...data } = input;
    return structuredClone(data);
  };

  function armazenamento() {
    const mapa = new Map<string, string>();
    return { mapa, getItem: vi.fn((key: string) => mapa.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { mapa.set(key, value); }),
      removeItem: vi.fn((key: string) => { mapa.delete(key); }) };
  }
  const criar = (storage = armazenamento(), gerarUuid = vi.fn(() => UUID), userId = 7, estabelecimentoId = 13) =>
    criarControleSubmissaoGlosaManual({ userId, estabelecimentoId, storage: () => storage, gerarUuid });

  it("persiste ANTES do envio apenas UUID/estado/version, nunca payload/hash/guia/nome/valores", () => {
    const storage = armazenamento();
    const controle = criar(storage);
    expect(controle.preparar(payload())).toEqual(input);
    expect([...storage.mapa.keys()]).toEqual(["glosa-manual:v1:user:7:hospital:13"]);
    expect(JSON.parse([...storage.mapa.values()][0]!)).toEqual({ version: 1, estado: "pendente", uuid: UUID });
    const raw = [...storage.mapa.values()][0]!;
    for (const termo of [input.numeroGuia, input.nomeBeneficiario, "payload", "hash", "12.34", "itens", "dataPagamento"]) expect(raw).not.toContain(termo);
    expect(() => controle.preparar(payload())).toThrow("Aguarde");
  });

  it("payload A→B→A mantém uma única chave e retry usa snapshot original após HTTP perdido", () => {
    const gerar = vi.fn(() => UUID);
    const controle = criar(armazenamento(), gerar);
    expect(controle.chavePara(payload())).toBe(UUID);
    const a = payload();
    expect(controle.preparar(a)).toEqual(input);
    controle.falhou(UUID);
    a.itens[0]!.valorGlosa = 1; // mutação externa não modifica snapshot
    const alterado = payload();
    alterado.itens[0]!.valorGlosa = 9;
    expect(controle.chavePara(alterado)).toBe(UUID);
    expect(controle.chavePara(payload())).toBe(UUID);
    expect(controle.preparar(alterado)).toEqual(input);
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("remount/reload após commit HTTP perdido recupera só UUID; consulta ausente NUNCA reseta", () => {
    const storage = armazenamento();
    const gerar = vi.fn(() => UUID);
    criar(storage, gerar).preparar(payload()); // original pode ter commitado sem resposta
    const reload = criar(storage, gerar);
    expect(reload.estado()).toMatchObject({ key: UUID, pendente: true, emVoo: false, temPayload: false });
    expect(() => reload.preparar()).toThrow("Retome");
    reload.reconciliar({ status: "nao_confirmado" }, UUID);
    expect(() => reload.resetAposConfirmacao(UUID)).toThrow("sem resultado confirmado");
    expect(storage.removeItem).not.toHaveBeenCalled();
    const b = payload(); b.numeroGuia = "RETOMADA-SINTETICA-DIFERENTE";
    // A única possibilidade de reenvio usa a MESMA UUID: backend negocia CONFLICT.
    expect(reload.preparar(b).idempotencyKey).toBe(UUID);
    expect(gerar).toHaveBeenCalledTimes(1);
    reload.falhou(UUID);
    reload.reconciliar({ status: "concluido", totalInseridos: 1, dataPagamento: "2026-11-03", competencia: "2026-11" }, UUID);
    reload.resetAposConfirmacao(UUID);
    expect(storage.mapa.size).toBe(0);
    expect(reload.estado()).toMatchObject({ pendente: false, temPayload: false });
  });

  it("namespace separa usuário/hospital; confirmação de outra chave é recusada", () => {
    const storage = armazenamento();
    const controle = criar(storage); controle.preparar(payload()); controle.falhou(UUID);
    expect(criar(storage, vi.fn(() => UUID), 8).estado().pendente).toBe(false);
    expect(criar(storage, vi.fn(() => UUID), 7, 14).estado().pendente).toBe(false);
    expect(() => controle.reconciliar({ status: "concluido", totalInseridos: 1, dataPagamento: "2026-11-03", competencia: "2026-11" }, "73b9d11a-02ae-4e1c-838f-0fe4dbff9257")).toThrow("fora do escopo");
    expect(storage.mapa.size).toBe(1);
  });

  it.each(["get", "set", "silent", "malformed"])("storage %s falha fechado antes da mutation sem gerar outra chave", modo => {
    const storage = armazenamento();
    if (modo === "get") storage.getItem.mockImplementation(() => { throw new Error("Indisponível"); });
    if (modo === "set") storage.setItem.mockImplementation(() => { throw new Error("Quota"); });
    if (modo === "silent") storage.setItem.mockImplementation(() => undefined);
    if (modo === "malformed") storage.mapa.set("glosa-manual:v1:user:7:hospital:13", '{"version":1,"estado":"pendente","uuid":"invalid"}');
    const controle = criar(storage);
    const mutation = vi.fn();
    expect(() => mutation(controle.preparar(payload()))).toThrow();
    expect(mutation).not.toHaveBeenCalled();
    expect(() => mutation(controle.preparar(payload()))).toThrow();
    expect(controle.estado().erroPersistencia).toBeTruthy();
  });

  it("remoção do registro após erro é falha fechada, nunca autorização para outro UUID", () => {
    const storage = armazenamento(); const gerar = vi.fn(() => UUID);
    const controle = criar(storage, gerar);
    controle.preparar(payload()); controle.falhou(UUID);
    storage.mapa.clear();
    expect(() => controle.preparar(payload())).toThrow("Nenhum novo envio");
    expect(controle.estado()).toMatchObject({ key: UUID, pendente: true });
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("commit confirmado por consulta após remontagem libera a próxima tentativa só após reset confirmado", async () => {
    const storage = armazenamento();
    const outro = "73b9d11a-02ae-4e1c-838f-0fe4dbff9257";
    const gerar = vi.fn().mockReturnValueOnce(UUID).mockReturnValueOnce(outro);
    const tentativa = criar(storage, gerar).preparar(payload());
    await caller().lancarGlosaManualDemonstrativo(tentativa); // commit backend confirmado, HTTP perdido na UI
    const remontagem = criar(storage, gerar);
    mocks.consultarStatusGlosaManual.mockResolvedValue({ status: "concluido", totalInseridos: 1, dataPagamento: result.dataPagamento, competencia: result.competencia });
    const status = await caller().consultarStatusGlosaManual({ estabelecimentoId: 13, idempotencyKey: remontagem.estado().key! });
    remontagem.reconciliar(status, UUID);
    expect(() => remontagem.preparar(payload())).toThrow("Aguarde");
    remontagem.resetAposConfirmacao(UUID);
    expect(remontagem.preparar(payload()).idempotencyKey).toBe(outro);
    expect(mocks.lancarGlosaManualDemonstrativo).toHaveBeenCalledTimes(1);
  });

  it("nova submissão após sucesso/reset gera UUID independente mesmo com payload igual", () => {
    const outro = "73b9d11a-02ae-4e1c-838f-0fe4dbff9257";
    const gerar = vi.fn().mockReturnValueOnce(UUID).mockReturnValueOnce(outro);
    const controle = criar(armazenamento(), gerar);
    expect(controle.preparar(payload()).idempotencyKey).toBe(UUID);
    controle.reconciliar({ status: "concluido", totalInseridos: 1, dataPagamento: "2026-11-03", competencia: "2026-11" }, UUID);
    controle.resetAposConfirmacao(UUID);
    expect(controle.preparar(payload()).idempotencyKey).toBe(outro);
    expect(gerar).toHaveBeenCalledWith();
  });

  it("UI usa useAuth e política global, congela formulário e limpa tudo antes de reset/fechar", () => {
    const ui = readFileSync(new URL("../client/src/components/LancamentoGlosaManualDialog.tsx", import.meta.url), "utf8");
    expect(ui).toContain('{ ativo: "sim", estabelecimentoId }');
    expect(ui).toContain('c.estabelecimentoId === null || c.estabelecimentoId === estabelecimentoId');
    expect(ui).toContain("const { user } = useAuth()");
    expect(ui).toContain('key={`${user.id}:${props.estabelecimentoId}`}');
    expect(ui).toContain("storage: () => window.sessionStorage");
    expect(ui).toContain('<fieldset disabled={formularioBloqueado}');
    expect(ui).toContain('if (res.status !== "concluido") return');
    expect(ui.indexOf("limparFormulario();")).toBeLessThan(ui.indexOf("submissao.resetAposConfirmacao(key)"));
    for (const campo of ["ConvenioId", "NumeroGuia", "Protocolo", "LotePrestador", "DataPagamento", "NomeBeneficiario", "CarteiraBeneficiario", "CodigoGlosaPadrao", "BuscaMotivo", "TermoBuscaFaturamento", "TermoSubmetido"]) expect(ui).toContain(`set${campo}("")`);
    expect(ui).toContain('setItens([criarItemVazio("")])');
    expect(ui).not.toContain("useQuery({}, { enabled: open })");
    expect(ui.indexOf("submissao.preparar(validacao.data)")).toBeLessThan(ui.lastIndexOf("lancarMutation.mutate(tentativa)"));
    expect(ui).not.toContain("submissao.reset()");
    expect(ui).not.toContain("itens.filter(");
  });
});
