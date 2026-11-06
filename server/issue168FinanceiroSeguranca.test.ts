import { describe, expect, it, vi } from "vitest";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
vi.mock("node:fs/promises", () => ({ open: vi.fn() }));
import { carregarNotaFiscalBase64, cifrarNotaFiscal, decifrarNotaFiscal, decodificarPdfNF, lerNFLocalLegada, lerRespostaNF, NF_MAX_BASE64, NF_MAX_BYTES, salvarNotaFiscalDuravel, type NotaFiscalIO } from "./financeiroNotaFiscal";
import { codigoBoletoConfirmado, emitirBoletoReservado, fingerprintBoleto, prepararClaimBoleto, referenciaBoleto, seuNumeroTentativa, type BoletoRepository } from "./financeiroBoleto";

const env = { BANCO_INTER_ENCRYPTION_KEY: "ab".repeat(32) };
const scope = { estabelecimentoId: 9, empresaId: 3, recebivelId: 42 };
const pdf = Buffer.from("%PDF-1.4\nSYNTHETIC ONLY\n%%EOF\n");
function memoryIO(): NotaFiscalIO & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: vi.fn(async (reference, buffer) => { objects.set(reference, Buffer.from(buffer)); return { key: reference }; }),
    get: vi.fn(async reference => ({ url: `https://synthetic.invalid/${reference}` })),
    fetch: vi.fn(async (url: any) => new Response(objects.get(String(url).replace("https://synthetic.invalid/", ""))!, { headers: { "content-type": "application/octet-stream" } })) as typeof fetch,
    readLocal: vi.fn(async () => { throw Error("ENOENT"); }),
  };
}
function repository(failClaim = false, failComplete = false) {
  let persisted: string | null = null;
  const events: string[] = [];
  const repo: BoletoRepository = {
    claim: async hash => {
      const claim = prepararClaimBoleto(persisted, hash);
      if (failClaim) throw Error("rollback");
      if (!claim.replay) persisted = claim.reserved;
      events.push("claim-commit");
      return claim;
    },
    complete: async (reserved, created) => { if (failComplete) throw Error("rollback"); if (persisted !== reserved) throw Error("CAS"); persisted = created; events.push("protocol-commit"); },
    uncertain: async (reserved, uncertain) => { if (persisted === reserved) persisted = uncertain; },
  };
  return { repo, events, reference: () => persisted };
}
describe("issue168 NF: cifra e fronteira de bytes sem filesystem/rede reais", () => {
  it("UUID/revisão não colide em mesmo instante e ciphertext não contém PDF", async () => {
    const io = memoryIO();
    const [a, b] = await Promise.all([salvarNotaFiscalDuravel(scope, pdf, io, env), salvarNotaFiscalDuravel(scope, Buffer.from("%PDF-1.7\nSECOND\n%%EOF"), io, env)]);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(255);
    expect(a).toMatch(/fin-nf\/v1\/h9\/e3\/r42\/.*\.enc$/);
    expect(io.objects.get(a)!.includes(Buffer.from("%PDF"))).toBe(false);
    expect(await carregarNotaFiscalBase64(scope, a, io, env)).toBe(pdf.toString("base64"));
    expect(await carregarNotaFiscalBase64(scope, a, io, env)).toBe(pdf.toString("base64"));
    expect(io.readLocal).not.toHaveBeenCalled();
  });
  it("scope empresa/hospital/recebível rejeitado ANTES do storage", async () => {
    const io = memoryIO();
    const ref = await salvarNotaFiscalDuravel(scope, pdf, io, env);
    for (const bad of [{ ...scope, estabelecimentoId: 10 }, { ...scope, empresaId: 4 }, { ...scope, recebivelId: 43 }]) {
      await expect(carregarNotaFiscalBase64(bad, ref, io, env)).rejects.toThrow();
    }
    expect(io.get).not.toHaveBeenCalled();
  });
  it("AAD impede troca de UUID/digest/ciphertext e chave derivada errada", () => {
    const { reference, envelope } = cifrarNotaFiscal(scope, pdf, env);
    const other = cifrarNotaFiscal(scope, pdf, env);
    expect(() => decifrarNotaFiscal(scope, reference, other.envelope, env)).toThrow();
    expect(() => decifrarNotaFiscal(scope, reference.replace(/\/([a-f0-9]{64})\.enc$/, `/${"0".repeat(64)}.enc`), envelope, env)).toThrow();
    const altered = Buffer.from(envelope); altered[altered.length - 1] ^= 1;
    expect(() => decifrarNotaFiscal(scope, reference, altered, env)).toThrow();
    expect(() => decifrarNotaFiscal(scope, reference, envelope, { BANCO_INTER_ENCRYPTION_KEY: "cd".repeat(32) })).toThrow();
  });
  it("chave ausente/fraca/predictable/JWT não grava e falha durável não usa local", async () => {
    const io = memoryIO();
    for (const config of [{}, { JWT_SECRET: "ab".repeat(32) }, { BANCO_INTER_ENCRYPTION_KEY: "password" }]) {
      await expect(salvarNotaFiscalDuravel(scope, pdf, io, config)).rejects.toThrow("Chave");
    }
    expect(io.put).not.toHaveBeenCalled();
    vi.mocked(io.put).mockRejectedValue(Error("https://SECRET.invalid/token"));
    await expect(salvarNotaFiscalDuravel(scope, pdf, io, env)).rejects.toThrow("Persistência durável");
    expect(io.readLocal).not.toHaveBeenCalled();
  });
  it("base64 estrito, MIME/header/EOF PDF e teto antes do decode", () => {
    expect(decodificarPdfNF(pdf.toString("base64"))).toEqual(pdf);
    for (const invalid of ["*JVBERg==", "JVBERg=", "JVBERh==", Buffer.from("<html/>\n%%EOF").toString("base64"), Buffer.from("%PDF-1.4\nmissing EOF").toString("base64"), "A".repeat(NF_MAX_BASE64 + 4)]) expect(() => decodificarPdfNF(invalid)).toThrow();
    expect(() => cifrarNotaFiscal(scope, Buffer.alloc(NF_MAX_BYTES + 1), env)).toThrow();
  });
  it("streaming bloqueia content-length/bytes acima do teto e cancela leitor", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); }, cancel() { cancelled = true; } }));
    await expect(lerRespostaNF(response, AbortSignal.timeout(1000), 10)).rejects.toThrow();
    expect(cancelled).toBe(true);
    await expect(lerRespostaNF(new Response("short", { headers: { "content-length": "9999" } }), AbortSignal.timeout(1000), 10)).rejects.toThrow();
  });
  it("mesmo orçamento cumulativo cobre proxy/fetch/corpo, abort cancela streaming", async () => {
    const io = memoryIO();
    const ref = await salvarNotaFiscalDuravel(scope, pdf, io, env);
    let proxySignal: AbortSignal | undefined;
    io.get = vi.fn(async (_key, signal) => { proxySignal = signal; return { url: "https://synthetic.invalid" }; });
    io.fetch = vi.fn(async (_url, opts) => { expect(opts?.signal).toBe(proxySignal); return new Response(io.objects.get(ref)!, { headers: { "content-type": "application/octet-stream" } }); }) as typeof fetch;
    await carregarNotaFiscalBase64(scope, ref, io, env);
    const controller = new AbortController();
    let cancelled = false;
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    const loading = lerRespostaNF(response, controller.signal, 10);
    controller.abort();
    await expect(loading).rejects.toThrow(); expect(cancelled).toBe(true);
  });
  it("legacy local usa referência EXATA; rec alheio/path não acessa IO e não tenta remoto", async () => {
    const io = memoryIO();
    vi.mocked(io.readLocal!).mockResolvedValue(pdf);
    expect(await carregarNotaFiscalBase64(scope, "nf_42_1700000000000.pdf", io, {})).toBe(pdf.toString("base64"));
    expect(io.readLocal).toHaveBeenCalledWith("nf_42_1700000000000.pdf", expect.any(AbortSignal));
    for (const ref of ["nf_43_1700000000000.pdf", "../nf_42_1700000000000.pdf", "other/nf_42_1700000000000.pdf", "https://synthetic.invalid/nf_42.pdf"]) await expect(carregarNotaFiscalBase64(scope, ref, io, env)).rejects.toThrow();
    expect(io.get).not.toHaveBeenCalled();
    vi.mocked(io.readLocal!).mockRejectedValue(Error("missing"));
    await expect(carregarNotaFiscalBase64(scope, "nf_42_1700000000000.pdf", io, {})).rejects.toThrow();
    expect(io.get).not.toHaveBeenCalled();
  });
  it("legacy durável plaintext só exato, MIME PDF, sem local/URL cliente", async () => {
    const io = memoryIO();
    io.fetch = vi.fn(async () => new Response(pdf, { headers: { "content-type": "application/pdf" } })) as typeof fetch;
    expect(await carregarNotaFiscalBase64(scope, "nfs/nf_42_1700000000000.pdf", io, {})).toBe(pdf.toString("base64"));
    expect(io.get).toHaveBeenCalledWith("nfs/nf_42_1700000000000.pdf", expect.any(AbortSignal));
    expect(io.readLocal).not.toHaveBeenCalled();
    io.fetch = vi.fn(async () => new Response(pdf, { headers: { "content-type": "text/html" } })) as typeof fetch;
    await expect(carregarNotaFiscalBase64(scope, "nfs/nf_42_1700000000000.pdf", io, {})).rejects.toThrow();
  });
  it("leitura local apenas O_NOFOLLOW/read, teto, fecha handle em erro; sem temp/write", async () => {
    const handle = { stat: vi.fn(async () => ({ isFile: () => true, size: NF_MAX_BYTES + 1 })), read: vi.fn(), close: vi.fn(async () => undefined) };
    vi.mocked(open).mockResolvedValue(handle as any);
    await expect(lerNFLocalLegada("nf_42_1700000000000.pdf", AbortSignal.timeout(1000))).rejects.toThrow();
    expect(open).toHaveBeenCalledWith(expect.stringContaining("uploads/nf_42_1700000000000.pdf"), constants.O_RDONLY | constants.O_NOFOLLOW);
    expect(handle.read).not.toHaveBeenCalled(); expect(handle.close).toHaveBeenCalledTimes(1);
    vi.mocked(open).mockRejectedValue(Error("ELOOP"));
    await expect(lerNFLocalLegada("nf_42_1700000000000.pdf", AbortSignal.timeout(1000))).rejects.toThrow("ELOOP");
  });
  it("proxy lento encerra no orçamento cumulativo e erro não inclui URL/chave", async () => {
    const io = memoryIO(); const ref = await salvarNotaFiscalDuravel(scope, pdf, io, env);
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    io.get = vi.fn(async (_key, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Error("SECRET URL")), { once: true })));
    try {
      const pending = carregarNotaFiscalBase64(scope, ref, io, env);
      controller.abort();
      await expect(pending).rejects.toThrow("NF indisponível");
      expect(io.fetch).not.toHaveBeenCalled();
    } finally { timeout.mockRestore(); }
  });
});
describe("issue168 boleto: reserva durável independente de memória/entrega", () => {
  const hash = fingerprintBoleto({ pagador: "SYNTHETIC", banco: 7 }, env);
  it("protocolo confirmado retorna replay, fingerprint mudou bloqueia", async () => {
    const db = repository();
    const emit = vi.fn(async () => { expect(db.events).toEqual(["claim-commit"]); return { configured: true, codigoSolicitacao: "PROTOCOL-SYNTH" }; });
    expect((await emitirBoletoReservado(db.repo, hash, emit)).status).toBe("created");
    expect(db.events).toEqual(["claim-commit", "protocol-commit"]);
    expect((await emitirBoletoReservado(db.repo, hash, emit)).status).toBe("replayed");
    expect(emit).toHaveBeenCalledTimes(1);
    await expect(emitirBoletoReservado(db.repo, fingerprintBoleto({ pagador: "CHANGED" }, env), emit)).rejects.toThrow("divergentes");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(codigoBoletoConfirmado(db.reference()!)).toBe("PROTOCOL-SYNTH");
  });
  it("rollback do claim nunca alcança rede", async () => {
    const db = repository(true); const emit = vi.fn();
    await expect(emitirBoletoReservado(db.repo, hash, emit)).rejects.toThrow("Reserva bancária não confirmada");
    expect(emit).not.toHaveBeenCalled(); expect(db.reference()).toBeNull();
  });
  it("timeout/rede incerta trava retry em outra instância e sanitiza erro", async () => {
    const db = repository(); const emit = vi.fn(async () => { throw Error("PHI/SECRET upstream"); });
    await expect(emitirBoletoReservado(db.repo, hash, emit)).rejects.toThrow("reconciliação");
    expect(db.reference()).toMatch(/^fin-b1:u:/);
    await expect(emitirBoletoReservado({ ...db.repo }, hash, emit)).rejects.toThrow("reconciliação");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(() => codigoBoletoConfirmado(db.reference()!)).toThrow();
  });
  it("falha pós-emissão/commit do protocolo conserva tentativa bloqueada", async () => {
    const db = repository(false, true); const emit = vi.fn(async () => ({ configured: true, codigoSolicitacao: "PROTOCOL-SYNTH" }));
    await expect(emitirBoletoReservado(db.repo, hash, emit)).rejects.toThrow("reconciliação");
    await expect(emitirBoletoReservado(db.repo, hash, emit)).rejects.toThrow("reconciliação"); expect(emit).toHaveBeenCalledTimes(1);
  });
  it("concurrent retry enquanto primeira rede aguarda emite UMA vez", async () => {
    const db = repository();
    let resolve!: (value: any) => void;
    const emit = vi.fn(() => new Promise<any>(done => { resolve = done; }));
    const first = emitirBoletoReservado(db.repo, hash, emit);
    await Promise.resolve();
    await expect(emitirBoletoReservado({ ...db.repo }, hash, emit)).rejects.toThrow("reconciliação");
    resolve({ configured: true, codigoSolicitacao: "PROTOCOL-SYNTH" }); await first;
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it("UUID sentinel cabe em campo 100; seuNumero é estável e<=15", () => {
    const claim = prepararClaimBoleto(null, hash); if (claim.replay) throw Error();
    expect(claim.attemptId).toMatch(/^[a-f0-9-]{36}$/); expect(claim.reserved.length).toBeLessThanOrEqual(100);
    expect(seuNumeroTentativa(claim.attemptId)).toHaveLength(15); expect(seuNumeroTentativa(claim.attemptId)).toBe(seuNumeroTentativa(claim.attemptId));
    expect(() => codigoBoletoConfirmado(claim.reserved)).toThrow();
    expect(() => codigoBoletoConfirmado(referenciaBoleto("uncertain", claim.attemptId, hash))).toThrow();
    expect(() => prepararClaimBoleto("LEGACY-SYNTH", hash)).toThrow("legado");
  });
});
