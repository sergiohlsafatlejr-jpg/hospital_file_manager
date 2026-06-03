import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Brain, CheckCircle2, XCircle, TrendingUp, Zap, BookOpen, ArrowUpDown } from "lucide-react";

export default function VinculacaoInteligente() {
  const { user } = useAuth();
  const [estabId, setEstabId] = useState<number>(6);
  const [activeTab, setActiveTab] = useState("sugestoes");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            Vinculação Inteligente
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema de aprendizado automático para vinculação de códigos entre hospital e convênios
          </p>
        </div>
        <Select value={String(estabId)} onValueChange={(v) => setEstabId(Number(v))}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Estabelecimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Maternidade Ela</SelectItem>
            <SelectItem value="3">Hospital Safalte</SelectItem>
            <SelectItem value="1260036">Unidade Auxiliar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sugestoes" className="flex items-center gap-1">
            <Zap className="h-4 w-4" /> Sugestões
          </TabsTrigger>
          <TabsTrigger value="regras" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" /> Regras Aprendidas
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1">
            <BookOpen className="h-4 w-4" /> Templates Justificativa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sugestoes">
          <SugestoesTab estabId={estabId} />
        </TabsContent>
        <TabsContent value="regras">
          <RegrasTab estabId={estabId} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab estabId={estabId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SugestoesTab({ estabId }: { estabId: number }) {
  const estatisticas = trpc.medCompara.aprendizado.estatisticas.useQuery({ estabelecimentoId: estabId });
  const candidatas = trpc.medCompara.aprendizado.candidatasPromocao.useQuery({ estabelecimentoId: estabId });

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">
              {estatisticas.data?.totalRegras || 0}
            </div>
            <p className="text-sm text-muted-foreground">Regras Totais</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {estatisticas.data?.regrasAutoPromovidas || 0}
            </div>
            <p className="text-sm text-muted-foreground">Auto-promovidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">
              {estatisticas.data?.regrasAguardandoPromocao || 0}
            </div>
            <p className="text-sm text-muted-foreground">Aguardando Promoção</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">
              {estatisticas.data?.taxaConfiancaMedia?.toFixed(1) || "0"}%
            </div>
            <p className="text-sm text-muted-foreground">Confiança Média</p>
          </CardContent>
        </Card>
      </div>

      {/* Candidatas a promoção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Candidatas a Promoção Automática
          </CardTitle>
          <CardDescription>
            Vinculações que atingiram 90%+ de confiança e podem ser promovidas a regras automáticas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidatas.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !candidatas.data?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma vinculação pronta para promoção. O sistema aprende com cada vinculação manual.
            </div>
          ) : (
            <div className="space-y-3">
              {candidatas.data.map((item: any) => (
                <CandidataCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidataCard({ item }: { item: any }) {
  const utils = trpc.useUtils();
  const promover = trpc.medCompara.aprendizado.promover.useMutation({
    onSuccess: () => {
      toast.success("Regra promovida com sucesso!");
      utils.medCompara.aprendizado.candidatasPromocao.invalidate();
      utils.medCompara.aprendizado.estatisticas.invalidate();
    },
  });

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono">{item.codigoHospital}</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant="secondary" className="font-mono">{item.codigoConvenio}</Badge>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          Aplicada {item.vezesAplicada}x | Confirmada {item.vezesConfirmada}x | 
          Confiança: <span className="font-semibold text-green-600">{item.confianca}%</span>
        </div>
      </div>
      <Button 
        size="sm" 
        onClick={() => promover.mutate({ vinculacaoId: item.id })}
        disabled={promover.isPending}
      >
        <CheckCircle2 className="h-4 w-4 mr-1" />
        Promover
      </Button>
    </div>
  );
}

function RegrasTab({ estabId }: { estabId: number }) {
  const [filtroAtivas, setFiltroAtivas] = useState(true);
  const regras = trpc.medCompara.aprendizado.listarRegras.useQuery({
    estabelecimentoId: estabId,
    apenasAtivas: filtroAtivas,
  });

  const utils = trpc.useUtils();
  const despromover = trpc.medCompara.aprendizado.despromover.useMutation({
    onSuccess: () => {
      toast.success("Regra despromovida");
      utils.medCompara.aprendizado.listarRegras.invalidate();
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Regras de Vinculação Aprendidas</CardTitle>
            <CardDescription>
              Mapeamentos de-para aprendidos automaticamente pelo sistema
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filtroAtivas ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroAtivas(true)}
            >
              Ativas
            </Button>
            <Button
              variant={!filtroAtivas ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroAtivas(false)}
            >
              Todas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {regras.isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : !regras.data?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma regra encontrada. As regras são criadas automaticamente a partir das vinculações manuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Código Hospital</th>
                  <th className="text-left p-2">Código Convênio</th>
                  <th className="text-left p-2">Método</th>
                  <th className="text-center p-2">Aplicações</th>
                  <th className="text-center p-2">Confirmações</th>
                  <th className="text-center p-2">Confiança</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-right p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {regras.data.map((regra: any) => (
                  <tr key={regra.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-mono">{regra.codigoHospital}</td>
                    <td className="p-2 font-mono">{regra.codigoConvenio}</td>
                    <td className="p-2">
                      <Badge variant={regra.metodo_match === "automatico" ? "default" : "secondary"}>
                        {regra.metodo_match}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">{regra.vezesAplicada || 0}</td>
                    <td className="p-2 text-center">{regra.vezesConfirmada || 0}</td>
                    <td className="p-2 text-center">
                      <span className={`font-semibold ${
                        (regra.confianca || 0) >= 90 ? "text-green-600" :
                        (regra.confianca || 0) >= 70 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {regra.confianca || 0}%
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant={regra.autoPromovida === "sim" ? "default" : "outline"}>
                        {regra.autoPromovida === "sim" ? "Auto" : "Manual"}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      {regra.autoPromovida === "sim" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => despromover.mutate({ vinculacaoId: regra.id })}
                          disabled={despromover.isPending}
                        >
                          <XCircle className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesTab({ estabId }: { estabId: number }) {
  const [codigoGlosa, setCodigoGlosa] = useState("");
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [novoFundamento, setNovoFundamento] = useState("");
  const [showForm, setShowForm] = useState(false);

  const templates = trpc.medCompara.templates.listar.useQuery({
    estabelecimentoId: estabId,
    apenasAtivos: true,
  });

  const estatisticas = trpc.medCompara.templates.estatisticas.useQuery({
    estabelecimentoId: estabId,
  });

  const utils = trpc.useUtils();
  const criarTemplate = trpc.medCompara.templates.criar.useMutation({
    onSuccess: () => {
      toast.success("Template criado com sucesso!");
      utils.medCompara.templates.listar.invalidate();
      utils.medCompara.templates.estatisticas.invalidate();
      setShowForm(false);
      setNovoTitulo("");
      setNovoTexto("");
      setNovoFundamento("");
      setCodigoGlosa("");
    },
    onError: (err) => toast.error(err.message),
  });

  const excluirTemplate = trpc.medCompara.templates.excluir.useMutation({
    onSuccess: () => {
      toast.success("Template excluído");
      utils.medCompara.templates.listar.invalidate();
    },
  });

  return (
    <div className="space-y-4">
      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">
              {estatisticas.data?.totalTemplates || 0}
            </div>
            <p className="text-sm text-muted-foreground">Templates Cadastrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {estatisticas.data?.totalUsos || 0}
            </div>
            <p className="text-sm text-muted-foreground">Vezes Utilizados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">
              {estatisticas.data?.taxaSucessoMedia?.toFixed(0) || "0"}%
            </div>
            <p className="text-sm text-muted-foreground">Taxa de Sucesso Média</p>
          </CardContent>
        </Card>
      </div>

      {/* Formulário de novo template */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Templates de Justificativa</CardTitle>
              <CardDescription>
                Textos reutilizáveis para acelerar a elaboração de recursos de glosa
              </CardDescription>
            </div>
            <Button onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancelar" : "+ Novo Template"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showForm && (
            <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Código da Glosa</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    placeholder="Ex: A001, B003..."
                    value={codigoGlosa}
                    onChange={(e) => setCodigoGlosa(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Título</label>
                  <input
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                    placeholder="Nome identificador do template"
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Texto da Justificativa</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 border rounded-md min-h-[100px]"
                  placeholder="Texto completo da justificativa para recurso..."
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Fundamentação Legal (opcional)</label>
                <input
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="Ex: RN 412/2016, Art. 5º..."
                  value={novoFundamento}
                  onChange={(e) => setNovoFundamento(e.target.value)}
                />
              </div>
              <Button
                onClick={() => criarTemplate.mutate({
                  estabelecimentoId: estabId,
                  codigoGlosa,
                  titulo: novoTitulo,
                  texto: novoTexto,
                  fundamentacaoLegal: novoFundamento || undefined,
                })}
                disabled={criarTemplate.isPending || !codigoGlosa || !novoTitulo || !novoTexto}
              >
                Salvar Template
              </Button>
            </div>
          )}

          {/* Lista de templates */}
          {templates.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !templates.data?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum template cadastrado. Crie templates para agilizar os recursos de glosa.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.data.map((tpl: any) => (
                <div key={tpl.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{tpl.codigoGlosa}</Badge>
                        <span className="font-medium">{tpl.titulo}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{tpl.texto}</p>
                      {tpl.fundamentacaoLegal && (
                        <p className="text-xs text-blue-600 mt-1">📜 {tpl.fundamentacaoLegal}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Usado {tpl.vezesUsado || 0}x</span>
                        <span>Sucesso: {tpl.taxaSucesso || 0}%</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Excluir este template?")) {
                          excluirTemplate.mutate({ templateId: tpl.id });
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
