import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const page = read("client/src/pages/IntegradorEasyLocal.tsx");
const tabs = read(
  "client/src/components/integrador/EasyLocalIntegradorTabs.tsx"
).replace(/\s+/g, " ");

describe("interface do integrador EASYLocal", () => {
  it("mantém o guard administrativo antes de montar o conteúdo que consulta a unidade", () => {
    const guard = page.indexOf('if (user?.role !== "admin")');
    const content = page.indexOf("return <IntegradorEasyLocalConteudo />");
    const contextHook = page.indexOf("useEstabelecimento()");

    expect(guard).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(guard);
    expect(contextHook).toBeGreaterThan(content);
  });

  it("reinicia as abas e seus formulários ao trocar de unidade", () => {
    expect(page).toContain('key={estabelecimentoAtual?.id ?? "sem-unidade"}');
    expect(page).toContain(
      "estabelecimentoId={estabelecimentoAtual?.id ?? null}"
    );
  });

  it("não abre catálogo nem metadados da origem automaticamente ao abrir a página", () => {
    expect(tabs).toContain(
      'const [abaAtiva, setAbaAtiva] = useState("conexoes")'
    );
    expect(tabs).toContain('abaAtiva === "tabelas"');
    expect(tabs).toContain('abaAtiva === "leituras"');
    expect(tabs).toContain("onClick={solicitarDeteccao}");
    expect(tabs).toContain(
      "detectarCampos.mutate({ estabelecimentoId, origem })"
    );
    expect(tabs).not.toContain("useEffect(");
  });

  it("bloqueia as áreas de tabela e leitura quando não há unidade", () => {
    expect(tabs).toContain("!estabelecimentoId ? (");
    expect(tabs).toContain("<UnidadeObrigatoria />");
    expect(tabs).toContain("function UnidadeObrigatoria()");
  });

  it("exige confirmação e revisão completa antes da criação física", () => {
    expect(tabs).toContain("easyLocalCriarTabela.safeParse(rascunho)");
    expect(tabs).toContain("confirmarCriacao: true as const");
    expect(tabs).toContain("setTabelaParaConfirmar(validacao.data)");
    expect(tabs).toContain("function confirmarCriacao()");
    expect(tabs).toContain("criarTabela.mutate(tabelaParaConfirmar)");
    expect(tabs).toContain("Confirmar criação da tabela");
    expect(tabs).toContain("Nome físico:");
    expect(tabs).toContain("Nulidade");
    expect(tabs).toContain(
      "A nova tabela será vazia e não alterará tabelas existentes."
    );
  });

  it("preserva a privacidade: sem SQL arbitrário, credenciais, amostras ou erro bruto", () => {
    expect(tabs).not.toMatch(/<textarea|Textarea/);
    expect(tabs).not.toMatch(/password|senha|credential|credencial/i);
    expect(tabs).not.toMatch(/paciente|amostra de linhas|sample/i);
    expect(tabs).not.toContain("error.message");
    expect(tabs).toContain("function erroSeguro(");
  });

  it("não reutiliza hooks legados e só dispara mutações em ações explícitas", () => {
    for (const legado of [
      "trpc.integradorDados",
      "ConexoesTab",
      "MapeamentosTab",
      "TabelasTab",
    ]) {
      expect(tabs).not.toContain(legado);
    }
    expect(tabs).toContain("trpc.easyLocalIntegrador.listarTabelas.useQuery");
    expect(tabs).toContain("trpc.easyLocalIntegrador.criarTabela.useMutation");
    expect(tabs).toContain("onClick={confirmarCriacao}");
    expect(tabs).toContain("onClick={confirmarLeitura}");
    expect(tabs).not.toContain("useMutation({ mutate");
  });

  it("mantém horários desativados e exige prévia para importação manual", () => {
    expect(tabs).toContain("Importação manual com prévia");
    expect(tabs).toContain("A frequência desejada ainda não ativa horários");
    expect(tabs).toContain("Automação não ativada");
    expect(tabs).toContain("<EasyLocalImportacaoAcao");
    expect(tabs).toContain("Salvar configuração preparada");
  });
});
