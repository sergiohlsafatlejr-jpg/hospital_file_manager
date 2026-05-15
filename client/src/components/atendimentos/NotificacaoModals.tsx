/**
 * Modais de notificação reutilizáveis — Individual e em Lote
 * Consolida lógica duplicada de 4 páginas em componentes reutilizáveis
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Send, Mail, Bell, FileText } from "lucide-react";
import {
  type NotificacaoLinha,
  MOTIVOS,
  SETORES,
  MEDICOS,
} from "@/lib/atendimentosConstants";

// ===== Editor de Linhas de Notificação =====
interface LinhasEditorProps {
  linhas: NotificacaoLinha[];
  setLinhas: React.Dispatch<React.SetStateAction<NotificacaoLinha[]>>;
}

export function NotificacaoLinhasEditor({ linhas, setLinhas }: LinhasEditorProps) {
  function adicionarLinha() {
    setLinhas(prev => [...prev, { motivo: "", setor: "", medico: "" }]);
  }

  function removerLinha(index: number) {
    if (linhas.length > 1) {
      setLinhas(prev => prev.filter((_, i) => i !== index));
    }
  }

  function atualizarLinha(index: number, campo: keyof NotificacaoLinha, valor: string) {
    setLinhas(prev => prev.map((l, i) => i === index ? { ...l, [campo]: valor } : l));
  }

  return (
    <div className="space-y-3">
      {linhas.map((linha, i) => (
        <div key={i} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Motivo</label>
            <Select value={linha.motivo} onValueChange={v => atualizarLinha(i, "motivo", v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
            <Select value={linha.setor} onValueChange={v => atualizarLinha(i, "setor", v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SETORES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Médico</label>
            <Select value={linha.medico} onValueChange={v => atualizarLinha(i, "medico", v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {MEDICOS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {linhas.length > 1 && (
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removerLinha(i)}>
              <X className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-1" onClick={adicionarLinha}>
        <Plus className="w-3 h-3" /> Adicionar Motivo
      </Button>
    </div>
  );
}

// ===== Modal de Notificação Individual =====
interface NotificacaoModalProps {
  aberto: boolean;
  onFechar: () => void;
  atendimento: { numatend: string; nomepac: string } | null;
  linhas: NotificacaoLinha[];
  setLinhas: React.Dispatch<React.SetStateAction<NotificacaoLinha[]>>;
  observacao: string;
  setObservacao: (v: string) => void;
  onAplicar: () => void;
  isLoading?: boolean;
}

export function NotificacaoModal({
  aberto, onFechar, atendimento,
  linhas, setLinhas, observacao, setObservacao,
  onAplicar, isLoading,
}: NotificacaoModalProps) {
  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            Notificar Atendimento
          </DialogTitle>
          {atendimento && (
            <p className="text-sm text-muted-foreground">
              Nº {atendimento.numatend} — {atendimento.nomepac}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <NotificacaoLinhasEditor linhas={linhas} setLinhas={setLinhas} />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observação *</label>
            <Textarea
              placeholder="Descreva o motivo da notificação..."
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            onClick={onAplicar}
            disabled={isLoading || !observacao.trim()}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            <Send className="w-4 h-4" />
            {isLoading ? "Salvando..." : "Registrar Notificação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Modal de Notificação em Lote =====
interface NotificacaoLoteModalProps {
  aberto: boolean;
  onFechar: () => void;
  qtdSelecionados: number;
  linhas: NotificacaoLinha[];
  setLinhas: React.Dispatch<React.SetStateAction<NotificacaoLinha[]>>;
  observacao: string;
  setObservacao: (v: string) => void;
  onAplicar: () => void;
  isLoading?: boolean;
}

export function NotificacaoLoteModal({
  aberto, onFechar, qtdSelecionados,
  linhas, setLinhas, observacao, setObservacao,
  onAplicar, isLoading,
}: NotificacaoLoteModalProps) {
  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            Notificação em Lote — {qtdSelecionados} atendimento{qtdSelecionados !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <NotificacaoLinhasEditor linhas={linhas} setLinhas={setLinhas} />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observação *</label>
            <Textarea
              placeholder="Descreva o motivo da notificação em lote..."
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            onClick={onAplicar}
            disabled={isLoading || !observacao.trim()}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            <Send className="w-4 h-4" />
            {isLoading ? "Salvando..." : `Notificar ${qtdSelecionados} atendimento${qtdSelecionados !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Seção de Email =====
interface EmailSectionProps {
  expandido: boolean;
  setExpandido: (v: boolean) => void;
  destinatario: string;
  setDestinatario: (v: string) => void;
  mensagem: string;
  setMensagem: (v: string) => void;
  onEnviar: () => void;
  isLoading?: boolean;
  qtdSelecionados: number;
}

export function EmailSection({
  expandido, setExpandido,
  destinatario, setDestinatario,
  mensagem, setMensagem,
  onEnviar, isLoading, qtdSelecionados,
}: EmailSectionProps) {
  if (!expandido) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setExpandido(true)}
        disabled={qtdSelecionados === 0}
      >
        <Mail className="w-4 h-4" />
        Enviar por E-mail ({qtdSelecionados})
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Enviar notificação por e-mail
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandido(false)}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="email@destinatario.com"
          value={destinatario}
          onChange={e => setDestinatario(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          className="gap-1 bg-blue-600 hover:bg-blue-700"
          onClick={onEnviar}
          disabled={isLoading}
        >
          <Send className="w-3 h-3" />
          {isLoading ? "Enviando..." : "Enviar"}
        </Button>
      </div>
      <Textarea
        placeholder="Mensagem personalizada (opcional)"
        value={mensagem}
        onChange={e => setMensagem(e.target.value)}
        rows={2}
        className="text-sm"
      />
    </div>
  );
}
