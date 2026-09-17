import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = resolve(process.cwd());
const app = readFileSync(resolve(raiz, "client/src/App.tsx"), "utf8");
const menu = readFileSync(resolve(raiz, "client/src/components/DashboardLayout.tsx"), "utf8");
const permissoes = readFileSync(resolve(raiz, "client/src/pages/GerenciarPermissoes.tsx"), "utf8");

const relatoriosDesativados = [
  { nome: "Faturado x Recebido (Legado)", rota: "/relatorios-bi" },
  { nome: "Recebimento Geral", rota: "/relatorio-recebimento-geral" },
  { nome: "Não Recebidos", rota: "/nao-recebidos" },
  { nome: "Previsão de Glosa", rota: "/previsao-glosa" },
  { nome: "BI Financeiro (TASY)", rota: "/bi-financeiro-tasy" },
  { nome: "Protocolos TASY", rota: "/relatorio-protocolos" },
  { nome: "Previsão Recebimentos", rota: "/previsao-recebimentos" },
  { nome: "Fluxo de Caixa (BI)", rota: "/fluxo-caixa-bi" },
];

describe("relatórios desativados", () => {
  it.each(relatoriosDesativados)("remove $nome do menu e das rotas", ({ nome, rota }) => {
    expect(app).not.toContain(`path={\"${rota}\"}`);
    expect(menu).not.toContain(`path: \"${rota}\"`);
    expect(menu).not.toContain(`label: \"${nome}\"`);
  });

  it("mantém os relatórios substitutos ativos", () => {
    expect(app).toContain('path={"/faturado-recebido-unificado"}');
    expect(menu).toContain('label: "Faturado x Recebido"');
    expect(app).toContain('path={"/previsao-pagamentos-imec"}');
    expect(menu).toContain('label: "Previsão Pagamentos Imec"');
  });

  it("remove os controles de permissão exclusivos dos relatórios obsoletos", () => {
    expect(permissoes).not.toContain('label: "Rel. Recebimento Geral"');
    expect(permissoes).not.toContain('label: "Rel. Não Recebidos"');
    expect(permissoes).not.toContain('label: "Rel. Previsão de Glosa"');
  });
});
