import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  promises as fs,
  readdirSync,
  readlinkSync,
  readFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline, finished } from "node:stream/promises";
import { getEventListeners } from "node:events";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { transformSync } from "esbuild";
import type { Entry } from "yauzl";
import type { WarleineCsvZipOptions } from "./warleineCsvZipReader";

// Test-only exports from the exact source in memory: no production export/hook,
// database imports, repository fixture files or network access.
const sourcePath = join(import.meta.dirname, "warleineCsvZipReader.ts");
const compiled = transformSync(
  readFileSync(sourcePath, "utf8") +
    "\nexport { ZipLzmaDecompressor, ReadBudget };\n",
  { loader: "ts", format: "cjs", target: "node22" }
).code;
const isolated = { exports: {} as any };
new Function("require", "module", "exports", compiled)(
  createRequire(sourcePath),
  isolated,
  isolated.exports
);
const { ZipLzmaDecompressor, ReadBudget, iterateWarleineCsvZipRows } =
  isolated.exports;

type Fixture = {
  name: string;
  entry: Entry;
  sha: string;
  rows: number;
};
let root: string;
let fixtures: Fixture[];
const decoders: any[] = [];
const budgets: any[] = [];
const metrics: Record<string, unknown>[] = [];

// Genuine Python ZIP_LZMA and liblzma markerless LZMA1EXT, not a mock decoder.
const generator = String.raw`
import ctypes as C, hashlib, io, json, lzma, pathlib, random, struct, sys, zipfile, zlib
root=pathlib.Path(sys.argv[1]); results=[]
header=[f'SYNTHETIC_HEADER_{i:02}' for i in range(48)]
row=[f'SYNTHETIC_{i:02}' for i in range(48)]
row[18]='"SERVIÇO; ""FICTÍCIO"""'; row[39]='"FICTÍCIO\nSEGUNDA LINHA"'
small=(';'.join(header)+'\r\n'+';'.join(row)+'\r\n').encode()
class Options(C.Structure):
    _fields_=[('dict_size',C.c_uint32),('preset_dict',C.c_void_p),('preset_dict_size',C.c_uint32),('lc',C.c_uint32),('lp',C.c_uint32),('pb',C.c_uint32),('mode',C.c_int),('nice_len',C.c_uint32),('mf',C.c_int),('depth',C.c_uint32),('ext_flags',C.c_uint32),('ext_size_low',C.c_uint32),('ext_size_high',C.c_uint32)]+[(f'reserved_int{i}',C.c_uint32) for i in range(4,9)]+[(f'reserved_enum{i}',C.c_int) for i in range(1,5)]+[(f'reserved_ptr{i}',C.c_void_p) for i in range(1,3)]
class Filter(C.Structure): _fields_=[('id',C.c_uint64),('options',C.c_void_p)]
lib=C.CDLL('liblzma.so.5'); lib.lzma_lzma_preset.argtypes=[C.POINTER(Options),C.c_uint32]
lib.lzma_raw_buffer_encode.argtypes=[C.POINTER(Filter),C.c_void_p,C.c_void_p,C.c_size_t,C.c_void_p,C.POINTER(C.c_size_t),C.c_size_t]
lib.lzma_raw_buffer_decode.argtypes=[C.POINTER(Filter),C.c_void_p,C.c_void_p,C.POINTER(C.c_size_t),C.c_size_t,C.c_void_p,C.POINTER(C.c_size_t),C.c_size_t]
def markerless(data):
    o=Options(); assert lib.lzma_lzma_preset(C.byref(o),6)==0
    o.ext_flags=0; o.ext_size_low=len(data); o.ext_size_high=0
    filters=(Filter*2)(Filter(0x4000000000000002,C.addressof(o)),Filter(0xffffffffffffffff,None))
    out=C.create_string_buffer(len(data)+4096); pos=C.c_size_t()
    assert lib.lzma_raw_buffer_encode(filters,None,data,len(data),out,C.byref(pos),len(out))==0
    raw=out.raw[:pos.value]; decoded=C.create_string_buffer(len(data)+1); ip=C.c_size_t(); op=C.c_size_t()
    assert lib.lzma_raw_buffer_decode(filters,None,raw,C.byref(ip),len(raw),decoded,C.byref(op),len(decoded))==0
    assert decoded.raw[:op.value]==data and ip.value==len(raw)
    return struct.pack('<BBHBI',9,4,5,93,o.dict_size)+raw
def raw(data,dict_size=4096):
    return struct.pack('<BBHBI',9,4,5,93,dict_size)+lzma.compress(data,format=lzma.FORMAT_RAW,filters=[dict(id=lzma.FILTER_LZMA1,dict_size=dict_size)])
def add(name,data,p=None,flags=2,crc=None,size=None,genuine=False,rows=2):
    p=raw(data) if p is None else p; crc=zlib.crc32(data) if crc is None else crc; size=len(data) if size is None else size
    n=b'synthetic.csv'; f=flags|0x800
    local=struct.pack('<IHHHHHIIIHH',0x04034b50,63,f,14,0,0,crc,len(p),size,len(n),0)+n+p
    central=struct.pack('<IHHHHHHIIIHHHHHII',0x02014b50,0x33f,63,f,14,0,0,crc,len(p),size,len(n),0,0,0,0,0x81a40000,0)+n
    archive=local+central+struct.pack('<IHHHHIIH',0x06054b50,0,0,1,1,len(central),len(local),0)
    if genuine:
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_LZMA) as z: z.writestr('synthetic.csv',data)
        archive=b.getvalue(); z=zipfile.ZipFile(io.BytesIO(archive)); e=z.infolist()[0]
        start=30+len(e.filename.encode())+len(e.extra); p=archive[start:start+e.compress_size]
    (root/(name+'.zip')).write_bytes(archive); (root/(name+'.raw')).write_bytes(p)
    results.append(dict(name=name,sha=hashlib.sha256(data).hexdigest(),rows=rows,entry=dict(compressionMethod=14,generalPurposeBitFlag=flags,compressedSize=len(p),uncompressedSize=size,crc32=crc)))
add('python_zipfile',small,genuine=True)
repeat=(';'.join(['SYNTHETIC']+['']*46+['S'*4000])+'\r\n').encode()*2000
add('expansion',repeat,raw(repeat,1<<23),rows=2000)
add('wrap',repeat,rows=2000)
r=random.Random(482924); randomdata=(';'.join(header)+'\r\n').encode()+b''.join((';'.join(''.join(r.choices('abcdef0123456789',k=40)) for _ in range(48))+'\r\n').encode() for _ in range(80))
add('random',randomdata,rows=81)
p=raw(small)
for cut in range(1,13): add('truncated_'+str(cut),small,p[:-cut])
add('markerless',small,markerless(small),flags=0)
add('missing_required',small,markerless(small),flags=2)
add('trailing',small,p+b'X')
add('bad_crc',small,p,crc=0x12345678)
add('size_small',small,p,size=len(small)-1)
add('size_large',small,p,size=len(small)+1)
add('markerless_trailing',small,markerless(small)+b'X',flags=0)
print(json.dumps(results))
`;

beforeAll(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "warleine-lzma-synthetic-"));
  fixtures = JSON.parse(
    execFileSync("python3", ["-c", generator, root], { encoding: "utf8" })
  );
});
afterAll(async () => {
  for (const decoder of decoders) decoder.destroy();
  for (const budget of budgets) budget.finish();
  await fs.rm(root, { recursive: true, force: true });
  console.log("LZMA_SYNTHETIC_METRICS " + JSON.stringify(metrics));
});
function fixture(name: string) {
  return fixtures.find(value => value.name === name)!;
}
function decoderFor(name: string, options: WarleineCsvZipOptions = {}) {
  const budget = new ReadBudget(options);
  const decoder = new ZipLzmaDecompressor(fixture(name).entry, budget);
  budgets.push(budget);
  decoders.push(decoder);
  return { decoder, budget };
}
function ownedFds() {
  return readdirSync("/proc/self/fd").filter(fd => {
    try {
      return readlinkSync(`/proc/self/fd/${fd}`).startsWith(root);
    } catch {
      return false;
    }
  });
}
function assertClean(decoder: any, budget: any) {
  expect(decoder.destroyed).toBe(true);
  expect(decoder.scheduled).toBeUndefined();
  expect(decoder.pendingCallback).toBeUndefined();
  expect(
    decoder.buf.length + decoder.probs.length + decoder.outWindow.length
  ).toBe(0);
  expect(decoder.readableLength).toBe(0);
  expect(decoder.listenerCount("data")).toBe(0);
  expect(getEventListeners(budget.controller.signal, "abort")).toHaveLength(0);
}
async function waitUntil(test: () => boolean) {
  const end = performance.now() + 1500;
  while (!test()) {
    if (performance.now() > end) throw new Error("SYNTHETIC_WAIT_TIMEOUT");
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}
async function collect(name: string) {
  let rows = 0;
  for await (const row of iterateWarleineCsvZipRows(
    join(root, name + ".zip"),
    name + ".zip"
  )) {
    expect(row).toHaveLength(48);
    rows++;
  }
  return rows;
}
async function decode(name: string, chunkSize: number, slow = false) {
  const { decoder, budget } = decoderFor(name);
  const raw = await fs.readFile(join(root, name + ".raw"));
  const chunks: Buffer[] = [];
  for (let i = 0; i < raw.length; i += chunkSize)
    chunks.push(raw.subarray(i, i + chunkSize));
  const hash = createHash("sha256");
  let bytes = 0;
  let maxQueued = 0;
  let falsePushes = 0;
  const push = decoder.push;
  decoder.push = function (chunk: Buffer | null, ...rest: any[]) {
    const result = push.call(this, chunk, ...rest);
    maxQueued = Math.max(maxQueued, this.readableLength);
    if (chunk && !result) falsePushes++;
    return result;
  };
  try {
    await pipeline(
      Readable.from(chunks),
      decoder,
      new Writable({
        highWaterMark: 1024,
        write(chunk, _encoding, callback) {
          bytes += chunk.length;
          hash.update(chunk);
          if (slow) setTimeout(callback, 3);
          else callback();
        },
      })
    );
    expect(hash.digest("hex")).toBe(fixture(name).sha);
    expect(bytes).toBe(fixture(name).entry.uncompressedSize);
    expect(maxQueued).toBeLessThanOrEqual(16 * 1024);
    if (slow) expect(falsePushes).toBeGreaterThan(10);
    metrics.push({ name, chunkSize, slow, bytes, maxQueued, falsePushes });
    assertClean(decoder, budget);
  } finally {
    budget.finish();
  }
}

describe("ZIP LZMA método 14: backpressure, slices, EOS e cleanup", () => {
  it("exige ambiente fictício e guard de rede", () => {
    expect(process.env.DATABASE_URL).toBe("");
    expect(process.env.VITE_APP_ID).toBe("synthetic-validation-app");
    expect(process.env.JWT_SECRET).toBe(
      "synthetic-test-only-not-production-issue177-validation"
    );
    expect(process.env.NODE_OPTIONS).toBe(
      "--require=/home/ubuntu/reports/issue168/network-guard.cjs"
    );
  });
  it.each([1, 7, 63, 64, 1024, 16384])(
    "preserva bytes e range state com chunks %i",
    async size => {
      await decode("random", size);
    },
    15000
  );
  it.each(["expansion", "wrap"])(
    "limita fila com consumidor lento e matches/overlap: %s",
    async name => {
      await decode(name, 16384, true);
    },
    15000
  );
  it("push(false) pausa no meio do match e retoma após wrap sem perder bytes", async () => {
    const { decoder, budget } = decoderFor("wrap");
    const raw = await fs.readFile(join(root, "wrap.raw"));
    decoder.end(raw);
    await waitUntil(() => decoder.pausedOutput);
    const before = decoder.totalOut;
    expect(decoder.pendingMatch).toBeGreaterThan(0);
    expect(decoder.readableLength).toBeLessThanOrEqual(16384);
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(decoder.totalOut).toBe(before);
    expect(decoder.scheduled).toBeUndefined();
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of decoder) {
      bytes += chunk.length;
      hash.update(chunk);
    }
    expect(hash.digest("hex")).toBe(fixture("wrap").sha);
    expect(bytes).toBe(fixture("wrap").entry.uncompressedSize);
    assertClean(decoder, budget);
    budget.finish();
    metrics.push({ name: "explicit-pause-resume", before, bytes });
  });
  it.each(["signal", "deadline"])(
    "timer %s interrompe durante decode ativo",
    async mode => {
      const controller = new AbortController();
      const { decoder, budget } = decoderFor(
        "expansion",
        mode === "signal"
          ? { signal: controller.signal }
          : { deadlineAtMs: Date.now() + 35 }
      );
      const raw = await fs.readFile(join(root, "expansion.raw"));
      const processAvailable = decoder.processAvailable;
      let maxSliceBytes = 0;
      let slices = 0;
      decoder.processAvailable = function (...args: any[]) {
        const before = this.totalOut;
        try {
          return processAvailable.apply(this, args);
        } finally {
          maxSliceBytes = Math.max(maxSliceBytes, this.totalOut - before);
          slices++;
        }
      };
      let fired = false;
      let firedAt = 0;
      let output = 0;
      const start = performance.now();
      const timer = setTimeout(() => {
        fired = true;
        firedAt = performance.now() - start;
        controller.abort();
      }, 10);
      const sink = new Writable({
        write(chunk, _encoding, callback) {
          output += chunk.length;
          callback();
        },
      });
      try {
        await expect(
          pipeline(Readable.from([raw]), decoder, sink)
        ).rejects.toThrow(
          mode === "signal" ? /LEITURA_CANCELADA/ : /TEMPO_ESGOTADO/
        );
        expect(fired).toBe(true);
        expect(firedAt).toBeLessThan(250);
        expect(decoder.totalOut).toBeLessThan(
          fixture("expansion").entry.uncompressedSize
        );
        expect(output).toBeLessThan(
          fixture("expansion").entry.uncompressedSize
        );
        assertClean(decoder, budget);
        expect(maxSliceBytes).toBeLessThanOrEqual(8192);
        expect(slices).toBeGreaterThan(1);
        metrics.push({
          name: "active-" + mode,
          firedAt,
          elapsedMs: performance.now() - start,
          output,
          totalOut: decoder.totalOut,
          maxSliceBytes,
          slices,
        });
      } finally {
        clearTimeout(timer);
        budget.finish();
      }
    }
  );
  it.each(["signal", "deadline"])(
    "timer %s interrompe inclusive pausado sem consumidor",
    async mode => {
      const controller = new AbortController();
      const { decoder, budget } = decoderFor(
        "wrap",
        mode === "signal"
          ? { signal: controller.signal }
          : { deadlineAtMs: Date.now() + 100 }
      );
      const completion = finished(decoder, { cleanup: true }).catch(
        error => error
      );
      let callbacks = 0;
      const start = performance.now();
      decoder.end(await fs.readFile(join(root, "wrap.raw")), () => {
        callbacks++;
      });
      await waitUntil(() => decoder.pausedOutput);
      const before = decoder.totalOut;
      const timer = setTimeout(() => controller.abort(), 15);
      try {
        const error = await completion;
        expect(error.message).toMatch(
          mode === "signal" ? /LEITURA_CANCELADA/ : /TEMPO_ESGOTADO/
        );
        expect(decoder.totalOut).toBe(before);
        expect(callbacks).toBe(1);
        expect(performance.now() - start).toBeLessThan(300);
        assertClean(decoder, budget);
        metrics.push({
          name: "paused-" + mode,
          totalOut: before,
          elapsedMs: performance.now() - start,
          callbacks,
        });
      } finally {
        clearTimeout(timer);
        budget.finish();
      }
    }
  );
  it.each(["scheduled", "paused", "flush"])(
    "destroy limpa callbacks e agendamento uma vez: %s",
    async mode => {
      const name = mode === "flush" ? "python_zipfile" : "wrap";
      const { decoder, budget } = decoderFor(name);
      const errors: Error[] = [];
      decoder.on("error", (error: Error) => errors.push(error));
      let writeCallbacks = 0;
      let flushCallbacks = 0;
      const raw = await fs.readFile(join(root, name + ".raw"));
      const destroyError = new Error("SYNTHETIC_DESTROY");
      const completion = finished(decoder, { cleanup: true }).catch(
        error => error
      );
      if (mode === "flush") {
        const flush = decoder._flush;
        decoder._flush = function (callback: (error?: Error | null) => void) {
          flush.call(this, (error: Error | null) => {
            flushCallbacks++;
            callback(error);
          });
          setImmediate(() => this.destroy(destroyError));
        };
        decoder.end(raw, () => {
          writeCallbacks++;
        });
      } else {
        decoder.write(raw, () => {
          writeCallbacks++;
        });
        if (mode === "paused") await waitUntil(() => decoder.pausedOutput);
        decoder.destroy(destroyError);
        decoder.destroy(destroyError);
      }
      expect((await completion).message).toBe("SYNTHETIC_DESTROY");
      await new Promise(resolve => setImmediate(resolve));
      expect(writeCallbacks).toBe(1);
      expect(flushCallbacks).toBe(mode === "flush" ? 1 : 0);
      expect(errors).toHaveLength(1);
      assertClean(decoder, budget);
      budget.finish();
    }
  );
  it("destroy síncrono no push interrompe slice e não deixa corrida/callback duplo", async () => {
    const { decoder, budget } = decoderFor("expansion");
    const raw = await fs.readFile(join(root, "expansion.raw"));
    const completion = finished(decoder, { cleanup: true }).catch(
      error => error
    );
    let callbacks = 0;
    let deliveries = 0;
    decoder.on("data", () => {
      deliveries++;
      decoder.destroy(new Error("SYNTHETIC_SYNC_DESTROY"));
    });
    decoder.write(raw, () => {
      callbacks++;
    });
    expect((await completion).message).toBe("SYNTHETIC_SYNC_DESTROY");
    expect(callbacks).toBe(1);
    expect(deliveries).toBe(1);
    expect(decoder.totalOut).toBe(16384);
    assertClean(decoder, budget);
    budget.finish();
  });
  it.each(["python_zipfile", "markerless"])(
    "aceita variante genuína e tamanho/CRC exatos: %s",
    async name => {
      expect(await collect(name)).toBe(fixture(name).rows);
      await decode(name, 7);
      expect(ownedFds()).toEqual([]);
    }
  );
  it.each([
    "missing_required",
    ...Array.from({ length: 12 }, (_, i) => "truncated_" + (i + 1)),
  ])("rejeita EOS obrigatório ausente/truncado: %s", async name => {
    await expect(collect(name)).rejects.toThrow(/Warleine rejeitado/);
    expect(ownedFds()).toEqual([]);
  });
  it.each([
    "trailing",
    "bad_crc",
    "size_small",
    "size_large",
    "markerless_trailing",
  ])("preserva rejeição CRC/tamanho/input completo: %s", async name => {
    await expect(collect(name)).rejects.toThrow(/Warleine rejeitado/);
    expect(ownedFds()).toEqual([]);
  });
  it("return do iterator LZMA fecha descritores, listeners e scheduler sem open handles", async () => {
    let owned: any;
    const original = ZipLzmaDecompressor.prototype._transform;
    const spy = vi
      .spyOn(ZipLzmaDecompressor.prototype, "_transform")
      .mockImplementation(function (this: Transform, ...args: any[]) {
        owned = this;
        return original.apply(this, args);
      });
    try {
      const iterator = iterateWarleineCsvZipRows(
        join(root, "wrap.zip"),
        "wrap.zip"
      );
      expect((await iterator.next()).done).toBe(false);
      await iterator.return();
      expect(owned).toBeDefined();
      assertClean(owned, owned.budget);
      expect(ownedFds()).toEqual([]);
      // Resources owned by the decoder are directly inspected, not hidden by a
      // process-wide handle snapshot that excludes timers in modern Node.
      expect(owned.budget.cleanup.size).toBe(0);
      expect(owned.budget.timer._destroyed).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
