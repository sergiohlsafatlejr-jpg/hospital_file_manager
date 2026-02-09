/**
 * Módulo de sincronização automática da tabela demonstrativo
 * 
 * Este módulo é responsável por popular a tabela demonstrativo com a união
 * dos dados de recebimentos_excel e recebimento_tiss após cada importação.
 */

import { getDb } from './db';
import { demonstrativo, recebimentosExcel, recebimentoTiss } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import type { InsertDemonstrativo } from '../drizzle/schema';

/**
 * Normaliza uma data para evitar problemas de fuso horário.
 * Quando o Drizzle converte Date para o banco, usa o fuso local do servidor,
 * o que pode transformar 2025-12-01T05:00:00Z em 2025-11-30.
 * Esta função extrai a data UTC e cria uma string YYYY-MM-DD.
 */
function normalizeDateForDB(dateValue: any): Date | null {
  if (!dateValue) return null;
  let d: Date;
  if (typeof dateValue === 'string') {
    // Se já é uma string no formato YYYY-MM-DD, criar Date UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      const [y, m, day] = dateValue.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, day, 12, 0, 0)); // Meio-dia UTC para evitar problemas de fuso
    }
    d = new Date(dateValue);
  } else if (dateValue instanceof Date) {
    d = dateValue;
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  // Criar nova Date com meio-dia UTC para evitar que o fuso horário mude o dia
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/**
 * Sincroniza os dados de um arquivo específico para a tabela demonstrativo
 * Chamado automaticamente após cada importação de arquivo de retorno
 */
export async function syncDemonstrativoByArquivo(
  arquivoId: number,
  origemTipo: 'excel' | 'xml'
): Promise<{ success: boolean; total: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, total: 0, error: 'Database not available' };
  }

  try {
    console.log(`[SyncDemonstrativo] Iniciando sincronização para arquivo ${arquivoId} (${origemTipo})`);

    // Primeiro, excluir registros existentes deste arquivo na tabela demonstrativo
    await db.delete(demonstrativo).where(eq(demonstrativo.arquivoId, arquivoId));
    console.log(`[SyncDemonstrativo] Registros antigos excluídos para arquivo ${arquivoId}`);

    let records: InsertDemonstrativo[] = [];

    if (origemTipo === 'excel') {
      // Buscar dados de recebimentos_excel
      const excelData = await db
        .select()
        .from(recebimentosExcel)
        .where(eq(recebimentosExcel.arquivoId, arquivoId));

      console.log(`[SyncDemonstrativo] Encontrados ${excelData.length} registros em recebimentos_excel`);

      // Mapear para formato demonstrativo
      records = excelData.map((item: any) => {
        // CORREÇÃO: Quando situacaoItem = GLOSADO, o valorPagamento é na verdade o valor glosado
        const situacao = (item.situacaoItem || '').toString().toUpperCase();
        const isGlosado = situacao === 'GLOSADO' || situacao.includes('GLOS');
        
        // Se é glosado, o valor vai para valorGlosa e valorPago = 0
        // Se não é glosado, o valor vai para valorPago
        const valorOriginal = item.valorPagamento;
        const valorPago = isGlosado ? '0' : valorOriginal;
        const valorGlosa = isGlosado ? valorOriginal : null;
        
        return {
          arquivoId: item.arquivoId,
          origemTipo: 'excel' as const,
          convenioId: item.convenioId,
          estabelecimentoId: item.estabelecimentoId,
          
          // Identificação
          numeroGuia: item.numeroGuia,
          protocolo: item.protocoloTiss,
          lotePrestador: item.lotePrestador,
          dataPagamento: item.dataPagto || item.dataPagamentoUpload || item.dataPagamento,
          
          // Beneficiário
          carteiraBeneficiario: item.beneficiario,
          nomeBeneficiario: item.nomeBeneficiario,
          
          // Detalhes do Item
          sequencialItem: item.seq,
          codigoItem: item.item,
          descricaoItem: item.itemDesc,
          dataExecucao: item.dataExecucao,
          quantidade: item.quantidade ? String(item.quantidade) : null,
          
          // Valores - CORRIGIDO: separar pago vs glosado
          valorPago,
          valorGlosa,
          
          // Status
          tipoLancamento: item.tipoLancamento,
          erroTiss: item.erroTiss,
          situacaoItem: item.situacaoItem,
          codigoGlosa: isGlosado ? item.erroTiss : null, // Erro TISS é o código da glosa
          
          // Data de referência - normalizar para evitar problemas de fuso horário
          dataReferencia: normalizeDateForDB(item.dataReferencia),
        };
      });

    } else if (origemTipo === 'xml') {
      // Buscar dados de recebimento_tiss
      const xmlData = await db
        .select()
        .from(recebimentoTiss)
        .where(eq(recebimentoTiss.arquivoId, arquivoId));

      console.log(`[SyncDemonstrativo] Encontrados ${xmlData.length} registros em recebimento_tiss`);

      // Mapear para formato demonstrativo
      records = xmlData.map((item: any) => {
        // Valores do item
        const valorInf = parseFloat(item.valorInformado || '0');
        const valorLib = parseFloat(item.valorLiberado || '0');
        
        // CORREÇÃO: Usar o valorGlosado já calculado corretamente pelo parser
        // O parser só marca como glosado se houver <relacaoGlosa> explícita ou motivoGlosaGuia
        const valorGlosadoStr = item.valorGlosado ? String(item.valorGlosado) : null;
        const valorGlosadoNum = parseFloat(valorGlosadoStr || '0');
        const hasGlosa = valorGlosadoNum > 0.01 || (item.codigoGlosa && item.codigoGlosa !== '');
        
        // Traduzir situação TISS
        // Se tem glosa total (valorLiberado = 0), marcar como GLOSADO
        // Se tem glosa parcial (valorLiberado > 0 mas tem glosa), marcar como PARCIAL
        // Senão, PAGO
        let situacao = item.situacaoGuia;
        if (hasGlosa && valorLib === 0) {
          situacao = 'GLOSADO';
        } else if (hasGlosa && valorLib > 0) {
          situacao = 'PARCIAL';
        } else {
          situacao = 'PAGO';
        }
        
        return {
          arquivoId: item.arquivoId,
          origemTipo: 'xml' as const,
          convenioId: item.convenioId,
          estabelecimentoId: item.estabelecimentoId,
          
          // Identificação
          numeroGuia: item.numeroGuiaPrestador,
          protocolo: item.numeroProtocolo,
          lotePrestador: item.numeroLotePrestador,
          dataPagamento: item.dataPagamento,
          
          // Beneficiário
          carteiraBeneficiario: item.numeroCarteira,
          nomeBeneficiario: item.nomeBeneficiario,
          
          // Detalhes do Item
          sequencialItem: item.sequencialItem ? parseInt(String(item.sequencialItem)) : null,
          codigoItem: item.codigoItem,
          descricaoItem: item.descricaoItem,
          dataExecucao: item.dataRealizacao,
          quantidade: item.quantidadeExecutada,
          
          // Valores - CORREÇÃO: 
          // valorInformado = o que o hospital cobrou
          // valorPago = valorLiberado do XML (o que o convênio efetivamente pagou)
          // valorGlosa = valorGlosado calculado pelo parser (só quando há glosa explícita)
          valorInformado: item.valorInformado,
          valorPago: item.valorLiberado || '0',
          valorGlosa: hasGlosa ? String(valorGlosadoNum.toFixed(2)) : null,
          
          // Status
          codigoGlosa: item.codigoGlosa || null,
          situacaoItem: situacao,
          erroTiss: item.codigoGlosa ? `${item.codigoGlosa}${item.descricaoGlosa ? ' - ' + item.descricaoGlosa : ''}` : null,
          
          // Data de referência - normalizar para evitar problemas de fuso horário
          dataReferencia: normalizeDateForDB(item.dataReferencia),
        };
      });
    }

    // Inserir registros na tabela demonstrativo em lotes
    if (records.length > 0) {
      const batchSize = 500;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await db.insert(demonstrativo).values(batch);
        totalInserted += batch.length;
      }

      console.log(`[SyncDemonstrativo] Inseridos ${totalInserted} registros na tabela demonstrativo`);
      return { success: true, total: totalInserted };
    }

    console.log('[SyncDemonstrativo] Nenhum registro para sincronizar');
    return { success: true, total: 0 };

  } catch (error) {
    console.error('[SyncDemonstrativo] Erro na sincronização:', error);
    return { 
      success: false, 
      total: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Sincroniza todos os dados de recebimentos para a tabela demonstrativo
 * Útil para reprocessamento em lote
 */
export async function syncAllDemonstrativo(): Promise<{ success: boolean; totalExcel: number; totalXml: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, totalExcel: 0, totalXml: 0, error: 'Database not available' };
  }

  try {
    console.log('[SyncDemonstrativo] Iniciando sincronização completa...');

    // Limpar tabela demonstrativo
    await db.delete(demonstrativo);
    console.log('[SyncDemonstrativo] Tabela demonstrativo limpa');

    // Buscar todos os arquivos únicos de recebimentos_excel
    const excelArquivos = await db
      .selectDistinct({ arquivoId: recebimentosExcel.arquivoId })
      .from(recebimentosExcel);

    let totalExcel = 0;
    for (const { arquivoId } of excelArquivos) {
      if (arquivoId) {
        const result = await syncDemonstrativoByArquivo(arquivoId, 'excel');
        if (result.success) {
          totalExcel += result.total;
        }
      }
    }

    // Buscar todos os arquivos únicos de recebimento_tiss
    const xmlArquivos = await db
      .selectDistinct({ arquivoId: recebimentoTiss.arquivoId })
      .from(recebimentoTiss);

    let totalXml = 0;
    for (const { arquivoId } of xmlArquivos) {
      if (arquivoId) {
        const result = await syncDemonstrativoByArquivo(arquivoId, 'xml');
        if (result.success) {
          totalXml += result.total;
        }
      }
    }

    console.log(`[SyncDemonstrativo] Sincronização completa: ${totalExcel} Excel + ${totalXml} XML`);
    return { success: true, totalExcel, totalXml };

  } catch (error) {
    console.error('[SyncDemonstrativo] Erro na sincronização completa:', error);
    return { 
      success: false, 
      totalExcel: 0, 
      totalXml: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
