/**
 * Gerenciador de Jobs de Conciliação Assíncrona
 * 
 * Permite executar a conciliação em background, evitando timeout do proxy.
 * O frontend dispara o job e faz polling do progresso.
 */

import { executarConciliacaoAutomatica, type ConciliacaoResultado } from "./faturamentoUnificadoService";

export interface ConciliacaoJob {
  id: string;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  progresso: {
    competenciaAtual: string;
    competenciasProcessadas: number;
    competenciasTotal: number;
    percentual: number;
    itensProcessados: number;
    tempoDecorrido: number; // segundos
  };
  resultado: ConciliacaoResultado | null;
  erro: string | null;
  iniciadoEm: number;
  finalizadoEm: number | null;
  params: {
    estabelecimentoId: number;
    competencia?: string;
    convenioId?: number;
    toleranciaPercentual?: number;
  };
}

// Store de jobs em memória (limpa automaticamente após 1h)
const jobs = new Map<string, ConciliacaoJob>();

// Limpar jobs antigos a cada 10 minutos
setInterval(() => {
  const agora = Date.now();
  for (const [id, job] of jobs) {
    if (agora - job.iniciadoEm > 3600000) { // 1 hora
      jobs.delete(id);
    }
  }
}, 600000);

function gerarJobId(): string {
  return `conc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Inicia um job de conciliação em background
 */
export function iniciarJobConciliacao(params: ConciliacaoJob['params']): string {
  const jobId = gerarJobId();
  
  const job: ConciliacaoJob = {
    id: jobId,
    status: 'pendente',
    progresso: {
      competenciaAtual: '',
      competenciasProcessadas: 0,
      competenciasTotal: 0,
      percentual: 0,
      itensProcessados: 0,
      tempoDecorrido: 0,
    },
    resultado: null,
    erro: null,
    iniciadoEm: Date.now(),
    finalizadoEm: null,
    params,
  };
  
  jobs.set(jobId, job);
  
  // Executar em background (não aguardar)
  executarJobBackground(jobId).catch(err => {
    console.error(`[ConciliacaoJob] Erro fatal no job ${jobId}:`, err);
    const j = jobs.get(jobId);
    if (j) {
      j.status = 'erro';
      j.erro = err.message || 'Erro desconhecido';
      j.finalizadoEm = Date.now();
    }
  });
  
  return jobId;
}

/**
 * Executa o job de conciliação em background
 * Se não há competência específica, processa uma a uma com progresso
 */
async function executarJobBackground(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  
  job.status = 'processando';
  
  try {
    if (job.params.competencia) {
      // Competência específica: processar diretamente
      job.progresso.competenciasTotal = 1;
      job.progresso.competenciaAtual = job.params.competencia;
      
      const resultado = await executarConciliacaoAutomatica(job.params);
      
      job.progresso.competenciasProcessadas = 1;
      job.progresso.percentual = 100;
      job.resultado = resultado;
      job.status = 'concluido';
      job.finalizadoEm = Date.now();
    } else {
      // Sem competência: buscar apenas competências que tenham demonstrativos de retorno
      const { getDb } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database não disponível");
      
      // FILTRO INTELIGENTE: buscar competências que têm demonstrativos de retorno
      // Fonte 1: arquivos importados via upload (recebimentos_excel)
      const [compComRecebimentos] = await db.execute(sql.raw(
        `SELECT DISTINCT DATE_FORMAT(a.dataReferencia, '%Y-%m') as competencia
         FROM arquivos a
         JOIN recebimentos_excel re ON re.arquivo_id = a.id
         WHERE a.estabelecimentoId = ${job.params.estabelecimentoId}
         AND a.direcao = 'retornado'
         ORDER BY competencia`
      ));
      const compRecebimentos = (compComRecebimentos as unknown as any[]).map((r: any) => r.competencia).filter(Boolean);

      // Fonte 2: demonstrativos importados diretamente via CSV/banco externo (tabela demonstrativo)
      const [compComDemonstrativo] = await db.execute(sql.raw(
        `SELECT DISTINCT DATE_FORMAT(data_pagamento, '%Y-%m') as competencia
         FROM demonstrativo
         WHERE estabelecimentoId = ${job.params.estabelecimentoId}
         AND data_pagamento IS NOT NULL
         ORDER BY competencia`
      ));
      const compDemonstrativo = (compComDemonstrativo as unknown as any[]).map((r: any) => r.competencia).filter(Boolean);

      // Unir as duas fontes (sem duplicatas)
      const competenciasComRetorno = [...new Set([...compRecebimentos, ...compDemonstrativo])];
      
      // Buscar todas as competências do faturamento para informar quais foram puladas
      const [todasComp] = await db.execute(sql.raw(
        `SELECT DISTINCT competencia FROM faturamento_unificado WHERE estabelecimentoId = ${job.params.estabelecimentoId} ORDER BY competencia`
      ));
      const todasCompetencias = (todasComp as unknown as any[]).map((r: any) => r.competencia).filter(Boolean);

      // Normalizar competências para comparação (converter '2026/03' → '2026-03')
      const normalizarComp = (c: string) => c.replace('/', '-');
      const competenciasComRetornoNorm = competenciasComRetorno.map(normalizarComp);
      const competenciasPuladas = todasCompetencias.filter((c: string) => !competenciasComRetornoNorm.includes(normalizarComp(c)));
      
      if (competenciasPuladas.length > 0) {
        console.log(`[ConciliacaoJob] Pulando ${competenciasPuladas.length} competências sem demonstrativo: ${competenciasPuladas.join(', ')}`);
      }
      
      // Usar as competências normalizadas (formato do faturamento_unificado)
      // Cruzar com as competências disponíveis no faturamento para usar o formato correto
      const competencias = todasCompetencias.filter((c: string) => competenciasComRetornoNorm.includes(normalizarComp(c)));
      
      if (competencias.length === 0) {
        const msg = todasCompetencias.length > 0
          ? `Nenhuma competência possui demonstrativo de retorno importado. ${todasCompetencias.length} competências disponíveis (${todasCompetencias.join(', ')}), mas nenhuma tem demonstrativo. Importe demonstrativos de retorno antes de conciliar.`
          : 'Nenhuma competência encontrada no faturamento unificado.';
        console.log(`[ConciliacaoJob] ${msg}`);
        job.erro = msg;
        job.resultado = {
          totalProcessados: 0,
          totalConciliados: 0,
          totalDivergentes: 0,
          totalNaoRecebidos: 0,
          totalGlosados: 0,
          totalTerceiros: 0,
          totalJaConciliados: 0,
          detalhes: {
            conciliadosPorGuiaCodigo: 0,
            conciliadosPorGuiaCodigoTuss: 0,
            conciliadosPorVinculacao: 0,
            conciliadosPorPacienteCodigo: 0,
            conciliadosPorCarteiraCodigo: 0,
          },
          divergencias: [],
          competenciasPuladas: todasCompetencias,
        } as any;
        job.status = 'concluido';
        job.finalizadoEm = Date.now();
        return;
      }
      
      console.log(`[ConciliacaoJob] Processando ${competencias.length} competências com demonstrativo: ${competencias.join(', ')}`);
      if (competenciasPuladas.length > 0) {
        console.log(`[ConciliacaoJob] ${competenciasPuladas.length} competências sem demonstrativo serão ignoradas: ${competenciasPuladas.join(', ')}`);
      }
      
      job.progresso.competenciasTotal = competencias.length;
      
      const resultadoTotal: ConciliacaoResultado = {
        totalProcessados: 0,
        totalConciliados: 0,
        totalDivergentes: 0,
        totalNaoRecebidos: 0,
        totalGlosados: 0,
        totalTerceiros: 0,
        totalJaConciliados: 0,
        detalhes: {
          conciliadosPorGuiaCodigo: 0,
          conciliadosPorGuiaCodigoTuss: 0,
          conciliadosPorVinculacao: 0,
          conciliadosPorPacienteCodigo: 0,
          conciliadosPorCarteiraCodigo: 0,
        },
        divergencias: [],
      };
      
      for (let i = 0; i < competencias.length; i++) {
        const comp = competencias[i];
        job.progresso.competenciaAtual = comp;
        job.progresso.percentual = Math.round((i / competencias.length) * 100);
        
        const inicioComp = Date.now();
        console.log(`[ConciliacaoJob] Processando competência ${i + 1}/${competencias.length}: ${comp}`);
        
        try {
          const parcial = await executarConciliacaoAutomatica({
            ...job.params,
            competencia: comp,
          });
          
          const tempoComp = ((Date.now() - inicioComp) / 1000).toFixed(1);
          console.log(`[ConciliacaoJob] Competência ${comp} concluída em ${tempoComp}s: ${parcial.totalProcessados} itens, ${parcial.totalConciliados} conciliados, ${parcial.totalDivergentes} divergentes, ${parcial.totalNaoRecebidos} não recebidos`);
          
          resultadoTotal.totalProcessados += parcial.totalProcessados;
          job.progresso.itensProcessados = resultadoTotal.totalProcessados;
          job.progresso.tempoDecorrido = Math.round((Date.now() - job.iniciadoEm) / 1000);
          resultadoTotal.totalConciliados += parcial.totalConciliados;
          resultadoTotal.totalDivergentes += parcial.totalDivergentes;
          resultadoTotal.totalNaoRecebidos += parcial.totalNaoRecebidos;
          resultadoTotal.totalTerceiros += parcial.totalTerceiros;
          resultadoTotal.totalJaConciliados += parcial.totalJaConciliados;
          resultadoTotal.detalhes.conciliadosPorGuiaCodigo += parcial.detalhes.conciliadosPorGuiaCodigo;
          resultadoTotal.detalhes.conciliadosPorGuiaCodigoTuss += parcial.detalhes.conciliadosPorGuiaCodigoTuss;
          resultadoTotal.detalhes.conciliadosPorVinculacao += parcial.detalhes.conciliadosPorVinculacao;
          resultadoTotal.detalhes.conciliadosPorPacienteCodigo += parcial.detalhes.conciliadosPorPacienteCodigo;
          resultadoTotal.detalhes.conciliadosPorCarteiraCodigo += parcial.detalhes.conciliadosPorCarteiraCodigo;
          resultadoTotal.divergencias.push(...parcial.divergencias.slice(0, 10));
        } catch (err: any) {
          console.error(`[ConciliacaoJob] Erro na competência ${comp}:`, err.message);
          // Continua com as próximas
        }
        
        job.progresso.competenciasProcessadas = i + 1;
      }
      
      resultadoTotal.divergencias = resultadoTotal.divergencias.slice(0, 100);
      job.resultado = resultadoTotal;
      job.progresso.percentual = 100;
      job.status = 'concluido';
      job.finalizadoEm = Date.now();
    }
  } catch (err: any) {
    job.status = 'erro';
    job.erro = err.message || 'Erro desconhecido';
    job.finalizadoEm = Date.now();
    console.error(`[ConciliacaoJob] Job ${jobId} falhou:`, err);
  }
}

/**
 * Consulta o status de um job
 */
export function consultarJob(jobId: string): ConciliacaoJob | null {
  return jobs.get(jobId) || null;
}

/**
 * Verifica se há um job em andamento para o estabelecimento
 */
export function jobEmAndamento(estabelecimentoId: number): ConciliacaoJob | null {
  for (const job of jobs.values()) {
    if (
      job.params.estabelecimentoId === estabelecimentoId &&
      (job.status === 'pendente' || job.status === 'processando')
    ) {
      return job;
    }
  }
  return null;
}
