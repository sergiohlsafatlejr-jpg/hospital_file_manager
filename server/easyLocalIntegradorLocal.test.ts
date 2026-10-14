import { afterAll, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ pool: undefined as any }));
const habilitado = process.env.EASYLOCAL_HOMOLOG_LOCAL === "sim";
vi.mock("./db", async () => {
  if (process.env.EASYLOCAL_HOMOLOG_LOCAL !== "sim")
    return { getRawPool: async () => null };
  const { createPool } = await import("mysql2/promise");
  // Nenhuma URL de produção é aceita. Fixture privada criada somente no Sandbox.
  h.pool = createPool({
    socketPath: "/home/ubuntu/private/easylocal-homolog-db/mysql.sock",
    user: "root",
    database: "easylocal_integrador_test",
    connectionLimit: 4,
  });
  return { getRawPool: async () => h.pool };
});
vi.mock("./easyLocalMetadata", () => ({
  detectarEasyLocalCampos: async () =>
    ["codigo", "valor", "unidade"].map(nome => ({ nome })),
}));
import {
  criarEasyLocalTabela,
  listarEasyLocalTabelas,
  salvarEasyLocalLeitura,
  listarEasyLocalLeituras,
} from "./easyLocalIntegradorService";
const novo = {
  estabelecimentoId: 12,
  nome: "contrato",
  nomeExibicao: "Fixture sem pacientes",
  confirmarCriacao: true as const,
  colunas: [
    { nome: "codigo", tipo: "bigint" as const, obrigatorio: true },
    {
      nome: "valor",
      tipo: "decimal" as const,
      tamanho: 15,
      escala: 4,
      obrigatorio: false,
    },
  ],
};
describe.skipIf(!habilitado)("DDL real em socket local, sem produção", () => {
  afterAll(async () => {
    await h.pool?.end();
  });
  it("cria uma tabela vazia e confirma coluna decimal e nulabilidade", async () => {
    const out = await criarEasyLocalTabela(novo, 7);
    expect(out.nomeFisico).toBe("integ_el_12_contrato");
    const [rows] = await h.pool.query(
      "SELECT COUNT(*) AS total FROM integ_el_12_contrato"
    );
    expect(Number(rows[0].total)).toBe(0);
    const list = await listarEasyLocalTabelas(12);
    expect(list.find(t => t.id === out.tabelaId)).toMatchObject({
      estado: "criada",
      colunas: novo.colunas,
    });
  });
  it("recusa recriação e isola o mesmo nome em outra unidade", async () => {
    await expect(criarEasyLocalTabela(novo, 7)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      (await criarEasyLocalTabela({ ...novo, estabelecimentoId: 13 }, 7))
        .nomeFisico
    ).toBe("integ_el_13_contrato");
    expect(
      (await listarEasyLocalTabelas(13)).every(t =>
        t.nomeFisico.startsWith("integ_el_13_")
      )
    ).toBe(true);
  });
  it("salva configuração pausada com referência ao servidor, sem agendamento", async () => {
    const tabela = (await listarEasyLocalTabelas(12))[0];
    await salvarEasyLocalLeitura(
      {
        estabelecimentoId: 12,
        tabelaId: tabela.id,
        origem: { schema: "public", tabela: "fixture" },
        colunaEstabelecimento: "unidade",
        valorEstabelecimento: "fixture_12",
        campoChave: "codigo",
        dominio: "atendimentos",
        frequenciaDesejada: "15min",
      },
      7
    );
    expect((await listarEasyLocalLeituras(12))[0]).toMatchObject({
      estado: "preparada_sem_execucao",
      frequenciaDesejada: "15min",
    });
    expect(await listarEasyLocalLeituras(13)).toEqual([]);
  });
  it("duas criações simultâneas não produzem duas reservas do mesmo nome", async () => {
    const calls = await Promise.allSettled([
      criarEasyLocalTabela({ ...novo, nome: "concorrencia" }, 7),
      criarEasyLocalTabela({ ...novo, nome: "concorrencia" }, 7),
    ]);
    expect(calls.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const [rows] = await h.pool.query(
      "SELECT COUNT(*) AS total FROM integracao_tabelas WHERE nome = 'el_12_concorrencia'"
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});
