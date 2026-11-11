import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  contratosConvenios,
  contratosConveniosDocumentos,
  convenios,
  estabelecimentos,
  regrasNegocio,
  tabelasPreco,
} from "../drizzle/schema";
import {
  extrairPontosImportantes,
  type ContratoConvenioPonto,
  type ContratoConvenioPontoCategoria,
} from "./contratosConveniosPdfService";
import { getDb } from "./db";
import {
  buscarPrecosPorItens,
  normalizarDataExecucao,
} from "./contratosPrecoAplicavel";
import {
  centavosDossie,
  divergenciaDossie,
  exigirUmaGravacao,
  operacaoDossieSegura,
} from "./contratosDossieIssue182Integridade";

export type SemaforoRiscoContrato = "RED" | "YEL" | "GRN";

export type TipoDocumentoDossie =
  | "Contrato"
  | "Aditivo"
  | "Tabela"
  | "Circular"
  | "Outro";

export interface DocumentoDossieContratual {
  id: number;
  data: string;
  arquivo: string;
  tipo: TipoDocumentoDossie;
  resumo: string;
  status: string;
  paginas: number;
  statusLeitura: "concluido" | "ocr_necessario" | "processando" | "erro";
}

export interface DossieContratualConvenio {
  contratoId: number;
  convenioId: number;
  convenio: string;
  estabelecimentoId: number;
  estabelecimentoNome: string;
  numeroContrato: string | null;
  statusContrato: string;
  arquivo_saida: string;
  dados_gerais: Array<[string, string]>;
  documentos: DocumentoDossieContratual[];
  clausulas: Array<[string, string]>;
  remuneracao: Array<[string, string, string]>;
  reajustes: Array<[string, string, string, string]>;
  tabela_valores: {
    titulo: string;
    colunas: string[];
    linhas: Array<[string, string, number, string]>;
  };
  pontos_atencao: Array<[string, string, SemaforoRiscoContrato]>;
  pendencias: string[];
  resumo_executivo: {
    totalDocumentos: number;
    documentosConcluidos: number;
    documentosOcr: number;
    totalAlertasRed: number;
    totalAlertasYel: number;
    totalOportunidadesGrn: number;
    totalItensTabelaExtraidos: number;
    totalItensTabelaPortal: number;
    prazoFaturamento: string;
    prazoPagamento: string;
    prazoRecursoGlosa: string;
    indiceReajuste: string;
  };
}

function semAcentos(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatarDataPtBr(valor: unknown): string {
  if (!valor) return "Não informada";
  if (valor instanceof Date && Number.isFinite(valor.getTime())) {
    const iso = valor.toISOString().slice(0, 10);
    return iso.split("-").reverse().join("/");
  }
  const str = String(valor).trim();
  const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
  const matchBr = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (matchBr) return `${matchBr[1]}/${matchBr[2]}/${matchBr[3]}`;
  return str;
}

export function classificarTipoDocumentoPdf(
  nomeArquivo: string,
  texto: string
): TipoDocumentoDossie {
  const nomeNorm = semAcentos(nomeArquivo);
  const cabecalhoNorm = semAcentos(texto.slice(0, 2500));
  if (
    /\b(?:aditiv|aditamento|termo aditivo)\b/.test(nomeNorm) ||
    /\b(?:termo aditivo|aditamento ao contrato)\b/.test(cabecalhoNorm)
  ) {
    return "Aditivo";
  }
  if (
    /\b(?:tabela|porte|cbhpm|tuss|rol|precos|valores|simpro|brasindice|tnumm)\b/.test(
      nomeNorm
    )
  ) {
    return "Tabela";
  }
  if (
    /\b(?:circular|oficio|comunicado|informativo)\b/.test(nomeNorm) ||
    /\b(?:circular|oficio)\b/.test(cabecalhoNorm.slice(0, 600))
  ) {
    return "Circular";
  }
  if (/\b(?:notificacao|mandado|citacao|intimacao|peticao)\b/.test(nomeNorm)) {
    return "Outro";
  }
  if (
    /\b(?:contrato|credenciamento|prestacao de servicos)\b/.test(nomeNorm) ||
    /\b(?:contrato de prestacao|instrumento particular)\b/.test(cabecalhoNorm)
  ) {
    return "Contrato";
  }
  return "Contrato";
}

export function extrairDataDocumentoPdf(
  nomeArquivo: string,
  texto: string,
  fallbackDate?: Date | string | null
): string {
  const matchNome = nomeArquivo.match(
    /(\d{2})[._-](\d{2})[._-](20\d{2}|19\d{2})/
  );
  if (matchNome) {
    return `${matchNome[1]}/${matchNome[2]}/${matchNome[3]}`;
  }
  const matchTextoData = texto.match(/\b(\d{2})\/(\d{2})\/(19\d{2}|20\d{2})\b/);
  if (matchTextoData) {
    return `${matchTextoData[1]}/${matchTextoData[2]}/${matchTextoData[3]}`;
  }
  const meses: Record<string, string> = {
    janeiro: "01",
    fevereiro: "02",
    marco: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };
  const textoNorm = semAcentos(texto);
  const matchExtenso = textoNorm.match(
    /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(19\d{2}|20\d{2})\b/
  );
  if (matchExtenso) {
    return `${String(matchExtenso[1]).padStart(2, "0")}/${meses[matchExtenso[2]]}/${matchExtenso[3]}`;
  }
  const matchAnoNome = nomeArquivo.match(/\b(20\d{2}|19\d{2})\b/);
  if (matchAnoNome) return matchAnoNome[1];
  return formatarDataPtBr(fallbackDate);
}

function extrairCnpjs(texto: string): string[] {
  const unicos = new Set<string>();
  for (const m of texto.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)) {
    unicos.add(m[0]);
    if (unicos.size >= 4) break;
  }
  return Array.from(unicos);
}

function extrairRegistroAns(texto: string): string | null {
  const m = texto.match(
    /ANS\s*(?:sob\s*(?:o\s*)?n[º°.]?\s*|:\s*|-?\s*)?(\d{3}\.?\d{3}|\d{5,6})/i
  );
  return m ? m[1].replace(/\D/g, "") : null;
}

function extrairPrazoPadrao(
  texto: string,
  padroes: RegExp[],
  fallback: string
): string {
  for (const regex of padroes) {
    const m = texto.match(regex);
    if (m) return m[0].replace(/\s+/g, " ").trim().slice(0, 140);
  }
  return fallback;
}

function extrairClausulasEstruturadas(
  linhas: string[],
  pontos: ContratoConvenioPonto[]
): Array<[string, string]> {
  const resultado: Array<[string, string]> = [];
  const adicionados = new Set<string>();

  // 1. Extrair cláusulas numeradas explícitas do contrato
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (
      /^(?:CL[ÁA]USULA\s+(?:PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA|S[ÉE]TIMA|OITAVA|NONA|D[ÉE]CIMA|[I|V|X]{1,5}|\d+[ªº°]?))\b/i.test(
        linha
      )
    ) {
      const corpo = linhas
        .slice(i, Math.min(linhas.length, i + 5))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 480);
      const tituloMatch = linha.match(
        /^(CL[ÁA]USULA\s+[^-–:—.]+(?:[-–:—.]\s*[^.]{2,60})?)/i
      );
      const tema = (tituloMatch ? tituloMatch[1] : linha.slice(0, 70)).trim();
      const chave = semAcentos(tema).slice(0, 40);
      if (!adicionados.has(chave) && corpo.length > 25) {
        adicionados.add(chave);
        resultado.push([tema, corpo]);
      }
      if (resultado.length >= 10) break;
    }
  }

  // 2. Complementar com os temas essenciais da consultoria
  const mapaCategorias: Record<ContratoConvenioPontoCategoria, string> = {
    partes: "Partes Contratantes e Credenciamento",
    vigencia: "Vigência, Renovação e Prazos",
    faturamento: "Faturamento, Fechamento e Envio XML TISS",
    pagamento: "Prazo de Pagamento e Calendário Financeiro",
    glosa_recurso: "Glosas, Auditoria e Prazo de Recurso",
    tabelas_valores: "Tabelas de Preços, Portes, Mat/Med e OPME",
    documentos: "Guias TISS, Autorização Prévia e Documentação",
    obrigacoes: "Obrigações Operacionais e Corpo Clínico",
    rescisao: "Rescisão, Aviso Prévio e Penalidades",
    dados_e_sigilo: "Confidencialidade e LGPD",
    contatos: "Canais de Negociação e Contatos",
  };

  for (const ponto of pontos) {
    const tema =
      ponto.titulo || mapaCategorias[ponto.categoria] || "Cláusula Contratual";
    const chave = semAcentos(tema).slice(0, 35);
    if (!adicionados.has(chave) && ponto.resumo) {
      adicionados.add(chave);
      resultado.push([tema, ponto.resumo]);
    }
  }

  return resultado;
}

function extrairRegrasRemuneracao(
  linhas: string[],
  nomeArquivoPadrao: string,
  itensTabelaPortal: Array<{
    codigo: string;
    nome: string;
    valor: string;
    tipo: string;
  }>
): Array<[string, string, string]> {
  const regras: Array<[string, string, string]> = [];
  const buscarTrecho = (palavras: string[]): string | null => {
    const idx = linhas.findIndex(l => {
      const norm = semAcentos(l);
      return palavras.some(p => norm.includes(p));
    });
    if (idx < 0) return null;
    return linhas
      .slice(idx, Math.min(linhas.length, idx + 4))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 420);
  };

  const consultas = buscarTrecho([
    "consulta eletiva",
    "consulta em pronto socorro",
    "consulta medica",
    "visita hospitalar",
    "1.01.01.01",
    "10101012",
  ]);
  if (consultas) {
    regras.push([
      "Consultas Médicas e Visita Hospitalar",
      consultas,
      nomeArquivoPadrao,
    ]);
  }

  const hm = buscarTrecho([
    "cbhpm",
    "honorarios medicos",
    "porte anestesico",
    "uco",
    "amb 92",
    "thamb",
    "horario especial",
  ]);
  if (hm) {
    regras.push([
      "Honorários Médicos (HM), Portes e SADT",
      hm,
      nomeArquivoPadrao,
    ]);
  }

  const diarias = buscarTrecho([
    "diaria",
    "diarias",
    "taxa de sala",
    "gases medicinais",
    "enfermaria",
    "apartamento",
    "uti",
  ]);
  if (diarias) {
    regras.push([
      "Diárias, Taxas Hospitalares e Gases",
      diarias,
      nomeArquivoPadrao,
    ]);
  } else {
    regras.push([
      "Diárias, Taxas Hospitalares e Gases",
      "Não localizada cláusula explícita de diárias/taxas no texto extraído dos PDFs; verificar anexos de tabelas hospitalares ou aditivos.",
      nomeArquivoPadrao,
    ]);
  }

  const matmed = buscarTrecho([
    "brasindice",
    "simpro",
    "tnumm",
    "preco fabrica",
    "pmc",
    "medicamentos",
    "materiais hospitalares",
  ]);
  if (matmed) {
    regras.push([
      "Medicamentos e Materiais (Brasíndice / Simpro / TNUMM)",
      matmed,
      nomeArquivoPadrao,
    ]);
  }

  const opme = buscarTrecho([
    "opme",
    "orteses",
    "proteses",
    "materiais especiais",
    "taxa de comercializacao",
  ]);
  if (opme) {
    regras.push([
      "OPME (Órteses, Próteses e Materiais Especiais)",
      opme,
      nomeArquivoPadrao,
    ]);
  }

  const pacotes = buscarTrecho([
    "pacote",
    "pacotes cirurgicos",
    "procedimentos fechados",
  ]);
  if (pacotes) {
    regras.push([
      "Pacotes e Procedimentos Fechados",
      pacotes,
      nomeArquivoPadrao,
    ]);
  }

  if (itensTabelaPortal.length > 0) {
    const porTipo = itensTabelaPortal.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.tipo] = (acc[item.tipo] || 0) + 1;
        return acc;
      },
      {}
    );
    const resumoTipos = Object.entries(porTipo)
      .map(([tipo, qtd]) => `${tipo.toUpperCase()}: ${qtd} item(ns)`)
      .join(" | ");
    regras.push([
      "Tabelas de Preços Cadastradas no Portal",
      `${itensTabelaPortal.length} procedimento(s)/item(ns) ativos parametrizados para cruzamento automático com XML TISS e Recurso de Glosa (${resumoTipos}).`,
      "Módulo Tabelas de Preços (Portal)",
    ]);
  }

  return regras;
}

export function extrairLinhasTabelaValoresPdf(
  texto: string,
  fonteArquivo: string
): Array<[string, string, number, string]> {
  const linhas = texto
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const extraidos: Array<[string, string, number, string]> = [];
  const vistos = new Set<string>();

  for (const linha of linhas) {
    // Padrão 1: Código TUSS (ex: 1.01.01.01-2 ou 10101012) + Descrição + Valor R$
    const matchTuss = linha.match(
      /\b([1-9]\.\d{2}\.\d{2}\.\d{2}-\d|[1-9]\d{7})\b\s*[-–:]?\s*([A-Za-zÀ-ÿ0-9(),./\s-]{4,120}?)\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})\b/
    );
    if (matchTuss) {
      const codigo = matchTuss[1].trim();
      const descricao = matchTuss[2].replace(/\s+/g, " ").trim();
      const valorRaw = matchTuss[3];
      const valor = valorRaw.includes(",")
        ? Number(valorRaw.replace(/\./g, "").replace(",", "."))
        : Number(valorRaw);
      if (Number.isFinite(valor) && valor > 0 && !vistos.has(codigo)) {
        vistos.add(codigo);
        extraidos.push([
          codigo,
          descricao,
          Number(valor.toFixed(2)),
          fonteArquivo,
        ]);
      }
      if (extraidos.length >= 60) break;
      continue;
    }

    // Padrão 2: Porte Anestésico / Consulta / Visita explícitos com R$
    const matchNomeado = linha.match(
      /\b(Consulta\s+[A-Za-zÀ-ÿ/\s-]{3,45}|Visita\s+Hospitalar|Porte\s+Anest[ée]sico\s*\d+|Di[áa]ria\s+[A-Za-zÀ-ÿ/\s-]{3,40})\s*[:\-–]?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/i
    );
    if (matchNomeado) {
      const desc = matchNomeado[1].replace(/\s+/g, " ").trim();
      const valor = Number(
        matchNomeado[2].replace(/\./g, "").replace(",", ".")
      );
      const codigoSintetico = desc
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .slice(0, 24);
      if (Number.isFinite(valor) && valor > 0 && !vistos.has(codigoSintetico)) {
        vistos.add(codigoSintetico);
        extraidos.push([
          codigoSintetico,
          desc,
          Number(valor.toFixed(2)),
          fonteArquivo,
        ]);
      }
      if (extraidos.length >= 60) break;
    }
  }

  return extraidos;
}

export function construirDossieContratualTexto(params: {
  contrato: {
    id: number;
    convenioId: number;
    estabelecimentoId: number;
    numeroContrato: string | null;
    status: string | null;
    dataInicio: Date | string | null;
    dataFim: Date | string | null;
    reajusteProposto: string | null;
    emailContato: string | null;
    observacoes: string | null;
  };
  convenioNome: string;
  registroAns?: string | null;
  prazoRecursoGlosaConvenio?: number | null;
  estabelecimentoNome: string;
  estabelecimentoCnpj?: string | null;
  documentos: Array<{
    id: number;
    nomeArquivo: string;
    paginas: number | null;
    status: string;
    textoExtraido: string | null;
    pontosImportantes: unknown;
    createdAt?: Date | string | null;
  }>;
  itensTabelaPortal?: Array<{
    codigo: string;
    nome: string;
    valor: string;
    tipo: string;
    porte?: string | null;
    vigenciaInicio?: Date | string | null;
  }>;
  regrasNegocioPortal?: Array<{
    tipoRegra: string;
    nome: string;
    descricao: string | null;
    acoes: string | null;
  }>;
}): DossieContratualConvenio {
  const {
    contrato,
    convenioNome,
    estabelecimentoNome,
    estabelecimentoCnpj,
    documentos,
    itensTabelaPortal = [],
    regrasNegocioPortal = [],
  } = params;

  const textosConcatenados = documentos
    .map(d => d.textoExtraido || "")
    .filter(Boolean)
    .join("\n\n");
  const linhasTotais = textosConcatenados
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  const textoNorm = semAcentos(textosConcatenados);

  const cnpjs = extrairCnpjs(textosConcatenados);
  const ansExtraido =
    extrairRegistroAns(textosConcatenados) ||
    params.registroAns ||
    "Não identificado no PDF";

  const prazoFaturamento = extrairPrazoPadrao(
    textosConcatenados,
    [
      /at[ée]\s+o\s+\d+[º°]?\s*dia\s+(?:[úu]til|corrido)?[^.;\n]{0,80}/i,
      /entrega\s+d[ae]s?\s+faturas?[^.;\n]{0,90}/i,
    ],
    "Verificar calendário mensal de fechamento TISS"
  );

  const prazoPagamento = extrairPrazoPadrao(
    textosConcatenados,
    [
      /(?:pagamento|pagar[áa]|quitac[ãa]o)[^.;\n]{0,50}?\b(\d{1,3})\s*(?:\([^)]+\)\s*)?dias\s*(?:corridos|[úu]teis|ap[óo]s|contados)?[^.;\n]{0,60}/i,
      /\b(?:30|45|60)\s*(?:\([^)]+\)\s*)?dias\s+contados\s+da\s+apresenta[çc][ãa]o/i,
    ],
    "30 a 60 dias após apresentação da fatura/NF"
  );

  const prazoRecursoGlosa = extrairPrazoPadrao(
    textosConcatenados,
    [
      /(?:recurso\s+de\s+glosa|contesta[çc][ãa]o|recurso)[^.;\n]{0,60}?\b(\d{1,3})\s*(?:\([^)]+\)\s*)?dias[^.;\n]{0,50}/i,
      /prazo\s+de\s+\d{1,3}\s*dias\s+para\s+(?:recurso|contesta[çc][ãa]o)/i,
    ],
    params.prazoRecursoGlosaConvenio
      ? `${params.prazoRecursoGlosaConvenio} dias (cadastro do convênio)`
      : "30 a 60 dias após demonstrativo de pagamento/glosa"
  );

  const indiceReajuste = extrairPrazoPadrao(
    textosConcatenados,
    [
      /(?:reajuste|reajustad[oa]s?)[^.;\n]{0,90}?\b(?:IGP-?M|IPCA|INPC|ANS)[^.;\n]{0,70}/i,
      /\b(?:80%|100%)\s*d[oa]\s*(?:IGP-?M|IPCA)[^.;\n]{0,60}/i,
    ],
    contrato.reajusteProposto
      ? `Pleito / Proposta cadastrada: ${contrato.reajusteProposto}% (anual)`
      : "Anual no aniversário do contrato (IPCA / IGP-M / livre negociação)"
  );

  // Consolidar pontos importantes de todos os documentos
  const pontosConsolidados: ContratoConvenioPonto[] = [];
  for (const doc of documentos) {
    const lista = Array.isArray(doc.pontosImportantes)
      ? doc.pontosImportantes
      : [];
    for (const p of lista) {
      if (p && typeof p === "object" && "titulo" in p && "resumo" in p) {
        pontosConsolidados.push(p as ContratoConvenioPonto);
      }
    }
  }
  if (pontosConsolidados.length === 0 && textosConcatenados.length > 0) {
    pontosConsolidados.push(...extrairPontosImportantes(textosConcatenados));
  }

  // Documentos analisados (Linha do Tempo)
  const docsLinhaTempo: DocumentoDossieContratual[] = documentos.map(doc => {
    const textoDoc = doc.textoExtraido || "";
    const tipo = classificarTipoDocumentoPdf(doc.nomeArquivo, textoDoc);
    const data = extrairDataDocumentoPdf(
      doc.nomeArquivo,
      textoDoc,
      doc.createdAt
    );
    const pontosDoc = Array.isArray(doc.pontosImportantes)
      ? (doc.pontosImportantes as ContratoConvenioPonto[])
      : extrairPontosImportantes(textoDoc);
    const resumo =
      pontosDoc.length > 0
        ? pontosDoc
            .slice(0, 3)
            .map(p => `${p.titulo}: ${p.resumo}`)
            .join(" | ")
            .slice(0, 420)
        : textoDoc
          ? textoDoc.replace(/\s+/g, " ").trim().slice(0, 320)
          : "PDF digitalizado / imagem sem camada de texto selecionável (requer OCR).";
    const statusAssinatura =
      doc.status === "ocr_necessario"
        ? "Digitalizado (OCR necessário)"
        : /\b(?:assinado digitalmente|icp-brasil|reconhecimento de firma|testemunhas)\b/i.test(
              textoDoc
            )
          ? "Assinado / Leitura concluída"
          : doc.status === "concluido"
            ? "Leitura concluída – Vigente"
            : doc.status;

    return {
      id: doc.id,
      data,
      arquivo: doc.nomeArquivo,
      tipo,
      resumo,
      status: statusAssinatura,
      paginas: doc.paginas ?? 0,
      statusLeitura:
        (doc.status as DocumentoDossieContratual["statusLeitura"]) ||
        "concluido",
    };
  });

  // Cláusulas-chave
  const clausulas = extrairClausulasEstruturadas(
    linhasTotais,
    pontosConsolidados
  );

  // Regras de remuneração
  const nomeArquivoPrincipal =
    documentos[0]?.nomeArquivo || `Contrato ${convenioNome}`;
  const remuneracao = extrairRegrasRemuneracao(
    linhasTotais,
    nomeArquivoPrincipal,
    itensTabelaPortal
  );

  // Histórico de reajustes
  const reajustes: Array<[string, string, string, string]> = [];
  for (const doc of docsLinhaTempo) {
    if (
      doc.tipo === "Aditivo" ||
      doc.tipo === "Circular" ||
      /reajuste|tabela/i.test(doc.arquivo)
    ) {
      reajustes.push([
        doc.data,
        `${doc.tipo} (${doc.arquivo})`,
        doc.resumo.slice(0, 220),
        doc.arquivo,
      ]);
    }
  }
  if (contrato.reajusteProposto) {
    reajustes.push([
      "Vigência Atual (Pleito)",
      "Proposta de Reajuste Contratual Cadastrada",
      `${contrato.reajusteProposto}% sobre tabelas vigentes`,
      `Contrato #${contrato.numeroContrato || contrato.id}`,
    ]);
  }
  if (reajustes.length === 0 && contrato.dataInicio) {
    reajustes.push([
      formatarDataPtBr(contrato.dataInicio),
      "Marco Contratual Inicial",
      indiceReajuste,
      nomeArquivoPrincipal,
    ]);
  }

  // Tabela de valores (PDF + Portal)
  const linhasTabela: Array<[string, string, number, string]> = [];
  const codigosVistos = new Set<string>();

  for (const item of itensTabelaPortal.slice(0, 80)) {
    const codigo = item.codigo.trim();
    const valorNum = Number(item.valor);
    if (codigo && Number.isFinite(valorNum) && !codigosVistos.has(codigo)) {
      codigosVistos.add(codigo);
      linhasTabela.push([
        codigo,
        item.nome,
        Number(valorNum.toFixed(2)),
        `Tabela Portal (${item.tipo.toUpperCase()}${item.porte ? ` - Porte ${item.porte}` : ""}; início ${formatarDataPtBr(item.vigenciaInicio)}). Referência cadastral; validar pela execução.`,
      ]);
    }
  }

  for (const doc of documentos) {
    if (!doc.textoExtraido) continue;
    for (const linha of extrairLinhasTabelaValoresPdf(
      doc.textoExtraido,
      doc.nomeArquivo
    )) {
      if (!codigosVistos.has(linha[0])) {
        codigosVistos.add(linha[0]);
        linhasTabela.push(linha);
      }
      if (linhasTabela.length >= 100) break;
    }
  }

  // Pontos de Atenção e Oportunidades (RED / YEL / GRN)
  const pontosAtencao: Array<[string, string, SemaforoRiscoContrato]> = [];

  // 1. Verificações Críticas (RED)
  if (contrato.status === "vencido" || contrato.status === "vencendo") {
    pontosAtencao.push([
      `VIGÊNCIA CONTRATUAL CRÍTICA (${contrato.status.toUpperCase()})`,
      `O contrato consta com status "${contrato.status}" (término: ${formatarDataPtBr(contrato.dataFim)}). É prioritário formalizar notificação de renovação/reajuste para evitar prestação de serviços sem cobertura de reajuste anual ou suspensão de faturamento.`,
      "RED",
    ]);
  }

  const docsOcr = docsLinhaTempo.filter(
    d => d.statusLeitura === "ocr_necessario"
  );
  if (docsOcr.length > 0) {
    pontosAtencao.push([
      `${docsOcr.length} DOCUMENTO(S) DIGITALIZADO(S) SEM CAMADA DE TEXTO (OCR NECESSÁRIO)`,
      `Os arquivos (${docsOcr.map(d => d.arquivo).join(", ")}) são PDFs escaneados em imagem. Para que todas as cláusulas e tabelas desses anexos entrem no cruzamento automático de glosas e XML, recomenda-se anexar versão pesquisável ou cadastrar a tabela em Tabelas de Preços.`,
      "RED",
    ]);
  }

  if (
    /qualquer tempo|descontad[oa]s?\s+de\s+faturas?\s+futuras?|glosa\s+retroativa/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "CLÁUSULA DE AUDITORIA / GLOSA RETROATIVA E DESCONTO EM FATURAS FUTURAS",
      "O texto contratual prevê possibilidade de contestação/retenção de valores ou compensação em faturas subsequentes. Exige conciliação rigorosa dos demonstrativos de pagamento e contestação imediata dentro do prazo contratual de recurso de glosa.",
      "RED",
    ]);
  }

  if (/\b60\s*(?:\([^)]+\)\s*)?dias\b/i.test(prazoPagamento)) {
    pontosAtencao.push([
      "PRAZO DE PAGAMENTO DILATADO (60 DIAS) E RISCO DE PRORROGAÇÃO POR ATRASO DE LOTE",
      `O prazo de pagamento identificado (${prazoPagamento}) impacta o capital de giro do hospital. Atrasos na entrega do faturamento XML/físico ou pendências de emissão de Nota Fiscal podem deslocar o recebimento para a competência subsequente.`,
      "RED",
    ]);
  }

  if (itensTabelaPortal.length === 0) {
    pontosAtencao.push([
      "AUSÊNCIA DE TABELA DE PREÇOS PARAMETRIZADA NO PORTAL PARA ESTE CONVÊNIO",
      linhasTabela.length > 0
        ? `Foram identificados ${linhasTabela.length} itens/valores diretamente nos PDFs do contrato, mas ainda não há itens ativos em Tabelas de Preços no Portal. Utilize o botão "Sincronizar Preços com o Portal" na aba Tabela de Valores para ativar a auditoria automática do XML e de Recursos de Glosa.`
        : "Não há itens cadastrados em Tabelas de Preços para este convênio. Sem a tabela ativa no Portal, a auditoria automática de subfaturamento do XML TISS e de glosa por divergência de preço fica incompleta.",
      "RED",
    ]);
  }

  // 2. Atenção Operacional e Faturamento XML (YEL)
  if (
    /autoriza[çc][ãa]o\s+pr[ée]via|senha|guia\s+assinada|assinatura\s+d[oa]\s+benefici[áa]rio/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "CONTROLE DE AUTORIZAÇÃO PRÉVIA (SENHA) E ASSINATURA OBRIGATÓRIA NAS GUIAS",
      "O contrato exige autorização prévia/senha para procedimentos eletivos e assinatura do beneficiário/responsável nas guias SADT/Internação. Guias enviadas no XML TISS sem número de senha ou com divergência cadastral geram glosa técnica imediata.",
      "YEL",
    ]);
  }

  if (
    /tabela\s+60|tnumm|unidade\s+de\s+medida|bras[íi]ndice|simpro/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "PARAMETRIZAÇÃO DE MAT/MED NO XML TISS (TABELA 60 ANS / TNUMM / BRASÍNDICE / SIMPRO)",
      "Divergências na unidade de medida de materiais e medicamentos no XML TISS (ex.: ampola vs. frasco-ampola) ou códigos fora da tabela pactuada causam glosa automática. A equipe de faturamento deve validar o de-para antes do fechamento do lote.",
      "YEL",
    ]);
  }

  if (
    /anexo\s+i|corpo\s+cl[íi]nico|m[ée]dicos?\s+autorizados?|credenciados?/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "ATUALIZAÇÃO DO CORPO CLÍNICO E CÓDIGO DE PRESTADOR EXECUTANTE NO XML",
      "Contratos que vinculam o pagamento à lista de profissionais autorizados (Anexo de Corpo Clínico) glosam atendimentos eletivos de médicos recém-integrados não comunicados formalmente à operadora.",
      "YEL",
    ]);
  }

  pontosAtencao.push([
    `PRAZO CONTRATUAL DE RECURSO DE GLOSA: ${prazoRecursoGlosa.toUpperCase()}`,
    `Toda glosa identificada nos demonstrativos de retorno deve ser auditada e recursada dentro do prazo (${prazoRecursoGlosa}), fundamentando a contestação nas cláusulas deste contrato e nos valores pactuados.`,
    "YEL",
  ]);

  // 3. Oportunidades de Faturamento e Cobrança (GRN)
  if (
    /hor[áa]rio\s+especial|30%|urg[êe]ncia\s+e\s+emerg[êe]ncia|200%|apartamento/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "OPORTUNIDADE NO XML: ACRÉSCIMO DE HORÁRIO ESPECIAL (+30%) E ACOMODAÇÃO SUPERIOR",
      "Verifique se o sistema de faturamento está aplicando automaticamente o adicional de urgência/emergência em horário especial (noturno, sábados à tarde, domingos e feriados) e a valoração diferenciada de honorários em apartamento/UTI quando previstos.",
      "GRN",
    ]);
  }

  if (
    /opme|15%|20%|10%|taxa\s+de\s+comercializa[çc][ãa]o/i.test(
      textosConcatenados
    )
  ) {
    pontosAtencao.push([
      "OPORTUNIDADE DE MARGEM EM MAT/MED E TAXA DE COMERCIALIZAÇÃO DE OPME",
      "Conferir no XML de faturamento se os percentuais contratuais de margem sobre Brasíndice/TNUMM/Simpro e a taxa de administração/comercialização de OPME estão sendo integralmente cobrados nas contas hospitalares.",
      "GRN",
    ]);
  }

  if (
    /juros|mora|igp-?m|corre[çc][ãa]o\s+monet[áa]ria/i.test(textosConcatenados)
  ) {
    pontosAtencao.push([
      "FUNDAMENTO CONTRATUAL PARA COBRANÇA DE ENCARGOS POR ATRASO E RESPOSTA DE GLOSA",
      "O contrato prevê atualização monetária e juros moratórios em caso de impontualidade da operadora, fortalecendo notificações de cobrança de faturas em aberto e recursos de glosa sem resposta no prazo.",
      "GRN",
    ]);
  }

  // Adicionar pontos específicos salvos nos documentos que ainda não estejam representados
  for (const p of pontosConsolidados) {
    const semaforo: SemaforoRiscoContrato =
      p.prioridade === "alta"
        ? "RED"
        : p.prioridade === "media"
          ? "YEL"
          : "GRN";
    const jaExiste = pontosAtencao.some(
      existente => semAcentos(existente[0]) === semAcentos(p.titulo)
    );
    if (!jaExiste && pontosAtencao.length < 14) {
      pontosAtencao.push([p.titulo.toUpperCase(), p.resumo, semaforo]);
    }
  }

  // Pendências acionáveis
  const pendencias: string[] = [];
  if (documentos.length === 0) {
    pendencias.push(
      "Importar o PDF do Contrato e seus Aditivos/Tabelas para extração automática das cláusulas."
    );
  }
  if (docsOcr.length > 0) {
    pendencias.push(
      `Processar OCR ou anexar planilha/PDF pesquisável para ${docsOcr.length} documento(s) digitalizado(s).`
    );
  }
  if (itensTabelaPortal.length === 0) {
    pendencias.push(
      "Sincronizar ou importar a Tabela de Preços vigente do convênio (Consultas, SADT, Diárias, Taxas e Mat/Med) no módulo Tabelas de Preços."
    );
  }
  if (!contrato.dataInicio || !contrato.dataFim) {
    pendencias.push(
      "Preencher as datas de início e vencimento da vigência no cadastro do contrato para controle de alertas de renovação."
    );
  }
  if (!contrato.emailContato) {
    pendencias.push(
      "Cadastrar o e-mail do negociador/credenciamento da operadora para envio automatizado de propostas de reajuste."
    );
  }
  pendencias.push(
    "Executar a aba 'Cobrança XML x Contrato' para verificar se há procedimentos sendo faturados abaixo do valor contratual."
  );
  pendencias.push(
    "Executar a aba 'Recursos de Glosa x Contrato' para aplicar fundamentação contratual automática nas glosas em aberto."
  );

  const dadosGerais: Array<[string, string]> = [
    ["Operadora / Contratante", convenioNome],
    ["Registro ANS / Identificação", ansExtraido],
    [
      "Prestador / Contratada",
      `${estabelecimentoNome}${estabelecimentoCnpj ? ` – CNPJ ${estabelecimentoCnpj}` : ""}`,
    ],
    [
      "CNPJs Identificados nos PDFs",
      cnpjs.length > 0
        ? cnpjs.join(" | ")
        : estabelecimentoCnpj || "Conforme cadastro da unidade",
    ],
    [
      "Nº do Contrato / Referência",
      contrato.numeroContrato || `Contrato #${contrato.id}`,
    ],
    [
      "Vigência Cadastrada",
      `${formatarDataPtBr(contrato.dataInicio)} até ${formatarDataPtBr(contrato.dataFim)} (Status: ${(contrato.status || "ativo").toUpperCase()})`,
    ],
    ["Prazo de Envio do Faturamento (XML)", prazoFaturamento],
    ["Prazo Contratual de Pagamento", prazoPagamento],
    ["Prazo de Recurso de Glosa", prazoRecursoGlosa],
    ["Critério / Índice de Reajuste", indiceReajuste],
    [
      "Acervo Contratual Analisado",
      `${documentos.length} arquivo(s) PDF (${documentos.filter(d => d.status === "concluido").length} com leitura concluída, ${docsOcr.length} requerendo OCR)`,
    ],
    [
      "Integração Faturamento XML & Glosas",
      `${itensTabelaPortal.length} preço(s) ativo(s) no Portal | ${regrasNegocioPortal.length} regra(s) de auditoria ativa(s)`,
    ],
  ];

  const slugLimpo =
    convenioNome.replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").trim() || "Convenio";

  return {
    contratoId: contrato.id,
    convenioId: contrato.convenioId,
    convenio: convenioNome,
    estabelecimentoId: contrato.estabelecimentoId,
    estabelecimentoNome,
    numeroContrato: contrato.numeroContrato,
    statusContrato: contrato.status || "ativo",
    arquivo_saida: `Análise Contratual - ${estabelecimentoNome} (${slugLimpo}).xlsx`,
    dados_gerais: dadosGerais,
    documentos: docsLinhaTempo,
    clausulas,
    remuneracao,
    reajustes,
    tabela_valores: {
      titulo: `TABELA DE REMUNERAÇÃO E PROCEDIMENTOS – ${convenioNome.toUpperCase()}`,
      colunas: [
        "Código TUSS / Item",
        "Descrição do Procedimento / Item",
        "Valor Contratado (R$)",
        "Observação / Fonte",
      ],
      linhas: linhasTabela,
    },
    pontos_atencao: pontosAtencao,
    pendencias,
    resumo_executivo: {
      totalDocumentos: documentos.length,
      documentosConcluidos: documentos.filter(d => d.status === "concluido")
        .length,
      documentosOcr: docsOcr.length,
      totalAlertasRed: pontosAtencao.filter(p => p[2] === "RED").length,
      totalAlertasYel: pontosAtencao.filter(p => p[2] === "YEL").length,
      totalOportunidadesGrn: pontosAtencao.filter(p => p[2] === "GRN").length,
      totalItensTabelaExtraidos: linhasTabela.length,
      totalItensTabelaPortal: itensTabelaPortal.length,
      prazoFaturamento,
      prazoPagamento,
      prazoRecursoGlosa,
      indiceReajuste,
    },
  };
}

async function obterDossieContratualInterno(
  contratoId: number
): Promise<DossieContratualConvenio> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [contrato] = await db
    .select()
    .from(contratosConvenios)
    .where(eq(contratosConvenios.id, contratoId))
    .limit(1);
  if (!contrato) throw new Error("Contrato não encontrado.");

  const [
    [convenio],
    [estabelecimento],
    documentos,
    itensTabelaPortal,
    regrasPortal,
  ] = await Promise.all([
    db
      .select()
      .from(convenios)
      .where(eq(convenios.id, contrato.convenioId))
      .limit(1),
    db
      .select()
      .from(estabelecimentos)
      .where(eq(estabelecimentos.id, contrato.estabelecimentoId))
      .limit(1),
    db
      .select()
      .from(contratosConveniosDocumentos)
      .where(
        and(
          eq(contratosConveniosDocumentos.contratoId, contrato.id),
          eq(
            contratosConveniosDocumentos.estabelecimentoId,
            contrato.estabelecimentoId
          )
        )
      )
      .orderBy(desc(contratosConveniosDocumentos.createdAt)),
    db
      .select({
        codigo: tabelasPreco.codigo,
        nome: tabelasPreco.nome,
        valor: tabelasPreco.valor,
        tipo: tabelasPreco.tipo,
        porte: tabelasPreco.porte,
        vigenciaInicio: tabelasPreco.vigenciaInicio,
      })
      .from(tabelasPreco)
      .where(
        and(
          eq(tabelasPreco.convenioId, contrato.convenioId),
          eq(tabelasPreco.ativo, "sim"),
          or(
            eq(tabelasPreco.estabelecimentoId, contrato.estabelecimentoId),
            isNull(tabelasPreco.estabelecimentoId)
          )
        )
      )
      .orderBy(desc(tabelasPreco.vigenciaInicio), desc(tabelasPreco.id))
      .limit(200),
    db
      .select({
        tipoRegra: regrasNegocio.tipoVerificacao,
        nome: regrasNegocio.nome,
        descricao: regrasNegocio.descricao,
        acoes: regrasNegocio.acaoInconsistencia,
      })
      .from(regrasNegocio)
      .where(
        and(
          eq(regrasNegocio.convenioId, contrato.convenioId),
          eq(regrasNegocio.ativo, "sim"),
          or(
            eq(regrasNegocio.estabelecimentoId, contrato.estabelecimentoId),
            isNull(regrasNegocio.estabelecimentoId)
          )
        )
      ),
  ]);

  return construirDossieContratualTexto({
    contrato,
    convenioNome: convenio?.nome || `Convênio #${contrato.convenioId}`,
    registroAns: convenio?.registroAns,
    prazoRecursoGlosaConvenio: convenio?.prazoRecursoGlosa,
    estabelecimentoNome:
      estabelecimento?.nome || `Unidade #${contrato.estabelecimentoId}`,
    estabelecimentoCnpj: estabelecimento?.cnpj,
    documentos,
    itensTabelaPortal,
    regrasNegocioPortal: regrasPortal,
  });
}

export interface ResultadoGeracaoDossieIA {
  dossie: DossieContratualConvenio;
  geradoComIA: boolean;
  salvo: boolean;
  motivo: "sem_texto" | "ia_indisponivel" | null;
}

async function gerarDossieContratualComIAInterno(
  contratoId: number
): Promise<ResultadoGeracaoDossieIA> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const dossieBase = await obterDossieContratual(contratoId);
  const documentos = await db
    .select()
    .from(contratosConveniosDocumentos)
    .where(
      and(
        eq(contratosConveniosDocumentos.contratoId, contratoId),
        eq(
          contratosConveniosDocumentos.estabelecimentoId,
          dossieBase.estabelecimentoId
        )
      )
    )
    .orderBy(desc(contratosConveniosDocumentos.createdAt));

  const textos = documentos
    .filter(d => d.textoExtraido && d.textoExtraido.trim().length > 40)
    .map(
      d =>
        `=== ARQUIVO: ${d.nomeArquivo} (${d.paginas || 1} págs.) ===\n${d.textoExtraido!.slice(0, 6500)}`
    )
    .join("\n\n")
    .slice(0, 18000);

  if (!textos)
    return {
      dossie: dossieBase,
      geradoComIA: false,
      salvo: false,
      motivo: "sem_texto",
    };

  let parsed: any;
  try {
    const { invokeLLM } = await import("./_core/llm");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você é um consultor sênior de faturamento e contratualização hospitalar no Brasil (ANS, TISS/TUSS, CBHPM, Brasíndice, Simpro, TNUMM, glosas). Analise os textos contratuais do convênio e retorne um diagnóstico executivo acionável em JSON válido seguindo estritamente o schema fornecido. Classifique cada ponto de atenção como RED (risco financeiro/prazo crítico), YEL (atenção operacional/faturamento XML) ou GRN (oportunidade de cobrança/margem).",
        },
        {
          role: "user",
          content: `Hospital/Unidade: ${dossieBase.estabelecimentoNome}\nConvênio: ${dossieBase.convenio}\n\nTextos extraídos dos PDFs do contrato:\n${textos}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "dossie_contratual_consultoria",
          strict: true,
          schema: {
            type: "object",
            properties: {
              pontos_atencao: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    titulo: { type: "string" },
                    explicacao: { type: "string" },
                    semaforo: { type: "string", enum: ["RED", "YEL", "GRN"] },
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
                  },
                  required: ["titulo", "explicacao", "semaforo", "categoria"],
                  additionalProperties: false,
                },
              },
              clausulas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tema: { type: "string" },
                    regra: { type: "string" },
                  },
                  required: ["tema", "regra"],
                  additionalProperties: false,
                },
              },
              remuneracao: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    item: { type: "string" },
                    regraValor: { type: "string" },
                    fonte: { type: "string" },
                  },
                  required: ["item", "regraValor", "fonte"],
                  additionalProperties: false,
                },
              },
              tabela_valores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    codigo: { type: "string" },
                    descricao: { type: "string" },
                    valor: { type: "number" },
                    fonte: { type: "string" },
                  },
                  required: ["codigo", "descricao", "valor", "fonte"],
                  additionalProperties: false,
                },
              },
              pendencias: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "pontos_atencao",
              "clausulas",
              "remuneracao",
              "tabela_valores",
              "pendencias",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("Resposta IA inválida");
    parsed = JSON.parse(raw);
    const categorias = [
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
    ];
    if (
      !Array.isArray(parsed.pontos_atencao) ||
      !parsed.pontos_atencao.length ||
      !["clausulas", "remuneracao", "tabela_valores", "pendencias"].every(
        chave => Array.isArray(parsed[chave])
      ) ||
      parsed.pontos_atencao.some(
        (p: any) =>
          !p ||
          typeof p.titulo !== "string" ||
          !p.titulo.trim() ||
          typeof p.explicacao !== "string" ||
          !p.explicacao.trim() ||
          !categorias.includes(p.categoria) ||
          !["RED", "YEL", "GRN"].includes(p.semaforo)
      ) ||
      parsed.clausulas.some(
        (c: any) =>
          !c || typeof c.tema !== "string" || typeof c.regra !== "string"
      ) ||
      parsed.remuneracao.some(
        (r: any) =>
          !r ||
          typeof r.item !== "string" ||
          typeof r.regraValor !== "string" ||
          typeof r.fonte !== "string"
      ) ||
      parsed.tabela_valores.some(
        (t: any) =>
          !t ||
          typeof t.codigo !== "string" ||
          typeof t.descricao !== "string" ||
          typeof t.fonte !== "string" ||
          typeof t.valor !== "number" ||
          !Number.isFinite(t.valor)
      ) ||
      parsed.pendencias.some((p: any) => typeof p !== "string")
    ) {
      throw new Error("Resposta IA inválida");
    }
  } catch {
    return {
      dossie: dossieBase,
      geradoComIA: false,
      salvo: false,
      motivo: "ia_indisponivel",
    };
  }

  // Falha de persistência não é fallback de IA e não pode virar sucesso.
  const principal = documentos[0];
  if (
    !principal ||
    principal.estabelecimentoId !== dossieBase.estabelecimentoId
  )
    divergenciaDossie();
  const pontosParaSalvar: ContratoConvenioPonto[] = parsed.pontos_atencao.map(
    (p: any) => ({
      categoria: p.categoria as ContratoConvenioPontoCategoria,
      titulo: p.titulo.slice(0, 160),
      resumo: p.explicacao.slice(0, 600),
      prioridade:
        p.semaforo === "RED"
          ? "alta"
          : p.semaforo === "YEL"
            ? "media"
            : "baixa",
    })
  );
  await db.transaction(async tx => {
    const filtro = and(
      eq(contratosConveniosDocumentos.id, principal.id),
      eq(contratosConveniosDocumentos.contratoId, contratoId),
      eq(
        contratosConveniosDocumentos.estabelecimentoId,
        dossieBase.estabelecimentoId
      )
    );
    const [antes] = await tx
      .select()
      .from(contratosConveniosDocumentos)
      .where(filtro)
      .for("update");
    if (!antes || antes.textoExtraido !== principal.textoExtraido)
      divergenciaDossie();
    exigirUmaGravacao(
      await tx
        .update(contratosConveniosDocumentos)
        .set({ pontosImportantes: pontosParaSalvar })
        .where(filtro)
    );
    const [gravado] = await tx
      .select()
      .from(contratosConveniosDocumentos)
      .where(filtro);
    if (
      !gravado ||
      JSON.stringify(gravado.pontosImportantes) !==
        JSON.stringify(pontosParaSalvar)
    )
      divergenciaDossie();
  });

  if (
    Array.isArray(parsed.pontos_atencao) &&
    parsed.pontos_atencao.length > 0
  ) {
    dossieBase.pontos_atencao = parsed.pontos_atencao.map((p: any) => [
      String(p.titulo || "").toUpperCase(),
      String(p.explicacao || ""),
      (p.semaforo === "RED" || p.semaforo === "YEL" || p.semaforo === "GRN"
        ? p.semaforo
        : "YEL") as SemaforoRiscoContrato,
    ]);
  }
  if (Array.isArray(parsed.clausulas) && parsed.clausulas.length > 0) {
    dossieBase.clausulas = parsed.clausulas.map((c: any) => [
      String(c.tema || ""),
      String(c.regra || ""),
    ]);
  }
  if (Array.isArray(parsed.remuneracao) && parsed.remuneracao.length > 0) {
    dossieBase.remuneracao = parsed.remuneracao.map((r: any) => [
      String(r.item || ""),
      String(r.regraValor || ""),
      String(r.fonte || documentos[0]?.nomeArquivo || "Contrato PDF"),
    ]);
  }
  if (
    Array.isArray(parsed.tabela_valores) &&
    parsed.tabela_valores.length > 0
  ) {
    const vistos = new Set(dossieBase.tabela_valores.linhas.map(l => l[0]));
    for (const item of parsed.tabela_valores) {
      const cod = String(item.codigo || "").trim();
      const val = Number(item.valor);
      if (cod && Number.isFinite(val) && val > 0 && !vistos.has(cod)) {
        vistos.add(cod);
        dossieBase.tabela_valores.linhas.push([
          cod,
          String(item.descricao || ""),
          Number(val.toFixed(2)),
          String(item.fonte || documentos[0]?.nomeArquivo || "Extraído via IA"),
        ]);
      }
    }
  }
  if (Array.isArray(parsed.pendencias) && parsed.pendencias.length > 0) {
    dossieBase.pendencias = parsed.pendencias.map((p: any) => String(p));
  }

  dossieBase.resumo_executivo.totalAlertasRed =
    dossieBase.pontos_atencao.filter(p => p[2] === "RED").length;
  dossieBase.resumo_executivo.totalAlertasYel =
    dossieBase.pontos_atencao.filter(p => p[2] === "YEL").length;
  dossieBase.resumo_executivo.totalOportunidadesGrn =
    dossieBase.pontos_atencao.filter(p => p[2] === "GRN").length;
  dossieBase.resumo_executivo.totalItensTabelaExtraidos =
    dossieBase.tabela_valores.linhas.length;
  return { dossie: dossieBase, geradoComIA: true, salvo: true, motivo: null };
}

async function sincronizarTabelaValoresDossieInterno(params: {
  contratoId: number;
  itens?: Array<{
    codigo: string;
    descricao: string;
    valor: number;
    tipo?: "procedimentos" | "diarias" | "taxas" | "mat_med";
    vigenciaInicio?: string;
  }>;
}): Promise<{
  inseridos: number;
  atualizados: number;
  totalSincronizado: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db.transaction(async tx => {
    const [contrato] = await tx
      .select()
      .from(contratosConvenios)
      .where(eq(contratosConvenios.id, params.contratoId))
      .for("update");
    if (!contrato) divergenciaDossie();
    // Linha estável compartilhada por todos os contratos/versões do convênio.
    // O lock é mantido até COMMIT e não depende de já existir linha de preço.
    const [convenio] = await tx
      .select()
      .from(convenios)
      .where(eq(convenios.id, contrato.convenioId))
      .for("update");
    if (
      !convenio ||
      convenio.ativo !== "sim" ||
      (convenio.estabelecimentoId !== null &&
        convenio.estabelecimentoId !== contrato.estabelecimentoId)
    )
      divergenciaDossie();
    const documentos = await tx
      .select()
      .from(contratosConveniosDocumentos)
      .where(
        and(
          eq(contratosConveniosDocumentos.contratoId, contrato.id),
          eq(
            contratosConveniosDocumentos.estabelecimentoId,
            contrato.estabelecimentoId
          ),
          eq(contratosConveniosDocumentos.status, "concluido")
        )
      )
      .for("update");
    const fonteItens: Array<{
      codigo: string;
      descricao: string;
      valor: number;
      tipo?: "procedimentos" | "diarias" | "taxas" | "mat_med";
      vigenciaInicio?: string;
      fonte?: string;
    }> = [];
    if (params.itens !== undefined) {
      fonteItens.push(...params.itens);
    } else {
      for (const doc of documentos) {
        const linhas = extrairLinhasTabelaValoresPdf(
          doc.textoExtraido || "",
          doc.nomeArquivo
        );
        if (!linhas.length) continue;
        // Data do documento/assinatura/upload não prova início de preço.
        const marco = (doc.textoExtraido || "").match(
          /vig[êe]ncia(?:\s+(?:a\s+partir\s+de|desde|inicial|in[íi]cio))?\s*[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i
        )?.[1];
        const iso = marco?.includes("/")
          ? marco.split("/").reverse().join("-")
          : marco;
        const contratoOriginal =
          classificarTipoDocumentoPdf(
            doc.nomeArquivo,
            doc.textoExtraido || ""
          ) === "Contrato" &&
          /\b(?:contrato|credenciamento|instrumento particular)\b/i.test(
            `${doc.nomeArquivo} ${(doc.textoExtraido || "").slice(0, 2500)}`
          );
        const inicio = marco
          ? normalizarDataExecucao(iso)
          : contratoOriginal
            ? normalizarDataExecucao(contrato.dataInicio)
            : undefined;
        if (!inicio) divergenciaDossie();
        for (const [codigo, descricao, valor] of linhas)
          fonteItens.push({
            codigo,
            descricao,
            valor,
            vigenciaInicio: inicio,
            fonte: `Documento #${doc.id}; contrato #${contrato.id}`,
            tipo: /di[áa]ria/i.test(descricao)
              ? "diarias"
              : /taxa/i.test(descricao)
                ? "taxas"
                : "procedimentos",
          });
      }
    }
    let inseridos = 0;
    const vistos = new Map<string, bigint>();
    for (const item of fonteItens) {
      const codigo = String(item.codigo || "").trim();
      const inicio = normalizarDataExecucao(item.vigenciaInicio);
      const valor = centavosDossie(item.valor);
      if (
        !codigo ||
        codigo.length > 50 ||
        !inicio ||
        valor <= 0n ||
        valor > 999999999999n ||
        (normalizarDataExecucao(contrato.dataInicio) &&
          inicio < normalizarDataExecucao(contrato.dataInicio)!) ||
        (normalizarDataExecucao(contrato.dataFim) &&
          inicio > normalizarDataExecucao(contrato.dataFim)!)
      )
        divergenciaDossie();
      const chave = `${codigo}:${inicio}`;
      if (vistos.has(chave) && vistos.get(chave) !== valor) divergenciaDossie();
      if (vistos.has(chave)) continue;
      vistos.set(chave, valor);
      const existentes = await tx
        .select()
        .from(tabelasPreco)
        .where(
          and(
            eq(tabelasPreco.convenioId, contrato.convenioId),
            eq(tabelasPreco.estabelecimentoId, contrato.estabelecimentoId),
            eq(tabelasPreco.codigo, codigo),
            sql`DATE(${tabelasPreco.vigenciaInicio}) = ${inicio}`
          )
        )
        .for("update");
      if (existentes.length) {
        if (
          existentes.some(
            p =>
              centavosDossie(p.valor) !== valor ||
              p.ativo !== "sim" ||
              p.tipo !== (item.tipo || "procedimentos")
          )
        )
          divergenciaDossie();
        continue; // Histórico imutável: não atualizar nem reativar versão existente.
      }
      exigirUmaGravacao(
        await tx.insert(tabelasPreco).values({
          convenioId: contrato.convenioId,
          estabelecimentoId: contrato.estabelecimentoId,
          tipo: item.tipo || "procedimentos",
          codigo,
          nome: item.descricao || codigo,
          valor: `${valor / 100n}.${String(valor % 100n).padStart(2, "0")}`,
          vigenciaInicio: new Date(`${inicio}T00:00:00.000Z`),
          ativo: "sim",
          observacao:
            item.fonte ||
            `Inclusão explícita no dossiê; contrato #${contrato.id}`,
        })
      );
      inseridos++;
    }
    return { inseridos, atualizados: 0, totalSincronizado: inseridos };
  });
}

// ============================================================================
// LIGAÇÃO 1: AUDITORIA DE COBRANÇA DO XML DO FATURAMENTO x CONTRATO
// ============================================================================

export interface ItemAuditoriaXmlContrato {
  id: number;
  numeroGuia: string;
  numeroLote: string | null;
  competencia: string | null;
  dataExecucao: string | null;
  codigoItem: string;
  descricaoItem: string;
  quantidade: number;
  valorUnitarioXml: number;
  valorTotalXml: number;
  valorUnitarioContrato: number | null;
  valorTotalContrato: number | null;
  diferencaTotal: number; // positivo = cobrado a maior no XML; negativo = cobrado a menor (subfaturamento)
  statusCobranca: "subfaturado" | "acima_contrato" | "conforme" | "sem_tabela";
  fontePreco: string | null;
  alertaRegra: string | null;
}

export interface ResultadoAuditoriaXmlContrato {
  contratoId: number;
  convenioId: number;
  convenioNome: string;
  competenciasDisponiveis: string[];
  lotesDisponiveis: string[];
  resumo: {
    totalItensXml: number;
    totalGuiasXml: number;
    valorTotalCobradoXml: number;
    valorTotalDevidoContrato: number;
    valorPerdaSubfaturamento: number;
    valorRiscoGlosaAcimaTabela: number;
    qtdSubfaturados: number;
    qtdAcimaContrato: number;
    qtdConformes: number;
    qtdSemTabela: number;
    qtdGuiasSemSenha: number;
  };
  resumoPorProcedimento: Array<{
    codigoItem: string;
    descricaoItem: string;
    ocorrencias: number;
    quantidadeTotal: number;
    valorUnitarioMedioXml: number;
    valorUnitarioContrato: number | null;
    valorTotalXml: number;
    valorTotalContrato: number | null;
    diferencaTotal: number;
    statusCobranca:
      | "subfaturado"
      | "acima_contrato"
      | "conforme"
      | "sem_tabela";
  }>;
  itens: ItemAuditoriaXmlContrato[];
}

async function auditarCobrancaXmlPorContratoInterno(params: {
  contratoId: number;
  competencia?: string;
  loteXml?: string;
  limit?: number;
}): Promise<ResultadoAuditoriaXmlContrato> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const dossie = await obterDossieContratual(params.contratoId);
  const { estabelecimentoId, convenioId, convenio: convenioNome } = dossie;

  // Buscar competências e lotes disponíveis em faturamento_tiss / faturamento_unificado
  const [compRows] = await db.execute(sql`
    SELECT DISTINCT COALESCE(NULLIF(TRIM(competencia), ''), DATE_FORMAT(data_referencia, '%Y-%m')) as comp
    FROM faturamento_tiss
    WHERE estabelecimentoId = ${estabelecimentoId} AND convenioId = ${convenioId}
    UNION
    SELECT DISTINCT competencia as comp
    FROM faturamento_unificado
    WHERE estabelecimentoId = ${estabelecimentoId} AND convenioId = ${convenioId}
    ORDER BY comp DESC
  `);
  const competenciasDisponiveis = (compRows as unknown as any[])
    .map(r => String(r.comp || "").trim())
    .filter(Boolean);

  const [lotesRows] = await db.execute(sql`
    SELECT DISTINCT numero_lote as lote
    FROM faturamento_tiss
    WHERE estabelecimentoId = ${estabelecimentoId}
      AND convenioId = ${convenioId}
      AND numero_lote IS NOT NULL AND numero_lote != ''
    ORDER BY numero_lote DESC
    LIMIT 60
  `);
  const lotesDisponiveis = (lotesRows as unknown as any[])
    .map(r => String(r.lote || "").trim())
    .filter(Boolean);

  const limite = Math.min(Math.max(params.limit ?? 250, 20), 600);

  // Consultar itens do XML TISS (faturamento_tiss) ou fallback de faturamento_unificado
  const condicoesTiss = [
    sql`ft.estabelecimentoId = ${estabelecimentoId}`,
    sql`ft.convenioId = ${convenioId}`,
  ];
  if (params.competencia && params.competencia !== "todas") {
    condicoesTiss.push(
      sql`(ft.competencia = ${params.competencia} OR DATE_FORMAT(ft.data_referencia, '%Y-%m') = ${params.competencia})`
    );
  }
  if (params.loteXml && params.loteXml !== "todos") {
    condicoesTiss.push(sql`ft.numero_lote = ${params.loteXml}`);
  }

  const [tissRows] = await db.execute(sql`
    SELECT
      ft.id,
      COALESCE(ft.numero_guia_prestador, ft.numero_guia_operadora, '-') as numeroGuia,
      ft.numero_lote as numeroLote,
      COALESCE(NULLIF(TRIM(ft.competencia), ''), DATE_FORMAT(ft.data_referencia, '%Y-%m')) as competencia,
      DATE_FORMAT(ft.data_execucao, '%Y-%m-%d') as dataExecucao,
      COALESCE(ft.codigo_item, '') as codigoItem,
      COALESCE(ft.descricao_item, '') as descricaoItem,
      COALESCE(ft.tipo_item, '') as tipoItem,
      COALESCE(ft.quantidade, 1) as quantidade,
      COALESCE(ft.valor_unitario, 0) as valorUnitario,
      COALESCE(ft.valor_faturado, ft.valor_total_item, COALESCE(ft.valor_unitario, 0) * COALESCE(ft.quantidade, 1)) as valorTotal,
      ft.senha
    FROM faturamento_tiss ft
    WHERE ${sql.join(condicoesTiss, sql` AND `)}
    ORDER BY ft.data_execucao DESC, ft.id DESC
    LIMIT ${sql.raw(String(limite))}
  `);

  let rowsBrutas = (tissRows as unknown as any[]) ?? [];

  if (rowsBrutas.length === 0) {
    const condicoesFu = [
      sql`fu.estabelecimentoId = ${estabelecimentoId}`,
      sql`fu.convenioId = ${convenioId}`,
    ];
    if (params.competencia && params.competencia !== "todas") {
      condicoesFu.push(sql`fu.competencia LIKE ${`${params.competencia}%`}`);
    }
    if (params.loteXml && params.loteXml !== "todos") {
      condicoesFu.push(sql`fu.numeroLote = ${params.loteXml}`);
    }
    const [fuRows] = await db.execute(sql`
      SELECT
        fu.id,
        COALESCE(fu.numeroGuia, fu.contaNumero, '-') as numeroGuia,
        fu.numeroLote as numeroLote,
        fu.competencia,
        DATE_FORMAT(fu.dataExecucao, '%Y-%m-%d') as dataExecucao,
        COALESCE(fu.codigoItem, fu.codigoItemTuss, '') as codigoItem,
        COALESCE(fu.descricaoItem, '') as descricaoItem,
        COALESCE(fu.tipoItem, '') as tipoItem,
        COALESCE(fu.quantidade, 1) as quantidade,
        CASE WHEN COALESCE(fu.quantidade, 1) > 0 THEN COALESCE(fu.valorFaturado, 0) / COALESCE(fu.quantidade, 1) ELSE COALESCE(fu.valorFaturado, 0) END as valorUnitario,
        COALESCE(fu.valorFaturado, 0) as valorTotal,
        fu.senha
      FROM faturamento_unificado fu
      WHERE ${sql.join(condicoesFu, sql` AND `)}
      ORDER BY fu.dataExecucao DESC, fu.id DESC
      LIMIT ${sql.raw(String(limite))}
    `);
    rowsBrutas = (fuRows as unknown as any[]) ?? [];
  }

  let valorTotalCobradoXml = 0;
  let valorTotalDevidoContrato = 0;
  let valorPerdaSubfaturamento = 0;
  let valorRiscoGlosaAcimaTabela = 0;
  let qtdSubfaturados = 0;
  let qtdAcimaContrato = 0;
  let qtdConformes = 0;
  let qtdSemTabela = 0;
  const guiasVistas = new Set<string>();
  const guiasSemSenha = new Set<string>();

  const agrupadoProc = new Map<
    string,
    {
      codigoItem: string;
      descricaoItem: string;
      ocorrencias: number;
      quantidadeTotal: number;
      somaUnitarioXml: number;
      valorUnitarioContrato: number | null;
      valorTotalXml: number;
      valorTotalContrato: number | null;
      diferencaTotal: number;
      statusCobranca:
        | "subfaturado"
        | "acima_contrato"
        | "conforme"
        | "sem_tabela";
    }
  >();

  const precosAplicaveis = await buscarPrecosPorItens(
    db,
    estabelecimentoId,
    rowsBrutas.map(r => ({
      convenioId,
      dataExecucao: r.dataExecucao,
      codigoItem: r.codigoItem,
    }))
  );
  const itens: ItemAuditoriaXmlContrato[] = rowsBrutas.map((r, indice) => {
    const codigo = String(r.codigoItem || "").trim();
    const qtd = Math.max(1, Number(r.quantidade) || 1);
    const totalXml = Number(r.valorTotal) || 0;
    const unitXml =
      Number(r.valorUnitario) > 0 ? Number(r.valorUnitario) : totalXml / qtd;
    const guia = String(r.numeroGuia || "-");
    guiasVistas.add(guia);
    if (!r.senha || !String(r.senha).trim()) {
      guiasSemSenha.add(guia);
    }

    const preco = precosAplicaveis[indice];
    const matchPreco = preco
      ? {
          valor: Number(preco.valor),
          descricao: preco.nome,
          fonte: `Tabela Portal #${preco.id}; vigência ${normalizarDataExecucao(preco.vigenciaInicio)}`,
        }
      : undefined;
    const unitContrato = matchPreco ? matchPreco.valor : null;
    const totalContrato =
      unitContrato !== null ? Number((unitContrato * qtd).toFixed(2)) : null;

    valorTotalCobradoXml += totalXml;

    let statusCobranca: ItemAuditoriaXmlContrato["statusCobranca"] =
      "sem_tabela";
    let diferencaTotal = 0;

    if (totalContrato !== null) {
      valorTotalDevidoContrato += totalContrato;
      diferencaTotal = Number((totalXml - totalContrato).toFixed(2));
      if (totalXml + 0.05 < totalContrato) {
        statusCobranca = "subfaturado";
        qtdSubfaturados++;
        valorPerdaSubfaturamento += totalContrato - totalXml;
      } else if (totalXml > totalContrato + 0.05) {
        statusCobranca = "acima_contrato";
        qtdAcimaContrato++;
        valorRiscoGlosaAcimaTabela += totalXml - totalContrato;
      } else {
        statusCobranca = "conforme";
        qtdConformes++;
      }
    } else {
      valorTotalDevidoContrato += totalXml;
      qtdSemTabela++;
    }

    let alertaRegra: string | null = null;
    if (statusCobranca === "subfaturado") {
      alertaRegra = `Cobrado R$ ${Math.abs(diferencaTotal).toFixed(2)} A MENOR no XML do que o valor pactuado em contrato (R$ ${unitContrato!.toFixed(2)}/un.).`;
    } else if (statusCobranca === "acima_contrato") {
      alertaRegra = `Cobrado R$ ${diferencaTotal.toFixed(2)} ACIMA da tabela vigente (R$ ${unitContrato!.toFixed(2)}/un.); risco de glosa por divergência de preço.`;
    } else if (!r.senha) {
      alertaRegra =
        "Guia sem senha/autorização informada no XML; conferir exigência contratual.";
    }

    if (codigo) {
      const procAtual = agrupadoProc.get(codigo) ?? {
        codigoItem: codigo,
        descricaoItem: String(r.descricaoItem || matchPreco?.descricao || "-"),
        ocorrencias: 0,
        quantidadeTotal: 0,
        somaUnitarioXml: 0,
        valorUnitarioContrato: unitContrato,
        valorTotalXml: 0,
        valorTotalContrato: totalContrato !== null ? 0 : null,
        diferencaTotal: 0,
        statusCobranca,
      };
      procAtual.ocorrencias += 1;
      procAtual.quantidadeTotal += qtd;
      procAtual.somaUnitarioXml += unitXml;
      procAtual.valorTotalXml += totalXml;
      if (procAtual.valorUnitarioContrato !== unitContrato)
        procAtual.valorUnitarioContrato = null;
      if (totalContrato === null) {
        procAtual.valorTotalContrato = null;
        procAtual.diferencaTotal = 0;
        procAtual.statusCobranca = "sem_tabela";
      }
      if (procAtual.valorTotalContrato !== null && totalContrato !== null) {
        procAtual.valorTotalContrato += totalContrato;
        procAtual.diferencaTotal = Number(
          (procAtual.valorTotalXml - procAtual.valorTotalContrato).toFixed(2)
        );
        if (procAtual.valorTotalXml + 0.05 < procAtual.valorTotalContrato) {
          procAtual.statusCobranca = "subfaturado";
        } else if (
          procAtual.valorTotalXml >
          procAtual.valorTotalContrato + 0.05
        ) {
          procAtual.statusCobranca = "acima_contrato";
        } else {
          procAtual.statusCobranca = "conforme";
        }
      }
      agrupadoProc.set(codigo, procAtual);
    }

    return {
      id: Number(r.id),
      numeroGuia: guia,
      numeroLote: r.numeroLote ? String(r.numeroLote) : null,
      competencia: r.competencia ? String(r.competencia) : null,
      dataExecucao: r.dataExecucao ? String(r.dataExecucao) : null,
      codigoItem: codigo || "-",
      descricaoItem: String(r.descricaoItem || matchPreco?.descricao || "-"),
      quantidade: qtd,
      valorUnitarioXml: Number(unitXml.toFixed(2)),
      valorTotalXml: Number(totalXml.toFixed(2)),
      valorUnitarioContrato: unitContrato,
      valorTotalContrato: totalContrato,
      diferencaTotal,
      statusCobranca,
      fontePreco: matchPreco?.fonte ?? null,
      alertaRegra,
    };
  });

  const resumoPorProcedimento = Array.from(agrupadoProc.values())
    .map(p => ({
      codigoItem: p.codigoItem,
      descricaoItem: p.descricaoItem,
      ocorrencias: p.ocorrencias,
      quantidadeTotal: p.quantidadeTotal,
      valorUnitarioMedioXml: Number(
        (p.somaUnitarioXml / Math.max(1, p.ocorrencias)).toFixed(2)
      ),
      valorUnitarioContrato: p.valorUnitarioContrato,
      valorTotalXml: Number(p.valorTotalXml.toFixed(2)),
      valorTotalContrato:
        p.valorTotalContrato !== null
          ? Number(p.valorTotalContrato.toFixed(2))
          : null,
      diferencaTotal: p.diferencaTotal,
      statusCobranca: p.statusCobranca,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.diferencaTotal) - Math.abs(a.diferencaTotal) ||
        b.valorTotalXml - a.valorTotalXml
    )
    .slice(0, 50);

  return {
    contratoId: params.contratoId,
    convenioId,
    convenioNome,
    competenciasDisponiveis,
    lotesDisponiveis,
    resumo: {
      totalItensXml: itens.length,
      totalGuiasXml: guiasVistas.size,
      valorTotalCobradoXml: Number(valorTotalCobradoXml.toFixed(2)),
      valorTotalDevidoContrato: Number(valorTotalDevidoContrato.toFixed(2)),
      valorPerdaSubfaturamento: Number(valorPerdaSubfaturamento.toFixed(2)),
      valorRiscoGlosaAcimaTabela: Number(valorRiscoGlosaAcimaTabela.toFixed(2)),
      qtdSubfaturados,
      qtdAcimaContrato,
      qtdConformes,
      qtdSemTabela,
      qtdGuiasSemSenha: guiasSemSenha.size,
    },
    resumoPorProcedimento,
    itens,
  };
}

// ============================================================================
// LIGAÇÃO 2: RECURSOS DE GLOSAS x CONTRATO (FUNDAMENTAÇÃO E CONTESTAÇÃO)
// ============================================================================

export interface ItemGlosaAuditadoContrato {
  id: number;
  origem: "demonstrativo" | "conciliacao";
  numeroGuia: string;
  paciente: string;
  dataExecucao: string | null;
  competencia: string | null;
  codigoItem: string;
  descricaoItem: string;
  quantidade: number;
  valorFaturado: number;
  valorPago: number;
  valorGlosa: number;
  valorContratadoTabela: number | null;
  valorRecursoSugerido: number;
  codigoGlosa: string | null;
  motivoGlosa: string | null;
  classificacaoContrato:
    | "glosa_indevida_abaixo_contrato"
    | "glosa_total_contestavel"
    | "ajuste_contratual_legitimo"
    | "glosa_tecnica_contestavel";
  justificativaContratualSugerida: string;
  justificativaAtual: string | null;
}

export interface ResultadoAuditoriaGlosasContrato {
  contratoId: number;
  convenioId: number;
  convenioNome: string;
  prazoRecursoGlosa: string;
  resumo: {
    totalItensGlosados: number;
    valorTotalGlosado: number;
    valorContestavelContrato: number;
    valorAjusteTabelaLegitimo: number;
    qtdGlosaIndevidaTabela: number;
    qtdGlosaTotal: number;
    qtdAjusteTabela: number;
    qtdJaComJustificativa: number;
  };
  clausulasDefesaGlosa: Array<[string, string]>;
  itens: ItemGlosaAuditadoContrato[];
}

async function auditarGlosasPorContratoInterno(params: {
  contratoId: number;
  competencia?: string;
  limit?: number;
}): Promise<ResultadoAuditoriaGlosasContrato> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const dossie = await obterDossieContratual(params.contratoId);
  const { estabelecimentoId, convenioId, convenio: convenioNome } = dossie;

  const refContrato = dossie.numeroContrato
    ? `Contrato nº ${dossie.numeroContrato}`
    : `Contrato vigente (${convenioNome})`;
  const docRef = dossie.documentos[0]?.arquivo
    ? ` (${dossie.documentos[0].arquivo})`
    : "";

  const limite = Math.min(Math.max(params.limit ?? 150, 20), 400);

  // Buscar itens glosados no demonstrativo
  const condDemo = [
    sql`d.estabelecimentoId = ${estabelecimentoId}`,
    sql`d.convenio_id = ${convenioId}`,
    sql`COALESCE(d.valor_glosa, 0) > 0`,
    sql`COALESCE(d.glosa_aceita, 0) = 0`,
  ];
  if (params.competencia && params.competencia !== "todas") {
    condDemo.push(
      sql`DATE_FORMAT(d.data_referencia, '%Y-%m') = ${params.competencia}`
    );
  }

  const [demoRows] = await db.execute(sql`
    SELECT
      d.id,
      'demonstrativo' as origem,
      COALESCE(d.numero_guia, '-') as numeroGuia,
      COALESCE(d.nome_beneficiario, '-') as paciente,
      DATE_FORMAT(d.data_execucao, '%Y-%m-%d') as dataExecucao,
      DATE_FORMAT(d.data_referencia, '%Y-%m') as competencia,
      COALESCE(d.codigo_item, '') as codigoItem,
      COALESCE(d.descricao_item, '') as descricaoItem,
      COALESCE(d.quantidade, 1) as quantidade,
      COALESCE(d.valor_informado, COALESCE(d.valor_pago, 0) + COALESCE(d.valor_glosa, 0)) as valorFaturado,
      COALESCE(d.valor_pago, 0) as valorPago,
      COALESCE(d.valor_glosa, 0) as valorGlosa,
      d.codigo_glosa as codigoGlosa,
      COALESCE(d.erro_tiss, 'Glosa apontada no demonstrativo') as motivoGlosa,
      d.justificativa_recurso as justificativaAtual
    FROM demonstrativo d
    WHERE ${sql.join(condDemo, sql` AND `)}
    ORDER BY d.valor_glosa DESC, d.id DESC
    LIMIT ${sql.raw(String(limite))}
  `);

  let rowsGlosa = (demoRows as unknown as any[]) ?? [];

  if (rowsGlosa.length === 0) {
    const condConc = [
      sql`ca.estabelecimentoId = ${estabelecimentoId}`,
      sql`ca.convenioId = ${convenioId}`,
      sql`COALESCE(ca.valorGlosa, 0) > 0`,
      sql`COALESCE(ca.glosaAceita, 0) = 0`,
    ];
    if (params.competencia && params.competencia !== "todas") {
      condConc.push(sql`ca.competencia LIKE ${`${params.competencia}%`}`);
    }
    const [concRows] = await db.execute(sql`
      SELECT
        ca.id,
        'conciliacao' as origem,
        COALESCE(ca.numeroGuia, ca.contaNumero, '-') as numeroGuia,
        COALESCE(ca.pacienteNome, '-') as paciente,
        DATE_FORMAT(ca.dataExecucao, '%Y-%m-%d') as dataExecucao,
        ca.competencia,
        COALESCE(ca.codigoItem, '') as codigoItem,
        COALESCE(ca.descricaoItem, '') as descricaoItem,
        COALESCE(ca.quantidade, 1) as quantidade,
        COALESCE(ca.valorFaturado, 0) as valorFaturado,
        COALESCE(ca.valorPago, 0) as valorPago,
        COALESCE(ca.valorGlosa, 0) as valorGlosa,
        ca.codigoGlosa,
        COALESCE(ca.motivoGlosa, 'Glosa identificada na conciliação') as motivoGlosa,
        rj.justificativa as justificativaAtual
      FROM conciliados_automatico ca
      LEFT JOIN recursos_glosa_justificativas rj ON rj.conciliadoId = ca.id
      WHERE ${sql.join(condConc, sql` AND `)}
      ORDER BY ca.valorGlosa DESC, ca.id DESC
      LIMIT ${sql.raw(String(limite))}
    `);
    rowsGlosa = (concRows as unknown as any[]) ?? [];
  }

  let valorTotalGlosado = 0;
  let valorContestavelContrato = 0;
  let valorAjusteTabelaLegitimo = 0;
  let qtdGlosaIndevidaTabela = 0;
  let qtdGlosaTotal = 0;
  let qtdAjusteTabela = 0;
  let qtdJaComJustificativa = 0;

  const precosAplicaveis = await buscarPrecosPorItens(
    db,
    estabelecimentoId,
    rowsGlosa.map(r => ({
      convenioId,
      dataExecucao: r.dataExecucao,
      codigoItem: r.codigoItem,
    }))
  );
  const itens: ItemGlosaAuditadoContrato[] = rowsGlosa.map((r, indice) => {
    const codigo = String(r.codigoItem || "").trim();
    const qtd = Math.max(1, Number(r.quantidade) || 1);
    const vFaturado = Number(r.valorFaturado) || 0;
    const vPago = Number(r.valorPago) || 0;
    const vGlosa = Number(r.valorGlosa) || 0;

    valorTotalGlosado += vGlosa;
    if (
      r.justificativaAtual &&
      String(r.justificativaAtual).trim().length > 5
    ) {
      qtdJaComJustificativa++;
    }

    const preco = precosAplicaveis[indice];
    const matchPreco = preco
      ? {
          valor: Number(preco.valor),
          descricao: preco.nome,
          fonte: `Tabela Portal #${preco.id}; vigência ${normalizarDataExecucao(preco.vigenciaInicio)}`,
        }
      : undefined;
    const valorContratadoTotal = matchPreco
      ? Number((matchPreco.valor * qtd).toFixed(2))
      : null;

    let classificacaoContrato: ItemGlosaAuditadoContrato["classificacaoContrato"] =
      "glosa_tecnica_contestavel";
    let valorRecursoSugerido = vGlosa;
    let justificativaContratualSugerida = "";

    if (valorContratadoTotal !== null) {
      if (vPago + 0.05 < valorContratadoTotal) {
        classificacaoContrato = "glosa_indevida_abaixo_contrato";
        qtdGlosaIndevidaTabela++;
        valorRecursoSugerido = Number(
          Math.max(0, Math.min(vGlosa, valorContratadoTotal - vPago)).toFixed(2)
        );
        valorContestavelContrato += valorRecursoSugerido;
        justificativaContratualSugerida = `Solicitamos a reversão da glosa e o pagamento complementar de R$ ${valorRecursoSugerido.toFixed(2)} referente ao item ${codigo} (${r.descricaoItem || matchPreco?.descricao || "procedimento"}). Conforme ${refContrato}${docRef} e tabela de remuneração vigente (${matchPreco?.fonte}), o valor unitário pactuado é de R$ ${matchPreco!.valor.toFixed(2)} (total contratado R$ ${valorContratadoTotal.toFixed(2)} para ${qtd} un.), tendo sido pago apenas R$ ${vPago.toFixed(2)}.`;
      } else if (
        vFaturado > valorContratadoTotal + 0.05 &&
        Math.abs(vPago - valorContratadoTotal) <= 0.05
      ) {
        classificacaoContrato = "ajuste_contratual_legitimo";
        qtdAjusteTabela++;
        valorRecursoSugerido = 0;
        valorAjusteTabelaLegitimo += vGlosa;
        justificativaContratualSugerida = `Ajuste de tabela contratual: o valor pago (R$ ${vPago.toFixed(2)}) corresponde integralmente ao valor pactuado no ${refContrato} (R$ ${valorContratadoTotal.toFixed(2)}). Recomenda-se ajustar a tabela de faturamento para evitar glosa nominal nos próximos lotes.`;
      } else {
        valorContestavelContrato += vGlosa;
        justificativaContratualSugerida = `Contestamos a glosa de R$ ${vGlosa.toFixed(2)} sobre o item ${codigo} (${r.descricaoItem || "procedimento"}). O procedimento foi devidamente executado e faturado em conformidade com o ${refContrato}${docRef}, dentro do prazo regulamentar de recurso (${dossie.resumo_executivo.prazoRecursoGlosa}), requerendo-se o pagamento integral.`;
      }
    } else if (vPago === 0) {
      classificacaoContrato = "glosa_total_contestavel";
      qtdGlosaTotal++;
      valorContestavelContrato += vGlosa;
      justificativaContratualSugerida = `Contestamos a retenção integral (R$ ${vGlosa.toFixed(2)}) do procedimento/item ${codigo || ""} (${r.descricaoItem || "atendimento hospitalar"}) na Guia ${r.numeroGuia}. Conforme ${refContrato}${docRef}, os serviços assistenciais prestados e comprovados em prontuário/guia TISS não podem sofrer glosa total imotivada, solicitando-se o deferimento e repasse no prazo contratual (${dossie.resumo_executivo.prazoRecursoGlosa}).`;
    } else {
      valorContestavelContrato += vGlosa;
      justificativaContratualSugerida = `Solicitamos revisão e pagamento da glosa parcial de R$ ${vGlosa.toFixed(2)} no item ${codigo} (${r.descricaoItem || "procedimento"}), executado em estrita observância às regras de atendimento e faturamento TISS previstas no ${refContrato}${docRef}.`;
    }

    return {
      id: Number(r.id),
      origem: (r.origem === "conciliacao" ? "conciliacao" : "demonstrativo") as
        | "demonstrativo"
        | "conciliacao",
      numeroGuia: String(r.numeroGuia || "-"),
      paciente: String(r.paciente || "-"),
      dataExecucao: r.dataExecucao ? String(r.dataExecucao) : null,
      competencia: r.competencia ? String(r.competencia) : null,
      codigoItem: codigo || "-",
      descricaoItem: String(r.descricaoItem || "-"),
      quantidade: qtd,
      valorFaturado: Number(vFaturado.toFixed(2)),
      valorPago: Number(vPago.toFixed(2)),
      valorGlosa: Number(vGlosa.toFixed(2)),
      valorContratadoTabela: valorContratadoTotal,
      valorRecursoSugerido,
      codigoGlosa: r.codigoGlosa ? String(r.codigoGlosa) : null,
      motivoGlosa: r.motivoGlosa ? String(r.motivoGlosa) : null,
      classificacaoContrato,
      justificativaContratualSugerida,
      justificativaAtual: r.justificativaAtual
        ? String(r.justificativaAtual)
        : null,
    };
  });

  const clausulasDefesaGlosa = dossie.clausulas.filter(([tema, regra]) =>
    /glosa|recurso|pagamento|faturamento|autoriza|urg[êe]ncia|tabela|pre[çc]o/i.test(
      `${tema} ${regra}`
    )
  );

  return {
    contratoId: params.contratoId,
    convenioId,
    convenioNome,
    prazoRecursoGlosa: dossie.resumo_executivo.prazoRecursoGlosa,
    resumo: {
      totalItensGlosados: itens.length,
      valorTotalGlosado: Number(valorTotalGlosado.toFixed(2)),
      valorContestavelContrato: Number(valorContestavelContrato.toFixed(2)),
      valorAjusteTabelaLegitimo: Number(valorAjusteTabelaLegitimo.toFixed(2)),
      qtdGlosaIndevidaTabela,
      qtdGlosaTotal,
      qtdAjusteTabela,
      qtdJaComJustificativa,
    },
    clausulasDefesaGlosa:
      clausulasDefesaGlosa.length > 0
        ? clausulasDefesaGlosa
        : dossie.clausulas.slice(0, 5),
    itens,
  };
}

async function aplicarFundamentacaoContratualGlosasInterno(params: {
  contratoId: number;
  itens: Array<{
    id: number;
    origem: "demonstrativo" | "conciliacao";
    justificativa: string;
    valorRecurso: number;
  }>;
}): Promise<{ atualizados: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  if (params.itens.length > 200) divergenciaDossie();
  return db.transaction(async tx => {
    const [contrato] = await tx
      .select()
      .from(contratosConvenios)
      .where(eq(contratosConvenios.id, params.contratoId))
      .for("update");
    if (!contrato) divergenciaDossie();
    const vistos = new Set<string>();
    let atualizados = 0;
    // Ordem de locks determinística, sem truncamento ou descarte de IDs inválidos.
    for (const item of [...params.itens].sort(
      (a, b) => a.origem.localeCompare(b.origem) || a.id - b.id
    )) {
      const chave = `${item.origem}:${item.id}`;
      const justificativa = String(item.justificativa || "").trim();
      const valor = centavosDossie(item.valorRecurso);
      if (
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        vistos.has(chave) ||
        !["demonstrativo", "conciliacao"].includes(item.origem) ||
        justificativa.length < 5 ||
        justificativa.length > 6000 ||
        valor > 999999999999n
      )
        divergenciaDossie();
      vistos.add(chave);
      const valorSql = `${valor / 100n}.${String(valor % 100n).padStart(2, "0")}`;
      if (item.origem === "demonstrativo") {
        const [rows] = await tx.execute(sql`
          SELECT d.id, d.estabelecimentoId, d.convenio_id as convenioId,
            d.valor_glosa as valorGlosa, d.glosa_aceita as glosaAceita,
            d.classificacao_glosa as classificacaoGlosa, d.recurso_status as statusRecurso,
            d.recurso_id as recursoId, d.justificativa_recurso as justificativa,
            d.valor_recurso as valorRecurso
          FROM demonstrativo d
          WHERE d.id = ${item.id} AND d.estabelecimentoId = ${contrato.estabelecimentoId}
            AND d.convenio_id = ${contrato.convenioId}
          FOR UPDATE
        `);
        const registros = rows as unknown as any[];
        const r = registros[0];
        if (
          registros.length !== 1 ||
          Number(r.estabelecimentoId) !== contrato.estabelecimentoId ||
          Number(r.convenioId) !== contrato.convenioId ||
          Number(r.glosaAceita || 0) !== 0 ||
          ["aceitar", "auto_aceitar"].includes(r.classificacaoGlosa) ||
          r.recursoId != null ||
          ![null, "sem_recurso", "recurso_criado"].includes(r.statusRecurso) ||
          centavosDossie(r.valorGlosa) <= 0n ||
          valor > centavosDossie(r.valorGlosa)
        )
          divergenciaDossie();
        if (
          r.justificativa === justificativa &&
          r.valorRecurso != null &&
          centavosDossie(r.valorRecurso) === valor &&
          r.statusRecurso === "recurso_criado"
        )
          continue;
        exigirUmaGravacao(
          await tx.execute(sql`
          UPDATE demonstrativo
          SET justificativa_recurso = ${justificativa}, valor_recurso = ${valorSql}, recurso_status = 'recurso_criado'
          WHERE id = ${item.id} AND estabelecimentoId = ${contrato.estabelecimentoId}
            AND convenio_id = ${contrato.convenioId}
            AND COALESCE(glosa_aceita, 0) = 0 AND valor_glosa >= ${valorSql} AND valor_glosa > 0
            AND recurso_id IS NULL AND COALESCE(recurso_status, 'sem_recurso') IN ('sem_recurso', 'recurso_criado')
            AND COALESCE(classificacao_glosa, 'pendente') NOT IN ('aceitar', 'auto_aceitar')
        `)
        );
      } else {
        const [rows] = await tx.execute(sql`
          SELECT ca.id, ca.estabelecimentoId, ca.convenioId, ca.valorGlosa, ca.glosaAceita,
            ca.statusRecursoItem as statusRecurso, ca.xmlRecursoLoteId as recursoId, ca.valorRecurso,
            ca.statusConciliacao,
            EXISTS(SELECT 1 FROM recursos_glosa_itens ri WHERE ri.conciliadoId = ca.id) as vinculado
          FROM conciliados_automatico ca
          WHERE ca.id = ${item.id} AND ca.estabelecimentoId = ${contrato.estabelecimentoId}
            AND ca.convenioId = ${contrato.convenioId}
          FOR UPDATE
        `);
        const registros = rows as unknown as any[];
        const r = registros[0];
        if (
          registros.length !== 1 ||
          Number(r.estabelecimentoId) !== contrato.estabelecimentoId ||
          Number(r.convenioId) !== contrato.convenioId ||
          Number(r.glosaAceita || 0) !== 0 ||
          r.recursoId != null ||
          Number(r.vinculado) !== 0 ||
          ![null, "iniciado"].includes(r.statusRecurso) ||
          !["glosa_total", "glosa_parcial"].includes(r.statusConciliacao) ||
          centavosDossie(r.valorGlosa) <= 0n ||
          valor > centavosDossie(r.valorGlosa)
        )
          divergenciaDossie();
        // Estrutura JÁ usada pelo fluxo de recurso. Não criar/alterar tabelas aqui.
        // Ausência da tabela/coluna interrompe o lote e provoca rollback.
        const [justRows] = await tx.execute(sql`
          SELECT rj.justificativa FROM recursos_glosa_justificativas rj
          INNER JOIN conciliados_automatico ca ON ca.id = rj.conciliadoId
          WHERE rj.conciliadoId = ${item.id} AND ca.estabelecimentoId = ${contrato.estabelecimentoId}
            AND ca.convenioId = ${contrato.convenioId} FOR UPDATE
        `);
        const existentes = justRows as unknown as any[];
        if (existentes.length > 1) divergenciaDossie();
        const textoIgual = existentes[0]?.justificativa === justificativa;
        const estadoIgual =
          r.valorRecurso != null &&
          centavosDossie(r.valorRecurso) === valor &&
          r.statusRecurso === "iniciado";
        if (textoIgual && estadoIgual) continue;
        if (!textoIgual) {
          if (existentes.length) {
            exigirUmaGravacao(
              await tx.execute(sql`
              UPDATE recursos_glosa_justificativas SET justificativa = ${justificativa}
              WHERE conciliadoId = ${item.id}
            `)
            );
          } else {
            exigirUmaGravacao(
              await tx.execute(sql`
              INSERT INTO recursos_glosa_justificativas (conciliadoId, justificativa)
              VALUES (${item.id}, ${justificativa})
            `)
            );
          }
          const [salvos] = await tx.execute(sql`
            SELECT justificativa FROM recursos_glosa_justificativas WHERE conciliadoId = ${item.id} FOR UPDATE
          `);
          if (
            (salvos as unknown as any[]).length !== 1 ||
            (salvos as unknown as any[])[0].justificativa !== justificativa
          )
            divergenciaDossie();
        }
        if (!estadoIgual)
          exigirUmaGravacao(
            await tx.execute(sql`
          UPDATE conciliados_automatico SET valorRecurso = ${valorSql}, statusRecursoItem = 'iniciado'
          WHERE id = ${item.id} AND estabelecimentoId = ${contrato.estabelecimentoId}
            AND convenioId = ${contrato.convenioId} AND COALESCE(glosaAceita, 0) = 0
            AND valorGlosa >= ${valorSql} AND valorGlosa > 0 AND xmlRecursoLoteId IS NULL
            AND (statusRecursoItem IS NULL OR statusRecursoItem = 'iniciado')
            AND statusConciliacao IN ('glosa_total', 'glosa_parcial')
            AND NOT EXISTS(SELECT 1 FROM recursos_glosa_itens ri WHERE ri.conciliadoId = conciliados_automatico.id)
        `)
          );
      }
      atualizados++; // Um item, mesmo quando texto e estado exigem duas gravações.
    }
    return { atualizados };
  });
}

export async function obterDossieContratual(
  ...args: Parameters<typeof obterDossieContratualInterno>
): Promise<Awaited<ReturnType<typeof obterDossieContratualInterno>>> {
  return operacaoDossieSegura(() => obterDossieContratualInterno(...args));
}

export async function gerarDossieContratualComIA(
  ...args: Parameters<typeof gerarDossieContratualComIAInterno>
): Promise<Awaited<ReturnType<typeof gerarDossieContratualComIAInterno>>> {
  return operacaoDossieSegura(() => gerarDossieContratualComIAInterno(...args));
}

export async function sincronizarTabelaValoresDossie(
  ...args: Parameters<typeof sincronizarTabelaValoresDossieInterno>
): Promise<Awaited<ReturnType<typeof sincronizarTabelaValoresDossieInterno>>> {
  return operacaoDossieSegura(() =>
    sincronizarTabelaValoresDossieInterno(...args)
  );
}

export async function auditarCobrancaXmlPorContrato(
  ...args: Parameters<typeof auditarCobrancaXmlPorContratoInterno>
): Promise<Awaited<ReturnType<typeof auditarCobrancaXmlPorContratoInterno>>> {
  return operacaoDossieSegura(() =>
    auditarCobrancaXmlPorContratoInterno(...args)
  );
}

export async function auditarGlosasPorContrato(
  ...args: Parameters<typeof auditarGlosasPorContratoInterno>
): Promise<Awaited<ReturnType<typeof auditarGlosasPorContratoInterno>>> {
  return operacaoDossieSegura(() => auditarGlosasPorContratoInterno(...args));
}

export async function aplicarFundamentacaoContratualGlosas(
  ...args: Parameters<typeof aplicarFundamentacaoContratualGlosasInterno>
): Promise<
  Awaited<ReturnType<typeof aplicarFundamentacaoContratualGlosasInterno>>
> {
  return operacaoDossieSegura(() =>
    aplicarFundamentacaoContratualGlosasInterno(...args)
  );
}
