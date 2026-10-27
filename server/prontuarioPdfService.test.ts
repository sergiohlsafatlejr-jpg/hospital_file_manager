import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { prontuarioPdfAnexoEventos } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  acessoModulo: vi.fn(),
  acessoUnidade: vi.fn(),
  vinculoConvenio: vi.fn(),
  armazenamentoPronto: vi.fn(),
  criarChave: vi.fn(),
  ler: vi.fn(),
  salvar: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  verificarAcessoModulo: mocks.acessoModulo,
}));
vi.mock("./recursoGlosaPermissions", () => ({
  exigirAcessoEstabelecimento: mocks.acessoUnidade,
  exigirConvenioDoEstabelecimento: mocks.vinculoConvenio,
}));
vi.mock("./prontuarioPdfStorage", () => ({
  armazenamentoProntuarioPdfPronto: mocks.armazenamentoPronto,
  criarChaveStoragePdfProntuario: mocks.criarChave,
  lerPdfProntuario: mocks.ler,
  salvarPdfProntuario: mocks.salvar,
}));

import {
  autorizarProntuarioPdf,
  prontuarioPdfBaixar,
  prontuarioPdfInativar,
  prontuarioPdfUpload,
  validarPdfProntuario,
} from "./prontuarioPdfService";

const scope = {
  estabelecimentoId: 7,
  convenioId: 8,
  arquivoHospitalId: 9,
  numeroConta: "CONTA-SINTETICA",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};
const userId = 41;
const pdf = Buffer.from("%PDF-1.7\nfixture-sintetica", "ascii");
const pdfSha256 = createHash("sha256").update(pdf).digest("hex");
const storageKey = "chave-cifrada-sintetica.enc";

function uploadInput() {
  return {
    ...scope,
    nomeArquivo: "prontuario-sintetico.pdf",
    confirmar: true as const,
    arquivo: pdf,
  };
}

function querySintetica<T>(rows: T[]) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.orderBy = vi.fn(() => query);
  query.limit = vi.fn(async () => rows);
  query.then = (
    resolve: (rows: T[]) => unknown,
    reject: (error: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);
  return query;
}

type BancoFakeOptions = {
  canonico?: boolean;
  anexoAtivo?: boolean;
  falharEventoSucesso?: boolean;
  falharAtivacao?: boolean;
};

/**
 * Banco em memória: a primeira transação persiste a quarentena; a segunda é
 * independente para que sua falha não apague a referência do objeto de storage.
 */
function bancoFake(options: BancoFakeOptions = {}) {
  const trace: string[] = [];
  const eventos: Array<Record<string, unknown>> = [];
  const metadados: Array<Record<string, unknown>> = [];
  const canonical = {
    origem: "XML",
    arquivoId: scope.arquivoHospitalId,
    convenioId:
      options.canonico === false ? scope.convenioId + 1 : scope.convenioId,
    numeroLote: scope.numeroLote,
    competencia: scope.competencia,
  };
  const anexo = {
    id: 22,
    ...scope,
    nomeArquivo: "prontuario-sintetico.pdf",
    tamanhoBytes: pdf.length,
    sha256: pdfSha256,
    storageKey,
    ativo: "sim",
    criadoEm: new Date("2026-10-27T00:00:00.000Z"),
  };
  let txAtual = 0;
  let rollbackSegundaTransacao = false;
  const inserir = vi.fn(() => ({
    values: vi.fn((value: Record<string, unknown>) => {
      if ("resultado" in value) {
        trace.push(`evento:${String(value.resultado)}`);
        if (value.resultado === "sucesso" && options.falharEventoSucesso) {
          throw new Error("falha sintética de auditoria de sucesso");
        }
        eventos.push(value);
        return Promise.resolve(undefined);
      }
      trace.push("metadado");
      metadados.push(value);
      return { $returningId: vi.fn(async () => [{ id: 22 }]) };
    }),
  }));
  const atualizar = vi.fn(() => ({
    set: vi.fn((value: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        trace.push(value.ativo === "sim" ? "ativar" : "inativar");
        if (value.ativo === "sim" && options.falharAtivacao)
          return { affectedRows: 0 };
        return { affectedRows: 1 };
      }),
    })),
  }));
  const selecionarPrincipal = vi.fn((campos: Record<string, unknown>) => {
    if ("origem" in campos) {
      trace.push("escopo");
      return querySintetica([canonical]);
    }
    if ("storageKey" in campos) {
      trace.push("anexo");
      return querySintetica([anexo]);
    }
    return querySintetica([]);
  });
  const selecionarTransacao = vi.fn((campos: Record<string, unknown>) => {
    if ("id" in campos) {
      trace.push("revalidar-ativo");
      return querySintetica(
        options.anexoAtivo === false ? [] : [{ id: anexo.id }]
      );
    }
    return querySintetica([]);
  });
  const tx = {
    insert: inserir,
    update: atualizar,
    select: selecionarTransacao,
  };
  const db = {
    select: selecionarPrincipal,
    insert: inserir,
    update: atualizar,
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        txAtual += 1;
        trace.push(`transacao:${txAtual}`);
        const eventosAntes = eventos.length;
        const metadadosAntes = metadados.length;
        try {
          return await callback(tx);
        } catch (error) {
          if (txAtual === 2) rollbackSegundaTransacao = true;
          eventos.splice(eventosAntes);
          // A primeira transação também deve ser atômica se a sua auditoria falhar.
          metadados.splice(metadadosAntes);
          throw error;
        }
      }
    ),
  };
  mocks.getDb.mockResolvedValue(db);
  return {
    db,
    eventos,
    metadados,
    trace,
    get rollbackSegundaTransacao() {
      return rollbackSegundaTransacao;
    },
  };
}

function esperarEventoMinimo(
  evento: Record<string, unknown>,
  tipo: "upload" | "download" | "inativacao",
  resultado: "sucesso" | "falha" = "sucesso"
) {
  expect(evento).toEqual({
    anexoId: 22,
    ...scope,
    tipo,
    usuarioId: userId,
    resultado,
  });
  expect(Object.keys(evento).sort()).toEqual([
    "anexoId",
    "arquivoHospitalId",
    "competencia",
    "convenioId",
    "estabelecimentoId",
    "numeroConta",
    "numeroLote",
    "resultado",
    "tipo",
    "usuarioId",
  ]);
  for (const proibido of [
    "conteudo",
    "hash",
    "sha256",
    "paciente",
    "storageKey",
    "url",
    "valor",
  ]) {
    expect(evento).not.toHaveProperty(proibido);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acessoUnidade.mockResolvedValue(undefined);
  mocks.vinculoConvenio.mockResolvedValue({ id: scope.convenioId });
  mocks.acessoModulo.mockResolvedValue(true);
  mocks.armazenamentoPronto.mockReturnValue(true);
  mocks.criarChave.mockReturnValue(storageKey);
  mocks.salvar.mockResolvedValue(undefined);
  mocks.ler.mockResolvedValue(pdf);
});

describe("autorização do PDF de prontuário", () => {
  it("exige unidade, vínculo de convênio e módulo de Conta Convênio", async () => {
    await expect(
      autorizarProntuarioPdf(userId, scope, "visualizar")
    ).resolves.toBeUndefined();
    expect(mocks.acessoUnidade).toHaveBeenCalledWith(userId, 7, "visualizar");
    expect(mocks.vinculoConvenio).toHaveBeenCalledWith(
      userId,
      8,
      7,
      "visualizar"
    );
    expect(mocks.acessoModulo).toHaveBeenCalledWith(userId, 7, "contaConvenio");
  });

  it("não consulta convênio ou módulo quando a unidade é bloqueada", async () => {
    mocks.acessoUnidade.mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Unidade bloqueada" })
    );
    await expect(
      autorizarProntuarioPdf(userId, scope, "editar")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.vinculoConvenio).not.toHaveBeenCalled();
    expect(mocks.acessoModulo).not.toHaveBeenCalled();
  });

  it("bloqueia acesso sem módulo mesmo com unidade e convênio válidos", async () => {
    mocks.acessoModulo.mockResolvedValue(false);
    await expect(
      autorizarProntuarioPdf(userId, scope, "visualizar")
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("upload multipart com reserva referenciada", () => {
  it("valida magic bytes PDF no servidor após o multipart", () => {
    expect(() => validarPdfProntuario(pdf)).not.toThrow();
    expect(() => validarPdfProntuario(Buffer.from("texto comum"))).toThrow(
      "não é um PDF"
    );
    expect(() => validarPdfProntuario(Buffer.alloc(0))).toThrow(
      "entre 1 byte e 5 MB"
    );
  });

  it("reserva inativa com evento de falha antes do storage e ativa com evento de sucesso depois", async () => {
    const fake = bancoFake();
    mocks.salvar.mockImplementation(async () => {
      fake.trace.push("storage");
    });

    await expect(prontuarioPdfUpload(uploadInput(), userId)).resolves.toEqual({
      id: 22,
      nomeArquivo: "prontuario-sintetico.pdf",
      tamanhoBytes: pdf.length,
    });

    expect(fake.trace).toEqual([
      "escopo",
      "transacao:1",
      "metadado",
      "evento:falha",
      "storage",
      "transacao:2",
      "ativar",
      "evento:sucesso",
    ]);
    expect(fake.db.transaction).toHaveBeenCalledTimes(2);
    expect(fake.metadados).toHaveLength(1);
    expect(fake.metadados[0]).toMatchObject({
      ...scope,
      sha256: pdfSha256,
      storageKey,
      ativo: "nao",
      tamanhoBytes: pdf.length,
    });
    expect(mocks.salvar).toHaveBeenCalledWith(pdf, scope, storageKey);
    esperarEventoMinimo(fake.eventos[0]!, "upload", "falha");
    esperarEventoMinimo(fake.eventos[1]!, "upload", "sucesso");
  });

  it("mantém reserva inativa e evento de falha se a gravação no storage falhar", async () => {
    const fake = bancoFake();
    mocks.salvar.mockRejectedValue(
      new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    );

    await expect(
      prontuarioPdfUpload(uploadInput(), userId)
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fake.trace).toEqual([
      "escopo",
      "transacao:1",
      "metadado",
      "evento:falha",
    ]);
    expect(fake.db.transaction).toHaveBeenCalledTimes(1);
    expect(fake.metadados[0]).toMatchObject({ ativo: "nao", storageKey });
    esperarEventoMinimo(fake.eventos[0]!, "upload", "falha");
  });

  it("mantém a quarentena quando a segunda transação não consegue ativar", async () => {
    const fake = bancoFake({ falharEventoSucesso: true });
    await expect(
      prontuarioPdfUpload(uploadInput(), userId)
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fake.db.transaction).toHaveBeenCalledTimes(2);
    expect(fake.rollbackSegundaTransacao).toBe(true);
    expect(fake.metadados).toHaveLength(1);
    expect(fake.metadados[0]).toMatchObject({ ativo: "nao", storageKey });
    expect(fake.eventos).toHaveLength(1);
    esperarEventoMinimo(fake.eventos[0]!, "upload", "falha");
  });

  it("não cria reserva nem toca o storage antes de autorização e escopo canônico", async () => {
    mocks.acessoUnidade.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(
      prontuarioPdfUpload(uploadInput(), userId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.criarChave).not.toHaveBeenCalled();
    expect(mocks.salvar).not.toHaveBeenCalled();

    mocks.acessoUnidade.mockResolvedValue(undefined);
    bancoFake({ canonico: false });
    await expect(
      prontuarioPdfUpload(uploadInput(), userId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.criarChave).not.toHaveBeenCalled();
    expect(mocks.salvar).not.toHaveBeenCalled();
  });

  it("filtra o download pelo escopo completo antes do storage e registra seu evento", async () => {
    const fake = bancoFake();
    mocks.ler.mockImplementation(async () => {
      fake.trace.push("storage");
      return pdf;
    });
    await expect(
      prontuarioPdfBaixar({ ...scope, anexoId: 22 }, userId)
    ).resolves.toMatchObject({
      nomeArquivo: "prontuario-sintetico.pdf",
      conteudo: pdf,
    });
    expect(fake.trace).toEqual([
      "escopo",
      "anexo",
      "storage",
      "transacao:1",
      "revalidar-ativo",
      "evento:sucesso",
    ]);
    expect(mocks.ler).toHaveBeenCalledWith(storageKey, scope);
    esperarEventoMinimo(fake.eventos[0]!, "download");
  });

  it("não abre o storage quando o escopo canônico do download não confere", async () => {
    bancoFake({ canonico: false });
    await expect(
      prontuarioPdfBaixar({ ...scope, anexoId: 22 }, userId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.ler).not.toHaveBeenCalled();
  });

  it("inativa e registra evento com a chave de escopo integral na mesma transação", async () => {
    const fake = bancoFake();
    await expect(
      prontuarioPdfInativar({ ...scope, anexoId: 22, confirmar: true }, userId)
    ).resolves.toEqual({ id: 22, inativado: true });
    expect(fake.trace).toEqual([
      "escopo",
      "transacao:1",
      "inativar",
      "evento:sucesso",
    ]);
    esperarEventoMinimo(fake.eventos[0]!, "inativacao");
  });

  it("mantém a tabela de eventos sem colunas que exponham conteúdo ou dados proibidos", () => {
    const campos = Object.keys(prontuarioPdfAnexoEventos).sort();
    expect(campos).toEqual([
      "anexoId",
      "arquivoHospitalId",
      "competencia",
      "convenioId",
      "criadoEm",
      "estabelecimentoId",
      "id",
      "numeroConta",
      "numeroLote",
      "resultado",
      "tipo",
      "usuarioId",
    ]);
    for (const proibido of [
      "conteudo",
      "hash",
      "paciente",
      "sha256",
      "storageKey",
      "url",
      "valor",
    ]) {
      expect(campos).not.toContain(proibido);
    }
  });
});
