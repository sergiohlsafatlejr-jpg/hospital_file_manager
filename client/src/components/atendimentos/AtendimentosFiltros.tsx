/**
 * Barra de filtros para Atendimentos Unificados
 * Consolida todos os filtros que estavam espalhados em 4 páginas
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter, Calendar } from "lucide-react";
import {
  type OrigemSistema,
  MESES,
  getOrigemLabel,
} from "@/lib/atendimentosConstants";

interface FiltrosState {
  busca: string;
  tipo: string;
  origem: string;
  protocolo: string;
  etapa: string;
  convenio: string;
  servico: string;
  ano: string;
  mes: string;
}

interface Aggregations {
  origens: { value: string; count: number }[];
  tipos: { value: string; count: number }[];
  convenios: { value: string; count: number }[];
  etapas: { value: string; count: number }[];
  protocolos: { value: string; count: number }[];
  anos: { value: string; count: number }[];
}

interface FiltrosProps {
  filtros: FiltrosState;
  onFiltroChange: (key: keyof FiltrosState, value: string) => void;
  onLimparFiltros: () => void;
  aggregations?: Aggregations | null;
  isTasyLayout: boolean;
}

export function AtendimentosFiltros({
  filtros, onFiltroChange, onLimparFiltros, aggregations, isTasyLayout,
}: FiltrosProps) {
  const temFiltrosAtivos =
    filtros.tipo !== "todos" ||
    filtros.origem !== "all" ||
    filtros.protocolo !== "all" ||
    filtros.etapa !== "" ||
    filtros.convenio !== "" ||
    filtros.servico !== "" ||
    filtros.ano !== "" ||
    filtros.mes !== "" ||
    filtros.busca !== "";

  const origens = aggregations?.origens || [];
  const protocolos = aggregations?.protocolos || [];
  const etapas = aggregations?.etapas || [];
  const anosDisp = (aggregations?.anos || []).map(a => a.value).filter(a => a.length === 4).sort().reverse();

  return (
    <div className="space-y-3">
      {/* Linha 1: Busca + Selects principais */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Busca textual */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por Nº Atend., Paciente, Plano, Tipo..."
            value={filtros.busca}
            onChange={e => onFiltroChange("busca", e.target.value)}
            className="pl-10"
          />
          {filtros.busca && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onFiltroChange("busca", "")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtro por origem (sistema) */}
        {origens.length > 1 && (
          <Select value={filtros.origem} onValueChange={v => onFiltroChange("origem", v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sistema" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Sistemas</SelectItem>
              {origens.map(o => (
                <SelectItem key={o.value} value={o.value.toLowerCase()}>
                  {getOrigemLabel(o.value)} ({o.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro por ano */}
        {anosDisp.length > 0 && (
          <Select value={filtros.ano || "all"} onValueChange={v => onFiltroChange("ano", v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Períodos</SelectItem>
              {anosDisp.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro por mês */}
        {filtros.ano && (
          <Select value={filtros.mes || "all"} onValueChange={v => onFiltroChange("mes", v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Meses</SelectItem>
              {MESES.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Linha 2: Filtros TASY-específicos */}
      {isTasyLayout && (
        <div className="flex flex-wrap gap-3">
          {/* Protocolo */}
          {protocolos.length > 0 && (
            <Select value={filtros.protocolo} onValueChange={v => onFiltroChange("protocolo", v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Protocolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Protocolos</SelectItem>
                <SelectItem value="__sem_protocolo__">Sem Protocolo</SelectItem>
                {protocolos.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.value} ({p.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Etapa */}
          {etapas.length > 0 && (
            <Select value={filtros.etapa || "all"} onValueChange={v => onFiltroChange("etapa", v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Etapa Conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Etapas</SelectItem>
                {etapas.map(e => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.value} ({e.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Indicador de filtros ativos */}
      {temFiltrosAtivos && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-blue-400 bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/20">
          <Filter className="w-4 h-4" />
          <span>Filtros ativos:</span>
          {filtros.busca && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("busca", "")}>
              Busca: "{filtros.busca}" <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.tipo !== "todos" && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("tipo", "todos")}>
              Tipo: {filtros.tipo} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.origem !== "all" && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("origem", "all")}>
              Sistema: {getOrigemLabel(filtros.origem)} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.convenio && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("convenio", "")}>
              Plano: {filtros.convenio} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.servico && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("servico", "")}>
              Serviço: {filtros.servico} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.etapa && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("etapa", "")}>
              Etapa: {filtros.etapa} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.protocolo !== "all" && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("protocolo", "all")}>
              Protocolo: {filtros.protocolo === "__sem_protocolo__" ? "Sem protocolo" : filtros.protocolo} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.ano && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("ano", "")}>
              Ano: {filtros.ano} <X className="w-3 h-3" />
            </Badge>
          )}
          {filtros.mes && (
            <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => onFiltroChange("mes", "")}>
              Mês: {filtros.mes} <X className="w-3 h-3" />
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={onLimparFiltros}>
            <X className="w-3 h-3 mr-1" /> Limpar Todos
          </Button>
        </div>
      )}
    </div>
  );
}

export type { FiltrosState, Aggregations };
