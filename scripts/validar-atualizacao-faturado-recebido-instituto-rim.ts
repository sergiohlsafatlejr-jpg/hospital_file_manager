import { getRawPool } from "../server/db";
import { faturadoRecebidoUnificadoRouter } from "../server/routers/faturadoRecebidoUnificadoRouter";

const ESTABELECIMENTO_ID = 4;
const CONVENIO_ID = 1;
const COMPETENCIA = "2026/08";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const caller = faturadoRecebidoUnificadoRouter.createCaller({
    user: { id: 1, role: "admin", name: "Validação interna" },
  } as any);
  const relatorio = await caller.dados({
    estabelecimentoId: ESTABELECIMENTO_ID,
    competencia: COMPETENCIA,
    convenio: "Unimed",
    limite: 10,
  });

  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*) AS itensFonte,
        COUNT(DISTINCT ci.numeroConta) AS contasFonte,
        ROUND(SUM(COALESCE(ci.valorTotal,0)),2) AS faturadoFonte,
        (SELECT COUNT(*) FROM arquivos a
          WHERE a.estabelecimentoId=? AND a.convenioId=?
            AND a.direcao='enviado' AND a.tipoArquivo='xml'
            AND DATE(a.createdAt)='2026-09-17') AS xmlsImportados,
        (SELECT COUNT(*) FROM arquivos a
          WHERE a.estabelecimentoId=? AND a.convenioId=?
            AND a.direcao='enviado' AND a.tipoArquivo='xml'
            AND DATE(a.createdAt)='2026-09-17'
            AND DATE_FORMAT(a.dataReferencia,'%Y/%m')<>?) AS xmlsForaCompetencia
      FROM contas_convenio_itens ci
      WHERE ci.estabelecimentoId=? AND ci.convenioId=? AND ci.competencia=?
        AND (
          NOT EXISTS (
            SELECT 1 FROM convenioEstabelecimentoPrestador cfg
            WHERE cfg.estabelecimentoId=ci.estabelecimentoId
              AND cfg.convenioId=ci.convenioId
              AND cfg.tipoPrestador='proprio' AND cfg.ativo='sim'
          )
          OR EXISTS (
            SELECT 1 FROM convenioEstabelecimentoPrestador cep
            WHERE cep.estabelecimentoId=ci.estabelecimentoId
              AND cep.convenioId=ci.convenioId
              AND cep.tipoPrestador='proprio' AND cep.ativo='sim'
              AND TRIM(cep.codigoPrestador)=TRIM(COALESCE(ci.codigoPrestadorExecutante,''))
          )
        )
    `, [
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
      ESTABELECIMENTO_ID, CONVENIO_ID, COMPETENCIA,
    ]);

    const fonte = rows[0];
    const diferenca = Math.abs(Number(fonte.faturadoFonte || 0) - relatorio.resumo.totalFaturado);
    assert(Number(fonte.itensFonte) > 0, "A fonte automática de agosto está vazia");
    assert(relatorio.resumo.totalFaturado > 0, "O relatório não retornou faturamento em agosto");
    assert(diferenca <= 0.01, `Relatório diverge da fonte automática em R$ ${diferenca.toFixed(2)}`);
    assert(Number(fonte.xmlsForaCompetencia) === 0, `${fonte.xmlsForaCompetencia} XMLs de 17/09 ficaram fora de 08/2026`);

    console.log(JSON.stringify({
      validado: true,
      estabelecimento: relatorio.estabelecimento,
      competencia: COMPETENCIA,
      convenio: "Unimed",
      xmlsImportados: Number(fonte.xmlsImportados),
      xmlsForaCompetencia: Number(fonte.xmlsForaCompetencia),
      fonteAutomatica: {
        itens: Number(fonte.itensFonte),
        contas: Number(fonte.contasFonte),
        faturado: Number(fonte.faturadoFonte),
      },
      relatorio: relatorio.resumo,
      diferenca,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
