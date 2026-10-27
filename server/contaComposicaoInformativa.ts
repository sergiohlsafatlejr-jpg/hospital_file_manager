import Decimal from "decimal.js";
import type {
  CandidatoGabarito,
  CategoriaItemGabarito,
  ItemAssociadoGabarito,
  ItemResumoComposicao,
  ResumoComposicao,
  ScopeContaMedica,
} from "../shared/contaContextoMedico";

/**
 * Contrato de entrada para o adapter de backend.
 *
 * O adapter deve obter `itensHospitalares` exclusivamente das linhas
 * hospitalares autorizadas pelo `scope`; guias/profissionais médicos não são
 * itens hospitalares e nunca devem ser incluídos nessa lista. `tipo` tem de
 * ser classificado pelo backend: somente `procedimento` permite que uma linha
 * hospitalar satisfaça um procedimento principal do gabarito.
 */
export interface CompararComposicaoInformativaEntrada {
  scope: Pick<ScopeContaMedica, "estabelecimentoId" | "convenioId">;
  gabaritos: GabaritoComposicaoInformativa[];
  /** Códigos de procedimentos reconhecidos na(s) fonte(s) médica(s). */
  procedimentosMedicos: readonly CodigoProcedimentoMedico[];
  /** Linhas hospitalares reais, sem valores e sem lançamentos médicos. */
  itensHospitalares: readonly ItemHospitalarInformativo[];
  /** Mantém a regra histórica de alta frequência; padrão de gabarito: 50%. */
  limiteFrequencia?: number;
}

export interface CodigoProcedimentoMedico {
  codigo: string;
}

export interface ItemHospitalarInformativo {
  codigo: string;
  descricao?: string;
  /** Valor decimal textual/canônico vindo da linha hospitalar, não financeiro. */
  quantidade?: string | number;
  /** O adapter deve marcar `procedimento` somente para tipo hospitalar conhecido. */
  tipo: "procedimento" | "outro";
}

export interface PrincipalGabaritoInformativo {
  codigo: string;
}

/** Recorte não financeiro do gabarito manual já cadastrado. */
export interface GabaritoComposicaoInformativa {
  padraoId: number;
  nome: string;
  estabelecimentoId: number;
  convenioId: number | null;
  principais: readonly PrincipalGabaritoInformativo[];
  itensAssociados: readonly ItemAssociadoGabarito[];
}

type ItemHospitalarAgregado = {
  quantidade: Decimal | null;
};

function normalizarCodigo(valor: string): string {
  return valor.trim();
}

function decimalDeQuantidade(valor: string | number | undefined): Decimal | null {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  // Linhas legadas podem vir no formato brasileiro. Valores ambíguos são ignorados
  // em vez de se arredondar/inventar quantidade.
  const canonico = /^[-+]?\d+(?:,\d+)?$/.test(texto) ? texto.replace(",", ".") : texto;
  try {
    const decimal = new Decimal(canonico);
    return decimal.isFinite() && decimal.greaterThanOrEqualTo(0) ? decimal : null;
  } catch {
    return null;
  }
}

function stringDecimal(valor: Decimal): string {
  return valor.toFixed();
}

function categoriaDo(item: ItemAssociadoGabarito): CategoriaItemGabarito {
  return item.categoria ?? "obrigatorio";
}

function frequenciaRelevante(item: ItemAssociadoGabarito, limite: number): boolean {
  return Number.isFinite(item.frequencia) && item.frequencia >= limite;
}

function resumoVazio(): ResumoComposicao {
  return {
    itens: [],
    itensEsperados: 0,
    itensPresentes: 0,
    faltantesObrigatorios: 0,
    faltantesOpcionais: 0,
    faltantesCondicionais: 0,
    gruposAlternativos: 0,
    gruposObrigatoriosAusentes: 0,
    gruposOpcionaisAusentes: 0,
    quantidadesAbaixo: 0,
    quantidadesAcima: 0,
    pendencias: 0,
  };
}

function agregarItensHospitalares(
  itens: readonly ItemHospitalarInformativo[]
): Map<string, ItemHospitalarAgregado> {
  const agregados = new Map<string, ItemHospitalarAgregado>();
  for (const item of itens) {
    const codigo = normalizarCodigo(item.codigo);
    if (!codigo) continue;
    const atual = agregados.get(codigo) ?? { quantidade: null };
    const quantidade = decimalDeQuantidade(item.quantidade);
    if (quantidade) atual.quantidade = (atual.quantidade ?? new Decimal(0)).plus(quantidade);
    agregados.set(codigo, atual);
  }
  return agregados;
}

function avaliarQuantidade(
  esperado: ItemAssociadoGabarito,
  encontrado: ItemHospitalarAgregado | undefined,
  resultado: ItemResumoComposicao,
  resumo: ResumoComposicao
): void {
  if (!encontrado?.quantidade) return;
  resultado.quantidadeEncontrada = stringDecimal(encontrado.quantidade);
  resultado.quantidadeEsperada = esperado.quantidadeMedia;
  resultado.quantidadeMin = esperado.quantidadeMin;
  resultado.quantidadeMax = esperado.quantidadeMax;
  resultado.frequencia = esperado.frequencia;

  if (!Number.isFinite(esperado.quantidadeMedia)) return;
  const min = new Decimal(esperado.quantidadeMin ?? esperado.quantidadeMedia);
  const max = new Decimal(esperado.quantidadeMax ?? esperado.quantidadeMedia);
  if (encontrado.quantidade.lessThan(min)) {
    resultado.situacaoQuantidade = "abaixo";
    resultado.pendencia = true;
    resumo.quantidadesAbaixo += 1;
    resumo.pendencias += 1;
  } else if (encontrado.quantidade.greaterThan(max)) {
    resultado.situacaoQuantidade = "acima";
    resultado.pendencia = true;
    resumo.quantidadesAcima += 1;
    resumo.pendencias += 1;
  } else {
    resultado.situacaoQuantidade = "dentro";
  }
}

function resultadoBase(item: ItemAssociadoGabarito): ItemResumoComposicao {
  return {
    codigo: item.codigo,
    descricao: item.descricao,
    categoria: categoriaDo(item),
    grupo: item.grupoAlternativo ?? item.grupo ?? null,
    presenca: "ausente",
    quantidadeEsperada: item.quantidadeMedia,
    quantidadeMin: item.quantidadeMin,
    quantidadeMax: item.quantidadeMax,
    frequencia: item.frequencia,
    situacaoQuantidade: "nao_avaliada",
    pendencia: false,
  };
}

/**
 * Avalia somente uma composição hospitalar. Não faz I/O nem escreve contexto;
 * portanto seu resultado é auditável e não equivale a confirmação humana.
 */
function avaliarComposicao(
  itensAssociados: readonly ItemAssociadoGabarito[],
  itensHospitalares: Map<string, ItemHospitalarAgregado>,
  limiteFrequencia: number
): ResumoComposicao {
  const resumo = resumoVazio();
  resumo.itensEsperados = itensAssociados.length;

  const gruposCondicionaisAtivos = new Set<string>();
  for (const item of itensAssociados) {
    if (categoriaDo(item) === "condicional" && item.grupo && itensHospitalares.has(normalizarCodigo(item.codigo))) {
      gruposCondicionaisAtivos.add(item.grupo);
    }
  }

  const porGrupoAlternativo = new Map<string, Array<{ item: ItemAssociadoGabarito; indice: number }>>();
  itensAssociados.forEach((item, indice) => {
    const grupo = item.grupoAlternativo?.trim();
    if (grupo) {
      const membros = porGrupoAlternativo.get(grupo) ?? [];
      membros.push({ item, indice });
      porGrupoAlternativo.set(grupo, membros);
    }
  });
  resumo.gruposAlternativos = porGrupoAlternativo.size;

  const processadosEmGrupo = new Set<number>();
  for (const [grupo, membros] of porGrupoAlternativo) {
    const presentes = membros.filter(({ item }) => itensHospitalares.has(normalizarCodigo(item.codigo)));
    const obrigatorio = membros.some(({ item }) => item.grupoObrigatorio === true);
    const grupoPresente = presentes.length > 0;
    if (!grupoPresente) {
      if (obrigatorio) {
        resumo.gruposObrigatoriosAusentes += 1;
        resumo.pendencias += 1; // Uma única pendência por grupo OR, nunca uma por membro.
      } else {
        resumo.gruposOpcionaisAusentes += 1;
      }
    }

    membros.forEach(({ item, indice }, posicao) => {
      processadosEmGrupo.add(indice);
      const resultado = resultadoBase(item);
      const encontrado = itensHospitalares.get(normalizarCodigo(item.codigo));
      if (encontrado) {
        resultado.presenca = "presente";
        resumo.itensPresentes += 1;
        avaliarQuantidade(item, encontrado, resultado, resumo);
      } else if (grupoPresente) {
        resultado.presenca = "satisfeito_por_grupo";
      } else if (obrigatorio && posicao === 0) {
        // Representante auditável da única pendência do grupo, sem reclassificar categoria.
        resultado.pendencia = true;
      }
      resultado.grupo = grupo;
      resumo.itens.push(resultado);
    });
  }

  itensAssociados.forEach((item, indice) => {
    if (processadosEmGrupo.has(indice)) return;
    const resultado = resultadoBase(item);
    const encontrado = itensHospitalares.get(normalizarCodigo(item.codigo));
    if (encontrado) {
      resultado.presenca = "presente";
      resumo.itensPresentes += 1;
      avaliarQuantidade(item, encontrado, resultado, resumo);
      resumo.itens.push(resultado);
      return;
    }

    const categoria = categoriaDo(item);
    const relevante = frequenciaRelevante(item, limiteFrequencia);
    if (categoria === "opcional") {
      resumo.faltantesOpcionais += 1;
    } else if (categoria === "condicional") {
      resumo.faltantesCondicionais += 1;
      // Compatibilidade com o comportamento já existente: somente um grupo
      // condicional ativo torna a ausência uma pendência; sem grupo não há inferência.
      if (relevante && item.grupo && gruposCondicionaisAtivos.has(item.grupo)) {
        resultado.pendencia = true;
        resumo.pendencias += 1;
      }
    } else {
      resumo.faltantesObrigatorios += 1;
      if (relevante) {
        resultado.pendencia = true;
        resumo.pendencias += 1;
      }
    }
    resumo.itens.push(resultado);
  });

  return resumo;
}

function principaisDoGabarito(gabarito: GabaritoComposicaoInformativa): {
  codigos: string[];
  invalidos: boolean;
} {
  let invalidos = gabarito.principais.length === 0;
  const codigos = new Set<string>();
  for (const principal of gabarito.principais) {
    const codigo = normalizarCodigo(principal.codigo);
    if (!codigo) {
      invalidos = true;
      continue;
    }
    codigos.add(codigo);
  }
  return { codigos: [...codigos], invalidos };
}

/**
 * Compara candidatos de gabarito sem chamar comparadores financeiros/legados.
 *
 * Principais distintos só são satisfeitos por: (a) procedimento médico
 * reconhecido; ou (b) item hospitalar cujo adapter tipou explicitamente como
 * `procedimento`. Unidade e convênio são filtro duro. Um único candidato
 * elegível recebe `recomendacao`; ele continua apenas uma sugestão e nunca é
 * confirmado por esta função.
 */
export function compararComposicaoInformativa(
  entrada: CompararComposicaoInformativaEntrada
): CandidatoGabarito[] {
  const limite = entrada.limiteFrequencia ?? 50;
  const itensAgregados = agregarItensHospitalares(entrada.itensHospitalares);
  const principaisReconhecidos = new Set<string>();
  for (const procedimento of entrada.procedimentosMedicos) {
    const codigo = normalizarCodigo(procedimento.codigo);
    if (codigo) principaisReconhecidos.add(codigo);
  }
  for (const item of entrada.itensHospitalares) {
    if (item.tipo !== "procedimento") continue;
    const codigo = normalizarCodigo(item.codigo);
    if (codigo) principaisReconhecidos.add(codigo);
  }

  const candidatos: CandidatoGabarito[] = entrada.gabaritos.map(gabarito => {
    const composicao = avaliarComposicao(gabarito.itensAssociados, itensAgregados, limite);
    const principais = principaisDoGabarito(gabarito);
    const principaisEncontrados = principais.codigos.filter(codigo => principaisReconhecidos.has(codigo)).length;
    const motivos: string[] = [];

    if (gabarito.estabelecimentoId !== entrada.scope.estabelecimentoId) {
      motivos.push("Gabarito de outra unidade");
    }
    if (gabarito.convenioId !== entrada.scope.convenioId) {
      motivos.push("Gabarito de outro convênio");
    }
    if (principais.invalidos) {
      motivos.push("Gabarito sem todos os procedimentos principais tipados");
    }
    if (principaisEncontrados !== principais.codigos.length) {
      motivos.push("Nem todos os procedimentos principais distintos foram reconhecidos");
    }
    if (composicao.pendencias > 0) {
      motivos.push("Composição hospitalar possui pendências");
    }

    return {
      padraoId: gabarito.padraoId,
      nome: gabarito.nome,
      // Aplicabilidade depende do escopo e dos principais; pendências do kit
      // são justamente o resultado a revisar, não um impedimento de escolhê-lo.
      elegivel: gabarito.estabelecimentoId === entrada.scope.estabelecimentoId
        && gabarito.convenioId === entrada.scope.convenioId
        && !principais.invalidos
        && principaisEncontrados === principais.codigos.length,
      motivos,
      principaisTotal: principais.codigos.length,
      principaisEncontrados,
      recomendacao: false,
      composicao,
    } satisfies CandidatoGabarito;
  });

  const elegiveis = candidatos.filter(candidato => candidato.elegivel);
  if (elegiveis.length === 1) elegiveis[0].recomendacao = true;
  return candidatos;
}
