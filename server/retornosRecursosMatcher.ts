import { createHash } from "node:crypto";
import {
  RETORNO_MATCH_MAX_CANDIDATOS,
  retornoDataCivilValida,
  type RetornoCandidato,
  type RetornoEscopo,
  type RetornoMatch,
  type RetornoXmlLinha,
} from "../shared/retornosRecursos";

type DecimalCentavos = bigint | null;

function normalizarChave(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const normalizado = valor.normalize("NFKC").trim().toUpperCase();
  return normalizado.length > 0 ? normalizado : null;
}

function dataCivilDoCandidato(valor: string | Date | null): string | null {
  if (typeof valor === "string") {
    const normalizada = valor.trim();
    return retornoDataCivilValida(normalizada) ? normalizada : null;
  }
  if (!(valor instanceof Date) || !Number.isFinite(valor.getTime())) return null;
  const ano = valor.getUTCFullYear().toString().padStart(4, "0");
  const mes = (valor.getUTCMonth() + 1).toString().padStart(2, "0");
  const dia = valor.getUTCDate().toString().padStart(2, "0");
  const data = `${ano}-${mes}-${dia}`;
  return retornoDataCivilValida(data) ? data : null;
}

function decimalEmCentavos(valor: string | null): DecimalCentavos {
  if (typeof valor !== "string") return null;
  const encontrado = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(valor.trim());
  if (!encontrado) return null;
  return BigInt(encontrado[1]) * 100n + BigInt((encontrado[2] ?? "").padEnd(2, "0"));
}

function sequencialDaLinha(valor: string | null): number | null {
  if (valor === null) return null;
  if (!/^\d{1,12}$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
}

function escopoConfere(candidato: RetornoCandidato, escopo: RetornoEscopo): boolean {
  return candidato.estabelecimentoId === escopo.estabelecimentoId && candidato.convenioId === escopo.convenioId;
}

/**
 * Verifica somente identificadores que existem nos dois lados. Não infere tabela,
 * não aproxima códigos e não divide códigos de glosa compostos.
 */
function identificadoresConferem(linha: RetornoXmlLinha, candidato: RetornoCandidato, escopo: RetornoEscopo): boolean {
  if (!escopoConfere(candidato, escopo)) return false;

  const guiaPrestador = normalizarChave(linha.guiaPrestador);
  const guiaOperadora = normalizarChave(linha.guiaOperadora);
  const guiaCandidato = normalizarChave(candidato.numeroGuia);
  if (!guiaCandidato || (guiaCandidato !== guiaPrestador && guiaCandidato !== guiaOperadora)) return false;

  const codigoLinha = normalizarChave(linha.codigoItem);
  const codigoCandidato = normalizarChave(candidato.codigoItem);
  if (!codigoLinha || !codigoCandidato || codigoLinha !== codigoCandidato) return false;

  if (!linha.dataExecucao || !retornoDataCivilValida(linha.dataExecucao)) return false;
  if (linha.dataExecucao !== dataCivilDoCandidato(candidato.dataExecucao)) return false;

  const glosaLinha = normalizarChave(linha.codigoGlosa);
  const glosaCandidato = normalizarChave(candidato.codigoGlosa);
  if (!glosaLinha || !glosaCandidato || glosaLinha !== glosaCandidato) return false;

  // Sequencial confirma a identidade se ambos os sistemas o disponibilizam.
  const sequencialLinha = sequencialDaLinha(linha.sequencialItem);
  if (linha.sequencialItem !== null && sequencialLinha === null) return false;
  if (sequencialLinha !== null && candidato.sequencialItem !== null && sequencialLinha !== candidato.sequencialItem) return false;

  return true;
}

function valorConfere(linha: RetornoXmlLinha, candidato: RetornoCandidato): boolean {
  const recursado = decimalEmCentavos(linha.valorRecursado);
  const glosa = decimalEmCentavos(candidato.valorGlosa);
  return recursado !== null && glosa !== null && recursado <= glosa;
}

/**
 * Retorna true somente para um candidato apto a vínculo automático. Além das
 * chaves estritas, exige que o valor recursado não exceda a glosa original.
 */
export function validarCandidatoRetorno(
  linha: RetornoXmlLinha,
  candidato: RetornoCandidato,
  escopo: RetornoEscopo,
): boolean {
  return identificadoresConferem(linha, candidato, escopo) && valorConfere(linha, candidato);
}

/**
 * Sugere exclusivamente quando há um único candidato, no escopo correto, com
 * todas as chaves compartilhadas exatas. Valor, nome e descrição nunca servem
 * para desempatar candidatos.
 */
export function sugerirVinculoRetorno(
  linha: RetornoXmlLinha,
  candidatos: RetornoCandidato[],
  escopo: RetornoEscopo,
): RetornoMatch {
  // O lote recebido pode cobrir muitas guias e escopos. Primeiro restringimos à
  // identidade obrigatória desta linha; só então um limite alto indica uma
  // ambiguidade real, sem expor candidatos de outros hospitais/convênios.
  const mesmosIdentificadores = candidatos.filter(candidato => identificadoresConferem(linha, candidato, escopo));
  if (mesmosIdentificadores.length === 0) {
    return {
      estado: "sem_vinculo",
      candidatos: [],
      motivo: "Nenhum demonstrativo atende aos identificadores obrigatórios.",
    };
  }

  if (mesmosIdentificadores.length > RETORNO_MATCH_MAX_CANDIDATOS) {
    return {
      estado: "ambiguo",
      candidatos: mesmosIdentificadores,
      motivo: `Há ${mesmosIdentificadores.length} candidatos com os mesmos identificadores, acima do limite seguro para vínculo automático.`,
    };
  }

  if (mesmosIdentificadores.length > 1) {
    return {
      estado: "ambiguo",
      candidatos: mesmosIdentificadores,
      motivo: "Mais de um demonstrativo atende aos identificadores obrigatórios.",
    };
  }

  const candidato = mesmosIdentificadores[0];
  if (!valorConfere(linha, candidato)) {
    return {
      estado: "divergente",
      candidatos: [candidato],
      motivo: "O valor recursado não pode ser confirmado contra a glosa do demonstrativo.",
    };
  }

  return {
    estado: "sugerido",
    candidatos: [candidato],
    motivo: "Identificadores obrigatórios conferem; código de tabela não verificado porque não existe no demonstrativo.",
  };
}

function valorCanonicoParaChave(valor: string | null): string | null {
  const centavos = decimalEmCentavos(valor);
  if (centavos === null) return normalizarChave(valor);
  return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, "0")}`;
}

/**
 * Chave SHA-256 determinística para rebusca. deliberadamente não inclui o id
 * transitório de demonstrativo e conserva arquivoId e todos os campos de negócio.
 */
export function chaveEstavelDemonstrativo(candidato: RetornoCandidato): string {
  const canonico = {
    arquivoId: candidato.arquivoId,
    estabelecimentoId: candidato.estabelecimentoId,
    convenioId: candidato.convenioId,
    numeroGuia: normalizarChave(candidato.numeroGuia),
    sequencialItem: candidato.sequencialItem,
    dataExecucao: dataCivilDoCandidato(candidato.dataExecucao),
    codigoItem: normalizarChave(candidato.codigoItem),
    codigoGlosa: normalizarChave(candidato.codigoGlosa),
    valorGlosa: valorCanonicoParaChave(candidato.valorGlosa),
    protocolo: normalizarChave(candidato.protocolo),
    lotePrestador: normalizarChave(candidato.lotePrestador),
    codigoPrestador: normalizarChave(candidato.codigoPrestador),
    nomeBeneficiario: normalizarChave(candidato.nomeBeneficiario),
    carteiraBeneficiario: normalizarChave(candidato.carteiraBeneficiario),
    descricaoItem: normalizarChave(candidato.descricaoItem),
  };

  return createHash("sha256").update(JSON.stringify(canonico), "utf8").digest("hex");
}
