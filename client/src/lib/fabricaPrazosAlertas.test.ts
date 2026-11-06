import { describe, expect, it } from "vitest";
import {
  calcularAlertasPrazoContaFabrica,
  PRAZO_FATURAMENTO_SAFATLE_HORAS,
  PRAZO_VENCIMENTO_GUIA_DIAS,
} from "./fabricaPrazosAlertas";

describe("fabricaPrazosAlertas — Gestão de Prazos na Esteira de Faturamento", () => {
  it("calcula vencimento da guia em 25 dias a partir da Data Alta e destaca quando vencida", () => {
    const agora = new Date("2026-11-06T10:00:00");
    const alerta = calcularAlertasPrazoContaFabrica(
      {
        dataEntrada: "2026-09-21",
        dataAlta: "2026-09-23",
        dataRecebimentoSafatle: "2026-11-03 08:00:00",
        horasNoSetorAtual: 74,
        setorAtual: "faturamento",
        statusSetor: "fila",
      },
      agora
    );

    expect(alerta.possuiDataAlta).toBe(true);
    expect(alerta.dataVencimentoGuiaFormatada).toBe("18/10/2026");
    expect(alerta.diasDesdeAlta).toBe(44);
    expect(alerta.diasExcedidosGuia).toBe(44 - PRAZO_VENCIMENTO_GUIA_DIAS);
    expect(alerta.guiaVencida25Dias).toBe(true);
    expect(alerta.diasParadosNoSetor).toBe(3);
    expect(alerta.tempoParadoSetorFormatado).toBe("3d 2h (74h)");
    expect(alerta.deveDestacarLinhaComoErro).toBe(true);
  });

  it("mantém guia dentro do prazo de 25 dias sem alerta crítico quando faltam dias", () => {
    const agora = new Date("2026-11-06T10:00:00");
    const alerta = calcularAlertasPrazoContaFabrica(
      {
        dataEntrada: "2026-10-25",
        dataAlta: "2026-10-27",
        dataRecebimentoSafatle: "2026-11-05 14:00:00",
        horasNoSetorAtual: 20,
        setorAtual: "faturamento",
        statusSetor: "em_andamento",
      },
      agora
    );

    expect(alerta.dataVencimentoGuiaFormatada).toBe("21/11/2026");
    expect(alerta.diasDesdeAlta).toBe(10);
    expect(alerta.diasRestantesGuia).toBe(15);
    expect(alerta.guiaVencida25Dias).toBe(false);
    expect(alerta.guiaEmAlertaPreventivo).toBe(false);
    expect(alerta.horasDesdeChegadaSafatle).toBe(20);
    expect(alerta.horasRestantesFaturamento60h).toBe(40);
    expect(alerta.prazoFaturamento60hEstourado).toBe(false);
    expect(alerta.deveDestacarLinhaComoErro).toBe(false);
  });

  it("aciona alerta de prazo de faturamento quando ultrapassa 60 horas da chegada na Safatle", () => {
    const agora = new Date("2026-11-06T10:00:00");
    const alerta = calcularAlertasPrazoContaFabrica(
      {
        dataEntrada: "2026-11-01",
        dataAlta: "2026-11-02",
        dataRecebimentoSafatle: "2026-11-03", // 03/11 às 08:00 -> até 06/11 às 10:00 = 74h (> 60h)
        horasNoSetorAtual: 74,
        setorAtual: "faturamento",
        statusSetor: "fila",
      },
      agora
    );

    expect(alerta.guiaVencida25Dias).toBe(false);
    expect(alerta.horasDesdeChegadaSafatle).toBe(74);
    expect(alerta.horasExcedidasFaturamento60h).toBe(
      74 - PRAZO_FATURAMENTO_SAFATLE_HORAS
    );
    expect(alerta.prazoFaturamento60hEstourado).toBe(true);
    expect(alerta.possuiAlertaCriticoPrazo).toBe(true);
    expect(alerta.deveDestacarLinhaComoErro).toBe(true);
  });

  it("não marca guia como vencida se já foi entregue ao convênio", () => {
    const agora = new Date("2026-11-06T10:00:00");
    const alerta = calcularAlertasPrazoContaFabrica(
      {
        dataEntrada: "2026-09-01",
        dataAlta: "2026-09-05",
        dataRecebimentoSafatle: "2026-09-10",
        horasNoSetorAtual: 10,
        setorAtual: "enviado_convenio",
        statusSetor: "concluido",
      },
      agora
    );

    expect(alerta.guiaEntregueConvenio).toBe(true);
    expect(alerta.guiaVencida25Dias).toBe(false);
    expect(alerta.prazoFaturamento60hEstourado).toBe(false);
    expect(alerta.deveDestacarLinhaComoErro).toBe(false);
  });
});
