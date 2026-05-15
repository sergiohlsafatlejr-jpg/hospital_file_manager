/**
 * Constantes compartilhadas para o módulo de Atendimentos Unificados
 * Elimina duplicação de MOTIVOS, SETORES, MEDICOS em 4 páginas separadas
 */

// ===== Motivos de Notificação =====
export const MOTIVOS = [
  { value: "anestesista", label: "Pendência com Anestesista" },
  { value: "medico", label: "Pendência Médica" },
  { value: "medcore", label: "Pendência Medcore" },
  { value: "enfermagem", label: "Pendência Enfermagem" },
  { value: "centro_cirurgico", label: "Pendência Centro Cirúrgico" },
  { value: "farmacia", label: "Pendência Farmácia" },
  { value: "exames", label: "Falta de Exames" },
  { value: "autorizacao", label: "Falta Autorização" },
  { value: "autorizacao_prorr", label: "Falta Autorização de Prorr." },
  { value: "enviado_faturamento", label: "Enviado ao Faturamento" },
  { value: "falta_documentacao", label: "Falta de Documentação" },
  { value: "pendencia_administrativa", label: "Pendência Administrativa" },
  { value: "aguardando_retorno", label: "Aguardando Retorno do Convênio" },
  { value: "erro_faturamento", label: "Erro de Faturamento" },
  { value: "conta_aberta", label: "Conta Aberta" },
  { value: "pendencia_uti", label: "Pendência UTI" },
  { value: "outro", label: "Outro" },
] as const;

// ===== Setores =====
export const SETORES = [
  { value: "faturamento", label: "Faturamento" },
  { value: "recepcao", label: "Recepção" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "centro_cirurgico", label: "Centro Cirúrgico" },
  { value: "medico", label: "Médico" },
  { value: "uti", label: "UTI" },
  { value: "controle_contas", label: "Controle de Contas" },
  { value: "administrativo", label: "Administrativo" },
  { value: "autorizacao", label: "Autorização" },
  { value: "auditoria", label: "Auditoria" },
] as const;

// ===== Médicos =====
export const MEDICOS = [
  { value: "dr_adelvanio_morato", label: "Dr. Adelvanio Morato" },
  { value: "dr_alexandre", label: "Dr. Alexandre Augustus" },
  { value: "dr_augusto_Junior", label: "Dr. Augusto Junior" },
  { value: "dra_christiane_Yumi", label: "Dra. Christiane Yumi" },
  { value: "dr_cleizony", label: "Dra. Cleizony" },
  { value: "dr_delio", label: "Dr. Delio de Souza Bastos" },
  { value: "dr_elida", label: "Dra. Elida Natalie" },
  { value: "dra_fabio_cleber", label: "Dr. Fabio Cleber" },
  { value: "dr_felipe", label: "Dr. Felipe Domingues" },
  { value: "dr_flavio_madeira", label: "Dr. Flavio Madeira" },
  { value: "dr_gustavo_gomes", label: "Dr. Gustavo Gomes" },
  { value: "dr_joao_batista", label: "Dr. João Batista" },
  { value: "dr_joao_gabriel", label: "Dr. João Gabriel" },
  { value: "dr_josafa", label: "Dr. Josafa Pereira" },
  { value: "dr_jose_dias", label: "Dr. José Dias" },
  { value: "dr_jose_Israel", label: "Dr. José Israel" },
  { value: "dr_laurence", label: "Dr. Laurence Amorim" },
  { value: "dr_leandro_mendonca", label: "Dr. Leandro Mendonça" },
  { value: "dr_marcio_gasparine", label: "Dr. Marcio Gasparine" },
  { value: "dr_nadim_chater", label: "Dr. Nadim Chater" },
  { value: "dr_pedro_marcelo", label: "Dr. Pedro Marcelo" },
  { value: "dr_reginaldo", label: "Dr. Reginaldo Manata" },
  { value: "dr_rolando", label: "Dr. Rolando" },
  { value: "dr_tadeu", label: "Dr. Tadeu Gomes" },
  { value: "dr_thais", label: "Dra. Thais Domingues" },
  { value: "dr_thiago_henrique", label: "Dr. Thiago Henrique" },
  { value: "dr_walid", label: "Dr. Walid Chater" },
  { value: "dr_wilson", label: "Dr. Wilson Gomes" },
  { value: "outros", label: "Outros" },
] as const;

// ===== Meses =====
export const MESES = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Março" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

export const MESES_NOMES: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

// ===== Views / Tabs =====
export type AtendimentoView = "todos" | "parados" | "a_faturar" | "protocolados";

export const ATENDIMENTO_VIEWS: { value: AtendimentoView; label: string; description: string }[] = [
  { value: "todos", label: "Todos", description: "Todos os atendimentos de todos os sistemas" },
  { value: "parados", label: "Parados", description: "Atendimentos sem alta ou pendentes de faturamento" },
  { value: "a_faturar", label: "A Faturar", description: "Atendimentos com alta pendentes de envio" },
  { value: "protocolados", label: "Protocolados", description: "Atendimentos com protocolo de entrega (TASY)" },
];

// ===== Origens de Sistema =====
export type OrigemSistema = "tasy" | "tasy_hemolabor" | "warleine" | "easyvision" | "omni" | "gesthor";

export const ORIGEM_LABELS: Record<string, string> = {
  tasy: "TASY",
  tasy_hemolabor: "TASY HEMOLABOR",
  warleine: "WARLEINE",
  easyvision: "EASYVISION",
  omni: "OMNI",
  gesthor: "GESTHOR",
};

export const ORIGEM_COLORS: Record<string, string> = {
  tasy: "bg-teal-600 text-white",
  tasy_hemolabor: "bg-emerald-600 text-white",
  warleine: "bg-indigo-600 text-white",
  easyvision: "bg-amber-600 text-white",
  omni: "bg-purple-600 text-white",
  gesthor: "bg-rose-600 text-white",
};

// ===== Tipos de Atendimento =====
export const TIPO_COLORS: Record<string, { bg: string; icon: string }> = {
  INTERNACAO: { bg: "bg-orange-500", icon: "building" },
  INTERNADO: { bg: "bg-orange-500", icon: "building" },
  EXAME: { bg: "bg-purple-500", icon: "flask" },
  AMBULATORIO: { bg: "bg-blue-500", icon: "stethoscope" },
  PRONTO_SOCORRO: { bg: "bg-red-500", icon: "users" },
};

// ===== Interfaces =====
export interface NotificacaoLinha {
  motivo: string;
  setor: string;
  medico: string;
}

export interface AtendimentoUnificado {
  id: number;
  origemSistema: string;
  origemId: string;
  estabelecimentoId: number;
  numero_atendimento?: string | null;
  codigo_saida?: string | null;
  convenio?: string | null;
  paciente?: string | null;
  caracter_atendimento?: string | null;
  data_entrada?: string | Date | null;
  data_saida?: string | Date | null;
  tipo_atendimento?: string | null;
  descricao_atendimento?: string | null;
  codigo_servico?: string | null;
  codigo_procedimento?: string | null;
  destino_conta?: string | null;
  diasParado: number;
  dataSincronizacao?: string | Date | null;
  atualizadoEm?: Date | null;
  dsCategoria?: string | null;
  dsPlano?: string | null;
  competencia?: string | null;
  referencia?: string | null;
  protTasy?: string | null;
  nomeProtocolo?: string | null;
  protConv?: string | null;
  dtEntrega?: string | Date | null;
  protStatus?: string | null;
  titulo?: string | null;
  dtTitulo?: string | Date | null;
  dataVencimento?: string | Date | null;
  dsSetorEntrada?: string | null;
  dsSetorLeito?: string | null;
  etapaConta?: string | null;
  setorEtapa?: string | null;
  dtEtapa?: string | Date | null;
  userEtapa?: string | null;
  motivoDevolucao?: string | null;
  conta?: string | null;
  autorizacao?: string | null;
  valorConta?: string | number | null;
  matricula?: string | null;
  sexo?: string | null;
  idade?: string | null;
  medicoResp?: string | null;
  crm?: string | null;
  dsMotivoAlta?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  codServico?: string | null;
  centroCusto?: string | null;
  motivo?: string | null;
  // Compat fields from EasyVision/Warleine direct queries
  numatend?: string;
  nomepac?: string;
  nomeplaco?: string;
  datatend?: string;
  datasai?: string | null;
  tipoatendimentodescricao?: string;
  codserv?: string;
  tipoatend?: string;
  [key: string]: any;
}

// ===== Funções Utilitárias =====

export function getMotivoLabel(value: string): string {
  return MOTIVOS.find(m => m.value === value)?.label || value;
}

export function getSetorLabel(value: string): string {
  return SETORES.find(s => s.value === value)?.label || value;
}

export function getMedicoLabel(value: string): string {
  return MEDICOS.find(m => m.value === value)?.label || value;
}

export function getOrigemLabel(origem?: string): string {
  const o = origem?.toLowerCase() || "";
  return ORIGEM_LABELS[o] || origem?.toUpperCase() || "DESCONHECIDO";
}

export function getOrigemColor(origem?: string): string {
  const o = origem?.toLowerCase() || "";
  return ORIGEM_COLORS[o] || "bg-slate-600 text-white";
}

export function getDiasParadoColor(dias: number): string {
  if (dias >= 30) return "bg-red-100 text-red-800 border-red-200";
  if (dias >= 15) return "bg-orange-100 text-orange-800 border-orange-200";
  if (dias >= 7) return "bg-amber-100 text-amber-800 border-amber-200";
  if (dias >= 3) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export function getTipoAtendimentoColor(tipo?: string | null): string {
  const t = tipo?.toUpperCase() || "";
  if (t.includes("INTERNADO") || t.includes("INTERNACAO") || t.includes("INTERNAÇÃO")) return "bg-orange-500 text-white";
  if (t.includes("EXAME")) return "bg-purple-500 text-white";
  if (t.includes("AMBULAT")) return "bg-blue-500 text-white";
  if (t.includes("PRONTO") || t.includes("SOCORRO")) return "bg-red-500 text-white";
  return "bg-slate-500 text-white";
}

export function getTipoAtendimentoCategoria(tipo?: string | null): string {
  const t = tipo?.toUpperCase() || "";
  if (t.includes("INTERNADO") || t.includes("INTERNACAO") || t.includes("INTERNAÇÃO")) return "internacao";
  if (t.includes("EXAME")) return "exame";
  if (t.includes("AMBULAT")) return "ambulatorio";
  if (t.includes("PRONTO") || t.includes("SOCORRO")) return "pronto_socorro";
  return "outro";
}

export function isTasyOrigem(origem?: string | null): boolean {
  const o = origem?.toLowerCase() || "";
  return o === "tasy" || o === "tasy_hemolabor";
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const PAGE_SIZE = 50;
