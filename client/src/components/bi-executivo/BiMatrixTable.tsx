import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BiFormulaPctGlosa, BiThemePalette } from "@shared/biPersonalizadoConfig";
import { calcularPercentualGlosaBi } from "@shared/biPersonalizadoConfig";
import type { LinhaMatrizBi } from "../../../../server/painelBiPersonalizadoService";

const fmtMoeda = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (v: number, casas = 2) =>
  `${Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;

type SortField = "label" | "faturado" | "recebido" | "glosa" | "aReceber" | "pctGlosa";

interface BiMatrixTableProps {
  titulo: string;
  colunaDimensaoLabel: string;
  linhas: LinhaMatrizBi[];
  palette: BiThemePalette;
  mostrarDataBars: boolean;
  formulaPctGlosa: BiFormulaPctGlosa;
  defaultSortField?: SortField;
  defaultSortDir?: "asc" | "desc";
  chavesSelecionadas?: string[];
  onToggleChave?: (chave: string) => void;
  onLimparSelecao?: () => void;
  headerRightSlot?: React.ReactNode;
  maxHeightClass?: string;
  casasPercentual?: 1 | 2;
}

export function BiMatrixTable({
  titulo,
  colunaDimensaoLabel,
  linhas,
  palette,
  mostrarDataBars,
  formulaPctGlosa,
  defaultSortField = "faturado",
  defaultSortDir = "desc",
  chavesSelecionadas = [],
  onToggleChave,
  onLimparSelecao,
  headerRightSlot,
  maxHeightClass = "max-h-[300px]",
  casasPercentual = 2,
}: BiMatrixTableProps) {
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "label" ? "asc" : "desc");
    }
  };

  const linhasOrdenadas = useMemo(() => {
    const copy = [...linhas];
    copy.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "label") {
        return a.chave.localeCompare(b.chave, "pt-BR") * mul;
      }
      return ((a[sortField] || 0) - (b[sortField] || 0)) * mul;
    });
    return copy;
  }, [linhas, sortField, sortDir]);

  const maximos = useMemo(() => {
    return linhas.reduce(
      (acc, r) => ({
        faturado: Math.max(acc.faturado, r.faturado || 0),
        recebido: Math.max(acc.recebido, r.recebido || 0),
        glosa: Math.max(acc.glosa, r.glosa || 0),
        aReceber: Math.max(acc.aReceber, r.aReceber || 0),
      }),
      { faturado: 0, recebido: 0, glosa: 0, aReceber: 0 },
    );
  }, [linhas]);

  const totais = useMemo(() => {
    const soma = linhas.reduce(
      (acc, r) => ({
        faturado: acc.faturado + (r.faturado || 0),
        recebido: acc.recebido + (r.recebido || 0),
        glosa: acc.glosa + (r.glosa || 0),
        aReceber: acc.aReceber + (r.aReceber || 0),
      }),
      { faturado: 0, recebido: 0, glosa: 0, aReceber: 0 },
    );
    return {
      ...soma,
      pctGlosa: calcularPercentualGlosaBi(
        soma.glosa,
        soma.faturado,
        soma.recebido,
        formulaPctGlosa,
      ),
    };
  }, [linhas, formulaPctGlosa]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-35 inline ml-1" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1 text-amber-300" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1 text-amber-300" />
    );
  };

  const renderDataBarCell = (valor: number, maximo: number, corBarra: string) => {
    const pctLargura =
      mostrarDataBars && maximo > 0 && valor > 0
        ? Math.max(3, Math.min(94, (valor / maximo) * 94))
        : 0;

    return (
      <td className="relative px-2 py-1.5 text-right tabular-nums border-r border-slate-200/80 whitespace-nowrap">
        {pctLargura > 0 && (
          <div
            className="pointer-events-none absolute left-1 top-[3px] bottom-[3px] rounded-[2px] transition-all duration-300"
            style={{
              width: `${pctLargura}%`,
              backgroundColor: corBarra,
              opacity: 0.72,
            }}
          />
        )}
        <span className="relative z-10 font-medium text-slate-800">{fmtMoeda(valor)}</span>
      </td>
    );
  };

  const temFiltroAtivo = chavesSelecionadas.length > 0;

  return (
    <section
      className="rounded-2xl p-3.5 shadow-lg flex flex-col transition-all"
      style={{
        background: palette.panelBg,
        border: `1px solid ${palette.panelBorder}`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 px-0.5">
        <div className="flex items-center gap-2">
          <h3
            className="text-xs font-extrabold uppercase tracking-[0.08em]"
            style={{ color: palette.panelTitleColor }}
          >
            {titulo}
          </h3>
          {temFiltroAtivo && onLimparSelecao && (
            <button
              type="button"
              onClick={onLimparSelecao}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/25 transition-colors"
            >
              <span>Filtro ativo ({chavesSelecionadas.length})</span>
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        {headerRightSlot}
      </div>

      <div className={cn("overflow-auto rounded-lg border border-slate-300/60 bg-white", maxHeightClass)}>
        <table className="w-full border-collapse text-[11.5px] leading-tight">
          <thead
            className="sticky top-0 z-20 select-none"
            style={{
              background: palette.tableHeaderBg,
              color: palette.tableHeaderText,
            }}
          >
            <tr>
              <th
                onClick={() => handleSort("label")}
                className="cursor-pointer px-2.5 py-2 text-left font-bold whitespace-nowrap hover:opacity-90"
              >
                {colunaDimensaoLabel}
                {renderSortIcon("label")}
              </th>
              <th
                onClick={() => handleSort("faturado")}
                className="cursor-pointer px-2 py-2 text-right font-bold whitespace-nowrap hover:opacity-90"
              >
                Faturado
                {renderSortIcon("faturado")}
              </th>
              <th
                onClick={() => handleSort("recebido")}
                className="cursor-pointer px-2 py-2 text-right font-bold whitespace-nowrap hover:opacity-90"
              >
                VL. Recebido
                {renderSortIcon("recebido")}
              </th>
              <th
                onClick={() => handleSort("glosa")}
                className="cursor-pointer px-2 py-2 text-right font-bold whitespace-nowrap hover:opacity-90"
              >
                Glosa
                {renderSortIcon("glosa")}
              </th>
              <th
                onClick={() => handleSort("aReceber")}
                className="cursor-pointer px-2 py-2 text-right font-bold whitespace-nowrap hover:opacity-90"
              >
                A Receber
                {renderSortIcon("aReceber")}
              </th>
              <th
                onClick={() => handleSort("pctGlosa")}
                className="cursor-pointer px-2 py-2 text-right font-bold whitespace-nowrap hover:opacity-90"
              >
                % Glosa
                {renderSortIcon("pctGlosa")}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80">
            {linhasOrdenadas.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              linhasOrdenadas.map((row, idx) => {
                const selecionada = chavesSelecionadas.includes(row.chave);
                const esmaecida = temFiltroAtivo && !selecionada;
                return (
                  <tr
                    key={row.chave}
                    onClick={() => onToggleChave?.(row.chave)}
                    className={cn(
                      "transition-colors",
                      onToggleChave && "cursor-pointer",
                      idx % 2 === 0 ? "bg-white" : "bg-[#f5f8fa]",
                      selecionada && "bg-sky-50 ring-1 ring-inset ring-sky-500 font-semibold",
                      esmaecida && "opacity-55 hover:opacity-95",
                      !selecionada && "hover:bg-slate-100/90",
                    )}
                  >
                    <td
                      className="px-2.5 py-1.5 font-semibold text-slate-900 border-r border-slate-200/80 max-w-[230px] truncate"
                      title={row.label}
                    >
                      {row.label}
                    </td>
                    {renderDataBarCell(row.faturado, maximos.faturado, palette.dataBarFaturado)}
                    {renderDataBarCell(row.recebido, maximos.recebido, palette.dataBarRecebido)}
                    {renderDataBarCell(row.glosa, maximos.glosa, palette.dataBarGlosa)}
                    {renderDataBarCell(row.aReceber, maximos.aReceber, palette.dataBarAReceber)}
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                      {fmtPct(row.pctGlosa, casasPercentual)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {linhasOrdenadas.length > 0 && (
            <tfoot
              className="sticky bottom-0 z-20 font-extrabold border-t-2 border-slate-400"
              style={{
                background: palette.tableTotalBg,
                color: palette.tableTotalText,
              }}
            >
              <tr>
                <td className="px-2.5 py-2 text-left">Total</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMoeda(totais.faturado)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMoeda(totais.recebido)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMoeda(totais.glosa)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtMoeda(totais.aReceber)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {fmtPct(totais.pctGlosa, casasPercentual)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
