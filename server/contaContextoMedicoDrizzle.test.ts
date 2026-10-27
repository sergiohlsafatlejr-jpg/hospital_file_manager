import { readFileSync } from "node:fs";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";
import {
  criarContaContextoMedicoRepositorioDrizzle,
  lerXmlMedicoAutorizadoSeguro,
} from "./contaContextoMedicoDrizzle";

const scope = {
  estabelecimentoId: 1,
  convenioId: 2,
  arquivoHospitalId: 39,
  numeroConta: "GUIA-SINTETICA-1",
  numeroLote: "LOTE-SINTETICO",
  competencia: "2026/10",
};

const arquivo = {
  id: 6,
  nome: "honorarios-sintetico.xml",
  tamanho: 128,
  dataReferencia: null,
  tipoArquivo: "xml" as const,
  direcao: "enviado" as const,
  estabelecimentoId: 1,
  convenioId: 2,
  s3Key: "arquivos/7/honorarios-sintetico.xml",
  s3Url: "https://storage.test/manus-storage/7/honorarios-sintetico.xml",
};

function respostaXml(conteudo = "<ans:mensagemTISS xmlns:ans=\"urn:ans\" />") {
  return new Response(conteudo, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function repositorioComSnapshot(linhas: unknown[]) {
  const where = vi.fn(async () => linhas);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    repositorio: criarContaContextoMedicoRepositorioDrizzle({
      getDb: async () => ({ select }) as never,
    }),
    select,
    where,
  };
}

function filtroSnapshot(where: ReturnType<typeof vi.fn>) {
  return new MySqlDialect().sqlToQuery(where.mock.calls[0]?.[0] as never);
}

describe("contaContextoMedicoDrizzle — projeção e leitura seguras", () => {
  it("não abre banco ao construir o repositório e resolve somente o getDb injetado na operação", async () => {
    const getDb = vi.fn(async () => null);
    const repositorio = criarContaContextoMedicoRepositorioDrizzle({ getDb });

    expect(getDb).not.toHaveBeenCalled();
    await expect(repositorio.configurado()).resolves.toBe(false);
    expect(getDb).toHaveBeenCalledTimes(1);
  });

  it("resolve pelo fallback da guia da operadora quando a guia do prestador está ausente", async () => {
    const linhas = [{
      numeroGuiaPrestador: null,
      numeroGuiaOperadora: scope.numeroConta,
      carteiraBeneficiario: "CORRELACAO-PRIVADA",
      dataExecucao: new Date("2026-10-03T12:00:00.000Z"),
      codigoItem: "HOSP-01",
      descricaoItem: "Item hospitalar sintético",
      quantidade: "1.250",
      tipoItem: "PROCEDIMENTO",
    }];
    const { repositorio, select, where } = repositorioComSnapshot(linhas);

    const snapshot = await repositorio.resolverSnapshotHospitalar(scope);

    expect(snapshot).toMatchObject({
      scope,
      setorInformado: false,
      referenciasGuias: [{
        numeroGuiaPrestador: null,
        numeroGuiaOperadora: scope.numeroConta,
        beneficiario: "CORRELACAO-PRIVADA",
        datasExecucao: ["2026-10-03"],
      }],
      itensHospitalares: [{
        codigo: "HOSP-01",
        descricao: "Item hospitalar sintético",
        quantidade: "1.250",
        tipo: "procedimento",
      }],
    });
    const projection = select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual([
      "carteiraBeneficiario",
      "codigoItem",
      "dataExecucao",
      "descricaoItem",
      "numeroGuiaOperadora",
      "numeroGuiaPrestador",
      "quantidade",
      "tipoItem",
    ]);
    expect(Object.keys(projection).join(" ")).not.toMatch(/valor|recebimento|pagamento/i);

    const filtro = filtroSnapshot(where);
    expect(filtro.sql).toMatch(
      /`faturamento_tiss`\.`numero_guia_prestador`\s*=\s*\?\s+or\s+\(coalesce\(trim\(`faturamento_tiss`\.`numero_guia_prestador`\), ''\)\s*=\s*''\s+and\s+`faturamento_tiss`\.`numero_guia_operadora`\s*=\s*\?\)/i,
    );
    expect(filtro.params).toEqual([
      scope.arquivoHospitalId,
      scope.estabelecimentoId,
      scope.convenioId,
      scope.numeroConta,
      scope.numeroConta,
      scope.numeroLote,
      scope.competencia,
    ]);
  });

  it("bloqueia fallback da operadora quando existe guia do prestador divergente", async () => {
    const { repositorio, where } = repositorioComSnapshot([]);

    await expect(repositorio.resolverSnapshotHospitalar(scope)).resolves.toBeNull();

    const filtro = filtroSnapshot(where);
    // A segunda alternativa só é verdadeira quando a guia prestador é nula,
    // vazia ou contém apenas espaços; uma guia divergente não pode cair nela.
    expect(filtro.sql).toMatch(
      /coalesce\(trim\(`faturamento_tiss`\.`numero_guia_prestador`\), ''\)\s*=\s*''\s+and\s+`faturamento_tiss`\.`numero_guia_operadora`\s*=\s*\?/i,
    );
    expect(filtro.params).toContain(scope.numeroConta);
  });

  it("mantém lote e competência estritos inclusive no fallback da guia da operadora", async () => {
    const { repositorio, where } = repositorioComSnapshot([]);

    await expect(repositorio.resolverSnapshotHospitalar(scope)).resolves.toBeNull();

    const filtro = filtroSnapshot(where);
    expect(filtro.sql).toMatch(/`faturamento_tiss`\.`arquivo_id`\s*=\s*\?/i);
    expect(filtro.sql).toMatch(/`faturamento_tiss`\.`estabelecimentoId`\s*=\s*\?/i);
    expect(filtro.sql).toMatch(/`faturamento_tiss`\.`convenioId`\s*=\s*\?/i);
    expect(filtro.sql).toMatch(/coalesce\(`faturamento_tiss`\.`numero_lote`, ''\)\s*=\s*\?/i);
    expect(filtro.sql).toMatch(/coalesce\(`faturamento_tiss`\.`competencia`, ''\)\s*=\s*\?/i);
    expect(filtro.params).toEqual([
      scope.arquivoHospitalId,
      scope.estabelecimentoId,
      scope.convenioId,
      scope.numeroConta,
      scope.numeroConta,
      scope.numeroLote,
      scope.competencia,
    ]);
  });

  it("separa principais compostos e deduplica sem transformar material em procedimento", async () => {
    const repositorio = criarContaContextoMedicoRepositorioDrizzle({ getDb: async () => ({
      select: () => ({ from: () => ({ where: async () => [{ id: 1, estabelecimentoId: 1, convenioId: 2,
        codigoProcedimentoPrincipal: "PRINCIPAL-A + PRINCIPAL-B + PRINCIPAL-A",
        descricaoProcedimentoPrincipal: "Composição sintética", itensAssociados: [], status: "ativo", isGabarito: 1,
      }] }) }),
    }) as never });
    const gabaritos = await repositorio.listarGabaritosManuais(scope);
    expect(gabaritos[0].principais).toEqual([{ codigo: "PRINCIPAL-A" }, { codigo: "PRINCIPAL-B" }]);
  });

  it("aceita CDN retornada pelo SDK autenticado para a chave exata sem buscar o URL persistido externo", async () => {
    const executarFetch = vi.fn(async () => respostaXml());
    const conteudo = await lerXmlMedicoAutorizadoSeguro({ ...arquivo, s3Url: "https://arquivo-antigo.test/documento.xml" }, {
      storageGet: async () => ({ key: arquivo.s3Key, url: "https://cdn-oficial.test/documento-assinado.xml" }),
      fetch: executarFetch, origensStoragePermitidas: ["https://proxy-storage.test"],
    });
    expect(conteudo.toString()).toContain("mensagemTISS");
    expect(executarFetch).toHaveBeenCalledWith("https://cdn-oficial.test/documento-assinado.xml", expect.objectContaining({ redirect: "error" }));
    expect(executarFetch).not.toHaveBeenCalledWith("https://arquivo-antigo.test/documento.xml", expect.anything());
  });

  it("recusa chave de assinatura divergente e destinos locais mesmo retornados pelo SDK", async () => {
    for (const assinatura of [
      { key: "arquivos/outro.xml", url: "https://cdn-oficial.test/outro.xml" },
      { key: arquivo.s3Key, url: "https://127.0.0.1/documento.xml" },
      { key: arquivo.s3Key, url: "https://169.254.169.254/documento.xml" },
      { key: arquivo.s3Key, url: "https://usuario@cdn-oficial.test/documento.xml" },
    ]) {
      const executarFetch = vi.fn(async () => respostaXml());
      await expect(lerXmlMedicoAutorizadoSeguro(arquivo, { storageGet: async () => assinatura,
        fetch: executarFetch, origensStoragePermitidas: ["https://proxy-storage.test"],
      })).rejects.toMatchObject({ codigo: "PRECONDICAO" });
      expect(executarFetch).not.toHaveBeenCalled();
    }
  });

  it("retorna configuração pendente quando a verificação das tabelas aditivas falha", async () => {
    const repositorio = criarContaContextoMedicoRepositorioDrizzle({
      getDb: async () => ({
        select: () => ({
          from: () => ({
            limit: async () => {
              throw new Error("tabela ausente");
            },
          }),
        }),
      }) as never,
    });

    await expect(repositorio.configurado()).resolves.toBe(false);
  });

  it("usa somente URL HTTPS allowlisted vinda do arquivo já autorizado e aceita fallback seguro", async () => {
    const obterStorage = vi.fn(async () => {
      throw new Error("assinatura indisponível");
    });
    const executarFetch = vi.fn(async () => respostaXml());

    const conteudo = await lerXmlMedicoAutorizadoSeguro(arquivo, {
      storageGet: obterStorage,
      fetch: executarFetch,
      origensStoragePermitidas: ["https://storage.test"],
    });

    expect(conteudo.toString("utf8")).toContain("mensagemTISS");
    expect(executarFetch).toHaveBeenCalledWith(
      arquivo.s3Url,
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("rejeita URL externa, redirecionamento implícito e resposta acima de 16 MB antes de expor XML", async () => {
    const fetchExterno = vi.fn(async () => respostaXml());
    await expect(lerXmlMedicoAutorizadoSeguro({
      ...arquivo,
      s3Url: "https://externo.invalid/documento.xml",
    }, {
      storageGet: async () => {
        throw new Error("storage indisponível");
      },
      fetch: fetchExterno,
      origensStoragePermitidas: ["https://storage.test"],
    })).rejects.toMatchObject({ codigo: "PRECONDICAO" });
    expect(fetchExterno).not.toHaveBeenCalled();

    const fetchComCredencial = vi.fn(async () => respostaXml());
    await expect(lerXmlMedicoAutorizadoSeguro({
      ...arquivo,
      s3Url: "https://token-secreto@storage.test/documento.xml",
    }, {
      storageGet: async () => {
        throw new Error("storage indisponível");
      },
      fetch: fetchComCredencial,
      origensStoragePermitidas: ["https://storage.test"],
    })).rejects.toMatchObject({ codigo: "PRECONDICAO" });
    expect(fetchComCredencial).not.toHaveBeenCalled();

    const fetchGrande = vi.fn(async () => new Response("<xml />", {
      status: 200,
      headers: {
        "content-type": "application/xml",
        "content-length": String(16 * 1024 * 1024 + 1),
      },
    }));
    await expect(lerXmlMedicoAutorizadoSeguro(arquivo, {
      storageGet: async () => ({ key: arquivo.s3Key, url: arquivo.s3Url }),
      fetch: fetchGrande,
      origensStoragePermitidas: ["https://storage.test"],
    })).rejects.toMatchObject({ codigo: "PRECONDICAO" });
  });

  it("mantém no módulo apenas SQL/Drizzle de leitura da origem e não introduz DML financeiro", () => {
    const source = readFileSync(new URL("./contaContextoMedicoDrizzle.ts", import.meta.url), "utf8");
    const snapshotBlock = source.slice(
      source.indexOf("async resolverSnapshotHospitalar"),
      source.indexOf("async listarArquivosMedicos"),
    );
    expect(snapshotBlock).toContain(".from(faturamentoTiss)");
    expect(snapshotBlock).not.toMatch(/valorUnitario|valorFaturado|valorTotal|recebimento/i);
    expect(snapshotBlock).not.toMatch(/\.insert\(faturamentoTiss\)|\.update\(faturamentoTiss\)|\.delete\(faturamentoTiss\)/);
  });
});
