import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, AlertTriangle, CheckCircle, FileText, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export function ImportadorSaudeCaixaDialog({ open, onOpenChange, onSaved }: { open: boolean, onOpenChange: (open: boolean) => void, onSaved?: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const importarPdf = trpc.financeiro.recebiveis.importarSaudeCaixaPdf.useMutation();
  const salvarSaudeCaixaNoDemonstrativo = trpc.financeiro.recebiveis.salvarSaudeCaixaNoDemonstrativo.useMutation();

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          setLoading(true);
          const base64Data = (evt.target?.result as string).split(',')[1];
          const result = await importarPdf.mutateAsync({ base64File: base64Data });
          setItems(result.items || []);
          toast.success(`${result.items.length} itens extraídos do PDF!`);
        } catch (err: any) {
          toast.error("Erro ao importar: " + err.message);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleImportarTodos = async () => {
    if (items.length === 0) return;
    try {
      setLoading(true);
      
      const itemsToSave = items.filter(i => !i.isNegativeBlock);

      await salvarSaudeCaixaNoDemonstrativo.mutateAsync({
        itens: itemsToSave
      });

      toast.success(`${itemsToSave.length} itens importados para o Demonstrativo!`);
      if (onSaved) onSaved();
      onOpenChange(false);
      setItems([]);
    } catch (error: any) {
      toast.error("Erro ao salvar itens: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Importador Saúde Caixa (PDF)
          </DialogTitle>
          <DialogDescription>
            Faça upload do Demonstrativo de Análise de Conta da Saúde Caixa (formato Benner) para extrair os procedimentos, valores pagos e glosas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg border border-border">
            <div className="text-sm">
              {items.length === 0 ? (
                <span className="text-muted-foreground">Nenhum arquivo carregado.</span>
              ) : (
                <span className="font-medium text-primary">{items.length} linhas processadas.</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleUpload} disabled={loading}>
                <Upload className="h-4 w-4 mr-2" />
                {loading ? "Processando..." : "Selecionar PDF"}
              </Button>
              {items.length > 0 && (
                <Button onClick={handleImportarTodos} disabled={loading}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Salvar e Conciliar ({items.filter(i => !i.isNegativeBlock).length})
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 border rounded-md">
            {items.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-3 font-semibold text-muted-foreground">Data</th>
                    <th className="p-3 font-semibold text-muted-foreground">Código</th>
                    <th className="p-3 font-semibold text-muted-foreground">Descrição</th>
                    <th className="p-3 font-semibold text-right text-muted-foreground">Qtd</th>
                    <th className="p-3 font-semibold text-right text-muted-foreground">Apresentado</th>
                    <th className="p-3 font-semibold text-right text-muted-foreground">Pago</th>
                    <th className="p-3 font-semibold text-right text-muted-foreground">Glosa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, idx) => (
                    <tr key={idx} className={cn("hover:bg-muted/30 transition-colors", item.isNegativeBlock && "opacity-60 bg-red-50/10", item.isGlosa && !item.isNegativeBlock && "bg-orange-50/20")}>
                      <td className="p-3 whitespace-nowrap">{item.dataFaturamento}</td>
                      <td className="p-3 whitespace-nowrap text-xs font-medium text-muted-foreground">{item.codigo}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{item.descricao}</span>
                          {item.motivoGlosa && (
                            <span className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3" /> Motivo: {item.motivoGlosa}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">{item.quantidade}</td>
                      <td className="p-3 text-right">{formatCurrency(item.valorApresentado)}</td>
                      <td className="p-3 text-right font-medium text-green-600">{formatCurrency(item.valorPago)}</td>
                      <td className="p-3 text-right">
                        {item.valorGlosa > 0 ? (
                          <span className="text-red-500 font-semibold">-{formatCurrency(item.valorGlosa)}</span>
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <FileText className="h-12 w-12 opacity-20 mb-3" />
                <p>Nenhum dado extraído ainda.</p>
                <p className="text-xs mt-1">Faça upload de um PDF Saúde Caixa para visualizar os dados aqui.</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
