import { describe, expect, it, vi } from "vitest";
import type { ScopeContaMedica } from "../shared/contaContextoMedico";
import {
  ContaContextoMedicoErro,
  criarContaContextoMedicoService,
  type ArquivoMedicoAutorizado,
  type ContextoMedicoPersistido,
  type ContextoMedicoTransacao,
  type ContaContextoMedicoRepositorio,
  type FonteMedicaPersistida,
  type GabaritoManualInformativo,
  type SnapshotHospitalarAutorizado,
} from "./contaContextoMedicoService";
import type { ParseContaHonorariosResultado } from "./contaHonorariosParser";

const scope: ScopeContaMedica = {
  estabelecimentoId: 1,
  convenioId: 2,
  arquivoHospitalId: 39,
  numeroConta: "CONTA-SINTETICA-1",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};

const scopeNormalizado = {
  estabelecimentoId: 1,
  convenioId: 2,
  arquivoHospitalId: 39,
  numeroConta: "CONTA-SINTETICA-1",
  numeroLote: "LOTE-1",
  competencia: "2026/10",
};

function parseResultado(descricao = "Procedimento sintético"): ParseContaHonorariosResultado {
  return {
    recognized: true,
    guias: [{
      correlacao: {
        numeroGuiaPrestador: "GUIA-1",
        numeroGuiaOperadora: null,
        guiaSolicitacaoInternacao: null,
        numeroCarteira: "BENEF-SINTETICO",
        dataAtendimento: "2026-10-03",
        dataEmissaoGuia: null,
        codigoPrestador: null,
      },
      procedimentos: [{
        codigo: "MED-01",
        descricao,
        dataExecucao: "2026-10-03",
        sequencial: "1",
        profissionais: [{ nome: "Profissional Sintético", conselho: "CRM", numeroConselho: "0001" }],
      }],
    }],
  };
}

const gabarito: GabaritoManualInformativo = {
  padraoId: 50,
  nome: "Gabarito Sintético",
  estabelecimentoId: 1,
  convenioId: 2,
  isGabarito: true,
  status: "ativo",
  principais: [{ codigo: "MED-01" }],
  itensAssociados: [{
    codigo: "HOSP-01",
    descricao: "Item hospitalar sintético",
    frequencia: 100,
    quantidadeMedia: 1,
    quantidadeMin: 1,
    quantidadeMax: 1,
    categoria: "obrigatorio",
  }],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function makeRepository() {
  let configured = true;
  let fonteId = 0;
  let contextoId = 0;
  const fontes: FonteMedicaPersistida[] = [];
  const eventos: unknown[] = [];
  let contexto: ContextoMedicoPersistido | null = null;
  let parsed = parseResultado();
  const xmlReads = vi.fn(async () => Buffer.from("<xml-sintetico />"));
  const listarArquivosMedicos = vi.fn(async () => ({
    arquivos: [{ id: 6, nome: "honorarios-sintetico.xml", tamanho: 128, dataReferencia: "2026-10-03T12:00:00.000Z" }],
    temProximaPagina: false,
  }));
  const diagnosticarSnapshotHospitalar = vi.fn(async () => ({
    etapas: [
      { etapa: "arquivo_hospitalar" as const, totalLinhas: 0 },
      { etapa: "identificacao_conta" as const, totalLinhas: 0 },
      { etapa: "lote" as const, totalLinhas: 0 },
      { etapa: "competencia" as const, totalLinhas: 0 },
    ],
  }));
  const writes = { fontes: 0, contextos: 0, eventos: 0, financeiro: 0 };
  let hospital: SnapshotHospitalarAutorizado = {
    scope: clone(scopeNormalizado),
    referenciasGuias: [{
      numeroGuiaPrestador: "GUIA-1",
      numeroGuiaOperadora: null,
      beneficiario: "BENEF-SINTETICO",
      datasExecucao: ["2026-10-03"],
    }],
    itensHospitalares: [{
      codigo: "HOSP-01",
      descricao: "Item hospitalar sintético",
      quantidade: "1",
      tipo: "outro",
      numeroGuiaPrestador: "GUIA-1",
      numeroGuiaOperadora: null,
    }],
    setorInformado: false,
  };
  const arquivo: ArquivoMedicoAutorizado = {
    id: 6,
    nome: "honorarios-sintetico.xml",
    tamanho: 128,
    dataReferencia: "2026-10-03T12:00:00.000Z",
    tipoArquivo: "xml",
    direcao: "enviado",
    estabelecimentoId: 1,
    convenioId: 2,
    s3Key: "arquivos/sinteticos/6.xml",
  };

  const tx: ContextoMedicoTransacao = {
    obterContextoParaAtualizacao: async () => contexto ? clone(contexto) : null,
    inserirContextoInicial: async novo => {
      if (contexto) return null;
      contexto = { id: ++contextoId, ...clone(novo) };
      writes.contextos += 1;
      return clone(contexto);
    },
    atualizarContextoComCas: async (id, revisaoEsperada, novo) => {
      if (!contexto || contexto.id !== id || contexto.revisao !== revisaoEsperada) return null;
      contexto = { id, ...clone(novo) };
      writes.contextos += 1;
      return clone(contexto);
    },
    anexarEvento: async event => {
      eventos.push(clone(event));
      writes.eventos += 1;
    },
  };

  const repository: ContaContextoMedicoRepositorio = {
    configurado: async () => configured,
    resolverSnapshotHospitalar: async requested => {
      const same = JSON.stringify(requested) === JSON.stringify(scopeNormalizado);
      return same ? clone(hospital) : null;
    },
    diagnosticarSnapshotHospitalar,
    listarArquivosMedicos,
    obterArquivoMedicoAutorizado: async (requested, arquivoMedicoId) =>
      JSON.stringify(requested) === JSON.stringify(scopeNormalizado) && arquivoMedicoId === 6 ? clone(arquivo) : null,
    lerXmlMedicoAutorizado: xmlReads,
    listarFontes: async () => clone(fontes),
    inserirFonteSeAusente: async nova => {
      const existing = fontes.find(fonte =>
        fonte.arquivoMedicoId === nova.arquivoMedicoId &&
        fonte.guiaReferencia === nova.guiaReferencia &&
        fonte.versaoSemantica === nova.versaoSemantica &&
        JSON.stringify(fonte.scope) === JSON.stringify(nova.scope),
      );
      if (existing) return { fonte: clone(existing), criada: false };
      const fonte: FonteMedicaPersistida = { id: ++fonteId, ...clone(nova) };
      fontes.push(fonte);
      writes.fontes += 1;
      return { fonte: clone(fonte), criada: true };
    },
    listarGabaritosManuais: async () => [clone(gabarito)],
    obterGabaritoManual: async (_requested, id) => id === 50 ? clone(gabarito) : null,
    obterContexto: async () => contexto ? clone(contexto) : null,
    transacionar: async callback => callback(tx),
  };

  return {
    repository,
    get parsed() { return parsed; },
    set parsed(value: ParseContaHonorariosResultado) { parsed = value; },
    get hospital() { return hospital; },
    set hospital(value: SnapshotHospitalarAutorizado) { hospital = value; },
    set configured(value: boolean) { configured = value; },
    fontes,
    eventos,
    writes,
    xmlReads,
    listarArquivosMedicos,
    diagnosticarSnapshotHospitalar,
  };
}

describe("contaContextoMedicoService — somente informação não financeira", () => {
  it("indexa guia correlacionada, é idempotente na mesma versão e nunca persiste campo financeiro", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({
      repositorio: fake.repository,
      parse: () => fake.parsed,
      now: () => new Date("2026-10-27T12:00:00.000Z"),
    });

    await expect(service.indexar({ scope, arquivoMedicoId: 6 })).resolves.toMatchObject({ indexadas: 1, jaIndexadas: 0 });
    await expect(service.indexar({ scope, arquivoMedicoId: 6 })).resolves.toMatchObject({ indexadas: 0, jaIndexadas: 1 });
    expect(fake.xmlReads).toHaveBeenCalledTimes(2); // somente nas mutações explícitas
    expect(fake.writes).toEqual({ fontes: 1, contextos: 0, eventos: 0, financeiro: 0 });

    const dto = await service.consultar({ scope });
    const serialized = JSON.stringify(dto);
    expect(dto.configuracaoPendente).toBe(false);
    expect(dto.fontes).toHaveLength(1);
    expect(serialized).not.toContain("s3Key");
    expect(serialized).not.toContain("versaoSemantica");
    expect(serialized).not.toMatch(/valor|recebimento|carteira/i);
    expect(fake.writes).toEqual({ fontes: 1, contextos: 0, eventos: 0, financeiro: 0 });
  });

  it("bloqueia arquivo estrangeiro e não baixa XML quando o escopo hospitalar não é exato", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({ repositorio: fake.repository, parse: () => fake.parsed });
    const foreignScope = { ...scope, convenioId: 999 };

    await expect(service.indexar({ scope: foreignScope, arquivoMedicoId: 6 }))
      .rejects.toMatchObject({ codigo: "PRECONDICAO" } satisfies Partial<ContaContextoMedicoErro>);
    expect(fake.xmlReads).not.toHaveBeenCalled();
    expect(fake.fontes).toHaveLength(0);
  });

  it("retorna apenas diagnóstico agregado quando não há snapshot e não consulta fontes ou arquivos médicos", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({ repositorio: fake.repository, parse: () => fake.parsed });
    const foreignScope = { ...scope, competencia: "2026/11" };

    await expect(service.consultar({ scope: foreignScope })).resolves.toEqual({
      configuracaoPendente: false,
      diagnosticoSnapshot: {
        etapas: [
          { etapa: "arquivo_hospitalar", totalLinhas: 0 },
          { etapa: "identificacao_conta", totalLinhas: 0 },
          { etapa: "lote", totalLinhas: 0 },
          { etapa: "competencia", totalLinhas: 0 },
        ],
      },
      fontes: [],
      candidatos: [],
      contexto: null,
      itensHospitalares: 0,
      setorInformado: false,
      avisos: [],
    });
    const respostaArquivos = await service.listarArquivos({ scope: foreignScope });
    expect(respostaArquivos).toMatchObject({
      configuracaoPendente: false,
      arquivos: [],
      diagnosticoSnapshot: { etapas: expect.any(Array) },
    });
    expect(fake.listarArquivosMedicos).not.toHaveBeenCalled();
    expect(fake.diagnosticarSnapshotHospitalar).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(respostaArquivos)).not.toMatch(/CONTA-SINTETICA|39|2026\/11|arquivoHospitalId|numeroConta/i);
  });

  it("recusa guia cuja correlação explícita não confere beneficiário ou data", async () => {
    const fake = makeRepository();
    fake.parsed = parseResultado();
    fake.hospital = {
      ...fake.hospital,
      referenciasGuias: [{
        numeroGuiaPrestador: "GUIA-1",
        numeroGuiaOperadora: null,
        beneficiario: "OUTRO-BENEFICIARIO",
        datasExecucao: ["2026-10-03"],
      }],
    };
    const service = criarContaContextoMedicoService({ repositorio: fake.repository, parse: () => fake.parsed });

    await expect(service.indexar({ scope, arquivoMedicoId: 6 }))
      .rejects.toMatchObject({ codigo: "PRECONDICAO" } satisfies Partial<ContaContextoMedicoErro>);
    expect(fake.fontes).toHaveLength(0);
    expect(fake.writes.financeiro).toBe(0);
  });

  it("confirma com CAS, anexa eventos imutáveis e invalida sem apagar evidências", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({
      repositorio: fake.repository,
      parse: () => fake.parsed,
      now: () => new Date("2026-10-27T12:00:00.000Z"),
    });
    await service.indexar({ scope, arquivoMedicoId: 6 });

    const confirmado = await service.confirmar({
      scope,
      padraoId: 50,
      justificativa: "Conferido manualmente em ambiente sintético.",
      revisaoEsperada: 0,
      usuarioId: 7,
    });
    expect(confirmado).toMatchObject({ status: "confirmado", revisao: 1, padraoId: 50 });
    expect(fake.eventos).toHaveLength(1);
    expect(fake.writes.financeiro).toBe(0);

    await expect(service.invalidar({
      scope,
      justificativa: "Tentativa com revisão obsoleta.",
      revisaoEsperada: 0,
      usuarioId: 8,
    })).rejects.toMatchObject({ codigo: "CONCORRENCIA" } satisfies Partial<ContaContextoMedicoErro>);

    const invalidado = await service.invalidar({
      scope,
      justificativa: "Invalidação manual sintética.",
      revisaoEsperada: 1,
      usuarioId: 8,
    });
    expect(invalidado).toMatchObject({ status: "invalidado", revisao: 2 });
    expect(fake.eventos).toHaveLength(2);
    expect(fake.writes).toMatchObject({ fontes: 1, contextos: 2, eventos: 2, financeiro: 0 });
  });

  it("mantém pendência de composição como informação e permite confirmação humana do gabarito aplicável", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({
      repositorio: fake.repository,
      parse: () => fake.parsed,
      now: () => new Date("2026-10-27T12:00:00.000Z"),
    });
    await service.indexar({ scope, arquivoMedicoId: 6 });
    fake.hospital = { ...fake.hospital, itensHospitalares: [] };

    const antes = await service.consultar({ scope });
    expect(antes.candidatos[0]).toMatchObject({
      elegivel: true,
      principaisTotal: 1,
      principaisEncontrados: 1,
      composicao: { faltantesObrigatorios: 1, pendencias: 1 },
    });
    await expect(service.confirmar({
      scope,
      padraoId: 50,
      justificativa: "Aplicabilidade confirmada manualmente apesar da pendência informativa.",
      revisaoEsperada: 0,
      usuarioId: 7,
    })).resolves.toMatchObject({ status: "confirmado", padraoId: 50 });
    expect(fake.writes.financeiro).toBe(0);
  });

  it("marca revisão necessária se uma fonte semântica ou itens hospitalares mudarem", async () => {
    const fake = makeRepository();
    const service = criarContaContextoMedicoService({
      repositorio: fake.repository,
      parse: () => fake.parsed,
      now: () => new Date("2026-10-27T12:00:00.000Z"),
    });
    await service.indexar({ scope, arquivoMedicoId: 6 });
    await service.confirmar({
      scope, padraoId: 50, justificativa: "Confirmação sintética.", revisaoEsperada: 0, usuarioId: 7,
    });

    fake.parsed = parseResultado("Descrição semanticamente alterada");
    await service.indexar({ scope, arquivoMedicoId: 6 });
    let dto = await service.consultar({ scope });
    expect(dto.contexto).toMatchObject({ status: "revisao_necessaria" });

    // Mesmo que a fonte permaneça, troca na composição hospitalar também invalida o snapshot.
    fake.hospital = {
      ...fake.hospital,
      itensHospitalares: [{ ...fake.hospital.itensHospitalares[0], quantidade: "2" }],
    };
    dto = await service.consultar({ scope });
    expect(dto.contexto).toMatchObject({ status: "revisao_necessaria" });
    expect(fake.eventos).toHaveLength(1); // consultar não grava evento nem reindexa
    expect(fake.writes.financeiro).toBe(0);
  });

  it("retorna configuração pendente e mantém mutações fechadas quando o schema/adaptador não está disponível", async () => {
    const fake = makeRepository();
    fake.configured = false;
    const service = criarContaContextoMedicoService({ repositorio: fake.repository, parse: () => fake.parsed });

    await expect(service.consultar({ scope })).resolves.toMatchObject({
      configuracaoPendente: true,
      fontes: [],
      candidatos: [],
      contexto: null,
    });
    await expect(service.indexar({ scope, arquivoMedicoId: 6 }))
      .rejects.toMatchObject({ codigo: "CONFIGURACAO_PENDENTE" } satisfies Partial<ContaContextoMedicoErro>);
    expect(fake.xmlReads).not.toHaveBeenCalled();
    expect(fake.writes).toEqual({ fontes: 0, contextos: 0, eventos: 0, financeiro: 0 });
  });
});
