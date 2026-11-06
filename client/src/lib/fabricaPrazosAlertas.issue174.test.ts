import { describe, expect, it } from "vitest";
import { calcularAlertasPrazoContaFabrica, parseDataChegadaSafatle } from "./fabricaPrazosAlertas";
import { parseDataAltaPrazo, parseDataPrazoEstrita } from "./fabricaPrazoDatas";

const agora = new Date("2026-11-06T20:00:00-03:00");

describe("Issue #174 — calendário estrito sem normalização silenciosa", () => {
  it.each([
    "2026-02-31", "2026-02-29", "2100-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00", "0000-01-01",
    "31/02/2026", "2026-02-31T08:00:00Z", "2026-04-31 08:00:00", "2026-11-04T24:00:00", "2026-11-04T08:60:00",
    "2026-11-04T08:00:60Z", "2026-11-04T08:00:00+25:00", "2026-11-04T08:00:00-03:70", "2026-11-04T08:00:00+14:01",
    "11/04/26", "amanhã", "2026-1-01", "",
  ])("recusa data impossível ou timestamp inválido %s", (raw) => {
    expect(parseDataChegadaSafatle(raw)).toBeNull();
    const alerta = calcularAlertasPrazoContaFabrica({ dataAlta: raw, dataRecebimentoSafatle: raw, setorAtual: "faturamento" }, agora);
    expect(alerta.possuiDataAlta).toBe(false);
    expect(alerta.possuiDataRecebimentoSafatle).toBe(false);
    expect(alerta.guiaVencida25Dias).toBe(false);
    expect(alerta.prazoFaturamento60hEstourado).toBe(false);
    expect(alerta.dataLimiteFaturamento60h).toBeNull();
  });
  it.each(["2024-02-29", "2000-02-29", "2026-04-30", "2026-12-31", "29/02/2024", "0099-01-01"])("aceita calendário válido %s", (raw) => {
    expect(parseDataChegadaSafatle(raw)).not.toBeNull();
  });
  it("chegada civil é 08h local e Alta não recua um dia", () => {
    const chegada = parseDataChegadaSafatle("2026-11-04")!;
    expect([chegada.getDate(), chegada.getHours()]).toEqual([4, 8]);
    const alta = parseDataAltaPrazo("2026-11-04")!;
    expect([alta.getDate(), alta.getHours()]).toEqual([4, 12]);
    expect(parseDataAltaPrazo(new Date("2026-11-04T00:00:00Z"))?.getDate()).toBe(4);
    expect(parseDataAltaPrazo("2026-11-04T00:00:00Z")?.getDate()).toBe(4);
  });
  it("timestamp válido preserva instante e zona, inclusive meia-noite UTC e fração", () => {
    for (const raw of ["2026-11-04T00:00:00Z", "2026-11-04T08:00:00-03:00", "2026-11-04T08:00:00+0530", "2026-11-04T08:00:00.123Z"]) {
      expect(parseDataChegadaSafatle(raw)?.getTime()).toBe(new Date(raw).getTime());
    }
    const timestamp = new Date("2026-11-04T00:00:00Z");
    expect(parseDataChegadaSafatle(timestamp)?.getTime()).toBe(timestamp.getTime());
    expect(parseDataChegadaSafatle("2026-11-04 00:00:00")?.getHours()).toBe(0);
    expect(parseDataPrazoEstrita(new Date(NaN))).toBeNull();
  });
  it("entrada de setor inválida não gera duração e zero conhecido não vira duração inferida", () => {
    expect(calcularAlertasPrazoContaFabrica({ entradaSetorAtualEm: "2026-02-31" }, agora).horasNoSetor).toBe(0);
    expect(calcularAlertasPrazoContaFabrica({ entradaSetorAtualEm: "2026-11-01", horasNoSetorAtual: 0 }, agora).horasNoSetor).toBe(0);
  });
});

describe("Issue #174 — contratos estritos >25 dias e >60 horas", () => {
  it.each([[24, false], [25, false], [26, true]] as const)("%s dias de alta: vencida=%s", (dias, vencida) => {
    const alta = new Date(agora.getTime()); alta.setDate(alta.getDate() - dias);
    const civil = `${alta.getFullYear()}-${String(alta.getMonth() + 1).padStart(2, "0")}-${String(alta.getDate()).padStart(2, "0")}`;
    const alerta = calcularAlertasPrazoContaFabrica({ dataAlta: civil, setorAtual: "faturamento" }, agora);
    expect(alerta.diasDesdeAlta).toBe(dias);
    expect(alerta.guiaVencida25Dias).toBe(vencida);
    expect(alerta.diasExcedidosGuia).toBe(dias > 25 ? dias - 25 : 0);
  });
  it.each([[59, false], [60, false], [61, true]] as const)("%s horas de chegada: SLA estourado=%s", (horas, estourado) => {
    const chegada = new Date(agora.getTime() - horas * 3600000).toISOString();
    const alerta = calcularAlertasPrazoContaFabrica({ dataRecebimentoSafatle: chegada, setorAtual: "faturamento" }, agora);
    expect(alerta.horasDesdeChegadaSafatle).toBe(horas);
    expect(alerta.prazoFaturamento60hEstourado).toBe(estourado);
  });
  it("mantém contagem em horas inteiras existente e alerta preventivo de 48 horas", () => {
    const chegada = "2026-11-04 08:00:00";
    expect(calcularAlertasPrazoContaFabrica({ dataRecebimentoSafatle: chegada, setorAtual: "faturamento" }, agora).horasDesdeChegadaSafatle).toBe(60);
    expect(calcularAlertasPrazoContaFabrica({ dataRecebimentoSafatle: chegada, setorAtual: "faturamento" }, new Date("2026-11-06T20:59:59-03:00")).prazoFaturamento60hEstourado).toBe(false);
    expect(calcularAlertasPrazoContaFabrica({ dataRecebimentoSafatle: chegada, setorAtual: "faturamento" }, new Date("2026-11-06T08:00:00-03:00")).prazoFaturamento60hEmAlerta).toBe(true);
  });
  it.each(["enviado_convenio", "recursos", "finalizado"])("guia entregue no setor %s não alerta prazo", (setorAtual) => {
    const alerta = calcularAlertasPrazoContaFabrica({ dataAlta: "2026-09-01", dataRecebimentoSafatle: "2026-09-01", setorAtual }, agora);
    expect(alerta.guiaEntregueConvenio).toBe(true);
    expect(alerta.guiaVencida25Dias).toBe(false);
    expect(alerta.prazoFaturamento60hEstourado).toBe(false);
  });
  it.each(["faturamento", "recepcao", "auditoria_interna"])("faturamento concluído ou setor posterior %s não alerta SLA", (setorAtual) => {
    expect(calcularAlertasPrazoContaFabrica({ dataRecebimentoSafatle: "2026-09-01", setorAtual, statusSetor: "concluido" }, agora).prazoFaturamento60hEstourado).toBe(false);
  });
  it("ausência e datas futuras não fabricam alertas", () => {
    expect(calcularAlertasPrazoContaFabrica({}, agora).possuiAlertaCriticoPrazo).toBe(false);
    const alerta = calcularAlertasPrazoContaFabrica({ dataAlta: "2026-12-01", dataRecebimentoSafatle: "2026-12-01" }, agora);
    expect(alerta.diasDesdeAlta).toBe(0); expect(alerta.horasDesdeChegadaSafatle).toBe(0);
    expect(alerta.possuiAlertaCriticoPrazo).toBe(false);
  });
});
