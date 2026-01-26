import { describe, it, expect } from "vitest";
import { extractPrestadoresFromXML } from "./parsers";

describe("extractPrestadoresFromXML", () => {
  it("deve extrair código do prestador de XML TISS padrão", async () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:operadoraParaPrestador>
          <ans:loteGuias>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:dadosExecutante>
                  <ans:contratadoExecutante>
                    <ans:codigoPrestadorNaOperadora>05562645000131</ans:codigoPrestadorNaOperadora>
                  </ans:contratadoExecutante>
                </ans:dadosExecutante>
              </ans:guiaSP-SADT>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:operadoraParaPrestador>
      </ans:mensagemTISS>`;

    const prestadores = await extractPrestadoresFromXML(xmlContent);

    expect(prestadores).toContain("05562645000131");
    expect(prestadores.length).toBe(1);
  });

  it("deve extrair múltiplos códigos de prestadores", async () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:operadoraParaPrestador>
          <ans:loteGuias>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:dadosExecutante>
                  <ans:contratadoExecutante>
                    <ans:codigoPrestadorNaOperadora>05562645000131</ans:codigoPrestadorNaOperadora>
                  </ans:contratadoExecutante>
                </ans:dadosExecutante>
              </ans:guiaSP-SADT>
              <ans:guiaSP-SADT>
                <ans:dadosExecutante>
                  <ans:contratadoExecutante>
                    <ans:codigoPrestadorNaOperadora>01570589000126</ans:codigoPrestadorNaOperadora>
                  </ans:contratadoExecutante>
                </ans:dadosExecutante>
              </ans:guiaSP-SADT>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:operadoraParaPrestador>
      </ans:mensagemTISS>`;

    const prestadores = await extractPrestadoresFromXML(xmlContent);

    expect(prestadores).toContain("05562645000131");
    expect(prestadores).toContain("01570589000126");
    expect(prestadores.length).toBe(2);
  });

  it("deve retornar array vazio para XML sem prestadores", async () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:operadoraParaPrestador>
          <ans:loteGuias>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:dadosBeneficiario>
                  <ans:numeroCarteira>123456</ans:numeroCarteira>
                </ans:dadosBeneficiario>
              </ans:guiaSP-SADT>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:operadoraParaPrestador>
      </ans:mensagemTISS>`;

    const prestadores = await extractPrestadoresFromXML(xmlContent);

    expect(prestadores.length).toBe(0);
  });

  it("deve retornar array vazio para XML inválido", async () => {
    const xmlContent = "não é um XML válido";

    const prestadores = await extractPrestadoresFromXML(xmlContent);

    expect(prestadores.length).toBe(0);
  });

  it("deve retornar códigos únicos (sem duplicatas)", async () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
      <ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
        <ans:operadoraParaPrestador>
          <ans:loteGuias>
            <ans:guiasTISS>
              <ans:guiaSP-SADT>
                <ans:dadosExecutante>
                  <ans:contratadoExecutante>
                    <ans:codigoPrestadorNaOperadora>05562645000131</ans:codigoPrestadorNaOperadora>
                  </ans:contratadoExecutante>
                </ans:dadosExecutante>
              </ans:guiaSP-SADT>
              <ans:guiaSP-SADT>
                <ans:dadosExecutante>
                  <ans:contratadoExecutante>
                    <ans:codigoPrestadorNaOperadora>05562645000131</ans:codigoPrestadorNaOperadora>
                  </ans:contratadoExecutante>
                </ans:dadosExecutante>
              </ans:guiaSP-SADT>
            </ans:guiasTISS>
          </ans:loteGuias>
        </ans:operadoraParaPrestador>
      </ans:mensagemTISS>`;

    const prestadores = await extractPrestadoresFromXML(xmlContent);

    expect(prestadores.length).toBe(1);
    expect(prestadores[0]).toBe("05562645000131");
  });
});
