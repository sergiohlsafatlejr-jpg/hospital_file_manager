import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function UploadFolha() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const utils = trpc.useUtils();
  const uploadMutation = trpc.arquivos.upload.useMutation();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        toast.error("Formato inválido: Por favor, selecione um arquivo Excel (.xlsx)");
        return;
      }
      setSelectedFile(file);
    }
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString() || '';
        encoded = encoded.replace(/^data:(.*,)?/, '');
        if ((encoded.length % 4) > 0) {
          encoded += '='.repeat(4 - (encoded.length % 4));
        }
        resolve(encoded);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !estabelecimentoAtual) return;
    
    setIsUploading(true);
    setUploadProgress(10);
    
    try {
      const base64Data = await toBase64(selectedFile);
      setUploadProgress(50);
      
      await uploadMutation.mutateAsync({
        nome: selectedFile.name,
        tipoArquivo: "rh_folha",
        direcao: "rh",
        convenioId: 0, // Not applicable for RH but required by schema
        estabelecimentoId: estabelecimentoAtual.id,
        conteudo: base64Data,
        dataReferencia: new Date().toISOString()
      });
      
      setUploadProgress(100);
      toast.success("Folha de pagamento importada com sucesso.");
      
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      utils.rh.listFolha.invalidate();
      utils.rh.competencias.invalidate();
      
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao importar: Ocorreu um erro desconhecido.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  if (!estabelecimentoAtual) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Selecione um Estabelecimento</h2>
          <p className="text-muted-foreground">Você precisa selecionar um estabelecimento (ex: Safatle) no canto superior direito para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 p-8 overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importação de Folha de Pagamento</h1>
        <p className="text-muted-foreground mt-2">
          Faça o upload do arquivo Excel contendo a Folha de Pagamento do mês.
        </p>
      </div>

      <div className="grid gap-4 mt-6">
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="flex gap-4">
            <Input
              type="file"
              accept=".xlsx"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center gap-2 h-32 border-dashed border-2 hover:bg-slate-900/50"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <UploadCloud className="w-8 h-8 text-primary" />
              <span className="text-lg">Clique para selecionar o arquivo Excel (.xlsx)</span>
            </Button>
          </div>

          {selectedFile && (
            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {!isUploading && (
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </Button>
                )}
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processando importação...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar e Importar
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
