import { logger } from "./logger";
import { logAudit } from "./audit";

/**
 * Sistema Consolidado de Permissões (RBAC)
 * Unifica grupoServico com permissões específicas em um único sistema
 */

export type GrupoServico = 
  | "administrador"
  | "faturista"
  | "recurso_glosa"
  | "gestor"
  | "visualizador"
  | "usuario_tasy";

export type Modulo = 
  | "dashboard"
  | "arquivos"
  | "comparacoes"
  | "faturamento"
  | "tabelasPreco"
  | "analiseGlosa"
  | "dicionarioGlosas"
  | "recursosGlosa"
  | "convenios"
  | "regrasNegocio"
  | "produtividade"
  | "estabelecimentos"
  | "permissoes"
  | "importacaoTasy"
  | "contasFaturadas"
  | "relatoriosTasy"
  | "relatoriosBi"
  | "conciliacaoContasPagas"
  | "recebimentosXml"
  | "recebimentosExcel"
  | "demonstrativo"
  | "contaConvenio"
  | "recursos"
  | "atendimentos"
  | "atendimentosFaturar"
  | "auditoria";

export type Acao = "visualizar" | "editar" | "excluir" | "gerenciar";

/**
 * Mapeamento de Grupos de Serviço para Módulos e Ações
 * Define quais módulos cada grupo pode acessar e quais ações pode realizar
 */
export const GRUPO_PERMISSOES: Record<GrupoServico, Record<Modulo, Acao[]>> = {
  administrador: {
    dashboard: ["visualizar", "editar", "excluir", "gerenciar"],
    arquivos: ["visualizar", "editar", "excluir", "gerenciar"],
    comparacoes: ["visualizar", "editar", "excluir", "gerenciar"],
    faturamento: ["visualizar", "editar", "excluir", "gerenciar"],
    tabelasPreco: ["visualizar", "editar", "excluir", "gerenciar"],
    analiseGlosa: ["visualizar", "editar", "excluir", "gerenciar"],
    dicionarioGlosas: ["visualizar", "editar", "excluir", "gerenciar"],
    recursosGlosa: ["visualizar", "editar", "excluir", "gerenciar"],
    convenios: ["visualizar", "editar", "excluir", "gerenciar"],
    regrasNegocio: ["visualizar", "editar", "excluir", "gerenciar"],
    produtividade: ["visualizar", "editar", "excluir", "gerenciar"],
    estabelecimentos: ["visualizar", "editar", "excluir", "gerenciar"],
    permissoes: ["visualizar", "editar", "excluir", "gerenciar"],
    importacaoTasy: ["visualizar", "editar", "excluir", "gerenciar"],
    contasFaturadas: ["visualizar", "editar", "excluir", "gerenciar"],
    relatoriosTasy: ["visualizar", "editar", "excluir", "gerenciar"],
    relatoriosBi: ["visualizar", "editar", "excluir", "gerenciar"],
    conciliacaoContasPagas: ["visualizar", "editar", "excluir", "gerenciar"],
    recebimentosXml: ["visualizar", "editar", "excluir", "gerenciar"],
    recebimentosExcel: ["visualizar", "editar", "excluir", "gerenciar"],
    demonstrativo: ["visualizar", "editar", "excluir", "gerenciar"],
    contaConvenio: ["visualizar", "editar", "excluir", "gerenciar"],
    recursos: ["visualizar", "editar", "excluir", "gerenciar"],
    atendimentos: ["visualizar", "editar", "excluir", "gerenciar"],
    atendimentosFaturar: ["visualizar", "editar", "excluir", "gerenciar"],
    auditoria: ["visualizar", "editar", "excluir", "gerenciar"],
  },
  faturista: {
    dashboard: ["visualizar"],
    arquivos: ["visualizar", "editar"],
    comparacoes: ["visualizar", "editar"],
    faturamento: ["visualizar", "editar"],
    tabelasPreco: ["visualizar"],
    analiseGlosa: [],
    dicionarioGlosas: [],
    recursosGlosa: [],
    convenios: ["visualizar"],
    regrasNegocio: [],
    produtividade: [],
    estabelecimentos: [],
    permissoes: [],
    importacaoTasy: [],
    contasFaturadas: [],
    relatoriosTasy: [],
    relatoriosBi: [],
    conciliacaoContasPagas: [],
    recebimentosXml: [],
    recebimentosExcel: [],
    demonstrativo: [],
    contaConvenio: [],
    recursos: [],
    atendimentos: ["visualizar"],
    atendimentosFaturar: ["visualizar", "editar"],
    auditoria: [],
  },
  recurso_glosa: {
    dashboard: ["visualizar"],
    arquivos: [],
    comparacoes: [],
    faturamento: [],
    tabelasPreco: [],
    analiseGlosa: ["visualizar", "editar"],
    dicionarioGlosas: ["visualizar"],
    recursosGlosa: ["visualizar", "editar"],
    convenios: ["visualizar"],
    regrasNegocio: [],
    produtividade: [],
    estabelecimentos: [],
    permissoes: [],
    importacaoTasy: [],
    contasFaturadas: [],
    relatoriosTasy: [],
    relatoriosBi: [],
    conciliacaoContasPagas: [],
    recebimentosXml: [],
    recebimentosExcel: [],
    demonstrativo: [],
    contaConvenio: [],
    recursos: [],
    atendimentos: [],
    atendimentosFaturar: [],
    auditoria: [],
  },
  gestor: {
    dashboard: ["visualizar"],
    arquivos: ["visualizar"],
    comparacoes: ["visualizar"],
    faturamento: ["visualizar"],
    tabelasPreco: ["visualizar"],
    analiseGlosa: ["visualizar"],
    dicionarioGlosas: ["visualizar"],
    recursosGlosa: ["visualizar"],
    convenios: ["visualizar"],
    regrasNegocio: ["visualizar"],
    produtividade: ["visualizar", "editar"],
    estabelecimentos: ["visualizar"],
    permissoes: [],
    importacaoTasy: ["visualizar"],
    contasFaturadas: ["visualizar"],
    relatoriosTasy: ["visualizar"],
    relatoriosBi: ["visualizar"],
    conciliacaoContasPagas: ["visualizar"],
    recebimentosXml: ["visualizar"],
    recebimentosExcel: ["visualizar"],
    demonstrativo: ["visualizar"],
    contaConvenio: ["visualizar"],
    recursos: ["visualizar"],
    atendimentos: ["visualizar"],
    atendimentosFaturar: ["visualizar"],
    auditoria: ["visualizar"],
  },
  visualizador: {
    dashboard: ["visualizar"],
    arquivos: ["visualizar"],
    comparacoes: ["visualizar"],
    faturamento: ["visualizar"],
    tabelasPreco: ["visualizar"],
    analiseGlosa: ["visualizar"],
    dicionarioGlosas: ["visualizar"],
    recursosGlosa: ["visualizar"],
    convenios: ["visualizar"],
    regrasNegocio: [],
    produtividade: ["visualizar"],
    estabelecimentos: [],
    permissoes: [],
    importacaoTasy: [],
    contasFaturadas: ["visualizar"],
    relatoriosTasy: ["visualizar"],
    relatoriosBi: ["visualizar"],
    conciliacaoContasPagas: ["visualizar"],
    recebimentosXml: ["visualizar"],
    recebimentosExcel: ["visualizar"],
    demonstrativo: ["visualizar"],
    contaConvenio: ["visualizar"],
    recursos: ["visualizar"],
    atendimentos: ["visualizar"],
    atendimentosFaturar: [],
    auditoria: [],
  },
  usuario_tasy: {
    dashboard: ["visualizar"],
    arquivos: [],
    comparacoes: [],
    faturamento: [],
    tabelasPreco: [],
    analiseGlosa: [],
    dicionarioGlosas: [],
    recursosGlosa: [],
    convenios: [],
    regrasNegocio: [],
    produtividade: [],
    estabelecimentos: [],
    permissoes: [],
    importacaoTasy: ["visualizar", "editar"],
    contasFaturadas: ["visualizar"],
    relatoriosTasy: ["visualizar"],
    relatoriosBi: ["visualizar"],
    conciliacaoContasPagas: ["visualizar"],
    recebimentosXml: [],
    recebimentosExcel: [],
    demonstrativo: [],
    contaConvenio: [],
    recursos: [],
    atendimentos: [],
    atendimentosFaturar: [],
    auditoria: [],
  },
};

/**
 * Verifica se um usuário tem permissão para acessar um módulo com uma ação específica
 */
export function temPermissao(
  grupoServico: GrupoServico,
  modulo: Modulo,
  acao: Acao
): boolean {
  const permissoes = GRUPO_PERMISSOES[grupoServico];
  if (!permissoes) return false;

  const moduloPermissoes = permissoes[modulo];
  if (!moduloPermissoes) return false;

  return moduloPermissoes.includes(acao);
}

/**
 * Obtém todas as permissões de um grupo
 */
export function obterPermissoes(grupoServico: GrupoServico): Record<Modulo, Acao[]> {
  return GRUPO_PERMISSOES[grupoServico] || {};
}

/**
 * Obtém todos os módulos acessíveis por um grupo
 */
export function obterModulosAcessiveis(grupoServico: GrupoServico): Modulo[] {
  const permissoes = GRUPO_PERMISSOES[grupoServico];
  if (!permissoes) return [];

  return Object.entries(permissoes)
    .filter(([_, acoes]) => acoes.length > 0)
    .map(([modulo]) => modulo as Modulo);
}

/**
 * Registra mudança de permissões na auditoria
 */
export async function registrarMudancaPermissao(
  usuarioId: number,
  usuarioNome: string | undefined,
  usuarioAlteradoId: number,
  grupoAnterior: GrupoServico,
  grupoNovo: GrupoServico,
  estabelecimentoId: number
): Promise<void> {
  try {
    await logAudit({
      tabela: "permissoesEstabelecimento",
      registroId: usuarioAlteradoId,
      tipoAcao: "UPDATE",
      usuarioId,
      usuarioNome,
      valoresNovos: {
        grupoServico: grupoNovo,
        modulosAcessiveis: obterModulosAcessiveis(grupoNovo),
      },
      valoresAntigos: {
        grupoServico: grupoAnterior,
        modulosAcessiveis: obterModulosAcessiveis(grupoAnterior),
      },
      estabelecimentoId,
    });

    logger.info({
      tipo: "permissao_alterada",
      usuarioId,
      usuarioAlteradoId,
      grupoAnterior,
      grupoNovo,
      estabelecimentoId,
    });
  } catch (error) {
    logger.error({
      tipo: "permissao_auditoria_erro",
      usuarioId,
      usuarioAlteradoId,
      erro: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Valida se um grupo é válido
 */
export function ehGrupoValido(grupo: string): grupo is GrupoServico {
  return Object.keys(GRUPO_PERMISSOES).includes(grupo);
}

/**
 * Obtém descrição amigável de um grupo
 */
export function obterDescricaoGrupo(grupoServico: GrupoServico): string {
  const descricoes: Record<GrupoServico, string> = {
    administrador: "Administrador - Acesso total a todas as funcionalidades",
    faturista: "Faturista - Acesso a faturamento, comparações e arquivos",
    recurso_glosa: "Especialista em Glosa - Acesso a análise e recursos de glosa",
    gestor: "Gestor - Acesso a relatórios e produtividade",
    visualizador: "Visualizador - Acesso apenas para visualização (somente leitura)",
    usuario_tasy: "Usuário Tasy - Acesso a funcionalidades Tasy",
  };

  return descricoes[grupoServico];
}
