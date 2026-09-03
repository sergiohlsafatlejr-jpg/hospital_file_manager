import { describe, expect, it } from "vitest";
import { extrairChaveXmlDaUrl, extrairRecursosDoXml } from "./recursoExcelFallback";
import { deveMarcarLoteComoEnviado, isLoteUnimed } from "../client/src/lib/recursoLoteExport";

describe("fallback da planilha de recurso Unimed", () => {
  it("extrai a chave de armazenamento de uma URL antiga", () => {
    expect(extrairChaveXmlDaUrl(
      "https://cdn.exemplo.com/projeto/recursos-glosa/lote-10/recurso_10.xml"
    )).toBe("recursos-glosa/lote-10/recurso_10.xml");
  });

  it("extrai guia e itens do XML TISS de recurso", () => {
    const xml = `
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:numeroProtocolo>2020646024</ans:numeroProtocolo>
        <ans:recursoGuia>
          <ans:numeroGuiaOrigem>73458604</ans:numeroGuiaOrigem>
          <ans:numeroGuiaOperadora>73458604</ans:numeroGuiaOperadora>
          <ans:opcaoRecursoGuia>
            <ans:itensGuia>
              <ans:dataInicio>2026-06-28</ans:dataInicio>
              <ans:procRecurso>
                <ans:codigoTabela>19</ans:codigoTabela>
                <ans:codigoProcedimento>1903176894</ans:codigoProcedimento>
                <ans:descricaoProcedimento>TIRA &amp; TESTE</ans:descricaoProcedimento>
              </ans:procRecurso>
              <ans:codGlosaItem>9999</ans:codGlosaItem>
              <ans:valorRecursado>9.20</ans:valorRecursado>
              <ans:justificativaItem>Pagamento solicitado</ans:justificativaItem>
            </ans:itensGuia>
          </ans:opcaoRecursoGuia>
        </ans:recursoGuia>
      </ans:mensagemTISS>`;

    expect(extrairRecursosDoXml(xml)).toEqual([{
      protocoloDP: "2020646024",
      guiaNumero: "73458604",
      guiaOperadora: "73458604",
      dataAtendimento: "2026-06-28",
      codigoTabela: "19",
      codigoProcedimento: "1903176894",
      descricaoProcedimento: "TIRA & TESTE",
      codigoGlosa: "9999",
      valorRecursado: 9.2,
      justificativa: "Pagamento solicitado",
    }]);
  });

  it("identifica Unimed pelo ID ou pelo protocolo", () => {
    expect(isLoteUnimed({ convenioId: 1 })).toBe(true);
    expect(isLoteUnimed({ protocoloEnvio: "07-2026 Unimed Psi" })).toBe(true);
    expect(isLoteUnimed({ convenioId: 60004, convenioNome: "Cassi" })).toBe(false);
  });

  it("não altera novamente o status de lotes em acompanhamento", () => {
    expect(deveMarcarLoteComoEnviado({ status: "pendente_envio" })).toBe(true);
    expect(deveMarcarLoteComoEnviado({ status: "rascunho" })).toBe(true);
    expect(deveMarcarLoteComoEnviado({ status: "enviado" })).toBe(false);
    expect(deveMarcarLoteComoEnviado({ status: "finalizado" })).toBe(false);
  });
});
