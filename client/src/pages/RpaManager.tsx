import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Play, ShieldAlert, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CredenciaisPortais from "@/components/CredenciaisPortais";

export default function RpaManager() {
  const [convenio, setConvenio] = useState<"UNIMED" | "SAUDE_CAIXA" | "IPASGO" | "CASSI">("UNIMED");
  const [url, setUrl] = useState("https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  const rpaMutation = trpc.rpa.executarRoboBuscaDemonstrativo.useMutation({
    onSuccess: (data) => {
      toast.success("Robô finalizou a execução com sucesso!");
      setResultado(data.resultado);
    },
    onError: (error) => {
      toast.error(`Erro ao executar o robô: ${error.message}`);
      setResultado({ erro: error.message });
    }
  });

  const handleExecutar = () => {
    if (!url) {
      toast.error("Por favor, insira a URL do portal.");
      return;
    }
    
    setResultado(null);
    rpaMutation.mutate({
      convenioNome: convenio,
      url,
      login,
      senha
    });
  };

  const handleConvenioChange = (value: "UNIMED" | "SAUDE_CAIXA" | "IPASGO" | "CASSI") => {
    setConvenio(value);
    if (value === "UNIMED") {
      setUrl("https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed");
    } else if (value === "IPASGO") {
      setUrl("https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx");
    } else if (value === "CASSI") {
      setUrl("https://www.cassi.com.br/prestador/");
    } else {
      setUrl("https://autenticacao.saude.caixa.gov.br/");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-xl">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">RPA Central (Robôs)</h1>
            <p className="text-muted-foreground mt-1">
              Testador manual de integrações via interface web simulada.
            </p>
          </div>
        </div>

        <Tabs defaultValue="testador" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="testador" className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Testador Manual
            </TabsTrigger>
            <TabsTrigger value="cofre" className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Cofre de Senhas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="testador" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-primary shadow-md">
            <CardHeader>
              <CardTitle>Configuração do Teste</CardTitle>
              <CardDescription>
                Simule um robô acessando o portal de um convênio. Observe o terminal do backend para ver o Chrome abrir se estiver em modo desenvolvimento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Convênio Alvo</label>
                <Select value={convenio} onValueChange={handleConvenioChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIMED">Unimed (FESP/Central/Regionais)</SelectItem>
                    <SelectItem value="IPASGO">IPASGO</SelectItem>
                    <SelectItem value="CASSI">CASSI</SelectItem>
                    <SelectItem value="SAUDE_CAIXA">Saúde Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">URL do Portal</label>
                <Input 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)} 
                  placeholder="https://..." 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Usuário (Opcional)</label>
                  <Input 
                    value={login} 
                    onChange={(e) => setLogin(e.target.value)} 
                    placeholder="Login do prestador" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Senha (Opcional)</label>
                  <Input 
                    type="password"
                    value={senha} 
                    onChange={(e) => setSenha(e.target.value)} 
                    placeholder="Senha do prestador" 
                  />
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex gap-3 text-sm text-amber-600 mt-4">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <p>
                  <strong>Aviso:</strong> A execução abrirá o navegador no servidor. Em ambiente de desenvolvimento local, a janela será visível (headless = false).
                </p>
              </div>

              <Button 
                className="w-full mt-2" 
                size="lg"
                onClick={handleExecutar}
                disabled={rpaMutation.isPending}
              >
                {rpaMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Executando Robô...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Disparar Robô
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-50 dark:bg-slate-900 border-dashed">
            <CardHeader>
              <CardTitle>Console de Execução</CardTitle>
              <CardDescription>Resultado devolvido pelo robô após a execução.</CardDescription>
            </CardHeader>
            <CardContent>
              {rpaMutation.isPending ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-4 text-muted-foreground">
                  <div className="relative">
                    <Bot className="w-12 h-12 animate-pulse text-primary/50" />
                    <Loader2 className="w-6 h-6 animate-spin absolute -bottom-2 -right-2 text-primary" />
                  </div>
                  <p className="text-sm">O robô está navegando no portal...</p>
                </div>
              ) : resultado ? (
                <div className="space-y-4">
                  {resultado.erro ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 text-sm font-mono break-all">
                      <p className="font-bold mb-1">ERRO FATAL:</p>
                      {resultado.erro}
                    </div>
                  ) : (
                    <>
                      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-700 dark:text-green-400">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="font-bold">Robô executado com sucesso</span>
                        </div>
                        <p className="text-sm">{resultado.mensagem}</p>
                      </div>
                      
                      <div className="space-y-2 text-sm bg-background p-4 rounded-lg border shadow-sm">
                        <div className="grid grid-cols-[120px_1fr] gap-2 border-b pb-2">
                          <span className="font-semibold text-muted-foreground">Pasta destino:</span>
                          <span className="font-mono text-xs break-all">{resultado.pastaDownload}</span>
                        </div>
                        <div className="grid grid-cols-[120px_1fr] gap-2 pt-2">
                          <span className="font-semibold text-muted-foreground">Arquivos baixados:</span>
                          <span className="font-mono font-bold">{resultado.arquivosBaixados}</span>
                        </div>
                        {resultado.screenshotSalva && (
                          <div className="grid grid-cols-[120px_1fr] gap-2 pt-2 border-t mt-2">
                            <span className="font-semibold text-muted-foreground">Screenshot:</span>
                            <span className="font-mono text-xs break-all text-blue-500 flex items-center gap-1">
                              {resultado.screenshotSalva}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/50 border-2 border-dashed border-muted rounded-xl bg-muted/10">
                  <Bot className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm text-center px-6">
                    Aguardando disparo do robô.<br/>O resultado aparecerá aqui.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="cofre" className="mt-0">
        <CredenciaisPortais />
      </TabsContent>
    </Tabs>
  </div>
</DashboardLayout>
  );
}
