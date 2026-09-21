import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("piloto Tasy multiestabelecimento", () => {
  it("usa staging compartilhada com lote e estabelecimento e remove os schemas legados", () => {
    const schema = read("drizzle/schema-integracao.ts");
    expect(schema).toContain('"tasy_integracao_lotes"');
    expect(schema).toContain('"tasy_atendimentos_staging"');
    expect(schema).toContain("estabelecimentoId: int().notNull()");
    expect(schema).not.toContain("TASY_hemolabor_atendimentos_stagion");
    expect(schema).not.toContain("Tasy_maternidadeela_atendimentos_stagion");
  });

  it("mantém chave de origem composta por estabelecimento", () => {
    const migration = read("drizzle/0115_pink_satana.sql");
    expect(migration).toContain("UNIQUE(`estabelecimentoId`,`origemSistema`,`origemId`)");
  });

  it("garante deduplicação atômica de arquivo por estabelecimento", () => {
    const schema = read("drizzle/schema-integracao.ts");
    const migration = read("drizzle/0118_past_major_mapleleaf.sql");
    expect(schema).toContain('uniqueIndex("uq_tasy_lote_estab_hash")');
    expect(schema).toContain("table.estabelecimentoId, table.arquivoHash");
    expect(migration).toContain("UNIQUE(`estabelecimentoId`,`arquivoHash`)");
  });

  it("registra a exclusão somente das duas stagings antigas", () => {
    const migration = read("drizzle/0117_motionless_the_captain.sql");
    const drops = migration.match(/DROP TABLE/g) || [];
    expect(drops).toHaveLength(2);
    expect(migration.match(/DROP TABLE IF EXISTS/g)).toHaveLength(2);
    expect(migration).toContain("TASY_hemolabor_atendimentos_stagion");
    expect(migration).toContain("Tasy_maternidadeela_atendimentos_stagion");
  });

  it("protege importação, deduplicação e publicação por unidade", () => {
    const service = read("server/tasyCsvImportService.ts");
    expect(service).toContain("WHERE estabelecimentoId = ? AND arquivoHash = ?");
    expect(service).toContain("await connection.beginTransaction()");
    expect(service).toContain("SELECT id FROM estabelecimentos WHERE id = ? FOR UPDATE");
    expect(service).toContain("Importação interrompida; lote liberado para retomada.");
    expect(service).toContain("progress.processedRows % 25_000 === 0");
    expect(service).toContain("isTasySnapshotCoverageSafe(activeAccounts, totalAccounts)");
    expect(service).toContain("WHERE estabelecimentoId = ?");
    expect(service).toContain("PARTITION BY origemId");
    expect(service).toContain("ON DUPLICATE KEY UPDATE");
  });

  it("usa upload em disco, execução síncrona e confirmação explícita do snapshot", () => {
    const upload = read("server/uploadMultipart.ts");
    const page = read("client/src/pages/AtendimentosUnificados.tsx");
    expect(upload).toContain("multer.diskStorage");
    expect(upload).toContain('/api/tasy/importar-csv');
    expect(upload.indexOf("authorizeTasyUpload,")).toBeLessThan(upload.indexOf("uploadTasyCsv.single('file')"));
    expect(upload).toContain("req.header('x-estabelecimento-id')");
    expect(upload).toContain('verificarPermissaoEstabelecimento');
    expect(upload).toContain("verificarAcessoModulo(user.id, estabelecimentoId, 'importacaoTasy')");
    expect(upload).toContain("'gerenciar'");
    expect(upload).toContain("confirmarSubstituicao");
    expect(upload).toContain("await importTasyCsvFile");
    expect(upload).toContain("processandoEmBackground: false");
    expect(upload).not.toContain("setImmediate");
    expect(page).toContain('headers: { "x-estabelecimento-id": String(estabelecimentoAtual.id) }');
  });

  it("abre a rota principal na tela paginada e exibe valor e situação", () => {
    const app = read("client/src/App.tsx");
    const page = read("client/src/pages/AtendimentosUnificados.tsx");
    const table = read("client/src/components/atendimentos/AtendimentosTabela.tsx");
    const filters = read("client/src/components/atendimentos/AtendimentosFiltros.tsx");
    expect(app).toContain('import("./pages/AtendimentosUnificados")');
    expect(page).toContain("listarPaginado.useQuery");
    expect(page).toContain("tasyImportacao.listarLotes");
    expect(table).toContain("valorConta");
    expect(filters).toContain("Contas pendentes");
    expect(filters).toContain("Contas finalizadas");
  });

  it("exige estabelecimento nas consultas, notificações e histórico", () => {
    const router = read("server/routers.ts");
    const db = read("server/db.ts");
    expect(router).toContain("estabelecimentoId: z.number().int().positive()");
    expect(router.match(/reportProcedure\("atendimentos"\)/g)?.length).toBeGreaterThanOrEqual(9);
    expect(router).toContain("verificarAtendimentosDoEstabelecimento");
    expect(router).toContain("listarHistoricoNotificacoesAtendimento(input.estabelecimentoId)");
    expect(router).not.toContain("motivosMap = await buscarMotivosNotificacao(numatends)");
    expect(db).toContain("eq(notificacoesAtendimento.estabelecimentoId, estabelecimentoId)");
    expect(db).toContain("historicoNotificacoesAtendimento.estabelecimentoId");
  });

  it("usa desempate por id na paginação e confirma republicação manual", () => {
    const router = read("server/routers.ts");
    const tasyRouter = read("server/routers/tasyImportacaoRouter.ts");
    expect(router).toContain("orderBy(orderFn(sortCol), orderFn(atendimentosUnificados.id))");
    expect(tasyRouter).toContain("confirmarSubstituicao: z.literal(true).optional()");
    expect(tasyRouter).toContain('action === "gerenciar" ? "importacaoTasy" : "atendimentos"');
  });
});
