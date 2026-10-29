import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRawPool: vi.fn() }));
vi.mock("./db", () => ({ getRawPool: mocks.getRawPool }));

import { consultarAcoesPublicasLoteXmlPorArquivos } from "./xmlImportacaoLoteService";

describe("consultarAcoesPublicasLoteXmlPorArquivos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna apenas o enum sanitizado e mantém o filtro por estabelecimento", async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          arquivo_id: 11,
          estado: "recebendo",
          fase: "persistir_selecao",
          erro_codigo: "STORAGE_WRITE_RESEND_REQUIRED",
        },
        {
          arquivo_id: 12,
          estado: "processando",
          fase: "classificar",
          erro_codigo: null,
        },
      ],
    ]);
    mocks.getRawPool.mockResolvedValue({ query });

    const result = await consultarAcoesPublicasLoteXmlPorArquivos({
      arquivoIds: [11, 12, 11],
      estabelecimentoId: 4,
    });

    expect(result).toEqual(
      new Map([
        [11, "reenvio_completo_necessario"],
        [12, "processamento_em_andamento"],
      ])
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("l.estabelecimento_id=?");
    expect(sql).not.toContain("storage_key");
    expect(params).toEqual([4, 11, 12]);
  });

  it("não abre conexão quando não há arquivo ou estabelecimento válido", async () => {
    await expect(
      consultarAcoesPublicasLoteXmlPorArquivos({
        arquivoIds: [],
        estabelecimentoId: 0,
      })
    ).resolves.toEqual(new Map());
    expect(mocks.getRawPool).not.toHaveBeenCalled();
  });
});
