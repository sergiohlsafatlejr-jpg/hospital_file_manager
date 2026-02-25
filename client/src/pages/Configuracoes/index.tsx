import { useMemo } from "react";
import ConfiguracoesGeral from "./ConfiguracoesGeral";
import ConfiguracoesIntegracao from "./ConfiguracoesIntegracao";
import ConfiguracoesUsuarios from "./ConfiguracoesUsuarios";
import ConfiguracoesNotificacoes from "./ConfiguracoesNotificacoes";
import ConfiguracoesBackup from "./ConfiguracoesBackup";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

const routeMap: Record<string, React.ComponentType> = {
  "integracao": ConfiguracoesIntegracao,
  "usuarios": ConfiguracoesUsuarios,
  "notificacoes": ConfiguracoesNotificacoes,
  "backup": ConfiguracoesBackup,
  "geral": ConfiguracoesGeral,
};

export default function Configuracoes() {
  const [location] = useLocation();
  
  // Extrair o segmento da subpágina da URL
  // useLocation pode retornar a rota relativa ou absoluta dependendo do contexto do wouter
  const subPage = useMemo(() => {
    const pathname = window.location.pathname;
    const segments = pathname.split("/").filter(Boolean);
    // URL: /configuracoes/usuarios -> segments: ["configuracoes", "usuarios"]
    if (segments.length >= 2 && segments[0] === "configuracoes") {
      return segments[1];
    }
    return "geral";
  }, [location]); // location como dependência para re-renderizar quando muda

  const Component = routeMap[subPage] || ConfiguracoesGeral;

  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}
