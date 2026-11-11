import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BiThemePalette } from "@shared/biPersonalizadoConfig";

export interface LinhaMatrizGlosaBi {
  chave: string;
  label: string;
  sublabel?: string;
  badge?: string;
  valorProcessado?: number;
  valorGlosado: number;
  glosaRecursada: number;
  glosaAceita: number;
  glosaPendente: number;
  taxaGlosa?: number;
  percentualTotal?: number;
  qtdItens?: number;
}

type SortFieldGlosa =
  | "label"
  | "qtdItens"
  | "valorProcessado"
  | "valorGlosado"
  | "glosaRecursada"
  | "glosaAceita"
  | "glosaPendente"
  | "taxa";

interface BiGlosasMatrixTableProps {
  titulo: string;
  colunaDimensaoLabel: string;
  linhas: LinhaMatrizGlosaBi[];
  palette: BiThemePalette;
  mostrarDataBars?: boolean;
  mostrarProcessado?: boolean;
  mostrarQuantidade?: boolean;
  modoPercentual?: "taxaGlosa" | "participacao";
  chaveSelecionada?: string | number;
  onToggleChave?: (chave: string) => void;
  onLimparSelecao?: () => void;
  maxHeightClass?: string;
  headerRightSlot?: React.ReactNode;
  totaisExplicito?: {
    valorProcessado?: number;
    valorGlosado: number;
    glosaRecursada: number;
    glosaAceita: number;
    glosaPendente: number;
    taxaGlosa?: number;
    qtdItens?: number;
  };
}

const fmtMoeda = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtPct = (v: number) =>
  `${Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;

export function BiGlosasMatrixTable({
  titulo,
  colunaDimensaoLabel,
  linhas,
  palette,
  mostrarDataBars = true,
  mostrarProcessado = true,
  mostrarQuantidade = false,
  modoPercentual = "taxaGlosa",
  chaveSelecionada,
  onToggleChave,
  onLimparSelecao,
  maxHeightClass = "max-h-[320px]",
  headerRightSlot,
  totaisExplicito,
}: BiGlosasMatrixTableProps) {
  const [sortField, setSortField] = useState<SortFieldGlosa>("valorGlosado");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: SortFieldGlosa) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "label" ? "asc" : "desc");
    }
  };

  const getPctRow = (r: LinhaMatrizGlosaBi) =>
    modoPercentual === "participacao"
      ? Number(r.percentualTotal ?? 0)
      : Number(r.taxaGlosa ?? 0);

  const linhasOrdenadas = useMemo(() => {
    const copia = [...linhas];
    copia.sort((a, b) => {
      let cmp = 0;
      if (sortField === "label") {
        cmp = a.label.localeCompare(b.label, "pt-BR");
      } else if (sortField === "taxa") {
        cmp = getPctRow(a) - getPctRow(b);
      } else {
        cmp = Number(a[sortField] || 0) - Number(b[sortField] || 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [linhas, sortField, sortDir, modoPercentual]);

  const maximos = useMemo(() => {
    let proc = 1;
    let glosa = 1;
    let rec = 1;
    let aceita = 1;
    let pend = 1;
    for (const r of linhas) {
      if ((r.valorProcessado || 0) > proc) proc = r.valorProcessado || 0;
      if (r.valorGlosado > glosa) glosa = r.valorGlosado;
      if (r.glosaRecursada > rec) rec = r.glosaRecursada;
      if (r.glosaAceita > aceita) aceita = r.glosaAceita;
      if (r.glosaPendente > pend) pend = r.glosaPendente;
    }
    return { proc, glosa, rec, aceita, pend };
  }, [linhas]);

  const totais = useMemo(() => {
    if (totaisExplicito) {
      return {
        valorProcessado: Number(totaisExplicito.valorProcessado || 0),
        valorGlosado: Number(totaisExplicito.valorGlosado || 0),
        glosaRecursada: Number(totaisExplicito.glosaRecursada || 0),
        glosaAceita: Number(totaisExplicito.glosaAceita || 0),
        glosaPendente: Number(totaisExplicito.glosaPendente || 0),
        qtdItens: Number(totaisExplicito.qtdItens || 0),
        pct:
          modoPercentual === "participacao"
            ? 100
            : Number(totaisExplicito.taxaGlosa ?? 0),
      };
    }

    const acc = linhas.reduce(
      (s, r) => ({
        valorProcessado: s.valorProcessado + Number(r.valorProcessado || 0),
        valorGlosado: s.valorGlosado + Number(r.valorGlosado || 0),
        glosaRecursada: s.glosaRecursada + Number(r.glosaRecursada || 0),
        glosaAceita: s.glosaAceita + Number(r.glosaAceita || 0),
        glosaPendente: s.glosaPendente + Number(r.glosaPendente || 0),
        qtdItens: s.qtdItens + Number(r.qtdItens || 0),
      }),
      {
        valorProcessado: 0,
        valorGlosado: 0,
        glosaRecursada: 0,
        glosaAceita: 0,
        glosaPendente: 0,
        qtdItens: 0,
      },
    );
    const pct =
      modoPercentual === "participacao"
        ? acc.valorGlosado > 0
          ? 100
          : 0
        : acc.valorProcessado > 0
          ? Number(((acc.valorGlosado / acc.valorProcessado) * 100).toFixed(2))
          : 0;
    return { ...acc, pct };
  }, [linhas, totaisExplicito, modoPercentual]);

  const renderSortIcon = (field: SortFieldGlosa) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-45 shrink-0" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 shrink-0" />
    ) : (
      <ArrowDown className="h-3 w-3 shrink-0" />
    );
  };

  const renderDataCell = (valor: number, max: number, corBarra: string) => {
    const pctLargura =
      mostrarDataBars && valor > 0
        ? Math.min(100, Math.max(4, (valor / max) * 100))
        : 0;
    return (
      <td className="px-2 py-1.5 text-right align-middle tabular-nums whitespace-nowrap">
        <div className="relative flex items-center justify-end px-1.5 py-0.5 rounded-[3px] overflow-hidden">
          {pctLargura > 0 && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-[3px] transition-all duration-300"
              style={{
                width: `${pctLargura}%`,
                backgroundColor: corBarra,
                opacity: 0.72,
              }}
            />
          )}
          <span className="relative z-10 text-[11.5px] font-medium text-slate-800">
            {fmtMoeda(valor)}
          </span>
        </div>
      </td>
    );
  };

  const temSelecao = chaveSelecionada !== undefined && chaveSelecionada !== "";

  return (
    <section
      className="flex flex-col rounded-xl border shadow-sm overflow-hidden transition-colors"
      style={{
        background: palette.panelBg,
        borderColor: palette.panelBorder,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h3
            className="text-xs sm:text-[13px] font-extrabold uppercase tracking-wider"
            style={{ color: palette.panelTitleColor }}
          >
            {titulo}
          </h3>
          {temSelecao && onLimparSelecao && (
            <button
              type="button"
              onClick={onLimparSelecao}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/25 transition-colors"
              style={
                palette.isLightCanvas
                  ? { backgroundColor: "#e2e8f0", color: "#0f172a" }
                  : undefined
              }
            >
              Filtro ativo
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        {headerRightSlot}
      </div>

      <div className="px-2.5 pb-2.5 flex-1 flex flex-col min-h-0">
        <div
          className={cn(
            "overflow-auto rounded-lg border border-black/10 bg-white",
            maxHeightClass,
          )}
        >
          <table className="w-full border-collapse text-left">
            <thead
              className="sticky top-0 z-20 select-none text-[11px] font-bold"
              style={{
                backgroundColor: palette.tableHeaderBg,
                color: palette.tableHeaderText,
              }}
            >
              <tr>
                <th
                  onClick={() => handleSort("label")}
                  className="cursor-pointer px-2.5 py-2 whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center gap-1">
                    {colunaDimensaoLabel}
                    {renderSortIcon("label")}
                  </span>
                </th>
                {mostrarQuantidade && (
                  <th
                    onClick={() => handleSort("qtdItens")}
                    className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Itens
                      {renderSortIcon("qtdItens")}
                    </span>
                  </th>
                )}
                {mostrarProcessado && (
                  <th
                    onClick={() => handleSort("valorProcessado")}
                    className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Processado
                      {renderSortIcon("valorProcessado")}
                    </span>
                  </th>
                )}
                <th
                  onClick={() => handleSort("valorGlosado")}
                  className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Glosado
                    {renderSortIcon("valorGlosado")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("glosaRecursada")}
                  className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Recursada
                    {renderSortIcon("glosaRecursada")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("glosaAceita")}
                  className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Aceita
                    {renderSortIcon("glosaAceita")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("glosaPendente")}
                  className="cursor-pointer px-2 py-2 text-right whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Pendente
                    {renderSortIcon("glosaPendente")}
                  </span>
                </th>
                <th
                  onClick={() => handleSort("taxa")}
                  className="cursor-pointer px-2.5 py-2 text-right whitespace-nowrap hover:opacity-90"
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {modoPercentual === "participacao" ? "% Share" : "% Glosa"}
                    {renderSortIcon("taxa")}
                  </span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-[11.5px]">
              {linhasOrdenadas.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + (mostrarProcessado ? 1 : 0) + (mostrarQuantidade ? 1 : 0)}
                    className="px-4 py-8 text-center text-xs text-slate-400"
                  >
                    Nenhuma glosa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                linhasOrdenadas.map((row, idx) => {
                  const selecionada =
                    temSelecao && String(chaveSelecionada) === String(row.chave);
                  const esmaecida = temSelecao && !selecionada;
                  const pctValor = getPctRow(row);
                  return (
                    <tr
                      key={`${row.chave}-${idx}`}
                      onClick={() => onToggleChave?.(row.chave)}
                      className={cn(
                        "transition-colors",
                        onToggleChave && "cursor-pointer",
                        selecionada
                          ? "bg-amber-50/90 font-semibold"
                          : idx % 2 === 0
                            ? "bg-white hover:bg-slate-50/90"
                            : "bg-slate-50/55 hover:bg-slate-100/80",
                        esmaecida && "opacity-55 hover:opacity-90",
                      )}
                    >
                      <td
                        className="px-2.5 py-1.5 text-slate-800 max-w-[260px]"
                        title={row.sublabel ? `${row.label} (${row.sublabel})` : row.label}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate font-semibold text-slate-800">
                            {row.label}
                          </span>
                          {row.badge && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-medium text-slate-600">
                              {row.badge}
                            </span>
                          )}
                        </div>
                        {row.sublabel && (
                          <p className="truncate text-[10px] text-slate-500">
                            {row.sublabel}
                          </p>
                        )}
                      </td>
                      {mostrarQuantidade && (
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {Number(row.qtdItens || 0).toLocaleString("pt-BR")}
                        </td>
                      )}
                      {mostrarProcessado &&
                        renderDataCell(
                          row.valorProcessado || 0,
                          maximos.proc,
                          palette.dataBarFaturado,
                        )}
                      {renderDataCell(
                        row.valorGlosado,
                        maximos.glosa,
                        palette.dataBarGlosa,
                      )}
                      {renderDataCell(
                        row.glosaRecursada,
                        maximos.rec,
                        palette.dataBarRecebido,
                      )}
                      {renderDataCell(
                        row.glosaAceita,
                        maximos.aceita,
                        "#fecdd3",
                      )}
                      {renderDataCell(
                        row.glosaPendente,
                        maximos.pend,
                        palette.dataBarAReceber,
                      )}
                      <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold text-slate-700">
                        {fmtPct(pctValor)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {linhasOrdenadas.length > 0 && (
              <tfoot
                className="sticky bottom-0 z-10 border-t-2 border-slate-300 text-[11.5px] font-extrabold tabular-nums"
                style={{
                  backgroundColor: palette.tableTotalBg,
                  color: palette.tableTotalText,
                }}
              >
                <tr>
                  <td className="px-2.5 py-2">Total</td>
                  {mostrarQuantidade && (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {totais.qtdItens.toLocaleString("pt-BR")}
                    </td>
                  )}
                  {mostrarProcessado && (
                    <td className="px-2.5 py-2 text-right whitespace-nowrap">
                      {fmtMoeda(totais.valorProcessado)}
                    </td>
                  )}
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {fmtMoeda(totais.valorGlosado)}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {fmtMoeda(totais.glosaRecursada)}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {fmtMoeda(totais.glosaAceita)}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {fmtMoeda(totais.glosaPendente)}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {fmtPct(totais.pct)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
