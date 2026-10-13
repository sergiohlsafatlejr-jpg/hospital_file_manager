import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPilotoMoney } from "@/lib/hupPilotoMoney";

export type ConciliacaoGuiaStatusVariant =
  | "conciliado"
  | "nao_conciliado"
  | "sem_pagamento"
  | "pendente"
  | "ambiguo"
  | "candidato"
  | "medico_direto";

export type ConciliacaoGuiaTabelaRow = {
  chave: string;
  guia: string;
  paciente?: string | null;
  competencia: string;
  lote?: string | null;
  protocolo?: string | null;
  totalItens: number;
  valorFaturado: string | null;
  valorRecebido: string | null;
  valorGlosado: string | null;
  valorAcrescimo: string | null;
  statusLabel: string;
  statusVariant: ConciliacaoGuiaStatusVariant;
  desassociados: number | null;
  dots?: { label: string; color: string }[];
  pacienteBadges?: ReactNode;
  conta?: string;
  detailsTitle?: string;
  /** Contexto apresentado apenas por hover; não muda o significado do status. */
  statusReason?: string;
  /** Cobertura dos valores candidatos sobre grupos hospitalares conhecidos. */
  coberturaCandidata?: {
    recebidos: number;
    glosados: number;
    total: number;
  };
};

export type ConciliacaoGuiasTabelaProps = {
  rows: readonly ConciliacaoGuiaTabelaRow[];
  onAbrir?: (chave: string) => void;
  ariaLabel?: string;
  colunaPendentes?: string;
  modo?: "persistida" | "banco";
  formatarCompetencia?: (competencia: string) => string;
  mensagemVazia?: string;
};

type StatusEntrada = ConciliacaoGuiaStatusVariant | string | null | undefined;

/**
 * Factory shared by the persisted source and Banco.  Callers still own their
 * source-specific field mapping; this centralizes the legacy status vocabulary.
 */
export function mapearStatusGuiaTabela(
  status: StatusEntrada
): Pick<ConciliacaoGuiaTabelaRow, "statusLabel" | "statusVariant"> {
  switch (status) {
    case "conciliado":
      return { statusLabel: "Conciliado", statusVariant: "conciliado" };
    case "nao_conciliado":
      return { statusLabel: "Não Conciliado", statusVariant: "nao_conciliado" };
    case "sem_pagamento":
      return { statusLabel: "Sem Pagamento", statusVariant: "sem_pagamento" };
    case "ambiguo":
    case "misto":
      return { statusLabel: "Revisar", statusVariant: "ambiguo" };
    case "candidato":
      return { statusLabel: "Candidato à revisão", statusVariant: "candidato" };
    case "medico_direto":
      return { statusLabel: "Médico direto", statusVariant: "medico_direto" };
    case "pendente":
    case "sem_candidato":
    case "dados_incompletos":
    default:
      return { statusLabel: "Pendente", statusVariant: "pendente" };
  }
}

export function criarLinhaGuiaTabela(
  row: Omit<ConciliacaoGuiaTabelaRow, "statusLabel" | "statusVariant"> & {
    status?: StatusEntrada;
    statusLabel?: string;
    statusVariant?: ConciliacaoGuiaStatusVariant;
  }
): ConciliacaoGuiaTabelaRow {
  const status = mapearStatusGuiaTabela(row.status);
  return {
    ...row,
    statusLabel: row.statusLabel ?? status.statusLabel,
    statusVariant: row.statusVariant ?? status.statusVariant,
  };
}

function StatusBadge({ row }: { row: ConciliacaoGuiaTabelaRow }) {
  const title = row.statusReason || row.statusLabel;
  switch (row.statusVariant) {
    case "conciliado":
      return (
        <Badge title={title} className="bg-green-500 hover:bg-green-600">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
    case "sem_pagamento":
      return (
        <Badge title={title} className="bg-gray-500 hover:bg-gray-600">
          <AlertCircle className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
    case "nao_conciliado":
      return (
        <Badge title={title} className="bg-red-500 hover:bg-red-600">
          <XCircle className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
    case "candidato":
      return (
        <Badge
          title={title}
          variant="outline"
          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
        >
          <Clock className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
    case "ambiguo":
      return (
        <Badge
          title={title}
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
    case "medico_direto":
      return (
        <Badge
          title={title}
          variant="outline"
          className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200"
        >
          {row.statusLabel}
        </Badge>
      );
    case "pendente":
    default:
      return (
        <Badge
          title={title}
          variant="outline"
          className="border-muted-foreground/30 text-muted-foreground"
        >
          <Clock className="mr-1 h-3 w-3" />
          {row.statusLabel}
        </Badge>
      );
  }
}

function CoberturaCandidata({
  conhecidos,
  total,
  tipo,
}: {
  conhecidos: number;
  total: number;
  tipo: "recebidos" | "glosados";
}) {
  if (total <= 0) return null;
  const texto = `${conhecidos}/${total} grupos com valor ${tipo === "recebidos" ? "candidato" : "de glosa candidato"}`;
  return (
    <span
      className="block text-[11px] text-muted-foreground"
      title={`Cobertura de valores candidatos: ${texto}.`}
    >
      {conhecidos}/{total}
    </span>
  );
}

export default function ConciliacaoGuiasTabela({
  rows,
  onAbrir,
  ariaLabel = "Guias conciliadas",
  colunaPendentes = "Desassociados",
  modo = "persistida",
  formatarCompetencia = competencia => competencia,
  mensagemVazia = "Nenhum resultado de conciliação encontrado.",
}: ConciliacaoGuiasTabelaProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={ariaLabel}>
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left font-medium">Guia</th>
            <th className="max-w-[200px] p-3 text-left font-medium">
              Paciente
            </th>
            <th className="p-3 text-left font-medium">Comp.</th>
            <th className="p-3 text-left font-medium">Lote</th>
            <th className="p-3 text-left font-medium">Protocolo</th>
            <th className="p-3 text-center font-medium">Itens</th>
            <th className="p-3 text-right font-medium">Faturado</th>
            <th
              className="p-3 text-right font-medium"
              title={
                modo === "banco"
                  ? "Valor candidato à revisão, não recebido confirmado"
                  : "Recebido informado na base atual"
              }
            >
              Recebido
            </th>
            <th
              className="p-3 text-right font-medium"
              title={
                modo === "banco"
                  ? "Valor candidato à revisão, não glosado confirmado"
                  : "Glosado informado na base atual"
              }
            >
              Glosado
            </th>
            <th className="p-3 text-right font-medium">Acréscimo</th>
            <th className="p-3 text-center font-medium">Status</th>
            <th className="p-3 text-center font-medium">{colunaPendentes}</th>
            <th className="p-3 text-center font-medium">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={13}
                className="p-10 text-center text-muted-foreground"
              >
                {mensagemVazia}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const abre = () => onAbrir?.(row.chave);
              const clicavel = Boolean(onAbrir);
              const cobertura = row.coberturaCandidata;
              const tooltipRecebido = cobertura
                ? [
                    "Valor candidato à revisão, não recebido confirmado",
                    cobertura.total > 0
                      ? `${cobertura.recebidos}/${cobertura.total} grupos com valor candidato.`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : modo === "banco"
                  ? "Valor candidato à revisão, não recebido confirmado"
                  : "Recebido informado na base atual";
              const tooltipGlosado = cobertura
                ? [
                    "Valor candidato à revisão, não glosado confirmado",
                    cobertura.total > 0
                      ? `${cobertura.glosados}/${cobertura.total} grupos com glosa candidata.`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : modo === "banco"
                  ? "Valor candidato à revisão, não glosado confirmado"
                  : "Glosado informado na base atual";
              const rowBackground =
                row.statusVariant === "nao_conciliado"
                  ? "bg-red-50/50 dark:bg-red-950/20"
                  : row.statusVariant === "sem_pagamento"
                    ? "bg-gray-50/50 dark:bg-gray-950/20"
                    : "";
              return (
                <tr
                  key={row.chave}
                  className={`border-b hover:bg-muted/50 ${clicavel ? "cursor-pointer" : ""} ${rowBackground}`}
                  onClick={clicavel ? abre : undefined}
                >
                  <td
                    className="p-3 font-mono text-sm font-medium"
                    title={row.detailsTitle}
                  >
                    {row.guia || "—"}
                    {!row.paciente && row.conta ? (
                      <span className="mt-0.5 block font-sans text-xs font-normal text-muted-foreground">
                        Conta {row.conta}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className="max-w-[200px] truncate p-3 text-sm"
                    title={row.paciente || undefined}
                  >
                    <span>{row.paciente || "—"}</span>
                    {row.pacienteBadges}
                  </td>
                  <td className="p-3 text-sm">
                    {formatarCompetencia(row.competencia)}
                  </td>
                  <td className="p-3 font-mono text-sm">{row.lote || "—"}</td>
                  <td className="p-3 font-mono text-sm">
                    {row.protocolo || "—"}
                  </td>
                  <td className="p-3 text-center">
                    <span>{row.totalItens}</span>
                    {row.dots?.length ? (
                      <div className="mt-0.5 flex justify-center gap-1">
                        {row.dots.map((dot, index) => (
                          <span
                            key={`${dot.label}-${index}`}
                            className={`inline-block h-2 w-2 rounded-full ${dot.color}`}
                            title={dot.label}
                          />
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap text-blue-600 tabular-nums">
                    {formatPilotoMoney(row.valorFaturado)}
                  </td>
                  <td
                    className="p-3 text-right font-medium whitespace-nowrap text-green-600 tabular-nums"
                    title={tooltipRecebido}
                  >
                    {formatPilotoMoney(row.valorRecebido)}
                    {cobertura ? (
                      <CoberturaCandidata
                        conhecidos={cobertura.recebidos}
                        total={cobertura.total}
                        tipo="recebidos"
                      />
                    ) : null}
                  </td>
                  <td
                    className="p-3 text-right font-medium whitespace-nowrap text-red-600 tabular-nums"
                    title={tooltipGlosado}
                  >
                    {formatPilotoMoney(row.valorGlosado)}
                    {cobertura ? (
                      <CoberturaCandidata
                        conhecidos={cobertura.glosados}
                        total={cobertura.total}
                        tipo="glosados"
                      />
                    ) : null}
                  </td>
                  <td
                    className={`p-3 text-right font-medium whitespace-nowrap tabular-nums ${row.valorAcrescimo == null ? "text-gray-400" : "text-teal-600"}`}
                  >
                    {formatPilotoMoney(row.valorAcrescimo)}
                  </td>
                  <td className="p-3 text-center">
                    <StatusBadge row={row} />
                  </td>
                  <td className="p-3 text-center">
                    {row.desassociados == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : row.desassociados > 0 ? (
                      <Badge className="bg-orange-500 hover:bg-orange-600">
                        {row.desassociados}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-500 hover:bg-green-600">
                        0
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {onAbrir ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={
                          row.detailsTitle ||
                          `Ver detalhes da guia ${row.guia || "não informada"}`
                        }
                        onClick={event => {
                          event.stopPropagation();
                          abre();
                        }}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
