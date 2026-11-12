import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import {
  casarDecisoesComDemonstrativo,
  normalizarDecisaoPlanilha,
  normalizarIdentificador,
  type CandidatoDemonstrativo,
  type LinhaDecisaoPlanilha,
} from "./importDecisoesGlosaPlanilhaService";
import { extrairDecisoesDeLinhas } from "../shared/planilhaDecisoesGlosa";

describe("normalizarDecisaoPlanilha", () => {
  it("mapeia Sim para recursar e Não para aceitar", () => {
    expect(normalizarDecisaoPlanilha("Sim")).toBe("recursar");
    expect(normalizarDecisaoPlanilha(" SIM ")).toBe("recursar");
    expect(normalizarDecisaoPlanilha("Não")).toBe("aceitar");
    expect(normalizarDecisaoPlanilha("nao")).toBe("aceitar");
  });
  it("ignora Avaliar e vazio", () => {
    expect(normalizarDecisaoPlanilha("Avaliar")).toBeNull();
    expect(normalizarDecisaoPlanilha("")).toBeNull();
    expect(normalizarDecisaoPlanilha(null)).toBeNull();
  });
});

describe("normalizarIdentificador", () => {
  it("remove zeros à esquerda e pontuação", () => {
    expect(normalizarIdentificador("0000083401")).toBe("83401");
    expect(normalizarIdentificador("41.10.101-4")).toBe("41101014");
    expect(normalizarIdentificador("0")).toBe("0");
  });
});

const cand = (p: Partial<CandidatoDemonstrativo> & { id: number }): CandidatoDemonstrativo => ({
  protocolo: "330216425600",
  numeroGuia: "13000000000081808003",
  sequencialItem: null,
  codigoItem: "78299748",
  valorGlosa: "1002.00",
  ...p,
});
const linha = (p: Partial<LinhaDecisaoPlanilha> & { linha: number }): LinhaDecisaoPlanilha => ({
  decisao: "Sim",
  protocolo: "330216425600",
  guiaPrestador: "23616041",
  guiaOperadora: "13000000000081808003",
  sequencialItem: "0",
  codigoItem: "78299748",
  valorGlosa: "1002",
  justificativa: "Justificativa",
  ...p,
});

describe("casarDecisoesComDemonstrativo", () => {
  it("vincula pela guia da operadora + código, com protocolo e valor", () => {
    const [r] = casarDecisoesComDemonstrativo([linha({ linha: 4 })], [cand({ id: 10 })]);
    expect(r).toMatchObject({ status: "casado", demonstrativoId: 10, decisao: "recursar" });
    expect(r.pontuacao).toBeGreaterThanOrEqual(8);
  });

  it("vincula pela guia do prestador quando o portal guarda essa guia", () => {
    const [r] = casarDecisoesComDemonstrativo(
      [linha({ linha: 4, decisao: "Não" })],
      [cand({ id: 11, numeroGuia: "23616041" })],
    );
    expect(r).toMatchObject({ status: "casado", demonstrativoId: 11, decisao: "aceitar" });
  });

  it("ignora zeros à esquerda no código do item", () => {
    const [r] = casarDecisoesComDemonstrativo(
      [linha({ linha: 4, codigoItem: "0000083401" })],
      [cand({ id: 12, codigoItem: "83401" })],
    );
    expect(r.demonstrativoId).toBe(12);
  });

  it("não vincula quando o protocolo diverge", () => {
    const [r] = casarDecisoesComDemonstrativo([linha({ linha: 4 })], [cand({ id: 13, protocolo: "999" })]);
    expect(r.status).toBe("nao_encontrado");
  });

  it("prefere o item com mesmo valor glosado e sequencial", () => {
    const [r] = casarDecisoesComDemonstrativo(
      [linha({ linha: 4, sequencialItem: "2", valorGlosa: "50" })],
      [cand({ id: 20, sequencialItem: 1, valorGlosa: "10" }), cand({ id: 21, sequencialItem: 2, valorGlosa: "50" })],
    );
    expect(r.demonstrativoId).toBe(21);
  });

  it("não usa o mesmo item do portal para duas linhas", () => {
    const res = casarDecisoesComDemonstrativo(
      [linha({ linha: 4 }), linha({ linha: 5 }), linha({ linha: 6 })],
      [cand({ id: 30 }), cand({ id: 31 })],
    );
    expect(res.map((r) => r.demonstrativoId)).toEqual([30, 31, null]);
    expect(res[2].status).toBe("nao_encontrado");
  });

  it("marca decisão inválida (Avaliar) sem vincular", () => {
    const [r] = casarDecisoesComDemonstrativo([linha({ linha: 4, decisao: "Avaliar" })], [cand({ id: 40 })]);
    expect(r).toMatchObject({ status: "decisao_invalida", demonstrativoId: null });
  });
});

describe("extrairDecisoesDeLinhas", () => {
  const rows: unknown[][] = [
    ["Oportunidades Pendentes de Recurso"],
    ['Preencha na coluna amarela B ("VAMOS RECURSAR?") Sim, Não ou Avaliar'],
    [
      "Grupo", "VAMOS RECURSAR? (Sim / Não / Avaliar)", "Sugestão", "Nº Protocolo", "Nº Guia Prestador",
      "Nº Guia Operadora", "Seq Item", "Código Procedimento", "Descrição do Item", "Vl. Glosado (R$)",
      "Códigos Glosa", "Justificativa / Orientação para Recurso", "Motivo se NÃO / observação",
    ],
    ["A", "Sim", "x", "330216425600", "23616041", "1300", "0", "78299748", "FILTRO", "1002", "2012", "Pagar", null],
    ["A", "Não", "x", "340215424001", "125", "2400", "3", "0000083401", "BIOVISC", "8985.6", "1414", "Aceitar", null],
    ["A", "Avaliar", "x", "1", "2", "3", "4", "5", "6", "7", "8", "9", null],
    ["A", null, "x", "1", "2", "3", "4", "5", "6", "7", "8", "9", null],
    [null, null, null],
  ];

  it("lê apenas Sim/Não e mapeia as colunas pelo cabeçalho", () => {
    const r = extrairDecisoesDeLinhas(rows);
    expect(r.linhaCabecalho).toBe(3);
    expect(r.contagem).toEqual({ sim: 1, nao: 1, avaliar: 1, vazio: 1, outros: 0 });
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      linha: 4, decisao: "Sim", protocolo: "330216425600", guiaPrestador: "23616041", guiaOperadora: "1300",
      sequencialItem: "0", codigoItem: "78299748", valorGlosa: "1002", justificativa: "Pagar",
    });
    expect(r.linhas[1]).toMatchObject({ decisao: "Não", codigoItem: "0000083401", justificativa: "Aceitar" });
  });

  it("falha quando a coluna VAMOS RECURSAR? não existe", () => {
    expect(() => extrairDecisoesDeLinhas([["a", "b"]])).toThrow(/VAMOS RECURSAR/);
  });
});
