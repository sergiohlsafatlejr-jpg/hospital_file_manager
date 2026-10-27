import { describe, expect, it } from "vitest";
import {
  HOP_DIARIO_CRON,
  HOP_DIARIO_ORIGEM,
  construirPlanoHop,
  slotHopDiario,
  validarCoberturaHop,
  type HopDestinoRow,
} from "./atendimentosHopSnapshot";
import {
  HUP_ESTABELECIMENTO_ID,
  type HopUrologicoRow,
} from "./hopUrologicoMap";

const HUP = HUP_ESTABELECIMENTO_ID;
const IAD = 2550002;

function fonte(
  numatend: number | string = 101,
  extra: Partial<HopUrologicoRow> = {}
): HopUrologicoRow {
  return {
    numatend,
    codtipsai: "A",
    nomeplaco: "CONVENIO SINTETICO",
    nomepac: "PACIENTE SINTETICO",
    carater: "E",
    datatend: "2026-10-25 09:30:00",
    datasai: null,
    tipoatend: "I",
    codserv: "SERV",
    procprin: "PROC",
    codcc_destino: "DEST",
    tipoatendimentodescricao: "INTERNACAO",
    Estabelecimentos_id: String(HUP),
    ...extra,
  };
}

function destino(
  id: number,
  origemId = "101",
  extra: Partial<HopDestinoRow> = {}
): HopDestinoRow {
  return {
    id,
    estabelecimentoId: HUP,
    origemSistema: HOP_DIARIO_ORIGEM,
    origemId,
    ativoNaFonte: true,
    numero_atendimento: origemId,
    codigo_saida: "A",
    convenio: "CONVENIO SINTETICO",
    paciente: "PACIENTE SINTETICO",
    caracter_atendimento: "E",
    data_entrada: "2026-10-25 09:30:00",
    data_saida: null,
    tipo_atendimento: "I",
    descricao_atendimento: "INTERNACAO",
    codigo_servico: "SERV",
    codigo_procedimento: "PROC",
    destino_conta: "DEST",
    ...extra,
  };
}

function ids(linhas: Array<{ origemId: string }>): string[] {
  return linhas.map(linha => linha.origemId);
}

describe("construirPlanoHop", () => {
  it("planeja novos registros mapeados com origem WARLEINE e ativo na fonte", () => {
    const plano = construirPlanoHop(HUP, [fonte(102)], []);

    expect(ids(plano.fonteMapeada)).toEqual(["102"]);
    expect(ids(plano.novas)).toEqual(["102"]);
    expect(plano.novas[0]).toMatchObject({
      estabelecimentoId: HUP,
      origemSistema: "WARLEINE",
      origemId: "102",
      numero_atendimento: "102",
      ativoNaFonte: 1,
    });
    expect(plano.contagens).toMatchObject({
      totalFonte: 1,
      novos: 1,
      ativosDepois: 1,
    });
  });

  it("classifica alteração apenas de campo Hop mapeado como atualização", () => {
    const plano = construirPlanoHop(
      HUP,
      [fonte(101, { codserv: "NOVO" })],
      [destino(7)]
    );

    expect(ids(plano.atualizadas)).toEqual(["101"]);
    expect(plano.reativadas).toHaveLength(0);
    expect(plano.inalteradas).toHaveLength(0);
    expect(plano.inativarIds).toEqual([]);
  });

  it("mantém byte a byte as datas civis e não desloca horário por timezone", () => {
    const civil = "2026-10-25 23:59:59";
    const plano = construirPlanoHop(
      HUP,
      [fonte(101, { datatend: civil, datasai: civil })],
      [destino(7, "101", { data_entrada: civil, data_saida: civil })]
    );

    expect(ids(plano.inalteradas)).toEqual(["101"]);
    expect(plano.inalteradas[0].data_entrada).toBe(civil);
    expect(plano.inalteradas[0].data_saida).toBe(civil);
  });

  it("não atualiza registro ativo quando somente metadata financeira, usuário ou identificador interno divergem", () => {
    const existente = destino(7, "101", {
      valorConta: "999.99",
      conta: "CONTA-INTERNA",
      userEtapa: "USUARIO_INTERNO",
      etapaConta: "EM_ANALISE",
      atualizadoEm: "2026-10-26 12:00:00",
    });
    const antes = structuredClone(existente);
    const plano = construirPlanoHop(HUP, [fonte()], [existente]);

    expect(ids(plano.inalteradas)).toEqual(["101"]);
    expect(plano.atualizadas).toHaveLength(0);
    expect(existente).toEqual(antes);
    expect("valorConta" in plano.inalteradas[0]).toBe(false);
    expect("userEtapa" in plano.inalteradas[0]).toBe(false);
  });

  it("reativa presença que estava inativa sem também classificá-la como atualização", () => {
    const plano = construirPlanoHop(
      HUP,
      [fonte()],
      [destino(7, "101", { ativoNaFonte: false, codserv: "ANTIGO" })]
    );

    expect(ids(plano.reativadas)).toEqual(["101"]);
    expect(plano.atualizadas).toHaveLength(0);
    expect(plano.inalteradas).toHaveLength(0);
    expect(plano.contagens).toMatchObject({ reativados: 1, atualizados: 0 });
  });

  it("classifica como inalterada uma conta reaparecida após sua reativação ter sido aplicada", () => {
    const reaparecida = construirPlanoHop(
      HUP,
      [fonte()],
      [destino(7, "101", { ativoNaFonte: false })]
    );
    const aposAplicacao = construirPlanoHop(
      HUP,
      reaparecida.fonteMapeada.map(mapeada => fonte(mapeada.origemId)),
      [destino(7)]
    );

    expect(ids(reaparecida.reativadas)).toEqual(["101"]);
    expect(ids(aposAplicacao.inalteradas)).toEqual(["101"]);
    expect(aposAplicacao.reativadas).toHaveLength(0);
  });

  it("inativa somente IDs ativos ausentes do snapshot do mesmo escopo", () => {
    const plano = construirPlanoHop(
      HUP,
      [fonte(101)],
      [
        destino(9, "103"),
        destino(7, "101"),
        destino(8, "102", { ativoNaFonte: false }),
      ]
    );

    expect(plano.inativarIds).toEqual([9]);
    expect(plano.contagens).toMatchObject({
      ativosAntes: 2,
      inativados: 1,
      ativosDepois: 1,
    });
  });

  it("ignora destinos de outra unidade ou origem sem inseri-los, atualizá-los ou inativá-los", () => {
    const plano = construirPlanoHop(
      HUP,
      [fonte()],
      [
        destino(7),
        destino(8, "102", { estabelecimentoId: IAD }),
        destino(9, "103", { origemSistema: "TASY" }),
      ]
    );

    expect(ids(plano.inalteradas)).toEqual(["101"]);
    expect(plano.inativarIds).toEqual([]);
    expect(plano.contagens.ativosAntes).toBe(1);
  });

  it("permite o mesmo numatend em HUP e IAD porque cada plano é estritamente isolado pela unidade", () => {
    const hup = construirPlanoHop(HUP, [fonte(777)], []);
    const iad = construirPlanoHop(
      IAD,
      [fonte(777, { Estabelecimentos_id: String(IAD) })],
      []
    );

    expect(hup.novas[0]).toMatchObject({
      estabelecimentoId: HUP,
      origemId: "777",
    });
    expect(iad.novas[0]).toMatchObject({
      estabelecimentoId: IAD,
      origemId: "777",
    });
  });

  it("é idempotente depois de aplicar conceitualmente as linhas novas e manter o destino ativo", () => {
    const primeiro = construirPlanoHop(HUP, [fonte(103), fonte(101)], []);
    const destinoAplicado = primeiro.fonteMapeada.map((linha, indice) =>
      destino(indice + 1, linha.origemId)
    );
    const segundo = construirPlanoHop(
      HUP,
      [fonte(101), fonte(103)],
      destinoAplicado
    );

    expect(segundo.novas).toHaveLength(0);
    expect(segundo.atualizadas).toHaveLength(0);
    expect(segundo.reativadas).toHaveLength(0);
    expect(ids(segundo.inalteradas)).toEqual(["101", "103"]);
    expect(segundo.inativarIds).toEqual([]);
  });

  it("rejeita saída HUP anterior à entrada, embora o mapeador físico HUP valide o formato", () => {
    expect(() =>
      construirPlanoHop(
        HUP,
        [fonte(101, { datasai: "2026-10-25 09:29:59" })],
        []
      )
    ).toThrow(/Fonte Hop inválida/);
  });

  it("rejeita schema físico inválido pela validação do mapeador, sem vazar PHI na mensagem", () => {
    const phI = "PACIENTE_QUE_NAO_DEVE_APARECER";
    let erro: unknown;
    try {
      construirPlanoHop(
        HUP,
        [fonte(101, { nomepac: phI, datatend: "2026-02-30 10:00:00" })],
        []
      );
    } catch (capturado) {
      erro = capturado;
    }

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe(
      "Fonte Hop inválida; publicação suspensa."
    );
    expect((erro as Error).message).not.toContain(phI);
  });

  it("rejeita chaves de fonte injetáveis, duplicadas, nulas, vazias ou fora do limite", () => {
    expect(() => construirPlanoHop(HUP, [fonte("101 OR 1=1")], [])).toThrow(
      /Fonte Hop inválida/
    );
    expect(() =>
      construirPlanoHop(HUP, [fonte(101), fonte("101")], [])
    ).toThrow(/Fonte Hop inválida/);
    expect(() =>
      construirPlanoHop(HUP, [fonte(null as unknown as number)], [])
    ).toThrow(/Fonte Hop inválida/);
    expect(() => construirPlanoHop(HUP, [fonte("")], [])).toThrow(
      /Fonte Hop inválida/
    );
    expect(() => construirPlanoHop(HUP, [fonte("1".repeat(101))], [])).toThrow(
      /Fonte Hop inválida/
    );
  });

  it("rejeita fonte vazia, acima de 100000 registros e estabelecimento não habilitado", () => {
    expect(() => construirPlanoHop(HUP, [], [])).toThrow(/Fonte Hop inválida/);
    expect(() =>
      construirPlanoHop(HUP, new Array(100_001).fill(fonte()), [])
    ).toThrow(/Fonte Hop inválida/);
    expect(() => construirPlanoHop(999, [fonte()], [])).toThrow(
      /Fonte Hop inválida/
    );
  });

  it("rejeita chaves, ID, status, datas e duplicidades inválidos no destino do escopo", () => {
    expect(() => construirPlanoHop(HUP, [fonte()], [destino(0)])).toThrow(
      /Destino Hop inválido/
    );
    expect(() => construirPlanoHop(HUP, [fonte()], [destino(7, "0")])).toThrow(
      /Destino Hop inválido/
    );
    expect(() =>
      construirPlanoHop(
        HUP,
        [fonte()],
        [destino(7, "101", { ativoNaFonte: "sim" as unknown as boolean })]
      )
    ).toThrow(/Destino Hop inválido/);
    expect(() =>
      construirPlanoHop(
        HUP,
        [fonte()],
        [destino(7, "101", { data_entrada: new Date() as unknown as string })]
      )
    ).toThrow(/Destino Hop inválido/);
    expect(() =>
      construirPlanoHop(HUP, [fonte()], [destino(7, "101"), destino(8, "101")])
    ).toThrow(/Destino Hop inválido/);
    expect(() =>
      construirPlanoHop(HUP, [fonte()], [destino(7, "101"), destino(7, "102")])
    ).toThrow(/Destino Hop inválido/);
  });

  it("produz fingerprint determinístico sem depender da ordem da fonte ou destino", () => {
    const a = construirPlanoHop(
      HUP,
      [fonte(103), fonte(101)],
      [destino(9, "103"), destino(7, "101")]
    );
    const b = construirPlanoHop(
      HUP,
      [fonte(101), fonte(103)],
      [destino(7, "101"), destino(9, "103")]
    );

    expect(a.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("altera fingerprint quando campos mapeados, ID ou status ativo do destino mudam", () => {
    const base = construirPlanoHop(HUP, [fonte()], [destino(7)]).fingerprint;
    const campo = construirPlanoHop(
      HUP,
      [fonte(101, { codserv: "OUTRO" })],
      [destino(7)]
    ).fingerprint;
    const id = construirPlanoHop(HUP, [fonte()], [destino(8)]).fingerprint;
    const status = construirPlanoHop(
      HUP,
      [fonte()],
      [destino(7, "101", { ativoNaFonte: false })]
    ).fingerprint;

    expect(campo).not.toBe(base);
    expect(id).not.toBe(base);
    expect(status).not.toBe(base);
  });
});

describe("validarCoberturaHop", () => {
  const contagens = (
    extra: Partial<ReturnType<typeof construirPlanoHop>["contagens"]> = {}
  ) => ({
    totalFonte: 100,
    ativosAntes: 100,
    novos: 0,
    atualizados: 0,
    reativados: 0,
    inalterados: 100,
    inativados: 0,
    ativosDepois: 100,
    ...extra,
  });

  it("aceita exatamente 80% para total ativo de pelo menos 100", () => {
    const resultado = validarCoberturaHop(
      contagens({
        totalFonte: 80,
        inalterados: 80,
        inativados: 20,
        ativosDepois: 80,
      })
    );

    expect(resultado).toMatchObject({
      cobertura: 80,
      coberturaMinimaAtendida: true,
      automaticoPermitido: true,
    });
  });

  it("bloqueia automático quando a cobertura fica abaixo de 80% em base de 100 ou mais", () => {
    const resultado = validarCoberturaHop(
      contagens({
        totalFonte: 79,
        inalterados: 79,
        inativados: 21,
        ativosDepois: 79,
      })
    );

    expect(resultado.automaticoPermitido).toBe(false);
    expect(resultado.requerEscolhaManual).toBe(true);
    expect(resultado.motivos).toContain("COBERTURA_INSUFICIENTE");
  });

  it("não aplica a guarda mínima de 80% quando havia menos de 100 ativos", () => {
    const resultado = validarCoberturaHop(
      contagens({
        totalFonte: 20,
        ativosAntes: 99,
        inalterados: 20,
        inativados: 49,
        ativosDepois: 20,
      })
    );

    expect(resultado.coberturaMinimaAtendida).toBe(true);
    expect(resultado.automaticoPermitido).toBe(true);
  });

  it("bloqueia automaticamente inativação estritamente superior a 50% e exige escolha manual explícita", () => {
    const resultado = validarCoberturaHop(
      contagens({
        totalFonte: 60,
        inalterados: 60,
        inativados: 51,
        ativosDepois: 60,
      })
    );

    expect(resultado.inativacaoSuspeita).toBe(true);
    expect(resultado.automaticoPermitido).toBe(false);
    expect(resultado.requerEscolhaManual).toBe(true);
    expect(resultado.motivos).toContain("INATIVACAO_SUSPEITA");
  });

  it("rejeita contagens inconsistentes em vez de permitir que um chamador contorne guardas", () => {
    expect(() =>
      validarCoberturaHop(
        contagens({ totalFonte: 10, inalterados: 9, ativosDepois: 10 })
      )
    ).toThrow(/Contagens Hop inconsistentes/);
  });
});

describe("slotHopDiario", () => {
  it("usa cron UTC de seis campos e aceita 10:00–10:02 em Brasília, inclusive em retry", () => {
    expect(HOP_DIARIO_CRON).toBe("0 0 13 * * *");
    expect(slotHopDiario(new Date("2026-10-27T13:00:00.000Z"))).toBe(
      "2026-10-27"
    );
    expect(slotHopDiario(new Date("2026-10-27T13:02:59.999Z"))).toBe(
      "2026-10-27"
    );
  });

  it("recusa horários fora da janela e data inválida sem depender do timezone da máquina", () => {
    expect(slotHopDiario(new Date("2026-10-27T12:59:59.999Z"))).toBeNull();
    expect(slotHopDiario(new Date("2026-10-27T13:03:00.000Z"))).toBeNull();
    expect(slotHopDiario(new Date("invalid"))).toBeNull();
  });
});
