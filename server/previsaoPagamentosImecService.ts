export const IMEC_ESTABELECIMENTO_ID = 2550001;

export type ConfiancaPrevisao = "alta" | "media" | "baixa";
export type StatusPrevisao = "realizado" | "programado" | "estimado" | "atrasado";

export interface PagamentoHistoricoImec {
  convenioId: number;
  convenio: string;
  dataPagamento: string;
  itens: number;
  guias: number;
  valorPago: number;
  valorGlosa: number;
  prazoMedioDias: number | null;
}

export interface LinhaPrevisaoImec {
  convenioId: number;
  convenio: string;
  mes: string;
  dataPrevista: string;
  status: StatusPrevisao;
  valorBruto: number;
  valorPrevisto: number;
  glosaPrevista: number;
  confianca: ConfiancaPrevisao;
  origem: string;
}

const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

const mesDaData = (data: string) => data.slice(0, 7);

const chaveMes = (data: Date) =>
  `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;

const adicionarMeses = (data: Date, meses: number) =>
  new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1));

const dataNoMes = (mes: string, dia: number) => {
  const [ano, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Math.max(dia, 1), ultimoDia)).padStart(2, "0")}`;
};

function classificarConfianca(mesesHistorico: number, itens: number, coeficienteVariacao: number): ConfiancaPrevisao {
  if (mesesHistorico >= 6 && itens >= 500 && coeficienteVariacao <= 0.2) return "alta";
  if ((mesesHistorico >= 3 && itens >= 100) || (mesesHistorico >= 2 && itens >= 500 && coeficienteVariacao <= 0.35)) return "media";
  return "baixa";
}

function mediaPonderadaRecente(valores: number[]) {
  const recentes = valores.slice(-3);
  const somaPesos = recentes.reduce((total, _valor, indice) => total + indice + 1, 0);
  return recentes.reduce((total, valor, indice) => total + valor * (indice + 1), 0) / Math.max(somaPesos, 1);
}

export function gerarPrevisaoPagamentosImec(
  linhas: PagamentoHistoricoImec[],
  horizonteMeses = 6,
  hoje = new Date(),
) {
  const hojeIso = hoje.toISOString().slice(0, 10);
  const primeiroMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const mesesHorizonte = Array.from({ length: horizonteMeses }, (_item, indice) => chaveMes(adicionarMeses(primeiroMes, indice)));
  const porConvenio = new Map<number, PagamentoHistoricoImec[]>();

  for (const linha of linhas) {
    const atuais = porConvenio.get(linha.convenioId) ?? [];
    atuais.push(linha);
    porConvenio.set(linha.convenioId, atuais);
  }

  const cronograma: LinhaPrevisaoImec[] = [];
  const indicadoresConvenio = Array.from(porConvenio.entries()).map(([convenioId, registros]) => {
    const ordenados = [...registros].sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
    const meses = new Map<string, { pago: number; glosa: number; itens: number; guias: number }>();

    for (const registro of ordenados) {
      const mes = mesDaData(registro.dataPagamento);
      const atual = meses.get(mes) ?? { pago: 0, glosa: 0, itens: 0, guias: 0 };
      atual.pago += registro.valorPago;
      atual.glosa += registro.valorGlosa;
      atual.itens += registro.itens;
      atual.guias += registro.guias;
      meses.set(mes, atual);
    }

    const mesesOrdenados = Array.from(meses.entries()).sort(([a], [b]) => a.localeCompare(b));
    const brutosMensais = mesesOrdenados.map(([_mes, valor]) => valor.pago + valor.glosa);
    const mediaBruta = mediaPonderadaRecente(brutosMensais);
    const mediaSimples = brutosMensais.reduce((total, valor) => total + valor, 0) / Math.max(brutosMensais.length, 1);
    const variancia = brutosMensais.reduce((total, valor) => total + (valor - mediaSimples) ** 2, 0) / Math.max(brutosMensais.length, 1);
    const coeficienteVariacao = mediaSimples > 0 ? Math.sqrt(variancia) / mediaSimples : 1;
    const totalPago = ordenados.reduce((total, item) => total + item.valorPago, 0);
    const totalGlosa = ordenados.reduce((total, item) => total + item.valorGlosa, 0);
    const totalBruto = totalPago + totalGlosa;
    const taxaPagamento = totalBruto > 0 ? totalPago / totalBruto : 0;
    const itens = ordenados.reduce((total, item) => total + item.itens, 0);
    const guias = ordenados.reduce((total, item) => total + item.guias, 0);
    const diaTipico = Math.round(
      ordenados.reduce((total, item) => total + Number(item.dataPagamento.slice(8, 10)) * Math.max(item.itens, 1), 0) /
      Math.max(ordenados.reduce((total, item) => total + Math.max(item.itens, 1), 0), 1),
    );
    const prazosValidos = ordenados.filter(item => item.prazoMedioDias !== null);
    const prazoMedioDias = prazosValidos.length > 0
      ? prazosValidos.reduce((total, item) => total + Number(item.prazoMedioDias) * Math.max(item.itens, 1), 0) /
        prazosValidos.reduce((total, item) => total + Math.max(item.itens, 1), 0)
      : null;
    const confianca = classificarConfianca(mesesOrdenados.length, itens, coeficienteVariacao);

    for (const mes of mesesHorizonte) {
      const conhecidosNoMes = ordenados.filter(item => mesDaData(item.dataPagamento) === mes);
      if (conhecidosNoMes.length > 0) {
        for (const conhecido of conhecidosNoMes) {
          const valorBruto = conhecido.valorPago + conhecido.valorGlosa;
          cronograma.push({
            convenioId,
            convenio: conhecido.convenio.trim(),
            mes,
            dataPrevista: conhecido.dataPagamento,
            status: conhecido.dataPagamento < hojeIso ? "realizado" : "programado",
            valorBruto: arredondar(valorBruto),
            valorPrevisto: arredondar(conhecido.valorPago),
            glosaPrevista: arredondar(conhecido.valorGlosa),
            confianca,
            origem: "Demonstrativo importado",
          });
        }
        continue;
      }

      const dataPrevista = dataNoMes(mes, diaTipico);
      cronograma.push({
        convenioId,
        convenio: ordenados[0]?.convenio.trim() ?? `Convênio ${convenioId}`,
        mes,
        dataPrevista,
        status: dataPrevista < hojeIso ? "atrasado" : "estimado",
        valorBruto: arredondar(mediaBruta),
        valorPrevisto: arredondar(mediaBruta * taxaPagamento),
        glosaPrevista: arredondar(mediaBruta * (1 - taxaPagamento)),
        confianca,
        origem: `Média ponderada dos últimos ${Math.min(mesesOrdenados.length, 3)} mês(es)`,
      });
    }

    const previsoes = cronograma.filter(item => item.convenioId === convenioId && item.status !== "realizado");
    return {
      convenioId,
      convenio: ordenados[0]?.convenio.trim() ?? `Convênio ${convenioId}`,
      mesesHistorico: mesesOrdenados.length,
      itensHistorico: itens,
      guiasHistorico: guias,
      ultimoPagamento: ordenados.at(-1)?.dataPagamento ?? null,
      diaTipicoPagamento: diaTipico,
      prazoMedioDias: prazoMedioDias === null ? null : arredondar(prazoMedioDias),
      taxaPagamento: arredondar(taxaPagamento * 100),
      taxaGlosa: arredondar((1 - taxaPagamento) * 100),
      mediaMensalBruta: arredondar(mediaBruta),
      proximaDataPrevista: previsoes[0]?.dataPrevista ?? null,
      valorProximoPagamento: previsoes[0]?.valorPrevisto ?? 0,
      glosaProximaPrevista: previsoes[0]?.glosaPrevista ?? 0,
      confianca,
    };
  });

  const cronogramaOrdenado = cronograma.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista) || a.convenio.localeCompare(b.convenio));
  const futuros = cronogramaOrdenado.filter(item => item.status !== "realizado");
  const programados = futuros.filter(item => item.status === "programado");

  const mensal = mesesHorizonte.map(mes => {
    const itensMes = cronogramaOrdenado.filter(item => item.mes === mes);
    return {
      mes,
      programado: arredondar(itensMes.filter(item => item.status === "programado").reduce((total, item) => total + item.valorPrevisto, 0)),
      estimado: arredondar(itensMes.filter(item => item.status === "estimado").reduce((total, item) => total + item.valorPrevisto, 0)),
      atrasado: arredondar(itensMes.filter(item => item.status === "atrasado").reduce((total, item) => total + item.valorPrevisto, 0)),
      glosaPrevista: arredondar(itensMes.filter(item => item.status !== "realizado").reduce((total, item) => total + item.glosaPrevista, 0)),
      realizado: arredondar(itensMes.filter(item => item.status === "realizado").reduce((total, item) => total + item.valorPrevisto, 0)),
    };
  });

  return {
    estabelecimento: { id: IMEC_ESTABELECIMENTO_ID, nome: "Imec Senador Canedo" },
    dataBase: hojeIso,
    mesesHorizonte,
    resumo: {
      totalPrevisto: arredondar(futuros.reduce((total, item) => total + item.valorPrevisto, 0)),
      totalProgramado: arredondar(programados.reduce((total, item) => total + item.valorPrevisto, 0)),
      totalEstimado: arredondar(futuros.filter(item => item.status === "estimado").reduce((total, item) => total + item.valorPrevisto, 0)),
      totalAtrasado: arredondar(futuros.filter(item => item.status === "atrasado").reduce((total, item) => total + item.valorPrevisto, 0)),
      totalRealizado: arredondar(cronogramaOrdenado.filter(item => item.status === "realizado").reduce((total, item) => total + item.valorPrevisto, 0)),
      glosaPrevista: arredondar(futuros.reduce((total, item) => total + item.glosaPrevista, 0)),
      convenios: indicadoresConvenio.length,
      confiancaAlta: indicadoresConvenio.filter(item => item.confianca === "alta").length,
      confiancaMedia: indicadoresConvenio.filter(item => item.confianca === "media").length,
      confiancaBaixa: indicadoresConvenio.filter(item => item.confianca === "baixa").length,
    },
    porConvenio: indicadoresConvenio.sort((a, b) => b.valorProximoPagamento - a.valorProximoPagamento),
    cronograma: cronogramaOrdenado,
    mensal,
  };
}
