import { useEffect, useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { toast } from "sonner";

export interface MotorRegrasAlert {
  id: string;
  tipo: "critico" | "alto" | "medio" | "baixo";
  titulo: string;
  mensagem: string;
  timestamp: Date;
  lido: boolean;
}

interface UseMotorRegrasNotificationsOptions {
  enabled?: boolean;
  intervalMs?: number; // Intervalo de polling em ms (padrão: 30 segundos)
  showToast?: boolean; // Mostrar toast para alertas críticos (padrão: true)
}

export function useMotorRegrasNotifications(options: UseMotorRegrasNotificationsOptions = {}) {
  const {
    enabled = true,
    intervalMs = 30000,
    showToast = true,
  } = options;

  const { estabelecimentoAtual } = useEstabelecimento();
  const estabelecimentoId = estabelecimentoAtual?.id;

  const [alerts, setAlerts] = useState<MotorRegrasAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastAlertsRef = useRef<string>("");

  // Query para obter estatísticas - desabilitar se estabelecimentoId for inválido
  const isValidEstabelecimento = !!(estabelecimentoId && estabelecimentoId > 0 && estabelecimentoId < 1000000);
  const { data: stats, refetch: refetchStats } = trpc.motorRegras.obterEstatisticas.useQuery(
    {
      estabelecimentoId: estabelecimentoId || 1,
    },
    {
      enabled: isValidEstabelecimento && enabled,
      staleTime: intervalMs,
    }
  );

  // Gerar alertas baseado nas estatísticas
  const generateAlerts = useCallback((newStats: any) => {
    const newAlerts: MotorRegrasAlert[] = [];

    if (!newStats) return newAlerts;

    // Alerta crítico: Taxa de conformidade muito baixa
    if (newStats.taxaConformidade < 70) {
      newAlerts.push({
        id: "conformidade-critica",
        tipo: "critico",
        titulo: "Taxa de Conformidade Crítica",
        mensagem: `Taxa de conformidade está em ${newStats.taxaConformidade.toFixed(1)}%. Recomenda-se ação imediata.`,
        timestamp: new Date(),
        lido: false,
      });
    } else if (newStats.taxaConformidade < 80) {
      newAlerts.push({
        id: "conformidade-alta",
        tipo: "alto",
        titulo: "Taxa de Conformidade Baixa",
        mensagem: `Taxa de conformidade está em ${newStats.taxaConformidade.toFixed(1)}%. Monitore de perto.`,
        timestamp: new Date(),
        lido: false,
      });
    }

    // Alerta crítico: Muitas contas inválidas
    if (newStats.contasInvalidas > 100) {
      newAlerts.push({
        id: "contas-invalidas-critica",
        tipo: "critico",
        titulo: "Alto Volume de Contas Inválidas",
        mensagem: `${newStats.contasInvalidas} contas inválidas detectadas. Investigação recomendada.`,
        timestamp: new Date(),
        lido: false,
      });
    } else if (newStats.contasInvalidas > 50) {
      newAlerts.push({
        id: "contas-invalidas-alta",
        tipo: "alto",
        titulo: "Volume Elevado de Contas Inválidas",
        mensagem: `${newStats.contasInvalidas} contas inválidas. Verifique padrões de erro.`,
        timestamp: new Date(),
        lido: false,
      });
    }

    // Alerta: Score de conformidade baixo
    if (newStats.scoreConformidadeMedia < 50) {
      newAlerts.push({
        id: "score-baixo",
        tipo: "alto",
        titulo: "Score de Conformidade Baixo",
        mensagem: `Score médio de conformidade é ${newStats.scoreConformidadeMedia.toFixed(0)}. Treinamento recomendado.`,
        timestamp: new Date(),
        lido: false,
      });
    }

    return newAlerts;
  }, []);

  // Polling automático
  useEffect(() => {
    if (!enabled || !estabelecimentoId) return;

    const interval = setInterval(async () => {
      try {
        await refetchStats();
      } catch (error) {
        console.error("Erro ao fazer polling de alertas:", error);
      }
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, estabelecimentoId, intervalMs, refetchStats]);

  // Atualizar alertas quando stats mudar
  useEffect(() => {
    if (!stats) return;

    const newAlerts = generateAlerts(stats);
    const alertsJson = JSON.stringify(newAlerts);

    // Evitar atualizar se os alertas são iguais
    if (lastAlertsRef.current === alertsJson) {
      return;
    }

    lastAlertsRef.current = alertsJson;
    setAlerts(newAlerts);

    // Contar alertas não lidos
    const unread = newAlerts.filter((a) => !a.lido).length;
    setUnreadCount(unread);

    // Mostrar toast para alertas críticos
    if (showToast) {
      newAlerts.forEach((alert) => {
        if (alert.tipo === "critico") {
          toast.error(alert.titulo, {
            description: alert.mensagem,
            duration: 5000,
          });
        } else if (alert.tipo === "alto") {
          toast.warning(alert.titulo, {
            description: alert.mensagem,
            duration: 5000,
          });
        }
      });
    }
  }, [stats, generateAlerts, showToast]);

  // Marcar alerta como lido
  const markAsRead = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, lido: true } : alert
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Limpar todos os alertas
  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadCount(0);
  }, []);

  // Forçar refresh de alertas
  const refresh = useCallback(async () => {
    await refetchStats();
  }, [refetchStats]);

  return {
    alerts,
    unreadCount,
    markAsRead,
    clearAllAlerts,
    refresh,
    isLoading: !stats,
  };
}
