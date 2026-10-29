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
});
