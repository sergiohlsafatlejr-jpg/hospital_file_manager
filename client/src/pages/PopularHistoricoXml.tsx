import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export function PopularHistoricoXml() {
  const [, navigate] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const populateMutation = trpc.motorRegras.populateFromImportedXml.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setIsProcessing(false);
      setErro(null);
    },
    onError: (error) => {
      setErro(error.message);
      setIsProcessing(false);
    },
  });

  const handlePopulate = async () => {
    setIsProcessing(true);
    setResultado(null);
    setErro(null);
    await populateMutation.mutate({});
  };

  const progressPercentage = resultado
    ? ((resultado.totalInseridos + resultado.totalErros) / resultado.totalArquivos) * 100
    : 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1 as any)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Popular Histórico de Validações</h1>
          <p className="text-muted-foreground">Importar dados dos XMLs já processados para o Motor de Regras</p>
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">O que vai acontecer?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Este processo vai:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>Ler todos os XMLs já importados na tabela <code className="bg-muted px-2 py-1 rounded">faturamento_tiss</code></li>
            <li>Agrupar por arquivo e estabelecimento</li>
            <li>Calcular conformidade e estatísticas</li>
            <li>Detectar outliers e padrões de erro</li>
            <li>Popular a tabela <code className="bg-muted px-2 py-1 rounded">historicoValidacaoXml</code></li>
            <li>Gerar regras automáticas para o Motor de Regras</li>
          </ul>
          <p className="text-muted-foreground mt-4">
            ⏱️ Pode levar alguns minutos dependendo da quantidade de XMLs importados.
          </p>
        </CardContent>
      </Card>

      {/* Action Card */}
      <Card>
        <CardHeader>
          <CardTitle>Iniciar Processo</CardTitle>
          <CardDescription>Clique no botão abaixo para começar a população do histórico</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handlePopulate}
            disabled={isProcessing || populateMutation.isPending}
            size="lg"
            className="w-full"
          >
            {isProcessing || populateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              "Iniciar População do Histórico"
            )}
          </Button>

          {isProcessing && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Processando XMLs...</p>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle2 className="h-5 w-5" />
              Processo Concluído com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded border border-green-200">
                <p className="text-sm text-muted-foreground">Inseridos</p>
                <p className="text-2xl font-bold text-green-600">{resultado.totalInseridos}</p>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <p className="text-sm text-muted-foreground">Erros</p>
                <p className="text-2xl font-bold text-red-600">{resultado.totalErros}</p>
              </div>
              <div className="bg-white p-3 rounded border border-green-200">
                <p className="text-sm text-muted-foreground">Total de Arquivos</p>
                <p className="text-2xl font-bold text-blue-600">{resultado.totalArquivos}</p>
              </div>
            </div>

            <Alert className="border-green-200 bg-white">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                O histórico foi populado com sucesso! As regras automáticas foram geradas baseadas nos dados históricos.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm font-medium">Próximos passos:</p>
              <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                <li>Visualize o histórico em <strong>Histórico de Validações XML</strong></li>
                <li>Monitore o dashboard de cache para performance</li>
                <li>Verifique as regras geradas no Motor de Regras</li>
              </ul>
            </div>

            <Button
              onClick={() => navigate("/historico-validacao-xml" as any)}
              variant="outline"
              className="w-full"
            >
              Ver Histórico de Validações
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Erro:</strong> {erro}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
