import { useMemo, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { motion } from "framer-motion";
import { Building2, Briefcase, ArrowRightLeft, Stethoscope, Layers, BedDouble, Clock, Heart, ChevronDown, ChevronUp, Droplets, CalendarClock, Users } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import ChartCard from "@/components/dashboard/ChartCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#84cc16", "#e11d48", "#0ea5e9", "#a855f7", "#22c55e",
  "#d946ef", "#0891b2", "#65a30d", "#dc2626", "#7c3aed",
];

interface OperacionaisData {
  porCentroCusto: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  porCbo: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  porProveniencia: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  porProvenienciaTipo: Array<{ proveniencia: string; tipo: string; total: number }>;
  porEspecialidade: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  totalCentrosCusto: number;
  totalCbos: number;
  totalProveniencias: number;
  totalEspecialidades: number;
  totalGeral: number;
  fonte: string;
}

interface PacienteInternado {
  numatend: string;
  paciente: string;
  convenio: string;
  centroCusto: string;
  prestador: string;
  dataEntrada: string;
  diasInternado: number;
  procedimento: string;
  cid: string;
}

interface InternadosData {
  totalInternados: number;
  pacientes: PacienteInternado[];
  porCentroCusto: Array<{ nome: string; total: number }>;
  porConvenio: Array<{ nome: string; total: number }>;
  mediaPermancencia: number;
  fonte: string;
}

interface PacienteHemodialise {
  numatend: string;
  paciente: string;
  turno: string;
  prestador: string;
  dataEntrada: string;
  diasTratamento: number;
}

interface HemodialiseData {
  totalPacientes: number;
  pacientes: PacienteHemodialise[];
  porTurno: Array<{ nome: string; total: number }>;
  porPrestador: Array<{ nome: string; total: number }>;
  sessoesNoMes: number;
  mediaDiasTratamento: number;
  fonte: string;
}

interface Props {
  data: OperacionaisData | null | undefined;
  isLoading: boolean;
  internadosData?: InternadosData | null | undefined;
  loadingInternados?: boolean;
  hemodialiseData?: HemodialiseData | null | undefined;
  loadingHemodialise?: boolean;
}

const CustomTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1 max-w-[250px] truncate">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value?.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
};

const PieTooltipContent = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold max-w-[250px] truncate">{d.name}</p>
      <p>{d.value?.toLocaleString("pt-BR")} atendimentos ({d.payload?.percentual}%)</p>
    </div>
  );
};

// Ranking table component
function RankingTable({
  data,
  title,
}: {
  data: Array<{ codigo: string | null; nome: string; total: number; percentual: number }>;
  title: string;
}) {
  if (!data.length) return null;
  const maxTotal = data[0]?.total || 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">Código</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">{title}</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">Qtd</th>
            <th className="text-right py-2 px-3 font-medium text-muted-foreground">%</th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground w-32">Proporção</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
              <td className="py-2 px-3 font-mono text-xs">{item.codigo || "-"}</td>
              <td className="py-2 px-3 max-w-[200px] truncate" title={item.nome}>{item.nome}</td>
              <td className="py-2 px-3 text-right font-medium">{item.total.toLocaleString("pt-BR")}</td>
              <td className="py-2 px-3 text-right text-muted-foreground">{item.percentual}%</td>
              <td className="py-2 px-3">
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (item.total / maxTotal) * 100)}%`,
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Badge de dias internado com cores
function DiasInternadoBadge({ dias }: { dias: number }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let className = "";
  if (dias >= 30) {
    variant = "destructive";
  } else if (dias >= 14) {
    className = "bg-orange-500/20 text-orange-400 border-orange-500/30";
  } else if (dias >= 7) {
    className = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  } else {
    className = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  }
  return (
    <Badge variant={variant} className={className}>
      {dias} {dias === 1 ? "dia" : "dias"}
    </Badge>
  );
}

// Seção de Pacientes Internados
function PacientesInternadosSection({
  data,
  isLoading,
}: {
  data: InternadosData | null | undefined;
  isLoading: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const pacientesVisiveis = mostrarTodos ? data.pacientes : data.pacientes.slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <BedDouble className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Pacientes Internados
              <Badge variant="destructive" className="text-base px-3 py-0.5">
                {data.totalInternados}
              </Badge>
            </h3>
            <p className="text-sm text-muted-foreground">
              Internações ativas sem data de saída
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="gap-1">
          {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expandido ? "Recolher" : "Expandir"}
        </Button>
      </div>

      {/* KPIs de internados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Internados"
          value={data.totalInternados.toLocaleString("pt-BR")}
          subtitle="Sem data de saída"
          icon={BedDouble}
          gradient="blue"
        />
        <KpiCard
          title="Média de Permanência"
          value={`${data.mediaPermancencia} dias`}
          subtitle="Tempo médio internado"
          icon={Clock}
          gradient="amber"
        />
        <KpiCard
          title="Setores Ocupados"
          value={data.porCentroCusto.length.toLocaleString("pt-BR")}
          subtitle="Centros de custo distintos"
          icon={Building2}
          gradient="violet"
        />
        <KpiCard
          title="Convênios"
          value={data.porConvenio.length.toLocaleString("pt-BR")}
          subtitle="Convênios distintos"
          icon={Heart}
          gradient="emerald"
        />
      </div>

      {/* Detalhes expandíveis */}
      {expandido && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Gráficos: Por Centro de Custo e Por Convênio */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Internados por Setor" icon={Building2}>
              {data.porCentroCusto.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, data.porCentroCusto.length * 32)}>
                  <BarChart
                    data={data.porCentroCusto.slice(0, 10).map(c => ({
                      ...c,
                      nome: c.nome.length > 22 ? c.nome.slice(0, 22) + "..." : c.nome,
                    }))}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltipContent />} />
                    <Bar dataKey="total" name="Internados" radius={[0, 6, 6, 0]}>
                      {data.porCentroCusto.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  Sem dados
                </div>
              )}
            </ChartCard>

            <ChartCard title="Internados por Convênio" icon={Heart}>
              {data.porConvenio.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.porConvenio.slice(0, 8)}
                      dataKey="total"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      paddingAngle={3}
                      label={({ nome, total }) => `${nome.length > 12 ? nome.slice(0, 12) + "..." : nome} (${total})`}
                      labelLine={true}
                    >
                      {data.porConvenio.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0];
                        return (
                          <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-semibold">{d.name}</p>
                            <p>{d.value} internados</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Sem dados
                </div>
              )}
            </ChartCard>
          </div>

          {/* Tabela de pacientes internados */}
          <ChartCard title={`Lista de Pacientes Internados (${data.totalInternados})`} icon={BedDouble}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Atend.</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Convênio</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Setor</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Prestador</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Entrada</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">Permanência</th>
                  </tr>
                </thead>
                <tbody>
                  {pacientesVisiveis.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-mono text-xs">{p.numatend}</td>
                      <td className="py-2 px-3 max-w-[180px] truncate" title={p.paciente}>{p.paciente}</td>
                      <td className="py-2 px-3 max-w-[150px] truncate" title={p.convenio}>{p.convenio}</td>
                      <td className="py-2 px-3 max-w-[150px] truncate" title={p.centroCusto}>{p.centroCusto}</td>
                      <td className="py-2 px-3 max-w-[150px] truncate" title={p.prestador}>{p.prestador}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {new Date(p.dataEntrada).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <DiasInternadoBadge dias={p.diasInternado} />
                      </td>
                    </tr>
                  ))}
                  {data.pacientes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhum paciente internado encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.pacientes.length > 10 && (
              <div className="flex justify-center pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostrarTodos(!mostrarTodos)}
                  className="gap-1"
                >
                  {mostrarTodos ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Ver todos ({data.pacientes.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </ChartCard>
        </motion.div>
      )}
    </motion.div>
  );
}

// Seção de Hemodiálise
function HemodialiseSection({
  data,
  isLoading,
}: {
  data: HemodialiseData | null | undefined;
  isLoading: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.totalPacientes === 0) return null;

  const pacientesVisiveis = mostrarTodos ? data.pacientes : data.pacientes.slice(0, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Droplets className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Hemodiálise
              <Badge className="text-base px-3 py-0.5 bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                {data.totalPacientes} pacientes
              </Badge>
            </h3>
            <p className="text-sm text-muted-foreground">
              Pacientes em tratamento de hemodiálise (PARIII)
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="gap-1">
          {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expandido ? "Recolher" : "Expandir"}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Pacientes Ativos"
          value={data.totalPacientes.toLocaleString("pt-BR")}
          subtitle="Em tratamento"
          icon={Users}
          gradient="blue"
        />
        <KpiCard
          title="Sessões no Mês"
          value={data.sessoesNoMes.toLocaleString("pt-BR")}
          subtitle="Mês atual"
          icon={CalendarClock}
          gradient="emerald"
        />
        <KpiCard
          title="Turnos"
          value={data.porTurno.length.toLocaleString("pt-BR")}
          subtitle="Turnos distintos"
          icon={Clock}
          gradient="violet"
        />
        <KpiCard
          title="Média Tratamento"
          value={`${data.mediaDiasTratamento} dias`}
          subtitle="Tempo médio em tratamento"
          icon={Droplets}
          gradient="amber"
        />
      </div>

      {/* Detalhes expandíveis */}
      {expandido && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Gráficos: Por Turno e Por Prestador */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Pacientes por Turno" icon={Clock}>
              {data.porTurno.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.porTurno}
                      dataKey="total"
                      nameKey="nome"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      paddingAngle={3}
                      label={({ nome, total }) => `${nome} (${total})`}
                      labelLine={true}
                    >
                      {data.porTurno.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0];
                        return (
                          <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-semibold">{d.name}</p>
                            <p>{d.value} pacientes</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Sem dados
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top Prestadores" icon={Stethoscope}>
              {data.porPrestador.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, data.porPrestador.length * 32)}>
                  <BarChart
                    data={data.porPrestador.map(c => ({
                      ...c,
                      nome: c.nome.length > 22 ? c.nome.slice(0, 22) + "..." : c.nome,
                    }))}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltipContent />} />
                    <Bar dataKey="total" name="Pacientes" radius={[0, 6, 6, 0]}>
                      {data.porPrestador.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  Sem dados
                </div>
              )}
            </ChartCard>
          </div>

          {/* Tabela de pacientes hemodiálise */}
          <ChartCard title={`Lista de Pacientes em Hemodiálise (${data.totalPacientes})`} icon={Droplets}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Atend.</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Turno</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Prestador</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Início Tratamento</th>
                    <th className="text-center py-2 px-3 font-medium text-muted-foreground">Dias em Tratamento</th>
                  </tr>
                </thead>
                <tbody>
                  {pacientesVisiveis.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-mono text-xs">{p.numatend}</td>
                      <td className="py-2 px-3 max-w-[200px] truncate" title={p.paciente}>{p.paciente}</td>
                      <td className="py-2 px-3">
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                          {p.turno}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 max-w-[180px] truncate" title={p.prestador}>{p.prestador}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {new Date(p.dataEntrada).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant="secondary">
                          {p.diasTratamento} dias
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {data.pacientes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhum paciente em hemodiálise encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.pacientes.length > 10 && (
              <div className="flex justify-center pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostrarTodos(!mostrarTodos)}
                  className="gap-1"
                >
                  {mostrarTodos ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Ver todos ({data.pacientes.length})
                    </>
                  )}
                </Button>
              </div>
            )}
          </ChartCard>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function AnaliseOperacionalTab({ data, isLoading, internadosData, loadingInternados, hemodialiseData, loadingHemodialise }: Props) {
  // Prepare stacked bar data for Proveniência × Tipo
  const provTipoData = useMemo(() => {
    if (!data?.porProvenienciaTipo?.length) return { chartData: [], tipos: [] };
    const tipos = [...new Set(data.porProvenienciaTipo.map(d => d.tipo))];
    const provs = [...new Set(data.porProvenienciaTipo.map(d => d.proveniencia))];
    const chartData = provs.slice(0, 10).map(prov => {
      const row: any = { proveniencia: prov.length > 20 ? prov.slice(0, 20) + "..." : prov };
      tipos.forEach(tipo => {
        const match = data.porProvenienciaTipo.find(d => d.proveniencia === prov && d.tipo === tipo);
        row[tipo] = match?.total || 0;
      });
      return row;
    });
    return { chartData, tipos };
  }, [data?.porProvenienciaTipo]);

  // Radar data for top 5 especialidades
  const radarData = useMemo(() => {
    if (!data?.porEspecialidade?.length) return [];
    return data.porEspecialidade.slice(0, 8).map(e => ({
      nome: e.nome.length > 15 ? e.nome.slice(0, 15) + "..." : e.nome,
      total: e.total,
      fullName: e.nome,
    }));
  }, [data?.porEspecialidade]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Building2 className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Clique em "Carregar" para visualizar a análise operacional</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ===== PACIENTES INTERNADOS ===== */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <PacientesInternadosSection
          data={internadosData}
          isLoading={loadingInternados || false}
        />
      </div>

      {/* ===== HEMODIÁLISE ===== */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <HemodialiseSection
          data={hemodialiseData}
          isLoading={loadingHemodialise || false}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Centros de Custo"
          value={data.totalCentrosCusto.toLocaleString("pt-BR")}
          icon={Building2}
          gradient="blue"
        />
        <KpiCard
          title="Ocupações (CBO)"
          value={data.totalCbos.toLocaleString("pt-BR")}
          icon={Briefcase}
          gradient="emerald"
        />
        <KpiCard
          title="Proveniências"
          value={data.totalProveniencias.toLocaleString("pt-BR")}
          icon={ArrowRightLeft}
          gradient="violet"
        />
        <KpiCard
          title="Especialidades"
          value={data.totalEspecialidades.toLocaleString("pt-BR")}
          icon={Stethoscope}
          gradient="amber"
        />
      </div>

      {/* Row 1: Centro de Custo + Proveniência */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Centro de Custo - Horizontal Bar */}
        <ChartCard title="Top Centros de Custo" icon={Building2}>
          <ResponsiveContainer width="100%" height={Math.max(300, Math.min(data.porCentroCusto.length * 28, 500))}>
            <BarChart
              data={data.porCentroCusto.slice(0, 15).map(c => ({
                ...c,
                nome: c.nome.length > 25 ? c.nome.slice(0, 25) + "..." : c.nome,
              }))}
              layout="vertical"
              margin={{ left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltipContent />} />
              <Bar dataKey="total" name="Atendimentos" radius={[0, 6, 6, 0]}>
                {data.porCentroCusto.slice(0, 15).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Proveniência - Pie Chart */}
        <ChartCard title="Proveniência dos Pacientes" icon={ArrowRightLeft}>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data.porProveniencia.slice(0, 10)}
                dataKey="total"
                nameKey="nome"
                cx="50%"
                cy="50%"
                outerRadius={110}
                innerRadius={55}
                paddingAngle={3}
                label={({ nome, percentual }) => `${nome.length > 15 ? nome.slice(0, 15) + "..." : nome} (${percentual}%)`}
                labelLine={true}
              >
                {data.porProveniencia.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: CBO + Especialidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CBO - Horizontal Bar */}
        <ChartCard title="Top Ocupações Profissionais (CBO)" icon={Briefcase}>
          <ResponsiveContainer width="100%" height={Math.max(300, Math.min(data.porCbo.length * 28, 500))}>
            <BarChart
              data={data.porCbo.slice(0, 15).map(c => ({
                ...c,
                nome: c.nome.length > 30 ? c.nome.slice(0, 30) + "..." : c.nome,
              }))}
              layout="vertical"
              margin={{ left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="nome" width={200} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltipContent />} />
              <Bar dataKey="total" name="Atendimentos" radius={[0, 6, 6, 0]}>
                {data.porCbo.slice(0, 15).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Especialidade - Radar */}
        <ChartCard title="Especialidades Médicas" icon={Stethoscope}>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="nome" tick={{ fontSize: 10, fill: "currentColor" }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar
                  name="Atendimentos"
                  dataKey="total"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
                <Tooltip content={<CustomTooltipContent />} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              Sem dados de especialidade
            </div>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Proveniência × Tipo de Atendimento */}
      {provTipoData.chartData.length > 0 && (
        <ChartCard title="Proveniência por Tipo de Atendimento" icon={Layers}>
          <ResponsiveContainer width="100%" height={Math.max(300, provTipoData.chartData.length * 35)}>
            <BarChart data={provTipoData.chartData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="proveniencia" width={160} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltipContent />} />
              <Legend />
              {provTipoData.tipos.map((tipo, i) => (
                <Bar key={tipo} dataKey={tipo} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Ranking Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Ranking - Centros de Custo" icon={Building2}>
          <RankingTable data={data.porCentroCusto} title="Centro de Custo" />
        </ChartCard>

        <ChartCard title="Ranking - Especialidades" icon={Stethoscope}>
          <RankingTable data={data.porEspecialidade} title="Especialidade" />
        </ChartCard>
      </div>

      {/* Fonte */}
      <p className="text-xs text-muted-foreground text-right">
        Fonte: {data.fonte === "cache_local" ? "Cache local" : "PostgreSQL direto"}
      </p>
    </motion.div>
  );
}
