import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("client/src/pages/IntegradorEasyLocal.tsx", "utf8");
const legacy = readFileSync("client/src/pages/IntegradorDados.tsx", "utf8");
const panel = readFileSync(
  "client/src/components/integrador/EasyLocalTab.tsx",
  "utf8"
);
const app = readFileSync("client/src/App.tsx", "utf8");
const menu = readFileSync("client/src/components/SettingsMenu.tsx", "utf8");
const router = readFileSync("server/routers/easyLocalRouter.ts", "utf8");

describe("painel de preparação EASYLocal", () => {
  it("separa a rota principal do integrador legado e impede renderização sem administrador", () => {
    expect(app).toContain(
      '<Route path={"/integracao"} component={IntegradorEasyLocal} />'
    );
    expect(app).toContain(
      '<Route path={"/integracao-legado"} component={IntegradorDados} />'
    );
    expect(page).toContain('user?.role !== "admin"');
    expect(legacy).toContain('user?.role !== "admin"');
    expect(menu).toContain(
      'if (item.globalAdminOnly) return user?.role === "admin"'
    );
    expect(page).not.toMatch(
      /QueryConfigForm|sincronizarAtendimentos|ConexoesTab/
    );
  });

  it("só testa ao clicar na unidade piloto e não aceita SQL do navegador", () => {
    expect(panel).toContain("estabelecimentoId === piloto.estabelecimentoId");
    expect(panel).toMatch(/disabled=\{[\s\S]*?!preparacao\.data\?\.configuracaoDisponivel\s*\|\|\s*!unidadeCorreta\s*\|\|\s*teste\.isPending[\s\S]*?\}/);
    expect(panel).toMatch(/onClick=\{\(\) => \{\s*setResultado\(null\);\s*teste\.mutate\(\{\}\);\s*\}\}/);
    expect(page).toContain('key={estabelecimentoAtual?.id ?? "sem-unidade"}');
    expect(router).toContain("ingestaoAtiva: false as const");
    expect(router).not.toMatch(/information_schema|SELECT \*/i);
  });

  it("não inventa contagens e não exibe parâmetros de conexão", () => {
    expect(legacy).not.toContain("508 registros sincronizados com sucesso");
    expect(panel).toMatch(/a\s+tela não recebe host, usuário, senha ou certificado/);
    expect(panel).toContain("Credenciais administrativas são aceitas");
    expect(panel).toContain("não administra nem escreve no PostgreSQL");
    expect(panel).not.toContain("Credencial com privilégios excessivos");
    expect(panel).not.toContain("role dedicada somente leitura");
    expect(panel).toContain(
      "Leitura de linhas, cadastro de queries e sincronização:"
    );
  });
});
