import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\s+/g, " ");

const cadastro = read(
  "client/src/components/integrador/EasyLocalConexaoCadastro.tsx"
);
const tabs = read(
  "client/src/components/integrador/EasyLocalIntegradorTabs.tsx"
);

describe("cadastro da conexão central EASYLocal", () => {
  it("monta apenas o novo cadastro central na aba de conexões e preserva o legado", () => {
    expect(tabs).toContain("EasyLocalConexaoCadastro");
    expect(tabs).not.toContain("import { EasyLocalTab }");
    expect(tabs).not.toContain("<EasyLocalTab estabelecimentoId=");
    expect(cadastro).toContain("Uma conexão central");
    expect(cadastro).toContain("Não há cadastro por hospital nesta etapa.");
  });

  it("consulta, salva e testa pelos procedimentos dedicados", () => {
    expect(cadastro).toContain(
      "trpc.easyLocal.obterCadastro.useQuery({}, { retry: false })"
    );
    expect(cadastro).toContain("trpc.easyLocal.salvarCadastro.useMutation");
    expect(cadastro).toContain("trpc.easyLocal.testarRascunho.useMutation");
    expect(cadastro).toContain("trpc.easyLocal.testarConexao.useMutation");
    expect(cadastro).toContain("Testar dados");
    expect(cadastro).toContain("Testar conexão salva");
  });

  it("mantém senha e certificado estritamente write-only e os limpa ao encerrar", () => {
    expect(cadastro).toContain('senha: ""');
    expect(cadastro).toContain('certificado: ""');
    expect(cadastro).toContain("function limparFormulario()");
    expect(cadastro).toContain("function fecharModal()");
    expect(cadastro).toContain("senhaConfigurada");
    expect(cadastro).toContain("certificadoConfigurado");
    expect(cadastro).toContain("Deixe em branco para manter a senha atual");
    expect(cadastro).toContain(
      "Deixe em branco para manter o certificado atual"
    );
    expect(cadastro).not.toContain("localStorage");
    expect(cadastro).not.toContain("sessionStorage");
    expect(cadastro).not.toContain("console.");
    expect(cadastro).not.toContain("error.message");
  });

  it("bloqueia salvamento sem aceite e sem chave do servidor, mantendo teste disponível", () => {
    expect(cadastro).toContain("confirmarConexaoCentral: true as const");
    expect(cadastro).toContain(
      "Confirmo que esta conexão é central e será usada pelas leituras EASYLocal."
    );
    expect(cadastro).toContain("!confirmouCentral ||");
    expect(cadastro).toContain("!cadastro.data?.chaveDisponivel ||");
    expect(cadastro).toContain("EASYLOCAL_CONNECTION_ENCRYPTION_KEY");
    expect(cadastro).toContain("disabled={!podeTestar}");
  });

  it("separa os resultados de conectividade e de privilégios com texto seguro", () => {
    for (const status of [
      "conectado",
      "configuracao_pendente",
      "credencial_privilegiada",
      "falha_conexao",
    ]) {
      expect(cadastro).toContain(status);
    }
    expect(cadastro).toContain("Role com privilégios excessivos");
    expect(cadastro).toContain("Nenhum detalhe técnico sensível é exibido.");
  });

  it("invalida o cadastro e elimina seleções de origem que ficariam obsoletas", () => {
    expect(cadastro).toContain("utils.easyLocal.obterCadastro.invalidate()");
    expect(cadastro).toContain("utils.easyLocal.obterPreparacao.invalidate()");
    expect(cadastro).toContain(
      "utils.easyLocalIntegrador.listarOrigens.invalidate()"
    );
    expect(tabs).toContain('setOrigemDeteccao("")');
    expect(tabs).toContain("setLeitura(novoFormularioLeitura())");
  });
});
