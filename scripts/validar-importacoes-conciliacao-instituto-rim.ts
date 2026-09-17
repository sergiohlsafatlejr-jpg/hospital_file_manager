import { getRawPool } from "../server/db";
import {
  competenciasConciliados,
  competenciasDisponiveis,
  resumoConciliadosPorGuia,
  resumoFaturamentoPorGuia,
} from "../server/faturamentoUnificadoService";

const ESTABELECIMENTO_ID = 4;
const CONVENIO_ID = 1;
const GUIA = "73273636";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const [competenciasFat, competenciasConc, faturamentoAgosto, conciliacaoAgosto] = await Promise.all([
    competenciasDisponiveis(ESTABELECIMENTO_ID),
    competenciasConciliados(ESTABELECIMENTO_ID),
    resumoFaturamentoPorGuia({ estabelecimentoId: ESTABELECIMENTO_ID, competencia: "2026-08", convenioId: CONVENIO_ID, limite: 1 }),
    resumoConciliadosPorGuia({ estabelecimentoId: ESTABELECIMENTO_ID, competencia: "2026-08", convenioId: CONVENIO_ID, limit: 1 }),
  ]);

  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM arquivos a WHERE a.estabelecimentoId=? AND a.convenioId=? AND a.tipoArquivo='xml' AND a.direcao='enviado' AND DATE(a.createdAt)='2026-09-17') AS arquivosEnviadosHoje,
        (SELECT COUNT(*) FROM arquivos a WHERE a.estabelecimentoId=? AND a.convenioId=? AND a.tipoArquivo='xml' AND a.direcao='enviado' AND DATE(a.createdAt)='2026-09-17' AND DATE_FORMAT(a.dataReferencia,'%Y-%m')<>'2026-08') AS arquivosHojeForaAgosto,
        (SELECT COUNT(*) FROM faturamento_tiss ft WHERE ft.estabelecimentoId=? AND ft.convenioId=? AND DATE_FORMAT(ft.data_referencia,'%Y-%m')='2026-09') AS itensRestantesSetembro,
        (SELECT COUNT(DISTINCT COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)) FROM faturamento_tiss ft WHERE ft.estabelecimentoId=? AND ft.convenioId=? AND DATE_FORMAT(ft.data_referencia,'%Y-%m')='2026-09') AS guiasRestantesSetembro,
        (SELECT COUNT(DISTINCT COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador))
           FROM faturamento_tiss ft
           JOIN demonstrativo d ON d.estabelecimentoId=ft.estabelecimentoId AND d.convenio_id=ft.convenioId AND d.numero_guia=COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador) AND DATE_FORMAT(d.data_referencia,'%Y-%m')='2026-07'
          WHERE ft.estabelecimentoId=? AND ft.convenioId=? AND DATE_FORMAT(ft.data_referencia,'%Y-%m')='2026-09') AS guiasSetembroComRetornoJulho,
        (SELECT COUNT(*) FROM faturamento_unificado fu WHERE fu.estabelecimentoId=? AND fu.convenioId=? AND fu.competencia='2026-08') AS itensFaturamentoAgosto,
        (SELECT COUNT(*) FROM conciliados_automatico ca WHERE ca.estabelecimentoId=? AND ca.convenioId=? AND ca.competencia='2026-08') AS itensConciliacaoAgosto
    `, [
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
      ESTABELECIMENTO_ID, CONVENIO_ID,
    ]);

    const [guiaRows] = await pool.execute<any[]>(`
      SELECT
        MIN(DATE_FORMAT(a.dataReferencia,'%Y-%m-%d')) AS arquivoReferencia,
        MIN(DATE_FORMAT(ft.data_referencia,'%Y-%m-%d')) AS itemReferencia,
        GROUP_CONCAT(DISTINCT ft.competencia ORDER BY ft.competencia) AS competenciaFaturamento,
        GROUP_CONCAT(DISTINCT ci.competencia ORDER BY ci.competencia) AS competenciaConta,
        GROUP_CONCAT(DISTINCT fu.competencia ORDER BY fu.competencia) AS competenciaUnificada,
        COUNT(DISTINCT ft.id) AS itens,
        ROUND(SUM(DISTINCT CASE WHEN ft.id IS NOT NULL THEN ft.valor_faturado ELSE 0 END),2) AS valorItensDistintos
      FROM faturamento_tiss ft
      JOIN arquivos a ON a.id=ft.arquivo_id
      LEFT JOIN contas_convenio_itens ci ON ci.arquivoId=ft.arquivo_id AND ci.codigoItem=ft.codigo_item AND ci.numeroConta=COALESCE(ft.numero_guia_operadora,ft.numero_guia_prestador)
      LEFT JOIN faturamento_unificado fu ON fu.origemSistema='XML_TISS' AND fu.origemId=CAST(ft.id AS CHAR)
      WHERE ft.estabelecimentoId=? AND (ft.numero_guia_prestador=? OR ft.numero_guia_operadora=?)
    `, [ESTABELECIMENTO_ID, GUIA, GUIA]);

    const estado = rows[0];
    const guia = guiaRows[0];
    const fatCompAgosto = competenciasFat.find((row: any) => row.competencia === "2026-08");
    const concCompAgosto = competenciasConc.find((row: any) => row.competencia === "2026-08");

    assert(Number(estado.arquivosEnviadosHoje) === 416, `Esperados 416 XMLs enviados hoje; encontrados ${estado.arquivosEnviadosHoje}`);
    assert(Number(estado.arquivosHojeForaAgosto) === 0, `${estado.arquivosHojeForaAgosto} XMLs de hoje ficaram fora de agosto`);
    assert(Number(estado.guiasSetembroComRetornoJulho) === 0, `${estado.guiasSetembroComRetornoJulho} guias comprovadamente de julho ainda estão em setembro`);
    assert(Number(estado.guiasRestantesSetembro) === 25, `Esperadas 25 guias históricas sem retorno preservadas em setembro; encontradas ${estado.guiasRestantesSetembro}`);
    assert(guia.arquivoReferencia === "2026-07-01", `Guia ${GUIA}: referência do arquivo ${guia.arquivoReferencia}`);
    assert(guia.itemReferencia === "2026-07-01", `Guia ${GUIA}: referência dos itens ${guia.itemReferencia}`);
    assert(guia.competenciaFaturamento === "2026/07", `Guia ${GUIA}: faturamento_tiss ${guia.competenciaFaturamento}`);
    assert(guia.competenciaConta === "2026/07", `Guia ${GUIA}: Conta Convênio ${guia.competenciaConta}`);
    assert(guia.competenciaUnificada === "2026-07", `Guia ${GUIA}: faturamento unificado ${guia.competenciaUnificada}`);
    assert(Number(estado.itensFaturamentoAgosto) === 18660, `Faturamento 08/2026: ${estado.itensFaturamentoAgosto} itens`);
    assert(Number(faturamentoAgosto.total) === 1311, `Tela Faturamento 08/2026: ${faturamentoAgosto.total} guias`);
    assert(Number(estado.itensConciliacaoAgosto) === 18705, `Conciliação 08/2026: ${estado.itensConciliacaoAgosto} itens`);
    assert(Number(conciliacaoAgosto.total) === 1311, `Tela Conciliados 08/2026: ${conciliacaoAgosto.total} guias`);
    assert(Boolean(fatCompAgosto), "Competência 08/2026 ausente no filtro de faturamento");
    assert(Boolean(concCompAgosto), "Competência 08/2026 ausente no filtro de conciliados");

    console.log(JSON.stringify({
      validado: true,
      importacoesHoje: {
        arquivosXmlEnviados: Number(estado.arquivosEnviadosHoje),
        foraDeAgosto: Number(estado.arquivosHojeForaAgosto),
      },
      guia73273636: {
        arquivoReferencia: guia.arquivoReferencia,
        itemReferencia: guia.itemReferencia,
        competenciaFaturamento: guia.competenciaFaturamento,
        competenciaConta: guia.competenciaConta,
        competenciaUnificada: guia.competenciaUnificada,
        itens: Number(guia.itens),
      },
      setembroPreservado: {
        guiasSemComprovacao: Number(estado.guiasRestantesSetembro),
        itens: Number(estado.itensRestantesSetembro),
        guiasComRetornoJulho: Number(estado.guiasSetembroComRetornoJulho),
      },
      agosto: {
        itensFaturamento: Number(estado.itensFaturamentoAgosto),
        guiasNaTelaFaturamento: Number(faturamentoAgosto.total),
        itensConciliacao: Number(estado.itensConciliacaoAgosto),
        guiasNaTelaConciliados: Number(conciliacaoAgosto.total),
      },
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
