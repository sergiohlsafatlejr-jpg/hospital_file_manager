import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PropostaItem {
  codigo?: string | null;
  descricao: string;
  categoria?: string | null;
  unidade?: string | null;
  quantidade: number;
  precoUnitario: string | number;
  desconto?: string | number | null;
}

interface PropostaData {
  numero: string;
  titulo: string;
  cliente: string;
  tipoCliente: string;
  responsavel?: string | null;
  condicoesPagamento?: string | null;
  validadeDias?: number | null;
  dataExpiracao?: string | Date | null;
  observacoes?: string | null;
  status: string;
  createdAt: string | Date;
  itens: PropostaItem[];
}

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("pt-BR");
}

function getClientTypeLabel(type: string): string {
  const map: Record<string, string> = {
    hospital: "Hospital",
    clinica: "Clínica",
    laboratorio: "Laboratório",
    plano_saude: "Plano de Saúde",
    governo: "Governo",
  };
  return map[type] || type;
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    rascunho: "Rascunho",
    aguardando: "Aguardando Aprovação",
    negociando: "Em Negociação",
    aprovada: "Aprovada",
    recusada: "Recusada",
  };
  return map[status] || status;
}

export async function gerarPDFProposta(proposta: PropostaData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Carregar logo
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = LOGO_URL;
    });
  } catch { /* fallback sem logo */ }

  // ===== HEADER =====
  function drawHeader() {
    // Barra escura no topo
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 34, "F");

    // Logo
    if (logoImg) {
      doc.addImage(logoImg, "PNG", margin, 5, 24, 24);
    }

    // Nome da empresa
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("SAFATLE", margin + (logoImg ? 28 : 0), 15);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Gerenciamento Hospitalar", margin + (logoImg ? 28 : 0), 22);
    doc.setFontSize(8);
    doc.setTextColor(180, 200, 220);
    doc.text("CNPJ: 00.000.000/0001-00", margin + (logoImg ? 28 : 0), 28);

    // Lado direito - info do documento
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PROPOSTA COMERCIAL", pageWidth - margin, 14, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 220);
    doc.text(proposta.numero, pageWidth - margin, 21, { align: "right" });
    const dataEmissao = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric"
    });
    doc.text(dataEmissao, pageWidth - margin, 28, { align: "right" });
  }

  // ===== FOOTER =====
  function drawFooter(pageNum: number, totalPages: number) {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 18, pageWidth - margin, pageHeight - 18);
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text("Safatle Sistemas - Gerenciamento Hospitalar | Este documento é uma proposta comercial e não constitui contrato.", margin, pageHeight - 13);
    doc.text("Proposta válida conforme condições descritas.", margin, pageHeight - 9);
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 13, { align: "right" });
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth - margin, pageHeight - 9, { align: "right" });
  }

  drawHeader();

  let y = 42;

  // ===== TÍTULO DA PROPOSTA =====
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(proposta.titulo, margin, y);
  y += 8;

  // Status badge
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Status: ${getStatusLabel(proposta.status)}`, margin, y);
  y += 10;

  // ===== DADOS DO CLIENTE =====
  // Box com fundo cinza claro
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "F");
  doc.setDrawColor(220, 225, 230);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "S");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("DADOS DO CLIENTE", margin + 5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);

  const col1X = margin + 5;
  const col2X = margin + contentWidth / 2;

  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", col1X, y + 13);
  doc.setFont("helvetica", "normal");
  doc.text(proposta.cliente, col1X + 18, y + 13);

  doc.setFont("helvetica", "bold");
  doc.text("Tipo:", col2X, y + 13);
  doc.setFont("helvetica", "normal");
  doc.text(getClientTypeLabel(proposta.tipoCliente), col2X + 12, y + 13);

  doc.setFont("helvetica", "bold");
  doc.text("Responsável:", col1X, y + 20);
  doc.setFont("helvetica", "normal");
  doc.text(proposta.responsavel || "-", col1X + 28, y + 20);

  doc.setFont("helvetica", "bold");
  doc.text("Pagamento:", col2X, y + 20);
  doc.setFont("helvetica", "normal");
  doc.text(proposta.condicoesPagamento || "-", col2X + 24, y + 20);

  doc.setFont("helvetica", "bold");
  doc.text("Validade:", col1X, y + 27);
  doc.setFont("helvetica", "normal");
  const validadeText = proposta.dataExpiracao
    ? `Até ${formatDateBR(proposta.dataExpiracao)} (${proposta.validadeDias || 30} dias)`
    : `${proposta.validadeDias || 30} dias`;
  doc.text(validadeText, col1X + 20, y + 27);

  y += 36;

  // ===== TABELA DE ITENS/SERVIÇOS =====
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("SERVIÇOS E VALORES", margin, y);
  y += 5;

  const itens = proposta.itens || [];
  const tableData = itens.map((item) => {
    const subtotal = item.quantidade * Number(item.precoUnitario);
    const desconto = Number(item.desconto || 0);
    const total = subtotal * (1 - desconto / 100);
    return [
      item.codigo || "-",
      item.descricao,
      item.categoria || "-",
      String(item.quantidade),
      formatCurrency(Number(item.precoUnitario)),
      desconto > 0 ? `${desconto}%` : "-",
      formatCurrency(total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Código", "Descrição", "Categoria", "Qtd", "Valor Unit.", "Desc.", "Total"]],
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [40, 40, 40],
      lineColor: [220, 225, 230],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28 },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ===== TOTAIS =====
  const totalBruto = itens.reduce((acc, item) => acc + item.quantidade * Number(item.precoUnitario), 0);
  const totalLiquido = itens.reduce((acc, item) => {
    const subtotal = item.quantidade * Number(item.precoUnitario);
    const desconto = Number(item.desconto || 0);
    return acc + subtotal * (1 - desconto / 100);
  }, 0);
  const totalDesconto = totalBruto - totalLiquido;

  // Box de totais
  const totaisBoxWidth = 80;
  const totaisBoxX = pageWidth - margin - totaisBoxWidth;

  doc.setFillColor(245, 247, 250);
  doc.roundedRect(totaisBoxX, y, totaisBoxWidth, 28, 2, 2, "F");
  doc.setDrawColor(220, 225, 230);
  doc.roundedRect(totaisBoxX, y, totaisBoxWidth, 28, 2, 2, "S");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Subtotal:", totaisBoxX + 4, y + 7);
  doc.text(formatCurrency(totalBruto), totaisBoxX + totaisBoxWidth - 4, y + 7, { align: "right" });

  doc.text("Descontos:", totaisBoxX + 4, y + 13);
  doc.setTextColor(22, 163, 74); // green
  doc.text(`- ${formatCurrency(totalDesconto)}`, totaisBoxX + totaisBoxWidth - 4, y + 13, { align: "right" });

  doc.setDrawColor(200, 200, 200);
  doc.line(totaisBoxX + 4, y + 16, totaisBoxX + totaisBoxWidth - 4, y + 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("TOTAL:", totaisBoxX + 4, y + 23);
  doc.setTextColor(37, 99, 235); // primary blue
  doc.text(formatCurrency(totalLiquido), totaisBoxX + totaisBoxWidth - 4, y + 23, { align: "right" });

  y += 36;

  // ===== OBSERVAÇÕES =====
  if (proposta.observacoes) {
    if (y > pageHeight - 60) {
      doc.addPage();
      drawHeader();
      y = 42;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("OBSERVAÇÕES", margin, y);
    y += 5;

    doc.setFillColor(255, 251, 235); // amber-50
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "F");
    doc.setDrawColor(252, 211, 77); // amber-300
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "S");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const splitObs = doc.splitTextToSize(proposta.observacoes, contentWidth - 10);
    doc.text(splitObs.slice(0, 4), margin + 5, y + 6);
    y += 24;
  }

  // ===== ASSINATURA =====
  if (y > pageHeight - 50) {
    doc.addPage();
    drawHeader();
    y = 42;
  }

  y += 10;
  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([2, 2], 0);

  // Linha assinatura contratante
  const sigWidth = (contentWidth - 20) / 2;
  doc.line(margin, y + 20, margin + sigWidth, y + 20);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(proposta.cliente, margin + sigWidth / 2, y + 25, { align: "center" });
  doc.text("Contratante", margin + sigWidth / 2, y + 30, { align: "center" });

  // Linha assinatura Safatle
  const sig2X = margin + sigWidth + 20;
  doc.line(sig2X, y + 20, sig2X + sigWidth, y + 20);
  doc.text("Safatle Sistemas", sig2X + sigWidth / 2, y + 25, { align: "center" });
  doc.text("Contratada", sig2X + sigWidth / 2, y + 30, { align: "center" });

  doc.setLineDashPattern([], 0);

  // ===== FOOTER em todas as páginas =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  return doc;
}
