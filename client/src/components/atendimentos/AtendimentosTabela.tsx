/**
 * Tabela de Atendimentos Unificados com ordenação, seleção múltipla e paginação
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowUpDown, Clock, ChevronLeft, ChevronRight, Bell, Eye,
} from "lucide-react";
import { formatDateBR, safeParseDate } from "@/lib/dateUtils";
import {
  type AtendimentoUnificado,
  getDiasParadoColor,
  getTipoAtendimentoColor,
  getOrigemLabel,
  getOrigemColor,
  isTasyOrigem,
  formatCurrency,
} from "@/lib/atendimentosConstants";
import { useCallback } from "react";

type SortColumn = string;
type SortOrder = "asc" | "desc";

interface TabelaProps {
  data: AtendimentoUnificado[];
  isTasyLayout: boolean;
  // Ordenação
  sortColumn: SortColumn;
  sortOrder: SortOrder;
  onSort: (column: SortColumn) => void;
  // Seleção
  selecionados: Set<string>;
  onToggleSelecionado: (id: string) => void;
  onSelecionarTodos: () => void;
  todosSelecionados: boolean;
  // Notificação
  onNotificar: (atendimento: AtendimentoUnificado) => void;
  // Paginação
  paginaAtual: number;
  totalPaginas: number;
  totalRegistros: number;
  onPagina: (pagina: number) => void;
  // Loading
  isLoading?: boolean;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  try {
    const d = safeParseDate(date) || date;
    return formatDateBR(d);
  } catch {
    return String(date);
  }
}

function getNumAtend(d: AtendimentoUnificado): string {
  return d.numero_atendimento || d.numatend || "-";
}

function getPaciente(d: AtendimentoUnificado): string {
  return d.paciente || d.nomepac || "-";
}

function getConvenio(d: AtendimentoUnificado): string {
  return d.convenio || d.nomeplaco || "Sem Plano";
}

function getTipo(d: AtendimentoUnificado): string {
  return d.tipo_atendimento || d.tipoatend || d.tipoatendimentodescricao || "-";
}

function getServico(d: AtendimentoUnificado, isTasy: boolean): string {
  if (isTasy) return d.dsSetorEntrada || d.codigo_servico || d.codServico || "-";
  return d.descricao_atendimento || d.codigo_servico || d.codserv || "-";
}

export function AtendimentosTabela({
  data, isTasyLayout,
  sortColumn, sortOrder, onSort,
  selecionados, onToggleSelecionado, onSelecionarTodos, todosSelecionados,
  onNotificar,
  paginaAtual, totalPaginas, totalRegistros, onPagina,
  isLoading,
}: TabelaProps) {
  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 text-xs opacity-60">
      {sortColumn === col ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  // Colunas base (comuns a todos os sistemas)
  const baseColunas = [
    { key: "numero_atendimento", label: "Nº Atend.", width: "w-[90px]" },
    { key: "paciente", label: "Paciente", width: "max-w-[180px]" },
    { key: "convenio", label: "Plano", width: "max-w-[150px]" },
    { key: "data_entrada", label: "Entrada", width: "w-[95px]" },
    { key: "data_saida", label: "Saída", width: "w-[95px]" },
    { key: "diasParado", label: "Dias", width: "w-[85px]" },
    { key: "tipo_atendimento", label: "Tipo", width: "w-[120px]" },
  ];

  // Colunas específicas TASY
  const tasyExtras = [
    { key: "codigo_servico", label: "Serviço", width: "w-[100px]" },
    { key: "descricao_atendimento", label: "Descrição", width: "max-w-[140px]" },
    { key: "etapaConta", label: "Etapa", width: "max-w-[130px]" },
    { key: "setorEtapa", label: "Setor Etapa", width: "max-w-[120px]" },
    { key: "userEtapa", label: "User Etapa", width: "max-w-[100px]" },
  ];

  // Colunas específicas WARLEINE/EASYVISION
  const outrosExtras = [
    { key: "codigo_servico", label: "Serviço", width: "max-w-[150px]" },
    { key: "valorConta", label: "Valor", width: "w-[100px]" },
    { key: "etapaConta", label: "Etapa", width: "max-w-[130px]" },
  ];

  const colunas = [...baseColunas, ...(isTasyLayout ? tasyExtras : outrosExtras)];

  return (
    <div className="space-y-0">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {/* Checkbox header */}
              <th className="px-3 py-3 w-[40px]">
                <Checkbox
                  checked={todosSelecionados}
                  onCheckedChange={onSelecionarTodos}
                />
              </th>
              {/* Origem badge */}
              {!isTasyLayout && (
                <th className="px-3 py-3 text-left font-semibold text-xs w-[90px]">Origem</th>
              )}
              {colunas.map(({ key, label }) => (
                <th
                  key={key}
                  className="px-3 py-3 text-left font-semibold cursor-pointer hover:bg-muted/50 select-none whitespace-nowrap text-xs"
                  onClick={() => onSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              {/* Ações */}
              <th className="px-3 py-3 w-[60px] text-center text-xs font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={colunas.length + 3} className="px-4 py-16 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Carregando atendimentos...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colunas.length + 3} className="px-4 py-16 text-center text-muted-foreground">
                  Nenhum atendimento encontrado com os filtros selecionados
                </td>
              </tr>
            ) : (
              data.map((d, idx) => {
                const numAtend = getNumAtend(d);
                const isSelected = selecionados.has(numAtend);

                return (
                  <tr
                    key={`${numAtend}-${idx}`}
                    className={`border-b hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelecionado(numAtend)}
                      />
                    </td>

                    {/* Origem */}
                    {!isTasyLayout && (
                      <td className="px-3 py-2.5">
                        <Badge className={`text-[10px] px-1.5 py-0.5 ${getOrigemColor(d.origemSistema)}`}>
                          {getOrigemLabel(d.origemSistema)}
                        </Badge>
                      </td>
                    )}

                    {/* Nº Atend */}
                    <td className="px-3 py-2.5 font-mono font-medium text-xs">{numAtend}</td>

                    {/* Paciente */}
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-xs" title={getPaciente(d)}>
                      {getPaciente(d)}
                    </td>

                    {/* Plano */}
                    <td className="px-3 py-2.5 max-w-[150px] truncate text-xs" title={getConvenio(d)}>
                      {getConvenio(d)}
                    </td>

                    {/* Data Entrada */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {formatDate(d.data_entrada || d.datatend)}
                    </td>

                    {/* Data Saída */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {formatDate(d.data_saida || d.datasai)}
                    </td>

                    {/* Dias Parado */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${getDiasParadoColor(d.diasParado)}`}>
                        <Clock className="w-3 h-3" />
                        {d.diasParado}d
                      </span>
                    </td>

                    {/* Tipo */}
                    <td className="px-3 py-2.5">
                      <Badge className={`${getTipoAtendimentoColor(getTipo(d))} text-[10px]`}>
                        {getTipo(d)}
                      </Badge>
                    </td>

                    {/* Colunas extras baseadas no layout */}
                    {isTasyLayout ? (
                      <>
                        <td className="px-3 py-2.5 text-xs">{d.codigo_servico || d.codServico || "-"}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[140px] truncate">{d.descricao_atendimento || "-"}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[130px] truncate">{d.etapaConta || "-"}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[120px] truncate">{d.setorEtapa || "-"}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[100px] truncate">{d.userEtapa || "-"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-xs max-w-[150px] truncate">{getServico(d, false)}</td>
                        <td className="px-3 py-2.5 text-xs font-mono">{formatCurrency(d.valorConta)}</td>
                        <td className="px-3 py-2.5 text-xs max-w-[130px] truncate">{d.etapaConta || "-"}</td>
                      </>
                    )}

                    {/* Ações */}
                    <td className="px-3 py-2.5 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onNotificar(d)}
                        title="Notificar"
                      >
                        <Bell className="w-3.5 h-3.5 text-orange-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/5">
        <span className="text-sm text-muted-foreground">
          Exibindo {data.length} de {totalRegistros} atendimentos
          {selecionados.size > 0 && (
            <span className="ml-2 text-primary font-medium">
              ({selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""})
            </span>
          )}
        </span>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual <= 1}
              onClick={() => onPagina(paginaAtual - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {paginaAtual} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => onPagina(paginaAtual + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
