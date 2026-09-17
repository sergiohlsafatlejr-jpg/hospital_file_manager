import { useMemo, useState } from "react";
import {
  Activity, BarChart3, BookOpen, Briefcase, Building2, CheckCheck, DollarSign,
  FileText, FolderOpen, GitCompare, Landmark, LayoutDashboard, Package, Receipt,
  Search, Settings, Shield, Stethoscope, Users, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { ModulePermissionKey, PermissionValue } from "@shared/permissions";

export type PermissionModule = {
  key: ModulePermissionKey;
  label: string;
  description: string;
  icon: typeof Shield;
};

type PermissionSection = {
  id: string;
  title: string;
  description: string;
  accent: string;
  modules: PermissionModule[];
};

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: "geral", title: "Operação geral", description: "Cadastros e rotinas principais", accent: "border-slate-200",
    modules: [
      { key: "acessoDashboard", label: "Dashboard", description: "Indicadores iniciais da unidade", icon: LayoutDashboard },
      { key: "acessoArquivos", label: "Arquivos", description: "Uploads e arquivos processados", icon: FolderOpen },
      { key: "acessoComparacoes", label: "Comparações", description: "Comparação de arquivos e contas", icon: GitCompare },
      { key: "acessoFaturamento", label: "Faturamento", description: "Remessas, digitação e NFS-e", icon: DollarSign },
      { key: "acessoTabelasPreco", label: "Tabelas de preço", description: "Importação e manutenção de tabelas", icon: FileText },
      { key: "acessoConvenios", label: "Convênios", description: "Cadastro de convênios e prestadores", icon: Building2 },
      { key: "acessoRegrasNegocio", label: "Regras de negócio", description: "Regras operacionais e validações", icon: Settings },
      { key: "acessoProdutividade", label: "Produtividade", description: "Indicadores de produção", icon: Activity },
      { key: "acessoEstabelecimentos", label: "Estabelecimentos", description: "Cadastro das unidades", icon: Building2 },
      { key: "acessoPermissoes", label: "Gestão de permissões", description: "Usuários, perfis e auditoria", icon: Shield },
    ],
  },
  {
    id: "glosas", title: "Glosas e recursos", description: "Análise, classificação e recurso", accent: "border-amber-200",
    modules: [
      { key: "acessoAnaliseGlosa", label: "Análise de glosa", description: "Classificar e tratar glosas", icon: Activity },
      { key: "acessoDicionarioGlosas", label: "Dicionário de glosas", description: "Códigos e orientações", icon: BookOpen },
      { key: "acessoRecursosGlosa", label: "Recursos de glosa", description: "Análise, lotes e acompanhamento", icon: Briefcase },
      { key: "acessoRecursos", label: "Recursos analisados", description: "Itens recursados e aceitos", icon: FileText },
    ],
  },
  {
    id: "recebimento", title: "Recebimento e conciliação", description: "Retornos, demonstrativos e contas", accent: "border-blue-200",
    modules: [
      { key: "acessoRecebimentosXml", label: "Recebimentos XML", description: "Importar retornos XML", icon: FileText },
      { key: "acessoRecebimentosExcel", label: "Recebimentos Excel", description: "Importar demonstrativos", icon: FileText },
      { key: "acessoDemonstrativo", label: "Demonstrativo", description: "Consultar e tratar demonstrativos", icon: Receipt },
      { key: "acessoContaConvenio", label: "Conta Convênio", description: "Itens faturados por convênio", icon: DollarSign },
      { key: "acessoConciliacaoContasPagas", label: "Conciliação Cruzada", description: "Cruzar faturamento e retorno", icon: GitCompare },
    ],
  },
  {
    id: "tasy", title: "TASY", description: "Integrações e relatórios TASY", accent: "border-teal-200",
    modules: [
      { key: "acessoImportacaoTasy", label: "Importação TASY", description: "Importar bases TASY", icon: FolderOpen },
      { key: "acessoContasFaturadas", label: "Contas faturadas TASY", description: "Consultar contas TASY", icon: FileText },
      { key: "acessoRelatoriosTasy", label: "Relatórios TASY", description: "Acessar relatórios TASY ativos", icon: BarChart3 },
    ],
  },
  {
    id: "atendimentos", title: "Atendimentos", description: "Produção assistencial e pendências", accent: "border-purple-200",
    modules: [
      { key: "acessoAtendimentos", label: "Atendimentos", description: "Visão unificada e protocolos", icon: Users },
      { key: "acessoAtendimentosFaturar", label: "Atendimentos a faturar", description: "Pendências de faturamento", icon: Stethoscope },
    ],
  },
  {
    id: "bi", title: "Relatórios BI", description: "Controle individual dos relatórios ativos", accent: "border-orange-200",
    modules: [
      { key: "acessoRelFaturadoRecebido", label: "Faturado x Recebido", description: "Relatório financeiro unificado", icon: BarChart3 },
      { key: "acessoRelPrevisaoPagamentosImec", label: "Previsão Pagamentos Imec", description: "Previsão exclusiva do IMEC", icon: Receipt },
      { key: "acessoRelLaboratorio", label: "Relatório de Laboratório", description: "Produção e recebimento laboratorial", icon: FileText },
      { key: "acessoRelUltrassom", label: "Relatório de Ultrassom", description: "Produção e recebimento de ultrassom", icon: Activity },
      { key: "acessoRelVisitaHospitalar", label: "Relatório de Visita Hospitalar", description: "Visitas médicas e profissionais", icon: Stethoscope },
      { key: "acessoRelVisitasFaturadasXml", label: "Visitas Faturadas (XML)", description: "Visitas identificadas nos XMLs faturados", icon: FileText },
      { key: "acessoRelOxUti", label: "Relatório OX UTI", description: "Recebimentos e glosas da OX UTI", icon: Activity },
      { key: "acessoRelOxUtiFaturado", label: "OX UTI - Faturado (XML)", description: "Faturamento XML da OX UTI", icon: FileText },
      { key: "acessoRelResumoPacienteOxUti", label: "Resumo Paciente UTI", description: "Resumo consolidado por paciente", icon: Users },
      { key: "acessoRelFisioterapia", label: "Relatório de Fisioterapia", description: "Produção e recebimento de fisioterapia", icon: Activity },
      { key: "acessoRelComparativoMesAMes", label: "Comparativo Mês a Mês", description: "Evolução comparativa mensal", icon: BarChart3 },
      { key: "acessoRelFaturamento", label: "Relatório de Faturamento", description: "Faturamento detalhado", icon: FileText },
      { key: "acessoFaturamentoExterno", label: "Faturamento Externo", description: "Cadastro e importação de valores externos", icon: Receipt },
      { key: "acessoRelatoriosGlosasBi", label: "BI de Glosas", description: "Indicadores interativos de glosas", icon: Activity },
      { key: "acessoRelAtendimentos", label: "Relatório de Atendimentos", description: "Indicadores de recepção", icon: Users },
      { key: "acessoRelCustos", label: "Relatório de Custos", description: "Indicadores de compras e custos", icon: Package },
    ],
  },
  {
    id: "safatle", title: "Gestão Safatle", description: "Módulos corporativos internos", accent: "border-indigo-200",
    modules: [
      { key: "acessoPainelExecutivo", label: "Painel Executivo", description: "Indicadores consolidados", icon: Landmark },
      { key: "acessoVisaoGeral", label: "Visão Geral", description: "Resumo gerencial", icon: LayoutDashboard },
      { key: "acessoFinanceiro", label: "Financeiro", description: "Gestão financeira interna", icon: DollarSign },
      { key: "acessoContratos", label: "Contratos", description: "Gestão de contratos", icon: FileText },
      { key: "acessoPropostas", label: "Propostas", description: "Gestão de propostas", icon: Briefcase },
      { key: "acessoAtendimentosConsolidados", label: "Atendimentos Consolidados", description: "Consolidação operacional", icon: Users },
      { key: "acessoNfseConsolidado", label: "NFS-e Consolidado", description: "Visão consolidada de notas", icon: Receipt },
    ],
  },
];

export const PERMISSION_MODULES = PERMISSION_SECTIONS.flatMap((section) => section.modules);

export function PermissionMatrix({
  values,
  onChange,
}: {
  values: Partial<Record<ModulePermissionKey, PermissionValue>>;
  onChange: (key: ModulePermissionKey, value: PermissionValue) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const sections = useMemo(() => PERMISSION_SECTIONS.map((section) => ({
    ...section,
    modules: normalizedSearch
      ? section.modules.filter((module) => `${module.label} ${module.description}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
      : section.modules,
  })).filter((section) => section.modules.length > 0), [normalizedSearch]);

  const enabledCount = PERMISSION_MODULES.filter((module) => values[module.key] === "sim").length;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Acessos por módulo</p>
            <p className="text-sm text-muted-foreground">{enabledCount} de {PERMISSION_MODULES.length} módulos ativos liberados</p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar módulo ou relatório..." className="pl-9" />
          </div>
        </div>
      </div>

      {sections.map((section) => {
        const sectionEnabled = section.modules.filter((module) => values[module.key] === "sim").length;
        return (
          <section key={section.id} className={`rounded-xl border ${section.accent} bg-card p-4`}>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{section.title}</h4>
                  <Badge variant="secondary">{sectionEnabled}/{section.modules.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => section.modules.forEach((module) => onChange(module.key, "sim"))}>
                  <CheckCheck className="mr-1 h-3.5 w-3.5" /> Liberar seção
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => section.modules.forEach((module) => onChange(module.key, "nao"))}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Bloquear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {section.modules.map((module) => {
                const Icon = module.icon;
                const enabled = values[module.key] === "sim";
                return (
                  <label key={module.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${enabled ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"}`}>
                    <div className={`rounded-lg p-2 ${enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{module.label}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={(checked) => onChange(module.key, checked ? "sim" : "nao")} />
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      {sections.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum módulo encontrado para “{search}”.
        </div>
      )}
    </div>
  );
}
