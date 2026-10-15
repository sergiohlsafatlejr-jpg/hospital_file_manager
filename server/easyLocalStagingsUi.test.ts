import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  colunaEstabelecimentoDetectada,
  contextoDeteccaoAindaAtual,
  valorVinculoPersistido,
} from "../client/src/components/integrador/EasyLocalLeituraForm";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\s+/g, " ");
const tabs = read(
  "client/src/components/integrador/EasyLocalIntegradorTabs.tsx"
);

describe("UI de stagings existentes EASYLocal", () => {
  it("reaproveita valor de vínculo apenas para a mesma origem e mesma coluna", () => {
    const origemHup = {
      schema: "raw_geral",
      tabela: "hup_atendimentos_parados",
    };
    const origemIad = {
      schema: "raw_geral",
      tabela: "iad_atendimento_parados",
    };
    const leituras = [
      {
        origem: origemHup,
        colunaEstabelecimento: "estabelecimentos_id",
        valorEstabelecimento: "origem-hup",
      },
    ];

    expect(
      valorVinculoPersistido(leituras, origemHup, "estabelecimentos_id")
    ).toBe("origem-hup");
    expect(valorVinculoPersistido(leituras, origemHup, "outra_coluna")).toBe(
      ""
    );
    expect(
      valorVinculoPersistido(leituras, origemIad, "estabelecimentos_id")
    ).toBe("");
  });

  it("exige revisão quando o valor persistido é ambíguo, vazio ou apenas espaço", () => {
    const origem = { schema: "raw_geral", tabela: "hup_atendimentos_parados" };
    const base = {
      origem,
      colunaEstabelecimento: "estabelecimentos_id",
    };

    expect(
      valorVinculoPersistido(
        [
          { ...base, valorEstabelecimento: "origem-a" },
          { ...base, valorEstabelecimento: "origem-b" },
        ],
        origem,
        "estabelecimentos_id"
      )
    ).toBe("");
    expect(
      valorVinculoPersistido(
        [{ ...base, valorEstabelecimento: "   " }],
        origem,
        "estabelecimentos_id"
      )
    ).toBe("");
    expect(
      valorVinculoPersistido(
        [
          { ...base, valorEstabelecimento: " origem-a " },
          { ...base, valorEstabelecimento: "origem-a" },
        ],
        origem,
        "estabelecimentos_id"
      )
    ).toBe("origem-a");
  });

  it("aceita metadados apenas no contexto atual de unidade e origem", () => {
    const solicitado = {
      estabelecimentoId: 1260036,
      origem: { schema: "raw_geral", tabela: "hup_atendimentos_parados" },
    };
    expect(contextoDeteccaoAindaAtual(solicitado, solicitado)).toBe(true);
    expect(
      contextoDeteccaoAindaAtual(solicitado, {
        ...solicitado,
        estabelecimentoId: 2550002,
      })
    ).toBe(false);
    expect(
      contextoDeteccaoAindaAtual(solicitado, {
        ...solicitado,
        origem: { schema: "raw_geral", tabela: "iad_atendimento_parados" },
      })
    ).toBe(false);
    expect(contextoDeteccaoAindaAtual(solicitado, null)).toBe(false);
  });

  it("só sugere a coluna permitida quando os metadados a declaram exatamente", () => {
    expect(
      colunaEstabelecimentoDetectada([{ nome: "estabelecimentos_id" }])
    ).toBe("estabelecimentos_id");
    expect(
      colunaEstabelecimentoDetectada([{ nome: "Estabelecimentos_id" }])
    ).toBe("");
    expect(colunaEstabelecimentoDetectada([{ nome: "hospital_id" }])).toBe("");
  });

  it("separa destinos novos de staging e seleciona apenas staging disponível", () => {
    expect(tabs).toContain('label="Destino no Portal"');
    expect(tabs).toContain("<SelectLabel>Tabela nova</SelectLabel>");
    expect(tabs).toContain("<SelectLabel>Staging existente</SelectLabel>");
    expect(tabs).toContain("value={`staging:${staging.nomeFisico}`}");
    expect(tabs).toContain(
      '.filter(staging => staging.estado === "disponivel")'
    );
    expect(tabs).toContain("Tabelas staging existentes");
    expect(tabs).toContain("Disponível para vínculo");
    expect(tabs).toContain("Incompatível");
    expect(tabs).toContain("Ausente");
    expect(tabs).not.toContain("Criar staging");
    expect(tabs).not.toContain("Adotar staging");
  });

  it("salva somente o contrato de vínculo staging confirmado, sem tabelaId ou campoChave", () => {
    expect(tabs).toContain("easyLocalLeituraStaging.safeParse({");
    expect(tabs).toContain("confirmarVinculo: true");
    expect(tabs).toContain("salvarLeituraStaging.mutate(stagingParaConfirmar)");
    const stagingInput = tabs.slice(
      tabs.indexOf("easyLocalLeituraStaging.safeParse({"),
      tabs.indexOf(
        "if (!validacao.success)",
        tabs.indexOf("easyLocalLeituraStaging.safeParse({")
      )
    );
    expect(stagingInput).not.toContain("tabelaId");
    expect(stagingInput).not.toContain("campoChave");
    expect(tabs).toContain("Confirmar vínculo de staging");
    expect(tabs).toContain(
      "somente metadados, origem, destino, estabelecimento e valor do vínculo"
    );
  });

  it("mostra bloqueios e não monta ações de importação/agendamento para leitura staging", () => {
    expect(tabs).toContain('configuracao.tipoDestino === "staging_existente"');
    expect(tabs).toContain("Escritor atual: desconhecido.");
    expect(tabs).toContain("Carga e horário bloqueados");
    expect(tabs).toContain("Execução não liberada");
    expect(tabs).toContain("Vínculo preparado — carga e horário bloqueados.");
    const renderActions = tabs.slice(
      tabs.indexOf("const stagingExistente ="),
      tabs.indexOf("</tbody>", tabs.indexOf("const stagingExistente ="))
    );
    expect(renderActions).toContain("stagingExistente ? (");
    expect(renderActions).toContain("<EasyLocalAgendamentoAcao");
    expect(renderActions).toContain("<EasyLocalImportacaoAcao");
  });

  it("mantém o caminho de tabela nova e a detecção contextual explicitamente acionada", () => {
    expect(tabs).toContain("easyLocalLeitura.safeParse({");
    expect(tabs).toContain("tabelaId: Number(leitura.destino)");
    expect(tabs).toContain("Salvar configuração preparada");
    expect(tabs).toContain("detectarCamposLeitura.mutate(solicitacao)");
    expect(tabs).toContain("contextoDeteccaoAindaAtual(");
    expect(tabs).toContain(
      "estabelecimentoAtualRef.current !== input.estabelecimentoId"
    );
    expect(tabs).not.toContain('placeholder="hospital_id"');
    expect(tabs).not.toContain('placeholder="id_origem"');
  });
});
