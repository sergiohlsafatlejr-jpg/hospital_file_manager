import Decimal from "decimal.js";
import {
  buscarPrecosPorItens,
  normalizarDataExecucao,
  type BancoContratosPreco,
  type ItemParaPreco,
} from "./contratosPrecoAplicavel";

type ItemFaturamento = ItemParaPreco & {
  quantidade?: unknown;
  valorFaturado?: unknown;
};
export type CamposCobrancaContratual = {
  valorContratadoTabela: number | null;
  valorContratadoTotal: number | null;
  diferencaContratoXml: number | null;
  statusAuditoriaContrato: "disponivel" | "indeterminado" | "indisponivel";
  statusCobrancaContrato:
    | "cobranca_menor_contrato"
    | "cobranca_maior_contrato"
    | "conforme_contrato"
    | "sem_preco_tabela"
    | "indeterminado"
    | "auditoria_indisponivel";
};

function decimalNaoNegativo(valor: unknown): Decimal | undefined {
  if ((typeof valor !== "string" && typeof valor !== "number") || String(valor).trim() === "") return;
  try {
    const numero = new Decimal(valor);
    if (!numero.isFinite() || numero.isNegative() || !Number.isFinite(numero.toNumber())) return;
    return numero;
  } catch {
    return;
  }
}

function camposVazios(status: CamposCobrancaContratual["statusAuditoriaContrato"]): CamposCobrancaContratual {
  return {
    valorContratadoTabela: null,
    valorContratadoTotal: null,
    diferencaContratoXml: null,
    statusAuditoriaContrato: status,
    statusCobrancaContrato: status === "indisponivel" ? "auditoria_indisponivel" : "indeterminado",
  };
}

/** Complemento somente leitura; não reatribui convênio, data, quantidade ou valores publicados. */
export async function enriquecerCobrancaContratualPorItem<T extends ItemFaturamento>(
  db: BancoContratosPreco,
  estabelecimentoId: number,
  itens: readonly T[],
): Promise<Array<T & CamposCobrancaContratual>> {
  if (!itens.length) return [];
  try {
    // O retorno é Array alinhado por índice, não Map por ID. Itens repetidos são legítimos.
    const precos = await buscarPrecosPorItens(db, estabelecimentoId, itens);
    return itens.map((item, indice) => {
      const convenioId = Number(item.convenioId);
      const contextoValido = Number.isSafeInteger(convenioId) && convenioId > 0 &&
        normalizarDataExecucao(item.dataExecucao) !== undefined &&
        [item.codigoItem, item.codigoItemTuss].some(codigo => String(codigo ?? "").trim() !== "");
      const campos = camposVazios("indeterminado");
      if (!contextoValido) return { ...item, ...campos };
      const preco = precos[indice];
      if (!preco) return { ...item, ...campos, statusAuditoriaContrato: "disponivel" as const, statusCobrancaContrato: "sem_preco_tabela" as const };
      const unitario = decimalNaoNegativo(preco.valor);
      if (!unitario) return { ...item, ...campos };
      campos.valorContratadoTabela = unitario.toNumber();
      const quantidade = decimalNaoNegativo(item.quantidade);
      // Não substituir quantidade zero por 1 nem usar preço unitário como total faturado.
      if (!quantidade) return { ...item, ...campos };
      const total = unitario.mul(quantidade).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (!Number.isFinite(total.toNumber())) return { ...item, ...campos };
      campos.valorContratadoTotal = total.toNumber();
      const cobrado = decimalNaoNegativo(item.valorFaturado);
      if (!cobrado) return { ...item, ...campos };
      const diferenca = total.minus(cobrado).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      campos.diferencaContratoXml = diferenca.toNumber();
      campos.statusAuditoriaContrato = "disponivel";
      campos.statusCobrancaContrato = diferenca.gt("0.05") ? "cobranca_menor_contrato" :
        diferenca.lt("-0.05") ? "cobranca_maior_contrato" : "conforme_contrato";
      return { ...item, ...campos };
    });
  } catch {
    // Não expor erro/SQL nem confundir falha de leitura com inexistência de tabela/preço.
    return itens.map(item => ({ ...item, ...camposVazios("indisponivel") }));
  }
}
