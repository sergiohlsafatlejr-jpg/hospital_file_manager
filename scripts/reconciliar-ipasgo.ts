/**
 * Script para re-executar a conciliação do Ipasgo
 * para os meses 12/2025 a 03/2026
 * 
 * Uso: cd /home/ubuntu/hospital_file_manager && npx tsx scripts/reconciliar-ipasgo.ts
 */

import { executarConciliacaoAutomatica } from "../server/faturamentoUnificadoService";

const CONVENIO_IPASGO = 30001;
const COMPETENCIAS = ['2025/12', '2026/01', '2026/02', '2026/03'];

// Estabelecimentos que têm dados do Ipasgo nos meses alvo
// estabId=3: Hospital Urológico (tem recebimentos_excel 12/2025, 01/2026, 02/2026, 03/2026)
// estabId=6: Maternidade Ela (tem recebimentos_excel 12/2025)
// estabId=1260036: outro estabelecimento (tem faturamento mas sem recebimentos_excel nos meses alvo)
const ESTABELECIMENTOS = [3, 6, 1260036];

async function main() {
  console.log('=== RE-CONCILIAÇÃO IPASGO ===');
  console.log(`Competências: ${COMPETENCIAS.join(', ')}`);
  console.log(`Estabelecimentos: ${ESTABELECIMENTOS.join(', ')}`);
  console.log('');

  const resultadoGeral = {
    totalProcessados: 0,
    totalConciliados: 0,
    totalDivergentes: 0,
    totalNaoRecebidos: 0,
    totalGlosados: 0,
    totalTerceiros: 0,
  };

  for (const estabId of ESTABELECIMENTOS) {
    for (const competencia of COMPETENCIAS) {
      console.log(`\n--- Processando estabId=${estabId}, competência=${competencia} ---`);
      const inicio = Date.now();
      
      try {
        const resultado = await executarConciliacaoAutomatica({
          estabelecimentoId: estabId,
          competencia,
          convenioId: CONVENIO_IPASGO,
          toleranciaPercentual: 1,
        });

        const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`  ✓ Concluído em ${duracao}s`);
        console.log(`  Processados:   ${resultado.totalProcessados}`);
        console.log(`  Conciliados:   ${resultado.totalConciliados}`);
        console.log(`  Divergentes:   ${resultado.totalDivergentes}`);
        console.log(`  Não recebidos: ${resultado.totalNaoRecebidos}`);
        console.log(`  Glosados:      ${resultado.totalGlosados}`);
        console.log(`  Terceiros:     ${resultado.totalTerceiros}`);
        if (resultado.detalhes) {
          console.log(`  Detalhes match:`);
          console.log(`    Por guia+código:      ${resultado.detalhes.conciliadosPorGuiaCodigo}`);
          console.log(`    Por guia+códigoTuss:  ${resultado.detalhes.conciliadosPorGuiaCodigoTuss}`);
          console.log(`    Por vinculação:       ${resultado.detalhes.conciliadosPorVinculacao}`);
          console.log(`    Por paciente+código:  ${resultado.detalhes.conciliadosPorPacienteCodigo}`);
          console.log(`    Por carteira+código:  ${resultado.detalhes.conciliadosPorCarteiraCodigo}`);
        }

        resultadoGeral.totalProcessados += resultado.totalProcessados;
        resultadoGeral.totalConciliados += resultado.totalConciliados;
        resultadoGeral.totalDivergentes += resultado.totalDivergentes;
        resultadoGeral.totalNaoRecebidos += resultado.totalNaoRecebidos;
        resultadoGeral.totalGlosados += resultado.totalGlosados;
        resultadoGeral.totalTerceiros += resultado.totalTerceiros;

      } catch (err: any) {
        console.error(`  ✗ ERRO: ${err.message}`);
        if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
  }

  console.log('\n=== RESULTADO GERAL ===');
  console.log(`Total processados:   ${resultadoGeral.totalProcessados}`);
  console.log(`Total conciliados:   ${resultadoGeral.totalConciliados}`);
  console.log(`Total divergentes:   ${resultadoGeral.totalDivergentes}`);
  console.log(`Total não recebidos: ${resultadoGeral.totalNaoRecebidos}`);
  console.log(`Total glosados:      ${resultadoGeral.totalGlosados}`);
  console.log(`Total terceiros:     ${resultadoGeral.totalTerceiros}`);
  
  const taxaConciliacao = resultadoGeral.totalProcessados > 0 
    ? ((resultadoGeral.totalConciliados / resultadoGeral.totalProcessados) * 100).toFixed(1)
    : '0';
  console.log(`Taxa de conciliação: ${taxaConciliacao}%`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
