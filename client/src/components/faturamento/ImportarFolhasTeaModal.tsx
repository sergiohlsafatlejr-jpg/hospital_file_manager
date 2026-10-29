import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Sparkles,
  Calendar,
  User,
  ArrowRight,
} from "lucide-react";

interface SessaoItem {
  dia?: string;
  data?: string;
  horario?: string;
  quantidade: number;
}

interface GuiaRevisao {
  pagina: number;
  nomePaciente: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  carteirinha?: string | null;
  convenioNome?: string | null;
  numeroGuia?: string | null;
  senha?: string | null;
  especialidade?: string | null;
  codigoProcedimento?: string | null;
  mesAnoReferencia?: string | null;
  nomeProfissional?: string | null;
  conselhoProfissional?: string | null;
  numeroConselhoProfissional?: string | null;
  ufConselhoProfissional?: string | null;
  cid10?: string | null;
  sessoes: SessaoItem[];
  totalSessoes: number;
  totalValor?: number | null;
  valorUnitarioSessao?: string;
  statusMatch?: "pronto" | "novo_paciente";
}

interface ImportarFolhasTeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  loteId: number;
  convenioId?: number;
  estabelecimentoId?: number;
  onSuccess: () => void;
}

export default function ImportarFolhasTeaModal({
  isOpen,
  onClose,
  loteId,
  convenioId,
  estabelecimentoId,
  onSuccess,
}: ImportarFolhasTeaModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [guias, setGuias] = useState<GuiaRevisao[]>([]);
  const [valorPadraoItem, setValorPadraoItem] = useState<string>("80.00");

  const processarMutation = trpc.faturamentoDigitacao.processarPdfFolhasTea.useMutation({
    onSuccess: (data) => {
      const mapeadas: GuiaRevisao[] = (data.guias || []).map((g: any) => ({
        ...g,
        valorUnitarioSessao: g.totalValor && g.totalSessoes > 0 
          ? (Number(g.totalValor) / g.totalSessoes).toFixed(2)
          : valorPadraoItem,
        statusMatch: g.carteirinha ? "pronto" : "novo_paciente",
      }));
      setGuias(mapeadas);
      toast.success(`${mapeadas.length} folha(s) de atendimento extraída(s) com sucesso!`);
    },
    onError: (err) => {
      toast.error(`Erro ao processar PDF: ${err.message}`);
    },
  });

  const confirmarMutation = trpc.faturamentoDigitacao.confirmarImportacaoLoteFolhas.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.guiasCriadas} guia(s) e sessões inseridas na remessa com sucesso!`);
      handleFechar();
      onSuccess();
    },
    onError: (err) => {
      toast.error(`Erro ao salvar guias: ${err.message}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Por favor, selecione um arquivo no formato PDF.");
      return;
    }

    setArquivoNome(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (base64) {
        processarMutation.mutate({
          pdfBase64: base64,
          convenioId,
          estabelecimentoId,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateGuia = (index: number, field: keyof GuiaRevisao, value: any) => {
    setGuias((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "carteirinha") {
        updated[index].statusMatch = value?.trim() ? "pronto" : "novo_paciente";
      }
      return updated;
    });
  };

  const handleRemoverGuia = (index: number) => {
    setGuias((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmar = () => {
    if (guias.length === 0) {
      toast.error("Nenhuma guia para importar.");
      return;
    }

    const payloadGuias = guias.map((g) => ({
      nomePaciente: g.nomePaciente,
      carteirinha: g.carteirinha || undefined,
      cpf: g.cpf || undefined,
      dataNascimento: g.dataNascimento || undefined,
      numeroGuia: g.numeroGuia || undefined,
      senha: g.senha || undefined,
      especialidade: g.especialidade || undefined,
      codigoProcedimento: g.codigoProcedimento || undefined,
      nomeProfissional: g.nomeProfissional || undefined,
      conselhoProfissional: g.conselhoProfissional || undefined,
      numeroConselhoProfissional: g.numeroConselhoProfissional || undefined,
      ufConselhoProfissional: g.ufConselhoProfissional || undefined,
      cid10: g.cid10 || "F84.0",
      valorUnitarioSessao: g.valorUnitarioSessao || valorPadraoItem,
      sessoes: g.sessoes || [],
    }));

    confirmarMutation.mutate({
      loteId,
      guias: payloadGuias,
    });
  };

  const handleFechar = () => {
    setGuias([]);
    setArquivoNome("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const totalProntos = guias.filter((g) => g.statusMatch === "pronto").length;
  const totalPendentes = guias.filter((g) => g.statusMatch === "novo_paciente").length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleFechar()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Importação Inteligente de Folhas TEA (PDF)
              </DialogTitle>
              <DialogDescription>
                Extraia pacientes, especialidades e todas as sessões assinadas de formulários digitalizados com IA.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Etapa 1: Upload */}
        {guias.length === 0 && (
          <div className="my-6 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf"
              className="hidden"
            />
            {processarMutation.isPending ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    A IA está lendo o documento escaneado...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Identificando pacientes, CPFs, especialidades e datas de cada atendimento assinado.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="p-4 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                    Clique para selecionar o PDF ou arraste aqui
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suporta Unimed Goiânia (Form 3046), Unimed Cerrado (Form 092) e Seguros Unimed (avulso ou multipáginas).
                  </p>
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Selecionar Arquivo PDF
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Etapa 2: Tabela de Conferência */}
        {guias.length > 0 && (
          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Banner de Status */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Arquivo: <strong>{arquivoNome}</strong>
                </span>
                <span className="text-muted-foreground">|</span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  {totalProntos} Pronto(s)
                </Badge>
                {totalPendentes > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    {totalPendentes} Novo(s) Paciente(s) - Falta carteirinha
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Valor Padrão/Sessão (R$):</span>
                <Input
                  type="number"
                  value={valorPadraoItem}
                  onChange={(e) => setValorPadraoItem(e.target.value)}
                  className="w-24 h-8 text-xs text-right font-medium"
                />
              </div>
            </div>

            {/* Tabela de Guias */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-12 text-center">Pág</TableHead>
                    <TableHead className="w-48">Paciente</TableHead>
                    <TableHead className="w-44">Carteirinha</TableHead>
                    <TableHead className="w-28">Nº Guia</TableHead>
                    <TableHead className="w-32">Especialidade</TableHead>
                    <TableHead className="w-48">Sessões Extraídas</TableHead>
                    <TableHead className="w-24 text-right">Valor/Sessão</TableHead>
                    <TableHead className="w-12 text-center"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guias.map((guia, idx) => (
                    <TableRow key={idx} className={guia.statusMatch === "novo_paciente" ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {guia.pagina}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs leading-tight text-slate-900 dark:text-slate-100">
                          {guia.nomePaciente}
                        </div>
                        {guia.cpf && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            CPF: {guia.cpf}
                          </div>
                        )}
                        {guia.nomeProfissional && (
                          <div className="text-[10px] text-slate-500">
                            Prof: {guia.nomeProfissional} {guia.numeroConselhoProfissional ? `(${guia.numeroConselhoProfissional})` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={guia.carteirinha || ""}
                            onChange={(e) => handleUpdateGuia(idx, "carteirinha", e.target.value)}
                            placeholder="Digite a carteirinha"
                            className={`h-7 text-xs ${
                              !guia.carteirinha 
                                ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 focus-visible:ring-amber-400" 
                                : "font-mono"
                            }`}
                          />
                          {!guia.carteirinha ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              ⚠️ Digite para salvar no cadastro
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Vinculado
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={guia.numeroGuia || ""}
                          onChange={(e) => handleUpdateGuia(idx, "numeroGuia", e.target.value)}
                          placeholder="Nº Guia"
                          className="h-7 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-normal truncate max-w-[120px]">
                          {guia.especialidade || "TERAPIA"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {guia.sessoes.length || guia.totalSessoes} sessão(ões)
                          </Badge>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1">
                            {guia.sessoes.map((s, sIdx) => (
                              <span key={sIdx} className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">
                                {s.dia ? `Dia ${s.dia}` : s.data?.slice(-5) || "Sessão"}
                              </span>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={guia.valorUnitarioSessao || valorPadraoItem}
                          onChange={(e) => handleUpdateGuia(idx, "valorUnitarioSessao", e.target.value)}
                          className="h-7 text-xs text-right font-medium w-20 ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                          onClick={() => handleRemoverGuia(idx)}
                          title="Remover esta página/guia"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={handleFechar}>
            Cancelar
          </Button>

          {guias.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setGuias([]);
                  setArquivoNome("");
                }}
              >
                Subir Outro Arquivo
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={confirmarMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {confirmarMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando Guias e Itens...
                  </>
                ) : (
                  <>
                    Confirmar e Inserir {guias.length} Guia(s) na Remessa
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
