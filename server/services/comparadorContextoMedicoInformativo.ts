import type {
  CandidatoGabarito,
  ContaContextoMedicoResultado,
} from "../../shared/contaContextoMedico";

export type EstadoContextoMedicoNaComparacao =
  | "nao_solicitado"
  | "aplicado"
  | "incompleto";

export interface DivergenciaContextoMedicoInformativo {
  tipo: "ITEM_FALTANTE" | "COMPOSICAO";
  severidade: "alerta" | "critico";
  mensagem: string;
  codigoItem: string;
  descricaoItem?: string;
  valorEsperado?: string;
  valorEncontrado?: string;
  padraoId: number;
  isGabarito: true;
  detalhes: {
    origem: "contexto_medico_informativo";
    categoria: "obrigatorio" | "condicional" | "opcional";
    frequencia: number | null;
    situacaoQuantidade?: "abaixo" | "acima";
    quantidadeMin?: number;
    quantidadeMax?: number;
    quantidadeEsperada?: number;
  };
}

export interface ResultadoContextoMedicoNaComparacao {
  estado: EstadoContextoMedicoNaComparacao;
  mensagem: string | null;
  fontes: number;
  gabaritosElegiveis: number;
  itensFaltantes: number;
  gabaritoSelecionado?: {
    padraoId: number;
    nome: string;
  };
  divergencias: DivergenciaContextoMedicoInformativo[];
}

type ContextoMinimo = Pick<
  ContaContextoMedicoResultado,
  "configuracaoPendente" | "diagnosticoSnapshot" | "fontes" | "candidatos"
> & {
  contexto?: ContaContextoMedicoResultado["contexto"];
};

function incompleto(
  mensagem: string,
  contexto?: ContextoMinimo,
  gabaritosElegiveis = 0
): ResultadoContextoMedicoNaComparacao {
  return {
    estado: "incompleto",
    mensagem,
    fontes: contexto?.fontes.length ?? 0,
    gabaritosElegiveis,
    itensFaltantes: 0,
    divergencias: [],
  };
}

function categoriaAlerta(categoria: "obrigatorio" | "condicional" | "opcional") {
  return categoria === "obrigatorio" ? "critico" : "alerta";
}

function divergenciasDoCandidato(
  candidato: CandidatoGabarito
): DivergenciaContextoMedicoInformativo[] {
  const divergencias: DivergenciaContextoMedicoInformativo[] = [];

  for (const item of candidato.composicao.itens) {
    if (!item.pendencia) continue;

    // 1. Item presente na conta, mas com quantidade fora da faixa do gabarito
    if (
      item.presenca === "presente" &&
      (item.situacaoQuantidade === "abaixo" || item.situacaoQuantidade === "acima")
    ) {
      const qtdMin = item.quantidadeMin ?? item.quantidadeEsperada ?? 0;
      const qtdMax = item.quantidadeMax ?? item.quantidadeEsperada ?? 0;
      const qtdEncontrada = item.quantidadeEncontrada ?? "0";
      const direcaoLabel =
        item.situacaoQuantidade === "abaixo"
          ? `ABAIXO do mínimo permitido pelo gabarito: mínimo ${qtdMin}`
          : `ACIMA do máximo permitido pelo gabarito: máximo ${qtdMax}`;

      divergencias.push({
        tipo: "COMPOSICAO",
        severidade: "alerta",
        mensagem:
          `Quantidade de "${item.descricao || item.codigo}" ${direcaoLabel}, ` +
          `encontrado ${qtdEncontrada} no gabarito "${candidato.nome}". ` +
          "Evidência: contexto médico informativo; requer revisão humana.",
        codigoItem: item.codigo,
        descricaoItem: item.descricao || undefined,
        valorEsperado: `${qtdMin} - ${qtdMax}`,
        valorEncontrado: String(qtdEncontrada),
        padraoId: candidato.padraoId,
        isGabarito: true,
        detalhes: {
          origem: "contexto_medico_informativo",
          categoria: item.categoria,
          frequencia: item.frequencia ?? null,
          situacaoQuantidade: item.situacaoQuantidade,
          quantidadeMin: item.quantidadeMin,
          quantidadeMax: item.quantidadeMax,
          quantidadeEsperada: item.quantidadeEsperada,
        },
      });
      continue;
    }

    // 2. Item ausente (obrigatório ou condicional de grupo ativo)
    if (item.categoria === "obrigatorio" || item.categoria === "condicional") {
      const categoria: "obrigatorio" | "condicional" =
        item.categoria === "obrigatorio" ? "obrigatorio" : "condicional";
      divergencias.push({
        tipo: "ITEM_FALTANTE",
        severidade: categoriaAlerta(categoria),
        mensagem:
          `Item "${item.descricao || item.codigo}" [${categoria.toUpperCase()}] ` +
          `esperado no gabarito "${candidato.nome}" não foi encontrado na composição hospitalar. ` +
          "Evidência: contexto médico informativo; requer revisão humana.",
        codigoItem: item.codigo,
        descricaoItem: item.descricao || undefined,
        padraoId: candidato.padraoId,
        isGabarito: true,
        detalhes: {
          origem: "contexto_medico_informativo",
          categoria,
          frequencia: item.frequencia ?? null,
        },
      });
    }
  }

  return divergencias;
}

/**
 * Converte a conclusão sanitizada do Contexto médico em alertas de composição.
 *
 * A função é intencionalmente pura: não consulta XML, não recebe valores e não
 * confirma gabaritos. Uma recomendação única ou um gabarito previamente
 * confirmado pelo auditor na aba Contexto médico pode gerar os alertas.
 */
export function avaliarContextoMedicoInformativo(
  contexto?: ContextoMinimo
): ResultadoContextoMedicoNaComparacao {
  if (!contexto) {
    return {
      estado: "nao_solicitado",
      mensagem: null,
      fontes: 0,
      gabaritosElegiveis: 0,
      itensFaltantes: 0,
      divergencias: [],
    };
  }

  if (contexto.configuracaoPendente) {
    return incompleto(
      "A comparação está incompleta: o contexto médico ainda não está disponível.",
      contexto
    );
  }

  if (contexto.diagnosticoSnapshot) {
    return incompleto(
      "A comparação está incompleta: o snapshot hospitalar informado não pôde ser localizado com segurança.",
      contexto
    );
  }

  if (contexto.fontes.length === 0) {
    return incompleto(
      "A comparação está incompleta: não há procedimento médico informativo associado a este mesmo snapshot hospitalar.",
      contexto
    );
  }

  const elegiveis = contexto.candidatos.filter(candidato => candidato.elegivel);

  // Priorizar gabarito já confirmado manualmente pelo auditor, se elegível
  const confirmadoManual =
    contexto.contexto?.status === "confirmado" && contexto.contexto.padraoId
      ? elegiveis.find(c => c.padraoId === contexto.contexto?.padraoId)
      : undefined;

  const recomendado =
    confirmadoManual ?? (elegiveis.length === 1 ? elegiveis[0] : undefined);

  if (!recomendado) {
    return incompleto(
      elegiveis.length > 1
        ? "A comparação está incompleta: há mais de um gabarito elegível para o contexto médico e a revisão humana é necessária."
        : "A comparação está incompleta: os procedimentos médicos não determinaram um gabarito ativo elegível.",
      contexto,
      elegiveis.length
    );
  }

  const divergencias = divergenciasDoCandidato(recomendado);
  const itensFaltantes = divergencias.filter(d => d.tipo === "ITEM_FALTANTE").length;

  return {
    estado: "aplicado",
    mensagem:
      divergencias.length > 0
        ? "Composição comparada com procedimentos médicos informativos; revise os itens faltantes indicados."
        : "Composição comparada com procedimentos médicos informativos, sem item obrigatório ou condicional pendente.",
    fontes: contexto.fontes.length,
    gabaritosElegiveis: elegiveis.length,
    itensFaltantes,
    gabaritoSelecionado: {
      padraoId: recomendado.padraoId,
      nome: recomendado.nome,
    },
    divergencias,
  };
}
