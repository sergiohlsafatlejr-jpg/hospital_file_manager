/**
 * Gerador de PDF unificado para notificações de atendimentos
 * Centraliza a lógica de geração de PDF que estava duplicada em 4 páginas
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateBR } from "@/lib/dateUtils";
import {
  type AtendimentoUnificado,
  type NotificacaoLinha,
  getMotivoLabel,
  getSetorLabel,
  getMedicoLabel,
} from "@/lib/atendimentosConstants";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png";

async function loadLogo(): Promise<HTMLImageElement | null> {
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = LOGO_URL;
    });
  } catch {
    return null;
  }
}

function drawHeader(doc: jsPDF, logoImg: HTMLImageElement | null, pageWidth: number, margin: number): void {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");
  if (logoImg) {
    doc.addImage(logoImg, "PNG", margin, 3, 22, 22);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SAFATLE", margin + (logoImg ? 26 : 0), 12);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Gerenciamento Hospitalar", margin + (logoImg ? 26 : 0), 18);
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  doc.text(dataAtual, pageWidth - margin, 12, { align: "right" });
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, pageWidth: number, pageHeight: number, margin: number): void {
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  doc.setFontSize(6);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `© ${new Date().getFullYear()} Safatle Gerenciamento Hospitalar — Documento gerado automaticamente`,
    margin, pageHeight - 8
  );
  doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  try {
    return formatDateBR(date);
  } catch {
    return String(date);
  }
}

interface PDFOptions {
  titulo?: string;
  isTasy?: boolean;
  orientation?: "portrait" | "landscape";
}

/**
 * Gera PDF de notificação de atendimentos
 */
export async function gerarPDFAtendimentos(
  atendimentos: AtendimentoUnificado[],
  notificacaoLinhas: NotificacaoLinha[],
  observacao: string,
  options: PDFOptions = {}
): Promise<jsPDF> {
  const {
    titulo = "NOTIFICAÇÃO DE ATENDIMENTOS",
    isTasy = false,
    orientation = "landscape",
  } = options;

  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const logoImg = await loadLogo();
  drawHeader(doc, logoImg, pageWidth, margin);

  let y = 34;

  // Título
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, margin, y);
  y += 6;

  doc.setFillColor(220, 38, 38);
  doc.rect(margin, y, 50, 1.5, "F");
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Total de atendimentos: ${atendimentos.length}`, margin, y);
  y += 8;

  // Motivos
  if (notificacaoLinhas.some(l => l.motivo || l.setor || l.medico)) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("MOTIVOS DA NOTIFICAÇÃO", margin, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Motivo", "Setor", "Médico/Responsável"]],
      body: notificacaoLinhas
        .filter(l => l.motivo || l.setor || l.medico)
        .map(l => [getMotivoLabel(l.motivo), getSetorLabel(l.setor), getMedicoLabel(l.medico) || "-"]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Observação
  if (observacao) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("OBSERVAÇÃO", margin, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(observacao, pageWidth - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 6;
  }

  // Tabela de atendimentos
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("ATENDIMENTOS", margin, y);
  y += 5;

  if (isTasy) {
    autoTable(doc, {
      startY: y,
      head: [["N° Atend", "Paciente", "Plano", "Dt Entrada", "Dt Saída", "Dias", "Tipo", "Serviço", "Etapa", "Setor Etapa", "User Etapa"]],
      body: atendimentos.map((d) => [
        d.numero_atendimento || d.numatend || "-",
        d.paciente || d.nomepac || "-",
        d.convenio || d.nomeplaco || "-",
        formatDate(d.data_entrada || d.datatend),
        formatDate(d.data_saida || d.datasai),
        String(d.diasParado || 0),
        d.tipo_atendimento || d.tipoatend || d.tipoatendimentodescricao || "-",
        d.codigo_servico || d.codserv || d.codServico || "-",
        d.etapaConta || "-",
        d.setorEtapa || "-",
        d.userEtapa || "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
      didDrawPage: () => { drawHeader(doc, logoImg, pageWidth, margin); },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["N° Atend", "Paciente", "Plano", "Dt Entrada", "Dt Saída", "Dias", "Tipo", "Serviço", "Valor", "Etapa"]],
      body: atendimentos.map((d) => [
        d.numero_atendimento || d.numatend || "-",
        d.paciente || d.nomepac || "-",
        d.convenio || d.nomeplaco || "-",
        formatDate(d.data_entrada || d.datatend),
        formatDate(d.data_saida || d.datasai),
        String(d.diasParado || 0),
        d.tipo_atendimento || d.tipoatend || d.tipoatendimentodescricao || "-",
        d.descricao_atendimento || d.codigo_servico || d.codserv || "-",
        d.valorConta ? parseFloat(String(d.valorConta)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-",
        d.etapaConta || "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: margin, right: margin },
      didDrawPage: () => { drawHeader(doc, logoImg, pageWidth, margin); },
    });
  }

  // Footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages, pageWidth, pageHeight, margin);
  }

  return doc;
}

/**
 * Gera e salva PDF de atendimentos
 */
export async function gerarESalvarPDF(
  atendimentos: AtendimentoUnificado[],
  notificacaoLinhas: NotificacaoLinha[],
  observacao: string,
  filename: string,
  options: PDFOptions = {}
): Promise<void> {
  const doc = await gerarPDFAtendimentos(atendimentos, notificacaoLinhas, observacao, options);
  doc.save(filename);
}
