import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Edit3,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  easyLocalCadastroInput,
  type EasyLocalCadastroInput,
  type EasyLocalCadastroPublico,
} from "@shared/easyLocalCadastro";

type ResultadoTeste =
  | "conectado"
  | "configuracao_pendente"
  | "credencial_privilegiada"
  | "falha_conexao";

type FormularioCadastro = {
  nome: string;
  descricao: string;
  host: string;
  porta: string;
  banco: string;
  usuario: string;
  senha: string;
  tls: "system" | "custom";
  certificado: string;
};

const resultadoTeste: Record<
  ResultadoTeste,
  { titulo: string; descricao: string; sucesso?: boolean }
> = {
  conectado: {
    titulo: "Conexão validada",
    descricao:
      "A conexão e a role de leitura foram verificadas sem consultar registros ou iniciar importações.",
    sucesso: true,
  },
  configuracao_pendente: {
    titulo: "Configuração pendente",
    descricao:
      "Revise os dados necessários e tente novamente. Nenhum detalhe sensível é exibido.",
  },
  credencial_privilegiada: {
    titulo: "Role com privilégios excessivos",
    descricao:
      "O teste bloqueou esta role. Solicite ao TI uma role dedicada somente leitura antes de prosseguir.",
  },
  falha_conexao: {
    titulo: "Não foi possível validar a conexão",
    descricao:
      "Confira com o TI a rede, o TLS e a disponibilidade do banco. Nenhum detalhe técnico sensível é exibido.",
  },
};

function novoFormulario(
  cadastro?: EasyLocalCadastroPublico
): FormularioCadastro {
  const configuracao = cadastro?.configuracao;
  return {
    nome: configuracao?.nome ?? "",
    descricao: configuracao?.descricao ?? "",
    host: configuracao?.host ?? "",
    porta: configuracao ? String(configuracao.porta) : "5432",
    banco: configuracao?.banco ?? "",
    usuario: configuracao?.usuario ?? "",
    senha: "",
    tls: configuracao?.tls ?? "system",
    certificado: "",
  };
}

function resumoOrigem(origem: EasyLocalCadastroPublico["origem"]): string {
  if (origem === "banco") return "Cadastro central salvo";
  if (origem === "servidor") return "Configuração disponível no servidor";
  return "Nenhuma conexão central cadastrada";
}

export function EasyLocalConexaoCadastro({
  onCadastroSalvo,
}: {
  onCadastroSalvo?: () => void;
}) {
  const utils = trpc.useUtils();
  const cadastro = trpc.easyLocal.obterCadastro.useQuery({}, { retry: false });
  const [aberto, setAberto] = useState(false);
  const [revisaoAberta, setRevisaoAberta] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioCadastro>(() =>
    novoFormulario()
  );
  const [formularioInicializado, setFormularioInicializado] = useState(false);
  const [confirmouCentral, setConfirmouCentral] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoTeste | null>(null);

  const configuracao = cadastro.data?.configuracao;
  const senhaConfigurada = configuracao?.senhaConfigurada === true;
  const certificadoConfigurado = configuracao?.certificadoConfigurado === true;

  useEffect(() => {
    if (!aberto || formularioInicializado || !cadastro.data) return;
    setFormulario(novoFormulario(cadastro.data));
    setRevisaoAberta(cadastro.data?.revisao ?? null);
    setFormularioInicializado(true);
  }, [aberto, cadastro.data, formularioInicializado]);

  function limparFormulario() {
    setFormulario(novoFormulario());
    setFormularioInicializado(false);
    setConfirmouCentral(false);
    setErroFormulario(null);
    setResultado(null);
  }

  function fecharModal() {
    salvarCadastro.reset();
    testarRascunho.reset();
    setAberto(false);
    limparFormulario();
  }

  function abrirModal() {
    setErroFormulario(null);
    setResultado(null);
    setFormulario(novoFormulario(cadastro.data));
    setRevisaoAberta(cadastro.data?.revisao ?? null);
    setFormularioInicializado(Boolean(cadastro.data));
    setAberto(true);
  }

  function atualizarFormulario(campo: keyof FormularioCadastro, valor: string) {
    setFormulario(atual => ({ ...atual, [campo]: valor }));
    setErroFormulario(null);
    setResultado(null);
  }

  function prepararEntrada(): EasyLocalCadastroInput | null {
    const rascunho = {
      nome: formulario.nome.trim(),
      descricao: formulario.descricao.trim(),
      tipo: "postgresql" as const,
      host: formulario.host.trim(),
      porta: Number(formulario.porta),
      banco: formulario.banco.trim(),
      usuario: formulario.usuario.trim(),
      ...(formulario.senha ? { senha: formulario.senha } : {}),
      tls: formulario.tls,
      ...(formulario.certificado
        ? { certificado: formulario.certificado }
        : {}),
      revisao: revisaoAberta,
      // O contrato exige o aceite no payload, mas o bloqueio visual é aplicado somente ao salvar.
      confirmarConexaoCentral: true as const,
    };
    const validacao = easyLocalCadastroInput.safeParse(rascunho);
    if (!validacao.success) {
      setErroFormulario(
        "Revise os campos obrigatórios antes de testar ou salvar a conexão."
      );
      return null;
    }
    if (!senhaConfigurada && !formulario.senha) {
      setErroFormulario(
        "Informe a senha para esta nova conexão antes de testar."
      );
      return null;
    }
    if (
      formulario.tls === "custom" &&
      !certificadoConfigurado &&
      !formulario.certificado
    ) {
      setErroFormulario(
        "Informe o certificado PEM para usar TLS com certificado próprio."
      );
      return null;
    }
    return validacao.data;
  }

  // O gc imediato e o reset ao fechar evitam reter variáveis sensíveis no cache
  // de mutações depois que o formulário deixa de estar em uso.
  const salvarCadastro = trpc.easyLocal.salvarCadastro.useMutation({
    gcTime: 0,
    onSuccess: async () => {
      fecharModal();
      onCadastroSalvo?.();
      await Promise.allSettled([
        utils.easyLocal.obterCadastro.invalidate(),
        utils.easyLocal.obterPreparacao.invalidate(),
        utils.easyLocalIntegrador.listarOrigens.invalidate(),
      ]);
    },
    onError: erro => {
      setErroFormulario(
        erro.data?.code === "CONFLICT"
          ? "O cadastro mudou em outra sessão. Feche e atualize o cadastro antes de tentar novamente."
          : "O salvamento não foi confirmado. Feche e confira a conexão cadastrada antes de repetir."
      );
    },
  });

  const testarRascunho = trpc.easyLocal.testarRascunho.useMutation({
    gcTime: 0,
    onSuccess: resposta => {
      setResultado(resposta.status);
      setErroFormulario(null);
    },
    onError: () => {
      setResultado("falha_conexao");
    },
    onSettled: (): void => {
      testarRascunho.reset();
    },
  });

  const testarConexao = trpc.easyLocal.testarConexao.useMutation({
    onSuccess: resposta => setResultado(resposta.status),
    onError: () => setResultado("falha_conexao"),
  });

  function testarDados() {
    const entrada = prepararEntrada();
    if (!entrada) return;
    setResultado(null);
    testarRascunho.mutate(entrada);
  }

  function salvar() {
    if (!confirmouCentral) {
      setErroFormulario(
        "Confirme que esta é a conexão central antes de salvar."
      );
      return;
    }
    if (!cadastro.data?.chaveDisponivel) return;
    const entrada = prepararEntrada();
    if (!entrada) return;
    salvarCadastro.mutate(entrada);
  }

  const resultadoAtual = resultado ? resultadoTeste[resultado] : null;
  const podeTestar = !testarRascunho.isPending && !salvarCadastro.isPending;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5" /> Conexão central EASYLocal
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Cadastre uma única conexão PostgreSQL central para as leituras
              EASYLocal. Este cadastro não ativa importações.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={abrirModal}
            disabled={cadastro.isLoading}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            {configuracao ? "Editar" : "Configurar"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {cadastro.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando conexão
              central…
            </p>
          ) : cadastro.isError ? (
            <AlertaErro
              mensagem="Não foi possível obter o cadastro da conexão central. Tente novamente."
              aoTentarNovamente={() => cadastro.refetch()}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={configuracao ? "secondary" : "outline"}>
                  {resumoOrigem(cadastro.data?.origem ?? "ausente")}
                </Badge>
                <Badge variant="outline">Uma conexão central</Badge>
                <Badge variant="outline">Sem importações ativas</Badge>
              </div>
              {configuracao ? (
                <dl className="grid gap-x-6 gap-y-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <ResumoCampo rotulo="Nome" valor={configuracao.nome} />
                  <ResumoCampo
                    rotulo="Servidor"
                    valor={`${configuracao.host}:${configuracao.porta}`}
                  />
                  <ResumoCampo rotulo="Banco" valor={configuracao.banco} />
                  <ResumoCampo rotulo="Usuário" valor={configuracao.usuario} />
                  <ResumoCampo
                    rotulo="TLS"
                    valor={
                      configuracao.tls === "custom"
                        ? "Certificado próprio"
                        : "Sistema"
                    }
                  />
                  <ResumoCampo
                    rotulo="Credenciais"
                    valor={
                      senhaConfigurada ? "Senha configurada" : "Senha pendente"
                    }
                  />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Configure a conexão central antes de preparar as origens de
                  leitura. Não há cadastro por hospital nesta etapa.
                </p>
              )}
              {!cadastro.data?.chaveDisponivel && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Chave do servidor indisponível</AlertTitle>
                  <AlertDescription>
                    Configure EASYLOCAL_CONNECTION_ENCRYPTION_KEY nos segredos
                    do servidor antes de salvar. Você ainda pode preencher e
                    testar os dados neste formulário.
                  </AlertDescription>
                </Alert>
              )}
              {configuracao && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResultado(null);
                    testarConexao.mutate({});
                  }}
                  disabled={testarConexao.isPending}
                >
                  {testarConexao.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Testar conexão salva
                </Button>
              )}
              {resultadoAtual && !aberto && (
                <ResultadoTesteCard resultado={resultadoAtual} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={aberto}
        onOpenChange={proximoAberto => {
          if (!proximoAberto) fecharModal();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {configuracao
                ? "Editar conexão central"
                : "Configurar conexão central"}
            </DialogTitle>
            <DialogDescription>
              Use uma role dedicada somente leitura. A senha e o certificado
              nunca são exibidos depois de salvos.
            </DialogDescription>
          </DialogHeader>

          <fieldset
            disabled={salvarCadastro.isPending || testarRascunho.isPending}
            className="space-y-5"
          >
            {erroFormulario && <AlertaErro mensagem={erroFormulario} />}
            {resultadoAtual && (
              <ResultadoTesteCard resultado={resultadoAtual} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nome" htmlFor="easylocal-nome">
                <Input
                  id="easylocal-nome"
                  value={formulario.nome}
                  onChange={event =>
                    atualizarFormulario("nome", event.target.value)
                  }
                  maxLength={100}
                  autoComplete="off"
                />
              </Campo>
              <Campo label="Tipo" htmlFor="easylocal-tipo">
                <Input id="easylocal-tipo" value="PostgreSQL" readOnly />
              </Campo>
            </div>

            <Campo label="Descrição" htmlFor="easylocal-descricao">
              <Textarea
                id="easylocal-descricao"
                value={formulario.descricao}
                onChange={event =>
                  atualizarFormulario("descricao", event.target.value)
                }
                maxLength={500}
                className="min-h-20"
              />
            </Campo>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_130px]">
              <Campo label="Host" htmlFor="easylocal-host">
                <Input
                  id="easylocal-host"
                  value={formulario.host}
                  onChange={event =>
                    atualizarFormulario("host", event.target.value)
                  }
                  maxLength={253}
                  autoComplete="off"
                  placeholder="postgres.exemplo.com"
                />
              </Campo>
              <Campo label="Porta" htmlFor="easylocal-porta">
                <Input
                  id="easylocal-porta"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  value={formulario.porta}
                  onChange={event =>
                    atualizarFormulario("porta", event.target.value)
                  }
                />
              </Campo>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Banco" htmlFor="easylocal-banco">
                <Input
                  id="easylocal-banco"
                  value={formulario.banco}
                  onChange={event =>
                    atualizarFormulario("banco", event.target.value)
                  }
                  maxLength={255}
                  autoComplete="off"
                />
              </Campo>
              <Campo label="Usuário" htmlFor="easylocal-usuario">
                <Input
                  id="easylocal-usuario"
                  value={formulario.usuario}
                  onChange={event =>
                    atualizarFormulario("usuario", event.target.value)
                  }
                  maxLength={255}
                  autoComplete="username"
                />
              </Campo>
            </div>

            <Campo label="Senha" htmlFor="easylocal-senha">
              <Input
                id="easylocal-senha"
                type="password"
                value={formulario.senha}
                onChange={event =>
                  atualizarFormulario("senha", event.target.value)
                }
                maxLength={4096}
                autoComplete="new-password"
                placeholder={
                  senhaConfigurada
                    ? "Deixe em branco para manter a senha atual"
                    : "Informe a senha da role somente leitura"
                }
              />
            </Campo>

            <Campo label="TLS obrigatório" htmlFor="easylocal-tls">
              <Select
                value={formulario.tls}
                onValueChange={(valor: "system" | "custom") =>
                  atualizarFormulario("tls", valor)
                }
              >
                <SelectTrigger id="easylocal-tls" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">Sistema</SelectItem>
                  <SelectItem value="custom">Certificado próprio</SelectItem>
                </SelectContent>
              </Select>
            </Campo>

            {formulario.tls === "custom" && (
              <Campo label="Certificado PEM" htmlFor="easylocal-certificado">
                <Textarea
                  id="easylocal-certificado"
                  value={formulario.certificado}
                  onChange={event =>
                    atualizarFormulario("certificado", event.target.value)
                  }
                  maxLength={32768}
                  autoComplete="off"
                  className="min-h-32 font-mono text-xs"
                  placeholder={
                    certificadoConfigurado
                      ? "Deixe em branco para manter o certificado atual"
                      : "Cole o certificado PEM"
                  }
                />
              </Campo>
            )}

            {!cadastro.data?.chaveDisponivel && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O salvamento depende da configuração de
                  EASYLOCAL_CONNECTION_ENCRYPTION_KEY nos segredos do servidor.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="easylocal-confirmacao-central"
                  checked={confirmouCentral}
                  onCheckedChange={checked =>
                    setConfirmouCentral(checked === true)
                  }
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="easylocal-confirmacao-central"
                    className="leading-5"
                  >
                    Confirmo que esta conexão é central e será usada pelas
                    leituras EASYLocal.
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ela afeta as unidades que prepararem leituras e não ativa
                    importações, sincronizações ou tarefas.
                  </p>
                </div>
              </div>
            </div>
          </fieldset>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={fecharModal}
              disabled={salvarCadastro.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={testarDados}
              disabled={!podeTestar}
            >
              {testarRascunho.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Testar dados
            </Button>
            <Button
              type="button"
              onClick={salvar}
              disabled={
                !confirmouCentral ||
                !cadastro.data?.chaveDisponivel ||
                salvarCadastro.isPending
              }
            >
              {salvarCadastro.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar conexão central
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Campo({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ResumoCampo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 break-words font-medium">{valor}</dd>
    </div>
  );
}

function AlertaErro({
  mensagem,
  aoTentarNovamente,
}: {
  mensagem: string;
  aoTentarNovamente?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{mensagem}</span>
        {aoTentarNovamente && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={aoTentarNovamente}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

function ResultadoTesteCard({
  resultado,
}: {
  resultado: { titulo: string; descricao: string; sucesso?: boolean };
}) {
  return (
    <Alert
      variant={resultado.sucesso ? "default" : "destructive"}
      role="status"
    >
      {resultado.sucesso ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      <AlertTitle>{resultado.titulo}</AlertTitle>
      <AlertDescription>{resultado.descricao}</AlertDescription>
    </Alert>
  );
}
