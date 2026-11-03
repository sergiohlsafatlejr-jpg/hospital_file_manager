import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { storagePut, storageGet } from "./storage";

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
    texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
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

export async function obterContextoContratualParaGlosa(params: {
  estabelecimentoId: number;
  convenioId?: number;
  convenioNome?: string;
  codigosProcedimento?: string[];
}): Promise<ContextoContratualGlosa> {
  const vazio: ContextoContratualGlosa = {
    possuiContratoAtivo: false,
    contratos: [],
    documentos: [],
    itensTabelaNegociada: [],
    regrasNegocio: [],
    resumoPrompt: "",
  };

  try {
    await ensureContratosConveniosDocumentosTable();
    const db = await getDb();
    if (!db) return vazio;

    const { estabelecimentoId, convenioId, convenioNome } = params;
    const codigosLimpos = Array.from(
      new Set(
        (params.codigosProcedimento ?? [])
          .map(c => String(c || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 40);

    // 1. Localizar contratos vinculados estritamente ao estabelecimento, convênio, status ativo e vigência
    let filtroConvenioSql = "";
    if (convenioId && convenioId > 0) {
      filtroConvenioSql = `AND cc.convenioId = ${Number(convenioId)}`;
    } else if (convenioNome && convenioNome.trim().length >= 2) {
      const termoSeguro = convenioNome
        .trim()
        .replace(/['"\\%_]/g, "")
        .slice(0, 60);
      if (termoSeguro) {
        filtroConvenioSql = `AND c.nome = '${termoSeguro}'`;
      }
    }

    if (!filtroConvenioSql) {
      return vazio;
    }

    const [contratosRows] = await db.execute(
      sql.raw(`
        SELECT cc.id, cc.convenioId, COALESCE(c.nome, 'Convênio') AS convenioNome,
               cc.numeroContrato, cc.status, cc.dataInicio, cc.dataFim,
               cc.reajusteProposto, cc.observacoes
        FROM contratos_convenios cc
        INNER JOIN convenios c ON c.id = cc.convenioId
        WHERE cc.estabelecimentoId = ${Number(estabelecimentoId)}
          AND cc.status IN ('ativo', 'vencendo', 'renovado')
          AND (cc.dataInicio IS NULL OR cc.dataInicio <= CURDATE())
          AND (cc.dataFim IS NULL OR cc.dataFim >= CURDATE())
          ${filtroConvenioSql}
        ORDER BY FIELD(cc.status, 'ativo', 'renovado', 'vencendo'), cc.updatedAt DESC
        LIMIT 5
      `)
    );

    const contratos = (contratosRows as unknown as any[]) ?? [];

    const contratoIds = contratos.map(c => Number(c.id)).filter(Boolean);
    const convenioIds = Array.from(
      new Set(contratos.map(c => Number(c.convenioId)).filter(Boolean))
    );

    // 2. Buscar documentos PDF anexados e concluídos desses contratos vigentes
    let documentos: ContextoContratualGlosa["documentos"] = [];
    if (contratoIds.length > 0) {
      const [docsRows] = await db.execute(
        sql.raw(`
          SELECT id, contratoId, nomeArquivo, paginas, status, pontosImportantes, textoExtraido
          FROM contratos_convenios_documentos
          WHERE contratoId IN (${contratoIds.join(",")})
            AND estabelecimentoId = ${Number(estabelecimentoId)}
            AND status = 'concluido'
          ORDER BY createdAt DESC
          LIMIT 10
        `)
      );
      documentos = ((docsRows as unknown as any[]) ?? []).map(doc => {
        let pontos: ContratoConvenioPonto[] = [];
        try {
          pontos =
            typeof doc.pontosImportantes === "string"
              ? JSON.parse(doc.pontosImportantes)
              : Array.isArray(doc.pontosImportantes)
                ? doc.pontosImportantes
                : [];
        } catch {
          pontos = [];
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
    if (convenioIds.length > 0 && codigosLimpos.length > 0) {
      const codigosSql = codigosLimpos
        .map(c => `'${c.replace(/'/g, "''")}'`)
        .join(",");
      try {
        const [itensRows] = await db.execute(
          sql.raw(`
            SELECT tp.codigo AS codigoProcedimento,
                   tp.nome AS descricaoProcedimento,
                   tp.valor AS valorContratado,
                   NULL AS valorFilme,
                   tp.porte AS porteAnestesico,
                   NULL AS requerAutorizacao,
                   CONCAT('Tabela ', UPPER(tp.tipo)) AS nomeTabela,
                   tp.tipo AS tipoTabela
            FROM tabelasPreco tp
            WHERE tp.convenioId IN (${convenioIds.join(",")})
              AND (tp.estabelecimentoId = ${Number(estabelecimentoId)} OR tp.estabelecimentoId IS NULL)
              AND tp.ativo = 'sim'
              AND tp.codigo IN (${codigosSql})
            LIMIT 30
          `)
        );
        itensTabelaNegociada = ((itensRows as unknown as any[]) ?? []).map(row => ({
          codigoProcedimento: String(row.codigoProcedimento),
          descricaoProcedimento: row.descricaoProcedimento
            ? String(row.descricaoProcedimento)
            : null,
          valorContratado: String(row.valorContratado ?? "0"),
          valorFilme: row.valorFilme ? String(row.valorFilme) : null,
          porteAnestesico: row.porteAnestesico
            ? String(row.porteAnestesico)
            : null,
          requerAutorizacao: row.requerAutorizacao
            ? String(row.requerAutorizacao)
            : null,
          nomeTabela: String(row.nomeTabela || "Tabela Negociada"),
          tipoTabela: row.tipoTabela ? String(row.tipoTabela) : null,
        }));
      } catch {
        // Tabela opcional se ainda não populada
      }
    }

    // 4. Buscar regras de negócio ativas na tabela física regrasNegocio
    let regrasNegocio: ContextoContratualGlosa["regrasNegocio"] = [];
    if (convenioIds.length > 0) {
      try {
        const [regrasRows] = await db.execute(
          sql.raw(`
            SELECT tipoVerificacao AS tipoRegra,
                   nome,
                   descricao,
                   codigoProcedimentoPrincipal AS condicoes,
                   mensagemAlerta AS acoes
            FROM regrasNegocio
            WHERE convenioId IN (${convenioIds.join(",")})
              AND (estabelecimentoId = ${Number(estabelecimentoId)} OR estabelecimentoId IS NULL)
              AND ativo = 'sim'
            LIMIT 10
          `)
        );
        regrasNegocio = ((regrasRows as unknown as any[]) ?? []).map(r => ({
          tipoRegra: String(r.tipoRegra || ""),
          nome: String(r.nome || ""),
          descricao: r.descricao ? String(r.descricao) : null,
          condicoes: r.condicoes ? String(r.condicoes) : null,
          acoes: r.acoes ? String(r.acoes) : null,
        }));
      } catch {
        // Opcional
      }
    }

    // 5. Construir resumo estruturado para o Prompt da IA
    const blocosPrompt: string[] = [];
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

    if (regrasNegocio.length > 0) {
      blocosPrompt.push(
        "REGRAS CONTRATUAIS DE NEGÓCIO CADASTRADAS:\n" +
          regrasNegocio
            .map(
              r =>
                `- [${r.tipoRegra}] ${r.nome}: ${r.descricao || r.acoes || ""}`
            )
            .join("\n")
      );
    }

    return {
      possuiContratoAtivo: contratos.length > 0,
      contratos: contratos.map(c => ({
        id: Number(c.id),
        convenioId: Number(c.convenioId),
        convenioNome: String(c.convenioNome || "Convênio"),
        numeroContrato: c.numeroContrato ? String(c.numeroContrato) : null,
        status: String(c.status || "ativo"),
        dataInicio: c.dataInicio ? String(c.dataInicio) : null,
        dataFim: c.dataFim ? String(c.dataFim) : null,
        reajusteProposto: c.reajusteProposto
          ? String(c.reajusteProposto)
          : null,
        observacoes: c.observacoes ? String(c.observacoes) : null,
      })),
      documentos,
      itensTabelaNegociada,
      regrasNegocio,
      resumoPrompt: blocosPrompt.join("\n\n"),
    };
  } catch (error) {
    console.warn(
      "[Contexto Contratual Glosa] Erro ao carregar contexto contratual:",
      (error as Error)?.message || error
    );
    return vazio;
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
