import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRawPool: vi.fn(),
}));

vi.mock("./db", () => ({
  getRawPool: mocks.getRawPool,
}));

import { confirmarPersistenciaLoteXml } from "./xmlImportacaoLoteService";

describe("confirmarPersistenciaLoteXml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna o resumo persistido quando uma tentativa idêntica já enfileirou o lote", async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 71,
            estado: "enfileirado",
            fase: "classificar",
            total_arquivos: 2,
            total_hospitalares: 0,
            total_honorarios: 0,
            total_bloqueados: 0,
            total_erros: 0,
          },
        ],
      ]),
      execute: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    mocks.getRawPool.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue(connection),
    });

    await expect(
      confirmarPersistenciaLoteXml({
        loteId: 71,
        estabelecimentoId: 4,
        convenioId: 8,
        criadoPor: 1,
        itemIdsProntos: [401, 402],
        itemIdsFalhos: [],
      })
    ).resolves.toEqual({
      id: 71,
      estado: "enfileirado",
      fase: "classificar",
      totalArquivos: 2,
      totalHospitalares: 0,
      totalHonorarios: 0,
      totalBloqueados: 0,
      totalErros: 0,
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("reflete falha de cofre como erro nos registros visíveis, sem enfileirar processamento", async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 71,
              estado: "recebendo",
              fase: "persistir_selecao",
              total_arquivos: 2,
              total_hospitalares: 0,
              total_honorarios: 0,
              total_bloqueados: 0,
              total_erros: 0,
            },
          ],
        ])
        .mockResolvedValueOnce([[{ id: 401 }, { id: 402 }]]),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    mocks.getRawPool.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue(connection),
    });

    await expect(
      confirmarPersistenciaLoteXml({
        loteId: 71,
        estabelecimentoId: 4,
        convenioId: 8,
        criadoPor: 1,
        itemIdsProntos: [],
        itemIdsFalhos: [401, 402],
        itensFalhos: [
          { itemId: 401, codigo: "STORAGE_WRITE_FAILED" },
          { itemId: 402, codigo: "STORAGE_WRITE_FAILED" },
        ],
      })
    ).resolves.toMatchObject({ estado: "recebendo", totalErros: 2 });

    const [sqlArquivos, paramsArquivos] = connection.execute.mock.calls[2];
    expect(sqlArquivos).toContain("UPDATE arquivos a");
    expect(sqlArquivos).toContain("INNER JOIN xml_importacao_itens");
    expect(paramsArquivos).toEqual(["erro", 71]);
    // affectedRows zero simula uma nova falha sobre itens e arquivos já em erro.
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});
