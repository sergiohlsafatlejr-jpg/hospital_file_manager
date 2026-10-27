import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import React from "react";

export interface GrupoAlternativoValue {
  grupoAlternativo?: string;
  grupoObrigatorio?: boolean;
}

export interface GrupoAlternativoFieldsProps {
  id: string;
  value: GrupoAlternativoValue;
  onChange: (next: GrupoAlternativoValue) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Configura uma alternativa explícita entre itens do mesmo gabarito.
 * A obrigatoriedade nunca é inferida pela categoria, tipo ou nome do item.
 */
export function GrupoAlternativoFields({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: GrupoAlternativoFieldsProps) {
  const grupoAlternativo = value.grupoAlternativo?.trim() ?? "";
  const grupoObrigatorio = grupoAlternativo
    ? value.grupoObrigatorio === true
    : false;

  return (
    <div className={className}>
      <Label htmlFor={`${id}-grupo`} className="text-xs text-muted-foreground">
        Grupo alternativo (OR)
      </Label>
      <Input
        id={`${id}-grupo`}
        value={value.grupoAlternativo ?? ""}
        disabled={disabled}
        onChange={event => {
          const nextGroup = event.target.value;
          onChange({
            grupoAlternativo: nextGroup,
            grupoObrigatorio: nextGroup.trim()
              ? value.grupoObrigatorio === true
              : false,
          });
        }}
        placeholder="Ex.: opção de material"
        className="mt-1 h-8 text-xs"
      />
      <div className="mt-2 flex items-start gap-2">
        <Checkbox
          id={`${id}-obrigatorio`}
          checked={grupoObrigatorio}
          disabled={disabled || !grupoAlternativo}
          onCheckedChange={checked =>
            onChange({
              grupoAlternativo: value.grupoAlternativo,
              grupoObrigatorio: checked === true,
            })
          }
        />
        <div className="grid gap-0.5 leading-none">
          <Label
            htmlFor={`${id}-obrigatorio`}
            className="cursor-pointer text-xs font-medium"
          >
            Exigir ao menos um item deste grupo
          </Label>
          <p className="text-xs text-muted-foreground">
            Desmarcado por padrão: a ausência do grupo não gera pendência.
          </p>
        </div>
      </div>
    </div>
  );
}
