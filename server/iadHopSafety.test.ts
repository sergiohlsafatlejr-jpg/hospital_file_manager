import { afterEach, describe, expect, it } from "vitest";
import { createDecipheriv } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildIadPhysicalContract,
  IAD_HOP_CADASTRO_TABLE,
  IAD_HOP_DESTINATION_COLUMNS,
  IAD_HOP_DESTINATION_TABLE,
  IAD_HOP_INTEGRATOR_TABLE,
  IAD_HOP_LEGACY_INTEGRATOR_TABLE,
  IAD_HOP_SOURCE_COLUMNS,
  IAD_HOP_SOURCE_TABLE,
  readPrivateJson,
  writeEncryptedBackupVerified,
  writePrivateJsonExclusive,
  type BuildIadPhysicalContractArgs,
  type IadIndexMetadata,
  type IadPhysicalColumnMetadata,
} from "./iadHopSafety";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function privateDirectory(label: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `iad-hop-${label}-`));
  fs.chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

function column(
  tabela: string,
  coluna: string,
  pos: number,
  extra: Partial<IadPhysicalColumnMetadata> = {},
): IadPhysicalColumnMetadata {
  const datetime = coluna === "datatend" || coluna === "datasai" || coluna === "data_entrada" || coluna === "data_saida";
  return {
    tabela,
    coluna,
    tipo: datetime ? "datetime" : "varchar(255)",
    dataType: datetime ? "datetime" : "varchar",
    nulo: "YES",
    pos,
    charset: datetime ? null : "utf8mb4",
    collation: datetime ? null : "utf8mb4_unicode_ci",
    ...extra,
  };
}

function sourceColumns(table = IAD_HOP_SOURCE_TABLE): IadPhysicalColumnMetadata[] {
  return IAD_HOP_SOURCE_COLUMNS.map((name, index) => column(table, name, index + 1, {
    nulo: name === "numatend" || name === "datatend" || name === "Estabelecimentos_id" ? "NO" : "YES",
  }));
}

function destinationColumns(): IadPhysicalColumnMetadata[] {
  return IAD_HOP_DESTINATION_COLUMNS.map((name, index) => column(IAD_HOP_DESTINATION_TABLE, name, index + 1, {
    nulo: name === "estabelecimentoId" || name === "origemSistema" || name === "origemId" ? "NO" : "YES",
  }));
}

function index(tabela: string, indice: string, coluna: string, pos: number, nonUnique: number): IadIndexMetadata {
  return { tabela, indice, coluna, pos, nonUnique };
}

function physicalMetadata(): BuildIadPhysicalContractArgs {
  return {
    columns: [...sourceColumns(), ...destinationColumns()],
    hupColumns: sourceColumns("stagion_atendimentos_parados_urologico"),
    engines: [
      { tabela: IAD_HOP_SOURCE_TABLE, engine: "InnoDB" },
      { tabela: IAD_HOP_DESTINATION_TABLE, engine: "InnoDB" },
      { tabela: IAD_HOP_CADASTRO_TABLE, engine: "InnoDB" },
      { tabela: IAD_HOP_LEGACY_INTEGRATOR_TABLE, engine: "InnoDB" },
      { tabela: IAD_HOP_INTEGRATOR_TABLE, engine: "InnoDB" },
    ],
    indexes: [
      index(IAD_HOP_DESTINATION_TABLE, "uq_origem", "estabelecimentoId", 1, 0),
      index(IAD_HOP_DESTINATION_TABLE, "uq_origem", "origemSistema", 2, 0),
      index(IAD_HOP_DESTINATION_TABLE, "uq_origem", "origemId", 3, 0),
      index(IAD_HOP_LEGACY_INTEGRATOR_TABLE, "idx_estab", "estabelecimentoId", 1, 1),
      index(IAD_HOP_INTEGRATOR_TABLE, "idx_estab", "estabelecimentoId", 1, 1),
      index(IAD_HOP_CADASTRO_TABLE, "PRIMARY", "id", 1, 0),
    ],
    triggerCount: 0,
  };
}

describe("IAD HOP physical metadata contract", () => {
  it("aceita 13 campos fonte, destino legado com os 16 necessários e produz hash independente da ordem", () => {
    const metadata = physicalMetadata();
    const first = buildIadPhysicalContract(metadata);
    const second = buildIadPhysicalContract({
      ...metadata,
      columns: [...metadata.columns].reverse(),
      hupColumns: [...metadata.hupColumns].reverse(),
      engines: [...metadata.engines].reverse(),
      indexes: [...metadata.indexes].reverse(),
    });
    expect(first.projection).toEqual([...IAD_HOP_SOURCE_COLUMNS]);
    expect(first.projection).not.toContain("codpac");
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.sha256).toBe(first.sha256);
  });

  it("aceita somente codpac INT NULL como décima quarta coluna da origem", () => {
    const metadata = physicalMetadata();
    metadata.columns.push(column(IAD_HOP_SOURCE_TABLE, "codpac", 14, {
      tipo: "int", dataType: "int", nulo: "YES", charset: null, collation: null,
    }));
    expect(buildIadPhysicalContract(metadata).projection).toHaveLength(13);

    const invalid = physicalMetadata();
    invalid.columns.push(column(IAD_HOP_SOURCE_TABLE, "codpac", 14, {
      tipo: "int", dataType: "int", nulo: "NO", charset: null, collation: null,
    }));
    expect(() => buildIadPhysicalContract(invalid)).toThrow(/codpac/);
  });

  it.each([
    ["trigger", (metadata: BuildIadPhysicalContractArgs) => { metadata.triggerCount = 1; }],
    ["engine", (metadata: BuildIadPhysicalContractArgs) => { metadata.engines[0]!.engine = "MyISAM"; }],
    ["tipo HUP", (metadata: BuildIadPhysicalContractArgs) => { metadata.hupColumns[0]!.tipo = "bigint"; }],
    ["data destino", (metadata: BuildIadPhysicalContractArgs) => {
      const item = metadata.columns.find((value) => value.coluna === "data_saida")!;
      item.tipo = "date"; item.dataType = "date";
    }],
    ["índice único", (metadata: BuildIadPhysicalContractArgs) => { metadata.indexes[0]!.nonUnique = 1; }],
    ["leading unidade", (metadata: BuildIadPhysicalContractArgs) => {
      metadata.indexes = metadata.indexes.filter((value) => value.tabela !== IAD_HOP_INTEGRATOR_TABLE);
    }],
    ["primary cadastro", (metadata: BuildIadPhysicalContractArgs) => { metadata.indexes[5]!.indice = "idx_id"; }],
  ])("rejeita %s divergente", (_label, mutate) => {
    const metadata = physicalMetadata();
    mutate(metadata);
    expect(() => buildIadPhysicalContract(metadata)).toThrow(/IAD safety validation failed/);
  });
});

describe("IAD HOP private JSON", () => {
  it("grava atomically JSON 0600, lê de volta e nunca sobrescreve", () => {
    const root = privateDirectory("json");
    const target = path.join(root, "manifest.json");
    expect(writePrivateJsonExclusive(root, target, { kind: "synthetic", amount: 2 })).toBe(target);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    expect(readPrivateJson<{ kind: string; amount: number }>(root, target)).toEqual({ kind: "synthetic", amount: 2 });
    expect(() => writePrivateJsonExclusive(root, target, { ignored: true })).toThrow(/exclusiva/);
  });

  it("rejeita root com permissões inseguras, escape, link e arquivo com permissões inseguras", () => {
    const root = privateDirectory("guards");
    fs.chmodSync(root, 0o755);
    expect(() => writePrivateJsonExclusive(root, "a.json", {})).toThrow(/0700/);
    fs.chmodSync(root, 0o700);
    expect(() => writePrivateJsonExclusive(root, "../outside.json", {})).toThrow(/escapa/);

    const outside = privateDirectory("outside");
    const link = path.join(root, "link.json");
    fs.symlinkSync(path.join(outside, "value.json"), link);
    expect(() => readPrivateJson(root, link)).toThrow(/link/);

    const unsafe = path.join(root, "unsafe.json");
    fs.writeFileSync(unsafe, "{}\n", { mode: 0o644 });
    fs.chmodSync(unsafe, 0o644);
    expect(() => readPrivateJson(root, unsafe)).toThrow(/0600/);
  });
});

describe("IAD HOP encrypted backup", () => {
  it("grava ciphertext e chave em roots distintos, ambos 0600, e permite round-trip AES-256-GCM", () => {
    const cipherRoot = privateDirectory("cipher");
    const keyRoot = privateDirectory("keys");
    const payload = { kind: "synthetic-backup", rows: [1, 2, 3] };
    const result = writeEncryptedBackupVerified(cipherRoot, keyRoot, payload);
    expect(result.ciphertextPath).toMatch(new RegExp(`^${cipherRoot}`));
    expect(result.keyPath).toMatch(new RegExp(`^${keyRoot}`));
    expect(fs.statSync(result.ciphertextPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(result.keyPath).mode & 0o777).toBe(0o600);

    const envelope = readPrivateJson<{ iv: string; tag: string; ciphertext: string }>(cipherRoot, result.ciphertextPath);
    const decipher = createDecipheriv("aes-256-gcm", fs.readFileSync(result.keyPath), Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const decoded = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    expect(JSON.parse(decoded.toString("utf8"))).toEqual(payload);
  });

  it("rejeita roots iguais ou aninhados", () => {
    const root = privateDirectory("same-root");
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested, { mode: 0o700 });
    fs.chmodSync(nested, 0o700);
    expect(() => writeEncryptedBackupVerified(root, root, { synthetic: true })).toThrow(/distintos/);
    expect(() => writeEncryptedBackupVerified(root, nested, { synthetic: true })).toThrow(/distintos/);
  });
});
