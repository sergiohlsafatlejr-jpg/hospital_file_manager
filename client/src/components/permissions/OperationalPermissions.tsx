import { Eye, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { PermissionValue } from "@shared/permissions";

type ActionKey = "podeVisualizar" | "podeEditar" | "podeExcluir" | "podeGerenciar";

type Props = {
  values: Record<ActionKey, PermissionValue>;
  onChange: (key: ActionKey, value: PermissionValue) => void;
};

const ACTIONS = [
  { key: "podeVisualizar" as const, label: "Visualizar a unidade", description: "A unidade aparece no seletor e pode ser consultada.", icon: Eye },
  { key: "podeEditar" as const, label: "Editar dados", description: "Permite criar e alterar registros nos módulos liberados.", icon: Pencil },
  { key: "podeExcluir" as const, label: "Excluir dados", description: "Libera ações destrutivas quando o módulo também permitir.", icon: Trash2 },
  { key: "podeGerenciar" as const, label: "Gerenciar usuários", description: "Permite administrar usuários somente nesta unidade.", icon: ShieldCheck },
];

export function OperationalPermissions({ values, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold">Ações permitidas na unidade</h4>
        <p className="text-sm text-muted-foreground">Essas ações não concedem módulos; elas definem o que o usuário pode fazer nos módulos liberados.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const enabled = values[action.key] === "sim";
          return (
            <label key={action.key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${enabled ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"}`}>
              <div className={`rounded-lg p-2 ${enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
              <Switch checked={enabled} onCheckedChange={(checked) => onChange(action.key, checked ? "sim" : "nao")} />
            </label>
          );
        })}
      </div>
    </div>
  );
}
