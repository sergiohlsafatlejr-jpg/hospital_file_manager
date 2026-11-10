import { describe, expect, it } from "vitest";
import {
  WARLEINE_XLSX_HEADERS,
  assertWarleineDeadline,
  isWarleineSnapshotCoverageSafe,
  normalizeWarleineCompetencia,
  normalizeWarleineHeader,
  parseWarleineCivilDate,
  parseWarleineDecimal,
  parseWarleineRow,
  splitWarleineCsvLine,
} from "./warleineFaturamentoImportService";

function validRow(): unknown[] {
  const row = Array<unknown>(48).fill("");
  row[0] = "UNIMED";
  row[1] = "1";
  row[2] = "2026/06";
  row[3] = "123";
  row[5] = "M";
  row[7] = "456";
  row[10] = "PACIENTE TESTE";
  row[12] = new Date("2026-06-01T00:00:00.000Z");
  row[13] = "01/06/2026";
  row[14] = "2026-06-02";
  row[15] = "999";
  row[18] = "SERVIÇO TESTE";
  row[20] = "S";
  row[25] = 2;
  row[26] = 100;
  row[27] = 80;
  row[28] = 0;
  row[29] = 80;
  row[30] = 10;
  row[31] = 10;
  row[32] = 5;
  row[33] = 3;
  row[34] = 0;
  row[35] = 2;
  row[47] = 50;
  return row;
}

describe("importador de faturamento Warleine", () => {
  it("mantém os 48 cabeçalhos posicionais, inclusive as duas ocorrências de descricao e codrecur", () => {
    expect(WARLEINE_XLSX_HEADERS).toHaveLength(48);
    expect(WARLEINE_XLSX_HEADERS.filter((header) => header === "descricao")).toHaveLength(2);
    expect(WARLEINE_XLSX_HEADERS.filter((header) => header === "codrecur")).toHaveLength(2);
    expect(normalizeWarleineHeader(" NOMEConv ")).toBe("nomeconv");
    expect(normalizeWarleineHeader('"nomeconv"')).toBe("nomeconv");
  });

  it("divide linha CSV com ponto e vírgula e preserva campos entre aspas", () => {
    const csvHeader = WARLEINE_XLSX_HEADERS.map((h) => `"${h}"`).join(";");
    const cols = splitWarleineCsvLine(csvHeader);
    expect(cols).toHaveLength(48);
    expect(cols.map(normalizeWarleineHeader)).toEqual([...WARLEINE_XLSX_HEADERS]);
  });

  it("normaliza competência, datas civis e valores sem usar ponto flutuante no banco", () => {
    expect(normalizeWarleineCompetencia("2026/6")).toBe("2026/06");
    expect(parseWarleineCivilDate("31/08/2026")).toBe("2026-08-31");
    expect(parseWarleineCivilDate("31/02/2026")).toBeNull();
    expect(parseWarleineDecimal("1.234,5678")).toBe("1234.5678");
    expect(parseWarleineDecimal("9007199254740991,1234")).toBe("9007199254740991.1234");
    expect(parseWarleineDecimal("1,23445")).toBe("1.2345");
  });

  it("mapeia as duas descrições para Paciente e Serviço e preserva valores da fonte", () => {
    const parsed = parseWarleineRow(validRow());
    expect(parsed.errors).toEqual([]);
    expect(parsed.canonical).toMatchObject({
      pacienteNome: "PACIENTE TESTE",
      servicoNome: "SERVIÇO TESTE",
      competencia: "2026/06",
      numeroConta: "456",
      valorFaturado: "100.0000",
      valorTotalRecebido: "80.0000",
      valorGlosa: "10.0000",
    });
  });

  it("quarentena linha estruturalmente deslocada, conta ausente e modalidade inválida", () => {
    const row = validRow();
    row[7] = "";
    row[20] = "X";
    row[48] = "COLUNA EXTRA";
    const parsed = parseWarleineRow(row);
    expect(parsed.canonical).toBeNull();
    expect(parsed.errors).toEqual(expect.arrayContaining([
      "COLUNAS_EXCEDENTES",
      "NUMERO_CONTA_AUSENTE",
      "MODALIDADE_RECEBIMENTO_INVALIDA",
    ]));
  });

  it("bloqueia qualquer redução acima de 0,5% e libera apenas a primeira carga", () => {
    expect(isWarleineSnapshotCoverageSafe(0, 1)).toBe(true);
    expect(isWarleineSnapshotCoverageSafe(99, 1)).toBe(false);
    expect(isWarleineSnapshotCoverageSafe(100, 99)).toBe(false);
    expect(isWarleineSnapshotCoverageSafe(100, "99.5")).toBe(true);
    expect(isWarleineSnapshotCoverageSafe("1000000000000.0000", "995000000000.0000")).toBe(true);
  });

  it("interrompe cooperativamente quando o deadline seguro já expirou", () => {
    expect(() => assertWarleineDeadline(Date.now() - 1)).toThrow(/Tempo seguro/);
    expect(() => assertWarleineDeadline(Date.now() + 10_000)).not.toThrow();
  });
});
