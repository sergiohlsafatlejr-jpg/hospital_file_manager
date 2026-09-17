import { getRawPool } from "../server/db";
import { faturadoRecebidoUnificadoRouter } from "../server/routers/faturadoRecebidoUnificadoRouter";

const ESTABELECIMENTO_ID = 2490001;
const CONVENIO_ID = 120006;
const ARQUIVOS = [5460418, 5460419];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function quaseIgual(atual: number, esperado: number) {
  return Math.abs(atual - esperado) <= 0.01;
}

async function main() {
  const pool = await getRawPool();
  if (!pool) throw new Error("Banco indisponível");
  try {
    const [fonte] = await pool.execute<any[]>(`
      SELECT COUNT(*) AS itens,
        COUNT(DISTINCT d.numero_guia) AS guias,
        ROUND(SUM(COALESCE(d.processado,0)),2) AS processado,
        ROUND(SUM(COALESCE(d.valor_pago,0)),2) AS recebido,
        ROUND(SUM(COALESCE(d.valor_glosa,0)),2) AS glosado,
        COUNT(DISTINCT d.arquivo_id) AS arquivos,
        COUNT(DISTINCT d.estabelecimentoId) AS estabelecimentos,
        MIN(d.estabelecimentoId) AS estabelecimentoId,
        COUNT(DISTINCT d.convenio_id) AS convenios,
        MIN(d.convenio_id) AS convenioId,
        SUM(CASE WHEN TRIM(COALESCE(d.codigo_prestador,''))<>''
          OR TRIM(COALESCE(d.prestador_executante,''))<>''
          OR TRIM(COALESCE(d.codigo_prestador_pagamento,''))<>'' THEN 1 ELSE 0 END) AS itensComCodigoPrestador
      FROM demonstrativo d
      WHERE d.arquivo_id IN (?,?)
    `, ARQUIVOS);

    const base = fonte[0];
    assert(Number(base.arquivos) === 2, `Esperados 2 arquivos, encontrados ${base.arquivos}`);
    assert(Number(base.itens) === 1031, `Esperados 1.031 itens, encontrados ${base.itens}`);
    assert(Number(base.estabelecimentos) === 1 && Number(base.estabelecimentoId) === ESTABELECIMENTO_ID,
      "Os arquivos não estão isolados no HF Visão");
    assert(Number(base.convenios) === 1 && Number(base.convenioId) === CONVENIO_ID,
      "Os arquivos não estão isolados no IAMESc");
    assert(Number(base.itensComCodigoPrestador) === 0,
      "A fonte histórica deveria permanecer sem código de prestador, sem fabricar dados");
    assert(quaseIgual(Number(base.processado), 47263.48), `Processado inesperado: ${base.processado}`);
    assert(quaseIgual(Number(base.recebido), 46931.72), `Recebido inesperado: ${base.recebido}`);
    assert(quaseIgual(Number(base.glosado), 331.76), `Glosado inesperado: ${base.glosado}`);

    const caller = faturadoRecebidoUnificadoRouter.createCaller({
      user: { id: 1, role: "admin", name: "Validação interna" },
    } as any);
    const [junho, julho, consolidado] = await Promise.all([
      caller.dados({ estabelecimentoId: ESTABELECIMENTO_ID, competencia: "2026/06", convenio: "Senaprev - Iamesc", limite: 10 }),
      caller.dados({ estabelecimentoId: ESTABELECIMENTO_ID, competencia: "2026/07", convenio: "Senaprev - Iamesc", limite: 10 }),
      caller.dados({ estabelecimentoId: ESTABELECIMENTO_ID, convenio: "Senaprev - Iamesc", limite: 10 }),
    ]);

    assert(junho.estabelecimento.id === ESTABELECIMENTO_ID && julho.estabelecimento.id === ESTABELECIMENTO_ID,
      "O relatório retornou outro estabelecimento");
    assert(quaseIgual(junho.resumo.totalFaturado, 22464.26), `Junho faturado: ${junho.resumo.totalFaturado}`);
    assert(quaseIgual(junho.resumo.totalRecebido, 22132.50), `Junho recebido: ${junho.resumo.totalRecebido}`);
    assert(quaseIgual(junho.resumo.totalGlosado, 331.76), `Junho glosado: ${junho.resumo.totalGlosado}`);
    assert(quaseIgual(julho.resumo.totalFaturado, 24799.22), `Julho faturado: ${julho.resumo.totalFaturado}`);
    assert(quaseIgual(julho.resumo.totalRecebido, 24799.22), `Julho recebido: ${julho.resumo.totalRecebido}`);
    assert(quaseIgual(julho.resumo.totalGlosado, 0), `Julho glosado: ${julho.resumo.totalGlosado}`);
    assert(quaseIgual(consolidado.resumo.totalFaturado, 47263.48), `Consolidado faturado: ${consolidado.resumo.totalFaturado}`);
    assert(quaseIgual(consolidado.resumo.totalRecebido, 46931.72), `Consolidado recebido: ${consolidado.resumo.totalRecebido}`);
    assert(quaseIgual(consolidado.resumo.totalGlosado, 331.76), `Consolidado glosado: ${consolidado.resumo.totalGlosado}`);
    assert(consolidado.resumo.quantidade === 1031, `Consolidado com ${consolidado.resumo.quantidade} itens`);

    console.log(JSON.stringify({
      validado: true,
      estabelecimento: consolidado.estabelecimento,
      convenio: "Senaprev - Iamesc",
      arquivos: ARQUIVOS,
      fonte: {
        itens: Number(base.itens),
        guias: Number(base.guias),
        processado: Number(base.processado),
        recebido: Number(base.recebido),
        glosado: Number(base.glosado),
        itensComCodigoPrestador: Number(base.itensComCodigoPrestador),
      },
      junho: junho.resumo,
      julho: julho.resumo,
      consolidado: consolidado.resumo,
      isolamentoConfirmado: true,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
