import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { contratosConvenios, contratosConveniosDocumentos, convenios, regrasNegocio } from "../drizzle/schema";
import { buscarPrecosAplicaveis, normalizarDataExecucao, validarDataReferenciaIso } from "./contratosPrecoAplicavel";
import { getDb } from "./db";
import { storagePut, storageGet } from "./storage";
import { criarLeitorContratoPdfArquivo } from "./contratosPdfArquivo";

export const CONTRATOS_PDF_MAX_BYTES = 150 * 1024 * 1024; // 150 MB por PDF
export const CONTRATOS_PDF_MAX_TOTAL_BYTES = 600 * 1024 * 1024; // 600 MB por lote

export type ContratoConvenioPontoCategoria =
  | "partes"
  | "vigencia"
  | "faturamento"
  | "pagamento"
  | "glosa_recurso"
  | "tabelas_valores"
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
      "renovacao",
      "prorrogacao",
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
      "tiss",
      "xml",
      "lote",
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
      "repasse",
    ],
  },
  {
    categoria: "glosa_recurso",
    titulo: "Glosas, auditoria e recursos",
    prioridade: "alta",
    palavras: [
      "glosa",
      "glosas",
      "recurso de glosa",
      "recurso",
      "contestacao",
      "impugnacao",
      "prazo para recurso",
      "deferimento",
      "auditoria medica",
    ],
  },
  {
    categoria: "tabelas_valores",
    titulo: "Tabelas, portes e precificação",
    prioridade: "alta",
    palavras: [
      "cbhpm",
      "tuss",
      "amb",
      "brasindice",
      "simpro",
      "pacote",
      "filme",
      "uco",
      "porte",
      "taxa",
      "diaria",
      "reajuste",
      "ipca",
      "igpm",
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
      "autorizacao",
      "senha",
      "laudo",
      "prontuario",
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
      "descredenciamento",
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
    throw new Error("Cada PDF deve ter no máximo 150 MB.");
  }
  const cabecalho = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (!cabecalho.includes(Buffer.from("%PDF-", "ascii"))) {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }
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
  const partes = new Set<string>();
  for (const linha of linhas) {
    if (/\b(?:LTDA|S\.?A\.?|HOSPITAL|CL[IÍ]NICA|OPERADORA|SEGURADORA)\b/i.test(linha)) {
      partes.add(linha);
      if (partes.size >= 4) break;
    }
  }
  if (!partes.size) return null;
  return Array.from(partes).join("; ").slice(0, 360);
}

function extrairContatos(texto: string): string | null {
  const unicos = new Set<string>();
  // Search only around @, with finite address components. The old unbounded
  // regex backtracked quadratically on long PDF tokens without an address.
  for (const marcador of texto.matchAll(/@/g)) {
    const at = marcador.index!;
    let inicio = at;
    let fim = at + 1;
    while (inicio > 0 && at - inicio < 64 && /[A-Z0-9._%+-]/i.test(texto[inicio - 1])) inicio--;
    if (inicio > 0 && /[A-Z0-9._%+-]/i.test(texto[inicio - 1])) continue;
    while (fim < texto.length && fim - at <= 254 && /[A-Z0-9.-]/i.test(texto[fim])) fim++;
    if (fim < texto.length && /[A-Z0-9.-]/i.test(texto[fim])) continue;
    const email = texto.slice(inicio, fim).match(/^[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/i);
    if (!email) continue;
    unicos.add(email[0]);
    if (unicos.size >= 8) break;
  }
  return unicos.size ? Array.from(unicos).join(", ") : null;
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

const leitorPdfArquivo = criarLeitorContratoPdfArquivo({
  normalizarTexto: normalizarTextoPdf,
  extrairPontos: extrairPontosImportantes,
});

/** File-backed bounded Poppler extraction; resource failures reject, never conclude. */
export async function lerContratoPdfArquivo(
  filePath: string,
  signal?: AbortSignal
): Promise<ContratoConvenioPdfLeitura> {
  return leitorPdfArquivo(filePath, signal);
}

export async function lerContratoPdf(
  buffer: Buffer
): Promise<ContratoConvenioPdfLeitura> {
  validarPdfContrato(buffer);
  try {
    const resultado = await pdfParse(buffer);
    const textoExtraido = normalizarTextoPdf(resultado.text || "");
    const pontosImportantes = extrairPontosImportantes(textoExtraido);
    return {
      paginas: Number.isInteger(resultado.numpages) ? resultado.numpages : 0,
      textoExtraido,
      pontosImportantes,
      status: textoExtraido.length >= 80 ? "concluido" : "ocr_necessario",
    };
  } catch (error) {
    console.warn(
      "[Contratos PDF] Falha ao extrair texto com pdf-parse (provável PDF escaneado ou protegido); marcando como ocr_necessario:",
      (error as Error)?.message || error
    );
    return {
      paginas: 0,
      textoExtraido: "",
      pontosImportantes: [],
      status: "ocr_necessario",
    };
  }
}

export async function ensureContratosConveniosDocumentosTable(): Promise<void> {
  // A tabela contratos_convenios_documentos é garantida pela migração 0141; sem DDL em runtime.
}

export function obterCaminhoLocalPdfContrato(storageKey: string): string {
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const cleanRelKey = storageKey.replace(/^\/+/, "");
  const fullPath = path.resolve(uploadsRoot, cleanRelKey);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Caminho de storage inválido.");
  }
  return fullPath;
}

export async function salvarPdfContratoStorage(
  storageKey: string,
  buffer: Buffer
): Promise<{ url: string; modo: "cloud" }> {
  if (
    !process.env.BUILT_IN_FORGE_API_URL ||
    !process.env.BUILT_IN_FORGE_API_KEY
  ) {
    throw new Error(
      "Storage em nuvem não configurado para persistência durável de PDFs contratuais."
    );
  }
  const cloud = await storagePut(storageKey, buffer, "application/pdf");
  return { url: cloud.url, modo: "cloud" };
}

export async function obterUrlDownloadPdfContrato(
  _storageKey: string,
  documentoId: number
): Promise<string> {
  return `/api/contratos-convenios/documentos/${documentoId}/download`;
}

export type ContextoContratualGlosa = {
  statusContexto: "disponivel" | "indeterminado";
  dataReferencia: string | null;
  possuiContratoAtivo: boolean;
  contratos: Array<{
    id: number;
    convenioId: number;
    convenioNome: string;
    numeroContrato: string | null;
    status: string;
    dataInicio: string | null;
    dataFim: string | null;
    reajusteProposto: string | null;
    observacoes: string | null;
  }>;
  documentos: Array<{
    id: number;
    contratoId: number;
    nomeArquivo: string;
    paginas: number | null;
    status: string;
    pontosImportantes: ContratoConvenioPonto[];
    trechosGlosaETabela: string[];
  }>;
  itensTabelaNegociada: Array<{
    codigoProcedimento: string;
    descricaoProcedimento: string | null;
    valorContratado: string;
    valorFilme: string | null;
    porteAnestesico: string | null;
    requerAutorizacao: string | null;
    nomeTabela: string;
    tipoTabela: string | null;
  }>;
  regrasNegocio: Array<{
    tipoRegra: string;
    nome: string;
    descricao: string | null;
    condicoes: string | null;
    acoes: string | null;
  }>;
  resumoPrompt: string;
};

function extrairTrechosRelevantesParaGlosa(
  textoExtraido: string,
  codigosProcedimento: string[] = []
): string[] {
  if (!textoExtraido) return [];
  const linhas = textoExtraido
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const palavrasChave = [
    "glosa",
    "recurso",
    "contestacao",
    "auditoria",
    "prazo",
    "pagamento",
    "faturamento",
    "autorizacao",
    "senha",
    "pacote",
    "cbhpm",
    "tuss",
    "brasindice",
    "simpro",
    "taxa",
    "diaria",
    "material",
    "medicamento",
    "opme",
    ...codigosProcedimento.map(c => c.trim().toLowerCase()).filter(Boolean),
  ];

  const trechos: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const norm = semAcentos(linhas[i]);
    if (palavrasChave.some(p => norm.includes(p))) {
      const bloco = linhas
        .slice(Math.max(0, i - 1), Math.min(linhas.length, i + 3))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 380);
      if (bloco && !trechos.some(t => t.includes(bloco.slice(0, 80)))) {
        trechos.push(bloco);
      }
      if (trechos.length >= 6) break;
    }
  }
  return trechos;
}

export class ContextoContratualIndisponivelError extends Error {
  readonly code = "CONTEXTO_CONTRATUAL_INDISPONIVEL";
  constructor() {
    super("Contexto contratual indisponível ou incompleto; geração de IA bloqueada.");
    this.name = "ContextoContratualIndisponivelError";
  }
}

function pontoContratualValido(valor: unknown): valor is ContratoConvenioPonto {
  if (!valor || typeof valor !== "object") return false;
  return "categoria" in valor && typeof valor.categoria === "string" &&
    ["partes", "vigencia", "faturamento", "pagamento", "glosa_recurso", "tabelas_valores", "documentos", "obrigacoes", "rescisao", "dados_e_sigilo", "contatos"].includes(valor.categoria) &&
    "titulo" in valor && typeof valor.titulo === "string" &&
    "resumo" in valor && typeof valor.resumo === "string" &&
    "prioridade" in valor && ["alta", "media", "baixa"].includes(String(valor.prioridade));
}

export async function obterContextoContratualParaGlosa(params: {
  estabelecimentoId: number;
  convenioId?: number;
  convenioNome?: string;
  codigosProcedimento?: string[];
  dataReferencia?: string;
}): Promise<ContextoContratualGlosa> {
  const dataReferencia = params.dataReferencia === undefined ? undefined : validarDataReferenciaIso(params.dataReferencia);
  const vazio: ContextoContratualGlosa = {
    statusContexto: dataReferencia ? "disponivel" : "indeterminado",
    dataReferencia: dataReferencia ?? null,
    possuiContratoAtivo: false,
    contratos: [],
    documentos: [],
    itensTabelaNegociada: [],
    regrasNegocio: [],
    resumoPrompt: dataReferencia ? "" : "BASE CONTRATUAL INDETERMINADA: data de execução ausente ou múltiplas datas. Não citar cláusulas ou preços atuais como vigentes no atendimento.",
  };

  // Ausência de data nunca significa hoje; callers históricos devem enviar a execução.
  if (!dataReferencia) return vazio;
  if (!Number.isSafeInteger(params.estabelecimentoId) || params.estabelecimentoId <= 0) {
    throw new Error("estabelecimentoId deve ser um ID positivo seguro");
  }
  if (params.convenioId !== undefined && (!Number.isSafeInteger(params.convenioId) || params.convenioId <= 0)) {
    throw new Error("convenioId deve ser um ID positivo seguro");
  }
  try {
    await ensureContratosConveniosDocumentosTable();
    const db = await getDb();
    if (!db) throw new ContextoContratualIndisponivelError();

    const { estabelecimentoId, convenioId, convenioNome } = params;
    const codigosLimpos = Array.from(
      new Set(
        (params.codigosProcedimento ?? [])
          .map(c => String(c || "").trim())
          .filter(Boolean)
      )
    );

    // 1. Localizar contratos vinculados estritamente ao estabelecimento, convênio, status ativo e vigência
    const filtroConvenio = convenioId
      ? eq(convenios.id, convenioId)
      : convenioNome?.trim() ? eq(convenios.nome, convenioNome.trim()) : undefined;
    if (!filtroConvenio) return { ...vazio, statusContexto: "indeterminado", resumoPrompt: "BASE CONTRATUAL INDETERMINADA: convênio não informado. Não aplicar contratos de outros convênios." };
    const conveniosEncontrados = await db.select({ id: convenios.id }).from(convenios).where(and(
      filtroConvenio, eq(convenios.ativo, "sim"),
      or(eq(convenios.estabelecimentoId, estabelecimentoId), isNull(convenios.estabelecimentoId)),
    ));
    // Nome ambíguo também não autoriza selecionar arbitrariamente um convênio.
    if (conveniosEncontrados.length > 1) return { ...vazio, statusContexto: "indeterminado", resumoPrompt: "BASE CONTRATUAL INDETERMINADA: nome de convênio ambíguo; informe convenioId." };
    if (!conveniosEncontrados.length) return vazio;
    const convenioResolvido = conveniosEncontrados[0].id;
    const contratos = await db.select({
      id: contratosConvenios.id, convenioId: contratosConvenios.convenioId,
      convenioNome: convenios.nome, numeroContrato: contratosConvenios.numeroContrato,
      status: contratosConvenios.status, dataInicio: contratosConvenios.dataInicio,
      dataFim: contratosConvenios.dataFim, reajusteProposto: contratosConvenios.reajusteProposto,
      observacoes: contratosConvenios.observacoes,
    }).from(contratosConvenios).innerJoin(convenios, eq(convenios.id, contratosConvenios.convenioId)).where(and(
      eq(contratosConvenios.estabelecimentoId, estabelecimentoId),
      eq(contratosConvenios.convenioId, convenioResolvido), eq(convenios.ativo, "sim"),
      inArray(contratosConvenios.status, ["ativo", "vencendo", "renovado"]),
      or(isNull(contratosConvenios.dataInicio), sql`${contratosConvenios.dataInicio} <= ${dataReferencia}`),
      or(isNull(contratosConvenios.dataFim), sql`${contratosConvenios.dataFim} >= ${dataReferencia}`),
    )).orderBy(sql`FIELD(${contratosConvenios.status}, 'ativo', 'renovado', 'vencendo')`, desc(contratosConvenios.updatedAt), desc(contratosConvenios.id));
    const contratoIds = contratos.map(c => c.id);

    // 2. Buscar documentos PDF anexados e concluídos desses contratos vigentes
    let documentos: ContextoContratualGlosa["documentos"] = [];
    if (contratoIds.length > 0) {
      const docsRows = await db.select().from(contratosConveniosDocumentos).where(and(
        inArray(contratosConveniosDocumentos.contratoId, contratoIds),
        eq(contratosConveniosDocumentos.estabelecimentoId, estabelecimentoId),
        eq(contratosConveniosDocumentos.status, "concluido"),
      )).orderBy(desc(contratosConveniosDocumentos.createdAt), desc(contratosConveniosDocumentos.id));
      documentos = docsRows.map(doc => {
        let pontos: ContratoConvenioPonto[] = [];
        try {
          const pontosExtraidos: unknown = typeof doc.pontosImportantes === "string"
            ? JSON.parse(doc.pontosImportantes) : doc.pontosImportantes ?? [];
          if (!Array.isArray(pontosExtraidos) || !pontosExtraidos.every(pontoContratualValido)) {
            throw new ContextoContratualIndisponivelError();
          }
          pontos = pontosExtraidos;
        } catch {
          throw new ContextoContratualIndisponivelError();
        }
        return {
          id: Number(doc.id),
          contratoId: Number(doc.contratoId),
          nomeArquivo: String(doc.nomeArquivo || ""),
          paginas: doc.paginas ? Number(doc.paginas) : null,
          status: String(doc.status || ""),
          pontosImportantes: pontos,
          trechosGlosaETabela: extrairTrechosRelevantesParaGlosa(
            String(doc.textoExtraido || ""),
            codigosLimpos
          ),
        };
      });
    }

    // 3. Buscar itens negociados nas tabelas físicas (tabelasPreco)
    let itensTabelaNegociada: ContextoContratualGlosa["itensTabelaNegociada"] = [];
    if (contratoIds.length > 0 && codigosLimpos.length > 0) {
      const itensRows = await buscarPrecosAplicaveis(db, { estabelecimentoId, convenioId: convenioResolvido, codigos: codigosLimpos, dataReferencia });
      itensTabelaNegociada = itensRows.map(row => ({
        codigoProcedimento: row.codigo.trim(), descricaoProcedimento: row.nome,
        valorContratado: row.valor, valorFilme: null, porteAnestesico: row.porte,
        requerAutorizacao: null, nomeTabela: `Tabela ${row.tipo.toUpperCase()}`, tipoTabela: row.tipo,
      }));
    }

    // 4. Buscar regras de negócio ativas na tabela física regrasNegocio
    let regrasContratuais: ContextoContratualGlosa["regrasNegocio"] = [];
    if (contratoIds.length > 0) {
      regrasContratuais = await db.select({
        tipoRegra: regrasNegocio.tipoVerificacao, nome: regrasNegocio.nome,
        descricao: regrasNegocio.descricao, condicoes: regrasNegocio.codigoProcedimentoPrincipal,
        acoes: regrasNegocio.acaoInconsistencia,
      }).from(regrasNegocio).where(and(
        eq(regrasNegocio.convenioId, convenioResolvido), eq(regrasNegocio.ativo, "sim"),
        or(eq(regrasNegocio.estabelecimentoId, estabelecimentoId), isNull(regrasNegocio.estabelecimentoId)),
      )).orderBy(regrasNegocio.prioridade, regrasNegocio.id);
    }

    // 5. Construir resumo estruturado para o Prompt da IA
    const blocosPrompt: string[] = [`DATA DE REFERÊNCIA CONTRATUAL: ${dataReferencia.split("-").reverse().join("/")} (execução do atendimento).`];
    if (contratos.length > 0) {
      blocosPrompt.push(
        "CONTRATOS VINCULADOS AO CONVÊNIO:\n" +
          contratos
            .map(
              c =>
                `- Convênio: ${c.convenioNome} | Contrato Nº: ${c.numeroContrato || "S/N"} | Status: ${c.status}${c.observacoes ? ` | Obs: ${String(c.observacoes).slice(0, 200)}` : ""}`
            )
            .join("\n")
      );
    }

    if (documentos.length > 0) {
      const linhasDoc: string[] = [];
      for (const doc of documentos.slice(0, 4)) {
        const pontosTxt = doc.pontosImportantes
          .slice(0, 6)
          .map(p => `[${p.titulo}] ${p.resumo}`)
          .join(" | ");
        const trechosTxt = doc.trechosGlosaETabela.slice(0, 4).join(" // ");
        linhasDoc.push(
          `* PDF "${doc.nomeArquivo}": ${pontosTxt}${trechosTxt ? `\n  Cláusulas extraídas: ${trechosTxt}` : ""}`
        );
      }
      blocosPrompt.push(
        "CLÁUSULAS E PONTOS EXTRAÍDOS DOS PDFs CONTRATUAIS:\n" +
          linhasDoc.join("\n")
      );
    }

    if (itensTabelaNegociada.length > 0) {
      blocosPrompt.push(
        "VALORES CONTRATADOS NA TABELA DE PREÇOS DO CONVÊNIO:\n" +
          itensTabelaNegociada
            .map(
              it =>
                `- Código ${it.codigoProcedimento} (${it.descricaoProcedimento || "Procedimento"}): Valor Contratado R$ ${Number(it.valorContratado).toFixed(2)} na tabela ${it.nomeTabela}${it.tipoTabela ? ` (${it.tipoTabela})` : ""}${it.requerAutorizacao ? ` | Requer Autorização: ${it.requerAutorizacao}` : ""}`
            )
            .join("\n")
      );
    }

    if (regrasContratuais.length > 0) {
      blocosPrompt.push(
        "REGRAS CONTRATUAIS DE NEGÓCIO CADASTRADAS:\n" +
          regrasContratuais
            .map(
              r =>
                `- [${r.tipoRegra}] ${r.nome}: ${r.descricao || ""} | Ação: ${r.acoes || ""}`
            )
            .join("\n")
      );
    }

    return {
      statusContexto: "disponivel",
      dataReferencia,
      possuiContratoAtivo: contratos.length > 0,
      contratos: contratos.map(c => ({
        id: Number(c.id),
        convenioId: Number(c.convenioId),
        convenioNome: String(c.convenioNome || "Convênio"),
        numeroContrato: c.numeroContrato ? String(c.numeroContrato) : null,
        status: String(c.status || "ativo"),
        dataInicio: normalizarDataExecucao(c.dataInicio) ?? null,
        dataFim: normalizarDataExecucao(c.dataFim) ?? null,
        reajusteProposto: c.reajusteProposto
          ? String(c.reajusteProposto)
          : null,
        observacoes: c.observacoes ? String(c.observacoes) : null,
      })),
      documentos,
      itensTabelaNegociada,
      regrasNegocio: regrasContratuais,
      resumoPrompt: blocosPrompt.join("\n\n"),
    };
  } catch (error) {
    // Não converter falha SQL em ausência de contratos; protege todos os callers da IA.
    console.warn("[Contexto Contratual Glosa] Contexto indisponível; geração de IA bloqueada.");
    throw new ContextoContratualIndisponivelError();
  }
}

export async function analisarClausulasContratuaisComIA(
  textoExtraido: string
): Promise<ContratoConvenioPonto[]> {
  const pontosBase = extrairPontosImportantes(textoExtraido);
  if (!textoExtraido || textoExtraido.trim().length < 60) {
    return pontosBase;
  }

  try {
    const { invokeLLM } = await import("./_core/llm");
    const trechosFoco = extrairTrechosRelevantesParaGlosa(textoExtraido);
    const amostraTexto = [
      textoExtraido.slice(0, 6000),
      trechosFoco.length > 0 ? `\nTRECHOS DE GLOSA E TABELA:\n${trechosFoco.join("\n")}` : "",
    ].join("\n");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você é um auditor jurídico e especialista em contratos hospitalares com operadoras de saúde (ANS/TISS). Extraia os pontos contratuais mais importantes para Faturamento, Auditoria e Recurso de Glosa. Responda APENAS em JSON válido.",
        },
        {
          role: "user",
          content: `Analise o texto do contrato abaixo e extraia cláusulas estruturadas (vigência, faturamento, pagamento, glosa_recurso, tabelas_valores, documentos, obrigacoes, rescisao):\n\n${amostraTexto}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pontos_contrato",
          strict: true,
          schema: {
            type: "object",
            properties: {
              pontos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    categoria: {
                      type: "string",
                      enum: [
                        "partes",
                        "vigencia",
                        "faturamento",
                        "pagamento",
                        "glosa_recurso",
                        "tabelas_valores",
                        "documentos",
                        "obrigacoes",
                        "rescisao",
                        "dados_e_sigilo",
                        "contatos",
                      ],
                    },
                    titulo: { type: "string" },
                    resumo: { type: "string" },
                    prioridade: {
                      type: "string",
                      enum: ["alta", "media", "baixa"],
                    },
                  },
                  required: ["categoria", "titulo", "resumo", "prioridade"],
                  additionalProperties: false,
                },
              },
            },
            required: ["pontos"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    const contentText = typeof content === "string" ? content : "";
    if (!contentText) return pontosBase;
    const parsed = JSON.parse(contentText);
    if (Array.isArray(parsed?.pontos) && parsed.pontos.length > 0) {
      return parsed.pontos as ContratoConvenioPonto[];
    }
    return pontosBase;
  } catch {
    return pontosBase;
  }
}

export type ResultadoOcrDocumentoContrato = {
  id: number;
  nomeArquivo: string;
  status: "concluido" | "ocr_necessario" | "erro";
  paginas: number;
  textoExtraido: string;
  pontosImportantes: ContratoConvenioPonto[];
  ocrExecutado: boolean;
  motivo?: "storage_indisponivel" | "ia_indisponivel" | "texto_insuficiente";
};

function normalizarPontosExistentes(valor: unknown): ContratoConvenioPonto[] {
  try {
    const lista = typeof valor === "string" ? JSON.parse(valor) : valor;
    if (!Array.isArray(lista)) return [];
    return lista.filter(pontoContratualValido);
  } catch {
    return [];
  }
}

export async function executarOcrDocumentoContrato(
  documento: {
    id: number;
    contratoId: number;
    estabelecimentoId: number;
    nomeArquivo: string;
    storageKey: string;
    paginas: number | null;
    status: string;
    textoExtraido: string | null;
    pontosImportantes: unknown;
  },
  deps?: {
    obterUrl?: (storageKey: string) => Promise<{ key: string; url: string }>;
    chamarLLM?: typeof import("./_core/llm").invokeLLM;
    database?: Awaited<ReturnType<typeof getDb>>;
  }
): Promise<ResultadoOcrDocumentoContrato> {
  const pontosAtuais = normalizarPontosExistentes(documento.pontosImportantes);
  const textoAtual = normalizarTextoPdf(documento.textoExtraido || "");
  const paginasAtuais =
    documento.paginas && documento.paginas > 0 ? Number(documento.paginas) : 0;

  let pdfUrl = "";
  try {
    const obterUrlFn = deps?.obterUrl ?? storageGet;
    const cloud = await obterUrlFn(documento.storageKey);
    if (cloud?.url) {
      pdfUrl = cloud.url;
    }
  } catch {
    // Tenta fallback local caso o arquivo exista no disco local
  }

  if (!pdfUrl) {
    try {
      const localPath = obterCaminhoLocalPdfContrato(documento.storageKey);
      if (existsSync(localPath)) {
        const stat = await fs.stat(localPath);
        if (stat.isFile() && stat.size > 0 && stat.size <= 25 * 1024 * 1024) {
          const buf = await fs.readFile(localPath);
          pdfUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
        }
      }
    } catch {
      // Sem arquivo local disponível
    }
  }

  if (!pdfUrl) {
    return {
      id: documento.id,
      nomeArquivo: documento.nomeArquivo,
      status:
        documento.status === "concluido" ? "concluido" : "ocr_necessario",
      paginas: paginasAtuais,
      textoExtraido: textoAtual,
      pontosImportantes: pontosAtuais,
      ocrExecutado: false,
      motivo: "storage_indisponivel",
    };
  }

  let parsed: any;
  try {
    const invokeLLMFn =
      deps?.chamarLLM ?? (await import("./_core/llm")).invokeLLM;
    const response = await invokeLLMFn({
      messages: [
        {
          role: "system",
          content:
            "Você é um motor de OCR jurídico-hospitalar de alta precisão e auditor especialista em contratos de operadoras de saúde (ANS/TISS/TUSS/CBHPM/Brasíndice/Simpro). Este arquivo PDF é digitalizado (imagem escaneada). Faça a leitura visual completa (OCR) de todas as páginas do documento e extraia: (1) textoTranscrito: transcrição textual fiel e detalhada do conteúdo do documento (partes, vigência, objeto, prazos de faturamento e pagamento, prazos e regras de recurso de glosa, reajustes, índices, obrigações, rescisão, contatos e anexos). IMPORTANTE PARA TABELAS DE PREÇOS E PROCEDIMENTOS: Sempre que houver tabelas de procedimentos, pacotes, diárias, taxas, gases, materiais/medicamentos ou portes no PDF escaneado, transcreva cada linha no textoTranscrito no formato padronizado 'CODIGO - DESCRICAO DO PROCEDIMENTO - R$ VALOR' (exemplo: '10101012 - Consulta em consultório - R$ 150,00') para que o motor determinístico de auditoria de XML e Glosas indexe todos os códigos e preços; (2) paginasEstimadas: número inteiro de páginas lidas; (3) pontos: cláusulas e regras estruturadas por categoria. Responda APENAS em JSON válido seguindo estritamente o schema.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Realize o OCR completo (leitura visual do PDF digitalizado) e extraia o texto integral, as cláusulas contratuais e todos os itens/valores de tabelas do arquivo "${documento.nomeArquivo}":`,
            },
            {
              type: "file_url",
              file_url: {
                url: pdfUrl,
                mime_type: "application/pdf",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ocr_contrato_hospitalar",
          strict: true,
          schema: {
            type: "object",
            properties: {
              textoTranscrito: { type: "string" },
              paginasEstimadas: { type: "number" },
              pontos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    categoria: {
                      type: "string",
                      enum: [
                        "partes",
                        "vigencia",
                        "faturamento",
                        "pagamento",
                        "glosa_recurso",
                        "tabelas_valores",
                        "documentos",
                        "obrigacoes",
                        "rescisao",
                        "dados_e_sigilo",
                        "contatos",
                      ],
                    },
                    titulo: { type: "string" },
                    resumo: { type: "string" },
                    prioridade: {
                      type: "string",
                      enum: ["alta", "media", "baixa"],
                    },
                  },
                  required: ["categoria", "titulo", "resumo", "prioridade"],
                  additionalProperties: false,
                },
              },
            },
            required: ["textoTranscrito", "paginasEstimadas", "pontos"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    const contentText = typeof content === "string" ? content : "";
    if (!contentText) throw new Error("Resposta OCR vazia");
    parsed = JSON.parse(contentText);
  } catch {
    return {
      id: documento.id,
      nomeArquivo: documento.nomeArquivo,
      status:
        documento.status === "concluido" ? "concluido" : "ocr_necessario",
      paginas: paginasAtuais,
      textoExtraido: textoAtual,
      pontosImportantes: pontosAtuais,
      ocrExecutado: false,
      motivo: "ia_indisponivel",
    };
  }

  const pontosIA: ContratoConvenioPonto[] = Array.isArray(parsed?.pontos)
    ? parsed.pontos
        .filter(pontoContratualValido)
        .map((p: ContratoConvenioPonto) => ({
          categoria: p.categoria,
          titulo: p.titulo.trim().slice(0, 160),
          resumo: p.resumo.trim().slice(0, 600),
          prioridade: p.prioridade,
        }))
        .filter((p: ContratoConvenioPonto) => p.titulo && p.resumo)
    : [];

  let textoBruto =
    typeof parsed?.textoTranscrito === "string" ? parsed.textoTranscrito : "";
  if (normalizarTextoPdf(textoBruto).length < 80 && pontosIA.length > 0) {
    const complemento = pontosIA
      .map(p => `${p.titulo}: ${p.resumo}`)
      .join("\n");
    textoBruto = [textoBruto, complemento].filter(Boolean).join("\n");
  }

  const textoExtraido = normalizarTextoPdf(textoBruto || textoAtual);
  const pontosDeterministicos = extrairPontosImportantes(textoExtraido);
  const chavesVistas = new Set(
    pontosIA.map(p => `${p.categoria}:${p.titulo.toLowerCase()}`)
  );
  const pontosFinais: ContratoConvenioPonto[] = [...pontosIA];
  for (const ponto of pontosDeterministicos) {
    const chave = `${ponto.categoria}:${ponto.titulo.toLowerCase()}`;
    if (!chavesVistas.has(chave)) {
      chavesVistas.add(chave);
      pontosFinais.push(ponto);
    }
  }

  const novoStatus: "concluido" | "ocr_necessario" =
    textoExtraido.length >= 80 ? "concluido" : "ocr_necessario";
  const paginasEstimadas =
    typeof parsed?.paginasEstimadas === "number" &&
    Number.isFinite(parsed.paginasEstimadas) &&
    parsed.paginasEstimadas > 0
      ? Math.min(512, Math.round(parsed.paginasEstimadas))
      : 0;
  const paginasFinais = paginasAtuais > 0 ? paginasAtuais : paginasEstimadas;

  const db = deps?.database !== undefined ? deps.database : await getDb();
  if (db && (novoStatus === "concluido" || pontosFinais.length > 0)) {
    await db
      .update(contratosConveniosDocumentos)
      .set({
        textoExtraido,
        pontosImportantes: pontosFinais,
        status: novoStatus,
        paginas: paginasFinais > 0 ? paginasFinais : documento.paginas,
        erroProcessamento: null,
      })
      .where(
        and(
          eq(contratosConveniosDocumentos.id, documento.id),
          eq(contratosConveniosDocumentos.contratoId, documento.contratoId),
          eq(
            contratosConveniosDocumentos.estabelecimentoId,
            documento.estabelecimentoId
          )
        )
      );
  }

  return {
    id: documento.id,
    nomeArquivo: documento.nomeArquivo,
    status: novoStatus,
    paginas: paginasFinais,
    textoExtraido,
    pontosImportantes: pontosFinais,
    ocrExecutado: novoStatus === "concluido",
    ...(novoStatus !== "concluido" ? { motivo: "texto_insuficiente" } : {}),
  };
}

export async function executarOcrDocumentosContrato(
  params: {
    contratoId: number;
    estabelecimentoId?: number;
  },
  deps?: {
    obterUrl?: (storageKey: string) => Promise<{ key: string; url: string }>;
    chamarLLM?: typeof import("./_core/llm").invokeLLM;
    database?: Awaited<ReturnType<typeof getDb>>;
  }
): Promise<{
  contratoId: number;
  totalPendentesOcr: number;
  concluidos: number;
  permanecemOcr: number;
  documentos: ResultadoOcrDocumentoContrato[];
}> {
  await ensureContratosConveniosDocumentosTable();
  const db = deps?.database !== undefined ? deps.database : await getDb();
  if (!db) {
    throw new Error("Banco de dados indisponível.");
  }

  let estabelecimentoId = params.estabelecimentoId;
  if (!estabelecimentoId) {
    const [contrato] = await db
      .select({ estabelecimentoId: contratosConvenios.estabelecimentoId })
      .from(contratosConvenios)
      .where(eq(contratosConvenios.id, params.contratoId))
      .limit(1);
    if (!contrato) {
      return {
        contratoId: params.contratoId,
        totalPendentesOcr: 0,
        concluidos: 0,
        permanecemOcr: 0,
        documentos: [],
      };
    }
    estabelecimentoId = contrato.estabelecimentoId;
  }

  const docs = await db
    .select()
    .from(contratosConveniosDocumentos)
    .where(
      and(
        eq(contratosConveniosDocumentos.contratoId, params.contratoId),
        eq(contratosConveniosDocumentos.estabelecimentoId, estabelecimentoId)
      )
    )
    .orderBy(desc(contratosConveniosDocumentos.createdAt));

  const pendentes = docs.filter(
    d =>
      d.status === "ocr_necessario" ||
      (d.status === "concluido" && (d.textoExtraido ?? "").trim().length < 80)
  );

  const resultados: ResultadoOcrDocumentoContrato[] = [];
  for (const doc of pendentes) {
    const res = await executarOcrDocumentoContrato(doc, {
      ...deps,
      database: db,
    });
    resultados.push(res);
  }

  return {
    contratoId: params.contratoId,
    totalPendentesOcr: pendentes.length,
    concluidos: resultados.filter(r => r.status === "concluido").length,
    permanecemOcr: resultados.filter(r => r.status !== "concluido").length,
    documentos: resultados,
  };
}

