export interface LinhaPrevisaoRecebimentoTasy {
  convenio: string;
  mesReferencia: string | null;
  mesVencimento: string | null;
  protocolo: string | null;
  chave: string;
  valor: number;
}

export interface LinhaPagamentoBiTasy {
  estabelecimento: string;
  convenio: string;
  mes: string | null;
  recebido: number;
  vinculado: number;
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export function normalizarMesTasy(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const texto = String(valor).trim();
  let match = texto.match(/^(\d{4})[-\/]?(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  match = texto.match(/^(\d{2})[-\/](\d{4})/);
  if (match) return `${match[2]}-${match[1]}`;
  return null;
}

export function montarPrevisaoRecebimentosTasy(linhas: LinhaPrevisaoRecebimentoTasy[]) {
  const unicas = new Map<string, LinhaPrevisaoRecebimentoTasy>();
  for (const linha of linhas) {
    const mesReferencia = normalizarMesTasy(linha.mesReferencia);
    const mesVencimento = normalizarMesTasy(linha.mesVencimento);
    const convenio = linha.convenio?.trim() || "Sem Convênio";
    const chave = `${linha.chave}|${convenio}|${mesReferencia || "sem-ref"}`;
    const atual = unicas.get(chave);
    const normalizada = { ...linha, convenio, mesReferencia, mesVencimento, valor: Number(linha.valor || 0) };
    if (!atual || normalizada.valor > atual.valor) unicas.set(chave, normalizada);
  }

  const registros = Array.from(unicas.values());
  const agrupar = (obterChave: (linha: LinhaPrevisaoRecebimentoTasy) => string | null) => {
    const mapa = new Map<string, { valor: number; protocolos: Set<string> }>();
    for (const linha of registros) {
      const chave = obterChave(linha);
      if (!chave) continue;
      const atual = mapa.get(chave) ?? { valor: 0, protocolos: new Set<string>() };
      atual.valor += linha.valor;
      atual.protocolos.add(linha.protocolo || linha.chave);
      mapa.set(chave, atual);
    }
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, item]) => ({ mes, valor: arredondar(item.valor), qtd: item.protocolos.size }));
  };

  const porMesReferencia = agrupar(linha => linha.mesReferencia);
  const porMesVencimento = agrupar(linha => linha.mesVencimento);

  const convenioMap = new Map<string, { valorRef: number; valorProj: number; protocolos: Set<string> }>();
  const vencimentoConvenioMap = new Map<string, { mes: string; convenio: string; valor: number; protocolos: Set<string> }>();
  for (const linha of registros) {
    const atual = convenioMap.get(linha.convenio) ?? { valorRef: 0, valorProj: 0, protocolos: new Set<string>() };
    atual.valorRef += linha.valor;
    if (linha.mesVencimento) atual.valorProj += linha.valor;
    atual.protocolos.add(linha.protocolo || linha.chave);
    convenioMap.set(linha.convenio, atual);

    if (linha.mesVencimento) {
      const chave = `${linha.mesVencimento}|${linha.convenio}`;
      const vencimento = vencimentoConvenioMap.get(chave) ?? {
        mes: linha.mesVencimento,
        convenio: linha.convenio,
        valor: 0,
        protocolos: new Set<string>(),
      };
      vencimento.valor += linha.valor;
      vencimento.protocolos.add(linha.protocolo || linha.chave);
      vencimentoConvenioMap.set(chave, vencimento);
    }
  }

  const porConvenio = Array.from(convenioMap.entries())
    .map(([convenio, item]) => ({
      convenio,
      valorRef: arredondar(item.valorRef),
      valorProj: arredondar(item.valorProj),
      qtd: item.protocolos.size,
    }))
    .sort((a, b) => b.valorRef - a.valorRef);

  const vencimentoPorConvenio = Array.from(vencimentoConvenioMap.values())
    .map(item => ({ mes: item.mes, convenio: item.convenio, valor: arredondar(item.valor), qtd: item.protocolos.size }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || b.valor - a.valor);

  const totalFaturado = arredondar(porConvenio.reduce((total, item) => total + item.valorRef, 0));
  const totalProjetado = arredondar(porConvenio.reduce((total, item) => total + item.valorProj, 0));
  const protocolos = new Set(registros.map(item => item.protocolo || item.chave));

  return {
    resumo: {
      totalFaturado,
      totalProjetado,
      totalSemVencimento: arredondar(Math.max(totalFaturado - totalProjetado, 0)),
      qtdProtocolos: protocolos.size,
    },
    porMesReferencia,
    porMesVencimento,
    vencimentoPorConvenio,
    porConvenio,
  };
}

export function montarPagamentosBiTasy(linhas: LinhaPagamentoBiTasy[]) {
  const normalizadas = linhas.map(linha => {
    const recebido = Number(linha.recebido || 0);
    const vinculado = Number(linha.vinculado || 0);
    return {
      estabelecimento: linha.estabelecimento?.trim() || "Estabelecimento não informado",
      convenio: linha.convenio?.trim() || "Sem Convênio",
      mes: normalizarMesTasy(linha.mes) || "Sem competência",
      recebido,
      vinculado,
      a_vincular: Math.max(recebido - vinculado, 0),
    };
  });

  const agregar = (campos: Array<"mes" | "estabelecimento" | "convenio">) => {
    const mapa = new Map<string, any>();
    for (const linha of normalizadas) {
      const chave = campos.map(campo => linha[campo]).join("|");
      const atual = mapa.get(chave) ?? Object.fromEntries(campos.map(campo => [campo, linha[campo]]));
      atual.recebido = Number(atual.recebido || 0) + linha.recebido;
      atual.vinculado = Number(atual.vinculado || 0) + linha.vinculado;
      atual.a_vincular = Number(atual.a_vincular || 0) + linha.a_vincular;
      mapa.set(chave, atual);
    }
    return Array.from(mapa.values()).map(item => ({
      ...item,
      recebido: arredondar(item.recebido),
      vinculado: arredondar(item.vinculado),
      a_vincular: arredondar(item.a_vincular),
    }));
  };

  const porMes = agregar(["mes"]).sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const pagamentosPorConvenio = agregar(["mes", "estabelecimento", "convenio"])
    .sort((a, b) => String(a.mes).localeCompare(String(b.mes)) || b.recebido - a.recebido);
  const porConvenio = agregar(["estabelecimento", "convenio"]).sort((a, b) => b.recebido - a.recebido);

  return {
    resumo: {
      totalRecebido: arredondar(normalizadas.reduce((total, item) => total + item.recebido, 0)),
      totalVinculado: arredondar(normalizadas.reduce((total, item) => total + item.vinculado, 0)),
      totalAVincular: arredondar(normalizadas.reduce((total, item) => total + item.a_vincular, 0)),
    },
    porMes,
    porConvenio,
    pagamentosPorConvenio,
  };
}
