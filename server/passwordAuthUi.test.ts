import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const app = read("client/src/App.tsx");
const selector = read("client/src/pages/SelecionarEstabelecimento.tsx");
const login = read("client/src/pages/LoginSenha.tsx");
const forgot = read("client/src/pages/EsqueciSenha.tsx");
const reset = read("client/src/pages/RedefinirSenha.tsx");

describe("telas públicas de senha", () => {
  it("registra as três rotas sem exigir estabelecimento", () => {
    expect(app).toContain('location === "/login"');
    expect(app).toContain('location === "/esqueci-senha"');
    expect(app).toContain('location === "/redefinir-senha"');
    expect(app).toContain('<Route path={"/login"}');
  });

  it("direciona o botão Entrar para o login próprio", () => {
    expect(selector).toContain('setLocation("/login")');
  });

  it("mantém o provedor externo como alternativa", () => {
    expect(login).toContain("startLogin()");
    expect(login).toContain("onClick={handleProviderLogin}");
    expect(login).toContain("Esqueci minha senha");
  });

  it("usa mensagem antienumeração e informa a validade", () => {
    expect(forgot).toContain("Se o endereço estiver cadastrado");
    expect(forgot).toContain("válido por 30 minutos");
  });

  it("remove o token da barra do navegador", () => {
    expect(reset).toContain("window.location.hash");
    expect(reset).not.toContain("window.location.search");
    expect(reset).toContain('window.history.replaceState({}, document.title, "/redefinir-senha")');
  });
});
