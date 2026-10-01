import { DBFFile } from "dbffile";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type UnimedDbfRow = {
  codigo: string;
  nome: string;
  valor: string | number;
  valorPorteAnestesico?: string | number | null;
  porte?: string | number | null;
  numeroAuxiliares?: number | null;
};

export const UNIMED_DBF_FIELDS = [
  { name: "CODTBPPROP", type: "C" as const, size: 2 },
  { name: "CODTBPPADR", type: "C" as const, size: 2 },
  { name: "CODSPPROP", type: "C" as const, size: 10 },
  { name: "CODSPPADR", type: "C" as const, size: 10 },
  { name: "DESCRSP", type: "C" as const, size: 65 },
  { name: "VALORHOSP", type: "N" as const, size: 15, decimalPlaces: 4 },
  { name: "VALORPROF", type: "N" as const, size: 15, decimalPlaces: 4 },
  { name: "VALORANE", type: "N" as const, size: 15, decimalPlaces: 4 },
  { name: "VALORSADT", type: "N" as const, size: 15, decimalPlaces: 4 },
  { name: "CODMOEDVAL", type: "C" as const, size: 2 },
  { name: "CODMOEDASH", type: "C" as const, size: 2 },
  { name: "CODMOEDANE", type: "C" as const, size: 2 },
  { name: "CODMOEDASD", type: "C" as const, size: 2 },
  { name: "PTOPORANE", type: "N" as const, size: 5, decimalPlaces: 0 },
  { name: "NUMAUX", type: "N" as const, size: 1, decimalPlaces: 0 },
  { name: "FILMEM2", type: "N" as const, size: 7, decimalPlaces: 4 },
];

function numeric(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericPorte(value: string | number | null | undefined): number {
  const text = String(value ?? "").trim();
  const parsed = Number(text.match(/\d+/)?.[0] ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncate(value: unknown, length: number): string {
  return String(value ?? "").normalize("NFC").slice(0, length);
}

export function mapUnimedDbfRow(row: UnimedDbfRow) {
  return {
    CODTBPPROP: "00",
    CODTBPPADR: "00",
    CODSPPROP: truncate(row.codigo, 10),
    CODSPPADR: truncate(row.codigo, 10),
    DESCRSP: truncate(row.nome, 65),
    VALORHOSP: 0,
    VALORPROF: numeric(row.valor),
    VALORANE: numeric(row.valorPorteAnestesico),
    VALORSADT: 0,
    CODMOEDVAL: "R$",
    CODMOEDASH: "R$",
    CODMOEDANE: "R$",
    CODMOEDASD: "R$",
    PTOPORANE: numericPorte(row.porte),
    NUMAUX: Math.max(0, Math.min(9, Math.trunc(numeric(row.numeroAuxiliares)))),
    FILMEM2: 0,
  };
}

/** Gera um DBF dBase III compatível com o layout UnimedRedePadrao.DBF. */
export async function gerarUnimedDbf(rows: UnimedDbfRow[]): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "unimed-dbf-"));
  const path = join(directory, "UnimedRedePadrao.DBF");
  try {
    const dbf = await DBFFile.create(path, UNIMED_DBF_FIELDS, {
      encoding: "latin1",
    });
    await dbf.appendRecords(rows.map(mapUnimedDbfRow));
    const fs = await import("node:fs/promises");
    return await fs.readFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
