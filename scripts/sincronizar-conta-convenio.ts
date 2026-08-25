import { syncContaConvenioFromFaturamentoTiss } from "../server/syncContaConvenio";
import { getRawPool } from "../server/db";

const estabelecimentoId = Number(process.argv[2]);

if (!Number.isInteger(estabelecimentoId) || estabelecimentoId <= 0) {
  throw new Error("Informe um estabelecimentoId válido");
}

const resultado = await syncContaConvenioFromFaturamentoTiss({ estabelecimentoId });
console.log(JSON.stringify(resultado));

const pool = await getRawPool();
await pool?.end();
