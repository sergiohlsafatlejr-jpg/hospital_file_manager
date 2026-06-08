import DashboardLayout from "@/components/DashboardLayout";
import DashboardHome from "./DashboardHome";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { formatDateBR, safeParseDate } from "@/lib/dateUtils";
import {
  Info,
  AlertTriangle,
  AlertCircle,
  X,
  Newspaper,
  ExternalLink,
  Clock,
  Megaphone,
} from "lucide-react";

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getCategoriaColor(categoria: string): string {
  switch (categoria) {
    case "Faturamento Hospitalar": return "bg-blue-100 text-blue-700";
    case "Gestão Hospitalar": return "bg-emerald-100 text-emerald-700";
    case "Regulação ANS": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function Inicio() {
  // Avisos internos
  const { data: avisosAtivos } = trpc.avisosInternos.listarAtivos.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  // Notícias do setor
  const { data: noticias, isLoading: noticiasLoading } = trpc.noticias.listar.useQuery(undefined, {
    refetchInterval: 30 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });

  const [avisosFechados, setAvisosFechados] = useState<number[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("avisos_fechados");
      if (stored) {
        setAvisosFechados(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  const fecharAviso = (id: number) => {
    const novos = [...avisosFechados, id];
    setAvisosFechados(novos);
    localStorage.setItem("avisos_fechados", JSON.stringify(novos));
  };

  const avisosVisiveis = avisosAtivos?.filter(a => !avisosFechados.includes(a.id)) || [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Dashboard com dados importantes */}
        <DashboardHome />

        {/* Avisos Internos */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-100">
              <Megaphone className="h-5 w-5 text-amber-700" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Comunicados da Empresa</h2>
          </div>

          {avisosVisiveis.length > 0 ? (
            <div className="space-y-3">
              {avisosVisiveis.map((aviso) => {
                const isUrgente = aviso.tipo === "urgente";
                const isAlerta = aviso.tipo === "alerta";
                const bgClass = isUrgente
                  ? "bg-red-50 border-red-300"
                  : isAlerta
                  ? "bg-amber-50 border-amber-300"
                  : "bg-blue-50 border-blue-300";
                const textClass = isUrgente
                  ? "text-red-800"
                  : isAlerta
                  ? "text-amber-800"
                  : "text-blue-800";
                const IconComponent = isUrgente
                  ? AlertCircle
                  : isAlerta
                  ? AlertTriangle
                  : Info;

                return (
                  <div
                    key={aviso.id}
                    className={`relative rounded-lg border-l-4 p-4 ${bgClass} shadow-sm animate-in fade-in slide-in-from-top-2 duration-300`}
                  >
                    <button
                      onClick={() => fecharAviso(aviso.id)}
                      className={`absolute top-3 right-3 p-1 rounded-full hover:bg-black/10 transition-colors ${textClass}`}
                      title="Fechar aviso"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-start gap-3 pr-8">
                      <IconComponent className={`h-5 w-5 mt-0.5 flex-shrink-0 ${textClass}`} />
                      <div>
                        <h4 className={`font-semibold text-sm ${textClass}`}>{aviso.titulo}</h4>
                        <p className={`text-sm mt-1 ${textClass} opacity-80 whitespace-pre-wrap`}>{aviso.conteudo}</p>
                        <p className={`text-xs mt-2 ${textClass} opacity-50`}>
                          {safeParseDate(aviso.createdAt)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) || "-"}
                          {aviso.criadoPorNome && ` — ${aviso.criadoPorNome}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="border-0 shadow-sm bg-muted/30">
              <CardContent className="text-center py-8">
                <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-base font-medium text-foreground mb-1">Nenhum comunicado ativo</h4>
                <p className="text-muted-foreground text-sm">Quando houver avisos da empresa, eles aparecerão aqui.</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Notícias do Setor */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Newspaper className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Notícias do Setor</h2>
              <p className="text-muted-foreground text-sm">Últimas notícias sobre saúde, faturamento hospitalar e regulação</p>
            </div>
          </div>

          {noticiasLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-5 w-full mb-2" />
                    <Skeleton className="h-5 w-3/4 mb-4" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : noticias && noticias.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {noticias.map((noticia, index) => (
                <a
                  key={index}
                  href={noticia.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <Card className="border-0 shadow-sm h-full transition-all group-hover:shadow-md group-hover:scale-[1.01] group-hover:border-primary/30">
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoriaColor(noticia.categoria)}`}>
                          {noticia.categoria}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-foreground leading-snug mb-3 line-clamp-3 group-hover:text-primary transition-colors flex-1">
                        {noticia.titulo}
                      </h4>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-3 border-t border-border/50">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {noticia.fonte && (
                            <span className="truncate font-medium">{noticia.fonte}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimeAgo(noticia.dataPublicacao)}</span>
                          <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="text-center py-8">
                <Newspaper className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-base font-medium text-foreground mb-1">Nenhuma notícia disponível</h4>
                <p className="text-muted-foreground text-sm">As notícias serão carregadas automaticamente.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
