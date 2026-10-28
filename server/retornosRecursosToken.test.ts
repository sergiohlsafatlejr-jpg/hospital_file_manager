import { afterEach, describe, expect, it, vi } from "vitest";
import {
  retornosAssinarTokenPrevia,
  retornosVerificarTokenPrevia,
} from "./retornosRecursosService";

const escopo = { estabelecimentoId: 101, convenioId: 202 };
const hashes = {
  arquivoHash: "a".repeat(64),
  respostaHash: "b".repeat(64),
};
const agora = Date.parse("2026-10-28T16:00:00.000Z");
const mensagem = "A confirmação segura de importação precisa ser configurada pelo administrador.";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("confirmação segura dos retornos", () => {
  it("exige o segredo dedicado e não aceita somente o segredo da sessão", () => {
    vi.stubEnv("JWT_SECRET", "segredo-de-sessao-sintetico-".repeat(3));
    vi.stubEnv("RETORNOS_RECURSOS_CONFIRMATION_SECRET", "");

    expect(() => retornosAssinarTokenPrevia({ ...escopo, ...hashes }, agora)).toThrow(
      mensagem,
    );
  });

  it("rejeita segredo dedicado menor que 32 bytes", () => {
    vi.stubEnv("RETORNOS_RECURSOS_CONFIRMATION_SECRET", "x".repeat(31));

    expect(() => retornosAssinarTokenPrevia({ ...escopo, ...hashes }, agora)).toThrow(
      mensagem,
    );
  });

  it("assina e verifica a prévia com o segredo dedicado", () => {
    vi.stubEnv(
      "RETORNOS_RECURSOS_CONFIRMATION_SECRET",
      "chave-de-confirmacao-sintetica-para-qa-2026",
    );

    const token = retornosAssinarTokenPrevia({ ...escopo, ...hashes }, agora);

    expect(() =>
      retornosVerificarTokenPrevia(token, escopo, hashes.arquivoHash, hashes.respostaHash, agora),
    ).not.toThrow();
  });
});
