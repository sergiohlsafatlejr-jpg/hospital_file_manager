import React, { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BiThemePalette } from "@shared/biPersonalizadoConfig";
import type { LinhaMatrizBi } from "../../../../server/painelBiPersonalizadoService";

function fmtCompactoBr(valor: number): string {
  const abs = Math.abs(valor || 0);
  if (abs === 0) return "";
  if (abs >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} Mi`;
  }
  if (abs >= 1_000) {
    return `R$ ${(valor / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })} mil`;
  }
  return `R$ ${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function fmtMoedaCompleta(valor: number): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function DarkExecutiveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: LinhaMatrizBi | undefined = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-cyan-400/30 bg-[#042330]/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md min-w-[235px]">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-1.5 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-200/80">
          COMPETÊNCIA
        </span>
        <span className="text-sm font-extrabold tabular-nums">{row.label}</span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Faturado</span>
          <span className="font-bold tabular-nums text-sky-200">{fmtMoedaCompleta(row.faturado)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">VL. Recebido</span>
          <span className="font-bold tabular-nums text-emerald-300">{fmtMoedaCompleta(row.recebido)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">A Receber</span>
          <span className="font-bold tabular-nums text-amber-200">{fmtMoedaCompleta(row.aReceber)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Glosa ({row.pctGlosa.toLocaleString("pt-BR")}%)</span>
          <span className="font-bold tabular-nums text-rose-300">{fmtMoedaCompleta(row.glosa)}</span>
        </div>
      </div>
    </div>
  );
}

interface BiEvolucaoComboChartProps {
  dados: LinhaMatrizBi[];
  palette: BiThemePalette;
  mostrarSerieProduzido: boolean;
  competenciasSelecionadas: string[];
  onToggleCompetencia: (comp: string) => void;
}

export function BiEvolucaoComboChart({
  dados,
  palette,
  mostrarSerieProduzido,
  competenciasSelecionadas,
  onToggleCompetencia,
}: BiEvolucaoComboChartProps) {
  const serieRecente = useMemo(() => dados.slice(-14), [dados]);
  const textColor = palette.isLightCanvas ? "#0f172a" : "#f8fafc";
  const axisColor = palette.isLightCanvas ? "#475569" : "#cbd5e1";

  return (
    <section
      className="rounded-2xl p-3.5 shadow-lg flex flex-col justify-between min-h-[340px]"
      style={{
        background: palette.panelBg,
        border: `1px solid ${palette.panelBorder}`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
        <h3 className="text-sm sm:text-base font-bold tracking-tight" style={{ color: textColor }}>
          Evolução do Faturamento Mensal
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: axisColor }}>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full inline-block"
              style={{ backgroundColor: palette.chartBarColor }}
            />
            {mostrarSerieProduzido ? "Produzido" : "Faturado"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 inline-block rounded"
              style={{ backgroundColor: palette.chartLineFaturado }}
            />
            Faturado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 inline-block rounded"
              style={{ backgroundColor: palette.chartLineRecebido }}
            />
            VL. Recebido
          </span>
        </div>
      </div>

      {serieRecente.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs opacity-60" style={{ color: textColor }}>
          Sem dados mensais para exibir no período selecionado.
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={serieRecente}
              margin={{ top: 24, right: 14, left: 6, bottom: 4 }}
              onClick={(state: any) => {
                const payload = state?.activePayload?.[0]?.payload as LinhaMatrizBi | undefined;
                if (payload?.chave) {
                  onToggleCompetencia(payload.chave);
                }
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={palette.isLightCanvas ? "#e2e8f0" : "rgba(255,255,255,0.08)"}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10.5, fill: axisColor, fontWeight: 500 }}
                axisLine={{ stroke: palette.isLightCanvas ? "#cbd5e1" : "rgba(255,255,255,0.18)" }}
                tickLine={false}
              />
              <YAxis hide domain={[0, (dataMax: number) => Math.ceil((dataMax || 1) * 1.18)]} />
              <RechartsTooltip
                content={<DarkExecutiveTooltip />}
                cursor={{ fill: palette.isLightCanvas ? "rgba(15,23,42,0.05)" : "rgba(255,255,255,0.06)" }}
              />

              <Bar
                dataKey={mostrarSerieProduzido ? "produzido" : "faturado"}
                name={mostrarSerieProduzido ? "Produzido" : "Faturado"}
                radius={[3, 3, 0, 0]}
                maxBarSize={42}
                cursor="pointer"
              >
                {serieRecente.map((entry) => {
                  const ativo =
                    competenciasSelecionadas.length === 0 ||
                    competenciasSelecionadas.includes(entry.chave);
                  return (
                    <Cell
                      key={entry.chave}
                      fill={palette.chartBarColor}
                      fillOpacity={ativo ? 0.92 : 0.35}
                    />
                  );
                })}
                <LabelList
                  dataKey={mostrarSerieProduzido ? "produzido" : "faturado"}
                  position="top"
                  formatter={(v: number) => fmtCompactoBr(Number(v || 0))}
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    fill: textColor,
                  }}
                />
              </Bar>

              <Line
                type="monotone"
                dataKey="faturado"
                name="Faturado"
                stroke={palette.chartLineFaturado}
                strokeWidth={2.2}
                dot={{ r: 3, fill: palette.chartLineFaturado, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />

              <Line
                type="monotone"
                dataKey="recebido"
                name="VL. Recebido"
                stroke={palette.chartLineRecebido}
                strokeWidth={2.2}
                dot={{ r: 3, fill: palette.chartLineRecebido, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
