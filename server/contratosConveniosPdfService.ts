import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";

export const CONTRATOS_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const CONTRATOS_PDF_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export type ContratoConvenioPontoCategoria =
  | "partes"
  | "vigencia"
  | "faturamento"
  | "pagamento"
  | "documentos"
  | "obrigacoes"
  | "rescisao"
  | "dados_e_sigilo"
  | "contatos";

export type ContratoConvenioPonto = {
  categoria: ContratoConvenioPontoCategoria;
  titulo: string;
  resumo: string;
  prioridade: "alta" | "media" | "baixa";
};

export type ContratoConvenioPdfLeitura = {
  paginas: number;
  textoExtraido: string;
  pontosImportantes: ContratoConvenioPonto[];
  status: "concluido" | "ocr_necessario";
};

const CATEGORIAS: Array<{
  categoria: ContratoConvenioPontoCategoria;
  titulo: string;
  prioridade: "alta" | "media" | "baixa";
  palavras: string[];
}> = [
  {
    categoria: "vigencia",
    titulo: "Vigência e prazos",
    prioridade: "alta",
    palavras: [
      "vigencia",
      "vigor",
      "prazo",
      "indeterminado",
      "dias uteis",
      "dias corridos",
    ],
  },
  {
    categoria: "faturamento",
    titulo: "Faturamento e envio de contas",
    prioridade: "alta",
    palavras: [
      "faturamento",
      "fatura",
      "conta",
      "nota fiscal",
      "auditoria",
      "reembolso",
    ],
  },
  {
    categoria: "pagamento",
    titulo: "Pagamento e calendário",
    prioridade: "alta",
    palavras: [
      "pagamento",
      "deposito",
      "calendario",
      "vencimento",
      "recebimento",
    ],
  },
  {
    categoria: "documentos",
    titulo: "Documentos exigidos",
    prioridade: "alta",
    palavras: [
      "documentos necessarios",
      "documentacao",
      "guia",
      "pedido de exame",
      "assinatura",
    ],
  },
  {
    categoria: "rescisao",
    titulo: "Rescisão e encerramento",
    prioridade: "alta",
    palavras: [
      "rescisao",
      "extincao",
      "encerramento",
      "notificacao extrajudicial",
      "cancelamento",
    ],
  },
  {
    categoria: "dados_e_sigilo",
    titulo: "Sigilo e proteção de dados",
    prioridade: "alta",
    palavras: [
      "confidencial",
      "sigilo",
      "protecao de dados",
      "lgpd",
      "seguranca da informacao",
      "delecao dos dados",
    ],
  },
  {
    categoria: "obrigacoes",
    titulo: "Obrigações das partes",
    prioridade: "media",
    palavras: [
      "obrigacoes",
      "obrigacao",
      "responsabilidade",
      "devera",
      "deverao",
      "prestadora",
      "intermediadora",
    ],
  },
  {
    categoria: "contatos",
    titulo: "Contatos identificados",
    prioridade: "media",
    palavras: ["@", "e-mail", "email", "telefone"],
  },
];

function semAcentos(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizarTextoPdf(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/\u000C/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .split("\n")
    .map(linha => linha.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function sha256Pdf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizarNomePdf(nome: string): string {
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const seguro = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
  return (seguro || "contrato.pdf").slice(0, 200);
}

export function validarPdfContrato(buffer: Buffer): void {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("O arquivo PDF está vazio.");
  }
  if (buffer.length > CONTRATOS_PDF_MAX_BYTES) {
    throw new Error("Cada PDF deve ter no máximo 20 MB.");
  }
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))) {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }
}

function primeiraLinhaComPalavra(
  linhas: string[],
  palavras: string[]
): string | null {
  for (const linha of linhas) {
    const normalizada = semAcentos(linha);
    if (palavras.some(palavra => normalizada.includes(palavra))) {
      return linha;
    }
  }
  return null;
}

function trechoParaCategoria(
  linhas: string[],
  palavras: string[],
  limite = 360
): string | null {
  const indice = linhas.findIndex(linha => {
    const normalizada = semAcentos(linha);
    return palavras.some(palavra => normalizada.includes(palavra));
  });
  if (indice < 0) return null;

  const trecho = linhas
    .slice(indice, indice + 3)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return trecho.slice(0, limite);
}

function extrairPartes(linhas: string[]): string | null {
  const candidatas = linhas.filter(linha =>
    /\b(?:LTDA|S\.?A\.?|HOSPITAL|CL[IÍ]NICA|OPERADORA|SEGURADORA)\b/i.test(
      linha
    )
  );
  const partes = candidatas
    .filter((linha, index) => candidatas.indexOf(linha) === index)
    .slice(0, 4);
  if (!partes.length) return null;
  return partes.join("; ").slice(0, 360);
}

function extrairContatos(texto: string): string | null {
  const emails: string[] = Array.from(
    texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
  );
  const unicos = emails
    .filter((email, index) => emails.indexOf(email) === index)
    .slice(0, 8);
  return unicos.length ? unicos.join(", ") : null;
}

export function extrairPontosImportantes(
  texto: string
): ContratoConvenioPonto[] {
  const linhas = texto
    .split("\n")
    .map(linha => linha.trim())
    .filter(Boolean);
  const pontos: ContratoConvenioPonto[] = [];
  const partes = extrairPartes(linhas);
  if (partes) {
    pontos.push({
      categoria: "partes",
      titulo: "Partes identificadas",
      resumo: partes,
      prioridade: "alta",
    });
  }

  for (const regra of CATEGORIAS) {
    if (regra.categoria === "contatos") continue;
    const trecho = trechoParaCategoria(linhas, regra.palavras);
    if (!trecho) continue;
    pontos.push({
      categoria: regra.categoria,
      titulo: regra.titulo,
      resumo: trecho,
      prioridade: regra.prioridade,
    });
  }

  const contatos = extrairContatos(texto);
  if (contatos) {
    pontos.push({
      categoria: "contatos",
      titulo: "E-mails encontrados",
      resumo: contatos,
      prioridade: "media",
    });
  }

  return pontos;
}

export async function lerContratoPdf(
  buffer: Buffer
): Promise<ContratoConvenioPdfLeitura> {
  validarPdfContrato(buffer);
  const resultado = await pdfParse(buffer);
  const textoExtraido = normalizarTextoPdf(resultado.text || "");
  const pontosImportantes = extrairPontosImportantes(textoExtraido);
  return {
    paginas: Number.isInteger(resultado.numpages) ? resultado.numpages : 0,
    textoExtraido,
    pontosImportantes,
    status: textoExtraido.length >= 80 ? "concluido" : "ocr_necessario",
  };
}
