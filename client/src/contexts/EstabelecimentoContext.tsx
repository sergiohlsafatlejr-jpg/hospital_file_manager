import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

export interface Estabelecimento {
  id: number;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  ativo: string;
}

// Estabelecimento virtual para "Todos"
export const TODOS_ESTABELECIMENTOS: Estabelecimento = {
  id: 0,
  nome: 'Todos os Estabelecimentos',
  cnpj: null,
  endereco: null,
  ativo: 'sim',
};

// Tipo para permissões de módulo
export type ModuloPermissao = 
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
  // Permissões granulares por relatório
  | "relFaturadoRecebido"
  | "relRecebimentoGeral"
  | "relFaturamento"
  | "relAtendimentos"
  | "relCustos"
  | "relNaoRecebidos"
  | "relPrevisaoGlosa"
  | "faturamentoExterno"
  // Módulos Safatle
  | "painelExecutivo"
  | "visaoGeral"
  | "financeiro"
  | "contratos"
  | "propostas"
  | "atendimentosConsolidados"
  | "nfseConsolidado";

interface PermissoesModulo {
  acessoDashboard: "sim" | "nao";
  acessoArquivos: "sim" | "nao";
  acessoComparacoes: "sim" | "nao";
  acessoFaturamento: "sim" | "nao";
  acessoTabelasPreco: "sim" | "nao";
  acessoAnaliseGlosa: "sim" | "nao";
  acessoDicionarioGlosas: "sim" | "nao";
  acessoRecursosGlosa: "sim" | "nao";
  acessoConvenios: "sim" | "nao";
  acessoRegrasNegocio: "sim" | "nao";
  acessoProdutividade: "sim" | "nao";
  acessoEstabelecimentos: "sim" | "nao";
  acessoPermissoes: "sim" | "nao";
  acessoImportacaoTasy: "sim" | "nao";
  acessoContasFaturadas: "sim" | "nao";
  acessoRelatoriosTasy: "sim" | "nao";
  acessoRelatoriosBi: "sim" | "nao";
  acessoConciliacaoContasPagas: "sim" | "nao";
  acessoRecebimentosXml: "sim" | "nao";
  acessoRecebimentosExcel: "sim" | "nao";
  acessoDemonstrativo: "sim" | "nao";
  acessoContaConvenio: "sim" | "nao";
  acessoRecursos: "sim" | "nao";
  acessoAtendimentos: "sim" | "nao";
  acessoAtendimentosFaturar: "sim" | "nao";
  // Permissões granulares por relatório
  acessoRelFaturadoRecebido: "sim" | "nao";
  acessoRelRecebimentoGeral: "sim" | "nao";
  acessoRelFaturamento: "sim" | "nao";
  acessoRelAtendimentos: "sim" | "nao";
  acessoRelCustos: "sim" | "nao";
  acessoRelNaoRecebidos: "sim" | "nao";
  acessoRelPrevisaoGlosa: "sim" | "nao";
  acessoFaturamentoExterno: "sim" | "nao";
  // Módulos Safatle
  acessoPainelExecutivo: "sim" | "nao";
  acessoVisaoGeral: "sim" | "nao";
  acessoFinanceiro: "sim" | "nao";
  acessoContratos: "sim" | "nao";
  acessoPropostas: "sim" | "nao";
  acessoAtendimentosConsolidados: "sim" | "nao";
  acessoNfseConsolidado: "sim" | "nao";
  grupoServico: string | null;
}

interface EstabelecimentoContextType {
  estabelecimentos: Estabelecimento[];
  estabelecimentoAtual: Estabelecimento | null;
  setEstabelecimentoAtual: (estabelecimento: Estabelecimento | null) => void;
  isLoading: boolean;
  selecionado: boolean;
  visualizandoTodos: boolean;
  isGestor: boolean;
  // Novas propriedades para permissões
  permissoesModulo: PermissoesModulo | null;
  temAcessoModulo: (modulo: ModuloPermissao) => boolean;
  temAcessoModuloNoEstabelecimento: (modulo: ModuloPermissao, estabelecimentoId: number) => boolean;
  grupoServico: string | null;
}

const EstabelecimentoContext = createContext<EstabelecimentoContextType | undefined>(undefined);

const STORAGE_KEY = 'hospital_estabelecimento_id';

// Mapeamento de módulo para campo de permissão
const moduloParaCampo: Record<ModuloPermissao, keyof PermissoesModulo> = {
  dashboard: "acessoDashboard",
  arquivos: "acessoArquivos",
  comparacoes: "acessoComparacoes",
  faturamento: "acessoFaturamento",
  tabelasPreco: "acessoTabelasPreco",
  analiseGlosa: "acessoAnaliseGlosa",
  dicionarioGlosas: "acessoDicionarioGlosas",
  recursosGlosa: "acessoRecursosGlosa",
  convenios: "acessoConvenios",
  regrasNegocio: "acessoRegrasNegocio",
  produtividade: "acessoProdutividade",
  estabelecimentos: "acessoEstabelecimentos",
  permissoes: "acessoPermissoes",
  importacaoTasy: "acessoImportacaoTasy",
  contasFaturadas: "acessoContasFaturadas",
  relatoriosTasy: "acessoRelatoriosTasy",
  relatoriosBi: "acessoRelatoriosBi",
  conciliacaoContasPagas: "acessoConciliacaoContasPagas",
  recebimentosXml: "acessoRecebimentosXml",
  recebimentosExcel: "acessoRecebimentosExcel",
  demonstrativo: "acessoDemonstrativo",
  contaConvenio: "acessoContaConvenio",
  recursos: "acessoRecursos",
  atendimentos: "acessoAtendimentos",
  atendimentosFaturar: "acessoAtendimentosFaturar",
  // Permissões granulares por relatório
  relFaturadoRecebido: "acessoRelFaturadoRecebido",
  relRecebimentoGeral: "acessoRelRecebimentoGeral",
  relFaturamento: "acessoRelFaturamento",
  relAtendimentos: "acessoRelAtendimentos",
  relCustos: "acessoRelCustos",
  relNaoRecebidos: "acessoRelNaoRecebidos",
  relPrevisaoGlosa: "acessoRelPrevisaoGlosa",
  faturamentoExterno: "acessoFaturamentoExterno",
  // Módulos Safatle
  painelExecutivo: "acessoPainelExecutivo",
  visaoGeral: "acessoVisaoGeral",
  financeiro: "acessoFinanceiro",
  contratos: "acessoContratos",
  propostas: "acessoPropostas",
  atendimentosConsolidados: "acessoAtendimentosConsolidados",
  nfseConsolidado: "acessoNfseConsolidado",
};

export function EstabelecimentoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [estabelecimentoAtual, setEstabelecimentoAtualState] = useState<Estabelecimento | null>(null);
  const [selecionado, setSelecionado] = useState(false);

  // Buscar estabelecimentos permitidos para o usuário
  const { data: estabelecimentosPermitidos = [], isLoading: loadingPermitidos } = 
    trpc.permissoes.estabelecimentosPermitidos.useQuery(undefined, {
      enabled: !!user,
    });

  // Verificar se é gestor
  const { data: isGestor = false, isLoading: loadingGestor } = 
    trpc.permissoes.verificarGestor.useQuery(undefined, {
      enabled: !!user,
    });

  // Buscar permissões do usuário
  const { data: minhasPermissoes = [], isLoading: loadingPermissoes } = 
    trpc.permissoes.minhasPermissoes.useQuery(undefined, {
      enabled: !!user,
    });

  // Usar estabelecimentos permitidos ou todos (fallback)
  const estabelecimentos = estabelecimentosPermitidos;
  const isLoading = loadingPermitidos || loadingGestor || loadingPermissoes;

  // Obter permissões do estabelecimento atual
  const permissoesModulo: PermissoesModulo | null = (() => {
    if (!estabelecimentoAtual || estabelecimentoAtual.id === 0) {
      // Se visualizando todos ou nenhum selecionado, usar permissões máximas se for admin/gestor
      if (user?.role === "admin" || isGestor) {
        return {
          acessoDashboard: "sim",
          acessoArquivos: "sim",
          acessoComparacoes: "sim",
          acessoFaturamento: "sim",
          acessoTabelasPreco: "sim",
          acessoAnaliseGlosa: "sim",
          acessoDicionarioGlosas: "sim",
          acessoRecursosGlosa: "sim",
          acessoConvenios: "sim",
          acessoRegrasNegocio: "sim",
          acessoProdutividade: "sim",
          acessoEstabelecimentos: "sim",
          acessoPermissoes: "sim",
          acessoImportacaoTasy: "sim",
          acessoContasFaturadas: "sim",
          acessoRelatoriosTasy: "sim",
          acessoRelatoriosBi: "sim",
          acessoConciliacaoContasPagas: "sim",
          acessoRecebimentosXml: "sim",
          acessoRecebimentosExcel: "sim",
          acessoDemonstrativo: "sim",
          acessoContaConvenio: "sim",
          acessoRecursos: "sim",          acessoAtendimentos: "sim",
          acessoAtendimentosFaturar: "sim",
          acessoRelFaturadoRecebido: "sim",
          acessoRelRecebimentoGeral: "sim",
          acessoRelFaturamento: "sim",
          acessoRelAtendimentos: "sim",
          acessoRelCustos: "sim",
          acessoRelNaoRecebidos: "sim",
          acessoRelPrevisaoGlosa: "sim",
          acessoFaturamentoExterno: "sim",
          // Módulos Safatle
          acessoPainelExecutivo: "sim",
          acessoVisaoGeral: "sim",
          acessoFinanceiro: "sim",
          acessoContratos: "sim",
          acessoPropostas: "sim",
          acessoAtendimentosConsolidados: "sim",
          acessoNfseConsolidado: "sim",
          grupoServico: "administrador",
        };
      }

      return null;
    }

    // Buscar permissão específica do estabelecimento
    const permissao = minhasPermissoes.find(
      (p: any) => p.estabelecimentoId === estabelecimentoAtual.id
    );

    if (!permissao) {
      // Se não tem permissão específica mas é admin, dar acesso total
      if (user?.role === "admin") {
        return {
          acessoDashboard: "sim",
          acessoArquivos: "sim",
          acessoComparacoes: "sim",
          acessoFaturamento: "sim",
          acessoTabelasPreco: "sim",
          acessoAnaliseGlosa: "sim",
          acessoDicionarioGlosas: "sim",
          acessoRecursosGlosa: "sim",
          acessoConvenios: "sim",
          acessoRegrasNegocio: "sim",
          acessoProdutividade: "sim",
          acessoEstabelecimentos: "sim",
          acessoPermissoes: "sim",
          acessoImportacaoTasy: "sim",
          acessoContasFaturadas: "sim",
          acessoRelatoriosTasy: "sim",
          acessoRelatoriosBi: "sim",
          acessoConciliacaoContasPagas: "sim",
          acessoRecebimentosXml: "sim",
          acessoRecebimentosExcel: "sim",
          acessoDemonstrativo: "sim",
          acessoContaConvenio: "sim",
          acessoRecursos: "sim",
          acessoAtendimentos: "sim",
          acessoAtendimentosFaturar: "sim",
          acessoRelFaturadoRecebido: "sim",
          acessoRelRecebimentoGeral: "sim",
          acessoRelFaturamento: "sim",
          acessoRelAtendimentos: "sim",
          acessoRelCustos: "sim",
          acessoRelNaoRecebidos: "sim",
          acessoRelPrevisaoGlosa: "sim",
          acessoFaturamentoExterno: "sim",
          // Módulos Safatle
          acessoPainelExecutivo: "sim",
          acessoVisaoGeral: "sim",
          acessoFinanceiro: "sim",
          acessoContratos: "sim",
          acessoPropostas: "sim",
          acessoAtendimentosConsolidados: "sim",
          acessoNfseConsolidado: "sim",
          grupoServico: "administrador",
        };
      }
      return null;
    }

    return {
      acessoDashboard: permissao.acessoDashboard || "nao",
      acessoArquivos: permissao.acessoArquivos || "nao",
      acessoComparacoes: permissao.acessoComparacoes || "nao",
      acessoFaturamento: permissao.acessoFaturamento || "nao",
      acessoTabelasPreco: permissao.acessoTabelasPreco || "nao",
      acessoAnaliseGlosa: permissao.acessoAnaliseGlosa || "nao",
      acessoDicionarioGlosas: permissao.acessoDicionarioGlosas || "nao",
      acessoRecursosGlosa: permissao.acessoRecursosGlosa || "nao",
      acessoConvenios: permissao.acessoConvenios || "nao",
      acessoRegrasNegocio: permissao.acessoRegrasNegocio || "nao",
      acessoProdutividade: permissao.acessoProdutividade || "nao",
      acessoEstabelecimentos: permissao.acessoEstabelecimentos || "nao",
      acessoPermissoes: permissao.acessoPermissoes || "nao",
      acessoImportacaoTasy: permissao.acessoImportacaoTasy || "nao",
      acessoContasFaturadas: permissao.acessoContasFaturadas || "nao",
      acessoRelatoriosTasy: permissao.acessoRelatoriosTasy || "nao",
      acessoRelatoriosBi: permissao.acessoRelatoriosBi || "nao",
      acessoConciliacaoContasPagas: permissao.acessoConciliacaoContasPagas || "nao",
      acessoRecebimentosXml: permissao.acessoRecebimentosXml || "nao",
      acessoRecebimentosExcel: permissao.acessoRecebimentosExcel || "nao",
      acessoDemonstrativo: permissao.acessoDemonstrativo || "nao",
      acessoContaConvenio: permissao.acessoContaConvenio || "nao",
      acessoRecursos: permissao.acessoRecursos || "nao",
      acessoAtendimentos: (permissao as any).acessoAtendimentos || "nao",
      acessoAtendimentosFaturar: (permissao as any).acessoAtendimentosFaturar || "nao",
      acessoRelFaturadoRecebido: (permissao as any).acessoRelFaturadoRecebido || "nao",
      acessoRelRecebimentoGeral: (permissao as any).acessoRelRecebimentoGeral || "nao",
      acessoRelFaturamento: (permissao as any).acessoRelFaturamento || "nao",
      acessoRelAtendimentos: (permissao as any).acessoRelAtendimentos || "nao",
      acessoRelCustos: (permissao as any).acessoRelCustos || "nao",
      acessoRelNaoRecebidos: (permissao as any).acessoRelNaoRecebidos || "nao",
      acessoRelPrevisaoGlosa: (permissao as any).acessoRelPrevisaoGlosa || "nao",
      acessoFaturamentoExterno: (permissao as any).acessoFaturamentoExterno || "sim",
      // Módulos Safatle
      acessoPainelExecutivo: (permissao as any).acessoPainelExecutivo || "nao",
      acessoVisaoGeral: (permissao as any).acessoVisaoGeral || "nao",
      acessoFinanceiro: (permissao as any).acessoFinanceiro || "nao",
      acessoContratos: (permissao as any).acessoContratos || "nao",
      acessoPropostas: (permissao as any).acessoPropostas || "nao",
      acessoAtendimentosConsolidados: (permissao as any).acessoAtendimentosConsolidados || "nao",
      acessoNfseConsolidado: (permissao as any).acessoNfseConsolidado || "nao",
      grupoServico: permissao.grupoServico || null,
    };
  })();

  // Campos de relatórios BI individuais
  const camposRelatoriosBiIndividuais: (keyof PermissoesModulo)[] = [
    "acessoRelFaturadoRecebido",
    "acessoRelRecebimentoGeral",
    "acessoRelFaturamento",
    "acessoRelAtendimentos",
    "acessoRelCustos",
    "acessoRelNaoRecebidos",
    "acessoRelPrevisaoGlosa",
  ];

  // Verificar a permissão de um módulo em um estabelecimento físico.
  // Esta função não altera o estabelecimento selecionado e é usada para montar
  // com segurança as telas agregadas de seleção.
  const temAcessoModuloNoEstabelecimento = (
    modulo: ModuloPermissao,
    estabelecimentoId: number
  ): boolean => {
    if (user?.role === "admin" || isGestor) return true;

    const permissao = minhasPermissoes.find(
      (item: any) => item.estabelecimentoId === estabelecimentoId
    ) as any;
    if (!permissao) return false;
    if (permissao.grupoServico === "administrador") return true;

    if (modulo === "relatoriosBi") {
      if (permissao.acessoRelatoriosBi === "sim") return true;
      return camposRelatoriosBiIndividuais.some(
        campo => permissao[campo] === "sim"
      );
    }

    const campo = moduloParaCampo[modulo];
    // Compatibilidade com o default histórico deste módulo.
    if (modulo === "faturamentoExterno") {
      return permissao[campo] !== "nao";
    }
    return permissao[campo] === "sim";
  };

  // No modo "Todos", liberar especificamente a entrada da Conciliação Cruzada
  // quando houver acesso em ao menos um estabelecimento. Os demais módulos
  // mantêm o comportamento anterior até que suas telas sejam auditadas para não
  // consultar o backend com estabelecimentoId = 0.
  const temAcessoModulo = (modulo: ModuloPermissao): boolean => {
    if (user?.role === "admin" || isGestor) return true;
    if (!estabelecimentoAtual) return false;

    if (estabelecimentoAtual.id === 0) {
      if (modulo !== "conciliacaoContasPagas") return false;
      return estabelecimentos.some((estabelecimento: Estabelecimento) =>
        temAcessoModuloNoEstabelecimento(modulo, estabelecimento.id)
      );
    }

    return temAcessoModuloNoEstabelecimento(modulo, estabelecimentoAtual.id);
  };

  // Carregar estabelecimento salvo do localStorage
  useEffect(() => {
    if (!isLoading && estabelecimentos.length > 0) {
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        if (savedId === '0') {
          // Visualizando todos
          setEstabelecimentoAtualState(TODOS_ESTABELECIMENTOS);
          setSelecionado(true);
        } else {
          const found = estabelecimentos.find((e: Estabelecimento) => e.id === parseInt(savedId));
          if (found) {
            setEstabelecimentoAtualState(found);
            setSelecionado(true);
          }
        }
      }
    }
  }, [estabelecimentos, isLoading]);

  const setEstabelecimentoAtual = (estabelecimento: Estabelecimento | null) => {
    setEstabelecimentoAtualState(estabelecimento);
    if (estabelecimento) {
      localStorage.setItem(STORAGE_KEY, estabelecimento.id.toString());
      setSelecionado(true);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setSelecionado(false);
    }
  };

  const visualizandoTodos = estabelecimentoAtual?.id === 0;
  const grupoServico = permissoesModulo?.grupoServico || null;

  return (
    <EstabelecimentoContext.Provider
      value={{
        estabelecimentos,
        estabelecimentoAtual,
        setEstabelecimentoAtual,
        isLoading,
        selecionado,
        visualizandoTodos,
        isGestor,
        permissoesModulo,
        temAcessoModulo,
        temAcessoModuloNoEstabelecimento,
        grupoServico,
      }}
    >
      {children}
    </EstabelecimentoContext.Provider>
  );
}

export function useEstabelecimento() {
  const context = useContext(EstabelecimentoContext);
  if (context === undefined) {
    throw new Error('useEstabelecimento must be used within an EstabelecimentoProvider');
  }
  return context;
}
