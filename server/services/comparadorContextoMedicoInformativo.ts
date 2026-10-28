import type {
  CandidatoGabarito,
  ContaContextoMedicoResultado,
} from "../../shared/contaContextoMedico";

export type EstadoContextoMedicoNaComparacao =
  | "nao_solicitado"
  | "aplicado"
  | "incompleto";

export interface DivergenciaContextoMedicoInformativo {
  tipo: "ITEM_FALTANTE";
  severidade: "alerta" | "critico";
  mensagem: string;
  codigoItem: string;
  descricaoItem?: string;
  padraoId: number;
  isGabarito: true;
  detalhes: {
    origem: "contexto_medico_informativo";
    categoria: "obrigatorio" | "condicional";
    frequencia: number | null;
  };
}

export interface ResultadoContextoMedicoNaComparacao {
  estado: EstadoContextoMedicoNaComparacao;
  mensagem: string | null;
  fontes: number;
  gabaritosElegiveis: number;
  itensFaltantes: number;
  divergencias: DivergenciaContextoMedicoInformativo[];
}

type ContextoMinimo = Pick<
  ContaContextoMedicoResultado,
  "configuracaoPendente" | "diagnosticoSnapshot" | "fontes" | "candidatos"
>;

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

function categoriaAlerta(categoria: "obrigatorio" | "condicional") {
  return categoria === "obrigatorio" ? "critico" : "alerta";
}

function divergenciasDoCandidato(
  candidato: CandidatoGabarito
): DivergenciaContextoMedicoInformativo[] {
  return candidato.composicao.itens
    .filter(
      item =>
        item.pendencia &&
        (item.categoria === "obrigatorio" || item.categoria === "condicional")
    )
    .map(item => {
      // O filtro acima já excluiu a categoria opcional. A normalização local
      // mantém o contrato explícito mesmo se novos tipos de categoria surgirem.
      const categoria: "obrigatorio" | "condicional" =
        item.categoria === "obrigatorio" ? "obrigatorio" : "condicional";
      return {
        tipo: "ITEM_FALTANTE" as const,
        severidade: categoriaAlerta(categoria),
        mensagem:
          `Item "${item.descricao || item.codigo}" [${categoria.toUpperCase()}] ` +
          `esperado no gabarito "${candidato.nome}" não foi encontrado na composição hospitalar. ` +
          "Evidência: contexto médico informativo; requer revisão humana.",
        codigoItem: item.codigo,
        descricaoItem: item.descricao || undefined,
        padraoId: candidato.padraoId,
        isGabarito: true as const,
        detalhes: {
          origem: "contexto_medico_informativo" as const,
          categoria,
          frequencia: item.frequencia ?? null,
        },
      };
    });
}

/**
 * Converte a conclusão sanitizada do Contexto médico em alertas de composição.
 *
 * A função é intencionalmente pura: não consulta XML, não recebe valores e não
 * confirma gabaritos. Só uma recomendação única já calculada pelo serviço de
 * Contexto médico pode gerar itens faltantes. Em qualquer ausência ou ambiguidade,
 * a comparação é incompleta — nunca "conforme".
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
  if (elegiveis.length !== 1) {
    return incompleto(
      elegiveis.length > 1
        ? "A comparação está incompleta: há mais de um gabarito elegível para o contexto médico e a revisão humana é necessária."
        : "A comparação está incompleta: os procedimentos médicos não determinaram um gabarito ativo elegível.",
      contexto,
      elegiveis.length
    );
  }
  const recomendado = elegiveis[0];

  const divergencias = divergenciasDoCandidato(recomendado);
  return {
    estado: "aplicado",
    mensagem:
      divergencias.length > 0
        ? "Composição comparada com procedimentos médicos informativos; revise os itens faltantes indicados."
        : "Composição comparada com procedimentos médicos informativos, sem item obrigatório ou condicional pendente.",
    fontes: contexto.fontes.length,
    gabaritosElegiveis: elegiveis.length,
    itensFaltantes: divergencias.length,
    divergencias,
  };
}
