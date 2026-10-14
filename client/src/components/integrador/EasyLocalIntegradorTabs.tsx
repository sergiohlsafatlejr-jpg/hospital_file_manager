import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSearch,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Table2,
  Trash2,
} from "lucide-react";
import { EasyLocalTab } from "@/components/integrador/EasyLocalTab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  easyLocalCriarTabela,
  easyLocalLeitura,
  type EasyLocalCampoOrigem,
  type EasyLocalColuna,
  type EasyLocalLeituraInput,
  type EasyLocalLeituraResumo,
  type EasyLocalTabelaInput,
  type EasyLocalTabelaResumo,
} from "@shared/easyLocalIntegrador";

type TipoColuna = EasyLocalColuna["tipo"];
type ColunaRascunho = {
  nome: string;
  tipo: TipoColuna;
  tamanho: string;
  escala: string;
  obrigatorio: boolean;
};
type Origem = { schema: string; tabela: string };
type FormLeitura = Omit<
  EasyLocalLeituraInput,
  "estabelecimentoId" | "origem" | "tabelaId"
> & {
  tabelaId: string;
  origemChave: string;
};

const TIPOS: Array<{ valor: TipoColuna; rotulo: string }> = [
  { valor: "varchar", rotulo: "Texto curto (varchar)" },
  { valor: "text", rotulo: "Texto longo (text)" },
  { valor: "int", rotulo: "Inteiro (int)" },
  { valor: "bigint", rotulo: "Inteiro longo (bigint)" },
  { valor: "decimal", rotulo: "Decimal (decimal)" },
  { valor: "date", rotulo: "Data (date)" },
  { valor: "datetime", rotulo: "Data e hora (datetime)" },
  { valor: "boolean", rotulo: "Sim ou não (boolean)" },
];

const DOMINIOS = [
  ["atendimentos", "Atendimentos"],
  ["faturamento", "Faturamento"],
  ["relatorio", "Relatório"],
] as const;
const FREQUENCIAS = [
  ["manual", "Manual"],
  ["15min", "A cada 15 min"],
  ["1hora", "A cada hora"],
  ["diario", "Diariamente"],
] as const;

function novaColuna(): ColunaRascunho {
  return {
    nome: "",
    tipo: "varchar",
    tamanho: "255",
    escala: "",
    obrigatorio: false,
  };
}

function novoFormularioLeitura(): FormLeitura {
  return {
    tabelaId: "",
    origemChave: "",
    colunaEstabelecimento: "",
    valorEstabelecimento: "",
    campoChave: "",
    dominio: "atendimentos",
    frequenciaDesejada: "manual",
  };
}

function tipoComParametros(
  coluna: Pick<EasyLocalColuna, "tipo" | "tamanho" | "escala">
): string {
  if (coluna.tipo === "varchar") return `varchar(${coluna.tamanho ?? 255})`;
  if (coluna.tipo === "decimal")
    return `decimal(${coluna.tamanho ?? 18}, ${coluna.escala ?? 2})`;
  return coluna.tipo;
}

function erroSeguro(
  operacao: "catalogo" | "criacao" | "leitura" | "metadados"
): string {
  const mensagens = {
    catalogo:
      "Não foi possível atualizar o catálogo desta unidade. Tente novamente.",
    criacao:
      "Não foi possível confirmar a criação. Consulte o catálogo antes de repetir a operação.",
    leitura:
      "Não foi possível salvar a configuração. Confira a listagem antes de repetir.",
    metadados:
      "Não foi possível consultar os metadados da origem. Verifique com o TI e tente novamente.",
  } as const;
  return mensagens[operacao];
}

export function EasyLocalIntegradorTabs({
  estabelecimentoId,
}: {
  estabelecimentoId: number | null;
}) {
  const [abaAtiva, setAbaAtiva] = useState("conexoes");
  const [editorTabelaAberto, setEditorTabelaAberto] = useState(false);
  const [nomeTabela, setNomeTabela] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [colunas, setColunas] = useState<ColunaRascunho[]>([novaColuna()]);
  const [origemDeteccao, setOrigemDeteccao] = useState("");
  const [camposDetectados, setCamposDetectados] = useState<
    EasyLocalCampoOrigem[] | null
  >(null);
  const [erroTabela, setErroTabela] = useState<string | null>(null);
  const [tabelaParaConfirmar, setTabelaParaConfirmar] =
    useState<EasyLocalTabelaInput | null>(null);
  const [resultadoTabela, setResultadoTabela] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<FormLeitura>(novoFormularioLeitura);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [resultadoLeitura, setResultadoLeitura] = useState<string | null>(null);

  // Catálogos e metadados só são solicitados dentro das abas correspondentes; nunca ao abrir a página.
  const tabelas = trpc.easyLocalIntegrador.listarTabelas.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0 },
    {
      enabled:
        Boolean(estabelecimentoId) &&
        (abaAtiva === "tabelas" || abaAtiva === "leituras"),
      retry: false,
    }
  );
  const origens = trpc.easyLocalIntegrador.listarOrigens.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0 },
    {
      enabled:
        Boolean(estabelecimentoId) &&
        (abaAtiva === "tabelas" || abaAtiva === "leituras"),
      retry: false,
    }
  );
  const leituras = trpc.easyLocalIntegrador.listarLeituras.useQuery(
    { estabelecimentoId: estabelecimentoId ?? 0 },
    {
      enabled: Boolean(estabelecimentoId) && abaAtiva === "leituras",
      retry: false,
    }
  );

  const criarTabela = trpc.easyLocalIntegrador.criarTabela.useMutation({
    onSuccess: (resposta: { nomeFisico: string }) => {
      setResultadoTabela(
        `Tabela vazia ${resposta.nomeFisico} criada e registrada no catálogo.`
      );
      setTabelaParaConfirmar(null);
      setEditorTabelaAberto(false);
      setNomeTabela("");
      setNomeExibicao("");
      setColunas([novaColuna()]);
      setCamposDetectados(null);
      tabelas.refetch();
    },
    onError: () => setErroTabela(erroSeguro("criacao")),
  });
  const detectarCampos = trpc.easyLocalIntegrador.detectarCampos.useMutation({
    onSuccess: (campos: EasyLocalCampoOrigem[]) => {
      setCamposDetectados(campos);
      setErroTabela(null);
    },
    onError: () => setErroTabela(erroSeguro("metadados")),
  });
  const salvarLeitura = trpc.easyLocalIntegrador.salvarLeitura.useMutation({
    onSuccess: () => {
      setResultadoLeitura("Configuração preparada e salva sem execução ativa.");
      setLeitura(novoFormularioLeitura());
      leituras.refetch();
    },
    onError: () => setErroLeitura(erroSeguro("leitura")),
  });

  const listaTabelas = (tabelas.data ?? []) as EasyLocalTabelaResumo[];
  const listaOrigens = (origens.data ?? []) as Origem[];
  const listaLeituras = (leituras.data ?? []) as EasyLocalLeituraResumo[];
  const tabelasCriadas = useMemo(
    () => listaTabelas.filter(tabela => tabela.estado === "criada"),
    [listaTabelas]
  );
  const origemSelecionada = useMemo(
    () =>
      listaOrigens.find(
        origem => `${origem.schema}.${origem.tabela}` === leitura.origemChave
      ),
    [leitura.origemChave, listaOrigens]
  );
  const camposCompativeis = (camposDetectados ?? []).filter(
    campo => campo.tipoSugerido !== null
  );
  const camposParaRevisao = (camposDetectados ?? []).filter(
    campo => campo.tipoSugerido === null
  );

  function iniciarNovaTabela() {
    setEditorTabelaAberto(true);
    setErroTabela(null);
    setResultadoTabela(null);
    setCamposDetectados(null);
  }

  function atualizarColuna(
    indice: number,
    atualizacao: Partial<ColunaRascunho>
  ) {
    setColunas(atuais =>
      atuais.map((coluna, index) =>
        index === indice ? { ...coluna, ...atualizacao } : coluna
      )
    );
  }

  function aplicarCamposCompativeis() {
    const atuais =
      colunas.length === 1 && colunas[0].nome === "" ? [] : colunas;
    const existentes = new Set(atuais.map(coluna => coluna.nome));
    const novos = camposCompativeis
      .filter(campo => !existentes.has(campo.nome))
      .map(campo => ({
        nome: campo.nome,
        tipo: campo.tipoSugerido!,
        tamanho:
          campo.tamanho?.toString() ??
          (campo.tipoSugerido === "varchar" ? "255" : ""),
        escala:
          campo.escala?.toString() ??
          (campo.tipoSugerido === "decimal" ? "2" : ""),
        obrigatorio: campo.obrigatorio,
      }));
    if (atuais.length + novos.length > 64) {
      setErroTabela(
        "A seleção ultrapassa 64 colunas. Revise os campos; nenhum deles foi cortado automaticamente."
      );
      return;
    }
    setErroTabela(null);
    setColunas(
      atuais.length + novos.length ? [...atuais, ...novos] : [novaColuna()]
    );
  }

  function prepararConfirmacaoTabela() {
    if (!estabelecimentoId) return;
    const rascunho = {
      estabelecimentoId,
      nome: nomeTabela.trim(),
      nomeExibicao: nomeExibicao.trim(),
      colunas: colunas.map(coluna => ({
        nome: coluna.nome.trim(),
        tipo: coluna.tipo,
        tamanho:
          coluna.tipo === "varchar" || coluna.tipo === "decimal"
            ? coluna.tamanho === ""
              ? undefined
              : Number(coluna.tamanho)
            : undefined,
        escala:
          coluna.tipo === "decimal"
            ? coluna.escala === ""
              ? undefined
              : Number(coluna.escala)
            : undefined,
        obrigatorio: coluna.obrigatorio,
      })),
      confirmarCriacao: true as const,
    };
    const validacao = easyLocalCriarTabela.safeParse(rascunho);
    if (!validacao.success) {
      setErroTabela(
        "Revise o nome, a lista de colunas e os parâmetros de tipo antes de continuar."
      );
      return;
    }
    setErroTabela(null);
    setTabelaParaConfirmar(validacao.data);
  }

  function confirmarCriacao() {
    if (tabelaParaConfirmar) criarTabela.mutate(tabelaParaConfirmar);
  }

  function solicitarDeteccao() {
    if (!estabelecimentoId || !origemDeteccao) {
      setErroTabela(
        "Selecione uma origem aprovada para consultar somente seus metadados."
      );
      return;
    }
    const origem = listaOrigens.find(
      item => `${item.schema}.${item.tabela}` === origemDeteccao
    );
    if (origem) detectarCampos.mutate({ estabelecimentoId, origem });
  }

  function confirmarLeitura() {
    if (!estabelecimentoId || !origemSelecionada) {
      setErroLeitura(
        "Selecione uma tabela criada e uma origem aprovada antes de salvar."
      );
      return;
    }
    const validacao = easyLocalLeitura.safeParse({
      estabelecimentoId,
      tabelaId: Number(leitura.tabelaId),
      origem: origemSelecionada,
      colunaEstabelecimento: leitura.colunaEstabelecimento.trim(),
      valorEstabelecimento: leitura.valorEstabelecimento.trim(),
      campoChave: leitura.campoChave.trim(),
      dominio: leitura.dominio,
      frequenciaDesejada: leitura.frequenciaDesejada,
    });
    if (!validacao.success) {
      setErroLeitura(
        "Revise todos os campos obrigatórios e use identificadores aprovados da origem."
      );
      return;
    }
    setErroLeitura(null);
    salvarLeitura.mutate(validacao.data);
  }

  return (
    <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3 sm:w-[430px]">
        <TabsTrigger value="conexoes">Conexões</TabsTrigger>
        <TabsTrigger value="tabelas">Tabelas</TabsTrigger>
        <TabsTrigger value="leituras">Leituras</TabsTrigger>
      </TabsList>

      <TabsContent value="conexoes">
        <EasyLocalTab estabelecimentoId={estabelecimentoId} modoCatalogo />
      </TabsContent>

      <TabsContent value="tabelas" className="space-y-4">
        {!estabelecimentoId ? (
          <UnidadeObrigatoria />
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Table2 className="h-5 w-5" /> Tabelas gerenciadas
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-2xl">
                    Crie apenas tabelas novas do catálogo EASYLocal. Nenhuma
                    tabela existente será adotada ou alterada.
                  </CardDescription>
                </div>
                <Button type="button" onClick={iniciarNovaTabela}>
                  <Plus className="mr-2 h-4 w-4" /> Nova tabela manual
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {resultadoTabela && <Sucesso mensagem={resultadoTabela} />}
                {tabelas.isLoading ? (
                  <Carregando texto="Consultando catálogo da unidade…" />
                ) : tabelas.isError ? (
                  <Erro
                    mensagem={erroSeguro("catalogo")}
                    acao={() => tabelas.refetch()}
                  />
                ) : listaTabelas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tabela gerenciada foi cadastrada para esta unidade.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                          <th className="p-3 font-medium">Tabela</th>
                          <th className="p-3 font-medium">Colunas</th>
                          <th className="p-3 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {listaTabelas.map(tabela => (
                          <tr key={tabela.id}>
                            <td className="p-3">
                              <div className="font-medium">
                                {tabela.nomeExibicao}
                              </div>
                              <code className="text-xs text-muted-foreground">
                                {tabela.nomeFisico}
                              </code>
                            </td>
                            <td className="max-w-md p-3 text-xs text-muted-foreground">
                              {tabela.colunas
                                .map(
                                  coluna =>
                                    `${coluna.nome}: ${tipoComParametros(coluna)} (${coluna.obrigatorio ? "obrigatória" : "aceita nulo"})`
                                )
                                .join(" · ")}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  tabela.estado === "criada"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {tabela.estado === "criada"
                                  ? "Criada"
                                  : "Pendente de conferência"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {editorTabelaAberto && (
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-base">
                    Nova tabela manual
                  </CardTitle>
                  <CardDescription>
                    Defina os campos antes de criar. Identificadores devem usar
                    letras minúsculas, números e underscore.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {erroTabela && <Erro mensagem={erroTabela} />}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Campo label="Nome técnico" htmlFor="el-nome">
                      <Input
                        id="el-nome"
                        value={nomeTabela}
                        onChange={event => setNomeTabela(event.target.value)}
                        placeholder="contas_origem"
                        maxLength={28}
                      />
                    </Campo>
                    <Campo label="Nome de exibição" htmlFor="el-nome-exibicao">
                      <Input
                        id="el-nome-exibicao"
                        value={nomeExibicao}
                        onChange={event => setNomeExibicao(event.target.value)}
                        placeholder="Contas de origem"
                        maxLength={120}
                      />
                    </Campo>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="font-medium">Campos da origem</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          A detecção lê somente metadados. Ela não consulta
                          registros nem executa importações.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={solicitarDeteccao}
                        disabled={!origemDeteccao || detectarCampos.isPending}
                      >
                        {detectarCampos.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileSearch className="mr-2 h-4 w-4" />
                        )}
                        Detectar campos da origem
                      </Button>
                    </div>
                    <div className="mt-3 max-w-md">
                      <Select
                        value={origemDeteccao}
                        onValueChange={setOrigemDeteccao}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione uma origem aprovada" />
                        </SelectTrigger>
                        <SelectContent>
                          {listaOrigens.map(origem => (
                            <SelectItem
                              key={`${origem.schema}.${origem.tabela}`}
                              value={`${origem.schema}.${origem.tabela}`}
                            >
                              {origem.schema}.{origem.tabela}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {origens.isLoading && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Consultando origens aprovadas…
                      </p>
                    )}
                    {origens.isError && (
                      <p className="mt-3 text-sm text-destructive">
                        {erroSeguro("metadados")}
                      </p>
                    )}
                    {camposDetectados && (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm font-medium">
                          {camposDetectados.length} campo(s) de metadados
                          encontrado(s)
                        </p>
                        {camposCompativeis.length > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={aplicarCamposCompativeis}
                            disabled={colunas.length >= 64}
                          >
                            Adicionar campos compatíveis manualmente
                          </Button>
                        )}
                        {camposParaRevisao.length > 0 && (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Revisão manual necessária</AlertTitle>
                            <AlertDescription>
                              Os tipos a seguir não têm conversão automática:{" "}
                              {camposParaRevisao
                                .map(
                                  campo =>
                                    `${campo.nome} (${campo.tipoPostgres})`
                                )
                                .join(", ")}
                              . Defina um tipo de destino após revisar o
                              significado do campo.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium">
                          Colunas ({colunas.length}/64)
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Marque obrigatório para criar a coluna como não nula.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setColunas(atuais => [...atuais, novaColuna()])
                        }
                        disabled={colunas.length >= 64}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar coluna
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {colunas.map((coluna, indice) => (
                        <div
                          key={indice}
                          className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_100px_100px_130px_40px] md:items-end"
                        >
                          <Campo label="Nome" htmlFor={`coluna-${indice}`}>
                            <Input
                              id={`coluna-${indice}`}
                              value={coluna.nome}
                              onChange={event =>
                                atualizarColuna(indice, {
                                  nome: event.target.value,
                                })
                              }
                              placeholder="codigo"
                              maxLength={48}
                            />
                          </Campo>
                          <Campo label="Tipo" htmlFor={`tipo-${indice}`}>
                            <Select
                              value={coluna.tipo}
                              onValueChange={tipo =>
                                atualizarColuna(indice, {
                                  tipo: tipo as TipoColuna,
                                })
                              }
                            >
                              <SelectTrigger
                                id={`tipo-${indice}`}
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIPOS.map(tipo => (
                                  <SelectItem
                                    key={tipo.valor}
                                    value={tipo.valor}
                                  >
                                    {tipo.rotulo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Campo>
                          <Campo label="Tamanho" htmlFor={`tamanho-${indice}`}>
                            <Input
                              id={`tamanho-${indice}`}
                              type="number"
                              min={1}
                              max={4096}
                              value={coluna.tamanho}
                              onChange={event =>
                                atualizarColuna(indice, {
                                  tamanho: event.target.value,
                                })
                              }
                              disabled={
                                coluna.tipo !== "varchar" &&
                                coluna.tipo !== "decimal"
                              }
                            />
                          </Campo>
                          <Campo label="Escala" htmlFor={`escala-${indice}`}>
                            <Input
                              id={`escala-${indice}`}
                              type="number"
                              min={0}
                              max={30}
                              value={coluna.escala}
                              onChange={event =>
                                atualizarColuna(indice, {
                                  escala: event.target.value,
                                })
                              }
                              disabled={coluna.tipo !== "decimal"}
                            />
                          </Campo>
                          <div className="flex h-9 items-center gap-2">
                            <Checkbox
                              id={`obrigatorio-${indice}`}
                              checked={coluna.obrigatorio}
                              onCheckedChange={checked =>
                                atualizarColuna(indice, {
                                  obrigatorio: checked === true,
                                })
                              }
                            />
                            <Label htmlFor={`obrigatorio-${indice}`}>
                              Obrigatória
                            </Label>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setColunas(atuais =>
                                atuais.filter((_, index) => index !== indice)
                              )
                            }
                            disabled={colunas.length === 1}
                            aria-label="Remover coluna"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditorTabelaAberto(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="button" onClick={prepararConfirmacaoTabela}>
                      Revisar criação
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="leituras" className="space-y-4">
        {!estabelecimentoId ? (
          <UnidadeObrigatoria />
        ) : (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Configuração preparada, sem execução</AlertTitle>
              <AlertDescription>
                Publicar uma leitura nesta página requer adaptador e validação
                separados. A frequência desejada não cria agendamento,
                sincronização ou ingestão.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-5 w-5" /> Preparar leitura
                </CardTitle>
                <CardDescription>
                  Associe uma tabela gerenciada criada a uma origem aprovada.
                  Não informe credenciais nem dados de registros.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {erroLeitura && <Erro mensagem={erroLeitura} />}
                {resultadoLeitura && <Sucesso mensagem={resultadoLeitura} />}
                <div className="grid gap-4 md:grid-cols-2">
                  <Campo
                    label="Tabela gerenciada criada"
                    htmlFor="leitura-tabela"
                  >
                    <Select
                      value={leitura.tabelaId}
                      onValueChange={valor =>
                        setLeitura(atual => ({ ...atual, tabelaId: valor }))
                      }
                    >
                      <SelectTrigger id="leitura-tabela" className="w-full">
                        <SelectValue placeholder="Selecione uma tabela" />
                      </SelectTrigger>
                      <SelectContent>
                        {tabelasCriadas.map(tabela => (
                          <SelectItem key={tabela.id} value={String(tabela.id)}>
                            {tabela.nomeExibicao} · {tabela.nomeFisico}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo label="Origem aprovada" htmlFor="leitura-origem">
                    <Select
                      value={leitura.origemChave}
                      onValueChange={valor =>
                        setLeitura(atual => ({ ...atual, origemChave: valor }))
                      }
                    >
                      <SelectTrigger id="leitura-origem" className="w-full">
                        <SelectValue placeholder="Selecione uma origem" />
                      </SelectTrigger>
                      <SelectContent>
                        {listaOrigens.map(origem => (
                          <SelectItem
                            key={`${origem.schema}.${origem.tabela}`}
                            value={`${origem.schema}.${origem.tabela}`}
                          >
                            {origem.schema}.{origem.tabela}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                </div>
                {tabelas.isLoading || origens.isLoading ? (
                  <Carregando texto="Consultando catálogo e origens aprovadas…" />
                ) : null}
                {(tabelas.isError || origens.isError) && (
                  <Erro
                    mensagem={erroSeguro("catalogo")}
                    acao={() => {
                      tabelas.refetch();
                      origens.refetch();
                    }}
                  />
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Campo
                    label="Coluna de estabelecimento"
                    htmlFor="leitura-coluna-estab"
                  >
                    <Input
                      id="leitura-coluna-estab"
                      value={leitura.colunaEstabelecimento}
                      onChange={event =>
                        setLeitura(atual => ({
                          ...atual,
                          colunaEstabelecimento: event.target.value,
                        }))
                      }
                      placeholder="hospital_id"
                    />
                  </Campo>
                  <Campo
                    label="Valor do estabelecimento"
                    htmlFor="leitura-valor-estab"
                  >
                    <Input
                      id="leitura-valor-estab"
                      value={leitura.valorEstabelecimento}
                      onChange={event =>
                        setLeitura(atual => ({
                          ...atual,
                          valorEstabelecimento: event.target.value,
                        }))
                      }
                      placeholder="Identificador aprovado"
                      maxLength={100}
                    />
                  </Campo>
                  <Campo label="Campo chave" htmlFor="leitura-chave">
                    <Input
                      id="leitura-chave"
                      value={leitura.campoChave}
                      onChange={event =>
                        setLeitura(atual => ({
                          ...atual,
                          campoChave: event.target.value,
                        }))
                      }
                      placeholder="id_origem"
                    />
                  </Campo>
                  <Campo label="Domínio" htmlFor="leitura-dominio">
                    <Select
                      value={leitura.dominio}
                      onValueChange={valor =>
                        setLeitura(atual => ({
                          ...atual,
                          dominio: valor as FormLeitura["dominio"],
                        }))
                      }
                    >
                      <SelectTrigger id="leitura-dominio" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOMINIOS.map(([valor, rotulo]) => (
                          <SelectItem key={valor} value={valor}>
                            {rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                  <Campo
                    label="Frequência desejada"
                    htmlFor="leitura-frequencia"
                  >
                    <Select
                      value={leitura.frequenciaDesejada}
                      onValueChange={valor =>
                        setLeitura(atual => ({
                          ...atual,
                          frequenciaDesejada:
                            valor as FormLeitura["frequenciaDesejada"],
                        }))
                      }
                    >
                      <SelectTrigger id="leitura-frequencia" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIAS.map(([valor, rotulo]) => (
                          <SelectItem key={valor} value={valor}>
                            {rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Campo>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={confirmarLeitura}
                    disabled={salvarLeitura.isPending}
                  >
                    {salvarLeitura.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar configuração preparada
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Configurações cadastradas
                </CardTitle>
                <CardDescription>
                  Todas permanecem preparadas sem execução ativa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leituras.isLoading ? (
                  <Carregando texto="Consultando configurações preparadas…" />
                ) : leituras.isError ? (
                  <Erro
                    mensagem={erroSeguro("catalogo")}
                    acao={() => leituras.refetch()}
                  />
                ) : listaLeituras.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma configuração preparada para esta unidade.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                          <th className="p-3 font-medium">Tabela</th>
                          <th className="p-3 font-medium">Origem</th>
                          <th className="p-3 font-medium">Chave e filtro</th>
                          <th className="p-3 font-medium">
                            Domínio e frequência
                          </th>
                          <th className="p-3 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {listaLeituras.map(configuracao => (
                          <tr key={configuracao.id}>
                            <td className="p-3 font-medium">
                              {configuracao.nomeTabela}
                            </td>
                            <td className="p-3">
                              <code className="text-xs">
                                {configuracao.origem.schema}.
                                {configuracao.origem.tabela}
                              </code>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {configuracao.campoChave} ·{" "}
                              {configuracao.colunaEstabelecimento} =
                              identificador configurado
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {configuracao.dominio} ·{" "}
                              {configuracao.frequenciaDesejada}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline">
                                Preparada sem execução
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>

      <Dialog
        open={Boolean(tabelaParaConfirmar)}
        onOpenChange={aberto => !aberto && setTabelaParaConfirmar(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar criação da tabela</DialogTitle>
            <DialogDescription>
              Revise o nome físico e todas as colunas. A nova tabela será vazia
              e não alterará tabelas existentes.
            </DialogDescription>
          </DialogHeader>
          {erroTabela && <Erro mensagem={erroTabela} />}
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Colunas técnicas acrescentadas: <code>_id BIGINT</code> (chave
            primária automática), <code>estabelecimento_id INT</code>{" "}
            (obrigatória, padrão {tabelaParaConfirmar?.estabelecimentoId}),{" "}
            <code>_sincronizado_em DATETIME</code> (aceita nulo). Índice por
            estabelecimento.
          </div>
          {tabelaParaConfirmar && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm">
                <span className="text-muted-foreground">Nome físico: </span>
                <code className="font-medium">
                  integ_el_{tabelaParaConfirmar.estabelecimentoId}_
                  {tabelaParaConfirmar.nome}
                </code>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Coluna</th>
                      <th className="p-3 font-medium">Tipo</th>
                      <th className="p-3 font-medium">Nulidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tabelaParaConfirmar.colunas.map(coluna => (
                      <tr key={coluna.nome}>
                        <td className="p-3 font-medium">{coluna.nome}</td>
                        <td className="p-3">
                          <code>{tipoComParametros(coluna)}</code>
                        </td>
                        <td className="p-3">
                          {coluna.obrigatorio
                            ? "Não nula (obrigatória)"
                            : "Aceita nulo"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTabelaParaConfirmar(null)}
              disabled={criarTabela.isPending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={confirmarCriacao}
              disabled={criarTabela.isPending}
            >
              {criarTabela.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar criação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
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

function Carregando({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {texto}
    </p>
  );
}

function Erro({ mensagem, acao }: { mensagem: string; acao?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{mensagem}</span>
        {acao && (
          <Button type="button" variant="outline" size="sm" onClick={acao}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Sucesso({ mensagem }: { mensagem: string }) {
  return (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}

function UnidadeObrigatoria() {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Selecione uma unidade</AlertTitle>
      <AlertDescription>
        Escolha uma unidade no topo da página para consultar ou preparar
        configurações do integrador.
      </AlertDescription>
    </Alert>
  );
}
