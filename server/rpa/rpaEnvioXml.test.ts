import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  cofreRpaKeyAvailable,
  estaCriptografadaNoCofre,
  obterSenhaParaRobo,
  resolverCaminhoSeguroXmlRpa,
  salvarSenhaCofre,
  sanitizarNumeroLoteTiss,
  validarCaminhoContidoXmlRpa,
  validarUrlPortalConvenio,
} from "./cofreCredenciais";
import { identificarERotearXmlTiss } from "./identificadorXmlTiss";
import { RoboUnimed } from "./robos/RoboUnimed";
import {
  convenios,
  convenioEstabelecimentoPrestador,
  credenciaisPortais,
  estabelecimentos,
} from "../../drizzle/schema";

const TEST_RPA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const SAMPLE_UNIMED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">
  <ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao>
      <ans:sequencialTransacao>98765</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>2026-11-03</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>08:30:00</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>05562645000131</ans:codigoPrestadorNaOperadora>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>382876</ans:registroANS>
    </ans:destino>
    <ans:Padrao>3.05.00</ans:Padrao>
  </ans:cabecalho>
  <ans:prestadorParaOperadora>
    <ans:loteGuias>
      <ans:numeroLote>20261199</ans:numeroLote>
      <ans:guiasTISS>
        <ans:guiaSP-SADT>
          <ans:cabecalhoGuia>
            <ans:registroANS>382876</ans:registroANS>
            <ans:numeroGuiaPrestador>GUIA-UNI-001</ans:numeroGuiaPrestador>
          </ans:cabecalhoGuia>
          <ans:dadosAutorizacao>
            <ans:numeroGuiaOperadora>OP-998877</ans:numeroGuiaOperadora>
            <ans:senha>SENHA123</ans:senha>
          </ans:dadosAutorizacao>
          <ans:dadosBeneficiario>
            <ans:numeroCarteira>00640000123456789</ans:numeroCarteira>
            <ans:nomeBeneficiario>PACIENTE TESTE UNIMED</ans:nomeBeneficiario>
          </ans:dadosBeneficiario>
          <ans:procedimentosExecutados>
            <ans:procedimentoExecutado>
              <ans:sequencialItem>1</ans:sequencialItem>
              <ans:dataExecucao>2026-11-01</ans:dataExecucao>
              <ans:procedimento>
                <ans:codigoTabela>22</ans:codigoTabela>
                <ans:codigoProcedimento>40304361</ans:codigoProcedimento>
                <ans:descricaoProcedimento>HEMOGRAMA COMPLETO</ans:descricaoProcedimento>
              </ans:procedimento>
              <ans:quantidadeExecutada>2</ans:quantidadeExecutada>
              <ans:valorUnitario>25.50</ans:valorUnitario>
              <ans:valorTotal>51.00</ans:valorTotal>
            </ans:procedimentoExecutado>
          </ans:procedimentosExecutados>
        </ans:guiaSP-SADT>
      </ans:guiasTISS>
    </ans:loteGuias>
  </ans:prestadorParaOperadora>
</ans:mensagemTISS>`;

function criarMockDb() {
  process.env.RPA_COFRE_SECRET_KEY = TEST_RPA_KEY;
  return {
    select: () => ({
      from: (table: any) => {
        if (table === estabelecimentos) {
          return Promise.resolve([
            { id: 3, nome: "Hospital Cotefi", cnpj: "02984340000120", ativo: "sim" },
            { id: 5, nome: "Hemolabor", cnpj: "05562645000131", ativo: "sim" },
          ]);
        }
        if (table === convenios) {
          return Promise.resolve([
            { id: 10, nome: "Unimed Goiânia", registroAns: "382876", ativo: "sim" },
            { id: 11, nome: "IPASGO", registroAns: "417548", ativo: "sim" },
          ]);
        }
        if (table === credenciaisPortais) {
          return Promise.resolve([
            {
              id: 1,
              estabelecimentoId: 3,
              convenioId: 10,
              codigoPrestadorOperadora: "05562645000131",
              registroAns: "382876",
              login: "cotefi_unimed",
              senha: salvarSenhaCofre("SenhaSecreta@123"),
              statusCredencial: "ATIVA",
              ativo: "sim",
            },
          ]);
        }
        if (table === convenioEstabelecimentoPrestador) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    }),
  };
}

describe("Cofre de Credenciais Multi-Hospital (AES-256-GCM e Falha Fechada)", () => {
  beforeEach(() => {
    process.env.RPA_COFRE_SECRET_KEY = TEST_RPA_KEY;
  });

  it("criptografa a senha com prefixo ENC:v1: e descriptografa em memória para o robô", () => {
    const senhaOriginal = "Unimed@Cotefi#2026";
    const cifrada = salvarSenhaCofre(senhaOriginal);

    expect(cifrada).not.toBe(senhaOriginal);
    expect(estaCriptografadaNoCofre(cifrada)).toBe(true);
    expect(obterSenhaParaRobo(cifrada)).toBe(senhaOriginal);
  });

  it("recusa texto plano legado (falha fechada)", () => {
    const legada = "senha_antiga_123";
    expect(estaCriptografadaNoCofre(legada)).toBe(false);
    expect(() => obterSenhaParaRobo(legada)).toThrow(/não criptografado recusado/i);
  });

  it("falha fechada quando RPA_COFRE_SECRET_KEY está ausente ou curta", () => {
    delete process.env.RPA_COFRE_SECRET_KEY;
    expect(cofreRpaKeyAvailable()).toBe(false);
    expect(() => salvarSenhaCofre("QualquerSenha123")).toThrow(/RPA_COFRE_SECRET_KEY/i);

    process.env.RPA_COFRE_SECRET_KEY = "curta";
    expect(cofreRpaKeyAvailable()).toBe(false);
    expect(() => salvarSenhaCofre("QualquerSenha123")).toThrow(/RPA_COFRE_SECRET_KEY/i);
  });
});

describe("Fronteiras de Segurança RPA (Allowlist HTTPS, Contenção de Caminho e Dry-Run)", () => {
  it("aceita apenas destinos HTTPS aprovados da operadora e bloqueia HTTP, IP literal ou domínio externo", () => {
    expect(
      validarUrlPortalConvenio(
        "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
        "UNIMED",
        "382876"
      )
    ).toContain("https://www.unimedgoiania.coop.br");

    expect(() =>
      validarUrlPortalConvenio(
        "http://www.unimedgoiania.coop.br/wps/portal",
        "UNIMED"
      )
    ).toThrow(/HTTPS/i);

    expect(() =>
      validarUrlPortalConvenio(
        "https://evil-phishing.example.com/login",
        "UNIMED"
      )
    ).toThrow(/allowlist/i);

    expect(() =>
      validarUrlPortalConvenio("https://127.0.0.1/portal", "UNIMED")
    ).toThrow(/rede local ou IP literal/i);
  });

  it("impede fuga de diretório no caminho de armazenamento XML e sanitiza numeroLote malicioso", () => {
    const loteLimpo = sanitizarNumeroLoteTiss("../../client/dist/pwn", "abcd1234");
    expect(loteLimpo).not.toContain("..");
    expect(loteLimpo).not.toContain("/");
    expect(loteLimpo).not.toContain("\\");

    const hashValido = "a".repeat(64);
    const resolvido = resolverCaminhoSeguroXmlRpa(
      process.cwd(),
      3,
      10,
      hashValido,
      "2026-11"
    );
    expect(
      validarCaminhoContidoXmlRpa(process.cwd(), resolvido.caminhoCompleto)
    ).toBe(resolvido.caminhoCompleto);

    expect(() =>
      validarCaminhoContidoXmlRpa(
        process.cwd(),
        path.resolve(process.cwd(), "client", "index.html")
      )
    ).toThrow(/fora do diretório privado/i);
  });

  it("executa modo simulacao (Dry-Run) localmente sem abrir navegador nem anexar XML em portal remoto", async () => {
    const hashValido = "b".repeat(64);
    const { pastaDestino, caminhoCompleto } = resolverCaminhoSeguroXmlRpa(
      process.cwd(),
      3,
      10,
      hashValido,
      "2026-11"
    );
    fs.mkdirSync(pastaDestino, { recursive: true });
    fs.writeFileSync(caminhoCompleto, SAMPLE_UNIMED_XML, "utf8");

    try {
      const robo = new RoboUnimed();
      const res = await robo.enviarLotesXml(
        {
          url: "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed",
          login: "cotefi_unimed",
          senha: "SenhaSecreta@123",
          estabelecimentoId: 3,
          convenioId: 10,
          registroAns: "382876",
        },
        [
          {
            filaId: 99,
            numeroLote: "20261199",
            nomeArquivo: "lote_teste.xml",
            caminhoXml: caminhoCompleto,
          },
        ],
        { modoExecucao: "simulacao" }
      );

      expect(res.loginSucesso).toBe(true);
      expect(res.resultadosLotes[0].status).toBe("SIMULADO_OK");
      expect(res.resultadosLotes[0].protocolo).toBeNull();
    } finally {
      if (fs.existsSync(caminhoCompleto)) {
        fs.unlinkSync(caminhoCompleto);
      }
    }
  });
});

describe("Identificador e Roteador Automático pelo <ans:cabecalho> (Unimed)", () => {
  it("identifica automaticamente Hospital, Convênio Unimed (ANS 382876), Lote, Guias e Valor Total no Hub Central", async () => {
    const dbMock = criarMockDb();
    const resultado = await identificarERotearXmlTiss(
      Buffer.from(SAMPLE_UNIMED_XML, "utf-8"),
      dbMock,
      { estabelecimentoIdContexto: 2160001 }
    );

    expect(resultado.registroAns).toBe("382876");
    expect(resultado.codigoPrestadorXml).toBe("05562645000131");
    expect(resultado.numeroLote).toBe("20261199");
    expect(resultado.versaoTiss).toBe("3.05.00");
    expect(resultado.estabelecimentoIdDetectado).toBe(3);
    expect(resultado.estabelecimentoNomeDetectado).toBe("Hospital Cotefi");
    expect(resultado.convenioIdDetectado).toBe(10);
    expect(resultado.convenioNomeDetectado).toBe("Unimed Goiânia");
    expect(resultado.qtdGuias).toBe(1);
    expect(resultado.valorTotal).toBe(51);
    expect(resultado.conflitoHospital).toBe(false);
  });

  it("aciona a Trava Multi-Hospital se o faturista estiver no Hospital 5 mas subir XML do Hospital 3", async () => {
    const dbMock = criarMockDb();
    const resultado = await identificarERotearXmlTiss(
      Buffer.from(SAMPLE_UNIMED_XML, "utf-8"),
      dbMock,
      { estabelecimentoIdContexto: 5 }
    );

    expect(resultado.conflitoHospital).toBe(true);
    expect(resultado.mensagemConflito).toContain("Hospital Cotefi");
    expect(resultado.mensagemConflito).toContain("Hemolabor");
  });
});
