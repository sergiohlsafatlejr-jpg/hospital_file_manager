export const CODIGO_TUSS_VISITA_HOSPITALAR = "10102019";

export type ProfissionalVisita = {
  medico: string | null | undefined;
  crm: string | null | undefined;
};

export function normalizarProfissionalVisita(profissional: ProfissionalVisita) {
  const medico = profissional.medico?.trim() || null;
  const crm = profissional.crm?.trim() || null;
  return {
    medico,
    crm,
    informado: Boolean(medico || crm),
  };
}

export function formatarCrmVisita(crm: string | null | undefined) {
  const valor = crm?.trim();
  if (!valor) return "Não informado";
  return /^CRM\b/i.test(valor) ? valor : `CRM ${valor}`;
}

export function criarChaveProfissionalVisita(medico: string, crm?: string | null) {
  return JSON.stringify([medico.trim(), crm?.trim() || ""]);
}

export function lerChaveProfissionalVisita(chave: string) {
  try {
    const [medico, crm] = JSON.parse(chave) as [string, string];
    return { medico: medico?.trim() || undefined, crm: crm?.trim() || undefined };
  } catch {
    return { medico: undefined, crm: undefined };
  }
}

export function calcularCoberturaProfissionalVisita<T extends ProfissionalVisita>(itens: T[]) {
  const comMedico = itens.filter((item) => normalizarProfissionalVisita(item).informado).length;
  return {
    total: itens.length,
    comMedico,
    semMedico: itens.length - comMedico,
    percentual: itens.length ? Number(((comMedico / itens.length) * 100).toFixed(2)) : 0,
  };
}
