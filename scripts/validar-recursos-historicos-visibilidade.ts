import {
  getDetalhesLoteRecurso,
  getEstatisticasRecursos,
  getRecursosGlosa,
} from "../server/db";

const RECURSOS_ESPERADOS = [
  { estabelecimentoId: 1, nome: "Pronto Socorro Infantil", total: 631 },
  { estabelecimentoId: 1260036, nome: "Hospital Urologico", total: 96 },
  { estabelecimentoId: 2, nome: "Maternidade Ela", total: 80 },
  { estabelecimentoId: 5, nome: "Hospital Nossa Senhora de Inhumas", total: 64 },
  { estabelecimentoId: 3, nome: "Ox Uti", total: 39 },
] as const;

const LOTES_ESPERADOS = [
  { loteId: 510001, estabelecimentoId: 1, itens: 32, valor: null, fontes: { demonstrativo: 32 } },
  { loteId: 450001, estabelecimentoId: 2, itens: 138, valor: null, fontes: { demonstrativo: 138 } },
  { loteId: 480001, estabelecimentoId: 2, itens: 163, valor: null, fontes: { demonstrativo: 163 } },
  { loteId: 390001, estabelecimentoId: 3, itens: 186, valor: null, fontes: { demonstrativo: 186 } },
  { loteId: 420001, estabelecimentoId: 3, itens: 169, valor: null, fontes: { demonstrativo: 169 } },
  { loteId: 330001, estabelecimentoId: 1, itens: 133, valor: 2207.29, fontes: { demonstrativo: 2, recursos_glosa: 131 } },
] as const;

const LOTES_PENDENTES = [
  { loteId: 300001, estabelecimentoId: 3, itensRegistrados: 195, valorRegistrado: 829.14 },
] as const;

function exigir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

async function main() {
  const recursos: Array<Record<string, unknown>> = [];
  let totalRecursos = 0;

  for (const esperado of RECURSOS_ESPERADOS) {
    const listagem = await getRecursosGlosa(
      1,
      { estabelecimentoId: esperado.estabelecimentoId },
      1,
      1,
    );
    const estatisticas = await getEstatisticasRecursos(1, esperado.estabelecimentoId);

    exigir(
      listagem.total === esperado.total,
      `${esperado.nome}: lista retornou ${listagem.total}, esperado ${esperado.total}`,
    );
    exigir(
      estatisticas?.total === esperado.total,
      `${esperado.nome}: cartão retornou ${estatisticas?.total}, esperado ${esperado.total}`,
    );

    totalRecursos += listagem.total;
    recursos.push({
      estabelecimentoId: esperado.estabelecimentoId,
      estabelecimento: esperado.nome,
      lista: listagem.total,
      cartao: estatisticas.total,
    });
  }

  exigir(totalRecursos === 910, `Total global retornou ${totalRecursos}, esperado 910`);

  const lotes: Array<Record<string, unknown>> = [];
  let totalItens = 0;

  for (const esperado of LOTES_ESPERADOS) {
    const detalhes = await getDetalhesLoteRecurso(esperado.loteId);
    exigir(detalhes, `Lote ${esperado.loteId} não encontrado`);
    exigir(
      detalhes.estabelecimentoId === esperado.estabelecimentoId,
      `Lote ${esperado.loteId}: estabelecimento divergente`,
    );
    exigir(
      detalhes.itens.length === esperado.itens,
      `Lote ${esperado.loteId}: retornou ${detalhes.itens.length} itens, esperado ${esperado.itens}`,
    );
    for (const [fonte, quantidade] of Object.entries(esperado.fontes)) {
      const itensDaFonte = detalhes.itens.filter((item: any) => item.fonte === fonte);
      exigir(
        itensDaFonte.length === quantidade,
        `Lote ${esperado.loteId}: fonte ${fonte} retornou ${itensDaFonte.length}, esperado ${quantidade}`,
      );
      exigir(
        itensDaFonte.every((item: any) => item.editavelPagamento === (fonte === "recursos_glosa")),
        `Lote ${esperado.loteId}: permissão de edição incompatível na fonte ${fonte}`,
      );
    }

    if (esperado.valor !== null) {
      const valorRetornado = detalhes.itens.reduce(
        (total: number, item: any) => total + Number(item.valorRecursado || 0),
        0,
      );
      exigir(
        Math.abs(valorRetornado - esperado.valor) < 0.01,
        `Lote ${esperado.loteId}: valor retornado ${valorRetornado.toFixed(2)}, esperado ${esperado.valor.toFixed(2)}`,
      );
    }

    totalItens += detalhes.itens.length;
    lotes.push({
      loteId: esperado.loteId,
      estabelecimentoId: esperado.estabelecimentoId,
      itens: detalhes.itens.length,
      fontes: esperado.fontes,
    });
  }

  exigir(totalItens === 821, `Total dos lotes retornou ${totalItens}, esperado 821`);

  const lotesPendentes = [];
  for (const esperado of LOTES_PENDENTES) {
    const detalhes = await getDetalhesLoteRecurso(esperado.loteId);
    exigir(detalhes, `Lote pendente ${esperado.loteId} não encontrado`);
    exigir(
      detalhes.estabelecimentoId === esperado.estabelecimentoId,
      `Lote pendente ${esperado.loteId}: estabelecimento divergente`,
    );
    exigir(
      detalhes.itens.length === 0,
      `Lote pendente ${esperado.loteId}: recebeu itens não comprovados`,
    );
    exigir(
      Number(detalhes.quantidadeItens) === esperado.itensRegistrados,
      `Lote pendente ${esperado.loteId}: quantidade registrada divergente`,
    );
    exigir(
      Math.abs(Number(detalhes.valorTotalRecursado) - esperado.valorRegistrado) < 0.01,
      `Lote pendente ${esperado.loteId}: valor registrado divergente`,
    );
    lotesPendentes.push({
      loteId: esperado.loteId,
      estabelecimentoId: esperado.estabelecimentoId,
      itensRegistrados: esperado.itensRegistrados,
      valorRegistrado: esperado.valorRegistrado,
      motivo: "Itens ausentes no banco e XML histórico indisponível no storage",
    });
  }

  console.log(`RECURSOS_HISTORICOS_VALIDATION_RESULT=${JSON.stringify({
    recursosAtivosVisiveis: totalRecursos,
    estabelecimentos: recursos,
    lotesRecuperados: lotes.length,
    itensLotesRecuperados: totalItens,
    lotes,
    lotesPendentes,
  })}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
