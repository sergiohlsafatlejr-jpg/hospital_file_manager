import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  maxDisplay?: number;
  allLabel?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Selecione...",
  className,
  maxDisplay = 2,
  allLabel = "Todos",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const displayText = React.useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === options.length) return allLabel;
    const selectedLabels = selected
      .map((v) => options.find((o) => o.value === v)?.label || v)
      .slice(0, maxDisplay);
    const remaining = selected.length - maxDisplay;
    if (remaining > 0) {
      return `${selectedLabels.join(", ")} +${remaining}`;
    }
    return selectedLabels.join(", ");
  }, [selected, options, placeholder, allLabel, maxDisplay]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 justify-between text-sm font-normal w-full",
            selected.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate flex-1 text-left">{displayText}</span>
          <div className="flex items-center gap-1 ml-1 shrink-0">
            {selected.length > 0 && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <div className="p-2 border-b">
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[250px] overflow-y-auto p-1">
          {/* Selecionar todos */}
          <button
            type="button"
            onClick={handleSelectAll}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
              selected.length === options.length && "font-medium"
            )}
          >
            <div
              className={cn(
                "h-4 w-4 border rounded-sm flex items-center justify-center shrink-0",
                selected.length === options.length
                  ? "bg-primary border-primary text-primary-foreground"
                  : selected.length > 0
                  ? "bg-primary/20 border-primary"
                  : "border-muted-foreground/30"
              )}
            >
              {selected.length === options.length && (
                <Check className="h-3 w-3" />
              )}
              {selected.length > 0 && selected.length < options.length && (
                <div className="h-1.5 w-1.5 bg-primary rounded-sm" />
              )}
            </div>
            <span>{allLabel}</span>
            <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5">
              {options.length}
            </Badge>
          </button>

          <div className="h-px bg-border my-1" />

          {/* Opções */}
          {filteredOptions.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => handleToggle(option.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
                  isSelected && "font-medium"
                )}
              >
                <div
                  className={cn(
                    "h-4 w-4 border rounded-sm flex items-center justify-center shrink-0",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}

          {filteredOptions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum resultado encontrado
            </p>
          )}
        </div>

        {selected.length > 0 && (
          <div className="border-t p-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selected.length} selecionado{selected.length > 1 ? "s" : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
