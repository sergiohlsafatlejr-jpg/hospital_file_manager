import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("implantação do faturamento Warleine", () => {
  it("usa uma staging canônica compartilhada e tabelas publicadas por estabelecimento", () => {
    const schema = read("drizzle/schema-integracao.ts");
    const migration = read("drizzle/0119_third_wildside.sql");
    expect(schema).toContain("warleine_faturamento_staging");
    expect(schema).toContain("warleine_faturamento_lotes");
    expect(schema).toContain("warleine_faturamento_itens");
    expect(schema).toContain("warleine_faturamento_snapshots_ativos");
    expect(schema).toContain("warleine_faturamento_quarentena");
    expect(schema).toContain("warleine_faturamento_analises");
    expect(schema).toContain("uq_warleine_fat_lote_estab_hash");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `warleine_faturamento_staging`");
    expect(migration).toContain("ALTER TABLE `warleine_faturamento_staging`");
    expect(read("drizzle/0126_flowery_siren.sql")).toContain("CREATE TABLE `warleine_faturamento_analises`");
    expect(read("drizzle/schema.ts")).toContain('mysqlTable("staging_faturamento_warleine"');
  });

  it("isola as três consultas por unidade e por fonte ativa Warleine", () => {
    const service = read("server/warleineFaturamentoService.ts");
    const router = read("server/routers/warleineFaturamentoRouter.ts");
    expect(service).toContain('const ACTIVE = "1=1"');
    expect(service).toContain('"estabelecimentoId=?"');
    expect(router).toContain('reportProcedure("contaConvenio")');
    expect(router).toContain('reportProcedure("relFaturadoRecebido")');
    expect(router).toContain('reportProcedure("relatoriosGlosasBi")');
  });

  it("mantém XML e demonstrativos fora do relatório Warleine", () => {
    const financial = read("server/warleineFaturamentoService.ts");
    const page = read("client/src/pages/FaturadoRecebidoUnificado.tsx");
    expect(financial).toContain("warleine_faturamento_itens");
    expect(financial).toContain("warleine_faturamento_itens_ativos");
    expect(financial).not.toMatch(/FROM\s+faturamento_unificado/i);
    expect(financial).not.toMatch(/FROM\s+demonstrativo/i);
    expect(financial).not.toMatch(/INSERT\s+INTO\s+contas_convenio_itens/i);
    expect(financial).not.toMatch(/INSERT\s+INTO\s+faturamento_unificado/i);
    expect(page).toContain("XMLs, demonstrativos, lançamentos manuais e a base oficial não são somados nesta visão");
  });

  it("bloqueia sincronização e transformação legadas que poderiam duplicar a publicação", () => {
    const integrator = read("server/routers/integradorDadosRouter.ts");
    expect(integrator).toContain("A sincronização legada de faturamento Warleine foi desativada para evitar duplicidade");
    expect(integrator).toContain("A transformação legada de faturamento Warleine foi desativada");
    expect(integrator).toContain("A limpeza legada de faturamento Warleine foi desativada");
  });

  it("autoriza antes do multer, exige confirmação e enfileira arquivo criptografado", () => {
    const upload = read("server/uploadMultipart.ts");
    const authorizeIndex = upload.indexOf("authorizeWarleineUpload,");
    const multerIndex = upload.search(/uploadWarleineXlsx\.single\(["']file["']\)/);
    expect(authorizeIndex).toBeGreaterThan(0);
    expect(multerIndex).toBeGreaterThan(authorizeIndex);
    expect(upload).toContain("confirmarSubstituicao !== 'true'");
    expect(upload).toContain("encryptWarleineFile");
    expect(upload).toContain("reserveWarleineImportJob");
    expect(upload).toContain("processandoEmBackground");
    expect(upload).not.toMatch(/setImmediate\([^)]*Warleine/i);
  });

  it("retoma jobs pelo banco e rejeita múltiplas abas", () => {
    const worker = read("server/warleineFaturamentoWorker.ts");
    const importer = read("server/warleineFaturamentoImportService.ts");
    expect(worker).toContain("status IN ('enfileirado','erro')");
    expect(worker).toContain("storageGet");
    expect(worker).toContain("tentativas<3");
    expect(worker).toContain("FOR UPDATE");
    expect(worker).toContain("claimToken");
    expect(worker).toContain("leaseExpiresAt");
    expect(importer).toContain("deve conter exatamente uma aba");
    expect(importer).not.toContain("allowLargeSnapshotReduction");
    expect(importer).toContain("ON DUPLICATE KEY UPDATE ${MATERIALIZE_UPDATE_SQL}");
    expect(importer).toContain('`${fileHash}:${line}`');
    expect(importer).toContain("CONTEUDO_REPETIDO_NO_ARQUIVO");
    expect(importer).toContain("withWarleineLeaseFence");
    expect(importer).toContain("claimToken=? AND leaseExpiresAt>NOW()");
    expect(importer).toContain("leaseExpiresAt>NOW() AS leaseAtivoDb");
    expect(importer).not.toContain("claimToken?: string");
    expect(importer).not.toContain("INNER JOIN warleine_faturamento_staging s");
    expect(importer).toContain("warleine_faturamento_snapshots_ativos");
    expect(importer).not.toContain("SET ativoParaRelatorio=0");
  });

  it("protege identidade física, snapshot estrito e valores financeiros exatos", () => {
    const schema = read("drizzle/schema-integracao.ts");
    const identityMigration = read("drizzle/0121_sleepy_sue_storm.sql");
    const importer = read("server/warleineFaturamentoImportService.ts");
    const reporting = read("server/warleineFaturamentoService.ts");
    expect(schema).toContain("uq_warleine_item_estab_origem");
    expect(identityMigration).toContain("CONCAT(l.arquivoHash, ':', i.numeroLinha)");
    expect(importer).toContain('minimumCoverage: Decimal.Value = "0.995"');
    expect(importer).toContain("SNAPSHOT_REDUZIDO:");
    expect(reporting).toContain('import Decimal from "decimal.js"');
    expect(reporting).not.toContain("CRC32");
    expect(reporting).toContain("scaled.abs().greaterThan(Number.MAX_SAFE_INTEGER)");
    expect(reporting).toContain("CONVENIO_CHAVE_SQL}=?");
    expect(reporting).toContain("MAX(${CONVENIO_NOME_SQL}) AS convenio");
    expect(reporting).not.toContain("GROUP BY convenioChave,convenio");
    expect(reporting).toContain("conveniosDetalhes");
    expect(reporting).toContain("warleine_faturamento_analises");
    expect(reporting).toContain("FOR UPDATE");
  });

  it("oferece aprovação administrativa auditável e não mascara exportação parcial", () => {
    const router = read("server/routers/warleineFaturamentoRouter.ts");
    expect(router).toContain("aprovarReducaoSnapshot: adminProcedure");
    expect(router).toContain("motivo: z.string().trim().min(10)");
    expect(read("client/src/pages/ContaConvenio.tsx")).toContain("Exportar página atual");
  });

  it("pagina os itens de uma conta com limite e desempate por id", () => {
    const service = read("server/warleineFaturamentoService.ts");
    const router = read("server/routers/warleineFaturamentoRouter.ts");
    expect(service).toContain("LIMIT ? OFFSET ?");
    expect(service).toContain("ORDER BY id");
    expect(router).toContain("pageSize: z.number().int().min(20).max(200)");
  });

  it("fixa o snapshot enquanto monta o detalhe e lê a análise", () => {
    const service = read("server/warleineFaturamentoService.ts");
    const start = service.indexOf("export async function getWarleineAccountDetails");
    const end = service.indexOf("export async function getWarleineAccountAnalysis", start);
    const detail = service.slice(start, end);
    expect(detail).toContain("FOR UPDATE");
    expect(detail).toContain("getWarleineAccountItems");
    expect(detail).toContain("getWarleineAccountAnalysis");
  });

  it("faz a CLI enfileirar o arquivo criptografado em vez de escrever sem lease", () => {
    const cli = read("scripts/importar-faturamento-warleine.ts");
    expect(cli).toContain("reserveWarleineImportJob");
    expect(cli).toContain("encryptWarleineFile");
    expect(cli).not.toContain("importWarleineFaturamentoFile");
  });

  it("unifica a Conta Convênio e preserva relatórios Warleine explicitamente separados", () => {
    const app = read("client/src/App.tsx");
    const menu = read("client/src/components/DashboardLayout.tsx");
    const page = read("client/src/pages/ContaConvenio.tsx");
    const details = read("client/src/pages/ContaConvenioDetalhes.tsx");
    expect(app).toContain('/conta-convenio');
    expect(app).not.toContain('/conta-convenio-warleine');
    expect(app).toContain('/faturado-recebido-warleine');
    expect(app).toContain('/relatorios-glosas-warleine');
    expect(menu).not.toContain("Conta Convênio — Warleine");
    expect(menu).toContain("Faturado x Recebido — Warleine");
    expect(menu).toContain("Glosas — Warleine");
    expect(page).toContain('value="WARLEINE"');
    expect(page).toContain("warleineFaturamento.compararComPadroes");
    expect(page).toContain("!isWarleine && <Button");
    expect(page).toContain('Number(competencia.slice(5, 7)) === Number(mes.value)');
    expect(page).toContain('mesFiltro.padStart(2, "0")');
    expect(details).toContain('params.get("fonte") === "WARLEINE"');
    expect(existsSync(resolve(root, "client/src/pages/ContaConvenioWarleine.tsx"))).toBe(false);
  });
});
