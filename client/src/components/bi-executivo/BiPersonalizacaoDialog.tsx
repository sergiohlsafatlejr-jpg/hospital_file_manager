import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  BI_KPI_CATALOG,
  BI_THEME_PRESETS,
  DEFAULT_BI_CLIENT_CONFIG,
  type BiAbaId,
  type BiClientConfig,
  type BiFiltroId,
  type BiKpiId,
  type BiTemaPreset,
} from "@shared/biPersonalizadoConfig";

interface BiPersonalizacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estabelecimentoId: number;
  estabelecimentoNome: string;
  configAtual: BiClientConfig;
  onSaved: () => void;
}

async function redimensionarLogoParaDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml" && file.size <= 150_000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Falha ao ler SVG."));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 380;
        const maxH = 140;
        let w = img.width;
        let h = img.height;
        const scale = Math.min(maxW / w, maxH / h, 1);
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível no navegador."));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png", 0.92));
      };
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function BiPersonalizacaoDialog({
  open,
  onOpenChange,
  estabelecimentoId,
  estabelecimentoNome,
  configAtual,
  onSaved,
}: BiPersonalizacaoDialogProps) {
  const [draft, setDraft] = useState<BiClientConfig>(configAtual);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(configAtual);
    }
  }, [open, configAtual]);

  const salvarMut = trpc.painelBiPersonalizado.salvarConfiguracao.useMutation({
    onSuccess: () => {
      toast.success(`Personalização BI salva para ${estabelecimentoNome}!`);
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível salvar a personalização.");
    },
  });

  const resetarMut = trpc.painelBiPersonalizado.resetarConfiguracao.useMutation({
    onSuccess: (res) => {
      setDraft(res.config);
      toast.success("Padrão executivo restaurado para este estabelecimento.");
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Falha ao restaurar configuração padrão.");
    },
  });

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem PNG, JPG, SVG ou WebP.");
      return;
    }
    try {
      const dataUrl = await redimensionarLogoParaDataUrl(file);
      setDraft((prev) => ({ ...prev, logoUrl: dataUrl }));
      toast.success("Logo carregada! Clique em Salvar para aplicar ao cliente.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar a logo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleAba = (aba: BiAbaId) => {
    setDraft((prev) => {
      const jaTem = prev.abasVisiveis.includes(aba);
      if (jaTem && prev.abasVisiveis.length === 1) {
        toast.info("Pelo menos uma aba precisa permanecer ativa.");
        return prev;
      }
      const novas = jaTem
        ? prev.abasVisiveis.filter((a) => a !== aba)
        : [...prev.abasVisiveis, aba];
      return { ...prev, abasVisiveis: novas };
    });
  };

  const toggleFiltro = (filtro: BiFiltroId) => {
    setDraft((prev) => {
      const jaTem = prev.filtrosVisiveis.includes(filtro);
      const novos = jaTem
        ? prev.filtrosVisiveis.filter((f) => f !== filtro)
        : [...prev.filtrosVisiveis, filtro];
      return { ...prev, filtrosVisiveis: novos };
    });
  };

  const toggleKpi = (kpi: BiKpiId) => {
    setDraft((prev) => {
      const jaTem = prev.kpisVisiveis.includes(kpi);
      if (jaTem) {
        if (prev.kpisVisiveis.length === 1) {
          toast.info("Mantenha pelo menos 1 cartão KPI ativo.");
          return prev;
        }
        return { ...prev, kpisVisiveis: prev.kpisVisiveis.filter((k) => k !== kpi) };
      }
      if (prev.kpisVisiveis.length >= 8) {
        toast.info("Máximo de 8 cartões KPI simultâneos para manter leitura executiva.");
        return prev;
      }
      return { ...prev, kpisVisiveis: [...prev.kpisVisiveis, kpi] };
    });
  };

  const moverKpi = (index: number, direcao: -1 | 1) => {
    setDraft((prev) => {
      const novoIdx = index + direcao;
      if (novoIdx < 0 || novoIdx >= prev.kpisVisiveis.length) return prev;
      const arr = [...prev.kpisVisiveis];
      const [item] = arr.splice(index, 1);
      arr.splice(novoIdx, 0, item);
      return { ...prev, kpisVisiveis: arr };
    });
  };

  const selecionarPreset = (preset: Exclude<BiTemaPreset, "custom">) => {
    setDraft((prev) => ({
      ...prev,
      temaPreset: preset,
      corFundoCustom: null,
      corPainelCustom: null,
      corDestaqueCustom: null,
      corCardKpiCustom: null,
      corBarraGraficoCustom: null,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Personalizar Painel BI — {estabelecimentoNome}
          </DialogTitle>
          <DialogDescription>
            Configure a marca, paleta de cores, abas, cartões KPI e regras específicas deste cliente.
            Cada hospital mantém seu próprio perfil salvo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="marca" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="marca" className="text-xs">
              <Palette className="h-3.5 w-3.5 mr-1.5" />
              Marca & Cores
            </TabsTrigger>
            <TabsTrigger value="layout" className="text-xs">
              <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
              Abas & Blocos
            </TabsTrigger>
            <TabsTrigger value="kpis" className="text-xs">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Cartões KPI
            </TabsTrigger>
            <TabsTrigger value="regras" className="text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              Regras & Fonte
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: MARCA E CORES */}
          <TabsContent value="marca" className="space-y-5 pt-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Logomarca do Hospital / Cliente
              </Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="h-16 w-44 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 shrink-0">
                  {draft.logoUrl ? (
                    <img
                      src={draft.logoUrl}
                      alt="Logo cliente"
                      className="max-h-12 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400 text-center">
                      Sem logo enviada
                    </span>
                  )}
                </div>
                <div className="flex-1 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleUploadLogo}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4 mr-1.5" />
                      Enviar imagem da logo
                    </Button>
                    {draft.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => setDraft((p) => ({ ...p, logoUrl: null }))}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Recomendado: PNG ou SVG com fundo transparente (ex.: marca do hospital).
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome curto do cliente (opcional)</Label>
                <Input
                  value={draft.nomeExibicao || ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, nomeExibicao: e.target.value || null }))
                  }
                  placeholder={estabelecimentoNome}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Título superior do painel</Label>
                <Input
                  value={draft.tituloRelatorio}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, tituloRelatorio: e.target.value }))
                  }
                  placeholder="INDICADORES DE FATURAMENTO"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Assinatura esquerda do rodapé</Label>
                <Input
                  value={draft.rodapeTexto}
                  onChange={(e) => setDraft((p) => ({ ...p, rodapeTexto: e.target.value }))}
                  placeholder="CICLO DA RECEITA - FATURADO AO RECEBIMENTO"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Paleta de Cores do Painel
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(Object.keys(BI_THEME_PRESETS) as Array<Exclude<BiTemaPreset, "custom">>).map(
                  (key) => {
                    const preset = BI_THEME_PRESETS[key];
                    const ativo = draft.temaPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selecionarPreset(key)}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                          ativo
                            ? "border-sky-600 bg-sky-50/70 ring-1 ring-sky-600"
                            : "border-slate-200 hover:border-slate-300 bg-white",
                        )}
                      >
                        <div className="flex flex-col gap-1 pt-0.5 shrink-0">
                          <div
                            className="h-5 w-10 rounded border border-black/10"
                            style={{ background: preset.canvasBg }}
                          />
                          <div className="flex gap-1">
                            <span
                              className="h-2.5 w-4.5 rounded-xs"
                              style={{ backgroundColor: preset.accentColor }}
                            />
                            <span
                              className="h-2.5 w-4.5 rounded-xs border border-slate-300"
                              style={{ backgroundColor: preset.kpiCardBg }}
                            />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {preset.nome}
                            </p>
                            {ativo && <Check className="h-4 w-4 text-sky-600 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                            {preset.descricao}
                          </p>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Cores sob medida da marca do hospital (opcional)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Ajuste fino caso queira aplicar o código hexadecimal exato do cliente.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Cor Fundo</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft.corFundoCustom || "#073b4c"}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: "custom",
                          corFundoCustom: e.target.value,
                        }))
                      }
                      className="h-8 w-10 rounded cursor-pointer border border-slate-200"
                    />
                    <Input
                      value={draft.corFundoCustom || ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: e.target.value ? "custom" : p.temaPreset,
                          corFundoCustom: e.target.value || null,
                        }))
                      }
                      placeholder="#073b4c"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Cor Destaque</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft.corDestaqueCustom || "#e87a1e"}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: "custom",
                          corDestaqueCustom: e.target.value,
                        }))
                      }
                      className="h-8 w-10 rounded cursor-pointer border border-slate-200"
                    />
                    <Input
                      value={draft.corDestaqueCustom || ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: e.target.value ? "custom" : p.temaPreset,
                          corDestaqueCustom: e.target.value || null,
                        }))
                      }
                      placeholder="#e87a1e"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Cartão KPI</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft.corCardKpiCustom || "#eff4f6"}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: "custom",
                          corCardKpiCustom: e.target.value,
                        }))
                      }
                      className="h-8 w-10 rounded cursor-pointer border border-slate-200"
                    />
                    <Input
                      value={draft.corCardKpiCustom || ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: e.target.value ? "custom" : p.temaPreset,
                          corCardKpiCustom: e.target.value || null,
                        }))
                      }
                      placeholder="#eff4f6"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Barras Gráfico</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={draft.corBarraGraficoCustom || "#c77d32"}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: "custom",
                          corBarraGraficoCustom: e.target.value,
                        }))
                      }
                      className="h-8 w-10 rounded cursor-pointer border border-slate-200"
                    />
                    <Input
                      value={draft.corBarraGraficoCustom || ""}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          temaPreset: e.target.value ? "custom" : p.temaPreset,
                          corBarraGraficoCustom: e.target.value || null,
                        }))
                      }
                      placeholder="#c77d32"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ABA 2: ABAS & BLOCOS */}
          <TabsContent value="layout" className="space-y-5 pt-4">
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Páginas / Abas do Relatório BI disponíveis para este cliente
              </Label>

              {(
                [
                  { id: "visao_geral", num: "01", desc: "Visão consolidada (Competência, Setores, Convênios e Evolução)" },
                  { id: "glosas", num: "02", desc: "Auditoria de Glosas, Pareto de Motivos, Recursos e Itens Glosados" },
                  { id: "setores_producao", num: "03", desc: "Detalhamento por Setor, Grupo de Faturamento e Top Procedimentos" },
                ] as const
              ).map((aba) => {
                const ativa = draft.abasVisiveis.includes(aba.id);
                return (
                  <div
                    key={aba.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <Switch checked={ativa} onCheckedChange={() => toggleAba(aba.id)} />
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Página {aba.num} — {draft.nomesAbas[aba.id]}
                        </p>
                        <p className="text-[11px] text-slate-500">{aba.desc}</p>
                      </div>
                    </div>
                    <Input
                      value={draft.nomesAbas[aba.id]}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          nomesAbas: { ...p.nomesAbas, [aba.id]: e.target.value },
                        }))
                      }
                      className="h-8 w-full sm:w-48 text-xs bg-white"
                      placeholder="Título da aba"
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Blocos da Aba 01 (Visão Geral)
                </Label>
                {(
                  [
                    { key: "competencia", label: "Matriz de Competência" },
                    { key: "setores", label: "Matriz de Setores / Grupo" },
                    { key: "convenios", label: "Matriz de Convênios" },
                    { key: "evolucaoMensal", label: "Gráfico Evolução Mensal" },
                  ] as const
                ).map((b) => (
                  <div key={b.key} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{b.label}</span>
                    <Switch
                      checked={draft.blocosVisaoGeral[b.key]}
                      onCheckedChange={(v) =>
                        setDraft((p) => ({
                          ...p,
                          blocosVisaoGeral: { ...p.blocosVisaoGeral, [b.key]: v },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Filtros no Topo & Formatação Visual
                </Label>
                {(
                  [
                    { id: "setor", label: "Filtro SETOR no cabeçalho" },
                    { id: "competencia", label: "Filtro COMPETÊNCIA no cabeçalho" },
                    { id: "convenio", label: "Filtro CONVÊNIO no cabeçalho" },
                  ] as const
                ).map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{f.label}</span>
                    <Switch
                      checked={draft.filtrosVisiveis.includes(f.id)}
                      onCheckedChange={() => toggleFiltro(f.id)}
                    />
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Barras proporcionais nas células (Data Bars)
                  </span>
                  <Switch
                    checked={draft.mostrarDataBars}
                    onCheckedChange={(v) => setDraft((p) => ({ ...p, mostrarDataBars: v }))}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Rótulo "Produzido" nas colunas do gráfico
                  </span>
                  <Switch
                    checked={draft.mostrarSerieProduzido}
                    onCheckedChange={(v) =>
                      setDraft((p) => ({ ...p, mostrarSerieProduzido: v }))
                    }
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ABA 3: CARTÕES KPI */}
          <TabsContent value="kpis" className="space-y-4 pt-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Ordem dos Cartões Ativos no Topo ({draft.kpisVisiveis.length}/8)
              </Label>
              <div className="space-y-1.5">
                {draft.kpisVisiveis.map((kpiId, idx) => {
                  const meta = BI_KPI_CATALOG.find((k) => k.id === kpiId);
                  if (!meta) return null;
                  return (
                    <div
                      key={kpiId}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900">{meta.label}</span>
                          <span className="ml-2 text-[11px] text-slate-500">
                            {meta.descricao}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moverKpi(idx, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === draft.kpisVisiveis.length - 1}
                          onClick={() => moverKpi(idx, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Catálogo de Indicadores Disponíveis
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BI_KPI_CATALOG.map((item) => {
                  const selecionado = draft.kpisVisiveis.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleKpi(item.id)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                        selecionado
                          ? "border-sky-600 bg-sky-50/70"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          selecionado
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-slate-300",
                        )}
                      >
                        {selecionado && <Check className="h-3 w-3" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.label}</p>
                        <p className="text-[11px] text-slate-500">{item.descricao}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ABA 4: REGRAS DE CÁLCULO & FONTE */}
          <TabsContent value="regras" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <Label className="text-xs font-bold text-slate-800">
                  Fórmula do Indicador % Glosa
                </Label>
                <Select
                  value={draft.formulaPctGlosa}
                  onValueChange={(v: any) =>
                    setDraft((p) => ({ ...p, formulaPctGlosa: v }))
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOBRE_PROCESSADO">
                      Glosa ÷ Processado (Recebido + Glosa) — Padrão Power BI
                    </SelectItem>
                    <SelectItem value="SOBRE_FATURADO">
                      Glosa ÷ Faturado Total (inclui contas em aberto)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <strong>Sobre Processado</strong> evita que competências recentes ainda em
                  aberto ("A Receber") diluam artificialmente a taxa real de glosa.
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <Label className="text-xs font-bold text-slate-800">
                  Agrupamento padrão do Painel "SETORES"
                </Label>
                <Select
                  value={draft.dimensaoPainelSetores}
                  onValueChange={(v: any) =>
                    setDraft((p) => ({ ...p, dimensaoPainelSetores: v }))
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setor">
                      Setor Hospitalar (UTI, Centro Cirúrgico, Pronto Atendimento...)
                    </SelectItem>
                    <SelectItem value="tipo_item">
                      Grupo / Tipo de Item (Procedimentos, Mat/Med, Diárias, Taxas)
                    </SelectItem>
                    <SelectItem value="prestador">
                      Prestador / Profissional Executante
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={draft.tituloPainelSetores || ""}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      tituloPainelSetores: e.target.value || null,
                    }))
                  }
                  placeholder="Título customizado do bloco (ex: SETORES)"
                  className="h-8 text-xs mt-1.5"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <Label className="text-xs font-bold text-slate-800">
                  Critério padrão no Relatório Base XML
                </Label>
                <Select
                  value={draft.criterioPeriodoXmlPadrao}
                  onValueChange={(v: any) =>
                    setDraft((p) => ({ ...p, criterioPeriodoXmlPadrao: v }))
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FATURAMENTO">
                      Competência do Faturamento (Ciclo da Receita)
                    </SelectItem>
                    <SelectItem value="PAGAMENTO">
                      Mês Efetivo do Pagamento (Regime de Caixa)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <Label className="text-xs font-bold text-slate-800">
                  Sub-fonte padrão no Relatório Banco / CSV
                </Label>
                <Select
                  value={draft.subFonteBancoPadrao}
                  onValueChange={(v: any) =>
                    setDraft((p) => ({ ...p, subFonteBancoPadrao: v }))
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">
                      Automático (detecta Snapshot CSV/Warleine ou ERP)
                    </SelectItem>
                    <SelectItem value="WARLEINE">
                      Snapshot Banco / CSV / XLSX (Warleine / Hop)
                    </SelectItem>
                    <SelectItem value="RECEBIMENTO_GERAL">
                      Integração Recebimento Geral (ERP Hospitalar)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-600"
            disabled={resetarMut.isPending || salvarMut.isPending}
            onClick={() => resetarMut.mutate({ estabelecimentoId })}
          >
            {resetarMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-1.5" />
            )}
            Restaurar padrão Safatle
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-slate-900 text-white hover:bg-slate-800"
              disabled={salvarMut.isPending}
              onClick={() =>
                salvarMut.mutate({
                  estabelecimentoId,
                  config: draft,
                })
              }
            >
              {salvarMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Salvar Personalização deste Cliente
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
