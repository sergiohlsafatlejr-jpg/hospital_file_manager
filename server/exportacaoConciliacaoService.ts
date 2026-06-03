/**
 * Serviço de Exportação Multi-formato para Conciliação
 * 
 * Gera relatórios de conciliação em Excel com múltiplas abas:
 * - Resumo: totais por status, valores consolidados
 * - Conciliados: itens que bateram
 * - Divergentes: itens com diferença de valor
 * - Glosados: itens glosados pelo convênio
 * - Pendentes: itens sem match (pendente vinculação)
 * 
 * Também suporta exportação em CSV e JSON.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import * as ExcelJS from "exceljs";
import { storagePut } from "./storage";

export interface FiltroExportacao {
  estabelecimentoId: number;
  arquivoDemoId?: number;
  convenioId?: number;
  competencia?: string;
  status?: string[];
  guia?: string;
}

interface ResumoExportacao {
  totalItens: number;
  totalConciliados: number;
  totalDivergentes: number;
  totalGlosados: number;
  totalPendentes: number;
  valorFaturadoTotal: number;
  valorPagoTotal: number;
  valorGlosadoTotal: number;
  valorDiferencaTotal: number;
  percentualRecuperacao: number;
}

/**
 * Gera relatório Excel com múltiplas abas
 */
export async function exportarConciliacaoExcel(filtro: FiltroExportacao): Promise<{ url: string; filename: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  // Construir WHERE base
  let where = `WHERE c.estabelecimentoId = ${filtro.estabelecimentoId}`;
  if (filtro.arquivoDemoId) where += ` AND c.arquivoDemoId = ${filtro.arquivoDemoId}`;
  if (filtro.convenioId) where += ` AND c.convenioId = ${filtro.convenioId}`;
  if (filtro.competencia) where += ` AND c.competencia = '${filtro.competencia.replace(/'/g, "''")}'`;
  if (filtro.guia) where += ` AND (c.guiaTasy = '${filtro.guia.replace(/'/g, "''")}' OR c.guiaDemo = '${filtro.guia.replace(/'/g, "''")}')`;
  
  // Buscar todos os itens
  const itens = await db.execute(
    sql.raw(`SELECT c.*, conv.nome as nomeConvenio
      FROM conciliacao c
      LEFT JOIN convenios conv ON conv.id = c.convenioId
      ${where}
      ORDER BY c.guiaTasy, c.codigoTasy`)
  ) as unknown as any[];
  
  // Calcular resumo
  const resumo = calcularResumo(itens);
  
  // Criar workbook Excel
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hospital File Manager";
  workbook.created = new Date();
  
  // Aba 1: Resumo
  criarAbaResumo(workbook, resumo, filtro);
  
  // Aba 2: Conciliados
  const conciliados = itens.filter((i: any) => i.statusConciliacao === "conciliado");
  criarAbaDetalhes(workbook, "Conciliados", conciliados);
  
  // Aba 3: Divergentes
  const divergentes = itens.filter((i: any) => 
    i.statusConciliacao === "divergencia_valor" || i.statusConciliacao === "pago_parcial"
  );
  criarAbaDetalhes(workbook, "Divergentes", divergentes);
  
  // Aba 4: Glosados
  const glosados = itens.filter((i: any) => i.statusConciliacao === "glosado");
  criarAbaGlosados(workbook, glosados);
  
  // Aba 5: Pendentes
  const pendentes = itens.filter((i: any) => 
    i.statusConciliacao === "nao_encontrado_demo" || i.statusConciliacao === "nao_encontrado_tasy"
  );
  criarAbaPendentes(workbook, pendentes);
  
  // Gerar buffer e salvar no S3
  const buffer = await workbook.xlsx.writeBuffer();
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `conciliacao_${filtro.estabelecimentoId}_${timestamp}.xlsx`;
  const fileKey = `exports/conciliacao/${filename}`;
  
  const { url } = await storagePut(fileKey, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  
  return { url, filename };
}

function calcularResumo(itens: any[]): ResumoExportacao {
  let totalConciliados = 0, totalDivergentes = 0, totalGlosados = 0, totalPendentes = 0;
  let valorFaturadoTotal = 0, valorPagoTotal = 0, valorGlosadoTotal = 0, valorDiferencaTotal = 0;
  
  for (const item of itens) {
    const vlFat = Number(item.valorTasy) || 0;
    const vlPago = Number(item.valorPagoDemo) || 0;
    const vlGlosa = Number(item.valorGlosadoDemo) || 0;
    
    valorFaturadoTotal += vlFat;
    valorPagoTotal += vlPago;
    valorGlosadoTotal += vlGlosa;
    
    switch (item.statusConciliacao) {
      case "conciliado":
        totalConciliados++;
        break;
      case "divergencia_valor":
      case "pago_parcial":
        totalDivergentes++;
        valorDiferencaTotal += Math.abs(vlFat - vlPago);
        break;
      case "glosado":
        totalGlosados++;
        break;
      default:
        totalPendentes++;
    }
  }
  
  return {
    totalItens: itens.length,
    totalConciliados,
    totalDivergentes,
    totalGlosados,
    totalPendentes,
    valorFaturadoTotal,
    valorPagoTotal,
    valorGlosadoTotal,
    valorDiferencaTotal,
    percentualRecuperacao: valorFaturadoTotal > 0 ? (valorPagoTotal / valorFaturadoTotal) * 100 : 0,
  };
}

function criarAbaResumo(workbook: ExcelJS.Workbook, resumo: ResumoExportacao, filtro: FiltroExportacao): void {
  const ws = workbook.addWorksheet("Resumo", { properties: { tabColor: { argb: "FF4472C4" } } });
  
  // Título
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "Relatório de Conciliação";
  titleCell.font = { bold: true, size: 16 };
  
  // Informações do filtro
  ws.getCell("A3").value = "Estabelecimento:";
  ws.getCell("B3").value = filtro.estabelecimentoId;
  ws.getCell("A4").value = "Competência:";
  ws.getCell("B4").value = filtro.competencia || "Todas";
  ws.getCell("A5").value = "Data Geração:";
  ws.getCell("B5").value = new Date().toLocaleString("pt-BR");
  
  // Resumo quantitativo
  ws.getCell("A7").value = "RESUMO QUANTITATIVO";
  ws.getCell("A7").font = { bold: true, size: 12 };
  
  const dadosResumo = [
    ["Total de Itens", resumo.totalItens],
    ["Conciliados", resumo.totalConciliados],
    ["Divergentes", resumo.totalDivergentes],
    ["Glosados", resumo.totalGlosados],
    ["Pendentes", resumo.totalPendentes],
  ];
  
  dadosResumo.forEach((row, idx) => {
    ws.getCell(`A${8 + idx}`).value = row[0] as string;
    ws.getCell(`B${8 + idx}`).value = row[1] as number;
    ws.getCell(`A${8 + idx}`).font = { bold: true };
  });
  
  // Resumo financeiro
  ws.getCell("A14").value = "RESUMO FINANCEIRO";
  ws.getCell("A14").font = { bold: true, size: 12 };
  
  const dadosFinanceiros = [
    ["Valor Faturado Total", resumo.valorFaturadoTotal],
    ["Valor Pago Total", resumo.valorPagoTotal],
    ["Valor Glosado Total", resumo.valorGlosadoTotal],
    ["Diferença Total", resumo.valorDiferencaTotal],
    ["% Recuperação", resumo.percentualRecuperacao],
  ];
  
  dadosFinanceiros.forEach((row, idx) => {
    ws.getCell(`A${15 + idx}`).value = row[0] as string;
    const cell = ws.getCell(`B${15 + idx}`);
    cell.value = row[1] as number;
    if (idx < 4) {
      cell.numFmt = '#,##0.00';
    } else {
      cell.numFmt = '0.00"%"';
    }
    ws.getCell(`A${15 + idx}`).font = { bold: true };
  });
  
  // Ajustar largura das colunas
  ws.getColumn(1).width = 25;
  ws.getColumn(2).width = 20;
}

function criarAbaDetalhes(workbook: ExcelJS.Workbook, nome: string, itens: any[]): void {
  const ws = workbook.addWorksheet(nome);
  
  // Cabeçalho
  const headers = [
    "Guia", "Código Hospital", "Descrição Hospital", "Qtd Faturada", "Valor Faturado",
    "Código Convênio", "Descrição Convênio", "Qtd Paga", "Valor Pago",
    "Diferença", "% Diferença", "Método Match"
  ];
  
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  
  // Dados
  for (const item of itens) {
    const vlFat = Number(item.valorTasy) || 0;
    const vlPago = Number(item.valorPagoDemo) || 0;
    const diff = vlFat - vlPago;
    const pctDiff = vlFat > 0 ? ((diff / vlFat) * 100) : 0;
    
    ws.addRow([
      item.guiaTasy || item.guiaDemo,
      item.codigoTasy,
      item.descricaoTasy,
      Number(item.quantidadeTasy) || 0,
      vlFat,
      item.codigoDemo,
      item.descricaoDemo,
      Number(item.quantidadeDemo) || 0,
      vlPago,
      diff,
      Math.round(pctDiff * 100) / 100,
      item.metodoMatch || "direto",
    ]);
  }
  
  // Formatar colunas numéricas
  ws.getColumn(5).numFmt = '#,##0.00';
  ws.getColumn(9).numFmt = '#,##0.00';
  ws.getColumn(10).numFmt = '#,##0.00';
  ws.getColumn(11).numFmt = '0.00"%"';
  
  // Auto-ajustar largura
  ws.columns.forEach(col => { col.width = 18; });
}

function criarAbaGlosados(workbook: ExcelJS.Workbook, itens: any[]): void {
  const ws = workbook.addWorksheet("Glosados", { properties: { tabColor: { argb: "FFED7D31" } } });
  
  const headers = [
    "Guia", "Código Hospital", "Descrição", "Valor Faturado",
    "Valor Glosado", "Motivo Glosa", "Código Glosa", "Convênio"
  ];
  
  const headerRow = ws.addRow(headers);
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFED7D31" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  
  for (const item of itens) {
    ws.addRow([
      item.guiaTasy || item.guiaDemo,
      item.codigoTasy || item.codigoDemo,
      item.descricaoTasy || item.descricaoDemo,
      Number(item.valorTasy) || 0,
      Number(item.valorGlosadoDemo) || 0,
      item.motivoGlosaDemo,
      item.codigoGlosaDemo,
      item.nomeConvenio,
    ]);
  }
  
  ws.getColumn(4).numFmt = '#,##0.00';
  ws.getColumn(5).numFmt = '#,##0.00';
  ws.columns.forEach(col => { col.width = 20; });
}

function criarAbaPendentes(workbook: ExcelJS.Workbook, itens: any[]): void {
  const ws = workbook.addWorksheet("Pendentes", { properties: { tabColor: { argb: "FFA5A5A5" } } });
  
  const headers = [
    "Origem", "Guia", "Código", "Descrição", "Quantidade", "Valor", "Status"
  ];
  
  const headerRow = ws.addRow(headers);
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA5A5A5" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  
  for (const item of itens) {
    const isHospital = item.statusConciliacao === "nao_encontrado_demo";
    ws.addRow([
      isHospital ? "Hospital (sem retorno)" : "Convênio (sem faturamento)",
      isHospital ? item.guiaTasy : item.guiaDemo,
      isHospital ? item.codigoTasy : item.codigoDemo,
      isHospital ? item.descricaoTasy : item.descricaoDemo,
      isHospital ? (Number(item.quantidadeTasy) || 0) : (Number(item.quantidadeDemo) || 0),
      isHospital ? (Number(item.valorTasy) || 0) : (Number(item.valorPagoDemo) || 0),
      item.statusConciliacao,
    ]);
  }
  
  ws.getColumn(6).numFmt = '#,##0.00';
  ws.columns.forEach(col => { col.width = 20; });
}

/**
 * Exportar conciliação em CSV (formato simples)
 */
export async function exportarConciliacaoCSV(filtro: FiltroExportacao): Promise<{ url: string; filename: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  let where = `WHERE c.estabelecimentoId = ${filtro.estabelecimentoId}`;
  if (filtro.arquivoDemoId) where += ` AND c.arquivoDemoId = ${filtro.arquivoDemoId}`;
  if (filtro.convenioId) where += ` AND c.convenioId = ${filtro.convenioId}`;
  if (filtro.competencia) where += ` AND c.competencia = '${filtro.competencia.replace(/'/g, "''")}'`;
  if (filtro.status && filtro.status.length > 0) {
    where += ` AND c.statusConciliacao IN (${filtro.status.map(s => `'${s}'`).join(",")})`;
  }
  
  const itens = await db.execute(
    sql.raw(`SELECT c.* FROM conciliacao c ${where} ORDER BY c.guiaTasy, c.codigoTasy`)
  ) as unknown as any[];
  
  // Gerar CSV
  const headers = "Guia;Código Hospital;Descrição Hospital;Valor Faturado;Código Convênio;Descrição Convênio;Valor Pago;Valor Glosado;Diferença;Status;Método\n";
  let csv = "\uFEFF" + headers; // BOM para Excel reconhecer UTF-8
  
  for (const item of itens) {
    const vlFat = Number(item.valorTasy) || 0;
    const vlPago = Number(item.valorPagoDemo) || 0;
    const vlGlosa = Number(item.valorGlosadoDemo) || 0;
    
    csv += [
      item.guiaTasy || item.guiaDemo || "",
      item.codigoTasy || "",
      (item.descricaoTasy || "").replace(/;/g, ","),
      vlFat.toFixed(2),
      item.codigoDemo || "",
      (item.descricaoDemo || "").replace(/;/g, ","),
      vlPago.toFixed(2),
      vlGlosa.toFixed(2),
      (vlFat - vlPago).toFixed(2),
      item.statusConciliacao || "",
      item.metodoMatch || "direto",
    ].join(";") + "\n";
  }
  
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `conciliacao_${filtro.estabelecimentoId}_${timestamp}.csv`;
  const fileKey = `exports/conciliacao/${filename}`;
  
  const { url } = await storagePut(fileKey, Buffer.from(csv, "utf-8"), "text/csv; charset=utf-8");
  
  return { url, filename };
}

/**
 * Exportar resumo da conciliação em JSON (para integração com outros sistemas)
 */
export async function exportarConciliacaoJSON(filtro: FiltroExportacao): Promise<{ url: string; filename: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database não disponível");
  
  let where = `WHERE c.estabelecimentoId = ${filtro.estabelecimentoId}`;
  if (filtro.arquivoDemoId) where += ` AND c.arquivoDemoId = ${filtro.arquivoDemoId}`;
  if (filtro.convenioId) where += ` AND c.convenioId = ${filtro.convenioId}`;
  if (filtro.competencia) where += ` AND c.competencia = '${filtro.competencia.replace(/'/g, "''")}'`;
  
  const itens = await db.execute(
    sql.raw(`SELECT c.* FROM conciliacao c ${where} ORDER BY c.guiaTasy, c.codigoTasy`)
  ) as unknown as any[];
  
  const resumo = calcularResumo(itens);
  
  const output = {
    geradoEm: new Date().toISOString(),
    filtro,
    resumo,
    itens: itens.map((item: any) => ({
      guia: item.guiaTasy || item.guiaDemo,
      codigoHospital: item.codigoTasy,
      codigoConvenio: item.codigoDemo,
      descricao: item.descricaoTasy || item.descricaoDemo,
      valorFaturado: Number(item.valorTasy) || 0,
      valorPago: Number(item.valorPagoDemo) || 0,
      valorGlosado: Number(item.valorGlosadoDemo) || 0,
      status: item.statusConciliacao,
      metodoMatch: item.metodoMatch,
    })),
  };
  
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `conciliacao_${filtro.estabelecimentoId}_${timestamp}.json`;
  const fileKey = `exports/conciliacao/${filename}`;
  
  const { url } = await storagePut(fileKey, Buffer.from(JSON.stringify(output, null, 2), "utf-8"), "application/json");
  
  return { url, filename };
}
