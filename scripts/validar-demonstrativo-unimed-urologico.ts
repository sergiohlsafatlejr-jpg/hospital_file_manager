import assert from "node:assert/strict";
import { getDemonstrativoContas, getDemonstrativoResumo } from "../server/db";

const filtro = {
  estabelecimentoId: 1260036,
  convenioId: 1,
  dataPagamento: "2026-08-31",
};

const [resumo, contas] = await Promise.all([
  getDemonstrativoResumo(filtro),
  getDemonstrativoContas({ ...filtro, page: 1, pageSize: 100 }),
]);

assert.equal(Number(resumo.totalContas), 50, "A tela deve exibir 50 contas");
assert.equal(Number(resumo.totalItens), 919, "A tela deve exibir 919 itens");
assert.equal(Number(resumo.valorTotal.toFixed(2)), 57206.68, "Valor informado divergente");
assert.equal(Number(resumo.valorPago.toFixed(2)), 56540.88, "Valor pago divergente");
assert.equal(Number(resumo.valorGlosado.toFixed(2)), 665.8, "Valor glosado divergente");
assert.equal(contas.total, 50, "Quantidade de contas agrupadas divergente");

const contasComGlosa = contas.items.filter((conta) => Number(conta.valorGlosado || 0) > 0);
const itensGlosados = contas.items.reduce((total, conta) => total + Number(conta.itensGlosados || 0), 0);
const glosaNasContas = contas.items.reduce((total, conta) => total + Number(conta.valorGlosado || 0), 0);

assert.ok(contasComGlosa.length > 0, "A lista da tela deve conter contas com glosa");
assert.equal(itensGlosados, 25, "A lista da tela deve somar 25 itens glosados");
assert.equal(Number(glosaNasContas.toFixed(2)), 665.8, "A lista da tela deve fechar com o cartão de glosa");

console.log(JSON.stringify({
  resumo,
  totalContasListadas: contas.items.length,
  contasComGlosa: contasComGlosa.length,
  itensGlosados,
  glosaNasContas: Number(glosaNasContas.toFixed(2)),
}, null, 2));

process.exit(0);
