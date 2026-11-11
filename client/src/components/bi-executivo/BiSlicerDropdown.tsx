import React, { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BiThemePalette } from "@shared/biPersonalizadoConfig";

export interface BiSlicerItem {
  chave: string;
  label: string;
}

interface BiSlicerDropdownProps {
  titulo: string;
  opcoes: BiSlicerItem[];
  selecionados: string[];
  onChange: (novos: string[]) => void;
  palette: BiThemePalette;
}

export function BiSlicerDropdown({
  titulo,
  opcoes,
  selecionados,
  onChange,
  palette,
}: BiSlicerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return opcoes;
    return opcoes.filter((item) => item.label.toLowerCase().includes(q));
  }, [opcoes, busca]);

  const resumoTexto = useMemo(() => {
    if (selecionados.length === 0) return "Todos";
    if (selecionados.length === opcoes.length && opcoes.length > 0) return "Todos";
    if (selecionados.length === 1) {
      return opcoes.find((o) => o.chave === selecionados[0])?.label || selecionados[0];
    }
    return `Seleções múltiplas (${selecionados.length})`;
  }, [selecionados, opcoes]);

  const toggleOpcao = (chave: string) => {
    if (selecionados.includes(chave)) {
      onChange(selecionados.filter((item) => item !== chave));
    } else {
      onChange([...selecionados, chave]);
    }
  };

  const toggleTodos = () => {
    if (selecionados.length > 0) {
      onChange([]);
    } else {
      onChange(opcoes.map((o) => o.chave));
    }
  };

  return (
    <div
      className="rounded-xl p-2 shadow-sm transition-all min-w-[168px] flex-1 sm:flex-initial"
      style={{
        background: palette.slicerFrameBg,
        border: `1px solid ${palette.slicerFrameBorder}`,
      }}
    >
      <div
        className="rounded-[4px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5 flex items-center justify-between"
        style={{
          background: palette.slicerLabelBg,
          color: palette.slicerLabelText,
        }}
      >
        <span>{titulo}</span>
        {selecionados.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            title="Limpar filtro"
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 rounded-[4px] bg-white px-2.5 py-1 text-left text-xs font-medium text-slate-800 shadow-xs hover:bg-slate-50 focus:outline-none"
          >
            <span className="truncate">{resumoTexto}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[260px] p-0 shadow-xl border-slate-200" align="end">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Filtrar ${titulo.toLowerCase()}...`}
              className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-[260px] overflow-y-auto p-1.5 space-y-0.5">
            <button
              type="button"
              onClick={toggleTodos}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <div
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border",
                  selecionados.length === 0
                    ? "bg-sky-600 border-sky-600 text-white"
                    : "border-slate-300 bg-white",
                )}
              >
                {selecionados.length === 0 && <Check className="h-2.5 w-2.5" />}
              </div>
              <span>Todos ({opcoes.length})</span>
            </button>

            <div className="my-1 border-t border-slate-100" />

            {filtradas.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Nenhuma opção encontrada
              </div>
            ) : (
              filtradas.map((item) => {
                const ativo = selecionados.includes(item.chave);
                return (
                  <button
                    key={item.chave}
                    type="button"
                    onClick={() => toggleOpcao(item.chave)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                      ativo
                        ? "bg-sky-50 font-semibold text-sky-900"
                        : "text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                        ativo
                          ? "bg-sky-600 border-sky-600 text-white"
                          : "border-slate-300 bg-white",
                      )}
                    >
                      {ativo && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })
            )}
          </div>

          {selecionados.length > 0 && (
            <div className="border-t border-slate-100 p-1.5 bg-slate-50 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 pl-1">
                {selecionados.length} selecionado(s)
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-semibold text-sky-700 hover:underline pr-1"
              >
                Limpar
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
