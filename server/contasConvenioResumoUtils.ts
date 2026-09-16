export type ContaConvenioXmlOrigem = {
  numero_guia_prestador?: string | number | null;
  numero_guia_operadora?: string | number | null;
  numero_lote?: string | number | null;
  convenio_nome?: string | null;
  convenioId?: number | null;
  carteira_beneficiario?: string | null;
  valor_faturado?: string | number | null;
  valor_unitario?: string | number | null;
  quantidade?: string | number | null;
  data_execucao?: string | Date | null;
  competencia_xml?: string | null;
  data_referencia?: string | Date | null;
  arquivo_data_referencia?: string | Date | null;
};

export type ResumoContaConvenioXml = {
  numeroConta: string;
  numeroLote: string | null;
  competencia: string | null;
  convenio: string | null;
  convenioId: number | null;
  carteira: string | null;
  totalItens: number;
  valorTotal: number;
  dataExecucao: Date | null;
};

function competenciaDaData(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const data = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(data.getTime())) return null;
  return `${data.getFullYear()}/${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function resolverCompetenciaContaXml(row: ContaConvenioXmlOrigem): string | null {
  const competenciaDireta = row.competencia_xml?.trim();
  if (competenciaDireta) {
    const normalizada = competenciaDireta.replace("-", "/");
    if (/^\d{4}\/\d{2}$/.test(normalizada)) return normalizada;
  }

  return competenciaDaData(row.data_referencia)
    || competenciaDaData(row.arquivo_data_referencia)
    || competenciaDaData(row.data_execucao);
}

export function agruparResumosContaXml(rows: ContaConvenioXmlOrigem[]): ResumoContaConvenioXml[] {
  const resumos = new Map<string, ResumoContaConvenioXml>();

  for (const row of rows) {
    const numeroConta = String(row.numero_guia_prestador || row.numero_guia_operadora || "SEM_GUIA");
    const numeroLote = row.numero_lote ? String(row.numero_lote) : null;
    const competencia = resolverCompetenciaContaXml(row);
    const chave = `${numeroConta}|${numeroLote || ""}|${competencia || ""}`;
    const existente = resumos.get(chave) || {
      numeroConta,
      numeroLote,
      competencia,
      convenio: null,
      convenioId: null,
      carteira: null,
      totalItens: 0,
      valorTotal: 0,
      dataExecucao: null,
    };

    existente.convenio = existente.convenio || (row.convenio_nome ? String(row.convenio_nome) : null);
    existente.convenioId = existente.convenioId || row.convenioId || null;
    existente.carteira = existente.carteira || (row.carteira_beneficiario ? String(row.carteira_beneficiario) : null);
    existente.totalItens += 1;

    const valorFaturado = row.valor_faturado ? Number(row.valor_faturado) : 0;
    const valorUnitario = row.valor_unitario ? Number(row.valor_unitario) : 0;
    const quantidade = row.quantidade ? Number(row.quantidade) : 0;
    existente.valorTotal += valorFaturado || (valorUnitario * quantidade);

    if (row.data_execucao && !existente.dataExecucao) {
      existente.dataExecucao = new Date(row.data_execucao);
    }

    resumos.set(chave, existente);
  }

  return Array.from(resumos.values());
}
