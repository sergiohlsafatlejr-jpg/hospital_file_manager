import { useAuth } from "@/_core/hooks/useAuth";
import { EasyLocalIntegradorTabs } from "@/components/integrador/EasyLocalIntegradorTabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";

/** A área administrativa protege a consulta de contexto e todos os hooks das abas do integrador. */
export function IntegradorEasyLocal() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando integrador…
      </p>
    );
  }
  if (user?.role !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          O Integrador EASYLocal é restrito a administradores.
        </AlertDescription>
      </Alert>
    );
  }

  return <IntegradorEasyLocalConteudo />;
}

function IntegradorEasyLocalConteudo() {
  const { estabelecimentoAtual } = useEstabelecimento();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Integrador de Dados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conexão EASYLocal e preparação controlada de tabelas e leituras
        </p>
      </header>
      <EasyLocalIntegradorTabs
        key={estabelecimentoAtual?.id ?? "sem-unidade"}
        estabelecimentoId={estabelecimentoAtual?.id ?? null}
      />
      <p className="text-xs text-muted-foreground">
        As integrações anteriores permanecem separadas em{" "}
        <Link href="/integracao-legado" className="underline">
          Integrador legado
        </Link>
        ; seus cadastros não configuram o EASYLocal.
      </p>
    </div>
  );
}
