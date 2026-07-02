import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useState, useEffect, useCallback } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Sparkles, Loader2, Wand2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  sectionType?: "escopoTecnico" | "servicosOferecidos" | "vantagensCompetitivas" | "condicoesNegocio";
  context?: { titulo?: string; cliente?: string; tipoCliente?: string };
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Digite aqui...",
  label,
  sectionType,
  context,
  minHeight = "120px",
}: RichTextEditorProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const gerarTextoIA = trpc.propostas.gerarTextoIA.useMutation();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2",
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML() && value !== undefined) {
      editor.commands.setContent(value || "");
    }
  }, [value]);

  const handleAI = useCallback(async (action: "gerar" | "melhorar" | "resumir" | "expandir") => {
    if (!editor || !sectionType) return;
    setAiLoading(true);
    setAiMenuOpen(false);
    try {
      const currentContent = editor.getHTML();
      const result = await gerarTextoIA.mutateAsync({
        sectionType,
        action,
        currentContent: currentContent !== "<p></p>" ? currentContent : undefined,
        context: context || {},
      });
      if (result.html) {
        editor.commands.setContent(result.html);
        onChange(result.html);
      }
    } catch (err) {
      console.error("Erro IA:", err);
    } finally {
      setAiLoading(false);
    }
  }, [editor, sectionType, context, gerarTextoIA, onChange]);

  if (!editor) return null;

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="rounded-lg border border-border bg-card overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5 bg-muted/30">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrito"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Itálico"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Sublinhado"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista numerada"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* AI Button */}
          {sectionType && (
            <>
              <div className="ml-auto" />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAiMenuOpen(!aiMenuOpen)}
                  disabled={aiLoading}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                    aiLoading
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-500 cursor-wait"
                      : "bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 text-purple-600 dark:text-purple-400 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/40 dark:hover:to-blue-900/40 border border-purple-200 dark:border-purple-800"
                  )}
                >
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? "Gerando..." : "IA"}
                </button>
                {aiMenuOpen && !aiLoading && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-border bg-card shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
                    <AIMenuItem
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                      label="Gerar conteúdo"
                      description="Criar texto do zero"
                      onClick={() => handleAI("gerar")}
                    />
                    <AIMenuItem
                      icon={<Wand2 className="h-3.5 w-3.5" />}
                      label="Melhorar texto"
                      description="Refinar e profissionalizar"
                      onClick={() => handleAI("melhorar")}
                      disabled={!value || value === "<p></p>"}
                    />
                    <AIMenuItem
                      icon={<List className="h-3.5 w-3.5" />}
                      label="Resumir"
                      description="Tornar mais conciso"
                      onClick={() => handleAI("resumir")}
                      disabled={!value || value === "<p></p>"}
                    />
                    <AIMenuItem
                      icon={<ListOrdered className="h-3.5 w-3.5" />}
                      label="Expandir"
                      description="Adicionar mais detalhes"
                      onClick={() => handleAI("expandir")}
                      disabled={!value || value === "<p></p>"}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Editor Content */}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function AIMenuItem({ icon, label, description, onClick, disabled }: {
  icon: React.ReactNode; label: string; description: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors",
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"
      )}
    >
      <span className="mt-0.5 text-purple-500">{icon}</span>
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
