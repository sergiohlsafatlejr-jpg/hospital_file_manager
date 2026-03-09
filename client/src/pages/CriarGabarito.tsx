import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useEstabelecimento } from "@/contexts/EstabelecimentoContext";
import { AutocompleteCodigoItem } from "@/components/AutocompleteCodigoItem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, PlusCircle, Trash2, BookOpen, Loader2, Save, Package, Building2
} from "lucide-react";

export default function CriarGabarito() {
  const { estabelecimentoAtual } = useEstabelecimento();
  const [, setLocation] = useLocation();
  const estabelecimentoId = estabelecimentoAtual?.id || 1;

  // Estado do formulário
  const [procedimentos, setProcedimentos] = useState<Array<{ codigo: string; descricao: string }>>([{ codigo: "", descricao: "" }]);
  const [observacoes, setObservacoes] = useState("");
  const [selectedSetor, setSelectedSetor] = useState<string>("");
  const [selectedConvenioId, setSelectedConvenioId] = useState<string>("");
  const [itens, setItens] = useState<any[]>([{ codigo: "", descricao: "", tipo: "MAT_MED", frequencia: 100, quantidadeMedia: 1, quantidadeMin: 1, quantidadeMax: 1, valorMedio: 0 }]);

  // Query de setores disponíveis
  const setores = trpc.padroesCobranca.listarSetores.useQuery({ estabelecimentoId });

  // Query de convênios cadastrados
  const conveniosSafatle = trpc.convenioMapeamento.conveniosSafatle.useQuery({ estabelecimentoId });

  // Mutation
  const criarGabarito = trpc.padroesCobranca.criarGabarito.useMutation({
    onSuccess: (data) => {
      toast.success(data.atualizado ? "Gabarito atualizado com sucesso!" : "Gabarito criado com sucesso!");
      setLocation("/padroes-cobranca");
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // Helpers para múltiplos procedimentos
  const addProcedimento = () => setProcedimentos(prev => [...prev, { codigo: "", descricao: "" }]);
  const removeProcedimento = (idx: number) => {
    if (procedimentos.length > 1) setProcedimentos(prev => prev.filter((_, i) => i !== idx));
  };
  const updateProcedimento = (idx: number, field: "codigo" | "descricao", value: string) => {
    setProcedimentos(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  // Código e descrição combinados
  const codigoCombinado = procedimentos.map(p => p.codigo.trim()).filter(Boolean).join(" + ");
  const descricaoCombinada = procedimentos.map(p => p.descricao.trim()).filter(Boolean).join(" + ");

  // Adicionar item
  const addItem = () => {
    setItens([...itens, { codigo: "", descricao: "", tipo: "MAT_MED", frequencia: 100, quantidadeMedia: 1, quantidadeMin: 1, quantidadeMax: 1, valorMedio: 0 }]);
  };

  // Remover item
  const removeItem = (idx: number) => {
    if (itens.length > 1) setItens(itens.filter((_, i) => i !== idx));
  };

  // Submeter
  const handleSubmit = () => {
    if (!codigoCombinado || !descricaoCombinada) {
      toast.error("Todos os procedimentos devem ter código e descrição.");
      return;
    }
    if (itens.some(i => !i.codigo || !i.descricao)) {
      toast.error("Todos os itens devem ter código e descrição.");
      return;
    }
    criarGabarito.mutate({
      estabelecimentoId,
      convenioId: selectedConvenioId ? Number(selectedConvenioId) : undefined,
      setor: selectedSetor || undefined,
      codigoProcedimentoPrincipal: codigoCombinado,
      descricaoProcedimentoPrincipal: descricaoCombinada,
      itensAssociados: itens.map(item => ({
        ...item,
        quantidadeMedia: ((item.quantidadeMin ?? 1) + (item.quantidadeMax ?? 1)) / 2,
        quantidadeMin: item.quantidadeMin ?? 1,
        quantidadeMax: item.quantidadeMax ?? 1,
      })),
      observacoes: observacoes || undefined,
    });
  };

  const handleVoltar = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/padroes-cobranca");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleVoltar}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-blue-500" />
              Criar Gabarito Manual
            </h1>
            <p className="text-muted-foreground">Defina um padrão de composição manualmente. Você pode combinar múltiplos procedimentos (ex: CIRURGIA A + CIRURGIA B). Este gabarito não será sobrescrito na regeneração automática.</p>
          </div>
          <Button onClick={handleSubmit} disabled={criarGabarito.isPending} className="gap-2" size="lg">
            {criarGabarito.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Criar Gabarito
          </Button>
        </div>

        {/* Procedimentos Principais */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Procedimentos Principais</CardTitle>
                <CardDescription>Adicione um ou mais procedimentos que juntos formam o padrão. Ex: Cirurgia A + Cirurgia B = um padrão combinado.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={addProcedimento}>
                <PlusCircle className="h-4 w-4" /> Adicionar Procedimento
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {procedimentos.map((proc, idx) => (
              <div key={idx} className="flex items-center gap-4">
                {idx > 0 && <Badge variant="outline" className="shrink-0 bg-blue-500/10 text-blue-600 border-blue-500/30 text-lg px-3 py-1">+</Badge>}
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <Label className="text-sm font-medium">Código do Procedimento {idx + 1} *</Label>
                    <Input
                      value={proc.codigo}
                      onChange={(e) => updateProcedimento(idx, "codigo", e.target.value)}
                      placeholder="Ex: 10101039"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Descrição do Procedimento {idx + 1} *</Label>
                    <Input
                      value={proc.descricao}
                      onChange={(e) => updateProcedimento(idx, "descricao", e.target.value)}
                      placeholder="Ex: Consulta em Pronto Socorro"
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 h-10 w-10 p-0 shrink-0"
                  onClick={() => removeProcedimento(idx)}
                  disabled={procedimentos.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {procedimentos.length > 1 && (
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Padrão combinado:</p>
                <p className="text-base font-semibold mt-1">{codigoCombinado || "..."}</p>
                <p className="text-sm text-muted-foreground">{descricaoCombinada || "..."}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Convênio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Convênio (opcional)
            </CardTitle>
            <CardDescription>
              Vincule este gabarito a um convênio específico. Cada convênio pode ter composições diferentes para o mesmo procedimento.
              Se não selecionado, o gabarito será aplicado para todos os convênios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedConvenioId} onValueChange={(v) => setSelectedConvenioId(v === "todos" ? "" : v)}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Todos os convênios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {(conveniosSafatle.data as any[])?.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}{c.codigo ? ` (${c.codigo})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedConvenioId && (
              <p className="text-sm text-blue-500 mt-2">
                Este gabarito será vinculado ao convênio <strong>{(conveniosSafatle.data as any[])?.find((c: any) => String(c.id) === selectedConvenioId)?.nome || selectedConvenioId}</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Setor de Atendimento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Setor de Atendimento (opcional)</CardTitle>
            <CardDescription>
              Selecione o setor para o qual este gabarito se aplica. Um mesmo procedimento pode ter composições diferentes
              dependendo do setor (ex: Centro Cirúrgico vs Ambulatório). Se não selecionado, o gabarito será genérico.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedSetor} onValueChange={(v) => setSelectedSetor(v === "geral" ? "" : v)}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Geral (todos os setores)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geral">Geral (todos os setores)</SelectItem>
                {(setores.data as any[])?.map((s: any) => (
                  <SelectItem key={s.setor} value={s.setor}>{s.setor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSetor && (
              <p className="text-sm text-blue-500 mt-2">
                Este gabarito será aplicado apenas para itens do setor <strong>{selectedSetor}</strong>.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Itens do Kit / Composição */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Itens do Kit / Composição
                </CardTitle>
                <CardDescription>{itens.length} item(ns) no kit. Use o autocomplete para buscar códigos já importados no sistema.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={addItem}>
                <PlusCircle className="h-4 w-4" /> Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header da tabela */}
              <div className="grid grid-cols-[minmax(180px,2fr)_minmax(250px,4fr)_minmax(120px,1.5fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_50px] gap-3 p-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
                <div>Código</div>
                <div>Descrição</div>
                <div>Tipo</div>
                <div>Freq %</div>
                <div>Qtd Mín</div>
                <div>Qtd Máx</div>
                <div>Valor (R$)</div>
                <div className="text-center">Ação</div>
              </div>
              {/* Linhas dos itens */}
              <div className="divide-y divide-border">
                {itens.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(180px,2fr)_minmax(250px,4fr)_minmax(120px,1.5fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_50px] gap-3 items-center p-3 hover:bg-muted/20 transition-colors">
                    <div>
                      <AutocompleteCodigoItem
                        estabelecimentoId={estabelecimentoId}
                        value={item.codigo}
                        onChange={(selected) => {
                          const newItens = [...itens];
                          newItens[idx] = {
                            ...newItens[idx],
                            codigo: selected.codigo,
                            descricao: selected.descricao,
                            tipo: selected.tipo || newItens[idx].tipo,
                            quantidadeMin: Math.max(1, Math.floor(selected.quantidadeMedia * 0.5)),
                            quantidadeMax: Math.max(1, Math.ceil(selected.quantidadeMedia * 1.5)),
                            valorMedio: selected.valorMedio || newItens[idx].valorMedio,
                          };
                          setItens(newItens);
                        }}
                        onChangeRaw={(val) => {
                          const newItens = [...itens];
                          newItens[idx].codigo = val;
                          setItens(newItens);
                        }}
                        placeholder="Buscar código..."
                      />
                    </div>
                    <div>
                      <Input value={item.descricao} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].descricao = e.target.value;
                        setItens(newItens);
                      }} placeholder="Descrição do item" className="h-9 text-sm" />
                    </div>
                    <div>
                      <Select value={item.tipo} onValueChange={(v) => {
                        const newItens = [...itens];
                        newItens[idx].tipo = v;
                        setItens(newItens);
                      }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAT_MED">Mat/Med</SelectItem>
                          <SelectItem value="PROCEDIMENTO">Procedimento</SelectItem>
                          <SelectItem value="TAXA">Taxa</SelectItem>
                          <SelectItem value="DIARIA">Diária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Input type="number" min={0} max={100} value={item.frequencia} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].frequencia = Number(e.target.value);
                        setItens(newItens);
                      }} className="h-9 text-sm" />
                    </div>
                    <div>
                      <Input type="number" min={0} step={0.1} value={item.quantidadeMin ?? 1} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].quantidadeMin = Number(e.target.value);
                        setItens(newItens);
                      }} placeholder="Mín" className="h-9 text-sm" />
                    </div>
                    <div>
                      <Input type="number" min={0} step={0.1} value={item.quantidadeMax ?? 1} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].quantidadeMax = Number(e.target.value);
                        setItens(newItens);
                      }} placeholder="Máx" className="h-9 text-sm" />
                    </div>
                    <div>
                      <Input type="number" min={0} step={0.01} value={item.valorMedio} onChange={(e) => {
                        const newItens = [...itens];
                        newItens[idx].valorMedio = Number(e.target.value);
                        setItens(newItens);
                      }} className="h-9 text-sm" />
                    </div>
                    <div className="flex justify-center">
                      <Button size="sm" variant="ghost" className="text-red-500 h-9 w-9 p-0" onClick={() => removeItem(idx)} disabled={itens.length <= 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Observações (opcional)</CardTitle>
            <CardDescription>Notas adicionais sobre este gabarito.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas sobre este gabarito..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Footer com botões */}
        <div className="flex items-center justify-between pb-8">
          <Button variant="outline" onClick={handleVoltar}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={criarGabarito.isPending} className="gap-2" size="lg">
            {criarGabarito.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            Criar Gabarito
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
