import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

interface ContaValidada {
  id_conta: string;
  prestador_nome: string;
  operadora: string;
  paciente_nome: string;
  valor_total: number;
  valido: boolean;
  score_conformidade: number;
  erros: Array<{
    tipo: string;
    campo: string;
    mensagem: string;
    severidade: string;
  }>;
  alertas: Array<{
    tipo: string;
    mensagem: string;
    severidade: string;
    sugestao?: string;
  }>;
}

interface RelatorioProcessamento {
  total_contas: number;
  contas_validas: number;
  contas_invalidas: number;
  score_conformidade_medio: number;
  tempo_total_ms: number;
  erros_processamento: string[];
  alertas_processamento: string[];
}

export default function ImportacaoXML() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioProcessamento | null>(null);
  const [contas, setContas] = useState<ContaValidada[]>([]);
  const [aba, setAba] = useState('upload');

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleArrastoDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.xml')) {
        setArquivo(file);
        toast.success(`Arquivo selecionado: ${file.name}`);
      } else {
        toast.error('Por favor, selecione um arquivo XML válido');
      }
    }
  }, []);

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setArquivo(files[0]);
      toast.success(`Arquivo selecionado: ${files[0].name}`);
    }
  };

  const procesarXML = async () => {
    if (!arquivo) {
      toast.error('Selecione um arquivo XML');
      return;
    }

    setCarregando(true);
    try {
      const formData = new FormData();
      formData.append('file', arquivo);

      const response = await fetch(`${API_BASE_URL}/api/v1/processar-e-validar`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Erro ao processar arquivo');
      }

      const data = await response.json();
      setRelatorio(data);
      setAba('resultado');
      toast.success(`Processamento concluído: ${data.contas_validas}/${data.total_contas} contas válidas`);
    } catch (erro) {
      console.error('Erro:', erro);
      toast.error('Erro ao processar arquivo XML');
    } finally {
      setCarregando(false);
    }
  };

  const exportarRelatorio = () => {
    if (!relatorio) return;

    const conteudo = `
RELATÓRIO DE PROCESSAMENTO E VALIDAÇÃO DE CONTAS
================================================

Data: ${new Date().toLocaleString('pt-BR')}

RESUMO EXECUTIVO
----------------
Total de contas: ${relatorio.total_contas}
Contas válidas: ${relatorio.contas_validas} (${((relatorio.contas_validas / relatorio.total_contas) * 100).toFixed(1)}%)
Contas inválidas: ${relatorio.contas_invalidas} (${((relatorio.contas_invalidas / relatorio.total_contas) * 100).toFixed(1)}%)
Score de conformidade médio: ${relatorio.score_conformidade_medio.toFixed(2)}/100
Tempo total de processamento: ${relatorio.tempo_total_ms.toFixed(2)}ms

${relatorio.erros_processamento.length > 0 ? `
ERROS DE PROCESSAMENTO
----------------------
${relatorio.erros_processamento.map((e, i) => `${i + 1}. ${e}`).join('\n')}
` : ''}

${relatorio.alertas_processamento.length > 0 ? `
ALERTAS DE PROCESSAMENTO
------------------------
${relatorio.alertas_processamento.map((a, i) => `${i + 1}. ${a}`).join('\n')}
` : ''}

RECOMENDAÇÕES
--------------
${relatorio.contas_invalidas > 0 ? `- Revisar ${relatorio.contas_invalidas} contas inválidas antes do envio` : ''}
${relatorio.score_conformidade_medio < 80 ? `- Score médio abaixo de 80: investigar padrões de erro` : ''}
${relatorio.tempo_total_ms > 5000 ? `- Tempo de processamento elevado: considerar dividir o arquivo` : ''}
    `.trim();

    const blob = new Blob([conteudo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-validacao-${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Relatório exportado com sucesso');
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importação e Validação XML</h1>
        <p className="text-gray-600 mt-2">Processe e valide contas de faturamento em formato TISS/ANS</p>
      </div>

      <Tabs value={aba} onValueChange={setAba} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="resultado" disabled={!relatorio}>
            Resultado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Arquivo XML</CardTitle>
              <CardDescription>
                Arraste e solte um arquivo XML ou clique para selecionar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                }}
                onDrop={handleArrastoDrop}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-900">
                  {arquivo ? arquivo.name : 'Arraste um arquivo XML aqui'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ou
                </p>
                <label className="mt-2 inline-block">
                  <span className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                    clique para selecionar
                  </span>
                  <input
                    type="file"
                    accept=".xml"
                    onChange={handleSelecionarArquivo}
                    className="hidden"
                  />
                </label>
              </div>

              {arquivo && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Arquivo selecionado: <strong>{arquivo.name}</strong> ({(arquivo.size / 1024).toFixed(2)} KB)
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={procesarXML}
                disabled={!arquivo || carregando}
                className="w-full"
                size="lg"
              >
                {carregando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Processar e Validar
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resultado" className="space-y-4">
          {relatorio && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Resumo do Processamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total de Contas</p>
                      <p className="text-2xl font-bold text-blue-600">{relatorio.total_contas}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Válidas</p>
                      <p className="text-2xl font-bold text-green-600">{relatorio.contas_validas}</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Inválidas</p>
                      <p className="text-2xl font-bold text-red-600">{relatorio.contas_invalidas}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Score Médio</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {relatorio.score_conformidade_medio.toFixed(1)}/100
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Tempo de Processamento</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {relatorio.tempo_total_ms.toFixed(2)}ms
                    </p>
                  </div>

                  {relatorio.erros_processamento.length > 0 && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        <strong>Erros encontrados:</strong>
                        <ul className="mt-2 list-disc list-inside">
                          {relatorio.erros_processamento.map((erro, i) => (
                            <li key={i} className="text-sm">{erro}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {relatorio.alertas_processamento.length > 0 && (
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        <strong>Alertas:</strong>
                        <ul className="mt-2 list-disc list-inside">
                          {relatorio.alertas_processamento.map((alerta, i) => (
                            <li key={i} className="text-sm">{alerta}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={exportarRelatorio} variant="outline" className="flex-1">
                      <Download className="mr-2 h-4 w-4" />
                      Exportar Relatório
                    </Button>
                    <Button
                      onClick={() => {
                        setArquivo(null);
                        setRelatorio(null);
                        setContas([]);
                        setAba('upload');
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Processar Outro Arquivo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
