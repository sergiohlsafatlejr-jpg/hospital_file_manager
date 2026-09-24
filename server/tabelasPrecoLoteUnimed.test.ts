import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { LoteUnimedDuplicadoError, salvarLoteUnimedComPool } from "./db";
import {
  contarLinhasOriginaisDaPlanilha,
  ORDEM_LOTE_UNIMED,
  prepararLoteUnimed,
  type ArquivoLoteUnimed,
  type LoteUnimedPreparado,
} from "./tabelasPrecoLoteUnimed";

function criarArquivo(
  nomeArquivo: string,
  rows: Array<Array<string | number>>,
): ArquivoLoteUnimed {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Dados");
  return {
    nomeArquivo,
    formatoArquivo: "excel",
    conteudo: XLSX.write(workbook, { type: "base64", bookType: "xlsx" }),
  };
}

function criarQuatroArquivos(): ArquivoLoteUnimed[] {
  return [
    criarArquivo("atualizacao_Tabela_Unimed_Site.xlsx", [
      ["codigo", "descricao", "valor", "tipo_de_beneficiario"],
      ["200", "Procedimento do site", 50, "PLANO"],
    ]),
    criarArquivo("atualizacao_Dados_Completo.xlsx", [
      ["codigo", "descricao", "porte", "numero_auxiliares", "valor", "tipo_de_beneficiario"],
      ["100", "Procedimento completo", 5, 1, "1A", "PLANO"],
    ]),
    criarArquivo("atualizacao_Porte_Anestesico.xlsx", [
      ["codigo", "valor", "tipo_de_beneficiario"],
      ["AN5", 80, "PLANO"],
    ]),
    criarArquivo("atualizacao_Preco_Porte.xlsx", [
      ["codigo", "valor", "tipo_de_beneficiario"],
      ["1A", 120, "PLANO"],
    ]),
  ];
}

function criarLotePequeno(): LoteUnimedPreparado {
  return {
    totalItens: 4,
    loteHash: "a".repeat(64),
    etapas: ORDEM_LOTE_UNIMED.map((fonte, index) => ({
      fonte,
      nomeArquivo: `${fonte}.xlsx`,
      formatoArquivo: "excel" as const,
      totalItens: 1,
      itens: [{
        codigo: String(index + 1),
        nome: `Item ${index + 1}`,
        valor: "10.00",
      }],
    })),
  };
}

describe("lote de tabelas Unimed", () => {
  it("ordena e valida as quatro planilhas antes da persistência", () => {
    const arquivos = criarQuatroArquivos();
    const lote = prepararLoteUnimed(arquivos);

    expect(lote.etapas.map((etapa) => etapa.fonte)).toEqual(ORDEM_LOTE_UNIMED);
    expect(lote.loteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepararLoteUnimed([...arquivos].reverse()).loteHash).toBe(lote.loteHash);
    expect(lote.etapas[2].itens[0]).toMatchObject({
      codigo: "100",
      valor: "120.00",
      valorPorteAnestesico: "80.00",
    });
  });

  it("rejeita lote incompleto ou arquivo com nome desconhecido", () => {
    expect(() => prepararLoteUnimed(criarQuatroArquivos().slice(0, 3))).toThrow(
      "exatamente as quatro",
    );

    const arquivos = criarQuatroArquivos();
    arquivos[0] = { ...arquivos[0], nomeArquivo: "arquivo-renomeado.xlsx" };
    expect(() => prepararLoteUnimed(arquivos)).toThrow("Não foi possível reconhecer");
  });

  it("rejeita o lote antes do parsing quando o payload excede o limite seguro", () => {
    const arquivos = criarQuatroArquivos();
    arquivos[0] = { ...arquivos[0], conteudo: "A".repeat(41 * 1024 * 1024) };
    expect(() => prepararLoteUnimed(arquivos)).toThrow("limite seguro de 30 MB");
  });

  it("usa a faixa original para detectar excesso mesmo quando a leitura foi limitada", () => {
    const sheetLimitada = {
      "!ref": "A1:B250100",
      "!fullref": "A1:B300002",
    } as XLSX.WorkSheet & { "!fullref": string };

    expect(contarLinhasOriginaisDaPlanilha(sheetLimitada, 0)).toBe(300_001);
  });

  it("usa um horário único e restringe a substituição ao estabelecimento informado", async () => {
    const momentoLote = new Date("2026-09-24T14:00:00.000Z");
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ id: 4 }], []])
      .mockResolvedValueOnce([[{ id: 10 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValue([{}, []]);
    const query = vi.fn().mockResolvedValue([{}, []]);
    const connection = {
      beginTransaction: vi.fn(),
      execute,
      query,
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    const resultado = await salvarLoteUnimedComPool(pool as any, {
      convenioId: 10,
      estabelecimentoId: 4,
      userId: 1,
      loteId: "lote-teste-1",
      substituirExistentes: true,
      momentoLote,
      lote: criarLotePequeno(),
    });

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    const updates = execute.mock.calls.filter(([sql]) => String(sql).includes("UPDATE tabelasPreco"));
    expect(updates).toHaveLength(4);
    for (const [sql, params] of updates) {
      expect(String(sql)).toContain("estabelecimentoId = ?");
      expect(params).toEqual(expect.arrayContaining([momentoLote, 10, 4]));
    }
    for (const [, params] of query.mock.calls) {
      expect(params).toContain(momentoLote);
    }
    const historicos = execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO importacoesTabela"),
    );
    expect(historicos).toHaveLength(4);
    for (let index = 0; index < historicos.length; index += 1) {
      const [, params] = historicos[index];
      expect(params.slice(0, 6)).toEqual([
        10,
        4,
        1,
        "lote-teste-1",
        "a".repeat(64),
        ORDEM_LOTE_UNIMED[index],
      ]);
      expect(params.at(-1)).toEqual(momentoLote);
    }
    expect(resultado.momentoLote).toEqual(momentoLote);
    expect(resultado.etapas).toHaveLength(4);
  });

  it("desfaz todo o lote quando qualquer etapa falha", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ id: 4 }], []])
      .mockResolvedValueOnce([[{ id: 10 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValue([{}, []]);
    const query = vi.fn()
      .mockResolvedValueOnce([{}, []])
      .mockRejectedValueOnce(new Error("falha simulada"));
    const connection = {
      beginTransaction: vi.fn(),
      execute,
      query,
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(salvarLoteUnimedComPool(pool as any, {
      convenioId: 10,
      estabelecimentoId: 4,
      userId: 1,
      loteId: "lote-teste-2",
      substituirExistentes: true,
      momentoLote: new Date("2026-09-24T14:00:00.000Z"),
      lote: criarLotePequeno(),
    })).rejects.toThrow("falha simulada");

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("rejeita convênio que não está disponível para o estabelecimento", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ id: 4 }], []])
      .mockResolvedValueOnce([[], []]);
    const connection = {
      beginTransaction: vi.fn(),
      execute,
      query: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(salvarLoteUnimedComPool(pool as any, {
      convenioId: 99,
      estabelecimentoId: 4,
      userId: 1,
      loteId: "lote-convenio-invalido",
      substituirExistentes: true,
      momentoLote: new Date("2026-09-24T14:00:00.000Z"),
      lote: criarLotePequeno(),
    })).rejects.toThrow("não está disponível para este estabelecimento");

    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it("rejeita replay do mesmo conjunto antes de alterar qualquer tabela de preço", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ id: 4 }], []])
      .mockResolvedValueOnce([[{ id: 10 }], []])
      .mockResolvedValueOnce([[{ loteId: "lote-anterior" }], []]);
    const connection = {
      beginTransaction: vi.fn(),
      execute,
      query: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(salvarLoteUnimedComPool(pool as any, {
      convenioId: 10,
      estabelecimentoId: 4,
      userId: 1,
      loteId: "novo-lote",
      substituirExistentes: true,
      momentoLote: new Date("2026-09-24T14:00:00.000Z"),
      lote: criarLotePequeno(),
    })).rejects.toBeInstanceOf(LoteUnimedDuplicadoError);

    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
