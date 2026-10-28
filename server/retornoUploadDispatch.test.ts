import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  delegarPlanilhaRetorno,
  deveLimparExcelRetorno,
} from "./retornoUploadDispatch";

const input = {
  arquivoId: 71,
  secret: "segredo-ficticio",
  tipoArquivo: "excel" as const,
  reimportacao: false,
};
function deps(disparar = vi.fn(async (_payload: unknown) => ({ ok: true }))) {
  return {
    marcarProcessando: vi.fn(async () => {}),
    atualizarProgresso: vi.fn(async () => {}),
    disparar,
    marcarErro: vi.fn(async () => {}),
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe("delegação de planilhas de retorno", () => {
  it("retorna mesmo enquanto o worker ainda não respondeu, sem marcar conclusão", async () => {
    let finalizar!: (v: { ok: boolean }) => void;
    const disparar = vi.fn(
      (_payload: unknown) =>
        new Promise<{ ok: boolean }>(resolve => {
          finalizar = resolve;
        })
    );
    const d = deps(disparar);
    await delegarPlanilhaRetorno(input, d);
    expect(d.marcarProcessando).toHaveBeenCalledOnce();
    expect(d.atualizarProgresso).toHaveBeenCalledOnce();
    expect(d.marcarErro).not.toHaveBeenCalled();
    expect(disparar).toHaveBeenCalledWith({
      arquivoId: 71,
      secret: "segredo-ficticio",
      limparDadosAnteriores: false,
    });
    finalizar({ ok: true });
    await flush();
    expect(d.marcarErro).not.toHaveBeenCalled();
  });
  it("limpa na reimportação de Excel", async () => {
    const d = deps();
    await delegarPlanilhaRetorno({ ...input, reimportacao: true }, d);
    expect(d.disparar).toHaveBeenCalledWith(
      expect.objectContaining({ limparDadosAnteriores: true })
    );
  });
  it("mantém a limpeza do CSV novo", async () => {
    const d = deps();
    await delegarPlanilhaRetorno({ ...input, tipoArquivo: "csv" }, d);
    expect(d.disparar).toHaveBeenCalledWith(
      expect.objectContaining({ limparDadosAnteriores: true })
    );
  });
  it("marca erro se o worker responder HTTP não OK", async () => {
    const d = deps(vi.fn(async (_payload: unknown) => ({ ok: false })));
    await delegarPlanilhaRetorno(input, d);
    await flush();
    expect(d.marcarErro).toHaveBeenCalledOnce();
  });
  it("marca erro quando a chamada HTTP rejeita", async () => {
    const d = deps(
      vi.fn(async (_payload: unknown) => {
        throw new Error("falha sintetica");
      })
    );
    await delegarPlanilhaRetorno(input, d);
    await flush();
    expect(d.marcarErro).toHaveBeenCalledOnce();
  });
  it("contém falha do registro de erro sem vazar o segredo no log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const d = deps(
        vi.fn(async (_payload: unknown) => ({ ok: false, status: 503 }))
      );
      d.marcarErro.mockRejectedValue(new Error("detalhe privado"));
      await delegarPlanilhaRetorno(input, d);
      await flush();
      expect(d.marcarErro).toHaveBeenCalled();
      const logs = JSON.stringify(warn.mock.calls);
      expect(logs).toContain("503");
      expect(logs).not.toContain(input.secret);
      expect(logs).not.toContain("detalhe privado");
    } finally {
      warn.mockRestore();
    }
  });
  it("não dispara sem conseguir registrar processando", async () => {
    const d = deps();
    d.marcarProcessando.mockRejectedValueOnce(new Error("falha sintetica"));
    await expect(delegarPlanilhaRetorno(input, d)).rejects.toThrow(
      "falha sintetica"
    );
    expect(d.disparar).not.toHaveBeenCalled();
  });
  it.each([undefined, null, true, "false", 0, {}])(
    "preserva a limpeza quando o sinal não é o booleano false (%s)",
    sinal => {
    expect(deveLimparExcelRetorno(sinal)).toBe(true);
    }
  );
  it("somente false dispensa a limpeza do novo Excel", () => {
    expect(deveLimparExcelRetorno(false)).toBe(false);
  });
  it("o caminho real tRPC delega ao worker antes de qualquer processamento inline", async () => {
    const source = readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );
    const upload = source.slice(
      source.indexOf("upload: protectedProcedure"),
      source.indexOf("procedimentos: protectedProcedure")
    );
    expect(upload).toContain("/api/internal/process-file");
    expect(upload).not.toContain("deleteRecebimentosExcelByArquivo");
    expect(upload).not.toContain("parseUnimedCerradoTxt");
  });
  it("o multipart usa a mesma delegação inclusive para TXT, sem limpeza no despacho", () => {
    const source = readFileSync(
      new URL("./uploadMultipart.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("await delegarPlanilhaRetorno");
    expect(source).toContain('tipoArquivo === "txt"');
    expect(source).not.toContain("deleteRecebimentosExcelByArquivo");
  });
});
