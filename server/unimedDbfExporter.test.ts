import { describe, expect, it } from "vitest";
import { DBFFile } from "dbffile";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarUnimedDbf, mapUnimedDbfRow, normalizarDescricaoDbf } from "./unimedDbfExporter";

describe("unimedDbfExporter", () => {
  it("mapeia o registro para o layout oficial do DBF Unimed", () => {
    expect(mapUnimedDbfRow({
      codigo: "31102360",
      nome: "Procedimento com descrição longa",
      valor: "1533.70",
      valorPorteAnestesico: "806.41",
      porte: "5",
      numeroAuxiliares: 1,
    })).toMatchObject({
      CODTBPPROP: "00",
      CODTBPPADR: "00",
      CODSPPROP: "31102360",
      CODSPPADR: "31102360",
      VALORHOSP: 0,
      VALORPROF: 1533.7,
      VALORANE: 806.41,
      VALORSADT: 0,
      PTOPORANE: 5,
      NUMAUX: 1,
      FILMEM2: 0,
    });
  });

  it("normaliza acentos, pontuação e símbolos na DESCRSP", () => {
    expect(normalizarDescricaoDbf("Ação, ã, ç, ~ e ^: Coração & Saúde"))
      .toBe("Acao a c e Coracao Saude");
    expect(mapUnimedDbfRow({
      codigo: "1",
      nome: "Ação, ã, ç, ~ e ^: Coração & Saúde",
      valor: 10,
    }).DESCRSP).toBe("Acao a c e Coracao Saude");
  });

  it("mantém DESCRSP sem caracteres especiais e limitada a 65 caracteres", () => {
    const descricao = normalizarDescricaoDbf(
      "Descrição muito longa, com acentuação e caracteres ~ ^ ! @ # $ % para truncar corretamente",
    );

    expect(descricao).toHaveLength(65);
    expect(descricao).toMatch(/^[A-Za-z0-9 ]+$/);
    expect(descricao).not.toMatch(/\s{2,}/);
  });

  it("gera um DBF legível com os 16 campos do exemplo", async () => {
    const content = await gerarUnimedDbf([{
      codigo: "31102360",
      nome: "Ureterorrenolitotripsia flexível, à laser ~ unilateral ^",
      valor: 1533.7,
      valorPorteAnestesico: 806.41,
      porte: 5,
      numeroAuxiliares: 1,
    }]);
    const directory = await mkdtemp(join(tmpdir(), "unimed-dbf-test-"));
    const path = join(directory, "resultado.DBF");
    try {
      await writeFile(path, content);
      const dbf = await DBFFile.open(path);
      expect(dbf.fields).toHaveLength(16);
      expect(dbf.fields.map((field) => field.name)).toEqual([
        "CODTBPPROP", "CODTBPPADR", "CODSPPROP", "CODSPPADR", "DESCRSP",
        "VALORHOSP", "VALORPROF", "VALORANE", "VALORSADT", "CODMOEDVAL",
        "CODMOEDASH", "CODMOEDANE", "CODMOEDASD", "PTOPORANE", "NUMAUX", "FILMEM2",
      ]);
      const rows = await dbf.readRecords();
      expect(rows[0]).toMatchObject({
        CODSPPROP: "31102360",
        DESCRSP: "Ureterorrenolitotripsia flexivel a laser unilateral",
        VALORPROF: 1533.7,
        VALORANE: 806.41,
        PTOPORANE: 5,
        NUMAUX: 1,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
