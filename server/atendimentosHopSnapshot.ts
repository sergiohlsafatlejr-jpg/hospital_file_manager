import { createHash } from "node:crypto";
import { HOP_DIARIO_CRON as HOP_DIARIO_CRON_COMPARTILHADO } from "../shared/atendimentosHopDiario";
import type { HopDiarioContagens } from "../shared/atendimentosHopDiario";
import {
  HUP_ESTABELECIMENTO_ID,
  HUP_ORIGEM,
  mapearHopUrologico,
  type HopUrologicoRow,
} from "./hopUrologicoMap";
import { mapearHopIad } from "./iadHopMap";

/** Unidades expressamente habilitadas para o snapshot diário Hop. */
export const HOP_DIARIO_ESTABELECIMENTOS = [1260036, 2550002] as const;
export const HOP_DIARIO_ORIGEM = HUP_ORIGEM;
export const HOP_DIARIO_CRON = HOP_DIARIO_CRON_COMPARTILHADO;

const IAD_ESTABELECIMENTO_ID = 2550002;
const LIMITE_FONTE_HOP = 100_000;
const TIME_ZONE_BRASILIA = "America/Sao_Paulo";

const CAMPOS_MAPEADOS_HOP = [
  "numero_atendimento",
  "codigo_saida",
  "convenio",
  "paciente",
  "caracter_atendimento",
  "data_entrada",
  "data_saida",
  "tipo_atendimento",
  "descricao_atendimento",
  "codigo_servico",
  "codigo_procedimento",
  "destino_conta",
] as const;

type CampoMapeadoHop = (typeof CAMPOS_MAPEADOS_HOP)[number];
type ValorMapeadoHop = string | null;

/**
 * Projeção mínima produzida pelos mapeadores físicos Hop. Datas continuam em
 * texto civil, sem Date/UTC, para não deslocar dia ou horário durante a comparação.
 */
export type HopMapeado = {
  estabelecimentoId: number;
  origemSistema: typeof HOP_DIARIO_ORIGEM;
  origemId: string;
  numero_atendimento: string;
  codigo_saida: ValorMapeadoHop;
  convenio: ValorMapeadoHop;
  paciente: ValorMapeadoHop;
  caracter_atendimento: ValorMapeadoHop;
  data_entrada: string;
  data_saida: string | null;
  tipo_atendimento: ValorMapeadoHop;
  descricao_atendimento: ValorMapeadoHop;
  codigo_servico: ValorMapeadoHop;
  codigo_procedimento: ValorMapeadoHop;
  destino_conta: ValorMapeadoHop;
  ativoNaFonte: 1;
};

/**
 * Linha já lida do destino. A assinatura permite campos legados e metadados
 * adicionais; eles não entram no update Hop e, portanto, são preservados pelo serviço.
 */
export type HopDestinoRow = {
  id: number;
  estabelecimentoId: number;
  origemSistema: string;
  origemId: string;
  ativoNaFonte: boolean | 0 | 1;
  numero_atendimento: string | null;
  codigo_saida: ValorMapeadoHop;
  convenio: ValorMapeadoHop;
  paciente: ValorMapeadoHop;
  caracter_atendimento: ValorMapeadoHop;
  data_entrada: string | null;
  data_saida: string | null;
  tipo_atendimento: ValorMapeadoHop;
  descricao_atendimento: ValorMapeadoHop;
  codigo_servico: ValorMapeadoHop;
  codigo_procedimento: ValorMapeadoHop;
  destino_conta: ValorMapeadoHop;
  [campoExtra: string]: unknown;
};

export type PlanoHop = {
  fonteMapeada: HopMapeado[];
  novas: HopMapeado[];
  atualizadas: HopMapeado[];
  reativadas: HopMapeado[];
  inalteradas: HopMapeado[];
  inativarIds: number[];
  contagens: HopDiarioContagens;
  /** Digest privado; o conteúdo canônico que o originou nunca é retornado. */
  fingerprint: string;
};

export type ValidacaoCoberturaHop = {
  /** Percentual de fontes presentes sobre os registros ativos antes do plano. */
  cobertura: number;
  coberturaMinimaAtendida: boolean;
  inativacaoSuspeita: boolean;
  /** Alias conservador para consumidores que só precisam do resultado binário. */
  seguro: boolean;
  /** Nunca fica verdadeiro quando qualquer guarda falha. */
  automaticoPermitido: boolean;
  /** Um fluxo manual deve exigir aceite explícito, sem relaxar a guarda automática. */
  requerEscolhaManual: boolean;
  motivos: Array<"COBERTURA_INSUFICIENTE" | "INATIVACAO_SUSPEITA">;
};

function erroFonte(): never {
  // Mensagem deliberadamente sem conteúdo de linha (inclusive identificadores/paciente).
  throw new Error("Fonte Hop inválida; publicação suspensa.");
}

function erroDestino(): never {
  // Mensagem deliberadamente sem conteúdo de linha (inclusive identificadores/paciente).
  throw new Error("Destino Hop inválido; publicação suspensa.");
}

function estabelecimentoHopValido(estabelecimentoId: number): boolean {
  return (
    estabelecimentoId === HUP_ESTABELECIMENTO_ID ||
    estabelecimentoId === IAD_ESTABELECIMENTO_ID
  );
}

function origemIdValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" && /^[1-9]\d*$/.test(valor) && valor.length <= 100
  );
}

function inteiroPositivoSeguro(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor > 0;
}

function valorMapeadoValido(valor: unknown): valor is ValorMapeadoHop {
  return valor === null || typeof valor === "string";
}

function ativoNoDestino(valor: unknown): boolean {
  if (valor === true || valor === 1) return true;
  if (valor === false || valor === 0) return false;
  return erroDestino();
}

function compararOrigemId(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

function validarIntervaloCivil(mapeado: HopMapeado): void {
  // Os mapeadores já validam o formato/calendário. Comparar strings no formato
  // YYYY-MM-DD HH:mm:ss preserva os bytes civis e não executa conversão de fuso.
  if (mapeado.data_saida !== null && mapeado.data_saida < mapeado.data_entrada)
    erroFonte();
}

function mapearFonte(
  linha: HopUrologicoRow,
  estabelecimentoId: number
): HopMapeado {
  try {
    const mapeado =
      estabelecimentoId === HUP_ESTABELECIMENTO_ID
        ? mapearHopUrologico(linha)
        : mapearHopIad(linha, estabelecimentoId);

    if (
      mapeado.estabelecimentoId !== estabelecimentoId ||
      mapeado.origemSistema !== HOP_DIARIO_ORIGEM ||
      !origemIdValido(mapeado.origemId)
    ) {
      return erroFonte();
    }

    const resultado: HopMapeado = {
      estabelecimentoId: mapeado.estabelecimentoId,
      origemSistema: mapeado.origemSistema,
      origemId: mapeado.origemId,
      numero_atendimento: mapeado.numero_atendimento,
      codigo_saida: mapeado.codigo_saida,
      convenio: mapeado.convenio,
      paciente: mapeado.paciente,
      caracter_atendimento: mapeado.caracter_atendimento,
      data_entrada: mapeado.data_entrada,
      data_saida: mapeado.data_saida,
      tipo_atendimento: mapeado.tipo_atendimento,
      descricao_atendimento: mapeado.descricao_atendimento,
      codigo_servico: mapeado.codigo_servico,
      codigo_procedimento: mapeado.codigo_procedimento,
      destino_conta: mapeado.destino_conta,
      ativoNaFonte: 1,
    };
    validarIntervaloCivil(resultado);
    return resultado;
  } catch {
    return erroFonte();
  }
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function pertenceAoEscopo(
  linha: Record<string, unknown>,
  estabelecimentoId: number
): boolean {
  return (
    linha.estabelecimentoId === estabelecimentoId &&
    linha.origemSistema === HOP_DIARIO_ORIGEM
  );
}

function validarDestino(linha: HopDestinoRow, estabelecimentoId: number): void {
  if (
    !inteiroPositivoSeguro(linha.id) ||
    linha.estabelecimentoId !== estabelecimentoId ||
    linha.origemSistema !== HOP_DIARIO_ORIGEM ||
    !origemIdValido(linha.origemId)
  ) {
    erroDestino();
  }

  ativoNoDestino(linha.ativoNaFonte);
  for (const campo of CAMPOS_MAPEADOS_HOP) {
    if (!valorMapeadoValido(linha[campo])) erroDestino();
  }
}

function mesmosCamposMapeados(
  fonte: HopMapeado,
  destino: HopDestinoRow
): boolean {
  return CAMPOS_MAPEADOS_HOP.every(campo => fonte[campo] === destino[campo]);
}

function registroFonteCanonico(linha: HopMapeado): unknown[] {
  return [
    linha.estabelecimentoId,
    linha.origemSistema,
    linha.origemId,
    linha.ativoNaFonte,
    ...CAMPOS_MAPEADOS_HOP.map(campo => linha[campo]),
  ];
}

function registroDestinoCanonico(linha: HopDestinoRow): unknown[] {
  return [
    linha.id,
    linha.estabelecimentoId,
    linha.origemSistema,
    linha.origemId,
    ativoNoDestino(linha.ativoNaFonte) ? 1 : 0,
    ...CAMPOS_MAPEADOS_HOP.map(campo => linha[campo]),
  ];
}

function calcularFingerprint(
  estabelecimentoId: number,
  fonte: HopMapeado[],
  destino: HopDestinoRow[]
): string {
  const conteudoCanonico = JSON.stringify({
    versao: 1,
    estabelecimentoId,
    origemSistema: HOP_DIARIO_ORIGEM,
    fonte: fonte.map(registroFonteCanonico),
    // Só o escopo publicado participa: outra unidade/origem não pode alterar a prévia.
    destino: destino.map(registroDestinoCanonico),
  });
  return createHash("sha256").update(conteudoCanonico).digest("hex");
}

/**
 * Produz somente um plano imutável de inserções/updates/reativações/inativações.
 * Não há I/O, SQL nem mutação de `destino`; os metadados adicionais do destino
 * sequer são copiados aos registros mapeados que o publicador poderá alterar.
 */
export function construirPlanoHop(
  estabelecimentoId: number,
  fonte: HopUrologicoRow[],
  destino: HopDestinoRow[]
): PlanoHop {
  if (!estabelecimentoHopValido(estabelecimentoId)) erroFonte();
  if (
    !Array.isArray(fonte) ||
    fonte.length === 0 ||
    fonte.length > LIMITE_FONTE_HOP
  )
    erroFonte();
  if (!Array.isArray(destino)) erroDestino();

  const fontePorOrigemId = new Map<string, HopMapeado>();
  for (const linha of fonte) {
    const mapeada = mapearFonte(linha, estabelecimentoId);
    if (fontePorOrigemId.has(mapeada.origemId)) erroFonte();
    fontePorOrigemId.set(mapeada.origemId, mapeada);
  }
  const fonteMapeada = [...fontePorOrigemId.values()].sort((a, b) =>
    compararOrigemId(a.origemId, b.origemId)
  );

  const destinoPorOrigemId = new Map<string, HopDestinoRow>();
  const idsDestino = new Set<number>();
  for (const candidata of destino) {
    if (!ehRegistro(candidata)) erroDestino();
    if (!pertenceAoEscopo(candidata, estabelecimentoId)) continue;

    const linha = candidata as HopDestinoRow;
    validarDestino(linha, estabelecimentoId);
    if (destinoPorOrigemId.has(linha.origemId) || idsDestino.has(linha.id))
      erroDestino();
    destinoPorOrigemId.set(linha.origemId, linha);
    idsDestino.add(linha.id);
  }
  const destinoMapeado = [...destinoPorOrigemId.values()].sort((a, b) => {
    const porOrigem = compararOrigemId(a.origemId, b.origemId);
    return porOrigem !== 0 ? porOrigem : a.id - b.id;
  });

  const novas: HopMapeado[] = [];
  const atualizadas: HopMapeado[] = [];
  const reativadas: HopMapeado[] = [];
  const inalteradas: HopMapeado[] = [];

  for (const linha of fonteMapeada) {
    const existente = destinoPorOrigemId.get(linha.origemId);
    if (!existente) {
      novas.push(linha);
    } else if (!ativoNoDestino(existente.ativoNaFonte)) {
      // Reativação inclui os campos da fonte no mesmo write, mas não é uma atualização separada.
      reativadas.push(linha);
    } else if (mesmosCamposMapeados(linha, existente)) {
      inalteradas.push(linha);
    } else {
      atualizadas.push(linha);
    }
  }

  const inativarIds = destinoMapeado
    .filter(
      linha =>
        ativoNoDestino(linha.ativoNaFonte) &&
        !fontePorOrigemId.has(linha.origemId)
    )
    .map(linha => linha.id)
    .sort((a, b) => a - b);

  const contagens: HopDiarioContagens = {
    totalFonte: fonteMapeada.length,
    ativosAntes: destinoMapeado.filter(linha =>
      ativoNoDestino(linha.ativoNaFonte)
    ).length,
    novos: novas.length,
    atualizados: atualizadas.length,
    reativados: reativadas.length,
    inalterados: inalteradas.length,
    inativados: inativarIds.length,
    ativosDepois: fonteMapeada.length,
  };

  return {
    fonteMapeada,
    novas,
    atualizadas,
    reativadas,
    inalteradas,
    inativarIds,
    contagens,
    fingerprint: calcularFingerprint(
      estabelecimentoId,
      fonteMapeada,
      destinoMapeado
    ),
  };
}

function validarContagens(contagens: HopDiarioContagens): void {
  const valores = Object.values(contagens);
  if (valores.some(valor => !Number.isSafeInteger(valor) || valor < 0)) {
    throw new Error("Contagens Hop inválidas.");
  }
  if (
    contagens.totalFonte !==
      contagens.novos +
        contagens.atualizados +
        contagens.reativados +
        contagens.inalterados ||
    contagens.ativosDepois !== contagens.totalFonte ||
    contagens.inativados > contagens.ativosAntes
  ) {
    throw new Error("Contagens Hop inconsistentes.");
  }
}

/**
 * Aplica guardas que continuam válidas em qualquer modo. Uma publicação
 * automática só passa com cobertura suficiente e sem redução suspeita; a UI ou
 * serviço pode oferecer fluxo manual, mas deve exigir escolha explícita quando
 * `requerEscolhaManual` for verdadeiro.
 */
export function validarCoberturaHop(
  contagens: HopDiarioContagens
): ValidacaoCoberturaHop {
  validarContagens(contagens);

  const cobertura =
    contagens.ativosAntes === 0
      ? 100
      : (contagens.totalFonte / contagens.ativosAntes) * 100;
  const coberturaMinimaAtendida =
    contagens.ativosAntes < 100 || cobertura >= 80;
  const inativacaoSuspeita =
    contagens.ativosAntes > 0 &&
    contagens.inativados / contagens.ativosAntes > 0.5;
  const motivos: ValidacaoCoberturaHop["motivos"] = [];
  if (!coberturaMinimaAtendida) motivos.push("COBERTURA_INSUFICIENTE");
  if (inativacaoSuspeita) motivos.push("INATIVACAO_SUSPEITA");
  const automaticoPermitido = motivos.length === 0;

  return {
    cobertura,
    coberturaMinimaAtendida,
    inativacaoSuspeita,
    seguro: automaticoPermitido,
    automaticoPermitido,
    requerEscolhaManual: !automaticoPermitido,
    motivos,
  };
}

/** Retorna a data civil de Brasília durante a janela diária 10:00–10:02 (inclusive). */
export function slotHopDiario(now: Date): string | null {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const valores = Object.fromEntries(
    partes
      .filter(parte => parte.type !== "literal")
      .map(parte => [parte.type, parte.value])
  );

  const hora = Number(valores.hour);
  const minuto = Number(valores.minute);
  if (hora !== 10 || minuto < 0 || minuto > 2) return null;
  return `${valores.year}-${valores.month}-${valores.day}`;
}
