import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  new URL("./xmlImportacaoLoteWorker.ts", import.meta.url),
  "utf8"
);

describe("worker de lote XML — estados terminais", () => {
  it("bloqueia todos os itens classificados quando outro XML do lote é inválido", () => {
    expect(worker).toContain("bloquearClassificadosPorFalhaNoLote");
    expect(worker).toContain("LOTE_COM_DOCUMENTO_INVALIDO");
    expect(worker).toContain(
      "await bloquearClassificadosPorFalhaNoLote(connection, lote, classificados);"
    );
    expect(worker).toContain(
      'await atualizarArquivoStatus(lote, item.arquivoId, "erro");'
    );
  });

  it("termina pendências em erro quando as retentativas se esgotam", () => {
    expect(worker).toContain("LOTE_TENTATIVAS_ESGOTADAS");
    expect(worker).toContain("'hospitalar_persistido'");
    expect(worker).toContain("'conta_materializada'");
    expect(worker).toContain("'honorario_indexado'");
    expect(worker).toContain("SET a.status='erro', a.progresso=100");
  });

  it("mantém a publicação hospitalar antes do vínculo de honorários", () => {
    expect(worker.indexOf('"processar_hospitalares"')).toBeLessThan(
      worker.indexOf('"processar_honorarios"')
    );
    expect(worker).toContain("await syncContaConvenioFromFaturamentoTiss");
    expect(worker).toContain("rotearEnvioXmlParaContextoMedico");
  });

  it("renova e propaga a reserva antes de cada honorário", () => {
    const inicioFase = worker.indexOf(
      'await touch(connection, lote, "processar_honorarios")'
    );
    const inicioHonorarios = worker.indexOf(
      "for (const { item } of honorarios)",
      inicioFase
    );
    const fimHonorarios = worker.indexOf(
      "for (const { item } of hospitalares)",
      inicioHonorarios
    );
    const trecho = worker.slice(inicioHonorarios, fimHonorarios);
    expect(trecho).toContain(
      'await touch(connection, lote, "processar_honorarios")'
    );
    expect(trecho).toContain(
      "loteClaim: { id: lote.loteId, claimToken: lote.claimToken }"
    );
  });
});
