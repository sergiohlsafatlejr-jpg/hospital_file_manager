import { describe, expect, it } from "vitest";
import { parseContaHonorarios } from "./contaHonorariosParser";
import { criarContaContextoMedicoRepositorioDrizzle } from "./contaContextoMedicoDrizzle";
import {
  hashHonorarios,
  comporBlocosHonorarios,
  normalizarProcedimentosHonorarios,
  versaoComposicaoHonorarios,
} from "./contaHonorariosComposicao";
import {
  harnessHonorarios,
  guiaHonorarios,
  hospitalHonorarios,
  referenciaHonorarios,
  procedimentoHonorarios as proc,
  profissionalHonorarios as prof,
  linhaHonorarios,
  linhaFonteHonorarios,
  lerFontesHonorarios,
} from "./contaHonorariosComposicao.fixture";

const clone = <T>(x: T): T => structuredClone(x);
describe("Issue #174 — H1/H2/H3, somente honorários sintéticos", () => {
  it("H1: nunca ressuscita PROC-RETIRADO em legado nem após publicação de revisão nova", async () => {
    const legado = await lerFontesHonorarios([
      linhaHonorarios(2, [proc("PROC-ATUAL")]),
      linhaHonorarios(1, [proc("PROC-RETIRADO")]),
    ]);
    expect(legado).toHaveLength(1);
    expect(legado[0].id).toBe(2);
    expect(legado[0].procedimentos.map(p => p.codigo)).toEqual(["PROC-ATUAL"]);
    const f = harnessHonorarios([guiaHonorarios("PROC-RETIRADO")]);
    await f.indexar();
    f.parsed.guias = [guiaHonorarios("PROC-ATUAL")];
    await f.indexar();
    const dto = await f.consultar();
    expect(dto.fontes).toHaveLength(1);
    expect(dto.fontes[0].procedimentos.map(p => p.codigo)).toEqual([
      "PROC-ATUAL",
    ]);
    expect(dto.candidatos[0].elegivel).toBe(false);
    await expect(f.confirmar()).rejects.toMatchObject({
      codigo: "PRECONDICAO",
    });
    expect(f.eventos).toHaveLength(0);
  });

  it("H2: mantém fontes distintas para identidades hospitalares distintas dentro da mesma tupla", async () => {
    const f = harnessHonorarios(
      [
        guiaHonorarios("PROC-A"),
        guiaHonorarios("PROC-B", "BEN-B", "GO-B", "2026-10-28"),
      ],
      hospitalHonorarios([
        referenciaHonorarios(),
        referenciaHonorarios("GO-B", "BEN-B", "2026-10-28"),
      ])
    );
    expect(await f.automatico()).toMatchObject({
      indexadas: 2,
      semCorrespondencia: 0,
      ambiguas: 0,
    });
    expect(f.fontes).toHaveLength(2);
    const dto = await f.consultar();
    expect(dto.fontes).toHaveLength(2);
    expect(
      dto.fontes.map(s => s.procedimentos.map(p => p.codigo)).sort()
    ).toEqual([["PROC-A"], ["PROC-B"]]);
    expect(
      new Set(f.fontes.map(s => s.composicao!.identidadeHospitalar)).size
    ).toBe(2);
    expect(new Set(f.fontes.map(s => s.composicao!.revisaoArquivo)).size).toBe(
      1
    );
    expect(JSON.stringify(dto)).not.toMatch(
      /BEN-A|BEN-B|identidadeHospitalar|revisaoArquivo|hashProcedimentos|blocos/
    );
  });

  it.each(["beneficiario", "operadora", "datas", "snapshot"])(
    "H2: %s altera identidade/revisão mesmo com procedimentos iguais",
    async campo => {
      const f = harnessHonorarios();
      await f.indexar();
      const antiga = f.fontes[0];
      if (campo === "beneficiario") {
        f.hospital.referenciasGuias[0].beneficiario = "BEN-C";
        f.parsed.guias[0].correlacao.numeroCarteira = "BEN-C";
      }
      if (campo === "operadora") {
        f.hospital.referenciasGuias[0].numeroGuiaOperadora = "GO-C";
        f.parsed.guias[0].correlacao.numeroGuiaOperadora = "GO-C";
      }
      if (campo === "datas")
        f.hospital.referenciasGuias[0].datasExecucao = [
          "2026-10-27",
          "2026-10-28",
        ];
      if (campo === "snapshot")
        f.hospital.itensHospitalares = [
          { codigo: "HOSP-NOVO", tipo: "outro", quantidade: "1" },
        ];
      await f.indexar();
      expect(f.fontes).toHaveLength(2);
      expect(f.fontes[1].versaoSemantica).not.toBe(antiga.versaoSemantica);
      expect(f.fontes[1].versaoSnapshotHospitalar).not.toBe(
        antiga.versaoSnapshotHospitalar
      );
      expect((await f.consultar()).fontes).toHaveLength(1);
    }
  );

  it("H2: ambiguidade, operador conflitante e XML parcialmente válido falham antes de inserir", async () => {
    for (const automatico of [false, true]) {
      const f = harnessHonorarios(
        [guiaHonorarios()],
        hospitalHonorarios([referenciaHonorarios(), referenciaHonorarios()])
      );
      await expect(
        automatico ? f.automatico() : f.indexar()
      ).rejects.toMatchObject({ codigo: "PRECONDICAO" });
      expect(f.fontes).toHaveLength(0);
      const conflito = harnessHonorarios([
        guiaHonorarios("PROC", "BEN-A", "GO-ALHEIA"),
      ]);
      await expect(
        automatico ? conflito.automatico() : conflito.indexar()
      ).rejects.toMatchObject({ codigo: "PRECONDICAO" });
      expect(conflito.fontes).toHaveLength(0);
      const parcial = harnessHonorarios([
        guiaHonorarios(),
        guiaHonorarios("ALHEIO", "BEN-ALHEIO"),
      ]);
      await expect(
        automatico ? parcial.automatico() : parcial.indexar()
      ).rejects.toMatchObject({ codigo: "PRECONDICAO" });
      expect(parcial.fontes).toHaveLength(0);
    }
  });

  it("H1: remove identidade inteira da revisão e recusa manifesto parcial, corrupto ou mistura legada", async () => {
    const f = harnessHonorarios(
      [guiaHonorarios("PROC-A"), guiaHonorarios("PROC-B", "BEN-B", "GO-B")],
      hospitalHonorarios([
        referenciaHonorarios(),
        referenciaHonorarios("GO-B", "BEN-B"),
      ])
    );
    await f.indexar();
    const antigos = f.fontes.map(linhaFonteHonorarios);
    expect(await lerFontesHonorarios([antigos[0]])).toEqual([]);
    const corrompido = clone(antigos);
    corrompido[0].procedimentosJson = {
      procedimentos: [proc("ADULTERADO")],
      composicao: f.fontes[0].composicao!,
    };
    expect(await lerFontesHonorarios(corrompido)).toEqual([]);
    const hashErrado = clone(antigos);
    hashErrado[0].versaoSemantica = "0".repeat(64);
    expect(await lerFontesHonorarios(hashErrado)).toEqual([]);
    f.parsed.guias.splice(1, 1);
    await f.indexar();
    expect(
      (await f.consultar()).fontes.map(s => s.procedimentos.map(p => p.codigo))
    ).toEqual([["PROC-A"]]);
    expect(
      await lerFontesHonorarios([
        linhaHonorarios(2, [proc()]),
        { ...linhaHonorarios(1, [proc()]), guiaReferencia: "OUTRA-GUIA" },
      ])
    ).toEqual([]);
    const legado = harnessHonorarios(
      [],
      hospitalHonorarios([
        referenciaHonorarios(),
        referenciaHonorarios("GO-B", "BEN-B"),
      ])
    );
    legado.repo.listarFontes = async () => [
      { ...f.fontes[0], composicao: undefined },
    ];
    expect((await legado.consultar()).fontes).toEqual([]);
  });

  it("H3: enriquecimento Não informado/nomeProf nunca cria procedimento adicional", async () => {
    const xml =
      "<mensagemTISS><guiaHonorarios><numeroGuiaPrestador>GP-FICTICIA</numeroGuiaPrestador><procedimentosRealizados><procedimentoRealizado><sequencialItem>1</sequencialItem><dataExecucao>2026-10-27</dataExecucao><codigoProcedimento>PROC-FICTICIO</codigoProcedimento><descricaoProcedimento>Procedimento ficticio</descricaoProcedimento><profissionalExecutante><nomeProf>Profissional Novo</nomeProf><conselhoProfissional>CRM</conselhoProfissional><numeroConselhoProfissional>FICTICIO</numeroConselhoProfissional></profissionalExecutante></procedimentoRealizado></procedimentosRealizados></guiaHonorarios></mensagemTISS>";
    const novo = parseContaHonorarios(xml).guias[0].procedimentos[0];
    expect(novo.profissionais[0].nome).toBe("Profissional Novo");
    const antigo = { ...novo, profissionais: [prof("Não informado")] };
    expect(comporBlocosHonorarios([[antigo], [novo]])).toEqual([novo]);
    const fontes = await lerFontesHonorarios([
      linhaHonorarios(2, [novo]),
      linhaHonorarios(1, [antigo]),
    ]);
    expect(fontes[0].registros).toBe(1);
    expect(fontes[0].procedimentos).toEqual([novo]);
  });

  it("H3: A/B/B faz matching exato em todas as ocorrências e não vira terceiro procedimento", async () => {
    const a = proc("PROC", [prof("A")]);
    const b = proc("PROC", [prof("B")]);
    const expected = normalizarProcedimentosHonorarios([a, b]);
    expect(comporBlocosHonorarios([[a, b], [b]])).toEqual(expected);
    expect(comporBlocosHonorarios([[b], [b, a]])).toEqual(expected);
    const fontes = await lerFontesHonorarios([
      linhaHonorarios(2, [a, b]),
      linhaHonorarios(1, [a, b]),
    ]);
    expect(fontes[0].registros).toBe(2);
    expect(fontes[0].procedimentos).toEqual([a, b]);
  });

  it("H3: preserva repetições legítimas same-source sem sequencial e não deduplica ocorrência interna", async () => {
    const repetido = proc("PROC-REPETIDO", [], null);
    const g = guiaHonorarios();
    g.procedimentos = [repetido, clone(repetido)];
    const visita = guiaHonorarios("PROC-VISITA");
    const f = harnessHonorarios([g, visita]);
    await f.indexar();
    expect(f.fontes[0].registros).toBe(3);
    expect(
      f.fontes[0].procedimentos.filter(p => p.codigo === "PROC-REPETIDO")
    ).toHaveLength(2);
    expect(f.fontes[0].composicao!.blocos.map(b => b.registros).sort()).toEqual(
      [1, 2]
    );
    const fonte = await lerFontesHonorarios([
      linhaHonorarios(1, [repetido, repetido]),
    ]);
    expect(fonte[0].registros).toBe(2);
    expect(fonte[0].procedimentos).toHaveLength(2);
  });

  it("reorder é idempotente; evidence hash cobre todos os blocos, mudança e revalidation", async () => {
    const g = guiaHonorarios("PROC-A");
    const h = guiaHonorarios("PROC-B", "BEN-A", "GO-A", "2026-10-28");
    const f = harnessHonorarios(
      [g, h],
      hospitalHonorarios([
        {
          ...referenciaHonorarios(),
          datasExecucao: ["2026-10-28", "2026-10-27"],
        },
      ])
    );
    await f.indexar();
    await f.confirmar();
    const source = clone(f.fontes[0]);
    expect(source.composicao!.blocos).toHaveLength(2);
    expect(source.versaoSemantica).toBe(
      versaoComposicaoHonorarios(source.composicao!)
    );
    expect(source.composicao!.hashProcedimentos).toBe(
      hashHonorarios(normalizarProcedimentosHonorarios(source.procedimentos))
    );
    expect(f.contexto!.fontesVersoes).toEqual([
      {
        fonteId: source.id,
        guiaReferencia: source.guiaReferencia,
        versaoSemantica: source.versaoSemantica,
      },
    ]);
    expect(f.eventos[0]).toMatchObject({
      evidencia: { fontesVersoes: f.contexto!.fontesVersoes },
    });
    f.parsed.guias.reverse();
    f.hospital.referenciasGuias[0].datasExecucao = ["2026-10-27", "2026-10-28"];
    expect(await f.indexar()).toMatchObject({ indexadas: 0, jaIndexadas: 1 });
    expect(f.fontes).toHaveLength(1);
    expect(f.fontes[0]).toEqual(source);
    expect((await f.consultar()).contexto!.status).toBe("confirmado");
    f.parsed.guias = [g];
    await f.indexar();
    expect((await f.consultar()).fontes[0].registros).toBe(1);
    expect((await f.consultar()).contexto!.status).toBe("revisao_necessaria");
    expect(f.fontes[1].versaoSemantica).not.toBe(source.versaoSemantica);
    expect(f.eventos).toHaveLength(1);
    f.hospital.referenciasGuias[0].beneficiario = "BEN-ALTERADO";
    expect((await f.consultar()).fontes).toEqual([]);
  });

  it("H3: Unicode NFC/NFD não causa nova versão ao inverter profissionais ou blocos", async () => {
    const nomes = [prof("Jos\u00e9"), prof("Jose\u0301")];
    const g = guiaHonorarios();
    g.procedimentos[0].profissionais = clone(nomes);
    const f = harnessHonorarios([g, guiaHonorarios("VISITA")]);
    await f.indexar();
    const primeira = clone(f.fontes[0]);
    f.parsed.guias[0].procedimentos[0].profissionais.reverse();
    f.parsed.guias.reverse();
    expect(await f.indexar()).toMatchObject({ indexadas: 0, jaIndexadas: 1 });
    expect(f.fontes).toHaveLength(1);
    expect(f.fontes[0]).toEqual(primeira);
    expect(f.fontes[0].registros).toBe(2);
    expect(normalizarProcedimentosHonorarios([proc("PROC", nomes)])).toEqual(
      normalizarProcedimentosHonorarios([proc("PROC", clone(nomes).reverse())])
    );
  });

  it("lotes/snapshots diferentes não se unem; evidência lote é imutável", async () => {
    for (const rows of [
      [
        linhaHonorarios(2, [proc("NEW")], 55),
        linhaHonorarios(1, [proc("OLD")], 54),
      ],
      [
        linhaHonorarios(2, [proc("NEW")], null, "SNAP-NEW"),
        linhaHonorarios(1, [proc("OLD")], null, "SNAP-OLD"),
      ],
    ])
      expect(
        (await lerFontesHonorarios(rows))[0].procedimentos.map(p => p.codigo)
      ).toEqual(["NEW"]);
    const f = harnessHonorarios();
    await f.service.indexarAutomaticamente({
      arquivo: {
        id: 906,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: 901,
        convenioId: 902,
      },
      xml: Buffer.from("<ficticio/>"),
      loteImportacaoId: 55,
    });
    const antiga = clone(f.fontes[0]);
    await f.service.indexarAutomaticamente({
      arquivo: {
        id: 906,
        tipoArquivo: "xml",
        direcao: "enviado",
        estabelecimentoId: 901,
        convenioId: 902,
      },
      xml: Buffer.from("<ficticio/>"),
      loteImportacaoId: 56,
    });
    expect(f.fontes).toHaveLength(2);
    expect(f.fontes[0]).toEqual(antiga);
    expect(f.fontes[1].versaoSemantica).not.toBe(antiga.versaoSemantica);
    expect((await f.consultar()).fontes).toHaveLength(1);
  });

  it("revalidation recusa publicação que muda entre preparação e CAS", async () => {
    const f = harnessHonorarios();
    await f.indexar();
    const original = f.repo.transacionar;
    f.repo.transacionar = async callback => {
      f.parsed.guias = [guiaHonorarios("PROC-OUTRO")];
      await f.indexar();
      return original(callback);
    };
    await expect(f.confirmar()).rejects.toMatchObject({
      codigo: "CONCORRENCIA",
    });
    expect(f.contexto).toBeNull();
    expect(f.eventos).toEqual([]);
    expect(
      (await f.consultar()).fontes[0].procedimentos.map(p => p.codigo)
    ).toEqual(["PROC-OUTRO"]);
  });

  it("persiste JSON de composição e não atualiza evidência ao resolver conflito único", async () => {
    const f = harnessHonorarios();
    await f.indexar();
    const source = f.fontes[0];
    const row = linhaFonteHonorarios(source);
    let valores: unknown;
    let updates = 0;
    let conflito = false;
    const query: any = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: async () => [row],
    };
    const db = {
      select: () => query,
      insert: () => ({
        values: async (value: unknown) => {
          valores = value;
          if (conflito) throw { code: "ER_DUP_ENTRY" };
          return [{ insertId: 1 }];
        },
      }),
      update: () => {
        updates += 1;
        throw new Error("UPDATE não autorizado no teste");
      },
    };
    const repo = criarContaContextoMedicoRepositorioDrizzle({
      getDb: async () => db as never,
    });
    expect((await repo.inserirFonteSeAusente(source)).criada).toBe(true);
    expect(valores).toMatchObject({
      procedimentosJson: {
        procedimentos: source.procedimentos,
        composicao: source.composicao,
      },
      versaoSemantica: source.versaoSemantica,
    });
    conflito = true;
    expect((await repo.inserirFonteSeAusente(source)).criada).toBe(false);
    expect(updates).toBe(0);
    await expect(
      repo.inserirFonteSeAusente({ ...source, loteImportacaoId: 999 })
    ).rejects.toMatchObject({ codigo: "PRECONDICAO" });
    expect(updates).toBe(0);
    row.composicao = {
      ...source.composicao!,
      revisaoArquivo: hashHonorarios("historico"),
    };
    row.procedimentosJson = {
      procedimentos: source.procedimentos,
      composicao: row.composicao,
    };
    await expect(repo.inserirFonteSeAusente(source)).rejects.toMatchObject({
      codigo: "PRECONDICAO",
    });
    expect(updates).toBe(0);
  });
});
