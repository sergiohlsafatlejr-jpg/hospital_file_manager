import { TRPCError } from "@trpc/server";
import { normalizarDataExecucao, selecionarPrecosAplicaveis, type PrecoAplicavel } from "../contratosPrecoAplicavel";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  itensRegraNegocio,
  regrasNegocio,
  tabelasPreco,
} from "../../drizzle/schema";
import type { ParsedProcedimento } from "../parsers";
import {
  compararItensComPadroes,
  resolverConvenioIdParaConta,
  type Divergencia,
  type ItemParaComparacao,
} from "./comparadorPadroes";

/** Sem causa bruta: o importador deve deixar esse erro abortar a transação. */
function falhaValidacaoAmbulatorial(): TRPCError {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a validação ambulatorial. Nenhuma guia foi liberada." });
}

export interface ErroValidacaoAmbulatorial {
  tipoErro:
    | "regra_gabarito"
    | "item_faltante"
    | "quantidade_divergente"
    | "preco_divergente"
    | "falha_prontuario"
    | "dados_cadastrais"
    | "autorizacao_senha"
    | "outro";
  camada: "TABELA_PRECO" | "GABARITO_REGRA" | "CAMPOS_TISS";
  severidade: "aviso" | "alerta" | "critico";
  codigoItem: string | null;
  descricaoErro: string;
  impactoFinanceiro: number;
  valorEsperado?: string;
  valorEncontrado?: string;
}

export interface ResultadoValidacaoGuiaAmbulatorial {
  numeroGuia: string;
  nomePaciente: string;
  carteiraBeneficiario: string | null;
  senhaAutorizacao: string | null;
  statusAuditoriaRegras: "conforme" | "divergente";
  totalDivergencias: number;
  scoreRisco: number;
  erros: ErroValidacaoAmbulatorial[];
  divergenciasPadrao: Divergencia[];
  resumoMotivoRetorno: string | null;
}

export interface ContextoRegrasConvenioAmbulatorial {
  hospitalEstabId: number;
  convenioId: number;
  convenioNome: string;
  exigirSenhaSadt?: boolean;
  mapaPrecosPorCodigo: Map<
    string,
    PrecoAplicavel[]
  >;
  regrasAtivas: Array<{
    id: number;
    nome: string;
    codigoProcedimentoPrincipal: string;
    tipoVerificacao: string;
    acaoInconsistencia: string;
    itens: Array<{
      codigoItem: string;
      descricaoItem: string | null;
      quantidadeMinima: number | null;
      quantidadeMaxima: number | null;
      valorEsperado: number | null;
      toleranciaValor: number;
      obrigatorio: string;
    }>;
  }>;
}

export function normalizarCodigoProcedimento(codigo?: string | null): string {
  return String(codigo || "")
    .trim()
    .replace(/[.\-\s]/g, "")
    .replace(/^0+/, "");
}

function ehProcedimentoConsultaSimples(codigo?: string | null): boolean {
  const norm = normalizarCodigoProcedimento(codigo);
  return (
    norm === "10101012" ||
    norm === "10101020" ||
    norm === "10101039" ||
    norm.startsWith("10101")
  );
}

/**
 * Carrega em memória (1 única vez por lote XML) a Tabela de Preços Contratual
 * e as Regras de Negócio ativas do convênio/hospital para validação rápida de N guias.
 */
export async function carregarContextoRegrasConvenioAmbulatorial(
  db: any,
  params: {
    hospitalEstabId: number;
    convenioId: number;
    convenioNome: string;
    exigirSenhaSadt?: boolean;
  }
): Promise<ContextoRegrasConvenioAmbulatorial> {
  const mapaPrecosPorCodigo = new Map<string, PrecoAplicavel[]>();
  try {
    const convenioId = await resolverConvenioIdParaConta(db, params.hospitalEstabId, params.convenioNome, undefined, params.convenioId);
    if (convenioId !== params.convenioId) throw new Error("convenio_invalido");
  } catch {
    throw falhaValidacaoAmbulatorial();
  }

  try {
    const precosRows = await db
      .select()
      .from(tabelasPreco)
      .where(
        and(
          eq(tabelasPreco.convenioId, params.convenioId),
          eq(tabelasPreco.ativo, "sim"),
          or(
            eq(tabelasPreco.estabelecimentoId, params.hospitalEstabId),
            isNull(tabelasPreco.estabelecimentoId)
          )
        )
      );

    if (!Array.isArray(precosRows)) throw new Error("precos_indisponiveis");
    for (const row of precosRows) {
      const codBruto = String(row.codigo || "").trim();
      if (!codBruto || !Number.isFinite(Number(row.valor)) || Number(row.valor) <= 0) continue;
      // Portes não são valores unitários faturáveis.
      if (row.procedimentoFonte === "preco_portes" || row.procedimentoFonte === "porte_anestesico") continue;
      const preco: PrecoAplicavel = {
        ...row, codigo: codBruto,
        vigenciaInicio: normalizarDataExecucao(row.vigenciaInicio)
          ? row.vigenciaInicio instanceof Date ? row.vigenciaInicio : new Date(String(row.vigenciaInicio))
          : new Date(NaN),
      };
      for (const chave of new Set([codBruto, normalizarCodigoProcedimento(codBruto)].filter(Boolean))) {
        const versoes = mapaPrecosPorCodigo.get(chave) ?? [];
        versoes.push(preco);
        mapaPrecosPorCodigo.set(chave, versoes);
      }
    }
  } catch {
    throw falhaValidacaoAmbulatorial();
  }

  const regrasAtivas: ContextoRegrasConvenioAmbulatorial["regrasAtivas"] = [];
  try {
    const regrasRows = await db
      .select()
      .from(regrasNegocio)
      .where(
        and(
          eq(regrasNegocio.ativo, "sim"),
          or(
            eq(regrasNegocio.convenioId, params.convenioId),
            isNull(regrasNegocio.convenioId)
          ),
          or(
            eq(regrasNegocio.estabelecimentoId, params.hospitalEstabId),
            isNull(regrasNegocio.estabelecimentoId)
          )
        )
      );

    if (!Array.isArray(regrasRows)) throw new Error("regras_indisponiveis");
    if (regrasRows.length > 0) {
      const regraIds = regrasRows
        .map((r: any) => Number(r.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      const itensRows =
        regraIds.length > 0
          ? await db
              .select()
              .from(itensRegraNegocio)
              .where(inArray(itensRegraNegocio.regraId, regraIds))
          : [];

      if (!Array.isArray(itensRows)) throw new Error("itens_regra_indisponiveis");
      const itensPorRegra = new Map<number, any[]>();
      for (const item of itensRows || []) {
        const rId = Number(item.regraId);
        const lista = itensPorRegra.get(rId) || [];
        lista.push(item);
        itensPorRegra.set(rId, lista);
      }

      for (const r of regrasRows) {
        const rId = Number(r.id);
        regrasAtivas.push({
          id: rId,
          nome: String(r.nome || `Regra #${rId}`),
          codigoProcedimentoPrincipal: String(
            r.codigoProcedimentoPrincipal || r.codigoProcedimento || ""
          ).trim(),
          tipoVerificacao: String(r.tipoVerificacao || "deve_conter"),
          acaoInconsistencia: String(r.acaoInconsistencia || "alerta"),
          itens: (itensPorRegra.get(rId) || []).map((it: any) => ({
            codigoItem: String(it.codigoItem || "").trim(),
            descricaoItem: it.descricaoItem ? String(it.descricaoItem) : null,
            quantidadeMinima:
              it.quantidadeMinima !== null && it.quantidadeMinima !== undefined
                ? Number(it.quantidadeMinima)
                : null,
            quantidadeMaxima:
              it.quantidadeMaxima !== null && it.quantidadeMaxima !== undefined
                ? Number(it.quantidadeMaxima)
                : null,
            valorEsperado:
              it.valorEsperado !== null && it.valorEsperado !== undefined
                ? Number(it.valorEsperado)
                : null,
            toleranciaValor: Number(it.toleranciaValor) || 0.05,
            obrigatorio: String(it.obrigatorio || "sim"),
          })),
        });
      }
    }
  } catch {
    throw falhaValidacaoAmbulatorial();
  }

  return {
    hospitalEstabId: params.hospitalEstabId,
    convenioId: params.convenioId,
    convenioNome: params.convenioNome,
    exigirSenhaSadt: params.exigirSenhaSadt,
    mapaPrecosPorCodigo,
    regrasAtivas,
  };
}

/**
 * Executa as 3 camadas de validação sobre uma guia ambulatorial:
 * 1. Tabela de Preços do Convênio (valor unitário XML vs valor contratado)
 * 2. Gabaritos e Regras de Cobrança (comparadorPadroes + regrasNegocio)
 * 3. Campos Obrigatórios TISS por Convênio (carteirinha, senha SADT, CRM/executante, valor zerado)
 */
export async function validarGuiaAmbulatorial(
  db: any,
  contexto: ContextoRegrasConvenioAmbulatorial,
  guia: {
    numeroGuia: string;
    nomePaciente: string;
    carteiraBeneficiario: string | null;
    senhaAutorizacao: string | null;
    numeroGuiaOperadora: string | null;
    procedimentos: ParsedProcedimento[];
    itensPadronizados: ItemParaComparacao[];
    lotePossuiGuiasComSenha?: boolean;
  }
): Promise<ResultadoValidacaoGuiaAmbulatorial> {
  if (guia.itensPadronizados.some(item => item.convenioId != null && item.convenioId !== contexto.convenioId)) {
    throw falhaValidacaoAmbulatorial();
  }
  const erros: ErroValidacaoAmbulatorial[] = [];
  const divergenciasPadrao: Divergencia[] = [];

  // =========================================================================
  // CAMADA 3: CAMPOS OBRIGATÓRIOS TISS POR CONVÊNIO
  // =========================================================================
  const carteiraLimpa = String(guia.carteiraBeneficiario || "").trim();
  if (!carteiraLimpa || carteiraLimpa.length < 3) {
    erros.push({
      tipoErro: "dados_cadastrais",
      camada: "CAMPOS_TISS",
      severidade: "critico",
      codigoItem: null,
      descricaoErro: `Guia ${guia.numeroGuia}: Número da carteirinha do beneficiário ausente ou inválido no XML.`,
      impactoFinanceiro: 0,
      valorEsperado: "Carteirinha preenchida",
      valorEncontrado: carteiraLimpa || "Vazio",
    });
  }

  const nomeLimpo = String(guia.nomePaciente || "").trim();
  if (
    !nomeLimpo ||
    nomeLimpo.toUpperCase() === "PACIENTE" ||
    nomeLimpo.length < 3
  ) {
    erros.push({
      tipoErro: "dados_cadastrais",
      camada: "CAMPOS_TISS",
      severidade: "alerta",
      codigoItem: null,
      descricaoErro: `Guia ${guia.numeroGuia}: Nome do beneficiário não informado no XML TISS.`,
      impactoFinanceiro: 0,
      valorEsperado: "Nome completo do paciente",
      valorEncontrado: nomeLimpo || "Vazio",
    });
  }

  // Verificar senha de autorização quando há exames/procedimentos SADT (não apenas consulta simples)
  const temProcedimentoSadt = guia.procedimentos.some(
    (p) => !ehProcedimentoConsultaSimples(p.codigo)
  );
  const senhaLimpa = String(guia.senhaAutorizacao || "").trim();
  const guiaOperadoraLimpa = String(guia.numeroGuiaOperadora || "").trim();

  if (
    temProcedimentoSadt &&
    !senhaLimpa &&
    (contexto.exigirSenhaSadt || guia.lotePossuiGuiasComSenha)
  ) {
    const procSadt = guia.procedimentos.find(
      (p) => !ehProcedimentoConsultaSimples(p.codigo)
    );
    erros.push({
      tipoErro: "autorizacao_senha",
      camada: "CAMPOS_TISS",
      severidade: "critico",
      codigoItem: procSadt?.codigo || null,
      descricaoErro: `Guia ${guia.numeroGuia}: Exame/procedimento SADT (${procSadt?.codigo || "SADT"}) sem Senha de Autorização preenchida no XML.`,
      impactoFinanceiro: Number(procSadt?.valorTotal) || 0,
      valorEsperado: "Senha de autorização válida",
      valorEncontrado: guiaOperadoraLimpa
        ? `Sem senha (Guia Op: ${guiaOperadoraLimpa})`
        : "Sem senha",
    });
  }

  // Verificar identificação do profissional/prestador executante nos procedimentos
  for (const proc of guia.procedimentos) {
    const qtd = Number(proc.quantidade) || 1;
    const vu = Number(proc.valorUnitario) || 0;
    const vt = Number(proc.valorTotal) || qtd * vu;

    if (vu <= 0 || vt <= 0) {
      erros.push({
        tipoErro: "preco_divergente",
        camada: "CAMPOS_TISS",
        severidade: "critico",
        codigoItem: proc.codigo,
        descricaoErro: `Item ${proc.codigo} (${proc.descricao || "Procedimento"}) está com valor zerado no XML (R$ ${vt.toFixed(2)}).`,
        impactoFinanceiro: 0,
        valorEsperado: "> R$ 0,00",
        valorEncontrado: `R$ ${vt.toFixed(2)}`,
      });
    }

    if (
      (proc.tipoDespesa === "procedimento" || !proc.tipoDespesa) &&
      !proc.crmMedico &&
      !proc.nomeMedico &&
      !proc.codigoPrestadorExecutante &&
      !proc.codigoPrestadorOperadora
    ) {
      erros.push({
        tipoErro: "dados_cadastrais",
        camada: "CAMPOS_TISS",
        severidade: "alerta",
        codigoItem: proc.codigo,
        descricaoErro: `Procedimento ${proc.codigo} sem identificação do médico executante/solicitante (CRM/Conselho) ou código de prestador no XML.`,
        impactoFinanceiro: 0,
        valorEsperado: "CRM / Prestador Executante",
        valorEncontrado: "Ausente",
      });
    }
  }

  // =========================================================================
  // CAMADA 1: TABELA DE PREÇOS CONTRATUAL DO CONVÊNIO (tabelasPreco)
  // =========================================================================
  const codigosComErroPrecoTabela = new Set<string>();
  for (const proc of guia.procedimentos) {
    const codBruto = String(proc.codigo || "").trim();
    const codNorm = normalizarCodigoProcedimento(codBruto);
    const candidatos = contexto.mapaPrecosPorCodigo.get(codBruto) || contexto.mapaPrecosPorCodigo.get(codNorm) || [];
    const dataReferencia = normalizarDataExecucao(proc.dataExecucao);
    if (candidatos.length > 0 && !dataReferencia) throw falhaValidacaoAmbulatorial();
    const precoSelecionado = dataReferencia ? selecionarPrecosAplicaveis(candidatos, {
      estabelecimentoId: contexto.hospitalEstabId, convenioId: contexto.convenioId,
      dataReferencia, codigos: candidatos.map(preco => preco.codigo),
    })[0] : undefined;
    const precoContratado = precoSelecionado ? { ...precoSelecionado, valor: Number(precoSelecionado.valor) } : undefined;

    if (precoContratado) {
      const qtd = Number(proc.quantidade) || 1;
      const vuXml =
        Number(proc.valorUnitario) ||
        (Number(proc.valorTotal) ? Number(proc.valorTotal) / qtd : 0);
      const diffUnitario = Math.abs(vuXml - precoContratado.valor);

      if (vuXml > 0 && diffUnitario > 0.05) {
        const impacto = Math.abs((vuXml - precoContratado.valor) * qtd);
        codigosComErroPrecoTabela.add(codBruto);
        codigosComErroPrecoTabela.add(codNorm);
        erros.push({
          tipoErro: "preco_divergente",
          camada: "TABELA_PRECO",
          severidade: "critico",
          codigoItem: codBruto,
          descricaoErro: `Divergência na Tabela do Convênio (${contexto.convenioNome}): item ${codBruto} (${proc.descricao || precoContratado.nome}) cobrado a R$ ${vuXml.toFixed(2)}, mas valor contratado na tabela é R$ ${precoContratado.valor.toFixed(2)}.`,
          impactoFinanceiro: Number(impacto.toFixed(2)),
          valorEsperado: `R$ ${precoContratado.valor.toFixed(2)}`,
          valorEncontrado: `R$ ${vuXml.toFixed(2)}`,
        });
        divergenciasPadrao.push({
          tipo: "PRECO",
          severidade: "critico",
          codigoItem: codBruto,
          descricaoItem: proc.descricao || precoContratado.nome,
          mensagem: `Preço divergente da Tabela do Convênio: cobrado R$ ${vuXml.toFixed(2)} vs tabela R$ ${precoContratado.valor.toFixed(2)}`,
          valorEsperado: `R$ ${precoContratado.valor.toFixed(2)}`,
          valorEncontrado: `R$ ${vuXml.toFixed(2)}`,
        });
      }
    }
  }

  // =========================================================================
  // CAMADA 2A: REGRAS DE NEGÓCIO CADASTRADAS (regrasNegocio + itensRegraNegocio)
  // =========================================================================
  const codigosNaGuiaNorm = new Map<
    string,
    { codigo: string; quantidade: number; valorUnitario: number; descricao?: string }
  >();
  for (const proc of guia.procedimentos) {
    const norm = normalizarCodigoProcedimento(proc.codigo);
    if (!norm) continue;
    const atual = codigosNaGuiaNorm.get(norm);
    const qtd = Number(proc.quantidade) || 1;
    const vu = Number(proc.valorUnitario) || 0;
    if (atual) {
      atual.quantidade += qtd;
    } else {
      codigosNaGuiaNorm.set(norm, {
        codigo: proc.codigo,
        quantidade: qtd,
        valorUnitario: vu,
        descricao: proc.descricao,
      });
    }
  }

  for (const regra of contexto.regrasAtivas) {
    const codPrincipalNorm = normalizarCodigoProcedimento(
      regra.codigoProcedimentoPrincipal
    );
    if (!codPrincipalNorm || !codigosNaGuiaNorm.has(codPrincipalNorm)) continue;

    for (const itemRegra of regra.itens) {
      const codItemRegraNorm = normalizarCodigoProcedimento(itemRegra.codigoItem);
      if (!codItemRegraNorm) continue;
      const encontrado = codigosNaGuiaNorm.get(codItemRegraNorm);

      if (
        regra.tipoVerificacao === "deve_conter" &&
        itemRegra.obrigatorio === "sim" &&
        !encontrado
      ) {
        erros.push({
          tipoErro: "item_faltante",
          camada: "GABARITO_REGRA",
          severidade: "critico",
          codigoItem: itemRegra.codigoItem,
          descricaoErro: `Regra "${regra.nome}": O procedimento ${regra.codigoProcedimentoPrincipal} exige o item obrigatório ${itemRegra.codigoItem} (${itemRegra.descricaoItem || "Item obrigatório"}), que não consta na guia.`,
          impactoFinanceiro: Number(itemRegra.valorEsperado) || 0,
          valorEsperado: `Conter item ${itemRegra.codigoItem}`,
          valorEncontrado: "Ausente na guia",
        });
      } else if (regra.tipoVerificacao === "nao_deve_conter" && encontrado) {
        erros.push({
          tipoErro: "regra_gabarito",
          camada: "GABARITO_REGRA",
          severidade: "critico",
          codigoItem: itemRegra.codigoItem,
          descricaoErro: `Regra "${regra.nome}": O item ${itemRegra.codigoItem} (${itemRegra.descricaoItem || encontrado.descricao || "Item incompatível"}) não é permitido junto ao procedimento ${regra.codigoProcedimentoPrincipal} neste convênio.`,
          impactoFinanceiro: Number(
            (encontrado.quantidade * encontrado.valorUnitario).toFixed(2)
          ),
          valorEsperado: "Não cobrar junto",
          valorEncontrado: `Cobrado (${encontrado.quantidade}x)`,
        });
      } else if (encontrado) {
        if (
          itemRegra.quantidadeMaxima !== null &&
          encontrado.quantidade > itemRegra.quantidadeMaxima
        ) {
          erros.push({
            tipoErro: "quantidade_divergente",
            camada: "GABARITO_REGRA",
            severidade: "alerta",
            codigoItem: itemRegra.codigoItem,
            descricaoErro: `Regra "${regra.nome}": Quantidade do item ${itemRegra.codigoItem} (${encontrado.quantidade}) excede o máximo permitido (${itemRegra.quantidadeMaxima}).`,
            impactoFinanceiro: Number(
              (
                (encontrado.quantidade - itemRegra.quantidadeMaxima) *
                encontrado.valorUnitario
              ).toFixed(2)
            ),
            valorEsperado: `Máx ${itemRegra.quantidadeMaxima}`,
            valorEncontrado: String(encontrado.quantidade),
          });
        }
        if (
          itemRegra.quantidadeMinima !== null &&
          encontrado.quantidade < itemRegra.quantidadeMinima
        ) {
          erros.push({
            tipoErro: "quantidade_divergente",
            camada: "GABARITO_REGRA",
            severidade: "alerta",
            codigoItem: itemRegra.codigoItem,
            descricaoErro: `Regra "${regra.nome}": Quantidade do item ${itemRegra.codigoItem} (${encontrado.quantidade}) abaixo do mínimo esperado (${itemRegra.quantidadeMinima}).`,
            impactoFinanceiro: 0,
            valorEsperado: `Mín ${itemRegra.quantidadeMinima}`,
            valorEncontrado: String(encontrado.quantidade),
          });
        }
      }
    }
  }

  // =========================================================================
  // CAMADA 2B: GABARITOS E PADRÕES APRENDIDOS (compararItensComPadroes)
  // =========================================================================
  let scoreRisco = 0;
  try {
    const resultadoPadroes = await compararItensComPadroes({
      numeroConta: guia.numeroGuia,
      estabelecimentoId: contexto.hospitalEstabId,
      convenio: contexto.convenioNome,
      itens: guia.itensPadronizados.map(item => ({ ...item, convenioId: contexto.convenioId })),
      banco: db,
    });
    if (resultadoPadroes.statusGeral === "incompleta") throw falhaValidacaoAmbulatorial();
    scoreRisco = resultadoPadroes.scoreRisco?.score || 0;

    for (const div of resultadoPadroes.divergencias || []) {
      divergenciasPadrao.push(div);
      if (div.severidade === "info") continue;

      const codDivNorm = normalizarCodigoProcedimento(div.codigoItem);
      if (
        div.tipo === "PRECO" &&
        (codigosComErroPrecoTabela.has(String(div.codigoItem || "")) ||
          codigosComErroPrecoTabela.has(codDivNorm))
      ) {
        // Já reportado pela Tabela de Preços Contratual com precisão exata
        continue;
      }

      const mapTipo: Record<string, ErroValidacaoAmbulatorial["tipoErro"]> = {
        PRECO: "preco_divergente",
        QUANTIDADE: "quantidade_divergente",
        ITEM_FALTANTE: "item_faltante",
        ITEM_EXTRA: "regra_gabarito",
        COMPOSICAO: "regra_gabarito",
        GLOSA_RISCO: "regra_gabarito",
      };

      erros.push({
        tipoErro: mapTipo[div.tipo] || "regra_gabarito",
        camada: "GABARITO_REGRA",
        severidade: div.severidade === "critico" ? "critico" : "alerta",
        codigoItem: div.codigoItem || null,
        descricaoErro: div.mensagem,
        impactoFinanceiro: 0,
        valorEsperado: div.valorEsperado,
        valorEncontrado: div.valorEncontrado,
      });
    }
  } catch {
    throw falhaValidacaoAmbulatorial();
  }

  const totalDivergencias = erros.length;
  const statusAuditoriaRegras: "conforme" | "divergente" =
    totalDivergencias > 0 ? "divergente" : "conforme";

  if (totalDivergencias > 0 && scoreRisco < 40) {
    scoreRisco = Math.min(100, 35 + totalDivergencias * 15);
  }

  const resumoMotivoRetorno =
    erros.length > 0
      ? erros
          .slice(0, 3)
          .map((e) => e.descricaoErro)
          .join(" | ") +
        (erros.length > 3 ? ` (+${erros.length - 3} alerta(s))` : "")
      : null;

  return {
    numeroGuia: guia.numeroGuia,
    nomePaciente: guia.nomePaciente,
    carteiraBeneficiario: guia.carteiraBeneficiario,
    senhaAutorizacao: guia.senhaAutorizacao,
    statusAuditoriaRegras,
    totalDivergencias,
    scoreRisco,
    erros,
    divergenciasPadrao,
    resumoMotivoRetorno,
  };
}
