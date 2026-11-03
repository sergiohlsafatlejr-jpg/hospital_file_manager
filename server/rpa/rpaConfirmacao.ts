/** Campos extraídos da MESMA confirmação/linha por um adaptador de portal validado. */
export interface ConfirmacaoEstruturadaRpa {
  numeroLote: string;
  protocolo: string;
  estado: "confirmado" | "processando" | "rejeitado";
  nomeArquivo?: string | null;
  hashXmlSha256?: string | null;
}

export interface EstadoConfirmacaoRpa {
  /** Somente true após validação do adaptador com fixtures reais do portal. */
  adaptadorValidado: boolean;
  /** Inclui todas as referências anteriores no escopo da sessão, não apenas a primeira. */
  leituraCompleta: boolean;
  protocolosVisiveis: readonly string[];
  confirmacoes: readonly ConfirmacaoEstruturadaRpa[];
}

export interface IdentidadeSubmissaoRpa {
  numeroLote: string;
  /** Nome efetivamente anexado, não o nome original arbitrário do upload interno. */
  nomeArquivo: string;
  hashXmlSha256: string;
}

export type DecisaoConfirmacaoRpa =
  | { sucesso: true; status: "PROTOCOLADO"; protocolo: string; mensagem: string }
  | { sucesso: false; status: "AGUARDANDO_PORTAL"; mensagem: string };

export function aguardarConfirmacaoPortalRpa(): DecisaoConfirmacaoRpa {
  return {
    sucesso: false,
    status: "AGUARDANDO_PORTAL",
    mensagem:
      "Possível transmissão do XML; confirmação estruturada nova ainda não comprovada. Não reenviar automaticamente.",
  };
}

/** Não usa body, includes, substrings nem associa campos de linhas diferentes. */
export function avaliarConfirmacaoRpa(
  identidade: IdentidadeSubmissaoRpa,
  antes: EstadoConfirmacaoRpa,
  depois: EstadoConfirmacaoRpa,
  retornoIncerto = false
): DecisaoConfirmacaoRpa {
  if (
    retornoIncerto ||
    !antes.adaptadorValidado ||
    !depois.adaptadorValidado ||
    !antes.leituraCompleta ||
    !depois.leituraCompleta ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(identidade.numeroLote) ||
    !identidade.nomeArquivo ||
    !/^[a-f0-9]{64}$/i.test(identidade.hashXmlSha256)
  ) {
    return aguardarConfirmacaoPortalRpa();
  }

  const referenciasAnteriores = new Set([
    ...antes.protocolosVisiveis,
    ...antes.confirmacoes.map((confirmacao) => confirmacao.protocolo),
  ]);
  const novas = depois.confirmacoes.filter((confirmacao) => {
    if (
      confirmacao.estado !== "confirmado" ||
      confirmacao.numeroLote !== identidade.numeroLote ||
      !/^[0-9]{6,25}$/.test(confirmacao.protocolo) ||
      referenciasAnteriores.has(confirmacao.protocolo)
    ) {
      return false;
    }

    // Hash informado pelo portal é obrigatório e prevalece sobre o nome do arquivo.
    if (confirmacao.hashXmlSha256 != null) {
      return (
        /^[a-f0-9]{64}$/i.test(confirmacao.hashXmlSha256) &&
        confirmacao.hashXmlSha256.toLowerCase() === identidade.hashXmlSha256.toLowerCase() &&
        (confirmacao.nomeArquivo == null || confirmacao.nomeArquivo === identidade.nomeArquivo)
      );
    }
    return confirmacao.nomeArquivo === identidade.nomeArquivo;
  });

  // Referências conflitantes ou críticas na linha do lote deixam o resultado incerto.
  if (
    novas.length !== 1 ||
    depois.confirmacoes.some(
      (confirmacao) =>
        confirmacao.numeroLote === identidade.numeroLote &&
        confirmacao.estado !== "confirmado"
    ) ||
    depois.confirmacoes.some(
      (confirmacao) =>
        confirmacao.protocolo === novas[0].protocolo &&
        confirmacao.numeroLote !== identidade.numeroLote
    )
  ) {
    return aguardarConfirmacaoPortalRpa();
  }

  return {
    sucesso: true,
    status: "PROTOCOLADO",
    protocolo: novas[0].protocolo,
    mensagem: "Confirmação estruturada nova vinculada ao lote e ao arquivo transmitido.",
  };
}
