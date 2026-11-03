import { createHash } from "node:crypto";
import { parseXML } from "../parsers";
import {
  convenios,
  convenioEstabelecimentoPrestador,
  credenciaisPortais,
  estabelecimentos,
} from "../../drizzle/schema";
import { ESTABELECIMENTO_CENTRAL_SAFATLE } from "../hospitalScope";

export interface ResumoGuiaXmlTiss {
  numeroGuia: string;
  pacienteNome: string;
  carteirinha?: string;
  senha?: string;
  qtdItens: number;
  valorTotal: number;
}

export interface ResultadoIdentificacaoXmlTiss {
  hashXml: string;
  registroAns: string | null;
  codigoPrestadorXml: string | null;
  cnpjPrestadorXml: string | null;
  numeroLote: string;
  versaoTiss: string | null;
  tipoTransacao: string | null;
  qtdGuias: number;
  qtdItens: number;
  valorTotal: number;
  resumoGuias: ResumoGuiaXmlTiss[];
  // Roteamento descoberto no banco
  estabelecimentoIdDetectado: number | null;
  estabelecimentoNomeDetectado: string | null;
  convenioIdDetectado: number | null;
  convenioNomeDetectado: string | null;
  possuiCredencialAtiva: boolean;
  statusCredencial: string | null;
  metodoIdentificacao: string;
  conflitoHospital: boolean;
  mensagemConflito: string | null;
}

function somenteDigitos(valor?: string | null): string {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarCodigoPrestador(valor?: string | null): string {
  return String(valor || "")
    .trim()
    .replace(/^0+/, "")
    .toUpperCase();
}

/**
 * Extrai o texto da primeira ocorrência de uma tag XML ignorando prefixo de namespace (ex: ans:registroANS ou registroANS)
 */
function extrairTagXml(xmlTexto: string, nomeTag: string): string | null {
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${nomeTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${nomeTag}>`,
    "i"
  );
  const match = regex.exec(xmlTexto);
  if (!match || !match[1]) return null;
  const limpo = match[1].replace(/<[^>]+>/g, "").trim();
  return limpo || null;
}

/**
 * Extrai um bloco XML inteiro (ex: <ans:cabecalho>...</ans:cabecalho>)
 */
function extrairBlocoXml(xmlTexto: string, nomeTag: string): string | null {
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${nomeTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${nomeTag}>`,
    "i"
  );
  const match = regex.exec(xmlTexto);
  return match ? match[0] : null;
}

/**
 * Extrai a versão TISS do cabeçalho ou do schema
 */
function extrairVersaoTiss(cabecalhoXml: string, xmlCompleto: string): string | null {
  const direto =
    extrairTagXml(cabecalhoXml, "Padrao") ||
    extrairTagXml(cabecalhoXml, "versaoPadrao");
  if (direto) return direto;

  const schemaMatch = /tissV(\d+_\d+_\d+)\.xsd/i.exec(xmlCompleto);
  if (schemaMatch) {
    return schemaMatch[1].replace(/_/g, ".");
  }
  return null;
}

/**
 * Conta guias diretamente no XML caso o parser de itens detalhados encontre 0 procedimentos
 */
function extrairFallbackGuiasValores(xmlTexto: string): {
  qtdGuias: number;
  valorTotal: number;
} {
  const regexGuias =
    /<(?:[a-zA-Z0-9_-]+:)?(?:guiaSP-SADT|guiaResumoInternacao|guiaConsulta|guiaHonorarios|guiaOdonto|guiaTratamentoOdonto)\b/gi;
  const matchesGuias = xmlTexto.match(regexGuias);
  const qtdGuias = matchesGuias ? matchesGuias.length : 0;

  const regexValorGeral =
    /<(?:[a-zA-Z0-9_-]+:)?(?:valorTotalGeral|valorTotalGuia|valorTotalHonorarios|valorProcedimento)\b[^>]*>\s*([\d.,]+)\s*<\//gi;
  let soma = 0;
  let m: RegExpExecArray | null;
  while ((m = regexValorGeral.exec(xmlTexto)) !== null) {
    const val = parseFloat(m[1].replace(",", "."));
    if (!Number.isNaN(val)) soma += val;
  }

  return { qtdGuias: Math.max(qtdGuias, 1), valorTotal: Number(soma.toFixed(2)) };
}

/**
 * Lê o XML bruto que o faturista subiu, extrai os códigos de identificação do <ans:cabecalho>,
 * calcula quantidade de guias e valor total, e descobre no banco de dados de qual Hospital e Convênio é o arquivo.
 */
export async function identificarERotearXmlTiss(
  xmlBuffer: Buffer,
  db: any,
  opcoes?: {
    estabelecimentoIdContexto?: number | null;
    convenioIdForcado?: number | null;
  }
): Promise<ResultadoIdentificacaoXmlTiss> {
  const hashXml = createHash("sha256").update(xmlBuffer).digest("hex");
  const xmlTexto = xmlBuffer.toString("utf-8");

  const cabecalhoXml = extrairBlocoXml(xmlTexto, "cabecalho") || xmlTexto.slice(0, 6000);
  const origemXml = extrairBlocoXml(cabecalhoXml, "origem") || cabecalhoXml;
  const destinoXml = extrairBlocoXml(cabecalhoXml, "destino") || cabecalhoXml;

  const registroAns =
    extrairTagXml(destinoXml, "registroANS") ||
    extrairTagXml(cabecalhoXml, "registroANS");

  const codigoPrestadorXml =
    extrairTagXml(origemXml, "codigoPrestadorNaOperadora") ||
    extrairTagXml(xmlTexto, "codigoPrestadorNaOperadora");

  const cnpjPrestadorXml =
    extrairTagXml(origemXml, "codigoCNPJ") ||
    extrairTagXml(origemXml, "CNPJ") ||
    extrairTagXml(origemXml, "cnpjContratado") ||
    extrairTagXml(xmlTexto, "cnpjContratado");

  const numeroLote =
    extrairTagXml(xmlTexto, "numeroLote") ||
    extrairTagXml(cabecalhoXml, "sequencialTransacao") ||
    `LOTE-${hashXml.slice(0, 8).toUpperCase()}`;

  const versaoTiss = extrairVersaoTiss(cabecalhoXml, xmlTexto);
  const tipoTransacao = extrairTagXml(cabecalhoXml, "tipoTransacao");

  // Extrair guias, itens e valores usando o parser TISS do Safatle
  const parsed = await parseXML(xmlBuffer);
  const mapGuias = new Map<string, ResumoGuiaXmlTiss>();
  let valorTotalCalculado = 0;
  let qtdItens = 0;

  if (parsed.success && parsed.procedimentos.length > 0) {
    for (const proc of parsed.procedimentos) {
      const guiaKey =
        proc.guiaNumero ||
        proc.numeroGuiaOperadora ||
        proc.senha ||
        proc.pacienteNome ||
        "GUIA-UNICA";
      const qtd = Number(proc.quantidade) || 1;
      const vu = Number(proc.valorUnitario) || 0;
      const vt = Number(proc.valorTotal) || qtd * vu;
      valorTotalCalculado += vt;
      qtdItens += 1;

      const atual = mapGuias.get(guiaKey);
      if (atual) {
        atual.qtdItens += 1;
        atual.valorTotal = Number((atual.valorTotal + vt).toFixed(2));
      } else {
        mapGuias.set(guiaKey, {
          numeroGuia: String(guiaKey),
          pacienteNome: proc.pacienteNome || "Beneficiário no XML",
          carteirinha: proc.pacienteCarteirinha,
          senha: proc.senha,
          qtdItens: 1,
          valorTotal: Number(vt.toFixed(2)),
        });
      }
    }
  } else {
    const fallback = extrairFallbackGuiasValores(xmlTexto);
    valorTotalCalculado = fallback.valorTotal;
    qtdItens = fallback.qtdGuias;
    mapGuias.set(numeroLote, {
      numeroGuia: numeroLote,
      pacienteNome: `${fallback.qtdGuias} guia(s) no lote`,
      qtdItens: fallback.qtdGuias,
      valorTotal: fallback.valorTotal,
    });
  }

  const resumoGuias = Array.from(mapGuias.values());
  const qtdGuias = Math.max(resumoGuias.length, 1);
  const valorTotal = Number(valorTotalCalculado.toFixed(2));

  // =========================================================================
  // 2. DESCOBERTA AUTOMÁTICA NO BANCO (ESTABELECIMENTO + CONVÊNIO + CREDENCIAL)
  // =========================================================================
  const todosEstabelecimentos = await db.select().from(estabelecimentos);
  const todosConvenios = await db.select().from(convenios);
  const todasCredenciais = await db.select().from(credenciaisPortais);
  const todosVinculosPrestador = await db
    .select()
    .from(convenioEstabelecimentoPrestador);

  const estabPorId = new Map<number, any>(
    todosEstabelecimentos.map((e: any) => [Number(e.id), e])
  );
  const convPorId = new Map<number, any>(
    todosConvenios.map((c: any) => [Number(c.id), c])
  );

  let estabelecimentoIdDetectado: number | null = null;
  let convenioIdDetectado: number | null = opcoes?.convenioIdForcado || null;
  let metodoIdentificacao = "nao_identificado";

  const ansDigitos = somenteDigitos(registroAns);
  const codPrestNorm = normalizarCodigoPrestador(codigoPrestadorXml);
  const codPrestDigitos = somenteDigitos(codigoPrestadorXml);
  const cnpjDigitos =
    somenteDigitos(cnpjPrestadorXml) ||
    (codPrestDigitos.length === 14 ? codPrestDigitos : "");

  // A) Descobrir o Convênio pelo Registro ANS (se ainda não forçado)
  if (!convenioIdDetectado && ansDigitos) {
    // 1. Tenta nas credenciais cadastradas que tenham registroAns
    const credPorAns = todasCredenciais.find(
      (c: any) => somenteDigitos(c.registroAns) === ansDigitos
    );
    if (credPorAns) {
      convenioIdDetectado = Number(credPorAns.convenioId);
    }

    // 2. Tenta na tabela convenios (registroAns ou codigo)
    if (!convenioIdDetectado) {
      const convMatch = todosConvenios.find(
        (c: any) =>
          somenteDigitos(c.registroAns) === ansDigitos ||
          somenteDigitos(c.codigo) === ansDigitos
      );
      if (convMatch) {
        convenioIdDetectado = Number(convMatch.id);
      }
    }

    // 3. Mapeamento conhecido de Registro ANS das principais operadoras (Unimed Goiânia, IPASGO, CASSI, SulAmérica, Bradesco, Amil)
    if (!convenioIdDetectado) {
      const mapaAnsNomes: Record<string, string[]> = {
        "382876": ["UNIMED GOIANIA", "UNIMED"],
        "005711": ["BRADESCO"],
        "5711": ["BRADESCO"],
        "006246": ["SULAMERICA", "SUL AMERICA"],
        "6246": ["SULAMERICA", "SUL AMERICA"],
        "326305": ["AMIL"],
        "346659": ["CASSI"],
        "312924": ["SAUDE CAIXA", "CAIXA"],
        "000000": ["IPASGO"],
        "417548": ["IPASGO"],
      };
      const nomesAlvo = mapaAnsNomes[ansDigitos] || mapaAnsNomes[String(registroAns || "").trim()];
      if (nomesAlvo) {
        const convPorNome = todosConvenios.find((c: any) => {
          const nomeUp = String(c.nome || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase();
          return nomesAlvo.some((alvo) => nomeUp.includes(alvo));
        });
        if (convPorNome) convenioIdDetectado = Number(convPorNome.id);
      }
    }
  }

  // B) Descobrir o Estabelecimento (Hospital)
  // Prioridade 1: Match pelo codigoPrestadorOperadora no Cofre de Credenciais (diferencia inclusive filiais com mesmo CNPJ)
  if (codPrestNorm) {
    const credMatch = todasCredenciais.find((c: any) => {
      if (!c.estabelecimentoId || !c.codigoPrestadorOperadora) return false;
      const cNorm = normalizarCodigoPrestador(c.codigoPrestadorOperadora);
      const cDig = somenteDigitos(c.codigoPrestadorOperadora);
      const bateCodigo =
        cNorm === codPrestNorm ||
        (codPrestDigitos.length >= 4 && cDig === codPrestDigitos);
      if (!bateCodigo) return false;
      if (convenioIdDetectado && Number(c.convenioId) !== convenioIdDetectado) {
        return false;
      }
      return true;
    });

    if (credMatch) {
      estabelecimentoIdDetectado = Number(credMatch.estabelecimentoId);
      if (!convenioIdDetectado) convenioIdDetectado = Number(credMatch.convenioId);
      metodoIdentificacao = "cofre_codigo_prestador";
    }
  }

  // Prioridade 2: Match na tabela convenioEstabelecimentoPrestador
  if (!estabelecimentoIdDetectado && codPrestNorm) {
    const vincMatch = todosVinculosPrestador.find((v: any) => {
      if (v.ativo === "nao") return false;
      const vNorm = normalizarCodigoPrestador(v.codigoPrestador);
      const vDig = somenteDigitos(v.codigoPrestador);
      const bateCodigo =
        vNorm === codPrestNorm ||
        (codPrestDigitos.length >= 4 && vDig === codPrestDigitos);
      if (!bateCodigo) return false;
      if (convenioIdDetectado && Number(v.convenioId) !== convenioIdDetectado) {
        return false;
      }
      return true;
    });

    if (vincMatch) {
      estabelecimentoIdDetectado = Number(vincMatch.estabelecimentoId);
      if (!convenioIdDetectado) convenioIdDetectado = Number(vincMatch.convenioId);
      metodoIdentificacao = "vinculo_prestador_operadora";
    }
  }

  // Prioridade 3: Match pelo CNPJ do hospital na tabela estabelecimentos
  if (!estabelecimentoIdDetectado && cnpjDigitos.length === 14) {
    const estabMatch = todosEstabelecimentos.find(
      (e: any) =>
        Number(e.id) !== ESTABELECIMENTO_CENTRAL_SAFATLE &&
        somenteDigitos(e.cnpj) === cnpjDigitos
    );
    if (estabMatch) {
      estabelecimentoIdDetectado = Number(estabMatch.id);
      metodoIdentificacao = "cnpj_estabelecimento";
    }
  }

  // Prioridade 4: Verificar se o login da credencial é o próprio código/CNPJ do prestador (muito comum em Unimed/CASSI/IPASGO)
  if (!estabelecimentoIdDetectado && (codPrestNorm || cnpjDigitos)) {
    const credPorLogin = todasCredenciais.find((c: any) => {
      if (!c.estabelecimentoId) return false;
      const loginNorm = normalizarCodigoPrestador(c.login);
      const loginDig = somenteDigitos(c.login);
      return (
        (codPrestNorm && loginNorm === codPrestNorm) ||
        (codPrestDigitos.length >= 5 && loginDig === codPrestDigitos) ||
        (cnpjDigitos.length === 14 && loginDig === cnpjDigitos)
      );
    });
    if (credPorLogin) {
      estabelecimentoIdDetectado = Number(credPorLogin.estabelecimentoId);
      if (!convenioIdDetectado) convenioIdDetectado = Number(credPorLogin.convenioId);
      metodoIdentificacao = "login_credencial_portal";
    }
  }

  // =========================================================================
  // 3. TRAVA DE SEGURANÇA MULTI-HOSPITAL (ANTI-ERRO HUMANO NO UPLOAD)
  // =========================================================================
  let conflitoHospital = false;
  let mensagemConflito: string | null = null;
  const contextoId = opcoes?.estabelecimentoIdContexto
    ? Number(opcoes.estabelecimentoIdContexto)
    : null;

  if (
    contextoId &&
    contextoId !== ESTABELECIMENTO_CENTRAL_SAFATLE &&
    estabelecimentoIdDetectado &&
    estabelecimentoIdDetectado !== contextoId
  ) {
    const hospXml =
      estabPorId.get(estabelecimentoIdDetectado)?.nome ||
      `ID #${estabelecimentoIdDetectado}`;
    const hospTela =
      estabPorId.get(contextoId)?.nome || `ID #${contextoId}`;
    conflitoHospital = true;
    mensagemConflito = `Trava Multi-Hospital: O cabeçalho deste XML pertence a "${hospXml}" (Prestador: ${codigoPrestadorXml || cnpjPrestadorXml}), mas você selecionou "${hospTela}".`;
  }

  // Se o XML não tinha vínculo prévio mas o usuário selecionou um hospital específico (não-Central), assume o hospital selecionado
  const estabFinalId =
    estabelecimentoIdDetectado ||
    (contextoId && contextoId !== ESTABELECIMENTO_CENTRAL_SAFATLE
      ? contextoId
      : null);

  // Verificar se existe credencial ativa para o par (estabelecimentoId, convenioId)
  const credencialEncontrada = todasCredenciais.find((c: any) => {
    if (c.ativo === "nao") return false;
    const bateConv = convenioIdDetectado && Number(c.convenioId) === convenioIdDetectado;
    const bateEstab =
      !c.estabelecimentoId ||
      (estabFinalId && Number(c.estabelecimentoId) === estabFinalId);
    return Boolean(bateConv && bateEstab);
  });

  return {
    hashXml,
    registroAns,
    codigoPrestadorXml,
    cnpjPrestadorXml,
    numeroLote,
    versaoTiss,
    tipoTransacao,
    qtdGuias,
    qtdItens,
    valorTotal,
    resumoGuias: resumoGuias.slice(0, 30),
    estabelecimentoIdDetectado: estabFinalId,
    estabelecimentoNomeDetectado: estabFinalId
      ? estabPorId.get(estabFinalId)?.nome || `Hospital #${estabFinalId}`
      : null,
    convenioIdDetectado,
    convenioNomeDetectado: convenioIdDetectado
      ? convPorId.get(convenioIdDetectado)?.nome || `Convênio #${convenioIdDetectado}`
      : null,
    possuiCredencialAtiva: Boolean(credencialEncontrada),
    statusCredencial: credencialEncontrada
      ? credencialEncontrada.statusCredencial || "ATIVA"
      : null,
    metodoIdentificacao,
    conflitoHospital,
    mensagemConflito,
  };
}
