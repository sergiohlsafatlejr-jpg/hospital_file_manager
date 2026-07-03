import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings, Save, Plus, Trash2, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function RegrasConciliacao() {
  const [selectedConvenioId, setSelectedConvenioId] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newConvenioId, setNewConvenioId] = useState<string>("");
  
  // Form state
  const [formData, setFormData] = useState({
    itensNaoEncontrados: "glosado" as "glosado" | "pago" | "divergente",
    toleranciaValor: "0.00",
    toleranciaPercentual: "0.00",
    usarCodigo: "sim" as "sim" | "nao",
    usarGuia: "sim" as "sim" | "nao",
    usarData: "nao" as "sim" | "nao",
    usarPaciente: "nao" as "sim" | "nao",
    formatoRetorno: "excel_completo" as "excel_completo" | "excel_glosas" | "xml_tiss" | "csv" | "pdf",
    prazoRecursoDias: 30,
    observacoes: "",
  });

  const { data: convenios } = trpc.convenios.list.useQuery({ ativo: "sim" });
  const { data: regras, refetch: refetchRegras } = trpc.regrasConciliacao.list.useQuery();
  const { data: regraAtual, refetch: refetchRegraAtual } = trpc.regrasConciliacao.get.useQuery(
    { convenioId: selectedConvenioId! },
    { enabled: !!selectedConvenioId }
  );

  const upsertMutation = trpc.regrasConciliacao.upsert.useMutation({
    onSuccess: () => {
      toast.success("Regras salvas com sucesso!");
      refetchRegras();
      refetchRegraAtual();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error.message}`);
    },
  });

  const deleteMutation = trpc.regrasConciliacao.delete.useMutation({
    onSuccess: () => {
      toast.success("Regra excluída com sucesso!");
      setSelectedConvenioId(null);
      refetchRegras();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  // Carregar dados da regra quando selecionar convênio
  const handleSelectConvenio = (convenioId: number) => {
    setSelectedConvenioId(convenioId);
    const regra = regras?.find(r => r.convenioId === convenioId);
    if (regra) {
      setFormData({
        itensNaoEncontrados: regra.itensNaoEncontrados as "glosado" | "pago" | "divergente",
        toleranciaValor: regra.toleranciaValor || "0.00",
        toleranciaPercentual: regra.toleranciaPercentual || "0.00",
        usarCodigo: regra.usarCodigo as "sim" | "nao",
        usarGuia: regra.usarGuia as "sim" | "nao",
        usarData: regra.usarData as "sim" | "nao",
        usarPaciente: regra.usarPaciente as "sim" | "nao",
        formatoRetorno: regra.formatoRetorno as "excel_completo" | "excel_glosas" | "xml_tiss" | "csv" | "pdf",
        prazoRecursoDias: regra.prazoRecursoDias || 30,
        observacoes: regra.observacoes || "",
      });
    } else {
      // Reset para valores padrão
      setFormData({
        itensNaoEncontrados: "glosado",
        toleranciaValor: "0.00",
        toleranciaPercentual: "0.00",
        usarCodigo: "sim",
        usarGuia: "sim",
        usarData: "nao",
        usarPaciente: "nao",
        formatoRetorno: "excel_completo",
        prazoRecursoDias: 30,
        observacoes: "",
      });
    }
  };

  const handleSave = () => {
    if (!selectedConvenioId) {
      toast.error("Selecione um convênio");
      return;
    }
    upsertMutation.mutate({
      convenioId: selectedConvenioId,
      ...formData,
    });
  };

  const handleAddConvenio = () => {
    const id = parseInt(newConvenioId);
    if (!id) {
      toast.error("Selecione um convênio");
      return;
    }
    handleSelectConvenio(id);
    setIsAddDialogOpen(false);
    setNewConvenioId("");
  };

  const conveniosComRegras = regras?.map(r => r.convenioId) || [];
  const conveniosSemRegras = convenios?.filter(c => !conveniosComRegras.includes(c.id)) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Regras de Conciliação</h1>
            <p className="text-muted-foreground">
              Configure regras específicas de conciliação para cada convênio
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Convênio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Regras para Convênio</DialogTitle>
                <DialogDescription>
                  Selecione um convênio para configurar regras de conciliação personalizadas.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Convênio</Label>
                <Select value={newConvenioId} onValueChange={setNewConvenioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {conveniosSemRegras.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.nome} {c.codigo && `(${c.codigo})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddConvenio}>Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Lista de convênios com regras */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Convênios</CardTitle>
              <CardDescription>
                {regras?.length || 0} convênios configurados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {regras?.map((regra) => (
                <button
                  key={regra.id}
                  onClick={() => handleSelectConvenio(regra.convenioId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedConvenioId === regra.convenioId
                      ? "bg-primary/10 border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{regra.convenioNome}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    {regra.itensNaoEncontrados === "pago" ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Não encontrado = Pago
                      </Badge>
                    ) : regra.itensNaoEncontrados === "divergente" ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        Não encontrado = Divergente
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        Não encontrado = Glosado
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
              {(!regras || regras.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma regra configurada</p>
                  <p className="text-sm">Clique em "Adicionar Convênio" para começar</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formulário de configuração */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {selectedConvenioId
                  ? `Configurações - ${convenios?.find(c => c.id === selectedConvenioId)?.nome}`
                  : "Selecione um Convênio"}
              </CardTitle>
              <CardDescription>
                {selectedConvenioId
                  ? "Configure como a conciliação deve funcionar para este convênio"
                  : "Selecione um convênio na lista ao lado ou adicione um novo"}
              </CardDescription>
            </CardHeader>
            {selectedConvenioId && (
              <CardContent className="space-y-6">
                <TooltipProvider>
                  {/* Comportamento de itens não encontrados */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Itens Não Encontrados no Retorno</h3>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Define o que fazer quando um procedimento enviado não é encontrado no arquivo de retorno do convênio.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, itensNaoEncontrados: "glosado" })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.itensNaoEncontrados === "glosado"
                            ? "border-red-500 bg-red-50"
                            : "border-muted hover:border-red-300"
                        }`}
                      >
                        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                        <div className="font-medium text-center">Glosado</div>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          Considerar como glosa total
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, itensNaoEncontrados: "pago" })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.itensNaoEncontrados === "pago"
                            ? "border-green-500 bg-green-50"
                            : "border-muted hover:border-green-300"
                        }`}
                      >
                        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                        <div className="font-medium text-center">Pago</div>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          Considerar como pago (ex: Bradesco)
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, itensNaoEncontrados: "divergente" })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          formData.itensNaoEncontrados === "divergente"
                            ? "border-yellow-500 bg-yellow-50"
                            : "border-muted hover:border-yellow-300"
                        }`}
                      >
                        <HelpCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                        <div className="font-medium text-center">Divergente</div>
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          Marcar para análise manual
                        </p>
                      </button>
                    </div>
                  </div>

                  <Separator />

                  {/* Tolerância de valores */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Tolerância de Diferença de Valores</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tolerância em Reais (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.toleranciaValor}
                          onChange={(e) => setFormData({ ...formData, toleranciaValor: e.target.value })}
                          placeholder="0.00"
                        />
                        <p className="text-xs text-muted-foreground">
                          Diferenças até este valor serão ignoradas
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Tolerância Percentual (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.toleranciaPercentual}
                          onChange={(e) => setFormData({ ...formData, toleranciaPercentual: e.target.value })}
                          placeholder="0.00"
                        />
                        <p className="text-xs text-muted-foreground">
                          Diferenças até este percentual serão ignoradas
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Campos para comparação */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Campos para Comparação (Match)</h3>
                    <p className="text-sm text-muted-foreground">
                      Selecione quais campos devem ser usados para encontrar correspondência entre itens enviados e retornados
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <Label>Código do Procedimento</Label>
                          <p className="text-xs text-muted-foreground">Comparar pelo código TUSS/CBHPM</p>
                        </div>
                        <Switch
                          checked={formData.usarCodigo === "sim"}
                          onCheckedChange={(checked) => setFormData({ ...formData, usarCodigo: checked ? "sim" : "nao" })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <Label>Número da Guia</Label>
                          <p className="text-xs text-muted-foreground">Comparar pelo número da guia</p>
                        </div>
                        <Switch
                          checked={formData.usarGuia === "sim"}
                          onCheckedChange={(checked) => setFormData({ ...formData, usarGuia: checked ? "sim" : "nao" })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <Label>Data de Execução</Label>
                          <p className="text-xs text-muted-foreground">Comparar pela data do procedimento</p>
                        </div>
                        <Switch
                          checked={formData.usarData === "sim"}
                          onCheckedChange={(checked) => setFormData({ ...formData, usarData: checked ? "sim" : "nao" })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <Label>Nome do Paciente</Label>
                          <p className="text-xs text-muted-foreground">Comparar pelo nome do beneficiário</p>
                        </div>
                        <Switch
                          checked={formData.usarPaciente === "sim"}
                          onCheckedChange={(checked) => setFormData({ ...formData, usarPaciente: checked ? "sim" : "nao" })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Formato do retorno */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Formato do Arquivo de Retorno</Label>
                      <Select
                        value={formData.formatoRetorno}
                        onValueChange={(value: "excel_completo" | "excel_glosas" | "xml_tiss" | "csv" | "pdf") =>
                          setFormData({ ...formData, formatoRetorno: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excel_completo">Excel Completo (todos os itens)</SelectItem>
                          <SelectItem value="excel_glosas">Excel só com Glosas</SelectItem>
                          <SelectItem value="xml_tiss">XML TISS</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Prazo para Recurso (dias)</Label>
                      <Input
                        type="number"
                        value={formData.prazoRecursoDias}
                        onChange={(e) => setFormData({ ...formData, prazoRecursoDias: parseInt(e.target.value) || 30 })}
                      />
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      placeholder="Anotações sobre particularidades deste convênio..."
                      rows={3}
                    />
                  </div>
                </TooltipProvider>

                {/* Botões de ação */}
                <div className="flex justify-between pt-4">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const regra = regras?.find(r => r.convenioId === selectedConvenioId);
                      if (regra) {
                        deleteMutation.mutate({ id: regra.id });
                      }
                    }}
                    disabled={!regras?.find(r => r.convenioId === selectedConvenioId)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir Regras
                  </Button>
                  <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {upsertMutation.isPending ? "Salvando..." : "Salvar Configurações"}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
