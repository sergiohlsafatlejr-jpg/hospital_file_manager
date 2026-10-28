import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { classificarXmlHonorarios } from "./contaHonorariosClassificador";
import {
  ErroImportacaoXmlMedico,
  rotearEnvioXmlParaContextoMedico,
} from "./importacaoAutomaticaContextoMedico";

const arquivo = {
  id: 41,
  tipoArquivo: "xml" as const,
  direcao: "enviado" as const,
  estabelecimentoId: 7,
  convenioId: 9,
};

const honorariosPuro = Buffer.from(`<?xml version="1.0"?>
  <mensagemTISS><prestadorParaOperadora><guiasTISS><guiaHonorarios>
    <cabecalhoGuia><numeroGuiaPrestador>GUIA-SINTETICA</numeroGuiaPrestador></cabecalhoGuia>
    <procedimentosRealizados><procedimentoRealizado><procedimento>
      <codigoProcedimento>PROC-SINTETICO</codigoProcedimento>
    </procedimento></procedimentoRealizado></procedimentosRealizados>
  </guiaHonorarios></guiasTISS></prestadorParaOperadora></mensagemTISS>`);

describe("importação automática de contexto médico", () => {
  it("classifica honorários puro, XML hospitalar e documento misto sem bloquear o fluxo financeiro hospitalar", () => {
    expect(classificarXmlHonorarios(honorariosPuro)).toEqual({
      tipo: "honorarios_puro",
    });
    const hospitalarPuro = Buffer.from(
      "<mensagemTISS><prestadorParaOperadora><guiasTISS><guiaSPSADT /></guiasTISS></prestadorParaOperadora></mensagemTISS>"
    );
    expect(classificarXmlHonorarios(hospitalarPuro)).toEqual({
      tipo: "nao_honorarios",
    });
    expect(
      classificarXmlHonorarios(
        Buffer.from(`
      <mensagemTISS><guiasTISS><guiaHonorarios /><guiaSPSADT /></guiasTISS></mensagemTISS>
    `)
      )
    ).toEqual({ tipo: "misto_ou_ambiguo" });
    expect(
      classificarXmlHonorarios(
        Buffer.from("<mensagemTISS><guiaHonorarios /></mensagemTISS>")
      )
    ).toEqual({ tipo: "misto_ou_ambiguo" });
    expect(
      classificarXmlHonorarios(Buffer.from("<!DOCTYPE x><mensagemTISS />"))
    ).toEqual({ tipo: "misto_ou_ambiguo" });
  });

  it("mantém XML hospitalar grande no fluxo financeiro em vez de bloqueá-lo por tamanho", async () => {
    const hospitalarGrande = Buffer.from(
      `<mensagemTISS><prestadorParaOperadora><guiasTISS><guiaSPSADT /></guiasTISS></prestadorParaOperadora>${" ".repeat(2 * 1024 * 1024)}</mensagemTISS>`
    );
    const indexarAutomaticamente = vi.fn();

    expect(classificarXmlHonorarios(hospitalarGrande)).toEqual({
      tipo: "nao_honorarios",
    });
    await expect(
      rotearEnvioXmlParaContextoMedico(arquivo, hospitalarGrande, {
        criarServico: () => ({ indexarAutomaticamente }),
      })
    ).resolves.toEqual({ destino: "financeiro" });
    expect(indexarAutomaticamente).not.toHaveBeenCalled();
  });

  it("envia honorários puro somente ao serviço informativo e preserva a idempotência retornada", async () => {
    const indexarAutomaticamente = vi.fn(async () => ({
      indexadas: 0,
      jaIndexadas: 1,
      semCorrespondencia: 0,
      ambiguas: 0,
    }));

    await expect(
      rotearEnvioXmlParaContextoMedico(arquivo, honorariosPuro, {
        criarServico: () => ({ indexarAutomaticamente }),
      })
    ).resolves.toEqual({
      destino: "contexto_informativo",
      indexadas: 0,
      jaIndexadas: 1,
      semCorrespondencia: 0,
      ambiguas: 0,
    });

    expect(indexarAutomaticamente).toHaveBeenCalledWith({
      arquivo,
      xml: honorariosPuro,
    });
  });

  it("bloqueia documento misto antes de chamar qualquer serviço de persistência", async () => {
    const indexarAutomaticamente = vi.fn();
    const misto = Buffer.from(
      "<mensagemTISS><guiasTISS><guiaHonorarios/><guiaSPSADT/></guiasTISS></mensagemTISS>"
    );

    await expect(
      rotearEnvioXmlParaContextoMedico(arquivo, misto, {
        criarServico: () => ({ indexarAutomaticamente }),
      })
    ).rejects.toBeInstanceOf(ErroImportacaoXmlMedico);
    expect(indexarAutomaticamente).not.toHaveBeenCalled();
  });

  it("não reabre o fluxo financeiro se a correlação forte não for encontrada", async () => {
    const indexarAutomaticamente = vi.fn(async () => {
      throw new Error("sem correlação");
    });

    await expect(
      rotearEnvioXmlParaContextoMedico(arquivo, honorariosPuro, {
        criarServico: () => ({ indexarAutomaticamente }),
      })
    ).rejects.toEqual(
      expect.objectContaining({
        message:
          "O XML enviado não pôde ser classificado com segurança para processamento.",
      })
    );
    expect(indexarAutomaticamente).toHaveBeenCalledOnce();
  });

  it("centraliza o upload tRPC e multipart no processor sem DTO de URL de storage", () => {
    const routers = readFileSync(
      new URL("./routers.ts", import.meta.url),
      "utf8"
    );
    const multipart = readFileSync(
      new URL("./uploadMultipart.ts", import.meta.url),
      "utf8"
    );
    const upload = routers.slice(
      routers.indexOf("upload: protectedProcedure"),
      routers.indexOf("procedimentos: protectedProcedure")
    );
    const respostaMultipart = multipart.slice(
      multipart.indexOf("// Não retornar URL/chave de storage"),
      multipart.indexOf(
        "  } catch",
        multipart.indexOf("// Não retornar URL/chave de storage")
      )
    );

    expect(upload).toContain("/api/internal/process-file");
    expect(upload).not.toContain("parseFile(buffer");
    expect(upload).not.toContain("insertFaturamentoTissBatch");
    expect(upload).not.toContain("deleteFaturamentoTissByArquivo(arquivoId)");
    expect(upload).toMatch(
      /return\s*\{\s*id: arquivoId,\s*reimportado: isReimportacao,\s*processandoEmBackground: true,?\s*\}/
    );
    expect(upload).toContain("getConvenioById(input.convenioId)");
    expect(upload).toContain("exigirConvenioDoEstabelecimento");
    expect(respostaMultipart).not.toContain("s3Url");
  });
});
