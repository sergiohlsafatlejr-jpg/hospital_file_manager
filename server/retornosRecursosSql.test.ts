import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as schema from "../drizzle/schema";

// Opt-in explícito e endereço fixo: este teste jamais usa DATABASE_URL.
const enabled = process.env.SAFATLE_RETORNOS_SQL_QA === "1";
const state = vi.hoisted(() => ({
  db: null as any,
  files: new Map<string, Buffer>(),
}));
vi.mock("./db", () => ({
  getDb: async () => state.db,
  verificarAcessoModulo: async () => true,
}));
vi.mock("./recursoGlosaPermissions", () => ({
  exigirAcessoEstabelecimento: async () => undefined,
}));
vi.mock("./retornosRecursosStorage", () => ({
  armazenamentoRetornosPronto: () => true,
  salvarArquivoRetorno: async (buffer: Buffer) => {
    const key = `qa-local-${state.files.size}`;
    state.files.set(key, buffer);
    return { key };
  },
  lerArquivoRetorno: async (key: string) => state.files.get(key),
}));
import * as service from "./retornosRecursosService";

const scope = { estabelecimentoId: 9001, convenioId: 9011 };
let pool: mysql.Pool;
const quote = (s: string) => `\`${s.replaceAll("`", "``")}\``;
function xml(total = "49.00", accepted = "30.00") {
  const line = (
    code: string,
    sequence: number,
    amount: string,
    granted: string
  ) =>
    `<respostaGuiaItens><numeroGuiaPrestador>GUIA-QA-P</numeroGuiaPrestador><numeroGuiaOperadora>GUIA-QA-O</numeroGuiaOperadora><sequencialItem>${sequence}</sequencialItem><dataRealizacao>2026-10-10</dataRealizacao><procRecurso><codigoTabela>22</codigoTabela><codigoProcedimento>${code}</codigoProcedimento></procRecurso><codGlosa>1001</codGlosa><valorRecursado>${amount}</valorRecursado><valorAcatadado>${granted}</valorAcatadado><justificativaPrestador>Justificativa exclusivamente sintética.</justificativaPrestador><justificativaOperadora>Resposta exclusivamente sintética.</justificativaOperadora></respostaGuiaItens>`;
  return Buffer.from(
    `<?xml version="1.0"?><mensagemTISS><cabecalho><identificacaoTransacao><tipoTransacao>RESPOSTA_RECURSO_GLOSA</tipoTransacao><dataRegistroTransacao>2026-10-20</dataRegistroTransacao></identificacaoTransacao><Padrao>4.01.00</Padrao></cabecalho><operadoraParaPrestador><respostaRecursoGlosa><reciboGlosa><registroANS>006246</registroANS><codigoPrestador>PREST-QA</codigoPrestador><nomeOperadora>CASSI sintética</nomeOperadora><objetoRecurso>2</objetoRecurso><numeroLote>LOTE-QA</numeroLote><numeroProtocolo>PROTO-QA</numeroProtocolo><numeroGuiaRecGlosaPrestador>REC-QA-P</numeroGuiaRecGlosaPrestador><numeroGuiaRecGlosaOperadora>REC-QA-O</numeroGuiaRecGlosaOperadora><dataRecurso>2026-10-15</dataRecurso><valorTotalRecursado>60.00</valorTotalRecursado><valorTotalAcatado>${total}</valorTotalAcatado><opcaoRecurso><recursoGuia>${line("10101012", 1, "40.00", accepted)}${line("10101013", 2, "20.00", "10.00")}</recursoGuia></opcaoRecurso></reciboGlosa></respostaRecursoGlosa></operadoraParaPrestador></mensagemTISS>`
  );
}
const suite = enabled ? describe : describe.skip;
suite("Retornos: integração SQL local opt-in", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = "chave-qa-sintetica-exclusiva-retornos-1234567890";
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: 3410,
      user: "root",
      connectionLimit: 5,
      timezone: "Z",
    });
    await pool.query(
      "CREATE DATABASE IF NOT EXISTS safatle_retornos_qa CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"
    );
    await pool.end();
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: 3410,
      user: "root",
      database: "safatle_retornos_qa",
      connectionLimit: 5,
      timezone: "Z",
    });
    await pool.query("SET FOREIGN_KEY_CHECKS=0");
    const [tables] = await pool.query<mysql.RowDataPacket[]>("SHOW TABLES");
    for (const t of tables)
      await pool.query(`DROP TABLE ${quote(String(Object.values(t)[0]))}`);
    await pool.query("SET FOREIGN_KEY_CHECKS=1");
    // Apenas estruturas sintéticas da fonte; a migração nova é aplicada integralmente.
    for (const table of [
      schema.convenios,
      schema.convenioEstabelecimentoPrestador,
      schema.demonstrativo,
      schema.arquivos,
      schema.lotesRecurso,
    ]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(
        c =>
          `${quote(c.name)} ${c.getSQLType()} ${c.primary ? "NOT NULL PRIMARY KEY" : "NULL"}`
      );
      await pool.query(
        `CREATE TABLE ${quote(config.name)} (${columns.join(",")})`
      );
    }
    const sql = readFileSync(
      new URL("../drizzle/0137_retornos_recursos_cassi.sql", import.meta.url),
      "utf8"
    );
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean))
      await pool.query(statement);
    state.db = drizzle(pool);
    await state.db
      .insert(schema.convenios)
      .values({
        id: 9011,
        nome: "CASSI sintética",
        codigo: "CASSI",
        registroAns: "006246",
        ativo: "sim",
        estabelecimentoId: 9001,
      });
    await state.db
      .insert(schema.convenioEstabelecimentoPrestador)
      .values({
        id: 1,
        estabelecimentoId: 9001,
        convenioId: 9011,
        codigoPrestador: "PREST-QA",
        ativo: "sim",
      });
    await state.db
      .insert(schema.arquivos)
      .values({
        id: 8001,
        estabelecimentoId: 9001,
        convenioId: 9011,
        nome: "fonte-sintetica.xml",
        hash: "a".repeat(64),
        status: "processado",
        tipo: "xml",
        direcao: "retornado",
      });
    for (const [id, code, seq, value] of [
      [7001, "10101012", 1, "40.00"],
      [7002, "10101013", 2, "20.00"],
    ] as const) {
      await state.db
        .insert(schema.demonstrativo)
        .values({
          id,
          arquivoId: 8001,
          estabelecimentoId: 9001,
          convenioId: 9011,
          numeroGuia: "GUIA-QA-O",
          sequencialItem: seq,
          dataExecucao: new Date("2026-10-10T00:00:00Z"),
          codigoItem: code,
          codigoGlosa: "1001",
          valorGlosa: value,
          valorPago: "123.00",
          codigoPrestador: "PREST-QA",
          protocolo: "FAT-QA",
          lotePrestador: "FAT-LOTE-QA",
          descricaoItem: "Item sintético",
        });
    }
  }, 30000);
  afterAll(async () => {
    await pool?.end();
  });
  it("preserva fontes e datas, revisão explícita, parcelas idempotentes, concorrência e estorno", async () => {
    const [baseline] = await pool.query(
      "SELECT * FROM demonstrativo ORDER BY id"
    );
    const base64 = xml().toString("base64");
    const preview = await service.retornosPrever(
      { ...scope, conteudoBase64: base64 },
      1
    );
    expect(preview.contagens.sugerido).toBe(2); // prova busca pela guia da operadora
    expect(preview.documento.dataResposta).toBe("2026-10-20");
    expect(preview.documento.dataRecurso).toBe("2026-10-15");
    const imported = await service.retornosImportar(
      {
        ...scope,
        conteudoBase64: base64,
        nomeArquivo: "resposta-qa.xml",
        origemRecurso: "externo",
        tokenPrevia: preview.tokenPrevia,
        confirmar: true,
      },
      1
    );
    const detailInput = { ...scope, importacaoId: imported.importacaoId };
    const detail = await service.retornosDetalhe(detailInput, 1);
    expect(detail.resumo.recebidoInformado).toBe("0.00");
    expect(detail.resumo.acatadoAprovado).toBe("0.00");
    const reviewItems = detail.linhas.map((l, i) => ({
      linhaId: l.id,
      demonstrativoId: 7001 + i,
      justificativa: "Revisão humana sintética e explícita.",
    }));
    await expect(
      service.retornosRevisar(
        { ...detailInput, itens: reviewItems, confirmar: true },
        1
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await service.retornosRevisar(
      {
        ...detailInput,
        itens: reviewItems,
        confirmar: true,
        confirmarDivergenciasCabecalho: true,
      },
      1
    );
    await service.retornosRevisar(
      {
        ...detailInput,
        itens: reviewItems,
        confirmar: true,
        confirmarDivergenciasCabecalho: true,
      },
      1
    );
    const payment = {
      ...detailInput,
      valor: "10.00",
      dataRecebimento: "2026-10-21",
      referencia: "PARCELA-QA-1",
      observacao: "Comprovante exclusivamente sintético.",
      chaveOperacao: randomUUID(),
      confirmar: true as const,
    };
    const first = await service.retornosRegistrarPagamento(payment, 1);
    expect(
      (await service.retornosRegistrarPagamento(payment, 1)).idempotente
    ).toBe(true);
    const parallel = await Promise.allSettled(
      [1, 2].map(i =>
        service.retornosRegistrarPagamento(
          {
            ...payment,
            valor: "20.00",
            referencia: `PARCELA-QA-CONCORRENTE-${i}`,
            chaveOperacao: randomUUID(),
          },
          1
        )
      )
    );
    expect(parallel.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      service.retornosRegistrarPagamento(
        {
          ...payment,
          valor: "11.00",
          referencia: "EXCEDE-QA",
          chaveOperacao: randomUUID(),
        },
        1
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const reverse = {
      ...detailInput,
      pagamentoId: first.id,
      dataEstorno: "2026-10-22",
      justificativa: "Estorno sintético com evidência revisada.",
      chaveOperacao: randomUUID(),
      confirmar: true as const,
    };
    await service.retornosEstornarPagamento(reverse, 1);
    expect(
      (await service.retornosEstornarPagamento(reverse, 1)).idempotente
    ).toBe(true);
    const final = await service.retornosDetalhe(detailInput, 1);
    expect(final.resumo.recebidoInformado).toBe("20.00");
    expect(final.resumo.saldoAcatado).toBe("20.00");
    expect(final.resumo.acatadoAprovado).toBe("40.00");
    const duplicate = await service.retornosImportar(
      {
        ...scope,
        conteudoBase64: base64,
        nomeArquivo: "renomeado-qa.xml",
        origemRecurso: "externo",
        tokenPrevia: preview.tokenPrevia,
        confirmar: true,
      },
      1
    );
    expect(duplicate.jaImportado).toBe(true);
    const changed = xml("49.00", "28.00").toString("base64");
    const changedPreview = await service.retornosPrever(
      { ...scope, conteudoBase64: changed },
      1
    );
    await expect(
      service.retornosImportar(
        {
          ...scope,
          conteudoBase64: changed,
          nomeArquivo: "conflito-qa.xml",
          origemRecurso: "externo",
          tokenPrevia: changedPreview.tokenPrevia,
          confirmar: true,
        },
        1
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [originals] = await pool.query(
      "SELECT * FROM demonstrativo ORDER BY id"
    );
    expect(originals).toEqual(baseline);
    await pool.query(
      `UPDATE demonstrativo SET ${quote(schema.demonstrativo.valorGlosa.name)}='39.00' WHERE id=7001`
    );
    await expect(
      service.retornosRegistrarPagamento(
        {
          ...payment,
          valor: "1.00",
          referencia: "FONTE-ALTERADA-QA",
          chaveOperacao: randomUUID(),
        },
        1
      )
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  }, 30000);
  it("rejeita registro ANS e código de prestador de outro cadastro", async () => {
    for (const buffer of [
      Buffer.from(
        xml().toString().replace("<registroANS>006246", "<registroANS>999999")
      ),
      Buffer.from(
        xml()
          .toString()
          .replace("<codigoPrestador>PREST-QA", "<codigoPrestador>OUTRO-QA")
      ),
    ]) {
      await expect(
        service.retornosPrever(
          { ...scope, conteudoBase64: buffer.toString("base64") },
          1
        )
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("reconfere o prestador ativo na confirmação sem confiar em prévia antiga", async () => {
    const conteudoBase64 = xml().toString("base64");
    const previa = await service.retornosPrever(
      { ...scope, conteudoBase64 },
      1
    );
    const filesBefore = state.files.size;
    await pool.query(
      `UPDATE ${quote(getTableConfig(schema.convenioEstabelecimentoPrestador).name)} SET ativo='nao' WHERE id=1`
    );
    try {
      await expect(
        service.retornosImportar(
          {
            ...scope,
            conteudoBase64,
            nomeArquivo: "revogado-qa.xml",
            origemRecurso: "externo",
            tokenPrevia: previa.tokenPrevia,
            confirmar: true,
          },
          1
        )
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(state.files.size).toBe(filesBefore);
    } finally {
      await pool.query(
        `UPDATE ${quote(getTableConfig(schema.convenioEstabelecimentoPrestador).name)} SET ativo='sim' WHERE id=1`
      );
    }
  });
  it("exige lote Portal enviado, do mesmo hospital/convênio e com o protocolo do XML", async () => {
    const conteudoBase64 = Buffer.from(
      xml().toString().replace("<numeroLote>LOTE-QA", "<numeroLote>PORTAL-QA")
    ).toString("base64");
    const previa = await service.retornosPrever(
      { ...scope, conteudoBase64 },
      1
    );
    const payload = {
      ...scope,
      conteudoBase64,
      nomeArquivo: "portal-qa.xml",
      origemRecurso: "portal" as const,
      lotePortalId: 401,
      tokenPrevia: previa.tokenPrevia,
      confirmar: true as const,
    };
    await state.db
      .insert(schema.lotesRecurso)
      .values({
        id: 401,
        estabelecimentoId: 9999,
        convenioId: 9011,
        status: "enviado",
        protocoloEnvio: "PROTO-QA",
      });
    await expect(service.retornosImportar(payload, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await pool.query(
      `UPDATE ${quote(getTableConfig(schema.lotesRecurso).name)} SET ${quote(schema.lotesRecurso.estabelecimentoId.name)}=9001, ${quote(schema.lotesRecurso.status.name)}='rascunho' WHERE id=401`
    );
    await expect(service.retornosImportar(payload, 1)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await pool.query(
      `UPDATE ${quote(getTableConfig(schema.lotesRecurso).name)} SET ${quote(schema.lotesRecurso.status.name)}='enviado', ${quote(schema.lotesRecurso.protocoloEnvio.name)}='OUTRO-QA' WHERE id=401`
    );
    await expect(service.retornosImportar(payload, 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("não devolve hashes, chaves de storage nem snapshots internos no detalhe", async () => {
    const detalhe = await service.retornosDetalhe(
      { ...scope, importacaoId: 1 },
      1
    );
    const texto = JSON.stringify(detalhe);
    for (const campo of [
      "arquivoHash",
      "StorageKey",
      "conteudoSemanticoHash",
      "arquivoFonteHash",
      "demonstrativoChave",
      "candidatosSnapshot",
    ])
      expect(texto).not.toContain(campo);
    expect(detalhe.linhas[0].vinculoAtual.status).toBe("alterado");
  });
  it("duas importações simultâneas concluem com a mesma identidade sem repetir dados", async () => {
    const conteudoBase64 = Buffer.from(
      xml()
        .toString()
        .replace("<numeroLote>LOTE-QA", "<numeroLote>CONCORRENTE-QA")
    ).toString("base64");
    const previa = await service.retornosPrever(
      { ...scope, conteudoBase64 },
      1
    );
    const payload = {
      ...scope,
      conteudoBase64,
      nomeArquivo: "concorrente-qa.xml",
      origemRecurso: "externo" as const,
      tokenPrevia: previa.tokenPrevia,
      confirmar: true as const,
    };
    const results = await Promise.all([
      service.retornosImportar(payload, 1),
      service.retornosImportar(payload, 1),
    ]);
    expect(results[0].importacaoId).toBe(results[1].importacaoId);
    expect(
      (
        await service.retornosDetalhe(
          { ...scope, importacaoId: results[0].importacaoId },
          1
        )
      ).linhas
    ).toHaveLength(2);
  });
  it("duas respostas distintas não duplicam o acatado aprovado da mesma glosa", async () => {
    for (const [id, code, seq, value] of [
      [7101, "10101012", 1, "40.00"],
      [7102, "10101013", 2, "20.00"],
    ] as const) {
      await state.db
        .insert(schema.demonstrativo)
        .values({
          id,
          arquivoId: 8001,
          estabelecimentoId: 9001,
          convenioId: 9011,
          numeroGuia: "GUIA-RESERVA-QA",
          sequencialItem: seq,
          dataExecucao: new Date("2026-10-10T00:00:00Z"),
          codigoItem: code,
          codigoGlosa: "1001",
          valorGlosa: value,
          codigoPrestador: "PREST-QA",
          protocolo: "FAT-RESERVA-QA",
          lotePrestador: "FAT-RESERVA-QA",
        });
    }
    const ids: number[] = [];
    for (const sufixo of ["A", "B"]) {
      const conteudoBase64 = Buffer.from(
        xml()
          .toString()
          .replaceAll("GUIA-QA-P", "GUIA-RESERVA-QA")
          .replaceAll("GUIA-QA-O", "GUIA-RESERVA-QA")
          .replace("<numeroLote>LOTE-QA", `<numeroLote>RESERVA-QA-${sufixo}`)
      ).toString("base64");
      const previa = await service.retornosPrever(
        { ...scope, conteudoBase64 },
        1
      );
      const result = await service.retornosImportar(
        {
          ...scope,
          conteudoBase64,
          nomeArquivo: `reserva-${sufixo}.xml`,
          origemRecurso: "externo",
          tokenPrevia: previa.tokenPrevia,
          confirmar: true,
        },
        1
      );
      ids.push(result.importacaoId);
    }
    const detalhes = await Promise.all(
      ids.map(importacaoId =>
        service.retornosDetalhe({ ...scope, importacaoId }, 1)
      )
    );
    const resultados = await Promise.allSettled(
      detalhes.map((detalhe, index) =>
        service.retornosRevisar(
          {
            ...scope,
            importacaoId: ids[index],
            itens: detalhe.linhas.map((linha, i) => ({
              linhaId: linha.id,
              demonstrativoId: 7101 + i,
              justificativa: "Reserva sintética revisada explicitamente.",
            })),
            confirmar: true,
            confirmarDivergenciasCabecalho: true,
          },
          1
        )
      )
    );
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find(r => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    const finais = await Promise.all(
      ids.map(importacaoId =>
        service.retornosDetalhe({ ...scope, importacaoId }, 1)
      )
    );
    expect(finais.map(d => d.resumo.acatadoAprovado).sort()).toEqual([
      "0.00",
      "40.00",
    ]);
  });
  it("sem migração retorna configuração pendente em vez de tentar criar tabelas", async () => {
    await pool.query(
      "RENAME TABLE recursos_retornos_importacoes TO recursos_retornos_importacoes_qa_ausente"
    );
    try {
      const lista = await service.retornosListar(
        { ...scope, pagina: 1, limite: 20 },
        1
      );
      expect(lista).toMatchObject({
        configuracaoPendente: true,
        total: 0,
        registros: [],
      });
    } finally {
      await pool.query(
        "RENAME TABLE recursos_retornos_importacoes_qa_ausente TO recursos_retornos_importacoes"
      );
    }
  });
});
