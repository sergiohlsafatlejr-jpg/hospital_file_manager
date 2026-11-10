import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getRawPool: async () => ({ query: h.query }) }));
vi.mock("./services/comparadorPadroes", () => ({ compararItensComPadroes: vi.fn() }));
import { getWarleineLotSummary } from "./warleineFaturamentoService";
beforeEach(() => { h.query.mockReset(); });
describe("Warleine — histórico separado do controle de upload", () => {
  it("consulta somente o hospital parametrizado, exclui controles e preserva zero publicado", async () => {
    h.query.mockResolvedValue([[{ id: 71, status: "publicado", totalPublicadas: 0, totalLinhas: 8, valorFaturado: "0.0000", competencias: [] }], []]);
    const rows = await getWarleineLotSummary(901);
    const [sql, parameters] = h.query.mock.calls[0];
    expect(sql).toContain("estabelecimentoId=?");
    expect(parameters).toEqual([901]);
    expect(sql).toContain("origem<>'upload-controle'");
    expect(sql).toContain("arquivoStorageKey NOT LIKE 'warleine-upload:v1:%'");
    expect(rows[0].totalPublicadas).toBe(0);
    expect(rows[0].valorFaturado).toBe(0);
  });
  it("não retorna erro histórico bruto com SQL, conexão ou dados individuais", async () => {
    h.query.mockResolvedValue([[{ id: 71, status: "erro", erroResumo: "SQL password host fixture.patient.local", competencias: [] }], []]);
    const [row] = await getWarleineLotSummary(901);
    expect(row.erroResumo).toBe("Lote com falha de validação/processamento; publicação não confirmada.");
    expect(JSON.stringify(row)).not.toMatch(/password|patient|SQL|host/);
  });
});
