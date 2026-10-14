import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

type Resultado =
  | "conectado"
  | "configuracao_pendente"
  | "falha_conexao";

const mensagens: Record<Resultado, { titulo: string; descricao: string }> = {
  conectado: {
    titulo: "Conexão validada nesta sessão",
    descricao:
      "TLS com verificação e SELECT 1 passaram em transação somente leitura. Credenciais administrativas são aceitas porque o EASYLocal é somente origem; o Portal não administra nem escreve no PostgreSQL.",
  },
  configuracao_pendente: {
    titulo: "Configuração pendente",
    descricao:
      "Os parâmetros necessários ainda não estão completos no backend. Solicite o ajuste pelo canal seguro de segredos.",
  },
  falha_conexao: {
    titulo: "Não foi possível validar a conexão",
    descricao:
      "Confira com o TI a rede, o certificado TLS, a role e a disponibilidade do banco. Nenhum detalhe técnico sensível é exibido aqui.",
  },
};

export function EasyLocalTab({
  estabelecimentoId,
  modoCatalogo = false,
}: {
  estabelecimentoId: number | null;
  modoCatalogo?: boolean;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const preparacao = trpc.easyLocal.obterPreparacao.useQuery(
    {},
    { retry: false }
  );
  const teste = trpc.easyLocal.testarConexao.useMutation({
    onSuccess: data => setResultado(data.status),
    onError: () => setResultado("falha_conexao"),
  });
  const piloto = preparacao.data?.piloto;
  const unidadeCorreta =
    modoCatalogo ? !!estabelecimentoId : !!piloto && estabelecimentoId === piloto.estabelecimentoId;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-900 dark:bg-sky-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="h-5 w-5" /> EASYLocal · conexão da empresa
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {modoCatalogo ? "A configuração central fica salva nos segredos do servidor. Cada consulta de metadados abre uma conexão validada; não é necessário testar manualmente antes de cada operação." : <>Hospitais alimentam o EASYLocal; o Portal fará a leitura das
              fontes aprovadas em uma fase posterior. Agora é possível apenas
              testar a conexão do backend.</>}
            </p>
          </div>
          <Badge variant="outline">Preparação · sem sincronização</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5" /> Conexão PostgreSQL
            </CardTitle>
            <CardDescription>
              Configuração mantida exclusivamente nos segredos do servidor; a
              tela não recebe host, usuário, senha ou certificado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preparacao.isLoading ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando
                configuração…
              </span>
            ) : preparacao.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Não foi possível obter o estado da configuração. Recarregue a
                  página ou confira seu acesso administrativo.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm">
                <span className="font-medium">Configuração: </span>
                {preparacao.data?.configuracaoDisponivel
                  ? (modoCatalogo ? "salva no servidor; teste manual opcional" : "presente no servidor (conexão ainda não testada nesta sessão)")
                  : "incompleta no servidor"}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={
                !preparacao.data?.configuracaoDisponivel ||
                !unidadeCorreta ||
                teste.isPending
              }
              onClick={() => {
                setResultado(null);
                teste.mutate({});
              }}
            >
              {teste.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Testar conexão (SELECT 1)
            </Button>
            {resultado && unidadeCorreta && (
              <Alert
                variant={resultado === "conectado" ? "default" : "destructive"}
                role="status"
              >
                {resultado === "conectado" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <strong>{mensagens[resultado].titulo}.</strong>{" "}
                  {mensagens[resultado].descricao}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {modoCatalogo ? <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-5 w-5" /> Conexão central e isolamento</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>As credenciais não são copiadas para as tabelas de configuração. O cadastro de leitura guarda somente uma referência ao EASYLocal do servidor.</p>
            <p>Credenciais administrativas são aceitas. O EASYLocal é somente origem: o Portal consulta metadados em transações de leitura e não administra nem escreve no PostgreSQL.</p>
            <p>Novas tabelas são isoladas pela unidade selecionada. Leituras exigem coluna e identificador do estabelecimento na origem.</p>
            <p>O teste opcional não importa dados e não ativa tarefas. Falhas de rede não apagam a configuração salva.</p>
          </CardContent>
        </Card> : <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LockKeyhole className="h-5 w-5" /> Piloto · Hospital Urológico
            </CardTitle>
            <CardDescription>
              O contexto do estabelecimento só prepara a futura configuração.
              Ainda não associa registros do EASYLocal à unidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Unidade selecionada:{" "}
              <strong>
                {unidadeCorreta
                  ? "Hospital Urológico"
                  : "selecione Hospital Urológico no topo da página"}
              </strong>
            </p>
            <p>
              Credencial PostgreSQL: <strong>aceita, inclusive administrativa</strong>{" "}
              — o EASYLocal permanece somente como origem de leitura.
            </p>
            <p>
              View de consumo e mapeamento por unidade:{" "}
              <strong>não aprovados</strong>.
            </p>
            <p>
              Leitura de linhas, cadastro de queries e sincronização:{" "}
              <strong>indisponíveis neste piloto</strong>.
            </p>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Não use as abas legadas para cadastrar a conexão EASYLocal. Elas
                têm fluxos e permissões próprios, não participam deste piloto.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Próximas etapas (não ativadas)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <p>
            <strong>1. TI:</strong> TLS e view final com isolamento da unidade.
          </p>
          <p>
            <strong>2. Validação:</strong> metadados de colunas, chave e
            competência, sem amostra de linhas.
          </p>
          <p>
            <strong>3. Publicação:</strong> staging, conferência e snapshot após
            aprovação separada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
