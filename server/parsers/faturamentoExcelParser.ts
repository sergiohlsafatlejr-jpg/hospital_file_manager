/**
 * Parser Excel de Faturamento - Geração do FORM 3061 (Unimed)
 * 
 * Gera planilha Excel no formato FORM 3061 a partir dos dados de um lote de guias.
 * Separado dos demais parsers para não misturar com importação de demonstrativos.
 */

import { getDb } from "../db";
import { guiasFaturamento, itensGuiaFaturamento, lotesFaturamento } from "../../drizzle/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

export async function gerarExcelFaturamentoForm3061(loteId: number): Promise<{ url: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Buscar lote
  const [lote] = await db.select().from(lotesFaturamento).where(eq(lotesFaturamento.id, loteId));
  if (!lote) throw new Error("Lote não encontrado");

  // Buscar guias do lote
  const guias = await db.select().from(guiasFaturamento).where(eq(guiasFaturamento.loteId, loteId));
  if (guias.length === 0) throw new Error("Lote não possui guias");

  // Buscar itens de todas as guias
  const guiaIds = guias.map(g => g.id);
  const todosItens = await db.select().from(itensGuiaFaturamento)
    .where(inArray(itensGuiaFaturamento.guiaId, guiaIds));

  // Buscar dados do prestador (estabelecimento)
  const [prestadorData] = await db.execute(sql`
    SELECT e.nome, e.cnpj
    FROM estabelecimentos e
    WHERE e.id = ${guias[0].estabelecimentoId}
    LIMIT 1
  `);
  const prestador = (prestadorData as any)?.[0] || {};

  // Importar ExcelJS dinamicamente (ESM: .default contém o módulo real)
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portal Safatle - Faturamento";
  workbook.created = new Date();

  // ========== Aba "Planilha1" - Tipos de Serviço ==========
  const sheetTipos = workbook.addWorksheet("Planilha1");
  sheetTipos.addRow([null, null]);
  sheetTipos.addRow([null, "Tipo de Serviço*"]);
  sheetTipos.addRow([null, "CONSULTA"]);
  sheetTipos.addRow([null, "TERAPIA"]);
  sheetTipos.addRow([null, "EXAME"]);
  sheetTipos.addRow([null, "HM"]);

  // ========== Aba "FORM 3061" - Formulário Principal ==========
  const sheet = workbook.addWorksheet("FORM 3061");

  // Configurar larguras de colunas (A=1, B=2, C=3, D=4...)
  sheet.getColumn(1).width = 3;  // A
  sheet.getColumn(2).width = 3;  // B
  sheet.getColumn(3).width = 3;  // C
  sheet.getColumn(4).width = 8;  // D - Seq / Código Form
  sheet.getColumn(5).width = 28; // E - Carteirinha
  sheet.getColumn(6).width = 35; // F - Nome Beneficiário
  sheet.getColumn(7).width = 5;  // G - vazio
  sheet.getColumn(8).width = 15; // H - Nº Guia Autorização
  sheet.getColumn(9).width = 18; // I - Código Serviço / CNPJ
  sheet.getColumn(10).width = 15; // J - Tipo Serviço
  sheet.getColumn(11).width = 25; // K - Serviço Prestado
  sheet.getColumn(12).width = 5;  // L - vazio
  sheet.getColumn(13).width = 22; // M - Data/Período
  sheet.getColumn(14).width = 5;  // N - vazio
  sheet.getColumn(15).width = 12; // O - Quantidade
  sheet.getColumn(16).width = 5;  // P - Revisão
  sheet.getColumn(17).width = 14; // Q - Valor Unitário
  sheet.getColumn(18).width = 16; // R - Valor Total

  // Linhas 1-7: Espaço para cabeçalho/logo
  for (let i = 0; i < 7; i++) sheet.addRow([]);

  // Linha 8: Código do formulário
  const row8 = sheet.addRow([null, null, null, "CÓDIGO - FORM 3061", null, null, null, null, null, null, null, null, null, null, null, "REVISÃO - Nº 00"]);
  row8.getCell(4).font = { bold: true, size: 14 };
  row8.getCell(16).font = { bold: true, size: 10 };

  // Linha 9: espaço
  sheet.addRow([]);

  // Linha 10: espaço
  sheet.addRow([]);

  // Linha 11: Orientações
  const row11 = sheet.addRow([null, null, null, "ORIENTAÇÕES IMPORTANTES:", null, null, null, null, null, null, null, null, null, null, null, null, "N° Formulário"]);
  row11.getCell(4).font = { bold: true };

  // Linhas 12-16: Instruções
  sheet.addRow([null, null, null, "▸ Este formulário é de uso obrigatório para pagamento dos serviços prestados."]);
  sheet.addRow([null, null, null, "▸ A emissão da Nota Fiscal somente será autorizada após o envio deste formulário."]);
  sheet.addRow([null, null, null, "▸ O formulário deve ser utilizado para o faturamento dos seguintes serviços:"]);
  sheet.addRow([null, null, null, "    ▸ Terapias, Consultas, Parecer Internado, Exames e Honorários Médicos."]);
  sheet.addRow([null, null, null, "Todos os campos sinalizados com (*) são de preenchimento obrigatório."]);

  // Linha 17: espaço
  sheet.addRow([]);

  // Linha 18: Dados do prestador
  const now = new Date();
  const dataEnvio = now;
  const row18 = sheet.addRow([
    null, null, null,
    "RAZÃO SOCIAL DO PRESTADOR:  ", null,
    prestador.nome || "",
    null, null,
    "CNPJ:     ", prestador.cnpj || "",
    null, null, null, null,
    "Data de Envio:", dataEnvio,
    "RESPONSÁVEL:", ""
  ]);
  row18.getCell(4).font = { bold: true };
  row18.getCell(9).font = { bold: true };
  row18.getCell(15).font = { bold: true };
  row18.getCell(17).font = { bold: true };

  // Linha 19: Cabeçalho da tabela de dados
  const headerRow = sheet.addRow([
    null, null, null,
    "Seq.",
    "Código do Cartão Beneficiário *",
    "Nome Completo do Beneficiário*",
    null,
    "Nº Guia de\nAutorização*",
    "Código do Serviço",
    "Tipo de Serviço*",
    "Serviço Prestado*",
    null,
    "Data ou\nPeríodo de Atendimento*",
    null,
    "Quantidade do Serviço Prestado*",
    null,
    "Valor Unitário*",
    "Valor Total\n(Qtde × Vlr. Unit.)*"
  ]);
  headerRow.font = { bold: true, size: 9 };
  headerRow.alignment = { wrapText: true, vertical: "middle" };

  // Linha 20: espaço
  sheet.addRow([]);

  // ========== DADOS (a partir da linha 21) ==========
  let seq = 1;
  const dataRowStart = sheet.rowCount + 1;

  for (const guia of guias) {
    const itensGuia = todosItens.filter(i => i.guiaId === guia.id);
    for (const item of itensGuia) {
      const valorUnit = Number(item.valorUnitario || 0);
      const qtd = Number(item.quantidade || 1);

      // Determinar tipo de serviço
      let tipoServico = guia.tipoServico || "TERAPIA";
      if (item.tipoItem === "procedimento" && !guia.tipoServico) {
        tipoServico = "CONSULTA";
      }

      // Formatar período de atendimento
      let periodoAtend = "";
      if (guia.dataInicio && guia.dataFim) {
        const dI = formatDateBR(guia.dataInicio);
        const dF = formatDateBR(guia.dataFim);
        periodoAtend = `${dI} A ${dF}`;
      } else if (item.dataExecucao) {
        periodoAtend = formatDateBR(item.dataExecucao);
      } else if (guia.dataAtendimento) {
        periodoAtend = formatDateBR(guia.dataAtendimento);
      }

      const currentRow = sheet.addRow([
        null, null, null,
        seq,
        guia.carteirinha || "",
        guia.nomePaciente || "",
        null,
        guia.senha || guia.numeroGuiaOperadora || "",
        item.codigoProcedimento || "",
        tipoServico,
        item.descricao || "",
        null,
        periodoAtend,
        null,
        qtd,
        null,
        valorUnit,
        { formula: `Q${sheet.rowCount}*O${sheet.rowCount}` }
      ]);

      // Formatar valores como moeda
      currentRow.getCell(17).numFmt = '#,##0.00';
      currentRow.getCell(18).numFmt = '#,##0.00';

      seq++;
    }
  }

  // Preencher linhas vazias até 25 (mínimo do formulário)
  while (seq <= 25) {
    const emptyRow = sheet.addRow([
      null, null, null,
      seq, null, null, null, null, null, null, null, null, null, null, null, null, null,
      { formula: `Q${sheet.rowCount}*O${sheet.rowCount}` }
    ]);
    emptyRow.getCell(18).numFmt = '#,##0.00';
    seq++;
  }

  // Linha de separação
  sheet.addRow([]);

  // Rodapé do formulário
  const footerHeaderRow = sheet.addRow([
    null, null, null,
    "Data de Aprovação", null, null,
    "Armazenamento", null,
    "Proteção / Acesso", null,
    "Recuperação", null,
    "Retenção com a área", null,
    "Retenção Arquivo Morto", null,
    "Disposição"
  ]);
  footerHeaderRow.font = { bold: true, size: 8 };

  sheet.addRow([
    null, null, null,
    now, null, null,
    "Servidor Unimed Goiânia", null,
    "Backup/Restrito", null,
    "Título ou nome do colaborador", null,
    "Permanente", null,
    "Permanente", null,
    "Não aplicável"
  ]);

  // ========== Gerar buffer e salvar ==========
  const buffer = await workbook.xlsx.writeBuffer();

  // Salvar no S3
  const timestamp = Date.now();
  const fileName = `faturamento/excel/${lote.numeroLote}-FORM3061-${timestamp}.xlsx`;
  const { url } = await storagePut(
    fileName,
    Buffer.from(buffer as ArrayBuffer),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  // Atualizar lote com URL do Excel
  await db.update(lotesFaturamento).set({
    excelUrl: url,
  }).where(eq(lotesFaturamento.id, loteId));

  return { url };
}

// ========== Helpers ==========

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  // Se já está no formato DD/MM, retorna
  if (dateStr.includes("/")) return dateStr;
  // Converter de YYYY-MM-DD para DD/MM
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}
