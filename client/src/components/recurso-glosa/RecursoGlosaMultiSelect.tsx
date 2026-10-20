import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface RecursoGlosaMultiSelectOption {
  value: string;
  label: string;
}

interface RecursoGlosaMultiSelectProps {
  /** Nome acessível inequívoco do combobox. */
  ariaLabel: string;
  options: RecursoGlosaMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  allLabel?: string;
  className?: string;
}

/**
 * MultiSelect específico do demonstrativo. A seleção vazia representa todas as
 * opções para que o payload não dependa de uma lista completa potencialmente obsoleta.
 */
export function RecursoGlosaMultiSelect({
  ariaLabel,
  options,
  selected,
  onChange,
  placeholder,
  allLabel = "Todas",
  className,
}: RecursoGlosaMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listboxId = useId();

  const filteredOptions = useMemo(() => {
    const searchNormalizada = search.trim().toLocaleLowerCase("pt-BR");
    if (!searchNormalizada) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("pt-BR").includes(searchNormalizada));
  }, [options, search]);

  const canonicalizar = (next: string[]) => {
    const unicos = [...new Set(next)];
    // "Todas" tem representação única no contrato: [].
    onChange(options.length > 0 && unicos.length === options.length ? [] : unicos);
  };

  const toggle = (value: string) => {
    canonicalizar(selected.includes(value)
      ? selected.filter((selectedValue) => selectedValue !== value)
      : [...selected, value]);
  };

  const displayText = useMemo(() => {
    if (selected.length === 0) return allLabel;
    const labels = selected
      .map((value) => options.find((option) => option.value === value)?.label ?? value)
      .slice(0, 2);
    const restantes = selected.length - labels.length;
    return restantes > 0 ? `${labels.join(", ")} +${restantes}` : labels.join(", ");
  }, [allLabel, options, selected]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          className={cn("h-9 w-full justify-between text-sm font-normal", className)}
        >
          <span className={cn("truncate text-left", selected.length === 0 && "text-muted-foreground")}>{displayText || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="border-b p-2">
          <label htmlFor={`${listboxId}-search`} className="sr-only">Buscar {ariaLabel}</label>
          <input
            id={`${listboxId}-search`}
            type="search"
            placeholder="Buscar..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div id={listboxId} role="listbox" aria-label={ariaLabel} aria-multiselectable="true" className="max-h-[250px] overflow-y-auto p-1">
          <button
            type="button"
            role="option"
            aria-selected={selected.length === 0}
            onClick={() => onChange([])}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
              selected.length === 0 && "font-medium",
            )}
          >
            <span className={cn("flex h-4 w-4 items-center justify-center rounded-sm border", selected.length === 0 ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>
              {selected.length === 0 && <Check className="h-3 w-3" aria-hidden="true" />}
            </span>
            {allLabel}
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">{options.length}</Badge>
          </button>
          <div className="my-1 h-px bg-border" />
          {filteredOptions.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                onClick={() => toggle(option.value)}
                className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground", isSelected && "font-medium")}
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-sm border", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>
                  {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum resultado encontrado</p>}
        </div>
        {selected.length > 0 && (
          <div className="flex items-center justify-between border-t p-2">
            <span className="text-xs text-muted-foreground">{selected.length} selecionado{selected.length > 1 ? "s" : ""}</span>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => onChange([])}>Todas</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
