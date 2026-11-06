import { createHash } from "node:crypto";
import type {
  ProcedimentoMedicoInfo,
  ProfissionalMedicoInfo,
} from "../shared/contaContextoMedico";

/** Metadados privados, somente hashes/contagens; nunca carteira, XML ou valores. */
export interface ComposicaoHonorarios {
  formato: "honorarios-v1";
  revisaoArquivo: string;
  identidadeHospitalar: string;
  identidadesRevisao: readonly string[];
  blocos: readonly { hash: string; registros: number }[];
  hashProcedimentos: string;
}

export function serializarHonorarios(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(serializarHonorarios).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${serializarHonorarios(record[key])}`)
    .join(",")}}`;
}

export function hashHonorarios(value: unknown): string {
  return createHash("sha256")
    .update(serializarHonorarios(value), "utf8")
    .digest("hex");
}

/** Ordem total por código, sem empates de collation entre Unicode distinto. */
function compararCanonico(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function ordenarHonorarios<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) =>
    compararCanonico(serializarHonorarios(a), serializarHonorarios(b))
  );
}

function profissionalCanonico(
  p: ProfissionalMedicoInfo
): ProfissionalMedicoInfo {
  return {
    nome: p.nome.trim() || "Não informado",
    conselho: p.conselho?.trim() || null,
    numeroConselho: p.numeroConselho?.trim() || null,
  };
}

function profissionaisConsolidados(
  values: readonly ProfissionalMedicoInfo[]
): ProfissionalMedicoInfo[] {
  const todos = ordenarHonorarios([
    ...new Map(
      values.map(p => {
        const value = profissionalCanonico(p);
        return [serializarHonorarios(value), value];
      })
    ).values(),
  ]);
  // Um placeholder só é substituído quando há identificação profissional completa.
  // Nomes conflitantes não são usados para inferir uma execução adicional.
  return todos.filter(
    p =>
      p.nome !== "Não informado" ||
      !todos.some(
        other =>
          other.nome !== "Não informado" &&
          p.conselho &&
          p.numeroConselho &&
          p.conselho === other.conselho &&
          p.numeroConselho === other.numeroConselho
      )
  );
}

export function normalizarProcedimentosHonorarios(
  values: readonly ProcedimentoMedicoInfo[]
): ProcedimentoMedicoInfo[] {
  return ordenarHonorarios(
    values
      .map(p => ({
        codigo: p.codigo.trim(),
        descricao: p.descricao.trim(),
        dataExecucao:
          p.dataExecucao?.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
        sequencial: p.sequencial?.trim() || null,
        profissionais: profissionaisConsolidados(p.profissionais),
      }))
      .filter(p => Boolean(p.codigo))
  );
}

/**
 * Nunca deduplica ocorrências dentro de um bloco. Sem sequencial, blocos distintos
 * são aditivos. Com posição explícita, reconcilia ocorrências entre blocos com
 * matching exato primeiro e enriquecimento depois; multiplicidade é o máximo
 * por bloco, e profissionais não criam execuções. A ordenação torna o resultado
 * independente da ordem XML, inclusive no caso A/B/B.
 */
export function comporBlocosHonorarios(
  blocos: readonly (readonly ProcedimentoMedicoInfo[])[]
): ProcedimentoMedicoInfo[] {
  const resultado: ProcedimentoMedicoInfo[] = [];
  const posicionados = new Map<string, ProcedimentoMedicoInfo[][]>();
  for (const bloco of ordenarHonorarios(
    blocos.map(normalizarProcedimentosHonorarios)
  )) {
    const porPosicao = new Map<string, ProcedimentoMedicoInfo[]>();
    for (const p of bloco) {
      if (!p.sequencial) {
        resultado.push(p);
        continue;
      }
      const key = serializarHonorarios({
        codigo: p.codigo,
        descricao: p.descricao,
        dataExecucao: p.dataExecucao,
        sequencial: p.sequencial,
      });
      const lista = porPosicao.get(key) ?? [];
      lista.push(p);
      porPosicao.set(key, lista);
    }
    for (const [key, lista] of porPosicao) {
      const listas = posicionados.get(key) ?? [];
      listas.push(lista);
      posicionados.set(key, listas);
    }
  }
  for (const listas of posicionados.values()) {
    // Maior bloco fornece o número de ocorrências legítimas, não o primeiro XML.
    listas.sort(
      (a, b) =>
        b.length - a.length ||
        compararCanonico(serializarHonorarios(a), serializarHonorarios(b))
    );
    const slots = listas[0].map(p => ({
      ...p,
      profissionais: [...p.profissionais],
    }));
    for (const lista of listas.slice(1)) {
      const usados = new Set<number>();
      const pendentes: ProcedimentoMedicoInfo[] = [];
      for (const p of lista) {
        const index = slots.findIndex(
          (slot, i) =>
            !usados.has(i) &&
            serializarHonorarios(slot.profissionais) ===
              serializarHonorarios(p.profissionais)
        );
        if (index >= 0) usados.add(index);
        else pendentes.push(p);
      }
      for (const p of pendentes) {
        const index = slots.findIndex((_, i) => !usados.has(i));
        usados.add(index);
        slots[index].profissionais = profissionaisConsolidados([
          ...slots[index].profissionais,
          ...p.profissionais,
        ]);
      }
    }
    resultado.push(...slots);
  }
  return ordenarHonorarios(resultado);
}

export function versaoComposicaoHonorarios(
  composicao: ComposicaoHonorarios
): string {
  return hashHonorarios(composicao);
}

export function composicaoHonorariosValida(
  value: unknown,
  procedimentos: readonly ProcedimentoMedicoInfo[]
): value is ComposicaoHonorarios {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as ComposicaoHonorarios;
  const hash = (v: unknown): v is string =>
    typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  return (
    c.formato === "honorarios-v1" &&
    hash(c.revisaoArquivo) &&
    hash(c.identidadeHospitalar) &&
    Array.isArray(c.identidadesRevisao) &&
    c.identidadesRevisao.length > 0 &&
    c.identidadesRevisao.every(hash) &&
    serializarHonorarios(c.identidadesRevisao) ===
      serializarHonorarios([...new Set(c.identidadesRevisao)].sort()) &&
    c.identidadesRevisao.includes(c.identidadeHospitalar) &&
    Array.isArray(c.blocos) &&
    c.blocos.length > 0 &&
    c.blocos.every(
      b =>
        b &&
        hash(b.hash) &&
        Number.isSafeInteger(b.registros) &&
        b.registros > 0
    ) &&
    serializarHonorarios(c.blocos) ===
      serializarHonorarios(ordenarHonorarios(c.blocos)) &&
    new Set(c.blocos.map(b => b.hash)).size === c.blocos.length &&
    c.hashProcedimentos ===
      hashHonorarios(normalizarProcedimentosHonorarios(procedimentos))
  );
}
