import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContaContextoMedicoConteudo } from "../client/src/components/contas/ContaContextoMedico";
import { contaContextoMedicoFixture } from "../client/src/components/contas/ContaContextoMedico.fixture";
import { GrupoAlternativoFields } from "../client/src/components/padroes/GrupoAlternativoFields";

function render() {
  return renderToStaticMarkup(
    createElement(ContaContextoMedicoConteudo, {
      resultado: contaContextoMedicoFixture,
      onIndexar: vi.fn(),
      onConfirmar: vi.fn(),
      onInvalidar: vi.fn(),
    })
  );
}

describe("interface de contexto médico informativo", () => {
  it("renderiza procedimentos e profissionais da fixture sem campos financeiros", () => {
    const html = render();

    expect(html).toContain("Contexto médico informativo");
    expect(html).toContain("6 registros");
    expect(html).toContain("2 códigos");
    expect(html).toContain("SYN-ALFA");
    expect(html).toContain("Profissional de Teste A");
    expect(html).toContain(
      "Honorários: Informação médica — fora do financeiro"
    );
    expect(html).toContain("Setor: Não informado no XML");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("Valor Total");
    expect(html).not.toContain("Pagamento direto confirmado");
  });

  it("mantém acesso à expansão completa quando uma fonte ultrapassa a prévia", () => {
    const resultado = {
      ...contaContextoMedicoFixture,
      fontes: [
        {
          ...contaContextoMedicoFixture.fontes[0],
          procedimentos: [
            ...contaContextoMedicoFixture.fontes[0].procedimentos,
            {
              codigo: "SYN-GAMMA",
              descricao: "Procedimento sintético gama",
              dataExecucao: null,
              sequencial: "S-07",
              profissionais: [],
            },
          ],
          codigosDistintos: 3,
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, { resultado })
    );

    expect(html).toContain("Ver todos os 7 procedimentos e 3 códigos");
  });

  it("mantém candidato parcial inelegível e não converte ausência opcional em pendência", () => {
    const html = render();

    expect(html).toContain("Modelo sintético completo");
    expect(html).toContain("Recomendado");
    expect(html).toContain("Ausente — sem pendência");
    expect(html).toContain("Modelo sintético parcial");
    expect(html).toContain("Principais encontrados: 2 de 3.");
    expect(html).toContain('disabled=""');
  });

  it("expõe controles manuais, sem executar escrita durante a renderização", () => {
    const onIndexar = vi.fn();
    const onConfirmar = vi.fn();
    const onInvalidar = vi.fn();

    renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, {
        resultado: contaContextoMedicoFixture,
        onIndexar,
        onConfirmar,
        onInvalidar,
      })
    );

    expect(onIndexar).not.toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(onInvalidar).not.toHaveBeenCalled();
  });

  it("sinaliza configuração pendente e bloqueia ações de indexação e confirmação", () => {
    const html = renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, {
        resultado: {
          ...contaContextoMedicoFixture,
          configuracaoPendente: true,
        },
        arquivos: [
          {
            id: 9002,
            nome: "arquivo-sintetico.xml",
            dataReferencia: "2026-01-12",
          },
        ],
        onIndexar: vi.fn(),
        onConfirmar: vi.fn(),
      })
    );

    expect(html).toContain("Configuração pendente");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("distingue lista médica vazia de falha ao carregar a lista", () => {
    const vazio = renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, {
        resultado: contaContextoMedicoFixture,
        arquivos: [],
      })
    );
    const erro = renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, {
        resultado: contaContextoMedicoFixture,
        arquivos: [],
        arquivosErrorMessage: "Escopo médico não encontrado.",
      })
    );
    const disponivel = renderToStaticMarkup(
      createElement(ContaContextoMedicoConteudo, {
        resultado: contaContextoMedicoFixture,
        arquivos: [{ id: 9002, nome: "arquivo-sintetico.xml", dataReferencia: "2026-01-12" }],
      })
    );

    expect(vazio).toContain("Nenhum arquivo médico elegível");
    expect(vazio).not.toContain("Não foi possível carregar os arquivos médicos");
    expect(erro).toContain("Não foi possível carregar os arquivos médicos");
    expect(erro).toContain("Revise a conta selecionada e tente carregar os arquivos novamente.");
    expect(erro).not.toContain("Escopo médico não encontrado.");
    expect(erro).not.toContain("Nenhum arquivo médico elegível");
    expect(disponivel).toContain("Selecione um arquivo médico");
    expect(disponivel).not.toContain("Não foi possível carregar os arquivos médicos");
    expect(disponivel).not.toContain("Nenhum arquivo médico elegível");
  });

  it("mantém grupo alternativo opcional até uma escolha explícita de obrigatoriedade", () => {
    const html = renderToStaticMarkup(
      createElement(GrupoAlternativoFields, {
        id: "grupo-sintetico",
        value: { grupoAlternativo: "alternativa sintética" },
        onChange: vi.fn(),
      })
    );

    expect(html).toContain("Grupo alternativo (OR)");
    expect(html).toContain("Exigir ao menos um item deste grupo");
    expect(html).toContain("Desmarcado por padrão");
    expect(html).toContain('aria-checked="false"');
  });
});
