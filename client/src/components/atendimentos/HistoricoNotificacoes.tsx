/**
 * Aba de Histórico de Notificações geradas
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Clock } from "lucide-react";
import { formatDateBR } from "@/lib/dateUtils";
import { type NotificacaoLinha, getMotivoLabel } from "@/lib/atendimentosConstants";
import { gerarPDFAtendimentos } from "@/lib/atendimentosPdfGenerator";
import { toast } from "sonner";

interface HistoricoItem {
  id: string;
  data: Date;
  qtdAtendimentos: number;
  atendimentos: any[];
  notificacoes: NotificacaoLinha[];
  observacao: string;
  usuario: string;
}

interface HistoricoProps {
  notificacoes: HistoricoItem[];
  isTasyLayout: boolean;
}

export function HistoricoNotificacoes({ notificacoes, isTasyLayout }: HistoricoProps) {
  async function baixarPDF(notif: HistoricoItem) {
    try {
      toast.info("Gerando PDF...");
      const doc = await gerarPDFAtendimentos(
        notif.atendimentos,
        notif.notificacoes,
        notif.observacao,
        { isTasy: isTasyLayout, titulo: "HISTÓRICO DE NOTIFICAÇÃO" }
      );
      const dataStr = notif.data.toLocaleDateString("pt-BR").replace(/\//g, "-");
      doc.save(`notificacao_${dataStr}_${notif.qtdAtendimentos}_atendimentos.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) {
      toast.error("Erro ao gerar PDF");
      console.error(err);
    }
  }

  if (notificacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">Nenhuma notificação gerada ainda</p>
        <p className="text-sm mt-1">
          Selecione atendimentos e clique em "Notificar em Lote" para criar uma notificação
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notificacoes.map((notif) => (
        <Card key={notif.id} className="hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {notif.data.toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {notif.qtdAtendimentos} atendimento{notif.qtdAtendimentos !== 1 ? "s" : ""}
                  </Badge>
                </div>
                {notif.observacao && (
                  <p className="text-sm text-muted-foreground pl-6">{notif.observacao}</p>
                )}
                {notif.notificacoes.length > 0 && notif.notificacoes.some(n => n.motivo) && (
                  <div className="flex flex-wrap gap-1 pl-6 mt-1">
                    {notif.notificacoes.filter(n => n.motivo).map((n, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {getMotivoLabel(n.motivo)}
                      </Badge>
                    ))}
                  </div>
                )}
                {notif.usuario && (
                  <p className="text-xs text-muted-foreground pl-6">por {notif.usuario}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => baixarPDF(notif)}
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
