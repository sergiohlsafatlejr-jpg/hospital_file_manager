import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { EasyLocalTab } from "@/components/integrador/EasyLocalTab";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";

/** O EASYLocal é global na fase de conexão; a unidade selecionada é apenas contexto visual do piloto. */
export function IntegradorEasyLocal() {
  const { user, loading } = useAuth();
  const { estabelecimentoAtual } = useEstabelecimento();

  if (loading)
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando integrador…
      </p>
    );
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

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Integrador de Dados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conexão EASYLocal · preparação para o piloto Hospital Urológico
        </p>
      </header>
      <EasyLocalTab
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
