import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AtendimentosHopDiarioPainel,
  avaliarAcoesHopDiario,
  criarChaveEscopoHopDiario,
  criarFixtureHopDiarioPainel,
  fonteHopDiario,
  podeConfirmarCargaInicial,
  previaEstaValida,
} from "../client/src/components/integrador/AtendimentosHopDiario";
import type {
  HopDiarioPrevia,
  HopDiarioResumo,
} from "../shared/atendimentosHopDiario";

function fixture(overrides = {}) {
  return criarFixtureHopDiarioPainel(overrides);
}

function resumo(overrides: Partial<HopDiarioResumo> = {}): HopDiarioResumo {
  return fixture().resumo
    ? { ...fixture().resumo!, ...overrides }
    : (() => {
        throw new Error("fixture sintética sem resumo");
      })();
}

function previa(overrides: Partial<HopDiarioPrevia> = {}): HopDiarioPrevia {
  return fixture().previa
    ? { ...fixture().previa!, ...overrides }
    : (() => {
        throw new Error("fixture sintética sem prévia");
      })();
}

function render(props = {}) {
  return renderToStaticMarkup(
    createElement(AtendimentosHopDiarioPainel, fixture(props))
  );
}

describe("UI do snapshot diário Hop", () => {
  it("limita estritamente o escopo às unidades e stagings permitidas", () => {
    expect(fonteHopDiario(1260036)).toMatchObject({
      unidade: "Hospital Urológico",
      staging: "stagion_atendimentos_parados_urologico",
      origem: "WARLEINE",
      chave: "numatend",
      destino: "atendimentos_unificados",
    });
    expect(fonteHopDiario(2550002)).toMatchObject({
      unidade: "IAD",
      staging: "stagion_atendimentos_parados_iad",
    });
    expect(fonteHopDiario(1)).toBeNull();
    expect(fonteHopDiario(null)).toBeNull();
    expect(criarChaveEscopoHopDiario(1260036)).not.toBe(
      criarChaveEscopoHopDiario(2550002)
    );
    expect(
      render({ estabelecimentoId: 999, resumo: null, previa: null })
    ).toContain("Unidade fora da allowlist");
  });

  it("expõe todas as contagens da prévia e explica que ausentes não são exclusão histórica", () => {
    const html = render();
    for (const rotulo of [
      "Total na fonte",
      "Ativos antes",
      "Novos",
      "Atualizados",
      "Reativados",
      "Inativados",
      "Inalterados",
      "Ativos depois",
    ]) {
      expect(html).toContain(rotulo);
    }
    expect(html).toContain("isso não exclui histórico");
    expect(html).toContain("atendimentos_unificados");
    expect(html).toContain("10:00");
    expect(html).toContain("America/Sao_Paulo");
  });

  it("mantém a fixture visual com identidades coerentes das contagens", () => {
    const contagens = fixture().previa!.contagens;
    expect(contagens.totalFonte).toBe(48);
    expect(
      contagens.novos +
        contagens.atualizados +
        contagens.reativados +
        contagens.inalterados
    ).toBe(contagens.totalFonte);
    expect(
      contagens.ativosAntes -
        contagens.inativados +
        contagens.novos +
        contagens.reativados
    ).toBe(contagens.ativosDepois);
    expect(fixture().resumo!.execucoes[0]?.estado).toBe("concluida");
  });

  it("bloqueia confirmação da primeira carga sem as duas declarações explícitas", () => {
    const base = resumo({ ultimoLote: null, estado: "pausado" });
    expect(podeConfirmarCargaInicial(base, true, false)).toBe(false);
    expect(podeConfirmarCargaInicial(base, false, true)).toBe(false);
    expect(podeConfirmarCargaInicial(base, false, false)).toBe(false);
    expect(podeConfirmarCargaInicial(base, true, true)).toBe(true);
    expect(
      podeConfirmarCargaInicial({ ...base, estado: "incerto" }, true, true)
    ).toBe(false);
    expect(
      podeConfirmarCargaInicial(
        { ...base, configuracaoPendente: true },
        true,
        true
      )
    ).toBe(false);
  });

  it("preserva bloqueio sob concorrência incerta e exige lote completo para prévia", () => {
    const completa = resumo({ estado: "pausado" });
    expect(avaliarAcoesHopDiario(completa, null).podePrepararPrevia).toBe(true);
    expect(
      avaliarAcoesHopDiario(
        {
          ...completa,
          ultimoLote: { ...completa.ultimoLote!, estado: "carregando" },
        },
        null
      ).podePrepararPrevia
    ).toBe(false);
    for (const estado of ["preparando", "incerto"] as const) {
      const acoes = avaliarAcoesHopDiario({ ...completa, estado }, previa());
      expect(acoes.bloqueadoPorConcorrencia).toBe(true);
      expect(acoes.podePrepararPrevia).toBe(false);
      expect(acoes.podePublicar).toBe(false);
      expect(acoes.podeAtivar).toBe(false);
      expect(acoes.podePausar).toBe(false);
    }
  });

  it("bloqueia toda mutação no estado de erro até conferência técnica", () => {
    const acoes = avaliarAcoesHopDiario(resumo({ estado: "erro" }), previa());
    expect(acoes.bloqueadoPorRevisaoTecnica).toBe(true);
    expect(acoes.podeGerarCredencial).toBe(false);
    expect(acoes.podeRegistrarCarga).toBe(false);
    expect(acoes.podePrepararPrevia).toBe(false);
    expect(acoes.podePublicar).toBe(false);
    expect(acoes.podeAtivar).toBe(false);
    expect(acoes.podePausar).toBe(false);
    expect(render({ resumo: resumo({ estado: "erro" }) })).toContain(
      "Erro requer conferência técnica"
    );
  });

  it("exige credencial Hop configurada para ativação, mas não para preparar ou publicar a prévia", () => {
    const semCredencial = resumo({ credencialHopConfigurada: false });
    const acoes = avaliarAcoesHopDiario(semCredencial, previa());
    expect(acoes.podePrepararPrevia).toBe(true);
    expect(acoes.podePublicar).toBe(true);
    expect(acoes.podeAtivar).toBe(false);
  });

  it("vincula publicação e ativação a prévia válida de no máximo quinze minutos", () => {
    expect(previaEstaValida(previa(), Date.now())).toBe(true);
    expect(
      previaEstaValida(
        previa({ expiraEm: new Date(Date.now() - 1).toISOString() }),
        Date.now()
      )
    ).toBe(false);
    const html = render({
      previa: previa({ expiraEm: new Date(Date.now() - 1).toISOString() }),
    });
    expect(html).toContain("Prévia expirada");
    expect(html).not.toContain("Confirmar e publicar agora");
  });

  it("declara configuração pendente como não funcional e lista no máximo dez execuções", () => {
    const pendente = resumo({
      configuracaoPendente: true,
      estado: "nao_configurado",
    });
    expect(render({ resumo: pendente, previa: null })).toContain(
      "Configuração pendente — fluxo ainda não funcional"
    );

    const muitasExecucoes = Array.from({ length: 11 }, (_, indice) => ({
      ...resumo().execucoes[0],
      id: indice + 1,
    }));
    const html = render({
      resumo: resumo({ execucoes: muitasExecucoes }),
      previa: null,
    });
    expect(html).toContain("#");
    expect((html.match(/manual/g) ?? []).length).toBe(10);
  });

  it("mantém credencial efêmera e não introduz persistência, logs, autorun ou mutações com retry", () => {
    const ui = readFileSync(
      new URL(
        "../client/src/components/integrador/AtendimentosHopDiario.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const pagina = readFileSync(
      new URL("../client/src/pages/IntegradorEasyLocal.tsx", import.meta.url),
      "utf8"
    );
    expect(ui).toContain("gerarCredencial.useMutation");
    expect(ui).toContain("credencial será exibida uma única vez");
    expect(ui).toContain("setCredencialGerada(null)");
    expect(ui).toContain("confirmarGuardaSeguraCredencial");
    expect(ui).toContain("confirmarProtocoloEscritores");
    expect(ui).toContain("todos os escritores das duas stagings");
    expect(ui).toContain("antes de qualquer escrita na");
    expect(ui).toContain("após o commit bem-sucedido");
    expect(ui).toContain("legado concorrente deve estar");
    expect(ui).toContain("confirmarCargaCompleta: true");
    expect(ui).toContain("confirmarHopParado: true");
    expect(ui).toContain("confirmarEspelhamento: true");
    expect(ui).toContain("retry: false");
    expect(ui).not.toMatch(
      /localStorage|sessionStorage|console\.|setInterval|node-cron/
    );
    expect(pagina.indexOf("<EasyLocalIntegradorTabs")).toBeLessThan(
      pagina.indexOf("<AtendimentosHopDiario")
    );
  });

  it("remove o cast temporário e usa somente os hooks tRPC canônicos", () => {
    const ui = readFileSync(
      new URL(
        "../client/src/components/integrador/AtendimentosHopDiario.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(ui).toContain("trpc.atendimentosHopDiario.resumo.useQuery");
    expect(ui).toContain("trpc.atendimentosHopDiario.ativar.useMutation");
    expect(ui).not.toContain("RouterHopDiarioPendente");
    expect(ui).not.toContain("MutacaoHopDiario");
    expect(ui).not.toContain("as unknown as");
    expect(ui).not.toMatch(/taskUid|sessionTokenFromCookie/);
  });
});
