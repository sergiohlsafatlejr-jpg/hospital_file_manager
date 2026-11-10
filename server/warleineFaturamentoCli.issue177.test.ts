import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));
vi.mock("node:fs/promises", () => ({ access: vi.fn(), mkdir: vi.fn(), readFile: vi.fn(), stat: vi.fn(), unlink: vi.fn(), writeFile: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./warleineFileVault", () => ({ encryptWarleineFile: vi.fn() }));
vi.mock("./warleineFaturamentoImportService", () => ({ hashWarleineFile: vi.fn(), reserveWarleineImportJob: vi.fn() }));
vi.mock("./warleineFaturamentoWorker", () => ({ processWarleineImportJob: vi.fn(), getWarleineImportJobStatus: vi.fn() }));

import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { storagePut } from "./storage";
import { encryptWarleineFile } from "./warleineFileVault";
import { hashWarleineFile, reserveWarleineImportJob } from "./warleineFaturamentoImportService";
import { getWarleineImportJobStatus, processWarleineImportJob } from "./warleineFaturamentoWorker";
import { runWarleineImportCli } from "../scripts/importar-faturamento-warleine";

const args = ["--arquivo", "/synthetic/SYNTHETIC.csv", "--estabelecimento", "700011", "--usuario", "700021", "--substituir-competencias"];
const scope = { loteId: 700001, estabelecimentoId: 700011 };
const reservation = { loteId: scope.loteId, reusedExistingLot: false, status: "enfileirado" };

describe("Issue 177 CLI — truthful scoped publication and no implicit local fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(unlink).mockResolvedValue(undefined);
    vi.mocked(stat).mockResolvedValue({ size: 12, isFile: () => true } as any);
    vi.mocked(readFile).mockResolvedValue(Buffer.from("synthetic"));
    vi.mocked(hashWarleineFile).mockResolvedValue("a".repeat(64));
    vi.mocked(encryptWarleineFile).mockReturnValue(Buffer.from("encrypted synthetic"));
    vi.mocked(storagePut).mockResolvedValue({ key: "synthetic-key", url: "https://synthetic.invalid/file" });
    vi.mocked(reserveWarleineImportJob).mockResolvedValue(reservation);
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("enfileirado");
    vi.mocked(processWarleineImportJob).mockResolvedValue({ ...scope, outcome: "not_claimed", durableStatus: "enfileirado", published: false });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns async acceptance, not completed/publication, without immediate flag", async () => {
    const result = await runWarleineImportCli(args);
    expect(result).toMatchObject({ exitCode: 0, output: { ...scope, status: "enfileirado", processamento: "enfileirado", published: false, armazenamento: "duravel" } });
    expect(processWarleineImportJob).not.toHaveBeenCalled();
    expect(getWarleineImportJobStatus).toHaveBeenCalledWith(scope);
  });

  it.each(["busy", "not_claimed", "not_published"] as const)("does not assert publication for immediate outcome %s", async (outcome) => {
    vi.mocked(processWarleineImportJob).mockResolvedValue({ ...scope, outcome, durableStatus: "enfileirado", published: false });
    const result = await runWarleineImportCli([...args, "--processar-agora"]);
    expect(processWarleineImportJob).toHaveBeenCalledWith(scope, { allowLocalSource: false });
    expect(result).toMatchObject({ exitCode: 2, output: { ...scope, published: false, status: "enfileirado", processamento: "pendente", workerOutcome: outcome } });
    expect(result.output.mensagem).not.toContain("publicado com sucesso");
  });

  it("does not assert publication for a legacy false worker return", async () => {
    vi.mocked(processWarleineImportJob).mockResolvedValue(false as any);
    const result = await runWarleineImportCli([...args, "--processar-agora"]);
    expect(result.exitCode).toBe(2);
    expect(result.output.published).toBe(false);
    expect(result.output.processamento).not.toBe("concluido");
  });

  it("does not assert publication for validation alone", async () => {
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("validado");
    vi.mocked(processWarleineImportJob).mockResolvedValue({ ...scope, outcome: "not_published", durableStatus: "validado", published: false });
    const result = await runWarleineImportCli([...args, "--processar-agora"]);
    expect(result).toMatchObject({ exitCode: 2, output: { status: "validado", processamento: "nao_publicado", published: false } });
  });

  it("requires both scoped worker confirmation and a fresh published durable status", async () => {
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("publicado");
    vi.mocked(processWarleineImportJob).mockResolvedValue({ ...scope, outcome: "published", durableStatus: "publicado", published: true });
    expect(await runWarleineImportCli([...args, "--processar-agora"])).toMatchObject({ exitCode: 0, output: { ...scope, status: "publicado", processamento: "concluido", published: true } });
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("validado");
    expect(await runWarleineImportCli([...args, "--processar-agora"])).toMatchObject({ exitCode: 2, output: { status: "validado", published: false } });
  });

  it("does not trust a published return for a different lot", async () => {
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("publicado");
    vi.mocked(processWarleineImportJob).mockResolvedValue({ ...scope, loteId: 700099, outcome: "published", durableStatus: "publicado", published: true });
    const result = await runWarleineImportCli([...args, "--processar-agora"]);
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatchObject({ ...scope, published: false });
  });

  it("verifies published reservation durably and never calls worker for reused published lot", async () => {
    vi.mocked(reserveWarleineImportJob).mockResolvedValue({ ...reservation, reusedExistingLot: true, status: "publicado" });
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("publicado");
    expect(await runWarleineImportCli([...args, "--processar-agora"])).toMatchObject({ exitCode: 0, output: { ...scope, status: "publicado", published: true, processamento: "concluido" } });
    expect(processWarleineImportJob).not.toHaveBeenCalled();
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("reservado");
    expect(await runWarleineImportCli([...args, "--processar-agora"])).toMatchObject({ exitCode: 2, output: { status: "reservado", published: false } });
  });

  it("returns failure for durable error and does not log or include raw thrown SQL/path/clinical error", async () => {
    vi.mocked(processWarleineImportJob).mockRejectedValue(new Error("SELECT clinical_secret FROM x /tmp/clinical.pdf"));
    vi.mocked(getWarleineImportJobStatus).mockResolvedValue("erro");
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runWarleineImportCli([...args, "--processar-agora"]);
    expect(result).toMatchObject({ exitCode: 1, output: { ...scope, status: "erro", processamento: "erro", published: false, errorCode: "WARLEINE_IMPORT_FAILED" } });
    expect(JSON.stringify(result)).not.toContain("clinical_secret");
    expect(logger).not.toHaveBeenCalled();
    logger.mockRestore();
  });

  it("reports unknown durable state rather than using stale reservation status when SELECT fails", async () => {
    vi.mocked(getWarleineImportJobStatus).mockRejectedValue(new Error("SQL clinical_secret"));
    const result = await runWarleineImportCli(args);
    expect(result).toMatchObject({ exitCode: 1, output: { ...scope, status: null, published: false, processamento: "erro" } });
    expect(JSON.stringify(result)).not.toContain("clinical_secret");
  });

  it.each([false, true])("production storage failure never writes local source with opt-in=%s and absent URL", async (optIn) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.mocked(storagePut).mockRejectedValue(new Error("SQL clinical_secret"));
    const result = await runWarleineImportCli([...args, ...(optIn ? ["--permitir-arquivo-local"] : [])]);
    expect(result.exitCode).toBe(1);
    expect(result.output.status).toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
    expect(reserveWarleineImportJob).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("clinical_secret");
  });

  it("does not fallback locally outside production without explicit opt-in", async () => {
    vi.mocked(storagePut).mockRejectedValue(new Error("synthetic storage failure"));
    expect((await runWarleineImportCli(args)).exitCode).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(reserveWarleineImportJob).not.toHaveBeenCalled();
  });

  it("explicit dev local opt-in is honestly labeled non-durable and forwarded only to scoped worker", async () => {
    vi.mocked(storagePut).mockRejectedValue(new Error("synthetic storage failure"));
    const result = await runWarleineImportCli([...args, "--permitir-arquivo-local", "--processar-agora"]);
    expect(result.output.armazenamento).toBe("local-nao-duravel");
    expect(result.output.published).toBe(false);
    expect(vi.mocked(reserveWarleineImportJob).mock.calls[0][0].storageKey).toMatch(/^local:/);
    expect(processWarleineImportJob).toHaveBeenCalledWith(scope, { allowLocalSource: true });
    expect(unlink).not.toHaveBeenCalled(); // Persisted source is retained for its durable job metadata.
    expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true, mode: 0o700 });
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { mode: 0o600, flag: "wx" });
  });

  it("cleans its unique local fallback if reservation fails but never deletes input file", async () => {
    vi.mocked(storagePut).mockRejectedValue(new Error("synthetic storage failure"));
    vi.mocked(reserveWarleineImportJob).mockRejectedValue(new Error("SELECT clinical_secret"));
    const result = await runWarleineImportCli([...args, "--permitir-arquivo-local"]);
    expect(result.exitCode).toBe(1);
    expect(unlink).toHaveBeenCalledWith(vi.mocked(writeFile).mock.calls[0][0]);
    expect(unlink).not.toHaveBeenCalledWith(args[1]);
    expect(JSON.stringify(result)).not.toContain("clinical_secret");
  });

  it("validates full snapshot confirmation and numeric config before filesystem access", async () => {
    expect((await runWarleineImportCli(args.filter((x) => x !== "--substituir-competencias"))).exitCode).toBe(1);
    expect((await runWarleineImportCli([...args, "--config", "not-an-id"])).exitCode).toBe(1);
    expect(access).not.toHaveBeenCalled();
  });

  it("rejects oversized file before reading, encryption or storage", async () => {
    vi.mocked(stat).mockResolvedValue({ size: 301 * 1024 * 1024, isFile: () => true } as any);
    expect((await runWarleineImportCli(args)).exitCode).toBe(1);
    expect(readFile).not.toHaveBeenCalled();
    expect(encryptWarleineFile).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
  });
});
