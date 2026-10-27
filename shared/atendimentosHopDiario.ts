import { z } from 'zod';

export const HOP_DIARIO_HORARIO = '10:00' as const;
export const HOP_DIARIO_FUSO = 'America/Sao_Paulo' as const;
export const HOP_DIARIO_CRON = '0 0 13 * * *' as const;
export const HOP_DIARIO_UNIDADES = {
  1260036: { nome: 'Hospital Urológico', tabela: 'stagion_atendimentos_parados_urologico' },
  2550002: { nome: 'IAD', tabela: 'stagion_atendimentos_parados_iad' },
} as const;

export const hopDiarioEscopo = z.object({ estabelecimentoId: z.number().int().refine(v => v === 1260036 || v === 2550002, 'Unidade não habilitada para este fluxo.') }).strict();
export const hopDiarioConfirmarCarga = hopDiarioEscopo.extend({ confirmarCargaCompleta: z.literal(true), confirmarHopParado: z.literal(true) });
export const hopDiarioConfirmacao = hopDiarioEscopo.extend({ tokenPrevia: z.string().min(1).max(4096), confirmarEspelhamento: z.literal(true) });
export const hopDiarioProdutor = z.object({ loteRef: z.string().uuid(), totalEsperado: z.number().int().min(1).max(100000).optional() }).strict();
export type HopDiarioEscopo = z.infer<typeof hopDiarioEscopo>;
export type HopDiarioContagens = { totalFonte: number; ativosAntes: number; novos: number; atualizados: number; reativados: number; inalterados: number; inativados: number; ativosDepois: number };
export type HopDiarioEstado = 'nao_configurado' | 'pausado' | 'preparando' | 'ativo' | 'erro' | 'incerto';
export type HopDiarioLoteResumo = { id: number; estado: 'carregando' | 'completo' | 'publicado' | 'falhou' | 'incerto'; totalEsperado: number | null; concluidoEm: string | null };
export type HopDiarioExecucaoResumo = { id: number; estado: string; modo: string; iniciadoEm: string; terminadoEm: string | null; codigo: string | null; contagens: HopDiarioContagens | null };
export type HopDiarioResumo = {
  estabelecimentoId: number; unidade: string; origem: string; destino: 'atendimentos_unificados'; horario: typeof HOP_DIARIO_HORARIO; fuso: typeof HOP_DIARIO_FUSO;
  configuracaoPendente: boolean; estado: HopDiarioEstado; podeGerenciar: boolean; credencialHopConfigurada: boolean;
  ultimaExecucao: string | null; proximaExecucao: string | null; ultimoLote: HopDiarioLoteResumo | null; execucoes: HopDiarioExecucaoResumo[];
};
export type HopDiarioPrevia = { tokenPrevia: string; expiraEm: string; loteId: number; contagens: HopDiarioContagens };
