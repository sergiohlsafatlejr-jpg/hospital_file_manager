import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contextoUnidadeAindaAtual,
  normalizarCamposFinanceirosRecurso,
  podeConfirmarEnvioManual,
  rotuloRecebimentoRecurso,
  validarConfirmacaoEnvioManual,
} from "../client/src/lib/recursoEnvioUi";

describe("regras da UI de envio de recursos", () => {
  it("só permite confirmação manual para rascunho ou pendente de envio", () => {
    expect(podeConfirmarEnvioManual({ status: "rascunho" })).toBe(true);
    expect(podeConfirmarEnvioManual({ status: "pendente_envio" })).toBe(true);
    expect(podeConfirmarEnvioManual({ status: "enviado" })).toBe(false);
    expect(podeConfirmarEnvioManual({ status: "respondido" })).toBe(false);
    expect(podeConfirmarEnvioManual({ status: "finalizado" })).toBe(false);
  });

  it("exige data e protocolo e envia o protocolo sem espaços externos", () => {
    expect(
      validarConfirmacaoEnvioManual({ dataEnvio: "", protocoloEnvio: "   " })
    ).toEqual({
      valido: false,
      dataEnvio: undefined,
      protocoloEnvio: undefined,
      erros: [
        "Informe uma data de envio válida.",
        "Informe o protocolo de envio.",
      ],
    });

    expect(
      validarConfirmacaoEnvioManual({
        dataEnvio: "2026-10-26",
        protocoloEnvio: "  PROT-123  ",
      })
    ).toEqual({
      valido: true,
      dataEnvio: "2026-10-26",
      protocoloEnvio: "PROT-123",
      erros: [],
    });

    expect(
      validarConfirmacaoEnvioManual({
        dataEnvio: "2026-02-31",
        protocoloEnvio: "PROT-123",
      })
    ).toMatchObject({
      valido: false,
      erros: ["Informe uma data de envio válida."],
    });
  });

  it("não confunde aliases legados de recebimento com pagamento original", () => {
    expect(
      normalizarCamposFinanceirosRecurso({
        valorRecebido: "150.50",
        dataPagamento: "2026-10-10",
      })
    ).toEqual({
      valorPagoOriginal: null,
      dataPagamentoOriginal: null,
      valorRecebidoRecurso: "150.50",
      dataRecebimentoRecurso: "2026-10-10",
      valorAcatado: null,
    });
  });

  it("mantém os campos novos separados e rotula somente o legado manual como informado", () => {
    expect(
      normalizarCamposFinanceirosRecurso({
        valorPagoOriginal: "200.00",
        dataPagamentoOriginal: "2026-09-30",
        valorRecebidoRecurso: "150.00",
        dataRecebimentoRecurso: "2026-10-15",
        valorAcatado: "125.00",
        valorRecebido: "999.00",
      })
    ).toEqual({
      valorPagoOriginal: "200.00",
      dataPagamentoOriginal: "2026-09-30",
      valorRecebidoRecurso: "150.00",
      dataRecebimentoRecurso: "2026-10-15",
      valorAcatado: "125.00",
    });
    expect(rotuloRecebimentoRecurso({ fonte: "recursos_glosa" })).toBe(
      "Recebimento do recurso (informado)"
    );
    expect(rotuloRecebimentoRecurso({ fonte: "demonstrativo" })).toBe(
      "Sem recebimento de recurso registrado"
    );
    expect(rotuloRecebimentoRecurso({ fonte: "conciliacao" })).toBe(
      "Sem recebimento de recurso registrado"
    );
    expect(rotuloRecebimentoRecurso({ fonte: "xml_lote" })).toBe(
      "Sem recebimento de recurso registrado"
    );
  });

  it("ignora callbacks de uma unidade ou versão de contexto anterior", () => {
    const inicial = { estabelecimentoId: 10, versao: 4 };
    expect(
      contextoUnidadeAindaAtual(inicial, { estabelecimentoId: 10, versao: 4 })
    ).toBe(true);
    expect(
      contextoUnidadeAindaAtual(inicial, { estabelecimentoId: 11, versao: 5 })
    ).toBe(false);
    expect(
      contextoUnidadeAindaAtual(inicial, { estabelecimentoId: 10, versao: 5 })
    ).toBe(false);
  });

  it("mantém exportação separada da confirmação e nunca inicia prazo ou muda status", () => {
    const pagina = readFileSync(
      new URL(
        "../client/src/pages/AcompanhamentoRecursos.tsx",
        import.meta.url
      ),
      "utf8"
    );
    const exportacoes = pagina.slice(
      pagina.indexOf("const exportarLoteMutation"),
      pagina.indexOf("const anexarProtocoloMutation")
    );

    expect(pagina).toContain("trpc.recursos.confirmarEnvioLote.useMutation");
    expect(exportacoes).not.toContain("confirmarEnvioLoteMutation.mutate");
    expect(exportacoes).not.toContain("atualizarLoteMutation");
    expect(exportacoes).not.toContain("marcarComoEnviado");
    expect(exportacoes).not.toContain('status: "enviado"');
    expect(exportacoes).not.toContain("dataPrazoResposta");
    expect(pagina).not.toContain("dataPrazoResposta:");
    expect(pagina).not.toContain("r.valorRecebidoRecurso ?? r.valorRecebido");
  });
});
